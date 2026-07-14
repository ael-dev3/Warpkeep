import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const assets = Object.freeze([
  ['public/models/title/warpkeep-title-high.glb', 3_844_364, '2354a57d88be80e5568afb5754102c20c9ea0fe9a83aa5ac49c0d8dd67ae9ff5', true],
  ['public/models/title/warpkeep-title-compact.glb', 1_714_060, 'd29435dfa3a5fbf5103a825cc00bb3ffcef7694167a7fb7303fa89af242d7af8', true],
  ['public/models/hegemony/hegemony-frontier-keep-high.glb', 2_256_092, 'ed2593a2e427c496c2eaa582f56c20290816d272c5d5b8800cdf554ecc8a296c', true],
  ['public/models/hegemony/hegemony-frontier-keep-balanced.glb', 2_064_100, 'bb47fabe11982b7eb99a9cb6a3df2a23427502417fad58edd969e51bcff061c4', true],
  ['public/models/hegemony/hegemony-frontier-keep-compact.glb', 760_916, '9de356095b314c3d43fee072c31115bb265699913991ac6aa3f656a2b8bde33b', true],
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
