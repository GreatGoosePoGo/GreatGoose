import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {calculateRankings} from '../../build/rankings.js';
const catalog=JSON.parse(readFileSync(new URL('../../simulator/calculator_data.json',import.meta.url)));
const base=catalog.find(p=>p.form_id==='MEWTWO');
const move=(type,fast=false)=>({id: type+(fast?'_FAST':''),name:type,type,power:fast?10:100,energy:fast?25:-50,duration_ms:fast?1000:2000});
const fixture=(fast,charged)=>({...base,form_id:'TEST',name:'Test',released:true,types:['psychic'],fast_moves:[fast],charged_moves:charged,exclusive_fast_moves:[],exclusive_charged_moves:[],mega_charged_moves:[]});
test('anti type checks all charged types and applies effectiveness to both moves before rounding',()=>{
 const entry=fixture(move('fire',true),[move('fire'),move('electric'),move('normal')]);
 const result=calculateRankings([entry],{attackType:'water',mode:'anti'});
 assert.equal(result.mode,'anti');assert.equal(result.candidateMovesets,3);
 assert.equal(result.rows[0].chargedMoveType,'electric');
 const attack=(base.stats.attack+15)*.79030001;
 const expected=result.assumptions.targetDefenses.reduce((sum,d)=>sum+(2*(Math.floor(.5*10*attack/d*.625)+1)+(Math.floor(.5*100*attack/d*1.6)+1))/4,0)/result.assumptions.targetDefenses.length;
 assert(Math.abs(result.rows[0].simpleDps-expected)<1e-9);
 assert.equal(calculateRankings([entry],{attackType:'water'}).rows.length,0);
 const ghost=calculateRankings([fixture(move('normal',true),[move('normal')])],{attackType:'ghost',mode:'anti'});
 const expectedGhost=ghost.assumptions.targetDefenses.reduce((sum,d)=>sum+(2*(Math.floor(.5*10*attack/d*.390625)+1)+(Math.floor(.5*100*attack/d*.390625)+1))/4,0)/ghost.assumptions.targetDefenses.length;
 assert(Math.abs(ghost.rows[0].simpleDps-expectedGhost)<1e-9);
 assert.throws(()=>calculateRankings([entry],{attackType:'water',mode:'invalid'}),/Unknown ranking mode/);
});
test('anti type Hidden Power selects a legal effective type and reports that type',()=>{
 const entry=fixture({...move('normal',true),id:'HIDDEN_POWER_FAST',name:'Hidden Power'},[move('normal')]);
 const result=calculateRankings([entry],{attackType:'grass',mode:'anti'});
 assert.equal(result.rows[0].fastMoveType,'fire');
 assert.equal(result.rows[0].fastMove,'Hidden Power (Fire)');
});
test('deployed worker accepts anti mode and ranks mixed charged types',async()=>{
 const worker=new Worker(new URL('./rankings_worker_harness.mjs',import.meta.url));
 try {
  await once(worker,'message');
  worker.postMessage({id:72,attackType:'water',mode:'anti',includeMegas:false,includeShadows:false});
  const [response]=await once(worker,'message');
  assert.equal(response.error,undefined);assert.equal(response.result.mode,'anti');
  assert(new Set(response.result.rows.map(r=>r.chargedMoveType)).size>1);
  assert.equal(new Set(response.result.rows.map(r=>r.formId)).size,response.result.rows.length);
 }finally{await worker.terminate();}
});
