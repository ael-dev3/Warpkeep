import {
  GAMEPLAY04_BALANCE_CAP,
  GAMEPLAY04_POLICY_VERSION,
} from './policy';
import type {
  KeepBinding04,
  KeepRow04,
  KeepStorage04,
  ReceiptRow04,
} from './keep';

export type Gameplay04KeepErrorCode =
  | 'GAMEPLAY04_INPUT_INVALID'
  | 'GAMEPLAY04_BINDING_INVALID'
  | 'GAMEPLAY04_TIMESTAMP_INVALID'
  | 'GAMEPLAY04_STORED_STATE_INVALID'
  | 'GAMEPLAY04_BINDING_MISMATCH'
  | 'GAMEPLAY04_RECEIPT_CONFLICT'
  | 'GAMEPLAY04_RECEIPT_EXPIRED'
  | 'GAMEPLAY04_ALREADY_INITIALIZED'
  | 'GAMEPLAY04_SEQUENCE_INVALID'
  | 'GAMEPLAY04_NOT_INITIALIZED'
  | 'GAMEPLAY04_REVISION_OVERFLOW';

export const GAMEPLAY04_U64_MAX = 18_446_744_073_709_551_615n;
export const GAMEPLAY04_I64_MAX = 9_223_372_036_854_775_807n;
export const GAMEPLAY04_MAX_BINDING_TEXT = 256;
export const GAMEPLAY04_MAX_REQUEST_KEY = 57;
export const GAMEPLAY04_MAX_FINGERPRINT = 4_096;
export const GAMEPLAY04_MAX_RECEIPTS = 128;

const DATABASE_HEX = /^[0-9a-f]{64}$/u;
const REQUEST_KEY = /^g04:([1-9][0-9]{0,19}):([0-9a-f]{32})$/u;

export class Gameplay04KeepError extends Error {
  constructor(readonly code: Gameplay04KeepErrorCode) {
    super(code);
    this.name = 'Gameplay04KeepError';
  }
}

export function failGameplay04(code: Gameplay04KeepErrorCode): never {
  throw new Gameplay04KeepError(code);
}

export function isU64Gameplay04(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= GAMEPLAY04_U64_MAX;
}

export function isPositiveU64Gameplay04(value: unknown): value is bigint {
  return isU64Gameplay04(value) && value > 0n;
}

export function isTimestampGameplay04(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= GAMEPLAY04_I64_MAX;
}

export function boundedTextGameplay04(
  value: unknown,
  maximum = GAMEPLAY04_MAX_BINDING_TEXT,
): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maximum;
}

export function requireExactFieldsGameplay04(
  value: unknown,
  fields: readonly string[],
): asserts value is Record<string, unknown> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) failGameplay04('GAMEPLAY04_INPUT_INVALID');
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== fields.length
    || keys.some(key => (
      typeof key !== 'string'
      || !fields.includes(key)
      || !Object.prototype.propertyIsEnumerable.call(value, key)
    ))
  ) failGameplay04('GAMEPLAY04_INPUT_INVALID');
}

export function validateBinding04(binding: KeepBinding04): void {
  if (
    binding === null
    || typeof binding !== 'object'
    || typeof binding.databaseIdentity !== 'string'
    || binding.databaseIdentity.length !== 64
    || !DATABASE_HEX.test(binding.databaseIdentity)
    || !isPositiveU64Gameplay04(binding.ownerFid)
    || !boundedTextGameplay04(binding.atlasId)
    || !isPositiveU64Gameplay04(binding.atlasRevision)
    || !boundedTextGameplay04(binding.anchorCellKey)
    || binding.keepId !== `g04:${binding.databaseIdentity}:${binding.ownerFid.toString()}`
  ) failGameplay04('GAMEPLAY04_BINDING_INVALID');
}

export function validateTimestamp04(nowMicros: unknown): asserts nowMicros is bigint {
  if (!isTimestampGameplay04(nowMicros)) failGameplay04('GAMEPLAY04_TIMESTAMP_INVALID');
}

export function validateRequestKey04(requestKey: unknown, sequence: bigint): void {
  if (typeof requestKey !== 'string' || requestKey.length > GAMEPLAY04_MAX_REQUEST_KEY) {
    failGameplay04('GAMEPLAY04_INPUT_INVALID');
  }
  const match = REQUEST_KEY.exec(requestKey);
  if (match === null) failGameplay04('GAMEPLAY04_INPUT_INVALID');
  try {
    if (!isPositiveU64Gameplay04(BigInt(match[1]!)) || BigInt(match[1]!) !== sequence) {
      failGameplay04('GAMEPLAY04_INPUT_INVALID');
    }
  } catch {
    failGameplay04('GAMEPLAY04_INPUT_INVALID');
  }
}

export function validateStoredRequestKey04(requestKey: unknown, sequence: bigint): void {
  try {
    validateRequestKey04(requestKey, sequence);
  } catch {
    failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
  }
}

export function validateCanonicalFingerprint04(value: unknown): void {
  if (
    typeof value !== 'string'
    || value.length === 0
    || value.length > GAMEPLAY04_MAX_FINGERPRINT
  ) failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { failGameplay04('GAMEPLAY04_STORED_STATE_INVALID'); }
  if (!Array.isArray(parsed) || parsed.length === 0 || JSON.stringify(parsed) !== value) {
    failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
  }
}

export function canonicalFingerprint04(parts: readonly string[]): string {
  const value = JSON.stringify(parts);
  if (value.length > GAMEPLAY04_MAX_FINGERPRINT) failGameplay04('GAMEPLAY04_INPUT_INVALID');
  return value;
}

export function boundedRows04<Row>(rows: Iterable<Row>, maximum: number): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length === maximum) failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
    result.push(row);
  }
  return result;
}

export function validateKeepRow04(row: KeepRow04, binding: KeepBinding04): void {
  if (
    row.keepId !== binding.keepId
    || row.databaseIdentity !== binding.databaseIdentity
    || row.ownerFid !== binding.ownerFid
    || row.atlasId !== binding.atlasId
    || row.atlasRevision !== binding.atlasRevision
    || row.anchorCellKey !== binding.anchorCellKey
  ) failGameplay04('GAMEPLAY04_BINDING_MISMATCH');
  if (
    row.policyVersion !== GAMEPLAY04_POLICY_VERSION
    || !isPositiveU64Gameplay04(row.revision)
    || !isPositiveU64Gameplay04(row.lastAcceptedSequence)
    || !isU64Gameplay04(row.food) || row.food > GAMEPLAY04_BALANCE_CAP
    || !isU64Gameplay04(row.wood) || row.wood > GAMEPLAY04_BALANCE_CAP
    || !isU64Gameplay04(row.stone) || row.stone > GAMEPLAY04_BALANCE_CAP
    || !isU64Gameplay04(row.gold) || row.gold > GAMEPLAY04_BALANCE_CAP
    || !isTimestampGameplay04(row.createdAtMicros)
  ) failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
}

export function validateReceipts04(
  storage: KeepStorage04,
  keep: KeepRow04,
): readonly ReceiptRow04[] {
  const rows = boundedRows04(storage.receipts(keep.keepId), GAMEPLAY04_MAX_RECEIPTS);
  const sequences = new Set<bigint>();
  const identities = new Set<string>();
  for (const row of rows) {
    if (
      row.keepId !== keep.keepId
      || !isPositiveU64Gameplay04(row.sequence)
      || row.sequence > keep.lastAcceptedSequence
      || row.receiptId !== `${keep.keepId}:receipt:${row.sequence.toString()}`
      || identities.has(row.receiptId)
      || sequences.has(row.sequence)
      || !isPositiveU64Gameplay04(row.resultRevision)
      || row.resultRevision > keep.revision
    ) failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
    validateStoredRequestKey04(row.requestKey, row.sequence);
    validateCanonicalFingerprint04(row.fingerprint);
    identities.add(row.receiptId);
    sequences.add(row.sequence);
  }
  return Object.freeze(rows.map(row => Object.freeze({ ...row })));
}

export function preflightSequence04(
  storage: KeepStorage04,
  keep: KeepRow04,
  input: Readonly<{ sequence: bigint; requestKey: string; expectedRevision: bigint }>,
  fingerprint: string,
): Readonly<{ kind: 'replay'; sequence: bigint; revision: bigint }>
  | Readonly<{ kind: 'fresh' }> {
  const receipts = validateReceipts04(storage, keep);
  const retained = receipts.find(row => row.sequence === input.sequence);
  if (retained !== undefined) {
    if (retained.requestKey !== input.requestKey || retained.fingerprint !== fingerprint) {
      failGameplay04('GAMEPLAY04_RECEIPT_CONFLICT');
    }
    return Object.freeze({
      kind: 'replay' as const,
      sequence: retained.sequence,
      revision: retained.resultRevision,
    });
  }
  if (input.sequence <= keep.lastAcceptedSequence) failGameplay04('GAMEPLAY04_RECEIPT_EXPIRED');
  if (
    keep.lastAcceptedSequence === GAMEPLAY04_U64_MAX
    || input.sequence !== keep.lastAcceptedSequence + 1n
  ) failGameplay04('GAMEPLAY04_SEQUENCE_INVALID');
  if (input.expectedRevision !== keep.revision) failGameplay04('GAMEPLAY04_INPUT_INVALID');
  return Object.freeze({ kind: 'fresh' as const });
}

export type CommandCommitStorage04 = KeepStorage04 & {
  updateKeep(row: KeepRow04): void;
  deleteReceipt(receiptId: string): void;
};

export function commitGameplay04Revision(
  storage: CommandCommitStorage04,
  keep: KeepRow04,
): KeepRow04 {
  if (keep.revision === GAMEPLAY04_U64_MAX) {
    failGameplay04('GAMEPLAY04_REVISION_OVERFLOW');
  }
  const updated = Object.freeze({ ...keep, revision: keep.revision + 1n });
  storage.updateKeep(updated);
  return updated;
}

export function commitGameplay04Command(
  storage: CommandCommitStorage04,
  keep: KeepRow04,
  input: Readonly<{ sequence: bigint; requestKey: string }>,
  canonicalFingerprint: string,
): Readonly<{ sequence: bigint; revision: bigint }> {
  const updated = commitGameplay04Revision(storage, Object.freeze({
    ...keep,
    lastAcceptedSequence: input.sequence,
  }));
  storage.insertReceipt(Object.freeze({
    receiptId: `${keep.keepId}:receipt:${input.sequence.toString()}`,
    keepId: keep.keepId,
    sequence: input.sequence,
    requestKey: input.requestKey,
    fingerprint: canonicalFingerprint,
    resultRevision: updated.revision,
  }));
  const receipts = [...storage.receipts(keep.keepId)];
  if (receipts.length > GAMEPLAY04_MAX_RECEIPTS + 1) {
    failGameplay04('GAMEPLAY04_STORED_STATE_INVALID');
  }
  if (receipts.length === GAMEPLAY04_MAX_RECEIPTS + 1) {
    let oldest = receipts[0]!;
    for (const row of receipts.slice(1)) {
      if (row.sequence < oldest.sequence) oldest = row;
    }
    storage.deleteReceipt(oldest.receiptId);
  }
  return Object.freeze({ sequence: input.sequence, revision: updated.revision });
}
