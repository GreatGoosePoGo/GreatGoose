// Exercise actual turn-tab controls without a browser or external packages.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
class Element {
  constructor() {
    this.children = []; this.listeners = {}; this.attributes = {}; this.dataset = {};
    this.style = {}; this.value = ''; this.textContent = ''; this.disabled = false;
    const classes = new Set();
    this.classList = { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name),
                       contains: name => classes.has(name),
                       add: (...names) => names.forEach(name => classes.add(name)),
                       remove: (...names) => names.forEach(name => classes.delete(name)) };
  }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = value; }
  addEventListener(name, fn) { this.listeners[name] = fn; }
  async click() { return this.listeners.click?.(); }
  remove() {}
}
const member = { name: 'Mewtwo', slot: 1, hp: 190, max_hp: 192, energy: 14, max_energy: 100,
  types: ['Psychic'], fast: 'Confusion', fast_type: 'Psychic', fast_seconds: 1.5, fast_energy: 14,
  charged: 'Psystrike', charged_type: 'Psychic', charged_seconds: 2.5, charged_energy: 50 };
const reserve = { ...member, name: 'Gengar', slot: 2, fast: 'Shadow Claw', charged: 'Shadow Ball' };
const fixture = { tick: 0, elapsed: 0, remaining: 300, status: 'in_progress', seed: '42',
  boss: { name: 'Kyogre', types: ['Water'], hp: 15000, max_hp: 15000, energy: 7, max_energy: 200, incoming: 'Waterfall', hits_at: 1 },
  player: { ...member, on_field: true, busy_until: 0 }, team: [member, reserve],
  available: { fast: true, charged: false, dodge: true, quit: true, rejoin: false, switch_slots: [2] },
  log: ['Boss starts Waterfall'], replay_text: 'recording-at-turn-0', session_id: 'session',
  filename: 'battle.txt', recording_file: 'recordings/battle.txt' };
const elements = new Map([...fs.readFileSync(path.join(root, 'web/index.html'), 'utf8').matchAll(/id="([^"]+)"/g)]
  .map(match => [match[1], new Element()]));
let requests = [], exported, requestFailed = false;
const context = vm.createContext({
  document: { getElementById: id => elements.get(id), createElement: () => new Element(), body: new Element() },
  RaidSetup: { read: () => ({ boss: 'KYOGRE' }) }, ReplayMath: { healthColour: () => 'green' },
  ReplayUI: { showView() {} }, window: { confirm: () => true }, Blob,
  URL: { createObjectURL: blob => { exported = blob; return 'blob:test'; }, revokeObjectURL() {} },
  RaidClient: { request: async (url, request) => {
    if (url === 'turn/list') return [];
    requests.push({ url, request });
    let state = structuredClone(fixture);
    if (url.endsWith('/step')) state = { ...state, tick: 1, elapsed: .5, remaining: 299.5,
      player: { ...state.player, busy_until: 1.5, current_action: 'Confusion' },
      available: { fast: false, charged: false, dodge: false, quit: true, rejoin: false, switch_slots: [] },
      replay_text: 'recording-at-turn-1' };
    if (requestFailed) throw new Error('Turn failed');
    return state;
  } },
});
vm.runInContext(fs.readFileSync(path.join(root, 'web/turns.js'), 'utf8'), context);
const at = id => elements.get('turn-' + id);
(async () => {
  await at('start').click();
  assert.equal(requests[0].url, 'turn/start');
  assert.equal(at('battle').hidden, false);
  assert.equal(at('clock').textContent, '300.0s remaining');
  assert.equal(at('charged').disabled, true);
  assert.equal(at('fast').children[0].className, 'type-icon type-psychic');
  assert.equal(at('switches').children.length, 1);
  assert.equal(at('switches').children[0].disabled, false);
  await at('fast').click();
  assert.equal(requests[1].request.action, 'fast');
  assert.equal(requests[1].request.expected_tick, 0);
  assert.equal(at('clock').textContent, '299.5s remaining');
  for (const action of ['fast', 'charged', 'dodge']) assert.equal(at(action).disabled, true);
  assert.equal(at('switches').children[0].disabled, true);
  assert.equal(at('quit').disabled, false);
  assert.equal(at('wait').disabled, false);
  await at('numbers').click();
  assert.equal(elements.get('turn-view').classList.contains('turn-hide-numbers'), true);
  await at('export').click();
  assert.equal(await exported.text(), 'recording-at-turn-1');
  requestFailed = true;
  await at('wait').click();
  assert.match(at('status').textContent, /Last saved recording/);
  assert.equal(at('wait').disabled, false);
  await at('export').click();
  assert.equal(await exported.text(), 'recording-at-turn-1');
  console.log('Turn tab: one-click actions, animation lock, half-second display, export and failure recovery passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
