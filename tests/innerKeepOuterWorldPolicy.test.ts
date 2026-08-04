import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_CITY_DISTRICT_ROADS,
  INNER_KEEP_OUTER_WORLD_APPROACHES,
  INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU,
  INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS,
  INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS,
  INNER_KEEP_OUTER_WORLD_LAKE,
  INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS,
  INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS,
  INNER_KEEP_OUTER_WORLD_RESOURCE_SITES,
  INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT,
  INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES,
  INNER_KEEP_OUTER_WORLD_TRADE_ROUTE,
  INNER_KEEP_OUTER_WORLD_TREE_BUDGETS,
  INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS,
  INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE,
  INNER_KEEP_OUTER_WORLD_WILDLIFE_BUDGETS,
  innerKeepCityDistrictRoadEdgeDistance,
  innerKeepOuterWorldCompoundPlateauSignedDistance,
  innerKeepOuterWorldDistanceToResourceSite,
  innerKeepOuterWorldDistanceToRoad,
  innerKeepOuterWorldDistanceToWater,
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
  innerKeepOuterWorldTerrainSlopeAt,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
const EXPANDED_WALL = Object.freeze({
  westX: -20.2,
  eastX: 20.2,
  northZ: -21,
  southZ: 15,
  cornerHalfExtent: 2,
});

function outsideCanonicalWallEnvelope(x: number, z: number) {
  return x < EXPANDED_WALL.westX
    || x > EXPANDED_WALL.eastX
    || z < EXPANDED_WALL.northZ
    || z > EXPANDED_WALL.southZ;
}

describe('Inner Keep outer-world presentation policy', () => {
  it('publishes a rich but bounded presentation-only contract', () => {
    expect(INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS).toEqual([34, 38]);
    expect(INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU).toMatchObject({
      minimumX: -24.2,
      maximumX: 24.2,
      minimumZ: -25,
      maximumZ: 19,
      centerX: 0,
      centerZ: -3,
      cornerRadiusMeters: 5,
      outerFeatherMeters: 5.5,
    });
    expect(INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(
      INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.map(({ featureId }) => featureId),
    ).size).toBe(INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length);
    for (const feature of INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES) {
      expect(Math.abs(feature.centerMeters[0])).toBeLessThan(34);
      expect(Math.abs(feature.centerMeters[1])).toBeLessThan(38);
      expect(outsideCanonicalWallEnvelope(...feature.centerMeters)).toBe(true);
    }
    expect(INNER_KEEP_OUTER_WORLD_TREE_SPECIES_IDS).toEqual([
      'warpkeep.tree.birch.fresh-slender',
      'warpkeep.tree.cypress.ancient-dark',
      'warpkeep.tree.maple.meadow-round',
      'warpkeep.tree.oak.spring-broad',
      'warpkeep.tree.pine.alpine',
      'warpkeep.tree.spruce.deep-narrow',
    ]);
    expect(INNER_KEEP_OUTER_WORLD_TREE_BUDGETS).toEqual({
      high: 72,
      balanced: 44,
      reduced: 22,
    });
    expect(INNER_KEEP_OUTER_WORLD_WILDLIFE_BUDGETS).toEqual({
      high: 10,
      balanced: 7,
      reduced: 4,
    });
    expect(INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.high.grassBlades).toBe(2_400);
    expect(INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.balanced.grassBlades).toBe(1_400);
    expect(INNER_KEEP_OUTER_WORLD_QUALITY_BUDGETS.reduced.grassBlades).toBe(480);
  });

  it('keeps the complete expanded wall footprint on an exact rounded plateau', () => {
    const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
    const samples = [
      [plateau.minimumX, plateau.centerZ],
      [plateau.maximumX, plateau.centerZ],
      [plateau.centerX, plateau.minimumZ],
      [plateau.centerX, plateau.maximumZ],
      [0, 0],
      [EXPANDED_WALL.westX, 0],
      [EXPANDED_WALL.eastX, 0],
      [0, EXPANDED_WALL.northZ],
      [0, EXPANDED_WALL.southZ],
      [EXPANDED_WALL.westX - EXPANDED_WALL.cornerHalfExtent,
        EXPANDED_WALL.northZ - EXPANDED_WALL.cornerHalfExtent],
      [EXPANDED_WALL.eastX + EXPANDED_WALL.cornerHalfExtent,
        EXPANDED_WALL.northZ - EXPANDED_WALL.cornerHalfExtent],
      [EXPANDED_WALL.westX - EXPANDED_WALL.cornerHalfExtent,
        EXPANDED_WALL.southZ + EXPANDED_WALL.cornerHalfExtent],
      [EXPANDED_WALL.eastX + EXPANDED_WALL.cornerHalfExtent,
        EXPANDED_WALL.southZ + EXPANDED_WALL.cornerHalfExtent],
    ] as const;
    for (const [x, z] of samples) {
      expect(innerKeepOuterWorldTerrainHeightAt(x, z)).toBe(0);
    }
    expect(Math.abs(innerKeepOuterWorldTerrainHeightAt(
      plateau.maximumX + 0.05,
      plateau.centerZ,
    ))).toBeLessThan(0.001);
    expect(Math.abs(innerKeepOuterWorldTerrainHeightAt(
      plateau.maximumX + plateau.outerFeatherMeters,
      plateau.centerZ,
    ))).toBeGreaterThan(0.01);
  });

  it('cuts and smoothly feathers the rounded plateau corners', () => {
    const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
    const inverseRootTwo = 1 / Math.sqrt(2);
    const coreCornerX = plateau.maximumX - plateau.cornerRadiusMeters;
    const coreCornerZ = plateau.maximumZ - plateau.cornerRadiusMeters;
    const boundaryX = coreCornerX + plateau.cornerRadiusMeters * inverseRootTwo;
    const boundaryZ = coreCornerZ + plateau.cornerRadiusMeters * inverseRootTwo;
    const outwardX = boundaryX + 0.05 * inverseRootTwo;
    const outwardZ = boundaryZ + 0.05 * inverseRootTwo;

    expect(innerKeepOuterWorldCompoundPlateauSignedDistance(boundaryX, boundaryZ))
      .toBeCloseTo(0, 10);
    expect(innerKeepOuterWorldTerrainHeightAt(boundaryX, boundaryZ)).toBe(0);
    expect(innerKeepOuterWorldCompoundPlateauSignedDistance(
      plateau.maximumX,
      plateau.maximumZ,
    )).toBeGreaterThan(2);
    expect(innerKeepOuterWorldCompoundPlateauSignedDistance(outwardX, outwardZ))
      .toBeCloseTo(0.05, 10);
    expect(Math.abs(innerKeepOuterWorldTerrainHeightAt(outwardX, outwardZ)))
      .toBeLessThan(0.001);
  });

  it('retains a level wall shoulder and bounded four-sided terrain feather', () => {
    const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
    const shoulderPairs = [
      [[EXPANDED_WALL.westX, -3], [plateau.minimumX + 0.5, -3]],
      [[EXPANDED_WALL.eastX, -3], [plateau.maximumX - 0.5, -3]],
      [[0, EXPANDED_WALL.northZ], [0, plateau.minimumZ + 0.5]],
      [[0, EXPANDED_WALL.southZ], [0, plateau.maximumZ - 0.5]],
    ] as const;
    for (const [[wallX, wallZ], [shoulderX, shoulderZ]] of shoulderPairs) {
      expect(Math.abs(
        innerKeepOuterWorldTerrainHeightAt(shoulderX, shoulderZ)
          - innerKeepOuterWorldTerrainHeightAt(wallX, wallZ),
      )).toBeLessThanOrEqual(0.08);
    }

    const featherSamples = [
      { x: plateau.minimumX, z: plateau.centerZ, dx: -1, dz: 0 },
      { x: plateau.maximumX, z: plateau.centerZ, dx: 1, dz: 0 },
      { x: plateau.centerX, z: plateau.minimumZ, dx: 0, dz: -1 },
      { x: plateau.centerX, z: plateau.maximumZ, dx: 0, dz: 1 },
    ];
    for (const sample of featherSamples) {
      for (let distance = 0.25; distance <= plateau.outerFeatherMeters; distance += 0.25) {
        expect(innerKeepOuterWorldTerrainSlopeAt(
          sample.x + sample.dx * distance,
          sample.z + sample.dz * distance,
        )).toBeLessThanOrEqual(0.45);
      }
    }
  });

  it('samples deterministic finite topography with meaningful elevation range', () => {
    const first: number[] = [];
    const second: number[] = [];
    for (let x = -34; x <= 34; x += 0.5) {
      for (let z = -38; z <= 38; z += 0.5) {
        first.push(innerKeepOuterWorldTerrainHeightAt(x, z));
        second.push(innerKeepOuterWorldTerrainHeightAt(x, z));
      }
    }
    expect(second).toEqual(first);
    expect(first.every(Number.isFinite)).toBe(true);
    expect(Math.min(...first)).toBeGreaterThanOrEqual(
      INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.minimum,
    );
    expect(Math.max(...first)).toBeLessThanOrEqual(
      INNER_KEEP_OUTER_WORLD_HEIGHT_BOUNDS_METERS.maximum,
    );
    expect(Math.max(...first) - Math.min(...first)).toBeGreaterThan(3);
    expect(Number.isFinite(innerKeepOuterWorldTerrainSlopeAt(30, -33))).toBe(true);
    expect(innerKeepOuterWorldTerrainHeightAt(Number.NaN, 0)).toBe(0);
  });

  it('levels four scenic resource pads outside the walls without claiming authority', () => {
    expect(INNER_KEEP_OUTER_WORLD_RESOURCE_SITES).toHaveLength(4);
    expect(INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.map(({ resourceKind }) => resourceKind).sort())
      .toEqual(['food', 'gold', 'stone', 'wood']);
    expect(INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce(
      (total, site) => total + site.instancesByQuality.high,
      0,
    )).toBe(8);
    expect(INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce(
      (total, site) => total + site.instancesByQuality.balanced,
      0,
    )).toBe(6);
    expect(INNER_KEEP_OUTER_WORLD_RESOURCE_SITES.reduce(
      (total, site) => total + site.instancesByQuality.reduced,
      0,
    )).toBe(4);

    for (const site of INNER_KEEP_OUTER_WORLD_RESOURCE_SITES) {
      const [x, y, z] = site.positionMeters;
      expect(outsideCanonicalWallEnvelope(x, z)).toBe(true);
      expect(
        z < EXPANDED_WALL.northZ - site.padRadiusMeters
          || z > EXPANDED_WALL.southZ + site.padRadiusMeters
          || x < EXPANDED_WALL.westX - site.padRadiusMeters
          || x > EXPANDED_WALL.eastX + site.padRadiusMeters,
      ).toBe(true);
      expect(site.presentationOnly).toBe(true);
      expect(site.authoritativeResourceNode).toBe(false);
      expect(site.gameplayAuthority).toBe('none');
      expect(site.targetFootprintDiameter).toBeGreaterThanOrEqual(3.2);
      expect(innerKeepOuterWorldTerrainHeightAt(x, z)).toBe(y);
      expect(innerKeepOuterWorldTerrainHeightAt(x + site.padRadiusMeters * 0.7, z))
        .toBe(y);
      expect(innerKeepOuterWorldDistanceToResourceSite(x, z)).toBeLessThan(0);
      expect(innerKeepOuterWorldPointIsClear(x, z)).toBe(false);
    }
  });

  it('connects a strictly downhill headwater and east rill to the visible lake', () => {
    const [halfWidth, halfDepth] = INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS;
    expect(INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.length).toBeGreaterThanOrEqual(12);
    expect(INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.some(
      ({ x, z }) => x === 28.6 && z === -3,
    )).toBe(true);
    for (let index = 0; index < INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.length; index += 1) {
      const point = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[index]!;
      expect(Math.abs(point.x) + point.width * 0.5).toBeLessThan(halfWidth);
      expect(Math.abs(point.z) + point.width * 0.5).toBeLessThan(halfDepth);
      expect(point.x - point.width * 0.5).toBeGreaterThan(EXPANDED_WALL.eastX);
      expect(point.y).toBeGreaterThan(
        innerKeepOuterWorldTerrainHeightAt(point.x, point.z),
      );
      if (index > 0) {
        expect(point.y).toBeLessThan(
          INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[index - 1]!.y,
        );
      }
    }
    const inlet = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.at(-1)!;
    expect(inlet.x).toBe(INNER_KEEP_OUTER_WORLD_LAKE.center.x);
    expect(inlet.z).toBeCloseTo(
      INNER_KEEP_OUTER_WORLD_LAKE.center.z - INNER_KEEP_OUTER_WORLD_LAKE.radii.z,
      8,
    );
    expect(inlet.y).toBeGreaterThan(INNER_KEEP_OUTER_WORLD_LAKE.center.y);
    expect(
      INNER_KEEP_OUTER_WORLD_LAKE.center.x - INNER_KEEP_OUTER_WORLD_LAKE.radii.x,
    ).toBeGreaterThan(EXPANDED_WALL.eastX);
    expect(
      Math.abs(INNER_KEEP_OUTER_WORLD_LAKE.center.x) + INNER_KEEP_OUTER_WORLD_LAKE.radii.x,
    ).toBeLessThan(halfWidth);
    expect(
      Math.abs(INNER_KEEP_OUTER_WORLD_LAKE.center.z) + INNER_KEEP_OUTER_WORLD_LAKE.radii.z,
    ).toBeLessThan(halfDepth);
  });

  it('keeps the exterior road and trade route grounded and presentation-only', () => {
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.closed).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.presentationOnly).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.gameplayAuthority).toBe('none');
    expect(INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS.length).toBeGreaterThanOrEqual(16);
    for (const point of INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS) {
      expect(outsideCanonicalWallEnvelope(point.x, point.z)).toBe(true);
      expect(Math.abs(point.x) + INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters)
        .toBeLessThan(34);
      expect(Math.abs(point.z) + INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.halfWidthMeters)
        .toBeLessThan(38);
      expect(Number.isFinite(innerKeepOuterWorldTerrainHeightAt(point.x, point.z))).toBe(true);
    }
    for (const [x, y, z] of INNER_KEEP_OUTER_WORLD_TRADE_ROUTE) {
      expect(y).toBe(innerKeepOuterWorldTerrainHeightAt(x, z));
    }
    expect(INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.at(-2)?.[2])
      .toBe(INNER_KEEP_OUTER_WORLD_APPROACHES.gateOuterZ);
    expect(INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.at(-1)?.[2])
      .toBe(INNER_KEEP_OUTER_WORLD_APPROACHES.gateInnerZ);
    expect(INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.at(-2)?.[2]).toBeGreaterThan(
      EXPANDED_WALL.southZ,
    );
    expect(INNER_KEEP_OUTER_WORLD_TRADE_ROUTE.at(-1)?.[2]).toBeLessThan(
      EXPANDED_WALL.southZ,
    );
    expect(INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS.some(
      ({ z }) => z === INNER_KEEP_OUTER_WORLD_APPROACHES.northernResourceRoadZ,
    )).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS.some(
      ({ z }) => z === INNER_KEEP_OUTER_WORLD_APPROACHES.southernResourceRoadZ,
    )).toBe(true);
    for (const site of INNER_KEEP_OUTER_WORLD_RESOURCE_SITES) {
      const approachZ = site.positionMeters[2] < 0
        ? INNER_KEEP_OUTER_WORLD_APPROACHES.northernResourceRoadZ
        : INNER_KEEP_OUTER_WORLD_APPROACHES.southernResourceRoadZ;
      expect(Math.abs(site.positionMeters[2] - approachZ)).toBeLessThanOrEqual(5);
    }
    expect(innerKeepOuterWorldDistanceToRoad(
      INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[0]!.x,
      INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[0]!.z,
    )).toBe(0);
  });

  it('keeps the full patrol-road surface clear of the stream and lake', () => {
    const road = INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT;
    for (let index = 0; index < road.points.length; index += 1) {
      const from = road.points[index]!;
      const to = road.points[(index + 1) % road.points.length]!;
      const length = Math.hypot(to.x - from.x, to.z - from.z);
      const sampleCount = Math.max(1, Math.ceil(length * 12));
      for (let sample = 0; sample <= sampleCount; sample += 1) {
        const progress = sample / sampleCount;
        const x = from.x + (to.x - from.x) * progress;
        const z = from.z + (to.z - from.z) * progress;
        expect(
          innerKeepOuterWorldDistanceToWater(x, z),
          `road segment ${index} sample ${sample}`,
        ).toBeGreaterThan(road.halfWidthMeters + 0.05);
      }
    }
  });

  it('publishes measurable presentation-only district lanes for ecology clearance', () => {
    expect(INNER_KEEP_CITY_DISTRICT_ROADS).toHaveLength(7);
    for (const road of INNER_KEEP_CITY_DISTRICT_ROADS) {
      expect(road.closed).toBe(false);
      expect(road.points.length).toBeGreaterThanOrEqual(2);
      for (const point of road.points) {
        expect(innerKeepCityDistrictRoadEdgeDistance(point.x, point.z))
          .toBeLessThanOrEqual(0);
      }
    }
  });

  it('uses one clear-point predicate for forest, wildlife, and grass exclusions', () => {
    expect(innerKeepOuterWorldPointIsClear(0, 0)).toBe(false);
    const water = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[5]!;
    expect(innerKeepOuterWorldPointIsClear(water.x, water.z)).toBe(false);
    const road = INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[10]!;
    expect(innerKeepOuterWorldPointIsClear(road.x, road.z)).toBe(false);
    expect(innerKeepOuterWorldDistanceToWater(-28, -27)).toBeGreaterThan(1);
    expect(innerKeepOuterWorldPointIsClear(-28, -27)).toBe(true);
  });
});
