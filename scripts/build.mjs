import {createHash} from 'node:crypto';
import {cp, mkdir, readFile, readdir, rm, writeFile} from 'node:fs/promises';
import {join, relative} from 'node:path';

async function filesBelow(folder) {
  const result = [];
  for (const entry of await readdir(folder, {withFileTypes: true})) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else result.push(path);
  }
  return result;
}

// A versioned engine directory is important: query parameters on worker.js do
// not automatically propagate to its relative imports. Giving the whole module
// graph a content-addressed directory prevents a deployed page from mixing two
// releases even when a CDN caches JavaScript aggressively.
const inputs = [
  ...(await filesBelow('build')).filter(path => path.endsWith('.js')),
  ...await filesBelow('apps/raids'),
  'simulator/calculator_data.json',
].sort();
const digest = createHash('sha256');
for (const path of inputs) {
  digest.update(relative('.', path));
  digest.update(await readFile(path));
}
const version = digest.digest('hex').slice(0, 12);
const engineDirectory = `engine-${version}`;

await rm('dist', {recursive: true, force: true});
await cp('apps/home', 'dist', {recursive: true});
await cp('apps/raids', join('dist', 'raids'), {recursive: true});
await cp('apps/rankings', join('dist', 'rankings'), {recursive: true});
await mkdir(join('dist', 'raids', engineDirectory), {recursive: true});
await cp('build', join('dist', 'raids', engineDirectory), {
  recursive: true,
  filter: path => !path.endsWith('.d.ts'),
});
await cp(
  'simulator/calculator_data.json',
  join('dist', 'raids', engineDirectory, 'calculator_data.json'),
);

const clientPath = join('dist', 'raids', 'client.js');
const client = (await readFile(clientPath, 'utf8'))
  .replace('engine/worker.js', `${engineDirectory}/worker.js`);
await writeFile(clientPath, client);

const indexPath = join('dist', 'raids', 'index.html');
const index = (await readFile(indexPath, 'utf8')).replace(
  /\b(href|src)="(styles\.css|client\.js|pokemon_code\.js|share\.js|app\.js|playback\.js|replay\.js|turns\.js)(?:\?v=[^"]*)?"/g,
  (_match, attribute, asset) => `${attribute}="${asset}?v=${version}"`,
);
await writeFile(indexPath, index);
await writeFile(
  join('dist', 'raids', 'build-info.json'),
  JSON.stringify({version, engine_directory: engineDirectory}, null, 2) + '\n',
);

console.log(`Built Great Goose site ${version} with /raids/ and /rankings/ in dist/.`);
