import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {isPlayerMoveAvailable} from '../../build/move_availability.js';
import {calculateRankings} from '../../build/rankings.js';
import {counterCandidate} from '../../build/raid_counters.js';
import {battle_config, publicCatalog} from '../../build/website_api.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const shadows = new Set(JSON.parse(readFileSync(new URL('../../simulator/shadow_availability.json', import.meta.url))).form_ids);
const legendaries = new Set(JSON.parse(readFileSync(new URL('../../simulator/ranking_categories.json', import.meta.url))).legendary_dex_numbers);

const distributions = [
  ['TORNADUS_INCARNATE', 'BLEAKWIND_STORM', 'flying'],
  ['THUNDURUS_INCARNATE', 'WILDBOLT_STORM', 'electric'],
  ['LANDORUS_INCARNATE', 'SANDSEAR_STORM', 'ground'],
];

test('one-off Incarnate storm moves remain normal-only across every player surface', () => {
  const publicById = new Map(publicCatalog(catalog).map(entry => [entry.form_id, entry]));

  for (const [formId, moveId, attackType] of distributions) {
    const entry = catalog.find(candidate => candidate.form_id === formId);
    const move = entry.exclusive_charged_moves.find(candidate => candidate.id === moveId);
    const fastMove = entry.fast_moves[0];
    assert.equal(move.glitch_legacy, true);
    assert.equal(move.shadow_compatible, false);
    assert.equal(isPlayerMoveAvailable(move), true);
    assert.equal(isPlayerMoveAvailable(move, {shadow: true}), false);
    assert.equal(isPlayerMoveAvailable(move, {excludeLegacy: true}), false);

    const publicEntry = publicById.get(formId);
    assert(publicEntry.charged_moves.includes(move.name));
    assert(!publicEntry.shadow_charged_moves.includes(move.name));

    const request = {
      boss: 'STARMIE', boss_fast_move: 'Hidden Power', boss_charged_move: 'Hydro Pump',
      raid_difficulty: 'Tier 3', random_seed: '1',
      team: [{name: formId, fast_move: fastMove.name, charged_move: move.name, level: 40}],
    };
    assert.doesNotThrow(() => battle_config(request, catalog));
    assert.throws(() => battle_config({...request, team: [{...request.team[0], shadow: true}]}, catalog), /legal moves/);

    const pick = {formId, fastMoveId: fastMove.id, chargedMoveId: move.id, shadow: false};
    assert.equal(counterCandidate(catalog, pick, {includeShadows: true}, shadows, legendaries).shadow, false);
    assert.throws(() => counterCandidate(catalog, {...pick, shadow: true}, {includeShadows: true}, shadows, legendaries), /excluded counter moveset/);
    assert.throws(() => counterCandidate(catalog, pick, {includeShadows: true, excludeLegacy: true}, shadows, legendaries), /excluded counter moveset/);

    const ranking = calculateRankings(
      [entry], {attackType, includeShadows: true, bossAttack: 'low'}, new Set([formId]), legendaries,
    );
    const shadowRow = ranking.rows.find(row => row.shadow);
    assert(shadowRow, `${formId} should still rank with its obtainable charged move`);
    assert.notEqual(shadowRow.chargedMove, move.name);
  }
});

test('future one-off moves can explicitly remain Shadow-compatible', () => {
  const futurePromo = {
    id: 'FUTURE_PROMO', name: 'Future Promo', type: 'normal', power: 1,
    energy: -100, duration_ms: 1000, glitch_legacy: true, shadow_compatible: true,
  };
  assert.equal(isPlayerMoveAvailable(futurePromo, {shadow: true}), true);
  assert.equal(isPlayerMoveAvailable(futurePromo, {excludeLegacy: true}), false);
});
