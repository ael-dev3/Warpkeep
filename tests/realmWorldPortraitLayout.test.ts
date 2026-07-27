import { describe, expect, it } from 'vitest';

import {
  realmWorldPortraitPriority,
  resolveRealmWorldPortraitLayout
} from '../src/components/realm/realmWorldPortraitLayout';
import type {
  RealmResourceOccupantMarker
} from '../src/components/realm/realmResourceOccupantPresentation';
import type { RealmWorkerSceneRecord } from '../src/components/realm/realmWorkerLayer';
import type {
  RealmResourceProjectionFrame,
  RealmWorkerProjectionFrame
} from '../src/components/realm/realmTypes';

function worker(
  ordinal: 1 | 2 | 3 | 4,
  overrides: Partial<RealmWorkerSceneRecord> = {}
): RealmWorkerSceneRecord {
  const originCastleId = overrides.originCastleId ?? 7;
  return Object.freeze({
    workerId: `genesis-001-castle-${originCastleId}-worker-${String(ordinal).padStart(2, '0')}`,
    ordinal,
    originCastleId,
    originCastleName: `Hegemony Keep ${originCastleId}`,
    status: 'outbound',
    resourceKind: 'wood',
    siteId: `genesis-001:wood:${String(ordinal).padStart(4, '0')}`,
    startedAtMicros: 100n,
    arrivesAtMicros: 300n,
    gatheringEndsAtMicros: 600n,
    returnsAtMicros: 800n,
    routeSteps: 2,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: ordinal === 1,
    originCoord: Object.freeze({ q: 0, r: 0 }),
    destinationCoord: Object.freeze({ q: 2, r: -1 }),
    profile: Object.freeze({
      canonicalUsername: `keeper${ordinal}`,
      displayName: `Keeper ${ordinal}`,
      communityStatsVisible: false
    }),
    ...overrides
  }) as RealmWorkerSceneRecord;
}

function occupant(
  index: number,
  overrides: Partial<RealmResourceOccupantMarker> = {}
): RealmResourceOccupantMarker {
  const siteId = overrides.siteId
    ?? `genesis-001:wood:${String(index).padStart(4, '0')}`;
  return Object.freeze({
    source: 'generic-worker',
    resource: 'wood',
    siteId,
    nodeCoord: Object.freeze({ q: index, r: -index }),
    tier: 1,
    workerId: `genesis-001-castle-22-worker-${String((index % 4) + 1).padStart(2, '0')}`,
    workerOrdinal: ((index % 4) + 1) as 1 | 2 | 3 | 4,
    workerPhase: 'gathering',
    timelineRevision: 1,
    occupiedByViewer: false,
    startedAtMicros: 1n,
    arrivesAtMicros: 2n,
    gatheringEndsAtMicros: 3n,
    castle: Object.freeze({
      castleId: 22,
      name: 'Sunlit Bastion',
      q: 1,
      r: -1
    }),
    profile: Object.freeze({
      canonicalUsername: `keeper${index}`,
      displayName: `Keeper ${index}`,
      communityStatsVisible: false
    }),
    ...overrides
  });
}

function workerMarker(
  record: RealmWorkerSceneRecord,
  x: number,
  y: number,
  depth = 0
): RealmWorkerProjectionFrame['markers'][number] {
  if (record.status !== 'outbound' && record.status !== 'returning') {
    throw new Error('Worker fixture must be travelling');
  }
  return Object.freeze({
    workerId: record.workerId,
    workerOrdinal: record.ordinal,
    originCastleId: record.originCastleId,
    x,
    y,
    depth,
    visible: true,
    phase: record.status
  });
}

function resourceMarker(
  record: RealmResourceOccupantMarker,
  x: number,
  y: number,
  depth = 0
): RealmResourceProjectionFrame['markers'][number] {
  return Object.freeze({
    resource: record.resource,
    siteId: record.siteId,
    x,
    y,
    depth,
    visible: true
  });
}

function workerFrame(
  markers: RealmWorkerProjectionFrame['markers'],
  width = 1_000,
  height = 600
): RealmWorkerProjectionFrame {
  return Object.freeze({ width, height, markers: Object.freeze([...markers]) });
}

function resourceFrame(
  markers: RealmResourceProjectionFrame['markers'],
  width = 1_000,
  height = 600
): RealmResourceProjectionFrame {
  return Object.freeze({ width, height, markers: Object.freeze([...markers]) });
}

describe('Realm world portrait layout', () => {
  it('uses the exact five-tier ownership and selection priority', () => {
    expect([
      realmWorldPortraitPriority(true, true, true),
      realmWorldPortraitPriority(true, false, true),
      realmWorldPortraitPriority(true, false, false),
      realmWorldPortraitPriority(false, true, true),
      realmWorldPortraitPriority(false, false, true)
    ]).toEqual([0, 1, 2, 3, 4]);
  });

  it('resolves shared worker/resource collisions in stable priority order', () => {
    const ownSelected = worker(1);
    const ownHoveredSite = occupant(1, { occupiedByViewer: true });
    const peerSelectedSite = occupant(2);
    const input = {
      workers: [ownSelected],
      resourceOccupants: [peerSelectedSite, ownHoveredSite],
      workerFrame: workerFrame([workerMarker(ownSelected, 300, 180, 20)]),
      resourceFrame: resourceFrame([
        resourceMarker(peerSelectedSite, 300, 180, 1),
        resourceMarker(ownHoveredSite, 300, 180, 10)
      ]),
      selectedWorkerId: ownSelected.workerId,
      hoveredResourceKey: `wood:${ownHoveredSite.siteId}`,
      selectedResourceKey: `wood:${peerSelectedSite.siteId}`
    } as const;

    const forward = resolveRealmWorldPortraitLayout(input);
    const reversed = resolveRealmWorldPortraitLayout({
      ...input,
      resourceOccupants: [...input.resourceOccupants].reverse(),
      resourceFrame: resourceFrame([...input.resourceFrame.markers].reverse())
    });

    expect(forward.visibleWorkerIds).toEqual([ownSelected.workerId]);
    expect(forward.visibleResourceControlKeys).toEqual([]);
    expect(forward.visibleResourcePresenceKeys).toEqual([]);
    expect(forward.suppressedResourceCount).toBe(2);
    expect(reversed.visibleWorkerIds).toEqual(forward.visibleWorkerIds);
    expect(reversed.visibleResourceControlKeys).toEqual(
      forward.visibleResourceControlKeys
    );
    expect(reversed.visibleResourcePresenceKeys).toEqual(
      forward.visibleResourcePresenceKeys
    );
  });

  it('keeps travelling identity on the route and gathering identity on its node', () => {
    const outbound = worker(1);
    const outboundReservation = occupant(1, {
      occupiedByViewer: true,
      workerId: outbound.workerId,
      workerOrdinal: outbound.ordinal,
      workerPhase: 'outbound'
    });
    const gathering = occupant(2);
    const layout = resolveRealmWorldPortraitLayout({
      workers: [
        outbound,
        worker(2, {
          status: 'gathering',
          ownedByViewer: false,
          siteId: gathering.siteId
        })
      ],
      resourceOccupants: [outboundReservation, gathering],
      workerFrame: workerFrame([workerMarker(outbound, 160, 160)]),
      resourceFrame: resourceFrame([
        resourceMarker(outboundReservation, 420, 160),
        resourceMarker(gathering, 680, 160)
      ])
    });

    expect(layout.visibleWorkerIds).toEqual([outbound.workerId]);
    expect(layout.visibleResourceControlKeys).toEqual([
      `wood:${outboundReservation.siteId}`,
      `wood:${gathering.siteId}`
    ]);
    expect(layout.workerProjections).toHaveLength(1);
    expect(layout.resourceProjections).toHaveLength(2);
  });

  it('simplifies overview portraits while retaining own, selected, and occupied identity', () => {
    const ownWorker = worker(1);
    const calmPeerWorker = worker(2, { ownedByViewer: false });
    const selectedPeerWorker = worker(3, { ownedByViewer: false });
    const ownSite = occupant(1, { occupiedByViewer: true });
    const calmPeerSite = occupant(2);
    const selectedPeerSite = occupant(3);
    const selectedPeerSiteKey = `wood:${selectedPeerSite.siteId}`;
    const layout = resolveRealmWorldPortraitLayout({
      cameraMode: 'realm',
      workers: [ownWorker, calmPeerWorker, selectedPeerWorker],
      resourceOccupants: [ownSite, calmPeerSite, selectedPeerSite],
      workerFrame: workerFrame([
        workerMarker(ownWorker, 100, 120),
        workerMarker(calmPeerWorker, 300, 120),
        workerMarker(selectedPeerWorker, 500, 120)
      ]),
      resourceFrame: resourceFrame([
        resourceMarker(ownSite, 150, 340),
        resourceMarker(calmPeerSite, 400, 340),
        resourceMarker(selectedPeerSite, 700, 340)
      ]),
      selectedWorkerId: selectedPeerWorker.workerId,
      selectedResourceKey: selectedPeerSiteKey
    });

    expect(layout.visibleWorkerIds).toEqual([
      ownWorker.workerId,
      selectedPeerWorker.workerId
    ]);
    expect(layout.visibleWorkerIds).not.toContain(calmPeerWorker.workerId);
    expect(layout.visibleResourceControlKeys).toEqual([
      `wood:${ownSite.siteId}`,
      selectedPeerSiteKey
    ]);
    expect(layout.visibleResourcePresenceKeys).toEqual([
      `wood:${calmPeerSite.siteId}`
    ]);
  });

  it('rejects overflow using complete control and reservation bounds', () => {
    const exactWorker = worker(1);
    const clippedWorker = worker(2, { ownedByViewer: false });
    const nearEdgeSite = occupant(1);
    const clippedReservation = occupant(2, { workerPhase: 'outbound' });
    const layout = resolveRealmWorldPortraitLayout({
      workers: [clippedWorker, exactWorker],
      resourceOccupants: [nearEdgeSite, clippedReservation],
      workerFrame: workerFrame([
        workerMarker(clippedWorker, 23, 80),
        workerMarker(exactWorker, 24, 80)
      ], 400, 240),
      resourceFrame: resourceFrame([
        // Full 132px control caption does not fit, but the 48px passive PFP does.
        resourceMarker(nearEdgeSite, 60, 150),
        // The compact reservation still needs its full 108px passive pill.
        resourceMarker(clippedReservation, 53, 80)
      ], 400, 240)
    });

    expect(layout.visibleWorkerIds).toEqual([exactWorker.workerId]);
    expect(layout.visibleResourceControlKeys).toEqual([]);
    expect(layout.visibleResourcePresenceKeys).toEqual([
      `wood:${nearEdgeSite.siteId}`
    ]);
    expect(layout.suppressedWorkerCount).toBe(1);
    expect(layout.suppressedResourceCount).toBe(1);
  });

  it('uses hover-stable geometry so an admitted portrait cannot cull itself', () => {
    const site = occupant(1);
    const key = `wood:${site.siteId}`;
    const base = {
      workers: [],
      resourceOccupants: [site],
      workerFrame: workerFrame([]),
      resourceFrame: resourceFrame([resourceMarker(site, 150, 100)], 300, 220)
    } as const;

    const calm = resolveRealmWorldPortraitLayout(base);
    const hovered = resolveRealmWorldPortraitLayout({
      ...base,
      hoveredResourceKey: key
    });

    expect(calm.visibleResourceControlKeys).toEqual([key]);
    expect(hovered.visibleResourceControlKeys).toEqual([key]);
    expect(hovered.visibleResourcePresenceKeys).toEqual([]);
  });

  it('fails ambiguous, unknown, mismatched and non-finite projection identities closed', () => {
    const validWorker = worker(1);
    const site = occupant(1);
    const duplicateWorkerProjection = workerMarker(validWorker, 120, 100);
    const duplicateResourceProjection = resourceMarker(site, 320, 100);
    const layout = resolveRealmWorldPortraitLayout({
      workers: [validWorker],
      resourceOccupants: [site],
      workerFrame: workerFrame([
        duplicateWorkerProjection,
        { ...duplicateWorkerProjection, x: 160 },
        {
          ...duplicateWorkerProjection,
          workerId: 'unknown-worker',
          x: 220
        },
        {
          ...duplicateWorkerProjection,
          workerId: `${validWorker.workerId}-mismatched`,
          workerOrdinal: 4,
          x: Number.NaN
        }
      ]),
      resourceFrame: resourceFrame([
        duplicateResourceProjection,
        { ...duplicateResourceProjection, x: 360 },
        {
          ...duplicateResourceProjection,
          siteId: 'unknown-site',
          x: 520
        }
      ])
    });

    expect(layout.visibleWorkerIds).toEqual([]);
    expect(layout.visibleResourceControlKeys).toEqual([]);
    expect(layout.workerProjections).toEqual([]);
    expect(layout.resourceProjections).toEqual([]);
  });

  it('keeps valid lanes independent when the other frame is invalid', () => {
    const movingWorker = worker(1);
    const site = occupant(1);
    const workerOnly = resolveRealmWorldPortraitLayout({
      workers: [movingWorker],
      resourceOccupants: [site],
      workerFrame: workerFrame([workerMarker(movingWorker, 100, 100)]),
      resourceFrame: resourceFrame([resourceMarker(site, 300, 100)], 0, 200)
    });
    const resourceOnly = resolveRealmWorldPortraitLayout({
      workers: [movingWorker],
      resourceOccupants: [site],
      workerFrame: workerFrame([workerMarker(movingWorker, 100, 100)], Number.NaN),
      resourceFrame: resourceFrame([resourceMarker(site, 300, 100)])
    });

    expect(workerOnly.visibleWorkerIds).toEqual([movingWorker.workerId]);
    expect(workerOnly.visibleResourceControlKeys).toEqual([]);
    expect(resourceOnly.visibleWorkerIds).toEqual([]);
    expect(resourceOnly.visibleResourceControlKeys).toEqual([
      `wood:${site.siteId}`
    ]);
  });

  it('caps resource controls and passive presences at 24 each', () => {
    const sites = Array.from({ length: 60 }, (_, index) => occupant(index + 1));
    const projections = sites.map((site, index) => (
      resourceMarker(site, 100 + index * 150, 100)
    ));
    const layout = resolveRealmWorldPortraitLayout({
      workers: [],
      resourceOccupants: [...sites].reverse(),
      workerFrame: workerFrame([], 10_000, 300),
      resourceFrame: resourceFrame(
        [...projections].reverse(),
        10_000,
        300
      )
    });

    expect(layout.visibleResourceControlKeys).toHaveLength(24);
    expect(layout.visibleResourcePresenceKeys).toHaveLength(24);
    expect(layout.suppressedResourceCount).toBe(12);
    expect(new Set([
      ...layout.visibleResourceControlKeys,
      ...layout.visibleResourcePresenceKeys
    ])).toHaveLength(48);
    expect(layout.visibleResourceControlKeys[0]).toBe(
      'wood:genesis-001:wood:0001'
    );
  });

  it('caps travelling worker controls at the 24-route renderer boundary', () => {
    const workers = Array.from({ length: 30 }, (_, index) => worker(
      (index % 4 + 1) as 1 | 2 | 3 | 4,
      {
        originCastleId: index + 1,
        ownedByViewer: false
      }
    ));
    const projections = workers.map((record, index) => (
      workerMarker(record, 100 + index * 100, 100)
    ));
    const forward = resolveRealmWorldPortraitLayout({
      workers,
      resourceOccupants: [],
      workerFrame: workerFrame(projections, 3_200, 240),
      resourceFrame: resourceFrame([], 3_200, 240)
    });
    const reversed = resolveRealmWorldPortraitLayout({
      workers: [...workers].reverse(),
      resourceOccupants: [],
      workerFrame: workerFrame([...projections].reverse(), 3_200, 240),
      resourceFrame: resourceFrame([], 3_200, 240)
    });

    expect(forward.visibleWorkerIds).toHaveLength(24);
    expect(forward.suppressedWorkerCount).toBe(6);
    expect(reversed.visibleWorkerIds).toEqual(forward.visibleWorkerIds);
  });
});
