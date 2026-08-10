import { createHash } from 'node:crypto';

import {
  GREATER_REALM_CANDIDATE_HANDLE_PATTERN,
  GREATER_REALM_GENERATOR_VERSION_PATTERN,
  GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT,
  GREATER_REALM_MAXIMUM_CANDIDATE_COUNT,
  GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT,
  GREATER_REALM_MINIMUM_CANDIDATE_COUNT,
  GREATER_REALM_PROOF_KEYS,
  GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT,
  GREATER_REALM_REQUIRED_GATE_COUNT,
  GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN,
  GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY,
  GREATER_REALM_SANITIZED_REVIEW_SCHEMA,
  GREATER_REALM_SHA256_PATTERN,
  GREATER_REALM_SOURCE_COMMIT_PATTERN,
  type GreaterRealmGenerationPerformance,
  type GreaterRealmBiomeMetrics,
  type GreaterRealmGeologyCounts,
  type GreaterRealmHydrologyCounts,
  type GreaterRealmProofs,
  type GreaterRealmQualityScores,
  type GreaterRealmRegionSizeRange,
  type GreaterRealmRegionSizeRanges,
  type GreaterRealmSanitizedCandidate,
  type GreaterRealmSanitizedCandidateSource,
  type GreaterRealmSanitizedReview,
  type GreaterRealmSanitizedReviewSource,
  type GreaterRealmTierCounts,
  type GreaterRealmTopographyMetrics,
} from './greater-realm-contracts';

const MAXIMUM_CANONICAL_DEPTH = 32;
const MAXIMUM_PERFORMANCE_MILLISECONDS = 7 * 24 * 60 * 60 * 1_000;
const MAXIMUM_PEAK_MEMORY_MIB = 1_048_576;
const MINIMUM_SIGNED_ELEVATION = -1_000_000;
const MAXIMUM_SIGNED_ELEVATION = 1_000_000;
const MAXIMUM_SLOPE = 2_000_000;
const MAXIMUM_VISUAL_CLASS_COUNT = 256;
const FORBIDDEN_KEY = /(?:^|_)(?:q|r|x|y|z)(?:$|_)|coord|latitude|longitude|seed|transform|translation|rotation|chunk|layoutdigest|stagedigest|packagedigest|preview|screenshot|thumbnail|image|filepath|pathname|url/iu;
const FORBIDDEN_STRING = /(?:data:image\/|(?:^|[\\/])[^\r\n]*\.(?:avif|gif|jpe?g|png|svg|webp)(?:$|[?#])|WKGR[_-]PRIVATE|warpkeep\.greater-realm\.private)/iu;

type UnknownRecord = Readonly<Record<string, unknown>>;
type JsonValue = null | boolean | number | string | readonly JsonValue[] | {
  readonly [key: string]: JsonValue;
};

export class GreaterRealmSanitizedReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmSanitizedReviewError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmSanitizedReviewError(code);
}

function exactRecord(value: unknown, keys: readonly string[]): UnknownRecord {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  const actual = (ownKeys as string[]).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return value as UnknownRecord;
}

function exactArray(
  value: unknown,
  minimumLength: number,
  maximumLength: number,
): readonly unknown[] {
  if (
    !Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || !Number.isSafeInteger(value.length)
    || value.length < minimumLength
    || value.length > maximumLength
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string') || ownKeys.length !== value.length + 1) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !('value' in descriptor) || !descriptor.enumerable) {
      fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
    }
  }
  const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
  if (!lengthDescriptor || !('value' in lengthDescriptor)) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return value;
}

function assertNoPrivateMaterial(
  value: unknown,
  path: readonly string[] = [],
  depth = 0,
  ancestors = new Set<object>(),
): void {
  if (depth > MAXIMUM_CANONICAL_DEPTH) fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
  if (typeof value === 'string') {
    if (FORBIDDEN_STRING.test(value) || value.includes('\0')) {
      fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (ancestors.has(value)) fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
  ancestors.add(value);
  try {
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
      const descriptor = descriptors[key];
      if (!descriptor || !('value' in descriptor)) {
        fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
      }
      const isAllowedDigest = path.length === 0 && key === 'reportDigest';
      if (!isAllowedDigest && FORBIDDEN_KEY.test(key.replaceAll('-', '_'))) {
        fail('GREATER_REALM_SANITIZED_REVIEW_PRIVATE_MATERIAL');
      }
      assertNoPrivateMaterial(
        descriptor.value,
        [...path, key],
        depth + 1,
        ancestors,
      );
    }
  } finally {
    ancestors.delete(value);
  }
}

function safeInteger(value: unknown, maximum = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > maximum) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return value as number;
}

function signedSafeInteger(value: unknown, minimum: number, maximum: number): number {
  if (
    !Number.isSafeInteger(value)
    || (value as number) < minimum
    || (value as number) > maximum
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return value as number;
}

function basisPoints(numerator: number, denominator: number): number {
  if (denominator <= 0 || numerator < 0 || numerator > denominator) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return Math.round((numerator * 10_000) / denominator);
}

function tierCounts(value: unknown, activeCellCount: number): GreaterRealmTierCounts {
  const row = exactRecord(value, ['tierI', 'tierII', 'tierIII']);
  const result = Object.freeze({
    tierI: safeInteger(row.tierI, activeCellCount),
    tierII: safeInteger(row.tierII, activeCellCount),
    tierIII: safeInteger(row.tierIII, activeCellCount),
  });
  if (result.tierI + result.tierII + result.tierIII !== activeCellCount) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return result;
}

function tierBasisPointCounts(counts: GreaterRealmTierCounts, activeCellCount: number) {
  const tierI = basisPoints(counts.tierI, activeCellCount);
  const tierII = basisPoints(counts.tierII, activeCellCount);
  return Object.freeze({ tierI, tierII, tierIII: 10_000 - tierI - tierII });
}

function regionRange(value: unknown, tierCount: number, regionCount: number) {
  const row = exactRecord(value, ['minimum', 'maximum']);
  const result: GreaterRealmRegionSizeRange = Object.freeze({
    minimum: safeInteger(row.minimum, tierCount),
    maximum: safeInteger(row.maximum, tierCount),
  });
  if (
    result.minimum === 0
    || result.minimum > result.maximum
    || result.minimum * regionCount > tierCount
    || result.maximum * regionCount < tierCount
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return result;
}

function regionRanges(
  value: unknown,
  counts: GreaterRealmTierCounts,
): GreaterRealmRegionSizeRanges {
  const row = exactRecord(value, ['tierI', 'tierII', 'tierIII']);
  const result = Object.freeze({
    tierI: regionRange(row.tierI, counts.tierI, 6),
    tierII: regionRange(row.tierII, counts.tierII, 3),
    tierIII: regionRange(row.tierIII, counts.tierIII, 1),
  });
  if (
    result.tierIII.minimum !== counts.tierIII
    || result.tierIII.maximum !== counts.tierIII
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return result;
}

function hydrology(value: unknown): GreaterRealmHydrologyCounts {
  const row = exactRecord(value, [
    'majorOceanSeaBodies',
    'majorRivers',
    'minorStreams',
    'lakes',
  ]);
  return Object.freeze({
    majorOceanSeaBodies: safeInteger(row.majorOceanSeaBodies, 10_000),
    majorRivers: safeInteger(row.majorRivers, 10_000),
    minorStreams: safeInteger(row.minorStreams, 100_000),
    lakes: safeInteger(row.lakes, 100_000),
  });
}

function geology(value: unknown): GreaterRealmGeologyCounts {
  const row = exactRecord(value, [
    'pseudoTectonicDomains',
    'mountainSystems',
    'watersheds',
  ]);
  return Object.freeze({
    pseudoTectonicDomains: safeInteger(row.pseudoTectonicDomains, 1_000),
    mountainSystems: safeInteger(row.mountainSystems, 10_000),
    watersheds: safeInteger(row.watersheds, 100_000),
  });
}

function topography(
  value: unknown,
  activeCellCount: number,
  landCellCount: number,
  waterCellCount: number,
): GreaterRealmTopographyMetrics {
  const row = exactRecord(value, [
    'signedElevationMinimum',
    'signedElevationMaximum',
    'slopeP50',
    'slopeP95',
    'ridgeCellCount',
    'plateauCellCount',
    'basinCellCount',
    'coastCellCount',
  ]);
  const result = Object.freeze({
    signedElevationMinimum: signedSafeInteger(
      row.signedElevationMinimum,
      MINIMUM_SIGNED_ELEVATION,
      MAXIMUM_SIGNED_ELEVATION,
    ),
    signedElevationMaximum: signedSafeInteger(
      row.signedElevationMaximum,
      MINIMUM_SIGNED_ELEVATION,
      MAXIMUM_SIGNED_ELEVATION,
    ),
    slopeP50: safeInteger(row.slopeP50, MAXIMUM_SLOPE),
    slopeP95: safeInteger(row.slopeP95, MAXIMUM_SLOPE),
    ridgeCellCount: safeInteger(row.ridgeCellCount, landCellCount),
    plateauCellCount: safeInteger(row.plateauCellCount, landCellCount),
    basinCellCount: safeInteger(row.basinCellCount, landCellCount),
    coastCellCount: safeInteger(row.coastCellCount, activeCellCount),
  });
  const elevationSpan = result.signedElevationMaximum - result.signedElevationMinimum;
  if (
    result.signedElevationMinimum >= result.signedElevationMaximum
    || (waterCellCount > 0 && result.signedElevationMinimum > 0)
    || (landCellCount > 0 && result.signedElevationMaximum <= 0)
    || result.slopeP50 > result.slopeP95
    || result.slopeP95 > elevationSpan
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return result;
}

function biomes(value: unknown): GreaterRealmBiomeMetrics {
  const row = exactRecord(value, [
    'visualClassCount',
    'minimumPerRegionVisualClassCount',
    'minimumTierIVisualClassCount',
    'minimumTierIIVisualClassCount',
    'tierIIIVisualClassCount',
    'minimumTierIMajorVisualClassCount',
    'minimumTierITransitionVisualClassCount',
    'minimumTierIIMajorVisualClassCount',
    'tierIIIMajorVisualClassCount',
    'maximumTierISingleBiomeShareBasisPoints',
    'incompatibleVisualAdjacencyCount',
    'incompatibleBiomeLandformPairCount',
  ]);
  const result = Object.freeze({
    visualClassCount: safeInteger(row.visualClassCount, MAXIMUM_VISUAL_CLASS_COUNT),
    minimumPerRegionVisualClassCount: safeInteger(
      row.minimumPerRegionVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    minimumTierIVisualClassCount: safeInteger(
      row.minimumTierIVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    minimumTierIIVisualClassCount: safeInteger(
      row.minimumTierIIVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    tierIIIVisualClassCount: safeInteger(
      row.tierIIIVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    minimumTierIMajorVisualClassCount: safeInteger(
      row.minimumTierIMajorVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    minimumTierITransitionVisualClassCount: safeInteger(
      row.minimumTierITransitionVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    minimumTierIIMajorVisualClassCount: safeInteger(
      row.minimumTierIIMajorVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    tierIIIMajorVisualClassCount: safeInteger(
      row.tierIIIMajorVisualClassCount,
      MAXIMUM_VISUAL_CLASS_COUNT,
    ),
    maximumTierISingleBiomeShareBasisPoints: safeInteger(
      row.maximumTierISingleBiomeShareBasisPoints,
      10_000,
    ),
    incompatibleVisualAdjacencyCount: safeInteger(
      row.incompatibleVisualAdjacencyCount,
      1_000_000,
    ),
    incompatibleBiomeLandformPairCount: safeInteger(
      row.incompatibleBiomeLandformPairCount,
      1_000_000,
    ),
  });
  if (
    result.visualClassCount === 0
    || result.minimumPerRegionVisualClassCount === 0
    || result.minimumTierIVisualClassCount === 0
    || result.minimumTierIIVisualClassCount === 0
    || result.tierIIIVisualClassCount === 0
    || result.minimumTierIMajorVisualClassCount === 0
    || result.minimumTierITransitionVisualClassCount === 0
    || result.minimumTierIIMajorVisualClassCount === 0
    || result.tierIIIMajorVisualClassCount === 0
    || result.minimumTierIVisualClassCount > result.visualClassCount
    || result.minimumTierIIVisualClassCount > result.visualClassCount
    || result.tierIIIVisualClassCount > result.visualClassCount
    || result.minimumTierIMajorVisualClassCount > result.minimumTierIVisualClassCount
    || result.minimumTierITransitionVisualClassCount > result.minimumTierIVisualClassCount
    || result.minimumTierIIMajorVisualClassCount > result.minimumTierIIVisualClassCount
    || result.tierIIIMajorVisualClassCount > result.tierIIIVisualClassCount
    || result.minimumPerRegionVisualClassCount !== Math.min(
      result.minimumTierIVisualClassCount,
      result.minimumTierIIVisualClassCount,
      result.tierIIIVisualClassCount,
    )
    || result.maximumTierISingleBiomeShareBasisPoints === 0
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return result;
}

function quality(value: unknown): GreaterRealmQualityScores {
  const row = exactRecord(value, [
    'naturalnessBasisPoints',
    'axialArtifactBasisPoints',
    'ridgeContinuityBasisPoints',
    'hydrologyCoherenceBasisPoints',
  ]);
  return Object.freeze({
    naturalnessBasisPoints: safeInteger(row.naturalnessBasisPoints, 10_000),
    axialArtifactBasisPoints: safeInteger(row.axialArtifactBasisPoints, 10_000),
    ridgeContinuityBasisPoints: safeInteger(row.ridgeContinuityBasisPoints, 10_000),
    hydrologyCoherenceBasisPoints: safeInteger(row.hydrologyCoherenceBasisPoints, 10_000),
  });
}

function proofs(value: unknown): GreaterRealmProofs {
  const row = exactRecord(value, GREATER_REALM_PROOF_KEYS);
  return Object.freeze(Object.fromEntries(GREATER_REALM_PROOF_KEYS.map(key => {
    if (typeof row[key] !== 'boolean') fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
    return [key, row[key]];
  }))) as GreaterRealmProofs;
}

function performance(value: unknown): GreaterRealmGenerationPerformance {
  const row = exactRecord(value, [
    'generationMillisecondsRounded',
    'processPeakMemoryMiBRounded',
  ]);
  return Object.freeze({
    generationMillisecondsRounded: safeInteger(
      row.generationMillisecondsRounded,
      MAXIMUM_PERFORMANCE_MILLISECONDS,
    ),
    processPeakMemoryMiBRounded: safeInteger(
      row.processPeakMemoryMiBRounded,
      MAXIMUM_PEAK_MEMORY_MIB,
    ),
  });
}

const SOURCE_CANDIDATE_KEYS = Object.freeze([
  'candidateHandle',
  'eligible',
  'activeCellCount',
  'landCellCount',
  'waterCellCount',
  'tierCellCounts',
  'regionSizeRanges',
  'hydrology',
  'geology',
  'topography',
  'biomes',
  'quality',
  'gateCount',
  'castleSlotCount',
  'proofs',
  'performance',
]);

const PUBLIC_CANDIDATE_KEYS = Object.freeze([
  ...SOURCE_CANDIDATE_KEYS,
  'insideApprovedRange',
  'landBasisPoints',
  'waterBasisPoints',
  'tierBasisPoints',
]);

function candidate(
  value: unknown,
  publicShape: boolean,
): GreaterRealmSanitizedCandidate {
  const row = exactRecord(value, publicShape ? PUBLIC_CANDIDATE_KEYS : SOURCE_CANDIDATE_KEYS);
  if (
    typeof row.candidateHandle !== 'string'
    || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(row.candidateHandle)
    || typeof row.eligible !== 'boolean'
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const activeCellCount = safeInteger(row.activeCellCount, 1_000_000);
  if (activeCellCount === 0) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const landCellCount = safeInteger(row.landCellCount, activeCellCount);
  const waterCellCount = safeInteger(row.waterCellCount, activeCellCount);
  if (landCellCount + waterCellCount !== activeCellCount) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  const parsedTierCounts = tierCounts(row.tierCellCounts, activeCellCount);
  const parsedProofs = proofs(row.proofs);
  const parsedTopography = topography(
    row.topography,
    activeCellCount,
    landCellCount,
    waterCellCount,
  );
  const parsedBiomes = biomes(row.biomes);
  const insideApprovedRange = activeCellCount >= GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT
    && activeCellCount <= GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT;
  const derivedTierBasisPoints = tierBasisPointCounts(parsedTierCounts, activeCellCount);
  if (publicShape) {
    const providedTierBasisPoints = exactRecord(
      row.tierBasisPoints,
      ['tierI', 'tierII', 'tierIII'],
    );
    if (
      providedTierBasisPoints.tierI !== derivedTierBasisPoints.tierI
      || providedTierBasisPoints.tierII !== derivedTierBasisPoints.tierII
      || providedTierBasisPoints.tierIII !== derivedTierBasisPoints.tierIII
    ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  const parsed = Object.freeze({
    candidateHandle: row.candidateHandle,
    eligible: row.eligible,
    activeCellCount,
    landCellCount,
    waterCellCount,
    tierCellCounts: parsedTierCounts,
    regionSizeRanges: regionRanges(row.regionSizeRanges, parsedTierCounts),
    hydrology: hydrology(row.hydrology),
    geology: geology(row.geology),
    topography: parsedTopography,
    biomes: parsedBiomes,
    quality: quality(row.quality),
    gateCount: safeInteger(row.gateCount, 10_000),
    castleSlotCount: safeInteger(row.castleSlotCount, 100_000),
    proofs: parsedProofs,
    performance: performance(row.performance),
    insideApprovedRange,
    landBasisPoints: basisPoints(landCellCount, activeCellCount),
    waterBasisPoints: 10_000 - basisPoints(landCellCount, activeCellCount),
    tierBasisPoints: derivedTierBasisPoints,
  });
  if (publicShape && (
    row.insideApprovedRange !== parsed.insideApprovedRange
    || row.landBasisPoints !== parsed.landBasisPoints
    || row.waterBasisPoints !== parsed.waterBasisPoints
  )) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  if (parsed.eligible && (
    !parsed.insideApprovedRange
    || parsed.tierBasisPoints.tierI < 6_800
    || parsed.tierBasisPoints.tierI > 7_400
    || parsed.tierBasisPoints.tierII < 2_200
    || parsed.tierBasisPoints.tierII > 2_700
    || parsed.tierBasisPoints.tierIII < 300
    || parsed.tierBasisPoints.tierIII > 600
    || parsed.regionSizeRanges.tierIII.maximum >= parsed.regionSizeRanges.tierI.minimum
    || parsed.regionSizeRanges.tierIII.maximum >= parsed.regionSizeRanges.tierII.minimum
    || parsed.gateCount !== GREATER_REALM_REQUIRED_GATE_COUNT
    || parsed.castleSlotCount !== GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT
    || Object.values(parsed.proofs).some(result => result !== true)
    || parsed.geology.pseudoTectonicDomains < 7
    || parsed.geology.pseudoTectonicDomains > 12
    || parsed.hydrology.majorOceanSeaBodies < 4
    || parsed.hydrology.majorOceanSeaBodies > 6
    || parsed.hydrology.majorRivers < 48
    || parsed.hydrology.majorRivers > 72
    || parsed.hydrology.minorStreams < 120
    || parsed.hydrology.minorStreams > 240
    || parsed.hydrology.lakes < 48
    || parsed.hydrology.lakes > 96
    || parsed.topography.signedElevationMinimum >= 0
    || parsed.topography.signedElevationMaximum <= 0
    || parsed.topography.slopeP50 === 0
    || parsed.topography.slopeP95 <= parsed.topography.slopeP50
    || parsed.topography.ridgeCellCount === 0
    || parsed.topography.plateauCellCount === 0
    || parsed.topography.basinCellCount === 0
    || parsed.topography.coastCellCount === 0
    || parsed.biomes.visualClassCount < 8
    || parsed.biomes.minimumPerRegionVisualClassCount < 3
    || parsed.biomes.minimumTierIVisualClassCount < 6
    || parsed.biomes.minimumTierIIVisualClassCount < 5
    || parsed.biomes.tierIIIVisualClassCount < 3
    || parsed.biomes.minimumTierIMajorVisualClassCount < 4
    || parsed.biomes.minimumTierITransitionVisualClassCount < 2
    || parsed.biomes.minimumTierIIMajorVisualClassCount < 5
    || parsed.biomes.tierIIIMajorVisualClassCount < 3
    || parsed.biomes.maximumTierISingleBiomeShareBasisPoints > 5_500
    || parsed.biomes.incompatibleVisualAdjacencyCount !== 0
    || parsed.biomes.incompatibleBiomeLandformPairCount !== 0
  )) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return parsed;
}

function validateCommonReviewFields(row: UnknownRecord) {
  const candidateValues = exactArray(
    row.candidates,
    GREATER_REALM_MINIMUM_CANDIDATE_COUNT,
    GREATER_REALM_MAXIMUM_CANDIDATE_COUNT,
  );
  if (
    typeof row.generatorVersion !== 'string'
    || !GREATER_REALM_GENERATOR_VERSION_PATTERN.test(row.generatorVersion)
    || typeof row.sourceCommit !== 'string'
    || !GREATER_REALM_SOURCE_COMMIT_PATTERN.test(row.sourceCommit)
    || typeof row.reviewBatchHandle !== 'string'
    || !GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN.test(row.reviewBatchHandle)
    || (row.selectionStatus !== 'pending' && row.selectionStatus !== 'selected')
    || (row.selectedCandidateHandle !== null && (
      typeof row.selectedCandidateHandle !== 'string'
      || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(row.selectedCandidateHandle)
    ))
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const candidates: GreaterRealmSanitizedCandidate[] = [];
  for (let index = 0; index < candidateValues.length; index += 1) {
    candidates.push(candidate(candidateValues[index], 'schema' in row));
  }
  const handles = candidates.map(entry => entry.candidateHandle);
  if (
    new Set(handles).size !== handles.length
    || handles.some((handle, index) => index > 0 && handles[index - 1]! >= handle)
    || candidates.filter(entry => entry.eligible).length < GREATER_REALM_MINIMUM_CANDIDATE_COUNT
    || (row.selectionStatus === 'pending' && row.selectedCandidateHandle !== null)
    || (row.selectionStatus === 'selected' && (
      row.selectedCandidateHandle === null
      || !candidates.some(entry => (
        entry.candidateHandle === row.selectedCandidateHandle && entry.eligible
      ))
    ))
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  return Object.freeze({
    generatorVersion: row.generatorVersion,
    sourceCommit: row.sourceCommit,
    reviewBatchHandle: row.reviewBatchHandle,
    selectionStatus: row.selectionStatus,
    selectedCandidateHandle: row.selectedCandidateHandle,
    candidates: Object.freeze(candidates),
  }) as Omit<GreaterRealmSanitizedReviewSource, 'candidates'> & {
    readonly candidates: readonly GreaterRealmSanitizedCandidate[];
  };
}

function canonicalValue(value: JsonValue, depth = 0): JsonValue {
  if (depth > MAXIMUM_CANONICAL_DEPTH) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  if (Array.isArray(value)) return value.map(entry => canonicalValue(entry, depth + 1));
  if (value !== null && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
      .map(([key, entry]) => [key, canonicalValue(entry, depth + 1)]))) as JsonValue;
  }
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  return value;
}

function reportWithoutDigest(
  common: ReturnType<typeof validateCommonReviewFields>,
): Omit<GreaterRealmSanitizedReview, 'reportDigest'> {
  return Object.freeze({
    schema: GREATER_REALM_SANITIZED_REVIEW_SCHEMA,
    generatorVersion: common.generatorVersion,
    sourceCommit: common.sourceCommit,
    reviewBatchHandle: common.reviewBatchHandle,
    selectionStatus: common.selectionStatus,
    selectedCandidateHandle: common.selectedCandidateHandle,
    candidateCount: common.candidates.length,
    candidates: common.candidates,
    privacyBoundary: GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY,
  });
}

export function greaterRealmSanitizedReviewDigest(
  value: Omit<GreaterRealmSanitizedReview, 'reportDigest'>,
): string {
  const canonical = JSON.stringify(canonicalValue(value as unknown as JsonValue));
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** Construct an aggregate public artifact. Private manifests are never accepted. */
export function createGreaterRealmSanitizedReview(
  value: unknown,
): GreaterRealmSanitizedReview {
  assertNoPrivateMaterial(value);
  const row = exactRecord(value, [
    'generatorVersion',
    'sourceCommit',
    'reviewBatchHandle',
    'selectionStatus',
    'selectedCandidateHandle',
    'candidates',
  ]);
  const sourceCandidates = exactArray(
    row.candidates,
    GREATER_REALM_MINIMUM_CANDIDATE_COUNT,
    GREATER_REALM_MAXIMUM_CANDIDATE_COUNT,
  );
  const sorted = Object.freeze([...sourceCandidates].sort((left, right) => {
    const leftHandle = exactRecord(left, SOURCE_CANDIDATE_KEYS).candidateHandle;
    const rightHandle = exactRecord(right, SOURCE_CANDIDATE_KEYS).candidateHandle;
    if (typeof leftHandle !== 'string' || typeof rightHandle !== 'string') {
      fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
    }
    return leftHandle < rightHandle ? -1 : leftHandle > rightHandle ? 1 : 0;
  }));
  const common = validateCommonReviewFields({ ...row, candidates: sorted });
  const body = reportWithoutDigest(common);
  return Object.freeze({ ...body, reportDigest: greaterRealmSanitizedReviewDigest(body) });
}

/** Parse an already-public artifact using recursive exact-key validation. */
export function parseGreaterRealmSanitizedReview(value: unknown): GreaterRealmSanitizedReview {
  assertNoPrivateMaterial(value);
  const row = exactRecord(value, [
    'schema',
    'generatorVersion',
    'sourceCommit',
    'reviewBatchHandle',
    'selectionStatus',
    'selectedCandidateHandle',
    'candidateCount',
    'candidates',
    'privacyBoundary',
    'reportDigest',
  ]);
  if (
    row.schema !== GREATER_REALM_SANITIZED_REVIEW_SCHEMA
    || row.privacyBoundary !== GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY
    || typeof row.reportDigest !== 'string'
    || !GREATER_REALM_SHA256_PATTERN.test(row.reportDigest)
  ) fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  const common = validateCommonReviewFields(row);
  if (row.candidateCount !== common.candidates.length) {
    fail('GREATER_REALM_SANITIZED_REVIEW_INVALID');
  }
  const body = reportWithoutDigest(common);
  if (greaterRealmSanitizedReviewDigest(body) !== row.reportDigest) {
    fail('GREATER_REALM_SANITIZED_REVIEW_DIGEST_MISMATCH');
  }
  return Object.freeze({ ...body, reportDigest: row.reportDigest });
}

export function serializeGreaterRealmSanitizedReview(value: unknown): string {
  const report = parseGreaterRealmSanitizedReview(value);
  return `${JSON.stringify(canonicalValue(report as unknown as JsonValue), null, 2)}\n`;
}
