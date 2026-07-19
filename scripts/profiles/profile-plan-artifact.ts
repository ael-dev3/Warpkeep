import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  mkdirSync,
  openSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, join } from 'node:path';

import {
  mergeWithLastKnownGood,
  profilesEqual,
  type ExistingPublicProfile,
} from './farcaster-profile-policy';

const PLAN_FILENAME_PATTERN = /^profiles-reviewed-plan-([0-9]{8}T[0-9]{9}Z)-([0-9a-f]{32})\.json$/;
const DIGEST_PATTERN = /^[0-9a-f]{64}$/;
const MAXIMUM_PLAN_BYTES = 1 * 1_024 * 1_024;
export const REVIEWED_PROFILE_PLAN_LIFETIME_MS = 30 * 60 * 1_000;
const MAXIMUM_CLOCK_SKEW_MS = 60_000;

type UnknownRecord = Record<string, unknown>;

export type ReviewedProfilePlanEntry = Readonly<{
  fid: string;
  expectedCurrent: ExistingPublicProfile;
  intended: ExistingPublicProfile;
}>;

export type ReviewedProfilePlan = Readonly<{
  schemaVersion: 3;
  kind: 'warpkeep-reviewed-profile-plan';
  planId: string;
  createdAt: string;
  expiresAt: string;
  sourceConfigurationDigest: string;
  targetConfigurationDigest: string;
  policyVersion: string;
  foundedProfileSetDigest: string;
  expectedProfileStateDigest: string;
  intendedProfileStateDigest: string;
  fetchedProfiles: number;
  unchangedProfiles: number;
  lastKnownGoodFieldsPreserved: number;
  updates: readonly ReviewedProfilePlanEntry[];
}>;

export class ProfilePlanArtifactError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProfilePlanArtifactError';
  }
}

function record(value: unknown): UnknownRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
  return value as UnknownRecord;
}

function onlyKeys(value: UnknownRecord, allowed: readonly string[]): void {
  const accepted = new Set(allowed);
  if (Object.keys(value).some(key => !accepted.has(key))) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
}

function assertPrivateDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const status = lstatSync(directory);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) {
    throw new ProfilePlanArtifactError('PROFILES_PLAN_DIRECTORY_INVALID');
  }
  chmodSync(directory, 0o700);
  if ((statSync(directory).mode & 0o077) !== 0) {
    throw new ProfilePlanArtifactError('PROFILES_PLAN_DIRECTORY_PERMISSIONS');
  }
}

function timestampForFilename(now: Date): string {
  return now.toISOString().replace(/[-:.]/g, '');
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function positiveInteger(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
  return value as number;
}

function parseProfileFields(value: unknown): ExistingPublicProfile {
  const input = record(value);
  onlyKeys(input, ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio']);
  for (const field of ['canonicalUsername', 'displayName', 'pfpUrl', 'publicBio'] as const) {
    if (input[field] !== undefined && typeof input[field] !== 'string') {
      throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
    }
  }
  const fields: ExistingPublicProfile = Object.freeze({
    ...(typeof input.canonicalUsername === 'string' ? { canonicalUsername: input.canonicalUsername } : {}),
    ...(typeof input.displayName === 'string' ? { displayName: input.displayName } : {}),
    ...(typeof input.pfpUrl === 'string' ? { pfpUrl: input.pfpUrl } : {}),
    ...(typeof input.publicBio === 'string' ? { publicBio: input.publicBio } : {}),
  });
  const sanitized = mergeWithLastKnownGood({ fid: 1n, ...fields }, {});
  if (!profilesEqual(fields, sanitized)) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_PRESENTATION_INVALID');
  }
  return fields;
}

function parsePlan(value: unknown): ReviewedProfilePlan {
  const plan = record(value);
  onlyKeys(plan, [
    'schemaVersion',
    'kind',
    'planId',
    'createdAt',
    'expiresAt',
    'sourceConfigurationDigest',
    'targetConfigurationDigest',
    'policyVersion',
    'foundedProfileSetDigest',
    'expectedProfileStateDigest',
    'intendedProfileStateDigest',
    'fetchedProfiles',
    'unchangedProfiles',
    'lastKnownGoodFieldsPreserved',
    'updates',
  ]);
  if (
    plan.schemaVersion !== 3
    || plan.kind !== 'warpkeep-reviewed-profile-plan'
    || typeof plan.planId !== 'string'
    || !/^[0-9a-f]{32}$/.test(plan.planId)
    || typeof plan.createdAt !== 'string'
    || typeof plan.expiresAt !== 'string'
    || typeof plan.sourceConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.sourceConfigurationDigest)
    || typeof plan.targetConfigurationDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.targetConfigurationDigest)
    || typeof plan.policyVersion !== 'string'
    || plan.policyVersion.length < 1
    || plan.policyVersion.length > 128
    || typeof plan.foundedProfileSetDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.foundedProfileSetDigest)
    || typeof plan.expectedProfileStateDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.expectedProfileStateDigest)
    || typeof plan.intendedProfileStateDigest !== 'string'
    || !DIGEST_PATTERN.test(plan.intendedProfileStateDigest)
    || !Array.isArray(plan.updates)
    || plan.updates.length > 100
  ) throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  const fetchedProfiles = positiveInteger(plan.fetchedProfiles);
  const unchangedProfiles = positiveInteger(plan.unchangedProfiles);
  const lastKnownGoodFieldsPreserved = positiveInteger(plan.lastKnownGoodFieldsPreserved);
  if (fetchedProfiles > 100 || unchangedProfiles > fetchedProfiles) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
  const updates = plan.updates.map((value): ReviewedProfilePlanEntry => {
    const entry = record(value);
    onlyKeys(entry, ['fid', 'expectedCurrent', 'intended']);
    if (typeof entry.fid !== 'string' || !/^[1-9][0-9]{0,15}$/.test(entry.fid)) {
      throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
    }
    const fid = BigInt(entry.fid);
    if (fid > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
    }
    const expectedCurrent = parseProfileFields(entry.expectedCurrent);
    const intended = parseProfileFields(entry.intended);
    if (profilesEqual(expectedCurrent, intended)) {
      throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
    }
    return Object.freeze({ fid: entry.fid, expectedCurrent, intended });
  });
  if (new Set(updates.map(update => update.fid)).size !== updates.length) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
  if (unchangedProfiles + updates.length !== fetchedProfiles) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  }
  return Object.freeze({
    schemaVersion: 3,
    kind: 'warpkeep-reviewed-profile-plan',
    planId: plan.planId,
    createdAt: plan.createdAt,
    expiresAt: plan.expiresAt,
    sourceConfigurationDigest: plan.sourceConfigurationDigest,
    targetConfigurationDigest: plan.targetConfigurationDigest,
    policyVersion: plan.policyVersion,
    foundedProfileSetDigest: plan.foundedProfileSetDigest,
    expectedProfileStateDigest: plan.expectedProfileStateDigest,
    intendedProfileStateDigest: plan.intendedProfileStateDigest,
    fetchedProfiles,
    unchangedProfiles,
    lastKnownGoodFieldsPreserved,
    updates: Object.freeze(updates),
  });
}

function planPayload(plan: ReviewedProfilePlan): string {
  return JSON.stringify(plan);
}

export function createReviewedProfilePlan(input: Readonly<{
  sourceConfigurationDigest: string;
  targetConfigurationDigest: string;
  policyVersion: string;
  foundedProfileSetDigest: string;
  expectedProfileStateDigest: string;
  intendedProfileStateDigest: string;
  fetchedProfiles: number;
  unchangedProfiles: number;
  lastKnownGoodFieldsPreserved: number;
  updates: readonly ReviewedProfilePlanEntry[];
  now?: Date;
}>): ReviewedProfilePlan {
  const now = input.now ?? new Date();
  return parsePlan({
    schemaVersion: 3,
    kind: 'warpkeep-reviewed-profile-plan',
    planId: randomUUID().replace(/-/g, ''),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + REVIEWED_PROFILE_PLAN_LIFETIME_MS).toISOString(),
    sourceConfigurationDigest: input.sourceConfigurationDigest,
    targetConfigurationDigest: input.targetConfigurationDigest,
    policyVersion: input.policyVersion,
    foundedProfileSetDigest: input.foundedProfileSetDigest,
    expectedProfileStateDigest: input.expectedProfileStateDigest,
    intendedProfileStateDigest: input.intendedProfileStateDigest,
    fetchedProfiles: input.fetchedProfiles,
    unchangedProfiles: input.unchangedProfiles,
    lastKnownGoodFieldsPreserved: input.lastKnownGoodFieldsPreserved,
    updates: input.updates,
  });
}

export function writeReviewedProfilePlan(input: Readonly<{
  reportDirectory: string;
  plan: ReviewedProfilePlan;
}>): Readonly<{ filename: string; sha256: string; expiresAt: string }> {
  assertPrivateDirectory(input.reportDirectory);
  const plan = parsePlan(input.plan);
  const digest = sha256(planPayload(plan));
  const filename = `profiles-reviewed-plan-${timestampForFilename(new Date(plan.createdAt))}-${plan.planId}.json`;
  const destination = join(input.reportDirectory, filename);
  const temporary = join(input.reportDirectory, `.${filename}.tmp`);
  const bytes = `${JSON.stringify({ sha256: digest, plan }, null, 2)}\n`;
  if (Buffer.byteLength(bytes, 'utf8') > MAXIMUM_PLAN_BYTES) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_TOO_LARGE');
  }
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeSync(descriptor, bytes, undefined, 'utf8');
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
    linkSync(temporary, destination);
  } finally {
    try { unlinkSync(temporary); } catch { /* Preserve the publication failure. */ }
  }
  chmodSync(destination, 0o600);
  if ((statSync(destination).mode & 0o777) !== 0o600) {
    throw new ProfilePlanArtifactError('PROFILES_PLAN_FILE_PERMISSIONS');
  }
  return Object.freeze({ filename, sha256: digest, expiresAt: plan.expiresAt });
}

export function readReviewedProfilePlan(input: Readonly<{
  reportDirectory: string;
  filename: string;
  expectedSha256: string;
  sourceConfigurationDigest: string;
  targetConfigurationDigest: string;
  policyVersion: string;
  now?: Date;
}>): ReviewedProfilePlan {
  assertPrivateDirectory(input.reportDirectory);
  if (
    basename(input.filename) !== input.filename
    || !PLAN_FILENAME_PATTERN.test(input.filename)
    || !DIGEST_PATTERN.test(input.expectedSha256)
  ) throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_REFERENCE_INVALID');
  const path = join(input.reportDirectory, input.filename);
  const descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
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
      throw new ProfilePlanArtifactError('PROFILES_PLAN_FILE_PERMISSIONS');
    }
    bytes = readFileSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  let envelope: UnknownRecord;
  try {
    envelope = record(JSON.parse(bytes.toString('utf8')));
  } catch (error) {
    if (error instanceof ProfilePlanArtifactError) throw error;
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_INVALID');
  } finally {
    bytes.fill(0);
  }
  onlyKeys(envelope, ['sha256', 'plan']);
  const plan = parsePlan(envelope.plan);
  const digest = sha256(planPayload(plan));
  if (
    envelope.sha256 !== digest
    || input.expectedSha256 !== digest
    || plan.sourceConfigurationDigest !== input.sourceConfigurationDigest
    || plan.targetConfigurationDigest !== input.targetConfigurationDigest
    || plan.policyVersion !== input.policyVersion
  ) throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_ATTESTATION_MISMATCH');
  const now = (input.now ?? new Date()).getTime();
  const createdAt = Date.parse(plan.createdAt);
  const expiresAt = Date.parse(plan.expiresAt);
  if (
    !Number.isFinite(createdAt)
    || !Number.isFinite(expiresAt)
    || expiresAt - createdAt !== REVIEWED_PROFILE_PLAN_LIFETIME_MS
    || createdAt > now + MAXIMUM_CLOCK_SKEW_MS
    || expiresAt < now
  ) throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_EXPIRED');
  const match = PLAN_FILENAME_PATTERN.exec(input.filename);
  if (!match || match[2] !== plan.planId || match[1] !== timestampForFilename(new Date(createdAt))) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_ATTESTATION_MISMATCH');
  }
  return plan;
}

export function claimReviewedProfilePlan(input: Readonly<{
  reportDirectory: string;
  plan: ReviewedProfilePlan;
  sha256: string;
}>): void {
  assertPrivateDirectory(input.reportDirectory);
  parsePlan(input.plan);
  if (!DIGEST_PATTERN.test(input.sha256)) {
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_ATTESTATION_MISMATCH');
  }
  const claimPath = join(input.reportDirectory, `profiles-reviewed-plan-${input.plan.planId}.claimed`);
  let descriptor: number;
  try {
    descriptor = openSync(claimPath, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_ALREADY_CLAIMED');
    }
    throw new ProfilePlanArtifactError('PROFILES_REVIEWED_PLAN_CLAIM_FAILED');
  }
  try {
    writeSync(descriptor, `${JSON.stringify({ planId: input.plan.planId, sha256: input.sha256, claimedAt: new Date().toISOString() })}\n`);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  chmodSync(claimPath, 0o600);
}
