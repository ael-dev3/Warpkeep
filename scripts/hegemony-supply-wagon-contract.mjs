import { createHash } from 'node:crypto';

import { MeshoptDecoder } from 'meshoptimizer';

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

export const HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES = Object.freeze([
  'WK_UnitRoot',
  'H_Root',
  'H_Pelvis',
  'H_Spine_01',
  'H_Spine_02',
  'H_Chest',
  'H_Neck_01',
  'H_Neck_02',
  'H_Head',
  'A_Rein_L_Head',
  'A_Rein_R_Head',
  'H_Ear_L',
  'H_Ear_R',
  'H_Scapula_L',
  'H_UpperArm_L',
  'H_Forearm_L',
  'H_CannonF_L',
  'H_ToeF_L',
  'H_HoofF_L',
  'H_Scapula_R',
  'H_UpperArm_R',
  'H_Forearm_R',
  'H_CannonF_R',
  'H_ToeF_R',
  'H_HoofF_R',
  'H_Tail_01',
  'H_Tail_02',
  'H_Tail_03',
  'H_Thigh_L',
  'H_Shin_L',
  'H_Hock_L',
  'H_CannonH_L',
  'H_HoofH_L',
  'H_Thigh_R',
  'H_Shin_R',
  'H_Hock_R',
  'H_CannonH_R',
  'H_HoofH_R',
  'W_Root',
  'A_Rein_L_Wagon',
  'A_Rein_R_Wagon',
  'W_Banner_01',
  'W_Banner_02',
  'W_Cargo',
  'W_Shafts',
  'W_Wheel_L',
  'W_Wheel_R'
]);

const GAIT_ROTATION_TARGETS = Object.freeze([
  'H_CannonF_L',
  'H_CannonF_R',
  'H_CannonH_L',
  'H_CannonH_R',
  'H_Chest',
  'H_Forearm_L',
  'H_Forearm_R',
  'H_Head',
  'H_Hock_L',
  'H_Hock_R',
  'H_HoofF_L',
  'H_HoofF_R',
  'H_HoofH_L',
  'H_HoofH_R',
  'H_Neck_01',
  'H_Neck_02',
  'H_Pelvis',
  'H_Scapula_L',
  'H_Scapula_R',
  'H_Shin_L',
  'H_Shin_R',
  'H_Spine_01',
  'H_Spine_02',
  'H_Tail_01',
  'H_Tail_02',
  'H_Tail_03',
  'H_Thigh_L',
  'H_Thigh_R',
  'H_ToeF_L',
  'H_ToeF_R',
  'H_UpperArm_L',
  'H_UpperArm_R'
]);

function rotationTracks(names) {
  return names.map((name) => `${name}.rotation`);
}

const HEGEMONY_SUPPLY_WAGON_TRACK_FAMILIES = Object.freeze({
  idle: Object.freeze([
    ...rotationTracks([
      'H_Chest',
      'H_Ear_L',
      'H_Ear_R',
      'H_Head',
      'H_Neck_01',
      'H_Neck_02',
      'H_Pelvis'
    ]),
    'H_Root.translation',
    ...rotationTracks([
      'H_Spine_01',
      'H_Spine_02',
      'H_Tail_01',
      'H_Tail_02',
      'H_Tail_03',
      'W_Banner_01',
      'W_Banner_02'
    ])
  ].sort()),
  gait: Object.freeze([
    ...rotationTracks(GAIT_ROTATION_TARGETS),
    'H_Root.translation'
  ].sort()),
  turn: Object.freeze([
    ...rotationTracks(GAIT_ROTATION_TARGETS),
    'H_Root.translation',
    ...rotationTracks(['W_Banner_01', 'W_Banner_02', 'W_Shafts'])
  ].sort())
});

const HEGEMONY_SUPPLY_WAGON_TRACK_FAMILY_AUDIT = Object.freeze(
  Object.fromEntries(Object.entries(HEGEMONY_SUPPLY_WAGON_TRACK_FAMILIES).map((
    [family, trackNames]
  ) => [
    family,
    Object.freeze({
      trackNames,
      affectedNodes: Object.freeze(trackNames.map((track) => (
        track.slice(0, track.lastIndexOf('.'))
      )))
    })
  ]))
);

const CLIP_TRACK_FAMILY = Object.freeze({
  Idle: 'idle',
  Start: 'gait',
  Stop: 'gait',
  Turn_Left: 'turn',
  Turn_Right: 'turn',
  Walk: 'gait'
});

const H_ROOT_VERTICAL_BOB_RANGES = Object.freeze({
  Idle: Object.freeze([0.759765625, 0.76416015625]),
  Start: Object.freeze([0.759765625, 0.77197265625]),
  Stop: Object.freeze([0.759765625, 0.77197265625]),
  Turn_Left: Object.freeze([0.759765625, 0.7685546875]),
  Turn_Right: Object.freeze([0.759765625, 0.7685546875]),
  Walk: Object.freeze([0.759765625, 0.77392578125])
});

/**
 * Reviewed asset-space facts used by development verification and by the
 * renderer's distance-driven wheel calibration. The prepared radius is before
 * the worker root applies its quality/style and hex-size scale.
 */
export const HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS = Object.freeze({
  nodeNames: Object.freeze(['W_Wheel_L', 'W_Wheel_R']),
  renderNodeNames: Object.freeze(['RET_HI_Wheel_L', 'RET_HI_Wheel_R']),
  axleNodeNames: Object.freeze(['RET_HI_Axle']),
  suspensionNodeNames: Object.freeze([]),
  localAxleAxis: '+Y',
  authoredWorldAxleAxis: '+X',
  authoredRadiusMeters: 0.6993783339858055,
  authoredFootprintMeters: 3.83296752,
  preparedFootprint: 0.64,
  preparedRadius: 0.11677691799248942
});

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

function readGlb(bytes, label) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.byteLength < 28
    || bytes.subarray(0, 4).toString('ascii') !== 'glTF'
    || bytes.readUInt32LE(4) !== 2
    || bytes.readUInt32LE(8) !== bytes.byteLength
  ) fail(label, 'is not an intact glTF 2.0 binary.');
  const jsonLength = bytes.readUInt32LE(12);
  const jsonStart = 20;
  const jsonEnd = jsonStart + jsonLength;
  const binaryHeaderEnd = jsonEnd + 8;
  if (
    bytes.readUInt32LE(16) !== 0x4e4f534a
    || binaryHeaderEnd > bytes.byteLength
    || bytes.readUInt32LE(jsonEnd + 4) !== 0x004e4942
  ) {
    fail(label, 'has an invalid GLB JSON chunk.');
  }
  const binaryLength = bytes.readUInt32LE(jsonEnd);
  const binaryStart = binaryHeaderEnd;
  const binaryEnd = binaryStart + binaryLength;
  if (binaryEnd !== bytes.byteLength) fail(label, 'has an invalid GLB binary chunk.');
  let json;
  try {
    json = JSON.parse(bytes.subarray(jsonStart, jsonEnd).toString('utf8').trim());
  } catch {
    fail(label, 'has invalid GLB JSON.');
  }
  const physicalLength = json?.buffers?.[0]?.byteLength;
  if (
    !Number.isSafeInteger(physicalLength)
    || physicalLength <= 0
    || physicalLength > binaryLength
    || binaryLength - physicalLength > 3
  ) fail(label, 'does not declare its physical GLB buffer exactly.');
  return Object.freeze({
    json,
    binary: bytes.subarray(binaryStart, binaryStart + physicalLength)
  });
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

function namedNodeMap(json, label) {
  const named = new Map();
  for (const node of json.nodes ?? []) {
    if (typeof node?.name !== 'string' || node.name.length === 0) continue;
    if (named.has(node.name)) fail(label, `node name ${node.name} is not unique.`);
    named.set(node.name, node);
  }
  return named;
}

function parentNameMap(json) {
  const parents = new Map();
  for (const parent of json.nodes ?? []) {
    for (const childIndex of parent?.children ?? []) {
      const childName = json.nodes?.[childIndex]?.name;
      if (typeof childName === 'string' && typeof parent?.name === 'string') {
        parents.set(childName, parent.name);
      }
    }
  }
  return parents;
}

function approximately(actual, expected, tolerance = 0.000_001) {
  return Number.isFinite(actual) && Math.abs(actual - expected) <= tolerance;
}

function approximateArray(actual, expected, tolerance = 0.000_001) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((value, index) => approximately(value, expected[index], tolerance));
}

function multiplyQuaternion(left, right) {
  const [lx, ly, lz, lw] = left;
  const [rx, ry, rz, rw] = right;
  return [
    lw * rx + lx * rw + ly * rz - lz * ry,
    lw * ry - lx * rz + ly * rw + lz * rx,
    lw * rz + lx * ry - ly * rx + lz * rw,
    lw * rw - lx * rx - ly * ry - lz * rz
  ];
}

function rotateVector(quaternion, vector) {
  const [x, y, z, w] = quaternion;
  const [vx, vy, vz] = vector;
  const tx = 2 * (y * vz - z * vy);
  const ty = 2 * (z * vx - x * vz);
  const tz = 2 * (x * vy - y * vx);
  return [
    vx + w * tx + (y * tz - z * ty),
    vy + w * ty + (z * tx - x * tz),
    vz + w * tz + (x * ty - y * tx)
  ];
}

async function decodeLogicalBufferView(parsed, viewIndex, label) {
  const view = parsed.json.bufferViews?.[viewIndex];
  if (!view) fail(label, `bufferView ${String(viewIndex)} is missing.`);
  const meshopt = view.extensions?.EXT_meshopt_compression;
  if (!meshopt) {
    if (view.buffer !== 0) fail(label, `bufferView ${viewIndex} is not physically readable.`);
    const offset = view.byteOffset ?? 0;
    if (
      !Number.isSafeInteger(offset)
      || !Number.isSafeInteger(view.byteLength)
      || offset < 0
      || view.byteLength <= 0
      || offset + view.byteLength > parsed.binary.byteLength
    ) fail(label, `bufferView ${viewIndex} exceeds the physical GLB buffer.`);
    return parsed.binary.subarray(offset, offset + view.byteLength);
  }
  if (
    meshopt.buffer !== 0
    || !Number.isSafeInteger(meshopt.byteOffset ?? 0)
    || !Number.isSafeInteger(meshopt.byteLength)
    || !Number.isSafeInteger(meshopt.byteStride)
    || !Number.isSafeInteger(meshopt.count)
    || meshopt.byteLength <= 0
    || meshopt.byteStride <= 0
    || meshopt.count <= 0
    || (meshopt.byteOffset ?? 0) + meshopt.byteLength > parsed.binary.byteLength
  ) fail(label, `bufferView ${viewIndex} has an invalid meshopt payload.`);
  await MeshoptDecoder.ready;
  const decoded = new Uint8Array(meshopt.count * meshopt.byteStride);
  const sourceOffset = meshopt.byteOffset ?? 0;
  try {
    MeshoptDecoder.decodeGltfBuffer(
      decoded,
      meshopt.count,
      meshopt.byteStride,
      parsed.binary.subarray(sourceOffset, sourceOffset + meshopt.byteLength),
      meshopt.mode,
      meshopt.filter ?? 'NONE'
    );
  } catch {
    fail(label, `bufferView ${viewIndex} cannot be decoded deterministically.`);
  }
  if (decoded.byteLength !== view.byteLength) {
    fail(label, `bufferView ${viewIndex} decoded length changed.`);
  }
  return decoded;
}

async function readFloatVec3Accessor(parsed, accessorIndex, label) {
  const accessor = parsed.json.accessors?.[accessorIndex];
  if (
    !accessor
    || accessor.type !== 'VEC3'
    || accessor.componentType !== 5_126
    || !Number.isSafeInteger(accessor.count)
    || accessor.count <= 0
    || accessor.normalized === true
    || accessor.sparse !== undefined
    || !Number.isSafeInteger(accessor.bufferView)
  ) fail(label, `accessor ${String(accessorIndex)} is not a reviewed float VEC3.`);
  const bytes = await decodeLogicalBufferView(parsed, accessor.bufferView, label);
  const view = parsed.json.bufferViews[accessor.bufferView];
  const stride = view.byteStride
    ?? view.extensions?.EXT_meshopt_compression?.byteStride
    ?? 12;
  const offset = accessor.byteOffset ?? 0;
  if (
    !Number.isSafeInteger(offset)
    || offset < 0
    || stride < 12
    || offset + (accessor.count - 1) * stride + 12 > bytes.byteLength
  ) fail(label, `accessor ${accessorIndex} exceeds its decoded bufferView.`);
  const values = [];
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < accessor.count; index += 1) {
    const valueOffset = offset + index * stride;
    const value = Object.freeze([
      data.getFloat32(valueOffset, true),
      data.getFloat32(valueOffset + 4, true),
      data.getFloat32(valueOffset + 8, true)
    ]);
    if (value.some((component) => !Number.isFinite(component))) {
      fail(label, `accessor ${accessorIndex} contains a non-finite value.`);
    }
    values.push(value);
  }
  return Object.freeze(values);
}

function componentRange(values, component) {
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    minimum = Math.min(minimum, value[component]);
    maximum = Math.max(maximum, value[component]);
  }
  return Object.freeze([minimum, maximum]);
}

async function assertSemanticRuntimeShape(parsed, profile, label) {
  const { json } = parsed;
  const named = namedNodeMap(json, label);
  const parents = parentNameMap(json);
  const jointNames = (json.skins?.[0]?.joints ?? []).map((nodeIndex) => (
    json.nodes?.[nodeIndex]?.name
  ));
  if (
    json.skins?.[0]?.name !== 'RIG_WK_Hegemony_Draft_Wagon_47J'
    || !exactArray(jointNames, HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES)
    || parents.get('H_Root') !== 'WK_UnitRoot'
    || parents.get('W_Root') !== 'WK_UnitRoot'
  ) fail(label, 'does not preserve the reviewed named 47-joint rig.');

  const unitRoot = named.get('WK_UnitRoot');
  const wagonRoot = named.get('W_Root');
  if (
    !unitRoot
    || !wagonRoot
    || !approximateArray(unitRoot.rotation, [0, 0.70710677, 0.70710677, 0])
    || !approximateArray(
      wagonRoot.rotation,
      [0.000000053385, -0.70710677, -0.70710677, 0.000000053385]
    )
  ) fail(label, 'does not preserve the reviewed coordinate-space roots.');

  const wheelRestRotation = [-0.49999994, -0.5, -0.500000119, 0.5];
  for (const wheelName of HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.nodeNames) {
    const wheel = named.get(wheelName);
    if (
      !wheel
      || parents.get(wheelName) !== 'W_Root'
      || !approximateArray(wheel.rotation, wheelRestRotation)
    ) fail(label, `${wheelName} does not preserve its reviewed semantic axle.`);
    const worldRotation = multiplyQuaternion(
      multiplyQuaternion(unitRoot.rotation, wagonRoot.rotation),
      wheel.rotation
    );
    const worldAxle = rotateVector(worldRotation, [0, 1, 0]);
    if (
      !approximately(Math.abs(worldAxle[0]), 1)
      || !approximately(worldAxle[1], 0)
      || !approximately(worldAxle[2], 0)
    ) fail(label, `${wheelName} local +Y no longer resolves to the authored axle.`);
  }
  for (const nodeName of [
    ...HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.renderNodeNames,
    ...HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.axleNodeNames
  ]) {
    if (!named.has(nodeName)) fail(label, `reviewed semantic node ${nodeName} is missing.`);
  }
  const suspensionNames = [...named.keys()]
    .filter((name) => /suspension/iu.test(name))
    .sort();
  if (!exactArray(suspensionNames, HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.suspensionNodeNames)) {
    fail(label, 'unexpected suspension semantics were introduced.');
  }

  const horseVerticalAxis = rotateVector(unitRoot.rotation, [0, 0, 1]);
  if (
    !approximately(horseVerticalAxis[0], 0)
    || !approximately(horseVerticalAxis[1], 1)
    || !approximately(horseVerticalAxis[2], 0)
  ) fail(label, 'H_Root local +Z no longer resolves to glTF +Y vertical.');

  const clips = [];
  for (const expected of profile.animations) {
    const animation = (json.animations ?? []).find(({ name }) => name === expected.name);
    if (!animation) fail(label, `reviewed clip ${expected.name} is missing.`);
    const trackNames = animation.channels.map((channel) => {
      const nodeName = json.nodes?.[channel?.target?.node]?.name;
      const path = channel?.target?.path;
      if (typeof nodeName !== 'string' || typeof path !== 'string') {
        fail(label, `${expected.name} contains an unnamed animation target.`);
      }
      return `${nodeName}.${path}`;
    }).sort();
    const familyName = CLIP_TRACK_FAMILY[expected.name];
    const expectedTracks = HEGEMONY_SUPPLY_WAGON_TRACK_FAMILIES[familyName];
    if (!familyName || !exactArray(trackNames, expectedTracks)) {
      fail(label, `${expected.name} target family changed.`);
    }
    if (new Set(trackNames).size !== trackNames.length) {
      fail(label, `${expected.name} contains duplicate animation targets.`);
    }
    const wheelTracks = trackNames.filter((track) => (
      HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS.nodeNames.some((name) => (
        track.startsWith(`${name}.`)
      ))
    ));
    const routeRootTracks = trackNames.filter((track) => (
      track.startsWith('WK_UnitRoot.') || track.startsWith('W_Root.')
    ));
    const rootTranslationTracks = trackNames.filter((track) => (
      track === 'H_Root.translation'
      || track === 'WK_UnitRoot.translation'
      || track === 'W_Root.translation'
    ));
    const rootRotationTracks = trackNames.filter((track) => (
      track === 'H_Root.rotation'
      || track === 'WK_UnitRoot.rotation'
      || track === 'W_Root.rotation'
    ));
    if (
      wheelTracks.length !== 0
      || routeRootTracks.length !== 0
      || !exactArray(rootTranslationTracks, ['H_Root.translation'])
      || rootRotationTracks.length !== 0
    ) fail(label, `${expected.name} has conflicting root or wheel animation.`);

    const hRootChannel = animation.channels.find((channel) => (
      json.nodes?.[channel?.target?.node]?.name === 'H_Root'
      && channel?.target?.path === 'translation'
    ));
    const sampler = animation.samplers?.[hRootChannel?.sampler];
    if (
      !sampler
      || (sampler.interpolation !== undefined && sampler.interpolation !== 'LINEAR')
    ) {
      fail(label, `${expected.name} H_Root bob is not a reviewed linear track.`);
    }
    const values = await readFloatVec3Accessor(parsed, sampler.output, label);
    const xRange = componentRange(values, 0);
    const yRange = componentRange(values, 1);
    const zRange = componentRange(values, 2);
    if (
      !approximateArray(xRange, [0, 0], 0.000_000_001)
      || !approximateArray(yRange, [0.47998046875, 0.47998046875], 0.000_000_001)
      || !approximateArray(zRange, H_ROOT_VERTICAL_BOB_RANGES[expected.name], 0.000_000_001)
    ) fail(label, `${expected.name} H_Root track is not the reviewed vertical horse bob.`);

    clips.push(Object.freeze({
      name: expected.name,
      duration: expected.duration,
      trackFamily: familyName,
      hasRootTranslation: true,
      hasRootRotation: false,
      routeConflictingRootMotion: false,
      wheelNodesAnimated: false,
      usable: true,
      hRootVerticalBobLocalZ: zRange
    }));
  }

  return Object.freeze({
    profile: profile.id,
    generator: profile.generator,
    coordinateSystem: Object.freeze({ up: '+Y', forward: '+Z' }),
    skinName: json.skins[0].name,
    jointNames: HEGEMONY_SUPPLY_WAGON_RIG_JOINT_NAMES,
    wheelSemantics: HEGEMONY_SUPPLY_WAGON_WHEEL_SEMANTICS,
    trackFamilies: HEGEMONY_SUPPLY_WAGON_TRACK_FAMILY_AUDIT,
    clips: Object.freeze(clips),
    routeRootTranslationTracks: Object.freeze([]),
    routeRootRotationTracks: Object.freeze([]),
    compatibleRigAndClipContract: true
  });
}

async function inspectVerifiedHegemonySupplyWagonBytes(bytes, profile, label) {
  if (bytes.byteLength !== profile.bytes || sha256(bytes) !== profile.sha256) {
    fail(label, 'does not match its exact approved bytes.');
  }
  const parsed = readGlb(bytes, label);
  assertRuntimeShape(parsed.json, profile, label);
  const audit = await assertSemanticRuntimeShape(parsed, profile, label);
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
  return audit;
}

export async function verifyHegemonySupplyWagonBytes(bytes, profile, label) {
  await inspectVerifiedHegemonySupplyWagonBytes(bytes, profile, label);
}

export function auditHegemonySupplyWagonBytes(bytes, profile, label) {
  return inspectVerifiedHegemonySupplyWagonBytes(bytes, profile, label);
}

export function aggregateHegemonySupplyWagonAudits(audits, label = 'Supply Wagon semantic audit') {
  if (
    !Array.isArray(audits)
    || audits.length !== HEGEMONY_SUPPLY_WAGON_PROFILES.length
    || !exactArray(
      audits.map((audit) => audit?.profile),
      HEGEMONY_SUPPLY_WAGON_PROFILES.map((profile) => profile.id)
    )
  ) fail(label, 'does not contain the exact High, Balanced, and Compact audit sequence.');
  const comparable = ({ profile: _profile, generator: _generator, ...semantic }) => semantic;
  const reference = JSON.stringify(comparable(audits[0]));
  if (audits.slice(1).some((audit) => JSON.stringify(comparable(audit)) !== reference)) {
    fail(label, 'High, Balanced, and Compact no longer share one rig and clip contract.');
  }
  const semantic = comparable(audits[0]);
  return Object.freeze({
    profiles: Object.freeze(audits.map(({ profile, generator }) => (
      Object.freeze({ profile, generator })
    ))),
    ...semantic,
    compatibleRigAndClipContract: true
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
