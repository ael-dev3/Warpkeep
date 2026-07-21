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
  workerResourcePolicy,
  assertCastleWorkerId,
  assertWorkerCommandKey,
  canonicalWorkerRouteSteps,
} from './castleWorkerPolicy';
import {
  assertCastleWorkerRoster,
  workerRosterDigestInput,
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
type ResourceAccountRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['resourceAccountV1']['fid']['find']>>;

export const WORKER_SCHEDULE_STAGE_ARRIVAL = 'arrival';
export const WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
export const WORKER_SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';
const WORKER_SYSTEM_REALM_ID = CANONICAL_REALM.realmId;
const WORKER_TIMELINE_MAX = 0xffff_ffff;

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
  const row = ctx.db.realmWorkerSystemV1.realmId.find(WORKER_SYSTEM_REALM_ID);
  if (row === null || !workerSystemRowIsStagedOrActive(row)) fail('WORKER_SYSTEM_NOT_READY');
  return row;
}

function workerSystemActive(ctx: WarpkeepReducerContext) {
  const row = systemRow(ctx);
  if (row.mode !== 'active') fail('WORKER_SYSTEM_STAGED');
  if (row.legacyDrainRequired) fail('WORKER_LEGACY_DRAIN_REQUIRED');
  const castleIds = [...ctx.db.castle.iter()].map(castle => castle.castleId);
  const expectedWorkerCount = BigInt(castleIds.length * CASTLE_WORKERS_PER_CASTLE);
  if (
    BigInt(row.expectedCastleCount) !== BigInt(castleIds.length)
    || BigInt(row.expectedWorkerCount) !== expectedWorkerCount
    || ctx.db.castleWorkerV1.count() !== expectedWorkerCount
    || row.rosterDigest !== rosterDigestForCastleIds(castleIds)
  ) fail('WORKER_ROSTER_NOT_READY');
  for (const castleId of castleIds) assertCastleWorkerRoster(ctx, castleId);
  for (const worker of ctx.db.castleWorkerV1.iter()) {
    if (ctx.db.castle.castleId.find(worker.originCastleId) === null) {
      fail('WORKER_ROSTER_ORPHAN');
    }
  }
  const legacy = legacyActiveCounts(ctx);
  if (legacy.expeditions !== 0n || legacy.occupations !== 0n || legacy.schedules !== 0n) {
    fail('WORKER_LEGACY_DRAIN_REQUIRED');
  }
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
  return worker.workerId === assignment.workerId
    && worker.originCastleId === assignment.originCastleId
    && worker.status === assignment.phase
    && worker.assignmentId === assignment.assignmentId
    && worker.resourceKind === assignment.resourceKind
    && worker.siteId === assignment.siteId
    && worker.startedAtMicros === assignment.startedAtMicros
    && worker.arrivesAtMicros === assignment.arrivesAtMicros
    && worker.gatheringEndsAtMicros === assignment.gatheringEndsAtMicros
    && worker.returnsAtMicros === assignment.returnsAtMicros
    && worker.routeSteps === assignment.routeSteps
    && worker.timelineRevision === assignment.timelineRevision;
}

function assertAssignmentState(assignment: AssignmentRow): void {
  assignmentPhase(assignment.phase);
  if (
    assignment.workerId.length === 0
    || assignment.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || !workerAssignmentStateIsConsistent(assignment)
    || assignment.returnStartProgressBasisPoints > 10_000
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
  for (const assignment of ctx.db.workerAssignmentV1.iter()) {
    if (assignment.fid !== fid) continue;
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
  const resource = assertGenesisResourceForFid(ctx, fid);
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
  const workers = [...assertCastleWorkerRoster(ctx, resource.castle.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal)
    .map(worker => {
      const assignment = worker.assignmentId === undefined
        ? undefined
        : ctx.db.workerAssignmentV1.assignmentId.find(worker.assignmentId);
      if (assignment === undefined || assignment === null) {
        if (worker.assignmentId !== undefined) fail('WORKER_ASSIGNMENT_MISSING');
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
    const assignment = ctx.db.workerAssignmentV1.assignmentId.find(prior.assignmentId);
    if (assignment === null) fail('WORKER_IDEMPOTENCY_STALE');
    return Object.freeze({ assignment, idempotent: true });
  }
  workerSystemActive(ctx);
  settleAllWorkerAssignmentsForFid(ctx, input.fid);
  const roster = assertCastleWorkerRoster(ctx, input.castle.castleId);
  const worker = ctx.db.castleWorkerV1.workerId.find(input.workerId);
  if (worker === null || worker.originCastleId !== input.castle.castleId || !roster.some(row => row.workerId === worker.workerId)) fail('WORKER_NOT_OWNED');
  assertCastleWorkerId(worker.workerId);
  if (worker.status !== 'idle' || worker.assignmentId !== undefined) fail('WORKER_NOT_IDLE');
  const site = canonicalSiteFor(ctx, input.resourceKind, input.siteId);
  if (legacyOccupationAt(ctx, input.resourceKind, input.siteId)) fail('WORKER_LEGACY_SITE_OCCUPIED');
  const nodeKey = `${input.resourceKind}:${input.siteId}`;
  if (ctx.db.workerNodeOccupationV1.nodeKey.find(nodeKey) !== null) fail('WORKER_SITE_OCCUPIED');
  const routeSteps = canonicalWorkerRouteSteps(input.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('WORKER_ROUTE_INVALID');
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  assertDispatchReservations(ctx, input.fid, resource.account, input.resourceKind);
  const timeline = planCastleWorkerTimeline(ctx.timestamp.microsSinceUnixEpoch, routeSteps);
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
    timelineRevision: 0,
    policyVersion: CASTLE_WORKER_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'outbound',
    assignmentId: assignment.assignmentId,
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    returnStartedAtMicros: undefined,
    returnsAtMicros: assignment.returnsAtMicros,
    routeSteps: assignment.routeSteps,
    returnStartProgressBasisPoints: undefined,
    updatedAt: ctx.timestamp,
  });
  ctx.db.workerNodeOccupationV1.insert({
    nodeKey,
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    workerId: worker.workerId,
    workerOrdinal: worker.ordinal,
    originCastleId: input.castle.castleId,
    assignmentId: assignment.assignmentId,
    phase: 'outbound',
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    timelineRevision: assignment.timelineRevision,
  });
  insertSchedule(ctx, assignment, WORKER_SCHEDULE_STAGE_ARRIVAL, assignment.arrivesAtMicros);
  insertSchedule(ctx, assignment, WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY, assignment.gatheringEndsAtMicros);
  insertSchedule(ctx, assignment, WORKER_SCHEDULE_STAGE_RETURN_COMPLETE, assignment.returnsAtMicros);
  ctx.db.workerCommandIdempotencyV1.insert({
    requestKey,
    fid: input.fid,
    workerId: worker.workerId,
    commandKind: 'dispatch',
    resourceKind: input.resourceKind,
    siteId: input.siteId,
    assignmentId: assignment.assignmentId,
    resultRevision: worker.revision,
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
  const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(`${assignment.resourceKind}:${assignment.siteId}`);
  if (occupation !== null) {
    if (occupation.assignmentId !== assignment.assignmentId || occupation.workerId !== assignment.workerId || occupation.timelineRevision !== assignment.timelineRevision) fail('WORKER_OCCUPATION_INTEGRITY');
    ctx.db.workerNodeOccupationV1.nodeKey.delete(occupation.nodeKey);
  }
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
  ctx.db.workerAssignmentV1.assignmentId.update(returning);
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'returning',
    returnStartedAtMicros: now,
    returnsAtMicros: returningAtMicros,
    returnStartProgressBasisPoints: progress,
    timelineRevision,
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
    updatedAt: ctx.timestamp,
  });
  insertSchedule(ctx, returning, WORKER_SCHEDULE_STAGE_RETURN_COMPLETE, returningAtMicros);
  return returning;
}

function completeWorkerReturn(ctx: WarpkeepReducerContext, assignment: AssignmentRow, now: bigint): void {
  if (now < assignment.returnsAtMicros) return;
  if (assignment.phase !== 'returning') fail('WORKER_RETURN_STATE');
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  ctx.db.workerAssignmentV1.assignmentId.delete(assignment.assignmentId);
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
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
    timelineRevision: safeNextU32(worker.timelineRevision, 'WORKER_TIMELINE_REVISION'),
    revision: safeNextU64(worker.revision, 'WORKER_REVISION'),
    updatedAt: ctx.timestamp,
  });
}

function transitionWorkerArrival(ctx: WarpkeepReducerContext, assignment: AssignmentRow, now: bigint): AssignmentRow {
  if (now < assignment.arrivesAtMicros) return assignment;
  if (assignment.phase !== 'outbound') return assignment;
  const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(`${assignment.resourceKind}:${assignment.siteId}`);
  if (occupation === null || occupation.assignmentId !== assignment.assignmentId || occupation.timelineRevision !== assignment.timelineRevision) fail('WORKER_OCCUPATION_MISSING');
  const gathering = { ...assignment, phase: 'gathering', updatedAt: ctx.timestamp };
  ctx.db.workerAssignmentV1.assignmentId.update(gathering);
  ctx.db.workerNodeOccupationV1.nodeKey.update({ ...occupation, phase: 'gathering' });
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  if (worker === null || !publicWorkerMatchesAssignment(worker, assignment)) fail('WORKER_PUBLIC_PRIVATE_MISMATCH');
  ctx.db.castleWorkerV1.workerId.update({ ...worker, status: 'gathering', updatedAt: ctx.timestamp });
  return gathering;
}

function settleAndBeginReturnAt(
  ctx: WarpkeepReducerContext,
  assignment: AssignmentRow,
  now: bigint,
  progress: number,
): AssignmentRow {
  settleAllWorkerAssignmentsForFid(ctx, assignment.fid, now);
  const fresh = ctx.db.workerAssignmentV1.assignmentId.find(assignment.assignmentId);
  if (fresh === null) fail('WORKER_ASSIGNMENT_MISSING');
  return beginWorkerReturn(ctx, fresh, progress, now);
}

export function runCastleWorkerSchedule(ctx: WarpkeepReducerContext, schedule: ScheduleRow): void {
  const assignment = ctx.db.workerAssignmentV1.assignmentId.find(schedule.assignmentId);
  if (assignment === null || assignment.workerId !== schedule.workerId || assignment.timelineRevision !== schedule.timelineRevision) return;
  assertAssignmentState(assignment);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (schedule.stage === WORKER_SCHEDULE_STAGE_ARRIVAL) {
    transitionWorkerArrival(ctx, assignment, now);
    return;
  }
  if (schedule.stage === WORKER_SCHEDULE_STAGE_GATHERING_EXPIRY) {
    const gathering = transitionWorkerArrival(ctx, assignment, now);
    if (now < gathering.gatheringEndsAtMicros || gathering.phase === 'returning') return;
    settleAndBeginReturnAt(ctx, gathering, gathering.gatheringEndsAtMicros, 10_000);
    return;
  }
  if (schedule.stage !== WORKER_SCHEDULE_STAGE_RETURN_COMPLETE) return;
  let current = assignment;
  if (current.phase === 'outbound' && now >= current.arrivesAtMicros) current = transitionWorkerArrival(ctx, current, now);
  if ((current.phase === 'outbound' || current.phase === 'gathering') && now >= current.gatheringEndsAtMicros) {
    current = settleAndBeginReturnAt(ctx, current, current.gatheringEndsAtMicros, 10_000);
  }
  completeWorkerReturn(ctx, current, now);
}

export function recallCastleWorker(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; castle: CastleRow; workerId: string; idempotencyKey: string }>,
): void {
  const requestKey = assignmentRequestKey(input.fid, input.idempotencyKey);
  const prior = ctx.db.workerCommandIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.commandKind !== 'recall' || prior.workerId !== input.workerId) fail('WORKER_IDEMPOTENCY_CONFLICT');
    return;
  }
  workerSystemActive(ctx);
  settleAllWorkerAssignmentsForFid(ctx, input.fid);
  const worker = ctx.db.castleWorkerV1.workerId.find(input.workerId);
  if (worker === null || worker.originCastleId !== input.castle.castleId) fail('WORKER_NOT_OWNED');
  assertCastleWorkerRoster(ctx, input.castle.castleId);
  if (worker.assignmentId === undefined) {
    ctx.db.workerCommandIdempotencyV1.insert({ requestKey, fid: input.fid, workerId: worker.workerId, commandKind: 'recall', resourceKind: undefined, siteId: undefined, assignmentId: undefined, resultRevision: worker.revision, createdAt: ctx.timestamp });
    return;
  }
  const assignment = ctx.db.workerAssignmentV1.assignmentId.find(worker.assignmentId);
  if (assignment === null || assignment.fid !== input.fid) fail('WORKER_ASSIGNMENT_MISSING');
  assertAssignmentState(assignment);
  if (assignment.phase === 'outbound') {
    beginWorkerReturn(ctx, assignment, progressBasisPoints(assignment, ctx.timestamp.microsSinceUnixEpoch), ctx.timestamp.microsSinceUnixEpoch);
  } else if (assignment.phase === 'gathering') {
    beginWorkerReturn(ctx, assignment, 10_000, ctx.timestamp.microsSinceUnixEpoch);
  }
  ctx.db.workerCommandIdempotencyV1.insert({ requestKey, fid: input.fid, workerId: worker.workerId, commandKind: 'recall', resourceKind: assignment.resourceKind, siteId: assignment.siteId, assignmentId: assignment.assignmentId, resultRevision: worker.revision, createdAt: ctx.timestamp });
}

export function recallAllCastleWorkers(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; castle: CastleRow; idempotencyKey: string }>,
): void {
  const requestKey = assignmentRequestKey(input.fid, input.idempotencyKey);
  const prior = ctx.db.workerCommandIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.commandKind !== 'recall-all' || prior.workerId !== undefined) fail('WORKER_IDEMPOTENCY_CONFLICT');
    return;
  }
  workerSystemActive(ctx);
  const roster = assertCastleWorkerRoster(ctx, input.castle.castleId);
  settleAllWorkerAssignmentsForFid(ctx, input.fid);
  const now = ctx.timestamp.microsSinceUnixEpoch;
  let lastAssignmentId: string | undefined;
  for (const worker of [...roster].sort((left, right) => left.ordinal - right.ordinal)) {
    const fresh = ctx.db.castleWorkerV1.workerId.find(worker.workerId);
    if (fresh === null || fresh.originCastleId !== input.castle.castleId) fail('WORKER_ROSTER_INTEGRITY');
    if (fresh.assignmentId === undefined) continue;
    const assignment = ctx.db.workerAssignmentV1.assignmentId.find(fresh.assignmentId);
    if (assignment === null || assignment.fid !== input.fid || !publicWorkerMatchesAssignment(fresh, assignment)) fail('WORKER_ASSIGNMENT_INTEGRITY');
    if (assignment.phase === 'outbound') {
      lastAssignmentId = beginWorkerReturn(ctx, assignment, progressBasisPoints(assignment, now), now).assignmentId;
    } else if (assignment.phase === 'gathering') {
      lastAssignmentId = beginWorkerReturn(ctx, assignment, 10_000, now).assignmentId;
    }
  }
  ctx.db.workerCommandIdempotencyV1.insert({ requestKey, fid: input.fid, workerId: undefined, commandKind: 'recall-all', resourceKind: undefined, siteId: undefined, assignmentId: lastAssignmentId, resultRevision: 0n, createdAt: ctx.timestamp });
}

export type WorkerGraphAggregate = Readonly<{
  systemRows: bigint;
  mode: string;
  expectedCastleCount: bigint;
  expectedWorkerCount: bigint;
  actualWorkerCount: bigint;
  castlesMissingWorkers: bigint;
  castlesWithExtraWorkers: bigint;
  duplicateOrdinals: bigint;
  malformedWorkerIds: bigint;
  idleWorkers: bigint;
  outboundWorkers: bigint;
  gatheringWorkers: bigint;
  returningWorkers: bigint;
  assignments: bigint;
  occupations: bigint;
  schedules: bigint;
  orphanWorkers: bigint;
  orphanAssignments: bigint;
  orphanOccupations: bigint;
  assignmentPublicMismatches: bigint;
  occupationSiteMismatches: bigint;
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
      try { assertCastleWorkerId(row.workerId); } catch { malformedWorkerIds += 1n; }
      if (ordinals.has(row.ordinal)) duplicateOrdinals += 1n;
      ordinals.add(row.ordinal);
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
  let assignmentPublicMismatches = 0n;
  for (const assignment of ctx.db.workerAssignmentV1.iter()) {
    const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
    if (worker === null) orphanAssignments += 1n;
    else if (!publicWorkerMatchesAssignment(worker, assignment)) assignmentPublicMismatches += 1n;
  }
  let orphanOccupations = 0n;
  let occupationSiteMismatches = 0n;
  for (const occupation of ctx.db.workerNodeOccupationV1.iter()) {
    const assignment = ctx.db.workerAssignmentV1.assignmentId.find(occupation.assignmentId);
    if (assignment === null) orphanOccupations += 1n;
    if (occupation.nodeKey !== `${occupation.resourceKind}:${occupation.siteId}`) occupationSiteMismatches += 1n;
    if (assignment !== null && (assignment.phase === 'returning' || assignment.siteId !== occupation.siteId || assignment.resourceKind !== occupation.resourceKind)) occupationSiteMismatches += 1n;
  }
  const legacy = legacyActiveCounts(ctx);
  const castleIds = castles.map(castle => castle.castleId);
  return Object.freeze({
    systemRows: ctx.db.realmWorkerSystemV1.count(),
    mode: system?.mode ?? 'absent',
    expectedCastleCount: BigInt(system?.expectedCastleCount ?? 0),
    expectedWorkerCount: BigInt(system?.expectedWorkerCount ?? 0),
    actualWorkerCount: ctx.db.castleWorkerV1.count(),
    castlesMissingWorkers,
    castlesWithExtraWorkers,
    duplicateOrdinals,
    malformedWorkerIds,
    idleWorkers,
    outboundWorkers,
    gatheringWorkers,
    returningWorkers,
    assignments: ctx.db.workerAssignmentV1.count(),
    occupations: ctx.db.workerNodeOccupationV1.count(),
    schedules: ctx.db.workerAssignmentScheduleV1.count(),
    orphanWorkers,
    orphanAssignments,
    orphanOccupations,
    assignmentPublicMismatches,
    occupationSiteMismatches,
    legacyExpeditions: legacy.expeditions,
    legacyOccupations: legacy.occupations,
    legacySchedules: legacy.schedules,
    rosterDigest: system?.rosterDigest ?? '',
    rosterDigestExpected: rosterDigestForCastleIds(castleIds),
  });
}

export function castleWorkerErrorCode(error: unknown): string | undefined {
  if (error instanceof CastleWorkerAuthorityError || error instanceof CastleWorkerPolicyError) return error.code;
  return undefined;
}
