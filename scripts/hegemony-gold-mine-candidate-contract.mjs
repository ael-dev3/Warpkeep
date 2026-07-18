import { createHash } from 'node:crypto';

import { inspectEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

export const GOLD_MINE_CANDIDATE_DIRECTORY =
  'docs/reference/resources/2026-07-18-hegemony-gold-mine/runtime-candidates';
export const GOLD_MINE_CANDIDATE_RECORD =
  'docs/reference/resources/2026-07-18-hegemony-gold-mine/manifest.json';

export const GOLD_MINE_SOURCE_MANIFEST = Object.freeze({
  path: 'runtime-manifest.json',
  bytes: 2_191,
  sha256: '9bb0bcf28b3b2f073d8f4a9cdbe5c2ad1d41d921668f25172a2105f52fd82dd4'
});

export const GOLD_MINE_REQUIRED_EXTENSIONS = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

const GOLD_MINE_USED_EXTENSIONS = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_specular',
  'KHR_mesh_quantization'
]);

const SHARED_POSITION_BOUNDS = Object.freeze({
  min: Object.freeze([-32_767, -20_562, -25_999]),
  max: Object.freeze([32_767, 20_562, 25_999])
});

const SHARED_TRANSLATION = Object.freeze([
  0.062338829040527344,
  3.9674999713897705,
  0.33597278594970703
]);

const SHARED_SCALE = Object.freeze([
  6.322193145751953,
  6.322193145751953,
  6.322193145751953
]);

const SHARED_IMAGE_NAMES = Object.freeze([
  'WK_GoldMine_NormalAtlas',
  'WK_GoldMine_BaseColorAtlas',
  'WK_GoldMine_ORMAtlas'
]);

export const GOLD_MINE_CANDIDATE_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    sourceTier: 'LOD0_High',
    sourceFilename: 'Warpkeep_GoldMine_LOD0_High_Runtime.glb',
    candidateFilename: 'hegemony-gold-mine-high-6c3731e0f3381014.glb',
    bytes: 263_528,
    sha256: '6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3',
    triangles: 4_233,
    vertices: 11_097,
    textureSize: 1_024,
    declaredAtlasSize: 1_024,
    nodeName: 'WK_GoldMine_LOD0_High.001',
    nodeLod: 2,
    positionBounds: SHARED_POSITION_BOUNDS,
    imageHashes: Object.freeze([
      Object.freeze({
        bytes: 92_106,
        sha256: '7fda90d1bbba9fb49801603227195a89e11018ec339f937e547d63769cf11d36'
      }),
      Object.freeze({
        bytes: 34_076,
        sha256: '99c9d6f809a6b550d9c62b3e5fc03a4fbfa122566bcc60e0853c4a49f427c04c'
      }),
      Object.freeze({
        bytes: 5_766,
        sha256: '0628b889a339c7089d683796d039b922a035b61d6cd483ea4567ab8677d9f983'
      })
    ])
  }),
  Object.freeze({
    id: 'balanced',
    sourceTier: 'LOD1_Balanced',
    sourceFilename: 'Warpkeep_GoldMine_LOD1_Balanced_Runtime.glb',
    candidateFilename: 'hegemony-gold-mine-balanced-42776e6a0a1196c.glb',
    bytes: 154_388,
    sha256: '42776e6a0a1196c43e872d9d6d08a8acbf398b5dbd26ba7ab20e0c0cfdd52008',
    triangles: 3_553,
    vertices: 9_297,
    textureSize: 512,
    // Preserve the supplied metadata exactly. A later promotion needs an
    // explicitly approved normalization decision before it can use this LOD.
    declaredAtlasSize: 1_024,
    nodeName: 'WK_GoldMine_LOD1_Balanced.001',
    nodeLod: 1,
    positionBounds: SHARED_POSITION_BOUNDS,
    imageHashes: Object.freeze([
      Object.freeze({
        bytes: 28_682,
        sha256: 'e5252c0e1f48acbaea71d1163a75f64072dcd9328d9b3651793f343a3ff0fc60'
      }),
      Object.freeze({
        bytes: 12_542,
        sha256: '6b4bf9e6e0756d34e26d9d1d4350f98b0473dd960837d10119817b6af78fe468'
      }),
      Object.freeze({
        bytes: 1_362,
        sha256: '434a1e3e43504048d7093125288a4131b984bdf69d06546e797e9a365bd0da5a'
      })
    ])
  }),
  Object.freeze({
    id: 'compact',
    sourceTier: 'LOD2_Compact',
    sourceFilename: 'Warpkeep_GoldMine_LOD2_Compact_Runtime.glb',
    candidateFilename: 'hegemony-gold-mine-compact-b39ad147954ba420.glb',
    bytes: 95_024,
    sha256: 'b39ad147954ba4200efe680975038416784f759918ca295282d95812710ca853',
    triangles: 2_681,
    vertices: 7_195,
    textureSize: 256,
    // Preserve the supplied metadata exactly. A later promotion needs an
    // explicitly approved normalization decision before it can use this LOD.
    declaredAtlasSize: 1_024,
    nodeName: 'WK_GoldMine_LOD2_Compact.001',
    nodeLod: 0,
    positionBounds: SHARED_POSITION_BOUNDS,
    imageHashes: Object.freeze([
      Object.freeze({
        bytes: 2_926,
        sha256: '890588f9fd14ba083e3be5ad440c2ad21698dfd1cbfa24f770bc7a30a56275f7'
      }),
      Object.freeze({
        bytes: 3_026,
        sha256: '6bfc7623c9db2f94149ab04bae085ec9905fedc8a5c871ab209fd396cdb61358'
      }),
      Object.freeze({
        bytes: 548,
        sha256: 'c226eb380278836bf74dfec62cac488a740c7447b620247e019ea2022c50f745'
      })
    ])
  })
]);

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactVector(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function readGlbJson(bytes, label) {
  if (
    bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) fail(label, 'is not an intact glTF 2.0 binary.');

  const jsonLength = bytes.readUInt32LE(12);
  const jsonEnd = 20 + jsonLength;
  if (
    bytes.readUInt32LE(16) !== 0x4e4f534a
    || jsonEnd > bytes.byteLength
  ) fail(label, 'has an invalid GLB JSON chunk.');

  try {
    return JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8').trim());
  } catch {
    fail(label, 'has invalid GLB JSON.');
  }
}

export function assertGoldMineSourceManifest(bytes, label) {
  if (
    bytes.byteLength !== GOLD_MINE_SOURCE_MANIFEST.bytes
    || sha256(bytes) !== GOLD_MINE_SOURCE_MANIFEST.sha256
  ) fail(label, 'does not match the exact supplied source manifest.');

  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }

  if (
    manifest?.schema !== 'warpkeep.runtime-asset.v1'
    || manifest.assetId !== 'warpkeep.gold-mine-node'
    || manifest.name !== 'Gold Mine Gathering Node'
    || manifest.version !== '1.4.0'
    || manifest.revision !== 'user-edited-2026-07-18'
    || manifest.category !== 'GatheringNodes/Gold'
    || manifest.recommendedLod !== GOLD_MINE_CANDIDATE_PROFILES[0].sourceFilename
    || manifest.runtimeContract?.meshObjects !== 1
    || manifest.runtimeContract?.materials !== 1
    || manifest.runtimeContract?.embeddedTextures !== 3
    || manifest.runtimeContract?.meshCompression !== 'EXT_meshopt_compression'
    || manifest.runtimeContract?.textureCompression !== 'WebP'
    || manifest.runtimeContract?.gltfUp !== '+Y'
    || manifest.runtimeContract?.frontFacing !== '+Z'
    || manifest.runtimeContract?.groundPlane !== 0
    || manifest.runtimeContract?.interactionPivot !== 'footprint-center'
    || manifest.validation?.gltfErrors !== 0
    || manifest.validation?.gltfWarnings !== 0
    || manifest.validation?.contactAuditPassed !== true
    || !Array.isArray(manifest.lods)
    || manifest.lods.length !== GOLD_MINE_CANDIDATE_PROFILES.length
  ) fail(label, 'identity or runtime contract changed.');

  GOLD_MINE_CANDIDATE_PROFILES.forEach((profile, index) => {
    const lod = manifest.lods[index];
    if (
      lod?.tier !== profile.sourceTier
      || lod.file !== profile.sourceFilename
      || lod.triangles !== profile.triangles
      || lod.bytes !== profile.bytes
      || lod.sha256 !== profile.sha256
      || lod.textureResolution !== profile.textureSize
    ) fail(label, `${profile.id} source LOD contract changed.`);
  });
}

export async function verifyGoldMineCandidateBytes(bytes, profile, label) {
  if (
    bytes.byteLength !== profile.bytes
    || sha256(bytes) !== profile.sha256
  ) fail(label, 'does not match its exact supplied candidate bytes.');

  const json = readGlbJson(bytes, label);
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const indices = json.accessors?.[primitive?.indices];
  const positions = json.accessors?.[primitive?.attributes?.POSITION];
  const node = json.nodes?.[0];
  const material = json.materials?.[0];
  const scene = json.scenes?.[0];

  if (
    json.asset?.version !== '2.0'
    || json.asset?.generator !== 'glTF-Transform v4.4.1'
    || json.scene !== 0
    || json.scenes?.length !== 1
    || scene?.name !== 'Scene'
    || !exactVector(scene?.nodes, [0])
    || scene?.extras?.wk_asset !== 'gold-mine-node'
    || json.nodes?.length !== 1
    || node?.name !== profile.nodeName
    || node?.mesh !== 0
    || !exactVector(node?.translation, SHARED_TRANSLATION)
    || !exactVector(node?.scale, SHARED_SCALE)
    || node?.extras?.wk_asset !== 'gold-mine-node'
    || node?.extras?.wk_lod !== profile.nodeLod
    || node?.extras?.wk_origin_contract !== 'ground-plane-z0'
    || node?.extras?.wk_front_facing_gltf !== '+Z'
    || node?.extras?.wk_interaction_pivot !== 'footprint-center'
    || node?.extras?.wk_collider_recommendation
      !== 'engine-side oval/cylinder; do not mesh-collide render geometry'
    || json.meshes?.length !== 1
    || json.meshes[0]?.primitives?.length !== 1
    || primitive?.mode !== 4
    || primitive?.material !== 0
    || !exactVector(Object.keys(primitive?.attributes ?? {}).sort(), [
      'NORMAL', 'POSITION', 'TANGENT', 'TEXCOORD_0'
    ])
    || json.materials?.length !== 1
    || material?.name !== 'WK_GoldMine_Atlas_PBR'
    || material?.doubleSided !== true
    || material?.extras?.wk_atlas_size !== profile.declaredAtlasSize
    || material?.pbrMetallicRoughness?.baseColorTexture?.index !== 0
    || material?.pbrMetallicRoughness?.metallicRoughnessTexture?.index !== 2
    || json.images?.length !== profile.imageHashes.length
    || !exactVector(json.images.map(image => image?.name), SHARED_IMAGE_NAMES)
    || json.accessors?.length !== 5
    || json.bufferViews?.length !== 8
    || json.buffers?.length !== 2
    || json.animations?.length > 0
    || indices?.count / 3 !== profile.triangles
    || indices?.componentType !== 5_123
    || indices?.type !== 'SCALAR'
    || positions?.count !== profile.vertices
    || positions?.componentType !== 5_122
    || positions?.normalized !== true
    || positions?.type !== 'VEC3'
    || !exactVector(positions?.min, profile.positionBounds.min)
    || !exactVector(positions?.max, profile.positionBounds.max)
    || !exactVector(json.extensionsRequired, GOLD_MINE_REQUIRED_EXTENSIONS)
    || !exactVector(json.extensionsUsed, GOLD_MINE_USED_EXTENSIONS)
  ) fail(label, 'structure no longer matches the reviewed candidate contract.');

  const embedded = await inspectEmbeddedWebpGlb(bytes, { label });
  if (embedded.images.length !== profile.imageHashes.length) {
    fail(label, 'embedded WebP image count changed.');
  }
  embedded.images.forEach((image, index) => {
    const expected = profile.imageHashes[index];
    if (
      image.width !== profile.textureSize
      || image.height !== profile.textureSize
      || image.bytes !== expected.bytes
      || image.sha256 !== expected.sha256
    ) fail(label, `embedded WebP ${index} changed.`);
  });
}

export function assertGoldMineCandidateRecord(bytes, label) {
  let record;
  try {
    record = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }

  if (
    record?.schema !== 'warpkeep.resource-node-candidate.v1'
    || record.assetId !== 'warpkeep.gold-mine-node'
    || record.reviewStatus?.state !== 'prepared-not-integrated'
    || record.reviewStatus?.runtimeDelivery !== 'not-authorized'
    || record.reviewStatus?.gameplayIntegration !== 'not-authorized'
    || record.sourceManifest?.bytes !== GOLD_MINE_SOURCE_MANIFEST.bytes
    || record.sourceManifest?.sha256 !== GOLD_MINE_SOURCE_MANIFEST.sha256
    || !Array.isArray(record.lods)
    || record.lods.length !== GOLD_MINE_CANDIDATE_PROFILES.length
  ) fail(label, 'does not preserve the Gold Mine candidate review boundary.');

  GOLD_MINE_CANDIDATE_PROFILES.forEach((profile, index) => {
    const lod = record.lods[index];
    if (
      lod?.id !== profile.id
      || lod.sourceTier !== profile.sourceTier
      || lod.sourceFilename !== profile.sourceFilename
      || lod.candidateFilename !== profile.candidateFilename
      || lod.bytes !== profile.bytes
      || lod.sha256 !== profile.sha256
      || lod.triangles !== profile.triangles
      || lod.actualTextureSize !== profile.textureSize
      || lod.declaredAtlasSize !== profile.declaredAtlasSize
    ) fail(label, `${profile.id} record does not match its immutable candidate.`);
  });
}
