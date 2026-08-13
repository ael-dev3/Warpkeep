import { constants, closeSync, fstatSync, lstatSync, openSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  INNER_KEEP_POPULATION_MODELS,
  INNER_KEEP_POPULATION_RUNTIME_PATHS,
  INNER_KEEP_POPULATION_SELECTION,
  INNER_KEEP_POPULATION_SELECTION_DIGEST,
  assertInnerKeepPopulationRuntimeUseAuthorized,
  calculateInnerKeepPopulationSelectionDigest,
  verifyInnerKeepPopulationGlb
} from './inner-keep-population-runtime-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_POPULATION_ROOT = 'public/models/hegemony/inner-keep/population';
const PRODUCTION_POPULATION_ROOT = 'models/hegemony/inner-keep/population';

function fail(detail) {
  throw new Error(`Inner Keep population runtime verification: ${detail}`);
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
    if (!status) fail(`required runtime directory is missing: ${relativePath}.`);
    if (!status.isDirectory() || status.isSymbolicLink()) {
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

function readPinnedRuntimeFile(outputRoot, relativePath, expectedBytes) {
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
    const pathStatus = lstatSync(absolutePath, { throwIfNoEntry: false });
    if (
      !pathStatus?.isFile()
      || pathStatus.isSymbolicLink()
      || before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || pathStatus.dev !== after.dev
      || pathStatus.ino !== after.ino
      || pathStatus.size !== after.size
    ) fail(`${relativePath} changed while it was being verified.`);
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Inner Keep population runtime')) {
      throw error;
    }
    fail(`${relativePath} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function parseInnerKeepPopulationVerificationMode(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.length > 1) {
    fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
  }
  if (argumentsList.length === 0) return 'repository';
  if (argumentsList[0] === '--production-dist') return 'production-dist';
  fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
}

export function verifyInnerKeepPopulationRuntimeInstall(options = {}) {
  const mode = options.mode ?? parseInnerKeepPopulationVerificationMode(
    options.argumentsList ?? []
  );
  if (!['repository', 'production-dist'].includes(mode)) {
    fail(`unsupported verification mode: ${String(mode)}.`);
  }
  assertInnerKeepPopulationRuntimeUseAuthorized();
  if (
    INNER_KEEP_POPULATION_SELECTION.runtimePolicy.clientPresentationOnly !== true
    || INNER_KEEP_POPULATION_SELECTION.runtimePolicy.gameplayAuthorityClaimed !== false
    || INNER_KEEP_POPULATION_SELECTION.runtimePolicy.ordinaryBuildMayReadArchive !== false
    || INNER_KEEP_POPULATION_SELECTION.runtimePolicy.ordinaryBuildMayUseNetwork !== false
  ) fail('presentation-only or offline ordinary-build policy changed.');
  const observedDigest = calculateInnerKeepPopulationSelectionDigest(
    INNER_KEEP_POPULATION_SELECTION
  );
  if (observedDigest !== INNER_KEEP_POPULATION_SELECTION_DIGEST) {
    fail(`selection digest changed to ${observedDigest}.`);
  }
  if (
    INNER_KEEP_POPULATION_MODELS.length !== 40
    || INNER_KEEP_POPULATION_RUNTIME_PATHS.length !== 40
    || new Set(INNER_KEEP_POPULATION_RUNTIME_PATHS).size !== 40
  ) fail('exact population allowlist cardinality changed.');

  const production = mode === 'production-dist';
  const outputRoot = resolve(options.outputRoot ?? (production ? resolve(ROOT, 'dist') : ROOT));
  const populationRoot = production
    ? PRODUCTION_POPULATION_ROOT
    : REPOSITORY_POPULATION_ROOT;
  assertOrdinaryDirectoryChain(outputRoot, populationRoot);
  const expectedPaths = INNER_KEEP_POPULATION_RUNTIME_PATHS.map((path) => (
    production ? path.replace(/^public\//u, '') : path
  )).sort();
  const observedPaths = collectRegularFiles(outputRoot, populationRoot).sort();
  if (
    observedPaths.length !== expectedPaths.length
    || observedPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    fail(
      `installed ${production ? 'production' : 'repository'} output does not match the exact `
      + `40-file allowlist: observed=${observedPaths.length}, expected=${expectedPaths.length}.`
    );
  }

  let totalBytes = 0;
  for (const model of INNER_KEEP_POPULATION_MODELS) {
    const path = production
      ? model.destinationPath.replace(/^public\//u, '')
      : model.destinationPath;
    const bytes = readPinnedRuntimeFile(outputRoot, path, model.bytes);
    verifyInnerKeepPopulationGlb(bytes, model, path);
    totalBytes += bytes.byteLength;
  }
  if (totalBytes !== INNER_KEEP_POPULATION_SELECTION.counts.selectedBytes) {
    fail(`installed byte budget changed to ${totalBytes}.`);
  }
  return Object.freeze({
    mode,
    files: INNER_KEEP_POPULATION_MODELS.length,
    bytes: totalBytes,
    digest: INNER_KEEP_POPULATION_SELECTION_DIGEST,
    presentationOnly: true
  });
}

export function main(argumentsList = process.argv.slice(2)) {
  const mode = parseInnerKeepPopulationVerificationMode(argumentsList);
  const result = verifyInnerKeepPopulationRuntimeInstall({ mode });
  console.log(
    `Verified ${result.files} exact Inner Keep population GLBs (${result.bytes} bytes) `
      + `in ${result.mode}; presentation-only, no gameplay authority.`
  );
  console.log(`Selection digest: ${result.digest}`);
  return result;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) main();
