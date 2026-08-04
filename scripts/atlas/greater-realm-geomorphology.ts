import {
  accumulateGreaterRealmSingleFlow,
  createGreaterRealmMultiscaleIntegerField,
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  priorityFloodGreaterRealmHexGrid,
  routeGreaterRealmSingleFlow,
  type GreaterRealmTerrainSeed,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

export const GREATER_REALM_GEOMORPHOLOGY_VERSION =
  'greater-realm-geomorphology-v1' as const;

export const GREATER_REALM_COASTAL_CLASS = Object.freeze({
  none: 0,
  beachShelf: 1,
  seaCliff: 2,
  deltaEstuary: 3,
  glacialFjord: 4,
} as const);

const NEIGHBOR_COUNT = 6;
const DISTANCE_UNREACHABLE = 0xffff;
const MAX_PROCESS_CELL_DELTA = 2_400;
// Four independently conserved/endogenic process deltas may meet at a river
// mouth. The combined ceiling is still small relative to the 60k-height atlas
// range, while avoiding order-dependent clipping that would break budgets.
const MAX_TOTAL_CELL_DELTA = 8_192;
const MIN_GLACIAL_SYSTEM_CELLS = 6;
const MIN_ARID_SYSTEM_CELLS = 8;
const MAX_DEPOSITION_SEARCH_STEPS = 32;

export type GreaterRealmGeomorphologyClimate = Readonly<{
  temperature: Int32Array;
  moisture: Int32Array;
}>;

export type GreaterRealmGeomorphologyProcessMetrics = Readonly<{
  sourceCellCount: number;
  changedCellCount: number;
  systemCount: number;
  minimumSystemCellCount: number;
  erodedMaterialUnits: number;
  depositedMaterialUnits: number;
  exportedMaterialUnits: number;
}>;

export type GreaterRealmGeomorphologyMetrics = Readonly<{
  changedCellCount: number;
  maximumAbsoluteCellDelta: number;
  protectedCellCount: number;
  protectedChangedCellCount: number;
  erodedMaterialUnits: number;
  depositedMaterialUnits: number;
  exportedMaterialUnits: number;
  endogenicUpliftUnits: number;
  aeolianMovedMaterialUnits: number;
  glacialClimateCompatibilityBasisPoints: number;
  aridClimateCompatibilityBasisPoints: number;
  volcanicTectonicCompatibilityBasisPoints: number;
  coastalProximityCompatibilityBasisPoints: number;
  coastalClassCount: number;
  volcanicAnchorCount: number;
  ridgeUpliftAlignmentBasisPoints: number;
  riverValleyAlignmentBasisPoints: number;
  glacial: GreaterRealmGeomorphologyProcessMetrics;
  arid: GreaterRealmGeomorphologyProcessMetrics;
  coastal: GreaterRealmGeomorphologyProcessMetrics;
}>;

export type GreaterRealmGeomorphologyResult = Readonly<{
  elevation: Int32Array;
  temperature: Int32Array;
  moisture: Int32Array;
  totalDelta: Int32Array;
  glacialDelta: Int32Array;
  aridDelta: Int32Array;
  volcanicDelta: Int32Array;
  coastalDelta: Int32Array;
  glacialMask: Uint8Array;
  aridMask: Uint8Array;
  volcanicMask: Uint8Array;
  volcanicAnchorMask: Uint8Array;
  coastalMask: Uint8Array;
  coastalClass: Uint8Array;
  metrics: GreaterRealmGeomorphologyMetrics;
}>;

type PreliminaryHydrology = Readonly<{
  receiver: Int32Array;
  accumulation: BigUint64Array;
}>;

type ComponentMetrics = Readonly<{
  count: number;
  minimum: number;
}>;

type MaterialBudget = Readonly<{
  eroded: number;
  deposited: number;
  exported: number;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function safeAdd(first: number, second: number): number {
  const value = first + second;
  if (!Number.isSafeInteger(value)) fail('GREATER_REALM_GEOMORPHOLOGY_METRIC_OVERFLOW');
  return value;
}

function assertInputs(input: Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  volcanicPotential: Int32Array;
  legacyReserveCell: Uint8Array;
  climate?: GreaterRealmGeomorphologyClimate;
  seaLevel: number;
}>): void {
  const { grid } = input;
  if (!Number.isSafeInteger(input.seaLevel)) {
    fail('GREATER_REALM_GEOMORPHOLOGY_SEA_LEVEL_INVALID');
  }
  for (const field of [
    input.elevation,
    input.tectonicUplift,
    input.rockResistance,
    input.volcanicPotential,
    input.legacyReserveCell,
    input.climate?.temperature,
    input.climate?.moisture,
  ]) {
    if (field !== undefined && field.length !== grid.cellCount) {
      fail('GREATER_REALM_GEOMORPHOLOGY_INPUT_LENGTH_INVALID');
    }
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (input.legacyReserveCell[cell]! > 1) {
      fail('GREATER_REALM_GEOMORPHOLOGY_RESERVE_MASK_INVALID');
    }
    if (
      input.rockResistance[cell]! < 0
      || input.rockResistance[cell]! > 20_000
      || input.volcanicPotential[cell]! < 0
      || input.volcanicPotential[cell]! > 10_000
    ) fail('GREATER_REALM_GEOMORPHOLOGY_GEOLOGY_FIELD_INVALID');
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

function maximumNeighborDrop(grid: IndexedAxialGrid, elevation: Int32Array): Uint16Array {
  const slope = new Uint16Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    let maximum = 0;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      maximum = Math.max(maximum, Math.abs(elevation[cell]! - elevation[neighbor]!));
    }
    slope[cell] = clamp(maximum, 0, 0xffff);
  }
  return slope;
}

function maskDistances(grid: IndexedAxialGrid, starts: Uint8Array): Uint16Array {
  const distance = new Uint16Array(grid.cellCount);
  distance.fill(DISTANCE_UNREACHABLE);
  const queue = new Uint32Array(grid.cellCount);
  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (starts[cell] !== 1) continue;
    distance[cell] = 0;
    queue[tail++] = cell;
  }
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

function componentFilteredMask(
  grid: IndexedAxialGrid,
  candidates: Uint8Array,
  minimumSize: number,
): Readonly<{ mask: Uint8Array; metrics: ComponentMetrics }> {
  const mask = new Uint8Array(grid.cellCount);
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  let count = 0;
  let minimum = Number.POSITIVE_INFINITY;
  for (let start = 0; start < grid.cellCount; start += 1) {
    if (candidates[start] !== 1 || seen[start] === 1) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    seen[start] = 1;
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || candidates[neighbor] !== 1 || seen[neighbor] === 1) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (tail < minimumSize) continue;
    count += 1;
    minimum = Math.min(minimum, tail);
    for (let index = 0; index < tail; index += 1) mask[queue[index]!] = 1;
  }
  return Object.freeze({
    mask,
    metrics: Object.freeze({ count, minimum: count === 0 ? 0 : minimum }),
  });
}

function componentMetrics(grid: IndexedAxialGrid, mask: Uint8Array): ComponentMetrics {
  return componentFilteredMask(grid, mask, 1).metrics;
}

function preliminaryHydrology(
  grid: IndexedAxialGrid,
  elevation: Int32Array,
  seaLevel: number,
): PreliminaryHydrology {
  const outlets: number[] = [];
  const contribution = new Uint32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (elevation[cell]! <= seaLevel) outlets.push(cell);
    else contribution[cell] = 1;
  }
  if (outlets.length === 0) fail('GREATER_REALM_GEOMORPHOLOGY_OCEAN_MISSING');
  const flood = priorityFloodGreaterRealmHexGrid(grid, elevation, outlets);
  const routing = routeGreaterRealmSingleFlow(grid, flood);
  return Object.freeze({
    receiver: routing.receiver,
    accumulation: accumulateGreaterRealmSingleFlow(
      grid,
      flood.filledElevation,
      routing,
      contribution,
    ),
  });
}

function accumulationMagnitude(value: bigint): number {
  let magnitude = 0;
  for (let cursor = value; cursor > 1n; cursor >>= 1n) magnitude += 1;
  return magnitude;
}

function deriveClimate(input: Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  elevation: Int32Array;
  seaLevel: number;
  coastDistance: Uint16Array;
  slope: Uint16Array;
  accumulation: BigUint64Array;
}>): GreaterRealmGeomorphologyClimate {
  const { grid, candidateSeed, elevation, seaLevel, coastDistance, slope, accumulation } = input;
  const equatorOffset = (
    greaterRealmCounterRandomU32(
      candidateSeed,
      greaterRealmTerrainChannelId('geomorphology-equator-offset'),
      0,
      0,
    ) % 41
  ) - 20;
  const temperatureNoise = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'geomorphology-temperature-macro', amplitude: 1_100, smoothingPasses: 12, selfWeight: 3 },
  ]);
  const moistureNoise = createGreaterRealmMultiscaleIntegerField(grid, candidateSeed, [
    { channel: 'geomorphology-moisture-macro', amplitude: 4_800, smoothingPasses: 16, selfWeight: 3 },
    { channel: 'geomorphology-moisture-meso', amplitude: 1_400, smoothingPasses: 4, selfWeight: 2 },
  ]);
  const temperature = new Int32Array(grid.cellCount);
  const moisture = new Int32Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    temperature[cell] = clamp(
      8_500
        - Math.abs(grid.r[cell]! - equatorOffset) * 26
        - Math.floor(Math.max(0, elevation[cell]! - seaLevel) / 5)
        + temperatureNoise[cell]!,
      -8_000,
      12_000,
    );
    const drainage = Math.min(4_200, accumulationMagnitude(accumulation[cell]!) * 360);
    moisture[cell] = clamp(
      moistureNoise[cell]!
        + Math.max(0, 1_500 - coastDistance[cell]! * 90)
        + drainage
        - Math.floor(slope[cell]! / 4),
      -10_000,
      16_000,
    );
  }
  return Object.freeze({ temperature, moisture });
}

function countMask(mask: Uint8Array): number {
  let count = 0;
  for (const value of mask) count += value === 1 ? 1 : 0;
  return count;
}

function changedMask(delta: Int32Array): Uint8Array {
  const mask = new Uint8Array(delta.length);
  for (let cell = 0; cell < delta.length; cell += 1) {
    if (delta[cell] !== 0) mask[cell] = 1;
  }
  return mask;
}

function downstreamDepositionTarget(
  start: number,
  receiver: Int32Array,
  sourceMask: Uint8Array,
  reserveMask: Uint8Array,
): number {
  let cursor = start;
  for (let step = 0; step < MAX_DEPOSITION_SEARCH_STEPS; step += 1) {
    const downstream = receiver[cursor]!;
    if (downstream < 0) return -1;
    cursor = downstream;
    if (sourceMask[cursor] === 0 && reserveMask[cursor] === 0) return cursor;
  }
  return -1;
}

function applyConservedErosion(input: Readonly<{
  erosion: Uint16Array;
  delta: Int32Array;
  receiver: Int32Array;
  sourceMask: Uint8Array;
  reserveMask: Uint8Array;
}>): MaterialBudget {
  let eroded = 0;
  let deposited = 0;
  let exported = 0;
  for (let cell = 0; cell < input.erosion.length; cell += 1) {
    const amount = input.erosion[cell]!;
    if (amount === 0) continue;
    if (input.reserveMask[cell] === 1) fail('GREATER_REALM_GEOMORPHOLOGY_PROTECTED_EDIT');
    input.delta[cell] -= amount;
    eroded = safeAdd(eroded, amount);
    const target = downstreamDepositionTarget(
      cell,
      input.receiver,
      input.sourceMask,
      input.reserveMask,
    );
    if (target < 0) {
      exported = safeAdd(exported, amount);
      continue;
    }
    const capacity = Math.max(0, MAX_PROCESS_CELL_DELTA - input.delta[target]!);
    const placed = Math.min(amount, capacity);
    input.delta[target] += placed;
    deposited = safeAdd(deposited, placed);
    exported = safeAdd(exported, amount - placed);
  }
  if (eroded !== deposited + exported) fail('GREATER_REALM_GEOMORPHOLOGY_MATERIAL_BUDGET_INVALID');
  return Object.freeze({ eroded, deposited, exported });
}

function addErosion(erosion: Uint16Array, cell: number, amount: number): void {
  erosion[cell] = clamp(erosion[cell]! + amount, 0, 900);
}

function glacialProcess(input: Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  seaLevel: number;
  slope: Uint16Array;
  temperature: Int32Array;
  accumulation: BigUint64Array;
  receiver: Int32Array;
  reserveMask: Uint8Array;
}>): Readonly<{
  mask: Uint8Array;
  delta: Int32Array;
  components: ComponentMetrics;
  budget: MaterialBudget;
}> {
  const candidates = new Uint8Array(input.grid.cellCount);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.reserveMask[cell] === 0
      && input.elevation[cell]! > input.seaLevel + 4_500
      && input.temperature[cell]! <= 2_000
      && (input.slope[cell]! >= 450 || input.accumulation[cell]! >= 6n)
    ) candidates[cell] = 1;
  }
  const coherent = componentFilteredMask(input.grid, candidates, MIN_GLACIAL_SYSTEM_CELLS);
  const erosion = new Uint16Array(input.grid.cellCount);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (coherent.mask[cell] !== 1) continue;
    const amount = clamp(
      50 + accumulationMagnitude(input.accumulation[cell]!) * 18
        + Math.floor(input.slope[cell]! / 20),
      50,
      300,
    );
    addErosion(erosion, cell, amount);
    const downstream = input.receiver[cell]!;
    if (downstream < 0) continue;
    let flowDirection = -1;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      if (input.grid.neighbors[cell * NEIGHBOR_COUNT + direction] === downstream) {
        flowDirection = direction;
        break;
      }
    }
    if (flowDirection < 0) continue;
    for (const offset of [2, 4] as const) {
      const lateral = input.grid.neighbors[
        cell * NEIGHBOR_COUNT + ((flowDirection + offset) % NEIGHBOR_COUNT)
      ]!;
      if (lateral >= 0 && coherent.mask[lateral] === 1) {
        addErosion(erosion, lateral, Math.max(20, Math.floor(amount / 3)));
      }
    }
  }
  const delta = new Int32Array(input.grid.cellCount);
  const budget = applyConservedErosion({
    erosion,
    delta,
    receiver: input.receiver,
    sourceMask: coherent.mask,
    reserveMask: input.reserveMask,
  });
  return Object.freeze({ mask: coherent.mask, delta, components: coherent.metrics, budget });
}

function aridProcess(input: Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  elevation: Int32Array;
  seaLevel: number;
  slope: Uint16Array;
  temperature: Int32Array;
  moisture: Int32Array;
  accumulation: BigUint64Array;
  receiver: Int32Array;
  rockResistance: Int32Array;
  reserveMask: Uint8Array;
}>): Readonly<{
  mask: Uint8Array;
  delta: Int32Array;
  components: ComponentMetrics;
  budget: MaterialBudget;
  aeolianMovedMaterialUnits: number;
}> {
  const candidates = new Uint8Array(input.grid.cellCount);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.reserveMask[cell] === 0
      && input.elevation[cell]! > input.seaLevel
      && input.temperature[cell]! >= 5_500
      && input.moisture[cell]! <= -1_000
    ) candidates[cell] = 1;
  }
  const coherent = componentFilteredMask(input.grid, candidates, MIN_ARID_SYSTEM_CELLS);
  const erosion = new Uint16Array(input.grid.cellCount);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (coherent.mask[cell] !== 1) continue;
    const discharge = accumulationMagnitude(input.accumulation[cell]!);
    const differentialWeathering = Math.max(0, 7_000 - input.rockResistance[cell]!);
    if (input.accumulation[cell]! >= 4n || input.slope[cell]! >= 320 || differentialWeathering > 1_500) {
      addErosion(erosion, cell, clamp(
        25 + discharge * 16 + Math.floor(input.slope[cell]! / 28)
          + Math.floor(differentialWeathering / 90),
        25,
        240,
      ));
    }
  }
  const delta = new Int32Array(input.grid.cellCount);
  const budget = applyConservedErosion({
    erosion,
    delta,
    receiver: input.receiver,
    sourceMask: coherent.mask,
    reserveMask: input.reserveMask,
  });
  const duneChannel = greaterRealmTerrainChannelId('geomorphology-aeolian-dunes');
  const windDirection = greaterRealmCounterRandomU32(
    input.candidateSeed,
    duneChannel,
    0,
    0,
  ) % NEIGHBOR_COUNT;
  let aeolianMovedMaterialUnits = 0;
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      coherent.mask[cell] !== 1
      || input.slope[cell]! > 550
      || input.accumulation[cell]! > 6n
    ) continue;
    const random = greaterRealmCounterRandomU32(
      input.candidateSeed,
      duneChannel,
      input.grid.q[cell]!,
      input.grid.r[cell]!,
      1,
    );
    if (random % 5 !== 0) continue;
    const target = input.grid.neighbors[cell * NEIGHBOR_COUNT + windDirection]!;
    if (target <= cell || target < 0 || coherent.mask[target] !== 1) continue;
    const wanted = 30 + (random % 51);
    const sourceCapacity = MAX_PROCESS_CELL_DELTA + delta[cell]!;
    const targetCapacity = MAX_PROCESS_CELL_DELTA - delta[target]!;
    const moved = Math.max(0, Math.min(wanted, sourceCapacity, targetCapacity));
    if (moved === 0) continue;
    delta[cell] -= moved;
    delta[target] += moved;
    aeolianMovedMaterialUnits = safeAdd(aeolianMovedMaterialUnits, moved);
  }
  return Object.freeze({
    mask: coherent.mask,
    delta,
    components: coherent.metrics,
    budget,
    aeolianMovedMaterialUnits,
  });
}

function volcanicProcess(input: Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  elevation: Int32Array;
  seaLevel: number;
  tectonicUplift: Int32Array;
  volcanicPotential: Int32Array;
  reserveMask: Uint8Array;
}>): Readonly<{
  mask: Uint8Array;
  anchorMask: Uint8Array;
  delta: Int32Array;
  anchorCount: number;
  upliftUnits: number;
}> {
  const channel = greaterRealmTerrainChannelId('geomorphology-volcanic-centers');
  const candidates: Array<Readonly<{ cell: number; score: number }>> = [];
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.reserveMask[cell] === 1
      || input.elevation[cell]! <= input.seaLevel
      || input.volcanicPotential[cell]! < 7_000
      || input.tectonicUplift[cell]! < 2_500
    ) continue;
    let localMaximum = true;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && (
          input.volcanicPotential[neighbor]! > input.volcanicPotential[cell]!
          || (
            input.volcanicPotential[neighbor] === input.volcanicPotential[cell]
            && neighbor < cell
          )
        )
      ) {
        localMaximum = false;
        break;
      }
    }
    if (!localMaximum) continue;
    candidates.push(Object.freeze({
      cell,
      score: input.volcanicPotential[cell]! * 4
        + input.tectonicUplift[cell]!
        + (greaterRealmCounterRandomU32(
          input.candidateSeed,
          channel,
          input.grid.q[cell]!,
          input.grid.r[cell]!,
        ) % 501),
    }));
  }
  candidates.sort((first, second) => second.score - first.score || first.cell - second.cell);
  const maximumAnchors = clamp(Math.floor(input.grid.cellCount / 25_000) + 2, 2, 8);
  const anchors: number[] = [];
  for (const candidate of candidates) {
    if (anchors.some(anchor => axialDistance(
      input.grid.q[candidate.cell]!,
      input.grid.r[candidate.cell]!,
      input.grid.q[anchor]!,
      input.grid.r[anchor]!,
    ) < 14)) continue;
    anchors.push(candidate.cell);
    if (anchors.length >= maximumAnchors) break;
  }
  const delta = new Int32Array(input.grid.cellCount);
  const anchorMask = new Uint8Array(input.grid.cellCount);
  for (const anchor of anchors) {
    anchorMask[anchor] = 1;
    const random = greaterRealmCounterRandomU32(
      input.candidateSeed,
      channel,
      input.grid.q[anchor]!,
      input.grid.r[anchor]!,
      1,
    );
    const radius = 4 + (random % 4);
    const peak = 800 + (random % 801);
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.reserveMask[cell] === 1 || input.elevation[cell]! <= input.seaLevel) continue;
      const distance = axialDistance(
        input.grid.q[cell]!,
        input.grid.r[cell]!,
        input.grid.q[anchor]!,
        input.grid.r[anchor]!,
      );
      if (distance > radius) continue;
      let uplift = Math.floor((peak * (radius - distance + 1)) / (radius + 1));
      if (distance === 0) uplift = Math.max(80, Math.floor(uplift / 3));
      else if (distance === 1) uplift = Math.max(60, Math.floor(uplift / 2));
      delta[cell] = Math.min(MAX_PROCESS_CELL_DELTA, delta[cell]! + uplift);
    }
  }
  const mask = changedMask(delta);
  let upliftUnits = 0;
  for (const value of delta) upliftUnits = safeAdd(upliftUnits, Math.max(0, value));
  return Object.freeze({
    mask,
    anchorMask,
    delta,
    anchorCount: anchors.length,
    upliftUnits,
  });
}

function coastalProcess(input: Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  seaLevel: number;
  slope: Uint16Array;
  temperature: Int32Array;
  accumulation: BigUint64Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  glacialMask: Uint8Array;
  reserveMask: Uint8Array;
}>): Readonly<{
  mask: Uint8Array;
  coastalClass: Uint8Array;
  delta: Int32Array;
  sourceMask: Uint8Array;
  components: ComponentMetrics;
  classCount: number;
  budget: MaterialBudget;
}> {
  const glacialDistance = maskDistances(input.grid, input.glacialMask);
  const sourceMask = new Uint8Array(input.grid.cellCount);
  const coastalClass = new Uint8Array(input.grid.cellCount);
  const delta = new Int32Array(input.grid.cellCount);
  let eroded = 0;
  let deposited = 0;
  let exported = 0;
  const classes = new Set<number>();
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (input.reserveMask[cell] === 1 || input.elevation[cell]! <= input.seaLevel) continue;
    const seaNeighbors: number[] = [];
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (
        neighbor >= 0
        && input.reserveMask[neighbor] === 0
        && input.elevation[neighbor]! <= input.seaLevel
      ) seaNeighbors.push(neighbor);
    }
    if (seaNeighbors.length === 0) continue;
    sourceMask[cell] = 1;
    let classification: number;
    if (
      glacialDistance[cell]! <= 4
      && input.temperature[cell]! <= 2_000
      && input.slope[cell]! >= 500
    ) classification = GREATER_REALM_COASTAL_CLASS.glacialFjord;
    else if (input.accumulation[cell]! >= 16n && input.slope[cell]! <= 1_200) {
      classification = GREATER_REALM_COASTAL_CLASS.deltaEstuary;
    } else if (
      input.rockResistance[cell]! >= 6_000
      && (input.tectonicUplift[cell]! >= 2_500 || input.slope[cell]! >= 900)
    ) classification = GREATER_REALM_COASTAL_CLASS.seaCliff;
    else classification = GREATER_REALM_COASTAL_CLASS.beachShelf;
    coastalClass[cell] = classification;
    classes.add(classification);
    const amount = classification === GREATER_REALM_COASTAL_CLASS.glacialFjord ? 160
      : classification === GREATER_REALM_COASTAL_CLASS.deltaEstuary ? 90
        : classification === GREATER_REALM_COASTAL_CLASS.seaCliff
          ? clamp(120 - Math.floor(input.rockResistance[cell]! / 120), 35, 80)
          : 45;
    delta[cell] -= amount;
    eroded = safeAdd(eroded, amount);
    seaNeighbors.sort((first, second) => (
      input.elevation[first]! - input.elevation[second]! || first - second
    ));
    const target = seaNeighbors[0]!;
    const capacity = Math.max(0, MAX_PROCESS_CELL_DELTA - delta[target]!);
    const placed = Math.min(amount, capacity);
    delta[target] += placed;
    deposited = safeAdd(deposited, placed);
    exported = safeAdd(exported, amount - placed);
    if (coastalClass[target] === GREATER_REALM_COASTAL_CLASS.none) {
      coastalClass[target] = GREATER_REALM_COASTAL_CLASS.beachShelf;
    }
  }
  if (eroded !== deposited + exported) fail('GREATER_REALM_GEOMORPHOLOGY_MATERIAL_BUDGET_INVALID');
  const mask = changedMask(delta);
  return Object.freeze({
    mask,
    coastalClass,
    delta,
    sourceMask,
    components: componentMetrics(input.grid, sourceMask),
    classCount: classes.size,
    budget: Object.freeze({ eroded, deposited, exported }),
  });
}

function compatibilityBasisPoints(
  mask: Uint8Array,
  predicate: (cell: number) => boolean,
): number {
  let total = 0;
  let compatible = 0;
  for (let cell = 0; cell < mask.length; cell += 1) {
    if (mask[cell] !== 1) continue;
    total += 1;
    compatible += predicate(cell) ? 1 : 0;
  }
  return total === 0 ? 0 : Math.round((compatible * 10_000) / total);
}

function alignmentMetrics(input: Readonly<{
  grid: IndexedAxialGrid;
  elevation: Int32Array;
  seaLevel: number;
  tectonicUplift: Int32Array;
  volcanicMask: Uint8Array;
  reserveMask: Uint8Array;
}>): Readonly<{
  ridgeUpliftAlignmentBasisPoints: number;
  riverValleyAlignmentBasisPoints: number;
}> {
  const slope = maximumNeighborDrop(input.grid, input.elevation);
  let ridgeCount = 0;
  let alignedRidgeCount = 0;
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (input.elevation[cell]! <= input.seaLevel || input.reserveMask[cell] === 1) continue;
    let neighborSum = 0;
    let neighborCount = 0;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0) continue;
      neighborSum += input.elevation[neighbor]!;
      neighborCount += 1;
    }
    const exposure = neighborCount === 0
      ? 0
      : input.elevation[cell]! - Math.round(neighborSum / neighborCount);
    if (slope[cell]! < 900 || exposure < 300) continue;
    ridgeCount += 1;
    if (input.tectonicUplift[cell]! >= 2_500 || input.volcanicMask[cell] === 1) {
      alignedRidgeCount += 1;
    }
  }

  const hydrology = preliminaryHydrology(input.grid, input.elevation, input.seaLevel);
  let riverCount = 0;
  let alignedRiverCount = 0;
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (
      input.reserveMask[cell] === 1
      || input.elevation[cell]! <= input.seaLevel
      || hydrology.accumulation[cell]! < 24n
    ) continue;
    const receiver = hydrology.receiver[cell]!;
    if (receiver < 0) continue;
    let crossSlopeSum = 0;
    let crossSlopeCount = 0;
    for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
      const neighbor = input.grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
      if (neighbor < 0 || neighbor === receiver || hydrology.receiver[neighbor] === cell) continue;
      crossSlopeSum += input.elevation[neighbor]!;
      crossSlopeCount += 1;
    }
    if (crossSlopeCount === 0) continue;
    riverCount += 1;
    if (input.elevation[cell]! <= Math.round(crossSlopeSum / crossSlopeCount) + 150) {
      alignedRiverCount += 1;
    }
  }
  return Object.freeze({
    ridgeUpliftAlignmentBasisPoints: ridgeCount === 0
      ? 0
      : Math.round((alignedRidgeCount * 10_000) / ridgeCount),
    riverValleyAlignmentBasisPoints: riverCount === 0
      ? 0
      : Math.round((alignedRiverCount * 10_000) / riverCount),
  });
}

/**
 * Apply bounded, deterministic geomorphic processes before the final fluvial
 * pass. This stage changes private elevation authority; labels and biomes must
 * be derived only after final hydrology is recomputed by the caller.
 */
export function shapeGreaterRealmGeomorphology(input: Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  elevation: Int32Array;
  tectonicUplift: Int32Array;
  rockResistance: Int32Array;
  volcanicPotential: Int32Array;
  legacyReserveCell: Uint8Array;
  seaLevel?: number;
  climate?: GreaterRealmGeomorphologyClimate;
}>): GreaterRealmGeomorphologyResult {
  const seaLevel = input.seaLevel ?? 0;
  assertInputs({ ...input, seaLevel });
  const initialElevation = new Int32Array(input.elevation);
  const slope = maximumNeighborDrop(input.grid, initialElevation);
  const seaMask = new Uint8Array(input.grid.cellCount);
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    if (initialElevation[cell]! <= seaLevel) seaMask[cell] = 1;
  }
  const coastDistance = maskDistances(input.grid, seaMask);
  if (coastDistance.every(distance => distance === DISTANCE_UNREACHABLE)) {
    fail('GREATER_REALM_GEOMORPHOLOGY_OCEAN_MISSING');
  }
  const hydrology = preliminaryHydrology(input.grid, initialElevation, seaLevel);
  const climate = input.climate === undefined
    ? deriveClimate({
        grid: input.grid,
        candidateSeed: input.candidateSeed,
        elevation: initialElevation,
        seaLevel,
        coastDistance,
        slope,
        accumulation: hydrology.accumulation,
      })
    : Object.freeze({
        temperature: new Int32Array(input.climate.temperature),
        moisture: new Int32Array(input.climate.moisture),
      });

  const glacial = glacialProcess({
    grid: input.grid,
    elevation: initialElevation,
    seaLevel,
    slope,
    temperature: climate.temperature,
    accumulation: hydrology.accumulation,
    receiver: hydrology.receiver,
    reserveMask: input.legacyReserveCell,
  });
  const arid = aridProcess({
    grid: input.grid,
    candidateSeed: input.candidateSeed,
    elevation: initialElevation,
    seaLevel,
    slope,
    temperature: climate.temperature,
    moisture: climate.moisture,
    accumulation: hydrology.accumulation,
    receiver: hydrology.receiver,
    rockResistance: input.rockResistance,
    reserveMask: input.legacyReserveCell,
  });
  const volcanic = volcanicProcess({
    grid: input.grid,
    candidateSeed: input.candidateSeed,
    elevation: initialElevation,
    seaLevel,
    tectonicUplift: input.tectonicUplift,
    volcanicPotential: input.volcanicPotential,
    reserveMask: input.legacyReserveCell,
  });
  const coastal = coastalProcess({
    grid: input.grid,
    elevation: initialElevation,
    seaLevel,
    slope,
    temperature: climate.temperature,
    accumulation: hydrology.accumulation,
    tectonicUplift: input.tectonicUplift,
    rockResistance: input.rockResistance,
    glacialMask: glacial.mask,
    reserveMask: input.legacyReserveCell,
  });

  const totalDelta = new Int32Array(input.grid.cellCount);
  const elevation = new Int32Array(input.grid.cellCount);
  let changedCellCount = 0;
  let maximumAbsoluteCellDelta = 0;
  let protectedCellCount = 0;
  let protectedChangedCellCount = 0;
  for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
    const delta = glacial.delta[cell]! + arid.delta[cell]! + volcanic.delta[cell]!
      + coastal.delta[cell]!;
    if (!Number.isSafeInteger(delta) || Math.abs(delta) > MAX_TOTAL_CELL_DELTA) {
      fail('GREATER_REALM_GEOMORPHOLOGY_DELTA_OUT_OF_RANGE');
    }
    totalDelta[cell] = delta;
    const nextElevation = initialElevation[cell]! + delta;
    if (nextElevation < -0x8000_0000 || nextElevation > 0x7fff_ffff) {
      fail('GREATER_REALM_GEOMORPHOLOGY_ELEVATION_OVERFLOW');
    }
    elevation[cell] = nextElevation;
    if (delta !== 0) changedCellCount += 1;
    maximumAbsoluteCellDelta = Math.max(maximumAbsoluteCellDelta, Math.abs(delta));
    if (input.legacyReserveCell[cell] === 1) {
      protectedCellCount += 1;
      if (delta !== 0) protectedChangedCellCount += 1;
    }
  }
  if (protectedChangedCellCount !== 0) fail('GREATER_REALM_GEOMORPHOLOGY_PROTECTED_EDIT');

  const erodedMaterialUnits = safeAdd(
    safeAdd(glacial.budget.eroded, arid.budget.eroded),
    coastal.budget.eroded,
  );
  const depositedMaterialUnits = safeAdd(
    safeAdd(glacial.budget.deposited, arid.budget.deposited),
    coastal.budget.deposited,
  );
  const exportedMaterialUnits = safeAdd(
    safeAdd(glacial.budget.exported, arid.budget.exported),
    coastal.budget.exported,
  );
  if (erodedMaterialUnits !== depositedMaterialUnits + exportedMaterialUnits) {
    fail('GREATER_REALM_GEOMORPHOLOGY_MATERIAL_BUDGET_INVALID');
  }
  const alignment = alignmentMetrics({
    grid: input.grid,
    elevation,
    seaLevel,
    tectonicUplift: input.tectonicUplift,
    volcanicMask: volcanic.mask,
    reserveMask: input.legacyReserveCell,
  });
  const coastalSourceMask = coastal.sourceMask;
  const glacialChanged = changedMask(glacial.delta);
  const aridChanged = changedMask(arid.delta);
  const coastalChanged = changedMask(coastal.delta);

  return Object.freeze({
    elevation,
    temperature: climate.temperature,
    moisture: climate.moisture,
    totalDelta,
    glacialDelta: glacial.delta,
    aridDelta: arid.delta,
    volcanicDelta: volcanic.delta,
    coastalDelta: coastal.delta,
    glacialMask: glacial.mask,
    aridMask: arid.mask,
    volcanicMask: volcanic.mask,
    volcanicAnchorMask: volcanic.anchorMask,
    coastalMask: coastal.mask,
    coastalClass: coastal.coastalClass,
    metrics: Object.freeze({
      changedCellCount,
      maximumAbsoluteCellDelta,
      protectedCellCount,
      protectedChangedCellCount,
      erodedMaterialUnits,
      depositedMaterialUnits,
      exportedMaterialUnits,
      endogenicUpliftUnits: volcanic.upliftUnits,
      aeolianMovedMaterialUnits: arid.aeolianMovedMaterialUnits,
      glacialClimateCompatibilityBasisPoints: compatibilityBasisPoints(
        glacial.mask,
        cell => climate.temperature[cell]! <= 2_000
          && initialElevation[cell]! > seaLevel + 4_500,
      ),
      aridClimateCompatibilityBasisPoints: compatibilityBasisPoints(
        arid.mask,
        cell => climate.temperature[cell]! >= 5_500 && climate.moisture[cell]! <= -1_000,
      ),
      volcanicTectonicCompatibilityBasisPoints: compatibilityBasisPoints(
        volcanic.anchorMask,
        cell => input.volcanicPotential[cell]! >= 7_000
          && input.tectonicUplift[cell]! >= 2_500,
      ),
      coastalProximityCompatibilityBasisPoints: compatibilityBasisPoints(
        coastalSourceMask,
        cell => coastDistance[cell] === 1,
      ),
      coastalClassCount: coastal.classCount,
      volcanicAnchorCount: volcanic.anchorCount,
      ridgeUpliftAlignmentBasisPoints: alignment.ridgeUpliftAlignmentBasisPoints,
      riverValleyAlignmentBasisPoints: alignment.riverValleyAlignmentBasisPoints,
      glacial: Object.freeze({
        sourceCellCount: countMask(glacial.mask),
        changedCellCount: countMask(glacialChanged),
        systemCount: glacial.components.count,
        minimumSystemCellCount: glacial.components.minimum,
        erodedMaterialUnits: glacial.budget.eroded,
        depositedMaterialUnits: glacial.budget.deposited,
        exportedMaterialUnits: glacial.budget.exported,
      }),
      arid: Object.freeze({
        sourceCellCount: countMask(arid.mask),
        changedCellCount: countMask(aridChanged),
        systemCount: arid.components.count,
        minimumSystemCellCount: arid.components.minimum,
        erodedMaterialUnits: arid.budget.eroded,
        depositedMaterialUnits: arid.budget.deposited,
        exportedMaterialUnits: arid.budget.exported,
      }),
      coastal: Object.freeze({
        sourceCellCount: countMask(coastalSourceMask),
        changedCellCount: countMask(coastalChanged),
        systemCount: coastal.components.count,
        minimumSystemCellCount: coastal.components.minimum,
        erodedMaterialUnits: coastal.budget.eroded,
        depositedMaterialUnits: coastal.budget.deposited,
        exportedMaterialUnits: coastal.budget.exported,
      }),
    }),
  });
}
