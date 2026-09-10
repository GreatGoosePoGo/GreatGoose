import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {calculateRaidCounters, raidBossCatalog} from '../../build/raid_counters.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const shadowAvailability = JSON.parse(readFileSync(new URL('../../simulator/shadow_availability.json', import.meta.url)));
const shadowFormIds = new Set(shadowAvailability.form_ids);
const rankingCategories = JSON.parse(readFileSync(new URL('../../simulator/ranking_categories.json', import.meta.url)));
const legendaryDexNumbers = new Set(rankingCategories.legendary_dex_numbers);

test('raid boss catalog exposes forms with complete ordinary movesets', () => {
  const bosses = raidBossCatalog(catalog);
  const mewtwo = bosses.find(boss => boss.formId === 'MEWTWO');
  assert(mewtwo);
  assert.equal(mewtwo.name, 'Mewtwo');
  assert.equal(mewtwo.fastMoveCount, 2);
  assert.equal(mewtwo.chargedMoveCount, 5);
  assert(!bosses.some(boss => boss.formId === 'RAIKOU_S'));
  assert(bosses.every(boss => boss.fastMoveCount > 0 && boss.chargedMoveCount > 0));
});

test('specific raid counters are actual simulated, unique, sorted top-30 rows', () => {
  const progress = [];
  const result = calculateRaidCounters(
    catalog,
    {
      bossFormId: 'MEWTWO',
      raidDifficulty: 'Tier 5',
      includeMegas: true,
      includeShadows: true,
      includeLegendaries: true,
      trialsPerBossMoveset: 1,
      prefilterLimit: 60,
    },
    shadowFormIds,
    legendaryDexNumbers,
    (completed, total) => progress.push([completed, total]),
  );
  assert.equal(result.bossName, 'Mewtwo');
  assert.equal(result.bossMovesets, 10);
  assert.equal(result.totalBossMovesets, 10);
  assert.equal(result.rows.length, 30);
  assert.equal(result.simulatedBattles, result.simulatedMovesets * result.bossMovesets);
  assert(result.candidateMovesets > result.simulatedMovesets);
  assert.equal(new Set(result.rows.map(row => `${row.formId}:${row.shadow}`)).size, result.rows.length);
  assert(progress.length > 0);
  assert.deepEqual(progress.at(-1), [result.simulatedMovesets, result.simulatedMovesets]);
  for (const row of result.rows) {
    assert(Number.isFinite(row.battleDps) && row.battleDps > 0);
    assert(row.averageDamagePercent > 0 && row.averageDamagePercent <= 100);
    assert(row.averageFaints >= 0);
  }
  for (let index = 1; index < result.rows.length; index += 1) {
    assert(result.rows[index - 1].battleDps >= result.rows[index].battleDps);
  }
  assert.deepEqual(result.assumptions, {
    level: 40,
    attackIV: 15,
    defenseIV: 15,
    staminaIV: 15,
    teamSize: 6,
    trialsPerBossMoveset: 1,
    dodgeStrategy: 'none',
    playerStrategy: 'no_strategy',
    friendshipMultiplier: 1,
    weather: null,
    excludeLegacyMoves: false,
    partyPower: false,
    purifiedGems: false,
    analyticalPrefilter: true,
    maximumBossMovesets: 12,
  });
});

test('bosses with exceptionally broad movepools use a bounded deterministic sample', () => {
  const result = calculateRaidCounters(
    catalog,
    {
      bossFormId: 'MEW',
      raidDifficulty: 'Tier 5',
      includeMegas: false,
      includeShadows: false,
      includeLegendaries: false,
      trialsPerBossMoveset: 1,
      prefilterLimit: 30,
    },
    shadowFormIds,
    legendaryDexNumbers,
  );
  assert.equal(result.totalBossMovesets, 350);
  assert.equal(result.bossMovesets, 12);
  assert.equal(result.simulatedBattles, result.simulatedMovesets * 12);
});

test('raid counter category filters remove Megas, Shadows, and Legendary families', () => {
  const result = calculateRaidCounters(
    catalog,
    {
      bossFormId: 'MEWTWO',
      raidDifficulty: 'Tier 5',
      includeMegas: false,
      includeShadows: false,
      includeLegendaries: false,
      trialsPerBossMoveset: 1,
      prefilterLimit: 100,
    },
    shadowFormIds,
    legendaryDexNumbers,
  );
  assert.equal(result.rows.length, 30);
  assert(result.rows.every(row => !row.mega && !row.shadow && !row.legendary));
});

test('raid counter battle conditions, strategies, levels, and legacy filter reach full simulations', () => {
  const result = calculateRaidCounters(
    catalog,
    {
      bossFormId: 'MEWTWO',
      raidDifficulty: 'Tier 5',
      level: 50,
      weather: 'Fog',
      friendshipMultiplier: 1.10,
      dodgeStrategy: 'lethal_only',
      playerStrategy: 'hot_swap_cautious',
      excludeLegacy: true,
      includeMegas: true,
      includeShadows: true,
      includeLegendaries: true,
      trialsPerBossMoveset: 1,
      prefilterLimit: 30,
    },
    shadowFormIds,
    legendaryDexNumbers,
  );
  assert(result.rows.length > 0 && result.rows.length <= 30);
  assert.equal(result.assumptions.level, 50);
  assert.equal(result.assumptions.weather, 'Fog');
  assert.equal(result.assumptions.friendshipMultiplier, 1.10);
  assert.equal(result.assumptions.dodgeStrategy, 'lethal_only');
  assert.equal(result.assumptions.playerStrategy, 'hot_swap_cautious');
  assert.equal(result.assumptions.excludeLegacyMoves, true);
  assert(result.rows.every(row => !row.eliteFast && !row.eliteCharged));
});

test('raid counters reject unsupported levels and strategies', () => {
  const common = {
    bossFormId: 'MEWTWO',
    raidDifficulty: 'Tier 5',
    trialsPerBossMoveset: 1,
    prefilterLimit: 30,
  };
  assert.throws(() => calculateRaidCounters(catalog, {...common, level: 35}), /level must be 30, 40, or 50/);
  assert.throws(
    () => calculateRaidCounters(catalog, {...common, dodgeStrategy: 'downtime_saver'}),
    /Unsupported raid-counter dodge strategy/,
  );
  assert.throws(
    () => calculateRaidCounters(catalog, {...common, playerStrategy: 'catch_tank'}),
    /Unsupported raid-counter player strategy/,
  );
});

test('dedicated counter UI exposes the requested scenario controls', () => {
  const app = readFileSync(new URL('../../apps/counters/app.js', import.meta.url), 'utf8');
  const page = readFileSync(new URL('../../apps/counters/index.html', import.meta.url), 'utf8');
  const styles = readFileSync(new URL('../../apps/counters/styles.css', import.meta.url), 'utf8');
  const rankingsPage = readFileSync(new URL('../../apps/rankings/index.html', import.meta.url), 'utf8');

  for (const id of [
    'counter-boss', 'counter-difficulty', 'counter-level', 'counter-weather',
    'counter-friendship', 'counter-dodge-strategy', 'counter-player-strategy',
    'counter-exclude-legacy', 'generate-counters', 'counter-body',
  ]) {
    assert.match(page, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(page, /value="downtime_saver"/);
  assert.doesNotMatch(page, /value="catch_tank"/);
  assert.match(page, /value="30">Level 30/);
  assert.match(page, /value="40" selected>Level 40/);
  assert.match(page, /value="50">Level 50/);
  assert.match(app, /engine\/counters_worker\.js/);
  assert.match(page, /class="boss-panel"/);
  assert.match(page, /id="counter-settings"/);
  assert.match(page, /id="counter-body" class="counter-list"/);
  assert.match(styles, /font-family: system-ui/);
  assert.doesNotMatch(styles, /Verdana/);
  assert.match(app, /row\.winPercent/);
  assert.match(app, /row\.averageWinTime/);
  assert.doesNotMatch(rankingsPage, /id="counter-panel"|id="view-counters"/);
  assert.match(rankingsPage, /href="\.\.\/counters\/">Counters/);
});

test('dedicated counters worker loads static data and runs the selected scenario', async () => {
  const worker = new Worker(new URL('./counters_worker_harness.mjs', import.meta.url));
  try {
    const [ready] = await once(worker, 'message');
    assert(ready.ready);
    const catalogResponsePromise = once(worker, 'message');
    worker.postMessage({id: 1, mode: 'catalog'});
    const [catalogResponse] = await catalogResponsePromise;
    assert(catalogResponse.result.bosses.some(boss => boss.formId === 'MEWTWO'));

    const resultPromise = new Promise((resolve, reject) => {
      const onMessage = message => {
        if (message.id !== 2 || message.progress) return;
        worker.off('message', onMessage);
        if (message.error) reject(new Error(message.error));
        else resolve(message.result);
      };
      worker.on('message', onMessage);
    });
    worker.postMessage({
      id: 2,
      mode: 'counters',
      bossFormId: 'MEWTWO',
      raidDifficulty: 'Tier 5',
      level: 30,
      weather: 'Windy',
      friendshipMultiplier: 1.07,
      dodgeStrategy: 'super_effective',
      playerStrategy: 'hot_swap_greedy',
      excludeLegacy: true,
      includeMegas: false,
      includeShadows: false,
      includeLegendaries: false,
      trialsPerBossMoveset: 1,
      prefilterLimit: 30,
    });
    const result = await resultPromise;
    assert.equal(result.assumptions.level, 30);
    assert.equal(result.assumptions.weather, 'Windy');
    assert.equal(result.assumptions.friendshipMultiplier, 1.07);
    assert.equal(result.assumptions.dodgeStrategy, 'super_effective');
    assert.equal(result.assumptions.playerStrategy, 'hot_swap_greedy');
    assert.equal(result.assumptions.excludeLegacyMoves, true);
    assert(result.rows.every(row => !row.mega && !row.shadow && !row.legendary));
  } finally {
    await worker.terminate();
  }
});
