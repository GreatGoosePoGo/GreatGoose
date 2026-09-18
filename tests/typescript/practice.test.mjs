import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {PracticeController} from '../../apps/raids/practice/controller.js';

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
test('one queued action waits for recovery, replaces old input, and precedes repeated fast attacks',async()=>{
  const h=harness(),c=h.controller;await c.start({});c.repeatFast=true;
  c.battle.available.fast=false;c.queue('fast');c.queue('charged');await c.tick();
  assert.equal(h.calls.at(-1).payload.action,'wait');assert.equal(c.pending.action,'charged');
  c.battle.available.charged=true;await c.tick();assert.equal(h.calls.at(-1).payload.action,'charged');assert.equal(c.pending,null);
  await c.tick();assert.equal(h.calls.at(-1).payload.action,'fast');
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
  // Let a low-level team faint, then rejoin. The boss and clock keep going.
  b=await call('practice/start',{...request,players:[{team:[{...member,level:10},{...member,level:10}]}]});
  while(b.status==='in_progress'&&!b.player.in_lobby){
    const slot=b.available.switch_slots[0];await step(!b.player.on_field&&slot?'switch':'wait',!b.player.on_field&&slot?slot:null);
  }
  assert(b.player.in_lobby);assert(b.player.faints>=2);
  while(b.status==='in_progress')await step();assert.equal(b.status,'time_expired');assert.equal(b.remaining,0);
  await assert.rejects(step(),/already ended/);
  b=await call('practice/start',{...request,raid_difficulty:'Tier 1'});
  while(b.status==='in_progress'){
    const action=b.available.charged?'charged':b.available.fast?'fast':b.available.rejoin?'rejoin':!b.player.on_field&&b.available.switch_slots.length?'switch':'wait';
    await step(action,action==='switch'?b.available.switch_slots[0]:null);
  }
  assert.equal(b.status,'victory');assert.equal(b.boss.hp,0);
  b=await call('practice/start',request);
  const dodged=await step('dodge');
  b=await call('practice/start',request);
  const undodged=await step();
  assert(dodged.player.hp>undodged.player.hp,'manual dodge reduces the incoming hit');
  assert.equal(first.tick,0);
 }finally{await worker.terminate();}
});
