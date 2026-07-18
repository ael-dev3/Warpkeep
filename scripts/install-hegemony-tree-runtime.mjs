import { lstatSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
  readContainedRegularFile,
  resolveContainedPath
} from './atomic-install-file-family.mjs';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  HEGEMONY_TREE_RUNTIME_BUNDLE,
  HEGEMONY_TREE_RUNTIME_DIRECTORY,
  HEGEMONY_TREE_RUNTIME_MANIFEST,
  assertHegemonyTreeBundleManifest,
  assertHegemonyTreeSourceCatalog,
  assertHegemonyTreeSourceManifest,
  sha256,
  verifyHegemonyTreeRuntimeBytes
} from './hegemony-tree-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_TREES_RUNTIME_BUNDLE_ROOT
  ? resolve(process.env.WARPKEEP_TREES_RUNTIME_BUNDLE_ROOT)
  : undefined;

function fail(detail) {
  throw new Error('Hegemony tree runtime installation: ' + detail);
}

function readExactSource(root, record, label) {
  const bytes = readContainedRegularFile({
    root,
    relativePath: record.path,
    label,
    expectedBytes: record.bytes
  });
  if (sha256(bytes) !== record.sha256) fail(label + ' does not match its exact source hash.');
  return bytes;
}

function sourceFileRecords() {
  const sourceBundle = HEGEMONY_TREE_RUNTIME_MANIFEST.sourceBundle;
  return [
    sourceBundle.bundleManifest,
    sourceBundle.handoffReadme,
    sourceBundle.checksums,
    ...sourceBundle.catalogs,
    ...HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => asset.sourceManifest),
    ...HEGEMONY_TREE_RUNTIME_ASSETS.flatMap((asset) => asset.models.map((model) => ({
      path: model.sourcePath,
      bytes: model.bytes,
      sha256: model.sha256
    })))
  ];
}

function collectRegularFiles(root, relativePath = '') {
  const directory = relativePath === ''
    ? root
    : resolveContainedPath(root, relativePath, 'tree source directory');
  const entries = readdirSync(directory, { withFileTypes: true }).sort((left, right) => (
    left.name.localeCompare(right.name)
  ));
  return entries.flatMap((entry) => {
    const childRelativePath = relativePath === ''
      ? entry.name
      : relativePath + '/' + entry.name;
    const childPath = join(directory, entry.name);
    const status = lstatSync(childPath);
    if (status.isSymbolicLink()) fail('source package contains a symbolic link: ' + childRelativePath);
    if (status.isDirectory()) return collectRegularFiles(root, childRelativePath);
    if (!status.isFile()) fail('source package has a non-regular member: ' + childRelativePath);
    return [childRelativePath];
  });
}

function assertExactSourceMembers(root, expectedRecords) {
  const expected = expectedRecords.map((record) => record.path).sort();
  const observed = collectRegularFiles(root).sort();
  if (
    observed.length !== expected.length
    || observed.some((path, index) => path !== expected[index])
  ) fail(
    'source package members differ from the reviewed archive: expected '
      + expected.length
      + ' regular files, received '
      + observed.length
      + '.'
  );
}

function assertChecksumList(bytes, records) {
  const text = bytes.toString('utf8');
  for (const record of records.filter((entry) => entry.path !== 'SHA256SUMS.txt')) {
    const expectedLine = record.sha256 + '  ./' + record.path + '\n';
    if (!text.includes(expectedLine)) {
      fail('source SHA256SUMS.txt does not attest ' + record.path + '.');
    }
  }
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_TREES_RUNTIME_BUNDLE_ROOT to the extracted exact '
    + HEGEMONY_TREE_RUNTIME_BUNDLE.bundleRoot
    + ' directory.'
  );
}

const suppliedRootStatus = lstatSync(suppliedRoot, { throwIfNoEntry: false });
if (!suppliedRootStatus?.isDirectory() || suppliedRootStatus.isSymbolicLink()) {
  fail('WARPKEEP_TREES_RUNTIME_BUNDLE_ROOT must name a real, non-symbolic extracted bundle directory.');
}

const allSourceRecords = sourceFileRecords();
assertExactSourceMembers(suppliedRoot, allSourceRecords);

const sourceBundle = HEGEMONY_TREE_RUNTIME_MANIFEST.sourceBundle;
const bundleManifest = readExactSource(
  suppliedRoot,
  sourceBundle.bundleManifest,
  'supplied Hegemony tree bundle manifest'
);
assertHegemonyTreeBundleManifest(bundleManifest, 'supplied Hegemony tree bundle manifest');

readExactSource(suppliedRoot, sourceBundle.handoffReadme, 'supplied Hegemony tree handoff README');
const checksumList = readExactSource(
  suppliedRoot,
  sourceBundle.checksums,
  'supplied Hegemony tree checksum list'
);
assertChecksumList(checksumList, allSourceRecords);
sourceBundle.catalogs.forEach((catalog, index) => {
  const label = index === 0
    ? 'supplied Hegemony tree species catalog'
    : 'supplied Hegemony tree variants catalog';
  assertHegemonyTreeSourceCatalog(readExactSource(suppliedRoot, catalog, label), catalog, label);
});

const prepared = [];
for (const asset of HEGEMONY_TREE_RUNTIME_ASSETS) {
  const manifestLabel = 'supplied ' + asset.name + ' manifest';
  const sourceManifest = readExactSource(suppliedRoot, asset.sourceManifest, manifestLabel);
  assertHegemonyTreeSourceManifest(sourceManifest, asset, manifestLabel);
  for (const model of asset.models) {
    const label = 'supplied ' + asset.name + ' ' + model.id + ' model';
    const bytes = readExactSource(suppliedRoot, {
      path: model.sourcePath,
      bytes: model.bytes,
      sha256: model.sha256
    }, label);
    verifyHegemonyTreeRuntimeBytes(bytes, model, label);
    prepared.push({ asset, bytes, model });
  }
}

const destinationRoot = ensureContainedDirectory({
  root: ROOT,
  relativePath: HEGEMONY_TREE_RUNTIME_DIRECTORY,
  label: 'Hegemony tree runtime destination'
});
installAtomicFileFamily({
  destinationRoot,
  entries: prepared.map(({ asset, bytes, model }) => ({
    bytes,
    label: asset.name + ' ' + model.id + ' runtime model',
    relativePath: model.filename
  }))
});

console.log(
  'Installed '
    + prepared.length
    + ' exact Hegemony tree runtime LODs across '
    + HEGEMONY_TREE_RUNTIME_ASSETS.length
    + ' tree assets.'
);
