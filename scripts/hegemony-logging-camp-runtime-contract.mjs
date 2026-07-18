import { createHash } from 'node:crypto';

export const HEGEMONY_LOGGING_CAMP_RUNTIME_DIRECTORY =
  'public/models/hegemony/gathering-nodes/logging-camp';
export const HEGEMONY_LOGGING_CAMP_RUNTIME_RECORD =
  'docs/reference/resources/2026-07-18-hegemony-logging-camp/runtime/manifest.json';

/**
 * The supplied delivery package is intentionally not committed. These
 * coordinates make the public, digest-bearing runtime family auditable without
 * acquiring, rewriting, or serving the owner-supplied delivery directory.
 */
export const HEGEMONY_LOGGING_CAMP_SOURCE = Object.freeze({
  packageDirectory: 'Warpkeep_LoggingCamp_GameReady',
  runtimeRoot: 'Runtime',
  manifest: Object.freeze({
    filename: 'runtime-manifest.json',
    bytes: 2_246,
    sha256: '0385c4e268445fe6529cb2d3285ee9bdd405f23f6ba8fecc8ccdf0d39a62cec2'
  }),
  files: Object.freeze([
    Object.freeze({
      id: 'high',
      filename: 'Warpkeep_LoggingCamp_LOD0_High_Runtime.glb',
      bytes: 689_328,
      sha256: 'a68c133a4a50654bc611de2b66e6d0d42729aaf0b91b59b7d2b7749566826f70'
    }),
    Object.freeze({
      id: 'balanced',
      filename: 'Warpkeep_LoggingCamp_LOD1_Balanced_Runtime.glb',
      bytes: 460_656,
      sha256: '227046f89c4150eec5b908cc75e162fa9ad489be123fc941714f9ad294b73593'
    }),
    Object.freeze({
      id: 'compact',
      filename: 'Warpkeep_LoggingCamp_LOD2_Compact_Runtime.glb',
      bytes: 236_252,
      sha256: 'ecea536ae18ef3ef5c6dc5eda158fa33d8e5d3a1e7848478c248a32efac1eccf'
    })
  ]),
  assetId: 'warpkeep.logging-camp-node',
  version: '1.0.0',
  revision: 'initial-editable-2026-07-18'
});

const EXPECTED_ATTRIBUTES = Object.freeze([
  'COLOR_0',
  'NORMAL',
  'POSITION',
  'TANGENT',
  'TEXCOORD_0'
]);
const EXPECTED_EXTENSIONS = Object.freeze(['KHR_materials_specular']);
const COMMON_POSITION_MIN = Object.freeze([
  -6.36284065246582,
  0,
  -4.77812385559082
]);
const COMMON_POSITION_MAX = Object.freeze([
  6.099999904632568,
  6.670000076293945,
  4.882011890411377
]);

/** Ordered exactly as `runtime-manifest.json#lods`: High, Balanced, Compact. */
export const HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    sourceFilename: HEGEMONY_LOGGING_CAMP_SOURCE.files[0].filename,
    filename: 'hegemony-logging-camp-high-a68c133a4a50654b.glb',
    bytes: 689_328,
    sha256: 'a68c133a4a50654bc611de2b66e6d0d42729aaf0b91b59b7d2b7749566826f70',
    triangles: 5_030,
    vertices: 10_952,
    tier: 'LOD0_High',
    nodeName: 'WK_LoggingCamp_LOD0_High',
    meshName: 'WK_LoggingCamp_LOD0_High_Mesh',
    nodeLod: 0,
    positionMin: COMMON_POSITION_MIN,
    positionMax: COMMON_POSITION_MAX
  }),
  Object.freeze({
    id: 'balanced',
    sourceFilename: HEGEMONY_LOGGING_CAMP_SOURCE.files[1].filename,
    filename: 'hegemony-logging-camp-balanced-227046f89c4150ee.glb',
    bytes: 460_656,
    sha256: '227046f89c4150eec5b908cc75e162fa9ad489be123fc941714f9ad294b73593',
    triangles: 3_318,
    vertices: 7_312,
    tier: 'LOD1_Balanced',
    nodeName: 'WK_LoggingCamp_LOD1_Balanced',
    meshName: 'WK_LoggingCamp_LOD1_Balanced_Mesh',
    nodeLod: 1,
    positionMin: COMMON_POSITION_MIN,
    positionMax: COMMON_POSITION_MAX
  }),
  Object.freeze({
    id: 'compact',
    sourceFilename: HEGEMONY_LOGGING_CAMP_SOURCE.files[2].filename,
    filename: 'hegemony-logging-camp-compact-ecea536ae18ef3ef.glb',
    bytes: 236_252,
    sha256: 'ecea536ae18ef3ef5c6dc5eda158fa33d8e5d3a1e7848478c248a32efac1eccf',
    triangles: 1_698,
    vertices: 3_734,
    tier: 'LOD2_Compact',
    nodeName: 'WK_LoggingCamp_LOD2_Compact',
    meshName: 'WK_LoggingCamp_LOD2_Compact_Mesh',
    nodeLod: 2,
    positionMin: COMMON_POSITION_MIN,
    positionMax: COMMON_POSITION_MAX
  })
]);

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function readGlbJson(bytes, label) {
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

function expectedSourceLods() {
  return HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES.map((profile) => ({
    file: profile.sourceFilename,
    bytes: profile.bytes,
    sha256: profile.sha256,
    tier: profile.tier,
    triangles: profile.triangles,
    vertices: profile.vertices
  }));
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Kept for audited offline preparation only. Normal builds do not read it. */
export function assertHegemonyLoggingCampSourceManifest(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_LOGGING_CAMP_SOURCE.manifest.bytes
    || sha256(bytes) !== HEGEMONY_LOGGING_CAMP_SOURCE.manifest.sha256
  ) fail(label, 'does not match the exact supplied Logging Camp manifest.');

  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }

  const receivedLods = manifest?.lods?.map((lod) => ({
    file: lod?.file,
    bytes: lod?.bytes,
    sha256: lod?.sha256,
    tier: lod?.tier,
    triangles: lod?.triangles,
    vertices: lod?.vertices
  }));
  if (
    manifest?.schema !== 'warpkeep.runtime-asset.v1'
    || manifest?.assetId !== HEGEMONY_LOGGING_CAMP_SOURCE.assetId
    || manifest?.category !== 'GatheringNodes/Wood'
    || manifest?.name !== 'Logging Camp Wood Gathering Node'
    || manifest?.version !== HEGEMONY_LOGGING_CAMP_SOURCE.version
    || manifest?.revision !== HEGEMONY_LOGGING_CAMP_SOURCE.revision
    || manifest?.recommendedLod !== HEGEMONY_LOGGING_CAMP_RUNTIME_PROFILES[0].sourceFilename
    || manifest?.provenance?.sourcePackage !== HEGEMONY_LOGGING_CAMP_SOURCE.packageDirectory
    || manifest?.provenance?.license !== 'Project-owned; authored for Warpkeep'
    || manifest?.runtimeContract?.gltfUp !== '+Y'
    || manifest?.runtimeContract?.frontFacing !== '+Z'
    || manifest?.runtimeContract?.interactionPivot !== 'footprint-center'
    || manifest?.runtimeContract?.editableSourceObjects !== 142
    || manifest?.runtimeContract?.embeddedTextures !== 0
    || manifest?.runtimeContract?.embeddedVertexColors !== true
    || manifest?.runtimeContract?.externalDependencies !== 0
    || manifest?.runtimeContract?.groundPlane !== 0
    || manifest?.runtimeContract?.materials !== 1
    || manifest?.runtimeContract?.meshObjects !== 1
    || !exactArray(manifest?.runtimeContract?.boundsBlender?.min, [-6.362841, -4.882012, 0])
    || !exactArray(manifest?.runtimeContract?.boundsBlender?.max, [6.1, 4.778124, 6.67])
    || !exactArray(manifest?.runtimeContract?.boundsBlender?.size, [12.462841, 9.660136, 6.67])
    || manifest?.collision?.policy !== 'engine-side-simple-footprint'
    || manifest?.collision?.recommendedShape !== 'oval or 10-vertex convex hull'
    || manifest?.collision?.renderMeshCollision !== false
    || !exactArray(manifest?.collision?.halfExtents, [5.65, 4.45])
    || manifest?.collision?.selectionRadius !== 6.25
    || manifest?.validation?.cleanImportPassed !== true
    || manifest?.validation?.contactAuditPassed !== true
    || manifest?.validation?.degenerateTriangles !== 0
    || manifest?.validation?.looseVertices !== 0
    || manifest?.validation?.unsupportedObjects !== 0
    || JSON.stringify(receivedLods) !== JSON.stringify(expectedSourceLods())
  ) fail(label, 'identity, source LODs, or rendering contract changed.');
}

export function verifyHegemonyLoggingCampRuntimeBytes(bytes, profile, label) {
  if (
    !profile
    || bytes.byteLength !== profile.bytes
    || sha256(bytes) !== profile.sha256
  ) fail(label, 'does not match its exact approved runtime bytes.');

  const json = readGlbJson(bytes, label);
  const scene = json.scenes?.[0];
  const node = json.nodes?.[0];
  const mesh = json.meshes?.[0];
  const primitive = mesh?.primitives?.[0];
  const position = json.accessors?.[primitive?.attributes?.POSITION];
  const indices = json.accessors?.[primitive?.indices];
  const material = json.materials?.[primitive?.material];
  const attributeNames = Object.keys(primitive?.attributes ?? {}).sort();
  const hasExternalUri = [...(json.buffers ?? []), ...(json.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');

  if (
    json.asset?.version !== '2.0'
    || json.asset?.generator !== 'Khronos glTF Blender I/O v5.2.39'
    || json.scene !== 0
    || json.scenes?.length !== 1
    || scene?.name !== 'WK_LoggingCamp_EditableScene'
    || !exactArray(scene?.nodes, [0])
    || json.nodes?.length !== 1
    || node?.name !== profile.nodeName
    || node?.mesh !== 0
    || node?.extras?.wk_asset !== 'logging-camp-node'
    || node?.extras?.wk_editable !== true
    || node?.extras?.wk_edit_group !== 'EDIT_06_Tools_Rope'
    || node?.extras?.wk_lod_detail !== 0
    || node?.extras?.wk_role !== 'embedded-axe-blade'
    || node?.extras?.wk_lod !== profile.nodeLod
    || node?.extras?.wk_origin_contract !== 'ground-plane-z0'
    || node?.extras?.wk_front_facing_blender !== '-Y'
    || node?.extras?.wk_front_facing_gltf !== '+Z'
    || node?.extras?.wk_interaction_pivot !== 'footprint-center'
    || node?.extras?.wk_collider_recommendation !== 'engine-side oval or 10-vertex convex footprint'
    || json.meshes?.length !== 1
    || mesh?.name !== profile.meshName
    || mesh?.primitives?.length !== 1
    || (primitive?.mode ?? 4) !== 4
    || primitive?.material !== 0
    || !exactArray(attributeNames, EXPECTED_ATTRIBUTES)
    || json.materials?.length !== 1
    || material?.name !== 'WK_LoggingCamp_VertexColor_PBR'
    || material?.doubleSided !== true
    || (material?.alphaMode ?? 'OPAQUE') !== 'OPAQUE'
    || material?.pbrMetallicRoughness?.metallicFactor !== 0
    || material?.pbrMetallicRoughness?.roughnessFactor !== 0.7900000214576721
    || material?.extensions?.KHR_materials_specular?.specularFactor !== 0.4399999976158142
    || (json.images?.length ?? 0) !== 0
    || (json.animations?.length ?? 0) !== 0
    || (json.cameras?.length ?? 0) !== 0
    || !exactArray(json.extensionsUsed, EXPECTED_EXTENSIONS)
    || !exactArray(json.extensionsRequired ?? [], [])
    || hasExternalUri
    || indices?.componentType !== 5_123
    || indices?.count / 3 !== profile.triangles
    || position?.componentType !== 5_126
    || position?.type !== 'VEC3'
    || position?.count !== profile.vertices
    || !exactArray(position?.min, profile.positionMin)
    || !exactArray(position?.max, profile.positionMax)
  ) fail(label, 'does not satisfy the reviewed Logging Camp runtime structure.');
}
