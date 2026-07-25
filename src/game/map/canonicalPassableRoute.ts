import {
  canonicalMetaForKey,
  hexKey,
  neighboringHexes
} from '../../../spacetimedb/src/world';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
} from '../../../spacetimedb/src/waterRevision';

import type { HexCoord } from './hexCoordinates';

export type CanonicalPassableRoute = readonly HexCoord[];

const MAX_CACHED_CANONICAL_ROUTES = 1_024;
const canonicalRouteCache = new Map<string, CanonicalPassableRoute | null>();
const activeWaterCellKeys = new Set(
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => cell.cellKey)
);
const reclaimedLakeCellKeys = new Set(
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
);

function isCanonicalWorkerRouteCell(key: string): boolean {
  if (activeWaterCellKeys.has(key)) return false;
  return canonicalMetaForKey(key)?.passable === true
    || reclaimedLakeCellKeys.has(key);
}

function cacheRoute(key: string, route: CanonicalPassableRoute | undefined) {
  if (canonicalRouteCache.size >= MAX_CACHED_CANONICAL_ROUTES) {
    const oldestKey = canonicalRouteCache.keys().next().value;
    if (typeof oldestKey === 'string') canonicalRouteCache.delete(oldestKey);
  }
  canonicalRouteCache.set(key, route ?? null);
  return route;
}

function reconstructRoute(
  destinationKey: string,
  parentByKey: ReadonlyMap<string, string | undefined>,
  coordinateByKey: ReadonlyMap<string, HexCoord>
): CanonicalPassableRoute | undefined {
  const reversed: HexCoord[] = [];
  let key: string | undefined = destinationKey;
  while (key !== undefined) {
    const coordinate = coordinateByKey.get(key);
    if (coordinate === undefined) return undefined;
    reversed.push(Object.freeze({ q: coordinate.q, r: coordinate.r }));
    key = parentByKey.get(key);
  }
  return Object.freeze(reversed.reverse());
}

/**
 * Deterministic client projection of the canonical dry, passable world graph.
 *
 * The route includes both endpoints, uses the same stable six-neighbour order
 * as `spacetimedb/src/world.ts`, and combines immutable canonical land metadata
 * with the immutable authoritative Water layout. Deployed v12 timing remains
 * authoritative even when its pre-Water step count differs from this visual
 * path, so the client never draws a shortcut across Water or changes outcomes.
 */
export function canonicalPassableRoute(
  origin: HexCoord,
  destination: HexCoord
): CanonicalPassableRoute | undefined {
  const originKey = hexKey(origin.q, origin.r);
  const destinationKey = hexKey(destination.q, destination.r);
  const cacheKey = `${originKey}>${destinationKey}`;
  const cached = canonicalRouteCache.get(cacheKey);
  if (cached !== undefined) return cached ?? undefined;
  if (
    !isCanonicalWorkerRouteCell(originKey)
    || !isCanonicalWorkerRouteCell(destinationKey)
  ) return cacheRoute(cacheKey, undefined);

  const safeOrigin = Object.freeze({ q: origin.q, r: origin.r });
  if (originKey === destinationKey) {
    return cacheRoute(cacheKey, Object.freeze([safeOrigin]));
  }

  const queue: HexCoord[] = [safeOrigin];
  const visited = new Set<string>([originKey]);
  const parentByKey = new Map<string, string | undefined>([[originKey, undefined]]);
  const coordinateByKey = new Map<string, HexCoord>([[originKey, safeOrigin]]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const current = queue[cursor]!;
    const currentKey = hexKey(current.q, current.r);
    for (const neighbor of neighboringHexes(current)) {
      const key = hexKey(neighbor.q, neighbor.r);
      if (visited.has(key) || !isCanonicalWorkerRouteCell(key)) continue;
      const coordinate = Object.freeze({ q: neighbor.q, r: neighbor.r });
      visited.add(key);
      parentByKey.set(key, currentKey);
      coordinateByKey.set(key, coordinate);
      if (key === destinationKey) {
        return cacheRoute(
          cacheKey,
          reconstructRoute(destinationKey, parentByKey, coordinateByKey)
        );
      }
      queue.push(coordinate);
    }
  }
  return cacheRoute(cacheKey, undefined);
}

/**
 * Derive a dry presentation route while retaining the deployed route step
 * count as an authority-shape check.
 *
 * The v12 timing policy predates the Water overlay and may count river cells
 * that a wagon should not visually cross. Journey timing and outcomes remain
 * server-owned; this client-only path therefore follows canonical dry land
 * without hiding an otherwise valid worker when those two graph lengths
 * differ.
 */
export function canonicalDryWorkerPresentationRoute(
  origin: HexCoord,
  destination: HexCoord,
  authoritativeRouteSteps: number
): CanonicalPassableRoute | undefined {
  if (
    !Number.isSafeInteger(authoritativeRouteSteps)
    || authoritativeRouteSteps < 0
  ) return undefined;
  const sameEndpoint = origin.q === destination.q && origin.r === destination.r;
  if (
    (sameEndpoint && authoritativeRouteSteps !== 0)
    || (!sameEndpoint && authoritativeRouteSteps === 0)
  ) return undefined;
  return canonicalPassableRoute(origin, destination);
}
