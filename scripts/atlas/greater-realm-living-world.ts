import {
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import type { IndexedAxialGrid } from './greater-realm-terrain';

/**
 * Private, offline-only surface-dressing authority.
 *
 * This module derives candidate potentials. It does not create runtime actors,
 * grant resources, persist state, alter SpacetimeDB schema, publish a map, or
 * claim that any particular art asset is licensed or deployed. A later,
 * separately reviewed renderer/authority PR may consume an approved export.
 *
 * The implementation intentionally uses only integer/fixed-point operations,
 * typed arrays, and a type-only grid import so it remains browser/server
 * neutral and reproducible without Node-specific APIs.
 */
export const GREATER_REALM_LIVING_WORLD_VERSION =
  'greater-realm-private-living-world-v1' as const;

export const GREATER_REALM_ECOLOGY_CLASS = Object.freeze({
  NONE: 0,
  PLAINS: 1,
  FOREST: 2,
  TAIGA: 3,
  JUNGLE: 4,
  SWAMP: 5,
  SAVANNA: 6,
  DESERT: 7,
  ALPINE: 8,
  SNOW: 9,
} as const);

export const GREATER_REALM_ROUTE_CLASS = Object.freeze({
  NONE: 0,
  TRACK: 1,
  ROAD: 2,
  CARRIAGEWAY: 3,
  /** Exact route crossing authority; valid only on river/stream regimes 3/4. */
  FORD: 4,
} as const);

export const GREATER_REALM_LANDMARK_CLASS = Object.freeze({
  NONE: 0,
  ABANDONED_RUIN: 1,
  RUINED_WALL: 2,
  WAYSTONE: 3,
  LAMP_POST: 4,
} as const);

export const GREATER_REALM_AMBIENT_LIFE_CLASS = Object.freeze({
  NONE: 0,
  RABBIT_HABITAT: 1,
  CIVILIAN_FOOTFALL: 2,
  GUARD_POST: 3,
  COURIER_ROUTE: 4,
  EXOTIC_COURIER_ROUTE: 5,
} as const);

export type GreaterRealmEcologyClass =
  typeof GREATER_REALM_ECOLOGY_CLASS[keyof typeof GREATER_REALM_ECOLOGY_CLASS];
export type GreaterRealmRouteClass =
  typeof GREATER_REALM_ROUTE_CLASS[keyof typeof GREATER_REALM_ROUTE_CLASS];
export type GreaterRealmLandmarkClass =
  typeof GREATER_REALM_LANDMARK_CLASS[keyof typeof GREATER_REALM_LANDMARK_CLASS];
export type GreaterRealmAmbientLifeClass =
  typeof GREATER_REALM_AMBIENT_LIFE_CLASS[keyof typeof GREATER_REALM_AMBIENT_LIFE_CLASS];

export type GreaterRealmLivingWorldSeed =
  Uint32Array | readonly [number, number, number, number];

export type GreaterRealmLivingWorldInput = Readonly<{
  grid: IndexedAxialGrid;
  seed: GreaterRealmLivingWorldSeed;
  waterRegime: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  elevation: Int32Array;
  slope: Uint16Array;
  moisture: Int32Array;
  temperature: Int32Array;
  wetnessIndex: Uint16Array;
  exposure: Int32Array;
  distanceToFreshwater: Uint16Array;
  distanceToCoast: Uint16Array;
  legacyProtectedCell: Uint8Array;
  castleSlot: Uint8Array;
  /** Broad suitability metadata, not a deployed or reserved resource node. */
  resourcePotential: Uint8Array;
  /** Broad suitability metadata, not a deployed or reserved core site. */
  corePotential: Uint8Array;
  throneAnchor: Uint8Array;
  barrier: Uint8Array;
  /** Private mask assembled from both cells of every mountain gate. */
  gateCell: Uint8Array;
  /** Private union of primary and alternate gate-approach paths. */
  gateApproachCell: Uint8Array;
}>;

export type GreaterRealmLivingWorldMetrics = Readonly<{
  cellCount: number;
  excludedCellCount: number;
  dressingEligibleCellCount: number;
  ecologyCellCounts: Readonly<{
    plains: number;
    forest: number;
    taiga: number;
    jungle: number;
    swamp: number;
    savanna: number;
    desert: number;
    alpine: number;
    snow: number;
  }>;
  vegetatedCellCount: number;
  vegetatedBasisPoints: number;
  vegetationPatchCount: number;
  minimumVegetationPatchSize: number;
  isolatedVegetationCellCount: number;
  smallVegetationPatchCellCount: number;
  routeCellCounts: Readonly<{
    track: number;
    road: number;
    carriageway: number;
    ford: number;
  }>;
  landmarkCellCounts: Readonly<{
    abandonedRuin: number;
    ruinedWall: number;
    waystone: number;
    lampPost: number;
  }>;
  ambientLifeCellCounts: Readonly<{
    rabbitHabitat: number;
    civilianFootfall: number;
    guardPost: number;
    courierRoute: number;
    exoticCourierRoute: number;
  }>;
  minimumLandmarkAnchorSpacing: number;
  eligibleLandVegetatedBasisPoints: number;
  eligibleLandOpenBasisPoints: number;
  requiredRouteAnchorCount: number;
  coveredRouteAnchorCount: number;
  uncoveredRouteAnchorCount: number;
  unreachableMandatorySiteCount: number;
  gateApproachComponentCount: number;
  supportedGateApproachComponentCount: number;
  unsupportedGateApproachComponentCount: number;
  routeComponentCount: number;
  anchorBearingRouteComponentCount: number;
  anchorlessRouteComponentCount: number;
  fordCellCount: number;
  forbiddenWaterRouteViolationCount: number;
  fordRegimeViolationCount: number;
  sealedGateRouteViolationCount: number;
  courierDisconnectedRouteViolationCount: number;
  rabbitDensityViolationCount: number;
  vegetationReservedClearanceViolationCount: number;
  vegetationLandmarkClearanceViolationCount: number;
  legacyPreservationViolationCount: number;
  waterExclusionViolationCount: number;
  reservedSiteExclusionViolationCount: number;
  ecologicalCompatibilityViolationCount: number;
  landmarkSpacingViolationCount: number;
  landmarkRouteAdjacencyViolationCount: number;
  orphanedRuinWallCount: number;
  ambientConstraintViolationCount: number;
  layoutFingerprint: string;
}>;

export type GreaterRealmLivingWorldInvariants = Readonly<{
  legacyProtectedCellsPreserved: boolean;
  waterExcluded: boolean;
  reservedSitesExcluded: boolean;
  ecologiesCompatible: boolean;
  vegetationNaturallyClustered: boolean;
  landmarksSpaced: boolean;
  landmarksRouteAdjacent: boolean;
  ruinWallsAnchored: boolean;
  ambientLifeCompatible: boolean;
  requiredRouteAnchorsCovered: boolean;
  mandatoryRouteAnchorsReachable: boolean;
  gateApproachesSupported: boolean;
  everyRouteComponentAnchorBearing: boolean;
  fordsPresentAndValid: boolean;
  sealedGateEndpointsClear: boolean;
  couriersUseConnectedRoutes: boolean;
  rabbitHabitatVegetated: boolean;
  vegetationClearancesPreserved: boolean;
}>;

export type GreaterRealmLivingWorldAuthority = Readonly<{
  version: typeof GREATER_REALM_LIVING_WORLD_VERSION;
  /** Union of all protected, strategic, and water exclusions. */
  dressingExcluded: Uint8Array;
  ecologyClass: Uint8Array;
  /** Fixed-point canopy/groundcover potential in the inclusive range 0..255. */
  vegetationDensity: Uint8Array;
  routeClass: Uint8Array;
  landmarkClass: Uint8Array;
  ambientLifeClass: Uint8Array;
  metrics: GreaterRealmLivingWorldMetrics;
  invariants: GreaterRealmLivingWorldInvariants;
}>;

const NEIGHBOR_COUNT = 6;
const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
const WATER_SEA = 5;
const UINT32_MAX = 0xffff_ffff;
const BASIS_POINTS = 10_000;
const MINIMUM_VEGETATION_PATCH_CELLS = 6;
const RUIN_SPACING = 12;
const WAYSTONE_SPACING = 6;
const LAMP_SPACING = 3;
const OPTIONAL_ROUTE_HUBS_PER_TIER_BIOME = 2;

const VEGETATION_CHANNEL = channelId('greater-realm-living-world-vegetation');
const VEGETATION_DETAIL_CHANNEL = channelId(
  'greater-realm-living-world-vegetation-detail',
);
const ROUTE_COST_CHANNEL = channelId('greater-realm-living-world-route-cost');
const LANDMARK_CHANNEL = channelId('greater-realm-living-world-landmark');
const WALL_CHANNEL = channelId('greater-realm-living-world-ruined-wall');
const AMBIENT_CHANNEL = channelId('greater-realm-living-world-ambient');

type SeedWords = readonly [number, number, number, number];

type LandmarkAnchor = {
  cell: number;
  landmarkClass: GreaterRealmLandmarkClass;
};

type LandmarkSpatialIndex = Map<string, LandmarkAnchor[]>;

type OptionalRouteHub = {
  site: number;
  terminal: number;
  priority: number;
};

type RouteBackboneEvidence = Readonly<{
  requiredRouteAnchorCount: number;
  coveredRouteAnchorCount: number;
  uncoveredRouteAnchorCount: number;
  unreachableMandatorySiteCount: number;
  gateApproachComponentCount: number;
  supportedGateApproachComponentCount: number;
  unsupportedGateApproachComponentCount: number;
  /** Private scratch evidence; zeroized before the public authority returns. */
  routeAnchorCell: Uint8Array;
}>;

type RouteConnectivityEvidence = Readonly<{
  routeComponentCount: number;
  anchorBearingRouteComponentCount: number;
  anchorlessRouteComponentCount: number;
  courierDisconnectedRouteViolationCount: number;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function assertSafeInteger(value: number, code: string): void {
  if (!Number.isSafeInteger(value)) fail(code);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundedDivide(numerator: number, denominator: number): number {
  assertSafeInteger(numerator, 'GREATER_REALM_LIVING_WORLD_INTEGER_OVERFLOW');
  assertSafeInteger(denominator, 'GREATER_REALM_LIVING_WORLD_INTEGER_DIVISION_INVALID');
  if (denominator <= 0) fail('GREATER_REALM_LIVING_WORLD_INTEGER_DIVISION_INVALID');
  const sign = numerator < 0 ? -1 : 1;
  const magnitude = Math.abs(numerator);
  const quotient = Math.floor(magnitude / denominator);
  const remainder = magnitude % denominator;
  return sign * (quotient + (remainder * 2 >= denominator ? 1 : 0));
}

function avalancheUint32(value: number): number {
  let mixed = value >>> 0;
  mixed ^= mixed >>> 16;
  mixed = Math.imul(mixed, 0x7feb_352d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x846c_a68b);
  mixed ^= mixed >>> 16;
  return mixed >>> 0;
}

function channelId(value: string): number {
  let hash = 0x811c_9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x0100_0193);
  }
  return avalancheUint32(hash);
}

function rotateLeftUint32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function randomU32(
  seed: SeedWords,
  channel: number,
  q: number,
  r: number,
  sampleIndex = 0,
): number {
  let first = (seed[0] ^ 0x6170_7865 ^ channel) >>> 0;
  let second = (seed[1] ^ 0x3320_646e ^ (q >>> 0)) >>> 0;
  let third = (seed[2] ^ 0x7962_2d32 ^ (r >>> 0)) >>> 0;
  let fourth = (seed[3] ^ 0x6b20_6574 ^ sampleIndex) >>> 0;
  const initialFirst = first;
  const initialSecond = second;
  const initialThird = third;
  const initialFourth = fourth;
  for (let round = 0; round < 8; round += 1) {
    first = (first + second) >>> 0;
    fourth = rotateLeftUint32(fourth ^ first, 16);
    third = (third + fourth) >>> 0;
    second = rotateLeftUint32(second ^ third, 12);
    first = (first + second) >>> 0;
    fourth = rotateLeftUint32(fourth ^ first, 8);
    third = (third + fourth) >>> 0;
    second = rotateLeftUint32(second ^ third, 7);
    first = (first ^ Math.imul(round + 1, 0x9e37_79b9)) >>> 0;
  }
  return avalancheUint32(
    ((first + initialFirst) >>> 0)
      ^ ((second + initialSecond) >>> 0)
      ^ ((third + initialThird) >>> 0)
      ^ ((fourth + initialFourth) >>> 0),
  );
}

function copyAndValidateSeed(seed: GreaterRealmLivingWorldSeed): Uint32Array {
  if (seed.length !== 4) fail('GREATER_REALM_LIVING_WORLD_SEED_INVALID');
  const result = new Uint32Array(4);
  for (let index = 0; index < 4; index += 1) {
    const word = seed[index]!;
    if (!Number.isSafeInteger(word) || word < 0 || word > UINT32_MAX) {
      result.fill(0);
      fail('GREATER_REALM_LIVING_WORLD_SEED_INVALID');
    }
    result[index] = word;
  }
  return result;
}

function assertInput(input: GreaterRealmLivingWorldInput): void {
  const { grid } = input;
  if (
    !Number.isSafeInteger(grid.cellCount)
    || grid.cellCount <= 0
    || grid.q.length !== grid.cellCount
    || grid.r.length !== grid.cellCount
    || grid.neighbors.length !== grid.cellCount * NEIGHBOR_COUNT
  ) fail('GREATER_REALM_LIVING_WORLD_GRID_INVALID');
  const fields: readonly ArrayLike<unknown>[] = [
    input.waterRegime,
    input.biomeId,
    input.landformId,
    input.elevation,
    input.slope,
    input.moisture,
    input.temperature,
    input.wetnessIndex,
    input.exposure,
    input.distanceToFreshwater,
    input.distanceToCoast,
    input.legacyProtectedCell,
    input.castleSlot,
    input.resourcePotential,
    input.corePotential,
    input.throneAnchor,
    input.barrier,
    input.gateCell,
    input.gateApproachCell,
  ];
  if (fields.some(field => field.length !== grid.cellCount)) {
    fail('GREATER_REALM_LIVING_WORLD_INPUT_LENGTH_INVALID');
  }
  for (let offset = 0; offset < grid.neighbors.length; offset += 1) {
    const neighbor = grid.neighbors[offset]!;
    if (neighbor < -1 || neighbor >= grid.cellCount) {
      fail('GREATER_REALM_LIVING_WORLD_GRID_INVALID');
    }
  }
}

function smoothedIntegerField(
  grid: IndexedAxialGrid,
  seed: SeedWords,
  channel: number,
  passes: number,
): Int32Array {
  let current: Int32Array<ArrayBufferLike> = new Int32Array(grid.cellCount);
  let next: Int32Array<ArrayBufferLike> | undefined;
  let completed = false;
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      current[cell] = (randomU32(seed, channel, grid.q[cell]!, grid.r[cell]!) >>> 16)
        - 0x8000;
    }
    for (let pass = 0; pass < passes; pass += 1) {
      next = new Int32Array(grid.cellCount);
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        let numerator = current[cell]! * 3;
        let denominator = 3;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          numerator += current[neighbor]!;
          denominator += 1;
        }
        next[cell] = roundedDivide(numerator, denominator);
      }
      current.fill(0);
      current = next;
      next = undefined;
    }
    completed = true;
    return current;
  } finally {
    if (!completed) current.fill(0);
    next?.fill(0);
  }
}

function isMaskSet(mask: Uint8Array, cell: number): boolean {
  return mask[cell] !== 0;
}

function isStrategicReserved(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  return isMaskSet(input.castleSlot, cell)
    || isMaskSet(input.throneAnchor, cell)
    || isMaskSet(input.barrier, cell)
    || isMaskSet(input.gateCell, cell)
    || isMaskSet(input.gateApproachCell, cell);
}

function hasAdjacentMask(
  grid: IndexedAxialGrid,
  cell: number,
  masks: readonly Uint8Array[],
): boolean {
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor < 0) continue;
    for (const mask of masks) {
      if (mask[neighbor] !== 0) return true;
    }
  }
  return false;
}

function classifyEcology(
  input: GreaterRealmLivingWorldInput,
  cell: number,
): GreaterRealmEcologyClass {
  const biome = input.biomeId[cell]!;
  const landform = input.landformId[cell]!;
  const temperature = input.temperature[cell]!;
  const moisture = input.moisture[cell]!;
  const elevation = input.elevation[cell]!;
  const wetness = input.wetnessIndex[cell]!;
  const slope = input.slope[cell]!;

  if (
    biome === GREATER_REALM_BIOME_ID.FRESHWATER_MARSH
    || biome === GREATER_REALM_BIOME_ID.SALT_MARSH
    || biome === GREATER_REALM_BIOME_ID.RIVER_DELTA
    || landform === GREATER_REALM_LANDFORM_ID.DELTA
    || (moisture > 4_300 && wetness > 4_500 && slope < 750)
  ) return GREATER_REALM_ECOLOGY_CLASS.SWAMP;
  if (
    biome === GREATER_REALM_BIOME_ID.ALPINE_SNOW
    || landform === GREATER_REALM_LANDFORM_ID.GLACIAL_VALLEY
    || (temperature < 500 && elevation > 8_000)
  ) return GREATER_REALM_ECOLOGY_CLASS.SNOW;
  if (
    biome === GREATER_REALM_BIOME_ID.TUNDRA
    || biome === GREATER_REALM_BIOME_ID.ROCKY_HIGHLAND
    || landform === GREATER_REALM_LANDFORM_ID.MOUNTAIN
    || elevation > 14_000
  ) return GREATER_REALM_ECOLOGY_CLASS.ALPINE;
  if (
    biome === GREATER_REALM_BIOME_ID.DUNE_DESERT
    || biome === GREATER_REALM_BIOME_ID.ROCKY_DESERT
    || biome === GREATER_REALM_BIOME_ID.RED_BADLANDS
    || landform === GREATER_REALM_LANDFORM_ID.BADLANDS
    || landform === GREATER_REALM_LANDFORM_ID.DUNE
    || moisture < -1_500
  ) return GREATER_REALM_ECOLOGY_CLASS.DESERT;
  if (
    biome === GREATER_REALM_BIOME_ID.SAVANNA
    || biome === GREATER_REALM_BIOME_ID.WARM_SCRUB
    || (temperature > 6_200 && moisture < 1_500)
  ) return GREATER_REALM_ECOLOGY_CLASS.SAVANNA;
  if (
    (
      biome === GREATER_REALM_BIOME_ID.FLOWER_MEADOW
      || biome === GREATER_REALM_BIOME_ID.OAK_FOREST
      || biome === GREATER_REALM_BIOME_ID.OLD_GROWTH_FOREST
    )
    && temperature > 6_300
    && moisture > 3_400
    && elevation < 10_500
  ) return GREATER_REALM_ECOLOGY_CLASS.JUNGLE;
  if (
    biome === GREATER_REALM_BIOME_ID.PINE_FOREST
    || ((
      biome === GREATER_REALM_BIOME_ID.FLOWER_MEADOW
      || biome === GREATER_REALM_BIOME_ID.OAK_FOREST
    ) && temperature < 3_200)
  ) return GREATER_REALM_ECOLOGY_CLASS.TAIGA;
  if (
    biome === GREATER_REALM_BIOME_ID.FLOWER_MEADOW
    || biome === GREATER_REALM_BIOME_ID.OAK_FOREST
    || moisture > 2_600
  ) {
    return GREATER_REALM_ECOLOGY_CLASS.FOREST;
  }
  return GREATER_REALM_ECOLOGY_CLASS.PLAINS;
}

function ecologyBaseDensity(ecology: GreaterRealmEcologyClass): number {
  switch (ecology) {
    case GREATER_REALM_ECOLOGY_CLASS.PLAINS: return 86;
    case GREATER_REALM_ECOLOGY_CLASS.FOREST: return 205;
    case GREATER_REALM_ECOLOGY_CLASS.TAIGA: return 176;
    case GREATER_REALM_ECOLOGY_CLASS.JUNGLE: return 232;
    case GREATER_REALM_ECOLOGY_CLASS.SWAMP: return 158;
    case GREATER_REALM_ECOLOGY_CLASS.SAVANNA: return 103;
    case GREATER_REALM_ECOLOGY_CLASS.DESERT: return 24;
    case GREATER_REALM_ECOLOGY_CLASS.ALPINE: return 39;
    case GREATER_REALM_ECOLOGY_CLASS.SNOW: return 10;
    default: return 0;
  }
}

function ecologyDensityCap(ecology: GreaterRealmEcologyClass): number {
  switch (ecology) {
    case GREATER_REALM_ECOLOGY_CLASS.PLAINS: return 158;
    case GREATER_REALM_ECOLOGY_CLASS.FOREST: return 245;
    case GREATER_REALM_ECOLOGY_CLASS.TAIGA: return 220;
    case GREATER_REALM_ECOLOGY_CLASS.JUNGLE: return 255;
    case GREATER_REALM_ECOLOGY_CLASS.SWAMP: return 210;
    case GREATER_REALM_ECOLOGY_CLASS.SAVANNA: return 142;
    case GREATER_REALM_ECOLOGY_CLASS.DESERT: return 46;
    case GREATER_REALM_ECOLOGY_CLASS.ALPINE: return 54;
    case GREATER_REALM_ECOLOGY_CLASS.SNOW: return 26;
    default: return 0;
  }
}

/**
 * Physical source-biome ceilings remain authoritative after broad ecology
 * classification. In particular, volcanic ground must not become a dense
 * forest merely because its moisture field resembles a temperate cell.
 */
function sourceBiomeDensityCap(biome: number): number {
  switch (biome) {
    case GREATER_REALM_BIOME_ID.VOLCANIC_UPLAND: return 48;
    case GREATER_REALM_BIOME_ID.ASH_MEADOW: return 112;
    default: return 255;
  }
}

function routeReservationClear(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  return input.legacyProtectedCell[cell] === 0 && !isStrategicReserved(input, cell);
}

function dryRouteEligible(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  return input.waterRegime[cell] === WATER_DRY && routeReservationClear(input, cell);
}

function routeTraversalCost(
  input: GreaterRealmLivingWorldInput,
  seed: SeedWords,
  cell: number,
): number {
  const regime = input.waterRegime[cell]!;
  const deterministicTieCost = randomU32(
    seed,
    ROUTE_COST_CHANNEL,
    input.grid.q[cell]!,
    input.grid.r[cell]!,
  ) % 97;
  if (regime === WATER_RIVER || regime === WATER_STREAM) {
    return 7_000 + deterministicTieCost;
  }
  return 900
    + Math.min(5_000, input.slope[cell]! * 2)
    + Math.min(1_200, Math.abs(input.exposure[cell]!))
    + Math.min(900, input.distanceToFreshwater[cell]! * 18)
    + deterministicTieCost;
}

function heapComesBefore(
  firstCost: number,
  firstCell: number,
  secondCost: number,
  secondCell: number,
): boolean {
  return firstCost < secondCost || (firstCost === secondCost && firstCell < secondCell);
}

function heapPush(
  heapCells: number[],
  heapCosts: number[],
  cell: number,
  cost: number,
): void {
  let index = heapCells.length;
  heapCells.push(cell);
  heapCosts.push(cost);
  while (index > 0) {
    const parent = Math.floor((index - 1) / 2);
    if (!heapComesBefore(
      cost,
      cell,
      heapCosts[parent]!,
      heapCells[parent]!,
    )) break;
    heapCells[index] = heapCells[parent]!;
    heapCosts[index] = heapCosts[parent]!;
    index = parent;
  }
  heapCells[index] = cell;
  heapCosts[index] = cost;
}

function heapPop(
  heapCells: number[],
  heapCosts: number[],
): readonly [number, number] | undefined {
  if (heapCells.length === 0) return undefined;
  const cell = heapCells[0]!;
  const cost = heapCosts[0]!;
  const lastCell = heapCells.pop()!;
  const lastCost = heapCosts.pop()!;
  if (heapCells.length > 0) {
    let index = 0;
    while (true) {
      const left = index * 2 + 1;
      if (left >= heapCells.length) break;
      const right = left + 1;
      let child = left;
      if (
        right < heapCells.length
        && heapComesBefore(
          heapCosts[right]!,
          heapCells[right]!,
          heapCosts[left]!,
          heapCells[left]!,
        )
      ) child = right;
      if (!heapComesBefore(
        heapCosts[child]!,
        heapCells[child]!,
        lastCost,
        lastCell,
      )) break;
      heapCells[index] = heapCells[child]!;
      heapCosts[index] = heapCosts[child]!;
      index = child;
    }
    heapCells[index] = lastCell;
    heapCosts[index] = lastCost;
  }
  return Object.freeze([cell, cost] as const);
}

function hasMandatoryRouteSite(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  return input.legacyProtectedCell[cell] === 0
    && (input.castleSlot[cell] !== 0 || input.throneAnchor[cell] !== 0);
}

function routeTouchesMajorAuthority(
  input: GreaterRealmLivingWorldInput,
  cell: number,
): boolean {
  return hasAdjacentMask(input.grid, cell, [
    input.castleSlot,
    input.throneAnchor,
    input.gateApproachCell,
  ]);
}

function bestLegalRouteNeighbor(
  input: GreaterRealmLivingWorldInput,
  seed: SeedWords,
  traversalCost: Uint32Array,
  source: number,
  sampleIndex: number,
): number {
  let selected = -1;
  let selectedCost = UINT32_MAX;
  let selectedPriority = UINT32_MAX;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[source * NEIGHBOR_COUNT + direction]!;
    if (neighbor < 0 || !routeEligible(input, neighbor)) continue;
    const cost = traversalCost[neighbor]!;
    const priority = randomU32(
      seed,
      ROUTE_COST_CHANNEL,
      input.grid.q[neighbor]!,
      input.grid.r[neighbor]!,
      sampleIndex,
    );
    if (
      cost < selectedCost
      || (cost === selectedCost && priority < selectedPriority)
      || (cost === selectedCost && priority === selectedPriority && neighbor < selected)
    ) {
      selected = neighbor;
      selectedCost = cost;
      selectedPriority = priority;
    }
  }
  return selected;
}

function markPredecessorPath(
  start: number,
  predecessor: Int32Array,
  backbone: Uint8Array,
): void {
  let cursor = start;
  let steps = 0;
  while (cursor >= 0 && backbone[cursor] === 0) {
    backbone[cursor] = 1;
    cursor = predecessor[cursor]!;
    steps += 1;
    if (steps > predecessor.length) fail('GREATER_REALM_LIVING_WORLD_ROUTE_CYCLE');
  }
  if (cursor < 0 && steps > 1) fail('GREATER_REALM_LIVING_WORLD_ROUTE_DISCONNECTED');
}

function oppositeDryFordPair(
  input: GreaterRealmLivingWorldInput,
  cell: number,
): readonly [number, number] | undefined {
  for (let direction = 0; direction < 3; direction += 1) {
    const first = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    const second = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction + 3]!;
    if (
      first >= 0
      && second >= 0
      && dryRouteEligible(input, first)
      && dryRouteEligible(input, second)
    ) return Object.freeze([first, second] as const);
  }
  return undefined;
}

function fordCellEligible(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  const regime = input.waterRegime[cell]!;
  return (regime === WATER_RIVER || regime === WATER_STREAM)
    && routeReservationClear(input, cell)
    && oppositeDryFordPair(input, cell) !== undefined;
}

function routeEligible(input: GreaterRealmLivingWorldInput, cell: number): boolean {
  return dryRouteEligible(input, cell) || fordCellEligible(input, cell);
}

function routeNeighborEligible(
  input: GreaterRealmLivingWorldInput,
  first: number,
  second: number,
): boolean {
  if (!routeEligible(input, first) || !routeEligible(input, second)) return false;
  // A ford is a one-cell bank-to-bank crossing, never a longitudinal water road.
  return !(
    input.waterRegime[first] !== WATER_DRY
    && input.waterRegime[second] !== WATER_DRY
  );
}

function deriveConnectedRouteBackbone(
  input: GreaterRealmLivingWorldInput,
  seed: SeedWords,
  routeClass: Uint8Array,
): RouteBackboneEvidence {
  const { grid } = input;
  const eligible = new Uint8Array(grid.cellCount);
  const eligibleComponent = new Int32Array(grid.cellCount);
  eligibleComponent.fill(-1);
  const approachComponent = new Int32Array(grid.cellCount);
  approachComponent.fill(-1);
  const approachTerminalByComponent = new Int32Array(grid.cellCount);
  approachTerminalByComponent.fill(-1);
  const queue = new Uint32Array(grid.cellCount);
  const predecessor = new Int32Array(grid.cellCount);
  predecessor.fill(-1);
  const distance = new Float64Array(grid.cellCount);
  const backbone = new Uint8Array(grid.cellCount);
  const terminalMask = new Uint8Array(grid.cellCount);
  const settledTerminal = new Uint8Array(grid.cellCount);
  const requiredAnchorSite = new Uint8Array(grid.cellCount);
  const mandatorySiteVisited = new Uint8Array(grid.cellCount);
  const mandatoryTerminalBySite = new Int32Array(grid.cellCount);
  mandatoryTerminalBySite.fill(-1);
  const traversalCost = new Uint32Array(grid.cellCount);
  const heapCells: number[] = [];
  const heapCosts: number[] = [];
  const components: number[][] = [];
  const terminalsByComponent: number[][] = [];
  const ordinaryDryRouteCells: number[] = [];
  const optionalHubBuckets: OptionalRouteHub[][] = Array.from(
    { length: 2 * 4 * 32 },
    () => [],
  );
  let requiredSiteAnchorCount = 0;
  let unreachableMandatorySiteCount = 0;
  let gateApproachComponentCount = 0;
  let returnedRouteAnchorCell: Uint8Array | undefined;
  let completed = false;
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (routeEligible(input, cell)) {
        eligible[cell] = 1;
        traversalCost[cell] = routeTraversalCost(input, seed, cell);
      }
    }

    for (let start = 0; start < grid.cellCount; start += 1) {
      if (eligible[start] !== 1 || eligibleComponent[start] >= 0) continue;
      const componentId = components.length;
      let head = 0;
      let tail = 0;
      const cells: number[] = [];
      // Register the mutable cell-index buffer before traversal so the outer
      // retirement path owns even a partially built component.
      components.push(cells);
      terminalsByComponent.push([]);
      queue[tail++] = start;
      eligibleComponent[start] = componentId;
      while (head < tail) {
        const cell = queue[head++]!;
        cells.push(cell);
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || eligible[neighbor] !== 1
            || eligibleComponent[neighbor] >= 0
            || !routeNeighborEligible(input, cell, neighbor)
          ) {
            continue;
          }
          eligibleComponent[neighbor] = componentId;
          queue[tail++] = neighbor;
        }
      }
    }

    const addTerminal = (cell: number) => {
      if (cell < 0 || terminalMask[cell] === 1) return;
      const component = eligibleComponent[cell]!;
      if (component < 0) return;
      terminalMask[cell] = 1;
      terminalsByComponent[component]!.push(cell);
    };

    // Resolve each reserved gate-approach component to one legal exterior
    // route terminal before mandatory sites are anchored. Approach cells are
    // authority-owned transitions rather than route surface: they remain
    // excluded, and a sealed component deliberately receives no terminal.
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (input.gateApproachCell[start] === 0 || approachComponent[start] >= 0) continue;
      const componentId = gateApproachComponentCount;
      gateApproachComponentCount += 1;
      let head = 0;
      let tail = 0;
      let selectedTerminal = -1;
      let selectedCost = UINT32_MAX;
      queue[tail++] = start;
      approachComponent[start] = componentId;
      while (head < tail) {
        const approachCell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[approachCell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          if (input.gateApproachCell[neighbor] !== 0) {
            if (approachComponent[neighbor] < 0) {
              approachComponent[neighbor] = componentId;
              queue[tail++] = neighbor;
            }
            continue;
          }
          if (!routeEligible(input, neighbor)) continue;
          const cost = traversalCost[neighbor]!;
          if (cost < selectedCost || (cost === selectedCost && neighbor < selectedTerminal)) {
            selectedTerminal = neighbor;
            selectedCost = cost;
          }
        }
      }
      approachTerminalByComponent[componentId] = selectedTerminal;
      if (selectedTerminal >= 0) addTerminal(selectedTerminal);
    }

    // Adjacent castle/throne cells form one reserved site footprint. Select a
    // single legal perimeter terminal for the whole footprint so a multi-cell
    // keep is reachable even when an interior member has no legal neighbour of
    // its own. If no direct perimeter is available, the footprint may inherit
    // the proven exterior terminal of an adjacent gate-approach component. It
    // never routes across that reserved component, and a sealed component
    // cannot make the footprint reachable. Each cell and edge is visited a
    // constant number of times.
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (hasMandatoryRouteSite(input, cell) && mandatorySiteVisited[cell] === 0) {
        let head = 0;
        let tail = 0;
        let directTerminal = -1;
        let directCost = UINT32_MAX;
        let directPriority = UINT32_MAX;
        let approachTerminal = -1;
        let approachCost = UINT32_MAX;
        let approachPriority = UINT32_MAX;
        queue[tail++] = cell;
        mandatorySiteVisited[cell] = 1;
        while (head < tail) {
          const member = queue[head++]!;
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[member * NEIGHBOR_COUNT + direction]!;
            if (neighbor < 0) continue;
            if (hasMandatoryRouteSite(input, neighbor)) {
              if (mandatorySiteVisited[neighbor] === 0) {
                mandatorySiteVisited[neighbor] = 1;
                queue[tail++] = neighbor;
              }
              continue;
            }
            if (routeEligible(input, neighbor)) {
              const cost = traversalCost[neighbor]!;
              const priority = randomU32(
                seed,
                ROUTE_COST_CHANNEL,
                grid.q[neighbor]!,
                grid.r[neighbor]!,
                5,
              );
              if (
                cost < directCost
                || (cost === directCost && priority < directPriority)
                || (
                  cost === directCost
                  && priority === directPriority
                  && neighbor < directTerminal
                )
              ) {
                directTerminal = neighbor;
                directCost = cost;
                directPriority = priority;
              }
              continue;
            }
            if (input.gateApproachCell[neighbor] === 0) continue;
            const componentId = approachComponent[neighbor]!;
            const terminal = componentId >= 0
              ? approachTerminalByComponent[componentId]!
              : -1;
            if (terminal < 0) continue;
            const cost = traversalCost[terminal]!;
            const priority = randomU32(
              seed,
              ROUTE_COST_CHANNEL,
              grid.q[terminal]!,
              grid.r[terminal]!,
              5,
            );
            if (
              cost < approachCost
              || (cost === approachCost && priority < approachPriority)
              || (
                cost === approachCost
                && priority === approachPriority
                && terminal < approachTerminal
              )
            ) {
              approachTerminal = terminal;
              approachCost = cost;
              approachPriority = priority;
            }
          }
        }
        const selectedTerminal = directTerminal >= 0 ? directTerminal : approachTerminal;
        if (selectedTerminal < 0) {
          unreachableMandatorySiteCount += tail;
        } else {
          addTerminal(selectedTerminal);
          for (let memberIndex = 0; memberIndex < tail; memberIndex += 1) {
            const member = queue[memberIndex]!;
            requiredAnchorSite[member] = 1;
            mandatoryTerminalBySite[member] = selectedTerminal;
          }
        }
      }

      // Resource/core masks are intentionally broad suitability fields, so
      // routing every raw cell would misrepresent them as deployed nodes.
      // Select a small, stable tier-and-biome representative set as optional
      // hubs instead.
      for (let kind = 0; kind < 2; kind += 1) {
        const potential = kind === 0
          ? input.resourcePotential[cell]!
          : input.corePotential[cell]!;
        if (potential === 0) continue;
        const terminal = bestLegalRouteNeighbor(
          input,
          seed,
          traversalCost,
          cell,
          6 + kind,
        );
        if (terminal < 0) continue;
        const tier = Math.min(3, potential);
        const biome = Math.min(31, input.biomeId[cell]!);
        const bucketIndex = kind * 4 * 32 + tier * 32 + biome;
        const bucket = optionalHubBuckets[bucketIndex]!;
        const candidate: OptionalRouteHub = {
          site: cell,
          terminal,
          priority: randomU32(
            seed,
            ROUTE_COST_CHANNEL,
            grid.q[cell]!,
            grid.r[cell]!,
            8 + kind,
          ),
        };
        let insertion = 0;
        while (
          insertion < bucket.length
          && (
            bucket[insertion]!.priority < candidate.priority
            || (
              bucket[insertion]!.priority === candidate.priority
              && bucket[insertion]!.site < candidate.site
            )
          )
        ) insertion += 1;
        if (insertion >= OPTIONAL_ROUTE_HUBS_PER_TIER_BIOME) continue;
        bucket.splice(insertion, 0, candidate);
        if (bucket.length > OPTIONAL_ROUTE_HUBS_PER_TIER_BIOME) bucket.pop();
      }
    }
    for (const bucket of optionalHubBuckets) {
      for (const hub of bucket) {
        requiredAnchorSite[hub.site] = 1;
        addTerminal(hub.terminal);
      }
    }
    for (const value of requiredAnchorSite) requiredSiteAnchorCount += value;

    let fordAttached = false;
    for (let componentId = 0; componentId < components.length; componentId += 1) {
      const terminals = terminalsByComponent[componentId]!;
      if (terminals.length === 0) continue;
      terminals.sort((first, second) => {
        const firstCore = hasAdjacentMask(grid, first, [input.corePotential, input.throneAnchor]);
        const secondCore = hasAdjacentMask(grid, second, [input.corePotential, input.throneAnchor]);
        if (firstCore !== secondCore) return firstCore ? -1 : 1;
        const firstPriority = randomU32(
          seed,
          ROUTE_COST_CHANNEL,
          grid.q[first]!,
          grid.r[first]!,
          4,
        );
        const secondPriority = randomU32(
          seed,
          ROUTE_COST_CHANNEL,
          grid.q[second]!,
          grid.r[second]!,
          4,
        );
        return firstPriority - secondPriority || first - second;
      });
      const cells = components[componentId]!;
      for (const cell of cells) {
        distance[cell] = Number.POSITIVE_INFINITY;
        predecessor[cell] = -1;
      }
      const root = terminals[0]!;
      let remainingTerminals = terminals.length;
      let fordCell = -1;
      let fordPair: readonly [number, number] | undefined;
      const componentCanSupplyFord = !fordAttached && cells.some(cell => (
        (input.waterRegime[cell] === WATER_RIVER
          || input.waterRegime[cell] === WATER_STREAM)
        && oppositeDryFordPair(input, cell) !== undefined
      ));
      distance[root] = 0;
      backbone[root] = 1;
      heapPush(heapCells, heapCosts, root, 0);
      while (heapCells.length > 0) {
        const popped = heapPop(heapCells, heapCosts)!;
        const cell = popped[0];
        const cost = popped[1];
        if (cost !== distance[cell]) continue;
        if (terminalMask[cell] === 1 && settledTerminal[cell] === 0) {
          settledTerminal[cell] = 1;
          remainingTerminals -= 1;
        }
        if (
          componentCanSupplyFord
          && fordCell < 0
          && (
            input.waterRegime[cell] === WATER_RIVER
            || input.waterRegime[cell] === WATER_STREAM
          )
        ) {
          const pair = oppositeDryFordPair(input, cell);
          if (pair) {
            fordCell = cell;
            fordPair = pair;
          }
        }
        if (remainingTerminals === 0 && (!componentCanSupplyFord || fordCell >= 0)) break;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || eligibleComponent[neighbor] !== componentId
            || !routeNeighborEligible(input, cell, neighbor)
          ) continue;
          const nextCost = cost + traversalCost[neighbor]!;
          if (
            nextCost < distance[neighbor]!
            || (
              nextCost === distance[neighbor]!
              && (predecessor[neighbor] < 0 || cell < predecessor[neighbor]!)
            )
          ) {
            distance[neighbor] = nextCost;
            predecessor[neighbor] = cell;
            heapPush(heapCells, heapCosts, neighbor, nextCost);
          }
        }
      }
      for (const terminal of terminals) {
        if (!Number.isFinite(distance[terminal])) {
          fail('GREATER_REALM_LIVING_WORLD_ROUTE_DISCONNECTED');
        }
        markPredecessorPath(terminal, predecessor, backbone);
        settledTerminal[terminal] = 0;
      }

      if (!fordAttached && fordCell >= 0 && fordPair) {
        markPredecessorPath(fordCell, predecessor, backbone);
        backbone[fordPair[0]] = 1;
        backbone[fordPair[1]] = 1;
        fordAttached = true;
      }
      heapCells.fill(0);
      heapCosts.fill(0);
      heapCells.length = 0;
      heapCosts.length = 0;
    }

    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (backbone[cell] !== 1 || input.waterRegime[cell] === WATER_DRY) continue;
      const pair = oppositeDryFordPair(input, cell);
      if (!pair) fail('GREATER_REALM_LIVING_WORLD_FORD_BANKS_INVALID');
      backbone[pair[0]] = 1;
      backbone[pair[1]] = 1;
    }

    let trackCount = 0;
    let roadCount = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (backbone[cell] !== 1) continue;
      const regime = input.waterRegime[cell]!;
      if (regime === WATER_RIVER || regime === WATER_STREAM) {
        routeClass[cell] = GREATER_REALM_ROUTE_CLASS.FORD;
      } else if (routeTouchesMajorAuthority(input, cell)) {
        routeClass[cell] = GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY;
      } else {
        ordinaryDryRouteCells.push(cell);
        if (
          input.slope[cell]! > 900
          || randomU32(seed, ROUTE_COST_CHANNEL, grid.q[cell]!, grid.r[cell]!, 3) % 7 === 0
        ) {
          routeClass[cell] = GREATER_REALM_ROUTE_CLASS.TRACK;
          trackCount += 1;
        } else {
          routeClass[cell] = GREATER_REALM_ROUTE_CLASS.ROAD;
          roadCount += 1;
        }
      }
    }
    if (trackCount === 0 && ordinaryDryRouteCells.length > 0) {
      const cell = ordinaryDryRouteCells[0]!;
      if (routeClass[cell] === GREATER_REALM_ROUTE_CLASS.ROAD) roadCount -= 1;
      routeClass[cell] = GREATER_REALM_ROUTE_CLASS.TRACK;
      trackCount += 1;
    }
    if (roadCount === 0 && ordinaryDryRouteCells.length > 1) {
      const cell = ordinaryDryRouteCells.find(
        candidate => routeClass[candidate] !== GREATER_REALM_ROUTE_CLASS.ROAD,
      );
      if (cell !== undefined) {
        if (routeClass[cell] === GREATER_REALM_ROUTE_CLASS.TRACK) trackCount -= 1;
        routeClass[cell] = GREATER_REALM_ROUTE_CLASS.ROAD;
        roadCount += 1;
      }
    }
    let coveredSiteAnchorCount = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (requiredAnchorSite[cell] !== 1) continue;
      const mandatoryTerminal = mandatoryTerminalBySite[cell]!;
      if (
        mandatoryTerminal >= 0
          ? routeClass[mandatoryTerminal] !== GREATER_REALM_ROUTE_CLASS.NONE
          : routeAtOrAdjacent(grid, routeClass, cell)
      ) coveredSiteAnchorCount += 1;
    }
    const supportedApproach = new Uint8Array(gateApproachComponentCount);
    try {
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE) continue;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) continue;
          const component = approachComponent[neighbor]!;
          if (component >= 0) supportedApproach[component] = 1;
        }
      }
      const supportedGateApproachComponentCount = supportedApproach.reduce(
        (total, value) => total + value,
        0,
      );
      const requiredRouteAnchorCount = requiredSiteAnchorCount + gateApproachComponentCount;
      const coveredRouteAnchorCount = coveredSiteAnchorCount
        + supportedGateApproachComponentCount;
      returnedRouteAnchorCell = new Uint8Array(terminalMask);
      const evidence = Object.freeze({
        requiredRouteAnchorCount,
        coveredRouteAnchorCount,
        uncoveredRouteAnchorCount:
          requiredRouteAnchorCount - coveredRouteAnchorCount,
        unreachableMandatorySiteCount,
        gateApproachComponentCount,
        supportedGateApproachComponentCount,
        unsupportedGateApproachComponentCount:
          gateApproachComponentCount - supportedGateApproachComponentCount,
        routeAnchorCell: returnedRouteAnchorCell,
      });
      completed = true;
      return evidence;
    } finally {
      supportedApproach.fill(0);
    }
  } finally {
    eligible.fill(0);
    eligibleComponent.fill(0);
    approachComponent.fill(0);
    approachTerminalByComponent.fill(0);
    queue.fill(0);
    predecessor.fill(0);
    distance.fill(0);
    backbone.fill(0);
    terminalMask.fill(0);
    settledTerminal.fill(0);
    requiredAnchorSite.fill(0);
    mandatorySiteVisited.fill(0);
    mandatoryTerminalBySite.fill(0);
    traversalCost.fill(0);
    heapCells.fill(0);
    heapCosts.fill(0);
    heapCells.length = 0;
    heapCosts.length = 0;
    ordinaryDryRouteCells.fill(0);
    ordinaryDryRouteCells.length = 0;
    for (const component of components) component.fill(0);
    for (const terminals of terminalsByComponent) terminals.fill(0);
    for (const bucket of optionalHubBuckets) {
      for (const hub of bucket) {
        hub.site = 0;
        hub.terminal = 0;
        hub.priority = 0;
      }
      bucket.length = 0;
    }
    if (!completed) returnedRouteAnchorCell?.fill(0);
  }
}

function axialDistance(
  firstQ: number,
  firstR: number,
  secondQ: number,
  secondR: number,
): number {
  const q = firstQ - secondQ;
  const r = firstR - secondR;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function routeAtOrAdjacent(
  grid: IndexedAxialGrid,
  routeClass: Uint8Array,
  cell: number,
): boolean {
  if (routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE) return true;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && routeClass[neighbor] !== GREATER_REALM_ROUTE_CLASS.NONE) {
      return true;
    }
  }
  return false;
}

function landmarkAtOrAdjacent(
  grid: IndexedAxialGrid,
  landmarkClass: Uint8Array,
  cell: number,
): boolean {
  if (landmarkClass[cell] !== GREATER_REALM_LANDMARK_CLASS.NONE) return true;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && landmarkClass[neighbor] !== GREATER_REALM_LANDMARK_CLASS.NONE) {
      return true;
    }
  }
  return false;
}

function minimumAnchorSpacing(
  first: GreaterRealmLandmarkClass,
  second: GreaterRealmLandmarkClass,
): number {
  if (
    first === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
    && second === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
  ) return RUIN_SPACING;
  if (
    first === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
    && second === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
  ) return LAMP_SPACING;
  if (
    first === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
    || second === GREATER_REALM_LANDMARK_CLASS.LAMP_POST
  ) return 1;
  if (
    first === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
    || second === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
  ) return 4;
  return WAYSTONE_SPACING;
}

function canPlaceAnchor(
  grid: IndexedAxialGrid,
  cell: number,
  landmarkClass: GreaterRealmLandmarkClass,
  spatialIndex: LandmarkSpatialIndex,
): boolean {
  const bucketQ = Math.floor(grid.q[cell]! / RUIN_SPACING);
  const bucketR = Math.floor(grid.r[cell]! / RUIN_SPACING);
  for (let qOffset = -1; qOffset <= 1; qOffset += 1) {
    for (let rOffset = -1; rOffset <= 1; rOffset += 1) {
      const nearby = spatialIndex.get(`${bucketQ + qOffset},${bucketR + rOffset}`);
      if (!nearby) continue;
      for (const anchor of nearby) {
        const distance = axialDistance(
          grid.q[cell]!,
          grid.r[cell]!,
          grid.q[anchor.cell]!,
          grid.r[anchor.cell]!,
        );
        if (distance < minimumAnchorSpacing(landmarkClass, anchor.landmarkClass)) {
          return false;
        }
      }
    }
  }
  return true;
}

function indexLandmarkAnchor(
  grid: IndexedAxialGrid,
  anchor: LandmarkAnchor,
  spatialIndex: LandmarkSpatialIndex,
): void {
  const bucketQ = Math.floor(grid.q[anchor.cell]! / RUIN_SPACING);
  const bucketR = Math.floor(grid.r[anchor.cell]! / RUIN_SPACING);
  const key = `${bucketQ},${bucketR}`;
  const bucket = spatialIndex.get(key) ?? [];
  bucket.push(anchor);
  spatialIndex.set(key, bucket);
}

function potentialWallNeighbors(
  input: GreaterRealmLivingWorldInput,
  dressingExcluded: Uint8Array,
  routeClass: Uint8Array,
  landmarkClass: Uint8Array,
  cell: number,
): number[] {
  const result: number[] = [];
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (
      neighbor >= 0
      && dressingExcluded[neighbor] === 0
      && routeClass[neighbor] === GREATER_REALM_ROUTE_CLASS.NONE
      && landmarkClass[neighbor] === GREATER_REALM_LANDMARK_CLASS.NONE
      && input.slope[neighbor]! < 1_400
    ) result.push(neighbor);
  }
  return result;
}

function potentialWallNeighborCount(
  input: GreaterRealmLivingWorldInput,
  dressingExcluded: Uint8Array,
  routeClass: Uint8Array,
  landmarkClass: Uint8Array,
  cell: number,
): number {
  let count = 0;
  for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
    const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
    if (
      neighbor >= 0
      && dressingExcluded[neighbor] === 0
      && routeClass[neighbor] === GREATER_REALM_ROUTE_CLASS.NONE
      && landmarkClass[neighbor] === GREATER_REALM_LANDMARK_CLASS.NONE
      && input.slope[neighbor]! < 1_400
    ) count += 1;
  }
  return count;
}

function orderedSampledCandidates(
  input: GreaterRealmLivingWorldInput,
  seed: SeedWords,
  predicate: (cell: number) => boolean,
  divisor: number,
): number[] {
  const sampledCells: number[] = [];
  const sampledPriorities: number[] = [];
  let fallbackCell = -1;
  let fallbackPriority = UINT32_MAX;
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (!predicate(cell)) continue;
    const priority = randomU32(
      seed,
      LANDMARK_CHANNEL,
      input.grid.q[cell]!,
      input.grid.r[cell]!,
    );
    if (fallbackCell < 0 || priority < fallbackPriority) {
      fallbackPriority = priority;
      fallbackCell = cell;
    }
    // Keep a modest deterministic review pool even on small test atlases. The
    // spatial index and hard class caps, rather than sparse traversal luck,
    // remain the final density authority.
    if (priority % divisor < Math.min(16, divisor)) {
      sampledCells.push(cell);
      sampledPriorities.push(priority);
    }
  }
  if (sampledCells.length === 0 && fallbackCell >= 0) {
    sampledCells.push(fallbackCell);
    sampledPriorities.push(fallbackPriority);
  }
  if (sampledCells.length < 2) {
    const result = [...sampledCells];
    sampledCells.fill(0);
    sampledPriorities.fill(0);
    return result;
  }

  // Four stable least-significant-byte passes use the complete u32 priority.
  // This removes canonical q/r traversal bias without an O(N log N) sort.
  let cells = new Uint32Array(0);
  let priorities = new Uint32Array(0);
  let nextCells = new Uint32Array(0);
  let nextPriorities = new Uint32Array(0);
  let counts = new Uint32Array(0);
  let offsets = new Uint32Array(0);
  try {
    // Allocate inside the cleanup scope so a later allocation failure cannot
    // strand an earlier buffer containing exact candidate cell indexes.
    cells = Uint32Array.from(sampledCells);
    priorities = Uint32Array.from(sampledPriorities);
    nextCells = new Uint32Array(cells.length);
    nextPriorities = new Uint32Array(cells.length);
    counts = new Uint32Array(256);
    offsets = new Uint32Array(256);
    for (let shift = 0; shift < 32; shift += 8) {
      counts.fill(0);
      for (const priority of priorities) counts[(priority >>> shift) & 0xff] += 1;
      let offset = 0;
      for (let bucket = 0; bucket < counts.length; bucket += 1) {
        offsets[bucket] = offset;
        offset += counts[bucket]!;
      }
      for (let index = 0; index < priorities.length; index += 1) {
        const bucket = (priorities[index]! >>> shift) & 0xff;
        const destination = offsets[bucket]!;
        offsets[bucket] += 1;
        nextCells[destination] = cells[index]!;
        nextPriorities[destination] = priorities[index]!;
      }
      [cells, nextCells] = [nextCells, cells];
      [priorities, nextPriorities] = [nextPriorities, priorities];
    }
    return Array.from(cells);
  } finally {
    sampledCells.fill(0);
    sampledPriorities.fill(0);
    cells.fill(0);
    priorities.fill(0);
    nextCells.fill(0);
    nextPriorities.fill(0);
    counts.fill(0);
    offsets.fill(0);
  }
}

function placeLandmarkAnchors(
  input: GreaterRealmLivingWorldInput,
  candidates: readonly number[],
  landmark: GreaterRealmLandmarkClass,
  maximumCount: number,
  landmarkClass: Uint8Array,
  anchors: LandmarkAnchor[],
  spatialIndex: LandmarkSpatialIndex,
): void {
  let placed = 0;
  for (const cell of candidates) {
    if (placed >= maximumCount) break;
    if (!canPlaceAnchor(input.grid, cell, landmark, spatialIndex)) continue;
    landmarkClass[cell] = landmark;
    const anchor: LandmarkAnchor = { cell, landmarkClass: landmark };
    anchors.push(anchor);
    indexLandmarkAnchor(input.grid, anchor, spatialIndex);
    placed += 1;
  }
}

function pruneSmallVegetationPatches(
  grid: IndexedAxialGrid,
  vegetationDensity: Uint8Array,
): void {
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (vegetationDensity[start] === 0 || seen[start] === 1) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || seen[neighbor] === 1 || vegetationDensity[neighbor] === 0) {
            continue;
          }
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (tail >= MINIMUM_VEGETATION_PATCH_CELLS) continue;
      for (let offset = 0; offset < tail; offset += 1) {
        vegetationDensity[queue[offset]!] = 0;
      }
    }
  } finally {
    seen.fill(0);
    queue.fill(0);
  }
}

function vegetationPatchMetrics(
  grid: IndexedAxialGrid,
  vegetationDensity: Uint8Array,
): Readonly<{
  vegetatedCellCount: number;
  patchCount: number;
  minimumPatchSize: number;
  isolatedCellCount: number;
  smallPatchCellCount: number;
}> {
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let vegetatedCellCount = 0;
  let patchCount = 0;
  let minimumPatchSize = grid.cellCount + 1;
  let isolatedCellCount = 0;
  let smallPatchCellCount = 0;
  try {
    for (const value of vegetationDensity) vegetatedCellCount += value > 0 ? 1 : 0;
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (vegetationDensity[start] === 0 || seen[start] === 1) continue;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || seen[neighbor] === 1 || vegetationDensity[neighbor] === 0) {
            continue;
          }
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      patchCount += 1;
      minimumPatchSize = Math.min(minimumPatchSize, tail);
      if (tail === 1) isolatedCellCount += 1;
      if (tail < MINIMUM_VEGETATION_PATCH_CELLS) smallPatchCellCount += tail;
    }
    return Object.freeze({
      vegetatedCellCount,
      patchCount,
      minimumPatchSize: patchCount === 0 ? 0 : minimumPatchSize,
      isolatedCellCount,
      smallPatchCellCount,
    });
  } finally {
    seen.fill(0);
    queue.fill(0);
  }
}

function ambientClassCompatible(
  grid: IndexedAxialGrid,
  ecologyClass: Uint8Array,
  vegetationDensity: Uint8Array,
  routeClass: Uint8Array,
  landmarkClass: Uint8Array,
  cell: number,
  ambient: GreaterRealmAmbientLifeClass,
): boolean {
  const ecology = ecologyClass[cell]!;
  if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.NONE) return true;
  if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT) {
    return routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
      && vegetationDensity[cell]! >= 64
      && (
        ecology === GREATER_REALM_ECOLOGY_CLASS.PLAINS
        || ecology === GREATER_REALM_ECOLOGY_CLASS.FOREST
        || ecology === GREATER_REALM_ECOLOGY_CLASS.TAIGA
        || ecology === GREATER_REALM_ECOLOGY_CLASS.SAVANNA
      );
  }
  if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.GUARD_POST) {
    return routeAtOrAdjacent(grid, routeClass, cell)
      && landmarkAtOrAdjacent(grid, landmarkClass, cell);
  }
  if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE) {
    return routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE
      && (
        ecology === GREATER_REALM_ECOLOGY_CLASS.JUNGLE
        || ecology === GREATER_REALM_ECOLOGY_CLASS.SAVANNA
        || ecology === GREATER_REALM_ECOLOGY_CLASS.DESERT
      );
  }
  if (ambient === GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE) {
    return routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE
      && ecology !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
      && ecology !== GREATER_REALM_ECOLOGY_CLASS.ALPINE
      && ecology !== GREATER_REALM_ECOLOGY_CLASS.SNOW;
  }
  return routeAtOrAdjacent(grid, routeClass, cell)
    && ecology !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
    && ecology !== GREATER_REALM_ECOLOGY_CLASS.ALPINE
    && ecology !== GREATER_REALM_ECOLOGY_CLASS.SNOW
    && ecology !== GREATER_REALM_ECOLOGY_CLASS.DESERT;
}

function routeConnectivityEvidence(
  input: GreaterRealmLivingWorldInput,
  routeClass: Uint8Array,
  ambientLifeClass: Uint8Array,
  routeAnchorCell: Uint8Array,
): RouteConnectivityEvidence {
  const { grid } = input;
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let routeComponentCount = 0;
  let anchorBearingRouteComponentCount = 0;
  let anchorlessRouteComponentCount = 0;
  let courierDisconnectedRouteViolationCount = 0;
  try {
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (routeClass[start] === GREATER_REALM_ROUTE_CLASS.NONE || seen[start] === 1) {
        continue;
      }
      routeComponentCount += 1;
      let head = 0;
      let tail = 0;
      let anchorBearing = false;
      let courierCount = 0;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        if (routeAnchorCell[cell] !== 0) anchorBearing = true;
        if (
          ambientLifeClass[cell] === GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE
          || ambientLifeClass[cell]
            === GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE
        ) courierCount += 1;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || seen[neighbor] === 1
            || routeClass[neighbor] === GREATER_REALM_ROUTE_CLASS.NONE
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (anchorBearing) anchorBearingRouteComponentCount += 1;
      else {
        anchorlessRouteComponentCount += 1;
        courierDisconnectedRouteViolationCount += courierCount;
      }
    }
    return Object.freeze({
      routeComponentCount,
      anchorBearingRouteComponentCount,
      anchorlessRouteComponentCount,
      courierDisconnectedRouteViolationCount,
    });
  } finally {
    seen.fill(0);
    queue.fill(0);
  }
}

function updateFingerprint(hash: number, value: number): number {
  let result = hash >>> 0;
  result ^= value & 0xff;
  result = Math.imul(result, 0x0100_0193);
  return result >>> 0;
}

function layoutFingerprint(fields: readonly Uint8Array[]): string {
  let hash = 0x811c_9dc5;
  for (const field of fields) {
    for (const value of field) hash = updateFingerprint(hash, value);
    hash = updateFingerprint(hash, 0xff);
  }
  return hash.toString(16).padStart(8, '0');
}

/**
 * Derive private ecological, route, landmark, and ambient-life potentials for
 * one candidate atlas. Protected and strategic masks are hard exclusions.
 * Water is excluded from surface dressing; the only route exception is an
 * exact FORD on river/stream regimes. Returned classes are review evidence,
 * not live entities.
 */
export function deriveGreaterRealmLivingWorld(
  input: GreaterRealmLivingWorldInput,
): GreaterRealmLivingWorldAuthority {
  assertInput(input);
  const seedCopy = copyAndValidateSeed(input.seed);
  const seed = seedCopy as unknown as SeedWords;
  const { grid } = input;
  const dressingExcluded = new Uint8Array(grid.cellCount);
  const ecologyClass = new Uint8Array(grid.cellCount);
  const vegetationDensity = new Uint8Array(grid.cellCount);
  const routeClass = new Uint8Array(grid.cellCount);
  const landmarkClass = new Uint8Array(grid.cellCount);
  const ambientLifeClass = new Uint8Array(grid.cellCount);
  const anchors: LandmarkAnchor[] = [];
  const landmarkSpatialIndex: LandmarkSpatialIndex = new Map();
  let vegetationBroad: Int32Array | undefined;
  let vegetationDetail: Int32Array | undefined;
  let routeEvidence: RouteBackboneEvidence | undefined;
  let completed = false;

  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        input.waterRegime[cell] !== WATER_DRY
        || input.legacyProtectedCell[cell] !== 0
        || isStrategicReserved(input, cell)
      ) dressingExcluded[cell] = 1;
    }

    vegetationBroad = smoothedIntegerField(grid, seed, VEGETATION_CHANNEL, 7);
    vegetationDetail = smoothedIntegerField(grid, seed, VEGETATION_DETAIL_CHANNEL, 2);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (dressingExcluded[cell] === 1) continue;
      const ecology = classifyEcology(input, cell);
      ecologyClass[cell] = ecology;
      const climateAdjustment = clamp(roundedDivide(input.moisture[cell]!, 220), -42, 42);
      const wetnessAdjustment = clamp(roundedDivide(input.wetnessIndex[cell]!, 620), 0, 24);
      const slopePenalty = clamp(roundedDivide(input.slope[cell]!, 70), 0, 54);
      const exposurePenalty = clamp(roundedDivide(Math.max(0, input.exposure[cell]!), 90), 0, 18);
      const broadVariation = roundedDivide(vegetationBroad[cell]!, 150);
      const detailVariation = roundedDivide(vegetationDetail[cell]!, 420);
      const density = clamp(
        ecologyBaseDensity(ecology)
          + climateAdjustment
          + wetnessAdjustment
          - slopePenalty
          - exposurePenalty
          + broadVariation
          + detailVariation,
        0,
        Math.min(
          ecologyDensityCap(ecology),
          sourceBiomeDensityCap(input.biomeId[cell]!),
        ),
      );
      vegetationDensity[cell] = density < 18 ? 0 : density;
    }

    routeEvidence = deriveConnectedRouteBackbone(input, seed, routeClass);
    // These are independent offline suitability potentials, not deployed road
    // meshes. Vegetation may therefore overlap a route candidate; an eventual
    // runtime placement authority must clear only the footprint it adopts.

    const ruinCandidates = orderedSampledCandidates(input, seed, cell => (
      dressingExcluded[cell] === 0
      && routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
      && routeAtOrAdjacent(grid, routeClass, cell)
      && input.slope[cell]! < 950
      && input.distanceToFreshwater[cell]! > 1
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SNOW
      && potentialWallNeighborCount(
        input,
        dressingExcluded,
        routeClass,
        landmarkClass,
        cell,
      ) >= 2
    ), 211);
    try {
      placeLandmarkAnchors(
        input,
        ruinCandidates,
        GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN,
        96,
        landmarkClass,
        anchors,
        landmarkSpatialIndex,
      );
    } finally {
      ruinCandidates.fill(0);
      ruinCandidates.length = 0;
    }

    const ruinAnchors = anchors.filter(
      anchor => anchor.landmarkClass === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN,
    );
    try {
      for (const ruin of ruinAnchors) {
        const wallCandidates = potentialWallNeighbors(
          input,
          dressingExcluded,
          routeClass,
          landmarkClass,
          ruin.cell,
        );
        const walls: Array<{ cell: number; priority: number }> = [];
        try {
          for (const cell of wallCandidates) {
            walls.push({
              cell,
              priority: randomU32(seed, WALL_CHANNEL, grid.q[cell]!, grid.r[cell]!),
            });
          }
          walls.sort(
            (first, second) => first.priority - second.priority || first.cell - second.cell,
          );
          const wallCount = Math.min(3, walls.length);
          for (let index = 0; index < wallCount; index += 1) {
            landmarkClass[walls[index]!.cell] = GREATER_REALM_LANDMARK_CLASS.RUINED_WALL;
          }
        } finally {
          wallCandidates.fill(0);
          wallCandidates.length = 0;
          for (const wall of walls) {
            wall.cell = 0;
            wall.priority = 0;
          }
          walls.length = 0;
        }
      }
    } finally {
      ruinAnchors.length = 0;
    }

    const waystoneCandidates = orderedSampledCandidates(input, seed, cell => (
      dressingExcluded[cell] === 0
      && landmarkClass[cell] === GREATER_REALM_LANDMARK_CLASS.NONE
      && routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
      && routeAtOrAdjacent(grid, routeClass, cell)
      && input.slope[cell]! < 1_200
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SNOW
    ), 97);
    try {
      placeLandmarkAnchors(
        input,
        waystoneCandidates,
        GREATER_REALM_LANDMARK_CLASS.WAYSTONE,
        192,
        landmarkClass,
        anchors,
        landmarkSpatialIndex,
      );
    } finally {
      waystoneCandidates.fill(0);
      waystoneCandidates.length = 0;
    }

    const lampCandidates = orderedSampledCandidates(input, seed, cell => (
      dressingExcluded[cell] === 0
      && landmarkClass[cell] === GREATER_REALM_LANDMARK_CLASS.NONE
      && routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
      && routeAtOrAdjacent(grid, routeClass, cell)
      && input.slope[cell]! < 900
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.ALPINE
      && ecologyClass[cell] !== GREATER_REALM_ECOLOGY_CLASS.SNOW
    ), 71);
    try {
      placeLandmarkAnchors(
        input,
        lampCandidates,
        GREATER_REALM_LANDMARK_CLASS.LAMP_POST,
        256,
        landmarkClass,
        anchors,
        landmarkSpatialIndex,
      );
    } finally {
      lampCandidates.fill(0);
      lampCandidates.length = 0;
    }
    landmarkSpatialIndex.clear();

    const vegetationClearanceMasks = [
      input.legacyProtectedCell,
      input.castleSlot,
      input.throneAnchor,
      input.barrier,
      input.gateCell,
      input.gateApproachCell,
    ] as const;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        landmarkAtOrAdjacent(grid, landmarkClass, cell)
        || (
          dressingExcluded[cell] === 0
          && hasAdjacentMask(grid, cell, vegetationClearanceMasks)
        )
      ) vegetationDensity[cell] = 0;
    }
    pruneSmallVegetationPatches(grid, vegetationDensity);

    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (dressingExcluded[cell] === 1 || landmarkClass[cell] !== 0) continue;
      const ecology = ecologyClass[cell]!;
      const random = randomU32(seed, AMBIENT_CHANNEL, grid.q[cell]!, grid.r[cell]!);
      if (
        routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE
        && (
          ecology === GREATER_REALM_ECOLOGY_CLASS.JUNGLE
          || ecology === GREATER_REALM_ECOLOGY_CLASS.SAVANNA
          || ecology === GREATER_REALM_ECOLOGY_CLASS.DESERT
        )
        && random % 73 === 0
      ) {
        ambientLifeClass[cell] = GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE;
      } else if (
        routeClass[cell] !== GREATER_REALM_ROUTE_CLASS.NONE
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.ALPINE
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.SNOW
        && random % 83 === 0
      ) {
        ambientLifeClass[cell] = GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE;
      } else if (
        routeAtOrAdjacent(grid, routeClass, cell)
        && landmarkAtOrAdjacent(grid, landmarkClass, cell)
        && random % 47 === 0
      ) {
        ambientLifeClass[cell] = GREATER_REALM_AMBIENT_LIFE_CLASS.GUARD_POST;
      } else if (
        routeAtOrAdjacent(grid, routeClass, cell)
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.SWAMP
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.ALPINE
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.SNOW
        && ecology !== GREATER_REALM_ECOLOGY_CLASS.DESERT
        && random % 101 === 0
      ) {
        ambientLifeClass[cell] = GREATER_REALM_AMBIENT_LIFE_CLASS.CIVILIAN_FOOTFALL;
      } else if (
        routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
        && vegetationDensity[cell]! >= 64
        && (
          ecology === GREATER_REALM_ECOLOGY_CLASS.PLAINS
          || ecology === GREATER_REALM_ECOLOGY_CLASS.FOREST
          || ecology === GREATER_REALM_ECOLOGY_CLASS.TAIGA
          || ecology === GREATER_REALM_ECOLOGY_CLASS.SAVANNA
        )
        && random % 89 === 0
      ) {
        ambientLifeClass[cell] = GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT;
      }
    }

    let courierPresent = false;
    let courierFallback = -1;
    let courierFallbackPriority = UINT32_MAX;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        ambientLifeClass[cell] === GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE
        || ambientLifeClass[cell] === GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE
      ) courierPresent = true;
      if (
        dressingExcluded[cell] !== 0
        || landmarkClass[cell] !== GREATER_REALM_LANDMARK_CLASS.NONE
        || routeClass[cell] === GREATER_REALM_ROUTE_CLASS.NONE
        || ecologyClass[cell] === GREATER_REALM_ECOLOGY_CLASS.SWAMP
        || ecologyClass[cell] === GREATER_REALM_ECOLOGY_CLASS.ALPINE
        || ecologyClass[cell] === GREATER_REALM_ECOLOGY_CLASS.SNOW
      ) continue;
      const priority = randomU32(
        seed,
        AMBIENT_CHANNEL,
        grid.q[cell]!,
        grid.r[cell]!,
        1,
      );
      if (
        courierFallback < 0
        || priority < courierFallbackPriority
        || (priority === courierFallbackPriority && cell < courierFallback)
      ) {
        courierFallback = cell;
        courierFallbackPriority = priority;
      }
    }
    if (!courierPresent && courierFallback >= 0) {
      ambientLifeClass[courierFallback] = GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE;
    }

    const vegetationMetrics = vegetationPatchMetrics(grid, vegetationDensity);
    if (!routeEvidence) fail('GREATER_REALM_LIVING_WORLD_ROUTE_EVIDENCE_MISSING');
    const connectivity = routeConnectivityEvidence(
      input,
      routeClass,
      ambientLifeClass,
      routeEvidence.routeAnchorCell,
    );
    const ecologyCounts = new Uint32Array(10);
    const routeCounts = new Uint32Array(5);
    const landmarkCounts = new Uint32Array(5);
    const ambientCounts = new Uint32Array(6);
    let excludedCellCount = 0;
    let legacyPreservationViolationCount = 0;
    let waterExclusionViolationCount = 0;
    let reservedSiteExclusionViolationCount = 0;
    let ecologicalCompatibilityViolationCount = 0;
    let landmarkRouteAdjacencyViolationCount = 0;
    let orphanedRuinWallCount = 0;
    let ambientConstraintViolationCount = 0;
    let forbiddenWaterRouteViolationCount = 0;
    let fordRegimeViolationCount = 0;
    let sealedGateRouteViolationCount = 0;
    let rabbitDensityViolationCount = 0;
    let vegetationReservedClearanceViolationCount = 0;
    let vegetationLandmarkClearanceViolationCount = 0;
    const surfaceOutputAt = (cell: number): boolean => (
      ecologyClass[cell] !== 0
      || vegetationDensity[cell] !== 0
      || landmarkClass[cell] !== 0
      || ambientLifeClass[cell] !== 0
    );
    const anyOutputAt = (cell: number): boolean => (
      surfaceOutputAt(cell) || routeClass[cell] !== 0
    );
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      excludedCellCount += dressingExcluded[cell]!;
      ecologyCounts[ecologyClass[cell]!] += 1;
      routeCounts[routeClass[cell]!] += 1;
      landmarkCounts[landmarkClass[cell]!] += 1;
      ambientCounts[ambientLifeClass[cell]!] += 1;
      if (input.legacyProtectedCell[cell] !== 0 && anyOutputAt(cell)) {
        legacyPreservationViolationCount += 1;
      }
      const regime = input.waterRegime[cell]!;
      const route = routeClass[cell]!;
      if (regime !== WATER_DRY) {
        const validFord = (
          regime === WATER_RIVER || regime === WATER_STREAM
        ) && route === GREATER_REALM_ROUTE_CLASS.FORD;
        if (surfaceOutputAt(cell) || (route !== 0 && !validFord)) {
          waterExclusionViolationCount += 1;
        }
        if (
          route !== GREATER_REALM_ROUTE_CLASS.NONE
          && (regime === WATER_OCEAN || regime === WATER_LAKE || regime === WATER_SEA)
        ) forbiddenWaterRouteViolationCount += 1;
      }
      if (
        route === GREATER_REALM_ROUTE_CLASS.FORD
        && regime !== WATER_RIVER
        && regime !== WATER_STREAM
      ) fordRegimeViolationCount += 1;
      if (
        route === GREATER_REALM_ROUTE_CLASS.FORD
        && (regime === WATER_RIVER || regime === WATER_STREAM)
      ) {
        const banks = oppositeDryFordPair(input, cell);
        if (
          !banks
          || routeClass[banks[0]] === GREATER_REALM_ROUTE_CLASS.NONE
          || routeClass[banks[1]] === GREATER_REALM_ROUTE_CLASS.NONE
        ) fordRegimeViolationCount += 1;
      }
      if (
        route !== GREATER_REALM_ROUTE_CLASS.NONE
        && (input.gateCell[cell] !== 0 || input.gateApproachCell[cell] !== 0)
      ) sealedGateRouteViolationCount += 1;
      if (
        ambientLifeClass[cell] === GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT
        && vegetationDensity[cell]! < 64
      ) rabbitDensityViolationCount += 1;
      if (
        vegetationDensity[cell] !== 0
        && dressingExcluded[cell] === 0
        && hasAdjacentMask(grid, cell, vegetationClearanceMasks)
      ) vegetationReservedClearanceViolationCount += 1;
      if (
        vegetationDensity[cell] !== 0
        && landmarkAtOrAdjacent(grid, landmarkClass, cell)
      ) vegetationLandmarkClearanceViolationCount += 1;
      if (isStrategicReserved(input, cell) && anyOutputAt(cell)) {
        reservedSiteExclusionViolationCount += 1;
      }
      if (
        dressingExcluded[cell] === 0
        && (
          ecologyClass[cell] !== classifyEcology(input, cell)
          || vegetationDensity[cell]! > Math.min(
            ecologyDensityCap(ecologyClass[cell]! as GreaterRealmEcologyClass),
            sourceBiomeDensityCap(input.biomeId[cell]!),
          )
        )
      ) ecologicalCompatibilityViolationCount += 1;
      const landmark = landmarkClass[cell]!;
      if (
        (landmark === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
          || landmark === GREATER_REALM_LANDMARK_CLASS.WAYSTONE
          || landmark === GREATER_REALM_LANDMARK_CLASS.LAMP_POST)
        && !routeAtOrAdjacent(grid, routeClass, cell)
      ) landmarkRouteAdjacencyViolationCount += 1;
      if (landmark === GREATER_REALM_LANDMARK_CLASS.RUINED_WALL) {
        let touchesRuin = false;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (
            neighbor >= 0
            && landmarkClass[neighbor] === GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN
          ) {
            touchesRuin = true;
            break;
          }
        }
        if (!touchesRuin) orphanedRuinWallCount += 1;
      }
      if (!ambientClassCompatible(
        grid,
        ecologyClass,
        vegetationDensity,
        routeClass,
        landmarkClass,
        cell,
        ambientLifeClass[cell]! as GreaterRealmAmbientLifeClass,
      )) ambientConstraintViolationCount += 1;
    }

    let minimumLandmarkAnchorSpacing = grid.cellCount + 1;
    let landmarkSpacingViolationCount = 0;
    for (let first = 0; first < anchors.length; first += 1) {
      for (let second = first + 1; second < anchors.length; second += 1) {
        const firstAnchor = anchors[first]!;
        const secondAnchor = anchors[second]!;
        const distance = axialDistance(
          grid.q[firstAnchor.cell]!,
          grid.r[firstAnchor.cell]!,
          grid.q[secondAnchor.cell]!,
          grid.r[secondAnchor.cell]!,
        );
        minimumLandmarkAnchorSpacing = Math.min(minimumLandmarkAnchorSpacing, distance);
        if (distance < minimumAnchorSpacing(
          firstAnchor.landmarkClass,
          secondAnchor.landmarkClass,
        )) landmarkSpacingViolationCount += 1;
      }
    }
    if (anchors.length < 2) minimumLandmarkAnchorSpacing = 0;
    const dressingEligibleCellCount = grid.cellCount - excludedCellCount;
    const eligibleLandVegetatedBasisPoints = dressingEligibleCellCount === 0
      ? 0
      : roundedDivide(
        vegetationMetrics.vegetatedCellCount * BASIS_POINTS,
        dressingEligibleCellCount,
      );

    const metrics: GreaterRealmLivingWorldMetrics = Object.freeze({
      cellCount: grid.cellCount,
      excludedCellCount,
      dressingEligibleCellCount,
      ecologyCellCounts: Object.freeze({
        plains: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.PLAINS]!,
        forest: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.FOREST]!,
        taiga: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.TAIGA]!,
        jungle: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.JUNGLE]!,
        swamp: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.SWAMP]!,
        savanna: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.SAVANNA]!,
        desert: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.DESERT]!,
        alpine: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.ALPINE]!,
        snow: ecologyCounts[GREATER_REALM_ECOLOGY_CLASS.SNOW]!,
      }),
      vegetatedCellCount: vegetationMetrics.vegetatedCellCount,
      vegetatedBasisPoints: grid.cellCount === 0
        ? 0
        : roundedDivide(vegetationMetrics.vegetatedCellCount * BASIS_POINTS, grid.cellCount),
      vegetationPatchCount: vegetationMetrics.patchCount,
      minimumVegetationPatchSize: vegetationMetrics.minimumPatchSize,
      isolatedVegetationCellCount: vegetationMetrics.isolatedCellCount,
      smallVegetationPatchCellCount: vegetationMetrics.smallPatchCellCount,
      routeCellCounts: Object.freeze({
        track: routeCounts[GREATER_REALM_ROUTE_CLASS.TRACK]!,
        road: routeCounts[GREATER_REALM_ROUTE_CLASS.ROAD]!,
        carriageway: routeCounts[GREATER_REALM_ROUTE_CLASS.CARRIAGEWAY]!,
        ford: routeCounts[GREATER_REALM_ROUTE_CLASS.FORD]!,
      }),
      landmarkCellCounts: Object.freeze({
        abandonedRuin: landmarkCounts[GREATER_REALM_LANDMARK_CLASS.ABANDONED_RUIN]!,
        ruinedWall: landmarkCounts[GREATER_REALM_LANDMARK_CLASS.RUINED_WALL]!,
        waystone: landmarkCounts[GREATER_REALM_LANDMARK_CLASS.WAYSTONE]!,
        lampPost: landmarkCounts[GREATER_REALM_LANDMARK_CLASS.LAMP_POST]!,
      }),
      ambientLifeCellCounts: Object.freeze({
        rabbitHabitat: ambientCounts[GREATER_REALM_AMBIENT_LIFE_CLASS.RABBIT_HABITAT]!,
        civilianFootfall: ambientCounts[GREATER_REALM_AMBIENT_LIFE_CLASS.CIVILIAN_FOOTFALL]!,
        guardPost: ambientCounts[GREATER_REALM_AMBIENT_LIFE_CLASS.GUARD_POST]!,
        courierRoute: ambientCounts[GREATER_REALM_AMBIENT_LIFE_CLASS.COURIER_ROUTE]!,
        exoticCourierRoute:
          ambientCounts[GREATER_REALM_AMBIENT_LIFE_CLASS.EXOTIC_COURIER_ROUTE]!,
      }),
      minimumLandmarkAnchorSpacing,
      eligibleLandVegetatedBasisPoints,
      eligibleLandOpenBasisPoints: BASIS_POINTS - eligibleLandVegetatedBasisPoints,
      requiredRouteAnchorCount: routeEvidence.requiredRouteAnchorCount,
      coveredRouteAnchorCount: routeEvidence.coveredRouteAnchorCount,
      uncoveredRouteAnchorCount: routeEvidence.uncoveredRouteAnchorCount,
      unreachableMandatorySiteCount: routeEvidence.unreachableMandatorySiteCount,
      gateApproachComponentCount: routeEvidence.gateApproachComponentCount,
      supportedGateApproachComponentCount:
        routeEvidence.supportedGateApproachComponentCount,
      unsupportedGateApproachComponentCount:
        routeEvidence.unsupportedGateApproachComponentCount,
      routeComponentCount: connectivity.routeComponentCount,
      anchorBearingRouteComponentCount: connectivity.anchorBearingRouteComponentCount,
      anchorlessRouteComponentCount: connectivity.anchorlessRouteComponentCount,
      fordCellCount: routeCounts[GREATER_REALM_ROUTE_CLASS.FORD]!,
      forbiddenWaterRouteViolationCount,
      fordRegimeViolationCount,
      sealedGateRouteViolationCount,
      courierDisconnectedRouteViolationCount:
        connectivity.courierDisconnectedRouteViolationCount,
      rabbitDensityViolationCount,
      vegetationReservedClearanceViolationCount,
      vegetationLandmarkClearanceViolationCount,
      legacyPreservationViolationCount,
      waterExclusionViolationCount,
      reservedSiteExclusionViolationCount,
      ecologicalCompatibilityViolationCount,
      landmarkSpacingViolationCount,
      landmarkRouteAdjacencyViolationCount,
      orphanedRuinWallCount,
      ambientConstraintViolationCount,
      layoutFingerprint: layoutFingerprint([
        dressingExcluded,
        ecologyClass,
        vegetationDensity,
        routeClass,
        landmarkClass,
        ambientLifeClass,
      ]),
    });
    const invariants: GreaterRealmLivingWorldInvariants = Object.freeze({
      legacyProtectedCellsPreserved: legacyPreservationViolationCount === 0,
      waterExcluded: waterExclusionViolationCount === 0,
      reservedSitesExcluded: reservedSiteExclusionViolationCount === 0,
      ecologiesCompatible: ecologicalCompatibilityViolationCount === 0,
      vegetationNaturallyClustered:
        vegetationMetrics.isolatedCellCount === 0
        && vegetationMetrics.smallPatchCellCount === 0,
      landmarksSpaced: landmarkSpacingViolationCount === 0,
      landmarksRouteAdjacent: landmarkRouteAdjacencyViolationCount === 0,
      ruinWallsAnchored: orphanedRuinWallCount === 0,
      ambientLifeCompatible: ambientConstraintViolationCount === 0,
      requiredRouteAnchorsCovered:
        routeEvidence.requiredRouteAnchorCount > 0
        && routeEvidence.uncoveredRouteAnchorCount === 0,
      mandatoryRouteAnchorsReachable:
        routeEvidence.unreachableMandatorySiteCount === 0,
      gateApproachesSupported:
        routeEvidence.gateApproachComponentCount > 0
        && routeEvidence.unsupportedGateApproachComponentCount === 0,
      everyRouteComponentAnchorBearing:
        connectivity.routeComponentCount > 0
        && connectivity.anchorlessRouteComponentCount === 0
        && connectivity.anchorBearingRouteComponentCount === connectivity.routeComponentCount,
      fordsPresentAndValid:
        routeCounts[GREATER_REALM_ROUTE_CLASS.FORD]! > 0
        && forbiddenWaterRouteViolationCount === 0
        && fordRegimeViolationCount === 0,
      sealedGateEndpointsClear: sealedGateRouteViolationCount === 0,
      couriersUseConnectedRoutes:
        connectivity.courierDisconnectedRouteViolationCount === 0,
      rabbitHabitatVegetated: rabbitDensityViolationCount === 0,
      vegetationClearancesPreserved:
        vegetationReservedClearanceViolationCount === 0
        && vegetationLandmarkClearanceViolationCount === 0,
    });
    const authority = Object.freeze({
      version: GREATER_REALM_LIVING_WORLD_VERSION,
      dressingExcluded,
      ecologyClass,
      vegetationDensity,
      routeClass,
      landmarkClass,
      ambientLifeClass,
      metrics,
      invariants,
    });
    completed = true;
    return authority;
  } finally {
    seedCopy.fill(0);
    routeEvidence?.routeAnchorCell.fill(0);
    vegetationBroad?.fill(0);
    vegetationDetail?.fill(0);
    for (const anchor of anchors) {
      anchor.cell = 0;
      anchor.landmarkClass = GREATER_REALM_LANDMARK_CLASS.NONE;
    }
    for (const bucket of landmarkSpatialIndex.values()) bucket.length = 0;
    landmarkSpatialIndex.clear();
    anchors.length = 0;
    if (!completed) {
      dressingExcluded.fill(0);
      ecologyClass.fill(0);
      vegetationDensity.fill(0);
      routeClass.fill(0);
      landmarkClass.fill(0);
      ambientLifeClass.fill(0);
    }
  }
}

export function clearGreaterRealmLivingWorldAuthority(
  authority: GreaterRealmLivingWorldAuthority,
): void {
  authority.dressingExcluded.fill(0);
  authority.ecologyClass.fill(0);
  authority.vegetationDensity.fill(0);
  authority.routeClass.fill(0);
  authority.landmarkClass.fill(0);
  authority.ambientLifeClass.fill(0);
}
