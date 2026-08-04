import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const INNER_KEEP_POPULATION_SELECTION_RECORD =
  'docs/reference/assets/2026-08-04-inner-keep-population/manifest.json';
export const INNER_KEEP_POPULATION_SELECTION_DIGEST =
  '79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7';

const ROOT = resolve(import.meta.dirname, '..');
const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const SAFE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const EXPECTED_FAMILY_COUNTS = Object.freeze({
  citizen: 8,
  infantry: 4,
  ranged: 4,
  cavalry: 4
});
const EXPECTED_SOURCES = Object.freeze({
  'hegemony-unit-corps-2026-08-03': Object.freeze({
    releaseCommit: 'b074ffb6317ff9a581f5b7fc7f0a0760e721a9b6',
    manifestBytes: 54_417,
    manifestSha256: '983c7dbede5220a0b020a73ea7cf51f8cdd72fbe235417d890b34eabae3acaaf',
    attachments: Object.freeze([
      Object.freeze({
        name: 'warpkeep-hegemony-infantry-game-ready-2026-08-03-v1.zip',
        bytes: 16_877_451,
        sha256: '953fcca256324f2a73b3f13e2ca04911349a0f69934337e6ac7161041a2d4ba0',
        entries: 43,
        packageRoot: 'Warpkeep_HegemonyInfantry_GameReady'
      }),
      Object.freeze({
        name: 'warpkeep-hegemony-ranged-game-ready-2026-08-03-v1.zip',
        bytes: 16_349_955,
        sha256: '310b0feaf21f0619f1d10f154facd64f98ce3ad1658cf80bb4dd68f5847a0391',
        entries: 43,
        packageRoot: 'Warpkeep_HegemonyRanged_GameReady'
      }),
      Object.freeze({
        name: 'warpkeep-hegemony-cavalry-game-ready-2026-08-03-v1.zip',
        bytes: 19_651_045,
        sha256: '9d411ee308abacfd7ca93b1e96594cc4f9e8af613f6d18aca3128b49dfb9a48b',
        entries: 43,
        packageRoot: 'Warpkeep_HegemonyCavalry_GameReady'
      })
    ])
  }),
  'hegemony-citizens-keep-services-2026-08-03': Object.freeze({
    releaseCommit: '9f99751f691581ce4f33a31dd56c818cfa455b61',
    manifestBytes: 33_008,
    manifestSha256: '2472aea6dc43780f6ee11692b65fe138a2355373a9e72d96156bc0f9290cb34b',
    attachments: Object.freeze([
      Object.freeze({
        name: 'warpkeep-hegemony-citizens-keep-services-game-ready-2026-08-03-v1.zip',
        bytes: 24_825_077,
        sha256: '14a8bda3848ede5b398a7fc4ec10e56d98ae06584c42f4683cb2635c5bbb6aeb',
        entries: 75,
        packageRoot: 'Warpkeep_HegemonyCitizens_Set2_GameReady'
      })
    ])
  })
});
const EXPECTED_ANIMATIONS = Object.freeze({
  citizen: Object.freeze(['Greet', 'Idle', 'Walk', 'Work']),
  infantry: Object.freeze(['Attack', 'Idle', 'Walk']),
  ranged: Object.freeze(['Attack', 'Idle', 'Special', 'Walk']),
  cavalry: Object.freeze(['Attack', 'Idle', 'Special', 'Walk'])
});
const EXPECTED_MOUNTED_CITIZENS = Object.freeze(new Set([
  'emberfoot-courier',
  'shellback-shrine-tender'
]));
const EXPECTED_AUTHORIZATION_INSTRUCTION =
  'Use characters, mounts, and army units from Warpkeep-Assets in the official Inner Keep runtime, including animated civic routines and patrols.';
const EXPECTED_AUTHORIZATION_SCOPE =
  'Runtime use in the public ael-dev3/Warpkeep repository and official warpkeep.com client is authorized for the exact selected files. This does not relicense the source archives, authorize unrelated reuse, represent ambient patrols as gameplay authority, approve activation, approve merge, or approve deployment.';

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

function safePath(path) {
  return typeof path === 'string'
    && path.length > 0
    && !path.startsWith('/')
    && !path.includes('\\')
    && !path.includes('\0')
    && path === path.normalize('NFC')
    && path.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..');
}

function positiveVector3(value) {
  return Array.isArray(value)
    && value.length === 3
    && value.every((entry) => Number.isFinite(entry) && entry > 0);
}

export function innerKeepPopulationSha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function calculateInnerKeepPopulationSelectionDigest(record) {
  return innerKeepPopulationSha256(Buffer.from(JSON.stringify(canonicalize({
    selectionId: record?.selectionId,
    sources: record?.sources,
    runtimePolicy: record?.runtimePolicy,
    actors: record?.actors
  })), 'utf8'));
}

function assertSource(source, seenArchives) {
  const expected = EXPECTED_SOURCES[source?.tag];
  const label = `Inner Keep population source ${source?.tag ?? '<unknown>'}`;
  if (
    !expected
    || source.repository !== 'ael-dev3/Warpkeep-Assets'
    || source.repositoryMainCommit !== '10c84fbcc339f143ee6f25dfe7a0682660e0e458'
    || source.releaseCommit !== expected.releaseCommit
    || source.trustedReleaseManifest?.repositoryPath
      !== `releases/${source.tag}/manifest.json`
    || source.trustedReleaseManifest?.bytes !== expected.manifestBytes
    || source.trustedReleaseManifest?.sha256 !== expected.manifestSha256
    || !Array.isArray(source.attachments)
    || source.attachments.length !== expected.attachments.length
  ) fail(label, 'release coordinate changed.');
  source.attachments.forEach((attachment, index) => {
    const expectedAttachment = expected.attachments[index];
    if (
      attachment?.name !== expectedAttachment.name
      || attachment.bytes !== expectedAttachment.bytes
      || attachment.sha256 !== expectedAttachment.sha256
      || attachment.entries !== expectedAttachment.entries
      || attachment.packageRoot !== expectedAttachment.packageRoot
      || seenArchives.has(attachment.name)
    ) fail(label, 'attachment coordinate is unsafe or duplicated.');
    seenArchives.add(attachment.name);
  });
}

function assertActor(actor, sourceByTag, archiveByName, ids, destinations) {
  const label = `Inner Keep population actor ${actor?.id ?? '<unknown>'}`;
  if (
    !actor
    || typeof actor.id !== 'string'
    || !SAFE_ID_PATTERN.test(actor.id)
    || !Object.hasOwn(EXPECTED_FAMILY_COUNTS, actor.family)
    || actor.sourceAssetId !== `warpkeep.units.hegemony.${
      actor.family === 'citizen' ? 'citizens-set2' : actor.family
    }.${actor.id}`
    || typeof actor.displayName !== 'string'
    || actor.displayName.length === 0
    || typeof actor.mounted !== 'boolean'
    || actor.presentationRole !== (actor.family === 'citizen'
      ? 'civic-routine'
      : 'ceremonial-patrol')
    || !sourceByTag.has(actor.sourceReleaseTag)
    || !archiveByName.has(actor.sourceArchive)
    || archiveByName.get(actor.sourceArchive).tag !== actor.sourceReleaseTag
    || ids.has(actor.id)
    || !safePath(actor.sourceManifest?.path)
    || !actor.sourceManifest.path.endsWith('/runtime-manifest.json')
    || !Number.isSafeInteger(actor.sourceManifest?.bytes)
    || actor.sourceManifest.bytes <= 0
    || !SHA256_PATTERN.test(actor.sourceManifest?.sha256)
    || !Array.isArray(actor.models)
    || actor.models.length !== 2
  ) fail(label, 'selection shape changed.');
  if (
    actor.mounted !== (
      actor.family === 'cavalry'
      || (actor.family === 'citizen' && EXPECTED_MOUNTED_CITIZENS.has(actor.id))
    )
  ) fail(label, 'mounted presentation identity changed.');
  ids.add(actor.id);
  const expectedProfiles = [
    ['animated', 'balanced', 'LOD1_Balanced'],
    ['static', 'compact', 'LOD2_Compact']
  ];
  actor.models.forEach((model, index) => {
    const [mode, profile, tier] = expectedProfiles[index];
    if (
      model?.mode !== mode
      || model?.profile !== profile
      || model?.tier !== tier
      || !safePath(model?.sourcePath)
      || !model.sourcePath.endsWith('.glb')
      || dirname(model.sourcePath) !== dirname(actor.sourceManifest.path)
      || !Number.isSafeInteger(model.bytes)
      || model.bytes <= 0
      || !SHA256_PATTERN.test(model.sha256)
      || !Number.isSafeInteger(model.triangles)
      || model.triangles <= 0
      || !exactArray(
        model.animations,
        mode === 'animated' ? EXPECTED_ANIMATIONS[actor.family] : []
      )
      || !positiveVector3(model.boundsMeters)
      || model.destinationPath !== `public/models/hegemony/inner-keep/population/`
        + `${actor.family}/inner-keep-${actor.id}-${profile}-${model.sha256.slice(0, 16)}.glb`
      || !safePath(model.destinationPath)
      || destinations.has(model.destinationPath)
    ) fail(label, `${profile} model changed.`);
    destinations.add(model.destinationPath);
  });
}

export function assertInnerKeepPopulationSelectionRecord(record) {
  const label = 'Inner Keep population selection record';
  if (
    record?.schema !== 'warpkeep.inner-keep-population-selection.v1'
    || record.selectionId !== 'inner-keep-population-v1'
    || record.recordedAt !== '2026-08-04'
    || record.selectionDigestAlgorithm !== 'sha256-ecmascript-canonical-json-v1'
    || record.selectionDigestSha256 !== INNER_KEEP_POPULATION_SELECTION_DIGEST
    || record.authorization?.archiveDistributionAuthorized !== true
    || record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
    || record.authorization?.recordedAt !== '2026-08-04'
    || record.authorization?.instruction !== EXPECTED_AUTHORIZATION_INSTRUCTION
    || record.authorization?.scopeBoundary !== EXPECTED_AUTHORIZATION_SCOPE
    || record.licenseBoundary?.sourceStatus
      !== 'public-archive-authorized-no-separate-open-license'
    || record.licenseBoundary?.integrationGrant
      !== 'owner-authorized-official-warpkeep-runtime-use-only'
    || record.licenseBoundary?.redistributionOrRelicensingGranted !== false
    || record.runtimePolicy?.animatedTier !== 'LOD1_Balanced'
    || record.runtimePolicy?.staticFallbackTier !== 'LOD2_Compact'
    || record.runtimePolicy?.ordinaryBuildMayReadArchive !== false
    || record.runtimePolicy?.ordinaryBuildMayUseNetwork !== false
    || record.runtimePolicy?.clientPresentationOnly !== true
    || record.runtimePolicy?.gameplayAuthorityClaimed !== false
    || !Array.isArray(record.sources)
    || record.sources.length !== 2
    || !Array.isArray(record.actors)
    || record.actors.length !== 20
  ) fail(label, 'top-level authorization, source, or runtime policy changed.');
  const seenArchives = new Set();
  record.sources.forEach((source) => assertSource(source, seenArchives));
  if (
    new Set(record.sources.map((source) => source.tag)).size !== 2
    || seenArchives.size !== 4
  ) fail(label, 'source or archive identity was duplicated.');
  const sourceByTag = new Map(record.sources.map((source) => [source.tag, source]));
  const archiveByName = new Map(record.sources.flatMap((source) => (
    source.attachments.map((attachment) => [attachment.name, { ...attachment, tag: source.tag }])
  )));
  const ids = new Set();
  const destinations = new Set();
  record.actors.forEach((actor) => assertActor(
    actor,
    sourceByTag,
    archiveByName,
    ids,
    destinations
  ));
  const familyCounts = Object.fromEntries(Object.keys(EXPECTED_FAMILY_COUNTS).map((family) => [
    family,
    record.actors.filter((actor) => actor.family === family).length
  ]));
  if (
    JSON.stringify(familyCounts) !== JSON.stringify(EXPECTED_FAMILY_COUNTS)
    || record.counts?.actors !== 20
    || record.counts?.selectedModels !== 40
    || record.counts?.mountedActors !== 6
    || JSON.stringify(record.counts?.families) !== JSON.stringify(EXPECTED_FAMILY_COUNTS)
    || record.counts?.selectedBytes !== 8_705_628
    || record.counts?.selectedTriangles?.balanced !== 58_792
    || record.counts?.selectedTriangles?.compact !== 37_506
  ) fail(label, 'bounded selection totals changed.');
  const digest = calculateInnerKeepPopulationSelectionDigest(record);
  if (digest !== INNER_KEEP_POPULATION_SELECTION_DIGEST) {
    fail(label, `selection digest changed to ${digest}.`);
  }
}

function readRecord() {
  const record = JSON.parse(readFileSync(
    resolve(ROOT, INNER_KEEP_POPULATION_SELECTION_RECORD),
    'utf8'
  ));
  assertInnerKeepPopulationSelectionRecord(record);
  return deeplyFreeze(record);
}

export const INNER_KEEP_POPULATION_SELECTION = readRecord();
export const INNER_KEEP_POPULATION_ACTORS = INNER_KEEP_POPULATION_SELECTION.actors;
export const INNER_KEEP_POPULATION_MODELS = Object.freeze(
  INNER_KEEP_POPULATION_ACTORS.flatMap((actor) => actor.models.map((model) => deeplyFreeze({
    ...model,
    actorId: actor.id,
    family: actor.family,
    mounted: actor.mounted,
    sourceArchive: actor.sourceArchive,
    sourceReleaseTag: actor.sourceReleaseTag
  })))
);
export const INNER_KEEP_POPULATION_RUNTIME_PATHS = Object.freeze(
  INNER_KEEP_POPULATION_MODELS.map((model) => model.destinationPath).sort()
);

export function assertInnerKeepPopulationRuntimeUseAuthorized(
  record = INNER_KEEP_POPULATION_SELECTION
) {
  if (
    record.authorization?.archiveDistributionAuthorized !== true
    || record.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || record.authorization?.status !== 'authorized-owner-runtime-use'
    || record.licenseBoundary?.sourceStatus
      !== 'public-archive-authorized-no-separate-open-license'
    || record.licenseBoundary?.integrationGrant
      !== 'owner-authorized-official-warpkeep-runtime-use-only'
    || record.licenseBoundary?.redistributionOrRelicensingGranted !== false
    || record.runtimePolicy?.clientPresentationOnly !== true
    || record.runtimePolicy?.gameplayAuthorityClaimed !== false
  ) fail('Inner Keep population runtime installation', 'owner authorization is not recorded.');
}

export function readInnerKeepPopulationGlbJson(bytes, label) {
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

export function verifyInnerKeepPopulationGlb(bytes, model, label) {
  if (
    !model
    || !Buffer.isBuffer(bytes)
    || bytes.byteLength !== model.bytes
    || innerKeepPopulationSha256(bytes) !== model.sha256
  ) fail(label, 'does not match its exact selected bytes.');
  const gltf = readInnerKeepPopulationGlbJson(bytes, label);
  const external = [...(gltf.buffers ?? []), ...(gltf.images ?? [])]
    .some((entry) => typeof entry?.uri === 'string');
  const animationNames = (gltf.animations ?? []).map((entry) => entry.name).sort();
  const triangles = (gltf.meshes ?? []).reduce((meshTotal, mesh) => (
    meshTotal + (mesh.primitives ?? []).reduce((primitiveTotal, primitive) => {
      if ((primitive.mode ?? 4) !== 4) return Number.NaN;
      const count = gltf.accessors?.[primitive.indices]?.count
        ?? gltf.accessors?.[primitive.attributes?.POSITION]?.count;
      return primitiveTotal + (Number.isSafeInteger(count) ? count / 3 : Number.NaN);
    }, 0)
  ), 0);
  if (
    gltf.asset?.version !== '2.0'
    || !(gltf.meshes?.length > 0)
    || external
    || triangles !== model.triangles
    || !exactArray(animationNames, model.animations)
    || (model.mode === 'animated' && !(gltf.skins?.length > 0))
    || (model.mode === 'static' && (gltf.skins?.length ?? 0) !== 0)
  ) fail(label, 'does not satisfy the selected embedded animation and mesh contract.');
  return gltf;
}
