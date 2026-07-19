import { describe, expect, it } from 'vitest';

import {
  stoneNodeAvailabilityLabel,
  stoneNodeCompletedMinutes,
  stoneNodeNextAuthorityTimestamp,
  resolveRealmStoneNodePresentations,
  resolveRealmStoneWagonPose,
  type RealmStoneNodeOccupationPublicRecord
} from '../src/components/realm/realmStoneNodePresentation';
import { CANONICAL_TIER_I_STONE_SITES_V1 } from '../spacetimedb/src/stoneSitePolicy';

const STONE_SITES = CANONICAL_TIER_I_STONE_SITES_V1;
const STONE_SITE = STONE_SITES[0]!;
const onlyStoneSite = (coord: Readonly<{ q: number; r: number }>) => (
  coord.q === STONE_SITE.q && coord.r === STONE_SITE.r
);

const STONE_OCCUPATION = Object.freeze({
  siteId: STONE_SITE.siteId,
  originCastleId: 7,
  phase: 'gathering' as const,
  startedAtMicros: 1_000_000n,
  arrivesAtMicros: 2_000_000n,
  gatheringEndsAtMicros: 2_592_002_000_000n,
  returnsAtMicros: 2_592_004_000_000n
}) satisfies RealmStoneNodeOccupationPublicRecord;

const CASTLE = Object.freeze({
  castleId: 7,
  name: 'Sunlit Bastion',
  q: 0,
  r: 0
});

describe('realm Stone-node presentation', () => {
  it('derives the public one-Stone-per-minute view without exposing private balances', () => {
    const nodes = resolveRealmStoneNodePresentations({
      sites: STONE_SITES,
      occupations: [STONE_OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: onlyStoneSite
    });

    expect(nodes).toEqual([{
      siteId: STONE_SITE.siteId,
      coord: { q: STONE_SITE.q, r: STONE_SITE.r },
      tier: 1,
      availability: 'gathering',
      occupation: STONE_OCCUPATION,
      originCastle: CASTLE,
      occupiedByViewer: true
    }]);
    expect(Object.keys(nodes[0]!).join(' ')).not.toMatch(/balance|pending|fid|reward|wallet/i);
    expect(stoneNodeAvailabilityLabel(nodes[0]!.availability)).toBe('OCCUPIED · GATHERING');
    expect(stoneNodeNextAuthorityTimestamp(nodes[0]!)).toBe(STONE_OCCUPATION.gatheringEndsAtMicros);
  });

  it('fails Stone closed for missing, duplicate, malformed, foreign, or non-Tier-I rows', () => {
    expect(resolveRealmStoneNodePresentations({
      sites: undefined,
      occupations: undefined,
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmStoneNodePresentations({
      sites: [...STONE_SITES.slice(0, -1), STONE_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmStoneNodePresentations({
      sites: STONE_SITES,
      occupations: [{ ...STONE_OCCUPATION, arrivesAtMicros: STONE_OCCUPATION.startedAtMicros }],
      castles: [CASTLE],
      isPlayableCoord: onlyStoneSite
    })).toEqual([]);
    expect(resolveRealmStoneNodePresentations({
      sites: STONE_SITES,
      occupations: [{ ...STONE_OCCUPATION, siteId: 'genesis-001-tier1-stone-999' }],
      castles: [CASTLE]
    })).toEqual([]);
    expect(resolveRealmStoneNodePresentations({
      sites: [{ ...STONE_SITE, tier: 2 }, ...STONE_SITES.slice(1)],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);
  });

  it('renders a local-only server-timestamp wagon pose and caps Stone display minutes', () => {
    const outbound = resolveRealmStoneNodePresentations({
      sites: STONE_SITES,
      occupations: [{
        ...STONE_OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE],
      isPlayableCoord: onlyStoneSite
    })[0]!;
    expect(resolveRealmStoneWagonPose(outbound, 60n)).toEqual({
      siteId: STONE_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: STONE_SITE.q, r: STONE_SITE.r }
    });
    expect(stoneNodeCompletedMinutes(
      STONE_OCCUPATION,
      STONE_OCCUPATION.gatheringEndsAtMicros + 60_000_000n
    )).toBe((STONE_OCCUPATION.gatheringEndsAtMicros - STONE_OCCUPATION.arrivesAtMicros) / 60_000_000n);
  });
});
