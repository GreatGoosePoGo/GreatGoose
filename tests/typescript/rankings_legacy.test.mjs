import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import {calculateRankings} from '../../build/rankings.js';

const fast = {id: 'FAST', name: 'Fast', type: 'fire', power: 10, energy: 10, duration_ms: 1000};
const charged = {id: 'CHARGED', name: 'Charged', type: 'fire', power: 100, energy: -50, duration_ms: 2000};
const entry = {
  form_id: 'TEST', name: 'Test', dex_number: 1, released: true, types: ['fire'],
  stats: {attack: 200, defense: 200, stamina: 200},
  fast_moves: [fast, {...fast, id: 'ELITE_FAST', name: 'Elite Fast', power: 20, elite: true}],
  charged_moves: [charged, {...charged, id: 'ELITE_CHARGED', name: 'Elite Charged', power: 150, elite: true}],
};
const usesLegacy = row => row.eliteFast || row.eliteCharged;

test('split legacy ranks the best legacy and non-legacy movesets separately for each Shadow state', () => {
  for (const mode of ['attack', 'anti']) {
    const settings = {attackType: 'fire', mode, includeShadows: true};
    const shadows = new Set(['TEST']);
    const normal = calculateRankings([entry], settings, shadows);
    const split = calculateRankings([entry], {...settings, splitLegacy: true}, shadows);
    assert.equal(normal.splitLegacy, false);
    assert.equal(normal.rows.length, 2);
    assert.equal(split.rows.length, 4);
    assert.equal(split.candidateMovesets, normal.candidateMovesets);
    for (const shadow of [false, true]) {
      const rows = split.rows.filter(row => row.shadow === shadow);
      assert.deepEqual(rows.find(usesLegacy), normal.rows.find(row => row.shadow === shadow));
      const ordinary = rows.find(row => !usesLegacy(row));
      assert.equal(ordinary.fastMove, 'Fast');
      assert.equal(ordinary.chargedMove, 'Charged');
      const withoutLegacy = calculateRankings([entry], {...settings, excludeLegacy: true}, shadows);
      assert.deepEqual(ordinary, withoutLegacy.rows.find(row => row.shadow === shadow));
    }
    assert(split.rows.every((row, index) => !index || split.rows[index - 1].idealDps >= row.idealDps));
  }
});

test('legacy fast moves, charged moves and one-off moves split even when they are weaker', () => {
  for (const pool of ['fast_moves', 'charged_moves']) {
    for (const flag of ['elite', 'glitch_legacy']) {
      const candidate = {...entry, fast_moves: [fast], charged_moves: [charged]};
      const move = candidate[pool][0];
      candidate[pool] = [move, {...move, id: 'LEGACY', name: 'Legacy', power: 1, [flag]: true}];
      const normal = calculateRankings([candidate], {attackType: 'fire'});
      const split = calculateRankings([candidate], {attackType: 'fire', splitLegacy: true});
      assert.equal(normal.rows.length, 1);
      assert.equal(usesLegacy(normal.rows[0]), false);
      assert.equal(split.rows.length, 2);
      assert.equal(split.rows.filter(usesLegacy).length, 1);
      const excluded = calculateRankings([candidate], {attackType: 'fire', splitLegacy: true, excludeLegacy: true});
      assert.deepEqual(excluded.rows, normal.rows);
      assert.equal(excluded.candidateMovesets, 1);
    }
  }
});

test('split legacy does not invent variants or treat currently available exclusive moves as legacy', () => {
  const ordinary = {...entry, fast_moves: [fast], charged_moves: [], exclusive_charged_moves: [charged]};
  const legacyOnly = {...ordinary, exclusive_charged_moves: [{...charged, elite: true}]};
  for (const candidate of [ordinary, legacyOnly]) {
    const split = calculateRankings([candidate], {attackType: 'fire', splitLegacy: true});
    assert.equal(split.rows.length, 1);
    assert.equal(usesLegacy(split.rows[0]), candidate === legacyOnly);
    const excluded = calculateRankings([candidate], {attackType: 'fire', splitLegacy: true, excludeLegacy: true});
    assert.equal(excluded.rows.length, candidate === legacyOnly ? 0 : 1);
  }
});

test('deployed worker forwards legacy splitting and exclusion settings', async () => {
  const worker = new Worker(new URL('./rankings_worker_harness.mjs', import.meta.url));
  try {
    await once(worker, 'message');
    for (const excludeLegacy of [false, true]) {
      const response = once(worker, 'message');
      worker.postMessage({id: 1, attackType: 'fire', splitLegacy: true, excludeLegacy});
      const [{result, error}] = await response;
      assert.equal(error, undefined);
      assert.equal(result.splitLegacy, true);
      assert.equal(result.excludeLegacy, excludeLegacy);
      const charizard = result.rows.filter(row => row.formId === 'CHARIZARD');
      assert.equal(charizard.length, excludeLegacy ? 1 : 2);
      assert.equal(charizard.filter(usesLegacy).length, excludeLegacy ? 0 : 1);
      if (excludeLegacy) assert(result.rows.every(row => !usesLegacy(row)));
    }
  } finally {
    await worker.terminate();
  }
});

// Run the actual UI adapter against a small DOM and an engine-backed worker.
function createUI(query = '') {
  class Element {
    children = [];
    attributes = {};
    dataset = {};
    listeners = {};
    value = '';
    textContent = '';
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(fragment) { this.children = fragment.children; }
    setAttribute(name, value) { this.attributes[name] = value; }
    addEventListener(name, callback) { this.listeners[name] = callback; }
    emit(name) { this.listeners[name](); }
    set innerHTML(value) { this.children = []; }
  }
  const page = readFileSync(new URL('../../apps/rankings/index.html', import.meta.url), 'utf8');
  const elements = new Map([...page.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  elements.set('.results', new Element());
  const location = {href: `https://example.test/rankings/?type=fire${query}`};
  const requests = [];
  const callbacks = new Map();
  const document = {
    documentElement: new Element(),
    querySelector: selector => elements.get(selector),
    querySelectorAll: () => elements.get('#types').children,
    createElement: () => new Element(),
    createDocumentFragment: () => new Element(),
    createTextNode: textContent => ({textContent}),
  };
  class RankingWorker {
    addEventListener(name, callback) { callbacks.set(name, callback); }
    postMessage(settings) {
      requests.push(settings);
      const result = calculateRankings([entry], settings);
      queueMicrotask(() => callbacks.get('message')({data: {id: settings.id, result}}));
    }
  }
  vm.runInNewContext(readFileSync(new URL('../../apps/rankings/app.js', import.meta.url), 'utf8'), {
    document, location, URL, Worker: RankingWorker,
    history: {replaceState: (_state, _title, url) => { location.href = String(url); }},
    localStorage: {getItem: () => '1'},
  });
  return {elements, location, requests};
}
const flush = () => new Promise(resolve => setImmediate(resolve));

test('rankings toggles update separate ranks, labels, URL state and cached results', async () => {
  const ui = createUI();
  const button = ui.elements.get('#split-legacy');
  const body = ui.elements.get('#ranking-body');
  await flush();
  assert.equal(button.attributes['aria-pressed'], 'false');
  assert.equal(body.children.length, 1);
  button.emit('click');
  await flush();
  assert.equal(button.attributes['aria-pressed'], 'true');
  assert.equal(new URL(ui.location.href).searchParams.get('splitLegacy'), '1');
  assert.equal(ui.requests.at(-1).splitLegacy, true);
  assert.equal(body.children.length, 2);
  assert.deepEqual(body.children.map(row => row.children[0].textContent), ['1', '2']);
  const labels = body.children.map(row => row.children[1].children.at(-1).textContent);
  assert(labels.some(label => label.endsWith(' · Legacy')));
  assert(labels.some(label => label.endsWith(' · Non-legacy')));
  button.emit('click');
  await flush();
  assert.equal(body.children.length, 1);
  assert.equal(ui.requests.length, 2);
  button.emit('click');
  await flush();
  assert.equal(body.children.length, 2);
  assert.equal(ui.requests.length, 2);
  ui.elements.get('#exclude-legacy').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).excludeLegacy, true);
  assert.equal(body.children.length, 1);
  assert.equal(new URL(ui.location.href).searchParams.get('excludeLegacy'), '1');

  const restored = createUI('&splitLegacy=1&excludeLegacy=1');
  await flush();
  assert.equal(restored.elements.get('#split-legacy').attributes['aria-pressed'], 'true');
  assert.equal(restored.elements.get('#exclude-legacy').attributes['aria-pressed'], 'true');
  assert.equal(restored.elements.get('#ranking-body').children.length, 1);
});
