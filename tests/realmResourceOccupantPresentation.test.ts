import { describe, expect, it } from 'vitest';

import {
  MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS,
  realmResourceOccupantMarkerForKey,
  realmResourceOccupantMarkerKey,
  resolveRealmResourceOccupantMarkers,
  visibleRealmResourceOccupantMarkerKeys
} from '../src/components/realm/realmResourceOccupantPresentation';
import type { RealmCastleProjection } from '../src/components/realm/realmMapProjectionStability';
import type { RealmGoldNodePresentation } from '../src/components/realm/realmGoldNodePresentation';
import type {
  ReadyPublicWorkerProjection,
  RealmWorkerNodeOccupation
} from '../src/components/realm/realmWorkerPresentation';

const CASTLE = Object.freeze({
  castleId: 22,
  ownerFid: 2200,
  q: 4,
  r: -2,
  level: 3,
  name: 'Sunlit Bastion'
}) satisfies RealmCastleProjection;

const PROFILE = Object.freeze({
  profile: Object.freeze({
    canonicalUsername: 'other-player',
    displayName: 'Other Player',
    pfpUrl: 'https://warpkeep.com/pfp.webp',
    communityStatsVisible: false
  })
});

function node(overrides: Record<string, unknown> = {}): RealmGoldNodePresentation {
  return {
    siteId: 'genesis-001:gold:0001',
    coord: { q: 8, r: -3 },
    tier: 1,
    availability: 'available',
    occupation: undefined,
    originCastle: undefined,
    occupiedByViewer: false,
    ...overrides
  } as unknown as RealmGoldNodePresentation;
}

function occupation(
  overrides: Partial<RealmWorkerNodeOccupation> = {}
): RealmWorkerNodeOccupation {
  return {
    nodeKey: 'gold:genesis-001:gold:0001',
    resourceKind: 'gold',
    siteId: 'genesis-001:gold:0001',
    workerId: 'genesis-001:castle:22:worker:1',
    workerOrdinal: 1,
    originCastleId: 22,
    phase: 'gathering',
    startedAtMicros: 1n,
    arrivesAtMicros: 2n,
    gatheringEndsAtMicros: 3n,
    timelineRevision: 1,
    ...overrides
  };
}

function projection(
  occupations: readonly RealmWorkerNodeOccupation[]
): Pick<ReadyPublicWorkerProjection, 'mode' | 'occupations'> {
  return { mode: 'active', occupations };
}

describe('resource occupant presentation', () => {
  it('joins an active generic worker lease to its public site, castle, and profile', () => {
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    });

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      resource: 'gold',
      siteId: 'genesis-001:gold:0001',
      nodeCoord: { q: 8, r: -3 },
      castle: { castleId: 22, q: 4, r: -2, name: 'Sunlit Bastion' },
      workerOrdinal: 1,
      workerPhase: 'gathering',
      timelineRevision: 1,
      profile: PROFILE.profile
    });
    expect(realmResourceOccupantMarkerKey(markers[0]!)).toBe('gold:genesis-001:gold:0001');
    expect(markers[0]!.castle).not.toHaveProperty('ownerFid');
  });

  it('omits own assignments and never interprets a legacy wagon as a worker', () => {
    const common = {
      buckets: [{ resource: 'gold' as const, nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]])
    };
    expect(resolveRealmResourceOccupantMarkers({
      ...common,
      workerProjection: projection([occupation()]),
      ownCastleId: CASTLE.castleId
    })).toEqual([]);
    expect(resolveRealmResourceOccupantMarkers({
      ...common,
      buckets: [{
        resource: 'gold',
        nodes: [node({
          availability: 'gathering',
          occupation: { originCastleId: CASTLE.castleId, phase: 'gathering' },
          originCastle: {
            castleId: CASTLE.castleId,
            name: CASTLE.name,
            q: CASTLE.q,
            r: CASTLE.r
          }
        })]
      }],
      workerProjection: projection([])
    })).toEqual([]);
  });

  it.each([
    ['non-canonical key', occupation({ nodeKey: 'gold:wrong' })],
    ['unknown site', occupation({ siteId: 'genesis-001:gold:9999', nodeKey: 'gold:genesis-001:gold:9999' })],
    ['unknown castle', occupation({ originCastleId: 999 })],
    ['invalid phase', occupation({ phase: 'returning' as 'gathering' })]
  ])('fails the marker lane closed for %s', (_label, invalidOccupation) => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([invalidOccupation])
    })).toEqual([]);
  });

  it('fails closed when the resource resolver degraded a malformed legacy site', () => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{
        resource: 'gold',
        nodes: [node({ availability: 'unavailable' })]
      }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    })).toEqual([]);
  });

  it('re-resolves a selected key after a same-site ownership handoff', () => {
    const first = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    });
    const nextCastle = { ...CASTLE, castleId: 23, ownerFid: 2300, name: 'Moon Keep' };
    const nextProfile = {
      profile: { ...PROFILE.profile, canonicalUsername: 'next-player' }
    };
    const next = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [nextCastle],
      profiles: new Map([[nextCastle.castleId, nextProfile]]),
      workerProjection: projection([occupation({
        workerId: 'genesis-001:castle:23:worker:2',
        workerOrdinal: 2,
        originCastleId: 23,
        timelineRevision: 2
      })])
    });

    const key = realmResourceOccupantMarkerKey(first[0]!);
    expect(realmResourceOccupantMarkerForKey(next, key)).toMatchObject({
      castle: { castleId: 23, name: 'Moon Keep' },
      profile: { canonicalUsername: 'next-player' },
      workerOrdinal: 2,
      timelineRevision: 2
    });
  });

  it('bounds viewport markers and culls edges, reserved UI, and collisions', () => {
    const markers = Array.from({ length: 40 }, (_, index) => ({
      resource: 'gold' as const,
      siteId: `site-${index}`,
      x: 30 + index * 48,
      y: 100,
      depth: index / 100,
      visible: true
    }));
    markers.push({
      resource: 'gold',
      siteId: 'offscreen',
      x: -10,
      y: 100,
      depth: 0,
      visible: true
    });
    const keys = visibleRealmResourceOccupantMarkerKeys(
      { width: 2_000, height: 400, markers },
      new Set(markers.map(realmResourceOccupantMarkerKey)),
      [{ left: 20, top: 50, right: 90, bottom: 130 }]
    );

    expect(keys).toHaveLength(MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS);
    expect(keys).not.toContain('gold:site-0');
    expect(keys).not.toContain('gold:site-1');
    expect(keys).not.toContain('gold:offscreen');
  });
});
