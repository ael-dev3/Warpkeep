import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const RECORD_PATH = resolve(
  ROOT,
  'docs/reference/assets/2026-08-02-inner-keep-3d-library/manifest.json'
);
const DEFAULT_ARCHIVE = resolve(
  ROOT,
  '.cache/warpkeep-assets/inner-keep-3d-asset-library-2026-08-02/',
  'inner-keep-3d-asset-library-2026-08-02-v1.zip'
);
const DEFAULT_RELEASE_MANIFEST = resolve(
  ROOT,
  '../Warpkeep-Assets-main/releases/inner-keep-3d-asset-library-2026-08-02/manifest.json'
);
const PROFILES = Object.freeze([
  Object.freeze({ profile: 'high', tier: 'LOD0_High' }),
  Object.freeze({ profile: 'balanced', tier: 'LOD1_Balanced' }),
  Object.freeze({ profile: 'compact', tier: 'LOD2_Compact' })
]);
const LANDMARKS = Object.freeze([
  Object.freeze({
    id: 'grand-covenant-cathedral',
    package: 'Warpkeep_GrandCovenantCathedral_GameReady',
    displayName: 'Grand Covenant Cathedral',
    intendedUse: 'Permanent northern civic and ceremonial anchor'
  }),
  Object.freeze({
    id: 'city-barracks',
    package: 'Warpkeep_CityBarracks_GameReady',
    displayName: 'Hegemony Shieldcourt Barracks',
    intendedUse: 'Permanent western garrison and patrol origin'
  })
]);

function fail(detail) {
  throw new Error(`Inner Keep static selection generator: ${detail}`);
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

function selectionDigest(record) {
  return sha256(Buffer.from(JSON.stringify(canonicalize({
    selectionId: record.selectionId,
    sourceRelease: record.sourceRelease,
    profiles: record.selectionPolicy.profiles,
    assets: record.assets,
    existingRuntimeReuse: record.existingRuntimeReuse
  })), 'utf8'));
}

function readZipMember(archivePath, member) {
  const result = spawnSync('/usr/bin/unzip', ['-p', archivePath, member], {
    cwd: ROOT,
    encoding: null,
    maxBuffer: 16 * 1024 * 1024
  });
  if (result.error || result.status !== 0 || !Buffer.isBuffer(result.stdout)) {
    fail(`cannot read ${member} from ${archivePath}`);
  }
  return result.stdout;
}

function exactEntry(entryMap, path) {
  const entry = entryMap.get(path);
  if (
    !entry
    || !Number.isSafeInteger(entry.bytes)
    || entry.bytes <= 0
    || typeof entry.sha256 !== 'string'
  ) fail(`trusted release manifest does not attest ${path}`);
  return entry;
}

function destinationPath(id, profile, digest) {
  return `public/models/hegemony/inner-keep/landmarks/inner-keep-${id}-${profile}-`
    + `${digest.slice(0, 16)}.glb`;
}

function makeLandmark(source, entryMap, archivePath, packageRoot) {
  const runtimeRoot = `${packageRoot}/3d/${source.package}/Runtime`;
  const manifestPath = `${runtimeRoot}/runtime-manifest.json`;
  const manifestEntry = exactEntry(entryMap, manifestPath);
  const manifestBytes = readZipMember(archivePath, manifestPath);
  if (
    manifestBytes.byteLength !== manifestEntry.bytes
    || sha256(manifestBytes) !== manifestEntry.sha256
  ) fail(`${source.package} runtime manifest bytes changed`);
  const runtimeManifest = JSON.parse(manifestBytes.toString('utf8'));
  const blenderSize = runtimeManifest?.runtimeContract?.boundsBlender?.size;
  if (
    typeof runtimeManifest?.assetId !== 'string'
    || !Array.isArray(blenderSize)
    || blenderSize.length !== 3
    || blenderSize.some((entry) => !Number.isFinite(entry) || entry <= 0)
  ) fail(`${source.package} runtime manifest shape changed`);
  const boundsMeters = [blenderSize[0], blenderSize[2], blenderSize[1]];
  const models = PROFILES.map(({ profile, tier }) => {
    const lod = runtimeManifest.lods.find((entry) => entry.tier === tier);
    if (!lod) fail(`${source.package} does not declare ${tier}`);
    const sourcePath = `${runtimeRoot}/${lod.file}`;
    const entry = exactEntry(entryMap, sourcePath);
    if (
      entry.bytes !== lod.bytes
      || entry.sha256 !== lod.sha256
      || !Number.isSafeInteger(lod.triangles)
      || lod.triangles <= 0
    ) fail(`${source.package} ${tier} release attestation changed`);
    return {
      profile,
      sourcePath,
      bytes: entry.bytes,
      sha256: entry.sha256,
      triangles: lod.triangles,
      boundsMeters,
      destinationPath: destinationPath(source.id, profile, entry.sha256)
    };
  });
  const previewPath = `${packageRoot}/3d/${source.package}/Previews/`
    + `${source.package.replace('_GameReady', '')}_MobilePreview_320.png`;
  const previewEntry = exactEntry(entryMap, previewPath);
  return {
    id: source.id,
    family: 'landmarks',
    sourcePackage: source.package,
    sourceAssetId: runtimeManifest.assetId,
    displayName: source.displayName,
    intendedUse: source.intendedUse,
    boundsMeters,
    sourceManifest: {
      path: manifestPath,
      bytes: manifestEntry.bytes,
      sha256: manifestEntry.sha256
    },
    models,
    preview: {
      sourcePath: previewPath,
      bytes: previewEntry.bytes,
      sha256: previewEntry.sha256,
      width: 320,
      height: 320,
      destinationPath: `public/images/inner-keep/catalog/${source.id}-`
        + `${previewEntry.sha256.slice(0, 16)}.png`
    }
  };
}

const write = process.argv.slice(2).includes('--write');
const archivePath = resolve(process.env.WARPKEEP_INNER_KEEP_ARCHIVE || DEFAULT_ARCHIVE);
const releaseManifestPath = resolve(
  process.env.WARPKEEP_INNER_KEEP_RELEASE_MANIFEST || DEFAULT_RELEASE_MANIFEST
);
const record = JSON.parse(readFileSync(RECORD_PATH, 'utf8'));
const releaseManifestBytes = readFileSync(releaseManifestPath);
const releaseManifest = JSON.parse(releaseManifestBytes.toString('utf8'));
const attachment = releaseManifest.attachments?.[0];
if (
  releaseManifest.tag !== record.sourceRelease.tag
  || attachment?.name !== record.sourceRelease.attachment.name
  || attachment?.sha256 !== record.sourceRelease.attachment.sha256
  || !Array.isArray(attachment?.entries)
) fail('trusted release identity changed');
const entryMap = new Map(attachment.entries.map((entry) => [entry.path, entry]));
const landmarks = LANDMARKS.map((source) => makeLandmark(
  source,
  entryMap,
  archivePath,
  attachment.packageRoot
));
const assets = [
  ...record.assets.filter((asset) => asset.family !== 'landmarks'),
  ...landmarks
];
const updated = {
  ...record,
  recordedAt: '2026-08-04',
  sourceRelease: {
    ...record.sourceRelease,
    repositoryMainCommit: '10c84fbcc339f143ee6f25dfe7a0682660e0e458'
  },
  authorization: {
    archiveDistributionAuthorized: true,
    officialRepositoryRuntimeUseAuthorized: true,
    status: 'authorized-owner-runtime-use',
    recordedAt: '2026-08-04',
    instruction: 'Use Warpkeep-Assets 3D objects to populate the official Inner Keep runtime, with the Grand Covenant Cathedral as the main building.',
    scopeBoundary: 'Runtime use in the public ael-dev3/Warpkeep repository and official warpkeep.com client is authorized for the exact selected files. This does not relicense the source archives, authorize unrelated reuse, approve activation, approve merge, or approve deployment.'
  },
  selectionPolicy: {
    ...record.selectionPolicy,
    sourceAssetCount: assets.length,
    sourceModelCount: assets.reduce((total, asset) => total + asset.models.length, 0),
    sourcePreviewCount: assets.reduce((total, asset) => total + (asset.preview ? 1 : 0), 0),
    excludedPackages: []
  },
  assets
};
updated.qualityTotals = Object.fromEntries(PROFILES.map(({ profile }) => {
  const models = assets.flatMap((asset) => asset.models)
    .filter((model) => model.profile === profile);
  return [profile, {
    bytes: models.reduce((total, model) => total + model.bytes, 0),
    triangles: models.reduce((total, model) => total + model.triangles, 0)
  }];
}));
updated.selectedModelBytesAllProfiles = assets
  .flatMap((asset) => asset.models)
  .reduce((total, model) => total + model.bytes, 0);
updated.selectedPreviewBytes = assets
  .reduce((total, asset) => total + (asset.preview?.bytes ?? 0), 0);
updated.selectionDigestSha256 = selectionDigest(updated);

const output = `${JSON.stringify(updated, null, 2)}\n`;
if (write) writeFileSync(RECORD_PATH, output, 'utf8');
console.log(JSON.stringify({
  write,
  record: basename(RECORD_PATH),
  selectionDigestSha256: updated.selectionDigestSha256,
  sourceAssetCount: updated.selectionPolicy.sourceAssetCount,
  sourceModelCount: updated.selectionPolicy.sourceModelCount,
  sourcePreviewCount: updated.selectionPolicy.sourcePreviewCount,
  qualityTotals: updated.qualityTotals,
  selectedModelBytesAllProfiles: updated.selectedModelBytesAllProfiles,
  selectedPreviewBytes: updated.selectedPreviewBytes,
  trustedReleaseManifest: {
    bytes: releaseManifestBytes.byteLength,
    sha256: sha256(releaseManifestBytes)
  }
}, null, 2));
