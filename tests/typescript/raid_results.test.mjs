import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../../apps/raids/index.html', import.meta.url), 'utf8');
const source = readFileSync(new URL('../../apps/raids/app.js', import.meta.url), 'utf8');
const renderer = source.slice(source.indexOf('function showResult('), source.indexOf('form.addEventListener("submit"'));

function setup() {
  const element = () => ({
    hidden: false, textContent: '', children: [], open: false,
    classList: {toggle() {}}, scrollIntoView() {},
    append(...nodes) { this.children.push(...nodes); },
    replaceChildren(...nodes) { this.children = nodes; },
  });
  const elements = new Map([...html.matchAll(/id="([^"]+)"/g)].map(([, id]) => [`#${id}`, element()]));
  const buttons = [elements.get('#open-generated-replay'), elements.get('#download-generated-replay')];
  let replay;
  const context = vm.createContext({
    document: {
      querySelector: selector => elements.get(selector),
      querySelectorAll: () => buttons,
      createElement: element,
    },
    ReplayUI: {setGeneratedReplay(text) { replay = text; }},
    pokemonForInput: () => ({form_id: 'STARMIE'}), bossInput: {},
  });
  vm.runInContext(renderer, context);
  return {show: result => context.showResult(result), at: id => elements.get(`#${id}`), buttons, replay: () => replay};
}

const row = {
  fast_move: 'Water Gun', charged_move: 'Hydro Pump', games: 2, wins: 1, win_percent: 50,
  average_win_time: 100, average_boss_hp_on_loss: 300,
  average_faints: 2, average_rejoins: 0, average_retreats: 0, average_catch_tanks: 0, average_purified_gems: 0,
};
const batch = {
  mode: 'batch', random_seed: '42', total_battles: 8, total_wins: 4, win_percent: 50,
  movesets: [row, {...row, charged_move: 'Psychic', games: 6, wins: 3,
    average_win_time: 200, average_boss_hp_on_loss: 900, average_faints: 4, average_retreats: 2, average_rejoins: 2}],
};
const single = {
  mode: 'single', won: true, finish_time: 120, boss_hp: 0, faints: 7,
  retreats: 3, rejoins: 1, catch_tanks: 0, purified_gems_used: 0,
  random_seed: '10', log: ['old battle log'], battle_log_mode: 'full', replay_text: 'old replay',
};

test('batch results weight win, loss and battle averages by their matching counts', () => {
  const ui = setup();
  ui.show(batch);
  assert.equal(ui.at('batch-win-rate').textContent, '50.0%');
  assert.equal(ui.at('batch-wins').textContent, '4 / 8');
  assert.equal(ui.at('batch-losses').textContent, '4 lost');
  assert.equal(ui.at('batch-win-time').textContent, '175.0s');
  assert.equal(ui.at('batch-boss-hp').textContent, '750');
  assert.equal(ui.at('batch-faints').textContent, '3.5');
  assert.equal(ui.at('batch-retreats').textContent, '1.5');
  assert.equal(ui.at('batch-rejoins').textContent, '1.5');
  assert.equal(ui.at('batch-catch-tanks-stat').hidden, true);
  assert.equal(ui.at('result-time').textContent, '8 battles across 2 boss movesets');
  assert.equal(ui.at('batch-rows').children.length, 2);
  assert.equal(ui.at('batch-rows').children[1].children[2].textContent, '3 / 6');
  assert.deepEqual(Array.from(ui.at('batch-rows').children[0].children.slice(6), cell => cell.textContent), ['2.0', '0.0', '0.0']);
  assert.deepEqual(Array.from(ui.at('batch-rows').children[1].children.slice(6), cell => cell.textContent), ['4.0', '2.0', '2.0']);
});

test('all-win and all-loss batches show unavailable averages as a dash', () => {
  const ui = setup();
  ui.show({...batch, total_battles: 2, total_wins: 2, win_percent: 100,
    movesets: [{...row, wins: 2, win_percent: 100, average_boss_hp_on_loss: 0}]});
  assert.equal(ui.at('batch-boss-hp').textContent, '—');
  assert.equal(ui.at('batch-rows').children[0].children[5].textContent, '—');
  assert.equal(ui.at('result-time').textContent, '2 battles across 1 boss moveset');
  ui.show({...batch, total_battles: 2, total_wins: 0, win_percent: 0,
    movesets: [{...row, wins: 0, win_percent: 0, average_win_time: null, average_retreats: 1.5,
      average_catch_tanks: 1, average_purified_gems: 8}]});
  assert.equal(ui.at('batch-win-time').textContent, '—');
  assert.equal(ui.at('batch-rows').children[0].children[4].textContent, '—');
  assert.equal(ui.at('batch-retreats').textContent, '1.5');
  assert.equal(ui.at('batch-catch-tanks').textContent, '1.0');
  assert.equal(ui.at('batch-catch-tanks-stat').hidden, false);
  assert.doesNotMatch(html, /purified-gems-used|Purified Gems used/);
  assert.doesNotMatch(renderer, /purified_gems_used|average_purified_gems/);
});

test('switching between single and batch results hides stale counters and clears old replay data', () => {
  const ui = setup();
  ui.show(single);
  assert.equal(ui.at('faints').textContent, 7);
  assert.equal(ui.replay(), 'old replay');
  ui.at('battle-log-details').open = true;
  ui.show(batch);
  assert.equal(ui.at('single-result-stats').hidden, true);
  assert.equal(ui.at('batch-result').hidden, false);
  assert(ui.buttons.every(button => button.hidden));
  assert.equal(ui.at('battle-log-details').hidden, true);
  assert.equal(ui.at('battle-log-details').open, false);
  assert.equal(ui.at('battle-log').textContent, '');
  assert.equal(ui.replay(), '');
  ui.show({...single, faints: 2, replay_text: 'new replay'});
  assert.equal(ui.at('single-result-stats').hidden, false);
  assert.equal(ui.at('batch-result').hidden, true);
  assert(ui.buttons.every(button => !button.hidden));
  assert.equal(ui.at('faints').textContent, 2);
  assert.equal(ui.at('battle-log-details').hidden, false);
  assert.equal(ui.replay(), 'new replay');
  // Author display:grid rules otherwise override the browser's default [hidden] styling.
  const css = readFileSync(new URL('../../apps/raids/styles.css', import.meta.url), 'utf8');
  assert.match(css, /\.result\s+\[hidden\]\s*\{\s*display:\s*none\s*;/);
});
