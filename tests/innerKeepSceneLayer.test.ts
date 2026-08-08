import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';

import {
  createInnerKeepSceneLayer,
  type CreateInnerKeepSceneLayerOptions
} from '../src/components/inner-keep/createInnerKeepSceneLayer';
import {
  INNER_KEEP_PRESENTATION_ASSETS,
  INNER_KEEP_PRESENTATION_CAMERA_PRESETS,
  INNER_KEEP_PRESENTATION_PLACEMENTS
} from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import {
  INNER_KEEP_WATER_CENTERLINE,
  INNER_KEEP_WATER_POND
} from '../src/components/inner-keep/createInnerKeepEcology';
import { allInnerKeepStaticRuntimeAssetIds } from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import type {
  InnerKeepRuntimeAssetBundle,
  InnerKeepRuntimePrefab
} from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import type { InnerKeepBuildingPresentation } from '../src/components/inner-keep/innerKeepPresentation';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createLayer(
  reducedMotion = false,
  width = 1280,
  height = 720,
  assetLoading: 'auto' | 'disabled' = 'disabled',
  runtimeAssetLoader?: CreateInnerKeepSceneLayerOptions['runtimeAssetLoader']
) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const canvas = document.createElement('canvas');
  Object.defineProperties(canvas, {
    clientWidth: { configurable: true, value: width },
    clientHeight: { configurable: true, value: height }
  });
  canvas.getBoundingClientRect = () => ({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: width,
    bottom: height,
    width,
    height,
    toJSON: () => ({})
  });
  document.body.append(canvas);
  const requestRender = vi.fn();
  return {
    canvas,
    layer: createInnerKeepSceneLayer({
      canvas,
      quality: 'balanced',
      reducedMotion,
      requestRender,
      assetLoading,
      outerWorldAssetLoading: 'disabled',
      ...(runtimeAssetLoader ? { runtimeAssetLoader } : {})
    }),
    requestRender
  };
}

function fakeRuntimePrefab(id: string): InnerKeepRuntimePrefab {
  const root = new THREE.Group();
  root.add(new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial()
  ));
  return Object.freeze({
    id,
    root,
    clips: Object.freeze([]),
    boundsMeters: Object.freeze([1, 1, 1] as const),
    triangles: 12,
    drawCalls: 1,
    animated: false,
    mounted: false,
    clone: () => root.clone(true)
  });
}

function fakeRuntimeBundle(
  completeStaticCoverage: boolean,
  failures: InnerKeepRuntimeAssetBundle['failures'] = Object.freeze([])
): InnerKeepRuntimeAssetBundle {
  const ids = allInnerKeepStaticRuntimeAssetIds();
  const selectedIds = completeStaticCoverage ? ids : ids.slice(0, -1);
  return fakeRuntimeBundleWithIds(selectedIds, [], failures);
}

function fakeRuntimeBundleWithIds(
  staticIds: readonly string[],
  populationIds: readonly string[],
  failures: InnerKeepRuntimeAssetBundle['failures'] = Object.freeze([])
): InnerKeepRuntimeAssetBundle {
  return Object.freeze({
    staticPrefabs: new Map(staticIds.map((id) => [id, fakeRuntimePrefab(id)])),
    populationPrefabs: new Map(populationIds.map((id) => [id, fakeRuntimePrefab(id)])),
    failures,
    dispose: vi.fn()
  });
}

describe('procedural Inner Keep scene layer', () => {
  it('pins all twelve pads to the canonical v15 layout without another canvas or RAF', () => {
    const requestAnimationFrame = vi.spyOn(window, 'requestAnimationFrame');
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });

    const pads: THREE.Object3D[] = [];
    layer.scene.traverse((object) => {
      if (object.name.startsWith('inner-keep-slot-pad:')) pads.push(object);
    });
    const first = pads.find((pad) => (
      pad.name === 'inner-keep-slot-pad:inner-keep-slot-m01'
    ));
    expect(layer.getTelemetry()).toMatchObject({
      status: 'ready',
      slotCount: 12,
      exteriorTreeCount: 44,
      scenicResourceNodeCount: 6,
      wildlifeCount: 7,
      proceduralWildlifeCount: 7,
      exactWildlifeCount: 0,
      tradeWagonCount: 1
    });
    expect(pads).toHaveLength(12);
    expect(first?.position.x).toBe(-9);
    expect(first?.position.z).toBe(-3.4);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
    layer.dispose();
  });

  it('releases every instance buffer once during complete layer teardown', () => {
    const { layer } = createLayer();
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });
    const instances: THREE.InstancedMesh[] = [];
    layer.scene.traverse((object) => {
      if (object instanceof THREE.InstancedMesh) instances.push(object);
    });
    const disposals = instances.map((instance) => vi.spyOn(instance, 'dispose'));

    expect(instances.length).toBeGreaterThan(0);
    layer.dispose();
    layer.dispose();
    disposals.forEach((dispose) => expect(dispose).toHaveBeenCalledTimes(1));
  });

  it('aligns the procedural fallback to the expanded canonical authored anchors', () => {
    const { layer } = createLayer();
    const authoredByPlacementId = new Map(INNER_KEEP_PRESENTATION_PLACEMENTS.flatMap(
      (placement) => placement.instances.map((instance) => (
        [instance.placementId, instance] as const
      )),
    ));
    const fallbackToAuthored = [
      ['inner-keep-procedural-cathedral-fallback', 'grand-covenant-cathedral-main-building'],
      ['inner-keep-procedural-barracks-fallback', 'shieldcourt-barracks-west-garrison'],
      ['inner-keep-procedural-south-gate-frame', 'south-gate-frame'],
      ['inner-keep-procedural-gate-standard-west', 'gate-standard-west'],
      ['inner-keep-procedural-gate-standard-east', 'gate-standard-east'],
      ['inner-keep-procedural-builder-noticeboard', 'builder-noticeboard'],
      ['inner-keep-procedural-civic-direction-sign', 'civic-direction-sign'],
      ['inner-keep-procedural-south-east-water-trough', 'south-east-water-trough'],
      ['inner-keep-procedural-hedge-west-north', 'hedge-west-north'],
      ['inner-keep-procedural-hedge-east-north', 'hedge-east-north'],
      ['inner-keep-procedural-hedge-west-south', 'hedge-west-south'],
      ['inner-keep-procedural-hedge-east-south', 'hedge-east-south'],
      ['inner-keep-procedural-north-collapsed-arch', 'north-collapsed-arch'],
    ] as const;
    for (const [fallbackName, placementId] of fallbackToAuthored) {
      const fallback = layer.scene.getObjectByName(fallbackName);
      const authored = authoredByPlacementId.get(placementId)!;
      expect(fallback, fallbackName).toBeDefined();
      expect(fallback?.position.x, fallbackName).toBe(authored.positionMeters[0]);
      expect(fallback?.position.z, fallbackName).toBe(authored.positionMeters[2]);
    }
    layer.dispose();
  });

  it('grounds a non-authoritative earth apron and district streets around the larger city', () => {
    const { layer } = createLayer();
    const apron = layer.scene.getObjectByName('inner-keep-city-edge-earth-apron');
    const streets = layer.scene.getObjectByName(
      'inner-keep-city-district-road-network'
    );
    for (const presentationOnly of [apron, streets]) {
      expect(presentationOnly).toBeInstanceOf(THREE.Mesh);
      expect(presentationOnly?.userData).toMatchObject({
        presentationOnly: true,
        gameplayAuthorityClaimed: false
      });
      const geometry = (presentationOnly as THREE.Mesh).geometry;
      expect(geometry.getAttribute('position').count).toBeGreaterThan(0);
      expect(geometry.index?.count).toBeGreaterThan(0);
    }
    layer.dispose();
  });

  it('keeps diagnostic slot projection and exact picking aligned after pan and zoom', () => {
    const { layer } = createLayer();
    layer.setViewport(1280, 720);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'meadow'
    });

    const initial = layer.getSlotProjectionFrame();
    const initialWest = initial.slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(initial.slots).toHaveLength(12);
    expect(initialWest).toMatchObject({ visible: true });
    expect(initialWest?.width).toBeGreaterThan(0);
    expect(initialWest?.height).toBeGreaterThan(0);
    expect(layer.pickSlot(initialWest!.x, initialWest!.y)).toBe(
      'inner-keep-slot-m01'
    );

    layer.panByPixels(140, -70);
    const pannedWest = layer.getSlotProjectionFrame().slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(pannedWest?.x).not.toBeCloseTo(initialWest!.x, 3);
    expect(pannedWest?.y).not.toBeCloseTo(initialWest!.y, 3);
    expect(layer.pickSlot(pannedWest!.x, pannedWest!.y)).toBe(
      'inner-keep-slot-m01'
    );

    layer.zoomByWheel(-240, WheelEvent.DOM_DELTA_PIXEL);
    const zoomedWest = layer.getSlotProjectionFrame().slots.find(({ slotId }) => (
      slotId === 'inner-keep-slot-m01'
    ));
    expect(zoomedWest?.width).toBeGreaterThan(pannedWest!.width);
    expect(zoomedWest?.height).toBeGreaterThan(pannedWest!.height);
    expect(layer.pickSlot(zoomedWest!.x, zoomedWest!.y)).toBe(
      'inner-keep-slot-m01'
    );
    layer.dispose();
  });

  it('fits every authored footprint in portrait without overwriting later user input', () => {
    const { layer } = createLayer(false, 390, 844);
    layer.setViewport(390, 844);
    const portraitAspect = 390 / 844;
    const portraitZoom = INNER_KEEP_PRESENTATION_CAMERA_PRESETS.zoom.minimum;
    expect(layer.camera.right).toBeCloseTo(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / portraitZoom,
      6
    );
    expect(layer.camera.top).toBeCloseTo(
      (
        INNER_KEEP_PRESENTATION_CAMERA_PRESETS.minimumHalfWidth / portraitZoom
      ) / portraitAspect,
      6
    );
    expect(layer.camera.position).toMatchObject({ x: 0, y: 31, z: 34 });

    const assetById = new Map(INNER_KEEP_PRESENTATION_ASSETS.map((asset) => (
      [asset.assetId, asset] as const
    )));
    for (const placement of INNER_KEEP_PRESENTATION_PLACEMENTS) {
      if (placement.anchor !== 'fixed') continue;
      const asset = assetById.get(placement.assetId)!;
      for (const instance of placement.instances) {
        const radians = instance.rotationMilliDegrees[1] / 1_000 * Math.PI / 180;
        const cosine = Math.abs(Math.cos(radians));
        const sine = Math.abs(Math.sin(radians));
        const unrotatedHalfX = asset.boundsMeters[0]
          * instance.scalePermille[0] / 2_000;
        const unrotatedHalfZ = asset.boundsMeters[2]
          * instance.scalePermille[2] / 2_000;
        const halfX = cosine * unrotatedHalfX + sine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;
        const halfZ = sine * unrotatedHalfX + cosine * unrotatedHalfZ
          + placement.footprint.clearanceMarginMeters;
        const height = asset.boundsMeters[1] * instance.scalePermille[1] / 1_000;
        for (const x of [
          instance.positionMeters[0] - halfX,
          instance.positionMeters[0] + halfX
        ]) for (const z of [
          instance.positionMeters[2] - halfZ,
          instance.positionMeters[2] + halfZ
        ]) for (const y of [0, height]) {
          const projected = new THREE.Vector3(x, y, z).project(layer.camera);
          expect(Math.abs(projected.x), instance.placementId).toBeLessThanOrEqual(1);
          expect(Math.abs(projected.y), instance.placementId).toBeLessThanOrEqual(1);
        }
      }
    }
    for (const waterPoint of [
      ...INNER_KEEP_WATER_CENTERLINE,
      INNER_KEEP_WATER_POND.center
    ]) {
      const projected = new THREE.Vector3(
        waterPoint.x,
        waterPoint.y,
        waterPoint.z
      ).project(layer.camera);
      expect(Math.abs(projected.x)).toBeLessThanOrEqual(1);
      expect(Math.abs(projected.y)).toBeLessThanOrEqual(1);
    }

    layer.zoomByWheel(600, WheelEvent.DOM_DELTA_PIXEL);
    layer.panByPixels(90, -45);
    const manuallyAdjustedPosition = layer.camera.position.clone();
    layer.setViewport(1280, 720);

    expect(layer.camera.top).toBeGreaterThan(
      INNER_KEEP_PRESENTATION_CAMERA_PRESETS.landscape.baseHalfHeight
    );
    expect(layer.camera.position.x).toBeCloseTo(manuallyAdjustedPosition.x, 6);
    expect(layer.camera.position.z).toBeCloseTo(manuallyAdjustedPosition.z, 6);
    layer.dispose();
  });

  it('raycasts exact pads through compact AABB overlaps and rejects blank AABB corners', () => {
    const { layer } = createLayer(false, 320, 800);
    layer.setViewport(320, 800);
    layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'meadow'
    });
    const projections = layer.getSlotProjectionFrame().slots;
    const legacyTouchBoxes = projections.map((projection) => ({
      ...projection,
      left: projection.x - Math.max(44, projection.width) * 0.5,
      right: projection.x + Math.max(44, projection.width) * 0.5,
      top: projection.y - Math.max(44, projection.height) * 0.5,
      bottom: projection.y + Math.max(44, projection.height) * 0.5
    }));
    const overlap = legacyTouchBoxes.flatMap((left, leftIndex) => (
      legacyTouchBoxes.slice(leftIndex + 1).flatMap((right) => {
        const overlapLeft = Math.max(left.left, right.left);
        const overlapRight = Math.min(left.right, right.right);
        const overlapTop = Math.max(left.top, right.top);
        const overlapBottom = Math.min(left.bottom, right.bottom);
        return overlapRight > overlapLeft && overlapBottom > overlapTop
          ? [{
              x: (overlapLeft + overlapRight) * 0.5,
              y: (overlapTop + overlapBottom) * 0.5
            }]
          : [];
      })
    ))[0];
    expect(overlap).toBeDefined();
    const overlapCandidates = legacyTouchBoxes.filter((box) => (
      overlap!.x >= box.left
      && overlap!.x <= box.right
      && overlap!.y >= box.top
      && overlap!.y <= box.bottom
    ));
    expect(overlapCandidates.length).toBeGreaterThan(1);
    const exactOverlapHit = layer.pickSlot(overlap!.x, overlap!.y);
    expect(
      exactOverlapHit === null
      || overlapCandidates.some(({ slotId }) => slotId === exactOverlapHit)
    ).toBe(true);

    const blankGap = projections.flatMap((projection) => {
      const inset = 0.5;
      return [
        { x: projection.x - projection.width * 0.5 + inset,
          y: projection.y - projection.height * 0.5 + inset },
        { x: projection.x + projection.width * 0.5 - inset,
          y: projection.y - projection.height * 0.5 + inset },
        { x: projection.x - projection.width * 0.5 + inset,
          y: projection.y + projection.height * 0.5 - inset },
        { x: projection.x + projection.width * 0.5 - inset,
          y: projection.y + projection.height * 0.5 - inset }
      ];
    }).find((point) => layer.pickSlot(point.x, point.y) === null);
    expect(blankGap).toBeDefined();
    expect(layer.pickSlot(blankGap!.x, blankGap!.y)).toBeNull();
    layer.dispose();
  });

  it('shows only worksite geometry while constructing, then performs a bounded reveal', () => {
    const { layer } = createLayer();
    const constructing: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 0,
      targetLevel: 1,
      phase: 'constructing',
      startedAtMicros: 1n,
      completesAtMicros: 10n,
      revision: 1n
    });
    layer.update(0);
    layer.reconcile(createInnerKeepPresentation({
      buildings: [constructing],
      builder: {
        state: 'busy',
        slotId: constructing.slotId,
        buildingKind: constructing.buildingKind,
        targetLevel: constructing.targetLevel,
        completesAtMicros: constructing.completesAtMicros!
      }
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();

    layer.reconcile(createInnerKeepPresentation({
      projectRevision: 2n,
      buildings: [{
        ...constructing,
        completedLevel: 1,
        phase: 'complete',
        revision: 2n
      }]
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.getTelemetry()).toMatchObject({
      completionRevealActive: true,
      constructionSiteCount: 0
    });
    expect(layer.getTelemetry().smokeSpriteCount).toBeGreaterThan(0);
    const smoke = layer.scene.getObjectByName(
      'inner-keep-construction-smoke'
    ) as THREE.InstancedMesh;
    const initialSmokeOpacity = (smoke.material as THREE.Material).opacity;
    expect(layer.isAnimationActive()).toBe(true);
    layer.update(0.55);
    expect((smoke.material as THREE.Material).opacity).toBeLessThan(
      initialSmokeOpacity
    );
    layer.update(1.2);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold'))
      .toBeUndefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeDefined();
    expect(layer.getTelemetry()).toMatchObject({
      completionRevealActive: false,
      smokeSpriteCount: 0
    });
    layer.dispose();
  });

  it('keeps a completed building under scaffold until its exact prefab settles', () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}));
    const { layer } = createLayer(false, 1280, 720, 'auto');
    layer.reconcile(createInnerKeepPresentation({
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
    }), { owningTerrainKind: 'meadow' });

    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeDefined();
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'loading',
      completedBuildingCount: 0,
      constructionSiteCount: 1
    });
    layer.dispose();
  });

  it('reveals the exact completed building when the atomic static bundle arrives', async () => {
    let settleBundle: ((bundle: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const runtimeAssetLoader = vi.fn(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
      settleBundle = resolve;
    }));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    const completeBuilding: InnerKeepBuildingPresentation = Object.freeze({
      slotId: 'inner-keep-slot-m01',
      buildingKind: 'city-mill',
      completedLevel: 1,
      targetLevel: 1,
      phase: 'complete',
      startedAtMicros: 1n,
      completesAtMicros: 10n,
      revision: 1n
    });
    layer.reconcile(createInnerKeepPresentation({
      buildings: [completeBuilding]
    }), { owningTerrainKind: 'meadow' });
    expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
      .toBeUndefined();

    settleBundle!(fakeRuntimeBundle(true));
    await vi.waitFor(() => {
      expect(layer.scene.getObjectByName('inner-keep-completed-building:city-mill'))
        .toBeDefined();
    });
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed?.userData.innerKeepAuthoredAsset).toBe(true);
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'ready',
      authoredAssetCount: 38,
      completedBuildingCount: 1,
      completionRevealActive: true
    });
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);
    layer.dispose();
  });

  it('retries one degraded same-key bundle, then stays on procedural fallback', async () => {
    const failure = Object.freeze({
      kind: 'static' as const,
      id: 'breached-keep-wall',
      reason: 'transient fixture failure'
    });
    const first = fakeRuntimeBundle(false, Object.freeze([failure]));
    const second = fakeRuntimeBundle(false, Object.freeze([failure]));
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    await Promise.resolve();
    expect(runtimeAssetLoader).toHaveBeenCalledTimes(2);
    expect(layer.getTelemetry()).toMatchObject({
      authoredAssetCount: 0,
      authoredPlacementCount: 0,
      runtimeAssetFailureCount: 1
    });
    expect(layer.scene.userData.innerKeepAssetLoadAttemptCount).toBe(2);
    expect(layer.scene.getObjectByName('inner-keep-authored-static-root')?.children)
      .toHaveLength(0);
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(true);
    expect(first.dispose).toHaveBeenCalledTimes(1);
    layer.dispose();
  });

  it('keeps a settled atomic static scene visible during its bounded retry', async () => {
    const first = fakeRuntimeBundle(true, Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'basilica-warden',
      reason: 'transient fixture failure'
    })]));
    let settleRetry: ((bundle: InnerKeepRuntimeAssetBundle) => void) | undefined;
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockImplementationOnce(() => new Promise<InnerKeepRuntimeAssetBundle>((resolve) => {
        settleRetry = resolve;
      }));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'loading',
      authoredAssetCount: 38,
      authoredPlacementCount: 76
    });
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);

    const retiredInstances: THREE.InstancedMesh[] = [];
    layer.scene.getObjectByName('inner-keep-authored-static-presentation')
      ?.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) retiredInstances.push(object);
      });
    const retiredInstanceDisposals = retiredInstances.map((instance) => (
      vi.spyOn(instance, 'dispose')
    ));
    expect(retiredInstances.length).toBeGreaterThan(0);

    settleRetry!(fakeRuntimeBundle(true));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('ready'));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    retiredInstanceDisposals.forEach((dispose) => (
      expect(dispose).toHaveBeenCalledTimes(1)
    ));
    layer.dispose();
  });

  it('disposes a worse retry without replacing stronger settled coverage', async () => {
    const first = fakeRuntimeBundle(true, Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'basilica-warden',
      reason: 'transient fixture failure'
    })]));
    const second = fakeRuntimeBundle(false);
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(second.dispose).toHaveBeenCalledTimes(1);
    expect(layer.getTelemetry()).toMatchObject({
      authoredAssetCount: 38,
      authoredPlacementCount: 76,
      runtimeAssetFailureCount: 1
    });
    expect(layer.scene.getObjectByName('inner-keep-procedural-asset-fallback')?.visible)
      .toBe(false);
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains equal-cardinality coverage when a retry swaps an exact static ID', async () => {
    const failure = Object.freeze([Object.freeze({
      kind: 'population' as const,
      id: 'transient-actor',
      reason: 'transient fixture failure'
    })]);
    const first = fakeRuntimeBundleWithIds(
      ['city-mill', 'shared-static'],
      ['shared-population'],
      failure
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-goldworks', 'shared-static'],
      ['shared-population'],
      failure
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(second.dispose).toHaveBeenCalledTimes(1));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'degraded',
      runtimeAssetFailureCount: 1
    });
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('retains settled coverage when a larger retry loses a population ID', async () => {
    const first = fakeRuntimeBundleWithIds(
      ['city-mill'],
      ['basilica-warden'],
      Object.freeze([Object.freeze({
        kind: 'population' as const,
        id: 'transient-actor',
        reason: 'transient fixture failure'
      })])
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-mill', 'city-goldworks'],
      ['astral-lancer', 'dusk-outrider']
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(second.dispose).toHaveBeenCalledTimes(1));
    expect(first.dispose).not.toHaveBeenCalled();
    expect(layer.getTelemetry()).toMatchObject({
      assetStatus: 'degraded',
      runtimeAssetFailureCount: 1
    });
    layer.dispose();
    expect(first.dispose).toHaveBeenCalledTimes(1);
  });

  it('replaces settled coverage when both prefab ID sets are supersets', async () => {
    const first = fakeRuntimeBundleWithIds(
      ['city-mill'],
      ['basilica-warden'],
      Object.freeze([Object.freeze({
        kind: 'population' as const,
        id: 'transient-actor',
        reason: 'transient fixture failure'
      })])
    );
    const second = fakeRuntimeBundleWithIds(
      ['city-mill', 'city-goldworks'],
      ['basilica-warden', 'astral-lancer']
    );
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(false, 1280, 720, 'auto', runtimeAssetLoader);
    layer.reconcile(createInnerKeepPresentation(), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('ready'));
    expect(first.dispose).toHaveBeenCalledTimes(1);
    expect(second.dispose).not.toHaveBeenCalled();
    layer.dispose();
    expect(second.dispose).toHaveBeenCalledTimes(1);
  });

  it('uses an available exact completed prefab after terminal decorative degradation', async () => {
    const failure = Object.freeze({
      kind: 'static' as const,
      id: 'breached-keep-wall',
      reason: 'terminal fixture failure'
    });
    const first = fakeRuntimeBundle(false, Object.freeze([failure]));
    const second = fakeRuntimeBundle(false, Object.freeze([failure]));
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      true,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation({
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
    }), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed?.userData.innerKeepAuthoredAsset).toBe(true);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      completedBuildingCount: 1,
      constructionSiteCount: 0
    });
    layer.dispose();
  });

  it('uses a bounded procedural completed fallback after terminal model degradation', async () => {
    const missingBuildingBundle = () => {
      const bundle = fakeRuntimeBundle(false, Object.freeze([Object.freeze({
        kind: 'static' as const,
        id: 'city-mill',
        reason: 'terminal fixture failure'
      })]));
      return Object.freeze({
        ...bundle,
        staticPrefabs: new Map([...bundle.staticPrefabs].filter(([id]) => id !== 'city-mill'))
      }) satisfies InnerKeepRuntimeAssetBundle;
    };
    const first = missingBuildingBundle();
    const second = missingBuildingBundle();
    const runtimeAssetLoader = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(second);
    const { layer } = createLayer(
      true,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    layer.reconcile(createInnerKeepPresentation({
      buildings: [{
        slotId: 'inner-keep-slot-m01',
        buildingKind: 'city-mill',
        completedLevel: 1,
        targetLevel: 1,
        phase: 'complete',
        startedAtMicros: 1n,
        completesAtMicros: 10n,
        revision: 1n
      }]
    }), { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    const completed = layer.scene.getObjectByName(
      'inner-keep-completed-building:city-mill'
    );
    expect(completed).toBeDefined();
    expect(completed?.userData.innerKeepAuthoredAsset).not.toBe(true);
    expect(layer.scene.getObjectByName('inner-keep-construction-scaffold')).toBeUndefined();
    expect(layer.getTelemetry()).toMatchObject({
      completedBuildingCount: 1,
      constructionSiteCount: 0
    });
    layer.dispose();
  });

  it('caps rejected full-bundle attempts across later same-key reconciles', async () => {
    const runtimeAssetLoader = vi.fn().mockRejectedValue(new Error('fixture loader outage'));
    const { layer } = createLayer(
      false,
      1280,
      720,
      'auto',
      runtimeAssetLoader
    );
    const presentation = createInnerKeepPresentation();
    layer.reconcile(presentation, { owningTerrainKind: 'meadow' });

    await vi.waitFor(() => expect(runtimeAssetLoader).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(layer.getTelemetry().assetStatus).toBe('degraded'));
    layer.reconcile(presentation, { owningTerrainKind: 'meadow' });
    await Promise.resolve();
    expect(runtimeAssetLoader).toHaveBeenCalledTimes(2);
    expect(layer.scene.userData.innerKeepAssetLoadAttemptCount).toBe(2);
    layer.dispose();
  });

  it('derives stable visible variation from castle, terrain, and layout version', () => {
    const first = createLayer();
    first.layer.reconcile(createInnerKeepPresentation(), {
      owningTerrainKind: 'forest'
    });
    const firstSeed = first.layer.scene.userData.innerKeepVisualSeed;
    first.layer.dispose();
    first.canvas.remove();

    const second = createLayer();
    second.layer.reconcile({
      ...createInnerKeepPresentation(),
      castleId: 8n
    }, { owningTerrainKind: 'ridge' });
    expect(second.layer.scene.userData.innerKeepVisualSeed).not.toBe(firstSeed);
    second.layer.dispose();
  });
});
