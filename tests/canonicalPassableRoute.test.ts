import { describe, expect, it } from 'vitest';

import {
  canonicalPassableRoute,
  canonicalDryWorkerPresentationRoute
} from '../src/game/map/canonicalPassableRoute';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  canonicalPassableRouteSteps
} from '../spacetimedb/src/goldSitePolicy';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';
import { CANONICAL_TIER_I_WOOD_SITES_V1 } from '../spacetimedb/src/woodSitePolicy';
import {
  CANONICAL_CASTLE_SLOTS,
  CANONICAL_WORLD_TILE_META,
  canonicalMetaForKey,
  hexDistance
} from '../spacetimedb/src/world';
import {
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1,
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
} from '../spacetimedb/src/waterRevision';
import { GENESIS_WATER_CELLS_V1 } from '../spacetimedb/src/waterWorld';

const SITE_CATALOGS = Object.freeze([
  Object.freeze({ kind: 'gold', sites: CANONICAL_TIER_I_GOLD_SITES_V1 }),
  Object.freeze({ kind: 'food', sites: CANONICAL_TIER_I_FOOD_SITES_V1 }),
  Object.freeze({ kind: 'wood', sites: CANONICAL_TIER_I_WOOD_SITES_V1 }),
  Object.freeze({ kind: 'stone', sites: CANONICAL_TIER_I_STONE_SITES_V1 })
]);
const ACTIVE_WATER_CELL_KEYS = new Set(
  GENESIS_WATER_REVISION_ENABLED_CELLS_V1.map((cell) => cell.cellKey)
);
const RECLAIMED_LAKE_CELL_KEYS = new Set(
  GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1
);

describe('canonical passable client routes', () => {
  it('uses the stable server neighbour order and returns frozen endpoints', () => {
    const origin = CANONICAL_CASTLE_SLOTS[0]!;
    const destination = CANONICAL_TIER_I_FOOD_SITES_V1[5]!;
    const first = canonicalPassableRoute(origin, destination);
    const second = canonicalPassableRoute(origin, destination);

    expect(first).toBeDefined();
    expect(first).toEqual(second);
    expect(first?.[0]).toEqual({ q: origin.q, r: origin.r });
    expect(first?.at(-1)).toEqual({ q: destination.q, r: destination.r });
    expect(Object.isFrozen(first)).toBe(true);
    expect(first?.every(Object.isFrozen)).toBe(true);
  });

  it('keeps every sampled resource journey visible on dry land when v12 step timing differs', () => {
    let matchingStepCounts = 0;
    let differingStepCounts = 0;
    for (const [catalogIndex, catalog] of SITE_CATALOGS.entries()) {
      for (const [siteIndex, site] of catalog.sites.entries()) {
        const origin = CANONICAL_CASTLE_SLOTS[
          (siteIndex * 17 + catalogIndex * 11) % CANONICAL_CASTLE_SLOTS.length
        ]!;
        const authoritativeSteps = canonicalPassableRouteSteps(origin, site);
        const route = canonicalPassableRoute(origin, site);

        expect(authoritativeSteps, `${catalog.kind}:${site.siteId}`).toBeDefined();
        expect(route, `${catalog.kind}:${site.siteId}`).toBeDefined();
        const presentationRoute = canonicalDryWorkerPresentationRoute(
          origin,
          site,
          authoritativeSteps!
        );
        expect(presentationRoute, `${catalog.kind}:${site.siteId}`).toEqual(route);
        if (route!.length - 1 === authoritativeSteps) {
          matchingStepCounts += 1;
        } else {
          differingStepCounts += 1;
        }
      }
    }
    expect(matchingStepCounts).toBeGreaterThan(0);
    expect(differingStepCounts).toBeGreaterThan(0);
  }, 15_000);

  it('keeps every sampled segment adjacent, dry, on canonical land, and passable', () => {
    for (const [catalogIndex, catalog] of SITE_CATALOGS.entries()) {
      for (const [siteIndex, site] of catalog.sites.entries()) {
        const origin = CANONICAL_CASTLE_SLOTS[
          (siteIndex * 17 + catalogIndex * 11) % CANONICAL_CASTLE_SLOTS.length
        ]!;
        const route = canonicalPassableRoute(origin, site)!;

        route.forEach((coordinate, index) => {
          const key = `${coordinate.q},${coordinate.r}`;
          const meta = canonicalMetaForKey(key);
          expect(
            meta?.passable === true || RECLAIMED_LAKE_CELL_KEYS.has(key),
            `${catalog.kind}:${site.siteId}:${index}`
          ).toBe(true);
          expect(ACTIVE_WATER_CELL_KEYS.has(key), `${catalog.kind}:${site.siteId}:${index}`)
            .toBe(false);
          if (index > 0) expect(hexDistance(route[index - 1]!, coordinate)).toBe(1);
        });
      }
    }
  }, 15_000);

  it('rejects scenic blockers, active Water, and coordinates outside the world', () => {
    const origin = CANONICAL_CASTLE_SLOTS[0]!;
    const blocker = CANONICAL_WORLD_TILE_META.find((row) => !row.passable)!;
    const ocean = GENESIS_WATER_CELLS_V1.find((cell) => cell.regime === 'ocean')!;
    const river = GENESIS_WATER_CELLS_V1.find((cell) => cell.regime === 'river')!;
    const reclaimedLake = GENESIS_WATER_CELLS_V1.find(
      (cell) => cell.cellKey === GENESIS_WATER_REVISION_RECLAIMED_LAKE_KEYS_V1[0]
    )!;

    expect(canonicalPassableRoute(origin, {
      q: Number(blocker.tileKey.split(',')[0]),
      r: Number(blocker.tileKey.split(',')[1])
    })).toBeUndefined();
    expect(canonicalPassableRoute(origin, ocean)).toBeUndefined();
    expect(canonicalPassableRoute(origin, river)).toBeUndefined();
    expect(canonicalPassableRoute(origin, reclaimedLake)?.at(-1))
      .toEqual({ q: reclaimedLake.q, r: reclaimedLake.r });
    expect(canonicalPassableRoute({ q: 999, r: 999 }, origin)).toBeUndefined();
  });

  it('validates the authority step shape without treating v12 Water drift as a visual failure', () => {
    const origin = CANONICAL_CASTLE_SLOTS[0]!;
    const destination = CANONICAL_TIER_I_GOLD_SITES_V1[0]!;
    const steps = canonicalPassableRouteSteps(origin, destination)!;
    const route = canonicalPassableRoute(origin, destination);

    expect(canonicalDryWorkerPresentationRoute(origin, origin, 0))
      .toEqual([{ q: origin.q, r: origin.r }]);
    expect(canonicalDryWorkerPresentationRoute(origin, destination, steps - 1))
      .toEqual(route);
    expect(canonicalDryWorkerPresentationRoute(origin, destination, steps + 1))
      .toEqual(route);
    expect(canonicalDryWorkerPresentationRoute(origin, destination, 0))
      .toBeUndefined();
    expect(canonicalDryWorkerPresentationRoute(origin, origin, 1))
      .toBeUndefined();
    expect(canonicalDryWorkerPresentationRoute(origin, destination, -1))
      .toBeUndefined();
    expect(canonicalDryWorkerPresentationRoute(origin, destination, 1.5))
      .toBeUndefined();
  });
});
