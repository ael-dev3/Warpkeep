import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const repositoryRoot = resolve(import.meta.dirname, '..');
const staticManifestPath = resolve(
  repositoryRoot,
  'docs/reference/assets/2026-08-02-inner-keep-3d-library/manifest.json',
);
const populationManifestPath = resolve(
  repositoryRoot,
  'docs/reference/assets/2026-08-04-inner-keep-population/manifest.json',
);
const outputPath = resolve(
  repositoryRoot,
  'src/components/inner-keep/innerKeepRuntimeAssetCatalog.generated.ts',
);

const STATIC_SELECTION_DIGEST =
  'cf1fdac091e310cce3362d43403be938fe7946e46df906f2efb8cff601497c6d';
const POPULATION_SELECTION_DIGEST =
  '79237fbe85a4db7a0592eb0c27cc00f8e72e85e58be867bec4dd35992f0b87f7';
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function fail(message) {
  throw new Error(`Inner Keep browser asset catalog: ${message}`);
}

function localRuntimePath(destinationPath, sha256) {
  if (
    typeof destinationPath !== 'string'
    || !destinationPath.startsWith('public/models/hegemony/inner-keep/')
    || destinationPath.includes('\\')
    || destinationPath.split('/').includes('..')
    || !SHA256_PATTERN.test(sha256)
    || !destinationPath.endsWith(`-${sha256.slice(0, 16)}.glb`)
  ) fail(`unsafe or non-content-addressed destination ${String(destinationPath)}`);
  return destinationPath.slice('public/'.length);
}

async function exactPreview(preview, assetId) {
  if (
    preview === undefined
    || !Number.isSafeInteger(preview.bytes)
    || preview.bytes <= 0
    || !SHA256_PATTERN.test(preview.sha256)
    || preview.width !== 320
    || preview.height !== 320
    || typeof preview.destinationPath !== 'string'
    || !preview.destinationPath.startsWith('public/images/inner-keep/catalog/')
    || preview.destinationPath.includes('\\')
    || preview.destinationPath.split('/').includes('..')
    || !preview.destinationPath.endsWith(`-${preview.sha256.slice(0, 16)}.png`)
  ) fail(`unsafe or non-content-addressed preview ${assetId}`);
  const bytes = await readFile(resolve(repositoryRoot, preview.destinationPath));
  if (
    bytes.byteLength !== preview.bytes
    || createHash('sha256').update(bytes).digest('hex') !== preview.sha256
    || bytes.byteLength < 24
    || bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a'
    || bytes.readUInt32BE(16) !== preview.width
    || bytes.readUInt32BE(20) !== preview.height
  ) fail(`preview coordinate drift ${assetId}`);
  return {
    path: preview.destinationPath.slice('public/'.length),
    bytes: preview.bytes,
    sha256: preview.sha256,
    width: preview.width,
    height: preview.height,
  };
}

async function exactGlbDrawCalls(destinationPath) {
  const bytes = await readFile(resolve(repositoryRoot, destinationPath));
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') {
    fail(`invalid GLB container ${destinationPath}`);
  }
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkEnd = offset + 8 + chunkLength;
    if (chunkEnd > bytes.length) fail(`truncated GLB chunk ${destinationPath}`);
    if (chunkType === 0x4e4f534a) {
      const gltf = JSON.parse(bytes.toString('utf8', offset + 8, chunkEnd));
      const drawCalls = (gltf.meshes ?? []).reduce((total, mesh) => (
        total + (Array.isArray(mesh.primitives) ? mesh.primitives.length : 0)
      ), 0);
      if (!Number.isSafeInteger(drawCalls) || drawCalls <= 0) {
        fail(`GLB has no render primitives ${destinationPath}`);
      }
      return drawCalls;
    }
    offset = chunkEnd;
  }
  fail(`GLB has no JSON chunk ${destinationPath}`);
}

async function exactModel(model) {
  if (
    !Number.isSafeInteger(model.bytes)
    || model.bytes <= 0
    || !Number.isSafeInteger(model.triangles)
    || model.triangles <= 0
    || !SHA256_PATTERN.test(model.sha256)
  ) fail(`invalid model coordinate ${String(model.destinationPath)}`);
  return {
    path: localRuntimePath(model.destinationPath, model.sha256),
    bytes: model.bytes,
    sha256: model.sha256,
    triangles: model.triangles,
    drawCalls: await exactGlbDrawCalls(model.destinationPath),
  };
}

function exactBounds(bounds, label) {
  if (
    !Array.isArray(bounds)
    || bounds.length !== 3
    || bounds.some((value) => !Number.isFinite(value) || value <= 0)
  ) fail(`invalid bounds for ${label}`);
  return bounds;
}

function stableLiteral(value) {
  return JSON.stringify(value, null, 2)
    .replace(/"([^"\\]+)":/g, '$1:')
    .replace(/\n/g, '\n  ');
}

async function main() {
  const [staticManifest, populationManifest] = await Promise.all([
    readFile(staticManifestPath, 'utf8').then(JSON.parse),
    readFile(populationManifestPath, 'utf8').then(JSON.parse),
  ]);
  if (
    staticManifest.selectionDigestSha256 !== STATIC_SELECTION_DIGEST
    || staticManifest.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || staticManifest.authorization?.status !== 'authorized-owner-runtime-use'
  ) fail('static selection or authorization drift');
  if (
    populationManifest.selectionDigestSha256 !== POPULATION_SELECTION_DIGEST
    || populationManifest.authorization?.officialRepositoryRuntimeUseAuthorized !== true
    || populationManifest.authorization?.status !== 'authorized-owner-runtime-use'
    || populationManifest.runtimePolicy?.clientPresentationOnly !== true
    || populationManifest.runtimePolicy?.gameplayAuthorityClaimed !== false
  ) fail('population selection, authorization, or authority boundary drift');

  const staticAssets = await Promise.all(staticManifest.assets.map(async (asset) => {
    const models = Object.fromEntries(await Promise.all(asset.models.map(async (model) => [
      model.profile,
      await exactModel(model),
    ])));
    if (!models.high || !models.balanced || !models.compact) {
      fail(`incomplete static LOD family ${asset.id}`);
    }
    return {
      id: asset.id,
      family: asset.family,
      displayName: asset.displayName,
      boundsMeters: exactBounds(asset.boundsMeters, asset.id),
      ...(asset.preview === undefined
        ? {}
        : { preview: await exactPreview(asset.preview, asset.id) }),
      models,
    };
  }));
  const actors = await Promise.all(populationManifest.actors.map(async (actor) => {
    const models = Object.fromEntries(await Promise.all(actor.models.map(async (model) => [
      model.profile,
      {
        ...await exactModel(model),
        mode: model.mode,
        animations: model.animations,
        boundsMeters: exactBounds(model.boundsMeters, `${actor.id}:${model.profile}`),
      },
    ])));
    if (!models.balanced || !models.compact) fail(`incomplete actor LOD family ${actor.id}`);
    return {
      id: actor.id,
      family: actor.family,
      displayName: actor.displayName,
      mounted: actor.mounted,
      presentationRole: actor.presentationRole,
      models,
    };
  }));
  if (staticAssets.length !== 38 || actors.length !== 20) fail('catalog count drift');

  const source = `/* eslint-disable */\n`
    + `// Generated by scripts/generate-inner-keep-browser-asset-catalog.mjs.\n`
    + `// Do not edit by hand; exact owner-authorized selections are the source of truth.\n\n`
    + `export const INNER_KEEP_STATIC_RUNTIME_SELECTION_DIGEST = '${STATIC_SELECTION_DIGEST}';\n`
    + `export const INNER_KEEP_POPULATION_RUNTIME_SELECTION_DIGEST = '${POPULATION_SELECTION_DIGEST}';\n\n`
    + `export const INNER_KEEP_STATIC_RUNTIME_ASSETS = Object.freeze(${stableLiteral(staticAssets)}) as readonly InnerKeepStaticRuntimeAsset[];\n\n`
    + `export const INNER_KEEP_POPULATION_RUNTIME_ACTORS = Object.freeze(${stableLiteral(actors)}) as readonly InnerKeepPopulationRuntimeActor[];\n\n`
    + `export type InnerKeepStaticRuntimeProfile = 'high' | 'balanced' | 'compact';\n`
    + `export type InnerKeepPopulationRuntimeProfile = 'balanced' | 'compact';\n`
    + `export type InnerKeepRuntimeModel = Readonly<{ path: string; bytes: number; sha256: string; triangles: number; drawCalls: number }>;\n`
    + `export type InnerKeepRuntimePreview = Readonly<{ path: string; bytes: number; sha256: string; width: 320; height: 320 }>;\n`
    + `export type InnerKeepStaticRuntimeAsset = Readonly<{\n`
    + `  id: string; family: 'buildings' | 'landmarks' | 'palisade' | 'stone' | 'town-items' | 'trees';\n`
    + `  displayName: string; boundsMeters: readonly [number, number, number];\n`
    + `  preview?: InnerKeepRuntimePreview;\n`
    + `  models: Readonly<Record<InnerKeepStaticRuntimeProfile, InnerKeepRuntimeModel>>;\n`
    + `}>;\n`
    + `export type InnerKeepPopulationRuntimeModel = InnerKeepRuntimeModel & Readonly<{\n`
    + `  mode: 'animated' | 'static'; animations: readonly string[]; boundsMeters: readonly [number, number, number];\n`
    + `}>;\n`
    + `export type InnerKeepPopulationRuntimeActor = Readonly<{\n`
    + `  id: string; family: 'citizen' | 'infantry' | 'ranged' | 'cavalry'; displayName: string; mounted: boolean;\n`
    + `  presentationRole: 'civic-routine' | 'ceremonial-patrol';\n`
    + `  models: Readonly<Record<InnerKeepPopulationRuntimeProfile, InnerKeepPopulationRuntimeModel>>;\n`
    + `}>;\n`;
  if (process.argv.includes('--check')) {
    const observed = await readFile(outputPath, 'utf8').catch(() => '');
    if (observed !== source) fail('generated TypeScript catalog is stale');
    return;
  }
  await writeFile(outputPath, source, 'utf8');
}

await main();
