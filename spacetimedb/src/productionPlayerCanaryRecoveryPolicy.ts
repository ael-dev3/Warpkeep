import {
  CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
  CASTLE_WORKERS_PER_CASTLE,
} from './castleWorkerPolicy';
import type { ProductionPlayerCanaryRouteV1 } from './productionPlayerCanaryRoutePolicy';

const RESERVED_COMMAND_V1_PREFIX = 'pc1-';
const RESERVED_COMMAND_V2_PREFIX = 'pc2-';
const RECOVERY_SNAPSHOT_PREFIX = 'pc2-f00-s1|';
const U32_MAXIMUM = 0xffff_ffff;
const U64_MAXIMUM = (1n << 64n) - 1n;
const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export type ProductionPlayerCanaryRecoverySnapshotStatusV2 =
  | 'i'
  | 'o'
  | 'g'
  | 'r';

export type ProductionPlayerCanaryRecoverySnapshotRouteV2 = Readonly<{
  workerRevision: bigint;
  timelineRevision: number;
  status: ProductionPlayerCanaryRecoverySnapshotStatusV2;
  assignmentId?: string;
}>;

function canonicalUnsignedDecimal(value: string): boolean {
  return /^(?:0|[1-9][0-9]*)$/u.test(value);
}

function snapshotRouteBody(
  route: ProductionPlayerCanaryRecoverySnapshotRouteV2,
): string {
  if (
    route.workerRevision < 0n
    || route.workerRevision > U64_MAXIMUM
    || !Number.isSafeInteger(route.timelineRevision)
    || route.timelineRevision < 0
    || route.timelineRevision > U32_MAXIMUM
    || !['i', 'o', 'g', 'r'].includes(route.status)
    || (
      route.status === 'i'
        ? route.assignmentId !== undefined
        : route.assignmentId === undefined || !UUID_V7.test(route.assignmentId)
    )
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
  return [
    route.status,
    route.workerRevision.toString(),
    route.timelineRevision.toString(),
    route.assignmentId ?? '',
  ].join('|');
}

/**
 * Canonical, versioned, length-framed f00 payload in fixed route order. UUID-v7
 * assignment identities are the only variable-length values and remain
 * bounded to the exact 36-byte lowercase form produced by the runtime.
 */
export function encodeProductionPlayerCanaryRecoverySnapshotV2(
  routes: readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[],
): string {
  if (routes.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
  }
  return RECOVERY_SNAPSHOT_PREFIX + routes.map(route => {
    const body = snapshotRouteBody(route);
    return `${body.length.toString()}:${body}`;
  }).join('');
}

export function parseProductionPlayerCanaryRecoverySnapshotV2(
  payload: string,
): readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[] {
  if (
    typeof payload !== 'string'
    || payload.length < RECOVERY_SNAPSHOT_PREFIX.length
    || payload.length > 384
    || !payload.startsWith(RECOVERY_SNAPSHOT_PREFIX)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
  const routes: ProductionPlayerCanaryRecoverySnapshotRouteV2[] = [];
  let cursor = RECOVERY_SNAPSHOT_PREFIX.length;
  while (routes.length < CASTLE_WORKERS_PER_CASTLE) {
    const separator = payload.indexOf(':', cursor);
    if (separator < cursor) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    const lengthText = payload.slice(cursor, separator);
    if (!canonicalUnsignedDecimal(lengthText)) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    }
    const length = Number(lengthText);
    if (!Number.isSafeInteger(length) || length < 5 || length > 80) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    }
    const bodyStart = separator + 1;
    const bodyEnd = bodyStart + length;
    if (bodyEnd > payload.length) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    }
    const fields = payload.slice(bodyStart, bodyEnd).split('|');
    if (fields.length !== 4) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    const [statusText, workerText, timelineText, assignmentText] = fields;
    if (
      !['i', 'o', 'g', 'r'].includes(statusText!)
      || !canonicalUnsignedDecimal(workerText!)
      || !canonicalUnsignedDecimal(timelineText!)
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    let workerRevision: bigint;
    try {
      workerRevision = BigInt(workerText!);
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
    }
    const timelineRevision = Number(timelineText);
    const status = statusText as ProductionPlayerCanaryRecoverySnapshotStatusV2;
    const route = assignmentText === ''
      ? Object.freeze({ workerRevision, timelineRevision, status })
      : Object.freeze({
        workerRevision,
        timelineRevision,
        status,
        assignmentId: assignmentText,
      });
    // Reusing the encoder's scalar validation keeps parse and encode exact.
    snapshotRouteBody(route);
    routes.push(route);
    cursor = bodyEnd;
  }
  const frozen = Object.freeze(routes);
  if (
    cursor !== payload.length
    || encodeProductionPlayerCanaryRecoverySnapshotV2(frozen) !== payload
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
  return frozen;
}

export function productionPlayerCanaryRecoverySnapshotMaximumRevisionV2(
  routes: readonly ProductionPlayerCanaryRecoverySnapshotRouteV2[],
): bigint {
  if (routes.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_SNAPSHOT_INVALID');
  }
  return routes.reduce((highest, route) => {
    snapshotRouteBody(route);
    return route.workerRevision > highest ? route.workerRevision : highest;
  }, 0n);
}

function lifecycleStepsFromIdle(
  status: ProductionPlayerCanaryRecoverySnapshotStatusV2,
  explicitReturn: boolean,
): number | undefined {
  if (status === 'i') return 0;
  if (status === 'o') return explicitReturn ? undefined : 1;
  if (status === 'g') return explicitReturn ? undefined : 2;
  return explicitReturn ? 2 : 3;
}

function lifecycleStepsToIdle(
  status: ProductionPlayerCanaryRecoverySnapshotStatusV2,
  explicitReturn: boolean,
): number {
  if (status === 'i') return 0;
  if (status === 'o') return explicitReturn ? 2 : 3;
  if (status === 'g') return 2;
  return 1;
}

function lifecycleStepsWithinAssignment(
  from: ProductionPlayerCanaryRecoverySnapshotStatusV2,
  to: ProductionPlayerCanaryRecoverySnapshotStatusV2,
  explicitReturn: boolean,
): number | undefined {
  if (from === 'i') return undefined;
  if (to === 'i') return lifecycleStepsToIdle(from, explicitReturn);
  if (from === to) return 0;
  if (from === 'o' && to === 'g' && !explicitReturn) return 1;
  if (to === 'r') {
    if (from === 'o') return explicitReturn ? 1 : 2;
    if (from === 'g') return 1;
  }
  return undefined;
}

/**
 * Proves exact worker/timeline lifecycle reachability from the durable f00
 * route snapshot. Every worker transition increments both counters once.
 */
export function productionPlayerCanaryRecoverySnapshotTransitionIsValidV2(
  input: Readonly<{
    snapshot: ProductionPlayerCanaryRecoverySnapshotRouteV2;
    currentStatus: ProductionPlayerCanaryRecoverySnapshotStatusV2;
    currentAssignmentId?: string;
    currentWorkerRevision: bigint;
    currentTimelineRevision: number;
    snapshotAssignmentCompletedExplicitly: boolean;
    currentAssignmentReturnsExplicitly: boolean;
  }>,
): boolean {
  const { snapshot } = input;
  try {
    snapshotRouteBody(snapshot);
  } catch {
    return false;
  }
  if (
    input.currentWorkerRevision < snapshot.workerRevision
    || !Number.isSafeInteger(input.currentTimelineRevision)
    || input.currentTimelineRevision < snapshot.timelineRevision
    || input.currentTimelineRevision > U32_MAXIMUM
    || (
      input.currentStatus === 'i'
        ? input.currentAssignmentId !== undefined
        : input.currentAssignmentId === undefined
          || !UUID_V7.test(input.currentAssignmentId)
    )
  ) return false;
  let steps: number | undefined;
  if (snapshot.assignmentId === input.currentAssignmentId) {
    steps = snapshot.status === 'i'
      ? input.currentStatus === 'i' ? 0 : undefined
      : lifecycleStepsWithinAssignment(
        snapshot.status,
        input.currentStatus,
        input.currentAssignmentReturnsExplicitly,
      );
  } else {
    const completeSnapshot = lifecycleStepsToIdle(
      snapshot.status,
      input.snapshotAssignmentCompletedExplicitly,
    );
    const beginCurrent = lifecycleStepsFromIdle(
      input.currentStatus,
      input.currentAssignmentReturnsExplicitly,
    );
    steps = beginCurrent === undefined ? undefined : completeSnapshot + beginCurrent;
  }
  return steps !== undefined
    && input.currentWorkerRevision === snapshot.workerRevision + BigInt(steps)
    && input.currentTimelineRevision === snapshot.timelineRevision + steps;
}

export class ProductionPlayerCanaryRecoveryPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryRecoveryPolicyError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryRecoveryPolicyError(code);
}

export type ProductionPlayerCanaryFenceReceiptV2 = Readonly<{
  requestKey: string;
  fid: bigint;
  commandKind: string;
  workerId: string | undefined;
  resourceKind: string | undefined;
  siteId: string | undefined;
  assignmentId: string | undefined;
  resultRevision: bigint;
  createdAt: Readonly<{ microsSinceUnixEpoch: bigint }>;
}>;

function exactFenceShape(
  receipt: ProductionPlayerCanaryFenceReceiptV2,
  fid: bigint,
  requestKey: string,
  commandKind: 'recall' | 'recall-all',
  workerId: string | undefined,
  assignmentId: string | undefined,
  approvedAtMicros: bigint,
  observedAtMicros: bigint,
  maximumResultRevision: bigint,
): boolean {
  return receipt.requestKey === requestKey
    && receipt.fid === fid
    && receipt.commandKind === commandKind
    && receipt.workerId === workerId
    && receipt.resourceKind === undefined
    && receipt.siteId === undefined
    && receipt.assignmentId === assignmentId
    && receipt.resultRevision >= 0n
    && receipt.resultRevision <= maximumResultRevision
    && receipt.createdAt.microsSinceUnixEpoch >= approvedAtMicros
    && receipt.createdAt.microsSinceUnixEpoch <= observedAtMicros;
}

export function productionPlayerCanaryDispatchPositionFenceReceiptMatchesV2(
  receipt: ProductionPlayerCanaryFenceReceiptV2,
  input: Readonly<{
    fid: bigint;
    requestKey: string;
    workerId: string;
    approvedAtMicros: bigint;
    observedAtMicros: bigint;
    maximumResultRevision: bigint;
  }>,
): boolean {
  return exactFenceShape(
    receipt,
    input.fid,
    input.requestKey,
    'recall',
    input.workerId,
    undefined,
    input.approvedAtMicros,
    input.observedAtMicros,
    input.maximumResultRevision,
  );
}

export function productionPlayerCanaryRecoveryFenceReceiptMatchesV2(
  receipt: ProductionPlayerCanaryFenceReceiptV2,
  input: Readonly<{
    fid: bigint;
    requestKey: string;
    approvedAtMicros: bigint;
    observedAtMicros: bigint;
    maximumResultRevision: bigint;
    snapshotPayload: string;
  }>,
): boolean {
  return exactFenceShape(
    receipt,
    input.fid,
    input.requestKey,
    'recall-all',
    undefined,
    input.snapshotPayload,
    input.approvedAtMicros,
    input.observedAtMicros,
    input.maximumResultRevision,
  );
}

export function productionPlayerCanaryRecoveryPolicyErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof ProductionPlayerCanaryRecoveryPolicyError
    ? error.code
    : undefined;
}

export function productionPlayerCanaryLaterDispatchPositionOrderIsValidV2(
  input: Readonly<{
    genericCreatedAtMicros: bigint;
    genericResultRevision: bigint;
    positionCreatedAtMicros: bigint;
    positionResultRevision: bigint;
  }>,
): boolean {
  if (
    input.genericCreatedAtMicros < 0n
    || input.genericResultRevision < 0n
    || input.positionCreatedAtMicros < 0n
    || input.positionResultRevision < 0n
  ) return false;
  return input.genericCreatedAtMicros > input.positionCreatedAtMicros
    ? input.genericResultRevision > input.positionResultRevision
    : input.positionResultRevision >= input.genericResultRevision;
}

/**
 * Bind a tolerated post-cutoff generic receipt to the exact current worker
 * lifecycle revision. The roster-wide f00 revision is deliberately excluded:
 * it is not a worker-local counter and is used only as a temporal anchor.
 */
export function productionPlayerCanaryLaterWorkerRevisionIsExactV2(
  input: Readonly<{
    phase: string;
    dispatchResultRevision: bigint;
    recallResultRevision?: bigint;
    workerRevision: bigint;
    naturalExpiryReturn: boolean;
  }>,
): boolean {
  if (
    input.dispatchResultRevision < 1n
    || input.workerRevision < 0n
    || input.recallResultRevision !== undefined
      && input.recallResultRevision < 0n
  ) return false;
  if (input.phase === 'outbound') {
    return input.recallResultRevision === undefined
      && input.dispatchResultRevision === input.workerRevision;
  }
  if (input.phase === 'gathering') {
    return input.recallResultRevision === undefined
      && input.dispatchResultRevision + 1n === input.workerRevision;
  }
  if (input.phase !== 'returning') return false;
  if (input.recallResultRevision !== undefined) {
    return (
      input.recallResultRevision === input.dispatchResultRevision + 1n
      || input.recallResultRevision === input.dispatchResultRevision + 2n
    )
      && input.recallResultRevision === input.workerRevision;
  }
  return input.naturalExpiryReturn
    && input.dispatchResultRevision + 2n === input.workerRevision;
}

export function productionPlayerCanaryOriginalWorkerRevisionIsExactV2(
  input: Readonly<{
    phase: string;
    dispatchResultRevision: bigint;
    recallResultRevision?: bigint;
    workerRevision: bigint;
    naturalExpiryReturn: boolean;
  }>,
): boolean {
  if (input.phase !== 'idle') {
    return productionPlayerCanaryLaterWorkerRevisionIsExactV2(input);
  }
  if (
    input.dispatchResultRevision < 1n
    || input.workerRevision < 0n
    || input.recallResultRevision !== undefined
      && input.recallResultRevision < 0n
  ) return false;
  return input.recallResultRevision === undefined
    ? input.dispatchResultRevision + 3n === input.workerRevision
    : (
      input.recallResultRevision === input.dispatchResultRevision + 1n
      || input.recallResultRevision === input.dispatchResultRevision + 2n
    )
      && input.recallResultRevision + 1n === input.workerRevision;
}

/** Exact no-intervening-journey revision lineage into one current generic row. */
export function productionPlayerCanaryLaterLineageIsExactV2(
  input: Readonly<{
    genericCreatedAtMicros: bigint;
    genericDispatchResultRevision: bigint;
    originalDispatchResultRevision?: bigint;
    originalRecallResultRevision?: bigint;
    positionCreatedAtMicros?: bigint;
    positionResultRevision?: bigint;
    freshUnfencedPosition: boolean;
    genericWasPresentInSnapshot?: boolean;
  }>,
): boolean {
  if (
    input.genericCreatedAtMicros < 0n
    || input.genericDispatchResultRevision < 1n
  ) return false;
  if (input.originalDispatchResultRevision !== undefined) {
    if (input.originalDispatchResultRevision < 1n) return false;
    return input.originalRecallResultRevision === undefined
      ? input.genericDispatchResultRevision
        === input.originalDispatchResultRevision + 4n
      : (
        input.originalRecallResultRevision
          === input.originalDispatchResultRevision + 1n
        || input.originalRecallResultRevision
          === input.originalDispatchResultRevision + 2n
      )
        && input.genericDispatchResultRevision
          === input.originalRecallResultRevision + 2n;
  }
  if (
    input.positionCreatedAtMicros !== undefined
    || input.positionResultRevision !== undefined
  ) {
    if (
      input.positionCreatedAtMicros === undefined
      || input.positionResultRevision === undefined
      || input.positionCreatedAtMicros < 0n
      || input.positionResultRevision < 0n
    ) return false;
    return input.genericWasPresentInSnapshot === true
      ? input.genericDispatchResultRevision === 1n
        && input.genericCreatedAtMicros <= input.positionCreatedAtMicros
        && input.positionResultRevision >= input.genericDispatchResultRevision
      : input.genericCreatedAtMicros >= input.positionCreatedAtMicros
        && input.genericDispatchResultRevision === input.positionResultRevision + 1n;
  }
  return input.freshUnfencedPosition
    && input.genericDispatchResultRevision === 1n;
}

export type ProductionPlayerCanaryRecoveryDisposition =
  | 'recall-required'
  | 'return-in-progress'
  | 'terminal-evidence-candidate'
  | 'terminal-evidence-impossible';

export function productionPlayerCanaryStructuralEvidenceCandidate(input: Readonly<{
  terminalSafe: boolean;
  observedAtMicros: bigint;
  notAfterMicros: bigint;
  dispatchReceiptCount: number;
  correlatedRecallReceiptCount: number;
  noOpRecallReceiptCount: number;
  unexpectedReceiptCount: number;
}>): boolean {
  return input.terminalSafe
    && input.observedAtMicros < input.notAfterMicros
    && input.dispatchReceiptCount === 4
    && input.correlatedRecallReceiptCount === 4
    && input.noOpRecallReceiptCount === 0
    && input.unexpectedReceiptCount === 0;
}

export function productionPlayerCanaryRecoveryDisposition(input: Readonly<{
  terminalSafe: boolean;
  structuralEvidenceCandidate: boolean;
  recoveryTopologyCompleted: boolean;
  outboundWorkerCount: number;
  gatheringWorkerCount: number;
  returningWorkerCount: number;
}>): ProductionPlayerCanaryRecoveryDisposition {
  if (input.structuralEvidenceCandidate) return 'terminal-evidence-candidate';
  if (input.recoveryTopologyCompleted) return 'terminal-evidence-impossible';
  if (input.outboundWorkerCount > 0 || input.gatheringWorkerCount > 0) {
    return 'recall-required';
  }
  if (input.returningWorkerCount > 0) return 'return-in-progress';
  return 'terminal-evidence-impossible';
}

export function productionPlayerCanaryDispatchCommandOrdinalV2(
  commands: readonly Readonly<{ dispatchIdempotencyKey: string }>[],
  idempotencyKey: string,
): number | null {
  if (idempotencyKey.startsWith(RESERVED_COMMAND_V1_PREFIX)) {
    fail('PRODUCTION_PLAYER_CANARY_COMMAND_KEY_RESERVED');
  }
  if (!idempotencyKey.startsWith(RESERVED_COMMAND_V2_PREFIX)) return null;
  const index = commands.findIndex(
    command => command.dispatchIdempotencyKey === idempotencyKey,
  );
  if (index < 0) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TUPLE_INVALID');
  return index + 1;
}

export function assertProductionPlayerCanaryDispatchTupleV2(
  route: ProductionPlayerCanaryRouteV1,
  ordinal: number,
  input: Readonly<{
    workerId: string;
    resourceKind: string;
    locationId: string;
    expectedRevision: bigint;
  }>,
): void {
  if (
    route.ordinal !== ordinal
    || route.workerId !== input.workerId
    || route.resourceKind !== input.resourceKind
    || route.locationId !== input.locationId
    || route.atlasRevision !== input.expectedRevision
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TUPLE_INVALID');
}

export type ProductionPlayerCanaryDispatchDispositionV2 = 'new' | 'replay';

/** Pure NEW-versus-replay decision used after exact authority/receipt audit. */
export function productionPlayerCanaryDispatchDispositionV2(input: Readonly<{
  observedAtMicros: bigint;
  approvedAtMicros: bigint;
  notAfterMicros: bigint;
  plannedReturnsAtMicros: bigint | undefined;
  existingDispatch: boolean;
  dispatchReceiptCount: number;
  receiptCount: number;
  fenced: boolean;
}>): ProductionPlayerCanaryDispatchDispositionV2 {
  if (input.fenced) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_FENCED');
  if (
    !Number.isSafeInteger(input.dispatchReceiptCount)
    || input.dispatchReceiptCount < 0
    || !Number.isSafeInteger(input.receiptCount)
    || input.receiptCount < input.dispatchReceiptCount
    || (input.existingDispatch && input.dispatchReceiptCount < 1)
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
  if (input.existingDispatch) return 'replay';
  if (input.dispatchReceiptCount === 0 && input.receiptCount !== 0) {
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_RECEIPTS_NOT_PRISTINE');
  }
  if (
    input.observedAtMicros < input.approvedAtMicros
    || input.observedAtMicros >= input.notAfterMicros
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_AUTHORITY_UNAVAILABLE');
  if (
    input.plannedReturnsAtMicros === undefined
    || input.plannedReturnsAtMicros >= input.notAfterMicros
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_TIMELINE_CUTOFF');
  return 'new';
}

export type ProductionPlayerCanaryRecoverySweepOrdinalStateV2 = Readonly<{
  ordinal: number;
  rosterValid: boolean;
  dispatchPresent: boolean;
  positionFenced: boolean;
  laterUnrelatedAssignment: boolean;
  unrelatedAssignmentCanonical: boolean;
  recallPresent: boolean;
  assignmentPresent: boolean;
  workerIdle: boolean;
  assignmentExact: boolean;
  assignmentReturning: boolean;
}>;

export type ProductionPlayerCanaryContainmentReturnPlanV2 = Readonly<{
  returnStartedAtMicros: bigint;
  returnsAtMicros: bigint;
  returnStartProgressBasisPoints: number;
  settledThroughMicros: bigint;
  timelineRevision: number;
  workerRevision: bigint;
}>;

/** Pure state transition used by both ordinal-zero and delayed recovery. */
export function planProductionPlayerCanaryContainmentReturnV2(input: Readonly<{
  observedAtMicros: bigint;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedAmount: bigint;
  materializedAmount: bigint;
  routeSteps: number;
  timelineRevision: number;
  workerRevision: bigint;
}>): ProductionPlayerCanaryContainmentReturnPlanV2 {
  const u64Maximum = (1n << 64n) - 1n;
  if (
    input.observedAtMicros < input.startedAtMicros
    || input.observedAtMicros > u64Maximum
    || !Number.isSafeInteger(input.routeSteps)
    || input.routeSteps < 1
    || !Number.isSafeInteger(input.timelineRevision)
    || input.timelineRevision < 0
    || input.timelineRevision >= 0xffff_ffff
    || input.workerRevision < 0n
    || input.workerRevision >= u64Maximum
    || input.accruedAmount !== input.materializedAmount
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_CONTAINMENT_INVALID');
  const travelMicros = BigInt(input.routeSteps)
    * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
  if (
    input.arrivesAtMicros - input.startedAtMicros !== travelMicros
    || input.gatheringEndsAtMicros <= input.arrivesAtMicros
  ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_CONTAINMENT_INVALID');
  const returnStartedAtMicros = input.observedAtMicros < input.gatheringEndsAtMicros
    ? input.observedAtMicros
    : input.gatheringEndsAtMicros;
  const progress = returnStartedAtMicros < input.arrivesAtMicros
    ? Number(
      ((returnStartedAtMicros - input.startedAtMicros) * 10_000n)
      / travelMicros,
    )
    : 10_000;
  const remainingTravelMicros = (travelMicros * BigInt(progress)) / 10_000n;
  if (returnStartedAtMicros > u64Maximum - remainingTravelMicros) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_CONTAINMENT_INVALID');
  }
  const settledThroughMicros = returnStartedAtMicros < input.arrivesAtMicros
    ? input.arrivesAtMicros
    : returnStartedAtMicros;
  if (settledThroughMicros < input.settledThroughMicros) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_CONTAINMENT_INVALID');
  }
  return Object.freeze({
    returnStartedAtMicros,
    returnsAtMicros: returnStartedAtMicros + remainingTravelMicros,
    returnStartProgressBasisPoints: progress,
    settledThroughMicros,
    timelineRevision: input.timelineRevision + 1,
    workerRevision: input.workerRevision + 1n,
  });
}

export type ProductionPlayerCanaryRecoverySweepPlanV2 = Readonly<{
  insertFence: boolean;
  positionFenceOrdinals: readonly number[];
  recallOrdinals: readonly number[];
  mutationRecallOrdinals: readonly number[];
}>;

/** Pure all-four preflight; callers perform no writes until this succeeds. */
export function planProductionPlayerCanaryRecoverySweepV2(
  states: readonly ProductionPlayerCanaryRecoverySweepOrdinalStateV2[],
  fenced: boolean,
): ProductionPlayerCanaryRecoverySweepPlanV2 {
  if (states.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
  }
  const positionFenceOrdinals: number[] = [];
  const recallOrdinals: number[] = [];
  const mutationRecallOrdinals: number[] = [];
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const state = states[index]!;
    if (state.ordinal !== index + 1 || !state.rosterValid) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ROSTER_INVALID');
    }
    if (state.dispatchPresent && state.positionFenced) {
      fail('PRODUCTION_PLAYER_CANARY_RECOVERY_RECEIPT_INVALID');
    }
    if (state.laterUnrelatedAssignment) {
      if (
        !state.unrelatedAssignmentCanonical
        || !state.assignmentPresent
        || state.workerIdle
      ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
      if (!state.dispatchPresent && !state.positionFenced) {
        if (fenced) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID');
        positionFenceOrdinals.push(state.ordinal);
      }
      continue;
    }
    if (!state.dispatchPresent) {
      if (state.recallPresent || state.assignmentPresent || !state.workerIdle) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
      }
      if (!state.positionFenced) {
        if (fenced) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID');
        positionFenceOrdinals.push(state.ordinal);
      }
      continue;
    }
    if (!state.assignmentPresent) {
      if (!state.workerIdle) {
        fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
      }
      recallOrdinals.push(state.ordinal);
      continue;
    }
    if (
      !state.assignmentExact
      || (state.recallPresent && !state.assignmentReturning)
    ) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_ASSIGNMENT_INVALID');
    recallOrdinals.push(state.ordinal);
    if (!state.recallPresent && !state.assignmentReturning) {
      if (fenced) fail('PRODUCTION_PLAYER_CANARY_RECOVERY_REPLAY_INVALID');
      mutationRecallOrdinals.push(state.ordinal);
    }
  }
  return Object.freeze({
    insertFence: !fenced,
    positionFenceOrdinals: Object.freeze(positionFenceOrdinals),
    recallOrdinals: Object.freeze(fenced ? [] : recallOrdinals),
    mutationRecallOrdinals: Object.freeze(fenced ? [] : mutationRecallOrdinals),
  });
}
