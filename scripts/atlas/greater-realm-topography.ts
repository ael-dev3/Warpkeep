import {
  type IndexedAxialGrid,
} from './greater-realm-terrain';

const NEIGHBOR_COUNT = 6;
const WATER_DRY = 0;
const WATER_OCEAN = 1;
const WATER_LAKE = 2;
const WATER_RIVER = 3;
const WATER_STREAM = 4;
const WATER_SEA = 5;
const MINIMUM_GENERATED_FOREST_PATCH_CELLS = 28;

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
  1: new Set([3, 4]),
  2: new Set([3, 5]),
  3: new Set([1]),
  4: new Set([3, 5]),
  5: new Set([1, 3, 5, 15]),
  6: new Set([7, 14]),
  7: new Set([6, 7, 14]),
  8: new Set([3, 4, 14]),
  9: new Set([3, 4]),
  10: new Set([3, 4]),
  11: new Set([9, 13]),
  12: new Set([6, 9, 13]),
  13: new Set([9]),
  14: new Set([7, 12]),
  15: new Set([3, 4, 7, 12]),
  16: new Set([12]),
  17: new Set([12]),
  18: new Set([11]),
  19: new Set([5, 6, 7]),
  23: new Set([0, 17]),
});

function isCompatibleBiomeLandformPair(
  waterRegime: number,
  biome: number,
  landform: number,
): boolean {
  if (waterRegime === WATER_OCEAN || waterRegime === WATER_SEA) {
    return biome === 20 && landform === 16;
  }
  if (waterRegime === WATER_LAKE) return biome === 21 && landform === 10;
  if (waterRegime === WATER_RIVER || waterRegime === WATER_STREAM) {
    return biome === 22 && landform === 2;
  }
  if (waterRegime !== WATER_DRY) return false;
  return DRY_LANDFORMS_BY_BIOME[biome]?.has(landform) === true;
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
        biome === 2
        || biome === 3
        || (biome === 5 && input.landformId[cell] !== 15)
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
        if (
          input.distanceToFreshwater[cell]! <= 2
          && input.slope[cell]! < 550
          && input.moisture[cell]! > 800
        ) {
          input.biomeId[cell] = 4;
          input.landformId[cell] = input.moisture[cell]! > 1_900 ? 5 : 3;
        } else if (input.exposure[cell]! >= 55) {
          input.biomeId[cell] = 8;
          input.landformId[cell] = input.slope[cell]! < 550 ? 3 : 4;
        } else {
          input.biomeId[cell] = 1;
          input.landformId[cell] = input.slope[cell]! < 550 ? 3 : 4;
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
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    moisture[cell] = clamp(
      geomorphicMoisture[cell]!
        + Math.max(0, 1_800 - distanceToFreshwater[cell]! * 180)
        + Math.max(0, 1_000 - distanceToCoast[cell]! * 70)
        + Math.min(4_500, wetnessIndex[cell]! * 3),
      -10_000,
      16_000,
    );
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
      const saltwater = regime === WATER_OCEAN || regime === WATER_SEA;
      biomeId[cell] = saltwater ? 20 : regime === WATER_LAKE ? 21 : 22;
      landformId[cell] = saltwater ? 16 : regime === WATER_LAKE ? 10 : 2;
      continue;
    }
    const coastClass = geomorphicCoastalClass[cell]!;
    const cold = temperature[cell]! < 2_000;
    const arid = moisture[cell]! < -1_200;
    const saturated = moisture[cell]! > 4_300 || wetnessIndex[cell]! > 5_000;
    const high = elevation[cell]! > 13_500;
    const steep = slope[cell]! > 1_500;
    const volcanic = tectonicUplift[cell]! > 6_500
      && geologyId[cell]! % 3 === 0
      && rockResistance[cell]! > 4_000;
    const nearCoast = distanceToCoast[cell]! <= 1;
    const nearFreshwater = distanceToFreshwater[cell]! <= 2;
    const delta = nearCoast && nearFreshwater && flowAccumulation[cell]! >= 96n && slope[cell]! < 700;
    if (coastClass === 3 || delta) {
      biomeId[cell] = 18;
      landformId[cell] = 11;
    } else if (coastClass === 4 || geomorphicGlacialMask[cell] === 1) {
      biomeId[cell] = 5;
      landformId[cell] = 15;
    } else if (coastClass === 2) {
      biomeId[cell] = 23;
      landformId[cell] = 17;
    } else if (geomorphicVolcanicMask[cell] === 1) {
      biomeId[cell] = moisture[cell]! < 500 ? 15 : 14;
      landformId[cell] = steep ? 7 : 12;
    } else if (geomorphicAridMask[cell] === 1) {
      biomeId[cell] = slope[cell]! < 500 ? 11 : slope[cell]! > 1_400 ? 13 : 12;
      landformId[cell] = slope[cell]! < 500 ? 13 : slope[cell]! > 1_400 ? 9 : 6;
    } else if (cold && high) {
      biomeId[cell] = temperature[cell]! < 500 ? 6 : 7;
      landformId[cell] = steep ? 7 : 14;
    } else if (volcanic) {
      biomeId[cell] = moisture[cell]! < 500 ? 15 : 14;
      landformId[cell] = steep ? 7 : 12;
    } else if (arid) {
      biomeId[cell] = slope[cell]! < 500 ? 11 : slope[cell]! > 1_400 ? 13 : 12;
      landformId[cell] = slope[cell]! < 500 ? 13 : slope[cell]! > 1_400 ? 9 : 6;
    } else if (saturated && nearFreshwater && slope[cell]! < 650) {
      biomeId[cell] = nearCoast ? 17 : 16;
      landformId[cell] = 12;
    } else if (high || steep) {
      biomeId[cell] = 19;
      landformId[cell] = high ? 7 : 6;
    } else if (moisture[cell]! > 2_800) {
      // Humid country is not one blanket forest. Temperature and shelter
      // split it into cool forest, sheltered woodland, and open wet forest
      // using continuous climate/topography authority rather than region IDs.
      biomeId[cell] = temperature[cell]! < 3_500 ? 5 : exposure[cell]! < -45 ? 3 : 2;
      landformId[cell] = exposure[cell]! < -45 ? 1 : 5;
    } else if (temperature[cell]! > 6_500 && moisture[cell]! < 700) {
      biomeId[cell] = moisture[cell]! < -200 ? 9 : 10;
      landformId[cell] = slope[cell]! < 550 ? 3 : 4;
    } else if (coastClass === 1 || nearCoast) {
      biomeId[cell] = 23;
      landformId[cell] = steep ? 17 : 0;
    } else if (
      distanceToFreshwater[cell]! <= 2
      && slope[cell]! < 550
      && moisture[cell]! > 800
    ) {
      // Broad riparian meadows follow the actual drainage network. They also
      // break up otherwise dominant mesic plains without quota-painting by
      // strategic region.
      biomeId[cell] = 4;
      landformId[cell] = moisture[cell]! > 1_900 ? 5 : 3;
    } else if (moisture[cell]! > 800 && exposure[cell]! < -55) {
      biomeId[cell] = 3;
      landformId[cell] = 1;
    } else if (moisture[cell]! > 1_900 || wetnessIndex[cell]! > 20) {
      biomeId[cell] = 2;
      landformId[cell] = 5;
    } else if (
      moisture[cell]! > 800
      && exposure[cell]! >= 170
      && exposure[cell]! < 240
    ) {
      // A narrow, naturally occurring exposed-steppe ecotone supplies visual
      // transition without introducing a synthetic checkerboard field.
      biomeId[cell] = 10;
      landformId[cell] = slope[cell]! < 550 ? 3 : 4;
    } else if (moisture[cell]! > 800 && exposure[cell]! >= 55) {
      biomeId[cell] = 8;
      landformId[cell] = slope[cell]! < 550 ? 3 : 4;
    } else {
      biomeId[cell] = moisture[cell]! > 800 ? 1 : 8;
      landformId[cell] = slope[cell]! < 550 ? 3 : 4;
    }
  }

  // A cold summit directly touching a hot arid process cell is an impossible
  // visual jump. Glacial process cells were already classified as biome 5;
  // soften only ordinary cold/high cells into a cool-forest transition.
  const hotAridBiomes = new Set([11, 12, 13, 15]);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY || (biomeId[cell] !== 6 && biomeId[cell] !== 7)) continue;
    let touchesHotArid = false;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor >= 0 && hotAridBiomes.has(biomeId[neighbor]!)) {
        touchesHotArid = true;
        break;
      }
    }
    if (touchesHotArid) {
      biomeId[cell] = 5;
      landformId[cell] = 5;
    }
  }

  const smoothingLocked = (cell: number): boolean => (
    waterRegime[cell] !== WATER_DRY
    || legacyProtectedCell[cell] === 1
    || landformId[cell] === 7
    || landformId[cell] === 9
    || landformId[cell] === 11
    || landformId[cell] === 15
    || landformId[cell] === 17
    || geomorphicGlacialMask[cell] === 1
    || geomorphicAridMask[cell] === 1
    || geomorphicVolcanicMask[cell] === 1
    || geomorphicCoastalClass[cell] !== 0
  );

  // Remove isolated visual speckles without moving water, protected Lowlands,
  // climate extremes, or distinctive geomorphology. Biome and landform move as
  // one pair: smoothing only the biome can synthesize a visual combination
  // which the deterministic classifier itself would never emit.
  for (let pass = 0; pass < 2; pass += 1) {
    const nextBiome = new Uint8Array(biomeId);
    const nextLandform = new Uint8Array(landformId);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (smoothingLocked(cell)) continue;
      // Preserve the established biome-majority rule, then choose the most
      // common compatible landform carried by neighbors of that biome. This
      // prevents a biome split across two valid landforms from disabling the
      // smoothing which would previously have occurred.
      const biomeCounts = new Uint8Array(24);
      const pairCounts = new Uint8Array(24 * 32);
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || waterRegime[neighbor] !== WATER_DRY) continue;
        if (!isCompatibleBiomeLandformPair(
          WATER_DRY,
          biomeId[neighbor]!,
          landformId[neighbor]!,
        )) continue;
        biomeCounts[biomeId[neighbor]!] += 1;
        pairCounts[biomeId[neighbor]! * 32 + landformId[neighbor]!] += 1;
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
          ? pairCounts[bestBiome * 32 + bestLandform]!
          : -1;
        for (let landform = 0; landform < 32; landform += 1) {
          const count = pairCounts[bestBiome * 32 + landform]!;
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
    exposure,
  });

  let incompatibleBiomeLandformPairCount = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (!isCompatibleBiomeLandformPair(
      waterRegime[cell]!,
      biomeId[cell]!,
      landformId[cell]!,
    )) incompatibleBiomeLandformPairCount += 1;
  }

  const regionBiomeCounts = Array.from({ length: 10 }, () => new Uint32Array(24));
  const regionLandCounts = new Uint32Array(10);
  const visualBiomes = new Set<number>();
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (waterRegime[cell] !== WATER_DRY) continue;
    const region = regionId[cell]!;
    const biome = biomeId[cell]!;
    if (region >= regionBiomeCounts.length || biome >= 24 || tierId[cell]! < 1 || tierId[cell]! > 3) {
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
  const frozenBiomes = new Set([6, 7]);
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
