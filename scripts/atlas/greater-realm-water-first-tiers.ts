import {
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  isCanonicalGreaterRealmAxialGrid,
  type GreaterRealmTerrainSeed,
  type IndexedAxialGrid,
} from './greater-realm-terrain';
import { GREATER_REALM_WATER_REGIME_ID } from './greater-realm-hydrology-authority';
const HEX_NEIGHBOR_COUNT = 6;
const TIER_ONE_REGION_COUNT = 6;
const TIER_TWO_REGION_COUNT = 3;
const PRIMARY_CAPACITY_RESERVE = 512;
const MINIMUM_DRY_ANCHOR_SEPARATION = 8;
const WATER = GREATER_REALM_WATER_REGIME_ID;
const TIER_THREE_RANK_CHANNEL = greaterRealmTerrainChannelId('water-first-tier-three-rank');
const TIER_TWO_RANK_CHANNEL = greaterRealmTerrainChannelId('water-first-tier-two-rank');
const TIER_TWO_PADDING_RANK_CHANNEL = greaterRealmTerrainChannelId(
  'water-first-tier-two-padding-rank',
);
type GreaterRealmWaterFirstTierInput = Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  waterRegime: Uint8Array;
  terrainCost: Int32Array;
  legacyProtectedCell: Uint8Array;
  legacyReserveCell: Uint8Array;
  tierThreeSeed: number;
  tierThreeCount: number;
  tierTwoCount: number;
  tierTwoPassableCount: number;
}>;
type GreaterRealmWaterFirstTierResult = Readonly<{
  tierId: Uint8Array;
  tierCounts: readonly [number, number, number];
  tierTwoPassableCarrierCount: number;
  tierTwoNonPassablePaddingCount: number;
}>;
function fail(code: string): never { throw new Error(`GREATER_REALM_WATER_FIRST_TIER_${code}`); }
const GEOGRAPHY_FAILURE = Symbol('GREATER_REALM_WATER_FIRST_TIER_GEOGRAPHY');
class GreaterRealmWaterFirstTierGeographyError extends Error {
  readonly [GEOGRAPHY_FAILURE] = true;
}
function reject(code: string): never {
  throw new GreaterRealmWaterFirstTierGeographyError(`GREATER_REALM_WATER_FIRST_TIER_${code}`);
}
function classifyFailure(error: unknown): 'geography' | 'fatal' {
  return error instanceof GreaterRealmWaterFirstTierGeographyError
    && error[GEOGRAPHY_FAILURE] === true ? 'geography' : 'fatal';
}

function strategicallyPassableSurface(waterRegime: number): boolean {
  return waterRegime === WATER.DRY || waterRegime === WATER.RIVER || waterRegime === WATER.STREAM;
}

function axialDistance(grid: IndexedAxialGrid, first: number, second: number): number {
  const q = grid.q[first]! - grid.q[second]!;
  const r = grid.r[first]! - grid.r[second]!;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function validateInput(input: GreaterRealmWaterFirstTierInput): void {
  if (
    typeof input !== 'object'
    || input === null
    || typeof input.grid !== 'object'
    || input.grid === null
    || !isCanonicalGreaterRealmAxialGrid(input.grid)
  ) fail('INPUT_INVALID');
  const { grid } = input;
  if (
    !(input.waterRegime instanceof Uint8Array)
    || !(input.terrainCost instanceof Int32Array)
    || !(input.legacyProtectedCell instanceof Uint8Array)
    || !(input.legacyReserveCell instanceof Uint8Array)
    || input.waterRegime.length !== grid.cellCount
    || input.terrainCost.length !== grid.cellCount
    || input.legacyProtectedCell.length !== grid.cellCount
    || input.legacyReserveCell.length !== grid.cellCount
    || !Number.isSafeInteger(input.tierThreeSeed)
    || input.tierThreeSeed < 0
    || input.tierThreeSeed >= grid.cellCount
    || !Number.isSafeInteger(input.tierThreeCount)
    || !Number.isSafeInteger(input.tierTwoCount)
    || !Number.isSafeInteger(input.tierTwoPassableCount)
    || input.tierThreeCount < 1
    || input.tierTwoCount < 1
    || input.tierTwoPassableCount < 1
    || input.tierTwoPassableCount > input.tierTwoCount
    || input.tierThreeCount + input.tierTwoCount >= grid.cellCount
  ) fail('INPUT_INVALID');
  // Validate all seed representations before allocating private scratch.
  greaterRealmCounterRandomU32(input.candidateSeed, TIER_THREE_RANK_CHANNEL, 0, 0);

  const primaryMinimum = input.tierThreeCount + PRIMARY_CAPACITY_RESERVE;
  if (
    Math.floor(input.tierTwoCount / TIER_TWO_REGION_COUNT) < primaryMinimum
    || input.tierTwoPassableCount < primaryMinimum * TIER_TWO_REGION_COUNT
  ) fail('QUOTA_INFEASIBLE');

  let lockedCells = 0;
  let passableCells = 0;
  let unlockedPassableCells = 0;
  let unlockedNonPassableCells = 0;
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const water = input.waterRegime[cell]!;
    const protectedCell = input.legacyProtectedCell[cell]!;
    const reserveCell = input.legacyReserveCell[cell]!;
    if (
      water > WATER.MARSH
      || protectedCell > 1
      || reserveCell > 1
      || (protectedCell === 1 && reserveCell !== 1)
    ) fail('INPUT_INVALID');
    const locked = protectedCell === 1 || reserveCell === 1;
    const passable = strategicallyPassableSurface(water);
    if (locked) lockedCells += 1;
    if (passable) passableCells += 1;
    if (!locked && passable) unlockedPassableCells += 1;
    if (!locked && !passable) unlockedNonPassableCells += 1;
  }
  const tierOneCount = grid.cellCount - input.tierThreeCount - input.tierTwoCount;
  const paddingCount = input.tierTwoCount - input.tierTwoPassableCount;
  if (
    lockedCells >= tierOneCount
    || unlockedPassableCells
      < input.tierThreeCount + input.tierTwoPassableCount
    || unlockedNonPassableCells < paddingCount
    || passableCells - input.tierThreeCount - input.tierTwoPassableCount
      < primaryMinimum * TIER_ONE_REGION_COUNT
  ) reject('CAPACITY_INFEASIBLE');
  if (
    input.waterRegime[input.tierThreeSeed] !== WATER.DRY
    || input.legacyProtectedCell[input.tierThreeSeed] === 1
    || input.legacyReserveCell[input.tierThreeSeed] === 1
  ) fail('TIER_THREE_SEED_INVALID');
}

/**
 * Fixed-water political tiers; globally ranked frontiers never edit natural authority.
 * Parent ownership, apron, spine, and repartition proofs remain downstream allocator work.
 */
function constructGreaterRealmWaterFirstTiers(
  input: GreaterRealmWaterFirstTierInput,
): GreaterRealmWaterFirstTierResult {
  validateInput(input);
  const { grid } = input;
  let tierId: Uint8Array | undefined;
  let state: Uint8Array | undefined;
  let queue: Uint32Array | undefined;
  let heapPosition: Int32Array | undefined;
  let rankedNeighbors: Int32Array | undefined;
  let anchors: Int32Array | undefined;
  let completed = false;
  try {
    tierId = new Uint8Array(grid.cellCount);
    tierId.fill(1);
    state = new Uint8Array(grid.cellCount);
    queue = new Uint32Array(grid.cellCount);
    const frontierPosition = new Int32Array(grid.cellCount);
    heapPosition = frontierPosition;
    frontierPosition.fill(-1);
    const neighborOrder = new Int32Array(HEX_NEIGHBOR_COUNT);
    rankedNeighbors = neighborOrder;
    neighborOrder.fill(-1);
    anchors = new Int32Array(TIER_TWO_REGION_COUNT);
    anchors.fill(-1);

    const locked = (cell: number): boolean => (
      input.legacyProtectedCell[cell] === 1
      || input.legacyReserveCell[cell] === 1
    );
    const rankedBefore = (first: number, second: number, channel: number): boolean => {
      const firstCost = input.terrainCost[first]!;
      const secondCost = input.terrainCost[second]!;
      if (firstCost !== secondCost) return firstCost < secondCost;
      const firstRank = greaterRealmCounterRandomU32(
        input.candidateSeed,
        channel,
        grid.q[first]!,
        grid.r[first]!,
      );
      const secondRank = greaterRealmCounterRandomU32(
        input.candidateSeed,
        channel,
        grid.q[second]!,
        grid.r[second]!,
      );
      return firstRank < secondRank || (firstRank === secondRank && first < second);
    };
    const collectRankedNeighbors = (
      source: number,
      channel: number,
      eligible: (cell: number) => boolean,
    ): number => {
      let count = 0;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[source * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || !eligible(neighbor)) continue;
        let insertion = count;
        while (
          insertion > 0
          && rankedBefore(neighbor, neighborOrder[insertion - 1]!, channel)
        ) {
          neighborOrder[insertion] = neighborOrder[insertion - 1]!;
          insertion -= 1;
        }
        neighborOrder[insertion] = neighbor;
        count += 1;
      }
      for (let index = count; index < HEX_NEIGHBOR_COUNT; index += 1) {
        neighborOrder[index] = -1;
      }
      return count;
    };

    let heapSize = 0;
    const heapSwap = (first: number, second: number): void => {
      const firstCell = queue![first]!;
      const secondCell = queue![second]!;
      queue![first] = secondCell;
      queue![second] = firstCell;
      frontierPosition[firstCell] = second;
      frontierPosition[secondCell] = first;
    };
    const heapPush = (cell: number, channel: number): void => {
      if (frontierPosition[cell] >= 0) return;
      let index = heapSize;
      heapSize += 1;
      queue![index] = cell;
      frontierPosition[cell] = index;
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!rankedBefore(cell, queue![parent]!, channel)) break;
        heapSwap(index, parent);
        index = parent;
      }
    };
    const heapPop = (channel: number): number => {
      if (heapSize === 0) return -1;
      const first = queue![0]!;
      frontierPosition[first] = -1;
      heapSize -= 1;
      if (heapSize === 0) {
        queue![0] = 0;
        return first;
      }
      const last = queue![heapSize]!;
      queue![heapSize] = 0;
      queue![0] = last;
      frontierPosition[last] = 0;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heapSize) break;
        const right = left + 1;
        const child = right < heapSize
          && rankedBefore(queue![right]!, queue![left]!, channel) ? right : left;
        if (!rankedBefore(queue![child]!, queue![index]!, channel)) break;
        heapSwap(index, child);
        index = child;
      }
      return first;
    };
    const clearHeap = (): void => {
      while (heapSize > 0) {
        heapSize -= 1;
        const cell = queue![heapSize]!;
        frontierPosition[cell] = -1;
        queue![heapSize] = 0;
      }
    };
    const offerPassableNeighbors = (source: number, channel: number): void => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const cell = grid.neighbors[source * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          cell >= 0
          && tierId![cell] === 1
          && !locked(cell)
          && strategicallyPassableSurface(input.waterRegime[cell]!)
        ) heapPush(cell, channel);
      }
    };

    let tierThreeCells = 1;
    tierId[input.tierThreeSeed] = 3;
    offerPassableNeighbors(input.tierThreeSeed, TIER_THREE_RANK_CHANNEL);
    while (tierThreeCells < input.tierThreeCount) {
      const cell = heapPop(TIER_THREE_RANK_CHANNEL);
      if (cell < 0) reject('TIER_THREE_FRONTIER_EXHAUSTED');
      tierId[cell] = 3;
      tierThreeCells += 1;
      offerPassableNeighbors(cell, TIER_THREE_RANK_CHANNEL);
    }
    clearHeap();

    let carrierCells = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (tierId[cell] !== 3) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor < 0
          || tierId[neighbor] === 3
          || !strategicallyPassableSurface(input.waterRegime[neighbor]!)
        ) continue;
        if (locked(neighbor)) reject('PASSABLE_FRONTIER_LOCKED');
        if (tierId[neighbor] === 1) {
          tierId[neighbor] = 2;
          carrierCells += 1;
        }
      }
    }
    if (carrierCells === 0 || carrierCells > input.tierTwoPassableCount) {
      reject('PASSABLE_FRONTIER_CAPACITY_INVALID');
    }

    state.fill(0);
    let head = 0;
    let tail = 0;
    let frontierStart = -1;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (tierId[cell] === 2) {
        frontierStart = cell;
        break;
      }
    }
    state[frontierStart] = 1;
    queue[tail++] = frontierStart;
    while (head < tail) {
      const cell: number = queue[head++]!;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (neighbor < 0 || tierId[neighbor] !== 2 || state[neighbor] === 1) continue;
        state[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    if (tail !== carrierCells) reject('PASSABLE_FRONTIER_DISCONNECTED');

    const dryInnerContact = (cell: number): boolean => {
      if (tierId![cell] !== 2 || input.waterRegime[cell] !== WATER.DRY) return false;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && tierId![neighbor] === 3
          && input.waterRegime[neighbor] === WATER.DRY
        ) return true;
      }
      return false;
    };
    for (let anchor = 0; anchor < TIER_TWO_REGION_COUNT; anchor += 1) {
      let selected = -1;
      let selectedSeparation = -1;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (!dryInnerContact(cell)) continue;
        let separation = Number.MAX_SAFE_INTEGER;
        for (let prior = 0; prior < anchor; prior += 1) {
          separation = Math.min(separation, axialDistance(grid, cell, anchors[prior]!));
        }
        if (
          anchor > 0
          && separation < MINIMUM_DRY_ANCHOR_SEPARATION
        ) continue;
        if (
          selected < 0
          || separation > selectedSeparation
          || (
            separation === selectedSeparation
            && rankedBefore(cell, selected, TIER_TWO_RANK_CHANNEL)
          )
        ) {
          selected = cell;
          selectedSeparation = separation;
        }
      }
      if (selected < 0) reject('DRY_INNER_CONTACTS_MISSING');
      anchors[anchor] = selected;
    }

    queue.fill(0);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (tierId[cell] === 2) offerPassableNeighbors(cell, TIER_TWO_RANK_CHANNEL);
    }
    while (carrierCells < input.tierTwoPassableCount) {
      const cell = heapPop(TIER_TWO_RANK_CHANNEL);
      if (cell < 0) reject('PASSABLE_CARRIER_FRONTIER_EXHAUSTED');
      tierId[cell] = 2;
      carrierCells += 1;
      offerPassableNeighbors(cell, TIER_TWO_RANK_CHANNEL);
    }
    clearHeap();

    const paddingTarget = input.tierTwoCount - input.tierTwoPassableCount;
    let paddingCells = 0;
    state.fill(0);
    head = 0;
    tail = 0;
    paddingSeeds: for (
      let source = 0;
      source < grid.cellCount && paddingCells < paddingTarget;
      source += 1
    ) {
      if (
        tierId[source] !== 2
        || !strategicallyPassableSurface(input.waterRegime[source]!)
      ) continue;
      const count = collectRankedNeighbors(
        source,
        TIER_TWO_PADDING_RANK_CHANNEL,
        cell => tierId![cell] === 1
          && state![cell] === 0
          && !locked(cell)
          && !strategicallyPassableSurface(input.waterRegime[cell]!),
      );
      for (let index = 0; index < count; index += 1) {
        const cell = neighborOrder[index]!;
        state[cell] = 1;
        tierId[cell] = 2;
        queue[tail++] = cell;
        paddingCells += 1;
        if (paddingCells >= paddingTarget) break paddingSeeds;
      }
    }
    while (head < tail && paddingCells < paddingTarget) {
      const source = queue[head++]!;
      const count = collectRankedNeighbors(
        source,
        TIER_TWO_PADDING_RANK_CHANNEL,
        cell => tierId![cell] === 1
          && state![cell] === 0
          && !locked(cell)
          && !strategicallyPassableSurface(input.waterRegime[cell]!),
      );
      for (let index = 0; index < count; index += 1) {
        const cell = neighborOrder[index]!;
        state[cell] = 1;
        tierId[cell] = 2;
        queue[tail++] = cell;
        paddingCells += 1;
        if (paddingCells >= paddingTarget) break;
      }
    }
    if (paddingCells !== paddingTarget) reject('NON_PASSABLE_PADDING_FRONTIER_EXHAUSTED');

    const connectedCount = (
      startTier: number,
      requirePassable: boolean | undefined,
    ): number => {
      state!.fill(0);
      let start = -1;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          tierId![cell] === startTier
          && (
            requirePassable === undefined
            || strategicallyPassableSurface(input.waterRegime[cell]!) === requirePassable
          )
        ) {
          start = cell;
          break;
        }
      }
      if (start < 0) return 0;
      let componentHead = 0;
      let componentTail = 0;
      state![start] = 1;
      queue![componentTail++] = start;
      while (componentHead < componentTail) {
        const cell = queue![componentHead++]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || state![neighbor] === 1
            || tierId![neighbor] !== startTier
            || (
              requirePassable !== undefined
              && strategicallyPassableSurface(input.waterRegime[neighbor]!) !== requirePassable
            )
          ) continue;
          state![neighbor] = 1;
          queue![componentTail++] = neighbor;
        }
      }
      return componentTail;
    };

    const actualTierCounts: [number, number, number] = [0, 0, 0];
    let actualCarrierCells = 0;
    let actualPaddingCells = 0;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const tier = tierId[cell]!;
      if (tier < 1 || tier > 3) fail('LABEL_INVALID');
      actualTierCounts[tier - 1] += 1;
      if (locked(cell) && tier !== 1) fail('LEGACY_LOCK_CHANGED');
      if (tier === 3 && !strategicallyPassableSurface(input.waterRegime[cell]!)) {
        fail('TIER_THREE_NON_PASSABLE');
      }
      if (tier === 2) {
        if (strategicallyPassableSurface(input.waterRegime[cell]!)) actualCarrierCells += 1;
        else actualPaddingCells += 1;
      }
      if (tier !== 3) continue;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && strategicallyPassableSurface(input.waterRegime[neighbor]!)
          && tierId[neighbor] === 1
        ) fail('PASSABLE_FRONTIER_INCOMPLETE');
      }
    }
    if (
      actualTierCounts[2] !== input.tierThreeCount
      || actualTierCounts[1] !== input.tierTwoCount
      || actualCarrierCells !== input.tierTwoPassableCount
      || actualPaddingCells !== paddingTarget
      || connectedCount(3, true) !== input.tierThreeCount
      || connectedCount(2, true) !== input.tierTwoPassableCount
      || connectedCount(2, undefined) !== input.tierTwoCount
    ) fail('FINAL_INVARIANT');

    const result = Object.freeze({
      tierId,
      tierCounts: Object.freeze(actualTierCounts),
      tierTwoPassableCarrierCount: actualCarrierCells,
      tierTwoNonPassablePaddingCount: actualPaddingCells,
    });
    completed = true;
    return result;
  } finally {
    state?.fill(0);
    queue?.fill(0);
    heapPosition?.fill(0);
    rankedNeighbors?.fill(0);
    anchors?.fill(0);
    if (!completed) tierId?.fill(0);
  }
}

/** Focused test-only surface; production integration is intentionally deferred. */
export const greaterRealmWaterFirstTierTestSeams = Object.freeze({
  construct: constructGreaterRealmWaterFirstTiers,
  classifyFailure,
});
