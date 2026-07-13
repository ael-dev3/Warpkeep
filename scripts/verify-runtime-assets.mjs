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

console.log(`Verified ${assets.length} exact runtime assets.`);
