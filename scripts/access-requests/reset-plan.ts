import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { basename, join } from 'node:path';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PLAN_FILENAME_PATTERN = /^access-request-reset-plan-([0-9]{8}T[0-9]{9}Z)-([0-9a-f]{32})\.json$/;
const MAXIMUM_PLAN_BYTES = 16 * 1_024;
const MAXIMUM_CLOCK_SKEW_MS = 60_000;
const PRIVATE_NOTE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAX_AUTH_EPOCH = 0xffff_ffff;

export const REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS = 30 * 60 * 1_000;
export const DEFAULT_ACCESS_REQUEST_RESET_PLAN_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'access-request-reset',
  'reports',
);

type UnknownRecord = Record<string, unknown>;

export type ReviewedAccessRequestResetPlanReference = Readonly<{
  filename: string;
  sha256: string;
}>;

export type ReviewedAccessRequestResetPlan = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-reviewed-access-request-reset-plan';
  planId: string;
  createdAt: string;
  expiresAt: string;
  targetConfigurationDigest: string;
  fid: string;
  note: string;
  expectedEnabled: boolean;
  expectedAuthEpoch: number;
  expectedRequestCycle: string | null;
  expectedRequestedAtMicros: string | null;
}>;

export class AccessRequestResetPlanError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AccessRequestResetPlanError';
  }
}

function record(value: unknown, code: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AccessRequestResetPlanError(code);
  }
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some(key => !accepted.has(key))) {
    throw new AccessRequestResetPlanError(code);
  }
}

function positiveSafeFid(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_FID_INVALID');
  }
  const fid = BigInt(value);
  if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_FID_INVALID');
  }
  return fid.toString();
}

function cleanPrivateNote(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_NOTE_INVALID');
  }
  const note = value.trim();
  if (!note || note.length > 512 || PRIVATE_NOTE_CONTROL_PATTERN.test(note)) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_NOTE_INVALID');
  }
  return note;
}

function decimalU64(value: unknown, nullable: boolean): string | null {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || !/^(0|[1-9][0-9]{0,19})$/.test(value)) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_CAS_INVALID');
  }
  const parsed = BigInt(value);
  if (parsed > U64_MAXIMUM) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_CAS_INVALID');
  }
  return parsed.toString();
}

function parsePlan(value: unknown): ReviewedAccessRequestResetPlan {
  const plan = record(value, 'ACCESS_REQUEST_RESET_PLAN_INVALID');
  onlyKeys(plan, [
    'schemaVersion',
    'kind',
    'planId',
    'createdAt',
    'expiresAt',
    'targetConfigurationDigest',
    'fid',
    'note',
    'expectedEnabled',
    'expectedAuthEpoch',
    'expectedRequestCycle',
    'expectedRequestedAtMicros',
  ], 'ACCESS_REQUEST_RESET_PLAN_INVALID');
  if (
    plan.schemaVersion !== 1
    || plan.kind !== 'warpkeep-reviewed-access-request-reset-plan'
    || typeof plan.planId !== 'string'
    || !/^[0-9a-f]{32}$/.test(plan.planId)
    || typeof plan.createdAt !== 'string'
    || typeof plan.expiresAt !== 'string'
    || typeof plan.targetConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.targetConfigurationDigest)
    || typeof plan.expectedEnabled !== 'boolean'
    || typeof plan.expectedAuthEpoch !== 'number'
    || !Number.isInteger(plan.expectedAuthEpoch)
    || plan.expectedAuthEpoch < 1
    || plan.expectedAuthEpoch >= MAX_AUTH_EPOCH
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_INVALID');
  const expectedRequestCycle = decimalU64(plan.expectedRequestCycle, true);
  const expectedRequestedAtMicros = decimalU64(plan.expectedRequestedAtMicros, true);
  if ((expectedRequestCycle === null) !== (expectedRequestedAtMicros === null)) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_CAS_INVALID');
  }
  const fid = positiveSafeFid(plan.fid);
  const note = cleanPrivateNote(plan.note);
  if (fid !== plan.fid || note !== plan.note) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_INVALID');
  }
  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-reviewed-access-request-reset-plan',
    planId: plan.planId,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    targetConfigurationDigest: plan.targetConfigurationDigest,
    fid,
    note,
    expectedEnabled: plan.expectedEnabled,
    expectedAuthEpoch: plan.expectedAuthEpoch,
    expectedRequestCycle,
    expectedRequestedAtMicros,
  });
}

function payload(plan: ReviewedAccessRequestResetPlan): string {
  return JSON.stringify(plan);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

function assertFresh(plan: ReviewedAccessRequestResetPlan, now: Date): void {
  const createdAt = Date.parse(plan.createdAt);
  const expiresAt = Date.parse(plan.expiresAt);
  const current = now.getTime();
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt - createdAt !== REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS
    || createdAt > current + MAXIMUM_CLOCK_SKEW_MS
    || expiresAt < current
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_EXPIRED');
}

function assertPrivateDirectory(directory: string): void {
  try {
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    const status = lstatSync(directory);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_DIRECTORY_INVALID');
    chmodSync(directory, 0o700);
    if ((statSync(directory).mode & 0o077) !== 0) {
      throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_DIRECTORY_PERMISSIONS');
    }
  } catch (error) {
    if (error instanceof AccessRequestResetPlanError) throw error;
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_DIRECTORY_INVALID');
  }
}

export function createReviewedAccessRequestResetPlan(input: Readonly<{
  targetConfigurationDigest: string;
  fid: bigint;
  note: string;
  expectedEnabled: boolean;
  expectedAuthEpoch: number;
  expectedRequestCycle: bigint | undefined;
  expectedRequestedAtMicros: bigint | undefined;
  now?: Date;
}>): ReviewedAccessRequestResetPlan {
  const now = input.now ?? new Date();
  return parsePlan({
    schemaVersion: 1,
    kind: 'warpkeep-reviewed-access-request-reset-plan',
    planId: randomUUID().replace(/-/g, ''),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + REVIEWED_ACCESS_REQUEST_RESET_PLAN_LIFETIME_MS,
    ).toISOString(),
    targetConfigurationDigest: input.targetConfigurationDigest,
    fid: input.fid.toString(),
    note: input.note,
    expectedEnabled: input.expectedEnabled,
    expectedAuthEpoch: input.expectedAuthEpoch,
    expectedRequestCycle: input.expectedRequestCycle?.toString() ?? null,
    expectedRequestedAtMicros: input.expectedRequestedAtMicros?.toString() ?? null,
  });
}

export function writeReviewedAccessRequestResetPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedAccessRequestResetPlan;
}>): Readonly<{ filename: string; sha256: string; expiresAt: string }> {
  const directory = input.directory ?? DEFAULT_ACCESS_REQUEST_RESET_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  const digest = sha256(payload(plan));
  const filename = `access-request-reset-plan-${timestampForFilename(new Date(plan.createdAt))}-${plan.planId}.json`;
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.tmp`);
  const bytes = `${JSON.stringify({ sha256: digest, plan }, null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > MAXIMUM_PLAN_BYTES) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_TOO_LARGE');
  }
  let descriptor: number;
  try {
    descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_WRITE_FAILED');
  }
  try {
    writeSync(descriptor, bytes, undefined, 'utf8');
    fsyncSync(descriptor);
  } catch {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_WRITE_FAILED');
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, destination);
  } catch {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_WRITE_FAILED');
  } finally {
    try { unlinkSync(temporary); } catch { /* Preserve the original failure. */ }
  }
  chmodSync(destination, 0o600);
  const status = statSync(destination);
  if (
    !status.isFile()
    || (status.mode & 0o777) !== 0o600
    || status.nlink !== 1
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_FILE_PERMISSIONS');
  return Object.freeze({ filename, sha256: digest, expiresAt: plan.expiresAt });
}

export function parseReviewedAccessRequestResetPlanReference(
  value: unknown,
): ReviewedAccessRequestResetPlanReference {
  const input = record(value, 'ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID');
  onlyKeys(input, ['reviewedAccessRequestResetPlan'], 'ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID');
  const reference = record(
    input.reviewedAccessRequestResetPlan,
    'ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID',
  );
  onlyKeys(reference, ['filename', 'sha256'], 'ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID');
  if (
    typeof reference.filename !== 'string'
    || basename(reference.filename) !== reference.filename
    || !PLAN_FILENAME_PATTERN.test(reference.filename)
    || typeof reference.sha256 !== 'string'
    || !DIGEST_PATTERN.test(reference.sha256)
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_REFERENCE_INVALID');
  return Object.freeze({ filename: reference.filename, sha256: reference.sha256 });
}

export function readReviewedAccessRequestResetPlan(input: Readonly<{
  directory?: string;
  reference: ReviewedAccessRequestResetPlanReference;
  expectedTargetConfigurationDigest: string;
  now?: Date;
}>): ReviewedAccessRequestResetPlan {
  const directory = input.directory ?? DEFAULT_ACCESS_REQUEST_RESET_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const reference = parseReviewedAccessRequestResetPlanReference({
    reviewedAccessRequestResetPlan: {
      filename: input.reference.filename,
      sha256: input.reference.sha256,
    },
  });
  const path = join(directory, reference.filename);
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_UNAVAILABLE');
  }
  let bytes: Buffer;
  try {
    const status = fstatSync(descriptor);
    if (
      !status.isFile()
      || status.size < 1
      || status.size > MAXIMUM_PLAN_BYTES
      || (status.mode & 0o777) !== 0o600
      || status.nlink !== 1
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_FILE_PERMISSIONS');
    bytes = readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  let envelope: UnknownRecord;
  try {
    envelope = record(JSON.parse(bytes.toString('utf8')), 'ACCESS_REQUEST_RESET_PLAN_INVALID');
  } catch (error) {
    if (error instanceof AccessRequestResetPlanError) throw error;
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_INVALID');
  } finally {
    bytes.fill(0);
  }
  onlyKeys(envelope, ['sha256', 'plan'], 'ACCESS_REQUEST_RESET_PLAN_INVALID');
  const plan = parsePlan(envelope.plan);
  const digest = sha256(payload(plan));
  if (
    envelope.sha256 !== digest
    || reference.sha256 !== digest
    || plan.targetConfigurationDigest !== input.expectedTargetConfigurationDigest
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_ATTESTATION_MISMATCH');
  assertFresh(plan, input.now ?? new Date());
  const match = PLAN_FILENAME_PATTERN.exec(reference.filename);
  if (
    !match
    || match[2] !== plan.planId
    || match[1] !== timestampForFilename(new Date(plan.createdAt))
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_ATTESTATION_MISMATCH');
  return plan;
}

/** Claim before submission so a timeout can never authorize a fresh-plan retry. */
export function claimReviewedAccessRequestResetPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedAccessRequestResetPlan;
  sha256: string;
  now?: Date;
}>): void {
  const directory = input.directory ?? DEFAULT_ACCESS_REQUEST_RESET_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  if (!DIGEST_PATTERN.test(input.sha256) || sha256(payload(plan)) !== input.sha256) {
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_ATTESTATION_MISMATCH');
  }
  const now = input.now ?? new Date();
  assertFresh(plan, now);
  const destination = join(directory, `access-request-reset-plan-${plan.planId}.claimed`);
  let descriptor: number;
  try {
    descriptor = openSync(destination, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_ALREADY_CLAIMED');
    }
    throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_CLAIM_FAILED');
  }
  try {
    writeSync(descriptor, `${JSON.stringify({
      planId: plan.planId,
      sha256: input.sha256,
      claimedAt: now.toISOString(),
    })}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(destination, 0o600);
  const status = statSync(destination);
  if (
    !status.isFile()
    || (status.mode & 0o777) !== 0o600
    || status.nlink !== 1
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) throw new AccessRequestResetPlanError('ACCESS_REQUEST_RESET_PLAN_CLAIM_FAILED');
}
