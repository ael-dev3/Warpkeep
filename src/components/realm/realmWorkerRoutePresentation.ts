import * as THREE from 'three';

import {
  canonicalDryWorkerPresentationRoute
} from '../../game/map/canonicalPassableRoute';
import {
  axialToWorld,
  hexKey,
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
export const REALM_WORKER_KEEP_GATE_RADIUS = 0.68;
export const REALM_WORKER_ROUTE_CACHE_LIMIT = 512;

type CachedCanonicalRoute = readonly HexCoord[] | null;
const canonicalRouteCache = new Map<string, CachedCanonicalRoute>();
const visualRouteCache = new Map<string, RealmWorkerVisualRoute>();
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

export type RealmWorkerRouteContract = 'exact-match' | 'normalized-time';

export type RealmWorkerRoutePose = Readonly<{
  world: HexWorldPosition;
  coord: HexCoord;
  yaw: number;
  tangent: HexWorldPosition;
  turnDelta: number;
  direction: RealmWorkerTravelDirection;
  /** Forward castle-to-site progress, even while a worker is returning. */
  forwardProgress: number;
  /** Progress in the active authoritative phase. */
  phaseProgress: number;
  segmentIndex: number;
  segmentProgress: number;
  route: readonly HexCoord[];
  contract: RealmWorkerRouteContract;
}>;

export type RealmWorkerVisualRoute = Readonly<{
  route: readonly HexCoord[];
  /**
   * Full continuous wagon path. It begins at the worker's ordinal keep berth
   * and ends at the route-facing resource-site entrance.
   */
  movementPoints: readonly HexWorldPosition[];
  cumulativeDistances: readonly number[];
  normalizedProgress: readonly number[];
  tangents: readonly HexWorldPosition[];
  totalLength: number;
  /**
   * Ground ribbon omits the private keep berth-to-gate staging movement but
   * shares the same normalized distance domain as movementPoints.
   */
  ribbonPoints: readonly HexWorldPosition[];
  ribbonProgress: readonly number[];
  smoothingFallback: boolean;
  corridorValidationFailureCount: number;
  contract: RealmWorkerRouteContract;
}>;

export type CorridorSafeWorkerPolyline = Readonly<{
  points: readonly HexWorldPosition[];
  usedFallback: boolean;
  validationFailureCount: number;
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

function finiteWaypoint(point: HexWorldPosition | undefined): point is HexWorldPosition {
  return point !== undefined
    && Number.isFinite(point.x)
    && Number.isFinite(point.z);
}

function freezeWaypoint(point: HexWorldPosition): HexWorldPosition {
  return Object.freeze({ x: point.x, z: point.z });
}

function freezeWaypoints(points: readonly HexWorldPosition[]) {
  return Object.freeze(points.map(freezeWaypoint));
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

function normalizedDirection(from: RouteWaypoint, to: RouteWaypoint) {
  const x = to.x - from.x;
  const z = to.z - from.z;
  const length = Math.hypot(x, z);
  if (length <= 0.000_001) return Object.freeze({ x: 0, z: 1 });
  return Object.freeze({ x: x / length, z: z / length });
}

function routeFacingWaypoint(
  center: RouteWaypoint,
  direction: RouteWaypoint,
  distance: number
) {
  return Object.freeze({
    x: center.x + direction.x * distance,
    z: center.z + direction.z * distance
  });
}

function rawRouteWaypoints(
  route: readonly HexCoord[],
  hexSize: number
): readonly RouteWaypoint[] {
  const centers = route.map((coord) => Object.freeze(axialToWorld(coord, hexSize)));
  const firstDirection = normalizedDirection(centers[0]!, centers[1]!);
  const finalDirection = normalizedDirection(
    centers[centers.length - 2]!,
    centers[centers.length - 1]!
  );
  const keepGate = routeFacingWaypoint(
    centers[0]!,
    firstDirection,
    REALM_WORKER_KEEP_GATE_RADIUS * hexSize
  );
  const siteEntrance = routeFacingWaypoint(
    centers.at(-1)!,
    Object.freeze({ x: -finalDirection.x, z: -finalDirection.z }),
    REALM_WORKER_SITE_RING_RADIUS * hexSize
  );
  return Object.freeze([
    keepGate,
    ...centers.slice(1, -1),
    siteEntrance
  ]);
}

function roundedRouteCandidate(
  points: readonly RouteWaypoint[],
  hexSize: number
): readonly RouteWaypoint[] {
  if (points.length <= 2) return freezeWaypoints(points);
  const result: RouteWaypoint[] = [freezeWaypoint(points[0]!)];
  for (let index = 1; index < points.length - 1; index += 1) {
    const previous = points[index - 1]!;
    const corner = points[index]!;
    const next = points[index + 1]!;
    const incoming = normalizedDirection(previous, corner);
    const outgoing = normalizedDirection(corner, next);
    const directionDot = incoming.x * outgoing.x + incoming.z * outgoing.z;
    if (directionDot > 0.999) {
      result.push(freezeWaypoint(corner));
      continue;
    }
    const incomingLength = Math.hypot(
      corner.x - previous.x,
      corner.z - previous.z
    );
    const outgoingLength = Math.hypot(next.x - corner.x, next.z - corner.z);
    const radius = Math.min(
      hexSize * 0.2,
      incomingLength * 0.24,
      outgoingLength * 0.24
    );
    if (radius <= 0.000_001) {
      result.push(freezeWaypoint(corner));
      continue;
    }
    const entry = Object.freeze({
      x: corner.x - incoming.x * radius,
      z: corner.z - incoming.z * radius
    });
    const exit = Object.freeze({
      x: corner.x + outgoing.x * radius,
      z: corner.z + outgoing.z * radius
    });
    result.push(entry);
    for (const progress of [0.5] as const) {
      const inverse = 1 - progress;
      result.push(Object.freeze({
        x: inverse * inverse * entry.x
          + 2 * inverse * progress * corner.x
          + progress * progress * exit.x,
        z: inverse * inverse * entry.z
          + 2 * inverse * progress * corner.z
          + progress * progress * exit.z
      }));
    }
    result.push(exit);
  }
  result.push(freezeWaypoint(points.at(-1)!));
  return Object.freeze(result);
}

/**
 * Validate every sampled smoothing segment against the canonical dry corridor.
 * If a rounded candidate ever resolves outside it, presentation falls back to
 * the exact canonical polyline rather than guessing a shortcut.
 */
export function resolveCorridorSafeWorkerPolyline(
  rawPoints: readonly HexWorldPosition[],
  smoothedCandidate: readonly HexWorldPosition[],
  canonicalRoute: readonly HexCoord[],
  hexSize: number
): CorridorSafeWorkerPolyline {
  const fallback = freezeWaypoints(rawPoints.filter(finiteWaypoint));
  if (
    !Number.isFinite(hexSize)
    || hexSize <= 0
    || fallback.length < 2
    || smoothedCandidate.length < 2
    || canonicalRoute.length < 2
  ) {
    return Object.freeze({
      points: fallback,
      usedFallback: true,
      validationFailureCount: 1
    });
  }
  const corridor = new Set(canonicalRoute.map((coord) => hexKey(coord)));
  let validationFailureCount = 0;
  for (let index = 0; index < smoothedCandidate.length; index += 1) {
    const from = smoothedCandidate[index]!;
    if (!finiteWaypoint(from)) {
      validationFailureCount += 1;
      continue;
    }
    const to = smoothedCandidate[index + 1];
    const length = to && finiteWaypoint(to)
      ? Math.hypot(to.x - from.x, to.z - from.z)
      : 0;
    const sampleCount = Math.max(1, Math.ceil(length / (hexSize * 0.12)));
    for (let sample = 0; sample <= sampleCount; sample += 1) {
      const progress = sample / sampleCount;
      const point = to && finiteWaypoint(to)
        ? {
            x: THREE.MathUtils.lerp(from.x, to.x, progress),
            z: THREE.MathUtils.lerp(from.z, to.z, progress)
          }
        : from;
      if (!corridor.has(hexKey(worldToNearestAxial(point, hexSize)))) {
        validationFailureCount += 1;
      }
    }
  }
  return validationFailureCount > 0
    ? Object.freeze({
        points: fallback,
        usedFallback: true,
        validationFailureCount
      })
    : Object.freeze({
        points: freezeWaypoints(smoothedCandidate),
        usedFallback: false,
        validationFailureCount: 0
      });
}

function routeMetrics(points: readonly RouteWaypoint[]) {
  const cumulativeDistances = [0];
  let totalLength = 0;
  for (let index = 1; index < points.length; index += 1) {
    totalLength += Math.hypot(
      points[index]!.x - points[index - 1]!.x,
      points[index]!.z - points[index - 1]!.z
    );
    cumulativeDistances.push(totalLength);
  }
  const normalizedProgress = cumulativeDistances.map((distance) => (
    totalLength > 0 ? distance / totalLength : 0
  ));
  const tangents = points.map((_point, index) => {
    if (points.length < 2) return Object.freeze({ x: 0, z: 1 });
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    return normalizedDirection(previous, next);
  });
  return Object.freeze({
    cumulativeDistances: Object.freeze(cumulativeDistances),
    normalizedProgress: Object.freeze(normalizedProgress),
    tangents: Object.freeze(tangents),
    totalLength
  });
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

function compileVisualRoute(
  worker: RealmWorkerSceneRecord,
  route: readonly HexCoord[],
  hexSize: number
): RealmWorkerVisualRoute {
  const routeKey = route.map(hexKey).join(';');
  const cacheKey = [
    worker.ordinal,
    worker.routeSteps,
    String(hexSize),
    routeKey
  ].join(':');
  const cached = visualRouteCache.get(cacheKey);
  if (cached) {
    visualRouteCache.delete(cacheKey);
    visualRouteCache.set(cacheKey, cached);
    return cached;
  }
  const rawRibbon = rawRouteWaypoints(route, hexSize);
  const corridorSafe = resolveCorridorSafeWorkerPolyline(
    rawRibbon,
    roundedRouteCandidate(rawRibbon, hexSize),
    route,
    hexSize
  );
  const idle = offsetWorld(
    route[0]!,
    worker.ordinal,
    REALM_WORKER_IDLE_RING_RADIUS,
    hexSize
  );
  const movementPoints = freezeWaypoints([idle, ...corridorSafe.points]);
  const metrics = routeMetrics(movementPoints);
  const ribbonStartIndex = 1;
  const contract: RealmWorkerRouteContract =
    route.length - 1 === worker.routeSteps ? 'exact-match' : 'normalized-time';
  const compiled = Object.freeze({
    route,
    movementPoints,
    cumulativeDistances: metrics.cumulativeDistances,
    normalizedProgress: metrics.normalizedProgress,
    tangents: metrics.tangents,
    totalLength: metrics.totalLength,
    ribbonPoints: Object.freeze(movementPoints.slice(ribbonStartIndex)),
    ribbonProgress: Object.freeze(metrics.normalizedProgress.slice(ribbonStartIndex)),
    smoothingFallback: corridorSafe.usedFallback,
    corridorValidationFailureCount: corridorSafe.validationFailureCount,
    contract
  }) satisfies RealmWorkerVisualRoute;
  visualRouteCache.set(cacheKey, compiled);
  while (visualRouteCache.size > REALM_WORKER_ROUTE_CACHE_LIMIT) {
    const oldest = visualRouteCache.keys().next().value;
    if (oldest === undefined) break;
    visualRouteCache.delete(oldest);
  }
  return compiled;
}

function poseAlongVisualRoute(
  visualRoute: RealmWorkerVisualRoute,
  forwardProgress: number
) {
  const points = visualRoute.movementPoints;
  const bounded = THREE.MathUtils.clamp(forwardProgress, 0, 1);
  const targetDistance = bounded * visualRoute.totalLength;
  let segmentIndex = Math.max(0, points.length - 2);
  for (let index = 0; index < points.length - 1; index += 1) {
    if (targetDistance <= visualRoute.cumulativeDistances[index + 1]!) {
      segmentIndex = index;
      break;
    }
  }
  const fromDistance = visualRoute.cumulativeDistances[segmentIndex]!;
  const toDistance = visualRoute.cumulativeDistances[segmentIndex + 1]!;
  const segmentLength = toDistance - fromDistance;
  const segmentProgress = bounded >= 1
    ? 1
    : segmentLength > 0
      ? THREE.MathUtils.clamp(
          (targetDistance - fromDistance) / segmentLength,
          0,
          1
        )
      : 0;
  const from = points[segmentIndex]!;
  const to = points[segmentIndex + 1]!;
  const fromTangent = visualRoute.tangents[segmentIndex]!;
  const toTangent = visualRoute.tangents[segmentIndex + 1]!;
  const tangent = normalizedDirection(
    Object.freeze({ x: 0, z: 0 }),
    Object.freeze({
      x: THREE.MathUtils.lerp(fromTangent.x, toTangent.x, segmentProgress),
      z: THREE.MathUtils.lerp(fromTangent.z, toTangent.z, segmentProgress)
    })
  );
  const startYaw = Math.atan2(fromTangent.x, fromTangent.z);
  const endYaw = Math.atan2(toTangent.x, toTangent.z);
  return Object.freeze({
    world: Object.freeze({
      x: THREE.MathUtils.lerp(from.x, to.x, segmentProgress),
      z: THREE.MathUtils.lerp(from.z, to.z, segmentProgress)
    }),
    tangent,
    turnDelta: normalizeAngle(endYaw - startYaw),
    segmentIndex,
    segmentProgress
  });
}

function exactReturnStartProgress(worker: RealmWorkerSceneRecord) {
  if (
    worker.returnStartedAtMicros !== undefined
    && worker.startedAtMicros !== undefined
    && worker.arrivesAtMicros !== undefined
  ) {
    return boundedProgress(
      worker.returnStartedAtMicros,
      worker.startedAtMicros,
      worker.arrivesAtMicros
    );
  }
  return THREE.MathUtils.clamp(
    (worker.returnStartProgressBasisPoints ?? 10_000) / 10_000,
    0,
    1
  );
}

export function getRealmWorkerRouteCacheTelemetry() {
  return Object.freeze({
    size: canonicalRouteCache.size,
    visualSize: visualRouteCache.size,
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

/** Resolve the immutable smoothed presentation path without changing authority. */
export function resolveRealmWorkerVisualRoute(
  worker: RealmWorkerSceneRecord,
  hexSize: number
): RealmWorkerVisualRoute | undefined {
  if (!Number.isFinite(hexSize) || hexSize <= 0) return undefined;
  const route = authoritativeRoute(worker);
  return route && route.length >= 2
    ? compileVisualRoute(worker, route, hexSize)
    : undefined;
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
    const yaw = -Math.PI * 0.5 + (worker.ordinal - 1) * Math.PI * 0.5;
    return Object.freeze({
      world,
      coord: Object.freeze({ ...worker.originCoord }),
      yaw,
      tangent: Object.freeze({ x: Math.sin(yaw), z: Math.cos(yaw) }),
      turnDelta: 0,
      direction: 'idle',
      forwardProgress: 0,
      phaseProgress: 0,
      segmentIndex: 0,
      segmentProgress: 0,
      route: Object.freeze([Object.freeze({ ...worker.originCoord })]),
      contract: 'exact-match'
    });
  }

  const visualRoute = resolveRealmWorkerVisualRoute(worker, hexSize);
  if (!visualRoute) return undefined;
  let forwardProgress = 1;
  let phaseProgress = 1;

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
    forwardProgress = exactReturnStartProgress(worker) * (1 - phaseProgress);
  }

  const interpolated = poseAlongVisualRoute(visualRoute, forwardProgress);
  const returning = worker.status === 'returning';
  const tangent = returning
    ? Object.freeze({
        x: -interpolated.tangent.x,
        z: -interpolated.tangent.z
      })
    : interpolated.tangent;
  const turnDelta = returning ? -interpolated.turnDelta : interpolated.turnDelta;

  return Object.freeze({
    world: interpolated.world,
    coord: Object.freeze(worldToNearestAxial(interpolated.world, hexSize)),
    yaw: Math.atan2(tangent.x, tangent.z),
    tangent,
    turnDelta,
    direction: worker.status,
    forwardProgress,
    phaseProgress,
    segmentIndex: interpolated.segmentIndex,
    segmentProgress: interpolated.segmentProgress,
    route: visualRoute.route,
    contract: visualRoute.contract
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
  const visualRoute = resolveRealmWorkerVisualRoute(worker, hexSize);
  if (!visualRoute) return undefined;
  const points = visualRoute.movementPoints;
  if (pose.direction === 'gathering') {
    return includeGatheringRoute
      ? freezeWaypoints(points)
      : undefined;
  }

  const remaining: HexWorldPosition[] = [freezeWaypoint(pose.world)];
  if (pose.direction === 'outbound') {
    for (let index = pose.segmentIndex + 1; index < points.length; index += 1) {
      remaining.push(freezeWaypoint(points[index]!));
    }
  } else {
    const firstIndex = pose.segmentProgress > 0
      ? pose.segmentIndex
      : pose.segmentIndex - 1;
    for (let index = firstIndex; index >= 0; index -= 1) {
      remaining.push(freezeWaypoint(points[index]!));
    }
  }
  return remaining.length >= 2 ? Object.freeze(remaining) : undefined;
}

function normalizeAngle(value: number) {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function turningClipForPose(pose: RealmWorkerRoutePose) {
  if (
    pose.segmentProgress > 0.72
    || Math.abs(pose.turnDelta) < Math.PI / 30
  ) return undefined;
  return pose.turnDelta > 0 ? 'Turn_Left' as const : 'Turn_Right' as const;
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
