import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {
  calculateRankings,
  RANKING_TYPES,
  RELEASED_MEGA_PLUS_FORM_IDS,
} from '../../build/rankings.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const shadowAvailability = JSON.parse(readFileSync(new URL('../../simulator/shadow_availability.json', import.meta.url)));
const shadowFormIds = new Set(shadowAvailability.form_ids);
const rankingCategories = JSON.parse(readFileSync(new URL('../../simulator/ranking_categories.json', import.meta.url)));
const legendaryDexNumbers = new Set(rankingCategories.legendary_dex_numbers);

test('Twilight Trails raid stats and move availability are current', () => {
  const entries = new Map(catalog.map(entry => [entry.form_id, entry]));
  const moves = formId => [
    ...entries.get(formId).fast_moves,
    ...entries.get(formId).charged_moves,
  ];

  for (const formId of ['DEOXYS', 'DEOXYS_ATTACK', 'DEOXYS_DEFENSE', 'DEOXYS_SPEED']) {
    const psychoBoost = entries.get(formId).charged_moves.find(move => move.id === 'PSYCHO_BOOST');
    assert.deepEqual(
      {power: psychoBoost.power, energy: psychoBoost.energy, duration_ms: psychoBoost.duration_ms},
      {power: 130, energy: -33, duration_ms: 4000},
    );
  }

  const additions = {
    VOLBEAT: ['INFESTATION_FAST', 'LUNGE'], ILLUMISE: ['INFESTATION_FAST', 'SHADOW_BALL'],
    ARBOK: ['BRUTAL_SWING', 'WRAP'], AERODACTYL: ['BRUTAL_SWING'],
    MUK_ALOLA: ['BRUTAL_SWING', 'ICE_PUNCH'], GRENINJA: ['BRUTAL_SWING'],
    ARIADOS: ['FOUL_PLAY'], DARKRAI: ['FOUL_PLAY', 'SUCKER_PUNCH_FAST'],
    GRAFAIAI: ['FOUL_PLAY', 'SCRATCH_FAST'], VICTREEBEL: ['SUCKER_PUNCH_FAST'],
    AUDINO: ['CHARGE_BEAM_FAST'], RAICHU: ['VOLT_TACKLE'], RAICHU_ALOLA: ['VOLT_TACKLE'],
    GRIMMSNARL: ['DRAINING_KISS'], AGGRON: ['BRICK_BREAK'], ZERAORA: ['DYNAMIC_PUNCH'],
    DEOXYS_DEFENSE: ['LOW_KICK_FAST'], KINGAMBIT: ['LOW_KICK_FAST'], GALLADE: ['SACRED_SWORD'],
    HOUNDOOM: ['INCINERATE_FAST', 'TRAILBLAZE'], MISMAGIUS: ['MYSTICAL_FIRE'],
    CROBAT: ['GUST_FAST'], FLAMIGO: ['PECK_FAST'], CHANDELURE: ['ASTONISH_FAST'],
    COFAGRIGUS: ['ENERGY_BALL'], SKARMORY: ['DRILL_RUN'], BOMBIRDIER: ['DRILL_RUN'],
    LUGIA: ['EARTH_POWER'], MILTANK: ['HIGH_HORSEPOWER'], NIDOKING: ['AVALANCHE'],
    URSALUNA: ['SCRATCH_FAST'], ZOROARK_HISUIAN: ['SWIFT'],
    TOXTRICITY_AMPED: ['SWIFT'], TOXTRICITY_LOW_KEY: ['SWIFT'], SNORLAX: ['PSYWAVE_FAST'],
  };
  for (const [formId, moveIds] of Object.entries(additions)) {
    const pool = moves(formId);
    for (const moveId of moveIds) {
      const move = pool.find(candidate => candidate.id === moveId);
      assert(move, `${formId} is missing ${moveId}`);
      assert.equal(move.elite, false, `${formId} ${moveId} should be currently available`);
    }
  }

  assert.deepEqual(entries.get('RAICHU').charged_moves.find(move => move.id === 'VOLT_TACKLE'), {
    id: 'VOLT_TACKLE', name: 'Volt Tackle', type: 'electric', power: 90,
    energy: -33, duration_ms: 3500, elite: false,
  });
  for (const [formId, moveId] of [
    ['AERODACTYL_MEGA', 'BRUTAL_SWING'], ['GRENINJA_MEGA', 'BRUTAL_SWING'],
    ['RAICHU_MEGA_X', 'VOLT_TACKLE'], ['RAICHU_MEGA_Y', 'VOLT_TACKLE'],
    ['GALLADE_MEGA', 'SACRED_SWORD'], ['HOUNDOOM_MEGA', 'INCINERATE_FAST'],
    ['SKARMORY_MEGA', 'DRILL_RUN'],
  ]) assert(moves(formId).some(move => move.id === moveId), `${formId} did not inherit ${moveId}`);
});

test('rankings evaluate every attack type and return one valid best moveset per form', () => {
  for (const attackType of RANKING_TYPES) {
    const result = calculateRankings(catalog, {attackType, level: 40});
    assert.equal(result.attackType, attackType);
    assert(result.candidateMovesets > 0);
    assert(result.rows.length > 0);
    assert.equal(new Set(result.rows.map(row => row.formId)).size, result.rows.length);
    for (const row of result.rows) {
      assert.equal(row.chargedMoveType, attackType);
      assert(Number.isFinite(row.idealDps) && row.idealDps > 0);
      assert(Number.isFinite(row.simpleDps) && row.simpleDps > 0);
      assert(Number.isFinite(row.effectiveDps) && row.effectiveDps > 0);
      assert(row.effectiveDps < row.idealDps);
    }
    for (let index = 1; index < result.rows.length; index += 1) {
      assert(result.rows[index - 1].idealDps >= result.rows[index].idealDps);
    }
  }
});

test('movesets that cannot complete one charged attack are excluded', () => {
  const fragile = {
    form_id: 'FRAGILE_TEST', dex_number: 1, name: 'Fragile Test', types: ['normal'],
    stats: {attack: 100, defense: 1, stamina: 1},
    fast_moves: [{id: 'SLOW_FAST', name: 'Slow Fast', type: 'normal', power: 1, energy: 1, duration_ms: 5000}],
    charged_moves: [{id: 'TEST_BLAST', name: 'Test Blast', type: 'fire', power: 100, energy: -100, duration_ms: 5000}],
  };
  const result = calculateRankings([fragile], {attackType: 'fire'});
  assert.equal(result.candidateMovesets, 1);
  assert.equal(result.excludedLowQuality, 1);
  assert.deepEqual(result.rows, []);
});

test('v1 rejects unsupported levels and attack types', () => {
  assert.throws(() => calculateRankings(catalog, {attackType: 'fire', level: 50}), /Level 40 only/);
  assert.throws(() => calculateRankings(catalog, {attackType: 'bird'}), /Unknown ranking type/);
  assert.throws(() => calculateRankings(catalog, {attackType: 'fire', bossAttack: 'extreme'}), /Unknown boss Attack/);
  assert.throws(() => calculateRankings(catalog, {attackType: 'fire', bossMoveType: 'sound'}), /Unknown boss move type/);
  assert.throws(() => calculateRankings(catalog, {attackType: 'fire', megaLevel: 5}), /Unknown Mega Level/);
});

test('released Mega plus moves scale with Mega Level and Super Max stats', () => {
  assert.equal(RELEASED_MEGA_PLUS_FORM_IDS.size, 15);
  for (const formId of ['BEEDRILL_MEGA', 'HOUNDOOM_MEGA', 'DELPHOX_MEGA', 'MEWTWO_MEGA_X']) {
    assert(RELEASED_MEGA_PLUS_FORM_IDS.has(formId), `Missing released Super Max form ${formId}`);
  }
  assert(!RELEASED_MEGA_PLUS_FORM_IDS.has('STARAPTOR_MEGA'));

  const entries = new Map(catalog.map(entry => [entry.form_id, entry]));
  assert.deepEqual(entries.get('BEEDRILL_MEGA').mega_charged_moves[0], {
    id: 'FELL_STINGER_PLUS', name: 'Fell Stinger+', type: 'bug', power: 140,
    energy: -100, duration_ms: 2000, elite: false,
    plus_powers: [140, 154, 168, 182],
  });
  assert.deepEqual(entries.get('HOUNDOOM_MEGA').mega_charged_moves[0], {
    id: 'DARK_PULSE_PLUS', name: 'Dark Pulse+', type: 'dark', power: 150,
    energy: -100, duration_ms: 3000, elite: false,
    plus_powers: [150, 165, 180, 195],
  });

  const levelOne = calculateRankings(catalog, {attackType: 'bug', megaLevel: 1});
  const levelFour = calculateRankings(catalog, {attackType: 'bug', megaLevel: 4});
  const beedrillOne = levelOne.rows.find(row => row.formId === 'BEEDRILL_MEGA');
  const beedrillFour = levelFour.rows.find(row => row.formId === 'BEEDRILL_MEGA');
  assert(beedrillOne && beedrillFour);
  assert.equal(beedrillOne.chargedMove, 'Fell Stinger+');
  assert.equal(beedrillFour.chargedMove, 'Fell Stinger++++');
  assert(beedrillFour.simpleDps > beedrillOne.simpleDps);
  assert.equal(levelOne.assumptions.megaPlusPowerMultiplier, 1);
  assert.equal(levelOne.assumptions.superMaxLevelBoost, 0);
  assert.equal(levelFour.assumptions.megaPlusPowerMultiplier, 1.3);
  assert.equal(levelFour.assumptions.superMaxLevelBoost, 2);
});

test('simple DPS averages exact rounded damage across the target Defense ensemble', () => {
  const attacker = {
    form_id: 'ROUNDING_TEST', dex_number: 1, name: 'Rounding Test', types: ['fire'],
    stats: {attack: 185, defense: 200, stamina: 200},
    fast_moves: [{id: 'TEST_FAST', name: 'Test Fast', type: 'fire', power: 10, energy: 100, duration_ms: 1000}],
    charged_moves: [{id: 'TEST_CHARGED', name: 'Test Charged', type: 'fire', power: 100, energy: -100, duration_ms: 1000}],
  };
  const result = calculateRankings([attacker], {attackType: 'fire', bossAttack: 'low'});
  assert.deepEqual(result.assumptions.targetDefenses, [160, 180, 200, 220, 240]);
  const effectiveAttack = (185 + 15) * 0.79030001;
  const exactDamage = (power, defense) => Math.floor(
    0.5 * power * effectiveAttack / defense * 1.2 * 1.6,
  ) + 1;
  const expected = result.assumptions.targetDefenses.reduce((total, defense) =>
    total + (exactDamage(10, defense) + exactDamage(100, defense)) / 2, 0)
    / result.assumptions.targetDefenses.length;
  assert.equal(result.rows.length, 1);
  assert(Math.abs(result.rows[0].simpleDps - expected) < 1e-12);
});

test('boss Attack changes incoming-damage metrics but not simple DPS', () => {
  const low = calculateRankings(catalog, {attackType: 'fire', bossAttack: 'low'});
  const high = calculateRankings(catalog, {attackType: 'fire', bossAttack: 'high'});
  const lowBlaziken = low.rows.find(row => row.formId === 'BLAZIKEN_MEGA');
  const highBlaziken = high.rows.find(row => row.formId === 'BLAZIKEN_MEGA');
  assert(lowBlaziken && highBlaziken);
  assert.equal(lowBlaziken.simpleDps, highBlaziken.simpleDps);
  assert.notEqual(lowBlaziken.idealDps, highBlaziken.idealDps);
  assert.notEqual(lowBlaziken.effectiveDps, highBlaziken.effectiveDps);
  assert.equal(low.assumptions.bossAttackCoefficient, 675);
  assert.equal(high.assumptions.bossAttackCoefficient, 1125);
  assert.equal(low.assumptions.minimumChargedProbability, 0.10);
  assert.equal(low.assumptions.pulseScheduleCount, 32);
  assert.equal(low.assumptions.continuationSamples, 32);
});

test('boss move type applies defensive type effectiveness only to incoming metrics', () => {
  const attacker = {
    form_id: 'TYPING_TEST', dex_number: 1, name: 'Typing Test', types: ['fire'],
    stats: {attack: 250, defense: 200, stamina: 200},
    fast_moves: [{id: 'TEST_FAST', name: 'Test Fast', type: 'fire', power: 10, energy: 10, duration_ms: 1000}],
    charged_moves: [{id: 'TEST_CHARGED', name: 'Test Charged', type: 'fire', power: 100, energy: -50, duration_ms: 2000}],
  };
  const resisted = calculateRankings([attacker], {attackType: 'fire', bossMoveType: 'grass'});
  const neutral = calculateRankings([attacker], {attackType: 'fire', bossMoveType: 'typeless'});
  const weak = calculateRankings([attacker], {attackType: 'fire', bossMoveType: 'water'});
  assert.equal(resisted.bossMoveType, 'grass');
  assert.equal(neutral.bossMoveType, 'typeless');
  assert.equal(weak.bossMoveType, 'water');
  assert.equal(resisted.rows[0].simpleDps, neutral.rows[0].simpleDps);
  assert.equal(neutral.rows[0].simpleDps, weak.rows[0].simpleDps);
  assert(resisted.rows[0].idealDps < neutral.rows[0].idealDps);
  assert(neutral.rows[0].idealDps < weak.rows[0].idealDps);
});

test('released Shadows are ranked separately with both damage modifiers', () => {
  assert.equal(shadowFormIds.size, shadowAvailability.mapped_form_ids);
  assert.equal(shadowAvailability.released_through, '2026-09-08');
  assert.equal(shadowAvailability.source_species_released, 458);
  assert.equal(shadowAvailability.mapped_species, 458);
  assert(shadowFormIds.has('MAMOSWINE'));
  assert(shadowFormIds.has('DIALGA'));
  assert(shadowFormIds.has('PALKIA'));
  assert(!shadowFormIds.has('DIALGA_ORIGIN'));
  assert(!shadowFormIds.has('PALKIA_ORIGIN'));
  assert(shadowFormIds.has('RESHIRAM'));
  assert(shadowFormIds.has('NIDORAN_MALE'));
  for (const released of [
    'SEEL', 'DEWGONG', 'HOOTHOOT', 'NOCTOWL',
    'AXEW', 'FRAXURE', 'HAXORUS', 'NOIBAT', 'NOIVERN',
    'ROOKIDEE', 'CORVISQUIRE', 'CORVIKNIGHT',
  ]) assert(shadowFormIds.has(released), `Missing released Shadow ${released}`);
  for (const invalid of [
    'FARFETCHD', 'KANGASKHAN', 'MR_MIME', 'STUNFISK',
    'PERRSERKER', 'SIRFETCHD', 'RUNERIGUS',
    'GROWLITHE_HISUIAN', 'ARCANINE_HISUIAN',
    'VOLTORB_HISUIAN', 'ELECTRODE_HISUIAN',
    'WOOPER_PALDEA', 'SAMUROTT_HISUIAN',
  ]) assert(!shadowFormIds.has(invalid), `Unreleased Shadow form included: ${invalid}`);
  assert(!shadowFormIds.has('ZIGZAGOON'));
  assert(!shadowFormIds.has('LINOONE'));
  assert(shadowFormIds.has('WEEZING_GALARIAN'));
  assert(shadowFormIds.has('ZIGZAGOON_GALARIAN'));
  assert(shadowFormIds.has('LINOONE_GALARIAN'));
  assert(!shadowFormIds.has('WIMPOD'));
  assert(!shadowFormIds.has('ZEKROM'));
  const catalogIds = new Set(catalog.map(entry => entry.form_id));
  for (const formId of shadowFormIds) assert(catalogIds.has(formId), `Missing Shadow catalog form ${formId}`);

  const result = calculateRankings(
    catalog,
    {attackType: 'ice', level: 40, includeShadows: true},
    shadowFormIds,
    legendaryDexNumbers,
  );
  const normal = result.rows.find(row => row.formId === 'MAMOSWINE' && !row.shadow);
  const shadow = result.rows.find(row => row.formId === 'MAMOSWINE' && row.shadow);
  assert(normal && shadow);
  assert(shadow.simpleDps > normal.simpleDps);
  assert(result.shadowRows > 0);
  assert.equal(result.assumptions.shadowOutgoingMultiplier, 1.2);
  assert.equal(result.assumptions.shadowIncomingMultiplier, 1.2);
  for (const duplicate of ['RAIKOU_S', 'ENTEI_S', 'SUICUNE_S', 'LUGIA_S', 'HO_OH_S', 'LATIAS_S', 'LATIOS_S']) {
    assert(!result.rows.some(row => row.formId === duplicate));
  }
});

test('Mega and broad Legendary filters exclude every marked row', () => {
  assert.equal(legendaryDexNumbers.size, 97);
  for (const dexNumber of [150, 151, 793]) assert(legendaryDexNumbers.has(dexNumber));

  const all = calculateRankings(
    catalog,
    {attackType: 'psychic', includeMegas: true, includeShadows: true, includeLegendaries: true},
    shadowFormIds,
    legendaryDexNumbers,
  );
  assert(all.megaRows > 0);
  assert(all.shadowRows > 0);
  assert(all.legendaryRows > 0);
  assert(all.rows.some(row => row.formId === 'MEWTWO_MEGA_Y' && row.mega && row.legendary));

  const filtered = calculateRankings(
    catalog,
    {attackType: 'psychic', includeMegas: false, includeShadows: false, includeLegendaries: false},
    shadowFormIds,
    legendaryDexNumbers,
  );
  assert.equal(filtered.megaRows, 0);
  assert.equal(filtered.shadowRows, 0);
  assert.equal(filtered.legendaryRows, 0);
  assert(filtered.rows.every(row => !row.mega && !row.shadow && !row.legendary));
});

test('deployed rankings worker loads only its static catalog', async () => {
  const worker = new Worker(new URL('./rankings_worker_harness.mjs', import.meta.url));
  try {
    const [ready] = await once(worker, 'message');
    assert(ready.ready);
    const responsePromise = once(worker, 'message');
    worker.postMessage({
      id: 1,
      attackType: 'fire',
      includeMegas: true,
      includeShadows: true,
      includeLegendaries: true,
      bossAttack: 'high',
      bossMoveType: 'dragon',
      megaLevel: 4,
    });
    const [response] = await responsePromise;
    assert.equal(response.id, 1);
    assert.equal(response.result.attackType, 'fire');
    assert.equal(response.result.includeShadows, true);
    assert.equal(response.result.bossAttack, 'high');
    assert.equal(response.result.bossMoveType, 'dragon');
    assert.equal(response.result.megaLevel, 4);
    assert.equal(response.result.assumptions.megaPlusPowerMultiplier, 1.3);
    assert.equal(response.result.assumptions.superMaxLevelBoost, 2);
    assert(response.result.shadowRows > 0);
    assert(response.result.megaRows > 0);
    assert(response.result.legendaryRows > 0);
    assert(response.result.rows.length > 100);
  } finally {
    await worker.terminate();
  }
});

test('rankings UI uses compact selection, metric help, and effective DPS by default', () => {
  const app = readFileSync(new URL('../../apps/rankings/app.js', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../../apps/rankings/styles.css', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../apps/rankings/index.html', import.meta.url), 'utf8');

  assert.match(styles, /font-family:\s*Verdana, sans-serif/);
  assert.match(styles, /\.type-button\[aria-pressed="true"\][^{]*\{[^}]*background:\s*var\(--blue-selected\)/s);
  assert.match(styles, /\.type-button\[aria-pressed="true"\][^{]*\{[^}]*color:\s*#111111/s);
  for (const type of RANKING_TYPES) assert.match(styles, new RegExp(`\\.type-${type}\\s*\\{`));
  assert.match(styles, /background-size:\s*217\.212121px 108\.606061px/);
  assert.match(styles, /\.type-bug\s*\{[^}]*-21\.636364px/);
  assert.match(styles, /\.type-dragon\s*\{[^}]*-49\.636364px/);
  assert.match(styles, /\.type-steel\s*\{[^}]*-77\.636364px/);
  assert.match(styles, /clip-path:\s*circle\(50% at 50% 50%\)/);
  assert.match(app, /type-icon type-\$\{type\}/);
  assert.doesNotMatch(app, /className\s*=\s*["']move-type|row\.chargedEnergy|textContent\s*=\s*["']Elite["']/);
  assert.match(app, /marker\.textContent\s*=\s*["']\*["']/);
  assert.match(app, /includeShadows/);
  assert.match(app, /bossAttack/);
  assert.match(app, /bossMoveType/);
  assert.match(app, /megaLevel/);
  assert.doesNotMatch(app, /mode:\s*["']counters["']|renderCounters|counters_worker/);
  assert.doesNotMatch(page, /id="view-counters"|id="counter-panel"/);
  for (const id of ['include-megas', 'include-shadows', 'include-legendaries']) {
    assert.match(page, new RegExp(`id="${id}"[^>]*aria-pressed="true"`));
  }
  assert.match(page, /id="pokemon-search"[^>]*type="search"/);
  assert.match(page, /id="boss-attack"/);
  assert.match(page, /id="boss-move-type"/);
  assert.match(page, /value="fairy">Fairy/);
  assert.match(page, /id="mega-level"/);
  assert.match(page, /class="metric-help"[^>]*>\?<\/button>/);
  assert.match(page, /Ideal DPS<\/strong> represents the maximum possible DPS/);
  assert.match(page, /Simple DPS<\/strong> represents the DPS obtained if the boss doesn't attack/);
  assert.match(page, /Effective DPS<\/strong> takes relobby times into account/);
  assert.match(page, /value="effectiveDps" selected/);
  assert.doesNotMatch(page, /Level 40 · neutral model|Ranking assumptions/);
  assert.match(app, /: "effectiveDps"/);
  assert.match(styles, /\.shadow-word\s*\{[^}]*color:\s*#552477/s);
  assert.match(styles, /\.mega-word\s*\{[^}]*color:\s*#1689c7/s);
  assert.match(styles, /\.metric-help-text\s*\{[^}]*bottom:\s*calc\(100% \+ \.5rem\)[^}]*pointer-events:\s*none/s);
  assert.doesNotMatch(styles, /\.metric-help-text:hover/);
  assert.match(app, /rank:\s*index \+ 1/);
  assert.match(app, /document\.documentElement\.dataset\.rankingMode = rankingMode/);
  assert.match(styles, /html\[data-ranking-mode="anti"\]\s*\{[^}]*color-scheme:\s*dark/s);
  assert.match(styles, /html\[data-ranking-mode="anti"\] tbody tr:nth-child\(even\)/);
});
