import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

import { createAssetToolEnvironment } from './asset-tool-process.mjs';
import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';
import {
  GLTFPACK_VERSION,
  resolveGltfpackBinaryPath,
  resolveGltfpackToolSpec
} from './gltfpack-tool-config.mjs';
import {
  HEGEMONY_SUPPLY_WAGON_PROFILES,
  HEGEMONY_SUPPLY_WAGON_RELEASE,
  HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY,
  HEGEMONY_SUPPLY_WAGON_SOURCE,
  assertHegemonySupplyWagonSha256Sums,
  assertHegemonySupplyWagonSourceManifest,
  sha256,
  verifyHegemonySupplyWagonBytes
} from './hegemony-supply-wagon-contract.mjs';
import { rewriteEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';

const root = resolve(import.meta.dirname, '..');
const archive = process.env.WARPKEEP_WAGON_ARCHIVE
  ? resolve(process.env.WARPKEEP_WAGON_ARCHIVE)
  : process.env.WARPKEEP_WAGON_ARCHIVE_CACHE
    ? resolve(process.env.WARPKEEP_WAGON_ARCHIVE_CACHE)
    : resolve(
      root,
      '.cache/warpkeep-assets',
      HEGEMONY_SUPPLY_WAGON_RELEASE.tag,
      HEGEMONY_SUPPLY_WAGON_RELEASE.attachment
    );
const gltfpackSpec = resolveGltfpackToolSpec();
const gltfpackBinary = resolveGltfpackBinaryPath(root, gltfpackSpec);
const unzipBinary = resolveAttestedSystemUnzip();
const workspace = mkdtempSync(resolve(tmpdir(), 'warpkeep-supply-wagon-'));
const assetToolEnvironment = createAssetToolEnvironment(workspace);
const packageRoot = HEGEMONY_SUPPLY_WAGON_RELEASE.packageRoot;
const sourceMember = `${packageRoot}/${HEGEMONY_SUPPLY_WAGON_SOURCE.filename}`;

const expectedMembers = Object.freeze([
  `${packageRoot}/README.md`,
  `${packageRoot}/SHA256SUMS.txt`,
  `${packageRoot}/Warpkeep_Hegemony_Draft_Wagon_Optimized_High_Polished_Final.blend`,
  `${packageRoot}/Warpkeep_Hegemony_Draft_Wagon_Optimized_High_Polished_Final.glb`,
  `${packageRoot}/Warpkeep_Hegemony_Draft_Wagon_Optimized_High_Polished_NoTelescope.glb`,
  sourceMember,
  `${packageRoot}/manifest.json`
].sort());

function fail(detail) {
  throw new Error(`Hegemony supply-wagon preparation: ${detail}`);
}

function readExactOrdinaryFile(path, expected, label) {
  const before = lstatSync(path, { throwIfNoEntry: false });
  if (!before?.isFile() || before.isSymbolicLink()) {
    fail(`${label} must be a regular non-symbolic file.`);
  }
  const bytes = readFileSync(path);
  const after = lstatSync(path, { throwIfNoEntry: false });
  if (
    !after?.isFile()
    || after.isSymbolicLink()
    || before.dev !== after.dev
    || before.ino !== after.ino
    || before.size !== after.size
    || bytes.byteLength !== after.size
    || bytes.byteLength !== expected.bytes
    || sha256(bytes) !== expected.sha256
  ) fail(`${label} does not match its exact pinned bytes.`);
  return bytes;
}

function runUnzip(args, encoding = 'utf8') {
  const result = spawnSync(unzipBinary, args, {
    cwd: workspace,
    env: assetToolEnvironment,
    encoding,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) fail(`unzip failed (${result.status}): ${String(result.stderr).trim()}`);
  return result.stdout;
}

function assertSafeArchive() {
  const entries = runUnzip(['-Z1', archive]).split(/\r?\n/u).filter(Boolean);
  const normalized = new Set();
  for (const entry of entries) {
    if (
      entry.includes('\\')
      || entry.includes('\0')
      || entry.startsWith('/')
      || /^[A-Za-z]:/u.test(entry)
    ) fail(`archive entry is unsafe: ${JSON.stringify(entry)}.`);
    const parts = entry.split('/').filter(Boolean);
    if (parts.some((part) => part === '.' || part === '..') || parts[0] !== packageRoot) {
      fail(`archive entry escapes the expected package root: ${JSON.stringify(entry)}.`);
    }
    const key = entry.normalize('NFC');
    if (normalized.has(key)) fail(`archive contains a normalized-path collision: ${JSON.stringify(entry)}.`);
    normalized.add(key);
  }
  const sortedEntries = entries.slice().sort();
  if (
    sortedEntries.length !== expectedMembers.length
    || !sortedEntries.every((entry, index) => entry === expectedMembers[index])
  ) {
    fail('archive membership changed from the reviewed source package.');
  }
  const listing = runUnzip(['-Z', '-l', archive]);
  if (listing.split(/\r?\n/u).some((line) => /^l[rwx-]{9}\s/u.test(line))) {
    fail('archive contains a symbolic link.');
  }
}

function extractExactMember(relativePath, expected, label) {
  const bytes = runUnzip(['-p', archive, relativePath], null);
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail(`${label} does not match its exact pinned bytes.`);
  }
  return bytes;
}

function runGltfpack(args) {
  const result = spawnSync(gltfpackBinary, args, {
    cwd: workspace,
    env: assetToolEnvironment,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    fail(`gltfpack failed (${result.status}): ${String(result.stderr).trim()}`);
  }
}

function assertGltfpackTool() {
  readExactOrdinaryFile(gltfpackBinary, {
    bytes: gltfpackSpec.binaryBytes,
    sha256: gltfpackSpec.binarySha256
  }, `gltfpack ${GLTFPACK_VERSION} ${gltfpackSpec.key}`);
  const result = spawnSync(gltfpackBinary, ['-v'], {
    cwd: workspace,
    env: assetToolEnvironment,
    encoding: 'utf8'
  });
  if (result.error) throw result.error;
  if (result.status !== 0 || String(result.stdout).trim() !== `gltfpack ${GLTFPACK_VERSION}`) {
    fail('pinned gltfpack version did not match the reviewed toolchain.');
  }
}

try {
  readExactOrdinaryFile(archive, HEGEMONY_SUPPLY_WAGON_RELEASE, 'source archive');
  assertGltfpackTool();
  assertSafeArchive();

  assertHegemonySupplyWagonSourceManifest(
    extractExactMember(
      `${packageRoot}/${HEGEMONY_SUPPLY_WAGON_SOURCE.manifest.filename}`,
      HEGEMONY_SUPPLY_WAGON_SOURCE.manifest,
      'source package manifest'
    ),
    'source package manifest'
  );
  assertHegemonySupplyWagonSha256Sums(
    extractExactMember(
      `${packageRoot}/${HEGEMONY_SUPPLY_WAGON_SOURCE.sha256Sums.filename}`,
      HEGEMONY_SUPPLY_WAGON_SOURCE.sha256Sums,
      'source package checksum list'
    ),
    'source package checksum list'
  );
  const source = extractExactMember(sourceMember, HEGEMONY_SUPPLY_WAGON_SOURCE, 'NoTelescope GameReady source');

  const prepared = [];
  for (const profile of HEGEMONY_SUPPLY_WAGON_PROFILES) {
    let bytes;
    if (!profile.simplify) {
      bytes = source;
    } else {
      const rewritten = await rewriteEmbeddedWebpGlb(source, {
        targetSize: profile.textureSize,
        label: `${profile.id} supply-wagon atlas preparation`
      });
      const input = resolve(workspace, `${profile.id}-source.glb`);
      const output = resolve(workspace, `${profile.id}.glb`);
      writeFileSync(input, rewritten.bytes, { mode: 0o600 });
      runGltfpack([
        '-i', input,
        '-o', output,
        '-cc',
        '-si', profile.simplify.ratio,
        '-se', profile.simplify.error,
        '-sp',
        '-vp', '14',
        '-vn', '10',
        '-vt', '12',
        '-kn',
        '-km',
        '-ke',
        '-af', '30'
      ]);
      bytes = readFileSync(output);
    }
    await verifyHegemonySupplyWagonBytes(bytes, profile, `${profile.id} supply-wagon runtime`);
    prepared.push({ profile, bytes });
  }

  const destinationRoot = ensureContainedDirectory({
    root,
    relativePath: HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY,
    label: 'Hegemony supply-wagon runtime directory'
  });
  installAtomicFileFamily({
    destinationRoot,
    entries: prepared.map(({ profile, bytes }) => ({
      bytes,
      label: `${profile.id} Hegemony supply-wagon runtime`,
      relativePath: profile.filename
    }))
  });
  prepared.forEach(({ profile }) => {
    console.log(`${profile.id}: ${profile.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.sha256}`);
  });
} finally {
  rmSync(workspace, { force: true, recursive: true });
}
