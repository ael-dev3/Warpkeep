import { createHash } from 'node:crypto';

import { inspectEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

export const HEGEMONY_GOLD_MINE_RUNTIME_DIRECTORY =
  'public/models/hegemony/gathering-nodes/gold-mine';

export const HEGEMONY_GOLD_MINE_SOURCE = Object.freeze({
  manifest: Object.freeze({
    filename: 'runtime-manifest.json',
    bytes: 2_191,
    sha256: '9bb0bcf28b3b2f073d8f4a9cdbe5c2ad1d41d921668f25172a2105f52fd82dd4'
  }),
  files: Object.freeze([
    Object.freeze({
      id: 'high',
      filename: 'Warpkeep_GoldMine_LOD0_High_Runtime.glb',
      bytes: 263_528,
      sha256: '6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3'
    }),
    Object.freeze({
      id: 'balanced',
      filename: 'Warpkeep_GoldMine_LOD1_Balanced_Runtime.glb',
      bytes: 154_388,
      sha256: '42776e6a0a1196c43e872d9d6d08a8acbf398b5dbd26ba7ab20e0c0cfdd52008'
    }),
    Object.freeze({
      id: 'compact',
      filename: 'Warpkeep_GoldMine_LOD2_Compact_Runtime.glb',
      bytes: 95_024,
      sha256: 'b39ad147954ba4200efe680975038416784f759918ca295282d95812710ca853'
    })
  ])
});

export const HEGEMONY_GOLD_MINE_RUNTIME_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    filename: 'hegemony-gold-mine-high-6c3731e0f3381014.glb',
    sourceFilename: HEGEMONY_GOLD_MINE_SOURCE.files[0].filename,
    bytes: 263_528,
    sha256: '6c3731e0f3381014d661d539c25f67e4f79f894b721d1feac9e275b07b8a6ab3',
    triangles: 4_233,
    vertices: 11_097,
    textureSize: 1_024,
    nodeName: 'WK_GoldMine_LOD0_High.001',
    nodeLod: 2,
    metadataNormalization: 'none',
    images: Object.freeze([
      Object.freeze({ bytes: 92_106, sha256: '7fda90d1bbba9fb49801603227195a89e11018ec339f937e547d63769cf11d36' }),
      Object.freeze({ bytes: 34_076, sha256: '99c9d6f809a6b550d9c62b3e5fc03a4fbfa122566bcc60e0853c4a49f427c04c' }),
      Object.freeze({ bytes: 5_766, sha256: '0628b889a339c7089d683796d039b922a035b61d6cd483ea4567ab8677d9f983' })
    ])
  }),
  Object.freeze({
    id: 'balanced',
    filename: 'hegemony-gold-mine-balanced-96a467baaf1dfba4.glb',
    sourceFilename: HEGEMONY_GOLD_MINE_SOURCE.files[1].filename,
    bytes: 154_380,
    sha256: '96a467baaf1dfba44d9c21e2ceb18348b564e3cdfe7daffb6d6bcd209634af42',
    triangles: 3_553,
    vertices: 9_297,
    textureSize: 512,
    nodeName: 'WK_GoldMine_LOD1_Balanced.001',
    nodeLod: 1,
    metadataNormalization: 'material.extras.wk_atlas_size: 1024 → 512; geometry and embedded images preserved byte-for-byte',
    images: Object.freeze([
      Object.freeze({ bytes: 28_682, sha256: 'e5252c0e1f48acbaea71d1163a75f64072dcd9328d9b3651793f343a3ff0fc60' }),
      Object.freeze({ bytes: 12_542, sha256: '6b4bf9e6e0756d34e26d9d1d4350f98b0473dd960837d10119817b6af78fe468' }),
      Object.freeze({ bytes: 1_362, sha256: '434a1e3e43504048d7093125288a4131b984bdf69d06546e797e9a365bd0da5a' })
    ])
  }),
  Object.freeze({
    id: 'compact',
    filename: 'hegemony-gold-mine-compact-d2644366898cf610.glb',
    sourceFilename: HEGEMONY_GOLD_MINE_SOURCE.files[2].filename,
    bytes: 95_016,
    sha256: 'd2644366898cf610c9824761ff01fb43346d9db92a8a13be0569b3d49557dd6f',
    triangles: 2_681,
    vertices: 7_195,
    textureSize: 256,
    nodeName: 'WK_GoldMine_LOD2_Compact.001',
    nodeLod: 0,
    metadataNormalization: 'material.extras.wk_atlas_size: 1024 → 256; geometry and embedded images preserved byte-for-byte',
    images: Object.freeze([
      Object.freeze({ bytes: 2_926, sha256: '890588f9fd14ba083e3be5ad440c2ad21698dfd1cbfa24f770bc7a30a56275f7' }),
      Object.freeze({ bytes: 3_026, sha256: '6bfc7623c9db2f94149ab04bae085ec9905fedc8a5c871ab209fd396cdb61358' }),
      Object.freeze({ bytes: 548, sha256: 'c226eb380278836bf74dfec62cac488a740c7447b620247e019ea2022c50f745' })
    ])
  })
]);

const REQUIRED_EXTENSIONS = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);
const USED_EXTENSIONS = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_specular',
  'KHR_mesh_quantization'
]);
const IMAGE_NAMES = Object.freeze([
  'WK_GoldMine_NormalAtlas',
  'WK_GoldMine_BaseColorAtlas',
  'WK_GoldMine_ORMAtlas'
]);
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
const SHARED_BOUNDS = Object.freeze({
  min: Object.freeze([-32_767, -20_562, -25_999]),
  max: Object.freeze([32_767, 20_562, 25_999])
});

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactVector(actual, expected) {
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

export function assertHegemonyGoldMineSourceManifest(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_GOLD_MINE_SOURCE.manifest.bytes
    || sha256(bytes) !== HEGEMONY_GOLD_MINE_SOURCE.manifest.sha256
  ) fail(label, 'does not match the exact supplied Gold Mine manifest.');
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
  if (
    manifest?.schema !== 'warpkeep.runtime-asset.v1'
    || manifest?.assetId !== 'warpkeep.gold-mine-node'
    || manifest?.version !== '1.4.0'
    || manifest?.revision !== 'user-edited-2026-07-18'
    || manifest?.runtimeContract?.gltfUp !== '+Y'
    || manifest?.runtimeContract?.frontFacing !== '+Z'
    || manifest?.runtimeContract?.interactionPivot !== 'footprint-center'
    || manifest?.runtimeContract?.meshCompression !== 'EXT_meshopt_compression'
    || manifest?.runtimeContract?.textureCompression !== 'WebP'
  ) fail(label, 'identity or runtime contract changed.');
}

export async function verifyHegemonyGoldMineRuntimeBytes(bytes, profile, label) {
  if (bytes.byteLength !== profile.bytes || sha256(bytes) !== profile.sha256) {
    fail(label, 'does not match its exact approved runtime bytes.');
  }
  const json = readGlbJson(bytes, label);
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const indices = json.accessors?.[primitive?.indices];
  const positions = json.accessors?.[primitive?.attributes?.POSITION];
  const node = json.nodes?.[0];
  const material = json.materials?.[0];
  const externalUris = [...(json.buffers ?? []), ...(json.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');
  if (
    json.asset?.version !== '2.0'
    || json.asset?.generator !== 'glTF-Transform v4.4.1'
    || json.scene !== 0
    || json.scenes?.length !== 1
    || json.scenes[0]?.name !== 'Scene'
    || !exactVector(json.scenes[0]?.nodes, [0])
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
    || node?.extras?.wk_collider_recommendation !== 'engine-side oval/cylinder; do not mesh-collide render geometry'
    || json.meshes?.length !== 1
    || json.meshes[0]?.primitives?.length !== 1
    || primitive?.mode !== 4
    || primitive?.material !== 0
    || json.materials?.length !== 1
    || material?.name !== 'WK_GoldMine_Atlas_PBR'
    || material?.doubleSided !== true
    || material?.extras?.wk_atlas_size !== profile.textureSize
    || material?.pbrMetallicRoughness?.baseColorTexture?.index !== 0
    || material?.pbrMetallicRoughness?.metallicRoughnessTexture?.index !== 2
    || json.images?.length !== profile.images.length
    || !exactVector(json.images.map((image) => image?.name), IMAGE_NAMES)
    || json.animations?.length > 0
    || indices?.count / 3 !== profile.triangles
    || indices?.componentType !== 5_123
    || positions?.count !== profile.vertices
    || positions?.componentType !== 5_122
    || positions?.normalized !== true
    || positions?.type !== 'VEC3'
    || !exactVector(positions?.min, SHARED_BOUNDS.min)
    || !exactVector(positions?.max, SHARED_BOUNDS.max)
    || !exactVector(json.extensionsRequired, REQUIRED_EXTENSIONS)
    || !exactVector(json.extensionsUsed, USED_EXTENSIONS)
    || externalUris
    || json.cameras?.length > 0
  ) fail(label, 'does not satisfy the reviewed Gold Mine runtime structure.');

  const embedded = await inspectEmbeddedWebpGlb(bytes, { label });
  if (embedded.images.length !== profile.images.length) {
    fail(label, 'embedded WebP image count changed.');
  }
  embedded.images.forEach((image, index) => {
    const expected = profile.images[index];
    if (
      image.width !== profile.textureSize
      || image.height !== profile.textureSize
      || image.bytes !== expected.bytes
      || image.sha256 !== expected.sha256
    ) fail(label, `embedded WebP ${index} changed.`);
  });
}
