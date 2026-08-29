import { randomBytes } from 'node:crypto';

/** Stable identity of the historical Genesis 001 Greater Realm evidence. */
export const GREATER_REALM_ATLAS_ID = 'GENESIS_001_GREATER_REALM' as const;

/** New, separately generated atlas identity for the sealed Genesis 002 realm. */
export const GENESIS_002_GREATER_REALM_ATLAS_ID =
  'GENESIS_002_GREATER_REALM' as const;

/** Dedicated atlas identity for the owner-only public test realm. */
export const PTR_GREATER_REALM_ATLAS_ID = 'PTR_GREATER_REALM' as const;
export const GREATER_REALM_SANITIZED_REVIEW_SCHEMA =
  'warpkeep.greater-realm.candidate-review.v1' as const;
export const GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY =
  'aggregate-only-no-private-generation-material-v1' as const;
export const GREATER_REALM_MINIMUM_CANDIDATE_COUNT = 1;
export const GREATER_REALM_MAXIMUM_CANDIDATE_COUNT = 16;
export const GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT = 100_000;
export const GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT = 150_000;
export const GREATER_REALM_REQUIRED_GATE_COUNT = 18;
export const GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT = 600;

export const GREATER_REALM_CANDIDATE_HANDLE_PATTERN = /^GR-A-[A-Z2-7]{16}$/u;
export const GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN = /^GR-B-[A-Z2-7]{16}$/u;
export const GREATER_REALM_SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}(?:[0-9a-f]{24})?$/u;
export const GREATER_REALM_SHA256_PATTERN = /^[0-9a-f]{64}$/u;
export const GREATER_REALM_GENERATOR_VERSION_PATTERN =
  /^[a-z0-9](?:[a-z0-9.-]{0,62}[a-z0-9])?$/u;

export const GREATER_REALM_COMPOSITION_PROOF_KEYS = Object.freeze([
  'naturalLandSilhouette',
  'dominantContinentComposition',
  'deepOceanBreathingRoom',
  'forestPatchComposition',
  'mountainSystemComposition',
] as const);

export const GREATER_REALM_PROOF_KEYS = Object.freeze([
  'activeMaskConnected',
  'advancedGeomorphology',
  'approvedCellRange',
  'barriersHaveNoBypass',
  'biomeCoherence',
  'biomeDiversity',
  'castleCapacity',
  'deepOceanBoundary',
  'dormantThroneAnchor',
  'gateApproaches',
  'gateGraph',
  'geologicalHighlandBarriers',
  'hydrologyAcyclic',
  'hydrologySurfaceConsistency',
  'legacyLowlandsPreserved',
  'naturalLandmassTopology',
  'naturalStrategicRegions',
  'naturalOuterBoundary',
  'regionPassableLand',
  'regionLandCoherence',
  'regionGraph',
  ...GREATER_REALM_COMPOSITION_PROOF_KEYS,
] as const);

export type GreaterRealmProofKey = typeof GREATER_REALM_PROOF_KEYS[number];
export type GreaterRealmProofs = Readonly<Record<GreaterRealmProofKey, boolean>>;

export type GreaterRealmTierCounts = Readonly<{
  tierI: number;
  tierII: number;
  tierIII: number;
}>;

export type GreaterRealmRegionSizeRange = Readonly<{
  minimum: number;
  maximum: number;
}>;

export type GreaterRealmRegionSizeRanges = Readonly<{
  tierI: GreaterRealmRegionSizeRange;
  tierII: GreaterRealmRegionSizeRange;
  tierIII: GreaterRealmRegionSizeRange;
}>;

export type GreaterRealmHydrologyCounts = Readonly<{
  majorOceanSeaBodies: number;
  majorRivers: number;
  minorStreams: number;
  lakes: number;
}>;

export type GreaterRealmGeologyCounts = Readonly<{
  pseudoTectonicDomains: number;
  mountainSystems: number;
  watersheds: number;
}>;

/**
 * Aggregate terrain-distribution evidence. Elevation and slope values use the
 * generator's integer height units; ridge, plateau, and basin counts cover
 * land cells, while coast may cover either side of the shore. Counts disclose
 * no placement.
 */
export type GreaterRealmTopographyMetrics = Readonly<{
  signedElevationMinimum: number;
  signedElevationMaximum: number;
  slopeP50: number;
  slopeP95: number;
  ridgeCellCount: number;
  plateauCellCount: number;
  basinCellCount: number;
  coastCellCount: number;
}>;

/** Aggregate biome-diversity evidence without class identifiers or locations. */
export type GreaterRealmBiomeMetrics = Readonly<{
  visualClassCount: number;
  minimumPerRegionVisualClassCount: number;
  minimumTierIVisualClassCount: number;
  minimumTierIIVisualClassCount: number;
  tierIIIVisualClassCount: number;
  minimumTierIMajorVisualClassCount: number;
  minimumTierITransitionVisualClassCount: number;
  minimumTierIIMajorVisualClassCount: number;
  tierIIIMajorVisualClassCount: number;
  maximumTierISingleBiomeShareBasisPoints: number;
  incompatibleVisualAdjacencyCount: number;
  incompatibleBiomeLandformPairCount: number;
}>;

export type GreaterRealmQualityScores = Readonly<{
  naturalnessBasisPoints: number;
  axialArtifactBasisPoints: number;
  ridgeContinuityBasisPoints: number;
  hydrologyCoherenceBasisPoints: number;
}>;

export type GreaterRealmGenerationPerformance = Readonly<{
  generationMillisecondsRounded: number;
  processPeakMemoryMiBRounded: number;
}>;

/**
 * Deliberately aggregate-only input accepted by the public-report builder.
 * It is not a private package or a redaction target.
 */
export type GreaterRealmSanitizedCandidateSource = Readonly<{
  candidateHandle: string;
  eligible: boolean;
  activeCellCount: number;
  landCellCount: number;
  waterCellCount: number;
  tierCellCounts: GreaterRealmTierCounts;
  regionSizeRanges: GreaterRealmRegionSizeRanges;
  hydrology: GreaterRealmHydrologyCounts;
  geology: GreaterRealmGeologyCounts;
  topography: GreaterRealmTopographyMetrics;
  biomes: GreaterRealmBiomeMetrics;
  quality: GreaterRealmQualityScores;
  gateCount: number;
  castleSlotCount: number;
  proofs: GreaterRealmProofs;
  performance: GreaterRealmGenerationPerformance;
}>;

export type GreaterRealmSanitizedReviewSource = Readonly<{
  generatorVersion: string;
  sourceCommit: string;
  reviewBatchHandle: string;
  selectionStatus: 'pending' | 'selected';
  selectedCandidateHandle: string | null;
  candidates: readonly GreaterRealmSanitizedCandidateSource[];
}>;

export type GreaterRealmSanitizedCandidate = GreaterRealmSanitizedCandidateSource & Readonly<{
  insideApprovedRange: boolean;
  landBasisPoints: number;
  waterBasisPoints: number;
  tierBasisPoints: GreaterRealmTierCounts;
}>;

export type GreaterRealmSanitizedReview = Readonly<{
  schema: typeof GREATER_REALM_SANITIZED_REVIEW_SCHEMA;
  generatorVersion: string;
  sourceCommit: string;
  reviewBatchHandle: string;
  selectionStatus: 'pending' | 'selected';
  selectedCandidateHandle: string | null;
  candidateCount: number;
  candidates: readonly GreaterRealmSanitizedCandidate[];
  privacyBoundary: typeof GREATER_REALM_SANITIZED_PRIVACY_BOUNDARY;
  reportDigest: string;
}>;

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function opaqueHandle(prefix: 'GR-A-' | 'GR-B-'): string {
  const bytes = randomBytes(10);
  let accumulator = 0;
  let availableBits = 0;
  let encoded = '';
  for (const byte of bytes) {
    accumulator = (accumulator << 8) | byte;
    availableBits += 8;
    while (availableBits >= 5) {
      availableBits -= 5;
      encoded += BASE32_ALPHABET[(accumulator >>> availableBits) & 31];
    }
  }
  bytes.fill(0);
  if (encoded.length !== 16) throw new Error('GREATER_REALM_PUBLIC_HANDLE_FAILED');
  return `${prefix}${encoded}`;
}

/** Public handles are random labels and accept no seed or layout input. */
export function createGreaterRealmCandidateHandle(): string {
  return opaqueHandle('GR-A-');
}

/** Public review-batch handles are independent from every candidate seed. */
export function createGreaterRealmReviewBatchHandle(): string {
  return opaqueHandle('GR-B-');
}
