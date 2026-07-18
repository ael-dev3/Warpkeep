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

import {
  normalizeAdmissionReadyTrustedProfile,
  trustedProfilesEqual,
  type AdmissionReadyTrustedProfile,
} from '../../spacetimedb/src/profileAuthorityPolicy';

const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const PLAN_FILENAME_PATTERN = /^founder-admission-plan-([0-9]{8}T[0-9]{9}Z)-([0-9a-f]{32})\.json$/;
const MAXIMUM_PRIVATE_INPUT_BYTES = 32 * 1_024;
const MAXIMUM_PLAN_BYTES = 64 * 1_024;
const MAXIMUM_CLOCK_SKEW_MS = 60_000;
const PRIVATE_NOTE_CONTROL_PATTERN = /[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/;

export const REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS = 30 * 60 * 1_000;
export const FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL =
  'approved-for-this-founder-admission-v1';
export const DEFAULT_FOUNDER_ADMISSION_PLAN_DIRECTORY = join(
  homedir(),
  'Library',
  'Application Support',
  'Warpkeep',
  'founder-admission',
  'reports',
);

type UnknownRecord = Record<string, unknown>;

export type FounderAdmissionRequest = Readonly<{
  fid: bigint;
  note: string;
  profileSourceUseApproval: typeof FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL;
}>;

export type ReviewedFounderAdmissionPlanReference = Readonly<{
  filename: string;
  sha256: string;
}>;

export type ReviewedFounderAdmissionPlan = Readonly<{
  schemaVersion: 2;
  kind: 'warpkeep-reviewed-founder-admission-plan';
  planId: string;
  createdAt: string;
  expiresAt: string;
  sourceConfigurationDigest: string;
  targetConfigurationDigest: string;
  profilePolicyVersion: string;
  profileSourceUseApproval: typeof FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL;
  fid: string;
  note: string;
  profile: AdmissionReadyTrustedProfile;
}>;

export class FounderAdmissionPlanError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FounderAdmissionPlanError';
  }
}

function record(value: unknown, code = 'FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID'): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new FounderAdmissionPlanError(code);
  }
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[], code: string): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some(key => !accepted.has(key))) {
    throw new FounderAdmissionPlanError(code);
  }
}

function positiveSafeFid(value: unknown): bigint {
  if (typeof value !== 'string' || !/^[1-9][0-9]{0,15}$/.test(value)) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_FID_INVALID');
  }
  const fid = BigInt(value);
  if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_FID_INVALID');
  }
  return fid;
}

function cleanPrivateNote(value: unknown): string {
  if (typeof value !== 'string') {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_NOTE_INVALID');
  }
  const note = value.trim();
  if (!note || note.length > 512 || PRIVATE_NOTE_CONTROL_PATTERN.test(note)) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_NOTE_INVALID');
  }
  return note;
}

function normalizedAdmissionProfile(value: unknown): AdmissionReadyTrustedProfile {
  const input = record(value, 'FOUNDER_ADMISSION_PROFILE_INVALID');
  onlyKeys(
    input,
    ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio'],
    'FOUNDER_ADMISSION_PROFILE_INVALID',
  );
  for (const field of ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PROFILE_INVALID');
    }
  }
  let normalized: AdmissionReadyTrustedProfile;
  try {
    normalized = normalizeAdmissionReadyTrustedProfile({
      canonicalUsername: input.canonicalUsername as string | undefined,
      displayName: input.displayName as string | undefined,
      pfpUrl: input.pfpUrl as string | undefined,
      publicBio: input.publicBio as string | undefined,
    });
  } catch {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PROFILE_INVALID');
  }
  if (!trustedProfilesEqual(input, normalized)) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PROFILE_INVALID');
  }
  return normalized;
}

export function parsePrivateFounderAdmissionRequest(value: unknown): FounderAdmissionRequest {
  const input = record(value);
  onlyKeys(input, ['founderAdmission'], 'FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID');
  const request = record(input.founderAdmission, 'FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID');
  onlyKeys(
    request,
    ['fid', 'note', 'profileSourceUseApproval'],
    'FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID',
  );
  if (request.profileSourceUseApproval !== FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PROFILE_SOURCE_USE_NOT_APPROVED');
  }
  return Object.freeze({
    fid: positiveSafeFid(request.fid),
    note: cleanPrivateNote(request.note),
    profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
  });
}

export function parseReviewedFounderAdmissionPlanReference(
  value: unknown,
): ReviewedFounderAdmissionPlanReference {
  const input = record(value);
  onlyKeys(input, ['reviewedAdmissionPlan'], 'FOUNDER_ADMISSION_PLAN_REFERENCE_INVALID');
  const reference = record(
    input.reviewedAdmissionPlan,
    'FOUNDER_ADMISSION_PLAN_REFERENCE_INVALID',
  );
  onlyKeys(reference, ['filename', 'sha256'], 'FOUNDER_ADMISSION_PLAN_REFERENCE_INVALID');
  if (
    typeof reference.filename !== 'string'
    || typeof reference.sha256 !== 'string'
    || basename(reference.filename) !== reference.filename
    || !PLAN_FILENAME_PATTERN.test(reference.filename)
    || !DIGEST_PATTERN.test(reference.sha256)
  ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_REFERENCE_INVALID');
  return Object.freeze({
    filename: reference.filename,
    sha256: reference.sha256,
  });
}

export async function readPrivateFounderAdmissionInput(): Promise<UnknownRecord> {
  const chunks: Buffer[] = [];
  let byteLength = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    byteLength += buffer.byteLength;
    if (byteLength > MAXIMUM_PRIVATE_INPUT_BYTES) {
      buffer.fill(0);
      for (const existing of chunks) existing.fill(0);
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PRIVATE_INPUT_TOO_LARGE');
    }
    chunks.push(buffer);
  }
  if (byteLength === 0) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PRIVATE_INPUT_REQUIRED');
  }
  const combined = Buffer.concat(chunks);
  try {
    return record(JSON.parse(combined.toString('utf8')));
  } catch (error) {
    if (error instanceof FounderAdmissionPlanError) throw error;
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PRIVATE_INPUT_INVALID');
  } finally {
    combined.fill(0);
    for (const chunk of chunks) chunk.fill(0);
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
    ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_DIRECTORY_INVALID');
    chmodSync(directory, 0o700);
    if ((statSync(directory).mode & 0o077) !== 0) {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_DIRECTORY_PERMISSIONS');
    }
  } catch (error) {
    if (error instanceof FounderAdmissionPlanError) throw error;
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_DIRECTORY_INVALID');
  }
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function parsePlan(value: unknown): ReviewedFounderAdmissionPlan {
  const plan = record(value, 'FOUNDER_ADMISSION_PLAN_INVALID');
  onlyKeys(plan, [
    'schemaVersion',
    'kind',
    'planId',
    'createdAt',
    'expiresAt',
    'sourceConfigurationDigest',
    'targetConfigurationDigest',
    'profilePolicyVersion',
    'profileSourceUseApproval',
    'fid',
    'note',
    'profile',
  ], 'FOUNDER_ADMISSION_PLAN_INVALID');
  if (
    plan.schemaVersion !== 2
    || plan.kind !== 'warpkeep-reviewed-founder-admission-plan'
    || typeof plan.planId !== 'string'
    || !/^[0-9a-f]{32}$/.test(plan.planId)
    || typeof plan.createdAt !== 'string'
    || typeof plan.expiresAt !== 'string'
    || typeof plan.sourceConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.sourceConfigurationDigest)
    || typeof plan.targetConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.targetConfigurationDigest)
    || typeof plan.profilePolicyVersion !== 'string'
    || plan.profilePolicyVersion.length < 1
    || plan.profilePolicyVersion.length > 128
    || plan.profileSourceUseApproval !== FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL
  ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_INVALID');
  const fid = positiveSafeFid(plan.fid).toString();
  const note = cleanPrivateNote(plan.note);
  if (note !== plan.note) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_INVALID');
  return Object.freeze({
    schemaVersion: 2,
    kind: 'warpkeep-reviewed-founder-admission-plan',
    planId: plan.planId,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    sourceConfigurationDigest: plan.sourceConfigurationDigest,
    targetConfigurationDigest: plan.targetConfigurationDigest,
    profilePolicyVersion: plan.profilePolicyVersion,
    profileSourceUseApproval: FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL,
    fid,
    note,
    profile: normalizedAdmissionProfile(plan.profile),
  });
}

function planPayload(plan: ReviewedFounderAdmissionPlan): string {
  return JSON.stringify(plan);
}

function assertFreshPlan(plan: ReviewedFounderAdmissionPlan, now: Date): void {
  const current = now.getTime();
  const createdAt = Date.parse(plan.createdAt);
  const expiresAt = Date.parse(plan.expiresAt);
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt - createdAt !== REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS
    || createdAt > current + MAXIMUM_CLOCK_SKEW_MS
    || expiresAt < current
  ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_EXPIRED');
}

export function createReviewedFounderAdmissionPlan(input: Readonly<{
  sourceConfigurationDigest: string;
  targetConfigurationDigest: string;
  profilePolicyVersion: string;
  profileSourceUseApproval: typeof FOUNDER_ADMISSION_PROFILE_SOURCE_USE_APPROVAL;
  fid: bigint;
  note: string;
  profile: AdmissionReadyTrustedProfile;
  now?: Date;
}>): ReviewedFounderAdmissionPlan {
  const now = input.now ?? new Date();
  return parsePlan({
    schemaVersion: 2,
    kind: 'warpkeep-reviewed-founder-admission-plan',
    planId: randomUUID().replace(/-/g, ''),
    createdAt: now.toISOString(),
    expiresAt: new Date(
      now.getTime() + REVIEWED_FOUNDER_ADMISSION_PLAN_LIFETIME_MS,
    ).toISOString(),
    sourceConfigurationDigest: input.sourceConfigurationDigest,
    targetConfigurationDigest: input.targetConfigurationDigest,
    profilePolicyVersion: input.profilePolicyVersion,
    profileSourceUseApproval: input.profileSourceUseApproval,
    fid: input.fid.toString(),
    note: input.note,
    profile: input.profile,
  });
}

export function writeReviewedFounderAdmissionPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedFounderAdmissionPlan;
}>): Readonly<{ filename: string; sha256: string; expiresAt: string }> {
  const directory = input.directory ?? DEFAULT_FOUNDER_ADMISSION_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  const digest = sha256(planPayload(plan));
  const filename = `founder-admission-plan-${timestampForFilename(new Date(plan.createdAt))}-${plan.planId}.json`;
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.tmp`);
  const bytes = `${JSON.stringify({ sha256: digest, plan }, null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > MAXIMUM_PLAN_BYTES) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_TOO_LARGE');
  }
  let descriptor: number;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_WRITE_FAILED');
  }
  try {
    writeSync(descriptor, bytes, undefined, 'utf8');
    fsyncSync(descriptor);
  } catch {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_WRITE_FAILED');
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, destination);
  } catch {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_WRITE_FAILED');
  } finally {
    try { unlinkSync(temporary); } catch { /* Preserve the publication failure. */ }
  }
  try {
    chmodSync(destination, 0o600);
    if ((statSync(destination).mode & 0o777) !== 0o600) {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_FILE_PERMISSIONS');
    }
  } catch (error) {
    if (error instanceof FounderAdmissionPlanError) throw error;
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_WRITE_FAILED');
  }
  return Object.freeze({ filename, sha256: digest, expiresAt: plan.expiresAt });
}

export function readReviewedFounderAdmissionPlan(input: Readonly<{
  directory?: string;
  reference: ReviewedFounderAdmissionPlanReference;
  expectedSourceConfigurationDigest: string;
  expectedTargetConfigurationDigest: string;
  expectedProfilePolicyVersion: string;
  now?: Date;
}>): ReviewedFounderAdmissionPlan {
  const directory = input.directory ?? DEFAULT_FOUNDER_ADMISSION_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const reference = parseReviewedFounderAdmissionPlanReference({
    reviewedAdmissionPlan: {
      filename: input.reference.filename,
      sha256: input.reference.sha256,
    },
  });
  const path = join(directory, reference.filename);
  let descriptor: number;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  } catch {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_UNAVAILABLE');
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
    ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_FILE_PERMISSIONS');
    try {
      bytes = readFileSync(descriptor);
    } catch {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_READ_FAILED');
    }
  } finally {
    closeSync(descriptor);
  }
  let envelope: UnknownRecord;
  try {
    envelope = record(JSON.parse(bytes.toString('utf8')), 'FOUNDER_ADMISSION_PLAN_INVALID');
  } catch (error) {
    if (error instanceof FounderAdmissionPlanError) throw error;
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_INVALID');
  } finally {
    bytes.fill(0);
  }
  onlyKeys(envelope, ['sha256', 'plan'], 'FOUNDER_ADMISSION_PLAN_INVALID');
  const plan = parsePlan(envelope.plan);
  const digest = sha256(planPayload(plan));
  if (
    envelope.sha256 !== digest
    || reference.sha256 !== digest
    || plan.sourceConfigurationDigest !== input.expectedSourceConfigurationDigest
    || plan.targetConfigurationDigest !== input.expectedTargetConfigurationDigest
    || plan.profilePolicyVersion !== input.expectedProfilePolicyVersion
  ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_ATTESTATION_MISMATCH');
  assertFreshPlan(plan, input.now ?? new Date());
  const match = PLAN_FILENAME_PATTERN.exec(reference.filename);
  if (
    !match
    || match[2] !== plan.planId
    || match[1] !== timestampForFilename(new Date(plan.createdAt))
  ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_ATTESTATION_MISMATCH');
  return plan;
}

/**
 * Claim immediately before reducer submission. A timeout remains ambiguous and
 * intentionally consumes the plan so no durable admission can be retried blind.
 */
export function claimReviewedFounderAdmissionPlan(input: Readonly<{
  directory?: string;
  plan: ReviewedFounderAdmissionPlan;
  sha256: string;
  now?: Date;
}>): void {
  const directory = input.directory ?? DEFAULT_FOUNDER_ADMISSION_PLAN_DIRECTORY;
  assertPrivateDirectory(directory);
  const plan = parsePlan(input.plan);
  if (!DIGEST_PATTERN.test(input.sha256) || sha256(planPayload(plan)) !== input.sha256) {
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_ATTESTATION_MISMATCH');
  }
  const now = input.now ?? new Date();
  assertFreshPlan(plan, now);
  const destination = join(directory, `founder-admission-plan-${plan.planId}.claimed`);
  let descriptor: number;
  try {
    descriptor = openSync(
      destination,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
      0o600,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_ALREADY_CLAIMED');
    }
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_CLAIM_FAILED');
  }
  try {
    try {
      writeSync(descriptor, `${JSON.stringify({
        planId: plan.planId,
        sha256: input.sha256,
        claimedAt: now.toISOString(),
      })}\n`);
      fsyncSync(descriptor);
    } catch {
      throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_CLAIM_FAILED');
    }
  } finally {
    try { closeSync(descriptor); } catch { /* Preserve the privacy-safe claim result. */ }
  }
  try {
    chmodSync(destination, 0o600);
    const status = statSync(destination);
    if (
      !status.isFile()
      || (status.mode & 0o777) !== 0o600
      || status.nlink !== 1
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_CLAIM_FAILED');
  } catch (error) {
    if (error instanceof FounderAdmissionPlanError) throw error;
    throw new FounderAdmissionPlanError('FOUNDER_ADMISSION_PLAN_CLAIM_FAILED');
  }
}
