import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const HEGEMONY_TREE_RUNTIME_DIRECTORY = 'public/models/hegemony/environment/trees';
export const HEGEMONY_TREE_RUNTIME_RECORD =
  'docs/reference/assets/2026-07-18-hegemony-environment-trees/manifest.json';

/**
 * The owner-supplied ZIP is intentionally not checked in. This immutable
 * coordinate makes the checked-in runtime family independently auditable.
 */
export const HEGEMONY_TREE_RUNTIME_BUNDLE = Object.freeze({
  filename: 'Warpkeep_Trees_Runtime_Bundle_2026-07-18.zip',
  bytes: 1_276_509,
  sha256: '8ff19bb2a9b4c779db0836ea8ab59f8d67abfd282d5b4cce70d48e062874f9e2',
  bundleRoot: 'Warpkeep_Trees_Runtime_Bundle_2026-07-18',
  runtimeRoot: 'Runtime/Environment/Trees'
});

const ROOT = resolve(import.meta.dirname, '..');
const EXPECTED_LODS = Object.freeze(['high', 'balanced', 'compact']);
const EXPECTED_ATTRIBUTES = Object.freeze([
  'COLOR_0',
  'NORMAL',
  'POSITION',
  'TANGENT',
  'TEXCOORD_0'
]);
const EXPECTED_EXTENSIONS = Object.freeze(['KHR_materials_specular']);
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_SEGMENT = /^[A-Za-z0-9_-]+$/u;
const TARGET_VISUAL_HEIGHT = 0.62;

function fail(label, detail) {
  throw new Error(String(label) + ': ' + detail);
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

function expectedSourceFilePath(asset, model) {
  return HEGEMONY_TREE_RUNTIME_BUNDLE.runtimeRoot
    + '/'
    + asset.sourceDirectory
    + '/'
    + model.sourceFilename;
}

function validateSourceFileRecord(record, label) {
  if (
    !record
    || typeof record.path !== 'string'
    || !Number.isSafeInteger(record.bytes)
    || record.bytes < 0
    || typeof record.sha256 !== 'string'
    || !SHA256_PATTERN.test(record.sha256)
  ) fail(label, 'must have a safe path, byte length, and SHA-256 digest.');
}

function validateAssetRecord(asset, seenAssets, seenModels) {
  const label = 'Hegemony tree asset ' + (asset?.id ?? '<unknown>');
  if (
    !asset
    || typeof asset.id !== 'string'
    || typeof asset.slug !== 'string'
    || typeof asset.name !== 'string'
    || !SAFE_SEGMENT.test(asset.slug)
    || !SAFE_SEGMENT.test(asset.sourceDirectory)
    || !Array.isArray(asset.biomes)
    || asset.biomes.length === 0
    || asset.biomes.some((biome) => typeof biome !== 'string' || biome.length === 0)
    || typeof asset.evergreen !== 'boolean'
    || !Number.isFinite(asset.weight)
    || asset.weight <= 0
    || !asset.geometryContract
    || !asset.collision
    || !asset.runtimeRandomization
    || !asset.sourceManifest
    || !Array.isArray(asset.models)
    || asset.models.length !== EXPECTED_LODS.length
  ) fail(label, 'does not satisfy the reviewed tree-family record shape.');
  if (seenAssets.has(asset.id)) fail(label, 'duplicates another tree asset id.');
  seenAssets.add(asset.id);

  const expectedManifestPath = HEGEMONY_TREE_RUNTIME_BUNDLE.runtimeRoot
    + '/'
    + asset.sourceDirectory
    + '/runtime-manifest.json';
  validateSourceFileRecord(asset.sourceManifest, label + ' source manifest');
  if (asset.sourceManifest.path !== expectedManifestPath) {
    fail(label, 'source manifest path is not contained at the expected package coordinate.');
  }

  asset.models.forEach((model, index) => {
    const modelLabel = label + ' ' + (model?.id ?? '<unknown>') + ' model';
    const expectedLod = EXPECTED_LODS[index];
    if (
      !model
      || model.id !== expectedLod
      || typeof model.sourceFilename !== 'string'
      || !SAFE_SEGMENT.test(model.sourceFilename.replace(/\.glb$/u, ''))
      || !model.sourceFilename.endsWith('.glb')
      || typeof model.filename !== 'string'
      || !model.filename.endsWith('.glb')
      || !Number.isSafeInteger(model.bytes)
      || model.bytes <= 0
      || typeof model.sha256 !== 'string'
      || !SHA256_PATTERN.test(model.sha256)
      || !Number.isSafeInteger(model.triangles)
      || model.triangles <= 0
      || !Number.isSafeInteger(model.uploadedVertices)
      || model.uploadedVertices <= 0
      || !Number.isFinite(model.normalizedFootprintDiameter)
      || model.normalizedFootprintDiameter <= 0
    ) fail(modelLabel, 'does not satisfy the reviewed immutable model shape.');
    const expectedFilename = 'hegemony-tree-'
      + asset.slug
      + '-'
      + model.id
      + '-'
      + model.sha256.slice(0, 16)
      + '.glb';
    if (
      model.filename !== expectedFilename
      || model.path !== HEGEMONY_TREE_RUNTIME_DIRECTORY + '/' + expectedFilename
      || model.sourcePath !== expectedSourceFilePath(asset, model)
    ) fail(modelLabel, 'does not use its exact digest-bearing runtime coordinate.');
    if (seenModels.has(model.filename)) fail(modelLabel, 'duplicates another runtime model filename.');
    seenModels.add(model.filename);
  });
}

function assertRuntimeRecord(record) {
  if (
    !record
    || record.schema !== 'warpkeep.environment-tree-runtime.v1'
    || record.assetFamilyId !== 'hegemony-environment-trees'
    || record.runtimeDirectory !== HEGEMONY_TREE_RUNTIME_DIRECTORY
    || !record.sourceBundle
    || record.sourceBundle.filename !== HEGEMONY_TREE_RUNTIME_BUNDLE.filename
    || record.sourceBundle.bytes !== HEGEMONY_TREE_RUNTIME_BUNDLE.bytes
    || record.sourceBundle.sha256 !== HEGEMONY_TREE_RUNTIME_BUNDLE.sha256
    || record.sourceBundle.bundleRoot !== HEGEMONY_TREE_RUNTIME_BUNDLE.bundleRoot
    || record.sourceBundle.runtimeRoot !== HEGEMONY_TREE_RUNTIME_BUNDLE.runtimeRoot
    || record.sourceBundle.assetCount !== 22
    || record.sourceBundle.glbCount !== 66
    || record.sourceBundle.runtimeManifestCount !== 22
    || record.sourceBundle.externalTextures !== false
    || record.sourceBundle.colorSource !== 'embedded vertex colors'
    || record.sourceBundle.authoringFilesIncluded !== false
    || !Array.isArray(record.assets)
    || record.assets.length !== 22
    || !record.authorization
    || record.runtimeContract?.targetVisualHeight !== TARGET_VISUAL_HEIGHT
    || typeof record.scopeBoundary !== 'string'
  ) fail('Hegemony tree runtime record', 'identity, provenance, or family cardinality changed.');

  const seenAssets = new Set();
  const seenModels = new Set();
  record.assets.forEach((asset) => validateAssetRecord(asset, seenAssets, seenModels));
  if (seenModels.size !== 66) {
    fail('Hegemony tree runtime record', 'does not enumerate all 66 required model LODs.');
  }
}

function readRuntimeRecord() {
  const path = resolve(ROOT, HEGEMONY_TREE_RUNTIME_RECORD);
  let record;
  try {
    record = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(
      'Hegemony tree runtime record cannot be read: '
      + (error instanceof Error ? error.message : String(error))
    );
  }
  assertRuntimeRecord(record);
  return deeplyFreeze(record);
}

const RECORD = readRuntimeRecord();

export const HEGEMONY_TREE_RUNTIME_MANIFEST = RECORD;
export const HEGEMONY_TREE_RUNTIME_ASSETS = RECORD.assets;
export const HEGEMONY_TREE_TARGET_VISUAL_HEIGHT = TARGET_VISUAL_HEIGHT;

export const HEGEMONY_TREE_RUNTIME_PROFILES = deeplyFreeze(
  HEGEMONY_TREE_RUNTIME_ASSETS.flatMap((asset) => asset.models.map((model) => ({
    ...model,
    assetId: asset.id,
    assetName: asset.name,
    sourceDirectory: asset.sourceDirectory
  })))
);

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function readHegemonyTreeGlbJson(bytes, label) {
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

/**
 * The source ZIP manifests contain a double-sided metadata discrepancy. This
 * validates the actual decoded immutable GLB contract instead of correcting
 * or rewriting any supplied model bytes.
 */
export function verifyHegemonyTreeRuntimeBytes(bytes, profile, label) {
  if (
    !profile
    || bytes.byteLength !== profile.bytes
    || sha256(bytes) !== profile.sha256
  ) fail(label, 'does not match its exact approved runtime bytes.');

  const json = readHegemonyTreeGlbJson(bytes, label);
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const position = json.accessors?.[primitive?.attributes?.POSITION];
  const indices = json.accessors?.[primitive?.indices];
  const material = json.materials?.[primitive?.material];
  const attributeNames = Object.keys(primitive?.attributes ?? {}).sort();
  const hasExternalUri = [...(json.buffers ?? []), ...(json.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');
  const requiredExtensions = json.extensionsRequired ?? [];
  const positionMinimum = position?.min;
  const positionMaximum = position?.max;
  const hasPositionBounds = Array.isArray(positionMinimum)
    && Array.isArray(positionMaximum)
    && positionMinimum.length === 3
    && positionMaximum.length === 3
    && positionMinimum.every(Number.isFinite)
    && positionMaximum.every(Number.isFinite);
  const sourceHeight = hasPositionBounds
    ? positionMaximum[1] - positionMinimum[1]
    : Number.NaN;
  const normalizedFootprintDiameter = hasPositionBounds
    ? Math.max(
        positionMaximum[0] - positionMinimum[0],
        positionMaximum[2] - positionMinimum[2]
      ) * TARGET_VISUAL_HEIGHT / sourceHeight
    : Number.NaN;

  if (
    json.asset?.version !== '2.0'
    || json.asset?.generator !== 'Khronos glTF Blender I/O v5.2.39'
    || json.scene !== 0
    || json.scenes?.length !== 1
    || !exactArray(json.scenes?.[0]?.nodes, [0])
    || json.nodes?.length !== 1
    || json.nodes?.[0]?.mesh !== 0
    || json.meshes?.length !== 1
    || json.meshes?.[0]?.primitives?.length !== 1
    || (primitive?.mode ?? 4) !== 4
    || primitive?.material !== 0
    || !exactArray(attributeNames, EXPECTED_ATTRIBUTES)
    || json.materials?.length !== 1
    || (material?.alphaMode ?? 'OPAQUE') !== 'OPAQUE'
    || material?.doubleSided !== true
    || (json.images?.length ?? 0) !== 0
    || (json.animations?.length ?? 0) !== 0
    || (json.cameras?.length ?? 0) !== 0
    || !exactArray(json.extensionsUsed, EXPECTED_EXTENSIONS)
    || requiredExtensions.length !== 0
    || hasExternalUri
    || indices?.componentType !== 5_123
    || indices?.count / 3 !== profile.triangles
    || position?.componentType !== 5_126
    || position?.type !== 'VEC3'
    || position?.count !== profile.uploadedVertices
    || !Number.isFinite(sourceHeight)
    || sourceHeight <= 0
    || !Number.isFinite(normalizedFootprintDiameter)
    || Math.abs(normalizedFootprintDiameter - profile.normalizedFootprintDiameter) > 0.000_000_001
  ) fail(label, 'does not satisfy the reviewed vertex-color tree runtime structure.');
}

export function assertHegemonyTreeBundleManifest(bytes, label) {
  const expected = RECORD.sourceBundle.bundleManifest;
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail(label, 'does not match the exact supplied tree-bundle manifest.');
  }
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
  if (
    manifest?.schema !== 'warpkeep.runtime-handoff-bundle.v1'
    || manifest?.bundleId !== 'warpkeep.trees.runtime.2026-07-18'
    || manifest?.runtimeRoot !== HEGEMONY_TREE_RUNTIME_BUNDLE.runtimeRoot
    || manifest?.assetCount !== 22
    || manifest?.glbCount !== 66
    || manifest?.runtimeManifestCount !== 22
    || manifest?.lodsPerAsset !== 3
    || manifest?.externalTextures !== false
    || manifest?.colorSource !== 'embedded vertex colors'
    || manifest?.authoringFilesIncluded !== false
  ) fail(label, 'identity or runtime-family contract changed.');
}

export function assertHegemonyTreeSourceManifest(bytes, asset, label) {
  const expected = asset?.sourceManifest;
  if (
    !expected
    || bytes.byteLength !== expected.bytes
    || sha256(bytes) !== expected.sha256
  ) fail(label, 'does not match its exact supplied per-asset manifest.');

  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
  const expectedFiles = asset.models.map((model) => ({
    file: model.sourceFilename,
    bytes: model.bytes,
    sha256: model.sha256,
    triangles: model.triangles,
    lod: model.lod
  }));
  const receivedFiles = manifest?.files?.map((entry) => ({
    file: entry?.file,
    bytes: entry?.bytes,
    sha256: entry?.sha256,
    triangles: entry?.triangles,
    lod: entry?.lod
  }));
  if (
    manifest?.schema !== 'warpkeep.runtime-asset.v1'
    || manifest?.assetId !== asset.id
    || !exactArray(
      receivedFiles?.map((entry) => JSON.stringify(entry)),
      expectedFiles.map((entry) => JSON.stringify(entry))
    )
  ) fail(label, 'identity or model inventory changed.');
}

export function assertHegemonyTreeSourceCatalog(bytes, expected, label) {
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    fail(label, 'does not match its exact supplied catalog bytes.');
  }
  try {
    const catalog = JSON.parse(bytes.toString('utf8'));
    if (catalog?.schema !== 'warpkeep.runtime-asset-catalog.v1') {
      fail(label, 'does not have the expected catalog schema.');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(String(label) + ':')) throw error;
    fail(label, 'is not valid JSON.');
  }
}
