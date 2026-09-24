import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {
  DISCHARGE_PLUS,
  DISCHARGE_PLUS_POWERS,
  withCurrentCatalogOverrides,
} from '../../build/catalog_overrides.js';
import {RELEASED_MEGA_PLUS_FORM_IDS} from '../../build/rankings.js';
import {battle_config} from '../../build/website_api.js';

const rawCatalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const catalog = withCurrentCatalogOverrides(rawCatalog);

function requestFor(formId, chargedMove, megaLevel = 4) {
  const entry = catalog.find(candidate => candidate.form_id === formId);
  assert.ok(entry, `Missing ${formId}`);
  const fastMove = entry.fast_moves.find(move => move.energy > 0) ?? entry.fast_moves[0];
  assert.ok(fastMove, `${entry.name} needs a fast move`);
  return {
    boss: 'STARMIE', boss_fast_move: 'Water Gun', boss_charged_move: 'Hydro Pump',
    raid_difficulty: 'Tier 3', random_seed: '42',
    players: [{team: [{name: formId, fast_move: fastMove.name, charged_move: chargedMove,
      level: 50, mega_level: megaLevel}]}],
  };
}

test('every released catalog Mega + move is accepted by the raid engine', () => {
  for (const formId of RELEASED_MEGA_PLUS_FORM_IDS) {
    const entry = catalog.find(candidate => candidate.form_id === formId);
    assert.ok(entry, `Missing released Mega + form ${formId}`);
    assert.ok(entry.mega_charged_moves?.length, `${entry.name} has no Mega + move`);
    for (const move of entry.mega_charged_moves) {
      const config = battle_config(requestFor(formId, move.name), rawCatalog);
      const engine = createAutomaticRaidEngine(config, rawCatalog);
      assert.doesNotThrow(() => engine.validate_settings(), `${entry.name} cannot use ${move.name}`);
      const pokemon = engine.createSimulation().players[0].pokemon;
      assert.equal(pokemon.charged_move.name, move.name);
      assert.equal(engine.effective_player_move_power(pokemon.charged_move, pokemon), move.plus_powers[3]);
      assert.equal(engine.displayed_player_move_name(pokemon.charged_move, pokemon),
        `${move.name.replace(/\++$/, '')}++++`);
    }
  }
});

test('Fell Stinger+ travels from the public team request into an executable battle', () => {
  const config = battle_config(requestFor('BEEDRILL_MEGA', 'Fell Stinger+'), rawCatalog);
  const engine = createAutomaticRaidEngine(config, rawCatalog);
  engine.validate_settings();
  const result = engine.createSimulation().run();
  assert.equal(typeof result.won, 'boolean');
});

test('Mega Manectric exposes announced Discharge+ values and level scaling', () => {
  const manectric = catalog.find(entry => entry.form_id === 'MANECTRIC_MEGA');
  assert.ok(manectric);
  const move = manectric.mega_charged_moves?.find(candidate => candidate.name === 'Discharge+');
  assert.ok(move);
  assert.equal(move.power, 150);
  assert.equal(move.energy, -100);
  assert.equal(move.duration_ms, 2500);
  assert.equal(move.type, 'electric');
  assert.deepEqual(move.plus_powers, [150, 165, 180, 195]);
  assert.deepEqual(DISCHARGE_PLUS_POWERS, [150, 165, 180, 195]);
  assert.equal(DISCHARGE_PLUS.name, 'Discharge+');
  assert(RELEASED_MEGA_PLUS_FORM_IDS.has('MANECTRIC_MEGA'));
});

test('Discharge+ remains exclusive to Mega Manectric', () => {
  const config = battle_config(requestFor('MANECTRIC_MEGA', 'Discharge+'), rawCatalog);
  config.player_teams[0][0][0] = 'MANECTRIC';
  const engine = createAutomaticRaidEngine(config, rawCatalog);
  assert.throws(() => engine.validate_settings(), /Discharge\+ can only be used by Mega Manectric/);
});
