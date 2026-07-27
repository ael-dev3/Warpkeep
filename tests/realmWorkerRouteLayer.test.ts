import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';

import {
  REALM_WORKER_ROUTE_BUDGET,
  createRealmWorkerRouteLayer
} from '../src/components/realm/realmWorkerRouteLayer';
import type {
  RealmWorkerSceneRecord
} from '../src/components/realm/realmWorkerRoutePresentation';

function outboundWorker(
  workerId: string,
  originCastleId: number,
  ownedByViewer = false
): RealmWorkerSceneRecord {
  return Object.freeze({
    workerId,
    ordinal: ((originCastleId % 4) + 1) as 1 | 2 | 3 | 4,
    originCastleId,
    originCastleName: `Keep ${originCastleId}`,
    status: 'outbound',
    resourceKind: 'wood',
    siteId: 'genesis-001:wood:0001',
    startedAtMicros: 100n,
    arrivesAtMicros: 300n,
    gatheringEndsAtMicros: 600n,
    returnsAtMicros: 800n,
    routeSteps: 2,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer,
    originCoord: Object.freeze({ q: 0, r: 0 }),
    destinationCoord: Object.freeze({ q: 2, r: -1 })
  });
}

describe('realm worker route layer', () => {
  it('renders one terrain-contact ribbon with a bounded physical mesh topology', () => {
    const worker = outboundWorker('worker-1', 1, true);
    const layer = createRealmWorkerRouteLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: ({ x, z }) => (x + z) * 0.01
    });
    layer.update(150n);

    const telemetry = layer.getTelemetry();
    expect(telemetry).toMatchObject({
      visibleRouteCount: 1,
      selectedRouteCount: 0,
      ownedRouteCount: 1,
      peerRouteCount: 0,
      exactMatchRouteCount: 1,
      normalizedTimeRouteCount: 0,
      drawCallCount: 1,
      rejectedRouteCount: 0
    });
    expect(telemetry.visibleSegmentCount).toBeGreaterThan(1);
    expect(telemetry.visibleVertexCount).toBe(
      telemetry.visibleSegmentCount * 4
    );
    expect(telemetry.triangleCount).toBe(
      telemetry.visibleSegmentCount * 2
    );
    const ribbon = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const positions = ribbon.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const progress = ribbon.geometry.getAttribute(
      'routeProgress'
    ) as THREE.BufferAttribute;
    expect(positions.count).toBe(
      REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 4
    );
    expect(progress.count).toBe(positions.count);
    expect(ribbon.geometry.index?.count).toBe(
      REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 6
    );
    expect(ribbon.geometry.drawRange).toEqual({
      start: 0,
      count: telemetry.visibleSegmentCount * 6
    });
    expect(ribbon.material).toBeInstanceOf(THREE.ShaderMaterial);
    expect(ribbon.material.fog).toBe(true);
    expect(ribbon.material.uniforms).toEqual(expect.objectContaining({
      fogColor: expect.objectContaining({ value: expect.any(THREE.Color) }),
      fogDensity: expect.objectContaining({ value: expect.any(Number) }),
      fogFar: expect.objectContaining({ value: expect.any(Number) }),
      fogNear: expect.objectContaining({ value: expect.any(Number) })
    }));
    expect(progress.getX(0)).toBeLessThan(progress.getX(
      telemetry.visibleVertexCount - 1
    ));
    layer.dispose();
  });

  it('keeps geometry topology and attributes stable across time-only progress', () => {
    const worker = outboundWorker('worker-stable', 1, true);
    const layer = createRealmWorkerRouteLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const ribbon = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const positions = ribbon.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const progress = ribbon.geometry.getAttribute(
      'routeProgress'
    ) as THREE.BufferAttribute;
    const topologyRebuildCount = layer.getTelemetry().topologyRebuildCount;
    const firstPositionVersion = positions.version;
    const firstProgressVersion = progress.version;
    const firstProgressUpdateCount = layer.getTelemetry().progressUpdateCount;

    layer.update(150n);
    const stateAt150 = (
      ribbon.material.uniforms.uRouteState!.value as THREE.Vector4[]
    )[0]!.x;
    layer.update(160n);
    const stateAt160 = (
      ribbon.material.uniforms.uRouteState!.value as THREE.Vector4[]
    )[0]!.x;

    expect(ribbon.geometry.getAttribute('position')).toBe(positions);
    expect(ribbon.geometry.getAttribute('routeProgress')).toBe(progress);
    expect(positions.version).toBe(firstPositionVersion);
    expect(progress.version).toBe(firstProgressVersion);
    expect(layer.getTelemetry().topologyRebuildCount).toBe(topologyRebuildCount);
    expect(layer.getTelemetry().progressUpdateCount)
      .toBeGreaterThan(firstProgressUpdateCount);
    expect(stateAt160).toBeGreaterThan(stateAt150);
    expect(ribbon.geometry.drawRange.count)
      .toBeLessThanOrEqual(
        REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 6
      );
    layer.dispose();
  });

  it('reconciles a same-topology public revision without re-uploading route geometry', () => {
    const worker = outboundWorker('worker-reconcile-stable', 1, true);
    const layer = createRealmWorkerRouteLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const ribbon = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    const positions = ribbon.geometry.getAttribute('position') as THREE.BufferAttribute;
    const topologyRebuildCount = layer.getTelemetry().topologyRebuildCount;
    const positionVersion = positions.version;

    expect(layer.reconcile([Object.freeze({
      ...worker,
      startedAtMicros: 120n,
      arrivesAtMicros: 320n,
      gatheringEndsAtMicros: 620n,
      returnsAtMicros: 820n,
      timelineRevision: 2,
      revision: 2n
    })])).toBe(true);

    expect(layer.getTelemetry().topologyRebuildCount).toBe(topologyRebuildCount);
    expect(positions.version).toBe(positionVersion);
    layer.dispose();
  });

  it('prioritizes selected, owned, then hovered peer routes inside strict budgets', () => {
    const workers = Object.freeze(Array.from({ length: 40 }, (_, index) => (
      outboundWorker(`worker-${index + 1}`, index + 1, true)
    )));
    const layer = createRealmWorkerRouteLayer({
      workers,
      hexSize: 1,
      heightAtWorld: () => 0
    });
    layer.setSelectedWorkerId('worker-1');
    layer.update(180n);

    const telemetry = layer.getTelemetry();
    expect(telemetry.visibleRouteCount)
      .toBeLessThanOrEqual(REALM_WORKER_ROUTE_BUDGET.maximumVisibleRoutes);
    expect(telemetry.visibleSegmentCount)
      .toBeLessThanOrEqual(REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments);
    expect(telemetry.drawCallCount)
      .toBeLessThanOrEqual(REALM_WORKER_ROUTE_BUDGET.maximumDrawCalls);
    expect(telemetry.triangleCount)
      .toBeLessThanOrEqual(REALM_WORKER_ROUTE_BUDGET.maximumTriangles);
    expect(telemetry.selectedRouteCount).toBe(1);
    expect(telemetry.ownedRouteCount).toBe(23);
    expect(telemetry.hiddenByBudgetCount).toBe(16);
    expect(telemetry.rejectedRouteCount).toBe(16);
    const ribbons = layer.group.children as THREE.Mesh[];
    expect(ribbons.reduce(
      (triangles, ribbon) => triangles + ribbon.geometry.drawRange.count / 3,
      0
    )).toBe(telemetry.triangleCount);
    layer.dispose();

    const peerLayer = createRealmWorkerRouteLayer({
      workers: [
        outboundWorker('selected-peer', 1),
        outboundWorker('hovered-peer', 2),
        outboundWorker('hidden-peer', 3)
      ],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    expect(peerLayer.getTelemetry().visibleRouteCount).toBe(0);
    peerLayer.setSelectedWorkerId('selected-peer');
    peerLayer.setHoveredWorkerId('hovered-peer');
    expect(peerLayer.getTelemetry()).toMatchObject({
      visibleRouteCount: 2,
      selectedRouteCount: 1,
      ownedRouteCount: 0,
      peerRouteCount: 1
    });
    peerLayer.dispose();
  });

  it('suppresses overview peer routes while preserving owned and selected routes', () => {
    const layer = createRealmWorkerRouteLayer({
      workers: [
        outboundWorker('owned-route', 1, true),
        outboundWorker('peer-route', 2)
      ],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    layer.setHoveredWorkerId('peer-route');
    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 2,
      ownedRouteCount: 1,
      peerRouteCount: 1
    });

    layer.setCameraMode('realm');
    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 1,
      ownedRouteCount: 1,
      peerRouteCount: 0
    });

    layer.setSelectedWorkerId('peer-route');
    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 2,
      selectedRouteCount: 1,
      ownedRouteCount: 1,
      peerRouteCount: 0
    });
    layer.dispose();
  });

  it('keeps reduced-motion route direction static while progress stays truthful', () => {
    const layer = createRealmWorkerRouteLayer({
      workers: [outboundWorker('worker-reduced', 1, true)],
      hexSize: 1,
      heightAtWorld: () => 0,
      reducedMotion: true
    });
    const ribbon = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
    layer.update(150n);
    const progress150 = (
      ribbon.material.uniforms.uRouteState!.value as THREE.Vector4[]
    )[0]!.x;
    layer.update(175n);
    const progress175 = (
      ribbon.material.uniforms.uRouteState!.value as THREE.Vector4[]
    )[0]!.x;

    expect(ribbon.material.uniforms.uReducedMotion!.value).toBe(1);
    expect(ribbon.material.uniforms.uMotionPhase!.value).toBe(0);
    expect(ribbon.material.fragmentShader).toContain(
      'vRouteProgress * 16.0 * travelDirection'
    );
    expect(ribbon.material.fragmentShader).toContain('chevronCenter');
    expect(progress175).toBeGreaterThan(progress150);
    layer.dispose();
  });

  it('hides the ground ribbon once a returning wagon passes its keep gate', () => {
    const returning = Object.freeze({
      ...outboundWorker('worker-returning', 1, true),
      status: 'returning' as const,
      returnStartedAtMicros: 300n,
      returnsAtMicros: 500n,
      returnStartProgressBasisPoints: 10_000,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const layer = createRealmWorkerRouteLayer({
      workers: [returning],
      hexSize: 1,
      heightAtWorld: () => 0
    });

    layer.update(400n);
    expect(layer.getTelemetry().visibleRouteCount).toBe(1);
    layer.update(495n);
    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 0,
      visibleSegmentCount: 0,
      drawCallCount: 0
    });
    layer.dispose();
  });

  it('does not report routes whose terrain samples cannot be rendered', () => {
    const layer = createRealmWorkerRouteLayer({
      workers: [outboundWorker('worker-invalid-height', 1, true)],
      hexSize: 1,
      heightAtWorld: () => Number.NaN
    });
    layer.update(150n);

    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 0,
      visibleSegmentCount: 0,
      selectedRouteCount: 0,
      ownedRouteCount: 0,
      peerRouteCount: 0,
      drawCallCount: 0,
      rejectedRouteCount: 1
    });
    for (const ribbon of layer.group.children as THREE.Mesh[]) {
      expect(ribbon.visible).toBe(false);
      expect(ribbon.geometry.drawRange).toEqual({ start: 0, count: 0 });
    }
    layer.dispose();
  });

  it('fails closed on an unavailable eligible route and cleans up all lanes', () => {
    const unavailable = Object.freeze({
      ...outboundWorker('worker-unavailable', 1, true),
      destinationCoord: Object.freeze({ q: 999, r: 999 })
    });
    const layer = createRealmWorkerRouteLayer({
      workers: [unavailable],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    expect(layer.getTelemetry()).toMatchObject({
      visibleRouteCount: 0,
      visibleSegmentCount: 0,
      genuineInvalidRouteCount: 1,
      rejectedRouteCount: 1
    });
    const ribbons = [...layer.group.children] as THREE.Mesh[];
    const geometryDisposals = ribbons.map((ribbon) => (
      vi.spyOn(ribbon.geometry, 'dispose')
    ));
    const materialDisposals = ribbons.map((ribbon) => (
      vi.spyOn(ribbon.material as THREE.Material, 'dispose')
    ));
    expect(() => layer.dispose()).not.toThrow();
    expect(layer.group.children).toHaveLength(0);
    for (const dispose of [...geometryDisposals, ...materialDisposals]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    layer.dispose();
    for (const dispose of [...geometryDisposals, ...materialDisposals]) {
      expect(dispose).toHaveBeenCalledTimes(1);
    }
    expect(layer.update(200n)).toBe(false);
  });
});
