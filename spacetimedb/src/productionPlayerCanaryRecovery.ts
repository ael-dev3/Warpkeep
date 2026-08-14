import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import {
  workerCommandReceiptShapeIsValid,
  recallWorkerReceipt,
  workerScheduleMatchesAssignment,
} from './castleWorkerCommandPolicy';
import {
  CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
  CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
  CASTLE_WORKERS_PER_CASTLE,
  PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
  clampProductionPlayerCanaryTimeline,
  planProductionPlayerCanaryTimelineBeforeCutoff,
  productionPlayerCanaryReplayTimelineIsValid,
  workerAssignmentStateIsConsistent,
  workerIdForCastle,
  workerNodeKey,
} from './castleWorkerPolicy';
import {
  greaterRealmWorkerRouteStepsWithinBoundV1,
} from './greaterRealmWorkerAuthority';
import {
  greaterRealmWorkerCapacityDigestV1,
  greaterRealmWorkerDispatchFingerprintV2,
  parseGreaterRealmWorkerDispatchReceiptKindV2,
} from './greaterRealmWorkerPolicy';
import { resolveGreaterRealmResourceLocationV1 } from './greaterRealmResourceLocationAuthority';
import { GREATER_REALM_MAX_ROUTE_DEPTH } from './greaterRealmV17Policy';
import {
  assertCastleWorkerRoster,
  castleWorkerPublicStateIsConsistent,
} from './castleWorkerRoster';
import {
  dispatchGreaterRealmCastleWorkerV2,
  recallCastleWorkerForExactCanaryAssignment,
  WORKER_IDEMPOTENCY_RECEIPTS_PER_FID,
} from './castleWorkerAuthority';
import {
  requireProductionPlayerCanaryApprovalRegistrationV1,
  requireStoredProductionPlayerCanaryApprovalRegistrationV2,
  productionPlayerCanaryApprovalErrorCode,
} from './productionPlayerCanaryApproval';
import {
  requireProductionPlayerCanaryBaselineRow,
  requireStoredProductionPlayerCanaryBaselineV2,
  assertProductionPlayerCanaryStoredBaselineCurrentPristineV2,
  productionPlayerCanaryBaselineErrorCode,
} from './productionPlayerCanaryBaseline';
import {
  inspectProductionPlayerCanaryRoutePlan,
} from './productionPlayerCanaryBaseline';
import {
  type ProductionPlayerCanaryCommandAuthorityV2,
  type ProductionPlayerCanaryRoutePlanV1,
  planProductionPlayerCanaryRouteSetV1,
  productionPlayerCanaryCommandAuthorityV2,
  productionPlayerCanaryRoutePolicyErrorCode,
} from './productionPlayerCanaryRoutePolicy';
import {
  assertProductionPlayerCanaryDispatchTupleV2,
  encodeProductionPlayerCanaryRecoverySnapshotV2,
  parseProductionPlayerCanaryRecoverySnapshotV2,
  planProductionPlayerCanaryRecoverySweepV2,
  planProductionPlayerCanaryContainmentReturnV2,
  productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2,
  productionPlayerCanaryDispatchCommandOrdinalV2,
  productionPlayerCanaryDispatchDispositionV2,
  productionPlayerCanaryRecoveryFenceReceiptMatchesV2,
  productionPlayerCanaryRecoverySnapshotMaximumRevisionV2,
  productionPlayerCanaryRecoverySnapshotTransitionIsValidV2,
  productionPlayerCanaryLaterLineageIsExactV2,
  productionPlayerCanaryLaterWorkerRevisionIsExactV2,
  productionPlayerCanaryOriginalWorkerRevisionIsExactV2,
  productionPlayerCanaryRecoveryDisposition,
  productionPlayerCanaryRecoveryPolicyErrorCode,
  productionPlayerCanaryStructuralEvidenceCandidate,
  type ProductionPlayerCanaryRecoverySweepOrdinalStateV2,
  type ProductionPlayerCanaryRecoverySnapshotRouteV2,
  type ProductionPlayerCanaryRecoveryDisposition,
} from './productionPlayerCanaryRecoveryPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type WorkerReceipt = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['workerCommandIdempotencyV1']['requestKey']['find']
>>;
type CastleRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['castle']['castleId']['find']
>>;
type CanaryBaselineRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['productionPlayerCanaryBaselineV1']['fid']['find']
>>;
type CanaryApprovalRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['productionPlayerCanaryApprovalRegistrationV1']['fid']['find']
>>;
type WorkerRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['castleWorkerV1']['workerId']['find']
>>;
type AssignmentRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['workerAssignmentV1']['workerId']['find']
>>;
type OccupationRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['workerNodeOccupationV1']['nodeKey']['find']
>>;

export const PRODUCTION_PLAYER_CANARY_RECOVERY_STATUS_PROFILE =
  'warpkeep-production-player-canary-recovery-status-v1';

export type ProductionPlayerCanaryRecoveryStatusInput = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
}>;

export type ProductionPlayerCanaryRecoveryStatus = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_RECOVERY_STATUS_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  commandSetCommitment: string;
  approvalRegistrationCommitment: string;
  notAfterMicros: bigint;
  observedAtMicros: bigint;
  dispatchReceiptCount: number;
  correlatedRecallReceiptCount: number;
  noOpRecallReceiptCount: number;
  unexpectedReceiptCount: number;
  idleWorkerCount: number;
  outboundWorkerCount: number;
  gatheringWorkerCount: number;
  returningWorkerCount: number;
  assignmentCount: bigint;
  occupationCount: bigint;
  scheduleCount: bigint;
  terminalSafe: boolean;
  structuralEvidenceCandidate: boolean;
  disposition: ProductionPlayerCanaryRecoveryDisposition;
}>;

const SHA256 = /^[0-9a-f]{64}$/u;
const RESERVED_COMMAND_V1_PREFIX = 'pc1-';
const RESERVED_COMMAND_V2_PREFIX = 'pc2-';

export class ProductionPlayerCanaryRecoveryError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryRecoveryError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryRecoveryError(code);
}

function validInput(input: ProductionPlayerCanaryRecoveryStatusInput): void {
  if (
    input.fid < 1n
    || input.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || !SHA256.test(input.reviewedAdmissionPlanDigest)
    || !SHA256.test(input.evidenceNonce)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_INPUT_INVALID');
}

function dispatchReceiptMatches(
  ctx: WarpkeepReducerContext,
  receipt: WorkerReceipt,
  fid: bigint,
  route: Readonly<{
    workerId: string;
    resourceKind: string;
    locationId: string;
    atlasRevision: bigint;
    nodeCount: number;
    routeSteps: number;
  }>,
  castleId: bigint,
  atlasId: string,
  approvedAtMicros: bigint,
  notAfterMicros: bigint,
): boolean {
  if (
    receipt.fid !== fid
    || !workerCommandReceiptShapeIsValid(receipt)
    || receipt.workerId !== route.workerId
    || receipt.resourceKind !== route.resourceKind
    || receipt.assignmentId === undefined
    || receipt.resultRevision !== 1n
    || typeof receipt.siteId !== 'string'
    || !receipt.commandKind.startsWith('dispatch-v2:')
    || receipt.createdAt.microsSinceUnixEpoch < approvedAtMicros
    || receipt.createdAt.microsSinceUnixEpoch >= notAfterMicros
  ) return false;
  const match = new RegExp(`^${route.locationId}:([1-9]|[12][0-9]|3[0-2])$`, 'u')
    .exec(receipt.siteId);
  if (!match) return false;
  const node = Number(match[1]);
  if (!Number.isSafeInteger(node) || node < 1 || node > route.nodeCount) return false;
  try {
    planProductionPlayerCanaryTimelineBeforeCutoff(
      receipt.createdAt.microsSinceUnixEpoch,
      route.routeSteps,
      notAfterMicros,
    );
    const metadata = parseGreaterRealmWorkerDispatchReceiptKindV2(receipt.commandKind);
    const location = resolveGreaterRealmResourceLocationV1(
      ctx,
      atlasId,
      route.locationId,
    );
    return metadata.expectedRevision === route.atlasRevision
      && metadata.nodeCount === route.nodeCount
      && location.resourceKind === route.resourceKind
      && location.nodeCount === route.nodeCount
      && metadata.capacityDigest === greaterRealmWorkerCapacityDigestV1({
        atlasId,
        atlasRevision: route.atlasRevision,
        locationId: route.locationId,
        cellKey: location.cellKey,
        regionId: location.regionId,
        componentKey: location.componentKey,
        resourceKind: location.resourceKind,
        tier: 1,
        policyVersion: location.policyVersion,
        nodeCount: location.nodeCount,
      })
      && metadata.fingerprint === greaterRealmWorkerDispatchFingerprintV2({
        fid,
        castleId,
        workerId: route.workerId,
        resourceKind: route.resourceKind,
        locationId: route.locationId,
        expectedRevision: route.atlasRevision,
      });
  } catch {
    return false;
  }
}

function exactCorrelatedRecallReceiptMatches(
  receipt: WorkerReceipt,
  dispatch: WorkerReceipt,
  fid: bigint,
): boolean {
  return receipt.fid === fid
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind === 'recall'
    && receipt.workerId === dispatch.workerId
    && receipt.resourceKind === dispatch.resourceKind
    && receipt.siteId === dispatch.siteId
    && receipt.assignmentId === dispatch.assignmentId
    && receipt.createdAt.microsSinceUnixEpoch
      >= dispatch.createdAt.microsSinceUnixEpoch
    && (
      receipt.resultRevision === dispatch.resultRevision + 1n
      || receipt.resultRevision === dispatch.resultRevision + 2n
    );
}

function correlatedRecallReceiptMatches(
  receipt: WorkerReceipt,
  dispatch: WorkerReceipt,
  fid: bigint,
  notAfterMicros: bigint,
): boolean {
  return exactCorrelatedRecallReceiptMatches(receipt, dispatch, fid)
    && receipt.createdAt.microsSinceUnixEpoch < notAfterMicros;
}

type StoredCanaryAuthorityV2 = Readonly<{
  baseline: CanaryBaselineRow;
  registration: CanaryApprovalRow;
  routePlan: ProductionPlayerCanaryRoutePlanV1;
  commandAuthority: ProductionPlayerCanaryCommandAuthorityV2;
}>;

function storedCanaryAuthorityV2(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): StoredCanaryAuthorityV2 | null {
  const baseline = ctx.db.productionPlayerCanaryBaselineV1.fid.find(fid);
  const storedRegistration = ctx.db.productionPlayerCanaryApprovalRegistrationV1.fid.find(
    fid,
  );
  if (baseline === null && storedRegistration === null) return null;
  const registration = requireStoredProductionPlayerCanaryApprovalRegistrationV2(
    ctx,
    fid,
  );
  if (registration === null) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  }
  if (
    baseline === null
    || registration === null
    || baseline.fid !== fid
    || registration.fid !== fid
    || baseline.challengeDigest !== registration.challengeDigest
    || baseline.reviewedAdmissionPlanDigest
      !== registration.reviewedAdmissionPlanDigest
    || baseline.baselineCommitment !== registration.serverBaselineCommitment
    || baseline.routeSetCommitment !== registration.routeSetCommitment
    || baseline.castleId < 1n
    || baseline.atlasId.length < 1
    || baseline.atlasRevision < 1n
    || registration.approvedAtMicros < 1n
    || registration.notAfterMicros <= registration.approvedAtMicros
    || registration.registeredAt.microsSinceUnixEpoch
      < registration.approvedAtMicros
    || registration.registeredAt.microsSinceUnixEpoch
      >= registration.notAfterMicros
    || [
      baseline.challengeDigest,
      baseline.reviewedAdmissionPlanDigest,
      baseline.baselineCommitment,
      baseline.routeSetCommitment,
      registration.commandSetCommitment,
    ].some(value => typeof value !== 'string' || !SHA256.test(value))
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  const commandAuthority = productionPlayerCanaryCommandAuthorityV2({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
  });
  if (
    registration.commandKeyPolicyVersion
      !== commandAuthority.commandKeyPolicyVersion
    || registration.commandSetCommitment
      !== commandAuthority.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');

  // Route selection is nonce-independent. Re-running it with the immutable
  // challenge as private framing material reconstructs the exact four tuples
  // without retaining or accepting a browser nonce. Its synthetic route-set
  // commitment is intentionally ignored; the stored approval already binds
  // the original nonce-framed commitment.
  const routePlan = planProductionPlayerCanaryRouteSetV1(ctx, {
    fid,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    evidenceNonce: baseline.challengeDigest,
    challengeDigest: baseline.challengeDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    castleId: baseline.castleId,
    atlasId: baseline.atlasId,
    atlasRevision: baseline.atlasRevision,
  });
  return Object.freeze({ baseline, registration, routePlan, commandAuthority });
}

function commandRequestKey(fid: bigint, key: string): string {
  return `${fid.toString()}:${key}`;
}

function assertNewProductionPlayerCanaryDispatchTargetPristineV2(
  ctx: WarpkeepReducerContext,
  route: ProductionPlayerCanaryRoutePlanV1['routes'][number],
  castleId: bigint,
): void {
  const worker = ctx.db.castleWorkerV1.workerId.find(route.workerId);
  if (
    worker === null
    || worker.originCastleId !== castleId
    || worker.ordinal < 1
    || worker.ordinal > CASTLE_WORKERS_PER_CASTLE
    || worker.workerId !== workerIdForCastle(castleId, worker.ordinal)
    || worker.status !== 'idle'
    || worker.resourceKind !== undefined
    || worker.siteId !== undefined
    || worker.startedAtMicros !== undefined
    || worker.arrivesAtMicros !== undefined
    || worker.gatheringEndsAtMicros !== undefined
    || worker.returnStartedAtMicros !== undefined
    || worker.returnsAtMicros !== undefined
    || worker.routeSteps !== undefined
    || worker.returnStartProgressBasisPoints !== undefined
    || worker.timelineRevision !== 0
    || worker.revision !== 0n
    || ctx.db.workerAssignmentV1.workerId.find(route.workerId) !== null
    || boundedRowsOrUndefined(
      ctx.db.workerNodeOccupationV1.byWorker.filter(route.workerId),
      0,
    ) === undefined
    || boundedRowsOrUndefined(
      ctx.db.workerAssignmentScheduleV1.byWorker.filter(route.workerId),
      0,
    ) === undefined
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TARGET_NOT_PRISTINE');
}

function recoveryFenceReceiptMatches(
  receipt: WorkerReceipt,
  fid: bigint,
  commandAuthority: ProductionPlayerCanaryCommandAuthorityV2,
  approvedAtMicros: bigint,
  observedAtMicros: bigint,
  maximumResultRevision: bigint,
  snapshotPayload: string,
): boolean {
  return productionPlayerCanaryRecoveryFenceReceiptMatchesV2(receipt, {
    fid,
    requestKey: commandRequestKey(
      fid,
      commandAuthority.recoveryFenceIdempotencyKey,
    ),
    approvedAtMicros,
    observedAtMicros,
    maximumResultRevision,
    snapshotPayload,
  });
}

function recoverySnapshotStatus(
  status: WorkerRow['status'],
): ProductionPlayerCanaryRecoverySnapshotRouteV2['status'] {
  if (status === 'idle') return 'i';
  if (status === 'outbound') return 'o';
  if (status === 'gathering') return 'g';
  if (status === 'returning') return 'r';
  fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
}

function dispatchPositionFenceReceiptMatches(
  receipt: WorkerReceipt,
  fid: bigint,
  dispatchIdempotencyKey: string,
  workerId: string,
  approvedAtMicros: bigint,
  observedAtMicros: bigint,
  maximumResultRevision: bigint,
): boolean {
  return workerCommandReceiptShapeIsValid(receipt)
    && productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(receipt, {
      fid,
      requestKey: commandRequestKey(fid, dispatchIdempotencyKey),
      workerId,
      approvedAtMicros,
      observedAtMicros,
      maximumResultRevision,
    });
}

function publicWorkerMatchesAssignment(
  worker: WorkerRow,
  assignment: AssignmentRow,
): boolean {
  const expectedReturnProgress = assignment.phase === 'returning'
    ? assignment.returnStartProgressBasisPoints
    : undefined;
  return worker.workerId === assignment.workerId
    && worker.ordinal >= 1
    && worker.ordinal <= CASTLE_WORKERS_PER_CASTLE
    && worker.workerId === workerIdForCastle(
      assignment.originCastleId,
      worker.ordinal,
    )
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

function occupationMatchesLaterAssignment(
  occupation: OccupationRow,
  assignment: AssignmentRow,
): boolean {
  return occupation.nodeKey === workerNodeKey(
    assignment.resourceKind,
    assignment.siteId,
  )
    && occupation.resourceKind === assignment.resourceKind
    && occupation.siteId === assignment.siteId
    && occupation.workerId === assignment.workerId
    && occupation.workerOrdinal >= 1
    && occupation.workerOrdinal <= CASTLE_WORKERS_PER_CASTLE
    && assignment.workerId === workerIdForCastle(
      assignment.originCastleId,
      occupation.workerOrdinal,
    )
    && occupation.originCastleId === assignment.originCastleId
    && assignment.phase !== 'returning'
    && occupation.phase === assignment.phase
    && occupation.startedAtMicros === assignment.startedAtMicros
    && occupation.arrivesAtMicros === assignment.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === assignment.gatheringEndsAtMicros
    && occupation.timelineRevision === assignment.timelineRevision;
}

function nonCanaryCommandReceipt(receipt: WorkerReceipt, fid: bigint): boolean {
  const prefix = `${fid.toString()}:`;
  if (!receipt.requestKey.startsWith(prefix)) return false;
  const idempotencyKey = receipt.requestKey.slice(prefix.length);
  return !idempotencyKey.startsWith(RESERVED_COMMAND_V1_PREFIX)
    && !idempotencyKey.startsWith(RESERVED_COMMAND_V2_PREFIX);
}

function resolveGenericDispatchRouteV2(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    castleId: bigint;
    siteId: string;
  }>,
  authority: StoredCanaryAuthorityV2,
) {
  const separator = input.siteId.lastIndexOf(':');
  if (separator <= 0 || separator === input.siteId.length - 1) return null;
  const locationId = input.siteId.slice(0, separator);
  const capacityOrdinal = Number(input.siteId.slice(separator + 1));
  try {
    const location = resolveGreaterRealmResourceLocationV1(
      ctx,
      authority.baseline.atlasId,
      locationId,
    );
    const castle = ctx.db.castle.castleId.find(authority.baseline.castleId);
    const origin = castle === null
      ? null
      : ctx.db.greaterRealmCellV1.cellKey.find(castle.tileKey);
    const component = origin?.componentKey === undefined
      ? null
      : ctx.db.greaterRealmNavigationComponentV1.componentKey.find(
        origin.componentKey,
      );
    if (
      castle === null
      || origin === null
      || component === null
      || castle.ownerFid !== input.fid
      || castle.castleId !== input.castleId
      || origin.atlasId !== authority.baseline.atlasId
      || location.componentKey !== origin.componentKey
    ) return null;
    const routeSteps = greaterRealmWorkerRouteStepsWithinBoundV1(
      ctx,
      authority.baseline.atlasId,
      component.componentKey,
      component.rootCellKey,
      origin,
      location.destination,
      GREATER_REALM_MAX_ROUTE_DEPTH * 2,
    );
    if (routeSteps === undefined) return null;
    return Object.freeze({
      locationId,
      capacityOrdinal,
      location,
      routeSteps,
    });
  } catch {
    return null;
  }
}

function terminalWorkerJourneyChronologyIsValidV2(
  dispatch: WorkerReceipt,
  recall: WorkerReceipt | undefined,
  routeSteps: number,
  gatheringDurationMicros: bigint,
  observedAtMicros: bigint,
): boolean {
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) return false;
  const maximumU64 = (1n << 64n) - 1n;
  const startedAtMicros = dispatch.createdAt.microsSinceUnixEpoch;
  const travelMicros = BigInt(routeSteps) * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
  const arrivesAtMicros = startedAtMicros + travelMicros;
  const gatheringEndsAtMicros = arrivesAtMicros + gatheringDurationMicros;
  const plannedReturnsAtMicros = gatheringEndsAtMicros + travelMicros;
  if (
    startedAtMicros < 0n
    || plannedReturnsAtMicros > maximumU64
    || dispatch.resultRevision < 1n
  ) return false;
  if (recall === undefined) return plannedReturnsAtMicros <= observedAtMicros;
  const recalledAtMicros = recall.createdAt.microsSinceUnixEpoch;
  if (
    recalledAtMicros < startedAtMicros
    || recalledAtMicros > observedAtMicros
  ) return false;
  let returnsAtMicros: bigint;
  if (recall.resultRevision === dispatch.resultRevision + 1n) {
    // The ordinary recall reducer may observe an overdue assignment that is
    // still durably outbound. It clamps the return start to gathering end,
    // then derives progress from that clamped instant. Mirror that exact
    // transition here instead of inferring the durable phase from wall time.
    const returnStartedAtMicros = recalledAtMicros < gatheringEndsAtMicros
      ? recalledAtMicros
      : gatheringEndsAtMicros;
    const progressBasisPoints = returnStartedAtMicros <= startedAtMicros
      ? 0n
      : returnStartedAtMicros >= arrivesAtMicros
        ? 10_000n
        : ((returnStartedAtMicros - startedAtMicros) * 10_000n) / travelMicros;
    returnsAtMicros = returnStartedAtMicros
      + (travelMicros * progressBasisPoints) / 10_000n;
  } else if (recall.resultRevision === dispatch.resultRevision + 2n) {
    if (recalledAtMicros < arrivesAtMicros) return false;
    const returnStartedAtMicros = recalledAtMicros < gatheringEndsAtMicros
      ? recalledAtMicros
      : gatheringEndsAtMicros;
    returnsAtMicros = returnStartedAtMicros + travelMicros;
  } else {
    return false;
  }
  return returnsAtMicros <= maximumU64 && returnsAtMicros <= observedAtMicros;
}

function genericDispatchReceiptMetadataMatches(
  ctx: WarpkeepReducerContext,
  receipt: WorkerReceipt,
  input: Readonly<{
    fid: bigint;
    castleId: bigint;
    workerId: string;
    resourceKind: string;
    siteId: string;
    expectedRouteSteps?: number;
  }>,
  authority: StoredCanaryAuthorityV2,
): boolean {
  if (!(receipt.fid === input.fid
    && nonCanaryCommandReceipt(receipt, input.fid)
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind.startsWith('dispatch-v2:')
    && receipt.workerId === input.workerId
    && receipt.resourceKind === input.resourceKind
    && receipt.siteId === input.siteId
    && receipt.createdAt.microsSinceUnixEpoch
      >= authority.registration.notAfterMicros
  )) return false;
  try {
    const metadata = parseGreaterRealmWorkerDispatchReceiptKindV2(
      receipt.commandKind,
    );
    const resolved = resolveGenericDispatchRouteV2(ctx, input, authority);
    if (resolved === null) return false;
    return metadata.expectedRevision === authority.baseline.atlasRevision
      && metadata.nodeCount === resolved.location.nodeCount
      && Number.isSafeInteger(resolved.capacityOrdinal)
      && resolved.capacityOrdinal >= 1
      && resolved.capacityOrdinal <= metadata.nodeCount
      && resolved.location.resourceKind === input.resourceKind
      && (
        input.expectedRouteSteps === undefined
        || input.expectedRouteSteps === resolved.routeSteps
      )
      && metadata.capacityDigest === greaterRealmWorkerCapacityDigestV1({
        atlasId: authority.baseline.atlasId,
        atlasRevision: authority.baseline.atlasRevision,
        locationId: resolved.locationId,
        cellKey: resolved.location.cellKey,
        regionId: resolved.location.regionId,
        componentKey: resolved.location.componentKey,
        resourceKind: resolved.location.resourceKind,
        tier: 1,
        policyVersion: resolved.location.policyVersion,
        nodeCount: resolved.location.nodeCount,
      })
      && metadata.fingerprint === greaterRealmWorkerDispatchFingerprintV2({
        fid: input.fid,
        castleId: input.castleId,
        workerId: input.workerId,
        resourceKind: input.resourceKind,
        locationId: resolved.locationId,
        expectedRevision: authority.baseline.atlasRevision,
      });
  } catch {
    return false;
  }
}

function genericDispatchReceiptMatchesLaterAssignment(
  ctx: WarpkeepReducerContext,
  receipt: WorkerReceipt,
  assignment: AssignmentRow,
  worker: WorkerRow,
  authority: StoredCanaryAuthorityV2,
): boolean {
  return receipt.assignmentId === assignment.assignmentId
    && receipt.createdAt.microsSinceUnixEpoch
      === assignment.createdAt.microsSinceUnixEpoch
    && receipt.resultRevision <= worker.revision
    && genericDispatchReceiptMetadataMatches(ctx, receipt, {
      fid: assignment.fid,
      castleId: assignment.originCastleId,
      workerId: assignment.workerId,
      resourceKind: assignment.resourceKind,
      siteId: assignment.siteId,
      expectedRouteSteps: assignment.routeSteps,
    }, authority);
}

function genericRecallReceiptMatchesCorrelation(
  receipt: WorkerReceipt,
  dispatch: WorkerReceipt,
  worker: WorkerRow,
  notAfterMicros: bigint,
): boolean {
  return receipt.fid === dispatch.fid
    && nonCanaryCommandReceipt(receipt, dispatch.fid)
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind === 'recall'
    && receipt.workerId === dispatch.workerId
    && receipt.resourceKind === dispatch.resourceKind
    && receipt.siteId === dispatch.siteId
    && receipt.assignmentId === dispatch.assignmentId
    && receipt.createdAt.microsSinceUnixEpoch
      >= dispatch.createdAt.microsSinceUnixEpoch
    && receipt.createdAt.microsSinceUnixEpoch >= notAfterMicros
    && (
      receipt.resultRevision === dispatch.resultRevision + 1n
      || receipt.resultRevision === dispatch.resultRevision + 2n
    )
    && receipt.resultRevision <= worker.revision;
}

function genericRecallReceiptMatchesLaterAssignment(
  receipt: WorkerReceipt,
  dispatch: WorkerReceipt,
  assignment: AssignmentRow,
  worker: WorkerRow,
  notAfterMicros: bigint,
): boolean {
  return assignment.phase === 'returning'
    && receipt.assignmentId === assignment.assignmentId
    && genericRecallReceiptMatchesCorrelation(
      receipt,
      dispatch,
      worker,
      notAfterMicros,
    );
}

function boundedRowsOrUndefined<Row>(
  rows: Iterable<Row>,
  maximum: number,
): readonly Row[] | undefined {
  const bounded: Row[] = [];
  for (const row of rows) {
    bounded.push(row);
    if (bounded.length > maximum) return undefined;
  }
  return Object.freeze(bounded);
}

function assignmentGraphIsCanonical(
  ctx: WarpkeepReducerContext,
  assignment: AssignmentRow,
  worker: WorkerRow,
): boolean {
  if (
    !workerAssignmentStateIsConsistent(assignment)
    || !castleWorkerPublicStateIsConsistent(worker)
    || !publicWorkerMatchesAssignment(worker, assignment)
  ) return false;
  const occupations = boundedRowsOrUndefined(
    ctx.db.workerNodeOccupationV1.byWorker.filter(assignment.workerId),
    1,
  );
  if (
    occupations === undefined
    || (
      assignment.phase === 'returning'
        ? occupations.length !== 0
        : occupations.length !== 1
          || !occupationMatchesLaterAssignment(occupations[0]!, assignment)
          || ctx.db.workerNodeOccupationV1.nodeKey.find(
            workerNodeKey(assignment.resourceKind, assignment.siteId),
          )?.workerId !== assignment.workerId
    )
  ) return false;
  const schedules = boundedRowsOrUndefined(
    ctx.db.workerAssignmentScheduleV1.byAssignment.filter(
      assignment.assignmentId,
    ),
    1,
  );
  const workerSchedules = boundedRowsOrUndefined(
    ctx.db.workerAssignmentScheduleV1.byWorker.filter(assignment.workerId),
    1,
  );
  return schedules !== undefined
    && workerSchedules !== undefined
    && schedules.length === 1
    && workerSchedules.length === 1
    && schedules[0]!.scheduleId === workerSchedules[0]!.scheduleId
    && schedules[0]!.assignmentId === assignment.assignmentId
    && workerScheduleMatchesAssignment(schedules[0]!, assignment);
}

function genericRecoveryReceiptIsCanonical(
  receipt: WorkerReceipt,
  fid: bigint,
  authority: StoredCanaryAuthorityV2,
  workerById: ReadonlyMap<string, WorkerRow>,
  observedAtMicros: bigint,
): boolean {
  if (
    receipt.fid !== fid
    || !nonCanaryCommandReceipt(receipt, fid)
    || !workerCommandReceiptShapeIsValid(receipt)
    || receipt.createdAt.microsSinceUnixEpoch
      < authority.registration.notAfterMicros
    || receipt.createdAt.microsSinceUnixEpoch > observedAtMicros
    || receipt.workerId === undefined
    || (
      receipt.commandKind !== 'dispatch'
      && !receipt.commandKind.startsWith('dispatch-v2:')
      && receipt.commandKind !== 'recall'
    )
  ) return false;
  const worker = workerById.get(receipt.workerId);
  return worker !== undefined && receipt.resultRevision <= worker.revision;
}

function historicalRecallAllReceiptIsCanonical(
  receipt: WorkerReceipt,
  fid: bigint,
  registration: CanaryApprovalRow,
  highestRosterRevision: bigint,
  observedAtMicros: bigint,
): boolean {
  return receipt.fid === fid
    && nonCanaryCommandReceipt(receipt, fid)
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind === 'recall-all'
    && receipt.workerId === undefined
    && receipt.createdAt.microsSinceUnixEpoch
      < registration.registeredAt.microsSinceUnixEpoch
    && receipt.createdAt.microsSinceUnixEpoch <= observedAtMicros
    && receipt.resultRevision <= highestRosterRevision;
}

function laterUnrelatedAssignmentOrdinals(
  ctx: WarpkeepReducerContext,
  genericReceipts: readonly WorkerReceipt[],
  fid: bigint,
  authority: StoredCanaryAuthorityV2,
  byRequestKey: ReadonlyMap<string, WorkerReceipt>,
  dispatchOrdinals: ReadonlySet<number>,
  positionFenceOrdinals: ReadonlySet<number>,
  recoveryFence: WorkerReceipt | undefined,
  recoverySnapshot:
    | readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[]
    | undefined,
  ordinaryOriginalRecallByOrdinal: ReadonlyMap<number, WorkerReceipt>,
): Readonly<{
  ordinals: ReadonlySet<number>;
  completedOrdinals: ReadonlySet<number>;
  consumedRequestKeys: ReadonlySet<string>;
}> {
  const later = new Set<number>();
  const completed = new Set<number>();
  const consumedRequestKeys = new Set<string>();
  if (ctx.timestamp.microsSinceUnixEpoch < authority.registration.notAfterMicros) {
    return Object.freeze({
      ordinals: later,
      completedOrdinals: completed,
      consumedRequestKeys,
    });
  }
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const ordinal = index + 1;
    const route = authority.routePlan.routes[index]!;
    const command = authority.commandAuthority.commands[index]!;
    const hasDispatch = dispatchOrdinals.has(ordinal);
    const hasPositionFence = positionFenceOrdinals.has(ordinal);
    const current = ctx.db.workerAssignmentV1.workerId.find(route.workerId);
    const worker = ctx.db.castleWorkerV1.workerId.find(route.workerId);
    if (worker === null) continue;
    const originalDispatch = hasDispatch
      ? byRequestKey.get(commandRequestKey(fid, command.dispatchIdempotencyKey))
      : undefined;
    const positionFence = hasPositionFence
      ? byRequestKey.get(commandRequestKey(fid, command.dispatchIdempotencyKey))
      : undefined;
    const originalRecall = originalDispatch === undefined
      ? undefined
      : byRequestKey.get(commandRequestKey(fid, command.recallIdempotencyKey))
        ?? ordinaryOriginalRecallByOrdinal.get(ordinal);
    const snapshot = recoverySnapshot?.[index];
    if (current === null) {
      if (
        recoveryFence === undefined
        || snapshot === undefined
        || worker.status !== 'idle'
        || worker.resourceKind !== undefined
        || worker.siteId !== undefined
        || worker.revision !== BigInt(worker.timelineRevision)
        || boundedRowsOrUndefined(
          ctx.db.workerNodeOccupationV1.byWorker.filter(route.workerId),
          0,
        ) === undefined
        || boundedRowsOrUndefined(
          ctx.db.workerAssignmentScheduleV1.byWorker.filter(route.workerId),
          0,
        ) === undefined
      ) continue;
      const recordedAssignmentId = snapshot.assignmentId;
      const snapshotRecordsOriginal = recordedAssignmentId !== undefined
        && recordedAssignmentId === originalDispatch?.assignmentId;
      const terminalDispatchCandidates = genericReceipts.filter(receipt => (
        receipt.workerId === route.workerId
        && receipt.commandKind.startsWith('dispatch-v2:')
        && receipt.assignmentId !== undefined
        && (
          recordedAssignmentId === undefined
            ? receipt.createdAt.microsSinceUnixEpoch
                >= recoveryFence.createdAt.microsSinceUnixEpoch
              && receipt.resultRevision === snapshot.workerRevision + 1n
            : snapshotRecordsOriginal
              ? receipt.assignmentId !== recordedAssignmentId
                && receipt.createdAt.microsSinceUnixEpoch
                  >= recoveryFence.createdAt.microsSinceUnixEpoch
                && receipt.resultRevision === snapshot.workerRevision + 2n
              : receipt.assignmentId === recordedAssignmentId
        )
      ));
      if (terminalDispatchCandidates.length !== 1) continue;
      const terminalAssignmentId = terminalDispatchCandidates[0]!.assignmentId!;
      const related = genericReceipts.filter(
        receipt => receipt.assignmentId === terminalAssignmentId,
      );
      const genericDispatches = related.filter(receipt => (
        receipt.workerId === route.workerId
        && receipt.resourceKind !== undefined
        && receipt.siteId !== undefined
        && receipt.assignmentId === terminalAssignmentId
        && (
          recordedAssignmentId === undefined
            ? receipt.createdAt.microsSinceUnixEpoch
                >= recoveryFence.createdAt.microsSinceUnixEpoch
              && receipt.resultRevision === snapshot.workerRevision + 1n
            : snapshotRecordsOriginal
              ? receipt.createdAt.microsSinceUnixEpoch
                  >= recoveryFence.createdAt.microsSinceUnixEpoch
                && receipt.resultRevision === snapshot.workerRevision + 2n
              : receipt.createdAt.microsSinceUnixEpoch
                  <= recoveryFence.createdAt.microsSinceUnixEpoch
                && receipt.resultRevision <= recoveryFence.resultRevision
        )
        && genericDispatchReceiptMetadataMatches(ctx, receipt, {
          fid,
          castleId: authority.baseline.castleId,
          workerId: route.workerId,
          resourceKind: receipt.resourceKind,
          siteId: receipt.siteId,
        }, authority)
      ));
      if (genericDispatches.length !== 1) continue;
      const genericDispatch = genericDispatches[0]!;
      const genericRecalls = related.filter(receipt => (
        genericRecallReceiptMatchesCorrelation(
          receipt,
          genericDispatch,
          worker,
          authority.registration.notAfterMicros,
        )
      ));
      if (
        related.length !== 1 + genericRecalls.length
        || genericRecalls.length > 1
      ) continue;
      const genericRecall = genericRecalls[0];
      const resolvedTerminalRoute = resolveGenericDispatchRouteV2(ctx, {
        fid,
        castleId: authority.baseline.castleId,
        siteId: genericDispatch.siteId!,
      }, authority);
      const terminalChronologyExact = resolvedTerminalRoute !== null
        && terminalWorkerJourneyChronologyIsValidV2(
          genericDispatch,
          genericRecall,
          resolvedTerminalRoute.routeSteps,
          CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS,
          ctx.timestamp.microsSinceUnixEpoch,
        );
      const recallWasInSnapshot = genericRecall !== undefined
        && (
          genericRecall.createdAt.microsSinceUnixEpoch
            < recoveryFence.createdAt.microsSinceUnixEpoch
          || genericRecall.createdAt.microsSinceUnixEpoch
            === recoveryFence.createdAt.microsSinceUnixEpoch
            && snapshot.status === 'r'
            && genericRecall.resultRevision === snapshot.workerRevision
        );
      const phase = snapshot.status === 'o'
        ? 'outbound'
        : snapshot.status === 'g'
          ? 'gathering'
          : 'returning';
      const snapshotRevisionExact = snapshot.workerRevision
          === BigInt(snapshot.timelineRevision)
        && (
          snapshot.status === 'i'
            ? snapshot.assignmentId === undefined
            : snapshotRecordsOriginal
              ? snapshot.status === 'r'
                && originalDispatch !== undefined
                && productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
                  phase,
                  dispatchResultRevision: originalDispatch.resultRevision,
                  recallResultRevision: originalRecall?.resultRevision,
                  workerRevision: snapshot.workerRevision,
                  naturalExpiryReturn: originalRecall === undefined,
                })
              : snapshot.assignmentId === terminalAssignmentId
                && productionPlayerCanaryLaterWorkerRevisionIsExactV2({
                  phase,
                  dispatchResultRevision: genericDispatch.resultRevision,
                  recallResultRevision: recallWasInSnapshot
                    ? genericRecall?.resultRevision
                    : undefined,
                  workerRevision: snapshot.workerRevision,
                  naturalExpiryReturn: snapshot.status === 'r'
                    && !recallWasInSnapshot,
                })
        );
      const positionOrderExact = positionFence === undefined
        || positionFence.resultRevision === snapshot.workerRevision
          && (
            recordedAssignmentId === undefined
              ? genericDispatch.createdAt.microsSinceUnixEpoch
                  >= positionFence.createdAt.microsSinceUnixEpoch
                && genericDispatch.resultRevision
                  === positionFence.resultRevision + 1n
              : genericDispatch.createdAt.microsSinceUnixEpoch
                  <= positionFence.createdAt.microsSinceUnixEpoch
                && positionFence.resultRevision >= genericDispatch.resultRevision
          );
      const lineageExact = productionPlayerCanaryLaterLineageIsExactV2({
        genericCreatedAtMicros: genericDispatch.createdAt.microsSinceUnixEpoch,
        genericDispatchResultRevision: genericDispatch.resultRevision,
        originalDispatchResultRevision: originalDispatch?.resultRevision,
        originalRecallResultRevision: originalRecall?.resultRevision,
        positionCreatedAtMicros: positionFence?.createdAt.microsSinceUnixEpoch,
        positionResultRevision: positionFence?.resultRevision,
        freshUnfencedPosition: false,
        genericWasPresentInSnapshot: recordedAssignmentId !== undefined,
      });
      const terminalRevisionExact = genericRecall === undefined
        ? worker.revision === genericDispatch.resultRevision + 3n
        : (
          genericRecall.resultRevision === genericDispatch.resultRevision + 1n
          || genericRecall.resultRevision === genericDispatch.resultRevision + 2n
        ) && worker.revision === genericRecall.resultRevision + 1n;
      const transitionExact = worker.revision === BigInt(worker.timelineRevision);
      if (
        !snapshotRevisionExact
        || (
          originalDispatch === undefined
          && recordedAssignmentId !== undefined
          && genericDispatch.resultRevision !== 1n
        )
        || !positionOrderExact
        || !lineageExact
        || !terminalRevisionExact
        || !terminalChronologyExact
        || !transitionExact
        || (
          originalDispatch !== undefined
          && originalDispatch.assignmentId !== undefined
          && ctx.db.workerAssignmentV1.assignmentId.find(
            originalDispatch.assignmentId,
          ) !== null
        )
        || (
          genericRecall !== undefined
          && recallWasInSnapshot
          && genericRecall.resultRevision > recoveryFence.resultRevision
        )
      ) continue;
      completed.add(ordinal);
      for (const receipt of related) consumedRequestKeys.add(receipt.requestKey);
      continue;
    }
    if (
      current.fid !== fid
      || current.originCastleId !== authority.baseline.castleId
      || current.workerId !== route.workerId
      || current.createdAt.microsSinceUnixEpoch
        < authority.registration.notAfterMicros
      || current.createdAt.microsSinceUnixEpoch !== current.startedAtMicros
      || current.updatedAt.microsSinceUnixEpoch
        < current.createdAt.microsSinceUnixEpoch
      || current.updatedAt.microsSinceUnixEpoch
        > ctx.timestamp.microsSinceUnixEpoch
      || current.gatheringEndsAtMicros - current.arrivesAtMicros
        !== CASTLE_WORKER_MAX_GATHERING_DURATION_MICROS
      || !assignmentGraphIsCanonical(ctx, current, worker)
      || (
        originalDispatch !== undefined
        && (
          originalDispatch.assignmentId === undefined
          || current.assignmentId === originalDispatch.assignmentId
          || ctx.db.workerAssignmentV1.assignmentId.find(
            originalDispatch.assignmentId,
          ) !== null
          || worker.revision <= originalDispatch.resultRevision
        )
      )
    ) continue;
    const related = genericReceipts.filter(
      receipt => receipt.assignmentId === current.assignmentId,
    );
    const genericDispatches = related.filter(receipt => (
      genericDispatchReceiptMatchesLaterAssignment(
        ctx,
        receipt,
        current,
        worker,
        authority,
      )
    ));
    if (genericDispatches.length !== 1) continue;
    const genericRecalls = related.filter(receipt => (
      genericRecallReceiptMatchesLaterAssignment(
        receipt,
        genericDispatches[0]!,
        current,
        worker,
        authority.registration.notAfterMicros,
      )
    ));
    if (
      related.length !== genericDispatches.length + genericRecalls.length
      || genericRecalls.length > 1
      || (
        current.phase === 'returning'
          ? genericRecalls.length === 0
            && (
              current.returnStartedAtMicros !== current.gatheringEndsAtMicros
              || current.returnStartProgressBasisPoints !== 10_000
            )
          : genericRecalls.length !== 0
      )
    ) continue;
    const anchorRevision = originalDispatch?.resultRevision ?? 0n;
    const genericDispatch = genericDispatches[0]!;
    const genericWasPresentInSnapshot = snapshot?.assignmentId
      === current.assignmentId;
    const positionOrderValid = positionFence === undefined
      || (genericWasPresentInSnapshot
        ? genericDispatch.createdAt.microsSinceUnixEpoch
            <= positionFence.createdAt.microsSinceUnixEpoch
          && positionFence.resultRevision >= genericDispatch.resultRevision
        : genericDispatch.createdAt.microsSinceUnixEpoch
            >= positionFence.createdAt.microsSinceUnixEpoch
          && genericDispatch.resultRevision === positionFence.resultRevision + 1n);
    const naturalExpiryReturn = current.phase === 'returning'
      && genericRecalls.length === 0
      && current.returnStartedAtMicros === current.gatheringEndsAtMicros
      && current.returnStartProgressBasisPoints === 10_000;
    const exactCurrentRevision = productionPlayerCanaryLaterWorkerRevisionIsExactV2({
      phase: current.phase,
      dispatchResultRevision: genericDispatch.resultRevision,
      recallResultRevision: genericRecalls[0]?.resultRevision,
      workerRevision: worker.revision,
      naturalExpiryReturn,
    });
    const exactLineage = productionPlayerCanaryLaterLineageIsExactV2({
      genericCreatedAtMicros: genericDispatch.createdAt.microsSinceUnixEpoch,
      genericDispatchResultRevision: genericDispatch.resultRevision,
      originalDispatchResultRevision: originalDispatch?.resultRevision,
      originalRecallResultRevision: originalRecall?.resultRevision,
      positionCreatedAtMicros: positionFence?.createdAt.microsSinceUnixEpoch,
      positionResultRevision: positionFence?.resultRevision,
      freshUnfencedPosition: originalDispatch === undefined
        && positionFence === undefined
        && recoveryFence === undefined,
      genericWasPresentInSnapshot,
    });
    const snapshotRecall = genericRecalls[0] !== undefined
      && recoveryFence !== undefined
      && (
        genericRecalls[0]!.createdAt.microsSinceUnixEpoch
          < recoveryFence.createdAt.microsSinceUnixEpoch
        || genericRecalls[0]!.createdAt.microsSinceUnixEpoch
          === recoveryFence.createdAt.microsSinceUnixEpoch
          && snapshot?.status === 'r'
          && genericRecalls[0]!.resultRevision === snapshot.workerRevision
      )
      ? genericRecalls[0]
      : undefined;
    const snapshotPhaseRevisionExact = !genericWasPresentInSnapshot
      || snapshot === undefined
      || productionPlayerCanaryLaterWorkerRevisionIsExactV2({
        phase: snapshot.status === 'o'
          ? 'outbound'
          : snapshot.status === 'g'
            ? 'gathering'
            : snapshot.status === 'r'
              ? 'returning'
              : 'idle',
        dispatchResultRevision: genericDispatch.resultRevision,
        recallResultRevision: snapshotRecall?.resultRevision,
        workerRevision: snapshot.workerRevision,
        naturalExpiryReturn: snapshot.status === 'r' && snapshotRecall === undefined,
      });
    const recoveryFenceOrderValid = recoveryFence === undefined
      || (genericWasPresentInSnapshot
        ? snapshot !== undefined
          && genericDispatch.createdAt.microsSinceUnixEpoch
            <= recoveryFence.createdAt.microsSinceUnixEpoch
          && genericDispatch.resultRevision <= recoveryFence.resultRevision
        : snapshot !== undefined
          && genericDispatch.createdAt.microsSinceUnixEpoch
            >= recoveryFence.createdAt.microsSinceUnixEpoch);
    if (
      (originalDispatch !== undefined
        && genericDispatch.resultRevision <= anchorRevision)
      || (originalDispatch === undefined
        && positionFence === undefined
        && genericDispatch.resultRevision <= 0n)
      || (originalDispatch === undefined
        && genericWasPresentInSnapshot
        && genericDispatch.resultRevision !== 1n)
      || !positionOrderValid
      || !exactCurrentRevision
      || !exactLineage
      || !snapshotPhaseRevisionExact
      || !recoveryFenceOrderValid
      || (!hasDispatch && !hasPositionFence && recoveryFence !== undefined)
    ) continue;
    later.add(ordinal);
    for (const receipt of related) consumedRequestKeys.add(receipt.requestKey);
  }
  return Object.freeze({
    ordinals: later,
    completedOrdinals: completed,
    consumedRequestKeys,
  });
}

function boundedRecoveryReceipts(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): readonly WorkerReceipt[] {
  const receipts: WorkerReceipt[] = [];
  for (const receipt of ctx.db.workerCommandIdempotencyV1.byFid.filter(fid)) {
    receipts.push(receipt);
    if (receipts.length > WORKER_IDEMPOTENCY_RECEIPTS_PER_FID) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_BOUND_EXCEEDED');
    }
  }
  return Object.freeze(receipts);
}

function assertExpectedCanaryReceiptsV2(
  ctx: WarpkeepReducerContext,
  receipts: readonly WorkerReceipt[],
  fid: bigint,
  authority: StoredCanaryAuthorityV2,
  allowPostCutoffRecoveryRecalls: boolean,
  allowPostCutoffGenericRows: boolean,
): Readonly<{
  byRequestKey: ReadonlyMap<string, WorkerReceipt>;
  dispatchOrdinals: ReadonlySet<number>;
  positionFenceOrdinals: ReadonlySet<number>;
  dispatchReceiptCount: number;
  fenced: boolean;
  recoverySnapshot: readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[] | undefined;
  genericReceipts: readonly WorkerReceipt[];
  ordinaryOriginalRecallByOrdinal: ReadonlyMap<number, WorkerReceipt>;
  laterUnrelatedAssignmentOrdinals: ReadonlySet<number>;
  completedLaterUnrelatedOrdinals: ReadonlySet<number>;
}> {
  const byRequestKey = new Map<string, WorkerReceipt>();
  for (const receipt of receipts) {
    if (
      byRequestKey.has(receipt.requestKey)
      || receipt.createdAt.microsSinceUnixEpoch
        > ctx.timestamp.microsSinceUnixEpoch
    ) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
    }
    byRequestKey.set(receipt.requestKey, receipt);
  }

  const expectedKeys = new Set<string>();
  const dispatchOrdinals = new Set<number>();
  const positionFenceOrdinals = new Set<number>();
  const workerById = new Map<string, WorkerRow>();
  for (const route of authority.routePlan.routes) {
    const worker = ctx.db.castleWorkerV1.workerId.find(route.workerId);
    if (
      worker === null
      || worker.originCastleId !== authority.baseline.castleId
      || !castleWorkerPublicStateIsConsistent(worker)
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
    workerById.set(worker.workerId, worker);
  }
  const fenceKey = commandRequestKey(
    fid,
    authority.commandAuthority.recoveryFenceIdempotencyKey,
  );
  expectedKeys.add(fenceKey);
  const fence = byRequestKey.get(fenceKey);
  let recoverySnapshot:
    | readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[]
    | undefined;
  if (fence !== undefined) {
    if (
      !workerCommandReceiptShapeIsValid(fence)
      || fence.assignmentId === undefined
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
    try {
      recoverySnapshot = parseProductionPlayerCanaryRecoverySnapshotV2(
        fence.assignmentId,
      );
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
    }
    const snapshotMaximum = productionPlayerCanaryRecoverySnapshotMaximumRevisionV2(
      recoverySnapshot,
    );
    if (
      fence.resultRevision !== snapshotMaximum
      || !recoveryFenceReceiptMatches(
        fence,
        fid,
        authority.commandAuthority,
        authority.registration.approvedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
        snapshotMaximum,
        fence.assignmentId,
      )
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
  }
  let dispatchReceiptCount = 0;
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const route = authority.routePlan.routes[index]!;
    const command = authority.commandAuthority.commands[index]!;
    const dispatchKey = commandRequestKey(
      fid,
      command.dispatchIdempotencyKey,
    );
    const recallKey = commandRequestKey(fid, command.recallIdempotencyKey);
    expectedKeys.add(dispatchKey);
    expectedKeys.add(recallKey);
    const dispatchSlot = byRequestKey.get(dispatchKey);
    let dispatch: WorkerReceipt | undefined;
    if (dispatchSlot !== undefined) {
      if (dispatchReceiptMatches(
        ctx,
        dispatchSlot,
        fid,
        route,
        authority.baseline.castleId,
        authority.baseline.atlasId,
        authority.registration.approvedAtMicros,
        authority.registration.notAfterMicros,
      ) && dispatchSlot.resultRevision <= workerById.get(route.workerId)!.revision) {
        dispatch = dispatchSlot;
        dispatchOrdinals.add(index + 1);
        dispatchReceiptCount += 1;
      } else if (dispatchPositionFenceReceiptMatches(
        dispatchSlot,
        fid,
        command.dispatchIdempotencyKey,
        route.workerId,
        authority.registration.approvedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
        recoverySnapshot?.[index]?.workerRevision
          ?? workerById.get(route.workerId)!.revision,
      ) && (
        recoverySnapshot === undefined
        || dispatchSlot.resultRevision === recoverySnapshot[index]!.workerRevision
      )) {
        positionFenceOrdinals.add(index + 1);
      } else {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
      }
    }
    const recall = byRequestKey.get(recallKey);
    if (
      recall !== undefined
      && (
        dispatch === undefined
        || !(
          allowPostCutoffRecoveryRecalls
            ? exactCorrelatedRecallReceiptMatches(recall, dispatch, fid)
            : correlatedRecallReceiptMatches(
              recall,
              dispatch,
              fid,
              authority.registration.notAfterMicros,
            )
        )
        || recall.resultRevision > workerById.get(route.workerId)!.revision
      )
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
  }
  if (fence === undefined && positionFenceOrdinals.size !== 0) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
  }
  if (fence !== undefined) {
    const fenceAt = fence.createdAt.microsSinceUnixEpoch;
    for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
      const command = authority.commandAuthority.commands[index]!;
      const dispatchKey = commandRequestKey(fid, command.dispatchIdempotencyKey);
      const dispatchSlot = byRequestKey.get(dispatchKey);
      if (dispatchSlot === undefined) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID');
      }
      if (
        positionFenceOrdinals.has(index + 1)
          ? dispatchSlot.createdAt.microsSinceUnixEpoch !== fenceAt
            || dispatchSlot.resultRevision > fence.resultRevision
          : dispatchSlot.createdAt.microsSinceUnixEpoch > fenceAt
      ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
      const recall = byRequestKey.get(commandRequestKey(
        fid,
        command.recallIdempotencyKey,
      ));
      if (
        recall !== undefined
        && (
          recall.createdAt.microsSinceUnixEpoch > fenceAt
          || (
            recall.createdAt.microsSinceUnixEpoch === fenceAt
            && recall.resultRevision > fence.resultRevision
          )
        )
      ) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
      }
    }
  }
  const genericReceipts: WorkerReceipt[] = [];
  const highestCurrentRosterRevision = [...workerById.values()].reduce(
    (highest, worker) => worker.revision > highest ? worker.revision : highest,
    0n,
  );
  for (const [key, receipt] of byRequestKey) {
    if (!expectedKeys.has(key)) {
      if (historicalRecallAllReceiptIsCanonical(
        receipt,
        fid,
        authority.registration,
        highestCurrentRosterRevision,
        ctx.timestamp.microsSinceUnixEpoch,
      )) continue;
      if (
        !allowPostCutoffGenericRows
        || !genericRecoveryReceiptIsCanonical(
          receipt,
          fid,
          authority,
          workerById,
          ctx.timestamp.microsSinceUnixEpoch,
        )
      ) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
      }
      genericReceipts.push(receipt);
    }
  }
  const ordinaryOriginalRecallByOrdinal = new Map<number, WorkerReceipt>();
  const ordinaryOriginalRecallKeys = new Set<string>();
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    if (!dispatchOrdinals.has(index + 1)) continue;
    const command = authority.commandAuthority.commands[index]!;
    const route = authority.routePlan.routes[index]!;
    const dispatch = byRequestKey.get(commandRequestKey(
      fid,
      command.dispatchIdempotencyKey,
    ));
    if (dispatch === undefined) continue;
    const canaryRecall = byRequestKey.get(commandRequestKey(
      fid,
      command.recallIdempotencyKey,
    ));
    const matches = genericReceipts.filter(receipt => (
      receipt.commandKind === 'recall'
      && receipt.assignmentId === dispatch.assignmentId
      && nonCanaryCommandReceipt(receipt, fid)
      && exactCorrelatedRecallReceiptMatches(receipt, dispatch, fid)
      && receipt.createdAt.microsSinceUnixEpoch
        >= authority.registration.notAfterMicros
      && receipt.createdAt.microsSinceUnixEpoch
        <= ctx.timestamp.microsSinceUnixEpoch
      && receipt.workerId === route.workerId
      && receipt.resultRevision <= workerById.get(route.workerId)!.revision
      && (
        canaryRecall === undefined
        || receipt.resultRevision === canaryRecall.resultRevision
          && receipt.createdAt.microsSinceUnixEpoch
            >= canaryRecall.createdAt.microsSinceUnixEpoch
      )
      && (
        fence === undefined
        || receipt.createdAt.microsSinceUnixEpoch
          > fence.createdAt.microsSinceUnixEpoch
        || receipt.resultRevision <= fence.resultRevision
      )
    ));
    if (matches.length > 1) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
    }
    if (matches[0] !== undefined) {
      ordinaryOriginalRecallByOrdinal.set(index + 1, matches[0]);
      ordinaryOriginalRecallKeys.add(matches[0].requestKey);
    }
  }
  const unmatchedGenericReceipts = genericReceipts.filter(
    receipt => !ordinaryOriginalRecallKeys.has(receipt.requestKey),
  );
  const laterState = laterUnrelatedAssignmentOrdinals(
    ctx,
    unmatchedGenericReceipts,
    fid,
    authority,
    byRequestKey,
    dispatchOrdinals,
    positionFenceOrdinals,
    fence,
    recoverySnapshot,
    ordinaryOriginalRecallByOrdinal,
  );
  if (
    laterState.ordinals.size > CASTLE_WORKERS_PER_CASTLE
    || laterState.consumedRequestKeys.size + ordinaryOriginalRecallKeys.size
      !== genericReceipts.length
  ) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
  }
  return Object.freeze({
    byRequestKey,
    dispatchOrdinals,
    positionFenceOrdinals,
    dispatchReceiptCount,
    fenced: fence !== undefined,
    recoverySnapshot,
    genericReceipts: Object.freeze(genericReceipts),
    ordinaryOriginalRecallByOrdinal,
    laterUnrelatedAssignmentOrdinals: laterState.ordinals,
    completedLaterUnrelatedOrdinals: laterState.completedOrdinals,
  });
}

type ExpectedCanaryReceiptStateV2 = ReturnType<
  typeof assertExpectedCanaryReceiptsV2
>;

type ProductionPlayerCanarySweepPreflightV2 = Readonly<{
  roster: readonly WorkerRow[];
  plan: ReturnType<typeof planProductionPlayerCanaryRecoverySweepV2>;
}>;

function preflightProductionPlayerCanaryRecoverySweepV2(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  authority: StoredCanaryAuthorityV2,
  receiptState: ExpectedCanaryReceiptStateV2,
): ProductionPlayerCanarySweepPreflightV2 {
  const roster = [...assertCastleWorkerRoster(ctx, authority.baseline.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal);
  if (roster.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
  }
  const assignmentIds = new Set<string>();
  const occupationKeys = new Set<string>();
  const sweepStates: ProductionPlayerCanaryRecoverySweepOrdinalStateV2[] = [];
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const ordinal = index + 1;
    const route = authority.routePlan.routes[index]!;
    const command = authority.commandAuthority.commands[index]!;
    const worker = roster[index]!;
    const assignment = ctx.db.workerAssignmentV1.workerId.find(route.workerId);
    const dispatch = receiptState.dispatchOrdinals.has(ordinal)
      ? receiptState.byRequestKey.get(commandRequestKey(
        fid,
        command.dispatchIdempotencyKey,
      ))
      : undefined;
    const canaryRecall = receiptState.byRequestKey.get(commandRequestKey(
      fid,
      command.recallIdempotencyKey,
    ));
    const recall = canaryRecall
      ?? receiptState.ordinaryOriginalRecallByOrdinal.get(ordinal);
    const lineageDispatches = [...receiptState.byRequestKey.values()].filter(
      receipt => receipt.workerId === route.workerId
        && receipt.commandKind.startsWith('dispatch')
        && receipt.assignmentId !== undefined
        && receipt.resourceKind !== undefined
        && receipt.siteId !== undefined,
    );
    for (const lineage of lineageDispatches) {
      if (lineage.assignmentId === assignment?.assignmentId) continue;
      const lineageSchedules = boundedRowsOrUndefined(
        ctx.db.workerAssignmentScheduleV1.byAssignment.filter(
          lineage.assignmentId!,
        ),
        0,
      );
      const lineageOccupation = ctx.db.workerNodeOccupationV1.nodeKey.find(
        workerNodeKey(lineage.resourceKind!, lineage.siteId!),
      );
      const currentReusesLineageNode = assignment !== null
        && assignment.phase !== 'returning'
        && assignment.resourceKind === lineage.resourceKind
        && assignment.siteId === lineage.siteId
        && lineageOccupation?.workerId === assignment.workerId;
      if (
        ctx.db.workerAssignmentV1.assignmentId.find(lineage.assignmentId!) !== null
        || lineageSchedules === undefined
        || (lineageOccupation !== null && !currentReusesLineageNode)
      ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
    }
    const later = receiptState.laterUnrelatedAssignmentOrdinals.has(ordinal);
    const laterCompleted = receiptState.completedLaterUnrelatedOrdinals.has(ordinal);
    if (!receiptState.fenced && dispatch === undefined && !later && !laterCompleted) {
      assertNewProductionPlayerCanaryDispatchTargetPristineV2(
        ctx,
        route,
        authority.baseline.castleId,
      );
    }
    const snapshot = receiptState.recoverySnapshot?.[index];
    const idleOccupations = assignment === null
      ? boundedRowsOrUndefined(
        ctx.db.workerNodeOccupationV1.byWorker.filter(route.workerId),
        0,
      )
      : undefined;
    const idleSchedules = assignment === null
      ? boundedRowsOrUndefined(
        ctx.db.workerAssignmentScheduleV1.byWorker.filter(route.workerId),
        0,
      )
      : undefined;
    const immutableTravelMicros = assignment === null
      ? undefined
      : assignment.arrivesAtMicros - assignment.startedAtMicros;
    const immutablePlannedReturnMicros = assignment === null
      || immutableTravelMicros === undefined
      || immutableTravelMicros <= 0n
      || assignment.gatheringEndsAtMicros
        > (1n << 64n) - 1n - immutableTravelMicros
      ? undefined
      : assignment.gatheringEndsAtMicros + immutableTravelMicros;
    if (assignment !== null) {
      assignmentIds.add(assignment.assignmentId);
      if (assignment.phase !== 'returning') {
        occupationKeys.add(workerNodeKey(
          assignment.resourceKind,
          assignment.siteId,
        ));
      }
    }
    const assignmentExact = dispatch !== undefined
      && dispatch.assignmentId !== undefined
      && dispatch.resourceKind !== undefined
      && dispatch.siteId !== undefined
      && assignment !== null
      && assignment.fid === fid
      && assignment.originCastleId === authority.baseline.castleId
      && assignment.assignmentId === dispatch.assignmentId
      && assignment.workerId === route.workerId
      && assignment.resourceKind === dispatch.resourceKind
      && assignment.siteId === dispatch.siteId
      && assignment.createdAt.microsSinceUnixEpoch
        === dispatch.createdAt.microsSinceUnixEpoch
      && assignment.routeSteps === route.routeSteps
      && assignment.gatheringEndsAtMicros - assignment.arrivesAtMicros
        === PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS
      && immutablePlannedReturnMicros !== undefined
      && immutablePlannedReturnMicros < authority.registration.notAfterMicros
      && assignmentGraphIsCanonical(ctx, assignment, worker);
    const naturalExpiryReturn = assignment?.phase === 'returning'
      && recall === undefined
      && assignment.returnStartedAtMicros === assignment.gatheringEndsAtMicros
      && assignment.returnStartProgressBasisPoints === 10_000;
    const originalTerminalChronologyExact = dispatch === undefined
      || assignment?.assignmentId === dispatch.assignmentId
      || terminalWorkerJourneyChronologyIsValidV2(
        dispatch,
        recall,
        route.routeSteps,
        PRODUCTION_PLAYER_CANARY_GATHERING_DURATION_MICROS,
        assignment?.createdAt.microsSinceUnixEpoch
          ?? ctx.timestamp.microsSinceUnixEpoch,
      );
    const originalRevisionExact = dispatch === undefined
      || later
      || laterCompleted
      || productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
        phase: assignment === null ? 'idle' : assignment.phase,
        dispatchResultRevision: dispatch.resultRevision,
        recallResultRevision: recall?.resultRevision,
        workerRevision: worker.revision,
        naturalExpiryReturn,
      });
    const acceptedReceipts = [...receiptState.byRequestKey.values()];
    const snapshotAssignmentKnown = snapshot === undefined
      || snapshot.assignmentId === undefined
      || acceptedReceipts.some(receipt => (
        receipt.assignmentId === snapshot.assignmentId
        && receipt.commandKind.startsWith('dispatch')
      ));
    const snapshotAssignmentDispatch = snapshot?.assignmentId === undefined
      ? undefined
      : acceptedReceipts.find(receipt => (
        receipt.assignmentId === snapshot.assignmentId
        && receipt.commandKind.startsWith('dispatch')
      ));
    const snapshotAssignmentCompletedExplicitly = snapshotAssignmentDispatch
        !== undefined
      && acceptedReceipts.some(receipt => (
        receipt.assignmentId === snapshotAssignmentDispatch.assignmentId
        && receipt.commandKind === 'recall'
        && receipt.resourceKind !== undefined
        && receipt.resultRevision
          === snapshotAssignmentDispatch.resultRevision + 1n
      ));
    const currentAssignmentDispatch = assignment === null
      ? undefined
      : acceptedReceipts.find(receipt => (
        receipt.assignmentId === assignment.assignmentId
        && receipt.commandKind.startsWith('dispatch')
      ));
    const currentAssignmentReturnsExplicitly = currentAssignmentDispatch
        !== undefined
      && acceptedReceipts.some(receipt => (
        receipt.assignmentId === currentAssignmentDispatch.assignmentId
        && receipt.commandKind === 'recall'
        && receipt.resourceKind !== undefined
        && receipt.resultRevision
          === currentAssignmentDispatch.resultRevision + 1n
      ));
    const snapshotGenericDispatch = snapshot?.assignmentId === undefined
      ? undefined
      : receiptState.genericReceipts.find(receipt => (
        receipt.assignmentId === snapshot.assignmentId
        && receipt.commandKind.startsWith('dispatch-v2:')
      ));
    const snapshotGenericRecall = snapshot?.assignmentId === undefined
      ? undefined
      : receiptState.genericReceipts.find(receipt => (
        receipt.assignmentId === snapshot.assignmentId
        && receipt.commandKind === 'recall'
        && snapshot.status === 'r'
        && receipt.resultRevision <= snapshot.workerRevision
      ));
    const snapshotOriginalAssignment = snapshot?.assignmentId !== undefined
      && snapshot.assignmentId === dispatch?.assignmentId;
    const snapshotPhase = snapshot?.status === 'o'
      ? 'outbound'
      : snapshot?.status === 'g'
        ? 'gathering'
        : snapshot?.status === 'r'
          ? 'returning'
          : 'idle';
    const snapshotBaseRevisionExact = snapshot === undefined
      || (
        snapshot.workerRevision === BigInt(snapshot.timelineRevision)
        && worker.revision === BigInt(worker.timelineRevision)
        && (
          snapshot.assignmentId === undefined
            ? snapshot.status === 'i'
              && (
                dispatch === undefined
                  ? snapshot.workerRevision === 0n
                  : productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
                    phase: 'idle',
                    dispatchResultRevision: dispatch.resultRevision,
                    recallResultRevision: recall?.resultRevision,
                    workerRevision: snapshot.workerRevision,
                    naturalExpiryReturn: recall === undefined,
                  })
              )
            : snapshotOriginalAssignment
              ? snapshot.status === 'r'
                && dispatch !== undefined
                && productionPlayerCanaryOriginalWorkerRevisionIsExactV2({
                  phase: snapshotPhase,
                  dispatchResultRevision: dispatch.resultRevision,
                  recallResultRevision: recall?.resultRevision,
                  workerRevision: snapshot.workerRevision,
                  naturalExpiryReturn: recall === undefined,
                })
              : snapshotGenericDispatch !== undefined
                && productionPlayerCanaryLaterWorkerRevisionIsExactV2({
                  phase: snapshotPhase,
                  dispatchResultRevision: snapshotGenericDispatch.resultRevision,
                  recallResultRevision: snapshotGenericRecall?.resultRevision,
                  workerRevision: snapshot.workerRevision,
                  naturalExpiryReturn: snapshot.status === 'r'
                    && snapshotGenericRecall === undefined,
                })
        )
      );
    const snapshotTransitionExact = snapshot === undefined
      || laterCompleted
      || productionPlayerCanaryRecoverySnapshotTransitionIsValidV2({
        snapshot,
        currentStatus: recoverySnapshotStatus(worker.status),
        currentAssignmentId: assignment?.assignmentId,
        currentWorkerRevision: worker.revision,
        currentTimelineRevision: worker.timelineRevision,
        snapshotAssignmentCompletedExplicitly,
        currentAssignmentReturnsExplicitly,
      });
    sweepStates.push(Object.freeze({
      ordinal,
      rosterValid: worker.ordinal === ordinal
        && worker.workerId === route.workerId
        && worker.originCastleId === authority.baseline.castleId
        && castleWorkerPublicStateIsConsistent(worker)
        && originalRevisionExact
        && originalTerminalChronologyExact
        && snapshotAssignmentKnown
        && snapshotBaseRevisionExact
        && snapshotTransitionExact
        && !(
          dispatch !== undefined
          && assignment === null
          && worker.revision <= dispatch.resultRevision
        )
        && (
          assignment !== null
          || (idleOccupations !== undefined && idleSchedules !== undefined)
        ),
      dispatchPresent: dispatch !== undefined,
      positionFenced: receiptState.positionFenceOrdinals.has(ordinal),
      laterUnrelatedAssignment: later,
      unrelatedAssignmentCanonical: later
        && assignment !== null
        && assignmentGraphIsCanonical(ctx, assignment, worker),
      recallPresent: recall !== undefined,
      assignmentPresent: assignment !== null,
      workerIdle: worker.status === 'idle',
      assignmentExact,
      assignmentReturning: assignment?.phase === 'returning',
    }));
  }
  const assignments = boundedRowsOrUndefined(
    ctx.db.workerAssignmentV1.byFid.filter(fid),
    CASTLE_WORKERS_PER_CASTLE,
  );
  const occupations = boundedRowsOrUndefined(
    ctx.db.workerNodeOccupationV1.byOriginCastle.filter(
      authority.baseline.castleId,
    ),
    CASTLE_WORKERS_PER_CASTLE,
  );
  if (
    assignments === undefined
    || assignments.length !== assignmentIds.size
    || assignments.some(row => !assignmentIds.has(row.assignmentId))
    || occupations === undefined
    || occupations.length !== occupationKeys.size
    || occupations.some(row => !occupationKeys.has(row.nodeKey))
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
  return Object.freeze({
    roster: Object.freeze(roster),
    plan: planProductionPlayerCanaryRecoverySweepV2(
      sweepStates,
      receiptState.fenced,
    ),
  });
}

/**
 * Recall exactly one classified canary assignment without invoking the
 * ordinary whole-FID settlement path. Recovery deliberately forfeits at most
 * the canary's one unmaterialized quantum: durable materialized value is kept,
 * the cursor advances to the return boundary, and unrelated generic work plus
 * the shared resource account remain byte-for-byte untouched. This is the
 * narrow rollback/off safety carveout: only rederived owner, baseline,
 * approval, route, dispatch-receipt, and exact assignment authority reaches
 * it. Pre-cutoff ordinal recalls retain the ordinary gameplay-system gate;
 * generic commands never call this helper.
 */
function recallExactCanaryAssignmentForRecoveryV2(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    castleId: bigint;
    workerId: string;
    recallIdempotencyKey: string;
    assignmentId: string;
    resourceKind: string;
    siteId: string;
  }>,
): void {
  let assignment = ctx.db.workerAssignmentV1.assignmentId.find(input.assignmentId);
  let worker = ctx.db.castleWorkerV1.workerId.find(input.workerId);
  if (
    assignment === null
    || worker === null
    || assignment.fid !== input.fid
    || assignment.originCastleId !== input.castleId
    || assignment.workerId !== input.workerId
    || assignment.resourceKind !== input.resourceKind
    || assignment.siteId !== input.siteId
    || assignment.phase === 'returning'
    || assignment.accruedAmount !== assignment.materializedAmount
    || !assignmentGraphIsCanonical(ctx, assignment, worker)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
  const observedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
  const containment = planProductionPlayerCanaryContainmentReturnV2({
    observedAtMicros,
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    settledThroughMicros: assignment.settledThroughMicros,
    accruedAmount: assignment.accruedAmount,
    materializedAmount: assignment.materializedAmount,
    routeSteps: assignment.routeSteps,
    timelineRevision: assignment.timelineRevision,
    workerRevision: worker.revision,
  });
  const schedules = boundedRowsOrUndefined(
    ctx.db.workerAssignmentScheduleV1.byAssignment.filter(assignment.assignmentId),
    1,
  );
  const occupation = ctx.db.workerNodeOccupationV1.nodeKey.find(
    workerNodeKey(assignment.resourceKind, assignment.siteId),
  );
  if (
    schedules === undefined
    || schedules.length !== 1
    || occupation === null
    || !occupationMatchesLaterAssignment(occupation, assignment)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
  ctx.db.workerAssignmentScheduleV1.scheduleId.delete(schedules[0]!.scheduleId);
  ctx.db.workerNodeOccupationV1.nodeKey.delete(occupation.nodeKey);
  const returning = ctx.db.workerAssignmentV1.assignmentId.update({
    ...assignment,
    phase: 'returning',
    returnStartedAtMicros: containment.returnStartedAtMicros,
    returnsAtMicros: containment.returnsAtMicros,
    returnStartProgressBasisPoints: containment.returnStartProgressBasisPoints,
    settledThroughMicros: containment.settledThroughMicros,
    timelineRevision: containment.timelineRevision,
    updatedAt: ctx.timestamp,
  });
  const updatedWorker = ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    status: 'returning',
    returnStartedAtMicros: containment.returnStartedAtMicros,
    returnsAtMicros: containment.returnsAtMicros,
    returnStartProgressBasisPoints: containment.returnStartProgressBasisPoints,
    timelineRevision: containment.timelineRevision,
    revision: containment.workerRevision,
  });
  if (
    returning.accruedAmount !== returning.materializedAmount
    || !workerAssignmentStateIsConsistent(returning)
    || !castleWorkerPublicStateIsConsistent(updatedWorker)
    || !publicWorkerMatchesAssignment(updatedWorker, returning)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
  ctx.db.workerAssignmentScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(containment.returnsAtMicros),
    assignmentId: returning.assignmentId,
    workerId: returning.workerId,
    timelineRevision: returning.timelineRevision,
    stage: 'return-complete',
  });
  ctx.db.workerCommandIdempotencyV1.insert({
    ...recallWorkerReceipt(
      commandRequestKey(input.fid, input.recallIdempotencyKey),
      input.fid,
      input.workerId,
      updatedWorker.revision,
      {
        resourceKind: returning.resourceKind,
        siteId: returning.siteId,
        assignmentId: returning.assignmentId,
      },
    ),
    createdAt: ctx.timestamp,
  });
}

export type ProductionPlayerCanaryDispatchClassificationV2 = Readonly<{
  authority: StoredCanaryAuthorityV2;
  ordinal: number;
}>;

/** Reserve both command namespaces and block every generic write while active. */
export function assertProductionPlayerCanaryGenericWorkerWriteAvailableV2(
  ctx: WarpkeepReducerContext,
  input: Readonly<{ fid: bigint; idempotencyKey: string }>,
): void {
  if (
    input.idempotencyKey.startsWith(RESERVED_COMMAND_V1_PREFIX)
    || input.idempotencyKey.startsWith(RESERVED_COMMAND_V2_PREFIX)
  ) fail('PRODUCTION_PLAYER_CANARY_COMMAND_KEY_RESERVED');
  const registration = requireStoredProductionPlayerCanaryApprovalRegistrationV2(
    ctx,
    input.fid,
  );
  if (
    registration !== null
    && ctx.timestamp.microsSinceUnixEpoch >= registration.approvedAtMicros
    && ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros
  ) fail('PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED');
}

/**
 * Exact server-side dispatch classifier. A pc2 key is accepted only for its
 * immutable stored tuple. A new dispatch must fit wholly inside the half-open
 * approval window; an exact receipt replay stays read-only after expiry. The
 * very first dispatch additionally proves the baseline receipt set is empty.
 */
export function classifyProductionPlayerCanaryDispatchV2(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    castle: CastleRow;
    workerId: string;
    resourceKind: string;
    locationId: string;
    expectedRevision: bigint;
    idempotencyKey: string;
  }>,
): ProductionPlayerCanaryDispatchClassificationV2 | null {
  if (input.idempotencyKey.startsWith(RESERVED_COMMAND_V1_PREFIX)) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_KEY_RESERVED');
  }
  const pc2 = input.idempotencyKey.startsWith(RESERVED_COMMAND_V2_PREFIX);
  const authority = storedCanaryAuthorityV2(ctx, input.fid);
  if (authority === null) {
    if (pc2) fail('PRODUCTION_PLAYER_CANARY_COMMAND_KEY_RESERVED');
    return null;
  }
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (!pc2) {
    if (
      now >= authority.registration.approvedAtMicros
      && now < authority.registration.notAfterMicros
    ) {
      fail('PRODUCTION_PLAYER_CANARY_GENERIC_WORKER_WRITE_BLOCKED');
    }
    return null;
  }
  if (
    input.castle.castleId !== authority.baseline.castleId
    || input.castle.ownerFid !== input.fid
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_AUTHORITY_UNAVAILABLE');
  const commandOrdinal = productionPlayerCanaryDispatchCommandOrdinalV2(
    authority.commandAuthority.commands,
    input.idempotencyKey,
  );
  if (commandOrdinal === null) {
    fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TUPLE_INVALID');
  }
  const commandIndex = commandOrdinal - 1;
  const route = authority.routePlan.routes[commandIndex]!;
  assertProductionPlayerCanaryDispatchTupleV2(route, commandOrdinal, input);
  const receiptState = assertExpectedCanaryReceiptsV2(
    ctx,
    boundedRecoveryReceipts(ctx, input.fid),
    input.fid,
    authority,
    true,
    true,
  );
  const dispatchRequestKey = commandRequestKey(
    input.fid,
    authority.commandAuthority.commands[commandIndex]!.dispatchIdempotencyKey,
  );
  const existingDispatch = receiptState.dispatchOrdinals.has(commandOrdinal)
    ? receiptState.byRequestKey.get(dispatchRequestKey)
    : undefined;
  const commandFenced = receiptState.positionFenceOrdinals.has(commandOrdinal);
  if (existingDispatch !== undefined) {
    preflightProductionPlayerCanaryRecoverySweepV2(
      ctx,
      input.fid,
      authority,
      receiptState,
    );
  }
  let plannedReturnsAtMicros: bigint | undefined;
  if (existingDispatch === undefined && !receiptState.fenced && !commandFenced) {
    try {
      plannedReturnsAtMicros = planProductionPlayerCanaryTimelineBeforeCutoff(
        now,
        route.routeSteps,
        authority.registration.notAfterMicros,
      ).returnsAtMicros;
    } catch {
      plannedReturnsAtMicros = authority.registration.notAfterMicros;
    }
  }
  productionPlayerCanaryDispatchDispositionV2({
    observedAtMicros: now,
    approvedAtMicros: authority.registration.approvedAtMicros,
    notAfterMicros: authority.registration.notAfterMicros,
    plannedReturnsAtMicros,
    existingDispatch: existingDispatch !== undefined,
    dispatchReceiptCount: receiptState.dispatchReceiptCount,
    receiptCount: receiptState.byRequestKey.size,
    fenced: receiptState.fenced || commandFenced,
  });
  if (existingDispatch === undefined && !receiptState.fenced && !commandFenced) {
    if (receiptState.byRequestKey.size === 0) {
      assertProductionPlayerCanaryStoredBaselineCurrentPristineV2(ctx, input.fid);
    }
    assertNewProductionPlayerCanaryDispatchTargetPristineV2(
      ctx,
      route,
      authority.baseline.castleId,
    );
  }
  return Object.freeze({ authority, ordinal: commandOrdinal });
}

function clampClassifiedProductionPlayerCanaryAssignmentV2(
  ctx: WarpkeepReducerContext,
  assignment: NonNullable<ReturnType<
    typeof dispatchGreaterRealmCastleWorkerV2
  >['assignment']>,
  notAfterMicros: bigint,
): void {
  const worker = ctx.db.castleWorkerV1.workerId.find(assignment.workerId);
  const occupations = boundedRowsOrUndefined(
    ctx.db.workerNodeOccupationV1.byWorker.filter(assignment.workerId),
    1,
  );
  if (
    worker === null
    || occupations === undefined
    || occupations.length !== 1
    || occupations[0]!.workerId !== assignment.workerId
    || occupations[0]!.resourceKind !== assignment.resourceKind
    || occupations[0]!.siteId !== assignment.siteId
  ) fail('PRODUCTION_PLAYER_CANARY_TIMELINE_CLAMP_INVALID');
  const timeline = clampProductionPlayerCanaryTimeline({
    startedAtMicros: assignment.startedAtMicros,
    arrivesAtMicros: assignment.arrivesAtMicros,
    gatheringEndsAtMicros: assignment.gatheringEndsAtMicros,
    returnsAtMicros: assignment.returnsAtMicros,
  });
  if (timeline.returnsAtMicros >= notAfterMicros) {
    fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TIMELINE_CUTOFF');
  }
  ctx.db.workerAssignmentV1.assignmentId.update({
    ...assignment,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
    returnsAtMicros: timeline.returnsAtMicros,
  });
  ctx.db.castleWorkerV1.workerId.update({
    ...worker,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
    returnsAtMicros: timeline.returnsAtMicros,
  });
  ctx.db.workerNodeOccupationV1.nodeKey.update({
    ...occupations[0]!,
    gatheringEndsAtMicros: timeline.gatheringEndsAtMicros,
  });
}

/**
 * Exact production seam used by the reducer and stateful tests. Classification
 * runs before the generic dispatch write; a NEW exact pc2 assignment is then
 * clamped atomically, while an idempotent replay validates only immutable
 * approved-route timing and performs no write.
 */
export function dispatchProductionPlayerCanaryAwareGreaterRealmWorkerV1(
  ctx: WarpkeepReducerContext,
  input: Parameters<typeof dispatchGreaterRealmCastleWorkerV2>[1],
): ReturnType<typeof dispatchGreaterRealmCastleWorkerV2> {
  const classification = classifyProductionPlayerCanaryDispatchV2(ctx, input);
  const result = dispatchGreaterRealmCastleWorkerV2(ctx, input);
  if (classification === null || result.assignment === undefined) return result;
  if (result.idempotent) {
    const classifiedRoute = classification.authority.routePlan.routes[
      classification.ordinal - 1
    ]!;
    if (!productionPlayerCanaryReplayTimelineIsValid({
      startedAtMicros: result.assignment.startedAtMicros,
      arrivesAtMicros: result.assignment.arrivesAtMicros,
      gatheringEndsAtMicros: result.assignment.gatheringEndsAtMicros,
      routeSteps: result.assignment.routeSteps,
      approvedRouteSteps: classifiedRoute.routeSteps,
      notAfterMicros: classification.authority.registration.notAfterMicros,
    })) fail('PRODUCTION_PLAYER_CANARY_TIMELINE_REPLAY_INVALID');
    return result;
  }
  clampClassifiedProductionPlayerCanaryAssignmentV2(
    ctx,
    result.assignment,
    classification.authority.registration.notAfterMicros,
  );
  const clamped = ctx.db.workerAssignmentV1.assignmentId.find(
    result.assignment.assignmentId,
  );
  if (clamped === null) fail('PRODUCTION_PLAYER_CANARY_TIMELINE_CLAMP_INVALID');
  return Object.freeze({ ...result, assignment: clamped });
}

/**
 * Caller-authenticated, atomic conditional recall. Ordinals 1..4 retain the
 * exact single-assignment operation; ordinal 0 is the reload-safe all-four
 * recall-or-fence sweep. No route, key, FID, assignment, or receipt identity
 * is accepted from the browser.
 */
export function recallProductionPlayerCanaryWorkerV1(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    castle: CastleRow;
    reviewedAdmissionPlanDigest: string;
    evidenceNonce: string;
    ordinal: number;
  }>,
): 'idle' | 'returning' | 'recalled' | 'replayed' | 'fenced' {
  validInput(input);
  if (
    !Number.isSafeInteger(input.ordinal)
    || input.ordinal < 0
    || input.ordinal > CASTLE_WORKERS_PER_CASTLE
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_INPUT_INVALID');
  const baselineInput = Object.freeze({
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
  });
  if (requireStoredProductionPlayerCanaryBaselineV2(ctx, input.fid) === null) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  }
  if (
    requireStoredProductionPlayerCanaryApprovalRegistrationV2(ctx, input.fid)
      === null
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, baselineInput);
  const registration = requireProductionPlayerCanaryApprovalRegistrationV1(
    ctx,
    baselineInput,
  );
  const routePlan = inspectProductionPlayerCanaryRoutePlan(ctx, baselineInput);
  const commandAuthority = productionPlayerCanaryCommandAuthorityV2({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
  });
  if (
    baseline.castleId !== input.castle.castleId
    || registration.reviewedAdmissionPlanDigest
      !== input.reviewedAdmissionPlanDigest
    || registration.serverBaselineCommitment !== baseline.baselineCommitment
    || registration.routeSetCommitment !== baseline.routeSetCommitment
    || registration.routeSetCommitment !== routePlan.routeSetCommitment
    || registration.commandKeyPolicyVersion
      !== commandAuthority.commandKeyPolicyVersion
    || registration.commandSetCommitment !== commandAuthority.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');

  const authority = Object.freeze({
    baseline,
    registration,
    routePlan,
    commandAuthority,
  });
  const receiptRows = boundedRecoveryReceipts(ctx, input.fid);
  const receiptState = assertExpectedCanaryReceiptsV2(
    ctx,
    receiptRows,
    input.fid,
    authority,
    true,
    true,
  );
  if (input.ordinal === 0) {
    // Preflight all four receipt positions and the complete worker graph before
    // the first write. The f00 row is inserted last as the durable completion
    // marker; reducer atomicity makes the whole recall-or-fence sweep visible
    // all at once.
    const sweep = preflightProductionPlayerCanaryRecoverySweepV2(
      ctx,
      input.fid,
      authority,
      receiptState,
    );
    const projectedReceiptCount = receiptRows.length
      + (sweep.plan.insertFence ? 1 : 0)
      + sweep.plan.positionFenceOrdinals.length
      + sweep.plan.mutationRecallOrdinals.length;
    if (projectedReceiptCount > WORKER_IDEMPOTENCY_RECEIPTS_PER_FID) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_BOUND_EXCEEDED');
    }
    for (const ordinal of sweep.plan.positionFenceOrdinals) {
      const index = ordinal - 1;
      const command = commandAuthority.commands[index]!;
      const route = routePlan.routes[index]!;
      const worker = sweep.roster[index]!;
      ctx.db.workerCommandIdempotencyV1.insert({
        requestKey: commandRequestKey(
          input.fid,
          command.dispatchIdempotencyKey,
        ),
        fid: input.fid,
        workerId: route.workerId,
        commandKind: 'recall',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: undefined,
        resultRevision: worker.revision,
        createdAt: ctx.timestamp,
      });
    }
    for (const ordinal of sweep.plan.mutationRecallOrdinals) {
      const index = ordinal - 1;
      const route = routePlan.routes[index]!;
      const command = commandAuthority.commands[index]!;
      const dispatch = receiptState.dispatchOrdinals.has(ordinal)
        ? receiptState.byRequestKey.get(commandRequestKey(
          input.fid,
          command.dispatchIdempotencyKey,
        ))
        : undefined;
      if (
        dispatch === undefined
        || dispatch.assignmentId === undefined
        || dispatch.resourceKind === undefined
        || dispatch.siteId === undefined
      ) continue;
      recallExactCanaryAssignmentForRecoveryV2(ctx, {
        fid: input.fid,
        castleId: input.castle.castleId,
        workerId: route.workerId,
        recallIdempotencyKey: command.recallIdempotencyKey,
        resourceKind: dispatch.resourceKind,
        siteId: dispatch.siteId,
        assignmentId: dispatch.assignmentId,
      });
    }
    if (sweep.plan.insertFence) {
      const snapshotRoutes = routePlan.routes.map((route, index) => {
        const current = ctx.db.castleWorkerV1.workerId.find(route.workerId);
        const assignment = ctx.db.workerAssignmentV1.workerId.find(route.workerId);
        if (
          current === null
          || current.ordinal !== index + 1
          || current.originCastleId !== input.castle.castleId
          || !castleWorkerPublicStateIsConsistent(current)
          || (
            current.status === 'idle'
              ? assignment !== null
              : assignment === null
                || !assignmentGraphIsCanonical(ctx, assignment, current)
          )
        ) {
          fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
        }
        return Object.freeze({
          workerRevision: current.revision,
          timelineRevision: current.timelineRevision,
          status: recoverySnapshotStatus(current.status),
          assignmentId: assignment?.assignmentId,
        });
      });
      const snapshotPayload = encodeProductionPlayerCanaryRecoverySnapshotV2(
        snapshotRoutes,
      );
      const resultRevision = productionPlayerCanaryRecoverySnapshotMaximumRevisionV2(
        snapshotRoutes,
      );
      ctx.db.workerCommandIdempotencyV1.insert({
        requestKey: commandRequestKey(
          input.fid,
          commandAuthority.recoveryFenceIdempotencyKey,
        ),
        fid: input.fid,
        workerId: undefined,
        commandKind: 'recall-all',
        resourceKind: undefined,
        siteId: undefined,
        assignmentId: snapshotPayload,
        resultRevision,
        createdAt: ctx.timestamp,
      });
    }
    return 'fenced';
  }
  if (receiptState.fenced) {
    preflightProductionPlayerCanaryRecoverySweepV2(
      ctx,
      input.fid,
      authority,
      receiptState,
    );
    return 'fenced';
  }
  preflightProductionPlayerCanaryRecoverySweepV2(
    ctx,
    input.fid,
    authority,
    receiptState,
  );
  const index = input.ordinal - 1;
  const route = routePlan.routes[index]!;
  const command = commandAuthority.commands[index]!;
  const dispatchRequestKey = `${input.fid.toString()}:${command.dispatchIdempotencyKey}`;
  const dispatch = receiptState.dispatchOrdinals.has(input.ordinal)
    ? receiptState.byRequestKey.get(dispatchRequestKey) ?? null
    : null;
  if (
    dispatch === null
    || !dispatchReceiptMatches(
      ctx,
      dispatch,
      input.fid,
      route,
      baseline.castleId,
      baseline.atlasId,
      registration.approvedAtMicros,
      registration.notAfterMicros,
    )
    || dispatch.assignmentId === undefined
    || dispatch.resourceKind === undefined
    || dispatch.siteId === undefined
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_DISPATCH_REQUIRED');
  const existingRecall = receiptState.byRequestKey.get(commandRequestKey(
    input.fid,
    command.recallIdempotencyKey,
  ));
  if (existingRecall !== undefined) return 'replayed';
  const assignment = ctx.db.workerAssignmentV1.workerId.find(route.workerId);
  const worker = ctx.db.castleWorkerV1.workerId.find(route.workerId);
  if (assignment === null) {
    if (
      worker === null
      || worker.status !== 'idle'
      || worker.revision <= dispatch.resultRevision
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
    return 'idle';
  }
  if (
    receiptState.laterUnrelatedAssignmentOrdinals.has(input.ordinal)
    || worker === null
    || assignment.assignmentId !== dispatch.assignmentId
    || !assignmentGraphIsCanonical(ctx, assignment, worker)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
  if (assignment.phase === 'returning') return 'returning';
  if (receiptRows.length + 1 > WORKER_IDEMPOTENCY_RECEIPTS_PER_FID) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_BOUND_EXCEEDED');
  }
  if (ctx.timestamp.microsSinceUnixEpoch < registration.notAfterMicros) {
    return recallCastleWorkerForExactCanaryAssignment(ctx, {
      fid: input.fid,
      castle: input.castle,
      workerId: route.workerId,
      recallIdempotencyKey: command.recallIdempotencyKey,
      expectedResourceKind: dispatch.resourceKind,
      expectedSiteId: dispatch.siteId,
      expectedAssignmentId: dispatch.assignmentId,
    });
  }
  recallExactCanaryAssignmentForRecoveryV2(ctx, {
    fid: input.fid,
    castleId: input.castle.castleId,
    workerId: route.workerId,
    recallIdempotencyKey: command.recallIdempotencyKey,
    resourceKind: dispatch.resourceKind,
    siteId: dispatch.siteId,
    assignmentId: dispatch.assignmentId,
  });
  return 'recalled';
}

/** Admin-only, read-only aggregate; it never settles or mutates player state. */
export function inspectProductionPlayerCanaryRecoveryStatusV1(
  ctx: WarpkeepReducerContext,
  input: ProductionPlayerCanaryRecoveryStatusInput,
): ProductionPlayerCanaryRecoveryStatus {
  validInput(input);
  if (requireStoredProductionPlayerCanaryBaselineV2(ctx, input.fid) === null) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  }
  if (
    requireStoredProductionPlayerCanaryApprovalRegistrationV2(ctx, input.fid)
      === null
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, input);
  const registration = requireProductionPlayerCanaryApprovalRegistrationV1(ctx, input);
  const routePlan = inspectProductionPlayerCanaryRoutePlan(ctx, input);
  const commandAuthority = productionPlayerCanaryCommandAuthorityV2({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
  });
  if (
    registration.reviewedAdmissionPlanDigest !== input.reviewedAdmissionPlanDigest
    || registration.serverBaselineCommitment !== baseline.baselineCommitment
    || registration.routeSetCommitment !== baseline.routeSetCommitment
    || registration.routeSetCommitment !== routePlan.routeSetCommitment
    || registration.commandKeyPolicyVersion !== commandAuthority.commandKeyPolicyVersion
    || registration.commandSetCommitment !== commandAuthority.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_AUTHORITY_INVALID');
  const authority: StoredCanaryAuthorityV2 = Object.freeze({
    baseline,
    registration,
    routePlan,
    commandAuthority,
  });

  const expectedKeys = new Set<string>();
  const receipts = new Map<string, WorkerReceipt>();
  let inspectedReceiptCount = 0;
  for (const receipt of ctx.db.workerCommandIdempotencyV1.byFid.filter(input.fid)) {
    inspectedReceiptCount += 1;
    if (inspectedReceiptCount > WORKER_IDEMPOTENCY_RECEIPTS_PER_FID) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_BOUND_EXCEEDED');
    }
    receipts.set(receipt.requestKey, receipt);
  }

  let dispatchReceiptCount = 0;
  let correlatedRecallReceiptCount = 0;
  let noOpRecallReceiptCount = 0;
  let unexpectedReceiptCount = 0;
  let exactPositionFenceCount = 0;
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const route = routePlan.routes[index]!;
    const command = commandAuthority.commands[index]!;
    const routeWorker = ctx.db.castleWorkerV1.workerId.find(route.workerId);
    const dispatchRequestKey = `${input.fid.toString()}:${command.dispatchIdempotencyKey}`;
    const recallRequestKey = `${input.fid.toString()}:${command.recallIdempotencyKey}`;
    expectedKeys.add(dispatchRequestKey);
    expectedKeys.add(recallRequestKey);
    const dispatch = receipts.get(dispatchRequestKey);
    const validDispatch = dispatch !== undefined
      && dispatchReceiptMatches(
        ctx,
        dispatch,
        input.fid,
        route,
        baseline.castleId,
        baseline.atlasId,
        registration.approvedAtMicros,
        registration.notAfterMicros,
      )
      && dispatch.createdAt.microsSinceUnixEpoch
        <= ctx.timestamp.microsSinceUnixEpoch
      && routeWorker !== null
      && dispatch.resultRevision <= routeWorker.revision;
    const validPositionFence = dispatch !== undefined
      && dispatchPositionFenceReceiptMatches(
        dispatch,
        input.fid,
        command.dispatchIdempotencyKey,
        route.workerId,
        registration.approvedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
        routeWorker?.revision ?? -1n,
      )
      && routeWorker !== null;
    if (validDispatch) dispatchReceiptCount += 1;
    else if (validPositionFence) exactPositionFenceCount += 1;
    else if (dispatch !== undefined) unexpectedReceiptCount += 1;
    const recall = receipts.get(recallRequestKey);
    if (recall !== undefined) {
      if (validDispatch && exactCorrelatedRecallReceiptMatches(
        recall,
        dispatch!,
        input.fid,
      ) && recall.createdAt.microsSinceUnixEpoch
        <= ctx.timestamp.microsSinceUnixEpoch
        && routeWorker !== null
        && recall.resultRevision <= routeWorker.revision) {
        correlatedRecallReceiptCount += 1;
      } else {
        unexpectedReceiptCount += 1;
      }
    }
  }
  const fenceRequestKey = commandRequestKey(
    input.fid,
    commandAuthority.recoveryFenceIdempotencyKey,
  );
  expectedKeys.add(fenceRequestKey);
  const fence = receipts.get(fenceRequestKey);
  let exactGlobalFenceCount = 0;
  if (fence !== undefined) {
    let snapshotMaximum: bigint | undefined;
    if (fence.assignmentId !== undefined) {
      try {
        snapshotMaximum = productionPlayerCanaryRecoverySnapshotMaximumRevisionV2(
          parseProductionPlayerCanaryRecoverySnapshotV2(fence.assignmentId),
        );
      } catch {
        snapshotMaximum = undefined;
      }
    }
    if (
      snapshotMaximum !== undefined
      && fence.resultRevision === snapshotMaximum
      &&
      workerCommandReceiptShapeIsValid(fence)
      && recoveryFenceReceiptMatches(
        fence,
        input.fid,
        commandAuthority,
        registration.approvedAtMicros,
        ctx.timestamp.microsSinceUnixEpoch,
        snapshotMaximum,
        fence.assignmentId!,
      )
    ) {
      // Reuse the existing no-op recovery bucket so the frozen admin ABI can
      // account for the deterministic global marker. Its nonzero value also
      // permanently excludes structural evidence after a recovery sweep.
      exactGlobalFenceCount = 1;
    } else {
      unexpectedReceiptCount += 1;
    }
  }
  for (const requestKey of receipts.keys()) {
    if (!expectedKeys.has(requestKey)) unexpectedReceiptCount += 1;
  }

  const roster = [...assertCastleWorkerRoster(ctx, baseline.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal);
  if (roster.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
  }
  let idleWorkerCount = 0;
  let outboundWorkerCount = 0;
  let gatheringWorkerCount = 0;
  let returningWorkerCount = 0;
  for (const worker of roster) {
    if (!castleWorkerPublicStateIsConsistent(worker)) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
    }
    if (worker.status === 'idle') idleWorkerCount += 1;
    else if (worker.status === 'outbound') outboundWorkerCount += 1;
    else if (worker.status === 'gathering') gatheringWorkerCount += 1;
    else if (worker.status === 'returning') returningWorkerCount += 1;
    else fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
  }
  let strictReceiptTopologyValid = false;
  let recoveryTopologyCompleted = false;
  if (receipts.size <= WORKER_IDEMPOTENCY_RECEIPTS_PER_FID) {
    try {
      const strictReceiptState = assertExpectedCanaryReceiptsV2(
        ctx,
        Object.freeze([...receipts.values()]),
        input.fid,
        authority,
        true,
        true,
      );
      const strictSweep = preflightProductionPlayerCanaryRecoverySweepV2(
        ctx,
        input.fid,
        authority,
        strictReceiptState,
      );
      strictReceiptTopologyValid = true;
      if (strictReceiptState.fenced) {
        recoveryTopologyCompleted = !strictSweep.plan.insertFence
          && strictSweep.plan.positionFenceOrdinals.length === 0
          && strictSweep.plan.mutationRecallOrdinals.length === 0;
      }
    } catch {
      strictReceiptTopologyValid = false;
      recoveryTopologyCompleted = false;
    }
  }
  if (recoveryTopologyCompleted) {
    noOpRecallReceiptCount += exactPositionFenceCount + exactGlobalFenceCount;
  } else {
    unexpectedReceiptCount += exactPositionFenceCount + exactGlobalFenceCount;
  }
  if (!strictReceiptTopologyValid) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID');
  }
  let assignmentCount = 0n;
  for (const _assignment of ctx.db.workerAssignmentV1.byFid.filter(input.fid)) {
    assignmentCount += 1n;
    if (assignmentCount > BigInt(CASTLE_WORKERS_PER_CASTLE)) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_GRAPH_BOUND_EXCEEDED');
    }
  }
  let occupationCount = 0n;
  for (const _occupation of ctx.db.workerNodeOccupationV1.byOriginCastle.filter(
    baseline.castleId,
  )) {
    occupationCount += 1n;
    if (occupationCount > BigInt(CASTLE_WORKERS_PER_CASTLE)) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_GRAPH_BOUND_EXCEEDED');
    }
  }
  let scheduleCount = 0n;
  for (const worker of roster) {
    for (const _schedule of ctx.db.workerAssignmentScheduleV1.byWorker.filter(
      worker.workerId,
    )) {
      scheduleCount += 1n;
      if (scheduleCount > BigInt(CASTLE_WORKERS_PER_CASTLE)) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_GRAPH_BOUND_EXCEEDED');
      }
    }
  }
  const terminalSafe = idleWorkerCount === CASTLE_WORKERS_PER_CASTLE
    && assignmentCount === 0n
    && occupationCount === 0n
    && scheduleCount === 0n;
  const structuralEvidenceCandidate = strictReceiptTopologyValid
    && productionPlayerCanaryStructuralEvidenceCandidate({
      terminalSafe,
      observedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
      notAfterMicros: registration.notAfterMicros,
      dispatchReceiptCount,
      correlatedRecallReceiptCount,
      noOpRecallReceiptCount,
      unexpectedReceiptCount,
    });
  const disposition = productionPlayerCanaryRecoveryDisposition({
    terminalSafe,
    structuralEvidenceCandidate,
    recoveryTopologyCompleted,
    outboundWorkerCount,
    gatheringWorkerCount,
    returningWorkerCount,
  });
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_RECOVERY_STATUS_PROFILE,
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: registration.routeSetCommitment,
    commandSetCommitment: registration.commandSetCommitment,
    approvalRegistrationCommitment: registration.approvalRegistrationCommitment,
    notAfterMicros: registration.notAfterMicros,
    observedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    dispatchReceiptCount,
    correlatedRecallReceiptCount,
    noOpRecallReceiptCount,
    unexpectedReceiptCount,
    idleWorkerCount,
    outboundWorkerCount,
    gatheringWorkerCount,
    returningWorkerCount,
    assignmentCount,
    occupationCount,
    scheduleCount,
    terminalSafe,
    structuralEvidenceCandidate,
    disposition,
  });
}

export function productionPlayerCanaryRecoveryErrorCode(error: unknown): string | undefined {
  return productionPlayerCanaryBaselineErrorCode(error)
    ?? productionPlayerCanaryApprovalErrorCode(error)
    ?? productionPlayerCanaryRoutePolicyErrorCode(error)
    ?? productionPlayerCanaryRecoveryPolicyErrorCode(error)
    ?? (error instanceof ProductionPlayerCanaryRecoveryError ? error.code : undefined);
}
