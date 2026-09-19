import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {PracticeController, installBattleGestures} from '../../apps/raids/practice/controller.js';

function snapshot(extra = {}) {
  return {session_id:'test',tick:0,status:'in_progress',seed:'42',
    boss:{incoming:'Hit',hits_at:2}, player:{slot:1,faints:0,in_lobby:false},
    available:{fast:true,charged:false,dodge:true,switch_slots:[2]}, ...extra};
}
function harness() {
  const calls = [], timers = new Map(); let time = 0, sequence = 0, state = snapshot(), handler;
  const errors = [];
  const controller = new PracticeController({
    request: async (method, payload) => {
      calls.push({method,payload});
      if (handler) return handler(method,payload);
      if (method.endsWith('/start')) state = snapshot();
      else state = {...state,tick:state.tick+1,status:method.endsWith('/stop')?'stopped':state.status};
      return structuredClone(state);
    }, error: error => errors.push(error), now:()=>time,
    schedule:(fn,delay)=>{const id=++sequence;timers.set(id,{fn,delay});return id;},cancel:id=>timers.delete(id),
  });
  return {controller,calls,timers,errors,setTime:value=>time=value,setHandler:value=>handler=value};
}
test('practice clock advances without player input, pause freezes and resume resets its deadline',async()=>{
  const h=harness(),c=h.controller;await c.start({random_seed:null});
  assert.equal(c.setup.random_seed,'42');assert(c.running);assert.equal(h.timers.size,1);
  h.setTime(500);await c.tick();assert.equal(h.calls.at(-1).payload.action,'wait');assert.equal(c.battle.tick,1);
  c.pause();assert.equal(h.timers.size,0);await c.tick();assert.equal(c.battle.tick,1);
  h.setTime(10000);c.resume();assert.equal(c.deadline,10500);await c.tick();assert.equal(c.battle.tick,2);
});
test('ready inputs target the next turn; recovery inputs expire after 250ms and newest wins',async()=>{
  const h=harness(),c=h.controller;await c.start({});
  c.queue('fast');h.setTime(500);await c.tick();assert.equal(h.calls.at(-1).payload.action,'fast');
  c.battle.available.fast=false;c.queue('fast');h.setTime(1000);await c.tick();
  assert.equal(h.calls.at(-1).payload.action,'wait');assert.equal(c.pending,null);
  h.setTime(1300);c.queue('fast');c.queue('dodge');h.setTime(1500);await c.tick();
  assert.equal(h.calls.at(-1).payload.action,'dodge');assert.equal(c.pending,null);
  c.repeatFast=true;c.battle.available.fast=true;h.setTime(2000);await c.tick();
  assert.equal(h.calls.at(-1).payload.action,'fast');
});
test('recovery buffering scales with slow motion and pause discards pending inputs',async()=>{
  const h=harness(),c=h.controller;await c.start({});c.setSpeed(.5);
  c.battle.available.fast=false;h.setTime(600);c.queue('fast');h.setTime(1000);await c.tick();
  assert.equal(h.calls.at(-1).payload.action,'fast');
  c.queue('fast');c.pause();assert.equal(c.pending,null);
});
test('slow or failed worker never creates overlapping or runaway ticks',async()=>{
  const h=harness(),c=h.controller;await c.start({});let release;
  h.setHandler(()=>new Promise(resolve=>release=resolve));
  const step=c.tick();await c.tick();assert.equal(h.calls.length,2);
  c.pause();release(snapshot({tick:1}));await step;assert(!c.running);assert.equal(h.timers.size,0);
  c.resume();h.setHandler(()=>{throw new Error('worker stopped');});await c.tick();assert(!c.running);assert.equal(h.errors.at(-1).message,'worker stopped');
  h.setHandler(undefined);c.resume();h.setTime(c.deadline+1500);await c.tick();assert(!c.running);assert.match(h.errors.at(-1).message,/fell behind/);
});
test('faint clears old queued inputs and completed raids cannot resume',async()=>{
  const h=harness(),c=h.controller;await c.start({});c.queue('charged');
  h.setHandler(async()=>snapshot({tick:1,player:{slot:1,faints:1,in_lobby:false}}));await c.tick();assert.equal(c.pending,null);
  h.setHandler(async()=>snapshot({tick:2,status:'victory'}));await c.tick();assert(!c.running);c.resume();assert(!c.running);
});
test('retry retains the accepted seed and stop preserves an exportable snapshot',async()=>{
  const h=harness(),c=h.controller;await c.start({boss:'STARMIE'});await c.tick();
  await c.start(c.setup);assert.equal(h.calls.at(-1).payload.random_seed,'42');assert.equal(c.battle.tick,0);
  await c.end();assert.equal(c.battle.status,'stopped');assert(!c.running);assert.equal(h.timers.size,0);
});
test('practice worker handles solo combat, switch, full faint, rejoin, timeout, deterministic retry and replay',async()=>{
 const worker=new Worker(new URL('./worker_harness.mjs',import.meta.url));
 try {
  await once(worker,'message');let id=0;
  const call=async(method,payload={})=>{const response=once(worker,'message');worker.postMessage({id:++id,method,payload});const [r]=await response;if(r.error)throw new Error(r.error);return r.result;};
  const member={name:'MEWTWO',fast_move:'Confusion',charged_move:'Psystrike',level:50};
  const request={boss:'STARMIE',boss_fast_move:'Water Gun',boss_charged_move:'Hydro Pump',raid_difficulty:'Tier 3',random_seed:'42',players:[{team:[member,member],party_group:1},{team:[member],party_group:1}]};
  let b=await call('practice/start',request);assert.equal(b.boss.max_energy,100);
  const first=b; const steps=[];
  const step=async(action='wait',slot=null)=>{b=await call('practice/step',{session_id:b.session_id,expected_tick:b.tick,action,slot});steps.push({action,slot});return b;};
  await step('fast');assert(b.player.energy>=0);
  await assert.rejects(call('practice/step',{session_id:b.session_id,expected_tick:0,action:'fast'}),/already advanced/);
  while(!b.available.switch_slots.includes(2))await step();
  await step('switch',2);assert.equal(b.player.slot,2);
  await step('quit');assert(b.player.in_lobby);
  while(!b.available.rejoin)await step();
  await step('rejoin');assert(b.player.on_field);assert.equal(b.player.rejoins,1);
  const beforeRetry=b;
  b=await call('practice/start',request);const recorded=[...steps];steps.length=0;
  for(const command of recorded)await step(command.action,command.slot);
  assert.equal(b.boss.hp,beforeRetry.boss.hp);assert.equal(b.player.hp,beforeRetry.player.hp);assert.equal(b.elapsed,beforeRetry.elapsed);
  const replay=await call('replay/parse',{text:b.replay_text});assert.equal(replay.players.length,1);
  const playback=await call('replay/playback',{text:b.replay_text});assert(playback);
  // Start with slot 2: a faint must return to the first survivor, not the next index.
  b=await call('practice/start',{...request,players:[{team:[{...member,level:10},{...member,level:10}]}]});
  await step('switch',2);
  while(b.player.on_field) await step();
  const faintTime=b.elapsed, replacementTime=b.player.fainting_until;
  assert.equal(replacementTime,faintTime+2);
  assert.equal(b.player.next_slot,1);
  assert.deepEqual(b.available.switch_slots,[]);
  await step('switch',1);assert.equal(b.input_result.outcome,'unavailable');
  await step('fast');assert.equal(b.input_result.outcome,'unavailable');
  while(b.elapsed<replacementTime){
    await step();
    if(b.elapsed<replacementTime) assert.equal(b.player.on_field,false);
  }
  assert.equal(b.elapsed,replacementTime);assert.equal(b.player.slot,1);assert(b.player.on_field);
  assert(b.available.fast,'no extra switch delay after two-second faint animation');
  await step('fast');
  for(let i=0;i<4;i++) await step();
  const afterFaintReplay=await call('replay/playback',{text:b.replay_text});
  assert.deepEqual(afterFaintReplay.warnings,[]);
  const frame=afterFaintReplay.frames.at(-1);
  assert.equal(frame.boss_hp,b.boss.hp);assert.equal(frame.players[0].hp,b.player.hp);
  assert.equal(frame.players[0].energy,b.player.energy);
  while(b.player.on_field) await step();
  assert.equal(b.player.next_slot,null);
  const lobbyTime=b.player.fainting_until;
  while(b.elapsed<lobbyTime){await step();if(b.elapsed<lobbyTime) assert(!b.player.in_lobby);}
  assert(b.player.in_lobby);assert.equal(b.player.faints,2);assert.deepEqual(b.available.switch_slots,[]);
  while(b.status==='in_progress')await step();assert.equal(b.status,'time_expired');assert.equal(b.remaining,0);
  await assert.rejects(step(),/already ended/);
  b=await call('practice/start',{...request,raid_difficulty:'Tier 1'});
  while(b.status==='in_progress'){
    const action=b.available.charged?'charged':b.available.fast?'fast':b.available.rejoin?'rejoin':'wait';
    await step(action,action==='switch'?b.available.switch_slots[0]:null);
  }
  assert.equal(b.status,'victory');assert.equal(b.boss.hp,0);
  b=await call('practice/start',request);
  const dodged=await step('dodge');
  b=await call('practice/start',request);
  const undodged=await step();
  assert.equal(dodged.player.hp,undodged.player.hp,'a swipe on the impact turn cannot dodge a hit retroactively');
  assert.equal(dodged.input_result.outcome,'wasted');
  assert.equal(first.tick,0);
 }finally{await worker.terminate();}
});


test('pointer gestures distinguish all swipe directions, taps, controls, cancellation and multitouch',()=>{
 const handlers=new Map(),actions=[];let enabled=true;
 const surface={addEventListener:(type,fn)=>handlers.set(type,fn),setPointerCapture:()=>{}};
 installBattleGestures(surface,{enabled:()=>enabled,tap:()=>actions.push('fast'),swipe:()=>actions.push('dodge')});
 const fire=(type,x,y,extra={})=>handlers.get(type)?.({pointerId:1,isPrimary:true,button:0,clientX:x,clientY:y,target:{closest:()=>null},preventDefault:()=>{},...extra});
 fire('pointerdown',100,100);fire('pointerup',102,101);assert.deepEqual(actions,['fast']);
 for(const [dx,dy] of [[60,0],[-60,0],[0,60],[0,-60]]){
  actions.length=0;fire('pointerdown',100,100);fire('pointermove',100+dx,100+dy);fire('pointermove',100,100);fire('pointerup',100,100);
  assert.deepEqual(actions,['dodge'],'swipe fires once and never becomes a tap on release');
 }
 actions.length=0;fire('pointerdown',100,100);fire('pointercancel',100,100);fire('pointerup',100,100);assert.deepEqual(actions,[]);
 fire('pointerdown',100,100,{target:{closest:()=>({})}});fire('pointerup',100,100);assert.deepEqual(actions,[]);
 fire('pointerdown',100,100);fire('pointerdown',110,110,{pointerId:2,isPrimary:false});fire('pointerup',100,100);assert.deepEqual(actions,[]);
 enabled=false;fire('pointerdown',100,100);fire('pointerup',100,100);assert.deepEqual(actions,[]);
});

test('realistic mode refuses pause, slow motion and auto attacks; catches up real time with waits',async()=>{
 const h=harness(),c=h.controller;c.repeatFast=true;c.speed=.5;
 await c.start({realistic:true});assert.equal(c.speed,1);assert.equal(c.repeatFast,false);
 c.pause();assert(c.running);c.setSpeed(.5);assert.equal(c.speed,1);
 c.repeatFast=true;h.setTime(500);await c.tick();assert.equal(h.calls.at(-1).payload.action,'wait');
 c.queue('fast');h.setTime(3000);await c.tick();
 assert.equal(c.battle.tick,6);assert.equal(c.pending,null);assert(c.running);
 assert(h.calls.slice(1).every(call=>call.payload.action==='wait'),'background catch-up cannot replay queued attacks');
 const deadline=c.deadline;c.resume();assert.equal(c.deadline,deadline,'settings cannot reset real time');
 c.queue('fast');h.setTime(3500);await c.tick();assert.equal(h.calls.at(-1).payload.action,'fast');
 await c.end();assert.equal(c.battle.status,'stopped');assert(!c.running);
 await c.start({realistic:false});c.pause();assert(!c.running);c.setSpeed(.5);assert.equal(c.speed,.5);
});

test('realistic catch-up yields in bounded batches and stops at the battle endpoint',async()=>{
 const h=harness(),c=h.controller;await c.start({realistic:true});h.setTime(60000);
 await c.tick();assert.equal(c.battle.tick,20);assert(c.running);assert.equal(h.timers.size,1);
 h.setHandler(async()=>snapshot({tick:21,status:'time_expired'}));await c.tick();
 assert.equal(c.battle.tick,21);assert(!c.running);assert.equal(h.timers.size,0);
});

test('inputs received after a delayed clock boundary cannot be backdated',async()=>{
 const h=harness(),c=h.controller;await c.start({});h.setTime(600);c.queue('dodge');
 await c.tick();assert.equal(h.calls.at(-1).payload.action,'wait');assert.equal(c.pending.action,'dodge');
 h.setTime(1000);await c.tick();assert.equal(h.calls.at(-1).payload.action,'dodge');
});
