import type {
  RealmCastleScreenProjection
} from './realmTypes';
import type {
  RealmScreenPoint,
  RealmScreenRect
} from './realmMeasuredLabelLayout';

export const REALM_IDENTITY_CLUSTER_WIDTH = 96;
export const REALM_IDENTITY_CLUSTER_HEIGHT = 44;
export const REALM_IDENTITY_CLUSTER_MAXIMUM_GRID_POINTS = 8_192;

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

function boundsAt(x: number, y: number): RealmScreenRect {
  return {
    left: x - REALM_IDENTITY_CLUSTER_WIDTH / 2,
    top: y - REALM_IDENTITY_CLUSTER_HEIGHT,
    right: x + REALM_IDENTITY_CLUSTER_WIDTH / 2,
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

function connectedComponents(
  castleIds: readonly number[],
  projections: ReadonlyMap<number, RealmCastleScreenProjection>
) {
  const remaining = new Set(castleIds);
  const components: MutableCluster[] = [];
  while (remaining.size > 0) {
    const seed = [...remaining].sort((left, right) => left - right)[0]!;
    remaining.delete(seed);
    const members = [seed];
    const queue = [seed];
    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const current = projections.get(currentId)!;
      [...remaining].sort((left, right) => left - right).forEach((candidateId) => {
        const candidate = projections.get(candidateId)!;
        if (
          Math.abs(candidate.x - current.x) <= 132
          && Math.abs(candidate.y - current.y) <= 88
        ) {
          remaining.delete(candidateId);
          members.push(candidateId);
          queue.push(candidateId);
        }
      });
    }
    members.sort((left, right) => left - right);
    components.push({ castleIds: members, anchor: centroid(members, projections) });
  }
  return components;
}

function mergeToCapacity(
  input: MutableCluster[],
  maximumClusters: number,
  projections: ReadonlyMap<number, RealmCastleScreenProjection>
) {
  const clusters = input.map((cluster) => ({
    castleIds: [...cluster.castleIds],
    anchor: { ...cluster.anchor }
  }));
  while (clusters.length > maximumClusters) {
    let bestLeft = 0;
    let bestRight = 1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let left = 0; left < clusters.length; left += 1) {
      for (let right = left + 1; right < clusters.length; right += 1) {
        const distance = Math.hypot(
          clusters[left]!.anchor.x - clusters[right]!.anchor.x,
          clusters[left]!.anchor.y - clusters[right]!.anchor.y
        );
        const currentKey = `${clusters[left]!.castleIds[0]}:${clusters[right]!.castleIds[0]}`;
        const bestKey = `${clusters[bestLeft]!.castleIds[0]}:${clusters[bestRight]!.castleIds[0]}`;
        if (distance < bestDistance || (distance === bestDistance && currentKey < bestKey)) {
          bestDistance = distance;
          bestLeft = left;
          bestRight = right;
        }
      }
    }
    const castleIds = [
      ...clusters[bestLeft]!.castleIds,
      ...clusters[bestRight]!.castleIds
    ].sort((left, right) => left - right);
    clusters[bestLeft] = { castleIds, anchor: centroid(castleIds, projections) };
    clusters.splice(bestRight, 1);
  }
  return clusters;
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
  diagnostics: MutablePlacementDiagnostics
): PlacementSpace {
  const minimumX = safeArea.left + REALM_IDENTITY_CLUSTER_WIDTH / 2;
  const maximumX = safeArea.right - REALM_IDENTITY_CLUSTER_WIDTH / 2;
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

function nearestClusterRepresentative(
  castleIds: readonly number[],
  anchor: RealmScreenPoint,
  projections: ReadonlyMap<number, RealmCastleScreenProjection>,
  preferredCastleIds?: ReadonlySet<number>
) {
  const preferredMembers = preferredCastleIds
    ? castleIds.filter((castleId) => preferredCastleIds.has(castleId))
    : [];
  const candidates = preferredMembers.length > 0 ? preferredMembers : castleIds;
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
    { x: anchor.x, y: anchor.y + 52 },
    { x: anchor.x + 108, y: anchor.y },
    { x: anchor.x - 108, y: anchor.y }
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
    Number.isFinite(xStep) ? Math.ceil(108 / xStep) : 0,
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
  for (let radius = localRadius + 1; radius <= maximumRadius; radius += 1) {
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
  const components = mergeToCapacity(
    connectedComponents(castleIds, projectionById),
    maximumClusters,
    projectionById
  ).sort((left, right) => (
    right.castleIds.length - left.castleIds.length
    || left.castleIds[0]! - right.castleIds[0]!
  ));
  const occupied = input.occupiedRects.filter(validRect).map((rect) => (
    expandRect(rect, collisionPadding)
  ));
  const placementSpace = createPlacementSpace(input.safeAreaBounds, diagnostics);
  const placed: RealmCastleIdentityCluster[] = [];
  const overflow: number[] = [];

  components.forEach((component) => {
    const candidate = findPlacementCandidate(
      component.anchor,
      placementSpace,
      diagnostics,
      (point) => {
        const bounds = expandRect(boundsAt(point.x, point.y), collisionPadding);
        return !occupied.some((rect) => intersects(bounds, rect))
          && !placed.some((cluster) => (
            intersects(bounds, expandRect(cluster.bounds, collisionPadding))
          ));
      }
    );
    if (!candidate) {
      if (placed.length === 0) {
        overflow.push(...component.castleIds);
        return;
      }
      const nearest = [...placed].sort((left, right) => (
        Math.hypot(left.anchor.x - component.anchor.x, left.anchor.y - component.anchor.y)
          - Math.hypot(right.anchor.x - component.anchor.x, right.anchor.y - component.anchor.y)
        || left.representativeCastleId - right.representativeCastleId
      ))[0]!;
      const index = placed.indexOf(nearest);
      const mergedIds = [...nearest.castleIds, ...component.castleIds]
        .sort((left, right) => left - right);
      const mergedAnchor = centroid(mergedIds, projectionById);
      placed[index] = Object.freeze({
        ...nearest,
        key: `cluster-${mergedIds[0]}-${mergedIds.length}`,
        castleIds: Object.freeze(mergedIds),
        representativeCastleId: nearestClusterRepresentative(
          mergedIds,
          mergedAnchor,
          projectionById,
          input.preferredRepresentativeCastleIds
        ),
        anchor: Object.freeze(mergedAnchor)
      });
      return;
    }
    const members = Object.freeze([...component.castleIds]);
    placed.push(Object.freeze({
      key: `cluster-${members[0]}-${members.length}`,
      castleIds: members,
      representativeCastleId: nearestClusterRepresentative(
        members,
        component.anchor,
        projectionById,
        input.preferredRepresentativeCastleIds
      ),
      anchor: Object.freeze({ ...component.anchor }),
      x: candidate.x,
      y: candidate.y,
      bounds: Object.freeze(boundsAt(candidate.x, candidate.y))
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
