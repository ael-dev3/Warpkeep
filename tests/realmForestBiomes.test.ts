import { describe, expect, it } from 'vitest';

import { hexKey, hexNeighbors } from '../src/game/map/hexCoordinates';
import {
  generateRealmForestBiomes,
  realmForestCanopyMinimumSeparation,
  REALM_FOREST_BIOME_BUDGETS,
  REALM_FOREST_TREE_MINIMUM_SEPARATION,
  type RealmForestSpecies
} from '../src/game/map/realmForestBiomes';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createHegemonyCastlePlacements } from '../src/game/map/terrainPlacements';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel,
  type HegemonyTreeLod
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function testTreeSpecies(lod: HegemonyTreeLod): readonly RealmForestSpecies[] {
  return Object.freeze(HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => {
    const model = hegemonyTreeModel(asset, lod);
    return Object.freeze({
      id: asset.id,
      triangles: model.triangles,
      footprintDiameter: model.normalizedFootprintDiameter,
      biomes: asset.biomes
    });
  }));
}

const TEST_TREE_SPECIES = testTreeSpecies('high');

function canonicalInput() {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
  const suppressed = new Set(snapshot.tileMetadata
    .filter((row) => (
      row.staticContentKind === 'castle-slot'
      || row.staticContentKind === 'scenic-blocker'
    ))
    .map((row) => row.tileKey));
  const placements = createHegemonyCastlePlacements(snapshot.tileMetadata
    .filter((row) => row.staticContentKind === 'castle-slot')
    .map((row, index) => {
      const [q, r] = row.tileKey.split(',').map(Number);
      return { id: `castle-slot-${index + 1}`, coord: { q: q!, r: r! } };
    }));
  return { placements, semantics, snapshot, surface, suppressed };
}

function connectedTreeCellSizes(treeKeys: ReadonlySet<string>) {
  const visited = new Set<string>();
  const sizes: number[] = [];
  treeKeys.forEach((key) => {
    if (visited.has(key)) return;
    const queue = [key];
    visited.add(key);
    let size = 0;
    while (queue.length > 0) {
      const current = queue.pop()!;
      size += 1;
      const [q, r] = current.split(',').map(Number);
      hexNeighbors({ q: q!, r: r! }).forEach((neighbor) => {
        const neighborKey = hexKey(neighbor);
        if (!treeKeys.has(neighborKey) || visited.has(neighborKey)) return;
        visited.add(neighborKey);
        queue.push(neighborKey);
      });
    }
    sizes.push(size);
  });
  return sizes.sort((left, right) => right - left);
}

describe('renderer-only forest ecoregions', () => {
  it('forms deterministic separated groves while retaining broad open space', () => {
    const { placements, semantics, snapshot, surface, suppressed } = canonicalInput();
    const options = {
      quality: 'high' as const,
      species: TEST_TREE_SPECIES,
      placements,
      suppressedTileKeys: suppressed,
      isCoordPassable: (coord: Readonly<{ q: number; r: number }>) => (
        snapshot.tileMetadata.find((row) => row.tileKey === hexKey(coord))?.passable === true
      )
    };
    const first = generateRealmForestBiomes(
      surface.renderMap,
      semantics.terrainKindsByKey,
      options
    );
    const repeat = generateRealmForestBiomes(
      surface.renderMap,
      semantics.terrainKindsByKey,
      options
    );

    expect(first).toEqual(repeat);
    // Species-aware wide-canopy clearance trades a little raw density for
    // legible oaks and willows: these remain visibly lush groves, not clipped
    // stacks of broadleaf crowns.
    expect(first.points.length).toBeGreaterThan(200);
    expect(first.points.length).toBeLessThanOrEqual(REALM_FOREST_BIOME_BUDGETS.high.instances);
    expect(first.counts.estimatedTriangleCount)
      .toBeLessThanOrEqual(REALM_FOREST_BIOME_BUDGETS.high.triangles);
    expect(first.counts.groveCellCount).toBeGreaterThan(18);
    expect(first.counts.openFoliageCellCount)
      .toBeGreaterThan(first.counts.eligibleFoliageCellCount * 0.5);
    expect(first.counts.speciesCount).toBe(TEST_TREE_SPECIES.length);
    expect(first.points.every((point) => {
      const kind = semantics.terrainKindsByKey.get(hexKey(point.coord));
      return kind === 'forest' || kind === 'lowland' || kind === 'meadow';
    })).toBe(true);
    expect(first.points.every((point) => !suppressed.has(hexKey(point.coord)))).toBe(true);
    // The immutable GLB provenance permits deterministic uniform variation
    // only in this range; the renderer consumes this value without a second
    // scale multiplier.
    expect(first.points.every((point) => point.scale >= 0.9 && point.scale <= 1.1)).toBe(true);
    expect([...first.canopyByTileKey.keys()].every((key) => !suppressed.has(key))).toBe(true);
    const componentSizes = connectedTreeCellSizes(new Set(first.points.map((point) => (
      hexKey(point.coord)
    ))));
    expect(componentSizes.length).toBeGreaterThanOrEqual(12);
    expect(componentSizes.length).toBeLessThanOrEqual(24);
    expect(componentSizes.every((size) => size >= 2)).toBe(true);
    expect(componentSizes[0]).toBeGreaterThanOrEqual(10);
    first.points.forEach((point, index) => {
      first.points.slice(index + 1).forEach((other) => {
        expect(Math.hypot(point.world.x - other.world.x, point.world.z - other.world.z))
          .toBeGreaterThanOrEqual(
            Math.max(
              REALM_FOREST_TREE_MINIMUM_SEPARATION,
              realmForestCanopyMinimumSeparation(point, other)
            ) - 0.000_001
          );
      });
    });
  });

  it('honours quality, triangle, passability, and caller-reserved tile limits', () => {
    const { semantics, surface, suppressed } = canonicalInput();
    const unprotected = generateRealmForestBiomes(surface.renderMap, semantics.terrainKindsByKey, {
      quality: 'high',
      species: TEST_TREE_SPECIES,
      suppressedTileKeys: suppressed
    });
    const firstTreeKey = hexKey(unprotected.points[0]!.coord);
    const high = generateRealmForestBiomes(surface.renderMap, semantics.terrainKindsByKey, {
      quality: 'high',
      species: TEST_TREE_SPECIES,
      suppressedTileKeys: suppressed,
      protectedTileKeys: new Set([firstTreeKey]),
      maximumInstanceCount: 80,
      maximumTriangleCount: 8_400,
      isCoordPassable: (coord) => hexKey(coord) !== firstTreeKey
    });
    const balanced = generateRealmForestBiomes(surface.renderMap, semantics.terrainKindsByKey, {
      quality: 'balanced',
      species: testTreeSpecies('balanced'),
      suppressedTileKeys: suppressed,
      protectedTileKeys: new Set([firstTreeKey]),
      isCoordPassable: (coord) => hexKey(coord) !== firstTreeKey
    });
    const reduced = generateRealmForestBiomes(surface.renderMap, semantics.terrainKindsByKey, {
      quality: 'reduced',
      species: testTreeSpecies('compact'),
      suppressedTileKeys: suppressed,
      protectedTileKeys: new Set([firstTreeKey]),
      isCoordPassable: (coord) => hexKey(coord) !== firstTreeKey
    });

    expect(high.points.length).toBeLessThanOrEqual(20);
    expect(high.counts.estimatedTriangleCount).toBeLessThanOrEqual(8_400);
    expect(high.points.every((point) => hexKey(point.coord) !== firstTreeKey)).toBe(true);
    expect(balanced.points.length).toBeGreaterThan(reduced.points.length);
    expect(reduced.points.length).toBeLessThanOrEqual(REALM_FOREST_BIOME_BUDGETS.reduced.instances);
  });
});
