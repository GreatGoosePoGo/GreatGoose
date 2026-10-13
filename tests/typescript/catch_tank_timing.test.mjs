import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {battle_config, run_simulations} from '../../build/website_api.js';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {buildStrategyPlayback} from '../../build/strategy_playback.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));

// Exact setup from the reported share link. GGP2 flags 4 = Mega Level 2,
// flags 1 = catch tank; encoded level 100 = Pokémon Level 50.
const request = {
  boss: 'DIALGA', boss_fast_move: 'Dragon Breath', boss_charged_move: 'Thunder',
  raid_difficulty: 'Tier 5', random_seed: '5909021423190938031',
  players: [{friendship: 1, zacian_adventure_effect: true, team: [
    {name: 'MEWTWO_MEGA_X', fast_move: 'Counter', charged_move: 'Dynamic Punch+', level: 50, mega_level: 2},
    {name: 'KELDEO_RESOLUTE', fast_move: 'Low Kick', charged_move: 'Secret Sword', level: 50, catch_tank: true},
  ]}],
  player_strategy: 'catch_tank', dodge_strategy: 'smart', weather: 'Cloudy',
  battle_log_mode: 'full', rejoin_time: '7.5:1, 8:2, 8.5:1', battle_time_limit: 300,
};

function makeSimulation(overrides = {}) {
  const engine = createAutomaticRaidEngine(battle_config({...request, ...overrides}, catalog), catalog);
  engine.validate_settings();
  return {engine, sim: engine.createSimulation({detailed: true})};
}

function assertLegalSwitches(sim) {
  const original = sim.record_replay_action.bind(sim);
  let switches = 0;
  let beforeSwitch;
  for (const method of ['start_catch_tank', 'finish_catch_tank', 'switch']) {
    const originalMethod = sim[method].bind(sim);
    sim[method] = (time, id, ...args) => {
      const previous = beforeSwitch;
      const p = sim.players[id];
      beforeSwitch = {onField: p.on_field, hp: p.hp, end: p.action_end, ready: p.next_action_time};
      try { return originalMethod(time, id, ...args); }
      finally { beforeSwitch = previous; }
    };
  }
  sim.record_replay_action = (time, actor, id, kind, ...rest) => {
    if (actor === 'player' && kind === 'switch') {
      assert(beforeSwitch, 'every switch passes through an observed switch method');
      if (beforeSwitch.onField && beforeSwitch.hp > 0) {
        assert(time >= beforeSwitch.end, `P${id + 1} switches at ${time} during a move ending at ${beforeSwitch.end}`);
        assert(time >= beforeSwitch.ready, `P${id + 1} switches during recovery`);
      }
      switches++;
    }
    original(time, actor, id, kind, ...rest);
  };
  return () => switches;
}

test('reported Dialga seed never switches during Dynamic Punch and replays exactly', () => {
  const {sim} = makeSimulation();
  const switches = assertLegalSwitches(sim);
  sim.run();
  assert(switches() > 0);

  const result = run_simulations(request, catalog);
  assert(!result.log.some(line => /^\s*58\.50s.*starts Dynamic Punch/.test(line)));
  assert(result.log.some(line => /^\s*59\.00s.*catch-tank switch/.test(line)));
  assert(result.log.some(line => /^\s*63\.00s.*starts Dynamic Punch\+\+/.test(line)));
  assert(result.log.some(line => /^\s*65\.50s.*lands Dynamic Punch\+\+/.test(line)));
  const playback = buildStrategyPlayback(result.replay_text, catalog);
  assert.equal(playback.result.boss_hp, result.boss_hp);
  assert.equal(playback.result.finish_time, result.finish_time);
  assert.equal(playback.result.won, result.won);
  assert.deepEqual(playback.warnings, []);
});

test('catch planning waits for a current charged move and switching recovery', () => {
  const {sim} = makeSimulation();
  const p = sim.players[0];
  p.action_start = 0;
  p.action_end = 2.5;
  p.action_is_charged = true;
  p.next_action_time = 3;
  assert(sim.schedule_catch_tank(0, 4, 0, sim.boss_charged));
  const event = sim.events.find(e => e[2] === 'catch_tank_swap');
  assert.equal(event[0], 3);
  sim.start_catch_tank(1, 0, 1);
  assert.equal(p.pokemon_index, 0, 'direct calls cannot cancel the animation');
});

test('a catch plan too late to switch in before the hit is declined', () => {
  const {sim} = makeSimulation();
  const p = sim.players[0];
  p.action_end = 3;
  p.next_action_time = 3;
  assert.equal(sim.schedule_catch_tank(0, 3.5, 0, sim.boss_charged), false);
  assert(!sim.events.some(e => e[2] === 'catch_tank_swap'));
  assert.equal(p.used_catch_tanks.size, 0);
});

test('a future catch plan waits instead of starting an overlapping charge', () => {
  const {sim} = makeSimulation();
  const p = sim.players[0];
  p.energy = 100;
  assert(sim.schedule_catch_tank(0, 3, 0, sim.boss_charged));
  sim.start_player_action(0, 0, p.token);
  assert.equal(p.energy, 100, 'charge energy must not be spent on a cancelled move');
  assert.equal(p.action_end, 0);
  assert.equal(p.next_action_time, 2);
  assert(!sim.replay_actions.some(e => e[4] === 'move'));
});

test('a fast move ending at the catch boundary lands before switching', () => {
  const {sim} = makeSimulation();
  const p = sim.players[0];
  p.energy = 0;
  assert(sim.schedule_catch_tank(0, 2, 0, sim.boss_charged));
  sim.start_player_action(0, 0, p.token);
  assert.equal(p.action_end, 1);
  const atBoundary = sim.events.filter(e => e[0] === 1).sort((a, b) => a[1] - b[1]);
  assert.equal(atBoundary[0][2], 'player_hit');
  sim.current_time = 1;
  const hit = atBoundary[0];
  sim.apply_player_hit(...hit[3]);
  assert.equal(p.fast_moves_used, 1);
  const swap = atBoundary.find(e => e[2] === 'catch_tank_swap');
  sim.start_catch_tank(1, ...swap[3]);
  assert.equal(p.pokemon_index, 1);
  assert.equal(p.team[0].energy, 9);
});

test('queued catches cannot survive a faint, replacement or relobby', () => {
  for (const transition of ['replacement', 'rejoin']) {
    const {sim} = makeSimulation();
    const p = sim.players[0];
    assert(sim.schedule_catch_tank(0, 3, 0, sim.boss_charged));
    const event = sim.events.find(e => e[2] === 'catch_tank_swap');
    if (transition === 'replacement') p.generation++;
    else {
      p.on_field = false;
      sim.rejoin(1, 0);
    }
    sim.start_catch_tank(event[0], ...event[3]);
    assert.equal(p.pokemon_index, 0);
    assert.equal(p.catch_tanks_used, 0);
  }
});

test('seeded catch-tank trials never interrupt live moves, including multiplayer', () => {
  for (let seed = 0; seed < 32; seed++) {
    const players = seed % 2 ? [request.players[0], request.players[0]] : request.players;
    const {sim} = makeSimulation({random_seed: String(seed), players});
    assertLegalSwitches(sim);
    sim.run();
  }
});

test('replay validation rejects switches that cancel a live move', () => {
  const preamble = 'Raid: Tier 3\nBoss: STARMIE; fast=Water Gun; charged=Hydro Pump\nTeams:\np1: [[\'MEWTWO\', \'Confusion\', \'Psystrike\', 50], [\'MEWTWO\', \'Confusion\', \'Psystrike\', 50]]\nMove codes: co=Confusion; ps=Psystrike\nEvents:\n';
  assert.throws(() => buildStrategyPlayback(preamble + 't0p1:co\n+0.5p1:s2', catalog), /cannot switch while busy until 1.5s/);
  assert.doesNotThrow(() => buildStrategyPlayback(preamble + 't0p1:co\n+1.5p1:s2', catalog));
  assert.throws(() => buildStrategyPlayback(preamble + 't0p1:co\n+1.5p1:co\n+1.5p1:co\n+1.5p1:co\n+1.5p1:ps\n+0.5p1:s2', catalog), /cannot switch while busy/);
});

test('the built website worker runs the reported setup and opens its corrected replay', async () => {
  const worker = new Worker(new URL('./worker_harness.mjs', import.meta.url));
  try {
    const [ready] = await once(worker, 'message');
    assert(ready.ready);
    let id = 0;
    const call = async (method, payload) => {
      const response = once(worker, 'message');
      worker.postMessage({id: ++id, method, payload});
      const [message] = await response;
      assert.equal(message.id, id);
      assert.equal(message.error, undefined);
      return message.result;
    };
    const result = await call('simulate', request);
    const local = run_simulations(request, catalog);
    assert.equal(result.replay_text, local.replay_text);
    const playback = await call('replay/playback', {text: result.replay_text});
    assert.equal(playback.result.boss_hp, result.boss_hp);
    assert.equal(playback.result.finish_time, result.finish_time);
    assert.deepEqual(playback.warnings, []);
  } finally {
    await worker.terminate();
  }
});
