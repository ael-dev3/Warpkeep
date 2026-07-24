import type { HexCoord } from '../../game/map/hexCoordinates';
import type {
  RealmCastlePublicPresentation,
  RealmLabelReservedRect
} from './realmCastlePresentation';
import {
  normalizeRealmUsername,
  safeRealmProfileImageUrl
} from './realmCastlePresentation';
import { normalizePublicProfileText } from '../../security/publicProfileText';
import type { RealmCastleProjection } from './realmMapProjectionStability';
import type {
  RealmFoodNodePresentation
} from './realmFoodNodePresentation';
import type {
  RealmGoldNodePresentation
} from './realmGoldNodePresentation';
import type {
  RealmStoneNodePresentation
} from './realmStoneNodePresentation';
import type {
  RealmWoodNodePresentation
} from './realmWoodNodePresentation';
import type {
  RealmResourceKind,
  RealmResourceProjectionFrame
} from './realmTypes';
import {
  canonicalWorkerId,
  type ReadyPublicWorkerProjection,
  type RealmWorkerPublicPresentation,
  type RealmWorkerOrdinal
} from './realmWorkerPresentation';

export type RealmResourceOccupantNode =
  | RealmGoldNodePresentation
  | RealmFoodNodePresentation
  | RealmWoodNodePresentation
  | RealmStoneNodePresentation;

export type RealmResourceOccupantProfile = Readonly<Pick<
  RealmCastlePublicPresentation,
  'canonicalUsername' | 'displayName' | 'pfpUrl' | 'publicBio' | 'communityStatsVisible'
>>;

export type RealmResourceOccupantMarker = Readonly<{
  source: 'legacy-expedition' | 'generic-worker';
  resource: RealmResourceKind;
  siteId: string;
  nodeCoord: HexCoord;
  tier: number;
  /** Present only for a validated generic-worker lease. */
  workerId?: string;
  workerOrdinal?: RealmWorkerOrdinal;
  workerPhase: 'outbound' | 'gathering' | 'returning';
  timelineRevision?: number;
  occupiedByViewer: boolean;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros?: bigint;
  castle: Readonly<Pick<RealmCastleProjection, 'castleId' | 'name' | 'q' | 'r'>>;
  profile: RealmResourceOccupantProfile;
}>;

export type RealmResourceOccupantResolution =
  | Readonly<{
    status: 'ready';
    markers: readonly RealmResourceOccupantMarker[];
  }>
  | Readonly<{
    status: 'invalid';
    markers: readonly [];
  }>;

const INVALID_RESOURCE_OCCUPANT_RESOLUTION: RealmResourceOccupantResolution =
  Object.freeze({
    status: 'invalid',
    markers: Object.freeze([] as const)
  });

export const RESOURCE_KIND_LABELS: Readonly<Record<RealmResourceKind, string>> = Object.freeze({
  gold: 'Gold Mine',
  food: 'Wheat Farm',
  wood: 'Logging Camp',
  stone: 'Stone Quarry'
});

export const RESOURCE_WORKER_RATE_LABELS: Readonly<Record<RealmResourceKind, string>> = Object.freeze({
  gold: '1 gold / minute',
  food: '1 food / minute',
  wood: '1 wood / minute',
  stone: '1 stone / minute'
});

export const RESOURCE_WORKER_PHASE_LABELS: Readonly<Record<RealmResourceOccupantMarker['workerPhase'], string>> = Object.freeze({
  outbound: 'EN ROUTE TO SITE',
  gathering: 'GATHERING AT SITE',
  returning: 'RETURNING TO KEEP'
});

/** Four stable assignments across the maximum 100-castle Genesis roster. */
export const MAX_RESOURCE_OCCUPANT_ASSIGNMENTS = 400;
const U64_MAX = (1n << 64n) - 1n;
const RESOURCE_KINDS = new Set<RealmResourceKind>(['gold', 'food', 'wood', 'stone']);
const RESOURCE_NODE_AVAILABILITIES = new Set([
  'available',
  'unavailable',
  'outbound',
  'gathering',
  'returning'
]);

type ResourceNodeBucket = Readonly<{
  resource: RealmResourceKind;
  nodes: readonly RealmResourceOccupantNode[];
}>;

function occupantProfile(
  profile: RealmCastlePublicPresentation
): RealmResourceOccupantProfile | undefined {
  if (typeof profile.communityStatsVisible !== 'boolean') return undefined;
  const canonicalUsername = normalizeRealmUsername(profile.canonicalUsername);
  const displayName = normalizePublicProfileText(profile.displayName, 80);
  const pfpUrl = safeRealmProfileImageUrl(profile.pfpUrl);
  const publicBio = normalizePublicProfileText(profile.publicBio, 320);
  return Object.freeze({
    ...(canonicalUsername === undefined ? {} : { canonicalUsername }),
    ...(displayName === undefined ? {} : { displayName }),
    ...(pfpUrl === undefined ? {} : { pfpUrl }),
    ...(publicBio === undefined ? {} : { publicBio }),
    communityStatsVisible: profile.communityStatsVisible
  });
}

/**
 * Normalizes the live legacy expedition graph and the staged generic worker
 * graph into one public-only occupied-site presentation. Generic leases win
 * the canonical resourceKind:siteId key during transition, while legacy rows
 * remain independently visible without generic activation. Any incoherent
 * lease/catalog/castle/profile relationship fails the whole marker lane closed.
 */
export function resolveRealmResourceOccupantMarkerResolution(input: Readonly<{
  buckets: readonly ResourceNodeBucket[];
  castles: readonly RealmCastleProjection[];
  profiles: ReadonlyMap<number, Readonly<{ profile: RealmCastlePublicPresentation }>>;
  workerProjection?: Pick<ReadyPublicWorkerProjection, 'mode' | 'occupations'>;
  /** Raw active mode requires a coherent active public join before availability is trusted. */
  activeGenericModeExpected?: boolean;
  ownCastleId?: number;
}>): RealmResourceOccupantResolution {
  if (input.activeGenericModeExpected && input.workerProjection?.mode !== 'active') {
    return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
  }
  const castlesById = new Map<number, RealmCastleProjection>();
  for (const castle of input.castles) {
    if (
      !Number.isSafeInteger(castle.castleId)
      || castle.castleId <= 0
      || !Number.isSafeInteger(castle.q)
      || !Number.isSafeInteger(castle.r)
      || typeof castle.name !== 'string'
      || normalizePublicProfileText(castle.name, 80) !== castle.name
      || castlesById.has(castle.castleId)
    ) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    castlesById.set(castle.castleId, castle);
  }

  const nodesByKey = new Map<string, Readonly<{
    resource: RealmResourceKind;
    node: RealmResourceOccupantNode;
  }>>();
  for (const bucket of input.buckets) {
    if (!RESOURCE_KINDS.has(bucket.resource)) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    for (const node of bucket.nodes) {
      const key = `${bucket.resource}:${node.siteId}`;
      if (
        typeof node.siteId !== 'string'
        || node.siteId.length === 0
        || !RESOURCE_NODE_AVAILABILITIES.has(node.availability)
        || nodesByKey.has(key)
      ) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
      nodesByKey.set(key, Object.freeze({ resource: bucket.resource, node }));
    }
  }

  const markersByKey = new Map<string, RealmResourceOccupantMarker>();
  const genericOccupationKeys = new Set<string>();
  const genericWorkerIds = new Set<string>();
  for (const occupation of input.workerProjection?.mode === 'active'
    ? input.workerProjection.occupations
    : []) {
    const key = `${occupation.resourceKind}:${occupation.siteId}`;
    const record = nodesByKey.get(key);
    if (
      occupation.nodeKey !== key
      || genericOccupationKeys.has(key)
      || genericWorkerIds.has(occupation.workerId)
      || record?.resource !== occupation.resourceKind
      || record.node.siteId !== occupation.siteId
      || record.node.availability === 'unavailable'
      || !Number.isSafeInteger(record.node.coord.q)
      || !Number.isSafeInteger(record.node.coord.r)
      || !Number.isSafeInteger(record.node.tier)
      || record.node.tier <= 0
      || !Number.isSafeInteger(occupation.originCastleId)
      || occupation.originCastleId <= 0
      || !Number.isSafeInteger(occupation.workerOrdinal)
      || occupation.workerOrdinal < 1
      || occupation.workerOrdinal > 4
      || typeof occupation.workerId !== 'string'
      || occupation.workerId !== canonicalWorkerId(
        occupation.originCastleId,
        occupation.workerOrdinal
      )
      || !Number.isSafeInteger(occupation.timelineRevision)
      || occupation.timelineRevision <= 0
      || (occupation.phase !== 'outbound' && occupation.phase !== 'gathering')
      || typeof occupation.startedAtMicros !== 'bigint'
      || typeof occupation.arrivesAtMicros !== 'bigint'
      || typeof occupation.gatheringEndsAtMicros !== 'bigint'
      || occupation.startedAtMicros < 0n
      || occupation.gatheringEndsAtMicros > U64_MAX
      || !(occupation.startedAtMicros < occupation.arrivesAtMicros)
      || !(occupation.arrivesAtMicros < occupation.gatheringEndsAtMicros)
    ) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    genericOccupationKeys.add(key);
    genericWorkerIds.add(occupation.workerId);

    const castle = castlesById.get(occupation.originCastleId);
    const profile = castle
      ? input.profiles.get(occupation.originCastleId)?.profile
      : undefined;
    const publicProfile = profile ? occupantProfile(profile) : undefined;
    if (!castle || !publicProfile) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    markersByKey.set(key, Object.freeze({
      source: 'generic-worker',
      resource: record.resource,
      siteId: record.node.siteId,
      nodeCoord: Object.freeze({ q: record.node.coord.q, r: record.node.coord.r }),
      tier: record.node.tier,
      workerId: occupation.workerId,
      workerOrdinal: occupation.workerOrdinal,
      workerPhase: occupation.phase,
      timelineRevision: occupation.timelineRevision,
      occupiedByViewer: input.ownCastleId === occupation.originCastleId,
      startedAtMicros: occupation.startedAtMicros,
      arrivesAtMicros: occupation.arrivesAtMicros,
      gatheringEndsAtMicros: occupation.gatheringEndsAtMicros,
      castle: Object.freeze({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      }),
      profile: publicProfile
    }));
  }

  for (const [key, record] of nodesByKey) {
    if (genericOccupationKeys.has(key)) continue;
    const phase = record.node.availability;
    if (phase !== 'outbound' && phase !== 'gathering' && phase !== 'returning') continue;
    const occupation = record.node.occupation;
    const originCastle = record.node.originCastle;
    if (
      occupation === undefined
      || originCastle === undefined
      || !Number.isSafeInteger(record.node.coord.q)
      || !Number.isSafeInteger(record.node.coord.r)
      || !Number.isSafeInteger(record.node.tier)
      || record.node.tier <= 0
      || occupation.siteId !== record.node.siteId
      || occupation.phase !== phase
      || originCastle.castleId !== occupation.originCastleId
      || typeof occupation.startedAtMicros !== 'bigint'
      || typeof occupation.arrivesAtMicros !== 'bigint'
      || typeof occupation.gatheringEndsAtMicros !== 'bigint'
      || typeof occupation.returnsAtMicros !== 'bigint'
      || occupation.startedAtMicros < 0n
      || occupation.returnsAtMicros > U64_MAX
      || !(occupation.startedAtMicros < occupation.arrivesAtMicros)
      || !(occupation.arrivesAtMicros < occupation.gatheringEndsAtMicros)
      || !(occupation.gatheringEndsAtMicros < occupation.returnsAtMicros)
    ) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    const castle = castlesById.get(occupation.originCastleId);
    const profile = castle
      ? input.profiles.get(occupation.originCastleId)?.profile
      : undefined;
    const publicProfile = profile ? occupantProfile(profile) : undefined;
    const occupiedByViewer = input.ownCastleId === occupation.originCastleId;
    if (
      !castle
      || !publicProfile
      || castle.castleId !== originCastle.castleId
      || castle.name !== originCastle.name
      || castle.q !== originCastle.q
      || castle.r !== originCastle.r
      || record.node.occupiedByViewer !== occupiedByViewer
    ) return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
    markersByKey.set(key, Object.freeze({
      source: 'legacy-expedition',
      resource: record.resource,
      siteId: record.node.siteId,
      nodeCoord: Object.freeze({ q: record.node.coord.q, r: record.node.coord.r }),
      tier: record.node.tier,
      workerPhase: phase,
      occupiedByViewer,
      startedAtMicros: occupation.startedAtMicros,
      arrivesAtMicros: occupation.arrivesAtMicros,
      gatheringEndsAtMicros: occupation.gatheringEndsAtMicros,
      returnsAtMicros: occupation.returnsAtMicros,
      castle: Object.freeze({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      }),
      profile: publicProfile
    }));
  }

  if (markersByKey.size > MAX_RESOURCE_OCCUPANT_ASSIGNMENTS) {
    return INVALID_RESOURCE_OCCUPANT_RESOLUTION;
  }
  return Object.freeze({
    status: 'ready',
    markers: Object.freeze([...markersByKey.values()].sort((left, right) => (
      realmResourceOccupantMarkerKey(left).localeCompare(realmResourceOccupantMarkerKey(right))
    )))
  });
}

/** Compatibility helper for consumers that only need the fail-closed marker lane. */
export function resolveRealmResourceOccupantMarkers(
  input: Parameters<typeof resolveRealmResourceOccupantMarkerResolution>[0]
): readonly RealmResourceOccupantMarker[] {
  return resolveRealmResourceOccupantMarkerResolution(input).markers;
}

export function realmResourceOccupantMarkerKey(
  marker: Pick<RealmResourceOccupantMarker, 'resource' | 'siteId'>
) {
  return `${marker.resource}:${marker.siteId}`;
}

/**
 * Returns command authority only for the viewer's exact canonical active
 * generic-worker lease. Legacy expeditions and other keepers remain read-only.
 */
export function realmResourceOccupantRecallWorkerId(
  marker: RealmResourceOccupantMarker
) {
  if (
    marker.source !== 'generic-worker'
    || !marker.occupiedByViewer
    || typeof marker.workerId !== 'string'
    || marker.workerOrdinal === undefined
    || (marker.workerPhase !== 'outbound' && marker.workerPhase !== 'gathering')
  ) return undefined;
  return marker.workerId === canonicalWorkerId(
    marker.castle.castleId,
    marker.workerOrdinal
  )
    ? marker.workerId
    : undefined;
}

export function realmResourceOccupantMarkerForKey(
  markers: readonly RealmResourceOccupantMarker[],
  key: string | null
) {
  return key === null
    ? null
    : markers.find((marker) => realmResourceOccupantMarkerKey(marker) === key) ?? null;
}

/**
 * Resolves an active public worker to the exact occupied resource-site record
 * that was independently validated from the public occupation graph.
 *
 * Idle and returning workers deliberately have no occupied site. An active
 * worker whose worker/site/timeline identity does not match a validated marker
 * also resolves to null so callers can fail closed instead of opening a second,
 * contradictory record for the same gathering assignment.
 */
export function realmResourceOccupantMarkerForWorker(
  markers: readonly RealmResourceOccupantMarker[],
  worker: Pick<
    RealmWorkerPublicPresentation,
    | 'workerId'
    | 'ordinal'
    | 'originCastleId'
    | 'status'
    | 'resourceKind'
    | 'siteId'
    | 'timelineRevision'
  >
) {
  if (
    (worker.status !== 'outbound' && worker.status !== 'gathering')
    || worker.resourceKind === undefined
    || worker.siteId === undefined
  ) return null;
  return markers.find((marker) => (
    marker.source === 'generic-worker'
    && marker.workerId === worker.workerId
    && marker.workerOrdinal === worker.ordinal
    && marker.castle.castleId === worker.originCastleId
    && marker.workerPhase === worker.status
    && marker.resource === worker.resourceKind
    && marker.siteId === worker.siteId
    && marker.timelineRevision === worker.timelineRevision
  )) ?? null;
}

export type RealmWorkerInspectionRoute =
  | Readonly<{
      kind: 'resource-site';
      marker: RealmResourceOccupantMarker;
    }>
  | Readonly<{ kind: 'worker' }>
  | Readonly<{ kind: 'unavailable' }>;

/**
 * Gives every active occupied worker one canonical site inspector. Dedicated
 * worker records remain available only when the worker has no occupied site.
 */
export function resolveRealmWorkerInspectionRoute(
  markers: readonly RealmResourceOccupantMarker[],
  worker: Pick<
    RealmWorkerPublicPresentation,
    | 'workerId'
    | 'ordinal'
    | 'originCastleId'
    | 'status'
    | 'resourceKind'
    | 'siteId'
    | 'timelineRevision'
  >
): RealmWorkerInspectionRoute {
  const marker = realmResourceOccupantMarkerForWorker(markers, worker);
  if (marker) return Object.freeze({ kind: 'resource-site', marker });
  return Object.freeze({
    kind: worker.status === 'idle' || worker.status === 'returning'
      ? 'worker'
      : 'unavailable'
  });
}

export const MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS = 24;
export const RESOURCE_OCCUPANT_MARKER_SIZE_PX = 44;
/** Pointer hit area; the portrait inside remains visually compact at 32px. */
export const RESOURCE_OCCUPANT_PRESENCE_SIZE_PX = 44;

type ResourceOccupantControlOptions = Readonly<{
  /** Ordered keys that should win the bounded interactive lane. */
  priorityKeys?: readonly string[];
  /** Controls whose visible-or-focusable owner caption expands collision bounds. */
  persistentLabelKeys?: ReadonlySet<string>;
}>;

/**
 * Every finite in-frustum authoritative occupation retains a lightweight,
 * non-interactive public-presence marker. This lane deliberately ignores
 * control collisions and reserved UI; the separate interactive lane remains
 * bounded and device-safe.
 */
export function visibleRealmResourceOccupantPresenceKeys(
  frame: RealmResourceProjectionFrame,
  availableKeys: ReadonlySet<string>
): readonly string[] {
  if (
    !Number.isFinite(frame.width)
    || !Number.isFinite(frame.height)
    || frame.width <= 0
    || frame.height <= 0
  ) return Object.freeze([]);
  const half = RESOURCE_OCCUPANT_PRESENCE_SIZE_PX / 2;
  const seen = new Set<string>();
  const keys = frame.markers
    .filter((marker) => (
      marker.visible
      && availableKeys.has(realmResourceOccupantMarkerKey(marker))
      && Number.isFinite(marker.x)
      && Number.isFinite(marker.y)
      && Number.isFinite(marker.depth)
      && marker.x >= half
      && marker.x <= frame.width - half
      && marker.y >= RESOURCE_OCCUPANT_PRESENCE_SIZE_PX
      && marker.y <= frame.height
    ))
    .sort((left, right) => (
      // Passive portraits share one non-interactive stacking lane. Paint
      // farther presences first so the nearer keeper remains visible on top.
      right.depth - left.depth
      || realmResourceOccupantMarkerKey(left).localeCompare(
        realmResourceOccupantMarkerKey(right)
      )
    ))
    .flatMap((marker) => {
      const key = realmResourceOccupantMarkerKey(marker);
      if (seen.has(key)) return [];
      seen.add(key);
      return [key];
    });
  return keys.length <= MAX_RESOURCE_OCCUPANT_ASSIGNMENTS
    ? Object.freeze(keys)
    : Object.freeze([]);
}

/**
 * Keeps the interactive avatar lane inside the actual viewport, away from
 * reserved controls, collision-free, and under a fixed direct-control ceiling.
 */
export function visibleRealmResourceOccupantMarkerKeys(
  frame: RealmResourceProjectionFrame,
  availableKeys: ReadonlySet<string>,
  reservedRects: readonly RealmLabelReservedRect[] = [],
  options: ResourceOccupantControlOptions = {}
): readonly string[] {
  if (
    !Number.isFinite(frame.width)
    || !Number.isFinite(frame.height)
    || frame.width <= 0
    || frame.height <= 0
  ) return Object.freeze([]);
  const half = RESOURCE_OCCUPANT_MARKER_SIZE_PX / 2;
  const priority = new Map(
    (options.priorityKeys ?? []).map((key, index) => [key, index] as const)
  );
  const accepted: Array<Readonly<{
    key: string;
    left: number;
    top: number;
    right: number;
    bottom: number;
  }>> = [];
  const candidates = frame.markers
    .filter((marker) => {
      const key = realmResourceOccupantMarkerKey(marker);
      const persistentLabel = options.persistentLabelKeys?.has(key) === true;
      const horizontalInset = persistentLabel ? 66 : half;
      const lowerInset = persistentLabel ? 23 : 0;
      return marker.visible
        && availableKeys.has(key)
        && Number.isFinite(marker.x)
        && Number.isFinite(marker.y)
        && Number.isFinite(marker.depth)
        && marker.x >= horizontalInset
        && marker.x <= frame.width - horizontalInset
        && marker.y >= RESOURCE_OCCUPANT_MARKER_SIZE_PX
        && marker.y <= frame.height - lowerInset;
    })
    .sort((left, right) => (
      (priority.get(realmResourceOccupantMarkerKey(left)) ?? Number.MAX_SAFE_INTEGER)
        - (priority.get(realmResourceOccupantMarkerKey(right)) ?? Number.MAX_SAFE_INTEGER)
      || left.depth - right.depth
      || realmResourceOccupantMarkerKey(left).localeCompare(
        realmResourceOccupantMarkerKey(right)
      )
    ));

  for (const marker of candidates) {
    if (accepted.length >= MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS) break;
    const key = realmResourceOccupantMarkerKey(marker);
    if (accepted.some((candidate) => candidate.key === key)) continue;
    const persistentLabel = options.persistentLabelKeys?.has(key) === true;
    const bounds = Object.freeze({
      key,
      left: marker.x - (persistentLabel ? 66 : half),
      top: marker.y - RESOURCE_OCCUPANT_MARKER_SIZE_PX,
      right: marker.x + (persistentLabel ? 66 : half),
      bottom: marker.y + (persistentLabel ? 23 : 0)
    });
    const intersects = (rect: RealmLabelReservedRect) => (
      bounds.left < rect.right
      && bounds.right > rect.left
      && bounds.top < rect.bottom
      && bounds.bottom > rect.top
    );
    if (reservedRects.some(intersects) || accepted.some(intersects)) continue;
    accepted.push(bounds);
  }
  return Object.freeze(accepted.map(({ key }) => key));
}

/** Coalesces sub-tenth-pixel motion for the lightweight DOM marker lane. */
export function realmResourceProjectionFrameKey(frame: RealmResourceProjectionFrame) {
  const numberKey = (value: number) => Number.isFinite(value)
    ? Math.round(value * 10)
    : 'invalid';
  return `${numberKey(frame.width)}:${numberKey(frame.height)}:${frame.markers.map((marker) => (
    [
      marker.resource,
      marker.siteId,
      numberKey(marker.x),
      numberKey(marker.y),
      numberKey(marker.depth),
      marker.visible ? 1 : 0
    ].join(':')
  )).join('|')}`;
}
