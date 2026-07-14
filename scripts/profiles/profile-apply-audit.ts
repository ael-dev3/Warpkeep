import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { join } from 'node:path';

export type ProfileApplyAuditStage =
  | 'apply-claimed'
  | 'precondition-verified'
  | 'precondition-failed'
  | 'reducer-submitted'
  | 'reducer-succeeded'
  | 'reducer-failed'
  | 'reducer-ambiguous'
  | 'mutation-connection-closed'
  | 'mutation-disconnect-error'
  | 'verification-started'
  | 'verification-complete'
  | 'verification-failed'
  | 'apply-complete';

export type ProfileApplyAuditReason =
  | 'none'
  | 'reducer-rejected'
  | 'reducer-deadline'
  | 'unexpected-disconnect'
  | 'disconnect-threw'
  | 'precondition-drift'
  | 'verification-unavailable'
  | 'verification-mismatch';

export type ProfileApplyAuditOutcome =
  | 'pending'
  | 'succeeded'
  | 'failed'
  | 'ambiguous'
  | 'verified'
  | 'mismatch';

export class ProfileApplyAuditError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProfileApplyAuditError';
  }
}

const STAGES = new Set<ProfileApplyAuditStage>([
  'apply-claimed',
  'precondition-verified',
  'precondition-failed',
  'reducer-submitted',
  'reducer-succeeded',
  'reducer-failed',
  'reducer-ambiguous',
  'mutation-connection-closed',
  'mutation-disconnect-error',
  'verification-started',
  'verification-complete',
  'verification-failed',
  'apply-complete',
]);
const REASONS = new Set<ProfileApplyAuditReason>([
  'none',
  'reducer-rejected',
  'reducer-deadline',
  'unexpected-disconnect',
  'disconnect-threw',
  'precondition-drift',
  'verification-unavailable',
  'verification-mismatch',
]);
const OUTCOMES = new Set<ProfileApplyAuditOutcome>([
  'pending',
  'succeeded',
  'failed',
  'ambiguous',
  'verified',
  'mismatch',
]);

function assertPrivateDirectory(directory: string): void {
  if (!existsSync(directory)) mkdirSync(directory, { recursive: true, mode: 0o700 });
  const status = lstatSync(directory);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) {
    throw new ProfileApplyAuditError('PROFILES_AUDIT_DIRECTORY_INVALID');
  }
  chmodSync(directory, 0o700);
  if ((statSync(directory).mode & 0o077) !== 0) {
    throw new ProfileApplyAuditError('PROFILES_AUDIT_DIRECTORY_PERMISSIONS');
  }
}

export function writeProfileApplyAuditEvent(input: Readonly<{
  reportDirectory: string;
  planId: string;
  sequence: number;
  stage: ProfileApplyAuditStage;
  outcome: ProfileApplyAuditOutcome;
  reason?: ProfileApplyAuditReason;
  updateIndex?: number;
  totalUpdates: number;
  matchedUpdates?: number;
}>): void {
  assertPrivateDirectory(input.reportDirectory);
  if (
    !/^[0-9a-f]{32}$/.test(input.planId)
    || !Number.isSafeInteger(input.sequence)
    || input.sequence < 0
    || input.sequence > 9_999
    || !Number.isSafeInteger(input.totalUpdates)
    || input.totalUpdates < 0
    || input.totalUpdates > 100
    || !STAGES.has(input.stage)
    || !OUTCOMES.has(input.outcome)
    || !REASONS.has(input.reason ?? 'none')
    || (input.updateIndex !== undefined && (
      !Number.isSafeInteger(input.updateIndex)
      || input.updateIndex < 0
      || input.updateIndex >= input.totalUpdates
    ))
    || (input.matchedUpdates !== undefined && (
      !Number.isSafeInteger(input.matchedUpdates)
      || input.matchedUpdates < 0
      || input.matchedUpdates > input.totalUpdates
    ))
  ) throw new ProfileApplyAuditError('PROFILES_AUDIT_EVENT_INVALID');
  const filename = `profiles-apply-audit-${input.planId}-${input.sequence.toString().padStart(4, '0')}.json`;
  const destination = join(input.reportDirectory, filename);
  const temporary = join(input.reportDirectory, `.${filename}.tmp`);
  const event = Object.freeze({
    schemaVersion: 1,
    planId: input.planId,
    sequence: input.sequence,
    recordedAt: new Date().toISOString(),
    stage: input.stage,
    outcome: input.outcome,
    reason: input.reason ?? 'none',
    totalUpdates: input.totalUpdates,
    ...(input.updateIndex !== undefined ? { updateIndex: input.updateIndex } : {}),
    ...(input.matchedUpdates !== undefined ? { matchedUpdates: input.matchedUpdates } : {}),
  });
  const descriptor = openSync(temporary, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY, 0o600);
  try {
    writeSync(descriptor, `${JSON.stringify(event, null, 2)}\n`, undefined, 'utf8');
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
    throw new ProfileApplyAuditError('PROFILES_AUDIT_FILE_PERMISSIONS');
  }
}
