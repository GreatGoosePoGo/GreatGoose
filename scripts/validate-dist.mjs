import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, extname, join, normalize, relative, resolve, sep} from 'node:path';

const root = resolve('dist');
const raidsRoot = join(root, 'raids');
const countersRoot = join(root, 'counters');
const rankingsRoot = join(root, 'rankings');
const build = JSON.parse(await readFile(join(raidsRoot, 'build-info.json'), 'utf8'));
if (!/^[a-f0-9]{12}$/.test(build.version))
  throw new Error('dist/raids/build-info.json has an invalid version.');
if (build.engine_directory !== `engine-${build.version}`)
  throw new Error('The engine directory does not match the build version.');

async function filesBelow(folder) {
  const result = [];
  for (const entry of await readdir(folder, {withFileTypes: true})) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) result.push(...await filesBelow(path));
    else result.push(path);
  }
  return result;
}

const files = await filesBelow(root);
if (files.some(path => extname(path) === '.py'))
  throw new Error('The static website unexpectedly contains Python files.');

const homeIndex = await readFile(join(root, 'index.html'), 'utf8');
if (!homeIndex.includes('href="raids/"')
    || !homeIndex.includes('href="counters/"')
    || !homeIndex.includes('href="rankings/"'))
  throw new Error('The home page must link to all three path-based applications.');
await stat(join(countersRoot, 'index.html'));
await stat(join(rankingsRoot, 'index.html'));

const index = await readFile(join(raidsRoot, 'index.html'), 'utf8');
for (const id of ['players', 'add-player', 'clone-player']) {
  if (!index.includes(`id="${id}"`))
    throw new Error(`Multi-player calculator control is missing: ${id}`);
}
if (index.includes('pokemon-code-dialog'))
  throw new Error('The obsolete Pokémon import/export dialog is still present.');
for (const id of ['copy-setup-link', 'copy-result-link', 'share-status']) {
  if (!index.includes(`id="${id}"`))
    throw new Error(`Share-link control is missing: ${id}`);
}
if (!index.includes('src="share.js?'))
  throw new Error('The versioned share-link codec is missing.');
const localAssets = [...index.matchAll(/\b(?:src|href)="([^"#]+)"/g)]
  .map(match => match[1])
  .filter(path => !/^(?:[a-z]+:|\/\/)/i.test(path))
  .filter(path => !path.split('?', 1)[0].endsWith('/'));
for (const asset of localAssets) {
  const [path, query = ''] = asset.split('?', 2);
  const destination = resolve(raidsRoot, path);
  if (destination !== raidsRoot && !destination.startsWith(raidsRoot + sep))
    throw new Error(`Raid HTML asset escapes dist/raids/: ${asset}`);
  await stat(destination);
  if (/\.(?:js|css)$/.test(path) && query !== `v=${build.version}`)
    throw new Error(`HTML asset is not tied to this build: ${asset}`);
}

const engineRoot = join(raidsRoot, build.engine_directory);
const engineFiles = await filesBelow(engineRoot);
for (const required of ['worker.js', 'calculator_data.json'])
  await stat(join(engineRoot, required));
const raidCatalog = JSON.parse(await readFile(join(engineRoot, 'calculator_data.json'), 'utf8'));
if (!Array.isArray(raidCatalog) || raidCatalog.length < 1000)
  throw new Error('The raid calculator catalog is missing or implausibly small.');

for (const path of engineFiles.filter(path => path.endsWith('.js'))) {
  const source = await readFile(path, 'utf8');
  if (source.includes('/api/'))
    throw new Error(`A static engine module contains a server API path: ${relative(root, path)}`);
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)[(']?['"](\.\.?\/[^'"]+)['"]/g)) {
    const target = normalize(resolve(dirname(path), match[1]));
    if (!target.startsWith(engineRoot + sep))
      throw new Error(`Engine import escapes its versioned graph: ${relative(root, path)} -> ${match[1]}`);
    await stat(target);
  }
}

const client = await readFile(join(raidsRoot, 'client.js'), 'utf8');
if (!client.includes(`${build.engine_directory}/worker.js`))
  throw new Error('The page client does not load the matching engine directory.');

const rankingsIndex = await readFile(join(rankingsRoot, 'index.html'), 'utf8');
await stat(join(rankingsRoot, 'assets', 'pokemon-go-type-icons.png'));
for (const asset of ['styles.css', 'app.js']) {
  if (!rankingsIndex.includes(`${asset}?v=${build.version}`))
    throw new Error(`The rankings page does not load versioned ${asset}.`);
}
const rankingsClient = await readFile(join(rankingsRoot, 'app.js'), 'utf8');
if (!rankingsClient.includes(`${build.engine_directory}/rankings_worker.js`))
  throw new Error('The rankings page does not load the matching worker.');
const rankingsEngineRoot = join(rankingsRoot, build.engine_directory);
for (const asset of ['rankings.js', 'raid_counters.js', 'super_mega_raid_simulator.js', 'rankings_worker.js', 'calculator_data.json', 'shadow_availability.json', 'ranking_categories.json'])
  await stat(join(rankingsEngineRoot, asset));
const rankingsCatalog = JSON.parse(await readFile(join(rankingsEngineRoot, 'calculator_data.json'), 'utf8'));
if (!Array.isArray(rankingsCatalog) || rankingsCatalog.length !== raidCatalog.length)
  throw new Error('The rankings calculator catalog is missing or does not match the raid catalog.');
const rankingsWorker = await readFile(join(rankingsEngineRoot, 'rankings_worker.js'), 'utf8');
if (!rankingsWorker.includes("from './rankings.js'") || rankingsWorker.includes("from './raid_counters.js'"))
  throw new Error('The rankings worker must contain only the general ranking calculation entrypoint.');
const rankingsEngineFiles = await filesBelow(rankingsEngineRoot);
for (const path of rankingsEngineFiles.filter(path => path.endsWith('.js'))) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)[(']?['"](\.\.?\/[^'"]+)['"]/g)) {
    const target = normalize(resolve(dirname(path), match[1]));
    if (!target.startsWith(rankingsEngineRoot + sep))
      throw new Error(`Rankings engine import escapes its versioned graph: ${relative(root, path)} -> ${match[1]}`);
    await stat(target);
  }
}
const shadowAvailability = JSON.parse(await readFile(join(rankingsEngineRoot, 'shadow_availability.json'), 'utf8'));
if (!Array.isArray(shadowAvailability.form_ids) || shadowAvailability.form_ids.length < 300)
  throw new Error('The released Shadow availability snapshot is missing or implausibly small.');
if (new Set(shadowAvailability.form_ids).size !== shadowAvailability.form_ids.length)
  throw new Error('The released Shadow availability snapshot contains duplicate form IDs.');
const rankingCategories = JSON.parse(await readFile(join(rankingsEngineRoot, 'ranking_categories.json'), 'utf8'));
if (!Array.isArray(rankingCategories.legendary_dex_numbers)
    || rankingCategories.legendary_dex_numbers.length !== 97)
  throw new Error('The broad Legendary category snapshot is missing or invalid.');

const countersIndex = await readFile(join(countersRoot, 'index.html'), 'utf8');
for (const asset of ['styles.css', 'app.js']) {
  if (!countersIndex.includes(`${asset}?v=${build.version}`))
    throw new Error(`The counters page does not load versioned ${asset}.`);
}
for (const id of [
  'counter-boss', 'counter-difficulty', 'counter-level', 'counter-weather',
  'counter-friendship', 'counter-dodge-strategy', 'counter-player-strategy',
  'counter-exclude-legacy', 'generate-counters', 'counter-body',
]) {
  if (!countersIndex.includes(`id="${id}"`))
    throw new Error(`Raid-counter control is missing: ${id}`);
}
const countersClient = await readFile(join(countersRoot, 'app.js'), 'utf8');
if (!countersClient.includes(`${build.engine_directory}/counters_worker.js`))
  throw new Error('The counters page does not load the matching worker.');
const countersEngineRoot = join(countersRoot, build.engine_directory);
for (const asset of [
  'counters_worker.js', 'raid_counters.js', 'super_mega_raid_simulator.js',
  'calculator_data.json', 'shadow_availability.json', 'ranking_categories.json',
]) {
  await stat(join(countersEngineRoot, asset));
}
const countersCatalog = JSON.parse(await readFile(join(countersEngineRoot, 'calculator_data.json'), 'utf8'));
if (!Array.isArray(countersCatalog) || countersCatalog.length !== raidCatalog.length)
  throw new Error('The counter calculator catalog is missing or does not match the raid catalog.');
const countersWorker = await readFile(join(countersEngineRoot, 'counters_worker.js'), 'utf8');
if (!countersWorker.includes("from './raid_counters.js'"))
  throw new Error('The counters worker is missing its simulation-backed calculation engine.');
const countersEngineFiles = await filesBelow(countersEngineRoot);
for (const path of countersEngineFiles.filter(path => path.endsWith('.js'))) {
  const source = await readFile(path, 'utf8');
  for (const match of source.matchAll(/\b(?:from\s*|import\s*)[(']?['"](\.\.?\/[^'"]+)['"]/g)) {
    const target = normalize(resolve(dirname(path), match[1]));
    if (!target.startsWith(countersEngineRoot + sep))
      throw new Error(`Counters engine import escapes its versioned graph: ${relative(root, path)} -> ${match[1]}`);
    await stat(target);
  }
}

console.log(`Validated static website ${build.version}: ${files.length} files and a closed engine module graph.`);
