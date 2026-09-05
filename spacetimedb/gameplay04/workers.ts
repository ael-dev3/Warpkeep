import {
  GAMEPLAY04_MAX_RECEIPTS,
  GAMEPLAY04_U64_MAX,
  Gameplay04KeepError,
  boundedRows04,
  boundedTextGameplay04,
  canonicalFingerprint04,
  failGameplay04,
  isPositiveU64Gameplay04,
  isU64Gameplay04,
  preflightSequence04,
  requireExactFieldsGameplay04,
  validateBinding04,
  validateKeepRow04,
  validateRequestKey04,
  validateTimestamp04,
} from './commands';
import {
  readKeep04,
  type KeepBinding04,
  type KeepRow04,
  type KeepStorage04,
  type WorkerSlot04,
} from './keep';
import {
  GAMEPLAY04_POLICY_VERSION,
  GAMEPLAY04_WORKER_COUNT,
  creditResource04,
  requireGatherDuration04,
  type CompletedLevels04,
  type Resource04,
} from './policy';
import {
  dispatchJourney04,
  observeJourney04,
  recallJourney04,
} from './workerJourney';
import {
  Gameplay04WorkerStateError,
  validateAssignment04,
  validateReturnOutcome04,
  validateRoute04,
  type Assignment04,
  type ReturnOutcome04,
  type RoutePoint04,
} from './workerState';

export type { Assignment04, ReturnOutcome04, RoutePoint04 } from './workerState';

export type WorkerRow04 = WorkerSlot04 & Readonly<{
  assignment: Assignment04 | undefined;
  lastReturn: ReturnOutcome04 | undefined;
}>;
export type Reservation04 = Readonly<{
  nodeId: string;
  keepId: string;
  workerId: string;
  assignmentRevision: bigint;
}>;
export type WorkerSchedule04 = Readonly<{
  scheduleId: bigint;
  keepId: string;
  workerId: string;
  assignmentRevision: bigint;
  dueAtMicros: bigint;
}>;
export type WorkerCommand04 = Readonly<{
  sequence: bigint;
  requestKey: string;
  expectedRevision: bigint;
  policyVersion: string;
  expectedAtlasRevision: bigint;
  workerOrdinal: number;
}>;
export type DispatchWorkerInput04 = WorkerCommand04 & Readonly<{
  locationId: string;
  resource: Resource04;
  gatheringDurationMicros: bigint;
}>;
export type RecallWorkerInput04 = WorkerCommand04;
export type WorkerCommandResult04 = Readonly<{ sequence: bigint; revision: bigint }>;
export type ResolvedDispatch04 = Readonly<{
  locationId: string;
  destinationCellKey: string;
  resource: Resource04;
  candidateNodeIds: readonly string[];
  route: readonly RoutePoint04[];
  completed: CompletedLevels04;
}>;

export interface WorkerStorage04 extends KeepStorage04 {
  workers(keepId: string): Iterable<WorkerRow04>;
  updateKeep(row: KeepRow04): void;
  updateWorker(row: WorkerRow04): void;
  deleteReceipt(receiptId: string): void;
  reservations(keepId: string): Iterable<Reservation04>;
  findReservation(nodeId: string): Reservation04 | null;
  insertReservation(row: Reservation04): void;
  deleteReservation(nodeId: string): void;
  schedules(keepId: string): Iterable<WorkerSchedule04>;
  insertSchedule(row: Omit<WorkerSchedule04, 'scheduleId'>): void;
  deleteSchedule(scheduleId: bigint): void;
}

export type Gameplay04WorkerErrorCode =
  | 'GAMEPLAY04_INPUT_INVALID'
  | 'GAMEPLAY04_STORED_STATE_INVALID'
  | 'GAMEPLAY04_TARGET_INVALID'
  | 'GAMEPLAY04_WORKER_BUSY'
  | 'GAMEPLAY04_LOCATION_FULL'
  | 'GAMEPLAY04_REVISION_OVERFLOW'
  | 'GAMEPLAY04_ASSIGNMENT_REVISION_OVERFLOW'
  | 'GAMEPLAY04_RECEIPT_CONFLICT'
  | 'GAMEPLAY04_RECEIPT_EXPIRED'
  | 'GAMEPLAY04_SEQUENCE_INVALID';

export class Gameplay04WorkerError extends Error {
  constructor(readonly code: Gameplay04WorkerErrorCode) {
    super(code);
    this.name = 'Gameplay04WorkerError';
  }
}

function workerFail(code: Gameplay04WorkerErrorCode): never {
  throw new Gameplay04WorkerError(code);
}

function mapError<T>(effect: () => T): T {
  try { return effect(); } catch (error) {
    if (error instanceof Gameplay04WorkerError) throw error;
    if (error instanceof Gameplay04WorkerStateError) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    if (error instanceof Gameplay04KeepError) {
      if (
        error.code === 'GAMEPLAY04_RECEIPT_CONFLICT'
        || error.code === 'GAMEPLAY04_RECEIPT_EXPIRED'
        || error.code === 'GAMEPLAY04_SEQUENCE_INVALID'
      ) workerFail(error.code);
      if (error.code === 'GAMEPLAY04_INPUT_INVALID') workerFail(error.code);
      throw error;
    }
    throw error;
  }
}

const COMMON_FIELDS = Object.freeze([
  'sequence', 'requestKey', 'expectedRevision', 'policyVersion',
  'expectedAtlasRevision', 'workerOrdinal',
] as const);
const DISPATCH_FIELDS = Object.freeze([
  ...COMMON_FIELDS, 'locationId', 'resource', 'gatheringDurationMicros',
] as const);
const RESOURCES = Object.freeze(['food', 'wood', 'stone', 'gold'] as const);

function validateCommand(input: WorkerCommand04, dispatch: boolean): void {
  requireExactFieldsGameplay04(input, dispatch ? DISPATCH_FIELDS : COMMON_FIELDS);
  if (!isPositiveU64Gameplay04(input.sequence)) workerFail('GAMEPLAY04_SEQUENCE_INVALID');
  validateRequestKey04(input.requestKey, input.sequence);
  if (
    !isU64Gameplay04(input.expectedRevision)
    || input.policyVersion !== GAMEPLAY04_POLICY_VERSION
    || !isPositiveU64Gameplay04(input.expectedAtlasRevision)
    || !Number.isSafeInteger(input.workerOrdinal)
    || input.workerOrdinal < 0
    || input.workerOrdinal >= GAMEPLAY04_WORKER_COUNT
  ) workerFail('GAMEPLAY04_INPUT_INVALID');
  if (dispatch) {
    const value = input as DispatchWorkerInput04;
    if (
      !boundedTextGameplay04(value.locationId)
      || !RESOURCES.includes(value.resource)
    ) workerFail('GAMEPLAY04_INPUT_INVALID');
    try { requireGatherDuration04(value.gatheringDurationMicros); } catch {
      workerFail('GAMEPLAY04_INPUT_INVALID');
    }
  }
}

function fingerprint(kind: 'dispatch' | 'recall', input: WorkerCommand04): string {
  const common = [
    kind,
    input.sequence.toString(),
    input.requestKey,
    input.expectedRevision.toString(),
    input.policyVersion,
    input.expectedAtlasRevision.toString(),
    input.workerOrdinal.toString(),
  ];
  if (kind === 'dispatch') {
    const value = input as DispatchWorkerInput04;
    common.push(value.locationId, value.resource, value.gatheringDurationMicros.toString());
  }
  return canonicalFingerprint04(common);
}

function validateWorkerRows(rows: readonly WorkerSlot04[]): readonly WorkerRow04[] {
  return Object.freeze(rows.map(row => {
    const assignment = row.assignment === undefined
      ? undefined
      : validateAssignment04(row.assignment);
    const lastReturn = row.lastReturn === undefined
      ? undefined
      : validateReturnOutcome04(row.lastReturn);
    if (
      (assignment !== undefined && !isPositiveU64Gameplay04(row.assignmentRevision))
      || (lastReturn !== undefined && (
        lastReturn.assignmentRevision > row.assignmentRevision
        || (assignment !== undefined
          && lastReturn.assignmentRevision === row.assignmentRevision)
      ))
    ) {
      workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    }
    return Object.freeze({ ...row, assignment, lastReturn });
  }));
}

export function preflightWorkerCommand04(
  storage: WorkerStorage04,
  binding: KeepBinding04,
  now: bigint,
  command: Readonly<{ kind: 'dispatch'; input: DispatchWorkerInput04 }>
    | Readonly<{ kind: 'recall'; input: RecallWorkerInput04 }>,
): Readonly<{ kind: 'replay'; result: WorkerCommandResult04 }>
  | Readonly<{ kind: 'fresh'; revision: bigint }> {
  return mapError(() => {
    validateBinding04(binding);
    validateTimestamp04(now);
    validateCommand(command.input, command.kind === 'dispatch');
    if (command.input.expectedAtlasRevision !== binding.atlasRevision) {
      workerFail('GAMEPLAY04_INPUT_INVALID');
    }
    const state = readKeep04(storage, binding);
    validateWorkerRows(state.workers);
    const result = preflightSequence04(
      storage, state.keep, command.input, fingerprint(command.kind, command.input),
    );
    return result.kind === 'replay'
      ? Object.freeze({
        kind: 'replay' as const,
        result: Object.freeze({ sequence: result.sequence, revision: result.revision }),
      })
      : Object.freeze({ kind: 'fresh' as const, revision: state.keep.revision });
  });
}

type Reconciliation = Readonly<{ keep: KeepRow04; changed: boolean }>;

function reconcileWithoutRevision(
  storage: WorkerStorage04,
  binding: KeepBinding04,
  now: bigint,
  accumulatedKeep?: KeepRow04,
): Reconciliation {
  const state = readKeep04(storage, binding);
  let keep = accumulatedKeep ?? state.keep;
  const workers = validateWorkerRows(state.workers);
  const reservations = boundedRows04(storage.reservations(binding.keepId), GAMEPLAY04_WORKER_COUNT);
  const schedules = boundedRows04(storage.schedules(binding.keepId), GAMEPLAY04_WORKER_COUNT);
  const workerIds = new Set(workers.map(worker => worker.workerId));
  if (
    reservations.some(row => row.keepId !== binding.keepId || !workerIds.has(row.workerId))
    || schedules.some(row => row.keepId !== binding.keepId || !workerIds.has(row.workerId))
  ) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
  let changed = false;
  for (const worker of workers) {
    const claims = reservations.filter(row => row.workerId === worker.workerId);
    const wakeups = schedules.filter(row => row.workerId === worker.workerId);
    if (worker.assignment === undefined) {
      if (claims.length !== 0 || wakeups.length !== 0) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
      continue;
    }
    const assignment = worker.assignment;
    if (
      claims.length !== 1
      || claims[0]!.nodeId !== assignment.nodeId
      || claims[0]!.assignmentRevision !== worker.assignmentRevision
      || wakeups.length > 1
      || (wakeups.length === 1 && (
        wakeups[0]!.assignmentRevision !== worker.assignmentRevision
        || !isPositiveU64Gameplay04(wakeups[0]!.scheduleId)
      ))
    ) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    const reservation = storage.findReservation(assignment.nodeId);
    if (
      reservation === null
      || reservation.keepId !== binding.keepId
      || reservation.workerId !== worker.workerId
      || reservation.assignmentRevision !== worker.assignmentRevision
    ) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    const wakeup = wakeups[0];
    if (wakeup !== undefined) validateTimestamp04(wakeup.dueAtMicros);
    const observed = observeJourney04(assignment.journey, now);
    if (
      wakeup !== undefined
      && wakeup.dueAtMicros !== observed.arrivesAt
      && wakeup.dueAtMicros !== observed.gatheringStopsAt
      && wakeup.dueAtMicros !== observed.returnsAt
    ) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    if (observed.phase === 'complete') {
      const credited = creditResource04(keep[assignment.journey.resource], observed.earned);
      keep = Object.freeze({ ...keep, [assignment.journey.resource]: credited.balance });
      storage.updateWorker(Object.freeze({
        ...worker,
        assignment: undefined,
        lastReturn: Object.freeze({
          assignmentRevision: worker.assignmentRevision,
          resource: assignment.journey.resource,
          returnedAtMicros: observed.returnsAt,
          earned: observed.earned,
          credited: credited.credited,
          overflow: credited.overflow,
        }),
      }));
      storage.deleteReservation(assignment.nodeId);
      if (wakeup !== undefined) storage.deleteSchedule(wakeup.scheduleId);
      changed = true;
      continue;
    }
    if (observed.nextDueAt === null || observed.nextDueAt <= now) {
      workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    }
    if (
      wakeup !== undefined
      && wakeup.dueAtMicros > now
      && wakeup.dueAtMicros !== observed.nextDueAt
    ) {
      workerFail('GAMEPLAY04_STORED_STATE_INVALID');
    }
    if (wakeup === undefined || wakeup.dueAtMicros !== observed.nextDueAt) {
      storage.insertSchedule(Object.freeze({
        keepId: binding.keepId,
        workerId: worker.workerId,
        assignmentRevision: worker.assignmentRevision,
        dueAtMicros: observed.nextDueAt,
      }));
      if (wakeup !== undefined) storage.deleteSchedule(wakeup.scheduleId);
      changed = true;
    }
  }
  return Object.freeze({ keep, changed });
}

function commitRevision(storage: WorkerStorage04, keep: KeepRow04): KeepRow04 {
  if (keep.revision === GAMEPLAY04_U64_MAX) workerFail('GAMEPLAY04_REVISION_OVERFLOW');
  const updated = Object.freeze({ ...keep, revision: keep.revision + 1n });
  storage.updateKeep(updated);
  return updated;
}

function commitCommand(
  storage: WorkerStorage04,
  keep: KeepRow04,
  kind: 'dispatch' | 'recall',
  input: WorkerCommand04,
): WorkerCommandResult04 {
  const updated = commitRevision(storage, Object.freeze({
    ...keep,
    lastAcceptedSequence: input.sequence,
  }));
  storage.insertReceipt(Object.freeze({
    receiptId: `${keep.keepId}:receipt:${input.sequence.toString()}`,
    keepId: keep.keepId,
    sequence: input.sequence,
    requestKey: input.requestKey,
    fingerprint: fingerprint(kind, input),
    resultRevision: updated.revision,
  }));
  const receipts = [...storage.receipts(keep.keepId)];
  if (receipts.length > GAMEPLAY04_MAX_RECEIPTS + 1) {
    workerFail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  if (receipts.length === GAMEPLAY04_MAX_RECEIPTS + 1) {
    let oldest = receipts[0]!;
    for (const row of receipts.slice(1)) if (row.sequence < oldest.sequence) oldest = row;
    storage.deleteReceipt(oldest.receiptId);
  }
  return Object.freeze({ sequence: input.sequence, revision: updated.revision });
}

function validateTarget(
  binding: KeepBinding04,
  input: DispatchWorkerInput04,
  target: ResolvedDispatch04,
): Readonly<{ route: readonly RoutePoint04[]; candidates: readonly string[] }> {
  try {
    requireExactFieldsGameplay04(target, [
      'locationId', 'destinationCellKey', 'resource', 'candidateNodeIds', 'route', 'completed',
    ]);
  } catch { workerFail('GAMEPLAY04_TARGET_INVALID'); }
  if (
    target.locationId !== input.locationId
    || target.resource !== input.resource
    || !boundedTextGameplay04(target.destinationCellKey)
    || !Array.isArray(target.candidateNodeIds)
    || target.candidateNodeIds.length < 1
    || target.candidateNodeIds.length > 32
  ) workerFail('GAMEPLAY04_TARGET_INVALID');
  const candidates = [...target.candidateNodeIds];
  if (
    candidates.some(node => !boundedTextGameplay04(node))
    || new Set(candidates).size !== candidates.length
  ) workerFail('GAMEPLAY04_TARGET_INVALID');
  let route: readonly RoutePoint04[];
  try {
    route = validateRoute04(target.route);
    dispatchJourney04({
      resource: target.resource,
      dispatchedAt: 0n,
      routeEdges: route.length - 1,
      gatheringDurationMicros: input.gatheringDurationMicros,
      completed: target.completed,
    });
  } catch { workerFail('GAMEPLAY04_TARGET_INVALID'); }
  if (route.length === 1 && target.destinationCellKey !== binding.anchorCellKey) {
    workerFail('GAMEPLAY04_TARGET_INVALID');
  }
  return Object.freeze({ route, candidates: Object.freeze(candidates) });
}

export function dispatchWorker04(
  storage: WorkerStorage04,
  binding: KeepBinding04,
  now: bigint,
  input: DispatchWorkerInput04,
  target: ResolvedDispatch04,
): WorkerCommandResult04 {
  return mapError(() => {
    const preflight = preflightWorkerCommand04(storage, binding, now, { kind: 'dispatch', input });
    if (preflight.kind === 'replay') return preflight.result;
    const facts = validateTarget(binding, input, target);
    const reconciled = reconcileWithoutRevision(storage, binding, now);
    const state = readKeep04(storage, binding);
    validateKeepRow04(reconciled.keep, binding);
    const worker = validateWorkerRows(state.workers)[input.workerOrdinal]!;
    if (worker.assignment !== undefined) workerFail('GAMEPLAY04_WORKER_BUSY');
    if (worker.assignmentRevision === GAMEPLAY04_U64_MAX) {
      workerFail('GAMEPLAY04_ASSIGNMENT_REVISION_OVERFLOW');
    }
    const nodeId = facts.candidates.find(candidate => storage.findReservation(candidate) === null);
    if (nodeId === undefined) workerFail('GAMEPLAY04_LOCATION_FULL');
    const assignmentRevision = worker.assignmentRevision + 1n;
    const journey = dispatchJourney04({
      resource: target.resource,
      dispatchedAt: now,
      routeEdges: facts.route.length - 1,
      gatheringDurationMicros: input.gatheringDurationMicros,
      completed: target.completed,
    });
    const assignment = validateAssignment04({
      nodeId,
      locationId: target.locationId,
      destinationCellKey: target.destinationCellKey,
      route: facts.route,
      journey,
    });
    const due = observeJourney04(journey, now).nextDueAt;
    if (due === null || due <= now) workerFail('GAMEPLAY04_TARGET_INVALID');
    storage.insertReservation(Object.freeze({
      nodeId, keepId: binding.keepId, workerId: worker.workerId, assignmentRevision,
    }));
    storage.updateWorker(Object.freeze({ ...worker, assignmentRevision, assignment }));
    storage.insertSchedule(Object.freeze({
      keepId: binding.keepId,
      workerId: worker.workerId,
      assignmentRevision,
      dueAtMicros: due,
    }));
    return commitCommand(storage, reconciled.keep, 'dispatch', input);
  });
}

export function recallWorker04(
  storage: WorkerStorage04,
  binding: KeepBinding04,
  now: bigint,
  input: RecallWorkerInput04,
): WorkerCommandResult04 {
  return mapError(() => {
    const preflight = preflightWorkerCommand04(storage, binding, now, { kind: 'recall', input });
    if (preflight.kind === 'replay') return preflight.result;
    let reconciled = reconcileWithoutRevision(storage, binding, now);
    const state = readKeep04(storage, binding);
    const worker = validateWorkerRows(state.workers)[input.workerOrdinal]!;
    if (worker.assignment !== undefined) {
      const recalled = recallJourney04(worker.assignment.journey, now);
      if (recalled.recalledAt !== worker.assignment.journey.recalledAt) {
        const wakeups = boundedRows04(
          storage.schedules(binding.keepId), GAMEPLAY04_WORKER_COUNT,
        ).filter(row => row.workerId === worker.workerId);
        if (wakeups.length !== 1) workerFail('GAMEPLAY04_STORED_STATE_INVALID');
        const due = observeJourney04(recalled, now).nextDueAt;
        storage.updateWorker(Object.freeze({
          ...worker,
          assignment: Object.freeze({ ...worker.assignment, journey: recalled }),
        }));
        storage.deleteSchedule(wakeups[0]!.scheduleId);
        if (due !== null && due > now) {
          storage.insertSchedule(Object.freeze({
            keepId: binding.keepId,
            workerId: worker.workerId,
            assignmentRevision: worker.assignmentRevision,
            dueAtMicros: due,
          }));
        } else {
          reconciled = reconcileWithoutRevision(storage, binding, now, reconciled.keep);
        }
      }
    }
    return commitCommand(storage, reconciled.keep, 'recall', input);
  });
}

export function reconcileWorkers04(
  storage: WorkerStorage04,
  binding: KeepBinding04,
  now: bigint,
): Readonly<{ changed: boolean; revision: bigint }> {
  return mapError(() => {
    validateBinding04(binding);
    validateTimestamp04(now);
    const reconciled = reconcileWithoutRevision(storage, binding, now);
    if (!reconciled.changed) {
      return Object.freeze({ changed: false, revision: reconciled.keep.revision });
    }
    const keep = commitRevision(storage, reconciled.keep);
    return Object.freeze({ changed: true, revision: keep.revision });
  });
}
