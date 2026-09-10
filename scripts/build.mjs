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
<<<<<<< HEAD
=======
  ...await filesBelow('apps/counters'),
>>>>>>> f6ff54f (PokeBattler styled raid counters ranking)
  ...await filesBelow('apps/rankings'),
  'simulator/calculator_data.json',
  'simulator/ranking_categories.json',
  'simulator/shadow_availability.json',
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
await cp('apps/counters', join('dist', 'counters'), {recursive: true});
await cp('apps/rankings', join('dist', 'rankings'), {recursive: true});
await mkdir(join('dist', 'raids', engineDirectory), {recursive: true});
<<<<<<< HEAD
=======
await mkdir(join('dist', 'counters', engineDirectory), {recursive: true});
>>>>>>> f6ff54f (PokeBattler styled raid counters ranking)
await mkdir(join('dist', 'rankings', engineDirectory), {recursive: true});
await cp('build', join('dist', 'raids', engineDirectory), {
  recursive: true,
  filter: path => !path.endsWith('.d.ts'),
});
await cp(
  'simulator/calculator_data.json',
  join('dist', 'raids', engineDirectory, 'calculator_data.json'),
);
<<<<<<< HEAD
for (const asset of ['rankings.js', 'rankings.js.map', 'rankings_worker.js', 'rankings_worker.js.map']) {
  await cp(join('build', asset), join('dist', 'rankings', engineDirectory, asset));
}
=======
await cp('build', join('dist', 'counters', engineDirectory), {
  recursive: true,
  filter: path => !path.endsWith('.d.ts'),
});
await cp(
  'simulator/calculator_data.json',
  join('dist', 'counters', engineDirectory, 'calculator_data.json'),
);
await cp(
  'simulator/shadow_availability.json',
  join('dist', 'counters', engineDirectory, 'shadow_availability.json'),
);
await cp(
  'simulator/ranking_categories.json',
  join('dist', 'counters', engineDirectory, 'ranking_categories.json'),
);
await cp('build', join('dist', 'rankings', engineDirectory), {
  recursive: true,
  filter: path => !path.endsWith('.d.ts'),
});
>>>>>>> f6ff54f (PokeBattler styled raid counters ranking)
await cp(
  'simulator/calculator_data.json',
  join('dist', 'rankings', engineDirectory, 'calculator_data.json'),
);
await cp(
  'simulator/shadow_availability.json',
  join('dist', 'rankings', engineDirectory, 'shadow_availability.json'),
);
await cp(
  'simulator/ranking_categories.json',
  join('dist', 'rankings', engineDirectory, 'ranking_categories.json'),
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

<<<<<<< HEAD
=======
const countersClientPath = join('dist', 'counters', 'app.js');
const countersClient = (await readFile(countersClientPath, 'utf8'))
  .replace('engine/counters_worker.js', `${engineDirectory}/counters_worker.js`);
await writeFile(countersClientPath, countersClient);

const countersIndexPath = join('dist', 'counters', 'index.html');
const countersIndex = (await readFile(countersIndexPath, 'utf8')).replace(
  /\b(href|src)="(styles\.css|app\.js)(?:\?v=[^"]*)?"/g,
  (_match, attribute, asset) => `${attribute}="${asset}?v=${version}"`,
);
await writeFile(countersIndexPath, countersIndex);

>>>>>>> f6ff54f (PokeBattler styled raid counters ranking)
const rankingsClientPath = join('dist', 'rankings', 'app.js');
const rankingsClient = (await readFile(rankingsClientPath, 'utf8'))
  .replace('engine/rankings_worker.js', `${engineDirectory}/rankings_worker.js`);
await writeFile(rankingsClientPath, rankingsClient);

const rankingsIndexPath = join('dist', 'rankings', 'index.html');
const rankingsIndex = (await readFile(rankingsIndexPath, 'utf8')).replace(
  /\b(href|src)="(styles\.css|app\.js)(?:\?v=[^"]*)?"/g,
  (_match, attribute, asset) => `${attribute}="${asset}?v=${version}"`,
);
await writeFile(rankingsIndexPath, rankingsIndex);
await writeFile(
  join('dist', 'raids', 'build-info.json'),
  JSON.stringify({version, engine_directory: engineDirectory}, null, 2) + '\n',
);

console.log(`Built Great Goose site ${version} with /raids/, /counters/, and /rankings/ in dist/.`);
