import test from 'node:test';
import assert from 'node:assert/strict';
import {BattleFeedback} from '../../apps/raids/practice/feedback.js';
const state=(extra={})=>({session_id:'s',tick:0,status:'in_progress',boss:{},
 player:{slot:1,on_field:true,hp:100,energy:0,charged_energy:100,faints:0,...extra}});
test('feedback cues follow accepted actions, readiness, defeat and victory; catch-up is silent',()=>{
 const f=new BattleFeedback(),played=[];f.play=name=>played.push(name);
 f.observe(state());f.observe(state(),'fast');assert.deepEqual(played,['fast']);
 f.observe(state({energy:100}));assert.equal(played.at(-1),'ready');
 f.observe(state({energy:100}));assert.equal(played.filter(x=>x==='ready').length,1);
 f.observe(state({faints:1,lobby_phase:'defeated',hp:0,on_field:false}));assert.equal(played.at(-1),'defeated');
 const count=played.length;f.observe(state({faints:1,lobby_phase:'defeated',hp:0,on_field:false}));assert.equal(played.length,count);
 f.observe(state(),'charged',true);assert.equal(played.length,count);
 f.observe({...state(),status:'victory'});assert.equal(played.at(-1),'victory');
});
test('vibration is opt-in, mute is independent, and unsupported audio cannot break gameplay',()=>{
 let visible=true;const vibrations=[];
 const f=new BattleFeedback({audio:()=>{throw new Error('not supported');},vibrate:p=>vibrations.push(p),visible:()=>visible});
 f.unlock();f.play('charged');assert.deepEqual(vibrations,[]);
 f.configure({sound:false,haptics:true});vibrations.length=0;f.play('charged');assert.deepEqual(vibrations,[35]);
 visible=false;f.play('hit');assert.deepEqual(vibrations,[35]);
 f.configure({haptics:false});assert.equal(vibrations.at(-1),0);
 visible=true;const count=vibrations.length;f.play('victory');assert.equal(vibrations.length,count);
});

test('unavailable buffered actions do not play an attack cue; wasted dodges still do',()=>{
 const f=new BattleFeedback(),played=[];f.play=name=>played.push(name);f.observe(state());
 f.observe({...state(),input_result:{action:'fast',outcome:'unavailable'}},'fast');assert.deepEqual(played,[]);
 f.observe({...state(),input_result:{action:'dodge',outcome:'wasted'}},'dodge');assert.deepEqual(played,['dodge']);
});
