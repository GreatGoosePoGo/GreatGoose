import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {
  DISCHARGE_PLUS,
  DISCHARGE_PLUS_POWERS,
  OMINOUS_WIND_PLUS_POWERS,
  withCurrentCatalogOverrides,
} from '../../build/catalog_overrides.js';
import {calculateRankings, RELEASED_MEGA_PLUS_FORM_IDS} from '../../build/rankings.js';
import {battle_config, publicCatalog, run_simulations} from '../../build/website_api.js';
import {buildStrategyPlayback} from '../../build/strategy_playback.js';
import {counterCandidate} from '../../build/raid_counters.js';

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

test('Mega Chandelure is available without mutating or duplicating the pinned catalog', () => {
  const before = JSON.stringify(rawCatalog);
  const current = withCurrentCatalogOverrides(rawCatalog);
  const twice = withCurrentCatalogOverrides(current);
  assert.equal(JSON.stringify(rawCatalog), before);
  assert.equal(twice.filter(entry => entry.form_id === 'CHANDELURE_MEGA').length, 1);
  const mega = twice.find(entry => entry.form_id === 'CHANDELURE_MEGA');
  assert.equal(mega.released, true);
  assert.equal(mega.name, 'Mega Chandelure');
  assert.deepEqual(mega.types, ['ghost', 'fire']);
  assert.deepEqual(mega.stats, {attack: 335, defense: 227, stamina: 155});
  assert.deepEqual(mega.fast_moves, rawCatalog.find(e => e.form_id === 'CHANDELURE').fast_moves);
  assert.deepEqual(mega.charged_moves, rawCatalog.find(e => e.form_id === 'CHANDELURE').charged_moves);
  assert.equal(mega.mega_charged_moves.filter(m => m.name === 'Ominous Wind+').length, 1);
  const publicMega = publicCatalog(rawCatalog).find(e => e.form_id === 'CHANDELURE_MEGA');
  assert(publicMega.charged_moves.includes('Ominous Wind+'));
  assert(!publicMega.boss_charged_moves.includes('Ominous Wind+'));
});

test('Ominous Wind+ uses the requested energy, duration and power at every Mega Level', () => {
  assert.deepEqual(OMINOUS_WIND_PLUS_POWERS, [145, 160, 174, 188]);
  for (let level = 1; level <= 4; level++) {
    const engine = createAutomaticRaidEngine(
      battle_config(requestFor('CHANDELURE_MEGA', 'Ominous Wind+', level), rawCatalog), rawCatalog);
    engine.validate_settings();
    const p = engine.createSimulation().players[0].pokemon;
    assert.equal(p.species.name, 'Mega Chandelure');
    assert.equal(p.species.attack, 335);
    assert.equal(p.charged_move.power, 145);
    assert.equal(p.charged_move.energy, 100);
    assert.equal(p.charged_move.duration, 2.5);
    assert.equal(p.charged_move.move_type, 'Ghost');
    assert.equal(engine.effective_player_move_power(p.charged_move, p), OMINOUS_WIND_PLUS_POWERS[level - 1]);
    assert.equal(engine.displayed_player_move_name(p.charged_move, p), `Ominous Wind${'+'.repeat(level)}`);
  }
});

test('Mega Chandelure battles and generated replays agree', () => {
  const result = run_simulations(requestFor('CHANDELURE_MEGA', 'Ominous Wind+'), rawCatalog);
  assert(result.replay_text.includes('Ominous Wind++++'));
  const playback = buildStrategyPlayback(result.replay_text, rawCatalog);
  assert.equal(playback.result.boss_hp, result.boss_hp);
  assert.equal(playback.result.finish_time, result.finish_time);
  assert.deepEqual(playback.warnings, []);
});

test('ordinary Chandelure cannot use the Mega-exclusive Ominous Wind+', () => {
  const request = requestFor('CHANDELURE_MEGA', 'Ominous Wind+');
  const config = battle_config(request, rawCatalog);
  config.player_teams[0][0][0] = 'CHANDELURE';
  assert.throws(() => createAutomaticRaidEngine(config, rawCatalog).validate_settings(), /only be used by Mega Chandelure/);
  request.players[0].team[0].name = 'CHANDELURE';
  assert.throws(() => battle_config(request, rawCatalog), /legal moves/);
});

test('rankings and raid counters accept Mega Chandelure with Ominous Wind+', () => {
  const mega = catalog.find(e => e.form_id === 'CHANDELURE_MEGA');
  const result = calculateRankings([mega], {attackType: 'ghost', megaLevel: 4});
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].formId, 'CHANDELURE_MEGA');
  assert.equal(result.rows[0].mega, true);
  assert(result.rows[0].simpleDps > 0);
  assert.equal(calculateRankings([mega], {attackType: 'ghost', includeMegas: false}).rows.length, 0);
  const candidate = counterCandidate(catalog,
    {formId: 'CHANDELURE_MEGA', fastMoveId: 'HEX_FAST', chargedMoveId: 'OMINOUS_WIND_PLUS', shadow: false},
    {bossFormId: 'STARMIE', raidDifficulty: 'Tier 3', includeMegas: true}, new Set(), new Set());
  assert.equal(candidate.entry.name, 'Mega Chandelure');
  assert.equal(candidate.chargedMove.name, 'Ominous Wind+');
});
