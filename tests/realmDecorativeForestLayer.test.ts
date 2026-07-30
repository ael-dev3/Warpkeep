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
import {
  REALM_NORTHERN_SNOW_FIELD_REVISION,
  type RealmNorthernSnowField
} from '../src/game/map/realmNorthernSnow';

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

function constantSnowField(coverageInput: number): RealmNorthernSnowField {
  const coverage = Math.min(1, Math.max(0, coverageInput));
  const sample = Object.freeze({ climate: coverage, exposure: 0, coverage });
  return Object.freeze({
    revision: REALM_NORTHERN_SNOW_FIELD_REVISION,
    worldSeed: 1,
    hexSize: 1,
    playableRadius: 57,
    renderRadius: 60,
    sampleWorld: () => sample,
    sampleCoord: () => sample,
    coverageAtWorld: () => coverage,
    retainedCoverageAtWorld: () => coverage
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
      fallbackType: 'procedural-trunk-multi-canopy-v1',
      contactShadowCount: 0,
      groundingMode: 'terrain-canopy-procedural-root-contact',
      canopyMotionState: 'static',
      drawCalls: 1,
      overviewHidden: false
    });
    expect(layer.getTelemetry().activeInstanceCount).toBeGreaterThan(0);
    expect(layer.getTelemetry().triangleCount).toBeGreaterThan(0);
    expect(Object.values(layer.getTelemetry().structureCellCounts)
      .reduce((total, count) => total + count, 0)).toBeGreaterThan(0);
    expect(layer.getTelemetry().silhouetteCoverageRatio).toBeGreaterThan(0);
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
      fallbackType: 'none',
      contactShadowCount: 0,
      groundingMode: 'terrain-canopy',
      canopyMotionState: 'static',
      drawCalls: 2
    });
    expect(layer.getTelemetry().triangleCount).toBeGreaterThan(0);
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
    const initialPoints = activeSnapshots.at(-1)!;
    const initialCount = initialPoints.length;
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
    const initialByIdentity = new Map(initialPoints.map((point) => [
      `${point.cellKey}:${point.world.x}:${point.world.z}`,
      point
    ]));
    const retained = latestPoints.filter((point) => initialByIdentity.has(
      `${point.cellKey}:${point.world.x}:${point.world.z}`
    ));
    expect(retained.length).toBeGreaterThan(0);
    retained.forEach((point) => {
      const previous = initialByIdentity.get(
        `${point.cellKey}:${point.world.x}:${point.world.z}`
      )!;
      expect({
        speciesId: point.speciesId,
        rotation: point.rotation,
        scale: point.scale,
        habitat: point.habitat
      }).toEqual({
        speciesId: previous.speciesId,
        rotation: previous.rotation,
        scale: previous.scale,
        habitat: previous.habitat
      });
    });
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

  it('recomputes mutable exclusions only after explicit in-place invalidation', () => {
    const fixture = createForestFixture();
    const canonicalSpecies = fixture.species[0]!;
    const canonicalTree = Object.freeze({
      speciesId: canonicalSpecies.id,
      coord: Object.freeze({ q: 100, r: 0 }),
      world: Object.freeze(axialToWorld({ q: 100, r: 0 }, 1)),
      rotation: 0.47,
      scale: 1.1,
      habitat: 'grove' as const,
      estimatedTriangles: canonicalSpecies.triangles,
      footprintDiameter: canonicalSpecies.footprintDiameter!
    });
    const canonicalTransform = Object.freeze({
      coord: canonicalTree.coord,
      world: canonicalTree.world,
      rotation: canonicalTree.rotation,
      scale: canonicalTree.scale,
      speciesId: canonicalTree.speciesId,
      habitat: canonicalTree.habitat
    });
    let excludeAll = false;
    const snapshots: Array<readonly RealmForestEcologyCandidate[]> = [];
    const layer = createRealmDecorativeForestLayer({
      map: fixture.surface.renderMap,
      terrainKindsByKey: fixture.terrainKinds,
      vegetationField: fixture.field,
      playableKeys: fixture.surface.playableKeys,
      species: fixture.species,
      canonicalTrees: [canonicalTree],
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.reduced,
      baseUrl: '/',
      isWorldExcluded: () => excludeAll,
      acquirePrefab: async () => {
        throw new Error('keep deterministic fallback');
      },
      onActivePointsChange: (points) => snapshots.push(points)
    });
    const sameLayer = layer;
    const sameGroup = layer.group;
    const view = [{ x: 0, z: 0 }, 'keep', FULLY_VISIBLE_VIEWPORT] as const;
    const stableTransforms = (
      points: readonly RealmForestEcologyCandidate[]
    ) => points.map((point) => Object.freeze({
      cellKey: point.cellKey,
      speciesId: point.speciesId,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat
    })).sort((left, right) => (
      left.cellKey.localeCompare(right.cellKey)
      || left.world.x - right.world.x
      || left.world.z - right.world.z
    ));

    expect(layer.updateView(...view)).toBe(true);
    const initial = snapshots.at(-1)!;
    const initialTransforms = stableTransforms(initial);
    expect(initial.length).toBeGreaterThan(0);
    const initialCallbackCount = snapshots.length;

    excludeAll = true;
    expect(layer.updateView(...view)).toBe(false);
    expect(snapshots).toHaveLength(initialCallbackCount);
    expect(layer.getTelemetry().activeInstanceCount).toBe(initial.length);

    expect(layer.invalidateExclusions()).toBe(true);
    expect(layer.updateView(...view)).toBe(true);
    expect(snapshots.at(-1)).toEqual([]);
    expect(layer.getTelemetry().activeInstanceCount).toBe(0);
    expect(layer).toBe(sameLayer);
    expect(layer.group).toBe(sameGroup);

    excludeAll = false;
    expect(layer.updateView(...view)).toBe(false);
    expect(layer.getTelemetry().activeInstanceCount).toBe(0);
    expect(layer.invalidateExclusions()).toBe(true);
    expect(layer.updateView(...view)).toBe(true);
    const restored = snapshots.at(-1)!;
    expect(stableTransforms(restored)).toEqual(initialTransforms);
    expect({
      coord: canonicalTree.coord,
      world: canonicalTree.world,
      rotation: canonicalTree.rotation,
      scale: canonicalTree.scale,
      speciesId: canonicalTree.speciesId,
      habitat: canonicalTree.habitat
    }).toEqual(canonicalTransform);
    expect(layer.getTelemetry()).toMatchObject({
      canonicalTreeCount: 1,
      canonicalTriangleCount: canonicalSpecies.triangles
    });

    layer.dispose();
    expect(layer.invalidateExclusions()).toBe(false);
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
      fallbackType: 'procedural-trunk-multi-canopy-v1',
      contactShadowCount: 0,
      groundingMode: 'terrain-canopy-procedural-root-contact',
      drawCalls: 1,
      overviewHidden: false
    });
    expect(layer.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    )).toBeTruthy();
    expect(ready).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('winter-tints the existing decorative pack without changing transforms or ceilings', () => {
    const fixture = createForestFixture();
    const acquire = vi.fn(async () => {
      throw new Error('keep deterministic fallback');
    });
    const create = (northernSnow?: RealmNorthernSnowField) => (
      createRealmDecorativeForestLayer({
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
        northernSnow
      })
    );
    const neutral = create();
    const snowy = create(constantSnowField(1));

    expect(neutral.updateView(
      { x: 0, z: 0 },
      'keep',
      FULLY_VISIBLE_VIEWPORT
    )).toBe(true);
    expect(snowy.updateView(
      { x: 0, z: 0 },
      'keep',
      FULLY_VISIBLE_VIEWPORT
    )).toBe(true);
    const neutralFallback = neutral.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    ) as THREE.InstancedMesh;
    const snowyFallback = snowy.group.getObjectByName(
      'realm-hegemony-forest-decorative-ecology-fallback'
    ) as THREE.InstancedMesh;
    const neutralColor = new THREE.Color();
    const snowyColor = new THREE.Color();
    neutralFallback.getColorAt(0, neutralColor);
    snowyFallback.getColorAt(0, snowyColor);
    const telemetry = snowy.getTelemetry();

    expect(Array.from(snowyFallback.instanceMatrix.array))
      .toEqual(Array.from(neutralFallback.instanceMatrix.array));
    expect(snowyFallback.count).toBe(neutralFallback.count);
    expect(snowyColor.equals(neutralColor)).toBe(false);
    expect(Math.max(snowyColor.r, snowyColor.g, snowyColor.b)).toBeLessThan(0.8);
    expect(telemetry.snowTintedTreeCount).toBe(telemetry.activeInstanceCount);
    expect(telemetry.activeInstanceCount)
      .toBeLessThanOrEqual(REALM_DECORATIVE_FOREST_RENDER_BUDGETS.reduced.instances);
    expect(telemetry.triangleCount)
      .toBeLessThanOrEqual(REALM_DECORATIVE_FOREST_RENDER_BUDGETS.reduced.triangles);
    expect(telemetry.drawCalls)
      .toBeLessThanOrEqual(REALM_DECORATIVE_FOREST_RENDER_BUDGETS.reduced.drawCalls);

    neutral.dispose();
    snowy.dispose();
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
      fallbackType: 'procedural-trunk-multi-canopy-v1',
      drawCalls: 1
    });
    expect(layer.getTelemetry().drawCalls).toBeLessThanOrEqual(budget.drawCalls);
    expect(layer.getTelemetry().triangleCount).toBeLessThanOrEqual(
      budget.triangles
    );
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
