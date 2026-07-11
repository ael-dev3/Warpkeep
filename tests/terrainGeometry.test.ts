import { describe, expect, it } from 'vitest';

import { createTerrainGeometryData } from '../src/components/realm/createTerrainGeometry';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';

describe('combined lowlands terrain geometry', () => {
  it('builds one finite indexed surface with valid non-degenerate triangles', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const geometry = createTerrainGeometryData(map, 1);
    const vertexCount = geometry.positions.length / 3;

    expect(geometry.surfaceCellCount).toBe(19);
    expect(geometry.positions.length).toBeGreaterThan(0);
    expect(geometry.positions.length % 3).toBe(0);
    expect(geometry.colors.length).toBe(geometry.positions.length);
    expect(geometry.indices.length).toBeGreaterThan(0);
    expect(geometry.indices.length % 3).toBe(0);
    expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.colors).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.indices).every((index) => index >= 0 && index < vertexCount)).toBe(true);
    expect(geometry.degenerateTriangleCount).toBe(0);
  });

  it('deduplicates world-space shared corners instead of creating an independent mesh per cell', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const geometry = createTerrainGeometryData(map, 1);

    expect(geometry.sharedVertexReuseCount).toBeGreaterThan(0);
    expect(geometry.vertexCount).toBeLessThan(map.cells.length * 7);
    expect(geometry.triangleCount).toBe(map.cells.length * 6);
  });

  it('keeps the 19-cell prototype in a bounded gameplay-friendly world extent', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const geometry = createTerrainGeometryData(map, 1);

    expect(geometry.bounds.minX).toBeGreaterThan(-5);
    expect(geometry.bounds.maxX).toBeLessThan(5);
    expect(geometry.bounds.minZ).toBeGreaterThan(-5);
    expect(geometry.bounds.maxZ).toBeLessThan(5);
    expect(geometry.bounds.maxY - geometry.bounds.minY).toBeLessThan(0.2);
  });
});
