import { lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  GOLD_MINE_CANDIDATE_DIRECTORY,
  GOLD_MINE_CANDIDATE_PROFILES,
  GOLD_MINE_CANDIDATE_RECORD,
  assertGoldMineCandidateRecord,
  verifyGoldMineCandidateBytes
} from './hegemony-gold-mine-candidate-contract.mjs';
import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const candidateDirectory = resolve(root, GOLD_MINE_CANDIDATE_DIRECTORY);
const publicCandidateDirectory = resolve(
  root,
  'public/models/hegemony/gathering-nodes/gold-mine'
);

assertNoStaleAtomicFamilyTransactions(
  candidateDirectory,
  'Gold Mine review-candidate directory'
);

const expectedNames = new Set(
  GOLD_MINE_CANDIDATE_PROFILES.map(profile => profile.candidateFilename)
);
const entries = readdirSync(candidateDirectory, { withFileTypes: true });
const entryNames = entries.map(entry => entry.name).sort();
const unknown = entryNames
  .filter(name => !expectedNames.has(name))
  .sort();
const missing = [...expectedNames]
  .filter(name => !entryNames.includes(name))
  .sort();
const nonFiles = entries
  .filter(entry => !entry.isFile())
  .map(entry => entry.name)
  .sort();
if (unknown.length > 0 || missing.length > 0 || nonFiles.length > 0) {
  throw new Error(
    'Gold Mine review candidate set does not match the exact recorded family: '
    + `unknown=[${unknown.join(',')}], missing=[${missing.join(',')}], `
    + `nonFiles=[${nonFiles.join(',')}].`
  );
}

for (const profile of GOLD_MINE_CANDIDATE_PROFILES) {
  const relativePath = `${GOLD_MINE_CANDIDATE_DIRECTORY}/${profile.candidateFilename}`;
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${profile.id} Gold Mine review candidate`,
    expectedBytes: profile.bytes
  });
  await verifyGoldMineCandidateBytes(bytes, profile, `${profile.id} Gold Mine review candidate`);
}

const candidateRecord = readContainedRegularFile({
  root,
  relativePath: GOLD_MINE_CANDIDATE_RECORD,
  label: 'Gold Mine candidate provenance record'
});
assertGoldMineCandidateRecord(candidateRecord, 'Gold Mine candidate provenance record');

if (lstatSync(publicCandidateDirectory, { throwIfNoEntry: false }) !== undefined) {
  throw new Error(
    'Gold Mine candidates must remain outside public/ until a separate approved integration PR.'
  );
}

console.log(
  `Verified ${GOLD_MINE_CANDIDATE_PROFILES.length} exact unintegrated Gold Mine review candidates.`
);
