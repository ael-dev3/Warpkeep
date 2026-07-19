import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY,
  HEGEMONY_GOLD_MINE_RUNTIME_PROFILES,
  verifyHegemonyGoldMineRuntimeBytes
} from './hegemony-gold-mine-runtime-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const destinationRoot = resolve(root, HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY);
const expectedNames = new Set(HEGEMONY_GOLD_MINE_RUNTIME_PROFILES.map((profile) => profile.filename));

assertNoStaleAtomicFamilyTransactions(destinationRoot, 'Hegemony Gold Mine runtime directory');

const entries = readdirSync(destinationRoot, { withFileTypes: true });
const observedNames = entries.map((entry) => entry.name).sort();
const unknown = observedNames.filter((name) => !expectedNames.has(name));
const missing = [...expectedNames].filter((name) => !observedNames.includes(name)).sort();
const nonFiles = entries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
if (unknown.length > 0 || missing.length > 0 || nonFiles.length > 0) {
  throw new Error(
    'Hegemony Gold Mine runtime family does not match the reviewed immutable set: '
    + `unknown=[${unknown.join(',')}], missing=[${missing.join(',')}], nonFiles=[${nonFiles.join(',')}].`
  );
}

for (const profile of HEGEMONY_GOLD_MINE_RUNTIME_PROFILES) {
  const relativePath = `${HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY}/${profile.filename}`;
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${profile.id} Hegemony Gold Mine runtime`,
    expectedBytes: profile.bytes
  });
  await verifyHegemonyGoldMineRuntimeBytes(bytes, profile, `${profile.id} Hegemony Gold Mine runtime`);
}

console.log(`Verified ${HEGEMONY_GOLD_MINE_RUNTIME_PROFILES.length} exact Hegemony Gold Mine runtime LODs.`);
