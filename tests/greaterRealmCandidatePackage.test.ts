// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_GENERATOR_VERSION,
  GREATER_REALM_TERRAIN_SEED_NAMESPACE,
  deriveGreaterRealmCandidateSeedMaterial,
  generateGreaterRealmCandidate,
  type GreaterRealmPrivateCandidate,
} from '../scripts/atlas/greater-realm-candidate-generator';
import {
  GREATER_REALM_PRIVATE_PREVIEW_MARKER,
  clearGreaterRealmPrivateCandidateBuffers,
  renderGreaterRealmPrivatePreview,
  serializeGreaterRealmPrivateAtlas,
  verifyGreaterRealmPrivateCandidatePackage,
  writeGreaterRealmPrivateCandidate,
  type GreaterRealmCandidatePerformance,
  type GreaterRealmVerifiedPrivateShortlistMetrics,
} from '../scripts/atlas/greater-realm-candidate-package';
import {
  openGreaterRealmPrivateWorkspace,
  type GreaterRealmPrivateWorkspace,
} from '../scripts/atlas/greater-realm-private-workspace';
import {
  GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
  encodeGreaterRealmPrivateSeed,
} from '../scripts/atlas/greater-realm-private-seed';

const SOURCE_COMMIT = 'a'.repeat(40);
const BATCH_HANDLE = 'GR-B-AAAAAAAAAAAAAAAA';
const CANDIDATE_HANDLE = 'GR-A-AAAAAAAAAAAAAAAA';
const CANDIDATE_ROOT_LABEL = 'greater-realm-ordinary-parent-a';
const CANDIDATE_ORDINAL = 9;
const PERFORMANCE = Object.freeze({
  generationMilliseconds: 1_200,
  processPeakMemoryMiB: 512,
});
const TOOLCHAIN_LOCK_PATH = join(
  import.meta.dirname,
  '..',
  'scripts',
  'atlas',
  'greater-realm-toolchain-lock.json',
);
const TOOLCHAIN_LOCK_SHA256 = createHash('sha256')
  .update(readFileSync(TOOLCHAIN_LOCK_PATH))
  .digest('hex');
const priorToolchainReceipt = process.env.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT;
const priorToolchainProfile = process.env.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE;

// Full-repository runs exercise renderer and database suites in parallel. A
// package verification intentionally regenerates a 100k+ cell candidate, so
// retain strict assertions while giving those fail-closed checks enough wall
// time under shared CI load.
vi.setConfig({ testTimeout: 45_000 });

const temporaryRoots: string[] = [];
let repositoryRoot = '';
let workspace: GreaterRealmPrivateWorkspace | undefined;
let candidate: GreaterRealmPrivateCandidate | undefined;
let atlasDigest = '';
let manifestDigest = '';
let batchSeedDigest = '';

type GreaterRealmV5ManifestAuthority = {
  barrierCrossSections: Array<{ cells: number[] }>;
  gates: Array<{
    firstApproachPath: number[];
    firstAlternateApproachPath: number[];
    secondApproachPath: number[];
    secondAlternateApproachPath: number[];
  }>;
};

function privateAtlasFormatVersion(atlas: Buffer): number {
  const magicLength = atlas.readUInt16LE(0);
  return atlas.readUInt16LE(2 + magicLength);
}

function privateAtlasFieldNames(atlas: Buffer): readonly string[] {
  let offset = 0;
  const magicLength = atlas.readUInt16LE(offset);
  offset += 2 + magicLength + 2;
  const cellCount = atlas.readUInt32LE(offset);
  offset += 4;
  const fieldCount = atlas.readUInt16LE(offset);
  offset += 2;
  const names: string[] = [];
  for (let fieldIndex = 0; fieldIndex < fieldCount; fieldIndex += 1) {
    const nameLength = atlas.readUInt8(offset);
    offset += 1;
    names.push(atlas.subarray(offset, offset + nameLength).toString('utf8'));
    offset += nameLength + 1;
    const length = atlas.readUInt32LE(offset);
    offset += 4;
    const byteLength = Number(atlas.readBigUInt64LE(offset));
    offset += 8;
    if (length !== cellCount || !Number.isSafeInteger(byteLength)) {
      throw new Error('GREATER_REALM_PRIVATE_ATLAS_TEST_INVENTORY_INVALID');
    }
    offset += byteLength;
  }
  if (offset !== atlas.length) {
    throw new Error('GREATER_REALM_PRIVATE_ATLAS_TEST_INVENTORY_INVALID');
  }
  return Object.freeze(names);
}

function candidateRoot(): Uint8Array {
  return Uint8Array.from(createHash('sha256')
    .update(`${CANDIDATE_ROOT_LABEL}\0`, 'utf8')
    .digest());
}

function requireFixture(): Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  candidate: GreaterRealmPrivateCandidate;
}> {
  if (!workspace || !candidate || !atlasDigest || !manifestDigest) {
    throw new Error('GREATER_REALM_PRIVATE_PACKAGE_FIXTURE_MISSING');
  }
  return { workspace, candidate };
}

function candidateRelativePath(path: string): string {
  return `batches/${BATCH_HANDLE}/candidates/${CANDIDATE_HANDLE}/${path}`;
}

function verifyFixture(overrides: Readonly<{
  expectedCandidateOrdinal?: number;
  expectedAggregate?: GreaterRealmPrivateCandidate['aggregate'];
  expectedPerformance?: GreaterRealmCandidatePerformance;
  expectedAtlasDigest?: string;
  expectedManifestDigest?: string;
  onVerifiedPrivateShortlistMetrics?: (
    metrics: GreaterRealmVerifiedPrivateShortlistMetrics,
  ) => void;
}> = {}) {
  const fixture = requireFixture();
  return verifyGreaterRealmPrivateCandidatePackage({
    workspace: fixture.workspace,
    batchHandle: BATCH_HANDLE,
    candidateHandle: CANDIDATE_HANDLE,
    expectedCandidateOrdinal: overrides.expectedCandidateOrdinal ?? CANDIDATE_ORDINAL,
    sourceCommit: SOURCE_COMMIT,
    expectedBatchSeedDigest: batchSeedDigest,
    expectedActiveCellCount: fixture.candidate.grid.cellCount,
    expectedAggregate: overrides.expectedAggregate ?? fixture.candidate.aggregate,
    expectedPerformance: overrides.expectedPerformance ?? PERFORMANCE,
    expectedAtlasDigest: overrides.expectedAtlasDigest ?? atlasDigest,
    expectedManifestDigest: overrides.expectedManifestDigest ?? manifestDigest,
    onVerifiedPrivateShortlistMetrics: overrides.onVerifiedPrivateShortlistMetrics,
  });
}

async function replacePrivateFile(
  relativePath: string,
  replacement: Buffer,
  operation: () => Promise<void>,
): Promise<void> {
  const fixture = requireFixture();
  const path = join(fixture.workspace.root, relativePath);
  const original = fixture.workspace.readFile(relativePath);
  try {
    writeFileSync(path, replacement);
    chmodSync(path, 0o600);
    await operation();
  } finally {
    writeFileSync(path, original);
    chmodSync(path, 0o600);
    original.fill(0);
    replacement.fill(0);
  }
}

beforeAll(async () => {
  process.env.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT = `sha256:${TOOLCHAIN_LOCK_SHA256}`;
  process.env.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE = `${process.platform}-${process.arch}`;
  const root = mkdtempSync(join(tmpdir(), 'warpkeep-greater-realm-package-'));
  temporaryRoots.push(root);
  repositoryRoot = join(root, 'repository');
  mkdirSync(repositoryRoot, { mode: 0o700 });
  workspace = openGreaterRealmPrivateWorkspace({
    repositoryRoot,
    workspaceRoot: join(root, 'owner-private'),
  });
  const rootSeed = candidateRoot();
  try {
    batchSeedDigest = createHash('sha256').update(rootSeed).digest('hex');
    const batchSeedEnvelope = encodeGreaterRealmPrivateSeed(rootSeed, 'batch');
    try {
      workspace.writeFileAtomic(
        `batches/${BATCH_HANDLE}/batch-seed.bin`,
        batchSeedEnvelope,
        GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
      );
    } finally {
      batchSeedEnvelope.fill(0);
    }
    candidate = generateGreaterRealmCandidate({
      rootSeed,
      candidateOrdinal: CANDIDATE_ORDINAL,
    });
  } finally {
    rootSeed.fill(0);
  }
  if (!candidate.aggregate.eligible) {
    throw new Error('GREATER_REALM_PRIVATE_PACKAGE_FIXTURE_INELIGIBLE');
  }
  const written = await writeGreaterRealmPrivateCandidate({
    workspace,
    batchHandle: BATCH_HANDLE,
    candidateHandle: CANDIDATE_HANDLE,
    sourceCommit: SOURCE_COMMIT,
    candidate,
    performance: PERFORMANCE,
  });
  atlasDigest = written.atlasDigest;
  manifestDigest = written.manifestDigest;
}, 60_000);

afterAll(() => {
  if (priorToolchainReceipt === undefined) delete process.env.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT;
  else process.env.WKGR_TOOLCHAIN_PREFLIGHT_RECEIPT = priorToolchainReceipt;
  if (priorToolchainProfile === undefined) delete process.env.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE;
  else process.env.WKGR_TOOLCHAIN_PREFLIGHT_PROFILE = priorToolchainProfile;
  if (candidate) clearGreaterRealmPrivateCandidateBuffers(candidate);
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm owner-only candidate package', () => {
  it('serializes canonically and verifies every expected private package component', async () => {
    const fixture = requireFixture();
    const first = serializeGreaterRealmPrivateAtlas(fixture.candidate);
    const second = serializeGreaterRealmPrivateAtlas(fixture.candidate);
    let comparisonMetrics: GreaterRealmVerifiedPrivateShortlistMetrics | undefined;
    try {
      expect(first.equals(second)).toBe(true);
      expect(privateAtlasFormatVersion(first)).toBe(5);
      expect(createHash('sha256').update(first).digest('hex')).toBe(atlasDigest);
      const atlasFields = privateAtlasFieldNames(first);
      expect(atlasFields.filter(name => name === 'geological-barrier-band'))
        .toEqual(['geological-barrier-band']);
      expect(atlasFields.indexOf('geological-barrier-band'))
        .toBe(atlasFields.indexOf('barrier') + 1);
      for (const fieldName of [
        'geomorphology-total-delta',
        'geomorphology-terrace-delta',
        'geomorphology-elevation',
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
        'throne-anchor',
      ]) {
        expect(first.includes(Buffer.from(fieldName, 'utf8'))).toBe(true);
      }
      await expect(verifyFixture({
        onVerifiedPrivateShortlistMetrics: metrics => {
          comparisonMetrics = metrics;
        },
      })).resolves.toEqual({ atlasDigest, manifestDigest });
      expect(comparisonMetrics).toMatchObject({
        candidateHandle: CANDIDATE_HANDLE,
        gateRouteRedundancyProof: true,
      });
      expect(comparisonMetrics!.measuredMinimumBarrierWidth).toBeGreaterThanOrEqual(4);
      expect(comparisonMetrics!.measuredMaximumBarrierWidth).toBeLessThanOrEqual(8);
      expect(JSON.stringify(comparisonMetrics)).not.toMatch(
        /(?:coordinate|seed|transform|digest|path|chunkKey)/iu,
      );
      expect(fixture.workspace.attestTree(
        `batches/${BATCH_HANDLE}/candidates/${CANDIDATE_HANDLE}`,
      ).fileCount).toBe(9);
      expect(readdirSync(repositoryRoot)).toEqual([]);

      const preview = fixture.workspace.readFile(
        candidateRelativePath('previews/private-preview-silhouette.png'),
      );
      try {
        expect(preview.includes(Buffer.from(GREATER_REALM_PRIVATE_PREVIEW_MARKER, 'ascii')))
          .toBe(true);
      } finally {
        preview.fill(0);
      }

      for (const relativePath of [
        candidateRelativePath('seed.bin'),
        candidateRelativePath('atlas.wkgr-atlas'),
        candidateRelativePath('manifest.private.json'),
        candidateRelativePath('previews/private-preview-silhouette.png'),
      ]) {
        expect(statSync(join(fixture.workspace.root, relativePath)).mode & 0o077).toBe(0);
      }
    } finally {
      first.fill(0);
      second.fill(0);
    }
  }, 60_000);

  it('binds package version and stable terrain seed namespace as separate authorities', () => {
    const fixture = requireFixture();
    const rootSeed = candidateRoot();
    const candidateSeed = Buffer.from(fixture.candidate.seedMaterial);
    const manifestBytes = fixture.workspace.readFile(
      candidateRelativePath('manifest.private.json'),
    );
    let derivedSeed: Buffer | undefined;
    try {
      expect(GREATER_REALM_GENERATOR_VERSION)
        .toBe('greater-realm-v2-natural-continent-pr-a.8');
      expect(GREATER_REALM_TERRAIN_SEED_NAMESPACE)
        .toBe('greater-realm-v2-natural-continent-pr-a.3');
      expect(GREATER_REALM_GENERATOR_VERSION).not.toBe(
        GREATER_REALM_TERRAIN_SEED_NAMESPACE,
      );
      derivedSeed = deriveGreaterRealmCandidateSeedMaterial(rootSeed, CANDIDATE_ORDINAL);
      expect(candidateSeed.equals(derivedSeed)).toBe(true);
      const manifest = JSON.parse(manifestBytes.toString('utf8')) as {
        generatorVersion: string;
        seedNamespace: string;
      };
      expect(manifest.generatorVersion).toBe(GREATER_REALM_GENERATOR_VERSION);
      expect(manifest.seedNamespace).toBe(GREATER_REALM_TERRAIN_SEED_NAMESPACE);
    } finally {
      rootSeed.fill(0);
      candidateSeed.fill(0);
      derivedSeed?.fill(0);
      manifestBytes.fill(0);
    }
  });

  it('renders an opaque outer-fog topology proxy and keeps rivers inside the land silhouette', async () => {
    const fixture = requireFixture();
    const topologyPreview = await renderGreaterRealmPrivatePreview(
      fixture.candidate,
      'regions',
    );
    const silhouettePreview = await renderGreaterRealmPrivatePreview(
      fixture.candidate,
      'silhouette',
    );
    let topologyPixels: Buffer | undefined;
    let silhouettePixels: Buffer | undefined;
    try {
      const sharpModule = await import('sharp');
      const topology = await sharpModule.default(topologyPreview)
        .raw()
        .toBuffer({ resolveWithObject: true });
      const silhouette = await sharpModule.default(silhouettePreview)
        .raw()
        .toBuffer({ resolveWithObject: true });
      topologyPixels = topology.data;
      silhouettePixels = silhouette.data;
      expect(topology.info).toMatchObject({ width: 1_280, height: 1_024, channels: 4 });
      expect(silhouette.info).toMatchObject({ width: 1_280, height: 1_024, channels: 4 });
      expect([...topologyPixels.subarray(0, 4)]).toEqual([24, 22, 31, 255]);

      const regionColors = new Set([
        '87:144:84', '117:159:195', '205:151:76', '84:147:127', '103:124:164',
        '151:96:80', '92:112:82', '116:103:126', '85:121:142', '116:84:135',
      ]);
      const oceanTones = new Set<string>();
      let fogPixels = 0;
      let regionPixels = 0;
      let inlandWaterPixels = 0;
      let nonOpaquePixels = 0;
      for (let y = 0; y < 980; y += 1) {
        for (let x = 0; x < 1_280; x += 1) {
          const offset = (y * 1_280 + x) * 4;
          const red = topologyPixels[offset]!;
          const green = topologyPixels[offset + 1]!;
          const blue = topologyPixels[offset + 2]!;
          if (topologyPixels[offset + 3] !== 255) nonOpaquePixels += 1;
          const key = `${red}:${green}:${blue}`;
          if (key === '24:22:31') fogPixels += 1;
          if (regionColors.has(key)) regionPixels += 1;
          if (key === '66:126:171' || key === '72:143:190') inlandWaterPixels += 1;
          for (let band = 0; band <= 5; band += 1) {
            if (key === `${54 - band * 5}:${91 - band * 8}:${132 - band * 10}`) {
              oceanTones.add(key);
            }
          }
        }
      }
      expect(nonOpaquePixels).toBe(0);
      expect(fogPixels).toBeGreaterThan(100_000);
      expect(regionPixels).toBeGreaterThan(10_000);
      expect(inlandWaterPixels).toBeGreaterThan(100);
      expect(oceanTones.size).toBeGreaterThanOrEqual(4);

      let minimumR = Number.POSITIVE_INFINITY;
      let maximumR = Number.NEGATIVE_INFINITY;
      let minimumProjectedX = Number.POSITIVE_INFINITY;
      let maximumProjectedX = Number.NEGATIVE_INFINITY;
      for (let cell = 0; cell < fixture.candidate.grid.cellCount; cell += 1) {
        const q = fixture.candidate.grid.q[cell]!;
        const r = fixture.candidate.grid.r[cell]!;
        const projectedX = q + r / 2;
        minimumR = Math.min(minimumR, r);
        maximumR = Math.max(maximumR, r);
        minimumProjectedX = Math.min(minimumProjectedX, projectedX);
        maximumProjectedX = Math.max(maximumProjectedX, projectedX);
      }
      const rSpan = maximumR - minimumR + 1;
      const projectedXSpan = maximumProjectedX - minimumProjectedX + 1;
      const scale = Math.max(1, Math.floor(Math.min(
        (1_280 - 80) / projectedXSpan,
        (1_024 - 120) / rSpan,
      )));
      const cellPixelSpan = Math.max(1, scale);
      const projectedWidth = Math.round(
        (maximumProjectedX - minimumProjectedX) * scale,
      ) + cellPixelSpan;
      const projectedHeight = Math.round((rSpan - 1) * scale * 0.86)
        + cellPixelSpan;
      const previewOriginX = Math.max(
        0,
        Math.round((1_280 - projectedWidth) / 2),
      );
      const previewOriginY = Math.max(
        0,
        Math.round((1_024 - 44 - projectedHeight) / 2),
      );
      let renderedRiverAsLand = false;
      for (
        let cell = fixture.candidate.grid.cellCount - 1;
        cell >= 0 && !renderedRiverAsLand;
        cell -= 1
      ) {
        if (
          fixture.candidate.elevation[cell]! <= 0
          || (
            fixture.candidate.waterRegime[cell] !== 3
            && fixture.candidate.waterRegime[cell] !== 4
          )
        ) continue;
        const x = previewOriginX + Math.round((
          fixture.candidate.grid.q[cell]!
          + fixture.candidate.grid.r[cell]! / 2
          - minimumProjectedX
        ) * scale);
        const y = previewOriginY + Math.round(
          (fixture.candidate.grid.r[cell]! - minimumR) * scale * 0.86,
        );
        const offset = (y * 1_280 + x) * 4;
        renderedRiverAsLand = silhouettePixels[offset] === 142
          && silhouettePixels[offset + 1] === 164
          && silhouettePixels[offset + 2] === 105
          && silhouettePixels[offset + 3] === 255;
      }
      expect(renderedRiverAsLand).toBe(true);
    } finally {
      topologyPixels?.fill(0);
      silhouettePixels?.fill(0);
      topologyPreview.fill(0);
      silhouettePreview.fill(0);
    }
  }, 45_000);

  it('keeps the atmospheric hillshade invariant under a global atlas translation', async () => {
    const fixture = requireFixture();
    const originalQ = new Int32Array(fixture.candidate.grid.q);
    const originalR = new Int32Array(fixture.candidate.grid.r);
    let baseline: Buffer | undefined;
    let translated: Buffer | undefined;
    try {
      baseline = await renderGreaterRealmPrivatePreview(
        fixture.candidate,
        'hillshade',
      );
      for (let cell = 0; cell < fixture.candidate.grid.cellCount; cell += 1) {
        fixture.candidate.grid.q[cell] = originalQ[cell]! + 37;
        fixture.candidate.grid.r[cell] = originalR[cell]! - 19;
      }
      translated = await renderGreaterRealmPrivatePreview(
        fixture.candidate,
        'hillshade',
      );

      expect(translated.equals(baseline)).toBe(true);
    } finally {
      fixture.candidate.grid.q.set(originalQ);
      fixture.candidate.grid.r.set(originalR);
      originalQ.fill(0);
      originalR.fill(0);
      baseline?.fill(0);
      translated?.fill(0);
    }
  }, 45_000);

  it('binds deterministic 15-by-15 axial bins, topography patches, and toolchain pins', () => {
    const fixture = requireFixture();
    const bytes = fixture.workspace.readFile(candidateRelativePath('manifest.private.json'));
    try {
      const parsed = JSON.parse(bytes.toString('utf8')) as {
        formatVersion: number;
        barrierCrossSections: GreaterRealmV5ManifestAuthority['barrierCrossSections'];
        gates: GreaterRealmV5ManifestAuthority['gates'];
        geomorphologyVersion: string;
        toolchainVersions: {
          architecture: string;
          configuredNodeEngine: string;
          configuredPackageManager: string;
          git: {
            binaryPath: string;
            binarySha256: string;
            execPath: string;
            version: string;
          };
          installLayout: {
            kind: string;
            aliases: Record<string, { kind: string; target: string }>;
          };
          libvips: string;
          nodeExecutable: { path: string; sha256: string };
          platform: string;
          preflight: {
            kind: string;
            manifestPath: string;
            manifestSha256: string;
            profile: string;
          };
          runtimeNode: string;
          sharp: {
            version: string;
            packageJson: { path: string; sha256: string };
            entrypoint: { path: string; sha256: string };
            native: Array<{ path: string; sha256: string }>;
            libvipsNative: Array<{ path: string; sha256: string }>;
          };
          tsx: {
            version: string;
            packageJson: { path: string; sha256: string };
            cli: { path: string; sha256: string };
            esbuildVersion: string;
            esbuildPackageJson: { path: string; sha256: string };
            esbuildEntrypoint: { path: string; sha256: string };
            esbuildNativePackageJson: { path: string; sha256: string };
            esbuildNativeCli: { path: string; sha256: string };
          };
          typescript: {
            version: string;
            packageJson: { path: string; sha256: string };
            cli: { path: string; sha256: string };
            nativePackageJson: { path: string; sha256: string };
            nativeCli: { path: string; sha256: string };
          };
        };
        throneAnchor: {
          dormant: boolean;
          cell: number;
          q: number;
          r: number;
          regionId: number;
          tierId: number;
        };
        chunkManifests: Array<{
          chunkKey: string;
          partitionVersion: string;
          geomorphologyVersion: string;
          topographyVersion: string;
          cellCount: number;
          topographyPatchId: string;
          topographyPatchDigest: string;
        }>;
        topographyPatchManifests: Array<{
          chunkKey: string;
          sampleWidth: number;
          sampleHeight: number;
          sampleCount: number;
          fieldCount: number;
          payloadByteCount: number;
          payloadDigest: string;
          manifestDigest: string;
          topographyPatchId: string;
          geomorphologyVersion: string;
          encodingVersion: string;
          topographyVersion: string;
        }>;
      };
      expect(parsed.formatVersion).toBe(5);
      expect(parsed.toolchainVersions.configuredNodeEngine).toBe('>=22.13 <23');
      expect(parsed.toolchainVersions.configuredPackageManager).toBe('npm@10.9.8');
      expect(parsed.toolchainVersions.libvips).toBe('8.18.3');
      expect(parsed.toolchainVersions.runtimeNode).toBe(process.versions.node);
      expect(isAbsolute(parsed.toolchainVersions.nodeExecutable.path)).toBe(true);
      expect(parsed.toolchainVersions.nodeExecutable.sha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(parsed.toolchainVersions.platform).toBe(process.platform);
      expect(parsed.toolchainVersions.architecture).toBe(process.arch);
      expect(parsed.toolchainVersions.preflight).toEqual({
        kind: 'locked-package-tree-v1',
        manifestPath: 'scripts/atlas/greater-realm-toolchain-lock.json',
        manifestSha256: TOOLCHAIN_LOCK_SHA256,
        profile: `${process.platform}-${process.arch}`,
      });
      expect(parsed.toolchainVersions.sharp.version).toBe('0.35.3');
      expect(parsed.toolchainVersions.tsx.version).toBe('4.23.0');
      expect(parsed.toolchainVersions.tsx.esbuildVersion).toBe('0.28.1');
      expect(parsed.toolchainVersions.typescript.version).toBe('7.0.2');
      expect(parsed.toolchainVersions.git.version).toMatch(/^git version /u);
      expect(isAbsolute(parsed.toolchainVersions.git.binaryPath)).toBe(true);
      expect(isAbsolute(parsed.toolchainVersions.git.execPath)).toBe(true);
      expect(parsed.toolchainVersions.git.binarySha256).toMatch(/^[0-9a-f]{64}$/u);
      expect(parsed.toolchainVersions.installLayout.kind).toMatch(
        /^(?:direct-node-modules|bound-symlink-store|bound-mixed-node-modules)$/u,
      );
      for (const alias of Object.values(parsed.toolchainVersions.installLayout.aliases)) {
        expect(alias.kind).toMatch(/^(?:directory|symlink)$/u);
        expect(alias.target).toMatch(/^node_modules\//u);
      }
      const attestedFiles = [
        parsed.toolchainVersions.sharp.packageJson,
        parsed.toolchainVersions.sharp.entrypoint,
        ...parsed.toolchainVersions.sharp.native,
        ...parsed.toolchainVersions.sharp.libvipsNative,
        parsed.toolchainVersions.tsx.packageJson,
        parsed.toolchainVersions.tsx.cli,
        parsed.toolchainVersions.tsx.esbuildPackageJson,
        parsed.toolchainVersions.tsx.esbuildEntrypoint,
        parsed.toolchainVersions.tsx.esbuildNativePackageJson,
        parsed.toolchainVersions.tsx.esbuildNativeCli,
        parsed.toolchainVersions.typescript.packageJson,
        parsed.toolchainVersions.typescript.cli,
        parsed.toolchainVersions.typescript.nativePackageJson,
        parsed.toolchainVersions.typescript.nativeCli,
      ];
      expect(parsed.toolchainVersions.sharp.native.length).toBeGreaterThan(0);
      expect(parsed.toolchainVersions.sharp.libvipsNative.length).toBeGreaterThan(0);
      for (const file of attestedFiles) {
        expect(file.path).toMatch(/^node_modules\//u);
        expect(file.sha256).toMatch(/^[0-9a-f]{64}$/u);
      }
      expect(parsed.geomorphologyVersion).toBe('greater-realm-geomorphology-v3');
      const throneCell = fixture.candidate.throneAnchor.findIndex(value => value === 1);
      expect(throneCell).toBeGreaterThanOrEqual(0);
      expect(parsed.throneAnchor).toEqual({
        dormant: true,
        cell: throneCell,
        q: fixture.candidate.grid.q[throneCell],
        r: fixture.candidate.grid.r[throneCell],
        regionId: 9,
        tierId: 3,
      });
      expect(parsed.barrierCrossSections).toEqual(fixture.candidate.barrierCrossSections);
      expect(parsed.gates).toHaveLength(fixture.candidate.gates.length);
      for (let index = 0; index < parsed.gates.length; index += 1) {
        expect({
          firstApproachPath: parsed.gates[index]!.firstApproachPath,
          firstAlternateApproachPath: parsed.gates[index]!.firstAlternateApproachPath,
          secondApproachPath: parsed.gates[index]!.secondApproachPath,
          secondAlternateApproachPath: parsed.gates[index]!.secondAlternateApproachPath,
        }).toEqual({
          firstApproachPath: fixture.candidate.gates[index]!.firstApproachPath,
          firstAlternateApproachPath: fixture.candidate.gates[index]!.firstAlternateApproachPath,
          secondApproachPath: fixture.candidate.gates[index]!.secondApproachPath,
          secondAlternateApproachPath: fixture.candidate.gates[index]!.secondAlternateApproachPath,
        });
      }
      expect(parsed.chunkManifests).toHaveLength(fixture.candidate.privateMetrics.chunkCount);
      expect(parsed.topographyPatchManifests).toHaveLength(parsed.chunkManifests.length);
      expect(new Set(parsed.chunkManifests.map(chunk => chunk.chunkKey)).size)
        .toBe(parsed.chunkManifests.length);
      expect(parsed.chunkManifests.reduce((sum, chunk) => sum + chunk.cellCount, 0))
        .toBe(fixture.candidate.grid.cellCount);
      for (let index = 0; index < parsed.chunkManifests.length; index += 1) {
        const chunk = parsed.chunkManifests[index]!;
        const patch = parsed.topographyPatchManifests[index]!;
        expect(patch.chunkKey).toBe(chunk.chunkKey);
        expect(chunk.partitionVersion).toBe('axial-bin-15-v1');
        expect(chunk.geomorphologyVersion).toBe('greater-realm-geomorphology-v3');
        expect(chunk.topographyVersion).toBe('greater-realm-advanced-topography-v2');
        expect(patch.geomorphologyVersion).toBe('greater-realm-geomorphology-v3');
        expect(patch.encodingVersion).toBe('wkgr-topography-fields-v2');
        expect(patch.topographyVersion).toBe('greater-realm-advanced-topography-v2');
        expect(patch.topographyPatchId).toBe(chunk.topographyPatchId);
        expect(patch.manifestDigest).toBe(chunk.topographyPatchDigest);
        expect(patch.sampleCount).toBe(chunk.cellCount);
        expect(patch.sampleWidth).toBeGreaterThan(0);
        expect(patch.sampleWidth).toBeLessThanOrEqual(15);
        expect(patch.sampleHeight).toBeGreaterThan(0);
        expect(patch.sampleHeight).toBeLessThanOrEqual(15);
        expect(patch.fieldCount).toBe(30);
        expect(patch.payloadByteCount).toBe(patch.sampleCount * 88);
        expect(patch.payloadDigest).toMatch(/^[0-9a-f]{64}$/u);
      }
    } finally {
      bytes.fill(0);
    }
  }, 30_000);

  it('rejects path traversal before creating any package output', async () => {
    const fixture = requireFixture();
    const before = fixture.workspace.attestTree().fileCount;

    await expect(writeGreaterRealmPrivateCandidate({
      workspace: fixture.workspace,
      batchHandle: '../escaped',
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: fixture.candidate,
      performance: Object.freeze({
        generationMilliseconds: 1_200,
        processPeakMemoryMiB: 512,
      }),
    })).rejects.toThrow('GREATER_REALM_PRIVATE_PACKAGE_INPUT_INVALID');

    expect(fixture.workspace.attestTree().fileCount).toBe(before);
    expect(readdirSync(repositoryRoot)).toEqual([]);
  });

  it('rejects package values that the verifier cannot accept', async () => {
    const fixture = requireFixture();
    await expect(writeGreaterRealmPrivateCandidate({
      workspace: fixture.workspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: Object.freeze({
        ...fixture.candidate,
        candidateOrdinal: 256,
      }),
      performance: PERFORMANCE,
    })).rejects.toThrow('GREATER_REALM_PRIVATE_PACKAGE_INPUT_INVALID');
    await expect(writeGreaterRealmPrivateCandidate({
      workspace: fixture.workspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: fixture.candidate,
      performance: Object.freeze({
        generationMilliseconds: 7 * 24 * 60 * 60 * 1_000 + 100,
        processPeakMemoryMiB: 512,
      }),
    })).rejects.toThrow('GREATER_REALM_PRIVATE_PACKAGE_INPUT_INVALID');
    await expect(writeGreaterRealmPrivateCandidate({
      workspace: fixture.workspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: fixture.candidate,
      performance: Object.freeze({
        generationMilliseconds: 1_200,
        processPeakMemoryMiB: 1_048_584,
      }),
    })).rejects.toThrow('GREATER_REALM_PRIVATE_PACKAGE_INPUT_INVALID');
  });

  it('rejects an unknown private preview mode before allocating image data', async () => {
    const fixture = requireFixture();
    await expect(renderGreaterRealmPrivatePreview(
      fixture.candidate,
      'untrusted-svg-fragment' as never,
    )).rejects.toThrow('GREATER_REALM_PRIVATE_PREVIEW_MODE_INVALID');
  });

  it('rejects an atlas whose structure and digest were changed together', async () => {
    const relativePath = candidateRelativePath('atlas.wkgr-atlas');
    const original = requireFixture().workspace.readFile(relativePath);
    const corrupted = Buffer.from(original);
    original.fill(0);
    corrupted[2] = corrupted[2]! ^ 0xff;
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedAtlasDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    });
  }, 45_000);

  it('rejects geological-barrier-band inventory-name tampering with an updated digest', async () => {
    const relativePath = candidateRelativePath('atlas.wkgr-atlas');
    const original = requireFixture().workspace.readFile(relativePath);
    const corrupted = Buffer.from(original);
    original.fill(0);
    const fieldName = Buffer.from('geological-barrier-band', 'utf8');
    const fieldNameOffset = corrupted.indexOf(fieldName);
    expect(fieldNameOffset).toBeGreaterThan(0);
    corrupted[fieldNameOffset] = 'x'.charCodeAt(0);
    fieldName.fill(0);
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedAtlasDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_ATLAS_INVALID');
    });
  }, 45_000);

  it('rejects a manifest whose contents and expected digest were changed together', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    original.fill(0);
    parsed.sourceCommit = 'b'.repeat(40);
    const corrupted = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  }, 45_000);

  it('rejects terrain seed namespace drift even when the expected digest is updated', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    original.fill(0);
    parsed.seedNamespace = 'greater-realm-v2-natural-continent-pr-unreviewed';
    const corrupted = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  }, 45_000);

  it('rejects unknown manifest fields even when the expected digest is updated', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    original.fill(0);
    parsed.unreviewedPrivateField = true;
    const corrupted = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  }, 45_000);

  it.each<[
    string,
    (manifest: GreaterRealmV5ManifestAuthority) => void,
  ]>([
    ['barrier cross-section cells', manifest => {
      manifest.barrierCrossSections[0]!.cells[0] =
        manifest.barrierCrossSections[0]!.cells[0]! + 1;
    }],
    ['first gate approach path', manifest => {
      manifest.gates[0]!.firstApproachPath[0] =
        manifest.gates[0]!.firstApproachPath[0]! + 1;
    }],
    ['first alternate gate approach path', manifest => {
      manifest.gates[0]!.firstAlternateApproachPath[0] =
        manifest.gates[0]!.firstAlternateApproachPath[0]! + 1;
    }],
    ['second gate approach path', manifest => {
      manifest.gates[0]!.secondApproachPath[0] =
        manifest.gates[0]!.secondApproachPath[0]! + 1;
    }],
    ['second alternate gate approach path', manifest => {
      manifest.gates[0]!.secondAlternateApproachPath[0] =
        manifest.gates[0]!.secondAlternateApproachPath[0]! + 1;
    }],
  ])('rejects tampered v5 %s authority with an updated digest', async (_label, mutate) => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as GreaterRealmV5ManifestAuthority;
    original.fill(0);
    mutate(parsed);
    const corrupted = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  }, 45_000);

  it('rejects duplicate private-manifest keys even when the final parsed value is valid', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const text = original.toString('utf8');
    original.fill(0);
    const kindLine = text.split('\n').find(line => line.startsWith('  "kind": '));
    expect(kindLine).toBeDefined();
    const corrupted = Buffer.from(
      text.replace(`${kindLine}\n`, `${kindLine}\n${kindLine}\n`),
      'utf8',
    );
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  });

  it('rejects a reordered private manifest even when all parsed values remain valid', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    original.fill(0);
    const reordered = Object.fromEntries(Object.entries(parsed).reverse());
    const corrupted = Buffer.from(`${JSON.stringify(reordered, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  });

  it('rejects noncanonical private-manifest whitespace with an updated digest', async () => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as Record<string, unknown>;
    original.fill(0);
    const corrupted = Buffer.from(`${JSON.stringify(parsed)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  });

  it.each([
    ['chunk payload', (manifest: {
      chunkManifests: Array<{ payloadDigest: string }>;
    }) => { manifest.chunkManifests[0]!.payloadDigest = '0'.repeat(64); }],
    ['topography patch', (manifest: {
      topographyPatchManifests: Array<{ payloadByteCount: number }>;
    }) => { manifest.topographyPatchManifests[0]!.payloadByteCount += 1; }],
    ['toolchain pin', (manifest: {
      toolchainVersions: { typescript: string };
    }) => { manifest.toolchainVersions.typescript = '7.0.3'; }],
  ])('rejects a changed %s even when the expected manifest digest is updated', async (
    _label,
    mutate,
  ) => {
    const relativePath = candidateRelativePath('manifest.private.json');
    const original = requireFixture().workspace.readFile(relativePath);
    const parsed = JSON.parse(original.toString('utf8')) as never;
    original.fill(0);
    mutate(parsed);
    const corrupted = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedDigest = createHash('sha256').update(corrupted).digest('hex');

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture({ expectedManifestDigest: corruptedDigest }))
        .rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
    });
  });

  it('rejects preview corruption even when the PNG signature remains intact', async () => {
    const relativePath = candidateRelativePath('previews/private-preview-regions.png');
    const original = requireFixture().workspace.readFile(relativePath);
    const corrupted = Buffer.from(original);
    original.fill(0);
    expect(corrupted.length).toBeGreaterThan(64);
    corrupted[Math.floor(corrupted.length / 2)] = (
      corrupted[Math.floor(corrupted.length / 2)]! ^ 0xff
    );

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture()).rejects.toThrow(
        'GREATER_REALM_PRIVATE_PROVENANCE_INVALID',
      );
    });
  });

  it('rejects an oversized preview before parsing owner-workspace image bytes', async () => {
    const relativePath = candidateRelativePath('previews/private-preview-hydrology.png');
    const original = requireFixture().workspace.readFile(relativePath);
    const oversized = Buffer.concat([original, Buffer.from([0])]);
    original.fill(0);

    await replacePrivateFile(relativePath, oversized, async () => {
      await expect(verifyFixture()).rejects.toThrow(
        'GREATER_REALM_PRIVATE_FILE_INVALID',
      );
    });
  });

  it('requires the CRC-protected private marker inside every preview PNG', async () => {
    const previewPath = candidateRelativePath('previews/private-preview-regions.png');
    const originalPreview = requireFixture().workspace.readFile(previewPath);
    const corruptedPreview = Buffer.from(originalPreview);
    originalPreview.fill(0);
    const markerOffset = corruptedPreview.indexOf(
      Buffer.from(GREATER_REALM_PRIVATE_PREVIEW_MARKER, 'ascii'),
    );
    expect(markerOffset).toBeGreaterThan(0);
    corruptedPreview[markerOffset] = 'X'.charCodeAt(0);

    const manifestPath = candidateRelativePath('manifest.private.json');
    const originalManifest = requireFixture().workspace.readFile(manifestPath);
    const parsed = JSON.parse(originalManifest.toString('utf8')) as {
      previewDigests: Record<string, string>;
    };
    originalManifest.fill(0);
    parsed.previewDigests.regions = createHash('sha256').update(corruptedPreview).digest('hex');
    const corruptedManifest = Buffer.from(`${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
    const corruptedManifestDigest = createHash('sha256').update(corruptedManifest).digest('hex');

    await replacePrivateFile(manifestPath, corruptedManifest, async () => {
      await replacePrivateFile(previewPath, corruptedPreview, async () => {
        await expect(verifyFixture({ expectedManifestDigest: corruptedManifestDigest }))
          .rejects.toThrow('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
      });
    });
  });

  it('rejects seed substitution even when every public expectation is unchanged', async () => {
    const relativePath = candidateRelativePath('seed.bin');
    const original = requireFixture().workspace.readFile(relativePath);
    const corrupted = Buffer.from(original);
    original.fill(0);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff;

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture()).rejects.toThrow(
        'GREATER_REALM_PRIVATE_PROVENANCE_INVALID',
      );
    });
  });

  it('rejects candidate packages containing an unrecognized extra file', async () => {
    const fixture = requireFixture();
    const relativePath = candidateRelativePath('unreviewed.private.bin');
    const path = join(fixture.workspace.root, relativePath);
    fixture.workspace.writeFileAtomic(relativePath, Buffer.from('controlled-extra-file', 'utf8'));
    try {
      await expect(verifyFixture()).rejects.toThrow(
        'GREATER_REALM_PRIVATE_PACKAGE_INVENTORY_INVALID',
      );
    } finally {
      rmSync(path, { force: true });
    }
  });

  it('rejects a candidate that cannot be derived from the protected batch seed', async () => {
    const relativePath = `batches/${BATCH_HANDLE}/batch-seed.bin`;
    const original = requireFixture().workspace.readFile(
      relativePath,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    const corrupted = Buffer.from(original);
    original.fill(0);
    corrupted[corrupted.length - 1] = corrupted[corrupted.length - 1]! ^ 0xff;

    await replacePrivateFile(relativePath, corrupted, async () => {
      await expect(verifyFixture()).rejects.toThrow(
        'GREATER_REALM_PRIVATE_PROVENANCE_INVALID',
      );
    });
  });

  it('binds the candidate ordinal into private provenance verification', async () => {
    await expect(verifyFixture({ expectedCandidateOrdinal: CANDIDATE_ORDINAL + 1 }))
      .rejects.toThrow('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
  });

  it('binds the sanitized aggregate and rounded performance to the private authority', async () => {
    const fixture = requireFixture();
    const alteredAggregate = Object.freeze({
      ...fixture.candidate.aggregate,
      quality: Object.freeze({
        ...fixture.candidate.aggregate.quality,
        naturalnessBasisPoints: fixture.candidate.aggregate.quality.naturalnessBasisPoints - 1,
      }),
    });
    await expect(verifyFixture({ expectedAggregate: alteredAggregate }))
      .rejects.toThrow('GREATER_REALM_PRIVATE_PROVENANCE_INVALID');
    await expect(verifyFixture({
      expectedPerformance: Object.freeze({ ...PERFORMANCE, processPeakMemoryMiB: 520 }),
    })).rejects.toThrow('GREATER_REALM_PRIVATE_MANIFEST_INVALID');
  }, 60_000);

  it('rejects a topography field whose runtime array type does not match its encoding', () => {
    const fixture = requireFixture();
    const invalid = Object.freeze({
      ...fixture.candidate,
      aspect: new Uint16Array(fixture.candidate.aspect),
    }) as unknown as GreaterRealmPrivateCandidate;
    expect(() => serializeGreaterRealmPrivateAtlas(invalid)).toThrow(
      'GREATER_REALM_PRIVATE_FIELD_INVALID',
    );
  });

  it('zeroes a serialized atlas when private persistence fails', async () => {
    const fixture = requireFixture();
    let exposedAtlas: Uint8Array | undefined;
    const rejectingWorkspace: GreaterRealmPrivateWorkspace = Object.freeze({
      ...fixture.workspace,
      ensureDirectory: () => fixture.workspace.root,
      writeFileAtomic: (path: string, bytes: Uint8Array) => {
        if (!path.endsWith('/atlas.wkgr-atlas')) return;
        exposedAtlas = bytes;
        throw new Error('CONTROLLED_PRIVATE_ATLAS_WRITE_FAILURE');
      },
    });

    await expect(writeGreaterRealmPrivateCandidate({
      workspace: rejectingWorkspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: fixture.candidate,
      performance: Object.freeze({
        generationMilliseconds: 1_200,
        processPeakMemoryMiB: 512,
      }),
    })).rejects.toThrow('CONTROLLED_PRIVATE_ATLAS_WRITE_FAILURE');

    expect(exposedAtlas).toBeDefined();
    expect(exposedAtlas?.every(value => value === 0)).toBe(true);
  });

  it('zeroes an atlas allocated before candidate-seed persistence fails', async () => {
    const fixture = requireFixture();
    const expectedAtlas = serializeGreaterRealmPrivateAtlas(fixture.candidate);
    const expectedAtlasBytes = expectedAtlas.byteLength;
    expectedAtlas.fill(0);
    const atlasAllocations: Buffer[] = [];
    const allocateUnsafe = Buffer.allocUnsafe;
    const allocationSpy = vi.spyOn(Buffer, 'allocUnsafe').mockImplementation(byteLength => {
      const allocation = allocateUnsafe(byteLength);
      if (byteLength === expectedAtlasBytes) atlasAllocations.push(allocation);
      return allocation;
    });
    const rejectingWorkspace: GreaterRealmPrivateWorkspace = Object.freeze({
      ...fixture.workspace,
      ensureDirectory: () => fixture.workspace.root,
      writeFileAtomic: (path: string) => {
        if (path.endsWith('/seed.bin')) {
          throw new Error('CONTROLLED_PRIVATE_SEED_WRITE_FAILURE');
        }
      },
    });

    try {
      await expect(writeGreaterRealmPrivateCandidate({
        workspace: rejectingWorkspace,
        batchHandle: BATCH_HANDLE,
        candidateHandle: CANDIDATE_HANDLE,
        sourceCommit: SOURCE_COMMIT,
        candidate: fixture.candidate,
        performance: Object.freeze({
          generationMilliseconds: 1_200,
          processPeakMemoryMiB: 512,
        }),
      })).rejects.toThrow('CONTROLLED_PRIVATE_SEED_WRITE_FAILURE');
    } finally {
      allocationSpy.mockRestore();
    }

    expect(atlasAllocations).toHaveLength(1);
    expect(atlasAllocations[0]?.every(value => value === 0)).toBe(true);
  });

  it('zeroes a private manifest when its atomic write fails', async () => {
    const fixture = requireFixture();
    let exposedManifest: Uint8Array | undefined;
    const rejectingWorkspace: GreaterRealmPrivateWorkspace = Object.freeze({
      ...fixture.workspace,
      ensureDirectory: () => fixture.workspace.root,
      writeFileAtomic: (path: string, bytes: Uint8Array) => {
        if (!path.endsWith('/manifest.private.json')) return;
        exposedManifest = bytes;
        throw new Error('CONTROLLED_PRIVATE_MANIFEST_WRITE_FAILURE');
      },
    });

    await expect(writeGreaterRealmPrivateCandidate({
      workspace: rejectingWorkspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      sourceCommit: SOURCE_COMMIT,
      candidate: fixture.candidate,
      performance: Object.freeze({
        generationMilliseconds: 1_200,
        processPeakMemoryMiB: 512,
      }),
    })).rejects.toThrow('CONTROLLED_PRIVATE_MANIFEST_WRITE_FAILURE');

    expect(exposedManifest).toBeDefined();
    expect(exposedManifest?.every(value => value === 0)).toBe(true);
  });

  it('zeroes an acquired seed if a later private package read fails', async () => {
    const fixture = requireFixture();
    const exposedBatchSeed = fixture.workspace.readFile(
      `batches/${BATCH_HANDLE}/batch-seed.bin`,
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    const exposedSeed = fixture.workspace.readFile(
      candidateRelativePath('seed.bin'),
      GREATER_REALM_PRIVATE_SEED_ENVELOPE_BYTES,
    );
    const rejectingWorkspace: GreaterRealmPrivateWorkspace = Object.freeze({
      ...fixture.workspace,
      readFile: (path: string) => {
        if (path.endsWith('/batch-seed.bin')) return exposedBatchSeed;
        if (path.endsWith('/seed.bin')) return exposedSeed;
        throw new Error('CONTROLLED_PRIVATE_ATLAS_READ_FAILURE');
      },
    });

    await expect(verifyGreaterRealmPrivateCandidatePackage({
      workspace: rejectingWorkspace,
      batchHandle: BATCH_HANDLE,
      candidateHandle: CANDIDATE_HANDLE,
      expectedCandidateOrdinal: CANDIDATE_ORDINAL,
      sourceCommit: SOURCE_COMMIT,
      expectedBatchSeedDigest: batchSeedDigest,
      expectedActiveCellCount: fixture.candidate.grid.cellCount,
      expectedAggregate: fixture.candidate.aggregate,
      expectedPerformance: PERFORMANCE,
      expectedAtlasDigest: atlasDigest,
      expectedManifestDigest: manifestDigest,
    })).rejects.toThrow('CONTROLLED_PRIVATE_ATLAS_READ_FAILURE');

    expect(exposedBatchSeed.every(value => value === 0)).toBe(true);
    expect(exposedSeed.every(value => value === 0)).toBe(true);
  });

  it('zeroes every advanced-topography and dormant-throne authority buffer', () => {
    const advanced = {
      tectonicUplift: Int32Array.of(1),
      rockResistance: Int32Array.of(2),
      slope: Uint16Array.of(3),
      aspect: Uint8Array.of(4),
      profileCurvature: Int32Array.of(-5),
      planCurvature: Int32Array.of(6),
      wetnessIndex: Uint16Array.of(7),
      exposure: Int32Array.of(-8),
      distanceToCoast: Uint16Array.of(9),
      distanceToFreshwater: Uint16Array.of(10),
      watershedId: Int32Array.of(11),
      ridgeId: Int32Array.of(12),
      temperature: Int32Array.of(-13),
      moisture: Int32Array.of(14),
      geomorphologyTotalDelta: Int32Array.of(15),
      geomorphologyTerraceDelta: Int32Array.of(16),
      geomorphologyElevation: Int32Array.of(14),
      geomorphologyGlacialDelta: Int32Array.of(17),
      geomorphologyAridDelta: Int32Array.of(18),
      geomorphologyVolcanicDelta: Int32Array.of(19),
      geomorphologyCoastalDelta: Int32Array.of(20),
      geomorphologyGlacialMask: Uint8Array.of(1),
      geomorphologyAridMask: Uint8Array.of(1),
      geomorphologyVolcanicMask: Uint8Array.of(1),
      geomorphologyVolcanicAnchorMask: Uint8Array.of(1),
      geomorphologyCoastalMask: Uint8Array.of(1),
      geomorphologyCoastalClass: Uint8Array.of(2),
      geomorphologyTemperature: Int32Array.of(-21),
      geomorphologyMoisture: Int32Array.of(22),
    };
    const u8 = () => Uint8Array.of(1);
    const i32 = () => Int32Array.of(1);
    const gatePaths = [[1, 2], [3, 4], [5, 6], [7, 8]];
    const barrierCrossSectionCells = [1, 2, 3, 4];
    const seedMaterialKey = ['seed', 'Material'].join('') as 'seedMaterial';
    const dummy = {
      [seedMaterialKey]: Buffer.alloc(32, 1),
      candidateSeed: Uint32Array.of(1, 2, 3, 4),
      gates: [{
        firstApproachPath: gatePaths[0],
        firstAlternateApproachPath: gatePaths[1],
        secondApproachPath: gatePaths[2],
        secondAlternateApproachPath: gatePaths[3],
      }],
      barrierCrossSections: [{ cells: barrierCrossSectionCells }],
      grid: { q: i32(), r: i32(), neighbors: i32() },
      bedrockElevation: i32(),
      elevation: i32(),
      filledElevation: i32(),
      sedimentDepth: Uint16Array.of(1),
      flowReceiver: i32(),
      flowAccumulation: BigUint64Array.of(1n),
      domainId: u8(),
      geologyId: u8(),
      regionId: u8(),
      tierId: u8(),
      waterRegime: u8(),
      biomeId: u8(),
      landformId: u8(),
      barrier: u8(),
      geologicalBarrierBand: u8(),
      castleSlot: u8(),
      resourcePotential: u8(),
      corePotential: u8(),
      throneAnchor: u8(),
      legacyLowlandsCell: u8(),
      legacyLowlandsProtectedCell: u8(),
      legacyLowlandsReserveCell: u8(),
      legacyLowlandsCastleSlot: u8(),
      ...advanced,
    } as unknown as GreaterRealmPrivateCandidate;

    clearGreaterRealmPrivateCandidateBuffers(dummy);

    expect(dummy.seedMaterial.every(value => value === 0)).toBe(true);
    expect(dummy.candidateSeed.every(value => value === 0)).toBe(true);
    expect(gatePaths.every(path => path.every(value => value === 0))).toBe(true);
    expect(barrierCrossSectionCells.every(value => value === 0)).toBe(true);
    expect(dummy.geologicalBarrierBand.every(value => value === 0)).toBe(true);
    for (const array of Object.values(advanced)) {
      expect(array.every(value => value === 0)).toBe(true);
    }
    expect(dummy.throneAnchor.every(value => value === 0)).toBe(true);
    expect(dummy.grid.neighbors.every(value => value === 0)).toBe(true);
  });
});
