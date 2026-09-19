import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createManualRaidEngine} from '../../build/raid_engine_factory.js';
import {createTurnBattle} from '../../build/turn_battle.js';
import {TurnService} from '../../build/turn_service.js';
import {battle_config} from '../../build/website_api.js';
import {PythonRandom} from '../../build/random.js';
import {practiceGlitches} from '../../build/practice_glitches.js';
import {buildStrategyPlayback} from '../../build/strategy_playback.js';
import {PracticeController} from '../../apps/raids/practice/controller.js';

const catalog = JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json', import.meta.url)));
const member = {name:'MEWTWO',fast_move:'Psycho Cut',charged_move:'Hyper Beam',level:50};
const request = {boss:'STARMIE',boss_fast_move:'Water Gun',boss_charged_move:'Hydro Pump',
  raid_difficulty:'Tier 3',random_seed:'42',rejoin_time:2,players:[{team:[member,member]}]};
function make(glitches = {}, quiet = true) {
  const config = battle_config({...request, player_strategy:'no_strategy',dodge_strategy:'none',battle_log_mode:'full'},catalog);
  const e = createManualRaidEngine(config,catalog);
  const sim = new (createTurnBattle(e,{automaticFaints:true,glitches,rejoinTimeDistribution:config.rejoin_time_distribution}).ManualSimulation)(
    Object.values(e.BOSS_FAST_MOVES)[0],Object.values(e.BOSS_CHARGED_MOVES)[0],new PythonRandom(e.RANDOM_SEED));
  if (quiet) {sim.events=[];sim.pending_boss=null;}
  return {sim,e,p:sim.players[0]};
}
function until(sim,time) {while(sim.current_time<time)sim.advance('wait',null,false);}

test('glitches default off; probability accepts 0 and 1 and rejects malformed values',()=>{
  assert.deepEqual(practiceGlitches(),{phantom_relobby:false,phantom_chance:.25,rejoin_snipe:false,
    energy_resolve:false,switch_charge_freeze:false,remote_lag:false});
  for(const value of [-1,1.01,NaN,Infinity,'0.25',null])assert.throws(()=>practiceGlitches({phantom_chance:value}),/between 0 and 1/);
  assert.throws(()=>practiceGlitches({remote_lag:'false'}),/on or off/);
});

test('phantom relobby ejects healed teams on every failed attempt without recording actual faints',()=>{
  const {sim,p}=make({phantom_relobby:true,phantom_chance:1,remote_lag:true});
  p.team[1].hp=0;sim.act('quit');assert.equal(sim.rejoin_at,3);
  for(let attempt=1;attempt<=2;attempt++){
    until(sim,sim.rejoin_at);sim.advance('rejoin');
    assert.equal(sim.lobby,true);assert.equal(p.rejoins,attempt);assert.equal(p.faints,0);
    assert.equal(sim.snapshot().player.lobby_message,'All your Pokémon have fainted');
    assert(p.team.every(m=>m.hp===m.max_hp));assert.equal(sim.availability().fast,false);
    assert.equal(sim.rejoin_at,attempt*3+3);
  }
  const normal=make({phantom_relobby:true,phantom_chance:0});
  normal.sim.act('quit');until(normal.sim,normal.sim.rejoin_at);normal.sim.advance('rejoin');
  assert(normal.p.on_field);assert(!normal.sim.lobby);assert.equal(normal.sim.lobby_message,null);
});

test('remote lag adds exactly one second per voluntary and forced lobby, without changing faint delay',()=>{
  for(const remote_lag of [false,true]){
    const {sim,p}=make({remote_lag});sim.act('quit');assert.equal(sim.rejoin_at,2+Number(remote_lag));
    until(sim,sim.rejoin_at);sim.act('rejoin');
    p.team.forEach(m=>m.hp=0);sim.switch(sim.current_time,0,false);
    const faintTime=sim.current_time;assert.equal(sim.faint_until,faintTime+2);
    until(sim,faintTime+2);assert(sim.lobby);assert.equal(sim.rejoin_at,sim.current_time+2+Number(remote_lag));
  }
});

test('rejoin snipe locks every escape until a charged hit; fast animations and disabled setting do not',()=>{
  for(const [enabled,charged] of [[true,true],[true,false],[false,true]]){
    const {sim,p}=make({rejoin_snipe:enabled});sim.act('quit');until(sim,sim.rejoin_at);
    const hitTime=sim.current_time+2,move=charged?sim.boss_charged:sim.boss_fast;
    sim.push(hitTime,'boss_hit',[move,new Set()]);sim.act('rejoin');
    const hp=p.hp;
    if(enabled&&charged){
      assert.equal(sim.lag_until,hitTime);
      for(const action of ['fast','charged','dodge','quit'])assert.equal(sim.availability()[action],false,action);
      assert.deepEqual(sim.availability().switch_slots,[]);
      assert.throws(()=>sim.act('dodge'),/Cannot dodge/);assert.throws(()=>sim.act('quit'),/Cannot quit/);
      const damage=sim.incoming_damage(move,0,p,false);
      until(sim,hitTime);assert.equal(p.hp,hp-damage);assert(sim.availability().fast);
    }else{assert(sim.availability().dodge);sim.act('dodge');assert.equal(sim.lag_until,0);}
  }
});

test('switch freeze blocks only charged attacks for the first actionable turn, including energy from a hit',()=>{
  for(const enabled of [false,true]){
    const {sim,p}=make({switch_charge_freeze:enabled});p.team[1].energy=99;
    sim.act('switch',2);sim.push(.5,'boss_hit',[sim.boss_fast,new Set()]);until(sim,1);
    assert.equal(p.energy,100);assert(sim.availability().fast);
    assert.equal(sim.availability().charged,!enabled);
    if(enabled)assert.throws(()=>sim.act('charged'),/Cannot charged/);
    sim.advance();assert(sim.availability().charged);
    // Automatic replacements have no ordinary switch animation, but still freeze charge for one turn.
    p.hp=0;p.team[0].energy=100;sim.switch(sim.current_time,0,false);until(sim,sim.faint_until);
    assert(sim.availability().fast);assert.equal(sim.availability().charged,!enabled);
    sim.advance();assert(sim.availability().charged);
  }
});

test('late energy plus a queued one-turn fast move forces one extra fast before a 100-energy charged move',async()=>{
  for(const enabled of [false,true]){
    const {sim,p}=make({energy_resolve:enabled});
    assert.equal(p.pokemon.fast_move.duration,.5);assert.equal(p.pokemon.charged_move.energy,100);
    p.energy=100-p.pokemon.fast_move.energy;
    const c=new PracticeController({request:async(method,payload)=>sim.advance(payload.action,payload.slot),schedule:()=>0,cancel:()=>{}});
    c.battle={...sim.snapshot(),session_id:'test'};c.running=true;c.deadline=0;c.now=()=>0;
    c.queue('fast');await c.tick();
    assert.equal(c.battle.available.charged,!enabled);
    // A player queues another fast while the energy is still missing; without the bug the charge is ready.
    c.queue(c.battle.available.charged?'charged':'fast');await c.tick();
    assert.equal(p.fast_moves_used,enabled?2:1);
    if(enabled){assert.equal(p.energy,100);c.queue('charged');await c.tick();assert(p.action_is_charged);}
    c.pause();
  }
});

test('delayed energy respects cap, stays with its Pokémon after a switch, and cannot leak through a relobby',()=>{
  const {sim,p}=make({energy_resolve:true});p.energy=99;sim.advance('fast');assert.equal(p.energy,99);
  sim.advance('switch',2);assert.equal(p.team[0].energy,100);assert.equal(p.energy,0);
  const other=make({energy_resolve:true});other.sim.advance('fast');other.sim.act('quit');
  until(other.sim,other.sim.rejoin_at);other.sim.act('rejoin');assert.equal(other.p.energy,0);
});

test('glitch settings survive reconstruction and seeded retries, stay isolated, and exported playback matches',async()=>{
  let saved;
  const service=new TurnService(catalog,async value=>{saved=value;},{automaticFaints:true});
  const settings={phantom_relobby:true,phantom_chance:.25,energy_resolve:true,rejoin_snipe:true,switch_charge_freeze:true,remote_lag:true};
  const actions=[];
  let b=await service.start({...request,practice_glitches:settings});
  const step=async(action='wait',slot=null)=>{
    b=await service.update({session_id:b.session_id,expected_tick:b.tick,action,slot});actions.push({action,slot});
  };
  // Natural battle, with both fast energy and several rejoin rolls.
  for(let i=0;i<180&&b.status==='in_progress';i++){
    const action=b.available.rejoin?'rejoin':i%30===1&&b.available.quit?'quit':
      b.available.charged?'charged':b.available.fast?'fast':'wait';
    await step(action);
  }
  const expected=b,exported=b.replay_text;
  assert.match(exported,/Phantom relobby/);
  assert(b.player.rejoins>1);
  const restored=await new TurnService(catalog,undefined,{automaticFaints:true}).restore(saved);
  assert.equal(restored.replay_text,exported);assert.deepEqual(restored.glitches,settings);
  const playback=buildStrategyPlayback(exported,catalog),frame=playback.frames.at(-1);
  assert.deepEqual(playback.warnings,[]);assert.equal(frame.boss_hp,b.boss.hp);
  assert.equal(frame.players[0].hp,b.player.hp);assert.equal(frame.players[0].energy,b.player.energy);
  assert.deepEqual(frame.players[0].team.map(m=>({...m})),b.team.map(({hp,energy})=>({hp,energy})));
  b=await service.start({...request,practice_glitches:settings});
  for(const {action,slot} of [...actions])await step(action,slot);
  assert.equal(b.replay_text,expected.replay_text);
  const normal=await service.start(request);assert.equal(normal.glitches.energy_resolve,false);
  const manual=await new TurnService(catalog).start({...request,practice_glitches:settings});
  assert.equal(manual.glitches.energy_resolve,false);
});

test('actual team wipe shows defeat for exactly the existing two seconds, then a distinct lobby',()=>{
 const {sim,p}=make();p.team.forEach(m=>m.hp=0);sim.switch(0,0,false);
 assert.equal(sim.snapshot().player.lobby_phase,'defeated');
 assert.equal(sim.snapshot().player.lobby_transition_until,2);
 for(let turn=1;turn<=3;turn++){
   sim.advance();assert.equal(sim.snapshot().player.lobby_phase,'defeated');assert(!sim.availability().rejoin);
 }
 sim.advance();assert.equal(sim.current_time,2);assert.equal(sim.snapshot().player.lobby_phase,'lobby');
 assert.equal(sim.rejoin_at,4);assert.equal(sim.lobby_reason,'fainted');
 until(sim,4);sim.advance('rejoin');assert.equal(sim.snapshot().player.lobby_phase,null);
});

test('phantom penalty is a two-second defeat screen, not another full healing delay; remote adds one',()=>{
 for(const remote_lag of [false,true]){
  const {sim,p}=make({phantom_relobby:true,phantom_chance:1,remote_lag});
  sim.act('quit');until(sim,sim.rejoin_at);const rejoinedAt=sim.current_time;sim.act('rejoin');
  assert.equal(sim.snapshot().player.lobby_phase,'defeated');assert(p.team.every(m=>m.hp===m.max_hp));
  assert.equal(sim.rejoin_at,rejoinedAt+2+Number(remote_lag));
  until(sim,rejoinedAt+1.5);assert.equal(sim.snapshot().player.lobby_phase,'defeated');assert(!sim.availability().rejoin);
  sim.advance();assert.equal(sim.snapshot().player.lobby_phase,'lobby');assert.equal(sim.availability().rejoin,!remote_lag);
  until(sim,sim.rejoin_at);assert(sim.availability().rejoin);
 }
});
