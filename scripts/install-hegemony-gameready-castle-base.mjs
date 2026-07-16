import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

import {
  installAtomicFileFamily,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import {
  inspectEmbeddedWebpGlb,
  rewriteEmbeddedWebpGlb
} from './rewrite-embedded-webp-glb.mjs';

const root = resolve(import.meta.dirname, '..');
const suppliedRoot = process.env.WARPKEEP_CASTLE_BASE_GAMEREADY_ROOT
  ? resolve(process.env.WARPKEEP_CASTLE_BASE_GAMEREADY_ROOT)
  : undefined;
const outputDirectory = resolve(root, 'public/models/hegemony');

const packageManifest = Object.freeze({
  path: 'asset-manifest.json',
  bytes: 2_177,
  sha256: '106d64f5eaf91332acc83c18d5abbd9ad230b17eb4c9ffee1231ecf7d595d3f5'
});

const sharedNodeExtras = Object.freeze({
  wk_lod_detail: 0,
  wk_atlas_region: 'mixed',
  wk_asset: 'castle-landscape-base',
  wk_origin_contract: 'castle-ground-plane-z0',
  wk_gate_road_facing_blender: '-Y',
  wk_gate_road_facing_gltf: '+Z',
  wk_castle_ground_plane_z: 0,
  wk_runtime_attach: 'same transform as castle; do not independently normalize or ground'
});

const profiles = Object.freeze([
  Object.freeze({
    id: 'high',
    tier: 'LOD0_High',
    inputPath: 'Runtime/Warpkeep_Castle_LandscapeBase_LOD0_High_Runtime.glb',
    input: Object.freeze({
      bytes: 214_372,
      sha256: 'be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c'
    }),
    output: Object.freeze({
      bytes: 214_372,
      sha256: 'be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c'
    }),
    textureSize: 1_024,
    triangles: 3_954,
    vertices: 10_681,
    positionBounds: Object.freeze({
      min: Object.freeze([-32_767, -4_124, -27_179]),
      max: Object.freeze([32_767, 4_124, 27_179])
    }),
    nodeName: 'WK_Castle_LandscapeBase_LOD0_High',
    meshName: 'WK_Castle_LandscapeBase_LOD0_High_Mesh',
    nodeTranslation: Object.freeze([
      0.1762232780456543,
      0.7211456596851349,
      0.4222433567047119
    ]),
    nodeScale: Object.freeze([
      9.26375150680542,
      9.26375150680542,
      9.26375150680542
    ]),
    nodeExtras: Object.freeze({ ...sharedNodeExtras, wk_lod: 2 }),
    normalizeMetadata: false,
    images: Object.freeze([
      Object.freeze({
        bytes: 95_098,
        sha256: 'ee821457dcc3efba733e9176dac35f4bd07916c1f613a89175788f9b2817181d'
      }),
      Object.freeze({
        bytes: 29_586,
        sha256: '92918cb1e221b75ee11af809b1e99b3fb5f60b4342f0dbea68b65135e241dc65'
      })
    ])
  }),
  Object.freeze({
    id: 'balanced',
    tier: 'LOD1_Balanced',
    inputPath: 'Runtime/Warpkeep_Castle_LandscapeBase_LOD1_Balanced_Runtime.glb',
    input: Object.freeze({
      bytes: 92_792,
      sha256: '5f4e3c52336c78414b5370b63a5e4b924a773297092430eb6f4773bc094eb5cf'
    }),
    output: Object.freeze({
      bytes: 92_784,
      sha256: '179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f'
    }),
    textureSize: 512,
    triangles: 2_138,
    vertices: 5_611,
    positionBounds: Object.freeze({
      min: Object.freeze([-32_767, -4_124, -27_179]),
      max: Object.freeze([32_767, 4_124, 27_179])
    }),
    nodeName: 'WK_Castle_LandscapeBase_LOD1_Balanced',
    meshName: 'WK_Castle_LandscapeBase_LOD1_Balanced_Mesh',
    nodeTranslation: Object.freeze([
      0.1762232780456543,
      0.7211456596851349,
      0.4222433567047119
    ]),
    nodeScale: Object.freeze([
      9.26375150680542,
      9.26375150680542,
      9.26375150680542
    ]),
    nodeExtras: Object.freeze({ ...sharedNodeExtras, wk_lod: 1 }),
    normalizeMetadata: true,
    images: Object.freeze([
      Object.freeze({
        bytes: 29_544,
        sha256: '439351b1cc2f84f988bfeb5b492a9c6652c74741bed29ce17fd7e45c222f99f0'
      }),
      Object.freeze({
        bytes: 10_130,
        sha256: '3714349aed5b0f7225807674f4719a79f5fd09e25a5cb108f5cc46a4767dc86f'
      })
    ])
  }),
  Object.freeze({
    id: 'compact',
    tier: 'LOD2_Compact',
    inputPath: 'Runtime/Warpkeep_Castle_LandscapeBase_LOD2_Compact_Runtime.glb',
    input: Object.freeze({
      bytes: 27_336,
      sha256: 'ebaf6c6cef216b92de86aa49ea2d612d63227210858b7427fa0c7e97a81323dc'
    }),
    output: Object.freeze({
      bytes: 27_328,
      sha256: 'f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3'
    }),
    textureSize: 256,
    triangles: 714,
    vertices: 1_780,
    positionBounds: Object.freeze({
      min: Object.freeze([-32_767, -4_060, -27_179]),
      max: Object.freeze([32_767, 4_060, 27_179])
    }),
    nodeName: 'WK_Castle_LandscapeBase_LOD2_Compact',
    meshName: 'WK_Castle_LandscapeBase_LOD2_Compact_Mesh',
    nodeTranslation: Object.freeze([
      0.1762232780456543,
      0.7025456726551056,
      0.4222433567047119
    ]),
    nodeScale: Object.freeze([
      9.26375150680542,
      9.26375150680542,
      9.26375150680542
    ]),
    nodeExtras: Object.freeze({ ...sharedNodeExtras, wk_lod: 0 }),
    normalizeMetadata: true,
    images: Object.freeze([
      Object.freeze({
        bytes: 2_900,
        sha256: '39bb781d03fe4f134532846750e7f387891c053703e90ce28e150d5a568ef29f'
      }),
      Object.freeze({
        bytes: 2_460,
        sha256: '80d914be77fd5dde0fc330091ae35d366a6497d1982f1b75dc7b43920526924d'
      })
    ])
  })
]);

const requiredExtensions = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

const usedExtensions = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_materials_specular',
  'KHR_mesh_quantization'
]);

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertExact(bytes, expected, label) {
  if (bytes.byteLength !== expected.bytes || sha256(bytes) !== expected.sha256) {
    throw new Error(`${label} does not match its authorized exact bytes.`);
  }
}

function exactVector(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}

function exactRecord(value, expected) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === Object.keys(expected).length
    && Object.entries(expected).every(([key, entry]) => value[key] === entry);
}

function readRegularExactFile(root, relativePath, expected, label) {
  const bytes = readContainedRegularFile({ root, relativePath, label });
  assertExact(bytes, expected, label);
  return bytes;
}

function readGlbJson(bytes, label) {
  if (
    bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) throw new Error(`${label} is not an intact glTF 2.0 binary.`);
  const jsonLength = bytes.readUInt32LE(12);
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || 20 + jsonLength > bytes.byteLength) {
    throw new Error(`${label} has an invalid JSON chunk.`);
  }
  return JSON.parse(bytes.subarray(20, 20 + jsonLength).toString('utf8').trim());
}

function verifyManifestIdentity(manifest) {
  const lods = manifest.runtime?.lods;
  if (
    manifest.schema !== 'warpkeep.asset-package.v1'
    || manifest.assetId !== 'warpkeep.castle-landscape-base'
    || manifest.name !== 'Warpkeep Castle Landscape Base'
    || manifest.version !== '1.0.0'
    || manifest.created !== '2026-07-16'
    || manifest.runtime?.meshObjectsPerFile !== 1
    || manifest.runtime?.materialsPerFile !== 1
    || manifest.runtime?.embeddedTexturesPerFile !== 2
    || manifest.runtime?.meshCompression !== 'EXT_meshopt_compression'
    || manifest.runtime?.textureCompression !== 'WebP'
    || !Array.isArray(lods)
    || lods.length !== profiles.length
    || profiles.some((profile, index) => {
      const lod = lods[index];
      return lod?.tier !== profile.tier
        || lod?.path !== profile.inputPath
        || lod?.triangles !== profile.triangles
        || lod?.bytes !== profile.input.bytes
        || lod?.maxTextureSize !== profile.textureSize
        || lod?.sha256 !== profile.input.sha256;
    })
    || manifest.coordinateContract?.gltfUp !== '+Y'
    || manifest.coordinateContract?.castleGroundPlaneGltf !== 0
    || manifest.coordinateContract?.roadFacingGltf !== '+Z'
    || manifest.coordinateContract?.attachment !== 'Use the same parent transform as the castle; do not independently normalize or ground.'
    || manifest.validation?.gltfErrors !== 0
    || manifest.validation?.gltfWarnings !== 0
    || manifest.validation?.cleanImportPassed !== true
  ) throw new Error('GameReady castle landscape-base package manifest identity changed.');
}

async function verifyEmbeddedImages(bytes, profile, label) {
  const embedded = await inspectEmbeddedWebpGlb(bytes, { label });
  if (embedded.images.length !== profile.images.length) {
    throw new Error(`${label} embedded image count changed.`);
  }
  embedded.images.forEach((image, index) => {
    const expected = profile.images[index];
    if (
      image.width !== profile.textureSize
      || image.height !== profile.textureSize
      || image.bytes !== expected.bytes
      || image.sha256 !== expected.sha256
    ) throw new Error(`${label} embedded WebP ${index} changed.`);
  });
}

async function verifyOutput(bytes, profile) {
  const label = `${profile.id} normalized castle landscape-base output`;
  assertExact(bytes, profile.output, label);
  const json = readGlbJson(bytes, label);
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const indices = json.accessors?.[primitive?.indices];
  const positions = json.accessors?.[primitive?.attributes?.POSITION];
  const node = json.nodes?.[0];
  const material = json.materials?.[0];
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
    || !exactVector(node?.translation, profile.nodeTranslation)
    || !exactVector(node?.scale, profile.nodeScale)
    || !exactRecord(node?.extras, profile.nodeExtras)
    || json.meshes?.length !== 1
    || json.meshes[0]?.name !== profile.meshName
    || json.meshes[0]?.primitives?.length !== 1
    || primitive?.mode !== 4
    || primitive?.material !== 0
    || !exactRecord(primitive?.attributes, {
      NORMAL: 1,
      TANGENT: 2,
      POSITION: 3,
      TEXCOORD_0: 4
    })
    || json.materials?.length !== 1
    || material?.name !== 'WK_CastleBase_Atlas_PBR'
    || material?.extras?.wk_atlas_size !== profile.textureSize
    || material?.doubleSided !== true
    || material?.pbrMetallicRoughness?.roughnessFactor !== 0.8600000143051147
    || material?.pbrMetallicRoughness?.metallicFactor !== 0
    || material?.pbrMetallicRoughness?.baseColorTexture?.index !== 0
    || material?.normalTexture?.index !== 1
    || material?.normalTexture?.scale !== 0.2800000011920929
    || material?.extensions?.KHR_materials_specular?.specularFactor !== 0.47999998927116394
    || json.images?.length !== 2
    || json.textures?.length !== 2
    || indices?.count / 3 !== profile.triangles
    || indices?.componentType !== 5_123
    || indices?.type !== 'SCALAR'
    || positions?.count !== profile.vertices
    || positions?.componentType !== 5_122
    || positions?.normalized !== true
    || positions?.type !== 'VEC3'
    || !exactVector(positions?.min, profile.positionBounds.min)
    || !exactVector(positions?.max, profile.positionBounds.max)
    || !exactVector(json.extensionsRequired, requiredExtensions)
    || !exactVector(json.extensionsUsed, usedExtensions)
  ) throw new Error(`${label} structure changed.`);
  await verifyEmbeddedImages(bytes, profile, label);
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_CASTLE_BASE_GAMEREADY_ROOT to the exact authorized GameReady package root.'
  );
}

const manifestBytes = readRegularExactFile(
  suppliedRoot,
  packageManifest.path,
  packageManifest,
  'GameReady castle landscape-base package manifest'
);
verifyManifestIdentity(JSON.parse(manifestBytes.toString('utf8')));

const prepared = [];
for (const profile of profiles) {
  const input = readRegularExactFile(
    suppliedRoot,
    profile.inputPath,
    profile.input,
    `${profile.id} GameReady castle landscape-base input`
  );
  await verifyEmbeddedImages(
    input,
    profile,
    `${profile.id} GameReady castle landscape-base input`
  );
  const output = profile.normalizeMetadata
    ? (await rewriteEmbeddedWebpGlb(input, {
        targetSize: profile.textureSize,
        label: `${profile.id} GameReady castle landscape-base atlas metadata correction`
      })).bytes
    : input;
  await verifyOutput(output, profile);

  const filename = `hegemony-castle-landscape-base-${profile.id}.glb`;
  prepared.push({ ...profile, filename, preparedBytes: output });
}

installAtomicFileFamily({
  destinationRoot: outputDirectory,
  entries: prepared.map((profile) => ({
    bytes: profile.preparedBytes,
    label: `${profile.id} GameReady castle landscape-base runtime`,
    relativePath: profile.filename
  }))
});

prepared.forEach((profile) => {
  console.log(
    `${profile.id}: ${profile.output.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.output.sha256}`
  );
});
