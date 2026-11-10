import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import {calculateRankings, calculatePokemonMovesets} from '../../build/rankings.js';

const fast = {id: 'FAST', name: 'Fast', type: 'fire', power: 10, energy: 10, duration_ms: 1000};
const charged = {id: 'CHARGED', name: 'Charged', type: 'fire', power: 100, energy: -50, duration_ms: 2000};
const entry = {
  form_id: 'TEST', name: 'Test', dex_number: 1, released: true, types: ['fire'],
  stats: {attack: 200, defense: 200, stamina: 200},
  fast_moves: [fast, {...fast, id: 'ELITE_FAST', name: 'Elite Fast', elite: true}],
  charged_moves: [charged, {...charged, id: 'WATER', name: 'Water', type: 'water'},
    {...charged, id: 'ELITE_CHARGED', name: 'Elite Charged', elite: true}],
};
const selection = {formId: 'TEST', shadow: false};
const shadows = new Set(['TEST']);

test('details enumerate all move combinations and reproduce ranked DPS under the same settings', () => {
  for (const mode of ['attack', 'anti']) {
    for (const shadow of [false, true]) {
      const settings = {attackType: 'fire', mode, includeShadows: true, level: 50,
        partyPowerPlayers: 4, partySize: 3, relobbySeconds: 6.5, bossAttack: 'high', bossMoveType: 'water'};
      const result = calculatePokemonMovesets([entry], settings, {...selection, shadow}, shadows);
      assert.equal(result.rows.length, 6);
      assert.equal(result.candidateMovesets, 6);
      assert(result.rows.every(row => row.formId === 'TEST' && row.shadow === shadow));
      assert(result.rows.some(row => row.chargedMoveType === 'water'));
      const best = calculateRankings([entry], settings, shadows).rows.find(row => row.shadow === shadow);
      const detailed = result.rows.find(row => row.fastMove === best.fastMove && row.chargedMove === best.chargedMove);
      const {belowCutoff, ...rankedFields} = detailed;
      assert.equal(belowCutoff, false);
      assert.deepEqual(rankedFields, best);
    }
  }
});

test('off-type charged moves retain the selected attack-type damage bonuses', () => {
  const result = calculatePokemonMovesets([entry], {attackType: 'fire'}, selection);
  const row = result.rows.find(row => row.fastMove === 'Fast' && row.chargedMove === 'Water');
  const attack = (200 + 15) * 0.79030001;
  const expected = result.assumptions.targetDefenses.reduce((total, defense) => {
    const fastDamage = Math.floor(0.5 * 10 * attack / defense * 1.2 * 1.6) + 1;
    const chargedDamage = Math.floor(0.5 * 100 * attack / defense) + 1;
    return total + (5 * fastDamage + chargedDamage) / 7;
  }, 0) / result.assumptions.targetDefenses.length;
  assert(Math.abs(row.simpleDps - expected) < 1e-9);
});

test('details honor legacy exclusion, Shadow compatibility and exclusive move pools', () => {
  const candidate = {...entry,
    exclusive_fast_moves: [{...fast, id: 'SPECIAL_FAST', name: 'Special Fast'}],
    exclusive_charged_moves: [{...charged, id: 'PROMO', name: 'Promo', glitch_legacy: true, shadow_compatible: false}],
  };
  const settings = {attackType: 'fire', splitLegacy: true};
  const regular = calculatePokemonMovesets([candidate], settings, selection);
  assert.equal(regular.rows.length, 12);
  assert(regular.rows.some(row => row.chargedMove === 'Promo' && row.eliteCharged));
  const shadow = calculatePokemonMovesets([candidate], settings, {...selection, shadow: true}, shadows);
  assert.equal(shadow.rows.length, 9);
  assert(shadow.rows.every(row => row.chargedMove !== 'Promo'));
  const excluded = calculatePokemonMovesets([candidate], {...settings, excludeLegacy: true}, selection);
  assert.equal(excluded.rows.length, 4);
  assert(excluded.rows.every(row => !row.eliteFast && !row.eliteCharged));
});

test('details retain movesets below the ranking cutoff with finite metrics', () => {
  const fragile = {...entry, stats: {attack: 100, defense: 1, stamina: 1},
    fast_moves: [{...fast, power: 1, energy: 1, duration_ms: 5000}],
    charged_moves: [{...charged, energy: -100, duration_ms: 5000}],
  };
  assert.equal(calculateRankings([fragile], {attackType: 'fire'}).rows.length, 0);
  const result = calculatePokemonMovesets([fragile], {attackType: 'fire'}, selection);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].belowCutoff, true);
  for (const metric of ['idealDps', 'simpleDps', 'effectiveDps']) assert(Number.isFinite(result.rows[0][metric]));
});

test('details enumerate all sixteen legal Hidden Power types using each type for damage', () => {
  const hiddenPower = {...entry,
    fast_moves: [{...fast, id: 'HIDDEN_POWER_FAST', name: 'Hidden Power', type: 'normal'}], charged_moves: [charged],
  };
  for (const mode of ['attack', 'anti']) {
    const settings = {attackType: 'fire', mode};
    const rows = calculatePokemonMovesets([hiddenPower], settings, selection).rows;
    assert.equal(rows.length, 16);
    assert.equal(new Set(rows.map(row => row.fastMoveType)).size, 16);
    assert(rows.every(row => !['normal', 'fairy'].includes(row.fastMoveType)));
    for (const row of rows) {
      const candidate = {...hiddenPower, fast_moves: [{...fast, id: 'EXPLICIT', type: row.fastMoveType}]};
      const [expected] = calculateRankings([candidate], settings).rows;
      for (const metric of ['idealDps', 'simpleDps', 'effectiveDps']) assert.equal(row[metric], expected[metric]);
    }
  }
});

test('details reject unknown, unreleased and unavailable Shadow forms', () => {
  assert.throws(() => calculatePokemonMovesets([entry], {attackType: 'fire'}, {formId: 'MISSING'}), /unavailable/);
  assert.throws(() => calculatePokemonMovesets([{...entry, released: false}], {attackType: 'fire'}, selection), /unavailable/);
  assert.throws(() => calculatePokemonMovesets([entry], {attackType: 'fire'}, {...selection, shadow: true}), /Shadow form is unavailable/);
});

test('deployed worker returns every moveset for the selected form and variant using current settings', async () => {
  const worker = new Worker(new URL('./rankings_worker_harness.mjs', import.meta.url));
  try {
    await once(worker, 'message');
    const settings = {attackType: 'fire', mode: 'anti', level: 50, partyPowerPlayers: 4,
      partySize: 3, relobbySeconds: 6.5, bossAttack: 'high', bossMoveType: 'dragon', megaLevel: 4};
    let response = once(worker, 'message');
    worker.postMessage({id: 1, kind: 'movesets', formId: 'CHARIZARD', shadow: true, ...settings});
    const [{result, error}] = await response;
    assert.equal(error, undefined);
    for (const [key, value] of Object.entries(settings)) assert.equal(result[key], value, key);
    assert(result.rows.length > 4);
    assert(result.rows.every(row => row.formId === 'CHARIZARD' && row.shadow));
    assert(new Set(result.rows.map(row => row.chargedMoveType)).size > 1);
    response = once(worker, 'message');
    worker.postMessage({id: 2, kind: 'movesets', formId: 'CHARIZARD_MEGA_X', ...settings, excludeLegacy: true});
    const [mega] = await response;
    assert.equal(mega.error, undefined);
    assert(mega.result.rows.every(row => row.mega && !row.shadow && !row.eliteFast && !row.eliteCharged));
    response = once(worker, 'message');
    worker.postMessage({id: 3, kind: 'movesets', formId: 'MISSING', ...settings});
    const [invalid] = await response;
    assert.match(invalid.error, /unavailable/);
  } finally {
    await worker.terminate();
  }
});
