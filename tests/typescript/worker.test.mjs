import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {once} from 'node:events';
test('compiled worker calculates single/batch battles and replay without any simulation HTTP endpoint',async()=>{
 const worker=new Worker(new URL('./worker_harness.mjs',import.meta.url));
 try {
  const [ready]=await once(worker,'message');assert(ready.ready);
  let id=0;
  const call=async(method,payload={})=>{
   const result=once(worker,'message');worker.postMessage({id:++id,method,payload});
   const [response]=await result;assert.equal(response.id,id);
   if(response.error)throw new Error(response.error);return response.result;
  };
  const data=await call('catalog');assert(data.pokemon.length>1000);
  const request={boss:'STARMIE',boss_fast_move:'Hidden Power',boss_charged_move:'Hydro Pump',raid_difficulty:'Tier 3',random_seed:'9223372036854775807',team:[{name:'MEWTWO',fast_move:'Confusion',charged_move:'Psystrike',level:50}]};
  const result=await call('simulate',request);assert.equal(result.mode,'single');
  const parsed=await call('replay/parse',{text:result.replay_text});assert.equal(parsed.settings.random_seed,request.random_seed);
  const playback=await call('replay/playback',{text:result.replay_text});assert.equal(playback.source,'verified_simulation');assert.equal(playback.result.boss_hp,result.boss_hp);
  const batch=await call('simulate',{...request,simulation_count:3});assert.equal(batch.total_battles,3);
  await assert.rejects(call('simulate',{...request,boss:'not a Pokémon'}),/valid raid boss/);
  assert((await call('catalog')).pokemon.length>1000,'Worker remains usable after a rejected job');
 } finally { await worker.terminate(); }
});
