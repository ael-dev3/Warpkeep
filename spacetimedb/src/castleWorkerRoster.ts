import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  appendCastleWorkerRosterDigest,
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
    });
  }));
}

function boundedRows<Row>(rows: Iterable<Row>, maximum: number, code: string): readonly Row[] {
  const bounded: Row[] = [];
  for (const row of rows) {
    if (bounded.length >= maximum) fail(code);
    bounded.push(row);
  }
  return bounded;
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
  const rows = [...boundedRows(
    ctx.db.castleWorkerV1.byOriginCastle.filter(castleId),
    CASTLE_WORKERS_PER_CASTLE + 1,
    'WORKER_ROSTER_OVERSIZED',
  )]
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
  const existing = boundedRows(
    ctx.db.castleWorkerV1.byOriginCastle.filter(castle.castleId),
    CASTLE_WORKERS_PER_CASTLE + 1,
    'WORKER_ROSTER_OVERSIZED',
  );
  const castleCount = ctx.db.castle.count();
  const workerCount = ctx.db.castleWorkerV1.count();
  if (existing.length > 0) {
    assertCastleWorkerRoster(ctx, castle.castleId);
    if (
      BigInt(system.expectedCastleCount) !== castleCount
      || BigInt(system.expectedWorkerCount) !== workerCount
      || system.expectedWorkerCount !== system.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
      || !/^[0-9a-f]{16}$/.test(system.rosterDigest)
    ) fail('WORKER_SYSTEM_INTEGRITY');
    return;
  } else {
    if (
      castleCount !== BigInt(system.expectedCastleCount) + 1n
      || workerCount !== BigInt(system.expectedWorkerCount)
      || system.expectedWorkerCount !== system.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
      || !/^[0-9a-f]{16}$/.test(system.rosterDigest)
    ) fail('WORKER_SYSTEM_INTEGRITY');
    for (const row of expectedWorkerRowsForCastle(castle)) {
      ctx.db.castleWorkerV1.insert(row);
    }
    assertCastleWorkerRoster(ctx, castle.castleId);
  }
  const nextCastleCount = system.expectedCastleCount + 1;
  if (nextCastleCount > MAX_U32 || nextCastleCount > Math.floor(MAX_U32 / CASTLE_WORKERS_PER_CASTLE)) {
    fail('WORKER_ROSTER_CAPACITY');
  }
  const nextWorkerCount = nextCastleCount * CASTLE_WORKERS_PER_CASTLE;
  if (ctx.db.castleWorkerV1.count() !== BigInt(nextWorkerCount)) {
    fail('WORKER_ROSTER_INTEGRITY');
  }
  ctx.db.realmWorkerSystemV1.realmId.update({
    ...system,
    expectedCastleCount: nextCastleCount,
    expectedWorkerCount: nextWorkerCount,
    rosterDigest: appendCastleWorkerRosterDigest(system.rosterDigest, castle.castleId),
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
