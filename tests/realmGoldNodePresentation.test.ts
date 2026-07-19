import { describe, expect, it } from 'vitest';

import {
  goldNodeAvailabilityLabel,
  goldNodeCompletedMinutes,
  goldNodeNextAuthorityTimestamp,
  resolveRealmGoldNodePresentations,
  resolveRealmGoldWagonPose,
  type RealmGoldNodeOccupationPublicRecord
} from '../src/components/realm/realmGoldNodePresentation';
import { CANONICAL_TIER_I_GOLD_SITES_V1 } from '../spacetimedb/src/goldSitePolicy';

const GOLD_SITES = CANONICAL_TIER_I_GOLD_SITES_V1;
const GOLD_SITE = GOLD_SITES[0]!;
const onlyGoldSite = (coord: Readonly<{ q: number; r: number }>) => (
  coord.q === GOLD_SITE.q && coord.r === GOLD_SITE.r
);

const OCCUPATION = Object.freeze({
  siteId: GOLD_SITE.siteId,
  originCastleId: 7,
  phase: 'gathering' as const,
  startedAtMicros: 1_000_000n,
  arrivesAtMicros: 2_000_000n,
  gatheringEndsAtMicros: 2_592_002_000_000n,
  returnsAtMicros: 2_592_004_000_000n
}) satisfies RealmGoldNodeOccupationPublicRecord;

const CASTLE = Object.freeze({
  castleId: 7,
  name: 'Sunlit Bastion',
  q: 0,
  r: 0
});

describe('realm Gold-node presentation', () => {
  it('derives public availability and owner-only display context without exposing balances', () => {
    const nodes = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: onlyGoldSite
    });

    expect(nodes).toEqual([{
      siteId: GOLD_SITE.siteId,
      coord: { q: GOLD_SITE.q, r: GOLD_SITE.r },
      tier: 1,
      availability: 'gathering',
      occupation: OCCUPATION,
      originCastle: CASTLE,
      occupiedByViewer: true
    }]);
    expect(Object.keys(nodes[0]!).join(' ')).not.toMatch(/balance|pending|fid|reward|wallet/i);
    expect(goldNodeAvailabilityLabel(nodes[0]!.availability)).toBe('OCCUPIED · GATHERING');
    expect(goldNodeNextAuthorityTimestamp(nodes[0]!)).toBe(OCCUPATION.gatheringEndsAtMicros);
  });

  it('keeps a node unavailable rather than falsely free when its public occupation cannot be joined to a castle', () => {
    const nodes = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [{ ...OCCUPATION, originCastleId: 999 }],
      castles: [CASTLE],
      isPlayableCoord: onlyGoldSite
    });

    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toMatchObject({
      availability: 'unavailable',
      occupiedByViewer: false
    });
    expect(nodes[0]).not.toHaveProperty('occupation');
    expect(nodes[0]).not.toHaveProperty('originCastle');
  });

  it('fails closed to no Gold nodes while the authoritative v5 tables are absent or contradictory', () => {
    expect(resolveRealmGoldNodePresentations({
      sites: undefined,
      occupations: undefined,
      castles: [CASTLE]
    })).toEqual([]);

    expect(resolveRealmGoldNodePresentations({
      sites: [...GOLD_SITES.slice(0, -1), GOLD_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);

    const contradictory = {
      ...OCCUPATION,
      phase: 'gathering' as const,
      gatheringEndsAtMicros: OCCUPATION.arrivesAtMicros - 1n
    };
    const nodes = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [contradictory],
      castles: [CASTLE],
      isPlayableCoord: onlyGoldSite
    });
    expect(nodes[0]).toMatchObject({ availability: 'unavailable' });

    const equalBoundary = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [{ ...OCCUPATION, arrivesAtMicros: OCCUPATION.startedAtMicros }],
      castles: [CASTLE],
      isPlayableCoord: onlyGoldSite
    });
    expect(equalBoundary[0]).toMatchObject({ availability: 'unavailable' });
  });

  it('uses persistent phase/timestamps for a local-only wagon pose without changing server state', () => {
    const outbound = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [{
        ...OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE],
      isPlayableCoord: onlyGoldSite
    })[0]!;
    const outboundPose = resolveRealmGoldWagonPose(outbound, 60n);
    expect(outboundPose).toEqual({
      siteId: GOLD_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: GOLD_SITE.q, r: GOLD_SITE.r }
    });

    const returning = resolveRealmGoldNodePresentations({
      sites: GOLD_SITES,
      occupations: [{ ...OCCUPATION, phase: 'returning' }],
      castles: [CASTLE],
      isPlayableCoord: onlyGoldSite
    })[0]!;
    const returningPose = resolveRealmGoldWagonPose(
      returning,
      OCCUPATION.gatheringEndsAtMicros + 1_000_000n
    );
    expect(returningPose?.phase).toBe('returning');
    expect(returningPose?.from).toEqual({ q: GOLD_SITE.q, r: GOLD_SITE.r });
    expect(returningPose?.to).toEqual({ q: 0, r: 0 });
    expect(returningPose?.progress).toBe(0.5);
  });

  it('counts completed minutes only for display and caps the calculation at the server gathering boundary', () => {
    expect(goldNodeCompletedMinutes(OCCUPATION, OCCUPATION.arrivesAtMicros)).toBe(0n);
    expect(goldNodeCompletedMinutes(OCCUPATION, OCCUPATION.arrivesAtMicros + 119_999_999n))
      .toBe(1n);
    expect(goldNodeCompletedMinutes(OCCUPATION, OCCUPATION.gatheringEndsAtMicros + 99_000_000n))
      .toBe((OCCUPATION.gatheringEndsAtMicros - OCCUPATION.arrivesAtMicros) / 60_000_000n);
  });
});
