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
const suppliedRoot = process.env.WARPKEEP_CASTLE_GAMEREADY_ROOT
  ? resolve(process.env.WARPKEEP_CASTLE_GAMEREADY_ROOT)
  : undefined;
const outputDirectory = resolve(root, 'public/models/hegemony');

const packageManifest = Object.freeze({
  path: 'asset-manifest.json',
  bytes: 1_456,
  sha256: '6a4a67baa4912f93337b7100d27ffe65e9c185492e8c2047c4d2ccdefe591c23'
});

const profiles = Object.freeze([
  Object.freeze({
    id: 'high',
    input: Object.freeze({
      bytes: 2_215_972,
      sha256: '9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8'
    }),
    output: Object.freeze({
      bytes: 2_215_972,
      sha256: '9fe06a26446387e007ea32acfccbf6657e7a6763d73e2cb3890f103fb590afe8'
    }),
    textureSize: 2_048,
    triangles: 72_850,
    vertices: 171_554,
    indexComponentType: 5_125,
    positionBounds: Object.freeze({
      min: Object.freeze([-31_083, -32_767, -23_202]),
      max: Object.freeze([31_083, 32_767, 23_202])
    }),
    nodeName: 'WK_Hegemony_Hero_Castle_LOD0_High',
    nodeTranslation: Object.freeze([0, 7.031000137329102, -0.005000114440917969]),
    nodeScale: Object.freeze([7.031000137329102, 7.031000137329102, 7.031000137329102]),
    normalizeMetadata: false,
    images: Object.freeze([
      Object.freeze({ bytes: 79_450, sha256: '3ff2fa16d17b08d91551f5b52ee8419a821c4e726c2296c0c539daee3f23149a' }),
      Object.freeze({ bytes: 69_426, sha256: '27c90266612844c619d6a79d5db5701454ce6209e91cab47247eeb8fd065517a' })
    ])
  }),
  Object.freeze({
    id: 'balanced',
    input: Object.freeze({
      bytes: 892_796,
      sha256: 'a480439ac47be4ee419ce623de0d785c4f4ce73cd110dc093c6508faa6cfdbae'
    }),
    output: Object.freeze({
      bytes: 892_788,
      sha256: 'a9df1a9acd36e7208b764396854053a6e3c591f2eb04a83a6e2437c55a3aa157'
    }),
    textureSize: 1_024,
    triangles: 32_550,
    vertices: 67_687,
    indexComponentType: 5_125,
    positionBounds: Object.freeze({
      min: Object.freeze([-31_083, -32_767, -23_022]),
      max: Object.freeze([31_083, 32_767, 23_022])
    }),
    nodeName: 'WK_Hegemony_Hero_Castle_LOD1_Balanced',
    nodeTranslation: Object.freeze([0, 7.031000137329102, -0.04333782196044922]),
    nodeScale: Object.freeze([7.031000137329102, 7.031000137329102, 7.031000137329102]),
    normalizeMetadata: true,
    images: Object.freeze([
      Object.freeze({ bytes: 32_778, sha256: '0de8df64eb0a560cc47e993e4f74d7db7eb6bf7309a0533e1733c68cd52d0a65' }),
      Object.freeze({ bytes: 26_618, sha256: '65b23eeba73539f2cc6b0bdf8e83d7a651d61fbe85c4305b488ce83dbc28a3eb' })
    ])
  }),
  Object.freeze({
    id: 'compact',
    input: Object.freeze({
      bytes: 453_632,
      sha256: '5b0f6919585b10f51b42f004c32d1c96bf2addc2549af3b84b0eea7fcedffe5e'
    }),
    output: Object.freeze({
      bytes: 453_628,
      sha256: 'b665d75e10e3e289dac09ebb9f0eeec75469dda77fb25265b03b5ad6081c627b'
    }),
    textureSize: 512,
    triangles: 17_232,
    vertices: 34_800,
    indexComponentType: 5_123,
    positionBounds: Object.freeze({
      min: Object.freeze([-32_451, -32_767, -23_742]),
      max: Object.freeze([32_451, 32_767, 23_742])
    }),
    nodeName: 'WK_Hegemony_Hero_Castle_LOD2_Compact',
    nodeTranslation: Object.freeze([0, 6.734999656677246, -0.03333783149719238]),
    nodeScale: Object.freeze([6.734999656677246, 6.734999656677246, 6.734999656677246]),
    normalizeMetadata: true,
    images: Object.freeze([
      Object.freeze({ bytes: 10_960, sha256: '655717cd92ffc0eae1b08721b22c5be95121b228f765f7ffee6457b3b888f381' }),
      Object.freeze({ bytes: 10_684, sha256: '1e3b4e022566d4b07f96f17a579f756b11cbd6abf803d42491711f983f64af3f' })
    ])
  })
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

async function verifyOutput(bytes, profile) {
  assertExact(bytes, profile.output, `${profile.id} normalized output`);
  const json = readGlbJson(bytes, `${profile.id} normalized output`);
  const primitive = json.meshes?.[0]?.primitives?.[0];
  const indices = json.accessors?.[primitive?.indices];
  const positions = json.accessors?.[primitive?.attributes?.POSITION];
  const node = json.nodes?.[0];
  const required = [
    'EXT_meshopt_compression',
    'EXT_texture_webp',
    'KHR_mesh_quantization'
  ];
  if (
    json.asset?.generator !== 'glTF-Transform v4.4.1'
    || json.scenes?.length !== 1
    || !exactVector(json.scenes[0]?.nodes, [0])
    || json.nodes?.length !== 1
    || node?.name !== profile.nodeName
    || node?.mesh !== 0
    || !exactVector(node.translation, profile.nodeTranslation)
    || !exactVector(node.scale, profile.nodeScale)
    || json.meshes?.length !== 1
    || json.meshes[0]?.primitives?.length !== 1
    || json.materials?.length !== 1
    || json.images?.length !== 2
    || json.materials[0]?.extras?.wk_atlas_size !== profile.textureSize
    || indices?.count / 3 !== profile.triangles
    || indices?.componentType !== profile.indexComponentType
    || positions?.count !== profile.vertices
    || positions?.componentType !== 5_122
    || positions?.normalized !== true
    || !exactVector(positions?.min, profile.positionBounds.min)
    || !exactVector(positions?.max, profile.positionBounds.max)
    || json.extensionsRequired?.length !== required.length
    || required.some((extension) => !json.extensionsRequired.includes(extension))
  ) throw new Error(`${profile.id} normalized structure changed.`);

  const embedded = await inspectEmbeddedWebpGlb(bytes, {
    label: `${profile.id} normalized output`
  });
  embedded.images.forEach((image, index) => {
    const expected = profile.images[index];
    if (
      image.width !== profile.textureSize
      || image.height !== profile.textureSize
      || image.bytes !== expected.bytes
      || image.sha256 !== expected.sha256
    ) throw new Error(`${profile.id} normalized image ${index} changed.`);
  });
}

if (!suppliedRoot) {
  throw new Error(
    'Set WARPKEEP_CASTLE_GAMEREADY_ROOT to the exact authorized GameReady package root.'
  );
}

const manifestBytes = readRegularExactFile(
  suppliedRoot,
  packageManifest.path,
  packageManifest,
  'GameReady package manifest'
);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (
  manifest.asset !== 'Warpkeep Hegemony Castle — Archer/Mage Platforms'
  || manifest.generated !== '2026-07-16'
) throw new Error('GameReady package manifest identity changed.');

const prepared = [];
for (const profile of profiles) {
  const filename = `hegemony-main-castle-${profile.id}.glb`;
  const input = readRegularExactFile(
    suppliedRoot,
    `public/models/hegemony/${filename}`,
    profile.input,
    `${profile.id} GameReady input`
  );
  const output = profile.normalizeMetadata
    ? (await rewriteEmbeddedWebpGlb(input, {
        targetSize: profile.textureSize,
        label: `${profile.id} GameReady metadata normalization`
      })).bytes
    : input;
  await verifyOutput(output, profile);
  prepared.push({ ...profile, filename, preparedBytes: output });
}

installAtomicFileFamily({
  destinationRoot: outputDirectory,
  entries: prepared.map((profile) => ({
    bytes: profile.preparedBytes,
    label: `${profile.id} GameReady castle runtime`,
    relativePath: profile.filename
  }))
});

prepared.forEach((profile) => {
  console.log(
    `${profile.id}: ${profile.output.bytes} bytes, ${profile.triangles} triangles, sha256 ${profile.output.sha256}`
  );
});
