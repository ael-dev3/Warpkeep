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

describe('planned gate frontier preservation', () => {
  it.each([false, true])('retains the required parent foothold despite a larger foreign frontier (main contact: %s)', mainForeignContact => {
    const cells: Array<{q: number; r: number; region: number; water: number}> = [];
    const add = (region: number, r: number, count: number, water = 0, start = 0) => {
      for (let q = start; q < start + count; q++) cells.push({q, r, region, water});
    };
    for (let region = 0; region < 6; region++) add(region, region * 20, region === 1 ? 1024 : 1000);
    const foreignSize = mainForeignContact ? 64 : 96;
    const plannedSize = mainForeignContact ? 96 : 64;
    add(1, 300, foreignSize);
    add(6, 301, foreignSize);
    add(1, 400, plannedSize);
    add(7, 401, plannedSize);
    add(2, 500, 160, 1);
    if (mainForeignContact) add(6, 21, 300);
    // Real capacity authority: one connected dry spine for each middle realm,
    // touching both the outer tier and the shared connected throne body.
    for (const [region, child, q] of [[6, 0, 0], [7, 5, 20], [8, 3, 40]] as const) {
      add(child, 999, 1, 0, q);
      add(region, 1000, 1, 0, q);
    }
    add(9, 1001, 41);
    const grid = indexGreaterRealmAxialGrid(cells);
    const byCoordinate = new Map(cells.map(cell => [`${cell.q}:${cell.r}`, cell]));
    const ordered = Array.from(grid.q, (q, i) => byCoordinate.get(`${q}:${grid.r[i]}`)!);
    const regionId = Uint8Array.from(ordered, cell => cell.region);
    const waterRegime = Uint8Array.from(ordered, cell => cell.water);
    const tierId = Uint8Array.from(ordered, cell => cell.region < 6 ? 1 : cell.region < 9 ? 2 : 3);
    const regionCounts = counts(regionId);
    const tierCounts = [0, 0, 0] as [number, number, number];
    for (const tier of tierId) tierCounts[tier - 1]++;
    const passableOwner = Int8Array.from(ordered, cell => cell.region >= 6 && cell.region < 9 ? cell.region : -1);
    const spineOwner = Int8Array.from(ordered, cell => cell.r === 1000 ? cell.region : -1);
    const original = [regionId, tierId, waterRegime, passableOwner, spineOwner].map(array => array.slice());
    const repaired = greaterRealmBarrierCoherenceTestSeams.repairNaturalRegionLandCoherence(
      grid, {regionId, tierId, regionCounts, tierCounts, semanticPermutation: [0, 1, 2, 3, 4, 5],
        gateGraph: [[0, 6], [2, 6], [1, 7], [5, 7], [3, 8], [4, 8], [6, 9], [7, 9], [8, 9]]},
      waterRegime, new Uint8Array(grid.cellCount), passableOwner, spineOwner,
    );
    const foothold = ordered.map((cell, i) => ({cell, i})).filter(({cell}) => cell.region === 1 && cell.r === 400);
    expect(foothold).toHaveLength(plannedSize);
    expect(foothold.every(({i}) => repaired.regionId[i] === 1)).toBe(true);
    expect(counts(repaired.regionId)).toEqual(regionCounts);
    expect(repaired.tierId).toEqual(tierId);
    expect([regionId, tierId, waterRegime, passableOwner, spineOwner]).toEqual(original);
  });
});
