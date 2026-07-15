import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { inspectEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

const root = resolve(import.meta.dirname, '..');
const assets = Object.freeze([
  ['public/models/title/warpkeep-title-high.glb', 3_844_364, '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5', true],
  ['public/models/title/warpkeep-title-compact.glb', 1_714_060, 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8', true],
  ['public/models/hegemony/hegemony-main-castle-high.glb', 1_934_920, '9e49713b5cb59f9b5ac10511652de4c243ba8b1edd2227935f4c9c415304a1a2', true],
  ['public/models/hegemony/hegemony-main-castle-balanced.glb', 1_172_132, 'aa3a557b1725dc4bd91e772f44136f72270b0c055c31d8913bb8738405b5934e', true],
  ['public/models/hegemony/hegemony-main-castle-compact.glb', 508_508, 'de27e5d43818e4aea225f10f8aa0fafa935b61b2c0c21553c36a8bef916a9c29', true],
  ['public/audio/warpkeep-title-theme-a.mp3', 5_352_113, '7844b85fb5914a00f97a7e0b1edecfb544435319266b150ad649f649797a6471', false],
  ['public/audio/warpkeep-title-theme-b.mp3', 6_380_853, 'ecade8860f8c8ff5fb8d08604b0973da329c583d78ef20c81fe5f989f624f73e', false],
  ['public/audio/warpkeep-menu-theme.mp3', 9_631_066, 'ea2a77cf5a2729e4a90a7ccbfe9a37ab1387c9371232b5219843e1715fa17917', false],
  ['public/audio/warpkeep-lowlands-theme.mp3', 5_704_657, 'd75a8865eda00c808c472d438240a5f645173dead353d44925f34cee500fa13c', false],
  ['public/video/warpkeep-menu-loop-v2.mp4', 5_713_248, '6034f049e8ee25a412fdc1f8c7ccce1ab403a58eac9158e1d0b55a6bfa99260c', false]
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

const castleStructure = new Map([
  ['public/models/hegemony/hegemony-main-castle-high.glb', {
    triangles: 67_680,
    vertices: 153_439,
    indexComponentType: 5_125,
    textureSize: 2_048,
    images: [
      [79_450, '3ff2fa16d17b08d91551f5b52ee8419a821c4e726c2296c0c539daee3f23149a'],
      [69_426, '27c90266612844c619d6a79d5db5701454ce6209e91cab47247eeb8fd065517a']
    ]
  }],
  ['public/models/hegemony/hegemony-main-castle-balanced.glb', {
    triangles: 40_353,
    vertices: 78_928,
    indexComponentType: 5_125,
    textureSize: 1_024,
    images: [
      [192_188, '1074250bd5d8bcb6889f14f5ad1a7f12e748853140bf8c7a6e6d69ce254d23e7'],
      [58_470, 'f48aef508f4f548035e2db4fafc1a52d117d67ebd5264f1f3fcb6545bf25dc6d']
    ]
  }],
  ['public/models/hegemony/hegemony-main-castle-compact.glb', {
    triangles: 19_086,
    vertices: 34_098,
    indexComponentType: 5_123,
    textureSize: 512,
    images: [
      [82_498, '712b27a1f21435c8f232dddc0e7122cedd93553eb17b4e5b6370417d3e437ba3'],
      [22_098, '7465d0ffebd3e7da60831bda33d240f3b9d6516d71922a5b5df920b930568c75']
    ]
  }]
]);

const requiredCastleExtensions = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

for (const relativePath of retiredRuntimeAssets) {
  if (lstatSync(resolve(root, relativePath), { throwIfNoEntry: false })) {
    throw new Error(`${relativePath} is a retired unresolved-rights runtime asset and must remain absent.`);
  }
}

for (const [relativePath, expectedBytes, expectedHash, glb] of assets) {
  const path = resolve(root, relativePath);
  const bytes = readFileSync(path);
  if (statSync(path).size !== expectedBytes) throw new Error(`${relativePath} byte length changed.`);
  const hash = createHash('sha256').update(bytes).digest('hex');
  if (hash !== expectedHash) throw new Error(`${relativePath} hash changed: ${hash}.`);
  if (glb && (
    bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  )) throw new Error(`${relativePath} is not an intact glTF 2.0 binary.`);

  const expectedStructure = castleStructure.get(relativePath);
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
      json.scenes?.length !== 1
      || json.meshes?.length !== 1
      || json.meshes[0].primitives?.length !== 1
      || json.materials?.length !== 1
      || json.images?.length !== 2
      || json.materials[0]?.extras?.wk_atlas_size !== expectedStructure.textureSize
      || extensions.length !== requiredCastleExtensions.length
      || requiredCastleExtensions.some((extension) => !extensions.includes(extension))
      || indices?.count / 3 !== expectedStructure.triangles
      || indices?.componentType !== expectedStructure.indexComponentType
      || positions?.count !== expectedStructure.vertices
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
  const bytes = readFileSync(path);
  if (statSync(path).size !== expectedBytes) throw new Error(`${relativePath} byte length changed.`);
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
