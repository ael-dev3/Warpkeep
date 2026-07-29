import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  aggregateHegemonySupplyWagonAudits,
  auditHegemonySupplyWagonBytes,
  HEGEMONY_SUPPLY_WAGON_PROFILES,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY
} from './hegemony-supply-wagon-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const destinationRoot = resolve(root, HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY);
const expectedNames = new Set(HEGEMONY_SUPPLY_WAGON_PROFILES.map((profile) => profile.filename));

assertNoStaleAtomicFamilyTransactions(destinationRoot, 'Hegemony supply-wagon runtime directory');

const matchingEntries = readdirSync(destinationRoot, { withFileTypes: true })
  .filter((entry) => entry.name.startsWith('hegemony-supply-wagon-'));
const observedNames = matchingEntries.map((entry) => entry.name).sort();
const unknown = observedNames.filter((name) => !expectedNames.has(name));
const missing = [...expectedNames].filter((name) => !observedNames.includes(name)).sort();
const nonFiles = matchingEntries.filter((entry) => !entry.isFile()).map((entry) => entry.name).sort();
if (unknown.length > 0 || missing.length > 0 || nonFiles.length > 0) {
  throw new Error(
    'Hegemony supply-wagon runtime family does not match the reviewed immutable set: '
    + `unknown=[${unknown.join(',')}], missing=[${missing.join(',')}], nonFiles=[${nonFiles.join(',')}].`
  );
}

const audits = [];
for (const profile of HEGEMONY_SUPPLY_WAGON_PROFILES) {
  const relativePath = `${HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY}/${profile.filename}`;
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${profile.id} Hegemony supply-wagon runtime`,
    expectedBytes: profile.bytes
  });
  audits.push(await auditHegemonySupplyWagonBytes(
    bytes,
    profile,
    `${profile.id} Hegemony supply-wagon runtime`
  ));
}

const aggregate = aggregateHegemonySupplyWagonAudits(audits);
console.log(`Verified ${HEGEMONY_SUPPLY_WAGON_PROFILES.length} exact Hegemony supply-wagon runtime LODs.`);
console.log(
  'Supply Wagon semantic audit: '
  + `${aggregate.jointNames.length} named joints, `
  + `${aggregate.clips.length} in-place clips, `
  + `${aggregate.wheelSemantics.nodeNames.join('/')} distance-driven at `
  + `${aggregate.wheelSemantics.preparedRadius.toFixed(9)} world radius.`
);
