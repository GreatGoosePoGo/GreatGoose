import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManualRaidEngine} from '../../build/raid_engine_factory.js';
import {createTurnBattle} from '../../build/turn_battle.js';
import {TurnService} from '../../build/turn_service.js';
import {battle_config} from '../../build/website_api.js';
import {PythonRandom} from '../../build/random.js';
import {buildStrategyPlayback} from '../../build/strategy_playback.js';
const catalog=JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json',import.meta.url)));
const member={name:'MEWTWO',fast_move:'Psycho Cut',charged_move:'Hyper Beam',level:50};
const request={boss:'STARMIE',boss_fast_move:'Water Gun',boss_charged_move:'Hydro Pump',raid_difficulty:'Tier 3',random_seed:'42',players:[{team:[member,member]}]};
function make(experimentalInputs=true,glitches={}){
 const config=battle_config({...request,player_strategy:'no_strategy',dodge_strategy:'none',battle_log_mode:'full'},catalog);
 const e=createManualRaidEngine(config,catalog);
 const sim=new (createTurnBattle(e,{automaticFaints:true,experimentalInputs,glitches}).ManualSimulation)(Object.values(e.BOSS_FAST_MOVES)[0],Object.values(e.BOSS_CHARGED_MOVES)[0],new PythonRandom(e.RANDOM_SEED));
 sim.events=[];sim.pending_boss=null;return {sim,p:sim.players[0],e};
}
test('empty dodges consume recovery, cannot protect a future announcement, and repeated dodges cost time',()=>{
 const {sim,p}=make();assert(sim.availability().dodge);sim.advance('dodge');
 assert.equal(sim.input_result.outcome,'wasted');assert.equal(p.action_end,1.5);assert(!sim.availability().fast);
 sim.push(4,'boss_hit',[sim.boss_fast,new Set()]);assert(!sim.pending_boss[2].has(0));
 sim.advance();sim.advance('dodge');assert.equal(sim.input_result.outcome,'accepted');assert.equal(p.action_end,2.5);
 sim.advance();sim.advance('dodge');assert.equal(sim.input_result.outcome,'wasted');assert.equal(p.action_end,3.5);
});
test('boundary hits resolve before input, but an earlier dodge reduces damage',()=>{
 const early=make(),late=make();
 for(const {sim} of [early,late])sim.push(1,'boss_hit',[sim.boss_fast,new Set()]);
 early.sim.advance('dodge');early.sim.advance();late.sim.advance();late.sim.advance('dodge');
 assert(early.p.hp>late.p.hp);assert.equal(late.sim.input_result.outcome,'wasted');
});
test('recovery cannot cancel a move; inputs cannot cross a faint/replacement boundary',()=>{
 const {sim,p}=make();sim.advance('fast');const end=p.action_end;
 // Force a long animation to isolate recovery, then faint at the input boundary.
 p.action_end=5;sim.advance('dodge');assert.equal(sim.input_result.outcome,'unavailable');assert.equal(p.action_end,5);
 p.hp=1;sim.push(1.5,'boss_hit',[sim.boss_charged,new Set()]);sim.advance('fast');
 assert.equal(sim.input_result.outcome,'unavailable');assert.equal(p.on_field,false);
 while(sim.current_time<3)sim.advance();sim.advance('fast');
 assert.equal(p.pokemon_index,1);assert.equal(sim.input_result.outcome,'unavailable');
 assert.equal(p.action_end,3.5);assert(end>0.5);
});
test('legacy manual timing and dodge validation remain unchanged',()=>{
 const {sim}=make(false);assert(!sim.availability().dodge);assert.throws(()=>sim.act('dodge'),/Cannot dodge/);
 sim.advance('fast');assert.equal(sim.players[0].action_start,0);
});
test('experimental recordings preserve wasted dodges and deterministic restore/playback',async()=>{
 let saved;const service=new TurnService(catalog,async r=>{saved=r;},{automaticFaints:true,experimentalInputs:true});
 let b=await service.start(request);
 for(let i=0;i<28;i++)b=await service.update({session_id:b.session_id,expected_tick:b.tick,action:i<5?'dodge':b.available.fast?'fast':'wait'});
 assert.match(b.replay_text,/Experimental inputs: true/);assert.match(b.replay_text,/protects against no new hit/);
 const replay=buildStrategyPlayback(b.replay_text,catalog);
 assert.deepEqual(replay.warnings,[]);const last=replay.frames.at(-1);
 assert.equal(last.boss_hp,b.boss.hp);assert.equal(last.players[0].hp,b.player.hp);assert.equal(last.players[0].energy,b.player.energy);
 const restored=await new TurnService(catalog,undefined,{automaticFaints:true,experimentalInputs:true}).restore(saved);
 assert.equal(restored.replay_text,b.replay_text);
});
