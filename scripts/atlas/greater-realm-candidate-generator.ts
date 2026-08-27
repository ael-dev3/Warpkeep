import { createHash, createHmac } from 'node:crypto';

import {
  GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT,
  GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT,
  GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT,
  GREATER_REALM_REQUIRED_GATE_COUNT,
  type GreaterRealmSanitizedCandidateSource,
} from './greater-realm-contracts';
import {
  rejectGreaterRealmCandidate,
  rejectGreaterRealmTierTwoCapacity,
  type GreaterRealmTierTwoCapacityRejectionReason,
} from './greater-realm-candidate-rejection';
import {
  GREATER_REALM_AXIAL_DIRECTIONS,
  accumulateGreaterRealmSingleFlow,
  createGreaterRealmMultiscaleIntegerField,
  digestGreaterRealmTerrainStage,
  erodeGreaterRealmThermally,
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  indexGreaterRealmAxialGrid,
  isCanonicalGreaterRealmAxialGrid,
  priorityFloodGreaterRealmHexGrid,
  routeGreaterRealmSingleFlow,
  type AxialCoordinate,
  type GreaterRealmTerrainSeed,
  type GreaterRealmSingleFlowRouting,
  type IndexedAxialGrid,
  type IntegerTerrainArray,
} from './greater-realm-terrain';
import {
  GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1,
  GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1,
  assertGreaterRealmLegacyLowlandsPatchLocked,
  inverseGlobalToLegacyLowlands,
  transformLegacyLowlandsToGlobal,
  type LegacyLowlandsAtlasTransform,
} from './greater-realm-legacy-lowlands';
import {
  GREATER_REALM_COASTAL_CLASS,
  repairGreaterRealmFinalFjordCoastalClass,
  shapeGreaterRealmGeomorphology,
  type GreaterRealmGeomorphologyMetrics,
} from './greater-realm-geomorphology';
import {
  deriveGreaterRealmTopography,
} from './greater-realm-topography';
import {
  measureGreaterRealmNaturalComposition,
  type GreaterRealmNaturalCompositionMetrics,
} from './greater-realm-composition';
import {
  GREATER_REALM_LIVING_WORLD_VERSION,
  clearGreaterRealmLivingWorldAuthority,
  deriveGreaterRealmLivingWorld,
  hasGreaterRealmCandidateScaleLivingWorldCapacity,
  type GreaterRealmLivingWorldInvariants,
  type GreaterRealmLivingWorldMetrics,
} from './greater-realm-living-world';
import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import {
  measureGreaterRealmReliefStructure,
  type GreaterRealmReliefStructureMetrics,
} from './greater-realm-relief-structure';
import {
  GREATER_REALM_GEOLOGY_AUTHORITY_VERSION,
  deriveGreaterRealmDomainMaterialAuthority,
  type GreaterRealmDomainMaterialMetrics,
  type GreaterRealmRockFamilyId,
} from './greater-realm-geology-authority';
import {
  GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION,
  GREATER_REALM_HYDROLOGY_GENERATION_VERSION,
  deriveGreaterRealmHydrologyAuthority,
  type GreaterRealmHydrologyAuthorityMetrics,
} from './greater-realm-hydrology-authority';
import {
  GREATER_REALM_STRATEGIC_AUDITS_VERSION,
  measureGreaterRealmCastleSuitability,
  measureGreaterRealmInnerGateThroneRedundancy,
  measureGreaterRealmRegionBoundaryAlignment,
  measureGreaterRealmTierPotentialDensity,
  type GreaterRealmCastleAuditMetrics,
  type GreaterRealmInnerGateThroneMetrics,
  type GreaterRealmRegionBoundaryAlignmentMetrics,
  type GreaterRealmTierPotentialDensityMetrics,
} from './greater-realm-strategic-audits';
import {
  deriveGreaterRealmSupportNormalizedAngularSectors,
} from './greater-realm-castle-distribution';
import {
  GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY,
  deriveGreaterRealmTierOneSemanticRegionsFromFinalGeometry,
  measureGreaterRealmTopographicQa,
  type GreaterRealmTopographicQaReport,
} from './greater-realm-topographic-qa';
import {
  benchmarkGreaterRealmChunkPartition,
  type GreaterRealmChunkPartitionBenchmark,
} from './greater-realm-chunk-benchmark';
import {
  measureGreaterRealmTopographyPatchSupport,
  type GreaterRealmTopographyPatchSupportMetrics,
} from './greater-realm-topography-patch-support';

export const GREATER_REALM_GENERATOR_VERSION =
  'greater-realm-v2-natural-continent-pr-a.18' as const;
// Package/algorithm revisions must not silently reroll root-seed ordinals.
// Bump this namespace only for an explicitly approved deterministic world reroll.
export const GREATER_REALM_TERRAIN_SEED_NAMESPACE =
  'greater-realm-v2-natural-continent-pr-a.3' as const;
export const GREATER_REALM_PRIVATE_PACKAGE_MAGIC = 'WKGR-PRIVATE-ATLAS-V1' as const;
export const GREATER_REALM_PRIVATE_MANIFEST_KIND =
  'warpkeep.greater-realm.private-candidate.v1' as const;

const PRIVATE_CANVAS_RADIUS = 270;
const ACTIVE_DEEP_OCEAN_BUFFER_MINIMUM = 20;
const ACTIVE_DEEP_OCEAN_BUFFER_SPAN = 9;
const SEA_LEVEL = 0;
const REGION_COUNT = 10;
const TIER_I_REGION_COUNT = 6;
const TIER_II_REGION_COUNT = 3;
const TIER_III_REGION_INDEX = 9;
const HEX_NEIGHBOR_COUNT = 6;
const INT32_MAX = 0x7fff_ffff;
const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
const WATER_SEA = 5;
const WATER_MARSH = 6;
// Calibrated against ordinary deterministic continents so the generated river
// network falls inside the reviewed 48–72 range without truncating valid
// watersheds after the fact. The flow authority remains continuous; this is
// only the classification threshold between a major river and a minor stream.
const MAJOR_RIVER_DISCHARGE = 144;

export const GREATER_REALM_REGION_SPECS = Object.freeze([
  Object.freeze({ id: 'T1_LOWLANDS', name: 'The Hegemony Lowlands', tier: 1 }),
  Object.freeze({ id: 'T1_FROSTMERE', name: 'Frostmere Reach', tier: 1 }),
  Object.freeze({ id: 'T1_SUNSCAR', name: 'Sunscar Expanse', tier: 1 }),
  Object.freeze({ id: 'T1_MIREFEN', name: 'Mirefen Delta', tier: 1 }),
  Object.freeze({ id: 'T1_STONEWAKE', name: 'Stonewake Isles', tier: 1 }),
  Object.freeze({ id: 'T1_EMBERWOOD', name: 'Emberwood March', tier: 1 }),
  Object.freeze({ id: 'T2_CROWNWOOD', name: 'Crownwood March', tier: 2 }),
  Object.freeze({ id: 'T2_IRONVEIL', name: 'Ironveil March', tier: 2 }),
  Object.freeze({ id: 'T2_GLASSWATER', name: 'Glasswater March', tier: 2 }),
  Object.freeze({ id: 'T3_THRONEHEART', name: 'Throneheart', tier: 3 }),
] as const);

const GREATER_REALM_PROVISIONAL_GATE_GRAPH = Object.freeze([
  Object.freeze([0, 6]),
  Object.freeze([1, 6]),
  Object.freeze([2, 7]),
  Object.freeze([3, 7]),
  Object.freeze([4, 8]),
  Object.freeze([5, 8]),
  Object.freeze([6, 9]),
  Object.freeze([7, 9]),
  Object.freeze([8, 9]),
] as const);

export type GreaterRealmGateGraphEdge = readonly [number, number];

export type GreaterRealmRankedSiblingSearchOption = Readonly<{
  tierOneCells: readonly number[];
  tierTwoCells: readonly number[];
}>;

export type GreaterRealmRankedSiblingSearchLimits = Readonly<{
  maximumSearchNodes: number;
  maximumCompletePlans: number;
}>;

export type GreaterRealmRankedSiblingSearchResult<Alternative, Option> =
  | Readonly<{
      outcome: 'match';
      alternative: Alternative;
      options: readonly Option[];
    }>
  | Readonly<{ outcome: 'no-match' }>
  | Readonly<{ outcome: 'search-node-limit' }>
  | Readonly<{ outcome: 'complete-plan-limit' }>;

export const GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS = 16 as const;
export const GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT = 2 as const;

export type GreaterRealmLowlandsRepairGateEdgeEligibility = Readonly<{
  child: number;
  tierOneEndpointDry: boolean;
  tierTwoEndpointDry: boolean;
  tierOneEndpointProtected: boolean;
  tierTwoEndpointProtected: boolean;
  tierOneEndpointReserve: boolean;
  tierTwoEndpointReserve: boolean;
  tierOneOriginalRegion: number;
  tierOneTrialRegion: number;
  tierOneCorridorProtected: boolean;
  tierOneCorridorForeignOwned: boolean;
  tierTwoCorridorProtected: boolean;
  tierTwoCorridorReserve: boolean;
}>;

/** Pure policy seam for the child-zero-only reserve apron fallback. */
export function greaterRealmLowlandsRepairGateEdgeEligible(
  edge: GreaterRealmLowlandsRepairGateEdgeEligibility,
): boolean {
  return edge.child === 0
    && edge.tierOneEndpointDry
    && edge.tierTwoEndpointDry
    && !edge.tierOneEndpointProtected
    && !edge.tierTwoEndpointProtected
    && edge.tierOneEndpointReserve
    && !edge.tierTwoEndpointReserve
    && edge.tierOneOriginalRegion === 0
    && edge.tierOneTrialRegion === 0
    && !edge.tierOneCorridorProtected
    && !edge.tierOneCorridorForeignOwned
    && !edge.tierTwoCorridorProtected
    && !edge.tierTwoCorridorReserve;
}

/**
 * Rank repair-only bundle options without allowing Lowlands to become a donor.
 * A non-Lowlands child borrows only when it has no compatible own bundle.
 */
export function rankGreaterRealmLowlandsRepairBundleOptions<Option>(
  options: readonly Option[],
  requestedChild: number,
  childFor: (option: Option) => number,
  scoreFor: (option: Option) => number,
  endpointFor: (option: Option) => number,
): readonly Option[] {
  if (!Number.isSafeInteger(requestedChild) || requestedChild < 0) {
    fail('GREATER_REALM_LOWLANDS_REPAIR_CHILD_INVALID');
  }
  const own = options.filter(option => childFor(option) === requestedChild);
  const eligible = own.length > 0
    ? own
    : requestedChild === 0
      ? []
      : options.filter(option => childFor(option) !== 0);
  return Object.freeze([...eligible].sort((first, second) => (
    scoreFor(first) - scoreFor(second)
    || childFor(first) - childFor(second)
    || endpointFor(first) - endpointFor(second)
  )));
}

export type GreaterRealmGateApronSearchLaneResult<Alternative, Option> = Readonly<{
  lane: GreaterRealmGateApronSearchLane;
  result: GreaterRealmRankedSiblingSearchResult<Alternative, Option>;
}>;

export type GreaterRealmGateApronSearchLane = 'ordinary' | 'lowlands-repair';

export function assertGreaterRealmRepairOwnershipUnchanged(input: Readonly<{
  immutableCell: Uint8Array;
  originalTierId: Uint8Array;
  originalRegionId: Uint8Array;
  tierId: Uint8Array;
  regionId: Uint8Array;
}>): void {
  const { immutableCell } = input;
  if (
    input.originalTierId.length !== immutableCell.length
    || input.originalRegionId.length !== immutableCell.length
    || input.tierId.length !== immutableCell.length
    || input.regionId.length !== immutableCell.length
  ) fail('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_SHAPE_INVALID');
  for (let cell = 0; cell < immutableCell.length; cell += 1) {
    if (
      immutableCell[cell] === 1
      && (
        input.tierId[cell] !== input.originalTierId[cell]
        || input.regionId[cell] !== input.originalRegionId[cell]
      )
    ) fail('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_CHANGED');
  }
}

/**
 * Keep bounded-limit semantics terminal. Repair is legal only after the
 * ordinary frontier has been completely explored and proved to have no match.
 */
export function runGreaterRealmGateApronSearchLanes<Alternative, Option>(
  ordinarySearch: () => GreaterRealmRankedSiblingSearchResult<Alternative, Option>,
  repairSearch: () => GreaterRealmRankedSiblingSearchResult<Alternative, Option>,
): GreaterRealmGateApronSearchLaneResult<Alternative, Option> {
  const ordinary = ordinarySearch();
  if (ordinary.outcome !== 'no-match') {
    return Object.freeze({ lane: 'ordinary', result: ordinary });
  }
  return Object.freeze({ lane: 'lowlands-repair', result: repairSearch() });
}

/**
 * Explore ranked component assignments and their ranked sibling-pair options
 * on one deterministic diagonal. Adding the assignment rank to the local
 * option rank prevents an individually strong but globally incompatible
 * component assignment from consuming the entire bounded search budget.
 */
export function searchGreaterRealmRankedSiblingAlternatives<
  Alternative,
  Option extends GreaterRealmRankedSiblingSearchOption,
>(
  alternatives: readonly Alternative[],
  optionGroupsFor: (alternative: Alternative) => readonly (readonly Option[])[],
  accept: (alternative: Alternative, options: readonly Option[]) => boolean,
  limits: GreaterRealmRankedSiblingSearchLimits,
): GreaterRealmRankedSiblingSearchResult<Alternative, Option>;
export function searchGreaterRealmRankedSiblingAlternatives<Alternative, Option>(
  alternatives: readonly Alternative[],
  optionGroupsFor: (alternative: Alternative) => readonly (readonly Option[])[],
  accept: (alternative: Alternative, options: readonly Option[]) => boolean,
  limits: GreaterRealmRankedSiblingSearchLimits,
  footprintsFor: (
    option: Option,
  ) => readonly GreaterRealmRankedSiblingSearchOption[],
): GreaterRealmRankedSiblingSearchResult<Alternative, Option>;
export function searchGreaterRealmRankedSiblingAlternatives<Alternative, Option>(
  alternatives: readonly Alternative[],
  optionGroupsFor: (alternative: Alternative) => readonly (readonly Option[])[],
  accept: (alternative: Alternative, options: readonly Option[]) => boolean,
  limits: GreaterRealmRankedSiblingSearchLimits,
  footprintsFor?: (
    option: Option,
  ) => readonly GreaterRealmRankedSiblingSearchOption[],
): GreaterRealmRankedSiblingSearchResult<Alternative, Option> {
  if (
    !Number.isSafeInteger(limits.maximumSearchNodes)
    || limits.maximumSearchNodes < 1
    || !Number.isSafeInteger(limits.maximumCompletePlans)
    || limits.maximumCompletePlans < 1
  ) fail('GREATER_REALM_RANKED_SIBLING_SEARCH_LIMIT_INVALID');
  const optionGroupsByAlternative = alternatives.map(optionGroupsFor);
  const maximumTotalRank = optionGroupsByAlternative.reduce((maximum, groups, index) => (
    groups.length === 0 || groups.some(options => options.length === 0)
      ? maximum
      : Math.max(
          maximum,
          index + groups.reduce((sum, options) => sum + options.length - 1, 0),
        )
  ), -1);
  const occupiedTierOne = new Set<number>();
  const occupiedTierTwo = new Set<number>();
  let searchNodes = 0;
  let completePlans = 0;
  let searchNodeLimitReached = false;
  let completePlanLimitReached = false;
  let result: Extract<
    GreaterRealmRankedSiblingSearchResult<Alternative, Option>,
    { outcome: 'match' }
  > | undefined;
  // Preserve the original bounded traversal exactly. Future work is structural:
  // unvisited opaque footprint choices remain a limit, not an inferred no-match.
  const hasFutureRankedWork = (
    currentTotalRank: number,
    currentAlternativeRank: number,
  ): boolean => {
    for (
      let futureTotalRank = currentTotalRank;
      futureTotalRank <= maximumTotalRank;
      futureTotalRank += 1
    ) {
      const maximumAlternativeRank = Math.min(
        futureTotalRank,
        alternatives.length - 1,
      );
      const firstAlternativeRank = futureTotalRank === currentTotalRank
        ? currentAlternativeRank + 1
        : 0;
      for (
        let futureAlternativeRank = firstAlternativeRank;
        futureAlternativeRank <= maximumAlternativeRank;
        futureAlternativeRank += 1
      ) {
        const groups = optionGroupsByAlternative[futureAlternativeRank]!;
        if (groups.length === 0 || groups.some(options => options.length === 0)) {
          continue;
        }
        const localRank = futureTotalRank - futureAlternativeRank;
        const maximumLocalRank = groups.reduce(
          (sum, options) => sum + options.length - 1,
          0,
        );
        if (localRank >= 0 && localRank <= maximumLocalRank) return true;
      }
    }
    return false;
  };
  const footprintConflicts = (
    footprint: GreaterRealmRankedSiblingSearchOption,
  ): boolean => footprint.tierOneCells.some(cell => occupiedTierOne.has(cell))
    || footprint.tierTwoCells.some(cell => occupiedTierTwo.has(cell));
  const occupyFootprint = (
    footprint: GreaterRealmRankedSiblingSearchOption,
  ): void => {
    for (const cell of footprint.tierOneCells) occupiedTierOne.add(cell);
    for (const cell of footprint.tierTwoCells) occupiedTierTwo.add(cell);
  };
  const releaseFootprint = (
    footprint: GreaterRealmRankedSiblingSearchOption,
  ): void => {
    for (const cell of footprint.tierOneCells) occupiedTierOne.delete(cell);
    for (const cell of footprint.tierTwoCells) occupiedTierTwo.delete(cell);
  };

  for (let totalRank = 0; totalRank <= maximumTotalRank && !result; totalRank += 1) {
    const maximumAlternativeRank = Math.min(totalRank, alternatives.length - 1);
    for (
      let alternativeRank = 0;
      alternativeRank <= maximumAlternativeRank && !result;
      alternativeRank += 1
    ) {
      const alternative = alternatives[alternativeRank]!;
      const groups = optionGroupsByAlternative[alternativeRank]!;
      if (groups.length === 0 || groups.some(options => options.length === 0)) continue;
      const selected = new Array<Option | undefined>(groups.length);
      const chooseAtRank = (depth: number, remainingRank: number): boolean => {
        if (depth === groups.length) {
          if (remainingRank !== 0) return false;
          if (completePlans >= limits.maximumCompletePlans) {
            completePlanLimitReached = true;
            return false;
          }
          completePlans += 1;
          const options = Object.freeze([...selected] as Option[]);
          if (!accept(alternative, options)) return false;
          result = Object.freeze({ outcome: 'match', alternative, options });
          return true;
        }
        const options = groups[depth]!;
        const maximumOptionIndex = Math.min(remainingRank, options.length - 1);
        for (let optionIndex = 0; optionIndex <= maximumOptionIndex; optionIndex += 1) {
          if (searchNodes >= limits.maximumSearchNodes) {
            searchNodeLimitReached = true;
            return false;
          }
          searchNodes += 1;
          const option = options[optionIndex]!;
          const directFootprint = footprintsFor === undefined
            ? option as unknown as GreaterRealmRankedSiblingSearchOption
            : undefined;
          const footprints = footprintsFor?.(option);
          if (
            directFootprint
              ? footprintConflicts(directFootprint)
              : footprints!.some(footprintConflicts)
          ) continue;
          selected[depth] = option;
          if (directFootprint) occupyFootprint(directFootprint);
          else for (const footprint of footprints!) occupyFootprint(footprint);
          let matched = false;
          try {
            matched = chooseAtRank(depth + 1, remainingRank - optionIndex);
          } finally {
            selected[depth] = undefined;
            if (directFootprint) releaseFootprint(directFootprint);
            else for (const footprint of footprints!) releaseFootprint(footprint);
          }
          if (matched) return true;
        }
        return false;
      };
      chooseAtRank(0, totalRank - alternativeRank);
      if (
        !searchNodeLimitReached
        && !completePlanLimitReached
        && (
          searchNodes >= limits.maximumSearchNodes
          || completePlans >= limits.maximumCompletePlans
        )
        && hasFutureRankedWork(totalRank, alternativeRank)
      ) {
        if (searchNodes >= limits.maximumSearchNodes) {
          searchNodeLimitReached = true;
        } else {
          completePlanLimitReached = true;
        }
      }
      if (
        searchNodes >= limits.maximumSearchNodes
        || completePlans >= limits.maximumCompletePlans
      ) break;
    }
    if (
      searchNodes >= limits.maximumSearchNodes
      || completePlans >= limits.maximumCompletePlans
    ) break;
  }
  if (result) return result;
  if (searchNodeLimitReached) {
    return Object.freeze({ outcome: 'search-node-limit' });
  }
  if (completePlanLimitReached) {
    return Object.freeze({ outcome: 'complete-plan-limit' });
  }
  return Object.freeze({ outcome: 'no-match' });
}

export type GreaterRealmPseudoTectonicDomain = Readonly<{
  id: number;
  q: number;
  r: number;
  crustClass: 0 | 1 | 2;
  motionQ: number;
  motionR: number;
  buoyancy: number;
  resistance: number;
  volcanicPotential: number;
  age: number;
  baseThickness: number;
  rockFamily: GreaterRealmRockFamilyId;
}>;

type GreaterRealmPseudoTectonicDomainSeed = Omit<
  GreaterRealmPseudoTectonicDomain,
  'baseThickness' | 'rockFamily'
>;

export type GreaterRealmPrivateGate = Readonly<{
  gateIndex: number;
  firstRegion: number;
  secondRegion: number;
  firstCell: number;
  secondCell: number;
  firstApproachPath: readonly number[];
  firstAlternateApproachPath: readonly number[];
  secondApproachPath: readonly number[];
  secondAlternateApproachPath: readonly number[];
}>;

export type GreaterRealmPrivateBarrierCrossSection = Readonly<{
  firstCell: number;
  secondCell: number;
  system: 1 | 2;
  firstSideCellCount: number;
  waterAssistedCellCount: number;
  cells: readonly number[];
}>;

export type GreaterRealmPrivateCandidate = Readonly<{
  candidateOrdinal: number;
  seedMaterial: Buffer;
  candidateSeed: Uint32Array;
  domains: readonly GreaterRealmPseudoTectonicDomain[];
  grid: IndexedAxialGrid;
  legacyLowlandsTransform: LegacyLowlandsAtlasTransform;
  legacyLowlandsCell: Uint8Array;
  legacyLowlandsProtectedCell: Uint8Array;
  legacyLowlandsReserveCell: Uint8Array;
  legacyLowlandsCastleSlot: Uint8Array;
  bedrockElevation: Int32Array;
  elevation: Int32Array;
  filledElevation: Int32Array;
  sedimentDepth: Uint16Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  domainId: Uint8Array;
  geologyId: Uint8Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  geomorphologyElevation: Int32Array;
  geomorphologyTemperature: Int32Array;
  geomorphologyMoisture: Int32Array;
  geomorphologyTotalDelta: Int32Array;
  geomorphologyTerraceDelta: Int32Array;
  geomorphologyGlacialDelta: Int32Array;
  geomorphologyAridDelta: Int32Array;
  geomorphologyVolcanicDelta: Int32Array;
  geomorphologyCoastalDelta: Int32Array;
  geomorphologyGlacialMask: Uint8Array;
  geomorphologyAridMask: Uint8Array;
  geomorphologyVolcanicMask: Uint8Array;
  geomorphologyVolcanicAnchorMask: Uint8Array;
  geomorphologyCoastalMask: Uint8Array;
  geomorphologyCoastalClass: Uint8Array;
  regionId: Uint8Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  waterBodyId: Uint32Array;
  waterDepthClass: Uint8Array;
  waterSurfaceLevel: Int32Array;
  waterDownstream: Int32Array;
  waterBankSeed: Uint32Array;
  waterGenerationVersion: Uint16Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  slope: Uint16Array;
  aspect: Uint8Array;
  profileCurvature: Int32Array;
  planCurvature: Int32Array;
  wetnessIndex: Uint16Array;
  exposure: Int32Array;
  distanceToCoast: Uint16Array;
  distanceToFreshwater: Uint16Array;
  watershedId: Int32Array;
  ridgeId: Int32Array;
  temperature: Int32Array;
  moisture: Int32Array;
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  castleSlot: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  throneAnchor: Uint8Array;
  dressingExcluded: Uint8Array;
  ecologyClass: Uint8Array;
  vegetationDensity: Uint8Array;
  groundcoverDensity: Uint8Array;
  wildflowerDensity: Uint8Array;
  routeClass: Uint8Array;
  landmarkClass: Uint8Array;
  ambientLifeClass: Uint8Array;
  tierOneSemanticPermutation: readonly number[];
  tierOneSemanticRegionByRole: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
  gates: readonly GreaterRealmPrivateGate[];
  barrierCrossSections: readonly GreaterRealmPrivateBarrierCrossSection[];
  stageDigests: Readonly<Record<string, string>>;
  aggregate: Omit<GreaterRealmSanitizedCandidateSource, 'candidateHandle' | 'performance'>;
  privateMetrics: Readonly<{
    activeBoundaryCells: number;
    maximumBoundaryRadiusShareBasisPoints: number;
    rotationalSimilarityBasisPoints: number;
    maximumAlignedBoundaryRun: number;
    minimumBoundaryLandDistance: number;
    saltwaterBoundaryBasisPoints: number;
    majorLandmassCount: number;
    largeIslandCount: number;
    smallIslandCount: number;
    mountainBarrierCells: number;
    measuredMinimumBarrierWidth: number;
    measuredMaximumBarrierWidth: number;
    gateRouteRedundancyProof: boolean;
    lakeBasinCandidates: number;
    riverMouthCandidates: number;
    streamHeadCandidates: number;
    resourcePotentialSites: number;
    corePotentialSites: number;
    chunkCount: number;
    chunkPopulationMinimum: number;
    chunkPopulationMedian: number;
    chunkPopulationP95: number;
    chunkPopulationMaximum: number;
    erodedMaterialUnits: number;
    depositedMaterialUnits: number;
    exportedSedimentUnits: number;
    minimumLargestPassableRegionShareBasisPoints: number;
    largestPassableRegionSharesBasisPoints: readonly number[];
    minorPassableFragmentSharesBasisPoints: readonly number[];
    passableSemanticInterfaceDensityBasisPoints: readonly number[];
    passableImmutablePerimeterDensityBasisPoints: readonly number[];
    passableTendrilSharesBasisPoints: readonly number[];
    tierRadialAgreementBasisPoints: number;
    radialTierOneBoundaryShareBasisPoints: number;
    highlandBarrierShareBasisPoints: number;
    barrierMeanElevationAdvantage: number;
    barrierMeanUpliftAdvantage: number;
    naturalComposition: GreaterRealmNaturalCompositionMetrics;
    geomorphology: GreaterRealmGeomorphologyMetrics;
    reliefStructure: GreaterRealmReliefStructureMetrics;
    geologyAuthority: Readonly<{
      version: typeof GREATER_REALM_GEOLOGY_AUTHORITY_VERSION;
      metrics: GreaterRealmDomainMaterialMetrics;
    }>;
    hydrologyAuthority: Readonly<{
      version: typeof GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION;
      generationVersion: typeof GREATER_REALM_HYDROLOGY_GENERATION_VERSION;
      metrics: GreaterRealmHydrologyAuthorityMetrics;
    }>;
    strategicAudits: Readonly<{
      version: typeof GREATER_REALM_STRATEGIC_AUDITS_VERSION;
      regionBoundaryAlignment: GreaterRealmRegionBoundaryAlignmentMetrics;
      tierPotentialDensity: GreaterRealmTierPotentialDensityMetrics;
      castleSuitability: GreaterRealmCastleAuditMetrics;
      innerGateThrone: GreaterRealmInnerGateThroneMetrics;
    }>;
    topographicQa: GreaterRealmTopographicQaReport;
    chunkBenchmark: GreaterRealmChunkPartitionBenchmark;
    topographyPatchSupport: GreaterRealmTopographyPatchSupportMetrics;
    livingWorld: Readonly<{
      version: typeof GREATER_REALM_LIVING_WORLD_VERSION;
      metrics: GreaterRealmLivingWorldMetrics;
      invariants: GreaterRealmLivingWorldInvariants;
    }>;
    throneAnchorBarrierClearance: number;
    tierThreePassableLandCells: number;
    smallestOtherRegionPassableLandCells: number;
    eligibilityFailureCodes: readonly string[];
  }>;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertRootSeed(rootSeed: Uint8Array): void {
  if (!(rootSeed instanceof Uint8Array) || rootSeed.byteLength !== 32) {
    fail('GREATER_REALM_ROOT_SEED_INVALID');
  }
}

function axialDistance(q: number, r: number, otherQ = 0, otherR = 0): number {
  const deltaQ = q - otherQ;
  const deltaR = r - otherR;
  return Math.max(Math.abs(deltaQ), Math.abs(deltaR), Math.abs(-deltaQ - deltaR));
}

function hexDot(q1: number, r1: number, q2: number, r2: number): number {
  return 2 * q1 * q2 + q1 * r2 + r1 * q2 + 2 * r1 * r2;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function integerSquareRoot(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) fail('GREATER_REALM_INTEGER_SQRT_INVALID');
  if (value < 2) return value;
  let low = 1;
  let high = Math.min(value, 1 << 26);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const square = middle * middle;
    if (square === value) return middle;
    if (square < value) low = middle + 1;
    else high = middle - 1;
  }
  return high;
}

export function deriveGreaterRealmCandidateSeedMaterial(
  rootSeed: Uint8Array,
  candidateOrdinal: number,
): Buffer {
  assertRootSeed(rootSeed);
  if (!Number.isSafeInteger(candidateOrdinal) || candidateOrdinal < 0) {
    fail('GREATER_REALM_CANDIDATE_ORDINAL_INVALID');
  }
  return createHmac('sha256', rootSeed)
    .update(GREATER_REALM_TERRAIN_SEED_NAMESPACE, 'utf8')
    .update('\0candidate\0', 'utf8')
    .update(String(candidateOrdinal), 'utf8')
    .digest();
}

function deriveCandidateSeed(
  seedMaterial: Uint8Array,
): Uint32Array {
  const digest = createHash('sha256')
    .update('warpkeep-greater-realm-u32-v1\0', 'utf8')
    .update(seedMaterial)
    .digest();
  try {
    return new Uint32Array([
      digest.readUInt32LE(0),
      digest.readUInt32LE(4),
      digest.readUInt32LE(8),
      digest.readUInt32LE(12),
    ]);
  } finally {
    digest.fill(0);
  }
}

let sharedPrivateCanvas: IndexedAxialGrid | undefined;

function greaterRealmPrivateCanvasAuthority(): IndexedAxialGrid {
  if (sharedPrivateCanvas) return sharedPrivateCanvas;
  const coordinates: AxialCoordinate[] = [];
  for (let q = -PRIVATE_CANVAS_RADIUS; q <= PRIVATE_CANVAS_RADIUS; q += 1) {
    const minimumR = Math.max(-PRIVATE_CANVAS_RADIUS, -q - PRIVATE_CANVAS_RADIUS);
    const maximumR = Math.min(PRIVATE_CANVAS_RADIUS, -q + PRIVATE_CANVAS_RADIUS);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  sharedPrivateCanvas = indexGreaterRealmAxialGrid(coordinates);
  return sharedPrivateCanvas;
}

/** A defensive snapshot; callers can never mutate the generator's cached authority grid. */
export function greaterRealmPrivateCanvas(): IndexedAxialGrid {
  const canvas = greaterRealmPrivateCanvasAuthority();
  return Object.freeze({
    cellCount: canvas.cellCount,
    q: new Int32Array(canvas.q),
    r: new Int32Array(canvas.r),
    neighbors: new Int32Array(canvas.neighbors),
    indexOf: canvas.indexOf,
  });
}

function separatedDomains(
  candidateSeed: GreaterRealmTerrainSeed,
): readonly GreaterRealmPseudoTectonicDomainSeed[] {
  const count = 7 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tectonic-domain-count'),
      0,
      0,
    ) % 6
  );
  const domains: GreaterRealmPseudoTectonicDomainSeed[] = [];
  const positionChannel = greaterRealmTerrainChannelId('tectonic-domain-position');
  for (let ordinal = 0; ordinal < 4_096 && domains.length < count; ordinal += 1) {
    const qRandom = greaterRealmCounterRandomU32(candidateSeed, positionChannel, 0, 0, ordinal * 2);
    const rRandom = greaterRealmCounterRandomU32(candidateSeed, positionChannel, 0, 0, ordinal * 2 + 1);
    const q = (qRandom % 361) - 180;
    const minimumR = Math.max(-180, -q - 180);
    const maximumR = Math.min(180, -q + 180);
    const r = minimumR + (rRandom % (maximumR - minimumR + 1));
    if (domains.some(domain => axialDistance(q, r, domain.q, domain.r) < 46)) continue;
    const id = domains.length;
    const attribute = (sample: number) => greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tectonic-domain-attribute'),
      q,
      r,
      sample,
    );
    const motion = GREATER_REALM_AXIAL_DIRECTIONS[attribute(1) % 6]!;
    domains.push(Object.freeze({
      id,
      q,
      r,
      crustClass: (id === 0 ? 0 : attribute(0) % 3) as 0 | 1 | 2,
      motionQ: motion.q * (1 + (attribute(2) % 3)),
      motionR: motion.r * (1 + (attribute(3) % 3)),
      buoyancy: (attribute(4) % 5_001) - 2_000,
      resistance: 3_000 + (attribute(5) % 5_001),
      volcanicPotential: attribute(6) % 10_001,
      age: 1_000 + (attribute(7) % 9_001),
    }));
  }
  if (domains.length !== count) {
    rejectGreaterRealmCandidate('GREATER_REALM_TECTONIC_DOMAIN_PLACEMENT_FAILED');
  }
  return Object.freeze(domains);
}

function nearestDomains(
  grid: IndexedAxialGrid,
  domains: readonly GreaterRealmPseudoTectonicDomainSeed[],
): Readonly<{
  domainId: Uint8Array;
  nearestDistance: Uint16Array;
  boundaryCloseness: Uint16Array;
}> {
  const domainId = new Uint8Array(grid.cellCount);
  const nearestDistance = new Uint16Array(grid.cellCount);
  const boundaryCloseness = new Uint16Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    let nearest = INT32_MAX;
    let second = INT32_MAX;
    let nearestId = 0;
    for (const domain of domains) {
      const distance = axialDistance(grid.q[index]!, grid.r[index]!, domain.q, domain.r);
      if (distance < nearest || (distance === nearest && domain.id < nearestId)) {
        second = nearest;
        nearest = distance;
        nearestId = domain.id;
      } else if (distance < second) {
        second = distance;
      }
    }
    domainId[index] = nearestId;
    nearestDistance[index] = nearest;
    boundaryCloseness[index] = clamp(96 - (second - nearest), 0, 96);
  }
  return Object.freeze({ domainId, nearestDistance, boundaryCloseness });
}

function macroGeology(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  domains: readonly GreaterRealmPseudoTectonicDomainSeed[],
): Readonly<{
  bedrock: Int32Array;
  uplift: Int32Array;
  resistance: Int32Array;
  domainId: Uint8Array;
  geologyId: Uint8Array;
}> {
  const nearest = nearestDomains(grid, domains);
  const relief = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'relief-macro', amplitude: 7_200, smoothingPasses: 24, selfWeight: 3 },
    { channel: 'relief-meso', amplitude: 2_800, smoothingPasses: 7, selfWeight: 2 },
    { channel: 'relief-local', amplitude: 800, smoothingPasses: 1, selfWeight: 2 },
  ]);
  const bedrock = new Int32Array(grid.cellCount);
  const uplift = new Int32Array(grid.cellCount);
  const resistance = new Int32Array(grid.cellCount);
  const geologyId = new Uint8Array(grid.cellCount);
  const continentCenterChannel = greaterRealmTerrainChannelId('dominant-continent-center');
  const continentCenterQ = (
    greaterRealmCounterRandomU32(candidateSeed, continentCenterChannel, 0, 0, 0) % 45
  ) - 22;
  const continentCenterR = (
    greaterRealmCounterRandomU32(candidateSeed, continentCenterChannel, 0, 0, 1) % 45
  ) - 22;
  const islandChannel = greaterRealmTerrainChannelId('subduction-island-arcs');
  const islandArcCount = 3 + (
    greaterRealmCounterRandomU32(candidateSeed, islandChannel, 0, 0, 0) % 6
  );
  const islandAnchors: Array<Readonly<{ q: number; r: number }>> = [];
  const islandLobes: Array<Readonly<{ q: number; r: number; radius: number; peak: number }>> = [];
  const islandRifts: Array<Readonly<{
    q: number;
    r: number;
    directionQ: number;
    directionR: number;
    projection: number;
  }>> = [];
  for (let attempt = 0; attempt < 4_096 && islandAnchors.length < islandArcCount; attempt += 1) {
    const q = (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      0,
      0,
      attempt * 2 + 1,
    ) % 421) - 210;
    const minimumR = Math.max(-210, -q - 210);
    const maximumR = Math.min(210, -q + 210);
    const r = minimumR + (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      0,
      0,
      attempt * 2 + 2,
    ) % (maximumR - minimumR + 1));
    const radiusFromContinent = axialDistance(q, r, continentCenterQ, continentCenterR);
    // This materialized geological envelope includes mountain shoulders and
    // natural water/escarpment portions of the strategic barrier. The narrower
    // `barrier` mask below is the actually impassable crest/cut.
    if (
      radiusFromContinent < 200
      || radiusFromContinent > 220
      || islandAnchors.some(anchor => axialDistance(q, r, anchor.q, anchor.r) < 38)
    ) continue;
    const arc = islandAnchors.length;
    islandAnchors.push(Object.freeze({ q, r }));
    const directionIndex = greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      q,
      r,
      8_000 + arc,
    ) % HEX_NEIGHBOR_COUNT;
    const direction = GREATER_REALM_AXIAL_DIRECTIONS[directionIndex]!;
    const lobeCount = 2 + (greaterRealmCounterRandomU32(
      candidateSeed,
      islandChannel,
      q,
      r,
      9_000 + arc,
    ) % 3);
    for (let lobe = 0; lobe < lobeCount; lobe += 1) {
      const offset = (lobe * 5) - Math.floor(((lobeCount - 1) * 5) / 2);
      islandLobes.push(Object.freeze({
        q: q + direction.q * offset,
        r: r + direction.r * offset,
        radius: 11 + (greaterRealmCounterRandomU32(
          candidateSeed,
          islandChannel,
          q,
          r,
          10_000 + arc * 4 + lobe,
        ) % 5),
        peak: 42_000 + (greaterRealmCounterRandomU32(
          candidateSeed,
          islandChannel,
          q,
          r,
          20_000 + arc * 4 + lobe,
        ) % 10_001),
      }));
    }
    if (arc === 1) {
      // An off-center extensional rift splits one volcanic chain into a main
      // island and a meaningful satellite without inflating the reviewed
      // large-island count. The rift is recorded in bedrock and uplift
      // authority, and its deep transverse cut survives relaxation as a true
      // saltwater strait instead of an assignment-only island boundary.
      islandRifts.push(Object.freeze({
        q,
        r,
        directionQ: direction.q,
        directionR: direction.r,
        projection: 19,
      }));
    }
  }
  if (islandAnchors.length !== islandArcCount) {
    rejectGreaterRealmCandidate('GREATER_REALM_ISLAND_ARC_PLACEMENT_FAILED');
  }
  for (let index = 0; index < grid.cellCount; index += 1) {
    const q = grid.q[index]!;
    const r = grid.r[index]!;
    const distanceFromCenter = axialDistance(q, r, continentCenterQ, continentCenterR);
    const domain = domains[nearest.domainId[index]!]!;
    const crustBias = domain.crustClass === 0 ? 2_500 : domain.crustClass === 1 ? -3_200 : -300;
    const boundary = nearest.boundaryCloseness[index]!;
    let interaction = 0;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[index * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || nearest.domainId[neighbor] === nearest.domainId[index]) continue;
      const other = domains[nearest.domainId[neighbor]!]!;
      const towardQ = other.q - domain.q;
      const towardR = other.r - domain.r;
      const relativeQ = domain.motionQ - other.motionQ;
      const relativeR = domain.motionR - other.motionR;
      interaction = Math.max(interaction, hexDot(relativeQ, relativeR, towardQ, towardR));
    }
    const convergent = clamp(Math.floor(interaction / 16), 0, 80);
    const divergent = clamp(Math.floor(-interaction / 20), 0, 60);
    const volcanic = Math.floor((domain.volcanicPotential * boundary) / 160);
    const upliftValue = boundary * (24 + convergent) + volcanic - divergent * 40;
    const continentalUplift = clamp(upliftValue, -12_000, 18_000);
    const edgeOcean = Math.max(0, distanceFromCenter - 188) * 480;
    const broadContinent = 8_800 - distanceFromCenter * 62;
    let islandArcUplift = 0;
    let islandArcTrench = 0;
    for (const lobe of islandLobes) {
      const distance = axialDistance(q, r, lobe.q, lobe.r);
      if (distance <= lobe.radius) {
        islandArcUplift = Math.max(
          islandArcUplift,
          Math.floor((lobe.peak * (lobe.radius - distance + 1)) / (lobe.radius + 1)),
        );
      } else if (distance <= lobe.radius + 4) {
        // A subduction trench keeps each coherent arc geologically separate
        // from the continental shelf and neighboring arcs. The taper is wide
        // enough to survive thermal relaxation without becoming a hard ring.
        islandArcTrench = Math.max(
          islandArcTrench,
          18_000 - (distance - lobe.radius - 1) * 3_000,
        );
      }
    }
    let islandArcRift = 0;
    for (const rift of islandRifts) {
      const relativeQ = q - rift.q;
      const relativeR = r - rift.r;
      if (
        axialDistance(q, r, rift.q, rift.r) <= 24
        && Math.abs(
          hexDot(
            relativeQ,
            relativeR,
            rift.directionQ,
            rift.directionR,
          ) - rift.projection
        ) <= 2
      ) islandArcRift = 52_000;
    }
    // Island arcs are themselves tectonic highlands. Record a bounded share
    // of their endogenic rise in the authoritative uplift field so later
    // ridge/barrier reasoning cannot mistake them for unexplained peaks.
    uplift[index] = clamp(
      continentalUplift
        + Math.floor(islandArcUplift / 4)
        - Math.floor(islandArcRift / 4),
      -12_000,
      18_000,
    );
    bedrock[index] = clamp(
      broadContinent + crustBias + domain.buoyancy + relief[index]! + continentalUplift
        + islandArcUplift - islandArcRift
        - (islandArcUplift > 0 ? 0 : islandArcTrench) - edgeOcean,
      -60_000,
      60_000,
    );
    resistance[index] = domain.resistance;
    geologyId[index] = (domain.id % 8) + 1;
  }
  return Object.freeze({
    bedrock,
    uplift,
    resistance,
    domainId: nearest.domainId,
    geologyId,
  });
}

function distanceFromMask(
  grid: IndexedAxialGrid,
  starts: Uint8Array,
): Uint16Array {
  if (starts.length !== grid.cellCount) fail('GREATER_REALM_DISTANCE_MASK_INVALID');
  const distance = new Uint16Array(grid.cellCount);
  distance.fill(0xffff);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (starts[index] !== 1) continue;
    distance[index] = 0;
    queue[tail++] = index;
  }
  if (tail === 0) fail('GREATER_REALM_DISTANCE_MASK_EMPTY');
  while (head < tail) {
    const cell = queue[head++]!;
    const nextDistance = distance[cell]! + 1;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function activeMask(
  canvas: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  shapedElevation: Int32Array,
): Readonly<{
  mask: Uint8Array;
  distanceToLand: Uint16Array;
}> {
  const land = new Uint8Array(canvas.cellCount);
  let landCellCount = 0;
  for (let index = 0; index < canvas.cellCount; index += 1) {
    if (shapedElevation[index]! > SEA_LEVEL) {
      land[index] = 1;
      landCellCount += 1;
    }
  }
  if (landCellCount === 0) rejectGreaterRealmCandidate('GREATER_REALM_ACTIVE_MASK_EMPTY');
  const distanceToLand = distanceFromMask(canvas, land);
  const mask = new Uint8Array(canvas.cellCount);
  const boundaryChannel = greaterRealmTerrainChannelId('active-deep-ocean-boundary');
  for (let index = 0; index < canvas.cellCount; index += 1) {
    const variableBuffer = ACTIVE_DEEP_OCEAN_BUFFER_MINIMUM + (
      greaterRealmCounterRandomU32(
        candidateSeed,
        boundaryChannel,
        Math.floor(canvas.q[index]! / 9),
        Math.floor(canvas.r[index]! / 9),
      ) % ACTIVE_DEEP_OCEAN_BUFFER_SPAN
    );
    const canvasClearance = PRIVATE_CANVAS_RADIUS - axialDistance(canvas.q[index]!, canvas.r[index]!);
    if (distanceToLand[index]! <= variableBuffer && canvasClearance >= 8) mask[index] = 1;
  }
  const components = [...connectedComponents(canvas, mask)]
    .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
  if (components.length === 0) rejectGreaterRealmCandidate('GREATER_REALM_ACTIVE_MASK_EMPTY');
  mask.fill(0);
  for (const index of components[0]!) mask[index] = 1;
  const inactive = new Uint8Array(canvas.cellCount);
  for (let index = 0; index < canvas.cellCount; index += 1) {
    if (mask[index] === 0) inactive[index] = 1;
  }
  for (const component of connectedComponents(canvas, inactive)) {
    const reachesCanvasBoundary = component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (canvas.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
      }
      return false;
    });
    if (!reachesCanvasBoundary) {
      for (const cell of component) mask[cell] = 1;
    }
  }
  return Object.freeze({ mask, distanceToLand });
}

function activeGridFromCanvas(
  canvas: IndexedAxialGrid,
  mask: Uint8Array,
  activeCellCount: number,
): Readonly<{ grid: IndexedAxialGrid; sourceIndexes: Uint32Array }> {
  if (
    mask.length !== canvas.cellCount
    || !Number.isSafeInteger(activeCellCount)
    || activeCellCount < 1
    || activeCellCount > canvas.cellCount
  ) fail('GREATER_REALM_ACTIVE_GRID_MAPPING_FAILED');
  const coordinates = new Array<AxialCoordinate>(activeCellCount);
  const sourceIndexes = new Uint32Array(activeCellCount);
  let completed = false;
  try {
    let activeIndex = 0;
    for (let sourceIndex = 0; sourceIndex < canvas.cellCount; sourceIndex += 1) {
      if (mask[sourceIndex] !== 1) continue;
      if (activeIndex >= activeCellCount) fail('GREATER_REALM_ACTIVE_GRID_MAPPING_FAILED');
      coordinates[activeIndex] = {
        q: canvas.q[sourceIndex]!,
        r: canvas.r[sourceIndex]!,
      };
      sourceIndexes[activeIndex] = sourceIndex;
      activeIndex += 1;
    }
    if (activeIndex !== activeCellCount) fail('GREATER_REALM_ACTIVE_GRID_MAPPING_FAILED');
    // Filtering the already-canonical canvas preserves q/r order, so the
    // source indexes align directly with the canonical active grid. Avoid a
    // second N-entry string-key map and verify the ordering assumption before
    // any projected private authority is allocated.
    const grid = indexGreaterRealmAxialGrid(coordinates);
    for (let index = 0; index < grid.cellCount; index += 1) {
      const sourceIndex = sourceIndexes[index]!;
      if (
        grid.q[index] !== canvas.q[sourceIndex]
        || grid.r[index] !== canvas.r[sourceIndex]
      ) fail('GREATER_REALM_ACTIVE_GRID_MAPPING_FAILED');
    }
    completed = true;
    return Object.freeze({ grid, sourceIndexes });
  } finally {
    coordinates.fill(undefined as never);
    if (!completed) sourceIndexes.fill(0);
  }
}

function projectInt32(source: Int32Array, indexes: Uint32Array): Int32Array {
  const output = new Int32Array(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) output[index] = source[indexes[index]!]!;
  return output;
}

function projectUint8(source: Uint8Array, indexes: Uint32Array): Uint8Array {
  const output = new Uint8Array(indexes.length);
  for (let index = 0; index < indexes.length; index += 1) output[index] = source[indexes[index]!]!;
  return output;
}

/**
 * Materialize the placement-time sea component which already reaches the
 * active-grid boundary. The immutable Lowlands ocean may join only this
 * component; an inland depression is not a legal OCEAN contact. The returned
 * private mask is caller-owned, while the traversal queue is always retired.
 */
export function deriveGreaterRealmBoundaryConnectedInitialSeaMask(
  input: Readonly<{
    grid: IndexedAxialGrid;
    elevation: Int32Array;
  }>,
): Uint8Array {
  if (
    typeof input !== 'object'
    || input === null
    || typeof input.grid !== 'object'
    || input.grid === null
    || !isCanonicalGreaterRealmAxialGrid(input.grid)
    || !(input.elevation instanceof Int32Array)
    || input.elevation.length !== input.grid.cellCount
  ) fail('GREATER_REALM_BOUNDARY_CONNECTED_INITIAL_SEA_INPUT_INVALID');
  const connected = new Uint8Array(input.grid.cellCount);
  const queue = new Uint32Array(input.grid.cellCount);
  let completed = false;
  try {
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.elevation[cell]! > SEA_LEVEL) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] !== -1) {
          continue;
        }
        connected[cell] = 1;
        queue[tail++] = cell;
        break;
      }
    }
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[
          cell * HEX_NEIGHBOR_COUNT + direction
        ]!;
        if (
          neighbor < 0
          || connected[neighbor] === 1
          || input.elevation[neighbor]! > SEA_LEVEL
        ) continue;
        connected[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    completed = true;
    return connected;
  } finally {
    queue.fill(0);
    if (!completed) connected.fill(0);
  }
}

function legacyLowlandsOceanExteriorContacts(
  protectedByKey: ReadonlyMap<string, AxialCoordinate>,
): readonly AxialCoordinate[] {
  const exteriorByKey = new Map<string, AxialCoordinate>();
  for (const waterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    if (waterCell.regime !== 'ocean') continue;
    for (const direction of GREATER_REALM_AXIAL_DIRECTIONS) {
      const exterior = Object.freeze({
        q: waterCell.q + direction.q,
        r: waterCell.r + direction.r,
      });
      const key = `${exterior.q},${exterior.r}`;
      if (!protectedByKey.has(key)) exteriorByKey.set(key, exterior);
    }
  }
  if (exteriorByKey.size === 0) {
    fail('GREATER_REALM_LEGACY_LOWLANDS_OCEAN_EXTERIOR_MISSING');
  }
  return Object.freeze([...exteriorByKey.values()]);
}

type GreaterRealmLegacyPlacement = Readonly<{
  transform: LegacyLowlandsAtlasTransform;
  worldCell: Uint8Array;
  protectedCell: Uint8Array;
  reserveCell: Uint8Array;
  castleSlot: Uint8Array;
  proof: boolean;
}>;

/**
 * Reserve one exact, reversible placement for the deployed Lowlands patch.
 * The protected mask is the union of all 10,000 canonical cells and the
 * current Water-v1 cells; the four-cell halo lets future PRs join new geology
 * to that immutable patch without cutting a tier barrier through it.
 */
function placeLegacyLowlands(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  existingElevation: Int32Array,
): GreaterRealmLegacyPlacement {
  assertGreaterRealmLegacyLowlandsPatchLocked();
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
  const protectedByKey = new Map<string, AxialCoordinate>();
  for (const tile of patch.world.tiles) protectedByKey.set(tile.key, tile);
  for (const waterCell of patch.water.cells) {
    protectedByKey.set(waterCell.cellKey, waterCell);
  }
  const protectedCoordinates = [...protectedByKey.values()];
  const legacyOceanExteriorContacts = legacyLowlandsOceanExteriorContacts(
    protectedByKey,
  );
  let centers: number[] | undefined;
  let boundaryOnFailure: Uint8Array | undefined;
  let clearanceOnFailure: Uint16Array | undefined;
  let boundaryConnectedInitialSeaOnFailure: Uint8Array | undefined;
  try {
    const boundary = new Uint8Array(grid.cellCount);
    boundaryOnFailure = boundary;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) {
          boundary[cell] = 1;
          break;
        }
      }
    }
    const clearance = distanceFromMask(grid, boundary);
    clearanceOnFailure = clearance;
    const boundaryConnectedInitialSea = deriveGreaterRealmBoundaryConnectedInitialSeaMask({
      grid,
      elevation: existingElevation,
    });
    boundaryConnectedInitialSeaOnFailure = boundaryConnectedInitialSea;
    const targetChannel = greaterRealmTerrainChannelId('legacy-lowlands-placement-target');
    const targetQ = 148 + (
      greaterRealmCounterRandomU32(candidateSeed, targetChannel, 0, 0, 0) % 17
    ) - 8;
    const targetR = (
      greaterRealmCounterRandomU32(candidateSeed, targetChannel, 0, 0, 1) % 25
    ) - 12;
    const placementCenters: number[] = [];
    centers = placementCenters;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (clearance[cell]! >= 70 && existingElevation[cell]! > SEA_LEVEL) {
        placementCenters.push(cell);
      }
    }
    placementCenters.sort((first, second) => {
      const firstScore = axialDistance(grid.q[first]!, grid.r[first]!, targetQ, targetR) * 1_000
        - clamp(existingElevation[first]!, -12_000, 12_000) * 20
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          targetChannel,
          grid.q[first]!,
          grid.r[first]!,
          2,
        ) % 1_000);
      const secondScore = axialDistance(grid.q[second]!, grid.r[second]!, targetQ, targetR) * 1_000
        - clamp(existingElevation[second]!, -12_000, 12_000) * 20
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          targetChannel,
          grid.q[second]!,
          grid.r[second]!,
          2,
        ) % 1_000);
      return firstScore - secondScore || first - second;
    });
    if (placementCenters.length === 0) {
      rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_MISSING');
    }
    const firstRotation = greaterRealmCounterRandomU32(
      candidateSeed,
      targetChannel,
      0,
      0,
      3,
    ) % 6;
    const maximumCenterCount = Math.min(placementCenters.length, 1_024);
    for (let centerOrdinal = 0; centerOrdinal < maximumCenterCount; centerOrdinal += 1) {
      const center = placementCenters[centerOrdinal]!;
      for (let rotationOffset = 0; rotationOffset < 6; rotationOffset += 1) {
        const transform: LegacyLowlandsAtlasTransform = Object.freeze({
          rotationSteps: ((firstRotation + rotationOffset) % 6) as 0 | 1 | 2 | 3 | 4 | 5,
          globalOffsetQ: grid.q[center]!,
          globalOffsetR: grid.r[center]!,
        });
        const preservesGlobalOceanContact = legacyOceanExteriorContacts.some(
          localCoordinate => {
            const globalIndex = grid.indexOf(
              transformLegacyLowlandsToGlobal(localCoordinate, transform),
            );
            return globalIndex >= 0 && boundaryConnectedInitialSea[globalIndex] === 1;
          },
        );
        if (!preservesGlobalOceanContact) continue;
        const protectedCell = new Uint8Array(grid.cellCount);
        let worldCell: Uint8Array | undefined;
        let castleSlot: Uint8Array | undefined;
        let reserveCell: Uint8Array | undefined;
        let placementAccepted = false;
        try {
          let placementValid = true;
          for (const localCoordinate of protectedCoordinates) {
            const globalCoordinate = transformLegacyLowlandsToGlobal(localCoordinate, transform);
            const globalIndex = grid.indexOf(globalCoordinate);
            if (globalIndex < 0 || protectedCell[globalIndex] === 1) {
              placementValid = false;
              break;
            }
            protectedCell[globalIndex] = 1;
          }
          if (!placementValid) continue;

          worldCell = new Uint8Array(grid.cellCount);
          let mappedWorldCells = 0;
          let underlyingLandCells = 0;
          for (const tile of patch.world.tiles) {
            const globalCoordinate = transformLegacyLowlandsToGlobal(tile, transform);
            const globalIndex = grid.indexOf(globalCoordinate);
            if (globalIndex < 0 || worldCell[globalIndex] === 1) {
              placementValid = false;
              break;
            }
            const roundTrip = inverseGlobalToLegacyLowlands(globalCoordinate, transform);
            if (roundTrip.q !== tile.q || roundTrip.r !== tile.r) {
              placementValid = false;
              break;
            }
            worldCell[globalIndex] = 1;
            mappedWorldCells += 1;
            if (existingElevation[globalIndex]! > SEA_LEVEL) underlyingLandCells += 1;
          }
          if (
            !placementValid
            || mappedWorldCells !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.worldCellCount
            || underlyingLandCells * 100 < mappedWorldCells * 70
          ) {
            continue;
          }

          castleSlot = new Uint8Array(grid.cellCount);
          let mappedCastleSlots = 0;
          for (const slot of patch.castleSlots.rows) {
            const globalIndex = grid.indexOf(transformLegacyLowlandsToGlobal(slot, transform));
            if (globalIndex < 0 || worldCell[globalIndex] !== 1 || castleSlot[globalIndex] === 1) {
              placementValid = false;
              break;
            }
            castleSlot[globalIndex] = 1;
            mappedCastleSlots += 1;
          }
          if (!placementValid || mappedCastleSlots !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount) {
            continue;
          }

          let currentReserveCell = new Uint8Array(protectedCell);
          reserveCell = currentReserveCell;
          for (let pass = 0; pass < 4; pass += 1) {
            const expanded = new Uint8Array(currentReserveCell);
            let expandedAdopted = false;
            try {
              for (let cell = 0; cell < grid.cellCount; cell += 1) {
                if (currentReserveCell[cell] !== 1) continue;
                for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                  const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                  if (neighbor >= 0) expanded[neighbor] = 1;
                }
              }
              currentReserveCell.fill(0);
              currentReserveCell = expanded;
              reserveCell = currentReserveCell;
              expandedAdopted = true;
            } finally {
              if (!expandedAdopted) expanded.fill(0);
            }
          }
          const placement = Object.freeze({
            transform,
            worldCell,
            protectedCell,
            reserveCell: currentReserveCell,
            castleSlot,
            proof: true,
          });
          placementAccepted = true;
          return placement;
        } finally {
          if (!placementAccepted) {
            reserveCell?.fill(0);
            castleSlot?.fill(0);
            worldCell?.fill(0);
            protectedCell.fill(0);
          }
        }
      }
    }
    rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_FAILED');
  } finally {
    centers?.fill(0);
    boundaryConnectedInitialSeaOnFailure?.fill(0);
    clearanceOnFailure?.fill(0);
    boundaryOnFailure?.fill(0);
  }
  fail('GREATER_REALM_LEGACY_LOWLANDS_PLACEMENT_UNREACHABLE');
}

function fluvialPass(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  resistance: Int32Array,
  protectedCell: Uint8Array,
): Readonly<{
  elevation: Int32Array;
  filledElevation: Int32Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  sedimentDepth: Uint16Array;
  erodedMaterialUnits: number;
  depositedMaterialUnits: number;
  exportedSedimentUnits: number;
}> {
  if (
    elevation.length !== grid.cellCount
    || resistance.length !== grid.cellCount
    || protectedCell.length !== grid.cellCount
  ) fail('GREATER_REALM_FLUVIAL_INPUT_LENGTH_INVALID');
  const seaOutlets: number[] = [];
  const localContribution = new Uint32Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (elevation[index]! <= SEA_LEVEL) seaOutlets.push(index);
    else localContribution[index] = 1;
  }
  if (seaOutlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const firstFlood = priorityFloodGreaterRealmHexGrid(grid, elevation, seaOutlets);
  const firstRouting = routeGreaterRealmSingleFlow(grid, firstFlood);
  const firstAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    firstFlood.filledElevation,
    firstRouting,
    localContribution,
  );
  const carved = new Int32Array(elevation);
  const sedimentFlux = new BigUint64Array(grid.cellCount);
  let erodedMaterial = 0n;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const receiver = firstRouting.receiver[cell]!;
    if (
      receiver < 0
      || elevation[cell]! <= SEA_LEVEL
      || protectedCell[cell] === 1
    ) continue;
    const slope = Math.max(0, firstFlood.filledElevation[cell]! - firstFlood.filledElevation[receiver]!);
    const discharge = Number(firstAccumulation[cell]!);
    const incision = clamp(
      Math.floor((integerSquareRoot(discharge) * Math.min(slope, 4_000) * 48) / resistance[cell]!),
      0,
      1_200,
    );
    carved[cell] = clamp(carved[cell]! - incision, -60_000, 60_000);
    sedimentFlux[cell] = BigInt(incision);
    erodedMaterial += BigInt(incision);
  }

  // Relax the incised land before routing sediment. Deposition therefore
  // belongs to the authoritative final fluvial surface instead of describing
  // a transient surface that a later thermal pass would move away.
  const relaxed = erodeGreaterRealmThermally(grid, carved, {
    iterations: 2,
    talus: 1_100,
    transferNumerator: 1,
    transferDenominator: 24,
  }).elevation;
  const postThermalOutlets: number[] = [];
  const postThermalContribution = new Uint32Array(grid.cellCount);
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (relaxed[index]! <= SEA_LEVEL) postThermalOutlets.push(index);
    else postThermalContribution[index] = 1;
  }
  if (postThermalOutlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const postThermalFlood = priorityFloodGreaterRealmHexGrid(
    grid,
    relaxed,
    postThermalOutlets,
  );
  const postThermalRouting = routeGreaterRealmSingleFlow(grid, postThermalFlood);
  const postThermalAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    postThermalFlood.filledElevation,
    postThermalRouting,
    postThermalContribution,
  );
  const depositedElevation = new Int32Array(relaxed);
  const sedimentDepth = new Uint16Array(grid.cellCount);
  let depositedMaterial = 0n;
  let exportedSediment = 0n;
  for (let orderIndex = grid.cellCount - 1; orderIndex >= 0; orderIndex -= 1) {
    const cell = postThermalRouting.order[orderIndex]!;
    const available = sedimentFlux[cell]!;
    if (available === 0n) continue;
    const receiver = postThermalRouting.receiver[cell]!;
    let deposited = 0;
    if (
      receiver >= 0
      && relaxed[cell]! > SEA_LEVEL
      && protectedCell[cell] !== 1
    ) {
      const slope = Math.max(
        0,
        postThermalFlood.filledElevation[cell]!
          - postThermalFlood.filledElevation[receiver]!,
      );
      const discharge = Number(postThermalAccumulation[cell]!);
      if (slope < 160 && discharge > 80) {
        deposited = Math.min(
          240,
          Number(available / 4n),
          Math.max(0, 60_000 - relaxed[cell]!),
        );
        sedimentDepth[cell] = deposited;
        depositedElevation[cell] += deposited;
        depositedMaterial += BigInt(deposited);
      }
    }
    const remaining = available - BigInt(deposited);
    if (receiver >= 0) sedimentFlux[receiver] = sedimentFlux[receiver]! + remaining;
    else exportedSediment += remaining;
  }
  if (erodedMaterial !== depositedMaterial + exportedSediment) {
    fail('GREATER_REALM_SEDIMENT_BUDGET_MISMATCH');
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      depositedElevation[cell] !== relaxed[cell]! + sedimentDepth[cell]!
      || (protectedCell[cell] === 1 && sedimentDepth[cell] !== 0)
    ) fail('GREATER_REALM_FINAL_SEDIMENT_SURFACE_MISMATCH');
  }
  const outlets: number[] = [];
  for (let index = 0; index < grid.cellCount; index += 1) {
    if (depositedElevation[index]! <= SEA_LEVEL) outlets.push(index);
  }
  if (outlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_OCEAN_OUTLETS_MISSING');
  }
  const flood = priorityFloodGreaterRealmHexGrid(grid, depositedElevation, outlets);
  const routing = routeGreaterRealmSingleFlow(grid, flood);
  const accumulation = accumulateGreaterRealmSingleFlow(
    grid,
    flood.filledElevation,
    routing,
    postThermalContribution,
  );
  return Object.freeze({
    elevation: depositedElevation,
    filledElevation: flood.filledElevation,
    flowReceiver: routing.receiver,
    flowAccumulation: accumulation,
    sedimentDepth,
    erodedMaterialUnits: Number(erodedMaterial),
    depositedMaterialUnits: Number(depositedMaterial),
    exportedSedimentUnits: Number(exportedSediment),
  });
}

function reconcileLegacyLowlandsTopography(
  grid: IndexedAxialGrid,
  legacy: GreaterRealmLegacyPlacement,
  bedrockElevation: Int32Array,
  erodedElevation: Int32Array,
): Readonly<{
  bedrockElevation: Int32Array;
  elevation: Int32Array;
  filledElevation: Int32Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
}> {
  const adjustedBedrock = new Int32Array(bedrockElevation);
  const adjustedElevation = new Int32Array(erodedElevation);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.protectedCell[cell] !== 1) continue;
    adjustedBedrock[cell] = Math.max(200, adjustedBedrock[cell]!);
    adjustedElevation[cell] = Math.max(300, adjustedElevation[cell]!);
  }
  for (const waterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0 || legacy.protectedCell[cell] !== 1) {
      fail('GREATER_REALM_LEGACY_WATER_TOPOGRAPHY_MISSING');
    }
    const target = waterCell.regime === 'ocean' ? -600 : waterCell.regime === 'lake' ? -180 : -80;
    adjustedBedrock[cell] = Math.min(adjustedBedrock[cell]!, target - 80);
    adjustedElevation[cell] = Math.min(adjustedElevation[cell]!, target);
  }
  const outlets: number[] = [];
  const localContribution = new Uint32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (adjustedElevation[cell]! <= SEA_LEVEL) outlets.push(cell);
    else localContribution[cell] = 1;
  }
  if (outlets.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_RECONCILED_OCEAN_OUTLETS_MISSING');
  }
  const flood = priorityFloodGreaterRealmHexGrid(grid, adjustedElevation, outlets);
  const generatedRouting = routeGreaterRealmSingleFlow(grid, flood);
  const receiver = new Int32Array(generatedRouting.receiver);
  const legacyWaterByKey = new Map(
    GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells.map(
      waterCell => [waterCell.cellKey, waterCell] as const,
    ),
  );
  // Priority-Flood correctly treats sea-level cells as outlets, but the
  // deployed twelve-river DAG is immutable authority. Restore those exact
  // downstream edges before accumulating the reconciled Greater Realm flow.
  for (const waterCell of GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1.water.enabledCells) {
    if (waterCell.regime !== 'river') continue;
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0) fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    if (waterCell.downstreamWaterCellKey === undefined) {
      receiver[cell] = -1;
      continue;
    }
    const downstreamWaterCell = legacyWaterByKey.get(waterCell.downstreamWaterCellKey);
    if (downstreamWaterCell?.regime !== 'river') {
      fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    }
    const downstream = grid.indexOf(transformLegacyLowlandsToGlobal(
      downstreamWaterCell,
      legacy.transform,
    ));
    if (downstream < 0) fail('GREATER_REALM_LEGACY_RIVER_ROUTING_MISSING');
    receiver[cell] = downstream;
  }
  const routing = rebuildFlowRoutingFromReceivers(grid, receiver);
  const flowAccumulation = accumulateGreaterRealmSingleFlow(
    grid,
    flood.filledElevation,
    routing,
    localContribution,
  );
  return Object.freeze({
    bedrockElevation: adjustedBedrock,
    elevation: adjustedElevation,
    filledElevation: flood.filledElevation,
    flowReceiver: routing.receiver,
    flowAccumulation,
  });
}

function rebuildFlowRoutingFromReceivers(
  grid: IndexedAxialGrid,
  receiver: Int32Array,
): GreaterRealmSingleFlowRouting {
  if (receiver.length !== grid.cellCount) fail('GREATER_REALM_FLOW_INPUT_LENGTH_INVALID');
  const outlets = new Uint8Array(grid.cellCount);
  const order = new Uint32Array(grid.cellCount);
  const rank = new Uint32Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (receiver[cell] !== -1) continue;
    outlets[cell] = 1;
    queue[tail++] = cell;
  }
  let orderIndex = 0;
  while (head < tail) {
    const cell = queue[head++]!;
    order[orderIndex] = cell;
    rank[cell] = orderIndex;
    orderIndex += 1;
    const upstream: number[] = [];
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && receiver[neighbor] === cell) upstream.push(neighbor);
    }
    upstream.sort((first, second) => first - second);
    for (const upstreamCell of upstream) queue[tail++] = upstreamCell;
  }
  if (orderIndex !== grid.cellCount || tail !== grid.cellCount) {
    fail('GREATER_REALM_FLOW_CYCLE');
  }
  return Object.freeze({ receiver, order, rank, outlets });
}

type GreaterRealmStrategicFrontierEntry = Readonly<{
  cell: number;
  depth: number;
  priority: number;
}>;

function strategicFrontierLess(
  first: GreaterRealmStrategicFrontierEntry,
  second: GreaterRealmStrategicFrontierEntry,
): boolean {
  return first.priority < second.priority
    || (first.priority === second.priority && first.depth < second.depth)
    || (
      first.priority === second.priority
      && first.depth === second.depth
      && first.cell < second.cell
    );
}

function strategicFrontierPush(
  heap: GreaterRealmStrategicFrontierEntry[],
  entry: GreaterRealmStrategicFrontierEntry,
): void {
  let index = heap.length;
  heap.push(entry);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!strategicFrontierLess(entry, heap[parent]!)) break;
    heap[index] = heap[parent]!;
    index = parent;
  }
  heap[index] = entry;
}

function strategicFrontierPop(
  heap: GreaterRealmStrategicFrontierEntry[],
): GreaterRealmStrategicFrontierEntry | undefined {
  const first = heap[0];
  const last = heap.pop();
  if (!first || !last || heap.length === 0) return first;
  let index = 0;
  while (true) {
    const left = index * 2 + 1;
    if (left >= heap.length) break;
    const right = left + 1;
    const child = right < heap.length && strategicFrontierLess(heap[right]!, heap[left]!)
      ? right
      : left;
    if (!strategicFrontierLess(heap[child]!, last)) break;
    heap[index] = heap[child]!;
    index = child;
  }
  heap[index] = last;
  return first;
}

function growNaturalStrategicBasin(
  grid: IndexedAxialGrid,
  targetCount: number,
  seeds: readonly number[],
  blocked: Uint8Array,
  terrainCost: Int32Array,
  depthWeight: number,
  countedCell?: Uint8Array,
): Uint8Array {
  const selected = new Uint8Array(grid.cellCount);
  const bestPriority = new Int32Array(grid.cellCount);
  bestPriority.fill(0x7fff_ffff);
  const heap: GreaterRealmStrategicFrontierEntry[] = [];
  let selectedCount = 0;

  const offer = (cell: number, depth: number) => {
    if (cell < 0 || blocked[cell] === 1 || selected[cell] === 1) return;
    const priority = terrainCost[cell]! + depth * depthWeight;
    if (priority >= bestPriority[cell]!) return;
    bestPriority[cell] = priority;
    strategicFrontierPush(heap, Object.freeze({ cell, depth, priority }));
  };
  for (const seed of [...seeds].sort((first, second) => first - second)) {
    if (seed < 0 || blocked[seed] === 1 || selected[seed] === 1) continue;
    selected[seed] = 1;
    selectedCount += countedCell ? countedCell[seed]! : 1;
  }
  if (seeds.length === 0 || selectedCount > targetCount) {
    fail('GREATER_REALM_STRATEGIC_BASIN_SEED_INVALID');
  }
  for (const seed of seeds) {
    if (selected[seed] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      offer(grid.neighbors[seed * HEX_NEIGHBOR_COUNT + direction]!, 1);
    }
  }
  while (selectedCount < targetCount) {
    let entry = strategicFrontierPop(heap);
    if (!entry) {
      // Natural masks can contain islands separated by blocked water/reserve
      // bands. Restart from the cheapest remaining basin cell so construction
      // is total; coherence/island metrics decide whether the result is fit.
      let restart = -1;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (blocked[cell] === 1 || selected[cell] === 1) continue;
        if (
          restart < 0
          || terrainCost[cell]! < terrainCost[restart]!
          || (terrainCost[cell] === terrainCost[restart] && cell < restart)
        ) restart = cell;
      }
      if (restart < 0) {
        rejectGreaterRealmCandidate('GREATER_REALM_STRATEGIC_BASIN_CAPACITY_INVARIANT');
      }
      entry = Object.freeze({ cell: restart, depth: 0, priority: terrainCost[restart]! });
      bestPriority[restart] = entry.priority;
    }
    if (
      selected[entry.cell] === 1
      || bestPriority[entry.cell] !== entry.priority
    ) continue;
    selected[entry.cell] = 1;
    selectedCount += countedCell ? countedCell[entry.cell]! : 1;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      offer(
        grid.neighbors[entry.cell * HEX_NEIGHBOR_COUNT + direction]!,
        entry.depth + 1,
      );
    }
  }
  return selected;
}

function rebalanceCoherentStrategicGroups(
  grid: IndexedAxialGrid,
  cells: readonly number[],
  groupCount: number,
  costs: Int32Array,
  forcedGroup: Int8Array,
  initialAssignment: Uint8Array,
): Uint8Array {
  const assignment = new Uint8Array(initialAssignment);
  const ordinalByCell = new Int32Array(grid.cellCount);
  ordinalByCell.fill(-1);
  const counts = new Uint32Array(groupCount);
  const targets = new Uint32Array(groupCount);
  for (let group = 0; group < groupCount; group += 1) {
    targets[group] = Math.floor(cells.length / groupCount)
      + (group < cells.length % groupCount ? 1 : 0);
  }
  for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
    const cell = cells[ordinal]!;
    ordinalByCell[cell] = ordinal;
    counts[assignment[cell]!] += 1;
  }

  type Transfer = Readonly<{
    cell: number;
    from: number;
    to: number;
    priority: number;
  }>;
  const heap: Transfer[] = [];
  const less = (first: Transfer, second: Transfer) => first.priority < second.priority
    || (first.priority === second.priority && first.cell < second.cell)
    || (first.priority === second.priority && first.cell === second.cell && first.to < second.to);
  const push = (entry: Transfer) => {
    let index = heap.length;
    heap.push(entry);
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!less(entry, heap[parent]!)) break;
      heap[index] = heap[parent]!;
      index = parent;
    }
    heap[index] = entry;
  };
  const pop = (): Transfer | undefined => {
    if (heap.length === 0) return undefined;
    const first = heap[0]!;
    const last = heap.pop()!;
    if (heap.length === 0) return first;
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heap.length) break;
      const right = left + 1;
      const child = right < heap.length && less(heap[right]!, heap[left]!) ? right : left;
      if (!less(heap[child]!, last)) break;
      heap[index] = heap[child]!;
      index = child;
    }
    heap[index] = last;
    return first;
  };
  const offer = (cell: number, to: number) => {
    const ordinal = ordinalByCell[cell]!;
    if (ordinal < 0 || forcedGroup[cell]! >= 0) return;
    const from = assignment[cell]!;
    if (from === to || counts[from]! <= targets[from]! || counts[to]! >= targets[to]!) return;
    let adjacentToTarget = 0;
    let adjacentToSource = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      if (assignment[neighbor] === to) adjacentToTarget += 1;
      else if (assignment[neighbor] === from) adjacentToSource += 1;
    }
    if (adjacentToTarget === 0) return;
    const delta = costs[ordinal * groupCount + to]! - costs[ordinal * groupCount + from]!;
    // Peel coherent boundary bands instead of teleporting isolated cells. The
    // terrain cost keeps those bands attached to the same natural basin field.
    const priority = delta + adjacentToSource * 360 - adjacentToTarget * 520;
    push(Object.freeze({ cell, from, to, priority }));
  };
  for (const cell of cells) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && ordinalByCell[neighbor]! >= 0) offer(cell, assignment[neighbor]!);
    }
  }
  let remaining = [...counts].reduce(
    (total, count, group) => total + Math.max(0, count - targets[group]!),
    0,
  );
  while (remaining > 0) {
    let transfer = pop();
    if (!transfer) {
      // A sea channel can disconnect two otherwise valid continental basins.
      // Rebalance the best whole-envelope cell deterministically instead of
      // aborting the candidate; later land-coherence gates reject a bad island
      // allocation, while water-envelope quotas remain total and reproducible.
      let fallback: Transfer | undefined;
      for (const cell of cells) {
        const ordinal = ordinalByCell[cell]!;
        const from = assignment[cell]!;
        if (forcedGroup[cell]! >= 0 || counts[from]! <= targets[from]!) continue;
        for (let to = 0; to < groupCount; to += 1) {
          if (counts[to]! >= targets[to]!) continue;
          const priority = costs[ordinal * groupCount + to]!
            - costs[ordinal * groupCount + from]!;
          const candidate = Object.freeze({ cell, from, to, priority });
          if (!fallback || less(candidate, fallback)) fallback = candidate;
        }
      }
      if (!fallback) fail('GREATER_REALM_STRATEGIC_GROUP_REBALANCE_INVARIANT');
      assignment[fallback.cell] = fallback.to;
      counts[fallback.from] -= 1;
      counts[fallback.to] += 1;
      remaining -= 1;
      continue;
    }
    if (
      assignment[transfer.cell] !== transfer.from
      || counts[transfer.from]! <= targets[transfer.from]!
      || counts[transfer.to]! >= targets[transfer.to]!
    ) continue;
    let stillAdjacent = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[transfer.cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && assignment[neighbor] === transfer.to) {
        stillAdjacent = true;
        break;
      }
    }
    if (!stillAdjacent) continue;
    assignment[transfer.cell] = transfer.to;
    counts[transfer.from] -= 1;
    counts[transfer.to] += 1;
    remaining -= 1;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[transfer.cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || ordinalByCell[neighbor]! < 0) continue;
      offer(neighbor, transfer.to);
      offer(transfer.cell, assignment[neighbor]!);
    }
  }
  return assignment;
}

function assignCoherentStrategicGroups(
  grid: IndexedAxialGrid,
  cells: readonly number[],
  groupCount: number,
  costs: Int32Array,
  forcedGroup: Int8Array,
): Uint8Array {
  if (costs.length !== cells.length * groupCount || forcedGroup.length !== grid.cellCount) {
    fail('GREATER_REALM_STRATEGIC_GROUP_INPUT_INVALID');
  }
  const initialAssignment = new Uint8Array(grid.cellCount);
  initialAssignment.fill(0xff);
  for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
    const cell = cells[ordinal]!;
    const fixed = forcedGroup[cell]!;
    if (fixed >= groupCount) fail('GREATER_REALM_STRATEGIC_GROUP_FORCE_INVALID');
    let selected = fixed;
    if (selected < 0) {
      selected = 0;
      let selectedCost = costs[ordinal * groupCount]!;
      for (let group = 1; group < groupCount; group += 1) {
        const cost = costs[ordinal * groupCount + group]!;
        if (cost < selectedCost || (cost === selectedCost && group < selected)) {
          selected = group;
          selectedCost = cost;
        }
      }
    }
    initialAssignment[cell] = selected;
  }
  return rebalanceCoherentStrategicGroups(
    grid,
    cells,
    groupCount,
    costs,
    forcedGroup,
    initialAssignment,
  );
}

function assignTiersAndRegions(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  uplift: Int32Array,
  domainId: Uint8Array,
  flowAccumulation: BigUint64Array,
  legacyReserveCell: Uint8Array,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
}> {
  const tierIIIShare = 400 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tier-three-share'),
      0,
      0,
    ) % 151
  );
  const tierIIShare = 2_250 + (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('tier-two-share'),
      0,
      0,
    ) % 401
  );
  const tierThreeCount = Math.round((grid.cellCount * tierIIIShare) / 10_000);
  const tierTwoCount = Math.round((grid.cellCount * tierIIShare) / 10_000);
  let reservedCount = 0;
  for (const reserved of legacyReserveCell) reservedCount += reserved === 1 ? 1 : 0;
  if (reservedCount >= grid.cellCount - tierThreeCount - tierTwoCount) {
    rejectGreaterRealmCandidate('GREATER_REALM_LEGACY_LOWLANDS_RESERVE_TOO_LARGE');
  }
  const basinField = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'strategic-tier-basin-macro', amplitude: 5_600, smoothingPasses: 18, selfWeight: 3 },
    { channel: 'strategic-tier-basin-local', amplitude: 1_800, smoothingPasses: 5, selfWeight: 2 },
  ]);
  const terrainCost = new Int32Array(grid.cellCount);
  const boundaryMask = new Uint8Array(grid.cellCount);
  let activeQTotal = 0;
  let activeRTotal = 0;
  let legacyQTotal = 0;
  let legacyRTotal = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    activeQTotal += grid.q[cell]!;
    activeRTotal += grid.r[cell]!;
    if (legacyReserveCell[cell] === 1) {
      legacyQTotal += grid.q[cell]!;
      legacyRTotal += grid.r[cell]!;
    }
    let flowMagnitude = 0;
    for (let flow = flowAccumulation[cell]!; flow > 1n; flow >>= 1n) flowMagnitude += 1;
    const elevationValue = elevation[cell]!;
    const waterPenalty = elevationValue <= SEA_LEVEL
      ? 7_000 + Math.min(8_000, Math.floor(Math.abs(elevationValue) / 3))
      : 0;
    const basinElevation = elevationValue > SEA_LEVEL
      ? Math.min(9_000, Math.floor(Math.abs(elevationValue - 1_400) / 3))
      : 0;
    const highlandPenalty = Math.floor(Math.max(0, uplift[cell]!) / 3);
    terrainCost[cell] = clamp(
      basinField[cell]! + waterPenalty + basinElevation + highlandPenalty - flowMagnitude * 150,
      -30_000,
      60_000,
    );
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) {
        boundaryMask[cell] = 1;
        break;
      }
    }
  }
  const distanceToActiveBoundary = distanceFromMask(grid, boundaryMask);
  const activeCenterQ = Math.round(activeQTotal / grid.cellCount);
  const activeCenterR = Math.round(activeRTotal / grid.cellCount);
  const legacyCenterQ = Math.round(legacyQTotal / reservedCount);
  const legacyCenterR = Math.round(legacyRTotal / reservedCount);
  let tierThreeSeed = -1;
  let tierThreeSeedScore = Number.POSITIVE_INFINITY;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      legacyReserveCell[cell] === 1
      || elevation[cell]! <= SEA_LEVEL
      || distanceToActiveBoundary[cell]! < 42
      || axialDistance(grid.q[cell]!, grid.r[cell]!, legacyCenterQ, legacyCenterR) < 72
    ) continue;
    const centerDistance = axialDistance(
      grid.q[cell]!,
      grid.r[cell]!,
      activeCenterQ,
      activeCenterR,
    );
    const score = terrainCost[cell]! + centerDistance * 18;
    if (score < tierThreeSeedScore || (score === tierThreeSeedScore && cell < tierThreeSeed)) {
      tierThreeSeed = cell;
      tierThreeSeedScore = score;
    }
  }
  if (tierThreeSeed < 0) {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (legacyReserveCell[cell] === 1 || elevation[cell]! <= SEA_LEVEL) continue;
      if (
        tierThreeSeed < 0
        || terrainCost[cell]! < terrainCost[tierThreeSeed]!
        || (terrainCost[cell] === terrainCost[tierThreeSeed] && cell < tierThreeSeed)
      ) tierThreeSeed = cell;
    }
  }
  if (tierThreeSeed < 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_TIER_THREE_CAPACITY_INVARIANT');
  }

  const tierThreeBlocked = new Uint8Array(legacyReserveCell);
  const tierThreeMask = growNaturalStrategicBasin(
    grid,
    tierThreeCount,
    [tierThreeSeed],
    tierThreeBlocked,
    terrainCost,
    94,
  );
  const tierTwoSeeds: number[] = [];
  const tierTwoBlocked = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierThreeMask[cell] === 1 || legacyReserveCell[cell] === 1) {
      tierTwoBlocked[cell] = 1;
    }
    if (tierThreeMask[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && tierThreeMask[neighbor] !== 1
        && legacyReserveCell[neighbor] !== 1
      ) tierTwoSeeds.push(neighbor);
    }
  }
  const tierTwoMask = growNaturalStrategicBasin(
    grid,
    tierTwoCount,
    [...new Set(tierTwoSeeds)],
    tierTwoBlocked,
    terrainCost,
    52,
  );
  const tierId = new Uint8Array(grid.cellCount);
  tierId.fill(1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierThreeMask[cell] === 1) tierId[cell] = 3;
    else if (tierTwoMask[cell] === 1) tierId[cell] = 2;
  }

  let tierTwoBoundary: number[] = [];
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 2 || elevation[cell]! <= SEA_LEVEL) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && tierId[neighbor] === 3) {
        tierTwoBoundary.push(cell);
        break;
      }
    }
  }
  if (tierTwoBoundary.length < 3) {
    tierTwoBoundary = Array.from({ length: grid.cellCount }, (_, cell) => cell)
      .filter(cell => tierId[cell] === 2 && elevation[cell]! > SEA_LEVEL);
  }
  if (tierTwoBoundary.length < 3) {
    tierTwoBoundary = Array.from({ length: grid.cellCount }, (_, cell) => cell)
      .filter(cell => tierId[cell] === 2);
  }
  if (tierTwoBoundary.length < 3) {
    rejectGreaterRealmTierTwoCapacity('BOUNDARY_MISSING');
  }
  const parentAnchors: number[] = [];
  const firstParentAnchor = [...tierTwoBoundary].sort((first, second) => {
    const score = (cell: number) => axialDistance(
      grid.q[cell]!,
      grid.r[cell]!,
      legacyCenterQ,
      legacyCenterR,
    ) * 120 + terrainCost[cell]!;
    return score(first) - score(second) || first - second;
  })[0]!;
  parentAnchors.push(firstParentAnchor);
  while (parentAnchors.length < 3) {
    let selected = -1;
    let selectedScore = Number.NEGATIVE_INFINITY;
    for (const cell of tierTwoBoundary) {
      if (parentAnchors.includes(cell)) continue;
      const separation = Math.min(...parentAnchors.map(anchor => axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[anchor]!,
        grid.r[anchor]!,
      )));
      const score = separation * 1_000 - terrainCost[cell]!;
      if (score > selectedScore || (score === selectedScore && cell < selected)) {
        selected = cell;
        selectedScore = score;
      }
    }
    if (selected < 0) fail('GREATER_REALM_PARENT_BASIN_ANCHOR_MISSING');
    parentAnchors.push(selected);
  }
  const parentNoise = Array.from(
    { length: 3 },
    (_, parent) => createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
      {
        channel: `strategic-parent-basin-${parent}`,
        amplitude: 1_200,
        smoothingPasses: 9,
        selfWeight: 3,
      },
    ]),
  );
  const regionId = new Uint8Array(grid.cellCount);
  const parentId = new Uint8Array(grid.cellCount);
  parentId.fill(0xff);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] === 3) regionId[cell] = TIER_III_REGION_INDEX;
  }
  const strategicCells = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => tierId[cell] !== 3);
  const parentCosts = new Int32Array(strategicCells.length * parentAnchors.length);
  for (let ordinal = 0; ordinal < strategicCells.length; ordinal += 1) {
    const cell = strategicCells[ordinal]!;
    for (let parent = 0; parent < parentAnchors.length; parent += 1) {
      const anchor = parentAnchors[parent]!;
      const domainAffinity = domainId[cell] === domainId[anchor] ? -300 : 300;
      parentCosts[ordinal * parentAnchors.length + parent] =
        axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[anchor]!,
          grid.r[anchor]!,
        ) * 92
        + parentNoise[parent]![cell]!
        + domainAffinity
        + Math.floor(Math.abs(elevation[cell]! - elevation[anchor]!) / 300);
    }
  }
  const tierOneCells = strategicCells.filter(cell => tierId[cell] === 1);
  const tierTwoCells = strategicCells.filter(cell => tierId[cell] === 2);
  // Every middle realm must span the full strategic ring: one dry anchor at
  // the Throneheart frontier and one at the outer-realm frontier, joined by a
  // compact dry spine. Without this constraint, a balanced Voronoi envelope
  // can consume its entire quota beside Tier III and leave one parent with no
  // possible outer gate at all. Try all parent orders so the three spines are
  // vertex-disjoint; if geography makes that impossible, still pin distinct
  // outer anchors and let the coherent partition grow toward them.
  const tierTwoOuterDryBoundary = tierTwoCells.filter(cell => {
    if (elevation[cell]! <= SEA_LEVEL) return false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && tierId[neighbor] === 1
        && elevation[neighbor]! > SEA_LEVEL
      ) return true;
    }
    return false;
  });
  const outerDryMask = new Uint8Array(grid.cellCount);
  for (const cell of tierTwoOuterDryBoundary) outerDryMask[cell] = 1;
  const parentSpineOrders = [
    [0, 1, 2],
    [0, 2, 1],
    [1, 0, 2],
    [1, 2, 0],
    [2, 0, 1],
    [2, 1, 0],
  ] as const;
  let parentTierTwoSpines: number[][] | undefined;
  if (tierTwoOuterDryBoundary.length >= 3) {
    for (const order of parentSpineOrders) {
      const claimed = new Uint8Array(grid.cellCount);
      const paths = Array.from({ length: 3 }, () => [] as number[]);
      let complete = true;
      for (const parent of order) {
        const start = parentAnchors[parent]!;
        const previous = new Int32Array(grid.cellCount);
        previous.fill(-2);
        const queue = new Uint32Array(grid.cellCount);
        let head = 0;
        let tail = 0;
        let target = -1;
        previous[start] = -1;
        queue[tail++] = start;
        while (head < tail && target < 0) {
          const cell = queue[head++]!;
          if (cell !== start && outerDryMask[cell] === 1 && claimed[cell] === 0) {
            target = cell;
            break;
          }
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || previous[neighbor] !== -2
              || claimed[neighbor] === 1
              || tierId[neighbor] !== 2
              || elevation[neighbor]! <= SEA_LEVEL
              || parentAnchors.some((anchor, owner) => owner !== parent && anchor === neighbor)
            ) continue;
            previous[neighbor] = cell;
            queue[tail++] = neighbor;
          }
        }
        if (target < 0) {
          complete = false;
          break;
        }
        for (let cell = target; cell >= 0; cell = previous[cell]!) {
          paths[parent]!.push(cell);
        }
        paths[parent]!.reverse();
        for (const cell of paths[parent]!) claimed[cell] = 1;
      }
      if (complete) {
        parentTierTwoSpines = paths;
        break;
      }
    }
  }
  if (!parentTierTwoSpines) {
    const usedOuter = new Set<number>();
    parentTierTwoSpines = parentAnchors.map((anchor) => {
      const outer = [...tierTwoOuterDryBoundary]
        .filter(cell => !usedOuter.has(cell))
        .sort((first, second) => (
          axialDistance(
            grid.q[first]!,
            grid.r[first]!,
            grid.q[anchor]!,
            grid.r[anchor]!,
          ) - axialDistance(
            grid.q[second]!,
            grid.r[second]!,
            grid.q[anchor]!,
            grid.r[anchor]!,
          ) || terrainCost[first]! - terrainCost[second]! || first - second
        ))[0];
      if (outer === undefined) return [anchor];
      usedOuter.add(outer);
      return outer === anchor ? [anchor] : [anchor, outer];
    });
  }
  const costsFor = (cells: readonly number[]) => {
    const byCell = new Map(strategicCells.map((cell, ordinal) => [cell, ordinal] as const));
    const costs = new Int32Array(cells.length * parentAnchors.length);
    for (let ordinal = 0; ordinal < cells.length; ordinal += 1) {
      const source = byCell.get(cells[ordinal]!)!;
      for (let parent = 0; parent < parentAnchors.length; parent += 1) {
        costs[ordinal * parentAnchors.length + parent] =
          parentCosts[source * parentAnchors.length + parent]!;
      }
    }
    return costs;
  };
  const forcedTierOneParent = new Int8Array(grid.cellCount);
  forcedTierOneParent.fill(-1);
  for (const cell of tierOneCells) {
    if (legacyReserveCell[cell] === 1) forcedTierOneParent[cell] = 0;
  }
  const forcedTierTwoParent = new Int8Array(grid.cellCount);
  forcedTierTwoParent.fill(-1);
  const anchorOnlyTierTwoParent = new Int8Array(grid.cellCount);
  anchorOnlyTierTwoParent.fill(-1);
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    anchorOnlyTierTwoParent[parentAnchors[parent]!] = parent;
    for (const cell of parentTierTwoSpines[parent]!) {
      forcedTierTwoParent[cell] = parent;
    }
  }
  const baselineTierTwoParents = assignCoherentStrategicGroups(
    grid,
    tierTwoCells,
    parentAnchors.length,
    costsFor(tierTwoCells),
    anchorOnlyTierTwoParent,
  );
  const baselineOuterDryContact = new Uint8Array(parentAnchors.length);
  for (const cell of tierTwoOuterDryBoundary) {
    baselineOuterDryContact[baselineTierTwoParents[cell]!] = 1;
  }
  const tierTwoParents = baselineOuterDryContact.every(contact => contact === 1)
    ? baselineTierTwoParents
    : assignCoherentStrategicGroups(
        grid,
        tierTwoCells,
        parentAnchors.length,
        costsFor(tierTwoCells),
        forcedTierTwoParent,
      );
  for (const cell of tierTwoCells) parentId[cell] = tierTwoParents[cell]!;
  const tierOneAnchors: number[] = [];
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    const candidates = tierOneCells.filter(cell => {
      if (elevation[cell]! <= SEA_LEVEL) return false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
          && elevation[neighbor]! > SEA_LEVEL
        ) return true;
      }
      return false;
    });
    const fallback = candidates.length > 0
      ? candidates
      : tierOneCells.filter(cell => {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && tierId[neighbor] === 2 && parentId[neighbor] === parent) return true;
          }
          return false;
        });
    const anchor = [...(fallback.length > 0 ? fallback : tierOneCells)].sort((first, second) => (
      axialDistance(
        grid.q[first]!,
        grid.r[first]!,
        grid.q[parentAnchors[parent]!]!,
        grid.r[parentAnchors[parent]!]!,
      ) - axialDistance(
        grid.q[second]!,
        grid.r[second]!,
        grid.q[parentAnchors[parent]!]!,
        grid.r[parentAnchors[parent]!]!,
      ) || terrainCost[first]! - terrainCost[second]! || first - second
    ))[0]!;
    tierOneAnchors.push(anchor);
    forcedTierOneParent[anchor] = parent;
  }
  // Preserve one dry Lowlands-to-Crown spine before the capacity-balanced
  // partition. The later child split widens its end into a natural gate basin.
  const lowlandsPrevious = new Int32Array(grid.cellCount);
  lowlandsPrevious.fill(-2);
  const lowlandsQueue = new Uint32Array(grid.cellCount);
  let lowlandsHead = 0;
  let lowlandsTail = 0;
  for (const cell of tierOneCells) {
    if (legacyReserveCell[cell] !== 1 || elevation[cell]! <= SEA_LEVEL) continue;
    lowlandsPrevious[cell] = -1;
    lowlandsQueue[lowlandsTail++] = cell;
  }
  while (lowlandsHead < lowlandsTail && lowlandsPrevious[tierOneAnchors[0]!] === -2) {
    const cell = lowlandsQueue[lowlandsHead++]!;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || tierId[neighbor] !== 1
        || elevation[neighbor]! <= SEA_LEVEL
        || lowlandsPrevious[neighbor] !== -2
      ) continue;
      lowlandsPrevious[neighbor] = cell;
      lowlandsQueue[lowlandsTail++] = neighbor;
    }
  }
  if (lowlandsPrevious[tierOneAnchors[0]!] !== -2) {
    for (
      let cell = tierOneAnchors[0]!;
      cell >= 0;
      cell = lowlandsPrevious[cell]!
    ) forcedTierOneParent[cell] = 0;
  }
  const tierOneParents = assignCoherentStrategicGroups(
    grid,
    tierOneCells,
    parentAnchors.length,
    costsFor(tierOneCells),
    forcedTierOneParent,
  );
  for (const cell of tierOneCells) parentId[cell] = tierOneParents[cell]!;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] === 2) regionId[cell] = TIER_I_REGION_COUNT + parentId[cell]!;
  }
  for (let parent = 0; parent < parentAnchors.length; parent += 1) {
    const cells = strategicCells.filter(cell => tierId[cell] === 1 && parentId[cell] === parent);
    const children = [parent * 2, parent * 2 + 1] as const;
    const rawParentTierTwoBoundary = cells.filter(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
        ) return true;
      }
      return false;
    });
    const dryParentTierTwoBoundary = rawParentTierTwoBoundary.filter(cell => {
      if (elevation[cell]! <= SEA_LEVEL) return false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === 2
          && parentId[neighbor] === parent
          && elevation[neighbor]! > SEA_LEVEL
        ) return true;
      }
      return false;
    });
    const parentTierTwoBoundary = dryParentTierTwoBoundary.length >= 2
      ? dryParentTierTwoBoundary
      : rawParentTierTwoBoundary.length >= 2
        ? rawParentTierTwoBoundary
        : cells;
    const firstChildAnchor = parent === 0
      ? [...parentTierTwoBoundary].sort((first, second) => {
          const score = (cell: number) => axialDistance(
            grid.q[cell]!,
            grid.r[cell]!,
            legacyCenterQ,
            legacyCenterR,
          ) * 100 + terrainCost[cell]!;
          return score(first) - score(second) || first - second;
        })[0]!
      : [...parentTierTwoBoundary].sort((first, second) => (
          terrainCost[first]! - terrainCost[second]! || first - second
        ))[0]!;
    const secondChildAnchor = [...parentTierTwoBoundary].sort((first, second) => {
      const score = (cell: number) => axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[firstChildAnchor]!,
        grid.r[firstChildAnchor]!,
      ) * 1_000 - terrainCost[cell]!;
      return score(second) - score(first) || first - second;
    })[0]!;
    const lowlandsApproach = new Set<number>();
    if (parent === 0) {
      const allowed = new Uint8Array(grid.cellCount);
      const target = new Uint8Array(grid.cellCount);
      const previous = new Int32Array(grid.cellCount);
      previous.fill(-2);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      for (const cell of cells) {
        if (elevation[cell]! <= SEA_LEVEL) continue;
        allowed[cell] = 1;
        if (legacyReserveCell[cell] === 1) {
          previous[cell] = -1;
          queue[tail++] = cell;
        }
      }
      target[firstChildAnchor] = 1;
      let reached = -1;
      while (head < tail && reached < 0) {
        const cell = queue[head++]!;
        if (target[cell] === 1) {
          reached = cell;
          break;
        }
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || allowed[neighbor] !== 1 || previous[neighbor] !== -2) continue;
          previous[neighbor] = cell;
          queue[tail++] = neighbor;
        }
      }
      if (reached >= 0) {
        for (let cell = reached; cell >= 0; cell = previous[cell]!) lowlandsApproach.add(cell);
      } else {
        for (const cell of cells) {
          if (legacyReserveCell[cell] === 1) lowlandsApproach.add(cell);
        }
      }
    }
    const blocked = new Uint8Array(grid.cellCount);
    blocked.fill(1);
    for (const cell of cells) {
      blocked[cell] = 0;
    }
    const firstChildCore = growNaturalStrategicBasin(
      grid,
      Math.min(960, Math.max(1, Math.floor(cells.length / 16))),
      [firstChildAnchor],
      blocked,
      terrainCost,
      48,
    );
    for (const cell of cells) {
      if (firstChildCore[cell] === 1) blocked[cell] = 1;
    }
    const childSeeds = [secondChildAnchor];
    const reachable = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    const floodComponent = (start: number) => {
      let head = 0;
      let tail = 0;
      const component: number[] = [];
      reachable[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const cell = queue[head++]!;
        component.push(cell);
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || blocked[neighbor] === 1 || reachable[neighbor] === 1) continue;
          reachable[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      return component;
    };
    floodComponent(secondChildAnchor);
    for (const cell of cells) {
      if (blocked[cell] === 1 || reachable[cell] === 1) continue;
      const component = floodComponent(cell);
      component.sort((first, second) => terrainCost[first]! - terrainCost[second]! || first - second);
      childSeeds.push(component[0]!);
    }
    const countedLand = new Uint8Array(grid.cellCount);
    let parentLandCount = 0;
    for (const cell of cells) {
      if (elevation[cell]! <= SEA_LEVEL) continue;
      countedLand[cell] = 1;
      parentLandCount += 1;
    }
    const desiredSecondCount = Math.floor(cells.length / 2);
    const secondChildBasin = growNaturalStrategicBasin(
      grid,
      Math.floor(parentLandCount / 2),
      childSeeds,
      blocked,
      terrainCost,
      72,
      countedLand,
    );
    let secondCount = cells.reduce((total, cell) => total + secondChildBasin[cell]!, 0);
    if (secondCount > desiredSecondCount) {
      const removableWater = cells.filter(cell => (
        secondChildBasin[cell] === 1
        && elevation[cell]! <= SEA_LEVEL
        && cell !== secondChildAnchor
      ));
      removableWater.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 80 + terrainCost[cell]!;
        return score(second) - score(first) || second - first;
      });
      for (const cell of removableWater) {
        if (secondCount <= desiredSecondCount) break;
        secondChildBasin[cell] = 0;
        secondCount -= 1;
      }
    } else if (secondCount < desiredSecondCount) {
      const additionalWater = cells.filter(cell => (
        secondChildBasin[cell] !== 1
        && blocked[cell] !== 1
        && elevation[cell]! <= SEA_LEVEL
      ));
      additionalWater.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 80 + terrainCost[cell]!;
        return score(first) - score(second) || first - second;
      });
      for (const cell of additionalWater) {
        if (secondCount >= desiredSecondCount) break;
        secondChildBasin[cell] = 1;
        secondCount += 1;
      }
    }
    let retainedSecondCount = cells.reduce((total, cell) => total + (
      secondChildBasin[cell] === 1
      && firstChildCore[cell] !== 1
      && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
        ? 1
        : 0
    ), 0);
    if (retainedSecondCount < desiredSecondCount) {
      const expansionCandidates = cells.filter(cell => (
        secondChildBasin[cell] !== 1
        && firstChildCore[cell] !== 1
        && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
      ));
      expansionCandidates.sort((first, second) => {
        const score = (cell: number) => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[secondChildAnchor]!,
          grid.r[secondChildAnchor]!,
        ) * 96 + terrainCost[cell]!;
        return score(first) - score(second) || first - second;
      });
      for (const cell of expansionCandidates) {
        if (retainedSecondCount >= desiredSecondCount) break;
        secondChildBasin[cell] = 1;
        retainedSecondCount += 1;
      }
    }
    for (const cell of cells) {
      regionId[cell] = (
        secondChildBasin[cell] === 1
        && firstChildCore[cell] !== 1
        && !(parent === 0 && (legacyReserveCell[cell] === 1 || lowlandsApproach.has(cell)))
      ) ? children[1] : children[0];
    }
  }
  const tierCounts: [number, number, number] = [0, 0, 0];
  const regionCounts = Array<number>(REGION_COUNT).fill(0);
  for (let index = 0; index < grid.cellCount; index += 1) {
    tierCounts[tierId[index]! - 1] += 1;
    regionCounts[regionId[index]!] += 1;
  }
  return Object.freeze({ tierId, regionId, tierCounts, regionCounts: Object.freeze(regionCounts) });
}

type GreaterRealmTierTwoCapacityComponent = Readonly<{
  id: number;
  cells: readonly number[];
  innerBoundary: readonly number[];
  outerBoundary: readonly number[];
  originalParentCounts: readonly number[];
}>;

type GreaterRealmTierTwoGateApronCorridor = readonly number[];

type GreaterRealmTierTwoGateApronEdge = Readonly<{
  child: number;
  componentId: number;
  tierOneEndpoint: number;
  tierTwoEndpoint: number;
  tierOneCorridors: readonly [
    GreaterRealmTierTwoGateApronCorridor,
    GreaterRealmTierTwoGateApronCorridor,
  ];
  tierTwoCorridors: readonly [
    GreaterRealmTierTwoGateApronCorridor,
    GreaterRealmTierTwoGateApronCorridor,
  ];
  score: number;
}>;

type GreaterRealmTierTwoGateApronBundle = Readonly<{
  child: number;
  componentId: number;
  edges: readonly [GreaterRealmTierTwoGateApronEdge, GreaterRealmTierTwoGateApronEdge];
  tierOneCells: readonly number[];
  tierTwoCells: readonly number[];
  score: number;
}>;

type GreaterRealmTierTwoGateApronSiblingPair = Readonly<{
  children: readonly [number, number];
  bundles: readonly [
    GreaterRealmTierTwoGateApronBundle,
    GreaterRealmTierTwoGateApronBundle,
  ];
  score: number;
}>;

type GreaterRealmTierTwoDryGateApronAuthority = Readonly<{
  parentByChild: () => readonly number[];
  siblingPairsFor: (
    componentId: number,
    parent: number,
  ) => readonly GreaterRealmTierTwoGateApronSiblingPair[];
  lowlandsRepairSiblingPairsFor: (
    componentId: number,
    parent: number,
  ) => readonly GreaterRealmTierTwoGateApronSiblingPair[];
  clear: () => void;
}>;

/**
 * Discover the allocator's bounded dry-apron evidence without committing any
 * political ownership. The authority deliberately retains the historical
 * ranking and slice order; callers must clear its private coordinate paths on
 * every success and failure path.
 */
function deriveTierTwoDryGateApronAuthority(input: Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  tierId: Uint8Array;
  originalRegionId: Uint8Array;
  waterRegime: Uint8Array;
  legacyProtectedCell: Uint8Array;
  legacyReserveCell: Uint8Array;
  components: readonly GreaterRealmTierTwoCapacityComponent[];
  reject: (reason: GreaterRealmTierTwoCapacityRejectionReason) => never;
}>): GreaterRealmTierTwoDryGateApronAuthority {
  type ScratchArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int32Array;
  const scratchArrays = new Set<ScratchArray>();
  const privateIndexArrays = new Set<number[]>();
  const own = <ArrayType extends ScratchArray>(array: ArrayType): ArrayType => {
    scratchArrays.add(array);
    return array;
  };
  const release = (array: ScratchArray): void => {
    array.fill(0);
    scratchArrays.delete(array);
  };
  const wipePaths = (paths: readonly (readonly number[])[] | undefined): void => {
    if (!paths) return;
    for (const path of paths) (path as number[]).fill(0);
  };
  const retainSelectedPaths = (
    paths: readonly (readonly number[])[],
    selectedPaths: ReadonlySet<readonly number[]>,
  ): void => {
    for (const path of paths) {
      if (selectedPaths.has(path)) privateIndexArrays.add(path as number[]);
      else (path as number[]).fill(0);
    }
  };
  const gateApronEdgesByKey = new Map<string, GreaterRealmTierTwoGateApronEdge[]>();
  const gateApronBundlesByKey = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronBundle[]
  >();
  const bundleOptionsCache = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronBundle[]
  >();
  const siblingPairCache = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronSiblingPair[]
  >();
  const lowlandsRepairGateApronEdgesByKey = new Map<
    string,
    GreaterRealmTierTwoGateApronEdge[]
  >();
  const lowlandsRepairGateApronBundlesByKey = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronBundle[]
  >();
  const lowlandsRepairBundleOptionsCache = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronBundle[]
  >();
  const lowlandsRepairSiblingPairCache = new Map<
    string,
    readonly GreaterRealmTierTwoGateApronSiblingPair[]
  >();
  let lowlandsRepairDerived = false;
  let cleared = false;
  const clear = (): void => {
    if (cleared) return;
    cleared = true;
    for (const array of scratchArrays) array.fill(0);
    scratchArrays.clear();
    for (const indexes of privateIndexArrays) indexes.fill(0);
    privateIndexArrays.clear();
    gateApronEdgesByKey.clear();
    gateApronBundlesByKey.clear();
    bundleOptionsCache.clear();
    siblingPairCache.clear();
    lowlandsRepairGateApronEdgesByKey.clear();
    lowlandsRepairGateApronBundlesByKey.clear();
    lowlandsRepairBundleOptionsCache.clear();
    lowlandsRepairSiblingPairCache.clear();
  };
  try {
    const {
      grid,
      candidateSeed,
      tierId,
      originalRegionId,
      waterRegime,
      legacyProtectedCell,
      legacyReserveCell,
      components,
      reject,
    } = input;
    const componentByCell = own(new Int32Array(grid.cellCount));
    componentByCell.fill(-1);
    for (const component of components) {
      for (const cell of component.cells) componentByCell[cell] = component.id;
    }
    const outerTierBoundary = own(new Uint8Array(grid.cellCount));
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell) continue;
        const firstTier = tierId[cell]!;
        const secondTier = tierId[neighbor]!;
        if (
          (firstTier === 1 && secondTier === 2)
          || (firstTier === 2 && secondTier === 1)
        ) {
          outerTierBoundary[cell] = 1;
          outerTierBoundary[neighbor] = 1;
        }
      }
    }
    const distanceToOuterTierBoundary = own(new Uint16Array(grid.cellCount));
    distanceToOuterTierBoundary.fill(0xffff);
    const outerTierQueue = own(new Uint32Array(grid.cellCount));
    let outerTierHead = 0;
    let outerTierTail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (outerTierBoundary[cell] !== 1) continue;
      distanceToOuterTierBoundary[cell] = 0;
      outerTierQueue[outerTierTail++] = cell;
    }
    while (outerTierHead < outerTierTail) {
      const cell = outerTierQueue[outerTierHead++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || tierId[neighbor] !== tierId[cell]
          || distanceToOuterTierBoundary[neighbor] !== 0xffff
        ) continue;
        distanceToOuterTierBoundary[neighbor] = distanceToOuterTierBoundary[cell]! + 1;
        outerTierQueue[outerTierTail++] = neighbor;
      }
    }
    const strictDryWaterRegime = own(new Uint8Array(grid.cellCount));
    const apronRegionId = own(new Uint8Array(grid.cellCount));
    const outerGateApronBarrier = own(new Uint8Array(grid.cellCount));
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      strictDryWaterRegime[cell] = waterRegime[cell] === WATER_DRY
        ? WATER_DRY
        : WATER_OCEAN;
      apronRegionId[cell] = tierId[cell] === 1
        ? originalRegionId[cell]!
        : tierId[cell] === 2 ? TIER_I_REGION_COUNT : TIER_III_REGION_INDEX;
      if (
        distanceToOuterTierBoundary[cell]! < 2
        && legacyProtectedCell[cell] === 0
        && legacyReserveCell[cell] === 0
      ) outerGateApronBarrier[cell] = 1;
    }
    const apronRobustTopology = robustRegionTopology(
      grid,
      apronRegionId,
      strictDryWaterRegime,
      outerGateApronBarrier,
    );
    own(apronRobustTopology.articulation);
    own(apronRobustTopology.componentId);
    const apronChannel = greaterRealmTerrainChannelId('tier-two-dry-gate-aprons');
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
        const tierOneEndpoint = tierId[cell] === 1 ? cell : neighbor;
        const tierTwoEndpoint = tierOneEndpoint === cell ? neighbor : cell;
        if (
          tierId[tierOneEndpoint] !== 1
          || tierId[tierTwoEndpoint] !== 2
          || waterRegime[tierOneEndpoint] !== WATER_DRY
          || waterRegime[tierTwoEndpoint] !== WATER_DRY
          || legacyProtectedCell[tierOneEndpoint] === 1
          || legacyProtectedCell[tierTwoEndpoint] === 1
          || legacyReserveCell[tierOneEndpoint] === 1
          || legacyReserveCell[tierTwoEndpoint] === 1
        ) continue;
        const child = originalRegionId[tierOneEndpoint]!;
        const componentId = componentByCell[tierTwoEndpoint]!;
        if (child >= TIER_I_REGION_COUNT || componentId < 0) continue;
        const tierOnePaths = barrierApproachPaths(
          grid,
          tierOneEndpoint,
          child,
          apronRegionId,
          strictDryWaterRegime,
          outerGateApronBarrier,
          apronRobustTopology.componentId,
          apronRobustTopology.componentSizes,
        );
        let tierTwoPaths: ReturnType<typeof barrierApproachPaths>;
        try {
          tierTwoPaths = barrierApproachPaths(
            grid,
            tierTwoEndpoint,
            TIER_I_REGION_COUNT,
            apronRegionId,
            strictDryWaterRegime,
            outerGateApronBarrier,
            apronRobustTopology.componentId,
            apronRobustTopology.componentSizes,
          );
        } catch (error) {
          wipePaths(tierOnePaths);
          throw error;
        }
        if (!tierOnePaths || !tierTwoPaths) {
          wipePaths(tierOnePaths);
          wipePaths(tierTwoPaths);
          continue;
        }
        let compatible: ReturnType<typeof compatibleGateApproaches>;
        try {
          compatible = compatibleGateApproaches(
            grid,
            tierId,
            strictDryWaterRegime,
            outerGateApronBarrier,
            apronRobustTopology.componentId,
            apronRobustTopology.componentSizes,
            tierOnePaths,
            tierTwoPaths,
          );
        } catch (error) {
          wipePaths(tierOnePaths);
          wipePaths(tierTwoPaths);
          throw error;
        }
        if (!compatible) {
          wipePaths(tierOnePaths);
          wipePaths(tierTwoPaths);
          continue;
        }
        const selectedPaths: ReadonlySet<readonly number[]> = new Set([
          compatible.first,
          compatible.firstAlternate,
          compatible.second,
          compatible.secondAlternate,
        ]);
        retainSelectedPaths(tierOnePaths, selectedPaths);
        retainSelectedPaths(tierTwoPaths, selectedPaths);
        const edge = Object.freeze({
          child,
          componentId,
          tierOneEndpoint,
          tierTwoEndpoint,
          tierOneCorridors: Object.freeze([
            compatible.first,
            compatible.firstAlternate,
          ] as const),
          tierTwoCorridors: Object.freeze([
            compatible.second,
            compatible.secondAlternate,
          ] as const),
          score: greaterRealmCounterRandomU32(
            candidateSeed,
            apronChannel,
            grid.q[tierTwoEndpoint]!,
            grid.r[tierTwoEndpoint]!,
          ),
        });
        const key = `${componentId}:${child}`;
        const edges = gateApronEdgesByKey.get(key) ?? [];
        edges.push(edge);
        gateApronEdgesByKey.set(key, edges);
      }
    }
    // These full-grid arrays are construction-only. Retire them before the
    // bounded bundle/pair search so they do not inflate the allocator's peak
    // retained set while private coordinate alternatives are ranked.
    release(componentByCell);
    release(outerTierBoundary);
    release(distanceToOuterTierBoundary);
    release(outerTierQueue);
    release(strictDryWaterRegime);
    release(apronRegionId);
    release(outerGateApronBarrier);
    release(apronRobustTopology.articulation);
    release(apronRobustTopology.componentId);
    for (const [key, rawEdges] of gateApronEdgesByKey) {
      const edges = [...rawEdges]
        .sort((first, second) => first.score - second.score
          || first.tierTwoEndpoint - second.tierTwoEndpoint)
        .slice(0, 64);
      const bundles: GreaterRealmTierTwoGateApronBundle[] = [];
      for (let first = 0; first < edges.length; first += 1) {
        for (let second = first + 1; second < edges.length; second += 1) {
          const left = edges[first]!;
          const right = edges[second]!;
          if (
            left.tierOneEndpoint === right.tierOneEndpoint
            || left.tierTwoEndpoint === right.tierTwoEndpoint
          ) continue;
          const separation = axialDistance(
            grid.q[left.tierTwoEndpoint]!,
            grid.r[left.tierTwoEndpoint]!,
            grid.q[right.tierTwoEndpoint]!,
            grid.r[right.tierTwoEndpoint]!,
          );
          if (separation < 4 || separation > 48) continue;
          const tierOneCells = [
            left.tierOneEndpoint,
            ...left.tierOneCorridors.flat(),
            right.tierOneEndpoint,
            ...right.tierOneCorridors.flat(),
          ];
          const tierTwoCells = [
            left.tierTwoEndpoint,
            ...left.tierTwoCorridors.flat(),
            right.tierTwoEndpoint,
            ...right.tierTwoCorridors.flat(),
          ];
          const corridorsConflict = (
            left.tierOneCorridors.flat().includes(right.tierOneEndpoint)
            || right.tierOneCorridors.flat().includes(left.tierOneEndpoint)
            || left.tierTwoCorridors.flat().includes(right.tierTwoEndpoint)
            || right.tierTwoCorridors.flat().includes(left.tierTwoEndpoint)
          );
          if (corridorsConflict) {
            tierOneCells.fill(0);
            tierTwoCells.fill(0);
            continue;
          }
          const uniqueTierOneCells = [...new Set(tierOneCells)];
          const uniqueTierTwoCells = [...new Set(tierTwoCells)];
          tierOneCells.fill(0);
          tierTwoCells.fill(0);
          privateIndexArrays.add(uniqueTierOneCells);
          privateIndexArrays.add(uniqueTierTwoCells);
          bundles.push(Object.freeze({
            child: left.child,
            componentId: left.componentId,
            edges: Object.freeze([left, right] as const),
            tierOneCells: uniqueTierOneCells,
            tierTwoCells: uniqueTierTwoCells,
            score: left.score + right.score,
          }));
          if (bundles.length >= 32) break;
        }
        if (bundles.length >= 32) break;
      }
      gateApronBundlesByKey.set(key, Object.freeze(bundles));
    }

    const parentByChild = own(new Int8Array(TIER_I_REGION_COUNT));
    parentByChild.fill(-1);
    for (const [child, parentRegion] of GREATER_REALM_PROVISIONAL_GATE_GRAPH) {
      if (
        child < TIER_I_REGION_COUNT
        && parentRegion >= TIER_I_REGION_COUNT
        && parentRegion < TIER_III_REGION_INDEX
      ) parentByChild[child] = parentRegion - TIER_I_REGION_COUNT;
    }
    if ([...parentByChild].some(parent => parent < 0)) reject('GATE_PARENT_SLOT_MISSING');
    const childrenByParent = Array.from(
      { length: TIER_II_REGION_COUNT },
      () => [] as number[],
    );
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      childrenByParent[parentByChild[child]!]!.push(child);
    }
    if (childrenByParent.some(children => children.length !== 2)) {
      reject('GATE_PARENT_SLOT_MISSING');
    }

    const deriveLowlandsRepairBundles = (): void => {
      if (cleared) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_CLEARED');
      if (lowlandsRepairDerived) return;
      lowlandsRepairDerived = true;
      const repairScratchArrays: ScratchArray[] = [];
      const repairOwn = <ArrayType extends ScratchArray>(array: ArrayType): ArrayType => {
        repairScratchArrays.push(own(array));
        return array;
      };
      try {
        const componentByCell = repairOwn(new Int32Array(grid.cellCount));
        componentByCell.fill(-1);
        for (const component of components) {
          for (const cell of component.cells) componentByCell[cell] = component.id;
        }
        const outerTierBoundary = repairOwn(new Uint8Array(grid.cellCount));
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor <= cell) continue;
            const firstTier = tierId[cell]!;
            const secondTier = tierId[neighbor]!;
            if (
              (firstTier === 1 && secondTier === 2)
              || (firstTier === 2 && secondTier === 1)
            ) {
              outerTierBoundary[cell] = 1;
              outerTierBoundary[neighbor] = 1;
            }
          }
        }
        const distanceToOuterTierBoundary = repairOwn(new Uint16Array(grid.cellCount));
        distanceToOuterTierBoundary.fill(0xffff);
        const outerTierQueue = repairOwn(new Uint32Array(grid.cellCount));
        let outerTierHead = 0;
        let outerTierTail = 0;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (outerTierBoundary[cell] !== 1) continue;
          distanceToOuterTierBoundary[cell] = 0;
          outerTierQueue[outerTierTail++] = cell;
        }
        while (outerTierHead < outerTierTail) {
          const cell = outerTierQueue[outerTierHead++]!;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || tierId[neighbor] !== tierId[cell]
              || distanceToOuterTierBoundary[neighbor] !== 0xffff
            ) continue;
            distanceToOuterTierBoundary[neighbor] = distanceToOuterTierBoundary[cell]! + 1;
            outerTierQueue[outerTierTail++] = neighbor;
          }
        }
        const strictDryWaterRegime = repairOwn(new Uint8Array(grid.cellCount));
        const apronRegionId = repairOwn(new Uint8Array(grid.cellCount));
        const outerGateApronBarrier = repairOwn(new Uint8Array(grid.cellCount));
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          strictDryWaterRegime[cell] = waterRegime[cell] === WATER_DRY
            ? WATER_DRY
            : WATER_OCEAN;
          apronRegionId[cell] = tierId[cell] === 1
            ? originalRegionId[cell]!
            : tierId[cell] === 2 ? TIER_I_REGION_COUNT : TIER_III_REGION_INDEX;
          if (
            distanceToOuterTierBoundary[cell]! < 2
            && legacyProtectedCell[cell] === 0
            && legacyReserveCell[cell] === 0
          ) outerGateApronBarrier[cell] = 1;
        }
        const apronRobustTopology = robustRegionTopology(
          grid,
          apronRegionId,
          strictDryWaterRegime,
          outerGateApronBarrier,
        );
        repairOwn(apronRobustTopology.articulation);
        repairOwn(apronRobustTopology.componentId);
        const apronChannel = greaterRealmTerrainChannelId('tier-two-dry-gate-aprons');
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
            const tierOneEndpoint = tierId[cell] === 1 ? cell : neighbor;
            const tierTwoEndpoint = tierOneEndpoint === cell ? neighbor : cell;
            const child = originalRegionId[tierOneEndpoint]!;
            const componentId = componentByCell[tierTwoEndpoint]!;
            if (!greaterRealmLowlandsRepairGateEdgeEligible({
              child,
              tierOneEndpointDry: waterRegime[tierOneEndpoint] === WATER_DRY,
              tierTwoEndpointDry: waterRegime[tierTwoEndpoint] === WATER_DRY,
              tierOneEndpointProtected: legacyProtectedCell[tierOneEndpoint] === 1,
              tierTwoEndpointProtected: legacyProtectedCell[tierTwoEndpoint] === 1,
              tierOneEndpointReserve: legacyReserveCell[tierOneEndpoint] === 1,
              tierTwoEndpointReserve: legacyReserveCell[tierTwoEndpoint] === 1,
              tierOneOriginalRegion: originalRegionId[tierOneEndpoint]!,
              tierOneTrialRegion: originalRegionId[tierOneEndpoint]!,
              tierOneCorridorProtected: false,
              tierOneCorridorForeignOwned: false,
              tierTwoCorridorProtected: false,
              tierTwoCorridorReserve: false,
            }) || componentId < 0) continue;
            const tierOnePaths = barrierApproachPaths(
              grid,
              tierOneEndpoint,
              child,
              apronRegionId,
              strictDryWaterRegime,
              outerGateApronBarrier,
              apronRobustTopology.componentId,
              apronRobustTopology.componentSizes,
            );
            let tierTwoPaths: ReturnType<typeof barrierApproachPaths>;
            try {
              tierTwoPaths = barrierApproachPaths(
                grid,
                tierTwoEndpoint,
                TIER_I_REGION_COUNT,
                apronRegionId,
                strictDryWaterRegime,
                outerGateApronBarrier,
                apronRobustTopology.componentId,
                apronRobustTopology.componentSizes,
              );
            } catch (error) {
              wipePaths(tierOnePaths);
              throw error;
            }
            if (!tierOnePaths || !tierTwoPaths) {
              wipePaths(tierOnePaths);
              wipePaths(tierTwoPaths);
              continue;
            }
            let compatible: ReturnType<typeof compatibleGateApproaches>;
            try {
              compatible = compatibleGateApproaches(
                grid,
                tierId,
                strictDryWaterRegime,
                outerGateApronBarrier,
                apronRobustTopology.componentId,
                apronRobustTopology.componentSizes,
                tierOnePaths,
                tierTwoPaths,
              );
            } catch (error) {
              wipePaths(tierOnePaths);
              wipePaths(tierTwoPaths);
              throw error;
            }
            if (!compatible) {
              wipePaths(tierOnePaths);
              wipePaths(tierTwoPaths);
              continue;
            }
            const tierOneCorridors = [compatible.first, compatible.firstAlternate] as const;
            const tierTwoCorridors = [compatible.second, compatible.secondAlternate] as const;
            if (!greaterRealmLowlandsRepairGateEdgeEligible({
              child,
              tierOneEndpointDry: true,
              tierTwoEndpointDry: true,
              tierOneEndpointProtected: false,
              tierTwoEndpointProtected: false,
              tierOneEndpointReserve: true,
              tierTwoEndpointReserve: false,
              tierOneOriginalRegion: originalRegionId[tierOneEndpoint]!,
              tierOneTrialRegion: originalRegionId[tierOneEndpoint]!,
              tierOneCorridorProtected: tierOneCorridors.some(path => (
                path.some(pathCell => legacyProtectedCell[pathCell] === 1)
              )),
              tierOneCorridorForeignOwned: tierOneCorridors.some(path => (
                path.some(pathCell => originalRegionId[pathCell] !== 0)
              )),
              tierTwoCorridorProtected: tierTwoCorridors.some(path => (
                path.some(pathCell => legacyProtectedCell[pathCell] === 1)
              )),
              tierTwoCorridorReserve: tierTwoCorridors.some(path => (
                path.some(pathCell => legacyReserveCell[pathCell] === 1)
              )),
            })) {
              wipePaths(tierOnePaths);
              wipePaths(tierTwoPaths);
              continue;
            }
            const selectedPaths: ReadonlySet<readonly number[]> = new Set([
              compatible.first,
              compatible.firstAlternate,
              compatible.second,
              compatible.secondAlternate,
            ]);
            retainSelectedPaths(tierOnePaths, selectedPaths);
            retainSelectedPaths(tierTwoPaths, selectedPaths);
            const edge = Object.freeze({
              child,
              componentId,
              tierOneEndpoint,
              tierTwoEndpoint,
              tierOneCorridors: Object.freeze(tierOneCorridors),
              tierTwoCorridors: Object.freeze(tierTwoCorridors),
              score: greaterRealmCounterRandomU32(
                candidateSeed,
                apronChannel,
                grid.q[tierTwoEndpoint]!,
                grid.r[tierTwoEndpoint]!,
              ),
            });
            const key = `${componentId}:${child}`;
            const edges = lowlandsRepairGateApronEdgesByKey.get(key) ?? [];
            edges.push(edge);
            lowlandsRepairGateApronEdgesByKey.set(key, edges);
          }
        }
        for (const [key, rawEdges] of lowlandsRepairGateApronEdgesByKey) {
          const edges = [...rawEdges]
            .sort((first, second) => first.score - second.score
              || first.tierTwoEndpoint - second.tierTwoEndpoint)
            .slice(0, 64);
          const bundles: GreaterRealmTierTwoGateApronBundle[] = [];
          for (let first = 0; first < edges.length; first += 1) {
            for (let second = first + 1; second < edges.length; second += 1) {
              const left = edges[first]!;
              const right = edges[second]!;
              if (
                left.tierOneEndpoint === right.tierOneEndpoint
                || left.tierTwoEndpoint === right.tierTwoEndpoint
              ) continue;
              const separation = axialDistance(
                grid.q[left.tierTwoEndpoint]!,
                grid.r[left.tierTwoEndpoint]!,
                grid.q[right.tierTwoEndpoint]!,
                grid.r[right.tierTwoEndpoint]!,
              );
              if (separation < 4 || separation > 48) continue;
              const tierOneCells = [
                left.tierOneEndpoint,
                ...left.tierOneCorridors.flat(),
                right.tierOneEndpoint,
                ...right.tierOneCorridors.flat(),
              ];
              const tierTwoCells = [
                left.tierTwoEndpoint,
                ...left.tierTwoCorridors.flat(),
                right.tierTwoEndpoint,
                ...right.tierTwoCorridors.flat(),
              ];
              const corridorsConflict = (
                left.tierOneCorridors.flat().includes(right.tierOneEndpoint)
                || right.tierOneCorridors.flat().includes(left.tierOneEndpoint)
                || left.tierTwoCorridors.flat().includes(right.tierTwoEndpoint)
                || right.tierTwoCorridors.flat().includes(left.tierTwoEndpoint)
              );
              if (corridorsConflict) {
                tierOneCells.fill(0);
                tierTwoCells.fill(0);
                continue;
              }
              const uniqueTierOneCells = [...new Set(tierOneCells)];
              const uniqueTierTwoCells = [...new Set(tierTwoCells)];
              tierOneCells.fill(0);
              tierTwoCells.fill(0);
              privateIndexArrays.add(uniqueTierOneCells);
              privateIndexArrays.add(uniqueTierTwoCells);
              bundles.push(Object.freeze({
                child: left.child,
                componentId: left.componentId,
                edges: Object.freeze([left, right] as const),
                tierOneCells: uniqueTierOneCells,
                tierTwoCells: uniqueTierTwoCells,
                score: left.score + right.score,
              }));
              if (bundles.length >= 32) break;
            }
            if (bundles.length >= 32) break;
          }
          lowlandsRepairGateApronBundlesByKey.set(key, Object.freeze(bundles));
        }
      } catch (error) {
        clear();
        throw error;
      } finally {
        for (const array of repairScratchArrays) release(array);
      }
    };

    const bundleOptionsFor = (
      componentId: number,
      child: number,
    ): readonly GreaterRealmTierTwoGateApronBundle[] => {
      const key = `${componentId}:${child}`;
      const cached = bundleOptionsCache.get(key);
      if (cached) return cached;
      const options = [...gateApronBundlesByKey]
        .filter(([bundleKey]) => Number.parseInt(bundleKey.split(':')[0]!, 10) === componentId)
        .flatMap(([, bundles]) => bundles)
        // Lowlands is immutable authority, both as a gate slot and as a donor.
        // Every other slot may borrow physical dry terrain only through the
        // explicit, count-balanced repartition staged below.
        .filter(bundle => child === 0 ? bundle.child === 0 : bundle.child !== 0)
        .sort((first, second) => (
          Number(first.child !== child) - Number(second.child !== child)
          || first.score - second.score
          || first.child - second.child
          || first.edges[0].tierTwoEndpoint - second.edges[0].tierTwoEndpoint
        ))
        .slice(0, 64);
      const frozen = Object.freeze(options);
      bundleOptionsCache.set(key, frozen);
      return frozen;
    };
    const bundlesOverlap = (
      first: readonly number[],
      second: readonly number[],
    ): boolean => first.some(cell => second.includes(cell));
    const siblingPairsFor = (
      componentId: number,
      parent: number,
    ): readonly GreaterRealmTierTwoGateApronSiblingPair[] => {
      if (cleared) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_CLEARED');
      if (
        !Number.isSafeInteger(componentId)
        || componentId < 0
        || componentId >= components.length
        || !Number.isSafeInteger(parent)
        || parent < 0
        || parent >= TIER_II_REGION_COUNT
      ) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_QUERY_INVALID');
      const cacheKey = `${componentId}:${parent}`;
      const cached = siblingPairCache.get(cacheKey);
      if (cached) return cached;
      const [firstChild, secondChild] = childrenByParent[parent]!;
      const pairs: GreaterRealmTierTwoGateApronSiblingPair[] = [];
      for (const first of bundleOptionsFor(componentId, firstChild!)) {
        for (const second of bundleOptionsFor(componentId, secondChild!)) {
          if (
            first === second
            || bundlesOverlap(first.tierOneCells, second.tierOneCells)
            || bundlesOverlap(first.tierTwoCells, second.tierTwoCells)
          ) continue;
          const separation = Math.min(...first.edges.flatMap(edge => (
            second.edges.map(siblingEdge => axialDistance(
              grid.q[edge.tierTwoEndpoint]!,
              grid.r[edge.tierTwoEndpoint]!,
              grid.q[siblingEdge.tierTwoEndpoint]!,
              grid.r[siblingEdge.tierTwoEndpoint]!,
            ))
          )));
          if (separation < 8) continue;
          pairs.push(Object.freeze({
            children: Object.freeze([firstChild!, secondChild!] as const),
            bundles: Object.freeze([first, second] as const),
            score: first.score + second.score,
          }));
        }
      }
      pairs.sort((first, second) => (
        Number(first.bundles[0].child !== first.children[0])
        + Number(first.bundles[1].child !== first.children[1])
        - Number(second.bundles[0].child !== second.children[0])
        - Number(second.bundles[1].child !== second.children[1])
        || first.score - second.score
        || first.bundles[0].child - second.bundles[0].child
        || first.bundles[1].child - second.bundles[1].child
        || first.bundles[0].edges[0].tierTwoEndpoint
          - second.bundles[0].edges[0].tierTwoEndpoint
        || first.bundles[1].edges[0].tierTwoEndpoint
          - second.bundles[1].edges[0].tierTwoEndpoint
      ));
      const frozen = Object.freeze(pairs);
      siblingPairCache.set(cacheKey, frozen);
      return frozen;
    };
    const lowlandsRepairBundleOptionsFor = (
      componentId: number,
      child: number,
    ): readonly GreaterRealmTierTwoGateApronBundle[] => {
      const key = `${componentId}:${child}`;
      const cached = lowlandsRepairBundleOptionsCache.get(key);
      if (cached) return cached;
      const available = child === 0
        ? [...(lowlandsRepairGateApronBundlesByKey.get(`${componentId}:0`) ?? [])]
        : [...gateApronBundlesByKey]
            .filter(([bundleKey]) => (
              Number.parseInt(bundleKey.split(':')[0]!, 10) === componentId
            ))
            .flatMap(([, bundles]) => bundles);
      const options = rankGreaterRealmLowlandsRepairBundleOptions(
        available,
        child,
        bundle => bundle.child,
        bundle => bundle.score,
        bundle => bundle.edges[0].tierTwoEndpoint,
      ).slice(0, 64);
      const frozen = Object.freeze(options);
      lowlandsRepairBundleOptionsCache.set(key, frozen);
      return frozen;
    };
    const lowlandsRepairSiblingPairsFor = (
      componentId: number,
      parent: number,
    ): readonly GreaterRealmTierTwoGateApronSiblingPair[] => {
      if (cleared) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_CLEARED');
      if (
        !Number.isSafeInteger(componentId)
        || componentId < 0
        || componentId >= components.length
        || !Number.isSafeInteger(parent)
        || parent < 0
        || parent >= TIER_II_REGION_COUNT
      ) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_QUERY_INVALID');
      deriveLowlandsRepairBundles();
      const cacheKey = `${componentId}:${parent}`;
      const cached = lowlandsRepairSiblingPairCache.get(cacheKey);
      if (cached) return cached;
      const [firstChild, secondChild] = childrenByParent[parent]!;
      const pairs: GreaterRealmTierTwoGateApronSiblingPair[] = [];
      for (const first of lowlandsRepairBundleOptionsFor(componentId, firstChild!)) {
        for (const second of lowlandsRepairBundleOptionsFor(componentId, secondChild!)) {
          if (
            first === second
            || bundlesOverlap(first.tierOneCells, second.tierOneCells)
            || bundlesOverlap(first.tierTwoCells, second.tierTwoCells)
          ) continue;
          const separation = Math.min(...first.edges.flatMap(edge => (
            second.edges.map(siblingEdge => axialDistance(
              grid.q[edge.tierTwoEndpoint]!,
              grid.r[edge.tierTwoEndpoint]!,
              grid.q[siblingEdge.tierTwoEndpoint]!,
              grid.r[siblingEdge.tierTwoEndpoint]!,
            ))
          )));
          if (separation < 8) continue;
          pairs.push(Object.freeze({
            children: Object.freeze([firstChild!, secondChild!] as const),
            bundles: Object.freeze([first, second] as const),
            score: first.score + second.score,
          }));
        }
      }
      pairs.sort((first, second) => (
        Number(first.bundles[0].child !== first.children[0])
        + Number(first.bundles[1].child !== first.children[1])
        - Number(second.bundles[0].child !== second.children[0])
        - Number(second.bundles[1].child !== second.children[1])
        || first.score - second.score
        || first.bundles[0].child - second.bundles[0].child
        || first.bundles[1].child - second.bundles[1].child
        || first.bundles[0].edges[0].tierTwoEndpoint
          - second.bundles[0].edges[0].tierTwoEndpoint
        || first.bundles[1].edges[0].tierTwoEndpoint
          - second.bundles[1].edges[0].tierTwoEndpoint
      ));
      const frozen = Object.freeze(
        pairs.slice(0, GREATER_REALM_LOWLANDS_REPAIR_MAX_SIBLING_PAIRS_PER_PARENT),
      );
      lowlandsRepairSiblingPairCache.set(cacheKey, frozen);
      return frozen;
    };
    const readParentByChild = (): readonly number[] => {
      if (cleared) fail('GREATER_REALM_TIER_TWO_APRON_AUTHORITY_CLEARED');
      return Object.freeze([...parentByChild]);
    };
    return Object.freeze({
      parentByChild: readParentByChild,
      siblingPairsFor,
      lowlandsRepairSiblingPairsFor,
      clear,
    });
  } catch (error) {
    clear();
    throw error;
  }
}

/**
 * Reconcile the provisional middle ring against the authoritative water
 * surface before semantic region naming. The provisional partition is built
 * before lakes and inland seas exist, so balancing its political envelopes by
 * raw cell count can make one Tier-II realm own two large, mutually
 * unreachable shores. This allocator gives each middle realm exactly one
 * primary passable component, keeps its inner/outer strategic spine connected,
 * and uses only non-passable ownership to satisfy the exact cell quotas.
 *
 * When a water-separated Tier-II component cannot fit a safe political slot,
 * its passable cells return to Tier I and an equal number of unprotected Tier-I
 * ocean/lake cells enter Tier II. This changes neither terrain nor hydrology,
 * keeps total tier counts exact, and fails closed when a deterministic capacity
 * allocation cannot be constructed.
 */
function allocateTierTwoPassableCapacity(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  strategy: Readonly<{
    tierId: Uint8Array;
    regionId: Uint8Array;
    tierCounts: readonly [number, number, number];
    regionCounts: readonly number[];
  }>,
  waterRegime: Uint8Array,
  legacyProtectedCell: Uint8Array,
  legacyReserveCell: Uint8Array,
  onGateApronSearchLane?: (lane: GreaterRealmGateApronSearchLane) => void,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
  tierTwoPassableOwner: Int8Array;
  tierTwoSpineOwner: Int8Array;
  gateApronSearchLane: GreaterRealmGateApronSearchLane;
  repairImmutableCell?: Uint8Array;
}> {
  type OwnedAllocatorArray = Uint8Array | Uint16Array | Uint32Array | Int8Array | Int32Array;
  const ownedAllocatorArrays = new Set<OwnedAllocatorArray>();
  const own = <ArrayType extends OwnedAllocatorArray>(array: ArrayType): ArrayType => {
    ownedAllocatorArrays.add(array);
    return array;
  };
  const release = (array: OwnedAllocatorArray): void => {
    array.fill(0);
    ownedAllocatorArrays.delete(array);
  };
  const ownedAllocatorIndexArrays = new Set<number[]>();
  const ownIndexArray = (array: number[]): number[] => {
    ownedAllocatorIndexArrays.add(array);
    return array;
  };
  const releaseIndexArray = (array: readonly number[]): void => {
    const mutableArray = array as number[];
    mutableArray.fill(0);
    mutableArray.length = 0;
    ownedAllocatorIndexArrays.delete(mutableArray);
  };
  const releaseOwnershipForests = (
    forests: Iterable<readonly number[]>,
  ): void => {
    for (const forest of forests) releaseIndexArray(forest);
  };
  let retainedAuthorityArrays: ReadonlySet<OwnedAllocatorArray> = new Set();
  let gateApronAuthority: GreaterRealmTierTwoDryGateApronAuthority | undefined;
  const reject = (reason: GreaterRealmTierTwoCapacityRejectionReason): never => (
    rejectGreaterRealmTierTwoCapacity(reason)
  );
  try {
  const tierId = own(new Uint8Array(strategy.tierId));
  const regionId = own(new Uint8Array(strategy.regionId));
  const originalTierId = own(new Uint8Array(strategy.tierId));
  const originalRegionId = own(new Uint8Array(strategy.regionId));
  const tierTwoTotal = strategy.tierCounts[1];
  const targetCounts = Array.from({ length: TIER_II_REGION_COUNT }, (_, parent) => (
    Math.floor(tierTwoTotal / TIER_II_REGION_COUNT)
      + (parent < tierTwoTotal % TIER_II_REGION_COUNT ? 1 : 0)
  ));
  const passableTierTwoMask = own(new Uint8Array(grid.cellCount));
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      tierId[cell] === 2
      && strategicallyPassableSurface(waterRegime[cell]!)
    ) passableTierTwoMask[cell] = 1;
  }
  const passableComponents = [...connectedComponents(grid, passableTierTwoMask)]
    .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
  if (passableComponents.length === 0) reject('PASSABLE_COMPONENTS_EMPTY');

  const components: GreaterRealmTierTwoCapacityComponent[] = passableComponents.map((cells, id) => {
    const innerBoundary: number[] = [];
    const outerBoundary: number[] = [];
    const originalParentCounts = Array<number>(TIER_II_REGION_COUNT).fill(0);
    for (const cell of cells) {
      const originalParent = originalRegionId[cell]! - TIER_I_REGION_COUNT;
      if (originalParent >= 0 && originalParent < TIER_II_REGION_COUNT) {
        originalParentCounts[originalParent] += 1;
      }
      if (waterRegime[cell] !== WATER_DRY) continue;
      let touchesInner = false;
      let touchesOuter = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || waterRegime[neighbor] !== WATER_DRY) continue;
        if (tierId[neighbor] === 3) touchesInner = true;
        else if (tierId[neighbor] === 1) touchesOuter = true;
      }
      if (touchesInner) innerBoundary.push(cell);
      if (touchesOuter) outerBoundary.push(cell);
    }
    return Object.freeze({
      id,
      cells,
      innerBoundary: Object.freeze(innerBoundary),
      outerBoundary: Object.freeze(outerBoundary),
      originalParentCounts: Object.freeze(originalParentCounts),
    });
  });
  let tierThreePassableCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      tierId[cell] === 3
      && strategicallyPassableSurface(waterRegime[cell]!)
    ) tierThreePassableCells += 1;
  }
  // The public realm proof requires every outer and middle realm to own more
  // traversable land than compact Tier III. Reserve that capacity before any
  // political ownership is committed; a later water-cell swap cannot create
  // real land and must never be allowed to conceal an undersized realm.
  const minimumPrimaryCells = tierThreePassableCells + 512;
  const eligibleComponents = components.filter(component => (
    component.cells.length >= minimumPrimaryCells
      && component.innerBoundary.length > 0
      && component.outerBoundary.length > 0
  ));
  if (eligibleComponents.length === 0) reject('STRATEGIC_COMPONENTS_EMPTY');

  // Gate viability is political capacity, not a post-hoc rendering choice.
  // During allocation, stage two distinct dry apron options for every middle
  // realm. Each option has two boundary edges and vertex-disjoint local dry
  // corridors into a durable interior. These are transactional capacity hints:
  // the later semantic repair may rename or replace them, and barriersAndGates
  // must independently re-prove the final eighteen dry gate routes.
  gateApronAuthority = deriveTierTwoDryGateApronAuthority({
    grid,
    candidateSeed,
    tierId,
    originalRegionId,
    waterRegime,
    legacyProtectedCell,
    legacyReserveCell,
    components,
    reject,
  });
  const parentByChild = gateApronAuthority.parentByChild();
  const { siblingPairsFor, lowlandsRepairSiblingPairsFor } = gateApronAuthority;

  type CapacityAssignment = Readonly<{
    componentByParent: readonly number[];
    retainedPassableCells: number;
    originalOwnershipAffinity: number;
  }>;
  const buildRankedCapacityAssignments = (
    pairsFor: (
      componentId: number,
      parent: number,
    ) => readonly GreaterRealmTierTwoGateApronSiblingPair[],
    maximumAssignments: number,
  ): readonly CapacityAssignment[] => {
    const eligibleComponentsByParent = Array.from(
      { length: TIER_II_REGION_COUNT },
      (_, parent) => eligibleComponents.filter(
        component => pairsFor(component.id, parent).length > 0,
      ),
    );
    const capacityAssignments: CapacityAssignment[] = [];
    for (const first of eligibleComponentsByParent[0]!) {
      for (const second of eligibleComponentsByParent[1]!) {
        for (const third of eligibleComponentsByParent[2]!) {
          const componentByParent = [first.id, second.id, third.id] as const;
          const parentsByComponent = new Map<number, number[]>();
          for (let parent = 0; parent < TIER_II_REGION_COUNT; parent += 1) {
            const component = componentByParent[parent]!;
            const parents = parentsByComponent.get(component) ?? [];
            parents.push(parent);
            parentsByComponent.set(component, parents);
          }
          let retainedPassableCells = 0;
          let originalOwnershipAffinity = 0;
          let valid = true;
          for (const [componentId, parents] of parentsByComponent) {
            const component = components[componentId]!;
            const capacity = parents.reduce((sum, parent) => sum + targetCounts[parent]!, 0);
            if (
              component.cells.length < parents.length * minimumPrimaryCells
              || component.innerBoundary.length < parents.length
              || component.outerBoundary.length < parents.length
            ) {
              valid = false;
              break;
            }
            retainedPassableCells += Math.min(component.cells.length, capacity);
            for (const parent of parents) {
              originalOwnershipAffinity += component.originalParentCounts[parent]!;
            }
          }
          if (!valid) continue;
          const candidate = Object.freeze({
            componentByParent: Object.freeze([...componentByParent]),
            retainedPassableCells,
            originalOwnershipAffinity,
          });
          capacityAssignments.push(candidate);
        }
      }
    }
    capacityAssignments.sort((first, second) => {
      if (first.retainedPassableCells !== second.retainedPassableCells) {
        return second.retainedPassableCells - first.retainedPassableCells;
      }
      if (first.originalOwnershipAffinity !== second.originalOwnershipAffinity) {
        return second.originalOwnershipAffinity - first.originalOwnershipAffinity;
      }
      for (let parent = 0; parent < TIER_II_REGION_COUNT; parent += 1) {
        if (first.componentByParent[parent] !== second.componentByParent[parent]) {
          return first.componentByParent[parent]! - second.componentByParent[parent]!;
        }
      }
      return 0;
    });
    return Object.freeze(capacityAssignments.slice(0, maximumAssignments));
  };
  // Retain a bounded ranked frontier rather than committing to the first
  // capacity optimum before apron compatibility has been proved.
  const rankedCapacityAssignments = buildRankedCapacityAssignments(siblingPairsFor, 64);

  type GateApronPlan = Readonly<{
    parentByChild: readonly number[];
    bundleByChild: readonly GreaterRealmTierTwoGateApronBundle[];
    tierTwoOwnershipForestByParent: readonly (readonly number[])[];
  }>;
  const parentOrders = (parents: readonly number[]): readonly (readonly number[])[] => {
    if (parents.length <= 1) return Object.freeze([Object.freeze([...parents])]);
    if (parents.length === 2) {
      return Object.freeze([
        Object.freeze([parents[0]!, parents[1]!]),
        Object.freeze([parents[1]!, parents[0]!]),
      ]);
    }
    return Object.freeze([
      Object.freeze([parents[0]!, parents[1]!, parents[2]!]),
      Object.freeze([parents[0]!, parents[2]!, parents[1]!]),
      Object.freeze([parents[1]!, parents[0]!, parents[2]!]),
      Object.freeze([parents[1]!, parents[2]!, parents[0]!]),
      Object.freeze([parents[2]!, parents[0]!, parents[1]!]),
      Object.freeze([parents[2]!, parents[1]!, parents[0]!]),
    ]);
  };
  const buildTierOneApronRepartition = (
    bundleByChild: readonly GreaterRealmTierTwoGateApronBundle[],
  ): Readonly<{
    tierOneRegionId: Uint8Array;
  }> | undefined => {
    const scopedArrays: OwnedAllocatorArray[] = [];
    const scopedOwn = <ArrayType extends OwnedAllocatorArray>(array: ArrayType): ArrayType => {
      scopedArrays.push(own(array));
      return array;
    };
    let retainedTrialRegionId: Uint8Array | undefined;
    try {
    const trialRegionId = scopedOwn(new Uint8Array(regionId));
    const gateApronSlot = scopedOwn(new Int8Array(grid.cellCount));
    gateApronSlot.fill(-1);
    const reservedTierOneSlot = scopedOwn(new Int8Array(grid.cellCount));
    reservedTierOneSlot.fill(-1);
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      const bundle = bundleByChild[child]!;
      for (const cell of bundle.tierOneCells) {
        if (reservedTierOneSlot[cell] >= 0 && reservedTierOneSlot[cell] !== child) {
          return undefined;
        }
        reservedTierOneSlot[cell] = child;
        gateApronSlot[cell] = child;
      }
      for (const cell of bundle.tierTwoCells) {
        if (gateApronSlot[cell] >= 0 && gateApronSlot[cell] !== child) {
          return undefined;
        }
        gateApronSlot[cell] = child;
      }
    }
    const usedPatch = scopedOwn(new Uint8Array(grid.cellCount));
    const usedSwap = scopedOwn(new Uint8Array(grid.cellCount));
    const minimumFootholdCells = 512;
    for (let child = 1; child < TIER_I_REGION_COUNT; child += 1) {
      const bundle = bundleByChild[child]!;
      const source = bundle.child;
      if (source === child) continue;
      const tree = scopedOwn(new Uint8Array(grid.cellCount));
      const canUse = (cell: number): boolean => (
        cell >= 0
        && tierId[cell] === 1
        && originalRegionId[cell] === source
        && waterRegime[cell] === WATER_DRY
        && legacyProtectedCell[cell] === 0
        && legacyReserveCell[cell] === 0
        && usedPatch[cell] === 0
        && (
          reservedTierOneSlot[cell] < 0
          || reservedTierOneSlot[cell] === child
        )
      );
      const clusters = bundle.edges.map(edge => Object.freeze([
        edge.tierOneEndpoint,
        ...edge.tierOneCorridors.flat(),
      ]));
      if (clusters.some(cluster => cluster.some(cell => !canUse(cell)))) {
        return undefined;
      }
      for (const cell of clusters[0]!) tree[cell] = 1;
      for (const cluster of clusters.slice(1)) {
        const previous = scopedOwn(new Int32Array(grid.cellCount));
        previous.fill(-2);
        const queue = scopedOwn(new Uint32Array(grid.cellCount));
        let head = 0;
        let tail = 0;
        let target = -1;
        for (const cell of cluster) {
          if (previous[cell] !== -2) continue;
          previous[cell] = -1;
          queue[tail++] = cell;
          if (tree[cell] === 1) target = cell;
        }
        while (head < tail && target < 0) {
          const cell = queue[head++]!;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (!canUse(neighbor) || previous[neighbor] !== -2) continue;
            previous[neighbor] = cell;
            if (tree[neighbor] === 1) {
              target = neighbor;
              break;
            }
            queue[tail++] = neighbor;
          }
        }
        if (target < 0) return undefined;
        for (let cell = target; cell >= 0; cell = previous[cell]!) tree[cell] = 1;
        for (const cell of cluster) tree[cell] = 1;
      }
      const growthQueue = scopedOwn(new Uint32Array(grid.cellCount));
      let growthHead = 0;
      let growthTail = 0;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (tree[cell] !== 1) continue;
        growthQueue[growthTail++] = cell;
      }
      while (growthHead < growthTail && growthTail < minimumFootholdCells) {
        const cell = growthQueue[growthHead++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (!canUse(neighbor) || tree[neighbor] === 1) continue;
          tree[neighbor] = 1;
          growthQueue[growthTail++] = neighbor;
          if (growthTail >= minimumFootholdCells) break;
        }
      }
      if (growthTail < minimumFootholdCells) return undefined;
      const patch = Array.from(growthQueue.slice(0, growthTail));
      const swapCandidates = Array.from({ length: grid.cellCount }, (_, cell) => cell)
        .filter(cell => (
          tierId[cell] === 1
          && trialRegionId[cell] === child
          && !strategicallyPassableSurface(waterRegime[cell]!)
          && legacyProtectedCell[cell] === 0
          && legacyReserveCell[cell] === 0
          && reservedTierOneSlot[cell] < 0
          && usedPatch[cell] === 0
          && usedSwap[cell] === 0
        ));
      if (swapCandidates.length < patch.length) return undefined;
      for (const cell of patch) {
        trialRegionId[cell] = child;
        gateApronSlot[cell] = child;
        usedPatch[cell] = 1;
      }
      for (const cell of swapCandidates.slice(0, patch.length)) {
        trialRegionId[cell] = source;
        usedSwap[cell] = 1;
      }
    }
    const beforeCounts = scopedOwn(new Uint32Array(TIER_I_REGION_COUNT));
    const afterCounts = scopedOwn(new Uint32Array(TIER_I_REGION_COUNT));
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (tierId[cell] !== 1) continue;
      if (regionId[cell]! < TIER_I_REGION_COUNT) beforeCounts[regionId[cell]!] += 1;
      if (trialRegionId[cell]! < TIER_I_REGION_COUNT) afterCounts[trialRegionId[cell]!] += 1;
    }
    if (beforeCounts.some((count, child) => count !== afterCounts[child])) {
      return undefined;
    }
    const topology = passableRegionTopology(
      grid,
      trialRegionId,
      waterRegime,
      scopedOwn(new Uint8Array(grid.cellCount)),
    );
    scopedOwn(topology.componentId);
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      const bundle = bundleByChild[child]!;
      if (bundle.tierOneCells.some(cell => trialRegionId[cell] !== child)) {
        return undefined;
      }
      if (
        bundle.tierOneCells.some(cell => {
          const component = topology.componentId[cell]!;
          return component < 0 || topology.componentSizes[component]! < 64;
        })
      ) return undefined;
    }
    retainedTrialRegionId = trialRegionId;
    return Object.freeze({ tierOneRegionId: trialRegionId });
    } finally {
      for (const array of scopedArrays) {
        if (array !== retainedTrialRegionId) release(array);
      }
    }
  };
  const buildTierTwoOwnershipForests = (
    capacityAssignment: CapacityAssignment,
    bundleByChild: readonly GreaterRealmTierTwoGateApronBundle[],
  ): readonly (readonly number[])[] | undefined => {
    const scopedArrays: OwnedAllocatorArray[] = [];
    const ownedForests = new Set<number[]>();
    const scopedOwn = <ArrayType extends OwnedAllocatorArray>(array: ArrayType): ArrayType => {
      scopedArrays.push(own(array));
      return array;
    };
    const ownForest = (forest: number[]): number[] => {
      ownedForests.add(ownIndexArray(forest));
      return forest;
    };
    const releaseForest = (forest: readonly number[]): void => {
      releaseIndexArray(forest);
      ownedForests.delete(forest as number[]);
    };
    const forestByParent: Array<readonly number[] | undefined> = Array(
      TIER_II_REGION_COUNT,
    ).fill(undefined);
    let completed = false;
    try {
      const reservedApronOwner = scopedOwn(new Int8Array(grid.cellCount));
      reservedApronOwner.fill(-1);
      for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
        const parent = parentByChild[child]!;
        for (const cell of bundleByChild[child]!.tierTwoCells) {
          if (reservedApronOwner[cell] >= 0 && reservedApronOwner[cell] !== parent) {
            return undefined;
          }
          reservedApronOwner[cell] = parent;
        }
      }
      for (const component of components) {
        const parents = Array.from({ length: TIER_II_REGION_COUNT }, (_, parent) => parent)
          .filter(parent => capacityAssignment.componentByParent[parent] === component.id);
        if (parents.length === 0) continue;
        const member = scopedOwn(new Uint8Array(grid.cellCount));
        const innerBoundary = scopedOwn(new Uint8Array(grid.cellCount));
        for (const cell of component.cells) member[cell] = 1;
        for (const cell of component.innerBoundary) innerBoundary[cell] = 1;
        let componentForests: Map<number, readonly number[]> | undefined;
        for (const order of parentOrders(parents)) {
          const claimedOwner = scopedOwn(new Int8Array(grid.cellCount));
          claimedOwner.fill(-1);
          const trialForests = new Map<number, readonly number[]>();
          const trialForestArrays: number[][] = [];
          let complete = true;
          for (const parent of order) {
            const tree = scopedOwn(new Uint8Array(grid.cellCount));
            const clusters = bundleByChild.flatMap((bundle, child) => (
              parentByChild[child] === parent
                ? bundle.edges.map(edge => Object.freeze([
                    edge.tierTwoEndpoint,
                    ...edge.tierTwoCorridors.flat(),
                  ]))
                : []
            ));
            const canUse = (cell: number): boolean => (
              cell >= 0
              && member[cell] === 1
              && strategicallyPassableSurface(waterRegime[cell]!)
              && legacyProtectedCell[cell] === 0
              && legacyReserveCell[cell] === 0
              && claimedOwner[cell] < 0
              && (reservedApronOwner[cell] < 0 || reservedApronOwner[cell] === parent)
            );
            if (
              clusters.length !== 4
              || clusters.some(cluster => cluster.some(cell => !canUse(cell)))
            ) {
              complete = false;
              break;
            }
            // The canonical first apron cluster is the stable political seed.
            // Other apron options are capacity evidence only; final gate repair
            // independently re-proves every published gate. Retaining a single
            // seed avoids forcing one realm to span mutually separated sectors.
            for (const cell of clusters[0]!) tree[cell] = 1;
            const previous = scopedOwn(new Int32Array(grid.cellCount));
            previous.fill(-2);
            const queue = scopedOwn(new Uint32Array(grid.cellCount));
            let head = 0;
            let tail = 0;
            let target = -1;
            for (const cell of clusters[0]!) {
              if (previous[cell] !== -2) continue;
              previous[cell] = -1;
              queue[tail++] = cell;
              if (innerBoundary[cell] === 1) target = cell;
            }
            while (head < tail && target < 0) {
              const cell = queue[head++]!;
              for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                if (!canUse(neighbor) || previous[neighbor] !== -2) continue;
                previous[neighbor] = cell;
                if (innerBoundary[neighbor] === 1) {
                  target = neighbor;
                  break;
                }
                queue[tail++] = neighbor;
              }
            }
            if (target < 0) {
              complete = false;
              break;
            }
            for (let cell = target; cell >= 0; cell = previous[cell]!) tree[cell] = 1;
            const forest = ownForest([]);
            trialForestArrays.push(forest);
            for (let cell = 0; cell < grid.cellCount; cell += 1) {
              if (tree[cell] !== 1) continue;
              if (claimedOwner[cell] >= 0) {
                complete = false;
                break;
              }
              claimedOwner[cell] = parent;
              forest.push(cell);
            }
            if (!complete) break;
            trialForests.set(parent, forest);
          }
          if (complete && trialForests.size === parents.length) {
            componentForests = trialForests;
            break;
          }
          for (const forest of trialForestArrays) releaseForest(forest);
          trialForests.clear();
        }
        if (!componentForests) return undefined;
        for (const [parent, forest] of componentForests) forestByParent[parent] = forest;
        componentForests.clear();
      }
      if (forestByParent.some(forest => forest === undefined)) return undefined;
      const forests = Object.freeze(forestByParent as readonly (readonly number[])[]);
      completed = true;
      return forests;
    } finally {
      for (const array of scopedArrays) release(array);
      if (!completed) {
        forestByParent.fill(undefined);
        releaseOwnershipForests(ownedForests);
      }
      ownedForests.clear();
    }
  };
  let selectedRepartition: ReturnType<typeof buildTierOneApronRepartition>;
  let selectedOwnershipForests: readonly (readonly number[])[] | undefined;
  let selectedBundleByChild: readonly GreaterRealmTierTwoGateApronBundle[] | undefined;
  let selectedSearchLane: GreaterRealmGateApronSearchLane | undefined;
  const MAX_GATE_APRON_SEARCH_NODES = 20_000;
  const MAX_GATE_APRON_COMPLETE_PLANS = 128;
  const lowlandsRepairPlanOwnershipValid = (
    bundleByChild: readonly GreaterRealmTierTwoGateApronBundle[],
    trialRegionId?: Uint8Array,
  ): boolean => {
    const lowlandsBundle = bundleByChild[0];
    if (!lowlandsBundle || lowlandsBundle.child !== 0) return false;
    if (lowlandsBundle.edges.some(edge => (
      edge.child !== 0
      || legacyReserveCell[edge.tierOneEndpoint] !== 1
      || legacyReserveCell[edge.tierTwoEndpoint] === 1
      || legacyProtectedCell[edge.tierOneEndpoint] === 1
      || legacyProtectedCell[edge.tierTwoEndpoint] === 1
    ))) return false;
    if (lowlandsBundle.tierOneCells.some(cell => (
      originalRegionId[cell] !== 0
      || legacyProtectedCell[cell] === 1
      || (trialRegionId !== undefined && trialRegionId[cell] !== 0)
    ))) return false;
    if (lowlandsBundle.tierTwoCells.some(cell => (
      legacyProtectedCell[cell] === 1 || legacyReserveCell[cell] === 1
    ))) return false;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        legacyReserveCell[cell] === 1
        && (
          originalRegionId[cell] !== 0
          || (trialRegionId !== undefined && trialRegionId[cell] !== 0)
        )
      ) return false;
    }
    return true;
  };
  const searchGateApronLane = (
    lane: GreaterRealmGateApronSearchLane,
    assignments: readonly CapacityAssignment[],
    pairsFor: (
      componentId: number,
      parent: number,
    ) => readonly GreaterRealmTierTwoGateApronSiblingPair[],
  ): GreaterRealmRankedSiblingSearchResult<
    CapacityAssignment,
    GreaterRealmTierTwoGateApronSiblingPair
  > => {
    onGateApronSearchLane?.(lane);
    return searchGreaterRealmRankedSiblingAlternatives(
      assignments,
      (capacityAssignment) => {
      const siblingPairsByParent = Array.from(
        { length: TIER_II_REGION_COUNT },
        (_, parent) => pairsFor(
          capacityAssignment.componentByParent[parent]!,
          parent,
        ),
      );
      return Array.from(
        { length: TIER_II_REGION_COUNT },
        (_, parent) => parent,
      ).sort((first, second) => (
        siblingPairsByParent[first]!.length - siblingPairsByParent[second]!.length
        || first - second
      )).map(parent => siblingPairsByParent[parent]!);
      },
      (capacityAssignment, siblingPairs) => {
      const bundleByChild = new Array<
        GreaterRealmTierTwoGateApronBundle | undefined
      >(TIER_I_REGION_COUNT);
      for (const pair of siblingPairs) {
        const [firstChild, secondChild] = pair.children;
        bundleByChild[firstChild] = pair.bundles[0];
        bundleByChild[secondChild] = pair.bundles[1];
      }
      if (bundleByChild.includes(undefined)) return false;
      const completeBundles = bundleByChild as GreaterRealmTierTwoGateApronBundle[];
      if (
        lane === 'lowlands-repair'
        && !lowlandsRepairPlanOwnershipValid(completeBundles)
      ) return false;
      const ownershipForests = buildTierTwoOwnershipForests(
        capacityAssignment,
        completeBundles,
      );
      if (!ownershipForests) return false;
      let retainOwnershipForests = false;
      try {
        const repartition = buildTierOneApronRepartition(completeBundles);
        if (!repartition) return false;
        if (
          lane === 'lowlands-repair'
          && !lowlandsRepairPlanOwnershipValid(
            completeBundles,
            repartition.tierOneRegionId,
          )
        ) {
          release(repartition.tierOneRegionId);
          return false;
        }
        selectedRepartition = repartition;
        selectedOwnershipForests = ownershipForests;
        selectedBundleByChild = Object.freeze([...completeBundles]);
        selectedSearchLane = lane;
        retainOwnershipForests = true;
        return true;
      } finally {
        if (!retainOwnershipForests) releaseOwnershipForests(ownershipForests);
      }
      },
      Object.freeze({
        maximumSearchNodes: MAX_GATE_APRON_SEARCH_NODES,
        maximumCompletePlans: MAX_GATE_APRON_COMPLETE_PLANS,
      }),
      pair => pair.bundles,
    );
  };
  const lowlandsRepairRankedCapacityAssignments = buildRankedCapacityAssignments(
    lowlandsRepairSiblingPairsFor,
    GREATER_REALM_LOWLANDS_REPAIR_MAX_CAPACITY_ASSIGNMENTS,
  );
  if (
    rankedCapacityAssignments.length === 0
    && lowlandsRepairRankedCapacityAssignments.length === 0
  ) reject('ASSIGNMENT_MISSING');
  const gateApronLaneSearch = runGreaterRealmGateApronSearchLanes(
    () => searchGateApronLane(
      'ordinary',
      rankedCapacityAssignments,
      siblingPairsFor,
    ),
    () => searchGateApronLane(
      'lowlands-repair',
      lowlandsRepairRankedCapacityAssignments,
      lowlandsRepairSiblingPairsFor,
    ),
  );
  const gateApronSearch = gateApronLaneSearch.result;
  const capacityAssignment = (() => {
    switch (gateApronSearch.outcome) {
      case 'match': return gateApronSearch.alternative;
      case 'search-node-limit': return reject('DRY_GATE_APRON_SEARCH_NODE_LIMIT');
      case 'complete-plan-limit': return reject('DRY_GATE_APRON_COMPLETE_PLAN_LIMIT');
      case 'no-match': return reject('DRY_GATE_APRON_NO_MATCH');
    }
  })();
  if (
    !selectedRepartition
    || !selectedOwnershipForests
    || !selectedBundleByChild
    || selectedSearchLane !== gateApronLaneSearch.lane
  ) {
    reject('DRY_GATE_APRON_PLAN_MISSING');
  }
  const committedSearchLane = gateApronLaneSearch.lane;
  const bundleByChild = selectedBundleByChild as readonly GreaterRealmTierTwoGateApronBundle[];
  const committedRepartition = selectedRepartition as Readonly<{
    tierOneRegionId: Uint8Array;
  }>;
  const committedOwnershipForests = selectedOwnershipForests as readonly (readonly number[])[];
  if (
    committedSearchLane === 'lowlands-repair'
    && !lowlandsRepairPlanOwnershipValid(bundleByChild, committedRepartition.tierOneRegionId)
  ) fail('GREATER_REALM_LOWLANDS_REPAIR_OWNERSHIP_CHANGED');
  regionId.set(committedRepartition.tierOneRegionId);
  const gateApronPlan: GateApronPlan = Object.freeze({
    parentByChild: Object.freeze([...parentByChild]),
    bundleByChild: Object.freeze([...bundleByChild]),
    tierTwoOwnershipForestByParent: committedOwnershipForests,
  });
  const repairImmutableCell = committedSearchLane === 'lowlands-repair'
    ? own(new Uint8Array(grid.cellCount))
    : undefined;
  if (repairImmutableCell) {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (legacyReserveCell[cell] === 1) repairImmutableCell[cell] = 1;
    }
    const lowlandsBundle = gateApronPlan.bundleByChild[0]!;
    for (const cell of lowlandsBundle.tierOneCells) repairImmutableCell[cell] = 1;
    for (const cell of lowlandsBundle.tierTwoCells) repairImmutableCell[cell] = 1;
  }

  const allocationField = own(createGreaterRealmMultiscaleIntegerField(
    grid,
    candidateSeed,
    [
      {
        channel: 'strategic-tier-two-passable-capacity',
        amplitude: 2_400,
        smoothingPasses: 11,
        selfWeight: 3,
      },
    ],
  ));
  const assignedPassable = own(new Uint8Array(grid.cellCount));
  const demotedPassable: number[] = [];
  const usedComponents = new Set(capacityAssignment.componentByParent);
  const tierTwoSpineOwner = own(new Int8Array(grid.cellCount));
  tierTwoSpineOwner.fill(-1);

  for (const component of components) {
    if (!usedComponents.has(component.id)) {
      demotedPassable.push(...component.cells);
      continue;
    }
    const parents = Array.from({ length: TIER_II_REGION_COUNT }, (_, parent) => parent)
      .filter(parent => capacityAssignment.componentByParent[parent] === component.id);
    const member = own(new Uint8Array(grid.cellCount));
    for (const cell of component.cells) member[cell] = 1;
    const outerBoundaryMask = own(new Uint8Array(grid.cellCount));
    for (const cell of component.outerBoundary) outerBoundaryMask[cell] = 1;
    const authoritySeedCellsByParent = new Map<number, readonly number[]>();
    for (const parent of parents) {
      const ownershipForest = gateApronPlan.tierTwoOwnershipForestByParent[parent]!;
      if (ownershipForest.length === 0 || ownershipForest.some(cell => (
        member[cell] !== 1
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || legacyProtectedCell[cell] === 1
        || legacyReserveCell[cell] === 1
      ))) reject('STRATEGIC_AUTHORITY_SEED_INVALID');
      authoritySeedCellsByParent.set(parent, ownershipForest);
    }

    const owner = own(new Int8Array(grid.cellCount));
    owner.fill(-1);
    const counts = own(new Uint32Array(TIER_II_REGION_COUNT));
    let assignedCount = 0;
    const seedCellsByParent = new Map<number, readonly number[]>();
    for (const parent of parents) {
      const seeds = authoritySeedCellsByParent.get(parent)!;
      seedCellsByParent.set(parent, seeds);
      for (const cell of seeds) {
        if (owner[cell] >= 0 && owner[cell] !== parent) reject('SPINE_OVERLAP');
        if (owner[cell] === parent) continue;
        owner[cell] = parent;
        counts[parent] += 1;
        assignedCount += 1;
      }
    }
    const componentCapacity = parents.reduce(
      (sum, parent) => sum + targetCounts[parent]!,
      0,
    );
    const retainedTarget = Math.min(component.cells.length, componentCapacity);
    if (assignedCount > retainedTarget) reject('SPINE_CAPACITY_EXCEEDED');
    const desired = own(new Uint32Array(TIER_II_REGION_COUNT));
    let desiredAssigned = 0;
    for (let index = 0; index < parents.length; index += 1) {
      const parent = parents[index]!;
      desired[parent] = Math.floor(retainedTarget / parents.length)
        + (index < retainedTarget % parents.length ? 1 : 0);
      desired[parent] = Math.max(desired[parent]!, counts[parent]!);
      desiredAssigned += desired[parent]!;
    }
    while (desiredAssigned > retainedTarget) {
      let selected = -1;
      for (const parent of [...parents].reverse()) {
        if (desired[parent]! <= counts[parent]!) continue;
        selected = parent;
        break;
      }
      if (selected < 0) reject('DESIRED_CAPACITY_INVALID');
      desired[selected] -= 1;
      desiredAssigned -= 1;
    }
    while (desiredAssigned < retainedTarget) {
      let selected = -1;
      for (const parent of parents) {
        if (desired[parent]! >= targetCounts[parent]!) continue;
        selected = parent;
        break;
      }
      if (selected < 0) reject('DESIRED_CAPACITY_UNDERSIZED');
      desired[selected] += 1;
      desiredAssigned += 1;
    }

    const heaps = Array.from({ length: TIER_II_REGION_COUNT }, () => (
      [] as GreaterRealmStrategicFrontierEntry[]
    ));
    const bestPriority = Array.from({ length: TIER_II_REGION_COUNT }, () => {
      const values = own(new Int32Array(grid.cellCount));
      values.fill(INT32_MAX);
      return values;
    });
    const offer = (parent: number, cell: number, depth: number) => {
      if (cell < 0 || member[cell] !== 1 || owner[cell] >= 0) return;
      const ownershipAffinity = originalRegionId[cell] === TIER_I_REGION_COUNT + parent
        ? -480
        : 0;
      const priority = clamp(
        allocationField[cell]! + depth * 72 + ownershipAffinity,
        -INT32_MAX,
        INT32_MAX,
      );
      if (priority >= bestPriority[parent]![cell]!) return;
      bestPriority[parent]![cell] = priority;
      strategicFrontierPush(
        heaps[parent]!,
        Object.freeze({ cell, depth, priority }),
      );
    };
    for (const parent of parents) {
      for (const cell of seedCellsByParent.get(parent)!) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          offer(parent, grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!, 1);
        }
      }
    }
    const pending = new Map<number, GreaterRealmStrategicFrontierEntry>();
    const refresh = (parent: number) => {
      if (pending.has(parent)) return;
      while (heaps[parent]!.length > 0) {
        const entry = strategicFrontierPop(heaps[parent]!)!;
        if (
          owner[entry.cell] < 0
          && bestPriority[parent]![entry.cell] === entry.priority
        ) {
          pending.set(parent, entry);
          return;
        }
      }
    };
    while (assignedCount < retainedTarget) {
      for (const parent of parents) refresh(parent);
      let selectedParent = -1;
      for (const parent of parents) {
        if (!pending.has(parent) || counts[parent]! >= desired[parent]!) continue;
        if (
          selectedParent < 0
          || counts[parent]! * desired[selectedParent]!
            < counts[selectedParent]! * desired[parent]!
          || (
            counts[parent]! * desired[selectedParent]!
              === counts[selectedParent]! * desired[parent]!
            && parent < selectedParent
          )
        ) selectedParent = parent;
      }
      if (selectedParent < 0) {
        for (const parent of parents) {
          if (!pending.has(parent) || counts[parent]! >= targetCounts[parent]!) continue;
          if (selectedParent < 0 || parent < selectedParent) selectedParent = parent;
        }
      }
      // A competing connected flood can enclose another parent's frontier.
      // Do not cross that ownership band or overfill the surviving realm merely
      // to consume the component. The unclaimed passable remainder is safely
      // returned to Tier I below and balanced with non-passable tier ownership.
      if (selectedParent < 0) break;
      const entry = pending.get(selectedParent)!;
      pending.delete(selectedParent);
      if (owner[entry.cell] >= 0) continue;
      owner[entry.cell] = selectedParent;
      counts[selectedParent] += 1;
      assignedCount += 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        offer(
          selectedParent,
          grid.neighbors[entry.cell * HEX_NEIGHBOR_COUNT + direction]!,
          entry.depth + 1,
        );
      }
    }
    const innerBoundaryMask = own(new Uint8Array(grid.cellCount));
    for (const cell of component.innerBoundary) innerBoundaryMask[cell] = 1;
    const strategicSpineMask = own(new Uint8Array(grid.cellCount));
    const strategicApronMask = own(new Uint8Array(grid.cellCount));
    for (const parent of parents) {
      const spineOwner = TIER_I_REGION_COUNT + parent;
      for (const cell of seedCellsByParent.get(parent)!) {
        if (owner[cell] !== parent || !strategicallyPassableSurface(waterRegime[cell]!)) {
          reject('STRATEGIC_AUTHORITY_OWNERSHIP_CHANGED');
        }
        if (
          tierTwoSpineOwner[cell] >= 0
          && tierTwoSpineOwner[cell] !== spineOwner
        ) reject('SPINE_OWNER_CONFLICT');
        tierTwoSpineOwner[cell] = spineOwner;
        strategicSpineMask[cell] = 1;
      }
    }
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      if (gateApronPlan.parentByChild[child] === undefined) continue;
      const bundle = gateApronPlan.bundleByChild[child]!;
      if (bundle.componentId !== component.id) continue;
      for (const cell of bundle.tierTwoCells) strategicApronMask[cell] = 1;
    }
    const innerContactCounts = own(new Uint32Array(TIER_II_REGION_COUNT));
    const outerContactCounts = own(new Uint32Array(TIER_II_REGION_COUNT));
    for (const cell of component.cells) {
      const parent = owner[cell]!;
      if (parent < 0) continue;
      if (innerBoundaryMask[cell] === 1) innerContactCounts[parent] += 1;
      if (outerBoundaryMask[cell] === 1) outerContactCounts[parent] += 1;
    }
    const safeDonorBoundaryRemoval = (cell: number, donor: number): boolean => {
      let runs = 0;
      let previousMatches = false;
      let firstMatches = false;
      let lastMatches = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        const matches = neighbor >= 0 && owner[neighbor] === donor;
        if (direction === 0) firstMatches = matches;
        if (matches && !previousMatches) runs += 1;
        previousMatches = matches;
        lastMatches = matches;
      }
      if (firstMatches && lastMatches && runs > 1) runs -= 1;
      // A single cyclic run means every same-owner neighbour remains linked
      // around this hex after removal. This is a conservative local
      // articulation guard for an already-connected flood territory.
      return runs <= 1;
    };
    // Natural choke points can let two balanced fronts enclose a third just
    // short of its published land-capacity floor. Move only safe fringe cells
    // from surplus neighbours into that connected realm. Each move preserves
    // both strategic contacts and cannot sever the donor's local topology.
    while (parents.some(parent => counts[parent]! < minimumPrimaryCells)) {
      let progress = false;
      const deficientParents = [...parents].sort((first, second) => (
        counts[first]! - counts[second]! || first - second
      ));
      for (const targetParent of deficientParents) {
        if (counts[targetParent]! >= minimumPrimaryCells) continue;
        const candidates = component.cells.filter(cell => {
          const donor = owner[cell]!;
          if (donor < 0 || donor === targetParent || counts[donor]! <= minimumPrimaryCells) {
            return false;
          }
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && owner[neighbor] === targetParent) return true;
          }
          return false;
        }).sort((first, second) => {
          const firstDonor = owner[first]!;
          const secondDonor = owner[second]!;
          return (counts[secondDonor]! - minimumPrimaryCells)
              - (counts[firstDonor]! - minimumPrimaryCells)
            || allocationField[first]! - allocationField[second]!
            || first - second;
        });
        for (const cell of candidates) {
          if (counts[targetParent]! >= minimumPrimaryCells) break;
          const donor = owner[cell]!;
          if (
            donor < 0
            || donor === targetParent
            || counts[donor]! <= minimumPrimaryCells
            || strategicSpineMask[cell] === 1
            || strategicApronMask[cell] === 1
            || (
              innerBoundaryMask[cell] === 1
              && innerContactCounts[donor]! <= 1
            )
            || (
              outerBoundaryMask[cell] === 1
              && outerContactCounts[donor]! <= 1
            )
            || !safeDonorBoundaryRemoval(cell, donor)
          ) continue;
          let touchesTarget = false;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && owner[neighbor] === targetParent) {
              touchesTarget = true;
              break;
            }
          }
          if (!touchesTarget) continue;
          owner[cell] = targetParent;
          counts[donor] -= 1;
          counts[targetParent] += 1;
          if (innerBoundaryMask[cell] === 1) {
            innerContactCounts[donor] -= 1;
            innerContactCounts[targetParent] += 1;
          }
          if (outerBoundaryMask[cell] === 1) {
            outerContactCounts[donor] -= 1;
            outerContactCounts[targetParent] += 1;
          }
          progress = true;
        }
      }
      if (!progress) break;
    }
    if (parents.some(parent => counts[parent]! < minimumPrimaryCells)) {
      reject('PRIMARY_COMPONENT_UNDERSIZED');
    }
    for (const cell of component.cells) {
      const parent = owner[cell]!;
      if (parent < 0) {
        demotedPassable.push(cell);
        continue;
      }
      regionId[cell] = TIER_I_REGION_COUNT + parent;
      assignedPassable[cell] = 1;
    }
  }

  for (const cell of demotedPassable) {
    if (legacyProtectedCell[cell] === 1 || legacyReserveCell[cell] === 1) {
      reject('LOWLANDS_DEMOTION_FORBIDDEN');
    }
    tierId[cell] = 1;
  }
  if (demotedPassable.length > 0) {
    const distanceToRetainedTierTwo = own(distanceFromMask(grid, assignedPassable));
    const promotionCandidates = Array.from({ length: grid.cellCount }, (_, cell) => cell)
      .filter(cell => (
        tierId[cell] === 1
        && !strategicallyPassableSurface(waterRegime[cell]!)
        && legacyProtectedCell[cell] === 0
        && legacyReserveCell[cell] === 0
      ))
      .sort((first, second) => (
        distanceToRetainedTierTwo[first]! - distanceToRetainedTierTwo[second]!
        || first - second
      ));
    if (promotionCandidates.length < demotedPassable.length) reject('PROMOTION_CAPACITY_MISSING');
    for (const cell of promotionCandidates.slice(0, demotedPassable.length)) tierId[cell] = 2;
  }

  const tierOneMasks = Array.from({ length: TIER_I_REGION_COUNT }, (_, region) => {
    const mask = own(new Uint8Array(grid.cellCount));
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (tierId[cell] === 1 && originalRegionId[cell] === region) mask[cell] = 1;
    }
    return mask;
  });
  const tierOneDistances = tierOneMasks.map(mask => own(distanceFromMask(grid, mask)));
  for (const cell of demotedPassable) {
    let selectedRegion = 1;
    for (let region = 2; region < TIER_I_REGION_COUNT; region += 1) {
      if (
        tierOneDistances[region]![cell]! < tierOneDistances[selectedRegion]![cell]!
        || (
          tierOneDistances[region]![cell] === tierOneDistances[selectedRegion]![cell]
          && region < selectedRegion
        )
      ) selectedRegion = region;
    }
    regionId[cell] = selectedRegion;
  }

  const passableCounts = own(new Uint32Array(TIER_II_REGION_COUNT));
  const nonPassableTierTwo: number[] = [];
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 2) continue;
    if (strategicallyPassableSurface(waterRegime[cell]!)) {
      const parent = regionId[cell]! - TIER_I_REGION_COUNT;
      if (parent < 0 || parent >= TIER_II_REGION_COUNT) reject('PASSABLE_OWNER_INVALID');
      passableCounts[parent] += 1;
    } else {
      nonPassableTierTwo.push(cell);
    }
  }
  const deficits = targetCounts.map((target, parent) => target - passableCounts[parent]!);
  if (deficits.some(value => value < 0)) reject('REGION_CELL_CAPACITY_EXCEEDED');
  if (deficits.reduce((sum, value) => sum + value, 0) !== nonPassableTierTwo.length) {
    reject('NON_PASSABLE_BALANCE_INVALID');
  }
  const parentDistance = Array.from({ length: TIER_II_REGION_COUNT }, (_, parent) => {
    const mask = own(new Uint8Array(grid.cellCount));
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        tierId[cell] === 2
        && regionId[cell] === TIER_I_REGION_COUNT + parent
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) mask[cell] = 1;
    }
    return own(distanceFromMask(grid, mask));
  });
  const preferences = nonPassableTierTwo.map(cell => {
    const order = Array.from({ length: TIER_II_REGION_COUNT }, (_, parent) => parent)
      .sort((first, second) => (
        parentDistance[first]![cell]! - parentDistance[second]![cell]!
        || first - second
      ));
    const margin = parentDistance[order[1]!]![cell]! - parentDistance[order[0]!]![cell]!;
    return Object.freeze({ cell, order: Object.freeze(order), margin });
  }).sort((first, second) => (
    second.margin - first.margin
    || parentDistance[first.order[0]!]![first.cell]!
      - parentDistance[second.order[0]!]![second.cell]!
    || first.cell - second.cell
  ));
  for (const preference of preferences) {
    const parent = preference.order.find(candidate => deficits[candidate]! > 0);
    if (parent === undefined) reject('NON_PASSABLE_ASSIGNMENT_EXHAUSTED');
    const selectedParent = parent as number;
    regionId[preference.cell] = TIER_I_REGION_COUNT + selectedParent;
    deficits[selectedParent] -= 1;
  }
  if (deficits.some(value => value !== 0)) reject('NON_PASSABLE_DEFICIT_REMAINS');

  const finalTierCounts: [number, number, number] = [0, 0, 0];
  const finalRegionCounts = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    finalTierCounts[tierId[cell]! - 1] += 1;
    finalRegionCounts[regionId[cell]!] += 1;
    if (
      (legacyProtectedCell[cell] === 1 || legacyReserveCell[cell] === 1)
      && (
        tierId[cell] !== originalTierId[cell]
        || regionId[cell] !== originalRegionId[cell]
      )
    ) reject('LOWLANDS_LOCK_CHANGED');
  }
  if (finalTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])) {
    reject('TIER_TOTAL_CHANGED');
  }
  if (targetCounts.some((count, parent) => (
    finalRegionCounts[TIER_I_REGION_COUNT + parent] !== count
  ))) reject('REGION_TOTAL_CHANGED');
  if (!regionBalance(finalRegionCounts.slice(TIER_I_REGION_COUNT, TIER_III_REGION_INDEX))) {
    reject('REGION_BALANCE_FAILED');
  }
  const tierTwoPassableOwner = own(new Int8Array(grid.cellCount));
  tierTwoPassableOwner.fill(-1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      tierId[cell] === 2
      && strategicallyPassableSurface(waterRegime[cell]!)
    ) tierTwoPassableOwner[cell] = regionId[cell]!;
  }
  assertTierTwoCapacityAuthority({
    grid,
    tierId,
    regionId,
    waterRegime,
    tierTwoPassableOwner,
    tierTwoSpineOwner,
  });
  const topology = passableRegionTopology(
    grid,
    regionId,
    waterRegime,
    own(new Uint8Array(grid.cellCount)),
  );
  own(topology.componentId);
  for (let region = TIER_I_REGION_COUNT; region < TIER_III_REGION_INDEX; region += 1) {
    if (topology.largestSharesBasisPoints[region]! < 9_500) {
      reject('PASSABLE_COHERENCE_FAILED');
    }
    let innerContacts = 0;
    let outerContacts = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (regionId[cell] !== region || waterRegime[cell] !== WATER_DRY) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || waterRegime[neighbor] !== WATER_DRY) continue;
        if (tierId[neighbor] === 3) innerContacts += 1;
        else if (tierId[neighbor] === 1) outerContacts += 1;
      }
    }
    if (innerContacts === 0 || outerContacts === 0) reject('STRATEGIC_FRONTIER_MISSING');
  }
  const authority = Object.freeze({
    tierId,
    regionId,
    tierCounts: Object.freeze(finalTierCounts),
    regionCounts: Object.freeze(finalRegionCounts),
    tierTwoPassableOwner,
    tierTwoSpineOwner,
    gateApronSearchLane: committedSearchLane,
    ...(repairImmutableCell ? { repairImmutableCell } : {}),
  });
  retainedAuthorityArrays = new Set([
    tierId,
    regionId,
    tierTwoPassableOwner,
    tierTwoSpineOwner,
    ...(repairImmutableCell ? [repairImmutableCell] : []),
  ]);
  return authority;
  } finally {
    gateApronAuthority?.clear();
    releaseOwnershipForests(ownedAllocatorIndexArrays);
    ownedAllocatorIndexArrays.clear();
    for (const array of ownedAllocatorArrays) {
      if (!retainedAuthorityArrays.has(array)) array.fill(0);
    }
  }
}

function measureRepairStonewakeNaturalPotential(
  grid: IndexedAxialGrid,
  provisionalRegionId: Uint8Array,
  elevation: Int32Array,
  basin: number,
): Readonly<{
  meaningfulIslandCount: number;
  narrowStraitCellCount: number;
}> {
  const islandMask = new Uint8Array(grid.cellCount);
  const componentId = new Int32Array(grid.cellCount);
  const meaningfulComponent = new Uint8Array(grid.cellCount + 1);
  const visitEpoch = new Uint32Array(grid.cellCount);
  const visitDepth = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let meaningfulIslandCount = 0;
  let narrowStraitCellCount = 0;
  let epoch = 0;
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        provisionalRegionId[cell] === basin
        && elevation[cell]! > SEA_LEVEL
      ) islandMask[cell] = 1;
    }
    const components = connectedComponents(grid, islandMask);
    for (let component = 0; component < components.length; component += 1) {
      const cells = components[component]!;
      const id = component + 1;
      for (const cell of cells) componentId[cell] = id;
      if (cells.length < 64) continue;
      meaningfulComponent[id] = 1;
      meaningfulIslandCount += 1;
    }
    if (
      meaningfulIslandCount
        < GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
          .stonewakeMinimumMeaningfulIslands
    ) return Object.freeze({ meaningfulIslandCount, narrowStraitCellCount });

    // Political water ownership is assigned before semantic identities. For
    // role selection, measure the physical saltwater strait independently of
    // that provisional owner; the repair lane later exchanges only the small
    // reviewed water corridor needed by the selected island basin.
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (elevation[start]! > SEA_LEVEL) continue;
      epoch += 1;
      let head = 0;
      let tail = 0;
      let firstIsland = 0;
      let secondIsland = 0;
      queue[tail++] = start;
      visitEpoch[start] = epoch;
      visitDepth[start] = 0;
      while (head < tail && secondIsland === 0) {
        const cell = queue[head++]!;
        const depth = visitDepth[cell]!;
        if (depth >= 5) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          const island = componentId[neighbor]!;
          if (island > 0 && meaningfulComponent[island] === 1) {
            if (firstIsland === 0) firstIsland = island;
            else if (island !== firstIsland) secondIsland = island;
            continue;
          }
          if (
            visitEpoch[neighbor] === epoch
            || elevation[neighbor]! > SEA_LEVEL
          ) continue;
          visitEpoch[neighbor] = epoch;
          visitDepth[neighbor] = depth + 1;
          queue[tail++] = neighbor;
        }
      }
      if (secondIsland !== 0) narrowStraitCellCount += 1;
    }
    return Object.freeze({ meaningfulIslandCount, narrowStraitCellCount });
  } finally {
    islandMask.fill(0);
    componentId.fill(0);
    meaningfulComponent.fill(0);
    visitEpoch.fill(0);
    visitDepth.fill(0);
    queue.fill(0);
  }
}

function remapTierOneNaturalBasinsByCharacter(
  grid: IndexedAxialGrid,
  provisional: Readonly<{
    tierId: Uint8Array;
    regionId: Uint8Array;
    tierCounts: readonly [number, number, number];
  }>,
  elevation: Int32Array,
  uplift: Int32Array,
  flowAccumulation: BigUint64Array,
  domainId: Uint8Array,
  domains: readonly GreaterRealmPseudoTectonicDomain[],
  waterRegime: Uint8Array,
  temperatureField: Int32Array,
  moistureField: Int32Array,
  glacialMask: Uint8Array,
  aridMask: Uint8Array,
  volcanicMask: Uint8Array,
  coastalMask: Uint8Array,
  coastalClass: Uint8Array,
  lowlandsRepairLane = false,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
  semanticPermutation: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
}> {
  // Provisional T1 basin IDs carry topology only. Working identities are
  // assigned afterward from climate/process evidence so no named region is
  // created by painting a biome into a preselected wedge.
  const scoreSums = Array.from({ length: TIER_I_REGION_COUNT }, () => (
    Array<bigint>(TIER_I_REGION_COUNT - 1).fill(0n)
  ));
  const landCounts = Array<number>(TIER_I_REGION_COUNT).fill(0);
  const dryCounts = Array<number>(TIER_I_REGION_COUNT).fill(0);
  const fjordCounts = Array<number>(TIER_I_REGION_COUNT).fill(0);
  const aridProcessCounts = Array<number>(TIER_I_REGION_COUNT).fill(0);
  const repairStonewakePotential: Array<Readonly<{
    meaningfulIslandCount: number;
    narrowStraitCellCount: number;
  }>> = Array.from(
    { length: TIER_I_REGION_COUNT },
    () => Object.freeze({ meaningfulIslandCount: 0, narrowStraitCellCount: 0 }),
  );
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const basin = provisional.regionId[cell]!;
    if (provisional.tierId[cell] !== 1 || basin === 0) continue;
    if (coastalClass[cell] === GREATER_REALM_COASTAL_CLASS.glacialFjord) {
      fjordCounts[basin] += 1;
    }
    if (elevation[cell]! <= SEA_LEVEL) continue;
    landCounts[basin] += 1;
    if (waterRegime[cell] === WATER_DRY) {
      dryCounts[basin] += 1;
      if (aridMask[cell] === 1) aridProcessCounts[basin] += 1;
    }
    const temperature = temperatureField[cell]!;
    const moisture = moistureField[cell]!;
    let flowMagnitude = 0;
    for (let flow = flowAccumulation[cell]!; flow > 1n; flow >>= 1n) flowMagnitude += 1;
    let coastNeighbors = 0;
    let wetNeighbors = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      if (
        waterRegime[neighbor] === WATER_OCEAN
        || waterRegime[neighbor] === WATER_SEA
        || waterRegime[neighbor] === WATER_LAKE
      ) coastNeighbors += 1;
      if (waterRegime[neighbor] >= 2) wetNeighbors += 1;
    }
    const domain = domains[domainId[cell]!]!;
    const scores = [
      Math.max(0, 5_000 - temperature) * 3
        + Math.floor(Math.max(0, elevation[cell]! - 7_000) / 3)
        + glacialMask[cell]! * 12_000,
      Math.max(0, temperature - 3_500) * 2
        + Math.max(0, -moisture - 500) * 2
        + aridMask[cell]! * 12_000
        + Math.max(0, 8 - flowMagnitude) * 180,
      flowMagnitude * 520
        + wetNeighbors * 1_500
        + Math.max(0, moisture) * 2
        + (coastalClass[cell] === 3 ? 8_000 : 0),
      coastNeighbors * 3_400
        + coastalMask[cell]! * 5_000
        + (coastalClass[cell] > 0 ? 2_500 : 0)
        + Math.floor(Math.max(0, elevation[cell]!) / 8),
      Math.floor(domain.volcanicPotential * 3)
        + Math.floor(Math.max(0, uplift[cell]!) / 2)
        + volcanicMask[cell]! * 12_000,
    ] as const;
    for (let role = 0; role < scores.length; role += 1) {
      scoreSums[basin]![role] += BigInt(scores[role]!);
    }
  }
  const normalizedScores = scoreSums.map((scores, basin) => scores.map(score => {
    const count = landCounts[basin]!;
    return count > 0 ? score / BigInt(count) : 0n;
  }));
  for (let basin = 1; basin < TIER_I_REGION_COUNT; basin += 1) {
    const passableMask = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        provisional.regionId[cell] === basin
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) passableMask[cell] = 1;
    }
    const components = connectedComponents(grid, passableMask);
    const total = components.reduce((sum, component) => sum + component.length, 0);
    const largest = components.reduce(
      (maximum, component) => Math.max(maximum, component.length),
      0,
    );
    const meaningfulIslands = components.filter(component => component.length >= 64).length;
    const islandiness = total === 0 ? 0 : 10_000 - Math.round((largest * 10_000) / total);
    normalizedScores[basin]![3] += BigInt(
      islandiness * 4 + Math.min(10, meaningfulIslands) * 500,
    );
    if (lowlandsRepairLane) {
      repairStonewakePotential[basin] = measureRepairStonewakeNaturalPotential(
        grid,
        provisional.regionId,
        elevation,
        basin,
      );
      const stonewake = repairStonewakePotential[basin]!;
      if (
        stonewake.meaningfulIslandCount
          >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
            .stonewakeMinimumMeaningfulIslands
        && stonewake.narrowStraitCellCount
          >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
            .stonewakeMinimumNarrowIslandStraitCells
      ) {
        normalizedScores[basin]![3] += 2_000_000n
          + BigInt(stonewake.meaningfulIslandCount) * 10_000n
          + BigInt(Math.min(stonewake.narrowStraitCellCount, 10_000));
      }
    }
    const aridProcessBasisPoints = dryCounts[basin] === 0
      ? 0
      : Math.round(
        (aridProcessCounts[basin]! * 10_000) / dryCounts[basin]!,
      );
    // Character assignment is evidence-led. A basin which already carries
    // enough glacial coast or naturally generated arid-process terrain gets a
    // lexicographic-scale role bonus; this never paints or edits terrain and
    // merely names the physical basin that best satisfies the role.
    if (
      fjordCounts[basin]!
        >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
          .frostmereMinimumFjordCells
    ) {
      normalizedScores[basin]![0] += 1_000_000n
        + BigInt(fjordCounts[basin]!) * 10_000n;
    }
    if (
      aridProcessBasisPoints
        >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY
          .sunscarMinimumAridDryLandBasisPoints
    ) {
      normalizedScores[basin]![1] += 1_000_000n
        + BigInt(aridProcessBasisPoints) * 100n;
    }
  }
  let bestScore: bigint | undefined;
  let bestPermutation: readonly number[] | undefined;
  // Exactly 5! bounded integer assignments. Loop order is the complete
  // lexicographic tie-break, so equal scores replay identically.
  for (let first = 1; first <= 5; first += 1) {
    for (let second = 1; second <= 5; second += 1) {
      if (second === first) continue;
      for (let third = 1; third <= 5; third += 1) {
        if (third === first || third === second) continue;
        for (let fourth = 1; fourth <= 5; fourth += 1) {
          if (fourth === first || fourth === second || fourth === third) continue;
          for (let fifth = 1; fifth <= 5; fifth += 1) {
            if ([first, second, third, fourth].includes(fifth)) continue;
            const permutation = [0, first, second, third, fourth, fifth] as const;
            let score = 0n;
            for (let basin = 1; basin <= 5; basin += 1) {
              score += normalizedScores[basin]![permutation[basin]! - 1]!;
            }
            if (bestScore === undefined || score > bestScore) {
              bestScore = score;
              bestPermutation = permutation;
            }
          }
        }
      }
    }
  }
  if (!bestPermutation) fail('GREATER_REALM_SEMANTIC_REGION_REMAP_FAILED');
  const regionId = new Uint8Array(provisional.regionId);
  const regionCounts = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const provisionalRegion = provisional.regionId[cell]!;
    if (provisionalRegion > 0 && provisionalRegion < TIER_I_REGION_COUNT) {
      regionId[cell] = bestPermutation[provisionalRegion]!;
    }
    regionCounts[regionId[cell]!] += 1;
  }
  const gateGraph = GREATER_REALM_PROVISIONAL_GATE_GRAPH.map(([first, second]) => (
    Object.freeze([
      first > 0 && first < TIER_I_REGION_COUNT ? bestPermutation[first]! : first,
      second,
    ] as const)
  ));
  return Object.freeze({
    tierId: provisional.tierId,
    regionId,
    tierCounts: provisional.tierCounts,
    regionCounts: Object.freeze(regionCounts),
    semanticPermutation: Object.freeze([...bestPermutation]),
    gateGraph: Object.freeze(gateGraph),
  });
}

function connectedComponents(
  grid: IndexedAxialGrid,
  included: Uint8Array,
): readonly (readonly number[])[];
function connectedComponents(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  retainMutableCoordinates: true,
): number[][];
function connectedComponents(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  retainMutableCoordinates = false,
): readonly (readonly number[])[] | number[][] {
  let seen: Uint8Array | undefined;
  const components: number[][] = [];
  let queue: Uint32Array | undefined;
  let completed = false;
  try {
    seen = new Uint8Array(grid.cellCount);
    queue = new Uint32Array(grid.cellCount);
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (included[start] !== 1 || seen[start] === 1) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      const component: number[] = [];
      components.push(component);
      while (head < tail) {
        const cell: number = queue[head++]!;
        component.push(cell);
        for (
          let directionIndex = 0;
          directionIndex < HEX_NEIGHBOR_COUNT;
          directionIndex += 1
        ) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
          if (neighbor < 0 || included[neighbor] !== 1 || seen[neighbor] === 1) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (retainMutableCoordinates) {
      completed = true;
      return components;
    }
    const result = Object.freeze(components.map(component => Object.freeze(component)));
    completed = true;
    return result;
  } finally {
    seen?.fill(0);
    queue?.fill(0);
    if (!completed) {
      for (const component of components) component.fill(0);
      components.length = 0;
    }
  }
}

function connectedComponentsAtEqualSurface(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  surface: Int32Array,
): readonly (readonly number[])[];
function connectedComponentsAtEqualSurface(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  surface: Int32Array,
  retainMutableCoordinates: true,
): number[][];
function connectedComponentsAtEqualSurface(
  grid: IndexedAxialGrid,
  included: Uint8Array,
  surface: Int32Array,
  retainMutableCoordinates = false,
): readonly (readonly number[])[] | number[][] {
  let seen: Uint8Array | undefined;
  const components: number[][] = [];
  let queue: Uint32Array | undefined;
  let completed = false;
  try {
    seen = new Uint8Array(grid.cellCount);
    queue = new Uint32Array(grid.cellCount);
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (included[start] !== 1 || seen[start] === 1) continue;
      const level = surface[start]!;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      const component: number[] = [];
      components.push(component);
      while (head < tail) {
        const cell: number = queue[head++]!;
        component.push(cell);
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || included[neighbor] !== 1
            || seen[neighbor] === 1
            || surface[neighbor] !== level
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
    }
    if (retainMutableCoordinates) {
      completed = true;
      return components;
    }
    const result = Object.freeze(components.map(component => Object.freeze(component)));
    completed = true;
    return result;
  } finally {
    seen?.fill(0);
    queue?.fill(0);
    if (!completed) {
      for (const component of components) component.fill(0);
      components.length = 0;
    }
  }
}

function clearConnectedComponentCoordinates(
  components: readonly number[][] | undefined,
): void {
  if (!components) return;
  for (const component of components) component.fill(0);
}

function standingWaterSurfaceLevel(
  cell: number,
  regime: number,
  elevation: Int32Array,
  filledElevation: Int32Array,
): number {
  if (regime === WATER_OCEAN) return SEA_LEVEL;
  return elevation[cell]! <= SEA_LEVEL ? SEA_LEVEL : filledElevation[cell]!;
}

/**
 * Prove that each connected OCEAN/SEA/LAKE body has one standing level and
 * that every OCEAN body reaches the active-grid boundary. This intentionally
 * mirrors (but does not replace) the final hydrology authority invariant so a
 * valid generated surface can be distinguished from an incompatibility
 * introduced solely by projecting the immutable Lowlands water overlay.
 */
export function hasGreaterRealmStandingWaterBodySurfaceProof(
  input: Readonly<{
    grid: IndexedAxialGrid;
    waterRegime: Uint8Array;
    elevation: Int32Array;
    filledElevation: Int32Array;
  }>,
): boolean {
  if (
    typeof input !== 'object'
    || input === null
    || typeof input.grid !== 'object'
    || input.grid === null
  ) fail('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
  if (
    !isCanonicalGreaterRealmAxialGrid(input.grid)
    || !(input.waterRegime instanceof Uint8Array)
    || !(input.elevation instanceof Int32Array)
    || !(input.filledElevation instanceof Int32Array)
    || input.waterRegime.length !== input.grid.cellCount
    || input.elevation.length !== input.grid.cellCount
    || input.filledElevation.length !== input.grid.cellCount
  ) fail('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.waterRegime[cell]! > WATER_MARSH
      || input.filledElevation[cell]! < input.elevation[cell]!
    ) fail('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
    if (
      input.waterRegime[cell] === WATER_OCEAN
      && input.elevation[cell]! > SEA_LEVEL
    ) fail('GREATER_REALM_HYDROLOGY_SURFACE_INVALID');
  }
  const seen = new Uint8Array(input.grid.cellCount);
  const queue = new Uint32Array(input.grid.cellCount);
  try {
    for (let start = 0; start < input.grid.cellCount; start += 1) {
      const regime = input.waterRegime[start]!;
      if (
        (regime !== WATER_OCEAN
          && regime !== WATER_SEA
          && regime !== WATER_LAKE)
        || seen[start] === 1
      ) continue;
      const expectedSurface = standingWaterSurfaceLevel(
        start,
        regime,
        input.elevation,
        input.filledElevation,
      );
      if (
        expectedSurface < input.elevation[start]!
        || (regime === WATER_OCEAN && input.elevation[start]! > SEA_LEVEL)
      ) fail('GREATER_REALM_HYDROLOGY_SURFACE_INVALID');
      let touchesActiveBoundary = false;
      let head = 0;
      let tail = 0;
      seen[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const cell = queue[head++]!;
        if (
          standingWaterSurfaceLevel(
            cell,
            regime,
            input.elevation,
            input.filledElevation,
          ) !== expectedSurface
        ) return false;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = input.grid.neighbors[
            cell * HEX_NEIGHBOR_COUNT + direction
          ]!;
          if (neighbor < 0) {
            touchesActiveBoundary = true;
            continue;
          }
          if (
            input.waterRegime[neighbor] !== regime
            || seen[neighbor] === 1
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (regime === WATER_OCEAN && !touchesActiveBoundary) return false;
    }
    return true;
  } finally {
    seen.fill(0);
    queue.fill(0);
  }
}

export function enforceGreaterRealmStandingWaterBodySurfaceProof(
  input: Readonly<{
    phase: 'generated' | 'legacy-overlay';
    proof: boolean;
  }>,
): void {
  if (
    typeof input !== 'object'
    || input === null
    || typeof input.proof !== 'boolean'
    || (input.phase !== 'generated' && input.phase !== 'legacy-overlay')
  ) fail('GREATER_REALM_STANDING_WATER_AUDIT_INPUT_INVALID');
  if (input.proof) return;
  if (input.phase === 'generated') {
    fail('GREATER_REALM_HYDROLOGY_BODY_SURFACE_INVARIANT');
  }
  rejectGreaterRealmCandidate(
    'GREATER_REALM_HYDROLOGY_BODY_SURFACE_GEOGRAPHY_EXHAUSTED',
  );
}

/**
 * Select ranked inland-sea basins without coalescing adjacent, unequal water
 * levels under one SEA regime. The caller supplies deterministic rank order;
 * skipped conflicts do not consume capacity, so later compatible basins can
 * still satisfy the requested major-body count.
 */
export function selectGreaterRealmCompatibleStandingWaterComponents(
  input: Readonly<{
    grid: IndexedAxialGrid;
    rankedComponents: readonly (readonly number[])[];
    elevation: Int32Array;
    filledElevation: Int32Array;
    waterRegime: Uint8Array;
    maximumCount: number;
    minimumCellCount: number;
  }>,
): readonly (readonly number[])[] {
  if (
    typeof input !== 'object'
    || input === null
    || typeof input.grid !== 'object'
    || input.grid === null
  ) fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
  if (
    !isCanonicalGreaterRealmAxialGrid(input.grid)
    || !(input.elevation instanceof Int32Array)
    || !(input.filledElevation instanceof Int32Array)
    || !(input.waterRegime instanceof Uint8Array)
    || input.elevation.length !== input.grid.cellCount
    || input.filledElevation.length !== input.grid.cellCount
    || input.waterRegime.length !== input.grid.cellCount
    || !Array.isArray(input.rankedComponents)
    || !Number.isSafeInteger(input.maximumCount)
    || input.maximumCount < 0
    || !Number.isSafeInteger(input.minimumCellCount)
    || input.minimumCellCount < 1
  ) fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.waterRegime[cell]! > WATER_MARSH
      || input.filledElevation[cell]! < input.elevation[cell]!
    ) fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
  }
  const componentCell = new Uint8Array(input.grid.cellCount);
  try {
    for (const component of input.rankedComponents) {
      if (!Array.isArray(component) || component.length === 0) {
        fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
      }
      let componentLevel: number | undefined;
      for (const cell of component) {
        if (
          !Number.isSafeInteger(cell)
          || cell < 0
          || cell >= input.grid.cellCount
          || componentCell[cell] === 1
          || input.waterRegime[cell] !== WATER_DRY
        ) fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
        const level = standingWaterSurfaceLevel(
          cell,
          WATER_SEA,
          input.elevation,
          input.filledElevation,
        );
        if (componentLevel !== undefined && level !== componentLevel) {
          fail('GREATER_REALM_STANDING_WATER_SELECTION_INPUT_INVALID');
        }
        componentLevel = level;
        componentCell[cell] = 1;
      }
    }
  } finally {
    componentCell.fill(0);
  }
  const selected: Array<readonly number[]> = [];
  for (const component of input.rankedComponents) {
    if (
      selected.length >= input.maximumCount
      || component.length < input.minimumCellCount
      || component.length === 0
    ) continue;
    const level = standingWaterSurfaceLevel(
      component[0]!,
      WATER_SEA,
      input.elevation,
      input.filledElevation,
    );
    let conflicts = false;
    for (const cell of component) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[
          cell * HEX_NEIGHBOR_COUNT + direction
        ]!;
        if (
          neighbor >= 0
          && input.waterRegime[neighbor] === WATER_SEA
          && standingWaterSurfaceLevel(
            neighbor,
            WATER_SEA,
            input.elevation,
            input.filledElevation,
          ) !== level
        ) {
          conflicts = true;
          break;
        }
      }
      if (conflicts) break;
    }
    if (conflicts) continue;
    selected.push(component);
    for (const cell of component) input.waterRegime[cell] = WATER_SEA;
  }
  return Object.freeze(selected);
}

function repairNaturalRegionLandCoherence(
  grid: IndexedAxialGrid,
  strategy: Readonly<{
    tierId: Uint8Array;
    regionId: Uint8Array;
    tierCounts: readonly [number, number, number];
    regionCounts: readonly number[];
    semanticPermutation: readonly number[];
    gateGraph: readonly GreaterRealmGateGraphEdge[];
  }>,
  waterRegime: Uint8Array,
  legacyProtectedCell: Uint8Array,
  tierTwoPassableOwner: Int8Array,
  tierTwoSpineOwner: Int8Array,
  repairImmutableCell?: Uint8Array,
  lowlandsRepairLane = false,
): Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
  semanticPermutation: readonly number[];
  gateGraph: readonly GreaterRealmGateGraphEdge[];
}> {
  if (
    repairImmutableCell !== undefined
    && repairImmutableCell.length !== grid.cellCount
  ) fail('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_SHAPE_INVALID');
  const repairOwnershipImmutable = (cell: number): boolean => (
    repairImmutableCell?.[cell] === 1
  );
  const tierId = new Uint8Array(strategy.tierId);
  const regionId = new Uint8Array(strategy.regionId);
  const initialCounts = [...strategy.regionCounts];
  assertTierTwoCapacityAuthority({
    grid,
    tierId,
    regionId,
    waterRegime,
    tierTwoPassableOwner,
    tierTwoSpineOwner,
  });
  const regionRepairLocked = Uint8Array.from(
    tierTwoPassableOwner,
    (owner, cell) => owner >= 0 || repairOwnershipImmutable(cell) ? 1 : 0,
  );
  // Keep each region's dominant land body. A detached component is transferred
  // only to a same-tier region it physically touches; truly isolated T1
  // islands belong to Stonewake. Equal non-passable water ownership is swapped
  // back so the exact region/tier population contract is unchanged.
  const repairOrder = [1, 2, 3, 5, 9, 0, 4] as const;
  for (const sourceRegion of repairOrder) {
    const included = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] === sourceRegion
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) included[cell] = 1;
    }
    const components = [...connectedComponents(grid, included)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
    if (components.length <= 1) continue;
    const destinationTier = GREATER_REALM_REGION_SPECS[sourceRegion]!.tier + 1;
    const tierContactCount = (component: readonly number[]) => {
      let count = 0;
      for (const cell of component) {
        if (waterRegime[cell] !== 0) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && tierId[neighbor] === destinationTier
            && waterRegime[neighbor] === 0
          ) count += 1;
        }
      }
      return count;
    };
    const largestHasTierContact = sourceRegion === TIER_III_REGION_INDEX
      || tierContactCount(components[0]!) > 0;
    const protectedGateComponent = largestHasTierContact
      ? undefined
      : components.slice(1)
          .filter(component => component.length >= 64 && tierContactCount(component) > 0)
          .sort((first, second) => (
            tierContactCount(second) - tierContactCount(first)
            || second.length - first.length
            || first[0]! - second[0]!
          ))[0];
    // Repair to a deliberately stronger pre-barrier target. The later
    // geological shoulder mask legitimately removes boundary cells; matching
    // the final threshold here left ordinary candidates just below it.
    const targetLargestShare = sourceRegion < TIER_I_REGION_COUNT
      ? sourceRegion === 4
        ? lowlandsRepairLane ? 6_000 : 7_000
        : 8_750
      : sourceRegion < TIER_III_REGION_INDEX ? 9_250 : 9_500;
    const targetMinorShare = sourceRegion === 4 ? 425 : 250;
    const selectedComponents: Array<readonly number[]> = [];
    const repairStonewakeIslands = new Set<readonly number[]>(
      lowlandsRepairLane && sourceRegion === 4
        ? components.slice(1)
            .filter(component => component.length >= 64)
            .sort((first, second) => second.length - first.length || first[0]! - second[0]!)
            .slice(0, 2)
        : [],
    );
    let remainingPassable = components.reduce((total, component) => total + component.length, 0);
    let remainingMinor = components.slice(1).reduce(
      (total, component) => total + (component.length < 64 ? component.length : 0),
      0,
    );
    for (const component of components.slice(1)) {
      if (
        component === protectedGateComponent
        || repairStonewakeIslands.has(component)
      ) continue;
      if (components[0]!.length * 10_000 >= remainingPassable * targetLargestShare) break;
      selectedComponents.push(component);
      remainingPassable -= component.length;
      if (component.length < 64) remainingMinor -= component.length;
    }
    const alreadySelected = new Set(selectedComponents);
    const smallFragments = components.slice(1)
      .filter(component => (
        component.length < 64
        && component !== protectedGateComponent
        && !alreadySelected.has(component)
      ))
      .sort((first, second) => first.length - second.length || first[0]! - second[0]!);
    for (const component of smallFragments) {
      if (remainingMinor * 10_000 <= remainingPassable * targetMinorShare) break;
      selectedComponents.push(component);
      remainingPassable -= component.length;
      remainingMinor -= component.length;
    }
    for (const component of selectedComponents) {
      if (component.some(cell => (
        legacyProtectedCell[cell] === 1
          || repairOwnershipImmutable(cell)
          || (
            regionRepairLocked[cell] === 1
            && sourceRegion !== 4
            && sourceRegion !== 0
          )
      ))) continue;
      const contacts = new Uint32Array(REGION_COUNT);
      for (const cell of component) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
            || (
              sourceRegion === TIER_III_REGION_INDEX
                ? tierId[neighbor] !== 2
                : tierId[neighbor] !== tierId[cell]
            )
            || regionId[neighbor] === sourceRegion
          ) continue;
          contacts[regionId[neighbor]!] += 1;
        }
      }
      let targetRegion = -1;
      let bestContacts = 0;
      if (sourceRegion === TIER_III_REGION_INDEX) {
        // Throneheart is the only Tier III region, so an offshore fragment has
        // no same-tier recipient. Move that land to the nearest adjacent
        // middle realm and exchange equal non-passable ownership back into
        // Tier III. Tier/region populations remain exact while the throne
        // realm's traversable authority stays on one natural land body.
        for (let region = TIER_I_REGION_COUNT; region < TIER_III_REGION_INDEX; region += 1) {
          if (
            contacts[region]! > bestContacts
            || (
              contacts[region] === bestContacts
              && contacts[region]! > 0
              && region < targetRegion
            )
          ) {
            targetRegion = region;
            bestContacts = contacts[region]!;
          }
        }
        if (targetRegion < 0) {
          let bestDistance = Number.POSITIVE_INFINITY;
          for (
            let region = TIER_I_REGION_COUNT;
            region < TIER_III_REGION_INDEX;
            region += 1
          ) {
            const targetMask = new Uint8Array(grid.cellCount);
            for (let cell = 0; cell < grid.cellCount; cell += 1) {
              if (regionId[cell] === region) targetMask[cell] = 1;
            }
            const distance = distanceFromMask(grid, targetMask);
            const minimum = component.reduce(
              (value, cell) => Math.min(value, distance[cell]!),
              Number.POSITIVE_INFINITY,
            );
            if (minimum < bestDistance || (minimum === bestDistance && region < targetRegion)) {
              targetRegion = region;
              bestDistance = minimum;
            }
          }
        }
      } else {
        for (let region = 0; region < REGION_COUNT; region += 1) {
          if (
            region === sourceRegion
            || GREATER_REALM_REGION_SPECS[region]!.tier
              !== GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
          ) continue;
          if (contacts[region]! > bestContacts) {
            targetRegion = region;
            bestContacts = contacts[region]!;
          }
        }
      }
      if (targetRegion < 0 && sourceRegion < TIER_I_REGION_COUNT) {
        // A whole offshore island has no same-landmass neighbour. Assigning
        // every such island to Stonewake made that realm an arbitrary bucket
        // of disconnected terrain. Instead distribute isolated landmasses to
        // the same-tier realm whose dominant body can absorb the fragment
        // with the highest projected coherence. This remains deterministic
        // and preserves each island as a single political unit.
        const currentTopology = passableRegionTopology(
          grid,
          regionId,
          waterRegime,
          new Uint8Array(grid.cellCount),
        );
        const currentMinorCells = new Uint32Array(REGION_COUNT);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          const componentId = currentTopology.componentId[cell]!;
          if (
            componentId >= 0
            && currentTopology.componentSizes[componentId]! < 64
          ) currentMinorCells[regionId[cell]!] += 1;
        }
        let bestProjectedShare = -1;
        let bestMinorBurden = Number.POSITIVE_INFINITY;
        for (let region = 0; region < TIER_I_REGION_COUNT; region += 1) {
          if (region === sourceRegion) continue;
          const projectedTotal = currentTopology.passableCounts[region]! + component.length;
          const projectedShare = projectedTotal === 0
            ? 0
            : Math.floor(
              (currentTopology.largestCounts[region]! * 10_000) / projectedTotal,
            );
          const projectedMinorShare = projectedTotal === 0
            ? 10_000
            : Math.floor((
              currentMinorCells[region]!
                + (component.length < 64 ? component.length : 0)
            ) * 10_000 / projectedTotal);
          const minorAllowance = region === 4 ? 425 : 250;
          const minorBurden = Math.floor((projectedMinorShare * 10_000) / minorAllowance);
          const preferable = component.length < 64
            ? minorBurden < bestMinorBurden
              || (minorBurden === bestMinorBurden && projectedShare > bestProjectedShare)
              || (
                minorBurden === bestMinorBurden
                && projectedShare === bestProjectedShare
                && region < targetRegion
              )
            : projectedShare > bestProjectedShare
              || (projectedShare === bestProjectedShare && minorBurden < bestMinorBurden)
              || (
                projectedShare === bestProjectedShare
                && minorBurden === bestMinorBurden
                && region < targetRegion
              );
          if (preferable) {
            targetRegion = region;
            bestProjectedShare = projectedShare;
            bestMinorBurden = minorBurden;
          }
        }
      }
      if (targetRegion < 0 || targetRegion === sourceRegion) continue;

      // Tier membership is authoritative once the water-aware middle-ring
      // allocator has committed its exact capacity. A fragmented throne
      // island would require a new pre-allocation normalization pass; never
      // mutate Tier III into Tier II here and silently invalidate the spines.
      if (sourceRegion === TIER_III_REGION_INDEX) {
        rejectGreaterRealmTierTwoCapacity('THRONE_COMPONENT_REPAIR_FORBIDDEN');
      }

      const waterSwapCandidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
          || repairOwnershipImmutable(cell)
        ) continue;
        waterSwapCandidates.push(cell);
      }
      if (waterSwapCandidates.length < component.length) continue;
      waterSwapCandidates.sort((first, second) => {
        const sourceContacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === sourceRegion) count += 1;
          }
          return count;
        };
        return sourceContacts(second) - sourceContacts(first) || first - second;
      });
      for (const cell of component) {
        regionId[cell] = targetRegion;
        regionRepairLocked[cell] = 1;
      }
      for (let index = 0; index < component.length; index += 1) {
        const swap = waterSwapCandidates[index]!;
        regionId[swap] = sourceRegion;
      }
    }
    // Lowlands (and any analogous island realm) may have its immutable main
    // body offshore while a second continental foothold carries its gates.
    // If retaining that whole foothold would miss the coherence threshold,
    // keep a connected dry saddle district and transfer only its hinterland.
    const repairedMask = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] === sourceRegion
        && strategicallyPassableSurface(waterRegime[cell]!)
      ) repairedMask[cell] = 1;
    }
    const repairedComponents = [...connectedComponents(grid, repairedMask)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
    const repairedTotal = repairedComponents.reduce(
      (total, component) => total + component.length,
      0,
    );
    if (
      repairedComponents.length > 1
      && repairedComponents[0]!.length * 10_000 < repairedTotal * targetLargestShare
    ) {
      const foothold = repairedComponents.slice(1)
        .filter(component => component.length >= 96 && tierContactCount(component) >= 2)
        .sort((first, second) => (
          tierContactCount(second) - tierContactCount(first)
          || second.length - first.length
          || first[0]! - second[0]!
          ))[0];
      if (foothold) {
        const maximumTotal = Math.floor(
          (repairedComponents[0]!.length * 10_000) / targetLargestShare,
        );
        const excess = repairedTotal - maximumTotal;
        const keepCount = Math.max(96, foothold.length - excess - 8);
        if (keepCount < foothold.length) {
          const footholdMask = new Uint8Array(grid.cellCount);
          for (const cell of foothold) footholdMask[cell] = 1;
          const seed = [...foothold]
            .filter(cell => tierContactCount([cell]) > 0)
            .sort((first, second) => first - second)[0];
          if (seed !== undefined) {
            const keep = new Uint8Array(grid.cellCount);
            const queue = new Uint32Array(grid.cellCount);
            let head = 0;
            let tail = 0;
            keep[seed] = 1;
            queue[tail++] = seed;
            while (head < tail && tail < keepCount) {
              const cell = queue[head++]!;
              for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                if (neighbor < 0 || footholdMask[neighbor] !== 1 || keep[neighbor] === 1) continue;
                keep[neighbor] = 1;
                queue[tail++] = neighbor;
                if (tail >= keepCount) break;
              }
            }
            const transfer = foothold.filter(cell => (
              keep[cell] !== 1 && !repairOwnershipImmutable(cell)
            ));
            const transferMask = new Uint8Array(grid.cellCount);
            for (const cell of transfer) transferMask[cell] = 1;
            const transferPieces = [...connectedComponents(grid, transferMask)]
              .sort((first, second) => first[0]! - second[0]!);
            const assignments: Array<Readonly<{
              cells: readonly number[];
              targetRegion: number;
            }>> = [];
            const swapCounts = new Uint32Array(REGION_COUNT);
            let assignmentValid = transferPieces.length > 0;
            for (const cells of transferPieces) {
              const contacts = new Uint32Array(REGION_COUNT);
              for (const cell of cells) {
                for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
                  const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
                  if (
                    neighbor >= 0
                    && strategicallyPassableSurface(waterRegime[neighbor]!)
                    && tierId[neighbor] === tierId[cell]
                    && regionId[neighbor] !== sourceRegion
                  ) contacts[regionId[neighbor]!] += 1;
                }
              }
              let targetRegion = -1;
              let bestContacts = 0;
              for (let region = 0; region < REGION_COUNT; region += 1) {
                if (
                  region !== sourceRegion
                  && GREATER_REALM_REGION_SPECS[region]!.tier
                    === GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
                  && contacts[region]! > bestContacts
                ) {
                  targetRegion = region;
                  bestContacts = contacts[region]!;
                }
              }
              if (targetRegion < 0) {
                assignmentValid = false;
                break;
              }
              assignments.push(Object.freeze({ cells, targetRegion }));
              swapCounts[targetRegion] += cells.length;
            }
            // Validate every connected piece and every compensating water swap
            // before the first political ownership mutation.
            const plannedWaterSwaps = new Map<number, readonly number[]>();
            if (assignmentValid) {
              for (let region = 0; region < REGION_COUNT; region += 1) {
                const swapCount = swapCounts[region]!;
                if (swapCount === 0) continue;
                const waterSwapCandidates = Array.from(
                  { length: grid.cellCount },
                  (_, cell) => cell,
                ).filter(cell => (
                  regionId[cell] === region
                  && !strategicallyPassableSurface(waterRegime[cell]!)
                  && legacyProtectedCell[cell] === 0
                  && !repairOwnershipImmutable(cell)
                ));
                if (waterSwapCandidates.length < swapCount) {
                  assignmentValid = false;
                  break;
                }
                plannedWaterSwaps.set(
                  region,
                  Object.freeze(waterSwapCandidates.slice(0, swapCount)),
                );
              }
            }
            if (assignmentValid) {
              for (const { cells, targetRegion } of assignments) {
                for (const cell of cells) {
                  regionId[cell] = targetRegion;
                  regionRepairLocked[cell] = 1;
                }
              }
              for (const cells of plannedWaterSwaps.values()) {
                for (const cell of cells) regionId[cell] = sourceRegion;
              }
            }
          }
        }
      }
    }
  }
  const finalCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) finalCounts[region] += 1;
  if (finalCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_REGION_COHERENCE_BALANCE_FAILED');
  }
  const finalTierCounts: [number, number, number] = [0, 0, 0];
  for (const tier of tierId) finalTierCounts[tier - 1] += 1;
  if (finalTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])) {
    fail('GREATER_REALM_TIER_COHERENCE_BALANCE_FAILED');
  }
  // Every outer/middle realm must own more traversable land than the compact
  // throne realm. Grow deficient realms outward from their dominant land body
  // through same-tier political boundaries, then exchange an equal number of
  // non-passable ownership cells with each donor. Geometry and tier totals are
  // untouched; only the natural border follows the usable land more closely.
  const initialPassableTopology = passableRegionTopology(
    grid,
    regionId,
    waterRegime,
    new Uint8Array(grid.cellCount),
  );
  const passableFloor = initialPassableTopology.passableCounts[TIER_III_REGION_INDEX]! + 512;
  const regionsByNeed = Array.from({ length: TIER_I_REGION_COUNT }, (_, region) => region)
    .sort((first, second) => (
      initialPassableTopology.passableCounts[first]!
        - initialPassableTopology.passableCounts[second]!
      || first - second
    ));
  for (const targetRegion of regionsByNeed) {
    const currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const needed = passableFloor - currentTopology.passableCounts[targetRegion]!;
    if (needed <= 0) continue;
    const largestComponent = currentTopology.largestComponentByRegion[targetRegion]!;
    if (largestComponent < 0) continue;
    const donorCapacity = currentTopology.passableCounts.map((count, region) => (
      region === targetRegion
        || GREATER_REALM_REGION_SPECS[region]!.tier
          !== GREATER_REALM_REGION_SPECS[targetRegion]!.tier
        ? 0
        : Math.max(0, count - passableFloor)
    ));
    const seen = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (currentTopology.componentId[cell] !== largestComponent) continue;
      seen[cell] = 1;
      queue[tail++] = cell;
    }
    const annex: number[] = [];
    const donorCounts = new Uint32Array(REGION_COUNT);
    while (head < tail && annex.length < needed) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || seen[neighbor] === 1
          || tierId[neighbor] !== tierId[cell]
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || legacyProtectedCell[neighbor] === 1
          || repairOwnershipImmutable(neighbor)
        ) continue;
        const donor = regionId[neighbor]!;
        if (donor !== targetRegion && donorCapacity[donor]! <= 0) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
        if (donor !== targetRegion) {
          annex.push(neighbor);
          donorCounts[donor] += 1;
          donorCapacity[donor] -= 1;
          if (annex.length >= needed) break;
        }
      }
    }
    if (annex.length < needed) continue;
    const waterSwaps = new Map<number, number[]>();
    const reservedWater = new Set<number>();
    let swapsAvailable = true;
    for (let donor = 0; donor < REGION_COUNT; donor += 1) {
      const swapCount = donorCounts[donor]!;
      if (swapCount === 0) continue;
      const candidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          reservedWater.has(cell)
          || regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
          || repairOwnershipImmutable(cell)
        ) continue;
        candidates.push(cell);
      }
      candidates.sort((first, second) => {
        const contacts = (candidate: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[candidate * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return contacts(second) - contacts(first) || first - second;
      });
      if (candidates.length < swapCount) {
        swapsAvailable = false;
        break;
      }
      const selected = candidates.slice(0, swapCount);
      for (const cell of selected) reservedWater.add(cell);
      waterSwaps.set(donor, selected);
    }
    if (!swapsAvailable) continue;
    for (const cell of annex) regionId[cell] = targetRegion;
    for (const [donor, cells] of waterSwaps) {
      for (const cell of cells) regionId[cell] = donor;
    }
  }
  const noBarrier = new Uint8Array(grid.cellCount);
  const naturalRobustTopology = robustRegionTopology(
    grid,
    regionId,
    waterRegime,
    noBarrier,
  );
  const redundantNaturalEndpoint = (endpoint: number, region: number): boolean => {
    const componentCounts = new Map<number, number>();
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || regionId[neighbor] !== region
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) continue;
      const component = naturalRobustTopology.componentId[neighbor]!;
      if (
        component < 0
        || naturalRobustTopology.componentSizes[component]! < 64
      ) continue;
      componentCounts.set(component, (componentCounts.get(component) ?? 0) + 1);
    }
    return [...componentCounts.values()].some(count => count >= 2);
  };
  const tierBoundary = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || tierId[neighbor] === tierId[cell]) continue;
      tierBoundary[cell] = 1;
      tierBoundary[neighbor] = 1;
    }
  }
  const distanceToTierBoundary = new Uint16Array(grid.cellCount);
  distanceToTierBoundary.fill(0xffff);
  const tierBoundaryQueue = new Uint32Array(grid.cellCount);
  let tierBoundaryHead = 0;
  let tierBoundaryTail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierBoundary[cell] !== 1) continue;
    distanceToTierBoundary[cell] = 0;
    tierBoundaryQueue[tierBoundaryTail++] = cell;
  }
  while (tierBoundaryHead < tierBoundaryTail) {
    const cell = tierBoundaryQueue[tierBoundaryHead++]!;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || tierId[neighbor] !== tierId[cell]
        || distanceToTierBoundary[neighbor] !== 0xffff
      ) continue;
      distanceToTierBoundary[neighbor] = distanceToTierBoundary[cell]! + 1;
      tierBoundaryQueue[tierBoundaryTail++] = neighbor;
    }
  }
  const hasOuterBandWitness = (endpoint: number): boolean => {
    if (
      legacyProtectedCell[endpoint] === 1
      || distanceToTierBoundary[endpoint] !== 0
    ) return false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const shoulder = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        shoulder < 0
        || tierId[shoulder] !== tierId[endpoint]
        || legacyProtectedCell[shoulder] === 1
        || distanceToTierBoundary[shoulder] >= 2
      ) continue;
      for (let exitDirection = 0; exitDirection < HEX_NEIGHBOR_COUNT; exitDirection += 1) {
        const exit = grid.neighbors[shoulder * HEX_NEIGHBOR_COUNT + exitDirection]!;
        if (
          exit >= 0
          && tierId[exit] === tierId[endpoint]
          && legacyProtectedCell[exit] === 0
          && distanceToTierBoundary[exit]! >= 2
        ) return true;
      }
    }
    return false;
  };
  const dryComponentSize = new Uint32Array(grid.cellCount);
  for (let region = 0; region < REGION_COUNT; region += 1) {
    const dryRegion = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (regionId[cell] === region && waterRegime[cell] === WATER_DRY) {
        dryRegion[cell] = 1;
      }
    }
    for (const component of connectedComponents(grid, dryRegion)) {
      for (const cell of component) dryComponentSize[cell] = component.length;
    }
  }
  const contactScores = Array.from({ length: TIER_I_REGION_COUNT }, () => (
    new Uint32Array(TIER_II_REGION_COUNT)
  ));
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
      const first = regionId[cell]! < TIER_I_REGION_COUNT ? cell : neighbor;
      const second = first === cell ? neighbor : cell;
      const child = regionId[first]!;
      const parent = regionId[second]!;
      if (child >= TIER_I_REGION_COUNT || parent < 6 || parent > 8) continue;
      if (
        waterRegime[first] !== 0
        || waterRegime[second] !== 0
        || legacyProtectedCell[first] === 1
        || legacyProtectedCell[second] === 1
      ) continue;
      const durable = dryComponentSize[first]! >= 64
        && dryComponentSize[second]! >= 64;
      if (!hasOuterBandWitness(first) || !hasOuterBandWitness(second)) continue;
      const redundant = redundantNaturalEndpoint(first, child)
        && redundantNaturalEndpoint(second, parent);
      if (redundant) contactScores[child]![parent - 6] += 10_001;
      else if (durable) contactScores[child]![parent - 6] += 101;
    }
  }
  const provisionalParent = new Uint8Array(TIER_I_REGION_COUNT);
  for (const [child, parent] of strategy.gateGraph) {
    if (child < TIER_I_REGION_COUNT && parent >= 6 && parent <= 8) {
      provisionalParent[child] = parent;
    }
  }
  let bestAssignment: readonly number[] | undefined;
  let bestBottleneck = -1;
  let bestTotal = -1;
  let bestProvisionalMatches = -1;
  // 3^6 is a tiny, fixed search. Enforce two children per T2 parent and choose
  // the graph with the strongest real dry saddle contacts after coherence
  // repair; the former basin parent is retained as a deterministic tie-break.
  for (let encoded = 0; encoded < 729; encoded += 1) {
    let cursor = encoded;
    const assignment = Array<number>(TIER_I_REGION_COUNT).fill(0);
    const counts = [0, 0, 0];
    let bottleneck = Number.POSITIVE_INFINITY;
    let total = 0;
    let provisionalMatches = 0;
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      const parentOffset = cursor % 3;
      cursor = Math.floor(cursor / 3);
      assignment[child] = parentOffset + 6;
      counts[parentOffset] += 1;
      const score = contactScores[child]![parentOffset]!;
      bottleneck = Math.min(bottleneck, score);
      total += score;
      if (provisionalParent[child] === parentOffset + 6) provisionalMatches += 1;
    }
    if (counts.some(count => count !== 2)) continue;
    if (
      bottleneck > bestBottleneck
      || (bottleneck === bestBottleneck && total > bestTotal)
      || (
        bottleneck === bestBottleneck
        && total === bestTotal
        && provisionalMatches > bestProvisionalMatches
      )
    ) {
      bestAssignment = assignment;
      bestBottleneck = bottleneck;
      bestTotal = total;
      bestProvisionalMatches = provisionalMatches;
    }
  }
  if (!bestAssignment) fail('GREATER_REALM_GATE_PARENT_ASSIGNMENT_FAILED');
  const gateGraph: GreaterRealmGateGraphEdge[] = [];
  for (let parent = 6; parent <= 8; parent += 1) {
    for (let child = 0; child < TIER_I_REGION_COUNT; child += 1) {
      if (bestAssignment[child] === parent) {
        gateGraph.push(Object.freeze([child, parent] as const));
      }
    }
  }
  gateGraph.push(
    Object.freeze([6, 9] as const),
    Object.freeze([7, 9] as const),
    Object.freeze([8, 9] as const),
  );
  const minimumGateFootholdCells = 512;
  const growGateFoothold = (endpoint: number, targetRegion: number): boolean => {
    let currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const component = currentTopology.componentId[endpoint]!;
    if (component < 0) return false;
    if (currentTopology.componentSizes[component]! >= minimumGateFootholdCells) return true;
    if (targetRegion >= TIER_I_REGION_COUNT && targetRegion < TIER_III_REGION_INDEX) {
      return false;
    }
    const seen = new Uint8Array(grid.cellCount);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (currentTopology.componentId[cell] !== component) continue;
      seen[cell] = 1;
      queue[tail++] = cell;
    }
    const annex: number[] = [];
    const donorCounts = new Uint32Array(REGION_COUNT);
    while (head < tail && tail < minimumGateFootholdCells) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || seen[neighbor] === 1
          || tierId[neighbor] !== tierId[endpoint]
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || legacyProtectedCell[neighbor] === 1
          || repairOwnershipImmutable(neighbor)
        ) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
        if (regionId[neighbor] !== targetRegion) {
          annex.push(neighbor);
          donorCounts[regionId[neighbor]!] += 1;
        }
        if (tail >= minimumGateFootholdCells) break;
      }
    }
    if (tail < minimumGateFootholdCells) return false;
    const waterSwaps = new Map<number, number[]>();
    const reservedWater = new Set<number>();
    for (let donor = 0; donor < REGION_COUNT; donor += 1) {
      const needed = donorCounts[donor]!;
      if (needed === 0) continue;
      const candidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          reservedWater.has(cell)
          || regionId[cell] !== targetRegion
          || strategicallyPassableSurface(waterRegime[cell]!)
          || legacyProtectedCell[cell] === 1
          || repairOwnershipImmutable(cell)
        ) continue;
        candidates.push(cell);
      }
      candidates.sort((first, second) => {
        const contacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return contacts(second) - contacts(first) || first - second;
      });
      if (candidates.length < needed) return false;
      const selected = candidates.slice(0, needed);
      for (const cell of selected) reservedWater.add(cell);
      waterSwaps.set(donor, selected);
    }
    for (const cell of annex) regionId[cell] = targetRegion;
    for (const [donor, cells] of waterSwaps) {
      for (const cell of cells) regionId[cell] = donor;
    }
    currentTopology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const grownComponent = currentTopology.componentId[endpoint]!;
    return grownComponent >= 0
      && currentTopology.componentSizes[grownComponent]! >= minimumGateFootholdCells;
  };
  const createBorrowedGateFoothold = (
    targetRegion: number,
    adjacentRegion: number,
  ): boolean => {
    if (targetRegion >= TIER_I_REGION_COUNT && targetRegion < TIER_III_REGION_INDEX) {
      return false;
    }
    const topology = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const boundarySeeds: number[] = [];
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        tierId[cell] !== GREATER_REALM_REGION_SPECS[targetRegion]!.tier
        || regionId[cell] === targetRegion
        || waterRegime[cell] !== 0
        || legacyProtectedCell[cell] === 1
        || regionRepairLocked[cell] === 1
      ) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && regionId[neighbor] === adjacentRegion
          && waterRegime[neighbor] === 0
        ) {
          boundarySeeds.push(cell);
          break;
        }
      }
    }
    boundarySeeds.sort((first, second) => {
      const firstSize = topology.componentSizes[topology.componentId[first]!] ?? 0;
      const secondSize = topology.componentSizes[topology.componentId[second]!] ?? 0;
      return secondSize - firstSize || first - second;
    });
    for (const seed of boundarySeeds.slice(0, 256)) {
      const donor = regionId[seed]!;
      const donorComponent = topology.componentId[seed]!;
      if (donorComponent < 0 || topology.componentSizes[donorComponent]! < 2_048) continue;
      const seen = new Uint8Array(grid.cellCount);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      seen[seed] = 1;
      queue[tail++] = seed;
      while (head < tail && tail < minimumGateFootholdCells) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || seen[neighbor] === 1
            || regionId[neighbor] !== donor
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
            || legacyProtectedCell[neighbor] === 1
            || regionRepairLocked[neighbor] === 1
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
          if (tail >= minimumGateFootholdCells) break;
        }
      }
      if (tail < minimumGateFootholdCells) continue;
      const patch = Array.from(queue.slice(0, minimumGateFootholdCells));
      let dryContacts = 0;
      for (const cell of patch) {
        if (waterRegime[cell] !== 0) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && regionId[neighbor] === adjacentRegion
            && waterRegime[neighbor] === 0
          ) dryContacts += 1;
        }
      }
      if (dryContacts < 2) continue;
      const waterSwapCandidates: number[] = [];
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] === targetRegion
          && !strategicallyPassableSurface(waterRegime[cell]!)
          && legacyProtectedCell[cell] === 0
          && !repairOwnershipImmutable(cell)
        ) waterSwapCandidates.push(cell);
      }
      if (waterSwapCandidates.length < patch.length) continue;
      waterSwapCandidates.sort((first, second) => {
        const donorContacts = (cell: number) => {
          let count = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && regionId[neighbor] === donor) count += 1;
          }
          return count;
        };
        return donorContacts(second) - donorContacts(first) || first - second;
      });
      for (const cell of patch) {
        regionId[cell] = targetRegion;
        regionRepairLocked[cell] = 1;
      }
      for (let index = 0; index < patch.length; index += 1) {
        regionId[waterSwapCandidates[index]!] = donor;
      }
      const postBorrowTopology = passableRegionTopology(
        grid,
        regionId,
        waterRegime,
        new Uint8Array(grid.cellCount),
      );
      const donorMinimumShare = donor < TIER_I_REGION_COUNT
        ? donor === 4 ? 6_500 : 8_500
        : donor < TIER_III_REGION_INDEX ? 9_000 : 9_500;
      if (postBorrowTopology.largestSharesBasisPoints[donor]! < donorMinimumShare) {
        // A gate district must be borrowed from a shoreline, not carved as a
        // stripe through the donor's dominant body. Reject any patch that
        // would split that realm below its strict coherence margin.
        for (const cell of patch) {
          regionId[cell] = donor;
          regionRepairLocked[cell] = 0;
        }
        for (let index = 0; index < patch.length; index += 1) {
          regionId[waterSwapCandidates[index]!] = targetRegion;
        }
        continue;
      }
      return true;
    }
    return false;
  };
  for (const [firstRegion, secondRegion] of gateGraph) {
    let topologyAtGate = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    const edges: Array<readonly [number, number]> = [];
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor <= cell || waterRegime[cell] !== 0 || waterRegime[neighbor] !== 0) continue;
        if (
          regionId[cell] === firstRegion
          && regionId[neighbor] === secondRegion
        ) edges.push(Object.freeze([cell, neighbor] as const));
        else if (
          regionId[cell] === secondRegion
          && regionId[neighbor] === firstRegion
        ) edges.push(Object.freeze([neighbor, cell] as const));
      }
    }
    edges.sort((first, second) => {
      const strength = (edge: readonly [number, number]) => Math.min(
        topologyAtGate.componentSizes[topologyAtGate.componentId[edge[0]!]!] ?? 0,
        topologyAtGate.componentSizes[topologyAtGate.componentId[edge[1]!]!] ?? 0,
      );
      return strength(second) - strength(first) || first[0] - second[0] || first[1] - second[1];
    });
    let edge = edges[0];
    if (!edge) {
      createBorrowedGateFoothold(firstRegion, secondRegion);
      topologyAtGate = passableRegionTopology(
        grid,
        regionId,
        waterRegime,
        new Uint8Array(grid.cellCount),
      );
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor <= cell || waterRegime[cell] !== 0 || waterRegime[neighbor] !== 0) continue;
          if (regionId[cell] === firstRegion && regionId[neighbor] === secondRegion) {
            edges.push(Object.freeze([cell, neighbor] as const));
          } else if (regionId[cell] === secondRegion && regionId[neighbor] === firstRegion) {
            edges.push(Object.freeze([neighbor, cell] as const));
          }
        }
      }
      edges.sort((first, second) => {
        const strength = (candidate: readonly [number, number]) => Math.min(
          topologyAtGate.componentSizes[topologyAtGate.componentId[candidate[0]!]!] ?? 0,
          topologyAtGate.componentSizes[topologyAtGate.componentId[candidate[1]!]!] ?? 0,
        );
        return strength(second) - strength(first)
          || first[0] - second[0]
          || first[1] - second[1];
      });
      edge = edges[0];
    }
    if (!edge) continue;
    if (!growGateFoothold(edge[0], firstRegion)) {
      createBorrowedGateFoothold(firstRegion, secondRegion);
    }
    topologyAtGate = passableRegionTopology(
      grid,
      regionId,
      waterRegime,
      new Uint8Array(grid.cellCount),
    );
    // The opposite endpoint remains adjacent after a same-tier foothold edit.
    if (!growGateFoothold(edge[1], secondRegion)) {
      createBorrowedGateFoothold(secondRegion, firstRegion);
    }
  }
  const balancedCounts = Array<number>(REGION_COUNT).fill(0);
  const balancedTierCounts = [0, 0, 0];
  for (const region of regionId) balancedCounts[region] += 1;
  for (const tier of tierId) balancedTierCounts[tier - 1] += 1;
  if (balancedCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_GATE_FOOTHOLD_BALANCE_FAILED');
  }
  if (balancedTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])) {
    fail('GREATER_REALM_GATE_FOOTHOLD_TIER_BALANCE_FAILED');
  }
  assertTierTwoCapacityAuthority({
    grid,
    tierId,
    regionId,
    waterRegime,
    tierTwoPassableOwner,
    tierTwoSpineOwner,
  });
  if (repairImmutableCell) {
    assertGreaterRealmRepairOwnershipUnchanged({
      immutableCell: repairImmutableCell,
      originalTierId: strategy.tierId,
      originalRegionId: strategy.regionId,
      tierId,
      regionId,
    });
  }
  return Object.freeze({
    ...strategy,
    tierId,
    regionId,
    regionCounts: Object.freeze(balancedCounts),
    gateGraph: Object.freeze(gateGraph),
  });
}

type GreaterRealmPassableRegionTopology = Readonly<{
  componentId: Int32Array;
  componentSizes: readonly number[];
  largestComponentByRegion: readonly number[];
  passableCounts: readonly number[];
  largestCounts: readonly number[];
  largestSharesBasisPoints: readonly number[];
  proof: boolean;
}>;

type GreaterRealmRobustRegionTopology = Readonly<{
  articulation: Uint8Array;
  componentId: Int32Array;
  componentSizes: readonly number[];
}>;

function strategicallyPassableSurface(waterRegime: number): boolean {
  // Ocean/lake cells require future naval or bridge mechanics. River and
  // stream corridors are retained as fordable route surfaces for topology;
  // castle and gate endpoint suitability still requires a dry cell.
  return waterRegime === 0 || waterRegime === 3 || waterRegime === 4;
}

function assertTierTwoCapacityAuthority(input: Readonly<{
  grid: IndexedAxialGrid;
  tierId: Uint8Array;
  regionId: Uint8Array;
  waterRegime: Uint8Array;
  tierTwoPassableOwner: Int8Array;
  tierTwoSpineOwner: Int8Array;
  barrier?: Uint8Array;
}>): void {
  const reject = (reason: GreaterRealmTierTwoCapacityRejectionReason): never => (
    rejectGreaterRealmTierTwoCapacity(reason)
  );
  const { grid } = input;
  if (
    input.tierId.length !== grid.cellCount
    || input.regionId.length !== grid.cellCount
    || input.waterRegime.length !== grid.cellCount
    || input.tierTwoPassableOwner.length !== grid.cellCount
    || input.tierTwoSpineOwner.length !== grid.cellCount
    || (input.barrier !== undefined && input.barrier.length !== grid.cellCount)
  ) reject('AUTHORITY_SHAPE_INVALID');
  const spineMasks = Array.from({ length: TIER_II_REGION_COUNT }, () => (
    new Uint8Array(grid.cellCount)
  ));
  const spineCounts = new Uint32Array(TIER_II_REGION_COUNT);
  const touchesOuter = new Uint8Array(TIER_II_REGION_COUNT);
  const touchesInner = new Uint8Array(TIER_II_REGION_COUNT);
  try {
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const passableOwner = input.tierTwoPassableOwner[cell]!;
    if (passableOwner >= 0) {
      if (
        passableOwner < TIER_I_REGION_COUNT
        || passableOwner >= TIER_III_REGION_INDEX
        || input.tierId[cell] !== 2
        || input.regionId[cell] !== passableOwner
        || !strategicallyPassableSurface(input.waterRegime[cell]!)
      ) reject('AUTHORITY_PASSABLE_OWNERSHIP_INVALID');
    }
    const spineOwner = input.tierTwoSpineOwner[cell]!;
    if (spineOwner < 0) continue;
    if (
      spineOwner < TIER_I_REGION_COUNT
      || spineOwner >= TIER_III_REGION_INDEX
      || passableOwner !== spineOwner
      || input.tierId[cell] !== 2
      || input.regionId[cell] !== spineOwner
      || !strategicallyPassableSurface(input.waterRegime[cell]!)
    ) reject('AUTHORITY_SPINE_OWNERSHIP_INVALID');
    const parent = spineOwner - TIER_I_REGION_COUNT;
    spineMasks[parent]![cell] = 1;
    spineCounts[parent] += 1;
    let crossTierAdjacent = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || input.tierId[neighbor] === 2) continue;
      crossTierAdjacent = true;
      if (input.waterRegime[neighbor] !== WATER_DRY) continue;
      if (input.tierId[neighbor] === 1) touchesOuter[parent] = 1;
      else if (input.tierId[neighbor] === 3) touchesInner[parent] = 1;
    }
    if (
      input.barrier !== undefined
      && !crossTierAdjacent
      && input.barrier[cell] !== 0
    ) reject('AUTHORITY_BARRIER_FRONTIER_INVALID');
  }
  for (let parent = 0; parent < TIER_II_REGION_COUNT; parent += 1) {
    if (
      spineCounts[parent] === 0
      || touchesOuter[parent] !== 1
      || touchesInner[parent] !== 1
    ) reject('AUTHORITY_SPINE_FRONTIER_INVALID');
    const components = connectedComponents(grid, spineMasks[parent]!);
    if (components.length !== 1 || components[0]!.length !== spineCounts[parent]) {
      reject('AUTHORITY_SPINE_CONNECTIVITY_INVALID');
    }
  }
  } finally {
    for (const mask of spineMasks) mask.fill(0);
    spineCounts.fill(0);
    touchesOuter.fill(0);
    touchesInner.fill(0);
  }
}

function passableRegionTopology(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
): GreaterRealmPassableRegionTopology {
  const componentId = new Int32Array(grid.cellCount);
  componentId.fill(-1);
  const componentSizes: number[] = [];
  const largestComponentByRegion = Array<number>(REGION_COUNT).fill(-1);
  const passableCounts = Array<number>(REGION_COUNT).fill(0);
  const largestCounts = Array<number>(REGION_COUNT).fill(0);
  const queue = new Uint32Array(grid.cellCount);
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (!strategicallyPassableSurface(waterRegime[start]!) || barrier[start] !== 0) continue;
    const region = regionId[start]!;
    passableCounts[region] += 1;
    if (componentId[start] >= 0) continue;
    const id = componentSizes.length;
    let head = 0;
    let tail = 0;
    let size = 0;
    componentId[start] = id;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      size += 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || componentId[neighbor] >= 0
          || regionId[neighbor] !== region
          || !strategicallyPassableSurface(waterRegime[neighbor]!)
          || barrier[neighbor] !== 0
        ) continue;
        componentId[neighbor] = id;
        queue[tail++] = neighbor;
      }
    }
    componentSizes.push(size);
    if (size > largestCounts[region]!) {
      largestCounts[region] = size;
      largestComponentByRegion[region] = id;
    }
  }
  // The first pass counted only component roots for cells seen later. Derive
  // exact totals independently from the final passability mask.
  passableCounts.fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (strategicallyPassableSurface(waterRegime[cell]!) && barrier[cell] === 0) {
      passableCounts[regionId[cell]!] += 1;
    }
  }
  const largestSharesBasisPoints = passableCounts.map((count, region) => (
    count === 0 ? 0 : Math.round((largestCounts[region]! * 10_000) / count)
  ));
  const proof = largestSharesBasisPoints.every((share, region) => (
    region < TIER_I_REGION_COUNT ? share >= (region === 4 ? 5_500 : 8_000)
      : region < TIER_III_REGION_INDEX ? share >= 8_500
        : share >= 9_000
  ));
  return Object.freeze({
    componentId,
    componentSizes: Object.freeze(componentSizes),
    largestComponentByRegion: Object.freeze(largestComponentByRegion),
    passableCounts: Object.freeze(passableCounts),
    largestCounts: Object.freeze(largestCounts),
    largestSharesBasisPoints: Object.freeze(largestSharesBasisPoints),
    proof,
  });
}

/**
 * Derive disjoint, vertex-biconnected regional cores from the final
 * passability graph. Tarjan blocks retain a genuinely articulation-free core
 * even when a harmless spur is attached to it. Because articulation vertices
 * can belong to several blocks, each is owned by its largest incident block
 * (stable block id breaks ties) and every conflicting block is discarded.
 * The remaining component ids therefore describe complete, non-overlapping
 * biconnected subgraphs rather than the fragments produced by deleting the
 * original graph's articulation vertices only once.
 */
function robustRegionTopology(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
): GreaterRealmRobustRegionTopology {
  const discovery = new Int32Array(grid.cellCount);
  const low = new Int32Array(grid.cellCount);
  const parent = new Int32Array(grid.cellCount);
  const nextNeighbor = new Uint8Array(grid.cellCount);
  const childCount = new Uint8Array(grid.cellCount);
  const articulation = new Uint8Array(grid.cellCount);
  const edgeFirst: number[] = [];
  const edgeSecond: number[] = [];
  const blocks: number[][] = [];
  const blockMark = new Uint32Array(grid.cellCount);
  let blockGeneration = 0;
  discovery.fill(-1);
  parent.fill(-1);
  let clock = 0;
  const passable = (cell: number) => (
    strategicallyPassableSurface(waterRegime[cell]!)
    && barrier[cell] === 0
  );
  for (let root = 0; root < grid.cellCount; root += 1) {
    if (!passable(root) || discovery[root] >= 0) continue;
    const stack: number[] = [root];
    discovery[root] = clock;
    low[root] = clock;
    clock += 1;
    while (stack.length > 0) {
      const cell = stack[stack.length - 1]!;
      const direction = nextNeighbor[cell]!;
      if (direction < HEX_NEIGHBOR_COUNT) {
        nextNeighbor[cell] = direction + 1;
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || regionId[neighbor] !== regionId[cell]
          || !passable(neighbor)
        ) continue;
        if (discovery[neighbor] < 0) {
          parent[neighbor] = cell;
          childCount[cell] += 1;
          edgeFirst.push(cell);
          edgeSecond.push(neighbor);
          discovery[neighbor] = clock;
          low[neighbor] = clock;
          clock += 1;
          stack.push(neighbor);
          continue;
        }
        if (neighbor !== parent[cell] && discovery[neighbor]! < discovery[cell]!) {
          edgeFirst.push(cell);
          edgeSecond.push(neighbor);
          low[cell] = Math.min(low[cell]!, discovery[neighbor]!);
        }
        continue;
      }
      stack.pop();
      const ancestor = parent[cell]!;
      if (ancestor < 0) {
        if (childCount[cell]! > 1) articulation[cell] = 1;
        if (childCount[cell] === 0) blocks.push([cell]);
        continue;
      }
      low[ancestor] = Math.min(low[ancestor]!, low[cell]!);
      if (low[cell]! < discovery[ancestor]!) continue;
      if (parent[ancestor]! >= 0) articulation[ancestor] = 1;
      blockGeneration += 1;
      if (blockGeneration === 0xffff_ffff) fail('GREATER_REALM_BICONNECTED_MARK_OVERFLOW');
      const vertices: number[] = [];
      let foundTreeEdge = false;
      while (edgeFirst.length > 0) {
        const second = edgeSecond.pop()!;
        const first = edgeFirst.pop()!;
        if (blockMark[first] !== blockGeneration) {
          blockMark[first] = blockGeneration;
          vertices.push(first);
        }
        if (blockMark[second] !== blockGeneration) {
          blockMark[second] = blockGeneration;
          vertices.push(second);
        }
        if (first === ancestor && second === cell) {
          foundTreeEdge = true;
          break;
        }
      }
      if (!foundTreeEdge) fail('GREATER_REALM_BICONNECTED_EDGE_STACK_CORRUPT');
      vertices.sort((first, second) => first - second);
      blocks.push(vertices);
    }
  }
  if (edgeFirst.length !== 0 || edgeSecond.length !== 0) {
    fail('GREATER_REALM_BICONNECTED_EDGE_STACK_NOT_EMPTY');
  }

  // An articulation may participate in multiple valid blocks. Give it to one
  // deterministic largest block, then discard every block that would be
  // incomplete without that vertex. Kept cores are therefore complete
  // biconnected induced subgraphs and can safely use a single component id.
  const articulationOwner = new Int32Array(grid.cellCount);
  articulationOwner.fill(-1);
  for (let block = 0; block < blocks.length; block += 1) {
    for (const cell of blocks[block]!) {
      if (articulation[cell] !== 1) continue;
      const current = articulationOwner[cell]!;
      if (
        current < 0
        || blocks[block]!.length > blocks[current]!.length
        || (blocks[block]!.length === blocks[current]!.length && block < current)
      ) articulationOwner[cell] = block;
    }
  }
  const componentId = new Int32Array(grid.cellCount);
  componentId.fill(-1);
  const componentSizes: number[] = [];
  for (let block = 0; block < blocks.length; block += 1) {
    const vertices = blocks[block]!;
    if (vertices.some(cell => (
      articulation[cell] === 1 && articulationOwner[cell] !== block
    ))) continue;
    const id = componentSizes.length;
    for (const cell of vertices) {
      if (componentId[cell] >= 0) fail('GREATER_REALM_BICONNECTED_CORE_OVERLAP');
      componentId[cell] = id;
    }
    componentSizes.push(vertices.length);
  }
  return Object.freeze({
    articulation,
    componentId,
    componentSizes: Object.freeze(componentSizes),
  });
}

export type GreaterRealmStrategicShapeMetrics = Readonly<{
  minorFragmentSharesBasisPoints: readonly number[];
  semanticInterfaceDensityBasisPoints: readonly number[];
  immutablePerimeterDensityBasisPoints: readonly number[];
  tendrilSharesBasisPoints: readonly number[];
  tierRadialAgreementBasisPoints: number;
  radialTierOneBoundaryShareBasisPoints: number;
  fragmentationProof: boolean;
  compactnessProof: boolean;
  tendrilProof: boolean;
  nonRadialProof: boolean;
}>;

function strategicShapeMetrics(
  grid: IndexedAxialGrid,
  tierId: Uint8Array,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  topology: GreaterRealmPassableRegionTopology,
): GreaterRealmStrategicShapeMetrics {
  const minorCells = Array<number>(REGION_COUNT).fill(0);
  const componentRegion = Array<number>(topology.componentSizes.length).fill(-1);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const component = topology.componentId[cell]!;
    if (component >= 0 && componentRegion[component] === -1) {
      componentRegion[component] = regionId[cell]!;
    }
  }
  for (let component = 0; component < topology.componentSizes.length; component += 1) {
    if (topology.componentSizes[component]! >= 64) continue;
    const region = componentRegion[component]!;
    if (region >= 0) minorCells[region] += topology.componentSizes[component]!;
  }
  const semanticInterfaceSides = Array<number>(REGION_COUNT).fill(0);
  const immutablePerimeterSides = Array<number>(REGION_COUNT).fill(0);
  const tendrils = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!strategicallyPassableSurface(waterRegime[cell]!) || barrier[cell] !== 0) continue;
    const region = regionId[cell]!;
    let sameRegionNeighbors = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === region
        && strategicallyPassableSurface(waterRegime[neighbor]!)
        && barrier[neighbor] === 0
      ) sameRegionNeighbors += 1;
      else if (
        neighbor < 0
        || barrier[neighbor] !== 0
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) immutablePerimeterSides[region] += 1;
      else semanticInterfaceSides[region] += 1;
    }
    if (sameRegionNeighbors <= 1) tendrils[region] += 1;
  }
  const minorFragmentSharesBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0 ? 10_000 : Math.round((minorCells[region]! * 10_000) / count)
  ));
  const semanticInterfaceDensityBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0
      ? 10_000
      : Math.round(
        (semanticInterfaceSides[region]! * 10_000)
          / (count * HEX_NEIGHBOR_COUNT),
      )
  ));
  const immutablePerimeterDensityBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0
      ? 10_000
      : Math.round(
        (immutablePerimeterSides[region]! * 10_000)
          / (count * HEX_NEIGHBOR_COUNT),
      )
  ));
  const tendrilSharesBasisPoints = topology.passableCounts.map((count, region) => (
    count === 0 ? 10_000 : Math.round((tendrils[region]! * 10_000) / count)
  ));

  let tierThreeQ = 0;
  let tierThreeR = 0;
  let tierThreeCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 3) continue;
    tierThreeQ += grid.q[cell]!;
    tierThreeR += grid.r[cell]!;
    tierThreeCells += 1;
  }
  const roundedRatio = (numerator: number, denominator: number) => numerator >= 0
    ? Math.floor((numerator * 2 + denominator) / (denominator * 2))
    : -Math.floor((-numerator * 2 + denominator) / (denominator * 2));
  const centerQ = roundedRatio(tierThreeQ, tierThreeCells);
  const centerR = roundedRatio(tierThreeR, tierThreeCells);
  const radialTierCounts = new Map<number, [number, number, number]>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const radius = axialDistance(grid.q[cell]!, grid.r[cell]!, centerQ, centerR);
    const counts = radialTierCounts.get(radius) ?? [0, 0, 0];
    counts[tierId[cell]! - 1] += 1;
    radialTierCounts.set(radius, counts);
  }
  let radialModalCells = 0;
  for (const counts of radialTierCounts.values()) radialModalCells += Math.max(...counts);
  const tierRadialAgreementBasisPoints = Math.round(
    (radialModalCells * 10_000) / grid.cellCount,
  );
  let tierOneBoundaryEdges = 0;
  let radialTierOneBoundaryEdges = 0;
  const centerX = 2 * centerQ + centerR;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierId[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[neighbor] !== 1
        || regionId[neighbor] === regionId[cell]
      ) continue;
      tierOneBoundaryEdges += 1;
      const midpointX = (2 * grid.q[cell]! + grid.r[cell]!)
        + (2 * grid.q[neighbor]! + grid.r[neighbor]!)
        - 2 * centerX;
      const midpointR = grid.r[cell]! + grid.r[neighbor]! - 2 * centerR;
      const deltaQ = grid.q[neighbor]! - grid.q[cell]!;
      const deltaR = grid.r[neighbor]! - grid.r[cell]!;
      const edgeX = 2 * deltaQ + deltaR;
      const dot = midpointX * edgeX + 3 * midpointR * deltaR;
      const radialNorm = midpointX * midpointX + 3 * midpointR * midpointR;
      const edgeNorm = edgeX * edgeX + 3 * deltaR * deltaR;
      if (
        BigInt(dot) * BigInt(dot) * 100n
        <= BigInt(radialNorm) * BigInt(edgeNorm) * 16n
      ) radialTierOneBoundaryEdges += 1;
    }
  }
  const radialTierOneBoundaryShareBasisPoints = tierOneBoundaryEdges === 0
    ? 10_000
    : Math.round((radialTierOneBoundaryEdges * 10_000) / tierOneBoundaryEdges);
  return Object.freeze({
    minorFragmentSharesBasisPoints: Object.freeze(minorFragmentSharesBasisPoints),
    semanticInterfaceDensityBasisPoints:
      Object.freeze(semanticInterfaceDensityBasisPoints),
    immutablePerimeterDensityBasisPoints:
      Object.freeze(immutablePerimeterDensityBasisPoints),
    tendrilSharesBasisPoints: Object.freeze(tendrilSharesBasisPoints),
    tierRadialAgreementBasisPoints,
    radialTierOneBoundaryShareBasisPoints,
    fragmentationProof: minorFragmentSharesBasisPoints.every((share, region) => (
      share <= (region === 4 ? 500 : 300)
    )),
    compactnessProof:
      semanticInterfaceDensityBasisPoints.every(share => share <= 1_000),
    tendrilProof: tendrilSharesBasisPoints.every(share => share <= 150),
    nonRadialProof: tierRadialAgreementBasisPoints <= 9_200
      && radialTierOneBoundaryShareBasisPoints <= 4_500,
  });
}

export function measureGreaterRealmStrategicShape(input: Readonly<{
  grid: IndexedAxialGrid;
  tierId: Uint8Array;
  regionId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
}>): GreaterRealmStrategicShapeMetrics & Readonly<{
  passableRegionProof: boolean;
  largestPassableRegionSharesBasisPoints: readonly number[];
}> {
  const topology = passableRegionTopology(
    input.grid,
    input.regionId,
    input.waterRegime,
    input.barrier,
  );
  return Object.freeze({
    ...strategicShapeMetrics(
      input.grid,
      input.tierId,
      input.regionId,
      input.waterRegime,
      input.barrier,
      topology,
    ),
    passableRegionProof: topology.proof,
    largestPassableRegionSharesBasisPoints: topology.largestSharesBasisPoints,
  });
}

type GreaterRealmGeneratedWaterSurface = Readonly<{
  waterRegime: Uint8Array;
  majorRiverCount: number;
  minorStreamCount: number;
  lakeCount: number;
  lakeBasinCandidates: number;
  riverMouthCandidates: number;
  streamHeadCandidates: number;
}>;

type GreaterRealmGeneratedSurfaceVisuals = Readonly<{
  biomeId: Uint8Array;
  landformId: Uint8Array;
}>;

type GreaterRealmGeneratedSurface = Readonly<
  GreaterRealmGeneratedWaterSurface & GreaterRealmGeneratedSurfaceVisuals
>;

type GreaterRealmLegacySurfacePlacement = Readonly<Pick<
  GreaterRealmLegacyPlacement,
  'transform' | 'protectedCell' | 'castleSlot'
>>;

/**
 * Materialize generated water independently from strategic tier labels.
 * Moving this call is intentionally deferred: this prerequisite preserves the
 * historical generation order while giving a later water-first revision one
 * exact, tier-free authority boundary.
 */
function deriveGreaterRealmGeneratedWaterSurface(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  filledElevation: Int32Array,
  flowReceiver: Int32Array,
  accumulation: BigUint64Array,
  legacyProtectedCell: Uint8Array,
): GreaterRealmGeneratedWaterSurface {
  let lakeCandidate: Uint8Array | undefined;
  let belowSea: Uint8Array | undefined;
  let majorRiverNetwork: Uint8Array | undefined;
  let minorStreamNetwork: Uint8Array | undefined;
  let waterRegime: Uint8Array | undefined;
  let inlandSeaCells: Set<number> | undefined;
  let allLakeComponents: number[][] | undefined;
  let majorRiverComponents: number[][] | undefined;
  let belowSeaComponents: number[][] | undefined;
  let selectedLakes: Array<readonly number[]> | undefined;
  let completed = false;
  try {
    lakeCandidate = new Uint8Array(grid.cellCount);
    belowSea = new Uint8Array(grid.cellCount);
    majorRiverNetwork = new Uint8Array(grid.cellCount);
    minorStreamNetwork = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (elevation[cell]! <= SEA_LEVEL) belowSea[cell] = 1;
      if (
        legacyProtectedCell[cell] !== 1 &&
        elevation[cell]! > SEA_LEVEL &&
        filledElevation[cell]! - elevation[cell]! >= 80
      ) {
        lakeCandidate[cell] = 1;
      }
      if (legacyProtectedCell[cell] === 1 || elevation[cell]! <= SEA_LEVEL)
        continue;
      const discharge = Number(accumulation[cell]!);
      if (discharge >= MAJOR_RIVER_DISCHARGE) majorRiverNetwork[cell] = 1;
      else if (discharge >= 96) minorStreamNetwork[cell] = 1;
    }
    allLakeComponents = connectedComponentsAtEqualSurface(
      grid,
      lakeCandidate,
      filledElevation,
      true,
    );
    allLakeComponents.sort(
      (first, second) => second.length - first.length || first[0]! - second[0]!,
    );
    majorRiverComponents = connectedComponents(grid, majorRiverNetwork, true);
    const majorRiverCount = majorRiverComponents.length;
    let minorStreamCount = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (minorStreamNetwork[cell] !== 1) continue;
      let hasUpstreamStream = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0 &&
          minorStreamNetwork[neighbor] === 1 &&
          flowReceiver[neighbor] === cell
        ) {
          hasUpstreamStream = true;
          break;
        }
      }
      if (!hasUpstreamStream) minorStreamCount += 1;
    }
    const generatedWaterRegime = new Uint8Array(grid.cellCount);
    waterRegime = generatedWaterRegime;
    let existingMajorBodies = 0;
    belowSeaComponents = connectedComponents(grid, belowSea, true);
    for (const component of belowSeaComponents) {
      const touchesActiveBoundary = component.some((cell) => {
        for (
          let direction = 0;
          direction < HEX_NEIGHBOR_COUNT;
          direction += 1
        ) {
          if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1)
            return true;
        }
        return false;
      });
      const regime = touchesActiveBoundary
        ? WATER_OCEAN
        : component.length >= 48
          ? WATER_SEA
          : WATER_LAKE;
      if (regime === WATER_OCEAN || regime === WATER_SEA)
        existingMajorBodies += 1;
      for (const cell of component) generatedWaterRegime[cell] = regime;
    }
    const targetMajorBodies =
      4 +
      (greaterRealmCounterRandomU32(
        candidateSeed,
        greaterRealmTerrainChannelId('inland-sea-body-count'),
        0,
        0,
      ) %
        3);
    const inlandSeaComponents =
      selectGreaterRealmCompatibleStandingWaterComponents({
        grid,
        rankedComponents: allLakeComponents,
        elevation,
        filledElevation,
        waterRegime: generatedWaterRegime,
        maximumCount: Math.max(0, targetMajorBodies - existingMajorBodies),
        minimumCellCount: 48,
      });
    inlandSeaCells = new Set(inlandSeaComponents.flat());
    selectedLakes = [];
    for (const component of allLakeComponents) {
      if (
        selectedLakes.length >= 72 ||
        component.length < 2 ||
        component.length > 64 ||
        inlandSeaCells.has(component[0]!)
      )
        continue;
      const level = filledElevation[component[0]!]!;
      const conflicts = component.some((cell) => {
        for (
          let direction = 0;
          direction < HEX_NEIGHBOR_COUNT;
          direction += 1
        ) {
          const neighbor =
            grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0 &&
            generatedWaterRegime[neighbor] === WATER_LAKE &&
            (elevation[neighbor]! <= SEA_LEVEL
              ? SEA_LEVEL
              : filledElevation[neighbor]!) !== level
          )
            return true;
        }
        return false;
      });
      if (conflicts) continue;
      selectedLakes.push(component);
      for (const cell of component) generatedWaterRegime[cell] = WATER_LAKE;
    }
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        generatedWaterRegime[cell] === WATER_DRY &&
        majorRiverNetwork[cell] === 1
      ) {
        generatedWaterRegime[cell] = WATER_RIVER;
      } else if (
        generatedWaterRegime[cell] === WATER_DRY &&
        minorStreamNetwork[cell] === 1
      ) {
        generatedWaterRegime[cell] = WATER_STREAM;
      }
    }
    const lakeCount = selectedLakes.length;
    const lakeBasinCandidates = allLakeComponents.length;
    completed = true;
    return Object.freeze({
      waterRegime: generatedWaterRegime,
      majorRiverCount,
      minorStreamCount,
      lakeCount,
      lakeBasinCandidates,
      riverMouthCandidates: majorRiverCount,
      streamHeadCandidates: minorStreamCount,
    });
  } finally {
    lakeCandidate?.fill(0);
    belowSea?.fill(0);
    majorRiverNetwork?.fill(0);
    minorStreamNetwork?.fill(0);
    inlandSeaCells?.clear();
    clearConnectedComponentCoordinates(majorRiverComponents);
    clearConnectedComponentCoordinates(belowSeaComponents);
    clearConnectedComponentCoordinates(allLakeComponents);
    if (majorRiverComponents) majorRiverComponents.length = 0;
    if (belowSeaComponents) belowSeaComponents.length = 0;
    if (allLakeComponents) allLakeComponents.length = 0;
    if (selectedLakes) selectedLakes.length = 0;
    if (!completed) waterRegime?.fill(0);
  }
}

/** Derive the historical generated biome/landform envelope from fixed water. */
function deriveGreaterRealmGeneratedSurfaceVisuals(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  waterRegime: Uint8Array,
  tierId: Uint8Array,
  temperatureField: Int32Array,
  moistureField: Int32Array,
): GreaterRealmGeneratedSurfaceVisuals {
  let biomeId: Uint8Array | undefined;
  let landformId: Uint8Array | undefined;
  let completed = false;
  try {
    biomeId = new Uint8Array(grid.cellCount);
    landformId = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (waterRegime[cell] !== WATER_DRY) {
        const saltwater =
          waterRegime[cell] === WATER_OCEAN || waterRegime[cell] === WATER_SEA;
        biomeId[cell] = saltwater
          ? GREATER_REALM_BIOME_ID.SALTWATER
          : waterRegime[cell] === WATER_LAKE
            ? GREATER_REALM_BIOME_ID.LAKE
            : GREATER_REALM_BIOME_ID.RIVER_STREAM;
        landformId[cell] = saltwater
          ? GREATER_REALM_LANDFORM_ID.ISLAND_SHELF
          : waterRegime[cell] === WATER_LAKE
            ? GREATER_REALM_LANDFORM_ID.LAKE_BASIN
            : GREATER_REALM_LANDFORM_ID.WATERCOURSE;
        continue;
      }
      let maximumDrop = 0;
      for (
        let directionIndex = 0;
        directionIndex < HEX_NEIGHBOR_COUNT;
        directionIndex += 1
      ) {
        const neighbor =
          grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
        if (neighbor < 0) continue;
        maximumDrop = Math.max(
          maximumDrop,
          Math.abs(elevation[cell]! - elevation[neighbor]!),
        );
      }
      const temperature = temperatureField[cell]!;
      const moisture = moistureField[cell]!;
      if (maximumDrop > 2_500 || elevation[cell]! > 16_000) {
        biomeId[cell] =
          temperature < 2_500
            ? GREATER_REALM_BIOME_ID.TUNDRA
            : GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND;
        landformId[cell] =
          elevation[cell]! > 20_000
            ? GREATER_REALM_LANDFORM_ID.MOUNTAIN
            : GREATER_REALM_LANDFORM_ID.HIGHLAND;
      } else if (temperature < 1_800) {
        biomeId[cell] =
          moisture > 0
            ? GREATER_REALM_BIOME_ID.ALPINE_SNOW
            : GREATER_REALM_BIOME_ID.HEATHLAND;
        landformId[cell] = GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU;
      } else if (moisture < -1_800) {
        biomeId[cell] =
          temperature > 6_000
            ? GREATER_REALM_BIOME_ID.ROCKY_DESERT
            : GREATER_REALM_BIOME_ID.DUNE_DESERT;
        landformId[cell] =
          maximumDrop > 900
            ? GREATER_REALM_LANDFORM_ID.BADLANDS
            : GREATER_REALM_LANDFORM_ID.DUNE;
      } else if (moisture > 2_000) {
        biomeId[cell] =
          tierId[cell] === 1
            ? GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST
            : GREATER_REALM_BIOME_ID.PINE_FOREST;
        landformId[cell] =
          maximumDrop > 1_200
            ? GREATER_REALM_LANDFORM_ID.HILL
            : GREATER_REALM_LANDFORM_ID.LOWLAND;
      } else {
        biomeId[cell] =
          tierId[cell] === 3
            ? GREATER_REALM_BIOME_ID.ASH_MEADOW
            : GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND;
        landformId[cell] =
          maximumDrop > 1_000
            ? GREATER_REALM_LANDFORM_ID.ROLLING_LOWLAND
            : GREATER_REALM_LANDFORM_ID.LOWLAND;
      }
    }
    completed = true;
    return Object.freeze({
      biomeId,
      landformId,
    });
  } finally {
    if (!completed) {
      biomeId?.fill(0);
      landformId?.fill(0);
    }
  }
}

/**
 * The generated water surface is never allowed to reinterpret the deployed
 * patch. Clear generated water inside its protected footprint, then project
 * the exact active Water revision. Detailed legacy hydrology remains in the
 * pinned private patch descriptor.
 */
function overlayLegacyLowlandsWaterAuthority(
  grid: IndexedAxialGrid,
  legacy: GreaterRealmLegacySurfacePlacement,
  waterRegime: Uint8Array,
): boolean {
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.protectedCell[cell] === 1) waterRegime[cell] = 0;
  }
  let enabledWaterCount = 0;
  for (const waterCell of patch.water.enabledCells) {
    const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
    if (cell < 0 || legacy.protectedCell[cell] !== 1) return false;
    waterRegime[cell] =
      waterCell.regime === 'ocean'
        ? WATER_OCEAN
        : waterCell.regime === 'river'
          ? WATER_RIVER
          : WATER_LAKE;
    enabledWaterCount += 1;
  }
  if (enabledWaterCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.waterEnabledCellCount) {
    return false;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacy.castleSlot[cell] === 1 && waterRegime[cell] !== 0) return false;
  }
  return true;
}

/** Project the seven frozen gameplay terrain classes and water visuals. */
function overlayLegacyLowlandsVisualAuthority(
  grid: IndexedAxialGrid,
  legacy: GreaterRealmLegacySurfacePlacement,
  biomeId: Uint8Array,
  landformId: Uint8Array,
): boolean {
  const patch = GREATER_REALM_PRIVATE_LEGACY_LOWLANDS_PATCH_V1;
  const tileByKey = new Map(patch.world.tiles.map(tile => [tile.key, tile] as const));
  const visualClass = Object.freeze({
    lowland: Object.freeze([
      GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
      GREATER_REALM_LANDFORM_ID.LOWLAND,
    ] as const),
    meadow: Object.freeze([
      GREATER_REALM_BIOME_ID.FLOWER_MEADOW,
      GREATER_REALM_LANDFORM_ID.LOWLAND,
    ] as const),
    forest: Object.freeze([
      GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST,
      GREATER_REALM_LANDFORM_ID.LOWLAND,
    ] as const),
    heath: Object.freeze([
      GREATER_REALM_BIOME_ID.SAVANNA,
      GREATER_REALM_LANDFORM_ID.LOWLAND,
    ] as const),
    ridge: Object.freeze([
      GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
      GREATER_REALM_LANDFORM_ID.HIGHLAND,
    ] as const),
    lake: Object.freeze([
      GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND,
      GREATER_REALM_LANDFORM_ID.LOWLAND,
    ] as const),
    'ancient-stone': Object.freeze([
      GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND,
      GREATER_REALM_LANDFORM_ID.HILL,
    ] as const),
  });
  try {
    for (const metadata of patch.world.metadata) {
      const tile = tileByKey.get(metadata.tileKey);
      if (!tile) return false;
      const cell = grid.indexOf(transformLegacyLowlandsToGlobal(tile, legacy.transform));
      const classification = visualClass[metadata.terrainKind];
      if (cell < 0 || !classification) return false;
      biomeId[cell] = classification[0];
      landformId[cell] = classification[1];
    }
    for (const waterCell of patch.water.enabledCells) {
      const cell = grid.indexOf(transformLegacyLowlandsToGlobal(waterCell, legacy.transform));
      if (cell < 0 || legacy.protectedCell[cell] !== 1) return false;
      biomeId[cell] =
        waterCell.regime === 'ocean'
          ? GREATER_REALM_BIOME_ID.SALTWATER
          : waterCell.regime === 'river'
            ? GREATER_REALM_BIOME_ID.RIVER_STREAM
            : GREATER_REALM_BIOME_ID.LAKE;
      landformId[cell] =
        waterCell.regime === 'ocean'
          ? GREATER_REALM_LANDFORM_ID.ISLAND_SHELF
          : waterCell.regime === 'river'
            ? GREATER_REALM_LANDFORM_ID.WATERCOURSE
            : GREATER_REALM_LANDFORM_ID.LAKE_BASIN;
    }
    return true;
  } finally {
    tileByKey.clear();
  }
}

/** Focused, non-production seams for the surface-split characterization tests. */
export const greaterRealmSurfaceSplitTestSeams = Object.freeze({
  deriveGeneratedWaterSurface: deriveGreaterRealmGeneratedWaterSurface,
  deriveGeneratedSurfaceVisuals: deriveGreaterRealmGeneratedSurfaceVisuals,
  overlayLegacyLowlandsWaterAuthority,
  overlayLegacyLowlandsVisualAuthority,
});

function finalHydrologyMetrics(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  filledElevation: Int32Array,
  flowReceiver: Int32Array,
  flowAccumulation: BigUint64Array,
  waterRegime: Uint8Array,
  legacyProtectedCell: Uint8Array,
): Readonly<{
  majorOceanSeaBodies: number;
  majorRivers: number;
  minorStreams: number;
  lakes: number;
  watersheds: number;
  surfaceConsistencyProof: boolean;
}> {
  const regimeComponents = (regime: number) => {
    const included = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (waterRegime[cell] === regime) included[cell] = 1;
    }
    return connectedComponents(grid, included);
  };
  const oceanComponents = regimeComponents(WATER_OCEAN);
  const seaComponents = regimeComponents(WATER_SEA);
  const lakeComponents = regimeComponents(WATER_LAKE);
  const majorOceanSeaBodies = oceanComponents.length + seaComponents.length;
  const lakes = lakeComponents.filter(component => component.length >= 2).length;
  const generatedMajorRiver = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      legacyProtectedCell[cell] !== 1
      && elevation[cell]! > SEA_LEVEL
      && flowAccumulation[cell]! >= BigInt(MAJOR_RIVER_DISCHARGE)
    ) generatedMajorRiver[cell] = 1;
  }
  const majorRivers = connectedComponents(grid, generatedMajorRiver).length;
  let minorStreams = 0;
  let watersheds = 0;
  let surfaceConsistencyProof = true;
  for (const component of oceanComponents) {
    if (!component.some(cell => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
      }
      return false;
    })) surfaceConsistencyProof = false;
  }
  for (const components of [seaComponents, lakeComponents]) {
    for (const component of components) {
      const componentMask = new Uint8Array(grid.cellCount);
      for (const cell of component) componentMask[cell] = 1;
      const expectedSurface = elevation[component[0]!]! <= SEA_LEVEL
        ? SEA_LEVEL
        : filledElevation[component[0]!]!;
      if (component.some(cell => (
        (elevation[cell]! <= SEA_LEVEL ? SEA_LEVEL : filledElevation[cell]!)
          !== expectedSurface
      ))) {
        surfaceConsistencyProof = false;
        continue;
      }
      const hasLegalSpillOrOutlet = component.some(cell => {
        const receiver = flowReceiver[cell]!;
        if (receiver < 0) return expectedSurface <= SEA_LEVEL;
        if (componentMask[receiver] === 1) return false;
        const receiverSurface = elevation[receiver]! <= SEA_LEVEL
          ? SEA_LEVEL
          : filledElevation[receiver]!;
        return receiverSurface <= expectedSurface;
      });
      if (!hasLegalSpillOrOutlet) surfaceConsistencyProof = false;
    }
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const receiver = flowReceiver[cell]!;
    if (receiver < 0) {
      if (waterRegime[cell] === 0) surfaceConsistencyProof = false;
      if (flowAccumulation[cell]! >= 64n) watersheds += 1;
    }
    if (legacyProtectedCell[cell] === 1) continue;
    if (waterRegime[cell] === 4) {
      let hasUpstreamStream = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && waterRegime[neighbor] === 4
          && flowReceiver[neighbor] === cell
        ) {
          hasUpstreamStream = true;
          break;
        }
      }
      if (!hasUpstreamStream) minorStreams += 1;
    }
    if (
      (waterRegime[cell] === 3 || waterRegime[cell] === 4)
      && receiver >= 0
      && legacyProtectedCell[receiver] !== 1
      && waterRegime[receiver] === 0
    ) surfaceConsistencyProof = false;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] !== 1) continue;
    if ((waterRegime[cell] === 0) !== (elevation[cell]! > SEA_LEVEL)) {
      surfaceConsistencyProof = false;
    }
  }
  return Object.freeze({
    majorOceanSeaBodies,
    majorRivers,
    minorStreams,
    lakes,
    watersheds,
    surfaceConsistencyProof,
  });
}

function barrierApproachPaths(
  grid: IndexedAxialGrid,
  endpoint: number,
  region: number,
  regionId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  targetComponentId: Int32Array,
  targetComponentSizes: readonly number[],
): readonly (readonly number[])[] | undefined {
  const starts: number[] = [];
  let previous: Int32Array | undefined;
  let depth: Uint8Array | undefined;
  let queue: Uint32Array | undefined;
  const paths: number[][] = [];
  const constructedPaths = new Set<number[]>();
  const signatures = new Set<string>();
  const primaryPaths: number[][] = [];
  let retainedPaths = new Set<number[]>();
  let pathsFrozen = false;
  try {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === region
        && waterRegime[neighbor] === WATER_DRY
      ) starts.push(neighbor);
    }
    starts.sort((first, second) => first - second);
    if (starts.length === 0) return undefined;
    previous = new Int32Array(grid.cellCount);
    depth = new Uint8Array(grid.cellCount);
    queue = new Uint32Array(grid.cellCount);
    const reusablePrevious = previous;
    const reusableDepth = depth;
    const reusableQueue = queue;
    const findPath = (
      start: number,
      forbidden?: ReadonlySet<number>,
    ): number[] | undefined => {
      // Reuse one bounded O(N) scratch triplet. A full deterministic reset
      // preserves the historical fresh-allocation state for every search.
      reusablePrevious.fill(-2);
      reusableDepth.fill(0);
      reusableQueue.fill(0);
      if (forbidden?.has(start)) return undefined;
      reusablePrevious[start] = -1;
      let head = 0;
      let tail = 0;
      reusableQueue[tail++] = start;
      let target = -1;
      while (head < tail) {
        const cell = reusableQueue[head++]!;
        if (
          barrier[cell] === 0
          && targetComponentId[cell]! >= 0
          && targetComponentSizes[targetComponentId[cell]!]! >= 64
        ) {
          target = cell;
          break;
        }
        // Natural coastlines and highland shoulders can separate a valid dry
        // saddle from its region's durable interior by more than twenty cells.
        // This is still a bounded offline search; the path is accepted only if
        // both sides remain sealed from every unintended cross-tier contact.
        if (reusableDepth[cell]! >= 64) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || neighbor === endpoint
            || forbidden?.has(neighbor)
            || reusablePrevious[neighbor] !== -2
            || regionId[neighbor] !== region
            || waterRegime[neighbor] !== WATER_DRY
          ) continue;
          reusablePrevious[neighbor] = cell;
          reusableDepth[neighbor] = reusableDepth[cell]! + 1;
          reusableQueue[tail++] = neighbor;
        }
      }
      if (target < 0) return undefined;
      const path: number[] = [];
      constructedPaths.add(path);
      for (
        let cell = target;
        cell >= 0;
        cell = reusablePrevious[cell]!
      ) path.push(cell);
      path.reverse();
      return path;
    };
    for (const start of starts) {
      const path = findPath(start);
      if (!path) continue;
      signatures.add(path.join(','));
      paths.push(path);
    }
    // A fixed neighbour order can make two otherwise independent approaches
    // converge on the same short crest route. Deterministically search an
    // alternative for each second start while excluding the first route's
    // non-terminal cells. This proves two real corridors instead of counting
    // two labels on one bridge cell.
    primaryPaths.push(...paths);
    for (const first of primaryPaths) {
      const forbidden = new Set(first);
      try {
        for (const start of starts) {
          if (start === first[0]) continue;
          const alternative = findPath(start, forbidden);
          if (!alternative) continue;
          const signature = alternative.join(',');
          if (signatures.has(signature)) continue;
          signatures.add(signature);
          paths.push(alternative);
        }
      } finally {
        forbidden.clear();
      }
    }
    paths.sort((first, second) => first.length - second.length || first[0]! - second[0]!);
    if (paths.length < 1) return undefined;
    // Keep the owned coordinate arrays mutable so private-candidate retirement
    // can overwrite their contents; only the collection shape is immutable.
    const result = Object.freeze(paths);
    pathsFrozen = true;
    retainedPaths = new Set(paths);
    return result;
  } finally {
    previous?.fill(0);
    depth?.fill(0);
    queue?.fill(0);
    starts.fill(0);
    starts.length = 0;
    signatures.clear();
    primaryPaths.length = 0;
    for (const path of constructedPaths) {
      if (!retainedPaths.has(path)) path.fill(0);
    }
    constructedPaths.clear();
    if (!pathsFrozen) paths.length = 0;
    retainedPaths.clear();
  }
}

function gateApproachCorridorsDisjoint(
  left: readonly number[],
  right: readonly number[],
): boolean {
  const occupied = new Set(left);
  return right.every(cell => !occupied.has(cell));
}

function compatibleGateApproaches(
  grid: IndexedAxialGrid,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  targetComponentId: Int32Array,
  targetComponentSizes: readonly number[],
  first: readonly (readonly number[])[],
  second: readonly (readonly number[])[],
  optionOrdinal = 0,
): Readonly<{
  first: readonly number[];
  firstAlternate: readonly number[];
  second: readonly number[];
  secondAlternate: readonly number[];
  all: readonly (readonly number[])[];
}> | undefined {
  let compatibleOrdinal = 0;
  for (let firstA = 0; firstA < first.length; firstA += 1) {
    for (let secondA = 0; secondA < second.length; secondA += 1) {
      const firstAlternatives = first.map((_, index) => index).filter(index => (
        index !== firstA
        && gateApproachCorridorsDisjoint(first[firstA]!, first[index]!)
      ));
      const secondAlternatives = second.map((_, index) => index).filter(index => (
        index !== secondA
        && gateApproachCorridorsDisjoint(second[secondA]!, second[index]!)
      ));
      for (const firstB of firstAlternatives) {
        for (const secondB of secondAlternatives) {
          const paths = [
            first[firstA]!,
            second[secondA]!,
            first[firstB]!,
            second[secondB]!,
          ];
          const firstTarget = targetComponentId[paths[0]![paths[0]!.length - 1]!]!;
          const secondTarget = targetComponentId[paths[1]![paths[1]!.length - 1]!]!;
          const firstAlternateTarget = targetComponentId[paths[2]![paths[2]!.length - 1]!]!;
          const secondAlternateTarget = targetComponentId[paths[3]![paths[3]!.length - 1]!]!;
          if (
            firstTarget < 0
            || secondTarget < 0
            || firstTarget !== firstAlternateTarget
            || secondTarget !== secondAlternateTarget
            || targetComponentSizes[firstTarget]! < 64
            || targetComponentSizes[secondTarget]! < 64
          ) continue;
          const frozenPaths = Object.freeze(paths);
          const carved = new Set(frozenPaths.flat());
          let bypass = false;
          for (const cell of carved) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor >= 0
                && tierId[cell] !== tierId[neighbor]
                && strategicallyPassableSurface(waterRegime[cell]!)
                && strategicallyPassableSurface(waterRegime[neighbor]!)
                && (barrier[cell] === 0 || carved.has(cell))
                && (barrier[neighbor] === 0 || carved.has(neighbor))
              ) {
                bypass = true;
                break;
              }
            }
            if (bypass) break;
          }
          if (!bypass) {
            if (compatibleOrdinal < optionOrdinal) {
              compatibleOrdinal += 1;
              continue;
            }
            return Object.freeze({
              first: first[firstA]!,
              firstAlternate: first[firstB]!,
              second: second[secondA]!,
              secondAlternate: second[secondB]!,
              all: frozenPaths,
            });
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * The geological shoulder is deliberately wider than the exact cross-tier
 * cut. On a narrow peninsula, an interior shoulder cell can therefore split
 * one political region without contributing to the tier seal. Reconnect only
 * those same-region fragments through a bounded pass: every cross-tier
 * contact and every sealed gate endpoint remains locked as barrier authority.
 */
function reconnectBarrierSplitRegionComponents(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
  repairCrestFlip?: Readonly<{
    geologicalBarrierBand: Uint8Array;
    legacyProtectedCell: Uint8Array;
    repairImmutableCell: Uint8Array;
    protectedApproachCells: ReadonlySet<number>;
  }>,
): void {
  const lockedBarrier = new Uint8Array(grid.cellCount);
  const gateEndpoint = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    lockedBarrier[gate.firstCell] = 1;
    lockedBarrier[gate.secondCell] = 1;
    gateEndpoint[gate.firstCell] = 1;
    gateEndpoint[gate.secondCell] = 1;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (barrier[cell] !== 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && tierId[neighbor] !== tierId[cell]) {
        lockedBarrier[cell] = 1;
        break;
      }
    }
  }
  const canFlipRepairCrest = (cell: number): boolean => {
    if (
      !repairCrestFlip
      || tierId[cell] !== 2
      || gateEndpoint[cell] === 1
      || repairCrestFlip.legacyProtectedCell[cell] === 1
      || repairCrestFlip.repairImmutableCell[cell] === 1
      || repairCrestFlip.protectedApproachCells.has(cell)
    ) return false;
    let crossTierNeighborCount = 0;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || tierId[neighbor] === tierId[cell]) continue;
      crossTierNeighborCount += 1;
      if (
        repairCrestFlip.geologicalBarrierBand[neighbor] !== 1
        || repairCrestFlip.legacyProtectedCell[neighbor] === 1
        || repairCrestFlip.repairImmutableCell[neighbor] === 1
        || repairCrestFlip.protectedApproachCells.has(neighbor)
        || gateEndpoint[neighbor] === 1
      ) return false;
    }
    return crossTierNeighborCount > 0;
  };

  for (let region = 0; region < REGION_COUNT; region += 1) {
    // A fixed bound prevents malformed geography from turning repair into an
    // unbounded convergence process. Normal shoulder splits need 1-3 passes.
    for (let repair = 0; repair < 32; repair += 1) {
      const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
      if (repairCrestFlip) {
        let minorCells = 0;
        let tendrilCells = 0;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (
            regionId[cell] !== region
            || !strategicallyPassableSurface(waterRegime[cell]!)
            || barrier[cell] !== 0
          ) continue;
          const component = topology.componentId[cell]!;
          if (component >= 0 && topology.componentSizes[component]! < 64) {
            minorCells += 1;
          }
          let sameRegionNeighbors = 0;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor >= 0
              && regionId[neighbor] === region
              && strategicallyPassableSurface(waterRegime[neighbor]!)
              && barrier[neighbor] === 0
            ) sameRegionNeighbors += 1;
          }
          if (sameRegionNeighbors <= 1) tendrilCells += 1;
        }
        const passableCells = topology.passableCounts[region]!;
        if (
          passableCells > 0
          && minorCells * 10_000 <= passableCells * 250
          && tendrilCells * 10_000 <= passableCells * 140
        ) break;
      }
      const targetComponent = topology.largestComponentByRegion[region]!;
      if (targetComponent < 0) break;
      const candidates = topology.componentSizes
        .map((size, component) => Object.freeze({ component, size }))
        .filter(({ component }) => {
          if (component === targetComponent) return false;
          for (let cell = 0; cell < grid.cellCount; cell += 1) {
            if (topology.componentId[cell] === component) return regionId[cell] === region;
          }
          return false;
        })
        .sort((first, second) => second.size - first.size || first.component - second.component)
        .slice(0, 16);
      if (candidates.length === 0) break;

      let repaired = false;
      for (const candidate of candidates) {
        const previous = new Int32Array(grid.cellCount);
        previous.fill(-2);
        const queue = new Uint32Array(grid.cellCount);
        let head = 0;
        let tail = 0;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (topology.componentId[cell] !== candidate.component) continue;
          previous[cell] = -1;
          queue[tail++] = cell;
        }
        let target = -1;
        while (head < tail && target < 0) {
          const cell = queue[head++]!;
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || previous[neighbor] !== -2
              || regionId[neighbor] !== region
              || !strategicallyPassableSurface(waterRegime[neighbor]!)
              || (
                barrier[neighbor] === 1
                && lockedBarrier[neighbor] === 1
                && !canFlipRepairCrest(neighbor)
              )
            ) continue;
            previous[neighbor] = cell;
            if (
              barrier[neighbor] === 0
              && topology.componentId[neighbor] === targetComponent
            ) {
              target = neighbor;
              break;
            }
            queue[tail++] = neighbor;
          }
        }
        if (target < 0) continue;
        const passCells: number[] = [];
        for (let cell = target; cell >= 0; cell = previous[cell]!) {
          if (barrier[cell] === 1) passCells.push(cell);
        }
        if (passCells.length === 0 || passCells.length > 16) continue;
        for (const cell of passCells) {
          if (lockedBarrier[cell] === 1) {
            if (!canFlipRepairCrest(cell)) {
              fail('GREATER_REALM_REPAIR_CREST_FLIP_CHANGED');
            }
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (neighbor >= 0 && tierId[neighbor] !== tierId[cell]) {
                barrier[neighbor] = 1;
              }
            }
          }
          barrier[cell] = 0;
        }
        repaired = true;
        break;
      }
      if (!repaired) break;
    }
  }
}

/**
 * A sealed Crown boundary can leave a small Tier-II geological shoulder as a
 * traversable pocket whose only route to its realm crosses the locked
 * cross-tier cut. The repair lane may close a bounded number of those cavities
 * as barrier, but it may not widen beyond the measured geological band or
 * touch a reviewed approach, reserve authority, protected cell, or interior
 * Tier-II spine cell.
 */
export function sealGreaterRealmRepairBarrierPockets(input: Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  tierId: Uint8Array;
  waterRegime: Uint8Array;
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  legacyProtectedCell: Uint8Array;
  repairImmutableCell: Uint8Array;
  protectedApproachCells: ReadonlySet<number>;
  gates: readonly GreaterRealmPrivateGate[];
  tierTwoSpineOwner: Int8Array;
}>): Readonly<{
  sealedCellCount: number;
  sealedComponentCount: number;
}> {
  const { grid } = input;
  for (const field of [
    input.regionId,
    input.tierId,
    input.waterRegime,
    input.barrier,
    input.geologicalBarrierBand,
    input.legacyProtectedCell,
    input.repairImmutableCell,
    input.tierTwoSpineOwner,
  ]) {
    if (field.length !== grid.cellCount) {
      fail('GREATER_REALM_REPAIR_BARRIER_POCKET_SHAPE_INVALID');
    }
  }
  const lockedGateCell = new Uint8Array(grid.cellCount);
  for (const gate of input.gates) {
    lockedGateCell[gate.firstCell] = 1;
    lockedGateCell[gate.secondCell] = 1;
  }
  const spineBarrierEligible = (cell: number): boolean => {
    if (input.tierTwoSpineOwner[cell] < 0) return true;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && input.tierId[neighbor] !== input.tierId[cell]) return true;
    }
    return false;
  };
  const maximumSealedCells = 512;
  const maximumSealedComponents = 16;
  const targetMinorShareBasisPoints = 250;
  let sealedCellCount = 0;
  let sealedComponentCount = 0;
  try {
    while (
      sealedCellCount < maximumSealedCells
      && sealedComponentCount < maximumSealedComponents
    ) {
      const topology = passableRegionTopology(
        grid,
        input.regionId,
        input.waterRegime,
        input.barrier,
      );
      let selected: readonly number[] | undefined;
      for (
        let region = TIER_I_REGION_COUNT;
        region < TIER_III_REGION_INDEX;
        region += 1
      ) {
        const components: number[][] = [];
        for (let component = 0; component < topology.componentSizes.length; component += 1) {
          const size = topology.componentSizes[component]!;
          if (
            size >= 64
            || component === topology.largestComponentByRegion[region]
          ) continue;
          const cells: number[] = [];
          for (let cell = 0; cell < grid.cellCount; cell += 1) {
            if (
              topology.componentId[cell] === component
              && input.regionId[cell] === region
            ) cells.push(cell);
          }
          if (cells.length === size) components.push(cells);
        }
        const minorCellCount = components.reduce(
          (total, component) => total + component.length,
          0,
        );
        const passableCount = topology.passableCounts[region]!;
        if (
          minorCellCount * 10_000
            <= passableCount * targetMinorShareBasisPoints
        ) continue;
        components.sort((first, second) => (
          second.length - first.length || first[0]! - second[0]!
        ));
        for (const component of components) {
          if (component.some(cell => (
            input.legacyProtectedCell[cell] === 1
            || input.repairImmutableCell[cell] === 1
            || input.protectedApproachCells.has(cell)
            || lockedGateCell[cell] === 1
          ))) continue;
          const sealable = component.filter(cell => {
            if (input.geologicalBarrierBand[cell] !== 1) return false;
            return spineBarrierEligible(cell);
          });
          if (
            sealable.length === 0
            || sealable.length > maximumSealedCells - sealedCellCount
          ) continue;
          selected = sealable;
          break;
        }
        if (selected) break;
      }
      if (!selected) break;
      for (const cell of selected) input.barrier[cell] = 1;
      sealedCellCount += selected.length;
      sealedComponentCount += 1;
    }

    const measuredShape = (region: number) => {
      const topology = passableRegionTopology(
        grid,
        input.regionId,
        input.waterRegime,
        input.barrier,
      );
      let boundarySides = 0;
      let tendrilCells = 0;
      let passableCells = 0;
      let minorCells = 0;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          input.regionId[cell] !== region
          || !strategicallyPassableSurface(input.waterRegime[cell]!)
          || input.barrier[cell] !== 0
        ) continue;
        passableCells += 1;
        const component = topology.componentId[cell]!;
        if (component >= 0 && topology.componentSizes[component]! < 64) {
          minorCells += 1;
        }
        let sameRegionNeighbors = 0;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && input.regionId[neighbor] === region
            && strategicallyPassableSurface(input.waterRegime[neighbor]!)
            && input.barrier[neighbor] === 0
          ) sameRegionNeighbors += 1;
          else boundarySides += 1;
        }
        if (sameRegionNeighbors <= 1) tendrilCells += 1;
      }
      return Object.freeze({
        boundarySides,
        tendrilCells,
        passableCells,
        minorCells,
        largestShareBasisPoints: topology.largestSharesBasisPoints[region]!,
      });
    };
    const smoothingRejected = new Uint8Array(grid.cellCount);
    try {
      for (
        let region = TIER_I_REGION_COUNT;
        region < TIER_III_REGION_INDEX;
        region += 1
      ) {
        while (sealedCellCount < maximumSealedCells) {
          const before = measuredShape(region);
          if (
            before.passableCells === 0
            || before.boundarySides * 10_000
              <= before.passableCells * HEX_NEIGHBOR_COUNT * 1_000
          ) break;
          let selectedCell = -1;
          let selectedBoundarySides = 2;
          for (let cell = 0; cell < grid.cellCount; cell += 1) {
            if (
              smoothingRejected[cell] === 1
              || input.regionId[cell] !== region
              || !strategicallyPassableSurface(input.waterRegime[cell]!)
              || input.barrier[cell] !== 0
              || input.geologicalBarrierBand[cell] !== 1
              || input.legacyProtectedCell[cell] === 1
              || input.repairImmutableCell[cell] === 1
              || input.protectedApproachCells.has(cell)
              || lockedGateCell[cell] === 1
              || !spineBarrierEligible(cell)
            ) continue;
            let boundarySides = 0;
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor < 0
                || input.regionId[neighbor] !== region
                || !strategicallyPassableSurface(input.waterRegime[neighbor]!)
                || input.barrier[neighbor] !== 0
              ) boundarySides += 1;
            }
            if (
              boundarySides > selectedBoundarySides
              || (
                boundarySides === selectedBoundarySides
                && boundarySides >= 3
                && (selectedCell < 0 || cell < selectedCell)
              )
            ) {
              selectedCell = cell;
              selectedBoundarySides = boundarySides;
            }
          }
          if (selectedCell < 0) break;
          input.barrier[selectedCell] = 1;
          const after = measuredShape(region);
          const coherent = after.boundarySides <= before.boundarySides
            && after.largestShareBasisPoints >= 8_500
            && after.minorCells * 10_000 <= after.passableCells * 300
            && after.tendrilCells * 10_000 <= after.passableCells * 150;
          if (!coherent) {
            input.barrier[selectedCell] = 0;
            smoothingRejected[selectedCell] = 1;
            continue;
          }
          sealedCellCount += 1;
        }
      }
    } finally {
      smoothingRejected.fill(0);
    }
    return Object.freeze({ sealedCellCount, sealedComponentCount });
  } finally {
    lockedGateCell.fill(0);
  }
}

function reconcileBarrierMeasuredRegionCoherence(
  grid: IndexedAxialGrid,
  regionId: Uint8Array,
  tierId: Uint8Array,
  waterRegime: Uint8Array,
  barrier: Uint8Array,
  legacyProtectedCell: Uint8Array,
  protectedApproachCells: ReadonlySet<number>,
  repairImmutableCell?: Uint8Array,
): void {
  if (
    repairImmutableCell !== undefined
    && repairImmutableCell.length !== grid.cellCount
  ) fail('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_SHAPE_INVALID');
  const initialCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) initialCounts[region] += 1;
  const protectedCell = new Uint8Array(grid.cellCount);
  for (const cell of protectedApproachCells) protectedCell[cell] = 1;
  if (repairImmutableCell) {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (repairImmutableCell[cell] === 1) protectedCell[cell] = 1;
    }
  }

  const largestTarget = (region: number) => region < TIER_I_REGION_COUNT
    ? region === 4 ? repairImmutableCell ? 5_500 : 6_250 : 8_500
    : region < TIER_III_REGION_INDEX ? 9_000 : 9_500;
  const minorTarget = (region: number) => region === 4 ? 425 : 250;

  const detachableProtectedFoothold = (component: readonly number[]) => {
    if (component.some(cell => legacyProtectedCell[cell] === 1)) return undefined;
    const anchors = component.filter(cell => protectedCell[cell] === 1);
    if (anchors.length === 0) return Object.freeze([...component]);
    // A reviewed gate approach must remain assigned to its endpoint's region,
    // but a large island or peninsula behind that approach need not become an
    // immutable political exclave. Preserve one connected 128-cell foothold
    // containing every protected approach cell, then allow only its hinterland
    // to participate in the ordinary same-tier coherence repair.
    if (component.length <= 128) return undefined;
    const member = new Uint8Array(grid.cellCount);
    for (const cell of component) member[cell] = 1;
    const keep = new Uint8Array(grid.cellCount);
    keep[anchors[0]!] = 1;
    let keepCount = 1;
    for (const anchor of anchors.slice(1)) {
      if (keep[anchor] === 1) continue;
      const previous = new Int32Array(grid.cellCount);
      previous.fill(-2);
      const queue = new Uint32Array(grid.cellCount);
      let head = 0;
      let tail = 0;
      for (const cell of component) {
        if (keep[cell] !== 1) continue;
        previous[cell] = -1;
        queue[tail++] = cell;
      }
      while (head < tail && previous[anchor] === -2) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || member[neighbor] !== 1 || previous[neighbor] !== -2) continue;
          previous[neighbor] = cell;
          queue[tail++] = neighbor;
        }
      }
      if (previous[anchor] === -2) {
        fail('GREATER_REALM_GATE_FOOTHOLD_CONNECTIVITY_INVALID');
      }
      for (let cell = anchor; cell >= 0 && keep[cell] !== 1; cell = previous[cell]!) {
        keep[cell] = 1;
        keepCount += 1;
      }
    }
    for (const anchor of anchors) {
      if (keep[anchor] === 0) fail('GREATER_REALM_GATE_FOOTHOLD_PROTECTION_INVALID');
    }
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (const cell of component) {
      if (keep[cell] === 1) queue[tail++] = cell;
    }
    while (head < tail && keepCount < 128) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || member[neighbor] !== 1 || keep[neighbor] === 1) continue;
        keep[neighbor] = 1;
        keepCount += 1;
        queue[tail++] = neighbor;
        if (keepCount === 128) break;
      }
    }
    const detachable = component.filter(cell => keep[cell] === 0);
    if (detachable.length === 0) return undefined;
    const detachableMask = new Uint8Array(grid.cellCount);
    for (const cell of detachable) detachableMask[cell] = 1;
    return [...connectedComponents(grid, detachableMask)]
      .sort((first, second) => second.length - first.length || first[0]! - second[0]!)[0];
  };

  // Four fixed sweeps let a recipient consolidate a component donated after
  // its prior visit, without an unbounded convergence loop.
  for (let sweep = 0; sweep < 4; sweep += 1) {
    const sweepTopology = passableRegionTopology(grid, regionId, waterRegime, barrier);
    const ordering = Array.from({ length: REGION_COUNT }, (_, region) => region)
      .sort((first, second) => (
        sweepTopology.largestSharesBasisPoints[first]!
          - sweepTopology.largestSharesBasisPoints[second]!
        || first - second
    ));
    for (const sourceRegion of ordering) {
      // The water-aware capacity allocator is the last political authority for
      // passable Tier-II land. Barrier repair may reconnect its terrain but
      // must never cure a shoulder split by donating that land to a peer.
      if (sourceRegion >= TIER_I_REGION_COUNT && sourceRegion < TIER_III_REGION_INDEX) {
        continue;
      }
      const included = new Uint8Array(grid.cellCount);
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          regionId[cell] === sourceRegion
          && strategicallyPassableSurface(waterRegime[cell]!)
          && barrier[cell] === 0
        ) included[cell] = 1;
      }
      const components = [...connectedComponents(grid, included)]
        .sort((first, second) => second.length - first.length || first[0]! - second[0]!);
      if (components.length <= 1) continue;
      const largest = components[0]!;
      let remainingTotal = components.reduce((sum, component) => sum + component.length, 0);
      let remainingMinor = components.slice(1).reduce(
        (sum, component) => sum + (component.length < 64 ? component.length : 0),
        0,
      );
      for (const component of components.slice(1)) {
        const largestSatisfied = largest.length * 10_000
          >= remainingTotal * largestTarget(sourceRegion);
        const minorSatisfied = remainingMinor * 10_000
          <= remainingTotal * minorTarget(sourceRegion);
        if (largestSatisfied && minorSatisfied) break;
        const transferableComponent = detachableProtectedFoothold(component);
        if (!transferableComponent) continue;
        if (transferableComponent.some(cell => repairImmutableCell?.[cell] === 1)) {
          fail('GREATER_REALM_LOWLANDS_REPAIR_AUTHORITY_CHANGED');
        }
        const contacts = new Uint32Array(REGION_COUNT);
        const contactedComponents = Array.from(
          { length: REGION_COUNT },
          () => new Set<number>(),
        );
        const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
        const availableSwapWater = new Uint32Array(REGION_COUNT);
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (
            !strategicallyPassableSurface(waterRegime[cell]!)
            && legacyProtectedCell[cell] === 0
            && protectedCell[cell] === 0
          ) availableSwapWater[regionId[cell]!] += 1;
        }
        for (const cell of transferableComponent) {
          for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
            if (
              neighbor < 0
              || barrier[neighbor] !== 0
              || !strategicallyPassableSurface(waterRegime[neighbor]!)
              || tierId[neighbor] !== tierId[cell]
              || regionId[neighbor] === sourceRegion
            ) continue;
            contacts[regionId[neighbor]!] += 1;
            const neighborComponent = topology.componentId[neighbor]!;
            if (neighborComponent >= 0) {
              contactedComponents[regionId[neighbor]!]!.add(neighborComponent);
            }
          }
        }
        let targetRegion = -1;
        let bestContacts = -1;
        let bestProjectedShare = -1;
        let selectedJoinedSize = -1;
        let selectedProjectedLargest = -1;
        for (let region = 0; region < REGION_COUNT; region += 1) {
          if (
            region === sourceRegion
            || GREATER_REALM_REGION_SPECS[region]!.tier
              !== GREATER_REALM_REGION_SPECS[sourceRegion]!.tier
            || availableSwapWater[region]! < transferableComponent.length
          ) continue;
          const projectedTotal = topology.passableCounts[region]!
            + transferableComponent.length;
          const joinedRecipientComponents = [...contactedComponents[region]!];
          const joinedSize = transferableComponent.length
            + joinedRecipientComponents
            .reduce((sum, componentId) => sum + topology.componentSizes[componentId]!, 0);
          const projectedLargest = Math.max(topology.largestCounts[region]!, joinedSize);
          const projectedShare = projectedTotal === 0
            ? 0
            : Math.floor((projectedLargest * 10_000) / projectedTotal);
          // A water-separated island has no same-tier land contact to inherit,
          // but its political ownership can still move to a coherent peer while
          // an equal non-passable ownership area moves back. Never cure one
          // fragmented realm by pushing the recipient below its own proof floor.
          if (projectedShare < largestTarget(region)) continue;
          if (
            projectedShare > bestProjectedShare
            || (
              projectedShare === bestProjectedShare
              && contacts[region]! > bestContacts
            )
            || (
              projectedShare === bestProjectedShare
              && contacts[region] === bestContacts
              && region < targetRegion
            )
          ) {
            targetRegion = region;
            bestContacts = contacts[region]!;
            bestProjectedShare = projectedShare;
            selectedJoinedSize = joinedSize;
            selectedProjectedLargest = projectedLargest;
          }
        }
        if (targetRegion < 0) continue;
        const waterSwapCandidates: number[] = [];
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (
            regionId[cell] === targetRegion
            && !strategicallyPassableSurface(waterRegime[cell]!)
            && legacyProtectedCell[cell] === 0
            && protectedCell[cell] === 0
          ) waterSwapCandidates.push(cell);
        }
        if (waterSwapCandidates.length < transferableComponent.length) continue;
        waterSwapCandidates.sort((first, second) => {
          const sourceContacts = (cell: number) => {
            let count = 0;
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (neighbor >= 0 && regionId[neighbor] === sourceRegion) count += 1;
            }
            return count;
          };
          return sourceContacts(second) - sourceContacts(first) || first - second;
        });
        const waterSwaps = waterSwapCandidates.slice(0, transferableComponent.length);
        for (const cell of transferableComponent) regionId[cell] = targetRegion;
        for (const cell of waterSwaps) regionId[cell] = sourceRegion;
        const projectedTopology = passableRegionTopology(
          grid,
          regionId,
          waterRegime,
          barrier,
        );
        const transferRepresentative = transferableComponent[0]!;
        const transferTargetComponent = projectedTopology.componentId[transferRepresentative]!;
        const projectedRegionCounts = Array<number>(REGION_COUNT).fill(0);
        for (const assignedRegion of regionId) projectedRegionCounts[assignedRegion] += 1;
        const projectionExact = regionId[transferRepresentative] === targetRegion
          && transferTargetComponent >= 0
          && projectedTopology.componentSizes[transferTargetComponent] === selectedJoinedSize
          && projectedTopology.passableCounts[targetRegion]
            === topology.passableCounts[targetRegion]! + transferableComponent.length
          && projectedTopology.passableCounts[sourceRegion]
            === topology.passableCounts[sourceRegion]! - transferableComponent.length
          && projectedTopology.largestCounts[targetRegion] === selectedProjectedLargest
          && projectedRegionCounts.every((count, region) => count === initialCounts[region])
          && projectedTopology.passableCounts.every((count, region) => (
            region === sourceRegion
            || region === targetRegion
            || (
              count === topology.passableCounts[region]
              && projectedTopology.largestCounts[region] === topology.largestCounts[region]
            )
          ));
        if (!projectionExact) {
          // A projection is advisory until the recomputed topology matches it
          // exactly; rollback both sides before considering another transfer.
          for (const cell of transferableComponent) regionId[cell] = sourceRegion;
          for (const cell of waterSwaps) regionId[cell] = targetRegion;
          continue;
        }
        remainingTotal -= transferableComponent.length;
        if (component.length < 64) remainingMinor -= transferableComponent.length;
      }
    }
  }
  const finalCounts = Array<number>(REGION_COUNT).fill(0);
  for (const region of regionId) finalCounts[region] += 1;
  if (finalCounts.some((count, region) => count !== initialCounts[region])) {
    fail('GREATER_REALM_BARRIER_REGION_RECONCILIATION_BALANCE_FAILED');
  }
}

function barriersAndGates(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  uplift: Int32Array,
  waterRegime: Uint8Array,
  tierId: Uint8Array,
  regionId: Uint8Array,
  gateGraph: readonly GreaterRealmGateGraphEdge[],
  legacyProtectedCell: Uint8Array,
  tierTwoPassableOwner: Int8Array,
  tierTwoSpineOwner: Int8Array,
  repairImmutableCell?: Uint8Array,
): Readonly<{
  barrier: Uint8Array;
  geologicalBarrierBand: Uint8Array;
  barrierCrossSections: readonly GreaterRealmPrivateBarrierCrossSection[];
  gates: readonly GreaterRealmPrivateGate[];
  barrierProof: boolean;
  gateApproachProof: boolean;
  gateRouteRedundancyProof: boolean;
  gateGraphProof: boolean;
  passableRegionProof: boolean;
  regionGraphProof: boolean;
  passableTopology: GreaterRealmPassableRegionTopology;
  highlandBarrierShareBasisPoints: number;
  barrierMeanElevationAdvantage: number;
  barrierMeanUpliftAdvantage: number;
  measuredMinimumBarrierWidth: number;
  measuredMaximumBarrierWidth: number;
  geologicalHighlandProof: boolean;
}> {
  const boundary = new Uint8Array(grid.cellCount);
  const outerBoundary = new Uint8Array(grid.cellCount);
  const innerBoundary = new Uint8Array(grid.cellCount);
  const edgesByPair = new Map<string, Array<readonly [number, number]>>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
      boundary[cell] = 1;
      boundary[neighbor] = 1;
      const systemBoundary = Math.min(tierId[cell]!, tierId[neighbor]!) === 1
        ? outerBoundary
        : innerBoundary;
      systemBoundary[cell] = 1;
      systemBoundary[neighbor] = 1;
      const firstRegion = Math.min(regionId[cell]!, regionId[neighbor]!);
      const secondRegion = Math.max(regionId[cell]!, regionId[neighbor]!);
      const key = `${firstRegion}:${secondRegion}`;
      const edges = edgesByPair.get(key) ?? [];
      const firstCell = regionId[cell] === firstRegion ? cell : neighbor;
      const secondCell = firstCell === cell ? neighbor : cell;
      edges.push(Object.freeze([firstCell, secondCell] as const));
      edgesByPair.set(key, edges);
    }
  }
  const distanceWithinTier = (systemBoundary: Uint8Array): Uint16Array => {
    const distance = new Uint16Array(grid.cellCount);
    distance.fill(0xffff);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (systemBoundary[cell] !== 1) continue;
      distance[cell] = 0;
      queue[tail++] = cell;
    }
    while (head < tail) {
      const cell = queue[head++]!;
      const nextDistance = distance[cell]! + 1;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || tierId[neighbor] !== tierId[cell]
          || distance[neighbor] !== 0xffff
        ) continue;
        distance[neighbor] = nextDistance;
        queue[tail++] = neighbor;
      }
    }
    return distance;
  };
  const distanceToOuterBoundary = distanceWithinTier(outerBoundary);
  const distanceToInnerBoundary = distanceWithinTier(innerBoundary);
  const barrier = new Uint8Array(grid.cellCount);
  const geologicalBarrierBand = new Uint8Array(grid.cellCount);
  const landElevations = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => (
      strategicallyPassableSurface(waterRegime[cell]!)
      && elevation[cell]! > SEA_LEVEL
      && legacyProtectedCell[cell] !== 1
    ))
    .map(cell => elevation[cell]!)
    .sort((first, second) => first - second);
  const landUplift = Array.from({ length: grid.cellCount }, (_, cell) => cell)
    .filter(cell => (
      strategicallyPassableSurface(waterRegime[cell]!)
      && elevation[cell]! > SEA_LEVEL
      && legacyProtectedCell[cell] !== 1
    ))
    .map(cell => uplift[cell]!)
    .sort((first, second) => first - second);
  if (landElevations.length === 0 || landUplift.length === 0) {
    rejectGreaterRealmCandidate('GREATER_REALM_STRATEGIC_HIGHLAND_REFERENCE_MISSING');
  }
  const highlandElevation = landElevations[Math.floor(landElevations.length * 0.58)]!;
  const highlandUplift = landUplift[Math.floor(landUplift.length * 0.58)]!;
  // Materialize the final band from nearest-boundary distance inside each
  // tier. Outer Crown arms use two cells per side (four total); the stronger
  // Inner Throne arms use three per side (six total). Width is therefore a
  // property of the completed band, not a configured number pasted into the
  // report. Water cells remain explicit, counted natural barrier assistance.
  const OUTER_BARRIER_SIDE_LAYERS = 2;
  const INNER_BARRIER_SIDE_LAYERS = 3;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] === 1) continue;
    if (distanceToOuterBoundary[cell]! < OUTER_BARRIER_SIDE_LAYERS) {
      geologicalBarrierBand[cell] |= 1;
    }
    if (distanceToInnerBoundary[cell]! < INNER_BARRIER_SIDE_LAYERS) {
      geologicalBarrierBand[cell] |= 2;
    }
    if (
      geologicalBarrierBand[cell] !== 0
      && strategicallyPassableSurface(waterRegime[cell]!)
      && (
        boundary[cell] === 1
        || elevation[cell]! >= highlandElevation
        || uplift[cell]! >= highlandUplift
      )
    ) barrier[cell] = 1;
  }
  // The allocator's inner-to-outer spines are political and traversal
  // authority, not a request to punch extra Crown crossings. Keep only their
  // same-tier interior open; every cell touching another tier remains under
  // the ordinary sealed-boundary and reviewed-gate rules below.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (tierTwoSpineOwner[cell] >= 0 && boundary[cell] === 0) barrier[cell] = 0;
  }
  const sidePath = (
    endpoint: number,
    system: 1 | 2,
  ): number[] => {
    if (
      legacyProtectedCell[endpoint] === 1
      || (geologicalBarrierBand[endpoint]! & system) === 0
    ) return [];
    const previous = new Int32Array(grid.cellCount);
    previous.fill(-2);
    previous[endpoint] = -1;
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    let target = -1;
    queue[tail++] = endpoint;
    while (head < tail) {
      const cell = queue[head++]!;
      let exitsBand = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === tierId[endpoint]
          && legacyProtectedCell[neighbor] !== 1
          && (geologicalBarrierBand[neighbor]! & system) === 0
        ) {
          exitsBand = true;
          break;
        }
      }
      if (exitsBand) {
        target = cell;
        break;
      }
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || previous[neighbor] !== -2
          || tierId[neighbor] !== tierId[endpoint]
          || legacyProtectedCell[neighbor] === 1
          || (geologicalBarrierBand[neighbor]! & system) === 0
        ) continue;
        previous[neighbor] = cell;
        queue[tail++] = neighbor;
      }
    }
    if (target < 0) return [];
    const path: number[] = [];
    for (let cell = target; cell >= 0; cell = previous[cell]!) path.push(cell);
    path.reverse();
    return path;
  };
  const barrierCrossSections: GreaterRealmPrivateBarrierCrossSection[] = [];
  for (const edges of edgesByPair.values()) {
    for (const [first, second] of edges) {
      if (
        !strategicallyPassableSurface(waterRegime[first]!)
        || !strategicallyPassableSurface(waterRegime[second]!)
      ) continue;
      const system = (Math.min(tierId[first]!, tierId[second]!) === 1 ? 1 : 2) as 1 | 2;
      const firstCells = sidePath(first, system);
      const secondCells = sidePath(second, system);
      const firstSideCellCount = firstCells.length;
      if (
        firstSideCellCount < 2
        || firstSideCellCount > 4
        || secondCells.length < 2
        || secondCells.length > 4
      ) continue;
      const cells = [...firstCells.reverse(), ...secondCells];
      // Concave corners can make a longitudinal walk much longer than the
      // band's normal distance. Store only bounded local normal witnesses;
      // the complete band itself is independently proven from the distance
      // fields below.
      if (cells.length < 4 || cells.length > 8) continue;
      barrierCrossSections.push(Object.freeze({
        firstCell: first,
        secondCell: second,
        system,
        firstSideCellCount,
        waterAssistedCellCount: cells.filter(cell => (
          !strategicallyPassableSurface(waterRegime[cell]!)
        )).length,
        // Keep private coordinate buffers mutable so package retirement can
        // overwrite them in place.
        cells,
      }));
    }
  }
  const gates: GreaterRealmPrivateGate[] = [];
  const baseRobustTopology = robustRegionTopology(grid, regionId, waterRegime, barrier);
  const preGateBarrier = new Uint8Array(barrier);
  const usedGateCells = new Set<number>();
  const protectedApproachCells = new Set<number>();
  const requiredApproachCells = new Set<number>();
  const gateChannel = greaterRealmTerrainChannelId('sealed-gate-saddle');
  type GateApproaches = Readonly<{
    first: readonly number[];
    firstAlternate: readonly number[];
    second: readonly number[];
    secondAlternate: readonly number[];
    all: readonly (readonly number[])[];
  }>;
  type GateSelection = Readonly<{
    edge: readonly [number, number];
    approaches: GateApproaches;
  }>;
  type GateApproachCandidate = Readonly<{
    edge: readonly [number, number];
    first: readonly (readonly number[])[];
    second: readonly (readonly number[])[];
  }>;
  for (const [firstRegion, secondRegion] of gateGraph) {
    const key = `${Math.min(firstRegion, secondRegion)}:${Math.max(firstRegion, secondRegion)}`;
    const candidates = [...(edgesByPair.get(key) ?? [])].filter(([first, second]) => (
      waterRegime[first] === 0
      && waterRegime[second] === 0
      && barrier[first] === 1
      && barrier[second] === 1
    ));
    candidates.sort(([firstA, secondA], [firstB, secondB]) => {
      const score = (first: number, second: number) => elevation[first]! + elevation[second]!
        + (greaterRealmCounterRandomU32(
          candidateSeed,
          gateChannel,
          grid.q[first]!,
          grid.r[first]!,
        ) % 4_001);
      return score(firstA, secondA) - score(firstB, secondB)
        || firstA - firstB
        || secondA - secondB;
    });
    const approachCandidates: GateApproachCandidate[] = [];
    for (const edge of candidates) {
      if (
        usedGateCells.has(edge[0])
        || usedGateCells.has(edge[1])
        || protectedApproachCells.has(edge[0])
        || protectedApproachCells.has(edge[1])
      ) continue;
      // Endpoints must be distinct, but a narrow geological saddle may carry
      // both sealed crossings. Requiring an arbitrary six-cell separation
      // rejected otherwise valid natural passes on island/coastal frontiers.
      const firstApproaches = barrierApproachPaths(
        grid,
        edge[0],
        firstRegion,
        regionId,
        waterRegime,
        barrier,
        baseRobustTopology.componentId,
        baseRobustTopology.componentSizes,
      );
      const secondApproaches = barrierApproachPaths(
        grid,
        edge[1],
        secondRegion,
        regionId,
        waterRegime,
        barrier,
        baseRobustTopology.componentId,
        baseRobustTopology.componentSizes,
      );
      if (!firstApproaches || !secondApproaches) continue;
      approachCandidates.push(Object.freeze({
        edge,
        first: firstApproaches,
        second: secondApproaches,
      }));
    }
    // Choose both gates as one deterministic pair. A greedy first selection
    // can consume the only independent corridor on a narrow frontier even
    // when a later pair is valid; pairwise selection provides real route
    // redundancy without making ordinary candidate yield order-dependent.
    let selected: readonly GateSelection[] = Object.freeze([]);
    for (let firstIndex = 0; firstIndex < approachCandidates.length; firstIndex += 1) {
      const firstCandidate = approachCandidates[firstIndex]!;
      for (let firstOptionOrdinal = 0; firstOptionOrdinal < 32; firstOptionOrdinal += 1) {
        const firstApproaches = compatibleGateApproaches(
          grid,
          tierId,
          waterRegime,
          barrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
          firstCandidate.first,
          firstCandidate.second,
          firstOptionOrdinal,
        );
        if (!firstApproaches) break;
        if (firstApproaches.all.some(path => path.some(cell => usedGateCells.has(cell)))) continue;
        for (let secondIndex = 0; secondIndex < approachCandidates.length; secondIndex += 1) {
          if (secondIndex === firstIndex) continue;
          const secondCandidate = approachCandidates[secondIndex]!;
          const endpointSet = new Set([
            ...firstCandidate.edge,
            ...secondCandidate.edge,
          ]);
          if (endpointSet.size !== 4) continue;
          for (let secondOptionOrdinal = 0; secondOptionOrdinal < 32; secondOptionOrdinal += 1) {
            const secondApproaches = compatibleGateApproaches(
              grid,
              tierId,
              waterRegime,
              barrier,
              baseRobustTopology.componentId,
              baseRobustTopology.componentSizes,
              secondCandidate.first,
              secondCandidate.second,
              secondOptionOrdinal,
            );
            if (!secondApproaches) break;
            const allPaths: readonly (readonly number[])[] = Object.freeze([
              ...firstApproaches.all,
              ...secondApproaches.all,
            ]);
            if (allPaths.some((path: readonly number[]) => path.some((cell: number) => (
              usedGateCells.has(cell) || endpointSet.has(cell)
            )))) continue;
            const combinedCarved: Set<number> = new Set<number>(
              allPaths.flatMap((path: readonly number[]) => [...path]),
            );
            const tentativeGatePairs = [
            ...gates.map(gate => Object.freeze([
              gate.firstCell,
              gate.secondCell,
            ] as const)),
            firstCandidate.edge,
            secondCandidate.edge,
            ] as const;
            const tentativeGateMate = new Map<number, number>();
            for (const [firstEndpoint, secondEndpoint] of tentativeGatePairs) {
              tentativeGateMate.set(firstEndpoint, secondEndpoint);
              tentativeGateMate.set(secondEndpoint, firstEndpoint);
            }
            const unavoidableOpenApproaches = new Set<number>([
            ...requiredApproachCells,
            ...firstApproaches.first,
            ...firstApproaches.firstAlternate,
            ...firstApproaches.second,
            ...firstApproaches.secondAlternate,
            ...secondApproaches.first,
            ...secondApproaches.firstAlternate,
            ...secondApproaches.second,
            ...secondApproaches.secondAlternate,
            ]);
          // Opening a reviewed gate pair must expose exactly that one physical
          // cross-tier edge. Reject endpoints whose neighbouring gate mouths
          // or required approaches would become an unrecorded side entrance.
          // Non-required carved shoulders may still be re-sealed after the
          // same-tier coherence repair below.
            let isolatedGateMouths = true;
            for (const [endpoint, mate] of tentativeGateMate) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor < 0
                || tierId[endpoint] === tierId[neighbor]
                || !strategicallyPassableSurface(waterRegime[endpoint]!)
                || !strategicallyPassableSurface(waterRegime[neighbor]!)
                || neighbor === mate
              ) continue;
              if (
                tentativeGateMate.has(neighbor)
                || unavoidableOpenApproaches.has(neighbor)
              ) {
                isolatedGateMouths = false;
                break;
              }
            }
              if (!isolatedGateMouths) break;
            }
            if (!isolatedGateMouths) continue;
            let combinedBypass = false;
            for (const cell of combinedCarved) {
            for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
              const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
              if (
                neighbor >= 0
                && tierId[cell] !== tierId[neighbor]
                && strategicallyPassableSurface(waterRegime[cell]!)
                && strategicallyPassableSurface(waterRegime[neighbor]!)
                && (barrier[cell] === 0 || combinedCarved.has(cell))
                && (barrier[neighbor] === 0 || combinedCarved.has(neighbor))
              ) {
                combinedBypass = true;
                break;
              }
            }
              if (combinedBypass) break;
            }
            if (combinedBypass) continue;
            selected = Object.freeze([
              Object.freeze({ edge: firstCandidate.edge, approaches: firstApproaches }),
              Object.freeze({ edge: secondCandidate.edge, approaches: secondApproaches }),
            ]);
            break;
          }
          if (selected.length === 2) break;
        }
        if (selected.length === 2) break;
      }
      if (selected.length === 2) break;
    }
    for (const selection of selected) {
      usedGateCells.add(selection.edge[0]);
      usedGateCells.add(selection.edge[1]);
      for (const cell of selection.approaches.first) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.firstAlternate) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.second) requiredApproachCells.add(cell);
      for (const cell of selection.approaches.secondAlternate) requiredApproachCells.add(cell);
      for (const path of selection.approaches.all) {
        for (const cell of path) {
          barrier[cell] = 0;
          protectedApproachCells.add(cell);
        }
      }
    }
    for (const { edge: [firstCell, secondCell], approaches } of selected) {
      gates.push(Object.freeze({
        gateIndex: gates.length,
        firstRegion,
        secondRegion,
        firstCell,
        secondCell,
        firstApproachPath: approaches.first,
        firstAlternateApproachPath: approaches.firstAlternate,
        secondApproachPath: approaches.second,
        secondAlternateApproachPath: approaches.secondAlternate,
      }));
    }
  }
  const greedyGateAssignmentComplete = gateGraph.every(([firstRegion, secondRegion]) => (
    gates.filter(gate => (
      gate.firstRegion === firstRegion && gate.secondRegion === secondRegion
    )).length === 2
  ));
  if (!greedyGateAssignmentComplete) {
    // The ordinary path above remains authoritative whenever it succeeds.
    // Only an incomplete greedy assignment reaches this transactional fallback;
    // all search state is derived from the immutable pre-gate barrier and is
    // committed only after all nine region pairs have two valid gates.
    const MAX_OPTIONS_PER_EDGE = 32;
    const MAX_CANDIDATE_EDGES_PER_PAIR = 128;
    const MAX_BUNDLES_PER_PAIR = 128;
    const MAX_PAIR_ENUMERATION_NODES = 131_072;
    const MAX_GLOBAL_SEARCH_NODES = 32_768;
    type GateBundle = Readonly<{
      graphIndex: number;
      selections: readonly [GateSelection, GateSelection];
    }>;
    const selectionsAreGloballyCompatible = (
      selections: readonly GateSelection[],
    ): boolean => {
      const gateMate = new Map<number, number>();
      for (const { edge: [firstEndpoint, secondEndpoint] } of selections) {
        if (gateMate.has(firstEndpoint) || gateMate.has(secondEndpoint)) return false;
        gateMate.set(firstEndpoint, secondEndpoint);
        gateMate.set(secondEndpoint, firstEndpoint);
      }
      const carved = new Set<number>();
      for (const selection of selections) {
        for (const path of selection.approaches.all) {
          for (const cell of path) {
            if (gateMate.has(cell)) return false;
            carved.add(cell);
          }
        }
      }
      // Opening any selected endpoint must expose only its reviewed mate. A
      // neighbouring gate endpoint or required approach would become a second
      // entrance and therefore invalidates the whole partial assignment.
      for (const [endpoint, mate] of gateMate) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || neighbor === mate
            || tierId[endpoint] === tierId[neighbor]
            || !strategicallyPassableSurface(waterRegime[endpoint]!)
            || !strategicallyPassableSurface(waterRegime[neighbor]!)
          ) continue;
          if (gateMate.has(neighbor) || carved.has(neighbor)) return false;
        }
      }
      // Pair-local validation is insufficient when routes from different graph
      // arms combine. Re-evaluate the complete carved set at every DFS node so
      // two individually safe bundles cannot jointly open an ungated bypass.
      for (const cell of carved) {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && tierId[cell] !== tierId[neighbor]
            && strategicallyPassableSurface(waterRegime[cell]!)
            && strategicallyPassableSurface(waterRegime[neighbor]!)
            && (preGateBarrier[cell] === 0 || carved.has(cell))
            && (preGateBarrier[neighbor] === 0 || carved.has(neighbor))
          ) return false;
        }
      }
      return true;
    };
    const enumeratePairBundles = (
      graphIndex: number,
      firstRegion: number,
      secondRegion: number,
    ): readonly GateBundle[] => {
      const key = `${Math.min(firstRegion, secondRegion)}:${Math.max(firstRegion, secondRegion)}`;
      const candidates = [...(edgesByPair.get(key) ?? [])].filter(([first, second]) => (
        waterRegime[first] === 0
        && waterRegime[second] === 0
        && preGateBarrier[first] === 1
        && preGateBarrier[second] === 1
      ));
      candidates.sort(([firstA, secondA], [firstB, secondB]) => {
        const score = (first: number, second: number) => elevation[first]! + elevation[second]!
          + (greaterRealmCounterRandomU32(
            candidateSeed,
            gateChannel,
            grid.q[first]!,
            grid.r[first]!,
          ) % 4_001);
        return score(firstA, secondA) - score(firstB, secondB)
          || firstA - firstB
          || secondA - secondB;
      });
      const options: Array<Readonly<{
        edge: readonly [number, number];
        approaches: readonly GateApproaches[];
      }>> = [];
      for (
        let candidateIndex = 0;
        candidateIndex < Math.min(candidates.length, MAX_CANDIDATE_EDGES_PER_PAIR);
        candidateIndex += 1
      ) {
        const edge = candidates[candidateIndex]!;
        const firstApproaches = barrierApproachPaths(
          grid,
          edge[0],
          firstRegion,
          regionId,
          waterRegime,
          preGateBarrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
        );
        const secondApproaches = barrierApproachPaths(
          grid,
          edge[1],
          secondRegion,
          regionId,
          waterRegime,
          preGateBarrier,
          baseRobustTopology.componentId,
          baseRobustTopology.componentSizes,
        );
        if (!firstApproaches || !secondApproaches) continue;
        const approachOptions: GateApproaches[] = [];
        for (let optionOrdinal = 0; optionOrdinal < MAX_OPTIONS_PER_EDGE; optionOrdinal += 1) {
          const approaches = compatibleGateApproaches(
            grid,
            tierId,
            waterRegime,
            preGateBarrier,
            baseRobustTopology.componentId,
            baseRobustTopology.componentSizes,
            firstApproaches,
            secondApproaches,
            optionOrdinal,
          );
          if (!approaches) break;
          approachOptions.push(approaches);
        }
        if (approachOptions.length > 0) {
          options.push(Object.freeze({
            edge,
            approaches: Object.freeze(approachOptions),
          }));
        }
      }
      const bundles: GateBundle[] = [];
      const endpointQuartetCounts = new Map<string, number>();
      let enumerationNodes = 0;
      pairEnumeration:
      for (let firstIndex = 0; firstIndex < options.length; firstIndex += 1) {
        const first = options[firstIndex]!;
        for (let secondIndex = firstIndex + 1; secondIndex < options.length; secondIndex += 1) {
          const second = options[secondIndex]!;
          const endpoints = [...first.edge, ...second.edge];
          if (new Set(endpoints).size !== 4) continue;
          const quartetKey = [...endpoints].sort((left, right) => left - right).join(':');
          const maximumDiagonal = first.approaches.length + second.approaches.length - 2;
          for (let diagonal = 0; diagonal <= maximumDiagonal; diagonal += 1) {
            const firstOptionMaximum = Math.min(diagonal, first.approaches.length - 1);
            const firstOptionMinimum = Math.max(0, diagonal - second.approaches.length + 1);
            for (
              let firstOption = firstOptionMaximum;
              firstOption >= firstOptionMinimum;
              firstOption -= 1
            ) {
              const secondOption = diagonal - firstOption;
              if (enumerationNodes >= MAX_PAIR_ENUMERATION_NODES) break pairEnumeration;
              enumerationNodes += 1;
              if ((endpointQuartetCounts.get(quartetKey) ?? 0) >= 2) continue;
              const firstApproaches = first.approaches[firstOption]!;
              const secondApproaches = second.approaches[secondOption]!;
              const selections = Object.freeze([
                Object.freeze({ edge: first.edge, approaches: firstApproaches }),
                Object.freeze({ edge: second.edge, approaches: secondApproaches }),
              ] as const);
              if (!selectionsAreGloballyCompatible(selections)) continue;
              endpointQuartetCounts.set(
                quartetKey,
                (endpointQuartetCounts.get(quartetKey) ?? 0) + 1,
              );
              bundles.push(Object.freeze({ graphIndex, selections }));
              if (bundles.length >= MAX_BUNDLES_PER_PAIR) break pairEnumeration;
            }
          }
        }
      }
      return Object.freeze(bundles);
    };
    const plans = gateGraph.map(([firstRegion, secondRegion], graphIndex) => Object.freeze({
      graphIndex,
      bundles: enumeratePairBundles(graphIndex, firstRegion, secondRegion),
    }));
    let fallbackSolution: readonly GateBundle[] | undefined;
    if (plans.every(plan => plan.bundles.length > 0)) {
      const constrainedPlans = [...plans].sort((first, second) => (
        first.bundles.length - second.bundles.length
        || first.graphIndex - second.graphIndex
      ));
      const chosen: GateBundle[] = [];
      let searchNodes = 0;
      const search = (depth: number): boolean => {
        if (depth === constrainedPlans.length) {
          fallbackSolution = Object.freeze([...chosen]);
          return true;
        }
        const plan = constrainedPlans[depth]!;
        for (const bundle of plan.bundles) {
          if (searchNodes >= MAX_GLOBAL_SEARCH_NODES) return false;
          searchNodes += 1;
          const selections = [
            ...chosen.flatMap(selected => selected.selections),
            ...bundle.selections,
          ];
          if (!selectionsAreGloballyCompatible(selections)) continue;
          chosen.push(bundle);
          if (search(depth + 1)) return true;
          chosen.pop();
        }
        return false;
      };
      search(0);
    }
    if (fallbackSolution?.length === gateGraph.length) {
      const solutionByGraphIndex = new Map(
        fallbackSolution.map(bundle => [bundle.graphIndex, bundle] as const),
      );
      // Selected greedy routes are private coordinate buffers. Retire them
      // before replacing the incomplete assignment, then restore the exact
      // pre-gate barrier and commit the complete solution in graph order.
      const retiredPaths = new Set<readonly number[]>();
      for (const gate of gates) {
        for (const path of [
          gate.firstApproachPath,
          gate.firstAlternateApproachPath,
          gate.secondApproachPath,
          gate.secondAlternateApproachPath,
        ]) retiredPaths.add(path);
      }
      for (const path of retiredPaths) (path as number[]).fill(0);
      barrier.set(preGateBarrier);
      gates.length = 0;
      usedGateCells.clear();
      protectedApproachCells.clear();
      requiredApproachCells.clear();
      for (let graphIndex = 0; graphIndex < gateGraph.length; graphIndex += 1) {
        const bundle = solutionByGraphIndex.get(graphIndex)!;
        const [firstRegion, secondRegion] = gateGraph[graphIndex]!;
        for (const selection of bundle.selections) {
          usedGateCells.add(selection.edge[0]);
          usedGateCells.add(selection.edge[1]);
          for (const cell of selection.approaches.first) requiredApproachCells.add(cell);
          for (const cell of selection.approaches.firstAlternate) {
            requiredApproachCells.add(cell);
          }
          for (const cell of selection.approaches.second) requiredApproachCells.add(cell);
          for (const cell of selection.approaches.secondAlternate) {
            requiredApproachCells.add(cell);
          }
          for (const path of selection.approaches.all) {
            for (const cell of path) {
              barrier[cell] = 0;
              protectedApproachCells.add(cell);
            }
          }
          gates.push(Object.freeze({
            gateIndex: gates.length,
            firstRegion,
            secondRegion,
            firstCell: selection.edge[0],
            secondCell: selection.edge[1],
            firstApproachPath: selection.approaches.first,
            firstAlternateApproachPath: selection.approaches.firstAlternate,
            secondApproachPath: selection.approaches.second,
            secondAlternateApproachPath: selection.approaches.secondAlternate,
          }));
        }
      }
    }
  }
  // Approach carving for a later pass may cross the shoulder of an earlier
  // pass in the same region. Gate endpoints themselves are immutable sealed
  // barrier cells; restore that invariant before graph/topology proofs.
  const lockedGateEndpoint = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    barrier[gate.firstCell] = 1;
    barrier[gate.secondCell] = 1;
    lockedGateEndpoint[gate.firstCell] = 1;
    lockedGateEndpoint[gate.secondCell] = 1;
  }
  // A cross-tier edge only needs one sealed side. Keeping both sides of every
  // edge turned natural passes into broad lowland walls and split otherwise
  // coherent regions. Retain the geologically stronger side of each ordinary
  // boundary edge, while leaving the two reviewed cells of every gate sealed.
  const retainedBoundaryBarrier = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) continue;
      const selectable = (candidate: number) => (
        legacyProtectedCell[candidate] !== 1
        && !protectedApproachCells.has(candidate)
      );
      let selected = -1;
      if (lockedGateEndpoint[cell] === 1) selected = cell;
      else if (lockedGateEndpoint[neighbor] === 1) selected = neighbor;
      else if (!selectable(cell)) selected = selectable(neighbor) ? neighbor : -1;
      else if (!selectable(neighbor)) selected = cell;
      else {
        const cellHighland = elevation[cell]! >= highlandElevation
          || uplift[cell]! >= highlandUplift;
        const neighborHighland = elevation[neighbor]! >= highlandElevation
          || uplift[neighbor]! >= highlandUplift;
        if (cellHighland !== neighborHighland) selected = cellHighland ? cell : neighbor;
        else {
          const cellScore = elevation[cell]! * 4 + uplift[cell]!;
          const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
          selected = cellScore > neighborScore
            ? cell
            : neighborScore > cellScore ? neighbor : Math.min(cell, neighbor);
        }
      }
      if (selected >= 0) retainedBoundaryBarrier[selected] = 1;
    }
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (boundary[cell] !== 1) continue;
    if (lockedGateEndpoint[cell] === 1) barrier[cell] = 1;
    else if (protectedApproachCells.has(cell)) barrier[cell] = 0;
    else barrier[cell] = retainedBoundaryBarrier[cell]!;
  }
  reconnectBarrierSplitRegionComponents(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    gates,
    repairImmutableCell ? {
      geologicalBarrierBand,
      legacyProtectedCell,
      repairImmutableCell,
      protectedApproachCells,
    } : undefined,
  );
  reconcileBarrierMeasuredRegionCoherence(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    legacyProtectedCell,
    protectedApproachCells,
    repairImmutableCell,
  );
  // Same-tier coherence repair must never become the last writer on a Crown
  // boundary. Re-seal any newly exposed cross-tier edge on an unreviewed,
  // non-approach side; a contact protected on both sides remains an explicit
  // proof failure instead of silently becoming an extra gate.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
        || barrier[cell] === 1
        || barrier[neighbor] === 1
      ) continue;
      const cellProtected = protectedApproachCells.has(cell);
      const neighborProtected = protectedApproachCells.has(neighbor);
      if (cellProtected && neighborProtected) {
        const cellRequired = requiredApproachCells.has(cell);
        const neighborRequired = requiredApproachCells.has(neighbor);
        if (cellRequired && neighborRequired) continue;
        if (cellRequired) barrier[neighbor] = 1;
        else if (neighborRequired) barrier[cell] = 1;
        else {
          const cellScore = elevation[cell]! * 4 + uplift[cell]!;
          const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
          barrier[cellScore >= neighborScore ? cell : neighbor] = 1;
        }
        continue;
      }
      if (cellProtected) barrier[neighbor] = 1;
      else if (neighborProtected) barrier[cell] = 1;
      else {
        const cellScore = elevation[cell]! * 4 + uplift[cell]!;
        const neighborScore = elevation[neighbor]! * 4 + uplift[neighbor]!;
        barrier[cellScore >= neighborScore ? cell : neighbor] = 1;
      }
    }
  }
  // Reconcile the final impassable crest to the measured geological band after
  // every coherence mutation. The broader band intentionally includes
  // traversable foothills; every blocking cell must nevertheless be part of
  // that band, while the independent cross-tier cut proof guarantees that no
  // foothill creates an ungated route through the system.
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] === 1) continue;
    if (geologicalBarrierBand[cell] === 0) barrier[cell] = 0;
  }
  // A gate is a single reviewed physical edge, not merely a label placed on a
  // broad pass. Model the future open state without mutating the sealed gate
  // endpoints: every other passable cross-tier neighbour must remain sealed.
  // Required primary approaches are never sacrificed to manufacture this
  // proof; a collision with one makes the candidate ineligible instead.
  const gateMate = new Int32Array(grid.cellCount);
  gateMate.fill(-1);
  let gatePhysicalCorridorProof = true;
  for (const gate of gates) {
    if (gateMate[gate.firstCell] >= 0 || gateMate[gate.secondCell] >= 0) {
      gatePhysicalCorridorProof = false;
      continue;
    }
    gateMate[gate.firstCell] = gate.secondCell;
    gateMate[gate.secondCell] = gate.firstCell;
  }
  for (let endpoint = 0; endpoint < grid.cellCount; endpoint += 1) {
    const mate = gateMate[endpoint]!;
    if (mate < 0) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor < 0
        || neighbor === mate
        || tierId[endpoint] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[endpoint]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
        || barrier[neighbor] === 1
      ) continue;
      if (gateMate[neighbor]! >= 0 || requiredApproachCells.has(neighbor)) {
        gatePhysicalCorridorProof = false;
      } else {
        barrier[neighbor] = 1;
      }
    }
  }
  // The corridor-isolation pass above can seal an additional shoulder cell
  // beside a gate mouth after the ordinary coherence repair has completed.
  // Reconnect same-region fragments once more against that final sealed mask.
  // The repair keeps every gate endpoint and every cross-tier-adjacent barrier
  // cell locked, so it cannot manufacture an unreviewed Crown crossing.
  reconnectBarrierSplitRegionComponents(
    grid,
    regionId,
    tierId,
    waterRegime,
    barrier,
    gates,
    repairImmutableCell ? {
      geologicalBarrierBand,
      legacyProtectedCell,
      repairImmutableCell,
      protectedApproachCells,
    } : undefined,
  );
  if (repairImmutableCell) {
    sealGreaterRealmRepairBarrierPockets({
      grid,
      regionId,
      tierId,
      waterRegime,
      barrier,
      geologicalBarrierBand,
      legacyProtectedCell,
      repairImmutableCell,
      protectedApproachCells,
      gates,
      tierTwoSpineOwner,
    });
  }
  assertTierTwoCapacityAuthority({
    grid,
    tierId,
    regionId,
    waterRegime,
    tierTwoPassableOwner,
    tierTwoSpineOwner,
    barrier,
  });
  let futureOpenCrossTierEdges = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor <= cell
        || tierId[cell] === tierId[neighbor]
        || !strategicallyPassableSurface(waterRegime[cell]!)
        || !strategicallyPassableSurface(waterRegime[neighbor]!)
      ) continue;
      const cellWouldBeOpen = barrier[cell] === 0 || gateMate[cell]! >= 0;
      const neighborWouldBeOpen = barrier[neighbor] === 0 || gateMate[neighbor]! >= 0;
      if (!cellWouldBeOpen || !neighborWouldBeOpen) continue;
      futureOpenCrossTierEdges += 1;
      if (gateMate[cell] !== neighbor || gateMate[neighbor] !== cell) {
        gatePhysicalCorridorProof = false;
      }
    }
  }
  if (futureOpenCrossTierEdges !== gates.length) gatePhysicalCorridorProof = false;
  let barrierProof = true;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (
        neighbor >= 0
        && tierId[cell] !== tierId[neighbor]
        && strategicallyPassableSurface(waterRegime[cell]!)
        && strategicallyPassableSurface(waterRegime[neighbor]!)
        && barrier[cell] !== 1
        && barrier[neighbor] !== 1
      ) barrierProof = false;
    }
  }
  const gateGraphProof = gatePhysicalCorridorProof
    && gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gateGraph.length === 9
    && gateGraph.every(([firstRegion, secondRegion]) => {
      const pairGates = gates.filter(gate => (
        gate.firstRegion === firstRegion && gate.secondRegion === secondRegion
      ));
      return pairGates.length === 2 && pairGates.every(gate => {
        if (
          regionId[gate.firstCell] !== firstRegion
          || regionId[gate.secondCell] !== secondRegion
          || waterRegime[gate.firstCell] !== 0
          || waterRegime[gate.secondCell] !== 0
        ) return false;
        if (barrier[gate.firstCell] !== 1 || barrier[gate.secondCell] !== 1) return false;
        const neighborOffset = gate.firstCell * HEX_NEIGHBOR_COUNT;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          if (grid.neighbors[neighborOffset + direction] === gate.secondCell) return true;
        }
        return false;
      });
    });
  const passableTopology = passableRegionTopology(grid, regionId, waterRegime, barrier);
  const robustTopology = robustRegionTopology(grid, regionId, waterRegime, barrier);
  const adjacentGateApproachProof = gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gates.every(gate => ([
      [gate.firstCell, gate.firstRegion],
      [gate.secondCell, gate.secondRegion],
    ] as const).every(([endpoint, region]) => {
      const approachCells: number[] = [];
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && regionId[neighbor] === region
          && waterRegime[neighbor] === WATER_DRY
          && barrier[neighbor] === 0
          && passableTopology.componentId[neighbor]! >= 0
          && passableTopology.componentSizes[passableTopology.componentId[neighbor]!]! >= 64
        ) approachCells.push(neighbor);
      }
      return approachCells.length >= 1;
    }));
  const routeFinalRobustComponent = (
    endpoint: number,
    region: number,
    path: readonly number[],
  ): number => {
    if (path.length === 0 || new Set(path).size !== path.length) return -1;
    let startsAtEndpoint = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[endpoint * HEX_NEIGHBOR_COUNT + direction] === path[0]) {
        startsAtEndpoint = true;
        break;
      }
    }
    if (!startsAtEndpoint) return -1;
    for (let index = 0; index < path.length; index += 1) {
      const cell = path[index]!;
      if (
        regionId[cell] !== region
        || waterRegime[cell] !== WATER_DRY
        || barrier[cell] !== 0
      ) return -1;
      if (index > 0) {
        let adjacent = false;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          if (grid.neighbors[path[index - 1]! * HEX_NEIGHBOR_COUNT + direction] === cell) {
            adjacent = true;
            break;
          }
        }
        if (!adjacent) return -1;
      }
    }
    const target = path[path.length - 1]!;
    const component = robustTopology.componentId[target]!;
    return component >= 0 && robustTopology.componentSizes[component]! >= 64
      ? component
      : -1;
  };
  const routePairIsVertexDisjoint = (
    endpoint: number,
    region: number,
    primary: readonly number[],
    alternate: readonly number[],
  ): boolean => {
    if (
      primary.length === 0
      || alternate.length === 0
      || primary[0] === alternate[0]
      || !gateApproachCorridorsDisjoint(primary, alternate)
    ) return false;
    const primaryComponent = routeFinalRobustComponent(endpoint, region, primary);
    const alternateComponent = routeFinalRobustComponent(endpoint, region, alternate);
    return primaryComponent >= 0 && primaryComponent === alternateComponent;
  };
  const gateRouteRedundancyProof = gates.length === GREATER_REALM_REQUIRED_GATE_COUNT
    && gates.every(gate => (
      routePairIsVertexDisjoint(
        gate.firstCell,
        gate.firstRegion,
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
      )
      && routePairIsVertexDisjoint(
        gate.secondCell,
        gate.secondRegion,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      )
    ));
  const gateApproachProof = adjacentGateApproachProof && gateRouteRedundancyProof;
  // All ordinary cross-tier land contacts are sealed by the mountain cut.
  // Opening only the reviewed gate edges therefore derives (rather than
  // assumes) the future traversable region graph from the cell topology.
  const traversablePairs = new Set(gates.map(gate => `${gate.firstRegion}:${gate.secondRegion}`));
  const expectedPairs = new Set(gateGraph.map(
    ([firstRegion, secondRegion]) => `${firstRegion}:${secondRegion}`,
  ));
  const regionGraphProof = barrierProof
    && gateGraphProof
    && gateApproachProof
    && passableTopology.proof
    && traversablePairs.size === expectedPairs.size
    && [...traversablePairs].every(key => expectedPairs.has(key));
  let barrierCells = 0;
  let highlandBarrierCells = 0;
  let barrierElevationTotal = 0;
  let barrierUpliftTotal = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (barrier[cell] !== 1) continue;
    barrierCells += 1;
    barrierElevationTotal += elevation[cell]!;
    barrierUpliftTotal += uplift[cell]!;
    if (elevation[cell]! >= highlandElevation || uplift[cell]! >= highlandUplift) {
      highlandBarrierCells += 1;
    }
  }
  const landElevationTotal = landElevations.reduce((total, value) => total + value, 0);
  const landUpliftTotal = landUplift.reduce((total, value) => total + value, 0);
  const highlandBarrierShareBasisPoints = barrierCells === 0
    ? 0
    : Math.round((highlandBarrierCells * 10_000) / barrierCells);
  const barrierMeanElevationAdvantage = barrierCells === 0
    ? -INT32_MAX
    : Math.floor(barrierElevationTotal / barrierCells)
      - Math.floor(landElevationTotal / landElevations.length);
  const barrierMeanUpliftAdvantage = barrierCells === 0
    ? -INT32_MAX
    : Math.floor(barrierUpliftTotal / barrierCells)
      - Math.floor(landUpliftTotal / landUplift.length);
  let measuredMinimumBarrierWidth = INT32_MAX;
  let measuredMaximumBarrierWidth = 0;
  let barrierWidthProof = barrierCrossSections.length > 0;
  const measureBandSideThickness = (endpoint: number, system: 1 | 2): number => {
    if ((geologicalBarrierBand[endpoint]! & system) === 0) return 0;
    const distance = new Uint16Array(grid.cellCount);
    distance.fill(0xffff);
    const queue = new Uint32Array(grid.cellCount);
    let head = 0;
    let tail = 0;
    distance[endpoint] = 0;
    queue[tail++] = endpoint;
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId[neighbor] === tierId[endpoint]
          && legacyProtectedCell[neighbor] !== 1
          && (geologicalBarrierBand[neighbor]! & system) === 0
        ) return distance[cell]! + 1;
      }
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || distance[neighbor] !== 0xffff
          || tierId[neighbor] !== tierId[endpoint]
          || legacyProtectedCell[neighbor] === 1
          || (geologicalBarrierBand[neighbor]! & system) === 0
        ) continue;
        distance[neighbor] = distance[cell]! + 1;
        queue[tail++] = neighbor;
      }
    }
    return 0;
  };
  const expectedStrategicBoundaryPairs = new Set(gateGraph.map(
    ([firstRegion, secondRegion]) => `${firstRegion}:${secondRegion}`,
  ));
  let distanceFieldBandProof = true;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const expectedBand = legacyProtectedCell[cell] === 1
      ? 0
      : (distanceToOuterBoundary[cell]! < OUTER_BARRIER_SIDE_LAYERS ? 1 : 0)
        | (distanceToInnerBoundary[cell]! < INNER_BARRIER_SIDE_LAYERS ? 2 : 0);
    if (geologicalBarrierBand[cell] !== expectedBand) distanceFieldBandProof = false;
    if (barrier[cell] === 1 && geologicalBarrierBand[cell] === 0) {
      barrierWidthProof = false;
    }
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor <= cell || tierId[cell] === tierId[neighbor]) continue;
    }
  }
  const crossSectionEdges = new Set<string>();
  const witnessedStrategicBoundaryPairs = new Set<string>();
  for (const crossSection of barrierCrossSections) {
    const edgeKey = crossSection.firstCell < crossSection.secondCell
      ? `${crossSection.firstCell}:${crossSection.secondCell}`
      : `${crossSection.secondCell}:${crossSection.firstCell}`;
    if (crossSectionEdges.has(edgeKey)) barrierWidthProof = false;
    crossSectionEdges.add(edgeKey);
    const witnessedPair = [
      Math.min(regionId[crossSection.firstCell]!, regionId[crossSection.secondCell]!),
      Math.max(regionId[crossSection.firstCell]!, regionId[crossSection.secondCell]!),
    ].join(':');
    if (expectedStrategicBoundaryPairs.has(witnessedPair)) {
      witnessedStrategicBoundaryPairs.add(witnessedPair);
    }
    const firstThickness = measureBandSideThickness(
      crossSection.firstCell,
      crossSection.system,
    );
    const secondThickness = measureBandSideThickness(
      crossSection.secondCell,
      crossSection.system,
    );
    const measuredWidth = firstThickness + secondThickness;
    measuredMinimumBarrierWidth = Math.min(measuredMinimumBarrierWidth, measuredWidth);
    measuredMaximumBarrierWidth = Math.max(measuredMaximumBarrierWidth, measuredWidth);
    if (
      measuredWidth < 4
      || measuredWidth > 8
      || crossSection.cells.length !== measuredWidth
      || crossSection.firstSideCellCount !== firstThickness
      || crossSection.firstSideCellCount < 1
      || crossSection.firstSideCellCount >= crossSection.cells.length
      || crossSection.cells[crossSection.firstSideCellCount - 1] !== crossSection.firstCell
      || crossSection.cells[crossSection.firstSideCellCount] !== crossSection.secondCell
      || crossSection.waterAssistedCellCount !== crossSection.cells.filter(cell => (
        !strategicallyPassableSurface(waterRegime[cell]!)
      )).length
    ) barrierWidthProof = false;
    for (let index = 0; index < crossSection.cells.length; index += 1) {
      const cell = crossSection.cells[index]!;
      const expectedEndpoint = index < crossSection.firstSideCellCount
        ? crossSection.firstCell
        : crossSection.secondCell;
      if (
        legacyProtectedCell[cell] === 1
        || (geologicalBarrierBand[cell]! & crossSection.system) === 0
        || tierId[cell] !== tierId[expectedEndpoint]
      ) barrierWidthProof = false;
      if (index === 0) continue;
      const previous = crossSection.cells[index - 1]!;
      let adjacent = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        if (grid.neighbors[previous * HEX_NEIGHBOR_COUNT + direction] === cell) {
          adjacent = true;
          break;
        }
      }
      if (!adjacent) barrierWidthProof = false;
    }
  }
  if (barrierCrossSections.length === 0) measuredMinimumBarrierWidth = 0;
  barrierWidthProof = barrierWidthProof
    && distanceFieldBandProof
    && barrierProof
    && witnessedStrategicBoundaryPairs.size === expectedStrategicBoundaryPairs.size
    && [...witnessedStrategicBoundaryPairs].every(
      pair => expectedStrategicBoundaryPairs.has(pair),
    )
    && measuredMinimumBarrierWidth >= 4
    && measuredMaximumBarrierWidth <= 8;
  const geologicalHighlandProof = barrierWidthProof
    && highlandBarrierShareBasisPoints >= 6_500
    && (
      barrierMeanElevationAdvantage >= 300
      || barrierMeanUpliftAdvantage >= 100
    );
  return Object.freeze({
    barrier,
    geologicalBarrierBand,
    barrierCrossSections: Object.freeze(barrierCrossSections),
    gates: Object.freeze(gates),
    barrierProof,
    gateApproachProof,
    gateRouteRedundancyProof,
    gateGraphProof,
    passableRegionProof: passableTopology.proof,
    regionGraphProof,
    passableTopology,
    highlandBarrierShareBasisPoints,
    barrierMeanElevationAdvantage,
    barrierMeanUpliftAdvantage,
    measuredMinimumBarrierWidth,
    measuredMaximumBarrierWidth,
    geologicalHighlandProof,
  });
}

function castleAndPotentialSites(
  grid: IndexedAxialGrid,
  candidateSeed: GreaterRealmTerrainSeed,
  elevation: Int32Array,
  waterRegime: Uint8Array,
  tierId: Uint8Array,
  regionId: Uint8Array,
  barrier: Uint8Array,
  slope: Uint16Array,
  wetnessIndex: Uint16Array,
  distanceToFreshwater: Uint16Array,
  distanceToCoast: Uint16Array,
  landformId: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
  legacyProtectedCell: Uint8Array,
  legacyCastleSlot: Uint8Array,
): Readonly<{
  castleSlot: Uint8Array;
  resourcePotential: Uint8Array;
  corePotential: Uint8Array;
  castleCount: number;
  placementProof: boolean;
  resourcePotentialCount: number;
  corePotentialCount: number;
}> {
  type CastleOwnedArray =
    | Uint8Array
    | Uint16Array
    | Int32Array
    | Float64Array;
  const ownedArrays = new Set<CastleOwnedArray>();
  const retainedArrays = new Set<CastleOwnedArray>();
  const coordinateScratch: number[][] = [];
  const own = <T extends CastleOwnedArray>(array: T): T => {
    ownedArrays.add(array);
    return array;
  };
  const trackCoordinates = (cells: number[]): number[] => {
    coordinateScratch.push(cells);
    return cells;
  };
  try {
  const gateCells = own(new Uint8Array(grid.cellCount));
  const gateApproachCells = own(new Uint8Array(grid.cellCount));
  for (const gate of gates) {
    gateCells[gate.firstCell] = 1;
    gateCells[gate.secondCell] = 1;
    for (const path of [
      gate.firstApproachPath,
      gate.firstAlternateApproachPath,
      gate.secondApproachPath,
      gate.secondAlternateApproachPath,
    ]) {
      for (const cell of path) gateApproachCells[cell] = 1;
    }
  }
  const gateDistance = own(gates.length > 0
    ? distanceFromMask(grid, gateCells)
    : new Uint16Array(grid.cellCount).fill(0xffff));
  const topology = passableRegionTopology(grid, regionId, waterRegime, barrier);
  own(topology.componentId);
  const candidateChannel = greaterRealmTerrainChannelId('castle-suitability-order');
  const castleSlot = own(new Uint8Array(legacyCastleSlot));
  const selectedAll = trackCoordinates([]);
  let castleCount = 0;
  for (let cell = 0; cell < castleSlot.length; cell += 1) {
    if (castleSlot[cell] !== 1) continue;
    castleCount += 1;
    selectedAll.push(cell);
  }
  if (castleCount !== GREATER_REALM_LEGACY_LOWLANDS_LOCK_PINS_V1.castleSlotCount) {
    fail('GREATER_REALM_LEGACY_CASTLE_SLOT_COUNT_INVALID');
  }
  const distributionSectorByCell = own(
    deriveGreaterRealmSupportNormalizedAngularSectors({
      grid,
      regionId,
      waterRegime,
      barrier,
      regionCount: TIER_I_REGION_COUNT,
    }),
  );
  const distributionSector = (cell: number): number => {
    const sector = distributionSectorByCell[cell]!;
    if (sector >= HEX_NEIGHBOR_COUNT) {
      fail('GREATER_REALM_CASTLE_DISTRIBUTION_CELL_UNSUPPORTED');
    }
    return sector;
  };
  const stableCastleLandform = (landform: number): boolean => (
    landform === GREATER_REALM_LANDFORM_ID.COASTAL_PLAIN
    || landform === GREATER_REALM_LANDFORM_ID.LOWLAND
    || landform === GREATER_REALM_LANDFORM_ID.ROLLING_LOWLAND
    || landform === GREATER_REALM_LANDFORM_ID.HILL
    || landform === GREATER_REALM_LANDFORM_ID.HIGHLAND
    || landform === GREATER_REALM_LANDFORM_ID.ALPINE_PLATEAU
  );
  for (let region = 0; region < TIER_I_REGION_COUNT; region += 1) {
    // Region zero already contains the exact 100 deployed castle slots. The
    // other five regions receive dormant candidate slots only.
    if (region === 0) continue;
    const candidates = trackCoordinates([]);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        regionId[cell] !== region
        || tierId[cell] !== 1
        || waterRegime[cell] !== 0
        || barrier[cell] === 1
        || gateCells[cell] === 1
        || gateApproachCells[cell] === 1
        || gateDistance[cell]! < 3
        || slope[cell]! > 6_000
        || wetnessIndex[cell]! > 5_000
        || distanceToFreshwater[cell]! < 2
        || distanceToCoast[cell]! < 2
        || !stableCastleLandform(landformId[cell]!)
        || topology.componentId[cell]! < 0
        || topology.componentSizes[topology.componentId[cell]!]! < 200
      ) continue;
      let passableNeighbors = 0;
      let maximumDrop = 0;
      const neighborPassable = Array<boolean>(HEX_NEIGHBOR_COUNT).fill(false);
      for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
        if (neighbor < 0) continue;
        maximumDrop = Math.max(maximumDrop, Math.abs(elevation[cell]! - elevation[neighbor]!));
        if (
          regionId[neighbor] === region
          && waterRegime[neighbor] === 0
          && barrier[neighbor] === 0
          && gateCells[neighbor] === 0
          && gateApproachCells[neighbor] === 0
          && topology.componentId[neighbor] === topology.componentId[cell]
        ) {
          neighborPassable[directionIndex] = true;
          passableNeighbors += 1;
        }
      }
      const hasLocalAlternateRoute = neighborPassable.some((passable, direction) => (
        passable && neighborPassable[(direction + 1) % HEX_NEIGHBOR_COUNT]
      ));
      if (
        passableNeighbors === HEX_NEIGHBOR_COUNT
        && hasLocalAlternateRoute
        && maximumDrop <= 6_000
      ) {
        candidates.push(cell);
      }
    }
    let selected: number[] = [];
    for (let attempt = 0; attempt < 16 && selected.length < 100; attempt += 1) {
      const ordered = trackCoordinates([...candidates].sort((first, second) => {
        const sample = region * 32 + attempt;
        const firstScore = greaterRealmCounterRandomU32(
          candidateSeed,
          candidateChannel,
          grid.q[first]!,
          grid.r[first]!,
          sample,
        );
        const secondScore = greaterRealmCounterRandomU32(
          candidateSeed,
          candidateChannel,
          grid.q[second]!,
          grid.r[second]!,
          sample,
        );
        return firstScore - secondScore || first - second;
      }));
      const trial = trackCoordinates([]);
      const sectorCounts = own(new Uint8Array(HEX_NEIGHBOR_COUNT));
      const spacedFromSelected = (cell: number): boolean => (
        !selectedAll.some(existing => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[existing]!,
          grid.r[existing]!,
        ) < 5)
        && !trial.some(existing => axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[existing]!,
          grid.r[existing]!,
        ) < 5)
      );
      // Establish angular coverage before the stochastic fill. A pure greedy
      // order could consume the spacing budget in four dense sectors even
      // when stable sites existed in the other two, creating a false castle
      // distribution rejection after otherwise valid geology changes.
      for (let offset = 0; offset < HEX_NEIGHBOR_COUNT; offset += 1) {
        const targetSector = (offset + attempt) % HEX_NEIGHBOR_COUNT;
        const cell = ordered.find(candidate => (
          distributionSector(candidate) === targetSector
          && spacedFromSelected(candidate)
        ));
        if (cell === undefined) continue;
        trial.push(cell);
        sectorCounts[targetSector] += 1;
      }
      for (const cell of ordered) {
        if (trial.includes(cell)) continue;
        const sector = distributionSector(cell);
        if (sectorCounts[sector]! >= 35) continue;
        if (!spacedFromSelected(cell)) continue;
        trial.push(cell);
        sectorCounts[sector] += 1;
        if (trial.length === 100) break;
      }
      if (trial.length > selected.length) selected = trial;
    }
    for (const cell of selected) {
      selectedAll.push(cell);
      castleSlot[cell] = 1;
    }
    castleCount += selected.length;
  }
  let placementProof = castleCount === GREATER_REALM_REQUIRED_CASTLE_SLOT_COUNT;
  for (let ordinal = 0; ordinal < selectedAll.length; ordinal += 1) {
    const cell = selectedAll[ordinal]!;
    if (legacyCastleSlot[cell] === 1) continue;
    const region = regionId[cell]!;
    let independentlyVerifiedPassableNeighbors = 0;
    for (let directionIndex = 0; directionIndex < HEX_NEIGHBOR_COUNT; directionIndex += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + directionIndex]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === region
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
        && gateCells[neighbor] === 0
        && gateApproachCells[neighbor] === 0
        && topology.componentId[neighbor] === topology.componentId[cell]
      ) independentlyVerifiedPassableNeighbors += 1;
    }
    if (
      region < 1
      || region >= TIER_I_REGION_COUNT
      || tierId[cell] !== 1
      || waterRegime[cell] !== 0
      || barrier[cell] !== 0
      || gateApproachCells[cell] !== 0
      || gateDistance[cell]! < 3
      || slope[cell]! > 6_000
      || wetnessIndex[cell]! > 5_000
      || distanceToFreshwater[cell]! < 2
      || distanceToCoast[cell]! < 2
      || !stableCastleLandform(landformId[cell]!)
      || topology.componentId[cell]! < 0
      || topology.componentSizes[topology.componentId[cell]!]! < 200
      || independentlyVerifiedPassableNeighbors !== HEX_NEIGHBOR_COUNT
    ) placementProof = false;
    for (let previous = 0; previous < ordinal; previous += 1) {
      const other = selectedAll[previous]!;
      if (axialDistance(
        grid.q[cell]!,
        grid.r[cell]!,
        grid.q[other]!,
        grid.r[other]!,
      ) < 5) placementProof = false;
    }
  }
  const verifiedSectorCounts = own(new Uint8Array(
    TIER_I_REGION_COUNT * HEX_NEIGHBOR_COUNT,
  ));
  for (const cell of selectedAll) {
    if (legacyCastleSlot[cell] === 1) continue;
    const region = regionId[cell]!;
    if (region <= 0 || region >= TIER_I_REGION_COUNT) {
      placementProof = false;
      continue;
    }
    const sector = distributionSector(cell);
    verifiedSectorCounts[region * HEX_NEIGHBOR_COUNT + sector] += 1;
  }
  for (let region = 1; region < TIER_I_REGION_COUNT; region += 1) {
    let occupiedSectors = 0;
    let maximumSectorCount = 0;
    for (let sector = 0; sector < HEX_NEIGHBOR_COUNT; sector += 1) {
      const count = verifiedSectorCounts[region * HEX_NEIGHBOR_COUNT + sector]!;
      if (count > 0) occupiedSectors += 1;
      maximumSectorCount = Math.max(maximumSectorCount, count);
    }
    if (occupiedSectors < 5 || maximumSectorCount > 35) placementProof = false;
  }
  const resourcePotential = own(new Uint8Array(grid.cellCount));
  const corePotential = own(new Uint8Array(grid.cellCount));
  const castleClearanceCell = own(new Uint8Array(grid.cellCount));
  for (const cell of selectedAll) {
    castleClearanceCell[cell] = 1;
    if (legacyCastleSlot[cell] === 1) continue;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0) castleClearanceCell[neighbor] = 1;
    }
  }
  let resourcePotentialCount = 0;
  let corePotentialCount = 0;
  const resourceChannel = greaterRealmTerrainChannelId('resource-potential');
  const coreChannel = greaterRealmTerrainChannelId('core-potential');
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      waterRegime[cell] !== 0
      || barrier[cell] === 1
      || castleClearanceCell[cell] === 1
      || legacyProtectedCell[cell] === 1
    ) continue;
    const resourceThreshold = tierId[cell] === 1 ? 2_000 : tierId[cell] === 2 ? 2_800 : 4_000;
    const coreThreshold = tierId[cell] === 1 ? 1_400 : tierId[cell] === 2 ? 2_000 : 2_800;
    if ((greaterRealmCounterRandomU32(
      candidateSeed,
      resourceChannel,
      grid.q[cell]!,
      grid.r[cell]!,
    ) % 10_000) < resourceThreshold) {
      resourcePotential[cell] = tierId[cell]!;
      resourcePotentialCount += 1;
    }
    if ((greaterRealmCounterRandomU32(
      candidateSeed,
      coreChannel,
      grid.q[cell]!,
      grid.r[cell]!,
    ) % 10_000) < coreThreshold) {
      corePotential[cell] = tierId[cell]!;
      corePotentialCount += 1;
    }
  }
  castleClearanceCell.fill(0);
  verifiedSectorCounts.fill(0);
  const result = Object.freeze({
    castleSlot,
    resourcePotential,
    corePotential,
    castleCount,
    placementProof,
    resourcePotentialCount,
    corePotentialCount,
  });
  // Retain only after result construction succeeds. Any exceptional exit,
  // including a future failing result wrapper, therefore wipes every owned
  // buffer instead of accidentally treating an unreturned array as public.
  retainedArrays.add(castleSlot);
  retainedArrays.add(resourcePotential);
  retainedArrays.add(corePotential);
  return result;
  } finally {
    for (const array of ownedArrays) {
      if (!retainedArrays.has(array)) array.fill(0);
    }
    for (const cells of coordinateScratch) cells.fill(0);
    ownedArrays.clear();
    retainedArrays.clear();
    coordinateScratch.length = 0;
  }
}

function dormantThroneAnchor(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  waterRegime: Uint8Array,
  regionId: Uint8Array,
  barrier: Uint8Array,
  castleSlot: Uint8Array,
  resourcePotential: Uint8Array,
  corePotential: Uint8Array,
  gates: readonly GreaterRealmPrivateGate[],
): Readonly<{
  mask: Uint8Array;
  proof: boolean;
  barrierClearance: number;
}> {
  const distanceToBarrier = distanceFromMask(grid, barrier);
  const gateCells = new Uint8Array(grid.cellCount);
  for (const gate of gates) {
    gateCells[gate.firstCell] = 1;
    gateCells[gate.secondCell] = 1;
  }
  let centerQTotal = 0;
  let centerRTotal = 0;
  let centerCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (regionId[cell] !== TIER_III_REGION_INDEX) continue;
    centerQTotal += grid.q[cell]!;
    centerRTotal += grid.r[cell]!;
    centerCells += 1;
  }
  if (centerCells === 0) fail('GREATER_REALM_THRONE_REGION_INVARIANT');
  const roundedRatio = (numerator: number) => numerator >= 0
    ? Math.floor((numerator * 2 + centerCells) / (centerCells * 2))
    : -Math.floor((-numerator * 2 + centerCells) / (centerCells * 2));
  const centerQ = roundedRatio(centerQTotal);
  const centerR = roundedRatio(centerRTotal);
  let selected = -1;
  let selectedScore = Number.NEGATIVE_INFINITY;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (
      regionId[cell] !== TIER_III_REGION_INDEX
      || waterRegime[cell] !== 0
      || barrier[cell] !== 0
      || elevation[cell]! <= SEA_LEVEL
      || distanceToBarrier[cell]! < 4
      || castleSlot[cell] !== 0
      || resourcePotential[cell] !== 0
      || corePotential[cell] !== 0
      || gateCells[cell] !== 0
    ) continue;
    let passableNeighbors = 0;
    let footprintClear = true;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === TIER_III_REGION_INDEX
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
      ) passableNeighbors += 1;
      if (
        neighbor < 0
        || castleSlot[neighbor] !== 0
        || resourcePotential[neighbor] !== 0
        || corePotential[neighbor] !== 0
        || gateCells[neighbor] !== 0
      ) footprintClear = false;
    }
    if (passableNeighbors < 5 || !footprintClear) continue;
    const score = distanceToBarrier[cell]! * 4_000
      + Math.floor(Math.max(0, elevation[cell]!) / 4)
      - axialDistance(grid.q[cell]!, grid.r[cell]!, centerQ, centerR) * 120;
    if (score > selectedScore || (score === selectedScore && cell < selected)) {
      selected = cell;
      selectedScore = score;
    }
  }
  const mask = new Uint8Array(grid.cellCount);
  if (selected >= 0) mask[selected] = 1;
  let selectedPassableNeighbors = 0;
  let selectedFootprintClear = selected >= 0;
  if (selected >= 0) {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[selected * HEX_NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && regionId[neighbor] === TIER_III_REGION_INDEX
        && waterRegime[neighbor] === 0
        && barrier[neighbor] === 0
      ) selectedPassableNeighbors += 1;
      if (
        neighbor < 0
        || castleSlot[neighbor] !== 0
        || resourcePotential[neighbor] !== 0
        || corePotential[neighbor] !== 0
        || gateCells[neighbor] !== 0
      ) selectedFootprintClear = false;
    }
  }
  return Object.freeze({
    mask,
    proof: selected >= 0
      && mask.reduce((total, value) => total + value, 0) === 1
      && regionId[selected] === TIER_III_REGION_INDEX
      && waterRegime[selected] === 0
      && barrier[selected] === 0
      && castleSlot[selected] === 0
      && resourcePotential[selected] === 0
      && corePotential[selected] === 0
      && gateCells[selected] === 0
      && selectedPassableNeighbors >= 5
      && selectedFootprintClear
      && distanceToBarrier[selected]! >= 4,
    barrierClearance: selected < 0 ? 0 : distanceToBarrier[selected]!,
  });
}

function boundaryMetrics(
  grid: IndexedAxialGrid,
  waterRegime: Uint8Array,
): Readonly<{
  boundaryCells: number;
  maximumRadiusShareBasisPoints: number;
  rotationalSimilarityBasisPoints: number;
  maximumAlignedBoundaryRun: number;
  minimumBoundaryLandDistance: number;
  saltwaterBoundaryBasisPoints: number;
  naturalBoundary: boolean;
  deepOceanBoundary: boolean;
}> {
  const boundary: number[] = [];
  const boundaryByMissingDirection = Array.from(
    { length: HEX_NEIGHBOR_COUNT },
    () => new Uint8Array(grid.cellCount),
  );
  const land = new Uint8Array(grid.cellCount);
  const radiusCounts = new Map<number, number>();
  const keys = new Set<string>();
  for (let index = 0; index < grid.cellCount; index += 1) {
    keys.add(`${grid.q[index]},${grid.r[index]}`);
    if (waterRegime[index] === 0) land[index] = 1;
    let isBoundary = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[index * HEX_NEIGHBOR_COUNT + direction] !== -1) continue;
      boundaryByMissingDirection[direction]![index] = 1;
      isBoundary = true;
    }
    if (isBoundary) {
      boundary.push(index);
      const radius = axialDistance(grid.q[index]!, grid.r[index]!);
      radiusCounts.set(radius, (radiusCounts.get(radius) ?? 0) + 1);
    }
  }
  const maximumRadiusCount = Math.max(0, ...radiusCounts.values());
  const maximumRadiusShareBasisPoints = boundary.length === 0
    ? 10_000
    : Math.round((maximumRadiusCount * 10_000) / boundary.length);
  let rotatedIntersection = 0;
  for (let index = 0; index < grid.cellCount; index += 1) {
    const rotatedQ = -grid.r[index]!;
    const rotatedR = grid.q[index]! + grid.r[index]!;
    if (keys.has(`${rotatedQ},${rotatedR}`)) rotatedIntersection += 1;
  }
  const rotationalSimilarityBasisPoints = Math.round(
    (rotatedIntersection * 10_000) / (grid.cellCount * 2 - rotatedIntersection),
  );
  const maximumRadius = Math.max(...boundary.map(index => axialDistance(grid.q[index]!, grid.r[index]!)));
  const distanceToLand = distanceFromMask(grid, land);
  const minimumBoundaryLandDistance = Math.min(...boundary.map(index => distanceToLand[index]!));
  const saltwaterBoundaryCells = boundary.filter(index => waterRegime[index] === 1).length;
  const saltwaterBoundaryBasisPoints = boundary.length === 0
    ? 0
    : Math.round((saltwaterBoundaryCells * 10_000) / boundary.length);
  let maximumAlignedBoundaryRun = 0;
  for (const directionBoundary of boundaryByMissingDirection) {
    for (const component of connectedComponents(grid, directionBoundary)) {
      maximumAlignedBoundaryRun = Math.max(maximumAlignedBoundaryRun, component.length);
    }
  }
  return Object.freeze({
    boundaryCells: boundary.length,
    maximumRadiusShareBasisPoints,
    rotationalSimilarityBasisPoints,
    maximumAlignedBoundaryRun,
    minimumBoundaryLandDistance,
    saltwaterBoundaryBasisPoints,
    naturalBoundary: boundary.length > 0
      && maximumRadiusShareBasisPoints < 1_800
      && rotationalSimilarityBasisPoints < 9_300
      && maximumAlignedBoundaryRun <= 96,
    deepOceanBoundary: maximumRadius <= PRIVATE_CANVAS_RADIUS - 8
      && minimumBoundaryLandDistance >= 8
      && saltwaterBoundaryBasisPoints === 10_000,
  });
}

function topographicLandmassMetrics(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
): Readonly<{
  majorLandmassCount: number;
  largeIslandCount: number;
  smallIslandCount: number;
  proof: boolean;
}> {
  const land = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (elevation[cell]! > SEA_LEVEL) land[cell] = 1;
  }
  const componentSizes = connectedComponents(grid, land).map(component => component.length);
  const majorLandmassCount = componentSizes.filter(size => size >= 5_000).length;
  const largeIslandCount = componentSizes.filter(size => size >= 96 && size < 5_000).length;
  const smallIslandCount = componentSizes.filter(size => size > 0 && size < 96).length;
  return Object.freeze({
    majorLandmassCount,
    largeIslandCount,
    smallIslandCount,
    proof: majorLandmassCount >= 2
      && majorLandmassCount <= 4
      && largeIslandCount >= 3
      && largeIslandCount <= 8,
  });
}

function chunkMetrics(grid: IndexedAxialGrid): Readonly<{
  count: number;
  minimum: number;
  median: number;
  p95: number;
  maximum: number;
}> {
  const populations = new Map<string, number>();
  for (let index = 0; index < grid.cellCount; index += 1) {
    const chunkQ = Math.floor((grid.q[index]! + PRIVATE_CANVAS_RADIUS) / 15);
    const chunkR = Math.floor((grid.r[index]! + PRIVATE_CANVAS_RADIUS) / 15);
    const key = `${chunkQ}:${chunkR}`;
    populations.set(key, (populations.get(key) ?? 0) + 1);
  }
  const sorted = [...populations.values()].sort((first, second) => first - second);
  if (sorted.length === 0) fail('GREATER_REALM_CHUNKS_EMPTY');
  return Object.freeze({
    count: sorted.length,
    minimum: sorted[0]!,
    median: sorted[Math.floor((sorted.length - 1) * 0.5)]!,
    p95: sorted[Math.floor((sorted.length - 1) * 0.95)]!,
    maximum: sorted[sorted.length - 1]!,
  });
}

function regionRanges(regionCounts: readonly number[]) {
  const tierI = regionCounts.slice(0, 6);
  const tierII = regionCounts.slice(6, 9);
  const tierIII = regionCounts.slice(9, 10);
  const range = (values: readonly number[]) => Object.freeze({
    minimum: Math.min(...values),
    maximum: Math.max(...values),
  });
  return Object.freeze({ tierI: range(tierI), tierII: range(tierII), tierIII: range(tierIII) });
}

function regionBalance(values: readonly number[]): boolean {
  const sorted = [...values].sort((first, second) => first - second);
  const median = sorted[Math.floor(sorted.length / 2)]!;
  return values.every(value => value * 100 >= median * 75 && value * 100 <= median * 135);
}

function allActiveConnected(grid: IndexedAxialGrid): boolean {
  const all = new Uint8Array(grid.cellCount);
  all.fill(1);
  return connectedComponents(grid, all).length === 1;
}

function activeMaskHasNoEnclosedVoids(
  canvas: IndexedAxialGrid,
  mask: Uint8Array,
): boolean {
  const inactive = new Uint8Array(canvas.cellCount);
  for (let cell = 0; cell < canvas.cellCount; cell += 1) {
    if (mask[cell] === 0) inactive[cell] = 1;
  }
  return connectedComponents(canvas, inactive).every(component => component.some(cell => {
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (canvas.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === -1) return true;
    }
    return false;
  }));
}

function hydrologyIsAcyclic(
  grid: IndexedAxialGrid,
  receiver: Int32Array,
  filledElevation: Int32Array,
): boolean {
  if (receiver.length !== grid.cellCount || filledElevation.length !== grid.cellCount) return false;
  const incoming = new Uint32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const downstream = receiver[cell]!;
    if (downstream === -1) continue;
    if (
      downstream < 0
      || downstream >= grid.cellCount
      || downstream === cell
      || filledElevation[downstream]! > filledElevation[cell]!
    ) return false;
    let isNeighbor = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === downstream) {
        isNeighbor = true;
        break;
      }
    }
    if (!isNeighbor) return false;
    incoming[downstream] += 1;
  }
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (incoming[cell] === 0) queue[tail++] = cell;
  }
  let visited = 0;
  while (head < tail) {
    const cell = queue[head++]!;
    visited += 1;
    const downstream = receiver[cell]!;
    if (downstream < 0) continue;
    incoming[downstream] -= 1;
    if (incoming[downstream] === 0) queue[tail++] = downstream;
  }
  return visited === grid.cellCount;
}

function candidateStageDigests(
  grid: IndexedAxialGrid,
  fields: Readonly<Record<string, IntegerTerrainArray>>,
): Readonly<Record<string, string>> {
  const groups = [
    ['geology', ['bedrockElevation', 'domainId', 'geologyId']],
    ['geomorphology', [
      'geomorphologyElevation',
      'geomorphologyTemperature',
      'geomorphologyMoisture',
      'geomorphologyTotalDelta',
      'geomorphologyTerraceDelta',
      'geomorphologyGlacialDelta',
      'geomorphologyAridDelta',
      'geomorphologyVolcanicDelta',
      'geomorphologyCoastalDelta',
      'geomorphologyGlacialMask',
      'geomorphologyAridMask',
      'geomorphologyVolcanicMask',
      'geomorphologyVolcanicAnchorMask',
      'geomorphologyCoastalMask',
      'geomorphologyCoastalClass',
    ]],
    ['hydrology', [
      'elevation', 'filledElevation', 'sedimentDepth', 'flowReceiver',
      'flowAccumulation', 'waterRegime', 'waterBodyId', 'waterDepthClass',
      'waterSurfaceLevel', 'waterDownstream', 'waterBankSeed',
      'waterGenerationVersion',
    ]],
    ['topography', [
      'slope', 'aspect', 'profileCurvature', 'planCurvature', 'wetnessIndex',
      'exposure', 'distanceToCoast', 'distanceToFreshwater', 'watershedId',
      'ridgeId', 'temperature', 'moisture', 'biomeId', 'landformId',
    ]],
    ['strategy', ['regionId', 'tierId', 'barrier', 'castleSlot', 'throneAnchor']],
    ['dressing', [
      'dressingExcluded', 'ecologyClass', 'vegetationDensity',
      'groundcoverDensity', 'wildflowerDensity', 'routeClass', 'landmarkClass',
      'ambientLifeClass',
    ]],
    ['final', Object.keys(fields)],
  ] as const;
  return Object.freeze(Object.fromEntries(groups.map(([stage, names]) => [
    stage,
    digestGreaterRealmTerrainStage(
      stage,
      grid,
      Object.fromEntries(names.map(name => [name, fields[name]!])) as Record<string, IntegerTerrainArray>,
    ),
  ])));
}

function clearDerivedGreaterRealmTopography(
  topography: ReturnType<typeof deriveGreaterRealmTopography>,
): void {
  topography.slope.fill(0);
  topography.aspect.fill(0);
  topography.profileCurvature.fill(0);
  topography.planCurvature.fill(0);
  topography.wetnessIndex.fill(0);
  topography.exposure.fill(0);
  topography.distanceToCoast.fill(0);
  topography.distanceToFreshwater.fill(0);
  topography.watershedId.fill(0);
  topography.ridgeId.fill(0);
  topography.temperature.fill(0);
  topography.moisture.fill(0);
  topography.biomeId.fill(0);
  topography.landformId.fill(0);
}

export function generateGreaterRealmCandidate(input: Readonly<{
  rootSeed: Uint8Array;
  candidateOrdinal: number;
  onGateApronSearchLane?: (lane: GreaterRealmGateApronSearchLane) => void;
}>): GreaterRealmPrivateCandidate {
  const seedMaterial = deriveGreaterRealmCandidateSeedMaterial(
    input.rootSeed,
    input.candidateOrdinal,
  );
  const candidateSeed = deriveCandidateSeed(seedMaterial);
  let livingWorldOnFailure: ReturnType<typeof deriveGreaterRealmLivingWorld> | undefined;
  let hydrologyOnFailure: ReturnType<typeof deriveGreaterRealmHydrologyAuthority> | undefined;
  let reconciledFlowAccumulationOnFailure: BigUint64Array | undefined;
  let engineeredWaterClearanceMaskOnFailure: Uint8Array | undefined;
  let geomorphologyProcessMoistureOnFailure: Int32Array | undefined;
  let activeMaskOnFailure: Uint8Array | undefined;
  let preliminaryWaterRegimeOnFailure: Uint8Array | undefined;
  let preliminaryBiomeIdOnFailure: Uint8Array | undefined;
  let preliminaryLandformIdOnFailure: Uint8Array | undefined;
  let repairImmutableCellOnFailure: Uint8Array | undefined;
  try {
    const canvas = greaterRealmPrivateCanvasAuthority();
    const domainSeeds = separatedDomains(candidateSeed);
    const domainMaterials = deriveGreaterRealmDomainMaterialAuthority({
      seed: candidateSeed,
      domains: domainSeeds,
    });
    const geologyAuthorityMetrics = domainMaterials.metrics;
    const domains: readonly GreaterRealmPseudoTectonicDomain[] = (() => {
      try {
        return Object.freeze(domainSeeds.map(domain => Object.freeze({
          ...domain,
          baseThickness: domainMaterials.baseThickness[domain.id]!,
          rockFamily: domainMaterials.rockFamily[domain.id]! as GreaterRealmRockFamilyId,
        })));
      } finally {
        domainMaterials.clear();
      }
    })();
    const geology = macroGeology(canvas, candidateSeed, domains);
    const thermalTalus = geology.resistance.map(value => 700 + Math.floor(value / 8));
    const thermallyShaped = (() => {
      try {
        return erodeGreaterRealmThermally(canvas, geology.bedrock, {
          iterations: 3,
          talus: thermalTalus,
          transferNumerator: 1,
          transferDenominator: 24,
        }).elevation;
      } finally {
        thermalTalus.fill(0);
      }
    })();
    const {
      grid,
      projectedBedrock,
      initialElevation,
      resistance,
      uplift,
      domainId,
      geologyId,
      privateActiveMask,
    } = (() => {
      const projectedScratch: Array<Int32Array | Uint8Array> = [];
      let privateActiveMask: Uint8Array | undefined;
      let fullCanvasDistanceToLand: Uint16Array | undefined;
      let sourceIndexes: Uint32Array | undefined;
      let completed = false;
      try {
        const maskResult = activeMask(canvas, candidateSeed, thermallyShaped);
        privateActiveMask = maskResult.mask;
        fullCanvasDistanceToLand = maskResult.distanceToLand;
        activeMaskOnFailure = privateActiveMask;
        let activeCellCount = 0;
        for (const value of privateActiveMask) {
          if (value === 1) activeCellCount += 1;
        }
        if (
          activeCellCount < GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT
          || activeCellCount > GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT
        ) {
          rejectGreaterRealmCandidate('GREATER_REALM_ACTIVE_GRID_CELL_COUNT_OUT_OF_RANGE');
        }
        const active = activeGridFromCanvas(
          canvas,
          privateActiveMask,
          activeCellCount,
        );
        const grid = active.grid;
        sourceIndexes = active.sourceIndexes;
        if (grid.cellCount !== activeCellCount) {
          fail('GREATER_REALM_ACTIVE_GRID_CELL_COUNT_MISMATCH');
        }
        const projectedBedrock = projectInt32(geology.bedrock, sourceIndexes);
        projectedScratch.push(projectedBedrock);
        const initialElevation = projectInt32(thermallyShaped, sourceIndexes);
        projectedScratch.push(initialElevation);
        const resistance = projectInt32(geology.resistance, sourceIndexes);
        projectedScratch.push(resistance);
        const uplift = projectInt32(geology.uplift, sourceIndexes);
        projectedScratch.push(uplift);
        const domainId = projectUint8(geology.domainId, sourceIndexes);
        projectedScratch.push(domainId);
        const geologyId = projectUint8(geology.geologyId, sourceIndexes);
        projectedScratch.push(geologyId);
        const projection = Object.freeze({
          grid,
          projectedBedrock,
          initialElevation,
          resistance,
          uplift,
          domainId,
          geologyId,
          privateActiveMask,
        });
        completed = true;
        return projection;
      } finally {
        fullCanvasDistanceToLand?.fill(0);
        sourceIndexes?.fill(0);
        geology.bedrock.fill(0);
        geology.uplift.fill(0);
        geology.resistance.fill(0);
        geology.domainId.fill(0);
        geology.geologyId.fill(0);
        thermallyShaped.fill(0);
        if (!completed) {
          for (const scratch of projectedScratch) scratch.fill(0);
          privateActiveMask?.fill(0);
          activeMaskOnFailure = undefined;
        }
      }
    })();
    const legacy = placeLegacyLowlands(grid, candidateSeed, initialElevation);
    const volcanicPotential = Int32Array.from(
      domainId,
      value => domains[value]!.volcanicPotential,
    );
    const geomorphology = shapeGreaterRealmGeomorphology({
      grid,
      candidateSeed,
      elevation: initialElevation,
      tectonicUplift: uplift,
      rockResistance: resistance,
      volcanicPotential,
      legacyReserveCell: legacy.reserveCell,
      seaLevel: SEA_LEVEL,
    });
    geomorphologyProcessMoistureOnFailure = geomorphology.processMoisture;
    const fluvial = fluvialPass(
      grid,
      geomorphology.elevation,
      resistance,
      legacy.protectedCell,
    );
    const reconciled = reconcileLegacyLowlandsTopography(
      grid,
      legacy,
      projectedBedrock,
      fluvial.elevation,
    );
    reconciledFlowAccumulationOnFailure = reconciled.flowAccumulation;
    const provisionalStrategy = assignTiersAndRegions(
      grid,
      candidateSeed,
      reconciled.elevation,
      uplift,
      domainId,
      reconciled.flowAccumulation,
      legacy.reserveCell,
    );
    let generatedWaterSurface: GreaterRealmGeneratedWaterSurface | undefined =
      deriveGreaterRealmGeneratedWaterSurface(
        grid,
        candidateSeed,
        reconciled.elevation,
        reconciled.filledElevation,
        reconciled.flowReceiver,
        reconciled.flowAccumulation,
        legacy.protectedCell,
      );
    preliminaryWaterRegimeOnFailure = generatedWaterSurface.waterRegime;
    let generatedSurfaceVisuals: GreaterRealmGeneratedSurfaceVisuals | undefined =
      deriveGreaterRealmGeneratedSurfaceVisuals(
        grid,
        reconciled.elevation,
        generatedWaterSurface.waterRegime,
        provisionalStrategy.tierId,
        geomorphology.temperature,
        geomorphology.moisture,
      );
    preliminaryBiomeIdOnFailure = generatedSurfaceVisuals.biomeId;
    preliminaryLandformIdOnFailure = generatedSurfaceVisuals.landformId;
    let surface: GreaterRealmGeneratedSurface | undefined = Object.freeze({
      waterRegime: generatedWaterSurface.waterRegime,
      biomeId: generatedSurfaceVisuals.biomeId,
      landformId: generatedSurfaceVisuals.landformId,
      majorRiverCount: generatedWaterSurface.majorRiverCount,
      minorStreamCount: generatedWaterSurface.minorStreamCount,
      lakeCount: generatedWaterSurface.lakeCount,
      lakeBasinCandidates: generatedWaterSurface.lakeBasinCandidates,
      riverMouthCandidates: generatedWaterSurface.riverMouthCandidates,
      streamHeadCandidates: generatedWaterSurface.streamHeadCandidates,
    });
    const generatedSurfaceMetrics = Object.freeze({
      majorRiverCount: generatedWaterSurface.majorRiverCount,
      minorStreamCount: generatedWaterSurface.minorStreamCount,
      lakeCount: generatedWaterSurface.lakeCount,
      lakeBasinCandidates: generatedWaterSurface.lakeBasinCandidates,
      riverMouthCandidates: generatedWaterSurface.riverMouthCandidates,
      streamHeadCandidates: generatedWaterSurface.streamHeadCandidates,
    });
    generatedWaterSurface = undefined;
    generatedSurfaceVisuals = undefined;
    // Reconcile the ecological climate against the now-materialized drainage
    // network. Naturally process-dry banks retain their lee-side moisture so
    // freshwater can create real oasis margins instead of the broad ecological
    // relaxation washing every dry bank into humid woodland. This is wholly
    // region-blind and does not edit water, terrain, or biome quotas.
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        legacy.reserveCell[cell] === 1
        || geomorphology.temperature[cell]! < 5_500
        || geomorphology.processMoisture[cell]! > 1_500
      ) continue;
      let freshwaterMargin = false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[
          cell * HEX_NEIGHBOR_COUNT + direction
        ]!;
        if (
          neighbor >= 0
          && (
            surface.waterRegime[neighbor] === WATER_LAKE
            || surface.waterRegime[neighbor] === WATER_RIVER
            || surface.waterRegime[neighbor] === WATER_STREAM
          )
        ) {
          freshwaterMargin = true;
          break;
        }
      }
      if (freshwaterMargin) {
        geomorphology.moisture[cell] = geomorphology.processMoisture[cell]!;
      }
    }
    enforceGreaterRealmStandingWaterBodySurfaceProof({
      phase: 'generated',
      proof: hasGreaterRealmStandingWaterBodySurfaceProof({
        grid,
        waterRegime: surface.waterRegime,
        elevation: reconciled.elevation,
        filledElevation: reconciled.filledElevation,
      }),
    });
    const legacyWaterProof = overlayLegacyLowlandsWaterAuthority(
      grid,
      legacy,
      surface.waterRegime,
    );
    const legacyVisualProof = overlayLegacyLowlandsVisualAuthority(
      grid,
      legacy,
      surface.biomeId,
      surface.landformId,
    );
    const legacySurfaceProof = legacyWaterProof && legacyVisualProof;
    enforceGreaterRealmStandingWaterBodySurfaceProof({
      phase: 'legacy-overlay',
      proof: hasGreaterRealmStandingWaterBodySurfaceProof({
        grid,
        waterRegime: surface.waterRegime,
        elevation: reconciled.elevation,
        filledElevation: reconciled.filledElevation,
      }),
    });
    const capacityStrategy = allocateTierTwoPassableCapacity(
      grid,
      candidateSeed,
      provisionalStrategy,
      surface.waterRegime,
      legacy.protectedCell,
      legacy.reserveCell,
      input.onGateApronSearchLane,
    );
    const lowlandsRepairLane = capacityStrategy.gateApronSearchLane === 'lowlands-repair';
    repairImmutableCellOnFailure = capacityStrategy.repairImmutableCell;
    const semanticStrategy = remapTierOneNaturalBasinsByCharacter(
      grid,
      capacityStrategy,
      reconciled.elevation,
      uplift,
      reconciled.flowAccumulation,
      domainId,
      domains,
      surface.waterRegime,
      geomorphology.temperature,
      geomorphology.processMoisture,
      geomorphology.glacialMask,
      geomorphology.aridMask,
      geomorphology.volcanicMask,
      geomorphology.coastalMask,
      geomorphology.coastalClass,
      lowlandsRepairLane,
    );
    const strategy = repairNaturalRegionLandCoherence(
      grid,
      semanticStrategy,
      surface.waterRegime,
      legacy.protectedCell,
      capacityStrategy.tierTwoPassableOwner,
      capacityStrategy.tierTwoSpineOwner,
      capacityStrategy.repairImmutableCell,
      lowlandsRepairLane,
    );
    let topography: ReturnType<typeof deriveGreaterRealmTopography>;
    try {
      topography = deriveGreaterRealmTopography({
        grid,
        elevation: reconciled.elevation,
        flowReceiver: reconciled.flowReceiver,
        flowAccumulation: reconciled.flowAccumulation,
        waterRegime: surface.waterRegime,
        geologyId,
        tectonicUplift: uplift,
        rockResistance: resistance,
        regionId: strategy.regionId,
        tierId: strategy.tierId,
        legacyProtectedCell: legacy.protectedCell,
        protectedBiomeId: surface.biomeId,
        protectedLandformId: surface.landformId,
        geomorphicTemperature: geomorphology.temperature,
        geomorphicMoisture: geomorphology.moisture,
        geomorphicHydrologyMoisture: geomorphology.processMoisture,
        geomorphicGlacialMask: geomorphology.glacialMask,
        geomorphicAridMask: geomorphology.aridMask,
        geomorphicVolcanicMask: geomorphology.volcanicMask,
        geomorphicCoastalClass: geomorphology.coastalClass,
      });
    } finally {
      if (!lowlandsRepairLane) {
      // Only the pinned Lowlands projection consumes this preliminary visual
      // envelope. Final topography owns fresh authoritative visual arrays.
      surface.biomeId.fill(0);
      surface.landformId.fill(0);
      preliminaryBiomeIdOnFailure = undefined;
      preliminaryLandformIdOnFailure = undefined;
      // Process climate is private role/saturation scratch. The candidate
      // retains only the ecological climate authority used by final visuals.
      geomorphology.processMoisture.fill(0);
      geomorphologyProcessMoistureOnFailure = undefined;
      }
    }
    const strategicBarrier = barriersAndGates(
      grid,
      candidateSeed,
      reconciled.elevation,
      uplift,
      surface.waterRegime,
      strategy.tierId,
      strategy.regionId,
      strategy.gateGraph,
      legacy.protectedCell,
      capacityStrategy.tierTwoPassableOwner,
      capacityStrategy.tierTwoSpineOwner,
      capacityStrategy.repairImmutableCell,
    );
    if (capacityStrategy.repairImmutableCell) {
      assertGreaterRealmRepairOwnershipUnchanged({
        immutableCell: capacityStrategy.repairImmutableCell,
        originalTierId: semanticStrategy.tierId,
        originalRegionId: semanticStrategy.regionId,
        tierId: strategy.tierId,
        regionId: strategy.regionId,
      });
      capacityStrategy.repairImmutableCell.fill(0);
      repairImmutableCellOnFailure = undefined;
    }
    const marshMask = new Uint8Array(grid.cellCount);
    const engineeredWaterClearanceMask = new Uint8Array(grid.cellCount);
    engineeredWaterClearanceMaskOnFailure = engineeredWaterClearanceMask;
    let hydrology: ReturnType<typeof deriveGreaterRealmHydrologyAuthority>;
    try {
      for (const gate of strategicBarrier.gates) {
        engineeredWaterClearanceMask[gate.firstCell] = 1;
        engineeredWaterClearanceMask[gate.secondCell] = 1;
        for (const path of [
          gate.firstApproachPath,
          gate.firstAlternateApproachPath,
          gate.secondApproachPath,
          gate.secondAlternateApproachPath,
        ]) {
          for (const cell of path) engineeredWaterClearanceMask[cell] = 1;
        }
      }
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          engineeredWaterClearanceMask[cell] === 0
          && (
            topography.biomeId[cell] === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
            || topography.biomeId[cell] === GREATER_REALM_BIOME_ID.SALT_MARSH
          )
        ) marshMask[cell] = 1;
      }
      hydrology = deriveGreaterRealmHydrologyAuthority({
        grid,
        seed: candidateSeed,
        waterRegime: surface.waterRegime,
        marshMask,
        flowContinuityExemptionMask: legacy.protectedCell,
        elevation: reconciled.elevation,
        filledElevation: reconciled.filledElevation,
        flowReceiver: reconciled.flowReceiver,
        flowAccumulation: reconciled.flowAccumulation,
        seaLevel: SEA_LEVEL,
      });
      hydrologyOnFailure = hydrology;
    } finally {
      marshMask.fill(0);
      // Hydrology has copied the exact preliminary regime into its retained
      // authority. Retire this earlier surface on success and failure.
      surface.waterRegime.fill(0);
      preliminaryWaterRegimeOnFailure = undefined;
      if (!lowlandsRepairLane) surface = undefined;
    }
    if (lowlandsRepairLane) {
      const retainedSurface = surface;
      if (!retainedSurface) fail('GREATER_REALM_LOWLANDS_REPAIR_SURFACE_MISSING');
      topography = (() => {
        try {
          return deriveGreaterRealmTopography({
            grid,
            elevation: reconciled.elevation,
            flowReceiver: reconciled.flowReceiver,
            flowAccumulation: reconciled.flowAccumulation,
            waterRegime: hydrology.waterRegime,
            geologyId,
            tectonicUplift: uplift,
            rockResistance: resistance,
            regionId: strategy.regionId,
            tierId: strategy.tierId,
            legacyProtectedCell: legacy.protectedCell,
            protectedBiomeId: retainedSurface.biomeId,
            protectedLandformId: retainedSurface.landformId,
            geomorphicTemperature: geomorphology.temperature,
            geomorphicMoisture: geomorphology.moisture,
            geomorphicHydrologyMoisture: geomorphology.processMoisture,
            geomorphicGlacialMask: geomorphology.glacialMask,
            geomorphicAridMask: geomorphology.aridMask,
            geomorphicVolcanicMask: geomorphology.volcanicMask,
            geomorphicCoastalClass: geomorphology.coastalClass,
            waterRegimeIsAuthoritative: true,
          });
        } finally {
          clearDerivedGreaterRealmTopography(topography);
          retainedSurface.biomeId.fill(0);
          retainedSurface.landformId.fill(0);
          preliminaryBiomeIdOnFailure = undefined;
          preliminaryLandformIdOnFailure = undefined;
          geomorphology.processMoisture.fill(0);
          geomorphologyProcessMoistureOnFailure = undefined;
          surface = undefined;
        }
      })();
      repairGreaterRealmFinalFjordCoastalClass({
        grid,
        coastalClass: geomorphology.coastalClass,
        waterRegime: hydrology.waterRegime,
        temperature: topography.temperature,
        slope: topography.slope,
        glacialMask: geomorphology.glacialMask,
        protectedCell: legacy.protectedCell,
        reserveCell: legacy.reserveCell,
        dryWaterRegime: WATER_DRY,
        oceanWaterRegime: WATER_OCEAN,
        seaWaterRegime: WATER_SEA,
      });
    }
    const finalHydrology = finalHydrologyMetrics(
      grid,
      reconciled.elevation,
      reconciled.filledElevation,
      reconciled.flowReceiver,
      hydrology.flowAccumulation,
      hydrology.waterRegime,
      legacy.protectedCell,
    );
    const finalTierAuthorityCounts: [number, number, number] = [0, 0, 0];
    const finalRegionAuthorityCounts = Array<number>(REGION_COUNT).fill(0);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      finalTierAuthorityCounts[strategy.tierId[cell]! - 1] += 1;
      finalRegionAuthorityCounts[strategy.regionId[cell]!] += 1;
      if (
        legacy.protectedCell[cell] === 1
        && (
          strategy.tierId[cell] !== capacityStrategy.tierId[cell]
          || strategy.regionId[cell] !== capacityStrategy.regionId[cell]
        )
      ) {
        rejectGreaterRealmTierTwoCapacity('LEGACY_PROTECTED_AUTHORITY_CHANGED');
      }
    }
    if (
      finalTierAuthorityCounts.some((count, tier) => count !== strategy.tierCounts[tier])
      || finalRegionAuthorityCounts.some(
        (count, region) => count !== strategy.regionCounts[region],
      )
    ) rejectGreaterRealmTierTwoCapacity('FINAL_AUTHORITY_COUNTS_CHANGED');
    const sites = castleAndPotentialSites(
      grid,
      candidateSeed,
      reconciled.elevation,
      hydrology.waterRegime,
      strategy.tierId,
      strategy.regionId,
      strategicBarrier.barrier,
      topography.slope,
      topography.wetnessIndex,
      topography.distanceToFreshwater,
      topography.distanceToCoast,
      topography.landformId,
      strategicBarrier.gates,
      legacy.protectedCell,
      legacy.castleSlot,
    );
    const throne = dormantThroneAnchor(
      grid,
      reconciled.elevation,
      hydrology.waterRegime,
      strategy.regionId,
      strategicBarrier.barrier,
      sites.castleSlot,
      sites.resourcePotential,
      sites.corePotential,
      strategicBarrier.gates,
    );
    const gateCell = new Uint8Array(grid.cellCount);
    const gateApproachCell = new Uint8Array(grid.cellCount);
    let livingWorld: ReturnType<typeof deriveGreaterRealmLivingWorld>;
    try {
      for (const gate of strategicBarrier.gates) {
        gateCell[gate.firstCell] = 1;
        gateCell[gate.secondCell] = 1;
        for (const path of [
          gate.firstApproachPath,
          gate.firstAlternateApproachPath,
          gate.secondApproachPath,
          gate.secondAlternateApproachPath,
        ]) {
          for (const cell of path) gateApproachCell[cell] = 1;
        }
      }
      livingWorld = deriveGreaterRealmLivingWorld({
        grid,
        seed: candidateSeed,
        waterRegime: hydrology.waterRegime,
        biomeId: topography.biomeId,
        landformId: topography.landformId,
        elevation: reconciled.elevation,
        slope: topography.slope,
        moisture: topography.moisture,
        temperature: topography.temperature,
        wetnessIndex: topography.wetnessIndex,
        exposure: topography.exposure,
        distanceToFreshwater: topography.distanceToFreshwater,
        distanceToCoast: topography.distanceToCoast,
        legacyProtectedCell: legacy.protectedCell,
        castleSlot: sites.castleSlot,
        resourcePotential: sites.resourcePotential,
        corePotential: sites.corePotential,
        throneAnchor: throne.mask,
        barrier: strategicBarrier.barrier,
        gateCell,
        gateApproachCell,
      });
      livingWorldOnFailure = livingWorld;
    } finally {
      gateCell.fill(0);
      gateApproachCell.fill(0);
    }
    const boundary = boundaryMetrics(grid, hydrology.waterRegime);
    const landmasses = topographicLandmassMetrics(grid, reconciled.elevation);
    const chunks = chunkMetrics(grid);
    let landCellCount = 0;
    let waterCellCount = 0;
    let mountainBarrierCells = 0;
    for (let index = 0; index < grid.cellCount; index += 1) {
      // Public composition reports the exact final hydrology partition. The
      // separate landmass proof continues to measure the sea-level footprint,
      // so rivers, streams and marshes remain visible in the requested final
      // water total without changing continental-shape authority.
      if (hydrology.waterRegime[index] === WATER_DRY) landCellCount += 1;
      else waterCellCount += 1;
      if (strategicBarrier.geologicalBarrierBand[index] !== 0) mountainBarrierCells += 1;
    }
    const geologicalBarrierMask = Uint8Array.from(
      strategicBarrier.geologicalBarrierBand,
      value => value === 0 ? 0 : 1,
    );
    const barrierComponents = connectedComponents(
      grid,
      geologicalBarrierMask,
    );
    const barrierSystems = barrierComponents.filter(component => component.length >= 64);
    const continuousBarrierCells = barrierSystems.reduce(
      (total, component) => total + component.length,
      0,
    );
    const tierICounts = strategy.regionCounts.slice(0, 6);
    const tierIICounts = strategy.regionCounts.slice(6, 9);
    const approvedRange = grid.cellCount >= GREATER_REALM_MINIMUM_ACTIVE_CELL_COUNT
      && grid.cellCount <= GREATER_REALM_MAXIMUM_ACTIVE_CELL_COUNT;
    const tierIBasisPoints = Math.round((strategy.tierCounts[0] * 10_000) / grid.cellCount);
    const tierIIBasisPoints = Math.round((strategy.tierCounts[1] * 10_000) / grid.cellCount);
    const tierIIIBasisPoints = 10_000 - tierIBasisPoints - tierIIBasisPoints;
    const topology = lowlandsRepairLane
      ? passableRegionTopology(
        grid,
        strategy.regionId,
        hydrology.waterRegime,
        strategicBarrier.barrier,
      )
      : strategicBarrier.passableTopology;
    const strategicShape = strategicShapeMetrics(
      grid,
      strategy.tierId,
      strategy.regionId,
      hydrology.waterRegime,
      strategicBarrier.barrier,
      topology,
    );
    const tierThreePassableLandCells = topology.passableCounts[TIER_III_REGION_INDEX]!;
    const smallestOtherRegionPassableLandCells = Math.min(
      ...topology.passableCounts.slice(0, TIER_III_REGION_INDEX),
    );
    const hydrologyAcyclic = hydrologyIsAcyclic(
      grid,
      reconciled.flowReceiver,
      reconciled.filledElevation,
    );
    const reliefStructure = measureGreaterRealmReliefStructure({
      grid,
      elevation: reconciled.elevation,
      waterRegime: hydrology.waterRegime,
      legacyProtectedCell: legacy.protectedCell,
      dryWaterRegime: WATER_DRY,
    });
    const naturalComposition = measureGreaterRealmNaturalComposition({
      grid,
      canvasRadius: PRIVATE_CANVAS_RADIUS,
      elevation: reconciled.elevation,
      tierId: strategy.tierId,
      waterRegime: hydrology.waterRegime,
      biomeId: topography.biomeId,
      legacyProtectedCell: legacy.protectedCell,
      ridgeId: topography.ridgeId,
      landformId: topography.landformId,
      slope: topography.slope,
      seaLevel: SEA_LEVEL,
      dryWaterRegime: WATER_DRY,
      oceanWaterRegime: WATER_OCEAN,
      seaWaterRegime: WATER_SEA,
    });
    const regionBoundaryAlignment = measureGreaterRealmRegionBoundaryAlignment({
      grid,
      regionId: strategy.regionId,
      waterRegime: hydrology.waterRegime,
      barrier: strategicBarrier.barrier,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      landformId: topography.landformId,
      biomeId: topography.biomeId,
      gates: strategicBarrier.gates,
    });
    const tierPotentialDensity = measureGreaterRealmTierPotentialDensity({
      tierId: strategy.tierId,
      waterRegime: hydrology.waterRegime,
      barrier: strategicBarrier.barrier,
      castleSlot: sites.castleSlot,
      legacyProtectedCell: legacy.protectedCell,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
    });
    const castleSuitability = measureGreaterRealmCastleSuitability({
      grid,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      waterRegime: hydrology.waterRegime,
      barrier: strategicBarrier.barrier,
      castleSlot: sites.castleSlot,
      legacyCastleSlot: legacy.castleSlot,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
      throneAnchor: throne.mask,
      slope: topography.slope,
      wetnessIndex: topography.wetnessIndex,
      distanceToFreshwater: topography.distanceToFreshwater,
      distanceToCoast: topography.distanceToCoast,
      landformId: topography.landformId,
      ecologyClass: livingWorld.ecologyClass,
      routeClass: livingWorld.routeClass,
      landmarkClass: livingWorld.landmarkClass,
      gates: strategicBarrier.gates,
    });
    const innerGateThrone = measureGreaterRealmInnerGateThroneRedundancy({
      grid,
      regionId: strategy.regionId,
      waterRegime: hydrology.waterRegime,
      barrier: strategicBarrier.barrier,
      throneAnchor: throne.mask,
      gates: strategicBarrier.gates,
    });
    const topographicQaInput = Object.freeze({
      grid,
      regionId: strategy.regionId,
      geomorphologyCoastalClass: geomorphology.coastalClass,
      elevation: reconciled.elevation,
      preErosionElevation: geomorphology.elevation,
      sedimentDepth: fluvial.sedimentDepth,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: hydrology.flowAccumulation,
      waterRegime: hydrology.waterRegime,
      biomeId: topography.biomeId,
      landformId: topography.landformId,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      legacyProtectedCell: legacy.protectedCell,
      waterClassificationExemptionMask: engineeredWaterClearanceMask,
      seaLevel: SEA_LEVEL,
    });
    const tierOneSemanticRegionByRole = lowlandsRepairLane
      ? deriveGreaterRealmTierOneSemanticRegionsFromFinalGeometry(
        topographicQaInput,
      )
      : Object.freeze([0, 1, 2, 3, 4, 5]);
    const topographicQa = (() => {
      try {
        return measureGreaterRealmTopographicQa(lowlandsRepairLane
          ? Object.freeze({
            ...topographicQaInput,
            tierOneSemanticRegionByRole,
          })
          : topographicQaInput);
      } finally {
        engineeredWaterClearanceMask.fill(0);
        engineeredWaterClearanceMaskOnFailure = undefined;
      }
    })();
    const chunkBenchmark = benchmarkGreaterRealmChunkPartition({
      grid,
      canvasRadius: PRIVATE_CANVAS_RADIUS,
    });
    const topographyPatchSupport = measureGreaterRealmTopographyPatchSupport({
      grid,
      elevation: reconciled.elevation,
      waterRegime: hydrology.waterRegime,
      waterDepthClass: hydrology.depthClass,
      waterSurfaceLevel: hydrology.surfaceLevel,
      bankSeed: hydrology.bankSeed,
      landformId: topography.landformId,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      ridgeId: topography.ridgeId,
      routeClass: livingWorld.routeClass,
    });
    const finalGateWaterClearanceProof = strategicBarrier.gates.every(gate => (
      hydrology.waterRegime[gate.firstCell] === WATER_DRY
      && hydrology.waterRegime[gate.secondCell] === WATER_DRY
      && [
        gate.firstApproachPath,
        gate.firstAlternateApproachPath,
        gate.secondApproachPath,
        gate.secondAlternateApproachPath,
      ].every(path => path.every(cell => (
        strategicallyPassableSurface(hydrology.waterRegime[cell]!)
      )))
    ));
    const activeMaskConnectedProof = (() => {
      try {
        return allActiveConnected(grid)
          && activeMaskHasNoEnclosedVoids(canvas, privateActiveMask);
      } finally {
        privateActiveMask.fill(0);
        activeMaskOnFailure = undefined;
      }
    })();
    const proofs = Object.freeze({
      activeMaskConnected: activeMaskConnectedProof,
      approvedCellRange: approvedRange,
      barriersHaveNoBypass: strategicBarrier.barrierProof,
      biomeCoherence:
        topography.biomeMetrics.incompatibleVisualBiomeAdjacencyCount === 0
        && topography.biomeMetrics.incompatibleBiomeLandformPairCount === 0,
      biomeDiversity: topography.biomeMetrics.visualBiomeClassCount >= 8
        && topography.biomeMetrics.minimumRegionVisualBiomeClassCount >= 3
        && topography.biomeMetrics.minimumTierIVisualBiomeClassCount >= 6
        && topography.biomeMetrics.minimumTierIIVisualBiomeClassCount >= 5
        && topography.biomeMetrics.tierIIIVisualBiomeClassCount >= 3
        && topography.biomeMetrics.minimumTierIMajorVisualBiomeClassCount >= 4
        && topography.biomeMetrics.minimumTierITransitionVisualBiomeClassCount >= 2
        && topography.biomeMetrics.minimumTierIIMajorVisualBiomeClassCount >= 5
        && topography.biomeMetrics.tierIIIMajorVisualBiomeClassCount >= 3
        && topography.biomeMetrics.maximumTierISingleBiomeShareBasisPoints <= 5_500,
      castleCapacity: sites.placementProof && castleSuitability.proof,
      deepOceanBoundary: boundary.deepOceanBoundary,
      dormantThroneAnchor: throne.proof,
      gateApproaches: strategicBarrier.gateApproachProof
        && finalGateWaterClearanceProof,
      gateGraph: strategicBarrier.gateGraphProof,
      geologicalHighlandBarriers: strategicBarrier.geologicalHighlandProof,
      advancedGeomorphology: geomorphology.metrics.changedCellCount > 0
        && geomorphology.metrics.maximumAbsoluteCellDelta <= 8_192
        && geomorphology.metrics.protectedChangedCellCount === 0
        && geomorphology.metrics.terraces.changedCellCount > 0
        && geomorphology.metrics.terraces.plateauCellCount
          > geomorphology.metrics.terraces.rampCellCount
        && geomorphology.metrics.terraces.rampCellCount > 0
        && geomorphology.metrics.terraces.realizedPlateauCellCount * 100
          >= geomorphology.metrics.terraces.eligibleCellCount * 35
        && geomorphology.metrics.terraces.realizedRampCellCount > 0
        && geomorphology.metrics.terraces.spatialRampCellCount > 0
        && geomorphology.metrics.terraces.fullStepEdgeCount === 0
        && geomorphology.metrics.terraces.maximumNewEdgeIncrease <= 1_200
        && geomorphology.metrics.terraces.weatheredDetailCellCount > 0
        && geomorphology.metrics.terraces.maximumAbsoluteCellDelta <= 2_200
        && geomorphology.metrics.terraces.domainWarpSampledCellCount * 5
          >= geomorphology.metrics.terraces.eligibleCellCount
        && geomorphology.metrics.terraces.domainWarpChangedCarrierCellCount * 4
          >= geomorphology.metrics.terraces.domainWarpSampledCellCount * 3
        && geomorphology.metrics.terraces.domainWarpOutputChangedCellCount > 0
        && geomorphology.metrics.terraces.domainWarpMaximumDistance >= 1
        && geomorphology.metrics.terraces.domainWarpMaximumDistance <= 5
        && Math.abs(geomorphology.metrics.terraces.netElevationDelta)
          <= geomorphology.metrics.terraces.eligibleCellCount * 300
        && geomorphology.metrics.erodedMaterialUnits
          === geomorphology.metrics.depositedMaterialUnits
            + geomorphology.metrics.exportedMaterialUnits
        && geomorphology.metrics.glacialClimateCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.aridClimateCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.volcanicTectonicCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.coastalProximityCompatibilityBasisPoints === 10_000
        && geomorphology.metrics.glacial.systemCount > 0
        && geomorphology.metrics.glacial.minimumSystemCellCount >= 6
        && geomorphology.metrics.arid.systemCount > 0
        && geomorphology.metrics.arid.minimumSystemCellCount >= 8
        && geomorphology.metrics.volcanicAnchorCount >= 2
        && geomorphology.metrics.volcanicAnchorCount <= 8
        && geomorphology.metrics.coastalClassCount >= 3
        && geomorphology.metrics.ridgeUpliftAlignmentBasisPoints >= 8_500
        && geomorphology.metrics.riverValleyAlignmentBasisPoints >= 8_500
        && reliefStructure.proof,
      hydrologyAcyclic,
      hydrologySurfaceConsistency: finalHydrology.surfaceConsistencyProof,
      legacyLowlandsPreserved: legacy.proof && legacySurfaceProof,
      naturalLandmassTopology: landmasses.proof,
      naturalStrategicRegions: strategicShape.nonRadialProof
        && regionBoundaryAlignment.proof,
      naturalOuterBoundary: boundary.naturalBoundary,
      regionLandCoherence: topology.proof
        && strategicShape.fragmentationProof
        && strategicShape.compactnessProof
        && strategicShape.tendrilProof,
      regionPassableLand: topology.proof,
      regionGraph: strategicBarrier.regionGraphProof,
      naturalLandSilhouette: naturalComposition.landSilhouette.proof,
      dominantContinentComposition: naturalComposition.dominantContinent.proof,
      deepOceanBreathingRoom: naturalComposition.oceanBreathingRoom.proof,
      forestPatchComposition: naturalComposition.forestPatches.proof,
      mountainSystemComposition: naturalComposition.mountainSystems.proof,
    });
    const hardGates = Object.freeze({
      ...Object.fromEntries(Object.entries(proofs).map(([key, value]) => [
        `PROOF_${key.replace(/([a-z])([A-Z])/gu, '$1_$2').toUpperCase()}`,
        value,
      ])),
      TIER_I_SHARE_6800_7400: tierIBasisPoints >= 6_800 && tierIBasisPoints <= 7_400,
      TIER_II_SHARE_2200_2700: tierIIBasisPoints >= 2_200 && tierIIBasisPoints <= 2_700,
      TIER_III_SHARE_0300_0600: tierIIIBasisPoints >= 300 && tierIIIBasisPoints <= 600,
      TIER_I_REGION_BALANCE: regionBalance(tierICounts),
      TIER_II_REGION_BALANCE: regionBalance(tierIICounts),
      TIER_III_SMALLEST_TOTAL_CELLS: strategy.regionCounts[TIER_III_REGION_INDEX]!
        < Math.min(...strategy.regionCounts.slice(0, TIER_III_REGION_INDEX)),
      TIER_III_SMALLEST_PASSABLE_LAND: tierThreePassableLandCells
        < smallestOtherRegionPassableLandCells,
      HYDROLOGY_MAJOR_OCEAN_SEA_BODIES_4_6: finalHydrology.majorOceanSeaBodies >= 4
        && finalHydrology.majorOceanSeaBodies <= 6,
      HYDROLOGY_MAJOR_RIVERS_48_72: finalHydrology.majorRivers >= 48
        && finalHydrology.majorRivers <= 72,
      HYDROLOGY_MINOR_STREAMS_120_240: finalHydrology.minorStreams >= 120
        && finalHydrology.minorStreams <= 240,
      HYDROLOGY_LAKES_48_96: finalHydrology.lakes >= 48
        && finalHydrology.lakes <= 96,
      GEOLOGY_DOMAIN_MATERIAL_AUTHORITY: geologyAuthorityMetrics.proof,
      HYDROLOGY_DESCRIPTOR_AUTHORITY: hydrology.metrics.proof,
      STRATEGIC_REGION_BOUNDARY_ALIGNMENT: regionBoundaryAlignment.proof,
      TIER_POTENTIAL_DENSITY: tierPotentialDensity.proof,
      CASTLE_SUITABILITY: castleSuitability.proof,
      INNER_GATE_THRONE_REDUNDANCY: innerGateThrone.proof,
      TOPOGRAPHIC_QA_COMPLETE:
        topographicQa.cellCount === grid.cellCount
        && topographicQa.landCellCount + topographicQa.waterCellCount === grid.cellCount
        && topographicQa.biomeElevationConsistency.inconsistentCellCount === 0
        && topographicQa.biomeElevationConsistency.highGradientMarshCellCount === 0
        && topographicQa.biomeElevationConsistency.marshClassificationMismatchCount === 0,
      REGIONAL_HYDROGEOMORPHOLOGY_QA:
        topographicQa.regionalHydrogeomorphology.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_FROSTMERE:
        topographicQa.regionalHydrogeomorphology.frostmere.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_MIREFEN:
        topographicQa.regionalHydrogeomorphology.mirefen.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_SUNSCAR:
        topographicQa.regionalHydrogeomorphology.sunscar.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_STONEWAKE:
        topographicQa.regionalHydrogeomorphology.stonewake.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_TIER_II:
        topographicQa.regionalHydrogeomorphology.tierII.proof,
      REGIONAL_HYDROGEOMORPHOLOGY_THRONEHEART:
        topographicQa.regionalHydrogeomorphology.throneheart.proof,
      CHUNK_PARTITION_BENCHMARK: chunkBenchmark.proof,
      TOPOGRAPHY_PATCH_SUPPORT: topographyPatchSupport.proof,
      SEDIMENT_MATERIAL_BUDGET: fluvial.erodedMaterialUnits
        === fluvial.depositedMaterialUnits + fluvial.exportedSedimentUnits,
      LIVING_WORLD_DORMANT_CAPACITY:
        Object.values(livingWorld.invariants).every(Boolean)
        && hasGreaterRealmCandidateScaleLivingWorldCapacity(livingWorld.metrics),
    });
    const eligibilityFailureCodes = Object.freeze(Object.entries(hardGates)
      .filter(([, passed]) => !passed)
      .map(([code]) => code));
    const eligible = eligibilityFailureCodes.length === 0;
    const axialArtifactBasisPoints = clamp(
      boundary.maximumRadiusShareBasisPoints
        + Math.floor(boundary.rotationalSimilarityBasisPoints / 3)
        + boundary.maximumAlignedBoundaryRun * 8,
      0,
      10_000,
    );
    const legacyBoundaryNaturalnessBasisPoints = clamp(
      10_000 - axialArtifactBasisPoints,
      0,
      10_000,
    );
    const compositionNaturalnessBasisPoints = Math.round((
      clamp(
        10_000 - naturalComposition.landSilhouette.raster256.rotationalIouBasisPoints,
        0,
        10_000,
      )
      + clamp(
        10_000
          - naturalComposition.landSilhouette.maximumAlignedCoastRunShareBasisPoints,
        0,
        10_000,
      )
      + clamp(
        10_000 - Math.abs(
          naturalComposition.landSilhouette.dominantLandSolidityBasisPoints - 7_900,
        ) * 5,
        0,
        10_000,
      )
      + clamp(
        naturalComposition.oceanBreathingRoom.boundaryLandDistanceP50 * 400,
        0,
        10_000,
      )
      + naturalComposition.forestPatches.clusteredShareBasisPoints
      + naturalComposition.mountainSystems.clusteredShareBasisPoints
    ) / 6);
    const scoreRange = (value: number, minimum: number, maximum: number) => {
      if (value >= minimum && value <= maximum) return 10_000;
      const miss = value < minimum ? minimum - value : value - maximum;
      return clamp(10_000 - Math.round((miss * 10_000) / Math.max(1, maximum - minimum)), 0, 10_000);
    };
    const hydrologyCoherenceBasisPoints = Math.round((
      scoreRange(finalHydrology.majorOceanSeaBodies, 4, 6)
      + scoreRange(finalHydrology.majorRivers, 48, 72)
      + scoreRange(finalHydrology.minorStreams, 120, 240)
      + scoreRange(finalHydrology.lakes, 48, 96)
      + (finalHydrology.surfaceConsistencyProof ? 10_000 : 0)
      + (hydrologyAcyclic ? 10_000 : 0)
    ) / 6);
    const ridgeContinuityBasisPoints = mountainBarrierCells === 0
      ? 0
      : Math.round((continuousBarrierCells * 10_000) / mountainBarrierCells);
    const aggregate = Object.freeze({
      eligible,
      activeCellCount: grid.cellCount,
      landCellCount,
      waterCellCount,
      tierCellCounts: Object.freeze({
        tierI: strategy.tierCounts[0],
        tierII: strategy.tierCounts[1],
        tierIII: strategy.tierCounts[2],
      }),
      regionSizeRanges: regionRanges(strategy.regionCounts),
      hydrology: Object.freeze({
        majorOceanSeaBodies: finalHydrology.majorOceanSeaBodies,
        majorRivers: finalHydrology.majorRivers,
        minorStreams: finalHydrology.minorStreams,
        lakes: finalHydrology.lakes,
      }),
      geology: Object.freeze({
        pseudoTectonicDomains: domains.length,
        mountainSystems: naturalComposition.mountainSystems.broadComponentCount,
        watersheds: finalHydrology.watersheds,
      }),
      topography: Object.freeze({
        signedElevationMinimum: topography.topographyMetrics.elevationMinimum,
        signedElevationMaximum: topography.topographyMetrics.elevationMaximum,
        slopeP50: topography.topographyMetrics.slopeP50,
        slopeP95: topography.topographyMetrics.slopeP95,
        ridgeCellCount: topography.topographyMetrics.ridgeCells,
        plateauCellCount: topography.topographyMetrics.plateauCells,
        basinCellCount: topography.topographyMetrics.basinCells,
        coastCellCount: topography.topographyMetrics.coastCells,
      }),
      biomes: Object.freeze({
        visualClassCount: topography.biomeMetrics.visualBiomeClassCount,
        minimumPerRegionVisualClassCount:
          topography.biomeMetrics.minimumRegionVisualBiomeClassCount,
        minimumTierIVisualClassCount:
          topography.biomeMetrics.minimumTierIVisualBiomeClassCount,
        minimumTierIIVisualClassCount:
          topography.biomeMetrics.minimumTierIIVisualBiomeClassCount,
        tierIIIVisualClassCount: topography.biomeMetrics.tierIIIVisualBiomeClassCount,
        minimumTierIMajorVisualClassCount:
          topography.biomeMetrics.minimumTierIMajorVisualBiomeClassCount,
        minimumTierITransitionVisualClassCount:
          topography.biomeMetrics.minimumTierITransitionVisualBiomeClassCount,
        minimumTierIIMajorVisualClassCount:
          topography.biomeMetrics.minimumTierIIMajorVisualBiomeClassCount,
        tierIIIMajorVisualClassCount:
          topography.biomeMetrics.tierIIIMajorVisualBiomeClassCount,
        maximumTierISingleBiomeShareBasisPoints:
          topography.biomeMetrics.maximumTierISingleBiomeShareBasisPoints,
        incompatibleVisualAdjacencyCount:
          topography.biomeMetrics.incompatibleVisualBiomeAdjacencyCount,
        incompatibleBiomeLandformPairCount:
          topography.biomeMetrics.incompatibleBiomeLandformPairCount,
      }),
      quality: Object.freeze({
        naturalnessBasisPoints: Math.round((
          legacyBoundaryNaturalnessBasisPoints + compositionNaturalnessBasisPoints
        ) / 2),
        axialArtifactBasisPoints,
        ridgeContinuityBasisPoints,
        hydrologyCoherenceBasisPoints,
      }),
      gateCount: strategicBarrier.gates.length,
      castleSlotCount: sites.castleCount,
      proofs,
    });
    const fields: Readonly<Record<string, IntegerTerrainArray>> = Object.freeze({
      bedrockElevation: reconciled.bedrockElevation,
      elevation: reconciled.elevation,
      filledElevation: reconciled.filledElevation,
      sedimentDepth: fluvial.sedimentDepth,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: hydrology.flowAccumulation,
      domainId,
      geologyId,
      tectonicUplift: uplift,
      rockResistance: resistance,
      geomorphologyElevation: geomorphology.elevation,
      geomorphologyTemperature: geomorphology.temperature,
      geomorphologyMoisture: geomorphology.moisture,
      geomorphologyTotalDelta: geomorphology.totalDelta,
      geomorphologyTerraceDelta: geomorphology.terraceDelta,
      geomorphologyGlacialDelta: geomorphology.glacialDelta,
      geomorphologyAridDelta: geomorphology.aridDelta,
      geomorphologyVolcanicDelta: geomorphology.volcanicDelta,
      geomorphologyCoastalDelta: geomorphology.coastalDelta,
      geomorphologyGlacialMask: geomorphology.glacialMask,
      geomorphologyAridMask: geomorphology.aridMask,
      geomorphologyVolcanicMask: geomorphology.volcanicMask,
      geomorphologyVolcanicAnchorMask: geomorphology.volcanicAnchorMask,
      geomorphologyCoastalMask: geomorphology.coastalMask,
      geomorphologyCoastalClass: geomorphology.coastalClass,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      waterRegime: hydrology.waterRegime,
      waterBodyId: hydrology.waterBodyId,
      waterDepthClass: hydrology.depthClass,
      waterSurfaceLevel: hydrology.surfaceLevel,
      waterDownstream: hydrology.downstream,
      waterBankSeed: hydrology.bankSeed,
      waterGenerationVersion: hydrology.generationVersion,
      biomeId: topography.biomeId,
      landformId: topography.landformId,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      wetnessIndex: topography.wetnessIndex,
      exposure: topography.exposure,
      distanceToCoast: topography.distanceToCoast,
      distanceToFreshwater: topography.distanceToFreshwater,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      temperature: topography.temperature,
      moisture: topography.moisture,
      barrier: strategicBarrier.barrier,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      castleSlot: sites.castleSlot,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
      throneAnchor: throne.mask,
      dressingExcluded: livingWorld.dressingExcluded,
      ecologyClass: livingWorld.ecologyClass,
      vegetationDensity: livingWorld.vegetationDensity,
      groundcoverDensity: livingWorld.groundcoverDensity,
      wildflowerDensity: livingWorld.wildflowerDensity,
      routeClass: livingWorld.routeClass,
      landmarkClass: livingWorld.landmarkClass,
      ambientLifeClass: livingWorld.ambientLifeClass,
      legacyLowlandsCell: legacy.worldCell,
      legacyLowlandsProtectedCell: legacy.protectedCell,
      legacyLowlandsReserveCell: legacy.reserveCell,
      legacyLowlandsCastleSlot: legacy.castleSlot,
    });
    const stageDigests = candidateStageDigests(grid, fields);
    const candidate = Object.freeze({
      candidateOrdinal: input.candidateOrdinal,
      seedMaterial,
      candidateSeed,
      domains,
      grid,
      legacyLowlandsTransform: legacy.transform,
      legacyLowlandsCell: legacy.worldCell,
      legacyLowlandsProtectedCell: legacy.protectedCell,
      legacyLowlandsReserveCell: legacy.reserveCell,
      legacyLowlandsCastleSlot: legacy.castleSlot,
      bedrockElevation: reconciled.bedrockElevation,
      elevation: reconciled.elevation,
      filledElevation: reconciled.filledElevation,
      sedimentDepth: fluvial.sedimentDepth,
      flowReceiver: reconciled.flowReceiver,
      flowAccumulation: hydrology.flowAccumulation,
      domainId,
      geologyId,
      tectonicUplift: uplift,
      rockResistance: resistance,
      geomorphologyElevation: geomorphology.elevation,
      geomorphologyTemperature: geomorphology.temperature,
      geomorphologyMoisture: geomorphology.moisture,
      geomorphologyTotalDelta: geomorphology.totalDelta,
      geomorphologyTerraceDelta: geomorphology.terraceDelta,
      geomorphologyGlacialDelta: geomorphology.glacialDelta,
      geomorphologyAridDelta: geomorphology.aridDelta,
      geomorphologyVolcanicDelta: geomorphology.volcanicDelta,
      geomorphologyCoastalDelta: geomorphology.coastalDelta,
      geomorphologyGlacialMask: geomorphology.glacialMask,
      geomorphologyAridMask: geomorphology.aridMask,
      geomorphologyVolcanicMask: geomorphology.volcanicMask,
      geomorphologyVolcanicAnchorMask: geomorphology.volcanicAnchorMask,
      geomorphologyCoastalMask: geomorphology.coastalMask,
      geomorphologyCoastalClass: geomorphology.coastalClass,
      regionId: strategy.regionId,
      tierId: strategy.tierId,
      waterRegime: hydrology.waterRegime,
      waterBodyId: hydrology.waterBodyId,
      waterDepthClass: hydrology.depthClass,
      waterSurfaceLevel: hydrology.surfaceLevel,
      waterDownstream: hydrology.downstream,
      waterBankSeed: hydrology.bankSeed,
      waterGenerationVersion: hydrology.generationVersion,
      biomeId: topography.biomeId,
      landformId: topography.landformId,
      slope: topography.slope,
      aspect: topography.aspect,
      profileCurvature: topography.profileCurvature,
      planCurvature: topography.planCurvature,
      wetnessIndex: topography.wetnessIndex,
      exposure: topography.exposure,
      distanceToCoast: topography.distanceToCoast,
      distanceToFreshwater: topography.distanceToFreshwater,
      watershedId: topography.watershedId,
      ridgeId: topography.ridgeId,
      temperature: topography.temperature,
      moisture: topography.moisture,
      barrier: strategicBarrier.barrier,
      geologicalBarrierBand: strategicBarrier.geologicalBarrierBand,
      castleSlot: sites.castleSlot,
      resourcePotential: sites.resourcePotential,
      corePotential: sites.corePotential,
      throneAnchor: throne.mask,
      dressingExcluded: livingWorld.dressingExcluded,
      ecologyClass: livingWorld.ecologyClass,
      vegetationDensity: livingWorld.vegetationDensity,
      groundcoverDensity: livingWorld.groundcoverDensity,
      wildflowerDensity: livingWorld.wildflowerDensity,
      routeClass: livingWorld.routeClass,
      landmarkClass: livingWorld.landmarkClass,
      ambientLifeClass: livingWorld.ambientLifeClass,
      tierOneSemanticPermutation: strategy.semanticPermutation,
      tierOneSemanticRegionByRole,
      gateGraph: strategy.gateGraph,
      gates: strategicBarrier.gates,
      barrierCrossSections: strategicBarrier.barrierCrossSections,
      stageDigests,
      aggregate,
      privateMetrics: Object.freeze({
        activeBoundaryCells: boundary.boundaryCells,
        maximumBoundaryRadiusShareBasisPoints: boundary.maximumRadiusShareBasisPoints,
        rotationalSimilarityBasisPoints: boundary.rotationalSimilarityBasisPoints,
        maximumAlignedBoundaryRun: boundary.maximumAlignedBoundaryRun,
        minimumBoundaryLandDistance: boundary.minimumBoundaryLandDistance,
        saltwaterBoundaryBasisPoints: boundary.saltwaterBoundaryBasisPoints,
        majorLandmassCount: landmasses.majorLandmassCount,
        largeIslandCount: landmasses.largeIslandCount,
        smallIslandCount: landmasses.smallIslandCount,
        mountainBarrierCells,
        measuredMinimumBarrierWidth: strategicBarrier.measuredMinimumBarrierWidth,
        measuredMaximumBarrierWidth: strategicBarrier.measuredMaximumBarrierWidth,
        gateRouteRedundancyProof: strategicBarrier.gateRouteRedundancyProof,
        lakeBasinCandidates: generatedSurfaceMetrics.lakeBasinCandidates,
        riverMouthCandidates: generatedSurfaceMetrics.riverMouthCandidates,
        streamHeadCandidates: generatedSurfaceMetrics.streamHeadCandidates,
        resourcePotentialSites: sites.resourcePotentialCount,
        corePotentialSites: sites.corePotentialCount,
        chunkCount: chunks.count,
        chunkPopulationMinimum: chunks.minimum,
        chunkPopulationMedian: chunks.median,
        chunkPopulationP95: chunks.p95,
        chunkPopulationMaximum: chunks.maximum,
        erodedMaterialUnits: fluvial.erodedMaterialUnits,
        depositedMaterialUnits: fluvial.depositedMaterialUnits,
        exportedSedimentUnits: fluvial.exportedSedimentUnits,
        minimumLargestPassableRegionShareBasisPoints: Math.min(
          ...topology.largestSharesBasisPoints,
        ),
        largestPassableRegionSharesBasisPoints: topology.largestSharesBasisPoints,
        minorPassableFragmentSharesBasisPoints:
          strategicShape.minorFragmentSharesBasisPoints,
        passableSemanticInterfaceDensityBasisPoints:
          strategicShape.semanticInterfaceDensityBasisPoints,
        passableImmutablePerimeterDensityBasisPoints:
          strategicShape.immutablePerimeterDensityBasisPoints,
        passableTendrilSharesBasisPoints: strategicShape.tendrilSharesBasisPoints,
        tierRadialAgreementBasisPoints: strategicShape.tierRadialAgreementBasisPoints,
        radialTierOneBoundaryShareBasisPoints:
          strategicShape.radialTierOneBoundaryShareBasisPoints,
        highlandBarrierShareBasisPoints:
          strategicBarrier.highlandBarrierShareBasisPoints,
        barrierMeanElevationAdvantage: strategicBarrier.barrierMeanElevationAdvantage,
        barrierMeanUpliftAdvantage: strategicBarrier.barrierMeanUpliftAdvantage,
        naturalComposition,
        geomorphology: geomorphology.metrics,
        reliefStructure,
        geologyAuthority: Object.freeze({
          version: GREATER_REALM_GEOLOGY_AUTHORITY_VERSION,
          metrics: geologyAuthorityMetrics,
        }),
        hydrologyAuthority: Object.freeze({
          version: GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION,
          generationVersion: GREATER_REALM_HYDROLOGY_GENERATION_VERSION,
          metrics: hydrology.metrics,
        }),
        strategicAudits: Object.freeze({
          version: GREATER_REALM_STRATEGIC_AUDITS_VERSION,
          regionBoundaryAlignment,
          tierPotentialDensity,
          castleSuitability,
          innerGateThrone,
        }),
        topographicQa,
        chunkBenchmark,
        topographyPatchSupport,
        livingWorld: Object.freeze({
          version: livingWorld.version,
          metrics: livingWorld.metrics,
          invariants: livingWorld.invariants,
        }),
        throneAnchorBarrierClearance: throne.barrierClearance,
        tierThreePassableLandCells,
        smallestOtherRegionPassableLandCells,
        eligibilityFailureCodes,
      }),
    });
    // Hydrology owns the candidate's exact accumulation copy. Retire the
    // reconciled pre-authority duplicate once every downstream audit is bound.
    reconciled.flowAccumulation.fill(0n);
    reconciledFlowAccumulationOnFailure = undefined;
    hydrologyOnFailure = undefined;
    return candidate;
  } catch (error) {
    if (livingWorldOnFailure) {
      clearGreaterRealmLivingWorldAuthority(livingWorldOnFailure);
      livingWorldOnFailure = undefined;
    }
    if (hydrologyOnFailure) {
      hydrologyOnFailure.clear();
      hydrologyOnFailure = undefined;
    }
    engineeredWaterClearanceMaskOnFailure?.fill(0);
    engineeredWaterClearanceMaskOnFailure = undefined;
    geomorphologyProcessMoistureOnFailure?.fill(0);
    geomorphologyProcessMoistureOnFailure = undefined;
    preliminaryWaterRegimeOnFailure?.fill(0);
    preliminaryWaterRegimeOnFailure = undefined;
    preliminaryBiomeIdOnFailure?.fill(0);
    preliminaryBiomeIdOnFailure = undefined;
    preliminaryLandformIdOnFailure?.fill(0);
    preliminaryLandformIdOnFailure = undefined;
    repairImmutableCellOnFailure?.fill(0);
    repairImmutableCellOnFailure = undefined;
    reconciledFlowAccumulationOnFailure?.fill(0n);
    reconciledFlowAccumulationOnFailure = undefined;
    activeMaskOnFailure?.fill(0);
    activeMaskOnFailure = undefined;
    seedMaterial.fill(0);
    candidateSeed.fill(0);
    throw error;
  }
}

export function clearGreaterRealmCandidateSecret(candidate: GreaterRealmPrivateCandidate): void {
  candidate.seedMaterial.fill(0);
  candidate.candidateSeed.fill(0);
}
