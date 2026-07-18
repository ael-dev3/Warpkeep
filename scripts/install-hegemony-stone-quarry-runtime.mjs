import { resolve } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY,
  HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES,
  HEGEMONY_STONE_QUARRY_SOURCE,
  HEGEMONY_STONE_QUARRY_SOURCE_FILES,
  assertHegemonyStoneQuarrySourceManifest,
  sha256,
  verifyHegemonyStoneQuarryRuntimeBytes
} from './hegemony-stone-quarry-runtime-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_STONE_QUARRY_RUNTIME_ROOT
  ? resolve(process.env.WARPKEEP_STONE_QUARRY_RUNTIME_ROOT)
  : undefined;

function fail(detail) {
  throw new Error('Hegemony Stone Quarry runtime installation: ' + detail);
}

function readExactSource(rootDirectory, record, label) {
  const bytes = readContainedRegularFile({
    root: rootDirectory,
    relativePath: record.filename,
    label,
    expectedBytes: record.bytes
  });
  if (sha256(bytes) !== record.sha256) fail(label + ' does not match its exact source hash.');
  return bytes;
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_STONE_QUARRY_RUNTIME_ROOT to the exact owner-supplied Stone Quarry Runtime directory.'
  );
}

const manifest = readExactSource(
  suppliedRoot,
  HEGEMONY_STONE_QUARRY_SOURCE.manifest,
  'Stone Quarry supplied runtime manifest'
);
assertHegemonyStoneQuarrySourceManifest(manifest, 'Stone Quarry supplied runtime manifest');

const prepared = HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map((profile) => {
  const sourceRecord = HEGEMONY_STONE_QUARRY_SOURCE_FILES.find(
    (record) => record.id === profile.id
  );
  if (!sourceRecord) fail('missing source record for ' + profile.id + '.');
  const bytes = readExactSource(
    suppliedRoot,
    sourceRecord,
    profile.id + ' Stone Quarry supplied runtime'
  );
  verifyHegemonyStoneQuarryRuntimeBytes(
    bytes,
    profile,
    profile.id + ' Stone Quarry supplied runtime'
  );
  return Object.freeze({ profile, bytes });
});

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY,
  label: 'Hegemony Stone Quarry runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: prepared.map(({ profile, bytes }) => ({
    bytes,
    label: profile.id + ' Hegemony Stone Quarry runtime',
    relativePath: profile.filename
  }))
});
prepared.forEach(({ profile }) => {
  console.log(
    profile.id + ': ' + profile.bytes + ' bytes, ' + profile.triangles
      + ' triangles, sha256 ' + profile.sha256
  );
});
