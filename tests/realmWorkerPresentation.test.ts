import { describe, expect, it } from 'vitest';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_REALM_ID,
  decodeRealmWorkerOccupations,
  decodeRealmWorkerPublicRows,
  decodeRealmWorkerSystem,
  decodeWorkerResourceState,
  decodeWorkerRoster,
  resolveReadyWorkerProjection,
  workerAvailabilityCount,
  workerRosterDigestForCastleIds
} from '../src/components/realm/realmWorkerPresentation';
import { REALM_RESOURCE_POLICY_VERSION } from '../src/components/realm/realmResourcePresentation';
import {
  CASTLE_WORKER_POLICY_VERSION as SERVER_CASTLE_WORKER_POLICY_VERSION,
  rosterDigestForCastleIds as serverRosterDigestForCastleIds
} from '../spacetimedb/src/castleWorkerPolicy';

function workerId(castleId: number, ordinal: number) {
  return `genesis-001-castle-${castleId}-worker-${String(ordinal).padStart(2, '0')}`;
}

function publicWorker(castleId: number, ordinal: number, assigned = false) {
  return {
    workerId: workerId(castleId, ordinal),
    originCastleId: castleId,
    ordinal,
    status: assigned ? 'gathering' : 'idle',
    assignmentId: assigned ? `opaque-${castleId}-${ordinal}` : undefined,
    resourceKind: assigned ? 'stone' : undefined,
    siteId: assigned ? 'genesis-001:stone:0001' : undefined,
    startedAtMicros: assigned ? 10n : undefined,
    arrivesAtMicros: assigned ? 20n : undefined,
    gatheringEndsAtMicros: assigned ? 100n : undefined,
    returnStartedAtMicros: undefined,
    returnsAtMicros: assigned ? 120n : undefined,
    routeSteps: assigned ? 1 : undefined,
    returnStartProgressBasisPoints: undefined,
    timelineRevision: assigned ? 2 : 0,
    revision: assigned ? 3n : 0n
  };
}

function publicRows() {
  return [7, 8].flatMap((castleId) => [1, 2, 3, 4].map((ordinal) => (
    publicWorker(castleId, ordinal, castleId === 7 && ordinal === 1)
  )));
}

function privateRoster() {
  return {
    fid: 42n,
    castleId: 7n,
    observedAtMicros: 1000n,
    workers: [1, 2, 3, 4].map((ordinal) => ({
      workerId: workerId(7, ordinal),
      ordinal,
      status: ordinal === 1 ? 'gathering' : 'idle',
      resourceKind: ordinal === 1 ? 'stone' : undefined,
      siteId: ordinal === 1 ? 'genesis-001:stone:0001' : undefined,
      accruedAmount: ordinal === 1 ? 5n : 0n,
      materializedAmount: ordinal === 1 ? 2n : 0n,
      availableAmount: ordinal === 1 ? 3n : 0n,
      observedAtMicros: 1000n,
      revision: ordinal === 1 ? 3n : 0n
    }))
  };
}

function privateResources(pendingStone = 3n, workerPolicyVersion = CASTLE_WORKER_POLICY_VERSION) {
  return {
    fid: 42n,
    food: 1n,
    wood: 2n,
    stone: 3n,
    gold: 4n,
    workerPendingFood: 0n,
    workerPendingWood: 0n,
    workerPendingStone: pendingStone,
    workerPendingGold: 0n,
    observedAtMicros: 1000n,
    settledThroughMicros: 900n,
    revision: 1n,
    resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
    workerPolicyVersion,
    workerSystemMode: 'active'
  };
}

function occupation(overrides: Readonly<Record<string, unknown>> = {}) {
  return {
    nodeKey: 'stone:genesis-001:stone:0001',
    resourceKind: 'stone',
    siteId: 'genesis-001:stone:0001',
    workerId: workerId(7, 1),
    workerOrdinal: 1,
    originCastleId: 7,
    assignmentId: 'opaque-server-id',
    phase: 'gathering',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 100n,
    timelineRevision: 2,
    ...overrides
  };
}

function readyInputs() {
  const castleIds = [7, 8];
  const system = decodeRealmWorkerSystem({
    realmId: CASTLE_WORKER_REALM_ID,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: 4,
    expectedCastleCount: 2,
    expectedWorkerCount: 8,
    rosterDigest: workerRosterDigestForCastleIds(castleIds),
    mode: 'active',
    legacyDrainRequired: false
  })!;
  const workers = decodeRealmWorkerPublicRows(
    publicRows(),
    new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
    7
  )!;
  const occupations = decodeRealmWorkerOccupations([occupation()])!;
  const roster = decodeWorkerRoster(privateRoster(), 42n)!;
  const resourceState = decodeWorkerResourceState(privateResources(), 42n)!;
  return { castleIds, system, workers, occupations, roster, resourceState };
}

function returningPublicRows(overrides: Readonly<Record<string, unknown>> = {}) {
  const rows: Record<string, unknown>[] = publicRows().map((row) => ({ ...row }));
  rows[0] = {
    ...publicWorker(7, 1, true),
    status: 'returning',
    returnStartedAtMicros: 15n,
    returnsAtMicros: 20n,
    returnStartProgressBasisPoints: 5_000,
    ...overrides
  };
  return rows;
}

function returningReadyInputs(overrides: Readonly<Record<string, unknown>> = {}) {
  const inputs = readyInputs();
  const workers = decodeRealmWorkerPublicRows(
    returningPublicRows(overrides),
    new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
    7
  );
  const rosterValue = privateRoster();
  const roster = decodeWorkerRoster({
    ...rosterValue,
    workers: rosterValue.workers.map((worker, index) => (
      index === 0 ? { ...worker, status: 'returning' } : worker
    ))
  }, 42n);
  if (workers === undefined || roster === undefined) throw new Error('returning fixture is invalid');
  return { ...inputs, workers, occupations: Object.freeze([]), roster };
}

describe('generic worker presentation boundary', () => {
  it('requires the exact four-worker system contract and canonical digest encoding', () => {
    const digest = workerRosterDigestForCastleIds([8, 7]);
    expect(CASTLE_WORKER_POLICY_VERSION).toBe(SERVER_CASTLE_WORKER_POLICY_VERSION);
    expect(digest).toBe(workerRosterDigestForCastleIds([7, 8]));
    expect(digest).toBe(serverRosterDigestForCastleIds([7n, 8n]));
    expect(decodeRealmWorkerSystem({
      realmId: CASTLE_WORKER_REALM_ID,
      policyVersion: CASTLE_WORKER_POLICY_VERSION,
      workersPerCastle: 4,
      expectedCastleCount: 2,
      expectedWorkerCount: 8,
      rosterDigest: digest,
      mode: 'active',
      legacyDrainRequired: false
    })?.mode).toBe('active');
    expect(decodeRealmWorkerSystem({ workersPerCastle: 3 })).toBeUndefined();
    expect(decodeRealmWorkerSystem({
      realmId: CASTLE_WORKER_REALM_ID,
      policyVersion: CASTLE_WORKER_POLICY_VERSION,
      workersPerCastle: 4,
      expectedCastleCount: 0,
      expectedWorkerCount: 0,
      rosterDigest: 'not-a-digest',
      mode: 'staged',
      legacyDrainRequired: false
    })).toBeUndefined();
  });

  it('decodes canonical public rows without assignment identifiers', () => {
    const workers = decodeRealmWorkerPublicRows(
      publicRows(),
      new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
      7
    );
    expect(workers).toHaveLength(8);
    expect(workers?.filter((worker) => worker.ownedByViewer)).toHaveLength(4);
    expect(Object.keys(workers?.[0] ?? {})).not.toContain('assignmentId');
    expect(workerAvailabilityCount(workers?.filter((worker) => worker.ownedByViewer) ?? [])).toBe(3);
    const duplicateOrdinal = publicRows();
    duplicateOrdinal[1] = { ...duplicateOrdinal[1]!, ordinal: 1 };
    expect(decodeRealmWorkerPublicRows(
      duplicateOrdinal,
      new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
      7
    )).toBeUndefined();
  });

  it('never reads legacy assignment identifiers from public rows or occupations', () => {
    const rows = publicRows();
    rows[0] = {
      ...rows[0]!,
      get assignmentId(): never {
        throw new Error('legacy assignment id must remain outside the browser domain');
      }
    };
    const lease = {
      ...occupation(),
      get assignmentId(): never {
        throw new Error('legacy assignment id must remain outside the browser domain');
      }
    };
    expect(decodeRealmWorkerPublicRows(
      rows,
      new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
      7
    )).toHaveLength(8);
    expect(decodeRealmWorkerOccupations([lease])).toHaveLength(1);
  });

  it('keeps early and zero-distance recalls active through decoding and projection', () => {
    for (const boundary of [
      { returnStartedAtMicros: 15n, returnsAtMicros: 20n, returnStartProgressBasisPoints: 5_000 },
      { returnStartedAtMicros: 10n, returnsAtMicros: 10n, returnStartProgressBasisPoints: 0 }
    ]) {
      const inputs = returningReadyInputs(boundary);
      expect(inputs.workers[0]?.status).toBe('returning');
      expect(resolveReadyWorkerProjection({
        realmId: CASTLE_WORKER_REALM_ID,
        ownCastleId: 7,
        ...inputs
      })?.ownedWorkers[0]?.status).toBe('returning');
    }
  });

  it('rejects impossible returning chronology in decoders and resolved projections', () => {
    for (const impossible of [
      { returnStartedAtMicros: 9n, returnsAtMicros: 10n },
      { returnStartedAtMicros: 101n, returnsAtMicros: 101n },
      { returnStartedAtMicros: 15n, returnsAtMicros: 14n },
      { returnStartedAtMicros: undefined },
      { returnStartProgressBasisPoints: undefined },
      { returnStartProgressBasisPoints: 10_001 },
      { returnStartProgressBasisPoints: 4_999 },
      { returnsAtMicros: 21n }
    ]) {
      expect(decodeRealmWorkerPublicRows(
        returningPublicRows(impossible),
        new Map([[7, 'Own Keep'], [8, 'Peer Keep']]),
        7
      )).toBeUndefined();
    }

    const inputs = returningReadyInputs();
    expect(resolveReadyWorkerProjection({
      realmId: CASTLE_WORKER_REALM_ID,
      ownCastleId: 7,
      ...inputs,
      workers: inputs.workers.map((worker, index) => (
        index === 0 ? { ...worker, returnsAtMicros: 14n } : worker
      ))
    })).toBeUndefined();
  });

  it('keeps occupation and caller-only projections strict and privacy bounded', () => {
    const occupations = decodeRealmWorkerOccupations([occupation()]);
    expect(occupations?.[0].resourceKind).toBe('stone');
    expect(Object.keys(occupations?.[0] ?? {})).not.toContain('assignmentId');
    expect(decodeRealmWorkerOccupations([
      occupation(),
      occupation({ nodeKey: 'gold:site', resourceKind: 'gold', siteId: 'site' })
    ])).toBeUndefined();

    const roster = decodeWorkerRoster(privateRoster(), 42n);
    expect(roster?.workers[0].availableAmount).toBe(3n);
    expect(decodeWorkerRoster({
      ...privateRoster(),
      workers: privateRoster().workers.map((worker, index) => (
        index === 1 ? { ...worker, ordinal: 1 } : worker
      ))
    }, 42n)).toBeUndefined();
    expect(decodeWorkerResourceState(privateResources(), 42n)?.available.stone).toBe(3n);
  });

  it('activates only a complete graph and exposes exactly the viewer-owned four', () => {
    const inputs = readyInputs();
    const projection = resolveReadyWorkerProjection({
      realmId: CASTLE_WORKER_REALM_ID,
      ownCastleId: 7,
      ...inputs
    });
    expect(projection?.workers).toHaveLength(8);
    expect(projection?.ownedWorkers.map((worker) => worker.originCastleId)).toEqual([7, 7, 7, 7]);
    expect(projection?.ownedWorkers.map((worker) => worker.ordinal)).toEqual([1, 2, 3, 4]);
  });

  it('fails closed on castle, digest, roster, resource, or occupation disagreement', () => {
    const inputs = readyInputs();
    const resolve = (overrides: Readonly<Record<string, unknown>>) => resolveReadyWorkerProjection({
      realmId: CASTLE_WORKER_REALM_ID,
      ownCastleId: 7,
      ...inputs,
      ...overrides
    });
    expect(resolve({ castleIds: [7] })).toBeUndefined();
    expect(resolve({ system: { ...inputs.system, rosterDigest: '0000000000000000' } })).toBeUndefined();
    expect(resolve({
      roster: {
        ...inputs.roster,
        workers: inputs.roster.workers.map((worker, index) => (
          index === 0 ? { ...worker, revision: 4n } : worker
        ))
      }
    })).toBeUndefined();
    expect(resolve({ resourceState: decodeWorkerResourceState(privateResources(2n), 42n) })).toBeUndefined();
    expect(resolve({
      occupations: decodeRealmWorkerOccupations([occupation({ phase: 'outbound' })])
    })).toBeUndefined();
  });
});
