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
  createRealmProceduralWorkerWagonFallback
} from './createRealmProceduralWorkerWagonFallback';
import type { RealmCameraMode } from './realmCameraController';
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
  resolveRealmWorkerRoutePose,
  resolveRealmWorkerVisualRoute,
  type RealmWorkerRoutePose,
  type RealmWorkerSceneRecord
} from './realmWorkerRoutePresentation';
import {
  resolveRealmWorkerLocomotion,
  type RealmWorkerLocomotionSample,
  type RealmWorkerLocomotionState
} from './realmWorkerLocomotion';
import {
  applyRealmWorkerWagonWheelDistance,
  bindRealmWorkerWagonRuntime,
  measureRealmWorkerWagonWheelDistanceMismatch,
  REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS,
  type RealmWorkerWagonRuntimeBinding
} from './realmWorkerWagonRuntime';
import { normalizePublicProfileText } from '../../security/publicProfileText';

export type { RealmWorkerSceneRecord } from './realmWorkerRoutePresentation';

const MAX_RENDERED_REALM_WORKERS = 512;
const MAX_VISIBLE_WORKER_FALLBACKS = 128;
const WORKER_GROUND_LIFT = 0.018;
const FALLBACK_GROUND_LIFT = 0.012;
const WAGON_TARGET_FOOTPRINT = 0.64;
const WAGON_WALK_CYCLE_DISTANCE_WORLD = 0.28;
const MAX_WORKER_TERRAIN_SLOPE_RADIANS = THREE.MathUtils.degToRad(12);
const MAX_WORKER_TERRAIN_NORMAL_RATE_RADIANS_PER_SECOND = Math.PI * 0.75;
const MAX_WORKER_GROUND_CONTACT_RATE_PER_SECOND = 2;
const WORKER_ANIMATION_CROSS_FADE_SECONDS = 0.16;
const MAX_WORKER_PRESTART_FRAME_DEMAND_MICROS = 5_000_000n;

export const REALM_WORKER_MODEL_BUDGET = Object.freeze({
  high: Object.freeze({ models: 12, animations: 4 }),
  balanced: Object.freeze({ models: 8, animations: 4 }),
  reduced: Object.freeze({ models: 4, animations: 0 })
} satisfies Readonly<Record<RealmQuality, Readonly<{
  models: number;
  animations: number;
}>>>);

export const REALM_WORKER_HIGH_POSITION_INTERVAL_MS = 17;
export const REALM_WORKER_BALANCED_POSITION_INTERVAL_MS = 34;
export const REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS = 42;
export const REALM_WORKER_STANDARD_POSITION_INTERVAL_MS =
  REALM_WORKER_HIGH_POSITION_INTERVAL_MS;

export type RealmWorkerCurrentPose = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  profile?: RealmWorkerSceneRecord['profile'];
  world: Readonly<{ x: number; y: number; z: number }>;
  coord: HexCoord;
  yaw: number;
  tangent: HexWorldPosition;
  groundNormal: Readonly<{ x: number; y: number; z: number }>;
  terrainAligned: boolean;
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
  fallbackType: 'procedural-body-wheels-v1';
  fallbackTriangleCount: number;
  routeMismatchCount: number;
  slopeAlignedWorkerCount: number;
  animationTransitionCount: number;
  suppressedAnimationRestartCount: number;
  locomotionMovingCount: number;
  locomotionStartingCount: number;
  locomotionCruisingCount: number;
  locomotionTurningCount: number;
  locomotionStoppingCount: number;
  locomotionGatheringIdleCount: number;
  locomotionMaximumSpeed: number;
  locomotionMaximumPositionCorrection: number;
  locomotionMaximumHeadingError: number;
  locomotionOneShotOverrunCount: number;
  workerWheelDrivenCount: number;
  workerWheelDistanceMismatchCount: number;
  workerLateModelPhaseRestorationCount: number;
  workerModelPhaseRestorationCount: number;
  workerReversalCount: number;
  workerRepeatedTurnSuppressionCount: number;
  clipIdleCount: number;
  clipStartCount: number;
  clipStopCount: number;
  clipTurnLeftCount: number;
  clipTurnRightCount: number;
  clipWalkCount: number;
  renderedClipIdleCount: number;
  renderedClipStartCount: number;
  renderedClipStopCount: number;
  renderedClipTurnLeftCount: number;
  renderedClipTurnRightCount: number;
  renderedClipWalkCount: number;
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
  setCameraMode: (mode: RealmCameraMode) => void;
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
  runtime: RealmWorkerWagonRuntimeBinding;
  mixer?: THREE.AnimationMixer;
  action?: THREE.AnimationAction;
  clipName?: string;
  clipEpochKey?: string;
  animated: boolean;
  phaseRestorationPending: boolean;
  latePhaseRestorationPending: boolean;
};

type WorkerTerrainPresentationState = Readonly<{
  normal: Readonly<{ x: number; y: number; z: number }>;
  groundHeight: number;
  positionCorrection: number;
}>;

export type RealmWorkerTerrainOrientation = Readonly<{
  quaternion: THREE.Quaternion;
  normal: Readonly<{ x: number; y: number; z: number }>;
  groundHeight: number;
  slopeRadians: number;
  terrainAligned: boolean;
}>;

export type RealmWorkerAnimationTransition = Readonly<{
  action: THREE.AnimationAction;
  clipName: string;
  clipEpochKey: string;
  transitioned: boolean;
  suppressedRestart: boolean;
}>;

export type RealmWorkerAnimationPhase = Readonly<{
  clipEpochKey: string;
  timeSeconds: number;
  playbackRate: number;
}>;

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
    return worker.startedAtMicros !== undefined
      && worker.arrivesAtMicros !== undefined
      && nowMicros >= worker.startedAtMicros
      && nowMicros < worker.arrivesAtMicros;
  }
  if (worker.status === 'returning') {
    return worker.returnStartedAtMicros !== undefined
      && worker.returnsAtMicros !== undefined
      && nowMicros >= worker.returnStartedAtMicros
      && nowMicros < worker.returnsAtMicros;
  }
  return false;
}

function isVisibleAt(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint
) {
  if (worker.status === 'idle') return false;
  return worker.status !== 'returning'
    || worker.returnsAtMicros === undefined
    || nowMicros < worker.returnsAtMicros;
}

function hasMovementDemandAt(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint
) {
  if (worker.status === 'outbound') {
    return worker.startedAtMicros !== undefined
      && worker.arrivesAtMicros !== undefined
      && worker.arrivesAtMicros > worker.startedAtMicros
      && (
        nowMicros >= worker.startedAtMicros
        || worker.startedAtMicros - nowMicros
          <= MAX_WORKER_PRESTART_FRAME_DEMAND_MICROS
      )
      && nowMicros < worker.arrivesAtMicros;
  }
  if (worker.status === 'returning') {
    return worker.returnStartedAtMicros !== undefined
      && worker.returnsAtMicros !== undefined
      && worker.returnsAtMicros > worker.returnStartedAtMicros
      && (
        nowMicros >= worker.returnStartedAtMicros
        || worker.returnStartedAtMicros - nowMicros
          <= MAX_WORKER_PRESTART_FRAME_DEMAND_MICROS
      )
      && nowMicros < worker.returnsAtMicros;
  }
  return false;
}

function workerPriority(
  worker: RealmWorkerSceneRecord,
  selectedWorkerId: string | null,
  hoveredWorkerId: string | null
) {
  if (worker.workerId === selectedWorkerId) return 0;
  if (worker.ownedByViewer) return 1;
  if (worker.workerId === hoveredWorkerId) return 2;
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

function isStartingPhase(phase: RealmWorkerLocomotionSample['phase']) {
  return phase === 'starting-outbound' || phase === 'starting-return';
}

function isCruisingPhase(phase: RealmWorkerLocomotionSample['phase']) {
  return phase === 'cruising-outbound' || phase === 'cruising-return';
}

function isTurningPhase(phase: RealmWorkerLocomotionSample['phase']) {
  return phase === 'turning-outbound'
    || phase === 'turnaround-return'
    || phase === 'turning-return';
}

function isStoppingPhase(phase: RealmWorkerLocomotionSample['phase']) {
  return phase === 'stopping-at-site' || phase === 'stopping-at-keep';
}

function isOneShotClip(clipName: RealmWorkerLocomotionSample['clipName']) {
  return clipName === 'Start'
    || clipName === 'Stop'
    || clipName === 'Turn_Left'
    || clipName === 'Turn_Right';
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

function orientationFromTangentAndNormal(
  tangent: HexWorldPosition,
  normal: Readonly<{ x: number; y: number; z: number }>
) {
  const zAxis = new THREE.Vector3(tangent.x, 0, tangent.z);
  if (zAxis.lengthSq() <= 0.000_001) zAxis.set(0, 0, 1);
  zAxis.normalize();
  const yAxis = new THREE.Vector3(normal.x, normal.y, normal.z);
  if (yAxis.lengthSq() <= 0.000_001) yAxis.set(0, 1, 0);
  yAxis.normalize();
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis);
  if (xAxis.lengthSq() <= 0.000_001) {
    xAxis.set(zAxis.z, 0, -zAxis.x);
  }
  xAxis.normalize();
  zAxis.crossVectors(xAxis, yAxis).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis)
  );
}

/**
 * Resolve a bounded terrain frame without allowing bad height samples or a
 * steep mesh spike to roll a wagon. Local +Z remains the travel tangent.
 */
export function resolveRealmWorkerTerrainOrientation(
  world: HexWorldPosition,
  tangent: HexWorldPosition,
  hexSize: number,
  heightAtWorld: (world: HexWorldPosition) => number,
  fallbackGroundHeight = 0
): RealmWorkerTerrainOrientation {
  const safeTangent = new THREE.Vector2(tangent.x, tangent.z);
  if (safeTangent.lengthSq() <= 0.000_001) safeTangent.set(0, 1);
  safeTangent.normalize();
  const right = new THREE.Vector2(safeTangent.y, -safeTangent.x);
  const sampleDistance = Math.max(0.04, hexSize * 0.09);
  const safeHeightAtWorld = (sample: HexWorldPosition) => {
    try {
      return heightAtWorld(sample);
    } catch {
      return Number.NaN;
    }
  };
  const centerHeight = safeHeightAtWorld(world);
  const ahead = safeHeightAtWorld({
    x: world.x + safeTangent.x * sampleDistance,
    z: world.z + safeTangent.y * sampleDistance
  });
  const behind = safeHeightAtWorld({
    x: world.x - safeTangent.x * sampleDistance,
    z: world.z - safeTangent.y * sampleDistance
  });
  const rightHeight = safeHeightAtWorld({
    x: world.x + right.x * sampleDistance,
    z: world.z + right.y * sampleDistance
  });
  const leftHeight = safeHeightAtWorld({
    x: world.x - right.x * sampleDistance,
    z: world.z - right.y * sampleDistance
  });
  if (![centerHeight, ahead, behind, rightHeight, leftHeight].every(Number.isFinite)) {
    const normal = Object.freeze({ x: 0, y: 1, z: 0 });
    const safeGroundHeight = Number.isFinite(centerHeight)
      ? centerHeight
      : Number.isFinite(fallbackGroundHeight)
        ? fallbackGroundHeight
        : 0;
    return Object.freeze({
      quaternion: orientationFromTangentAndNormal(tangent, normal),
      normal,
      groundHeight: safeGroundHeight,
      slopeRadians: 0,
      terrainAligned: false
    });
  }

  let forwardSlope = (ahead - behind) / (sampleDistance * 2);
  let rightSlope = (rightHeight - leftHeight) / (sampleDistance * 2);
  const gradient = Math.hypot(forwardSlope, rightSlope);
  const maximumGradient = Math.tan(MAX_WORKER_TERRAIN_SLOPE_RADIANS);
  if (gradient > maximumGradient) {
    const scale = maximumGradient / gradient;
    forwardSlope *= scale;
    rightSlope *= scale;
  }
  const forwardAxis = new THREE.Vector3(
    safeTangent.x,
    forwardSlope,
    safeTangent.y
  ).normalize();
  const rightAxis = new THREE.Vector3(
    right.x,
    rightSlope,
    right.y
  ).normalize();
  const normalVector = new THREE.Vector3()
    .crossVectors(forwardAxis, rightAxis)
    .normalize();
  if (normalVector.y < 0) normalVector.multiplyScalar(-1);
  const normal = Object.freeze({
    x: normalVector.x,
    y: normalVector.y,
    z: normalVector.z
  });
  return Object.freeze({
    quaternion: orientationFromTangentAndNormal(tangent, normal),
    normal,
    groundHeight: Math.max(
      centerHeight,
      (ahead + behind + rightHeight + leftHeight) * 0.25
    ),
    slopeRadians: Math.atan(Math.min(gradient, maximumGradient)),
    terrainAligned: true
  });
}

/** Cross-fade only between clips in the already-reviewed wagon contract. */
export function transitionRealmWorkerAnimation(
  mixer: THREE.AnimationMixer,
  currentAction: THREE.AnimationAction | undefined,
  currentClipName: string | undefined,
  nextClip: THREE.AnimationClip,
  currentClipEpochKey?: string,
  phase: RealmWorkerAnimationPhase = Object.freeze({
    clipEpochKey: nextClip.name,
    timeSeconds: 0,
    playbackRate: 1
  })
): RealmWorkerAnimationTransition {
  const sameEpoch = currentAction !== undefined
    && currentClipName === nextClip.name
    && (
      currentClipEpochKey === undefined
      || currentClipEpochKey === phase.clipEpochKey
    );
  if (sameEpoch) {
    currentAction.enabled = true;
    currentAction.paused = false;
    currentAction.setEffectiveTimeScale(
      Number.isFinite(phase.playbackRate)
        ? Math.max(0, phase.playbackRate)
        : 1
    );
    currentAction.time = THREE.MathUtils.clamp(
      Number.isFinite(phase.timeSeconds) ? phase.timeSeconds : 0,
      0,
      Math.max(0, nextClip.duration)
    );
    mixer.update(0);
    return Object.freeze({
      action: currentAction,
      clipName: currentClipName,
      clipEpochKey: phase.clipEpochKey,
      transitioned: false,
      suppressedRestart: true
    });
  }
  const nextAction = mixer.clipAction(nextClip);
  const oneShot = nextClip.name === 'Start'
    || nextClip.name === 'Stop'
    || nextClip.name === 'Turn_Left'
    || nextClip.name === 'Turn_Right';
  if (nextAction === currentAction) nextAction.stop();
  nextAction.reset();
  nextAction.enabled = true;
  nextAction.paused = false;
  // Locomotion state leaves a one-shot at its real duration. Never retain a
  // frozen final rig pose if a frame or model promotion arrives late.
  nextAction.clampWhenFinished = false;
  nextAction.setLoop(oneShot ? THREE.LoopOnce : THREE.LoopRepeat, oneShot ? 1 : Infinity);
  nextAction.setEffectiveWeight(1);
  nextAction.setEffectiveTimeScale(
    Number.isFinite(phase.playbackRate)
      ? Math.max(0, phase.playbackRate)
      : 1
  );
  nextAction.time = THREE.MathUtils.clamp(
    Number.isFinite(phase.timeSeconds) ? phase.timeSeconds : 0,
    0,
    Math.max(0, nextClip.duration)
  );
  nextAction.play();
  if (currentAction && currentAction !== nextAction) {
    currentAction.enabled = true;
    currentAction.crossFadeTo(
      nextAction,
      WORKER_ANIMATION_CROSS_FADE_SECONDS,
      false
    );
  }
  mixer.update(0);
  return Object.freeze({
    action: nextAction,
    clipName: nextClip.name,
    clipEpochKey: phase.clipEpochKey,
    transitioned: true,
    suppressedRestart: false
  });
}

function smoothTerrainPresentation(
  target: RealmWorkerTerrainOrientation,
  previous: WorkerTerrainPresentationState | undefined,
  elapsedSeconds: number,
  hexSize: number,
  displayYaw: number
): RealmWorkerTerrainOrientation & WorkerTerrainPresentationState {
  const targetNormal = new THREE.Vector3(
    target.normal.x,
    target.normal.y,
    target.normal.z
  ).normalize();
  let normal = targetNormal;
  let groundHeight = target.groundHeight;
  if (previous) {
    const previousNormal = new THREE.Vector3(
      previous.normal.x,
      previous.normal.y,
      previous.normal.z
    ).normalize();
    normal = previousNormal;
    groundHeight = previous.groundHeight;
    if (elapsedSeconds > 0) {
      const angle = previousNormal.angleTo(targetNormal);
      const maximumAngle =
        MAX_WORKER_TERRAIN_NORMAL_RATE_RADIANS_PER_SECOND * elapsedSeconds;
      if (angle <= maximumAngle || angle <= 0.000_001) {
        normal = targetNormal;
      } else {
        normal = previousNormal.lerp(
          targetNormal,
          maximumAngle / angle
        ).normalize();
      }
      const maximumGroundStep =
        MAX_WORKER_GROUND_CONTACT_RATE_PER_SECOND * hexSize * elapsedSeconds;
      groundHeight = previous.groundHeight + THREE.MathUtils.clamp(
        target.groundHeight - previous.groundHeight,
        -maximumGroundStep,
        maximumGroundStep
      );
    }
  }
  const frozenNormal = Object.freeze({
    x: normal.x,
    y: normal.y,
    z: normal.z
  });
  const tangent = Object.freeze({
    x: Math.sin(displayYaw),
    z: Math.cos(displayYaw)
  });
  return Object.freeze({
    quaternion: orientationFromTangentAndNormal(tangent, frozenNormal),
    normal: frozenNormal,
    groundHeight,
    slopeRadians: Math.acos(THREE.MathUtils.clamp(normal.y, -1, 1)),
    terrainAligned: target.terrainAligned,
    positionCorrection: Math.abs(target.groundHeight - groundHeight)
  });
}

function workerCurrentPose(
  worker: RealmWorkerSceneRecord,
  pose: RealmWorkerRoutePose,
  locomotion: RealmWorkerLocomotionSample,
  orientation: RealmWorkerTerrainOrientation
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
      y: orientation.groundHeight + WORKER_GROUND_LIFT,
      z: pose.world.z
    }),
    coord: pose.coord,
    yaw: locomotion.displayYaw,
    tangent: Object.freeze({
      x: Math.sin(locomotion.displayYaw),
      z: Math.cos(locomotion.displayYaw)
    }),
    groundNormal: orientation.normal,
    terrainAligned: orientation.terrainAligned,
    direction: pose.direction,
    forwardProgress: pose.forwardProgress,
    phaseProgress: pose.phaseProgress
  });
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
    heightAtWorld: options.heightAtWorld,
    reducedMotion: options.reducedMotion
  });
  group.add(routeLayer.group);

  const fallbackCapacity = Math.min(identities.length, MAX_VISIBLE_WORKER_FALLBACKS);
  const proceduralFallback = createRealmProceduralWorkerWagonFallback();
  const fallbackGeometry = proceduralFallback.geometry;
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
  const locomotionById = new Map<string, RealmWorkerLocomotionSample>();
  const terrainPresentationById =
    new Map<string, WorkerTerrainPresentationState>();
  const visualSignaturesById = new Map<string, string>();
  const pickSignaturesById = new Map<string, string>();
  const routeMismatchWorkerIds = new Set<string>();
  const visibleWorkerIds: string[] = [];
  const visibleWorkerIdSet = new Set<string>();
  const pickWorkerIds: string[] = [];
  const modelVisuals = new Map<string, WorkerModelVisual>();
  const movingWorkerIds = new Set<string>();
  const movementDemandWorkerIds = new Set<string>();
  const previouslyMovingWorkerIds = new Set<string>();
  const workerWheelDrivenIds = new Set<string>();
  const workerWheelDistanceMismatchIds = new Set<string>();
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
  let loadedModelRouteSafe = false;
  let modelLease: HegemonyExpeditionPrefabLease | undefined;
  let lastNowMicros = 0n;
  let disposed = false;
  let routeMismatchCount = 0;
  let animationTransitionCount = 0;
  let suppressedAnimationRestartCount = 0;
  let workerLateModelPhaseRestorationCount = 0;
  let workerModelPhaseRestorationCount = 0;
  let workerReversalCount = 0;
  let workerRepeatedTurnSuppressionCount = 0;

  const releaseVisualMixer = (visual: WorkerModelVisual) => {
    if (!visual.mixer) return;
    try {
      visual.action?.stop();
      visual.mixer.stopAllAction();
    } catch {
      // Continue with cache release even if an action cannot be stopped.
    }
    if (visual.action) {
      try {
        visual.mixer.uncacheAction(
          visual.action.getClip(),
          visual.root
        );
      } catch {
        // The root cache is still released below.
      }
    }
    try {
      visual.mixer.uncacheRoot(visual.root);
    } catch {
      // Mixer cache teardown is best-effort during scene removal.
    }
    visual.root.traverse((node) => {
      const skinned = node as THREE.SkinnedMesh;
      if (skinned.isSkinnedMesh) skinned.skeleton.pose();
    });
    visual.mixer = undefined;
    visual.action = undefined;
    visual.clipName = undefined;
    visual.clipEpochKey = undefined;
    visual.animated = false;
  };

  const removeModelVisual = (workerId: string) => {
    const visual = modelVisuals.get(workerId);
    if (!visual) return;
    releaseVisualMixer(visual);
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
    loadedModelRouteSafe = false;
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
    locomotionById.clear();
    terrainPresentationById.clear();
    visualSignaturesById.clear();
    pickSignaturesById.clear();
    routeMismatchWorkerIds.clear();
    movingWorkerIds.clear();
    movementDemandWorkerIds.clear();
    previouslyMovingWorkerIds.clear();
    workerWheelDrivenIds.clear();
    workerWheelDistanceMismatchIds.clear();
    dirtyWorkerIds.clear();
    visibleWorkerIds.length = 0;
    visibleWorkerIdSet.clear();
    pickWorkerIds.length = 0;
  };

  const desiredModelWorkerIds = () => {
    if (
      !loadedModel
      || !loadedModelRouteSafe
      || modelBudget.models <= 0
    ) return [];
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

  const syncModelVisuals = (lateAssetLoad = false) => {
    if (!loadedModel || !loadedModelRouteSafe) {
      removeAllModelVisuals();
      return;
    }
    const desired = desiredModelWorkerIds();
    const desiredSet = new Set(desired);
    for (const workerId of [...modelVisuals.keys()]) {
      if (!desiredSet.has(workerId)) removeModelVisual(workerId);
    }
    desired.forEach((workerId, index) => {
      const shouldAnimate =
        !reducedMotion && index < modelBudget.animations;
      let visual = modelVisuals.get(workerId);
      if (!visual) {
        const root = cloneSkinned(loadedModel!.root) as THREE.Group;
        root.name = `realm-worker-wagon-${workerId}`;
        // Selection and priority may change presentation lanes, never the
        // reviewed GLB's physical scale or wheel radius.
        root.scale.setScalar(options.hexSize);
        const runtime = bindRealmWorkerWagonRuntime(root, loadedModel!);
        if (!runtime.routeSafe) return;
        visual = {
          workerId,
          root,
          runtime,
          animated: false,
          phaseRestorationPending: true,
          latePhaseRestorationPending: lateAssetLoad
        };
        modelVisuals.set(workerId, visual);
        modelGroup.add(root);
        dirtyWorkerIds.add(workerId);
      }
      if (shouldAnimate && !visual.mixer) {
        visual.mixer = new THREE.AnimationMixer(visual.root);
        visual.animated = true;
        visual.phaseRestorationPending = true;
      } else if (!shouldAnimate && visual.mixer) {
        releaseVisualMixer(visual);
      }
      visual.animated = shouldAnimate;
    });
  };

  const syncVisibleWorkerIds = (nowMicros = lastNowMicros) => {
    const previouslyVisible = [...visibleWorkerIds];
    const ordered = orderedWorkers(recordsById.values(), selectedWorkerId, hoveredWorkerId)
      .filter((worker) => isVisibleAt(worker, nowMicros))
      .slice(0, fallbackCapacity)
      .map((worker) => worker.workerId);
    const signature = ordered.join('|');
    if (signature === visibleWorkerIds.join('|')) return false;
    visibleWorkerIds.splice(0, visibleWorkerIds.length, ...ordered);
    visibleWorkerIdSet.clear();
    for (const workerId of ordered) visibleWorkerIdSet.add(workerId);
    pickWorkerIds.splice(0, pickWorkerIds.length, ...ordered);
    visualSignaturesById.clear();
    pickSignaturesById.clear();
    // Membership changes can remove an active wagon at the same moment its
    // authority returns to idle. Keep both sides dirty so its logical pose
    // returns to the keep even though the parked wagon is no longer rendered.
    for (const workerId of [...previouslyVisible, ...ordered]) {
      dirtyWorkerIds.add(workerId);
    }
    syncModelVisuals();
    return true;
  };

  const updateVisualAnimation = (
    visual: WorkerModelVisual,
    locomotion: RealmWorkerLocomotionSample
  ) => {
    if (!visual.mixer) return;
    const clip = visual.runtime.clipsByName.get(locomotion.clipName);
    if (!clip) return;
    const transition = transitionRealmWorkerAnimation(
      visual.mixer,
      visual.action,
      visual.clipName,
      clip,
      visual.clipEpochKey,
      Object.freeze({
        clipEpochKey: locomotion.state.clipEpochKey,
        timeSeconds: locomotion.clipTimeSeconds,
        playbackRate: locomotion.playbackRate
      })
    );
    visual.action = transition.action;
    visual.clipName = transition.clipName;
    visual.clipEpochKey = transition.clipEpochKey;
    if (transition.transitioned) animationTransitionCount += 1;
    if (transition.suppressedRestart) suppressedAnimationRestartCount += 1;
  };

  const apply = (nowMicros: bigint) => {
    let changed = false;
    let fallbackMatricesChanged = false;
    let fallbackColorsChanged = false;
    let pickMatricesChanged = false;
    syncVisibleWorkerIds(nowMicros);
    previouslyMovingWorkerIds.clear();
    for (const workerId of movingWorkerIds) {
      previouslyMovingWorkerIds.add(workerId);
    }
    movingWorkerIds.clear();
    movementDemandWorkerIds.clear();
    workerWheelDrivenIds.clear();
    workerWheelDistanceMismatchIds.clear();

    for (const worker of recordsById.values()) {
      const moving = isMovingAt(worker, nowMicros);
      if (moving) movingWorkerIds.add(worker.workerId);
      const movementDemand = hasMovementDemandAt(worker, nowMicros);
      if (movementDemand) movementDemandWorkerIds.add(worker.workerId);
      const previousLocomotion = locomotionById.get(worker.workerId);
      const presentationStillActive = previousLocomotion !== undefined
        && (
          previousLocomotion.phase === 'starting-outbound'
          || previousLocomotion.phase === 'turning-outbound'
          || previousLocomotion.phase === 'stopping-at-site'
          || previousLocomotion.phase === 'turnaround-return'
          || previousLocomotion.phase === 'starting-return'
          || previousLocomotion.phase === 'turning-return'
          || previousLocomotion.phase === 'stopping-at-keep'
          || (
            !reducedMotion
            && previousLocomotion.phase === 'gathering'
            && modelVisuals.get(worker.workerId)?.animated === true
          )
        );
      const shouldResolve = dirtyWorkerIds.has(worker.workerId)
        || moving
        || movementDemand
        || previouslyMovingWorkerIds.has(worker.workerId)
        || presentationStillActive
        || (!routePoseById.has(worker.workerId)
          && !routeMismatchWorkerIds.has(worker.workerId));
      if (!shouldResolve) continue;
      const pose = resolveRealmWorkerRoutePose(worker, nowMicros, options.hexSize);
      if (!pose) {
        posesById.delete(worker.workerId);
        routePoseById.delete(worker.workerId);
        locomotionById.delete(worker.workerId);
        terrainPresentationById.delete(worker.workerId);
        if (worker.status !== 'idle') routeMismatchWorkerIds.add(worker.workerId);
        continue;
      }
      const visualRoute = pose.direction === 'idle'
        ? undefined
        : resolveRealmWorkerVisualRoute(worker, options.hexSize);
      const locomotion = resolveRealmWorkerLocomotion({
        worker,
        pose,
        ...(visualRoute === undefined ? {} : { visualRoute }),
        nowMicros,
        ...(previousLocomotion === undefined
          ? {}
          : { previous: previousLocomotion.state }),
        tuning: Object.freeze({
          wheelRadiusWorld:
            REALM_WORKER_WAGON_NORMALIZED_WHEEL_RADIUS * options.hexSize,
          walkCycleDistanceWorld: WAGON_WALK_CYCLE_DISTANCE_WORLD
        })
      });
      if (!locomotion) {
        posesById.delete(worker.workerId);
        routePoseById.delete(worker.workerId);
        locomotionById.delete(worker.workerId);
        terrainPresentationById.delete(worker.workerId);
        if (worker.status !== 'idle') routeMismatchWorkerIds.add(worker.workerId);
        continue;
      }
      if (
        previousLocomotion
        && !previousLocomotion.phase.includes('return')
        && previousLocomotion.phase !== 'parked'
        && locomotion.phase.includes('return')
      ) workerReversalCount += 1;
      if (
        locomotion.turnKey !== undefined
        && previousLocomotion?.turnKey === locomotion.turnKey
        && (
          locomotion.phase === 'turning-outbound'
          || locomotion.phase === 'turning-return'
        )
      ) workerRepeatedTurnSuppressionCount += 1;
      const targetOrientation = resolveRealmWorkerTerrainOrientation(
        pose.world,
        pose.tangent,
        options.hexSize,
        options.heightAtWorld,
        terrainPresentationById.get(worker.workerId)?.groundHeight
      );
      if (!Number.isFinite(targetOrientation.groundHeight)) {
        throw new Error('REALM_WORKER_GROUND_INVALID');
      }
      const orientation = smoothTerrainPresentation(
        targetOrientation,
        previousLocomotion?.state.timelineRevision === worker.timelineRevision
          ? terrainPresentationById.get(worker.workerId)
          : undefined,
        locomotion.boundedFrameDeltaSeconds,
        options.hexSize,
        locomotion.displayYaw
      );
      terrainPresentationById.set(worker.workerId, Object.freeze({
        normal: orientation.normal,
        groundHeight: orientation.groundHeight,
        positionCorrection: orientation.positionCorrection
      }));
      locomotionById.set(worker.workerId, locomotion);
      posesById.set(
        worker.workerId,
        workerCurrentPose(worker, pose, locomotion, orientation)
      );
      routePoseById.set(worker.workerId, pose);
      routeMismatchWorkerIds.delete(worker.workerId);
    }
    routeMismatchCount = routeMismatchWorkerIds.size;
    syncModelVisuals();

    visibleWorkerIds.forEach((workerId, index) => {
      const worker = recordsById.get(workerId);
      const current = posesById.get(workerId);
      const pose = routePoseById.get(workerId);
      const locomotion = locomotionById.get(workerId);
      const selected = selectedWorkerId === workerId;
      const hovered = hoveredWorkerId === workerId;
      const modelVisual = modelVisuals.get(workerId);
      if (modelVisual && locomotion) {
        if (!reducedMotion) {
          updateVisualAnimation(modelVisual, locomotion);
          if (modelVisual.runtime.proceduralWheelDrive) {
            const wheelDriven = applyRealmWorkerWagonWheelDistance(
              modelVisual.runtime,
              locomotion.cumulativeTravelDistance,
              options.hexSize
            );
            if (wheelDriven) {
              workerWheelDrivenIds.add(workerId);
              const angleMismatch =
                measureRealmWorkerWagonWheelDistanceMismatch(
                  modelVisual.runtime,
                  locomotion.cumulativeTravelDistance,
                  options.hexSize
                );
              if (angleMismatch > 0.000_001) {
                workerWheelDistanceMismatchIds.add(workerId);
              }
            } else {
              workerWheelDistanceMismatchIds.add(workerId);
            }
          }
        }
        if (modelVisual.phaseRestorationPending) {
          workerModelPhaseRestorationCount += 1;
          if (modelVisual.latePhaseRestorationPending) {
            workerLateModelPhaseRestorationCount += 1;
          }
          modelVisual.phaseRestorationPending = false;
          modelVisual.latePhaseRestorationPending = false;
        }
      }
      const visualSignature = current && pose && worker && locomotion
        ? [
          current.world.x.toFixed(5),
          current.world.y.toFixed(5),
          current.world.z.toFixed(5),
          current.yaw.toFixed(5),
          current.groundNormal.x.toFixed(5),
          current.groundNormal.y.toFixed(5),
          current.groundNormal.z.toFixed(5),
          locomotion.state.clipEpochKey,
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
          current.yaw.toFixed(5),
          current.groundNormal.x.toFixed(5),
          current.groundNormal.y.toFixed(5),
          current.groundNormal.z.toFixed(5)
        ].join(':')
        : 'hidden';
      if (visualSignaturesById.get(workerId) === visualSignature) return;
      visualSignaturesById.set(workerId, visualSignature);
      if (!worker || !current || !pose || !locomotion) {
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

      const fallbackStyleScale = selected ? 1.12 : hovered ? 1.06 : 1;
      position.set(current.world.x, current.world.y, current.world.z);
      quaternion.copy(orientationFromTangentAndNormal(
        current.tangent,
        current.groundNormal
      ));

      if (modelVisual) {
        modelVisual.root.visible = true;
        modelVisual.root.position.copy(position);
        modelVisual.root.quaternion.copy(quaternion);
        modelVisual.root.scale.setScalar(options.hexSize);
        matrix.compose(position, quaternion, zeroScale);
      } else {
        position.y += FALLBACK_GROUND_LIFT;
        scale.setScalar(options.hexSize * fallbackStyleScale);
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
      loadedModelRouteSafe = bindRealmWorkerWagonRuntime(
        lease.model.root,
        lease.model
      ).routeSafe;
      syncModelVisuals(lastNowMicros > 0n);
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
      if (elapsedSeconds > 0 && !reducedMotion) {
        for (const visual of modelVisuals.values()) {
          visual.mixer?.update(elapsedSeconds);
        }
      }
      lastNowMicros = nowMicros;
      const workerChanged = apply(nowMicros);
      const routeChanged = routeLayer.update(nowMicros);
      const presentationActive = !reducedMotion
        && visibleWorkerIds.some((workerId) => {
          const locomotion = locomotionById.get(workerId);
          return locomotion !== undefined
            && (
              locomotion.phase === 'stopping-at-site'
              || locomotion.phase === 'gathering'
            )
            && modelVisuals.get(workerId)?.animated === true;
        });
      return workerChanged
        || routeChanged
        || movementDemandWorkerIds.size > 0
        || presentationActive;
    },
    hasMovingWorkers: () => (
      !disposed
      && visibleWorkerIds.some((workerId) => {
        if (movementDemandWorkerIds.has(workerId)) return true;
        if (reducedMotion) return false;
        const locomotion = locomotionById.get(workerId);
        return locomotion !== undefined
          && (
            locomotion.phase === 'stopping-at-site'
            || locomotion.phase === 'gathering'
          )
          && modelVisuals.get(workerId)?.animated === true;
      })
    ),
    recommendedPositionUpdateIntervalMs: () => (
      reducedMotion || qualityId === 'reduced'
        ? REALM_WORKER_REDUCED_MOTION_POSITION_INTERVAL_MS
        : qualityId === 'balanced'
          ? REALM_WORKER_BALANCED_POSITION_INTERVAL_MS
          : REALM_WORKER_HIGH_POSITION_INTERVAL_MS
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
          .filter((worker) => visibleWorkerIdSet.has(worker.workerId))
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
      const locomotionSamples = visibleWorkerIds.flatMap((workerId) => {
        const sample = locomotionById.get(workerId);
        return sample ? [sample] : [];
      });
      const clipCount = (clipName: RealmWorkerLocomotionSample['clipName']) => (
        locomotionSamples.filter((sample) => sample.clipName === clipName).length
      );
      const renderedClipCount = (
        clipName: RealmWorkerLocomotionSample['clipName']
      ) => [...modelVisuals.values()].filter((visual) => {
        const action = visual.action;
        const expectedClip = visual.runtime.clipsByName.get(clipName);
        return visual.animated
          && visual.clipName === clipName
          && action !== undefined
          && expectedClip !== undefined
          && action.getClip() === expectedClip
          && action.enabled
          && !action.paused
          && action.isRunning();
      }).length;
      return Object.freeze({
        publicWorkerCount: recordsById.size,
        presentedWorkerCount: posesById.size,
        modelWorkerCount,
        animatedWorkerCount: [...modelVisuals.values()]
          .filter((visual) => visual.animated).length,
        fallbackWorkerCount: Math.max(0, visibleWorkerIds.length - modelWorkerCount),
        fallbackType: proceduralFallback.fallbackId,
        fallbackTriangleCount: proceduralFallback.triangleCount,
        routeMismatchCount,
        slopeAlignedWorkerCount: [...posesById.values()]
          .filter((pose) => pose.terrainAligned).length,
        animationTransitionCount,
        suppressedAnimationRestartCount,
        locomotionMovingCount: visibleWorkerIds
          .filter((workerId) => movingWorkerIds.has(workerId)).length,
        locomotionStartingCount: locomotionSamples
          .filter((sample) => isStartingPhase(sample.phase)).length,
        locomotionCruisingCount: locomotionSamples
          .filter((sample) => isCruisingPhase(sample.phase)).length,
        locomotionTurningCount: locomotionSamples
          .filter((sample) => isTurningPhase(sample.phase)).length,
        locomotionStoppingCount: locomotionSamples
          .filter((sample) => isStoppingPhase(sample.phase)).length,
        locomotionGatheringIdleCount: locomotionSamples
          .filter((sample) => sample.phase === 'gathering').length,
        locomotionMaximumSpeed: Math.max(
          0,
          ...locomotionSamples.map((sample) => sample.worldSpeed)
        ),
        locomotionMaximumPositionCorrection: Math.max(
          0,
          ...visibleWorkerIds.map((workerId) => (
            terrainPresentationById.get(workerId)?.positionCorrection ?? 0
          ))
        ),
        locomotionMaximumHeadingError: Math.max(
          0,
          ...locomotionSamples.map((sample) => Math.abs(Math.atan2(
            Math.sin(sample.targetYaw - sample.displayYaw),
            Math.cos(sample.targetYaw - sample.displayYaw)
          )))
        ),
        locomotionOneShotOverrunCount: locomotionSamples.filter((sample) => (
          isOneShotClip(sample.clipName)
          && (
            sample.clipTimeSeconds < 0
            || sample.clipTimeSeconds
              > sample.clipDurationSeconds + 0.000_001
          )
        )).length,
        workerWheelDrivenCount: workerWheelDrivenIds.size,
        workerWheelDistanceMismatchCount:
          workerWheelDistanceMismatchIds.size,
        workerLateModelPhaseRestorationCount,
        workerModelPhaseRestorationCount,
        workerReversalCount,
        workerRepeatedTurnSuppressionCount,
        clipIdleCount: clipCount('Idle'),
        clipStartCount: clipCount('Start'),
        clipStopCount: clipCount('Stop'),
        clipTurnLeftCount: clipCount('Turn_Left'),
        clipTurnRightCount: clipCount('Turn_Right'),
        clipWalkCount: clipCount('Walk'),
        renderedClipIdleCount: renderedClipCount('Idle'),
        renderedClipStartCount: renderedClipCount('Start'),
        renderedClipStopCount: renderedClipCount('Stop'),
        renderedClipTurnLeftCount: renderedClipCount('Turn_Left'),
        renderedClipTurnRightCount: renderedClipCount('Turn_Right'),
        renderedClipWalkCount: renderedClipCount('Walk'),
        route: routeLayer.getTelemetry()
      });
    },
    setCameraMode: (mode) => {
      if (disposed) return;
      routeLayer.setCameraMode(mode);
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
