import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createRealmWorkerLayer,
  resolveRealmWorkerWorldPosition,
  type RealmWorkerSceneRecord
} from '../src/components/realm/realmWorkerLayer';

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
  it('places idle workers around their keep and interpolates outbound motion', () => {
    const idle = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    const start = resolveRealmWorkerWorldPosition(outboundWorker, 100n, 1);
    const midpoint = resolveRealmWorkerWorldPosition(outboundWorker, 200n, 1);
    const end = resolveRealmWorkerWorldPosition(outboundWorker, 300n, 1);

    expect(start).toEqual(idle);
    expect(midpoint.x).toBeCloseTo((start.x + end.x) * 0.5, 8);
    expect(midpoint.z).toBeCloseTo((start.z + end.z) * 0.5, 8);
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
    const destination = resolveRealmWorkerWorldPosition(
      Object.freeze({ ...outboundWorker, status: 'gathering' as const }),
      300n,
      1
    );
    const returnStart = resolveRealmWorkerWorldPosition(returning, 250n, 1);
    const returned = resolveRealmWorkerWorldPosition(returning, 325n, 1);

    expect(returnStart.x).toBeCloseTo(origin.x + (destination.x - origin.x) * 0.75, 8);
    expect(returnStart.z).toBeCloseTo(origin.z + (destination.z - origin.z) * 0.75, 8);
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
    const marker = layer.group.getObjectByName('realm-worker-markers') as THREE.InstancedMesh;
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
    expect(geometryDispose).toHaveBeenCalledTimes(2);
    expect(materialDispose).toHaveBeenCalledTimes(2);
  });

  it('continues GPU cleanup when one disposal step throws', () => {
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const marker = layer.group.getObjectByName('realm-worker-markers') as THREE.InstancedMesh;
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
    const marker = layer.group.getObjectByName('realm-worker-markers') as THREE.InstancedMesh;
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
});
