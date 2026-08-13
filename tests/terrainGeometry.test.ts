import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createTerrainGeometryData,
  DEFAULT_TERRAIN_SUBDIVISIONS,
  pointyHexCorners,
  sampleContinuousTerrainPresentation
} from '../src/components/realm/createTerrainGeometry';
import { generateRealmTerrainMap } from '../src/game/map/generateTerrainMap';
import {
  axialToWorld,
  hexDistance,
  hexKey
} from '../src/game/map/hexCoordinates';
import { createRealmNorthernSnowField } from '../src/game/map/realmNorthernSnow';
import { createRealmSouthernDesertField } from '../src/game/map/realmSouthernDesert';
import { HEGEMONY_GENESIS_001 } from '../src/game/map/realmSeed';
import { createHegemonyKeepPlacement } from '../src/game/map/terrainPlacements';
import {
  createRealmRiverBankPresentation
} from '../src/game/map/realmRiverBankPresentation';

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
  digest.update(new Uint8Array(geometry.materialCues.buffer));
  if (geometry.snowCoverage) {
    digest.update(new Uint8Array(geometry.snowCoverage.buffer));
  }
  if (geometry.sandCoverage) {
    digest.update(new Uint8Array(geometry.sandCoverage.buffer));
  }
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
    expect(geometry.materialCues.length).toBe(geometry.vertexCount * 4);
    expect(geometry.indices.length).toBeGreaterThan(0);
    expect(geometry.indices.length % 3).toBe(0);
    expect(Array.from(geometry.positions).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.colors).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.materialCues).every(Number.isFinite)).toBe(true);
    expect(Array.from(geometry.indices).every((index) => index >= 0 && index < vertexCount)).toBe(true);
    expect(geometry.degenerateTriangleCount).toBe(0);
    expect(geometry.materialCueMetrics.slopeMin).toBeGreaterThanOrEqual(0);
    expect(geometry.materialCueMetrics.slopeMax).toBeLessThanOrEqual(1);
    expect(geometry.materialCueMetrics.concavityMin).toBeGreaterThanOrEqual(-1);
    expect(geometry.materialCueMetrics.concavityMax).toBeLessThanOrEqual(1);
  });

  it('blends semantic and ecology signals continuously instead of stamping cell centres', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 3);
    const terrainKinds = new Map(map.cells.map((cell) => [
      `${cell.coord.q},${cell.coord.r}`,
      cell.coord.q <= 0 ? 'forest' as const : 'meadow' as const
    ]));
    const canopy = new Map(map.cells.map((cell) => [
      `${cell.coord.q},${cell.coord.r}`,
      cell.coord.q <= 0 ? 0.9 : 0.05
    ]));
    const vegetation = new Map(map.cells.map((cell) => [
      `${cell.coord.q},${cell.coord.r}`,
      cell.coord.q <= 0 ? 0.72 : 0.38
    ]));
    const left = sampleContinuousTerrainPresentation(
      { x: Math.sqrt(3) / 2 - 0.001, z: 0 },
      1,
      {
        terrainKindsByKey: terrainKinds,
        forestCanopyByKey: canopy,
        vegetationDensityByKey: vegetation
      }
    );
    const right = sampleContinuousTerrainPresentation(
      { x: Math.sqrt(3) / 2 + 0.001, z: 0 },
      1,
      {
        terrainKindsByKey: terrainKinds,
        forestCanopyByKey: canopy,
        vegetationDensityByKey: vegetation
      }
    );

    expect(left.semanticColor).toBeDefined();
    expect(right.semanticColor).toBeDefined();
    expect(Math.abs(left.semanticColor!.r - right.semanticColor!.r)).toBeLessThan(0.002);
    expect(Math.abs(left.semanticColor!.g - right.semanticColor!.g)).toBeLessThan(0.002);
    expect(Math.abs(left.forestCanopy - right.forestCanopy)).toBeLessThan(0.005);
    expect(Math.abs(left.vegetationDensity - right.vegetationDensity)).toBeLessThan(0.005);
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

  it('adds adjacent-land bank color and wetness without changing terrain topology', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 2);
    const riverBankPresentation = createRealmRiverBankPresentation([
      { cellKey: '0,0', q: 0, r: 0, regime: 'river' },
      { cellKey: '1,0', q: 1, r: 0, regime: 'river' },
      { cellKey: '2,0', q: 2, r: 0, regime: 'ocean' }
    ]);
    const neutral = createTerrainGeometryData(map, 1);
    const banked = createTerrainGeometryData(map, 1, {
      riverBankPresentation
    });

    expect(banked.positions).toEqual(neutral.positions);
    expect(banked.indices).toEqual(neutral.indices);
    expect(banked.triangleCount).toBe(neutral.triangleCount);
    expect(banked.vertexCount).toBe(neutral.vertexCount);
    expect(banked.colors).not.toEqual(neutral.colors);
    expect(banked.materialCues).not.toEqual(neutral.materialCues);
    expect(banked.riverBankVertexCount).toBeGreaterThan(0);
    expect(banked.riverBankInfluenceMax).toBeGreaterThan(0);
    expect(banked.riverBankInfluenceMax).toBeLessThanOrEqual(1);
    expect(banked.materialCueMetrics.wetnessMax)
      .toBeGreaterThanOrEqual(neutral.materialCueMetrics.wetnessMax);
  });

  it('adds one bounded snow scalar and CPU fallback color without changing topology', () => {
    const complete = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 60);
    const northernCoord = { q: 0, r: -48 } as const;
    const local = {
      ...complete,
      cells: complete.cells.filter((cell) => (
        hexDistance(cell.coord, northernCoord) <= 2
      ))
    };
    const snow = createRealmNorthernSnowField({
      worldSeed: complete.worldSeed,
      hexSize: 1,
      playableRadius: 58,
      renderRadius: 60
    });
    const geometryOptions = {
      subdivisionsPerEdge: 2,
      adaptiveDetailRadius: 0,
      playableRadius: 58,
      snowPlayableCellKeys: new Set(
        local.cells.map((cell) => hexKey(cell.coord))
      )
    } as const;
    const neutral = createTerrainGeometryData(local, 1, geometryOptions);
    const snowy = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      northernSnow: snow
    });
    const center = axialToWorld(northernCoord, 1);
    const centerIndex = Array.from(
      { length: snowy.vertexCount },
      (_, index) => index
    ).sort((left, right) => (
      Math.hypot(
        snowy.positions[left * 3]! - center.x,
        snowy.positions[left * 3 + 2]! - center.z
      )
      - Math.hypot(
        snowy.positions[right * 3]! - center.x,
        snowy.positions[right * 3 + 2]! - center.z
      )
    ))[0];

    expect(centerIndex).toBeDefined();
    expect(Math.hypot(
      snowy.positions[centerIndex! * 3]! - center.x,
      snowy.positions[centerIndex! * 3 + 2]! - center.z
    )).toBeLessThan(0.000_01);
    expect(snowy.positions).toEqual(neutral.positions);
    expect(snowy.indices).toEqual(neutral.indices);
    expect(snowy.materialCues).toEqual(neutral.materialCues);
    expect(snowy.triangleCount).toBe(neutral.triangleCount);
    expect(snowy.vertexCount).toBe(neutral.vertexCount);
    expect(snowy.colors).not.toEqual(neutral.colors);
    expect(snowy.snowCoverage).toHaveLength(snowy.vertexCount);
    expect(Array.from(snowy.snowCoverage!).every((value) => (
      Number.isFinite(value) && value >= 0 && value <= 1
    ))).toBe(true);
    expect(snowy.snowCoverage![centerIndex!]).toBeGreaterThan(0.3);
    expect(snowy.snowCoverageMetrics.attributeBytes).toBe(
      snowy.vertexCount * Float32Array.BYTES_PER_ELEMENT
    );
    expect(snowy.snowCoverageMetrics.sampledPlayableLandCellCenterCount)
      .toBe(local.cells.length);
    expect(snowy.snowCoverageMetrics.retainedCellCenterCountAbove015)
      .toBeGreaterThan(0);
    expect(snowy.snowCoverageMetrics.retainedDeepCellCenterCountAbove075)
      .toBeGreaterThan(0);
    expect(snowy.snowCoverageMetrics.retainedCellCenterCoverageRatio)
      .toBe(
        snowy.snowCoverageMetrics.retainedCellCenterCountAbove015
          / local.cells.length
      );
    expect(snowy.snowCoverageMetrics.retainedDeepCellCenterCoverageRatio)
      .toBe(
        snowy.snowCoverageMetrics.retainedDeepCellCenterCountAbove075
          / local.cells.length
      );
    expect(snowy.snowCoverageMetrics.retainedCellCenterCoverageMean)
      .toBeGreaterThan(0);
    expect(snowy.snowCoverageMetrics.retainedCellCenterSouthernLeakCount)
      .toBe(0);

    const excluded = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      northernSnow: snow,
      snowExcludedCellKeys: new Set(['0,-48'])
    });
    expect(excluded.snowCoverage![centerIndex!]).toBe(0);
    expect(excluded.snowCoverageMetrics.sampledPlayableLandCellCenterCount)
      .toBe(local.cells.length - 1);

    const founded = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      placements: [createHegemonyKeepPlacement('northern-keep', northernCoord)],
      northernSnow: snow
    });
    expect(founded.snowCoverage![centerIndex!])
      .toBeLessThan(snowy.snowCoverage![centerIndex!] * 0.1);

    const resourceCleared = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      northernSnow: snow,
      snowClearanceCircles: [{
        world: center,
        radius: 0.55
      }]
    });
    expect(resourceCleared.positions).toEqual(snowy.positions);
    expect(resourceCleared.indices).toEqual(snowy.indices);
    expect(resourceCleared.snowCoverage![centerIndex!])
      .toBeLessThan(snowy.snowCoverage![centerIndex!] * 0.1);
    expect(resourceCleared.snowCoverageMetrics.attributeBytes)
      .toBe(snowy.snowCoverageMetrics.attributeBytes);
    expect(resourceCleared.snowCoverageMetrics.retainedCellCenterCoverageMean)
      .toBeLessThan(snowy.snowCoverageMetrics.retainedCellCenterCoverageMean);
  });

  it('adds a separate bounded sand scalar with zero meaningful snow overlap', () => {
    const complete = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 60);
    const southernCoord = { q: 0, r: 48 } as const;
    const local = {
      ...complete,
      cells: complete.cells.filter((cell) => (
        hexDistance(cell.coord, southernCoord) <= 2
      ))
    };
    const climateOptions = {
      worldSeed: complete.worldSeed,
      hexSize: 1,
      playableRadius: 58,
      renderRadius: 60
    } as const;
    const snow = createRealmNorthernSnowField(climateOptions);
    const desert = createRealmSouthernDesertField(climateOptions);
    const geometryOptions = {
      subdivisionsPerEdge: 2,
      adaptiveDetailRadius: 0,
      playableRadius: 58,
      sandPlayableCellKeys: new Set(
        local.cells.map((cell) => hexKey(cell.coord))
      )
    } as const;
    const neutral = createTerrainGeometryData(local, 1, geometryOptions);
    const climate = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      northernSnow: snow,
      southernDesert: desert
    });
    const center = axialToWorld(southernCoord, 1);
    const centerIndex = Array.from(
      { length: climate.vertexCount },
      (_, index) => index
    ).sort((left, right) => (
      Math.hypot(
        climate.positions[left * 3]! - center.x,
        climate.positions[left * 3 + 2]! - center.z
      )
      - Math.hypot(
        climate.positions[right * 3]! - center.x,
        climate.positions[right * 3 + 2]! - center.z
      )
    ))[0]!;

    expect(climate.positions).toEqual(neutral.positions);
    expect(climate.indices).toEqual(neutral.indices);
    expect(climate.materialCues).toEqual(neutral.materialCues);
    expect(climate.triangleCount).toBe(neutral.triangleCount);
    expect(climate.vertexCount).toBe(neutral.vertexCount);
    expect(climate.colors).not.toEqual(neutral.colors);
    expect(climate.sandCoverage).toHaveLength(climate.vertexCount);
    expect(Array.from(climate.sandCoverage!).every((value) => (
      Number.isFinite(value) && value >= 0 && value <= 1
    ))).toBe(true);
    expect(climate.sandCoverage![centerIndex]).toBeGreaterThan(0.25);
    expect(climate.snowCoverage![centerIndex]).toBeLessThan(0.01);
    expect(climate.sandCoverageMetrics.snowOverlapVertexCount).toBe(0);
    expect(climate.sandCoverageMetrics.attributeBytes).toBe(
      climate.vertexCount * Float32Array.BYTES_PER_ELEMENT
    );
    expect(climate.sandCoverageMetrics.sampledPlayableLandCellCenterCount)
      .toBe(local.cells.length);
    expect(climate.sandCoverageMetrics.retainedCellCenterCountAbove015)
      .toBeGreaterThan(0);
    expect(climate.sandCoverageMetrics.retainedDeepCellCenterCountAbove075)
      .toBeGreaterThan(0);
    expect(climate.sandCoverageMetrics.retainedCellCenterCoverageRatio)
      .toBe(
        climate.sandCoverageMetrics.retainedCellCenterCountAbove015
          / local.cells.length
      );
    expect(climate.sandCoverageMetrics.retainedDeepCellCenterCoverageRatio)
      .toBe(
        climate.sandCoverageMetrics.retainedDeepCellCenterCountAbove075
          / local.cells.length
      );
    expect(climate.sandCoverageMetrics.retainedCellCenterCoverageMean)
      .toBeGreaterThan(0);
    expect(climate.sandCoverageMetrics.retainedCellCenterNorthernLeakCount)
      .toBe(0);
    expect(climate.sandCoverageMetrics.snowOverlapCellCenterCount).toBe(0);

    const excluded = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      northernSnow: snow,
      southernDesert: desert,
      sandExcludedCellKeys: new Set(['0,48'])
    });
    expect(excluded.sandCoverage![centerIndex]).toBe(0);
    expect(excluded.sandCoverageMetrics.sampledPlayableLandCellCenterCount)
      .toBe(local.cells.length - 1);

    const founded = createTerrainGeometryData(local, 1, {
      ...geometryOptions,
      placements: [createHegemonyKeepPlacement('southern-keep', southernCoord)],
      northernSnow: snow,
      southernDesert: desert
    });
    expect(founded.sandCoverage![centerIndex])
      .toBeLessThan(climate.sandCoverage![centerIndex] * 0.1);
    expect(founded.sandCoverageMetrics.retainedCellCenterCoverageMean)
      .toBeLessThan(climate.sandCoverageMetrics.retainedCellCenterCoverageMean);
  });

  it('matches the pinned former radius-twenty-two topology at every runtime profile', () => {
    const map = generateRealmTerrainMap(HEGEMONY_GENESIS_001, 22);
    const expectations = [
      [4, 145_824, 73_453, '9447109d42d328e108304eb0c1f2bea23daa566bff855b06c514a2f7a2776c43'],
      [3, 82_026, 41_419, '1da2d8f834a07c102a225cefabb8fe722b319651254e981ec60b704e2374f62a'],
      [2, 36_456, 18_499, 'fda53511282e075ba04fd5c448e735bd87545e3af5ba2ec32ab1d0a74c257a79']
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
      [4, 203_406, 102_067, 0.50, 0.80],
      [3, 139_338, 70_033, 0.35, 0.55],
      [2, 93_498, 47_113, 0.25, 0.40]
    ] as const;

    expectations.forEach(([
      subdivisions,
      triangleCount,
      vertexCount,
      attributeMiBCeiling,
      combinedMiBCeiling
    ]) => {
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
      expect(
        geometry.vertexCount * Float32Array.BYTES_PER_ELEMENT / (1024 * 1024)
      ).toBeLessThan(attributeMiBCeiling);
      expect(
        geometry.vertexCount * Float32Array.BYTES_PER_ELEMENT * 2 / (1024 * 1024)
      ).toBeLessThan(combinedMiBCeiling);
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
  }, 15_000);

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
