import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticRaidEngine, createManualRaidEngine} from '../../build/raid_engine_factory.js';
import {createTurnBattle} from '../../build/turn_battle.js';
import {
  parseRejoinTimeInput,
  meanRejoinTime,
  sampleRejoinTime,
  DEFAULT_RAID_REJOIN_INPUT,
  DEFAULT_COUNTER_REJOIN_INPUT,
} from '../../build/rejoin_time.js';
import {
  BATTLE_TIME_LIMITS,
  battleTimeLimitsForDifficulty,
  defaultBattleTimeForDifficulty,
  parseBattleTimeLimit,
  setAutomaticBattleTimeOverride,
} from '../../build/battle_time.js';
import {PythonRandom} from '../../build/random.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));

function engineConfig(overrides = {}) {
  return {
    trials: 1,
    random_seed: 42,
    raid_difficulty: 'Tier 3',
    boss_form_id: 'STARMIE',
    boss_fast_move_names: ['Water Gun'],
    boss_charged_move_names: ['Hydro Pump'],
    player_teams: [[['MEWTWO', 'Confusion', 'Psystrike', 50, 15, 15, 15, false, 1]]],
    friendship_multipliers: [1],
    zacian_adventure_effect: [false],
    behemoth_bash_adventure_effect: [false],
    dynamic_punch_adventure_effect: [false],
    catch_tank_team_indices: [[]],
    party_power_groups: [],
    weather: null,
    dodge_strategy: 'none',
    player_strategy: 'no_strategy',
    use_purified_gems: false,
    battle_log_mode: 'none',
    ...overrides,
  };
}

test('raid default uses relative weights and has an 8.6 second mean', () => {
  const distribution = parseRejoinTimeInput(DEFAULT_RAID_REJOIN_INPUT);
  assert.deepEqual(distribution, [[7.5, 1], [8, 2], [8.5, 1], [11, 1]]);
  assert.equal(meanRejoinTime(distribution), 8.6);
});

test('counter default is a fixed 7.5 second rejoin', () => {
  assert.deepEqual(parseRejoinTimeInput(DEFAULT_COUNTER_REJOIN_INPUT), [[7.5, 1]]);
});

test('comma-separated times use equal weights', () => {
  assert.deepEqual(
    parseRejoinTimeInput('7.5, 8, 8.5'),
    [[7.5, 1], [8, 1], [8.5, 1]],
  );
  assert.equal(meanRejoinTime(parseRejoinTimeInput('7.5, 8, 8.5')), 8);
});

test('weights do not need to sum to one and braces are accepted', () => {
  assert.deepEqual(
    parseRejoinTimeInput('{7.0: 25, 7.5: 50, 8.0: 25}'),
    [[7, 25], [7.5, 50], [8, 25]],
  );
});

test('weighted and unweighted syntax cannot be mixed', () => {
  assert.throws(
    () => parseRejoinTimeInput('7.5:1, 8'),
    /do not mix/i,
  );
});

test('sampling uses relative cumulative weights', () => {
  const distribution = parseRejoinTimeInput('7.5:1, 8:2, 8.5:1, 11:1');
  const values = [0.00, 0.20, 0.59, 0.60, 0.79, 0.80, 0.999].map(value =>
    sampleRejoinTime({random: () => value}, distribution));
  assert.deepEqual(values, [7.5, 8, 8, 8.5, 8.5, 11, 11]);
});

test('configured rejoin time changes the automatic raid scheduler', () => {
  const engine = createAutomaticRaidEngine(engineConfig({rejoin_time_distribution: [[11, 1]]}), catalog);
  const simulation = engine.createSimulation();
  const player = simulation.players[0];
  player.team[0].hp = 0;
  simulation.switch(5, 0, false);
  const rejoin = simulation.events.find(event => event[2] === 'rejoin');
  assert.ok(rejoin, 'a rejoin event should be scheduled');
  assert.equal(rejoin[0], 16);
});

test('180 second raids omit 222 and 300 second challenge limits', () => {
  assert.deepEqual([...BATTLE_TIME_LIMITS], [27, 72, 147, 180, 222, 300]);
  assert.deepEqual([...battleTimeLimitsForDifficulty('Tier 3')], [27, 72, 147, 180]);
  assert.deepEqual([...battleTimeLimitsForDifficulty('Tier 5')], [27, 72, 147, 180, 222, 300]);
  assert.equal(defaultBattleTimeForDifficulty('Tier 3 Shadow'), 180);
  assert.equal(defaultBattleTimeForDifficulty('Tier 5'), 300);
  assert.equal(parseBattleTimeLimit('72', 'Tier 3'), 72);
  assert.throws(() => parseBattleTimeLimit(222, 'Tier 3'), /27, 72, 147, 180/);
  assert.equal(parseBattleTimeLimit(222, 'Tier 5'), 222);
});

test('72 second challenge on a 300 second raid ends with 228 seconds on the real clock', () => {
  const engine = createAutomaticRaidEngine(engineConfig({
    raid_difficulty: 'Tier 5',
    raid_seconds: 300,
    battle_time_limit: 72,
  }), catalog);
  assert.equal(engine.RAID_SECONDS, 300);
  assert.equal(engine.BATTLE_TIME_LIMIT, 72);
  const simulation = engine.createSimulation({detailed: true});
  const result = simulation.run();
  assert.equal(result.finish_time, 72);
  assert.equal(result.won, false);
  assert.equal(engine.RAID_SECONDS - result.finish_time, 228);
  const replay = engine.render_battle_replay(simulation, result, engine.RANDOM_SEED);
  assert.match(replay, /Raid difficulty: Tier 5; .*timer 300s/);
});

test('counter-style cutoff override preserves the raid timer', () => {
  setAutomaticBattleTimeOverride(72);
  try {
    const engine = createAutomaticRaidEngine(engineConfig({raid_seconds: 180}), catalog);
    assert.equal(engine.RAID_SECONDS, 180);
    assert.equal(engine.BATTLE_TIME_LIMIT, 72);
  } finally {
    setAutomaticBattleTimeOverride(undefined);
  }
});

test('turn-by-turn shows the real clock while stopping at the elapsed challenge limit', () => {
  const engine = createManualRaidEngine(engineConfig({
    raid_difficulty: 'Tier 5',
    raid_seconds: 300,
    battle_time_limit: 72,
    battle_log_mode: 'full',
  }), catalog);
  const ManualSimulation = createTurnBattle(engine).ManualSimulation;
  const sim = new ManualSimulation(
    Object.values(engine.BOSS_FAST_MOVES)[0],
    Object.values(engine.BOSS_CHARGED_MOVES)[0],
    new PythonRandom(engine.RANDOM_SEED),
  );
  assert.equal(sim.snapshot().remaining, 300);
  while (!sim.finished) sim.advance('wait', null, false);
  const snapshot = sim.snapshot();
  assert.equal(snapshot.elapsed, 72);
  assert.equal(snapshot.remaining, 228);
  assert.equal(snapshot.status, 'time_expired');
  assert.equal(snapshot.raid_timer, 300);
  assert.equal(snapshot.battle_time_limit, 72);
});

test('invalid rejoin granularity and nonpositive weights are rejected', () => {
  assert.throws(() => parseRejoinTimeInput('7.25:1'), /0.5-second/);
  assert.throws(() => parseRejoinTimeInput('7.5:0'), /greater than 0/);
});
