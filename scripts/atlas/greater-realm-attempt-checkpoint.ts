import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import {
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  openSync,
  readdirSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import type { Stats } from 'node:fs';
import { join } from 'node:path';

import {
  GREATER_REALM_CANDIDATE_REJECTION_CODES,
  type GreaterRealmCandidateRejectionCode,
} from './greater-realm-candidate-rejection';
import type { GreaterRealmCandidatePerformance } from './greater-realm-candidate-package';
import {
  GREATER_REALM_CANDIDATE_HANDLE_PATTERN,
  GREATER_REALM_GENERATOR_VERSION_PATTERN,
  GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN,
} from './greater-realm-contracts';
import type { GreaterRealmPrivateWorkspace } from './greater-realm-private-workspace';

const CHECKPOINT_KIND = 'warpkeep.greater-realm.private-attempt-checkpoint.v1' as const;
const COMPLETION_KIND = 'warpkeep.greater-realm.private-attempt-completion.v1' as const;
const CHECKPOINT_DIRECTORY = 'checkpoints/single-world-generation';
const COMPLETION_DIRECTORY = 'checkpoints/single-world-completion';
const COMPLETION_PATH = `${COMPLETION_DIRECTORY}/receipt.wkgr-checkpoint`;
const CHECKPOINT_PARENT_DIRECTORY = 'checkpoints';
const RETIRED_STATE_DIRECTORY = new RegExp(
  '^\\.retired-(single-world-generation|single-world-completion)-'
    + '[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',
  'u',
);
const OWNER_KEY_PATH = 'secrets/greater-realm-attempt-checkpoint-key.wkgr-private';
const OWNER_KEY_MARKER = Buffer.from('WKGR-PRIVATE-CHECKPOINT-OWNER-KEY-V1\0', 'ascii');
const CHECKPOINT_MARKER = Buffer.from('WKGR-PRIVATE-ATTEMPT-CHECKPOINT-V1\0', 'ascii');
const COMPLETION_MARKER = Buffer.from('WKGR-PRIVATE-ATTEMPT-COMPLETION-V1\0', 'ascii');
const FORMAT_VERSION = 1;
const OWNER_KEY_BYTES = 32;
const NONCE_BYTES = 12;
const AUTHENTICATION_TAG_BYTES = 16;
const ROOT_SEED_BYTES = 32;
const METADATA_LENGTH_BYTES = 4;
const MAXIMUM_ATTEMPTS = 256;
const MINIMUM_ATTEMPTS = 8;
const MAXIMUM_METADATA_BYTES = 2 * 1024 * 1024;
const MAXIMUM_CHECKPOINT_BYTES = (
  CHECKPOINT_MARKER.byteLength
  + 1
  + NONCE_BYTES
  + METADATA_LENGTH_BYTES
  + AUTHENTICATION_TAG_BYTES
  + ROOT_SEED_BYTES
  + METADATA_LENGTH_BYTES
  + MAXIMUM_METADATA_BYTES
);
const COMPLETION_AUTHENTICATION_BYTES = 32;
const MAXIMUM_COMPLETION_BYTES = (
  COMPLETION_MARKER.byteLength
  + 1
  + METADATA_LENGTH_BYTES
  + MAXIMUM_METADATA_BYTES
  + COMPLETION_AUTHENTICATION_BYTES
);
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/u;
const TOOLCHAIN_RECEIPT_PATTERN = /^sha256:[0-9a-f]{64}$/u;
const TOOLCHAIN_PROFILE_PATTERN = /^(?:darwin-arm64|linux-x64)$/u;
const NODE_VERSION_PATTERN = /^22\.(?:1[3-9]|[2-9][0-9])\.(?:0|[1-9][0-9]*)$/u;
const PROOF_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_:-]{2,159}$/u;

export type GreaterRealmCheckpointRejectedAttempt = Readonly<
  | {
    kind: 'proof-rejection';
    candidateOrdinal: number;
    activeCellCount: number;
    failedProofs: readonly string[];
  }
  | {
    kind: 'geography-exhaustion';
    candidateOrdinal: number;
    rejectionCode: GreaterRealmCandidateRejectionCode;
  }
>;

export type GreaterRealmAttemptCheckpointBinding = Readonly<{
  generatorVersion: string;
  sourceCommit: string;
  toolchainReceipt: string;
  toolchainProfile: string;
  nodeVersion: string;
  requestedCount: 1;
  maximumAttempts: number;
}>;

export type GreaterRealmAttemptCheckpointState = Readonly<{
  kind: typeof CHECKPOINT_KIND;
  sequence: number;
  phase: 'searching' | 'accepted';
  binding: GreaterRealmAttemptCheckpointBinding;
  batchHandle: string;
  rootSeed: Buffer;
  nextOrdinal: number;
  candidateHandle: string;
  rejectedAttempts: readonly GreaterRealmCheckpointRejectedAttempt[];
  acceptedPerformance: GreaterRealmCandidatePerformance | null;
  acceptedCandidateDigest: string | null;
  previousRecordDigest: string | null;
  recordDigest: string;
}>;

export type GreaterRealmAttemptCompletionReceipt = Readonly<{
  kind: typeof COMPLETION_KIND;
  binding: GreaterRealmAttemptCheckpointBinding;
  batchHandle: string;
  candidateHandle: string;
  nextOrdinal: number;
  rejectedAttempts: readonly GreaterRealmCheckpointRejectedAttempt[];
  acceptedPerformance: GreaterRealmCandidatePerformance;
  acceptedCandidateDigest: string;
  finalRecordDigest: string;
  receiptDigest: string;
}>;

type SerializedCheckpoint = Readonly<{
  kind: typeof CHECKPOINT_KIND;
  sequence: number;
  phase: 'searching' | 'accepted';
  binding: GreaterRealmAttemptCheckpointBinding;
  batchHandle: string;
  nextOrdinal: number;
  candidateHandle: string;
  rejectedAttempts: readonly GreaterRealmCheckpointRejectedAttempt[];
  acceptedPerformance: GreaterRealmCandidatePerformance | null;
  acceptedCandidateDigest: string | null;
  previousRecordDigest: string | null;
}>;

type SerializedCompletionReceipt = Omit<
  GreaterRealmAttemptCompletionReceipt,
  'receiptDigest'
>;

function fail(code = 'GREATER_REALM_ATTEMPT_CHECKPOINT_INVALID'): never {
  throw new Error(code);
}

function exactRecord(
  value: unknown,
  expectedKeys: readonly string[],
): Readonly<Record<string, unknown>> {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  ) fail();
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) fail();
  const actual = (ownKeys as string[]).sort();
  const expected = [...expectedKeys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) fail();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Object.values(descriptors).some(descriptor => !('value' in descriptor))) fail();
  return value as Readonly<Record<string, unknown>>;
}

function sameIdentity(
  left: Pick<Stats, 'dev' | 'ino'>,
  right: Pick<Stats, 'dev' | 'ino'>,
): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function validateBinding(
  value: GreaterRealmAttemptCheckpointBinding,
): GreaterRealmAttemptCheckpointBinding {
  const binding = exactRecord(value, [
    'generatorVersion',
    'maximumAttempts',
    'nodeVersion',
    'requestedCount',
    'sourceCommit',
    'toolchainProfile',
    'toolchainReceipt',
  ]);
  if (
    typeof binding.generatorVersion !== 'string'
    || !GREATER_REALM_GENERATOR_VERSION_PATTERN.test(binding.generatorVersion)
    || typeof binding.sourceCommit !== 'string'
    || !SOURCE_COMMIT_PATTERN.test(binding.sourceCommit)
    || typeof binding.toolchainReceipt !== 'string'
    || !TOOLCHAIN_RECEIPT_PATTERN.test(binding.toolchainReceipt)
    || typeof binding.toolchainProfile !== 'string'
    || !TOOLCHAIN_PROFILE_PATTERN.test(binding.toolchainProfile)
    || typeof binding.nodeVersion !== 'string'
    || !NODE_VERSION_PATTERN.test(binding.nodeVersion)
    || binding.requestedCount !== 1
    || !Number.isSafeInteger(binding.maximumAttempts)
    || (binding.maximumAttempts as number) < MINIMUM_ATTEMPTS
    || (binding.maximumAttempts as number) > MAXIMUM_ATTEMPTS
  ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_INVALID');
  return Object.freeze({
    generatorVersion: binding.generatorVersion,
    sourceCommit: binding.sourceCommit,
    toolchainReceipt: binding.toolchainReceipt,
    toolchainProfile: binding.toolchainProfile,
    nodeVersion: binding.nodeVersion,
    requestedCount: 1,
    maximumAttempts: binding.maximumAttempts as number,
  });
}

function bindingEqual(
  left: GreaterRealmAttemptCheckpointBinding,
  right: GreaterRealmAttemptCheckpointBinding,
): boolean {
  return left.generatorVersion === right.generatorVersion
    && left.sourceCommit === right.sourceCommit
    && left.toolchainReceipt === right.toolchainReceipt
    && left.toolchainProfile === right.toolchainProfile
    && left.nodeVersion === right.nodeVersion
    && left.requestedCount === right.requestedCount
    && left.maximumAttempts === right.maximumAttempts;
}

function validatePerformance(value: unknown): GreaterRealmCandidatePerformance {
  const performance = exactRecord(value, [
    'generationMilliseconds',
    'processPeakMemoryMiB',
  ]);
  if (
    !Number.isSafeInteger(performance.generationMilliseconds)
    || (performance.generationMilliseconds as number) < 100
    || (performance.generationMilliseconds as number) % 100 !== 0
    || (performance.generationMilliseconds as number) > 7 * 24 * 60 * 60 * 1_000
    || !Number.isSafeInteger(performance.processPeakMemoryMiB)
    || (performance.processPeakMemoryMiB as number) < 1
    || (performance.processPeakMemoryMiB as number) > 1_048_576
    || (
      performance.processPeakMemoryMiB !== 1
      && (performance.processPeakMemoryMiB as number) % 8 !== 0
    )
  ) fail();
  return Object.freeze({
    generationMilliseconds: performance.generationMilliseconds as number,
    processPeakMemoryMiB: performance.processPeakMemoryMiB as number,
  });
}

function validateRejectedAttempt(
  value: unknown,
  expectedOrdinal: number,
): GreaterRealmCheckpointRejectedAttempt {
  const kind = value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as { kind?: unknown }).kind
    : undefined;
  if (kind === 'proof-rejection') {
    const row = exactRecord(value, [
      'activeCellCount',
      'candidateOrdinal',
      'failedProofs',
      'kind',
    ]);
    if (
      row.candidateOrdinal !== expectedOrdinal
      || !Number.isSafeInteger(row.activeCellCount)
      || (row.activeCellCount as number) < 1
      || (row.activeCellCount as number) > 219_511
      || !Array.isArray(row.failedProofs)
      || row.failedProofs.length < 1
      || row.failedProofs.length > 64
      || new Set(row.failedProofs).size !== row.failedProofs.length
      || row.failedProofs.some(proof => (
        typeof proof !== 'string' || !PROOF_CODE_PATTERN.test(proof)
      ))
    ) fail();
    return Object.freeze({
      kind,
      candidateOrdinal: expectedOrdinal,
      activeCellCount: row.activeCellCount as number,
      failedProofs: Object.freeze([...(row.failedProofs as string[])]),
    });
  }
  if (kind === 'geography-exhaustion') {
    const row = exactRecord(value, [
      'candidateOrdinal',
      'kind',
      'rejectionCode',
    ]);
    if (
      row.candidateOrdinal !== expectedOrdinal
      || typeof row.rejectionCode !== 'string'
      || !(GREATER_REALM_CANDIDATE_REJECTION_CODES as readonly string[])
        .includes(row.rejectionCode)
    ) fail();
    return Object.freeze({
      kind,
      candidateOrdinal: expectedOrdinal,
      rejectionCode: row.rejectionCode as GreaterRealmCandidateRejectionCode,
    });
  }
  return fail();
}

function parseSerializedCheckpoint(
  value: unknown,
  rootSeed: Buffer,
  expectedSequence: number,
): GreaterRealmAttemptCheckpointState {
  const row = exactRecord(value, [
    'acceptedCandidateDigest',
    'acceptedPerformance',
    'batchHandle',
    'binding',
    'candidateHandle',
    'kind',
    'nextOrdinal',
    'phase',
    'previousRecordDigest',
    'rejectedAttempts',
    'sequence',
  ]);
  const binding = validateBinding(row.binding as GreaterRealmAttemptCheckpointBinding);
  if (
    row.kind !== CHECKPOINT_KIND
    || row.sequence !== expectedSequence
    || !Number.isSafeInteger(row.nextOrdinal)
    || (row.nextOrdinal as number) < 0
    || (row.nextOrdinal as number) > binding.maximumAttempts
    || typeof row.batchHandle !== 'string'
    || !GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN.test(row.batchHandle)
    || typeof row.candidateHandle !== 'string'
    || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(row.candidateHandle)
    || (row.phase !== 'searching' && row.phase !== 'accepted')
    || !Array.isArray(row.rejectedAttempts)
    || row.rejectedAttempts.length !== row.nextOrdinal
    || (
      row.previousRecordDigest !== null
      && (
        typeof row.previousRecordDigest !== 'string'
        || !SHA256_PATTERN.test(row.previousRecordDigest)
      )
    )
    || (expectedSequence === 0) !== (row.previousRecordDigest === null)
    || rootSeed.byteLength !== ROOT_SEED_BYTES
    || rootSeed.every(byte => byte === 0)
  ) fail();
  const rejectedAttempts = Object.freeze(row.rejectedAttempts.map((attempt, ordinal) => (
    validateRejectedAttempt(attempt, ordinal)
  )));
  const nextOrdinal = row.nextOrdinal as number;
  let acceptedPerformance: GreaterRealmCandidatePerformance | null = null;
  if (row.phase === 'searching') {
    if (
      row.acceptedPerformance !== null
      || row.acceptedCandidateDigest !== null
      || row.sequence !== nextOrdinal
    ) fail();
  } else {
    if (
      nextOrdinal >= binding.maximumAttempts
      || row.acceptedPerformance === null
      || typeof row.acceptedCandidateDigest !== 'string'
      || !SHA256_PATTERN.test(row.acceptedCandidateDigest)
      || row.sequence !== nextOrdinal + 1
    ) fail();
    acceptedPerformance = validatePerformance(row.acceptedPerformance);
  }
  return Object.freeze({
    kind: CHECKPOINT_KIND,
    sequence: expectedSequence,
    phase: row.phase,
    binding,
    batchHandle: row.batchHandle,
    rootSeed,
    nextOrdinal,
    candidateHandle: row.candidateHandle,
    rejectedAttempts,
    acceptedPerformance,
    acceptedCandidateDigest: row.acceptedCandidateDigest as string | null,
    previousRecordDigest: row.previousRecordDigest as string | null,
    recordDigest: '',
  });
}

function serializeCheckpoint(state: GreaterRealmAttemptCheckpointState): SerializedCheckpoint {
  return Object.freeze({
    kind: CHECKPOINT_KIND,
    sequence: state.sequence,
    phase: state.phase,
    binding: state.binding,
    batchHandle: state.batchHandle,
    nextOrdinal: state.nextOrdinal,
    candidateHandle: state.candidateHandle,
    rejectedAttempts: state.rejectedAttempts,
    acceptedPerformance: state.acceptedPerformance,
    acceptedCandidateDigest: state.acceptedCandidateDigest,
    previousRecordDigest: state.previousRecordDigest,
  });
}

function parseSerializedCompletionReceipt(
  value: unknown,
): GreaterRealmAttemptCompletionReceipt {
  const row = exactRecord(value, [
    'acceptedCandidateDigest',
    'acceptedPerformance',
    'batchHandle',
    'binding',
    'candidateHandle',
    'finalRecordDigest',
    'kind',
    'nextOrdinal',
    'rejectedAttempts',
  ]);
  const binding = validateBinding(row.binding as GreaterRealmAttemptCheckpointBinding);
  if (
    row.kind !== COMPLETION_KIND
    || typeof row.batchHandle !== 'string'
    || !GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN.test(row.batchHandle)
    || typeof row.candidateHandle !== 'string'
    || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(row.candidateHandle)
    || !Number.isSafeInteger(row.nextOrdinal)
    || (row.nextOrdinal as number) < 0
    || (row.nextOrdinal as number) >= binding.maximumAttempts
    || !Array.isArray(row.rejectedAttempts)
    || row.rejectedAttempts.length !== row.nextOrdinal
    || typeof row.finalRecordDigest !== 'string'
    || !SHA256_PATTERN.test(row.finalRecordDigest)
    || typeof row.acceptedCandidateDigest !== 'string'
    || !SHA256_PATTERN.test(row.acceptedCandidateDigest)
  ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  const rejectedAttempts = Object.freeze(row.rejectedAttempts.map((attempt, ordinal) => (
    validateRejectedAttempt(attempt, ordinal)
  )));
  return Object.freeze({
    kind: COMPLETION_KIND,
    binding,
    batchHandle: row.batchHandle,
    candidateHandle: row.candidateHandle,
    nextOrdinal: row.nextOrdinal as number,
    rejectedAttempts,
    acceptedPerformance: validatePerformance(row.acceptedPerformance),
    acceptedCandidateDigest: row.acceptedCandidateDigest,
    finalRecordDigest: row.finalRecordDigest,
    receiptDigest: '',
  });
}

function serializeCompletionReceipt(
  receipt: GreaterRealmAttemptCompletionReceipt,
): SerializedCompletionReceipt {
  return Object.freeze({
    kind: COMPLETION_KIND,
    binding: receipt.binding,
    batchHandle: receipt.batchHandle,
    candidateHandle: receipt.candidateHandle,
    nextOrdinal: receipt.nextOrdinal,
    rejectedAttempts: receipt.rejectedAttempts,
    acceptedPerformance: receipt.acceptedPerformance,
    acceptedCandidateDigest: receipt.acceptedCandidateDigest,
    finalRecordDigest: receipt.finalRecordDigest,
  });
}

function ownerKeyEnvelope(secret: Uint8Array): Buffer {
  if (!(secret instanceof Uint8Array) || secret.byteLength !== OWNER_KEY_BYTES) fail();
  const envelope = Buffer.alloc(OWNER_KEY_MARKER.byteLength + 1 + OWNER_KEY_BYTES);
  OWNER_KEY_MARKER.copy(envelope, 0);
  envelope[OWNER_KEY_MARKER.byteLength] = FORMAT_VERSION;
  envelope.set(secret, OWNER_KEY_MARKER.byteLength + 1);
  return envelope;
}

function readOwnerKey(
  workspace: GreaterRealmPrivateWorkspace,
  create: boolean,
): Buffer {
  workspace.ensureDirectory('secrets');
  const keyStatus = workspace.recoverAtomicFileWrite(OWNER_KEY_PATH);
  if (keyStatus === 'absent') {
    if (!create) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_KEY_MISSING');
    const secret = randomBytes(OWNER_KEY_BYTES);
    const envelope = ownerKeyEnvelope(secret);
    try {
      workspace.writeFileAtomic(OWNER_KEY_PATH, envelope, envelope.byteLength);
      return secret;
    } catch (error) {
      secret.fill(0);
      throw error;
    } finally {
      envelope.fill(0);
    }
  }
  const expectedBytes = OWNER_KEY_MARKER.byteLength + 1 + OWNER_KEY_BYTES;
  const envelope = workspace.readFile(OWNER_KEY_PATH, expectedBytes);
  try {
    if (
      envelope.byteLength !== expectedBytes
      || !timingSafeEqual(
        envelope.subarray(0, OWNER_KEY_MARKER.byteLength),
        OWNER_KEY_MARKER,
      )
      || envelope[OWNER_KEY_MARKER.byteLength] !== FORMAT_VERSION
    ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_KEY_INVALID');
    const key = Buffer.from(envelope.subarray(OWNER_KEY_MARKER.byteLength + 1));
    if (key.every(byte => byte === 0)) {
      key.fill(0);
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_KEY_INVALID');
    }
    return key;
  } finally {
    envelope.fill(0);
  }
}

function checkpointPath(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 0 || sequence > MAXIMUM_ATTEMPTS) {
    fail();
  }
  return `${CHECKPOINT_DIRECTORY}/${sequence.toString().padStart(3, '0')}.wkgr-checkpoint`;
}

function checkpointRecordDigest(envelope: Uint8Array): string {
  return createHash('sha256').update(envelope).digest('hex');
}

function sealCheckpoint(
  state: GreaterRealmAttemptCheckpointState,
  key: Buffer,
): Buffer {
  if (key.byteLength !== OWNER_KEY_BYTES || state.rootSeed.byteLength !== ROOT_SEED_BYTES) fail();
  const metadata = Buffer.from(JSON.stringify(serializeCheckpoint(state)), 'utf8');
  if (metadata.byteLength < 1 || metadata.byteLength > MAXIMUM_METADATA_BYTES) {
    metadata.fill(0);
    fail();
  }
  const plaintext = Buffer.alloc(ROOT_SEED_BYTES + METADATA_LENGTH_BYTES + metadata.byteLength);
  plaintext.set(state.rootSeed, 0);
  plaintext.writeUInt32BE(metadata.byteLength, ROOT_SEED_BYTES);
  plaintext.set(metadata, ROOT_SEED_BYTES + METADATA_LENGTH_BYTES);
  const nonce = randomBytes(NONCE_BYTES);
  const header = Buffer.alloc(
    CHECKPOINT_MARKER.byteLength + 1 + NONCE_BYTES + METADATA_LENGTH_BYTES,
  );
  CHECKPOINT_MARKER.copy(header, 0);
  let offset = CHECKPOINT_MARKER.byteLength;
  header[offset] = FORMAT_VERSION;
  offset += 1;
  header.set(nonce, offset);
  offset += NONCE_BYTES;
  header.writeUInt32BE(plaintext.byteLength, offset);
  const cipher = createCipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AUTHENTICATION_TAG_BYTES,
  });
  cipher.setAAD(header, { plaintextLength: plaintext.byteLength });
  let first: Buffer | undefined;
  let final: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  try {
    first = cipher.update(plaintext);
    final = cipher.final();
    ciphertext = Buffer.concat([first, final]);
    const tag = cipher.getAuthTag();
    try {
      if (
        tag.byteLength !== AUTHENTICATION_TAG_BYTES
        || ciphertext.byteLength !== plaintext.byteLength
      ) fail();
      return Buffer.concat([header, tag, ciphertext]);
    } finally {
      tag.fill(0);
    }
  } finally {
    metadata.fill(0);
    plaintext.fill(0);
    nonce.fill(0);
    header.fill(0);
    first?.fill(0);
    final?.fill(0);
    ciphertext?.fill(0);
  }
}

function openCheckpoint(
  envelope: Buffer,
  key: Buffer,
  expectedSequence: number,
): GreaterRealmAttemptCheckpointState {
  const headerBytes = CHECKPOINT_MARKER.byteLength + 1 + NONCE_BYTES + METADATA_LENGTH_BYTES;
  if (
    envelope.byteLength < headerBytes + AUTHENTICATION_TAG_BYTES + ROOT_SEED_BYTES
    || envelope.byteLength > MAXIMUM_CHECKPOINT_BYTES
    || key.byteLength !== OWNER_KEY_BYTES
    || !timingSafeEqual(
      envelope.subarray(0, CHECKPOINT_MARKER.byteLength),
      CHECKPOINT_MARKER,
    )
  ) fail();
  let offset = CHECKPOINT_MARKER.byteLength;
  if (envelope[offset] !== FORMAT_VERSION) fail();
  offset += 1;
  const nonce = envelope.subarray(offset, offset + NONCE_BYTES);
  offset += NONCE_BYTES;
  const plaintextBytes = envelope.readUInt32BE(offset);
  offset += METADATA_LENGTH_BYTES;
  if (
    plaintextBytes < ROOT_SEED_BYTES + METADATA_LENGTH_BYTES + 1
    || plaintextBytes > ROOT_SEED_BYTES + METADATA_LENGTH_BYTES + MAXIMUM_METADATA_BYTES
    || envelope.byteLength !== headerBytes + AUTHENTICATION_TAG_BYTES + plaintextBytes
  ) fail();
  const header = envelope.subarray(0, headerBytes);
  const tag = envelope.subarray(offset, offset + AUTHENTICATION_TAG_BYTES);
  offset += AUTHENTICATION_TAG_BYTES;
  const ciphertext = envelope.subarray(offset);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce, {
    authTagLength: AUTHENTICATION_TAG_BYTES,
  });
  decipher.setAAD(header, { plaintextLength: plaintextBytes });
  decipher.setAuthTag(tag);
  let first: Buffer | undefined;
  let final: Buffer | undefined;
  let plaintext: Buffer | undefined;
  let rootSeed: Buffer | undefined;
  try {
    first = decipher.update(ciphertext);
    final = decipher.final();
    plaintext = Buffer.concat([first, final]);
    if (plaintext.byteLength !== plaintextBytes) fail();
    rootSeed = Buffer.from(plaintext.subarray(0, ROOT_SEED_BYTES));
    const metadataBytes = plaintext.readUInt32BE(ROOT_SEED_BYTES);
    if (
      metadataBytes < 1
      || metadataBytes > MAXIMUM_METADATA_BYTES
      || ROOT_SEED_BYTES + METADATA_LENGTH_BYTES + metadataBytes !== plaintext.byteLength
    ) fail();
    const value = JSON.parse(
      plaintext.subarray(ROOT_SEED_BYTES + METADATA_LENGTH_BYTES).toString('utf8'),
    ) as unknown;
    const state = parseSerializedCheckpoint(value, rootSeed, expectedSequence);
    rootSeed = undefined;
    return state;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('GREATER_REALM_')) throw error;
    return fail();
  } finally {
    first?.fill(0);
    final?.fill(0);
    plaintext?.fill(0);
    rootSeed?.fill(0);
  }
}

function completionReceiptDigest(envelope: Uint8Array): string {
  return createHash('sha256').update(envelope).digest('hex');
}

function sealCompletionReceipt(
  receipt: GreaterRealmAttemptCompletionReceipt,
  key: Buffer,
): Buffer {
  if (key.byteLength !== OWNER_KEY_BYTES) {
    fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  }
  const metadata = Buffer.from(JSON.stringify(serializeCompletionReceipt(receipt)), 'utf8');
  if (metadata.byteLength < 1 || metadata.byteLength > MAXIMUM_METADATA_BYTES) {
    metadata.fill(0);
    fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  }
  const header = Buffer.alloc(COMPLETION_MARKER.byteLength + 1 + METADATA_LENGTH_BYTES);
  COMPLETION_MARKER.copy(header, 0);
  header[COMPLETION_MARKER.byteLength] = FORMAT_VERSION;
  header.writeUInt32BE(metadata.byteLength, COMPLETION_MARKER.byteLength + 1);
  const authentication = createHmac('sha256', key)
    .update(header)
    .update(metadata)
    .digest();
  try {
    if (authentication.byteLength !== COMPLETION_AUTHENTICATION_BYTES) {
      fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    }
    return Buffer.concat([header, metadata, authentication]);
  } finally {
    metadata.fill(0);
    header.fill(0);
    authentication.fill(0);
  }
}

function openCompletionReceipt(
  envelope: Buffer,
  key: Buffer,
): GreaterRealmAttemptCompletionReceipt {
  const headerBytes = COMPLETION_MARKER.byteLength + 1 + METADATA_LENGTH_BYTES;
  try {
    if (
      key.byteLength !== OWNER_KEY_BYTES
      || envelope.byteLength < headerBytes + 1 + COMPLETION_AUTHENTICATION_BYTES
      || envelope.byteLength > MAXIMUM_COMPLETION_BYTES
      || !timingSafeEqual(
        envelope.subarray(0, COMPLETION_MARKER.byteLength),
        COMPLETION_MARKER,
      )
      || envelope[COMPLETION_MARKER.byteLength] !== FORMAT_VERSION
    ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    const metadataBytes = envelope.readUInt32BE(COMPLETION_MARKER.byteLength + 1);
    if (
      metadataBytes < 1
      || metadataBytes > MAXIMUM_METADATA_BYTES
      || envelope.byteLength
        !== headerBytes + metadataBytes + COMPLETION_AUTHENTICATION_BYTES
    ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    const header = envelope.subarray(0, headerBytes);
    const metadata = envelope.subarray(headerBytes, headerBytes + metadataBytes);
    const authentication = envelope.subarray(headerBytes + metadataBytes);
    const expectedAuthentication = createHmac('sha256', key)
      .update(header)
      .update(metadata)
      .digest();
    try {
      if (
        authentication.byteLength !== expectedAuthentication.byteLength
        || !timingSafeEqual(authentication, expectedAuthentication)
      ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    } finally {
      expectedAuthentication.fill(0);
    }
    const receipt = parseSerializedCompletionReceipt(
      JSON.parse(metadata.toString('utf8')) as unknown,
    );
    return Object.freeze({
      ...receipt,
      receiptDigest: completionReceiptDigest(envelope),
    });
  } catch {
    return fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  }
}

function withRecordDigest(
  state: GreaterRealmAttemptCheckpointState,
  recordDigest: string,
): GreaterRealmAttemptCheckpointState {
  if (!SHA256_PATTERN.test(recordDigest)) fail();
  return Object.freeze({ ...state, recordDigest });
}

function assertDirectoryInventory(
  workspace: GreaterRealmPrivateWorkspace,
  expectedFileCount: number,
): void {
  const inventory = workspace.attestTree(CHECKPOINT_DIRECTORY);
  if (
    inventory.fileCount !== expectedFileCount
    || inventory.directoryCount !== 1
    || inventory.entryCount !== expectedFileCount + 1
  ) fail();
}

function writeState(
  workspace: GreaterRealmPrivateWorkspace,
  state: GreaterRealmAttemptCheckpointState,
  createKey: boolean,
): GreaterRealmAttemptCheckpointState {
  if (workspace.recoverAtomicFileWrite(checkpointPath(state.sequence)) === 'installed') {
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CONFLICT');
  }
  const key = readOwnerKey(workspace, createKey);
  let envelope: Buffer | undefined;
  try {
    envelope = sealCheckpoint(state, key);
    const digest = checkpointRecordDigest(envelope);
    workspace.writeFileAtomic(
      checkpointPath(state.sequence),
      envelope,
      MAXIMUM_CHECKPOINT_BYTES,
    );
    assertDirectoryInventory(workspace, state.sequence + 1);
    return withRecordDigest(state, digest);
  } finally {
    key.fill(0);
    envelope?.fill(0);
  }
}

function validateTransition(
  previous: GreaterRealmAttemptCheckpointState,
  current: GreaterRealmAttemptCheckpointState,
): void {
  if (
    previous.phase !== 'searching'
    || current.sequence !== previous.sequence + 1
    || current.previousRecordDigest !== previous.recordDigest
    || !bindingEqual(current.binding, previous.binding)
    || current.batchHandle !== previous.batchHandle
    || !timingSafeEqual(current.rootSeed, previous.rootSeed)
    || current.rejectedAttempts.length < previous.rejectedAttempts.length
  ) fail();
  for (let index = 0; index < previous.rejectedAttempts.length; index += 1) {
    if (
      JSON.stringify(current.rejectedAttempts[index])
      !== JSON.stringify(previous.rejectedAttempts[index])
    ) fail();
  }
  if (current.phase === 'searching') {
    if (
      current.nextOrdinal !== previous.nextOrdinal + 1
      || current.rejectedAttempts.length !== previous.rejectedAttempts.length + 1
      || current.rejectedAttempts.at(-1)?.candidateOrdinal !== previous.nextOrdinal
    ) fail();
    return;
  }
  if (
    current.nextOrdinal !== previous.nextOrdinal
    || current.candidateHandle !== previous.candidateHandle
    || current.rejectedAttempts.length !== previous.rejectedAttempts.length
  ) fail();
}

function checkpointDirectoryExists(workspace: GreaterRealmPrivateWorkspace): boolean {
  const parent = workspace.ensureDirectory(CHECKPOINT_PARENT_DIRECTORY);
  return existsSync(join(parent, 'single-world-generation'));
}

function completionDirectoryExists(workspace: GreaterRealmPrivateWorkspace): boolean {
  const parent = workspace.ensureDirectory(CHECKPOINT_PARENT_DIRECTORY);
  return existsSync(join(parent, 'single-world-completion'));
}

function recoverCheckpointRecordWrites(workspace: GreaterRealmPrivateWorkspace): void {
  if (!checkpointDirectoryExists(workspace)) return;
  for (let sequence = 0; sequence <= MAXIMUM_ATTEMPTS; sequence += 1) {
    workspace.recoverAtomicFileWrite(checkpointPath(sequence));
  }
}

export function createGreaterRealmAttemptCheckpoint(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  binding: GreaterRealmAttemptCheckpointBinding;
  batchHandle: string;
  rootSeed: Uint8Array;
  candidateHandle: string;
}>): GreaterRealmAttemptCheckpointState {
  recoverRetiredPrivateStateDirectories(input.workspace);
  const binding = validateBinding(input.binding);
  if (
    !GREATER_REALM_REVIEW_BATCH_HANDLE_PATTERN.test(input.batchHandle)
    || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(input.candidateHandle)
    || !(input.rootSeed instanceof Uint8Array)
    || input.rootSeed.byteLength !== ROOT_SEED_BYTES
    || input.rootSeed.every(byte => byte === 0)
  ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_INVALID');
  const completion = readGreaterRealmAttemptCompletionReceipt({
    workspace: input.workspace,
  });
  if (completion !== null) {
    fail('GREATER_REALM_ATTEMPT_COMPLETION_EXISTS');
  }
  if (checkpointDirectoryExists(input.workspace)) {
    recoverCheckpointRecordWrites(input.workspace);
    const inventory = input.workspace.attestTree(CHECKPOINT_DIRECTORY);
    if (
      inventory.fileCount !== 0
      || inventory.directoryCount !== 1
      || inventory.entryCount !== 1
    ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_EXISTS');
  } else {
    input.workspace.ensureDirectory(CHECKPOINT_DIRECTORY);
  }
  assertDirectoryInventory(input.workspace, 0);
  const state: GreaterRealmAttemptCheckpointState = Object.freeze({
    kind: CHECKPOINT_KIND,
    sequence: 0,
    phase: 'searching',
    binding,
    batchHandle: input.batchHandle,
    rootSeed: Buffer.from(input.rootSeed),
    nextOrdinal: 0,
    candidateHandle: input.candidateHandle,
    rejectedAttempts: Object.freeze([]),
    acceptedPerformance: null,
    acceptedCandidateDigest: null,
    previousRecordDigest: null,
    recordDigest: '',
  });
  try {
    return writeState(input.workspace, state, true);
  } catch (error) {
    state.rootSeed.fill(0);
    throw error;
  }
}

function loadGreaterRealmAttemptCheckpoint(
  workspace: GreaterRealmPrivateWorkspace,
  expectedBinding?: GreaterRealmAttemptCheckpointBinding,
): GreaterRealmAttemptCheckpointState {
  const binding = expectedBinding === undefined
    ? undefined
    : validateBinding(expectedBinding);
  if (!checkpointDirectoryExists(workspace)) {
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
  }
  recoverCheckpointRecordWrites(workspace);
  const key = readOwnerKey(workspace, false);
  let latest: GreaterRealmAttemptCheckpointState | undefined;
  let gap = false;
  let recordCount = 0;
  try {
    for (let sequence = 0; sequence <= MAXIMUM_ATTEMPTS; sequence += 1) {
      const path = checkpointPath(sequence);
      if (!workspace.hasFile(path)) {
        gap = true;
        continue;
      }
      if (gap) fail();
      const envelope = workspace.readFile(path, MAXIMUM_CHECKPOINT_BYTES);
      let current: GreaterRealmAttemptCheckpointState | undefined;
      try {
        current = withRecordDigest(
          openCheckpoint(envelope, key, sequence),
          checkpointRecordDigest(envelope),
        );
      } finally {
        envelope.fill(0);
      }
      if (binding !== undefined && !bindingEqual(current.binding, binding)) {
        current.rootSeed.fill(0);
        fail('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_MISMATCH');
      }
      if (latest !== undefined) {
        try {
          validateTransition(latest, current);
        } catch (error) {
          current.rootSeed.fill(0);
          throw error;
        } finally {
          latest.rootSeed.fill(0);
        }
      }
      latest = current;
      recordCount += 1;
    }
    if (latest === undefined || recordCount !== latest.sequence + 1) {
      latest?.rootSeed.fill(0);
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
    }
    assertDirectoryInventory(workspace, recordCount);
    const result = latest;
    latest = undefined;
    return result;
  } finally {
    key.fill(0);
    latest?.rootSeed.fill(0);
  }
}

export function resumeGreaterRealmAttemptCheckpoint(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  binding: GreaterRealmAttemptCheckpointBinding;
}>): GreaterRealmAttemptCheckpointState {
  recoverRetiredPrivateStateDirectories(input.workspace);
  return loadGreaterRealmAttemptCheckpoint(input.workspace, input.binding);
}

export function recordGreaterRealmRejectedAttempt(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  state: GreaterRealmAttemptCheckpointState;
  rejectedAttempt: GreaterRealmCheckpointRejectedAttempt;
  nextCandidateHandle: string;
}>): GreaterRealmAttemptCheckpointState {
  recoverRetiredPrivateStateDirectories(input.workspace);
  if (
    input.state.phase !== 'searching'
    || input.state.nextOrdinal >= input.state.binding.maximumAttempts
    || !GREATER_REALM_CANDIDATE_HANDLE_PATTERN.test(input.nextCandidateHandle)
  ) fail();
  const rejectedAttempt = validateRejectedAttempt(
    input.rejectedAttempt,
    input.state.nextOrdinal,
  );
  const state: GreaterRealmAttemptCheckpointState = Object.freeze({
    ...input.state,
    sequence: input.state.sequence + 1,
    nextOrdinal: input.state.nextOrdinal + 1,
    candidateHandle: input.nextCandidateHandle,
    rejectedAttempts: Object.freeze([
      ...input.state.rejectedAttempts,
      rejectedAttempt,
    ]),
    previousRecordDigest: input.state.recordDigest,
    recordDigest: '',
  });
  return writeState(input.workspace, state, false);
}

export function recordGreaterRealmAcceptedAttempt(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  state: GreaterRealmAttemptCheckpointState;
  performance: GreaterRealmCandidatePerformance;
  candidateDigest: string;
}>): GreaterRealmAttemptCheckpointState {
  recoverRetiredPrivateStateDirectories(input.workspace);
  if (
    input.state.phase !== 'searching'
    || input.state.nextOrdinal >= input.state.binding.maximumAttempts
    || !SHA256_PATTERN.test(input.candidateDigest)
  ) fail();
  const state: GreaterRealmAttemptCheckpointState = Object.freeze({
    ...input.state,
    sequence: input.state.sequence + 1,
    phase: 'accepted',
    acceptedPerformance: validatePerformance(input.performance),
    acceptedCandidateDigest: input.candidateDigest,
    previousRecordDigest: input.state.recordDigest,
    recordDigest: '',
  });
  return writeState(input.workspace, state, false);
}

function completionReceiptMatchesState(
  receipt: GreaterRealmAttemptCompletionReceipt,
  state: GreaterRealmAttemptCheckpointState,
): boolean {
  return state.phase === 'accepted'
    && state.acceptedPerformance !== null
    && bindingEqual(receipt.binding, state.binding)
    && receipt.batchHandle === state.batchHandle
    && receipt.candidateHandle === state.candidateHandle
    && receipt.nextOrdinal === state.nextOrdinal
    && receipt.finalRecordDigest === state.recordDigest
    && JSON.stringify(receipt.rejectedAttempts) === JSON.stringify(state.rejectedAttempts)
    && receipt.acceptedPerformance.generationMilliseconds
      === state.acceptedPerformance.generationMilliseconds
    && receipt.acceptedPerformance.processPeakMemoryMiB
      === state.acceptedPerformance.processPeakMemoryMiB
    && receipt.acceptedCandidateDigest === state.acceptedCandidateDigest;
}

export function readGreaterRealmAttemptCompletionReceipt(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  binding?: GreaterRealmAttemptCheckpointBinding;
}>): GreaterRealmAttemptCompletionReceipt | null {
  recoverRetiredPrivateStateDirectories(input.workspace);
  const expectedBinding = input.binding === undefined
    ? undefined
    : validateBinding(input.binding);
  if (!completionDirectoryExists(input.workspace)) return null;
  const fileStatus = input.workspace.recoverAtomicFileWrite(COMPLETION_PATH);
  const inventory = input.workspace.attestTree(COMPLETION_DIRECTORY);
  if (fileStatus === 'absent') {
    if (
      inventory.fileCount !== 0
      || inventory.directoryCount !== 1
      || inventory.entryCount !== 1
    ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    return null;
  }
  if (
    inventory.fileCount !== 1
    || inventory.directoryCount !== 1
    || inventory.entryCount !== 2
  ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  const key = readOwnerKey(input.workspace, false);
  const envelope = input.workspace.readFile(COMPLETION_PATH, MAXIMUM_COMPLETION_BYTES);
  try {
    const receipt = openCompletionReceipt(envelope, key);
    if (
      expectedBinding !== undefined
      && !bindingEqual(receipt.binding, expectedBinding)
    ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_REQUEST_MISMATCH');
    return receipt;
  } finally {
    envelope.fill(0);
    key.fill(0);
  }
}

export function writeGreaterRealmAttemptCompletionReceipt(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  state: GreaterRealmAttemptCheckpointState;
}>): GreaterRealmAttemptCompletionReceipt {
  recoverRetiredPrivateStateDirectories(input.workspace);
  if (
    input.state.phase !== 'accepted'
    || input.state.acceptedPerformance === null
    || input.state.acceptedCandidateDigest === null
  ) {
    fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  }
  const authenticated = loadGreaterRealmAttemptCheckpoint(
    input.workspace,
    input.state.binding,
  );
  try {
    if (
      authenticated.recordDigest !== input.state.recordDigest
      || !completionReceiptMatchesState(Object.freeze({
        kind: COMPLETION_KIND,
        binding: input.state.binding,
        batchHandle: input.state.batchHandle,
        candidateHandle: input.state.candidateHandle,
        nextOrdinal: input.state.nextOrdinal,
        rejectedAttempts: input.state.rejectedAttempts,
        acceptedPerformance: input.state.acceptedPerformance,
        acceptedCandidateDigest: input.state.acceptedCandidateDigest!,
        finalRecordDigest: input.state.recordDigest,
        receiptDigest: '',
      }), authenticated)
    ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  } finally {
    authenticated.rootSeed.fill(0);
  }

  const receipt: GreaterRealmAttemptCompletionReceipt = Object.freeze({
    kind: COMPLETION_KIND,
    binding: input.state.binding,
    batchHandle: input.state.batchHandle,
    candidateHandle: input.state.candidateHandle,
    nextOrdinal: input.state.nextOrdinal,
    rejectedAttempts: input.state.rejectedAttempts,
    acceptedPerformance: input.state.acceptedPerformance,
    acceptedCandidateDigest: input.state.acceptedCandidateDigest!,
    finalRecordDigest: input.state.recordDigest,
    receiptDigest: '',
  });
  const existing = readGreaterRealmAttemptCompletionReceipt({
    workspace: input.workspace,
    binding: input.state.binding,
  });
  if (existing !== null) {
    if (!completionReceiptMatchesState(existing, input.state)) {
      fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    }
    return existing;
  }
  input.workspace.ensureDirectory(COMPLETION_DIRECTORY);
  const inventory = input.workspace.attestTree(COMPLETION_DIRECTORY);
  if (
    inventory.fileCount !== 0
    || inventory.directoryCount !== 1
    || inventory.entryCount !== 1
  ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  const key = readOwnerKey(input.workspace, false);
  let envelope: Buffer | undefined;
  try {
    envelope = sealCompletionReceipt(receipt, key);
    const digest = completionReceiptDigest(envelope);
    input.workspace.writeFileAtomic(
      COMPLETION_PATH,
      envelope,
      MAXIMUM_COMPLETION_BYTES,
    );
    const finalInventory = input.workspace.attestTree(COMPLETION_DIRECTORY);
    if (
      finalInventory.fileCount !== 1
      || finalInventory.directoryCount !== 1
      || finalInventory.entryCount !== 2
    ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    return Object.freeze({ ...receipt, receiptDigest: digest });
  } finally {
    envelope?.fill(0);
    key.fill(0);
  }
}

function assertOwnerOnlyDirectory(status: Stats): void {
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (status.mode & 0o777) !== 0o700
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
}

function fsyncOwnerDirectory(path: string): void {
  let descriptor: number | undefined;
  try {
    const before = lstatSync(path);
    assertOwnerOnlyDirectory(before);
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    const opened = fstatSync(descriptor);
    assertOwnerOnlyDirectory(opened);
    if (!sameIdentity(before, opened)) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
    fsyncSync(descriptor);
    const after = lstatSync(path);
    if (!sameIdentity(opened, after)) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function zeroizeRetiredFile(path: string, status: Stats): void {
  let descriptor: number | undefined;
  const zeros = Buffer.alloc(Math.min(64 * 1024, Math.max(1, status.size)));
  try {
    descriptor = openSync(path, constants.O_RDWR | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || opened.isSymbolicLink()
      || !sameIdentity(status, opened)
      || opened.nlink !== 1
      || opened.size !== status.size
      || (opened.mode & 0o777) !== 0o600
      || (process.getuid !== undefined && opened.uid !== process.getuid())
    ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    let offset = 0;
    while (offset < opened.size) {
      const length = Math.min(zeros.byteLength, opened.size - offset);
      const written = writeSync(descriptor, zeros, 0, length, offset);
      if (written !== length) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    const after = fstatSync(descriptor);
    const current = lstatSync(path);
    if (
      !sameIdentity(opened, after)
      || !sameIdentity(after, current)
      || after.nlink !== 1
      || after.size !== opened.size
    ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    unlinkSync(path);
    if (existsSync(path)) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    fsyncOwnerDirectory(join(path, '..'));
  } finally {
    zeros.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function removeRetiredTree(
  path: string,
  expectedRoot?: Readonly<{ dev: number; ino: number }>,
): void {
  const status = lstatSync(path);
  if (expectedRoot !== undefined && !sameIdentity(status, expectedRoot)) {
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  }
  if (status.isSymbolicLink()) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  if (status.isDirectory()) {
    assertOwnerOnlyDirectory(status);
    for (const entry of readdirSync(path).sort()) {
      removeRetiredTree(join(path, entry));
    }
    rmdirSync(path);
    if (existsSync(path)) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    fsyncOwnerDirectory(join(path, '..'));
    return;
  }
  if (
    !status.isFile()
    || status.nlink !== 1
    || (status.mode & 0o777) !== 0o600
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  zeroizeRetiredFile(path, status);
}

type RetiredPrivateStateRecovery = Readonly<{
  generationCount: number;
  completionCount: number;
}>;

/**
 * Finish a checkpoint retirement that was durably renamed before a hard crash.
 * Only this module's exact UUID-scoped names are eligible: malformed aliases,
 * links, special files, permission drift, and inode substitution all fail
 * closed instead of being swept as private state.
 */
function recoverRetiredPrivateStateDirectories(
  workspace: GreaterRealmPrivateWorkspace,
): RetiredPrivateStateRecovery {
  const parent = workspace.ensureDirectory(CHECKPOINT_PARENT_DIRECTORY);
  let generationCount = 0;
  let completionCount = 0;
  try {
    const parentBefore = lstatSync(parent);
    assertOwnerOnlyDirectory(parentBefore);
    for (const entry of readdirSync(parent, { withFileTypes: true })
      .sort((left, right) => left.name.localeCompare(right.name))) {
      if (!entry.name.startsWith('.retired-')) continue;
      const match = RETIRED_STATE_DIRECTORY.exec(entry.name);
      if (match === null || !entry.isDirectory() || entry.isSymbolicLink()) {
        fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
      }
      const relativePath = `${CHECKPOINT_PARENT_DIRECTORY}/${entry.name}`;
      const path = join(parent, entry.name);
      const before = lstatSync(path);
      assertOwnerOnlyDirectory(before);
      workspace.attestTree(relativePath);
      const current = lstatSync(path);
      if (!sameIdentity(before, current)) {
        fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
      }
      removeRetiredTree(path, Object.freeze({ dev: before.dev, ino: before.ino }));
      if (existsSync(path)) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
      if (match[1] === 'single-world-generation') generationCount += 1;
      else completionCount += 1;
    }
    const parentAfter = lstatSync(parent);
    assertOwnerOnlyDirectory(parentAfter);
    if (!sameIdentity(parentBefore, parentAfter)) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
    if (readdirSync(parent).some(entry => entry.startsWith('.retired-'))) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
    if (generationCount !== 0 || completionCount !== 0) {
      fsyncOwnerDirectory(parent);
    }
    return Object.freeze({ generationCount, completionCount });
  } catch (error) {
    if (
      error instanceof Error
      && error.message === 'GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED'
    ) throw error;
    return fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  }
}

function retirePrivateStateDirectory(
  workspace: GreaterRealmPrivateWorkspace,
  directoryName: 'single-world-generation' | 'single-world-completion',
): boolean {
  const parent = workspace.ensureDirectory(CHECKPOINT_PARENT_DIRECTORY);
  const source = join(parent, directoryName);
  if (!existsSync(source)) return false;
  workspace.attestTree(`${CHECKPOINT_PARENT_DIRECTORY}/${directoryName}`);
  const sourceBefore = lstatSync(source);
  assertOwnerOnlyDirectory(sourceBefore);
  const retired = join(parent, `.retired-${directoryName}-${randomUUID()}`);
  if (existsSync(retired)) fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  let parentDescriptor: number | undefined;
  let sourceDescriptor: number | undefined;
  try {
    parentDescriptor = openSync(
      parent,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    sourceDescriptor = openSync(
      source,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
    );
    const parentOpened = fstatSync(parentDescriptor);
    const sourceOpened = fstatSync(sourceDescriptor);
    assertOwnerOnlyDirectory(parentOpened);
    assertOwnerOnlyDirectory(sourceOpened);
    if (!sameIdentity(sourceBefore, sourceOpened)) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
    renameSync(source, retired);
    const retiredStatus = lstatSync(retired);
    if (existsSync(source) || !sameIdentity(sourceOpened, retiredStatus)) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
    }
    fsyncSync(parentDescriptor);
  } catch (error) {
    if (
      error instanceof Error
      && error.message.startsWith('GREATER_REALM_ATTEMPT_CHECKPOINT_')
    ) throw error;
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  } finally {
    if (sourceDescriptor !== undefined) closeSync(sourceDescriptor);
    if (parentDescriptor !== undefined) closeSync(parentDescriptor);
  }
  try {
    removeRetiredTree(retired);
  } catch {
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  }
  return true;
}

export function clearGreaterRealmAttemptCheckpoint(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  state: GreaterRealmAttemptCheckpointState;
}>): void {
  recoverRetiredPrivateStateDirectories(input.workspace);
  if (input.state.phase !== 'accepted') fail();
  const authenticated = resumeGreaterRealmAttemptCheckpoint({
    workspace: input.workspace,
    binding: input.state.binding,
  });
  try {
    if (
      authenticated.recordDigest !== input.state.recordDigest
      || authenticated.batchHandle !== input.state.batchHandle
      || authenticated.phase !== 'accepted'
    ) fail();
  } finally {
    authenticated.rootSeed.fill(0);
  }
  if (!retirePrivateStateDirectory(input.workspace, 'single-world-generation')) {
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_CLEANUP_FAILED');
  }
}

export function reconcileGreaterRealmAttemptCompletion(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
  receipt: GreaterRealmAttemptCompletionReceipt;
}>): void {
  recoverRetiredPrivateStateDirectories(input.workspace);
  const authenticatedReceipt = readGreaterRealmAttemptCompletionReceipt({
    workspace: input.workspace,
    binding: input.receipt.binding,
  });
  if (
    authenticatedReceipt === null
    || authenticatedReceipt.receiptDigest !== input.receipt.receiptDigest
  ) fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
  if (!checkpointDirectoryExists(input.workspace)) return;
  const state = loadGreaterRealmAttemptCheckpoint(
    input.workspace,
    authenticatedReceipt.binding,
  );
  try {
    if (!completionReceiptMatchesState(authenticatedReceipt, state)) {
      fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    }
    clearGreaterRealmAttemptCheckpoint({ workspace: input.workspace, state });
  } finally {
    state.rootSeed.fill(0);
  }
}

/** Selection must never overtake a generation that has not retired its
 * authenticated attempt boundary. The caller holds the global generation
 * lock, so presence alone is a fail-closed lifecycle signal. */
export function assertGreaterRealmAttemptSelectionReady(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
}>): void {
  recoverRetiredPrivateStateDirectories(input.workspace);
  if (!checkpointDirectoryExists(input.workspace)) return;
  recoverCheckpointRecordWrites(input.workspace);
  input.workspace.attestTree(CHECKPOINT_DIRECTORY);
  fail('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
}

export function abortGreaterRealmAttemptCheckpoint(input: Readonly<{
  workspace: GreaterRealmPrivateWorkspace;
}>): void {
  const recoveredRetirement = recoverRetiredPrivateStateDirectories(input.workspace);
  const hasCheckpointDirectory = checkpointDirectoryExists(input.workspace);
  const hasCompletionDirectory = completionDirectoryExists(input.workspace);
  if (!hasCheckpointDirectory && !hasCompletionDirectory) {
    if (
      recoveredRetirement.generationCount !== 0
      || recoveredRetirement.completionCount !== 0
    ) return;
    fail('GREATER_REALM_ATTEMPT_CHECKPOINT_MISSING');
  }
  let state: GreaterRealmAttemptCheckpointState | undefined;
  let receipt: GreaterRealmAttemptCompletionReceipt | null = null;
  try {
    if (hasCheckpointDirectory) {
      recoverCheckpointRecordWrites(input.workspace);
      const inventory = input.workspace.attestTree(CHECKPOINT_DIRECTORY);
      if (inventory.fileCount === 0) {
        if (inventory.directoryCount !== 1 || inventory.entryCount !== 1) {
          fail('GREATER_REALM_ATTEMPT_CHECKPOINT_INVALID');
        }
      } else {
        state = loadGreaterRealmAttemptCheckpoint(input.workspace);
      }
    }
    if (hasCompletionDirectory) {
      receipt = readGreaterRealmAttemptCompletionReceipt({ workspace: input.workspace });
    }
    if (state !== undefined && receipt !== null && !completionReceiptMatchesState(receipt, state)) {
      fail('GREATER_REALM_ATTEMPT_COMPLETION_INVALID');
    }
    // A valid completion receipt is the permanent one-world consumption
    // token. `--abort-checkpoint` may rotate only an unaccepted/exhausted
    // search; it must never authorize a second published world.
    if (receipt !== null) {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
    }
    if (state?.phase === 'accepted') {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
    }
    if (state !== undefined && input.workspace.recoverAtomicDirectoryPublish(
      `batches/${state.batchHandle}`,
    ) !== 'absent') {
      fail('GREATER_REALM_ATTEMPT_CHECKPOINT_FINALIZATION_REQUIRED');
    }
    if (hasCheckpointDirectory) {
      retirePrivateStateDirectory(input.workspace, 'single-world-generation');
    }
    if (hasCompletionDirectory) {
      retirePrivateStateDirectory(input.workspace, 'single-world-completion');
    }
  } finally {
    state?.rootSeed.fill(0);
  }
}

export function clearGreaterRealmAttemptCheckpointSecret(
  state: GreaterRealmAttemptCheckpointState | undefined,
): void {
  state?.rootSeed.fill(0);
}

export const greaterRealmAttemptCheckpointTestSeams = Object.freeze({
  checkpointDirectory: CHECKPOINT_DIRECTORY,
  checkpointPath,
  completionDirectory: COMPLETION_DIRECTORY,
  completionPath: COMPLETION_PATH,
  ownerKeyPath: OWNER_KEY_PATH,
});
