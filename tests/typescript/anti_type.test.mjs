import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
import {calculateRankings, calculatePokemonMovesets} from '../../build/rankings.js';
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
  worker.postMessage({id:72,attackType:'water',secondaryType:'flying',mode:'anti',includeMegas:false,includeShadows:false});
  const [response]=await once(worker,'message');
  assert.equal(response.error,undefined);assert.equal(response.result.mode,'anti');
  assert.equal(response.result.secondaryType,'flying');
  assert(new Set(response.result.rows.map(r=>r.chargedMoveType)).size>1);
  assert.equal(new Set(response.result.rows.map(r=>r.formId)).size,response.result.rows.length);
  const best=response.result.rows.find(row=>row.formId==='MEWTWO');
  const detailsResponse=once(worker,'message');
  worker.postMessage({id:73,kind:'movesets',formId:'MEWTWO',attackType:'water',secondaryType:'flying',mode:'anti'});
  const [details]=await detailsResponse;
  assert.equal(details.error,undefined);
  assert.equal(details.result.secondaryType,'flying');
  const detailed=details.result.rows.find(row=>row.fastMove===best.fastMove&&row.chargedMove===best.chargedMove);
  for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(detailed[metric],best[metric]);
 }finally{await worker.terminate();}
});

test('dual anti types multiply each fast and charged effectiveness before damage rounding', () => {
 const scenarios = [
  {types:['grass','steel'],fast:'fire',charged:'fire',fastMultiplier:1.6*1.6,chargedMultiplier:1.6*1.6},
  {types:['water','grass'],fast:'fire',charged:'electric',fastMultiplier:.625*1.6,chargedMultiplier:1.6*.625},
  {types:['normal','ghost'],fast:'fighting',charged:'ground',fastMultiplier:1.6*.390625,chargedMultiplier:1},
  {types:['dragon','fairy'],fast:'dragon',charged:'poison',fastMultiplier:1.6*.390625,chargedMultiplier:1.6},
  {types:['flying','steel'],fast:'ground',charged:'psychic',fastMultiplier:.390625*1.6,chargedMultiplier:.625},
  {types:['rock','steel'],fast:'normal',charged:'normal',fastMultiplier:.625*.625,chargedMultiplier:.625*.625},
  {types:['dark','steel'],fast:'psychic',charged:'psychic',fastMultiplier:.390625*.625,chargedMultiplier:.390625*.625},
 ];
 const attack=(base.stats.attack+15)*.79030001;
 for(const scenario of scenarios){
  const entry=fixture(move(scenario.fast,true),[move(scenario.charged)]);
  const settings={attackType:scenario.types[0],secondaryType:scenario.types[1],mode:'anti'};
  const result=calculateRankings([entry],settings);
  const row=result.rows[0];
  const fastStab=scenario.fast==='psychic'?1.2:1;
  const chargedStab=scenario.charged==='psychic'?1.2:1;
  const expected=result.assumptions.targetDefenses.reduce((sum,defense)=>{
   const fastDamage=Math.floor(.5*10*attack/defense*fastStab*scenario.fastMultiplier)+1;
   const chargedDamage=Math.floor(.5*100*attack/defense*chargedStab*scenario.chargedMultiplier)+1;
   return sum+(2*fastDamage+chargedDamage)/4;
  },0)/result.assumptions.targetDefenses.length;
  assert(Math.abs(row.simpleDps-expected)<1e-9,scenario.types.join('/'));
  const reversed=calculateRankings([entry],{...settings,attackType:settings.secondaryType,secondaryType:settings.attackType});
  for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(row[metric],reversed.rows[0][metric]);
  const details=calculatePokemonMovesets([entry],settings,{formId:'TEST',shadow:false});
  for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(row[metric],details.rows[0][metric]);
 }
});

test('second anti type changes Hidden Power choice and is ignored in attack mode', () => {
 const entry=fixture({...move('normal',true),id:'HIDDEN_POWER_FAST',name:'Hidden Power'},[move('fire')]);
 const dual=calculateRankings([entry],{attackType:'water',secondaryType:'flying',mode:'anti'});
 assert.equal(dual.rows[0].fastMoveType,'electric');
 const details=calculatePokemonMovesets([entry],{attackType:'water',secondaryType:'flying',mode:'anti'},{formId:'TEST',shadow:false});
 assert.equal(details.rows.length,16);
 const electric=details.rows.find(row=>row.fastMoveType==='electric');
 for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(electric[metric],dual.rows[0][metric]);
 const settings={attackType:'fire',mode:'attack'};
 assert.deepEqual(calculateRankings([entry],{...settings,secondaryType:'water'}),calculateRankings([entry],settings));
 const single={attackType:'fire',mode:'anti'};
 assert.deepEqual(calculateRankings([entry],{...single,secondaryType:'fire'}),calculateRankings([entry],single));
 assert.throws(()=>calculateRankings([entry],{...single,secondaryType:'invalid'}),/Unknown secondary defending type/);
});

test('both None evaluate all move types with neutral effectiveness and either type slot can stand alone', () => {
 const entry=fixture(move('fire',true),[move('electric'),move('normal')]);
 const settings={attackType:null,secondaryType:null,mode:'anti'};
 const details=calculatePokemonMovesets([entry],settings,{formId:'TEST',shadow:false});
 assert.equal(details.rows.length,2);
 assert.equal(details.attackType,null);
 assert.equal(details.secondaryType,null);
 const attack=(base.stats.attack+15)*.79030001;
 const expected=details.assumptions.targetDefenses.reduce((sum,defense)=>{
  const fastDamage=Math.floor(.5*10*attack/defense)+1;
  const chargedDamage=Math.floor(.5*100*attack/defense)+1;
  return sum+(2*fastDamage+chargedDamage)/4;
 },0)/details.assumptions.targetDefenses.length;
 for(const row of details.rows)assert(Math.abs(row.simpleDps-expected)<1e-9);
 const overall=calculateRankings([entry],settings);
 assert.equal(overall.candidateMovesets,2);
 const detailed=details.rows.find(row=>row.chargedMove===overall.rows[0].chargedMove);
 for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(overall.rows[0][metric],detailed[metric]);
 const first=calculateRankings([entry],{...settings,attackType:'water'});
 const second=calculateRankings([entry],{...settings,secondaryType:'water'});
 assert.deepEqual(first.rows,second.rows);
 assert.throws(()=>calculateRankings([entry],{attackType:null,mode:'attack'}),/Unknown ranking type/);
});

test('overall Hidden Power preserves STAB and worker supports neutral rankings and details', async () => {
 const entry=fixture({...move('normal',true),id:'HIDDEN_POWER_FAST',name:'Hidden Power'},[move('normal')]);
 const overall=calculateRankings([entry],{attackType:null,mode:'anti'});
 assert.equal(overall.rows[0].fastMoveType,'psychic');
 const worker=new Worker(new URL('./rankings_worker_harness.mjs',import.meta.url));
 try{
  await once(worker,'message');
  let response=once(worker,'message');
  worker.postMessage({id:80,attackType:null,secondaryType:null,mode:'anti',includeMegas:false});
  const [{result,error}]=await response;
  assert.equal(error,undefined);
  assert.equal(result.attackType,null);
  assert.equal(result.secondaryType,null);
  assert(result.rows.length>100);
  const best=result.rows.find(row=>row.formId==='MEWTWO');
  response=once(worker,'message');
  worker.postMessage({id:81,kind:'movesets',formId:'MEWTWO',attackType:null,secondaryType:null,mode:'anti'});
  const [details]=await response;
  assert.equal(details.error,undefined);
  const row=details.result.rows.find(row=>row.fastMove===best.fastMove&&row.chargedMove===best.chargedMove);
  for(const metric of ['idealDps','simpleDps','effectiveDps'])assert.equal(row[metric],best[metric]);
 }finally{await worker.terminate();}
});
