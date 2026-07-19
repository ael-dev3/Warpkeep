import { createHash } from 'node:crypto';

export const HEGEMONY_STONE_QUARRY_RUNTIME_DIRECTORY =
  'public/models/hegemony/gathering-nodes/stone-quarry';
export const HEGEMONY_STONE_QUARRY_RUNTIME_RECORD =
  'docs/reference/resources/2026-07-18-hegemony-stone-quarry/runtime/manifest.json';

/**
 * The external owner-supplied delivery is deliberately not committed. These
 * exact input coordinates let a one-time preparer prove provenance without
 * letting ordinary builds acquire or serve the supplied directory.
 */
export const HEGEMONY_STONE_QUARRY_SOURCE = Object.freeze({
  packageDirectory: 'Warpkeep_StoneQuarry_GameReady',
  runtimeRoot: 'Runtime',
  manifest: Object.freeze({
    filename: 'runtime-manifest.json',
    bytes: 2_415,
    sha256: '3351ad854b4e3e173ed557bfb00684f9a7a1b02211822325cb117ff4fcdc9d85'
  }),
  assetId: 'warpkeep.stone-quarry-node',
  version: '1.1.1',
  revision: 'manual-polish-final-2026-07-18'
});

const SHARED_POSITION_MIN = Object.freeze([
  -6.6023383140563965,
  0,
  -5.17533540725708
]);
const SHARED_POSITION_MAX_XZ = Object.freeze([
  6.349999904632568,
  5.168097496032715
]);

/** Ordered exactly as the supplied manifest's High, Balanced, Compact LODs. */
export const HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    sourceFilename: 'Warpkeep_StoneQuarry_LOD0_High_Runtime.glb',
    filename: 'hegemony-stone-quarry-high-a4a3258f1f28a7d8.glb',
    bytes: 558_036,
    sha256: 'a4a3258f1f28a7d85658b32a0257d3ca5cb810b8f7a010fd5ebbf7cde12c7537',
    triangles: 5_362,
    vertices: 11_893,
    tier: 'LOD0_High',
    nodeName: 'WK_StoneQuarry_LOD0_High.001',
    meshName: 'WK_StoneQuarry_LOD0_High_Mesh.001',
    nodeLod: 0,
    positionMin: SHARED_POSITION_MIN,
    positionMax: Object.freeze([
      SHARED_POSITION_MAX_XZ[0],
      5.625,
      SHARED_POSITION_MAX_XZ[1]
    ])
  }),
  Object.freeze({
    id: 'balanced',
    sourceFilename: 'Warpkeep_StoneQuarry_LOD1_Balanced_Runtime.glb',
    filename: 'hegemony-stone-quarry-balanced-44573c53850a31ec.glb',
    bytes: 337_788,
    sha256: '44573c53850a31ec0178f88918d18471309016a5b4edffdcf1d3e42670109925',
    triangles: 3_346,
    vertices: 7_162,
    tier: 'LOD1_Balanced',
    nodeName: 'WK_StoneQuarry_LOD1_Balanced.001',
    meshName: 'WK_StoneQuarry_LOD1_Balanced_Mesh.001',
    nodeLod: 1,
    positionMin: SHARED_POSITION_MIN,
    positionMax: Object.freeze([
      SHARED_POSITION_MAX_XZ[0],
      5.609999656677246,
      SHARED_POSITION_MAX_XZ[1]
    ])
  }),
  Object.freeze({
    id: 'compact',
    sourceFilename: 'Warpkeep_StoneQuarry_LOD2_Compact_Runtime.glb',
    filename: 'hegemony-stone-quarry-compact-b4dbbc1c55a67c12.glb',
    bytes: 166_720,
    sha256: 'b4dbbc1c55a67c120df2f2b54852e30a2de980254216821b4a599a10e2e5030e',
    triangles: 1_654,
    vertices: 3_504,
    tier: 'LOD2_Compact',
    nodeName: 'WK_StoneQuarry_LOD2_Compact.001',
    meshName: 'WK_StoneQuarry_LOD2_Compact_Mesh.001',
    nodeLod: 2,
    positionMin: SHARED_POSITION_MIN,
    positionMax: Object.freeze([
      SHARED_POSITION_MAX_XZ[0],
      5.519999980926514,
      SHARED_POSITION_MAX_XZ[1]
    ])
  })
]);

export const HEGEMONY_STONE_QUARRY_SOURCE_FILES = Object.freeze(
  HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map((profile) => Object.freeze({
    id: profile.id,
    filename: profile.sourceFilename,
    bytes: profile.bytes,
    sha256: profile.sha256
  }))
);

const EXPECTED_ATTRIBUTES = Object.freeze([
  'COLOR_0',
  'NORMAL',
  'POSITION',
  'TEXCOORD_0'
]);
const EXPECTED_EXTENSIONS = Object.freeze(['KHR_materials_specular']);
const EXPECTED_SCENE_EXTRAS = Object.freeze({
  wk_asset: 'stone-quarry-node',
  wk_build_intent: 'bright stylized mobile stone gathering node',
  wk_runtime_destination: 'Warpkeep/Runtime/GatheringNodes/Stone/StoneQuarry',
  wk_triangle_counts: '{"LOD0_High": 5362, "LOD1_Balanced": 3346, "LOD2_Compact": 1654}',
  wk_bounds: '{"max": [6.35, 5.175335, 5.625], "min": [-6.602338, -5.168097, 0.0], "size": [12.952338, 10.343433, 5.625]}',
  wk_contact_audit: '{"contactEdges": 279, "objectsChecked": 126, "passed": true, "tolerance": 0.11, "unsupportedObjects": []}',
  wk_visual_clearance_audit: '{"maximumAllowedPenetration": 0.04, "pairsChecked": 36, "passed": true, "violations": []}'
});

function fail(label, detail) {
  throw new Error(label + ': ' + detail);
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

function expectedSourceLods() {
  return HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES.map((profile) => ({
    file: profile.sourceFilename,
    bytes: profile.bytes,
    sha256: profile.sha256,
    tier: profile.tier,
    triangles: profile.triangles,
    vertices: profile.vertices
  }));
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

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

/**
 * Kept for audited preparation only. Normal builds never read the external
 * delivery package or make it available to the renderer.
 */
export function assertHegemonyStoneQuarrySourceManifest(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_STONE_QUARRY_SOURCE.manifest.bytes
    || sha256(bytes) !== HEGEMONY_STONE_QUARRY_SOURCE.manifest.sha256
  ) fail(label, 'does not match the exact supplied Stone Quarry manifest.');

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
    || manifest?.assetId !== HEGEMONY_STONE_QUARRY_SOURCE.assetId
    || manifest?.category !== 'GatheringNodes/Stone'
    || manifest?.name !== 'Grand Stone Quarry Gathering Node'
    || manifest?.version !== HEGEMONY_STONE_QUARRY_SOURCE.version
    || manifest?.revision !== HEGEMONY_STONE_QUARRY_SOURCE.revision
    || manifest?.recommendedLod !== HEGEMONY_STONE_QUARRY_RUNTIME_PROFILES[0].sourceFilename
    || manifest?.provenance?.sourcePackage !== 'Warpkeep_StoneQuarry_GameReady'
    || manifest?.provenance?.license !== 'Project-owned; authored for Warpkeep'
    || manifest?.runtimeContract?.gltfUp !== '+Y'
    || manifest?.runtimeContract?.frontFacing !== '+Z'
    || manifest?.runtimeContract?.interactionPivot !== 'footprint-center'
    || manifest?.runtimeContract?.groundPlane !== 0
    || manifest?.runtimeContract?.embeddedTextures !== 0
    || manifest?.runtimeContract?.embeddedVertexColors !== true
    || manifest?.runtimeContract?.externalDependencies !== 0
    || manifest?.runtimeContract?.materials !== 1
    || manifest?.runtimeContract?.meshObjects !== 1
    || manifest?.collision?.policy !== 'engine-side-simple-footprint'
    || manifest?.collision?.renderMeshCollision !== false
    || !exactArray(manifest?.collision?.halfExtents, [5.85, 4.65])
    || manifest?.collision?.selectionRadius !== 6.45
    || manifest?.validation?.cleanImportPassed !== true
    || manifest?.validation?.contactAuditPassed !== true
    || manifest?.validation?.visualClearanceAuditPassed !== true
    || manifest?.validation?.degenerateTriangles !== 0
    || manifest?.validation?.looseVertices !== 0
    || manifest?.validation?.unsupportedObjects !== 0
    || JSON.stringify(receivedLods) !== JSON.stringify(expectedSourceLods())
  ) fail(label, 'identity, source LODs, or rendering contract changed.');
}

/**
 * The public runtime files are exact source bytes. In addition to hash and
 * length, validate the compact GLB surface so a same-name substitution cannot
 * introduce external dependencies, physics geometry, or a different visual
 * orientation into a later renderer integration.
 */
export function verifyHegemonyStoneQuarryRuntimeBytes(bytes, profile, label) {
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
    || scene?.name !== 'WK_StoneQuarry_EditableScene'
    || !exactArray(scene?.nodes, [0])
    || JSON.stringify(scene?.extras) !== JSON.stringify(EXPECTED_SCENE_EXTRAS)
    || json.nodes?.length !== 1
    || node?.name !== profile.nodeName
    || node?.mesh !== 0
    || node?.extras?.wk_asset !== 'stone-quarry-node'
    || node?.extras?.wk_editable !== true
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
    || material?.name !== 'WK_StoneQuarry_VertexColor_PBR'
    || material?.doubleSided !== true
    || (material?.alphaMode ?? 'OPAQUE') !== 'OPAQUE'
    || material?.pbrMetallicRoughness?.metallicFactor !== 0
    || material?.pbrMetallicRoughness?.roughnessFactor !== 0.8199999928474426
    || material?.extensions?.KHR_materials_specular?.specularFactor !== 0.4000000059604645
    || (json.images?.length ?? 0) !== 0
    || (json.animations?.length ?? 0) !== 0
    || (json.cameras?.length ?? 0) !== 0
    || !exactArray(json.extensionsUsed, EXPECTED_EXTENSIONS)
    || !exactArray(json.extensionsRequired ?? [], [])
    || hasExternalUri
    || indices?.componentType !== 5_123
    || indices?.count !== profile.triangles * 3
    || position?.componentType !== 5_126
    || position?.type !== 'VEC3'
    || position?.count !== profile.vertices
    || !exactArray(position?.min, profile.positionMin)
    || !exactArray(position?.max, profile.positionMax)
  ) fail(label, 'does not satisfy the reviewed Stone Quarry runtime structure.');
}
