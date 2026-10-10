// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { greaterRealmBarrierCoherenceTestSeams } from '../scripts/atlas/greater-realm-candidate-generator';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';

function fixture(donorMain: number) {
  const cells: Array<{ q: number; r: number; region: number; water: number }> = [];
  for (let region = 0; region < 10; region++) {
    const count = region === 1 ? donorMain : region === 2 ? 500 : region === 9 ? 100 : 150;
    for (let q = 0; q < count; q++) cells.push({ q, r: region * 20, region, water: 0 });
  }
  for (let q = 0; q < 70; q++) {
    cells.push({ q, r: 300, region: 1, water: 0 });
    cells.push({ q, r: 320, region: 2, water: 1 });
  }
  const grid = indexGreaterRealmAxialGrid(cells);
  const byCoordinate = new Map(cells.map(cell => [`${cell.q}:${cell.r}`, cell]));
  const ordered = Array.from(grid.q, (q, i) => byCoordinate.get(`${q}:${grid.r[i]}`)!);
  return {
    grid,
    regionId: Uint8Array.from(ordered, cell => cell.region),
    waterRegime: Uint8Array.from(ordered, cell => cell.water),
    tierId: Uint8Array.from(ordered, cell => cell.region < 6 ? 1 : cell.region < 9 ? 2 : 3),
    barrier: new Uint8Array(grid.cellCount),
    legacyProtectedCell: new Uint8Array(grid.cellCount),
  };
}

function counts(regionId: Uint8Array, waterRegime?: Uint8Array, barrier?: Uint8Array) {
  const result = Array<number>(10).fill(0);
  for (let cell = 0; cell < regionId.length; cell++) {
    if (waterRegime && (![0, 3, 4].includes(waterRegime[cell]!) || barrier![cell] !== 0)) continue;
    result[regionId[cell]!]++;
  }
  return result;
}

describe('sealed-barrier region coherence', () => {
  it.each([80, 100])('preserves donor land above Throneheart with a %i-cell main body', donorMain => {
    const input = fixture(donorMain);
    const original = input.regionId.slice();
    const before = counts(input.regionId, input.waterRegime, input.barrier);
    expect(before[1]).toBeGreaterThan(before[9]!);
    greaterRealmBarrierCoherenceTestSeams.reconcileBarrierMeasuredRegionCoherence(
      input.grid, input.regionId, input.tierId, input.waterRegime, input.barrier,
      input.legacyProtectedCell, new Set(),
    );
    expect(input.regionId).toEqual(original);
    expect(counts(input.regionId, input.waterRegime, input.barrier)).toEqual(before);
  });

  it('uses sealed passability rather than the donor raw surface', () => {
    const input = fixture(150);
    for (let cell = 0; cell < input.grid.cellCount; cell++) {
      if (input.regionId[cell] === 1 && input.grid.r[cell] === 20 && input.grid.q[cell]! < 50) {
        input.barrier[cell] = 1;
      }
    }
    const original = input.regionId.slice();
    const before = counts(input.regionId, input.waterRegime, input.barrier);
    expect(before[1]).toBe(170);
    expect(before[9]).toBe(100);
    greaterRealmBarrierCoherenceTestSeams.reconcileBarrierMeasuredRegionCoherence(
      input.grid, input.regionId, input.tierId, input.waterRegime, input.barrier,
      input.legacyProtectedCell, new Set(),
    );
    expect(input.regionId).toEqual(original);
    expect(counts(input.regionId, input.waterRegime, input.barrier)).toEqual(before);
  });

  it('still transfers a fragment when the sealed-barrier donor remains larger', () => {
    const input = fixture(150);
    const populations = counts(input.regionId);
    const unchanged = [input.tierId, input.waterRegime, input.barrier, input.legacyProtectedCell]
      .map(array => array.slice());
    greaterRealmBarrierCoherenceTestSeams.reconcileBarrierMeasuredRegionCoherence(
      input.grid, input.regionId, input.tierId, input.waterRegime, input.barrier,
      input.legacyProtectedCell, new Set(),
    );
    const after = counts(input.regionId, input.waterRegime, input.barrier);
    expect(after[1]).toBe(150);
    expect(after[2]).toBe(570);
    expect(after[9]).toBe(100);
    expect(counts(input.regionId)).toEqual(populations);
    expect([input.tierId, input.waterRegime, input.barrier, input.legacyProtectedCell]).toEqual(unchanged);
  });
});
