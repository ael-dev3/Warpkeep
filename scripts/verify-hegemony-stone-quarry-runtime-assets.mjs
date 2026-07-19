import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY,
  HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES,
  verifyHegemonyStoneQuarryRuntimeBytes
} from './hegemony-stone-quarry-runtime-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const destinationRoot = resolve(root, HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY);
const expectedNames = new Set(HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map((profile) => profile.filename));

assertNoStaleAtomicFamilyTransactions(destinationRoot, 'Hegemony Stone Quarry runtime directory');

const entries = readdirSync(destinationRoot, { withFileTypes: true });
const observedNames = entries.map((entry) => entry.name).sort();
const unknown = observedNames.filter((name) => !expectedNames.has(name));
const missing = [...expectedNames].filter((name) => !observedNames.includes(name)).sort();
const nonFiles = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
if (unknown.length > 0 || missing.length > 0 || nonFiles.length > 0) {
  throw new Error(
    'Hegemony Stone Quarry runtime family does not match the reviewed immutable set: '
    + 'unknown=[' + unknown.join(',') + '], missing=[' + missing.join(',')
    + '], nonFiles=[' + nonFiles.join(',') + '].'
  );
}

for (const profile of HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES) {
  const relativePath = HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY + '/' + profile.filename;
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: profile.id + ' Hegemony Stone Quarry runtime',
    expectedBytes: profile.bytes
  });
  verifyHegemonyStoneQuarryRuntimeBytes(
    bytes,
    profile,
    profile.id + ' Hegemony Stone Quarry runtime'
  );
}

console.log(
  'Verified ' + HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.length
    + ' exact Hegemony Stone Quarry runtime LODs.'
);
