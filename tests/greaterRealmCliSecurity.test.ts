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
  greaterRealmPublicEvidenceTestSeams,
  resolveGreaterRealmPublicEvidenceDestination,
  verifyGreaterRealmPrivateRejectedAttempt,
} from '../scripts/atlas/greater-realm-cli';
import { generateGreaterRealmCandidate } from '../scripts/atlas/greater-realm-candidate-generator';
import { clearGreaterRealmPrivateCandidateBuffers } from '../scripts/atlas/greater-realm-candidate-package';
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
  it('creates pending unranked owner-review sets without choosing a winner', () => {
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
      candidate('C', [8_000, 5_000, 5_000, 5, 2]),
      candidate('D', [8_000, 5_000, 5_000, 5, 2]),
      candidate('E', [8_000, 5_000, 5_000, 5, 2]),
      candidate('F', [8_000, 5_000, 5_000, 12, 9]),
      candidate('G', [8_100, 5_100, 5_100, 6, 3]),
      candidate('H', [7_000, 4_000, 4_000, 4, 1]),
      candidate('I', [7_100, 4_100, 4_100, 4, 1]),
    ];
    const privateMetrics = candidates.map((entry, index) => Object.freeze({
      candidateHandle: entry.candidateHandle,
      maximumBoundaryRadiusShareBasisPoints: 1_000,
      rotationalSimilarityBasisPoints: 4_000,
      maximumAlignedBoundaryRun: 24,
      saltwaterBoundaryBasisPoints: 9_900,
      minimumLargestPassableRegionShareBasisPoints: index === 1 ? 9_900 : 8_000,
      maximumMinorPassableFragmentShareBasisPoints: 500,
      maximumPassableBoundaryDensityBasisPoints: 2_000,
      maximumPassableTendrilShareBasisPoints: 300,
      throneAnchorBarrierClearance: 8,
      gateRouteRedundancyProof: true,
      measuredMinimumBarrierWidth: 4,
      measuredMaximumBarrierWidth: 8,
      chunkCount: 700,
      chunkPopulationSpread: index === 2 ? 1 : 100,
      chunkUpperTailSpread: 20,
      highlandBarrierShareBasisPoints: 8_000,
      barrierMeanElevationAdvantage: 2_000,
      barrierMeanUpliftAdvantage: 700,
      ridgeUpliftAlignmentBasisPoints: index === 3 ? 9_900 : 7_000,
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
    const reversed = buildGreaterRealmPrivateCandidateShortlist({
      ...review,
      candidates: [...review.candidates].reverse(),
    }, [...privateMetrics].reverse());

    expect(shortlist).toEqual(reversed);
    expect(shortlist.shortlistCount).toBeGreaterThanOrEqual(3);
    expect(shortlist.shortlistCount).toBeLessThanOrEqual(5);
    expect(shortlist.candidateHandles).toHaveLength(shortlist.shortlistCount);
    expect(shortlist.candidateHandles).toEqual(
      candidates.slice(0, 5).map(entry => entry.candidateHandle).sort(),
    );
    expect(shortlist.selectionStatus).toBe('pending');
    expect(shortlist.selectedCandidateHandle).toBeNull();
    expect(shortlist.ranked).toBe(false);
    expect(shortlist.automaticSelection).toBe(false);
    expect(shortlist.method).toBe('pareto-private-vector-diversity-v2');
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

    const single = buildGreaterRealmPrivateCandidateShortlist({
      ...review,
      candidates: review.candidates.slice(0, 1),
    }, privateMetrics.slice(0, 1));
    expect(single.shortlistCount).toBe(1);
    expect(single.candidateHandles).toEqual([candidates[0]!.candidateHandle]);
    expect(single.method).toBe('single-candidate-reference-review-v1');
    expect(single.selectionStatus).toBe('pending');
    expect(single.selectedCandidateHandle).toBeNull();
    expect(single.ranked).toBe(false);
    expect(single.automaticSelection).toBe(false);

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

  it('rejects an attempt budget smaller than the requested candidate count', () => {
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
    expect(result.stderr).toBe('GREATER_REALM_CLI_ARGUMENTS_INVALID\n');
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
  }, 180_000);

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
