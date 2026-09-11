import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRaidEngine } from '../../build/super_mega_raid_simulator.js';
import { PythonRandom } from '../../build/random.js';
import { parse_replay_text } from '../../build/battle_replay.js';
import { build_playback } from '../../build/battle_playback.js';
import { run_simulations,battle_config,freshId,freshSeed } from '../../build/website_api.js';
import { TurnService } from '../../build/turn_service.js';
import { literal,seconds_to_tick } from '../../build/text.js';
const catalog=JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json',import.meta.url)));
const request={boss:'STARMIE',boss_fast_move:'Hidden Power',boss_charged_move:'Hydro Pump',raid_difficulty:'Tier 3',team:[{name:'MEWTWO',fast_move:'Confusion',charged_move:'Psystrike',level:50}],random_seed:'9223372036854775807'};
const preamble='Raid: Tier 4\nBoss: STARMIE_MEGA; fast=Water Gun; charged=Hydro Pump\nTeams:\np1: Armored Mewtwo / Confusion / Psystrike / L50 / 15-15-15\nMove codes: co=Confusion; ps=Psystrike\nEvents:\n';
test('single and batch browser API preserve 63-bit seeds and Hidden Power',()=>{
 const first=run_simulations(request,catalog),second=run_simulations(request,catalog);
 assert.deepEqual(first,second);assert.equal(first.random_seed,request.random_seed);
 assert(!['Normal','Fairy'].includes(first.boss_fast_type));
 const playback=build_playback(first.replay_text,catalog);
 assert.equal(playback.source,'verified_simulation');assert.deepEqual(playback.warnings,[]);
 const batch=run_simulations({...request,simulation_count:16},catalog);
 assert.equal(batch.total_battles,16);
 const types=batch.movesets[0].hidden_power_types;
 assert.equal(Object.values(types).reduce((a,b)=>a+b),16);assert(Object.keys(types).length>1);
});
test('engines and simulations have independent state and configurations',()=>{
 const a=createRaidEngine(battle_config(request,catalog),catalog);
 const b=createRaidEngine(battle_config({...request,boss:'KYOGRE',boss_fast_move:'Waterfall',raid_difficulty:'Tier 5'},catalog),catalog);
 assert.equal(a.BOSS_HP,3600);assert.equal(b.BOSS_HP,15000);
 const make=e=>new e.Simulation(Object.values(e.BOSS_FAST_MOVES)[0],Object.values(e.BOSS_CHARGED_MOVES)[0],new PythonRandom(42));
 const one=make(a),two=make(a);one.players[0].energy=100;
 assert.equal(two.players[0].energy,0);assert.notEqual(one.players[0],two.players[0]);
 one.run();assert.equal(two.boss_hp,3600);
 assert.equal(a.BOSS_FAST_MOVES['Hidden Power'].move_type,'Normal');
});
test('Shadow enrage uses exact additive stats and Purified Gems obey raid limits',()=>{
 const team=[['Mewtwo','Confusion','Psystrike',50,15,15,15,false,1]];
 const config={
  raid_difficulty:'Tier 5 Shadow',boss_form_id:'STARMIE',
  boss_manual_profile:{name:'Test Shadow Boss',attack:100,defense:100,types:['Normal']},
  boss_fast_move_names:['Water Gun'],boss_charged_move_names:['Hydro Pump'],
  player_teams:[team,team],friendship_multipliers:[1,1],
  zacian_adventure_effect:[false,false],behemoth_bash_adventure_effect:[false,false],
  dynamic_punch_adventure_effect:[false,false],catch_tank_team_indices:[[],[]],
  use_purified_gems:false,battle_log_mode:'full',random_seed:42,
 };
 const engine=createRaidEngine(config,catalog);
 const sim=engine.createSimulation({detailed:true});
 const player=sim.players[0];
 const move=player.pokemon.fast_move;
 const baseDefense=(100+15)*engine.BOSS_CPM;
 const shadowDefense=baseDefense*engine.SHADOW_BOSS_DEFENSE_MULTIPLIER;
 const modifier=engine.type_effectiveness(move.move_type,engine.BOSS_TYPES)*1.2;
 assert.equal(engine.SHADOW_RAID,true);
 assert.equal(engine.SHADOW_BOSS_ATTACK_MULTIPLIER,1.2);
 assert.equal(engine.SHADOW_BOSS_DEFENSE_MULTIPLIER,5/6);
 assert.equal(sim.outgoing_damage(move,0),engine.pokemon_go_damage(move.power,player.pokemon.effective_attack,shadowDefense,modifier));
 const bossMove=Object.values(engine.BOSS_FAST_MOVES)[0];
 const baseAttack=(100+15)*engine.BOSS_CPM;
 assert.equal(sim.incoming_damage(bossMove,0,player,false),engine.pokemon_go_damage(bossMove.power,baseAttack*engine.SHADOW_BOSS_ATTACK_MULTIPLIER,player.pokemon.effective_defense,1));
 sim.enraged=true;
 const enragedDefense=(baseDefense+Math.floor(baseDefense*engine.SHADOW_ENRAGE_DEFENSE_BONUS))*engine.SHADOW_BOSS_DEFENSE_MULTIPLIER;
 assert.equal(sim.outgoing_damage(move,0),engine.pokemon_go_damage(move.power,player.pokemon.effective_attack,enragedDefense,modifier));
 const enragedAttack=(baseAttack+Math.floor(baseAttack*0.8))*engine.SHADOW_BOSS_ATTACK_MULTIPLIER;
 assert.equal(sim.incoming_damage(bossMove,0,player,false),engine.pokemon_go_damage(bossMove.power,enragedAttack,player.pokemon.effective_defense,1));

 sim.enraged=false;sim.boss_hp=engine.ENRAGE_HP;sim.current_time=10;sim.update_enrage_state();
 assert.equal(sim.enraged,true);
 assert.throws(()=>sim.use_purified_gem(10,99,true));
 for(const id of [0,1]) sim.use_purified_gem(10,id,true);
 assert.throws(()=>sim.use_purified_gem(14.5,0,true),/5-second cooldown/);
 for(const time of [15,20,25]) for(const id of [0,1]) sim.use_purified_gem(time,id,true);
 assert.equal(sim.purified_gems_used,8);assert.equal(sim.shadow_subdued,true);assert.equal(sim.enraged,false);
 assert.deepEqual(sim.players.map(p=>p.purified_gems_used),[4,4]);
 const result=new engine.TrialResult(false,25,sim.boss_hp,0,0,0,0,0,8);
 const replay=engine.render_battle_replay(sim,result,42);
 const parsed=parse_replay_text(replay);
 assert.equal(parsed.settings.use_purified_gems,false);
 assert.equal(parsed.events.filter(event=>event.kind==='gem').reduce((total,event)=>total+event.players.length,0),8);

 const soloEngine=createRaidEngine({...config,player_teams:[team],friendship_multipliers:[1],zacian_adventure_effect:[false],behemoth_bash_adventure_effect:[false],dynamic_punch_adventure_effect:[false],catch_tank_team_indices:[[]]},catalog);
 const solo=soloEngine.createSimulation();solo.boss_hp=soloEngine.ENRAGE_HP;solo.update_enrage_state();
 for(const time of [0,5,10,15,20]) solo.use_purified_gem(time,0,true);
 assert.equal(solo.purified_gems_used,5);assert.equal(solo.enraged,true);assert.equal(solo.shadow_subdued,false);
 assert.throws(()=>solo.use_purified_gem(25,0,true),/at most 5/);

 const attackers=Array(6).fill(['NECROZMA_DAWN_WINGS','Shadow Claw','Moongeist Beam',50,15,15,15,false,1]);
 const autoEngine=createRaidEngine({...config,boss_manual_profile:null,player_teams:[attackers,attackers],friendship_multipliers:[1.1,1.1],use_purified_gems:true},catalog);
 const automatic=autoEngine.createSimulation({detailed:true});const automaticResult=automatic.run();
 const gemActions=automatic.replay_actions.filter(action=>action[4]==='gem');
 assert.equal(automaticResult.purified_gems_used,8);assert.equal(automatic.shadow_subdued,true);
 assert.equal(gemActions.length,8);assert.deepEqual(automatic.players.map(player=>player.purified_gems_used),[4,4]);
 for(const playerId of [0,1]) {
  const ticks=gemActions.filter(action=>action[3]===playerId).map(action=>action[0]);
  assert.equal(ticks.length,4);
  for(let index=1;index<ticks.length;index++) assert(ticks[index]-ticks[index-1]>=10);
 }
});
test('replay timestamps, legacy tuples, and malformed input are safe',()=>{
 assert.equal(seconds_to_tick('1.500000000000000000000',1),3);
 for(const invalid of ['0.25','1.50000000000000000001','9999999999999999999999']) assert.throws(()=>seconds_to_tick(invalid,1));
 assert.deepEqual(literal("[('Mewtwo', True, None, 50.5)]"),[['Mewtwo',true,null,50.5]]);
 assert.throws(()=>literal("__import__('os').system('anything')"));
 assert.throws(()=>literal('['.repeat(100)+'0'+']'.repeat(100)),/nesting/);
 assert.throws(()=>parse_replay_text(preamble+'+0p1:co'),/absolute/);
 assert.throws(()=>parse_replay_text(preamble+'t0p2:co'),/undefined p2/);
 assert.throws(()=>parse_replay_text(preamble+'t0p1:r2'),/Party presets/);
 assert.throws(()=>parse_replay_text(preamble+'t0p1:s2'),/only has 1/);
 assert.equal(parse_replay_text(preamble+'t0p1:g').events[0].kind,'gem');
 assert.throws(()=>build_playback(preamble+'t0p1:ps',catalog),/needs 50 energy/);
 assert.throws(()=>build_playback(preamble+'t0p1:q\n+1p1:s1',catalog),/must rejoin/);
 const frame=build_playback(preamble+'t0p1:co\n+0b:f',catalog).frames.at(-1);
 assert.equal(frame.boss_hp,8993);assert.equal(frame.boss_energy,8);assert.equal(frame.players[0].energy,15);
});
test('application boundary rejects invalid inputs before starting calculations',()=>{
 for(const simulation_count of [0,101,1.5,true,NaN]) assert.throws(()=>battle_config({...request,simulation_count},catalog));
 for(const random_seed of ['1.5','9223372036854775808','-1',9007199254740992]) assert.throws(()=>battle_config({...request,random_seed},catalog));
 assert.throws(()=>battle_config({...request,team:[{...request.team[0],fast_move:'Water Gun'}]},catalog),/legal moves/);
 assert.throws(()=>battle_config({...request,boss:'MEW',boss_fast_move:'Pound',boss_charged_move:'Psychic',boss_moveset_mode:'all',simulation_count:2},catalog),/limit is 500/);
 assert.throws(()=>run_simulations({...request,zacian_adventure_effect:true,behemoth_bash_adventure_effect:true},catalog),/Only one Adventure Effect/);
});
test('calculator accepts multiple player teams and preserves legacy single-team requests',()=>{
 const secondTeam=[{name:'GROUDON_PRIMAL',fast_move:'Mud Shot',charged_move:'Precipice Blades',level:50}];
 const multiplayer={...request,team:undefined,players:[{team:request.team},{team:secondTeam}],random_seed:42};
 const config=battle_config(multiplayer,catalog);
 assert.equal(config.player_teams.length,2);
 assert.deepEqual(config.friendship_multipliers,[1,1]);
 assert.deepEqual(config.catch_tank_team_indices,[[],[]]);
 const result=run_simulations(multiplayer,catalog);
 assert.equal(parse_replay_text(result.replay_text).players.length,2);
 assert.equal(battle_config(request,catalog).player_teams.length,1);
 assert.throws(()=>battle_config({...request,team:undefined,players:[]},catalog),/between 1 and 20 players/);
 assert.throws(()=>battle_config({...request,team:undefined,players:Array.from({length:21},()=>({team:request.team}))},catalog),/between 1 and 20 players/);
 assert.throws(()=>battle_config({...request,team:undefined,player_strategy:'catch_tank',players:[{team:[{...request.team[0],catch_tank:true}]}]},catalog),/normal attacker/);
});
test('browser IDs and seeds work when crypto.randomUUID is unavailable',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'crypto');
 const getRandomValues=globalThis.crypto?.getRandomValues?.bind(globalThis.crypto);
 Object.defineProperty(globalThis,'crypto',{configurable:true,value:getRandomValues?{getRandomValues}:undefined});
 try {
  assert.match(freshId(),/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(freshSeed(),/^\d+$/);
 } finally {
  if(descriptor) Object.defineProperty(globalThis,'crypto',descriptor);
  else delete globalThis.crypto;
 }
});
test('accepted manual turns persist, restore, reject stale steps, and roll back failed saves',async()=>{
 const saved=new Map();let rejectSave=false;
 const service=new TurnService(catalog,async record=>{if(rejectSave)throw new Error('Save failed');saved.set(record.id,structuredClone(record));});
 const start=await service.start({...request,random_seed:42});
 const step=await service.update({session_id:start.session_id,expected_tick:0,action:'fast'});
 assert.equal(step.tick,1);assert.equal(saved.get(start.session_id).revision,1);
 await assert.rejects(service.update({session_id:start.session_id,expected_tick:0,action:'wait'}),/already advanced/);
 rejectSave=true;
 await assert.rejects(service.update({session_id:start.session_id,expected_tick:1,action:'wait'}),/Save failed/);
 assert.equal(saved.get(start.session_id).tick,1);
 rejectSave=false;
 const next=await service.update({session_id:start.session_id,expected_tick:1,action:'wait'});assert.equal(next.tick,2);
 const restored=await new TurnService(catalog).restore(saved.get(start.session_id));
 assert.deepEqual(restored,next);
 const stopped=await service.update({session_id:start.session_id,expected_tick:2},true);
 assert.equal(stopped.status,'stopped');
 assert.equal(build_playback(stopped.replay_text,catalog).duration_ticks,2);
});
