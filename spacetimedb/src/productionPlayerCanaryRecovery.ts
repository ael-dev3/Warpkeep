import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import { workerCommandReceiptShapeIsValid } from './castleWorkerCommandPolicy';
import { CASTLE_WORKERS_PER_CASTLE } from './castleWorkerPolicy';
import {
  greaterRealmWorkerDispatchFingerprintV2,
  parseGreaterRealmWorkerDispatchReceiptKindV2,
} from './greaterRealmWorkerPolicy';
import {
  assertCastleWorkerRoster,
  castleWorkerPublicStateIsConsistent,
} from './castleWorkerRoster';
import {
  recallCastleWorkerForExactCanaryAssignment,
} from './castleWorkerAuthority';
import {
  requireProductionPlayerCanaryApprovalRegistrationV1,
  productionPlayerCanaryApprovalErrorCode,
} from './productionPlayerCanaryApproval';
import {
  requireProductionPlayerCanaryBaselineRow,
  productionPlayerCanaryBaselineErrorCode,
} from './productionPlayerCanaryBaseline';
import {
  inspectProductionPlayerCanaryRoutePlan,
} from './productionPlayerCanaryBaseline';
import {
  productionPlayerCanaryCommandAuthorityV1,
  productionPlayerCanaryRoutePolicyErrorCode,
} from './productionPlayerCanaryRoutePolicy';
import {
  productionPlayerCanaryRecoveryDisposition,
  productionPlayerCanaryStructuralEvidenceCandidate,
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
const MAXIMUM_RECEIPTS = 128;

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
  receipt: WorkerReceipt,
  fid: bigint,
  route: Readonly<{
    workerId: string;
    resourceKind: string;
    locationId: string;
    atlasRevision: bigint;
    nodeCount: number;
  }>,
  castleId: bigint,
  approvedAtMicros: bigint,
  notAfterMicros: bigint,
): boolean {
  if (
    receipt.fid !== fid
    || !workerCommandReceiptShapeIsValid(receipt)
    || receipt.workerId !== route.workerId
    || receipt.resourceKind !== route.resourceKind
    || receipt.assignmentId === undefined
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
    const metadata = parseGreaterRealmWorkerDispatchReceiptKindV2(receipt.commandKind);
    return metadata.expectedRevision === route.atlasRevision
      && metadata.nodeCount === route.nodeCount
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

function noOpRecallReceiptMatches(
  receipt: WorkerReceipt,
  fid: bigint,
  workerId: string,
): boolean {
  return receipt.fid === fid
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind === 'recall'
    && receipt.workerId === workerId
    && receipt.resourceKind === undefined
    && receipt.siteId === undefined
    && receipt.assignmentId === undefined;
}

function correlatedRecallReceiptMatches(
  receipt: WorkerReceipt,
  dispatch: WorkerReceipt,
  fid: bigint,
  notAfterMicros: bigint,
): boolean {
  return receipt.fid === fid
    && workerCommandReceiptShapeIsValid(receipt)
    && receipt.commandKind === 'recall'
    && receipt.workerId === dispatch.workerId
    && receipt.resourceKind === dispatch.resourceKind
    && receipt.siteId === dispatch.siteId
    && receipt.assignmentId === dispatch.assignmentId
    && receipt.createdAt.microsSinceUnixEpoch
      > dispatch.createdAt.microsSinceUnixEpoch
    && receipt.createdAt.microsSinceUnixEpoch < notAfterMicros;
}

/**
 * Caller-authenticated, atomic conditional recall for one reviewed canary
 * ordinal. No route, key, FID, assignment, or receipt identity is accepted
 * from the browser; each is derived and correlated inside this transaction.
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
): 'idle' | 'returning' | 'recalled' | 'replayed' {
  validInput(input);
  if (
    !Number.isSafeInteger(input.ordinal)
    || input.ordinal < 1
    || input.ordinal > CASTLE_WORKERS_PER_CASTLE
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_INPUT_INVALID');
  const baselineInput = Object.freeze({
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
  });
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, baselineInput);
  const registration = requireProductionPlayerCanaryApprovalRegistrationV1(
    ctx,
    baselineInput,
  );
  const routePlan = inspectProductionPlayerCanaryRoutePlan(ctx, baselineInput);
  const commandAuthority = productionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: input.evidenceNonce,
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
  const index = input.ordinal - 1;
  const route = routePlan.routes[index]!;
  const command = commandAuthority.commands[index]!;
  const dispatchRequestKey = `${input.fid.toString()}:${command.dispatchIdempotencyKey}`;
  const dispatch = ctx.db.workerCommandIdempotencyV1.requestKey.find(
    dispatchRequestKey,
  );
  if (
    dispatch === null
    || !dispatchReceiptMatches(
      dispatch,
      input.fid,
      route,
      baseline.castleId,
      registration.approvedAtMicros,
      registration.notAfterMicros,
    )
    || dispatch.assignmentId === undefined
    || dispatch.resourceKind === undefined
    || dispatch.siteId === undefined
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_DISPATCH_REQUIRED');
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

/** Admin-only, read-only aggregate; it never settles or mutates player state. */
export function inspectProductionPlayerCanaryRecoveryStatusV1(
  ctx: WarpkeepReducerContext,
  input: ProductionPlayerCanaryRecoveryStatusInput,
): ProductionPlayerCanaryRecoveryStatus {
  validInput(input);
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, input);
  const registration = requireProductionPlayerCanaryApprovalRegistrationV1(ctx, input);
  const routePlan = inspectProductionPlayerCanaryRoutePlan(ctx, input);
  const commandAuthority = productionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: input.evidenceNonce,
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

  const expectedKeys = new Set<string>();
  const receipts = new Map<string, WorkerReceipt>();
  let inspectedReceiptCount = 0;
  for (const receipt of ctx.db.workerCommandIdempotencyV1.byFid.filter(input.fid)) {
    inspectedReceiptCount += 1;
    if (inspectedReceiptCount > MAXIMUM_RECEIPTS) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_BOUND_EXCEEDED');
    }
    receipts.set(receipt.requestKey, receipt);
  }

  let dispatchReceiptCount = 0;
  let correlatedRecallReceiptCount = 0;
  let noOpRecallReceiptCount = 0;
  let unexpectedReceiptCount = 0;
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const route = routePlan.routes[index]!;
    const command = commandAuthority.commands[index]!;
    const dispatchRequestKey = `${input.fid.toString()}:${command.dispatchIdempotencyKey}`;
    const recallRequestKey = `${input.fid.toString()}:${command.recallIdempotencyKey}`;
    expectedKeys.add(dispatchRequestKey);
    expectedKeys.add(recallRequestKey);
    const dispatch = receipts.get(dispatchRequestKey);
    const validDispatch = dispatch !== undefined
      && dispatchReceiptMatches(
        dispatch,
        input.fid,
        route,
        baseline.castleId,
        registration.approvedAtMicros,
        registration.notAfterMicros,
      );
    if (validDispatch) dispatchReceiptCount += 1;
    else if (dispatch !== undefined) unexpectedReceiptCount += 1;
    const recall = receipts.get(recallRequestKey);
    if (recall !== undefined) {
      if (validDispatch && correlatedRecallReceiptMatches(
        recall,
        dispatch!,
        input.fid,
        registration.notAfterMicros,
      )) {
        correlatedRecallReceiptCount += 1;
      } else if (noOpRecallReceiptMatches(recall, input.fid, route.workerId)) {
        noOpRecallReceiptCount += 1;
      } else {
        unexpectedReceiptCount += 1;
      }
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
  const structuralEvidenceCandidate =
    productionPlayerCanaryStructuralEvidenceCandidate({
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
    ?? (error instanceof ProductionPlayerCanaryRecoveryError ? error.code : undefined);
}
