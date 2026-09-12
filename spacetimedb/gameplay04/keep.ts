import {
  GAMEPLAY04_BALANCE_CAP,
  GAMEPLAY04_POLICY_VERSION,
  GAMEPLAY04_WORKER_COUNT,
} from './policy';
import {
  GAMEPLAY04_I64_MAX,
  GAMEPLAY04_MAX_BINDING_TEXT,
  GAMEPLAY04_MAX_FINGERPRINT,
  GAMEPLAY04_MAX_RECEIPTS,
  GAMEPLAY04_MAX_REQUEST_KEY,
  GAMEPLAY04_U64_MAX,
  Gameplay04KeepError,
  boundedRows04,
  canonicalFingerprint04,
  failGameplay04,
  validateBinding04,
  validateKeepRow04,
  validateReceipts04,
  validateTimestamp04,
  type Gameplay04KeepErrorCode,
} from './commands';
import {
  Gameplay04WorkerStateError,
  validateAssignment04,
  validateReturnOutcome04,
  type Assignment04,
  type ReturnOutcome04,
} from './workerState';

export { Gameplay04KeepError } from './commands';
export type { Gameplay04KeepErrorCode } from './commands';

export type KeepBinding04 = Readonly<{
  keepId: string; databaseIdentity: string; ownerFid: bigint;
  atlasId: string; atlasRevision: bigint; anchorCellKey: string;
}>;
export type KeepRow04 = KeepBinding04 & Readonly<{
  policyVersion: string; revision: bigint; lastAcceptedSequence: bigint;
  food: bigint; wood: bigint; stone: bigint; gold: bigint;
  createdAtMicros: bigint;
}>;
export type WorkerSlot04 = Readonly<{
  workerId: string; keepId: string; ordinal: number;
  assignmentRevision: bigint;
  assignment?: Assignment04 | undefined;
  lastReturn?: ReturnOutcome04 | undefined;
}>;
export type ReceiptRow04 = Readonly<{
  receiptId: string; keepId: string; sequence: bigint;
  requestKey: string; fingerprint: string; resultRevision: bigint;
}>;
export type InitializeKeepInput04 = Readonly<{
  sequence: bigint; requestKey: string; expectedRevision: bigint;
  policyVersion: string;
}>;
export type InitializeKeepResult04 = Readonly<{
  sequence: bigint; revision: bigint;
}>;
export interface KeepStorage04 {
  findKeep(keepId: string): KeepRow04 | null;
  workers(keepId: string): Iterable<WorkerSlot04>;
  receipts(keepId: string): Iterable<ReceiptRow04>;
  insertKeep(row: KeepRow04): void;
  insertWorker(row: WorkerSlot04): void;
  insertReceipt(row: ReceiptRow04): void;
}

const U64_MAX = GAMEPLAY04_U64_MAX;
const I64_MAX = GAMEPLAY04_I64_MAX;
const DATABASE_HEX = /^[0-9a-f]{64}$/u;
const REQUEST_KEY = /^g04:([1-9][0-9]{0,19}):([0-9a-f]{32})$/u;
const INPUT_KEYS = Object.freeze([
  'sequence', 'requestKey', 'expectedRevision', 'policyVersion',
] as const);
const MAX_BINDING_TEXT = GAMEPLAY04_MAX_BINDING_TEXT;
const MAX_REQUEST_KEY = GAMEPLAY04_MAX_REQUEST_KEY;
const MAX_FINGERPRINT = GAMEPLAY04_MAX_FINGERPRINT;
const MAX_RECEIPTS = GAMEPLAY04_MAX_RECEIPTS;

function fail(code: Gameplay04KeepErrorCode): never {
  return failGameplay04(code);
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= U64_MAX;
}

function isPositiveU64(value: unknown): value is bigint {
  return isU64(value) && value > 0n;
}

function boundedText(value: unknown, maximum: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

function validateBinding(binding: KeepBinding04): void {
  validateBinding04(binding);
}

function validateTimestamp(nowMicros: bigint): void {
  validateTimestamp04(nowMicros);
}

function validateRequestKey(requestKey: unknown, sequence: bigint): void {
  if (
    typeof requestKey !== 'string'
    || requestKey.length > MAX_REQUEST_KEY
  ) fail('GAMEPLAY04_INPUT_INVALID');
  const match = REQUEST_KEY.exec(requestKey);
  if (match === null) fail('GAMEPLAY04_INPUT_INVALID');
  let embedded: bigint;
  try {
    embedded = BigInt(match[1]!);
  } catch {
    return fail('GAMEPLAY04_INPUT_INVALID');
  }
  if (!isPositiveU64(embedded) || embedded !== sequence) {
    fail('GAMEPLAY04_INPUT_INVALID');
  }
}

function validateInput(input: InitializeKeepInput04): void {
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
  ) fail('GAMEPLAY04_INPUT_INVALID');
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== INPUT_KEYS.length
    || keys.some(key => (
      typeof key !== 'string'
      || !(INPUT_KEYS as readonly string[]).includes(key)
      || !Object.prototype.propertyIsEnumerable.call(input, key)
    ))
  ) fail('GAMEPLAY04_INPUT_INVALID');
  if (typeof input.sequence !== 'bigint') fail('GAMEPLAY04_INPUT_INVALID');
  if (!isPositiveU64(input.sequence)) fail('GAMEPLAY04_SEQUENCE_INVALID');
  if (
    !isU64(input.expectedRevision)
    || input.policyVersion !== GAMEPLAY04_POLICY_VERSION
  ) fail('GAMEPLAY04_INPUT_INVALID');
  validateRequestKey(input.requestKey, input.sequence);
}

function fingerprint(input: InitializeKeepInput04): string {
  return canonicalFingerprint04([
    'initialize',
    input.sequence.toString(),
    input.requestKey,
    input.expectedRevision.toString(),
    input.policyVersion,
  ]);
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
): readonly Row[] {
  return boundedRows04(rows, maximum);
}

function validateKeepRow(row: KeepRow04, binding: KeepBinding04): void {
  validateKeepRow04(row, binding);
}

function validateWorkers(
  storage: KeepStorage04,
  keepId: string,
): readonly WorkerSlot04[] {
  const rows = [...boundedRows(storage.workers(keepId), GAMEPLAY04_WORKER_COUNT)];
  for (const row of rows) {
    if (
      typeof row.ordinal !== 'number'
      || !Number.isSafeInteger(row.ordinal)
      || row.ordinal < 0
      || row.ordinal >= GAMEPLAY04_WORKER_COUNT
    ) fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  rows.sort((left, right) => left.ordinal - right.ordinal);
  if (rows.length !== GAMEPLAY04_WORKER_COUNT) {
    fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  for (let ordinal = 0; ordinal < GAMEPLAY04_WORKER_COUNT; ordinal += 1) {
    const row = rows[ordinal]!;
    if (
      row.keepId !== keepId
      || row.ordinal !== ordinal
      || row.workerId !== `${keepId}:worker:${ordinal}`
      || !isU64(row.assignmentRevision)
    ) fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  return Object.freeze(rows.map(row => {
    try {
      return Object.freeze({
        ...row,
        ...(row.assignment === undefined
          ? {}
          : { assignment: validateAssignment04(row.assignment) }),
        ...(row.lastReturn === undefined
          ? {}
          : { lastReturn: validateReturnOutcome04(row.lastReturn) }),
      });
    } catch (error) {
      if (error instanceof Gameplay04WorkerStateError) {
        fail('GAMEPLAY04_STORED_STATE_INVALID');
      }
      throw error;
    }
  }));
}

function validateCanonicalFingerprint(value: unknown): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > MAX_FINGERPRINT
  ) fail('GAMEPLAY04_STORED_STATE_INVALID');
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  if (!Array.isArray(parsed) || parsed.length === 0 || JSON.stringify(parsed) !== value) {
    fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
}

function validateReceipts(
  storage: KeepStorage04,
  keep: KeepRow04,
): readonly ReceiptRow04[] {
  return validateReceipts04(storage, keep);
}

function validateRequestKeyStored(requestKey: unknown, sequence: bigint): void {
  if (typeof requestKey !== 'string' || requestKey.length > MAX_REQUEST_KEY) {
    fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
  const match = REQUEST_KEY.exec(requestKey);
  if (match === null) fail('GAMEPLAY04_STORED_STATE_INVALID');
  try {
    if (BigInt(match[1]!) !== sequence) fail('GAMEPLAY04_STORED_STATE_INVALID');
  } catch {
    return fail('GAMEPLAY04_STORED_STATE_INVALID');
  }
}

function rejectOrphans(storage: KeepStorage04, keepId: string): void {
  if (
    boundedRows(storage.workers(keepId), GAMEPLAY04_WORKER_COUNT).length !== 0
    || boundedRows(storage.receipts(keepId), MAX_RECEIPTS).length !== 0
  ) fail('GAMEPLAY04_STORED_STATE_INVALID');
}

export function initializeKeep04(
  storage: KeepStorage04,
  binding: KeepBinding04,
  nowMicros: bigint,
  input: InitializeKeepInput04,
): InitializeKeepResult04 {
  validateBinding(binding);
  validateTimestamp(nowMicros);
  validateInput(input);
  const canonicalFingerprint = fingerprint(input);
  const existing = storage.findKeep(binding.keepId);

  if (existing === null) {
    rejectOrphans(storage, binding.keepId);
    if (input.sequence !== 1n) fail('GAMEPLAY04_SEQUENCE_INVALID');
    if (input.expectedRevision !== 0n) fail('GAMEPLAY04_INPUT_INVALID');
    const keep = Object.freeze({
      ...binding,
      policyVersion: GAMEPLAY04_POLICY_VERSION,
      revision: 1n,
      lastAcceptedSequence: 1n,
      food: 0n,
      wood: 0n,
      stone: 0n,
      gold: 0n,
      createdAtMicros: nowMicros,
    });
    storage.insertKeep(keep);
    for (let ordinal = 0; ordinal < GAMEPLAY04_WORKER_COUNT; ordinal += 1) {
      storage.insertWorker(Object.freeze({
        workerId: `${binding.keepId}:worker:${ordinal}`,
        keepId: binding.keepId,
        ordinal,
        assignmentRevision: 0n,
      }));
    }
    storage.insertReceipt(Object.freeze({
      receiptId: `${binding.keepId}:receipt:1`,
      keepId: binding.keepId,
      sequence: 1n,
      requestKey: input.requestKey,
      fingerprint: canonicalFingerprint,
      resultRevision: 1n,
    }));
    return Object.freeze({ sequence: 1n, revision: 1n });
  }

  validateKeepRow(existing, binding);
  validateWorkers(storage, binding.keepId);
  const receipts = validateReceipts(storage, existing);
  const retained = receipts.find(row => row.sequence === input.sequence);
  if (retained !== undefined) {
    if (
      retained.requestKey !== input.requestKey
      || retained.fingerprint !== canonicalFingerprint
    ) fail('GAMEPLAY04_RECEIPT_CONFLICT');
    return Object.freeze({
      sequence: retained.sequence,
      revision: retained.resultRevision,
    });
  }
  if (input.sequence <= existing.lastAcceptedSequence) {
    fail('GAMEPLAY04_RECEIPT_EXPIRED');
  }
  if (input.sequence !== existing.lastAcceptedSequence + 1n) {
    fail('GAMEPLAY04_SEQUENCE_INVALID');
  }
  fail('GAMEPLAY04_ALREADY_INITIALIZED');
}

export function readKeep04(
  storage: KeepStorage04,
  binding: KeepBinding04,
): Readonly<{ keep: KeepRow04; workers: readonly WorkerSlot04[] }> {
  validateBinding(binding);
  const keep = storage.findKeep(binding.keepId);
  if (keep === null) {
    rejectOrphans(storage, binding.keepId);
    fail('GAMEPLAY04_NOT_INITIALIZED');
  }
  validateKeepRow(keep, binding);
  const workers = validateWorkers(storage, binding.keepId);
  validateReceipts(storage, keep);
  return Object.freeze({
    keep: Object.freeze({ ...keep }),
    workers,
  });
}
