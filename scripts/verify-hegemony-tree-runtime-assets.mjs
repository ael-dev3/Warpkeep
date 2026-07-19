import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_TREE_RUNTIME_DIRECTORY,
  HEGEMONY_TREE_RUNTIME_PROFILES,
  verifyHegemonyTreeRuntimeBytes
} from './hegemony-tree-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const destinationRoot = resolve(ROOT, HEGEMONY_TREE_RUNTIME_DIRECTORY);
const expectedNames = new Set(HEGEMONY_TREE_RUNTIME_PROFILES.map((profile) => profile.filename));

assertNoStaleAtomicFamilyTransactions(
  destinationRoot,
  'Hegemony environment-tree runtime directory'
);

const entries = readdirSync(destinationRoot, { withFileTypes: true });
const observedNames = entries.map((entry) => entry.name).sort();
const unknown = observedNames.filter((name) => !expectedNames.has(name));
const missing = [...expectedNames].filter((name) => !observedNames.includes(name)).sort();
const nonFiles = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
if (unknown.length > 0 || missing.length > 0 || nonFiles.length > 0) {
  throw new Error(
    'Hegemony environment-tree runtime family does not match the reviewed immutable set: '
      + 'unknown=['
      + unknown.join(',')
      + '], missing=['
      + missing.join(',')
      + '], nonFiles=['
      + nonFiles.join(',')
      + '].'
  );
}

for (const profile of HEGEMONY_TREE_RUNTIME_PROFILES) {
  const relativePath = HEGEMONY_TREE_RUNTIME_DIRECTORY + '/' + profile.filename;
  const bytes = readContainedRegularFile({
    root: ROOT,
    relativePath,
    label: profile.assetName + ' ' + profile.id + ' Hegemony tree runtime',
    expectedBytes: profile.bytes
  });
  verifyHegemonyTreeRuntimeBytes(
    bytes,
    profile,
    profile.assetName + ' ' + profile.id + ' Hegemony tree runtime'
  );
}

console.log(
  'Verified '
    + HEGEMONY_TREE_RUNTIME_PROFILES.length
    + ' exact Hegemony tree runtime LODs across '
    + new Set(HEGEMONY_TREE_RUNTIME_PROFILES.map((profile) => profile.assetId)).size
    + ' assets.'
);
