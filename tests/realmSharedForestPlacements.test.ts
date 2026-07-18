import { describe, expect, it } from 'vitest';

import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
import {
  resolveRealmSharedForestLayout
} from '../src/game/map/realmSharedForestPlacements';
import { hexKey } from '../src/game/map/hexCoordinates';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel,
  type HegemonyTreeLod
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

function speciesFor(lod: HegemonyTreeLod) {
  return HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => {
    const model = hegemonyTreeModel(asset, lod);
    return Object.freeze({
      id: asset.id,
      triangles: model.triangles,
      footprintDiameter: model.normalizedFootprintDiameter,
      biomes: asset.biomes
    });
  });
}

function canonicalForestInput(lod: HegemonyTreeLod, overrides: Readonly<{
  layout?: unknown;
  rows?: unknown;
  allowLegacyFallback?: boolean;
}> = {}) {
  const snapshot = createCanonicalGenesisSnapshot();
  const surface = createRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const semantics = indexRealmTerrainSemantics(surface, snapshot.tileMetadata);
  return {
    layout: overrides.layout === undefined
      ? CANONICAL_GENESIS_FOREST_LAYOUT_V1
      : overrides.layout,
    rows: overrides.rows === undefined
      ? CANONICAL_GENESIS_FOREST_INSTANCES_V1
      : overrides.rows,
    allowLegacyFallback: overrides.allowLegacyFallback,
    realmId: snapshot.realm.realmId,
    renderMap: surface.renderMap,
    terrainKindsByKey: semantics.terrainKindsByKey,
    species: speciesFor(lod),
    isCoordPassable: (coord: Readonly<{ q: number; r: number }>) => (
      snapshot.tileMetadata.find((row) => row.tileKey === hexKey(coord))?.passable === true
    )
  };
}

describe('shared Genesis forest placement bridge', () => {
  it('uses the exact canonical 210-row layout at every graphics LOD', () => {
    const high = resolveRealmSharedForestLayout(canonicalForestInput('high'));
    const balanced = resolveRealmSharedForestLayout(canonicalForestInput('balanced'));
    const compact = resolveRealmSharedForestLayout(canonicalForestInput('compact'));

    expect(high.source).toBe('shared');
    expect(balanced.source).toBe('shared');
    expect(compact.source).toBe('shared');
    if (high.source !== 'shared' || balanced.source !== 'shared' || compact.source !== 'shared') {
      throw new Error('expected shared forest layout');
    }
    expect(high.shared.data.points).toHaveLength(210);
    expect(balanced.shared.data.points).toHaveLength(210);
    expect(compact.shared.data.points).toHaveLength(210);
    expect(high.shared.layout).toEqual(CANONICAL_GENESIS_FOREST_LAYOUT_V1);
    // Quality affects only the selected immutable GLB LOD/triangle accounting,
    // never the shared tree locations, rotation, scale, species, or habitat.
    expect(balanced.shared.data.points.map((point) => ({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat
    }))).toEqual(high.shared.data.points.map((point) => ({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat
    })));
    expect(compact.shared.data.points.map((point) => ({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat
    }))).toEqual(high.shared.data.points.map((point) => ({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat
    })));
  });

  it('blocks a count-correct projection when any exact fixed-point row differs', () => {
    const alteredRows = CANONICAL_GENESIS_FOREST_INSTANCES_V1.map((row, index) => (
      index === 0
        ? Object.freeze({ ...row, scaleBasisPoints: row.scaleBasisPoints - 1 })
        : row
    ));
    const resolution = resolveRealmSharedForestLayout(canonicalForestInput('high', {
      rows: alteredRows
    }));
    expect(resolution).toEqual({ source: 'blocked' });
  });

  it('blocks missing, one-sided, or unseeded public tables in normal player rendering', () => {
    const noTables = canonicalForestInput('high', { layout: undefined, rows: undefined });
    // The helper defaults canonical fixtures when a key is undefined, so pass
    // an explicit non-array empty projection to exercise the normal boundary.
    expect(resolveRealmSharedForestLayout({ ...noTables, layout: undefined, rows: undefined }))
      .toEqual({ source: 'blocked' });
    expect(resolveRealmSharedForestLayout(canonicalForestInput('high', {
      layout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
      rows: []
    }))).toEqual({ source: 'blocked' });
    expect(resolveRealmSharedForestLayout({
      ...canonicalForestInput('high'),
      layout: undefined
    })).toEqual({ source: 'blocked' });
  });

  it('permits the retired local preview only when an explicit dev/test flag is set', () => {
    const fallback = resolveRealmSharedForestLayout({
      ...canonicalForestInput('high'),
      layout: undefined,
      rows: undefined,
      allowLegacyFallback: true
    });
    expect(fallback).toEqual({ source: 'legacy-fallback' });
  });
});
