import { describe, expect, it } from 'vitest';

import {
  grassExclusionsForForestTrees,
  grassExclusionsForResourceNodes
} from '../src/components/realm/createRealmScene';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { HEGEMONY_EXPEDITION_ASSET_BUDGETS } from '../src/components/realm/realmGoldNodeLayer';
import { HEGEMONY_FOOD_FARM_ASSET_BUDGETS } from '../src/components/realm/realmFoodNodeLayer';
import { HEGEMONY_STONE_QUARRY_ASSET_BUDGETS } from '../src/components/realm/realmStoneNodeLayer';
import { HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS } from '../src/components/realm/realmWoodNodeLayer';
import { hexDistance, hexKey, hexNeighbors } from '../src/game/map/hexCoordinates';
import {
  generateRealmForestInfill,
  REALM_FOREST_INFILL_BUDGETS
} from '../src/game/map/realmForestInfill';
import { resolveRealmSharedForestLayout } from '../src/game/map/realmSharedForestPlacements';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import { createRealmVegetationField } from '../src/game/map/realmVegetationField';
import { createRealmVegetationMask } from '../src/game/map/realmVegetationMask';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';
import { GENESIS_WATER_REVISION_ENABLED_CELLS_V1 } from '../spacetimedb/src/waterRevision';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function resourceRecords<T extends Readonly<{ siteId: string; q: number; r: number }>>(
  sites: readonly T[]
) {
  return sites.map((site) => ({ siteId: site.siteId, coord: { q: site.q, r: site.r } }));
}

function canonicalInput() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createAuthoritativeRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.tiles,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
  const passability = new Map(snapshot.tileMetadata.map((row) => [row.tileKey, row.passable] as const));
  const species = HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => {
    const model = hegemonyTreeModel(asset, 'compact');
    return {
      id: asset.id,
      triangles: model.triangles,
      footprintDiameter: model.normalizedFootprintDiameter,
      biomes: asset.biomes
    };
  });
  const shared = resolveRealmSharedForestLayout({
    layout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    rows: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
    realmId: snapshot.realm.realmId,
    renderMap: surface.renderMap,
    terrainKindsByKey: semantics.terrainKindsByKey,
    species,
    isCoordPassable: (coord) => passability.get(hexKey(coord)) === true
  });
  if (shared.source !== 'shared') throw new Error('expected canonical shared forest');
  const placements = createHegemonyCastlePlacements(snapshot.castles.map((castle) => ({
    id: `castle:${castle.castleId}`,
    coord: { q: castle.q, r: castle.r }
  })));
  const resourceCircles = [
    ...grassExclusionsForResourceNodes(
      'gold', resourceRecords(CANONICAL_TIER_I_GOLD_SITES_V1),
      HEGEMONY_EXPEDITION_ASSET_BUDGETS.goldMineTargetFootprint
    ),
    ...grassExclusionsForResourceNodes(
      'food', resourceRecords(CANONICAL_TIER_I_FOOD_SITES_V1),
      HEGEMONY_FOOD_FARM_ASSET_BUDGETS.wheatFarmTargetFootprint
    ),
    ...grassExclusionsForResourceNodes(
      'wood', resourceRecords(CANONICAL_TIER_I_WOOD_SITES_V1),
      HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS.loggingCampTargetFootprint
    ),
    ...grassExclusionsForResourceNodes(
      'stone', resourceRecords(CANONICAL_TIER_I_STONE_SITES_V1),
      HEGEMONY_STONE_QUARRY_ASSET_BUDGETS.stoneQuarryTargetFootprint
    )
  ];
  const field = createRealmVegetationField({
    worldSeed: surface.renderMap.worldSeed,
    terrainKindsByKey: semantics.terrainKindsByKey,
    playableKeys: surface.playableKeys
  });
  const mask = createRealmVegetationMask({
    playableKeys: surface.playableKeys,
    waterCells: GENESIS_WATER_CELLS_V1,
    placements,
    circles: [
      ...resourceCircles,
      ...grassExclusionsForForestTrees(shared.shared.data.points)
    ]
  });
  return {
    field,
    mask,
    passability,
    placements,
    resourceCircles,
    semantics,
    shared: shared.shared.data,
    species,
    surface
  };
}

describe('decorative outer-Realm forest infill', () => {
  it('is deterministic, clustered, compact-budgeted, and clear of authority roots', () => {
    const input = canonicalInput();
    const options = {
      quality: 'high' as const,
      species: input.species,
      vegetationField: input.field,
      playableKeys: input.surface.playableKeys,
      authoritativeTrees: input.shared.points,
      placements: input.placements,
      isWorldExcluded: input.mask.isTreeExcluded,
      isCoordPassable: (coord: Readonly<{ q: number; r: number }>) => (
        input.passability.get(hexKey(coord)) === true
      )
    };
    const first = generateRealmForestInfill(
      input.surface.renderMap,
      input.semantics.terrainKindsByKey,
      options
    );
    const repeat = generateRealmForestInfill(
      input.surface.renderMap,
      input.semantics.terrainKindsByKey,
      options
    );

    expect(first).toEqual(repeat);
    expect(first.source).toBe('decorative-infill');
    expect(first.points.length).toBeGreaterThan(80);
    expect(first.points.length).toBeLessThanOrEqual(REALM_FOREST_INFILL_BUDGETS.high.instances);
    expect(first.counts.estimatedTriangleCount)
      .toBeLessThanOrEqual(REALM_FOREST_INFILL_BUDGETS.high.triangles);
    expect(first.clusterCount).toBeGreaterThanOrEqual(8);
    expect(first.counts.speciesCount).toBeLessThanOrEqual(first.clusterCount * 2);
    expect(first.points.every((point) => (
      hexDistance({ q: 0, r: 0 }, point.coord) > 20
      && input.mask.isTreeExcluded(point.world) === false
    ))).toBe(true);
    const treeKeys = new Set(first.points.map((point) => hexKey(point.coord)));
    expect([...treeKeys].every((key) => {
      const [q, r] = key.split(',').map(Number);
      return hexNeighbors({ q: q!, r: r! }).some((neighbor) => treeKeys.has(hexKey(neighbor)));
    })).toBe(true);
    first.points.forEach((point) => {
      input.shared.points.forEach((anchor) => {
        expect(Math.hypot(point.world.x - anchor.world.x, point.world.z - anchor.world.z))
          .toBeGreaterThan(0.2);
      });
    });
    expect(input.shared.points).toHaveLength(210);
  }, 20_000);

  it('does not add decorative trees on reduced quality', () => {
    const input = canonicalInput();
    const reduced = generateRealmForestInfill(
      input.surface.renderMap,
      input.semantics.terrainKindsByKey,
      {
        quality: 'reduced',
        species: input.species,
        vegetationField: input.field,
        playableKeys: input.surface.playableKeys,
        authoritativeTrees: input.shared.points,
        placements: input.placements,
        isWorldExcluded: input.mask.isTreeExcluded
      }
    );

    expect(reduced.points).toEqual([]);
    expect(reduced.clusterCount).toBe(0);
    expect(input.shared.points).toHaveLength(210);
  });

  it('allows former scenic-lake cells into decorative ecology only after activation', () => {
    const input = canonicalInput();
    const activeField = createRealmVegetationField({
      worldSeed: input.surface.renderMap.worldSeed,
      terrainKindsByKey: input.semantics.terrainKindsByKey,
      playableKeys: input.surface.playableKeys,
      visualizeLegacyLakesAsLand: true
    });
    const activeMask = createRealmVegetationMask({
      playableKeys: input.surface.playableKeys,
      waterCells: GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
      placements: input.placements,
      circles: [
        ...input.resourceCircles,
        ...grassExclusionsForForestTrees(input.shared.points)
      ]
    });
    const active = generateRealmForestInfill(
      input.surface.renderMap,
      input.semantics.terrainKindsByKey,
      {
        quality: 'high',
        species: input.species,
        vegetationField: activeField,
        playableKeys: input.surface.playableKeys,
        authoritativeTrees: input.shared.points,
        placements: input.placements,
        isWorldExcluded: activeMask.isTreeExcluded,
        isCoordPassable: (coord) => input.passability.get(hexKey(coord)) === true,
        visualizeLegacyLakesAsLand: true
      }
    );

    expect(active.points.some((point) => (
      input.semantics.terrainKindsByKey.get(hexKey(point.coord)) === 'lake'
    ))).toBe(true);
  }, 20_000);
});
