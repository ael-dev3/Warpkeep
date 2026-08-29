// @vitest-environment node

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildGreaterRealmPrivateCandidateShortlist,
  greaterRealmCliArgumentTestSeams,
  greaterRealmPublicEvidenceTestSeams,
  resolveGreaterRealmPublicEvidenceDestination,
  verifyGreaterRealmPrivateRejectedAttempt,
} from '../scripts/atlas/greater-realm-cli';
import { generateGreaterRealmCandidate } from '../scripts/atlas/greater-realm-candidate-generator';
import {
  clearGreaterRealmPrivateCandidateBuffers,
  GREATER_REALM_PRIVATE_PREVIEW_COUNT,
} from '../scripts/atlas/greater-realm-candidate-package';
import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import type {
  GreaterRealmVerifiedPrivateShortlistMetrics,
} from '../scripts/atlas/greater-realm-candidate-package';
import type { GreaterRealmSanitizedReview } from '../scripts/atlas/greater-realm-contracts';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const atlasCli = resolve(repositoryRoot, 'scripts/atlas/greater-realm-cli.ts');
const forbiddenWorkspace = join(repositoryRoot, '.warpkeep-private-cli-security-test');
const publicEvidenceRoots: string[] = [];

function publicEvidenceFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-public-evidence-')));
  publicEvidenceRoots.push(root);
  const fixtureRepositoryRoot = join(root, 'repository');
  const evidenceRoot = join(fixtureRepositoryRoot, 'docs', 'evidence', 'greater-realm');
  mkdirSync(evidenceRoot, { recursive: true, mode: 0o755 });
  return Object.freeze({ evidenceRoot, repositoryRoot: fixtureRepositoryRoot, root });
}

function runFixtureGit(repository: string, arguments_: readonly string[]): string {
  const result = runGreaterRealmTrustedGit(arguments_, repository);
  if (result.error || result.signal !== null || result.status !== 0) {
    throw new Error('GREATER_REALM_TEST_GIT_SETUP_FAILED');
  }
  return result.stdout.trim();
}

function provenanceFixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-provenance-')));
  publicEvidenceRoots.push(root);
  mkdirSync(join(root, 'spacetimedb', 'src'), { recursive: true, mode: 0o700 });
  mkdirSync(join(root, 'client'), { mode: 0o700 });
  writeFileSync(
    join(root, '.gitignore'),
    'spacetimedb/src/ignored-drift.ts\n',
  );
  writeFileSync(join(root, 'spacetimedb', 'src', 'world.ts'), 'export const world = 1;\n');
  writeFileSync(
    join(root, 'spacetimedb', 'src', 'greaterRealmV17Policy.ts'),
    'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;\n'
      + 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;\n',
  );
  writeFileSync(join(root, 'client', 'renderer.ts'), 'export const renderer = 1;\n');
  runFixtureGit(root, ['init', '--quiet']);
  runFixtureGit(root, [
    'add',
    '.gitignore',
    'spacetimedb/src/greaterRealmV17Policy.ts',
    'spacetimedb/src/world.ts',
    'client/renderer.ts',
  ]);
  runFixtureGit(root, [
    '-c', 'user.name=Warpkeep Test',
    '-c', 'user.email=warpkeep-test@example.invalid',
    'commit', '--quiet', '-m', 'fixture',
  ]);
  return Object.freeze({
    commit: runFixtureGit(root, ['rev-parse', '--verify', 'HEAD^{commit}']),
    root,
  });
}

function runAtlasCli(
  arguments_: readonly string[],
  overrides: Readonly<Record<string, string | undefined>> = {},
) {
  const environment: NodeJS.ProcessEnv = {
    HOME: process.env.HOME,
    PATH: process.env.PATH,
    TMPDIR: process.env.TMPDIR,
    WARPKEEP_QA_SOCKET_TMP: process.env.WARPKEEP_QA_SOCKET_TMP,
    ...overrides,
  };
  for (const [key, value] of Object.entries(environment)) {
    if (value === undefined) delete environment[key];
  }
  return spawnSync(process.execPath, [tsxCli, atlasCli, ...arguments_], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: environment,
    timeout: 10_000,
  });
}

afterEach(() => {
  rmSync(forbiddenWorkspace, { force: true, recursive: true });
  for (const root of publicEvidenceRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe('Greater Realm atlas CLI security boundary', () => {
  it('keeps inspect-package stdout free of private comparison authority', () => {
    const status = greaterRealmCliArgumentTestSeams.inspectPackagePublicStatus({
      candidateCount: 1,
      selectionStatus: 'pending',
    });

    expect(status).toEqual({
      candidateCount: 1,
      selectionStatus: 'pending',
      privatePackageVerified: true,
      coordinateDisclosure: false,
      productionUntouched: true,
    });
    expect(JSON.stringify(status)).not.toMatch(
      /(?:candidateOrdinal|attemptsUsed|rejectedAttempt|privateComparison|barrier|chunk|topology|stageDigest|packageDigest|layoutDigest)/iu,
    );
  });

  it('creates a pending unranked one-world owner review without choosing a winner', () => {
    const candidate = (
      suffix: string,
      values: readonly [number, number, number, number, number],
    ) => ({
      candidateHandle: `GR-A-${suffix.padStart(16, 'A')}`,
      eligible: true,
      quality: {
        naturalnessBasisPoints: values[0],
        ridgeContinuityBasisPoints: values[1],
        hydrologyCoherenceBasisPoints: values[2],
      },
      biomes: {
        visualClassCount: values[3],
        minimumPerRegionVisualClassCount: values[4],
        maximumTierISingleBiomeShareBasisPoints: 6_000,
        incompatibleVisualAdjacencyCount: 0,
        incompatibleBiomeLandformPairCount: 0,
      },
    });
    const candidates = [
      candidate('B', [9_900, 5_000, 5_000, 5, 2]),
    ];
    const privateMetrics = candidates.map((entry, index) => Object.freeze({
      candidateHandle: entry.candidateHandle,
      maximumBoundaryRadiusShareBasisPoints: 1_000,
      rotationalSimilarityBasisPoints: 4_000,
      maximumAlignedBoundaryRun: 24,
      saltwaterBoundaryBasisPoints: 9_900,
      minimumLargestPassableRegionShareBasisPoints: index === 0 ? 9_900 : 8_000,
      maximumMinorPassableFragmentShareBasisPoints: 500,
      maximumPassableSemanticInterfaceDensityBasisPoints: 2_000,
      maximumPassableImmutablePerimeterDensityBasisPoints: 3_000,
      maximumPassableTendrilShareBasisPoints: 300,
      throneAnchorBarrierClearance: 8,
      gateRouteRedundancyProof: true,
      measuredMinimumBarrierWidth: 4,
      measuredMaximumBarrierWidth: 8,
      chunkCount: 700,
      chunkPopulationSpread: index === 0 ? 1 : 100,
      chunkUpperTailSpread: 20,
      highlandBarrierShareBasisPoints: 8_000,
      barrierMeanElevationAdvantage: 2_000,
      barrierMeanUpliftAdvantage: 700,
      ridgeUpliftAlignmentBasisPoints: index === 0 ? 9_900 : 7_000,
      riverValleyAlignmentBasisPoints: 8_000,
      landformClimateCompatibilityFloorBasisPoints: 9_000,
      coastalProximityCompatibilityBasisPoints: 9_000,
      coastalClassCount: 4,
    } satisfies GreaterRealmVerifiedPrivateShortlistMetrics));
    const review = {
      reviewBatchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
      reportDigest: 'a'.repeat(64),
      selectionStatus: 'pending',
      selectedCandidateHandle: null,
      candidates,
    } as unknown as GreaterRealmSanitizedReview;

    const shortlist = buildGreaterRealmPrivateCandidateShortlist(review, privateMetrics);
    expect(shortlist.shortlistCount).toBe(1);
    expect(shortlist.candidateHandles).toEqual([candidates[0]!.candidateHandle]);
    expect(shortlist.selectionStatus).toBe('pending');
    expect(shortlist.selectedCandidateHandle).toBeNull();
    expect(shortlist.ranked).toBe(false);
    expect(shortlist.automaticSelection).toBe(false);
    expect(shortlist.method).toBe('single-candidate-reference-review-v1');
    expect(shortlist.comparisonBasis).toBe('verified-private-package-aggregate-metrics-v1');
    expect(shortlist.objectiveDirections).toEqual(expect.arrayContaining([
      'minimize:OUTER_BOUNDARY_ROTATIONAL_ARTIFACT',
      'maximize:PASSABLE_REGION_COHERENCE',
      'minimize:CHUNK_POPULATION_SPREAD',
      'maximize:RIDGE_UPLIFT_ALIGNMENT',
      'maximize:LANDFORM_CLIMATE_COMPATIBILITY_FLOOR',
      'minimize:TIER_I_SINGLE_BIOME_DOMINANCE',
    ]));
    expect(shortlist.requiredConstraints)
      .toContain('equal-zero:INCOMPATIBLE_BIOME_ADJACENCY');
    expect(shortlist.requiredConstraints)
      .toContain('equal-zero:INCOMPATIBLE_BIOME_LANDFORM_PAIRING');
    expect(shortlist.requiredConstraints).toContain('equal-true:GATE_ROUTE_REDUNDANCY');
    expect(shortlist.requiredConstraints).toContain('range-inclusive:MOUNTAIN_BARRIER_WIDTH_4_8');
    expect(JSON.stringify(shortlist)).not.toMatch(/(?:winner|recommend|score|rank":\s*[0-9])/iu);
    expect(JSON.stringify(shortlist)).not.toMatch(/(?:coordinate|seed|transform|chunkKey)/iu);

    const multiCandidates = Object.freeze([
      ...candidates,
      candidate('C', [8_000, 5_000, 5_000, 5, 2]),
    ]);
    const multiPrivateMetrics = Object.freeze(multiCandidates.map(entry => Object.freeze({
      ...privateMetrics[0]!,
      candidateHandle: entry.candidateHandle,
    }) satisfies GreaterRealmVerifiedPrivateShortlistMetrics));
    const multiReview = {
      ...review,
      candidates: multiCandidates,
    } as unknown as GreaterRealmSanitizedReview;
    expect(() => buildGreaterRealmPrivateCandidateShortlist(
      multiReview,
      multiPrivateMetrics,
    )).toThrow('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');

    expect(() => buildGreaterRealmPrivateCandidateShortlist({
      ...review,
      candidates: review.candidates.map((entry, index) => index === 0
        ? {
            ...entry,
            biomes: { ...entry.biomes, incompatibleBiomeLandformPairCount: 1 },
          }
        : entry),
    }, privateMetrics)).toThrow('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    expect(() => buildGreaterRealmPrivateCandidateShortlist(
      review,
      privateMetrics.slice(1),
    )).toThrow('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
    expect(() => buildGreaterRealmPrivateCandidateShortlist(
      review,
      privateMetrics.map((entry, index) => index === 0
        ? { ...entry, gateRouteRedundancyProof: false }
        : entry),
    )).toThrow('GREATER_REALM_PRIVATE_SHORTLIST_INVALID');
  });

  it.each([
    Object.freeze({
      label: 'named seed argument',
      arguments: Object.freeze([
        'generate-candidates',
        '--seed',
        'ab'.repeat(32),
      ]),
      environment: Object.freeze({}),
    }),
    Object.freeze({
      label: 'unnamed secret-like argument',
      arguments: Object.freeze([
        'generate-candidates',
        'cd'.repeat(32),
      ]),
      environment: Object.freeze({}),
    }),
    Object.freeze({
      label: 'reserved generation environment key',
      arguments: Object.freeze(['generate-candidates']),
      environment: Object.freeze({ WARPKEEP_GREATER_REALM_SEED: 'controlled-test-value' }),
    }),
    Object.freeze({
      label: 'secret-like generic environment value',
      arguments: Object.freeze(['generate-candidates']),
      environment: Object.freeze({ GENERIC_CREDENTIAL: 'ef'.repeat(32) }),
    }),
  ])('rejects $label without reflecting private material', ({ arguments: args, environment }) => {
    const result = runAtlasCli(args, environment);
    const privateValues = [
      ...args.filter(value => value.length >= 32),
      ...Object.values(environment).filter(value => value.length >= 32),
    ];

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_PRIVATE_INVOCATION_REJECTED\n');
    for (const value of privateValues) {
      expect(`${result.stdout}${result.stderr}`).not.toContain(value);
    }
  });

  it('accepts exactly one explicitly requested generated world', () => {
    expect(greaterRealmCliArgumentTestSeams.generatedWorldCount('1')).toBe(1);
    for (const rejected of ['0', '2', '16']) {
      expect(() => greaterRealmCliArgumentTestSeams.generatedWorldCount(rejected))
        .toThrow('GREATER_REALM_CLI_INTEGER_INVALID');
    }
  });

  it('derives complete batch inventory from the private preview contract', () => {
    const expectedCandidateFiles = 3 + GREATER_REALM_PRIVATE_PREVIEW_COUNT;
    expect(greaterRealmCliArgumentTestSeams.privateBatchInventory(1)).toEqual({
      directoryCount: 4,
      entryCount: 3 + expectedCandidateFiles + 4,
      fileCount: 3 + expectedCandidateFiles,
    });
    expect(greaterRealmCliArgumentTestSeams.privateBatchInventory(1, true, true)).toEqual({
      directoryCount: 4,
      entryCount: 3 + expectedCandidateFiles + 2 + 4,
      fileCount: 3 + expectedCandidateFiles + 2,
    });
  });

  it('rejects tracked, untracked, and ignored importer drift but allows outside-scope drift', () => {
    const fixture = provenanceFixture();
    const world = join(fixture.root, 'spacetimedb', 'src', 'world.ts');
    const untracked = join(fixture.root, 'spacetimedb', 'src', 'untracked-drift.ts');
    const ignored = join(fixture.root, 'spacetimedb', 'src', 'ignored-drift.ts');

    expect(() => greaterRealmCliArgumentTestSeams.assertGeneratorSourceProvenance(
      fixture.commit,
      fixture.root,
    )).not.toThrow();

    writeFileSync(world, 'export const world = 2;\n');
    expect(() => greaterRealmCliArgumentTestSeams.assertGeneratorSourceProvenance(
      fixture.commit,
      fixture.root,
    )).toThrow('GREATER_REALM_PRIVATE_SOURCE_MISMATCH');
    writeFileSync(world, 'export const world = 1;\n');

    writeFileSync(untracked, 'export const untracked = true;\n');
    expect(() => greaterRealmCliArgumentTestSeams.assertGeneratorSourceProvenance(
      fixture.commit,
      fixture.root,
    )).toThrow('GREATER_REALM_PRIVATE_SOURCE_MISMATCH');
    rmSync(untracked);

    writeFileSync(ignored, 'export const ignored = true;\n');
    expect(() => greaterRealmCliArgumentTestSeams.assertGeneratorSourceProvenance(
      fixture.commit,
      fixture.root,
    )).toThrow('GREATER_REALM_PRIVATE_SOURCE_MISMATCH');
    rmSync(ignored);

    writeFileSync(join(fixture.root, 'client', 'renderer.ts'), 'export const renderer = 2;\n');
    writeFileSync(join(fixture.root, 'outside-scope.txt'), 'outside scope\n');
    expect(() => greaterRealmCliArgumentTestSeams.assertGeneratorSourceProvenance(
      fixture.commit,
      fixture.root,
    )).not.toThrow();
  });

  it('advances past npm canonical-root metadata to CLI argument validation', () => {
    const result = runAtlasCli(
      ['generate-candidates', '--count', 'not-an-integer'],
      {
        PWD: repositoryRoot,
        INIT_CWD: repositoryRoot,
        npm_config_local_prefix: repositoryRoot,
      },
    );

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_CLI_INTEGER_INVALID\n');
  });

  it('accepts only one verified batch handle for a runtime release export', () => {
    expect(greaterRealmCliArgumentTestSeams.runtimeReleaseExport([
      '--batch',
      'GR-B-AAAAAAAAAAAAAAAA',
    ])).toEqual(expect.objectContaining({
      command: 'export-runtime-release',
      batchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
    }));
    for (const rejected of [
      [],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--candidate', 'GR-A-AAAAAAAAAAAAAAAA'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--output', '/tmp/release'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--resume'],
    ]) {
      expect(() => greaterRealmCliArgumentTestSeams.runtimeReleaseExport(rejected))
        .toThrow('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  });

  it('binds the PTR release script to the fixed batch-only PTR command', () => {
    expect(greaterRealmCliArgumentTestSeams.ptrRuntimeReleaseExport([
      '--batch',
      'GR-B-AAAAAAAAAAAAAAAA',
    ])).toEqual(expect.objectContaining({
      command: 'export-ptr-runtime-release',
      batchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
    }));
    for (const rejected of [
      [],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--candidate', 'GR-A-AAAAAAAAAAAAAAAA'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--output', '/tmp/ptr-release'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--resume'],
    ]) {
      expect(() => greaterRealmCliArgumentTestSeams.ptrRuntimeReleaseExport(rejected))
        .toThrow('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
    const packageJson = JSON.parse(
      readFileSync(join(repositoryRoot, 'package.json'), 'utf8'),
    ) as { scripts: Record<string, string> };
    expect(packageJson.scripts['atlas:export-ptr-runtime-release']).toBe(
      'node scripts/atlas/greater-realm-toolchain-bootstrap.mjs export-ptr-runtime-release',
    );
  });

  it('accepts only one verified batch handle for the fixed pending-owner export', () => {
    expect(greaterRealmCliArgumentTestSeams.pendingOwnerReportExport([
      '--batch',
      'GR-B-AAAAAAAAAAAAAAAA',
    ])).toEqual(expect.objectContaining({
      command: 'export-pending-owner-report',
      batchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
    }));
    for (const rejected of [
      [],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--output', '/tmp/report.json'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--input', '/tmp/report.json'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--candidate', 'GR-A-AAAAAAAAAAAAAAAA'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--resume'],
    ]) {
      expect(() => greaterRealmCliArgumentTestSeams.pendingOwnerReportExport(rejected))
        .toThrow('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  });

  it('accepts only one verified batch handle for owner-private report retention', () => {
    expect(greaterRealmCliArgumentTestSeams.pendingOwnerReportRetention([
      '--batch',
      'GR-B-AAAAAAAAAAAAAAAA',
    ])).toEqual(expect.objectContaining({
      command: 'retain-pending-owner-report',
      batchHandle: 'GR-B-AAAAAAAAAAAAAAAA',
    }));
    for (const rejected of [
      [],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--output', '/tmp/report.json'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--input', '/tmp/report.json'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--candidate', 'GR-A-AAAAAAAAAAAAAAAA'],
      ['--batch', 'GR-B-AAAAAAAAAAAAAAAA', '--resume'],
    ]) {
      expect(() => greaterRealmCliArgumentTestSeams.pendingOwnerReportRetention(rejected))
        .toThrow('GREATER_REALM_CLI_ARGUMENTS_INVALID');
    }
  });

  it('binds accepted replay to atlas and manifest authority together', () => {
    const atlasDigest = 'a'.repeat(64);
    const manifestDigest = 'b'.repeat(64);
    const accepted = greaterRealmCliArgumentTestSeams.acceptedCandidateDigest(
      atlasDigest,
      manifestDigest,
    );
    expect(greaterRealmCliArgumentTestSeams.acceptedCandidateDigest(
      atlasDigest,
      'c'.repeat(64),
    )).not.toBe(accepted);
    expect(greaterRealmCliArgumentTestSeams.acceptedCandidateDigest(
      'd'.repeat(64),
      manifestDigest,
    )).not.toBe(accepted);
  });

  it('refuses a private workspace inside the repository before writing anything', () => {
    expect(existsSync(forbiddenWorkspace)).toBe(false);

    const result = runAtlasCli([
      'generate-candidates',
      '--workspace',
      forbiddenWorkspace,
      '--count',
      '1',
      '--maximum-attempts',
      '8',
    ]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_PRIVATE_ROOT_REPOSITORY_OVERLAP\n');
    expect(result.stderr).not.toContain(forbiddenWorkspace);
    expect(existsSync(forbiddenWorkspace)).toBe(false);
  });

  it('rejects every request for more than the one authorized world', () => {
    const result = runAtlasCli([
      'generate-candidates',
      '--count',
      '16',
      '--maximum-attempts',
      '8',
    ]);

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('GREATER_REALM_CLI_INTEGER_INVALID\n');
  });

  it('rejects combining checkpoint abort with generation or resume options', () => {
    for (const extra of [
      ['--resume'],
      ['--count', '1'],
      ['--maximum-attempts', '8'],
    ]) {
      const result = runAtlasCli([
        'generate-candidates',
        '--abort-checkpoint',
        ...extra,
      ]);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('GREATER_REALM_CLI_ARGUMENTS_INVALID\n');
    }
  });

  it('requires an exactly clean C3 Git tree before preparing the C4 report', () => {
    const fixture = provenanceFixture();
    expect(greaterRealmCliArgumentTestSeams.cleanSourceCommit(fixture.root))
      .toBe(fixture.commit);

    writeFileSync(join(fixture.root, 'outside-scope.txt'), 'dirty source\n');
    expect(() => greaterRealmCliArgumentTestSeams.cleanSourceCommit(fixture.root))
      .toThrow('GREATER_REALM_CLI_SOURCE_TREE_DIRTY');
  });

  it('allows only the exact C0-to-C3 v17 policy transition while preparing C4', () => {
    const fixture = provenanceFixture();
    writeFileSync(
      join(fixture.root, 'spacetimedb', 'src', 'greaterRealmV17Policy.ts'),
      'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;\n'
        + 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = true;\n',
    );
    runFixtureGit(fixture.root, ['add', 'spacetimedb/src/greaterRealmV17Policy.ts']);
    runFixtureGit(fixture.root, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'reviewed v17 transition',
    ]);
    expect(() => greaterRealmCliArgumentTestSeams
      .assertRetainedPendingOwnerSourceLineage(
        fixture.commit,
        fixture.root,
      ))
      .not.toThrow();

    writeFileSync(
      join(fixture.root, 'spacetimedb', 'src', 'world.ts'),
      'export const world = 2;\n',
    );
    runFixtureGit(fixture.root, ['add', 'spacetimedb/src/world.ts']);
    runFixtureGit(fixture.root, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'unreviewed generator drift',
    ]);
    expect(() => greaterRealmCliArgumentTestSeams
      .assertRetainedPendingOwnerSourceLineage(fixture.commit, fixture.root))
      .toThrow('GREATER_REALM_PENDING_OWNER_REPORT_SOURCE_LINEAGE_INVALID');
  });

  it('phase-bounds retained publication to inert 0.3.43 activation-only source', () => {
    expect(() => greaterRealmCliArgumentTestSeams
      .assertPendingOwnerRetentionSourcePhase('pre-generation'))
      .not.toThrow();
    for (const phase of ['closed-review', 'import-only', 'activation-only']) {
      expect(() => greaterRealmCliArgumentTestSeams
        .assertPendingOwnerRetentionSourcePhase(phase))
        .toThrow('GREATER_REALM_RETAINED_PENDING_OWNER_REPORT_SOURCE_PHASE_INVALID');
    }

    expect(() => greaterRealmCliArgumentTestSeams
      .assertPendingOwnerPublicationSourcePhase('activation-only'))
      .not.toThrow();
    for (const phase of ['pre-generation', 'import-only', 'activation-client']) {
      expect(() => greaterRealmCliArgumentTestSeams
        .assertPendingOwnerPublicationSourcePhase(phase))
        .toThrow('GREATER_REALM_PENDING_OWNER_REPORT_SOURCE_PHASE_INVALID');
    }

    const fixture = publicEvidenceFixture();
    writeFileSync(join(fixture.repositoryRoot, 'package.json'), JSON.stringify({
      name: 'warpkeep',
      version: '0.3.43',
      description: 'A Farcaster-connected persistent strategy world in active Alpha development.',
    }));
    writeFileSync(join(fixture.repositoryRoot, 'package-lock.json'), JSON.stringify({
      name: 'warpkeep',
      version: '0.3.43',
      packages: { '': { name: 'warpkeep', version: '0.3.43' } },
    }));
    expect(() => greaterRealmCliArgumentTestSeams
      .assertPendingOwnerPublicationReleaseIdentity(fixture.repositoryRoot))
      .not.toThrow();

    writeFileSync(join(fixture.repositoryRoot, 'package.json'), JSON.stringify({
      name: 'warpkeep',
      version: '0.4.0',
      description: 'A six-region world foundation is available; the core gameplay loop remains incomplete. Invite-only Alpha.',
    }));
    expect(() => greaterRealmCliArgumentTestSeams
      .assertPendingOwnerPublicationReleaseIdentity(fixture.repositoryRoot))
      .toThrow('GREATER_REALM_PENDING_OWNER_REPORT_RELEASE_IDENTITY_INVALID');
  });

  it('regenerates rejected attempts and rejects a tampered failure ledger', () => {
    const rootSeed = Uint8Array.from(createHash('sha256')
      .update('greater-realm-test-root\0', 'utf8')
      .update('52', 'utf8')
      .digest());
    const candidate = generateGreaterRealmCandidate({ rootSeed, candidateOrdinal: 0 });
    try {
      expect(candidate.aggregate.eligible).toBe(false);
      const rejectedAttempt = Object.freeze({
        kind: 'proof-rejection' as const,
        candidateOrdinal: 0,
        activeCellCount: candidate.grid.cellCount,
        failedProofs: candidate.privateMetrics.eligibilityFailureCodes,
      });
      expect(() => verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed,
        rejectedAttempt,
      })).not.toThrow();
      expect(() => verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed,
        rejectedAttempt: Object.freeze({
          ...rejectedAttempt,
          failedProofs: Object.freeze([
            'CONTROLLED_TAMPERED_PROOF',
            ...rejectedAttempt.failedProofs.slice(1),
          ]),
        }),
      })).toThrow('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
      expect(() => verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_ACTIVE_MASK_EMPTY',
        }),
      })).toThrow('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
    } finally {
      clearGreaterRealmPrivateCandidateBuffers(candidate);
      rootSeed.fill(0);
    }
  // Four independent full-candidate generations prove that verification never
  // trusts the supplied rejection ledger. Two-worker CI measured 329 seconds;
  // retain a bounded eight-minute ceiling without weakening replay coverage.
  }, 480_000);

  it('replays out-of-contract active grids only through the branded geography ledger', () => {
    const rootSeed = Uint8Array.from(createHash('sha256')
      .update('greater-realm-layout-yield-sample-1\0', 'utf8')
      .digest());
    try {
      expect(() => verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE',
        }),
      })).not.toThrow();
      expect(() => verifyGreaterRealmPrivateRejectedAttempt({
        rootSeed,
        rejectedAttempt: Object.freeze({
          kind: 'geography-exhaustion',
          candidateOrdinal: 0,
          rejectionCode: 'GREATER_REALM_AUDIT_GRID_SIZE_INVALID' as never,
        }),
      })).toThrow('GREATER_REALM_PRIVATE_ATTEMPT_LEDGER_INVALID');
    } finally {
      rootSeed.fill(0);
    }
  }, 120_000);

  it('restricts public evidence exports to one canonical JSON basename', () => {
    const expected = resolve(
      repositoryRoot,
      'docs/evidence/greater-realm/candidate-review-v1.json',
    );
    expect(resolveGreaterRealmPublicEvidenceDestination(
      'docs/evidence/greater-realm/candidate-review-v1.json',
    )).toBe(expected);

    for (const rejected of [
      'docs/evidence/greater-realm/nested/review.json',
      'docs/evidence/greater-realm/../review.json',
      'docs/evidence/greater-realm/Review.json',
      '/tmp/greater-realm-review.json',
    ]) {
      expect(() => resolveGreaterRealmPublicEvidenceDestination(rejected))
        .toThrow('GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_INVALID');
    }
  });

  it('publishes exact sanitized evidence bytes with pinned public-file metadata', () => {
    const fixture = publicEvidenceFixture();
    const path = 'docs/evidence/greater-realm/review-test.json';
    const destination = join(fixture.repositoryRoot, path);
    const bytes = Buffer.from('{"kind":"sanitized-test","value":7}\n', 'utf8');

    greaterRealmPublicEvidenceTestSeams.write({
      repositoryRoot: fixture.repositoryRoot,
      path,
      bytes,
    });

    const status = statSync(destination);
    expect(readFileSync(destination)).toEqual(bytes);
    expect(status.isFile()).toBe(true);
    expect(status.nlink).toBe(1);
    expect(status.size).toBe(bytes.byteLength);
    expect(status.mode & 0o777).toBe(0o644);
    if (process.getuid !== undefined) expect(status.uid).toBe(process.getuid());
  });

  it('rejects temporary-file substitution without deleting the replacement', () => {
    const fixture = publicEvidenceFixture();
    const path = 'docs/evidence/greater-realm/review-substitution.json';
    const destination = join(fixture.repositoryRoot, path);
    const replacement = Buffer.from('attacker-controlled replacement\n', 'utf8');
    let temporary = '';

    expect(() => greaterRealmPublicEvidenceTestSeams.write({
      repositoryRoot: fixture.repositoryRoot,
      path,
      bytes: Buffer.from('{"kind":"sanitized-test"}\n', 'utf8'),
      beforeInstall: paths => {
        temporary = paths.temporaryPath;
        renameSync(temporary, `${temporary}.displaced`);
        writeFileSync(temporary, replacement, { mode: 0o644 });
      },
    })).toThrow('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');

    expect(existsSync(destination)).toBe(false);
    expect(readFileSync(temporary)).toEqual(replacement);
  });

  it('rejects parent substitution while retaining the pinned original directory', () => {
    const fixture = publicEvidenceFixture();
    const path = 'docs/evidence/greater-realm/review-parent-race.json';
    const destination = join(fixture.repositoryRoot, path);
    const displacedParent = `${fixture.evidenceRoot}.displaced`;

    expect(() => greaterRealmPublicEvidenceTestSeams.write({
      repositoryRoot: fixture.repositoryRoot,
      path,
      bytes: Buffer.from('{"kind":"sanitized-test"}\n', 'utf8'),
      beforeInstall: ({ parentPath }) => {
        renameSync(parentPath, displacedParent);
        mkdirSync(parentPath, { mode: 0o755 });
      },
    })).toThrow(/GREATER_REALM_PUBLIC_EVIDENCE_DESTINATION_(?:CHANGED|INVALID)/u);

    expect(existsSync(destination)).toBe(false);
    expect(existsSync(join(displacedParent, 'review-parent-race.json'))).toBe(false);
  });

  it('fails closed when sanitized evidence bytes or mode drift before install', () => {
    for (const mutate of [
      (temporary: string) => writeFileSync(
        temporary,
        Buffer.from('{"kind":"tampered-value"}\n', 'utf8'),
      ),
      (temporary: string) => chmodSync(temporary, 0o600),
    ]) {
      const fixture = publicEvidenceFixture();
      const path = 'docs/evidence/greater-realm/review-drift.json';
      const destination = join(fixture.repositoryRoot, path);
      expect(() => greaterRealmPublicEvidenceTestSeams.write({
        repositoryRoot: fixture.repositoryRoot,
        path,
        bytes: Buffer.from('{"kind":"sanitized-test"}\n', 'utf8'),
        beforeInstall: ({ temporaryPath }) => mutate(temporaryPath),
      })).toThrow('GREATER_REALM_PUBLIC_EVIDENCE_WRITE_FAILED');
      expect(existsSync(destination)).toBe(false);
    }
  });
});
