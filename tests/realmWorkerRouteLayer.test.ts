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
  it('renders an ordered dashed route with a bounded directional chevron', () => {
    const worker = outboundWorker('worker-1', 1, true);
    const layer = createRealmWorkerRouteLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    layer.update(150n);

    const telemetry = layer.getTelemetry();
    expect(telemetry).toMatchObject({
      visibleRouteCount: 1,
      selectedRouteCount: 0,
      ownedRouteCount: 1,
      peerRouteCount: 0,
      drawCallCount: 1,
      triangleCount: 0,
      rejectedRouteCount: 0
    });
    // Two remaining path segments plus a two-segment directional chevron.
    expect(telemetry.visibleSegmentCount).toBe(4);
    const line = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.LineSegments;
    const positions = line.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    expect(positions.count).toBe(
      REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
    );
    expect(positions.usage).toBe(THREE.DynamicDrawUsage);
    expect(line.geometry.drawRange).toEqual({ start: 0, count: 8 });
    const firstArrowTip = new THREE.Vector3().fromBufferAttribute(positions, 5);
    const secondArrowTip = new THREE.Vector3().fromBufferAttribute(positions, 7);
    expect(firstArrowTip.distanceTo(secondArrowTip)).toBeLessThan(0.000_001);
    layer.dispose();
  });

  it('keeps bounded dynamic GPU attributes stable across moving frames', () => {
    const worker = outboundWorker('worker-stable', 1, true);
    const layer = createRealmWorkerRouteLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const line = layer.group.getObjectByName(
      'realm-worker-routes-owned'
    ) as THREE.LineSegments;
    const positions = line.geometry.getAttribute(
      'position'
    ) as THREE.BufferAttribute;
    const distances = line.geometry.getAttribute(
      'lineDistance'
    ) as THREE.BufferAttribute;

    expect(positions.count).toBe(
      REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
    );
    expect(distances.count).toBe(
      REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
    );
    expect(positions.usage).toBe(THREE.DynamicDrawUsage);
    expect(distances.usage).toBe(THREE.DynamicDrawUsage);

    layer.update(150n);
    const firstPositionVersion = positions.version;
    const firstDistanceVersion = distances.version;
    expect(line.geometry.getAttribute('position')).toBe(positions);
    expect(line.geometry.getAttribute('lineDistance')).toBe(distances);
    expect(line.geometry.drawRange.count / 2)
      .toBe(layer.getTelemetry().visibleSegmentCount);

    layer.update(160n);
    expect(line.geometry.getAttribute('position')).toBe(positions);
    expect(line.geometry.getAttribute('lineDistance')).toBe(distances);
    expect(positions.version).toBeGreaterThan(firstPositionVersion);
    expect(distances.version).toBeGreaterThan(firstDistanceVersion);
    expect(line.geometry.drawRange.count)
      .toBeLessThanOrEqual(
        REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
      );
    layer.dispose();
  });

  it('prioritizes selected and owned routes inside strict scene budgets', () => {
    const workers = Object.freeze(Array.from({ length: 40 }, (_, index) => (
      outboundWorker(`worker-${index + 1}`, index + 1, index >= 30)
    )));
    const layer = createRealmWorkerRouteLayer({
      workers,
      hexSize: 1,
      heightAtWorld: () => 0
    });
    layer.setSelectedWorkerId('worker-1');
    layer.setHoveredWorkerId('worker-2');
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
    expect(telemetry.selectedRouteCount).toBe(2);
    expect(telemetry.ownedRouteCount).toBeGreaterThan(0);
    expect(telemetry.rejectedRouteCount).toBeGreaterThan(0);
    const lines = layer.group.children as THREE.LineSegments[];
    expect(lines.reduce(
      (segments, line) => segments + line.geometry.drawRange.count / 2,
      0
    )).toBe(telemetry.visibleSegmentCount);
    for (const line of lines) {
      expect(line.geometry.getAttribute('position').count).toBe(
        REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
      );
      expect(line.geometry.getAttribute('lineDistance').count).toBe(
        REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments * 2
      );
      expect(line.geometry.drawRange.count / 2)
        .toBeLessThanOrEqual(
          REALM_WORKER_ROUTE_BUDGET.maximumVisibleSegments
        );
    }
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
    for (const line of layer.group.children as THREE.LineSegments[]) {
      expect(line.visible).toBe(false);
      expect(line.geometry.drawRange).toEqual({ start: 0, count: 0 });
    }
    layer.dispose();
  });

  it('fails closed on an unavailable route and cleans up all draw lanes', () => {
    const unavailable = Object.freeze({
      ...outboundWorker('worker-unavailable', 1),
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
      rejectedRouteCount: 1
    });
    const lines = [...layer.group.children] as THREE.LineSegments[];
    const geometryDisposals = lines.map((line) => (
      vi.spyOn(line.geometry, 'dispose')
    ));
    const materialDisposals = lines.map((line) => (
      vi.spyOn(line.material as THREE.Material, 'dispose')
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
