import { describe, expect, it } from 'vitest';

import {
  goldNodeAvailabilityLabel,
  goldNodeCompletedMinutes,
  goldNodeNextAuthorityTimestamp,
  resolveRealmGoldNodePresentations,
  resolveRealmGoldWagonPose,
  type RealmGoldNodeOccupationPublicRecord
} from '../src/components/realm/realmGoldNodePresentation';

const GOLD_SITE = Object.freeze({
  siteId: 'genesis-001:gold:0001',
  q: 4,
  r: -2,
  tier: 1,
  active: true
});

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
      sites: [GOLD_SITE],
      occupations: [OCCUPATION],
      castles: [CASTLE],
      ownCastleId: 7,
      isPlayableCoord: () => true
    });

    expect(nodes).toEqual([{
      siteId: GOLD_SITE.siteId,
      coord: { q: 4, r: -2 },
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
      sites: [GOLD_SITE],
      occupations: [{ ...OCCUPATION, originCastleId: 999 }],
      castles: [CASTLE],
      isPlayableCoord: () => true
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
      sites: [GOLD_SITE, GOLD_SITE],
      occupations: [],
      castles: [CASTLE]
    })).toEqual([]);

    const contradictory = {
      ...OCCUPATION,
      phase: 'gathering' as const,
      gatheringEndsAtMicros: OCCUPATION.arrivesAtMicros - 1n
    };
    const nodes = resolveRealmGoldNodePresentations({
      sites: [GOLD_SITE],
      occupations: [contradictory],
      castles: [CASTLE]
    });
    expect(nodes[0]).toMatchObject({ availability: 'unavailable' });

    const equalBoundary = resolveRealmGoldNodePresentations({
      sites: [GOLD_SITE],
      occupations: [{ ...OCCUPATION, arrivesAtMicros: OCCUPATION.startedAtMicros }],
      castles: [CASTLE]
    });
    expect(equalBoundary[0]).toMatchObject({ availability: 'unavailable' });
  });

  it('uses persistent phase/timestamps for a local-only wagon pose without changing server state', () => {
    const outbound = resolveRealmGoldNodePresentations({
      sites: [GOLD_SITE],
      occupations: [{
        ...OCCUPATION,
        phase: 'outbound',
        startedAtMicros: 10n,
        arrivesAtMicros: 110n,
        gatheringEndsAtMicros: 2_592_000_110n,
        returnsAtMicros: 2_592_000_210n
      }],
      castles: [CASTLE]
    })[0]!;
    const outboundPose = resolveRealmGoldWagonPose(outbound, 60n);
    expect(outboundPose).toEqual({
      siteId: GOLD_SITE.siteId,
      phase: 'outbound',
      progress: 0.5,
      from: { q: 0, r: 0 },
      to: { q: 4, r: -2 }
    });

    const returning = resolveRealmGoldNodePresentations({
      sites: [GOLD_SITE],
      occupations: [{ ...OCCUPATION, phase: 'returning' }],
      castles: [CASTLE]
    })[0]!;
    const returningPose = resolveRealmGoldWagonPose(
      returning,
      OCCUPATION.gatheringEndsAtMicros + 1_000_000n
    );
    expect(returningPose?.phase).toBe('returning');
    expect(returningPose?.from).toEqual({ q: 4, r: -2 });
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
