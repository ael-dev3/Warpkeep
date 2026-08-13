import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const ASSET_REPO = resolve(ROOT, '../Warpkeep-Assets-main');
const OUTPUT = resolve(
  ROOT,
  'docs/reference/assets/2026-08-04-inner-keep-population/manifest.json'
);
const RELEASES = Object.freeze([
  Object.freeze({
    tag: 'hegemony-unit-corps-2026-08-03',
    releaseCommit: 'b074ffb6317ff9a581f5b7fc7f0a0760e721a9b6',
    manifestPath: resolve(
      ASSET_REPO,
      'releases/hegemony-unit-corps-2026-08-03/manifest.json'
    ),
    archiveDirectory: resolve(
      ROOT,
      '.cache/warpkeep-assets/hegemony-unit-corps-2026-08-03'
    )
  }),
  Object.freeze({
    tag: 'hegemony-citizens-keep-services-2026-08-03',
    releaseCommit: '9f99751f691581ce4f33a31dd56c818cfa455b61',
    manifestPath: resolve(
      ASSET_REPO,
      'releases/hegemony-citizens-keep-services-2026-08-03/manifest.json'
    ),
    archiveDirectory: resolve(
      ROOT,
      '.cache/warpkeep-assets/hegemony-citizens-keep-services-2026-08-03'
    )
  })
]);
const SELECTED_TIERS = Object.freeze([
  Object.freeze({ mode: 'animated', profile: 'balanced', tier: 'LOD1_Balanced' }),
  Object.freeze({ mode: 'static', profile: 'compact', tier: 'LOD2_Compact' })
]);

function fail(detail) {
  throw new Error(`Inner Keep population selection generator: ${detail}`);
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

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function listZipMembers(archivePath) {
  const result = spawnSync('/usr/bin/unzip', ['-Z1', archivePath], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024
  });
  if (result.error || result.status !== 0) fail(`cannot list ${archivePath}`);
  return result.stdout.split(/\r?\n/u).filter(Boolean);
}

function readZipMember(archivePath, member) {
  const result = spawnSync('/usr/bin/unzip', ['-p', archivePath, member], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 32 * 1024 * 1024
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(`cannot read ${member} from ${archivePath}`);
  }
  return result.stdout;
}

function familyForPackage(packageRoot) {
  if (packageRoot === 'Warpkeep_HegemonyCitizens_Set2_GameReady') return 'citizen';
  if (packageRoot === 'Warpkeep_HegemonyInfantry_GameReady') return 'infantry';
  if (packageRoot === 'Warpkeep_HegemonyRanged_GameReady') return 'ranged';
  if (packageRoot === 'Warpkeep_HegemonyCavalry_GameReady') return 'cavalry';
  fail(`unexpected package ${packageRoot}`);
}

function sourceEntry(entryMap, path) {
  const entry = entryMap.get(path);
  if (
    !entry
    || !Number.isSafeInteger(entry.bytes)
    || entry.bytes <= 0
    || typeof entry.sha256 !== 'string'
  ) fail(`trusted manifest does not attest ${path}`);
  return entry;
}

function actorId(assetId) {
  const id = assetId.split('.').at(-1);
  if (!id || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(id)) {
    fail(`unsafe actor ID in ${assetId}`);
  }
  return id;
}

function runtimeDestination(family, id, model) {
  return `public/models/hegemony/inner-keep/population/${family}/inner-keep-${id}-`
    + `${model.profile}-${model.sha256.slice(0, 16)}.glb`;
}

function populationActor({
  archive,
  attachment,
  entryMap,
  manifestPath,
  releaseTag
}) {
  const manifestEntry = sourceEntry(entryMap, manifestPath);
  const manifestBytes = readZipMember(archive, manifestPath);
  if (
    manifestBytes.byteLength !== manifestEntry.bytes
    || sha256(manifestBytes) !== manifestEntry.sha256
  ) fail(`${manifestPath} bytes changed`);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const id = actorId(manifest.assetId);
  const family = familyForPackage(attachment.packageRoot);
  const models = SELECTED_TIERS.map((selection) => {
    const lod = manifest.lods?.find((entry) => entry.tier === selection.tier);
    if (!lod) fail(`${manifest.assetId} does not declare ${selection.tier}`);
    const sourcePath = `${dirname(manifestPath)}/${lod.file}`;
    const entry = sourceEntry(entryMap, sourcePath);
    if (
      entry.bytes !== lod.bytes
      || entry.sha256 !== lod.sha256
      || !Number.isSafeInteger(lod.triangles)
      || lod.triangles <= 0
      || lod.rigged !== (selection.mode === 'animated')
      || !Array.isArray(lod.boundsBlender?.size)
      || lod.boundsBlender.size.length !== 3
    ) fail(`${manifest.assetId} ${selection.tier} contract changed`);
    const model = {
      ...selection,
      sourcePath,
      bytes: entry.bytes,
      sha256: entry.sha256,
      triangles: lod.triangles,
      animations: [...lod.animations].sort(),
      boundsMeters: [
        lod.boundsBlender.size[0],
        lod.boundsBlender.size[2],
        lod.boundsBlender.size[1]
      ]
    };
    return {
      ...model,
      destinationPath: runtimeDestination(family, id, model)
    };
  });
  const mounted = family === 'cavalry' || manifest.roleProfile?.mounted === true;
  return {
    id,
    family,
    sourceReleaseTag: releaseTag,
    sourceArchive: attachment.name,
    sourceAssetId: manifest.assetId,
    displayName: manifest.name,
    mounted,
    presentationRole: family === 'citizen' ? 'civic-routine' : 'ceremonial-patrol',
    sourceManifest: {
      path: manifestPath,
      bytes: manifestEntry.bytes,
      sha256: manifestEntry.sha256
    },
    models
  };
}

const actors = [];
const sources = [];
for (const release of RELEASES) {
  const manifestBytes = readFileSync(release.manifestPath);
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  if (
    manifest.tag !== release.tag
    || manifest.repository !== 'ael-dev3/Warpkeep-Assets'
    || manifest.license?.status !== 'public-archive-authorized-no-separate-open-license'
    || !Array.isArray(manifest.attachments)
  ) fail(`${release.tag} release manifest identity changed`);
  const source = {
    repository: 'ael-dev3/Warpkeep-Assets',
    repositoryMainCommit: '10c84fbcc339f143ee6f25dfe7a0682660e0e458',
    releaseCommit: release.releaseCommit,
    tag: release.tag,
    trustedReleaseManifest: {
      repositoryPath: `releases/${release.tag}/manifest.json`,
      bytes: manifestBytes.byteLength,
      sha256: sha256(manifestBytes)
    },
    attachments: []
  };
  for (const attachment of manifest.attachments) {
    const archive = resolve(release.archiveDirectory, attachment.name);
    const archiveBytes = readFileSync(archive);
    if (
      archiveBytes.byteLength !== attachment.bytes
      || sha256(archiveBytes) !== attachment.sha256
    ) fail(`${attachment.name} archive bytes changed`);
    const members = listZipMembers(archive);
    if (members.length !== attachment.entries.length) {
      fail(`${attachment.name} archive membership changed`);
    }
    const entryMap = new Map(attachment.entries.map((entry) => [entry.path, entry]));
    const manifests = members.filter((path) => path.endsWith('/runtime-manifest.json'));
    for (const manifestPath of manifests) {
      actors.push(populationActor({
        archive,
        attachment,
        entryMap,
        manifestPath,
        releaseTag: release.tag
      }));
    }
    source.attachments.push({
      name: attachment.name,
      bytes: attachment.bytes,
      sha256: attachment.sha256,
      entries: attachment.entries.length,
      packageRoot: attachment.packageRoot
    });
  }
  sources.push(source);
}

actors.sort((left, right) => (
  left.family.localeCompare(right.family) || left.id.localeCompare(right.id)
));
const familyCounts = Object.fromEntries(
  ['citizen', 'infantry', 'ranged', 'cavalry'].map((family) => [
    family,
    actors.filter((actor) => actor.family === family).length
  ])
);
const record = {
  schema: 'warpkeep.inner-keep-population-selection.v1',
  selectionId: 'inner-keep-population-v1',
  recordedAt: '2026-08-04',
  selectionDigestAlgorithm: 'sha256-ecmascript-canonical-json-v1',
  selectionDigestSha256: '',
  authorization: {
    archiveDistributionAuthorized: true,
    officialRepositoryRuntimeUseAuthorized: true,
    status: 'authorized-owner-runtime-use',
    recordedAt: '2026-08-04',
    instruction: 'Use characters, mounts, and army units from Warpkeep-Assets in the official Inner Keep runtime, including animated civic routines and patrols.',
    scopeBoundary: 'Runtime use in the public ael-dev3/Warpkeep repository and official warpkeep.com client is authorized for the exact selected files. This does not relicense the source archives, authorize unrelated reuse, represent ambient patrols as gameplay authority, approve activation, approve merge, or approve deployment.'
  },
  licenseBoundary: {
    sourceStatus: 'public-archive-authorized-no-separate-open-license',
    integrationGrant: 'owner-authorized-official-warpkeep-runtime-use-only',
    redistributionOrRelicensingGranted: false
  },
  runtimePolicy: {
    animatedTier: 'LOD1_Balanced',
    staticFallbackTier: 'LOD2_Compact',
    ordinaryBuildMayReadArchive: false,
    ordinaryBuildMayUseNetwork: false,
    clientPresentationOnly: true,
    gameplayAuthorityClaimed: false
  },
  sources,
  counts: {
    actors: actors.length,
    selectedModels: actors.reduce((total, actor) => total + actor.models.length, 0),
    mountedActors: actors.filter((actor) => actor.mounted).length,
    families: familyCounts,
    selectedBytes: actors.flatMap((actor) => actor.models)
      .reduce((total, model) => total + model.bytes, 0),
    selectedTriangles: Object.fromEntries(SELECTED_TIERS.map(({ profile }) => [
      profile,
      actors.flatMap((actor) => actor.models)
        .filter((model) => model.profile === profile)
        .reduce((total, model) => total + model.triangles, 0)
    ]))
  },
  actors
};
record.selectionDigestSha256 = sha256(Buffer.from(JSON.stringify(canonicalize({
  selectionId: record.selectionId,
  sources: record.sources,
  runtimePolicy: record.runtimePolicy,
  actors: record.actors
})), 'utf8'));

const write = process.argv.slice(2).includes('--write');
if (write) {
  mkdirSync(dirname(OUTPUT), { recursive: true });
  writeFileSync(OUTPUT, `${JSON.stringify(record, null, 2)}\n`, 'utf8');
}
console.log(JSON.stringify({
  write,
  output: OUTPUT,
  digest: record.selectionDigestSha256,
  counts: record.counts,
  trustedReleaseManifests: sources.map((source) => ({
    tag: source.tag,
    ...source.trustedReleaseManifest
  }))
}, null, 2));
