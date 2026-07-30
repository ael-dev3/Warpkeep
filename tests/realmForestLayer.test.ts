import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import { axialToWorld, hexKey } from '../src/game/map/hexCoordinates';
import {
  CANONICAL_GENESIS_FOREST_INSTANCES_V1,
  CANONICAL_GENESIS_FOREST_LAYOUT_V1
} from '../spacetimedb/src/forestLayoutPolicy';
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
import {
  createAuthoritativeRealmTerrainSurface,
  createRealmTerrainSurface
} from '../src/game/map/realmTerrainSurface';
import { terrainHeightAtWorld } from '../src/game/map/terrainHeight';
import {
  REALM_FOREST_BIOME_BUDGETS,
  type RealmForestBiomeData,
  type RealmForestTreePoint
} from '../src/game/map/realmForestBiomes';
import type { HegemonyTreePrefabLease } from '../src/components/realm/loadHegemonyTreeAssets';
import {
  createRealmNorthernSnowField,
  REALM_NORTHERN_SNOW_FIELD_REVISION,
  type RealmNorthernSnowField
} from '../src/game/map/realmNorthernSnow';
import {
  createRealmSouthernDesertField,
  REALM_SOUTHERN_DESERT_FIELD_REVISION,
  type RealmSouthernDesertField
} from '../src/game/map/realmSouthernDesert';
import { indexRealmTerrainSemantics } from '../src/game/map/realmTerrainSemantics';
import { resolveRealmSharedForestLayout } from '../src/game/map/realmSharedForestPlacements';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';

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
    canopyByTileKey: new Map(points.map((point) => [
      hexKey(point.coord),
      point.habitat === 'grove' ? 1 : point.habitat === 'forest' ? 0.68 : 0.42
    ])),
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
  onModelReady?: () => void,
  northernSnow?: RealmNorthernSnowField,
  southernDesert?: RealmSouthernDesertField
) {
  return createRealmForestLayer({
    data: biomeData(points),
    map: surface.renderMap,
    terrainPlacements: [],
    quality: REALM_QUALITY_SPECS.high,
    baseUrl: '/',
    acquirePrefab,
    onModelReady,
    northernSnow,
    southernDesert
  });
}

function constantDesertField(sandInput: number): RealmSouthernDesertField {
  const sand = Math.min(1, Math.max(0, sandInput));
  const sample = Object.freeze({ climate: sand, exposure: 0, sand });
  return Object.freeze({
    revision: REALM_SOUTHERN_DESERT_FIELD_REVISION,
    worldSeed: 1,
    hexSize: 1,
    playableRadius: 57,
    renderRadius: 60,
    sampleWorld: () => sample,
    sampleCoord: () => sample,
    sandAtWorld: () => sand,
    retainedSandAtWorld: () => sand
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

function authoredFacingLease(
  asset: HegemonyTreeRuntimeAsset
): HegemonyTreePrefabLease {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.1, 0.2, 0,
    0.1, 0.2, 0,
    0, 0.2, 0.1,
    -0.1, 0.2, 0,
    0.1, 0.2, 0,
    0, 0.2, 0.1
  ], 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute([
    0, 1, 0,
    0, 1, 0,
    0, 1, 0,
    0, -1, 0,
    0, -1, 0,
    0, -1, 0
  ], 3));
  geometry.setIndex([0, 1, 2, 3, 5, 4]);
  const material = new THREE.MeshStandardMaterial({ color: '#315f3e' });
  return Object.freeze({
    prefab: Object.freeze({
      assetId: asset.id,
      lod: 'high',
      assetUrl: '/models/facing-tree.glb',
      visualHeight: 0.62,
      footprintDiameter: hegemonyTreeModel(asset, 'high').normalizedFootprintDiameter,
      primitives: Object.freeze([Object.freeze({
        geometry,
        material,
        localMatrixElements: Object.freeze([...new THREE.Matrix4().elements])
      })])
    }),
    release: () => {
      geometry.dispose();
      material.dispose();
    }
  });
}

function attributeBytes(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute) {
  if (attribute instanceof THREE.InterleavedBufferAttribute) {
    return Array.from(new Uint8Array(
      attribute.data.array.buffer,
      attribute.data.array.byteOffset,
      attribute.data.array.byteLength
    ));
  }
  return Array.from(new Uint8Array(
    attribute.array.buffer,
    attribute.array.byteOffset,
    attribute.array.byteLength
  ));
}

function canonicalSharedForestFixture() {
  const snapshot = createCanonicalGenesisSnapshot();
  const canonicalSurface = createAuthoritativeRealmTerrainSurface(
    snapshot.realm.numericSeed,
    snapshot.tiles,
    snapshot.realm.authoritativeRadius,
    snapshot.realm.renderRadius
  );
  const semantics = indexRealmTerrainSemantics(
    canonicalSurface,
    snapshot.tileMetadata
  );
  const passability = new Map(snapshot.tileMetadata.map((row) => (
    [row.tileKey, row.passable] as const
  )));
  const species = HEGEMONY_TREE_RUNTIME_ASSETS.map((asset) => {
    const model = hegemonyTreeModel(asset, 'high');
    return Object.freeze({
      id: asset.id,
      triangles: model.triangles,
      footprintDiameter: model.normalizedFootprintDiameter,
      biomes: asset.biomes
    });
  });
  const resolved = resolveRealmSharedForestLayout({
    layout: CANONICAL_GENESIS_FOREST_LAYOUT_V1,
    rows: CANONICAL_GENESIS_FOREST_INSTANCES_V1,
    realmId: snapshot.realm.realmId,
    renderMap: canonicalSurface.renderMap,
    terrainKindsByKey: semantics.terrainKindsByKey,
    species,
    isCoordPassable: (coord) => passability.get(hexKey(coord)) === true
  });
  if (resolved.source !== 'shared') {
    throw new Error('canonical shared forest fixture did not resolve');
  }
  return Object.freeze({
    data: resolved.shared.data,
    map: canonicalSurface.renderMap
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
      expect(layer.getPresentationTelemetry()).toMatchObject({
        instanceCount: 1,
        drawCalls: 1,
        usingFallback: true,
        fallbackType: 'procedural-trunk-multi-canopy-v1',
        contactShadowCount: 0,
        groundingMode: 'terrain-canopy-procedural-root-contact',
        canopyMotionState: 'static',
        structureCellCounts: {
          core: 1,
          body: 0,
          fringe: 0,
          clearing: 0
        }
      });
      expect(layer.getPresentationTelemetry().canonicalTriangleCount)
        .toBe(pointForAsset(asset).estimatedTriangles);
      expect(layer.getPresentationTelemetry().triangleCount).toBeGreaterThan(0);
      expect(layer.getPresentationTelemetry().silhouetteCoverageRatio)
        .toBeGreaterThan(0);
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
    expect(layer.getPresentationTelemetry()).toMatchObject({
      instanceCount: assets.length,
      drawCalls: 1,
      usingFallback: false,
      fallbackType: 'none',
      contactShadowCount: 0,
      groundingMode: 'terrain-canopy-baked-base',
      canopyMotionState: 'static',
      triangleCount: assets.length * 12
    });
    expect(layer.group.getObjectByName('realm-hegemony-tree-static-fallback')).toBeUndefined();
    expect(layer.group.getObjectByName('realm-hegemony-tree-static-batch')).toBeTruthy();
    expect(onModelReady).toHaveBeenCalledOnce();
    layer.dispose();
  });

  it('dusts only top-facing authored vertices without changing their static topology', async () => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
    const point = pointForAsset(asset);
    const acquireNeutral = vi.fn<RealmForestPrefabAcquirer>(async () => (
      authoredFacingLease(asset)
    ));
    const acquireSnow = vi.fn<RealmForestPrefabAcquirer>(async () => (
      authoredFacingLease(asset)
    ));
    const neutral = createLayer([point], acquireNeutral);
    const snowy = createLayer(
      [point],
      acquireSnow,
      undefined,
      constantSnowField(1)
    );

    await vi.waitFor(() => {
      expect(neutral.getPresentationTelemetry().usingFallback).toBe(false);
      expect(snowy.getPresentationTelemetry().usingFallback).toBe(false);
    });
    const neutralMesh = neutral.group.getObjectByName(
      'realm-hegemony-tree-static-batch'
    ) as THREE.Mesh;
    const snowyMesh = snowy.group.getObjectByName(
      'realm-hegemony-tree-static-batch'
    ) as THREE.Mesh;
    const neutralGeometry = neutralMesh.geometry;
    const snowyGeometry = snowyMesh.geometry;
    const neutralColors = neutralGeometry.getAttribute('color');
    const snowyColors = snowyGeometry.getAttribute('color');
    const averageRgb = (start: number) => {
      let total = 0;
      for (let index = start; index < start + 3; index += 1) {
        total += snowyColors.getX(index)
          + snowyColors.getY(index)
          + snowyColors.getZ(index);
      }
      return total / 9;
    };

    expect(Array.from(snowyGeometry.getAttribute('position').array))
      .toEqual(Array.from(neutralGeometry.getAttribute('position').array));
    expect(Array.from(snowyGeometry.getAttribute('normal').array))
      .toEqual(Array.from(neutralGeometry.getAttribute('normal').array));
    expect(Array.from(snowyGeometry.getIndex()!.array))
      .toEqual(Array.from(neutralGeometry.getIndex()!.array));
    expect(averageRgb(0)).toBeGreaterThan(averageRgb(3));
    for (let index = 3; index < 6; index += 1) {
      expect(snowyColors.getX(index)).toBeCloseTo(neutralColors.getX(index), 7);
      expect(snowyColors.getY(index)).toBeCloseTo(neutralColors.getY(index), 7);
      expect(snowyColors.getZ(index)).toBeCloseTo(neutralColors.getZ(index), 7);
    }
    expect(snowy.getPresentationTelemetry()).toMatchObject({
      instanceCount: 1,
      drawCalls: 1,
      canonicalTriangleCount: point.estimatedTriangles,
      triangleCount: 2,
      snowTintedTreeCount: 1
    });
    expect(neutral.getPresentationTelemetry()).toMatchObject({
      instanceCount: 1,
      drawCalls: 1,
      canonicalTriangleCount: point.estimatedTriangles,
      triangleCount: 2,
      snowTintedTreeCount: 0
    });

    neutral.dispose();
    snowy.dispose();
  });

  it('keeps northern and central authored bytes exact while warming only southern trees', async () => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
    const pointAt = (coord: Readonly<{ q: number; r: number }>) => Object.freeze({
      ...pointForAsset(asset),
      coord: Object.freeze({ ...coord }),
      world: Object.freeze(axialToWorld(coord, 1))
    });
    const northPoint = pointAt({ q: 0, r: -46 });
    const centerPoint = pointAt({ q: 0, r: 0 });
    const southPoint = pointAt({ q: 0, r: 46 });
    const climateOptions = {
      worldSeed: 91_337,
      hexSize: 1,
      playableRadius: 57,
      renderRadius: 60
    };
    const northernSnow = createRealmNorthernSnowField(climateOptions);
    const southernDesert = createRealmSouthernDesertField(climateOptions);
    const createAuthored = (
      point: RealmForestTreePoint,
      snow?: RealmNorthernSnowField,
      desert?: RealmSouthernDesertField
    ) => createLayer(
      [point],
      async () => authoredFacingLease(asset),
      undefined,
      snow,
      desert
    );
    const northBaseline = createAuthored(northPoint, northernSnow);
    const northWithSouth = createAuthored(
      northPoint,
      northernSnow,
      southernDesert
    );
    const centerBaseline = createAuthored(centerPoint);
    const centerWithSouth = createAuthored(
      centerPoint,
      undefined,
      southernDesert
    );
    const southBaseline = createAuthored(southPoint);
    const southWithDesert = createAuthored(
      southPoint,
      undefined,
      southernDesert
    );
    const layers = [
      northBaseline,
      northWithSouth,
      centerBaseline,
      centerWithSouth,
      southBaseline,
      southWithDesert
    ];

    await vi.waitFor(() => {
      expect(layers.every((layer) => (
        layer.getPresentationTelemetry().usingFallback === false
      ))).toBe(true);
    });
    const geometryFor = (layer: (typeof layers)[number]) => (
      layer.group.getObjectByName('realm-hegemony-tree-static-batch') as THREE.Mesh
    ).geometry;
    const northBaselineGeometry = geometryFor(northBaseline);
    const northWithSouthGeometry = geometryFor(northWithSouth);
    const centerBaselineGeometry = geometryFor(centerBaseline);
    const centerWithSouthGeometry = geometryFor(centerWithSouth);
    const southBaselineGeometry = geometryFor(southBaseline);
    const southWithDesertGeometry = geometryFor(southWithDesert);

    expect(southernDesert.sandAtWorld(northPoint.world)).toBe(0);
    expect(southernDesert.sandAtWorld(centerPoint.world)).toBe(0);
    expect(southernDesert.sandAtWorld(southPoint.world)).toBeGreaterThan(0.75);
    expect(attributeBytes(northWithSouthGeometry.getAttribute('color')))
      .toEqual(attributeBytes(northBaselineGeometry.getAttribute('color')));
    expect(attributeBytes(centerWithSouthGeometry.getAttribute('color')))
      .toEqual(attributeBytes(centerBaselineGeometry.getAttribute('color')));
    expect(attributeBytes(southWithDesertGeometry.getAttribute('color')))
      .not.toEqual(attributeBytes(southBaselineGeometry.getAttribute('color')));
    expect(attributeBytes(southWithDesertGeometry.getAttribute('position')))
      .toEqual(attributeBytes(southBaselineGeometry.getAttribute('position')));
    expect(Array.from(southWithDesertGeometry.getIndex()!.array))
      .toEqual(Array.from(southBaselineGeometry.getIndex()!.array));
    expect(northWithSouth.getPresentationTelemetry()).toMatchObject({
      instanceCount: 1,
      drawCalls: 1,
      triangleCount: 2,
      snowTintedTreeCount: 1,
      dryTintedTreeCount: 0
    });
    expect(centerWithSouth.getPresentationTelemetry()).toMatchObject({
      instanceCount: 1,
      drawCalls: 1,
      triangleCount: 2,
      snowTintedTreeCount: 0,
      dryTintedTreeCount: 0
    });
    expect(southWithDesert.getPresentationTelemetry()).toMatchObject({
      instanceCount: 1,
      drawCalls: 1,
      triangleCount: 2,
      snowTintedTreeCount: 0,
      dryTintedTreeCount: 1
    });

    layers.forEach((layer) => layer.dispose());
  });

  it('preserves all 210 shared records, transforms, and budgets under climate tint', () => {
    const fixture = canonicalSharedForestFixture();
    const recordsBefore = fixture.data.points.map((point) => Object.freeze({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat,
      estimatedTriangles: point.estimatedTriangles
    }));
    const keepFallback = vi.fn<RealmForestPrefabAcquirer>(async () => {
      throw new Error('keep deterministic fallback');
    });
    const neutral = createRealmForestLayer({
      data: fixture.data,
      map: fixture.map,
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.high,
      baseUrl: '/',
      acquirePrefab: keepFallback
    });
    const snowy = createRealmForestLayer({
      data: fixture.data,
      map: fixture.map,
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.high,
      baseUrl: '/',
      acquirePrefab: keepFallback,
      northernSnow: constantSnowField(1)
    });
    const dry = createRealmForestLayer({
      data: fixture.data,
      map: fixture.map,
      terrainPlacements: [],
      quality: REALM_QUALITY_SPECS.high,
      baseUrl: '/',
      acquirePrefab: keepFallback,
      southernDesert: constantDesertField(1)
    });
    const neutralFallback = neutral.group.getObjectByName(
      'realm-hegemony-tree-static-fallback'
    ) as THREE.InstancedMesh;
    const snowyFallback = snowy.group.getObjectByName(
      'realm-hegemony-tree-static-fallback'
    ) as THREE.InstancedMesh;
    const dryFallback = dry.group.getObjectByName(
      'realm-hegemony-tree-static-fallback'
    ) as THREE.InstancedMesh;
    const neutralColor = new THREE.Color();
    const snowyColor = new THREE.Color();
    neutralFallback.getColorAt(0, neutralColor);
    snowyFallback.getColorAt(0, snowyColor);
    const neutralTelemetry = neutral.getPresentationTelemetry();
    const snowyTelemetry = snowy.getPresentationTelemetry();
    const dryTelemetry = dry.getPresentationTelemetry();

    expect(fixture.data.points).toHaveLength(210);
    expect(Array.from(snowyFallback.instanceMatrix.array))
      .toEqual(Array.from(neutralFallback.instanceMatrix.array));
    expect(Array.from(dryFallback.instanceMatrix.array))
      .toEqual(Array.from(neutralFallback.instanceMatrix.array));
    expect(snowyFallback.count).toBe(210);
    expect(neutralFallback.count).toBe(210);
    expect(dryFallback.count).toBe(210);
    expect(snowyColor.equals(neutralColor)).toBe(false);
    expect(Math.max(snowyColor.r, snowyColor.g, snowyColor.b)).toBeLessThan(0.8);
    expect(snowyTelemetry).toMatchObject({
      instanceCount: 210,
      drawCalls: 1,
      canonicalTriangleCount: neutralTelemetry.canonicalTriangleCount,
      triangleCount: neutralTelemetry.triangleCount,
      snowTintedTreeCount: 210
    });
    expect(snowyTelemetry.canonicalTriangleCount)
      .toBeLessThanOrEqual(REALM_FOREST_BIOME_BUDGETS.high.triangles);
    expect(dryTelemetry).toMatchObject({
      instanceCount: 210,
      drawCalls: 1,
      canonicalTriangleCount: neutralTelemetry.canonicalTriangleCount,
      triangleCount: neutralTelemetry.triangleCount,
      snowTintedTreeCount: 0,
      dryTintedTreeCount: 210
    });
    expect(neutralTelemetry.snowTintedTreeCount).toBe(0);
    expect(fixture.data.points.map((point) => ({
      speciesId: point.speciesId,
      coord: point.coord,
      world: point.world,
      rotation: point.rotation,
      scale: point.scale,
      habitat: point.habitat,
      estimatedTriangles: point.estimatedTriangles
    }))).toEqual(recordsBefore);

    neutral.dispose();
    snowy.dispose();
    dry.dispose();
  }, 15_000);

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

  it('preserves an authoritative point transform in the richer fallback', () => {
    const asset = HEGEMONY_TREE_RUNTIME_ASSETS[0]!;
    const point = Object.freeze({
      ...pointForAsset(asset),
      world: Object.freeze({ x: 0.27, z: -0.19 }),
      rotation: 0.73,
      scale: 1.1
    });
    const acquirePrefab = vi.fn<RealmForestPrefabAcquirer>(async () => {
      throw new Error('keep fallback');
    });
    const layer = createLayer([point], acquirePrefab);
    const fallback = layer.group.getObjectByName(
      'realm-hegemony-tree-static-fallback'
    ) as THREE.InstancedMesh;
    const matrix = new THREE.Matrix4();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    fallback.getMatrixAt(0, matrix);
    matrix.decompose(position, rotation, scale);
    const expectedRotation = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      point.rotation
    );

    expect(position.x).toBeCloseTo(point.world.x, 6);
    expect(position.z).toBeCloseTo(point.world.z, 6);
    expect(position.y).toBeCloseTo(
      terrainHeightAtWorld(surface.renderMap, point.world, 1, []) + 0.002,
      6
    );
    expect(scale.x).toBeCloseTo(point.scale, 6);
    expect(scale.y).toBeCloseTo(point.scale, 6);
    expect(scale.z).toBeCloseTo(point.scale, 6);
    expect(Math.abs(rotation.dot(expectedRotation))).toBeCloseTo(1, 6);
    expect(fallback.raycast).not.toBe(THREE.InstancedMesh.prototype.raycast);
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
