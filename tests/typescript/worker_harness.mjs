// Test the real compiled worker without a web server. Only static catalog reads
// are allowed, so an accidental /api/simulate dependency fails this test.
import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.self=globalThis;
globalThis.postMessage=value=>parentPort.postMessage(value);
const build = JSON.parse(await readFile(new URL('../../dist/raids/build-info.json', import.meta.url), 'utf8'));
if (!/^engine-[a-f0-9]{12}$/.test(build.engine_directory))
  throw new Error('Invalid generated engine directory.');
globalThis.fetch=async url=>{
 const expected=new URL(`../../dist/raids/${build.engine_directory}/calculator_data.json`,import.meta.url);
 if(String(url)!==String(expected)) throw new Error(`Unexpected network request ${url}`);
 return {ok:true,json:async()=>JSON.parse(await readFile(expected,'utf8'))};
};
await import(`../../dist/raids/${build.engine_directory}/worker.js`);
parentPort.on('message',data=>globalThis.onmessage({data}));
parentPort.postMessage({ready:true});
