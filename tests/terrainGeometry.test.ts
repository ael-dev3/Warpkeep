import { describe, expect, it } from 'vitest';

import {
  createTerrainGeometryData,
  DEFAULT_TERRAIN_SUBDIVISIONS
} from '../src/components/realm/createTerrainGeometry';
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

  it('tessellates every logical cell while reusing world-space border vertices', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const geometry = createTerrainGeometryData(map, 1);
    const verticesPerWedgeWithoutReuse = ((DEFAULT_TERRAIN_SUBDIVISIONS + 1) * (DEFAULT_TERRAIN_SUBDIVISIONS + 2)) / 2;

    expect(geometry.subdivisionsPerEdge).toBe(DEFAULT_TERRAIN_SUBDIVISIONS);
    expect(geometry.sharedVertexReuseCount).toBeGreaterThan(0);
    expect(geometry.vertexCount).toBeLessThan(map.cells.length * 6 * verticesPerWedgeWithoutReuse);
    expect(geometry.triangleCount).toBe(map.cells.length * 6 * DEFAULT_TERRAIN_SUBDIVISIONS ** 2);
  });

  it('keeps the expanded 91-cell realm in a bounded gameplay-friendly world extent', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 5);
    const geometry = createTerrainGeometryData(map, 1);

    expect(geometry.surfaceCellCount).toBe(91);
    expect(geometry.triangleCount).toBe(91 * 6 * DEFAULT_TERRAIN_SUBDIVISIONS ** 2);
    expect(geometry.bounds.minX).toBeGreaterThan(-11);
    expect(geometry.bounds.maxX).toBeLessThan(11);
    expect(geometry.bounds.minZ).toBeGreaterThan(-11);
    expect(geometry.bounds.maxZ).toBeLessThan(11);
    expect(geometry.bounds.maxY - geometry.bounds.minY).toBeLessThan(0.45);
  });
});
