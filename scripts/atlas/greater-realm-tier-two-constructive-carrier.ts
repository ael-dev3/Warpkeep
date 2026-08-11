import {
  greaterRealmCounterRandomU32,
  greaterRealmTerrainChannelId,
  isCanonicalGreaterRealmAxialGrid,
  type GreaterRealmTerrainSeed,
  type IndexedAxialGrid,
} from './greater-realm-terrain';

const CHILD_COUNT = 6;
const PARENT_FIRST = 6;
const PARENT_COUNT = 3;
const THRONE_REGION = 9;
const REGION_COUNT = 10;
const NEIGHBOR_COUNT = 6;
const WATER_DRY = 0;
const PRIMARY_RESERVE = 512;
const MINIMUM_ANCHOR_SEPARATION = 8;
const MAXIMUM_PLANS = 4;

type ScratchArray = Uint8Array | Uint32Array | Int8Array | Int32Array;

export type GreaterRealmConstructiveTierTwoStrategy = Readonly<{
  tierId: Uint8Array;
  regionId: Uint8Array;
  tierCounts: readonly [number, number, number];
  regionCounts: readonly number[];
}>;

export type GreaterRealmConstructiveTierTwoApronBundle = Readonly<{
  slotChild: number;
  sourceChild: number;
  tierOneCells: readonly number[];
  tierTwoCells: readonly number[];
}>;

export type GreaterRealmConstructiveTierTwoApronAuthority = Readonly<{
  bundles: readonly GreaterRealmConstructiveTierTwoApronBundle[];
  clear: () => void;
}>;

// The production query must delegate to the exact global dry/clearance/path and
// ownership-compatibility authority; adjacency alone is never sufficient proof.
export type GreaterRealmConstructiveTierTwoApronQuery = (
  strategy: GreaterRealmConstructiveTierTwoStrategy,
) => GreaterRealmConstructiveTierTwoApronAuthority | undefined;

export type GreaterRealmConstructiveTierTwoPlan = Readonly<{
  strategy: GreaterRealmConstructiveTierTwoStrategy;
}>;

export type GreaterRealmConstructiveTierTwoInput = Readonly<{
  grid: IndexedAxialGrid;
  candidateSeed: GreaterRealmTerrainSeed;
  strategy: GreaterRealmConstructiveTierTwoStrategy;
  waterRegime: Uint8Array;
  legacyProtectedCell: Uint8Array;
  legacyReserveCell: Uint8Array;
  limits?: Readonly<{ maximumPlans?: number }>;
}>;

function fail(code: string): never {
  throw new Error(code);
}

function passable(water: number): boolean {
  return water === 0 || water === 3 || water === 4;
}

function tierForRegion(region: number): number {
  return region < CHILD_COUNT ? 1 : region < THRONE_REGION ? 2 : 3;
}

function distance(grid: IndexedAxialGrid, first: number, second: number): number {
  const q = grid.q[first]! - grid.q[second]!;
  const r = grid.r[first]! - grid.r[second]!;
  return Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
}

function validateInput(input: GreaterRealmConstructiveTierTwoInput): number {
  const { grid, strategy } = input;
  if (!isCanonicalGreaterRealmAxialGrid(grid)) {
    fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_GRID_INVALID');
  }
  if (
    !(strategy.tierId instanceof Uint8Array)
    || !(strategy.regionId instanceof Uint8Array)
    || !(input.waterRegime instanceof Uint8Array)
    || !(input.legacyProtectedCell instanceof Uint8Array)
    || !(input.legacyReserveCell instanceof Uint8Array)
    || strategy.tierId.length !== grid.cellCount
    || strategy.regionId.length !== grid.cellCount
    || input.waterRegime.length !== grid.cellCount
    || input.legacyProtectedCell.length !== grid.cellCount
    || input.legacyReserveCell.length !== grid.cellCount
    || strategy.tierCounts.length !== 3
    || strategy.regionCounts.length !== REGION_COUNT
  ) fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_INPUT_INVALID');
  const maximumPlans = input.limits?.maximumPlans ?? MAXIMUM_PLANS;
  if (
    !Number.isSafeInteger(maximumPlans)
    || maximumPlans < 1
    || maximumPlans > MAXIMUM_PLANS
  ) fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_LIMIT_INVALID');
  const tiers = [0, 0, 0];
  const regions = Array<number>(REGION_COUNT).fill(0);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const tier = strategy.tierId[cell]!;
    const region = strategy.regionId[cell]!;
    if (
      region >= REGION_COUNT
      || tier !== tierForRegion(region)
      || input.waterRegime[cell]! > 6
      || input.legacyProtectedCell[cell]! > 1
      || input.legacyReserveCell[cell]! > 1
    ) fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_LABEL_INVALID');
    tiers[tier - 1] += 1;
    regions[region] += 1;
  }
  if (
    tiers.some((count, tier) => count !== strategy.tierCounts[tier])
    || regions.some((count, region) => count !== strategy.regionCounts[region])
  ) fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_COUNT_INVALID');
  // Validate the seed even when geography exits before ranking a component.
  greaterRealmCounterRandomU32(input.candidateSeed, 0, 0, 0);
  return maximumPlans;
}

function validateAprons(input: Readonly<{
  authority: GreaterRealmConstructiveTierTwoApronAuthority;
  grid: IndexedAxialGrid;
  strategy: GreaterRealmConstructiveTierTwoStrategy;
  waterRegime: Uint8Array;
  locked: Uint8Array;
  legacyProtectedCell: Uint8Array;
  legacyReserveCell: Uint8Array;
  carrier: Uint8Array;
  occupied: Uint8Array;
}>): boolean {
  const {
    authority, grid, strategy, waterRegime, locked,
    legacyProtectedCell, legacyReserveCell, carrier, occupied,
  } = input;
  if (authority.bundles.length !== CHILD_COUNT) return false;
  occupied.fill(0);
  let slotBits = 0;
  for (const bundle of authority.bundles) {
    if (
      !Number.isSafeInteger(bundle.slotChild)
      || !Number.isSafeInteger(bundle.sourceChild)
      || bundle.slotChild < 0 || bundle.slotChild >= CHILD_COUNT
      || bundle.sourceChild < 0 || bundle.sourceChild >= CHILD_COUNT
      || (bundle.slotChild === 0) !== (bundle.sourceChild === 0)
      || (slotBits & (1 << bundle.slotChild)) !== 0
      || bundle.tierOneCells.length === 0
      || bundle.tierTwoCells.length === 0
    ) return false;
    slotBits |= 1 << bundle.slotChild;
    for (const cell of bundle.tierOneCells) {
      if (
        !Number.isSafeInteger(cell)
        || cell < 0
        || cell >= grid.cellCount
        || occupied[cell] === 1
        || legacyProtectedCell[cell] === 1
        || legacyReserveCell[cell] === 1
        || waterRegime[cell] !== WATER_DRY
        || strategy.tierId[cell] !== 1
        || strategy.regionId[cell] !== bundle.sourceChild
      ) return false;
      occupied[cell] = 1;
    }
    for (const cell of bundle.tierTwoCells) {
      if (
        !Number.isSafeInteger(cell)
        || cell < 0
        || cell >= grid.cellCount
        || occupied[cell] === 1
        || locked[cell] === 1
        || carrier[cell] !== 1
        || waterRegime[cell] !== WATER_DRY
        || strategy.tierId[cell] !== 2
      ) return false;
      occupied[cell] = 1;
    }
  }
  return slotBits === (1 << CHILD_COUNT) - 1;
}

export function deriveGreaterRealmConstructiveTierTwoPlans(
  input: GreaterRealmConstructiveTierTwoInput,
  queryAprons: GreaterRealmConstructiveTierTwoApronQuery,
): readonly GreaterRealmConstructiveTierTwoPlan[] {
  const maximumPlans = validateInput(input);
  if (typeof queryAprons !== 'function') {
    fail('GREATER_REALM_CONSTRUCTIVE_TIER_TWO_APRON_QUERY_INVALID');
  }
  const { grid, strategy, waterRegime } = input;
  const owned = new Set<ScratchArray>();
  const own = <ArrayType extends ScratchArray>(array: ArrayType): ArrayType => {
    owned.add(array);
    return array;
  };
  const release = (array: ScratchArray): void => {
    array.fill(0);
    owned.delete(array);
  };
  const plans: GreaterRealmConstructiveTierTwoPlan[] = [];
  try {
    const locked = own(new Uint8Array(grid.cellCount));
    const naturalPassable = own(new Uint8Array(grid.cellCount));
    const mutableParentSupply = own(new Uint32Array(PARENT_COUNT));
    let mutableNonPassable = 0;
    let thronePassable = 0;
    let lockedPassableParent = false;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const region = strategy.regionId[cell]!;
      const immutable = region === 0
        || region === THRONE_REGION
        || input.legacyProtectedCell[cell] === 1
        || input.legacyReserveCell[cell] === 1;
      if (immutable) locked[cell] = 1;
      if (region === THRONE_REGION && passable(waterRegime[cell]!)) thronePassable += 1;
      if (region >= PARENT_FIRST && region < THRONE_REGION) {
        if (immutable) {
          if (passable(waterRegime[cell]!)) lockedPassableParent = true;
        } else mutableParentSupply[region - PARENT_FIRST] += 1;
      }
      if (!immutable && !passable(waterRegime[cell]!)) mutableNonPassable += 1;
      if (!immutable && passable(waterRegime[cell]!)) naturalPassable[cell] = 1;
    }
    const minimumPrimary = thronePassable + PRIMARY_RESERVE;
    let totalMutableParents = 0;
    for (const supply of mutableParentSupply) {
      if (supply < minimumPrimary) return Object.freeze([]);
      totalMutableParents += supply;
    }
    const baseCarrier = Math.max(
      minimumPrimary * PARENT_COUNT,
      totalMutableParents - mutableNonPassable,
    );
    if (lockedPassableParent || baseCarrier > totalMutableParents) {
      return Object.freeze([]);
    }

    const componentId = own(new Int32Array(grid.cellCount));
    const componentSize = own(new Uint32Array(grid.cellCount));
    const componentOverlap = own(new Uint32Array(grid.cellCount));
    const componentInner = own(new Uint32Array(grid.cellCount));
    const componentFirst = own(new Int32Array(grid.cellCount));
    const componentAttempted = own(new Uint8Array(grid.cellCount));
    const queue = own(new Uint32Array(grid.cellCount));
    componentId.fill(-1);
    componentFirst.fill(-1);
    let componentCount = 0;
    for (let start = 0; start < grid.cellCount; start += 1) {
      if (naturalPassable[start] !== 1 || componentId[start] >= 0) continue;
      let head = 0;
      let tail = 0;
      componentId[start] = componentCount;
      componentFirst[componentCount] = start;
      queue[tail++] = start;
      while (head < tail) {
        const cell = queue[head++]!;
        componentSize[componentCount] += 1;
        if (strategy.tierId[cell] === 2) componentOverlap[componentCount] += 1;
        if (waterRegime[cell] === WATER_DRY) {
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            if (
              neighbor >= 0
              && strategy.regionId[neighbor] === THRONE_REGION
              && waterRegime[neighbor] === WATER_DRY
            ) {
              componentInner[componentCount] += 1;
              break;
            }
          }
        }
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor < 0 || naturalPassable[neighbor] !== 1 || componentId[neighbor] >= 0) {
            continue;
          }
          componentId[neighbor] = componentCount;
          queue[tail++] = neighbor;
        }
      }
      componentCount += 1;
    }

    const previous = own(new Int32Array(grid.cellCount));
    const carrier = own(new Uint8Array(grid.cellCount));
    const assignedParent = own(new Int8Array(grid.cellCount));
    const occupied = naturalPassable;
    const anchors = own(new Int32Array(PARENT_COUNT));
    const insideParents = own(new Uint32Array(PARENT_COUNT));
    const insideChildren = own(new Uint32Array(CHILD_COUNT));
    const promotionByParent = own(new Uint32Array(PARENT_COUNT));
    const remainingPromotion = own(new Uint32Array(PARENT_COUNT));
    const actualTierCounts = own(new Uint32Array(3));
    const actualRegionCounts = own(new Uint32Array(REGION_COUNT));
    const parentCarrierCounts = own(new Uint32Array(PARENT_COUNT));
    const tierCounts = Object.freeze([...strategy.tierCounts] as [number, number, number]);
    const regionCounts = Object.freeze([...strategy.regionCounts]);
    const validateFinal = (
      tierId: Uint8Array,
      regionId: Uint8Array,
      carrierCount: number,
    ): boolean => {
      actualTierCounts.fill(0);
      actualRegionCounts.fill(0);
      parentCarrierCounts.fill(0);
      let valid = true;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        const region = regionId[cell]!;
        const tier = tierId[cell]!;
        if (region >= REGION_COUNT || tier !== tierForRegion(region)) {
          valid = false;
          continue;
        }
        actualTierCounts[tier - 1] += 1;
        actualRegionCounts[region] += 1;
        if (locked[cell] === 1 && (tier !== strategy.tierId[cell]
          || region !== strategy.regionId[cell])) valid = false;
        const isCarrierLabel = tier === 2 && passable(waterRegime[cell]!);
        if ((carrier[cell] === 1) !== isCarrierLabel) valid = false;
        if (isCarrierLabel) parentCarrierCounts[region - PARENT_FIRST] += 1;
      }
      if (actualTierCounts.some((count, tier) => count !== strategy.tierCounts[tier])
        || actualRegionCounts.some((count, region) => count !== strategy.regionCounts[region])
        || parentCarrierCounts.some(count => count < minimumPrimary)) valid = false;
      assignedParent.fill(0);
      let head = 0;
      let tail = 0;
      const start = carrier.findIndex(value => value === 1);
      if (start < 0) return false;
      assignedParent[start] = 1;
      queue[tail++] = start;
      while (head < tail) {
        const cell = queue[head++]!;
        for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
          const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
          if (neighbor >= 0 && carrier[neighbor] === 1 && assignedParent[neighbor] === 0) {
            assignedParent[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }
      }
      return valid && tail === carrierCount;
    };
    for (let planOrdinal = 0; planOrdinal < maximumPlans; planOrdinal += 1) {
      previous.fill(-2);
      carrier.fill(0);
      assignedParent.fill(-1);
      anchors.fill(-1);
      insideParents.fill(0);
      insideChildren.fill(0);
      promotionByParent.fill(0);
      remainingPromotion.fill(0);
      const channel = greaterRealmTerrainChannelId(
        `tier-two-constructive-carrier-plan-${planOrdinal}`,
      );
      let selectedComponent = -1;
      let selectedOverlap = -1;
      let selectedInner = -1;
      let selectedRank = 0xffff_ffff;
      for (let pass = 0; pass < 2 && selectedComponent < 0; pass += 1) {
        for (let component = 0; component < componentCount; component += 1) {
          if (componentAttempted[component] === 1
            || componentSize[component]! < baseCarrier || componentInner[component]! < 3) continue;
          const first = componentFirst[component]!;
          const rank = greaterRealmCounterRandomU32(
            input.candidateSeed, channel, grid.q[first]!, grid.r[first]!,
          );
          if (componentOverlap[component]! > selectedOverlap
            || (componentOverlap[component] === selectedOverlap
              && componentInner[component]! > selectedInner)
            || (componentOverlap[component] === selectedOverlap
              && componentInner[component] === selectedInner && rank < selectedRank)) {
            selectedComponent = component;
            selectedOverlap = componentOverlap[component]!;
            selectedInner = componentInner[component]!;
            selectedRank = rank;
          }
        }
        if (selectedComponent < 0) componentAttempted.fill(0);
      }
      if (selectedComponent < 0) break;
      componentAttempted[selectedComponent] = 1;

      let anchorCount = 0;
      for (let slot = 0; slot < PARENT_COUNT; slot += 1) {
        let selected = -1;
        let selectedScore = 0xffff_ffff;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (componentId[cell] !== selectedComponent || waterRegime[cell] !== WATER_DRY) continue;
          let inner = false;
          for (let direction = 0; direction < NEIGHBOR_COUNT; direction += 1) {
            const neighbor = grid.neighbors[cell * NEIGHBOR_COUNT + direction]!;
            if (neighbor >= 0 && strategy.regionId[neighbor] === THRONE_REGION
              && waterRegime[neighbor] === WATER_DRY) inner = true;
          }
          if (!inner) continue;
          let separated = true;
          for (let prior = 0; prior < anchorCount; prior += 1) {
            if (distance(grid, cell, anchors[prior]!) < MINIMUM_ANCHOR_SEPARATION) {
              separated = false;
            }
          }
          if (!separated) continue;
          const score = greaterRealmCounterRandomU32(
            input.candidateSeed, channel, grid.q[cell]!, grid.r[cell]!, slot,
          );
          if (selected < 0 || score < selectedScore
            || (score === selectedScore && cell < selected)) {
            selected = cell;
            selectedScore = score;
          }
        }
        if (selected < 0) break;
        anchors[anchorCount++] = selected;
      }
      if (anchorCount !== PARENT_COUNT) continue;

      let head = 0;
      let tail = 0;
      previous[anchors[0]!] = -1;
      queue[tail++] = anchors[0]!;
      while (head < tail) {
        const cell = queue[head++]!;
        const offset = greaterRealmCounterRandomU32(
          input.candidateSeed, channel, grid.q[cell]!, grid.r[cell]!, 4,
        ) % NEIGHBOR_COUNT;
        for (let step = 0; step < NEIGHBOR_COUNT; step += 1) {
          const neighbor = grid.neighbors[
            cell * NEIGHBOR_COUNT + (offset + step) % NEIGHBOR_COUNT
          ]!;
          if (neighbor < 0 || componentId[neighbor] !== selectedComponent
            || previous[neighbor] !== -2) continue;
          previous[neighbor] = cell;
          queue[tail++] = neighbor;
        }
      }
      if (tail !== componentSize[selectedComponent]) continue;

      // This is a political-label subset of one natural passable component,
      // grown by terrain frontier; it never synthesizes a radial ownership ring.
      let carrierCount = 0;
      const addCarrier = (cell: number): boolean => {
        if (carrier[cell] === 1) return true;
        if (carrierCount >= totalMutableParents) return false;
        carrier[cell] = 1;
        carrierCount += 1;
        const region = strategy.regionId[cell]!;
        if (region < CHILD_COUNT) insideChildren[region] += 1;
        else insideParents[region - PARENT_FIRST] += 1;
        return true;
      };
      let treeValid = true;
      for (let slot = 0; slot < PARENT_COUNT; slot += 1) {
        for (let cell = anchors[slot]!; cell >= 0 && carrier[cell] !== 1; cell = previous[cell]!) {
          treeValid = addCarrier(cell) && treeValid;
        }
      }
      if (!treeValid) continue;
      const promotionFeasible = (): boolean => {
        let demand = 0;
        for (let parent = 0; parent < PARENT_COUNT; parent += 1) {
          demand += Math.max(0, minimumPrimary - insideParents[parent]!);
        }
        const children = insideChildren.reduce((sum, count) => sum + count, 0);
        return carrierCount >= baseCarrier && children >= demand;
      };
      head = 0;
      tail = 0;
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (carrier[cell] === 1) queue[tail++] = cell;
      }
      while (head < tail && !promotionFeasible() && carrierCount < totalMutableParents) {
        const cell = queue[head++]!;
        const offset = greaterRealmCounterRandomU32(
          input.candidateSeed, channel, grid.q[cell]!, grid.r[cell]!, 5,
        ) % NEIGHBOR_COUNT;
        for (let step = 0; step < NEIGHBOR_COUNT; step += 1) {
          const neighbor = grid.neighbors[
            cell * NEIGHBOR_COUNT + (offset + step) % NEIGHBOR_COUNT
          ]!;
          if (neighbor < 0 || componentId[neighbor] !== selectedComponent
            || carrier[neighbor] === 1) continue;
          if (!addCarrier(neighbor)) break;
          queue[tail++] = neighbor;
          if (promotionFeasible()) break;
        }
      }
      if (!promotionFeasible()) continue;

      let promotions = insideChildren.reduce((sum, count) => sum + count, 0);
      for (let parent = 0; parent < PARENT_COUNT; parent += 1) {
        promotionByParent[parent] = Math.max(0, minimumPrimary - insideParents[parent]!);
        promotions -= promotionByParent[parent]!;
      }
      while (promotions > 0) {
        let selected = -1;
        for (let parent = 0; parent < PARENT_COUNT; parent += 1) {
          const capacity = mutableParentSupply[parent]! - insideParents[parent]!
            - promotionByParent[parent]!;
          if (capacity <= 0) continue;
          if (selected < 0 || insideParents[parent]! + promotionByParent[parent]!
            < insideParents[selected]! + promotionByParent[selected]!) selected = parent;
        }
        if (selected < 0) break;
        promotionByParent[selected] += 1;
        promotions -= 1;
      }
      if (promotions !== 0) continue;
      remainingPromotion.set(promotionByParent);
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (carrier[cell] !== 1 || strategy.tierId[cell] !== 1) continue;
        const offset = greaterRealmCounterRandomU32(
          input.candidateSeed, channel, grid.q[cell]!, grid.r[cell]!, 6,
        ) % PARENT_COUNT;
        for (let step = 0; step < PARENT_COUNT; step += 1) {
          const parent = (offset + step) % PARENT_COUNT;
          if (remainingPromotion[parent]! === 0) continue;
          assignedParent[cell] = parent;
          remainingPromotion[parent] -= 1;
          break;
        }
      }
      if (remainingPromotion.some(count => count !== 0)) continue;

      const tierId = own(new Uint8Array(strategy.tierId));
      const regionId = own(new Uint8Array(strategy.regionId));
      let retained = false;
      try {
        let swapsValid = true;
        for (let parent = 0; parent < PARENT_COUNT && swapsValid; parent += 1) {
        let passableCursor = 0;
        let nonPassableCursor = 0;
        for (let cell = 0; cell < grid.cellCount; cell += 1) {
          if (assignedParent[cell] !== parent) continue;
          let donor = -1;
          while (passableCursor < grid.cellCount) {
            const candidate = passableCursor++;
            if (carrier[candidate] === 0 && locked[candidate] === 0
              && regionId[candidate] === PARENT_FIRST + parent
              && passable(waterRegime[candidate]!)) {
              donor = candidate;
              break;
            }
          }
          while (donor < 0 && nonPassableCursor < grid.cellCount) {
            const candidate = nonPassableCursor++;
            if (carrier[candidate] === 0 && locked[candidate] === 0
              && regionId[candidate] === PARENT_FIRST + parent
              && !passable(waterRegime[candidate]!)) donor = candidate;
          }
          if (donor < 0) {
            swapsValid = false;
            break;
          }
          const child = regionId[cell]!;
          regionId[cell] = PARENT_FIRST + parent;
          tierId[cell] = 2;
          regionId[donor] = child;
          tierId[donor] = 1;
        }
        }
        let nonPassableChildCursor = 0;
        for (let cell = 0; cell < grid.cellCount && swapsValid; cell += 1) {
        if (carrier[cell] === 1 || tierId[cell] !== 2
          || !passable(waterRegime[cell]!)) continue;
        let donor = -1;
        while (nonPassableChildCursor < grid.cellCount) {
          const candidate = nonPassableChildCursor++;
          if (carrier[candidate] === 0 && locked[candidate] === 0
            && tierId[candidate] === 1 && !passable(waterRegime[candidate]!)) {
            donor = candidate;
            break;
          }
        }
        if (donor < 0) {
          swapsValid = false;
          break;
        }
        const parentRegion = regionId[cell]!;
        regionId[cell] = regionId[donor]!;
        tierId[cell] = 1;
        regionId[donor] = parentRegion;
        tierId[donor] = 2;
        }
        assignedParent.fill(0);
        if (!swapsValid || !validateFinal(tierId, regionId, carrierCount)) continue;

        const provisional = Object.freeze({ tierId, regionId, tierCounts, regionCounts });
        const queryTierId = own(new Uint8Array(tierId));
        const queryRegionId = own(new Uint8Array(regionId));
        const queryStrategy = Object.freeze({
          tierId: queryTierId, regionId: queryRegionId, tierCounts, regionCounts,
        });
        let apronAuthority: GreaterRealmConstructiveTierTwoApronAuthority | undefined;
        let apronsValid = false;
        try {
          apronAuthority = queryAprons(queryStrategy);
          apronsValid = apronAuthority !== undefined && validateAprons({
            authority: apronAuthority, grid, strategy: provisional, waterRegime, locked,
            legacyProtectedCell: input.legacyProtectedCell,
            legacyReserveCell: input.legacyReserveCell,
            carrier, occupied,
          });
        } finally {
          try {
            apronAuthority?.clear();
          } finally {
            release(queryTierId);
            release(queryRegionId);
          }
        }
        if (!apronsValid) continue;
        plans.push(Object.freeze({ strategy: provisional }));
        retained = true;
      } finally {
        if (!retained) {
          release(tierId);
          release(regionId);
        }
      }
    }
    const result = Object.freeze(plans);
    for (const plan of result) {
      owned.delete(plan.strategy.tierId);
      owned.delete(plan.strategy.regionId);
    }
    return result;
  } finally {
    for (const array of owned) array.fill(0);
  }
}

export function clearGreaterRealmConstructiveTierTwoPlan(
  plan: GreaterRealmConstructiveTierTwoPlan,
): void {
  plan.strategy.tierId.fill(0);
  plan.strategy.regionId.fill(0);
}
