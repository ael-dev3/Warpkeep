import { spawnSync } from 'node:child_process';
import { constants, closeSync, fstatSync, lstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { createAssetToolEnvironment } from './asset-tool-process.mjs';
import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';
import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_ASSET_SELECTION_DIGEST,
  INNER_KEEP_SELECTED_ASSETS,
  assertInnerKeepRuntimeUseAuthorized,
  assertInnerKeepSelectedSourceManifest,
  assertSafeInnerKeepArchiveMembers,
  assertTrustedInnerKeepReleaseManifest,
  sha256,
  verifyInnerKeepSelectedGlb,
  verifyInnerKeepSelectedPreview
} from './inner-keep-runtime-asset-contract.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RELEASE = INNER_KEEP_ASSET_SELECTION.sourceRelease;
const DEFAULT_CACHE_ROOT = resolve(ROOT, '.cache/warpkeep-assets', RELEASE.tag);

function fail(detail) {
  throw new Error(`Inner Keep runtime asset preparation: ${detail}`);
}

function resolveInputPath(environmentName, fallback) {
  const value = process.env[environmentName];
  return value ? resolve(value) : fallback;
}

function readExactOrdinaryFile(path, expected, label) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size !== expected.bytes) {
      fail(`${label} must be an exact regular non-symbolic file of ${expected.bytes} bytes.`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const pathStatus = lstatSync(path, { throwIfNoEntry: false });
    if (
      !pathStatus?.isFile()
      || pathStatus.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || pathStatus.dev !== after.dev
      || pathStatus.ino !== after.ino
      || pathStatus.size !== after.size
      || bytes.byteLength !== after.size
      || sha256(bytes) !== expected.sha256
    ) fail(`${label} does not match its exact pinned bytes.`);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Inner Keep runtime asset preparation:')) {
      throw error;
    }
    fail(`${label} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function makeUnzipRunner(unzipBinary, archive, workspace) {
  const environment = createAssetToolEnvironment(workspace);
  return (args, encoding = 'utf8', maxBuffer = 8 * 1024 * 1024) => {
    const result = spawnSync(unzipBinary, [...args, archive], {
      cwd: workspace,
      env: environment,
      encoding,
      maxBuffer
    });
    if (result.error) fail(`unzip failed (${result.error.message}).`);
    if (result.status !== 0) {
      fail(`unzip failed (${result.status}): ${String(result.stderr).trim()}`);
    }
    return result.stdout;
  };
}

function makeArchiveReader(unzipBinary, archive, workspace) {
  const environment = createAssetToolEnvironment(workspace);
  return (member, maxBuffer = 8 * 1024 * 1024) => {
    const result = spawnSync(unzipBinary, ['-p', archive, member], {
      cwd: workspace,
      env: environment,
      encoding: null,
      maxBuffer
    });
    if (result.error) fail(`cannot read ${member} (${result.error.message}).`);
    if (result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
      fail(`cannot read ${member} from the trusted archive (${result.status}).`);
    }
    return result.stdout;
  };
}

function assertOnlyRegularZipMembers(listing, expectedCount) {
  const memberLines = String(listing)
    .split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxStT-]{9}\s/u.test(line));
  if (
    memberLines.length !== expectedCount
    || memberLines.some((line) => !line.startsWith('-'))
  ) fail('archive contains a symbolic link, directory, or other non-regular member.');
}

function exactMember(bytes, record, label) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.byteLength !== record.bytes
    || sha256(bytes) !== record.sha256
  ) fail(`${label} does not match its trusted release-manifest entry.`);
  return bytes;
}

function ensureInstallDirectories(paths) {
  const directories = [...new Set(paths.map((path) => dirname(path)))].sort();
  for (const directory of directories) {
    ensureContainedDirectory({
      root: ROOT,
      relativePath: directory,
      label: 'Inner Keep runtime destination'
    });
  }
}

function installPreparedOutputs(prepared) {
  ensureInstallDirectories(prepared.map((entry) => entry.destinationPath));
  const publicRoot = resolve(ROOT, 'public');
  installAtomicFileFamily({
    destinationRoot: publicRoot,
    entries: prepared.map((entry) => {
      const destination = resolve(ROOT, entry.destinationPath);
      const relation = relative(publicRoot, destination);
      if (
        relation === ''
        || relation === '..'
        || relation.startsWith(`..${sep}`)
        || relation.startsWith('/')
      ) fail(`destination escaped public/: ${entry.destinationPath}.`);
      return {
        bytes: entry.bytes,
        label: entry.label,
        relativePath: relation
      };
    })
  });
}

export function parseInnerKeepAssetPreparationMode(argumentsList) {
  if (
    !Array.isArray(argumentsList)
    || argumentsList.length !== 1
    || !['--audit-only', '--install'].includes(argumentsList[0])
  ) fail('use exactly one mode: --audit-only or --install.');
  return argumentsList[0];
}

export function auditInnerKeepArchive(options = {}) {
  const archivePath = options.archivePath ?? resolveInputPath(
    'WARPKEEP_INNER_KEEP_ARCHIVE',
    resolve(DEFAULT_CACHE_ROOT, RELEASE.attachment.name)
  );
  const releaseManifestPath = options.releaseManifestPath ?? resolveInputPath(
    'WARPKEEP_INNER_KEEP_RELEASE_MANIFEST',
    resolve(DEFAULT_CACHE_ROOT, 'manifest.json')
  );
  const releaseManifestBytes = readExactOrdinaryFile(
    releaseManifestPath,
    RELEASE.trustedReleaseManifest,
    'trusted Warpkeep-Assets release manifest'
  );
  const trusted = assertTrustedInnerKeepReleaseManifest(releaseManifestBytes);
  const archiveBytes = readExactOrdinaryFile(
    archivePath,
    RELEASE.attachment,
    `${RELEASE.tag}/${RELEASE.attachment.name}`
  );
  const workspace = mkdtempSync(resolve(tmpdir(), 'warpkeep-inner-keep-assets-'));
  const validationArchive = resolve(workspace, RELEASE.attachment.name);
  try {
    writeFileSync(validationArchive, archiveBytes, { flag: 'wx', mode: 0o600 });
    archiveBytes.fill(0);
    const unzipBinary = resolveAttestedSystemUnzip();
    const runUnzip = makeUnzipRunner(unzipBinary, validationArchive, workspace);
    const readMember = makeArchiveReader(unzipBinary, validationArchive, workspace);
    const observedPaths = String(runUnzip(['-Z1']))
      .split(/\r?\n/u)
      .filter(Boolean);
    const expectedPaths = trusted.attachment.entries.map((entry) => entry.path);
    assertSafeInnerKeepArchiveMembers(
      observedPaths,
      expectedPaths,
      RELEASE.attachment.packageRoot
    );
    assertOnlyRegularZipMembers(runUnzip(['-Z', '-l']), RELEASE.attachment.entries);

    const prepared = [];
    for (const asset of INNER_KEEP_SELECTED_ASSETS) {
      const manifestBytes = exactMember(
        readMember(asset.sourceManifest.path),
        asset.sourceManifest,
        `${asset.displayName} runtime manifest`
      );
      assertInnerKeepSelectedSourceManifest(
        manifestBytes,
        asset,
        `${asset.displayName} runtime manifest`
      );
      for (const model of asset.models) {
        const bytes = exactMember(
          readMember(model.sourcePath, Math.max(8 * 1024 * 1024, model.bytes + 1024)),
          model,
          `${asset.displayName} ${model.profile} GLB`
        );
        verifyInnerKeepSelectedGlb(bytes, model, `${asset.displayName} ${model.profile} GLB`);
        prepared.push({
          bytes,
          destinationPath: model.destinationPath,
          label: `${asset.displayName} ${model.profile} Inner Keep runtime`
        });
      }
      if (asset.preview) {
        const bytes = exactMember(
          readMember(asset.preview.sourcePath),
          asset.preview,
          `${asset.displayName} catalogue preview`
        );
        verifyInnerKeepSelectedPreview(bytes, asset.preview, `${asset.displayName} catalogue preview`);
        prepared.push({
          bytes,
          destinationPath: asset.preview.destinationPath,
          label: `${asset.displayName} Inner Keep catalogue preview`
        });
      }
    }
    return Object.freeze({
      archivePath,
      releaseManifestPath,
      prepared,
      assetCount: INNER_KEEP_SELECTED_ASSETS.length,
      modelCount: prepared.filter((entry) => entry.destinationPath.endsWith('.glb')).length,
      previewCount: prepared.filter((entry) => entry.destinationPath.endsWith('.png')).length
    });
  } finally {
    archiveBytes.fill(0);
    rmSync(workspace, { force: true, recursive: true });
  }
}

export function main(argumentsList = process.argv.slice(2)) {
  const mode = parseInnerKeepAssetPreparationMode(argumentsList);
  if (mode === '--install') assertInnerKeepRuntimeUseAuthorized();
  const result = auditInnerKeepArchive();
  if (mode === '--install') {
    installPreparedOutputs(result.prepared);
    console.log(
      `Installed ${result.modelCount} selected Inner Keep GLBs and ${result.previewCount} previews.`
    );
  } else {
    console.log(
      `Audited ${result.assetCount} selected Inner Keep assets, ${result.modelCount} GLBs, and `
      + `${result.previewCount} previews without writing runtime output.`
    );
  }
  console.log(`Selection digest: ${INNER_KEEP_ASSET_SELECTION_DIGEST}`);
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) main();
