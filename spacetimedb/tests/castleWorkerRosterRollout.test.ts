import assert from 'node:assert/strict';
import test from 'node:test';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
} from '../src/castleWorkerPolicy';
import {
  ensureCastleWorkerRoster,
  expectedWorkerRowsForCastle,
} from '../src/castleWorkerRoster';
import {
  assertLegacyExpeditionDispatchAllowed,
} from '../src/resourceExpeditionReservationAuthority';
import {
  planDeterministicWorkerBackfill,
  workerRolloutPhase,
} from '../src/castleWorkerRolloutPolicy';

type EnsureContext = Parameters<typeof ensureCastleWorkerRoster>[0];
type EnsureCastle = Parameters<typeof ensureCastleWorkerRoster>[1];

type FixtureOptions = Readonly<{
  phase: 'staged' | 'draining';
  expectedCastleIds: readonly bigint[];
  currentCastleIds: readonly bigint[];
  rosterCastleIds: readonly bigint[];
  partialRosterCastleId?: bigint;
  legacyExpeditions?: bigint;
  legacyOccupations?: bigint;
  legacySchedules?: bigint;
}>;

function castle(castleId: bigint): EnsureCastle {
  return {
    castleId,
    ownerFid: castleId + 1_000n,
    tileKey: `tile:${castleId}`,
    q: Number(castleId),
    r: 0,
    level: 1,
    name: `Keep ${castleId}`,
    createdAt: {} as never,
  };
}

function fixture(options: FixtureOptions) {
  const castles = options.currentCastleIds.map(castle);
  const initialWorkers = options.rosterCastleIds.flatMap(castleId => (
      expectedWorkerRowsForCastle({ castleId })
        .map(row => [row.workerId, row] as const)
    ));
  if (options.partialRosterCastleId !== undefined) {
    const [partial] = expectedWorkerRowsForCastle({
      castleId: options.partialRosterCastleId,
    });
    initialWorkers.push([partial!.workerId, partial!]);
  }
  const workerRows = new Map(initialWorkers);
  let system = {
    realmId: 'GENESIS_001',
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    workersPerCastle: CASTLE_WORKERS_PER_CASTLE,
    expectedCastleCount: options.expectedCastleIds.length,
    expectedWorkerCount:
      options.expectedCastleIds.length * CASTLE_WORKERS_PER_CASTLE,
    rosterDigest: rosterDigestForCastleIds(options.expectedCastleIds),
    mode: 'staged',
    legacyDrainRequired: options.phase === 'draining',
    createdAt: { microsSinceUnixEpoch: 1n } as never,
    activatedAt: undefined,
  };
  const count = (value = 0n) => () => value;
  const db = {
    realmWorkerSystemV1: {
      count: () => 1n,
      realmId: {
        find: (realmId: string) => realmId === system.realmId ? system : null,
        update: (next: typeof system) => {
          system = next;
          return next;
        },
      },
    },
    castle: {
      count: () => BigInt(castles.length),
      iter: () => castles.values(),
      castleId: {
        find: (castleId: bigint) => (
          castles.find(row => row.castleId === castleId) ?? null
        ),
      },
    },
    castleWorkerV1: {
      count: () => BigInt(workerRows.size),
      iter: () => workerRows.values(),
      byOriginCastle: {
        filter: (castleId: bigint) => (
          [...workerRows.values()]
            .filter(row => row.originCastleId === castleId)
        ),
      },
      workerId: {
        find: (workerId: string) => workerRows.get(workerId) ?? null,
      },
      insert: (row: (typeof workerRows extends Map<string, infer Row> ? Row : never)) => {
        if (workerRows.has(row.workerId)) throw new Error('duplicate worker');
        workerRows.set(row.workerId, row);
        return row;
      },
    },
    workerAssignmentV1: { count: count() },
    workerNodeOccupationV1: {
      count: count(),
      nodeKey: { find: () => null },
    },
    workerAssignmentScheduleV1: { count: count() },
    workerCommandIdempotencyV1: { count: count() },
    goldExpeditionV1: { count: count(options.legacyExpeditions) },
    foodExpeditionV1: { count: count() },
    woodExpeditionV1: { count: count() },
    stoneExpeditionV1: { count: count() },
    goldNodeOccupationV1: { count: count(options.legacyOccupations) },
    foodNodeOccupationV1: { count: count() },
    woodNodeOccupationV1: { count: count() },
    stoneNodeOccupationV1: { count: count() },
    goldExpeditionScheduleV1: { count: count(options.legacySchedules) },
    foodExpeditionScheduleV1: { count: count() },
    woodExpeditionScheduleV1: { count: count() },
    stoneExpeditionScheduleV1: { count: count() },
  };
  return {
    ctx: {
      db,
      timestamp: { microsSinceUnixEpoch: 2n },
    } as unknown as EnsureContext,
    castle: (castleId: bigint) => (
      castles.find(row => row.castleId === castleId)!
    ),
    system: () => system,
    workers: () => [...workerRows.values()],
    legacy: () => ({
      expeditions: options.legacyExpeditions ?? 0n,
      occupations: options.legacyOccupations ?? 0n,
      schedules: options.legacySchedules ?? 0n,
    }),
  };
}

test('staged reconnect tolerates whole-castle gaps and staged founding remains backfillable', () => {
  const reconnect = fixture({
    phase: 'staged',
    expectedCastleIds: [1n],
    currentCastleIds: [1n],
    rosterCastleIds: [],
  });
  ensureCastleWorkerRoster(reconnect.ctx, reconnect.castle(1n));
  assert.equal(reconnect.workers().length, 0);
  assert.equal(reconnect.system().expectedWorkerCount, 4);

  const completeReconnect = fixture({
    phase: 'staged',
    expectedCastleIds: [1n],
    currentCastleIds: [1n],
    rosterCastleIds: [1n],
  });
  const beforeReconnect = completeReconnect.workers().map(row => row.workerId);
  ensureCastleWorkerRoster(
    completeReconnect.ctx,
    completeReconnect.castle(1n),
  );
  assert.deepEqual(
    completeReconnect.workers().map(row => row.workerId),
    beforeReconnect,
  );
  assert.equal(completeReconnect.system().expectedCastleCount, 1);
  assert.equal(completeReconnect.system().expectedWorkerCount, 4);

  const founding = fixture({
    phase: 'staged',
    expectedCastleIds: [1n],
    currentCastleIds: [1n, 2n],
    rosterCastleIds: [],
    legacyExpeditions: 1n,
  });
  ensureCastleWorkerRoster(founding.ctx, founding.castle(2n));
  assert.deepEqual(
    founding.workers().map(row => row.workerId),
    expectedWorkerRowsForCastle({ castleId: 2n }).map(row => row.workerId),
  );
  assert.ok(founding.workers().every(row => (
    row.status === 'idle'
    && row.timelineRevision === 0
    && row.revision === 0n
  )));
  assert.equal(founding.system().expectedCastleCount, 2);
  assert.equal(founding.system().expectedWorkerCount, 8);
  assert.equal(
    founding.system().rosterDigest,
    rosterDigestForCastleIds([1n, 2n]),
  );
  assert.equal(workerRolloutPhase(founding.system(), 1n), 'staged');
  assert.doesNotThrow(() => assertLegacyExpeditionDispatchAllowed(
    founding.ctx,
    'gold',
    'genesis-001-tier1-gold-01',
  ));
  const recovery = planDeterministicWorkerBackfill(
    [1n, 2n],
    founding.workers(),
  );
  assert.equal(recovery.rowsToInsert.length, CASTLE_WORKERS_PER_CASTLE);
  assert.ok(recovery.rowsToInsert.every(row => row.originCastleId === 1n));
});

test('staged partial-within-castle state rejects before founding writes', () => {
  const founding = fixture({
    phase: 'staged',
    expectedCastleIds: [1n],
    currentCastleIds: [1n, 2n],
    rosterCastleIds: [],
    partialRosterCastleId: 1n,
  });
  assert.throws(
    () => ensureCastleWorkerRoster(founding.ctx, founding.castle(2n)),
    /WORKER_ROSTER_PARTIAL/,
  );
  assert.equal(founding.workers().length, 1);
  assert.equal(founding.system().expectedCastleCount, 1);
  assert.equal(founding.system().expectedWorkerCount, 4);
});

test('draining founding appends four idle workers and preserves the legacy drain', () => {
  const founding = fixture({
    phase: 'draining',
    expectedCastleIds: [1n],
    currentCastleIds: [1n, 2n],
    rosterCastleIds: [1n],
    legacyExpeditions: 1n,
    legacyOccupations: 1n,
    legacySchedules: 1n,
  });
  ensureCastleWorkerRoster(founding.ctx, founding.castle(2n));
  assert.equal(founding.workers().length, 2 * CASTLE_WORKERS_PER_CASTLE);
  assert.deepEqual(
    founding.workers()
      .filter(row => row.originCastleId === 2n)
      .map(row => row.workerId),
    expectedWorkerRowsForCastle({ castleId: 2n }).map(row => row.workerId),
  );
  assert.equal(founding.system().expectedCastleCount, 2);
  assert.equal(founding.system().expectedWorkerCount, 8);
  assert.equal(
    founding.system().rosterDigest,
    rosterDigestForCastleIds([1n, 2n]),
  );
  assert.equal(founding.system().mode, 'staged');
  assert.equal(founding.system().legacyDrainRequired, true);
  assert.equal(workerRolloutPhase(founding.system(), 1n), 'draining');
  assert.deepEqual(founding.legacy(), {
    expeditions: 1n,
    occupations: 1n,
    schedules: 1n,
  });
});

test('draining founding rejects an incomplete prior roster before any write', () => {
  const founding = fixture({
    phase: 'draining',
    expectedCastleIds: [1n],
    currentCastleIds: [1n, 2n],
    rosterCastleIds: [],
    legacyExpeditions: 1n,
  });
  assert.throws(
    () => ensureCastleWorkerRoster(founding.ctx, founding.castle(2n)),
    /WORKER_SYSTEM_INTEGRITY/,
  );
  assert.equal(founding.workers().length, 0);
  assert.equal(founding.system().expectedCastleCount, 1);
  assert.equal(founding.system().legacyDrainRequired, true);
});
