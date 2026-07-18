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

const FOOD_SITE = Object.freeze({
  siteId: 'genesis-001:food:0001',
  q: -4,
  r: 3,
  tier: 1,
  active: true
});

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
      sites: [FOOD_SITE],
      occupations: [FOOD_OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: () => true
    });

    expect(nodes).toEqual([{
      siteId: FOOD_SITE.siteId,
      coord: { q: -4, r: 3 },
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
      sites: [{
        siteId: 'genesis-001:gold:0001',
        q: 4,
        r: -2,
        tier: 1,
        active: true
      }],
      occupations: [],
      castles: [CASTLE],
      isPlayableCoord: () => true
    });
    expect(validGold).toMatchObject([{ siteId: 'genesis-001:gold:0001', availability: 'available' }]);
    const validFood = resolveRealmFoodNodePresentations({
      sites: [FOOD_SITE],
      occupations: [],
      castles: [CASTLE],
      isPlayableCoord: () => true
    });
    expect(validFood).toMatchObject([{ siteId: FOOD_SITE.siteId, availability: 'available' }]);

    expect(resolveRealmFoodNodePresentations({
      sites: undefined,
      occupations: undefined,
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: [FOOD_SITE, FOOD_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: [FOOD_SITE],
      occupations: [{ ...FOOD_OCCUPATION, arrivesAtMicros: FOOD_OCCUPATION.startedAtMicros }],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmFoodNodePresentations({
      sites: [{ ...FOOD_SITE, tier: 2 }],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);

    // The valid Gold resolver is independent from the failed Food projection.
    expect(validGold).toMatchObject([{ siteId: 'genesis-001:gold:0001', availability: 'available' }]);
  });

  it('renders a local-only server-timestamp wagon pose and caps Food display minutes', () => {
    const outbound = resolveRealmFoodNodePresentations({
      sites: [FOOD_SITE],
      occupations: [{
        ...FOOD_OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE]
    })[0]!;
    expect(resolveRealmFoodWagonPose(outbound, 60n)).toEqual({
      siteId: FOOD_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: -4, r: 3 }
    });
    expect(foodNodeCompletedMinutes(
      FOOD_OCCUPATION,
      FOOD_OCCUPATION.gatheringEndsAtMicros + 60_000_000n
    )).toBe((FOOD_OCCUPATION.gatheringEndsAtMicros - FOOD_OCCUPATION.arrivesAtMicros) / 60_000_000n);
  });
});
