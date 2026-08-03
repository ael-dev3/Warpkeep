import { lstatSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';

import { HEGEMONY_TREE_RUNTIME_ASSETS } from './hegemony-tree-runtime-contract.mjs';
import {
  INNER_KEEP_ASSET_SELECTION,
  INNER_KEEP_ASSET_SELECTION_DIGEST,
  INNER_KEEP_PLANNED_RUNTIME_PATHS,
  INNER_KEEP_SELECTED_MODELS,
  INNER_KEEP_SELECTED_PREVIEWS,
  calculateInnerKeepAssetSelectionDigest
} from './inner-keep-runtime-asset-contract.mjs';

const ROOT = resolve(import.meta.dirname, '..');
const PLANNED_ROOTS = Object.freeze([
  'public/models/hegemony/inner-keep',
  'public/images/inner-keep/catalog'
]);

function fail(detail) {
  throw new Error(`Inner Keep runtime asset verification: ${detail}`);
}

function collectPresentEntries(relativePath) {
  const absolute = resolve(ROOT, relativePath);
  const status = lstatSync(absolute, { throwIfNoEntry: false });
  if (!status) return [];
  if (status.isSymbolicLink()) fail(`${relativePath} must not be a symbolic link.`);
  if (!status.isDirectory()) return [relativePath];
  return readdirSync(absolute, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => collectPresentEntries(`${relativePath}/${entry.name}`));
}

if (
  INNER_KEEP_ASSET_SELECTION.authorization.officialRepositoryRuntimeUseAuthorized !== false
  || INNER_KEEP_ASSET_SELECTION.authorization.status !== 'pending-owner-runtime-use-authorization'
) fail('authorization gate changed without a corresponding runtime verifier update.');

const observedDigest = calculateInnerKeepAssetSelectionDigest(INNER_KEEP_ASSET_SELECTION);
if (observedDigest !== INNER_KEEP_ASSET_SELECTION_DIGEST) {
  fail(`selection digest changed to ${observedDigest}.`);
}
if (
  INNER_KEEP_SELECTED_MODELS.length !== 108
  || INNER_KEEP_SELECTED_PREVIEWS.length !== 4
  || INNER_KEEP_PLANNED_RUNTIME_PATHS.length !== 112
) fail('curated allowlist cardinality changed.');

const leaked = PLANNED_ROOTS.flatMap(collectPresentEntries);
const individuallyPresent = INNER_KEEP_PLANNED_RUNTIME_PATHS.filter((path) => (
  lstatSync(resolve(ROOT, path), { throwIfNoEntry: false }) !== undefined
));
if (leaked.length > 0 || individuallyPresent.length > 0) {
  fail(
    'archive-only outputs exist before owner runtime-use authorization: '
    + [...new Set([...leaked, ...individuallyPresent])].sort().join(', ')
  );
}

const existingTreeIds = new Set(HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => asset.id));
for (const reused of INNER_KEEP_ASSET_SELECTION.existingRuntimeReuse) {
  if (!existingTreeIds.has(reused.assetId)) {
    fail(`authorized existing tree ${reused.assetId} is unavailable.`);
  }
}

console.log(
  `Verified the ${INNER_KEEP_SELECTED_MODELS.length}-GLB / `
    + `${INNER_KEEP_SELECTED_PREVIEWS.length}-preview Inner Keep allowlist, `
    + 'its pending authorization gate, and absence of archive-only runtime output.'
);
console.log(`Selection digest: ${INNER_KEEP_ASSET_SELECTION_DIGEST}`);
