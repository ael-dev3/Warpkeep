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

const CANDIDATE_HANDLE = 'GR-A-AAAAAAAAAAAAAAAA';
const REVIEW_BATCH_HANDLE = 'GR-B-BBBBBBBBBBBBBBBB';

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

describe('Greater Realm pending owner report', () => {
  it('projects one verified sanitized world into an explicit pending owner state', () => {
    const source = sanitizedReview();
    const report = createGreaterRealmPendingOwnerReport({
      sanitizedReview: source,
      privatePackageVerified: true,
    });

    expect(report).toMatchObject({
      schema: GREATER_REALM_PENDING_OWNER_REPORT_SCHEMA,
      atlasId: 'GENESIS_001_GREATER_REALM',
      worldCount: 1,
      automatedValidationStatus: 'private-package-and-sanitized-aggregate-verified',
      ownerValidationStatus: 'pending',
      selectionStatus: 'pending',
      selectedCandidateHandle: null,
      activationStatus: 'inactive',
      productionUntouched: true,
      sourceReportDigest: source.reportDigest,
    });
    expect(report.candidate).toEqual(source.candidates[0]);
    expect(report.candidate.insideApprovedRange).toBe(true);
    expect(Object.values(report.candidate.proofs).every(Boolean)).toBe(true);
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
      candidate: { quality: { naturalnessBasisPoints: number } };
    };
    tampered.candidate.quality.naturalnessBasisPoints -= 1;
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
    expect(serialized).toContain('"ownerValidationStatus": "pending"');
    expect(serialized).toContain('"activationStatus": "inactive"');
  });

  it('installs only reparsed canonical bytes with pinned public metadata', () => {
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
      greaterRealmPublicEvidenceTestSeams.installPendingOwnerReport({
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
      greaterRealmPublicEvidenceTestSeams.installPendingOwnerReport({
        repositoryRoot,
        review,
      });
      expect(existsSync(linked)).toBe(false);
      expect(statSync(destination).nlink).toBe(1);
      writeFileSync(destination, '{}\n', { mode: 0o644 });
      expect(() => greaterRealmPublicEvidenceTestSeams.installPendingOwnerReport({
        repositoryRoot,
        review,
      })).toThrow();
      expect(readFileSync(destination, 'utf8')).toBe('{}\n');
    } finally {
      rmSync(root, { force: true, recursive: true });
    }
  });
});
