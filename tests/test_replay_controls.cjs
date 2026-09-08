// Exercise the real replay scripts with small document/clock test doubles.
// No browser or external JavaScript packages are required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const built = spawnSync(process.execPath, ['--input-type=module', '-e', `
import {readFileSync} from 'node:fs';
import {build_playback} from './build/battle_playback.js';
const source=readFileSync('apps/raids/replay.js','utf8');
const example=source.match(/const replayExample = \\x60([\\s\\S]*?)\\x60;/)[1];
console.log(JSON.stringify(build_playback(example,JSON.parse(readFileSync('simulator/calculator_data.json','utf8')))));
`], { cwd: root, encoding: 'utf8' });
assert.equal(built.status, 0, built.stderr);
const fixture = JSON.parse(built.stdout);
const styles = fs.readFileSync(path.join(root, 'apps/raids/styles.css'), 'utf8');
assert.match(styles, /\.battle-stage\s*\{[^}]*overflow:\s*hidden;/s);
assert.doesNotMatch(styles, /\.battle-stage\s*\{[^}]*overflow:\s*auto;/s);
assert.match(styles, /\.type-fairy\s*\{\s*background-position:\s*-112px\s+-50\.061px;/);
assert.match(styles, /\.type-psychic\s*\{\s*background-position:\s*-28px\s+-78\.061px;/);

class Element {
  constructor() {
    this.children = []; this.listeners = {}; this.style = {}; this.dataset = {};
    this.attributes = {}; this.textContent = ''; this.value = ''; this.hidden = false;
    const classes = new Set();
    this.classList = { toggle(name, enabled) {
      if (enabled) classes.add(name); else classes.delete(name);
    }, contains(name) { return classes.has(name); },
    add(...names) { names.forEach(name => classes.add(name)); },
    remove(...names) { names.forEach(name => classes.delete(name)); } };
  }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
  setAttribute(key, value) { this.attributes[key] = value; }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  async emit(type) { for (const fn of this.listeners[type] || []) await fn({ target: this }); }
  scrollIntoView() { this.scrolled = true; }
  focus() {}
}

function setup({ renderer = true, status = 200, protocol = 'http:', replaySource = null } = {}) {
  const elements = new Map();
  for (const match of fs.readFileSync(path.join(root, 'apps/raids/index.html'), 'utf8').matchAll(/id="([^"]+)"/g)) {
    elements.set('#' + match[1], new Element());
  }
  elements.get('#playback-speed').value = '1';
  elements.get('#playback-panel').hidden = true;
  const document = {
    querySelector: selector => elements.get(selector) || null,
    querySelectorAll: () => [], createElement: () => new Element(),
    addEventListener() {}, hidden: false,
  };
  let callback = null;
  const context = vm.createContext({
    document, window: { location: { protocol }, scrollTo() {} }, TextDecoder, Uint8Array,
    performance: { now: () => 0 },
    requestAnimationFrame: fn => { callback = fn; return 1; },
    cancelAnimationFrame: () => { callback = null; },
    RaidClient: { request: async () => { if (status !== 200) throw new Error('Local worker failed'); return structuredClone(fixture); } },
  });
  if (renderer) vm.runInContext(fs.readFileSync(path.join(root, 'apps/raids/playback.js'), 'utf8'), context);
  vm.runInContext(replaySource || fs.readFileSync(path.join(root, 'apps/raids/replay.js'), 'utf8'), context);
  return { context, elements, advance: ms => { if (callback) callback(ms); } };
}

(async () => {
  if (process.env.LEGACY_REPLAY_JS) {
    const stale = setup({ replaySource: fs.readFileSync(process.env.LEGACY_REPLAY_JS, 'utf8') });
    assert.equal(stale.elements.get('#load-playback').listeners.click, undefined);
    console.log('Reproduced stale-script failure: the Load button has no click handler.');
  }
  const run = setup();
  const at = id => run.elements.get('#' + id);
  await at('insert-replay-example').emit('click');
  assert.equal(at('playback-panel').hidden, false);
  assert.equal(at('playback-panel').scrolled, true);
  assert.equal(at('playback-players').children.length, 2);
  assert.equal(at('playback-boss').children.length, 1);
  assert.equal(at('playback-play').textContent, 'Pause');
  run.advance(500);
  assert.equal(at('playback-clock').textContent, '299.5s');
  assert.equal(at('playback-seek').value, '1');
  const bossCard = at('playback-boss').children[0];
  const bossTypes = bossCard.children[2].children[1];
  assert.equal(bossTypes.children.length, 2);
  assert.equal(bossTypes.children[0].className, 'type-icon type-water');
  const playerSprite = at('playback-players').children[0].children[1].children[1];
  assert.equal(at('playback-players').children[0].children[2].children[1].children.length, 2);
  assert.match(
    at('playback-players').children[0].children[8].textContent,
    /^Party Power \d+\/18(?: · Next charged damage ×2)?$/,
  );
  fixture.frames[0].players[0].party_power = true;
  fixture.frames[0].players[0].party_power_progress = 7;
  const queued = setup();
  await queued.elements.get('#insert-replay-example').emit('click');
  assert.equal(
    queued.elements.get('#playback-players').children[0].children[8].textContent,
    'Party Power 7/18 · Next charged damage ×2',
  );
  fixture.frames[0].players[0].party_power = false;
  assert.notEqual(bossCard.children[5].textContent, '9,000 / 9,000 HP');
  at('playback-seek').value = '6';
  await at('playback-seek').emit('input');
  assert.equal(playerSprite.classList.contains('sprite-swapping'), true);
  at('playback-seek').value = '12';
  await at('playback-seek').emit('input');
  assert.equal(playerSprite.classList.contains('sprite-leaving'), true);
  at('playback-seek').value = '0';
  await at('playback-seek').emit('input');
  assert.equal(playerSprite.classList.contains('sprite-entering'), true);
  assert.equal(at('playback-play').textContent, 'Play');
  assert.equal(at('playback-clock').textContent, '300.0s');
  assert.equal(at('playback-numbers').textContent, 'Hide HP & energy numbers');
  await at('playback-numbers').emit('click');
  assert.equal(at('playback-panel').classList.contains('numbers-hidden'), true);
  assert.equal(at('playback-numbers').textContent, 'Show HP & energy numbers');
  assert.equal(at('playback-numbers').attributes['aria-pressed'], 'true');
  await at('playback-numbers').emit('click');
  assert.equal(at('playback-panel').classList.contains('numbers-hidden'), false);

  const missing = setup({ renderer: false });
  await missing.elements.get('#load-playback').emit('click');
  assert.match(missing.elements.get('#replay-status').textContent, /player did not load/);
  assert.equal(missing.elements.get('#load-playback').disabled, false);

  const legacy = setup({ status: 404 });
  legacy.elements.get('#replay-text').value = 'replay';
  await legacy.elements.get('#load-playback').emit('click');
  assert.match(legacy.elements.get('#replay-status').textContent, /Local worker failed/);

  const local = setup({ protocol: 'file:' });
  await local.elements.get('#load-playback').emit('click');
  assert.match(local.elements.get('#replay-status').textContent, /localhost:8000/);

  const windows = setup();
  const bytes = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from('Raid: Tier 4', 'utf16le')]);
  windows.elements.get('#replay-file').files = [{ name: 'battle.txt', size: bytes.length,
    arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }];
  await windows.elements.get('#replay-file').emit('change');
  assert.equal(windows.elements.get('#replay-text').value, 'Raid: Tier 4');
  console.log('Replay controls, type icons, sprite fades, HP update, half-second clock, errors and Windows file decoding: passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
