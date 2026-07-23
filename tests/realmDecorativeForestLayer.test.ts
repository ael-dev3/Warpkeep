import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  createRealmDecorativeForestLayer,
  REALM_DECORATIVE_FOREST_RENDER_BUDGETS,
  selectRealmDecorativeForestCandidates,
  type RealmDecorativeForestCandidate
} from '../src/components/realm/createRealmDecorativeForestLayer';
import { REALM_FOREST_ACTIVE_WINDOW_PLANS } from '../src/components/realm/realmForestActiveWindow';
import { REALM_QUALITY_SPECS, type RealmQuality } from '../src/components/realm/realmQuality';
import {
  HEGEMONY_TREE_RUNTIME_ASSETS,
  hegemonyTreeModel,
  type HegemonyTreeLod,
  type HegemonyTreeRuntimeAsset
} from '../src/components/realm/hegemonyTreeRuntimeAssets';
import type { HegemonyTreePrefabLease } from '../src/components/realm/loadHegemonyTreeAssets';
import type { RealmForestEcologyCandidate } from '../src/game/map/realmForestEcology';
import { createRealmTerrainSurface } from '../src/game/map/realmTerrainSurface';
import { createRealmVegetationField } from '../src/game/map/realmVegetationField';
import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';

const FULLY_VISIBLE_VIEWPORT = Object.freeze({ radiusCells: 0 });

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, resolve, reject });
}

function leaseFor(
  asset: HegemonyTreeRuntimeAsset,
  lod: HegemonyTreeLod,
  release = vi.fn(),
  primitiveCount = 1
): HegemonyTreePrefabLease {
  const primitives = Array.from({ length: primitiveCount }, () => {
    const geometry = new THREE.BoxGeometry(0.12, 0.3, 0.12);
    geometry.translate(0, 0.15, 0);
    return Object.freeze({
      geometry,
      material: new THREE.MeshStandardMaterial({ color: '#477d43' }),
      localMatrixElements: Object.freeze([...new THREE.Matrix4().elements])
    });
  });
  return Object.freeze({
    prefab: Object.freeze({
      assetId: asset.id,
      lod,
      assetUrl: '/tree.glb',
      visualHeight: 0.62,
      footprintDiameter: hegemonyTreeModel(asset, lod).normalizedFootprintDiameter,
      primitives: Object.freeze(primitives)
    }),
    release
  });
}

function createForestFixture(
  quality: RealmQuality = 'reduced',
  assets: readonly HegemonyTreeRuntimeAsset[] = HEGEMONY_TREE_RUNTIME_ASSETS.slice(0, 1),
  radius = 18
) {
  const surface = createRealmTerrainSurface(
    `decorative-forest-layer-${quality}-${radius}`,
    radius,
    radius + 2
  );
  const terrainKinds = new Map(
    surface.playableMap.cells.map((cell) => [hexKey(cell.coord), 'forest' as const])
  );
  const field = createRealmVegetationField({
    worldSeed: surface.renderMap.worldSeed,
    terrainKindsByKey: terrainKinds,
    playableKeys: surface.playableKeys
  });
  const lod: HegemonyTreeLod = quality === 'high'
    ? 'high'
    : quality === 'balanced'
      ? 'balanced'
      : 'compact';
  const species = assets.map((asset) => {
    const model = hegemonyTreeModel(asset, lod);
    return Object.freeze({
      id: asset.id,
      triangles: model.triangles,
      footprintDiameter: model.normalizedFootprintDiameter,
      biomes: asset.biomes
    });
  });
  return Object.freeze({ surface, terrainKinds, field, species });
}

function syntheticCandidate(
  id: string,
  index: number,
  estimatedTriangles = 1
): RealmDecorativeForestCandidate {
  return Object.freeze({
    cellKey: id,
    speciesId: HEGEMONY_TREE_RUNTIME_ASSETS[0]!.id,
    coord: Object.freeze({ q: index, r: 0 }),
    world: Object.freeze({ x: index * 0.5, z: 0 }),
    rotation: 0,
    scale: 1,
    habitat: 'forest',
    rank: 1,
    footprintDiameter: 0.1,
    estimatedTriangles,
    canopyContribution: 1,
    edgeFade: 1
  });
}

describe('camera-local decorative forest renderer', () => {
  it('shows an immediate bounded fallback and atomically replaces it with the loaded model', async () => {
    const fixture = createForestFixture();
    const pendingLease = deferred<HegemonyTreePrefabLease>();
    const release = vi.fn();
    const acquire = vi.fn((
      _asset: HegemonyTreeRuntimeAsset,
      _lod: HegemonyTreeLod,
      _baseUrl: string,
      _signal: AbortSignal
    ) => pendingLease.promise);
    const ready = vi.fn();
    const telemetryChange = vi.fn();
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire,
      onModelReady: ready,
      onTelemetryChange: telemetryChange
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: true,
      drawCalls: 1,
      overviewHidden: false
    });
    expect(layer.getTelemetry().activeInstanceCount).toBeGreaterThan(0);
    expect(layer.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    )).toBeTruthy();
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());

    const [asset, lod] = acquire.mock.calls[0]!;
    pendingLease.resolve(leaseFor(asset, lod, release, 2));
    await vi.waitFor(() => expect(layer.getTelemetry().modelReady).toBe(true));

    expect(layer.getTelemetry()).toMatchObject({
      modelReady: true,
      usingFallback: false,
      drawCalls: 2
    });
    expect(layer.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    )).toBeUndefined();
    expect(layer.group.children).toHaveLength(2);
    expect(layer.group.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(telemetryChange).toHaveBeenCalled();

    layer.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(layer.group.visible).toBe(false);
  });

  it('retains prefab leases across repacks and overview hiding, then releases once on dispose', async () => {
    const fixture = createForestFixture();
    const release = vi.fn();
    const acquire = vi.fn(async (
      asset: HegemonyTreeRuntimeAsset,
      lod: HegemonyTreeLod
    ) => leaseFor(asset, lod, release));
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    await vi.waitFor(() => expect(layer.getTelemetry().modelReady).toBe(true));
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    expect(layer.updateView(
      axialToWorld({ q: 3, r: 0 }, 1),
      'keep',
      FULLY_VISIBLE_VIEWPORT
    )).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({ modelReady: true, usingFallback: false });
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    expect(layer.updateView(
      { x: 0, z: 0 },
      'realm',
      { radiusCells: Number.POSITIVE_INFINITY }
    )).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: false,
      overviewHidden: true
    });
    expect(layer.group.visible).toBe(false);
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      modelReady: true,
      usingFallback: false,
      overviewHidden: false
    });
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    layer.dispose();
    layer.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it('retains successful per-asset loads and does not retry a failed species on later repacks', async () => {
    const assets = HEGEMONY_TREE_RUNTIME_ASSETS.slice(0, 2);
    const fixture = createForestFixture('reduced', assets);
    const successfulAsset = assets[0]!;
    const failedAsset = assets[1]!;
    const release = vi.fn();
    const ready = vi.fn();
    const acquire = vi.fn(async (
      asset: HegemonyTreeRuntimeAsset,
      lod: HegemonyTreeLod
    ) => {
      if (asset.id === failedAsset.id) {
        throw new Error('synthetic one-species failure');
      }
      return leaseFor(asset, lod, release);
    });
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire,
      onModelReady: ready
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    expect(layer.getTelemetry().instancesBySpecies[successfulAsset.id]).toBeGreaterThan(0);
    expect(layer.getTelemetry().instancesBySpecies[failedAsset.id]).toBeGreaterThan(0);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledTimes(2));
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(acquire.mock.calls.filter(([asset]) => (
      asset.id === successfulAsset.id
    ))).toHaveLength(1);
    expect(acquire.mock.calls.filter(([asset]) => (
      asset.id === failedAsset.id
    ))).toHaveLength(1);
    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: true,
      drawCalls: 1
    });
    expect(release).not.toHaveBeenCalled();
    expect(ready).not.toHaveBeenCalled();

    expect(layer.updateView(
      { x: 0, z: 0 },
      'keep',
      { radiusCells: 9.6 }
    )).toBe(true);
    expect(layer.updateView(
      { x: 0, z: 0 },
      'keep',
      FULLY_VISIBLE_VIEWPORT
    )).toBe(true);
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(layer.getTelemetry().instancesBySpecies[successfulAsset.id]).toBeGreaterThan(0);
    expect(layer.getTelemetry().instancesBySpecies[failedAsset.id]).toBeGreaterThan(0);
    expect(acquire.mock.calls.filter(([asset]) => (
      asset.id === successfulAsset.id
    ))).toHaveLength(1);
    expect(acquire.mock.calls.filter(([asset]) => (
      asset.id === failedAsset.id
    ))).toHaveLength(1);
    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: true,
      drawCalls: 1
    });
    expect(release).not.toHaveBeenCalled();

    layer.dispose();
    layer.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it('coalesces pending loads across rapid reveal repacks and builds only the latest active points', async () => {
    const fixture = createForestFixture();
    const pendingLease = deferred<HegemonyTreePrefabLease>();
    const release = vi.fn();
    const ready = vi.fn();
    const activeSnapshots: Array<readonly RealmForestEcologyCandidate[]> = [];
    const acquire = vi.fn((
      _asset: HegemonyTreeRuntimeAsset,
      _lod: HegemonyTreeLod,
      _baseUrl: string,
      _signal: AbortSignal
    ) => pendingLease.promise);
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire,
      onModelReady: ready,
      onActivePointsChange: (points) => activeSnapshots.push(points)
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    const initialCount = activeSnapshots.at(-1)!.length;
    expect(initialCount).toBeGreaterThan(0);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());

    expect(layer.updateView(
      { x: 0, z: 0 },
      'keep',
      { radiusCells: 10 }
    )).toBe(true);
    expect(layer.updateView(
      { x: 0, z: 0 },
      'keep',
      { radiusCells: 10.5 }
    )).toBe(true);
    expect(layer.updateView(
      { x: 0, z: 0 },
      'keep',
      { radiusCells: 9.6 }
    )).toBe(true);
    const latestPoints = activeSnapshots.at(-1)!;
    expect(latestPoints.length).toBeGreaterThan(0);
    expect(latestPoints.length).not.toBe(initialCount);
    expect(layer.getTelemetry().activeInstanceCount).toBe(latestPoints.length);
    expect(acquire).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    const [asset, lod] = acquire.mock.calls[0]!;
    pendingLease.resolve(leaseFor(asset, lod, release));
    await vi.waitFor(() => expect(layer.getTelemetry().modelReady).toBe(true));

    const modelMeshes = layer.group.children.filter(
      (child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh
    );
    expect(acquire).toHaveBeenCalledOnce();
    expect(modelMeshes).toHaveLength(1);
    expect(modelMeshes[0]!.count).toBe(latestPoints.length);
    expect(layer.getTelemetry()).toMatchObject({
      activeInstanceCount: latestPoints.length,
      modelReady: true,
      usingFallback: false,
      drawCalls: 1
    });
    expect(ready).toHaveBeenCalledOnce();
    expect(release).not.toHaveBeenCalled();

    layer.dispose();
    layer.dispose();
    expect(release).toHaveBeenCalledOnce();
    expect(layer.group.children).toHaveLength(0);
  });

  it('keeps the safe fallback when model acquisition fails', async () => {
    const fixture = createForestFixture();
    const acquire = vi.fn(async () => {
      throw new Error('synthetic model acquisition failure');
    });
    const ready = vi.fn();
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire,
      onModelReady: ready
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: true,
      drawCalls: 1,
      overviewHidden: false
    });
    expect(layer.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    )).toBeTruthy();
    expect(ready).not.toHaveBeenCalled();
    layer.dispose();
  });

  it.each(['high', 'balanced', 'reduced'] as const)(
    'enforces the %s selection instance and triangle ceilings deterministically',
    (quality) => {
      const budget = REALM_DECORATIVE_FOREST_RENDER_BUDGETS[quality];
      const candidates = Array.from(
        { length: budget.instances + 64 },
        (_, index) => syntheticCandidate(`instance-${index}`, index)
      );
      const selected = selectRealmDecorativeForestCandidates(
        candidates,
        [],
        quality,
        REALM_FOREST_ACTIVE_WINDOW_PLANS[quality].activeRadius,
        1
      );
      expect(selected.points).toHaveLength(budget.instances);
      expect(selected.triangleCount).toBe(budget.instances);

      const expensiveTriangles = Math.floor(budget.triangles / 3) + 1;
      const expensive = Array.from(
        { length: 8 },
        (_, index) => syntheticCandidate(`triangle-${index}`, index, expensiveTriangles)
      );
      const triangleBounded = selectRealmDecorativeForestCandidates(
        expensive,
        [],
        quality,
        REALM_FOREST_ACTIVE_WINDOW_PLANS[quality].activeRadius,
        1
      );
      expect(triangleBounded.triangleCount).toBeLessThanOrEqual(budget.triangles);
      expect(
        triangleBounded.triangleCount + expensiveTriangles
      ).toBeGreaterThan(budget.triangles);
    }
  );

  it('keeps the fallback inside the draw-call ceiling when a prefab has too many primitives', async () => {
    const fixture = createForestFixture();
    const budget = REALM_DECORATIVE_FOREST_RENDER_BUDGETS.reduced;
    const release = vi.fn();
    const acquire = vi.fn(async (
      asset: HegemonyTreeRuntimeAsset,
      lod: HegemonyTreeLod
    ) => leaseFor(asset, lod, release, budget.drawCalls + 1));
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      acquirePrefab: acquire
    });

    expect(layer.updateView({ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT)).toBe(true);
    await vi.waitFor(() => expect(acquire).toHaveBeenCalledOnce());
    await new Promise<void>((resolve) => window.setTimeout(resolve, 0));

    expect(layer.getTelemetry()).toMatchObject({
      modelReady: false,
      usingFallback: true,
      drawCalls: 1
    });
    expect(layer.getTelemetry().drawCalls).toBeLessThanOrEqual(budget.drawCalls);
    layer.dispose();
    expect(release).toHaveBeenCalledOnce();
  });

  it('evicts camera-local ecology cells at the declared cache limit', () => {
    const fixture = createForestFixture('reduced', [], 36);
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: [],
      canonicalTrees: [],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/'
    });

    [-24, -8, 8, 24].forEach((q) => {
      expect(layer.updateView(
        axialToWorld({ q, r: 0 }, 1),
        'keep',
        FULLY_VISIBLE_VIEWPORT
      )).toBe(true);
    });

    const telemetry = layer.getTelemetry();
    expect(telemetry.cacheLimit).toBe(
      REALM_FOREST_ACTIVE_WINDOW_PLANS.reduced.cacheLimit
    );
    expect(telemetry.cacheEntries).toBe(telemetry.cacheLimit);
    expect(telemetry.cacheHighWaterMark).toBe(telemetry.cacheLimit);
    expect(telemetry.activeInstanceCount).toBe(0);
    expect(telemetry.triangleCount).toBe(0);
    expect(telemetry.drawCalls).toBe(0);
    layer.dispose();
  });

  it('preserves shared interior selections when only boundary candidates change', () => {
    const shared = Array.from(
      { length: 12 },
      (_, index) => syntheticCandidate(`shared-${index}`, index)
    );
    const leftBoundary = syntheticCandidate('left-boundary', -4);
    const rightBoundary = syntheticCandidate('right-boundary', 20);
    const plan = REALM_FOREST_ACTIVE_WINDOW_PLANS.reduced;
    const first = selectRealmDecorativeForestCandidates(
      [leftBoundary, ...shared],
      [],
      'reduced',
      plan.activeRadius,
      1
    );
    const second = selectRealmDecorativeForestCandidates(
      [rightBoundary, ...[...shared].reverse()],
      [],
      'reduced',
      plan.activeRadius,
      1
    );
    const firstInterior = first.points
      .filter((point) => point.cellKey.startsWith('shared-'))
      .map((point) => point.cellKey)
      .sort();
    const secondInterior = second.points
      .filter((point) => point.cellKey.startsWith('shared-'))
      .map((point) => point.cellKey)
      .sort();

    expect(firstInterior).toEqual(shared.map((point) => point.cellKey).sort());
    expect(secondInterior).toEqual(firstInterior);
  });
});
