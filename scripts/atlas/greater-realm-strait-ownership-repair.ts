import type { IndexedAxialGrid } from './greater-realm-terrain';
import { GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY } from './greater-realm-topographic-qa';
const MEANINGFUL_ISLAND_MINIMUM_CELLS = 64;
const NARROW_STRAIT_MAXIMUM_DISTANCE = 5;
const MAXIMUM_CORRIDOR_PLANS = 4;
const WATER_OCEAN = 1;
const WATER_SEA = 5;
export type StraitOwnershipRepairInput = Readonly<{
  grid: IndexedAxialGrid;
  regionId: Uint8Array;
  tierId: Uint8Array;
  elevation: Int32Array;
  waterRegime: Uint8Array;
  lockedCell: Uint8Array;
  targetRegion: number;
  seaLevel: number;
  accept?: (regionId: Uint8Array) => boolean;
}>;
export function repairGreaterRealmStraitOwnership(input: StraitOwnershipRepairInput) {
  const { grid, targetRegion, seaLevel } = input;
  const n = grid.cellCount;
  if (!Number.isSafeInteger(n) || n <= 0 || !Number.isInteger(targetRegion) || targetRegion <= 0 || targetRegion > 255
    || !Number.isSafeInteger(seaLevel)
    || [input.regionId, input.tierId, input.elevation, input.waterRegime, input.lockedCell].some(array => array.length !== n)
    || grid.neighbors.length !== n * 6) throw new Error('GREATER_REALM_STRAIT_INPUT_INVALID');
  const targetCell = input.regionId.indexOf(targetRegion);
  if (targetCell < 0) throw new Error('GREATER_REALM_STRAIT_TARGET_MISSING');
  const targetTier = input.tierId[targetCell]!;
  for (let cell = 0; cell < n; cell += 1) {
    if (input.regionId[cell] === targetRegion && input.tierId[cell] !== targetTier) throw new Error('GREATER_REALM_STRAIT_TARGET_TIER_INVALID');
  }
  for (const neighbor of grid.neighbors) if (neighbor < -1 || neighbor >= n) throw new Error('GREATER_REALM_STRAIT_NEIGHBOR_INVALID');
  const labels = new Int32Array(n);
  const meaningful = new Uint8Array(n + 1);
  const nearLand = new Uint8Array(n);
  const seen = new Uint32Array(n);
  const depth = new Uint8Array(n);
  const parent = new Int32Array(n);
  const queue = new Uint32Array(n);
  const trial = input.regionId.slice();
  const donorPool: number[] = [];
  let epoch = 0;
  let islands = 0;
  let retained = false;
  const saltwater = (cell: number) => input.elevation[cell]! <= seaLevel
    && (input.waterRegime[cell] === WATER_OCEAN || input.waterRegime[cell] === WATER_SEA);
  const neighbors = (cell: number, visit: (neighbor: number) => void) => {
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = grid.neighbors[cell * 6 + direction]!;
      if (neighbor >= 0) visit(neighbor);
    }
  };
  // The same elevation-based island mask and saltwater-only distance limit as final QA.
  const walk = (start: number, ownershipOnly: boolean) => {
    epoch += 1;
    let head = 0;
    let tail = 1;
    let firstIsland = 0;
    let firstEndpoint = -1;
    let secondEndpoint = -1;
    queue[0] = start;
    seen[start] = epoch;
    depth[start] = 0;
    parent[start] = -1;
    while (head < tail && secondEndpoint < 0) {
      const cell = queue[head++]!;
      if (depth[cell]! >= NARROW_STRAIT_MAXIMUM_DISTANCE) continue;
      neighbors(cell, neighbor => {
        const label = labels[neighbor]!;
        if (label > 0 && meaningful[label] === 1) {
          if (firstIsland === 0) {
            firstIsland = label;
            firstEndpoint = cell;
          }
          else if (firstIsland !== label && secondEndpoint < 0) secondEndpoint = cell;
          return;
        }
        if (seen[neighbor] === epoch || !saltwater(neighbor)
          || (ownershipOnly ? trial[neighbor] !== targetRegion
            : trial[neighbor] !== targetRegion && (input.lockedCell[neighbor] !== 0 || input.tierId[neighbor] !== input.tierId[start]))) return;
        seen[neighbor] = epoch;
        depth[neighbor] = depth[cell]! + 1;
        parent[neighbor] = cell;
        queue[tail++] = neighbor;
      });
    }
    return secondEndpoint < 0 ? undefined : [firstEndpoint, secondEndpoint] as const;
  };
  const measure = () => {
    let count = 0;
    for (let cell = 0; cell < n; cell += 1) {
      if (trial[cell] === targetRegion && saltwater(cell) && walk(cell, true)) count += 1;
    }
    return count;
  };
  const result = (status: 'unchanged' | 'repaired', transferredCellCount: number, straits: number) => {
    retained = status === 'repaired';
    return { regionId: retained ? trial : input.regionId.slice(), status, transferredCellCount,
      meaningfulIslandCount: islands, narrowStraitCellCount: straits };
  };
  try {
    let component = 0;
    for (let start = 0; start < n; start += 1) {
      if (labels[start] !== 0 || input.regionId[start] !== targetRegion || input.elevation[start]! <= seaLevel) continue;
      component += 1;
      let head = 0;
      let tail = 1;
      queue[0] = start;
      labels[start] = component;
      while (head < tail) neighbors(queue[head++]!, neighbor => {
        if (labels[neighbor] !== 0 || input.regionId[neighbor] !== targetRegion || input.elevation[neighbor]! <= seaLevel) return;
        labels[neighbor] = component;
        queue[tail++] = neighbor;
      });
      if (tail >= MEANINGFUL_ISLAND_MINIMUM_CELLS) {
        meaningful[component] = 1;
        islands += 1;
      }
    }
    const baseline = measure();
    if (islands < GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY.stonewakeMinimumMeaningfulIslands
      || baseline >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY.stonewakeMinimumNarrowIslandStraitCells) return result('unchanged', 0, baseline);
    // Never exchange target water within five hex steps of any target land:
    // this preserves every already valid owned strait, including short branches.
    let head = 0;
    let tail = 0;
    for (let cell = 0; cell < n; cell += 1) {
      if (labels[cell]! <= 0) continue;
      nearLand[cell] = 1;
      depth[cell] = 0;
      queue[tail++] = cell;
    }
    while (head < tail) {
      const cell = queue[head++]!;
      if (depth[cell]! >= NARROW_STRAIT_MAXIMUM_DISTANCE) continue;
      neighbors(cell, neighbor => {
        if (nearLand[neighbor]) return;
        nearLand[neighbor] = 1;
        depth[neighbor] = depth[cell]! + 1;
        queue[tail++] = neighbor;
      });
    }
    let transferred = 0;
    let rounds = 0;
    for (let cell = 0; cell < n; cell += 1) if (trial[cell] === targetRegion && input.tierId[cell] === targetTier
      && saltwater(cell) && input.lockedCell[cell] === 0 && nearLand[cell] === 0) donorPool.push(cell);
    let usedDonors = 0;
    for (let start = 0; start < n && rounds < MAXIMUM_CORRIDOR_PLANS; start += 1) {
      if (!saltwater(start) || input.lockedCell[start] !== 0 || input.tierId[start] !== targetTier) continue;
      const endpoints = walk(start, false);
      if (!endpoints) continue;
      const incoming = new Set<number>();
      for (const endpoint of endpoints) {
        for (let cell = endpoint; cell >= 0; cell = parent[cell]!) {
          if (trial[cell] !== targetRegion) incoming.add(cell);
        }
      }
      if (incoming.size === 0) continue;
      if (donorPool.length - usedDonors < incoming.size) continue;
      const swaps: Array<readonly [number, number]> = [];
      for (const cell of incoming) {
        swaps.push([cell, donorPool[usedDonors + swaps.length]!]);
      }
      if (swaps.length !== incoming.size) continue;
      rounds += 1;
      usedDonors += swaps.length;
      for (const [cell, donor] of swaps) {
        trial[donor] = trial[cell]!;
        trial[cell] = targetRegion;
      }
      transferred += swaps.length;
      const straits = measure();
      if (straits >= GREATER_REALM_REGIONAL_HYDROGEOMORPHOLOGY_POLICY.stonewakeMinimumNarrowIslandStraitCells) {
        if (!input.accept || input.accept(trial)) return result('repaired', transferred, straits);
        // A rejected corridor does not disqualify the remaining bounded plans.
        for (const [cell, donor] of swaps) {
          trial[cell] = trial[donor]!;
          trial[donor] = targetRegion;
        }
        usedDonors -= swaps.length;
        transferred -= swaps.length;
      }
    }
    return result('unchanged', 0, baseline);
  } finally {
    labels.fill(0);
    meaningful.fill(0);
    nearLand.fill(0);
    seen.fill(0);
    depth.fill(0);
    parent.fill(0);
    queue.fill(0);
    if (!retained) trial.fill(0);
    donorPool.fill(0);
  }
}
