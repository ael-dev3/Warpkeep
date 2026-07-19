import { describe, expect, it } from 'vitest';

import {
  resolveRealmGoldNodePresentations
} from '../src/components/realm/realmGoldNodePresentation';
import {
  foodNodeAvailabilityLabel,
  foodNodeCompletedMinutes,
  foodNodeNextAuthorityTimestamp,
  resolveRealmFoodNodePresentations,
  resolveRealmFoodWagonPose,
  type RealmFoodNodeOccupationPublicRecord
} from '../src/components/realm/realmFoodNodePresentation';
import { CANONICAL_TIER_I_FOOD_SITES_V1 } from '../spacetimedb/src/foodSitePolicy';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';

const FOOD_SITES = CANONICAL_TIER_I_FOOD_SITES_V1;
const FOOD_SITE = FOOD_SITES[0]!;
const onlyFoodSite = (coord: Readonly<{ q: number; r: number }>) => (
  coord.q === FOOD_SITE.q && coord.r === FOOD_SITE.r
);
const GOLD_SITE = CANONICAL_TIER_I_GOLD_SITES_V1[0]!;

const FOOD_OCCUPATION = Object.freeze({
  siteId: FOOD_SITE.siteId,
  originCastleId: 7,
  phase: 'gathering' as const,
  startedAtMicros: 1_000_000n,
  arrivesAtMicros: 2_000_000n,
  gatheringEndsAtMicros: 2_592_002_000_000n,
  returnsAtMicros: 2_592_004_000_000n
}) satisfies RealmFoodNodeOccupationPublicRecord;

const CASTLE = Object.freeze({
  castleId: 7,
  name: 'Sunlit Bastion',
  q: 0,
  r: 0
});

describe('realm Food-node presentation', () => {
  it('derives the public one-Food-per-minute view without exposing private balances', () => {
    const nodes = resolveRealmFoodNodePresentations({
      sites: FOOD_SITES,
      occupations: [FOOD_OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: onlyFoodSite
    });

    expect(nodes).toEqual([{
      siteId: FOOD_SITE.siteId,
      coord: { q: FOOD_SITE.q, r: FOOD_SITE.r },
      tier: 1,
      availability: 'gathering',
      occupation: FOOD_OCCUPATION,
      originCastle: CASTLE,
      occupiedByViewer: true
    }]);
    expect(Object.keys(nodes[0]!).join(' ')).not.toMatch(/balance|pending|fid|reward|wallet/i);
    expect(foodNodeAvailabilityLabel(nodes[0]!.availability)).toBe('OCCUPIED · GATHERING');
    expect(foodNodeNextAuthorityTimestamp(nodes[0]!)).toBe(FOOD_OCCUPATION.gatheringEndsAtMicros);
  });

  it('keeps malformed or absent Food data isolated from a valid Gold presentation', () => {
    const validGold = resolveRealmGoldNodePresentations({
      sites: CANONICAL_TIER_I_GOLD_SITES_V1,
      occupations: [],
      castles: [CASTLE],
      isPlayableCoord: (coord) => coord.q === GOLD_SITE.q && coord.r === GOLD_SITE.r
    });
    expect(validGold).toMatchObject([{ siteId: GOLD_SITE.siteId, availability: 'available' }]);
    const validFood = resolveRealmFoodNodePresentations({
      sites: FOOD_SITES,
      occupations: [],
      castles: [CASTLE],
      isPlayableCoord: onlyFoodSite
    });
    expect(validFood).toMatchObject([{ siteId: FOOD_SITE.siteId, availability: 'available' }]);

    expect(resolveRealmFoodNodePresentations({
      sites: undefined,
      occupations: undefined,
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: [...FOOD_SITES.slice(0, -1), FOOD_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: FOOD_SITES,
      occupations: [{ ...FOOD_OCCUPATION, arrivesAtMicros: FOOD_OCCUPATION.startedAtMicros }],
      castles: [CASTLE],
      isPlayableCoord: onlyFoodSite
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: [{ ...FOOD_SITE, tier: 2 }, ...FOOD_SITES.slice(1)],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);

    // The valid Gold resolver is independent from the failed Food projection.
    expect(validGold).toMatchObject([{ siteId: GOLD_SITE.siteId, availability: 'available' }]);
  });

  it('renders a local-only server-timestamp wagon pose and caps Food display minutes', () => {
    const outbound = resolveRealmFoodNodePresentations({
      sites: FOOD_SITES,
      occupations: [{
        ...FOOD_OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE],
      isPlayableCoord: onlyFoodSite
    })[0]!;
    expect(resolveRealmFoodWagonPose(outbound, 60n)).toEqual({
      siteId: FOOD_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: FOOD_SITE.q, r: FOOD_SITE.r }
    });
    expect(foodNodeCompletedMinutes(
      FOOD_OCCUPATION,
      FOOD_OCCUPATION.gatheringEndsAtMicros + 60_000_000n
    )).toBe((FOOD_OCCUPATION.gatheringEndsAtMicros - FOOD_OCCUPATION.arrivesAtMicros) / 60_000_000n);
  });
});
