import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  rosterDigestForCastleIds,
  workerIdForCastle,
  assertCastleWorkerId,
} from './castleWorkerPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>>;
type CastleWorkerRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleWorkerV1']['workerId']['find']>>;
const MAX_U32 = 0xffff_ffff;

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
      || !castleWorkerPublicStateIsConsistent(row)
    ) fail('WORKER_ROSTER_INTEGRITY');
    expectedIds.add(row.workerId);
  }
  for (let ordinal = 1; ordinal <= CASTLE_WORKERS_PER_CASTLE; ordinal += 1) {
    if (!expectedIds.has(workerIdForCastle(castleId, ordinal))) fail('WORKER_ROSTER_INTEGRITY');
  }
  return Object.freeze(rows);
}

export function castleWorkerPublicStateIsConsistent(row: CastleWorkerRow): boolean {
  const optionalTimeline = [
    row.resourceKind,
    row.siteId,
    row.startedAtMicros,
    row.arrivesAtMicros,
    row.gatheringEndsAtMicros,
    row.returnStartedAtMicros,
    row.returnsAtMicros,
    row.routeSteps,
    row.returnStartProgressBasisPoints,
  ];
  if (row.status === 'idle') return optionalTimeline.every(value => value === undefined);
  if (row.status !== 'outbound' && row.status !== 'gathering' && row.status !== 'returning') return false;
  if (
    row.resourceKind === undefined
    || !['gold', 'food', 'wood', 'stone'].includes(row.resourceKind)
    || row.siteId === undefined
    || row.startedAtMicros === undefined
    || row.arrivesAtMicros === undefined
    || row.gatheringEndsAtMicros === undefined
    || row.returnsAtMicros === undefined
    || row.routeSteps === undefined
    || row.routeSteps <= 0
    || !(row.startedAtMicros < row.arrivesAtMicros && row.arrivesAtMicros < row.gatheringEndsAtMicros)
  ) return false;
  if (row.status !== 'returning') {
    return row.returnStartedAtMicros === undefined
      && row.returnStartProgressBasisPoints === undefined
      && row.gatheringEndsAtMicros < row.returnsAtMicros;
  }
  return row.returnStartedAtMicros !== undefined
    && row.returnStartProgressBasisPoints !== undefined
    && row.returnStartProgressBasisPoints <= 10_000
    && row.returnStartedAtMicros >= row.startedAtMicros
    && row.returnStartedAtMicros <= row.gatheringEndsAtMicros
    && row.returnsAtMicros >= row.returnStartedAtMicros;
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
  if (ctx.db.realmWorkerSystemV1.count() !== 1n || !workerSystemRowIsStagedOrActive(system)) {
    fail('WORKER_SYSTEM_INTEGRITY');
  }
  if (system.mode !== 'active') return;
  if (system.legacyDrainRequired) fail('WORKER_LEGACY_DRAIN_REQUIRED');
  if (
    ctx.db.goldExpeditionV1.count() + ctx.db.foodExpeditionV1.count()
      + ctx.db.woodExpeditionV1.count() + ctx.db.stoneExpeditionV1.count() !== 0n
    || ctx.db.goldNodeOccupationV1.count() + ctx.db.foodNodeOccupationV1.count()
      + ctx.db.woodNodeOccupationV1.count() + ctx.db.stoneNodeOccupationV1.count() !== 0n
    || ctx.db.goldExpeditionScheduleV1.count() + ctx.db.foodExpeditionScheduleV1.count()
      + ctx.db.woodExpeditionScheduleV1.count() + ctx.db.stoneExpeditionScheduleV1.count() !== 0n
  ) fail('WORKER_LEGACY_DRAIN_REQUIRED');
  const existing = [...ctx.db.castleWorkerV1.byOriginCastle.filter(castle.castleId)];
  const castleIds = [...ctx.db.castle.iter()].map(row => row.castleId);
  const priorCastleIds = existing.length === 0
    ? castleIds.filter(castleId => castleId !== castle.castleId)
    : castleIds;
  if (
    system.expectedCastleCount !== priorCastleIds.length
    || system.expectedWorkerCount !== priorCastleIds.length * CASTLE_WORKERS_PER_CASTLE
    || system.rosterDigest !== rosterDigestForCastleIds(priorCastleIds)
  ) fail('WORKER_SYSTEM_INTEGRITY');
  if (existing.length > 0) {
    assertCastleWorkerRoster(ctx, castle.castleId);
  } else {
    for (const row of expectedWorkerRowsForCastle(castle, ctx.timestamp)) {
      ctx.db.castleWorkerV1.insert(row);
    }
    assertCastleWorkerRoster(ctx, castle.castleId);
  }
  if (castleIds.length > MAX_U32 || castleIds.length > Math.floor(MAX_U32 / CASTLE_WORKERS_PER_CASTLE)) {
    fail('WORKER_ROSTER_CAPACITY');
  }
  for (const castleId of castleIds) assertCastleWorkerRoster(ctx, castleId);
  if (ctx.db.castleWorkerV1.count() !== BigInt(castleIds.length * CASTLE_WORKERS_PER_CASTLE)) {
    fail('WORKER_ROSTER_INTEGRITY');
  }
  for (const worker of ctx.db.castleWorkerV1.iter()) {
    if (ctx.db.castle.castleId.find(worker.originCastleId) === null) fail('WORKER_ROSTER_ORPHAN');
  }
  ctx.db.realmWorkerSystemV1.realmId.update({
    ...system,
    expectedCastleCount: castleIds.length,
    expectedWorkerCount: castleIds.length * CASTLE_WORKERS_PER_CASTLE,
    rosterDigest: rosterDigestForCastleIds(castleIds),
  });
}

export function workerRosterDigestInput(castleIds: readonly bigint[]): string {
  return [...castleIds]
    .sort((left, right) => left < right ? -1 : left > right ? 1 : 0)
    .flatMap(castleId => Array.from({ length: CASTLE_WORKERS_PER_CASTLE }, (_, index) => (
      workerIdForCastle(castleId, index + 1)
    )))
    .join('|');
}
