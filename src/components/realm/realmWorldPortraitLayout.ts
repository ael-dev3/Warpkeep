import type { RealmLabelReservedRect } from './realmCastlePresentation';
import type { RealmCameraMode } from './realmCameraController';
import {
  MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS,
  realmResourceOccupantMarkerKey,
  visibleRealmResourceOccupantPresenceKeys,
  type RealmResourceOccupantMarker
} from './realmResourceOccupantPresentation';
import type { RealmWorkerSceneRecord } from './realmWorkerLayer';
import type {
  RealmResourceProjectionFrame,
  RealmWorkerProjectionFrame
} from './realmTypes';

type PortraitLane = 'worker' | 'resource';

/** Matches the existing bounded route/worker presentation ceiling. */
export const MAX_VISIBLE_REALM_WORKER_PORTRAITS = 24;

type PortraitCandidate = Readonly<{
  lane: PortraitLane;
  key: string;
  priority: number;
  depth: number;
  bounds: RealmLabelReservedRect;
}>;

export type RealmWorldWorkerPortraitProjection = Readonly<{
  workerId: string;
  x: number;
  y: number;
}>;

export type RealmWorldResourcePortraitProjection = Readonly<{
  key: string;
  x: number;
  y: number;
}>;

export type RealmWorldPortraitLayout = Readonly<{
  visibleWorkerIds: readonly string[];
  visibleResourceControlKeys: readonly string[];
  visibleResourcePresenceKeys: readonly string[];
  workerProjections: readonly RealmWorldWorkerPortraitProjection[];
  resourceProjections: readonly RealmWorldResourcePortraitProjection[];
  resourceProjectionByKey: ReadonlyMap<
    string,
    RealmWorldResourcePortraitProjection
  >;
  suppressedWorkerCount: number;
  suppressedResourceCount: number;
}>;

export type RealmWorldPortraitLayoutInput = Readonly<{
  cameraMode?: RealmCameraMode;
  workers: readonly RealmWorkerSceneRecord[];
  resourceOccupants: readonly RealmResourceOccupantMarker[];
  workerFrame: RealmWorkerProjectionFrame;
  resourceFrame: RealmResourceProjectionFrame;
  reservedRects?: readonly RealmLabelReservedRect[];
  selectedWorkerId?: string;
  hoveredWorkerId?: string | null;
  selectedResourceKey?: string;
  hoveredResourceKey?: string | null;
}>;

type ResourceProjection = RealmResourceProjectionFrame['markers'][number];
type WorkerProjection = RealmWorkerProjectionFrame['markers'][number];

type ResourceProjectionCache = Readonly<{
  occupantsByKey: ReadonlyMap<string, RealmResourceOccupantMarker>;
  projectedResources: ReadonlyMap<string, ResourceProjection>;
  resourceProjections: readonly RealmWorldResourcePortraitProjection[];
  resourceProjectionByKey: ReadonlyMap<
    string,
    RealmWorldResourcePortraitProjection
  >;
  passivePresenceKeys: readonly string[];
  getCandidates: (
    selectedResourceKey: string | undefined,
    hoveredResourceKey: string | null | undefined
  ) => Readonly<{
    candidates: readonly PortraitCandidate[];
    passivePresenceKeys: readonly string[];
  }>;
}>;

const workerIdentityCache = new WeakMap<
  readonly RealmWorkerSceneRecord[],
  ReadonlyMap<string, RealmWorkerSceneRecord>
>();
const resourceIdentityCache = new WeakMap<
  readonly RealmResourceOccupantMarker[],
  ReadonlyMap<string, RealmResourceOccupantMarker>
>();
const resourceProjectionCache = new WeakMap<
  RealmResourceProjectionFrame,
  ResourceProjectionCache
>();

function portraitRectsIntersect(
  left: RealmLabelReservedRect,
  right: RealmLabelReservedRect
) {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

function portraitRectFitsFrame(
  bounds: RealmLabelReservedRect,
  frame: Readonly<{ width: number; height: number }>
) {
  return bounds.left >= 0
    && bounds.top >= 0
    && bounds.right <= frame.width
    && bounds.bottom <= frame.height;
}

/**
 * Stable five-tier policy shared by moving workers and occupied resource
 * sites. A hovered peer intentionally remains in the calm peer tier.
 */
export function realmWorldPortraitPriority(
  ownedByViewer: boolean,
  selected: boolean,
  hovered: boolean
) {
  if (ownedByViewer) {
    if (selected) return 0;
    if (hovered) return 1;
    return 2;
  }
  return selected ? 3 : 4;
}

function frameIsFinite(frame: Readonly<{ width: number; height: number }>) {
  return Number.isFinite(frame.width)
    && Number.isFinite(frame.height)
    && frame.width > 0
    && frame.height > 0;
}

function projectionIsFinite(
  projection: Readonly<{
    x: number;
    y: number;
    depth: number;
    visible: boolean;
  }>
) {
  return projection.visible
    && Number.isFinite(projection.x)
    && Number.isFinite(projection.y)
    && Number.isFinite(projection.depth);
}

/**
 * Builds an identity map that rejects every duplicated key. Public snapshot
 * validation already guarantees uniqueness; repeating the fail-closed join at
 * the renderer boundary prevents an ambiguous projection from choosing a
 * portrait based on incidental input order.
 */
function uniqueIdentityMap<Item>(
  items: readonly Item[],
  keyFor: (item: Item) => string | undefined
) {
  const records = new Map<string, Item>();
  const duplicates = new Set<string>();
  for (const item of items) {
    const key = keyFor(item);
    if (key === undefined || key.length === 0 || duplicates.has(key)) continue;
    if (records.has(key)) {
      records.delete(key);
      duplicates.add(key);
      continue;
    }
    records.set(key, item);
  }
  return records;
}

function cachedWorkerIdentities(workers: readonly RealmWorkerSceneRecord[]) {
  const cached = workerIdentityCache.get(workers);
  if (cached) return cached;
  const identities = uniqueIdentityMap(
    workers,
    (worker) => validWorkerIdentity(worker) ? worker.workerId : undefined
  );
  workerIdentityCache.set(workers, identities);
  return identities;
}

function cachedResourceIdentities(
  occupants: readonly RealmResourceOccupantMarker[]
) {
  const cached = resourceIdentityCache.get(occupants);
  if (cached) return cached;
  const identities = uniqueIdentityMap(
    occupants,
    (occupant) => validResourceIdentity(occupant)
      ? realmResourceOccupantMarkerKey(occupant)
      : undefined
  );
  resourceIdentityCache.set(occupants, identities);
  return identities;
}

function validWorkerIdentity(worker: RealmWorkerSceneRecord) {
  return typeof worker.workerId === 'string'
    && worker.workerId.length > 0
    && Number.isSafeInteger(worker.ordinal)
    && worker.ordinal >= 1
    && worker.ordinal <= 4
    && Number.isSafeInteger(worker.originCastleId)
    && worker.originCastleId > 0;
}

function validResourceIdentity(marker: RealmResourceOccupantMarker) {
  return typeof marker.siteId === 'string'
    && marker.siteId.length > 0
    && (
      marker.resource === 'gold'
      || marker.resource === 'food'
      || marker.resource === 'wood'
      || marker.resource === 'stone'
    );
}

function uniqueWorkerProjections(
  frame: RealmWorkerProjectionFrame,
  workersById: ReadonlyMap<string, RealmWorkerSceneRecord>
) {
  return uniqueIdentityMap(
    frame.markers.filter((projection) => {
      const worker = workersById.get(projection.workerId);
      return projectionIsFinite(projection)
        && worker !== undefined
        && (worker.status === 'outbound' || worker.status === 'returning')
        && projection.workerOrdinal === worker.ordinal
        && projection.originCastleId === worker.originCastleId
        && projection.phase === worker.status;
    }),
    (projection) => projection.workerId
  );
}

function uniqueResourceProjections(
  frame: RealmResourceProjectionFrame,
  occupantsByKey: ReadonlyMap<string, RealmResourceOccupantMarker>
) {
  return uniqueIdentityMap(
    frame.markers.filter((projection) => (
      projectionIsFinite(projection)
      && occupantsByKey.has(realmResourceOccupantMarkerKey(projection))
    )),
    realmResourceOccupantMarkerKey
  );
}

function comparePortraitCandidates(
  left: PortraitCandidate,
  right: PortraitCandidate
) {
  return left.priority - right.priority
    || left.depth - right.depth
    || left.lane.localeCompare(right.lane)
    || left.key.localeCompare(right.key);
}

function sortedProjectionValues<Projection>(
  projections: ReadonlyMap<string, Projection>
) {
  return [...projections.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([, projection]) => projection);
}

function cachedResourceProjection(
  frame: RealmResourceProjectionFrame,
  occupantsByKey: ReadonlyMap<string, RealmResourceOccupantMarker>
) {
  const cached = resourceProjectionCache.get(frame);
  if (cached?.occupantsByKey === occupantsByKey) return cached;
  const projectedResources = frameIsFinite(frame)
    ? uniqueResourceProjections(frame, occupantsByKey)
    : new Map<string, ResourceProjection>();
  const sortedResources = Object.freeze(sortedProjectionValues(projectedResources));
  const normalizedFrame: RealmResourceProjectionFrame = Object.freeze({
    width: frame.width,
    height: frame.height,
    markers: sortedResources
  });
  const passivePresenceKeys = Object.freeze(
    visibleRealmResourceOccupantPresenceKeys(
      normalizedFrame,
      new Set(occupantsByKey.keys())
    )
  );
  const resourceProjections = Object.freeze(sortedResources.map(
    (projection): RealmWorldResourcePortraitProjection => Object.freeze({
      key: realmResourceOccupantMarkerKey(projection),
      x: projection.x,
      y: projection.y
    })
  ));
  const resourceProjectionByKey = new Map(
    resourceProjections.map((projection) => [projection.key, projection] as const)
  );
  let candidateMemo: Readonly<{
    selectedResourceKey: string | undefined;
    hoveredResourceKey: string | null | undefined;
    candidates: readonly PortraitCandidate[];
    passivePresenceKeys: readonly string[];
  }> | undefined;
  const result: ResourceProjectionCache = Object.freeze({
    occupantsByKey,
    projectedResources,
    resourceProjections,
    resourceProjectionByKey,
    passivePresenceKeys,
    getCandidates: (selectedResourceKey, hoveredResourceKey) => {
      if (
        candidateMemo !== undefined
        && candidateMemo.selectedResourceKey === selectedResourceKey
        && candidateMemo.hoveredResourceKey === hoveredResourceKey
      ) return candidateMemo;
      const candidates: PortraitCandidate[] = [];
      for (const [key, projection] of projectedResources) {
        const occupant = occupantsByKey.get(key);
        if (!occupant) continue;
        const selected = selectedResourceKey === key;
        const hovered = hoveredResourceKey === key;
        const reservation = occupant.source === 'generic-worker'
          && occupant.workerPhase === 'outbound';
        // Resource controls always reserve their full caption footprint.
        // Keeping this geometry independent from hover/focus prevents a
        // control from expanding into a collision and culling itself.
        const horizontalHalf = reservation ? 62 : 66;
        const bounds = Object.freeze({
          left: projection.x - horizontalHalf,
          top: projection.y - 48,
          right: projection.x + horizontalHalf,
          bottom: projection.y + 23
        });
        if (!portraitRectFitsFrame(bounds, frame)) continue;
        candidates.push(Object.freeze({
          lane: 'resource',
          key,
          priority: realmWorldPortraitPriority(
            occupant.occupiedByViewer,
            selected,
            hovered
          ),
          depth: projection.depth,
          bounds
        }));
      }
      candidates.sort(comparePortraitCandidates);
      const prioritizedPassivePresenceKeys = [...passivePresenceKeys]
        .sort((left, right) => {
          const leftMarker = occupantsByKey.get(left);
          const rightMarker = occupantsByKey.get(right);
          if (!leftMarker || !rightMarker) return left.localeCompare(right);
          return realmWorldPortraitPriority(
            leftMarker.occupiedByViewer,
            selectedResourceKey === left,
            hoveredResourceKey === left
          ) - realmWorldPortraitPriority(
            rightMarker.occupiedByViewer,
            selectedResourceKey === right,
            hoveredResourceKey === right
          ) || left.localeCompare(right);
        });
      candidateMemo = Object.freeze({
        selectedResourceKey,
        hoveredResourceKey,
        candidates: Object.freeze(candidates),
        passivePresenceKeys: Object.freeze(prioritizedPassivePresenceKeys)
      });
      return candidateMemo;
    }
  });
  resourceProjectionCache.set(frame, result);
  return result;
}

/**
 * Resolves the complete screen-space worker/resource portrait composition in
 * one pure pass. The result owns membership and stable order only; React keeps
 * DOM/focus state while the renderer continues to apply the latest positions.
 */
export function resolveRealmWorldPortraitLayout(
  input: RealmWorldPortraitLayoutInput
): RealmWorldPortraitLayout {
  const overview = input.cameraMode === 'realm';
  const workersById = cachedWorkerIdentities(input.workers);
  const occupantsByKey = cachedResourceIdentities(input.resourceOccupants);
  const projectedWorkers = frameIsFinite(input.workerFrame)
    ? uniqueWorkerProjections(input.workerFrame, workersById)
    : new Map<string, WorkerProjection>();
  const resourceProjection = cachedResourceProjection(
    input.resourceFrame,
    occupantsByKey
  );
  const projectedResources = resourceProjection.projectedResources;
  const allResourceCandidates = resourceProjection.getCandidates(
    input.selectedResourceKey,
    input.hoveredResourceKey
  );
  const resourceCandidates = overview
    ? Object.freeze({
        ...allResourceCandidates,
        candidates: Object.freeze(allResourceCandidates.candidates.filter((candidate) => {
          const occupant = occupantsByKey.get(candidate.key);
          return occupant?.occupiedByViewer === true
            || input.selectedResourceKey === candidate.key;
        }))
      })
    : allResourceCandidates;
  const workerCandidates: PortraitCandidate[] = [];

  for (const [workerId, projection] of projectedWorkers) {
    const worker = workersById.get(workerId);
    if (!worker) continue;
    const selected = input.selectedWorkerId === workerId;
    const hovered = input.hoveredWorkerId === workerId;
    if (overview && !worker.ownedByViewer && !selected) continue;
    const bounds = Object.freeze({
      left: projection.x - 24,
      top: projection.y - 48,
      right: projection.x + 24,
      bottom: projection.y + 4
    });
    if (!portraitRectFitsFrame(bounds, input.workerFrame)) continue;
    workerCandidates.push(Object.freeze({
      lane: 'worker',
      key: workerId,
      priority: realmWorldPortraitPriority(
        worker.ownedByViewer,
        selected,
        hovered
      ),
      depth: projection.depth,
      bounds
    }));
  }
  workerCandidates.sort(comparePortraitCandidates);

  const reservedRects = input.reservedRects ?? [];
  const acceptedRects: RealmLabelReservedRect[] = [];
  const acceptedWorkerIds: string[] = [];
  const acceptedResourceKeys: string[] = [];
  let workerIndex = 0;
  let resourceIndex = 0;
  while (
    workerIndex < workerCandidates.length
    || resourceIndex < resourceCandidates.candidates.length
  ) {
    const workerCandidate = workerCandidates[workerIndex];
    const resourceCandidate = resourceCandidates.candidates[resourceIndex];
    const useWorker = resourceCandidate === undefined
      || (
        workerCandidate !== undefined
        && comparePortraitCandidates(workerCandidate, resourceCandidate) <= 0
      );
    const candidate = useWorker ? workerCandidate : resourceCandidate;
    if (!candidate) break;
    if (useWorker) workerIndex += 1;
    else resourceIndex += 1;
    if (
      candidate.lane === 'worker'
      && acceptedWorkerIds.length >= MAX_VISIBLE_REALM_WORKER_PORTRAITS
    ) continue;
    if (
      candidate.lane === 'resource'
      && acceptedResourceKeys.length >= MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS
    ) continue;
    if (
      reservedRects.some((reserved) => (
        portraitRectsIntersect(candidate.bounds, reserved)
      ))
      || acceptedRects.some((accepted) => (
        portraitRectsIntersect(candidate.bounds, accepted)
      ))
    ) continue;
    acceptedRects.push(candidate.bounds);
    if (candidate.lane === 'worker') acceptedWorkerIds.push(candidate.key);
    else acceptedResourceKeys.push(candidate.key);
  }

  const acceptedResourceKeySet = new Set(acceptedResourceKeys);
  const passiveRects: RealmLabelReservedRect[] = [];
  const passiveResourceKeys: string[] = [];
  for (const key of resourceCandidates.passivePresenceKeys) {
    if (passiveRects.length >= MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS) break;
    if (acceptedResourceKeySet.has(key)) continue;
    const projection = projectedResources.get(key);
    const occupant = occupantsByKey.get(key);
    if (!projection || !occupant) continue;
    const reservation = occupant.source === 'generic-worker'
      && occupant.workerPhase === 'outbound';
    const horizontalHalf = reservation ? 54 : 24;
    const bounds = Object.freeze({
      left: projection.x - horizontalHalf,
      top: projection.y - 44,
      right: projection.x + horizontalHalf,
      bottom: projection.y + (reservation ? 8 : 2)
    });
    if (
      !portraitRectFitsFrame(bounds, input.resourceFrame)
      || reservedRects.some((reserved) => portraitRectsIntersect(bounds, reserved))
      || acceptedRects.some((accepted) => portraitRectsIntersect(bounds, accepted))
      || passiveRects.some((accepted) => portraitRectsIntersect(bounds, accepted))
    ) continue;
    passiveRects.push(bounds);
    passiveResourceKeys.push(key);
  }

  const workerProjections = sortedProjectionValues(projectedWorkers).map(
    (projection): RealmWorldWorkerPortraitProjection => Object.freeze({
      workerId: projection.workerId,
      x: projection.x,
      y: projection.y
    })
  );

  return Object.freeze({
    visibleWorkerIds: Object.freeze(acceptedWorkerIds),
    visibleResourceControlKeys: Object.freeze(acceptedResourceKeys),
    visibleResourcePresenceKeys: Object.freeze(passiveResourceKeys),
    workerProjections: Object.freeze(workerProjections),
    resourceProjections: resourceProjection.resourceProjections,
    resourceProjectionByKey: resourceProjection.resourceProjectionByKey,
    suppressedWorkerCount: Math.max(
      0,
      projectedWorkers.size - acceptedWorkerIds.length
    ),
    suppressedResourceCount: Math.max(
      0,
      projectedResources.size
        - acceptedResourceKeys.length
        - passiveResourceKeys.length
    )
  });
}
