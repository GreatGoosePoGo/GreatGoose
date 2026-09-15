import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {
  parseRejoinTimeInput,
  meanRejoinTime,
  sampleRejoinTime,
  DEFAULT_RAID_REJOIN_INPUT,
  DEFAULT_COUNTER_REJOIN_INPUT,
} from '../../build/rejoin_time.js';
import {
  BATTLE_TIME_LIMITS,
  defaultBattleTimeForDifficulty,
  parseBattleTimeLimit,
  setAutomaticBattleTimeOverride,
} from '../../build/battle_time.js';

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

test('battle time presets and normal difficulty defaults are fixed', () => {
  assert.deepEqual([...BATTLE_TIME_LIMITS], [27, 72, 147, 180, 222, 300]);
  assert.equal(defaultBattleTimeForDifficulty('Tier 1'), 180);
  assert.equal(defaultBattleTimeForDifficulty('Tier 3 Shadow'), 180);
  assert.equal(defaultBattleTimeForDifficulty('Tier 4'), 300);
  assert.equal(defaultBattleTimeForDifficulty('Tier 5'), 300);
  assert.equal(parseBattleTimeLimit('72'), 72);
  assert.throws(() => parseBattleTimeLimit(75), /one of/);
});

test('configured battle time changes the automatic cutoff and replay timer metadata', () => {
  const engine = createAutomaticRaidEngine(engineConfig({raid_seconds: 27}), catalog);
  assert.equal(engine.RAID_SECONDS, 27);
  const simulation = engine.createSimulation({detailed: true});
  const result = simulation.run();
  assert.equal(result.finish_time, 27);
  assert.equal(result.won, false);
  const replay = engine.render_battle_replay(simulation, result, engine.RANDOM_SEED);
  assert.match(replay, /Raid difficulty: Tier 3; .*timer 27s/);
});

test('counter-style automatic battle time override reaches the shared engine factory', () => {
  setAutomaticBattleTimeOverride(72);
  try {
    const engine = createAutomaticRaidEngine(engineConfig(), catalog);
    assert.equal(engine.RAID_SECONDS, 72);
  } finally {
    setAutomaticBattleTimeOverride(undefined);
  }
});

test('invalid rejoin granularity and nonpositive weights are rejected', () => {
  assert.throws(() => parseRejoinTimeInput('7.25:1'), /0.5-second/);
  assert.throws(() => parseRejoinTimeInput('7.5:0'), /greater than 0/);
});
