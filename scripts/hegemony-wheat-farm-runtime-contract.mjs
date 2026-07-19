import { createHash } from 'node:crypto';

export const HEGEMONY_WHEAT_FARM_RUNTIME_DIRECTORY =
  'public/models/hegemony/gathering-nodes/wheat-farm';
export const HEGEMONY_WHEAT_FARM_RUNTIME_RECORD =
  'docs/reference/resources/2026-07-18-hegemony-wheat-farm/runtime/manifest.json';

/**
 * The supplied delivery package is intentionally not committed. These
 * coordinates make the public, digest-bearing runtime family auditable without
 * acquiring, rewriting, or serving the owner-supplied delivery directory.
 */
export const HEGEMONY_WHEAT_FARM_SOURCE = Object.freeze({
  packageDirectory: 'Warpkeep_Windmill_Final_Delivery',
  runtimeRoot: 'Runtime',
  manifest: Object.freeze({
    filename: 'runtime-manifest.json',
    bytes: 2_845,
    sha256: '04beb96110a84593ebab8e2cd1b8fff59421a1eb498806bed2527dd43607a923'
  }),
  assetId: 'warpkeep.wheat-farm-node',
  version: '1.3.1',
  revision: 'final-manual-edit-2026-07-18'
});

const EXPECTED_ATTRIBUTES = Object.freeze([
  'COLOR_0',
  'NORMAL',
  'POSITION',
  'TEXCOORD_0'
]);
const EXPECTED_EXTENSIONS = Object.freeze(['KHR_materials_specular']);
const COMMON_BOUNDS = Object.freeze({
  max: Object.freeze([
    6.099999904632568,
    10.093255996704102,
    4.882011890411377
  ]),
  minX: -6.36284065246582,
  minZ: -4.77812385559082
});

/**
 * Ordered exactly as `runtime-manifest.json#lods`: High, Balanced, Compact.
 * The verifier rejects reordered or substituted source records before any
 * runtime GLB can be accepted as part of this family.
 */
export const HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    sourceFilename: 'Warpkeep_WheatFarm_LOD0_High_Runtime.glb',
    filename: 'hegemony-wheat-farm-high-d1437bc1cfe81ee.glb',
    bytes: 1_884_180,
    sha256: 'd1437bc1cfe81eef20cc5106acf849df919e6d4008a3b28d380a3d7194ed4ac7',
    triangles: 17_860,
    vertices: 40_320,
    tier: 'LOD0_High',
    nodeName: 'WK_WheatFarm_LOD0_High',
    meshName: 'WK_WheatFarm_LOD0_High_Mesh.001',
    nodeLod: 0,
    positionMin: Object.freeze([
      COMMON_BOUNDS.minX,
      -0.23537935316562653,
      COMMON_BOUNDS.minZ
    ]),
    positionMax: COMMON_BOUNDS.max
  }),
  Object.freeze({
    id: 'balanced',
    sourceFilename: 'Warpkeep_WheatFarm_LOD1_Balanced_Runtime.glb',
    filename: 'hegemony-wheat-farm-balanced-bab5cbb18b45b6a5.glb',
    bytes: 1_182_004,
    sha256: 'bab5cbb18b45b6a565e2070d4b3f6ed17916e81f70be72203f704eeb86260403',
    triangles: 10_906,
    vertices: 25_310,
    tier: 'LOD1_Balanced',
    nodeName: 'WK_WheatFarm_LOD1_Balanced',
    meshName: 'WK_WheatFarm_LOD1_Balanced_Mesh.001',
    nodeLod: 1,
    positionMin: Object.freeze([COMMON_BOUNDS.minX, 0, COMMON_BOUNDS.minZ]),
    positionMax: COMMON_BOUNDS.max
  }),
  Object.freeze({
    id: 'compact',
    sourceFilename: 'Warpkeep_WheatFarm_LOD2_Compact_Runtime.glb',
    filename: 'hegemony-wheat-farm-compact-a34bfdafd6b8923c.glb',
    bytes: 567_908,
    sha256: 'a34bfdafd6b8923c7cf90071d3ad097858fd59ca8df5cd2e776f44b967e9e3e6',
    triangles: 5_416,
    vertices: 12_102,
    tier: 'LOD2_Compact',
    nodeName: 'WK_WheatFarm_LOD2_Compact',
    meshName: 'WK_WheatFarm_LOD2_Compact_Mesh.001',
    nodeLod: 2,
    positionMin: Object.freeze([COMMON_BOUNDS.minX, 0, COMMON_BOUNDS.minZ]),
    positionMax: COMMON_BOUNDS.max
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
  return HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES.map((profile) => ({
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

/**
 * Kept for audited manual preparation only. Normal builds deliberately do not
 * read the external delivery package.
 */
export function assertHegemonyWheatFarmSourceManifest(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_WHEAT_FARM_SOURCE.manifest.bytes
    || sha256(bytes) !== HEGEMONY_WHEAT_FARM_SOURCE.manifest.sha256
  ) fail(label, 'does not match the exact supplied Wheat Farm manifest.');

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
    || manifest?.assetId !== HEGEMONY_WHEAT_FARM_SOURCE.assetId
    || manifest?.category !== 'GatheringNodes/Food'
    || manifest?.version !== HEGEMONY_WHEAT_FARM_SOURCE.version
    || manifest?.revision !== HEGEMONY_WHEAT_FARM_SOURCE.revision
    || manifest?.recommendedLod !== HEGEMONY_WHEAT_FARM_RUNTIME_PROFILES[0].sourceFilename
    || manifest?.provenance?.sourcePackage !== 'Warpkeep_WheatFarm_GameReady'
    || manifest?.provenance?.license !== 'Project-owned; authored for Warpkeep'
    || manifest?.runtimeContract?.gltfUp !== '+Y'
    || manifest?.runtimeContract?.frontFacing !== '+Z'
    || manifest?.runtimeContract?.interactionPivot !== 'footprint-center'
    || manifest?.runtimeContract?.embeddedTextures !== 0
    || manifest?.runtimeContract?.externalDependencies !== 0
    || manifest?.runtimeContract?.embeddedVertexColors !== true
    || manifest?.runtimeContract?.groundPlane !== 0
    || manifest?.runtimeContract?.groundEmbedMinimumZ !== -0.3
    || manifest?.runtimeContract?.materials !== 1
    || manifest?.runtimeContract?.meshObjects !== 1
    || manifest?.collision?.policy !== 'engine-side-simple-footprint'
    || manifest?.collision?.renderMeshCollision !== false
    || !exactArray(manifest?.collision?.halfExtents, [5.65, 4.45])
    || manifest?.collision?.selectionRadius !== 6.25
    || manifest?.validation?.cleanImportPassed !== true
    || manifest?.validation?.groundEmbedAuditPassed !== true
    || manifest?.validation?.contactAuditPassed !== true
    || JSON.stringify(receivedLods) !== JSON.stringify(expectedSourceLods())
  ) fail(label, 'identity, source LODs, or rendering contract changed.');
}

export function verifyHegemonyWheatFarmRuntimeBytes(bytes, profile, label) {
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
    || scene?.name !== 'WK_WheatFarm_EditableScene'
    || !exactArray(scene?.nodes, [0])
    || scene?.extras?.wk_asset !== 'wheat-farm-node'
    || scene?.extras?.wk_runtime_destination !== 'Warpkeep/Runtime/GatheringNodes/Food/WheatFarm'
    || scene?.extras?.wk_runtime_revision !== 'final-user-edit-delivery-2026-07-18'
    || scene?.extras?.wk_manual_edits_preserved !== true
    || scene?.extras?.wk_runtime_exports_provisional !== true
    || json.nodes?.length !== 1
    || node?.name !== profile.nodeName
    || node?.mesh !== 0
    || node?.extras?.wk_asset !== 'wheat-farm-node'
    || node?.extras?.wk_editable !== true
    || node?.extras?.wk_lod !== profile.nodeLod
    || node?.extras?.wk_origin_contract !== 'ground-plane-z0'
    || node?.extras?.wk_front_facing_gltf !== '+Z'
    || node?.extras?.wk_interaction_pivot !== 'footprint-center'
    || node?.extras?.wk_revision !== 'final-manual-edit-2026-07-18'
    || json.meshes?.length !== 1
    || mesh?.name !== profile.meshName
    || mesh?.primitives?.length !== 1
    || (primitive?.mode ?? 4) !== 4
    || primitive?.material !== 0
    || !exactArray(attributeNames, EXPECTED_ATTRIBUTES)
    || json.materials?.length !== 1
    || material?.name !== 'WK_WheatFarm_VertexColor_PBR'
    || material?.doubleSided !== true
    || (material?.alphaMode ?? 'OPAQUE') !== 'OPAQUE'
    || material?.pbrMetallicRoughness?.metallicFactor !== 0
    || material?.pbrMetallicRoughness?.roughnessFactor !== 0.7900000214576721
    || material?.extensions?.KHR_materials_specular?.specularFactor !== 0.4399999976158142
    || (json.images?.length ?? 0) !== 0
    || (json.animations?.length ?? 0) !== 0
    || (json.cameras?.length ?? 0) !== 0
    || !exactArray(json.extensionsUsed, EXPECTED_EXTENSIONS)
    || (json.extensionsRequired ?? []).length !== 0
    || hasExternalUri
    || indices?.componentType !== 5_123
    || indices?.count / 3 !== profile.triangles
    || position?.componentType !== 5_126
    || position?.type !== 'VEC3'
    || position?.count !== profile.vertices
    || !exactArray(position?.min, profile.positionMin)
    || !exactArray(position?.max, profile.positionMax)
  ) fail(label, 'does not satisfy the reviewed Wheat Farm runtime structure.');
}
