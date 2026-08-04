import { describe, expect, it } from 'vitest';

import {
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
  innerKeepOuterWorldDistanceToResourceSite,
  innerKeepOuterWorldDistanceToRoad,
  innerKeepOuterWorldDistanceToWater,
  innerKeepOuterWorldPointIsClear,
  innerKeepOuterWorldTerrainHeightAt,
  innerKeepOuterWorldTerrainSlopeAt,
} from '../src/components/inner-keep/innerKeepOuterWorldPolicy';
import { INNER_KEEP_PRESENTATION_CLEARANCES } from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';

function outsideCanonicalWallEnvelope(x: number, z: number) {
  const wall = INNER_KEEP_PRESENTATION_CLEARANCES.wall;
  return x < wall.westX
    || x > wall.eastX
    || z < wall.northZ
    || z > wall.southZ;
}

describe('Inner Keep outer-world presentation policy', () => {
  it('publishes a rich but bounded presentation-only contract', () => {
    expect(INNER_KEEP_OUTER_WORLD_HALF_EXTENTS_METERS).toEqual([24, 26]);
    expect(INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length).toBeGreaterThanOrEqual(7);
    expect(new Set(
      INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.map(({ featureId }) => featureId),
    ).size).toBe(INNER_KEEP_OUTER_WORLD_TOPOGRAPHIC_FEATURES.length);
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

  it('keeps the complete canonical compound on an exact zero-height plateau', () => {
    const plateau = INNER_KEEP_OUTER_WORLD_COMPOUND_PLATEAU;
    const samples = [
      [plateau.minimumX, plateau.minimumZ],
      [plateau.maximumX, plateau.minimumZ],
      [plateau.minimumX, plateau.maximumZ],
      [plateau.maximumX, plateau.maximumZ],
      [0, 0],
      [INNER_KEEP_PRESENTATION_CLEARANCES.wall.westX, 0],
      [INNER_KEEP_PRESENTATION_CLEARANCES.wall.eastX, 0],
      [0, INNER_KEEP_PRESENTATION_CLEARANCES.wall.northZ],
      [0, INNER_KEEP_PRESENTATION_CLEARANCES.wall.southZ],
    ] as const;
    for (const [x, z] of samples) {
      expect(innerKeepOuterWorldTerrainHeightAt(x, z)).toBe(0);
    }
    expect(Math.abs(innerKeepOuterWorldTerrainHeightAt(
      plateau.maximumX + 0.05,
      0,
    ))).toBeLessThan(0.001);
    expect(Math.abs(innerKeepOuterWorldTerrainHeightAt(
      plateau.maximumX + plateau.outerFeatherMeters,
      0,
    ))).toBeGreaterThan(0.01);
  });

  it('samples deterministic finite topography with meaningful elevation range', () => {
    const first: number[] = [];
    const second: number[] = [];
    for (let x = -24; x <= 24; x += 0.5) {
      for (let z = -26; z <= 26; z += 0.5) {
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
    expect(Number.isFinite(innerKeepOuterWorldTerrainSlopeAt(21, -22))).toBe(true);
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
      ({ x, z }) => x === 17.5 && z === -8.8,
    )).toBe(true);
    for (let index = 0; index < INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE.length; index += 1) {
      const point = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[index]!;
      expect(Math.abs(point.x) + point.width * 0.5).toBeLessThan(halfWidth);
      expect(Math.abs(point.z) + point.width * 0.5).toBeLessThan(halfDepth);
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
  });

  it('keeps the exterior road and trade route grounded and presentation-only', () => {
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.closed).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.presentationOnly).toBe(true);
    expect(INNER_KEEP_OUTER_WORLD_ROAD_CIRCUIT.gameplayAuthority).toBe('none');
    expect(INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS.length).toBeGreaterThanOrEqual(16);
    for (const point of INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS) {
      expect(outsideCanonicalWallEnvelope(point.x, point.z)).toBe(true);
      expect(Number.isFinite(innerKeepOuterWorldTerrainHeightAt(point.x, point.z))).toBe(true);
    }
    for (const [x, y, z] of INNER_KEEP_OUTER_WORLD_TRADE_ROUTE) {
      expect(y).toBe(innerKeepOuterWorldTerrainHeightAt(x, z));
    }
    expect(innerKeepOuterWorldDistanceToRoad(
      INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[0]!.x,
      INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[0]!.z,
    )).toBe(0);
  });

  it('uses one clear-point predicate for forest, wildlife, and grass exclusions', () => {
    expect(innerKeepOuterWorldPointIsClear(0, 0)).toBe(false);
    const water = INNER_KEEP_OUTER_WORLD_WATER_CENTERLINE[5]!;
    expect(innerKeepOuterWorldPointIsClear(water.x, water.z)).toBe(false);
    const road = INNER_KEEP_OUTER_WORLD_PATROL_ROUTE_POINTS[10]!;
    expect(innerKeepOuterWorldPointIsClear(road.x, road.z)).toBe(false);
    expect(innerKeepOuterWorldDistanceToWater(-22, -20)).toBeGreaterThan(1);
    expect(innerKeepOuterWorldPointIsClear(-22, -20)).toBe(true);
  });
});
