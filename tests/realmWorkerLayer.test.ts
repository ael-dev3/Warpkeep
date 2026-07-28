import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';

const workerPrefabLoadControl = vi.hoisted(() => ({
  mode: 'resolved' as 'resolved' | 'pending',
  unsafeRouteRoot: false,
  pending: [] as Array<Readonly<{
    resolve: () => void;
    reject: () => void;
  }>>
}));

vi.mock('../src/components/realm/loadHegemonyExpeditionAssets', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/components/realm/loadHegemonyExpeditionAssets')
  >();
  return {
    ...actual,
    acquireHegemonyExpeditionPrefab: (
      options: Parameters<typeof actual.acquireHegemonyExpeditionPrefab>[0]
    ) => {
      const root = new THREE.Group();
      const horseRoot = new THREE.Bone();
      horseRoot.name = 'H_Root';
      const leftWheel = new THREE.Bone();
      leftWheel.name = 'W_Wheel_L';
      const rightWheel = new THREE.Bone();
      rightWheel.name = 'W_Wheel_R';
      root.add(horseRoot, leftWheel, rightWheel);
      const clipDurations = Object.freeze({
        Idle: 2,
        Start: 0.8,
        Stop: 0.8,
        Turn_Left: 1,
        Turn_Right: 1,
        Walk: 1
      });
      const clips = Object.freeze(
        Object.entries(clipDurations).map(([name, duration]) => (
          new THREE.AnimationClip(
            name,
            duration,
            workerPrefabLoadControl.unsafeRouteRoot && name === 'Walk'
              ? [new THREE.VectorKeyframeTrack(
                  'WK_UnitRoot.position',
                  [0, 1],
                  [0, 0, 0, 1, 0, 0]
                )]
              : name === 'Idle'
                ? [new THREE.VectorKeyframeTrack(
                    'H_Root.position',
                    [0, 1, 2],
                    [0, 0, 0, 0, 1, 0, 0, 0, 0]
                  )]
                : []
          )
        ))
      );
      const lease = () => ({
        model: Object.freeze({
          root,
          clips,
          footprintDiameter: options.targetFootprintDiameter,
          visualHeight: 1,
          assetUrl: options.asset.path
        }),
        release: vi.fn()
      });
      if (workerPrefabLoadControl.mode === 'pending') {
        return new Promise<ReturnType<typeof lease>>((resolve, reject) => {
          workerPrefabLoadControl.pending.push(Object.freeze({
            resolve: () => resolve(lease()),
            reject: () => reject(new Error('TEST_WORKER_PREFAB_REJECTED'))
          }));
        });
      }
      return Promise.resolve(lease());
    }
  };
});

import {
  createRealmWorkerLayer,
  REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS,
  realmWorkerWagonLodForQuality,
  resolveRealmWorkerTerrainOrientation,
  resolveRealmWorkerWorldPosition,
  transitionRealmWorkerAnimation,
  type RealmWorkerSceneRecord
} from '../src/components/realm/realmWorkerLayer';
import {
  getRealmWorkerRouteCacheTelemetry,
  resolveCorridorSafeWorkerPolyline,
  resolveRealmWorkerAnimationClip,
  resolveRealmWorkerCanonicalRoute,
  resolveRealmWorkerRemainingRouteWorldPoints,
  resolveRealmWorkerRoutePose,
  resolveRealmWorkerVisualRoute
} from '../src/components/realm/realmWorkerRoutePresentation';
import { REALM_QUALITY_SPECS } from '../src/components/realm/realmQuality';

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

const longOutboundWorker = Object.freeze({
  ...outboundWorker,
  startedAtMicros: 1_000_000n,
  arrivesAtMicros: 11_000_000n,
  gatheringEndsAtMicros: 21_000_000n,
  returnsAtMicros: 31_000_000n
}) satisfies RealmWorkerSceneRecord;

afterEach(() => {
  workerPrefabLoadControl.pending.splice(0).forEach((load) => load.reject());
  workerPrefabLoadControl.mode = 'resolved';
  workerPrefabLoadControl.unsafeRouteRoot = false;
  vi.restoreAllMocks();
});

describe('realm worker scene layer', () => {
  it('places idle workers around their keep and advances by cumulative distance', () => {
    const idle = resolveRealmWorkerWorldPosition(idleWorker, 0n, 1);
    const start = resolveRealmWorkerWorldPosition(outboundWorker, 100n, 1);
    const midpointPose = resolveRealmWorkerRoutePose(outboundWorker, 200n, 1)!;
    const end = resolveRealmWorkerWorldPosition(outboundWorker, 300n, 1);
    const route = resolveRealmWorkerCanonicalRoute(outboundWorker);
    const visualRoute = resolveRealmWorkerVisualRoute(outboundWorker, 1)!;
    const traversedDistance = (
      visualRoute.cumulativeDistances[midpointPose.segmentIndex]!
      + (
        visualRoute.cumulativeDistances[midpointPose.segmentIndex + 1]!
        - visualRoute.cumulativeDistances[midpointPose.segmentIndex]!
      ) * midpointPose.segmentProgress
    );

    expect(start).toEqual(idle);
    expect(route).toHaveLength(3);
    expect(traversedDistance).toBeCloseTo(visualRoute.totalLength * 0.5, 8);
    expect(visualRoute.ribbonPoints[0]).not.toEqual(idle);
    expect(visualRoute.ribbonPoints.at(-1)).toEqual(end);
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

  it('reconstructs phase-aware outbound and returning poses across reconnect without reversal', () => {
    const returningWorker = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 250n,
      returnsAtMicros: 550n,
      returnStartProgressBasisPoints: 7_500,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const percentages = [10, 25, 50, 75, 90] as const;
    const phaseCases = [
      {
        direction: 'outbound' as const,
        worker: outboundWorker,
        start: outboundWorker.startedAtMicros,
        end: outboundWorker.arrivesAtMicros,
        expectedForwardProgress: (percentage: number) => percentage / 100
      },
      {
        direction: 'returning' as const,
        worker: returningWorker,
        start: returningWorker.returnStartedAtMicros,
        end: returningWorker.returnsAtMicros,
        expectedForwardProgress: (percentage: number) => (
          0.75 * (1 - percentage / 100)
        )
      }
    ] as const;

    for (const phase of phaseCases) {
      const observedForwardProgress: number[] = [];
      for (const percentage of percentages) {
        const nowMicros = phase.start
          + (phase.end - phase.start) * BigInt(percentage) / 100n;
        const beforeReconnect = resolveRealmWorkerRoutePose(
          phase.worker,
          nowMicros,
          1
        )!;
        const reconstructedWorker = Object.freeze({
          ...phase.worker,
          originCoord: Object.freeze({ ...phase.worker.originCoord }),
          destinationCoord: Object.freeze({ ...phase.worker.destinationCoord })
        }) satisfies RealmWorkerSceneRecord;
        const afterReconnect = resolveRealmWorkerRoutePose(
          reconstructedWorker,
          nowMicros,
          1
        )!;

        expect(afterReconnect.direction).toBe(phase.direction);
        expect(afterReconnect.phaseProgress).toBeCloseTo(percentage / 100, 8);
        expect(afterReconnect.forwardProgress).toBeCloseTo(
          phase.expectedForwardProgress(percentage),
          8
        );
        expect(afterReconnect.world.x).toBeCloseTo(beforeReconnect.world.x, 12);
        expect(afterReconnect.world.z).toBeCloseTo(beforeReconnect.world.z, 12);
        expect(afterReconnect.segmentIndex).toBe(beforeReconnect.segmentIndex);
        expect(afterReconnect.segmentProgress).toBeCloseTo(
          beforeReconnect.segmentProgress,
          12
        );
        expect(
          afterReconnect.tangent.x * beforeReconnect.tangent.x
          + afterReconnect.tangent.z * beforeReconnect.tangent.z
        ).toBeCloseTo(1, 12);
        observedForwardProgress.push(afterReconnect.forwardProgress);
      }

      for (let index = 1; index < observedForwardProgress.length; index += 1) {
        const previous = observedForwardProgress[index - 1]!;
        const current = observedForwardProgress[index]!;
        if (phase.direction === 'outbound') expect(current).toBeGreaterThan(previous);
        else expect(current).toBeLessThan(previous);
      }
    }
  });

  it('renders one bounded selectable identity and accepts only the same static catalog', () => {
    const layer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const world = resolveRealmWorkerWorldPosition(outboundWorker, 0n, 1);
    const hit = layer.raycast(new THREE.Raycaster(
      new THREE.Vector3(world.x, 5, world.z),
      new THREE.Vector3(0, -1, 0),
      0,
      10
    ));
    expect(hit).toMatchObject({
      workerId: outboundWorker.workerId,
      workerOrdinal: 1,
      originCastleId: 7
    });
    expect(layer.canReconcile([Object.freeze({ ...outboundWorker, revision: 2n })])).toBe(true);
    expect(layer.canReconcile([Object.freeze({
      ...outboundWorker,
      originCoord: Object.freeze({ q: 1, r: 0 })
    })])).toBe(false);
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName('realm-worker-pick-volumes') as THREE.InstancedMesh;
    const markerDispose = vi.spyOn(marker, 'dispose');
    const pickDispose = vi.spyOn(pick, 'dispose');
    layer.reconcile([Object.freeze({ ...outboundWorker, revision: 2n })]);
    layer.setHoveredWorkerId(outboundWorker.workerId);
    layer.setSelectedWorkerId(outboundWorker.workerId);
    layer.dispose();
    expect(markerDispose).toHaveBeenCalledOnce();
    expect(pickDispose).toHaveBeenCalledOnce();
    expect(layer.raycast(new THREE.Raycaster())).toBeNull();
  });

  it('keeps idle wagons parked invisibly inside their keep', () => {
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName(
      'realm-worker-pick-volumes'
    ) as THREE.InstancedMesh;

    expect(marker.count).toBe(0);
    expect(pick.count).toBe(0);
    expect(layer.getCurrentPose(idleWorker.workerId)).toMatchObject({
      direction: 'idle',
      coord: idleWorker.originCoord
    });
    expect(layer.getPresentationTelemetry()).toMatchObject({
      publicWorkerCount: 1,
      modelWorkerCount: 0,
      fallbackWorkerCount: 0
    });
    expect(layer.raycast(new THREE.Raycaster(
      new THREE.Vector3(0, 5, 0),
      new THREE.Vector3(0, -1, 0),
      0,
      10
    ))).toBeNull();
    layer.dispose();
  });

  it('reveals the active journey and reparks the wagon when return completes', () => {
    const layer = createRealmWorkerLayer({
      workers: [idleWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });
    const marker = layer.group.getObjectByName(
      'realm-worker-wagon-fallbacks'
    ) as THREE.InstancedMesh;
    const pick = layer.group.getObjectByName(
      'realm-worker-pick-volumes'
    ) as THREE.InstancedMesh;
    const gathering = Object.freeze({
      ...outboundWorker,
      status: 'gathering' as const,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const returning = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 500n,
      returnsAtMicros: 700n,
      returnStartProgressBasisPoints: 10_000,
      timelineRevision: 3,
      revision: 3n
    }) satisfies RealmWorkerSceneRecord;

    layer.reconcile([outboundWorker]);
    expect(marker.count).toBe(1);
    expect(pick.count).toBe(1);
    expect(layer.getCurrentPose(outboundWorker.workerId)?.direction).toBe('outbound');

    layer.update(400n);
    layer.reconcile([gathering]);
    expect(marker.count).toBe(1);
    expect(pick.count).toBe(1);
    expect(layer.getCurrentPose(gathering.workerId)?.direction).toBe('gathering');

    layer.reconcile([returning]);
    expect(marker.count).toBe(1);
    expect(pick.count).toBe(1);
    expect(layer.getCurrentPose(returning.workerId)?.direction).toBe('returning');

    // Retire the wagon at the authoritative deadline even if the next public
    // row is delayed and still reports `returning`.
    layer.update(returning.returnsAtMicros);
    expect(marker.count).toBe(0);
    expect(pick.count).toBe(0);
    expect(layer.getPresenceRecords()).toEqual([]);
    expect(layer.hasMovingWorkers()).toBe(false);

    const returnedIdle = Object.freeze({
      ...idleWorker,
      timelineRevision: 4,
      revision: 4n
    }) satisfies RealmWorkerSceneRecord;
    layer.reconcile([returnedIdle]);
    expect(marker.count).toBe(0);
    expect(pick.count).toBe(0);
    expect(layer.getCurrentPose(returnedIdle.workerId)).toMatchObject({
      direction: 'idle',
      coord: returnedIdle.originCoord
    });
    const parkedWorld = resolveRealmWorkerWorldPosition(returnedIdle, 400n, 1);
    expect(layer.getCurrentPose(returnedIdle.workerId)?.world).toMatchObject({
      x: parkedWorld.x,
      z: parkedWorld.z
    });
    layer.dispose();
  });

  it('removes loaded models when workers park and ignores a late prefab for an idle worker', async () => {
    const loadedReady = vi.fn();
    const loadedLayer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      reducedMotion: true,
      onModelReady: loadedReady
    });
    const loadedModels = loadedLayer.group.getObjectByName(
      'realm-worker-wagon-models'
    ) as THREE.Group;

    await vi.waitFor(() => expect(loadedReady).toHaveBeenCalledOnce());
    expect(loadedModels.children).toHaveLength(1);
    expect(loadedLayer.getPresentationTelemetry()).toMatchObject({
      modelWorkerCount: 1,
      fallbackWorkerCount: 0
    });

    loadedLayer.reconcile([Object.freeze({
      ...idleWorker,
      timelineRevision: 2,
      revision: 2n
    })]);
    expect(loadedModels.children).toHaveLength(0);
    expect(loadedLayer.getPresentationTelemetry()).toMatchObject({
      modelWorkerCount: 0,
      fallbackWorkerCount: 0
    });
    loadedLayer.dispose();

    workerPrefabLoadControl.mode = 'pending';
    const lateReady = vi.fn();
    const lateLayer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      reducedMotion: true,
      onModelReady: lateReady
    });
    const lateModels = lateLayer.group.getObjectByName(
      'realm-worker-wagon-models'
    ) as THREE.Group;
    const pending = workerPrefabLoadControl.pending.shift();
    expect(pending).toBeDefined();

    lateLayer.reconcile([Object.freeze({
      ...idleWorker,
      timelineRevision: 2,
      revision: 2n
    })]);
    pending!.resolve();
    await vi.waitFor(() => expect(lateReady).toHaveBeenCalledOnce());

    expect(lateModels.children).toHaveLength(0);
    expect(lateLayer.getPresentationTelemetry()).toMatchObject({
      modelWorkerCount: 0,
      fallbackWorkerCount: 0
    });
    lateLayer.dispose();
  });

  it('restores a late real-model phase and distance-driven wheels without changing physical scale', async () => {
    workerPrefabLoadControl.mode = 'pending';
    const ready = vi.fn();
    const stopAllAction = vi.spyOn(
      THREE.AnimationMixer.prototype,
      'stopAllAction'
    );
    const uncacheRoot = vi.spyOn(
      THREE.AnimationMixer.prototype,
      'uncacheRoot'
    );
    const layer = createRealmWorkerLayer({
      workers: [longOutboundWorker],
      hexSize: 2,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      onModelReady: ready
    });
    const models = layer.group.getObjectByName(
      'realm-worker-wagon-models'
    ) as THREE.Group;
    const pending = workerPrefabLoadControl.pending.shift();
    expect(pending).toBeDefined();

    layer.update(5_000_000n);
    expect(models.children).toHaveLength(0);
    pending!.resolve();
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());

    expect(models.children).toHaveLength(1);
    const model = models.children[0] as THREE.Group;
    const wheel = model.getObjectByName('W_Wheel_L');
    expect(model.scale.toArray()).toEqual([2, 2, 2]);
    expect(wheel?.quaternion.equals(new THREE.Quaternion())).toBe(false);
    expect(layer.getPresentationTelemetry()).toMatchObject({
      modelWorkerCount: 1,
      animatedWorkerCount: 1,
      workerLateModelPhaseRestorationCount: 1,
      workerModelPhaseRestorationCount: 1,
      workerWheelDrivenCount: 1,
      workerWheelDistanceMismatchCount: 0,
      clipWalkCount: 1,
      renderedClipWalkCount: 1
    });

    layer.setSelectedWorkerId(longOutboundWorker.workerId);
    expect(model.scale.toArray()).toEqual([2, 2, 2]);
    const transitionsBeforeRevision =
      layer.getPresentationTelemetry().animationTransitionCount;
    layer.reconcile([Object.freeze({
      ...longOutboundWorker,
      revision: 99n
    })]);
    expect(layer.getPresentationTelemetry().animationTransitionCount)
      .toBe(transitionsBeforeRevision);
    layer.reconcile([Object.freeze({
      ...longOutboundWorker,
      timelineRevision: longOutboundWorker.timelineRevision + 1,
      revision: 100n
    })]);
    expect(layer.getPresentationTelemetry().animationTransitionCount)
      .toBe(transitionsBeforeRevision + 1);

    layer.dispose();
    expect(stopAllAction).toHaveBeenCalled();
    expect(uncacheRoot).toHaveBeenCalledWith(model);
  });

  it('keeps a route-conflicting model behind the bounded procedural fallback', async () => {
    workerPrefabLoadControl.unsafeRouteRoot = true;
    const ready = vi.fn();
    const layer = createRealmWorkerLayer({
      workers: [longOutboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      onModelReady: ready
    });
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());

    expect(layer.group.getObjectByName('realm-worker-wagon-models')?.children)
      .toHaveLength(0);
    expect(layer.getPresentationTelemetry()).toMatchObject({
      modelWorkerCount: 0,
      fallbackWorkerCount: 1,
      workerWheelDrivenCount: 0
    });
    layer.dispose();
  });

  it('rebalances the exact animation cap when model priority changes', async () => {
    const workers = Object.freeze(Array.from({ length: 6 }, (_value, index) => (
      Object.freeze({
        ...longOutboundWorker,
        workerId: `genesis-001-castle-${index + 20}-worker-01`,
        originCastleId: index + 20,
        originCastleName: `Hegemony Keep ${index + 20}`,
        ownedByViewer: index === 0,
        originCoord: longOutboundWorker.originCoord,
        destinationCoord: longOutboundWorker.destinationCoord
      }) satisfies RealmWorkerSceneRecord
    )));
    const ready = vi.fn();
    const layer = createRealmWorkerLayer({
      workers,
      hexSize: 1,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      onModelReady: ready
    });
    layer.update(5_000_000n);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    const before = layer.getPresentationTelemetry();
    expect(before).toMatchObject({
      modelWorkerCount: 6,
      animatedWorkerCount: 4
    });

    layer.setSelectedWorkerId(workers.at(-1)!.workerId);
    const after = layer.getPresentationTelemetry();
    expect(after.modelWorkerCount).toBe(6);
    expect(after.animatedWorkerCount).toBe(4);
    expect(after.workerModelPhaseRestorationCount)
      .toBeGreaterThan(before.workerModelPhaseRestorationCount);
    layer.dispose();
  });

  it('preserves terrain contact on a zero-time reconcile and converges with a bound', () => {
    let terrainHeight = 0;
    const layer = createRealmWorkerLayer({
      workers: [longOutboundWorker],
      hexSize: 1,
      heightAtWorld: () => terrainHeight
    });
    layer.update(5_000_000n);
    const before = layer.getCurrentPose(longOutboundWorker.workerId)!;
    terrainHeight = 10;
    layer.reconcile([Object.freeze({
      ...longOutboundWorker,
      revision: 2n
    })]);
    const sameTime = layer.getCurrentPose(longOutboundWorker.workerId)!;
    expect(sameTime.world.y).toBeCloseTo(before.world.y, 12);

    layer.update(5_100_000n);
    const converging = layer.getCurrentPose(longOutboundWorker.workerId)!;
    expect(converging.world.y - sameTime.world.y).toBeGreaterThan(0);
    expect(converging.world.y - sameTime.world.y).toBeLessThanOrEqual(
      0.2 + Number.EPSILON
    );
    layer.dispose();
  });

  it('snaps terrain presentation to truth when the timeline revision changes', () => {
    let terrainHeight = 0;
    const layer = createRealmWorkerLayer({
      workers: [longOutboundWorker],
      hexSize: 1,
      heightAtWorld: () => terrainHeight
    });
    layer.update(5_000_000n);
    terrainHeight = 10;
    layer.reconcile([Object.freeze({
      ...longOutboundWorker,
      timelineRevision: longOutboundWorker.timelineRevision + 1,
      revision: 2n
    })]);

    expect(layer.getCurrentPose(longOutboundWorker.workerId)?.world.y)
      .toBeCloseTo(10 + 0.018, 12);
    layer.dispose();
  });

  it('keeps a future authoritative journey scheduled under reduced motion', () => {
    const futureWorker = Object.freeze({
      ...longOutboundWorker,
      startedAtMicros: 2_000_000n,
      arrivesAtMicros: 12_000_000n,
      gatheringEndsAtMicros: 22_000_000n,
      returnsAtMicros: 32_000_000n
    }) satisfies RealmWorkerSceneRecord;
    const layer = createRealmWorkerLayer({
      workers: [futureWorker],
      hexSize: 1,
      heightAtWorld: () => 0,
      reducedMotion: true
    });
    const scheduled = layer.getCurrentPose(futureWorker.workerId)!;

    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.update(1_000_000n)).toBe(true);
    expect(layer.getCurrentPose(futureWorker.workerId)?.world).toEqual(
      scheduled.world
    );
    expect(layer.getPresentationTelemetry().locomotionMovingCount).toBe(0);

    expect(layer.update(3_000_000n)).toBe(true);
    expect(layer.getCurrentPose(futureWorker.workerId)?.forwardProgress)
      .toBeCloseTo(0.1, 8);
    expect(layer.getPresentationTelemetry().locomotionMovingCount).toBe(1);
    layer.dispose();
  });

  it('does not render continuously for an implausibly far-future journey', () => {
    const farFutureWorker = Object.freeze({
      ...longOutboundWorker,
      startedAtMicros: 60_000_000n,
      arrivesAtMicros: 70_000_000n,
      gatheringEndsAtMicros: 80_000_000n,
      returnsAtMicros: 90_000_000n
    }) satisfies RealmWorkerSceneRecord;
    const layer = createRealmWorkerLayer({
      workers: [farFutureWorker],
      hexSize: 1,
      heightAtWorld: () => 0,
      reducedMotion: true
    });

    expect(layer.hasMovingWorkers()).toBe(false);
    expect(layer.update(59_000_000n)).toBe(true);
    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.getPresentationTelemetry().locomotionMovingCount).toBe(0);
    layer.dispose();
  });

  it('advances the looping gathering Idle pose without reporting movement', async () => {
    const gathering = Object.freeze({
      ...longOutboundWorker,
      status: 'gathering' as const,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const ready = vi.fn();
    const layer = createRealmWorkerLayer({
      workers: [gathering],
      hexSize: 1,
      heightAtWorld: () => 0,
      quality: REALM_QUALITY_SPECS.balanced,
      baseUrl: '/',
      maxAnisotropy: 1,
      onModelReady: ready
    });
    layer.update(12_100_000n);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledOnce());
    const horseRoot = layer.group.getObjectByName('H_Root')!;
    const before = horseRoot.position.y;

    layer.update(12_600_000n);
    expect(horseRoot.position.y).not.toBeCloseTo(before, 8);
    expect(layer.getPresentationTelemetry()).toMatchObject({
      locomotionMovingCount: 0,
      locomotionGatheringIdleCount: 1,
      clipIdleCount: 1,
      renderedClipIdleCount: 1
    });
    expect(layer.hasMovingWorkers()).toBe(true);
    layer.dispose();
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

  it('releases every allocated resource when initial presentation setup fails', () => {
    const instanceDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose');
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    vi.spyOn(THREE.InstancedMesh.prototype, 'computeBoundingSphere')
      .mockImplementationOnce(() => {
        throw new Error('synthetic instance setup failure');
      });

    expect(() => createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    })).toThrow('synthetic instance setup failure');
    expect(instanceDispose).toHaveBeenCalledTimes(2);
    // Seven procedural source parts are disposed after their one-batch merge,
    // then all five live layer geometries are released by failure cleanup.
    expect(geometryDispose).toHaveBeenCalledTimes(12);
    expect(materialDispose).toHaveBeenCalledTimes(5);
  });

  it('keeps the Worker layer selectable on non-finite terrain samples', () => {
    const layer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => Number.NaN
    });

    expect(layer.getCurrentPose(outboundWorker.workerId)?.world.y)
      .toBeCloseTo(0.018, 12);
    expect(layer.getPresentationTelemetry().slopeAlignedWorkerCount).toBe(0);
    layer.dispose();
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

  it('leaves parked idle instance buffers and terrain sampling untouched', () => {
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

    expect(heightAtWorld).toHaveBeenCalledTimes(5);
    expect(layer.update(0n)).toBe(false);
    expect(layer.update(50n)).toBe(false);
    expect(heightAtWorld).toHaveBeenCalledTimes(5);
    expect(marker.instanceMatrix.version).toBe(markerMatrixVersion);
    expect(marker.instanceColor?.version).toBe(markerColorVersion);
    expect(pick.instanceMatrix.version).toBe(pickMatrixVersion);
    expect(marker.count).toBe(0);
    expect(pick.count).toBe(0);
    layer.setHoveredWorkerId(idleWorker.workerId);
    expect(heightAtWorld).toHaveBeenCalledTimes(5);
    expect(marker.instanceMatrix.version).toBe(markerMatrixVersion);
    expect(marker.instanceColor?.version).toBe(markerColorVersion);
    expect(pick.instanceMatrix.version).toBe(pickMatrixVersion);
    layer.dispose();
  });

  it('stops reporting movement once an interpolated worker reaches its endpoint', () => {
    const layer = createRealmWorkerLayer({
      workers: [outboundWorker],
      hexSize: 1,
      heightAtWorld: () => 0
    });

    layer.update(outboundWorker.startedAtMicros);
    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.update(200n)).toBe(true);
    expect(layer.hasMovingWorkers()).toBe(true);
    expect(layer.update(300n)).toBe(true);
    expect(layer.hasMovingWorkers()).toBe(false);
    // Bounded heading/contact presentation may finish after authoritative
    // translation stops, but it must never be reported as worker movement.
    layer.update(400n);
    expect(layer.getPresentationTelemetry().locomotionMovingCount).toBe(0);
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
    expect(layer.recommendedPositionUpdateIntervalMs()).toBe(
      REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS
    );
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
    const outboundCorner = resolveRealmWorkerRoutePose(outboundWorker, 180n, 1)!;
    const returning = Object.freeze({
      ...outboundWorker,
      status: 'returning' as const,
      returnStartedAtMicros: 300n,
      returnsAtMicros: 500n,
      returnStartProgressBasisPoints: 10_000,
      timelineRevision: 2,
      revision: 2n
    }) satisfies RealmWorkerSceneRecord;
    const returningCorner = resolveRealmWorkerRoutePose(returning, 420n, 1)!;

    expect(outboundCorner.segmentIndex).toBe(returningCorner.segmentIndex);
    expect(outboundCorner.segmentProgress).toBeCloseTo(returningCorner.segmentProgress, 8);
    expect(resolveRealmWorkerAnimationClip(outboundCorner)).toBe('Turn_Left');
    expect(resolveRealmWorkerAnimationClip(returningCorner)).toBe('Turn_Right');
  });

  it('falls back to the exact canonical polyline when smoothing leaves its corridor', () => {
    const canonical = Object.freeze([
      Object.freeze({ q: 0, r: 0 }),
      Object.freeze({ q: 1, r: 0 }),
      Object.freeze({ q: 2, r: 0 })
    ]);
    const raw = Object.freeze([
      Object.freeze({ x: 0, z: 0 }),
      Object.freeze({ x: Math.sqrt(3), z: 0 }),
      Object.freeze({ x: Math.sqrt(3) * 2, z: 0 })
    ]);
    const unsafe = Object.freeze([
      raw[0]!,
      Object.freeze({ x: Math.sqrt(3), z: 4 }),
      raw[2]!
    ]);
    const result = resolveCorridorSafeWorkerPolyline(raw, unsafe, canonical, 1);

    expect(result.usedFallback).toBe(true);
    expect(result.validationFailureCount).toBeGreaterThan(0);
    expect(result.points).toEqual(raw);
  });

  it('reports exact and normalized-time route contracts without changing authority', () => {
    expect(resolveRealmWorkerVisualRoute(outboundWorker, 1)?.contract).toBe('exact-match');
    const drifted = Object.freeze({
      ...outboundWorker,
      routeSteps: 3
    }) satisfies RealmWorkerSceneRecord;
    expect(resolveRealmWorkerVisualRoute(drifted, 1)?.contract).toBe('normalized-time');
    expect(resolveRealmWorkerCanonicalRoute(drifted)).toEqual(
      resolveRealmWorkerCanonicalRoute(outboundWorker)
    );
  });

  it('bounds terrain slope, preserves +Z travel orientation, and fails flat safely', () => {
    const orientation = resolveRealmWorkerTerrainOrientation(
      { x: 0, z: 0 },
      { x: 1, z: 0 },
      1,
      ({ x, z }) => x * 10 + z * 10
    );
    expect(orientation.terrainAligned).toBe(true);
    expect(orientation.slopeRadians).toBeLessThanOrEqual(
      THREE.MathUtils.degToRad(12) + Number.EPSILON
    );
    const localForward = new THREE.Vector3(0, 0, 1)
      .applyQuaternion(orientation.quaternion);
    expect(localForward.x).toBeGreaterThan(0.9);

    const safe = resolveRealmWorkerTerrainOrientation(
      { x: 0, z: 0 },
      { x: 0, z: 1 },
      1,
      () => Number.NaN
    );
    expect(safe).toMatchObject({
      terrainAligned: false,
      groundHeight: 0,
      slopeRadians: 0,
      normal: { x: 0, y: 1, z: 0 }
    });
  });

  it('cross-fades approved clips without restarting an unchanged action', () => {
    const mixer = new THREE.AnimationMixer(new THREE.Object3D());
    const idle = new THREE.AnimationClip('Idle', 1, []);
    const walk = new THREE.AnimationClip('Walk', 1, []);
    const start = new THREE.AnimationClip('Start', 1, []);
    const first = transitionRealmWorkerAnimation(mixer, undefined, undefined, idle);
    const repeated = transitionRealmWorkerAnimation(
      mixer,
      first.action,
      first.clipName,
      idle
    );
    const crossFade = vi.spyOn(first.action, 'crossFadeTo');
    const walking = transitionRealmWorkerAnimation(
      mixer,
      first.action,
      first.clipName,
      walk
    );
    const starting = transitionRealmWorkerAnimation(
      mixer,
      walking.action,
      walking.clipName,
      start,
      walking.clipEpochKey,
      Object.freeze({
        clipEpochKey: 'outbound-start:1',
        timeSeconds: 0.37,
        playbackRate: 1
      })
    );
    const continued = transitionRealmWorkerAnimation(
      mixer,
      starting.action,
      starting.clipName,
      start,
      starting.clipEpochKey,
      Object.freeze({
        clipEpochKey: 'outbound-start:1',
        timeSeconds: 0.63,
        playbackRate: 1
      })
    );
    const continuedTime = continued.action.time;
    const distinctEpoch = transitionRealmWorkerAnimation(
      mixer,
      continued.action,
      continued.clipName,
      start,
      continued.clipEpochKey,
      Object.freeze({
        clipEpochKey: 'return-start:2',
        timeSeconds: 0.12,
        playbackRate: 0.75
      })
    );

    expect(first.transitioned).toBe(true);
    expect(repeated).toMatchObject({
      transitioned: false,
      suppressedRestart: true
    });
    expect(crossFade).toHaveBeenCalledWith(walking.action, 0.16, false);
    expect(starting.action.loop).toBe(THREE.LoopOnce);
    expect(starting.action.clampWhenFinished).toBe(false);
    expect(continued.transitioned).toBe(false);
    expect(continued.suppressedRestart).toBe(true);
    expect(continuedTime).toBeCloseTo(0.63, 8);
    expect(distinctEpoch.transitioned).toBe(true);
    expect(distinctEpoch.action.time).toBeCloseTo(0.12, 8);
    expect(distinctEpoch.action.timeScale).toBeCloseTo(0.75, 8);
  });
});
