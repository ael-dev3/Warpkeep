import type { HexCoord } from '../../game/map/hexCoordinates';
import type {
  RealmCastlePublicPresentation,
  RealmLabelReservedRect
} from './realmCastlePresentation';
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
import type {
  ReadyPublicWorkerProjection,
  RealmWorkerOrdinal
} from './realmWorkerPresentation';

export type RealmResourceOccupantNode =
  | RealmGoldNodePresentation
  | RealmFoodNodePresentation
  | RealmWoodNodePresentation
  | RealmStoneNodePresentation;

export type RealmResourceOccupantMarker = Readonly<{
  resource: RealmResourceKind;
  siteId: string;
  nodeCoord: HexCoord;
  tier: number;
  workerOrdinal: RealmWorkerOrdinal;
  workerPhase: 'outbound' | 'gathering';
  timelineRevision: number;
  castle: Readonly<Pick<RealmCastleProjection, 'castleId' | 'name' | 'q' | 'r'>>;
  profile: RealmCastlePublicPresentation;
}>;

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
  gathering: 'GATHERING AT SITE'
});

type ResourceNodeBucket = Readonly<{
  resource: RealmResourceKind;
  nodes: readonly RealmResourceOccupantNode[];
}>;

/**
 * Joins the validated generic-worker lease projection to the immutable public
 * site catalogs and the already-sanitized castle/profile graph. Legacy wagon
 * occupations are deliberately not interpreted as workers. Any incoherent
 * lease/catalog relationship fails the whole marker lane closed.
 */
export function resolveRealmResourceOccupantMarkers(input: Readonly<{
  buckets: readonly ResourceNodeBucket[];
  castles: readonly RealmCastleProjection[];
  profiles: ReadonlyMap<number, Readonly<{ profile: RealmCastlePublicPresentation }>>;
  workerProjection?: Pick<ReadyPublicWorkerProjection, 'mode' | 'occupations'>;
  ownCastleId?: number;
}>): readonly RealmResourceOccupantMarker[] {
  if (input.workerProjection?.mode !== 'active') return Object.freeze([]);

  const castlesById = new Map<number, RealmCastleProjection>();
  for (const castle of input.castles) {
    if (
      !Number.isSafeInteger(castle.castleId)
      || castle.castleId <= 0
      || castlesById.has(castle.castleId)
    ) return Object.freeze([]);
    castlesById.set(castle.castleId, castle);
  }

  const nodesByKey = new Map<string, Readonly<{
    resource: RealmResourceKind;
    node: RealmResourceOccupantNode;
  }>>();
  for (const bucket of input.buckets) {
    for (const node of bucket.nodes) {
      const key = `${bucket.resource}:${node.siteId}`;
      if (
        typeof node.siteId !== 'string'
        || node.siteId.length === 0
        || nodesByKey.has(key)
      ) return Object.freeze([]);
      nodesByKey.set(key, Object.freeze({ resource: bucket.resource, node }));
    }
  }

  const markers: RealmResourceOccupantMarker[] = [];
  const occupationKeys = new Set<string>();
  for (const occupation of input.workerProjection.occupations) {
    const key = `${occupation.resourceKind}:${occupation.siteId}`;
    const record = nodesByKey.get(key);
    if (
      occupation.nodeKey !== key
      || occupationKeys.has(key)
      || record?.resource !== occupation.resourceKind
      || record.node.siteId !== occupation.siteId
      || record.node.availability !== 'available'
      || record.node.occupation !== undefined
      || record.node.originCastle !== undefined
      || !Number.isSafeInteger(record.node.coord.q)
      || !Number.isSafeInteger(record.node.coord.r)
      || !Number.isSafeInteger(record.node.tier)
      || record.node.tier <= 0
      || !Number.isSafeInteger(occupation.originCastleId)
      || occupation.originCastleId <= 0
      || !Number.isSafeInteger(occupation.workerOrdinal)
      || occupation.workerOrdinal < 1
      || occupation.workerOrdinal > 4
      || !Number.isSafeInteger(occupation.timelineRevision)
      || occupation.timelineRevision <= 0
      || (occupation.phase !== 'outbound' && occupation.phase !== 'gathering')
    ) return Object.freeze([]);
    occupationKeys.add(key);

    const castle = castlesById.get(occupation.originCastleId);
    const profile = castle
      ? input.profiles.get(occupation.originCastleId)?.profile
      : undefined;
    if (!castle || !profile) return Object.freeze([]);
    if (input.ownCastleId === occupation.originCastleId) continue;

    markers.push(Object.freeze({
      resource: record.resource,
      siteId: record.node.siteId,
      nodeCoord: Object.freeze({ q: record.node.coord.q, r: record.node.coord.r }),
      tier: record.node.tier,
      workerOrdinal: occupation.workerOrdinal,
      workerPhase: occupation.phase,
      timelineRevision: occupation.timelineRevision,
      castle: Object.freeze({
        castleId: castle.castleId,
        name: castle.name,
        q: castle.q,
        r: castle.r
      }),
      profile
    }));
  }

  return Object.freeze(markers.sort((left, right) => (
    realmResourceOccupantMarkerKey(left).localeCompare(realmResourceOccupantMarkerKey(right))
  )));
}

export function realmResourceOccupantMarkerKey(
  marker: Pick<RealmResourceOccupantMarker, 'resource' | 'siteId'>
) {
  return `${marker.resource}:${marker.siteId}`;
}

export function realmResourceOccupantMarkerForKey(
  markers: readonly RealmResourceOccupantMarker[],
  key: string | null
) {
  return key === null
    ? null
    : markers.find((marker) => realmResourceOccupantMarkerKey(marker) === key) ?? null;
}

export const MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS = 24;
export const RESOURCE_OCCUPANT_MARKER_SIZE_PX = 44;

/**
 * Keeps the remote-avatar lane inside the actual viewport, away from reserved
 * controls, collision-free, and under a fixed DOM/network ceiling.
 */
export function visibleRealmResourceOccupantMarkerKeys(
  frame: RealmResourceProjectionFrame,
  availableKeys: ReadonlySet<string>,
  reservedRects: readonly RealmLabelReservedRect[] = []
): readonly string[] {
  if (frame.width <= 0 || frame.height <= 0) return Object.freeze([]);
  const half = RESOURCE_OCCUPANT_MARKER_SIZE_PX / 2;
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
      return marker.visible
        && availableKeys.has(key)
        && Number.isFinite(marker.x)
        && Number.isFinite(marker.y)
        && Number.isFinite(marker.depth)
        && marker.x >= half
        && marker.x <= frame.width - half
        && marker.y >= RESOURCE_OCCUPANT_MARKER_SIZE_PX
        && marker.y <= frame.height;
    })
    .sort((left, right) => (
      left.depth - right.depth
      || realmResourceOccupantMarkerKey(left).localeCompare(
        realmResourceOccupantMarkerKey(right)
      )
    ));

  for (const marker of candidates) {
    if (accepted.length >= MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS) break;
    const key = realmResourceOccupantMarkerKey(marker);
    const bounds = Object.freeze({
      key,
      left: marker.x - half,
      top: marker.y - RESOURCE_OCCUPANT_MARKER_SIZE_PX,
      right: marker.x + half,
      bottom: marker.y
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
