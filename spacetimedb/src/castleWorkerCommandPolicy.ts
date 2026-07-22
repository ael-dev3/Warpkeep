import { assertWorkerCommandKey } from './castleWorkerPolicy';

export type WorkerCommandReceiptView = Readonly<{
  requestKey: string;
  fid: bigint;
  workerId: string | undefined;
  commandKind: string;
  resourceKind: string | undefined;
  siteId: string | undefined;
  assignmentId: string | undefined;
  resultRevision: bigint;
}>;

export type WorkerRecallCorrelation = Readonly<{
  resourceKind: string;
  siteId: string;
  assignmentId: string;
}>;

export function workerCastleOwnershipMatches(input: Readonly<{
  fid: bigint;
  castleId: bigint;
  castleOwnerFid: bigint | undefined;
  accountFid: bigint | undefined;
  accountCastleId: bigint | undefined;
}>): boolean {
  return input.castleOwnerFid === input.fid
    && input.accountFid === input.fid
    && input.accountCastleId === input.castleId;
}

/** Consume no more than maximum plus the one row needed to prove overflow. */
export function takeBoundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
): Readonly<{ rows: readonly Row[]; overflow: boolean }> {
  if (!Number.isSafeInteger(maximum) || maximum < 0) {
    throw new Error('WORKER_BOUND_INVALID');
  }
  const bounded: Row[] = [];
  for (const row of rows) {
    if (bounded.length >= maximum) {
      return Object.freeze({ rows: Object.freeze(bounded), overflow: true });
    }
    bounded.push(row);
  }
  return Object.freeze({ rows: Object.freeze(bounded), overflow: false });
}

export function workerCommandReceiptShapeIsValid(receipt: WorkerCommandReceiptView): boolean {
  const separator = receipt.requestKey.indexOf(':');
  if (
    separator <= 0
    || receipt.requestKey.slice(0, separator) !== receipt.fid.toString()
    || receipt.resultRevision < 0n
  ) return false;
  try {
    assertWorkerCommandKey(receipt.requestKey.slice(separator + 1));
  } catch {
    return false;
  }
  const correlated = receipt.resourceKind !== undefined
    && ['gold', 'food', 'wood', 'stone'].includes(receipt.resourceKind)
    && receipt.siteId !== undefined
    && receipt.siteId.length > 0
    && receipt.assignmentId !== undefined
    && receipt.assignmentId.length > 0;
  if (receipt.commandKind === 'dispatch') {
    return receipt.workerId !== undefined && correlated;
  }
  if (receipt.commandKind === 'recall') {
    const noOp = receipt.resourceKind === undefined
      && receipt.siteId === undefined
      && receipt.assignmentId === undefined;
    return receipt.workerId !== undefined && (correlated || noOp);
  }
  return receipt.commandKind === 'recall-all'
    && receipt.workerId === undefined
    && receipt.resourceKind === undefined
    && receipt.siteId === undefined
    && (receipt.assignmentId === undefined || receipt.assignmentId.length > 0);
}

export function recallWorkerReceipt(
  requestKey: string,
  fid: bigint,
  workerId: string,
  resultRevision: bigint,
  correlation?: WorkerRecallCorrelation,
): WorkerCommandReceiptView {
  return Object.freeze({
    requestKey,
    fid,
    workerId,
    commandKind: 'recall',
    resourceKind: correlation?.resourceKind,
    siteId: correlation?.siteId,
    assignmentId: correlation?.assignmentId,
    resultRevision,
  });
}

export function recallAllWorkersReceipt(
  requestKey: string,
  fid: bigint,
  resultRevision: bigint,
  assignmentId?: string,
): WorkerCommandReceiptView {
  return Object.freeze({
    requestKey,
    fid,
    workerId: undefined,
    commandKind: 'recall-all',
    resourceKind: undefined,
    siteId: undefined,
    assignmentId,
    resultRevision,
  });
}

export function recallReplayMatches(
  receipt: WorkerCommandReceiptView,
  fid: bigint,
  workerId: string,
): boolean {
  return receipt.fid === fid
    && receipt.commandKind === 'recall'
    && receipt.workerId === workerId
    && workerCommandReceiptShapeIsValid(receipt);
}

export function recallAllReplayMatches(
  receipt: WorkerCommandReceiptView,
  fid: bigint,
): boolean {
  return receipt.fid === fid
    && receipt.commandKind === 'recall-all'
    && receipt.workerId === undefined
    && workerCommandReceiptShapeIsValid(receipt);
}

export function workerScheduleMatchesAssignment(
  schedule: Readonly<{
    stage: string;
    workerId: string;
    timelineRevision: number;
    scheduledAt: Readonly<{
      tag: string;
      value?: unknown;
    }>;
  }>,
  assignment: Readonly<{
    phase: string;
    workerId: string;
    timelineRevision: number;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
  }>,
): boolean {
  const expectedStage = assignment.phase === 'outbound'
    ? 'arrival'
    : assignment.phase === 'gathering'
      ? 'gathering-expiry'
      : assignment.phase === 'returning'
        ? 'return-complete'
        : undefined;
  const expectedAtMicros = expectedStage === 'arrival'
    ? assignment.arrivesAtMicros
    : expectedStage === 'gathering-expiry'
      ? assignment.gatheringEndsAtMicros
      : assignment.returnsAtMicros;
  const scheduledValue = schedule.scheduledAt.value;
  const scheduledAtMicros = typeof scheduledValue === 'object'
    && scheduledValue !== null
    && 'microsSinceUnixEpoch' in scheduledValue
    && typeof scheduledValue.microsSinceUnixEpoch === 'bigint'
    ? scheduledValue.microsSinceUnixEpoch
    : undefined;
  return expectedStage !== undefined
    && schedule.stage === expectedStage
    && schedule.workerId === assignment.workerId
    && schedule.timelineRevision === assignment.timelineRevision
    && schedule.scheduledAt.tag === 'Time'
    && scheduledAtMicros === expectedAtMicros;
}
