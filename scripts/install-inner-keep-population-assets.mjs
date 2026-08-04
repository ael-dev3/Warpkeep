import { spawnSync } from 'node:child_process';
import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';

import {
  ensureContainedDirectory,
  installAtomicFileFamily
} from './atomic-install-file-family.mjs';
import {
  INNER_KEEP_POPULATION_MODELS,
  INNER_KEEP_POPULATION_SELECTION,
  assertInnerKeepPopulationRuntimeUseAuthorized,
  innerKeepPopulationSha256,
  verifyInnerKeepPopulationGlb
} from './inner-keep-population-runtime-contract.mjs';
import { resolveAttestedSystemUnzip } from './system-unzip.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const DEFAULT_CACHE_ROOT = resolve(ROOT, '.cache/warpkeep-assets');

function fail(detail) {
  throw new Error(`Inner Keep population asset preparation: ${detail}`);
}

function archiveRecordByName() {
  return new Map(INNER_KEEP_POPULATION_SELECTION.sources.flatMap((source) => (
    source.attachments.map((attachment) => [attachment.name, {
      ...attachment,
      tag: source.tag
    }])
  )));
}

function exactOrdinaryFile(path, expected, label) {
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
      || innerKeepPopulationSha256(bytes) !== expected.sha256
    ) fail(`${label} changed while being read or does not match its SHA-256.`);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Inner Keep population asset')) {
      throw error;
    }
    fail(`${label} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function readArchiveMember(unzipBinary, archivePath, sourcePath) {
  const result = spawnSync(unzipBinary, ['-p', archivePath, sourcePath], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(`cannot read ${sourcePath} from ${archivePath}.`);
  }
  return result.stdout;
}

function archivePath(root, record) {
  return resolve(root, record.tag, record.name);
}

export function parseInnerKeepPopulationPreparationMode(argumentsList) {
  if (
    !Array.isArray(argumentsList)
    || argumentsList.length !== 1
    || !['--audit-only', '--install'].includes(argumentsList[0])
  ) fail('use exactly one mode: --audit-only or --install.');
  return argumentsList[0];
}

export function prepareInnerKeepPopulationAssets(options = {}) {
  const mode = parseInnerKeepPopulationPreparationMode(
    options.argumentsList ?? process.argv.slice(2)
  );
  assertInnerKeepPopulationRuntimeUseAuthorized();
  const cacheRoot = resolve(
    options.cacheRoot
      ?? process.env.WARPKEEP_INNER_KEEP_POPULATION_ARCHIVE_ROOT
      ?? DEFAULT_CACHE_ROOT
  );
  const archives = archiveRecordByName();
  const archiveBytesByName = new Map();
  for (const record of archives.values()) {
    const path = archivePath(cacheRoot, record);
    const bytes = exactOrdinaryFile(path, record, `${record.tag}/${record.name}`);
    archiveBytesByName.set(record.name, { bytes, path });
  }
  const unzipBinary = resolveAttestedSystemUnzip();
  const prepared = INNER_KEEP_POPULATION_MODELS.map((model) => {
    const archive = archiveBytesByName.get(model.sourceArchive);
    if (!archive) fail(`no exact archive is available for ${model.actorId}.`);
    const bytes = readArchiveMember(unzipBinary, archive.path, model.sourcePath);
    verifyInnerKeepPopulationGlb(bytes, model, model.destinationPath);
    return {
      bytes,
      destinationPath: model.destinationPath,
      label: `${model.actorId} ${model.profile}`
    };
  });
  for (const archive of archiveBytesByName.values()) archive.bytes.fill(0);
  if (mode === '--audit-only') {
    return Object.freeze({ mode, files: prepared.length, installed: false });
  }
  const directories = [...new Set(prepared.map((entry) => dirname(entry.destinationPath)))];
  for (const directory of directories) {
    ensureContainedDirectory({
      root: ROOT,
      relativePath: directory,
      label: 'Inner Keep population destination'
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
      return {
        bytes: entry.bytes,
        label: entry.label,
        relativePath: relation
      };
    })
  });
  return Object.freeze({ mode, files: prepared.length, installed: true });
}

export function main(argumentsList = process.argv.slice(2)) {
  const result = prepareInnerKeepPopulationAssets({ argumentsList });
  console.log(
    `${result.installed ? 'Installed' : 'Audited'} ${result.files} exact Inner Keep population GLBs.`
  );
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(import.meta.filename)) main();
