import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { axialToWorld } from '../src/game/map/hexCoordinates';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel,
  type HegemonyTreeRuntimeAsset
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import {
  createRealmForestLayer,
  HEGEMONY_TREE_PREFAB_LOAD_CONCURRENCY,
  type RealmForestPrefabAcquirer
} from '../src/components/realm/realmForestLayer';
import { createRealmForestModelReadyRenderCallback } from '../src/components/realm/createRealmScene';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import type { RealmForestBiomeData, RealmForestTreePoint } from '../src/game/map/realmForestBiomes';
import type { HegemonyTreePrefabLease } from '../src/components/realm/loadHegemonyTreeAssets';

const surface = createRealmTerrainSurface('forest-layer-tests', 2, 2);

function pointForAsset(asset: HegemonyTreeRuntimeAsset, index = 0): RealmForestTreePoint {
  const coord = { q: index, r: 0 };
  const model = hegemonyTreeModel(asset, 'high');
  return Object.freeze({
    speciesId: asset.id,
    coord: Object.freeze(coord),
    world: Object.freeze(axialToWorld(coord, 1)),
    rotation: 0,
    scale: 1,
    habitat: 'grove',
    estimatedTriangles: model.triangles,
    footprintDiameter: model.normalizedFootprintDiameter
  });
}

function biomeData(points: readonly RealmForestTreePoint[]): RealmForestBiomeData {
  return Object.freeze({
    points: Object.freeze([...points]),
    canopyByTileKey: new Map(),
    counts: Object.freeze({
      forestSemanticCellCount: points.length,
      groveCellCount: points.length,
      fringeCellCount: 0,
      eligibleFoliageCellCount: points.length,
      openFoliageCellCount: 0,
      openCellCount: 0,
      treeCount: points.length,
      speciesCount: new Set(points.map((point) => point.speciesId)).size,
      estimatedTriangleCount: points.reduce((total, point) => total + point.estimatedTriangles, 0)
    }),
    instanceBudget: points.length,
    triangleBudget: points.reduce((total, point) => total + point.estimatedTriangles, 0)
  });
}

function fakeLease(asset: HegemonyTreeRuntimeAsset, release: () => void = () => {}): HegemonyTreePrefabLease {
  const geometry = new THREE.BoxGeometry(0.12, 0.32, 0.12);
  geometry.translate(0, 0.16, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#5a8a43' });
  return Object.freeze({
    prefab: Object.freeze({
      assetId: asset.id,
      lod: 'high',
      assetUrl: '/models/local-tree.glb',
      visualHeight: 0.62,
      footprintDiameter: hegemonyTreeModel(asset, 'high').normalizedFootprintDiameter,
      primitives: Object.freeze([Object.freeze({
        geometry,
        material,
        localMatrixElements: Object.freeze([...new THREE.Matrix4().elements])
      })])
    }),
    release
  });
}

function createLayer(
  points: readonly RealmForestTreePoint[],
  acquirePrefab: RealmForestPrefabAcquirer,
  onModelReady?: () => void
) {
  return createRealmForestLayer({
    data: biomeData(points),
    map: surface.renderMap,
    terrainPlacements: [],
    quality: REALM_QUALITY_SPECS.high,
    baseUrl: '/',
    acquirePrefab,
    onModelReady
  });
}

describe('static forest presentation layer', () => {
  it('requests a repaint at model-ready unless the Realm scene is already disposed', () => {
    const render = vi.fn();
    createRealmForestModelReadyRenderCallback(() => false, render)();
    expect(render).toHaveBeenCalledOnce();
    createRealmForestModelReadyRenderCallback(() => true, render)();
    expect(render).toHaveBeenCalledOnce();
  });

  it.each(['fetch', 'integrity', 'parse'] as const)(
    'keeps the one-call fallback after a %s failure',
    async (phase) => {
      const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
      const acquirePrefab = vi.fn<RealmForestPrefabAcquirer>(async () => {
        throw new Error('synthetic ' + phase + ' failure');
      });
      const layer = createLayer([pointForAsset(asset)], acquirePrefab);

      await vi.waitFor(() => expect(acquirePrefab).toHaveBeenCalledOnce());
      await Promise.resolve();
      expect(layer.getPresentationTelemetry()).toEqual({
        instanceCount: 1,
        drawCalls: 1,
        usingFallback: true
      });
      expect(layer.group.getObjectByName('realm-hegemony-tree-static-fallback')).toBeTruthy();
      expect(layer.group.getObjectByName('realm-hegemony-tree-static-batch')).toBeUndefined();
      layer.dispose();
    }
  );

  it('stages selected local prefabs, replaces the fallback, and signals a repaint', async () => {
    const assets = HEGEMONY_TREE_RUNTIME_ASSETS.slice(0, 6);
    const points = assets.map((asset, index) => pointForAsset(asset, index));
    let activeLoads = 0;
    let maximumActiveLoads = 0;
    const release = vi.fn();
    const onModelReady = vi.fn();
    const acquirePrefab = vi.fn<RealmForestPrefabAcquirer>(async (asset) => {
      activeLoads += 1;
      maximumActiveLoads = Math.max(maximumActiveLoads, activeLoads);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 1));
      activeLoads -= 1;
      return fakeLease(asset, release);
    });
    const layer = createLayer(points, acquirePrefab, onModelReady);

    await vi.waitFor(() => expect(layer.getPresentationTelemetry().usingFallback).toBe(false));
    expect(maximumActiveLoads).toBeLessThanOrEqual(HEGEMONY_TREE_PREFAB_LOAD_CONCURRENCY);
    expect(acquirePrefab).toHaveBeenCalledTimes(assets.length);
    expect(release).toHaveBeenCalledTimes(assets.length);
    expect(layer.getPresentationTelemetry()).toEqual({
      instanceCount: assets.length,
      drawCalls: 1,
      usingFallback: false
    });
    expect(layer.group.getObjectByName('realm-hegemony-tree-static-fallback')).toBeUndefined();
    expect(layer.group.getObjectByName('realm-hegemony-tree-static-batch')).toBeTruthy();
    expect(onModelReady).toHaveBeenCalledOnce();
    layer.dispose();
  });

  it('keeps decorative infill distinct and requests the compact reviewed LOD', async () => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
    const acquirePrefab = vi.fn<RealmForestPrefabAcquirer>(async (requestedAsset) => (
      fakeLease(requestedAsset)
    ));
    const layer = createRealmForestLayer({
      data: biomeData([pointForAsset(asset)]),
      map: surface.renderMap,
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.high,
      lod: 'compact',
      presentationName: 'realm-hegemony-forest-decorative-infill',
      baseUrl: '/',
      acquirePrefab
    });

    await vi.waitFor(() => expect(acquirePrefab).toHaveBeenCalledOnce());
    expect(acquirePrefab.mock.calls[0]![1]).toBe('compact');
    expect(layer.group.name).toBe('realm-hegemony-forest-decorative-infill');
    layer.dispose();
  });

  it('aborts without a late attachment and releases a lease that resolves after disposal', async () => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
    let resolveLease: ((lease: HegemonyTreePrefabLease) => void) | undefined;
    const release = vi.fn();
    const acquirePrefab = vi.fn<RealmForestPrefabAcquirer>(() => new Promise((resolve) => {
      resolveLease = resolve;
    }));
    const layer = createLayer([pointForAsset(asset)], acquirePrefab);

    await vi.waitFor(() => expect(acquirePrefab).toHaveBeenCalledOnce());
    layer.dispose();
    resolveLease?.(fakeLease(asset, release));
    await vi.waitFor(() => expect(release).toHaveBeenCalledOnce());
    expect(layer.group.children).toHaveLength(0);
    expect(layer.getPresentationTelemetry().drawCalls).toBe(0);
  });
});
