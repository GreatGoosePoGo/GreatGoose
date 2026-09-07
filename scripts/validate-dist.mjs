import {readFile, readdir, stat} from 'node:fs/promises';
import {dirname, extname, join, normalize, relative, resolve, sep} from 'node:path';

const root = resolve('dist');
const build = JSON.parse(await readFile(join(root, 'build-info.json'), 'utf8'));
if (!/^[a-f0-9]{12}$/.test(build.version))
  throw new Error('dist/build-info.json has an invalid version.');
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

const index = await readFile(join(root, 'index.html'), 'utf8');
const localAssets = [...index.matchAll(/\b(?:src|href)="([^"#]+)"/g)]
  .map(match => match[1])
  .filter(path => !/^(?:[a-z]+:|\/\/)/i.test(path));
for (const asset of localAssets) {
  const [path, query = ''] = asset.split('?', 2);
  const destination = resolve(root, path);
  if (destination !== root && !destination.startsWith(root + sep))
    throw new Error(`HTML asset escapes dist/: ${asset}`);
  await stat(destination);
  if (/\.(?:js|css)$/.test(path) && query !== `v=${build.version}`)
    throw new Error(`HTML asset is not tied to this build: ${asset}`);
}

const engineRoot = join(root, build.engine_directory);
const engineFiles = await filesBelow(engineRoot);
for (const required of ['worker.js', 'calculator_data.json'])
  await stat(join(engineRoot, required));

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

const client = await readFile(join(root, 'client.js'), 'utf8');
if (!client.includes(`${build.engine_directory}/worker.js`))
  throw new Error('The page client does not load the matching engine directory.');

console.log(`Validated static website ${build.version}: ${files.length} files and a closed engine module graph.`);
