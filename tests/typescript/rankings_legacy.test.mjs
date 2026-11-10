import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {once} from 'node:events';
import {Worker} from 'node:worker_threads';
import vm from 'node:vm';
import {calculateRankings, calculatePokemonMovesets} from '../../build/rankings.js';

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
function createUI(query = '', {deferDetails = false, failDetails = false} = {}) {
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
    emit(name, event = {}) { this.listeners[name](event); }
    showModal() { this.open = true; }
    close() { this.open = false; this.listeners.close?.(); }
    get selectedOptions() { return [{textContent: {idealDps: 'Ideal DPS', simpleDps: 'Simple DPS', effectiveDps: 'Effective DPS'}[this.value]}]; }
    set innerHTML(value) { this.children = []; }
  }
  const page = readFileSync(new URL('../../apps/rankings/index.html', import.meta.url), 'utf8');
  const elements = new Map([...page.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, new Element()]));
  elements.set('.results', new Element());
  const initialUrl = new URL('https://example.test/rankings/?type=fire');
  for (const [key, value] of new URLSearchParams(query.replace(/^&/, ''))) initialUrl.searchParams.set(key, value);
  const location = {href: String(initialUrl)};
  const requests = [];
  const deliveries = [];
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
      const result = settings.kind === 'movesets'
        ? calculatePokemonMovesets([entry], settings, settings)
        : calculateRankings([entry], settings);
      const deliver = () => callbacks.get('message')({data: {
        id: settings.id, result,
        ...(failDetails && settings.kind === 'movesets' ? {error: 'Could not load movesets'} : {}),
      }});
      if (settings.kind === 'movesets' && deferDetails) deliveries.push(deliver);
      else queueMicrotask(deliver);
    }
  }
  vm.runInNewContext(readFileSync(new URL('../../apps/rankings/app.js', import.meta.url), 'utf8'), {
    document, location, URL, Worker: RankingWorker,
    history: {replaceState: (_state, _title, url) => { location.href = String(url); }},
    localStorage: {getItem: () => '1'},
  });
  return {elements, location, requests, deliveries};
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

test('clicking entries opens all movesets with the page settings and supports sorting, closing and cached reopening', async () => {
  const ui = createUI('&level=50&partyPower=4&partySize=3&relobby=6.5&boss=high&bossType=water&megaLevel=4&splitLegacy=1');
  await flush();
  const row = ui.elements.get('#ranking-body').children[0];
  row.emit('click');
  assert.equal(ui.elements.get('#pokemon-details').open, true);
  await flush();
  const settings = ui.requests.at(-1);
  assert.equal(settings.kind, 'movesets');
  for (const key of ['attackType', 'mode', 'level', 'partyPowerPlayers', 'partySize', 'relobbySeconds', 'bossAttack', 'bossMoveType', 'megaLevel', 'excludeLegacy', 'splitLegacy']) {
    assert.equal(settings[key], ui.requests[0][key], key);
  }
  assert.equal(settings.formId, 'TEST');
  assert.equal(settings.shadow, false);
  const body = ui.elements.get('#pokemon-details-body');
  assert.equal(body.children.length, 4);
  const expected = calculatePokemonMovesets([entry], settings, settings).rows.sort((a, b) => b.effectiveDps - a.effectiveDps || b.idealDps - a.idealDps);
  body.children.forEach((row, index) => {
    assert.deepEqual(row.children.slice(3, 6).map(cell => cell.textContent),
      ['idealDps', 'simpleDps', 'effectiveDps'].map(metric => expected[index][metric].toFixed(2)));
  });
  const sort = ui.elements.get('#pokemon-details-sort');
  sort.value = 'simpleDps';
  sort.emit('change');
  assert(body.children.every((row, index) => !index || Number(body.children[index - 1].children[4].textContent) >= Number(row.children[4].textContent)));
  ui.elements.get('#pokemon-details-close').emit('click');
  assert.equal(ui.elements.get('#pokemon-details').open, false);
  let stopped = false;
  row.children[1].children[0].emit('click', {stopPropagation: () => { stopped = true; }});
  await flush();
  assert(stopped);
  assert.equal(body.children.length, 4);
  assert.equal(ui.requests.length, 2);
  ui.elements.get('#pokemon-details-close').emit('click');
  ui.elements.get('#exclude-legacy').emit('click');
  await flush();
  ui.elements.get('#ranking-body').children[0].emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).excludeLegacy, true);
  assert.equal(body.children.length, 1);
});

test('closing a details window ignores pending responses and permits reopening', async () => {
  const ui = createUI('', {deferDetails: true});
  await flush();
  const row = ui.elements.get('#ranking-body').children[0];
  row.emit('click');
  ui.elements.get('#pokemon-details').close(); // Native Escape behavior.
  ui.deliveries.shift()();
  await flush();
  assert.equal(ui.elements.get('#pokemon-details').open, false);
  assert.equal(ui.elements.get('#pokemon-details-body').children.length, 0);
  row.emit('click');
  await flush();
  assert.equal(ui.elements.get('#pokemon-details-body').children.length, 4);
});

test('moveset errors remain inside the details window and leave rankings usable', async () => {
  const ui = createUI('', {failDetails: true});
  await flush();
  ui.elements.get('#ranking-body').children[0].emit('click');
  await flush();
  assert.equal(ui.elements.get('#pokemon-details-error').hidden, false);
  assert.match(ui.elements.get('#pokemon-details-error').textContent, /Could not load movesets/);
  assert.equal(ui.elements.get('#pokemon-details-results').attributes['aria-busy'], 'false');
  assert.equal(ui.elements.get('#ranking-body').children.length, 1);
});

test('two independent type bars update rankings, details, URL, cache and mode visibility', async () => {
  const ui = createUI('&mode=anti&type2=steel');
  await flush();
  const first = type => ui.elements.get('#types').children.find(button => button.dataset.type === type);
  const second = type => ui.elements.get('#secondary-types').children.find(button => button.dataset.type === type);
  assert.equal(ui.elements.get('#secondary-types-section').hidden, false);
  assert.equal(first('none').hidden, false);
  assert.equal(first('fire').dataset.selection, 'primary');
  assert.equal(second('steel').dataset.selection, 'secondary');
  assert.equal(first('fire').attributes['aria-pressed'], 'true');
  assert.equal(second('steel').attributes['aria-pressed'], 'true');
  assert.equal(first('fire').attributes['aria-label'], 'Fire: first defending type');
  assert.equal(second('steel').attributes['aria-label'], 'Steel: second defending type');
  assert.equal(first('steel').disabled, true);
  assert.equal(second('fire').disabled, true);
  assert.equal(first('none').disabled, false);
  assert.equal(second('none').disabled, false);
  assert.equal(ui.requests[0].secondaryType, 'steel');
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Fire / Steel');
  const initialRequests = ui.requests.length;
  first('steel').emit('click');
  second('fire').emit('click');
  await flush();
  assert.equal(ui.requests.length, initialRequests);
  second('grass').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).attackType, 'fire');
  assert.equal(ui.requests.at(-1).secondaryType, 'grass');
  assert.equal(second('steel').attributes['aria-pressed'], 'false');
  assert.equal(second('grass').dataset.selection, 'secondary');
  assert.equal(first('steel').disabled, false);
  assert.equal(first('grass').disabled, true);
  assert.equal(new URL(ui.location.href).searchParams.get('type2'), 'grass');
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Fire / Grass');
  ui.elements.get('#ranking-body').children[0].emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).kind, 'movesets');
  assert.equal(ui.requests.at(-1).secondaryType, 'grass');
  assert.match(ui.elements.get('#pokemon-details-settings').textContent, /^Against Fire \/ Grass/);
  ui.elements.get('#pokemon-details-close').emit('click');
  second('steel').emit('click');
  await flush();
  assert.equal(ui.requests.length, 3); // First matchup is cached separately.
  ui.elements.get('#anti-type').emit('click');
  await flush();
  assert.equal(ui.elements.get('#secondary-types-section').hidden, true);
  assert.equal(first('none').hidden, true);
  assert.equal(first('fire').attributes['aria-pressed'], 'true');
  assert.equal(first('steel').disabled, false);
  assert.equal(ui.requests.at(-1).secondaryType, null);
  assert.equal(ui.elements.get('#selected-type').textContent, 'Fire attackers');
  ui.elements.get('#anti-type').emit('click');
  await flush();
  assert.equal(second('steel').dataset.selection, 'secondary');
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Fire / Steel');
  second('none').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).secondaryType, null);
  assert.equal(new URL(ui.location.href).searchParams.has('type2'), false);
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Fire');
  assert.equal(second('none').attributes['aria-pressed'], 'true');
  first('water').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).attackType, 'water');
  assert.equal(ui.requests.at(-1).secondaryType, null);
});

test('each anti type bar can independently select None and both None show overall rankings and details', async () => {
  const ui = createUI('&mode=anti&type2=water');
  await flush();
  const first = type => ui.elements.get('#types').children.find(button => button.dataset.type === type);
  const second = type => ui.elements.get('#secondary-types').children.find(button => button.dataset.type === type);
  first('none').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).attackType, null);
  assert.equal(ui.requests.at(-1).secondaryType, 'water');
  assert.equal(first('none').attributes['aria-pressed'], 'true');
  assert.equal(second('water').attributes['aria-pressed'], 'true');
  assert.equal(second('fire').disabled, false);
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Water');
  assert.equal(new URL(ui.location.href).searchParams.get('type'), 'none');
  second('none').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).attackType, null);
  assert.equal(ui.requests.at(-1).secondaryType, null);
  assert.equal(ui.elements.get('#selected-type').textContent, 'Overall rankings');
  assert.equal(first('none').attributes['aria-pressed'], 'true');
  assert.equal(second('none').attributes['aria-pressed'], 'true');
  assert.equal(first('none').disabled, false);
  assert.equal(second('none').disabled, false);
  ui.elements.get('#ranking-body').children[0].emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).kind, 'movesets');
  assert.equal(ui.requests.at(-1).attackType, null);
  assert.equal(ui.requests.at(-1).secondaryType, null);
  assert.match(ui.elements.get('#pokemon-details-settings').textContent, /^Overall ·/);
  assert.equal(ui.elements.get('#pokemon-details-body').children.length, 4);
  ui.elements.get('#pokemon-details-close').emit('click');
  first('ground').emit('click');
  await flush();
  assert.equal(first('ground').dataset.selection, 'primary');
  assert.equal(second('ground').disabled, true);
  assert.equal(ui.elements.get('#selected-type').textContent, 'Attackers against Ground');
});

test('attack type bar remains single-select and invalid or duplicate secondary URLs are sanitized', async () => {
  const ui = createUI();
  await flush();
  const button = type => ui.elements.get('#types').children.find(button => button.dataset.type === type);
  assert.equal(button('none').hidden, true);
  button('water').emit('click');
  await flush();
  assert.equal(ui.requests.at(-1).attackType, 'water');
  assert.equal(ui.requests.at(-1).secondaryType, null);
  assert.equal(button('water').attributes['aria-pressed'], 'true');
  assert.equal(button('fire').attributes['aria-pressed'], 'false');
  for (const value of ['fire', 'invalid']) {
    const restored = createUI(`&mode=anti&type2=${value}`);
    await flush();
    assert.equal(restored.requests[0].secondaryType, null);
    assert.equal(new URL(restored.location.href).searchParams.has('type2'), false);
  }
  const overall = createUI('&mode=anti&type=none');
  await flush();
  assert.equal(overall.elements.get('#selected-type').textContent, 'Overall rankings');
  assert.equal(overall.requests[0].attackType, null);
  overall.elements.get('#anti-type').emit('click');
  await flush();
  assert.equal(overall.requests.at(-1).attackType, 'dragon');
  overall.elements.get('#anti-type').emit('click');
  await flush();
  assert.equal(overall.elements.get('#selected-type').textContent, 'Overall rankings');
  assert.equal(new URL(overall.location.href).searchParams.get('type'), 'none');
});
