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
const INT32_MAX = 0x7fff_ffff;
const UINT32_MAX = 0xffff_ffff;
const WATER = GREATER_REALM_WATER_REGIME_ID;
const TIER_THREE_DEPTH_WEIGHTS = Object.freeze([94, 188, 376, 752] as const);
const TIER_THREE_RANK_CHANNEL = greaterRealmTerrainChannelId('water-first-tier-three-rank');
const TIER_TWO_RANK_CHANNEL = greaterRealmTerrainChannelId('water-first-tier-two-rank');
const TIER_TWO_CONNECTOR_RANK_CHANNEL = greaterRealmTerrainChannelId(
  'water-first-tier-two-connector-rank',
);
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
  selectedVariant: number;
}>;

function fail(code: string): never {
  throw new Error(`GREATER_REALM_WATER_FIRST_TIER_${code}`);
}

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
  return waterRegime === WATER.DRY
    || waterRegime === WATER.RIVER
    || waterRegime === WATER.STREAM;
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
    || unlockedPassableCells < input.tierThreeCount + input.tierTwoPassableCount
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
  let bestPriority: Int32Array | undefined;
  let depthOrDistance: Uint32Array | undefined;
  let rankedNeighbors: Int32Array | undefined;
  let anchors: Int32Array | undefined;
  let completed = false;
  try {
    tierId = new Uint8Array(grid.cellCount);
    state = new Uint8Array(grid.cellCount);
    queue = new Uint32Array(grid.cellCount);
    heapPosition = new Int32Array(grid.cellCount);
    bestPriority = new Int32Array(grid.cellCount);
    depthOrDistance = new Uint32Array(grid.cellCount);
    rankedNeighbors = new Int32Array(HEX_NEIGHBOR_COUNT);
    anchors = new Int32Array(TIER_TWO_REGION_COUNT);

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
    const hasPassableLockedNeighbor = (cell: number): boolean => {
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
        if (
          neighbor >= 0
          && locked(neighbor)
          && strategicallyPassableSurface(input.waterRegime[neighbor]!)
        ) return true;
      }
      return false;
    };
    const tierThreeEligible = (cell: number): boolean => (
      !locked(cell)
      && strategicallyPassableSurface(input.waterRegime[cell]!)
      && !hasPassableLockedNeighbor(cell)
    );
    const passableComplement = (cell: number): boolean => (
      tierId![cell] !== 3
      && !locked(cell)
      && strategicallyPassableSurface(input.waterRegime[cell]!)
    );
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
          && rankedBefore(neighbor, rankedNeighbors![insertion - 1]!, channel)
        ) {
          rankedNeighbors![insertion] = rankedNeighbors![insertion - 1]!;
          insertion -= 1;
        }
        rankedNeighbors![insertion] = neighbor;
        count += 1;
      }
      for (let index = count; index < HEX_NEIGHBOR_COUNT; index += 1) {
        rankedNeighbors![index] = -1;
      }
      return count;
    };

    let heapSize = 0;
    let heapLess = (first: number, second: number): boolean => first < second;
    const heapSwap = (first: number, second: number): void => {
      const firstCell = queue![first]!;
      const secondCell = queue![second]!;
      queue![first] = secondCell;
      queue![second] = firstCell;
      heapPosition![firstCell] = second;
      heapPosition![secondCell] = first;
    };
    const heapOffer = (cell: number): void => {
      let index = heapPosition![cell]!;
      if (index < 0) {
        index = heapSize;
        heapSize += 1;
        queue![index] = cell;
        heapPosition![cell] = index;
      }
      while (index > 0) {
        const parent = Math.floor((index - 1) / 2);
        if (!heapLess(cell, queue![parent]!)) break;
        heapSwap(index, parent);
        index = parent;
      }
    };
    const heapPop = (): number => {
      if (heapSize === 0) return -1;
      const first = queue![0]!;
      heapPosition![first] = -1;
      heapSize -= 1;
      if (heapSize === 0) {
        queue![0] = 0;
        return first;
      }
      const last = queue![heapSize]!;
      queue![heapSize] = 0;
      queue![0] = last;
      heapPosition![last] = 0;
      let index = 0;
      while (true) {
        const left = index * 2 + 1;
        if (left >= heapSize) break;
        const right = left + 1;
        const child = right < heapSize && heapLess(queue![right]!, queue![left]!)
          ? right
          : left;
        if (!heapLess(queue![child]!, queue![index]!)) break;
        heapSwap(index, child);
        index = child;
      }
      return first;
    };
    const clearHeap = (): void => {
      while (heapSize > 0) {
        heapSize -= 1;
        const cell = queue![heapSize]!;
        heapPosition![cell] = -1;
        queue![heapSize] = 0;
      }
    };
    const resetVariant = (): void => {
      heapSize = 0;
      tierId!.fill(1);
      state!.fill(0);
      queue!.fill(0);
      heapPosition!.fill(-1);
      bestPriority!.fill(INT32_MAX);
      depthOrDistance!.fill(UINT32_MAX);
      rankedNeighbors!.fill(-1);
      anchors!.fill(-1);
    };

    const connectedCount = (
      startTier: number,
      requirePassable: boolean | undefined,
    ): number => {
      state!.fill(0);
      queue!.fill(0);
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
      let head = 0;
      let tail = 0;
      state![start] = 1;
      queue![tail++] = start;
      while (head < tail) {
        const cell = queue![head++]!;
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
          queue![tail++] = neighbor;
        }
      }
      return tail;
    };

    const planVariant = (variant: number): string | undefined => {
      resetVariant();
      if (!tierThreeEligible(input.tierThreeSeed)) return 'TIER_THREE_SEED_HALO_BLOCKED';
      const depthWeight = TIER_THREE_DEPTH_WEIGHTS[variant];
      if (depthWeight === undefined) fail('VARIANT_INVALID');
      heapLess = (first, second) => (
        bestPriority![first]! < bestPriority![second]!
        || (
          bestPriority![first] === bestPriority![second]
          && (
            depthOrDistance![first]! < depthOrDistance![second]!
            || (
              depthOrDistance![first] === depthOrDistance![second]
              && first < second
            )
          )
        )
      );
      const offerTierThree = (cell: number, depth: number): void => {
        if (cell < 0 || tierId![cell] !== 1 || !tierThreeEligible(cell)) return;
        const priority = input.terrainCost[cell]! + depth * depthWeight;
        if (!Number.isSafeInteger(priority) || priority > INT32_MAX || priority < -INT32_MAX - 1) {
          fail('TIER_THREE_PRIORITY_OVERFLOW');
        }
        if (
          priority > bestPriority![cell]!
          || (
            priority === bestPriority![cell]
            && depth >= depthOrDistance![cell]!
          )
        ) return;
        bestPriority![cell] = priority;
        depthOrDistance![cell] = depth;
        heapOffer(cell);
      };
      let tierThreeCells = 1;
      tierId![input.tierThreeSeed] = 3;
      for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
        offerTierThree(
          grid.neighbors[input.tierThreeSeed * HEX_NEIGHBOR_COUNT + direction]!,
          1,
        );
      }
      while (tierThreeCells < input.tierThreeCount) {
        const cell = heapPop();
        if (cell < 0) return 'TIER_THREE_FRONTIER_EXHAUSTED';
        if (tierId![cell] !== 1) fail('TIER_THREE_HEAP_LABEL_MISMATCH');
        tierId![cell] = 3;
        tierThreeCells += 1;
        const nextDepth = depthOrDistance![cell]! + 1;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          offerTierThree(grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!, nextDepth);
        }
      }
      clearHeap();

      let boundaryCount = 0;
      let boundaryRoot = -1;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (tierId![cell] !== 3) continue;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (
            neighbor < 0
            || tierId![neighbor] === 3
            || !strategicallyPassableSurface(input.waterRegime[neighbor]!)
          ) continue;
          if (locked(neighbor)) return 'PASSABLE_FRONTIER_LOCKED';
          if (tierId![neighbor] === 1) {
            tierId![neighbor] = 2;
            boundaryCount += 1;
            if (
              boundaryRoot < 0
              || rankedBefore(neighbor, boundaryRoot, TIER_TWO_RANK_CHANNEL)
            ) boundaryRoot = neighbor;
          }
        }
      }
      if (boundaryCount === 0 || boundaryCount > input.tierTwoPassableCount) {
        return 'PASSABLE_FRONTIER_CAPACITY_INVALID';
      }

      const dryInnerContact = (cell: number): boolean => {
        if (
          tierId![cell] !== 2
          || input.waterRegime[cell] !== WATER.DRY
        ) return false;
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
            separation = Math.min(separation, axialDistance(grid, cell, anchors![prior]!));
          }
          if (anchor > 0 && separation < MINIMUM_DRY_ANCHOR_SEPARATION) continue;
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
        if (selected < 0) return 'DRY_INNER_CONTACTS_MISSING';
        anchors![anchor] = selected;
      }

      // Exact 0/1 preflight: mandatory boundary cells are free and every
      // additional passable connector cell costs one. Search exploration is
      // never committed; only the unique predecessor-path union is charged.
      state!.fill(0);
      depthOrDistance!.fill(UINT32_MAX);
      // T3 priority scratch is now the signed predecessor table. Before path
      // reconstruction every Tier-II label is a mandatory boundary cell.
      bestPriority!.fill(-1);
      heapLess = (first, second) => (
        depthOrDistance![first]! < depthOrDistance![second]!
        || (
          depthOrDistance![first] === depthOrDistance![second]
          && rankedBefore(first, second, TIER_TWO_CONNECTOR_RANK_CHANNEL)
        )
      );
      depthOrDistance![boundaryRoot] = 0;
      heapOffer(boundaryRoot);
      let settledCells = 0;
      let settledBoundaryCells = 0;
      while (heapSize > 0) {
        const cell = heapPop();
        if (cell < 0 || state![cell] === 1) fail('CONNECTOR_HEAP_INVARIANT');
        state![cell] = 1;
        settledCells += 1;
        if (tierId![cell] === 2) settledBoundaryCells += 1;
        if (
          settledBoundaryCells === boundaryCount
          && settledCells >= input.tierTwoPassableCount
        ) break;
        const distance = depthOrDistance![cell]!;
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * HEX_NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || state![neighbor] === 1 || !passableComplement(neighbor)) continue;
          const candidateDistance = distance + (tierId![neighbor] === 2 ? 0 : 1);
          if (candidateDistance > depthOrDistance![neighbor]!) continue;
          if (
            candidateDistance === depthOrDistance![neighbor]
            && bestPriority![neighbor] >= 0
            && !rankedBefore(cell, bestPriority![neighbor]!, TIER_TWO_CONNECTOR_RANK_CHANNEL)
          ) continue;
          depthOrDistance![neighbor] = candidateDistance;
          bestPriority![neighbor] = cell;
          heapOffer(neighbor);
        }
      }
      if (settledBoundaryCells !== boundaryCount) {
        clearHeap();
        return 'PASSABLE_COMPLEMENT_DISCONNECTED';
      }
      if (settledCells < input.tierTwoPassableCount) {
        clearHeap();
        return 'PASSABLE_COMPLEMENT_CAPACITY_EXHAUSTED';
      }
      clearHeap();

      state!.fill(0);
      state![boundaryRoot] = 1;
      let carrierCells = boundaryCount;
      for (let target = 0; target < grid.cellCount; target += 1) {
        if (tierId![target] !== 2 || state![target] === 1) continue;
        let pathLength = 0;
        let cursor = target;
        while (cursor >= 0 && state![cursor] === 0) {
          if (pathLength >= grid.cellCount) fail('CONNECTOR_PREDECESSOR_CYCLE');
          queue![pathLength++] = cursor;
          cursor = bestPriority![cursor]!;
        }
        if (cursor < 0) fail('CONNECTOR_PREDECESSOR_MISSING');
        while (pathLength > 0) {
          pathLength -= 1;
          const cell = queue![pathLength]!;
          queue![pathLength] = 0;
          state![cell] = 1;
          if (tierId![cell] === 1) {
            if (!passableComplement(cell)) fail('CONNECTOR_DOMAIN_MISMATCH');
            tierId![cell] = 2;
            carrierCells += 1;
          } else if (tierId![cell] !== 2) {
            fail('CONNECTOR_LABEL_MISMATCH');
          }
        }
      }
      if (carrierCells > input.tierTwoPassableCount) {
        return 'PASSABLE_CONNECTOR_BUDGET_EXHAUSTED';
      }

      heapLess = (first, second) => rankedBefore(first, second, TIER_TWO_RANK_CHANNEL);
      const offerCarrierNeighbors = (source: number): void => {
        for (let direction = 0; direction < HEX_NEIGHBOR_COUNT; direction += 1) {
          const cell = grid.neighbors[source * HEX_NEIGHBOR_COUNT + direction]!;
          if (cell >= 0 && tierId![cell] === 1 && passableComplement(cell)) heapOffer(cell);
        }
      };
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (
          tierId![cell] === 2
          && strategicallyPassableSurface(input.waterRegime[cell]!)
        ) offerCarrierNeighbors(cell);
      }
      while (carrierCells < input.tierTwoPassableCount) {
        const cell = heapPop();
        if (cell < 0) fail('PASSABLE_CARRIER_PREFLIGHT_MISMATCH');
        if (tierId![cell] !== 1 || !passableComplement(cell)) {
          fail('PASSABLE_CARRIER_LABEL_MISMATCH');
        }
        tierId![cell] = 2;
        carrierCells += 1;
        offerCarrierNeighbors(cell);
      }
      clearHeap();

      const paddingTarget = input.tierTwoCount - input.tierTwoPassableCount;
      let paddingCells = 0;
      state!.fill(0);
      let head = 0;
      let tail = 0;
      paddingSeeds: for (
        let source = 0;
        source < grid.cellCount && paddingCells < paddingTarget;
        source += 1
      ) {
        if (
          tierId![source] !== 2
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
          const cell = rankedNeighbors![index]!;
          state![cell] = 1;
          tierId![cell] = 2;
          queue![tail++] = cell;
          paddingCells += 1;
          if (paddingCells >= paddingTarget) break paddingSeeds;
        }
      }
      while (head < tail && paddingCells < paddingTarget) {
        const source = queue![head++]!;
        const count = collectRankedNeighbors(
          source,
          TIER_TWO_PADDING_RANK_CHANNEL,
          cell => tierId![cell] === 1
            && state![cell] === 0
            && !locked(cell)
            && !strategicallyPassableSurface(input.waterRegime[cell]!),
        );
        for (let index = 0; index < count; index += 1) {
          const cell = rankedNeighbors![index]!;
          state![cell] = 1;
          tierId![cell] = 2;
          queue![tail++] = cell;
          paddingCells += 1;
          if (paddingCells >= paddingTarget) break;
        }
      }
      if (paddingCells !== paddingTarget) return 'NON_PASSABLE_PADDING_FRONTIER_EXHAUSTED';

      const actualTierCounts: [number, number, number] = [0, 0, 0];
      let actualCarrierCells = 0;
      let actualPaddingCells = 0;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        const tier = tierId![cell]!;
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
            && tierId![neighbor] !== 2
            && tierId![neighbor] !== 3
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
      for (let anchor = 0; anchor < TIER_TWO_REGION_COUNT; anchor += 1) {
        const cell = anchors![anchor]!;
        if (!dryInnerContact(cell) || tierId![cell] !== 2) fail('DRY_CONTACT_PROOF_MISMATCH');
        for (let prior = 0; prior < anchor; prior += 1) {
          if (axialDistance(grid, cell, anchors![prior]!) < MINIMUM_DRY_ANCHOR_SEPARATION) {
            fail('DRY_CONTACT_SEPARATION_MISMATCH');
          }
        }
      }
      return undefined;
    };

    let selectedVariant = -1;
    let lastFailure = 'UNKNOWN';
    for (let variant = 0; variant < TIER_THREE_DEPTH_WEIGHTS.length; variant += 1) {
      const failure = planVariant(variant);
      if (failure) {
        lastFailure = failure;
        continue;
      }
      selectedVariant = variant;
      break;
    }
    if (selectedVariant < 0) reject(`VARIANTS_EXHAUSTED_${lastFailure}`);

    const tierCounts: [number, number, number] = [
      grid.cellCount - input.tierTwoCount - input.tierThreeCount,
      input.tierTwoCount,
      input.tierThreeCount,
    ];
    const result = Object.freeze({
      tierId,
      tierCounts: Object.freeze(tierCounts),
      tierTwoPassableCarrierCount: input.tierTwoPassableCount,
      tierTwoNonPassablePaddingCount: input.tierTwoCount - input.tierTwoPassableCount,
      selectedVariant,
    });
    completed = true;
    return result;
  } finally {
    state?.fill(0);
    queue?.fill(0);
    heapPosition?.fill(0);
    bestPriority?.fill(0);
    depthOrDistance?.fill(0);
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
