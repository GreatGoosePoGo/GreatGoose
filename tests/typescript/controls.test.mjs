import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
for(const file of ['test_turn_controls.cjs','test_replay_controls.cjs']) test(file,()=>{
 const result=spawnSync(process.execPath,[`tests/${file}`],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});
