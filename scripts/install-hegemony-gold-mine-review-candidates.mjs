import { resolve } from 'node:path';

import {
  GOLD_MINE_CANDIDATE_DIRECTORY,
  GOLD_MINE_CANDIDATE_PROFILES,
  GOLD_MINE_SOURCE_MANIFEST,
  assertGoldMineSourceManifest,
  verifyGoldMineCandidateBytes
} from './hegemony-gold-mine-candidate-contract.mjs';
import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_GOLD_MINE_RUNTIME_ROOT
  ? resolve(process.env.WARPKEEP_GOLD_MINE_RUNTIME_ROOT)
  : undefined;
const destinationRoot = resolve(root, GOLD_MINE_CANDIDATE_DIRECTORY);

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_GOLD_MINE_RUNTIME_ROOT to the exact supplied Gold Mine runtime package root.'
  );
}

const sourceManifest = readContainedRegularFile({
  root: suppliedRoot,
  relativePath: GOLD_MINE_SOURCE_MANIFEST.path,
  label: 'Gold Mine source runtime manifest',
  expectedBytes: GOLD_MINE_SOURCE_MANIFEST.bytes
});
assertGoldMineSourceManifest(sourceManifest, 'Gold Mine source runtime manifest');

const candidates = [];
for (const profile of GOLD_MINE_CANDIDATE_PROFILES) {
  const bytes = readContainedRegularFile({
    root: suppliedRoot,
    relativePath: profile.sourceFilename,
    label: `${profile.id} Gold Mine supplied runtime candidate`,
    expectedBytes: profile.bytes
  });
  await verifyGoldMineCandidateBytes(
    bytes,
    profile,
    `${profile.id} Gold Mine supplied runtime candidate`
  );
  candidates.push({ profile, bytes });
}

ensureContainedDirectory({
  root,
  relativePath: GOLD_MINE_CANDIDATE_DIRECTORY,
  label: 'Gold Mine review-candidate directory'
});

installAtomicFileFamily({
  destinationRoot,
  entries: candidates.map(({ profile, bytes }) => ({
    bytes,
    label: `${profile.id} Gold Mine review candidate`,
    relativePath: profile.candidateFilename
  }))
});

candidates.forEach(({ profile }) => {
  console.log(
    `${profile.id}: ${profile.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.sha256}`
  );
});
