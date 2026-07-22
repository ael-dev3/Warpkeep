import * as THREE from 'three';

import {
  axialToWorld,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import type { RealmWorkerPublicPresentation } from './realmWorkerPresentation';

const MAX_RENDERED_REALM_WORKERS = 512;
const IDLE_RING_RADIUS = 0.82;
const SITE_RING_RADIUS = 0.34;
const WORKER_GROUND_LIFT = 0.19;

export type RealmWorkerSceneRecord = RealmWorkerPublicPresentation & Readonly<{
  originCoord: HexCoord;
  destinationCoord?: HexCoord;
}>;

export type RealmWorkerLayerHit = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  coord: HexCoord;
  distance: number;
}>;

export type RealmWorkerLayer = Readonly<{
  group: THREE.Group;
  canReconcile: (workers: readonly RealmWorkerSceneRecord[]) => boolean;
  reconcile: (workers: readonly RealmWorkerSceneRecord[]) => void;
  update: (nowMicros: bigint) => boolean;
  hasMovingWorkers: () => boolean;
  raycast: (raycaster: THREE.Raycaster) => RealmWorkerLayerHit | null;
  setHoveredWorkerId: (workerId: string | null) => void;
  setSelectedWorkerId: (workerId: string | null) => void;
  dispose: () => void;
}>;

type RealmWorkerLayerOptions = Readonly<{
  workers: readonly RealmWorkerSceneRecord[];
  hexSize: number;
  heightAtWorld: (world: HexWorldPosition) => number;
}>;

function finiteCoord(coord: HexCoord | undefined): coord is HexCoord {
  return coord !== undefined
    && Number.isSafeInteger(coord.q)
    && Number.isSafeInteger(coord.r);
}

function boundedProgress(now: bigint, start: bigint | undefined, end: bigint | undefined) {
  if (start === undefined || end === undefined || end <= start) return end !== undefined && now >= end ? 1 : 0;
  if (now <= start) return 0;
  if (now >= end) return 1;
  return Number(now - start) / Number(end - start);
}

function ordinalOffset(ordinal: number, radius: number) {
  const angle = -Math.PI * 0.5 + (ordinal - 1) * Math.PI * 0.5;
  return Object.freeze({
    x: Math.cos(angle) * radius,
    z: Math.sin(angle) * radius
  });
}

function offsetWorld(coord: HexCoord, ordinal: number, radius: number, hexSize: number) {
  const center = axialToWorld(coord, hexSize);
  const offset = ordinalOffset(ordinal, radius * hexSize);
  return Object.freeze({ x: center.x + offset.x, z: center.z + offset.z });
}

/** Resolve only public world position; no owner-only assignment identity enters the scene. */
export function resolveRealmWorkerWorldPosition(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint,
  hexSize: number
): HexWorldPosition {
  const origin = offsetWorld(worker.originCoord, worker.ordinal, IDLE_RING_RADIUS, hexSize);
  if (!finiteCoord(worker.destinationCoord) || worker.status === 'idle') return origin;
  const destination = offsetWorld(
    worker.destinationCoord,
    worker.ordinal,
    SITE_RING_RADIUS,
    hexSize
  );
  if (worker.status === 'gathering') return destination;
  if (worker.status === 'outbound') {
    const progress = boundedProgress(nowMicros, worker.startedAtMicros, worker.arrivesAtMicros);
    return Object.freeze({
      x: THREE.MathUtils.lerp(origin.x, destination.x, progress),
      z: THREE.MathUtils.lerp(origin.z, destination.z, progress)
    });
  }
  const returnStartProgress = Math.min(
    1,
    Math.max(0, (worker.returnStartProgressBasisPoints ?? 10_000) / 10_000)
  );
  const returnOrigin = Object.freeze({
    x: THREE.MathUtils.lerp(origin.x, destination.x, returnStartProgress),
    z: THREE.MathUtils.lerp(origin.z, destination.z, returnStartProgress)
  });
  const progress = boundedProgress(
    nowMicros,
    worker.returnStartedAtMicros,
    worker.returnsAtMicros
  );
  return Object.freeze({
    x: THREE.MathUtils.lerp(returnOrigin.x, origin.x, progress),
    z: THREE.MathUtils.lerp(returnOrigin.z, origin.z, progress)
  });
}

function validWorkerCatalog(workers: readonly RealmWorkerSceneRecord[]) {
  if (workers.length > MAX_RENDERED_REALM_WORKERS) return false;
  const ids = new Set<string>();
  for (const worker of workers) {
    if (
      typeof worker.workerId !== 'string'
      || worker.workerId.length === 0
      || ids.has(worker.workerId)
      || !Number.isSafeInteger(worker.ordinal)
      || worker.ordinal < 1
      || worker.ordinal > 4
      || !Number.isSafeInteger(worker.originCastleId)
      || worker.originCastleId <= 0
      || !finiteCoord(worker.originCoord)
      || (worker.status !== 'idle' && !finiteCoord(worker.destinationCoord))
    ) return false;
    ids.add(worker.workerId);
  }
  return true;
}

function sameStaticWorkerCatalog(
  current: readonly RealmWorkerSceneRecord[],
  next: readonly RealmWorkerSceneRecord[]
) {
  if (!validWorkerCatalog(next) || current.length !== next.length) return false;
  const nextById = new Map(next.map((worker) => [worker.workerId, worker] as const));
  return current.every((worker) => {
    const candidate = nextById.get(worker.workerId);
    return candidate !== undefined
      && candidate.ordinal === worker.ordinal
      && candidate.originCastleId === worker.originCastleId
      && candidate.originCoord.q === worker.originCoord.q
      && candidate.originCoord.r === worker.originCoord.r;
  });
}

export function createRealmWorkerLayer(options: RealmWorkerLayerOptions): RealmWorkerLayer {
  if (!validWorkerCatalog(options.workers)) throw new Error('REALM_WORKER_CATALOG_INVALID');
  const workers = [...options.workers].sort((left, right) => (
    left.originCastleId - right.originCastleId
    || left.ordinal - right.ordinal
    || left.workerId.localeCompare(right.workerId)
  ));
  const group = new THREE.Group();
  group.name = 'realm-workers';
  const markerGeometry = new THREE.CylinderGeometry(0.075, 0.12, 0.3, 6, 1);
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: '#ffffff',
    roughness: 0.54,
    metalness: 0.05,
    vertexColors: true
  });
  const markerMesh = new THREE.InstancedMesh(markerGeometry, markerMaterial, workers.length);
  markerMesh.name = 'realm-worker-markers';
  markerMesh.castShadow = false;
  markerMesh.receiveShadow = false;
  markerMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const pickGeometry = new THREE.SphereGeometry(0.24, 8, 5);
  const pickMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false
  });
  const pickMesh = new THREE.InstancedMesh(pickGeometry, pickMaterial, workers.length);
  pickMesh.name = 'realm-worker-pick-volumes';
  pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pickMesh.renderOrder = -1;
  group.add(markerMesh, pickMesh);

  const recordsById = new Map(workers.map((worker) => [worker.workerId, worker] as const));
  const positions = new Map<string, Readonly<{ x: number; y: number; z: number }>>();
  const styles = new Map<string, 'owned' | 'peer' | 'hovered' | 'selected'>();
  const movingWorkerIds = new Set<string>();
  const dirtyPoseWorkerIds = new Set(workers.map((worker) => worker.workerId));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  let selectedWorkerId: string | null = null;
  let hoveredWorkerId: string | null = null;
  let lastNowMicros = 0n;
  let disposed = false;
  const disposeLayer = () => {
    if (disposed) return;
    disposed = true;
    const cleanupSteps = [
      () => group.remove(markerMesh, pickMesh),
      () => markerMesh.dispose(),
      () => pickMesh.dispose(),
      () => markerGeometry.dispose(),
      () => markerMaterial.dispose(),
      () => pickGeometry.dispose(),
      () => pickMaterial.dispose()
    ];
    for (const cleanup of cleanupSteps) {
      try {
        cleanup();
      } catch {
        // A single GPU/browser disposal failure must not strand the rest.
      }
    }
    recordsById.clear();
    positions.clear();
    styles.clear();
    movingWorkerIds.clear();
    dirtyPoseWorkerIds.clear();
  };

  const isMovingAt = (worker: RealmWorkerSceneRecord, nowMicros: bigint) => {
    if (worker.status === 'outbound') {
      return worker.arrivesAtMicros !== undefined && nowMicros < worker.arrivesAtMicros;
    }
    if (worker.status === 'returning') {
      return worker.returnsAtMicros !== undefined && nowMicros < worker.returnsAtMicros;
    }
    return false;
  };

  const sameDynamicWorker = (
    current: RealmWorkerSceneRecord,
    next: RealmWorkerSceneRecord
  ) => current.status === next.status
    && current.resourceKind === next.resourceKind
    && current.siteId === next.siteId
    && current.startedAtMicros === next.startedAtMicros
    && current.arrivesAtMicros === next.arrivesAtMicros
    && current.gatheringEndsAtMicros === next.gatheringEndsAtMicros
    && current.returnStartedAtMicros === next.returnStartedAtMicros
    && current.returnsAtMicros === next.returnsAtMicros
    && current.routeSteps === next.routeSteps
    && current.returnStartProgressBasisPoints === next.returnStartProgressBasisPoints
    && current.timelineRevision === next.timelineRevision
    && current.revision === next.revision
    && current.ownedByViewer === next.ownedByViewer
    && current.destinationCoord?.q === next.destinationCoord?.q
    && current.destinationCoord?.r === next.destinationCoord?.r;

  const apply = (nowMicros: bigint) => {
    let changed = false;
    let markerMatricesChanged = false;
    let pickMatricesChanged = false;
    let markerColorsChanged = false;
    workers.forEach((identity, index) => {
      const worker = recordsById.get(identity.workerId)!;
      const wasMoving = movingWorkerIds.has(worker.workerId);
      const moving = isMovingAt(worker, nowMicros);
      const dirty = dirtyPoseWorkerIds.has(worker.workerId);
      let workerPosition = positions.get(worker.workerId);
      let positionChanged = false;
      if (workerPosition === undefined || dirty || wasMoving || moving) {
        const world = resolveRealmWorkerWorldPosition(worker, nowMicros, options.hexSize);
        const groundY = options.heightAtWorld(world);
        if (!Number.isFinite(groundY)) throw new Error('REALM_WORKER_GROUND_INVALID');
        const next = Object.freeze({ x: world.x, y: groundY + WORKER_GROUND_LIFT, z: world.z });
        positionChanged = workerPosition === undefined
          || Math.abs(workerPosition.x - next.x) > 0.000_01
          || Math.abs(workerPosition.y - next.y) > 0.000_01
          || Math.abs(workerPosition.z - next.z) > 0.000_01;
        if (positionChanged) {
          workerPosition = next;
          positions.set(worker.workerId, next);
          changed = true;
        }
      }
      if (moving) movingWorkerIds.add(worker.workerId);
      else movingWorkerIds.delete(worker.workerId);
      if (!workerPosition) return;

      const selected = selectedWorkerId === worker.workerId;
      const hovered = hoveredWorkerId === worker.workerId;
      const nextStyle = selected
        ? 'selected'
        : hovered
          ? 'hovered'
          : worker.ownedByViewer
            ? 'owned'
            : 'peer';
      const styleChanged = styles.get(worker.workerId) !== nextStyle;
      if (styleChanged) styles.set(worker.workerId, nextStyle);
      position.set(workerPosition.x, workerPosition.y, workerPosition.z);
      const markerScale = selected ? 1.38 : hovered ? 1.2 : 1;
      if (positionChanged || styleChanged) {
        scale.setScalar(markerScale * options.hexSize);
        matrix.compose(position, quaternion, scale);
        markerMesh.setMatrixAt(index, matrix);
        markerMatricesChanged = true;
        changed = true;
      }
      if (positionChanged) {
        scale.setScalar(options.hexSize);
        matrix.compose(position, quaternion, scale);
        pickMesh.setMatrixAt(index, matrix);
        pickMatricesChanged = true;
      }
      if (styleChanged) {
        color.set(selected
          ? '#fff3b5'
          : hovered
            ? '#c9f3dc'
            : worker.ownedByViewer
              ? '#e1b95f'
              : '#8e7bbd');
        markerMesh.setColorAt(index, color);
        markerColorsChanged = true;
      }
    });
    dirtyPoseWorkerIds.clear();
    if (markerMatricesChanged) {
      markerMesh.instanceMatrix.needsUpdate = true;
      markerMesh.computeBoundingSphere();
    }
    if (pickMatricesChanged) {
      pickMesh.instanceMatrix.needsUpdate = true;
      pickMesh.computeBoundingSphere();
    }
    if (markerColorsChanged && markerMesh.instanceColor) {
      markerMesh.instanceColor.needsUpdate = true;
    }
    return changed;
  };
  try {
    apply(lastNowMicros);
  } catch (error) {
    disposeLayer();
    throw error;
  }

  const updateSelection = () => {
    if (disposed) return;
    apply(lastNowMicros);
  };

  return Object.freeze({
    group,
    canReconcile: (next) => !disposed && sameStaticWorkerCatalog(workers, next),
    reconcile: (next) => {
      if (disposed || !sameStaticWorkerCatalog(workers, next)) return;
      for (const worker of next) {
        const current = recordsById.get(worker.workerId);
        if (!current || !sameDynamicWorker(current, worker)) {
          dirtyPoseWorkerIds.add(worker.workerId);
        }
        recordsById.set(worker.workerId, worker);
      }
      apply(lastNowMicros);
    },
    update: (nowMicros) => {
      if (disposed || typeof nowMicros !== 'bigint' || nowMicros < 0n) return false;
      lastNowMicros = nowMicros;
      return apply(nowMicros);
    },
    hasMovingWorkers: () => {
      if (disposed) return false;
      for (const worker of recordsById.values()) {
        if (isMovingAt(worker, lastNowMicros)) return true;
      }
      return false;
    },
    raycast: (raycaster) => {
      if (disposed || workers.length === 0) return null;
      const intersection = raycaster.intersectObject(pickMesh, false)[0];
      const instanceId = intersection?.instanceId;
      if (intersection === undefined || instanceId === undefined || !Number.isSafeInteger(instanceId)) {
        return null;
      }
      const identity = workers[instanceId];
      if (!identity || !Number.isFinite(intersection.distance) || intersection.distance < 0) return null;
      const worker = recordsById.get(identity.workerId);
      const workerPosition = positions.get(identity.workerId);
      if (!worker || !workerPosition) return null;
      return Object.freeze({
        workerId: worker.workerId,
        workerOrdinal: worker.ordinal,
        originCastleId: worker.originCastleId,
        coord: Object.freeze(worldToNearestAxial(workerPosition, options.hexSize)),
        distance: intersection.distance
      });
    },
    setHoveredWorkerId: (workerId) => {
      if (disposed || hoveredWorkerId === workerId) return;
      hoveredWorkerId = workerId !== null && recordsById.has(workerId) ? workerId : null;
      updateSelection();
    },
    setSelectedWorkerId: (workerId) => {
      if (disposed || selectedWorkerId === workerId) return;
      selectedWorkerId = workerId !== null && recordsById.has(workerId) ? workerId : null;
      updateSelection();
    },
    dispose: disposeLayer
  });
}
