import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createTerrainGeometryData,
  DEFAULT_TERRAIN_SUBDIVISIONS,
  pointyHexCorners
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

function geometryDigest(geometry: ReturnType<typeof createTerrainGeometryData>) {
  const digest = createHash('sha256');
  digest.update(new Uint8Array(geometry.positions.buffer));
  digest.update(new Uint8Array(geometry.colors.buffer));
  digest.update(new Uint8Array(geometry.indices.buffer));
  return digest.digest('hex');
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

  it('matches the pinned former radius-twenty-two topology at every runtime profile', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 22);
    const expectations = [
      [4, 145_824, 73_453, '2aff8e3dd18acf763384fe1b6a62e372a861300e1a78cb4bea131303da44c1e2'],
      [3, 82_026, 41_419, 'a84d5eba7ea564e65ff4d993cf18595758928811a49a34875a752351ab8441cb'],
      [2, 36_456, 18_499, 'cf7281152a74638413ed38fcc7bca80b75f8d1b9d333ed364d92cfb450b247aa']
    ] as const;

    expectations.forEach(([subdivisions, triangleCount, vertexCount, digest]) => {
      const adaptiveBoundary = createTerrainGeometryData(map, 1, {
        subdivisionsPerEdge: subdivisions,
        adaptiveDetailRadius: 22
      });

      expect(adaptiveBoundary.triangleCount).toBe(triangleCount);
      expect(adaptiveBoundary.vertexCount).toBe(vertexCount);
      expect(adaptiveBoundary.coarseCellCount).toBe(0);
      expect(adaptiveBoundary.transitionEdgeCount).toBe(0);
      expect(adaptiveBoundary.degenerateTriangleCount).toBe(0);
      expect(geometryDigest(adaptiveBoundary)).toBe(digest);
    });
  });

  it('uses the exact bounded adaptive topology for the radius-sixty render envelope', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 60);
    const expectations = [
      [4, 203_406, 102_067],
      [3, 139_338, 70_033],
      [2, 93_498, 47_113]
    ] as const;

    expectations.forEach(([subdivisions, triangleCount, vertexCount]) => {
      const geometry = createTerrainGeometryData(map, 1, {
        subdivisionsPerEdge: subdivisions,
        adaptiveDetailRadius: 22,
        playableRadius: 58
      });

      expect(geometry.subdivisionsPerEdge).toBe(subdivisions);
      expect(geometry.outerSubdivisionsPerEdge).toBe(1);
      expect(geometry.detailRadius).toBe(22);
      expect(geometry.highDetailCellCount).toBe(1_519);
      expect(geometry.coarseCellCount).toBe(9_462);
      expect(geometry.transitionEdgeCount).toBe(270);
      expect(geometry.triangleCount).toBe(triangleCount);
      expect(geometry.vertexCount).toBe(vertexCount);
      expect(geometry.degenerateTriangleCount).toBe(0);
      expect(geometry.sharedVertexReuseCount).toBeGreaterThan(0);

      const edgeIncidence = new Map<string, number>();
      const addEdge = (first: number, second: number) => {
        const key = first < second ? `${first}:${second}` : `${second}:${first}`;
        edgeIncidence.set(key, (edgeIncidence.get(key) ?? 0) + 1);
      };
      for (let index = 0; index < geometry.indices.length; index += 3) {
        const first = geometry.indices[index]!;
        const second = geometry.indices[index + 1]!;
        const third = geometry.indices[index + 2]!;
        addEdge(first, second);
        addEdge(second, third);
        addEdge(third, first);
      }
      const incidence = [...edgeIncidence.values()];
      expect(incidence.filter((count) => count === 1)).toHaveLength(726);
      expect(incidence.every((count) => count === 1 || count === 2)).toBe(true);
      expect(geometry.vertexCount - edgeIncidence.size + geometry.triangleCount).toBe(1);
    });
  });

  it('shares every segmented transition vertex between the inner lattice and outer fan', () => {
    const completeMap = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 23);
    const seamKeys = new Set(['22,0', '23,0']);
    const seamMap = {
      ...completeMap,
      cells: completeMap.cells.filter((cell) => (
        seamKeys.has(`${cell.coord.q},${cell.coord.r}`)
      ))
    };
    const geometry = createTerrainGeometryData(seamMap, 1, {
      subdivisionsPerEdge: 4,
      adaptiveDetailRadius: 22
    });
    const outerCorners = pointyHexCorners({ q: 23, r: 0 }, 1);
    const first = outerCorners[5]!;
    const second = outerCorners[4]!;

    expect(geometry.transitionEdgeCount).toBe(1);
    expect(geometry.triangleCount).toBe(105);
    expect(geometry.degenerateTriangleCount).toBe(0);
    for (let segment = 1; segment < 4; segment += 1) {
      const ratio = segment / 4;
      const x = first.x * (1 - ratio) + second.x * ratio;
      const z = first.z * (1 - ratio) + second.z * ratio;
      const matchingIndices: number[] = [];
      for (let index = 0; index < geometry.positions.length; index += 3) {
        if (
          Math.abs(geometry.positions[index]! - x) < 0.000_01
          && Math.abs(geometry.positions[index + 2]! - z) < 0.000_01
        ) matchingIndices.push(index / 3);
      }

      expect(matchingIndices).toHaveLength(1);
      const sharedIndex = matchingIndices[0]!;
      let incidentTriangleCount = 0;
      for (let index = 0; index < geometry.indices.length; index += 3) {
        if (
          geometry.indices[index] === sharedIndex
          || geometry.indices[index + 1] === sharedIndex
          || geometry.indices[index + 2] === sharedIndex
        ) incidentTriangleCount += 1;
      }
      // Three inner-lattice triangles plus two outer-fan triangles reference
      // the same indexed vertex: no T-junction or duplicate seam point.
      expect(incidentTriangleCount).toBe(5);
    }
  });
});
