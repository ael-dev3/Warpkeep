import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const INNER_KEEP_RABBIT_SELECTION_RECORD =
  'docs/reference/assets/2026-07-30-lowlands-rabbit/manifest.json';
export const INNER_KEEP_RABBIT_SELECTION_DIGEST =
  '58cab83f4c4e1773012d2b099da5b05ab3fa857d6e8395710e60cd4db337b958';
export const INNER_KEEP_RABBIT_RUNTIME_DIRECTORY =
  'public/models/hegemony/inner-keep/wildlife/rabbit';

const ROOT = resolve(import.meta.dirname, '..');
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const EXPECTED_AUTHORIZATION_INSTRUCTION =
  'looks cool so far, make sure there is lots of topography, water, trees, animals, people, rss nodes outside inner keep so it feels well done and alive like a leaving and breathing world';
const EXPECTED_INTEGRATION_DECISION =
  'Use the exact official Warpkeep-Assets Lowlands Rabbit runtime family for the requested animals outside the Inner Keep.';
const EXPECTED_AUTHORIZATION_SCOPE =
  'Runtime use in the public ael-dev3/Warpkeep repository and official warpkeep.com client is authorized for the exact selected files. This does not relicense the source archive, authorize unrelated reuse, give decorative wildlife gameplay authority, approve activation, approve merge, or approve deployment.';
const EXPECTED_CLIPS = Object.freeze(['Alert', 'Idle', 'Nibble', 'Walk']);
const EXPECTED_MODELS = Object.freeze({
  high: Object.freeze({
    tier: 'LOD0_High',
    mode: 'animated',
    bytes: 129_388,
    sha256: '735f7d72457acfb20581cfcacbd8908eab3ef36d5640b63ecb134bbaa7a10b1d',
    triangles: 726,
    uploadedVertices: 1_640,
  }),
  balanced: Object.freeze({
    tier: 'LOD1_Balanced',
    mode: 'animated',
    bytes: 86_340,
    sha256: 'daeb493a827ecbd605c6ad25d83b84050e6a0ad29e96619c9d86c57c37be1f6a',
    triangles: 350,
    uploadedVertices: 856,
  }),
  compact: Object.freeze({
    tier: 'LOD2_Compact',
    mode: 'static',
    bytes: 14_808,
    sha256: '2ecc7b1adf4c1d79b7ca2d5ea9a6727ed3f6d9072047466082bb912d34ea930c',
    triangles: 146,
    uploadedVertices: 384,
  }),
});
const EXPECTED_OUTER_ENTRIES = Object.freeze([
  Object.freeze({
    path: 'rabbit-runtime-ui-bundle-2026-07-30-v1/README.md',
    bytes: 2_126,
    sha256: '3d6909181d31011dbb0b09935dee07d2e7d36147123ec30371f8b293c31643dd',
  }),
  Object.freeze({
    path: 'rabbit-runtime-ui-bundle-2026-07-30-v1/Warpkeep_Rabbit_Runtime_UI_Bundle_2026-07-30.zip',
    bytes: 2_710_713,
    sha256: '1ab9a02a39e68a3ddadcec4ac1824aafaf252f9cb068511e6341d2377f256dc3',
  }),
  Object.freeze({
    path: 'rabbit-runtime-ui-bundle-2026-07-30-v1/manifest.json',
    bytes: 3_745,
    sha256: '2174b34ee5f0d025dc0a46e35cb981ce6074a500d7cdbe6f153753155f5b6772',
  }),
  Object.freeze({
    path: 'rabbit-runtime-ui-bundle-2026-07-30-v1/SHA256SUMS.txt',
    bytes: 195,
    sha256: 'a3d5f92a30549a12c50dba3e6ba81474e2bc46dddff5a78d8ab3062a06a3d387',
  }),
]);

export const INNER_KEEP_RABBIT_NESTED_MEMBERS = Object.freeze([
  'Warpkeep_Rabbit_Runtime_UI_Bundle/',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Warpkeep_Rabbit_UI_Transparent_2048.png',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/Warpkeep_Rabbit_LOD1_Balanced_Rigged_Runtime.glb',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/Warpkeep_Rabbit_LOD2_Compact_Static_Runtime.glb',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/Warpkeep_Rabbit_LOD0_High_Rigged_Runtime.glb',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/runtime-manifest.json',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/README.md',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/bundle-manifest.json',
  'Warpkeep_Rabbit_Runtime_UI_Bundle/SHA256SUMS.txt',
]);

function fail(label, detail) {
  throw new Error(`${label}: ${detail}`);
}

function deeplyFreeze(value) {
  if (Array.isArray(value)) value.forEach(deeplyFreeze);
  else if (value && typeof value === 'object') Object.values(value).forEach(deeplyFreeze);
  return Object.freeze(value);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])])
    );
  }
  return value;
}

function exactArray(actual, expected) {
  return Array.isArray(actual)
    && actual.length === expected.length
    && actual.every((entry, index) => entry === expected[index]);
}

function exactFileRecord(actual, expected) {
  return actual?.path === expected.path
    && actual.bytes === expected.bytes
    && actual.sha256 === expected.sha256;
}

function safePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.includes('\0')
    && path === path.normalize('NFC')
    && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

export function innerKeepRabbitSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function calculateInnerKeepRabbitSelectionDigest(record) {
  return innerKeepRabbitSha256(Buffer.from(JSON.stringify(canonicalize({
    selectionId: record?.selectionId,
    source: record?.source,
    runtimePolicy: record?.runtimePolicy,
    models: record?.models,
  })), 'utf8'));
}

export function assertInnerKeepRabbitSelectionRecord(record) {
  const label = 'Inner Keep rabbit selection record';
  const source = record?.source;
  if (
    record?.schema !== 'warpkeep.inner-keep-rabbit-runtime-selection.v1'
    || record.selectionId !== 'inner-keep-lowlands-rabbit-v1'
    || record.recordedAt !== '2026-08-04'
    || record.selectionDigestAlgorithm !== 'sha256-ecmascript-canonical-json-v1'
    || record.selectionDigestSha256 !== INNER_KEEP_RABBIT_SELECTION_DIGEST
    || record.authorization?.archiveDistributionAuthorized !== true
    || record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
    || record.authorization?.recordedAt !== '2026-08-04'
    || record.authorization?.instruction !== EXPECTED_AUTHORIZATION_INSTRUCTION
    || record.authorization?.integrationDecision !== EXPECTED_INTEGRATION_DECISION
    || record.authorization?.scopeBoundary !== EXPECTED_AUTHORIZATION_SCOPE
    || record.licenseBoundary?.sourceStatus
      !== 'public-archive-authorized-no-separate-open-license'
    || record.licenseBoundary?.integrationGrant
      !== 'owner-authorized-official-warpkeep-runtime-use-only'
    || record.licenseBoundary?.redistributionOrRelicensingGranted !== false
    || record.runtimePolicy?.highQualityTier !== 'LOD1_Balanced'
    || record.runtimePolicy?.balancedQualityTier !== 'LOD1_Balanced'
    || record.runtimePolicy?.reducedQualityTier !== 'LOD2_Compact'
    || record.runtimePolicy?.optionalHighDetailTier !== 'LOD0_High'
    || !exactArray(record.runtimePolicy?.animatedClips, EXPECTED_CLIPS)
    || record.runtimePolicy?.ordinaryBuildMayReadArchive !== false
    || record.runtimePolicy?.ordinaryBuildMayUseNetwork !== false
    || record.runtimePolicy?.clientPresentationOnly !== true
    || record.runtimePolicy?.gameplayAuthorityClaimed !== false
    || record.runtimePolicy?.renderMeshCollision !== false
    || source?.repository !== 'ael-dev3/Warpkeep-Assets'
    || source.releaseCommit !== 'd8c35bb01c399ecde711274ef43880d8d304ae44'
    || source.tag !== 'rabbit-runtime-ui-bundle-2026-07-30'
    || source.trustedReleaseManifest?.repositoryPath
      !== 'releases/rabbit-runtime-ui-bundle-2026-07-30/manifest.json'
    || source.trustedReleaseManifest?.bytes !== 3_300
    || source.trustedReleaseManifest?.sha256
      !== 'c1009554053a793da979a8a1aae7558aade09bfbefcc53fcf2dae7a98a80a705'
    || source.attachment?.name !== 'rabbit-runtime-ui-bundle-2026-07-30-v1.zip'
    || source.attachment?.bytes !== 2_717_585
    || source.attachment?.sha256
      !== 'cf40e6c7149635a8cf6439e618e951219770491a7f364e7776b8af128461a3a9'
    || source.attachment?.entries !== 4
    || source.attachment?.packageRoot !== 'rabbit-runtime-ui-bundle-2026-07-30-v1'
    || !Array.isArray(source.outerEntries)
    || source.outerEntries.length !== EXPECTED_OUTER_ENTRIES.length
    || source.outerEntries.some((entry, index) => (
      !exactFileRecord(entry, EXPECTED_OUTER_ENTRIES[index])
    ))
    || source.nestedPackage?.path !== EXPECTED_OUTER_ENTRIES[1].path
    || source.nestedPackage?.bytes !== EXPECTED_OUTER_ENTRIES[1].bytes
    || source.nestedPackage?.sha256 !== EXPECTED_OUTER_ENTRIES[1].sha256
    || source.nestedPackage?.entries !== 13
    || source.nestedPackage?.payloadEntries !== 8
    || source.nestedPackage?.packageRoot !== 'Warpkeep_Rabbit_Runtime_UI_Bundle'
    || source.nestedPackage?.privacySanitized !== true
    || source.nestedPackage?.decodedPixelsPreserved !== true
    || source.runtimeManifest?.path
      !== 'Warpkeep_Rabbit_Runtime_UI_Bundle/Runtime/Environment/Wildlife/Rabbit/runtime-manifest.json'
    || source.runtimeManifest?.bytes !== 5_453
    || source.runtimeManifest?.sha256
      !== '89e8ed79f1672a98d5bb6cab6c0741f66ba97ca63a7e25758f052375afb3e005'
    || source.bundleManifest?.path
      !== 'Warpkeep_Rabbit_Runtime_UI_Bundle/bundle-manifest.json'
    || source.bundleManifest?.bytes !== 2_161
    || source.bundleManifest?.sha256
      !== '35a98b5a81a824634030635da9a57494a47543cf414d760d0884e560255fcd87'
    || source.excludedUiImage?.path
      !== 'Warpkeep_Rabbit_Runtime_UI_Bundle/Warpkeep_Rabbit_UI_Transparent_2048.png'
    || source.excludedUiImage?.bytes !== 2_468_019
    || source.excludedUiImage?.sha256
      !== '572e67902dd6db561bcce494ac5049463baf939494f74af3a0b1f2459f3b2c3e'
    || !Array.isArray(record.models)
    || record.models.length !== 3
  ) fail(label, 'source, authorization, license, or runtime policy changed.');

  const profiles = ['high', 'balanced', 'compact'];
  const destinations = new Set();
  record.models.forEach((model, index) => {
    const profile = profiles[index];
    const expected = EXPECTED_MODELS[profile];
    const expectedAnimations = expected.mode === 'animated' ? EXPECTED_CLIPS : [];
    if (
      model?.profile !== profile
      || model.tier !== expected.tier
      || model.mode !== expected.mode
      || model.bytes !== expected.bytes
      || model.sha256 !== expected.sha256
      || model.triangles !== expected.triangles
      || model.uploadedVertices !== expected.uploadedVertices
      || model.drawCalls !== 1
      || !exactArray(model.animations, expectedAnimations)
      || !safePath(model.sourcePath)
      || dirname(model.sourcePath) !== dirname(source.runtimeManifest.path)
      || model.destinationPath !== `${INNER_KEEP_RABBIT_RUNTIME_DIRECTORY}/`
        + `inner-keep-lowlands-rabbit-${profile}-${expected.sha256.slice(0, 16)}.glb`
      || !safePath(model.destinationPath)
      || destinations.has(model.destinationPath)
      || !Array.isArray(model.boundsMeters)
      || model.boundsMeters.length !== 3
      || model.boundsMeters.some((value) => !(Number.isFinite(value) && value > 0))
    ) fail(label, `${profile} model identity changed.`);
    destinations.add(model.destinationPath);
  });
  if (
    record.counts?.selectedModels !== 3
    || record.counts?.selectedBytes !== 230_536
    || record.counts?.selectedTriangles !== 1_222
    || record.counts?.animatedModels !== 2
    || record.counts?.staticModels !== 1
  ) fail(label, 'selection totals changed.');
  const digest = calculateInnerKeepRabbitSelectionDigest(record);
  if (digest !== INNER_KEEP_RABBIT_SELECTION_DIGEST) {
    fail(label, `selection digest changed to ${digest}.`);
  }
}

function readSelection() {
  const record = JSON.parse(readFileSync(
    resolve(ROOT, INNER_KEEP_RABBIT_SELECTION_RECORD),
    'utf8'
  ));
  assertInnerKeepRabbitSelectionRecord(record);
  return deeplyFreeze(record);
}

export const INNER_KEEP_RABBIT_SELECTION = readSelection();
export const INNER_KEEP_RABBIT_MODELS = INNER_KEEP_RABBIT_SELECTION.models;
export const INNER_KEEP_RABBIT_RUNTIME_PATHS = Object.freeze(
  INNER_KEEP_RABBIT_MODELS.map((model) => model.destinationPath).sort()
);

export function assertInnerKeepRabbitRuntimeUseAuthorized(
  record = INNER_KEEP_RABBIT_SELECTION
) {
  if (
    record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
    || record.licenseBoundary?.sourceStatus
      !== 'public-archive-authorized-no-separate-open-license'
    || record.licenseBoundary?.integrationGrant
      !== 'owner-authorized-official-warpkeep-runtime-use-only'
    || record.licenseBoundary?.redistributionOrRelicensingGranted !== false
    || record.runtimePolicy?.clientPresentationOnly !== true
    || record.runtimePolicy?.gameplayAuthorityClaimed !== false
  ) fail('Inner Keep rabbit runtime installation', 'owner authorization is not recorded.');
}

function exactJson(bytes, expected, label) {
  if (
    !Buffer.isBuffer(bytes)
    || bytes.byteLength !== expected.bytes
    || innerKeepRabbitSha256(bytes) !== expected.sha256
  ) fail(label, 'does not match its exact pinned bytes.');
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    fail(label, 'is not valid JSON.');
  }
}

export function assertTrustedInnerKeepRabbitReleaseManifest(bytes) {
  const source = INNER_KEEP_RABBIT_SELECTION.source;
  const manifest = exactJson(bytes, source.trustedReleaseManifest, 'Rabbit trusted release manifest');
  const attachment = manifest.attachments?.[0];
  if (
    manifest.schemaVersion !== 1
    || manifest.repository !== 'ael-dev3/Warpkeep-Assets'
    || manifest.tag !== source.tag
    || manifest.designation?.status
      !== 'visual-only Environment/Wildlife runtime/UI archive; current in-game integration not asserted'
    || manifest.license?.status !== 'public-archive-authorized-no-separate-open-license'
    || manifest.license?.spdx !== null
    || manifest.attachments?.length !== 1
    || attachment?.name !== source.attachment.name
    || attachment?.bytes !== source.attachment.bytes
    || attachment?.sha256 !== source.attachment.sha256
    || attachment?.packageRoot !== source.attachment.packageRoot
    || !Array.isArray(attachment.entries)
    || attachment.entries.length !== EXPECTED_OUTER_ENTRIES.length
    || attachment.entries.some((entry, index) => (
      !exactFileRecord(entry, EXPECTED_OUTER_ENTRIES[index])
    ))
  ) fail('Rabbit trusted release manifest', 'release identity or license boundary changed.');
  return manifest;
}

export function assertInnerKeepRabbitOuterManifest(bytes) {
  const expected = EXPECTED_OUTER_ENTRIES[2];
  const manifest = exactJson(bytes, expected, 'Rabbit outer package manifest');
  const source = INNER_KEEP_RABBIT_SELECTION.source;
  if (
    manifest.packageId !== 'warpkeep.environment.wildlife.rabbit.runtime-ui'
    || manifest.packageVersion !== '1.0.0'
    || manifest.designation?.assetId !== 'warpkeep.environment.wildlife.rabbit'
    || manifest.designation?.visualOnly !== true
    || manifest.designation?.gameplayAuthority !== false
    || manifest.designation?.currentInGameIntegration !== 'not asserted'
    || manifest.licenseBoundary?.publicArchiveAuthorization !== 'authorized by Ael'
    || manifest.licenseBoundary?.separateOpenLicense !== 'not asserted'
    || manifest.sourceAttachment?.path !== source.nestedPackage.path.split('/').at(-1)
    || manifest.sourceAttachment?.bytes !== source.nestedPackage.bytes
    || manifest.sourceAttachment?.sha256 !== source.nestedPackage.sha256
    || manifest.sourceAttachment?.privacySanitized !== true
    || manifest.sourceEntryCount !== 13
    || manifest.sourcePayloadEntryCount !== 8
    || !Array.isArray(manifest.sourceEntries)
    || manifest.sourceEntries.length !== 8
  ) fail('Rabbit outer package manifest', 'nested package identity changed.');
  return manifest;
}

export function assertInnerKeepRabbitRuntimeManifest(bytes) {
  const expected = INNER_KEEP_RABBIT_SELECTION.source.runtimeManifest;
  const manifest = exactJson(bytes, expected, 'Rabbit runtime manifest');
  if (
    manifest.schema !== 'warpkeep.runtime-asset.v1'
    || manifest.assetId !== 'warpkeep.environment.wildlife.rabbit'
    || manifest.visualOnly !== true
    || manifest.gameplayAuthority !== false
    || manifest.collision?.renderMeshCollision !== false
    || manifest.runtimeContract?.externalDependencies !== 0
    || manifest.runtimeContract?.materialsPerLod !== 1
    || !exactArray(manifest.runtimeContract?.clips?.map((clip) => clip.name).sort(), EXPECTED_CLIPS)
    || !Array.isArray(manifest.lods)
    || manifest.lods.length !== 3
  ) fail('Rabbit runtime manifest', 'visual, animation, or collision contract changed.');
  return manifest;
}

export function assertInnerKeepRabbitBundleManifest(bytes) {
  const expected = INNER_KEEP_RABBIT_SELECTION.source.bundleManifest;
  const manifest = exactJson(bytes, expected, 'Rabbit nested bundle manifest');
  if (
    manifest.schema !== 'warpkeep.runtime-ui-bundle.v1'
    || manifest.assetId !== 'warpkeep.environment.wildlife.rabbit'
    || manifest.privacySanitization?.pixelsPreserved !== true
    || manifest.privacySanitization?.removedPrivateLocalPath !== true
    || manifest.runtimeFiles?.length !== 4
    || !exactArray([...manifest.runtimeSummary.clips].sort(), EXPECTED_CLIPS)
    || manifest.runtimeSummary?.externalTextures !== 0
  ) fail('Rabbit nested bundle manifest', 'runtime or privacy contract changed.');
  return manifest;
}

export function readInnerKeepRabbitGlbJson(bytes, label) {
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

export function verifyInnerKeepRabbitGlb(bytes, model, label) {
  if (
    !model
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength !== model.bytes
    || innerKeepRabbitSha256(bytes) !== model.sha256
  ) fail(label, 'does not match its exact selected bytes.');
  const gltf = readInnerKeepRabbitGlbJson(bytes, label);
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');
  const primitives = (gltf.meshes ?? []).flatMap((mesh) => mesh.primitives ?? []);
  const triangles = primitives.reduce((total, primitive) => {
    if ((primitive.mode ?? 4) !== 4) return Number.NaN;
    const count = gltf.accessors?.[primitive.indices]?.count
      ?? gltf.accessors?.[primitive.attributes?.POSITION]?.count;
    return total + (Number.isSafeInteger(count) ? count / 3 : Number.NaN);
  }, 0);
  const uploadedVertices = primitives.reduce((total, primitive) => (
    total + (gltf.accessors?.[primitive.attributes?.POSITION]?.count ?? Number.NaN)
  ), 0);
  const animationNames = (gltf.animations ?? []).map((entry) => entry.name).sort();
  const expectedAnimations = [...model.animations].sort();
  const rigged = model.mode === 'animated';
  if (
    gltf.asset?.version !== '2.0'
    || !String(gltf.asset?.copyright ?? '').includes('Warpkeep')
    || primitives.length !== model.drawCalls
    || gltf.materials?.length !== 1
    || external
    || triangles !== model.triangles
    || uploadedVertices !== model.uploadedVertices
    || !exactArray(animationNames, expectedAnimations)
    || (rigged && gltf.skins?.length !== 1)
    || (!rigged && (gltf.skins?.length ?? 0) !== 0)
    || (rigged && primitives.some((primitive) => (
      primitive.attributes?.JOINTS_0 === undefined
      || primitive.attributes?.WEIGHTS_0 === undefined
    )))
  ) fail(label, 'does not satisfy the selected embedded mesh, rig, and animation contract.');
  return gltf;
}
