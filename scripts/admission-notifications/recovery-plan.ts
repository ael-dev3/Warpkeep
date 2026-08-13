import { createHash, randomBytes } from 'node:crypto';
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

import type {
  NotificationPagesLiveHermesAuthority,
} from '../notification-pages-live-hermes-authority.mjs';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PLAN_FILENAME_PATTERN =
  /^admission-notification-recovery-plan-([0-9]{8}T[0-9]{9}Z)-([0-9a-f]{32})\.json$/;
const MAXIMUM_PLAN_BYTES = 16 * 1_024;
const MAXIMUM_CLOCK_SKEW_MS = 60_000;
const PRIVATE_NOTE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export const REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS = 30 * 60 * 1_000;
export const DEFAULT_ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'admission-notification-recovery',
  'reports',
);

type UnknownRecord = Record<string, unknown>;

export type ReviewedAdmissionNotificationRecoveryPlanReference = Readonly<{
  filename: string;
  sha256: string;
}>;

export type ReviewedAdmissionNotificationRecoveryPlan = Readonly<{
  schemaVersion: 3;
  kind: 'warpkeep-reviewed-admission-notification-recovery-plan';
  planId: string;
  createdAt: string;
  expiresAt: string;
  targetConfigurationDigest: string;
  notificationPagesLiveReceiptDigest: string | null;
  notificationPagesLivePagesSourceCommit: string | null;
  notificationPagesLiveBridgeSourceCommit: string | null;
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
  fid: string;
  note: string;
  expectedRequestedAtMicros: string;
  expectedNotificationStateDigest: string;
}>;

export class AdmissionNotificationRecoveryPlanError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'AdmissionNotificationRecoveryPlanError';
  }
}

function record(value: unknown, code: string): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new AdmissionNotificationRecoveryPlanError(code);
  }
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some(key => !accepted.has(key))) {
    throw new AdmissionNotificationRecoveryPlanError(code);
  }
}

function positiveSafeDecimal(value: unknown, code: string): string {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new AdmissionNotificationRecoveryPlanError(code);
  }
  const parsed = BigInt(value);
  if (parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new AdmissionNotificationRecoveryPlanError(code);
  }
  return parsed.toString();
}

function cleanNote(value: unknown): string {
  if (typeof value !== 'string') {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_NOTE_INVALID',
    );
  }
  const note = value.trim();
  if (!note || note.length > 512 || PRIVATE_NOTE_CONTROL_PATTERN.test(note)) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_NOTE_INVALID',
    );
  }
  return note;
}

function parsePlan(value: unknown): ReviewedAdmissionNotificationRecoveryPlan {
  const plan = record(value, 'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID');
  onlyKeys(plan, [
    'schemaVersion',
    'kind',
    'planId',
    'createdAt',
    'expiresAt',
    'targetConfigurationDigest',
    'notificationPagesLiveReceiptDigest',
    'notificationPagesLivePagesSourceCommit',
    'notificationPagesLiveBridgeSourceCommit',
    'notificationPagesLiveRootReceiptDigest',
    'notificationPagesLiveRootPagesSourceCommit',
    'fid',
    'note',
    'expectedRequestedAtMicros',
    'expectedNotificationStateDigest',
  ], 'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID');
  if (
    plan.schemaVersion !== 3
    || plan.kind !== 'warpkeep-reviewed-admission-notification-recovery-plan'
    || typeof plan.planId !== 'string'
    || !/^[0-9a-f]{32}$/.test(plan.planId)
    || typeof plan.createdAt !== 'string'
    || typeof plan.expiresAt !== 'string'
    || typeof plan.targetConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.targetConfigurationDigest)
    || typeof plan.expectedNotificationStateDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.expectedNotificationStateDigest)
    || !(
      (plan.notificationPagesLiveReceiptDigest === null
        && plan.notificationPagesLivePagesSourceCommit === null
        && plan.notificationPagesLiveBridgeSourceCommit === null
        && plan.notificationPagesLiveRootReceiptDigest === null
        && plan.notificationPagesLiveRootPagesSourceCommit === null)
      || (
        typeof plan.notificationPagesLiveReceiptDigest === 'string'
        && DIGEST_PATTERN.test(plan.notificationPagesLiveReceiptDigest)
        && typeof plan.notificationPagesLivePagesSourceCommit === 'string'
        && /^[0-9a-f]{40}$/.test(plan.notificationPagesLivePagesSourceCommit)
        && typeof plan.notificationPagesLiveBridgeSourceCommit === 'string'
        && /^[0-9a-f]{40}$/.test(plan.notificationPagesLiveBridgeSourceCommit)
        && typeof plan.notificationPagesLiveRootReceiptDigest === 'string'
        && DIGEST_PATTERN.test(plan.notificationPagesLiveRootReceiptDigest)
        && typeof plan.notificationPagesLiveRootPagesSourceCommit === 'string'
        && /^[0-9a-f]{40}$/.test(plan.notificationPagesLiveRootPagesSourceCommit)
      )
    )
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID',
    );
  }
  const fid = positiveSafeDecimal(
    plan.fid,
    'ADMISSION_NOTIFICATION_RECOVERY_PLAN_FID_INVALID',
  );
  const expectedRequestedAtMicros = positiveSafeDecimal(
    plan.expectedRequestedAtMicros,
    'ADMISSION_NOTIFICATION_RECOVERY_PLAN_CAS_INVALID',
  );
  const note = cleanNote(plan.note);
  if (fid !== plan.fid || expectedRequestedAtMicros !== plan.expectedRequestedAtMicros || note !== plan.note) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID',
    );
  }
  return Object.freeze({
    schemaVersion: 3,
    kind: 'warpkeep-reviewed-admission-notification-recovery-plan',
    planId: plan.planId,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    targetConfigurationDigest: plan.targetConfigurationDigest,
    notificationPagesLiveReceiptDigest: plan.notificationPagesLiveReceiptDigest,
    notificationPagesLivePagesSourceCommit:
      plan.notificationPagesLivePagesSourceCommit,
    notificationPagesLiveBridgeSourceCommit:
      plan.notificationPagesLiveBridgeSourceCommit,
    notificationPagesLiveRootReceiptDigest:
      plan.notificationPagesLiveRootReceiptDigest,
    notificationPagesLiveRootPagesSourceCommit:
      plan.notificationPagesLiveRootPagesSourceCommit,
    fid,
    note,
    expectedRequestedAtMicros,
    expectedNotificationStateDigest: plan.expectedNotificationStateDigest,
  });
}

function payload(plan: ReviewedAdmissionNotificationRecoveryPlan): string {
  return JSON.stringify(plan);
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

function assertFresh(plan: ReviewedAdmissionNotificationRecoveryPlan, now: Date): void {
  const createdAt = Date.parse(plan.createdAt);
  const expiresAt = Date.parse(plan.expiresAt);
  const current = now.getTime();
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt - createdAt !== REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS
    || createdAt > current + MAXIMUM_CLOCK_SKEW_MS
    || expiresAt < current
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_EXPIRED',
    );
  }
}

function assertPrivateDirectory(directory: string): void {
  try {
    if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
    const status = lstatSync(directory);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) {
      throw new AdmissionNotificationRecoveryPlanError(
        'ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY_INVALID',
      );
    }
    chmodSync(directory, 0o700);
    if ((statSync(directory).mode & 0o077) !== 0) {
      throw new AdmissionNotificationRecoveryPlanError(
        'ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY_PERMISSIONS',
      );
    }
  } catch (error) {
    if (error instanceof AdmissionNotificationRecoveryPlanError) throw error;
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY_INVALID',
    );
  }
}

export function admissionNotificationRecoveryStateDigest(value: Readonly<{
  status: string;
  generation?: string;
  authEpoch?: number;
  requestedAtMicros?: number;
  deliveryAttemptCount: number;
  verificationFailureCount: number;
  subscribed: boolean;
  recoveryCount: number;
  lastRecoveryAt?: number;
  retryReasons: readonly string[];
  lastAttemptAt?: number;
  lastFailureReason?: string;
  nextAttemptAt?: number;
}>): string {
  return sha256(JSON.stringify({
    status: value.status,
    generation: value.generation ?? null,
    authEpoch: value.authEpoch ?? null,
    requestedAtMicros: value.requestedAtMicros ?? null,
    deliveryAttemptCount: value.deliveryAttemptCount,
    verificationFailureCount: value.verificationFailureCount,
    subscribed: value.subscribed,
    recoveryCount: value.recoveryCount,
    lastRecoveryAt: value.lastRecoveryAt ?? null,
    retryReasons: [...value.retryReasons],
    lastAttemptAt: value.lastAttemptAt ?? null,
    lastFailureReason: value.lastFailureReason ?? null,
    nextAttemptAt: value.nextAttemptAt ?? null,
  }));
}

export function createReviewedAdmissionNotificationRecoveryPlan(input: Readonly<{
  targetConfigurationDigest: string;
  notificationPagesLiveAuthority?: NotificationPagesLiveHermesAuthority;
  fid: bigint;
  note: string;
  expectedRequestedAtMicros: bigint;
  expectedNotificationStateDigest: string;
  now?: Date;
}>): ReviewedAdmissionNotificationRecoveryPlan {
  const now = input.now ?? new Date();
  return parsePlan({
    schemaVersion: 3,
    kind: 'warpkeep-reviewed-admission-notification-recovery-plan',
    planId: randomBytes(16).toString('hex'),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + REVIEWED_ADMISSION_NOTIFICATION_RECOVERY_PLAN_LIFETIME_MS,
    ).toISOString(),
    targetConfigurationDigest: input.targetConfigurationDigest,
    notificationPagesLiveReceiptDigest:
      input.notificationPagesLiveAuthority?.notificationPagesLiveReceiptDigest ?? null,
    notificationPagesLivePagesSourceCommit:
      input.notificationPagesLiveAuthority?.notificationPagesLivePagesSourceCommit ?? null,
    notificationPagesLiveBridgeSourceCommit:
      input.notificationPagesLiveAuthority?.notificationPagesLiveBridgeSourceCommit ?? null,
    notificationPagesLiveRootReceiptDigest:
      input.notificationPagesLiveAuthority?.notificationPagesLiveRootReceiptDigest ?? null,
    notificationPagesLiveRootPagesSourceCommit:
      input.notificationPagesLiveAuthority?.notificationPagesLiveRootPagesSourceCommit ?? null,
    fid: input.fid.toString(),
    note: input.note,
    expectedRequestedAtMicros: input.expectedRequestedAtMicros.toString(),
    expectedNotificationStateDigest: input.expectedNotificationStateDigest,
  });
}

export function writeReviewedAdmissionNotificationRecoveryPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedAdmissionNotificationRecoveryPlan;
}>): Readonly<{ filename: string; sha256: string; expiresAt: string }> {
  const directory = input.directory ?? DEFAULT_ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  const digest = sha256(payload(plan));
  const filename = `admission-notification-recovery-plan-${timestampForFilename(new Date(plan.createdAt))}-${plan.planId}.json`;
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.tmp`);
  const bytes = `${JSON.stringify({ sha256: digest, plan }, null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > MAXIMUM_PLAN_BYTES) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_TOO_LARGE',
    );
  }
  let descriptor: number;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_WRITE_FAILED',
    );
  }
  try {
    writeSync(descriptor, bytes, undefined, 'utf8');
    fsyncSync(descriptor);
  } catch {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_WRITE_FAILED',
    );
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, destination);
  } catch {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_WRITE_FAILED',
    );
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
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_FILE_PERMISSIONS',
    );
  }
  return Object.freeze({ filename, sha256: digest, expiresAt: plan.expiresAt });
}

export function parseReviewedAdmissionNotificationRecoveryPlanReference(
  value: unknown,
): ReviewedAdmissionNotificationRecoveryPlanReference {
  const input = record(value, 'ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID');
  onlyKeys(
    input,
    ['reviewedAdmissionNotificationRecoveryPlan'],
    'ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID',
  );
  const reference = record(
    input.reviewedAdmissionNotificationRecoveryPlan,
    'ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID',
  );
  onlyKeys(reference, ['filename', 'sha256'], 'ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID');
  if (
    typeof reference.filename !== 'string'
    || basename(reference.filename) !== reference.filename
    || !PLAN_FILENAME_PATTERN.test(reference.filename)
    || typeof reference.sha256 !== 'string'
    || !DIGEST_PATTERN.test(reference.sha256)
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_REFERENCE_INVALID',
    );
  }
  return Object.freeze({ filename: reference.filename, sha256: reference.sha256 });
}

export function readReviewedAdmissionNotificationRecoveryPlan(input: Readonly<{
  directory?: string;
  reference: ReviewedAdmissionNotificationRecoveryPlanReference;
  expectedTargetConfigurationDigest: string;
  now?: Date;
}>): ReviewedAdmissionNotificationRecoveryPlan {
  const directory = input.directory ?? DEFAULT_ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const reference = parseReviewedAdmissionNotificationRecoveryPlanReference({
    reviewedAdmissionNotificationRecoveryPlan: {
      filename: input.reference.filename,
      sha256: input.reference.sha256,
    },
  });
  const path = join(directory, reference.filename);
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_UNAVAILABLE',
    );
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
    ) {
      throw new AdmissionNotificationRecoveryPlanError(
        'ADMISSION_NOTIFICATION_RECOVERY_PLAN_FILE_PERMISSIONS',
      );
    }
    bytes = readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  let envelope: UnknownRecord;
  try {
    envelope = record(
      JSON.parse(bytes.toString('utf8')),
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID',
    );
  } catch (error) {
    if (error instanceof AdmissionNotificationRecoveryPlanError) throw error;
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID',
    );
  } finally {
    bytes.fill(0);
  }
  onlyKeys(envelope, ['sha256', 'plan'], 'ADMISSION_NOTIFICATION_RECOVERY_PLAN_INVALID');
  const plan = parsePlan(envelope.plan);
  const digest = sha256(payload(plan));
  if (
    envelope.sha256 !== digest
    || reference.sha256 !== digest
    || plan.targetConfigurationDigest !== input.expectedTargetConfigurationDigest
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_ATTESTATION_MISMATCH',
    );
  }
  assertFresh(plan, input.now ?? new Date());
  const match = PLAN_FILENAME_PATTERN.exec(reference.filename);
  if (
    !match
    || match[2] !== plan.planId
    || match[1] !== timestampForFilename(new Date(plan.createdAt))
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_ATTESTATION_MISMATCH',
    );
  }
  return plan;
}

/** Claim before the recovery request so a timeout cannot authorize a second plan. */
export function claimReviewedAdmissionNotificationRecoveryPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedAdmissionNotificationRecoveryPlan;
  sha256: string;
  now?: Date;
}>): void {
  const directory = input.directory ?? DEFAULT_ADMISSION_NOTIFICATION_RECOVERY_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  if (!DIGEST_PATTERN.test(input.sha256) || sha256(payload(plan)) !== input.sha256) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_ATTESTATION_MISMATCH',
    );
  }
  const now = input.now ?? new Date();
  assertFresh(plan, now);
  const destination = join(
    directory,
    `admission-notification-recovery-plan-${plan.planId}.claimed`,
  );
  let descriptor: number;
  try {
    descriptor = openSync(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new AdmissionNotificationRecoveryPlanError(
        'ADMISSION_NOTIFICATION_RECOVERY_PLAN_ALREADY_CLAIMED',
      );
    }
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_CLAIM_FAILED',
    );
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
  ) {
    throw new AdmissionNotificationRecoveryPlanError(
      'ADMISSION_NOTIFICATION_RECOVERY_PLAN_CLAIM_FAILED',
    );
  }
}
