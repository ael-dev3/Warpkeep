import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  workerIdForCastle,
  assertCastleWorkerId,
} from './castleWorkerPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>>;
type CastleWorkerRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleWorkerV1']['workerId']['find']>>;

function fail(code = 'WORKER_ROSTER_INTEGRITY'): never {
  throw new Error(code);
}

export function expectedWorkerRowsForCastle(
  castle: Pick<CastleRow, 'castleId'>,
  timestamp: WarpkeepReducerContext['timestamp'],
): readonly CastleWorkerRow[] {
  return Object.freeze(Array.from({ length: CASTLE_WORKERS_PER_CASTLE }, (_, index) => {
    const ordinal = index + 1;
    return Object.freeze({
      workerId: workerIdForCastle(castle.castleId, ordinal),
      originCastleId: castle.castleId,
      ordinal,
      status: 'idle',
      assignmentId: undefined,
      resourceKind: undefined,
      siteId: undefined,
      startedAtMicros: undefined,
      arrivesAtMicros: undefined,
      gatheringEndsAtMicros: undefined,
      returnStartedAtMicros: undefined,
      returnsAtMicros: undefined,
      routeSteps: undefined,
      returnStartProgressBasisPoints: undefined,
      timelineRevision: 0,
      revision: 0n,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
  }));
}

export function workerSystemRowIsStagedOrActive(
  row: NonNullable<ReturnType<WarpkeepReducerContext['db']['realmWorkerSystemV1']['realmId']['find']>>,
): boolean {
  return row.realmId === 'GENESIS_001'
    && row.policyVersion === CASTLE_WORKER_POLICY_VERSION
    && row.workersPerCastle === CASTLE_WORKERS_PER_CASTLE
    && (row.mode === 'staged' || row.mode === 'active')
    && row.expectedCastleCount >= 0
    && row.expectedWorkerCount === row.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
}

export function assertCastleWorkerRoster(
  ctx: WarpkeepReducerContext,
  castleId: bigint,
): readonly CastleWorkerRow[] {
  const castle = ctx.db.castle.castleId.find(castleId);
  if (castle === null) fail('WORKER_CASTLE_MISSING');
  const rows = [...ctx.db.castleWorkerV1.byOriginCastle.filter(castleId)]
    .sort((left, right) => left.ordinal - right.ordinal || left.workerId.localeCompare(right.workerId));
  if (rows.length !== CASTLE_WORKERS_PER_CASTLE) fail('WORKER_ROSTER_INCOMPLETE');
  const expectedIds = new Set<string>();
  for (const row of rows) {
    assertCastleWorkerId(row.workerId);
    if (
      row.originCastleId !== castleId
      || row.ordinal < 1
      || row.ordinal > CASTLE_WORKERS_PER_CASTLE
      || expectedIds.has(row.workerId)
      || row.workerId !== workerIdForCastle(castleId, row.ordinal)
      || row.revision < 0n
      || row.timelineRevision < 0
    ) fail('WORKER_ROSTER_INTEGRITY');
    expectedIds.add(row.workerId);
  }
  for (let ordinal = 1; ordinal <= CASTLE_WORKERS_PER_CASTLE; ordinal += 1) {
    if (!expectedIds.has(workerIdForCastle(castleId, ordinal))) fail('WORKER_ROSTER_INTEGRITY');
  }
  return Object.freeze(rows);
}

/**
 * Founding calls this only when generic mode is active. In staged mode the
 * function is a no-op, so this PR cannot seed production workers accidentally.
 */
export function ensureCastleWorkerRoster(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
): void {
  const system = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  if (system === null) return;
  if (!workerSystemRowIsStagedOrActive(system)) fail('WORKER_SYSTEM_INTEGRITY');
  if (system.mode !== 'active') return;
  const existing = [...ctx.db.castleWorkerV1.byOriginCastle.filter(castle.castleId)];
  if (existing.length > 0) {
    assertCastleWorkerRoster(ctx, castle.castleId);
    return;
  }
  for (const row of expectedWorkerRowsForCastle(castle, ctx.timestamp)) {
    ctx.db.castleWorkerV1.insert(row);
  }
  assertCastleWorkerRoster(ctx, castle.castleId);
}

export function workerRosterDigestInput(castleIds: readonly bigint[]): string {
  return [...castleIds]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .flatMap(castleId => Array.from({ length: CASTLE_WORKERS_PER_CASTLE }, (_, index) => (
      workerIdForCastle(castleId, index + 1)
    )))
    .join('|');
}
