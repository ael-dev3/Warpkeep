// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import { greaterRealmWaterFirstTierTestSeams } from '../scripts/atlas/greater-realm-water-first-tiers';
import { GREATER_REALM_WATER_REGIME_ID } from '../scripts/atlas/greater-realm-hydrology-authority';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
  type IndexedAxialGrid,
} from '../scripts/atlas/greater-realm-terrain';

const RADIUS = 50;
const TIER_THREE_COUNT = 91;
const TIER_TWO_PASSABLE_COUNT = 1_809;
const TIER_TWO_COUNT = 2_100;
const WATER = GREATER_REALM_WATER_REGIME_ID;

function hexDistance(q: number, r: number, centerQ = 0, centerR = 0): number {
  const relativeQ = q - centerQ;
  const relativeR = r - centerR;
  return Math.max(
    Math.abs(relativeQ),
    Math.abs(relativeR),
    Math.abs(-relativeQ - relativeR),
  );
}

function hexDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return coordinates;
}

function fixture(
  waterPlacement: 'carrier-contact' | 'remote' = 'carrier-contact',
) {
  const grid = indexGreaterRealmAxialGrid(hexDisc(RADIUS));
  const waterRegime = new Uint8Array(grid.cellCount);
  const terrainCost = new Int32Array(grid.cellCount);
  const legacyProtectedCell = new Uint8Array(grid.cellCount);
  const legacyReserveCell = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    const distance = hexDistance(q, r);
    terrainCost[cell] = distance * 100 + q * 30 + r * 17
      + Math.abs(q * 31 + r * 17) % 71;
    const lake = waterPlacement === 'carrier-contact'
      ? hexDistance(q, r, -22, 0) <= 10
      : distance >= 45;
    if (lake) waterRegime[cell] = WATER.LAKE;
    if (!lake && q === 0 && r <= -10 && r >= -20) {
      waterRegime[cell] = r % 2 === 0 ? WATER.RIVER : WATER.STREAM;
    }
    if (hexDistance(q, r, 38, 0) <= 2) legacyReserveCell[cell] = 1;
    if (q === 38 && r === 0) legacyProtectedCell[cell] = 1;
  }
  return Object.freeze({
    grid,
    candidateSeed: 73,
    waterRegime,
    terrainCost,
    legacyProtectedCell,
    legacyReserveCell,
    tierThreeSeed: grid.indexOf({ q: 0, r: 0 }),
    tierThreeCount: TIER_THREE_COUNT,
    tierTwoCount: TIER_TWO_COUNT,
    tierTwoPassableCount: TIER_TWO_PASSABLE_COUNT,
  });
}

function ringFixture(
  ringCost: number,
  options: Readonly<{
    cheapDecoys?: boolean;
    gap?: boolean;
    gridRadius?: number;
    ringRadius?: number;
    tierThreeCount?: number;
  }> = {},
) {
  const gridRadius = options.gridRadius ?? 42;
  const ringRadius = options.ringRadius ?? 4;
  const tierThreeCount = options.tierThreeCount ?? 37;
  const tierTwoPassableCount = (tierThreeCount + 512) * 3;
  const grid = indexGreaterRealmAxialGrid(hexDisc(gridRadius));
  const waterRegime = new Uint8Array(grid.cellCount);
  const terrainCost = new Int32Array(grid.cellCount);
  const legacyProtectedCell = new Uint8Array(grid.cellCount);
  const legacyReserveCell = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    const r = grid.r[cell]!;
    if (hexDistance(q, r) === ringRadius) {
      terrainCost[cell] = options.gap && q === -ringRadius && r === 0
        ? 20_000
        : ringCost;
    } else if (options.cheapDecoys && q >= ringRadius + 8) {
      terrainCost[cell] = -10_000;
    }
  }
  return Object.freeze({
    grid,
    candidateSeed: 73,
    waterRegime,
    terrainCost,
    legacyProtectedCell,
    legacyReserveCell,
    tierThreeSeed: grid.indexOf({ q: ringRadius, r: 0 }),
    tierThreeCount,
    tierTwoCount: tierTwoPassableCount,
    tierTwoPassableCount,
  });
}

function clearFixture(value: Pick<
  ReturnType<typeof fixture>,
  'grid' | 'waterRegime' | 'terrainCost' | 'legacyProtectedCell' | 'legacyReserveCell'
>): void {
  value.waterRegime.fill(0);
  value.terrainCost.fill(0);
  value.legacyProtectedCell.fill(0);
  value.legacyReserveCell.fill(0);
  value.grid.clearIndex?.();
}

function passable(waterRegime: number): boolean {
  return waterRegime === WATER.DRY
    || waterRegime === WATER.RIVER
    || waterRegime === WATER.STREAM;
}

function componentSize(
  grid: IndexedAxialGrid,
  included: (cell: number) => boolean,
): number {
  const seen = new Uint8Array(grid.cellCount);
  const queue = new Uint32Array(grid.cellCount);
  try {
    let start = -1;
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      if (included(cell)) {
        start = cell;
        break;
      }
    }
    if (start < 0) return 0;
    let head = 0;
    let tail = 0;
    seen[start] = 1;
    queue[tail++] = start;
    while (head < tail) {
      const cell = queue[head++]!;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0 || seen[neighbor] === 1 || !included(neighbor)) continue;
        seen[neighbor] = 1;
        queue[tail++] = neighbor;
      }
    }
    return tail;
  } finally {
    seen.fill(0);
    queue.fill(0);
  }
}

describe('Greater Realm water-first tier constructor', () => {
  it('constructs terrain-asymmetric replay-stable tiers and reachable padding', () => {
    const input = fixture();
    const originalWater = new Uint8Array(input.waterRegime);
    const originalCost = new Int32Array(input.terrainCost);
    const originalProtected = new Uint8Array(input.legacyProtectedCell);
    const originalReserve = new Uint8Array(input.legacyReserveCell);
    let first: ReturnType<typeof greaterRealmWaterFirstTierTestSeams.construct> | undefined;
    let replay: typeof first;
    let zeroPadding: typeof first;
    try {
      first = greaterRealmWaterFirstTierTestSeams.construct(input);
      replay = greaterRealmWaterFirstTierTestSeams.construct(input);
      zeroPadding = greaterRealmWaterFirstTierTestSeams.construct({
        ...input,
        tierTwoCount: TIER_TWO_PASSABLE_COUNT,
      });

      expect(Object.isFrozen(greaterRealmWaterFirstTierTestSeams)).toBe(true);
      expect(first.tierId).toEqual(replay.tierId);
      expect(first.selectedVariant).toBe(0);
      expect(replay.selectedVariant).toBe(0);
      expect(first.tierCounts).toEqual([
        input.grid.cellCount - TIER_TWO_COUNT - TIER_THREE_COUNT,
        TIER_TWO_COUNT,
        TIER_THREE_COUNT,
      ]);
      expect(first.tierTwoPassableCarrierCount).toBe(TIER_TWO_PASSABLE_COUNT);
      expect(first.tierTwoNonPassablePaddingCount).toBe(
        TIER_TWO_COUNT - TIER_TWO_PASSABLE_COUNT,
      );
      expect(zeroPadding.tierTwoNonPassablePaddingCount).toBe(0);
      expect(zeroPadding.tierCounts[1]).toBe(TIER_TWO_PASSABLE_COUNT);
      expect(componentSize(
        input.grid,
        cell => zeroPadding!.tierId[cell] === 2 && passable(input.waterRegime[cell]!),
      )).toBe(TIER_TWO_PASSABLE_COUNT);
      expect(componentSize(
        input.grid,
        cell => zeroPadding!.tierId[cell] === 2,
      )).toBe(TIER_TWO_PASSABLE_COUNT);
      expect(componentSize(
        input.grid,
        cell => first!.tierId[cell] === 3,
      )).toBe(TIER_THREE_COUNT);
      expect(componentSize(
        input.grid,
        cell => first!.tierId[cell] === 2 && passable(input.waterRegime[cell]!),
      )).toBe(TIER_TWO_PASSABLE_COUNT);
      expect(componentSize(
        input.grid,
        cell => first!.tierId[cell] === 2,
      )).toBe(TIER_TWO_COUNT);

      let passableRiverOrStreamCarrier = 0;
      let tierThreeOutsideRadiusFive = 0;
      const dryInnerContacts: number[] = [];
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (
          input.legacyProtectedCell[cell] === 1
          || input.legacyReserveCell[cell] === 1
        ) expect(first.tierId[cell]).toBe(1);
        if (first.tierId[cell] === 3) {
          expect(passable(input.waterRegime[cell]!)).toBe(true);
          if (hexDistance(input.grid.q[cell]!, input.grid.r[cell]!) > 5) {
            tierThreeOutsideRadiusFive += 1;
          }
          for (let direction = 0; direction < 6; direction += 1) {
            const neighbor = input.grid.neighbors[cell * 6 + direction]!;
            if (neighbor >= 0 && passable(input.waterRegime[neighbor]!)) {
              expect(first.tierId[neighbor]).not.toBe(1);
            }
          }
        }
        if (
          first.tierId[cell] === 2
          && (input.waterRegime[cell] === WATER.RIVER
            || input.waterRegime[cell] === WATER.STREAM)
        ) passableRiverOrStreamCarrier += 1;
        if (first.tierId[cell] !== 2 || input.waterRegime[cell] !== WATER.DRY) continue;
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = input.grid.neighbors[cell * 6 + direction]!;
          if (
            neighbor >= 0
            && first.tierId[neighbor] === 3
            && input.waterRegime[neighbor] === WATER.DRY
          ) {
            dryInnerContacts.push(cell);
            break;
          }
        }
      }
      expect(passableRiverOrStreamCarrier).toBeGreaterThan(0);
      expect(tierThreeOutsideRadiusFive).toBeGreaterThan(0);
      expect(dryInnerContacts.length).toBeGreaterThanOrEqual(3);
      expect(dryInnerContacts.some((firstContact, firstIndex) => (
        dryInnerContacts.slice(firstIndex + 1).some((secondContact, secondIndex) => (
          hexDistance(
            input.grid.q[firstContact]! - input.grid.q[secondContact]!,
            input.grid.r[firstContact]! - input.grid.r[secondContact]!,
          ) >= 8
          && dryInnerContacts.slice(firstIndex + secondIndex + 2).some(thirdContact => (
            hexDistance(
              input.grid.q[firstContact]! - input.grid.q[thirdContact]!,
              input.grid.r[firstContact]! - input.grid.r[thirdContact]!,
            ) >= 8
            && hexDistance(
              input.grid.q[secondContact]! - input.grid.q[thirdContact]!,
              input.grid.r[secondContact]! - input.grid.r[thirdContact]!,
            ) >= 8
          ))
        ))
      ))).toBe(true);
      expect(input.waterRegime).toEqual(originalWater);
      expect(input.terrainCost).toEqual(originalCost);
      expect(input.legacyProtectedCell).toEqual(originalProtected);
      expect(input.legacyReserveCell).toEqual(originalReserve);
    } finally {
      first?.tierId.fill(0);
      replay?.tierId.fill(0);
      zeroPadding?.tierId.fill(0);
      originalWater.fill(0);
      originalCost.fill(0);
      originalProtected.fill(0);
      originalReserve.fill(0);
      clearFixture(input);
    }
  });

  it('fails closed when nonpassable quota is not frontier-reachable', () => {
    const input = fixture('remote');
    try {
      let failure: unknown;
      try {
        greaterRealmWaterFirstTierTestSeams.construct(input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toBe(
        'GREATER_REALM_WATER_FIRST_TIER_VARIANTS_EXHAUSTED_'
          + 'NON_PASSABLE_PADDING_FRONTIER_EXHAUSTED',
      );
      expect(greaterRealmWaterFirstTierTestSeams.classifyFailure(failure)).toBe('geography');
    } finally {
      clearFixture(input);
    }
  });

  it('uses a later compact variant when depth-94 closes the passable complement', () => {
    const input = ringFixture(-3_000, {
      gridRadius: 50,
      ringRadius: 8,
      tierThreeCount: 91,
    });
    let first: ReturnType<typeof greaterRealmWaterFirstTierTestSeams.construct> | undefined;
    let replay: typeof first;
    try {
      first = greaterRealmWaterFirstTierTestSeams.construct(input);
      replay = greaterRealmWaterFirstTierTestSeams.construct(input);
      expect(first.selectedVariant).toBeGreaterThan(0);
      expect(first.selectedVariant).toBeLessThan(4);
      expect(replay.selectedVariant).toBe(first.selectedVariant);
      expect(replay.tierId).toEqual(first.tierId);
      expect(first.tierCounts).toEqual([
        input.grid.cellCount - input.tierTwoCount - input.tierThreeCount,
        input.tierTwoCount,
        input.tierThreeCount,
      ]);
      expect(componentSize(
        input.grid,
        cell => first!.tierId[cell] === 3,
      )).toBe(input.tierThreeCount);
      expect(componentSize(
        input.grid,
        cell => first!.tierId[cell] === 2 && passable(input.waterRegime[cell]!),
      )).toBe(input.tierTwoPassableCount);
    } finally {
      first?.tierId.fill(0);
      replay?.tierId.fill(0);
      clearFixture(input);
    }
  });

  it('keeps exact connected quotas with terrain-cheap connector search decoys', () => {
    const input = ringFixture(-20_000, { gap: true, cheapDecoys: true });
    let result: ReturnType<typeof greaterRealmWaterFirstTierTestSeams.construct> | undefined;
    try {
      result = greaterRealmWaterFirstTierTestSeams.construct(input);
      expect(result.tierCounts).toEqual([
        input.grid.cellCount - input.tierTwoCount - input.tierThreeCount,
        input.tierTwoCount,
        input.tierThreeCount,
      ]);
      expect(result.tierTwoPassableCarrierCount).toBe(input.tierTwoPassableCount);
      expect(result.tierTwoNonPassablePaddingCount).toBe(0);
      expect(componentSize(
        input.grid,
        cell => result!.tierId[cell] === 2,
      )).toBe(input.tierTwoCount);
      for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
        if (result.tierId[cell] !== 3) continue;
        for (let direction = 0; direction < 6; direction += 1) {
          const neighbor = input.grid.neighbors[cell * 6 + direction]!;
          if (neighbor >= 0 && passable(input.waterRegime[neighbor]!)) {
            expect(result.tierId[neighbor]).not.toBe(1);
          }
        }
      }
    } finally {
      result?.tierId.fill(0);
      clearFixture(input);
    }
  });

  it('rejects typed-shape errors before construction', () => {
    const input = fixture();
    const malformedProtected = new Uint8Array(input.legacyProtectedCell);
    malformedProtected[input.tierThreeSeed] = 1;
    try {
      expect(() => greaterRealmWaterFirstTierTestSeams.construct({
        ...input,
        terrainCost: new Uint8Array(input.grid.cellCount),
      } as never)).toThrow('GREATER_REALM_WATER_FIRST_TIER_INPUT_INVALID');
      let fatal: unknown;
      try {
        greaterRealmWaterFirstTierTestSeams.construct({
          ...input,
          legacyProtectedCell: malformedProtected,
        });
      } catch (error) {
        fatal = error;
      }
      expect(greaterRealmWaterFirstTierTestSeams.classifyFailure(fatal)).toBe('fatal');

      let quotaFailure: unknown;
      try {
        greaterRealmWaterFirstTierTestSeams.construct({
          ...input,
          tierTwoCount: 1_808,
          tierTwoPassableCount: 1_808,
        });
      } catch (error) {
        quotaFailure = error;
      }
      expect(quotaFailure).toBeInstanceOf(Error);
      expect((quotaFailure as Error).message).toBe(
        'GREATER_REALM_WATER_FIRST_TIER_QUOTA_INFEASIBLE',
      );
      expect(greaterRealmWaterFirstTierTestSeams.classifyFailure(quotaFailure)).toBe('fatal');
    } finally {
      malformedProtected.fill(0);
      clearFixture(input);
    }
  });

  it('zeroizes failed output and dirty connector scratch after all variants exhaust', () => {
    const input = ringFixture(-20_000);
    const uint8Fill = vi.spyOn(Uint8Array.prototype, 'fill');
    const uint32Fill = vi.spyOn(Uint32Array.prototype, 'fill');
    const int32Fill = vi.spyOn(Int32Array.prototype, 'fill');
    try {
      let failure: unknown;
      try {
        greaterRealmWaterFirstTierTestSeams.construct(input);
      } catch (error) {
        failure = error;
      }
      expect(failure).toBeInstanceOf(Error);
      expect((failure as Error).message).toContain(
        'GREATER_REALM_WATER_FIRST_TIER_VARIANTS_EXHAUSTED_',
      );
      expect((failure as Error).message).toContain('PASSABLE_COMPLEMENT_DISCONNECTED');
      expect(greaterRealmWaterFirstTierTestSeams.classifyFailure(failure)).toBe('geography');
      const clearedBytes = (
        uint8Fill.mock.instances as unknown as Uint8Array[]
      ).filter(values => values.length === input.grid.cellCount);
      const clearedQueues = (
        uint32Fill.mock.instances as unknown as Uint32Array[]
      ).filter(values => values.length === input.grid.cellCount);
      expect(clearedBytes.length).toBeGreaterThanOrEqual(2);
      expect(clearedBytes.every(values => values.every(value => value === 0))).toBe(true);
      expect(clearedQueues.length).toBeGreaterThanOrEqual(1);
      expect(clearedQueues.every(values => values.every(value => value === 0))).toBe(true);
      const clearedPositions = (
        int32Fill.mock.instances as unknown as Int32Array[]
      ).filter(values => values.length === input.grid.cellCount);
      expect(clearedPositions.length).toBeGreaterThanOrEqual(2);
      expect(clearedPositions.every(
        values => values.every(value => value === 0),
      )).toBe(true);
    } finally {
      uint8Fill.mockRestore();
      uint32Fill.mockRestore();
      int32Fill.mockRestore();
      clearFixture(input);
    }
  });
});
