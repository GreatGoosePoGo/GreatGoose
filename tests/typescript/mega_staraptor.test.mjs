import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {RELEASED_MEGA_PLUS_FORM_IDS} from '../../build/rankings.js';
import {counterCandidate} from '../../build/raid_counters.js';
import {
  BRAVE_BIRD_PLUS,
  BRAVE_BIRD_PLUS_POWERS,
  withCurrentCatalogOverrides,
} from '../../build/catalog_overrides.js';

const rawCatalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const catalog = withCurrentCatalogOverrides(rawCatalog);

function raidConfig(team) {
  return {
    trials: 1,
    random_seed: 42,
    raid_difficulty: 'Tier 3',
    boss_form_id: 'STARMIE',
    boss_fast_move_names: ['Water Gun'],
    boss_charged_move_names: ['Hydro Pump'],
    player_teams: [team],
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
  };
}

test('Mega Staraptor override exposes its current form and Brave Bird+', () => {
  const mega = catalog.find(entry => entry.form_id === 'STARAPTOR_MEGA');
  assert.ok(mega, 'Mega Staraptor should be present');
  assert.equal(mega.name, 'Mega Staraptor');
  assert.equal(mega.released, true);
  assert.deepEqual(mega.types, ['fighting', 'flying']);
  assert.deepEqual(mega.stats, {attack: 278, defense: 207, stamina: 198});

  const move = mega.mega_charged_moves?.find(move => move.name === 'Brave Bird+');
  assert.ok(move, 'Mega Staraptor should have Brave Bird+');
  assert.equal(move.power, 150);
  assert.equal(move.energy, -100);
  assert.equal(move.duration_ms, 2000);
  assert.equal(move.type, 'flying');
  assert.deepEqual(move.plus_powers, [150, 165, 180, 195]);
  assert.deepEqual(BRAVE_BIRD_PLUS_POWERS, [150, 165, 180, 195]);
  assert.equal(BRAVE_BIRD_PLUS.name, 'Brave Bird+');
  assert.equal(RELEASED_MEGA_PLUS_FORM_IDS.has('STARAPTOR_MEGA'), true);
});

test('raid engine scales Brave Bird+ with Mega Level and renders plus signs', () => {
  const mega = catalog.find(entry => entry.form_id === 'STARAPTOR_MEGA');
  assert.ok(mega);
  const fastMove = mega.fast_moves.find(move => move.energy > 0) ?? mega.fast_moves[0];
  assert.ok(fastMove, 'Mega Staraptor needs an ordinary fast move');

  const engine = createAutomaticRaidEngine(raidConfig([
    ['STARAPTOR_MEGA', fastMove.name, 'Brave Bird+', 50, 15, 15, 15, false, 4],
  ]), rawCatalog);
  engine.validate_settings();
  const simulation = engine.createSimulation();
  const pokemon = simulation.players[0].pokemon;

  assert.equal(pokemon.species.name, 'Mega Staraptor');
  assert.equal(pokemon.charged_move.name, 'Brave Bird+');
  assert.equal(engine.effective_player_move_power(pokemon.charged_move, pokemon), 195);
  assert.equal(engine.displayed_player_move_name(pokemon.charged_move, pokemon), 'Brave Bird++++');
});

test('counter candidate accepts Mega Staraptor with Brave Bird+', () => {
  const mega = catalog.find(entry => entry.form_id === 'STARAPTOR_MEGA');
  assert.ok(mega);
  const fastMove = mega.fast_moves.find(move => move.energy > 0) ?? mega.fast_moves[0];
  assert.ok(fastMove);
  const candidate = counterCandidate(
    catalog,
    {formId: 'STARAPTOR_MEGA', fastMoveId: fastMove.id, chargedMoveId: 'BRAVE_BIRD_PLUS', shadow: false},
    {bossFormId: 'STARMIE', raidDifficulty: 'Tier 3', includeMegas: true, includeShadows: false, includeLegendaries: true},
    new Set(),
    new Set(),
  );
  assert.equal(candidate.entry.name, 'Mega Staraptor');
  assert.equal(candidate.chargedMove.name, 'Brave Bird+');
});

test('Brave Bird+ is rejected on ordinary Staraptor', () => {
  const base = catalog.find(entry => entry.form_id === 'STARAPTOR');
  assert.ok(base);
  const fastMove = base.fast_moves.find(move => move.energy > 0) ?? base.fast_moves[0];
  assert.ok(fastMove);

  const engine = createAutomaticRaidEngine(raidConfig([
    ['STARAPTOR', fastMove.name, 'Brave Bird+', 50, 15, 15, 15, false, 1],
  ]), rawCatalog);
  assert.throws(() => engine.validate_settings(), /only be used by Mega Staraptor/i);
});
