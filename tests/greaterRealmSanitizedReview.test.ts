import { describe, expect, it } from 'vitest';

import {
  GREATER_REALM_CANDIDATE_HANDLE_PATTERN,
  GREATER_REALM_PROOF_KEYS,
  GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN,
  createGreaterRealmCandidateHandle,
  createGreaterRealmReviewBatchHandle,
  type GreaterRealmSanitizedCandidateSource,
  type GreaterRealmSanitizedReviewSource,
} from '../scripts/atlas/greater-realm-contracts';
import {
  createGreaterRealmSanitizedReview,
  greaterRealmSanitizedReviewDigest,
  parseGreaterRealmSanitizedReview,
  serializeGreaterRealmSanitizedReview,
} from '../scripts/atlas/greater-realm-sanitized-review';

function candidate(handle = createGreaterRealmCandidateHandle()): GreaterRealmSanitizedCandidateSource {
  return Object.freeze({
    candidateHandle: handle,
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

function source(): GreaterRealmSanitizedReviewSource {
  return Object.freeze({
    generatorVersion: 'greater-realm-v2-natural-continent',
    sourceCommit: 'a'.repeat(40),
    reviewBatchHandle: createGreaterRealmReviewBatchHandle(),
    selectionStatus: 'pending',
    selectedCandidateHandle: null,
    candidates: Object.freeze(Array.from({ length: 8 }, () => candidate())),
  });
}

function mutableClone<T>(value: T): T {
  return structuredClone(value);
}

describe('Greater Realm sanitized candidate review', () => {
  it('constructs only aggregate public evidence with opaque independent handles', () => {
    const review = createGreaterRealmSanitizedReview(source());

    expect(review.reviewBatchHandle).toMatch(GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN);
    expect(review.candidates).toHaveLength(8);
    expect(new Set(review.candidates.map(entry => entry.candidateHandle)).size).toBe(8);
    expect(review.candidates.every(entry => (
      GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(entry.candidateHandle)
      && entry.insideApprovedRange
      && entry.landBasisPoints + entry.waterBasisPoints === 10_000
      && entry.tierBasisPoints.tierI
        + entry.tierBasisPoints.tierII
        + entry.tierBasisPoints.tierIII === 10_000
    ))).toBe(true);
    expect(JSON.stringify(review)).not.toMatch(
      /(?:coordinate|seed|transform|chunk|layoutDigest|stageDigest|packageDigest|preview|imagePath)/i,
    );
    expect(parseGreaterRealmSanitizedReview(JSON.parse(
      serializeGreaterRealmSanitizedReview(review),
    ))).toEqual(review);
  });

  it('sorts candidates canonically and binds every public field into the digest', () => {
    const input = source();
    const reversed = { ...input, candidates: [...input.candidates].reverse() };
    const review = createGreaterRealmSanitizedReview(reversed);
    const { reportDigest: _digest, ...body } = review;

    expect(review.candidates.map(entry => entry.candidateHandle)).toEqual(
      [...review.candidates.map(entry => entry.candidateHandle)].sort(),
    );
    expect(review.reportDigest).toBe(greaterRealmSanitizedReviewDigest(body));

    const tampered = mutableClone(review) as unknown as {
      candidates: Array<{ quality: { naturalnessBasisPoints: number } }>;
    };
    tampered.candidates[0]!.quality.naturalnessBasisPoints -= 1;
    expect(() => parseGreaterRealmSanitizedReview(tampered)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_DIGEST_MISMATCH',
    );
  });

  it('rejects unknown keys recursively instead of redacting them', () => {
    const input = mutableClone(source()) as GreaterRealmSanitizedReviewSource & {
      candidates: Array<GreaterRealmSanitizedCandidateSource & {
        hydrology: GreaterRealmSanitizedCandidateSource['hydrology'] & { tributaryMap?: unknown };
      }>;
    };
    input.candidates[0]!.hydrology.tributaryMap = 'aggregate-looking-but-unreviewed';

    expect(() => createGreaterRealmSanitizedReview(input)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );
  });

  it('labels maxRSS honestly as a process-lifetime peak', () => {
    const input = mutableClone(source()) as unknown as {
      candidates: Array<{
        performance: Record<string, unknown>;
      }>;
    };
    const performance = input.candidates[0]!.performance;
    performance.peakMemoryMiBRounded = performance.processPeakMemoryMiBRounded;
    delete performance.processPeakMemoryMiBRounded;

    expect(() => createGreaterRealmSanitizedReview(
      input as unknown as GreaterRealmSanitizedReviewSource,
    )).toThrow('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  });

  it('strictly validates aggregate topography and biome evidence', () => {
    const unknownMetric = mutableClone(source()) as GreaterRealmSanitizedReviewSource & {
      candidates: Array<GreaterRealmSanitizedCandidateSource & {
        topography: GreaterRealmSanitizedCandidateSource['topography'] & {
          elevationHistogram?: unknown;
        };
      }>;
    };
    unknownMetric.candidates[0]!.topography.elevationHistogram = [1, 2, 3];
    expect(() => createGreaterRealmSanitizedReview(unknownMetric)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );

    const invalidSlope = mutableClone(source()) as unknown as {
      candidates: Array<{ topography: { slopeP50: number; slopeP95: number } }>;
    };
    invalidSlope.candidates[0]!.topography.slopeP50 = 4_000;
    invalidSlope.candidates[0]!.topography.slopeP95 = 3_900;
    expect(() => createGreaterRealmSanitizedReview(invalidSlope)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );

    const invalidElevation = mutableClone(source()) as unknown as {
      candidates: Array<{ topography: { signedElevationMinimum: number } }>;
    };
    invalidElevation.candidates[0]!.topography.signedElevationMinimum = -1_000_001;
    expect(() => createGreaterRealmSanitizedReview(invalidElevation)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );

    const biomeMonoculture = mutableClone(source()) as unknown as {
      candidates: Array<{
        biomes: { maximumTierISingleBiomeShareBasisPoints: number };
      }>;
    };
    biomeMonoculture.candidates[0]!.biomes.maximumTierISingleBiomeShareBasisPoints = 5_501;
    expect(() => createGreaterRealmSanitizedReview(biomeMonoculture)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );

    const incompatibleTransition = mutableClone(source()) as unknown as {
      candidates: Array<{ biomes: { incompatibleVisualAdjacencyCount: number } }>;
    };
    incompatibleTransition.candidates[0]!.biomes.incompatibleVisualAdjacencyCount = 1;
    expect(() => createGreaterRealmSanitizedReview(incompatibleTransition)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );

    const incompatiblePairing = mutableClone(source()) as unknown as {
      candidates: Array<{ biomes: { incompatibleBiomeLandformPairCount: number } }>;
    };
    incompatiblePairing.candidates[0]!.biomes.incompatibleBiomeLandformPairCount = 1;
    expect(() => createGreaterRealmSanitizedReview(incompatiblePairing)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );
  });

  it('keeps recursive privacy rejection active within new aggregate objects', () => {
    const input = mutableClone(source()) as unknown as {
      candidates: Array<{ topography: Record<string, unknown> }>;
    };
    input.candidates[0]!.topography.coordinateSamples = [[1, 2]];
    expect(() => createGreaterRealmSanitizedReview(input)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL',
    );
  });

  it('rejects accessors without executing them and rejects sparse candidate arrays', () => {
    const accessorInput = mutableClone(source());
    let getterExecuted = false;
    Object.defineProperty(accessorInput.candidates[0]!.quality, 'naturalnessBasisPoints', {
      enumerable: true,
      get: () => {
        getterExecuted = true;
        return 8_720;
      },
    });
    expect(() => createGreaterRealmSanitizedReview(accessorInput)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL',
    );
    expect(getterExecuted).toBe(false);

    const sparseInput = mutableClone(source()) as unknown as {
      candidates: Array<GreaterRealmSanitizedCandidateSource>;
    };
    delete sparseInput.candidates[0];
    expect(() => createGreaterRealmSanitizedReview(sparseInput)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_INVALID',
    );
  });

  it.each([
    ['coordinate', Object.freeze({ q: 42, r: -7 })],
    ['seedMaterial', Uint8Array.from({ length: 32 }, (_, index) => index)],
    ['transform', Object.freeze({ rotation: 2, translation: [4, 8] })],
    ['chunkKeys', Object.freeze(['hidden-1'])],
    ['layoutDigest', 'f'.repeat(64)],
    ['stageDigest', 'e'.repeat(64)],
    ['packageDigest', 'd'.repeat(64)],
    ['imagePath', 'private/maps/candidate.png'],
  ])('rejects the private field %s before public construction', (key, privateValue) => {
    const input = mutableClone(source()) as unknown as Record<string, unknown>;
    input[key] = privateValue;
    expect(() => createGreaterRealmSanitizedReview(input)).toThrow(
      'GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL',
    );
  });

  it('accepts one eligible candidate and requires an eligible exact selection', () => {
    const input = source();
    const single = createGreaterRealmSanitizedReview({
      ...input,
      candidates: input.candidates.slice(0, 1),
    });
    expect(single.candidateCount).toBe(1);
    expect(single.selectionStatus).toBe('pending');

    expect(() => createGreaterRealmSanitizedReview({
      ...input,
      candidates: [],
    })).toThrow('GREATER_REALM_SANITIZED_REVIEW_INVALID');

    const selectedHandle = input.candidates[0]!.candidateHandle;
    const selected = createGreaterRealmSanitizedReview({
      ...input,
      selectionStatus: 'selected',
      selectedCandidateHandle: selectedHandle,
    });
    expect(selected.selectedCandidateHandle).toBe(selectedHandle);

    expect(() => createGreaterRealmSanitizedReview({
      ...input,
      selectionStatus: 'selected',
      selectedCandidateHandle: createGreaterRealmCandidateHandle(),
    })).toThrow('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  });
});
