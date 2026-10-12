import { describe, expect, it } from 'vitest';
import { indexGreaterRealmAxialGrid } from '../scripts/atlas/greater-realm-terrain';
import { repairGreaterRealmStraitOwnership } from '../scripts/atlas/greater-realm-strait-ownership-repair';
import { measureGreaterRealmTopographicQa } from '../scripts/atlas/greater-realm-topographic-qa';

function finalStonewake(input: ReturnType<typeof fixture>, regionId: Uint8Array) {
  const n = input.grid.cellCount;
  return measureGreaterRealmTopographicQa({
    ...input, regionId,
    geomorphologyCoastalClass: new Uint8Array(n), preErosionElevation: input.elevation.slice(),
    sedimentDepth: new Uint16Array(n), flowReceiver: new Int32Array(n).fill(-1),
    flowAccumulation: new BigUint64Array(n).fill(1n), biomeId: new Uint8Array(n),
    landformId: new Uint8Array(n), slope: new Uint16Array(n), aspect: new Uint8Array(n),
    profileCurvature: new Int32Array(n), planCurvature: new Int32Array(n),
    watershedId: new Int32Array(n).fill(1), ridgeId: new Int32Array(n),
  }).regionalHydrogeomorphology.stonewake;
}

function fixture() {
  const coordinates = [];
  for (let q = 0; q < 32; q += 1) for (let r = 0; r < 12; r += 1) coordinates.push({ q, r });
  const grid = indexGreaterRealmAxialGrid(coordinates);
  const regionId = new Uint8Array(grid.cellCount).fill(4);
  const tierId = new Uint8Array(grid.cellCount).fill(1);
  const elevation = new Int32Array(grid.cellCount).fill(-100);
  const waterRegime = new Uint8Array(grid.cellCount).fill(1);
  const lockedCell = new Uint8Array(grid.cellCount);
  for (let cell = 0; cell < grid.cellCount; cell += 1) {
    const q = grid.q[cell]!;
    if (q < 6 || (q >= 8 && q < 14) || (q >= 16 && q < 22)) {
      elevation[cell] = 100; waterRegime[cell] = 0;
    } else if (q < 22) regionId[cell] = 3;
  }
  return { grid, regionId, tierId, elevation, waterRegime, lockedCell, targetRegion: 4, seaLevel: 0 };
}
const counts = (array: Uint8Array) => Array.from({ length: 256 }, (_, id) => array.reduce((sum, value) => sum + Number(value === id), 0));

describe('balanced physical strait ownership repair', () => {
  it('repairs foreign sea corridors without altering any physical or input authority', () => {
    const input = fixture();
    const before = [input.regionId.slice(), input.tierId.slice(), input.elevation.slice(), input.waterRegime.slice()];
    const result = repairGreaterRealmStraitOwnership(input);
    expect(result.status).toBe('repaired');
    expect(result.meaningfulIslandCount).toBe(3);
    expect(result.narrowStraitCellCount).toBeGreaterThanOrEqual(4);
    expect(counts(result.regionId)).toEqual(counts(input.regionId));
    expect(finalStonewake(input, input.regionId).proof).toBe(false);
    expect(finalStonewake(input, result.regionId)).toMatchObject({
      meaningfulIslandCount: result.meaningfulIslandCount,
      narrowIslandStraitCellCount: result.narrowStraitCellCount, proof: true,
    });
    expect([input.regionId, input.tierId, input.elevation, input.waterRegime]).toEqual(before);
    expect(repairGreaterRealmStraitOwnership({ ...input, regionId: result.regionId }).status).toBe('unchanged');
  });
  it.each(['locked', 'wrong-tier', 'no-donors', 'physical-gap'] as const)('fails transactionally with %s', reason => {
    const input = fixture();
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (reason === 'locked' && input.regionId[cell] === 3) input.lockedCell[cell] = 1;
      if (reason === 'wrong-tier' && input.regionId[cell] === 3) input.tierId[cell] = 2;
      if (reason === 'no-donors' && input.regionId[cell] === 4 && input.waterRegime[cell] === 1) input.lockedCell[cell] = 1;
      if (reason === 'physical-gap' && input.regionId[cell] === 3) input.waterRegime[cell] = 2;
    }
    const result = repairGreaterRealmStraitOwnership(input);
    expect(result.status).toBe('unchanged');
    expect(result.regionId).toEqual(input.regionId);
  });
  it('rolls back the whole plan when independent acceptance rejects it', () => {
    const input = fixture();
    let checked = false;
    const result = repairGreaterRealmStraitOwnership({ ...input, accept: trial => { checked = true; expect(counts(trial)).toEqual(counts(input.regionId)); return false; } });
    expect(checked).toBe(true);
    expect(result.regionId).toEqual(input.regionId);
    expect(result.status).toBe('unchanged');
  });
  it('tries another bounded corridor after independent acceptance rejects the first', () => {
    const input = fixture();
    const before = input.regionId.slice();
    let calls = 0;
    const preservedCell = input.grid.q.findIndex((q, cell) => q === 6 && input.grid.r[cell] === 1);
    expect(preservedCell).toBeGreaterThanOrEqual(0);
    const result = repairGreaterRealmStraitOwnership({ ...input, accept: trial => {
      calls += 1;
      expect(counts(trial)).toEqual(counts(before));
      return trial[preservedCell] === before[preservedCell];
    } });
    expect(calls).toBeGreaterThan(1);
    expect(calls).toBeLessThanOrEqual(4);
    expect(result.status).toBe('repaired');
    expect(result.narrowStraitCellCount).toBeGreaterThanOrEqual(4);
    expect(finalStonewake(input, result.regionId).proof).toBe(true);
    expect(counts(result.regionId)).toEqual(counts(before));
    expect(input.regionId).toEqual(before);
    expect(result.regionId[preservedCell]).toBe(before[preservedCell]);
  });
  it('zeroizes a rejected trial even when acceptance throws', () => {
    const input = fixture();
    let retainedTrial: Uint8Array | undefined;
    expect(() => repairGreaterRealmStraitOwnership({ ...input, accept: trial => {
      retainedTrial = trial;
      throw new Error('acceptance failure');
    } })).toThrow('acceptance failure');
    expect(retainedTrial?.every(value => value === 0)).toBe(true);
    expect(input.regionId.some(value => value === 4)).toBe(true);
  });
  it('preserves existing owned straits and locked authority', () => {
    const input = fixture();
    for (let cell = 0; cell < input.grid.cellCount; cell += 1) {
      if (input.grid.q[cell]! < 8 && input.regionId[cell] === 3) input.regionId[cell] = 4;
      if (input.regionId[cell] === 4 && input.grid.q[cell]! < 8) input.lockedCell[cell] = 1;
    }
    const before = input.regionId.slice();
    const result = repairGreaterRealmStraitOwnership(input);
    expect(result.status).toBe('unchanged');
    expect(result.regionId).toEqual(before);
    expect(finalStonewake(input, result.regionId).proof).toBe(true);
  });
  it('rejects mixed target tiers and malformed neighbors before allocation', () => {
    const input = fixture();
    input.tierId[input.regionId.indexOf(4)] = 2;
    expect(() => repairGreaterRealmStraitOwnership(input)).toThrow('TARGET_TIER_INVALID');
    const next = fixture();
    next.grid.neighbors[0] = next.grid.cellCount;
    expect(() => repairGreaterRealmStraitOwnership(next)).toThrow('NEIGHBOR_INVALID');
  });
});
