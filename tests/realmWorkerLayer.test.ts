import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { axialToWorld } from '../src/game/map/hexCoordinates';
import {
  createRealmWorkerLayer,
  realmWorkerWagonLodForQuality,
  resolveRealmWorkerWorldPosition,
  type RealmWorkerSceneRecord
} from '../src/components/realm/realmWorkerLayer';
import {
  getRealmWorkerRouteCacheTelemetry,
  resolveRealmWorkerAnimationClip,
  resolveRealmWorkerCanonicalRoute,
  resolveRealmWorkerRemainingRouteWorldPoints,
  resolveRealmWorkerRoutePose
} from '../src/components/realm/realmWorkerRoutePresentation';

const idleWorker = Object.freeze({
  workerId: 'genesis-001-castle-7-worker-01',
  ordinal: 1 as const,
  originCastleId: 7,
  originCastleName: 'Hegemony Keep 007',
  status: 'idle' as const,
  timelineRevision: 0,
  revision: 0n,
  ownedByViewer: true,
  originCoord: Object.freeze({ q: 0, r: 0 })
}) satisfies RealmWorkerSceneRecord;

const outboundWorker = Object.freeze({
  ...idleWorker,
  status: 'outbound' as const,
  resourceKind: 'wood' as const,
  siteId: 'genesis-001:wood:0001',
  startedAtMicros: 100n,
  arrivesAtMicros: 300n,
  gatheringEndsAtMicros: 600n,
  returnsAtMicros: 800n,
  routeSteps: 2,
  timelineRevision: 1,
  revision: 1n,
  destinationCoord: Object.freeze({ q: 2, r: -1 })
}) satisfies RealmWorkerSceneRecord;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('realm worker scene layer', () => {
  it('places idle workers around their keep and advances segment by segment', () => {
    const idle = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    const start = resolveRealmWorkerWorldPosition(outboundWorker, 100n, 1);
    const midpoint = resolveRealmWorkerWorldPosition(outboundWorker, 200n, 1);
    const end = resolveRealmWorkerWorldPosition(outboundWorker, 300n, 1);
    const route = resolveRealmWorkerCanonicalRoute(outboundWorker);

    expect(start).toEqual(idle);
    expect(route).toHaveLength(3);
    expect(midpoint).toEqual(axialToWorld(route![1]!, 1));
    expect(midpoint.x).not.toBeCloseTo((start.x + end.x) * 0.5, 8);
    expect(end).not.toEqual(start);
  });

  it('starts an early return from its persisted outbound progress basis', () => {
    const returning = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 250n,
      returnsAtMicros: 325n,
      returnStartProgressBasisPoints: 7_500,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const origin = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    const outboundAtRecall = resolveRealmWorkerWorldPosition(outboundWorker, 250n, 1);
    const returnStart = resolveRealmWorkerWorldPosition(returning, 250n, 1);
    const returned = resolveRealmWorkerWorldPosition(returning, 325n, 1);

    expect(returnStart).toEqual(outboundAtRecall);
    expect(returned).toEqual(origin);
  });

  it('renders one bounded selectable identity and accepts only the same static catalog', () => {
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const world = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    const hit = layer.raycast(new THREE.Raycaster(
      new THREE.Vector3(world.x, 5, world.z),
      new THREE.Vector3(0, -1, 0),
      0,
      10
    ));
    expect(hit).toMatchObject({
      workerId: idleWorker.workerId,
      workerOrdinal: 1,
      originCastleId: 7
    });
    expect(layer.canReconcile([Object.freeze({ ...idleWorker, revision: 2n })])).toBe(true);
    expect(layer.canReconcile([Object.freeze({
      ...idleWorker,
      originCoord: Object.freeze({ q: 1, r: 0 })
    })])).toBe(false);
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName('realm-worker-pick-volumes') as THREE.InstancedMesh;
    const markerDispose = vi.spyOn(marker, 'dispose');
    const pickDispose = vi.spyOn(pick, 'dispose');
    layer.reconcile([Object.freeze({ ...idleWorker, revision: 2n })]);
    layer.setHoveredWorkerId(idleWorker.workerId);
    layer.setSelectedWorkerId(idleWorker.workerId);
    layer.dispose();
    expect(markerDispose).toHaveBeenCalledOnce();
    expect(pickDispose).toHaveBeenCalledOnce();
    expect(layer.raycast(new THREE.Raycaster())).toBeNull();
  });

  it('refuses duplicate or non-canonical scene identities', () => {
    expect(() => createRealmWorkerLayer({
      workers: [idleWorker, idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    })).toThrow('REALM_WORKER_CATALOG_INVALID');
    expect(() => createRealmWorkerLayer({
      workers: [Object.freeze({ ...idleWorker, ordinal: 5 as never })],
      hexSize: 1,
      heightAtWorld: () => 0
    })).toThrow('REALM_WORKER_CATALOG_INVALID');
  });

  it('releases every allocated resource when initial terrain sampling fails', () => {
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');

    expect(() => createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => Number.NaN
    })).toThrow('REALM_WORKER_GROUND_INVALID');
    expect(instanceDispose).toHaveBeenCalledTimes(2);
    expect(geometryDispose).toHaveBeenCalledTimes(5);
    expect(materialDispose).toHaveBeenCalledTimes(5);
  });

  it('continues GPU cleanup when one disposal step throws', () => {
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName('realm-worker-pick-volumes') as THREE.InstancedMesh;
    const markerGeometryDispose = vi.spyOn(marker.geometry, 'dispose');
    const markerMaterialDispose = vi.spyOn(marker.material as THREE.Material, 'dispose');
    const pickDispose = vi.spyOn(pick, 'dispose');
    vi.spyOn(marker, 'dispose').mockImplementationOnce(() => {
      throw new Error('synthetic marker disposal failure');
    });

    expect(() => layer.dispose()).not.toThrow();
    expect(pickDispose).toHaveBeenCalledOnce();
    expect(markerGeometryDispose).toHaveBeenCalledOnce();
    expect(markerMaterialDispose).toHaveBeenCalledOnce();
  });

  it('leaves idle instance buffers and terrain sampling untouched on unchanged frames', () => {
    const heightAtWorld = vi.fn(() => 0);
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld
    });
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName('realm-worker-pick-volumes') as THREE.InstancedMesh;
    const markerMatrixVersion = marker.instanceMatrix.version;
    const markerColorVersion = marker.instanceColor?.version;
    const pickMatrixVersion = pick.instanceMatrix.version;

    expect(heightAtWorld).toHaveBeenCalledOnce();
    expect(layer.update(0n)).toBe(false);
    expect(layer.update(50n)).toBe(false);
    expect(heightAtWorld).toHaveBeenCalledOnce();
    expect(marker.instanceMatrix.version).toBe(markerMatrixVersion);
    expect(marker.instanceColor?.version).toBe(markerColorVersion);
    expect(pick.instanceMatrix.version).toBe(pickMatrixVersion);
    layer.setHoveredWorkerId(idleWorker.workerId);
    expect(heightAtWorld).toHaveBeenCalledOnce();
    expect(marker.instanceMatrix.version).toBeGreaterThan(markerMatrixVersion);
    expect(marker.instanceColor?.version).toBeGreaterThan(markerColorVersion ?? -1);
    expect(pick.instanceMatrix.version).toBe(pickMatrixVersion);
    layer.dispose();
  });

  it('stops reporting movement once an interpolated worker reaches its endpoint', () => {
    const layer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });

    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.update(200n)).toBe(true);
    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.update(300n)).toBe(true);
    expect(layer.hasMovingWorkers()).toBe(false);
    expect(layer.update(400n)).toBe(false);
    layer.dispose();
  });

  it('keeps valid positive v12 routeSteps drift visible on the canonical dry path', () => {
    const drifted = Object.freeze({
      ...outboundWorker,
      routeSteps: outboundWorker.routeSteps + 1
    }) satisfies RealmWorkerSceneRecord;

    expect(resolveRealmWorkerCanonicalRoute(drifted)).toEqual(
      resolveRealmWorkerCanonicalRoute(outboundWorker)
    );
    expect(resolveRealmWorkerRoutePose(drifted, 200n, 1)).toBeDefined();
    expect(() => resolveRealmWorkerWorldPosition(drifted, 200n, 1)).not.toThrow();

    const layer = createRealmWorkerLayer({
      workers: [drifted],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    expect(layer.getCurrentPose(drifted.workerId)).toBeDefined();
    expect(layer.getPresentationTelemetry().routeMismatchCount).toBe(0);
    layer.dispose();
  });

  it.each([
    ['zero steps', { routeSteps: 0 }],
    ['negative steps', { routeSteps: -1 }],
    ['fractional steps', { routeSteps: 1.5 }],
    ['unreachable endpoint', { destinationCoord: Object.freeze({ q: 999, r: 999 }) }]
  ] as const)('fails moving presentation closed for %s', (_label, overrides) => {
    const invalid = Object.freeze({
      ...outboundWorker,
      ...overrides
    }) satisfies RealmWorkerSceneRecord;

    expect(resolveRealmWorkerCanonicalRoute(invalid)).toBeUndefined();
    expect(resolveRealmWorkerRoutePose(invalid, 200n, 1)).toBeUndefined();
    expect(() => resolveRealmWorkerWorldPosition(invalid, 200n, 1))
      .toThrow('REALM_WORKER_ROUTE_MISMATCH');
  });

  it('caches canonical routes across positional frames and exposes current PFP anchors', () => {
    const profile = Object.freeze({
      canonicalUsername: 'keeper',
      displayName: 'Keeper',
      pfpUrl: 'https://i.imgur.com/example.png',
      communityStatsVisible: true
    });
    const worker = Object.freeze({ ...outboundWorker, profile });
    const before = getRealmWorkerRouteCacheTelemetry();
    resolveRealmWorkerRoutePose(worker, 120n, 1);
    resolveRealmWorkerRoutePose(worker, 180n, 1);
    const after = getRealmWorkerRouteCacheTelemetry();
    expect(after.hits - before.hits).toBeGreaterThanOrEqual(1);
    expect(after.size).toBeLessThanOrEqual(after.limit);

    const layer = createRealmWorkerLayer({
      workers: [worker],
      hexSize: 1,
      heightAtWorld: () => 0,
      reducedMotion: true
    });
    layer.update(200n);
    const current = layer.getCurrentPose(worker.workerId);
    expect(current?.world).toEqual(expect.objectContaining({
      x: expect.any(Number),
      y: expect.any(Number),
      z: expect.any(Number)
    }));
    expect(layer.getPresenceRecords()).toEqual([
      expect.objectContaining({
        workerId: worker.workerId,
        profile,
        direction: 'outbound'
      })
    ]);
    expect(layer.recommendedPositionUpdateIntervalMs()).toBe(500);
    layer.dispose();
  });

  it('uses approved LODs/clips and keeps return-route points ordered toward the keep', () => {
    expect(realmWorkerWagonLodForQuality('high')).toBe('high');
    expect(realmWorkerWagonLodForQuality('balanced')).toBe('balanced');
    expect(realmWorkerWagonLodForQuality('reduced')).toBe('compact');
    const pose = resolveRealmWorkerRoutePose(outboundWorker, 105n, 1)!;
    expect(resolveRealmWorkerAnimationClip(pose)).toBe('Start');

    const returning = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 250n,
      returnsAtMicros: 325n,
      returnStartProgressBasisPoints: 7_500,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const remaining = resolveRealmWorkerRemainingRouteWorldPoints(
      returning,
      275n,
      1
    )!;
    const origin = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    expect(remaining.at(-1)).toEqual(origin);
  });

  it('mirrors the steering clip when traversing a canonical corner in reverse', () => {
    const outboundCorner = resolveRealmWorkerRoutePose(outboundWorker, 204n, 1)!;
    const returning = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 300n,
      returnsAtMicros: 500n,
      returnStartProgressBasisPoints: 10_000,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const returningCorner = resolveRealmWorkerRoutePose(returning, 396n, 1)!;

    expect(outboundCorner.segmentIndex).toBe(returningCorner.segmentIndex);
    expect(outboundCorner.segmentProgress).toBeCloseTo(returningCorner.segmentProgress, 8);
    expect(resolveRealmWorkerAnimationClip(outboundCorner)).toBe('Turn_Left');
    expect(resolveRealmWorkerAnimationClip(returningCorner)).toBe('Turn_Right');
  });
});
