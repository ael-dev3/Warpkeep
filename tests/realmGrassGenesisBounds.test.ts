import { createHash } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import {
  createRealmGrassLayer,
  type RealmGrassLayer
} from '../src/components/realm/createRealmGrassLayer';
import {
  grassExclusionsForForestTrees,
  grassExclusionsForResourceNodes,
  grassExclusionsForTerrainFeatures
} from '../src/components/realm/createRealmScene';
import {
  HEGEMONY_EXPEDITION_ASSET_BUDGETS
} from '../src/components/realm/realmGoldNodeLayer';
import {
  HEGEMONY_FOOD_FARM_ASSET_BUDGETS
} from '../src/components/realm/realmFoodNodeLayer';
import {
  HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS
} from '../src/components/realm/realmWoodNodeLayer';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { REALM_GRASS_RENDER_PLANS, REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { terrainCellByCoord } from '../src/game/map/generateTerrainMap';
import { axialToWorld, hexDisc, hexKey } from '../src/game/map/hexCoordinates';
import {
  createRealmGrassExclusionIndex,
  generateRealmGrassCells
} from '../src/game/map/realmGrass';
import { resolveRealmSharedForestLayout } from '../src/game/map/realmSharedForestPlacements';
import { generateRealmTerrainFeatures } from '../src/game/map/realmTerrainFeatures';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { createAuthoritativeRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function digestPackedGrass(layer: RealmGrassLayer) {
  const digest = createHash('sha256');
  layer.meshes.forEach((mesh) => {
    const count = mesh.count;
    digest.update(String(count));
    const matrixValues = mesh.instanceMatrix.array;
    digest.update(new Uint8Array(
      matrixValues.buffer,
      matrixValues.byteOffset,
      count * 16 * matrixValues.BYTES_PER_ELEMENT
    ));
    const phases = mesh.geometry.getAttribute('grassPhase').array;
    digest.update(new Uint8Array(
      phases.buffer,
      phases.byteOffset,
      count * phases.BYTES_PER_ELEMENT
    ));
  });
  return digest.digest('hex');
}

describe('canonical Genesis 001 grass bounds', () => {
  it('keeps the live 10,000-cell realm camera-local, deterministic, and under the High ceiling', () => {
    const snapshot = createCanonicalGenesisSnapshot();
    const surface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    );
    const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
    const placements = createHegemonyCastlePlacements(snapshot.castles.map((castle) => ({
      id: `castle:${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    })));
    const features = generateRealmTerrainFeatures(
      surface.renderMap,
      semantics.terrainKindsByKey,
      'high',
      1,
      placements,
      semantics.castleSlotKeys
    );
    const layer = createRealmGrassLayer({
      surface,
      terrainKindsByKey: semantics.terrainKindsByKey,
      castleSlotKeys: semantics.castleSlotKeys,
      placements,
      exclusions: grassExclusionsForTerrainFeatures(features.points),
      plan: REALM_GRASS_RENDER_PLANS.high,
      reducedMotion: false
    });

    expect(surface.playableMap.cells).toHaveLength(10_000);
    expect(surface.renderMap.cells).toHaveLength(10_981);
    layer.updateView({ x: 0, z: 0 }, 'realm');
    expect(layer.getTelemetry()).toMatchObject({
      activeCellCount: 0,
      instanceCount: 0,
      overviewHidden: true
    });

    layer.updateView({ x: 0, z: 0 }, 'keep');
    const first = layer.getTelemetry();
    expect(first.activeCellCount).toBe(469);
    expect(first.cacheEntries).toBeLessThanOrEqual(REALM_GRASS_RENDER_PLANS.high.cacheLimit);
    expect(first.cacheEntries).toBeLessThan(10_000);
    expect(first.instanceCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveInstances
    );
    expect(first.triangleCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveTriangles
    );
    expect(first.drawCalls).toBeLessThanOrEqual(3);
    expect(first.variantCounts).toHaveLength(3);
    expect(digestPackedGrass(layer)).toBe(
      'd27befa17b44b0eaba5d24695c983c23c683c723472bb426e38d04ed2273594b'
    );

    layer.updateView(axialToWorld({ q: 30, r: -10 }, 1), 'keep');
    const traversed = layer.getTelemetry();
    expect(traversed.activeCellCount).toBe(469);
    expect(traversed.cacheEntries).toBeLessThanOrEqual(REALM_GRASS_RENDER_PLANS.high.cacheLimit);
    expect(traversed.cacheEntries).toBeLessThan(10_000);
    expect(traversed.instanceCount).toBeLessThanOrEqual(
      REALM_GRASS_RENDER_PLANS.high.maximumActiveInstances
    );
    layer.dispose();
  });

  it('keeps generated grass outside every canonical forest and resource structure circle', () => {
    const snapshot = createCanonicalGenesisSnapshot();
    const surface = createAuthoritativeRealmTerrainSurface(
      snapshot.realm.numericSeed,
      snapshot.tiles,
      snapshot.realm.authoritativeRadius,
      snapshot.realm.renderRadius
    );
    const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
    const passabilityByTileKey = new Map(
      snapshot.tileMetadata.map((row) => [row.tileKey, row.passable] as const)
    );
    const forest = resolveRealmSharedForestLayout({
      layout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
      rows: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
      realmId: snapshot.realm.realmId,
      renderMap: surface.renderMap,
      terrainKindsByKey: semantics.terrainKindsByKey,
      species: HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => {
        const model = hegemonyTreeModel(asset, 'high');
        return Object.freeze({
          id: asset.id,
          triangles: model.triangles,
          footprintDiameter: model.normalizedFootprintDiameter,
          biomes: asset.biomes
        });
      }),
      isCoordPassable: (coord) => passabilityByTileKey.get(hexKey(coord)) === true
    });
    expect(forest.source).toBe('shared');
    if (forest.source !== 'shared') throw new Error('expected canonical shared forest');

    const resourceRecords = <T extends Readonly<{
      siteId: string;
      q: number;
      r: number;
    }>>(sites: readonly T[]) => sites.map((site) => Object.freeze({
      siteId: site.siteId,
      coord: Object.freeze({ q: site.q, r: site.r })
    }));
    const exclusions = Object.freeze([
      ...grassExclusionsForForestTrees(forest.shared.data.points),
      ...grassExclusionsForResourceNodes(
        'gold',
        resourceRecords(CANONICAL_TIER_I_GOLD_SITES_V1),
        HEGEMONY_EXPEDITION_ASSET_BUDGETS.goldMineTargetFootprint
      ),
      ...grassExclusionsForResourceNodes(
        'food',
        resourceRecords(CANONICAL_TIER_I_FOOD_SITES_V1),
        HEGEMONY_FOOD_FARM_ASSET_BUDGETS.wheatFarmTargetFootprint
      ),
      ...grassExclusionsForResourceNodes(
        'wood',
        resourceRecords(CANONICAL_TIER_I_WOOD_SITES_V1),
        HEGEMONY_LOGGING_CAMP_ASSET_BUDGETS.loggingCampTargetFootprint
      )
    ]);
    expect(exclusions.filter(({ id }) => id.startsWith('forest-tree:'))).toHaveLength(210);
    expect(exclusions.filter(({ id }) => id.startsWith('resource-site:gold:')))
      .toHaveLength(CANONICAL_TIER_I_GOLD_SITES_V1.length);
    expect(exclusions.filter(({ id }) => id.startsWith('resource-site:food:')))
      .toHaveLength(CANONICAL_TIER_I_FOOD_SITES_V1.length);
    expect(exclusions.filter(({ id }) => id.startsWith('resource-site:wood:')))
      .toHaveLength(CANONICAL_TIER_I_WOOD_SITES_V1.length);

    const exclusionCoords = [
      ...forest.shared.data.points.map((point) => point.coord),
      ...CANONICAL_TIER_I_GOLD_SITES_V1,
      ...CANONICAL_TIER_I_FOOD_SITES_V1,
      ...CANONICAL_TIER_I_WOOD_SITES_V1
    ];
    const cellsByKey = new Map(exclusionCoords.flatMap((coord) => (
      hexDisc(coord, 1).flatMap((candidate) => {
        const cell = terrainCellByCoord(surface.renderMap, candidate);
        return cell ? [[hexKey(candidate), cell] as const] : [];
      })
    )));
    const placements = createHegemonyCastlePlacements(snapshot.castles.map((castle) => ({
      id: `castle:${castle.castleId}`,
      coord: { q: castle.q, r: castle.r }
    })));
    const grass = generateRealmGrassCells({
      map: surface.renderMap,
      cells: [...cellsByKey.values()],
      terrainKindsByKey: semantics.terrainKindsByKey,
      playableKeys: surface.playableKeys,
      playableRadius: surface.playableMap.radius,
      renderRadius: surface.renderMap.radius,
      quality: 'high',
      placements,
      castleSlotKeys: semantics.castleSlotKeys,
      exclusionIndex: createRealmGrassExclusionIndex(exclusions)
    });

    expect(grass.points.length).toBeGreaterThan(0);
    expect(grass.rejectedByExclusion).toBeGreaterThan(0);
    const violations = grass.points.flatMap((point) => exclusions.flatMap((exclusion) => {
      const dx = point.world.x - exclusion.world.x;
      const dz = point.world.z - exclusion.world.z;
      return dx * dx + dz * dz < exclusion.radius * exclusion.radius
        ? [`${point.coord.q},${point.coord.r}:${exclusion.id}`]
        : [];
    }));
    expect(violations).toEqual([]);
  }, 15_000);
});
