import {
  constants,
  closeSync,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync
} from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { HEGEMONY_TREE_RUNTIME_ASSETS } from './hegemony-tree-runtime-contract.mjs';
import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_ASSET_SELECTION_DIGEST,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
  assertInnerKeepRuntimeUseAuthorized,
  calculateInnerKeepAssetSelectionDigest,
  verifyInnerKeepSelectedGlb,
  verifyInnerKeepSelectedPreview
} from './inner-keep-runtime-asset-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const REPOSITORY_MODEL_ROOT = 'public/models/hegemony/inner-keep';
const REPOSITORY_PREVIEW_ROOT = 'public/images/inner-keep/catalog';
const REPOSITORY_POPULATION_ROOT = `${REPOSITORY_MODEL_ROOT}/population`;
const REPOSITORY_WILDLIFE_ROOT = `${REPOSITORY_MODEL_ROOT}/wildlife`;
const PRODUCTION_MODEL_ROOT = 'models/hegemony/inner-keep';
const PRODUCTION_PREVIEW_ROOT = 'images/inner-keep/catalog';
const PRODUCTION_POPULATION_ROOT = `${PRODUCTION_MODEL_ROOT}/population`;
const PRODUCTION_WILDLIFE_ROOT = `${PRODUCTION_MODEL_ROOT}/wildlife`;

function fail(detail) {
  throw new Error(`Inner Keep runtime asset verification: ${detail}`);
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

function collectRegularFiles(outputRoot, relativePath, ignoredPaths) {
  // Population and wildlife models have their own exact verifiers. Keep this
  // static selection closed over 114 models and six previews in public/ and dist/.
  if (ignoredPaths.includes(relativePath)) return [];
  const absolutePath = resolve(outputRoot, relativePath);
  const status = lstatSync(absolutePath, { throwIfNoEntry: false });
  if (!status) fail(`required path is missing: ${relativePath}.`);
  if (status.isSymbolicLink()) fail(`${relativePath} must not be a symbolic link.`);
  if (status.isFile()) return [relativePath];
  if (!status.isDirectory()) fail(`${relativePath} must be a regular file or directory.`);
  return readdirSync(absolutePath, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectRegularFiles(
      outputRoot,
      `${relativePath}/${entry.name}`,
      ignoredPaths
    ));
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
    if (error instanceof Error && error.message.startsWith('Inner Keep runtime asset')) {
      throw error;
    }
    fail(`${relativePath} cannot be read safely (${error instanceof Error ? error.message : String(error)}).`);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function parseInnerKeepAssetVerificationMode(argumentsList) {
  if (!Array.isArray(argumentsList) || argumentsList.length > 1) {
    fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
  }
  if (argumentsList.length === 0) return 'repository';
  if (argumentsList[0] === '--production-dist') return 'production-dist';
  fail('use no arguments for public/ verification or exactly --production-dist for dist/.');
}

export function verifyInnerKeepRuntimeAssetInstall(options = {}) {
  const mode = options.mode ?? parseInnerKeepAssetVerificationMode(
    options.argumentsList ?? []
  );
  if (!['repository', 'production-dist'].includes(mode)) {
    fail(`unsupported verification mode: ${String(mode)}.`);
  }
  assertInnerKeepRuntimeUseAuthorized();
  if (
    INNER_KEEP_ASSET_SELECTION.selectionPolicy.ordinaryBuildMayReadArchive !== false
    || INNER_KEEP_ASSET_SELECTION.selectionPolicy.ordinaryBuildMayUseNetwork !== false
  ) fail('offline ordinary-build policy changed.');
  const observedDigest = calculateInnerKeepAssetSelectionDigest(INNER_KEEP_ASSET_SELECTION);
  if (observedDigest !== INNER_KEEP_ASSET_SELECTION_DIGEST) {
    fail(`selection digest changed to ${observedDigest}.`);
  }
  if (
    INNER_KEEP_SELECTED_MODELS.length !== 114
    || INNER_KEEP_SELECTED_PREVIEWS.length !== 6
    || INNER_KEEP_PLANNED_RUNTIME_PATHS.length !== 120
    || new Set(INNER_KEEP_PLANNED_RUNTIME_PATHS).size !== 120
  ) fail('curated allowlist cardinality changed.');

  const production = mode === 'production-dist';
  const outputRoot = resolve(options.outputRoot ?? (production ? resolve(ROOT, 'dist') : ROOT));
  const modelRoot = production ? PRODUCTION_MODEL_ROOT : REPOSITORY_MODEL_ROOT;
  const previewRoot = production ? PRODUCTION_PREVIEW_ROOT : REPOSITORY_PREVIEW_ROOT;
  const populationRoot = production
    ? PRODUCTION_POPULATION_ROOT
    : REPOSITORY_POPULATION_ROOT;
  const wildlifeRoot = production
    ? PRODUCTION_WILDLIFE_ROOT
    : REPOSITORY_WILDLIFE_ROOT;
  const separatelyVerifiedRoots = Object.freeze([populationRoot, wildlifeRoot]);
  assertOrdinaryDirectoryChain(outputRoot, modelRoot);
  assertOrdinaryDirectoryChain(outputRoot, previewRoot);
  const expectedPaths = INNER_KEEP_PLANNED_RUNTIME_PATHS.map((path) => (
    production ? path.replace(/^public\//u, '') : path
  )).sort();
  const observedPaths = [
    ...collectRegularFiles(outputRoot, modelRoot, separatelyVerifiedRoots),
    ...collectRegularFiles(outputRoot, previewRoot, separatelyVerifiedRoots)
  ].sort();
  if (
    observedPaths.length !== expectedPaths.length
    || observedPaths.some((path, index) => path !== expectedPaths[index])
  ) {
    fail(
      `installed ${production ? 'production' : 'repository'} output does not match the exact `
      + `120-file allowlist: observed=${observedPaths.length}, expected=${expectedPaths.length}.`
    );
  }

  let totalBytes = 0;
  for (const model of INNER_KEEP_SELECTED_MODELS) {
    const path = production
      ? model.destinationPath.replace(/^public\//u, '')
      : model.destinationPath;
    const bytes = readPinnedRuntimeFile(outputRoot, path, model.bytes);
    verifyInnerKeepSelectedGlb(bytes, model, path);
    totalBytes += bytes.byteLength;
  }
  for (const preview of INNER_KEEP_SELECTED_PREVIEWS) {
    const path = production
      ? preview.destinationPath.replace(/^public\//u, '')
      : preview.destinationPath;
    const bytes = readPinnedRuntimeFile(outputRoot, path, preview.bytes);
    verifyInnerKeepSelectedPreview(bytes, preview, path);
    totalBytes += bytes.byteLength;
  }

  const existingTreeIds = new Set(HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => asset.id));
  for (const reused of INNER_KEEP_ASSET_SELECTION.existingRuntimeReuse) {
    if (!existingTreeIds.has(reused.assetId)) {
      fail(`authorized existing tree ${reused.assetId} is unavailable.`);
    }
  }
  return Object.freeze({
    mode,
    files: INNER_KEEP_SELECTED_MODELS.length + INNER_KEEP_SELECTED_PREVIEWS.length,
    models: INNER_KEEP_SELECTED_MODELS.length,
    previews: INNER_KEEP_SELECTED_PREVIEWS.length,
    bytes: totalBytes,
    digest: INNER_KEEP_ASSET_SELECTION_DIGEST,
    reusedTrees: INNER_KEEP_ASSET_SELECTION.existingRuntimeReuse.length
  });
}

export function main(argumentsList = process.argv.slice(2)) {
  const mode = parseInnerKeepAssetVerificationMode(argumentsList);
  const result = verifyInnerKeepRuntimeAssetInstall({ mode });
  console.log(
    `Verified ${result.models} exact Inner Keep static GLBs and ${result.previews} previews `
      + `(${result.bytes} bytes) in ${result.mode}, including embedded structure and tree reuse.`
  );
  console.log(`Selection digest: ${result.digest}`);
  return result;
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) main();
