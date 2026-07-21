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

export type RealmInteractionTarget =
  | Readonly<{ kind: 'worker'; workerId: string; workerOrdinal: number; originCastleId: number; coord: HexCoord }>
  | Readonly<{ kind: 'castle'; castleId: number; coord: HexCoord }>
  | Readonly<{
      kind: RealmResourcePickKind;
      siteId: string;
      coord: HexCoord;
      source: 'site' | 'wagon';
    }>
  | Readonly<{ kind: 'terrain'; coord: HexCoord }>;

function nearestValidHit(
  hits: readonly RealmResourcePickHit[],
  source: RealmResourcePickHit['source']
) {
  let nearest: RealmResourcePickHit | undefined;
  for (const hit of hits) {
    if (
      hit.source !== source
      || !Number.isFinite(hit.distance)
      || hit.distance < 0
    ) continue;
    if (!nearest || hit.distance < nearest.distance) nearest = hit;
  }
  return nearest;
}

/**
 * Resolve overlapping scene targets by gameplay intent, not mesh distance.
 * Moving wagons remain operable over a keep; keeps remain operable beneath a
 * static site collider; only then does the nearest static site or terrain win.
 */
export function arbitrateRealmPick(input: Readonly<{
  resourceHits: readonly RealmResourcePickHit[];
  workerHits?: readonly RealmWorkerPickHit[];
  castleHit?: Readonly<{ castleId: number; coord: HexCoord }> | null;
  terrainHit?: Readonly<{ coord: HexCoord }> | null;
}>): RealmInteractionTarget | null {
  const worker = (input.workerHits ?? []).find((hit) => Number.isFinite(hit.distance) && hit.distance >= 0);
  if (worker) {
    return Object.freeze({
      kind: 'worker',
      workerId: worker.workerId,
      workerOrdinal: worker.workerOrdinal,
      originCastleId: worker.originCastleId,
      coord: worker.coord
    });
  }
  const wagon = nearestValidHit(input.resourceHits, 'wagon');
  if (wagon) {
    return Object.freeze({
      kind: wagon.kind,
      siteId: wagon.siteId,
      coord: wagon.coord,
      source: wagon.source
    });
  }
  if (input.castleHit) {
    return Object.freeze({
      kind: 'castle',
      castleId: input.castleHit.castleId,
      coord: input.castleHit.coord
    });
  }
  const site = nearestValidHit(input.resourceHits, 'site');
  if (site) {
    return Object.freeze({
      kind: site.kind,
      siteId: site.siteId,
      coord: site.coord,
      source: site.source
    });
  }
  return input.terrainHit
    ? Object.freeze({ kind: 'terrain', coord: input.terrainHit.coord })
    : null;
}
