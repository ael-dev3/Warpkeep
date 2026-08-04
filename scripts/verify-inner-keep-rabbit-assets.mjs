import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  INNER_KEEP_RABBIT_MODELS,
  INNER_KEEP_RABBIT_RUNTIME_DIRECTORY,
  INNER_KEEP_RABBIT_RUNTIME_PATHS,
  INNER_KEEP_RABBIT_SELECTION,
  INNER_KEEP_RABBIT_SELECTION_DIGEST,
  assertInnerKeepRabbitRuntimeUseAuthorized,
  calculateInnerKeepRabbitSelectionDigest,
  verifyInnerKeepRabbitGlb,
} from './inner-keep-rabbit-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PRODUCTION_DIRECTORY = INNER_KEEP_RABBIT_RUNTIME_DIRECTORY.replace(/^public\//u, '');

function fail(detail) {
  throw new Error(`Inner Keep rabbit runtime verification: ${detail}`);
}

function assertOrdinaryDirectoryChain(outputRoot, relativePath) {
  const absoluteRoot = resolve(outputRoot);
  const rootStatus = lstatSync(absoluteRoot, { throwIfNoEntry: false });
  if (!rootStatus?.isDirectory() || rootStatus.isSymbolicLink()) {
    fail('output root must be an ordinary non-symbolic directory.');
  }
  const destination = resolve(absoluteRoot, relativePath);
  const relation = relative(absoluteRoot, destination);
  if (relation === '' || relation === '..' || relation.startsWith(`..${sep}`)) {
    fail(`runtime directory escaped its output root: ${relativePath}.`);
  }
  let current = absoluteRoot;
  for (const component of relation.split(sep)) {
    current = join(current, component);
    const status = lstatSync(current, { throwIfNoEntry: false });
    if (!status?.isDirectory() || status.isSymbolicLink()) {
      fail(`runtime directory chain must be ordinary and non-symbolic: ${relativePath}.`);
    }
  }
}

function collectRegularFiles(outputRoot, relativePath) {
  const absolutePath = resolve(outputRoot, relativePath);
  const status = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!status) fail(`required path is missing: ${relativePath}.`);
  if (status.isSymbolicLink()) fail(`${relativePath} must not be a symbolic link.`);
  if (status.isFile()) return [relativePath];
  if (!status.isDirectory()) fail(`${relativePath} must be a regular file or directory.`);
  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectRegularFiles(outputRoot, `${relativePath}/${entry.name}`));
}

function readPinnedFile(outputRoot, relativePath, expectedBytes) {
  const absolutePath = resolve(outputRoot, relativePath);
  let descriptor;
  try {
    descriptor = openSync(absolutePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size !== expectedBytes) {
      fail(`${relativePath} must be an exact ${expectedBytes}-byte regular file.`);
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const status = lstatSync(absolutePath, { throwIfNoEntry: false });
    if (
      !status?.isFile()
      || status.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || status.dev !== after.dev
      || status.ino !== after.ino
      || status.size !== after.size
    ) fail(`${relativePath} changed while it was being verified.`);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Inner Keep rabbit runtime')) {
      throw error;
    }
    fail(`${relativePath} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function parseInnerKeepRabbitVerificationMode(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.length > 1) {
    fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
  }
  if (argumentsList.length === 0) return 'repository';
  if (argumentsList[0] === '--production-dist') return 'production-dist';
  fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
}

export function verifyInnerKeepRabbitRuntimeInstall(options = {}) {
  const mode = options.mode ?? parseInnerKeepRabbitVerificationMode(
    options.argumentsList ?? [],
  );
  if (!['repository', 'production-dist'].includes(mode)) {
    fail(`unsupported verification mode: ${String(mode)}.`);
  }
  assertInnerKeepRabbitRuntimeUseAuthorized();
  if (
    calculateInnerKeepRabbitSelectionDigest(INNER_KEEP_RABBIT_SELECTION)
      !== INNER_KEEP_RABBIT_SELECTION_DIGEST
    || INNER_KEEP_RABBIT_MODELS.length !== 3
    || INNER_KEEP_RABBIT_RUNTIME_PATHS.length !== 3
    || new Set(INNER_KEEP_RABBIT_RUNTIME_PATHS).size !== 3
  ) fail('exact selection digest or allowlist cardinality changed.');
  const production = mode === 'production-dist';
  const outputRoot = resolve(options.outputRoot ?? (production ? resolve(ROOT, 'dist') : ROOT));
  const directory = production ? PRODUCTION_DIRECTORY : INNER_KEEP_RABBIT_RUNTIME_DIRECTORY;
  assertOrdinaryDirectoryChain(outputRoot, directory);
  const expectedPaths = INNER_KEEP_RABBIT_RUNTIME_PATHS.map((path) => (
    production ? path.replace(/^public\//u, '') : path
  )).sort();
  const observedPaths = collectRegularFiles(outputRoot, directory).sort();
  if (
    observedPaths.length !== expectedPaths.length
    || observedPaths.some((path, index) => path !== expectedPaths[index])
  ) fail(`installed ${mode} output does not match the exact three-file allowlist.`);

  let totalBytes = 0;
  for (const model of INNER_KEEP_RABBIT_MODELS) {
    const path = production
      ? model.destinationPath.replace(/^public\//u, '')
      : model.destinationPath;
    const bytes = readPinnedFile(outputRoot, path, model.bytes);
    verifyInnerKeepRabbitGlb(bytes, model, path);
    totalBytes += bytes.byteLength;
  }
  if (totalBytes !== 230_536) fail(`installed byte budget changed to ${totalBytes}.`);
  return Object.freeze({
    mode,
    files: 3,
    bytes: totalBytes,
    digest: INNER_KEEP_RABBIT_SELECTION_DIGEST,
    presentationOnly: true,
  });
}

export function main(argumentsList = process.argv.slice(2)) {
  const result = verifyInnerKeepRabbitRuntimeInstall({ argumentsList });
  console.log(
    `Verified ${result.files} exact Lowlands Rabbit GLBs (${result.bytes} bytes) `
      + `in ${result.mode}; presentation-only, no gameplay authority.`,
  );
  console.log(`Selection digest: ${result.digest}`);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main();
