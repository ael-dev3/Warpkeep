import { createHash } from 'node:crypto';

import { inspectEmbeddedWebpGlb } from './rewrite-embedded-webp-glb.mjs';

export const HEGEMONY_SUPPLY_WAGON_RELEASE = Object.freeze({
  repository: 'ael-dev3/Warpkeep-Assets',
  tag: 'hegemony-supply-wagon-3d-2026-07-14',
  attachment: 'hegemony-supply-wagon-3d-sources-v1.zip',
  bytes: 6_068_830,
  sha256: '7abc2ed243286a970c9e2cc1fb589bf4e2c275e94b5ddcb4d51e9a5645e118e5',
  packageRoot: 'hegemony-supply-wagon-3d-sources-v1'
});

export const HEGEMONY_SUPPLY_WAGON_SOURCE = Object.freeze({
  filename: 'Warpkeep_Wagon_NoTelescope_GameReady.glb',
  bytes: 1_637_452,
  sha256: '4a0f762b9dadeaddd8b2d528a7e165eaa98a8dd4134eb924604922524e7bbc5d',
  manifest: Object.freeze({
    filename: 'manifest.json',
    bytes: 11_806,
    sha256: '9bd8fa4ead3636c86f0a7ad16e153da891339adaf394bbd7f30344f9a6d14719'
  }),
  sha256Sums: Object.freeze({
    filename: 'SHA256SUMS.txt',
    bytes: 661,
    sha256: '33500203f737c0ce1dabfdc8eaefa0cfb26be4f936a89997b4d3007af80276d2'
  })
});

export const HEGEMONY_SUPPLY_WAGON_RUNTIME_DIRECTORY = 'public/models/hegemony';

export const HEGEMONY_SUPPLY_WAGON_REQUIRED_EXTENSIONS = Object.freeze([
  'EXT_meshopt_compression',
  'EXT_texture_webp',
  'KHR_mesh_quantization'
]);

const ANIMATIONS = Object.freeze([
  Object.freeze({ name: 'Idle', channels: 15, duration: 2 }),
  Object.freeze({ name: 'Start', channels: 33, duration: 0.8 }),
  Object.freeze({ name: 'Stop', channels: 33, duration: 0.8 }),
  Object.freeze({ name: 'Turn_Left', channels: 36, duration: 1 }),
  Object.freeze({ name: 'Turn_Right', channels: 36, duration: 1 }),
  Object.freeze({ name: 'Walk', channels: 33, duration: 1 })
]);

const COMMON = Object.freeze({
  meshes: 17,
  primitives: 18,
  materials: 2,
  skins: 1,
  joints: 47,
  animations: ANIMATIONS,
  indexComponentType: 5_123,
  imageNames: Object.freeze([
    'WK_Wagon_Normal_2048',
    'WK_Wagon_ORM_1024',
    'WK_Wagon_BaseColor_2048'
  ])
});

export const HEGEMONY_SUPPLY_WAGON_PROFILES = Object.freeze([
  Object.freeze({
    id: 'high',
    filename: 'hegemony-supply-wagon-high-4a0f762b9dadeadd.glb',
    sourceFilename: HEGEMONY_SUPPLY_WAGON_SOURCE.filename,
    bytes: 1_637_452,
    sha256: '4a0f762b9dadeaddd8b2d528a7e165eaa98a8dd4134eb924604922524e7bbc5d',
    generator: 'glTF-Transform v4.4.1',
    nodes: 64,
    triangles: 40_650,
    vertices: 51_726,
    textureSize: 2_048,
    simplify: undefined,
    images: Object.freeze([
      Object.freeze({ width: 2_048, height: 2_048, bytes: 148_628, sha256: '44ddadc0557428595f47caace1f79c262c2ad470b654818897af979d1acfe7d3' }),
      Object.freeze({ width: 1_024, height: 1_024, bytes: 449_726, sha256: '30c6a4fe37a6443daec515414101eb51fcd5ed801168cfd9d6cfb14e906a52f6' }),
      Object.freeze({ width: 2_048, height: 2_048, bytes: 285_816, sha256: 'cf6b47048da00f341c2cd795e1c830ac43b41dbcd86c678bce0029e026593f5f' })
    ]),
    ...COMMON
  }),
  Object.freeze({
    id: 'balanced',
    filename: 'hegemony-supply-wagon-balanced-af0f8788eaaf9a32.glb',
    sourceFilename: HEGEMONY_SUPPLY_WAGON_SOURCE.filename,
    bytes: 752_364,
    sha256: 'af0f8788eaaf9a32e9fd8d17e9ab897a9036d0cc7161a318afa0af3556c6e3b2',
    generator: 'gltfpack 1.2',
    nodes: 81,
    triangles: 27_582,
    vertices: 37_055,
    textureSize: 512,
    simplify: Object.freeze({ ratio: '0.55', error: '0.008' }),
    images: Object.freeze([
      Object.freeze({ width: 512, height: 512, bytes: 73_414, sha256: 'f3842e4c1ccd678a24f24c08c6ff391d93851e877290d39b6795adb8c440a525' }),
      Object.freeze({ width: 512, height: 512, bytes: 125_974, sha256: '15e14f17e22d8c6a045dab5c605c4da5ace7301d23690d90e474628fac0a2a1d' }),
      Object.freeze({ width: 512, height: 512, bytes: 51_202, sha256: '4af664cb863ca312b0a03314320407790b0243b838daa16ceb014de357262a07' })
    ]),
    ...COMMON
  }),
  Object.freeze({
    id: 'compact',
    filename: 'hegemony-supply-wagon-compact-fefb5105b95d43b4.glb',
    sourceFilename: HEGEMONY_SUPPLY_WAGON_SOURCE.filename,
    bytes: 452_676,
    sha256: 'fefb5105b95d43b411571000e8ae3fd78460eaa5f490eaeb63f90e5d84aba6ca',
    generator: 'gltfpack 1.2',
    nodes: 81,
    triangles: 16_954,
    vertices: 26_507,
    textureSize: 256,
    simplify: Object.freeze({ ratio: '0.25', error: '0.014' }),
    images: Object.freeze([
      Object.freeze({ width: 256, height: 256, bytes: 14_314, sha256: 'ffde7d3bd449bab5b5c738464f217863c44e5770a575d71b46728d3fe00a8554' }),
      Object.freeze({ width: 256, height: 256, bytes: 39_216, sha256: 'fef9456357530a7277ebfa6277b2baf5b7b107a696ec1734c1e8bab858377d6b' }),
      Object.freeze({ width: 256, height: 256, bytes: 16_430, sha256: '1ca3e5fad4e62d2b23878223c75caad0094e2bce374f07cf6a95991fa372e52d' })
    ]),
    ...COMMON
  })
]);

const REQUIRED_EXTENSION_SET = new Set(HEGEMONY_SUPPLY_WAGON_REQUIRED_EXTENSIONS);

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

export function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactArray(actual, expected) {
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
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  if (bytes.readUInt32LE(16) !== 0x4e4f534a || jsonEnd > bytes.byteLength) {
    fail(label, 'has an invalid GLB JSON chunk.');
  }
  try {
    return JSON.parse(bytes.subarray(jsonStart, jsonEnd).toString('utf8').trim());
  } catch {
    fail(label, 'has invalid GLB JSON.');
  }
}

function animationDuration(json, animation) {
  const values = (animation.samplers ?? []).map((sampler) => {
    const maximum = json.accessors?.[sampler?.input]?.max?.[0];
    return Number.isFinite(maximum) ? maximum : Number.NaN;
  });
  return values.length === 0 ? Number.NaN : Math.max(...values);
}

function assertRuntimeShape(json, profile, label) {
  const primitives = (json.meshes ?? []).flatMap((mesh) => mesh?.primitives ?? []);
  const triangles = primitives.reduce((total, primitive) => (
    total + (json.accessors?.[primitive?.indices]?.count ?? Number.NaN) / 3
  ), 0);
  const vertices = primitives.reduce((total, primitive) => (
    total + (json.accessors?.[primitive?.attributes?.POSITION]?.count ?? Number.NaN)
  ), 0);
  const extensions = json.extensionsRequired ?? [];
  const animations = json.animations ?? [];
  const hasExternalUris = [
    ...(json.buffers ?? []),
    ...(json.images ?? [])
  ].some((entry) => typeof entry?.uri === 'string');
  const invalidImages = (json.images ?? []).some((image) => (
    image?.mimeType !== 'image/webp' || !Number.isSafeInteger(image?.bufferView)
  ));
  const invalidAnimation = animations.some((animation, index) => {
    const expected = profile.animations[index];
    return animation?.name !== expected?.name
      || animation?.channels?.length !== expected.channels
      || Math.abs(animationDuration(json, animation) - expected.duration) > 0.000_002;
  });
  const indexTypes = new Set(primitives.map((primitive) => (
    json.accessors?.[primitive?.indices]?.componentType
  )));

  if (
    json.asset?.version !== '2.0'
    || json.asset?.generator !== profile.generator
    || json.scenes?.length !== 1
    || json.nodes?.length !== profile.nodes
    || json.meshes?.length !== profile.meshes
    || primitives.length !== profile.primitives
    || json.materials?.length !== profile.materials
    || json.images?.length !== profile.images.length
    || json.skins?.length !== profile.skins
    || json.skins?.[0]?.joints?.length !== profile.joints
    || animations.length !== profile.animations.length
    || invalidAnimation
    || triangles !== profile.triangles
    || vertices !== profile.vertices
    || indexTypes.size !== 1
    || !indexTypes.has(profile.indexComponentType)
    || extensions.length !== REQUIRED_EXTENSION_SET.size
    || extensions.some((extension) => !REQUIRED_EXTENSION_SET.has(extension))
    || hasExternalUris
    || invalidImages
    || json.cameras?.length > 0
  ) fail(label, 'does not satisfy the reviewed animated-runtime structure.');
}

export async function verifyHegemonySupplyWagonBytes(bytes, profile, label) {
  if (bytes.byteLength !== profile.bytes || sha256(bytes) !== profile.sha256) {
    fail(label, 'does not match its exact approved bytes.');
  }
  const json = readGlbJson(bytes, label);
  assertRuntimeShape(json, profile, label);
  const embedded = await inspectEmbeddedWebpGlb(bytes, { label });
  if (embedded.images.length !== profile.images.length) {
    fail(label, 'embedded WebP image count changed.');
  }
  embedded.images.forEach((image, index) => {
    const expected = profile.images[index];
    if (
      image.name !== profile.imageNames[index]
      || image.width !== expected.width
      || image.height !== expected.height
      || image.bytes !== expected.bytes
      || image.sha256 !== expected.sha256
    ) fail(label, `embedded WebP ${index} changed.`);
  });
}

export function assertHegemonySupplyWagonSourceManifest(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_SUPPLY_WAGON_SOURCE.manifest.bytes
    || sha256(bytes) !== HEGEMONY_SUPPLY_WAGON_SOURCE.manifest.sha256
  ) fail(label, 'does not match the exact release manifest.');
  let manifest;
  try {
    manifest = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
  const aliases = manifest?.contentAliases;
  const sourceFile = manifest?.files?.find((entry) => (
    entry?.name === HEGEMONY_SUPPLY_WAGON_SOURCE.filename
  ));
  if (
    manifest?.schemaVersion !== 1
    || manifest?.set?.name !== 'Hegemony supply wagon 3D source set'
    || manifest?.set?.tag !== HEGEMONY_SUPPLY_WAGON_RELEASE.tag
    || manifest?.set?.status !== 'supplemental 3D source/runtime-reference set; not integrated into Warpkeep runtime by this archive deposit'
    || aliases?.bytes !== HEGEMONY_SUPPLY_WAGON_SOURCE.bytes
    || aliases?.sha256 !== HEGEMONY_SUPPLY_WAGON_SOURCE.sha256
    || sourceFile?.role !== 'byte-exact no-telescope game-ready runtime-reference GLB'
    || sourceFile?.bytes !== HEGEMONY_SUPPLY_WAGON_SOURCE.bytes
    || sourceFile?.sha256 !== HEGEMONY_SUPPLY_WAGON_SOURCE.sha256
    || sourceFile?.variant !== 'no-telescope'
    || sourceFile?.gltf?.triangles !== HEGEMONY_SUPPLY_WAGON_PROFILES[0].triangles
    || sourceFile?.gltf?.uploadVertices !== HEGEMONY_SUPPLY_WAGON_PROFILES[0].vertices
    || !exactArray(aliases?.filenames, [
      HEGEMONY_SUPPLY_WAGON_SOURCE.filename,
      'Warpkeep_Hegemony_Draft_Wagon_Optimized_High_Polished_NoTelescope.glb'
    ])
  ) fail(label, 'identity or supplied no-telescope alias contract changed.');
}

export function assertHegemonySupplyWagonSha256Sums(bytes, label) {
  if (
    bytes.byteLength !== HEGEMONY_SUPPLY_WAGON_SOURCE.sha256Sums.bytes
    || sha256(bytes) !== HEGEMONY_SUPPLY_WAGON_SOURCE.sha256Sums.sha256
  ) fail(label, 'does not match the exact release checksum list.');
  const text = bytes.toString('utf8');
  if (
    !text.includes(`${HEGEMONY_SUPPLY_WAGON_SOURCE.sha256}  ${HEGEMONY_SUPPLY_WAGON_SOURCE.filename}\n`)
    || !text.includes(`${HEGEMONY_SUPPLY_WAGON_SOURCE.sha256}  Warpkeep_Hegemony_Draft_Wagon_Optimized_High_Polished_NoTelescope.glb\n`)
  ) fail(label, 'does not attest the selected no-telescope source bytes.');
}
