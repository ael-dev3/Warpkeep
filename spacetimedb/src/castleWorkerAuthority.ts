import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import { assertGenesisResourceForFid } from './resourceAuthority';
import { RESOURCE_BALANCE_CAP } from './resourceAuthorityPolicy';
import {
  activeExpeditionResourceReservations,
  planResourceSettlementForActiveExpeditionReservations,
} from './resourceExpeditionReservationAuthority';
import type warpkeep from './schema';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
  CASTLE_WORKERS_PER_CASTLE,
  CastleWorkerPolicyError,
  type CastleWorkerPhase,
  type CastleWorkerSiteShape,
  planCastleWorkerAccrual,
  planCastleWorkerTimeline,
  rosterDigestForCastleIds,
  workerAssignmentStateIsConsistent,
  workerIdForCastle,
  workerNodeKey,
  workerResourcePolicy,
  assertCastleWorkerId,
  assertWorkerCommandKey,
  canonicalWorkerRouteSteps,
} from './castleWorkerPolicy';
import {
  recallAllReplayMatches,
  recallAllWorkersReceipt,
  recallReplayMatches,
  recallWorkerReceipt,
  takeBoundedRows,
  workerCastleOwnershipMatches,
  workerCommandReceiptShapeIsValid,
  workerScheduleMatchesAssignment,
} from './castleWorkerCommandPolicy';
import {
  assertCastleWorkerRoster,
  castleWorkerPublicStateIsConsistent,
  workerSystemRowIsStagedOrActive,
} from './castleWorkerRoster';
import {
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>>;
type WorkerRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleWorkerV1']['workerId']['find']>>;
type AssignmentRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['workerAssignmentV1']['assignmentId']['find']>>;
type ScheduleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['workerAssignmentScheduleV1']['scheduleId']['find']>>;
type WorkerReceiptRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['workerCommandIdempotencyV1']['requestKey']['find']>>;
type ResourceAccountRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['resourceAccountV1']['fid']['find']>>;

export const WORKER_SCHEDULE_STAGE_ARRIVAL = 'arrival';
export const WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
export const WORKER_SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';
const WORKER_SYSTEM_REALM_ID = CANONICAL_REALM.realmId;
const WORKER_TIMELINE_MAX = 0xffff_ffff;
export const WORKER_IDEMPOTENCY_RECEIPTS_PER_FID = 64;
const BOUNDED_WORKER_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export class CastleWorkerAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'CastleWorkerAuthorityError';
  }
}

function fail(code: string): never {
  throw new CastleWorkerAuthorityError(code);
}

function safeNextU32(value: number, code: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value >= WORKER_TIMELINE_MAX) fail(code);
  return value + 1;
}

function safeNextU64(value: bigint, code: string): bigint {
  if (value < 0n || value >= (1n << 64n) - 1n) fail(code);
  return value + 1n;
}

function boundedRows<Row>(rows: Iterable<Row>, maximum: number, code: string): readonly Row[] {
  const bounded = takeBoundedRows(rows, maximum);
  if (bounded.overflow) fail(code);
  return bounded.rows;
}

function assignmentRequestKey(fid: bigint, idempotencyKey: string): string {
  assertWorkerCommandKey(idempotencyKey);
  return `${fid.toString()}:${idempotencyKey}`;
}

function resourceField(kind: string): 'food' | 'wood' | 'stone' | 'gold' {
  if (kind === 'food' || kind === 'wood' || kind === 'stone' || kind === 'gold') return kind;
  fail('WORKER_RESOURCE_UNSUPPORTED');
}

function assignmentPhase(value: string): CastleWorkerPhase {
  if (value === 'outbound' || value === 'gathering' || value === 'returning') return value;
  fail('WORKER_PHASE_INVALID');
}

function systemRow(ctx: WarpkeepReducerContext) {
  if (ctx.db.realmWorkerSystemV1.count() !== 1n) fail('WORKER_SYSTEM_NOT_READY');
  const row = ctx.db.realmWorkerSystemV1.realmId.find(WORKER_SYSTEM_REALM_ID);
  if (
    row === null
    || !workerSystemRowIsStagedOrActive(
      row,
      ctx.timestamp.microsSinceUnixEpoch,
    )
  ) fail('WORKER_SYSTEM_NOT_READY');
  return row;
}

function workerSettlementActive(ctx: WarpkeepReducerContext) {
  const row = systemRow(ctx);
  if (row.mode !== 'active') fail('WORKER_SYSTEM_STAGED');
  if (row.legacyDrainRequired) fail('WORKER_LEGACY_DRAIN_REQUIRED');
  const legacy = legacyActiveCounts(ctx);
  if (legacy.expeditions !== 0n || legacy.occupations !== 0n || legacy.schedules !== 0n) {
    fail('WORKER_LEGACY_DRAIN_REQUIRED');
  }
  return row;
}

function workerSystemActive(ctx: WarpkeepReducerContext) {
  const row = workerSettlementActive(ctx);
  const expectedCastleCount = BigInt(row.expectedCastleCount);
  const expectedWorkerCount = BigInt(row.expectedWorkerCount);
  if (
    expectedWorkerCount !== expectedCastleCount * BigInt(CASTLE_WORKERS_PER_CASTLE)
    || ctx.db.castle.count() !== expectedCastleCount
    || ctx.db.castleWorkerV1.count() !== expectedWorkerCount
    || !/^[0-9a-f]{16}$/.test(row.rosterDigest)
  ) fail('WORKER_ROSTER_NOT_READY');
  return row;
}

function canonicalSiteFor(
  ctx: WarpkeepReducerContext,
  resourceKind: string,
  siteId: string,
): CastleWorkerSiteShape {
  const policy = workerResourcePolicy(resourceKind);
  const canonical = policy.canonicalSiteForId(siteId);
  if (canonical === undefined || !canonical.active || !policy.matchesCanonicalSite(canonical)) {
    fail('WORKER_SITE_UNAVAILABLE');
  }
  const stored = resourceKind === 'gold'
    ? ctx.db.goldSiteV1.siteId.find(siteId)
    : resourceKind === 'food'
      ? ctx.db.foodSiteV1.siteId.find(siteId)
      : resourceKind === 'wood'
        ? ctx.db.woodSiteV1.siteId.find(siteId)
        : ctx.db.stoneSiteV1.siteId.find(siteId);
  if (stored === null || !policy.matchesCanonicalSite(stored)) fail('WORKER_SITE_INTEGRITY');
  const tileKey = `${canonical.q},${canonical.r}`;
  const tile = ctx.db.worldTile.key.find(tileKey);
  const meta = ctx.db.worldTileMetaV1.tileKey.find(tileKey);
  const expectedTile = canonicalTileForKey(tileKey);
  const expectedMeta = canonicalMetaForKey(tileKey);
  if (
    tile === null
    || meta === null
    || expectedTile === undefined
    || expectedMeta === undefined
    || !matchesCanonicalTerrain(tile)
    || !matchesCanonicalWorldMeta(meta)
    || !matchesCanonicalTerrain(expectedTile)
    || !matchesCanonicalWorldMeta(expectedMeta)
    || !meta.passable
    || meta.staticContentKind !== 'resource-capable'
    || tile.q !== canonical.q
    || tile.r !== canonical.r
  ) fail('WORKER_SITE_WORLD_INTEGRITY');
  return canonical;
}

function legacyOccupationAt(ctx: WarpkeepReducerContext, resourceKind: string, siteId: string): boolean {
  return resourceKind === 'gold'
    ? ctx.db.goldNodeOccupationV1.siteId.find(siteId) !== null
    : resourceKind === 'food'
      ? ctx.db.foodNodeOccupationV1.siteId.find(siteId) !== null
      : resourceKind === 'wood'
        ? ctx.db.woodNodeOccupationV1.siteId.find(siteId) !== null
        : ctx.db.stoneNodeOccupationV1.siteId.find(siteId) !== null;
}

function publicWorkerMatchesAssignment(worker: WorkerRow, assignment: AssignmentRow): boolean {
  const expectedReturnProgress = assignment.phase === 'returning'
    ? assignment.returnStartProgressBasisPoints
    : undefined;
  return worker.workerId === assignment.workerId
    && worker.ordinal >= 1
    && worker.ordinal <= CASTLE_WORKERS_PER_CASTLE
    && worker.workerId === workerIdForCastle(assignment.originCastleId, worker.ordinal)
    && worker.originCastleId === assignment.originCastleId
    && worker.status === assignment.phase
    && worker.resourceKind === assignment.resourceKind
    && worker.siteId === assignment.siteId
    && worker.startedAtMicros === assignment.startedAtMicros
    && worker.arrivesAtMicros === assignment.arrivesAtMicros
    && worker.gatheringEndsAtMicros === assignment.gatheringEndsAtMicros
    && worker.returnStartedAtMicros === assignment.returnStartedAtMicros
    && worker.returnsAtMicros === assignment.returnsAtMicros
    && worker.routeSteps === assignment.routeSteps
    && worker.returnStartProgressBasisPoints === expectedReturnProgress
    && worker.timelineRevision === assignment.timelineRevision;
}

function occupationMatchesAssignment(
  occupation: NonNullable<ReturnType<WarpkeepReducerContext['db']['workerNodeOccupationV1']['nodeKey']['find']>>,
  assignment: AssignmentRow,
): boolean {
  // The occupation is only the outbound/gathering site lease and is deleted
  // before return starts. Return chronology therefore belongs to the worker
  // projection; every field that the occupation does expose is matched here.
  return occupation.nodeKey === workerNodeKey(assignment.resourceKind, assignment.siteId)
    && occupation.resourceKind === assignment.resourceKind
    && occupation.siteId === assignment.siteId
    && occupation.workerId === assignment.workerId
    && occupation.workerOrdinal >= 1
    && occupation.workerOrdinal <= CASTLE_WORKERS_PER_CASTLE
    && assignment.workerId === workerIdForCastle(assignment.originCastleId, occupation.workerOrdinal)
    && occupation.originCastleId === assignment.originCastleId
    && assignment.phase !== 'returning'
    && occupation.phase === assignment.phase
    && occupation.startedAtMicros === assignment.startedAtMicros
    && occupation.arrivesAtMicros === assignment.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === assignment.gatheringEndsAtMicros
    && occupation.timelineRevision === assignment.timelineRevision;
}

function canonicalCastleOwnershipMatches(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castleId: bigint,
): boolean {
  const castle = ctx.db.castle.castleId.find(castleId);
  const account = ctx.db.resourceAccountV1.fid.find(fid);
  return workerCastleOwnershipMatches({
    fid,
    castleId,
    castleOwnerFid: castle?.ownerFid,
    accountFid: account?.fid,
    accountCastleId: account?.castleId,
  });
}

function assignmentOwnerIsCanonical(ctx: WarpkeepReducerContext, assignment: AssignmentRow): boolean {
  return canonicalCastleOwnershipMatches(ctx, assignment.fid, assignment.originCastleId);
}

function receiptOwnerIsCanonical(
  ctx: WarpkeepReducerContext,
  receipt: WorkerReceiptRow,
  expectedCastleId?: bigint,
): boolean {
  if (receipt.workerId !== undefined) {
    const worker = ctx.db.castleWorkerV1.workerId.find(receipt.workerId);
    return worker !== null
      && worker.ordinal >= 1
      && worker.ordinal <= CASTLE_WORKERS_PER_CASTLE
      && worker.workerId === workerIdForCastle(worker.originCastleId, worker.ordinal)
      && (expectedCastleId === undefined || worker.originCastleId === expectedCastleId)
      && canonicalCastleOwnershipMatches(ctx, receipt.fid, worker.originCastleId);
  }
  const castle = ctx.db.castle.ownerFid.find(receipt.fid);
  return castle !== null
    && (expectedCastleId === undefined || castle.castleId === expectedCastleId)
    && canonicalCastleOwnershipMatches(ctx, receipt.fid, castle.castleId);
}

function workerReceiptShapeIsValid(receipt: WorkerReceiptRow): boolean {
  return workerCommandReceiptShapeIsValid(receipt);
}

function assertAssignmentState(assignment: AssignmentRow): void {
  assignmentPhase(assignment.phase);
  assertCastleWorkerId(assignment.workerId);
  if (
    assignment.assignmentId.length === 0
    || assignment.fid <= 0n
    || assignment.originCastleId < 0n
    || assignment.siteId.length === 0
    || assignment.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || !workerAssignmentStateIsConsistent(assignment)
    || assignment.returnStartProgressBasisPoints > 10_000
    || !Number.isSafeInteger(assignment.timelineRevision)
    || assignment.timelineRevision < 0
  ) fail('WORKER_ASSIGNMENT_STATE_INVALID');
}

function insertSchedule(
  ctx: WarpkeepReducerContext,
  assignment: AssignmentRow,
  stage: string,
  atMicros: bigint,
): void {
  ctx.db.workerAssignmentScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    assignmentId: assignment.assignmentId,
    workerId: assignment.workerId,
    timelineRevision: assignment.timelineRevision,
    stage,
  });
}

function deleteSchedulesForAssignment(ctx: WarpkeepReducerContext, assignmentId: string): void {
  for (const schedule of [...ctx.db.workerAssignmentScheduleV1.byAssignment.filter(assignmentId)]) {
    ctx.db.workerAssignmentScheduleV1.scheduleId.delete(schedule.scheduleId);
  }
}

function scheduleMatchesAssignment(schedule: ScheduleRow, assignment: AssignmentRow): boolean {
  return workerScheduleMatchesAssignment(schedule, assignment);
}

type CallerWorkerGraph = Readonly<{
  roster: readonly WorkerRow[];
  assignments: readonly AssignmentRow[];
}>;

/**
 * Validate only the caller's fixed-size worker graph. Whole-realm inspection
 * remains available through the admin procedures, but gameplay paths never
 * iterate realm-wide tables.
 */
function assertCallerWorkerGraph(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castleId: bigint,
): CallerWorkerGraph {
  const roster = assertCastleWorkerRoster(ctx, castleId);
  const rosterByWorker = new Map(roster.map(worker => [worker.workerId, worker]));
  const assignments = boundedRows(
    ctx.db.workerAssignmentV1.byFid.filter(fid),
    CASTLE_WORKERS_PER_CASTLE,
    'WORKER_ASSIGNMENT_LIMIT',
  );
  const assignmentByWorker = new Map<string, AssignmentRow>();
  for (const assignment of assignments) {
    assertAssignmentState(assignment);
    const worker = rosterByWorker.get(assignment.workerId);
    if (
      assignment.fid !== fid
      || assignment.originCastleId !== castleId
      || !assignmentOwnerIsCanonical(ctx, assignment)
      || worker === undefined
      || assignmentByWorker.has(assignment.workerId)
      || !publicWorkerMatchesAssignment(worker, assignment)
    ) fail('WORKER_ASSIGNMENT_INTEGRITY');
    assignmentByWorker.set(assignment.workerId, assignment);
  }
  for (const worker of roster) {
    const directAssignment = ctx.db.workerAssignmentV1.workerId.find(worker.workerId);
    const assignment = assignmentByWorker.get(worker.workerId);
    if (
      (directAssignment === null) !== (assignment === undefined)
      || (directAssignment !== null && directAssignment.assignmentId !== assignment?.assignmentId)
    ) fail('WORKER_ASSIGNMENT_INTEGRITY');
    const occupations = boundedRows(
      ctx.db.workerNodeOccupationV1.byWorker.filter(worker.workerId),
      1,
      'WORKER_OCCUPATION_LIMIT',
    );
    const schedules = boundedRows(
      ctx.db.workerAssignmentScheduleV1.byWorker.filter(worker.workerId),
      1,
      'WORKER_SCHEDULE_LIMIT',
    );
    if (assignment === undefined) {
      if (worker.status !== 'idle' || occupations.length !== 0 || schedules.length !== 0) {
        fail('WORKER_ASSIGNMENT_INTEGRITY');
      }
      continue;
    }
    const expectedOccupationCount = assignment.phase === 'returning' ? 0 : 1;
    if (
      occupations.length !== expectedOccupationCount
      || (occupations[0] !== undefined && !occupationMatchesAssignment(occupations[0], assignment))
      || schedules.length !== 1
      || !scheduleMatchesAssignment(schedules[0]!, assignment)
    ) fail('WORKER_ASSIGNMENT_INTEGRITY');
  }
  const receipts = boundedRows(
    ctx.db.workerCommandIdempotencyV1.byFid.filter(fid),
    WORKER_IDEMPOTENCY_RECEIPTS_PER_FID,
    'WORKER_IDEMPOTENCY_LIMIT',
  );
  const highestRosterRevision = roster.reduce(
    (highest, worker) => worker.revision > highest ? worker.revision : highest,
    0n,
  );
  for (const receipt of receipts) {
    const receiptWorker = receipt.workerId === undefined
      ? undefined
      : rosterByWorker.get(receipt.workerId);
    if (
      !workerReceiptShapeIsValid(receipt)
      || !receiptOwnerIsCanonical(ctx, receipt, castleId)
      || (receiptWorker !== undefined && receipt.resultRevision > receiptWorker.revision)
      || (receipt.workerId === undefined && receipt.resultRevision > highestRosterRevision)
    ) fail('WORKER_IDEMPOTENCY_OWNER_INVALID');
  }
  return Object.freeze({ roster, assignments });
}

function pruneWorkerIdempotencyReceipts(ctx: WarpkeepReducerContext, fid: bigint): void {
  const receipts = [...boundedRows(
    ctx.db.workerCommandIdempotencyV1.byFid.filter(fid),
    WORKER_IDEMPOTENCY_RECEIPTS_PER_FID,
    'WORKER_IDEMPOTENCY_LIMIT',
  )]
    .sort((left, right) => {
      const timeOrder = left.createdAt.microsSinceUnixEpoch < right.createdAt.microsSinceUnixEpoch
        ? -1
        : left.createdAt.microsSinceUnixEpoch > right.createdAt.microsSinceUnixEpoch ? 1 : 0;
      return timeOrder || left.requestKey.localeCompare(right.requestKey);
    });
  const deleteCount = Math.max(0, receipts.length - WORKER_IDEMPOTENCY_RECEIPTS_PER_FID + 1);
  for (const receipt of receipts.slice(0, deleteCount)) {
    ctx.db.workerCommandIdempotencyV1.requestKey.delete(receipt.requestKey);
  }
}

function updateResourceAccount(
  ctx: WarpkeepReducerContext,
  resource: ResourceAccountRow,
  balances: ResourceAccountRow,
  passiveSettledThroughMicros: bigint,
  revision: bigint,
): void {
  ctx.db.resourceAccountV1.fid.update({
    ...resource,
    food: balances.food,
    wood: balances.wood,
    stone: balances.stone,
    gold: balances.gold,
    settledThroughMicros: passiveSettledThroughMicros,
    revision,
    updatedAt: ctx.timestamp,
  });
}

/**
 * Materialize every complete worker quantum for one caller in one transaction.
 * Reads use the sibling projection below and never call this writer. No
 * per-minute writes occur: schedules and caller reads settle exact quanta.
 */
export function settleAllWorkerAssignmentsForFid(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  observedAtMicros = ctx.timestamp.microsSinceUnixEpoch,
): void {
  const resource = assertGenesisResourceForFid(ctx, fid);
  const assignments = boundedRows(
    ctx.db.workerAssignmentV1.byFid.filter(fid),
    CASTLE_WORKERS_PER_CASTLE,
    'WORKER_ASSIGNMENT_LIMIT',
  );
  if (assignments.length > 0) workerSettlementActive(ctx);
  const passive = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    fid,
    resource.account,
    resource.terrainKind,
    observedAtMicros,
  );
  const balances = {
    ...resource.account,
    food: passive.balances.food,
    wood: passive.balances.wood,
    stone: passive.balances.stone,
    gold: passive.balances.gold,
  };
  let changed = passive.completedQuanta > 0n;
  for (const assignment of assignments) {
    assertAssignmentState(assignment);
    if (assignment.fid !== fid || assignment.originCastleId !== resource.castle.castleId) fail('WORKER_OWNER_INTEGRITY');
    const plan = planCastleWorkerAccrual(assignment, observedAtMicros);
    const credit = plan.accruedAmount - assignment.materializedAmount;
    if (credit < 0n) fail('WORKER_MATERIALIZATION_INVALID');
    if (plan.completedQuanta === 0n && credit === 0n) continue;
    const field = resourceField(assignment.resourceKind);
    if (credit > RESOURCE_BALANCE_CAP - balances[field]) fail('WORKER_ACCOUNT_CAPACITY');
    balances[field] += credit;
    ctx.db.workerAssignmentV1.assignmentId.update({
      ...assignment,
      settledThroughMicros: plan.settledThroughMicros,
      accruedAmount: plan.accruedAmount,
      materializedAmount: plan.accruedAmount,
      updatedAt: ctx.timestamp,
    });
    changed = true;
  }
  if (changed) {
    updateResourceAccount(
      ctx,
      resource.account,
      balances,
      passive.settledThroughMicros,
      safeNextU64(resource.account.revision, 'WORKER_RESOURCE_REVISION'),
    );
  }
}

export type WorkerPrivateProjection = Readonly<{
  workerId: string;
  ordinal: number;
  status: string;
  resourceKind: string | undefined;
  siteId: string | undefined;
  accruedAmount: bigint;
  materializedAmount: bigint;
  availableAmount: bigint;
  observedAtMicros: bigint;
  revision: bigint;
}>;

export function projectMyWorkerState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  observedAtMicros = ctx.timestamp.microsSinceUnixEpoch,
): Readonly<{ resource: ResourceAccountRow; balances: Readonly<Record<'food' | 'wood' | 'stone' | 'gold', bigint>>; workers: readonly WorkerPrivateProjection[] }> {
  workerSystemActive(ctx);
  const resource = assertGenesisResourceForFid(ctx, fid);
  const callerGraph = assertCallerWorkerGraph(ctx, fid, resource.castle.castleId);
  const passive = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    fid,
    resource.account,
    resource.terrainKind,
    observedAtMicros,
  );
  const balances = {
    food: passive.balances.food,
    wood: passive.balances.wood,
    stone: passive.balances.stone,
    gold: passive.balances.gold,
  };
  const workers = [...callerGraph.roster]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(worker => {
      const assignment = ctx.db.workerAssignmentV1.workerId.find(worker.workerId);
      if (assignment === null) {
        if (worker.status !== 'idle') fail('WORKER_ASSIGNMENT_MISSING');
        return Object.freeze({
          workerId: worker.workerId,
          ordinal: worker.ordinal,
          status: worker.status,
          resourceKind: worker.resourceKind,
          siteId: worker.siteId,
          accruedAmount: 0n,
          materializedAmount: 0n,
          availableAmount: 0n,
          observedAtMicros,
          revision: worker.revision,
        });
      }
      assertAssignmentState(assignment);
      if (!publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
      const plan = planCastleWorkerAccrual(assignment, observedAtMicros);
      const availableAmount = plan.accruedAmount - assignment.materializedAmount;
      if (availableAmount < 0n) fail('WORKER_MATERIALIZATION_INVALID');
      const field = resourceField(assignment.resourceKind);
      if (availableAmount > RESOURCE_BALANCE_CAP - balances[field]) fail('WORKER_ACCOUNT_CAPACITY');
      balances[field] += availableAmount;
      return Object.freeze({
        workerId: worker.workerId,
        ordinal: worker.ordinal,
        status: worker.status,
        resourceKind: worker.resourceKind,
        siteId: worker.siteId,
        accruedAmount: plan.accruedAmount,
        materializedAmount: assignment.materializedAmount,
        availableAmount,
        observedAtMicros,
        revision: worker.revision,
      });
    });
  return Object.freeze({ resource: resource.account, balances: Object.freeze(balances), workers: Object.freeze(workers) });
}

function assertDispatchReservations(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  account: ResourceAccountRow,
  resourceKind: string,
): void {
  const policy = workerResourcePolicy(resourceKind);
  const reservations = activeExpeditionResourceReservations(ctx, fid);
  const field = resourceField(resourceKind);
  const existingReservation = reservations[field];
  if (account[field] > RESOURCE_BALANCE_CAP || existingReservation > RESOURCE_BALANCE_CAP) fail('WORKER_ACCOUNT_STATE_INVALID');
  if (policy.gatheringTotal > RESOURCE_BALANCE_CAP - account[field] - existingReservation) {
    fail('WORKER_ACCOUNT_CAPACITY');
  }
}

export type WorkerDispatchResult = Readonly<{ assignment: AssignmentRow; idempotent: boolean }>;

export function dispatchCastleWorker(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; castle: CastleRow; workerId: string; resourceKind: string; siteId: string; idempotencyKey: string }>,
): WorkerDispatchResult {
  const requestKey = assignmentRequestKey(input.fid, input.idempotencyKey);
  const prior = ctx.db.workerCommandIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.commandKind !== 'dispatch' || prior.workerId !== input.workerId || prior.resourceKind !== input.resourceKind || prior.siteId !== input.siteId || prior.assignmentId === undefined) fail('WORKER_IDEMPOTENCY_CONFLICT');
    if (
      !workerReceiptShapeIsValid(prior)
      || !canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)
      || !receiptOwnerIsCanonical(ctx, prior, input.castle.castleId)
    ) fail('WORKER_IDEMPOTENCY_OWNER_INVALID');
    const assignment = ctx.db.workerAssignmentV1.assignmentId.find(prior.assignmentId);
    if (
      assignment === null
      || assignment.fid !== input.fid
      || assignment.workerId !== input.workerId
      || assignment.resourceKind !== input.resourceKind
      || assignment.siteId !== input.siteId
      || assignment.originCastleId !== input.castle.castleId
      || !assignmentOwnerIsCanonical(ctx, assignment)
    ) fail('WORKER_IDEMPOTENCY_STALE');
    assertAssignmentState(assignment);
    const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
    if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) {
      fail('WORKER_IDEMPOTENCY_STALE');
    }
    return Object.freeze({ assignment, idempotent: true });
  }
  workerSystemActive(ctx);
  if (!canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)) fail('WORKER_NOT_OWNED');
  const callerGraph = assertCallerWorkerGraph(ctx, input.fid, input.castle.castleId);
  settleAllWorkerAssignmentsForFid(ctx, input.fid);
  const roster = callerGraph.roster;
  const worker = ctx.db.castleWorkerV1.workerId.find(input.workerId);
  if (worker === null || worker.originCastleId !== input.castle.castleId || !roster.some(row => row.workerId === worker.workerId)) fail('WORKER_NOT_OWNED');
  assertCastleWorkerId(worker.workerId);
  if (worker.status !== 'idle' || ctx.db.workerAssignmentV1.workerId.find(worker.workerId) !== null) fail('WORKER_NOT_IDLE');
  const site = canonicalSiteFor(ctx, input.resourceKind, input.siteId);
  if (legacyOccupationAt(ctx, input.resourceKind, input.siteId)) fail('WORKER_LEGACY_SITE_OCCUPIED');
  // Resource kind is not a capacity bucket: all four castle workers may use
  // the same kind. The composite node key is the single-occupancy boundary.
  const nodeKey = workerNodeKey(input.resourceKind, input.siteId);
  if (ctx.db.workerNodeOccupationV1.nodeKey.find(nodeKey) !== null) fail('WORKER_SITE_OCCUPIED');
  const routeSteps = canonicalWorkerRouteSteps(input.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('WORKER_ROUTE_INVALID');
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  assertDispatchReservations(ctx, input.fid, resource.account, input.resourceKind);
  const timeline = planCastleWorkerTimeline(ctx.timestamp.microsSinceUnixEpoch, routeSteps);
  const timelineRevision = safeNextU32(worker.timelineRevision, 'WORKER_TIMELINE_REVISION');
  const assignment = ctx.db.workerAssignmentV1.insert({
    assignmentId: ctx.newUuidV7().toString(),
    workerId: worker.workerId,
    fid: input.fid,
    originCastleId: input.castle.castleId,
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    phase: 'outbound',
    ...timeline,
    returnStartedAtMicros: undefined,
    routeSteps,
    returnStartProgressBasisPoints: 0,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedAmount: 0n,
    materializedAmount: 0n,
    timelineRevision,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'outbound',
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    returnStartedAtMicros: undefined,
    returnsAtMicros: assignment.returnsAtMicros,
    routeSteps: assignment.routeSteps,
    returnStartProgressBasisPoints: undefined,
    timelineRevision,
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
  });
  ctx.db.workerNodeOccupationV1.insert({
    nodeKey,
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    workerId: worker.workerId,
    workerOrdinal: worker.ordinal,
    originCastleId: input.castle.castleId,
    phase: 'outbound',
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    timelineRevision: assignment.timelineRevision,
  });
  insertSchedule(ctx, assignment, WORKER_SCHEDULE_STAGE_ARRIVAL, assignment.arrivesAtMicros);
  const updatedWorker = ctx.db.castleWorkerV1.workerId.find(worker.workerId);
  if (updatedWorker === null || !publicWorkerMatchesAssignment(updatedWorker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  pruneWorkerIdempotencyReceipts(ctx, input.fid);
  ctx.db.workerCommandIdempotencyV1.insert({
    requestKey,
    fid: input.fid,
    workerId: worker.workerId,
    commandKind: 'dispatch',
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    assignmentId: assignment.assignmentId,
    resultRevision: updatedWorker.revision,
    createdAt: ctx.timestamp,
  });
  return Object.freeze({ assignment, idempotent: false });
}

function progressBasisPoints(assignment: AssignmentRow, now: bigint): number {
  if (now <= assignment.startedAtMicros) return 0;
  if (now >= assignment.arrivesAtMicros) return 10_000;
  const elapsed = now - assignment.startedAtMicros;
  const duration = assignment.arrivesAtMicros - assignment.startedAtMicros;
  return Number((elapsed * 10_000n) / duration);
}

function remainingTravelMicros(assignment: AssignmentRow, progress: number): bigint {
  const travel = BigInt(assignment.routeSteps) * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
  // The return path starts at the worker's current outbound position: zero
  // progress is still at the castle, while 10,000 is at the node.
  return (travel * BigInt(progress)) / 10_000n;
}

function beginWorkerReturn(
  ctx: WarpkeepReducerContext,
  assignment: AssignmentRow,
  progress: number,
  now: bigint,
): AssignmentRow {
  assertAssignmentState(assignment);
  if (assignment.phase !== 'outbound' && assignment.phase !== 'gathering') return assignment;
  const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(
    workerNodeKey(assignment.resourceKind, assignment.siteId),
  );
  if (occupation === null || !occupationMatchesAssignment(occupation, assignment)) fail('WORKER_OCCUPATION_INTEGRITY');
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  const returningAtMicros = now + remainingTravelMicros(assignment, progress);
  const timelineRevision = safeNextU32(assignment.timelineRevision, 'WORKER_TIMELINE_REVISION');
  const returning = {
    ...assignment,
    phase: 'returning',
    returnStartedAtMicros: now,
    returnsAtMicros: returningAtMicros,
    returnStartProgressBasisPoints: progress,
    timelineRevision,
    updatedAt: ctx.timestamp,
  };
  deleteSchedulesForAssignment(ctx, assignment.assignmentId);
  ctx.db.workerNodeOccupationV1.nodeKey.delete(occupation.nodeKey);
  ctx.db.workerAssignmentV1.assignmentId.update(returning);
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'returning',
    returnStartedAtMicros: now,
    returnsAtMicros: returningAtMicros,
    returnStartProgressBasisPoints: progress,
    timelineRevision,
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
  });
  insertSchedule(ctx, returning, WORKER_SCHEDULE_STAGE_RETURN_COMPLETE, returningAtMicros);
  return returning;
}

function completeWorkerReturn(ctx: WarpkeepReducerContext, assignment: AssignmentRow, now: bigint): void {
  if (now < assignment.returnsAtMicros) return;
  if (assignment.phase !== 'returning') fail('WORKER_RETURN_STATE');
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  if (ctx.db.workerNodeOccupationV1.nodeKey.find(
    workerNodeKey(assignment.resourceKind, assignment.siteId),
  ) !== null) {
    fail('WORKER_OCCUPATION_INTEGRITY');
  }
  deleteSchedulesForAssignment(ctx, assignment.assignmentId);
  ctx.db.workerAssignmentV1.assignmentId.delete(assignment.assignmentId);
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
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
    timelineRevision: safeNextU32(worker.timelineRevision, 'WORKER_TIMELINE_REVISION'),
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
  });
}

function transitionWorkerArrival(ctx: WarpkeepReducerContext, assignment: AssignmentRow, now: bigint): AssignmentRow {
  if (now < assignment.arrivesAtMicros) return assignment;
  if (assignment.phase !== 'outbound') return assignment;
  const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(
    workerNodeKey(assignment.resourceKind, assignment.siteId),
  );
  if (occupation === null || !occupationMatchesAssignment(occupation, assignment)) fail('WORKER_OCCUPATION_MISSING');
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  const timelineRevision = safeNextU32(assignment.timelineRevision, 'WORKER_TIMELINE_REVISION');
  const gathering = { ...assignment, phase: 'gathering', timelineRevision, updatedAt: ctx.timestamp };
  deleteSchedulesForAssignment(ctx, assignment.assignmentId);
  ctx.db.workerAssignmentV1.assignmentId.update(gathering);
  ctx.db.workerNodeOccupationV1.nodeKey.update({ ...occupation, phase: 'gathering', timelineRevision });
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'gathering',
    timelineRevision,
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
  });
  insertSchedule(ctx, gathering, WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY, gathering.gatheringEndsAtMicros);
  return gathering;
}

function settleAndBeginReturnAt(
  ctx: WarpkeepReducerContext,
  assignment: AssignmentRow,
  settlementObservedAtMicros: bigint,
  returnStartedAtMicros: bigint,
  progress: number,
): AssignmentRow {
  settleAllWorkerAssignmentsForFid(
    ctx,
    assignment.fid,
    settlementObservedAtMicros,
  );
  const fresh = ctx.db.workerAssignmentV1.assignmentId.find(assignment.assignmentId);
  if (fresh === null) fail('WORKER_ASSIGNMENT_MISSING');
  return beginWorkerReturn(
    ctx,
    fresh,
    progress,
    returnStartedAtMicros,
  );
}

export function runCastleWorkerSchedule(ctx: WarpkeepReducerContext, schedule: ScheduleRow): void {
  const assignment = ctx.db.workerAssignmentV1.assignmentId.find(schedule.assignmentId);
  if (assignment === null || !scheduleMatchesAssignment(schedule, assignment)) {
    ctx.db.workerAssignmentScheduleV1.scheduleId.delete(schedule.scheduleId);
    return;
  }
  assertAssignmentState(assignment);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (schedule.stage === WORKER_SCHEDULE_STAGE_ARRIVAL) {
    transitionWorkerArrival(ctx, assignment, now);
    return;
  }
  if (schedule.stage === WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY) {
    const gathering = transitionWorkerArrival(ctx, assignment, now);
    if (now < gathering.gatheringEndsAtMicros || gathering.phase === 'returning') return;
    settleAndBeginReturnAt(
      ctx,
      gathering,
      now,
      gathering.gatheringEndsAtMicros,
      10_000,
    );
    return;
  }
  if (schedule.stage === WORKER_SCHEDULE_STAGE_RETURN_COMPLETE) {
    completeWorkerReturn(ctx, assignment, now);
    return;
  }
  ctx.db.workerAssignmentScheduleV1.scheduleId.delete(schedule.scheduleId);
}

export function recallCastleWorker(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; castle: CastleRow; workerId: string; idempotencyKey: string }>,
): void {
  const requestKey = assignmentRequestKey(input.fid, input.idempotencyKey);
  const prior = ctx.db.workerCommandIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.commandKind !== 'recall' || prior.workerId !== input.workerId) fail('WORKER_IDEMPOTENCY_CONFLICT');
    if (
      !recallReplayMatches(prior, input.fid, input.workerId)
      || !canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)
      || !receiptOwnerIsCanonical(ctx, prior, input.castle.castleId)
    ) fail('WORKER_IDEMPOTENCY_OWNER_INVALID');
    return;
  }
  workerSystemActive(ctx);
  if (!canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)) fail('WORKER_NOT_OWNED');
  const callerGraph = assertCallerWorkerGraph(ctx, input.fid, input.castle.castleId);
  const worker = callerGraph.roster.find(row => row.workerId === input.workerId);
  if (worker === undefined) fail('WORKER_NOT_OWNED');
  let assignment = ctx.db.workerAssignmentV1.workerId.find(worker.workerId);
  if (assignment === null) {
    if (worker.status !== 'idle') fail('WORKER_ASSIGNMENT_MISSING');
  } else if (assignment.phase !== 'returning') {
    settleAllWorkerAssignmentsForFid(ctx, input.fid);
    assignment = ctx.db.workerAssignmentV1.workerId.find(worker.workerId);
    if (assignment === null || assignment.fid !== input.fid) fail('WORKER_ASSIGNMENT_MISSING');
    const now = ctx.timestamp.microsSinceUnixEpoch;
    const returnStartedAtMicros = now < assignment.gatheringEndsAtMicros
      ? now
      : assignment.gatheringEndsAtMicros;
    const progress = returnStartedAtMicros < assignment.arrivesAtMicros
      ? progressBasisPoints(assignment, returnStartedAtMicros)
      : 10_000;
    assignment = beginWorkerReturn(ctx, assignment, progress, returnStartedAtMicros);
  }
  const updatedWorker = ctx.db.castleWorkerV1.workerId.find(worker.workerId);
  if (
    updatedWorker === null
    || (assignment !== null && !publicWorkerMatchesAssignment(updatedWorker, assignment))
  ) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  pruneWorkerIdempotencyReceipts(ctx, input.fid);
  const receipt = recallWorkerReceipt(
    requestKey,
    input.fid,
    worker.workerId,
    updatedWorker.revision,
    assignment === null ? undefined : {
      resourceKind: assignment.resourceKind,
      siteId: assignment.siteId,
      assignmentId: assignment.assignmentId,
    },
  );
  ctx.db.workerCommandIdempotencyV1.insert({
    ...receipt,
    createdAt: ctx.timestamp,
  });
}

export function recallAllCastleWorkers(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; castle: CastleRow; idempotencyKey: string }>,
): void {
  const requestKey = assignmentRequestKey(input.fid, input.idempotencyKey);
  const prior = ctx.db.workerCommandIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.commandKind !== 'recall-all' || prior.workerId !== undefined) fail('WORKER_IDEMPOTENCY_CONFLICT');
    if (
      !recallAllReplayMatches(prior, input.fid)
      || !canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)
      || !receiptOwnerIsCanonical(ctx, prior, input.castle.castleId)
    ) fail('WORKER_IDEMPOTENCY_OWNER_INVALID');
    return;
  }
  workerSystemActive(ctx);
  if (!canonicalCastleOwnershipMatches(ctx, input.fid, input.castle.castleId)) fail('WORKER_NOT_OWNED');
  const callerGraph = assertCallerWorkerGraph(ctx, input.fid, input.castle.castleId);
  const roster = [...callerGraph.roster].sort((left, right) => left.ordinal - right.ordinal);
  if (callerGraph.assignments.some(assignment => assignment.phase !== 'returning')) {
    settleAllWorkerAssignmentsForFid(ctx, input.fid);
  }
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let lastAssignmentId: string | undefined;
  let resultRevision = roster.reduce(
    (highest, worker) => worker.revision > highest ? worker.revision : highest,
    0n,
  );
  for (const worker of roster) {
    const fresh = ctx.db.castleWorkerV1.workerId.find(worker.workerId);
    if (fresh === null || fresh.originCastleId !== input.castle.castleId) fail('WORKER_ROSTER_INTEGRITY');
    const assignment = ctx.db.workerAssignmentV1.workerId.find(fresh.workerId);
    if (assignment === null) {
      if (fresh.status !== 'idle') fail('WORKER_ASSIGNMENT_INTEGRITY');
      continue;
    }
    if (assignment.fid !== input.fid || !publicWorkerMatchesAssignment(fresh, assignment)) fail('WORKER_ASSIGNMENT_INTEGRITY');
    if (assignment.phase === 'returning') continue;
    const returnStartedAtMicros = now < assignment.gatheringEndsAtMicros
      ? now
      : assignment.gatheringEndsAtMicros;
    const progress = returnStartedAtMicros < assignment.arrivesAtMicros
      ? progressBasisPoints(assignment, returnStartedAtMicros)
      : 10_000;
    const returning = beginWorkerReturn(ctx, assignment, progress, returnStartedAtMicros);
    const updatedWorker = ctx.db.castleWorkerV1.workerId.find(fresh.workerId);
    if (updatedWorker === null || !publicWorkerMatchesAssignment(updatedWorker, returning)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
    lastAssignmentId = returning.assignmentId;
    if (updatedWorker.revision > resultRevision) resultRevision = updatedWorker.revision;
  }
  pruneWorkerIdempotencyReceipts(ctx, input.fid);
  const receipt = recallAllWorkersReceipt(
    requestKey,
    input.fid,
    resultRevision,
    lastAssignmentId,
  );
  ctx.db.workerCommandIdempotencyV1.insert({
    ...receipt,
    createdAt: ctx.timestamp,
  });
}

export type WorkerGraphAggregate = Readonly<{
  systemRows: bigint;
  mode: string;
  systemConfigValid: boolean;
  legacyDrainRequired: boolean;
  expectedCastleCount: bigint;
  expectedWorkerCount: bigint;
  actualWorkerCount: bigint;
  expectedCountsMatch: boolean;
  rosterDigestMatches: boolean;
  castlesMissingWorkers: bigint;
  castlesWithExtraWorkers: bigint;
  duplicateOrdinals: bigint;
  malformedWorkerIds: bigint;
  invalidWorkerStates: bigint;
  idleWorkers: bigint;
  outboundWorkers: bigint;
  gatheringWorkers: bigint;
  returningWorkers: bigint;
  assignments: bigint;
  occupations: bigint;
  schedules: bigint;
  orphanWorkers: bigint;
  orphanAssignments: bigint;
  assignmentsMissingOccupation: bigint;
  assignmentsWithoutSingleSchedule: bigint;
  orphanOccupations: bigint;
  orphanSchedules: bigint;
  invalidSchedules: bigint;
  assignmentPublicMismatches: bigint;
  occupationSiteMismatches: bigint;
  invalidAssignments: bigint;
  idempotencyReceipts: bigint;
  invalidIdempotencyReceipts: bigint;
  idempotencyOverflowFids: bigint;
  legacyExpeditions: bigint;
  legacyOccupations: bigint;
  legacySchedules: bigint;
  rosterDigest: string;
  rosterDigestExpected: string;
}>;

function legacyActiveCounts(ctx: WarpkeepReducerContext): Readonly<{ expeditions: bigint; occupations: bigint; schedules: bigint }> {
  return Object.freeze({
    expeditions: ctx.db.goldExpeditionV1.count() + ctx.db.foodExpeditionV1.count() + ctx.db.woodExpeditionV1.count() + ctx.db.stoneExpeditionV1.count(),
    occupations: ctx.db.goldNodeOccupationV1.count() + ctx.db.foodNodeOccupationV1.count() + ctx.db.woodNodeOccupationV1.count() + ctx.db.stoneNodeOccupationV1.count(),
    schedules: ctx.db.goldExpeditionScheduleV1.count() + ctx.db.foodExpeditionScheduleV1.count() + ctx.db.woodExpeditionScheduleV1.count() + ctx.db.stoneExpeditionScheduleV1.count(),
  });
}

export function inspectCastleWorkerGraph(ctx: WarpkeepReducerContext): WorkerGraphAggregate {
  const system = ctx.db.realmWorkerSystemV1.realmId.find(WORKER_SYSTEM_REALM_ID);
  const castles = [...ctx.db.castle.iter()].sort((left, right) => left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0);
  let castlesMissingWorkers = 0n;
  let castlesWithExtraWorkers = 0n;
  let duplicateOrdinals = 0n;
  let malformedWorkerIds = 0n;
  let invalidWorkerStates = 0n;
  let assignmentPublicMismatches = 0n;
  let orphanWorkers = 0n;
  let idleWorkers = 0n;
  let outboundWorkers = 0n;
  let gatheringWorkers = 0n;
  let returningWorkers = 0n;
  for (const castle of castles) {
    const rows = [...ctx.db.castleWorkerV1.byOriginCastle.filter(castle.castleId)];
    if (rows.length < CASTLE_WORKERS_PER_CASTLE) castlesMissingWorkers += 1n;
    if (rows.length > CASTLE_WORKERS_PER_CASTLE) castlesWithExtraWorkers += 1n;
    const ordinals = new Set<number>();
    for (const row of rows) {
      try {
        assertCastleWorkerId(row.workerId);
        if (
          row.originCastleId !== castle.castleId
          || row.ordinal < 1
          || row.ordinal > CASTLE_WORKERS_PER_CASTLE
          || row.workerId !== workerIdForCastle(row.originCastleId, row.ordinal)
        ) malformedWorkerIds += 1n;
      } catch {
        malformedWorkerIds += 1n;
      }
      if (!castleWorkerPublicStateIsConsistent(row)) invalidWorkerStates += 1n;
      if (ordinals.has(row.ordinal)) duplicateOrdinals += 1n;
      ordinals.add(row.ordinal);
      const assignment = ctx.db.workerAssignmentV1.workerId.find(row.workerId);
      if (
        (row.status === 'idle' && assignment !== null)
        || (row.status !== 'idle' && assignment === null)
      ) assignmentPublicMismatches += 1n;
      if (row.status === 'idle') idleWorkers += 1n;
      if (row.status === 'outbound') outboundWorkers += 1n;
      if (row.status === 'gathering') gatheringWorkers += 1n;
      if (row.status === 'returning') returningWorkers += 1n;
    }
  }
  for (const row of ctx.db.castleWorkerV1.iter()) {
    if (ctx.db.castle.castleId.find(row.originCastleId) === null) orphanWorkers += 1n;
  }
  let orphanAssignments = 0n;
  let invalidAssignments = 0n;
  let assignmentsMissingOccupation = 0n;
  let assignmentsWithoutSingleSchedule = 0n;
  let occupationSiteMismatches = 0n;
  for (const assignment of ctx.db.workerAssignmentV1.iter()) {
    const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
    if (worker === null) orphanAssignments += 1n;
    else if (!publicWorkerMatchesAssignment(worker, assignment)) assignmentPublicMismatches += 1n;
    try {
      assertAssignmentState(assignment);
      if (!assignmentOwnerIsCanonical(ctx, assignment)) fail('WORKER_OWNER_INTEGRITY');
    } catch {
      invalidAssignments += 1n;
    }
    const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(
      workerNodeKey(assignment.resourceKind, assignment.siteId),
    );
    if (assignment.phase === 'returning') {
      if (occupation !== null) occupationSiteMismatches += 1n;
    } else if (occupation === null || !occupationMatchesAssignment(occupation, assignment)) {
      assignmentsMissingOccupation += 1n;
    }
    const schedules = [...ctx.db.workerAssignmentScheduleV1.byAssignment.filter(assignment.assignmentId)];
    if (schedules.length !== 1 || !schedules.every(schedule => scheduleMatchesAssignment(schedule, assignment))) {
      assignmentsWithoutSingleSchedule += 1n;
    }
  }
  let orphanOccupations = 0n;
  for (const occupation of ctx.db.workerNodeOccupationV1.iter()) {
    const assignment = ctx.db.workerAssignmentV1.workerId.find(occupation.workerId);
    if (assignment === null) orphanOccupations += 1n;
    try {
      if (occupation.nodeKey !== workerNodeKey(occupation.resourceKind, occupation.siteId)) {
        occupationSiteMismatches += 1n;
      }
    } catch {
      occupationSiteMismatches += 1n;
    }
    if (assignment !== null && !occupationMatchesAssignment(occupation, assignment)) occupationSiteMismatches += 1n;
  }
  let orphanSchedules = 0n;
  let invalidSchedules = 0n;
  for (const schedule of ctx.db.workerAssignmentScheduleV1.iter()) {
    const assignment = ctx.db.workerAssignmentV1.assignmentId.find(schedule.assignmentId);
    if (assignment === null) orphanSchedules += 1n;
    else if (!scheduleMatchesAssignment(schedule, assignment)) invalidSchedules += 1n;
  }
  const receiptsPerFid = new Map<bigint, number>();
  let invalidIdempotencyReceipts = 0n;
  for (const receipt of ctx.db.workerCommandIdempotencyV1.iter()) {
    receiptsPerFid.set(receipt.fid, (receiptsPerFid.get(receipt.fid) ?? 0) + 1);
    if (
      !workerReceiptShapeIsValid(receipt)
      || !receiptOwnerIsCanonical(ctx, receipt)
    ) invalidIdempotencyReceipts += 1n;
  }
  const idempotencyOverflowFids = BigInt([...receiptsPerFid.values()]
    .filter(count => count > WORKER_IDEMPOTENCY_RECEIPTS_PER_FID).length);
  const legacy = legacyActiveCounts(ctx);
  const castleIds = castles.map(castle => castle.castleId);
  const expectedWorkerCount = BigInt(castleIds.length * CASTLE_WORKERS_PER_CASTLE);
  const expectedRosterDigest = rosterDigestForCastleIds(castleIds);
  return Object.freeze({
    systemRows: ctx.db.realmWorkerSystemV1.count(),
    mode: system?.mode ?? 'absent',
    systemConfigValid: system !== null && workerSystemRowIsStagedOrActive(
      system,
      ctx.timestamp.microsSinceUnixEpoch,
    ),
    legacyDrainRequired: system?.legacyDrainRequired ?? true,
    expectedCastleCount: BigInt(system?.expectedCastleCount ?? 0),
    expectedWorkerCount: BigInt(system?.expectedWorkerCount ?? 0),
    actualWorkerCount: ctx.db.castleWorkerV1.count(),
    expectedCountsMatch: system !== null
      && BigInt(system.expectedCastleCount) === BigInt(castleIds.length)
      && BigInt(system.expectedWorkerCount) === expectedWorkerCount
      && ctx.db.castleWorkerV1.count() === expectedWorkerCount,
    rosterDigestMatches: system !== null && system.rosterDigest === expectedRosterDigest,
    castlesMissingWorkers,
    castlesWithExtraWorkers,
    duplicateOrdinals,
    malformedWorkerIds,
    invalidWorkerStates,
    idleWorkers,
    outboundWorkers,
    gatheringWorkers,
    returningWorkers,
    assignments: ctx.db.workerAssignmentV1.count(),
    occupations: ctx.db.workerNodeOccupationV1.count(),
    schedules: ctx.db.workerAssignmentScheduleV1.count(),
    orphanWorkers,
    orphanAssignments,
    assignmentsMissingOccupation,
    assignmentsWithoutSingleSchedule,
    orphanOccupations,
    orphanSchedules,
    invalidSchedules,
    assignmentPublicMismatches,
    occupationSiteMismatches,
    invalidAssignments,
    idempotencyReceipts: ctx.db.workerCommandIdempotencyV1.count(),
    invalidIdempotencyReceipts,
    idempotencyOverflowFids,
    legacyExpeditions: legacy.expeditions,
    legacyOccupations: legacy.occupations,
    legacySchedules: legacy.schedules,
    rosterDigest: system?.rosterDigest ?? '',
    rosterDigestExpected: expectedRosterDigest,
  });
}

export function castleWorkerErrorCode(error: unknown): string | undefined {
  if (
    (error instanceof CastleWorkerAuthorityError || error instanceof CastleWorkerPolicyError)
    && BOUNDED_WORKER_ERROR_CODE.test(error.code)
  ) return error.code;
  return undefined;
}
