import { resolve } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY,
  HEGEMONY_GOLD_MINE_RUNTIME_PROFILES,
  HEGEMONY_GOLD_MINE_SOURCE,
  assertHegemonyGoldMineSourceManifest,
  sha256,
  verifyHegemonyGoldMineRuntimeBytes
} from './hegemony-gold-mine-runtime-contract.mjs';
import { rewriteEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_GOLD_MINE_RUNTIME_ROOT
  ? resolve(process.env.WARPKEEP_GOLD_MINE_RUNTIME_ROOT)
  : undefined;

function fail(detail) {
  throw new Error(`Hegemony Gold Mine runtime installation: ${detail}`);
}

function readExactSource(rootDirectory, record, label) {
  const bytes = readContainedRegularFile({
    root: rootDirectory,
    relativePath: record.filename,
    label,
    expectedBytes: record.bytes
  });
  if (sha256(bytes) !== record.sha256) fail(`${label} does not match its exact source hash.`);
  return bytes;
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_GOLD_MINE_RUNTIME_ROOT to the exact owner-supplied Gold Mine runtime package root.'
  );
}

const manifest = readExactSource(
  suppliedRoot,
  HEGEMONY_GOLD_MINE_SOURCE.manifest,
  'Gold Mine supplied runtime manifest'
);
assertHegemonyGoldMineSourceManifest(manifest, 'Gold Mine supplied runtime manifest');

const prepared = [];
for (const profile of HEGEMONY_GOLD_MINE_RUNTIME_PROFILES) {
  const sourceRecord = HEGEMONY_GOLD_MINE_SOURCE.files.find((record) => (
    record.id === profile.id
  ));
  if (!sourceRecord) fail(`missing source record for ${profile.id}.`);
  const source = readExactSource(
    suppliedRoot,
    sourceRecord,
    `${profile.id} Gold Mine supplied runtime`
  );
  const bytes = profile.metadataNormalization === 'none'
    ? source
    : (await rewriteEmbeddedWebpGlb(source, {
      targetSize: profile.textureSize,
      label: `${profile.id} Gold Mine atlas metadata normalization`
    })).bytes;
  await verifyHegemonyGoldMineRuntimeBytes(bytes, profile, `${profile.id} Gold Mine runtime`);
  prepared.push({ profile, bytes });
}

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY,
  label: 'Hegemony Gold Mine runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: prepared.map(({ profile, bytes }) => ({
    bytes,
    label: `${profile.id} Hegemony Gold Mine runtime`,
    relativePath: profile.filename
  }))
});
prepared.forEach(({ profile }) => {
  console.log(`${profile.id}: ${profile.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.sha256}`);
});
