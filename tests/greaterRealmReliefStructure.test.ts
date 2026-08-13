// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';

import {
  GREATER_REALM_RELIEF_STRUCTURE_LAGS,
  GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS,
  GREATER_REALM_RELIEF_STRUCTURE_VERSION,
  measureGreaterRealmReliefStructure,
} from '../scripts/atlas/greater-realm-relief-structure';
import {
  createGreaterRealmMultiscaleIntegerField,
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function axialDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) {
      coordinates.push(Object.freeze({ q, r }));
    }
  }
  return Object.freeze(coordinates);
}

function correlatedFixture(reverse = false) {
  const coordinates = axialDisc(54);
  const grid = indexGreaterRealmAxialGrid(
    reverse ? [...coordinates].reverse() : coordinates,
  );
  const elevation = createGreaterRealmMultiscaleIntegerField(
    grid,
    new Uint32Array([0x1020_3040, 0x5060_7080, 0x90a0_b0c0, 0xd0e0_f001]),
    [
      {
        channel: 'relief-structure-test-macro',
        amplitude: 8_000,
        smoothingPasses: 18,
        selfWeight: 3,
      },
      {
        channel: 'relief-structure-test-meso',
        amplitude: 2_400,
        smoothingPasses: 5,
        selfWeight: 2,
      },
      {
        channel: 'relief-structure-test-detail',
        amplitude: 500,
        smoothingPasses: 1,
        selfWeight: 2,
      },
    ],
  );
  return Object.freeze({
    grid,
    elevation,
    waterRegime: new Uint8Array(grid.cellCount),
    legacyProtectedCell: new Uint8Array(grid.cellCount),
  });
}

describe('Greater Realm final-relief structure function', () => {
  it('accepts correlated multiscale relief with balanced axial structure', () => {
    const input = correlatedFixture();
    const originalElevation = new Int32Array(input.elevation);
    const metrics = measureGreaterRealmReliefStructure(input);

    expect(GREATER_REALM_RELIEF_STRUCTURE_VERSION).toBe(
      'greater-realm-final-relief-structure-v1',
    );
    expect(GREATER_REALM_RELIEF_STRUCTURE_LAGS).toEqual([1, 4, 12]);
    expect(GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS).toEqual({
      minimumPairCoverageBasisPointsByLag: [8_500, 6_500, 3_000],
      minimumScaleGrowthBasisPoints: [30_000, 15_000],
      maximumScaleGrowthBasisPoints: [155_000, 85_000],
      maximumAxialAnisotropyBasisPointsByLag: [17_500, 17_500, 17_500],
    });
    expect(metrics.proof).toBe(true);
    expect(metrics.pairCoverageProof).toBe(true);
    expect(metrics.scaleGrowthProof).toBe(true);
    expect(metrics.axialAnisotropyProof).toBe(true);
    expect(metrics.eligibleCellCount).toBe(input.grid.cellCount);
    expect(input.elevation).toEqual(originalElevation);
    expect(Object.isFrozen(metrics)).toBe(true);
    for (const matrix of [
      metrics.pairCountsByLagAndAxis,
      metrics.pairCoverageBasisPointsByLagAndAxis,
      metrics.meanSquaredDifferenceByLagAndAxis,
    ]) {
      expect(Object.isFrozen(matrix)).toBe(true);
      expect(matrix).toHaveLength(3);
      expect(matrix.every((row) => Object.isFrozen(row))).toBe(true);
      expect(matrix.every((row) => row.length === 3)).toBe(true);
    }
    for (
      let lag = 0;
      lag < GREATER_REALM_RELIEF_STRUCTURE_LAGS.length;
      lag += 1
    ) {
      expect(
        Math.min(...metrics.pairCoverageBasisPointsByLagAndAxis[lag]!),
      ).toBeGreaterThanOrEqual(
        GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS
          .minimumPairCoverageBasisPointsByLag[lag]!,
      );
      expect(metrics.axialAnisotropyBasisPointsByLag[lag]).toBeLessThanOrEqual(
        GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS
          .maximumAxialAnisotropyBasisPointsByLag[lag]!,
      );
    }
  });

  it('rejects an axial stripe even though it has deterministic scale growth', () => {
    const input = correlatedFixture();
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      input.elevation[cell] = input.grid.q[cell]! * 500;
    }

    const metrics = measureGreaterRealmReliefStructure(input);

    expect(metrics.proof).toBe(false);
    expect(metrics.axialAnisotropyProof).toBe(false);
    expect(metrics.meanSquaredDifferenceByLagAndAxis[0]).toContain(0);
    expect(metrics.axialAnisotropyBasisPointsByLag[0]).toBe(
      Number.MAX_SAFE_INTEGER,
    );
  });

  it('rejects scale-collapsed coordinate noise without relying on Math.random', () => {
    const input = correlatedFixture();
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      const q = input.grid.q[cell]!;
      const r = input.grid.r[cell]!;
      let hash = Math.imul(q ^ 0x6d2b_79f5, 0x1b87_3593);
      hash = Math.imul(hash ^ r ^ (hash >>> 16), 0x85eb_ca6b);
      input.elevation[cell] = ((hash ^ (hash >>> 13)) & 0xffff) - 0x8000;
    }

    const metrics = measureGreaterRealmReliefStructure(input);

    expect(metrics.proof).toBe(false);
    expect(metrics.pairCoverageProof).toBe(true);
    expect(metrics.scaleGrowthProof).toBe(false);
    expect(
      metrics.lagOneToFourGrowthBasisPointsByAxis.every(
        (value) =>
          value <
          GREATER_REALM_RELIEF_STRUCTURE_THRESHOLDS
            .minimumScaleGrowthBasisPoints[0]!,
      ),
    ).toBe(true);
  });

  it('ignores excluded outliers and every corridor which crosses them', () => {
    const baseline = correlatedFixture();
    const excludedElevation = new Int32Array(baseline.elevation);
    const waterRegime = new Uint8Array(baseline.waterRegime);
    const legacyProtectedCell = new Uint8Array(baseline.legacyProtectedCell);
    let waterOutliers = 0;
    let protectedOutliers = 0;
    for (let cell = 0; cell < baseline.grid.cellCount; cell += 1) {
      const q = baseline.grid.q[cell]!;
      const r = baseline.grid.r[cell]!;
      if (q === 0) {
        waterRegime[cell] = 3;
        excludedElevation[cell] = cell % 2 === 0 ? 0x7fff_ffff : -0x8000_0000;
        waterOutliers += 1;
      } else if (r === 8 && q >= -16 && q <= 16) {
        legacyProtectedCell[cell] = 1;
        excludedElevation[cell] = cell % 2 === 0 ? 0x7fff_ffff : -0x8000_0000;
        protectedOutliers += 1;
      }
    }
    expect(waterOutliers).toBeGreaterThan(0);
    expect(protectedOutliers).toBeGreaterThan(0);

    const baselineMetrics = measureGreaterRealmReliefStructure({
      ...baseline,
      waterRegime,
      legacyProtectedCell,
    });
    const outlierMetrics = measureGreaterRealmReliefStructure({
      ...baseline,
      elevation: excludedElevation,
      waterRegime,
      legacyProtectedCell,
    });

    expect(outlierMetrics).toEqual(baselineMetrics);
    expect(outlierMetrics.eligibleCellCount).toBe(
      baseline.grid.cellCount - waterOutliers - protectedOutliers,
    );
    expect(
      outlierMetrics.pairCountsByLagAndAxis[2].every(
        (count) => count < outlierMetrics.eligibleCellCount,
      ),
    ).toBe(true);
  });

  it('excludes a pair when any intermediate corridor cell is excluded', () => {
    const coordinates = Array.from({ length: 13 }, (_, index) =>
      Object.freeze({ q: index - 6, r: 0 }),
    );
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const elevation = new Int32Array(grid.cellCount);
    const waterRegime = new Uint8Array(grid.cellCount);
    const legacyProtectedCell = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const q = grid.q[cell]!;
      elevation[cell] = q * q * 100;
      if (q === 0) waterRegime[cell] = 1;
    }

    const metrics = measureGreaterRealmReliefStructure({
      grid,
      elevation,
      waterRegime,
      legacyProtectedCell,
    });

    expect(metrics.pairCountsByLagAndAxis[1]![0]).toBe(4);
    expect(metrics.pairCountsByLagAndAxis[2]![0]).toBe(0);
  });

  it('is invariant to caller coordinate traversal order', () => {
    const forward = correlatedFixture(false);
    const reversed = correlatedFixture(true);

    expect(forward.grid.q).toEqual(reversed.grid.q);
    expect(forward.grid.r).toEqual(reversed.grid.r);
    expect(forward.elevation).toEqual(reversed.elevation);
    expect(measureGreaterRealmReliefStructure(forward)).toEqual(
      measureGreaterRealmReliefStructure(reversed),
    );
  });

  it('fails closed on malformed inputs and unsafe S2 means', () => {
    const fixture = correlatedFixture();
    const invalidNeighbors = new Int32Array(fixture.grid.neighbors);
    invalidNeighbors[0] = fixture.grid.cellCount;
    expect(() =>
      measureGreaterRealmReliefStructure({
        ...fixture,
        grid: Object.freeze({ ...fixture.grid, neighbors: invalidNeighbors }),
      }),
    ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_GRID_INVALID');

    const missingNeighbors = new Int32Array(fixture.grid.neighbors);
    const firstNeighborSlot = missingNeighbors.findIndex(value => value >= 0);
    const cell = Math.floor(firstNeighborSlot / 6);
    const direction = firstNeighborSlot % 6;
    const neighbor = missingNeighbors[firstNeighborSlot]!;
    missingNeighbors[firstNeighborSlot] = -1;
    missingNeighbors[neighbor * 6 + ((direction + 3) % 6)] = -1;
    expect(() =>
      measureGreaterRealmReliefStructure({
        ...fixture,
        grid: Object.freeze({ ...fixture.grid, neighbors: missingNeighbors }),
      }),
    ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_GRID_INVALID');

    expect(() =>
      measureGreaterRealmReliefStructure({
        ...fixture,
        waterRegime: new Uint8Array(fixture.grid.cellCount - 1),
      }),
    ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_INPUT_LENGTH_INVALID');

    const invalidProtected = new Uint8Array(fixture.grid.cellCount);
    invalidProtected[0] = 2;
    expect(() =>
      measureGreaterRealmReliefStructure({
        ...fixture,
        legacyProtectedCell: invalidProtected,
      }),
    ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_PROTECTED_MASK_INVALID');

    const noDryCells = new Uint8Array(fixture.grid.cellCount);
    noDryCells.fill(1);
    expect(() =>
      measureGreaterRealmReliefStructure({
        ...fixture,
        waterRegime: noDryCells,
      }),
    ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_ELIGIBLE_MASK_EMPTY');

    const overflowElevation = new Int32Array(fixture.grid.cellCount);
    for (let cell = 0; cell < fixture.grid.cellCount; cell += 1) {
      overflowElevation[cell] =
        fixture.grid.q[cell]! < 0 ? -0x8000_0000 : 0x7fff_ffff;
    }
    const fillSpy = vi.spyOn(Uint8Array.prototype, 'fill');
    try {
      expect(() =>
        measureGreaterRealmReliefStructure({
          ...fixture,
          elevation: overflowElevation,
        }),
      ).toThrow('GREATER_REALM_RELIEF_STRUCTURE_MEAN_OVERFLOW');
      const ownedScratch = [
        ...new Set(fillSpy.mock.instances as unknown as readonly Uint8Array[]),
      ].filter(
        (values) =>
          values !== fixture.waterRegime &&
          values !== fixture.legacyProtectedCell,
      );
      expect(ownedScratch.length).toBeGreaterThan(0);
      expect(
        ownedScratch.every((values) => values.every((value) => value === 0)),
      ).toBe(true);
    } finally {
      fillSpy.mockRestore();
    }
  });

  it('returns aggregate-only evidence with no masks, coordinates, or samples', () => {
    const metrics = measureGreaterRealmReliefStructure(correlatedFixture());
    const serialized = JSON.stringify(metrics);

    expect(serialized).not.toMatch(/coordinate|sample|seed|digest|mask|path/iu);
    expect(
      Object.values(metrics).some((value) => ArrayBuffer.isView(value)),
    ).toBe(false);
  });
});
