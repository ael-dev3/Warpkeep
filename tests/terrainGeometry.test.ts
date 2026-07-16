import { describe, expect, it } from 'vitest';

import {
  createTerrainGeometryData,
  DEFAULT_TERRAIN_SUBDIVISIONS
} from '../src/components/realm/createTerrainGeometry';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import { axialToWorld } from '../src/game/map/hexCoordinates';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createHegemonyKeepPlacement } from '../src/game/map/terrainPlacements';

function footprintHeightRange(
  positions: Float32Array,
  center: Readonly<{ x: number; z: number }>,
  radius: number
) {
  const heights: number[] = [];
  for (let index = 0; index < positions.length; index += 3) {
    if (Math.hypot(positions[index] - center.x, positions[index + 2] - center.z) <= radius) {
      heights.push(positions[index + 1]);
    }
  }
  return Math.max(...heights) - Math.min(...heights);
}

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

  it('records the exact chamfered terrain perimeter for truthful overview framing', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 5);
    const geometry = createTerrainGeometryData(map, 1);
    const hullX = geometry.overviewHull.map((point) => point.x);
    const hullZ = geometry.overviewHull.map((point) => point.z);

    expect(geometry.overviewHull).toHaveLength(12);
    expect(Math.min(...hullX)).toBeCloseTo(geometry.bounds.minX, 5);
    expect(Math.max(...hullX)).toBeCloseTo(geometry.bounds.maxX, 5);
    expect(Math.min(...hullZ)).toBeCloseTo(geometry.bounds.minZ, 5);
    expect(Math.max(...hullZ)).toBeCloseTo(geometry.bounds.maxZ, 5);
    expect(Object.isFrozen(geometry.overviewHull)).toBe(true);
    expect(geometry.overviewHull.every(Object.isFrozen)).toBe(true);
  });

  it('tessellates an authoritative off-center keep footprint as a flat foundation', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 4);
    const coord = { q: 2, r: -1 } as const;
    const center = axialToWorld(coord, 1);
    const placement = createHegemonyKeepPlacement('own-keep', coord);
    const natural = createTerrainGeometryData(map, 1, { placements: [] });
    const founded = createTerrainGeometryData(map, 1, { placements: [placement] });

    expect(footprintHeightRange(natural.positions, center, placement.footprintRadius))
      .toBeGreaterThan(0.0001);
    expect(footprintHeightRange(founded.positions, center, placement.footprintRadius))
      .toBeLessThan(0.000001);
  });

  it('changes semantic color only, never the shared terrain topology', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const neutral = createTerrainGeometryData(map, 1);
    const semantic = createTerrainGeometryData(map, 1, {
      terrainKindsByKey: new Map(map.cells.map((cell, index) => [
        `${cell.coord.q},${cell.coord.r}`,
        index % 2 === 0 ? 'forest' as const : 'lake' as const
      ]))
    });

    expect(semantic.positions).toEqual(neutral.positions);
    expect(semantic.indices).toEqual(neutral.indices);
    expect(semantic.triangleCount).toBe(neutral.triangleCount);
    expect(semantic.vertexCount).toBe(neutral.vertexCount);
    expect(semantic.colors).not.toEqual(neutral.colors);
  });
});
