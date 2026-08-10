import {
  GREATER_REALM_BIOME_CLASS_COUNT,
  GREATER_REALM_BIOME_ID,
  GREATER_REALM_LANDFORM_ID,
} from './greater-realm-biomes';
import { GREATER_REALM_WATER_REGIME_ID } from './greater-realm-hydrology-authority';
import {
  type IndexedAxialGrid,
} from './greater-realm-terrain';

const NEIGHBOR_COUNT = 6;
const WATER_DRY = GREATER_REALM_WATER_REGIME_ID.DRY;
const WATER_OCEAN = GREATER_REALM_WATER_REGIME_ID.OCEAN;
const WATER_LAKE = GREATER_REALM_WATER_REGIME_ID.LAKE;
const WATER_RIVER = GREATER_REALM_WATER_REGIME_ID.RIVER;
const WATER_STREAM = GREATER_REALM_WATER_REGIME_ID.STREAM;
const WATER_SEA = GREATER_REALM_WATER_REGIME_ID.SEA;
const WATER_MARSH = GREATER_REALM_WATER_REGIME_ID.MARSH;
const MINIMUM_GENERATED_FOREST_PATCH_CELLS = 28;
const PHYSICALLY_ARID_MOISTURE_THRESHOLD = -1_200;
const PHYSICALLY_SATURATED_MOISTURE_THRESHOLD = 5_000;
const WARM_DEEP_LEE_MOISTURE_THRESHOLD = -2_200;
const WARM_DEEP_LEE_TEMPERATURE_THRESHOLD = 5_500;
const PHYSICALLY_FROZEN_TEMPERATURE_THRESHOLD = 500;
const PHYSICALLY_COLD_TEMPERATURE_THRESHOLD = 2_000;
// Preserve the existing pair-count layout and its deterministic tie scan.
const LANDFORM_PAIR_STRIDE = 32;
const BIOME = GREATER_REALM_BIOME_ID;
const LANDFORM = GREATER_REALM_LANDFORM_ID;

export type GreaterRealmTopographyMetrics = Readonly<{
  elevationMinimum: number;
  elevationMaximum: number;
  slopeP50: number;
  slopeP95: number;
  ridgeCells: number;
  plateauCells: number;
  basinCells: number;
  coastCells: number;
}>;

export type GreaterRealmBiomeMetrics = Readonly<{
  visualBiomeClassCount: number;
  minimumRegionVisualBiomeClassCount: number;
  minimumTierIVisualBiomeClassCount: number;
  minimumTierIIVisualBiomeClassCount: number;
  tierIIIVisualBiomeClassCount: number;
  minimumTierIMajorVisualBiomeClassCount: number;
  minimumTierITransitionVisualBiomeClassCount: number;
  minimumTierIIMajorVisualBiomeClassCount: number;
  tierIIIMajorVisualBiomeClassCount: number;
  maximumTierISingleBiomeShareBasisPoints: number;
  incompatibleVisualBiomeAdjacencyCount: number;
  incompatibleBiomeLandformPairCount: number;
}>;

export type GreaterRealmDerivedTopography = Readonly<{
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
  biomeId: Uint8Array;
  landformId: Uint8Array;
  topographyMetrics: GreaterRealmTopographyMetrics;
  biomeMetrics: GreaterRealmBiomeMetrics;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function assertLengths(grid: IndexedAxialGrid, fields: readonly ArrayLike<unknown>[]): void {
  if (fields.some(field => field.length !== grid.cellCount)) {
    fail('GREATER_REALM_TOPOGRAPHY_INPUT_LENGTH_INVALID');
  }
}

function distanceFromMask(grid: IndexedAxialGrid, starts: Uint8Array): Uint16Array {
  const distance = new Uint16Array(grid.cellCount);
  distance.fill(0xffff);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (starts[cell] !== 1) continue;
    distance[cell] = 0;
    queue[tail++] = cell;
  }
  if (tail === 0) fail('GREATER_REALM_TOPOGRAPHY_DISTANCE_SOURCE_MISSING');
  while (head < tail) {
    const cell = queue[head++]!;
    const nextDistance = distance[cell]! + 1;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || distance[neighbor]! <= nextDistance) continue;
      distance[neighbor] = nextDistance;
      queue[tail++] = neighbor;
    }
  }
  return distance;
}

function watershedIds(grid: IndexedAxialGrid, receiver: Int32Array): Int32Array {
  const rootByCell = new Int32Array(grid.cellCount);
  rootByCell.fill(-2);
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (rootByCell[start] >= 0) continue;
    const chain: number[] = [];
    let cursor = start;
    while (rootByCell[cursor] === -2) {
      rootByCell[cursor] = -3;
      chain.push(cursor);
      const downstream = receiver[cursor]!;
      if (downstream === -1) break;
      if (downstream < 0 || downstream >= grid.cellCount) {
        fail('GREATER_REALM_TOPOGRAPHY_FLOW_INVALID');
      }
      cursor = downstream;
    }
    if (rootByCell[cursor] === -3 && chain.at(-1) !== cursor) {
      fail('GREATER_REALM_TOPOGRAPHY_FLOW_CYCLE');
    }
    const root = receiver[cursor] === -1
      ? cursor
      : rootByCell[cursor]!;
    if (root < 0) fail('GREATER_REALM_TOPOGRAPHY_FLOW_CYCLE');
    for (const cell of chain) rootByCell[cell] = root;
  }
  const rootSet = new Set<number>();
  for (const root of rootByCell) rootSet.add(root);
  const roots = [...rootSet].sort((first, second) => first - second);
  const idByRoot = new Map(roots.map((root, index) => [root, index + 1] as const));
  const result = new Int32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    result[cell] = idByRoot.get(rootByCell[cell]!) ?? 0;
  }
  return result;
}

function connectedRidgeIds(grid: IndexedAxialGrid, ridgeMask: Uint8Array): Int32Array {
  const result = new Int32Array(grid.cellCount);
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let nextId = 1;
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (ridgeMask[start] !== 1 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    const cells: number[] = [];
    while (head < tail) {
      const cell = queue[head++]!;
      cells.push(cell);
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || ridgeMask[neighbor] !== 1 || seen[neighbor] === 1) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (cells.length < 8) continue;
    for (const cell of cells) result[cell] = nextId;
    nextId += 1;
  }
  return result;
}

function percentile(sorted: readonly number[], basisPoints: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.floor(((sorted.length - 1) * basisPoints) / 10_000)]!;
}

// A biome and its landform are one visual classification. Keeping the allowed
// pairs explicit makes it possible to prove that smoothing did not create a
// combination which no classifier branch can emit. The additional Lowlands
// pairs are the frozen legacy surface vocabulary and must remain valid even
// when the surrounding continent evolves.
const DRY_LANDFORMS_BY_BIOME: Readonly<Record<number, ReadonlySet<number>>> = Object.freeze({
  [BIOME.TEMPERATE_LOWLAND]: new Set([LANDFORM.LOWLAND, LANDFORM.ROLLING_LOWLAND]),
  [BIOME.FLOWER_MEADOW]: new Set([LANDFORM.LOWLAND, LANDFORM.HILL]),
  [BIOME.OAK_FOREST]: new Set([LANDFORM.FLOODPLAIN]),
  [BIOME.OLD_GROWTH_FOREST]: new Set([LANDFORM.LOWLAND, LANDFORM.HILL]),
  [BIOME.PINE_FOREST]: new Set([LANDFORM.FLOODPLAIN, LANDFORM.LOWLAND, LANDFORM.HILL, LANDFORM.GLACIAL_VALLEY]),
  [BIOME.ALPINE_SNOW]: new Set([LANDFORM.MOUNTAIN, LANDFORM.ALPINE_PLATEAU]),
  [BIOME.TUNDRA]: new Set([LANDFORM.HIGHLAND, LANDFORM.MOUNTAIN, LANDFORM.ALPINE_PLATEAU]),
  [BIOME.HEATHLAND]: new Set([LANDFORM.LOWLAND, LANDFORM.ROLLING_LOWLAND, LANDFORM.ALPINE_PLATEAU]),
  [BIOME.SAVANNA]: new Set([LANDFORM.LOWLAND, LANDFORM.ROLLING_LOWLAND]),
  [BIOME.WARM_SCRUB]: new Set([LANDFORM.LOWLAND, LANDFORM.ROLLING_LOWLAND]),
  [BIOME.DUNE_DESERT]: new Set([LANDFORM.BADLANDS, LANDFORM.DUNE]),
  [BIOME.ROCKY_DESERT]: new Set([LANDFORM.HIGHLAND, LANDFORM.BADLANDS, LANDFORM.DUNE]),
  [BIOME.RED_BADLANDS]: new Set([LANDFORM.BADLANDS]),
  [BIOME.VOLCANIC_UPLAND]: new Set([LANDFORM.MOUNTAIN, LANDFORM.BASIN]),
  [BIOME.ASH_MEADOW]: new Set([LANDFORM.LOWLAND, LANDFORM.ROLLING_LOWLAND, LANDFORM.MOUNTAIN, LANDFORM.BASIN]),
  [BIOME.FRESHWATER_MARSH]: new Set([LANDFORM.BASIN]),
  [BIOME.SALT_MARSH]: new Set([LANDFORM.BASIN]),
  [BIOME.RIVER_DELTA]: new Set([LANDFORM.DELTA]),
  [BIOME.ROCKY_HIGHLAND]: new Set([LANDFORM.HILL, LANDFORM.HIGHLAND, LANDFORM.MOUNTAIN]),
  [BIOME.COASTAL]: new Set([LANDFORM.COASTAL_PLAIN, LANDFORM.SEA_CLIFF]),
});

function isCompatibleBiomeLandformPair(
  waterRegime: number,
  biome: number,
  landform: number,
): boolean {
  if (waterRegime === WATER_OCEAN || waterRegime === WATER_SEA) {
    return biome === BIOME.SALTWATER && landform === LANDFORM.ISLAND_SHELF;
  }
  if (waterRegime === WATER_LAKE) return biome === BIOME.LAKE && landform === LANDFORM.LAKE_BASIN;
  if (waterRegime === WATER_RIVER || waterRegime === WATER_STREAM) {
    return biome === BIOME.RIVER_STREAM && landform === LANDFORM.WATERCOURSE;
  }
  if (waterRegime === WATER_MARSH) {
    return (
      biome === BIOME.FRESHWATER_MARSH || biome === BIOME.SALT_MARSH
    ) && landform === LANDFORM.BASIN;
  }
  if (waterRegime !== WATER_DRY) return false;
  return DRY_LANDFORMS_BY_BIOME[biome]?.has(landform) === true;
}

function isPhysicallyExtremeClimate(moisture: number, temperature: number): boolean {
  return (
    moisture < PHYSICALLY_ARID_MOISTURE_THRESHOLD
    || temperature < PHYSICALLY_FROZEN_TEMPERATURE_THRESHOLD
  );
}

function isBiomeCompatibleWithPhysicalClimate(
  biome: number,
  moisture: number,
  temperature: number,
): boolean {
  const aridVisual = (
    biome === BIOME.DUNE_DESERT
    || biome === BIOME.ROCKY_DESERT
    || biome === BIOME.RED_BADLANDS
  );
  if (aridVisual) return moisture < PHYSICALLY_ARID_MOISTURE_THRESHOLD;
  if (biome === BIOME.ALPINE_SNOW) {
    return temperature < PHYSICALLY_FROZEN_TEMPERATURE_THRESHOLD;
  }
  if (biome === BIOME.TUNDRA) {
    return temperature < PHYSICALLY_COLD_TEMPERATURE_THRESHOLD;
  }
  return true;
}

function consolidateGeneratedForestPatches(input: Readonly<{
  grid: IndexedAxialGrid;
  waterRegime: Uint8Array;
  legacyProtectedCell: Uint8Array;
  biomeId: Uint8Array;
  landformId: Uint8Array;
  distanceToFreshwater: Uint16Array;
  slope: Uint16Array;
  moisture: Int32Array;
  temperature: Int32Array;
  exposure: Int32Array;
}>): void {
  const { grid } = input;
  const forestMask = new Uint8Array(grid.cellCount);
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  try {
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        input.waterRegime[cell] !== WATER_DRY
        || input.legacyProtectedCell[cell] === 1
      ) continue;
      const biome = input.biomeId[cell]!;
      if (
        biome === BIOME.OAK_FOREST
        || biome === BIOME.OLD_GROWTH_FOREST
        || (biome === BIOME.PINE_FOREST && input.landformId[cell] !== LANDFORM.GLACIAL_VALLEY)
      ) forestMask[cell] = 1;
    }

    for (let start = 0; start < grid.cellCount; start += 1) {
      if (forestMask[start] !== 1 || seen[start] === 1) continue;
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
            || forestMask[neighbor] !== 1
            || seen[neighbor] === 1
          ) continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (tail >= MINIMUM_GENERATED_FOREST_PATCH_CELLS) continue;
      for (let offset = 0; offset < tail; offset += 1) {
        const cell = queue[offset]!;
        if (isPhysicallyExtremeClimate(
          input.moisture[cell]!,
          input.temperature[cell]!,
        )) continue;
        if (
          input.distanceToFreshwater[cell]! <= 2
          && input.slope[cell]! < 550
          && input.moisture[cell]! > 800
        ) {
          input.biomeId[cell] = BIOME.FLOWER_MEADOW;
          input.landformId[cell] = input.moisture[cell]! > 1_900 ? LANDFORM.HILL : LANDFORM.LOWLAND;
        } else if (input.exposure[cell]! >= 55) {
          input.biomeId[cell] = BIOME.HEATHLAND;
          input.landformId[cell] = input.slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
        } else {
          input.biomeId[cell] = BIOME.TEMPERATE_LOWLAND;
          input.landformId[cell] = input.slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
        }
      }
    }
  } finally {
    forestMask.fill(0);
    seen.fill(0);
    queue.fill(0);
  }
}

/**
 * Derive private, fixed-point terrain authority after final water routing.
 * These fields are offline candidate evidence; they do not activate runtime
 * topography or expose hidden regions to a client.
 */
export function deriveGreaterRealmTopography(input: Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  flowReceiver: Int32Array;
  flowAccumulation: BigUint64Array;
  waterRegime: Uint8Array;
  geologyId: Uint8Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  regionId: Uint8Array;
  tierId: Uint8Array;
  legacyProtectedCell: Uint8Array;
  protectedBiomeId: Uint8Array;
  protectedLandformId: Uint8Array;
  geomorphicTemperature: Int32Array;
  geomorphicMoisture: Int32Array;
  /** Unsmeared geomorphic climate used for saturation and deep-lee aridity. */
  geomorphicHydrologyMoisture?: Int32Array;
  geomorphicGlacialMask: Uint8Array;
  geomorphicAridMask: Uint8Array;
  geomorphicVolcanicMask: Uint8Array;
  geomorphicCoastalClass: Uint8Array;
}>): GreaterRealmDerivedTopography {
  const {
    grid,
    elevation,
    flowReceiver,
    flowAccumulation,
    waterRegime,
    geologyId,
    tectonicUplift,
    rockResistance,
    regionId,
    tierId,
    legacyProtectedCell,
    protectedBiomeId,
    protectedLandformId,
    geomorphicTemperature,
    geomorphicMoisture,
    geomorphicGlacialMask,
    geomorphicAridMask,
    geomorphicVolcanicMask,
    geomorphicCoastalClass,
  } = input;
  const geomorphicHydrologyMoisture = input.geomorphicHydrologyMoisture
    ?? geomorphicMoisture;
  assertLengths(grid, [
    elevation,
    flowReceiver,
    flowAccumulation,
    waterRegime,
    geologyId,
    tectonicUplift,
    rockResistance,
    regionId,
    tierId,
    legacyProtectedCell,
    protectedBiomeId,
    protectedLandformId,
    geomorphicTemperature,
    geomorphicMoisture,
    geomorphicHydrologyMoisture,
    geomorphicGlacialMask,
    geomorphicAridMask,
    geomorphicVolcanicMask,
    geomorphicCoastalClass,
  ]);

  const coastMask = new Uint8Array(grid.cellCount);
  const saltwaterMask = new Uint8Array(grid.cellCount);
  const freshwaterMask = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] === WATER_OCEAN || waterRegime[cell] === WATER_SEA) {
      saltwaterMask[cell] = 1;
    }
    if (
      waterRegime[cell] === WATER_LAKE
      || waterRegime[cell] === WATER_RIVER
      || waterRegime[cell] === WATER_STREAM
    ) freshwaterMask[cell] = 1;
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY) continue;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && saltwaterMask[neighbor] === 1) {
        coastMask[cell] = 1;
        break;
      }
    }
  }
  const distanceToCoast = distanceFromMask(grid, saltwaterMask);
  const distanceToFreshwater = distanceFromMask(grid, freshwaterMask);
  const slope = new Uint16Array(grid.cellCount);
  const aspect = new Uint8Array(grid.cellCount);
  aspect.fill(6);
  const profileCurvature = new Int32Array(grid.cellCount);
  const planCurvature = new Int32Array(grid.cellCount);
  const wetnessIndex = new Uint16Array(grid.cellCount);
  const exposure = new Int32Array(grid.cellCount);
  const ridgeMask = new Uint8Array(grid.cellCount);
  const landSlopes: number[] = [];
  let plateauCells = 0;
  let basinCells = 0;

  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    let maximumDrop = 0;
    let steepestDirection = 6;
    let neighborSum = 0;
    let neighborCount = 0;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      neighborCount += 1;
      neighborSum += elevation[neighbor]!;
      const drop = elevation[cell]! - elevation[neighbor]!;
      if (drop > maximumDrop || (drop === maximumDrop && direction < steepestDirection)) {
        maximumDrop = drop;
        steepestDirection = direction;
      }
    }
    const meanNeighbor = neighborCount === 0 ? elevation[cell]! : Math.round(neighborSum / neighborCount);
    const maximumAbsoluteDrop = (() => {
      let result = 0;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor >= 0) result = Math.max(result, Math.abs(elevation[cell]! - elevation[neighbor]!));
      }
      return result;
    })();
    slope[cell] = clamp(maximumAbsoluteDrop, 0, 0xffff);
    aspect[cell] = maximumDrop > 0 ? steepestDirection : 6;
    exposure[cell] = clamp(elevation[cell]! - meanNeighbor, -0x7fff_ffff, 0x7fff_ffff);
    planCurvature[cell] = clamp(
      elevation[cell]! * neighborCount - neighborSum,
      -0x7fff_ffff,
      0x7fff_ffff,
    );
    const downstream = flowReceiver[cell]!;
    if (downstream >= 0) {
      const next = flowReceiver[downstream]!;
      const firstGradient = elevation[cell]! - elevation[downstream]!;
      const secondGradient = next < 0 ? 0 : elevation[downstream]! - elevation[next]!;
      profileCurvature[cell] = clamp(
        firstGradient - secondGradient,
        -0x7fff_ffff,
        0x7fff_ffff,
      );
    }
    wetnessIndex[cell] = clamp(
      Math.floor((Number(flowAccumulation[cell]!) * 4_096) / (250 + slope[cell]!)),
      0,
      0xffff,
    );
    if (waterRegime[cell] === WATER_DRY) {
      landSlopes.push(slope[cell]!);
      if (slope[cell]! <= 550 && elevation[cell]! >= 4_000 && exposure[cell]! >= -120) {
        plateauCells += 1;
      }
      if (planCurvature[cell]! < -1_200 && exposure[cell]! < -250) basinCells += 1;
      if (
        elevation[cell]! >= 5_500
        && slope[cell]! >= 900
        && (planCurvature[cell]! > 900 || tectonicUplift[cell]! > 4_000)
      ) ridgeMask[cell] = 1;
    }
  }
  landSlopes.sort((first, second) => first - second);
  const ridgeId = connectedRidgeIds(grid, ridgeMask);
  const watershedId = watershedIds(grid, flowReceiver);

  const temperature = new Int32Array(geomorphicTemperature);
  const moisture = new Int32Array(grid.cellCount);
  const derivedMoistureAt = (base: Int32Array, cell: number): number => clamp(
    base[cell]!
      + Math.max(0, 1_800 - distanceToFreshwater[cell]! * 180)
      + Math.max(0, 1_000 - distanceToCoast[cell]! * 70)
      + Math.min(4_500, wetnessIndex[cell]! * 3),
    -10_000,
    16_000,
  );
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    moisture[cell] = derivedMoistureAt(geomorphicMoisture, cell);
  }

  const biomeId = new Uint8Array(grid.cellCount);
  const landformId = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (legacyProtectedCell[cell] === 1) {
      biomeId[cell] = protectedBiomeId[cell]!;
      landformId[cell] = protectedLandformId[cell]!;
      continue;
    }
    const regime = waterRegime[cell]!;
    if (regime !== WATER_DRY) {
      if (regime === WATER_MARSH) {
        biomeId[cell] = distanceToCoast[cell]! <= 1
          ? BIOME.SALT_MARSH
          : BIOME.FRESHWATER_MARSH;
        landformId[cell] = LANDFORM.BASIN;
        continue;
      }
      const saltwater = regime === WATER_OCEAN || regime === WATER_SEA;
      biomeId[cell] = saltwater ? BIOME.SALTWATER : regime === WATER_LAKE ? BIOME.LAKE : BIOME.RIVER_STREAM;
      landformId[cell] = saltwater ? LANDFORM.ISLAND_SHELF : regime === WATER_LAKE ? LANDFORM.LAKE_BASIN : LANDFORM.WATERCOURSE;
      continue;
    }
    const coastClass = geomorphicCoastalClass[cell]!;
    const cold = temperature[cell]! < PHYSICALLY_COLD_TEMPERATURE_THRESHOLD;
    // Raw process climate remains authoritative at the deepest warm lee-side
    // extremes. Hydrologic proximity can green the broader ecological field,
    // but it must not erase a physically generated arid oasis rim.
    const warmDeepLeeArid = temperature[cell]!
        >= WARM_DEEP_LEE_TEMPERATURE_THRESHOLD
      && geomorphicHydrologyMoisture[cell]!
        <= WARM_DEEP_LEE_MOISTURE_THRESHOLD;
    const arid = moisture[cell]! < PHYSICALLY_ARID_MOISTURE_THRESHOLD
      || warmDeepLeeArid;
    const saturated = derivedMoistureAt(
      geomorphicHydrologyMoisture,
      cell,
    ) > PHYSICALLY_SATURATED_MOISTURE_THRESHOLD
      || wetnessIndex[cell]! > 5_000;
    const high = elevation[cell]! > 13_500;
    const steep = slope[cell]! > 1_500;
    const volcanic = tectonicUplift[cell]! > 6_500
      && geologyId[cell]! % 3 === 0
      && rockResistance[cell]! > 4_000;
    const nearCoast = distanceToCoast[cell]! <= 1;
    const nearFreshwater = distanceToFreshwater[cell]! <= 2;
    const delta = nearCoast && nearFreshwater && flowAccumulation[cell]! >= 96n && slope[cell]! < 700;
    if (coastClass === 3 || delta) {
      biomeId[cell] = BIOME.RIVER_DELTA;
      landformId[cell] = LANDFORM.DELTA;
    } else if (coastClass === 4 || geomorphicGlacialMask[cell] === 1) {
      biomeId[cell] = BIOME.PINE_FOREST;
      landformId[cell] = LANDFORM.GLACIAL_VALLEY;
    } else if (coastClass === 2) {
      biomeId[cell] = BIOME.COASTAL;
      landformId[cell] = LANDFORM.SEA_CLIFF;
    } else if (geomorphicVolcanicMask[cell] === 1) {
      biomeId[cell] = moisture[cell]! < 500 ? BIOME.ASH_MEADOW : BIOME.VOLCANIC_UPLAND;
      landformId[cell] = steep ? LANDFORM.MOUNTAIN : LANDFORM.BASIN;
    } else if (geomorphicAridMask[cell] === 1) {
      biomeId[cell] = slope[cell]! < 500 ? BIOME.DUNE_DESERT : slope[cell]! > 1_400 ? BIOME.RED_BADLANDS : BIOME.ROCKY_DESERT;
      landformId[cell] = slope[cell]! < 500 ? LANDFORM.DUNE : slope[cell]! > 1_400 ? LANDFORM.BADLANDS : LANDFORM.HIGHLAND;
    } else if (cold && high) {
      biomeId[cell] = temperature[cell]! < PHYSICALLY_FROZEN_TEMPERATURE_THRESHOLD
        ? BIOME.ALPINE_SNOW
        : BIOME.TUNDRA;
      landformId[cell] = steep ? LANDFORM.MOUNTAIN : LANDFORM.ALPINE_PLATEAU;
    } else if (volcanic) {
      biomeId[cell] = moisture[cell]! < 500 ? BIOME.ASH_MEADOW : BIOME.VOLCANIC_UPLAND;
      landformId[cell] = steep ? LANDFORM.MOUNTAIN : LANDFORM.BASIN;
    } else if (arid) {
      biomeId[cell] = slope[cell]! < 500 ? BIOME.DUNE_DESERT : slope[cell]! > 1_400 ? BIOME.RED_BADLANDS : BIOME.ROCKY_DESERT;
      landformId[cell] = slope[cell]! < 500 ? LANDFORM.DUNE : slope[cell]! > 1_400 ? LANDFORM.BADLANDS : LANDFORM.HIGHLAND;
    } else if (saturated && nearFreshwater && slope[cell]! < 650) {
      biomeId[cell] = nearCoast ? BIOME.SALT_MARSH : BIOME.FRESHWATER_MARSH;
      landformId[cell] = LANDFORM.BASIN;
    } else if (high || steep) {
      biomeId[cell] = BIOME.ROCKY_HIGHLAND;
      landformId[cell] = high ? LANDFORM.MOUNTAIN : LANDFORM.HIGHLAND;
    } else if (moisture[cell]! > 2_800) {
      // Humid country is not one blanket forest. Temperature and shelter
      // split it into cool forest, sheltered woodland, and open humid country
      // using continuous climate/topography authority rather than region IDs.
      if (temperature[cell]! < 3_500) {
        biomeId[cell] = BIOME.PINE_FOREST;
        landformId[cell] = LANDFORM.HILL;
      } else if (exposure[cell]! < -45) {
        biomeId[cell] = BIOME.OAK_FOREST;
        landformId[cell] = LANDFORM.FLOODPLAIN;
      } else if (exposure[cell]! < 75) {
        // Warm, humid and sheltered connected terrain carries old-growth
        // woodland/rainforest authority. More exposed humid country remains
        // open flower meadow, preserving broad clearings between forest belts.
        biomeId[cell] = BIOME.OLD_GROWTH_FOREST;
        landformId[cell] = exposure[cell]! < 20 ? LANDFORM.LOWLAND : LANDFORM.HILL;
      } else {
        biomeId[cell] = BIOME.FLOWER_MEADOW;
        landformId[cell] = LANDFORM.HILL;
      }
    } else if (temperature[cell]! > 6_500 && moisture[cell]! < 700) {
      biomeId[cell] = moisture[cell]! < -200 ? BIOME.SAVANNA : BIOME.WARM_SCRUB;
      landformId[cell] = slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
    } else if (coastClass === 1 || nearCoast) {
      biomeId[cell] = BIOME.COASTAL;
      landformId[cell] = steep ? LANDFORM.SEA_CLIFF : LANDFORM.COASTAL_PLAIN;
    } else if (
      distanceToFreshwater[cell]! <= 2
      && slope[cell]! < 550
      && moisture[cell]! > 800
    ) {
      // Broad riparian/gallery old-growth follows the actual drainage network
      // without quota-painting forest by strategic region.
      biomeId[cell] = BIOME.OLD_GROWTH_FOREST;
      landformId[cell] = moisture[cell]! > 1_900 ? LANDFORM.HILL : LANDFORM.LOWLAND;
    } else if (moisture[cell]! > 800 && exposure[cell]! < -55) {
      biomeId[cell] = BIOME.OAK_FOREST;
      landformId[cell] = LANDFORM.FLOODPLAIN;
    } else if (moisture[cell]! > 1_900 || wetnessIndex[cell]! > 20) {
      biomeId[cell] = BIOME.FLOWER_MEADOW;
      landformId[cell] = LANDFORM.HILL;
    } else if (
      moisture[cell]! > 800
      && exposure[cell]! >= 170
      && exposure[cell]! < 240
    ) {
      // A narrow, naturally occurring exposed-steppe ecotone supplies visual
      // transition without introducing a synthetic checkerboard field.
      biomeId[cell] = BIOME.WARM_SCRUB;
      landformId[cell] = slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
    } else if (moisture[cell]! > 800 && exposure[cell]! >= 55) {
      biomeId[cell] = BIOME.HEATHLAND;
      landformId[cell] = slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
    } else {
      biomeId[cell] = moisture[cell]! > 800 ? BIOME.TEMPERATE_LOWLAND : BIOME.HEATHLAND;
      landformId[cell] = slope[cell]! < 550 ? LANDFORM.LOWLAND : LANDFORM.ROLLING_LOWLAND;
    }
  }

  // A cold summit directly touching a hot arid process cell is an impossible
  // visual jump. Glacial process cells were already classified as pine forest;
  // soften only ordinary cold/high cells into that cool-forest transition.
  const hotAridBiomes: ReadonlySet<number> = new Set([BIOME.DUNE_DESERT, BIOME.ROCKY_DESERT, BIOME.RED_BADLANDS, BIOME.ASH_MEADOW]);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY || (biomeId[cell] !== BIOME.ALPINE_SNOW && biomeId[cell] !== BIOME.TUNDRA)) continue;
    let touchesHotArid = false;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && hotAridBiomes.has(biomeId[neighbor]!)) {
        touchesHotArid = true;
        break;
      }
    }
    if (touchesHotArid) {
      biomeId[cell] = BIOME.PINE_FOREST;
      landformId[cell] = LANDFORM.HILL;
    }
  }

  const smoothingLocked = (cell: number): boolean => (
    waterRegime[cell] !== WATER_DRY
    || legacyProtectedCell[cell] === 1
    || isPhysicallyExtremeClimate(moisture[cell]!, temperature[cell]!)
    || (
      temperature[cell]! >= WARM_DEEP_LEE_TEMPERATURE_THRESHOLD
      && geomorphicHydrologyMoisture[cell]!
        <= WARM_DEEP_LEE_MOISTURE_THRESHOLD
    )
    || landformId[cell] === LANDFORM.MOUNTAIN
    || landformId[cell] === LANDFORM.BADLANDS
    || landformId[cell] === LANDFORM.DELTA
    || landformId[cell] === LANDFORM.GLACIAL_VALLEY
    || landformId[cell] === LANDFORM.SEA_CLIFF
    || geomorphicGlacialMask[cell] === 1
    || geomorphicAridMask[cell] === 1
    || geomorphicVolcanicMask[cell] === 1
    || geomorphicCoastalClass[cell] !== 0
  );

  const preSmoothingBiomeId = new Uint8Array(biomeId);
  const preSmoothingLandformId = new Uint8Array(landformId);
  let incompatibleBiomeLandformPairCount = 0;
  try {
    // Remove isolated visual speckles without moving water, protected Lowlands,
    // climate extremes, or distinctive geomorphology. Biome and landform move as
    // one pair: smoothing only the biome can synthesize a visual combination
    // which the deterministic classifier itself would never emit.
    for (let pass = 0; pass < 2; pass += 1) {
      const nextBiome = new Uint8Array(biomeId);
      const nextLandform = new Uint8Array(landformId);
      const biomeCounts = new Uint8Array(GREATER_REALM_BIOME_CLASS_COUNT);
      const pairCounts = new Uint8Array(
        GREATER_REALM_BIOME_CLASS_COUNT * LANDFORM_PAIR_STRIDE,
      );
      try {
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (smoothingLocked(cell)) continue;
          // Preserve the established biome-majority rule, then choose the most
          // common compatible landform carried by neighbors of that biome. This
          // prevents a biome split across two valid landforms from disabling the
          // smoothing which would previously have occurred. The two histograms
          // are fixed-size scratch state; reusing them avoids hundreds of
          // thousands of short-lived typed-array allocations on a full candidate.
          biomeCounts.fill(0);
          pairCounts.fill(0);
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            if (neighbor < 0 || waterRegime[neighbor] !== WATER_DRY) continue;
            if (!isCompatibleBiomeLandformPair(
              WATER_DRY,
              biomeId[neighbor]!,
              landformId[neighbor]!,
            )) continue;
            if (!isBiomeCompatibleWithPhysicalClimate(
              biomeId[neighbor]!,
              moisture[cell]!,
              temperature[cell]!,
            )) continue;
            biomeCounts[biomeId[neighbor]!] += 1;
            pairCounts[
              biomeId[neighbor]! * LANDFORM_PAIR_STRIDE + landformId[neighbor]!
            ] += 1;
          }
          let bestBiome = biomeId[cell]!;
          let bestCount = biomeCounts[bestBiome]!;
          for (let biome = 0; biome < biomeCounts.length; biome += 1) {
            if (biomeCounts[biome]! > bestCount) {
              bestBiome = biome;
              bestCount = biomeCounts[biome]!;
            }
          }
          if (bestCount >= 4) {
            let bestLandform = biomeId[cell] === bestBiome ? landformId[cell]! : 0;
            let bestPairCount = biomeId[cell] === bestBiome
              ? pairCounts[bestBiome * LANDFORM_PAIR_STRIDE + bestLandform]!
              : -1;
            for (let landform = 0; landform < LANDFORM_PAIR_STRIDE; landform += 1) {
              const count = pairCounts[bestBiome * LANDFORM_PAIR_STRIDE + landform]!;
              if (count > bestPairCount) {
                bestLandform = landform;
                bestPairCount = count;
              }
            }
            nextBiome[cell] = bestBiome;
            nextLandform[cell] = bestLandform;
          }
        }
        biomeId.set(nextBiome);
        landformId.set(nextLandform);
      } finally {
        nextBiome.fill(0);
        nextLandform.fill(0);
        biomeCounts.fill(0);
        pairCounts.fill(0);
      }
    }

    // Broad forest masses remain, while generated salt-and-pepper woods become
    // meadow/heath transitions. The frozen Lowlands surface is never touched.
    consolidateGeneratedForestPatches({
      grid,
      waterRegime,
      legacyProtectedCell,
      biomeId,
      landformId,
      distanceToFreshwater,
      slope,
      moisture,
      temperature,
      exposure,
    });

    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (!isCompatibleBiomeLandformPair(
        waterRegime[cell]!,
        biomeId[cell]!,
        landformId[cell]!,
      )) incompatibleBiomeLandformPairCount += 1;
      if (
        waterRegime[cell] === WATER_DRY
        && legacyProtectedCell[cell] !== 1
        && isPhysicallyExtremeClimate(moisture[cell]!, temperature[cell]!)
        && (
          biomeId[cell] !== preSmoothingBiomeId[cell]
          || landformId[cell] !== preSmoothingLandformId[cell]
        )
      ) fail('GREATER_REALM_TOPOGRAPHY_CLIMATE_VISUAL_DRIFT');
      if (
        waterRegime[cell] === WATER_DRY
        && legacyProtectedCell[cell] !== 1
        && geomorphicAridMask[cell] !== 1
        && !(
          temperature[cell]! >= WARM_DEEP_LEE_TEMPERATURE_THRESHOLD
          && geomorphicHydrologyMoisture[cell]!
            <= WARM_DEEP_LEE_MOISTURE_THRESHOLD
        )
        && !isBiomeCompatibleWithPhysicalClimate(
          biomeId[cell]!,
          moisture[cell]!,
          temperature[cell]!,
        )
      ) fail('GREATER_REALM_TOPOGRAPHY_CLIMATE_VISUAL_DRIFT');
    }
  } finally {
    preSmoothingBiomeId.fill(0);
    preSmoothingLandformId.fill(0);
  }

  const regionBiomeCounts = Array.from({ length: 10 }, () => new Uint32Array(GREATER_REALM_BIOME_CLASS_COUNT));
  const regionLandCounts = new Uint32Array(10);
  const visualBiomes = new Set<number>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY) continue;
    const region = regionId[cell]!;
    const biome = biomeId[cell]!;
    if (region >= regionBiomeCounts.length || biome >= GREATER_REALM_BIOME_CLASS_COUNT || tierId[cell]! < 1 || tierId[cell]! > 3) {
      fail('GREATER_REALM_TOPOGRAPHY_CLASSIFICATION_INVALID');
    }
    regionBiomeCounts[region]![biome] += 1;
    regionLandCounts[region] += 1;
    visualBiomes.add(biome);
  }
  const perRegionBiomeClasses = regionBiomeCounts.map(counts => (
    [...counts].filter(count => count > 0).length
  ));
  const perRegionMajorBiomeClasses = regionBiomeCounts.map((counts, region) => (
    [...counts].filter(count => (
      regionLandCounts[region]! > 0
      && count * 10_000 >= regionLandCounts[region]! * 500
    )).length
  ));
  const perRegionTransitionBiomeClasses = regionBiomeCounts.map((counts, region) => (
    [...counts].filter(count => (
      regionLandCounts[region]! > 0
      && count * 10_000 >= regionLandCounts[region]! * 50
      && count * 10_000 < regionLandCounts[region]! * 500
    )).length
  ));
  let maximumTierISingleBiomeShareBasisPoints = 0;
  for (let region = 0; region < 6; region += 1) {
    const maximum = Math.max(...regionBiomeCounts[region]!);
    const landCount = regionLandCounts[region]!;
    maximumTierISingleBiomeShareBasisPoints = Math.max(
      maximumTierISingleBiomeShareBasisPoints,
      landCount === 0 ? 10_000 : Math.round((maximum * 10_000) / landCount),
    );
  }
  let ridgeCells = 0;
  for (const id of ridgeId) ridgeCells += id > 0 ? 1 : 0;
  const frozenBiomes: ReadonlySet<number> = new Set([BIOME.ALPINE_SNOW, BIOME.TUNDRA]);
  let incompatibleVisualBiomeAdjacencyCount = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY) continue;
    for (let direction = 0; direction < 3; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || waterRegime[neighbor] !== WATER_DRY) continue;
      if (
        (frozenBiomes.has(biomeId[cell]!) && hotAridBiomes.has(biomeId[neighbor]!))
        || (hotAridBiomes.has(biomeId[cell]!) && frozenBiomes.has(biomeId[neighbor]!))
      ) incompatibleVisualBiomeAdjacencyCount += 1;
    }
  }
  let elevationMinimum = 0x7fff_ffff;
  let elevationMaximum = -0x8000_0000;
  for (const value of elevation) {
    elevationMinimum = Math.min(elevationMinimum, value);
    elevationMaximum = Math.max(elevationMaximum, value);
  }
  return Object.freeze({
    slope,
    aspect,
    profileCurvature,
    planCurvature,
    wetnessIndex,
    exposure,
    distanceToCoast,
    distanceToFreshwater,
    watershedId,
    ridgeId,
    temperature,
    moisture,
    biomeId,
    landformId,
    topographyMetrics: Object.freeze({
      elevationMinimum,
      elevationMaximum,
      slopeP50: percentile(landSlopes, 5_000),
      slopeP95: percentile(landSlopes, 9_500),
      ridgeCells,
      plateauCells,
      basinCells,
      coastCells: coastMask.reduce((total, value) => total + value, 0),
    }),
    biomeMetrics: Object.freeze({
      visualBiomeClassCount: visualBiomes.size,
      minimumRegionVisualBiomeClassCount: Math.min(...perRegionBiomeClasses),
      minimumTierIVisualBiomeClassCount: Math.min(...perRegionBiomeClasses.slice(0, 6)),
      minimumTierIIVisualBiomeClassCount: Math.min(...perRegionBiomeClasses.slice(6, 9)),
      tierIIIVisualBiomeClassCount: perRegionBiomeClasses[9]!,
      minimumTierIMajorVisualBiomeClassCount: Math.min(
        ...perRegionMajorBiomeClasses.slice(0, 6),
      ),
      minimumTierITransitionVisualBiomeClassCount: Math.min(
        ...perRegionTransitionBiomeClasses.slice(0, 6),
      ),
      minimumTierIIMajorVisualBiomeClassCount: Math.min(
        ...perRegionMajorBiomeClasses.slice(6, 9),
      ),
      tierIIIMajorVisualBiomeClassCount: perRegionMajorBiomeClasses[9]!,
      maximumTierISingleBiomeShareBasisPoints,
      incompatibleVisualBiomeAdjacencyCount,
      incompatibleBiomeLandformPairCount,
    }),
  });
}
