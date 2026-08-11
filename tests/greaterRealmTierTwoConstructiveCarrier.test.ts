import { describe, expect, it, vi } from 'vitest';

import {
  clearGreaterRealmConstructiveTierTwoPlan,
  deriveGreaterRealmConstructiveTierTwoPlans,
  type GreaterRealmConstructiveTierTwoApronQuery,
  type GreaterRealmConstructiveTierTwoStrategy,
} from '../scripts/atlas/greater-realm-tier-two-constructive-carrier';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

const PASSABLE = (water: number) => water === 0 || water === 3 || water === 4;

function counts(tierId: Uint8Array, regionId: Uint8Array) {
  const tierCounts: [number, number, number] = [0, 0, 0];
  const regionCounts = Array<number>(10).fill(0);
  for (let cell = 0; cell < tierId.length; cell += 1) {
    tierCounts[tierId[cell]! - 1] += 1;
    regionCounts[regionId[cell]!] += 1;
  }
  return Object.freeze({
    tierCounts: Object.freeze(tierCounts),
    regionCounts: Object.freeze(regionCounts),
  });
}

function fixture(
  parentQuotas: readonly [number, number, number] = [600, 600, 600],
  nonPassableChildCount = 120,
) {
  const radius = 30;
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const tierId = new Uint8Array(grid.cellCount);
  const regionId = new Uint8Array(grid.cellCount);
  const waterRegime = new Uint8Array(grid.cellCount);
  const legacyProtectedCell = new Uint8Array(grid.cellCount);
  const legacyReserveCell = new Uint8Array(grid.cellCount);
  const eligible: number[] = [];
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    const distance = Math.max(Math.abs(q), Math.abs(r), Math.abs(-q - r));
    if (distance <= 4) {
      tierId[cell] = 3;
      regionId[cell] = 9;
    } else if (q <= -27) {
      tierId[cell] = 1;
      regionId[cell] = 0;
    } else {
      tierId[cell] = 1;
      regionId[cell] = 1 + Math.abs(q * 17 + r * 31) % 5;
      eligible.push(cell);
    }
  }
  const remaining = [...parentQuotas];
  let parentCursor = 0;
  for (const cell of eligible) {
    let parent = -1;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = parentCursor++ % 3;
      if (remaining[candidate]! > 0) {
        parent = candidate;
        break;
      }
    }
    if (parent < 0) continue;
    remaining[parent] -= 1;
    tierId[cell] = 2;
    regionId[cell] = 6 + parent;
  }
  expect(remaining).toEqual([0, 0, 0]);
  const lockable = eligible.filter(cell => tierId[cell] === 1);
  legacyProtectedCell[lockable[0]!] = 1;
  legacyReserveCell[lockable[1]!] = 1;
  for (const cell of lockable.slice(2, 2 + nonPassableChildCount)) waterRegime[cell] = 1;
  const inventory = counts(tierId, regionId);
  const strategy = Object.freeze({ tierId, regionId, ...inventory });
  return Object.freeze({
    grid,
    candidateSeed: new Uint32Array([
      0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001,
    ]),
    strategy,
    waterRegime,
    legacyProtectedCell,
    legacyReserveCell,
  });
}

function syntheticApronQuery(
  input: ReturnType<typeof fixture>,
  onQuery: (strategy: GreaterRealmConstructiveTierTwoStrategy) => void = () => {},
  onClear: () => void = () => {},
  overlap = false,
): GreaterRealmConstructiveTierTwoApronQuery {
  return strategy => {
    onQuery(strategy);
    const tierTwoCells: number[] = [];
    for (let cell = 0; cell < strategy.tierId.length; cell += 1) {
      if (strategy.tierId[cell] === 2 && PASSABLE(input.waterRegime[cell]!)) {
        tierTwoCells.push(cell);
        if (tierTwoCells.length === 6) break;
      }
    }
    const bundles = Array.from({ length: 6 }, (_, child) => {
      const sourceChild = child === 1 ? 2 : child === 2 ? 1 : child;
      let tierOneCell = -1;
      for (let cell = 0; cell < strategy.tierId.length; cell += 1) {
        if (strategy.tierId[cell] === 1 && strategy.regionId[cell] === sourceChild
          && input.waterRegime[cell] === 0
          && input.legacyProtectedCell[cell] === 0
          && input.legacyReserveCell[cell] === 0) {
          tierOneCell = cell;
          break;
        }
      }
      return {
        slotChild: child,
        sourceChild,
        tierOneCells: [tierOneCell],
        tierTwoCells: [tierTwoCells[overlap ? 0 : child]!],
      };
    });
    if (bundles.some(bundle => bundle.tierOneCells[0]! < 0)
      || tierTwoCells.length !== 6) return undefined;
    return Object.freeze({
      bundles: Object.freeze(bundles),
      clear: () => {
        onClear();
        for (const bundle of bundles) {
          bundle.tierOneCells.fill(0);
          bundle.tierTwoCells.fill(0);
        }
      },
    });
  };
}

function expectOnePassableTierTwoComponent(
  input: ReturnType<typeof fixture>,
  strategy: GreaterRealmConstructiveTierTwoStrategy,
): void {
  const queue = new Uint32Array(input.grid.cellCount);
  const seen = new Uint8Array(input.grid.cellCount);
  const start = strategy.tierId.findIndex((tier, cell) =>
    tier === 2 && PASSABLE(input.waterRegime[cell]!));
  expect(start).toBeGreaterThanOrEqual(0);
  let head = 0;
  let tail = 0;
  seen[start] = 1;
  queue[tail++] = start;
  while (head < tail) {
    const cell = queue[head++]!;
    for (let direction = 0; direction < 6; direction += 1) {
      const neighbor = input.grid.neighbors[cell * 6 + direction]!;
      if (neighbor >= 0 && seen[neighbor] === 0 && strategy.tierId[neighbor] === 2
        && PASSABLE(input.waterRegime[neighbor]!)) {
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
  }
  const passableTierTwo = strategy.tierId.reduce((total, tier, cell) =>
    total + Number(tier === 2 && PASSABLE(input.waterRegime[cell]!)), 0);
  expect(tail).toBe(passableTierTwo);
}

describe('Greater Realm constructive Tier-II carrier', () => {
  it('constructs deterministic quota-preserving plans without moving locks', () => {
    const input = fixture();
    const originalTier = new Uint8Array(input.strategy.tierId);
    const originalRegion = new Uint8Array(input.strategy.regionId);
    let clearCount = 0;
    const first = deriveGreaterRealmConstructiveTierTwoPlans(
      input, syntheticApronQuery(input, () => {}, () => { clearCount += 1; }),
    );
    const queryCopies: Uint8Array[] = [];
    const secondQuery = syntheticApronQuery(input);
    const second = deriveGreaterRealmConstructiveTierTwoPlans(input, strategy => {
      const authority = secondQuery(strategy);
      queryCopies.push(strategy.tierId, strategy.regionId);
      strategy.tierId.fill(0xff);
      strategy.regionId.fill(0xff);
      return authority;
    });
    expect(first.length).toBeGreaterThan(0);
    expect(first.length).toBeLessThanOrEqual(4);
    expect(clearCount).toBe(first.length);
    expect(first.map(plan => Array.from(plan.strategy.regionId))).toEqual(
      second.map(plan => Array.from(plan.strategy.regionId)),
    );
    for (const plan of first) {
      expect(counts(plan.strategy.tierId, plan.strategy.regionId)).toEqual({
        tierCounts: input.strategy.tierCounts,
        regionCounts: input.strategy.regionCounts,
      });
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (originalRegion[cell] === 0 || originalRegion[cell] === 9
          || input.legacyProtectedCell[cell] === 1
          || input.legacyReserveCell[cell] === 1) {
          expect(plan.strategy.tierId[cell]).toBe(originalTier[cell]);
          expect(plan.strategy.regionId[cell]).toBe(originalRegion[cell]);
        }
      }
      const thronePassable = originalRegion.reduce((total, region, cell) =>
        total + Number(region === 9 && PASSABLE(input.waterRegime[cell]!)), 0);
      for (let parent = 6; parent <= 8; parent += 1) {
        const capacity = plan.strategy.regionId.reduce((total, region, cell) =>
          total + Number(region === parent && PASSABLE(input.waterRegime[cell]!)), 0);
        expect(capacity).toBeGreaterThanOrEqual(thronePassable + 512);
      }
      expectOnePassableTierTwoComponent(input, plan.strategy);
      let phaseTwoDemotions = 0;
      let phaseTwoPromotions = 0;
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (originalTier[cell] === 2 && PASSABLE(input.waterRegime[cell]!)
          && plan.strategy.tierId[cell] === 1) phaseTwoDemotions += 1;
        if (originalTier[cell] === 1 && !PASSABLE(input.waterRegime[cell]!)
          && plan.strategy.tierId[cell] === 2) phaseTwoPromotions += 1;
      }
      expect(phaseTwoDemotions).toBeGreaterThan(0);
      expect(phaseTwoPromotions).toBe(phaseTwoDemotions);
    }
    for (const array of queryCopies) expect(array.every(value => value === 0)).toBe(true);
    expect(input.strategy.tierId).toEqual(originalTier);
    expect(input.strategy.regionId).toEqual(originalRegion);
    for (const plan of [...first, ...second]) {
      clearGreaterRealmConstructiveTierTwoPlan(plan);
      clearGreaterRealmConstructiveTierTwoPlan(plan);
      expect(plan.strategy.tierId.every(value => value === 0)).toBe(true);
      expect(plan.strategy.regionId.every(value => value === 0)).toBe(true);
    }
  });

  it('fails closed at exact typed and mathematical boundaries', () => {
    const input = fixture();
    expect(() => deriveGreaterRealmConstructiveTierTwoPlans({
      ...input,
      waterRegime: new Uint16Array(input.grid.cellCount),
    } as unknown as typeof input, syntheticApronQuery(input))).toThrowError(
      'GREATER_REALM_CONSTRUCTIVE_TIER_TWO_INPUT_INVALID',
    );
    expect(() => deriveGreaterRealmConstructiveTierTwoPlans({
      ...input,
      limits: { maximumPlans: 5 },
    }, syntheticApronQuery(input))).toThrowError(
      'GREATER_REALM_CONSTRUCTIVE_TIER_TWO_LIMIT_INVALID',
    );
    const impossible = fixture([572, 600, 600]);
    const query = vi.fn(syntheticApronQuery(impossible));
    expect(deriveGreaterRealmConstructiveTierTwoPlans(impossible, query)).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it('rejects overlapping apron witnesses and caps adversarial retries', () => {
    const input = fixture();
    let clearCount = 0;
    const overlapQuery = vi.fn(syntheticApronQuery(
      input, () => {}, () => { clearCount += 1; }, true,
    ));
    expect(deriveGreaterRealmConstructiveTierTwoPlans(input, overlapQuery)).toEqual([]);
    expect(overlapQuery.mock.calls.length).toBeGreaterThan(0);
    expect(overlapQuery.mock.calls.length).toBeLessThanOrEqual(4);
    expect(clearCount).toBe(overlapQuery.mock.calls.length);
    const rejectingQuery = vi.fn(() => undefined);
    expect(deriveGreaterRealmConstructiveTierTwoPlans(input, rejectingQuery)).toEqual([]);
    expect(rejectingQuery.mock.calls.length).toBeGreaterThan(0);
    expect(rejectingQuery.mock.calls.length).toBeLessThanOrEqual(4);
  });

  it('zeroizes disposable query state when the exact authority throws', () => {
    const input = fixture();
    const captured: Uint8Array[] = [];
    const fatal = new Error('SYNTHETIC_APRON_FATAL');
    expect(() => deriveGreaterRealmConstructiveTierTwoPlans(input, strategy => {
      captured.push(strategy.tierId, strategy.regionId);
      throw fatal;
    })).toThrow(fatal);
    expect(captured).toHaveLength(2);
    for (const array of captured) expect(array.every(value => value === 0)).toBe(true);
  });
});
