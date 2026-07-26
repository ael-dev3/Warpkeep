import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

import {
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import {
  HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS,
  acquireHegemonyExpeditionPrefab,
  type HegemonyExpeditionLod,
  type HegemonyExpeditionModel,
  type HegemonyExpeditionPrefabLease
} from './loadHegemonyExpeditionAssets';
import {
  normalizeRealmUsername,
  safeRealmProfileImageUrl
} from './realmCastlePresentation';
import type { RealmQuality, RealmQualitySpec } from './realmQuality';
import {
  createRealmWorkerRouteLayer,
  type RealmWorkerRouteLayerTelemetry
} from './realmWorkerRouteLayer';
import {
  resolveRealmWorkerAnimationClip,
  resolveRealmWorkerRoutePose,
  type RealmWorkerRoutePose,
  type RealmWorkerSceneRecord
} from './realmWorkerRoutePresentation';
import { normalizePublicProfileText } from '../../security/publicProfileText';

export type { RealmWorkerSceneRecord } from './realmWorkerRoutePresentation';

const MAX_RENDERED_REALM_WORKERS = 512;
const MAX_VISIBLE_WORKER_FALLBACKS = 128;
const WORKER_GROUND_LIFT = 0.018;
const FALLBACK_GROUND_LIFT = 0.13;
const WAGON_TARGET_FOOTPRINT = 0.64;

export const REALM_WORKER_MODEL_BUDGET = Object.freeze({
  high: Object.freeze({ models: 12, animations: 4 }),
  balanced: Object.freeze({ models: 8, animations: 4 }),
  reduced: Object.freeze({ models: 4, animations: 0 })
} satisfies Readonly<Record<RealmQuality, Readonly<{
  models: number;
  animations: number;
}>>>);

export const REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS = 500;
export const REALM_WORKER_STANDARD_POSITION_INTERVAL_MS = 42;

export type RealmWorkerCurrentPose = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  profile?: RealmWorkerSceneRecord['profile'];
  world: Readonly<{ x: number; y: number; z: number }>;
  coord: HexCoord;
  yaw: number;
  direction: RealmWorkerRoutePose['direction'];
  forwardProgress: number;
  phaseProgress: number;
}>;

export type RealmWorkerPresenceRecord = RealmWorkerCurrentPose & Readonly<{
  resourceKind: RealmWorkerSceneRecord['resourceKind'];
  siteId: RealmWorkerSceneRecord['siteId'];
  ownedByViewer: boolean;
}>;

export type RealmWorkerLayerHit = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  coord: HexCoord;
  world: Readonly<{ x: number; y: number; z: number }>;
  distance: number;
}>;

export type RealmWorkerLayerTelemetry = Readonly<{
  publicWorkerCount: number;
  presentedWorkerCount: number;
  modelWorkerCount: number;
  animatedWorkerCount: number;
  fallbackWorkerCount: number;
  routeMismatchCount: number;
  route: RealmWorkerRouteLayerTelemetry;
}>;

export type RealmWorkerLayer = Readonly<{
  group: THREE.Group;
  canReconcile: (workers: readonly RealmWorkerSceneRecord[]) => boolean;
  reconcile: (workers: readonly RealmWorkerSceneRecord[]) => void;
  update: (nowMicros: bigint) => boolean;
  hasMovingWorkers: () => boolean;
  recommendedPositionUpdateIntervalMs: () => number;
  raycast: (raycaster: THREE.Raycaster) => RealmWorkerLayerHit | null;
  getCurrentPose: (workerId: string) => RealmWorkerCurrentPose | undefined;
  /**
   * Public, sanitized records for a DOM projection lane. Consumers project
   * `world` with the scene camera and attach the existing accessible PFP UI.
   */
  getPresenceRecords: () => readonly RealmWorkerPresenceRecord[];
  getPresentationTelemetry: () => RealmWorkerLayerTelemetry;
  setHoveredWorkerId: (workerId: string | null) => void;
  setSelectedWorkerId: (workerId: string | null) => void;
  dispose: () => void;
}>;

export type RealmWorkerLayerOptions = Readonly<{
  workers: readonly RealmWorkerSceneRecord[];
  hexSize: number;
  heightAtWorld: (world: HexWorldPosition) => number;
  quality?: RealmQualitySpec;
  baseUrl?: string;
  maxAnisotropy?: number;
  reducedMotion?: boolean;
  onModelReady?: () => void;
}>;

type WorkerModelVisual = {
  workerId: string;
  root: THREE.Group;
  mixer?: THREE.AnimationMixer;
  action?: THREE.AnimationAction;
  clipName?: string;
  animated: boolean;
};

function finiteCoord(coord: HexCoord | undefined): coord is HexCoord {
  return coord !== undefined
    && Number.isSafeInteger(coord.q)
    && Number.isSafeInteger(coord.r);
}

export function isValidRealmWorkerSceneCatalog(
  workers: readonly RealmWorkerSceneRecord[]
) {
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
  if (!isValidRealmWorkerSceneCatalog(next) || current.length !== next.length) return false;
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

function sameProfile(
  left: RealmWorkerSceneRecord['profile'],
  right: RealmWorkerSceneRecord['profile']
) {
  return left?.canonicalUsername === right?.canonicalUsername
    && left?.displayName === right?.displayName
    && left?.pfpUrl === right?.pfpUrl
    && left?.publicBio === right?.publicBio
    && left?.communityStatsVisible === right?.communityStatsVisible;
}

function sameDynamicWorker(
  current: RealmWorkerSceneRecord,
  next: RealmWorkerSceneRecord
) {
  return current.status === next.status
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
    && current.destinationCoord?.r === next.destinationCoord?.r
    && sameProfile(current.profile, next.profile);
}

function isMovingAt(worker: RealmWorkerSceneRecord, nowMicros: bigint) {
  if (worker.status === 'outbound') {
    return worker.arrivesAtMicros !== undefined && nowMicros < worker.arrivesAtMicros;
  }
  if (worker.status === 'returning') {
    return worker.returnsAtMicros !== undefined && nowMicros < worker.returnsAtMicros;
  }
  return false;
}

function workerPriority(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
) {
  if (worker.workerId === selectedWorkerId) return 0;
  if (worker.workerId === hoveredWorkerId) return 1;
  if (worker.ownedByViewer) return 2;
  if (worker.status !== 'idle') return 3;
  return 4;
}

function orderedWorkers(
  records: Iterable<RealmWorkerSceneRecord>,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
) {
  return [...records].sort((left, right) => (
    workerPriority(left, selectedWorkerId, hoveredWorkerId)
      - workerPriority(right, selectedWorkerId, hoveredWorkerId)
    || left.originCastleId - right.originCastleId
    || left.ordinal - right.ordinal
    || left.workerId.localeCompare(right.workerId)
  ));
}

export function realmWorkerWagonLodForQuality(
  quality: RealmQuality
): HegemonyExpeditionLod {
  if (quality === 'high') return 'high';
  if (quality === 'balanced') return 'balanced';
  return 'compact';
}

/** Compatibility helper for callers that need only public world position. */
export function resolveRealmWorkerWorldPosition(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint,
  hexSize: number
): HexWorldPosition {
  const pose = resolveRealmWorkerRoutePose(worker, nowMicros, hexSize);
  if (!pose) throw new Error('REALM_WORKER_ROUTE_MISMATCH');
  return pose.world;
}

function workerCurrentPose(
  worker: RealmWorkerSceneRecord,
  pose: RealmWorkerRoutePose,
  groundY: number
): RealmWorkerCurrentPose {
  let profile: RealmWorkerSceneRecord['profile'];
  if (worker.profile && typeof worker.profile.communityStatsVisible === 'boolean') {
    const canonicalUsername = normalizeRealmUsername(worker.profile.canonicalUsername);
    const displayName = normalizePublicProfileText(worker.profile.displayName, 80);
    const pfpUrl = safeRealmProfileImageUrl(worker.profile.pfpUrl);
    const publicBio = normalizePublicProfileText(worker.profile.publicBio, 320);
    profile = Object.freeze({
      ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
      ...(displayName === undefined ? {} : { displayName }),
      ...(pfpUrl === undefined ? {} : { pfpUrl }),
      ...(publicBio === undefined ? {} : { publicBio }),
      communityStatsVisible: worker.profile.communityStatsVisible
    });
  }
  return Object.freeze({
    workerId: worker.workerId,
    workerOrdinal: worker.ordinal,
    originCastleId: worker.originCastleId,
    ...(profile === undefined ? {} : { profile }),
    world: Object.freeze({
      x: pose.world.x,
      y: groundY + WORKER_GROUND_LIFT,
      z: pose.world.z
    }),
    coord: pose.coord,
    yaw: pose.yaw,
    direction: pose.direction,
    forwardProgress: pose.forwardProgress,
    phaseProgress: pose.phaseProgress
  });
}

function chooseClip(
  model: HegemonyExpeditionModel,
  pose: RealmWorkerRoutePose
) {
  const preferred = resolveRealmWorkerAnimationClip(pose);
  return model.clips.find((clip) => clip.name === preferred)
    ?? model.clips.find((clip) => clip.name === 'Walk')
    ?? model.clips.find((clip) => clip.name === 'Idle');
}

export function createRealmWorkerLayer(options: RealmWorkerLayerOptions): RealmWorkerLayer {
  if (
    !isValidRealmWorkerSceneCatalog(options.workers)
    || !Number.isFinite(options.hexSize)
    || options.hexSize <= 0
  ) throw new Error('REALM_WORKER_CATALOG_INVALID');

  const identities = [...options.workers].sort((left, right) => (
    left.originCastleId - right.originCastleId
    || left.ordinal - right.ordinal
    || left.workerId.localeCompare(right.workerId)
  ));
  const recordsById = new Map(identities.map((worker) => [worker.workerId, worker] as const));
  const group = new THREE.Group();
  group.name = 'realm-workers';
  const routeLayer = createRealmWorkerRouteLayer({
    workers: identities,
    hexSize: options.hexSize,
    heightAtWorld: options.heightAtWorld
  });
  group.add(routeLayer.group);

  const fallbackCapacity = Math.min(identities.length, MAX_VISIBLE_WORKER_FALLBACKS);
  const fallbackGeometry = new THREE.BoxGeometry(0.3, 0.2, 0.52);
  const fallbackMaterial = new THREE.MeshStandardMaterial({
    color: '#b88b45',
    roughness: 0.76,
    metalness: 0.03,
    vertexColors: true
  });
  const fallbackMesh = new THREE.InstancedMesh(
    fallbackGeometry,
    fallbackMaterial,
    fallbackCapacity
  );
  fallbackMesh.name = 'realm-worker-wagon-fallbacks';
  fallbackMesh.castShadow = false;
  fallbackMesh.receiveShadow = false;
  fallbackMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);

  const pickGeometry = new THREE.BoxGeometry(0.44, 0.42, 0.72);
  const pickMaterial = new THREE.MeshBasicMaterial({
    color: '#ffffff',
    transparent: true,
    opacity: 0,
    depthWrite: false,
    colorWrite: false
  });
  const pickMesh = new THREE.InstancedMesh(pickGeometry, pickMaterial, fallbackCapacity);
  pickMesh.name = 'realm-worker-pick-volumes';
  pickMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pickMesh.renderOrder = -1;
  group.add(fallbackMesh, pickMesh);

  const modelGroup = new THREE.Group();
  modelGroup.name = 'realm-worker-wagon-models';
  group.add(modelGroup);

  const posesById = new Map<string, RealmWorkerCurrentPose>();
  const routePoseById = new Map<string, RealmWorkerRoutePose>();
  const visualSignaturesById = new Map<string, string>();
  const pickSignaturesById = new Map<string, string>();
  const routeMismatchWorkerIds = new Set<string>();
  const visibleWorkerIds: string[] = [];
  const pickWorkerIds: string[] = [];
  const modelVisuals = new Map<string, WorkerModelVisual>();
  const movingWorkerIds = new Set<string>();
  const dirtyWorkerIds = new Set(identities.map((worker) => worker.workerId));
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  const zeroScale = new THREE.Vector3(0, 0, 0);
  const modelAbortController = new AbortController();
  const reducedMotion = options.reducedMotion === true;
  const qualityId = options.quality?.id ?? 'balanced';
  const modelBudget = REALM_WORKER_MODEL_BUDGET[qualityId];
  let selectedWorkerId: string | null = null;
  let hoveredWorkerId: string | null = null;
  let loadedModel: HegemonyExpeditionModel | undefined;
  let modelLease: HegemonyExpeditionPrefabLease | undefined;
  let lastNowMicros = 0n;
  let disposed = false;
  let routeMismatchCount = 0;

  const removeModelVisual = (workerId: string) => {
    const visual = modelVisuals.get(workerId);
    if (!visual) return;
    visual.action?.stop();
    visual.mixer?.stopAllAction();
    modelGroup.remove(visual.root);
    modelVisuals.delete(workerId);
  };

  const removeAllModelVisuals = () => {
    for (const workerId of [...modelVisuals.keys()]) removeModelVisual(workerId);
  };

  const disposeLayer = () => {
    if (disposed) return;
    disposed = true;
    modelAbortController.abort();
    removeAllModelVisuals();
    try {
      modelLease?.release();
    } catch {
      // Shared prefab release is best-effort during scene teardown.
    }
    modelLease = undefined;
    loadedModel = undefined;
    const cleanupSteps = [
      () => group.remove(routeLayer.group, fallbackMesh, pickMesh, modelGroup),
      () => routeLayer.dispose(),
      () => fallbackMesh.dispose(),
      () => pickMesh.dispose(),
      () => fallbackGeometry.dispose(),
      () => fallbackMaterial.dispose(),
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
    posesById.clear();
    routePoseById.clear();
    visualSignaturesById.clear();
    pickSignaturesById.clear();
    routeMismatchWorkerIds.clear();
    movingWorkerIds.clear();
    dirtyWorkerIds.clear();
    visibleWorkerIds.length = 0;
    pickWorkerIds.length = 0;
  };

  const desiredModelWorkerIds = () => {
    if (!loadedModel || modelBudget.models <= 0) return [];
    return orderedWorkers(
      visibleWorkerIds
        .map((workerId) => recordsById.get(workerId))
        .filter((worker): worker is RealmWorkerSceneRecord => (
          worker !== undefined && routePoseById.has(worker.workerId)
        )),
      selectedWorkerId,
      hoveredWorkerId
    ).slice(0, modelBudget.models).map((worker) => worker.workerId);
  };

  const syncModelVisuals = () => {
    if (!loadedModel) {
      removeAllModelVisuals();
      return;
    }
    const desired = desiredModelWorkerIds();
    const desiredSet = new Set(desired);
    for (const workerId of [...modelVisuals.keys()]) {
      if (!desiredSet.has(workerId)) removeModelVisual(workerId);
    }
    desired.forEach((workerId, index) => {
      if (modelVisuals.has(workerId)) return;
      const root = cloneSkinned(loadedModel!.root) as THREE.Group;
      root.name = `realm-worker-wagon-${workerId}`;
      const animated = !reducedMotion && index < modelBudget.animations;
      const mixer = animated ? new THREE.AnimationMixer(root) : undefined;
      const visual: WorkerModelVisual = { workerId, root, mixer, animated };
      modelVisuals.set(workerId, visual);
      modelGroup.add(root);
      dirtyWorkerIds.add(workerId);
    });
  };

  const syncVisibleWorkerIds = () => {
    const ordered = orderedWorkers(recordsById.values(), selectedWorkerId, hoveredWorkerId)
      .slice(0, fallbackCapacity)
      .map((worker) => worker.workerId);
    const signature = ordered.join('|');
    if (signature === visibleWorkerIds.join('|')) return false;
    visibleWorkerIds.splice(0, visibleWorkerIds.length, ...ordered);
    pickWorkerIds.splice(0, pickWorkerIds.length, ...ordered);
    visualSignaturesById.clear();
    pickSignaturesById.clear();
    dirtyWorkerIds.clear();
    for (const workerId of ordered) dirtyWorkerIds.add(workerId);
    syncModelVisuals();
    return true;
  };

  const updateVisualAnimation = (
    visual: WorkerModelVisual,
    pose: RealmWorkerRoutePose
  ) => {
    if (!visual.mixer || !loadedModel) return;
    const clip = chooseClip(loadedModel, pose);
    if (!clip || visual.clipName === clip.name) return;
    visual.action?.stop();
    const action = visual.mixer.clipAction(clip);
    action.reset();
    action.play();
    visual.action = action;
    visual.clipName = clip.name;
  };

  const apply = (nowMicros: bigint) => {
    let changed = false;
    let fallbackMatricesChanged = false;
    let fallbackColorsChanged = false;
    let pickMatricesChanged = false;
    const previouslyMovingWorkerIds = new Set(movingWorkerIds);
    movingWorkerIds.clear();

    for (const worker of recordsById.values()) {
      const moving = isMovingAt(worker, nowMicros);
      if (moving) movingWorkerIds.add(worker.workerId);
      const shouldResolve = dirtyWorkerIds.has(worker.workerId)
        || moving
        || previouslyMovingWorkerIds.has(worker.workerId)
        || (!routePoseById.has(worker.workerId)
          && !routeMismatchWorkerIds.has(worker.workerId));
      if (!shouldResolve) continue;
      const pose = resolveRealmWorkerRoutePose(worker, nowMicros, options.hexSize);
      if (!pose) {
        posesById.delete(worker.workerId);
        routePoseById.delete(worker.workerId);
        if (worker.status !== 'idle') routeMismatchWorkerIds.add(worker.workerId);
        continue;
      }
      const groundY = options.heightAtWorld(pose.world);
      if (!Number.isFinite(groundY)) throw new Error('REALM_WORKER_GROUND_INVALID');
      posesById.set(worker.workerId, workerCurrentPose(worker, pose, groundY));
      routePoseById.set(worker.workerId, pose);
      routeMismatchWorkerIds.delete(worker.workerId);
    }
    routeMismatchCount = routeMismatchWorkerIds.size;
    syncModelVisuals();

    visibleWorkerIds.forEach((workerId, index) => {
      const worker = recordsById.get(workerId);
      const current = posesById.get(workerId);
      const pose = routePoseById.get(workerId);
      const selected = selectedWorkerId === workerId;
      const hovered = hoveredWorkerId === workerId;
      const modelVisual = modelVisuals.get(workerId);
      const visualSignature = current && pose && worker
        ? [
          current.world.x.toFixed(5),
          current.world.y.toFixed(5),
          current.world.z.toFixed(5),
          current.yaw.toFixed(5),
          selected ? 1 : 0,
          hovered ? 1 : 0,
          worker.ownedByViewer ? 1 : 0,
          modelVisual ? 1 : 0
        ].join(':')
        : 'hidden';
      const pickSignature = current
        ? [
          current.world.x.toFixed(5),
          current.world.y.toFixed(5),
          current.world.z.toFixed(5),
          current.yaw.toFixed(5)
        ].join(':')
        : 'hidden';
      if (visualSignaturesById.get(workerId) === visualSignature) return;
      visualSignaturesById.set(workerId, visualSignature);
      if (!worker || !current || !pose) {
        matrix.compose(position.set(0, -1000, 0), quaternion.identity(), zeroScale);
        fallbackMesh.setMatrixAt(index, matrix);
        fallbackMatricesChanged = true;
        if (pickSignaturesById.get(workerId) !== pickSignature) {
          pickSignaturesById.set(workerId, pickSignature);
          pickMesh.setMatrixAt(index, matrix);
          pickMatricesChanged = true;
        }
        return;
      }

      const styleScale = selected ? 1.12 : hovered ? 1.06 : 1;
      position.set(current.world.x, current.world.y, current.world.z);
      quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, current.yaw);

      if (modelVisual) {
        modelVisual.root.visible = true;
        modelVisual.root.position.copy(position);
        modelVisual.root.quaternion.copy(quaternion);
        modelVisual.root.scale.setScalar(options.hexSize * styleScale);
        updateVisualAnimation(modelVisual, pose);
        matrix.compose(position, quaternion, zeroScale);
      } else {
        position.y += FALLBACK_GROUND_LIFT;
        scale.setScalar(options.hexSize * styleScale);
        matrix.compose(position, quaternion, scale);
      }
      fallbackMesh.setMatrixAt(index, matrix);
      fallbackMatricesChanged = true;

      if (pickSignaturesById.get(workerId) !== pickSignature) {
        pickSignaturesById.set(workerId, pickSignature);
        position.set(current.world.x, current.world.y + 0.3 * options.hexSize, current.world.z);
        scale.setScalar(options.hexSize);
        matrix.compose(position, quaternion, scale);
        pickMesh.setMatrixAt(index, matrix);
        pickMatricesChanged = true;
      }

      color.set(selected
        ? '#fff3b5'
        : hovered
          ? '#c9f3dc'
          : worker.ownedByViewer
            ? '#d9ad53'
            : '#74658f');
      fallbackMesh.setColorAt(index, color);
      fallbackColorsChanged = true;
      changed = true;
    });

    fallbackMesh.count = visibleWorkerIds.length;
    pickMesh.count = pickWorkerIds.length;
    dirtyWorkerIds.clear();
    if (fallbackMatricesChanged) {
      fallbackMesh.instanceMatrix.needsUpdate = true;
      fallbackMesh.computeBoundingSphere();
    }
    if (pickMatricesChanged) {
      pickMesh.instanceMatrix.needsUpdate = true;
      pickMesh.computeBoundingSphere();
    }
    if (fallbackColorsChanged && fallbackMesh.instanceColor) {
      fallbackMesh.instanceColor.needsUpdate = true;
    }
    return changed;
  };

  try {
    syncVisibleWorkerIds();
    apply(lastNowMicros);
  } catch (error) {
    disposeLayer();
    throw error;
  }

  if (options.baseUrl && options.quality) {
    const lod = realmWorkerWagonLodForQuality(options.quality.id);
    void acquireHegemonyExpeditionPrefab({
      label: `Hegemony Supply Wagon ${lod}`,
      asset: HEGEMONY_SUPPLY_WAGON_RUNTIME_ASSETS[lod],
      materialRole: 'wagon',
      baseUrl: options.baseUrl,
      targetFootprintDiameter: WAGON_TARGET_FOOTPRINT,
      dynamicShadows: options.quality.dynamicShadows,
      maxAnisotropy: Math.max(1, Math.trunc(options.maxAnisotropy ?? 1)),
      signal: modelAbortController.signal
    }).then((lease) => {
      if (disposed) {
        lease.release();
        return;
      }
      modelLease = lease;
      loadedModel = lease.model;
      syncModelVisuals();
      apply(lastNowMicros);
      options.onModelReady?.();
    }).catch(() => {
      // The bounded wagon fallback remains selectable after any asset failure.
    });
  }

  const updateSelection = () => {
    if (disposed) return;
    syncVisibleWorkerIds();
    routeLayer.setSelectedWorkerId(selectedWorkerId);
    routeLayer.setHoveredWorkerId(hoveredWorkerId);
    apply(lastNowMicros);
  };

  return Object.freeze({
    group,
    canReconcile: (next) => !disposed && sameStaticWorkerCatalog(identities, next),
    reconcile: (next) => {
      if (disposed || !sameStaticWorkerCatalog(identities, next)) return;
      for (const worker of next) {
        const current = recordsById.get(worker.workerId);
        if (!current || !sameDynamicWorker(current, worker)) {
          dirtyWorkerIds.add(worker.workerId);
        }
        recordsById.set(worker.workerId, worker);
      }
      routeLayer.reconcile(next);
      syncVisibleWorkerIds();
      apply(lastNowMicros);
    },
    update: (nowMicros) => {
      if (disposed || typeof nowMicros !== 'bigint' || nowMicros < 0n) return false;
      const elapsedSeconds = lastNowMicros <= 0n || nowMicros <= lastNowMicros
        ? 0
        : Math.min(0.1, Number(nowMicros - lastNowMicros) / 1_000_000);
      lastNowMicros = nowMicros;
      const workerChanged = apply(nowMicros);
      const routeChanged = routeLayer.update(nowMicros);
      if (elapsedSeconds > 0 && !reducedMotion) {
        for (const visual of modelVisuals.values()) visual.mixer?.update(elapsedSeconds);
      }
      return workerChanged || routeChanged || movingWorkerIds.size > 0;
    },
    hasMovingWorkers: () => !disposed && movingWorkerIds.size > 0,
    recommendedPositionUpdateIntervalMs: () => (
      reducedMotion
        ? REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS
        : REALM_WORKER_STANDARD_POSITION_INTERVAL_MS
    ),
    raycast: (raycaster) => {
      if (disposed || pickWorkerIds.length === 0) return null;
      const intersection = raycaster.intersectObject(pickMesh, false)[0];
      const instanceId = intersection?.instanceId;
      if (intersection === undefined || instanceId === undefined || !Number.isSafeInteger(instanceId)) {
        return null;
      }
      const workerId = pickWorkerIds[instanceId];
      const worker = workerId ? recordsById.get(workerId) : undefined;
      const current = workerId ? posesById.get(workerId) : undefined;
      if (!worker || !current || !Number.isFinite(intersection.distance) || intersection.distance < 0) {
        return null;
      }
      return Object.freeze({
        workerId: worker.workerId,
        workerOrdinal: worker.ordinal,
        originCastleId: worker.originCastleId,
        coord: current.coord,
        world: current.world,
        distance: intersection.distance
      });
    },
    getCurrentPose: (workerId) => disposed ? undefined : posesById.get(workerId),
    getPresenceRecords: () => {
      if (disposed) return Object.freeze([]);
      return Object.freeze(
        orderedWorkers(recordsById.values(), selectedWorkerId, hoveredWorkerId)
          .filter((worker) => worker.status !== 'idle')
          .flatMap((worker) => {
            const current = posesById.get(worker.workerId);
            return current
              ? [Object.freeze({
                ...current,
                resourceKind: worker.resourceKind,
                siteId: worker.siteId,
                ownedByViewer: worker.ownedByViewer
              })]
              : [];
          })
      );
    },
    getPresentationTelemetry: () => {
      const modelWorkerCount = modelVisuals.size;
      return Object.freeze({
        publicWorkerCount: recordsById.size,
        presentedWorkerCount: posesById.size,
        modelWorkerCount,
        animatedWorkerCount: [...modelVisuals.values()]
          .filter((visual) => visual.animated).length,
        fallbackWorkerCount: Math.max(0, visibleWorkerIds.length - modelWorkerCount),
        routeMismatchCount,
        route: routeLayer.getTelemetry()
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
