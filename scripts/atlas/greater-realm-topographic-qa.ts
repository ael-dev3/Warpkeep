import {
  GREATER_REALM_BIOME_CATALOG,
  GREATER_REALM_BIOME_CLASS_COUNT,
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_CATALOG,
  GREATER_REALM_LANDFORM_CLASS_COUNT,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import {
  GREATER_REALM_COASTAL_CLASS,
} from './greater-realm-geomorphology';
import {
  isCanonicalGreaterRealmAxialGrid,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

/**
 * Dormant, offline-only aggregate QA for a Greater Realm candidate.
 *
 * The report deliberately contains no coordinates, cell indexes, labels, or
 * masks. It is retained only in the private candidate package and is absent
 * from the public review format.
 */
export const GREATER_REALM_TOPOGRAPHIC_QA_VERSION =
  'greater-realm-topographic-qa-v2' as const;

const NEIGHBOR_COUNT = 6;
const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const MAX_CELL_COUNT = INT32_MAX;
const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
const WATER_SEA = 5;
const WATER_MARSH = 6;
const WATER_REGIME_COUNT = 7;
const LOW_GRADIENT_MARSH_MAXIMUM_SLOPE = 650;
const STRAHLER_ORDER_BIN_COUNT = 32;
const COMPONENT_SIZE_BIN_COUNT = 32;
const HYPSOMETRIC_POINT_COUNT = 21;
const REGION_COUNT = 10;
const FROSTMERE_REGION = 1;
const SUNSCAR_REGION = 2;
const MIREFEN_REGION = 3;
const STONEWAKE_REGION = 4;
const DEFAULT_TIER_ONE_SEMANTIC_REGION_BY_ROLE = Object.freeze([0, 1, 2, 3, 4, 5]);
const FIRST_TIER_II_REGION = 6;
const LAST_TIER_II_REGION = 8;
const THRONEHEART_REGION = 9;
const MEANINGFUL_ISLAND_MINIMUM_CELLS = 64;
const NARROW_STRAIT_MAXIMUM_DISTANCE = 5;
const OASIS_FRESHWATER_INFLUENCE_MAXIMUM_DISTANCE = 3;

export const GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY = Object.freeze({
  frostmereMinimumFjordCells: 8,
  frostmereMinimumFjordSystems: 2,
  mirefenMinimumWetlandComplexCells: 64,
  mirefenMinimumDeltaEstuaryCells: 8,
  mirefenMinimumBraidedChannelProxyEdges: 8,
  sunscarMinimumAridDryLandBasisPoints: 500,
  sunscarMinimumAridBiomeClasses: 2,
  sunscarMinimumSeasonalChannelCells: 64,
  sunscarMinimumOasisMarginCells: 4,
  sunscarMinimumOasisSystems: 2,
  stonewakeMinimumMeaningfulIslands: 3,
  stonewakeMinimumNarrowIslandStraitCells: 4,
  tierTwoMinimumHighlandChannelSources: 8,
  throneheartMinimumChannelDensityBasisPoints: 750,
  throneheartMaximumChannelDensityBasisPoints: 2_500,
  throneheartMinimumChannelSources: 16,
  throneheartMinimumLargestNavigableComponentBasisPoints: 9_500,
} as const);

export type GreaterRealmRegionalHydrogeomorphologyMetrics = Readonly<{
  frostmere: Readonly<{
    fjordCellCount: number;
    fjordSystemCount: number;
    proof: boolean;
  }>;
  mirefen: Readonly<{
    marshCellCount: number;
    /**
     * Distinct final cells carrying either marsh hydrology or the explicit
     * dry RIVER_DELTA biome. At least one marsh cell remains mandatory, so a
     * dry delta field alone cannot satisfy the regional proof.
     */
    wetlandComplexCellCount: number;
    deltaEstuaryCellCount: number;
    /**
     * Low-gradient lateral channel/channel and channel/explicit-delta
     * adjacency outside the single-receiver DAG. This is explicitly a
     * braided-waterway proxy, not divergent-flow authority.
     */
    braidedChannelProxyEdgeCount: number;
    proof: boolean;
  }>;
  sunscar: Readonly<{
    dryCellCount: number;
    aridDryCellCount: number;
    aridDryLandBasisPoints: number;
    aridBiomeClassCount: number;
    seasonalChannelCellCount: number;
    /**
     * Arid dry cells within three same-region, non-saltwater hex edges of
     * freshwater: water, up to two riparian transition cells, then the arid
     * margin. This is ecological influence, not direct shoreline adjacency.
     */
    oasisMarginCellCount: number;
    oasisSystemCount: number;
    proof: boolean;
  }>;
  stonewake: Readonly<{
    meaningfulIslandCount: number;
    narrowIslandStraitCellCount: number;
    proof: boolean;
  }>;
  tierII: Readonly<{
    highlandChannelSourceCounts: readonly number[];
    minimumHighlandChannelSourceCount: number;
    proof: boolean;
  }>;
  throneheart: Readonly<{
    regionCellCount: number;
    channelCellCount: number;
    channelDensityBasisPoints: number;
    channelSourceCount: number;
    navigableCellCount: number;
    largestNavigableComponentCellCount: number;
    largestNavigableComponentBasisPoints: number;
    proof: boolean;
  }>;
  proof: boolean;
}>;

export type GreaterRealmTierOneRegionalSignature = Readonly<{
  region: number;
  frostmere: GreaterRealmRegionalHydrogeomorphologyMetrics['frostmere'];
  sunscar: GreaterRealmRegionalHydrogeomorphologyMetrics['sunscar'];
  mirefen: GreaterRealmRegionalHydrogeomorphologyMetrics['mirefen'];
  stonewake: GreaterRealmRegionalHydrogeomorphologyMetrics['stonewake'];
}>;

/**
 * Assign semantic Tier-I names to already-proved physical regions. This
 * changes metadata only: the returned array maps semantic role id to the
 * existing region id, leaving every cell's region authority untouched.
 */
export function assignGreaterRealmTierOneSemanticRegionsBySignature(
  signatures: readonly GreaterRealmTierOneRegionalSignature[],
): readonly number[] {
  const ordered = [...signatures].sort((first, second) => first.region - second.region);
  if (
    ordered.length !== 5
    || ordered.some((signature, index) => signature.region !== index + 1)
  ) fail('GREATER_REALM_TIER_ONE_SEMANTIC_SIGNATURES_INVALID');
  const signal = (
    signature: GreaterRealmTierOneRegionalSignature,
    role: number,
  ): Readonly<{ proof: boolean; value: bigint }> => {
    switch (role) {
      case FROSTMERE_REGION:
        return Object.freeze({
          proof: signature.frostmere.proof,
          value: BigInt(signature.frostmere.fjordCellCount) * 10_000n
            + BigInt(signature.frostmere.fjordSystemCount) * 100_000n,
        });
      case SUNSCAR_REGION:
        return Object.freeze({
          proof: signature.sunscar.proof,
          value: BigInt(signature.sunscar.aridDryLandBasisPoints) * 10_000n
            + BigInt(signature.sunscar.aridBiomeClassCount) * 100_000n
            + BigInt(signature.sunscar.seasonalChannelCellCount) * 100n
            + BigInt(signature.sunscar.oasisMarginCellCount) * 1_000n
            + BigInt(signature.sunscar.oasisSystemCount) * 10_000n,
        });
      case MIREFEN_REGION:
        return Object.freeze({
          proof: signature.mirefen.proof,
          value: BigInt(signature.mirefen.wetlandComplexCellCount) * 10_000n
            + BigInt(signature.mirefen.deltaEstuaryCellCount) * 10_000n
            + BigInt(signature.mirefen.braidedChannelProxyEdgeCount) * 10_000n,
        });
      case STONEWAKE_REGION:
        return Object.freeze({
          proof: signature.stonewake.proof,
          value: BigInt(signature.stonewake.meaningfulIslandCount) * 100_000n
            + BigInt(signature.stonewake.narrowIslandStraitCellCount) * 1_000n,
        });
      default:
        return Object.freeze({ proof: false, value: 0n });
    }
  };
  let bestMapping: readonly number[] | undefined;
  let bestProofCount = -1;
  let bestSignal = -1n;
  for (let frost = 1; frost <= 5; frost += 1) {
    for (let sunscar = 1; sunscar <= 5; sunscar += 1) {
      if (sunscar === frost) continue;
      for (let mirefen = 1; mirefen <= 5; mirefen += 1) {
        if (mirefen === frost || mirefen === sunscar) continue;
        for (let stonewake = 1; stonewake <= 5; stonewake += 1) {
          if ([frost, sunscar, mirefen].includes(stonewake)) continue;
          const emberwood = [1, 2, 3, 4, 5].find(region => (
            ![frost, sunscar, mirefen, stonewake].includes(region)
          ));
          if (emberwood === undefined) {
            fail('GREATER_REALM_TIER_ONE_SEMANTIC_ASSIGNMENT_INCOMPLETE');
          }
          const mapping = [0, frost, sunscar, mirefen, stonewake, emberwood] as const;
          let proofCount = 0;
          let totalSignal = 0n;
          for (let role = 1; role <= 4; role += 1) {
            const roleSignal = signal(ordered[mapping[role]! - 1]!, role);
            if (roleSignal.proof) proofCount += 1;
            totalSignal += roleSignal.value;
          }
          if (
            proofCount > bestProofCount
            || (proofCount === bestProofCount && totalSignal > bestSignal)
          ) {
            bestMapping = mapping;
            bestProofCount = proofCount;
            bestSignal = totalSignal;
          }
        }
      }
    }
  }
  if (!bestMapping) fail('GREATER_REALM_TIER_ONE_SEMANTIC_ASSIGNMENT_FAILED');
  return Object.freeze([...bestMapping]);
}

export const GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS = Object.freeze({
  elevation: Object.freeze({
    minimumInclusive: -65_536,
    width: 4_096,
    count: 32,
  }),
  slope: Object.freeze({
    minimumInclusive: 0,
    width: 4_096,
    count: 16,
  }),
  erosion: Object.freeze({
    minimumInclusive: 0,
    width: 64,
    count: 32,
  }),
  sediment: Object.freeze({
    minimumInclusive: 0,
    width: 16,
    count: 16,
  }),
  roughness: Object.freeze({
    minimumInclusive: 0,
    width: 512,
    count: 32,
  }),
  curvature: Object.freeze({
    minimumInclusive: 0,
    width: 1_024,
    count: 32,
  }),
  componentSizePowerOfTwoBinCount: COMPONENT_SIZE_BIN_COUNT,
  strahlerOrderBinCount: STRAHLER_ORDER_BIN_COUNT,
} as const);

export type GreaterRealmFixedHistogram = Readonly<{
  minimumInclusive: number;
  width: number;
  counts: readonly number[];
  underflowCount: number;
  overflowCount: number;
}>;

export type GreaterRealmComponentSummary = Readonly<{
  cellCount: number;
  componentCount: number;
  smallestComponentCells: number;
  medianComponentCells: number;
  p95ComponentCells: number;
  largestComponentCells: number;
  largestComponentShareBasisPoints: number;
  sizePowerOfTwoCounts: readonly number[];
}>;

export type GreaterRealmTopographicQaInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  /** Semantic role id -> already-proved physical Tier-I region id. */
  tierOneSemanticRegionByRole?: readonly number[];
  geomorphologyCoastalClass: Uint8Array;
  elevation: Int32Array;
  /**
   * Final geomorphology surface immediately before the erosion/deposition
   * stage under review. This must not be the geological bedrock field: using
   * bedrock would misclassify uplift, terraces, and weathering as erosion.
   */
  preErosionElevation: Int32Array;
  sedimentDepth: Uint16Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  slope: Uint16Array;
  aspect: Uint8Array;
  profileCurvature: Int32Array;
  planCurvature: Int32Array;
  watershedId: Int32Array;
  ridgeId: Int32Array;
  /** Frozen legacy terrain is included in relief totals but not process audits. */
  legacyProtectedCell?: Uint8Array;
  /** Reviewed gate/causeway cells where a wetland biome is kept traversable. */
  waterClassificationExemptionMask?: Uint8Array;
  seaLevel?: number;
}>;

export type GreaterRealmTopographicQaReport = Readonly<{
  version: typeof GREATER_REALM_TOPOGRAPHIC_QA_VERSION;
  cellCount: number;
  landCellCount: number;
  waterCellCount: number;
  elevation: Readonly<{
    minimum: number;
    maximum: number;
    allCellsHistogram: GreaterRealmFixedHistogram;
    landCellsHistogram: GreaterRealmFixedHistogram;
    hypsometricIntegralBasisPoints: number;
    hypsometricCurve: readonly Readonly<{
      landAreaAboveBasisPoints: number;
      elevation: number;
      relativeElevationBasisPoints: number;
    }>[];
  }>;
  slope: Readonly<{
    histogram: GreaterRealmFixedHistogram;
    minimum: number;
    median: number;
    p95: number;
    maximum: number;
    mean: number;
  }>;
  landforms: readonly Readonly<{
    id: number;
    key: string;
    count: number;
    shareBasisPoints: number;
  }>[];
  ridges: GreaterRealmComponentSummary & Readonly<{
    connectedEdgeCount: number;
    isolatedCellCount: number;
    endpointCellCount: number;
    junctionCellCount: number;
    adjacencyContinuityBasisPoints: number;
  }>;
  watersheds: Readonly<{
    watershedCount: number;
    smallestWatershedCells: number;
    medianWatershedCells: number;
    p95WatershedCells: number;
    largestWatershedCells: number;
    largestWatershedShareBasisPoints: number;
    sizePowerOfTwoCounts: readonly number[];
  }>;
  rivers: Readonly<{
    channelCellCount: number;
    channelEdgeCount: number;
    sourceCellCount: number;
    outletCount: number;
    drainageDensityBasisPoints: number;
    maximumStrahlerOrder: number;
    strahlerOrderCellCounts: readonly number[];
    maximumFlowAccumulation: string;
  }>;
  mountainChains: GreaterRealmComponentSummary & Readonly<{
    /** O(N) canonical two-sweep lower bound, not an exact graph diameter. */
    maximumTwoSweepGraphSpanCells: number;
    widestMeanThicknessCells: number;
    meanTwoSweepGraphSpanCells: number;
    meanThicknessMilliCells: number;
  }>;
  plateaus: GreaterRealmComponentSummary;
  basins: GreaterRealmComponentSummary;
  coastalSlopes: Readonly<{
    coastalLandCellCount: number;
    gentleCellCount: number;
    moderateCellCount: number;
    steepCellCount: number;
    cliffCellCount: number;
    classSharesBasisPoints: readonly number[];
  }>;
  erosion: Readonly<{
    erodedCellCount: number;
    totalErodedUnits: string;
    meanErodedUnitsPerAffectedCell: number;
    maximumErodedUnits: number;
    nonSedimentaryGainCellCount: number;
    totalNonSedimentaryGainUnits: string;
    histogram: GreaterRealmFixedHistogram;
  }>;
  sediment: Readonly<{
    depositedCellCount: number;
    totalDepositedUnits: string;
    meanDepositedUnitsPerAffectedCell: number;
    maximumDepositedUnits: number;
    histogram: GreaterRealmFixedHistogram;
  }>;
  biomeElevationConsistency: Readonly<{
    biomeElevation: readonly Readonly<{
      id: number;
      key: string;
      count: number;
      minimumElevation: number;
      maximumElevation: number;
      meanElevation: number;
    }>[];
    waterRegimeMismatchCount: number;
    waterClassificationExemptionCellCount: number;
    coldHighBiomeBelowHighlandCount: number;
    lowlandBiomeAboveAlpineCount: number;
    marshCellCount: number;
    lowGradientMarshCellCount: number;
    highGradientMarshCellCount: number;
    marshClassificationMismatchCount: number;
    inconsistentCellCount: number;
    consistentCellCount: number;
    consistentShareBasisPoints: number;
  }>;
  axialArtifacts: Readonly<{
    aspectCellCounts: readonly number[];
    directionalAspectAnisotropyBasisPoints: number;
    axisEdgeCounts: readonly number[];
    axisMeanAbsoluteElevationDelta: readonly number[];
    edgeRoughnessAnisotropyBasisPoints: number;
  }>;
  roughness: Readonly<{
    edgeCount: number;
    flatEdgeCount: number;
    roughEdgeCount: number;
    flatEdgeShareBasisPoints: number;
    roughEdgeShareBasisPoints: number;
    meanAbsoluteElevationDelta: number;
    maximumAbsoluteElevationDelta: number;
    absoluteElevationDeltaHistogram: GreaterRealmFixedHistogram;
    absoluteProfileCurvatureHistogram: GreaterRealmFixedHistogram;
    absolutePlanCurvatureHistogram: GreaterRealmFixedHistogram;
  }>;
  regionalHydrogeomorphology: GreaterRealmRegionalHydrogeomorphologyMetrics;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function basisPoints(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.round((numerator * 10_000) / denominator);
}

function roundDivideBigInt(numerator: bigint, denominator: number): number {
  if (!Number.isSafeInteger(denominator) || denominator <= 0) return 0;
  const divisor = BigInt(denominator);
  const sign = numerator < 0n ? -1n : 1n;
  const magnitude = numerator < 0n ? -numerator : numerator;
  return Number(sign * ((magnitude + divisor / 2n) / divisor));
}

function assertInt32(value: number, code: string): void {
  if (
    !Number.isSafeInteger(value)
    || value < INT32_MIN
    || value > INT32_MAX
  ) fail(code);
}

function assertInputArrays(input: GreaterRealmTopographicQaInput): void {
  if (input === null || typeof input !== 'object') {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_INPUT_INVALID');
  }
  const { grid } = input;
  if (
    !grid
    || !Number.isSafeInteger(grid.cellCount)
    || grid.cellCount < 1
    || grid.cellCount > MAX_CELL_COUNT
    || !(grid.q instanceof Int32Array)
    || !(grid.r instanceof Int32Array)
    || !(grid.neighbors instanceof Int32Array)
    || grid.q.length !== grid.cellCount
    || grid.r.length !== grid.cellCount
    || grid.neighbors.length !== grid.cellCount * NEIGHBOR_COUNT
  ) fail('GREATER_REALM_TOPOGRAPHIC_QA_GRID_INVALID');

  const exactFields = [
    input.regionId instanceof Uint8Array,
    input.geomorphologyCoastalClass instanceof Uint8Array,
    input.elevation instanceof Int32Array,
    input.preErosionElevation instanceof Int32Array,
    input.sedimentDepth instanceof Uint16Array,
    input.flowReceiver instanceof Int32Array,
    input.flowAccumulation instanceof BigUint64Array,
    input.waterRegime instanceof Uint8Array,
    input.biomeId instanceof Uint8Array,
    input.landformId instanceof Uint8Array,
    input.slope instanceof Uint16Array,
    input.aspect instanceof Uint8Array,
    input.profileCurvature instanceof Int32Array,
    input.planCurvature instanceof Int32Array,
    input.watershedId instanceof Int32Array,
    input.ridgeId instanceof Int32Array,
    input.legacyProtectedCell === undefined
      || input.legacyProtectedCell instanceof Uint8Array,
    input.waterClassificationExemptionMask === undefined
      || input.waterClassificationExemptionMask instanceof Uint8Array,
  ];
  if (exactFields.some(matches => !matches)) {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_FIELD_TYPE_INVALID');
  }
  const fields: readonly ArrayLike<unknown>[] = [
    input.regionId,
    input.geomorphologyCoastalClass,
    input.elevation,
    input.preErosionElevation,
    input.sedimentDepth,
    input.flowReceiver,
    input.flowAccumulation,
    input.waterRegime,
    input.biomeId,
    input.landformId,
    input.slope,
    input.aspect,
    input.profileCurvature,
    input.planCurvature,
    input.watershedId,
    input.ridgeId,
    ...(input.legacyProtectedCell ? [input.legacyProtectedCell] : []),
    ...(input.waterClassificationExemptionMask
      ? [input.waterClassificationExemptionMask]
      : []),
  ];
  if (fields.some(field => field.length !== grid.cellCount)) {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_FIELD_LENGTH_INVALID');
  }
  assertInt32(
    input.seaLevel ?? 0,
    'GREATER_REALM_TOPOGRAPHIC_QA_SEA_LEVEL_INVALID',
  );
  if (input.legacyProtectedCell?.some(value => value > 1)) {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_LEGACY_MASK_INVALID');
  }
  if (input.waterClassificationExemptionMask?.some(value => value > 1)) {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_WATER_EXEMPTION_MASK_INVALID');
  }
  if (
    input.tierOneSemanticRegionByRole !== undefined
    && (
      input.tierOneSemanticRegionByRole.length !== 6
      || input.tierOneSemanticRegionByRole[0] !== 0
      || [...input.tierOneSemanticRegionByRole].sort((first, second) => first - second)
        .some((region, index) => region !== index)
    )
  ) fail('GREATER_REALM_TOPOGRAPHIC_QA_SEMANTIC_REGION_MAPPING_INVALID');
}

function validateGrid(grid: IndexedAxialGrid): void {
  if (!isCanonicalGreaterRealmAxialGrid(grid)) {
    fail('GREATER_REALM_TOPOGRAPHIC_QA_GRID_INVALID');
  }
}

function validateClassificationFields(
  input: GreaterRealmTopographicQaInput,
): void {
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (input.regionId[cell]! >= REGION_COUNT) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_REGION_INVALID');
    }
    if (
      input.geomorphologyCoastalClass[cell]!
        > GREATER_REALM_COASTAL_CLASS.glacialFjord
    ) fail('GREATER_REALM_TOPOGRAPHIC_QA_COASTAL_CLASS_INVALID');
    if (input.waterRegime[cell]! >= WATER_REGIME_COUNT) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_WATER_REGIME_INVALID');
    }
    if (input.biomeId[cell]! >= GREATER_REALM_BIOME_CLASS_COUNT) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_BIOME_INVALID');
    }
    if (input.landformId[cell]! >= GREATER_REALM_LANDFORM_CLASS_COUNT) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_LANDFORM_INVALID');
    }
    if (input.aspect[cell]! > NEIGHBOR_COUNT) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_ASPECT_INVALID');
    }
    if (input.watershedId[cell]! <= 0) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_WATERSHED_INVALID');
    }
    if (input.ridgeId[cell]! < 0) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_RIDGE_INVALID');
    }
    if (
      input.ridgeId[cell]! > 0
      && input.waterRegime[cell] !== WATER_DRY
    ) fail('GREATER_REALM_TOPOGRAPHIC_QA_WATER_RIDGE_INVALID');
  }
}

function validateConnectedLabels(
  grid: IndexedAxialGrid,
  labels: Int32Array,
  allowZero: boolean,
  allowAdjacentDifferentLabels: boolean,
  code: string,
): void {
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  const completedLabels = new Set<number>();
  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      const label = labels[start]!;
      if ((allowZero && label === 0) || seen[start] === 1) continue;
      if (completedLabels.has(label)) fail(code);
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          const neighborLabel = labels[neighbor]!;
          if (
            !allowAdjacentDifferentLabels
            && neighborLabel > 0
            && neighborLabel !== label
          ) fail(code);
          if (neighborLabel !== label || seen[neighbor] === 1) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      completedLabels.add(label);
    }
  } finally {
    seen.fill(0);
    queue.fill(0);
    completedLabels.clear();
  }
}

function validateFlowAndBuildOrder(
  input: GreaterRealmTopographicQaInput,
): Uint32Array {
  const incoming = new Uint32Array(input.grid.cellCount);
  const queue = new Uint32Array(input.grid.cellCount);
  const order = new Uint32Array(input.grid.cellCount);
  let completed = false;
  try {
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const receiver = input.flowReceiver[cell]!;
      if (receiver === -1) continue;
      if (
        receiver < 0
        || receiver >= input.grid.cellCount
        || receiver === cell
      ) fail('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_RECEIVER_INVALID');
      let isNeighbor = false;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        if (
          input.grid.neighbors[cell * NEIGHBOR_COUNT + direction] === receiver
        ) {
          isNeighbor = true;
          break;
        }
      }
      if (!isNeighbor) {
        fail('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_RECEIVER_INVALID');
      }
      if (input.watershedId[receiver] !== input.watershedId[cell]) {
        fail('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_WATERSHED_MISMATCH');
      }
      if (input.flowAccumulation[receiver]! < input.flowAccumulation[cell]!) {
        fail('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_ACCUMULATION_INVALID');
      }
      incoming[receiver] += 1;
    }

    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (incoming[cell] === 0) queue[tail++] = cell;
    }
    let ordered = 0;
    while (head < tail) {
      const cell = queue[head++]!;
      order[ordered++] = cell;
      const receiver = input.flowReceiver[cell]!;
      if (receiver < 0) continue;
      incoming[receiver] -= 1;
      if (incoming[receiver] === 0) queue[tail++] = receiver;
    }
    if (ordered !== input.grid.cellCount) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_FLOW_CYCLE');
    }
    completed = true;
    return order;
  } finally {
    incoming.fill(0);
    queue.fill(0);
    if (!completed) order.fill(0);
  }
}

function addHistogramValue(
  counts: Float64Array,
  minimumInclusive: number,
  width: number,
  value: number,
): -1 | 0 | 1 {
  if (value < minimumInclusive) return -1;
  const bin = Math.floor((value - minimumInclusive) / width);
  if (bin >= counts.length) return 1;
  counts[bin] += 1;
  return 0;
}

function freezeHistogram(
  minimumInclusive: number,
  width: number,
  counts: Float64Array,
  underflowCount: number,
  overflowCount: number,
): GreaterRealmFixedHistogram {
  return Object.freeze({
    minimumInclusive,
    width,
    counts: Object.freeze(Array.from(counts)),
    underflowCount,
    overflowCount,
  });
}

function componentSizeBin(size: number): number {
  let bin = 0;
  let threshold = 2;
  while (bin < COMPONENT_SIZE_BIN_COUNT - 1 && size >= threshold) {
    bin += 1;
    threshold *= 2;
  }
  return bin;
}

function summarizeSizes(
  sizes: number[],
  totalCells: number,
): GreaterRealmComponentSummary {
  const sizeCounts = new Float64Array(COMPONENT_SIZE_BIN_COUNT);
  try {
    sizes.sort((first, second) => first - second);
    for (const size of sizes) sizeCounts[componentSizeBin(size)] += 1;
    const largest = sizes.at(-1) ?? 0;
    return Object.freeze({
      cellCount: totalCells,
      componentCount: sizes.length,
      smallestComponentCells: sizes[0] ?? 0,
      medianComponentCells:
        sizes.length === 0 ? 0 : sizes[Math.floor((sizes.length - 1) / 2)]!,
      p95ComponentCells:
        sizes.length === 0 ? 0 : sizes[Math.floor((sizes.length - 1) * 0.95)]!,
      largestComponentCells: largest,
      largestComponentShareBasisPoints: basisPoints(largest, totalCells),
      sizePowerOfTwoCounts: Object.freeze(Array.from(sizeCounts)),
    });
  } finally {
    sizeCounts.fill(0);
  }
}

function measureMaskComponents(
  grid: IndexedAxialGrid,
  mask: Uint8Array,
): GreaterRealmComponentSummary {
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  const sizes: number[] = [];
  let totalCells = 0;
  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (mask[start] !== 1) continue;
      totalCells += 1;
      if (seen[start] === 1) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || mask[neighbor] !== 1
            || seen[neighbor] === 1
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      sizes.push(tail);
    }
    return summarizeSizes(sizes, totalCells);
  } finally {
    seen.fill(0);
    queue.fill(0);
    sizes.fill(0);
  }
}

function measureMountainGeometry(
  grid: IndexedAxialGrid,
  mask: Uint8Array,
): Readonly<{
  maximumTwoSweepGraphSpanCells: number;
  widestMeanThicknessCells: number;
  meanTwoSweepGraphSpanCells: number;
  meanThicknessMilliCells: number;
}> {
  const componentSeen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  const distance = new Int32Array(grid.cellCount);
  distance.fill(-1);
  let componentCount = 0;
  let maximumTwoSweepGraphSpanCells = 0;
  let widestMeanThicknessCells = 0;
  let totalGraphSpanCells = 0;
  let totalThicknessMilliCells = 0;

  const farthest = (start: number, markComponent: boolean): Readonly<{
    cell: number;
    distance: number;
    visited: number;
  }> => {
    let head = 0;
    let tail = 0;
    let farthestCell = start;
    let farthestDistance = 0;
    queue[tail++] = start;
    distance[start] = 0;
    while (head < tail) {
      const cell = queue[head++]!;
      const cellDistance = distance[cell]!;
      if (
        cellDistance > farthestDistance
        || (cellDistance === farthestDistance && cell < farthestCell)
      ) {
        farthestCell = cell;
        farthestDistance = cellDistance;
      }
      if (markComponent) componentSeen[cell] = 1;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || mask[neighbor] !== 1
          || distance[neighbor] !== -1
        ) continue;
        distance[neighbor] = cellDistance + 1;
        queue[tail++] = neighbor;
      }
    }
    for (let offset = 0; offset < tail; offset += 1) {
      distance[queue[offset]!] = -1;
    }
    return Object.freeze({
      cell: farthestCell,
      distance: farthestDistance,
      visited: tail,
    });
  };

  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (mask[start] !== 1 || componentSeen[start] === 1) continue;
      const firstSweep = farthest(start, true);
      const secondSweep = farthest(firstSweep.cell, false);
      const graphSpanCells = secondSweep.distance + 1;
      const meanThicknessCells = Math.ceil(
        firstSweep.visited / graphSpanCells,
      );
      componentCount += 1;
      maximumTwoSweepGraphSpanCells = Math.max(
        maximumTwoSweepGraphSpanCells,
        graphSpanCells,
      );
      widestMeanThicknessCells = Math.max(
        widestMeanThicknessCells,
        meanThicknessCells,
      );
      totalGraphSpanCells += graphSpanCells;
      totalThicknessMilliCells += Math.round(
        (firstSweep.visited * 1_000) / graphSpanCells,
      );
    }
    return Object.freeze({
      maximumTwoSweepGraphSpanCells,
      widestMeanThicknessCells,
      meanTwoSweepGraphSpanCells:
        componentCount === 0
          ? 0
          : Math.round(totalGraphSpanCells / componentCount),
      meanThicknessMilliCells:
        componentCount === 0
          ? 0
          : Math.round(totalThicknessMilliCells / componentCount),
    });
  } finally {
    componentSeen.fill(0);
    queue.fill(0);
    distance.fill(0);
  }
}

function isChannelRegime(regime: number): boolean {
  return regime === WATER_RIVER || regime === WATER_STREAM;
}

function isFreshwaterRegime(regime: number, biomeId: number): boolean {
  return regime === WATER_LAKE
    || regime === WATER_RIVER
    || regime === WATER_STREAM
    || (
      regime === WATER_MARSH
      && biomeId === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
    );
}

function aridBiomeClass(biomeId: number): number {
  switch (biomeId) {
    case GREATER_REALM_BIOME_ID.SAVANNA: return 0;
    case GREATER_REALM_BIOME_ID.WARM_SCRUB: return 1;
    case GREATER_REALM_BIOME_ID.DUNE_DESERT: return 2;
    case GREATER_REALM_BIOME_ID.ROCKY_DESERT: return 3;
    case GREATER_REALM_BIOME_ID.RED_BADLANDS: return 4;
    default: return -1;
  }
}

function measureRegionalHydrogeomorphology(
  input: GreaterRealmTopographicQaInput,
  seaLevel: number,
  semanticRegionByRole: readonly number[] = input.tierOneSemanticRegionByRole
    ?? DEFAULT_TIER_ONE_SEMANTIC_REGION_BY_ROLE,
): GreaterRealmRegionalHydrogeomorphologyMetrics {
  const policy = GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY;
  const { grid } = input;
  const frostmereRegion = semanticRegionByRole[FROSTMERE_REGION]!;
  const sunscarRegion = semanticRegionByRole[SUNSCAR_REGION]!;
  const mirefenRegion = semanticRegionByRole[MIREFEN_REGION]!;
  const stonewakeRegion = semanticRegionByRole[STONEWAKE_REGION]!;
  const fjordMask = new Uint8Array(grid.cellCount);
  const oasisMarginMask = new Uint8Array(grid.cellCount);
  const stonewakeIslandMask = new Uint8Array(grid.cellCount);
  const throneheartNavigableMask = new Uint8Array(grid.cellCount);
  const componentId = new Int32Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  const visitEpoch = new Uint32Array(grid.cellCount);
  const visitDepth = new Uint8Array(grid.cellCount);
  const aridBiomeClasses = new Uint8Array(5);
  const tierTwoHighlandChannelSourceCounts = new Uint32Array(3);
  let meaningfulIslandComponent: Uint8Array | undefined;
  let fjordComponentSizes: number[] | undefined;
  let oasisComponentSizes: number[] | undefined;
  let throneheartNavigableComponentSizes: number[] | undefined;
  let stonewakeIslandComponentSizes: number[] | undefined;

  const labelMaskComponents = (mask: Uint8Array): number[] => {
    componentId.fill(0);
    const sizes: number[] = [];
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (mask[start] !== 1 || componentId[start] !== 0) continue;
      const id = sizes.length + 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      componentId[start] = id;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || mask[neighbor] !== 1
            || componentId[neighbor] !== 0
          ) continue;
          componentId[neighbor] = id;
          queue[tail++] = neighbor;
        }
      }
      sizes.push(tail);
    }
    return sizes;
  };

  let frostmereFjordCellCount = 0;
  let mirefenMarshCellCount = 0;
  let mirefenWetlandComplexCellCount = 0;
  let mirefenDeltaEstuaryCellCount = 0;
  let mirefenBraidedChannelProxyEdgeCount = 0;
  let sunscarDryCellCount = 0;
  let sunscarAridDryCellCount = 0;
  let sunscarSeasonalChannelCellCount = 0;
  let sunscarOasisMarginCellCount = 0;
  let throneheartRegionCellCount = 0;
  let throneheartChannelCellCount = 0;
  let throneheartChannelSourceCount = 0;
  let throneheartNavigableCellCount = 0;
  let epoch = 0;

  const hasSunscarFreshwaterInfluence = (start: number): boolean => {
    epoch += 1;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visitEpoch[start] = epoch;
    visitDepth[start] = 0;
    while (head < tail) {
      const cell = queue[head++]!;
      const depth = visitDepth[cell]!;
      if (depth >= OASIS_FRESHWATER_INFLUENCE_MAXIMUM_DISTANCE) continue;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || input.regionId[neighbor] !== sunscarRegion
          || input.waterRegime[neighbor] === WATER_OCEAN
          || input.waterRegime[neighbor] === WATER_SEA
        ) continue;
        if (isFreshwaterRegime(
          input.waterRegime[neighbor]!,
          input.biomeId[neighbor]!,
        )) return true;
        const nextDepth = depth + 1;
        if (
          nextDepth >= OASIS_FRESHWATER_INFLUENCE_MAXIMUM_DISTANCE
          || input.waterRegime[neighbor] !== WATER_DRY
          || visitEpoch[neighbor] === epoch
        ) continue;
        visitEpoch[neighbor] = epoch;
        visitDepth[neighbor] = nextDepth;
        queue[tail++] = neighbor;
      }
    }
    return false;
  };

  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const region = input.regionId[cell]!;
      const regime = input.waterRegime[cell]!;
      const channel = isChannelRegime(regime);

      if (
        region === frostmereRegion
        && input.geomorphologyCoastalClass[cell]
          === GREATER_REALM_COASTAL_CLASS.glacialFjord
      ) {
        fjordMask[cell] = 1;
        frostmereFjordCellCount += 1;
      }

      if (region === mirefenRegion) {
        const explicitDryRiverDelta = regime === WATER_DRY
          && input.biomeId[cell] === GREATER_REALM_BIOME_ID.RIVER_DELTA;
        if (regime === WATER_MARSH) {
          mirefenMarshCellCount += 1;
          mirefenWetlandComplexCellCount += 1;
        } else if (explicitDryRiverDelta) {
          mirefenWetlandComplexCellCount += 1;
        }
        if (
          input.geomorphologyCoastalClass[cell]
            === GREATER_REALM_COASTAL_CLASS.deltaEstuary
        ) mirefenDeltaEstuaryCellCount += 1;
        if (
          (channel || explicitDryRiverDelta)
          && input.slope[cell]! <= 1_200
        ) {
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            const neighborChannel = neighbor >= 0
              && isChannelRegime(input.waterRegime[neighbor]!);
            const neighborExplicitDryRiverDelta = neighbor >= 0
              && input.waterRegime[neighbor] === WATER_DRY
              && input.biomeId[neighbor] === GREATER_REALM_BIOME_ID.RIVER_DELTA;
            if (
              neighbor <= cell
              || input.regionId[neighbor] !== mirefenRegion
              || input.slope[neighbor]! > 1_200
              || !(
                (channel && neighborChannel)
                || (channel && neighborExplicitDryRiverDelta)
                || (explicitDryRiverDelta && neighborChannel)
              )
              || input.flowReceiver[cell] === neighbor
              || input.flowReceiver[neighbor] === cell
            ) continue;
            mirefenBraidedChannelProxyEdgeCount += 1;
          }
        }
      }

      if (region === sunscarRegion && regime === WATER_DRY) {
        sunscarDryCellCount += 1;
        const aridClass = aridBiomeClass(input.biomeId[cell]!);
        if (aridClass >= 0) {
          sunscarAridDryCellCount += 1;
          aridBiomeClasses[aridClass] = 1;
          if (hasSunscarFreshwaterInfluence(cell)) {
            oasisMarginMask[cell] = 1;
            sunscarOasisMarginCellCount += 1;
          }
        }
        if (input.flowAccumulation[cell]! >= 8n) {
          sunscarSeasonalChannelCellCount += 1;
        }
      }

      if (
        region === stonewakeRegion
        && input.elevation[cell]! > seaLevel
      ) stonewakeIslandMask[cell] = 1;

      if (
        region >= FIRST_TIER_II_REGION
        && region <= LAST_TIER_II_REGION
        && channel
        && input.elevation[cell]! >= seaLevel + 4_500
        && input.flowReceiver[cell]! >= 0
      ) {
        let hasUpstreamChannel = false;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && isChannelRegime(input.waterRegime[neighbor]!)
            && input.flowReceiver[neighbor] === cell
          ) {
            hasUpstreamChannel = true;
            break;
          }
        }
        if (!hasUpstreamChannel) {
          tierTwoHighlandChannelSourceCounts[
            region - FIRST_TIER_II_REGION
          ] += 1;
        }
      }

      if (region === THRONEHEART_REGION) {
        throneheartRegionCellCount += 1;
        if (channel) {
          throneheartChannelCellCount += 1;
          let hasUpstreamChannel = false;
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            if (
              neighbor >= 0
              && isChannelRegime(input.waterRegime[neighbor]!)
              && input.flowReceiver[neighbor] === cell
            ) {
              hasUpstreamChannel = true;
              break;
            }
          }
          if (!hasUpstreamChannel) throneheartChannelSourceCount += 1;
        }
        if (regime === WATER_DRY || channel) {
          throneheartNavigableMask[cell] = 1;
          throneheartNavigableCellCount += 1;
        }
      }
    }

    fjordComponentSizes = labelMaskComponents(fjordMask);
    const frostmereFjordSystemCount = fjordComponentSizes.reduce(
      (count, size) => count + (size >= 2 ? 1 : 0),
      0,
    );

    oasisComponentSizes = labelMaskComponents(oasisMarginMask);
    const sunscarOasisSystemCount = oasisComponentSizes.length;

    throneheartNavigableComponentSizes = labelMaskComponents(
      throneheartNavigableMask,
    );
    const throneheartLargestNavigableComponentCellCount =
      throneheartNavigableComponentSizes.reduce(
        (largest, size) => Math.max(largest, size),
        0,
      );

    stonewakeIslandComponentSizes = labelMaskComponents(stonewakeIslandMask);
    meaningfulIslandComponent = new Uint8Array(
      stonewakeIslandComponentSizes.length + 1,
    );
    let stonewakeMeaningfulIslandCount = 0;
    for (
      let offset = 0;
      offset < stonewakeIslandComponentSizes.length;
      offset += 1
    ) {
      if (
        stonewakeIslandComponentSizes[offset]!
          < MEANINGFUL_ISLAND_MINIMUM_CELLS
      ) continue;
      meaningfulIslandComponent[offset + 1] = 1;
      stonewakeMeaningfulIslandCount += 1;
    }

    let stonewakeNarrowIslandStraitCellCount = 0;
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (
        input.regionId[start] !== stonewakeRegion
        || (
          input.waterRegime[start] !== WATER_OCEAN
          && input.waterRegime[start] !== WATER_SEA
        )
      ) continue;
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
        if (depth >= NARROW_STRAIT_MAXIMUM_DISTANCE) continue;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || input.regionId[neighbor] !== stonewakeRegion
          ) continue;
          const island = componentId[neighbor]!;
          if (island > 0 && meaningfulIslandComponent[island] === 1) {
            // Land is an endpoint, never part of the traversal. Counting a
            // strait therefore proves that both islands are reachable through
            // saltwater alone, rather than via a shortcut across either land
            // component.
            if (firstIsland === 0) firstIsland = island;
            else if (island !== firstIsland) secondIsland = island;
            continue;
          }
          if (
            visitEpoch[neighbor] === epoch
            || (
              input.waterRegime[neighbor] !== WATER_OCEAN
              && input.waterRegime[neighbor] !== WATER_SEA
            )
          ) continue;
          visitEpoch[neighbor] = epoch;
          visitDepth[neighbor] = depth + 1;
          queue[tail++] = neighbor;
        }
      }
      if (secondIsland !== 0) stonewakeNarrowIslandStraitCellCount += 1;
    }

    const sunscarAridBiomeClassCount = aridBiomeClasses.reduce(
      (count, present) => count + present,
      0,
    );
    const sunscarAridDryLandBasisPoints = basisPoints(
      sunscarAridDryCellCount,
      sunscarDryCellCount,
    );
    const tierTwoCounts = Object.freeze(
      Array.from(tierTwoHighlandChannelSourceCounts),
    );
    const tierTwoMinimumHighlandChannelSourceCount = Math.min(
      ...tierTwoCounts,
    );
    const throneheartChannelDensityBasisPoints = basisPoints(
      throneheartChannelCellCount,
      throneheartRegionCellCount,
    );
    const throneheartLargestNavigableComponentBasisPoints = basisPoints(
      throneheartLargestNavigableComponentCellCount,
      throneheartNavigableCellCount,
    );

    const frostmereProof =
      frostmereFjordCellCount >= policy.frostmereMinimumFjordCells
      && frostmereFjordSystemCount >= policy.frostmereMinimumFjordSystems;
    const mirefenProof =
      mirefenMarshCellCount > 0
      && mirefenWetlandComplexCellCount
        >= policy.mirefenMinimumWetlandComplexCells
      && mirefenDeltaEstuaryCellCount >= policy.mirefenMinimumDeltaEstuaryCells
      && mirefenBraidedChannelProxyEdgeCount
        >= policy.mirefenMinimumBraidedChannelProxyEdges;
    const sunscarProof =
      sunscarAridDryLandBasisPoints
        >= policy.sunscarMinimumAridDryLandBasisPoints
      && sunscarAridBiomeClassCount >= policy.sunscarMinimumAridBiomeClasses
      && sunscarSeasonalChannelCellCount
        >= policy.sunscarMinimumSeasonalChannelCells
      && sunscarOasisMarginCellCount >= policy.sunscarMinimumOasisMarginCells
      && sunscarOasisSystemCount >= policy.sunscarMinimumOasisSystems;
    const stonewakeProof =
      stonewakeMeaningfulIslandCount >= policy.stonewakeMinimumMeaningfulIslands
      && stonewakeNarrowIslandStraitCellCount
        >= policy.stonewakeMinimumNarrowIslandStraitCells;
    const tierTwoProof = tierTwoMinimumHighlandChannelSourceCount
      >= policy.tierTwoMinimumHighlandChannelSources;
    const throneheartProof =
      throneheartChannelDensityBasisPoints
        >= policy.throneheartMinimumChannelDensityBasisPoints
      && throneheartChannelDensityBasisPoints
        <= policy.throneheartMaximumChannelDensityBasisPoints
      && throneheartChannelSourceCount >= policy.throneheartMinimumChannelSources
      && throneheartLargestNavigableComponentBasisPoints
        >= policy.throneheartMinimumLargestNavigableComponentBasisPoints;

    return Object.freeze({
      frostmere: Object.freeze({
        fjordCellCount: frostmereFjordCellCount,
        fjordSystemCount: frostmereFjordSystemCount,
        proof: frostmereProof,
      }),
      mirefen: Object.freeze({
        marshCellCount: mirefenMarshCellCount,
        wetlandComplexCellCount: mirefenWetlandComplexCellCount,
        deltaEstuaryCellCount: mirefenDeltaEstuaryCellCount,
        braidedChannelProxyEdgeCount:
          mirefenBraidedChannelProxyEdgeCount,
        proof: mirefenProof,
      }),
      sunscar: Object.freeze({
        dryCellCount: sunscarDryCellCount,
        aridDryCellCount: sunscarAridDryCellCount,
        aridDryLandBasisPoints: sunscarAridDryLandBasisPoints,
        aridBiomeClassCount: sunscarAridBiomeClassCount,
        seasonalChannelCellCount: sunscarSeasonalChannelCellCount,
        oasisMarginCellCount: sunscarOasisMarginCellCount,
        oasisSystemCount: sunscarOasisSystemCount,
        proof: sunscarProof,
      }),
      stonewake: Object.freeze({
        meaningfulIslandCount: stonewakeMeaningfulIslandCount,
        narrowIslandStraitCellCount: stonewakeNarrowIslandStraitCellCount,
        proof: stonewakeProof,
      }),
      tierII: Object.freeze({
        highlandChannelSourceCounts: tierTwoCounts,
        minimumHighlandChannelSourceCount:
          tierTwoMinimumHighlandChannelSourceCount,
        proof: tierTwoProof,
      }),
      throneheart: Object.freeze({
        regionCellCount: throneheartRegionCellCount,
        channelCellCount: throneheartChannelCellCount,
        channelDensityBasisPoints: throneheartChannelDensityBasisPoints,
        channelSourceCount: throneheartChannelSourceCount,
        navigableCellCount: throneheartNavigableCellCount,
        largestNavigableComponentCellCount:
          throneheartLargestNavigableComponentCellCount,
        largestNavigableComponentBasisPoints:
          throneheartLargestNavigableComponentBasisPoints,
        proof: throneheartProof,
      }),
      proof: frostmereProof
        && mirefenProof
        && sunscarProof
        && stonewakeProof
        && tierTwoProof
        && throneheartProof,
    });
  } finally {
    fjordMask.fill(0);
    oasisMarginMask.fill(0);
    stonewakeIslandMask.fill(0);
    throneheartNavigableMask.fill(0);
    componentId.fill(0);
    queue.fill(0);
    visitEpoch.fill(0);
    visitDepth.fill(0);
    aridBiomeClasses.fill(0);
    tierTwoHighlandChannelSourceCounts.fill(0);
    meaningfulIslandComponent?.fill(0);
    fjordComponentSizes?.fill(0);
    oasisComponentSizes?.fill(0);
    throneheartNavigableComponentSizes?.fill(0);
    stonewakeIslandComponentSizes?.fill(0);
  }
}

export function deriveGreaterRealmTierOneSemanticRegionsFromFinalGeometry(
  input: GreaterRealmTopographicQaInput,
): readonly number[] {
  assertInputArrays(input);
  validateGrid(input.grid);
  validateClassificationFields(input);
  const seaLevel = input.seaLevel ?? 0;
  const signatures: GreaterRealmTierOneRegionalSignature[] = [];
  for (let region = 1; region <= 5; region += 1) {
    const metrics = measureRegionalHydrogeomorphology(
      input,
      seaLevel,
      Object.freeze([0, region, region, region, region, region]),
    );
    signatures.push(Object.freeze({
      region,
      frostmere: metrics.frostmere,
      sunscar: metrics.sunscar,
      mirefen: metrics.mirefen,
      stonewake: metrics.stonewake,
    }));
  }
  return assignGreaterRealmTierOneSemanticRegionsBySignature(signatures);
}

function frozenShares(counts: readonly number[], total: number): readonly number[] {
  return Object.freeze(counts.map(count => basisPoints(count, total)));
}

/**
 * Measure aggregate, coordinate-free topographic evidence.
 *
 * The detailed report remains private and is replayed during private package
 * revalidation. Runtime/schema authority and sanitized public report details
 * remain intentionally absent until a separately reviewed contract adopts
 * them.
 */
export function measureGreaterRealmTopographicQa(
  input: GreaterRealmTopographicQaInput,
): GreaterRealmTopographicQaReport {
  assertInputArrays(input);
  validateGrid(input.grid);
  validateClassificationFields(input);
  validateConnectedLabels(
    input.grid,
    input.ridgeId,
    true,
    false,
    'GREATER_REALM_TOPOGRAPHIC_QA_RIDGE_LABEL_DISCONNECTED',
  );
  validateConnectedLabels(
    input.grid,
    input.watershedId,
    false,
    true,
    'GREATER_REALM_TOPOGRAPHIC_QA_WATERSHED_LABEL_DISCONNECTED',
  );
  const topologicalOrder = validateFlowAndBuildOrder(input);
  const seaLevel = input.seaLevel ?? 0;

  const elevationBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.elevation;
  const slopeBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.slope;
  const erosionBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.erosion;
  const sedimentBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.sediment;
  const roughnessBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.roughness;
  const curvatureBins = GREATER_REALM_TOPOGRAPHIC_QA_FIXED_BINS.curvature;

  const elevationHistogram = new Float64Array(elevationBins.count);
  const landElevationHistogram = new Float64Array(elevationBins.count);
  const slopeHistogram = new Float64Array(slopeBins.count);
  const erosionHistogram = new Float64Array(erosionBins.count);
  const sedimentHistogram = new Float64Array(sedimentBins.count);
  const roughnessHistogram = new Float64Array(roughnessBins.count);
  const profileCurvatureHistogram = new Float64Array(curvatureBins.count);
  const planCurvatureHistogram = new Float64Array(curvatureBins.count);
  const landformCounts = new Float64Array(GREATER_REALM_LANDFORM_CLASS_COUNT);
  const aspectCounts = new Float64Array(NEIGHBOR_COUNT + 1);
  const axisEdgeCounts = new Float64Array(3);
  const axisEdgeDeltaSums: bigint[] = [0n, 0n, 0n];
  const ridgeMask = new Uint8Array(input.grid.cellCount);
  const mountainMask = new Uint8Array(input.grid.cellCount);
  const plateauMask = new Uint8Array(input.grid.cellCount);
  const basinMask = new Uint8Array(input.grid.cellCount);
  const coastMask = new Uint8Array(input.grid.cellCount);
  const channelMask = new Uint8Array(input.grid.cellCount);
  const channelUpstreamCount = new Uint8Array(input.grid.cellCount);
  const flowOrder = new Uint8Array(input.grid.cellCount);
  const maximumUpstreamOrder = new Uint8Array(input.grid.cellCount);
  const maximumUpstreamOrderCount = new Uint8Array(input.grid.cellCount);
  const strahlerCounts = new Float64Array(STRAHLER_ORDER_BIN_COUNT);
  const watershedCounts = new Map<number, number>();
  const watershedSizes: number[] = [];
  const biomeCounts = new Float64Array(GREATER_REALM_BIOME_CLASS_COUNT);
  const biomeMinimum = new Int32Array(GREATER_REALM_BIOME_CLASS_COUNT);
  const biomeMaximum = new Int32Array(GREATER_REALM_BIOME_CLASS_COUNT);
  const biomeElevationSums = new BigInt64Array(GREATER_REALM_BIOME_CLASS_COUNT);
  biomeMinimum.fill(INT32_MAX);
  biomeMaximum.fill(INT32_MIN);

  let landElevations: Int32Array | undefined;
  let landSlopes: Uint16Array | undefined;
  let landCellCount = 0;
  let elevationUnderflowCount = 0;
  let elevationOverflowCount = 0;
  let landElevationUnderflowCount = 0;
  let landElevationOverflowCount = 0;
  let slopeUnderflowCount = 0;
  let slopeOverflowCount = 0;
  let erosionUnderflowCount = 0;
  let erosionOverflowCount = 0;
  let sedimentUnderflowCount = 0;
  let sedimentOverflowCount = 0;
  let roughnessUnderflowCount = 0;
  let roughnessOverflowCount = 0;
  let profileCurvatureUnderflowCount = 0;
  let profileCurvatureOverflowCount = 0;
  let planCurvatureUnderflowCount = 0;
  let planCurvatureOverflowCount = 0;
  let minimumElevation = INT32_MAX;
  let maximumElevation = INT32_MIN;
  let erodedCellCount = 0;
  let totalErodedUnits = 0n;
  let maximumErodedUnits = 0;
  let nonSedimentaryGainCellCount = 0;
  let totalNonSedimentaryGainUnits = 0n;
  let depositedCellCount = 0;
  let totalDepositedUnits = 0n;
  let maximumDepositedUnits = 0;
  let coastalLandCellCount = 0;
  const coastalSlopeCounts = [0, 0, 0, 0];
  let waterRegimeMismatchCount = 0;
  let waterClassificationExemptionCellCount = 0;
  let coldHighBiomeBelowHighlandCount = 0;
  let lowlandBiomeAboveAlpineCount = 0;
  let marshCellCount = 0;
  let lowGradientMarshCellCount = 0;
  let highGradientMarshCellCount = 0;
  let marshClassificationMismatchCount = 0;
  let inconsistentCellCount = 0;
  let edgeCount = 0;
  let flatEdgeCount = 0;
  let roughEdgeCount = 0;
  let totalAbsoluteEdgeDelta = 0n;
  let maximumAbsoluteEdgeDelta = 0;
  let channelCellCount = 0;
  let channelEdgeCount = 0;
  let channelSourceCellCount = 0;
  let outletCount = 0;
  let maximumStrahlerOrder = 0;
  let maximumFlowAccumulation = 0n;

  try {
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const elevation = input.elevation[cell]!;
      const regime = input.waterRegime[cell]!;
      const isLand = regime === WATER_DRY;
      if (isLand) landCellCount += 1;
      minimumElevation = Math.min(minimumElevation, elevation);
      maximumElevation = Math.max(maximumElevation, elevation);
      const elevationBinResult = addHistogramValue(
        elevationHistogram,
        elevationBins.minimumInclusive,
        elevationBins.width,
        elevation,
      );
      if (elevationBinResult < 0) elevationUnderflowCount += 1;
      if (elevationBinResult > 0) elevationOverflowCount += 1;
      if (isLand) {
        const landElevationBinResult = addHistogramValue(
          landElevationHistogram,
          elevationBins.minimumInclusive,
          elevationBins.width,
          elevation,
        );
        if (landElevationBinResult < 0) landElevationUnderflowCount += 1;
        if (landElevationBinResult > 0) landElevationOverflowCount += 1;
        const slopeBinResult = addHistogramValue(
          slopeHistogram,
          slopeBins.minimumInclusive,
          slopeBins.width,
          input.slope[cell]!,
        );
        if (slopeBinResult < 0) slopeUnderflowCount += 1;
        if (slopeBinResult > 0) slopeOverflowCount += 1;
      }

      landformCounts[input.landformId[cell]!] += 1;
      aspectCounts[input.aspect[cell]!] += 1;
      watershedCounts.set(
        input.watershedId[cell]!,
        (watershedCounts.get(input.watershedId[cell]!) ?? 0) + 1,
      );
      maximumFlowAccumulation = input.flowAccumulation[cell]!
        > maximumFlowAccumulation
        ? input.flowAccumulation[cell]!
        : maximumFlowAccumulation;

      const ridge = input.ridgeId[cell]! > 0;
      if (ridge) ridgeMask[cell] = 1;
      if (
        isLand
        && (
          ridge
          || input.landformId[cell] === GREATER_REALM_LANDFORM_ID.MOUNTAIN
        )
      ) mountainMask[cell] = 1;
      if (
        isLand
        && input.slope[cell]! <= 550
        && elevation >= seaLevel + 4_000
      ) plateauMask[cell] = 1;
      if (
        input.landformId[cell] === GREATER_REALM_LANDFORM_ID.BASIN
        || input.landformId[cell] === GREATER_REALM_LANDFORM_ID.LAKE_BASIN
      ) basinMask[cell] = 1;
      if (regime === WATER_RIVER || regime === WATER_STREAM) {
        channelMask[cell] = 1;
        channelCellCount += 1;
      }

      if (isLand) {
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = input.grid.neighbors[
            cell * NEIGHBOR_COUNT + direction
          ]!;
          if (
            neighbor >= 0
            && (
              input.waterRegime[neighbor] === WATER_OCEAN
              || input.waterRegime[neighbor] === WATER_SEA
            )
          ) {
            coastMask[cell] = 1;
            break;
          }
        }
      }

      // The deployed Lowlands surface is immutable input authority rather than
      // output of this generator's fluvial pass. Keep it in world relief and
      // biome totals, but never misreport its reconciliation as erosion/gain.
      const processGenerated = input.legacyProtectedCell?.[cell] !== 1;
      const surfaceWithoutSediment = elevation - input.sedimentDepth[cell]!;
      const erosion = processGenerated
        ? Math.max(0, input.preErosionElevation[cell]! - surfaceWithoutSediment)
        : 0;
      const nonSedimentaryGain = processGenerated
        ? Math.max(0, surfaceWithoutSediment - input.preErosionElevation[cell]!)
        : 0;
      if (erosion > 0) {
        erodedCellCount += 1;
        totalErodedUnits += BigInt(erosion);
        maximumErodedUnits = Math.max(maximumErodedUnits, erosion);
      }
      if (nonSedimentaryGain > 0) {
        nonSedimentaryGainCellCount += 1;
        totalNonSedimentaryGainUnits += BigInt(nonSedimentaryGain);
      }
      const erosionBinResult = addHistogramValue(
        erosionHistogram,
        erosionBins.minimumInclusive,
        erosionBins.width,
        erosion,
      );
      if (erosionBinResult < 0) erosionUnderflowCount += 1;
      if (erosionBinResult > 0) erosionOverflowCount += 1;

      const sediment = processGenerated ? input.sedimentDepth[cell]! : 0;
      if (sediment > 0) {
        depositedCellCount += 1;
        totalDepositedUnits += BigInt(sediment);
        maximumDepositedUnits = Math.max(maximumDepositedUnits, sediment);
      }
      const sedimentBinResult = addHistogramValue(
        sedimentHistogram,
        sedimentBins.minimumInclusive,
        sedimentBins.width,
        sediment,
      );
      if (sedimentBinResult < 0) sedimentUnderflowCount += 1;
      if (sedimentBinResult > 0) sedimentOverflowCount += 1;

      const profileMagnitude = Math.abs(input.profileCurvature[cell]!);
      const profileResult = addHistogramValue(
        profileCurvatureHistogram,
        curvatureBins.minimumInclusive,
        curvatureBins.width,
        profileMagnitude,
      );
      if (profileResult < 0) profileCurvatureUnderflowCount += 1;
      if (profileResult > 0) profileCurvatureOverflowCount += 1;
      const planMagnitude = Math.abs(input.planCurvature[cell]!);
      const planResult = addHistogramValue(
        planCurvatureHistogram,
        curvatureBins.minimumInclusive,
        curvatureBins.width,
        planMagnitude,
      );
      if (planResult < 0) planCurvatureUnderflowCount += 1;
      if (planResult > 0) planCurvatureOverflowCount += 1;

      const biome = input.biomeId[cell]!;
      biomeCounts[biome] += 1;
      biomeMinimum[biome] = Math.min(biomeMinimum[biome]!, elevation);
      biomeMaximum[biome] = Math.max(biomeMaximum[biome]!, elevation);
      biomeElevationSums[biome] += BigInt(elevation);
      let inconsistent = false;
      const expectedWaterBiome =
        regime === WATER_OCEAN || regime === WATER_SEA
          ? GREATER_REALM_BIOME_ID.SALTWATER
          : regime === WATER_LAKE
            ? GREATER_REALM_BIOME_ID.LAKE
            : regime === WATER_RIVER || regime === WATER_STREAM
              ? GREATER_REALM_BIOME_ID.RIVER_STREAM
              : -1;
      const validMarshBiome =
        biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
        || biome === GREATER_REALM_BIOME_ID.SALT_MARSH;
      const isWaterBiome =
        biome === GREATER_REALM_BIOME_ID.SALTWATER
        || biome === GREATER_REALM_BIOME_ID.LAKE
        || biome === GREATER_REALM_BIOME_ID.RIVER_STREAM
        || validMarshBiome;
      const waterClassificationExempt =
        input.waterClassificationExemptionMask?.[cell] === 1;
      if (waterClassificationExempt) waterClassificationExemptionCellCount += 1;
      if (
        !waterClassificationExempt
        && (
          (expectedWaterBiome >= 0 && biome !== expectedWaterBiome)
          || (
            regime === WATER_MARSH
            && !validMarshBiome
          )
          || (
            regime === WATER_DRY
            && isWaterBiome
          )
        )
      ) {
        waterRegimeMismatchCount += 1;
        inconsistent = true;
      }
      if (regime === WATER_MARSH) {
        marshCellCount += 1;
        if (input.slope[cell]! <= LOW_GRADIENT_MARSH_MAXIMUM_SLOPE) {
          lowGradientMarshCellCount += 1;
        } else {
          highGradientMarshCellCount += 1;
          inconsistent = true;
        }
        if (
          !validMarshBiome
          || input.landformId[cell] !== GREATER_REALM_LANDFORM_ID.BASIN
        ) {
          marshClassificationMismatchCount += 1;
          inconsistent = true;
        }
      }
      if (
        (
          biome === GREATER_REALM_BIOME_ID.ALPINE_SNOW
          || biome === GREATER_REALM_BIOME_ID.TUNDRA
        )
        && elevation < seaLevel + 4_000
      ) {
        coldHighBiomeBelowHighlandCount += 1;
        inconsistent = true;
      }
      const lowlandBiome =
        biome === GREATER_REALM_BIOME_ID.TEMPERATE_LOWLAND
        || biome === GREATER_REALM_BIOME_ID.FLOWER_MEADOW
        || biome === GREATER_REALM_BIOME_ID.OAK_FOREST
        || biome === GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST
        || biome === GREATER_REALM_BIOME_ID.SAVANNA
        || biome === GREATER_REALM_BIOME_ID.WARM_SCRUB
        || biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
        || biome === GREATER_REALM_BIOME_ID.SALT_MARSH
        || biome === GREATER_REALM_BIOME_ID.COASTAL;
      if (lowlandBiome && elevation > seaLevel + 13_500) {
        lowlandBiomeAboveAlpineCount += 1;
        inconsistent = true;
      }
      if (inconsistent) inconsistentCellCount += 1;

      for (let axis = 0; axis < 3; axis += 1) {
        const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + axis]!;
        if (neighbor < 0) continue;
        const delta = Math.abs(elevation - input.elevation[neighbor]!);
        axisEdgeCounts[axis] += 1;
        axisEdgeDeltaSums[axis] += BigInt(delta);
        edgeCount += 1;
        totalAbsoluteEdgeDelta += BigInt(delta);
        maximumAbsoluteEdgeDelta = Math.max(maximumAbsoluteEdgeDelta, delta);
        if (delta <= 64) flatEdgeCount += 1;
        if (delta >= 1_500) roughEdgeCount += 1;
        const roughnessResult = addHistogramValue(
          roughnessHistogram,
          roughnessBins.minimumInclusive,
          roughnessBins.width,
          delta,
        );
        if (roughnessResult < 0) roughnessUnderflowCount += 1;
        if (roughnessResult > 0) roughnessOverflowCount += 1;
      }
    }

    if (landCellCount === 0) {
      fail('GREATER_REALM_TOPOGRAPHIC_QA_LAND_MISSING');
    }
    landElevations = new Int32Array(landCellCount);
    landSlopes = new Uint16Array(landCellCount);
    let landOffset = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.waterRegime[cell] !== WATER_DRY) continue;
      landElevations[landOffset] = input.elevation[cell]!;
      landSlopes[landOffset] = input.slope[cell]!;
      landOffset += 1;
    }
    landElevations.sort();
    landSlopes.sort();

    const hypsometricMinimum = landElevations[0]!;
    const hypsometricMaximum = landElevations[landElevations.length - 1]!;
    const hypsometricRange = hypsometricMaximum - hypsometricMinimum;
    const hypsometricCurve = [] as Array<Readonly<{
      landAreaAboveBasisPoints: number;
      elevation: number;
      relativeElevationBasisPoints: number;
    }>>;
    let hypsometricRelativeSum = 0n;
    for (const elevation of landElevations) {
      hypsometricRelativeSum += BigInt(elevation - hypsometricMinimum);
    }
    for (let point = 0; point < HYPSOMETRIC_POINT_COUNT; point += 1) {
      const landAreaAboveBasisPoints = point * 500;
      const ascendingIndex = landElevations.length - 1 - Math.floor(
        ((landElevations.length - 1) * landAreaAboveBasisPoints) / 10_000,
      );
      const elevation = landElevations[ascendingIndex]!;
      hypsometricCurve.push(Object.freeze({
        landAreaAboveBasisPoints,
        elevation,
        relativeElevationBasisPoints:
          hypsometricRange === 0
            ? 0
            : Math.round(
                ((elevation - hypsometricMinimum) * 10_000)
                / hypsometricRange,
              ),
      }));
    }
    const hypsometricIntegralBasisPoints =
      hypsometricRange === 0
        ? 0
        : Number(
            (hypsometricRelativeSum * 10_000n)
            / (BigInt(landElevations.length) * BigInt(hypsometricRange)),
          );

    for (let offset = 0; offset < topologicalOrder.length; offset += 1) {
      const cell = topologicalOrder[offset]!;
      if (channelMask[cell] !== 1) continue;
      const maximumOrder = maximumUpstreamOrder[cell]!;
      const order = maximumOrder === 0
        ? 1
        : maximumUpstreamOrderCount[cell]! >= 2
          ? maximumOrder + 1
          : maximumOrder;
      if (order > STRAHLER_ORDER_BIN_COUNT) {
        fail('GREATER_REALM_TOPOGRAPHIC_QA_STRAHLER_ORDER_INVALID');
      }
      flowOrder[cell] = order;
      const receiver = input.flowReceiver[cell]!;
      if (receiver >= 0 && channelMask[receiver] === 1) {
        if (order > maximumUpstreamOrder[receiver]!) {
          maximumUpstreamOrder[receiver] = order;
          maximumUpstreamOrderCount[receiver] = 1;
        } else if (order === maximumUpstreamOrder[receiver]!) {
          maximumUpstreamOrderCount[receiver] += 1;
        }
        channelUpstreamCount[receiver] += 1;
      }
    }
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (channelMask[cell] !== 1) continue;
      const order = flowOrder[cell]!;
      strahlerCounts[order - 1] += 1;
      maximumStrahlerOrder = Math.max(maximumStrahlerOrder, order);
      if (channelUpstreamCount[cell] === 0) channelSourceCellCount += 1;
      const receiver = input.flowReceiver[cell]!;
      if (receiver < 0 || channelMask[receiver] !== 1) outletCount += 1;
      if (receiver >= 0 && channelMask[receiver] === 1) {
        channelEdgeCount += 1;
      }
    }

    for (const count of watershedCounts.values()) watershedSizes.push(count);
    const watershedSummary = summarizeSizes(
      watershedSizes,
      input.grid.cellCount,
    );
    const ridgeSummary = measureMaskComponents(input.grid, ridgeMask);
    const mountainSummary = measureMaskComponents(input.grid, mountainMask);
    const mountainGeometry = measureMountainGeometry(input.grid, mountainMask);
    const plateauSummary = measureMaskComponents(input.grid, plateauMask);
    const basinSummary = measureMaskComponents(input.grid, basinMask);

    let ridgeConnectedDegree = 0;
    let ridgeIsolatedCellCount = 0;
    let ridgeEndpointCellCount = 0;
    let ridgeJunctionCellCount = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (ridgeMask[cell] !== 1) continue;
      let degree = 0;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0 && ridgeMask[neighbor] === 1) degree += 1;
      }
      ridgeConnectedDegree += degree;
      if (degree === 0) ridgeIsolatedCellCount += 1;
      if (degree === 1) ridgeEndpointCellCount += 1;
      if (degree >= 3) ridgeJunctionCellCount += 1;
    }

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (coastMask[cell] !== 1) continue;
      coastalLandCellCount += 1;
      const slope = input.slope[cell]!;
      const slopeClass = slope < 400 ? 0 : slope < 900 ? 1 : slope < 1_500 ? 2 : 3;
      coastalSlopeCounts[slopeClass] += 1;
    }

    const biomeElevation = GREATER_REALM_BIOME_CATALOG.map(entry => {
      const count = biomeCounts[entry.id]!;
      return Object.freeze({
        id: entry.id,
        key: entry.key,
        count,
        minimumElevation: count === 0 ? 0 : biomeMinimum[entry.id]!,
        maximumElevation: count === 0 ? 0 : biomeMaximum[entry.id]!,
        meanElevation:
          count === 0
            ? 0
            : roundDivideBigInt(biomeElevationSums[entry.id]!, count),
      });
    });
    const landforms = GREATER_REALM_LANDFORM_CATALOG.map(entry => Object.freeze({
      id: entry.id,
      key: entry.key,
      count: landformCounts[entry.id]!,
      shareBasisPoints: basisPoints(
        landformCounts[entry.id]!,
        input.grid.cellCount,
      ),
    }));
    const axisMeanAbsoluteElevationDelta = Array.from(
      axisEdgeCounts,
      (count, axis) =>
        count === 0 ? 0 : roundDivideBigInt(axisEdgeDeltaSums[axis]!, count),
    );
    const maximumAxisMean = Math.max(...axisMeanAbsoluteElevationDelta);
    const minimumAxisMean = Math.min(...axisMeanAbsoluteElevationDelta);
    let maximumDirectionalAspect = 0;
    let minimumDirectionalAspect = Number.MAX_SAFE_INTEGER;
    let directionalAspectTotal = 0;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const count = aspectCounts[direction]!;
      maximumDirectionalAspect = Math.max(maximumDirectionalAspect, count);
      minimumDirectionalAspect = Math.min(minimumDirectionalAspect, count);
      directionalAspectTotal += count;
    }
    if (minimumDirectionalAspect === Number.MAX_SAFE_INTEGER) {
      minimumDirectionalAspect = 0;
    }
    let landSlopeSum = 0;
    for (const value of landSlopes) landSlopeSum += value;
    const regionalHydrogeomorphology = measureRegionalHydrogeomorphology(
      input,
      seaLevel,
    );

    return Object.freeze({
      version: GREATER_REALM_TOPOGRAPHIC_QA_VERSION,
      cellCount: input.grid.cellCount,
      landCellCount,
      waterCellCount: input.grid.cellCount - landCellCount,
      elevation: Object.freeze({
        minimum: minimumElevation,
        maximum: maximumElevation,
        allCellsHistogram: freezeHistogram(
          elevationBins.minimumInclusive,
          elevationBins.width,
          elevationHistogram,
          elevationUnderflowCount,
          elevationOverflowCount,
        ),
        landCellsHistogram: freezeHistogram(
          elevationBins.minimumInclusive,
          elevationBins.width,
          landElevationHistogram,
          landElevationUnderflowCount,
          landElevationOverflowCount,
        ),
        hypsometricIntegralBasisPoints,
        hypsometricCurve: Object.freeze(hypsometricCurve),
      }),
      slope: Object.freeze({
        histogram: freezeHistogram(
          slopeBins.minimumInclusive,
          slopeBins.width,
          slopeHistogram,
          slopeUnderflowCount,
          slopeOverflowCount,
        ),
        minimum: landSlopes[0]!,
        median: landSlopes[Math.floor((landSlopes.length - 1) * 0.5)]!,
        p95: landSlopes[Math.floor((landSlopes.length - 1) * 0.95)]!,
        maximum: landSlopes[landSlopes.length - 1]!,
        mean: Math.round(landSlopeSum / landSlopes.length),
      }),
      landforms: Object.freeze(landforms),
      ridges: Object.freeze({
        ...ridgeSummary,
        connectedEdgeCount: ridgeConnectedDegree / 2,
        isolatedCellCount: ridgeIsolatedCellCount,
        endpointCellCount: ridgeEndpointCellCount,
        junctionCellCount: ridgeJunctionCellCount,
        adjacencyContinuityBasisPoints: basisPoints(
          ridgeConnectedDegree,
          ridgeSummary.cellCount * NEIGHBOR_COUNT,
        ),
      }),
      watersheds: Object.freeze({
        watershedCount: watershedSummary.componentCount,
        smallestWatershedCells: watershedSummary.smallestComponentCells,
        medianWatershedCells: watershedSummary.medianComponentCells,
        p95WatershedCells: watershedSummary.p95ComponentCells,
        largestWatershedCells: watershedSummary.largestComponentCells,
        largestWatershedShareBasisPoints:
          watershedSummary.largestComponentShareBasisPoints,
        sizePowerOfTwoCounts: watershedSummary.sizePowerOfTwoCounts,
      }),
      rivers: Object.freeze({
        channelCellCount,
        channelEdgeCount,
        sourceCellCount: channelSourceCellCount,
        outletCount,
        drainageDensityBasisPoints: basisPoints(
          channelEdgeCount,
          landCellCount,
        ),
        maximumStrahlerOrder,
        strahlerOrderCellCounts: Object.freeze(Array.from(strahlerCounts)),
        maximumFlowAccumulation: maximumFlowAccumulation.toString(10),
      }),
      mountainChains: Object.freeze({
        ...mountainSummary,
        ...mountainGeometry,
      }),
      plateaus: plateauSummary,
      basins: basinSummary,
      coastalSlopes: Object.freeze({
        coastalLandCellCount,
        gentleCellCount: coastalSlopeCounts[0]!,
        moderateCellCount: coastalSlopeCounts[1]!,
        steepCellCount: coastalSlopeCounts[2]!,
        cliffCellCount: coastalSlopeCounts[3]!,
        classSharesBasisPoints: frozenShares(
          coastalSlopeCounts,
          coastalLandCellCount,
        ),
      }),
      erosion: Object.freeze({
        erodedCellCount,
        totalErodedUnits: totalErodedUnits.toString(10),
        meanErodedUnitsPerAffectedCell: roundDivideBigInt(
          totalErodedUnits,
          erodedCellCount,
        ),
        maximumErodedUnits,
        nonSedimentaryGainCellCount,
        totalNonSedimentaryGainUnits:
          totalNonSedimentaryGainUnits.toString(10),
        histogram: freezeHistogram(
          erosionBins.minimumInclusive,
          erosionBins.width,
          erosionHistogram,
          erosionUnderflowCount,
          erosionOverflowCount,
        ),
      }),
      sediment: Object.freeze({
        depositedCellCount,
        totalDepositedUnits: totalDepositedUnits.toString(10),
        meanDepositedUnitsPerAffectedCell: roundDivideBigInt(
          totalDepositedUnits,
          depositedCellCount,
        ),
        maximumDepositedUnits,
        histogram: freezeHistogram(
          sedimentBins.minimumInclusive,
          sedimentBins.width,
          sedimentHistogram,
          sedimentUnderflowCount,
          sedimentOverflowCount,
        ),
      }),
      biomeElevationConsistency: Object.freeze({
        biomeElevation: Object.freeze(biomeElevation),
        waterRegimeMismatchCount,
        waterClassificationExemptionCellCount,
        coldHighBiomeBelowHighlandCount,
        lowlandBiomeAboveAlpineCount,
        marshCellCount,
        lowGradientMarshCellCount,
        highGradientMarshCellCount,
        marshClassificationMismatchCount,
        inconsistentCellCount,
        consistentCellCount: input.grid.cellCount - inconsistentCellCount,
        consistentShareBasisPoints: basisPoints(
          input.grid.cellCount - inconsistentCellCount,
          input.grid.cellCount,
        ),
      }),
      axialArtifacts: Object.freeze({
        aspectCellCounts: Object.freeze(Array.from(aspectCounts)),
        directionalAspectAnisotropyBasisPoints:
          directionalAspectTotal === 0
            ? 0
            : basisPoints(
                maximumDirectionalAspect - minimumDirectionalAspect,
                directionalAspectTotal,
              ),
        axisEdgeCounts: Object.freeze(Array.from(axisEdgeCounts)),
        axisMeanAbsoluteElevationDelta: Object.freeze(
          axisMeanAbsoluteElevationDelta,
        ),
        edgeRoughnessAnisotropyBasisPoints:
          maximumAxisMean === 0
            ? 0
            : basisPoints(
                maximumAxisMean - minimumAxisMean,
                maximumAxisMean,
              ),
      }),
      roughness: Object.freeze({
        edgeCount,
        flatEdgeCount,
        roughEdgeCount,
        flatEdgeShareBasisPoints: basisPoints(flatEdgeCount, edgeCount),
        roughEdgeShareBasisPoints: basisPoints(roughEdgeCount, edgeCount),
        meanAbsoluteElevationDelta: roundDivideBigInt(
          totalAbsoluteEdgeDelta,
          edgeCount,
        ),
        maximumAbsoluteElevationDelta: maximumAbsoluteEdgeDelta,
        absoluteElevationDeltaHistogram: freezeHistogram(
          roughnessBins.minimumInclusive,
          roughnessBins.width,
          roughnessHistogram,
          roughnessUnderflowCount,
          roughnessOverflowCount,
        ),
        absoluteProfileCurvatureHistogram: freezeHistogram(
          curvatureBins.minimumInclusive,
          curvatureBins.width,
          profileCurvatureHistogram,
          profileCurvatureUnderflowCount,
          profileCurvatureOverflowCount,
        ),
        absolutePlanCurvatureHistogram: freezeHistogram(
          curvatureBins.minimumInclusive,
          curvatureBins.width,
          planCurvatureHistogram,
          planCurvatureUnderflowCount,
          planCurvatureOverflowCount,
        ),
      }),
      regionalHydrogeomorphology,
    });
  } finally {
    topologicalOrder.fill(0);
    elevationHistogram.fill(0);
    landElevationHistogram.fill(0);
    slopeHistogram.fill(0);
    erosionHistogram.fill(0);
    sedimentHistogram.fill(0);
    roughnessHistogram.fill(0);
    profileCurvatureHistogram.fill(0);
    planCurvatureHistogram.fill(0);
    landformCounts.fill(0);
    aspectCounts.fill(0);
    axisEdgeCounts.fill(0);
    axisEdgeDeltaSums.fill(0n);
    ridgeMask.fill(0);
    mountainMask.fill(0);
    plateauMask.fill(0);
    basinMask.fill(0);
    coastMask.fill(0);
    channelMask.fill(0);
    channelUpstreamCount.fill(0);
    flowOrder.fill(0);
    maximumUpstreamOrder.fill(0);
    maximumUpstreamOrderCount.fill(0);
    strahlerCounts.fill(0);
    watershedCounts.clear();
    watershedSizes.fill(0);
    biomeCounts.fill(0);
    biomeMinimum.fill(0);
    biomeMaximum.fill(0);
    biomeElevationSums.fill(0n);
    landElevations?.fill(0);
    landSlopes?.fill(0);
    coastalSlopeCounts.fill(0);
  }
}
