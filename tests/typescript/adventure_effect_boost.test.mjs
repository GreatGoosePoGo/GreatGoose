import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {battle_config} from '../../build/website_api.js';
import {createRaidEngine} from '../../build/super_mega_raid_simulator.js';
import {parse_replay_text} from '../../build/battle_replay.js';
import {build_playback} from '../../build/battle_playback.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const team = [{name: 'MEWTWO', fast_move: 'Confusion', charged_move: 'Psystrike', level: 50}];
const request = {boss: 'STARMIE', boss_fast_move: 'Water Gun', boss_charged_move: 'Hydro Pump',
  raid_difficulty: 'Tier 3', random_seed: '42', dodge_strategy: 'none', player_strategy: 'no_strategy',
  players: [{team, zacian_adventure_effect: true}, {team, behemoth_bash_adventure_effect: true}, {team}]};

test('Adventure Effect percentage defaults to 10 and scales only enabled player effects', () => {
  const normal = createRaidEngine(battle_config(request, catalog), catalog);
  const boosted = createRaidEngine(battle_config({...request, adventure_effect_boost_percent: 40}, catalog), catalog);
  assert.equal(normal.ADVENTURE_EFFECT_BOOST_PERCENT, 10);
  assert.equal(boosted.ADVENTURE_EFFECT_BOOST_PERCENT, 40);
  const a = normal.createSimulation(), b = boosted.createSimulation();
  const fast = a.players[0].pokemon.fast_move;
  const bossMove = Object.values(normal.BOSS_CHARGED_MOVES)[0];
  const neutralDamage = a.outgoing_damage(fast, 2);
  assert.equal(b.outgoing_damage(fast, 2), neutralDamage);
  assert(b.outgoing_damage(fast, 0) > a.outgoing_damage(fast, 0));
  assert.equal(b.outgoing_damage(fast, 0), boosted.pokemon_go_damage(fast.power,
    b.players[0].pokemon.effective_attack, (catalog.find(p => p.form_id === 'STARMIE').stats.defense + 15) * boosted.BOSS_CPM,
    boosted.type_effectiveness(fast.move_type, boosted.BOSS_TYPES) * 1.2 * 1.4));
  assert(b.incoming_damage(bossMove, 1, b.players[1], false) < a.incoming_damage(bossMove, 1, a.players[1], false));
  assert.equal(b.incoming_damage(bossMove, 2, b.players[2], false), a.incoming_damage(bossMove, 2, a.players[2], false));
  assert.equal(b.player_defense_multiplier(1), 1.4);
});

test('Dynamic Punch+ retains its fixed 15% Mega bonus at every selected percentage', () => {
  for (const percent of [5, 10, 15, 20, 25, 30, 35, 40]) {
    const config = battle_config({...request, boss: 'STARMIE_MEGA', raid_difficulty: 'Mega',
      adventure_effect_boost_percent: percent, players: [{team, dynamic_punch_adventure_effect: true}, {team}]}, catalog);
    const engine = createRaidEngine(config, catalog);
    const sim = engine.createSimulation();
    const move = sim.players[0].pokemon.fast_move;
    const defense = (catalog.find(p => p.form_id === 'STARMIE_MEGA').stats.defense + 15) * engine.BOSS_CPM;
    assert.equal(sim.outgoing_damage(move, 0), engine.pokemon_go_damage(move.power,
      sim.players[0].pokemon.effective_attack, defense,
      engine.type_effectiveness(move.move_type, engine.BOSS_TYPES) * 1.2 * 1.15));
    assert(sim.outgoing_damage(move, 0) > sim.outgoing_damage(move, 1));
  }
});

test('invalid Adventure Effect percentages fail at the API and direct engine boundary', () => {
  const config = battle_config(request, catalog);
  for (const value of [-5, 101, NaN, Infinity, true, '40', null]) {
    assert.throws(() => battle_config({...request, adventure_effect_boost_percent: value}, catalog), /Adventure Effect boost/);
    assert.throws(() => createRaidEngine({...config, adventure_effect_boost_percent: value}, catalog), /Adventure Effect boost/);
  }
});

test('exported replay records the percentage and playback applies it', () => {
  const engine = createRaidEngine(battle_config({...request, adventure_effect_boost_percent: 35}, catalog), catalog);
  const sim = engine.createSimulation({detailed: true});
  const result = sim.run();
  const text = engine.render_battle_replay(sim, result, engine.RANDOM_SEED);
  assert.match(text, /Adventure Effect boost: 35%/);
  assert.equal(parse_replay_text(text).settings.adventure_effect_boost_percent, 35);

  const timeline = 'Raid: Tier 3\nBoss: STARMIE; fast=Water Gun; charged=Hydro Pump\n'
    + 'Teams:\np1: Mewtwo / Confusion / Psystrike / L50 / 15-15-15\n'
    + 'Zacian effects: p1=true\nAdventure Effect boost: 40%\n'
    + 'Move codes: co=Confusion\nEvents:\nt0p1:co\n+0b:f\n+5p1:co\n';
  const boosted = build_playback(timeline, catalog);
  const normal = build_playback(timeline.replace('40%', '10%'), catalog);
  assert(boosted.frames.at(-1).boss_hp < normal.frames.at(-1).boss_hp);
  assert.equal(parse_replay_text(timeline.replace('Adventure Effect boost: 40%\n', '')).settings.adventure_effect_boost_percent, undefined);
  assert.throws(() => parse_replay_text(timeline.replace('40%', '400%')), /Adventure Effect boost/);
});

test('raid selector sends its percentage and restores new and older shared setups', () => {
  const html = readFileSync(new URL('../../apps/raids/index.html', import.meta.url), 'utf8');
  const app = readFileSync(new URL('../../apps/raids/app.js', import.meta.url), 'utf8');
  const elements = new Map();
  for (const [, id, content] of html.matchAll(/<select id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options = [...content.matchAll(/<option([^>]*)>([^<]*)<\/option>/g)].map(([, attrs, text]) => ({
      value: attrs.match(/value="([^"]*)"/)?.[1] ?? text, selected: /\bselected\b/.test(attrs),
    }));
    elements.set(`#${id}`, {options, value: (options.find(option => option.selected) ?? options[0])?.value ?? ''});
  }
  const boost = elements.get('#adventure-effect-boost');
  assert.equal(boost.value, '10');
  assert.deepEqual(boost.options.map(option => option.value), ['5', '10', '15', '20', '25', '30', '35', '40']);
  elements.set('#boss-fast-move', {options: [{value: 'Water Gun'}], value: 'Water Gun'});
  elements.set('#boss-charged-move', {options: [{value: 'Hydro Pump'}], value: 'Hydro Pump'});
  elements.set('#random-seed', {value: '42'});
  const bossInput = {pokemonSearch: {selectById() {}}};
  const simulations = {value: '1'};
  const context = vm.createContext({
    document: {querySelector: selector => elements.get(selector)},
    bossInput, bossFastSelect: elements.get('#boss-fast-move'), bossChargedSelect: elements.get('#boss-charged-move'),
    raidDifficultySelect: elements.get('#raid-difficulty'), movesetModeSelect: elements.get('#boss-moveset-mode'),
    playerStrategySelect: elements.get('#player-strategy'), purifiedGemsSelect: elements.get('#purified-gems'),
    simulationCountInput: simulations, playersElement: {replaceChildren() {}},
    pokemonForInput: () => ({form_id: 'STARMIE'}), byId: new Map([['STARMIE', {}]]),
    playerSections: () => [{querySelectorAll: () => [{}]}], playerSettings: () => ({f: '1', a: 'none', p: '0'}),
    codeConfigForRow() {}, PokemonCode: {encode: () => 'test-code', decode: () => ({})},
    playersPayload: () => [], addPlayer() {}, updateBossMoves() {}, updatePurifiedGems() {},
    updatePlayerStrategy() {}, updateSimulationScope() {},
    TextEncoder, TextDecoder, Uint8Array, URL,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    atob: value => Buffer.from(value, 'base64').toString('binary'),
  });
  vm.runInContext(readFileSync(new URL('../../apps/raids/share.js', import.meta.url), 'utf8'), context);
  const selectsStart = app.indexOf('const SHARE_SELECTS =');
  vm.runInContext(app.slice(selectsStart, app.indexOf('};', selectsStart) + 2)
    + app.slice(app.indexOf('function selectValue('), app.indexOf('function setupFromLocation('))
    + app.slice(app.indexOf('function battlePayload('), app.indexOf('globalThis.RaidSetup =')), context);
  boost.value = '35';
  const state = context.RaidShareCodec.decode(context.RaidShareCodec.encode(context.shareState()));
  assert.equal(state.o.ab, 35);
  boost.value = '10';
  context.applySharedSetup(state);
  assert.equal(boost.value, '35');
  assert.equal(context.battlePayload().adventure_effect_boost_percent, 35);
  delete state.o.ab;
  context.applySharedSetup(state);
  assert.equal(boost.value, '10');
});
