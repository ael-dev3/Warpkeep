import { createHash } from 'node:crypto';
import { lstatSync, readdirSync } from 'node:fs';
import { basename, resolve } from 'node:path';

import sharp from 'sharp';

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
  // The animated wagon has a dedicated structural verifier below the build
  // boundary. Keep these top-level coordinates here so unknown GLBs fail closed.
  ['public/models/hegemony/hegemony-supply-wagon-high-4a0f762b9dadeadd.glb', 1_637_452, '4a0f762b9dadeaddd8b2d528a7e165eaa98a8dd4134eb924604922524e7bbc5d', true],
  ['public/models/hegemony/hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb', 752_364, 'af0f8788eaaf9a32e9fd8d17e9ab897a9036d0cc7161a318afa0af3556c6e3b2', true],
  ['public/models/hegemony/hegemony-supply-wagon-compact-fefb5105b95d43b4.glb', 452_676, 'fefb5105b95d43b411571000e8ae3fd78460eaa5f490eaeb63f90e5d84aba6ca', true],
  // Retain the exact Alpha 0.3.4 coordinates for old clients and rollback.
  ['public/models/hegemony/hegemony-main-castle-high.glb', 1_934_920, '9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2', true],
  ['public/models/hegemony/hegemony-main-castle-balanced.glb', 1_172_132, 'aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e', true],
  ['public/models/hegemony/hegemony-main-castle-compact.glb', 508_508, 'de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29', true],
  ['public/audio/warpkeep-title-theme-a.mp3', 5_352_113, '7844b85fb5914a00f97a7e0b1edecfb544435319266b150ad649f649797a6471', false],
  ['public/audio/warpkeep-title-theme-b.mp3', 6_380_853, 'ecade8860f8c8ff5fb8d08604b0973da329c583d78ef20c81fe5f989f624f73e', false],
  ['public/audio/warpkeep-menu-theme.mp3', 9_631_066, 'ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917', false],
  ['public/audio/warpkeep-lowlands-theme.mp3', 5_704_657, 'd75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c', false],
  ['public/video/warpkeep-menu-loop-v2.mp4', 5_713_248, '6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c', false],
  ['public/images/realm/hegemony-castle-record.webp', 145_416, '30e0c3cd1bbc4732bb5025a78a5dc0cc66bc01c1b752a3f21b48fb429cc11123', false],
  ['public/images/realm/hegemony-gold-mine-record.webp', 218_736, 'a2c52a5e1536860ce3ad778c1719e354637fe473495c45ee927c99f468c60fa3', false],
  ['public/images/realm/hegemony-wheat-farm-record.webp', 224_806, '466c80380a8d23de043731a7c386e78c9b36a2d2e69fa175db4b87efc3f43eb0', false],
  ['public/images/realm/hegemony-logging-camp-record.webp', 177_622, 'fb9d171e423a7bd4bfcce1e68cd3faecb38b4904bc528f720e4283522fca1293', false],
  ['public/images/realm/hegemony-stone-quarry-record.webp', 186_736, '86b13c14a0eda7403c3583d886be3242e04d7ef9e442fcfdbcc054642421a70a', false]
]);

const referenceImageAssets = Object.freeze([
  ['docs/reference/resources/2026-07-17-hegemony-food-icon/hegemony-food-reference.png', 1_254, 'png', 1_849_831, 'd1e295299f710be2b04249d6a96e0abd53ccc6d2bd74560428ee0964f5fff474'],
  ['docs/reference/resources/2026-07-17-hegemony-gold-icon/hegemony-gold-reference.png', 1_254, 'png', 1_142_819, '87dddaa91a23f630e86da35da8b5b7300c0ecce9fb850060c0c18b0f2de72f26'],
  ['docs/reference/resources/2026-07-17-hegemony-stone-icon/hegemony-stone-reference.png', 1_254, 'png', 1_107_308, 'dcf32bfe714b82c81a9db0d13bff0f176689ff35ff6c0554c3f7c0c8f24fa6e0'],
  ['docs/reference/resources/2026-07-17-hegemony-wood-icon/hegemony-wood-reference.png', 1_254, 'png', 1_190_014, 'e8b586724afd1082c38c89f86de6d854b86234696b3978633be96152bc17c93a']
]);

const retiredResourceRuntimePaths = Object.freeze([
  'public/images/resources/hegemony-food.png',
  'public/images/resources/hegemony-gold.png',
  'public/images/resources/hegemony-stone.png',
  'public/images/resources/hegemony-wood.png'
]);

const resourceImageAssets = Object.freeze([
  Object.freeze({
    name: 'food',
    path: 'public/images/resources/hegemony-food-c2034046ead78f5f.png',
    size: 64,
    format: 'png',
    bytes: 7_567,
    sha256: 'c2034046ead78f5f23a79ae2fb742352c8c353586d0761e63bf725054bf5d3a4',
    decodedRgbaSha256: 'c80fc693e2b3bf56836fe7f235e4ee457f8e7203892b72139f3c98b7ee05fcad',
    alpha: Object.freeze({ transparentPixels: 1_989, partiallyTransparentPixels: 723, opaquePixels: 1_384 })
  }),
  Object.freeze({
    name: 'food',
    path: 'public/images/resources/hegemony-food-5c012a7e939f8796.webp',
    size: 64,
    format: 'webp',
    bytes: 6_314,
    sha256: '5c012a7e939f879698921bfb2d17a1007d5635cf6bfbaa8477205cef2375c509',
    decodedRgbaSha256: 'c80fc693e2b3bf56836fe7f235e4ee457f8e7203892b72139f3c98b7ee05fcad',
    alpha: Object.freeze({ transparentPixels: 1_989, partiallyTransparentPixels: 723, opaquePixels: 1_384 })
  }),
  Object.freeze({
    name: 'gold',
    path: 'public/images/resources/hegemony-gold-3d087ebe1ba2beaf.png',
    size: 64,
    format: 'png',
    bytes: 6_578,
    sha256: '3d087ebe1ba2beaf5590b93fcccde998546c4eb1c5e3c124a694a85683241d9a',
    decodedRgbaSha256: 'fc8afe04499adf8c0f0e1cb8c95e2cadb302365d9acca4e41ca595aff2caf256',
    alpha: Object.freeze({ transparentPixels: 2_214, partiallyTransparentPixels: 620, opaquePixels: 1_262 })
  }),
  Object.freeze({
    name: 'gold',
    path: 'public/images/resources/hegemony-gold-522eb5b1f40b5d51.webp',
    size: 64,
    format: 'webp',
    bytes: 5_704,
    sha256: '522eb5b1f40b5d51395301a9f85b99e9f96008140e6c24d33c38b795546b9689',
    decodedRgbaSha256: 'fc8afe04499adf8c0f0e1cb8c95e2cadb302365d9acca4e41ca595aff2caf256',
    alpha: Object.freeze({ transparentPixels: 2_214, partiallyTransparentPixels: 620, opaquePixels: 1_262 })
  }),
  Object.freeze({
    name: 'stone',
    path: 'public/images/resources/hegemony-stone-e23ed963027579c7.png',
    size: 64,
    format: 'png',
    bytes: 6_149,
    sha256: 'e23ed963027579c7dd6e465414e3a171aba622d25009af9d4d1077f568fa7f7b',
    decodedRgbaSha256: '97f48ef84d6f768f4e1b2242ae90eaa80e1aeba92de75c8c85b5843b854c0278',
    alpha: Object.freeze({ transparentPixels: 2_360, partiallyTransparentPixels: 555, opaquePixels: 1_181 })
  }),
  Object.freeze({
    name: 'stone',
    path: 'public/images/resources/hegemony-stone-ac50a538fc202d15.webp',
    size: 64,
    format: 'webp',
    bytes: 4_366,
    sha256: 'ac50a538fc202d15b378649f4778c88d1a312bced1dd8f3f7cdbb829a50841de',
    decodedRgbaSha256: '97f48ef84d6f768f4e1b2242ae90eaa80e1aeba92de75c8c85b5843b854c0278',
    alpha: Object.freeze({ transparentPixels: 2_360, partiallyTransparentPixels: 555, opaquePixels: 1_181 })
  }),
  Object.freeze({
    name: 'wood',
    path: 'public/images/resources/hegemony-wood-d992823f7a7f2999.png',
    size: 64,
    format: 'png',
    bytes: 5_729,
    sha256: 'd992823f7a7f2999eff03c77f68ab0c24a952ba6018bab4ee86ccd8f2dd3f689',
    decodedRgbaSha256: '3686140686a8801ca17fb10a12ed22368a0ad1fab5fc76a2d2b0b73cdb0d8479',
    alpha: Object.freeze({ transparentPixels: 2_450, partiallyTransparentPixels: 510, opaquePixels: 1_136 })
  }),
  Object.freeze({
    name: 'wood',
    path: 'public/images/resources/hegemony-wood-add35506da245240.webp',
    size: 64,
    format: 'webp',
    bytes: 4_386,
    sha256: 'add35506da245240c245c8605433108b188b03c94eadab400b2cb9bab956c92c',
    decodedRgbaSha256: '3686140686a8801ca17fb10a12ed22368a0ad1fab5fc76a2d2b0b73cdb0d8479',
    alpha: Object.freeze({ transparentPixels: 2_450, partiallyTransparentPixels: 510, opaquePixels: 1_136 })
  })
]);

const imageAssets = Object.freeze([
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

function alphaProfile(raw) {
  const profile = { transparentPixels: 0, partiallyTransparentPixels: 0, opaquePixels: 0 };
  for (let index = 3; index < raw.length; index += 4) {
    if (raw[index] === 0) profile.transparentPixels += 1;
    else if (raw[index] === 255) profile.opaquePixels += 1;
    else profile.partiallyTransparentPixels += 1;
  }
  return profile;
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

for (const relativePath of retiredResourceRuntimePaths) {
  if (lstatSync(resolve(root, relativePath), { throwIfNoEntry: false }) !== undefined) {
    throw new Error(`${relativePath} is an old unhashed PR #45 coordinate and must remain absent.`);
  }
}

const resourceRuntimeRoot = resolve(root, 'public/images/resources');
assertNoStaleAtomicFamilyTransactions(
  resourceRuntimeRoot,
  'Hegemony resource runtime directory'
);
const expectedResourceNames = new Set(resourceImageAssets.map(({ path }) => basename(path)));
const resourceEntries = readdirSync(resourceRuntimeRoot, { withFileTypes: true });
const invalidResourceEntries = resourceEntries
  .filter((entry) => !entry.isFile())
  .map((entry) => entry.name)
  .sort();
const observedResourceNames = resourceEntries.map((entry) => entry.name).sort();
const unknownResourceNames = observedResourceNames
  .filter((name) => !expectedResourceNames.has(name));
const missingResourceNames = [...expectedResourceNames]
  .filter((name) => !observedResourceNames.includes(name))
  .sort();
if (
  invalidResourceEntries.length > 0
  || unknownResourceNames.length > 0
  || missingResourceNames.length > 0
) {
  throw new Error(
    'Hegemony resource runtime set changed: '
    + `unknown=[${unknownResourceNames.join(',')}], missing=[${missingResourceNames.join(',')}], `
    + `nonFiles=[${invalidResourceEntries.join(',')}].`
  );
}

for (const [relativePath, expectedSize, format, expectedBytes, expectedHash] of [
  ...imageAssets,
  ...resourceImageAssets.map((asset) => [
    asset.path,
    asset.size,
    asset.format,
    asset.bytes,
    asset.sha256
  ]),
  ...referenceImageAssets
]) {
  const assetKind = relativePath.startsWith('public/') ? 'runtime image' : 'reference master';
  const path = resolve(root, relativePath);
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (!stat?.isFile() || stat.isSymbolicLink()) {
    throw new Error(`${relativePath} must be a regular non-symbolic ${assetKind}.`);
  }
  if (stat.size !== expectedBytes) throw new Error(`${relativePath} byte length changed.`);
  const bytes = readContainedRegularFile({
    root,
    relativePath,
    label: `${relativePath} ${assetKind}`,
    expectedBytes
  });
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`${relativePath} hash changed: ${hash}.`);
  if (
    relativePath.startsWith('public/images/resources/')
    && !relativePath.endsWith(`-${hash.slice(0, 16)}.${format}`)
  ) throw new Error(`${relativePath} must carry its SHA-256 prefix as an immutable cache coordinate.`);

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

for (const [name, expectedVersion] of Object.entries({
  sharp: '0.35.3',
  vips: '8.18.3',
  png: '1.6.58',
  webp: '1.6.0'
})) {
  if (sharp.versions[name] !== expectedVersion) {
    throw new Error(`Runtime image verifier requires ${name} ${expectedVersion}, received ${String(sharp.versions[name])}.`);
  }
}
sharp.cache(false);
sharp.concurrency(1);
sharp.simd(false);

const resourcePixels = new Map();
for (const asset of resourceImageAssets) {
  const bytes = readContainedRegularFile({
    root,
    relativePath: asset.path,
    label: `${asset.path} runtime image`,
    expectedBytes: asset.bytes
  });
  const image = sharp(bytes, { failOn: 'warning', limitInputPixels: asset.size ** 2 });
  const metadata = await image.metadata();
  if (
    metadata.format !== asset.format
    || metadata.width !== asset.size
    || metadata.height !== asset.size
    || metadata.channels !== 4
    || metadata.depth !== 'uchar'
    || metadata.hasAlpha !== true
    || (asset.format === 'png' && metadata.bitsPerSample !== 8)
  ) throw new Error(`${asset.path} decoder metadata changed: ${JSON.stringify(metadata)}.`);

  const raw = await image.ensureAlpha().raw().toBuffer();
  const decodedHash = createHash('sha256').update(raw).digest('hex');
  if (decodedHash !== asset.decodedRgbaSha256) {
    throw new Error(`${asset.path} decoded RGBA hash changed: ${decodedHash}.`);
  }
  if (!exactRecord(alphaProfile(raw), asset.alpha)) {
    throw new Error(`${asset.path} alpha profile changed.`);
  }

  const prior = resourcePixels.get(asset.name);
  if (prior && !prior.equals(raw)) {
    throw new Error(`${asset.name} PNG and lossless WebP decoded pixels differ.`);
  }
  resourcePixels.set(asset.name, raw);
}
if (resourcePixels.size !== 4) {
  throw new Error('The reviewed resource runtime family must contain exactly four pixel-equivalent PNG/WebP pairs.');
}

console.log(
  `Verified ${assets.length + imageAssets.length + resourceImageAssets.length} exact runtime assets and `
  + `${referenceImageAssets.length} exact provenance reference masters.`
);
