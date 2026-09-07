/** Migration gate. Python is used only by this optional developer command. */
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createRaidEngine } from '../build/super_mega_raid_simulator.js';
import { PythonRandom } from '../build/random.js';
import { parse_replay_text } from '../build/battle_replay.js';
import { build_playback } from '../build/battle_playback.js';
import { createTurnBattle } from '../build/turn_battle.js';
const root = new URL('../',import.meta.url);
const catalog = JSON.parse(readFileSync(new URL('simulator/calculator_data.json',root)));
const plain = x => JSON.parse(JSON.stringify(x));
function reference(request) {
 const p=spawnSync(process.env.PYTHON || 'python', ['scripts/reference.py'],{cwd:root,input:JSON.stringify(request),encoding:'utf8',maxBuffer:40e6});
 if(p.status!==0) throw new Error(p.stderr || p.error?.message);
 return JSON.parse(p.stdout);
}
function normalizeDocument(d) {
 const copy=plain(d); for(const player of copy.players) delete player.team_text;
 if(copy.settings.random_seed!==undefined) copy.settings.random_seed=String(copy.settings.random_seed);
 return copy;
}
const completed=[];
for(const seed of [0,42,20260716,-99,'9223372036854775807','1844674407370955161601234']) {
 const r=new PythonRandom(seed);
 assert.deepEqual({random:Array.from({length:50},()=>r.random()),choices:Array.from({length:100},()=>r.choice(Array.from({length:16},(_,i)=>i)))},reference({operation:'rng',seed}));
 completed.push(`rng ${seed}`);
}
const member=['NECROZMA_DAWN_WINGS','Shadow Claw','Moongeist Beam',50,15,15,15,false,1];
const tank=['MEWTWO_ARMORED','Confusion','Psystrike',50,15,15,15,true,1];
const base={trials:1,random_seed:42,raid_difficulty:'Tier 4',boss_form_id:'STARMIE_MEGA',boss_fast_move_names:['Water Gun'],boss_charged_move_names:['Hydro Pump'],player_teams:[[member,tank],[member,tank]],friendship_multipliers:[1.1,1.07],zacian_adventure_effect:[false,false],behemoth_bash_adventure_effect:[true,false],dynamic_punch_adventure_effect:[false,true],catch_tank_team_indices:[[1],[1]],party_power_groups:[[0,1]],weather:'Rainy',battle_log_mode:'full'};
const scenarios=[];
for(const dodge_strategy of ['none','all_survivable','super_effective','non_resisted','lethal_only','downtime_saver'])
 for(const player_strategy of ['no_strategy','hot_swap_greedy','hot_swap_cautious','hot_swap_very_cautious','catch_tank'])
  scenarios.push({label:`${dodge_strategy}/${player_strategy}`,config:{...base,dodge_strategy,player_strategy},playback:dodge_strategy==='all_survivable'});
const template = createRaidEngine({...base},catalog);
for (const raid_difficulty of Object.keys(template.RAID_DIFFICULTIES)) scenarios.push({label:`raid ${raid_difficulty}`,config:{...base,raid_difficulty}});
for (const weather of [null,'Sunny/Clear','Rainy','Partly Cloudy','Cloudy','Windy','Snow','Fog']) scenarios.push({label:`weather ${weather}`,config:{...base,weather}});
const single={...base,player_teams:[[tank]],friendship_multipliers:[1],zacian_adventure_effect:[false],behemoth_bash_adventure_effect:[false],dynamic_punch_adventure_effect:[false],catch_tank_team_indices:[[]],party_power_groups:[]};
for(const random_seed of [1,42,500,'9223372036854775807']) scenarios.push({label:`hidden ${random_seed}`,config:{...single,random_seed,boss_form_id:'STARMIE',boss_fast_move_names:['Hidden Power'],raid_difficulty:'Tier 3'},playback:true});
for(const form of ['MEWTWO_MEGA_X','MEWTWO_MEGA_Y','STARMIE_MEGA','DRAGONITE_MEGA','RAICHU_MEGA_X','RAICHU_MEGA_Y','MALAMAR_MEGA','FALINKS_MEGA','SKARMORY_MEGA','VICTREEBEL_MEGA','CHESNAUGHT_MEGA','DELPHOX_MEGA','GRENINJA_MEGA']) {
 const mon=catalog.find(p=>p.form_id===form); const charged=mon.mega_charged_moves?.[0]?.name;
 if(charged) for(const level of [1,4]) scenarios.push({label:`plus ${form} L${level}`,config:{...single,player_teams:[[[form,mon.fast_moves[0].name,charged,50,15,15,15,false,level]]]}});
}
for(const form of ['GROUDON_PRIMAL','KYOGRE_PRIMAL','RAYQUAZA_MEGA','GARCHOMP_MEGA']) {
 const p=catalog.find(p=>p.form_id===form);
 scenarios.push({label:`ally ${form}`,config:{...base,catch_tank_team_indices:[[],[]],player_teams:[[member,tank],[[form,p.fast_moves[0].name,p.charged_moves[0].name,50]]]}});
}
for(const {label,config,playback} of scenarios) {
 try {
 const expected=reference({config});
 const e=createRaidEngine(config,catalog);e.validate_settings();
 const s=new e.Simulation(Object.values(e.BOSS_FAST_MOVES)[0],Object.values(e.BOSS_CHARGED_MOVES)[0],new PythonRandom(config.random_seed),undefined,undefined,undefined,undefined,undefined,undefined,undefined,true);
 const result=s.run(),text=e.render_battle_replay(s,result,config.random_seed),doc=parse_replay_text(text);
 assert.deepEqual(plain(result),expected.result,`${label}: result`);
 assert.deepEqual(plain(s.replay_actions),expected.actions,`${label}: action ordering`);
 assert.deepEqual(s.event_log,expected.log,`${label}: full event log`);
 const expectedDoc=reference({operation:'parse',text});
 // Compare the same replay text so legitimate float/list formatting differences do not mask parsing differences.
 assert.deepEqual(normalizeDocument(doc),normalizeDocument(expectedDoc),`${label}: replay parser`);
 if(playback) {
  const actual=plain(build_playback(text,catalog)),want=reference({operation:'playback',text});
  delete actual.replay;delete want.replay;
  assert.deepEqual(actual,want,`${label}: playback frames/messages`);
 }
 completed.push(label); console.log('PASS',label);
 } catch(error) { console.error('FAIL',label);throw error; }
}
const batchConfig={...single,trials:16,boss_form_id:'TOGEPI',boss_fast_move_names:[],boss_charged_move_names:[]};
const batchEngine=createRaidEngine(batchConfig,catalog);batchEngine.validate_settings();
assert.deepEqual(plain(batchEngine.aggregate_summary()),reference({operation:'batch',config:batchConfig}));completed.push('96-game batch');
const manualConfig={...single,dodge_strategy:'none',player_strategy:'no_strategy',player_teams:[[tank,tank]]};
const engine=createRaidEngine(manualConfig,catalog);
const Manual=createTurnBattle(engine).ManualSimulation;
const manual=new Manual(Object.values(engine.BOSS_FAST_MOVES)[0],Object.values(engine.BOSS_CHARGED_MOVES)[0],new PythonRandom(42));
const commands=[];
for(let i=0;i<150 && !manual.finished;i++) {
 const a=manual.availability();
 let action=i===12 && a.quit?'quit':a.rejoin?'rejoin':i===40 && a.switch_slots.length?'switch':a.dodge?'dodge':a.charged?'charged':a.fast?'fast':'wait';
 const slot=action==='switch'?a.switch_slots[0]:null;
 commands.push({tick:manual.tick,action,slot});manual.advance(action,slot,false);
 if([0,12,28,40,80,149].includes(i)) {
  const request={commands,tick:manual.tick}, want=reference({operation:'turn',config:manualConfig,request}),actual=plain(manual.snapshot());
  delete want.replay_text;delete actual.replay_text;
  assert.deepEqual(actual,want,`manual tick ${manual.tick}`);
  completed.push(`manual tick ${manual.tick}`);
 }
}
const recorded=manual.recording();
const actual=plain(build_playback(recorded,catalog)),want=reference({operation:'playback',text:recorded});delete actual.replay;delete want.replay;
assert.deepEqual(actual,want,'manual replay playback');completed.push('manual recording playback');
writeFileSync(new URL('PARITY_RESULTS.json',root),JSON.stringify({python:process.env.PYTHON||'python',checks:completed.length,passed:completed},null,2)+'\n');
console.log(`All ${completed.length} parity checks passed.`);
