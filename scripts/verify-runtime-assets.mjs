import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import {
  assertNoStaleAtomicFamilyTransactions,
  readContainedRegularFile
} from './atomic-install-file-family.mjs';
import { inspectEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

const root = resolve(import.meta.dirname, '..');
assertNoStaleAtomicFamilyTransactions(
  resolve(root, 'public/models/hegemony'),
  'Hegemony runtime model directory'
);
const assets = Object.freeze([
  ['public/models/title/warpkeep-title-high.glb', 3_844_364, '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5', true],
  ['public/models/title/warpkeep-title-compact.glb', 1_714_060, 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8', true],
  ['public/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb', 2_215_972, '9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8', true],
  ['public/models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb', 892_788, 'a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157', true],
  ['public/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb', 453_628, 'b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b', true],
  ['public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb', 214_372, 'be79476bee4e1f34fa7c4a5c55d7015a8722d88e6ede0208fb0207da7ac3639c', true],
  ['public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb', 92_784, '179a5b28696aaa239cc9059b2e1a48ef8dcd4a33c9964314356f7b6fb472856f', true],
  ['public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb', 27_328, 'f1f9322c2554ff42909df04799f25f5456284344297966e4e65eb2ff63b519a3', true],
  // Retain the exact Alpha 0.3.4 coordinates for old clients and rollback.
  ['public/models/hegemony/hegemony-main-castle-high.glb', 1_934_920, '9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2', true],
  ['public/models/hegemony/hegemony-main-castle-balanced.glb', 1_172_132, 'aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e', true],
  ['public/models/hegemony/hegemony-main-castle-compact.glb', 508_508, 'de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29', true],
  ['public/audio/warpkeep-title-theme-a.mp3', 5_352_113, '7844b85fb5914a00f97a7e0b1edecfb544435319266b150ad649f649797a6471', false],
  ['public/audio/warpkeep-title-theme-b.mp3', 6_380_853, 'ecade8860f8c8ff5fb8d08604b0973da329c583d78ef20c81fe5f989f624f73e', false],
  ['public/audio/warpkeep-menu-theme.mp3', 9_631_066, 'ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917', false],
  ['public/audio/warpkeep-lowlands-theme.mp3', 5_704_657, 'd75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c', false],
  ['public/video/warpkeep-menu-loop-v2.mp4', 5_713_248, '6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c', false],
  ['public/images/realm/hegemony-castle-record.webp', 145_416, '30e0c3cd1bbc4732bb5025a78a5dc0cc66bc01c1b752a3f21b48fb429cc11123', false]
]);

const imageAssets = Object.freeze([
  ['public/images/resources/hegemony-food.png', 1_254, 'png', 1_849_831, 'd1e295299f710be2b04249d6a96e0abd53ccc6d2bd74560428ee0964f5fff474'],
  ['public/images/resources/hegemony-gold.png', 1_254, 'png', 1_142_819, '87dddaa91a23f630e86da35da8b5b7300c0ecce9fb850060c0c18b0f2de72f26'],
  ['public/images/factions/hegemony/marks/hegemony-mark-32.png', 32, 'png', 2_508, '5a11e27123b287a663d316c2b307e5be6549cee206383dc17c741762df69363e'],
  ['public/images/factions/hegemony/marks/hegemony-mark-32.webp', 32, 'webp', 2_060, '1ad2faaea36b80bfdd2140ea9d401a49d96766a4bf2d7a439a8dbaac814c1449'],
  ['public/images/factions/hegemony/marks/hegemony-mark-64.png', 64, 'png', 8_122, '773cdd9cae90a5030182d50689a3e6322cb628b8732a528d2a3563c9468b2bbb'],
  ['public/images/factions/hegemony/marks/hegemony-mark-64.webp', 64, 'webp', 6_230, 'f99a96695ed7bf7278b5273d8d6362df70e4b7d2112cdddd22adb1912a08289a'],
  ['public/images/factions/hegemony/marks/hegemony-mark-128.png', 128, 'png', 28_910, 'e694e586f9fa061c2ebcfe0a852f53f20a9b90794c3bbf5fd31d514a83bf5728'],
  ['public/images/factions/hegemony/marks/hegemony-mark-128.webp', 128, 'webp', 20_364, '3cbae6967d54a709efb2e9a455040fdb89b5fb1e682ebeddbfda71d39b0b260e'],
  ['public/images/factions/hegemony/marks/hegemony-mark-256.png', 256, 'png', 104_050, '8515b544c231a78f41f80731b74caeeca1cd93dbad6313a424f95fe669a25852'],
  ['public/images/factions/hegemony/marks/hegemony-mark-256.webp', 256, 'webp', 67_172, '55814b1b150f268426b1a49bffea5a377ca7a62adad526d2e09c48966428dc86']
]);

const retiredRuntimeAssets = Object.freeze([
  'public/models/hegemony/hegemony-frontier-keep-high.glb',
  'public/models/hegemony/hegemony-frontier-keep-balanced.glb',
  'public/models/hegemony/hegemony-frontier-keep-compact.glb'
]);

const hegemonyModelStructure = new Map([
  ['public/models/hegemony/hegemony-main-castle-high-9fe06a26446387e0.glb', {
    triangles: 72_850,
    vertices: 171_554,
    indexComponentType: 5_125,
    positionComponentType: 5_122,
    positionBounds: { min: [-31_083, -32_767, -23_202], max: [31_083, 32_767, 23_202] },
    nodeName: 'WK_Hegemony_Hero_Castle_LOD0_High',
    nodeTranslation: [0, 7.031000137329102, -0.005000114440917969],
    nodeScale: [7.031000137329102, 7.031000137329102, 7.031000137329102],
    textureSize: 2_048,
    images: [
      [79_450, '3ff2fa16d17b08d91551f5b52ee8419a821c4e726c2296c0c539daee3f23149a'],
      [69_426, '27c90266612844c619d6a79d5db5701454ce6209e91cab47247eeb8fd065517a']
    ]
  }],
  ['public/models/hegemony/hegemony-main-castle-balanced-a9df1a9acd36e720.glb', {
    triangles: 32_550,
    vertices: 67_687,
    indexComponentType: 5_125,
    positionComponentType: 5_122,
    positionBounds: { min: [-31_083, -32_767, -23_022], max: [31_083, 32_767, 23_022] },
    nodeName: 'WK_Hegemony_Hero_Castle_LOD1_Balanced',
    nodeTranslation: [0, 7.031000137329102, -0.04333782196044922],
    nodeScale: [7.031000137329102, 7.031000137329102, 7.031000137329102],
    textureSize: 1_024,
    images: [
      [32_778, '0de8df64eb0a560cc47e993e4f74d7db7eb6bf7309a0533e1733c68cd52d0a65'],
      [26_618, '65b23eeba73539f2cc6b0bdf8e83d7a651d61fbe85c4305b488ce83dbc28a3eb']
    ]
  }],
  ['public/models/hegemony/hegemony-main-castle-compact-b665d75e10e3e289.glb', {
    triangles: 17_232,
    vertices: 34_800,
    indexComponentType: 5_123,
    positionComponentType: 5_122,
    positionBounds: { min: [-32_451, -32_767, -23_742], max: [32_451, 32_767, 23_742] },
    nodeName: 'WK_Hegemony_Hero_Castle_LOD2_Compact',
    nodeTranslation: [0, 6.734999656677246, -0.03333783149719238],
    nodeScale: [6.734999656677246, 6.734999656677246, 6.734999656677246],
    textureSize: 512,
    images: [
      [10_960, '655717cd92ffc0eae1b08721b22c5be95121b228f765f7ffee6457b3b888f381'],
      [10_684, '1e3b4e022566d4b07f96f17a579f756b11cbd6abf803d42491711f983f64af3f']
    ]
  }],
  ['public/models/hegemony/hegemony-castle-landscape-base-high-be79476bee4e1f34.glb', {
    triangles: 3_954,
    vertices: 10_681,
    indexComponentType: 5_123,
    positionComponentType: 5_122,
    positionBounds: { min: [-32_767, -4_124, -27_179], max: [32_767, 4_124, 27_179] },
    nodeName: 'WK_Castle_LandscapeBase_LOD0_High',
    meshName: 'WK_Castle_LandscapeBase_LOD0_High_Mesh',
    nodeTranslation: [0.1762232780456543, 0.7211456596851349, 0.4222433567047119],
    nodeScale: [9.26375150680542, 9.26375150680542, 9.26375150680542],
    nodeExtras: {
      wk_lod_detail: 0,
      wk_atlas_region: 'mixed',
      wk_asset: 'castle-landscape-base',
      wk_lod: 2,
      wk_origin_contract: 'castle-ground-plane-z0',
      wk_gate_road_facing_blender: '-Y',
      wk_gate_road_facing_gltf: '+Z',
      wk_castle_ground_plane_z: 0,
      wk_runtime_attach: 'same transform as castle; do not independently normalize or ground'
    },
    textureSize: 1_024,
    images: [
      [95_098, 'ee821457dcc3efba733e9176dac35f4bd07916c1f613a89175788f9b2817181d'],
      [29_586, '92918cb1e221b75ee11af809b1e99b3fb5f60b4342f0dbea68b65135e241dc65']
    ]
  }],
  ['public/models/hegemony/hegemony-castle-landscape-base-balanced-179a5b28696aaa23.glb', {
    triangles: 2_138,
    vertices: 5_611,
    indexComponentType: 5_123,
    positionComponentType: 5_122,
    positionBounds: { min: [-32_767, -4_124, -27_179], max: [32_767, 4_124, 27_179] },
    nodeName: 'WK_Castle_LandscapeBase_LOD1_Balanced',
    meshName: 'WK_Castle_LandscapeBase_LOD1_Balanced_Mesh',
    nodeTranslation: [0.1762232780456543, 0.7211456596851349, 0.4222433567047119],
    nodeScale: [9.26375150680542, 9.26375150680542, 9.26375150680542],
    nodeExtras: {
      wk_lod_detail: 0,
      wk_atlas_region: 'mixed',
      wk_asset: 'castle-landscape-base',
      wk_lod: 1,
      wk_origin_contract: 'castle-ground-plane-z0',
      wk_gate_road_facing_blender: '-Y',
      wk_gate_road_facing_gltf: '+Z',
      wk_castle_ground_plane_z: 0,
      wk_runtime_attach: 'same transform as castle; do not independently normalize or ground'
    },
    textureSize: 512,
    images: [
      [29_544, '439351b1cc2f84f988bfeb5b492a9c6652c74741bed29ce17fd7e45c222f99f0'],
      [10_130, '3714349aed5b0f7225807674f4719a79f5fd09e25a5cb108f5cc46a4767dc86f']
    ]
  }],
  ['public/models/hegemony/hegemony-castle-landscape-base-compact-f1f9322c2554ff42.glb', {
    triangles: 714,
    vertices: 1_780,
    indexComponentType: 5_123,
    positionComponentType: 5_122,
    positionBounds: { min: [-32_767, -4_060, -27_179], max: [32_767, 4_060, 27_179] },
    nodeName: 'WK_Castle_LandscapeBase_LOD2_Compact',
    meshName: 'WK_Castle_LandscapeBase_LOD2_Compact_Mesh',
    nodeTranslation: [0.1762232780456543, 0.7025456726551056, 0.4222433567047119],
    nodeScale: [9.26375150680542, 9.26375150680542, 9.26375150680542],
    nodeExtras: {
      wk_lod_detail: 0,
      wk_atlas_region: 'mixed',
      wk_asset: 'castle-landscape-base',
      wk_lod: 0,
      wk_origin_contract: 'castle-ground-plane-z0',
      wk_gate_road_facing_blender: '-Y',
      wk_gate_road_facing_gltf: '+Z',
      wk_castle_ground_plane_z: 0,
      wk_runtime_attach: 'same transform as castle; do not independently normalize or ground'
    },
    textureSize: 256,
    images: [
      [2_900, '39bb781d03fe4f134532846750e7f387891c053703e90ce28e150d5a568ef29f'],
      [2_460, '80d914be77fd5dde0fc330091ae35d366a6497d1982f1b75dc7b43920526924d']
    ]
  }]
]);

const expectedHegemonyGlbNames = new Set(
  assets
    .map(([path]) => path)
    .filter((path) => path.startsWith('public/models/hegemony/') && path.endsWith('.glb'))
    .map((path) => basename(path))
);
const observedHegemonyGlbEntries = readdirSync(resolve(root, 'public/models/hegemony'), {
  withFileTypes: true
})
  .filter((entry) => entry.name.toLowerCase().endsWith('.glb'));
const observedHegemonyGlbNames = observedHegemonyGlbEntries
  .map((entry) => entry.name)
  .sort();
const invalidHegemonyGlbEntries = observedHegemonyGlbEntries
  .filter((entry) => !entry.isFile())
  .map((entry) => entry.name)
  .sort();
const unknownHegemonyGlbs = observedHegemonyGlbNames.filter(
  (name) => !expectedHegemonyGlbNames.has(name)
);
const missingHegemonyGlbs = [...expectedHegemonyGlbNames]
  .filter((name) => !observedHegemonyGlbNames.includes(name))
  .sort();
if (
  unknownHegemonyGlbs.length > 0
  || missingHegemonyGlbs.length > 0
  || invalidHegemonyGlbEntries.length > 0
) {
  throw new Error(
    'Hegemony runtime GLB set does not match the exact active and compatibility coordinates: '
    + `unknown=[${unknownHegemonyGlbs.join(',')}], missing=[${missingHegemonyGlbs.join(',')}], `
    + `nonFiles=[${invalidHegemonyGlbEntries.join(',')}].`
  );
}

const requiredCastleExtensions = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

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

for (const relativePath of retiredRuntimeAssets) {
  if (lstatSync(resolve(root, relativePath), { throwIfNoEntry: false })) {
    throw new Error(`${relativePath} is a retired unresolved-rights runtime asset and must remain absent.`);
  }
}

for (const [relativePath, expectedBytes, expectedHash, glb] of assets) {
  if (
    hegemonyModelStructure.has(relativePath)
    && !relativePath.endsWith(`-${expectedHash.slice(0, 16)}.glb`)
  ) {
    throw new Error(`${relativePath} must carry its SHA-256 prefix as an immutable cache coordinate.`);
  }
  const path = resolve(root, relativePath);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relativePath} must be a regular non-symbolic runtime asset.`);
  }
  if (stat.size !== expectedBytes) throw new Error(`${relativePath} byte length changed.`);
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${relativePath} runtime asset`,
    expectedBytes
  });
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`${relativePath} hash changed: ${hash}.`);
  if (glb && (
    bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  )) throw new Error(`${relativePath} is not an intact glTF 2.0 binary.`);

  const expectedStructure = hegemonyModelStructure.get(relativePath);
  if (expectedStructure) {
    const jsonLength = bytes.readUInt32LE(12);
    const jsonEnd = 20 + jsonLength;
    if (
      bytes.readUInt32LE(16) !== 0x4e4f534a
      || jsonEnd > bytes.byteLength
    ) throw new Error(`${relativePath} has an invalid GLB JSON chunk.`);
    const json = JSON.parse(bytes.subarray(20, jsonEnd).toString('utf8').trim());
    const primitive = json.meshes?.[0]?.primitives?.[0];
    const indices = json.accessors?.[primitive?.indices];
    const positions = json.accessors?.[primitive?.attributes?.POSITION];
    const extensions = json.extensionsRequired ?? [];
    if (
      json.asset?.generator !== 'glTF-Transform v4.4.1'
      || json.scenes?.length !== 1
      || (expectedStructure.meshName && json.scenes[0]?.name !== 'Scene')
      || !exactVector(json.scenes[0]?.nodes, [0])
      || json.meshes?.length !== 1
      || (expectedStructure.meshName && json.meshes[0]?.name !== expectedStructure.meshName)
      || json.meshes[0].primitives?.length !== 1
      || (expectedStructure.meshName && primitive?.mode !== 4)
      || (expectedStructure.meshName && primitive?.material !== 0)
      || (expectedStructure.meshName && !exactRecord(primitive?.attributes, {
        NORMAL: 1,
        TANGENT: 2,
        POSITION: 3,
        TEXCOORD_0: 4
      }))
      || json.materials?.length !== 1
      || json.images?.length !== 2
      || json.materials[0]?.extras?.wk_atlas_size !== expectedStructure.textureSize
      || extensions.length !== requiredCastleExtensions.length
      || requiredCastleExtensions.some((extension) => !extensions.includes(extension))
      || indices?.count / 3 !== expectedStructure.triangles
      || indices?.componentType !== expectedStructure.indexComponentType
      || positions?.count !== expectedStructure.vertices
      || positions?.componentType !== expectedStructure.positionComponentType
      || positions?.normalized !== true
      || positions?.type !== 'VEC3'
      || !Array.isArray(positions?.min)
      || positions.min.length !== 3
      || positions.min.some((value, index) => value !== expectedStructure.positionBounds.min[index])
      || !Array.isArray(positions?.max)
      || positions.max.length !== 3
      || positions.max.some((value, index) => value !== expectedStructure.positionBounds.max[index])
      || json.nodes?.length !== 1
      || json.nodes[0]?.name !== expectedStructure.nodeName
      || json.nodes[0]?.mesh !== 0
      || !exactVector(json.nodes[0]?.translation, expectedStructure.nodeTranslation)
      || !exactVector(json.nodes[0]?.scale, expectedStructure.nodeScale)
      || (expectedStructure.nodeExtras && !exactRecord(json.nodes[0]?.extras, expectedStructure.nodeExtras))
    ) throw new Error(`${relativePath} structure no longer matches its reviewed runtime profile.`);

    const embedded = await inspectEmbeddedWebpGlb(bytes, { label: relativePath });
    embedded.images.forEach((image, index) => {
      const [expectedImageBytes, expectedImageHash] = expectedStructure.images[index];
      if (
        image.width !== expectedStructure.textureSize
        || image.height !== expectedStructure.textureSize
        || image.bytes !== expectedImageBytes
        || image.sha256 !== expectedImageHash
      ) throw new Error(`${relativePath} embedded WebP ${index} changed.`);
    });
  }
}

for (const [relativePath, expectedSize, format, expectedBytes, expectedHash] of imageAssets) {
  const path = resolve(root, relativePath);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relativePath} must be a regular non-symbolic runtime asset.`);
  }
  if (stat.size !== expectedBytes) throw new Error(`${relativePath} byte length changed.`);
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${relativePath} runtime image`,
    expectedBytes
  });
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`${relativePath} hash changed: ${hash}.`);

  if (format === 'png') {
    if (
      !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      || bytes.readUInt32BE(8) !== 13
      || bytes.subarray(12, 16).toString('ascii') !== 'IHDR'
      || bytes.readUInt32BE(16) !== expectedSize
      || bytes.readUInt32BE(20) !== expectedSize
      || bytes[24] !== 8
      || bytes[25] !== 6
      || bytes[28] !== 0
    ) throw new Error(`${relativePath} is not the expected transparent RGBA PNG.`);
  } else {
    const vp8lBits = bytes.readUInt32LE(21);
    const width = (vp8lBits & 0x3fff) + 1;
    const height = ((vp8lBits >>> 14) & 0x3fff) + 1;
    const alpha = (vp8lBits >>> 28) & 1;
    if (
      bytes.subarray(0, 4).toString('ascii') !== 'RIFF'
      || bytes.readUInt32LE(4) + 8 !== bytes.byteLength
      || bytes.subarray(8, 12).toString('ascii') !== 'WEBP'
      || bytes.subarray(12, 16).toString('ascii') !== 'VP8L'
      || bytes[20] !== 0x2f
      || width !== expectedSize
      || height !== expectedSize
      || alpha !== 1
    ) throw new Error(`${relativePath} is not the expected lossless alpha WebP.`);
  }
}

console.log(`Verified ${assets.length + imageAssets.length} exact runtime assets.`);
