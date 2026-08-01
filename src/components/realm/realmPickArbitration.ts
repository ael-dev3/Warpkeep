import type { HexCoord } from '../../game/map/hexCoordinates';

export type RealmResourcePickKind =
  | 'gold-site'
  | 'food-site'
  | 'wood-site'
  | 'stone-site';

export type RealmResourcePickHit = Readonly<{
  kind: RealmResourcePickKind;
  siteId: string;
  coord: HexCoord;
  source: 'site' | 'wagon';
  distance: number;
}>;

export type RealmWorkerPickHit = Readonly<{
  workerId: string;
  workerOrdinal: number;
  originCastleId: number;
  coord: HexCoord;
  distance: number;
}>;

export type RealmWaterPickHit = Readonly<{
  cellKey: string;
  bodyId: string;
  regime: 'ocean' | 'river';
  coord: HexCoord;
  distance: number;
}>;

export type RealmCastlePickHit = Readonly<{
  castleId: number;
  coord: HexCoord;
  distance: number;
}>;

export type RealmTerrainPickHit = Readonly<{
  coord: HexCoord;
  distance: number;
}>;

/**
 * Small colliders belonging to the same visible feature can enter a ray at
 * slightly different depths. Preserve gameplay priority only inside that
 * overlap envelope; a genuinely nearer feature must otherwise win.
 */
export const REALM_PICK_OVERLAP_DEPTH_TOLERANCE = 0.9;

/** A visible, public water identity that can be handed to the interaction lane. */
export type RealmWaterInteractionTarget = Readonly<{
  kind: 'water-cell';
  cellKey: string;
  bodyId: string;
  regime: 'ocean' | 'river';
  coord: HexCoord;
}>;

export type RealmInteractionTarget =
  | Readonly<{ kind: 'worker'; workerId: string; workerOrdinal: number; originCastleId: number; coord: HexCoord }>
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>
  | Readonly<{
      kind: RealmResourcePickKind;
      siteId: string;
      coord: HexCoord;
      source: 'site' | 'wagon';
    }>
  | RealmWaterInteractionTarget
  | Readonly<{ kind: 'terrain'; coord: HexCoord }>;

type RealmLayerResourceHit = Readonly<{
  source: 'site' | 'wagon';
  distance: number;
}>;

function hasValidDistance(hit: Readonly<{ distance: number }> | null | undefined) {
  return hit !== null
    && hit !== undefined
    && Number.isFinite(hit.distance)
    && hit.distance >= 0;
}

/** Keep a wagon operable over its site without letting it steal a distant ray. */
export function selectRealmResourceLayerHit<
  TSite extends RealmLayerResourceHit,
  TWagon extends RealmLayerResourceHit
>(
  siteHit: TSite | null | undefined,
  wagonHit: TWagon | null | undefined
): TSite | TWagon | null {
  const site = hasValidDistance(siteHit) ? siteHit : undefined;
  const wagon = hasValidDistance(wagonHit) ? wagonHit : undefined;
  if (!site) return wagon ?? null;
  if (!wagon) return site;
  return wagon.distance <= site.distance + REALM_PICK_OVERLAP_DEPTH_TOLERANCE
    ? wagon
    : site;
}

type RealmRankedPick = Readonly<{
  distance: number;
  priority: number;
  key: string;
  target: RealmInteractionTarget;
}>;

function rankedPickComparator(left: RealmRankedPick, right: RealmRankedPick) {
  return left.priority - right.priority
    || left.distance - right.distance
    || (left.key < right.key ? -1 : left.key > right.key ? 1 : 0);
}

/**
 * Resolve genuinely overlapping scene targets by gameplay intent while never
 * allowing a distant collider to win through a nearer visible feature.
 */
export function arbitrateRealmPick(input: Readonly<{
  resourceHits: readonly RealmResourcePickHit[];
  workerHits?: readonly RealmWorkerPickHit[];
  waterHit?: RealmWaterPickHit | null;
  castleHit?: RealmCastlePickHit | null;
  terrainHit?: RealmTerrainPickHit | null;
}>): RealmInteractionTarget | null {
  const candidates: RealmRankedPick[] = [];
  for (const worker of input.workerHits ?? []) {
    if (!hasValidDistance(worker)) continue;
    candidates.push(Object.freeze({
      distance: worker.distance,
      priority: 0,
      key: `worker:${worker.workerId}`,
      target: Object.freeze({
        kind: 'worker',
        workerId: worker.workerId,
        workerOrdinal: worker.workerOrdinal,
        originCastleId: worker.originCastleId,
        coord: worker.coord
      })
    }));
  }
  for (const resource of input.resourceHits) {
    if (!hasValidDistance(resource)) continue;
    candidates.push(Object.freeze({
      distance: resource.distance,
      priority: resource.source === 'wagon' ? 1 : 3,
      key: `${resource.source}:${resource.kind}:${resource.siteId}`,
      target: Object.freeze({
        kind: resource.kind,
        siteId: resource.siteId,
        coord: resource.coord,
        source: resource.source
      })
    }));
  }
  const castle = input.castleHit;
  if (castle && hasValidDistance(castle)) {
    candidates.push(Object.freeze({
      distance: castle.distance,
      priority: 2,
      key: `castle:${castle.castleId}`,
      target: Object.freeze({
        kind: 'castle',
        castleId: castle.castleId,
        coord: castle.coord
      })
    }));
  }
  const water = input.waterHit;
  if (water && hasValidDistance(water)) {
    candidates.push(Object.freeze({
      distance: water.distance,
      priority: 4,
      key: `water:${water.cellKey}`,
      target: Object.freeze({
        kind: 'water-cell',
        cellKey: water.cellKey,
        bodyId: water.bodyId,
        regime: water.regime,
        coord: water.coord
      })
    }));
  }
  const terrain = input.terrainHit;
  if (terrain && hasValidDistance(terrain)) {
    candidates.push(Object.freeze({
      distance: terrain.distance,
      priority: 5,
      key: `terrain:${terrain.coord.q},${terrain.coord.r}`,
      target: Object.freeze({ kind: 'terrain', coord: terrain.coord })
    }));
  }
  if (candidates.length === 0) return null;
  const nearestDistance = candidates.reduce(
    (nearest, candidate) => Math.min(nearest, candidate.distance),
    Number.POSITIVE_INFINITY
  );
  return candidates
    .filter((candidate) => (
      candidate.distance <= nearestDistance + REALM_PICK_OVERLAP_DEPTH_TOLERANCE
    ))
    .sort(rankedPickComparator)[0]?.target ?? null;
}
