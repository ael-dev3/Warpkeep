import { createHash, timingSafeEqual } from 'node:crypto';
import { lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, relative, resolve, sep } from 'node:path';

import {
  GREATER_REALM_GENERATOR_VERSION,
  GREATER_REALM_PRIVATE_MANIFEST_KIND,
  GREATER_REALM_PRIVATE_PACKAGE_MAGIC,
  GREATER_REALM_REGION_SPECS,
  GREATER_REALM_TERRAIN_SEED_NAMESPACE,
  clearGreaterRealmCandidateSecret,
  deriveGreaterRealmCandidateSeedMaterial,
  generateGreaterRealmCandidate,
  type GreaterRealmPrivateCandidate,
} from './greater-realm-candidate-generator';
import type { GreaterRealmPrivateWorkspace } from './greater-realm-private-workspace';
import type { IntegerTerrainArray } from './greater-realm-terrain';
import { GREATER_REALM_GEOMORPHOLOGY_VERSION } from './greater-realm-geomorphology';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_SCHEMA,
} from './greater-realm-legacy-lowlands';
import {
  GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
  decodeGreaterRealmPrivateSeed,
  encodeGreaterRealmPrivateSeed,
} from './greater-realm-private-seed';
import {
  inspectGreaterRealmTrustedGit,
  sha256GreaterRealmAttestedFile,
} from './greater-realm-git';

const PRIVATE_ATLAS_FORMAT_VERSION = 4;
const PRIVATE_ATLAS_MAXIMUM_BYTES = 128 * 1024 * 1024;
const PRIVATE_PREVIEW_MAXIMUM_BYTES = 16 * 1024 * 1024;
const PRIVATE_MANIFEST_MAXIMUM_BYTES = 4 * 1024 * 1024;
const PRIVATE_CANDIDATE_MAXIMUM_BYTES = PRIVATE_ATLAS_MAXIMUM_BYTES
  + PRIVATE_MANIFEST_MAXIMUM_BYTES
  + PRIVATE_PREVIEW_MAXIMUM_BYTES * 6
  + GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const BATCH_HANDLE_PATTERN = /^GR-B-[A-Z2-7]{16}$/u;
const CANDIDATE_HANDLE_PATTERN = /^GR-A-[A-Z2-7]{16}$/u;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
export const GREATER_REALM_PRIVATE_PREVIEW_MARKER =
  'WKGR-PRIVATE-PREVIEW-V1' as const;
const PRIVATE_PREVIEW_TEXT_KEY = 'WarpkeepPrivate';
const PRIVATE_PREVIEW_MODES = [
  'silhouette', 'hillshade', 'biome', 'hydrology', 'regions', 'mountain-gates',
] as const;
const PRIVATE_PREVIEW_SEA_LEVEL = 0;
const PRIVATE_PREVIEW_WATER_DRY = 0;
const PRIVATE_PREVIEW_WATER_OCEAN = 1;
const PRIVATE_PREVIEW_WATER_LAKE = 2;
const PRIVATE_PREVIEW_WATER_RIVER = 3;
const PRIVATE_PREVIEW_WATER_STREAM = 4;
const PRIVATE_PREVIEW_WATER_SEA = 5;
const PRIVATE_PREVIEW_FOG_COLOR = Object.freeze([24, 22, 31] as const);
const PRIVATE_CANVAS_RADIUS = 270;
const PRIVATE_CHUNK_AXIS_SPAN = 15;
const PRIVATE_CHUNK_PARTITION_VERSION = 'axial-bin-15-v1' as const;
const PRIVATE_CHUNK_SCHEMA = 'warpkeep.greater-realm.private-chunk-manifest.v1' as const;
const PRIVATE_TOPOGRAPHY_PATCH_SCHEMA =
  'warpkeep.greater-realm.private-topography-patch.v1' as const;
const PRIVATE_TOPOGRAPHY_VERSION = 'greater-realm-advanced-topography-v1' as const;
const PRIVATE_TOPOGRAPHY_ENCODING_VERSION = 'wkgr-topography-fields-v1' as const;

const PRIVATE_PINNED_TOOLCHAIN = Object.freeze({
  configuredNodeEngine: '>=22.13 <23',
  configuredPackageManager: 'npm@10.9.8',
  libvips: '8.18.3',
  sharp: '0.35.3',
  tsx: '4.23.0',
  typescript: '7.0.2',
});
const PRIVATE_TOOLCHAIN_VERSION_KEYS = Object.freeze([
  'architecture', 'configuredNodeEngine', 'configuredPackageManager', 'git',
  'installLayout', 'libvips', 'nodeExecutable', 'platform', 'runtimeNode',
  'preflight', 'sharp', 'tsx', 'typescript',
] as const);
const require = createRequire(import.meta.url);
const REPOSITORY_ROOT = resolve(import.meta.dirname, '..', '..');
const NODE_MODULES_ROOT = resolve(REPOSITORY_ROOT, 'node_modules');
const TOOLCHAIN_LOCK_PATH = resolve(
  REPOSITORY_ROOT,
  'scripts',
  'atlas',
  'greater-realm-toolchain-lock.json',
);

type GreaterRealmPrivatePreviewMode = typeof PRIVATE_PREVIEW_MODES[number];

const PRIVATE_MANIFEST_KEYS = Object.freeze([
  'aggregate',
  'atlasDigest',
  'barrierCrossSections',
  'batchHandle',
  'candidateHandle',
  'candidateOrdinal',
  'canvas',
  'chunkManifests',
  'domains',
  'exactActiveCellCount',
  'exactRegionCellCounts',
  'formatVersion',
  'gateGraph',
  'gates',
  'generatorVersion',
  'geomorphologyVersion',
  'kind',
  'legacyLowlands',
  'performance',
  'previewDigests',
  'privateMetrics',
  'provenanceDigest',
  'regionSpecs',
  'seedDigest',
  'seedNamespace',
  'sourceCommit',
  'stageDigests',
  'tierOneSemanticPermutation',
  'throneAnchor',
  'toolchainVersions',
  'topographyPatchManifests',
] as const);

type EncodedFieldType = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

type EncodedField = Readonly<{
  name: string;
  type: EncodedFieldType;
  width: number;
  array: IntegerTerrainArray;
}>;

type PrivateChunk = Readonly<{
  chunkKey: string;
  chunkQ: number;
  chunkR: number;
  cellIndices: readonly number[];
}>;

function fail(code: string): never {
  throw new Error(code);
}

function privateToolchainPath(path: string): string {
  const canonical = realpathSync(path);
  const withinRepository = relative(REPOSITORY_ROOT, canonical);
  if (
    withinRepository === ''
    || withinRepository === '..'
    || withinRepository.startsWith(`..${sep}`)
    || resolve(REPOSITORY_ROOT, withinRepository) !== canonical
    || (
      withinRepository !== 'node_modules'
      && !withinRepository.startsWith(`node_modules${sep}`)
    )
  ) fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  return withinRepository.split(sep).join('/');
}

function privateToolchainFile(path: string) {
  try {
    const attestation = sha256GreaterRealmAttestedFile(path, NODE_MODULES_ROOT);
    return Object.freeze({
      path: privateToolchainPath(attestation.canonicalPath),
      sha256: attestation.sha256,
    });
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
}

function privateExternalToolchainFile(path: string) {
  try {
    const attestation = sha256GreaterRealmAttestedFile(path);
    return Object.freeze({
      path: attestation.canonicalPath,
      sha256: attestation.sha256,
    });
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
}

function privatePackageAlias(name: 'sharp' | 'tsx' | 'typescript', packageRoot: string) {
  const alias = resolve(NODE_MODULES_ROOT, name);
  let status: ReturnType<typeof lstatSync>;
  try {
    status = lstatSync(alias);
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  if (!status.isDirectory() && !status.isSymbolicLink()) {
    fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  const canonicalAlias = realpathSync(alias);
  if (canonicalAlias !== realpathSync(packageRoot)) {
    fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  return Object.freeze({
    kind: status.isSymbolicLink() ? 'symlink' as const : 'directory' as const,
    target: privateToolchainPath(canonicalAlias),
  });
}

function privateNativeArtifacts(paths: readonly string[], kind: 'sharp' | 'libvips') {
  const unique = [...new Set(paths.map(path => realpathSync(path)))].sort();
  if (unique.length < 1 || unique.length > 16) {
    fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  const artifacts = unique.map(privateToolchainFile);
  if (artifacts.some(artifact => (
    kind === 'sharp'
      ? !artifact.path.endsWith('.node') || !basename(artifact.path).includes('sharp')
      : !basename(artifact.path).toLowerCase().includes('vips')
  ))) fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  return Object.freeze(artifacts);
}

function privateToolchainPreflightReceipt() {
  let manifest: ReturnType<typeof sha256GreaterRealmAttestedFile>;
  try {
    manifest = sha256GreaterRealmAttestedFile(TOOLCHAIN_LOCK_PATH, REPOSITORY_ROOT);
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_PREFLIGHT_REQUIRED');
  }
  const receipt = process.env.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT;
  const profile = process.env.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE;
  const expectedProfile = `${process.platform}-${process.arch}`;
  const expectedReceipt = `sha256:${manifest.sha256}`;
  if (
    receipt !== expectedReceipt
    || profile !== expectedProfile
    || !/^sha256:[0-9a-f]{64}$/u.test(receipt)
    || !/^(?:darwin-arm64|linux-x64)$/u.test(profile)
  ) fail('GREATER_REALM_PRIVATE_TOOLCHAIN_PREFLIGHT_REQUIRED');
  return Object.freeze({
    kind: 'locked-package-tree-v1' as const,
    manifestPath: relative(REPOSITORY_ROOT, manifest.canonicalPath).split(sep).join('/'),
    manifestSha256: manifest.sha256,
    profile,
  });
}

async function privateToolchainVersions() {
  const preflight = privateToolchainPreflightReceipt();
  const sharpModule = await import('sharp');
  const runtimeNode = process.versions.node;
  const runtimeSharp = sharpModule.default.versions.sharp;
  const runtimeLibvips = sharpModule.default.versions.vips;
  const nodeParts = runtimeNode.split('.').map(value => Number.parseInt(value, 10));
  const installedTsx = require('tsx/package.json') as { version?: unknown };
  const installedTypeScript = require('typescript/package.json') as { version?: unknown };
  if (
    typeof runtimeNode !== 'string'
    || !/^\d+\.\d+\.\d+$/u.test(runtimeNode)
    || nodeParts[0] !== 22
    || nodeParts[1] === undefined
    || nodeParts[1] < 13
    || runtimeSharp !== PRIVATE_PINNED_TOOLCHAIN.sharp
    || runtimeLibvips !== PRIVATE_PINNED_TOOLCHAIN.libvips
    || installedTsx.version !== PRIVATE_PINNED_TOOLCHAIN.tsx
    || installedTypeScript.version !== PRIVATE_PINNED_TOOLCHAIN.typescript
  ) fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  const sharpEntrypoint = require.resolve('sharp');
  const sharpRoot = resolve(dirname(sharpEntrypoint), '..');
  const tsxPackageJson = require.resolve('tsx/package.json');
  const tsxRoot = dirname(tsxPackageJson);
  const tsxRequire = createRequire(tsxPackageJson);
  const esbuildPackageJson = tsxRequire.resolve('esbuild/package.json');
  const esbuildPackage = tsxRequire('esbuild/package.json') as { version?: unknown };
  const esbuildRoot = dirname(esbuildPackageJson);
  const esbuildRequire = createRequire(esbuildPackageJson);
  let esbuildNativePackageJson: string;
  try {
    esbuildNativePackageJson = esbuildRequire.resolve(
      `@esbuild/${process.platform}-${process.arch}/package.json`,
    );
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  const esbuildNativeRoot = dirname(esbuildNativePackageJson);
  const esbuildNativeCli = resolve(
    esbuildNativeRoot,
    'bin',
    process.platform === 'win32' ? 'esbuild.exe' : 'esbuild',
  );
  const typescriptPackageJson = require.resolve('typescript/package.json');
  const typescriptRoot = dirname(typescriptPackageJson);
  const typescriptRequire = createRequire(typescriptPackageJson);
  let typescriptNativePackageJson: string;
  try {
    typescriptNativePackageJson = typescriptRequire.resolve(
      `@typescript/typescript-${process.platform}-${process.arch}/package.json`,
    );
  } catch {
    return fail('GREATER_REALM_PRIVATE_TOOLCHAIN_INVALID');
  }
  const typescriptNativeRoot = dirname(typescriptNativePackageJson);
  const typescriptNativeCli = resolve(
    typescriptNativeRoot,
    'lib',
    process.platform === 'win32' ? 'tsc.exe' : 'tsc',
  );
  const report = process.report?.getReport();
  const reportedSharedObjects = report !== undefined && typeof report === 'object'
    ? (report as { sharedObjects?: unknown }).sharedObjects
    : undefined;
  const sharedObjects = report !== undefined
    && Array.isArray(reportedSharedObjects)
    ? reportedSharedObjects as string[]
    : [];
  const sharpNativePaths = sharedObjects.filter(path => (
    typeof path === 'string'
    && path.endsWith('.node')
    && basename(path).toLowerCase().includes('sharp')
  ));
  const libvipsNativePaths = sharedObjects.filter(path => (
    typeof path === 'string'
    && basename(path).toLowerCase().includes('vips')
  ));
  const aliases = Object.freeze({
    sharp: privatePackageAlias('sharp', sharpRoot),
    tsx: privatePackageAlias('tsx', tsxRoot),
    typescript: privatePackageAlias('typescript', typescriptRoot),
  });
  const aliasKinds = Object.values(aliases).map(alias => alias.kind);
  const installLayout = aliasKinds.every(kind => kind === 'directory')
    ? 'direct-node-modules'
    : aliasKinds.every(kind => kind === 'symlink')
      ? 'bound-symlink-store'
      : 'bound-mixed-node-modules';
  const git = inspectGreaterRealmTrustedGit();
  return Object.freeze({
    ...PRIVATE_PINNED_TOOLCHAIN,
    architecture: process.arch,
    git: Object.freeze({
      binaryPath: git.binaryPath,
      binarySha256: git.binarySha256,
      execPath: git.execPath,
      version: git.version,
    }),
    installLayout: Object.freeze({ kind: installLayout, aliases }),
    nodeExecutable: privateExternalToolchainFile(process.execPath),
    platform: process.platform,
    preflight,
    runtimeNode,
    sharp: Object.freeze({
      version: runtimeSharp,
      packageJson: privateToolchainFile(resolve(sharpRoot, 'package.json')),
      entrypoint: privateToolchainFile(sharpEntrypoint),
      native: privateNativeArtifacts(sharpNativePaths, 'sharp'),
      libvipsNative: privateNativeArtifacts(libvipsNativePaths, 'libvips'),
    }),
    tsx: Object.freeze({
      version: installedTsx.version,
      packageJson: privateToolchainFile(tsxPackageJson),
      cli: privateToolchainFile(require.resolve('tsx/cli')),
      esbuildVersion: esbuildPackage.version,
      esbuildPackageJson: privateToolchainFile(esbuildPackageJson),
      esbuildEntrypoint: privateToolchainFile(resolve(esbuildRoot, 'lib', 'main.js')),
      esbuildNativePackageJson: privateToolchainFile(esbuildNativePackageJson),
      esbuildNativeCli: privateToolchainFile(esbuildNativeCli),
    }),
    typescript: Object.freeze({
      version: installedTypeScript.version,
      packageJson: privateToolchainFile(typescriptPackageJson),
      cli: privateToolchainFile(resolve(typescriptRoot, 'lib', 'tsc.js')),
      nativePackageJson: privateToolchainFile(typescriptNativePackageJson),
      nativeCli: privateToolchainFile(typescriptNativeCli),
    }),
  });
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
  code = 'GREATER_REALM_PRIVATE_MANIFEST_INVALID',
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail(code);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) fail(code);
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail(code);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function exactJsonEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) {
      return false;
    }
    return left.every((value, index) => exactJsonEqual(value, right[index]));
  }
  if (
    left === null
    || right === null
    || typeof left !== 'object'
    || typeof right !== 'object'
  ) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (
    leftKeys.length !== rightKeys.length
    || leftKeys.some((key, index) => key !== rightKeys[index])
  ) return false;
  return leftKeys.every(key => exactJsonEqual(
    (left as Record<string, unknown>)[key],
    (right as Record<string, unknown>)[key],
  ));
}

function canonicalPrivateManifestValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalPrivateManifestValue);
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalPrivateManifestValue(entry)]));
  }
  return value;
}

function serializeCanonicalPrivateManifest(value: unknown): Buffer {
  return Buffer.from(
    `${JSON.stringify(canonicalPrivateManifestValue(value), null, 2)}\n`,
    'utf8',
  );
}

function safeBufferEqual(left: Uint8Array, right: Uint8Array): boolean {
  return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

function deriveCandidateSeedMaterial(
  batchSeed: Uint8Array,
  candidateOrdinal: number,
): Buffer {
  if (
    batchSeed.byteLength !== 32
    || !Number.isSafeInteger(candidateOrdinal)
    || candidateOrdinal < 0
  ) fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
  return deriveGreaterRealmCandidateSeedMaterial(batchSeed, candidateOrdinal);
}

function privateProvenanceDigest(input: Readonly<{
  batchHandle: string;
  sourceCommit: string;
  candidateOrdinal: number;
  seedMaterial: Uint8Array;
}>): string {
  return createHash('sha256')
    .update('warpkeep.greater-realm.private-provenance.v1\0', 'utf8')
    .update(input.batchHandle, 'utf8')
    .update('\0', 'utf8')
    .update(input.sourceCommit, 'utf8')
    .update('\0', 'utf8')
    .update(GREATER_REALM_GENERATOR_VERSION, 'utf8')
    .update('\0', 'utf8')
    .update(GREATER_REALM_TERRAIN_SEED_NAMESPACE, 'utf8')
    .update('\0', 'utf8')
    .update(String(input.candidateOrdinal), 'utf8')
    .update('\0', 'utf8')
    .update(input.seedMaterial)
    .digest('hex');
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb8_8320 : 0);
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function privatePreviewTextChunk(): Buffer {
  const type = Buffer.from('tEXt', 'ascii');
  const data = Buffer.from(
    `${PRIVATE_PREVIEW_TEXT_KEY}\0${GREATER_REALM_PRIVATE_PREVIEW_MARKER}`,
    'latin1',
  );
  const crcInput = Buffer.concat([type, data]);
  const chunk = Buffer.allocUnsafe(12 + data.length);
  try {
    chunk.writeUInt32BE(data.length, 0);
    type.copy(chunk, 4);
    data.copy(chunk, 8);
    chunk.writeUInt32BE(crc32(crcInput), 8 + data.length);
    return chunk;
  } finally {
    type.fill(0);
    data.fill(0);
    crcInput.fill(0);
  }
}

function markPrivatePreviewPng(png: Buffer): Buffer {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
  }
  let offset = PNG_SIGNATURE.length;
  while (offset + 12 <= png.length) {
    const length = png.readUInt32BE(offset);
    const end = offset + 12 + length;
    if (end > png.length) fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
    const type = png.subarray(offset + 4, offset + 8).toString('ascii');
    if (type === 'IEND') {
      if (length !== 0 || end !== png.length) fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
      const marker = privatePreviewTextChunk();
      try {
        return Buffer.concat([png.subarray(0, offset), marker, png.subarray(offset)]);
      } finally {
        marker.fill(0);
      }
    }
    offset = end;
  }
  return fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
}

function hasValidPrivatePreviewMarker(png: Buffer): boolean {
  if (!png.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) return false;
  const expected = Buffer.from(
    `${PRIVATE_PREVIEW_TEXT_KEY}\0${GREATER_REALM_PRIVATE_PREVIEW_MARKER}`,
    'latin1',
  );
  let matches = 0;
  let offset = PNG_SIGNATURE.length;
  try {
    while (offset + 12 <= png.length) {
      const length = png.readUInt32BE(offset);
      const end = offset + 12 + length;
      if (end > png.length) return false;
      const type = png.subarray(offset + 4, offset + 8);
      const data = png.subarray(offset + 8, offset + 8 + length);
      const expectedCrc = png.readUInt32BE(offset + 8 + length);
      const crcInput = png.subarray(offset + 4, offset + 8 + length);
      if (crc32(crcInput) !== expectedCrc) return false;
      const typeName = type.toString('ascii');
      if (typeName === 'tEXt' && safeBufferEqual(data, expected)) matches += 1;
      if (typeName === 'IEND') return length === 0 && end === png.length && matches === 1;
      offset = end;
    }
    return false;
  } finally {
    expected.fill(0);
  }
}

function privateFields(candidate: GreaterRealmPrivateCandidate): readonly EncodedField[] {
  return Object.freeze([
    { name: 'q', type: 5, width: 4, array: candidate.grid.q },
    { name: 'r', type: 5, width: 4, array: candidate.grid.r },
    { name: 'bedrock-elevation', type: 5, width: 4, array: candidate.bedrockElevation },
    { name: 'erosion-elevation', type: 5, width: 4, array: candidate.elevation },
    { name: 'filled-elevation', type: 5, width: 4, array: candidate.filledElevation },
    { name: 'sediment-depth', type: 4, width: 2, array: candidate.sedimentDepth },
    { name: 'flow-receiver', type: 5, width: 4, array: candidate.flowReceiver },
    { name: 'flow-accumulation', type: 8, width: 8, array: candidate.flowAccumulation },
    { name: 'domain-id', type: 2, width: 1, array: candidate.domainId },
    { name: 'geology-id', type: 2, width: 1, array: candidate.geologyId },
    { name: 'region-id', type: 2, width: 1, array: candidate.regionId },
    { name: 'tier-id', type: 2, width: 1, array: candidate.tierId },
    { name: 'water-regime', type: 2, width: 1, array: candidate.waterRegime },
    { name: 'biome-id', type: 2, width: 1, array: candidate.biomeId },
    { name: 'landform-id', type: 2, width: 1, array: candidate.landformId },
    { name: 'barrier', type: 2, width: 1, array: candidate.barrier },
    {
      name: 'geological-barrier-band',
      type: 2,
      width: 1,
      array: candidate.geologicalBarrierBand,
    },
    { name: 'castle-slot', type: 2, width: 1, array: candidate.castleSlot },
    { name: 'resource-potential', type: 2, width: 1, array: candidate.resourcePotential },
    { name: 'core-potential', type: 2, width: 1, array: candidate.corePotential },
    { name: 'throne-anchor', type: 2, width: 1, array: candidate.throneAnchor },
    { name: 'legacy-lowlands-cell', type: 2, width: 1, array: candidate.legacyLowlandsCell },
    { name: 'legacy-lowlands-protected-cell', type: 2, width: 1, array: candidate.legacyLowlandsProtectedCell },
    { name: 'legacy-lowlands-reserve-cell', type: 2, width: 1, array: candidate.legacyLowlandsReserveCell },
    { name: 'legacy-lowlands-castle-slot', type: 2, width: 1, array: candidate.legacyLowlandsCastleSlot },
    { name: 'tectonic-uplift', type: 5, width: 4, array: candidate.tectonicUplift },
    { name: 'rock-resistance', type: 5, width: 4, array: candidate.rockResistance },
    {
      name: 'geomorphology-elevation',
      type: 5,
      width: 4,
      array: candidate.geomorphologyElevation,
    },
    {
      name: 'geomorphology-total-delta',
      type: 5,
      width: 4,
      array: candidate.geomorphologyTotalDelta,
    },
    {
      name: 'geomorphology-glacial-delta',
      type: 5,
      width: 4,
      array: candidate.geomorphologyGlacialDelta,
    },
    {
      name: 'geomorphology-arid-delta',
      type: 5,
      width: 4,
      array: candidate.geomorphologyAridDelta,
    },
    {
      name: 'geomorphology-volcanic-delta',
      type: 5,
      width: 4,
      array: candidate.geomorphologyVolcanicDelta,
    },
    {
      name: 'geomorphology-coastal-delta',
      type: 5,
      width: 4,
      array: candidate.geomorphologyCoastalDelta,
    },
    {
      name: 'geomorphology-glacial-mask',
      type: 2,
      width: 1,
      array: candidate.geomorphologyGlacialMask,
    },
    {
      name: 'geomorphology-arid-mask',
      type: 2,
      width: 1,
      array: candidate.geomorphologyAridMask,
    },
    {
      name: 'geomorphology-volcanic-mask',
      type: 2,
      width: 1,
      array: candidate.geomorphologyVolcanicMask,
    },
    {
      name: 'geomorphology-volcanic-anchor-mask',
      type: 2,
      width: 1,
      array: candidate.geomorphologyVolcanicAnchorMask,
    },
    {
      name: 'geomorphology-coastal-mask',
      type: 2,
      width: 1,
      array: candidate.geomorphologyCoastalMask,
    },
    {
      name: 'geomorphology-coastal-class',
      type: 2,
      width: 1,
      array: candidate.geomorphologyCoastalClass,
    },
    {
      name: 'geomorphology-temperature',
      type: 5,
      width: 4,
      array: candidate.geomorphologyTemperature,
    },
    {
      name: 'geomorphology-moisture',
      type: 5,
      width: 4,
      array: candidate.geomorphologyMoisture,
    },
    { name: 'slope', type: 4, width: 2, array: candidate.slope },
    { name: 'aspect', type: 2, width: 1, array: candidate.aspect },
    { name: 'profile-curvature', type: 5, width: 4, array: candidate.profileCurvature },
    { name: 'plan-curvature', type: 5, width: 4, array: candidate.planCurvature },
    { name: 'wetness-index', type: 4, width: 2, array: candidate.wetnessIndex },
    { name: 'exposure', type: 5, width: 4, array: candidate.exposure },
    { name: 'distance-to-coast', type: 4, width: 2, array: candidate.distanceToCoast },
    { name: 'distance-to-freshwater', type: 4, width: 2, array: candidate.distanceToFreshwater },
    { name: 'watershed-id', type: 5, width: 4, array: candidate.watershedId },
    { name: 'ridge-id', type: 5, width: 4, array: candidate.ridgeId },
    { name: 'temperature', type: 5, width: 4, array: candidate.temperature },
    { name: 'moisture', type: 5, width: 4, array: candidate.moisture },
  ] as const);
}

function encodedFieldHasExactType(field: EncodedField): boolean {
  if (field.type === 1) return field.width === 1 && field.array instanceof Int8Array;
  if (field.type === 2) {
    return field.width === 1
      && field.array instanceof Uint8Array
      && !(field.array instanceof Uint8ClampedArray);
  }
  if (field.type === 3) return field.width === 2 && field.array instanceof Int16Array;
  if (field.type === 4) return field.width === 2 && field.array instanceof Uint16Array;
  if (field.type === 5) return field.width === 4 && field.array instanceof Int32Array;
  if (field.type === 6) return field.width === 4 && field.array instanceof Uint32Array;
  if (field.type === 7) return field.width === 8 && field.array instanceof BigInt64Array;
  return field.type === 8 && field.width === 8 && field.array instanceof BigUint64Array;
}

function writeFieldValue(
  buffer: Buffer,
  offset: number,
  field: EncodedField,
  index: number,
): number {
  const value = field.array[index]!;
  if (field.type === 1) buffer.writeInt8(Number(value), offset);
  else if (field.type === 2) buffer.writeUInt8(Number(value), offset);
  else if (field.type === 3) buffer.writeInt16LE(Number(value), offset);
  else if (field.type === 4) buffer.writeUInt16LE(Number(value), offset);
  else if (field.type === 5) buffer.writeInt32LE(Number(value), offset);
  else if (field.type === 6) buffer.writeUInt32LE(Number(value), offset);
  else if (field.type === 7) buffer.writeBigInt64LE(BigInt(value), offset);
  else if (field.type === 8) buffer.writeBigUInt64LE(BigInt(value), offset);
  else fail('GREATER_REALM_PRIVATE_FIELD_TYPE_INVALID');
  return offset + field.width;
}

function writeArray(buffer: Buffer, offset: number, field: EncodedField): number {
  for (let index = 0; index < field.array.length; index += 1) {
    offset = writeFieldValue(buffer, offset, field, index);
  }
  return offset;
}

/** Canonical private binary; never write this buffer inside the repository. */
export function serializeGreaterRealmPrivateAtlas(
  candidate: GreaterRealmPrivateCandidate,
): Buffer {
  const fields = privateFields(candidate);
  const magic = Buffer.from(GREATER_REALM_PRIVATE_PACKAGE_MAGIC, 'ascii');
  let buffer: Buffer | undefined;
  let completed = false;
  try {
    const headerBytes = 2 + magic.length + 2 + 4 + 2;
    const fieldHeaderBytes = fields.reduce((total, field) => {
      const nameBytes = Buffer.byteLength(field.name, 'utf8');
      if (
        nameBytes === 0
        || nameBytes > 255
        || field.array.length !== candidate.grid.cellCount
        || !encodedFieldHasExactType(field)
      ) {
        fail('GREATER_REALM_PRIVATE_FIELD_INVALID');
      }
      return total + 1 + nameBytes + 1 + 4 + 8;
    }, 0);
    const payloadBytes = fields.reduce((total, field) => (
      total + field.array.length * field.width
    ), 0);
    const totalBytes = headerBytes + fieldHeaderBytes + payloadBytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > PRIVATE_ATLAS_MAXIMUM_BYTES) {
      fail('GREATER_REALM_PRIVATE_ATLAS_TOO_LARGE');
    }
    buffer = Buffer.allocUnsafe(totalBytes);
    let offset = 0;
    buffer.writeUInt16LE(magic.length, offset);
    offset += 2;
    magic.copy(buffer, offset);
    offset += magic.length;
    buffer.writeUInt16LE(PRIVATE_ATLAS_FORMAT_VERSION, offset);
    offset += 2;
    buffer.writeUInt32LE(candidate.grid.cellCount, offset);
    offset += 4;
    buffer.writeUInt16LE(fields.length, offset);
    offset += 2;
    for (const field of fields) {
      const name = Buffer.from(field.name, 'utf8');
      try {
        buffer.writeUInt8(name.length, offset);
        offset += 1;
        name.copy(buffer, offset);
        offset += name.length;
        buffer.writeUInt8(field.type, offset);
        offset += 1;
        buffer.writeUInt32LE(field.array.length, offset);
        offset += 4;
        buffer.writeBigUInt64LE(BigInt(field.array.length * field.width), offset);
        offset += 8;
        offset = writeArray(buffer, offset, field);
      } finally {
        name.fill(0);
      }
    }
    if (offset !== buffer.length) fail('GREATER_REALM_PRIVATE_ATLAS_LENGTH_MISMATCH');
    completed = true;
    return buffer;
  } finally {
    magic.fill(0);
    if (!completed) buffer?.fill(0);
  }
}

function candidateRegionCounts(candidate: GreaterRealmPrivateCandidate): readonly number[] {
  const counts = Array<number>(GREATER_REALM_REGION_SPECS.length).fill(0);
  for (const region of candidate.regionId) {
    if (region >= counts.length) fail('GREATER_REALM_PRIVATE_REGION_INVALID');
    counts[region] = counts[region]! + 1;
  }
  return Object.freeze(counts);
}

const PRIVATE_TOPOGRAPHY_FIELD_NAMES = Object.freeze([
  'geological-barrier-band',
  'tectonic-uplift',
  'rock-resistance',
  'geomorphology-elevation',
  'geomorphology-total-delta',
  'geomorphology-glacial-delta',
  'geomorphology-arid-delta',
  'geomorphology-volcanic-delta',
  'geomorphology-coastal-delta',
  'geomorphology-glacial-mask',
  'geomorphology-arid-mask',
  'geomorphology-volcanic-mask',
  'geomorphology-volcanic-anchor-mask',
  'geomorphology-coastal-mask',
  'geomorphology-coastal-class',
  'geomorphology-temperature',
  'geomorphology-moisture',
  'slope',
  'aspect',
  'profile-curvature',
  'plan-curvature',
  'wetness-index',
  'exposure',
  'distance-to-coast',
  'distance-to-freshwater',
  'watershed-id',
  'ridge-id',
  'temperature',
  'moisture',
] as const);

const PRIVATE_CHUNK_MANIFEST_KEYS = Object.freeze([
  'schema',
  'chunkKey',
  'chunkQ',
  'chunkR',
  'partitionVersion',
  'cellCount',
  'minimumElevationMilli',
  'maximumElevationMilli',
  'regionCellCounts',
  'tierCellCounts',
  'cellIndexDigest',
  'fieldCount',
  'payloadByteCount',
  'payloadDigest',
  'topographyPatchId',
  'topographyPatchDigest',
  'generationVersion',
  'geomorphologyVersion',
  'topographyVersion',
  'active',
] as const);

const PRIVATE_TOPOGRAPHY_PATCH_KEYS = Object.freeze([
  'schema',
  'topographyPatchId',
  'chunkKey',
  'chunkQ',
  'chunkR',
  'partitionVersion',
  'levelOfDetail',
  'sampleWidth',
  'sampleHeight',
  'sampleCount',
  'encodingVersion',
  'minimumElevationMilli',
  'maximumElevationMilli',
  'fieldCount',
  'fieldInventoryDigest',
  'payloadByteCount',
  'payloadDigest',
  'cellIndexDigest',
  'generationVersion',
  'geomorphologyVersion',
  'topographyVersion',
  'active',
  'manifestDigest',
] as const);

function privateTopographyFields(
  candidate: GreaterRealmPrivateCandidate,
): readonly EncodedField[] {
  const byName = new Map(privateFields(candidate).map(field => [field.name, field] as const));
  return Object.freeze(PRIVATE_TOPOGRAPHY_FIELD_NAMES.map(name => {
    const field = byName.get(name);
    if (!field) fail('GREATER_REALM_PRIVATE_TOPOGRAPHY_FIELD_MISSING');
    return field;
  }));
}

function privateChunkPartition(candidate: GreaterRealmPrivateCandidate): readonly PrivateChunk[] {
  const chunks = new Map<string, {
    chunkQ: number;
    chunkR: number;
    cellIndices: number[];
  }>();
  for (let index = 0; index < candidate.grid.cellCount; index += 1) {
    const q = candidate.grid.q[index]!;
    const r = candidate.grid.r[index]!;
    if (
      q < -PRIVATE_CANVAS_RADIUS
      || q > PRIVATE_CANVAS_RADIUS
      || r < -PRIVATE_CANVAS_RADIUS
      || r > PRIVATE_CANVAS_RADIUS
    ) fail('GREATER_REALM_PRIVATE_CHUNK_COORDINATE_INVALID');
    const chunkQ = Math.floor((q + PRIVATE_CANVAS_RADIUS) / PRIVATE_CHUNK_AXIS_SPAN);
    const chunkR = Math.floor((r + PRIVATE_CANVAS_RADIUS) / PRIVATE_CHUNK_AXIS_SPAN);
    const chunkKey = `${chunkQ}:${chunkR}`;
    const chunk = chunks.get(chunkKey) ?? { chunkQ, chunkR, cellIndices: [] };
    chunk.cellIndices.push(index);
    chunks.set(chunkKey, chunk);
  }
  return Object.freeze([...chunks.entries()]
    .sort(([, left], [, right]) => left.chunkQ - right.chunkQ || left.chunkR - right.chunkR)
    .map(([chunkKey, chunk]) => Object.freeze({
      chunkKey,
      chunkQ: chunk.chunkQ,
      chunkR: chunk.chunkR,
      cellIndices: Object.freeze(chunk.cellIndices),
    })));
}

function fieldInventoryDigest(fields: readonly EncodedField[]): string {
  const digest = createHash('sha256').update(
    'warpkeep.greater-realm.private-field-inventory.v1\0',
    'utf8',
  );
  for (const field of fields) {
    if (!encodedFieldHasExactType(field)) fail('GREATER_REALM_PRIVATE_FIELD_INVALID');
    digest.update(field.name, 'utf8');
    digest.update(`\0${field.type}:${field.width}\0`, 'utf8');
  }
  return digest.digest('hex');
}

function cellIndexDigest(
  candidate: GreaterRealmPrivateCandidate,
  cellIndices: readonly number[],
): string {
  const payload = Buffer.allocUnsafe(cellIndices.length * 12);
  try {
    for (let offset = 0; offset < cellIndices.length; offset += 1) {
      const index = cellIndices[offset]!;
      if (index < 0 || index >= candidate.grid.cellCount) {
        fail('GREATER_REALM_PRIVATE_CHUNK_CELL_INVALID');
      }
      payload.writeUInt32LE(index, offset * 12);
      payload.writeInt32LE(candidate.grid.q[index]!, offset * 12 + 4);
      payload.writeInt32LE(candidate.grid.r[index]!, offset * 12 + 8);
    }
    return createHash('sha256')
      .update('warpkeep.greater-realm.private-chunk-cells.v1\0', 'utf8')
      .update(payload)
      .digest('hex');
  } finally {
    payload.fill(0);
  }
}

function fieldPayloadDigest(
  fields: readonly EncodedField[],
  cellIndices: readonly number[],
  domain: string,
): Readonly<{ digest: string; byteCount: number }> {
  const digest = createHash('sha256').update(domain, 'utf8').update('\0', 'utf8');
  let byteCount = 0;
  for (const field of fields) {
    if (!encodedFieldHasExactType(field)) fail('GREATER_REALM_PRIVATE_FIELD_INVALID');
    const header = Buffer.allocUnsafe(10);
    const name = Buffer.from(field.name, 'utf8');
    const payload = Buffer.allocUnsafe(cellIndices.length * field.width);
    try {
      header.writeUInt16LE(name.length, 0);
      header.writeUInt8(field.type, 2);
      header.writeUInt8(field.width, 3);
      header.writeUInt32LE(cellIndices.length, 4);
      header.writeUInt16LE(0, 8);
      digest.update(header);
      digest.update(name);
      let offset = 0;
      for (const index of cellIndices) {
        if (index < 0 || index >= field.array.length) {
          fail('GREATER_REALM_PRIVATE_CHUNK_CELL_INVALID');
        }
        offset = writeFieldValue(payload, offset, field, index);
      }
      if (offset !== payload.length) fail('GREATER_REALM_PRIVATE_FIELD_LENGTH_INVALID');
      digest.update(payload);
      byteCount += payload.length;
      if (!Number.isSafeInteger(byteCount)) fail('GREATER_REALM_PRIVATE_FIELD_LENGTH_INVALID');
    } finally {
      header.fill(0);
      name.fill(0);
      payload.fill(0);
    }
  }
  return Object.freeze({ digest: digest.digest('hex'), byteCount });
}

function digestPrivateManifestEntry(domain: string, value: unknown): string {
  const bytes = Buffer.from(JSON.stringify(canonicalPrivateManifestValue(value)), 'utf8');
  try {
    return createHash('sha256').update(domain, 'utf8').update('\0', 'utf8').update(bytes)
      .digest('hex');
  } finally {
    bytes.fill(0);
  }
}

function candidatePrivateChunkManifests(candidate: GreaterRealmPrivateCandidate) {
  const chunks = privateChunkPartition(candidate);
  const allFields = privateFields(candidate);
  const topographyFields = privateTopographyFields(candidate);
  const topographyInventoryDigest = fieldInventoryDigest(topographyFields);
  const chunkManifests: unknown[] = [];
  const topographyPatchManifests: unknown[] = [];
  for (const chunk of chunks) {
    const regionCellCounts = Array<number>(GREATER_REALM_REGION_SPECS.length).fill(0);
    const tierCellCounts = [0, 0, 0];
    let minimumElevationMilli = Number.POSITIVE_INFINITY;
    let maximumElevationMilli = Number.NEGATIVE_INFINITY;
    let minimumQ = Number.POSITIVE_INFINITY;
    let maximumQ = Number.NEGATIVE_INFINITY;
    let minimumR = Number.POSITIVE_INFINITY;
    let maximumR = Number.NEGATIVE_INFINITY;
    for (const index of chunk.cellIndices) {
      const region = candidate.regionId[index]!;
      const tier = candidate.tierId[index]!;
      if (region >= regionCellCounts.length || tier < 1 || tier > 3) {
        fail('GREATER_REALM_PRIVATE_CHUNK_CLASSIFICATION_INVALID');
      }
      regionCellCounts[region] = regionCellCounts[region]! + 1;
      tierCellCounts[tier - 1] = tierCellCounts[tier - 1]! + 1;
      minimumElevationMilli = Math.min(minimumElevationMilli, candidate.elevation[index]!);
      maximumElevationMilli = Math.max(maximumElevationMilli, candidate.elevation[index]!);
      minimumQ = Math.min(minimumQ, candidate.grid.q[index]!);
      maximumQ = Math.max(maximumQ, candidate.grid.q[index]!);
      minimumR = Math.min(minimumR, candidate.grid.r[index]!);
      maximumR = Math.max(maximumR, candidate.grid.r[index]!);
    }
    if (chunk.cellIndices.length === 0) fail('GREATER_REALM_PRIVATE_CHUNK_EMPTY');
    const cellsDigest = cellIndexDigest(candidate, chunk.cellIndices);
    const topographyPayload = fieldPayloadDigest(
      topographyFields,
      chunk.cellIndices,
      'warpkeep.greater-realm.private-topography-payload.v1',
    );
    const topographyPatchId = `topography:${chunk.chunkKey}`;
    const patchBody = Object.freeze({
      schema: PRIVATE_TOPOGRAPHY_PATCH_SCHEMA,
      topographyPatchId,
      chunkKey: chunk.chunkKey,
      chunkQ: chunk.chunkQ,
      chunkR: chunk.chunkR,
      partitionVersion: PRIVATE_CHUNK_PARTITION_VERSION,
      levelOfDetail: 0,
      sampleWidth: maximumQ - minimumQ + 1,
      sampleHeight: maximumR - minimumR + 1,
      sampleCount: chunk.cellIndices.length,
      encodingVersion: PRIVATE_TOPOGRAPHY_ENCODING_VERSION,
      minimumElevationMilli,
      maximumElevationMilli,
      fieldCount: topographyFields.length,
      fieldInventoryDigest: topographyInventoryDigest,
      payloadByteCount: topographyPayload.byteCount,
      payloadDigest: topographyPayload.digest,
      cellIndexDigest: cellsDigest,
      generationVersion: GREATER_REALM_GENERATOR_VERSION,
      geomorphologyVersion: GREATER_REALM_GEOMORPHOLOGY_VERSION,
      topographyVersion: PRIVATE_TOPOGRAPHY_VERSION,
      active: false,
    });
    const patch = Object.freeze({
      ...patchBody,
      manifestDigest: digestPrivateManifestEntry(
        'warpkeep.greater-realm.private-topography-manifest.v1',
        patchBody,
      ),
    });
    const chunkPayload = fieldPayloadDigest(
      allFields,
      chunk.cellIndices,
      'warpkeep.greater-realm.private-chunk-payload.v1',
    );
    topographyPatchManifests.push(patch);
    chunkManifests.push(Object.freeze({
      schema: PRIVATE_CHUNK_SCHEMA,
      chunkKey: chunk.chunkKey,
      chunkQ: chunk.chunkQ,
      chunkR: chunk.chunkR,
      partitionVersion: PRIVATE_CHUNK_PARTITION_VERSION,
      cellCount: chunk.cellIndices.length,
      minimumElevationMilli,
      maximumElevationMilli,
      regionCellCounts: Object.freeze(regionCellCounts),
      tierCellCounts: Object.freeze(tierCellCounts),
      cellIndexDigest: cellsDigest,
      fieldCount: allFields.length,
      payloadByteCount: chunkPayload.byteCount,
      payloadDigest: chunkPayload.digest,
      topographyPatchId,
      topographyPatchDigest: patch.manifestDigest,
      generationVersion: GREATER_REALM_GENERATOR_VERSION,
      geomorphologyVersion: GREATER_REALM_GEOMORPHOLOGY_VERSION,
      topographyVersion: PRIVATE_TOPOGRAPHY_VERSION,
      active: false,
    }));
  }
  if (chunkManifests.length !== candidate.privateMetrics.chunkCount) {
    fail('GREATER_REALM_PRIVATE_CHUNK_COUNT_MISMATCH');
  }
  return Object.freeze({
    chunkManifests: Object.freeze(chunkManifests),
    topographyPatchManifests: Object.freeze(topographyPatchManifests),
  });
}

export type GreaterRealmCandidatePerformance = Readonly<{
  generationMilliseconds: number;
  processPeakMemoryMiB: number;
}>;

/**
 * Aggregate-only owner review vector captured from a fully verified private
 * package. It deliberately contains no coordinates, seeds, transforms, paths,
 * digests, region identities, or exact hidden-site locations.
 */
export type GreaterRealmVerifiedPrivateShortlistMetrics = Readonly<{
  candidateHandle: string;
  maximumBoundaryRadiusShareBasisPoints: number;
  rotationalSimilarityBasisPoints: number;
  maximumAlignedBoundaryRun: number;
  saltwaterBoundaryBasisPoints: number;
  minimumLargestPassableRegionShareBasisPoints: number;
  maximumMinorPassableFragmentShareBasisPoints: number;
  maximumPassableBoundaryDensityBasisPoints: number;
  maximumPassableTendrilShareBasisPoints: number;
  throneAnchorBarrierClearance: number;
  gateRouteRedundancyProof: boolean;
  measuredMinimumBarrierWidth: number;
  measuredMaximumBarrierWidth: number;
  chunkCount: number;
  chunkPopulationSpread: number;
  chunkUpperTailSpread: number;
  highlandBarrierShareBasisPoints: number;
  barrierMeanElevationAdvantage: number;
  barrierMeanUpliftAdvantage: number;
  ridgeUpliftAlignmentBasisPoints: number;
  riverValleyAlignmentBasisPoints: number;
  landformClimateCompatibilityFloorBasisPoints: number;
  coastalProximityCompatibilityBasisPoints: number;
  coastalClassCount: number;
}>;

function verifiedPrivateShortlistMetrics(
  candidateHandle: string,
  candidate: GreaterRealmPrivateCandidate,
): GreaterRealmVerifiedPrivateShortlistMetrics {
  const privateMetrics = candidate.privateMetrics;
  const geomorphology = privateMetrics.geomorphology;
  return Object.freeze({
    candidateHandle,
    maximumBoundaryRadiusShareBasisPoints:
      privateMetrics.maximumBoundaryRadiusShareBasisPoints,
    rotationalSimilarityBasisPoints: privateMetrics.rotationalSimilarityBasisPoints,
    maximumAlignedBoundaryRun: privateMetrics.maximumAlignedBoundaryRun,
    saltwaterBoundaryBasisPoints: privateMetrics.saltwaterBoundaryBasisPoints,
    minimumLargestPassableRegionShareBasisPoints:
      privateMetrics.minimumLargestPassableRegionShareBasisPoints,
    maximumMinorPassableFragmentShareBasisPoints: Math.max(
      ...privateMetrics.minorPassableFragmentSharesBasisPoints,
    ),
    maximumPassableBoundaryDensityBasisPoints: Math.max(
      ...privateMetrics.passableBoundaryDensityBasisPoints,
    ),
    maximumPassableTendrilShareBasisPoints: Math.max(
      ...privateMetrics.passableTendrilSharesBasisPoints,
    ),
    throneAnchorBarrierClearance: privateMetrics.throneAnchorBarrierClearance,
    gateRouteRedundancyProof: privateMetrics.gateRouteRedundancyProof,
    measuredMinimumBarrierWidth: privateMetrics.measuredMinimumBarrierWidth,
    measuredMaximumBarrierWidth: privateMetrics.measuredMaximumBarrierWidth,
    chunkCount: privateMetrics.chunkCount,
    chunkPopulationSpread:
      privateMetrics.chunkPopulationMaximum - privateMetrics.chunkPopulationMinimum,
    chunkUpperTailSpread:
      privateMetrics.chunkPopulationP95 - privateMetrics.chunkPopulationMedian,
    highlandBarrierShareBasisPoints: privateMetrics.highlandBarrierShareBasisPoints,
    barrierMeanElevationAdvantage: privateMetrics.barrierMeanElevationAdvantage,
    barrierMeanUpliftAdvantage: privateMetrics.barrierMeanUpliftAdvantage,
    ridgeUpliftAlignmentBasisPoints: geomorphology.ridgeUpliftAlignmentBasisPoints,
    riverValleyAlignmentBasisPoints: geomorphology.riverValleyAlignmentBasisPoints,
    landformClimateCompatibilityFloorBasisPoints: Math.min(
      geomorphology.glacialClimateCompatibilityBasisPoints,
      geomorphology.aridClimateCompatibilityBasisPoints,
      geomorphology.volcanicTectonicCompatibilityBasisPoints,
      geomorphology.coastalProximityCompatibilityBasisPoints,
    ),
    coastalProximityCompatibilityBasisPoints:
      geomorphology.coastalProximityCompatibilityBasisPoints,
    coastalClassCount: geomorphology.coastalClassCount,
  });
}

function privatePreviewDistanceToTopographicLand(
  candidate: GreaterRealmPrivateCandidate,
): Uint16Array {
  const distance = new Uint16Array(candidate.grid.cellCount);
  distance.fill(0xffff);
  const queue = new Uint32Array(candidate.grid.cellCount);
  let head = 0;
  let tail = 0;
  let completed = false;
  try {
    for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
      if (candidate.elevation[cell]! <= PRIVATE_PREVIEW_SEA_LEVEL) continue;
      distance[cell] = 0;
      queue[tail++] = cell;
    }
    if (tail === 0) fail('GREATER_REALM_PRIVATE_PREVIEW_LAND_MISSING');
    while (head < tail) {
      const cell = queue[head++]!;
      const nextDistance = distance[cell]! + 1;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = candidate.grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
        distance[neighbor] = nextDistance;
        queue[tail++] = neighbor;
      }
    }
    completed = true;
    return distance;
  } finally {
    queue.fill(0);
    if (!completed) distance.fill(0);
  }
}

export async function renderGreaterRealmPrivatePreview(
  candidate: GreaterRealmPrivateCandidate,
  mode: GreaterRealmPrivatePreviewMode,
): Promise<Buffer> {
  if (!(PRIVATE_PREVIEW_MODES as readonly unknown[]).includes(mode)) {
    fail('GREATER_REALM_PRIVATE_PREVIEW_MODE_INVALID');
  }
  const width = 1_280;
  const height = 1_024;
  const pixels = Buffer.alloc(width * height * 4, 0);
  let watermark: Buffer | undefined;
  let encoded: Buffer | undefined;
  let distanceToTopographicLand: Uint16Array | undefined;
  try {
  for (let pixel = 0; pixel < pixels.length; pixel += 4) {
    pixels[pixel] = PRIVATE_PREVIEW_FOG_COLOR[0];
    pixels[pixel + 1] = PRIVATE_PREVIEW_FOG_COLOR[1];
    pixels[pixel + 2] = PRIVATE_PREVIEW_FOG_COLOR[2];
    pixels[pixel + 3] = 255;
  }
  let minimumQ = Number.POSITIVE_INFINITY;
  let maximumQ = Number.NEGATIVE_INFINITY;
  let minimumR = Number.POSITIVE_INFINITY;
  let maximumR = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < candidate.grid.cellCount; index += 1) {
    minimumQ = Math.min(minimumQ, candidate.grid.q[index]!);
    maximumQ = Math.max(maximumQ, candidate.grid.q[index]!);
    minimumR = Math.min(minimumR, candidate.grid.r[index]!);
    maximumR = Math.max(maximumR, candidate.grid.r[index]!);
  }
  const qSpan = maximumQ - minimumQ + 1;
  const rSpan = maximumR - minimumR + 1;
  const scale = Math.max(1, Math.floor(Math.min((width - 80) / (qSpan + rSpan / 2), (height - 120) / rSpan)));
  const palette = [
    [74, 126, 72], [80, 141, 187], [74, 167, 205], [73, 129, 185],
    [92, 159, 204], [119, 160, 83], [80, 116, 72], [178, 190, 204],
    [188, 157, 92], [151, 104, 64], [99, 121, 82], [201, 184, 110],
    [173, 133, 74], [143, 123, 88], [110, 119, 132], [100, 79, 109],
    [65, 76, 88], [184, 194, 207], [129, 139, 98], [108, 108, 112],
    [36, 74, 126], [59, 112, 161], [77, 145, 187], [124, 91, 142],
  ] as const;
  const regionPalette = [
    [87, 144, 84], [117, 159, 195], [205, 151, 76], [84, 147, 127], [103, 124, 164],
    [151, 96, 80], [92, 112, 82], [116, 103, 126], [85, 121, 142], [116, 84, 135],
  ] as const;
  if (mode === 'regions') {
    distanceToTopographicLand = privatePreviewDistanceToTopographicLand(candidate);
  }
  const gateCells = new Set(candidate.gates.flatMap(gate => [gate.firstCell, gate.secondCell]));
  for (let index = 0; index < candidate.grid.cellCount; index += 1) {
    const x = 40 + Math.round(((candidate.grid.q[index]! - minimumQ) + (candidate.grid.r[index]! - minimumR) / 2) * scale);
    const y = 60 + Math.round((candidate.grid.r[index]! - minimumR) * scale * 0.86);
    let color: readonly [number, number, number] = [44, 49, 64];
    if (mode === 'silhouette') {
      // Rivers and streams are features inside the continental footprint, not
      // coastline cuts. Silhouette review therefore follows sea-level land.
      color = candidate.elevation[index]! > PRIVATE_PREVIEW_SEA_LEVEL
        ? [142, 164, 105]
        : [39, 76, 124];
    } else if (mode === 'hillshade') {
      const shade = clampPreview(90 + Math.floor((candidate.elevation[index]! + 12_000) / 260));
      color = [shade, shade, Math.min(255, shade + 8)];
    } else if (mode === 'biome') {
      color = palette[candidate.biomeId[index]! % palette.length]!;
    } else if (mode === 'hydrology') {
      color = candidate.waterRegime[index] === 0 ? [109, 118, 91] : [48, 132, 205];
    } else if (mode === 'regions') {
      const regime = candidate.waterRegime[index]!;
      if (regime === PRIVATE_PREVIEW_WATER_DRY) {
        color = regionPalette[candidate.regionId[index]!]!;
      } else if (regime === PRIVATE_PREVIEW_WATER_OCEAN) {
        const distance = distanceToTopographicLand?.[index] ?? 0;
        const band = Math.min(5, Math.floor(distance / 4));
        color = [54 - band * 5, 91 - band * 8, 132 - band * 10];
      } else if (
        regime === PRIVATE_PREVIEW_WATER_LAKE
        || regime === PRIVATE_PREVIEW_WATER_SEA
      ) {
        color = [66, 126, 171];
      } else if (
        regime === PRIVATE_PREVIEW_WATER_RIVER
        || regime === PRIVATE_PREVIEW_WATER_STREAM
      ) {
        color = [72, 143, 190];
      } else {
        fail('GREATER_REALM_PRIVATE_PREVIEW_WATER_INVALID');
      }
    } else {
      color = gateCells.has(index)
        ? [236, 194, 82]
        : candidate.barrier[index] === 1
          ? [112, 104, 110]
          : [73, 94, 78];
    }
    for (let offsetY = 0; offsetY < Math.max(1, scale); offsetY += 1) {
      for (let offsetX = 0; offsetX < Math.max(1, scale); offsetX += 1) {
        const targetX = x + offsetX;
        const targetY = y + offsetY;
        if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) continue;
        const pixel = (targetY * width + targetX) * 4;
        pixels[pixel] = color[0];
        pixels[pixel + 1] = color[1];
        pixels[pixel + 2] = color[2];
        pixels[pixel + 3] = 255;
      }
    }
  }
  const sharpModule = await import('sharp');
  const watermarkLabel = mode === 'regions'
    ? 'TOPOLOGY + OUTER-OCEAN PROXY · PRIVATE REVIEW · NOT RUNTIME FOG'
    : `PRIVATE OWNER REVIEW — DO NOT DISTRIBUTE · ${mode.toUpperCase()}`;
  watermark = Buffer.from(
    `<svg width="${width}" height="${height}"><rect width="100%" height="44" y="${height - 44}" fill="#0b0d16" fill-opacity="0.84"/><text x="32" y="${height - 15}" fill="#e0b85d" font-family="sans-serif" font-size="20" letter-spacing="3">${watermarkLabel}</text></svg>`,
    'utf8',
  );
    encoded = await sharpModule.default(pixels, { raw: { width, height, channels: 4 } })
      .composite([{ input: watermark }])
      // Preserve the explicit, fully opaque alpha channel. Palette encoding
      // silently collapses an all-255 alpha channel to RGB, which breaks the
      // fail-closed preview contract and makes opacity impossible to attest.
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
      .toBuffer();
    return markPrivatePreviewPng(encoded);
  } finally {
    pixels.fill(0);
    watermark?.fill(0);
    encoded?.fill(0);
    distanceToTopographicLand?.fill(0);
  }
}

function clampPreview(value: number): number {
  return Math.max(28, Math.min(236, value));
}

export async function writeGreaterRealmPrivateCandidate(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  batchHandle: string;
  candidateHandle: string;
  sourceCommit: string;
  candidate: GreaterRealmPrivateCandidate;
  performance: GreaterRealmCandidatePerformance;
}>): Promise<Readonly<{ atlasDigest: string; manifestDigest: string }>> {
  if (
    !BATCH_HANDLE_PATTERN.test(input.batchHandle)
    || !CANDIDATE_HANDLE_PATTERN.test(input.candidateHandle)
    || !SOURCE_COMMIT_PATTERN.test(input.sourceCommit)
    || !Number.isSafeInteger(input.candidate.candidateOrdinal)
    || input.candidate.candidateOrdinal < 0
    || input.candidate.candidateOrdinal > 255
    || !Number.isSafeInteger(input.candidate.grid.cellCount)
    || input.candidate.grid.cellCount < 100_000
    || input.candidate.grid.cellCount > 150_000
    || input.candidate.aggregate.activeCellCount !== input.candidate.grid.cellCount
    || input.candidate.seedMaterial.byteLength !== 32
    || input.candidate.aggregate.eligible !== true
    || !Number.isSafeInteger(input.performance.generationMilliseconds)
    || input.performance.generationMilliseconds < 100
    || input.performance.generationMilliseconds % 100 !== 0
    || input.performance.generationMilliseconds > 7 * 24 * 60 * 60 * 1_000
    || !Number.isSafeInteger(input.performance.processPeakMemoryMiB)
    || input.performance.processPeakMemoryMiB < 1
    || input.performance.processPeakMemoryMiB > 1_048_576
    || (
      input.performance.processPeakMemoryMiB !== 1
      && input.performance.processPeakMemoryMiB % 8 !== 0
    )
  ) fail('GREATER_REALM_PRIVATE_PACKAGE_INPUT_INVALID');
  const base = `batches/${input.batchHandle}/candidates/${input.candidateHandle}`;
  const throneAnchor = expectedThroneAnchorManifest(input.candidate);
  const toolchainVersions = await privateToolchainVersions();
  const privateManifests = candidatePrivateChunkManifests(input.candidate);
  input.workspace.ensureDirectory(base);
  const atlas = serializeGreaterRealmPrivateAtlas(input.candidate);
  let atlasDigest = '';
  try {
    atlasDigest = createHash('sha256').update(atlas).digest('hex');
    const candidateSeedEnvelope = encodeGreaterRealmPrivateSeed(
      input.candidate.seedMaterial,
      'candidate',
    );
    try {
      input.workspace.writeFileAtomic(
        `${base}/seed.bin`,
        candidateSeedEnvelope,
        GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
      );
    } finally {
      candidateSeedEnvelope.fill(0);
    }
    input.workspace.writeFileAtomic(
      `${base}/atlas.wkgr-atlas`,
      atlas,
      PRIVATE_ATLAS_MAXIMUM_BYTES,
    );
  } finally {
    atlas.fill(0);
  }
  const previewDigestEntries: Array<readonly [GreaterRealmPrivatePreviewMode, string]> = [];
  for (const mode of PRIVATE_PREVIEW_MODES) {
    const preview = await renderGreaterRealmPrivatePreview(input.candidate, mode);
    try {
      previewDigestEntries.push(Object.freeze([
        mode,
        createHash('sha256').update(preview).digest('hex'),
      ]));
      input.workspace.writeFileAtomic(
        `${base}/previews/private-preview-${mode}.png`,
        preview,
        PRIVATE_PREVIEW_MAXIMUM_BYTES,
      );
    } finally {
      preview.fill(0);
    }
  }
  const manifest = Object.freeze({
    kind: GREATER_REALM_PRIVATE_MANIFEST_KIND,
    formatVersion: PRIVATE_ATLAS_FORMAT_VERSION,
    generatorVersion: GREATER_REALM_GENERATOR_VERSION,
    geomorphologyVersion: GREATER_REALM_GEOMORPHOLOGY_VERSION,
    sourceCommit: input.sourceCommit,
    batchHandle: input.batchHandle,
    candidateHandle: input.candidateHandle,
    candidateOrdinal: input.candidate.candidateOrdinal,
    seedDigest: createHash('sha256').update(input.candidate.seedMaterial).digest('hex'),
    seedNamespace: GREATER_REALM_TERRAIN_SEED_NAMESPACE,
    provenanceDigest: privateProvenanceDigest({
      batchHandle: input.batchHandle,
      sourceCommit: input.sourceCommit,
      candidateOrdinal: input.candidate.candidateOrdinal,
      seedMaterial: input.candidate.seedMaterial,
    }),
    canvas: Object.freeze({
      kind: 'private-axial-disc',
      radius: PRIVATE_CANVAS_RADIUS,
      workingCells: 219_511,
    }),
    exactActiveCellCount: input.candidate.grid.cellCount,
    regionSpecs: GREATER_REALM_REGION_SPECS,
    exactRegionCellCounts: candidateRegionCounts(input.candidate),
    chunkManifests: privateManifests.chunkManifests,
    topographyPatchManifests: privateManifests.topographyPatchManifests,
    toolchainVersions,
    legacyLowlands: Object.freeze({
      schema: GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_SCHEMA,
      transform: input.candidate.legacyLowlandsTransform,
      lockPins: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
    }),
    domains: input.candidate.domains,
    tierOneSemanticPermutation: input.candidate.tierOneSemanticPermutation,
    throneAnchor,
    gateGraph: input.candidate.gateGraph,
    barrierCrossSections: input.candidate.barrierCrossSections,
    gates: input.candidate.gates.map(gate => Object.freeze({
      ...gate,
      firstQ: input.candidate.grid.q[gate.firstCell],
      firstR: input.candidate.grid.r[gate.firstCell],
      secondQ: input.candidate.grid.q[gate.secondCell],
      secondR: input.candidate.grid.r[gate.secondCell],
    })),
    stageDigests: input.candidate.stageDigests,
    atlasDigest,
    previewDigests: Object.freeze(Object.fromEntries(previewDigestEntries)),
    aggregate: input.candidate.aggregate,
    privateMetrics: input.candidate.privateMetrics,
    performance: input.performance,
  });
  const manifestBytes = serializeCanonicalPrivateManifest(manifest);
  let manifestDigest = '';
  try {
    if (manifestBytes.length > PRIVATE_MANIFEST_MAXIMUM_BYTES) {
      fail('GREATER_REALM_PRIVATE_MANIFEST_TOO_LARGE');
    }
    manifestDigest = createHash('sha256').update(manifestBytes).digest('hex');
    input.workspace.writeFileAtomic(
      `${base}/manifest.private.json`,
      manifestBytes,
      PRIVATE_MANIFEST_MAXIMUM_BYTES,
    );
  } finally {
    manifestBytes.fill(0);
  }
  if (!SHA256_PATTERN.test(manifestDigest)) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  return Object.freeze({ atlasDigest, manifestDigest });
}

function readUInt16(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 2 > buffer.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  return buffer.readUInt16LE(offset);
}

function readUInt32(buffer: Buffer, offset: number): number {
  if (offset < 0 || offset + 4 > buffer.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  return buffer.readUInt32LE(offset);
}

function readUInt64(buffer: Buffer, offset: number): bigint {
  if (offset < 0 || offset + 8 > buffer.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  return buffer.readBigUInt64LE(offset);
}

function verifyPrivateAtlasBinary(atlas: Buffer, expectedCellCount: number): void {
  const fields = [
    ['q', 5, 4],
    ['r', 5, 4],
    ['bedrock-elevation', 5, 4],
    ['erosion-elevation', 5, 4],
    ['filled-elevation', 5, 4],
    ['sediment-depth', 4, 2],
    ['flow-receiver', 5, 4],
    ['flow-accumulation', 8, 8],
    ['domain-id', 2, 1],
    ['geology-id', 2, 1],
    ['region-id', 2, 1],
    ['tier-id', 2, 1],
    ['water-regime', 2, 1],
    ['biome-id', 2, 1],
    ['landform-id', 2, 1],
    ['barrier', 2, 1],
    ['geological-barrier-band', 2, 1],
    ['castle-slot', 2, 1],
    ['resource-potential', 2, 1],
    ['core-potential', 2, 1],
    ['throne-anchor', 2, 1],
    ['legacy-lowlands-cell', 2, 1],
    ['legacy-lowlands-protected-cell', 2, 1],
    ['legacy-lowlands-reserve-cell', 2, 1],
    ['legacy-lowlands-castle-slot', 2, 1],
    ['tectonic-uplift', 5, 4],
    ['rock-resistance', 5, 4],
    ['geomorphology-elevation', 5, 4],
    ['geomorphology-total-delta', 5, 4],
    ['geomorphology-glacial-delta', 5, 4],
    ['geomorphology-arid-delta', 5, 4],
    ['geomorphology-volcanic-delta', 5, 4],
    ['geomorphology-coastal-delta', 5, 4],
    ['geomorphology-glacial-mask', 2, 1],
    ['geomorphology-arid-mask', 2, 1],
    ['geomorphology-volcanic-mask', 2, 1],
    ['geomorphology-volcanic-anchor-mask', 2, 1],
    ['geomorphology-coastal-mask', 2, 1],
    ['geomorphology-coastal-class', 2, 1],
    ['geomorphology-temperature', 5, 4],
    ['geomorphology-moisture', 5, 4],
    ['slope', 4, 2],
    ['aspect', 2, 1],
    ['profile-curvature', 5, 4],
    ['plan-curvature', 5, 4],
    ['wetness-index', 4, 2],
    ['exposure', 5, 4],
    ['distance-to-coast', 4, 2],
    ['distance-to-freshwater', 4, 2],
    ['watershed-id', 5, 4],
    ['ridge-id', 5, 4],
    ['temperature', 5, 4],
    ['moisture', 5, 4],
  ] as const;
  let offset = 0;
  const magicLength = readUInt16(atlas, offset);
  offset += 2;
  if (magicLength !== Buffer.byteLength(GREATER_REALM_PRIVATE_PACKAGE_MAGIC, 'ascii')) {
    fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  }
  if (offset + magicLength > atlas.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  const magic = atlas.subarray(offset, offset + magicLength).toString('ascii');
  offset += magicLength;
  const version = readUInt16(atlas, offset);
  offset += 2;
  const cellCount = readUInt32(atlas, offset);
  offset += 4;
  const fieldCount = readUInt16(atlas, offset);
  offset += 2;
  if (
    magic !== GREATER_REALM_PRIVATE_PACKAGE_MAGIC
    || version !== PRIVATE_ATLAS_FORMAT_VERSION
    || cellCount !== expectedCellCount
    || fieldCount !== fields.length
  ) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
  for (const [expectedName, expectedType, expectedWidth] of fields) {
    if (offset + 1 > atlas.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    const nameLength = atlas.readUInt8(offset);
    offset += 1;
    if (nameLength === 0 || offset + nameLength > atlas.length) {
      fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    }
    const name = atlas.subarray(offset, offset + nameLength).toString('utf8');
    offset += nameLength;
    if (offset + 1 > atlas.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    const type = atlas.readUInt8(offset);
    offset += 1;
    const length = readUInt32(atlas, offset);
    offset += 4;
    const byteLength = readUInt64(atlas, offset);
    offset += 8;
    const expectedBytes = BigInt(expectedCellCount * expectedWidth);
    if (
      name !== expectedName
      || type !== expectedType
      || length !== expectedCellCount
      || byteLength !== expectedBytes
      || byteLength > BigInt(Number.MAX_SAFE_INTEGER)
      || offset + Number(byteLength) > atlas.length
    ) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    offset += Number(byteLength);
  }
  if (offset !== atlas.length) fail('GREATER_REALM_PRIVATE_ATLAS_INVALID');
}

type UnknownPrivateManifest = Readonly<Record<string, unknown>>;

function privateManifest(value: unknown): UnknownPrivateManifest {
  return exactRecord(value, PRIVATE_MANIFEST_KEYS);
}

function expectedGateManifest(candidate: GreaterRealmPrivateCandidate) {
  return candidate.gates.map(gate => Object.freeze({
    ...gate,
    firstQ: candidate.grid.q[gate.firstCell],
    firstR: candidate.grid.r[gate.firstCell],
    secondQ: candidate.grid.q[gate.secondCell],
    secondR: candidate.grid.r[gate.secondCell],
  }));
}

function expectedThroneAnchorManifest(candidate: GreaterRealmPrivateCandidate) {
  let anchorCell = -1;
  for (let cell = 0; cell < candidate.grid.cellCount; cell += 1) {
    const marker = candidate.throneAnchor[cell]!;
    if (marker !== 0 && marker !== 1) fail('GREATER_REALM_PRIVATE_THRONE_ANCHOR_INVALID');
    if (marker !== 1) continue;
    if (anchorCell !== -1) fail('GREATER_REALM_PRIVATE_THRONE_ANCHOR_INVALID');
    anchorCell = cell;
  }
  if (
    anchorCell < 0
    || candidate.tierId[anchorCell] !== 3
    || candidate.regionId[anchorCell] !== GREATER_REALM_REGION_SPECS.length - 1
    || candidate.waterRegime[anchorCell] !== 0
    || candidate.barrier[anchorCell] !== 0
  ) fail('GREATER_REALM_PRIVATE_THRONE_ANCHOR_INVALID');
  return Object.freeze({
    dormant: true as const,
    cell: anchorCell,
    q: candidate.grid.q[anchorCell],
    r: candidate.grid.r[anchorCell],
    regionId: candidate.regionId[anchorCell],
    tierId: candidate.tierId[anchorCell],
  });
}

export function clearGreaterRealmPrivateCandidateBuffers(
  candidate: GreaterRealmPrivateCandidate,
): void {
  clearGreaterRealmCandidateSecret(candidate);
  for (const gate of candidate.gates) {
    for (const path of [
      gate.firstApproachPath,
      gate.firstAlternateApproachPath,
      gate.secondApproachPath,
      gate.secondAlternateApproachPath,
    ]) {
      (path as number[]).fill(0);
    }
  }
  for (const crossSection of candidate.barrierCrossSections) {
    (crossSection.cells as number[]).fill(0);
  }
  candidate.grid.clearIndex?.();
  new Uint8Array(
    candidate.grid.neighbors.buffer,
    candidate.grid.neighbors.byteOffset,
    candidate.grid.neighbors.byteLength,
  ).fill(0);
  for (const field of privateFields(candidate)) {
    new Uint8Array(
      field.array.buffer,
      field.array.byteOffset,
      field.array.byteLength,
    ).fill(0);
  }
}

function assertPrivateCandidateInventory(
  workspace: GreaterRealmPrivateWorkspace,
  base: string,
): void {
  const attestation = workspace.attestTree(base);
  if (
    attestation.fileCount !== 9
    || attestation.directoryCount !== 2
    || attestation.entryCount !== 11
    || attestation.byteCount < GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES
      + PNG_SIGNATURE.length * PRIVATE_PREVIEW_MODES.length
    || attestation.byteCount > PRIVATE_CANDIDATE_MAXIMUM_BYTES
  ) fail('GREATER_REALM_PRIVATE_PACKAGE_INVENTORY_INVALID');
}

function assertManifestPerformance(value: unknown): void {
  const performance = exactRecord(value, [
    'generationMilliseconds',
    'processPeakMemoryMiB',
  ]);
  if (
    !Number.isSafeInteger(performance.generationMilliseconds)
    || (performance.generationMilliseconds as number) < 100
    || (performance.generationMilliseconds as number) % 100 !== 0
    || (performance.generationMilliseconds as number) > 7 * 24 * 60 * 60 * 1_000
    || !Number.isSafeInteger(performance.processPeakMemoryMiB)
    || (performance.processPeakMemoryMiB as number) < 1
    || (performance.processPeakMemoryMiB as number) > 1_048_576
    || (
      performance.processPeakMemoryMiB !== 1
      && (performance.processPeakMemoryMiB as number) % 8 !== 0
    )
  ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
}

function assertPrivateChunkManifestCollections(
  manifest: UnknownPrivateManifest,
  expectedCandidate: GreaterRealmPrivateCandidate,
  expectedToolchainVersions: Awaited<ReturnType<typeof privateToolchainVersions>>,
): void {
  if (
    !Array.isArray(manifest.chunkManifests)
    || !Array.isArray(manifest.topographyPatchManifests)
    || Object.getPrototypeOf(manifest.chunkManifests) !== Array.prototype
    || Object.getPrototypeOf(manifest.topographyPatchManifests) !== Array.prototype
  ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  const expected = candidatePrivateChunkManifests(expectedCandidate);
  if (
    manifest.chunkManifests.length !== expected.chunkManifests.length
    || manifest.topographyPatchManifests.length !== expected.topographyPatchManifests.length
    || manifest.chunkManifests.length !== expectedCandidate.privateMetrics.chunkCount
  ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  for (let index = 0; index < manifest.chunkManifests.length; index += 1) {
    const chunk = exactRecord(
      manifest.chunkManifests[index],
      PRIVATE_CHUNK_MANIFEST_KEYS,
    );
    if (
      chunk.schema !== PRIVATE_CHUNK_SCHEMA
      || typeof chunk.payloadDigest !== 'string'
      || !SHA256_PATTERN.test(chunk.payloadDigest)
      || typeof chunk.cellIndexDigest !== 'string'
      || !SHA256_PATTERN.test(chunk.cellIndexDigest)
      || typeof chunk.topographyPatchDigest !== 'string'
      || !SHA256_PATTERN.test(chunk.topographyPatchDigest)
      || chunk.active !== false
      || !exactJsonEqual(chunk, expected.chunkManifests[index])
    ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  }
  for (let index = 0; index < manifest.topographyPatchManifests.length; index += 1) {
    const patch = exactRecord(
      manifest.topographyPatchManifests[index],
      PRIVATE_TOPOGRAPHY_PATCH_KEYS,
    );
    const patchBody = Object.fromEntries(Object.entries(patch)
      .filter(([key]) => key !== 'manifestDigest'));
    if (
      patch.schema !== PRIVATE_TOPOGRAPHY_PATCH_SCHEMA
      || typeof patch.payloadDigest !== 'string'
      || !SHA256_PATTERN.test(patch.payloadDigest)
      || typeof patch.cellIndexDigest !== 'string'
      || !SHA256_PATTERN.test(patch.cellIndexDigest)
      || typeof patch.fieldInventoryDigest !== 'string'
      || !SHA256_PATTERN.test(patch.fieldInventoryDigest)
      || typeof patch.manifestDigest !== 'string'
      || !SHA256_PATTERN.test(patch.manifestDigest)
      || patch.manifestDigest !== digestPrivateManifestEntry(
        'warpkeep.greater-realm.private-topography-manifest.v1',
        patchBody,
      )
      || patch.active !== false
      || !exactJsonEqual(patch, expected.topographyPatchManifests[index])
    ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  }
  const toolchainVersions = exactRecord(
    manifest.toolchainVersions,
    PRIVATE_TOOLCHAIN_VERSION_KEYS,
  );
  if (!exactJsonEqual(toolchainVersions, expectedToolchainVersions)) {
    fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  }
}

/** Re-hash and structurally verify one owner-only candidate package. */
export async function verifyGreaterRealmPrivateCandidatePackage(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  batchHandle: string;
  candidateHandle: string;
  expectedCandidateOrdinal: number;
  sourceCommit: string;
  expectedBatchSeedDigest: string;
  expectedActiveCellCount: number;
  expectedAggregate: GreaterRealmPrivateCandidate['aggregate'];
  expectedPerformance: GreaterRealmCandidatePerformance;
  expectedAtlasDigest: string;
  expectedManifestDigest: string;
  onVerifiedPrivateShortlistMetrics?: (
    metrics: GreaterRealmVerifiedPrivateShortlistMetrics,
  ) => void;
}>): Promise<Readonly<{ atlasDigest: string; manifestDigest: string }>> {
  if (
    !BATCH_HANDLE_PATTERN.test(input.batchHandle)
    || !CANDIDATE_HANDLE_PATTERN.test(input.candidateHandle)
    || !SHA256_PATTERN.test(input.expectedAtlasDigest)
    || !SHA256_PATTERN.test(input.expectedManifestDigest)
    || !SHA256_PATTERN.test(input.expectedBatchSeedDigest)
    || !SOURCE_COMMIT_PATTERN.test(input.sourceCommit)
    || !Number.isSafeInteger(input.expectedCandidateOrdinal)
    || input.expectedCandidateOrdinal < 0
    || input.expectedCandidateOrdinal > 255
    || !Number.isSafeInteger(input.expectedActiveCellCount)
    || input.expectedActiveCellCount < 100_000
    || input.expectedActiveCellCount > 150_000
    || (
      input.onVerifiedPrivateShortlistMetrics !== undefined
      && typeof input.onVerifiedPrivateShortlistMetrics !== 'function'
    )
  ) fail('GREATER_REALM_PRIVATE_PACKAGE_EXPECTATION_INVALID');
  const base = `batches/${input.batchHandle}/candidates/${input.candidateHandle}`;
  let batchSeedEnvelope: Buffer | undefined;
  let candidateSeedEnvelope: Buffer | undefined;
  let batchSeed: Buffer | undefined;
  let derivedSeed: Buffer | undefined;
  let seed: Buffer | undefined;
  let atlas: Buffer | undefined;
  let expectedAtlas: Buffer | undefined;
  let manifestBytes: Buffer | undefined;
  let canonicalManifestBytes: Buffer | undefined;
  let expectedCandidate: GreaterRealmPrivateCandidate | undefined;
  try {
    assertPrivateCandidateInventory(input.workspace, base);
    batchSeedEnvelope = input.workspace.readFile(
      `batches/${input.batchHandle}/batch-seed.bin`,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    candidateSeedEnvelope = input.workspace.readFile(
      `${base}/seed.bin`,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    batchSeed = decodeGreaterRealmPrivateSeed(batchSeedEnvelope, 'batch');
    seed = decodeGreaterRealmPrivateSeed(candidateSeedEnvelope, 'candidate');
    atlas = input.workspace.readFile(`${base}/atlas.wkgr-atlas`, PRIVATE_ATLAS_MAXIMUM_BYTES);
    manifestBytes = input.workspace.readFile(
      `${base}/manifest.private.json`,
      PRIVATE_MANIFEST_MAXIMUM_BYTES,
    );
    if (batchSeed.length !== 32 || seed.length !== 32) {
      fail('GREATER_REALM_PRIVATE_PACKAGE_INVALID');
    }
    if (
      createHash('sha256').update(batchSeed).digest('hex')
        !== input.expectedBatchSeedDigest
    ) fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
    derivedSeed = deriveCandidateSeedMaterial(batchSeed, input.expectedCandidateOrdinal);
    if (!safeBufferEqual(seed, derivedSeed)) fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
    expectedCandidate = generateGreaterRealmCandidate({
      rootSeed: batchSeed,
      candidateOrdinal: input.expectedCandidateOrdinal,
    });
    if (
      !safeBufferEqual(expectedCandidate.seedMaterial, derivedSeed)
      || expectedCandidate.grid.cellCount !== input.expectedActiveCellCount
      || expectedCandidate.aggregate.eligible !== true
      || !exactJsonEqual(expectedCandidate.aggregate, input.expectedAggregate)
    ) fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
    expectedAtlas = serializeGreaterRealmPrivateAtlas(expectedCandidate);
    const atlasDigest = createHash('sha256').update(atlas).digest('hex');
    const manifestDigest = createHash('sha256').update(manifestBytes).digest('hex');
    if (
      atlasDigest !== input.expectedAtlasDigest
      || manifestDigest !== input.expectedManifestDigest
    ) fail('GREATER_REALM_PRIVATE_PACKAGE_DIGEST_MISMATCH');
    verifyPrivateAtlasBinary(atlas, input.expectedActiveCellCount);
    if (!safeBufferEqual(atlas, expectedAtlas)) {
      fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(manifestBytes.toString('utf8'));
    } catch {
      fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    }
    canonicalManifestBytes = serializeCanonicalPrivateManifest(parsed);
    if (!safeBufferEqual(manifestBytes, canonicalManifestBytes)) {
      fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    }
    const manifest = privateManifest(parsed);
    const expectedSeedDigest = createHash('sha256').update(derivedSeed).digest('hex');
    const expectedProvenanceDigest = privateProvenanceDigest({
      batchHandle: input.batchHandle,
      sourceCommit: input.sourceCommit,
      candidateOrdinal: input.expectedCandidateOrdinal,
      seedMaterial: derivedSeed,
    });
    if (
      manifest.kind !== GREATER_REALM_PRIVATE_MANIFEST_KIND
      || manifest.formatVersion !== PRIVATE_ATLAS_FORMAT_VERSION
      || manifest.generatorVersion !== GREATER_REALM_GENERATOR_VERSION
      || manifest.geomorphologyVersion !== GREATER_REALM_GEOMORPHOLOGY_VERSION
      || manifest.sourceCommit !== input.sourceCommit
      || manifest.batchHandle !== input.batchHandle
      || manifest.candidateHandle !== input.candidateHandle
      || manifest.candidateOrdinal !== input.expectedCandidateOrdinal
      || manifest.exactActiveCellCount !== input.expectedActiveCellCount
      || manifest.atlasDigest !== atlasDigest
      || manifest.seedDigest !== expectedSeedDigest
      || manifest.seedNamespace !== GREATER_REALM_TERRAIN_SEED_NAMESPACE
      || manifest.provenanceDigest !== expectedProvenanceDigest
      || !exactJsonEqual(manifest.canvas, {
        kind: 'private-axial-disc',
        radius: PRIVATE_CANVAS_RADIUS,
        workingCells: 219_511,
      })
      || !exactJsonEqual(manifest.regionSpecs, GREATER_REALM_REGION_SPECS)
      || !exactJsonEqual(manifest.exactRegionCellCounts, candidateRegionCounts(expectedCandidate))
      || !exactJsonEqual(manifest.legacyLowlands, {
        schema: GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_SCHEMA,
        transform: expectedCandidate.legacyLowlandsTransform,
        lockPins: GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
      })
      || !exactJsonEqual(manifest.domains, expectedCandidate.domains)
      || !exactJsonEqual(
        manifest.tierOneSemanticPermutation,
        expectedCandidate.tierOneSemanticPermutation,
      )
      || !exactJsonEqual(manifest.throneAnchor, expectedThroneAnchorManifest(expectedCandidate))
      || !exactJsonEqual(manifest.gateGraph, expectedCandidate.gateGraph)
      || !exactJsonEqual(
        manifest.barrierCrossSections,
        expectedCandidate.barrierCrossSections,
      )
      || !exactJsonEqual(manifest.gates, expectedGateManifest(expectedCandidate))
      || !exactJsonEqual(manifest.stageDigests, expectedCandidate.stageDigests)
      || !exactJsonEqual(manifest.aggregate, expectedCandidate.aggregate)
      || !exactJsonEqual(manifest.privateMetrics, expectedCandidate.privateMetrics)
    ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    assertPrivateChunkManifestCollections(
      manifest,
      expectedCandidate,
      await privateToolchainVersions(),
    );
    assertManifestPerformance(manifest.performance);
    if (!exactJsonEqual(manifest.performance, input.expectedPerformance)) {
      fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    }
    const previewDigests = exactRecord(manifest.previewDigests, PRIVATE_PREVIEW_MODES);
    if (
      PRIVATE_PREVIEW_MODES.some(mode => (
        typeof previewDigests[mode] !== 'string'
        || !SHA256_PATTERN.test(previewDigests[mode])
      ))
    ) fail('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    const sharpModule = await import('sharp');
    for (const mode of PRIVATE_PREVIEW_MODES) {
      let preview: Buffer | undefined;
      let expectedPreview: Buffer | undefined;
      try {
        expectedPreview = await renderGreaterRealmPrivatePreview(expectedCandidate, mode);
        if (expectedPreview.length > PRIVATE_PREVIEW_MAXIMUM_BYTES) {
          fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
        }
        preview = input.workspace.readFile(
          `${base}/previews/private-preview-${mode}.png`,
          expectedPreview.length,
        );
        // Do not feed owner-workspace bytes into a PNG parser until they match
        // the deterministic renderer output exactly. This also bounds all CRC
        // work to the expected encoded size rather than the broad file cap.
        if (!safeBufferEqual(preview, expectedPreview)) {
          fail('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
        }
        if (
          preview.length < PNG_SIGNATURE.length
          || !preview.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
          || !hasValidPrivatePreviewMarker(preview)
          || createHash('sha256').update(preview).digest('hex') !== previewDigests[mode]
        ) {
          fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
        }
        try {
          const metadata = await sharpModule.default(
            preview,
            { failOn: 'error', limitInputPixels: true },
          )
            .metadata();
          if (
            metadata.format !== 'png'
            || metadata.width !== 1_280
            || metadata.height !== 1_024
            || metadata.hasAlpha !== true
            || (metadata.pages !== undefined && metadata.pages !== 1)
          ) fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
        } catch {
          fail('GREATER_REALM_PRIVATE_PREVIEW_INVALID');
        }
      } finally {
        expectedPreview?.fill(0);
        preview?.fill(0);
      }
    }
    input.onVerifiedPrivateShortlistMetrics?.(
      verifiedPrivateShortlistMetrics(input.candidateHandle, expectedCandidate),
    );
    return Object.freeze({ atlasDigest, manifestDigest });
  } finally {
    batchSeedEnvelope?.fill(0);
    candidateSeedEnvelope?.fill(0);
    batchSeed?.fill(0);
    derivedSeed?.fill(0);
    seed?.fill(0);
    atlas?.fill(0);
    expectedAtlas?.fill(0);
    manifestBytes?.fill(0);
    canonicalManifestBytes?.fill(0);
    if (expectedCandidate) clearGreaterRealmPrivateCandidateBuffers(expectedCandidate);
  }
}
