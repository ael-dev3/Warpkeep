// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  existsSync,
  linkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  GREATER_REALM_PROOF_KEYS,
  type GreaterRealmSanitizedCandidateSource,
  type GreaterRealmSanitizedReviewSource,
} from '../scripts/atlas/greater-realm-contracts';
import {
  createGreaterRealmPendingOwnerReport,
  GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA,
  parseGreaterRealmPendingOwnerReport,
  serializeGreaterRealmPendingOwnerReport,
} from '../scripts/atlas/greater-realm-pending-owner-report';
import {
  createGreaterRealmSanitizedReview,
} from '../scripts/atlas/greater-realm-sanitized-review';
import { greaterRealmPublicEvidenceTestSeams } from '../scripts/atlas/greater-realm-cli';
import { runGreaterRealmTrustedGit } from '../scripts/atlas/greater-realm-git';
import { openGreaterRealmPrivateWorkspace } from '../scripts/atlas/greater-realm-private-workspace';

const CANDIDATE_HANDLE = 'GR-A-AAAAAAAAAAAAAAAA';
const REVIEW_BATCH_HANDLE = 'GR-B-BBBBBBBBBBBBBBBB';
const SOURCE_CLOSURE = Object.freeze({
  profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1' as const,
  manifestSha256: 'e'.repeat(64),
});

function candidate(
  candidateHandle = CANDIDATE_HANDLE,
): GreaterRealmSanitizedCandidateSource {
  return Object.freeze({
    candidateHandle,
    eligible: true,
    activeCellCount: 120_000,
    landCellCount: 80_000,
    waterCellCount: 40_000,
    tierCellCounts: Object.freeze({ tierI: 86_400, tierII: 28_800, tierIII: 4_800 }),
    regionSizeRanges: Object.freeze({
      tierI: Object.freeze({ minimum: 14_000, maximum: 15_000 }),
      tierII: Object.freeze({ minimum: 9_000, maximum: 10_000 }),
      tierIII: Object.freeze({ minimum: 4_800, maximum: 4_800 }),
    }),
    hydrology: Object.freeze({
      majorOceanSeaBodies: 5,
      majorRivers: 60,
      minorStreams: 180,
      lakes: 72,
    }),
    geology: Object.freeze({
      pseudoTectonicDomains: 10,
      mountainSystems: 14,
      watersheds: 60,
    }),
    topography: Object.freeze({
      signedElevationMinimum: -18_400,
      signedElevationMaximum: 31_600,
      slopeP50: 420,
      slopeP95: 3_900,
      ridgeCellCount: 9_200,
      plateauCellCount: 11_400,
      basinCellCount: 8_600,
      coastCellCount: 4_800,
    }),
    biomes: Object.freeze({
      visualClassCount: 14,
      minimumPerRegionVisualClassCount: 4,
      minimumTierIVisualClassCount: 6,
      minimumTierIIVisualClassCount: 5,
      tierIIIVisualClassCount: 4,
      minimumTierIMajorVisualClassCount: 4,
      minimumTierITransitionVisualClassCount: 2,
      minimumTierIIMajorVisualClassCount: 5,
      tierIIIMajorVisualClassCount: 3,
      maximumTierISingleBiomeShareBasisPoints: 3_800,
      incompatibleVisualAdjacencyCount: 0,
      incompatibleBiomeLandformPairCount: 0,
    }),
    quality: Object.freeze({
      naturalnessBasisPoints: 8_720,
      axialArtifactBasisPoints: 410,
      ridgeContinuityBasisPoints: 8_440,
      hydrologyCoherenceBasisPoints: 9_010,
    }),
    gateCount: 18,
    castleSlotCount: 600,
    proofs: Object.freeze(Object.fromEntries(
      GREATER_REALM_PROOF_KEYS.map(key => [key, true]),
    )) as GreaterRealmSanitizedCandidateSource['proofs'],
    performance: Object.freeze({
      generationMillisecondsRounded: 180_000,
      processPeakMemoryMiBRounded: 768,
    }),
  });
}

function reviewSource(
  candidates: readonly GreaterRealmSanitizedCandidateSource[] = [candidate()],
): GreaterRealmSanitizedReviewSource {
  return Object.freeze({
    generatorVersion: 'greater-realm-v2-natural-continent',
    sourceCommit: 'a'.repeat(40),
    reviewBatchHandle: REVIEW_BATCH_HANDLE,
    selectionStatus: 'pending',
    selectedCandidateHandle: null,
    candidates: Object.freeze(candidates),
  });
}

function sanitizedReview(
  candidates: readonly GreaterRealmSanitizedCandidateSource[] = [candidate()],
) {
  return createGreaterRealmSanitizedReview(reviewSource(candidates));
}

function privateBatchBinding(review = sanitizedReview()) {
  return Object.freeze({
    sourceCommit: review.sourceCommit,
    batchSeedDigest: 'b'.repeat(64),
    sanitizedReviewDigest: review.reportDigest,
    requestedCount: 1,
    maximumAttempts: 1,
    attemptsUsed: 1,
    candidates: Object.freeze([Object.freeze({
      candidateHandle: review.candidates[0]!.candidateHandle,
      candidateOrdinal: 0,
      manifestDigest: 'c'.repeat(64),
      atlasDigest: 'd'.repeat(64),
    })]),
    rejectedAttempts: Object.freeze([]),
  });
}

function runFixtureGit(repositoryRoot: string, arguments_: readonly string[]): string {
  const result = runGreaterRealmTrustedGit(arguments_, repositoryRoot);
  if (
    result.error
    || result.signal !== null
    || result.status !== 0
    || result.stderr.length !== 0
  ) throw new Error('GREATER_REALM_PENDING_OWNER_TEST_GIT_FAILED');
  return result.stdout.trim();
}

describe('Greater Realm pending owner report', () => {
  it('projects one verified world into an explicit historical retention state', () => {
    const source = sanitizedReview();
    const report = createGreaterRealmPendingOwnerReport({
      sanitizedReview: source,
      privatePackageVerified: true,
    });

    expect(report).toMatchObject({
      schema: GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA,
      snapshotLifecycle: 'retained-before-owner-selection',
      atlasId: 'GENESIS_001_GREATER_REALM',
      worldCountAtRetention: 1,
      automatedValidationAtRetention:
        'private-package-and-sanitized-aggregate-verified',
      ownerValidationAtRetention: 'pending',
      selectionAtRetention: 'pending',
      selectedCandidateHandleAtRetention: null,
      activationAtRetention: 'inactive',
      productionAtRetention: 'untouched',
      sourceReportDigest: source.reportDigest,
    });
    expect(report.candidateAtRetention).toEqual(source.candidates[0]);
    expect(report.candidateAtRetention.insideApprovedRange).toBe(true);
    expect(Object.values(report.candidateAtRetention.proofs).every(Boolean)).toBe(true);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it('serializes deterministically and revalidates the source aggregate digest', () => {
    const report = createGreaterRealmPendingOwnerReport({
      sanitizedReview: sanitizedReview(),
      privatePackageVerified: true,
    });
    const reordered = Object.fromEntries(Object.entries(report).reverse());
    const first = serializeGreaterRealmPendingOwnerReport(report);
    const second = serializeGreaterRealmPendingOwnerReport(reordered);

    expect(second).toBe(first);
    expect(parseGreaterRealmPendingOwnerReport(JSON.parse(first))).toEqual(report);

    const tampered = structuredClone(report) as unknown as {
      candidateAtRetention: { quality: { naturalnessBasisPoints: number } };
    };
    tampered.candidateAtRetention.quality.naturalnessBasisPoints -= 1;
    expect(() => parseGreaterRealmPendingOwnerReport(tampered)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_DIGEST_MISMATCH',
    );
  });

  it('rejects unverified, selected, and multi-world sources', () => {
    const pending = sanitizedReview();
    expect(() => createGreaterRealmPendingOwnerReport({
      sanitizedReview: pending,
      privatePackageVerified: false,
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_PACKAGE_NOT_VERIFIED');

    const selected = createGreaterRealmSanitizedReview({
      ...reviewSource(),
      selectionStatus: 'selected',
      selectedCandidateHandle: CANDIDATE_HANDLE,
    });
    expect(() => createGreaterRealmPendingOwnerReport({
      sanitizedReview: selected,
      privatePackageVerified: true,
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_REQUIRES_ONE_PENDING_WORLD');

    const multiple = sanitizedReview([
      candidate('GR-A-AAAAAAAAAAAAAAAA'),
      candidate('GR-A-AAAAAAAAAAAAAAAB'),
    ]);
    expect(() => createGreaterRealmPendingOwnerReport({
      sanitizedReview: multiple,
      privatePackageVerified: true,
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_REQUIRES_ONE_PENDING_WORLD');
  });

  it('cannot accept raw private arrays, coordinates, seeds, or unknown report fields', () => {
    const forbiddenSeedKey = `seed${'Material'}`;
    expect(() => createGreaterRealmPendingOwnerReport({
      sanitizedReview: [{ q: 2, r: -1, [forbiddenSeedKey]: [1, 2, 3] }],
      privatePackageVerified: true,
    })).toThrow();

    const coordinateLeak = structuredClone(sanitizedReview()) as unknown as {
      candidates: Array<Record<string, unknown>>;
    };
    coordinateLeak.candidates[0]!.coordinates = [[2, -1]];
    expect(() => createGreaterRealmPendingOwnerReport({
      sanitizedReview: coordinateLeak,
      privatePackageVerified: true,
    })).toThrow('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');

    const report = createGreaterRealmPendingOwnerReport({
      sanitizedReview: sanitizedReview(),
      privatePackageVerified: true,
    });
    expect(() => parseGreaterRealmPendingOwnerReport({
      ...report,
      hiddenSeed: 'not-public',
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');

    const { snapshotLifecycle: _historicalMarker, ...ambiguous } = report;
    expect(() => parseGreaterRealmPendingOwnerReport({
      ...ambiguous,
      worldCount: 1,
      candidate: report.candidateAtRetention,
      automatedValidationStatus:
        'private-package-and-sanitized-aggregate-verified',
      ownerValidationStatus: 'pending',
      selectionStatus: 'pending',
      selectedCandidateHandle: null,
      activationStatus: 'inactive',
      productionUntouched: true,
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');

    expect(() => parseGreaterRealmPendingOwnerReport({
      schema: 'warpkeep.greater-realm.pending-owner-report.v1',
      atlasId: report.atlasId,
      generatorVersion: report.generatorVersion,
      sourceCommit: report.sourceCommit,
      reviewBatchHandle: report.reviewBatchHandle,
      sourceReportDigest: report.sourceReportDigest,
      worldCount: 1,
      candidate: report.candidateAtRetention,
      automatedValidationStatus:
        'private-package-and-sanitized-aggregate-verified',
      ownerValidationStatus: 'pending',
      selectionStatus: 'pending',
      selectedCandidateHandle: null,
      activationStatus: 'inactive',
      productionUntouched: true,
      privacyBoundary: report.privacyBoundary,
    })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_INVALID');
  });

  it('rejects source accessors without executing them', () => {
    let executed = false;
    const source: Record<string, unknown> = {
      privatePackageVerified: true,
    };
    Object.defineProperty(source, 'sanitizedReview', {
      enumerable: true,
      get: () => {
        executed = true;
        return sanitizedReview();
      },
    });

    expect(() => createGreaterRealmPendingOwnerReport(source)).toThrow(
      'GREATER_REALM_PENDING_OWNER_REPORT_INVALID',
    );
    expect(executed).toBe(false);
  });

  it('contains only aggregate evidence and explicit non-activation state', () => {
    const serialized = serializeGreaterRealmPendingOwnerReport(
      createGreaterRealmPendingOwnerReport({
        sanitizedReview: sanitizedReview(),
        privatePackageVerified: true,
      }),
    );

    expect(serialized).not.toMatch(
      /(?:coordinate|seedMaterial|transform|chunkKey|layoutDigest|stageDigest|packageDigest|preview|screenshot|imagePath)/iu,
    );
    expect(serialized).toContain('"ownerValidationAtRetention": "pending"');
    expect(serialized).toContain('"activationAtRetention": "inactive"');
    expect(serialized).not.toMatch(
      /"(?:ownerValidationStatus|selectionStatus|activationStatus|productionUntouched)"/u,
    );
  });

  it('exports only reparsed canonical bytes with pinned public metadata', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-pending-owner-install-')));
    const repositoryRoot = join(root, 'repository');
    const evidenceRoot = join(repositoryRoot, 'docs', 'evidence', 'greater-realm');
    mkdirSync(evidenceRoot, { recursive: true, mode: 0o755 });
    const review = sanitizedReview();
    const destination = join(
      repositoryRoot,
      greaterRealmPublicEvidenceTestSeams.pendingOwnerReportPath,
    );
    try {
      const abandoned = `${destination}.${randomUUID()}.tmp`;
      writeFileSync(abandoned, 'partial', { mode: 0o600 });
      greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      });
      expect(existsSync(abandoned)).toBe(false);
      const installed = readFileSync(destination, 'utf8');
      expect(parseGreaterRealmPendingOwnerReport(JSON.parse(installed)))
        .toEqual(createGreaterRealmPendingOwnerReport({
          sanitizedReview: review,
          privatePackageVerified: true,
        }));
      expect(statSync(destination).mode & 0o777).toBe(0o644);

      // Exact replay is idempotent; an existing different artifact is never
      // replaced by a later generation attempt.
      const linked = `${destination}.${randomUUID()}.tmp`;
      linkSync(destination, linked);
      expect(statSync(destination).nlink).toBe(2);
      greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      });
      expect(existsSync(linked)).toBe(false);
      expect(statSync(destination).nlink).toBe(1);
      writeFileSync(destination, '{}\n', { mode: 0o644 });
      expect(() => greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      })).toThrow();
      expect(readFileSync(destination, 'utf8')).toBe('{}\n');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('atomically retains one immutable owner-private snapshot before selection', async () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-pending-owner-retain-')));
    const repositoryRoot = join(root, 'repository');
    const workspaceRoot = join(root, 'owner-workspace');
    mkdirSync(repositoryRoot, { mode: 0o755 });
    const workspace = openGreaterRealmPrivateWorkspace({
      repositoryRoot,
      workspaceRoot,
    });
    const review = sanitizedReview();
    const batch = privateBatchBinding(review);
    try {
      const first = await greaterRealmPublicEvidenceTestSeams.retainPendingOwnerReport({
        workspace,
        pendingReview: review,
        batch,
        sourceClosure: SOURCE_CLOSURE,
      });
      const second = await greaterRealmPublicEvidenceTestSeams.retainPendingOwnerReport({
        workspace,
        pendingReview: review,
        batch,
        sourceClosure: SOURCE_CLOSURE,
      });
      expect(second).toBe(first);
      expect(first).toBe(serializeGreaterRealmPendingOwnerReport(
        createGreaterRealmPendingOwnerReport({
          sanitizedReview: review,
          privatePackageVerified: true,
        }),
      ));
      expect(workspace.attestTree(
        greaterRealmPublicEvidenceTestSeams.retainedPendingOwnerReportDirectory(
          review.reviewBatchHandle,
        ),
      )).toEqual({
        directoryCount: 1,
        entryCount: 3,
        fileCount: 2,
        byteCount: expect.any(Number),
      });
      expect(existsSync(join(
        repositoryRoot,
        greaterRealmPublicEvidenceTestSeams.pendingOwnerReportPath,
      ))).toBe(false);

      expect(() => greaterRealmPublicEvidenceTestSeams.readRetainedPendingOwnerReport({
        workspace,
        pendingReview: review,
        batch: Object.freeze({
          ...batch,
          candidates: Object.freeze([Object.freeze({
            ...batch.candidates[0]!,
            atlasDigest: 'e'.repeat(64),
          })]),
        }),
        sourceClosure: SOURCE_CLOSURE,
      })).toThrow('GREATER_REALM_RETAINED_PENDING_OWNER_REPORT_INVALID');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('recovers only the fixed C3 writer namespace and rejects wrong replay bytes or drift', () => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'warpkeep-pending-owner-c4-prep-')));
    const repositoryRoot = join(root, 'repository');
    const evidenceRoot = join(repositoryRoot, 'docs', 'evidence', 'greater-realm');
    mkdirSync(evidenceRoot, { recursive: true, mode: 0o755 });
    writeFileSync(join(repositoryRoot, 'baseline.txt'), 'clean C3\n');
    runFixtureGit(repositoryRoot, ['init', '--quiet']);
    runFixtureGit(repositoryRoot, ['add', 'baseline.txt']);
    runFixtureGit(repositoryRoot, [
      '-c', 'user.name=Warpkeep Test',
      '-c', 'user.email=warpkeep-test@example.invalid',
      'commit', '--quiet', '-m', 'C3 fixture',
    ]);
    const head = runFixtureGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
    const review = sanitizedReview();
    const bytes = Buffer.from(serializeGreaterRealmPendingOwnerReport(
      createGreaterRealmPendingOwnerReport({
        sanitizedReview: review,
        privatePackageVerified: true,
      }),
    ), 'utf8');
    const path = join(
      repositoryRoot,
      greaterRealmPublicEvidenceTestSeams.pendingOwnerReportPath,
    );
    try {
      const interruptedTemporary = `${path}.${randomUUID()}.tmp`;
      writeFileSync(interruptedTemporary, 'interrupted write', { mode: 0o600 });
      expect(greaterRealmPublicEvidenceTestSeams
        .pendingOwnerReportStartupSourceCommit(repositoryRoot)).toBe(head);
      greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      });
      expect(existsSync(interruptedTemporary)).toBe(false);
      expect(readFileSync(path)).toEqual(bytes);
      expect(greaterRealmPublicEvidenceTestSeams
        .pendingOwnerReportStartupSourceCommit(repositoryRoot)).toBe(head);
      expect(greaterRealmPublicEvidenceTestSeams.assertPreparedWorktree({
        repositoryRoot,
        expectedHead: head,
        expectedBytes: bytes,
      })).toBe('fixed-untracked-snapshot');

      const linkedTemporary = `${path}.${randomUUID()}.tmp`;
      linkSync(path, linkedTemporary);
      expect(statSync(path).nlink).toBe(2);
      expect(greaterRealmPublicEvidenceTestSeams
        .pendingOwnerReportStartupSourceCommit(repositoryRoot)).toBe(head);
      greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      });
      expect(existsSync(linkedTemporary)).toBe(false);
      expect(statSync(path).nlink).toBe(1);
      expect(readFileSync(path)).toEqual(bytes);

      writeFileSync(path, '{}\n', { mode: 0o644 });
      expect(greaterRealmPublicEvidenceTestSeams
        .pendingOwnerReportStartupSourceCommit(repositoryRoot)).toBe(head);
      expect(() => greaterRealmPublicEvidenceTestSeams.exportPendingOwnerReport({
        repositoryRoot,
        review,
      })).toThrow();
      expect(readFileSync(path, 'utf8')).toBe('{}\n');
      writeFileSync(path, bytes, { mode: 0o644 });

      writeFileSync(join(repositoryRoot, 'unexpected.txt'), 'drift\n');
      expect(() => greaterRealmPublicEvidenceTestSeams
        .pendingOwnerReportStartupSourceCommit(repositoryRoot))
        .toThrow('GREATER_REALM_CLI_SOURCE_TREE_DIRTY');
      expect(() => greaterRealmPublicEvidenceTestSeams.assertPreparedWorktree({
        repositoryRoot,
        expectedHead: head,
        expectedBytes: bytes,
      })).toThrow('GREATER_REALM_PENDING_OWNER_REPORT_POSTCONDITION_INVALID');
      rmSync(join(repositoryRoot, 'unexpected.txt'));

      runFixtureGit(repositoryRoot, [
        'add',
        greaterRealmPublicEvidenceTestSeams.pendingOwnerReportPath,
      ]);
      runFixtureGit(repositoryRoot, [
        '-c', 'user.name=Warpkeep Test',
        '-c', 'user.email=warpkeep-test@example.invalid',
        'commit', '--quiet', '-m', 'track exact snapshot',
      ]);
      const trackedHead = runFixtureGit(
        repositoryRoot,
        ['rev-parse', '--verify', 'HEAD^{commit}'],
      );
      expect(greaterRealmPublicEvidenceTestSeams.assertPreparedWorktree({
        repositoryRoot,
        expectedHead: trackedHead,
        expectedBytes: bytes,
      })).toBe('exact-tracked-replay');
    } finally {
      bytes.fill(0);
      rmSync(root, { force: true, recursive: true });
    }
  });

  it('keeps generation and resume paths private until the explicit report export', () => {
    const source = readFileSync(
      join(process.cwd(), 'scripts', 'atlas', 'greater-realm-cli.ts'),
      'utf8',
    );
    const start = source.indexOf('async function generateSingleWorldCandidate(');
    const end = source.indexOf('async function abortSingleWorldCandidateGeneration(');
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const generationAndResume = source.slice(start, end);

    expect(generationAndResume).not.toContain('exportPendingOwnerReport(');
    expect(generationAndResume).not.toContain(
      'docs/evidence/greater-realm/pending-owner-review-v1.json',
    );
    expect(source).toContain("arguments_.command === 'retain-pending-owner-report'");
    expect(source).toContain("arguments_.command === 'export-pending-owner-report'");
    expect(source).not.toContain('allowPendingOwnerReportRecovery');
    expect(source.indexOf('retainPendingOwnerReport(')).toBeGreaterThan(end);
    expect(source.indexOf('exportPendingOwnerReport(retainedBytes);')).toBeGreaterThan(end);
    const exportBranch = source.indexOf(
      "if (arguments_.command === 'export-pending-owner-report') {",
    );
    const runtimeLock = source.indexOf("'locks/runtime-release-v1.lock'", exportBranch);
    const batchLock = source.indexOf('`locks/${batchHandle}.selection.lock`', runtimeLock);
    const installedReleaseRead = source.indexOf(
      'const installedRuntimeRelease = readGreaterRealmRuntimeRelease(workspace);',
      batchLock,
    );
    const releaseSeedOpen = source.indexOf(
      'const releaseSeed = openOrCreateGreaterRealmRuntimeReleaseSeed(workspace);',
      installedReleaseRead,
    );
    const exactRuntimeMatch = source.indexOf(
      'assertGreaterRealmRuntimeReleaseMatches(workspace, expectedRuntimeRelease);',
      releaseSeedOpen,
    );
    const publicInstall = source.indexOf(
      'exportPendingOwnerReport(retainedBytes);',
      exactRuntimeMatch,
    );
    expect(exportBranch).toBeGreaterThanOrEqual(0);
    expect(runtimeLock).toBeGreaterThan(exportBranch);
    expect(batchLock).toBeGreaterThan(runtimeLock);
    expect(installedReleaseRead).toBeGreaterThan(batchLock);
    expect(releaseSeedOpen).toBeGreaterThan(installedReleaseRead);
    expect(exactRuntimeMatch).toBeGreaterThan(releaseSeedOpen);
    expect(publicInstall).toBeGreaterThan(exactRuntimeMatch);
    const bootstrap = readFileSync(
      join(
        process.cwd(),
        'scripts',
        'atlas',
        'greater-realm-toolchain-bootstrap.mjs',
      ),
      'utf8',
    );
    expect(bootstrap).toContain("'retain-pending-owner-report'");
    expect(bootstrap).toContain("'export-pending-owner-report'");
  });
});
