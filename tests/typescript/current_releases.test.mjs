import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {publicCatalog, battle_config, run_simulations} from '../../build/website_api.js';
import {withCurrentCatalogOverrides} from '../../build/catalog_overrides.js';
import {createAutomaticRaidEngine} from '../../build/raid_engine_factory.js';
import {buildStrategyPlayback} from '../../build/strategy_playback.js';
import {calculateRankings} from '../../build/rankings.js';
import {counterCandidate} from '../../build/raid_counters.js';

const raw = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const catalog = withCurrentCatalogOverrides(raw);
const availability = JSON.parse(readFileSync(new URL('../../simulator/shadow_availability.json', import.meta.url)));
const shadows = new Set(availability.form_ids);
const legendaries = new Set([643, 644]);
const request = {
  boss: 'STARMIE', boss_fast_move: 'Water Gun', boss_charged_move: 'Hydro Pump',
  raid_difficulty: 'Tier 3', random_seed: '42',
  team: [{name: 'CLEFABLE_MEGA', fast_move: 'Fairy Wind', charged_move: 'Moonblast+', level: 50}],
};

test('Mega Clefable exposes its own stats and exclusive plus move without duplicate forms', () => {
  const mega = catalog.find(e => e.form_id === 'CLEFABLE_MEGA');
  assert.equal(mega.name, 'Mega Clefable');
  assert.equal(mega.released, true);
  assert.deepEqual(mega.stats, {attack: 253, defense: 205, stamina: 216});
  assert.deepEqual(mega.types, ['fairy']);
  assert.equal(withCurrentCatalogOverrides(catalog).filter(e => e.form_id === 'CLEFABLE_MEGA').length, 1);
  assert(!raw.some(e => e.form_id === 'CLEFABLE_MEGA'), 'overrides preserve the pinned export');
  const publicMega = publicCatalog(raw).find(e => e.form_id === 'CLEFABLE_MEGA');
  assert(publicMega.charged_moves.includes('Moonblast+'));
  assert(!publicMega.boss_charged_moves.includes('Moonblast+'));
  const config = battle_config(request, raw);
  config.player_teams[0][0][0] = 'CLEFABLE';
  assert.throws(() => createAutomaticRaidEngine(config, raw).validate_settings(), /only be used by Mega Clefable/);
});

test('Moonblast+ scales at all Mega Levels and generated battles replay exactly', () => {
  for (const [i, power] of [160, 176, 192, 208].entries()) {
    const setup = {...request, team: [{...request.team[0], mega_level: i + 1}]};
    const engine = createAutomaticRaidEngine(battle_config(setup, raw), raw);
    engine.validate_settings();
    const sim = engine.createSimulation();
    const p = sim.players[0];
    const move = p.pokemon.charged_move;
    assert.equal(p.species.attack, 253);
    assert.equal(move.power, 160);
    assert.equal(move.energy, 100);
    assert.equal(move.duration, 4);
    assert.equal(move.move_type, 'Fairy');
    assert.equal(engine.effective_player_move_power(move, p.pokemon), power);
    p.energy = 100;
    sim.start_player_action(0, 0, p.token);
    assert.equal(p.energy, 0);
    assert.equal(p.action_end, 4);
    const result = run_simulations(setup, raw);
    assert(result.replay_text.includes(`Moonblast${'+'.repeat(i + 1)}`));
    const playback = buildStrategyPlayback(result.replay_text, raw);
    assert.equal(playback.result.boss_hp, result.boss_hp);
    assert.deepEqual(playback.warnings, []);
  }
});

test('both legendary Shadows are eligible for rankings and counter selection', () => {
  assert.equal(shadows.size, availability.mapped_form_ids);
  for (const [formId, attackType, fast, charged] of [
    ['RESHIRAM', 'fire', 'FIRE_FANG_FAST', 'FUSION_FLARE'],
    ['ZEKROM', 'electric', 'CHARGE_BEAM_FAST', 'FUSION_BOLT'],
  ]) {
    assert(shadows.has(formId));
    const entry = catalog.find(e => e.form_id === formId);
    const rows = calculateRankings([entry], {attackType, includeShadows: true}, shadows, legendaries).rows;
    assert.equal(rows.length, 2);
    assert(rows.find(e => e.shadow).simpleDps > rows.find(e => !e.shadow).simpleDps);
    const candidate = counterCandidate(catalog,
      {formId, fastMoveId: fast, chargedMoveId: charged, shadow: true},
      {bossFormId: 'STARMIE', raidDifficulty: 'Tier 3', includeShadows: true, includeLegendaries: true},
      shadows, legendaries);
    assert.equal(candidate.shadow, true);
    assert.equal(candidate.entry.form_id, formId);
    const moves = publicCatalog(raw).find(e => e.form_id === formId);
    const result = run_simulations({...request, team: [{name: formId, level: 50, shadow: true,
      fast_move: moves.fast_moves[0], charged_move: moves.charged_moves[0]}]}, raw);
    assert.equal(buildStrategyPlayback(result.replay_text, raw).result.boss_hp, result.boss_hp);
  }
  assert(!shadows.has('KYUREM_BLACK'));
  assert(!shadows.has('KYUREM_WHITE'));
});

test('Mega Clefable appears in fairy rankings and Moonblast+ is accepted by counters', () => {
  const entry = catalog.find(e => e.form_id === 'CLEFABLE_MEGA');
  const rows = calculateRankings([entry], {attackType: 'fairy', megaLevel: 4}).rows;
  assert.equal(rows.length, 1);
  assert.equal(rows[0].mega, true);
  assert(rows[0].simpleDps > 0);
  assert.equal(calculateRankings([entry], {attackType: 'fairy', includeMegas: false}).rows.length, 0);
  const candidate = counterCandidate(catalog,
    {formId: entry.form_id, fastMoveId: 'FAIRY_WIND_FAST', chargedMoveId: 'MOONBLAST_PLUS', shadow: false},
    {bossFormId: 'STARMIE', raidDifficulty: 'Tier 3', includeMegas: true}, shadows, legendaries);
  assert.equal(candidate.chargedMove.name, 'Moonblast+');
});

test('built rankings worker exposes the added Mega and both released legendary Shadows', async () => {
  const worker = new Worker(new URL('./rankings_worker_harness.mjs', import.meta.url));
  try {
    const [ready] = await once(worker, 'message');
    assert(ready.ready);
    for (const [id, attackType, formId, shadow] of [
      [1, 'fairy', 'CLEFABLE_MEGA', false],
      [2, 'electric', 'ZEKROM', true],
      [3, 'fire', 'RESHIRAM', true],
    ]) {
      const response = once(worker, 'message');
      worker.postMessage({id, attackType, includeShadows: true, includeMegas: true, includeLegendaries: true, megaLevel: 4});
      const [message] = await response;
      assert.equal(message.error, undefined);
      assert(message.result.rows.some(row => row.formId === formId && row.shadow === shadow));
    }
  } finally {
    await worker.terminate();
  }
});
