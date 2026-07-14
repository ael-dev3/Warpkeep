import { readFileSync, readdirSync, statSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const dist = resolve(root, 'dist');
const forbiddenPathFragments = Object.freeze([
  'realm-observer-qa.html',
  'realm-qa.html'
]);
const forbiddenContent = Object.freeze([
  'http://127.0.0.1:41731',
  'RealmObserverQaHarness',
  'realmObserverQaMain',
  'realmObserverFixtureSnapshot',
  'createRealmObserverFixtureRealm',
  'QA OBSERVER · READ ONLY',
  'Close QA Observer',
  'Public presentation preview',
  'violetwarden',
  'stonekeeper',
  'frontierseer'
]);

function filesUnder(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

for (const path of filesUnder(dist)) {
  const relativePath = relative(dist, path).replaceAll('\\', '/');
  if (forbiddenPathFragments.some((fragment) => relativePath.includes(fragment))) {
    throw new Error(`Local QA entry leaked into production output: ${relativePath}`);
  }
  if (statSync(path).size > 10 * 1024 * 1024) continue;
  const content = readFileSync(path, 'utf8');
  const leaked = forbiddenContent.find((marker) => content.includes(marker));
  if (leaked) throw new Error(`Local QA marker ${JSON.stringify(leaked)} leaked into ${relativePath}.`);
}

console.log('Verified local QA entries and broker coordinates are absent from production output.');
