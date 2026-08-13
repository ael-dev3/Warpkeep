import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { basename, dirname, resolve } from 'node:path';

export const INNER_KEEP_ASSET_SELECTION_RECORD =
  'docs/reference/assets/2026-08-02-inner-keep-3d-library/manifest.json';
export const INNER_KEEP_ASSET_SELECTION_DIGEST =
  'cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d';
export const INNER_KEEP_ASSET_PROFILES = Object.freeze(['high', 'balanced', 'compact']);
export const INNER_KEEP_ASSET_AUTHORIZATION_INSTRUCTION =
  'Use Warpkeep-Assets 3D objects to populate the official Inner Keep runtime, with the Grand Covenant Cathedral as the main building.';
export const INNER_KEEP_ASSET_AUTHORIZATION_SCOPE_BOUNDARY =
  'Runtime use in the public ael-dev3/Warpkeep repository and official warpkeep.com client is authorized for the exact selected files. This does not relicense the source archives, authorize unrelated reuse, approve activation, approve merge, or approve deployment.';

const ROOT = resolve(import.meta.dirname, '..');
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EXPECTED_FAMILY_COUNTS = Object.freeze({
  buildings: 4,
  landmarks: 2,
  palisade: 6,
  stone: 4,
  'town-items': 19,
  trees: 3
});
const EXPECTED_REUSED_TREE_IDS = Object.freeze([
  'warpkeep.tree.cypress.ancient-dark',
  'warpkeep.tree.oak.spring-broad',
  'warpkeep.tree.spruce.deep-narrow'
]);

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

function deeplyFreeze(value) {
  if (Array.isArray(value)) value.forEach(deeplyFreeze);
  else if (value && typeof value === 'object') Object.values(value).forEach(deeplyFreeze);
  return Object.freeze(value);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => entry === expected[index]);
}

function finitePositiveDimensions(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => Number.isFinite(entry) && entry > 0);
}

function safeArchivePath(path, packageRoot) {
  if (
    typeof path !== 'string'
    || path.length === 0
    || path.includes('\\')
    || path.includes('\0')
    || path.startsWith('/')
    || /^[A-Za-z]:/u.test(path)
    || path !== path.normalize('NFC')
  ) return false;
  const segments = path.split('/');
  return segments[0] === packageRoot
    && segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function safeRepositoryPath(path, prefix, extension) {
  if (
    typeof path !== 'string'
    || !path.startsWith(prefix)
    || !path.endsWith(extension)
    || path.includes('\\')
    || path.includes('\0')
    || path !== path.normalize('NFC')
  ) return false;
  const segments = path.split('/');
  return segments.every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function calculateInnerKeepAssetSelectionDigest(record) {
  const canonicalSelection = {
    selectionId: record?.selectionId,
    sourceRelease: record?.sourceRelease,
    profiles: record?.selectionPolicy?.profiles,
    assets: record?.assets,
    existingRuntimeReuse: record?.existingRuntimeReuse
  };
  return sha256(Buffer.from(JSON.stringify(canonicalize(canonicalSelection)), 'utf8'));
}

function assertExactFileRecord(record, label) {
  const sourcePath = record?.path ?? record?.sourcePath;
  if (
    !record
    || typeof sourcePath !== 'string'
    || !Number.isSafeInteger(record.bytes)
    || record.bytes <= 0
    || typeof record.sha256 !== 'string'
    || !SHA256_PATTERN.test(record.sha256)
  ) fail(label, 'must pin a path, positive byte length, and SHA-256 digest.');
}

function assertAssetRecord(asset, release, seenIds, seenSources, seenDestinations) {
  const label = `Inner Keep asset ${asset?.id ?? '<unknown>'}`;
  if (
    !asset
    || typeof asset.id !== 'string'
    || !SAFE_ID_PATTERN.test(asset.id)
    || typeof asset.family !== 'string'
    || !(asset.family in EXPECTED_FAMILY_COUNTS)
    || typeof asset.sourcePackage !== 'string'
    || asset.sourcePackage.length === 0
    || typeof asset.sourceAssetId !== 'string'
    || asset.sourceAssetId.length === 0
    || typeof asset.displayName !== 'string'
    || asset.displayName.length === 0
    || typeof asset.intendedUse !== 'string'
    || asset.intendedUse.length === 0
    || !finitePositiveDimensions(asset.boundsMeters)
    || !Array.isArray(asset.models)
    || asset.models.length !== INNER_KEEP_ASSET_PROFILES.length
  ) fail(label, 'does not satisfy the reviewed selection shape.');
  if (seenIds.has(asset.id)) fail(label, 'duplicates another selected asset ID.');
  seenIds.add(asset.id);

  assertExactFileRecord(asset.sourceManifest, `${label} source manifest`);
  if (
    !safeArchivePath(asset.sourceManifest.path, release.attachment.packageRoot)
    || !asset.sourceManifest.path.startsWith(
      `${release.attachment.packageRoot}/3d/${asset.sourcePackage}/Runtime/`
    )
    || !asset.sourceManifest.path.endsWith('/runtime-manifest.json')
  ) fail(label, 'source manifest escaped its exact package runtime directory.');
  if (seenSources.has(asset.sourceManifest.path)) fail(label, 'duplicates another source manifest.');
  seenSources.add(asset.sourceManifest.path);

  asset.models.forEach((model, index) => {
    const profile = INNER_KEEP_ASSET_PROFILES[index];
    const modelLabel = `${label} ${profile} model`;
    if (
      !model
      || model.profile !== profile
      || !Number.isSafeInteger(model.bytes)
      || model.bytes <= 0
      || typeof model.sha256 !== 'string'
      || !SHA256_PATTERN.test(model.sha256)
      || !Number.isSafeInteger(model.triangles)
      || model.triangles <= 0
      || !finitePositiveDimensions(model.boundsMeters)
      || !safeArchivePath(model.sourcePath, release.attachment.packageRoot)
      || dirname(model.sourcePath) !== dirname(asset.sourceManifest.path)
      || !model.sourcePath.endsWith('.glb')
    ) fail(modelLabel, 'does not pin an exact selected GLB.');
    const expectedDestination =
      `public/models/hegemony/inner-keep/${asset.family}/inner-keep-${asset.id}-${profile}-`
      + `${model.sha256.slice(0, 16)}.glb`;
    if (
      model.destinationPath !== expectedDestination
      || !safeRepositoryPath(
        model.destinationPath,
        `public/models/hegemony/inner-keep/${asset.family}/`,
        '.glb'
      )
    ) fail(modelLabel, 'does not use its digest-bearing runtime destination.');
    if (seenSources.has(model.sourcePath)) fail(modelLabel, 'duplicates another selected source member.');
    if (seenDestinations.has(model.destinationPath)) fail(modelLabel, 'duplicates another destination.');
    seenSources.add(model.sourcePath);
    seenDestinations.add(model.destinationPath);
  });

  if (asset.family === 'buildings' || asset.family === 'landmarks') {
    assertExactFileRecord(asset.preview, `${label} catalogue preview`);
    if (
      asset.preview.width !== 320
      || asset.preview.height !== 320
      || !safeArchivePath(asset.preview.sourcePath, release.attachment.packageRoot)
      || !asset.preview.sourcePath.startsWith(
        `${release.attachment.packageRoot}/3d/${asset.sourcePackage}/Previews/`
      )
      || !asset.preview.sourcePath.endsWith('_MobilePreview_320.png')
      || asset.preview.destinationPath
        !== `public/images/inner-keep/catalog/${asset.id}-${asset.preview.sha256.slice(0, 16)}.png`
      || !safeRepositoryPath(
        asset.preview.destinationPath,
        'public/images/inner-keep/catalog/',
        '.png'
      )
    ) fail(label, 'catalogue preview does not satisfy the exact 320px content-addressed contract.');
    if (seenSources.has(asset.preview.sourcePath)) fail(label, 'duplicates another preview source.');
    if (seenDestinations.has(asset.preview.destinationPath)) fail(label, 'duplicates another destination.');
    seenSources.add(asset.preview.sourcePath);
    seenDestinations.add(asset.preview.destinationPath);
  } else if (asset.preview !== undefined) {
    fail(label, 'only buildable buildings and permanent landmarks may select catalogue previews.');
  }
}

export function assertInnerKeepAssetSelectionRecord(record) {
  const label = 'Inner Keep asset selection record';
  const release = record?.sourceRelease;
  if (
    !record
    || record.schema !== 'warpkeep.inner-keep-asset-selection.v1'
    || record.selectionId !== 'inner-keep-v1'
    || record.recordedAt !== '2026-08-04'
    || record.selectionDigestSha256 !== INNER_KEEP_ASSET_SELECTION_DIGEST
    || record.selectionDigestAlgorithm !== 'sha256-ecmascript-canonical-json-v1'
    || release?.repository !== 'ael-dev3/Warpkeep-Assets'
    || release?.repositoryMainCommit !== '10c84fbcc339f143ee6f25dfe7a0682660e0e458'
    || release?.releaseCommit !== '74033ebffb7f0a3ec371ccdabac10974bbe413b9'
    || release?.tag !== 'inner-keep-3d-asset-library-2026-08-02'
    || release?.attachment?.name !== 'inner-keep-3d-asset-library-2026-08-02-v1.zip'
    || release?.attachment?.bytes !== 234_962_670
    || release?.attachment?.sha256 !== 'f13bc9e7b8e32a6767b1959307a202d894123f384e11fd19550d75e0dfe5f6c9'
    || release?.attachment?.entries !== 1_347
    || release?.attachment?.packageRoot !== 'inner-keep-3d-asset-library-2026-08-02-v1'
    || release?.trustedReleaseManifest?.repositoryPath
      !== 'releases/inner-keep-3d-asset-library-2026-08-02/manifest.json'
    || release?.trustedReleaseManifest?.bytes !== 552_321
    || release?.trustedReleaseManifest?.sha256
      !== '67a31bee8c63718143a9071e9cb906f2229b9776c55d9d6fce3fd87bf2f032ae'
  ) fail(label, 'release identity or trusted-manifest coordinate changed.');
  if (
    record.authorization?.archiveDistributionAuthorized !== true
    || record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
    || record.authorization?.recordedAt !== '2026-08-04'
    || record.authorization?.instruction !== INNER_KEEP_ASSET_AUTHORIZATION_INSTRUCTION
    || record.authorization?.scopeBoundary !== INNER_KEEP_ASSET_AUTHORIZATION_SCOPE_BOUNDARY
  ) fail(label, 'must preserve the exact owner runtime-use authorization and its limits.');
  if (
    !exactArray(record.selectionPolicy?.profiles, INNER_KEEP_ASSET_PROFILES)
    || record.selectionPolicy?.sourceAssetCount !== 38
    || record.selectionPolicy?.sourceModelCount !== 114
    || record.selectionPolicy?.sourcePreviewCount !== 6
    || !exactArray(record.selectionPolicy?.excludedProfiles, ['LOD3_Map'])
    || !exactArray(record.selectionPolicy?.excludedPackages, [])
    || record.selectionPolicy?.inspectionCataloguesAllowed !== false
    || record.selectionPolicy?.editableSourcesAllowed !== false
    || record.selectionPolicy?.ordinaryBuildMayReadArchive !== false
    || record.selectionPolicy?.ordinaryBuildMayUseNetwork !== false
    || !Array.isArray(record.assets)
    || record.assets.length !== 38
  ) fail(label, 'selection cardinality or exclusion policy changed.');

  const seenIds = new Set();
  const seenSources = new Set();
  const seenDestinations = new Set();
  const familyCounts = Object.fromEntries(Object.keys(EXPECTED_FAMILY_COUNTS).map((family) => [family, 0]));
  record.assets.forEach((asset) => {
    assertAssetRecord(asset, release, seenIds, seenSources, seenDestinations);
    familyCounts[asset.family] += 1;
  });
  if (JSON.stringify(familyCounts) !== JSON.stringify(EXPECTED_FAMILY_COUNTS)) {
    fail(label, 'selected family counts changed.');
  }

  for (const profile of INNER_KEEP_ASSET_PROFILES) {
    const models = record.assets.flatMap((asset) => asset.models).filter((model) => model.profile === profile);
    const bytes = models.reduce((total, model) => total + model.bytes, 0);
    const triangles = models.reduce((total, model) => total + model.triangles, 0);
    if (
      record.qualityTotals?.[profile]?.bytes !== bytes
      || record.qualityTotals?.[profile]?.triangles !== triangles
    ) fail(label, `${profile} quality totals changed.`);
  }
  const allModelBytes = record.assets
    .flatMap((asset) => asset.models)
    .reduce((total, model) => total + model.bytes, 0);
  const previewBytes = record.assets
    .map((asset) => asset.preview?.bytes ?? 0)
    .reduce((total, bytes) => total + bytes, 0);
  if (
    record.selectedModelBytesAllProfiles !== allModelBytes
    || record.selectedPreviewBytes !== previewBytes
  ) fail(label, 'selected byte totals changed.');

  const reusedIds = record.existingRuntimeReuse?.map((entry) => entry?.assetId).sort();
  if (
    !exactArray(reusedIds, EXPECTED_REUSED_TREE_IDS)
    || record.existingRuntimeReuse.some((entry) => (
      entry.sourceRecord !== 'docs/reference/assets/2026-07-18-hegemony-environment-trees/manifest.json'
      || typeof entry.intendedUse !== 'string'
      || entry.intendedUse.length === 0
    ))
  ) fail(label, 'existing authorized tree reuse changed.');

  for (const asset of record.assets) {
    if (asset.models.some((model) => (
      model.sourcePath.includes('LOD3_Map')
      || model.sourcePath.toLocaleLowerCase('en-US').includes('catalogue')
      || model.sourcePath.toLocaleLowerCase('en-US').includes('inspection')
    ))) fail(label, 'an excluded map or inspection model entered the selected set.');
  }

  const digest = calculateInnerKeepAssetSelectionDigest(record);
  if (digest !== INNER_KEEP_ASSET_SELECTION_DIGEST) {
    fail(label, `selection digest changed to ${digest}.`);
  }
}

function readSelectionRecord() {
  let record;
  try {
    record = JSON.parse(readFileSync(resolve(ROOT, INNER_KEEP_ASSET_SELECTION_RECORD), 'utf8'));
  } catch (error) {
    fail(
      'Inner Keep asset selection record',
      `cannot be read (${error instanceof Error ? error.message : String(error)})`
    );
  }
  assertInnerKeepAssetSelectionRecord(record);
  return deeplyFreeze(record);
}

const RECORD = readSelectionRecord();

export const INNER_KEEP_ASSET_SELECTION = RECORD;
export const INNER_KEEP_SELECTED_ASSETS = RECORD.assets;
export const INNER_KEEP_SELECTED_MODELS = Object.freeze(
  RECORD.assets.flatMap((asset) => asset.models.map((model) => deeplyFreeze({
    ...model,
    assetId: asset.id,
    family: asset.family,
    sourceAssetId: asset.sourceAssetId,
    sourceManifest: asset.sourceManifest
  })))
);
export const INNER_KEEP_SELECTED_PREVIEWS = Object.freeze(
  RECORD.assets.filter((asset) => asset.preview).map((asset) => deeplyFreeze({
    ...asset.preview,
    assetId: asset.id,
    sourceAssetId: asset.sourceAssetId,
    sourceManifest: asset.sourceManifest
  }))
);
export const INNER_KEEP_SELECTED_SOURCE_MEMBERS = Object.freeze([
  ...RECORD.assets.map((asset) => asset.sourceManifest.path),
  ...INNER_KEEP_SELECTED_MODELS.map((model) => model.sourcePath),
  ...INNER_KEEP_SELECTED_PREVIEWS.map((preview) => preview.sourcePath)
].sort());
export const INNER_KEEP_PLANNED_RUNTIME_PATHS = Object.freeze([
  ...INNER_KEEP_SELECTED_MODELS.map((model) => model.destinationPath),
  ...INNER_KEEP_SELECTED_PREVIEWS.map((preview) => preview.destinationPath)
].sort());

export function assertInnerKeepRuntimeUseAuthorized(record = RECORD) {
  if (
    record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
  ) {
    fail(
      'Inner Keep runtime installation',
      'owner authorization for copying the selected archive-only assets into the public Warpkeep repository and official runtime is not recorded'
    );
  }
}

export function assertSafeInnerKeepArchiveMembers(observedPaths, expectedPaths, packageRoot) {
  if (!Array.isArray(observedPaths) || !Array.isArray(expectedPaths)) {
    fail('Inner Keep archive membership', 'observed and expected paths must be arrays.');
  }
  const normalized = new Set();
  const folded = new Set();
  for (const path of observedPaths) {
    if (!safeArchivePath(path, packageRoot)) {
      fail('Inner Keep archive membership', `unsafe member ${JSON.stringify(path)}.`);
    }
    const canonical = path.normalize('NFC');
    const caseFolded = canonical.toLocaleLowerCase('en-US');
    if (normalized.has(canonical) || folded.has(caseFolded)) {
      fail('Inner Keep archive membership', `normalized-path collision at ${JSON.stringify(path)}.`);
    }
    normalized.add(canonical);
    folded.add(caseFolded);
  }
  const observed = observedPaths.slice().sort();
  const expected = expectedPaths.slice().sort();
  if (!exactArray(observed, expected)) {
    fail(
      'Inner Keep archive membership',
      `changed from the trusted release manifest (expected ${expected.length}, received ${observed.length}).`
    );
  }
}

export function assertTrustedInnerKeepReleaseManifest(bytes) {
  const expected = RECORD.sourceRelease.trustedReleaseManifest;
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail('Inner Keep trusted release manifest', 'does not match its exact pinned bytes.');
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('Inner Keep trusted release manifest', 'is not valid JSON.');
  }
  const attachment = manifest?.attachments?.[0];
  if (
    manifest?.schemaVersion !== 1
    || manifest?.tag !== RECORD.sourceRelease.tag
    || manifest?.repository !== RECORD.sourceRelease.repository
    || manifest?.license?.status !== 'public-archive-authorized-no-separate-open-license'
    || manifest?.verification?.runtimeIntegration !== 'Current in-game integration is not asserted by this archive deposit.'
    || manifest?.attachments?.length !== 1
    || attachment?.name !== RECORD.sourceRelease.attachment.name
    || attachment?.bytes !== RECORD.sourceRelease.attachment.bytes
    || attachment?.sha256 !== RECORD.sourceRelease.attachment.sha256
    || !Array.isArray(attachment?.entries)
    || attachment.entries.length !== RECORD.sourceRelease.attachment.entries
  ) fail('Inner Keep trusted release manifest', 'release identity or license boundary changed.');
  const entryMap = new Map();
  for (const entry of attachment.entries) {
    assertExactFileRecord(entry, `Inner Keep release entry ${entry?.path ?? '<unknown>'}`);
    if (!safeArchivePath(entry.path, RECORD.sourceRelease.attachment.packageRoot)) {
      fail('Inner Keep trusted release manifest', `contains unsafe entry ${JSON.stringify(entry.path)}.`);
    }
    if (entryMap.has(entry.path)) {
      fail('Inner Keep trusted release manifest', `duplicates entry ${JSON.stringify(entry.path)}.`);
    }
    entryMap.set(entry.path, entry);
  }
  for (const asset of RECORD.assets) {
    const selected = [asset.sourceManifest, ...asset.models.map((model) => ({
      path: model.sourcePath,
      bytes: model.bytes,
      sha256: model.sha256
    }))];
    if (asset.preview) selected.push({
      path: asset.preview.sourcePath,
      bytes: asset.preview.bytes,
      sha256: asset.preview.sha256
    });
    for (const expectedEntry of selected) {
      const observed = entryMap.get(expectedEntry.path);
      if (
        observed?.bytes !== expectedEntry.bytes
        || observed?.sha256 !== expectedEntry.sha256
      ) fail('Inner Keep trusted release manifest', `does not attest ${expectedEntry.path}.`);
    }
  }
  return deeplyFreeze({ manifest, attachment, entryMap });
}

export function readInnerKeepGlbJson(bytes, label) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.byteLength < 20
    || bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) fail(label, 'is not an intact glTF 2.0 binary.');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonEnd > bytes.byteLength) {
    fail(label, 'has an invalid GLB JSON chunk.');
  }
  try {
    return JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8').trim());
  } catch {
    fail(label, 'has invalid GLB JSON.');
  }
}

export function verifyInnerKeepSelectedGlb(bytes, model, label) {
  if (
    !model
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength !== model.bytes
    || sha256(bytes) !== model.sha256
  ) fail(label, 'does not match its exact selected bytes.');
  const gltf = readInnerKeepGlbJson(bytes, label);
  const hasExternalUri = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');
  const triangles = (gltf.meshes ?? []).reduce((meshTotal, mesh) => (
    meshTotal + (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
      const indexAccessor = gltf.accessors?.[primitive.indices];
      const positionAccessor = gltf.accessors?.[primitive.attributes?.POSITION];
      const count = indexAccessor?.count ?? positionAccessor?.count;
      return primitiveTotal + (Number.isSafeInteger(count) ? count / 3 : Number.NaN);
    }, 0)
  ), 0);
  if (
    gltf.asset?.version !== '2.0'
    || !Array.isArray(gltf.meshes)
    || gltf.meshes.length === 0
    || hasExternalUri
    || triangles !== model.triangles
  ) fail(label, 'does not satisfy the selected embedded GLB structure.');
}

export function verifyInnerKeepSelectedPreview(bytes, preview, label) {
  if (
    !preview
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength !== preview.bytes
    || sha256(bytes) !== preview.sha256
    || bytes.byteLength < 24
    || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    || bytes.readUInt32BE(16) !== preview.width
    || bytes.readUInt32BE(20) !== preview.height
  ) fail(label, 'does not match the exact selected PNG preview.');
}

export function assertInnerKeepSelectedSourceManifest(bytes, asset, label) {
  const expected = asset?.sourceManifest;
  if (
    !expected
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength !== expected.bytes
    || sha256(bytes) !== expected.sha256
  ) fail(label, 'does not match its exact selected manifest bytes.');
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
  const identity = manifest.assetId ?? manifest.exactId ?? manifest.id;
  const sourceModels = manifest.lods ?? manifest.files;
  if (identity !== asset.sourceAssetId || !Array.isArray(sourceModels)) {
    fail(label, 'asset identity or LOD list changed.');
  }
  for (const model of asset.models) {
    const sourceFilename = basename(model.sourcePath);
    const source = sourceModels.find((entry) => entry?.file === sourceFilename);
    if (
      source?.bytes !== model.bytes
      || source?.sha256 !== model.sha256
      || source?.triangles !== model.triangles
    ) fail(label, `does not attest ${sourceFilename}.`);
  }
}
