import { lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile,
  resolveContainedPath
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_LOGGING_CAMP_RUNTIME_DIRECTORY,
  HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES,
  HEGEMONY_LOGGING_CAMP_SOURCE,
  assertHegemonyLoggingCampSourceManifest,
  sha256,
  verifyHegemonyLoggingCampRuntimeBytes
} from './hegemony-logging-camp-runtime-contract.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_LOGGING_CAMP_RUNTIME_ROOT
  ? resolve(process.env.WARPKEEP_LOGGING_CAMP_RUNTIME_ROOT)
  : undefined;

function fail(detail) {
  throw new Error(`Hegemony Logging Camp runtime installation: ${detail}`);
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

function assertExactSourceMembers(rootDirectory) {
  const expected = [
    HEGEMONY_LOGGING_CAMP_SOURCE.manifest.filename,
    ...HEGEMONY_LOGGING_CAMP_SOURCE.files.map((record) => record.filename)
  ].sort();
  const observed = readdirSync(rootDirectory, { withFileTypes: true })
    .map((entry) => {
      const path = resolveContainedPath(rootDirectory, entry.name, 'Logging Camp source member');
      const status = lstatSync(path);
      if (status.isSymbolicLink()) fail(`source package contains a symbolic link: ${entry.name}`);
      if (!status.isFile()) fail(`source package has a non-regular member: ${entry.name}`);
      return entry.name;
    })
    .sort();

  if (
    observed.length !== expected.length
    || observed.some((name, index) => name !== expected[index])
  ) fail(
    `source package members differ from the reviewed delivery: expected ${expected.length} regular files, received ${observed.length}.`
  );
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_LOGGING_CAMP_RUNTIME_ROOT to the exact owner-supplied Logging Camp Runtime directory.'
  );
}

const suppliedRootStatus = lstatSync(suppliedRoot, { throwIfNoEntry: false });
if (!suppliedRootStatus?.isDirectory() || suppliedRootStatus.isSymbolicLink()) {
  fail('WARPKEEP_LOGGING_CAMP_RUNTIME_ROOT must name a real, non-symbolic runtime directory.');
}
assertExactSourceMembers(suppliedRoot);

const manifest = readExactSource(
  suppliedRoot,
  HEGEMONY_LOGGING_CAMP_SOURCE.manifest,
  'Logging Camp supplied runtime manifest'
);
assertHegemonyLoggingCampSourceManifest(manifest, 'Logging Camp supplied runtime manifest');

const prepared = [];
for (const profile of HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES) {
  const sourceRecord = HEGEMONY_LOGGING_CAMP_SOURCE.files.find((record) => (
    record.id === profile.id
  ));
  if (!sourceRecord) fail(`missing source record for ${profile.id}.`);
  const bytes = readExactSource(
    suppliedRoot,
    sourceRecord,
    `${profile.id} Logging Camp supplied runtime`
  );
  verifyHegemonyLoggingCampRuntimeBytes(bytes, profile, `${profile.id} Logging Camp runtime`);
  prepared.push({ profile, bytes });
}

const destinationRoot = ensureContainedDirectory({
  root,
  relativePath: HEGEMONY_LOGGING_CAMP_RUNTIME_DIRECTORY,
  label: 'Hegemony Logging Camp runtime directory'
});
installAtomicFileFamily({
  destinationRoot,
  entries: prepared.map(({ profile, bytes }) => ({
    bytes,
    label: `${profile.id} Hegemony Logging Camp runtime`,
    relativePath: profile.filename
  }))
});
prepared.forEach(({ profile }) => {
  console.log(`${profile.id}: ${profile.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.sha256}`);
});
