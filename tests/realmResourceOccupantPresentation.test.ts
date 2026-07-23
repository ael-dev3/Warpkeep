import { describe, expect, it } from 'vitest';

import {
  MAX_RESOURCE_OCCUPANT_ASSIGNMENTS,
  MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS,
  realmResourceOccupantMarkerForKey,
  realmResourceOccupantMarkerKey,
  resolveRealmResourceOccupantMarkerResolution,
  resolveRealmResourceOccupantMarkers,
  visibleRealmResourceOccupantMarkerKeys,
  visibleRealmResourceOccupantPresenceKeys
} from '../src/components/realm/realmResourceOccupantPresentation';
import type { RealmCastleProjection } from '../src/components/realm/realmMapProjectionStability';
import { publicProfileForCastle } from '../src/components/realm/realmCastlePresentation';
import type { RealmGoldNodePresentation } from '../src/components/realm/realmGoldNodePresentation';
import type {
  ReadyPublicWorkerProjection,
  RealmWorkerNodeOccupation
} from '../src/components/realm/realmWorkerPresentation';
import { WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH } from '../src/security/publicImageUrl';

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
    communityStatsVisible: true,
    totalSnapBurnedMicros: 99n,
    marksBalanceMicros: 88n
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

function legacyNode(
  resource: 'gold' | 'food' | 'wood' | 'stone',
  phase: 'outbound' | 'gathering' | 'returning' = 'gathering',
  overrides: Record<string, unknown> = {}
): RealmGoldNodePresentation {
  const siteId = `genesis-001:${resource}:0001`;
  return node({
    siteId,
    availability: phase,
    occupation: {
      siteId,
      originCastleId: CASTLE.castleId,
      phase,
      startedAtMicros: 1n,
      arrivesAtMicros: 2n,
      gatheringEndsAtMicros: 3n,
      returnsAtMicros: 4n
    },
    originCastle: {
      castleId: CASTLE.castleId,
      name: CASTLE.name,
      q: CASTLE.q,
      r: CASTLE.r
    },
    occupiedByViewer: false,
    ...overrides
  });
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
      source: 'generic-worker',
      workerOrdinal: 1,
      workerPhase: 'gathering',
      timelineRevision: 1,
      occupiedByViewer: false,
      startedAtMicros: 1n,
      arrivesAtMicros: 2n,
      gatheringEndsAtMicros: 3n,
      profile: {
        canonicalUsername: 'other-player',
        displayName: 'Other Player',
        pfpUrl: 'https://warpkeep.com/pfp.webp',
        communityStatsVisible: true
      }
    });
    expect(realmResourceOccupantMarkerKey(markers[0]!)).toBe('gold:genesis-001:gold:0001');
    expect(markers[0]!.castle).not.toHaveProperty('ownerFid');
    expect(markers[0]!.profile).not.toHaveProperty('totalSnapBurnedMicros');
    expect(markers[0]!.profile).not.toHaveProperty('marksBalanceMicros');
  });

  it('includes the viewer’s own generic worker and identifies it as owned', () => {
    const common = {
      buckets: [{ resource: 'gold' as const, nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]])
    };
    expect(resolveRealmResourceOccupantMarkers({
      ...common,
      workerProjection: projection([occupation()]),
      ownCastleId: CASTLE.castleId
    })).toMatchObject([{
      source: 'generic-worker',
      occupiedByViewer: true,
      workerOrdinal: 1
    }]);
  });

  it('normalizes all four live legacy resource types without generic activation', () => {
    const resources = ['gold', 'food', 'wood', 'stone'] as const;
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: resources.map((resource) => ({
        resource,
        nodes: [legacyNode(resource)]
      })),
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]])
    });

    expect(markers).toHaveLength(4);
    expect(markers.map((marker) => marker.resource)).toEqual([
      'food',
      'gold',
      'stone',
      'wood'
    ]);
    expect(markers).toEqual(expect.arrayContaining(resources.map((resource) => (
      expect.objectContaining({
        source: 'legacy-expedition',
        resource,
        workerPhase: 'gathering',
        occupiedByViewer: false,
        returnsAtMicros: 4n
      })
    ))));
  });

  it.each(['outbound', 'gathering', 'returning'] as const)(
    'preserves the authoritative legacy %s phase',
    (phase) => {
      expect(resolveRealmResourceOccupantMarkers({
        buckets: [{ resource: 'wood', nodes: [legacyNode('wood', phase)] }],
        castles: [CASTLE],
        profiles: new Map([[CASTLE.castleId, PROFILE]])
      })).toMatchObject([{
        source: 'legacy-expedition',
        workerPhase: phase
      }]);
    }
  );

  it('includes the viewer’s own legacy expedition', () => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{
        resource: 'food',
        nodes: [legacyNode('food', 'outbound', { occupiedByViewer: true })]
      }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      ownCastleId: CASTLE.castleId
    })).toMatchObject([{
      source: 'legacy-expedition',
      occupiedByViewer: true,
      workerPhase: 'outbound'
    }]);
  });

  it('gives an active generic lease priority over a legacy row at the same canonical node key', () => {
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [legacyNode('gold', 'returning')] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    });

    expect(markers).toHaveLength(1);
    expect(markers[0]).toMatchObject({
      source: 'generic-worker',
      resource: 'gold',
      siteId: 'genesis-001:gold:0001',
      workerPhase: 'gathering',
      workerOrdinal: 1
    });
  });

  it.each([
    ['non-canonical key', occupation({ nodeKey: 'gold:wrong' })],
    ['unknown site', occupation({ siteId: 'genesis-001:gold:9999', nodeKey: 'gold:genesis-001:gold:9999' })],
    ['unknown castle', occupation({ originCastleId: 999 })],
    ['invalid phase', occupation({ phase: 'returning' as 'gathering' })],
    ['non-bigint timeline', occupation({ startedAtMicros: 1 as unknown as bigint })],
    ['negative timeline', occupation({
      startedAtMicros: -3n,
      arrivesAtMicros: -2n,
      gatheringEndsAtMicros: -1n
    })],
    ['inverted timeline', occupation({ arrivesAtMicros: 3n, gatheringEndsAtMicros: 2n })]
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

  it('fails closed for malformed castle and node presentation fields', () => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [{ ...CASTLE, q: Number.NaN }],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    })).toEqual([]);
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [{ ...CASTLE, name: undefined } as unknown as RealmCastleProjection],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    })).toEqual([]);
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{
        resource: 'gold',
        nodes: [node({ availability: 'mystery' })]
      }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      workerProjection: projection([occupation()])
    })).toEqual([]);
  });

  it('distinguishes a valid empty lane from a degraded active generic join', () => {
    expect(resolveRealmResourceOccupantMarkerResolution({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]])
    })).toEqual({
      status: 'ready',
      markers: []
    });
    expect(resolveRealmResourceOccupantMarkerResolution({
      buckets: [{ resource: 'gold', nodes: [node()] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]]),
      activeGenericModeExpected: true
    })).toEqual({
      status: 'invalid',
      markers: []
    });
  });

  it.each([
    ['non-finite coordinate', { coord: { q: Number.NaN, r: -3 } }],
    ['invalid tier', { tier: 0 }],
    ['negative timeline', {
      occupation: {
        siteId: 'genesis-001:gold:0001',
        originCastleId: CASTLE.castleId,
        phase: 'gathering',
        startedAtMicros: -3n,
        arrivesAtMicros: -2n,
        gatheringEndsAtMicros: -1n,
        returnsAtMicros: 0n
      }
    }]
  ])('fails the legacy marker lane closed for a %s', (_label, overrides) => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{
        resource: 'gold',
        nodes: [legacyNode('gold', 'gathering', overrides)]
      }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, PROFILE]])
    })).toEqual([]);
  });

  it('fails closed for a legacy occupation without a matching public castle or profile', () => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'stone', nodes: [legacyNode('stone')] }],
      castles: [],
      profiles: new Map()
    })).toEqual([]);
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'stone', nodes: [legacyNode('stone')] }],
      castles: [CASTLE],
      profiles: new Map()
    })).toEqual([]);
  });

  it('fails closed for a malformed public profile contract', () => {
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [legacyNode('gold')] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, {
        profile: {
          canonicalUsername: 'keeper',
          communityStatsVisible: 'yes'
        }
      }]]) as unknown as ReadonlyMap<number, Readonly<{
        profile: typeof PROFILE.profile;
      }>>
    })).toEqual([]);
  });

  it('re-sanitizes public profile text and image fields at the occupancy boundary', () => {
    const markers = resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [legacyNode('gold')] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, {
        profile: {
          canonicalUsername: '@keeper',
          displayName: '  Keeper  ',
          pfpUrl: 'http://127.0.0.1/private.gif',
          publicBio: 'Safe\u0000bio',
          communityStatsVisible: false
        }
      }]])
    });

    expect(markers).toMatchObject([{
      profile: {
        canonicalUsername: 'keeper',
        displayName: 'Keeper',
        publicBio: 'Safe bio',
        communityStatsVisible: false
      }
    }]);
    expect(markers[0]?.profile).not.toHaveProperty('pfpUrl');
  });

  it('preserves the exact local QA placeholder through both public projection boundaries', () => {
    const profile = publicProfileForCastle(CASTLE.ownerFid, [{
      fid: CASTLE.ownerFid,
      canonicalUsername: 'synthetic-keeper',
      pfpUrl: WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
      publicStatus: 'active',
      communityStatsVisible: false
    }], []);
    const absolutePlaceholder = new URL(
      WARPKEEP_SAME_ORIGIN_PROFILE_PLACEHOLDER_PATH,
      window.location.origin
    ).toString();

    expect(profile.pfpUrl).toBe(absolutePlaceholder);
    expect(resolveRealmResourceOccupantMarkers({
      buckets: [{ resource: 'gold', nodes: [legacyNode('gold')] }],
      castles: [CASTLE],
      profiles: new Map([[CASTLE.castleId, { profile }]])
    })).toMatchObject([{
      profile: {
        canonicalUsername: 'synthetic-keeper',
        pfpUrl: absolutePlaceholder
      }
    }]);
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

  it('keeps every in-frustum PFP presence while bounding direct controls', () => {
    const markers = Array.from({ length: 40 }, (_, index) => ({
      resource: 'gold' as const,
      siteId: `presence-${index}`,
      x: 30 + index * 48,
      y: 100,
      depth: index / 100,
      visible: true
    }));
    const available = new Set(markers.map(realmResourceOccupantMarkerKey));
    const frame = { width: 2_000, height: 400, markers };
    const reserved = [{ left: 20, top: 50, right: 90, bottom: 130 }];

    expect(visibleRealmResourceOccupantPresenceKeys(frame, available)).toHaveLength(40);
    expect(visibleRealmResourceOccupantMarkerKeys(frame, available, reserved))
      .toHaveLength(MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS);
  });

  it('allows ambient presence overlap while retaining one collision-free control', () => {
    const markers = [
      { resource: 'food' as const, siteId: 'one', x: 120, y: 120, depth: 0.1, visible: true },
      { resource: 'food' as const, siteId: 'two', x: 120, y: 120, depth: 0.2, visible: true }
    ];
    const available = new Set(markers.map(realmResourceOccupantMarkerKey));
    const frame = { width: 320, height: 240, markers };

    expect(visibleRealmResourceOccupantPresenceKeys(frame, available)).toEqual([
      'food:two',
      'food:one'
    ]);
    expect(visibleRealmResourceOccupantMarkerKeys(frame, available)).toEqual(['food:one']);
  });

  it('prioritizes selected and owned assignments in the bounded control lane', () => {
    const markers = Array.from({ length: 30 }, (_, index) => ({
      resource: 'stone' as const,
      siteId: `site-${index}`,
      x: 30 + index * 48,
      y: 100,
      depth: index / 100,
      visible: true
    }));
    const available = new Set(markers.map(realmResourceOccupantMarkerKey));
    const priorityKeys = ['stone:site-29', 'stone:site-28'];
    const keys = visibleRealmResourceOccupantMarkerKeys(
      { width: 1_500, height: 400, markers },
      available,
      [],
      { priorityKeys }
    );

    expect(keys).toHaveLength(MAX_VISIBLE_RESOURCE_OCCUPANT_MARKERS);
    expect(keys.slice(0, 2)).toEqual(priorityKeys);
  });

  it('reserves remote hover/focus captions at viewport and UI edges', () => {
    const edge = {
      resource: 'gold' as const,
      siteId: 'remote-edge',
      x: 40,
      y: 120,
      depth: 0.1,
      visible: true
    };
    const centered = { ...edge, siteId: 'remote-reserved', x: 100 };
    const edgeKey = realmResourceOccupantMarkerKey(edge);
    const centeredKey = realmResourceOccupantMarkerKey(centered);

    expect(visibleRealmResourceOccupantMarkerKeys(
      { width: 320, height: 240, markers: [edge] },
      new Set([edgeKey])
    )).toEqual([edgeKey]);
    expect(visibleRealmResourceOccupantMarkerKeys(
      { width: 320, height: 240, markers: [edge] },
      new Set([edgeKey]),
      [],
      { persistentLabelKeys: new Set([edgeKey]) }
    )).toEqual([]);
    expect(visibleRealmResourceOccupantMarkerKeys(
      { width: 320, height: 240, markers: [centered] },
      new Set([centeredKey]),
      [{ left: 35, top: 100, right: 55, bottom: 130 }],
      { persistentLabelKeys: new Set([centeredKey]) }
    )).toEqual([]);
  });

  it('bounds the complete four-worker, 100-castle presence roster', () => {
    const markers = Array.from({ length: MAX_RESOURCE_OCCUPANT_ASSIGNMENTS }, (_, index) => ({
      resource: (['gold', 'food', 'wood', 'stone'] as const)[index % 4]!,
      siteId: `site-${index}`,
      x: 24 + (index % 40) * 34,
      y: 48 + Math.floor(index / 40) * 34,
      depth: index / MAX_RESOURCE_OCCUPANT_ASSIGNMENTS,
      visible: true
    }));
    const keys = visibleRealmResourceOccupantPresenceKeys(
      { width: 1_400, height: 420, markers },
      new Set(markers.map(realmResourceOccupantMarkerKey))
    );

    expect(keys).toHaveLength(MAX_RESOURCE_OCCUPANT_ASSIGNMENTS);
    expect(new Set(keys).size).toBe(MAX_RESOURCE_OCCUPANT_ASSIGNMENTS);
  });

  it('fails both projected lanes closed for non-finite viewport geometry', () => {
    const frame = {
      width: Number.POSITIVE_INFINITY,
      height: 400,
      markers: [{
        resource: 'gold' as const,
        siteId: 'site-1',
        x: 100,
        y: 100,
        depth: 0.1,
        visible: true
      }]
    };
    const available = new Set(['gold:site-1']);

    expect(visibleRealmResourceOccupantPresenceKeys(frame, available)).toEqual([]);
    expect(visibleRealmResourceOccupantMarkerKeys(frame, available)).toEqual([]);
  });
});
