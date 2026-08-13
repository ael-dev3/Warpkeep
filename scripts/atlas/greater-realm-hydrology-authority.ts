import {
  GREATER_REALM_AXIAL_DIRECTIONS,
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  isCanonicalGreaterRealmAxialGrid,
  type GreaterRealmTerrainSeed,
  type IndexedAxialGrid,
} from "./greater-realm-terrain";

export const GREATER_REALM_HYDROLOGY_AUTHORITY_VERSION =
  "greater-realm-hydrology-authority-v1" as const;
export const GREATER_REALM_HYDROLOGY_GENERATION_VERSION = 1 as const;

/** Stable private package IDs. Zero remains the non-water sentinel. */
export const GREATER_REALM_WATER_REGIME_ID = Object.freeze({
  DRY: 0,
  OCEAN: 1,
  LAKE: 2,
  RIVER: 3,
  STREAM: 4,
  SEA: 5,
  MARSH: 6,
} as const);

/** Stable private package IDs. Zero remains the dry-cell sentinel. */
export const GREATER_REALM_WATER_DEPTH_CLASS_ID = Object.freeze({
  DRY: 0,
  SHALLOW: 1,
  CHANNEL: 2,
  DEEP: 3,
} as const);

export const GREATER_REALM_DRY_SURFACE_LEVEL = -0x8000_0000 as const;

export type GreaterRealmHydrologyAuthorityMetrics = Readonly<{
  waterCellCount: number;
  waterBodyCount: number;
  /** Index 0 is the dry sentinel; water regime IDs occupy indexes 1-6. */
  waterCellCountsByRegime: readonly number[];
  /** Index 0 is the dry sentinel; water regime IDs occupy indexes 1-6. */
  waterBodyCountsByRegime: readonly number[];
  /** Index 0 is the dry sentinel; depth class IDs occupy indexes 1-3. */
  waterCellCountsByDepthClass: readonly number[];
  routingAcyclicProof: boolean;
  downstreamSurfaceProof: boolean;
  bodySurfaceProof: boolean;
  marshConnectivityProof: boolean;
  metadataCompletenessProof: boolean;
  proof: boolean;
}>;

export type GreaterRealmHydrologyAuthority = Readonly<{
  waterRegime: Uint8Array;
  waterBodyId: Uint32Array;
  depthClass: Uint8Array;
  surfaceLevel: Int32Array;
  downstream: Int32Array;
  flowAccumulation: BigUint64Array;
  bankSeed: Uint32Array;
  generationVersion: Uint16Array;
  metrics: GreaterRealmHydrologyAuthorityMetrics;
  /** Best-effort retirement of all private per-cell authority arrays. */
  clear: () => void;
}>;

const INT32_MIN = -0x8000_0000;
const INT32_MAX = 0x7fff_ffff;
const HEX_NEIGHBOR_COUNT = GREATER_REALM_AXIAL_DIRECTIONS.length;
const WATER_REGIME_COUNT = 6;
const WATER_DEPTH_CLASS_COUNT = 3;
const BANK_SEED_CHANNEL = greaterRealmTerrainChannelId(
  "final-water-bank-seed-v1",
);
const WATER = GREATER_REALM_WATER_REGIME_ID;
const DEPTH = GREATER_REALM_WATER_DEPTH_CLASS_ID;

function fail(code: string): never {
  throw new Error(code);
}

function isInt32(value: number): boolean {
  return (
    Number.isSafeInteger(value) && value >= INT32_MIN && value <= INT32_MAX
  );
}

function isWater(regime: number): boolean {
  return regime >= WATER.OCEAN && regime <= WATER.MARSH;
}

function isFlowingFreshwater(regime: number): boolean {
  return (
    regime === WATER.RIVER || regime === WATER.STREAM || regime === WATER.MARSH
  );
}

function validateTypedInputs(
  input: Readonly<{
    grid: IndexedAxialGrid;
    waterRegime: Uint8Array;
    marshMask: Uint8Array;
    flowContinuityExemptionMask?: Uint8Array;
    elevation: Int32Array;
    filledElevation: Int32Array;
    flowReceiver: Int32Array;
    flowAccumulation: BigUint64Array;
    seaLevel: number;
  }>,
): void {
  const { grid } = input;
  if (
    !Number.isSafeInteger(grid.cellCount) ||
    grid.cellCount <= 0 ||
    grid.cellCount > 0xffff_ffff ||
    !(grid.q instanceof Int32Array) ||
    !(grid.r instanceof Int32Array) ||
    !(grid.neighbors instanceof Int32Array) ||
    grid.q.length !== grid.cellCount ||
    grid.r.length !== grid.cellCount ||
    grid.neighbors.length !== grid.cellCount * HEX_NEIGHBOR_COUNT ||
    !(input.waterRegime instanceof Uint8Array) ||
    !(input.marshMask instanceof Uint8Array) ||
    input.waterRegime.length !== grid.cellCount ||
    input.marshMask.length !== grid.cellCount ||
    (input.flowContinuityExemptionMask !== undefined &&
      (!(input.flowContinuityExemptionMask instanceof Uint8Array) ||
        input.flowContinuityExemptionMask.length !== grid.cellCount)) ||
    !(input.elevation instanceof Int32Array) ||
    !(input.filledElevation instanceof Int32Array) ||
    !(input.flowReceiver instanceof Int32Array) ||
    !(input.flowAccumulation instanceof BigUint64Array) ||
    input.elevation.length !== grid.cellCount ||
    input.filledElevation.length !== grid.cellCount ||
    input.flowReceiver.length !== grid.cellCount ||
    input.flowAccumulation.length !== grid.cellCount ||
    !isInt32(input.seaLevel)
  )
    fail("GREATER_REALM_HYDROLOGY_INPUT_INVALID");
}

function assertGridAndRouting(
  input: Readonly<{
    grid: IndexedAxialGrid;
    elevation: Int32Array;
    filledElevation: Int32Array;
    flowReceiver: Int32Array;
    flowAccumulation: BigUint64Array;
  }>,
  incoming: Uint32Array,
  queue: Uint32Array,
): void {
  const { grid } = input;
  if (!isCanonicalGreaterRealmAxialGrid(grid)) {
    fail("GREATER_REALM_HYDROLOGY_GRID_INVALID");
  }
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (input.filledElevation[cell]! < input.elevation[cell]!) {
      fail("GREATER_REALM_HYDROLOGY_ELEVATION_INVALID");
    }

    const receiver = input.flowReceiver[cell]!;
    if (receiver === -1) continue;
    if (
      receiver < 0 ||
      receiver >= grid.cellCount ||
      input.filledElevation[receiver]! > input.filledElevation[cell]! ||
      input.flowAccumulation[receiver]! < input.flowAccumulation[cell]!
    )
      fail("GREATER_REALM_HYDROLOGY_FLOW_INVALID");
    let isNeighbor = false;
    for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
      if (
        grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction] === receiver
      ) {
        isNeighbor = true;
        break;
      }
    }
    if (!isNeighbor) fail("GREATER_REALM_HYDROLOGY_FLOW_INVALID");
    if (incoming[receiver] === 0xffff_ffff) {
      fail("GREATER_REALM_HYDROLOGY_FLOW_INVALID");
    }
    incoming[receiver] += 1;
  }

  let head = 0;
  let tail = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    if (incoming[cell] === 0) queue[tail++] = cell;
  }
  let visited = 0;
  while (head < tail) {
    const cell = queue[head++]!;
    visited += 1;
    const receiver = input.flowReceiver[cell]!;
    if (receiver < 0) continue;
    incoming[receiver] -= 1;
    if (incoming[receiver] === 0) queue[tail++] = receiver;
  }
  if (visited !== grid.cellCount) fail("GREATER_REALM_HYDROLOGY_FLOW_CYCLE");
}

function surfaceForCell(
  regime: number,
  elevation: number,
  filledElevation: number,
  seaLevel: number,
): number {
  if (regime === WATER.DRY) return GREATER_REALM_DRY_SURFACE_LEVEL;
  if (regime === WATER.OCEAN) return seaLevel;
  if ((regime === WATER.SEA || regime === WATER.LAKE) && elevation <= seaLevel)
    return seaLevel;
  return filledElevation;
}

function depthForCell(
  input: Readonly<{
    grid: IndexedAxialGrid;
    cell: number;
    regime: number;
    waterRegime: Uint8Array;
    surfaceLevel: Int32Array;
    elevation: Int32Array;
    flowAccumulation: BigUint64Array;
  }>,
): number {
  const { cell, regime } = input;
  if (regime === WATER.MARSH || regime === WATER.STREAM) return DEPTH.SHALLOW;
  if (regime === WATER.RIVER) {
    const discharge = input.flowAccumulation[cell]!;
    return discharge >= 2_048n
      ? DEPTH.DEEP
      : discharge >= 256n
        ? DEPTH.CHANNEL
        : DEPTH.SHALLOW;
  }
  let touchesDryBank = false;
  for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
    const neighbor =
      input.grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
    if (neighbor >= 0 && input.waterRegime[neighbor] === WATER.DRY) {
      touchesDryBank = true;
      break;
    }
  }
  const submergence = input.surfaceLevel[cell]! - input.elevation[cell]!;
  if (touchesDryBank || submergence < 250) return DEPTH.SHALLOW;
  return submergence >= 2_500 ? DEPTH.DEEP : DEPTH.CHANNEL;
}

/**
 * Materialize final per-water-cell private authority after terrain, routing,
 * legacy overlay, and biome/topography classification are stable.
 *
 * `marshMask` is the caller-reviewed low-gradient wet-basin/tidal-margin mask.
 * It may promote only dry cells (or replay an already promoted marsh), keeping
 * ocean/lake/river/stream semantics intact. `flowContinuityExemptionMask` is
 * reserved for the frozen Lowlands footprint whose detailed water descriptor
 * is independently pinned.
 */
export function deriveGreaterRealmHydrologyAuthority(
  input: Readonly<{
    grid: IndexedAxialGrid;
    seed: GreaterRealmTerrainSeed;
    waterRegime: Uint8Array;
    marshMask: Uint8Array;
    flowContinuityExemptionMask?: Uint8Array;
    elevation: Int32Array;
    filledElevation: Int32Array;
    flowReceiver: Int32Array;
    flowAccumulation: BigUint64Array;
    seaLevel: number;
  }>,
): GreaterRealmHydrologyAuthority {
  validateTypedInputs(input);
  const { grid } = input;
  const waterRegime = new Uint8Array(grid.cellCount);
  const waterBodyId = new Uint32Array(grid.cellCount);
  const depthClass = new Uint8Array(grid.cellCount);
  const surfaceLevel = new Int32Array(grid.cellCount);
  const downstream = new Int32Array(grid.cellCount);
  const flowAccumulation = new BigUint64Array(grid.cellCount);
  const bankSeed = new Uint32Array(grid.cellCount);
  const generationVersion = new Uint16Array(grid.cellCount);
  const waterCellCountsByRegimeWorking = new Uint32Array(
    WATER_REGIME_COUNT + 1,
  );
  const waterBodyCountsByRegimeWorking = new Uint32Array(
    WATER_REGIME_COUNT + 1,
  );
  const waterCellCountsByDepthClassWorking = new Uint32Array(
    WATER_DEPTH_CLASS_COUNT + 1,
  );
  const incoming = new Uint32Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  const seen = new Uint8Array(grid.cellCount);
  const drainsToEstablishedWater = new Uint8Array(grid.cellCount);
  let completed = false;
  try {
    surfaceLevel.fill(GREATER_REALM_DRY_SURFACE_LEVEL);
    downstream.fill(-1);
    assertGridAndRouting(input, incoming, queue);

    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const sourceRegime = input.waterRegime[cell]!;
      const marsh = input.marshMask[cell]!;
      const exempt = input.flowContinuityExemptionMask?.[cell] ?? 0;
      if (
        sourceRegime > WATER.MARSH ||
        marsh > 1 ||
        exempt > 1 ||
        (sourceRegime === WATER.MARSH && marsh !== 1) ||
        (marsh === 1 &&
          sourceRegime !== WATER.DRY &&
          sourceRegime !== WATER.MARSH) ||
        (marsh === 1 && exempt === 1)
      )
        fail("GREATER_REALM_HYDROLOGY_REGIME_INVALID");
      const regime = marsh === 1 ? WATER.MARSH : sourceRegime;
      waterRegime[cell] = regime;
      flowAccumulation[cell] = input.flowAccumulation[cell]!;
      if (!isWater(regime)) continue;
      const surface = surfaceForCell(
        regime,
        input.elevation[cell]!,
        input.filledElevation[cell]!,
        input.seaLevel,
      );
      if (
        surface < input.elevation[cell]! ||
        (regime === WATER.OCEAN && input.elevation[cell]! > input.seaLevel)
      )
        fail("GREATER_REALM_HYDROLOGY_SURFACE_INVALID");
      surfaceLevel[cell] = surface;
      generationVersion[cell] = GREATER_REALM_HYDROLOGY_GENERATION_VERSION;
      if (regime !== WATER.OCEAN && regime !== WATER.SEA) {
        downstream[cell] = input.flowReceiver[cell]!;
      }
      waterCellCountsByRegimeWorking[regime] += 1;
    }

    // `queue` retains the source-to-outlet topological order proved by
    // `assertGridAndRouting`. Walking it backwards lets marsh cells prove a
    // bounded route to established water through one or more dry transition
    // cells without an O(N^2) receiver walk per wetland cell.
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (
        input.waterRegime[cell]! >= WATER.OCEAN &&
        input.waterRegime[cell]! <= WATER.SEA
      )
        drainsToEstablishedWater[cell] = 1;
    }
    for (let ordinal = grid.cellCount - 1; ordinal >= 0; ordinal -= 1) {
      const cell = queue[ordinal]!;
      const receiver = input.flowReceiver[cell]!;
      if (receiver >= 0 && drainsToEstablishedWater[receiver] === 1) {
        drainsToEstablishedWater[cell] = 1;
      }
    }

    let nextWaterBodyId = 1;
    let bodySurfaceProof = true;
    let marshConnectivityProof = true;
    for (let start = 0; start < grid.cellCount; start += 1) {
      const regime = waterRegime[start]!;
      if (!isWater(regime) || seen[start] === 1) continue;
      if (nextWaterBodyId > 0xffff_ffff) {
        fail("GREATER_REALM_HYDROLOGY_BODY_ID_OVERFLOW");
      }
      let head = 0;
      let tail = 0;
      let touchesActiveBoundary = false;
      let marshTouchesEstablishedWater = false;
      const expectedSurface = surfaceLevel[start]!;
      queue[tail++] = start;
      seen[start] = 1;
      while (head < tail) {
        const cell = queue[head++]!;
        waterBodyId[cell] = nextWaterBodyId;
        if (regime === WATER.MARSH && drainsToEstablishedWater[cell] === 1) {
          marshTouchesEstablishedWater = true;
        }
        if (
          (regime === WATER.OCEAN ||
            regime === WATER.SEA ||
            regime === WATER.LAKE) &&
          surfaceLevel[cell] !== expectedSurface
        )
          bodySurfaceProof = false;
        for (
          let direction = 0;
          direction < HEX_NEIGHBOR_COUNT;
          direction += 1
        ) {
          const neighbor =
            grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0) {
            touchesActiveBoundary = true;
            continue;
          }
          if (
            regime === WATER.MARSH &&
            input.waterRegime[neighbor] !== WATER.DRY &&
            input.waterRegime[neighbor] !== WATER.MARSH
          )
            marshTouchesEstablishedWater = true;
          if (waterRegime[neighbor] !== regime || seen[neighbor] === 1)
            continue;
          seen[neighbor] = 1;
          queue[tail++] = neighbor;
        }
      }
      if (regime === WATER.OCEAN && !touchesActiveBoundary) {
        bodySurfaceProof = false;
      }
      if (regime === WATER.MARSH && !marshTouchesEstablishedWater) {
        marshConnectivityProof = false;
      }
      waterBodyCountsByRegimeWorking[regime] += 1;
      nextWaterBodyId += 1;
    }

    let downstreamSurfaceProof = true;
    let metadataCompletenessProof = true;
    let waterCellCount = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const regime = waterRegime[cell]!;
      if (!isWater(regime)) {
        if (
          waterBodyId[cell] !== 0 ||
          depthClass[cell] !== DEPTH.DRY ||
          surfaceLevel[cell] !== GREATER_REALM_DRY_SURFACE_LEVEL ||
          downstream[cell] !== -1 ||
          bankSeed[cell] !== 0 ||
          generationVersion[cell] !== 0
        )
          metadataCompletenessProof = false;
        continue;
      }
      waterCellCount += 1;
      const depth = depthForCell({
        grid,
        cell,
        regime,
        waterRegime,
        surfaceLevel,
        elevation: input.elevation,
        flowAccumulation,
      });
      depthClass[cell] = depth;
      waterCellCountsByDepthClassWorking[depth] += 1;
      bankSeed[cell] = greaterRealmCounterRandomU32(
        input.seed,
        BANK_SEED_CHANNEL,
        grid.q[cell]!,
        grid.r[cell]!,
        waterBodyId[cell]!,
      );
      const receiver = downstream[cell]!;
      if (receiver >= 0) {
        const receiverRegime = waterRegime[receiver]!;
        const receiverSurface = isWater(receiverRegime)
          ? surfaceLevel[receiver]!
          : input.filledElevation[receiver]!;
        if (receiverSurface > surfaceLevel[cell]!)
          downstreamSurfaceProof = false;
        if (
          (regime === WATER.RIVER || regime === WATER.STREAM) &&
          receiverRegime === WATER.DRY &&
          (input.flowContinuityExemptionMask?.[cell] ?? 0) !== 1
        )
          downstreamSurfaceProof = false;
        if (
          regime === WATER.MARSH &&
          drainsToEstablishedWater[cell] !== 1 &&
          (input.flowContinuityExemptionMask?.[cell] ?? 0) !== 1
        )
          downstreamSurfaceProof = false;
      } else if (
        isFlowingFreshwater(regime) &&
        (input.flowContinuityExemptionMask?.[cell] ?? 0) !== 1
      )
        downstreamSurfaceProof = false;
      if (
        waterBodyId[cell] === 0 ||
        depth === DEPTH.DRY ||
        surfaceLevel[cell] === GREATER_REALM_DRY_SURFACE_LEVEL ||
        generationVersion[cell] !== GREATER_REALM_HYDROLOGY_GENERATION_VERSION
      )
        metadataCompletenessProof = false;
    }

    const waterBodyCount = nextWaterBodyId - 1;
    if (!bodySurfaceProof)
      fail("GREATER_REALM_HYDROLOGY_BODY_SURFACE_INVARIANT");
    if (!marshConnectivityProof)
      fail("GREATER_REALM_HYDROLOGY_MARSH_CONNECTIVITY_INVARIANT");
    if (!downstreamSurfaceProof)
      fail("GREATER_REALM_HYDROLOGY_DOWNSTREAM_INVARIANT");
    if (!metadataCompletenessProof)
      fail("GREATER_REALM_HYDROLOGY_METADATA_INVARIANT");

    const metrics = Object.freeze({
      waterCellCount,
      waterBodyCount,
      waterCellCountsByRegime: Object.freeze(
        Array.from(waterCellCountsByRegimeWorking),
      ),
      waterBodyCountsByRegime: Object.freeze(
        Array.from(waterBodyCountsByRegimeWorking),
      ),
      waterCellCountsByDepthClass: Object.freeze(
        Array.from(waterCellCountsByDepthClassWorking),
      ),
      routingAcyclicProof: true,
      downstreamSurfaceProof,
      bodySurfaceProof,
      marshConnectivityProof,
      metadataCompletenessProof,
      proof: true,
    });
    const clear = () => {
      waterRegime.fill(0);
      waterBodyId.fill(0);
      depthClass.fill(0);
      surfaceLevel.fill(0);
      downstream.fill(0);
      flowAccumulation.fill(0n);
      bankSeed.fill(0);
      generationVersion.fill(0);
    };
    completed = true;
    return Object.freeze({
      waterRegime,
      waterBodyId,
      depthClass,
      surfaceLevel,
      downstream,
      flowAccumulation,
      bankSeed,
      generationVersion,
      metrics,
      clear,
    });
  } finally {
    incoming.fill(0);
    queue.fill(0);
    seen.fill(0);
    drainsToEstablishedWater.fill(0);
    waterCellCountsByRegimeWorking.fill(0);
    waterBodyCountsByRegimeWorking.fill(0);
    waterCellCountsByDepthClassWorking.fill(0);
    if (!completed) {
      waterRegime.fill(0);
      waterBodyId.fill(0);
      depthClass.fill(0);
      surfaceLevel.fill(0);
      downstream.fill(0);
      flowAccumulation.fill(0n);
      bankSeed.fill(0);
      generationVersion.fill(0);
    }
  }
}
