/**
 * Small, renderer-independent path compiler for deterministic Inner Keep
 * presentation routines. It owns no clock and retains no sampling history.
 */

const PATH_EPSILON_METERS = 0.000_001;

/** Physical look-ahead/look-behind used by the closed-form heading sampler. */
export const INNER_KEEP_PATH_HEADING_BLEND_METERS = 0.45;

export type InnerKeepPathPoint = Readonly<{
  x: number;
  z: number;
}>;

export type InnerKeepCompiledPath = Readonly<{
  pathId: string;
  closed: boolean;
  points: readonly InnerKeepPathPoint[];
  cumulativeDistances: readonly number[];
  totalLength: number;
}>;

export type InnerKeepPathSample = Readonly<{
  position: InnerKeepPathPoint;
  tangent: InnerKeepPathPoint;
  yawRadians: number;
  distance: number;
  normalizedProgress: number;
  segmentIndex: number;
  segmentProgress: number;
}>;

function finitePoint(point: InnerKeepPathPoint | undefined): point is InnerKeepPathPoint {
  return point !== undefined
    && Number.isFinite(point.x)
    && Number.isFinite(point.z);
}

function frozenPoint(point: InnerKeepPathPoint): InnerKeepPathPoint {
  return Object.freeze({ x: point.x, z: point.z });
}

function pointsEqual(left: InnerKeepPathPoint, right: InnerKeepPathPoint): boolean {
  return Math.abs(left.x - right.x) <= PATH_EPSILON_METERS
    && Math.abs(left.z - right.z) <= PATH_EPSILON_METERS;
}

function positiveModulo(value: number, modulus: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(modulus) || modulus <= 0) return 0;
  const remainder = value % modulus;
  return remainder < 0 ? remainder + modulus : remainder;
}

/**
 * Compile cumulative arc length once. Closed paths need not repeat their first
 * point; a repeated final point is normalized away before metrics are built.
 */
export function compileInnerKeepPath(
  pathId: string,
  points: readonly InnerKeepPathPoint[],
  closed: boolean
): InnerKeepCompiledPath {
  if (typeof pathId !== 'string' || pathId.length === 0) {
    throw new Error('Inner Keep path requires a stable non-empty ID.');
  }
  if (!Array.isArray(points) || points.some((point) => !finitePoint(point))) {
    throw new Error(`Inner Keep path ${pathId} contains a non-finite point.`);
  }
  const normalized = [...points];
  if (
    closed
    && normalized.length > 1
    && pointsEqual(normalized[0]!, normalized.at(-1)!)
  ) normalized.pop();
  const minimumPointCount = closed ? 3 : 2;
  if (normalized.length < minimumPointCount) {
    throw new Error(
      `Inner Keep path ${pathId} requires at least ${minimumPointCount} distinct points.`
    );
  }
  const frozenPoints = Object.freeze(normalized.map(frozenPoint));
  const segmentCount = closed ? frozenPoints.length : frozenPoints.length - 1;
  const cumulativeDistances = [0];
  let totalLength = 0;
  for (let segmentIndex = 0; segmentIndex < segmentCount; segmentIndex += 1) {
    const from = frozenPoints[segmentIndex]!;
    const to = frozenPoints[(segmentIndex + 1) % frozenPoints.length]!;
    const segmentLength = Math.hypot(to.x - from.x, to.z - from.z);
    if (!Number.isFinite(segmentLength) || segmentLength <= PATH_EPSILON_METERS) {
      throw new Error(
        `Inner Keep path ${pathId} contains a zero-length segment at ${segmentIndex}.`
      );
    }
    totalLength += segmentLength;
    cumulativeDistances.push(totalLength);
  }
  if (!Number.isFinite(totalLength) || totalLength <= PATH_EPSILON_METERS) {
    throw new Error(`Inner Keep path ${pathId} has no measurable length.`);
  }
  return Object.freeze({
    pathId,
    closed,
    points: frozenPoints,
    cumulativeDistances: Object.freeze(cumulativeDistances),
    totalLength
  });
}

function segmentForDistance(path: InnerKeepCompiledPath, targetDistance: number): number {
  const lastSegmentIndex = path.cumulativeDistances.length - 2;
  let lower = 0;
  let upper = lastSegmentIndex;
  while (lower < upper) {
    const middle = Math.floor((lower + upper) * 0.5);
    if (targetDistance < path.cumulativeDistances[middle + 1]!) upper = middle;
    else lower = middle + 1;
  }
  return Math.min(lastSegmentIndex, lower);
}

function pathDistance(
  path: InnerKeepCompiledPath,
  distanceMeters: number
): number {
  return path.closed
    ? positiveModulo(distanceMeters, path.totalLength)
    : Math.max(0, Math.min(path.totalLength, Number.isFinite(distanceMeters)
      ? distanceMeters
      : 0));
}

function positionAtResolvedDistance(
  path: InnerKeepCompiledPath,
  distance: number
): Readonly<{
  position: InnerKeepPathPoint;
  segmentIndex: number;
  segmentProgress: number;
}> {
  const segmentIndex = segmentForDistance(path, distance);
  const from = path.points[segmentIndex]!;
  const to = path.points[(segmentIndex + 1) % path.points.length]!;
  const segmentStart = path.cumulativeDistances[segmentIndex]!;
  const segmentEnd = path.cumulativeDistances[segmentIndex + 1]!;
  const segmentLength = segmentEnd - segmentStart;
  const segmentProgress = segmentLength > PATH_EPSILON_METERS
    ? Math.max(0, Math.min(1, (distance - segmentStart) / segmentLength))
    : 0;
  return Object.freeze({
    position: Object.freeze({
      x: from.x + (to.x - from.x) * segmentProgress,
      z: from.z + (to.z - from.z) * segmentProgress
    }),
    segmentIndex,
    segmentProgress
  });
}

/** Sample an already-compiled path by physical distance in meters. */
export function sampleInnerKeepPathAtDistance(
  path: InnerKeepCompiledPath,
  distanceMeters: number
): InnerKeepPathSample {
  const distance = pathDistance(path, distanceMeters);
  const resolved = positionAtResolvedDistance(path, distance);
  const from = path.points[resolved.segmentIndex]!;
  const to = path.points[(resolved.segmentIndex + 1) % path.points.length]!;
  const segmentStart = path.cumulativeDistances[resolved.segmentIndex]!;
  const segmentEnd = path.cumulativeDistances[resolved.segmentIndex + 1]!;
  const segmentLength = segmentEnd - segmentStart;
  const fallbackTangentX = (to.x - from.x) / segmentLength;
  const fallbackTangentZ = (to.z - from.z) / segmentLength;
  const headingWindow = Math.min(
    INNER_KEEP_PATH_HEADING_BLEND_METERS,
    path.totalLength * 0.05
  );
  const before = positionAtResolvedDistance(
    path,
    pathDistance(path, distance - headingWindow)
  ).position;
  const after = positionAtResolvedDistance(
    path,
    pathDistance(path, distance + headingWindow)
  ).position;
  const headingX = after.x - before.x;
  const headingZ = after.z - before.z;
  const headingLength = Math.hypot(headingX, headingZ);
  const tangentX = headingLength > PATH_EPSILON_METERS
    ? headingX / headingLength
    : fallbackTangentX;
  const tangentZ = headingLength > PATH_EPSILON_METERS
    ? headingZ / headingLength
    : fallbackTangentZ;
  return Object.freeze({
    position: resolved.position,
    tangent: Object.freeze({ x: tangentX, z: tangentZ }),
    yawRadians: Math.atan2(tangentX, tangentZ),
    distance,
    normalizedProgress: distance / path.totalLength,
    segmentIndex: resolved.segmentIndex,
    segmentProgress: resolved.segmentProgress
  });
}

/**
 * Sample by normalized progress. Open paths clamp to [0, 1]; closed paths wrap
 * so progress 0 and 1 are exactly the same loop pose.
 */
export function sampleInnerKeepPath(
  path: InnerKeepCompiledPath,
  normalizedProgress: number
): InnerKeepPathSample {
  const progress = path.closed
    ? positiveModulo(normalizedProgress, 1)
    : Math.max(0, Math.min(1, Number.isFinite(normalizedProgress)
      ? normalizedProgress
      : 0));
  return sampleInnerKeepPathAtDistance(path, progress * path.totalLength);
}

export function wrapInnerKeepUnitProgress(value: number): number {
  return positiveModulo(value, 1);
}
