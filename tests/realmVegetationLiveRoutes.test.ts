import { describe, expect, it } from 'vitest';

import {
  realmVegetationRoutePathSignature,
  realmVegetationRoutePathsForWorkers
} from '../src/components/realm/createRealmScene';
import type { RealmWorkerSceneRecord } from '../src/components/realm/realmWorkerLayer';

function worker(
  overrides: Partial<RealmWorkerSceneRecord> = {}
): RealmWorkerSceneRecord {
  return Object.freeze({
    workerId: 'genesis-001-castle-1-worker-01',
    ordinal: 1,
    originCastleId: 1,
    originCastleName: 'Hegemony Keep 001',
    status: 'outbound',
    resourceKind: 'wood',
    siteId: 'genesis-001:wood:0001',
    startedAtMicros: 100n,
    arrivesAtMicros: 300n,
    gatheringEndsAtMicros: 600n,
    returnsAtMicros: 800n,
    routeSteps: 2,
    timelineRevision: 1,
    revision: 1n,
    ownedByViewer: true,
    originCoord: Object.freeze({ q: 0, r: 0 }),
    destinationCoord: Object.freeze({ q: 2, r: -1 }),
    ...overrides
  });
}

describe('live Worker vegetation route projection', () => {
  it('projects only canonical active dry routes and never idle or invalid rows', () => {
    const active = worker();
    const idle = worker({
      workerId: 'idle',
      status: 'idle',
      routeSteps: undefined,
      destinationCoord: undefined
    });
    const invalid = worker({
      workerId: 'invalid',
      destinationCoord: { q: 90, r: 90 },
      routeSteps: 1
    });
    const paths = realmVegetationRoutePathsForWorkers([
      invalid,
      idle,
      active
    ]);

    expect(paths).toHaveLength(1);
    expect(paths[0]?.id).toBe(active.workerId);
    expect(paths[0]?.coords[0]).toEqual(active.originCoord);
    expect(paths[0]?.coords.at(-1)).toEqual(active.destinationCoord);
    expect(paths[0]?.coords).toHaveLength(3);
    expect(Object.isFrozen(paths)).toBe(true);
    expect(paths[0]?.coords.every(Object.isFrozen)).toBe(true);
  });

  it('changes clearance identity only when canonical route geometry changes', () => {
    const initial = realmVegetationRoutePathsForWorkers([worker()]);
    const progressOnly = realmVegetationRoutePathsForWorkers([worker({
      startedAtMicros: 150n,
      arrivesAtMicros: 350n,
      revision: 2n
    })]);
    const anotherRoute = realmVegetationRoutePathsForWorkers([worker({
      destinationCoord: { q: 1, r: 1 },
      routeSteps: 2,
      revision: 3n
    })]);

    expect(realmVegetationRoutePathSignature(progressOnly))
      .toBe(realmVegetationRoutePathSignature(initial));
    expect(realmVegetationRoutePathSignature(anotherRoute))
      .not.toBe(realmVegetationRoutePathSignature(initial));
  });

  it('is deterministic under input permutations and rejects invalid catalogs whole', () => {
    const first = worker();
    const second = worker({
      workerId: 'genesis-001-castle-1-worker-02',
      ordinal: 2,
      destinationCoord: { q: -1, r: 2 }
    });
    const forward = realmVegetationRoutePathsForWorkers([first, second]);
    const reverse = realmVegetationRoutePathsForWorkers([second, first]);
    const duplicate = realmVegetationRoutePathsForWorkers([first, first]);

    expect(reverse).toEqual(forward);
    expect(realmVegetationRoutePathSignature(reverse))
      .toBe(realmVegetationRoutePathSignature(forward));
    expect(duplicate).toEqual([]);
    expect(realmVegetationRoutePathsForWorkers([
      first,
      worker({
        workerId: 'bad-ordinal',
        ordinal: 5 as unknown as RealmWorkerSceneRecord['ordinal']
      })
    ])).toEqual([]);
    expect(realmVegetationRoutePathsForWorkers([
      first,
      worker({ workerId: 'bad-origin', originCastleId: 0 })
    ])).toEqual([]);
  });
});
