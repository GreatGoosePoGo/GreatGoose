import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';

globalThis.self = globalThis;
globalThis.postMessage = value => parentPort.postMessage(value);
const build = JSON.parse(await readFile(new URL('../../dist/raids/build-info.json', import.meta.url), 'utf8'));
const engine = new URL(`../../dist/rankings/${build.engine_directory}/`, import.meta.url);
const expectedCatalog = new URL('calculator_data.json', engine);
const expectedShadows = new URL('shadow_availability.json', engine);
const expectedCategories = new URL('ranking_categories.json', engine);
globalThis.fetch = async url => {
  const requested = String(url);
  const allowed = [expectedCatalog, expectedShadows, expectedCategories]
    .find(path => String(path) === requested);
  if (!allowed) throw new Error(`Unexpected network request ${url}`);
  return {ok: true, json: async () => JSON.parse(await readFile(allowed, 'utf8'))};
};
await import(new URL('rankings_worker.js', engine));
parentPort.on('message', data => globalThis.onmessage({data}));
parentPort.postMessage({ready: true});
