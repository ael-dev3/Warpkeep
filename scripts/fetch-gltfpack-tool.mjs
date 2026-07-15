import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmodSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import {
  GLTFPACK_VERSION,
  gltfpackToolPaths,
  resolveGltfpackToolSpec
} from './gltfpack-tool-config.mjs';
import { fetchPinnedGithubReleaseAsset } from './fetch-pinned-github-asset.mjs';
import { readExactResponseBody } from './read-exact-response-body.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';
import { readWarpkeepPackageVersion } from './warpkeep-package-version.mjs';

const root = resolve(import.meta.dirname, '..');
const repository = 'zeux/meshoptimizer';
const tag = `v${GLTFPACK_VERSION}`;
const spec = resolveGltfpackToolSpec();
const defaults = gltfpackToolPaths(root, spec);
const archive = process.env.WARPKEEP_GLTFPACK_ARCHIVE_CACHE
  ? resolve(process.env.WARPKEEP_GLTFPACK_ARCHIVE_CACHE)
  : defaults.archive;
const binary = process.env.WARPKEEP_GLTFPACK_BIN_CACHE
  ? resolve(process.env.WARPKEEP_GLTFPACK_BIN_CACHE)
  : defaults.binary;
const archiveTemporary = `${archive}.${process.pid}.tmp`;
const binaryTemporary = `${binary}.${process.pid}.tmp`;
const url = `https://github.com/${repository}/releases/download/${tag}/${spec.attachment}`;
const unzipBinary = resolveAttestedSystemUnzip();
const productVersion = readWarpkeepPackageVersion();

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExact(bytes, expectedBytes, expectedSha256, label) {
  if (bytes.byteLength !== expectedBytes) {
    throw new Error(`${label} byte length changed: ${bytes.byteLength}.`);
  }
  const hash = sha256(bytes);
  if (hash !== expectedSha256) throw new Error(`${label} hash changed: ${hash}.`);
}

function runUnzip(args, encoding = 'utf8') {
  const result = spawnSync(unzipBinary, args, {
    cwd: root,
    encoding,
    maxBuffer: 12 * 1024 * 1024
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`unzip failed (${result.status}): ${String(result.stderr).trim()}`);
  }
  return result.stdout;
}

mkdirSync(dirname(archive), { recursive: true, mode: 0o700 });
mkdirSync(dirname(binary), { recursive: true, mode: 0o700 });
try {
  const response = await fetchPinnedGithubReleaseAsset(url, {
    headers: { 'user-agent': `Warpkeep-tool-fetch/${productVersion}` },
    signal: AbortSignal.timeout(60_000)
  });
  if (!response.ok) throw new Error(`Tool download failed with HTTP ${response.status}.`);
  const archiveBytes = await readExactResponseBody(response, spec.archiveBytes, spec.attachment);
  assertExact(archiveBytes, spec.archiveBytes, spec.archiveSha256, spec.attachment);
  writeFileSync(archiveTemporary, archiveBytes, { mode: 0o600 });

  const entries = runUnzip(['-Z1', archiveTemporary]).split(/\r?\n/).filter(Boolean);
  if (entries.length !== 1 || entries[0] !== spec.binaryName) {
    throw new Error(`Unexpected gltfpack archive entries: ${JSON.stringify(entries)}.`);
  }
  const listing = runUnzip(['-Z', '-l', archiveTemporary]);
  if (listing.split(/\r?\n/).some((line) => /^l[rwx-]{9}\s/.test(line))) {
    throw new Error('The gltfpack archive contains a symbolic link.');
  }
  const binaryBytes = runUnzip(['-p', archiveTemporary, spec.binaryName], null);
  assertExact(binaryBytes, spec.binaryBytes, spec.binarySha256, spec.binaryName);
  writeFileSync(binaryTemporary, binaryBytes, { mode: 0o700 });

  renameSync(archiveTemporary, archive);
  renameSync(binaryTemporary, binary);
  chmodSync(archive, 0o600);
  chmodSync(binary, 0o700);
  if (statSync(binary).size !== spec.binaryBytes) throw new Error('Cached gltfpack write was incomplete.');
  console.log(`${repository}/${tag}/${spec.attachment}`);
  console.log(`${spec.archiveBytes} bytes, sha256 ${spec.archiveSha256}`);
  console.log(`${spec.binaryName}: ${spec.binaryBytes} bytes, sha256 ${spec.binarySha256}`);
  console.log(`cached at ${binary}`);
} finally {
  rmSync(archiveTemporary, { force: true });
  rmSync(binaryTemporary, { force: true });
}
