import { spawnSync } from 'node:child_process';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, relative, resolve, sep } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily,
} from './atomic-install-file-family.mjs';
import { createAssetToolEnvironment } from './asset-tool-process.mjs';
import {
  INNER_KEEP_RABBIT_MODELS,
  INNER_KEEP_RABBIT_NESTED_MEMBERS,
  INNER_KEEP_RABBIT_SELECTION,
  assertInnerKeepRabbitBundleManifest,
  assertInnerKeepRabbitOuterManifest,
  assertInnerKeepRabbitRuntimeManifest,
  assertInnerKeepRabbitRuntimeUseAuthorized,
  assertTrustedInnerKeepRabbitReleaseManifest,
  innerKeepRabbitSha256,
  verifyInnerKeepRabbitGlb,
} from './inner-keep-rabbit-runtime-contract.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const RELEASE = INNER_KEEP_RABBIT_SELECTION.source;
const DEFAULT_CACHE_ROOT = resolve(ROOT, '.cache/warpkeep-assets', RELEASE.tag);

function fail(detail) {
  throw new Error(`Inner Keep rabbit asset preparation: ${detail}`);
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
      fail(`${label} must be an exact regular file of ${expected.bytes} bytes.`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const status = lstatSync(path, { throwIfNoEntry: false });
    if (
      !status?.isFile()
      || status.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || status.dev !== after.dev
      || status.ino !== after.ino
      || status.size !== after.size
      || bytes.byteLength !== after.size
      || innerKeepRabbitSha256(bytes) !== expected.sha256
    ) fail(`${label} changed while being read or does not match its SHA-256.`);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Inner Keep rabbit asset')) {
      throw error;
    }
    fail(`${label} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function runUnzip(
  unzipBinary,
  archive,
  argumentsList,
  workspace,
  encoding = 'utf8',
  maxBuffer = 8 * 1024 * 1024,
) {
  const result = spawnSync(unzipBinary, [...argumentsList, archive], {
    cwd: workspace,
    env: createAssetToolEnvironment(workspace),
    encoding,
    maxBuffer,
  });
  if (result.error || result.status !== 0) {
    fail(`cannot inspect ${archive} with the attested unzip binary.`);
  }
  return result.stdout;
}

function readArchiveMember(
  unzipBinary,
  archive,
  member,
  workspace,
  maxBuffer = 8 * 1024 * 1024,
) {
  const result = spawnSync(unzipBinary, ['-p', archive, member], {
    cwd: workspace,
    env: createAssetToolEnvironment(workspace),
    encoding: null,
    maxBuffer,
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(`cannot read ${member} from ${archive}.`);
  }
  return result.stdout;
}

function assertExactMembers(
  unzipBinary,
  archive,
  expectedMembers,
  workspace,
  directoryMembers = new Set(),
) {
  const observed = String(runUnzip(unzipBinary, archive, ['-Z1'], workspace))
    .split(/\r?\n/u)
    .filter(Boolean);
  const expected = [...expectedMembers];
  if (
    observed.length !== expected.length
    || [...observed].sort().some((member, index) => member !== [...expected].sort()[index])
    || observed.some((member) => (
      member.startsWith('/')
      || member.includes('\\')
      || member.includes('\0')
      || member !== member.normalize('NFC')
      || member.split('/').filter(Boolean).some((segment) => segment === '.' || segment === '..')
    ))
  ) fail(`${archive} member set changed or contains an unsafe path.`);

  const detailLines = String(runUnzip(unzipBinary, archive, ['-Z', '-l'], workspace))
    .split(/\r?\n/u)
    .filter((line) => /^[bcdlps-][rwxStT-]{9}\s/u.test(line));
  if (
    detailLines.length !== expected.length
    || detailLines.some((line, index) => (
      directoryMembers.has(observed[index]) ? !line.startsWith('d') : !line.startsWith('-')
    ))
  ) fail(`${archive} contains an unexpected symbolic or special member.`);
}

function exactMember(bytes, expected, label) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.byteLength !== expected.bytes
    || innerKeepRabbitSha256(bytes) !== expected.sha256
  ) fail(`${label} does not match its pinned archive entry.`);
  return bytes;
}

export function parseInnerKeepRabbitPreparationMode(argumentsList) {
  if (
    !Array.isArray(argumentsList)
    || argumentsList.length !== 1
    || !['--audit-only', '--install'].includes(argumentsList[0])
  ) fail('use exactly one mode: --audit-only or --install.');
  return argumentsList[0];
}

export function prepareInnerKeepRabbitAssets(options = {}) {
  const mode = parseInnerKeepRabbitPreparationMode(
    options.argumentsList ?? process.argv.slice(2),
  );
  assertInnerKeepRabbitRuntimeUseAuthorized();
  const archivePath = options.archivePath ?? resolveInputPath(
    'WARPKEEP_INNER_KEEP_RABBIT_ARCHIVE',
    resolve(DEFAULT_CACHE_ROOT, RELEASE.attachment.name),
  );
  const releaseManifestPath = options.releaseManifestPath ?? resolveInputPath(
    'WARPKEEP_INNER_KEEP_RABBIT_RELEASE_MANIFEST',
    resolve(DEFAULT_CACHE_ROOT, 'manifest.json'),
  );
  const releaseManifestBytes = readExactOrdinaryFile(
    releaseManifestPath,
    RELEASE.trustedReleaseManifest,
    'trusted Warpkeep-Assets rabbit release manifest',
  );
  assertTrustedInnerKeepRabbitReleaseManifest(releaseManifestBytes);
  const archiveBytes = readExactOrdinaryFile(
    archivePath,
    RELEASE.attachment,
    `${RELEASE.tag}/${RELEASE.attachment.name}`,
  );
  const workspace = mkdtempSync(resolve(tmpdir(), 'warpkeep-inner-keep-rabbit-'));
  const verifiedOuterArchive = resolve(workspace, RELEASE.attachment.name);
  const verifiedNestedArchive = resolve(workspace, 'Warpkeep_Rabbit_Runtime_UI_Bundle_2026-07-30.zip');
  try {
    writeFileSync(verifiedOuterArchive, archiveBytes, { flag: 'wx', mode: 0o600 });
    archiveBytes.fill(0);
    const unzipBinary = resolveAttestedSystemUnzip();
    const outerMembers = RELEASE.outerEntries.map((entry) => entry.path);
    assertExactMembers(unzipBinary, verifiedOuterArchive, outerMembers, workspace);
    const outerByPath = new Map(RELEASE.outerEntries.map((entry) => [entry.path, entry]));
    for (const member of outerMembers) {
      const bytes = exactMember(
        readArchiveMember(unzipBinary, verifiedOuterArchive, member, workspace),
        outerByPath.get(member),
        member,
      );
      if (member.endsWith('/manifest.json')) assertInnerKeepRabbitOuterManifest(bytes);
      if (member === RELEASE.nestedPackage.path) {
        writeFileSync(verifiedNestedArchive, bytes, { flag: 'wx', mode: 0o600 });
      }
    }

    const nestedDirectories = new Set(
      INNER_KEEP_RABBIT_NESTED_MEMBERS.filter((member) => member.endsWith('/')),
    );
    assertExactMembers(
      unzipBinary,
      verifiedNestedArchive,
      INNER_KEEP_RABBIT_NESTED_MEMBERS,
      workspace,
      nestedDirectories,
    );
    const runtimeManifestBytes = exactMember(
      readArchiveMember(
        unzipBinary,
        verifiedNestedArchive,
        RELEASE.runtimeManifest.path,
        workspace,
      ),
      RELEASE.runtimeManifest,
      'Rabbit runtime manifest',
    );
    assertInnerKeepRabbitRuntimeManifest(runtimeManifestBytes);
    const bundleManifestBytes = exactMember(
      readArchiveMember(
        unzipBinary,
        verifiedNestedArchive,
        RELEASE.bundleManifest.path,
        workspace,
      ),
      RELEASE.bundleManifest,
      'Rabbit nested bundle manifest',
    );
    assertInnerKeepRabbitBundleManifest(bundleManifestBytes);

    const prepared = INNER_KEEP_RABBIT_MODELS.map((model) => {
      const bytes = readArchiveMember(
        unzipBinary,
        verifiedNestedArchive,
        model.sourcePath,
        workspace,
      );
      verifyInnerKeepRabbitGlb(bytes, model, `Lowlands Rabbit ${model.profile}`);
      return {
        bytes,
        destinationPath: model.destinationPath,
        label: `Lowlands Rabbit ${model.profile}`,
      };
    });
    if (mode === '--audit-only') {
      return Object.freeze({ mode, files: prepared.length, installed: false });
    }
    for (const directory of new Set(prepared.map((entry) => dirname(entry.destinationPath)))) {
      ensureContainedDirectory({
        root: ROOT,
        relativePath: directory,
        label: 'Inner Keep rabbit runtime destination',
      });
    }
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
        return { bytes: entry.bytes, label: entry.label, relativePath: relation };
      }),
    });
    return Object.freeze({ mode, files: prepared.length, installed: true });
  } finally {
    archiveBytes.fill(0);
    rmSync(workspace, { force: true, recursive: true });
  }
}

export function main(argumentsList = process.argv.slice(2)) {
  const result = prepareInnerKeepRabbitAssets({ argumentsList });
  console.log(
    `${result.installed ? 'Installed' : 'Audited'} ${result.files} exact Lowlands Rabbit GLBs; `
      + 'presentation-only, no gameplay authority.',
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
