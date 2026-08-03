import { afterEach, describe, expect, it, vi } from 'vitest';
import type * as THREE from 'three';

import { createInnerKeepSceneLayer } from '../src/components/inner-keep/createInnerKeepSceneLayer';
import type { InnerKeepBuildingPresentation } from '../src/components/inner-keep/innerKeepPresentation';
import { createInnerKeepPresentation } from './fixtures/innerKeepPresentation';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

function createLayer(reducedMotion = false, width = 1280, height = 720) {
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
      requestRender
    }),
    requestRender
  };
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
    expect(layer.getTelemetry()).toMatchObject({ status: 'ready', slotCount: 12 });
    expect(pads).toHaveLength(12);
    expect(first?.position.x).toBe(-7);
    expect(first?.position.z).toBe(-3.2);
    expect(document.querySelectorAll('canvas')).toHaveLength(1);
    expect(requestAnimationFrame).not.toHaveBeenCalled();
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
