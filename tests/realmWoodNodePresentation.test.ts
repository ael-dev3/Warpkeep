import { describe, expect, it } from 'vitest';

import {
  woodNodeAvailabilityLabel,
  woodNodeCompletedMinutes,
  woodNodeNextAuthorityTimestamp,
  resolveRealmWoodNodePresentations,
  resolveRealmWoodWagonPose,
  type RealmWoodNodeOccupationPublicRecord
} from '../src/components/realm/realmWoodNodePresentation';

const WOOD_SITE = Object.freeze({
  siteId: 'genesis-001:wood:0001',
  q: -4,
  r: 3,
  tier: 1,
  active: true
});

const WOOD_OCCUPATION = Object.freeze({
  siteId: WOOD_SITE.siteId,
  originCastleId: 7,
  phase: 'gathering' as const,
  startedAtMicros: 1_000_000n,
  arrivesAtMicros: 2_000_000n,
  gatheringEndsAtMicros: 2_592_002_000_000n,
  returnsAtMicros: 2_592_004_000_000n
}) satisfies RealmWoodNodeOccupationPublicRecord;

const CASTLE = Object.freeze({
  castleId: 7,
  name: 'Sunlit Bastion',
  q: 0,
  r: 0
});

describe('realm Wood-node presentation', () => {
  it('derives the public one-Wood-per-minute view without exposing private balances', () => {
    const nodes = resolveRealmWoodNodePresentations({
      sites: [WOOD_SITE],
      occupations: [WOOD_OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: () => true
    });

    expect(nodes).toEqual([{
      siteId: WOOD_SITE.siteId,
      coord: { q: -4, r: 3 },
      tier: 1,
      availability: 'gathering',
      occupation: WOOD_OCCUPATION,
      originCastle: CASTLE,
      occupiedByViewer: true
    }]);
    expect(Object.keys(nodes[0]!).join(' ')).not.toMatch(/balance|pending|fid|reward|wallet/i);
    expect(woodNodeAvailabilityLabel(nodes[0]!.availability)).toBe('OCCUPIED · GATHERING');
    expect(woodNodeNextAuthorityTimestamp(nodes[0]!)).toBe(WOOD_OCCUPATION.gatheringEndsAtMicros);
  });

  it('fails Wood closed for missing, duplicate, malformed, or non-Tier-I rows', () => {
    expect(resolveRealmWoodNodePresentations({
      sites: undefined,
      occupations: undefined,
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmWoodNodePresentations({
      sites: [WOOD_SITE, WOOD_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmWoodNodePresentations({
      sites: [WOOD_SITE],
      occupations: [{ ...WOOD_OCCUPATION, arrivesAtMicros: WOOD_OCCUPATION.startedAtMicros }],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmWoodNodePresentations({
      sites: [{ ...WOOD_SITE, tier: 2 }],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
  });

  it('renders a local-only server-timestamp wagon pose and caps Wood display minutes', () => {
    const outbound = resolveRealmWoodNodePresentations({
      sites: [WOOD_SITE],
      occupations: [{
        ...WOOD_OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE]
    })[0]!;
    expect(resolveRealmWoodWagonPose(outbound, 60n)).toEqual({
      siteId: WOOD_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: -4, r: 3 }
    });
    expect(woodNodeCompletedMinutes(
      WOOD_OCCUPATION,
      WOOD_OCCUPATION.gatheringEndsAtMicros + 60_000_000n
    )).toBe((WOOD_OCCUPATION.gatheringEndsAtMicros - WOOD_OCCUPATION.arrivesAtMicros) / 60_000_000n);
  });
});
