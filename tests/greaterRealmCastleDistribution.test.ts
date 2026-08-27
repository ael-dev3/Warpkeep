// @vitest-environment node

import { describe, expect, it } from 'vitest';

import {
  deriveGreaterRealmSupportNormalizedAngularSectors,
} from '../scripts/atlas/greater-realm-castle-distribution';
import {
  indexGreaterRealmAxialGrid,
  type AxialCoordinate,
} from '../scripts/atlas/greater-realm-terrain';

function hexDisc(radius: number): readonly AxialCoordinate[] {
  const coordinates: AxialCoordinate[] = [];
  for (let q = -radius; q <= radius; q += 1) {
    const minimumR = Math.max(-radius, -q - radius);
    const maximumR = Math.min(radius, -q + radius);
    for (let r = minimumR; r <= maximumR; r += 1) coordinates.push({ q, r });
  }
  return coordinates;
}

describe('Greater Realm support-normalized castle distribution', () => {
  it('partitions irregular regional support without requiring empty global wedges', () => {
    const grid = indexGreaterRealmAxialGrid(hexDisc(10));
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(1);
    const waterRegime = new Uint8Array(grid.cellCount);
    const barrier = new Uint8Array(grid.cellCount);
    for (let cell = 0; cell < grid.cellCount; cell += 1) {
      const q = grid.q[cell]!;
      const r = grid.r[cell]!;
      if (!(
        (q <= -2 && r >= -2)
        || (q >= 2 && r <= 2)
      )) barrier[cell] = 1;
    }
    const regionBefore = new Uint8Array(regionId);
    const waterBefore = new Uint8Array(waterRegime);
    const barrierBefore = new Uint8Array(barrier);
    try {
      const sectors = deriveGreaterRealmSupportNormalizedAngularSectors({
        grid,
        regionId,
        waterRegime,
        barrier,
        regionCount: 2,
      });
      const supportCounts = new Uint16Array(6);
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        if (barrier[cell] === 0) supportCounts[sectors[cell]!] += 1;
      }
      expect([...supportCounts].filter(Boolean)).toHaveLength(6);
      expect(Math.max(...supportCounts) - Math.min(...supportCounts)).toBeLessThanOrEqual(10);
      expect(regionId).toEqual(regionBefore);
      expect(waterRegime).toEqual(waterBefore);
      expect(barrier).toEqual(barrierBefore);
      sectors.fill(0);
    } finally {
      grid.clearIndex?.();
    }
  });

  it('never manufactures angular coverage by splitting one radial ray', () => {
    const coordinates: AxialCoordinate[] = [];
    for (let q = -12; q <= 12; q += 1) coordinates.push({ q, r: 0 });
    const grid = indexGreaterRealmAxialGrid(coordinates);
    const regionId = new Uint8Array(grid.cellCount);
    regionId.fill(1);
    const waterRegime = new Uint8Array(grid.cellCount);
    const barrier = new Uint8Array(grid.cellCount);
    try {
      const sectors = deriveGreaterRealmSupportNormalizedAngularSectors({
        grid,
        regionId,
        waterRegime,
        barrier,
        regionCount: 2,
      });
      const east = new Set<number>();
      const west = new Set<number>();
      for (let cell = 0; cell < grid.cellCount; cell += 1) {
        const q = grid.q[cell]!;
        if (q > 0) east.add(sectors[cell]!);
        if (q < 0) west.add(sectors[cell]!);
      }
      expect(east.size).toBe(1);
      expect(west.size).toBe(1);
      expect(new Set([...east, ...west]).size).toBe(2);
      sectors.fill(0);
    } finally {
      grid.clearIndex?.();
    }
  });
});
