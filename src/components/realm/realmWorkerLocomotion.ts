import type {
  RealmWorkerAnimationClipName,
  RealmWorkerRoutePose,
  RealmWorkerSceneRecord,
  RealmWorkerVisualRoute
} from './realmWorkerRoutePresentation';

export const REALM_WORKER_CLIP_DURATIONS_SECONDS = Object.freeze({
  Idle: 2,
  Start: 0.8,
  Stop: 0.8,
  Turn_Left: 1,
  Turn_Right: 1,
  Walk: 1
} as const satisfies Readonly<Record<RealmWorkerAnimationClipName, number>>);

export const REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS = 0.1;
export const REALM_WORKER_DEFAULT_MAX_YAW_RATE_RADIANS_PER_SECOND = Math.PI;
export const REALM_WORKER_DEFAULT_TURN_THRESHOLD_RADIANS = Math.PI / 30;
export const REALM_WORKER_MIN_WALK_PLAYBACK_RATE = 0.02;
export const REALM_WORKER_MAX_WALK_PLAYBACK_RATE = 4;

const MICROS_PER_SECOND = 1_000_000;
const DISTANCE_EPSILON = 0.000_001;
const HALF_TURN_EPSILON = 0.000_001;

export type RealmWorkerLocomotionPhase =
  | 'parked'
  | 'starting-outbound'
  | 'cruising-outbound'
  | 'turning-outbound'
  | 'stopping-at-site'
  | 'gathering'
  | 'turnaround-return'
  | 'starting-return'
  | 'cruising-return'
  | 'turning-return'
  | 'stopping-at-keep';

export type RealmWorkerLocomotionTuning = Readonly<{
  /**
   * Radius in rendered world units after the approved wagon has been scaled.
   * Wheel rotation is derived from cumulative route distance and this radius.
   */
  wheelRadiusWorld: number;
  /**
   * Rendered world distance covered by one authored one-second Walk cycle.
   * The Walk action rate is derived from exact journey speed and this value.
   */
  walkCycleDistanceWorld: number;
  maxYawRateRadiansPerSecond?: number;
  maxFrameDeltaSeconds?: number;
  turnThresholdRadians?: number;
  maxTurnAnticipationDistanceWorld?: number;
}>;

export type RealmWorkerLocomotionState = Readonly<{
  workerId: string;
  /**
   * A semantic renderer lifecycle key. Public row revisions are deliberately
   * excluded, so harmless projection updates cannot restart animation.
   */
  lifecycleKey: string;
  timelineRevision: number;
  sampledAtMicros: bigint;
  phase: RealmWorkerLocomotionPhase;
  clipName: RealmWorkerAnimationClipName;
  clipEpochKey: string;
  displayYaw: number;
  cumulativeTravelDistance: number;
  lastTurnKey?: string;
}>;

export type RealmWorkerLocomotionSample = Readonly<{
  state: RealmWorkerLocomotionState;
  phase: RealmWorkerLocomotionPhase;
  clipName: RealmWorkerAnimationClipName;
  clipDurationSeconds: number;
  /**
   * Deterministic clip-local time. It can seed a newly loaded LOD without
   * resetting the worker's visible phase.
   */
  clipTimeSeconds: number;
  clipNormalizedPhase: number;
  playbackRate: number;
  playbackRateClamped: boolean;
  targetYaw: number;
  displayYaw: number;
  boundedFrameDeltaSeconds: number;
  worldSpeed: number;
  forwardRouteDistance: number;
  cumulativeTravelDistance: number;
  wheelRotationRadians: number;
  walkNormalizedPhase: number;
  distanceToCorner: number;
  timeToCornerSeconds: number;
  turnKey?: string;
}>;

export type ResolveRealmWorkerLocomotionInput = Readonly<{
  worker: RealmWorkerSceneRecord;
  pose: RealmWorkerRoutePose;
  visualRoute?: RealmWorkerVisualRoute;
  nowMicros: bigint;
  previous?: RealmWorkerLocomotionState;
  tuning: RealmWorkerLocomotionTuning;
}>;

type ResolvedPhase = Readonly<{
  phase: RealmWorkerLocomotionPhase;
  clipName: RealmWorkerAnimationClipName;
  clipTimeSeconds: number;
  clipEpochKey: string;
  turnKey?: string;
}>;

type TurnCandidate = Readonly<{
  clipName: 'Turn_Left' | 'Turn_Right';
  clipTimeSeconds: number;
  distanceToCorner: number;
  timeToCornerSeconds: number;
  turnKey: string;
}>;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function positiveFinite(value: number | undefined, fallback: number) {
  return value !== undefined && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}

function nonNegativeFinite(value: number) {
  return Number.isFinite(value) ? Math.max(0, value) : 0;
}

function boundedWalkPlaybackRate(
  worldSpeed: number,
  walkCycleDistanceWorld: number
) {
  const ideal = nonNegativeFinite(worldSpeed)
    * REALM_WORKER_CLIP_DURATIONS_SECONDS.Walk
    / walkCycleDistanceWorld;
  return ideal <= 0
    ? 0
    : clamp(
        ideal,
        REALM_WORKER_MIN_WALK_PLAYBACK_RATE,
        REALM_WORKER_MAX_WALK_PLAYBACK_RATE
      );
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function stableStringHash(value: string) {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function timestampKey(value: bigint | undefined) {
  return value === undefined ? '-' : value.toString();
}

function durationSeconds(start: bigint | undefined, end: bigint | undefined) {
  if (start === undefined || end === undefined || end <= start) return 0;
  const seconds = Number(end - start) / MICROS_PER_SECOND;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

function elapsedSeconds(now: bigint, start: bigint | undefined) {
  if (start === undefined || now <= start) return 0;
  const seconds = Number(now - start) / MICROS_PER_SECOND;
  return nonNegativeFinite(seconds);
}

function remainingSeconds(now: bigint, end: bigint | undefined) {
  if (end === undefined || now >= end) return 0;
  const seconds = Number(end - now) / MICROS_PER_SECOND;
  return nonNegativeFinite(seconds);
}

function loopingTimeFromMicros(
  now: bigint,
  anchor: bigint,
  duration: number,
  offsetMicros = 0n
) {
  const durationMicros = BigInt(Math.round(duration * MICROS_PER_SECOND));
  if (durationMicros <= 0n) return 0;
  const elapsed = now > anchor ? now - anchor : 0n;
  const wrapped = (elapsed + offsetMicros) % durationMicros;
  return Number(wrapped) / MICROS_PER_SECOND;
}

function semanticLifecycleKey(worker: RealmWorkerSceneRecord) {
  if (worker.status === 'idle') {
    return [
      worker.workerId,
      'parked',
      worker.timelineRevision
    ].join(':');
  }
  if (worker.status === 'returning') {
    return [
      worker.workerId,
      'returning',
      worker.timelineRevision,
      timestampKey(worker.returnStartedAtMicros),
      timestampKey(worker.returnsAtMicros),
      worker.returnStartProgressBasisPoints ?? '-'
    ].join(':');
  }
  return [
    worker.workerId,
    worker.status,
    worker.timelineRevision,
    timestampKey(worker.startedAtMicros),
    timestampKey(worker.arrivesAtMicros),
    timestampKey(worker.gatheringEndsAtMicros)
  ].join(':');
}

function returnStartProgress(worker: RealmWorkerSceneRecord) {
  if (
    worker.returnStartedAtMicros !== undefined
    && worker.startedAtMicros !== undefined
    && worker.arrivesAtMicros !== undefined
    && worker.arrivesAtMicros > worker.startedAtMicros
  ) {
    const elapsed = worker.returnStartedAtMicros <= worker.startedAtMicros
      ? 0
      : worker.returnStartedAtMicros >= worker.arrivesAtMicros
        ? 1
        : Number(worker.returnStartedAtMicros - worker.startedAtMicros)
          / Number(worker.arrivesAtMicros - worker.startedAtMicros);
    return clamp(elapsed, 0, 1);
  }
  return clamp(
    (worker.returnStartProgressBasisPoints ?? 10_000) / 10_000,
    0,
    1
  );
}

function isFiniteRoute(
  route: RealmWorkerVisualRoute | undefined
): route is RealmWorkerVisualRoute {
  if (
    route === undefined
    || !Number.isFinite(route.totalLength)
    || route.totalLength <= 0
    || route.movementPoints.length < 2
    || route.cumulativeDistances.length !== route.movementPoints.length
  ) return false;
  let previous = -Infinity;
  for (const distance of route.cumulativeDistances) {
    if (
      !Number.isFinite(distance)
      || distance < 0
      || distance + DISTANCE_EPSILON < previous
    ) return false;
    previous = distance;
  }
  return Math.abs(
    route.cumulativeDistances.at(-1)! - route.totalLength
  ) <= Math.max(DISTANCE_EPSILON, route.totalLength * 0.000_001);
}

function safeFrameDeltaSeconds(
  now: bigint,
  previous: RealmWorkerLocomotionState | undefined,
  maxFrameDeltaSeconds: number
) {
  if (
    previous === undefined
    || previous.sampledAtMicros >= now
  ) return 0;
  const elapsed = Number(now - previous.sampledAtMicros) / MICROS_PER_SECOND;
  return clamp(
    Number.isFinite(elapsed) ? elapsed : maxFrameDeltaSeconds,
    0,
    maxFrameDeltaSeconds
  );
}

/**
 * Smooth a heading along the shortest arc while bounding the maximum angular
 * change contributed by a late or irregular renderer frame.
 */
export function smoothRealmWorkerYaw(
  previousYaw: number,
  targetYaw: number,
  elapsedSecondsValue: number,
  maxYawRateRadiansPerSecond =
    REALM_WORKER_DEFAULT_MAX_YAW_RATE_RADIANS_PER_SECOND,
  maxFrameDeltaSeconds = REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS
) {
  const safePrevious = Number.isFinite(previousYaw) ? normalizeAngle(previousYaw) : 0;
  const safeTarget = Number.isFinite(targetYaw)
    ? normalizeAngle(targetYaw)
    : safePrevious;
  const boundedElapsed = clamp(
    Number.isFinite(elapsedSecondsValue) ? elapsedSecondsValue : 0,
    0,
    positiveFinite(
      maxFrameDeltaSeconds,
      REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS
    )
  );
  const maximumStep = positiveFinite(
    maxYawRateRadiansPerSecond,
    REALM_WORKER_DEFAULT_MAX_YAW_RATE_RADIANS_PER_SECOND
  ) * boundedElapsed;
  const shortestDelta = normalizeAngle(safeTarget - safePrevious);
  return normalizeAngle(
    safePrevious + clamp(shortestDelta, -maximumStep, maximumStep)
  );
}

function deterministicTurnaroundYaw(
  workerId: string,
  targetYaw: number,
  elapsed: number,
  duration: number
) {
  const direction = stableStringHash(workerId) % 2 === 0 ? 1 : -1;
  const startYaw = normalizeAngle(targetYaw - direction * Math.PI);
  const progress = clamp(elapsed / duration, 0, 1);
  return normalizeAngle(startYaw + direction * Math.PI * progress);
}

function turnaroundClip(
  workerId: string,
  previousYaw: number | undefined,
  targetYaw: number
): 'Turn_Left' | 'Turn_Right' {
  if (previousYaw !== undefined) {
    const delta = normalizeAngle(targetYaw - previousYaw);
    if (Math.abs(Math.abs(delta) - Math.PI) > HALF_TURN_EPSILON) {
      return delta >= 0 ? 'Turn_Left' : 'Turn_Right';
    }
  }
  return stableStringHash(workerId) % 2 === 0
    ? 'Turn_Left'
    : 'Turn_Right';
}

function routeDistanceToCorner(
  pose: RealmWorkerRoutePose,
  route: RealmWorkerVisualRoute,
  forwardDistance: number
) {
  const segmentIndex = clamp(
    Math.trunc(pose.segmentIndex),
    0,
    route.cumulativeDistances.length - 2
  );
  if (pose.direction === 'returning') {
    return Math.max(
      0,
      forwardDistance - route.cumulativeDistances[segmentIndex]!
    );
  }
  return Math.max(
    0,
    route.cumulativeDistances[segmentIndex + 1]! - forwardDistance
  );
}

function routeSegmentTurnDelta(
  route: RealmWorkerVisualRoute,
  segmentIndex: number,
  direction: 'outbound' | 'returning'
) {
  const from = route.tangents[segmentIndex];
  const to = route.tangents[segmentIndex + 1];
  if (!from || !to) return 0;
  const outboundDelta = normalizeAngle(
    Math.atan2(to.x, to.z) - Math.atan2(from.x, from.z)
  );
  return direction === 'returning' ? -outboundDelta : outboundDelta;
}

/**
 * Corridor-safe curve generation can represent one authored corner with
 * several adjacent micro-segments. Collapse those like-signed segments into
 * one semantic corner so a single Turn clip cannot restart part-way through
 * the same bend.
 */
function semanticTurnRange(
  pose: RealmWorkerRoutePose,
  route: RealmWorkerVisualRoute,
  turnThresholdRadians: number
) {
  const segmentIndex = clamp(
    Math.trunc(pose.segmentIndex),
    0,
    route.cumulativeDistances.length - 2
  );
  const direction = pose.direction;
  if (direction !== 'outbound' && direction !== 'returning') {
    return Object.freeze({ start: segmentIndex, end: segmentIndex });
  }
  const sign = Math.sign(pose.turnDelta);
  let start = segmentIndex;
  let end = segmentIndex;
  const ribbonStartIndex = Math.max(
    0,
    route.movementPoints.length - route.ribbonPoints.length
  );
  // Segment zero can be the renderer-only parking-ring approach. Do not
  // merge that approach into a later canonical road bend.
  const minimumStart = segmentIndex < ribbonStartIndex
    ? segmentIndex
    : ribbonStartIndex;
  const belongsToTurn = (index: number) => {
    const delta = routeSegmentTurnDelta(route, index, direction);
    return Math.abs(delta) >= turnThresholdRadians
      && Math.sign(delta) === sign;
  };
  while (start > minimumStart && belongsToTurn(start - 1)) start -= 1;
  while (
    end < route.cumulativeDistances.length - 2
    && belongsToTurn(end + 1)
  ) end += 1;
  return Object.freeze({ start, end });
}

function resolveTurnCandidate(
  worker: RealmWorkerSceneRecord,
  pose: RealmWorkerRoutePose,
  route: RealmWorkerVisualRoute,
  forwardDistance: number,
  worldSpeed: number,
  turnThresholdRadians: number,
  maxTurnAnticipationDistanceWorld: number
): TurnCandidate | undefined {
  if (
    (pose.direction !== 'outbound' && pose.direction !== 'returning')
    || worldSpeed <= DISTANCE_EPSILON
    || !Number.isFinite(pose.turnDelta)
    || Math.abs(pose.turnDelta) < turnThresholdRadians
  ) return undefined;
  const clipDuration = REALM_WORKER_CLIP_DURATIONS_SECONDS.Turn_Left;
  const range = semanticTurnRange(pose, route, turnThresholdRadians);
  // Outbound uses the first curved segment's endpoint. Returning traverses
  // the same semantic bend in reverse and therefore uses the last segment's
  // start. The remainder of the rounded bend cannot start another clip.
  const semanticCornerDistance = pose.direction === 'returning'
    ? route.cumulativeDistances[range.end]!
    : route.cumulativeDistances[range.start + 1]!;
  const signedDistanceToCorner = pose.direction === 'returning'
    ? forwardDistance - semanticCornerDistance
    : semanticCornerDistance - forwardDistance;
  if (signedDistanceToCorner < -DISTANCE_EPSILON) return undefined;
  const distanceToCorner = Math.max(0, signedDistanceToCorner);
  const timeToCornerSeconds = distanceToCorner / worldSpeed;
  const distanceWindow = Math.min(
    worldSpeed * clipDuration,
    maxTurnAnticipationDistanceWorld
  );
  if (
    distanceToCorner > distanceWindow + DISTANCE_EPSILON
    || timeToCornerSeconds > clipDuration + DISTANCE_EPSILON
  ) return undefined;
  const direction = pose.direction;
  const clipName = pose.turnDelta > 0 ? 'Turn_Left' : 'Turn_Right';
  const turnKey = [
    worker.workerId,
    direction,
    timestampKey(
      direction === 'outbound'
        ? worker.startedAtMicros
        : worker.returnStartedAtMicros
    ),
    `${range.start}-${range.end}`,
    clipName
  ].join(':');
  return Object.freeze({
    clipName,
    clipTimeSeconds: clamp(
      clipDuration - timeToCornerSeconds,
      0,
      clipDuration
    ),
    distanceToCorner,
    timeToCornerSeconds,
    turnKey
  });
}

function resolvePhase(
  worker: RealmWorkerSceneRecord,
  pose: RealmWorkerRoutePose,
  nowMicros: bigint,
  turn: TurnCandidate | undefined,
  previous: RealmWorkerLocomotionState | undefined
): ResolvedPhase {
  const lifecycleKey = semanticLifecycleKey(worker);
  const startDuration = REALM_WORKER_CLIP_DURATIONS_SECONDS.Start;
  const stopDuration = REALM_WORKER_CLIP_DURATIONS_SECONDS.Stop;
  const turnDuration = REALM_WORKER_CLIP_DURATIONS_SECONDS.Turn_Left;

  if (worker.status === 'idle' || pose.direction === 'idle') {
    const offset = BigInt(
      stableStringHash(worker.workerId)
      % Math.round(REALM_WORKER_CLIP_DURATIONS_SECONDS.Idle * MICROS_PER_SECOND)
    );
    return Object.freeze({
      phase: 'parked',
      clipName: 'Idle',
      clipTimeSeconds: loopingTimeFromMicros(
        nowMicros,
        0n,
        REALM_WORKER_CLIP_DURATIONS_SECONDS.Idle,
        offset
      ),
      clipEpochKey: lifecycleKey
    });
  }

  if (worker.status === 'gathering' || pose.direction === 'gathering') {
    const anchor = worker.arrivesAtMicros ?? nowMicros;
    const stoppedFor = elapsedSeconds(nowMicros, anchor);
    if (stoppedFor < stopDuration) {
      return Object.freeze({
        phase: 'stopping-at-site',
        clipName: 'Stop',
        clipTimeSeconds: clamp(stoppedFor, 0, stopDuration),
        clipEpochKey:
          `${lifecycleKey}:stop-site:${timestampKey(anchor)}`
      });
    }
    return Object.freeze({
      phase: 'gathering',
      clipName: 'Idle',
      clipTimeSeconds: loopingTimeFromMicros(
        nowMicros,
        anchor,
        REALM_WORKER_CLIP_DURATIONS_SECONDS.Idle
      ),
      clipEpochKey: `${lifecycleKey}:gathering:${timestampKey(anchor)}`
    });
  }

  if (worker.status === 'outbound' || pose.direction === 'outbound') {
    const elapsed = elapsedSeconds(nowMicros, worker.startedAtMicros);
    if (
      worker.arrivesAtMicros !== undefined
      && nowMicros >= worker.arrivesAtMicros
    ) {
      const stoppedFor = elapsedSeconds(nowMicros, worker.arrivesAtMicros);
      if (stoppedFor < stopDuration) {
        return Object.freeze({
          phase: 'stopping-at-site',
          clipName: 'Stop',
          clipTimeSeconds: clamp(stoppedFor, 0, stopDuration),
          clipEpochKey:
            `${lifecycleKey}:stop-site:${worker.arrivesAtMicros.toString()}`
        });
      }
      return Object.freeze({
        phase: 'gathering',
        clipName: 'Idle',
        clipTimeSeconds: loopingTimeFromMicros(
          nowMicros,
          worker.arrivesAtMicros,
          REALM_WORKER_CLIP_DURATIONS_SECONDS.Idle
        ),
        clipEpochKey:
          `${lifecycleKey}:gathering:${worker.arrivesAtMicros.toString()}`
      });
    }
    if (elapsed < startDuration) {
      return Object.freeze({
        phase: 'starting-outbound',
        clipName: 'Start',
        clipTimeSeconds: clamp(elapsed, 0, startDuration),
        clipEpochKey:
          `${lifecycleKey}:start-out:${timestampKey(worker.startedAtMicros)}`
      });
    }
    if (turn !== undefined) {
      return Object.freeze({
        phase: 'turning-outbound',
        clipName: turn.clipName,
        clipTimeSeconds: turn.clipTimeSeconds,
        clipEpochKey: `turn:${turn.turnKey}`,
        turnKey: turn.turnKey
      });
    }
    return Object.freeze({
      phase: 'cruising-outbound',
      clipName: 'Walk',
      clipTimeSeconds: 0,
      clipEpochKey: `${lifecycleKey}:walk`
    });
  }

  const elapsed = elapsedSeconds(nowMicros, worker.returnStartedAtMicros);
  const remaining = remainingSeconds(nowMicros, worker.returnsAtMicros);
  if (
    worker.returnsAtMicros !== undefined
    && nowMicros >= worker.returnsAtMicros
  ) {
    return Object.freeze({
      phase: 'parked',
      clipName: 'Idle',
      clipTimeSeconds: loopingTimeFromMicros(
        nowMicros,
        worker.returnsAtMicros,
        REALM_WORKER_CLIP_DURATIONS_SECONDS.Idle
      ),
      clipEpochKey:
        `${lifecycleKey}:returned:${worker.returnsAtMicros.toString()}`
    });
  }
  if (remaining > 0 && remaining <= stopDuration) {
    return Object.freeze({
      phase: 'stopping-at-keep',
      clipName: 'Stop',
      clipTimeSeconds: clamp(stopDuration - remaining, 0, stopDuration),
      clipEpochKey:
        `${lifecycleKey}:stop-keep:${timestampKey(worker.returnsAtMicros)}`
    });
  }
  if (elapsed < turnDuration) {
    const clipName = turnaroundClip(
      worker.workerId,
      previous?.displayYaw,
      pose.yaw
    );
    return Object.freeze({
      phase: 'turnaround-return',
      clipName,
      clipTimeSeconds: clamp(elapsed, 0, turnDuration),
      clipEpochKey:
        `${lifecycleKey}:turnaround:${timestampKey(worker.returnStartedAtMicros)}`
    });
  }
  if (elapsed < turnDuration + startDuration) {
    return Object.freeze({
      phase: 'starting-return',
      clipName: 'Start',
      clipTimeSeconds: clamp(elapsed - turnDuration, 0, startDuration),
      clipEpochKey:
        `${lifecycleKey}:start-return:${timestampKey(worker.returnStartedAtMicros)}`
    });
  }
  if (turn !== undefined) {
    return Object.freeze({
      phase: 'turning-return',
      clipName: turn.clipName,
      clipTimeSeconds: turn.clipTimeSeconds,
      clipEpochKey: `turn:${turn.turnKey}`,
      turnKey: turn.turnKey
    });
  }
  return Object.freeze({
    phase: 'cruising-return',
    clipName: 'Walk',
    clipTimeSeconds: 0,
    clipEpochKey: `${lifecycleKey}:walk`
  });
}

/**
 * Derive renderer-only wagon locomotion from public presentation truth.
 *
 * This function does not mutate the worker, route, pose, timing, ownership, or
 * any authority source. Position remains the exact route pose. Renderer state
 * only smooths heading and selects/phase-locks the approved wagon clips.
 */
export function resolveRealmWorkerLocomotion(
  input: ResolveRealmWorkerLocomotionInput
): RealmWorkerLocomotionSample | undefined {
  const {
    worker,
    pose,
    visualRoute,
    nowMicros,
    previous,
    tuning
  } = input;
  if (
    typeof nowMicros !== 'bigint'
    || nowMicros < 0n
    || worker.workerId.length === 0
    || !Number.isFinite(pose.yaw)
    || !Number.isFinite(pose.forwardProgress)
    || !Number.isFinite(tuning.wheelRadiusWorld)
    || tuning.wheelRadiusWorld <= 0
    || !Number.isFinite(tuning.walkCycleDistanceWorld)
    || tuning.walkCycleDistanceWorld <= 0
    || (pose.direction !== 'idle' && !isFiniteRoute(visualRoute))
  ) return undefined;

  const lifecycleKey = semanticLifecycleKey(worker);
  const preservesLifecycleTransition = previous !== undefined && (
    (
      worker.status === 'gathering'
      && (
        previous.phase === 'starting-outbound'
        || previous.phase === 'cruising-outbound'
        || previous.phase === 'turning-outbound'
        || previous.phase === 'stopping-at-site'
      )
    )
    || (
      worker.status === 'returning'
      && previous.phase !== 'parked'
      && !previous.phase.includes('return')
    )
  );
  const compatiblePrevious = previous?.workerId === worker.workerId
    && previous.sampledAtMicros <= nowMicros
    && (
      previous.lifecycleKey === lifecycleKey
      || preservesLifecycleTransition
    )
    ? previous
    : undefined;
  const routeLength = isFiniteRoute(visualRoute)
    ? visualRoute.totalLength
    : 0;
  const forwardRouteDistance = clamp(
    pose.forwardProgress,
    0,
    1
  ) * routeLength;
  const returnDistance = returnStartProgress(worker) * routeLength;
  const cumulativeTravelDistance = pose.direction === 'returning'
    ? returnDistance + Math.max(0, returnDistance - forwardRouteDistance)
    : pose.direction === 'gathering'
      ? routeLength
      : pose.direction === 'outbound'
        ? forwardRouteDistance
        : compatiblePrevious?.phase === 'stopping-at-keep'
          ? compatiblePrevious.cumulativeTravelDistance
          : 0;
  const worldSpeed = pose.direction === 'outbound'
    ? routeLength / durationSeconds(
        worker.startedAtMicros,
        worker.arrivesAtMicros
      )
    : pose.direction === 'returning'
      ? returnDistance / durationSeconds(
          worker.returnStartedAtMicros,
          worker.returnsAtMicros
        )
      : 0;
  const safeWorldSpeed = nonNegativeFinite(worldSpeed);
  const turnThreshold = positiveFinite(
    tuning.turnThresholdRadians,
    REALM_WORKER_DEFAULT_TURN_THRESHOLD_RADIANS
  );
  const maxTurnDistance = positiveFinite(
    tuning.maxTurnAnticipationDistanceWorld,
    tuning.walkCycleDistanceWorld * 1.5
  );
  const turn = visualRoute === undefined
    ? undefined
    : resolveTurnCandidate(
        worker,
        pose,
        visualRoute,
        forwardRouteDistance,
        safeWorldSpeed,
        turnThreshold,
        maxTurnDistance
      );
  const distanceToCorner = turn?.distanceToCorner ?? (visualRoute !== undefined
    && (pose.direction === 'outbound' || pose.direction === 'returning')
    ? routeDistanceToCorner(pose, visualRoute, forwardRouteDistance)
    : 0);
  const timeToCornerSeconds = safeWorldSpeed > DISTANCE_EPSILON
    ? distanceToCorner / safeWorldSpeed
    : 0;
  const resolved = resolvePhase(
    worker,
    pose,
    nowMicros,
    turn,
    compatiblePrevious
  );
  const idealWalkPlaybackRate = safeWorldSpeed
    * REALM_WORKER_CLIP_DURATIONS_SECONDS.Walk
    / tuning.walkCycleDistanceWorld;
  const safeWalkPlaybackRate = boundedWalkPlaybackRate(
    safeWorldSpeed,
    tuning.walkCycleDistanceWorld
  );
  const playbackRate = resolved.clipName === 'Walk'
    ? safeWalkPlaybackRate
    : 1;
  const playbackRateClamped = resolved.clipName === 'Walk'
    && idealWalkPlaybackRate > 0
    && Math.abs(playbackRate - idealWalkPlaybackRate) > Number.EPSILON;
  const outboundDuration = durationSeconds(
    worker.startedAtMicros,
    worker.arrivesAtMicros
  );
  const outboundSpeed = outboundDuration > 0
    ? routeLength / outboundDuration
    : 0;
  const outboundPlaybackRate = boundedWalkPlaybackRate(
    outboundSpeed,
    tuning.walkCycleDistanceWorld
  );
  const outboundPhaseDistance = Math.min(
    outboundDuration,
    elapsedSeconds(
      pose.direction === 'returning'
        ? (worker.returnStartedAtMicros ?? nowMicros)
        : nowMicros,
      worker.startedAtMicros
    )
  ) * (
    outboundPlaybackRate
    * tuning.walkCycleDistanceWorld
    / REALM_WORKER_CLIP_DURATIONS_SECONDS.Walk
  );
  const returnDuration = durationSeconds(
    worker.returnStartedAtMicros,
    worker.returnsAtMicros
  );
  const returnPhaseDistance = Math.min(
    returnDuration,
    elapsedSeconds(nowMicros, worker.returnStartedAtMicros)
  ) * (
    safeWalkPlaybackRate
    * tuning.walkCycleDistanceWorld
    / REALM_WORKER_CLIP_DURATIONS_SECONDS.Walk
  );
  const walkPhaseDistance = pose.direction === 'outbound'
    ? outboundPhaseDistance
    : pose.direction === 'returning'
      ? outboundPhaseDistance + returnPhaseDistance
      : cumulativeTravelDistance;
  const walkNormalizedPhase = (
    walkPhaseDistance / tuning.walkCycleDistanceWorld
  ) % 1;
  const clipDurationSeconds =
    REALM_WORKER_CLIP_DURATIONS_SECONDS[resolved.clipName];
  const clipTimeSeconds = resolved.clipName === 'Walk'
    ? walkNormalizedPhase * clipDurationSeconds
    : clamp(resolved.clipTimeSeconds, 0, clipDurationSeconds);
  const maxFrameDelta = positiveFinite(
    tuning.maxFrameDeltaSeconds,
    REALM_WORKER_MAX_LOCOMOTION_FRAME_SECONDS
  );
  const boundedFrameDeltaSeconds = safeFrameDeltaSeconds(
    nowMicros,
    compatiblePrevious,
    maxFrameDelta
  );
  const targetYaw = normalizeAngle(pose.yaw);
  const maxYawRate = positiveFinite(
    tuning.maxYawRateRadiansPerSecond,
    REALM_WORKER_DEFAULT_MAX_YAW_RATE_RADIANS_PER_SECOND
  );
  const displayYaw = compatiblePrevious === undefined
    ? resolved.phase === 'turnaround-return'
      ? deterministicTurnaroundYaw(
          worker.workerId,
          targetYaw,
          elapsedSeconds(nowMicros, worker.returnStartedAtMicros),
          REALM_WORKER_CLIP_DURATIONS_SECONDS.Turn_Left
        )
      : targetYaw
    : smoothRealmWorkerYaw(
        compatiblePrevious.displayYaw,
        targetYaw,
        boundedFrameDeltaSeconds,
        maxYawRate,
        maxFrameDelta
      );
  const lastTurnKey = resolved.turnKey ?? compatiblePrevious?.lastTurnKey;
  const state = Object.freeze({
    workerId: worker.workerId,
    lifecycleKey,
    timelineRevision: worker.timelineRevision,
    sampledAtMicros: nowMicros,
    phase: resolved.phase,
    clipName: resolved.clipName,
    clipEpochKey: resolved.clipEpochKey,
    displayYaw,
    cumulativeTravelDistance,
    ...(lastTurnKey === undefined ? {} : { lastTurnKey })
  }) satisfies RealmWorkerLocomotionState;

  return Object.freeze({
    state,
    phase: resolved.phase,
    clipName: resolved.clipName,
    clipDurationSeconds,
    clipTimeSeconds,
    clipNormalizedPhase: clipDurationSeconds > 0
      ? clipTimeSeconds / clipDurationSeconds
      : 0,
    playbackRate,
    playbackRateClamped,
    targetYaw,
    displayYaw,
    boundedFrameDeltaSeconds,
    worldSpeed: safeWorldSpeed,
    forwardRouteDistance,
    cumulativeTravelDistance,
    wheelRotationRadians:
      cumulativeTravelDistance / tuning.wheelRadiusWorld,
    walkNormalizedPhase,
    distanceToCorner,
    timeToCornerSeconds,
    ...(resolved.turnKey === undefined ? {} : { turnKey: resolved.turnKey })
  });
}
