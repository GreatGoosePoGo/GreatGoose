import {readFile, writeFile} from 'node:fs/promises';

const [dialgaDexPath] = process.argv.slice(2);
if (!dialgaDexPath) {
  throw new Error('Usage: node scripts/sync-release-status.mjs /path/to/pogo_pkm.json');
}

const catalogPath = new URL('../simulator/calculator_data.json', import.meta.url);
const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const dialgaDexCatalog = JSON.parse(await readFile(dialgaDexPath, 'utf8'));

function normalizedTypes(types) {
  return [...types].map(type => String(type).toLowerCase()).sort().join(',');
}

function sourceKey(entry) {
  return [
    entry.id,
    normalizedTypes(entry.types),
    entry.stats.baseAttack,
    entry.stats.baseDefense,
    entry.stats.baseStamina,
  ].join('|');
}

function localKey(entry) {
  return [
    entry.dex_number,
    normalizedTypes(entry.types),
    entry.stats.attack,
    entry.stats.defense,
    entry.stats.stamina,
  ].join('|');
}

function normalizedForm(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function expectedSourceForm(entry) {
  if (entry.form_id === entry.id) return 'normal';
  const prefix = `${entry.id}_`;
  if (!entry.form_id.startsWith(prefix)) {
    throw new Error(`Cannot derive the source form for ${entry.form_id}.`);
  }
  return entry.form_id.slice(prefix.length);
}

const sourceByKey = new Map();
for (const entry of dialgaDexCatalog) {
  const key = sourceKey(entry);
  const matches = sourceByKey.get(key) ?? [];
  matches.push(entry);
  sourceByKey.set(key, matches);
}

let released = 0;
let unreleased = 0;
for (const entry of catalog) {
  const matches = sourceByKey.get(localKey(entry)) ?? [];
  if (matches.length === 0) {
    throw new Error(`DialgaDex has no matching form for ${entry.form_id}.`);
  }

  const statuses = new Set(matches.map(match => Boolean(match.released)));
  let match;
  if (statuses.size === 1) {
    [match] = matches;
  } else {
    const wanted = normalizedForm(expectedSourceForm(entry));
    const exact = matches.filter(candidate => normalizedForm(candidate.form) === wanted);
    if (exact.length !== 1) {
      throw new Error(`DialgaDex release status is ambiguous for ${entry.form_id}.`);
    }
    [match] = exact;
  }

  entry.released = Boolean(match.released);
  if (entry.released) released += 1;
  else unreleased += 1;
}

await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
console.log(`Updated ${catalog.length} forms: ${released} released, ${unreleased} unreleased.`);
