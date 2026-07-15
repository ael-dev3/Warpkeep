import {
  REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS,
  type RealmScreenPoint,
  type RealmScreenRect
} from './realmMeasuredLabelLayout';
import type {
  RealmCastleScreenProjection
} from './realmTypes';

/** Width for a true multi-keeper aggregate in constrained overview layouts. */
export const REALM_IDENTITY_CLUSTER_WIDTH = 96;
/** A displaced singleton still gets enough room for a readable username. */
export const REALM_IDENTITY_SINGLE_WIDTH = 124;
export const REALM_IDENTITY_CLUSTER_HEIGHT = 44;
export const REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS = 8_192;
/** Aggregate identity remains attached to its representative castle roof. */
export const REALM_IDENTITY_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS =
  REALM_CASTLE_LABEL_MAX_ANCHOR_DISPLACEMENT_PIXELS;
/** A "nearby" aggregate may never hide a long spatial chain. */
export const REALM_IDENTITY_CLUSTER_MAX_MEMBER_DISTANCE_PIXELS = 160;

export type RealmCastleIdentityClusterPlacementDiagnostics = Readonly<{
  safeAreaGridBuildCount: number;
  safeAreaGridPointCount: number;
  placementCandidateListCount: number;
  placementCandidateCount: number;
  placementCandidateSortCount: number;
  placementCandidateDedupeProbeCount: number;
  placementCandidateEvaluationCount: number;
}>;

export type RealmCastleIdentityCluster = Readonly<{
  key: string;
  castleIds: readonly number[];
  representativeCastleId: number;
  anchor: RealmScreenPoint;
  x: number;
  y: number;
  width: number;
  bounds: RealmScreenRect;
}>;

export type RealmCastleIdentityClusterLayout = Readonly<{
  clusters: readonly RealmCastleIdentityCluster[];
  /**
   * Still fully discoverable in Explore when no collision-free map affordance
   * can coexist with the current modal/reserved presentation.
   */
  overflowCastleIds: readonly number[];
}>;

/**
 * React owns only aggregate membership. Camera-frame positions are applied to
 * the existing DOM controls imperatively, just like direct castle labels.
 */
export function realmCastleClusterMembershipSignature(
  clusters: readonly RealmCastleIdentityCluster[]
) {
  return clusters.map((cluster) => (
    `${cluster.key}:${cluster.castleIds.join('.')}:${cluster.representativeCastleId}:${cluster.width}`
  )).join('|');
}

export type RealmCastleIdentityCoverageInput = Readonly<{
  eligibleCastleIds: readonly number[];
  individualCastleIds: readonly number[];
  clusters: readonly Pick<
    RealmCastleIdentityCluster,
    'castleIds' | 'representativeCastleId'
  >[];
  overflowCastleIds: readonly number[];
  exploreCastleIds: readonly number[];
}>;

/**
 * Privacy-safe exact membership proof for the dense identity layer. Every
 * projection-eligible castle must appear in exactly one map outcome and remain
 * discoverable through Explore. Callers expose only the resulting boolean;
 * exact castle membership stays inside the presentation layer.
 */
export function realmCastleIdentityCoverageValid(
  input: RealmCastleIdentityCoverageInput
) {
  const validIds = (ids: readonly number[]) => ids.every((id) => (
    Number.isSafeInteger(id) && id > 0
  ));
  const uniqueSet = (ids: readonly number[]) => {
    if (!validIds(ids)) return null;
    const set = new Set(ids);
    return set.size === ids.length ? set : null;
  };

  const eligible = uniqueSet(input.eligibleCastleIds);
  const individual = uniqueSet(input.individualCastleIds);
  const overflow = uniqueSet(input.overflowCastleIds);
  const explore = uniqueSet(input.exploreCastleIds);
  if (!eligible || !individual || !overflow || !explore) return false;

  const clustered = new Set<number>();
  for (const cluster of input.clusters) {
    const members = uniqueSet(cluster.castleIds);
    if (
      !members
      || members.size === 0
      || !members.has(cluster.representativeCastleId)
    ) return false;
    for (const castleId of members) {
      if (clustered.has(castleId)) return false;
      clustered.add(castleId);
    }
  }

  const accounted = new Set<number>();
  for (const group of [individual, clustered, overflow]) {
    for (const castleId of group) {
      if (accounted.has(castleId)) return false;
      accounted.add(castleId);
    }
  }

  if (accounted.size !== eligible.size) return false;
  for (const castleId of eligible) {
    if (!accounted.has(castleId) || !explore.has(castleId)) return false;
  }
  return true;
}

export type RealmCastleIdentityClusterLayoutInput = Readonly<{
  projections: readonly RealmCastleScreenProjection[];
  clusterCastleIds: readonly number[];
  /**
   * When at least one member is preferred, choose the nearest preferred member
   * as the cluster's focus target. The Realm uses this to reveal a readable
   * keeper before falling back to the nearest identity-pending castle.
   */
  preferredRepresentativeCastleIds?: ReadonlySet<number>;
  safeAreaBounds: RealmScreenRect;
  occupiedRects: readonly RealmScreenRect[];
  /** Projected castle silhouettes use exact overlap, not UI collision padding. */
  protectedCastleRects?: readonly RealmScreenRect[];
  maximumClusters?: number;
  collisionPaddingPixels?: number;
  /** Optional deterministic work telemetry for synthetic QA and regression tests. */
  onPlacementDiagnostics?: (
    diagnostics: RealmCastleIdentityClusterPlacementDiagnostics
  ) => void;
}>;

type MutableCluster = {
  castleIds: number[];
  anchor: RealmScreenPoint;
};

type MutablePlacementDiagnostics = {
  safeAreaGridBuildCount: number;
  safeAreaGridPointCount: number;
  placementCandidateListCount: number;
  placementCandidateCount: number;
  placementCandidateSortCount: number;
  placementCandidateDedupeProbeCount: number;
  placementCandidateEvaluationCount: number;
};

type PlacementSpace = Readonly<{
  minimumX: number;
  maximumX: number;
  minimumY: number;
  maximumY: number;
  xCoordinates: readonly number[];
  yCoordinates: readonly number[];
}>;

function validRect(rect: RealmScreenRect) {
  return Number.isFinite(rect.left)
    && Number.isFinite(rect.top)
    && Number.isFinite(rect.right)
    && Number.isFinite(rect.bottom)
    && rect.right > rect.left
    && rect.bottom > rect.top;
}

function intersects(first: RealmScreenRect, second: RealmScreenRect) {
  return first.left < second.right
    && first.right > second.left
    && first.top < second.bottom
    && first.bottom > second.top;
}

function expandRect(rect: RealmScreenRect, pixels: number): RealmScreenRect {
  return {
    left: rect.left - pixels,
    top: rect.top - pixels,
    right: rect.right + pixels,
    bottom: rect.bottom + pixels
  };
}

function clusterWidth(memberCount: number) {
  return memberCount === 1 ? REALM_IDENTITY_SINGLE_WIDTH : REALM_IDENTITY_CLUSTER_WIDTH;
}

function boundsAt(x: number, y: number, width: number): RealmScreenRect {
  return {
    left: x - width / 2,
    top: y - REALM_IDENTITY_CLUSTER_HEIGHT,
    right: x + width / 2,
    bottom: y
  };
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function centroid(
  castleIds: readonly number[],
  projections: ReadonlyMap<number, RealmCastleScreenProjection>
) {
  const points = castleIds.flatMap((castleId) => {
    const projection = projections.get(castleId);
    return projection ? [{ x: projection.x, y: projection.y }] : [];
  });
  if (points.length === 0) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function boundedNeighborhoods(
  castleIds: readonly number[],
  projections: ReadonlyMap<number, RealmCastleScreenProjection>
) {
  const remaining = new Set(castleIds);
  const components: MutableCluster[] = [];
  while (remaining.size > 0) {
    const seed = [...remaining].sort((left, right) => left - right)[0]!;
    remaining.delete(seed);
    const members = [seed];
    const seedProjection = projections.get(seed)!;
    // Use a seed-bounded neighbourhood instead of transitive connectivity.
    // Otherwise a long chain of individually close castles can collapse into
    // one spatially dishonest aggregate spanning much of the viewport.
    [...remaining].sort((left, right) => left - right).forEach((candidateId) => {
      const candidate = projections.get(candidateId)!;
      if (
        Math.abs(candidate.x - seedProjection.x) <= 132
        && Math.abs(candidate.y - seedProjection.y) <= 88
      ) {
        remaining.delete(candidateId);
        members.push(candidateId);
      }
    });
    members.sort((left, right) => left - right);
    components.push({ castleIds: members, anchor: centroid(members, projections) });
  }
  return components;
}

function pointKey(point: RealmScreenPoint) {
  return `${point.x}:${point.y}`;
}

function createPlacementAxis(
  minimum: number,
  maximum: number,
  nominalStep: number,
  pointCount: number,
  capped: boolean
) {
  if (pointCount <= 1) return [minimum];
  if (!capped) {
    return Array.from({ length: pointCount }, (_, index) => minimum + index * nominalStep);
  }
  const step = (maximum - minimum) / (pointCount - 1);
  return Array.from({ length: pointCount }, (_, index) => minimum + index * step);
}

function createPlacementSpace(
  safeArea: RealmScreenRect,
  width: number,
  diagnostics: MutablePlacementDiagnostics
): PlacementSpace {
  const minimumX = safeArea.left + width / 2;
  const maximumX = safeArea.right - width / 2;
  const minimumY = safeArea.top + REALM_IDENTITY_CLUSTER_HEIGHT;
  const maximumY = safeArea.bottom;
  diagnostics.safeAreaGridBuildCount += 1;
  if (maximumX < minimumX || maximumY < minimumY) {
    return {
      minimumX,
      maximumX,
      minimumY,
      maximumY,
      xCoordinates: Object.freeze([]),
      yCoordinates: Object.freeze([])
    };
  }

  const nominalColumnCount = Math.floor((maximumX - minimumX) / 24) + 1;
  const nominalRowCount = Math.floor((maximumY - minimumY) / 22) + 1;
  const capped = nominalColumnCount * nominalRowCount
    > REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS;
  let columnCount = nominalColumnCount;
  let rowCount = nominalRowCount;
  if (capped) {
    const aspectRatio = nominalColumnCount / nominalRowCount;
    columnCount = Math.min(
      nominalColumnCount,
      Math.max(1, Math.floor(Math.sqrt(
        REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS * aspectRatio
      )))
    );
    rowCount = Math.min(
      nominalRowCount,
      Math.max(1, Math.floor(
        REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS / columnCount
      ))
    );
    if (rowCount === nominalRowCount) {
      columnCount = Math.min(
        nominalColumnCount,
        Math.max(1, Math.floor(
          REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS / rowCount
        ))
      );
    }
    if (columnCount * rowCount > REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS) {
      if (columnCount >= rowCount) {
        columnCount = Math.max(1, Math.floor(
          REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS / rowCount
        ));
      } else {
        rowCount = Math.max(1, Math.floor(
          REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS / columnCount
        ));
      }
    }
  }

  const xCoordinates = createPlacementAxis(
    minimumX,
    maximumX,
    24,
    columnCount,
    capped
  );
  const yCoordinates = createPlacementAxis(
    minimumY,
    maximumY,
    22,
    rowCount,
    capped
  );
  diagnostics.safeAreaGridPointCount = xCoordinates.length * yCoordinates.length;
  return {
    minimumX,
    maximumX,
    minimumY,
    maximumY,
    xCoordinates: Object.freeze(xCoordinates),
    yCoordinates: Object.freeze(yCoordinates)
  };
}

function nearestCoordinateIndex(coordinates: readonly number[], value: number) {
  if (coordinates.length <= 1) return 0;
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;
  if (last <= first) return 0;
  return Math.max(0, Math.min(
    coordinates.length - 1,
    Math.round(((value - first) / (last - first)) * (coordinates.length - 1))
  ));
}

function squaredDistance(point: RealmScreenPoint, anchor: RealmScreenPoint) {
  const x = point.x - anchor.x;
  const y = point.y - anchor.y;
  return x * x + y * y;
}

function withinClusterAttachmentRadius(
  point: RealmScreenPoint,
  anchor: RealmScreenPoint
) {
  return squaredDistance(point, anchor)
    <= REALM_IDENTITY_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS ** 2;
}

function nearestClusterRepresentative(
  castleIds: readonly number[],
  anchor: RealmScreenPoint,
  projections: ReadonlyMap<number, RealmCastleScreenProjection>,
  preferredCastleIds?: ReadonlySet<number>
) {
  const spatiallyHonestMembers = castleIds.filter((candidateId) => {
    const candidate = projections.get(candidateId)!;
    return castleIds.every((memberId) => {
      const member = projections.get(memberId)!;
      return Math.hypot(member.x - candidate.x, member.y - candidate.y)
        <= REALM_IDENTITY_CLUSTER_MAX_MEMBER_DISTANCE_PIXELS;
    });
  });
  const representativePool = spatiallyHonestMembers.length > 0
    ? spatiallyHonestMembers
    : castleIds;
  const preferredMembers = preferredCastleIds
    ? representativePool.filter((castleId) => preferredCastleIds.has(castleId))
    : [];
  const candidates = preferredMembers.length > 0 ? preferredMembers : representativePool;
  let representative = candidates[0]!;
  let representativeDistance = squaredDistance(projections.get(representative)!, anchor);
  for (let index = 1; index < candidates.length; index += 1) {
    const castleId = candidates[index]!;
    const distance = squaredDistance(projections.get(castleId)!, anchor);
    if (
      distance < representativeDistance
      || (distance === representativeDistance && castleId < representative)
    ) {
      representative = castleId;
      representativeDistance = distance;
    }
  }
  return representative;
}

function findPlacementCandidate(
  anchor: RealmScreenPoint,
  placementSpace: PlacementSpace,
  width: number,
  diagnostics: MutablePlacementDiagnostics,
  available: (point: RealmScreenPoint) => boolean
) {
  const {
    minimumX,
    maximumX,
    minimumY,
    maximumY,
    xCoordinates,
    yCoordinates
  } = placementSpace;
  if (
    maximumX < minimumX
    || maximumY < minimumY
    || xCoordinates.length === 0
    || yCoordinates.length === 0
  ) return undefined;
  diagnostics.placementCandidateListCount += 1;
  const preferred = [
    { x: anchor.x, y: anchor.y },
    { x: anchor.x, y: anchor.y - 52 },
    { x: anchor.x + 58, y: anchor.y },
    { x: anchor.x - 58, y: anchor.y },
    { x: anchor.x + 58, y: anchor.y - 52 },
    { x: anchor.x - 58, y: anchor.y - 52 },
    { x: anchor.x, y: anchor.y - 96 }
  ].map((point) => ({
    x: clamp(point.x, minimumX, maximumX),
    y: clamp(point.y, minimumY, maximumY)
  }));

  const centerColumn = nearestCoordinateIndex(xCoordinates, anchor.x);
  const centerRow = nearestCoordinateIndex(yCoordinates, anchor.y);
  const maximumRadius = Math.max(
    centerColumn,
    xCoordinates.length - 1 - centerColumn,
    centerRow,
    yCoordinates.length - 1 - centerRow
  );
  const xStep = xCoordinates.length > 1
    ? xCoordinates[1]! - xCoordinates[0]!
    : Number.POSITIVE_INFINITY;
  const yStep = yCoordinates.length > 1
    ? yCoordinates[1]! - yCoordinates[0]!
    : Number.POSITIVE_INFINITY;
  const localRadius = Math.min(maximumRadius, Math.max(
    1,
    Number.isFinite(xStep)
      ? Math.ceil((width + 12) / xStep)
      : 0,
    Number.isFinite(yStep) ? Math.ceil(52 / yStep) : 0
  ));
  const localCandidates = [...preferred];
  for (
    let row = Math.max(0, centerRow - localRadius);
    row <= Math.min(yCoordinates.length - 1, centerRow + localRadius);
    row += 1
  ) {
    for (
      let column = Math.max(0, centerColumn - localRadius);
      column <= Math.min(xCoordinates.length - 1, centerColumn + localRadius);
      column += 1
    ) {
      localCandidates.push({ x: xCoordinates[column]!, y: yCoordinates[row]! });
    }
  }
  diagnostics.placementCandidateSortCount += localCandidates.length;
  localCandidates.sort((left, right) => (
    squaredDistance(left, anchor) - squaredDistance(right, anchor)
    || left.y - right.y
    || left.x - right.x
  ));

  const candidateKeys = new Set<string>();
  const tryCandidate = (point: RealmScreenPoint, deduplicate: boolean) => {
    diagnostics.placementCandidateDedupeProbeCount += 1;
    if (deduplicate) {
      const key = pointKey(point);
      if (candidateKeys.has(key)) return false;
      candidateKeys.add(key);
    }
    if (!withinClusterAttachmentRadius(point, anchor)) return false;
    diagnostics.placementCandidateCount += 1;
    diagnostics.placementCandidateEvaluationCount += 1;
    return available(point);
  };

  for (const point of localCandidates) {
    if (tryCandidate(point, true)) return point;
  }

  const visitGridCell = (row: number, column: number) => {
    if (
      row < 0
      || row >= yCoordinates.length
      || column < 0
      || column >= xCoordinates.length
    ) return undefined;
    const point = { x: xCoordinates[column]!, y: yCoordinates[row]! };
    return tryCandidate(point, false) ? point : undefined;
  };
  const maximumAttachmentGridRadius = Math.max(
    1,
    Number.isFinite(xStep)
      ? Math.ceil(REALM_IDENTITY_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS / xStep)
      : 0,
    Number.isFinite(yStep)
      ? Math.ceil(REALM_IDENTITY_CLUSTER_MAX_ANCHOR_DISPLACEMENT_PIXELS / yStep)
      : 0
  );
  const boundedMaximumRadius = Math.min(maximumRadius, maximumAttachmentGridRadius);
  for (let radius = localRadius + 1; radius <= boundedMaximumRadius; radius += 1) {
    const top = centerRow - radius;
    const bottom = centerRow + radius;
    const left = centerColumn - radius;
    const right = centerColumn + radius;
    for (let column = left; column <= right; column += 1) {
      const topCandidate = visitGridCell(top, column);
      if (topCandidate) return topCandidate;
      if (bottom !== top) {
        const bottomCandidate = visitGridCell(bottom, column);
        if (bottomCandidate) return bottomCandidate;
      }
    }
    for (let row = top + 1; row < bottom; row += 1) {
      const leftCandidate = visitGridCell(row, left);
      if (leftCandidate) return leftCandidate;
      if (right !== left) {
        const rightCandidate = visitGridCell(row, right);
        if (rightCandidate) return rightCandidate;
      }
    }
  }
  return undefined;
}

/**
 * Every projection-eligible castle omitted from the individual label layer is
 * deterministically accounted for by either one collision-free spatial
 * cluster or the always-accessible Explore surface. No identity is silently
 * discarded and cluster membership is independent of subscription order.
 */
export function resolveRealmCastleIdentityClusters(
  input: RealmCastleIdentityClusterLayoutInput
): RealmCastleIdentityClusterLayout {
  const diagnostics: MutablePlacementDiagnostics = {
    safeAreaGridBuildCount: 0,
    safeAreaGridPointCount: 0,
    placementCandidateListCount: 0,
    placementCandidateCount: 0,
    placementCandidateSortCount: 0,
    placementCandidateDedupeProbeCount: 0,
    placementCandidateEvaluationCount: 0
  };
  const reportDiagnostics = () => {
    input.onPlacementDiagnostics?.(Object.freeze({ ...diagnostics }));
  };
  if (!validRect(input.safeAreaBounds)) {
    const layout = Object.freeze({
      clusters: Object.freeze([]),
      overflowCastleIds: Object.freeze([...new Set(input.clusterCastleIds)].sort((a, b) => a - b))
    });
    reportDiagnostics();
    return layout;
  }
  const projectionById = new Map(input.projections.map((projection) => [
    projection.castleId,
    projection
  ]));
  const castleIds = [...new Set(input.clusterCastleIds)]
    .filter((castleId) => {
      const projection = projectionById.get(castleId);
      return projection !== undefined
        && projection.visible
        && Number.isFinite(projection.x)
        && Number.isFinite(projection.y);
    })
    .sort((left, right) => left - right);
  if (castleIds.length === 0) {
    const layout = Object.freeze({ clusters: Object.freeze([]), overflowCastleIds: Object.freeze([]) });
    reportDiagnostics();
    return layout;
  }

  const maximumClusters = Number.isFinite(input.maximumClusters)
    ? Math.max(1, Math.min(12, Math.floor(input.maximumClusters!)))
    : 6;
  const collisionPadding = Number.isFinite(input.collisionPaddingPixels)
    ? Math.max(0, input.collisionPaddingPixels!)
    : 4;
  const components = boundedNeighborhoods(castleIds, projectionById).sort((left, right) => (
    right.castleIds.length - left.castleIds.length
    || left.castleIds[0]! - right.castleIds[0]!
  ));
  const occupied = input.occupiedRects.filter(validRect).map((rect) => (
    expandRect(rect, collisionPadding)
  ));
  const protectedCastles = (input.protectedCastleRects ?? []).filter(validRect);
  const placementSpaces = new Map<number, PlacementSpace>();
  const placementSpaceForWidth = (width: number) => {
    const existing = placementSpaces.get(width);
    if (existing) return existing;
    const created = createPlacementSpace(input.safeAreaBounds, width, diagnostics);
    placementSpaces.set(width, created);
    return created;
  };
  const placed: RealmCastleIdentityCluster[] = [];
  const overflow: number[] = [];

  components.forEach((component) => {
    if (placed.length >= maximumClusters) {
      overflow.push(...component.castleIds);
      return;
    }
    const width = clusterWidth(component.castleIds.length);
    const representativeCastleId = nearestClusterRepresentative(
      component.castleIds,
      component.anchor,
      projectionById,
      input.preferredRepresentativeCastleIds
    );
    const representativeProjection = projectionById.get(representativeCastleId)!;
    const representativeAnchor = {
      x: representativeProjection.x,
      y: representativeProjection.y
    };
    const maximumMemberDistance = component.castleIds.reduce((maximum, castleId) => {
      const projection = projectionById.get(castleId)!;
      return Math.max(maximum, Math.hypot(
        projection.x - representativeAnchor.x,
        projection.y - representativeAnchor.y
      ));
    }, 0);
    if (maximumMemberDistance > REALM_IDENTITY_CLUSTER_MAX_MEMBER_DISTANCE_PIXELS) {
      overflow.push(...component.castleIds);
      return;
    }
    const candidate = findPlacementCandidate(
      representativeAnchor,
      placementSpaceForWidth(width),
      width,
      diagnostics,
      (point) => {
        const rawBounds = boundsAt(point.x, point.y, width);
        const bounds = expandRect(rawBounds, collisionPadding);
        return !protectedCastles.some((rect) => intersects(rawBounds, rect))
          && !occupied.some((rect) => intersects(bounds, rect))
          && !placed.some((cluster) => (
            intersects(bounds, expandRect(cluster.bounds, collisionPadding))
          ));
      }
    );
    if (!candidate) {
      overflow.push(...component.castleIds);
      return;
    }
    const members = Object.freeze([...component.castleIds]);
    placed.push(Object.freeze({
      key: `cluster-${members[0]}-${members.length}`,
      castleIds: members,
      representativeCastleId,
      anchor: Object.freeze(representativeAnchor),
      x: candidate.x,
      y: candidate.y,
      width,
      bounds: Object.freeze(boundsAt(candidate.x, candidate.y, width))
    }));
  });

  const layout = Object.freeze({
    clusters: Object.freeze(placed.sort((left, right) => (
      left.representativeCastleId - right.representativeCastleId
    ))),
    overflowCastleIds: Object.freeze(overflow.sort((left, right) => left - right))
  });
  reportDiagnostics();
  return layout;
}
