import { describe, expect, it } from 'vitest';
import {
  decodeRealmWorkerOccupations,
  decodeRealmWorkerPublicRows,
  decodeRealmWorkerSystem,
  decodeWorkerResourceState,
  decodeWorkerRoster,
  workerAvailabilityCount
} from '../src/components/realm/realmWorkerPresentation';

const publicWorker = (ordinal: number, originCastleId = 7) => ({
  workerId: `castle-7-worker-${ordinal}`,
  originCastleId,
  ordinal,
  status: ordinal === 1 ? 'idle' : 'gathering',
  assignmentId: ordinal === 1 ? undefined : `assignment-${ordinal}`,
  resourceKind: ordinal === 1 ? undefined : 'stone',
  siteId: ordinal === 1 ? undefined : `stone:${ordinal}`,
  startedAtMicros: undefined,
  arrivesAtMicros: undefined,
  gatheringEndsAtMicros: undefined,
  returnStartedAtMicros: undefined,
  returnsAtMicros: undefined,
  routeSteps: undefined,
  returnStartProgressBasisPoints: undefined,
  timelineRevision: 1,
  revision: 1n
});

describe('generic worker presentation boundary', () => {
  it('requires the exact four-worker active system contract', () => {
    expect(decodeRealmWorkerSystem({
      realmId: 'genesis-001', policyVersion: 'worker-v1', workersPerCastle: 4,
      expectedCastleCount: 1, expectedWorkerCount: 4, rosterDigest: 'digest', mode: 'active',
      legacyDrainRequired: false
    })?.mode).toBe('active');
    expect(decodeRealmWorkerSystem({ workersPerCastle: 3 })).toBeUndefined();
  });

  it('decodes public workers without private assignment or cargo fields', () => {
    const workers = decodeRealmWorkerPublicRows(
      [1, 2, 3, 4].map((ordinal) => publicWorker(ordinal)),
      new Map([[7, 'Keep']]),
      7
    );
    expect(workers).toHaveLength(4);
    expect(workers?.[0]).toMatchObject({ workerId: 'castle-7-worker-1', ownedByViewer: true });
    expect(Object.keys(workers?.[0] ?? {})).not.toContain('assignmentId');
    expect(workerAvailabilityCount(workers ?? [])).toBe(1);
    expect(decodeRealmWorkerPublicRows([publicWorker(1), publicWorker(1)], new Map([[7, 'Keep']]), 7)).toBeUndefined();
  });

  it('keeps occupation and caller roster projections bounded', () => {
    const occupation = decodeRealmWorkerOccupations([{
      nodeKey: 'stone:1', resourceKind: 'stone', siteId: 'stone:1', workerId: 'worker-1', workerOrdinal: 1,
      originCastleId: 7, assignmentId: 'private-id', phase: 'gathering', startedAtMicros: 1n,
      arrivesAtMicros: 2n, gatheringEndsAtMicros: 3n, timelineRevision: 1
    }]);
    expect(occupation?.[0].resourceKind).toBe('stone');
    const roster = decodeWorkerRoster({
      fid: 42n, castleId: 7n, observedAtMicros: 9n,
      workers: [1, 2, 3, 4].map((ordinal) => ({
        workerId: `worker-${ordinal}`, ordinal, status: 'idle', resourceKind: undefined, siteId: undefined,
        accruedAmount: 0n, materializedAmount: 0n, availableAmount: BigInt(ordinal), observedAtMicros: 9n, revision: 1n
      }))
    }, 42n);
    expect(roster?.workers[3].availableAmount).toBe(4n);
    expect(decodeWorkerResourceState({
      fid: 42n, food: 1n, wood: 2n, stone: 3n, gold: 4n,
      workerPendingFood: 0n, workerPendingWood: 0n, workerPendingStone: 0n, workerPendingGold: 0n,
      observedAtMicros: 5n, settledThroughMicros: 5n, revision: 1n,
      resourcePolicyVersion: 'resource-v2', workerPolicyVersion: 'worker-v1', workerSystemMode: 'active'
    }, 42n)?.available.stone).toBe(3n);
  });
});
