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

function approachFixture(pathCount: number, splitFirstCore = false) {
  const cells: Array<{q: number; r: number}> = [];
  for (const offset of (splitFirstCore ? [0, 30, 60] : [0, 30])) {
    for (let q = 0; q < 8; q++) {
      for (let r = 0; r < 8; r++) cells.push({q: q + offset, r});
    }
  }
  const grid = indexGreaterRealmAxialGrid(cells);
  const regionId = Uint8Array.from(grid.q, q => q >= 30 && q < 38 ? 6 : 0);
  const tierId = Uint8Array.from(regionId, region => region === 0 ? 1 : 2);
  const waterRegime = new Uint8Array(grid.cellCount);
  const barrier = new Uint8Array(grid.cellCount);
  const topology = greaterRealmBarrierCoherenceTestSeams.robustRegionTopology(
    grid, regionId, waterRegime, barrier,
  );
  // Derive real biconnected dry cores; do not invent component-size metadata.
  expect(topology.componentSizes).toEqual(splitFirstCore ? [64, 64, 64] : [64, 64]);
  const paths = (q: number) => Array.from({length: pathCount}, (_, r) => {
    const cell = Array.from(grid.q).findIndex((x, i) => x === q && grid.r[i] === r);
    expect(cell).toBeGreaterThanOrEqual(0);
    return [cell];
  });
  const first = paths(0), second = paths(30);
  if (splitFirstCore) first[1] = paths(60)[0]!;
  const option = (ordinal: number) => greaterRealmBarrierCoherenceTestSeams.compatibleGateApproaches(
    grid, tierId, waterRegime, barrier, topology.componentId, topology.componentSizes,
    first, second, ordinal,
  );
  return {option, first, second, tierId, waterRegime, barrier, topology};
}

describe('bounded gate approach option enumeration', () => {
  it('rejects alternate approaches ending in disconnected real cores', () => {
    const input = approachFixture(2, true);
    expect(input.option(0)).toBeUndefined();
  });

  it('does not spend another option on swapping primary and alternate labels', () => {
    const input = approachFixture(2);
    const first = input.option(0);
    expect(first).toBeDefined();
    expect(first!.first).toEqual(input.first[0]);
    expect(first!.firstAlternate).toEqual(input.first[1]);
    expect(first!.second).toEqual(input.second[0]);
    expect(first!.secondAlternate).toEqual(input.second[1]);
    expect(input.option(1)).toBeUndefined();
  });

  it('gives the bounded caller distinct corridor footprints without changing its inputs', () => {
    const input = approachFixture(3);
    const before = [input.first, input.second].map(paths => paths.map(path => [...path]));
    const arrays = [input.tierId, input.waterRegime, input.barrier, input.topology.componentId];
    const original = arrays.map(array => array.slice());
    const footprints: string[] = [];
    // Match the real caller's existing option limit.
    for (let ordinal = 0; ordinal < 32; ordinal++) {
      const selected = input.option(ordinal);
      if (!selected) break;
      footprints.push(selected.all.flat().slice().sort((a, b) => a - b).join(':'));
    }
    expect(footprints).toHaveLength(9);
    expect(new Set(footprints).size).toBe(footprints.length);
    expect([input.first, input.second]).toEqual(before);
    expect(arrays).toEqual(original);
  });
});

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

describe('natural dry-capacity annex donor preservation', () => {
  it('uses a smaller Stonewake mainland component when its largest island cannot annex safely', () => {
    const cells: Array<{q: number; r: number; region: number; water: number; protectedCell: number}> = [];
    const add = (q: number, r: number, region: number, water = 0, protectedCell = 0) => {
      cells.push({q, r, region, water, protectedCell});
    };
    for (let q = 0; q <= 2000; q++) add(q, 0, 1);
    for (let q = 0; q < 100; q++) add(q, 1, 4);
    for (let q = 0; q < 150; q++) add(q, 500, 4);
    for (let q = 0; q < 400; q++) add(q, 700, 4, 1);
    for (const region of [0, 2, 3, 5]) {
      for (let q = 0; q < 612; q++) add(q, 3000 + region * 20, region);
    }
    for (const [parent, child, q] of [[6, 0, 0], [7, 2, 20], [8, 4, 40]] as const) {
      add(q, 999, child, 0, 1);
      add(q, 1000, parent);
    }
    for (let q = 0; q < 100; q++) add(q, 1001, 9);
    const grid = indexGreaterRealmAxialGrid(cells);
    const byCoordinate = new Map(cells.map(cell => [`${cell.q}:${cell.r}`, cell]));
    const ordered = Array.from(grid.q, (q, i) => byCoordinate.get(`${q}:${grid.r[i]}`)!);
    const regionId = Uint8Array.from(ordered, cell => cell.region);
    const tierId = Uint8Array.from(regionId, region => region < 6 ? 1 : region < 9 ? 2 : 3);
    const waterRegime = Uint8Array.from(ordered, cell => cell.water);
    const legacyProtectedCell = Uint8Array.from(ordered, cell => cell.protectedCell);
    const passableOwner = Int8Array.from(ordered, cell => cell.region >= 6 && cell.region < 9 ? cell.region : -1);
    const spineOwner = passableOwner.slice();
    const regionCounts = counts(regionId);
    const tierCounts = [0, 0, 0] as [number, number, number];
    for (const tier of tierId) tierCounts[tier - 1]++;
    const inputs = [regionId, tierId, waterRegime, legacyProtectedCell, passableOwner, spineOwner];
    const original = inputs.map(array => array.slice());
    const noBarrier = new Uint8Array(grid.cellCount);
    expect(counts(regionId, waterRegime, noBarrier)[4]).toBe(251);
    const repaired = greaterRealmBarrierCoherenceTestSeams.repairNaturalRegionLandCoherence(
      grid, {regionId, tierId, regionCounts, tierCounts, semanticPermutation: [0, 1, 2, 3, 4, 5],
        gateGraph: [[0, 6], [1, 7], [2, 6], [3, 7], [4, 8], [5, 8], [6, 9], [7, 9], [8, 9]]},
      waterRegime, legacyProtectedCell, passableOwner, spineOwner, undefined, true,
    );
    expect(counts(repaired.regionId)).toEqual(regionCounts);
    expect(repaired.tierId).toEqual(tierId);
    expect(inputs).toEqual(original);
    const donor = new Set(ordered.flatMap((cell, i) => (
      cell.region === 1 && repaired.regionId[i] === 1 && cell.water === 0 ? [i] : []
    )));
    expect(donor.size).toBeGreaterThan(612);
    const queue = [donor.values().next().value!];
    const seen = new Set(queue);
    for (let head = 0; head < queue.length; head++) {
      for (let direction = 0; direction < 6; direction++) {
        const neighbor = grid.neighbors[queue[head]! * 6 + direction]!;
        if (donor.has(neighbor) && !seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    expect(seen.size).toBe(donor.size);
    expect(counts(repaired.regionId, waterRegime, noBarrier)[4]).toBe(612);
  });

  it.each([false, true])('preserves the connected donor core when the annex contact is an endpoint: %s', endpoint => {
    const cells: Array<{q: number; r: number; region: number; water: number; protectedCell: number}> = [];
    const add = (q: number, r: number, region: number, water = 0, protectedCell = 0) => {
      cells.push({q, r, region, water, protectedCell});
    };
    // The donor has real spare capacity, but the interior contact is its only
    // bridge between two 350-cell bodies. The endpoint variant is safe to take.
    for (let q = endpoint ? 0 : -350; q <= (endpoint ? 700 : 350); q++) {
      add(q, 0, 1, 0, q === 1 ? 1 : 0);
    }
    for (let r = 1; r <= 611; r++) add(0, r, 0);
    add(2000, 2000, 0, 1);
    for (let region = 2; region < 6; region++) {
      for (let q = 0; q < 612; q++) add(q, 3000 + region * 20, region);
    }
    // Each actual middle spine touches dry outer and inner cells; the shared
    // 100-cell throne body makes the repair's dry-capacity floor exactly 612.
    for (const [parent, child, q] of [[6, 2, 0], [7, 3, 20], [8, 4, 40]] as const) {
      add(q, 999, child, 0, 1);
      add(q, 1000, parent);
    }
    for (let q = 0; q < 100; q++) add(q, 1001, 9);
    const grid = indexGreaterRealmAxialGrid(cells);
    const byCoordinate = new Map(cells.map(cell => [`${cell.q}:${cell.r}`, cell]));
    const ordered = Array.from(grid.q, (q, i) => byCoordinate.get(`${q}:${grid.r[i]}`)!);
    const regionId = Uint8Array.from(ordered, cell => cell.region);
    const tierId = Uint8Array.from(regionId, region => region < 6 ? 1 : region < 9 ? 2 : 3);
    const waterRegime = Uint8Array.from(ordered, cell => cell.water);
    const legacyProtectedCell = Uint8Array.from(ordered, cell => cell.protectedCell);
    const passableOwner = Int8Array.from(ordered, cell => cell.region >= 6 && cell.region < 9 ? cell.region : -1);
    const spineOwner = passableOwner.slice();
    const regionCounts = counts(regionId);
    const tierCounts = [0, 0, 0] as [number, number, number];
    for (const tier of tierId) tierCounts[tier - 1]++;
    const inputs = [regionId, tierId, waterRegime, legacyProtectedCell, passableOwner, spineOwner];
    const original = inputs.map(array => array.slice());
    const connectedDonor = (ownership: Uint8Array) => {
      const surviving = ordered.flatMap((cell, i) => (
        cell.region === 1 && cell.water === 0 && ownership[i] === 1 ? [i] : []
      ));
      const allowed = new Set(surviving);
      const seen = new Set<number>();
      const queue = surviving.length > 0 ? [surviving[0]!] : [];
      for (let head = 0; head < queue.length; head++) {
        const cell = queue[head]!;
        if (seen.has(cell)) continue;
        seen.add(cell);
        for (let direction = 0; direction < 6; direction++) {
          const neighbor = grid.neighbors[cell * 6 + direction]!;
          if (allowed.has(neighbor) && !seen.has(neighbor)) queue.push(neighbor);
        }
      }
      return seen.size === surviving.length;
    };
    expect(connectedDonor(regionId)).toBe(true);
    const repaired = greaterRealmBarrierCoherenceTestSeams.repairNaturalRegionLandCoherence(
      grid, {regionId, tierId, regionCounts, tierCounts, semanticPermutation: [0, 1, 2, 3, 4, 5],
        gateGraph: [[0, 6], [1, 7], [2, 6], [3, 7], [4, 8], [5, 8], [6, 9], [7, 9], [8, 9]]},
      waterRegime, legacyProtectedCell, passableOwner, spineOwner,
    );
    expect(counts(repaired.regionId)).toEqual(regionCounts);
    expect(repaired.tierId).toEqual(tierId);
    expect(inputs).toEqual(original);
    expect(connectedDonor(repaired.regionId)).toBe(true);
    if (endpoint) {
      const contact = ordered.findIndex(cell => cell.q === 0 && cell.r === 0);
      expect(repaired.regionId[contact]).toBe(0);
      expect(counts(repaired.regionId, waterRegime, new Uint8Array(grid.cellCount))[0]).toBe(612);
    }
  });
});
