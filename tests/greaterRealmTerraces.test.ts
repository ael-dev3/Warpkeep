import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_TERRACE_VERSION,
  shapeGreaterRealmTerraces,
} from '../scripts/atlas/greater-realm-terraces';
import {
  greaterRealmHexDistance,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function fixture(radius = 34, reverseInput = false) {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  const grid = indexGreaterRealmAxialGrid(
    reverseInput ? [...coordinates].reverse() : coordinates,
  );
  const elevation = new Int32Array(grid.cellCount);
  const legacyReserveCell = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const distance = greaterRealmHexDistance({
      q: grid.q[cell]!,
      r: grid.r[cell]!,
    });
    elevation[cell] =
      distance >= 31
        ? -900 - (distance - 31) * 400
        : 18_000 -
          distance * 520 +
          ((grid.q[cell]! * 71 + grid.r[cell]! * 43) % 420);
    if (distance <= 2) legacyReserveCell[cell] = 1;
  }
  return Object.freeze({ grid, elevation, legacyReserveCell });
}

describe('Greater Realm low-frequency terraces', () => {
  it('builds broad plateaus, short ramps, and weathered detail deterministically', () => {
    const input = {
      ...fixture(),
      candidateSeed: new Uint32Array([
        0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001,
      ]),
    } as const;
    const original = new Int32Array(input.elevation);
    const first = shapeGreaterRealmTerraces(input);
    const second = shapeGreaterRealmTerraces(input);

    expect(GREATER_REALM_TERRACE_VERSION).toBe(
      'greater-realm-low-frequency-terraces-v2',
    );
    expect(first).toEqual(second);
    expect(input.elevation).toEqual(original);
    expect(first.metrics.changedCellCount).toBeGreaterThan(100);
    expect(first.metrics.plateauCellCount).toBeGreaterThan(
      first.metrics.rampCellCount,
    );
    expect(first.metrics.rampCellCount).toBeGreaterThan(0);
    expect(first.metrics.realizedPlateauCellCount * 100).toBeGreaterThanOrEqual(
      first.metrics.eligibleCellCount * 35,
    );
    expect(first.metrics.realizedRampCellCount).toBeGreaterThan(0);
    expect(first.metrics.spatialRampCellCount).toBeGreaterThan(0);
    expect(first.metrics.fullStepEdgeCount).toBe(0);
    expect(first.metrics.maximumNewEdgeIncrease).toBeLessThanOrEqual(1_200);
    expect(first.metrics.weatheredDetailCellCount).toBeGreaterThan(0);
    expect(first.metrics.maximumAbsoluteCellDelta).toBeLessThanOrEqual(2_200);
    expect(Math.abs(first.metrics.netElevationDelta)).toBeLessThanOrEqual(
      first.metrics.eligibleCellCount * 300,
    );
    expect(first.metrics.domainWarpSampledCellCount * 5).toBeGreaterThanOrEqual(
      first.metrics.eligibleCellCount,
    );
    expect(
      first.metrics.domainWarpChangedCarrierCellCount * 4,
    ).toBeGreaterThanOrEqual(first.metrics.domainWarpSampledCellCount * 3);
    expect(first.metrics.domainWarpOutputChangedCellCount).toBeGreaterThan(0);
    expect(first.metrics.domainWarpMaximumDistance).toBeGreaterThanOrEqual(1);
    expect(first.metrics.domainWarpMaximumDistance).toBeLessThanOrEqual(5);
  });

  it('is invariant to caller coordinate traversal order', () => {
    const candidateSeed = new Uint32Array([
      0xa1b2_c3d4, 0xe5f6_0718, 0x293a_4b5c, 0x6d7e_8f90,
    ]);
    const forward = fixture(24);
    const reversed = fixture(24, true);

    expect(forward.grid.q).toEqual(reversed.grid.q);
    expect(forward.grid.r).toEqual(reversed.grid.r);
    expect(forward.grid.neighbors).toEqual(reversed.grid.neighbors);
    expect(shapeGreaterRealmTerraces({ ...forward, candidateSeed })).toEqual(
      shapeGreaterRealmTerraces({ ...reversed, candidateSeed }),
    );
  });

  it('turns skipped contour steps into short spatial ramps on a monotonic slope', () => {
    const input = {
      ...fixture(),
      candidateSeed: new Uint32Array([
        0x1111_1111, 0x2222_2222, 0x3333_3333, 0x4444_4444,
      ]),
    };
    input.legacyReserveCell.fill(0);
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      input.elevation[cell] = 30_000 + input.grid.q[cell]! * 500;
    }
    const result = shapeGreaterRealmTerraces(input);
    let fullStepEdges = 0;
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = input.grid.neighbors[cell * 6 + direction]!;
        if (neighbor <= cell) continue;
        const sourceEdge = Math.abs(
          input.elevation[cell]! - input.elevation[neighbor]!,
        );
        const shapedEdge = Math.abs(
          result.elevation[cell]! - result.elevation[neighbor]!,
        );
        if (sourceEdge < 1_200 && shapedEdge >= 2_000) fullStepEdges += 1;
      }
    }

    expect(result.metrics.spatialRampCellCount).toBeGreaterThan(0);
    expect(result.metrics.fullStepEdgeCount).toBe(0);
    expect(result.metrics.maximumNewEdgeIncrease).toBeLessThanOrEqual(1_200);
    expect(fullStepEdges).toBe(0);
    expect(result.metrics.realizedPlateauCellCount).toBeGreaterThan(
      result.metrics.realizedRampCellCount,
    );
  });

  it('keeps the coast sign and legacy reserve exactly locked', () => {
    const input = {
      ...fixture(),
      candidateSeed: new Uint32Array([1, 2, 3, 4]),
    } as const;
    const originalQ = new Int32Array(input.grid.q);
    const originalR = new Int32Array(input.grid.r);
    const originalNeighbors = new Int32Array(input.grid.neighbors);
    const result = shapeGreaterRealmTerraces(input);

    expect(input.grid.q).toEqual(originalQ);
    expect(input.grid.r).toEqual(originalR);
    expect(input.grid.neighbors).toEqual(originalNeighbors);

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      expect(result.elevation[cell]! > 0).toBe(input.elevation[cell]! > 0);
      expect(result.elevation[cell]).toBe(
        input.elevation[cell]! + result.delta[cell]!,
      );
      if (
        input.legacyReserveCell[cell] === 1 ||
        input.elevation[cell]! <= 1_800
      ) {
        expect(result.delta[cell]).toBe(0);
      }
    }
  });

  it('bounds every new slope along the first editable Lowlands-reserve ring', () => {
    const input = {
      ...fixture(),
      candidateSeed: new Uint32Array([5, 6, 7, 8]),
    } as const;
    const result = shapeGreaterRealmTerraces(input);
    let seamEdges = 0;

    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.legacyReserveCell[cell] !== 1) continue;
      for (let direction = 0; direction < 6; direction += 1) {
        const neighbor = input.grid.neighbors[cell * 6 + direction]!;
        if (neighbor < 0 || input.legacyReserveCell[neighbor] === 1) continue;
        seamEdges += 1;
        const sourceEdge = Math.abs(
          input.elevation[cell]! - input.elevation[neighbor]!,
        );
        const shapedEdge = Math.abs(
          result.elevation[cell]! - result.elevation[neighbor]!,
        );
        expect(shapedEdge).toBeLessThanOrEqual(sourceEdge + 2_200);
      }
    }
    expect(seamEdges).toBeGreaterThan(0);
  });

  it('zeroizes every owned working field after a late arithmetic failure', () => {
    const input = {
      ...fixture(),
      candidateSeed: new Uint32Array([
        0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001,
      ]),
      seaLevel: Number.MIN_SAFE_INTEGER,
    } as const;
    const originalElevation = new Int32Array(input.elevation);
    const originalReserve = new Uint8Array(input.legacyReserveCell);
    const int32FillSpy = vi.spyOn(Int32Array.prototype, 'fill');
    const uint8FillSpy = vi.spyOn(Uint8Array.prototype, 'fill');

    try {
      expect(() => shapeGreaterRealmTerraces(input)).toThrow(
        'GREATER_REALM_TERRACE_ARITHMETIC_INVALID',
      );

      const int32Receivers = [
        ...new Set(
          int32FillSpy.mock.instances as unknown as readonly Int32Array[],
        ),
      ].filter((values) => values !== input.elevation);
      const uint8Receivers = [
        ...new Set(
          uint8FillSpy.mock.instances as unknown as readonly Uint8Array[],
        ),
      ].filter((values) => values !== input.legacyReserveCell);

      expect(int32Receivers.length).toBeGreaterThan(10);
      expect(uint8Receivers.length).toBeGreaterThan(2);
      expect(
        int32Receivers.every((values) =>
          values.every((value) => value === 0),
        ),
      ).toBe(true);
      expect(
        uint8Receivers.every((values) =>
          values.every((value) => value === 0),
        ),
      ).toBe(true);
      expect(input.elevation).toEqual(originalElevation);
      expect(input.legacyReserveCell).toEqual(originalReserve);
    } finally {
      int32FillSpy.mockRestore();
      uint8FillSpy.mockRestore();
    }
  });
});
