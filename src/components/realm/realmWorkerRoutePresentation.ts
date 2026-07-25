import * as THREE from 'three';

import {
  canonicalDryWorkerPresentationRoute
} from '../../game/map/canonicalPassableRoute';
import {
  axialToWorld,
  worldToNearestAxial,
  type HexCoord,
  type HexWorldPosition
} from '../../game/map/hexCoordinates';
import type {
  RealmResourceOccupantProfile
} from './realmResourceOccupantPresentation';
import type {
  RealmWorkerPublicPresentation
} from './realmWorkerPresentation';

export const REALM_WORKER_IDLE_RING_RADIUS = 0.82;
export const REALM_WORKER_SITE_RING_RADIUS = 0.34;
export const REALM_WORKER_ROUTE_CACHE_LIMIT = 512;

type CachedCanonicalRoute = readonly HexCoord[] | null;
const canonicalRouteCache = new Map<string, CachedCanonicalRoute>();
let canonicalRouteCacheHits = 0;
let canonicalRouteCacheMisses = 0;

export type RealmWorkerSceneRecord = RealmWorkerPublicPresentation & Readonly<{
  originCoord: HexCoord;
  destinationCoord?: HexCoord;
  /**
   * Already-sanitized public identity only. FIDs, ownership bindings and
   * private authorization material must never enter the scene record.
   */
  profile?: RealmResourceOccupantProfile;
}>;

export type RealmWorkerTravelDirection =
  | 'idle'
  | 'outbound'
  | 'gathering'
  | 'returning';

export type RealmWorkerRoutePose = Readonly<{
  world: HexWorldPosition;
  coord: HexCoord;
  yaw: number;
  direction: RealmWorkerTravelDirection;
  /** Forward castle-to-site progress, even while a worker is returning. */
  forwardProgress: number;
  /** Progress in the active authoritative phase. */
  phaseProgress: number;
  segmentIndex: number;
  segmentProgress: number;
  route: readonly HexCoord[];
}>;

export type RealmWorkerAnimationClipName =
  | 'Idle'
  | 'Start'
  | 'Stop'
  | 'Turn_Left'
  | 'Turn_Right'
  | 'Walk';

type RouteWaypoint = Readonly<{ x: number; z: number }>;

function finiteCoord(coord: HexCoord | undefined): coord is HexCoord {
  return coord !== undefined
    && Number.isSafeInteger(coord.q)
    && Number.isSafeInteger(coord.r);
}

function boundedProgress(now: bigint, start: bigint | undefined, end: bigint | undefined) {
  if (start === undefined || end === undefined || end <= start) {
    return end !== undefined && now >= end ? 1 : 0;
  }
  if (now <= start) return 0;
  if (now >= end) return 1;
  return Number(now - start) / Number(end - start);
}

function ordinalOffset(ordinal: number, radius: number, hexSize: number) {
  const angle = -Math.PI * 0.5 + (ordinal - 1) * Math.PI * 0.5;
  return Object.freeze({
    x: Math.cos(angle) * radius * hexSize,
    z: Math.sin(angle) * radius * hexSize
  });
}

function offsetWorld(
  coord: HexCoord,
  ordinal: number,
  radius: number,
  hexSize: number
): RouteWaypoint {
  const center = axialToWorld(coord, hexSize);
  const offset = ordinalOffset(ordinal, radius, hexSize);
  return Object.freeze({ x: center.x + offset.x, z: center.z + offset.z });
}

function visualRouteWaypoints(
  worker: RealmWorkerSceneRecord,
  route: readonly HexCoord[],
  hexSize: number
): readonly RouteWaypoint[] {
  return Object.freeze(route.map((coord, index) => {
    if (index === 0) {
      return offsetWorld(
        coord,
        worker.ordinal,
        REALM_WORKER_IDLE_RING_RADIUS,
        hexSize
      );
    }
    if (index === route.length - 1) {
      return offsetWorld(
        coord,
        worker.ordinal,
        REALM_WORKER_SITE_RING_RADIUS,
        hexSize
      );
    }
    return Object.freeze(axialToWorld(coord, hexSize));
  }));
}

function poseAlongWaypoints(
  waypoints: readonly RouteWaypoint[],
  forwardProgress: number
) {
  const segmentCount = waypoints.length - 1;
  const bounded = THREE.MathUtils.clamp(forwardProgress, 0, 1);
  const scaled = bounded * segmentCount;
  const segmentIndex = Math.min(segmentCount - 1, Math.floor(scaled));
  const segmentProgress = bounded >= 1 ? 1 : scaled - segmentIndex;
  const from = waypoints[segmentIndex]!;
  const to = waypoints[segmentIndex + 1]!;
  return Object.freeze({
    world: Object.freeze({
      x: THREE.MathUtils.lerp(from.x, to.x, segmentProgress),
      z: THREE.MathUtils.lerp(from.z, to.z, segmentProgress)
    }),
    segmentIndex,
    segmentProgress
  });
}

function yawToward(from: RouteWaypoint, to: RouteWaypoint) {
  return Math.atan2(to.x - from.x, to.z - from.z);
}

function forwardYaw(
  waypoints: readonly RouteWaypoint[],
  segmentIndex: number
) {
  return yawToward(waypoints[segmentIndex]!, waypoints[segmentIndex + 1]!);
}

function returnYaw(
  waypoints: readonly RouteWaypoint[],
  segmentIndex: number,
  segmentProgress: number
) {
  if (segmentProgress > 0.000_001) {
    return yawToward(waypoints[segmentIndex + 1]!, waypoints[segmentIndex]!);
  }
  const priorSegment = Math.max(0, segmentIndex - 1);
  return yawToward(waypoints[priorSegment + 1]!, waypoints[priorSegment]!);
}

function authoritativeRoute(worker: RealmWorkerSceneRecord) {
  if (
    worker.status === 'idle'
    || !finiteCoord(worker.destinationCoord)
    || worker.routeSteps === undefined
  ) return undefined;
  const key = [
    worker.originCoord.q,
    worker.originCoord.r,
    worker.destinationCoord.q,
    worker.destinationCoord.r,
    worker.routeSteps
  ].join(':');
  const cached = canonicalRouteCache.get(key);
  if (cached !== undefined) {
    canonicalRouteCacheHits += 1;
    // Refresh insertion order so a bounded cache retains active journeys.
    canonicalRouteCache.delete(key);
    canonicalRouteCache.set(key, cached);
    return cached ?? undefined;
  }
  canonicalRouteCacheMisses += 1;
  const route = canonicalDryWorkerPresentationRoute(
    worker.originCoord,
    worker.destinationCoord,
    worker.routeSteps
  );
  canonicalRouteCache.set(key, route ?? null);
  while (canonicalRouteCache.size > REALM_WORKER_ROUTE_CACHE_LIMIT) {
    const oldest = canonicalRouteCache.keys().next().value;
    if (oldest === undefined) break;
    canonicalRouteCache.delete(oldest);
  }
  return route;
}

export function getRealmWorkerRouteCacheTelemetry() {
  return Object.freeze({
    size: canonicalRouteCache.size,
    hits: canonicalRouteCacheHits,
    misses: canonicalRouteCacheMisses,
    limit: REALM_WORKER_ROUTE_CACHE_LIMIT
  });
}

/**
 * The route is derived from immutable public world and Water state. Deployed
 * v12 route steps still validate the worker shape, while server timestamps and
 * outcomes remain authoritative when the dry visual path has another length.
 */
export function resolveRealmWorkerCanonicalRoute(
  worker: RealmWorkerSceneRecord
): readonly HexCoord[] | undefined {
  return authoritativeRoute(worker);
}

/**
 * Resolve the worker's current presentation from a dry ordered route and
 * server timestamps. `undefined` remains the fail-closed result for malformed
 * authority or an unreachable endpoint.
 */
export function resolveRealmWorkerRoutePose(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint,
  hexSize: number
): RealmWorkerRoutePose | undefined {
  if (
    typeof nowMicros !== 'bigint'
    || nowMicros < 0n
    || !Number.isFinite(hexSize)
    || hexSize <= 0
    || !finiteCoord(worker.originCoord)
  ) return undefined;

  if (worker.status === 'idle') {
    const world = offsetWorld(
      worker.originCoord,
      worker.ordinal,
      REALM_WORKER_IDLE_RING_RADIUS,
      hexSize
    );
    return Object.freeze({
      world,
      coord: Object.freeze({ ...worker.originCoord }),
      yaw: -Math.PI * 0.5 + (worker.ordinal - 1) * Math.PI * 0.5,
      direction: 'idle',
      forwardProgress: 0,
      phaseProgress: 0,
      segmentIndex: 0,
      segmentProgress: 0,
      route: Object.freeze([Object.freeze({ ...worker.originCoord })])
    });
  }

  const route = authoritativeRoute(worker);
  if (!route || route.length < 2) return undefined;
  const waypoints = visualRouteWaypoints(worker, route, hexSize);
  let forwardProgress = 1;
  let phaseProgress = 1;
  let yaw = forwardYaw(waypoints, waypoints.length - 2);

  if (worker.status === 'outbound') {
    phaseProgress = boundedProgress(
      nowMicros,
      worker.startedAtMicros,
      worker.arrivesAtMicros
    );
    forwardProgress = phaseProgress;
  } else if (worker.status === 'returning') {
    phaseProgress = boundedProgress(
      nowMicros,
      worker.returnStartedAtMicros,
      worker.returnsAtMicros
    );
    const returnStart = THREE.MathUtils.clamp(
      (worker.returnStartProgressBasisPoints ?? 10_000) / 10_000,
      0,
      1
    );
    forwardProgress = returnStart * (1 - phaseProgress);
  }

  const interpolated = poseAlongWaypoints(waypoints, forwardProgress);
  if (worker.status === 'returning') {
    yaw = returnYaw(
      waypoints,
      interpolated.segmentIndex,
      interpolated.segmentProgress
    );
  } else {
    yaw = forwardYaw(waypoints, interpolated.segmentIndex);
  }

  return Object.freeze({
    world: interpolated.world,
    coord: Object.freeze(worldToNearestAxial(interpolated.world, hexSize)),
    yaw,
    direction: worker.status,
    forwardProgress,
    phaseProgress,
    segmentIndex: interpolated.segmentIndex,
    segmentProgress: interpolated.segmentProgress,
    route
  });
}

/**
 * Ordered remaining visual route. The first point is always the worker's
 * current interpolated position; outbound ends at the node and returning ends
 * at the keep. A selected gathering worker may show the complete route.
 */
export function resolveRealmWorkerRemainingRouteWorldPoints(
  worker: RealmWorkerSceneRecord,
  nowMicros: bigint,
  hexSize: number,
  includeGatheringRoute = false
): readonly HexWorldPosition[] | undefined {
  const pose = resolveRealmWorkerRoutePose(worker, nowMicros, hexSize);
  if (!pose || pose.direction === 'idle') return undefined;
  if (
    (pose.direction === 'outbound' || pose.direction === 'returning')
    && pose.phaseProgress >= 1
  ) return undefined;
  const waypoints = visualRouteWaypoints(worker, pose.route, hexSize);
  if (pose.direction === 'gathering') {
    return includeGatheringRoute
      ? Object.freeze(waypoints.map((point) => Object.freeze({ ...point })))
      : undefined;
  }

  const points: HexWorldPosition[] = [Object.freeze({ ...pose.world })];
  if (pose.direction === 'outbound') {
    for (let index = pose.segmentIndex + 1; index < waypoints.length; index += 1) {
      points.push(Object.freeze({ ...waypoints[index]! }));
    }
  } else {
    const firstIndex = pose.segmentProgress > 0
      ? pose.segmentIndex
      : pose.segmentIndex - 1;
    for (let index = firstIndex; index >= 0; index -= 1) {
      points.push(Object.freeze({ ...waypoints[index]! }));
    }
  }
  return points.length >= 2 ? Object.freeze(points) : undefined;
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function turningClipForPose(pose: RealmWorkerRoutePose) {
  if (
    pose.route.length < 3
    || pose.segmentProgress > 0.18
    || pose.segmentIndex <= 0
  ) return undefined;
  const waypoints = pose.route.map((coord) => axialToWorld(coord, 1));
  const previousYaw = forwardYaw(waypoints, pose.segmentIndex - 1);
  const currentYaw = forwardYaw(waypoints, pose.segmentIndex);
  const forwardDelta = normalizeAngle(currentYaw - previousYaw);
  // Returning traverses the same corner in reverse, so its steering clip must
  // mirror the castle-to-site direction even though the persisted route order
  // remains canonical.
  const delta = pose.direction === 'returning' ? -forwardDelta : forwardDelta;
  if (Math.abs(delta) < Math.PI / 12) return undefined;
  return delta > 0 ? 'Turn_Left' as const : 'Turn_Right' as const;
}

/** Select only clips that exist in the approved six-clip wagon contract. */
export function resolveRealmWorkerAnimationClip(
  pose: RealmWorkerRoutePose
): RealmWorkerAnimationClipName {
  if (pose.direction === 'idle') return 'Idle';
  if (pose.direction === 'gathering') return 'Stop';
  if (pose.phaseProgress <= 0.04) return 'Start';
  if (pose.phaseProgress >= 0.97) return 'Stop';
  return turningClipForPose(pose) ?? 'Walk';
}
