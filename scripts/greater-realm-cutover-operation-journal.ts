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
  readdirSync,
  realpathSync,
  statSync,
  type Stats,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  assertProductionAdminTrustedAncestors,
  probeProductionAdminProcessIdentity,
  productionAdminRecordedOwnerIsDead,
  type ProductionAdminProcessIdentityProbe,
} from './production-admin-token-budget.mjs';
import {
  GreaterRealmCutoverWriteNotStartedError,
  isGreaterRealmCutoverWriteNotStartedError,
} from './greater-realm-cutover-write-control';
import type {
  GreaterRealmImmutableArtifactRetentionRecord,
} from './greater-realm-production-immutable-artifact';
import type {
  GreaterRealmCutoverRecoveryOwnerAuthorization,
} from './greater-realm-cutover-receipts';
export type {
  GreaterRealmImmutableArtifactRetentionRecord,
} from './greater-realm-production-immutable-artifact';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const JOURNAL_PROFILE = 'warpkeep-greater-realm-cutover-operation-journal-v1';
const COMPLETION_PROFILE = 'warpkeep-greater-realm-cutover-operation-receipt-v1';
const COMMAND_JOURNAL_PROFILE = 'warpkeep-greater-realm-cutover-command-journal-v1';
const COMMAND_GROUP_PROFILE = 'warpkeep-greater-realm-cutover-command-group-journal-v1';
const COMMAND_COMPLETION_CONTRACT_PROFILE = 'warpkeep-greater-realm-cutover-command-completion-v1';
const IMMUTABLE_ARTIFACT_PROFILE = 'warpkeep-greater-realm-immutable-artifact-v1';
const EXPECTED_AFTER_PROFILE = 'warpkeep-greater-realm-cutover-expected-after-v1';
const MAX_JOURNAL_BYTES = 512 * 1024;
const MAX_COMPLETION_RECEIPT_BYTES = 64 * 1024;
const MAX_OPERATION_RECEIPTS = 4_096;
const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const IDENTIFIER = /^[a-z0-9][a-z0-9._:-]{0,191}$/u;
const JOURNAL_ID = /^[0-9a-f]{32}$/u;
const DECIMAL = /^(?:0|[1-9][0-9]*)$/u;
const FORBIDDEN_KEY = /(?:secret|token|credential|password|authorization|cookie|actor|subject|\bfid\b|castleId|cellKey|slotId|nodeId|payloadJson|releaseHeaderJson|publicApprovalReceiptId)/iu;

export const GREATER_REALM_CUTOVER_JOURNAL_PHASES = Object.freeze([
  'prepared',
  'submission-uncertain',
  'manual-ambiguity',
  'reconciled',
  'receipt-installed',
] as const);

export type GreaterRealmCutoverJournalPhase =
  typeof GREATER_REALM_CUTOVER_JOURNAL_PHASES[number];

function journalPhaseOrdinal(phase: GreaterRealmCutoverJournalPhase): number {
  return phase === 'prepared' ? 1
    : phase === 'submission-uncertain' ? 2
      : phase === 'manual-ambiguity' || phase === 'reconciled' ? 3 : 4;
}

export type GreaterRealmCutoverJournalLockIdentity = Readonly<{
  lockId: string;
  pid: number;
  processStartIdentity: string;
  createdAtMs: number;
  expiresAtMs: number;
  dev: number;
  ino: number;
}>;

export type GreaterRealmCutoverJournalTarget = Readonly<{
  uri: 'https://maincloud.spacetimedb.com';
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
  deleteData: 'never';
}>;

export const GREATER_REALM_CUTOVER_JOURNAL_TARGET: GreaterRealmCutoverJournalTarget = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

export type GreaterRealmCutoverJournalSourceRelease = Readonly<{
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
}>;

export type GreaterRealmCutoverJournalCommand = Readonly<{
  kind: 'import' | 'relocation' | 'publish';
  name: string;
}>;

export type GreaterRealmCutoverJournalOperation = Readonly<{
  kind: 'reducer' | 'publish';
  name: string;
  argumentsDigest: string;
  argumentsByteLength: number;
  argumentsRedacted: true;
  identity: Readonly<Record<string, unknown>>;
}>;

export type GreaterRealmCutoverExpectedAfterRule =
  | Readonly<{ rule: 'equals'; value: unknown }>
  | Readonly<{ rule: 'changed' }>
  | Readonly<{ rule: 'integer-delta'; delta: string }>
  | Readonly<{
      rule: 'matches';
      pattern: 'sha256' | 'verify-digest' | 'nonempty-string' | 'u64-decimal' | 'boolean';
      mustChange: boolean;
    }>;

export type GreaterRealmCutoverExpectedAfterPredicate = Readonly<{
  schemaVersion: 1;
  profile: typeof EXPECTED_AFTER_PROFILE;
  evaluatorVersion: 1;
  moduleSourceCommit: string;
  contract: string;
  statusRules: Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>>;
  auditRules: Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>>;
  everyUnruledFieldUnchanged: true;
}>;

export type GreaterRealmCutoverWritePermit = (() => void) & Readonly<{
  /** The trusted transport/publisher invokes this after all synchronous prep. */
  markSubmissionUncertain?: () => Promise<void>;
  /** Binds one exact branded preparation rejection before uncertainty. */
  bindWriteNotStartedError?: (error: unknown) => void;
}>;

export type GreaterRealmCutoverOperationReceiptChain = Readonly<{
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
}>;

export type GreaterRealmImmutableArtifactCleanupContext = Readonly<{
  groupDigest: string;
  command: GreaterRealmCutoverJournalCommand;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  operations: readonly Readonly<{
    operationOrdinal: number;
    planDigest: string;
    operation: GreaterRealmCutoverJournalOperation;
  }>[];
}>;

export type GreaterRealmImmutableArtifactCleanup = (
  record: GreaterRealmImmutableArtifactRetentionRecord,
  context: GreaterRealmImmutableArtifactCleanupContext,
) => void;

export type GreaterRealmCutoverRecoveryPlan = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-greater-realm-cutover-recovery-plan-v1';
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  groupDigest: string;
  command: GreaterRealmCutoverJournalCommand;
  sourceReleaseDigest: string;
  recoveryAuthorityKind: 'command-group-phase' | 'command-receipt';
  recoveryAuthorityDigest: string;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
  confirmationDigest: string;
}>;

export class GreaterRealmCutoverOperationJournalError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmCutoverOperationJournalError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmCutoverOperationJournalError(code);
}

function inside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function assertNoSymlinkAncestors(path: string): void {
  let current = path;
  while (true) {
    if (existsSync(current) && lstatSync(current).isSymbolicLink()) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_SYMLINK_REJECTED');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

const RECEIPT_FILE = /^greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}\.json$/u;
const RECEIPT_TEMPORARY_FILE = /^\.greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}-[0-9a-f]{12}\.json\.tmp$/u;
const LOCK_FILE = '.greater-realm-cutover.lock';
const LOCK_TEMPORARY_FILE = /^\.greater-realm-cutover-[0-9a-f]{32}-[1-9][0-9]*-[0-9a-f]{64}\.lock\.tmp$/u;
const JOURNAL_FILE = /^\.greater-realm-cutover-operation-([0-9a-f]{32})-(prepared|submission-uncertain|manual-ambiguity|reconciled|receipt-installed)\.json$/u;
const JOURNAL_TEMPORARY_FILE = /^\.greater-realm-cutover-operation-([0-9a-f]{32})-(prepared|submission-uncertain|manual-ambiguity|reconciled|receipt-installed)-[0-9a-f]{12}\.json\.tmp$/u;
const COMPLETION_FILE = /^greater-realm-operation-([0-9a-f]{64})\.json$/u;
const COMPLETION_TEMPORARY_FILE = /^\.greater-realm-operation-([0-9a-f]{64})-[0-9a-f]{12}\.json\.tmp$/u;
const COMMAND_JOURNAL_FILE = /^\.greater-realm-cutover-command-([0-9a-f]{32})-(prepared|receipt-installed)\.json$/u;
const COMMAND_JOURNAL_TEMPORARY_FILE = /^\.greater-realm-cutover-command-([0-9a-f]{32})-(prepared|receipt-installed)-[0-9a-f]{12}\.json\.tmp$/u;
const COMMAND_GROUP_FILE = /^\.greater-realm-cutover-command-group-([0-9a-f]{32})-([0-9]{8})-(started|planned|operation-checkpoint|command-reconciled)\.json$/u;
const COMMAND_GROUP_TEMPORARY_FILE = /^\.greater-realm-cutover-command-group-([0-9a-f]{32})-([0-9]{8})-(started|planned|operation-checkpoint|command-reconciled)-[0-9a-f]{12}\.json\.tmp$/u;
const RECOVERY_OWNER_FILE = /^\.greater-realm-cutover-recovery-owner-([0-9a-f]{32})-([0-9]{8})\.json$/u;
const RECOVERY_OWNER_TEMPORARY_FILE = /^\.greater-realm-cutover-recovery-owner-([0-9a-f]{32})-([0-9]{8})-([0-9a-f]{32})-([1-9][0-9]*)-([0-9a-f]{64})-[0-9a-f]{12}\.json\.tmp$/u;
const RECEIPT_TEMPORARY_CAPTURE = /^\.(greater-realm-(?:publish|import|relocation)-[0-9a-f]{64})-[0-9a-f]{12}\.json\.tmp$/u;
const LOCK_TEMPORARY_CAPTURE = /^\.greater-realm-cutover-([0-9a-f]{32})-([1-9][0-9]*)-([0-9a-f]{64})\.lock\.tmp$/u;

function allowedPrivateEntry(name: string): boolean {
  return name === LOCK_FILE
    || LOCK_TEMPORARY_FILE.test(name)
    || RECEIPT_FILE.test(name)
    || RECEIPT_TEMPORARY_FILE.test(name)
    || JOURNAL_FILE.test(name)
    || JOURNAL_TEMPORARY_FILE.test(name)
    || COMPLETION_FILE.test(name)
    || COMPLETION_TEMPORARY_FILE.test(name)
    || COMMAND_JOURNAL_FILE.test(name)
    || COMMAND_JOURNAL_TEMPORARY_FILE.test(name)
    || COMMAND_GROUP_FILE.test(name)
    || COMMAND_GROUP_TEMPORARY_FILE.test(name)
    || RECOVERY_OWNER_FILE.test(name)
    || RECOVERY_OWNER_TEMPORARY_FILE.test(name);
}

function linkedCrashDestination(name: string): string | undefined {
  const journal = JOURNAL_TEMPORARY_FILE.exec(name);
  if (journal !== null) {
    return phaseBasename(journal[1]!, journal[2] as GreaterRealmCutoverJournalPhase);
  }
  const completion = COMPLETION_TEMPORARY_FILE.exec(name);
  if (completion !== null) return `greater-realm-operation-${completion[1]!}.json`;
  const command = COMMAND_JOURNAL_TEMPORARY_FILE.exec(name);
  if (command !== null) {
    return `.greater-realm-cutover-command-${command[1]!}-${command[2]!}.json`;
  }
  const commandGroup = COMMAND_GROUP_TEMPORARY_FILE.exec(name);
  if (commandGroup !== null) {
    return `.greater-realm-cutover-command-group-${commandGroup[1]!}-${commandGroup[2]!}-${commandGroup[3]!}.json`;
  }
  const recoveryOwner = RECOVERY_OWNER_TEMPORARY_FILE.exec(name);
  if (recoveryOwner !== null) {
    return `.greater-realm-cutover-recovery-owner-${recoveryOwner[1]!}-${recoveryOwner[2]!}.json`;
  }
  const receipt = RECEIPT_TEMPORARY_CAPTURE.exec(name);
  if (receipt !== null) return `${receipt[1]!}.json`;
  if (LOCK_TEMPORARY_CAPTURE.test(name)) return LOCK_FILE;
  return undefined;
}

function lstatIfPresent(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function validateLinkedCrashBody(input: Readonly<{
  temporaryName: string;
  destinationName: string;
  body: Buffer;
}>): void {
  const journalName = JOURNAL_FILE.exec(input.destinationName);
  if (journalName !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body));
    } catch {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    const record = parseJournalRecord(parsed);
    const canonical = journalBody(record);
    try {
      if (
        record.journalId !== journalName[1]
        || record.phase !== journalName[2]
        || !canonical.equals(input.body)
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    } finally {
      canonical.fill(0);
    }
    return;
  }
  const contentDigest = createHash('sha256').update(input.body).digest('hex');
  const completionName = COMPLETION_FILE.exec(input.destinationName);
  if (completionName !== null) {
    if (completionName[1] !== contentDigest) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    return;
  }
  const commandName = COMMAND_JOURNAL_FILE.exec(input.destinationName);
  if (commandName !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body));
    } catch {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    const record = parseCommandJournalRecord(parsed);
    const canonical = commandJournalBody(record);
    try {
      if (
        record.lockId !== commandName[1]
        || record.phase !== commandName[2]
        || !canonical.equals(input.body)
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    } finally {
      canonical.fill(0);
    }
    return;
  }
  const commandGroupName = COMMAND_GROUP_FILE.exec(input.destinationName);
  if (commandGroupName !== null) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body));
    } catch {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    const record = parseCommandGroupRecord(parsed);
    const canonical = commandGroupBody(record);
    try {
      if (
        record.lock.lockId !== commandGroupName[1]
        || String(record.phaseOrdinal).padStart(8, '0') !== commandGroupName[2]
        || record.phase !== commandGroupName[3]
        || !canonical.equals(input.body)
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    } finally {
      canonical.fill(0);
    }
    return;
  }
  const recoveryOwnerName = RECOVERY_OWNER_FILE.exec(input.destinationName);
  if (recoveryOwnerName !== null) {
    const recoveryOwnerTemporary = RECOVERY_OWNER_TEMPORARY_FILE.exec(input.temporaryName);
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body));
    } catch {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    const raw = parsed as Readonly<Record<string, unknown>>;
    const oldLock = raw.oldLockIdentity as Readonly<Record<string, unknown>> | undefined;
    if (
      raw.schemaVersion !== 1
      || raw.profile !== 'warpkeep-greater-realm-cutover-recovery-owner-v1'
      || raw.claimId !== recoveryOwnerTemporary?.[3]
      || raw.claimOrdinal !== Number(recoveryOwnerName[2])
      || oldLock?.lockId !== recoveryOwnerName[1]
      || recoveryOwnerTemporary === null
      || raw.recoveringPid !== Number(recoveryOwnerTemporary[4])
      || typeof raw.recoveringProcessStartIdentity !== 'string'
      || createHash('sha256')
        .update(raw.recoveringProcessStartIdentity, 'utf8').digest('hex')
        !== recoveryOwnerTemporary[5]
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    return;
  }
  const receiptName = RECEIPT_FILE.exec(input.destinationName);
  if (receiptName !== null) {
    if (!input.destinationName.endsWith(`-${contentDigest}.json`)) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    return;
  }
  const lock = LOCK_TEMPORARY_CAPTURE.exec(input.temporaryName);
  if (input.destinationName !== LOCK_FILE || lock === null) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input.body));
  } catch {
    fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
  }
  const raw = parsed as Readonly<Record<string, unknown>>;
  if (
    Object.keys(raw).join(',')
      !== 'schemaVersion,profile,lockId,pid,processStartIdentity,createdAtMs,expiresAtMs'
    || raw.schemaVersion !== 1
    || raw.profile !== 'warpkeep-greater-realm-cutover-operator-lock-v1'
    || raw.lockId !== lock[1]
    || raw.pid !== Number(lock[2])
    || typeof raw.processStartIdentity !== 'string'
    || createHash('sha256').update(raw.processStartIdentity, 'utf8').digest('hex') !== lock[3]
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
}

function recoverExactLinkedCrashPairs(directory: string): void {
  for (const name of readdirSync(directory).sort()) {
    const destinationName = linkedCrashDestination(name);
    if (destinationName === undefined) continue;
    const temporaryPath = join(directory, name);
    const temporaryStatus = lstatIfPresent(temporaryPath);
    if (temporaryStatus === undefined) continue;
    if (temporaryStatus.nlink !== 2) continue;
    const destinationPath = join(directory, destinationName);
    if (!existsSync(destinationPath)) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    }
    const temporary = readExactImmutableFile({
      path: temporaryPath,
      maximumBytes: MAX_JOURNAL_BYTES,
      expectedNlink: 2,
    });
    const destination = readExactImmutableFile({
      path: destinationPath,
      maximumBytes: MAX_JOURNAL_BYTES,
      expectedNlink: 2,
    });
    if (
      temporary.dev !== destination.dev
      || temporary.ino !== destination.ino
      || !temporary.body.equals(destination.body)
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
    validateLinkedCrashBody({ temporaryName: name, destinationName, body: destination.body });
    unlinkExact(temporaryPath, temporary, 2);
    fsyncDirectory(directory);
    readExactImmutableFile({
      path: destinationPath,
      maximumBytes: MAX_JOURNAL_BYTES,
      expectedNlink: 1,
      expectedBody: destination.body,
    });
  }
}

function recoverExpiredUnlinkedOwnerTemporaries(directory: string): void {
  const now = Date.now();
  for (const name of readdirSync(directory).sort()) {
    const lockTemporary = LOCK_TEMPORARY_CAPTURE.exec(name);
    const recoveryTemporary = RECOVERY_OWNER_TEMPORARY_FILE.exec(name);
    if (lockTemporary === null && recoveryTemporary === null) continue;
    const temporaryPath = join(directory, name);
    const status = lstatIfPresent(temporaryPath);
    if (status === undefined) continue;
    if (status.nlink !== 1) continue;
    const destinationName = linkedCrashDestination(name)!;
    if (existsSync(join(directory, destinationName))) continue;
    const temporary = readExactImmutableFile({
      path: temporaryPath,
      maximumBytes: MAX_JOURNAL_BYTES,
      expectedNlink: 1,
    });
    try {
      validateLinkedCrashBody({ temporaryName: name, destinationName, body: temporary.body });
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(temporary.body));
      } catch {
        fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      }
      const raw = parsed as Readonly<Record<string, unknown>>;
      const pid = lockTemporary === null ? raw.recoveringPid : raw.pid;
      const processStartIdentity = lockTemporary === null
        ? raw.recoveringProcessStartIdentity
        : raw.processStartIdentity;
      if (
        !Number.isSafeInteger(pid)
        || typeof processStartIdentity !== 'string'
        || !Number.isSafeInteger(raw.expiresAtMs)
        || now < Number(raw.expiresAtMs)
        || productionAdminRecordedOwnerIsDead({
          pid: Number(pid),
          processStartIdentity,
        }) !== true
      ) continue;
      unlinkExact(temporaryPath, temporary);
      fsyncDirectory(directory);
    } finally {
      temporary.body.fill(0);
    }
  }
}

function recoverDeadOwnerUnlinkedFirstAuthorityTemporaries(directory: string): void {
  for (const name of readdirSync(directory).sort()) {
    const lockTemporary = LOCK_TEMPORARY_CAPTURE.exec(name);
    const groupTemporary = COMMAND_GROUP_TEMPORARY_FILE.exec(name);
    const recoveryOwnerTemporary = RECOVERY_OWNER_TEMPORARY_FILE.exec(name);
    if (
      lockTemporary === null
      && recoveryOwnerTemporary === null
      && (groupTemporary === null
        || groupTemporary[2] !== '00000001'
        || groupTemporary[3] !== 'started')
    ) continue;
    const temporaryPath = join(directory, name);
    const status = lstatIfPresent(temporaryPath);
    if (status === undefined) continue;
    if (status.nlink !== 1) continue;
    const destinationName = linkedCrashDestination(name)!;
    if (existsSync(join(directory, destinationName))) continue;
    if (lockTemporary !== null) {
      if (
        !status.isFile()
        || status.isSymbolicLink()
        || status.size > 4 * 1024
        || (status.mode & 0o7777) !== FILE_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      const encodedPid = Number(lockTemporary[2]);
      if (!Number.isSafeInteger(encodedPid) || encodedPid < 1) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      }
      const observed = probeProductionAdminProcessIdentity(encodedPid);
      const ownerDead = observed.state === 'absent'
        || (observed.state === 'present'
          && createHash('sha256').update(observed.identity, 'utf8').digest('hex')
            !== lockTemporary[3]);
      if (!ownerDead) continue;
      unlinkExact(temporaryPath, { dev: status.dev, ino: status.ino });
      fsyncDirectory(directory);
      continue;
    }
    if (recoveryOwnerTemporary !== null) {
      if (
        !status.isFile()
        || status.isSymbolicLink()
        || status.size > 16 * 1024
        || (status.mode & 0o7777) !== FILE_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      const encodedPid = Number(recoveryOwnerTemporary[4]);
      if (!Number.isSafeInteger(encodedPid) || encodedPid < 1) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      }
      const observed = probeProductionAdminProcessIdentity(encodedPid);
      const ownerDead = observed.state === 'absent'
        || (observed.state === 'present'
          && createHash('sha256').update(observed.identity, 'utf8').digest('hex')
            !== recoveryOwnerTemporary[5]);
      if (!ownerDead) continue;
      unlinkExact(temporaryPath, { dev: status.dev, ino: status.ino });
      fsyncDirectory(directory);
      continue;
    }
    if (groupTemporary !== null) {
      if (
        !status.isFile()
        || status.isSymbolicLink()
        || status.size > MAX_JOURNAL_BYTES
        || (status.mode & 0o7777) !== FILE_MODE
        || (process.getuid !== undefined && status.uid !== process.getuid())
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_LINKED_TEMPORARY_INVALID');
      const lockFile = readExactImmutableFile({
        path: join(directory, LOCK_FILE),
        maximumBytes: 4 * 1024,
      });
      let lockValue: unknown;
      try {
        lockValue = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(lockFile.body));
      } catch {
        fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
      }
      const lock = exactObject(lockValue, [
        'schemaVersion', 'profile', 'lockId', 'pid', 'processStartIdentity',
        'createdAtMs', 'expiresAtMs',
      ], 'GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
      if (
        lock.schemaVersion !== 1
        || lock.profile !== 'warpkeep-greater-realm-cutover-operator-lock-v1'
        || lock.lockId !== groupTemporary[1]
        || !Number.isSafeInteger(lock.pid)
        || typeof lock.processStartIdentity !== 'string'
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
      if (productionAdminRecordedOwnerIsDead({
        pid: Number(lock.pid),
        processStartIdentity: lock.processStartIdentity,
      }) !== true) continue;
      unlinkExact(temporaryPath, { dev: status.dev, ino: status.ino });
      fsyncDirectory(directory);
      continue;
    }
  }
}

/** Shared strict directory boundary for locks, journals, and receipts. */
export function requireGreaterRealmCutoverPrivateDirectory(input: Readonly<{
  directory: string;
  repositoryRoot: string;
}>): string {
  if (!isAbsolute(input.directory)) fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_NOT_ABSOLUTE');
  const requested = resolve(input.directory);
  assertNoSymlinkAncestors(requested);
  assertProductionAdminTrustedAncestors(requested);
  const repository = realpathSync(resolve(input.repositoryRoot));
  if (inside(repository, requested) || inside(requested, repository)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_REPOSITORY_OVERLAP');
  }
  const missing: string[] = [];
  let ancestor = requested;
  while (!existsSync(ancestor)) {
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_INVALID');
    ancestor = parent;
  }
  let canonicalParent = realpathSync(ancestor);
  if (inside(repository, canonicalParent) || inside(canonicalParent, repository)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_REPOSITORY_OVERLAP');
  }
  for (const path of missing) {
    mkdirSync(path, { mode: DIRECTORY_MODE });
    chmodSync(path, DIRECTORY_MODE);
    const status = lstatSync(path);
    const canonical = realpathSync(path);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o7777) !== DIRECTORY_MODE
      || dirname(canonical) !== canonicalParent
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_CREATE_FAILED');
    canonicalParent = canonical;
  }
  const status = lstatSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
    || (statSync(requested).mode & 0o7777) !== DIRECTORY_MODE
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_INVALID');
  const canonical = realpathSync(requested);
  recoverExactLinkedCrashPairs(canonical);
  recoverDeadOwnerUnlinkedFirstAuthorityTemporaries(canonical);
  recoverExpiredUnlinkedOwnerTemporaries(canonical);
  for (const entry of readdirSync(canonical, { withFileTypes: true })) {
    const path = join(canonical, entry.name);
    if (!entry.isFile() || !allowedPrivateEntry(entry.name)) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_NOT_DEDICATED');
    }
    const entryStatus = lstatIfPresent(path);
    if (entryStatus === undefined) continue;
    if (
      entryStatus.isSymbolicLink()
      || entryStatus.nlink !== 1
      || (process.getuid !== undefined && entryStatus.uid !== process.getuid())
      || (entryStatus.mode & 0o7777) !== FILE_MODE
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_DIRECTORY_NOT_DEDICATED');
  }
  return canonical;
}

function canonicalValue(
  value: unknown,
  ancestors = new Set<object>(),
  path: readonly string[] = [],
  rejectPrivateFields = true,
): unknown {
  if (value === undefined) return null;
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    if (value.length > 262_144 || /[\u0000-\u001f\u007f]/u.test(value)) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_VALUE_INVALID');
    }
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('GREATER_REALM_CUTOVER_JOURNAL_VALUE_INVALID');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || ancestors.has(value)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_VALUE_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 20_000) fail('GREATER_REALM_CUTOVER_JOURNAL_VALUE_INVALID');
      return value.map((child, index) => canonicalValue(
        child,
        ancestors,
        [...path, String(index)],
        rejectPrivateFields,
      ));
    }
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_VALUE_INVALID');
    }
    const entries = Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, child]) => {
      const explicitlyBoundReleaseId = key === 'atlasId' || key === 'publicReleaseId';
      if (rejectPrivateFields && !explicitlyBoundReleaseId && FORBIDDEN_KEY.test(key)) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_PRIVATE_FIELD_REJECTED');
      }
      return [key, canonicalValue(child, ancestors, [...path, key], rejectPrivateFields)];
    }));
  } finally {
    ancestors.delete(value);
  }
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

function immutableCanonicalValue(value: unknown): unknown {
  const canonical = canonicalValue(value);
  const freeze = (candidate: unknown): unknown => {
    if (Array.isArray(candidate)) {
      for (const child of candidate) freeze(child);
      return Object.freeze(candidate);
    }
    if (candidate !== null && typeof candidate === 'object') {
      for (const child of Object.values(candidate as Readonly<Record<string, unknown>>)) {
        freeze(child);
      }
      return Object.freeze(candidate);
    }
    return candidate;
  };
  return freeze(canonical);
}

function canonicalOpaqueJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value, new Set<object>(), [], false));
}

function digestCanonicalText(domain: string, body: string): string {
  const domainBytes = Buffer.from(domain, 'utf8');
  const length = Buffer.allocUnsafe(8);
  length.writeBigUInt64BE(BigInt(domainBytes.byteLength));
  const valueLength = Buffer.allocUnsafe(8);
  valueLength.writeBigUInt64BE(BigInt(Buffer.byteLength(body)));
  const result = createHash('sha256')
    .update(length)
    .update(domainBytes)
    .update(valueLength)
    .update(body, 'utf8')
    .digest('hex');
  length.fill(0);
  valueLength.fill(0);
  return result;
}

function digest(domain: string, value: unknown): string {
  const body = canonicalJson(value);
  return digestCanonicalText(domain, body);
}

function fsyncDirectory(directory: string): void {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

type InstalledFile = Readonly<{
  path: string;
  dev: number;
  ino: number;
  digest: string;
  body: Buffer;
}>;

function readExactImmutableFile(input: Readonly<{
  path: string;
  maximumBytes: number;
  expectedBody?: Buffer;
  expectedNlink?: number;
}>): InstalledFile {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size < 1
      || before.size > input.maximumBytes
      || before.nlink !== (input.expectedNlink ?? 1)
      || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_FILE_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || (input.expectedBody !== undefined && !body.equals(input.expectedBody))
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_FILE_CHANGED');
    return Object.freeze({
      path: input.path,
      dev: before.dev,
      ino: before.ino,
      digest: createHash('sha256').update(body).digest('hex'),
      body,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function installImmutableFile(input: Readonly<{
  directory: string;
  basename: string;
  body: Buffer;
  maximumBytes: number;
  temporaryBasename: string;
  testOnlyAfterPartialWrite?: () => void;
  testOnlyAfterTemporaryFsync?: () => void;
}>): InstalledFile {
  if (input.body.byteLength < 1 || input.body.byteLength > input.maximumBytes) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_FILE_SIZE_INVALID');
  }
  const destination = join(input.directory, input.basename);
  if (existsSync(destination)) {
    return readExactImmutableFile({
      path: destination,
      maximumBytes: input.maximumBytes,
      expectedBody: input.body,
    });
  }
  const temporary = join(input.directory, input.temporaryBasename);
  let descriptor: number | undefined;
  let temporaryIdentity: Readonly<{ dev: number; ino: number }> | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const opened = fstatSync(descriptor);
    temporaryIdentity = Object.freeze({ dev: opened.dev, ino: opened.ino });
    let offset = 0;
    let partialWriteSeamCalled = false;
    while (offset < input.body.byteLength) {
      const remaining = input.body.byteLength - offset;
      const requested = input.testOnlyAfterPartialWrite !== undefined
        && !partialWriteSeamCalled
        ? Math.max(1, Math.floor(input.body.byteLength / 2))
        : remaining;
      const written = writeSync(
        descriptor,
        input.body,
        offset,
        Math.min(remaining, requested),
      );
      if (written <= 0) fail('GREATER_REALM_CUTOVER_JOURNAL_WRITE_FAILED');
      offset += written;
      if (input.testOnlyAfterPartialWrite !== undefined && !partialWriteSeamCalled) {
        partialWriteSeamCalled = true;
        input.testOnlyAfterPartialWrite();
      }
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    const ready = fstatSync(descriptor);
    if (
      ready.dev !== temporaryIdentity.dev
      || ready.ino !== temporaryIdentity.ino
      || ready.nlink !== 1
      || ready.size !== input.body.byteLength
      || (ready.mode & 0o7777) !== FILE_MODE
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_WRITE_FAILED');
    input.testOnlyAfterTemporaryFsync?.();
    linkSync(temporary, destination);
    fsyncDirectory(input.directory);
    unlinkExact(temporary, temporaryIdentity, 2);
    temporaryIdentity = undefined;
    fsyncDirectory(input.directory);
    return readExactImmutableFile({
      path: destination,
      maximumBytes: input.maximumBytes,
      expectedBody: input.body,
    });
  } catch (error) {
    if (temporaryIdentity !== undefined) {
      try {
        const links = lstatSync(temporary).nlink;
        unlinkExact(temporary, temporaryIdentity, links === 2 ? 2 : 1);
        fsyncDirectory(input.directory);
      } catch { /* Exact paired-link recovery runs at the next admission. */ }
    }
    if (error instanceof GreaterRealmCutoverOperationJournalError) throw error;
    return fail('GREATER_REALM_CUTOVER_JOURNAL_WRITE_FAILED');
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Reported through a later invariant read. */ }
    }
  }
}

function unlinkExact(
  path: string,
  expected: Readonly<{ dev: number; ino: number }>,
  expectedNlink = 1,
): void {
  let status;
  try {
    status = lstatSync(path);
  } catch {
    fail('GREATER_REALM_CUTOVER_JOURNAL_CLEANUP_FAILED');
  }
  if (
    status.isSymbolicLink()
    || !status.isFile()
    || status.dev !== expected.dev
    || status.ino !== expected.ino
    || status.nlink !== expectedNlink
    || (status.mode & 0o7777) !== FILE_MODE
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_FILE_REPLACED');
  try {
    unlinkSync(path);
  } catch {
    fail('GREATER_REALM_CUTOVER_JOURNAL_CLEANUP_FAILED');
  }
}

function validLockIdentity(value: GreaterRealmCutoverJournalLockIdentity): boolean {
  return JOURNAL_ID.test(value.lockId)
    && Number.isSafeInteger(value.pid) && value.pid > 0
    && typeof value.processStartIdentity === 'string'
    && value.processStartIdentity.length >= 8 && value.processStartIdentity.length <= 128
    && Number.isSafeInteger(value.createdAtMs) && value.createdAtMs >= 0
    && Number.isSafeInteger(value.expiresAtMs) && value.expiresAtMs > value.createdAtMs
    && Number.isSafeInteger(value.dev) && value.dev >= 0
    && Number.isSafeInteger(value.ino) && value.ino >= 0;
}

function validSourceRelease(value: GreaterRealmCutoverJournalSourceRelease): boolean {
  return SOURCE_COMMIT.test(value.atlasSourceCommit)
    && SOURCE_COMMIT.test(value.moduleSourceCommit)
    && typeof value.atlasId === 'string' && value.atlasId.length >= 1 && value.atlasId.length <= 512
    && typeof value.publicReleaseId === 'string'
    && value.publicReleaseId.length >= 1 && value.publicReleaseId.length <= 512
    && SHA256.test(value.expectedReleaseSha256);
}

function normalizeRetentionRecord(
  value: GreaterRealmImmutableArtifactRetentionRecord | undefined,
): GreaterRealmImmutableArtifactRetentionRecord | undefined {
  if (value === undefined) return undefined;
  const retentionKeys = [
    'schemaVersion', 'profile', 'materializationRoot', 'artifactPath', 'artifactDigest',
    'moduleSourceCommit', 'moduleTreeId', 'dependencyClosureDigest',
    'materializationDev', 'materializationIno', 'artifactDev', 'artifactIno',
    'artifactMode', 'artifactUid', 'artifactNlink', 'artifactSize',
    'artifactMtimeNs', 'artifactCtimeNs',
  ] as const;
  const actualKeys = Object.keys(value);
  if (
    actualKeys.join(',') !== retentionKeys.join(',')
    && actualKeys.join(',') !== [...retentionKeys].sort().join(',')
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_INVALID');
  if (
    value.schemaVersion !== 1
    || value.profile !== IMMUTABLE_ARTIFACT_PROFILE
    || !isAbsolute(value.materializationRoot)
    || value.artifactPath !== join(value.materializationRoot, 'spacetimedb', 'dist', 'bundle.js')
    || !SHA256.test(value.artifactDigest)
    || !SOURCE_COMMIT.test(value.moduleSourceCommit)
    || !SOURCE_COMMIT.test(value.moduleTreeId)
    || !SHA256.test(value.dependencyClosureDigest)
    || ![
      value.materializationDev, value.materializationIno, value.artifactDev,
      value.artifactIno, value.artifactUid, value.artifactSize,
      value.artifactMtimeNs, value.artifactCtimeNs,
    ].every(child => typeof child === 'string' && DECIMAL.test(child))
    || value.artifactMode !== '600'
    || value.artifactNlink !== '1'
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_INVALID');
  return Object.freeze(Object.fromEntries(
    retentionKeys.map(key => [key, value[key]]),
  ) as GreaterRealmImmutableArtifactRetentionRecord);
}

function validCommand(value: GreaterRealmCutoverJournalCommand): boolean {
  return (value.kind === 'import' || value.kind === 'relocation' || value.kind === 'publish')
    && typeof value.name === 'string'
    && IDENTIFIER.test(value.name);
}

function validOperation(value: unknown): value is GreaterRealmCutoverJournalOperation {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const operation = value as Partial<GreaterRealmCutoverJournalOperation>;
  return (operation.kind === 'reducer' || operation.kind === 'publish')
    && typeof operation.name === 'string'
    && IDENTIFIER.test(operation.name)
    && typeof operation.argumentsDigest === 'string'
    && SHA256.test(operation.argumentsDigest)
    && Number.isSafeInteger(operation.argumentsByteLength)
    && Number(operation.argumentsByteLength) >= 0
    && operation.argumentsRedacted === true
    && operation.identity !== null
    && typeof operation.identity === 'object'
    && !Array.isArray(operation.identity);
}

function operationIdentity(input: Readonly<{
  kind: 'reducer' | 'publish';
  name: string;
  arguments: unknown;
  identity?: Readonly<Record<string, unknown>>;
}>): GreaterRealmCutoverJournalOperation {
  if (!IDENTIFIER.test(input.name)) fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_INVALID');
  const argumentsJson = canonicalOpaqueJson(input.arguments);
  const argumentsByteLength = Buffer.byteLength(argumentsJson);
  if (argumentsByteLength > 16 * 1024 * 1024) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_ARGUMENTS_TOO_LARGE');
  }
  const identity = canonicalValue(input.identity ?? {}) as Readonly<Record<string, unknown>>;
  return Object.freeze({
    kind: input.kind,
    name: input.name,
    argumentsDigest: digestCanonicalText(
      'warpkeep-greater-realm-cutover-operation-arguments-v1',
      argumentsJson,
    ),
    argumentsByteLength,
    argumentsRedacted: true,
    identity,
  });
}

export type GreaterRealmCutoverJournalSnapshot = Readonly<{
  status: unknown;
  statusDigest: string;
  audit: unknown;
  auditDigest: string;
}>;

type Snapshot = GreaterRealmCutoverJournalSnapshot;

function snapshot(status: unknown, audit: unknown): Snapshot {
  const canonicalStatus = canonicalValue(status);
  const canonicalAudit = canonicalValue(audit);
  return Object.freeze({
    status: canonicalStatus,
    statusDigest: digest('warpkeep-greater-realm-cutover-status-snapshot-v1', canonicalStatus),
    audit: canonicalAudit,
    auditDigest: digest('warpkeep-greater-realm-cutover-audit-snapshot-v1', canonicalAudit),
  });
}

const FIELD_PATH = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/u;
const VERIFY_DIGEST = /^(?:[0-9a-f]{64}|sha256-v1:[0-9a-f]{64}:[0-9]+:.*)$/u;

function normalizeExpectedAfterRule(value: unknown): GreaterRealmCutoverExpectedAfterRule {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  if (raw.rule === 'equals' && Object.keys(raw).sort().join(',') === 'rule,value') {
    return Object.freeze({ rule: 'equals', value: canonicalValue(raw.value) });
  }
  if (raw.rule === 'changed' && Object.keys(raw).join(',') === 'rule') {
    return Object.freeze({ rule: 'changed' });
  }
  if (
    raw.rule === 'integer-delta'
    && Object.keys(raw).sort().join(',') === 'delta,rule'
    && typeof raw.delta === 'string'
    && /^-?(?:0|[1-9][0-9]*)$/u.test(raw.delta)
  ) return Object.freeze({ rule: 'integer-delta', delta: raw.delta });
  if (
    raw.rule === 'matches'
    && Object.keys(raw).sort().join(',') === 'mustChange,pattern,rule'
    && ['sha256', 'verify-digest', 'nonempty-string', 'u64-decimal', 'boolean']
      .includes(raw.pattern as string)
    && typeof raw.mustChange === 'boolean'
  ) {
    return Object.freeze({
      rule: 'matches',
      pattern: raw.pattern as Extract<GreaterRealmCutoverExpectedAfterRule, { rule: 'matches' }>['pattern'],
      mustChange: raw.mustChange,
    });
  }
  fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
}

function normalizeExpectedAfterRules(
  value: unknown,
): Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
  }
  const entries = Object.entries(value as Readonly<Record<string, unknown>>)
    .sort(([left], [right]) => left.localeCompare(right));
  if (
    entries.length > 512
    || entries.some(([path]) => !FIELD_PATH.test(path))
    || new Set(entries.map(([path]) => path)).size !== entries.length
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
  return Object.freeze(Object.fromEntries(entries.map(([path, rule]) => (
    [path, normalizeExpectedAfterRule(rule)]
  ))));
}

function normalizeExpectedAfterPredicate(
  value: GreaterRealmCutoverExpectedAfterPredicate,
): GreaterRealmCutoverExpectedAfterPredicate {
  const predicateKeys = [
    'schemaVersion', 'profile', 'evaluatorVersion', 'moduleSourceCommit', 'contract',
    'statusRules', 'auditRules', 'everyUnruledFieldUnchanged',
  ] as const;
  const actualKeys = Object.keys(value);
  if (
    actualKeys.join(',') !== predicateKeys.join(',')
    && actualKeys.join(',') !== [...predicateKeys].sort().join(',')
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
  if (
    value.schemaVersion !== 1
    || value.profile !== EXPECTED_AFTER_PROFILE
    || value.evaluatorVersion !== 1
    || !SOURCE_COMMIT.test(value.moduleSourceCommit)
    || !IDENTIFIER.test(value.contract)
    || value.everyUnruledFieldUnchanged !== true
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
  return Object.freeze({
    ...value,
    statusRules: normalizeExpectedAfterRules(value.statusRules),
    auditRules: normalizeExpectedAfterRules(value.auditRules),
  });
}

export function createGreaterRealmCutoverExpectedAfterPredicate(input: Readonly<{
  moduleSourceCommit: string;
  contract: string;
  statusRules: Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>>;
  auditRules?: Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>>;
}>): GreaterRealmCutoverExpectedAfterPredicate {
  return normalizeExpectedAfterPredicate(Object.freeze({
    schemaVersion: 1,
    profile: EXPECTED_AFTER_PROFILE,
    evaluatorVersion: 1,
    moduleSourceCommit: input.moduleSourceCommit,
    contract: input.contract,
    statusRules: input.statusRules,
    auditRules: input.auditRules ?? {},
    everyUnruledFieldUnchanged: true,
  }));
}

function flattenSnapshotValue(value: unknown): ReadonlyMap<string, unknown> {
  const result = new Map<string, unknown>();
  const visit = (child: unknown, path: string): void => {
    if (
      child !== null
      && typeof child === 'object'
      && !Array.isArray(child)
      && Object.keys(child as Readonly<Record<string, unknown>>).length > 0
    ) {
      for (const [key, nested] of Object.entries(child as Readonly<Record<string, unknown>>)) {
        visit(nested, path === '' ? key : `${path}.${key}`);
      }
      return;
    }
    if (path === '') fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_INVALID');
    result.set(path, child);
  };
  visit(canonicalValue(value), '');
  return result;
}

function exactValue(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

function decimalInteger(value: unknown): bigint | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return BigInt(value);
  if (typeof value === 'string' && /^-?(?:0|[1-9][0-9]*)$/u.test(value)) return BigInt(value);
  return undefined;
}

function matchesRulePattern(
  value: unknown,
  pattern: Extract<GreaterRealmCutoverExpectedAfterRule, { rule: 'matches' }>['pattern'],
): boolean {
  if (pattern === 'boolean') return typeof value === 'boolean';
  if (typeof value !== 'string') return false;
  if (pattern === 'sha256') return SHA256.test(value);
  if (pattern === 'verify-digest') return VERIFY_DIGEST.test(value);
  if (pattern === 'nonempty-string') return value.length >= 1 && value.length <= 512;
  return DECIMAL.test(value) && BigInt(value) <= ((1n << 64n) - 1n);
}

function rulesMatch(input: Readonly<{
  before: unknown;
  after: unknown;
  rules: Readonly<Record<string, GreaterRealmCutoverExpectedAfterRule>>;
}>): boolean {
  const before = flattenSnapshotValue(input.before);
  const after = flattenSnapshotValue(input.after);
  const allPaths = new Set([...before.keys(), ...after.keys()]);
  for (const path of allPaths) {
    const rule = input.rules[path];
    const beforeValue = before.get(path);
    const afterValue = after.get(path);
    if (rule === undefined) {
      if (!before.has(path) || !after.has(path) || !exactValue(beforeValue, afterValue)) return false;
      continue;
    }
    if (!after.has(path)) return false;
    if (rule.rule === 'equals') {
      if (!exactValue(afterValue, rule.value)) return false;
    } else if (rule.rule === 'changed') {
      if (!before.has(path) || exactValue(beforeValue, afterValue)) return false;
    } else if (rule.rule === 'integer-delta') {
      const left = decimalInteger(beforeValue);
      const right = decimalInteger(afterValue);
      if (left === undefined || right === undefined || right - left !== BigInt(rule.delta)) return false;
    } else if (
      !matchesRulePattern(afterValue, rule.pattern)
      || (rule.mustChange && (!before.has(path) || exactValue(beforeValue, afterValue)))
    ) return false;
  }
  return Object.keys(input.rules).every(path => after.has(path));
}

function expectedAfterMatches(input: Readonly<{
  before: Snapshot;
  after: Snapshot;
  predicate: GreaterRealmCutoverExpectedAfterPredicate;
}>): boolean {
  return rulesMatch({
    before: input.before.status,
    after: input.after.status,
    rules: input.predicate.statusRules,
  }) && rulesMatch({
    before: input.before.audit,
    after: input.after.audit,
    rules: input.predicate.auditRules,
  });
}

type CompletionReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof COMPLETION_PROFILE;
  groupDigest: string;
  planDigest: string;
  operationOrdinal: number;
  previousOperationReceiptDigest: string | null;
  command: GreaterRealmCutoverJournalCommand;
  operation: GreaterRealmCutoverJournalOperation;
  target: GreaterRealmCutoverJournalTarget;
  sourceReleaseDigest: string;
  artifactIdentityDigest: string | null;
  beforeStatusDigest: string;
  beforeAuditDigest: string;
  expectedAfterPredicateDigest: string;
  afterStatusDigest: string;
  afterAuditDigest: string;
  auditDelta: 'changed' | 'unchanged';
  outcome: 'verified' | 'verified-after-submission-error' | 'recovered-after-owner-death';
}>;

export type GreaterRealmCutoverCommandReceiptKind =
  | 'warpkeep-greater-realm-production-publish-v1'
  | 'warpkeep-greater-realm-production-import-v1'
  | 'warpkeep-greater-realm-production-relocation-v1';

type GreaterRealmCutoverCommandCompletionContract = Readonly<{
  schemaVersion: 1;
  profile: typeof COMMAND_COMPLETION_CONTRACT_PROFILE;
  evaluatorVersion: 1;
  moduleSourceCommit: string;
  receiptKind: GreaterRealmCutoverCommandReceiptKind;
  contract: string;
}>;

type CommandGroupPhase =
  | 'started'
  | 'planned'
  | 'operation-checkpoint'
  | 'command-reconciled';

type CommandGroupRecord = Readonly<{
  schemaVersion: 1;
  profile: typeof COMMAND_GROUP_PROFILE;
  phase: CommandGroupPhase;
  phaseOrdinal: number;
  previousPhaseDigest: string | null;
  groupDigest: string;
  lock: GreaterRealmCutoverJournalLockIdentity;
  command: GreaterRealmCutoverJournalCommand;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  artifactRetentionRecord: GreaterRealmImmutableArtifactRetentionRecord | null;
  completionContract: GreaterRealmCutoverCommandCompletionContract;
  before: Snapshot | null;
  receiptBefore: Snapshot | null;
  terminalExpectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate | null;
  terminalExpectedAfterPredicateDigest: string | null;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
  terminalAfter: Snapshot | null;
  receiptAfter: Snapshot | null;
  createdAtMs: number;
  updatedAtMs: number;
}>;

type CommandGroupFile = Readonly<{
  record: CommandGroupRecord;
  installed: InstalledFile;
}>;

type CommandJournalRecord = Readonly<{
  schemaVersion: 1;
  profile: typeof COMMAND_JOURNAL_PROFILE;
  lockId: string;
  phase: 'prepared' | 'receipt-installed';
  previousPhaseDigest: string | null;
  groupDigest: string;
  command: GreaterRealmCutoverJournalCommand;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
  receiptKind: GreaterRealmCutoverCommandReceiptKind;
  recordedAt: string;
  receiptRecord: Readonly<Record<string, unknown>>;
  artifactRetentionRecord: GreaterRealmImmutableArtifactRetentionRecord | null;
  expectedReceiptDigest: string;
  expectedReceiptBasename: string;
  installedReceiptDigest: string | null;
}>;

type CommandJournalFile = Readonly<{
  record: CommandJournalRecord;
  installed: InstalledFile;
}>;

export type GreaterRealmCutoverJournalRecord = Readonly<{
  schemaVersion: 1;
  profile: typeof JOURNAL_PROFILE;
  journalId: string;
  phase: GreaterRealmCutoverJournalPhase;
  phaseOrdinal: number;
  previousPhaseDigest: string | null;
  planDigest: string;
  groupDigest: string;
  operationOrdinal: number;
  previousOperationReceiptDigest: string | null;
  lock: GreaterRealmCutoverJournalLockIdentity;
  command: GreaterRealmCutoverJournalCommand;
  operation: GreaterRealmCutoverJournalOperation;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  artifactRetentionRecord: GreaterRealmImmutableArtifactRetentionRecord | null;
  before: Snapshot;
  expectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
  expectedAfterPredicateDigest: string;
  createdAtMs: number;
  updatedAtMs: number;
  manualAmbiguity: Readonly<{
    schemaVersion: 1;
    profile: 'warpkeep-greater-realm-cutover-manual-ambiguity-v1';
    reason: 'containment-unproven';
    identity: Readonly<Record<string, unknown>>;
  }> | null;
  after: Snapshot | null;
  outcome: CompletionReceipt['outcome'] | null;
  completionReceipt: CompletionReceipt | null;
  completionReceiptDigest: string | null;
}>;

type JournalRecord = GreaterRealmCutoverJournalRecord;

type JournalFile = Readonly<{
  record: JournalRecord;
  installed: InstalledFile;
}>;

function exactObject(value: unknown, keys: readonly string[], code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  const raw = value as Readonly<Record<string, unknown>>;
  const actual = Object.keys(raw).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail(code);
  }
  return raw;
}

function parseSnapshot(value: unknown): Snapshot {
  const raw = exactObject(value, ['status', 'statusDigest', 'audit', 'auditDigest'], 'GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  const projected = snapshot(raw.status, raw.audit);
  if (raw.statusDigest !== projected.statusDigest || raw.auditDigest !== projected.auditDigest) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_SNAPSHOT_DIGEST_MISMATCH');
  }
  return projected;
}

function parseCompletionReceipt(value: unknown): CompletionReceipt {
  const raw = exactObject(value, [
    'schemaVersion', 'profile', 'groupDigest', 'planDigest', 'operationOrdinal',
    'previousOperationReceiptDigest', 'command', 'operation', 'target',
    'sourceReleaseDigest', 'artifactIdentityDigest', 'beforeStatusDigest',
    'beforeAuditDigest', 'expectedAfterPredicateDigest', 'afterStatusDigest',
    'afterAuditDigest', 'auditDelta', 'outcome',
  ], 'GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== COMPLETION_PROFILE
    || typeof raw.groupDigest !== 'string' || !SHA256.test(raw.groupDigest)
    || typeof raw.planDigest !== 'string' || !SHA256.test(raw.planDigest)
    || !Number.isSafeInteger(raw.operationOrdinal)
    || Number(raw.operationOrdinal) < 1 || Number(raw.operationOrdinal) > MAX_OPERATION_RECEIPTS
    || (raw.previousOperationReceiptDigest !== null
      && (typeof raw.previousOperationReceiptDigest !== 'string'
        || !SHA256.test(raw.previousOperationReceiptDigest)))
    || typeof raw.sourceReleaseDigest !== 'string' || !SHA256.test(raw.sourceReleaseDigest)
    || (raw.artifactIdentityDigest !== null
      && (typeof raw.artifactIdentityDigest !== 'string' || !SHA256.test(raw.artifactIdentityDigest)))
    || ![
      raw.beforeStatusDigest, raw.beforeAuditDigest, raw.expectedAfterPredicateDigest,
      raw.afterStatusDigest, raw.afterAuditDigest,
    ].every(child => typeof child === 'string' && SHA256.test(child))
    || (raw.auditDelta !== 'changed' && raw.auditDelta !== 'unchanged')
    || !['verified', 'verified-after-submission-error', 'recovered-after-owner-death']
      .includes(raw.outcome as string)
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_INVALID');
  const receipt = canonicalValue(raw) as CompletionReceipt;
  if (
    !validCommand(receipt.command)
    || !validOperation(receipt.operation)
    || (receipt.command.kind === 'publish') !== (receipt.operation.kind === 'publish')
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_INVALID');
  return Object.freeze(receipt);
}

function parseJournalRecord(value: unknown): JournalRecord {
  const keys = [
    'schemaVersion', 'profile', 'journalId', 'phase', 'phaseOrdinal', 'previousPhaseDigest',
    'planDigest', 'groupDigest', 'operationOrdinal', 'previousOperationReceiptDigest', 'lock',
    'command', 'operation', 'target', 'sourceRelease', 'artifactRetentionRecord', 'before',
    'expectedAfterPredicate', 'expectedAfterPredicateDigest', 'createdAtMs', 'updatedAtMs',
    'manualAmbiguity', 'after', 'outcome', 'completionReceipt', 'completionReceiptDigest',
  ] as const;
  const raw = exactObject(value, keys, 'GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== JOURNAL_PROFILE
    || typeof raw.journalId !== 'string' || !JOURNAL_ID.test(raw.journalId)
    || !GREATER_REALM_CUTOVER_JOURNAL_PHASES.includes(raw.phase as GreaterRealmCutoverJournalPhase)
    || !Number.isSafeInteger(raw.phaseOrdinal)
    || Number(raw.phaseOrdinal) !== journalPhaseOrdinal(raw.phase as GreaterRealmCutoverJournalPhase)
    || (raw.previousPhaseDigest !== null && (typeof raw.previousPhaseDigest !== 'string' || !SHA256.test(raw.previousPhaseDigest)))
    || typeof raw.planDigest !== 'string' || !SHA256.test(raw.planDigest)
    || typeof raw.groupDigest !== 'string' || !SHA256.test(raw.groupDigest)
    || !Number.isSafeInteger(raw.operationOrdinal) || Number(raw.operationOrdinal) < 1 || Number(raw.operationOrdinal) > MAX_OPERATION_RECEIPTS
    || (raw.previousOperationReceiptDigest !== null && (typeof raw.previousOperationReceiptDigest !== 'string' || !SHA256.test(raw.previousOperationReceiptDigest)))
    || typeof raw.expectedAfterPredicateDigest !== 'string' || !SHA256.test(raw.expectedAfterPredicateDigest)
    || !Number.isSafeInteger(raw.createdAtMs) || Number(raw.createdAtMs) < 0
    || !Number.isSafeInteger(raw.updatedAtMs) || Number(raw.updatedAtMs) < Number(raw.createdAtMs)
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  const lock = canonicalValue(raw.lock) as GreaterRealmCutoverJournalLockIdentity;
  const command = canonicalValue(raw.command) as GreaterRealmCutoverJournalCommand;
  const sourceRelease = canonicalValue(raw.sourceRelease) as GreaterRealmCutoverJournalSourceRelease;
  const target = canonicalValue(raw.target) as GreaterRealmCutoverJournalTarget;
  const operation = canonicalValue(raw.operation) as GreaterRealmCutoverJournalOperation;
  if (!validLockIdentity(lock) || !validCommand(command) || !validSourceRelease(sourceRelease)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  }
  if (
    target.uri !== 'https://maincloud.spacetimedb.com'
    || target.database !== 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
    || target.deleteData !== 'never'
    || (operation.kind !== 'reducer' && operation.kind !== 'publish')
    || typeof operation.name !== 'string' || !IDENTIFIER.test(operation.name)
    || typeof operation.argumentsDigest !== 'string' || !SHA256.test(operation.argumentsDigest)
    || !Number.isSafeInteger(operation.argumentsByteLength) || operation.argumentsByteLength < 0
    || operation.argumentsRedacted !== true
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  const retention = raw.artifactRetentionRecord === null
    ? undefined
    : normalizeRetentionRecord(raw.artifactRetentionRecord as GreaterRealmImmutableArtifactRetentionRecord);
  const before = parseSnapshot(raw.before);
  const after = raw.after === null ? null : parseSnapshot(raw.after);
  const outcome = raw.outcome === null
    ? null
    : ['verified', 'verified-after-submission-error', 'recovered-after-owner-death']
        .includes(raw.outcome as string)
      ? raw.outcome as CompletionReceipt['outcome']
      : fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  const manualAmbiguity = raw.manualAmbiguity === null
    ? null
    : exactObject(raw.manualAmbiguity, [
        'schemaVersion', 'profile', 'reason', 'identity',
      ], 'GREATER_REALM_CUTOVER_JOURNAL_MANUAL_AMBIGUITY_INVALID');
  if (manualAmbiguity !== null && (
    manualAmbiguity.schemaVersion !== 1
    || manualAmbiguity.profile !== 'warpkeep-greater-realm-cutover-manual-ambiguity-v1'
    || manualAmbiguity.reason !== 'containment-unproven'
  )) fail('GREATER_REALM_CUTOVER_JOURNAL_MANUAL_AMBIGUITY_INVALID');
  const completionReceipt = raw.completionReceipt === null
    ? null
    : parseCompletionReceipt(raw.completionReceipt);
  const expectedAfterPredicate = normalizeExpectedAfterPredicate(
    raw.expectedAfterPredicate as GreaterRealmCutoverExpectedAfterPredicate,
  );
  if (
    raw.expectedAfterPredicateDigest !== digest(
      'warpkeep-greater-realm-cutover-expected-after-predicate-v1',
      expectedAfterPredicate,
    )
    || ((raw.phase === 'prepared' || raw.phase === 'submission-uncertain')
      && (manualAmbiguity !== null || after !== null || outcome !== null
        || completionReceipt !== null || raw.completionReceiptDigest !== null))
    || (raw.phase === 'manual-ambiguity' && (
      manualAmbiguity === null || after !== null || outcome !== null
      || completionReceipt !== null || raw.completionReceiptDigest !== null
    ))
    || ((raw.phase === 'reconciled' || raw.phase === 'receipt-installed')
      && (manualAmbiguity !== null || after === null || raw.outcome === null || raw.completionReceipt === null
        || typeof raw.completionReceiptDigest !== 'string' || !SHA256.test(raw.completionReceiptDigest)))
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  const projected = Object.freeze({
    ...(raw as unknown as JournalRecord),
    lock,
    command,
    operation,
    target,
    sourceRelease,
    artifactRetentionRecord: retention ?? null,
    before,
    after,
    outcome,
    manualAmbiguity: manualAmbiguity === null ? null : Object.freeze({
      schemaVersion: 1 as const,
      profile: 'warpkeep-greater-realm-cutover-manual-ambiguity-v1' as const,
      reason: 'containment-unproven' as const,
      identity: canonicalValue(manualAmbiguity.identity) as Readonly<Record<string, unknown>>,
    }),
    completionReceipt,
    expectedAfterPredicate,
  });
  if (after !== null && outcome !== null && completionReceipt !== null) {
    const expectedCompletion = completionReceiptFor({
      record: projected,
      after,
      outcome,
    });
    const expectedBody = completionBody(expectedCompletion);
    try {
      const expectedDigest = createHash('sha256').update(expectedBody).digest('hex');
      if (
        canonicalJson(completionReceipt) !== canonicalJson(expectedCompletion)
        || raw.completionReceiptDigest !== expectedDigest
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_MISMATCH');
    } finally {
      expectedBody.fill(0);
    }
  }
  return projected;
}

function journalBody(record: JournalRecord): Buffer {
  return Buffer.from(`${canonicalJson(record)}\n`, 'utf8');
}

function receiptPrefix(kind: GreaterRealmCutoverCommandReceiptKind): 'publish' | 'import' | 'relocation' {
  if (kind.endsWith('publish-v1')) return 'publish';
  if (kind.endsWith('import-v1')) return 'import';
  return 'relocation';
}

function commandReceiptKindFor(
  command: GreaterRealmCutoverJournalCommand,
): GreaterRealmCutoverCommandReceiptKind {
  return command.kind === 'publish'
    ? 'warpkeep-greater-realm-production-publish-v1'
    : command.kind === 'import'
      ? 'warpkeep-greater-realm-production-import-v1'
      : 'warpkeep-greater-realm-production-relocation-v1';
}

function commandCompletionContractFor(input: Readonly<{
  command: GreaterRealmCutoverJournalCommand;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
}>): GreaterRealmCutoverCommandCompletionContract {
  return Object.freeze({
    schemaVersion: 1,
    profile: COMMAND_COMPLETION_CONTRACT_PROFILE,
    evaluatorVersion: 1,
    moduleSourceCommit: input.sourceRelease.moduleSourceCommit,
    receiptKind: commandReceiptKindFor(input.command),
    contract: `${input.command.kind}-${input.command.name}-command-v1`,
  });
}

function commandReceiptBody(input: Readonly<{
  kind: GreaterRealmCutoverCommandReceiptKind;
  recordedAt: string;
  record: Readonly<Record<string, unknown>>;
  target: GreaterRealmCutoverJournalTarget;
}>): Buffer {
  const safe = canonicalValue({
    schemaVersion: 1,
    kind: input.kind,
    recordedAt: input.recordedAt,
    target: input.target,
    record: input.record,
  });
  return Buffer.from(`${JSON.stringify(safe, null, 2)}\n`, 'utf8');
}

function commandJournalBody(record: CommandJournalRecord): Buffer {
  return Buffer.from(`${canonicalJson(record)}\n`, 'utf8');
}

function parseCommandJournalRecord(value: unknown): CommandJournalRecord {
  const raw = exactObject(value, [
    'schemaVersion', 'profile', 'lockId', 'phase', 'previousPhaseDigest', 'groupDigest',
    'command', 'sourceRelease', 'operationReceiptChainDigest', 'operationReceiptCount', 'receiptKind',
    'recordedAt', 'receiptRecord', 'artifactRetentionRecord', 'expectedReceiptDigest', 'expectedReceiptBasename',
    'installedReceiptDigest',
  ], 'GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== COMMAND_JOURNAL_PROFILE
    || typeof raw.lockId !== 'string' || !JOURNAL_ID.test(raw.lockId)
    || (raw.phase !== 'prepared' && raw.phase !== 'receipt-installed')
    || (raw.previousPhaseDigest !== null
      && (typeof raw.previousPhaseDigest !== 'string' || !SHA256.test(raw.previousPhaseDigest)))
    || typeof raw.groupDigest !== 'string' || !SHA256.test(raw.groupDigest)
    || typeof raw.operationReceiptChainDigest !== 'string' || !SHA256.test(raw.operationReceiptChainDigest)
    || !Number.isSafeInteger(raw.operationReceiptCount)
    || Number(raw.operationReceiptCount) < 0
    || Number(raw.operationReceiptCount) > MAX_OPERATION_RECEIPTS
    || ![
      'warpkeep-greater-realm-production-publish-v1',
      'warpkeep-greater-realm-production-import-v1',
      'warpkeep-greater-realm-production-relocation-v1',
    ].includes(raw.receiptKind as string)
    || typeof raw.recordedAt !== 'string'
    || new Date(raw.recordedAt).toISOString() !== raw.recordedAt
    || typeof raw.expectedReceiptDigest !== 'string' || !SHA256.test(raw.expectedReceiptDigest)
    || typeof raw.expectedReceiptBasename !== 'string'
    || raw.expectedReceiptBasename !== `greater-realm-${receiptPrefix(
      raw.receiptKind as GreaterRealmCutoverCommandReceiptKind
    )}-${raw.expectedReceiptDigest}.json`
    || (raw.installedReceiptDigest !== null
      && (typeof raw.installedReceiptDigest !== 'string' || !SHA256.test(raw.installedReceiptDigest)))
    || (raw.phase === 'prepared' && (raw.previousPhaseDigest !== null || raw.installedReceiptDigest !== null))
    || (raw.phase === 'receipt-installed'
      && (raw.previousPhaseDigest === null || raw.installedReceiptDigest !== raw.expectedReceiptDigest))
  ) fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  const command = canonicalValue(raw.command) as GreaterRealmCutoverJournalCommand;
  const sourceRelease = canonicalValue(raw.sourceRelease) as GreaterRealmCutoverJournalSourceRelease;
  const receiptRecord = canonicalValue(raw.receiptRecord) as Readonly<Record<string, unknown>>;
  const artifactRetentionRecord = raw.artifactRetentionRecord === null
    ? null
    : normalizeRetentionRecord(
        raw.artifactRetentionRecord as GreaterRealmImmutableArtifactRetentionRecord,
      )!;
  if (
    !validCommand(command)
    || !validSourceRelease(sourceRelease)
    || receiptRecord.operationReceiptChainDigest !== raw.operationReceiptChainDigest
    || receiptRecord.operationReceiptCount !== raw.operationReceiptCount
  ) fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  const projected = Object.freeze({
    ...(raw as unknown as CommandJournalRecord),
    command,
    sourceRelease,
    receiptRecord,
    artifactRetentionRecord,
  });
  const receiptBody = commandReceiptBody({
    kind: projected.receiptKind,
    recordedAt: projected.recordedAt,
    record: projected.receiptRecord,
    target: Object.freeze({
      uri: 'https://maincloud.spacetimedb.com',
      database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
      deleteData: 'never',
    }),
  });
  try {
    if (createHash('sha256').update(receiptBody).digest('hex') !== projected.expectedReceiptDigest) {
      fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
    }
  } finally {
    receiptBody.fill(0);
  }
  return projected;
}

function parseCommandCompletionContract(
  value: unknown,
): GreaterRealmCutoverCommandCompletionContract {
  const raw = exactObject(value, [
    'schemaVersion', 'profile', 'evaluatorVersion', 'moduleSourceCommit',
    'receiptKind', 'contract',
  ], 'GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== COMMAND_COMPLETION_CONTRACT_PROFILE
    || raw.evaluatorVersion !== 1
    || typeof raw.moduleSourceCommit !== 'string' || !SOURCE_COMMIT.test(raw.moduleSourceCommit)
    || ![
      'warpkeep-greater-realm-production-publish-v1',
      'warpkeep-greater-realm-production-import-v1',
      'warpkeep-greater-realm-production-relocation-v1',
    ].includes(raw.receiptKind as string)
    || typeof raw.contract !== 'string' || !IDENTIFIER.test(raw.contract)
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  return Object.freeze(canonicalValue(raw) as GreaterRealmCutoverCommandCompletionContract);
}

function parseCommandGroupRecord(value: unknown): CommandGroupRecord {
  const raw = exactObject(value, [
    'schemaVersion', 'profile', 'phase', 'phaseOrdinal', 'previousPhaseDigest',
    'groupDigest', 'lock', 'command', 'target', 'sourceRelease',
    'artifactRetentionRecord', 'completionContract', 'before', 'receiptBefore',
    'terminalExpectedAfterPredicate', 'terminalExpectedAfterPredicateDigest',
    'operationReceiptChainDigest', 'operationReceiptCount', 'terminalAfter', 'receiptAfter',
    'createdAtMs', 'updatedAtMs',
  ], 'GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== COMMAND_GROUP_PROFILE
    || !['started', 'planned', 'operation-checkpoint', 'command-reconciled']
      .includes(raw.phase as string)
    || !Number.isSafeInteger(raw.phaseOrdinal)
    || Number(raw.phaseOrdinal) < 1
    || Number(raw.phaseOrdinal) > MAX_OPERATION_RECEIPTS + 3
    || (raw.previousPhaseDigest !== null
      && (typeof raw.previousPhaseDigest !== 'string' || !SHA256.test(raw.previousPhaseDigest)))
    || typeof raw.groupDigest !== 'string' || !SHA256.test(raw.groupDigest)
    || typeof raw.operationReceiptChainDigest !== 'string'
    || !SHA256.test(raw.operationReceiptChainDigest)
    || !Number.isSafeInteger(raw.operationReceiptCount)
    || Number(raw.operationReceiptCount) < 0
    || Number(raw.operationReceiptCount) > MAX_OPERATION_RECEIPTS
    || !Number.isSafeInteger(raw.createdAtMs) || Number(raw.createdAtMs) < 0
    || !Number.isSafeInteger(raw.updatedAtMs) || Number(raw.updatedAtMs) < Number(raw.createdAtMs)
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  const phase = raw.phase as CommandGroupPhase;
  const phaseOrdinal = Number(raw.phaseOrdinal);
  const operationReceiptCount = Number(raw.operationReceiptCount);
  if (
    (phase === 'started' && (
      phaseOrdinal !== 1 || raw.previousPhaseDigest !== null || operationReceiptCount !== 0
      || raw.before !== null || raw.receiptBefore !== null
      || raw.terminalExpectedAfterPredicate !== null
      || raw.terminalExpectedAfterPredicateDigest !== null || raw.terminalAfter !== null
      || raw.receiptAfter !== null
    ))
    || (phase === 'planned' && (
      phaseOrdinal !== 2 || raw.previousPhaseDigest === null || operationReceiptCount !== 0
      || raw.before === null || raw.receiptBefore === null
      || raw.terminalExpectedAfterPredicate === null
      || raw.terminalExpectedAfterPredicateDigest === null || raw.terminalAfter !== null
      || raw.receiptAfter !== null
    ))
    || (phase === 'operation-checkpoint' && (
      phaseOrdinal !== operationReceiptCount + 2 || raw.previousPhaseDigest === null
      || operationReceiptCount < 1 || raw.before === null
      || raw.receiptBefore === null
      || raw.terminalExpectedAfterPredicate === null
      || raw.terminalExpectedAfterPredicateDigest === null || raw.terminalAfter !== null
      || raw.receiptAfter !== null
    ))
    || (phase === 'command-reconciled' && (
      phaseOrdinal !== operationReceiptCount + 3 || raw.previousPhaseDigest === null
      || raw.before === null || raw.receiptBefore === null
      || raw.terminalExpectedAfterPredicate === null
      || raw.terminalExpectedAfterPredicateDigest === null || raw.terminalAfter === null
      || raw.receiptAfter === null
    ))
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  const lock = canonicalValue(raw.lock) as GreaterRealmCutoverJournalLockIdentity;
  const command = canonicalValue(raw.command) as GreaterRealmCutoverJournalCommand;
  const target = canonicalValue(raw.target) as GreaterRealmCutoverJournalTarget;
  const sourceRelease = canonicalValue(raw.sourceRelease) as GreaterRealmCutoverJournalSourceRelease;
  const completionContract = parseCommandCompletionContract(raw.completionContract);
  const retention = raw.artifactRetentionRecord === null
    ? null
    : normalizeRetentionRecord(
        raw.artifactRetentionRecord as GreaterRealmImmutableArtifactRetentionRecord,
      )!;
  const before = raw.before === null ? null : parseSnapshot(raw.before);
  const receiptBefore = raw.receiptBefore === null ? null : parseSnapshot(raw.receiptBefore);
  const terminalExpectedAfterPredicate = raw.terminalExpectedAfterPredicate === null
    ? null
    : normalizeExpectedAfterPredicate(
        raw.terminalExpectedAfterPredicate as GreaterRealmCutoverExpectedAfterPredicate,
      );
  const terminalAfter = raw.terminalAfter === null ? null : parseSnapshot(raw.terminalAfter);
  const receiptAfter = raw.receiptAfter === null ? null : parseSnapshot(raw.receiptAfter);
  if (
    !validLockIdentity(lock)
    || !validCommand(command)
    || !validSourceRelease(sourceRelease)
    || target.uri !== GREATER_REALM_CUTOVER_JOURNAL_TARGET.uri
    || target.database !== GREATER_REALM_CUTOVER_JOURNAL_TARGET.database
    || target.deleteData !== GREATER_REALM_CUTOVER_JOURNAL_TARGET.deleteData
    || completionContract.moduleSourceCommit !== sourceRelease.moduleSourceCommit
    || completionContract.receiptKind !== commandReceiptKindFor(command)
    || canonicalJson(completionContract) !== canonicalJson(commandCompletionContractFor({
      command,
      sourceRelease,
    }))
    || (terminalExpectedAfterPredicate !== null && (
      terminalExpectedAfterPredicate.moduleSourceCommit !== sourceRelease.moduleSourceCommit
      || raw.terminalExpectedAfterPredicateDigest !== digest(
        'warpkeep-greater-realm-cutover-command-expected-after-v1',
        terminalExpectedAfterPredicate,
      )
    ))
    || (phase === 'command-reconciled' && !expectedAfterMatches({
      before: before!,
      after: terminalAfter!,
      predicate: terminalExpectedAfterPredicate!,
    }))
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  const expectedEmpty = emptyGreaterRealmCutoverOperationReceiptChain({
    command,
    target,
    sourceRelease,
  }).operationReceiptChainDigest;
  if (operationReceiptCount === 0 && raw.operationReceiptChainDigest !== expectedEmpty) {
    fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  }
  return Object.freeze({
    ...(raw as unknown as CommandGroupRecord),
    phase,
    phaseOrdinal,
    operationReceiptCount,
    lock,
    command,
    target,
    sourceRelease,
    artifactRetentionRecord: retention,
    completionContract,
    before,
    receiptBefore,
    terminalExpectedAfterPredicate,
    terminalAfter,
    receiptAfter,
  });
}

function commandGroupBody(record: CommandGroupRecord): Buffer {
  return Buffer.from(`${canonicalJson(record)}\n`, 'utf8');
}

function commandGroupBasename(record: CommandGroupRecord): string {
  return `.greater-realm-cutover-command-group-${record.lock.lockId}-${String(
    record.phaseOrdinal,
  ).padStart(8, '0')}-${record.phase}.json`;
}

function installCommandGroup(
  directory: string,
  record: CommandGroupRecord,
  testOnlyStep?: (step: string) => void,
): CommandGroupFile {
  testOnlyStep?.(`before-command-${record.phase}-write`);
  const body = commandGroupBody(record);
  try {
    const basename = commandGroupBasename(record);
    const installed = installImmutableFile({
      directory,
      basename,
      body,
      maximumBytes: MAX_JOURNAL_BYTES,
      temporaryBasename: `${basename.slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
      ...(testOnlyStep === undefined ? {} : {
        testOnlyAfterPartialWrite: () => {
          testOnlyStep(`after-command-${record.phase}-partial-write-before-fsync`);
        },
        testOnlyAfterTemporaryFsync: () => {
          testOnlyStep(`after-command-${record.phase}-temporary-fsync-before-link`);
        },
      }),
    });
    testOnlyStep?.(`after-command-${record.phase}-fsync`);
    return Object.freeze({ record, installed });
  } finally {
    body.fill(0);
  }
}

function installCommandJournal(
  directory: string,
  record: CommandJournalRecord,
): CommandJournalFile {
  const body = commandJournalBody(record);
  try {
    const basename = `.greater-realm-cutover-command-${record.lockId}-${record.phase}.json`;
    const installed = installImmutableFile({
      directory,
      basename,
      body,
      maximumBytes: MAX_JOURNAL_BYTES,
      temporaryBasename: `${basename.slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
    });
    return Object.freeze({ record, installed });
  } finally {
    body.fill(0);
  }
}

function phaseBasename(journalId: string, phase: GreaterRealmCutoverJournalPhase): string {
  return `.greater-realm-cutover-operation-${journalId}-${phase}.json`;
}

function installJournalPhase(
  directory: string,
  record: JournalRecord,
  testOnlyStep?: (step: string) => void,
): JournalFile {
  testOnlyStep?.(`before-${record.phase}-write`);
  const body = journalBody(record);
  try {
    const installed = installImmutableFile({
      directory,
      basename: phaseBasename(record.journalId, record.phase),
      body,
      maximumBytes: MAX_JOURNAL_BYTES,
      temporaryBasename: `${phaseBasename(record.journalId, record.phase).slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
    });
    testOnlyStep?.(`after-${record.phase}-fsync`);
    return Object.freeze({ record, installed });
  } finally {
    body.fill(0);
  }
}

function completionBody(receipt: CompletionReceipt): Buffer {
  return Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8');
}

function installCompletionReceipt(directory: string, receipt: CompletionReceipt): InstalledFile {
  const body = completionBody(receipt);
  const receiptDigest = createHash('sha256').update(body).digest('hex');
  try {
    return installImmutableFile({
      directory,
      basename: `greater-realm-operation-${receiptDigest}.json`,
      body,
      maximumBytes: MAX_COMPLETION_RECEIPT_BYTES,
      temporaryBasename: `.greater-realm-operation-${receiptDigest}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
    });
  } finally {
    body.fill(0);
  }
}

function planCore(input: Readonly<{
  groupDigest: string;
  operationOrdinal: number;
  previousOperationReceiptDigest: string | null;
  command: GreaterRealmCutoverJournalCommand;
  operation: GreaterRealmCutoverJournalOperation;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  artifactRetentionRecord?: GreaterRealmImmutableArtifactRetentionRecord;
  before: Snapshot;
  expectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
}>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    groupDigest: input.groupDigest,
    operationOrdinal: input.operationOrdinal,
    previousOperationReceiptDigest: input.previousOperationReceiptDigest,
    command: input.command,
    operation: input.operation,
    target: input.target,
    sourceRelease: input.sourceRelease,
    artifactRetentionRecord: input.artifactRetentionRecord ?? null,
    before: input.before,
    expectedAfterPredicate: input.expectedAfterPredicate,
  });
}

function exactSameSnapshot(left: Snapshot, right: Snapshot): boolean {
  return left.statusDigest === right.statusDigest && left.auditDigest === right.auditDigest;
}

function completionReceiptFor(input: Readonly<{
  record: JournalRecord;
  after: Snapshot;
  outcome: CompletionReceipt['outcome'];
}>): CompletionReceipt {
  const artifactIdentityDigest = input.record.artifactRetentionRecord === null
    ? null
    : digest('warpkeep-greater-realm-cutover-artifact-retention-v1', input.record.artifactRetentionRecord);
  return Object.freeze({
    schemaVersion: 1,
    profile: COMPLETION_PROFILE,
    groupDigest: input.record.groupDigest,
    planDigest: input.record.planDigest,
    operationOrdinal: input.record.operationOrdinal,
    previousOperationReceiptDigest: input.record.previousOperationReceiptDigest,
    command: input.record.command,
    operation: input.record.operation,
    target: input.record.target,
    sourceReleaseDigest: digest(
      'warpkeep-greater-realm-cutover-source-release-v1',
      input.record.sourceRelease,
    ),
    artifactIdentityDigest,
    beforeStatusDigest: input.record.before.statusDigest,
    beforeAuditDigest: input.record.before.auditDigest,
    expectedAfterPredicateDigest: input.record.expectedAfterPredicateDigest,
    afterStatusDigest: input.after.statusDigest,
    afterAuditDigest: input.after.auditDigest,
    auditDelta: input.after.auditDigest === input.record.before.auditDigest ? 'unchanged' : 'changed',
    outcome: input.outcome,
  });
}

function nextPhase(input: Readonly<{
  previous: JournalFile;
  phase: GreaterRealmCutoverJournalPhase;
  now: number;
  after?: Snapshot;
  outcome?: CompletionReceipt['outcome'];
  completionReceipt?: CompletionReceipt;
  completionReceiptDigest?: string;
  manualAmbiguity?: JournalRecord['manualAmbiguity'];
}>): JournalRecord {
  const phaseOrdinal = journalPhaseOrdinal(input.phase);
  if (
    phaseOrdinal !== input.previous.record.phaseOrdinal + 1
    || !Number.isSafeInteger(input.now)
    || input.now < input.previous.record.updatedAtMs
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_PHASE_INVALID');
  return Object.freeze({
    ...input.previous.record,
    phase: input.phase,
    phaseOrdinal,
    previousPhaseDigest: input.previous.installed.digest,
    updatedAtMs: input.now,
    manualAmbiguity: input.manualAmbiguity ?? null,
    after: input.after ?? null,
    outcome: input.outcome ?? null,
    completionReceipt: input.completionReceipt ?? null,
    completionReceiptDigest: input.completionReceiptDigest ?? null,
  });
}

function nextCommandGroupPhase(input: Readonly<{
  previous: CommandGroupFile;
  phase: Exclude<CommandGroupPhase, 'started'>;
  now: number;
  operationReceiptChainDigest?: string;
  operationReceiptCount?: number;
  before?: Snapshot;
  receiptBefore?: Snapshot;
  terminalExpectedAfterPredicate?: GreaterRealmCutoverExpectedAfterPredicate;
  terminalAfter?: Snapshot;
  receiptAfter?: Snapshot;
}>): CommandGroupRecord {
  const count = input.operationReceiptCount ?? input.previous.record.operationReceiptCount;
  const expectedOrdinal = input.phase === 'planned' ? 2
    : input.phase === 'operation-checkpoint' ? count + 2
      : count + 3;
  if (
    input.previous.record.phase === 'command-reconciled'
    || input.previous.record.phaseOrdinal + 1 !== expectedOrdinal
    || !Number.isSafeInteger(input.now)
    || input.now < input.previous.record.updatedAtMs
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_PHASE_INVALID');
  const predicate = input.terminalExpectedAfterPredicate
    ?? input.previous.record.terminalExpectedAfterPredicate;
  return Object.freeze({
    ...input.previous.record,
    phase: input.phase,
    phaseOrdinal: expectedOrdinal,
    previousPhaseDigest: input.previous.installed.digest,
    operationReceiptChainDigest: input.operationReceiptChainDigest
      ?? input.previous.record.operationReceiptChainDigest,
    operationReceiptCount: count,
    before: input.before ?? input.previous.record.before,
    receiptBefore: input.receiptBefore ?? input.previous.record.receiptBefore,
    terminalExpectedAfterPredicate: predicate,
    terminalExpectedAfterPredicateDigest: predicate === null
      ? null
      : digest('warpkeep-greater-realm-cutover-command-expected-after-v1', predicate),
    terminalAfter: input.terminalAfter ?? null,
    receiptAfter: input.receiptAfter ?? null,
    updatedAtMs: input.now,
  });
}

function removeInstalledFilesInOrder<T extends Readonly<{ installed: InstalledFile }>>(
  directory: string,
  files: readonly T[],
  stepName: (file: T) => string,
  testOnlyStep?: (step: string) => void,
): void {
  for (const file of files) {
    const step = stepName(file);
    testOnlyStep?.(`before-${step}-removal`);
    unlinkExact(file.installed.path, file.installed);
    testOnlyStep?.(`before-${step}-directory-fsync`);
    // Commit each prefix deletion before attempting the next one. Continuing
    // after either failure could strand a non-contiguous, unparseable suffix.
    fsyncDirectory(directory);
    testOnlyStep?.(`after-${step}-removal`);
  }
}

function removeJournalFiles(
  directory: string,
  files: readonly JournalFile[],
  testOnlyStep?: (step: string) => void,
): void {
  // Remove oldest phases first so a crash or failure leaves a self-contained,
  // recoverable suffix. The ordered helper stops on the first failed unlink,
  // failed directory fsync, or injected boundary.
  removeInstalledFilesInOrder(
    directory,
    files,
    file => `operation-${file.record.operationOrdinal}-phase-${file.record.phaseOrdinal}`,
    testOnlyStep,
  );
}

export type GreaterRealmCutoverOperationJournalControl = Readonly<{
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  assertCanStartWrite: () => void;
  retainLockForRecovery: () => void;
  releaseLockRecoveryRetention: () => void;
}>;

export type GreaterRealmCutoverPreparedOperation = Readonly<{
  planDigest: string;
  writePermit: GreaterRealmCutoverWritePermit;
  markManualAmbiguity: (input: Readonly<{
    reason: 'containment-unproven';
    identity: Readonly<Record<string, unknown>>;
  }>) => Promise<void>;
  reconcile: (input: Readonly<{
    afterStatus: unknown;
    afterAudit: unknown;
    outcome: 'verified' | 'verified-after-submission-error';
  }>) => Promise<void>;
  abandonAfterRejectedPermit: (
    error: unknown,
    inspect: () => Promise<Readonly<{
      status: unknown;
      audit: unknown;
    }>>,
  ) => Promise<boolean>;
}>;

export type GreaterRealmCutoverOperationJournalChain = Readonly<{
  bindCommandPlan: (input: Readonly<{
    beforeStatus: unknown;
    beforeAudit: unknown;
    receiptBeforeStatus?: unknown;
    receiptBeforeAudit?: unknown;
    terminalExpectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
  }>) => void;
  prepare: (input: Readonly<{
    operationKind: 'reducer' | 'publish';
    operationName: string;
    arguments: unknown;
    identity?: Readonly<Record<string, unknown>>;
    beforeStatus: unknown;
    beforeAudit: unknown;
    expectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
  }>) => Promise<GreaterRealmCutoverPreparedOperation>;
  reconcileCommand: (input: Readonly<{
    afterStatus: unknown;
    afterAudit: unknown;
    receiptAfterStatus?: unknown;
    receiptAfterAudit?: unknown;
  }>) => void;
  prepareCommandReceipt: (input: Readonly<{
    kind: GreaterRealmCutoverCommandReceiptKind;
    record: Readonly<Record<string, unknown>>;
  }>) => Readonly<{
    recordedAt: string;
    receiptDigest: string;
    receiptBasename: string;
  }>;
  completeCommandReceipt: (input: Readonly<{
    path: string;
    receiptDigest: string;
    cleanupArtifact?: GreaterRealmImmutableArtifactCleanup;
  }>) => void;
  summary: () => GreaterRealmCutoverOperationReceiptChain;
  authority: () => Readonly<{
    lockIdentity: GreaterRealmCutoverJournalLockIdentity;
    groupDigest: string;
  }>;
  retainsArtifact: () => boolean;
}>;

export function emptyGreaterRealmCutoverOperationReceiptChain(input: Readonly<{
  command: GreaterRealmCutoverJournalCommand;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
}>): GreaterRealmCutoverOperationReceiptChain {
  return Object.freeze({
    operationReceiptChainDigest: digest(
      'warpkeep-greater-realm-cutover-empty-operation-receipt-chain-v1',
      input,
    ),
    operationReceiptCount: 0,
  });
}

type GreaterRealmCutoverOperationJournalChainInput = Readonly<{
  directory: string;
  repositoryRoot: string;
  control: GreaterRealmCutoverOperationJournalControl;
  command: GreaterRealmCutoverJournalCommand;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  artifactRetentionRecord?: GreaterRealmImmutableArtifactRetentionRecord;
  now?: () => number;
  testOnlyStep?: (step: string) => void;
}>;

type ReopenedCommandChainState = Readonly<{
  commandGroups: readonly CommandGroupFile[];
  operationGroups: readonly RecoveryOperationGroup[];
}>;

function buildGreaterRealmCutoverOperationJournalChain(
  input: GreaterRealmCutoverOperationJournalChainInput,
  reopened?: ReopenedCommandChainState,
): GreaterRealmCutoverOperationJournalChain {
  if (!validLockIdentity(input.control.lockIdentity)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_LOCK_IDENTITY_INVALID');
  }
  if (!validCommand(input.command) || !validSourceRelease(input.sourceRelease)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_PLAN_INVALID');
  }
  if (
    input.target.uri !== 'https://maincloud.spacetimedb.com'
    || input.target.database !== 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
    || input.target.deleteData !== 'never'
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_TARGET_INVALID');
  const retention = normalizeRetentionRecord(input.artifactRetentionRecord);
  if ((input.command.kind === 'publish') !== (retention !== undefined)) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_BINDING_INVALID');
  }
  if (retention !== undefined && retention.moduleSourceCommit !== input.sourceRelease.moduleSourceCommit) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_BINDING_INVALID');
  }
  const directory = requireGreaterRealmCutoverPrivateDirectory(input);
  const completionContract = commandCompletionContractFor({
    command: input.command,
    sourceRelease: input.sourceRelease,
  });
  const groupDigest = digest('warpkeep-greater-realm-cutover-operation-group-v1', {
    command: input.command,
    target: input.target,
    sourceRelease: input.sourceRelease,
    completionContract,
    artifactIdentity: retention === undefined ? null : {
      artifactDigest: retention.artifactDigest,
      moduleTreeId: retention.moduleTreeId,
      dependencyClosureDigest: retention.dependencyClosureDigest,
    },
  });
  let receiptCount = reopened?.commandGroups.at(-1)?.record.operationReceiptCount ?? 0;
  let receiptChainDigest = reopened?.commandGroups.at(-1)?.record.operationReceiptChainDigest
    ?? emptyGreaterRealmCutoverOperationReceiptChain({
      command: input.command,
      target: input.target,
      sourceRelease: input.sourceRelease,
    }).operationReceiptChainDigest;
  let active = false;
  let artifactRetained = retention !== undefined;
  let lockRetained = reopened !== undefined;
  const retainedOperationFiles: JournalFile[] = reopened === undefined
    ? []
    : reopened.operationGroups.flatMap(group => group.files);
  const commandFiles: CommandJournalFile[] = [];
  const commandGroupFiles: CommandGroupFile[] = reopened === undefined
    ? []
    : [...reopened.commandGroups];
  let commandPrepared: CommandJournalRecord | undefined;
  const createdAtMs = (input.now ?? Date.now)();
  if (!Number.isSafeInteger(createdAtMs) || createdAtMs < input.control.lockIdentity.createdAtMs) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_CLOCK_INVALID');
  }
  let commandGroupCurrent: CommandGroupFile;
  if (reopened !== undefined) {
    commandGroupCurrent = commandGroupFiles.at(-1)!;
    if (
      commandGroupCurrent.record.phase === 'started'
      || commandGroupCurrent.record.phase === 'command-reconciled'
      || commandGroupCurrent.record.groupDigest !== groupDigest
      || canonicalJson(commandGroupCurrent.record.lock)
        !== canonicalJson(input.control.lockIdentity)
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_REOPEN_INVALID');
  } else try {
    input.control.retainLockForRecovery();
    lockRetained = true;
    commandGroupCurrent = installCommandGroup(directory, Object.freeze({
      schemaVersion: 1,
      profile: COMMAND_GROUP_PROFILE,
      phase: 'started',
      phaseOrdinal: 1,
      previousPhaseDigest: null,
      groupDigest,
      lock: input.control.lockIdentity,
      command: input.command,
      target: input.target,
      sourceRelease: input.sourceRelease,
      artifactRetentionRecord: retention ?? null,
      completionContract,
      before: null,
      receiptBefore: null,
      terminalExpectedAfterPredicate: null,
      terminalExpectedAfterPredicateDigest: null,
      operationReceiptChainDigest: receiptChainDigest,
      operationReceiptCount: 0,
      terminalAfter: null,
      receiptAfter: null,
      createdAtMs,
      updatedAtMs: createdAtMs,
    }), input.testOnlyStep);
    commandGroupFiles.push(commandGroupCurrent);
  } catch (error) {
    if (lockRetained) {
      input.control.releaseLockRecoveryRetention();
      lockRetained = false;
    }
    throw error;
  }

  const bindCommandPlan: GreaterRealmCutoverOperationJournalChain['bindCommandPlan'] = planInput => {
    const predicate = normalizeExpectedAfterPredicate(planInput.terminalExpectedAfterPredicate);
    if (predicate.moduleSourceCommit !== input.sourceRelease.moduleSourceCommit) {
      fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_PLAN_INVALID');
    }
    if (commandGroupCurrent.record.phase !== 'started') {
      if (
        commandGroupCurrent.record.terminalExpectedAfterPredicate === null
        || canonicalJson(commandGroupCurrent.record.terminalExpectedAfterPredicate)
          !== canonicalJson(predicate)
      ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_PLAN_MISMATCH');
      return;
    }
    input.control.assertCanStartWrite();
    commandGroupCurrent = installCommandGroup(directory, nextCommandGroupPhase({
      previous: commandGroupCurrent,
      phase: 'planned',
      now: (input.now ?? Date.now)(),
      before: snapshot(planInput.beforeStatus, planInput.beforeAudit),
      receiptBefore: snapshot(
        planInput.receiptBeforeStatus ?? planInput.beforeStatus,
        planInput.receiptBeforeAudit ?? planInput.beforeAudit,
      ),
      terminalExpectedAfterPredicate: predicate,
    }), input.testOnlyStep);
    commandGroupFiles.push(commandGroupCurrent);
  };

  const prepare = async (operationInput: Parameters<GreaterRealmCutoverOperationJournalChain['prepare']>[0]) => {
    if (
      active
      || receiptCount >= MAX_OPERATION_RECEIPTS
      || (commandGroupCurrent.record.phase !== 'planned'
        && commandGroupCurrent.record.phase !== 'operation-checkpoint')
    ) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_LIMIT');
    }
    input.control.assertCanStartWrite();
    const operation = operationIdentity({
      kind: operationInput.operationKind,
      name: operationInput.operationName,
      arguments: operationInput.arguments,
      identity: operationInput.identity,
    });
    const expectedAfterPredicate = normalizeExpectedAfterPredicate(
      operationInput.expectedAfterPredicate,
    );
    if (
      (input.command.kind === 'publish') !== (operation.kind === 'publish')
      || expectedAfterPredicate.moduleSourceCommit !== input.sourceRelease.moduleSourceCommit
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_INVALID');
    const before = snapshot(operationInput.beforeStatus, operationInput.beforeAudit);
    const operationOrdinal = receiptCount + 1;
    const previousOperationReceiptDigest = receiptCount === 0 ? null : receiptChainDigest;
    const core = planCore({
      groupDigest,
      operationOrdinal,
      previousOperationReceiptDigest,
      command: input.command,
      sourceRelease: input.sourceRelease,
      operation,
      target: input.target,
      artifactRetentionRecord: retention,
      before,
      expectedAfterPredicate,
    });
    const planDigest = digest('warpkeep-greater-realm-cutover-operation-plan-v1', core);
    const createdAtMs = (input.now ?? Date.now)();
    if (!Number.isSafeInteger(createdAtMs) || createdAtMs < input.control.lockIdentity.createdAtMs) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_CLOCK_INVALID');
    }
    const journalId = randomUUID().replaceAll('-', '');
    let current = installJournalPhase(directory, Object.freeze({
      schemaVersion: 1,
      profile: JOURNAL_PROFILE,
      journalId,
      phase: 'prepared',
      phaseOrdinal: 1,
      previousPhaseDigest: null,
      planDigest,
      groupDigest,
      operationOrdinal,
      previousOperationReceiptDigest,
      lock: input.control.lockIdentity,
      command: input.command,
      operation,
      target: input.target,
      sourceRelease: input.sourceRelease,
      artifactRetentionRecord: retention ?? null,
      before,
      expectedAfterPredicate,
      expectedAfterPredicateDigest: digest(
        'warpkeep-greater-realm-cutover-expected-after-predicate-v1',
        expectedAfterPredicate,
      ),
      createdAtMs,
      updatedAtMs: createdAtMs,
      manualAmbiguity: null,
      after: null,
      outcome: null,
      completionReceipt: null,
      completionReceiptDigest: null,
    }), input.testOnlyStep);
    const files: JournalFile[] = [current];
    retainedOperationFiles.push(current);
    active = true;
    artifactRetained = retention !== undefined;
    if (!lockRetained) {
      input.control.retainLockForRecovery();
      lockRetained = true;
    }
    let uncertain = false;
    let permitPassed = false;
    let rejectedPermitError: unknown;

    const markSubmissionUncertain = async (): Promise<void> => {
      if (!active || uncertain || current.record.phase !== 'prepared') {
        fail('GREATER_REALM_CUTOVER_JOURNAL_PHASE_INVALID');
      }
      const now = (input.now ?? Date.now)();
      try {
        current = installJournalPhase(directory, nextPhase({
          previous: current,
          phase: 'submission-uncertain',
          now,
        }), input.testOnlyStep);
      } catch (cause) {
        try {
          const possiblyInstalled = parseJournalFile(join(
            directory,
            phaseBasename(current.record.journalId, 'submission-uncertain'),
          ));
          if (
            possiblyInstalled.record.previousPhaseDigest === current.installed.digest
            && !files.some(file => file.installed.path === possiblyInstalled.installed.path)
          ) {
            files.push(possiblyInstalled);
            retainedOperationFiles.push(possiblyInstalled);
          }
        } catch { /* The prepared phase remains the sole durable authority. */ }
        const rejected = new GreaterRealmCutoverWriteNotStartedError(
          'GREATER_REALM_CUTOVER_JOURNAL_SUBMISSION_UNCERTAIN_NOT_DURABLE',
        );
        Object.defineProperty(rejected, 'cause', {
          value: cause,
          configurable: false,
          enumerable: false,
          writable: false,
        });
        rejectedPermitError = rejected;
        throw rejected;
      }
      files.push(current);
      retainedOperationFiles.push(current);
      uncertain = true;
      // Signal handlers are synchronous but may have been deferred by the
      // journal's filesystem work. Yield before the transport's final permit.
      input.testOnlyStep?.('before-submission-uncertain-yield');
      await new Promise<void>(resolveTurn => setImmediate(resolveTurn));
      input.testOnlyStep?.('after-submission-uncertain-yield');
    };
    const bindWriteNotStartedError = (error: unknown): void => {
      if (
        !active || uncertain || permitPassed || current.record.phase !== 'prepared'
        || !isGreaterRealmCutoverWriteNotStartedError(error)
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_WRITE_NOT_STARTED_BINDING_INVALID');
      rejectedPermitError = error;
    };
    const writePermit = Object.assign(() => {
      try {
        input.control.assertCanStartWrite();
        permitPassed = true;
      } catch (error) {
        if (isGreaterRealmCutoverWriteNotStartedError(error)) {
          rejectedPermitError = error;
        }
        throw error;
      }
    }, { markSubmissionUncertain, bindWriteNotStartedError }) as GreaterRealmCutoverWritePermit;

    const markManualAmbiguity: GreaterRealmCutoverPreparedOperation['markManualAmbiguity'] = async ambiguity => {
      if (
        !active || !uncertain || !permitPassed
        || current.record.phase !== 'submission-uncertain'
        || ambiguity.reason !== 'containment-unproven'
      ) fail('GREATER_REALM_CUTOVER_JOURNAL_MANUAL_AMBIGUITY_INVALID');
      const identity = canonicalValue(ambiguity.identity) as Readonly<Record<string, unknown>>;
      current = installJournalPhase(directory, nextPhase({
        previous: current,
        phase: 'manual-ambiguity',
        now: (input.now ?? Date.now)(),
        manualAmbiguity: Object.freeze({
          schemaVersion: 1,
          profile: 'warpkeep-greater-realm-cutover-manual-ambiguity-v1',
          reason: ambiguity.reason,
          identity,
        }),
      }), input.testOnlyStep);
      files.push(current);
      retainedOperationFiles.push(current);
    };

    const reconcile = async (reconcileInput: Parameters<GreaterRealmCutoverPreparedOperation['reconcile']>[0]) => {
      if (!active || !uncertain || !permitPassed || current.record.phase !== 'submission-uncertain') {
        fail('GREATER_REALM_CUTOVER_JOURNAL_REMOTE_WRITE_WITHOUT_UNCERTAIN_PHASE');
      }
      const after = snapshot(reconcileInput.afterStatus, reconcileInput.afterAudit);
      if (!expectedAfterMatches({
        before: current.record.before,
        after,
        predicate: current.record.expectedAfterPredicate,
      })) fail('GREATER_REALM_CUTOVER_JOURNAL_EXPECTED_AFTER_MISMATCH');
      const completionReceipt = completionReceiptFor({
        record: current.record,
        after,
        outcome: reconcileInput.outcome,
      });
      const body = completionBody(completionReceipt);
      const completionReceiptDigest = createHash('sha256').update(body).digest('hex');
      body.fill(0);
      current = installJournalPhase(directory, nextPhase({
        previous: current,
        phase: 'reconciled',
        now: (input.now ?? Date.now)(),
        after,
        outcome: reconcileInput.outcome,
        completionReceipt,
        completionReceiptDigest,
      }), input.testOnlyStep);
      files.push(current);
      retainedOperationFiles.push(current);
      const installedReceipt = installCompletionReceipt(directory, completionReceipt);
      if (installedReceipt.digest !== completionReceiptDigest) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_MISMATCH');
      }
      current = installJournalPhase(directory, nextPhase({
        previous: current,
        phase: 'receipt-installed',
        now: (input.now ?? Date.now)(),
        after,
        outcome: reconcileInput.outcome,
        completionReceipt,
        completionReceiptDigest,
      }), input.testOnlyStep);
      files.push(current);
      retainedOperationFiles.push(current);
      commandGroupCurrent = installCommandGroup(directory, nextCommandGroupPhase({
        previous: commandGroupCurrent,
        phase: 'operation-checkpoint',
        now: (input.now ?? Date.now)(),
        operationReceiptChainDigest: completionReceiptDigest,
        operationReceiptCount: operationOrdinal,
      }), input.testOnlyStep);
      commandGroupFiles.push(commandGroupCurrent);
      receiptCount = operationOrdinal;
      receiptChainDigest = completionReceiptDigest;
      active = false;
    };

    const abandonAfterRejectedPermit = async (
      error: Parameters<GreaterRealmCutoverPreparedOperation['abandonAfterRejectedPermit']>[0],
      inspect: Parameters<GreaterRealmCutoverPreparedOperation['abandonAfterRejectedPermit']>[1],
    ): Promise<boolean> => {
      if (
        !active
        || permitPassed
        || rejectedPermitError !== error
        || !isGreaterRealmCutoverWriteNotStartedError(error)
      ) return false;
      let fresh: Snapshot;
      try {
        const value = await inspect();
        fresh = snapshot(value.status, value.audit);
      } catch {
        return false;
      }
      if (!exactSameSnapshot(before, fresh)) return false;
      try {
        removeJournalFiles(directory, files, input.testOnlyStep);
      } catch {
        return false;
      }
      for (const file of files) {
        const index = retainedOperationFiles.indexOf(file);
        if (index >= 0) retainedOperationFiles.splice(index, 1);
      }
      active = false;
      return true;
    };

    return Object.freeze({
      planDigest,
      writePermit,
      markManualAmbiguity,
      reconcile,
      abandonAfterRejectedPermit,
    });
  };

  const reconcileCommand: GreaterRealmCutoverOperationJournalChain['reconcileCommand'] = commandInput => {
    if (
      active
      || (commandGroupCurrent.record.phase !== 'planned'
        && commandGroupCurrent.record.phase !== 'operation-checkpoint')
      || commandGroupCurrent.record.before === null
      || commandGroupCurrent.record.terminalExpectedAfterPredicate === null
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_PHASE_INVALID');
    const after = snapshot(commandInput.afterStatus, commandInput.afterAudit);
    if (!expectedAfterMatches({
      before: commandGroupCurrent.record.before,
      after,
      predicate: commandGroupCurrent.record.terminalExpectedAfterPredicate,
    })) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_EXPECTED_AFTER_MISMATCH');
    commandGroupCurrent = installCommandGroup(directory, nextCommandGroupPhase({
      previous: commandGroupCurrent,
      phase: 'command-reconciled',
      now: (input.now ?? Date.now)(),
      terminalAfter: after,
      receiptAfter: snapshot(
        commandInput.receiptAfterStatus ?? commandInput.afterStatus,
        commandInput.receiptAfterAudit ?? commandInput.afterAudit,
      ),
    }), input.testOnlyStep);
    commandGroupFiles.push(commandGroupCurrent);
  };

  const prepareCommandReceipt: GreaterRealmCutoverOperationJournalChain['prepareCommandReceipt'] = commandInput => {
    if (
      active
      || commandPrepared !== undefined
      || commandGroupCurrent.record.phase !== 'command-reconciled'
    ) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_PHASE_INVALID');
    }
    const receiptRecord = canonicalValue(commandInput.record) as Readonly<Record<string, unknown>>;
    if (
      receiptRecord.operationReceiptChainDigest !== receiptChainDigest
      || receiptRecord.operationReceiptCount !== receiptCount
    ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CHAIN_MISMATCH');
    const expectedKind = commandReceiptKindFor(input.command);
    if (commandInput.kind !== expectedKind) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_KIND_MISMATCH');
    }
    const now = (input.now ?? Date.now)();
    if (!Number.isSafeInteger(now) || now < input.control.lockIdentity.createdAtMs) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_CLOCK_INVALID');
    }
    const recordedAt = new Date(now).toISOString();
    const body = commandReceiptBody({
      kind: commandInput.kind,
      recordedAt,
      record: receiptRecord,
      target: input.target,
    });
    const expectedReceiptDigest = createHash('sha256').update(body).digest('hex');
    body.fill(0);
    const expectedReceiptBasename = `greater-realm-${receiptPrefix(
      commandInput.kind
    )}-${expectedReceiptDigest}.json`;
    const preparedRecord: CommandJournalRecord = Object.freeze({
      schemaVersion: 1,
      profile: COMMAND_JOURNAL_PROFILE,
      lockId: input.control.lockIdentity.lockId,
      phase: 'prepared',
      previousPhaseDigest: null,
      groupDigest,
      command: input.command,
      sourceRelease: input.sourceRelease,
      operationReceiptChainDigest: receiptChainDigest,
      operationReceiptCount: receiptCount,
      receiptKind: commandInput.kind,
      recordedAt,
      receiptRecord,
      artifactRetentionRecord: retention ?? null,
      expectedReceiptDigest,
      expectedReceiptBasename,
      installedReceiptDigest: null,
    });
    commandPrepared = preparedRecord;
    const installed = installCommandJournal(directory, preparedRecord);
    commandFiles.push(installed);
    if (!lockRetained) {
      input.control.retainLockForRecovery();
      lockRetained = true;
    }
    return Object.freeze({
      recordedAt,
      receiptDigest: expectedReceiptDigest,
      receiptBasename: expectedReceiptBasename,
    });
  };

  const completeCommandReceipt: GreaterRealmCutoverOperationJournalChain['completeCommandReceipt'] = completion => {
    if (active || commandPrepared === undefined || commandFiles.length !== 1) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_PHASE_INVALID');
    }
    if (
      completion.receiptDigest !== commandPrepared.expectedReceiptDigest
      || resolve(completion.path) !== join(directory, commandPrepared.expectedReceiptBasename)
    ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_MISMATCH');
    const expectedBody = commandReceiptBody({
      kind: commandPrepared.receiptKind,
      recordedAt: commandPrepared.recordedAt,
      record: commandPrepared.receiptRecord,
      target: input.target,
    });
    try {
      const installedReceipt = readExactImmutableFile({
        path: completion.path,
        maximumBytes: MAX_COMPLETION_RECEIPT_BYTES,
        expectedBody,
      });
      if (installedReceipt.digest !== commandPrepared.expectedReceiptDigest) {
        fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_MISMATCH');
      }
    } finally {
      expectedBody.fill(0);
    }
    const installedCommand = installCommandJournal(directory, Object.freeze({
      ...commandPrepared,
      phase: 'receipt-installed',
      previousPhaseDigest: commandFiles[0]!.installed.digest,
      installedReceiptDigest: commandPrepared.expectedReceiptDigest,
    }));
    commandFiles.push(installedCommand);
    if (retention !== undefined) {
      if (completion.cleanupArtifact === undefined) {
        fail('GREATER_REALM_CUTOVER_COMMAND_ARTIFACT_CLEANUP_REQUIRED');
      }
      completion.cleanupArtifact(retention, fullArtifactCleanupContext({
        directory,
        groups: recoveryOperationGroups(retainedOperationFiles),
        groupDigest,
        command: input.command,
        target: input.target,
        sourceRelease: input.sourceRelease,
        artifactRetentionRecord: retention,
        operationReceiptChainDigest: receiptChainDigest,
        operationReceiptCount: receiptCount,
      }));
    } else if (completion.cleanupArtifact !== undefined) {
      fail('GREATER_REALM_CUTOVER_COMMAND_ARTIFACT_CLEANUP_UNEXPECTED');
    }
    removeJournalFiles(directory, retainedOperationFiles, input.testOnlyStep);
    const terminalCommand = commandFiles.at(-1)!;
    removeInstalledFilesInOrder(
      directory,
      commandFiles.slice(0, -1),
      file => `command-${file.record.phase}`,
      input.testOnlyStep,
    );
    const terminalCommandGroup = commandGroupFiles.at(-1)!;
    removeInstalledFilesInOrder(
      directory,
      commandGroupFiles.slice(0, -1),
      file => `command-group-ordinal-${file.record.phaseOrdinal}`,
      input.testOnlyStep,
    );
    // The installed command receipt journal is the final, self-contained
    // recovery authority. Remove and durably commit the group authority first;
    // never continue to the command authority after either step fails.
    unlinkExact(terminalCommandGroup.installed.path, terminalCommandGroup.installed);
    fsyncDirectory(directory);
    input.testOnlyStep?.('after-terminal-command-group-removed');
    unlinkExact(terminalCommand.installed.path, terminalCommand.installed);
    fsyncDirectory(directory);
    input.testOnlyStep?.('after-terminal-command-authority-removed');
    commandPrepared = undefined;
    retainedOperationFiles.length = 0;
    commandFiles.length = 0;
    commandGroupFiles.length = 0;
    artifactRetained = false;
    if (!lockRetained) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_PHASE_INVALID');
    input.control.releaseLockRecoveryRetention();
    lockRetained = false;
  };

  return Object.freeze({
    bindCommandPlan,
    prepare,
    reconcileCommand,
    prepareCommandReceipt,
    completeCommandReceipt,
    summary: () => Object.freeze({
      operationReceiptChainDigest: receiptChainDigest,
      operationReceiptCount: receiptCount,
    }),
    authority: () => Object.freeze({
      lockIdentity: input.control.lockIdentity,
      groupDigest,
    }),
    retainsArtifact: () => artifactRetained,
  });
}

export function createGreaterRealmCutoverOperationJournalChain(
  input: GreaterRealmCutoverOperationJournalChainInput,
): GreaterRealmCutoverOperationJournalChain {
  return buildGreaterRealmCutoverOperationJournalChain(input);
}

function parseJournalFile(path: string): JournalFile {
  const installed = readExactImmutableFile({ path, maximumBytes: MAX_JOURNAL_BYTES });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(installed.body));
  } catch {
    fail('GREATER_REALM_CUTOVER_JOURNAL_RECORD_INVALID');
  }
  const record = parseJournalRecord(parsed);
  const name = JOURNAL_FILE.exec(basename(path));
  if (name === null || name[1] !== record.journalId || name[2] !== record.phase) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_FILENAME_MISMATCH');
  }
  return Object.freeze({ record, installed });
}

function parseCommandJournalFile(path: string): CommandJournalFile {
  const installed = readExactImmutableFile({ path, maximumBytes: MAX_JOURNAL_BYTES });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(installed.body));
  } catch {
    fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  }
  const record = parseCommandJournalRecord(parsed);
  const name = COMMAND_JOURNAL_FILE.exec(basename(path));
  if (name === null || name[1] !== record.lockId || name[2] !== record.phase) {
    fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_FILENAME_MISMATCH');
  }
  const expectedBody = commandJournalBody(record);
  try {
    if (!expectedBody.equals(installed.body)) {
      fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
    }
  } finally {
    expectedBody.fill(0);
  }
  return Object.freeze({ record, installed });
}

function parseCommandGroupFile(path: string): CommandGroupFile {
  const installed = readExactImmutableFile({ path, maximumBytes: MAX_JOURNAL_BYTES });
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(installed.body));
  } catch {
    fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  }
  const record = parseCommandGroupRecord(parsed);
  const name = COMMAND_GROUP_FILE.exec(basename(path));
  if (
    name === null
    || name[1] !== record.lock.lockId
    || name[2] !== String(record.phaseOrdinal).padStart(8, '0')
    || name[3] !== record.phase
  ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_FILENAME_MISMATCH');
  const expectedBody = commandGroupBody(record);
  try {
    if (!expectedBody.equals(installed.body)) {
      fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
    }
  } finally {
    expectedBody.fill(0);
  }
  return Object.freeze({ record, installed });
}

export function listGreaterRealmCutoverOperationJournals(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  lockIdentity?: GreaterRealmCutoverJournalLockIdentity;
}>): readonly JournalFile[] {
  const directory = requireGreaterRealmCutoverPrivateDirectory(input);
  const files = readdirSync(directory)
    .filter(name => JOURNAL_FILE.test(name))
    .map(name => parseJournalFile(join(directory, name)));
  if (input.lockIdentity !== undefined) {
    return Object.freeze(files.filter(file => (
      canonicalJson(file.record.lock) === canonicalJson(input.lockIdentity)
    )));
  }
  return Object.freeze(files);
}

type RecoveryOperationGroup = {
  files: JournalFile[];
  current: JournalFile;
};

function recoveryOperationGroups(files: readonly JournalFile[]): readonly RecoveryOperationGroup[] {
  const byId = new Map<string, JournalFile[]>();
  for (const file of files) {
    const group = byId.get(file.record.journalId) ?? [];
    group.push(file);
    byId.set(file.record.journalId, group);
  }
  const groups = [...byId.values()].map(unsorted => {
    const phases = [...unsorted].sort((left, right) => (
      left.record.phaseOrdinal - right.record.phaseOrdinal
    ));
    for (let index = 0; index < phases.length; index += 1) {
      const file = phases[index]!;
      if (index > 0) {
        const previous = phases[index - 1]!;
        if (
          file.record.phaseOrdinal !== previous.record.phaseOrdinal + 1
          || file.record.previousPhaseDigest !== previous.installed.digest
        ) fail('GREATER_REALM_CUTOVER_JOURNAL_PHASE_CHAIN_INVALID');
      } else if (file.record.phaseOrdinal === 1 && file.record.previousPhaseDigest !== null) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_PHASE_CHAIN_INVALID');
      }
      const invariant = { ...file.record, phase: undefined, phaseOrdinal: undefined,
        previousPhaseDigest: undefined, updatedAtMs: undefined, after: undefined,
        manualAmbiguity: undefined, outcome: undefined, completionReceipt: undefined,
        completionReceiptDigest: undefined };
      const first = { ...phases[0]!.record, phase: undefined, phaseOrdinal: undefined,
        previousPhaseDigest: undefined, updatedAtMs: undefined, after: undefined,
        manualAmbiguity: undefined, outcome: undefined, completionReceipt: undefined,
        completionReceiptDigest: undefined };
      if (canonicalJson(invariant) !== canonicalJson(first)) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_PHASE_PLAN_MISMATCH');
      }
    }
    return { files: phases, current: phases.at(-1)! };
  }).sort((left, right) => (
    left.current.record.operationOrdinal - right.current.record.operationOrdinal
  ));
  if (groups.length > MAX_OPERATION_RECEIPTS) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_LIMIT');
  }
  return Object.freeze(groups);
}

function fullArtifactCleanupContext(input: Readonly<{
  directory: string;
  groups: readonly RecoveryOperationGroup[];
  groupDigest: string;
  command: GreaterRealmCutoverJournalCommand;
  target: GreaterRealmCutoverJournalTarget;
  sourceRelease: GreaterRealmCutoverJournalSourceRelease;
  artifactRetentionRecord: GreaterRealmImmutableArtifactRetentionRecord;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
}>): GreaterRealmImmutableArtifactCleanupContext {
  if (
    !Number.isSafeInteger(input.operationReceiptCount)
    || input.operationReceiptCount < 0
    || input.operationReceiptCount > MAX_OPERATION_RECEIPTS
  ) fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INCOMPLETE');
  const readCompletionReceipt = (receiptDigest: string): CompletionReceipt => {
    if (!SHA256.test(receiptDigest)) {
      fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
    }
    const installedReceipt = readExactImmutableFile({
      path: join(input.directory, `greater-realm-operation-${receiptDigest}.json`),
      maximumBytes: MAX_COMPLETION_RECEIPT_BYTES,
    });
    try {
      if (installedReceipt.digest !== receiptDigest) {
        fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(
          installedReceipt.body,
        ));
      } catch {
        fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
      }
      const receipt = parseCompletionReceipt(parsed);
      const canonicalBody = completionBody(receipt);
      try {
        if (!canonicalBody.equals(installedReceipt.body)) {
          fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
        }
      } finally {
        canonicalBody.fill(0);
      }
      return receipt;
    } finally {
      installedReceipt.body.fill(0);
    }
  };
  const expectedSourceReleaseDigest = digest(
    'warpkeep-greater-realm-cutover-source-release-v1',
    input.sourceRelease,
  );
  const expectedArtifactIdentityDigest = digest(
    'warpkeep-greater-realm-cutover-artifact-retention-v1',
    input.artifactRetentionRecord,
  );
  let receiptDigest: string | null = input.operationReceiptCount === 0
    ? null
    : input.operationReceiptChainDigest;
  const reverseReceipts: Array<Readonly<{
    digest: string;
    receipt: CompletionReceipt;
  }>> = [];
  for (let ordinal = input.operationReceiptCount; ordinal >= 1; ordinal -= 1) {
    if (receiptDigest === null) {
      fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INCOMPLETE');
    }
    const receipt = readCompletionReceipt(receiptDigest);
    if (
      receipt.groupDigest !== input.groupDigest
      || receipt.operationOrdinal !== ordinal
      || canonicalJson(receipt.command) !== canonicalJson(input.command)
      || canonicalJson(receipt.target) !== canonicalJson(input.target)
      || receipt.sourceReleaseDigest !== expectedSourceReleaseDigest
      || receipt.artifactIdentityDigest !== expectedArtifactIdentityDigest
    ) fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
    reverseReceipts.push(Object.freeze({ digest: receiptDigest, receipt }));
    receiptDigest = receipt.previousOperationReceiptDigest;
  }
  const expectedEmptyDigest = emptyGreaterRealmCutoverOperationReceiptChain({
    command: input.command,
    target: input.target,
    sourceRelease: input.sourceRelease,
  }).operationReceiptChainDigest;
  if (
    receiptDigest !== null
    || (input.operationReceiptCount === 0
      && input.operationReceiptChainDigest !== expectedEmptyDigest)
  ) fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
  const receipts = reverseReceipts.reverse();
  const firstRemainingOperationOrdinal = input.groups[0]?.current.record.operationOrdinal
    ?? input.operationReceiptCount + 1;
  if (
    firstRemainingOperationOrdinal < 1
    || firstRemainingOperationOrdinal > input.operationReceiptCount + 1
    || input.groups.length
      !== input.operationReceiptCount - firstRemainingOperationOrdinal + 1
  ) fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INCOMPLETE');
  for (let index = 0; index < input.groups.length; index += 1) {
    const group = input.groups[index]!;
    const record = group.current.record;
    const ordinal = firstRemainingOperationOrdinal + index;
    const receipt = receipts[ordinal - 1];
    if (
      receipt === undefined
      || record.phase !== 'receipt-installed'
      || record.operationOrdinal !== ordinal
      || record.groupDigest !== input.groupDigest
      || canonicalJson(record.command) !== canonicalJson(input.command)
      || canonicalJson(record.target) !== canonicalJson(input.target)
      || canonicalJson(record.sourceRelease) !== canonicalJson(input.sourceRelease)
      || canonicalJson(record.artifactRetentionRecord)
        !== canonicalJson(input.artifactRetentionRecord)
      || record.planDigest !== receipt.receipt.planDigest
      || canonicalJson(record.operation) !== canonicalJson(receipt.receipt.operation)
      || record.completionReceiptDigest !== receipt.digest
      || canonicalJson(record.completionReceipt) !== canonicalJson(receipt.receipt)
    ) fail('GREATER_REALM_CUTOVER_ARTIFACT_CLEANUP_OPERATION_CHAIN_INVALID');
  }
  const operations = receipts.map(({ receipt }) => Object.freeze({
      operationOrdinal: receipt.operationOrdinal,
      planDigest: receipt.planDigest,
      operation: immutableCanonicalValue(
        receipt.operation,
      ) as GreaterRealmCutoverJournalOperation,
    }));
  return Object.freeze({
    groupDigest: input.groupDigest,
    command: immutableCanonicalValue(input.command) as GreaterRealmCutoverJournalCommand,
    sourceRelease: immutableCanonicalValue(
      input.sourceRelease,
    ) as GreaterRealmCutoverJournalSourceRelease,
    operations: Object.freeze(operations),
  });
}

function commandJournalFiles(directory: string, lockId: string): CommandJournalFile[] {
  const files = readdirSync(directory)
    .filter(name => COMMAND_JOURNAL_FILE.test(name))
    .map(name => parseCommandJournalFile(join(directory, name)))
    .filter(file => file.record.lockId === lockId)
    .sort((left, right) => (
      left.record.phase === right.record.phase ? 0
        : left.record.phase === 'prepared' ? -1 : 1
    ));
  if (files.length > 2) fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  if (files.length === 2) {
    const [prepared, installed] = files;
    if (
      prepared!.record.phase !== 'prepared'
      || installed!.record.phase !== 'receipt-installed'
      || installed!.record.previousPhaseDigest !== prepared!.installed.digest
    ) fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  }
  return files;
}

function commandGroupJournalFiles(
  directory: string,
  lockId: string,
  allowEmpty = false,
): CommandGroupFile[] {
  const files = readdirSync(directory)
    .filter(name => COMMAND_GROUP_FILE.test(name))
    .map(name => parseCommandGroupFile(join(directory, name)))
    .filter(file => file.record.lock.lockId === lockId)
    .sort((left, right) => left.record.phaseOrdinal - right.record.phaseOrdinal);
  if ((!allowEmpty && files.length < 1) || files.length > MAX_OPERATION_RECEIPTS + 3) {
    fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_INVALID');
  }
  if (files.length === 0) return files;
  const first = files[0]!.record;
  const firstOrdinal = first.phaseOrdinal;
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index]!;
    const previous = files[index - 1];
    if (
      file.record.phaseOrdinal !== firstOrdinal + index
      || (previous === undefined
        ? (file.record.phaseOrdinal === 1
          ? file.record.previousPhaseDigest !== null
          : file.record.previousPhaseDigest === null)
        : file.record.previousPhaseDigest !== previous.installed.digest)
      || file.record.groupDigest !== first.groupDigest
      || canonicalJson(file.record.lock) !== canonicalJson(first.lock)
      || canonicalJson(file.record.command) !== canonicalJson(first.command)
      || canonicalJson(file.record.target) !== canonicalJson(first.target)
      || canonicalJson(file.record.sourceRelease) !== canonicalJson(first.sourceRelease)
      || canonicalJson(file.record.artifactRetentionRecord)
        !== canonicalJson(first.artifactRetentionRecord)
      || canonicalJson(file.record.completionContract)
        !== canonicalJson(first.completionContract)
      || file.record.createdAtMs !== first.createdAtMs
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHAIN_INVALID');
    if (previous !== undefined && (
      file.record.updatedAtMs < previous.record.updatedAtMs
      || (file.record.phase !== 'planned' && (
        canonicalJson(file.record.before) !== canonicalJson(previous.record.before)
        || canonicalJson(file.record.receiptBefore)
          !== canonicalJson(previous.record.receiptBefore)
        || canonicalJson(file.record.terminalExpectedAfterPredicate)
          !== canonicalJson(previous.record.terminalExpectedAfterPredicate)
        || file.record.terminalExpectedAfterPredicateDigest
          !== previous.record.terminalExpectedAfterPredicateDigest
      ))
      || (file.record.phase === 'operation-checkpoint'
        && file.record.operationReceiptCount !== previous.record.operationReceiptCount + 1)
      || (file.record.phase === 'command-reconciled'
        && file.record.operationReceiptCount !== previous.record.operationReceiptCount)
    )) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHAIN_INVALID');
  }
  return files;
}

function assertRecoveryLockFile(
  directory: string,
  expected: GreaterRealmCutoverJournalLockIdentity,
): void {
  const opened = readExactImmutableFile({
    path: join(directory, LOCK_FILE),
    maximumBytes: 4 * 1024,
  });
  if (opened.dev !== expected.dev || opened.ino !== expected.ino) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_REPLACED');
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(opened.body));
  } catch {
    fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
  }
  const raw = exactObject(value, [
    'schemaVersion', 'profile', 'lockId', 'pid', 'processStartIdentity',
    'createdAtMs', 'expiresAtMs',
  ], 'GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
  if (
    raw.schemaVersion !== 1
    || raw.profile !== 'warpkeep-greater-realm-cutover-operator-lock-v1'
    || raw.lockId !== expected.lockId
    || raw.pid !== expected.pid
    || raw.processStartIdentity !== expected.processStartIdentity
    || raw.createdAtMs !== expected.createdAtMs
    || raw.expiresAtMs !== expected.expiresAtMs
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_LOCK_INVALID');
}

function recoveryPlanForCommandGroup(input: Readonly<{
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  commandGroup: CommandGroupFile;
}>): GreaterRealmCutoverRecoveryPlan {
  const core = Object.freeze({
    schemaVersion: 1 as const,
    profile: 'warpkeep-greater-realm-cutover-recovery-plan-v1' as const,
    lockIdentity: input.lockIdentity,
    groupDigest: input.commandGroup.record.groupDigest,
    command: input.commandGroup.record.command,
    sourceReleaseDigest: digest(
      'warpkeep-greater-realm-cutover-source-release-v1',
      input.commandGroup.record.sourceRelease,
    ),
    recoveryAuthorityKind: 'command-group-phase' as const,
    recoveryAuthorityDigest: input.commandGroup.installed.digest,
    operationReceiptChainDigest: input.commandGroup.record.operationReceiptChainDigest,
    operationReceiptCount: input.commandGroup.record.operationReceiptCount,
  });
  return Object.freeze({
    ...core,
    confirmationDigest: digest(
      'warpkeep-greater-realm-cutover-recovery-confirmation-v1',
      core,
    ),
  });
}

function verifyInstalledCommandReceipt(
  directory: string,
  command: CommandJournalFile,
): InstalledFile {
  if (
    command.record.phase !== 'receipt-installed'
    || command.record.installedReceiptDigest !== command.record.expectedReceiptDigest
  ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CLEANUP_SUFFIX_INVALID');
  const expectedBody = commandReceiptBody({
    kind: command.record.receiptKind,
    recordedAt: command.record.recordedAt,
    record: command.record.receiptRecord,
    target: GREATER_REALM_CUTOVER_JOURNAL_TARGET,
  });
  try {
    const receipt = readExactImmutableFile({
      path: join(directory, command.record.expectedReceiptBasename),
      maximumBytes: MAX_COMPLETION_RECEIPT_BYTES,
      expectedBody,
    });
    if (receipt.digest !== command.record.expectedReceiptDigest) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CLEANUP_SUFFIX_INVALID');
    }
    return receipt;
  } finally {
    expectedBody.fill(0);
  }
}

function exactCommandReceiptCleanupSuffix(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
}>): CommandJournalFile | undefined {
  const names = readdirSync(input.directory);
  const commandNames = names.filter(name => COMMAND_JOURNAL_FILE.test(name));
  const groupNames = names.filter(name => COMMAND_GROUP_FILE.test(name));
  const operationNames = names.filter(name => JOURNAL_FILE.test(name));
  if (groupNames.length !== 0 || operationNames.length !== 0) return undefined;
  const commands = commandJournalFiles(input.directory, input.lockIdentity.lockId);
  if (
    commandNames.length !== 1
    || commands.length !== 1
    || commands[0]!.record.phase !== 'receipt-installed'
  ) return undefined;
  verifyInstalledCommandReceipt(input.directory, commands[0]!);
  return commands[0]!;
}

function recoveryPlanForCommandReceipt(input: Readonly<{
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  commandReceipt: CommandJournalFile;
}>): GreaterRealmCutoverRecoveryPlan {
  const core = Object.freeze({
    schemaVersion: 1 as const,
    profile: 'warpkeep-greater-realm-cutover-recovery-plan-v1' as const,
    lockIdentity: input.lockIdentity,
    groupDigest: input.commandReceipt.record.groupDigest,
    command: input.commandReceipt.record.command,
    sourceReleaseDigest: digest(
      'warpkeep-greater-realm-cutover-source-release-v1',
      input.commandReceipt.record.sourceRelease,
    ),
    recoveryAuthorityKind: 'command-receipt' as const,
    recoveryAuthorityDigest: input.commandReceipt.installed.digest,
    operationReceiptChainDigest: input.commandReceipt.record.operationReceiptChainDigest,
    operationReceiptCount: input.commandReceipt.record.operationReceiptCount,
  });
  return Object.freeze({
    ...core,
    confirmationDigest: digest(
      'warpkeep-greater-realm-cutover-recovery-confirmation-v1',
      core,
    ),
  });
}

export function inspectGreaterRealmCutoverOperationRecoveryPlan(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
}>): GreaterRealmCutoverRecoveryPlan {
  const directory = requireGreaterRealmCutoverPrivateDirectory(input);
  assertRecoveryLockFile(directory, input.lockIdentity);
  const groups = commandGroupJournalFiles(directory, input.lockIdentity.lockId, true);
  const current = groups.at(-1);
  if (current !== undefined) {
    if (canonicalJson(current.record.lock) !== canonicalJson(input.lockIdentity)) {
      fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_LOCK_MISMATCH');
    }
    return recoveryPlanForCommandGroup({
      lockIdentity: input.lockIdentity,
      commandGroup: current,
    });
  }
  const commandReceipt = exactCommandReceiptCleanupSuffix({
    directory,
    repositoryRoot: input.repositoryRoot,
    lockIdentity: input.lockIdentity,
  });
  if (commandReceipt === undefined) {
    fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CLEANUP_SUFFIX_INVALID');
  }
  return recoveryPlanForCommandReceipt({
    lockIdentity: input.lockIdentity,
    commandReceipt,
  });
}

export async function recoverGreaterRealmCutoverOperationJournal(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  lockIdentity: GreaterRealmCutoverJournalLockIdentity;
  authorization: GreaterRealmCutoverRecoveryOwnerAuthorization;
  expectedPlanDigest?: string;
  inspect: (record: Readonly<{
    planDigest: string;
    command: GreaterRealmCutoverJournalCommand;
    operation: GreaterRealmCutoverJournalOperation;
    sourceRelease: GreaterRealmCutoverJournalSourceRelease;
    beforeStatus: unknown;
    beforeAudit: unknown;
    expectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
  }>) => Promise<Readonly<{
    status: unknown;
    audit: unknown;
    receiptStatus?: unknown;
    receiptAudit?: unknown;
  }>>;
  classifyPublishRecovery?: (input: Readonly<{
    record: GreaterRealmCutoverJournalRecord;
    inspectAfter: GreaterRealmCutoverJournalSnapshot;
    directory: string;
  }>) => Promise<'definitive-zero' | 'gate-consumed'>;
  inspectCommand?: (record: Readonly<{
    groupDigest: string;
    command: GreaterRealmCutoverJournalCommand;
    sourceRelease: GreaterRealmCutoverJournalSourceRelease;
    beforeStatus: unknown;
    beforeAudit: unknown;
    terminalExpectedAfterPredicate: GreaterRealmCutoverExpectedAfterPredicate;
    operationReceiptChainDigest: string;
    operationReceiptCount: number;
  }>) => Promise<Readonly<{
    status: unknown;
    audit: unknown;
    receiptStatus?: unknown;
    receiptAudit?: unknown;
  }>>;
  recoveryControl?: GreaterRealmCutoverOperationJournalControl;
  resumeCommand?: (input: Readonly<{
    command: GreaterRealmCutoverJournalCommand;
    sourceRelease: GreaterRealmCutoverJournalSourceRelease;
    operationJournal: GreaterRealmCutoverOperationJournalChain;
    assertCanStartWrite: () => void;
  }>) => Promise<Readonly<{
    kind: GreaterRealmCutoverCommandReceiptKind;
    record: Readonly<Record<string, unknown>>;
  }>>;
  commandReceiptForRecoveredChain?: (record: Readonly<{
    command: GreaterRealmCutoverJournalCommand;
    sourceRelease: GreaterRealmCutoverJournalSourceRelease;
    beforeStatus: unknown;
    beforeAudit: unknown;
    afterStatus: unknown;
    afterAudit: unknown;
    operations: readonly Readonly<{
      operationOrdinal: number;
      planDigest: string;
      operation: GreaterRealmCutoverJournalOperation;
      beforeStatus: unknown;
      beforeAudit: unknown;
      afterStatus: unknown;
      afterAudit: unknown;
      outcome: CompletionReceipt['outcome'];
      completionReceiptDigest: string;
    }>[];
    operationReceiptChainDigest: string;
    operationReceiptCount: number;
    outcome: CompletionReceipt['outcome'] | 'command-reconciled-without-write';
  }>) => Promise<Readonly<{
    kind: GreaterRealmCutoverCommandReceiptKind;
    record: Readonly<Record<string, unknown>>;
  }>>;
  revalidateArtifact?: (record: GreaterRealmImmutableArtifactRetentionRecord) => void;
  cleanupArtifact?: GreaterRealmImmutableArtifactCleanup;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
  testOnlyStep?: (step: string) => void;
}>): Promise<Readonly<{
  outcome: 'cleared-before-write' | 'recovered-after-write' | 'completed-idempotently';
  groupDigest?: string;
  operationReceiptChainDigest?: string;
  operationReceiptCount?: number;
  planDigest?: string;
  completionReceiptDigest?: string;
  commandReceiptDigest?: string;
}>> {
  const directory = requireGreaterRealmCutoverPrivateDirectory(input);
  const now = (input.now ?? Date.now)();
  if (!Number.isSafeInteger(now) || now < input.lockIdentity.createdAtMs) {
    fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_CLOCK_INVALID');
  }
  if (productionAdminRecordedOwnerIsDead({
    pid: input.lockIdentity.pid,
    processStartIdentity: input.lockIdentity.processStartIdentity,
    probe: input.processIdentityProbe,
  }) !== true) fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_OWNER_NOT_PROVEN_DEAD');
  assertRecoveryLockFile(directory, input.lockIdentity);

  let commandGroups = commandGroupJournalFiles(directory, input.lockIdentity.lockId, true);
  let commandGroupCurrent = commandGroups.at(-1);
  let commands = commandJournalFiles(directory, input.lockIdentity.lockId);
  if (commandGroupCurrent === undefined) {
    const commandReceipt = exactCommandReceiptCleanupSuffix({
      directory,
      repositoryRoot: input.repositoryRoot,
      lockIdentity: input.lockIdentity,
    });
    if (commandReceipt === undefined) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CLEANUP_SUFFIX_INVALID');
    }
    const exactRecoveryPlan = recoveryPlanForCommandReceipt({
      lockIdentity: input.lockIdentity,
      commandReceipt,
    });
    if (canonicalJson(input.authorization.plan) !== canonicalJson(exactRecoveryPlan)) {
      fail('GREATER_REALM_CUTOVER_RECOVERY_AUTHORIZATION_MISMATCH');
    }
    input.authorization.assertRecoveryWriteAuthorized();
    verifyInstalledCommandReceipt(directory, commandReceipt);
    input.authorization.disposeRecoveryOwnership();
    unlinkExact(commandReceipt.installed.path, commandReceipt.installed);
    fsyncDirectory(directory);
    input.testOnlyStep?.('after-recovery-terminal-command-authority-removed');
    input.testOnlyStep?.('after-recovery-terminal-files-removed');
    input.authorization.releaseOriginalLock();
    return Object.freeze({
      outcome: 'completed-idempotently',
      groupDigest: commandReceipt.record.groupDigest,
      operationReceiptChainDigest: commandReceipt.record.operationReceiptChainDigest,
      operationReceiptCount: commandReceipt.record.operationReceiptCount,
      commandReceiptDigest: commandReceipt.record.expectedReceiptDigest,
    });
  }
  if (canonicalJson(commandGroupCurrent.record.lock) !== canonicalJson(input.lockIdentity)) {
    fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_LOCK_MISMATCH');
  }
  const exactRecoveryPlan = recoveryPlanForCommandGroup({
    lockIdentity: input.lockIdentity,
    commandGroup: commandGroupCurrent,
  });
  if (canonicalJson(input.authorization.plan) !== canonicalJson(exactRecoveryPlan)) {
    fail('GREATER_REALM_CUTOVER_RECOVERY_AUTHORIZATION_MISMATCH');
  }
  input.authorization.assertRecoveryWriteAuthorized();
  const groupDigest = commandGroupCurrent.record.groupDigest;
  const command = commandGroupCurrent.record.command;
  const target = commandGroupCurrent.record.target;
  const sourceRelease = commandGroupCurrent.record.sourceRelease;
  const retention = commandGroupCurrent.record.artifactRetentionRecord;
  let groups = [...recoveryOperationGroups(listGreaterRealmCutoverOperationJournals({
    directory,
    repositoryRoot: input.repositoryRoot,
    lockIdentity: input.lockIdentity,
  }))];

  for (const file of commands) {
    if (
      file.record.groupDigest !== groupDigest
      || canonicalJson(file.record.command) !== canonicalJson(command)
      || canonicalJson(file.record.sourceRelease) !== canonicalJson(sourceRelease)
      || canonicalJson(file.record.artifactRetentionRecord) !== canonicalJson(retention)
    ) fail('GREATER_REALM_CUTOVER_COMMAND_JOURNAL_INVALID');
  }
  const commandAlreadyInstalled = commands.at(-1)?.record.phase === 'receipt-installed';
  const cleanupTail = commandAlreadyInstalled
    && commandGroupCurrent.record.phase === 'command-reconciled';
  const firstRemainingOperationOrdinal = groups[0]?.current.record.operationOrdinal ?? 1;
  for (let index = 0; index < groups.length; index += 1) {
    const record = groups[index]!.current.record;
    if (
      record.operationOrdinal !== (cleanupTail ? firstRemainingOperationOrdinal + index : index + 1)
      || record.groupDigest !== groupDigest
      || canonicalJson(record.command) !== canonicalJson(command)
      || canonicalJson(record.target) !== canonicalJson(target)
      || canonicalJson(record.sourceRelease) !== canonicalJson(sourceRelease)
      || canonicalJson(record.lock) !== canonicalJson(input.lockIdentity)
      || canonicalJson(record.artifactRetentionRecord) !== canonicalJson(retention)
      || (index === 0
        ? (record.operationOrdinal === 1
          ? record.previousOperationReceiptDigest !== null
          : !cleanupTail || record.previousOperationReceiptDigest === null)
        : record.previousOperationReceiptDigest
          !== groups[index - 1]!.current.record.completionReceiptDigest)
      || (index > 0 && groups[index - 1]!.current.record.phase !== 'receipt-installed')
      || (cleanupTail && record.phase !== 'receipt-installed')
    ) fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_CHAIN_INVALID');
  }
  if (
    input.expectedPlanDigest !== undefined
    && groups.at(-1)?.current.record.planDigest !== input.expectedPlanDigest
  ) fail('GREATER_REALM_CUTOVER_JOURNAL_PLAN_MISMATCH');

  if (retention !== null && !commandAlreadyInstalled) {
    if (input.revalidateArtifact === undefined) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_REVALIDATION_REQUIRED');
    }
    input.revalidateArtifact(retention);
  }

  const recordedCount = commandGroupCurrent.record.operationReceiptCount;
  const recordedDigest = commandGroupCurrent.record.operationReceiptChainDigest;
  let completedCount = 0;
  if (cleanupTail) {
    completedCount = recordedCount;
    const commandTail = commands.at(-1)!.record;
    const lastRemainingOperation = groups.at(-1)?.current.record;
    if (
      commandTail.groupDigest !== groupDigest
      || commandTail.operationReceiptCount !== recordedCount
      || commandTail.operationReceiptChainDigest !== recordedDigest
      || firstRemainingOperationOrdinal > recordedCount + 1
      || (lastRemainingOperation !== undefined
        && (lastRemainingOperation.operationOrdinal !== recordedCount
          || lastRemainingOperation.completionReceiptDigest !== recordedDigest))
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHECKPOINT_MISMATCH');
  } else {
    while (groups[completedCount]?.current.record.phase === 'receipt-installed') {
      completedCount += 1;
    }
    if (groups.length - completedCount > 1) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_CHAIN_INVALID');
    }
    const expectedRecordedDigest = recordedCount === 0
      ? emptyGreaterRealmCutoverOperationReceiptChain({ command, target, sourceRelease })
          .operationReceiptChainDigest
      : groups[recordedCount - 1]?.current.record.completionReceiptDigest;
    if (
      recordedCount > completedCount
      || completedCount - recordedCount > 1
      || expectedRecordedDigest !== recordedDigest
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHECKPOINT_MISMATCH');
  }

  let recoveredWrite = false;
  const activeGroup = cleanupTail ? undefined : groups[completedCount];
  if (activeGroup !== undefined) {
    let current = activeGroup.current;
    const files = activeGroup.files;
    if (current.record.phase === 'reconciled') {
      const installed = installCompletionReceipt(directory, current.record.completionReceipt!);
      if (installed.digest !== current.record.completionReceiptDigest) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_MISMATCH');
      }
      current = installJournalPhase(directory, nextPhase({
        previous: current,
        phase: 'receipt-installed',
        now,
        after: current.record.after!,
        outcome: current.record.outcome!,
        completionReceipt: current.record.completionReceipt!,
        completionReceiptDigest: installed.digest,
      }), input.testOnlyStep);
      files.push(current);
      activeGroup.current = current;
      recoveredWrite = true;
      input.testOnlyStep?.('after-recovery-active-operation-reconciled');
    } else {
      if (current.record.phase === 'manual-ambiguity') {
        fail('GREATER_REALM_CUTOVER_JOURNAL_MANUAL_AMBIGUITY_REQUIRES_RESOLUTION');
      }
      const classifyPublishRecovery = current.record.command.kind === 'publish'
        ? input.classifyPublishRecovery
          ?? fail('GREATER_REALM_CUTOVER_PUBLISH_RECOVERY_CLASSIFIER_REQUIRED')
        : undefined;
      const inspected = await input.inspect(Object.freeze({
        planDigest: current.record.planDigest,
        command: current.record.command,
        operation: current.record.operation,
        sourceRelease: current.record.sourceRelease,
        beforeStatus: current.record.before.status,
        beforeAudit: current.record.before.audit,
        expectedAfterPredicate: current.record.expectedAfterPredicate,
      }));
      const observed = snapshot(inspected.status, inspected.audit);
      let publishRecoveryClassification: 'definitive-zero' | 'gate-consumed' | undefined;
      if (classifyPublishRecovery !== undefined) {
        publishRecoveryClassification = await classifyPublishRecovery(Object.freeze({
          record: current.record,
          inspectAfter: observed,
          directory,
        }));
        if (
          publishRecoveryClassification !== 'definitive-zero'
          && publishRecoveryClassification !== 'gate-consumed'
        ) fail('GREATER_REALM_CUTOVER_PUBLISH_RECOVERY_CLASSIFICATION_INVALID');
      }
      if (exactSameSnapshot(current.record.before, observed)) {
        if (publishRecoveryClassification === 'gate-consumed') {
          fail('GREATER_REALM_CUTOVER_PUBLISH_SURVIVOR_PROOF_REQUIRED');
        }
        // A definitive-zero publisher classifier is the synchronous transfer
        // boundary for the exact bound supervisor. It must finish cleanup (or
        // throw) while this operation WAL still exists; only then may the
        // journal clear the zero-write attempt and resume it under new proof.
        removeJournalFiles(directory, files, input.testOnlyStep);
        groups.pop();
        input.testOnlyStep?.('after-recovery-active-operation-cleared-before-write');
      } else {
        if (publishRecoveryClassification === 'definitive-zero') {
          fail('GREATER_REALM_CUTOVER_PUBLISH_RECOVERY_CONCURRENT_DRIFT');
        }
        if (
          current.record.phase !== 'submission-uncertain'
          || !expectedAfterMatches({
            before: current.record.before,
            after: observed,
            predicate: current.record.expectedAfterPredicate,
          })
        ) fail('GREATER_REALM_CUTOVER_JOURNAL_RECOVERY_STATE_MISMATCH');
        const receipt = completionReceiptFor({
          record: current.record,
          after: observed,
          outcome: 'recovered-after-owner-death',
        });
        const body = completionBody(receipt);
        const completionReceiptDigest = createHash('sha256').update(body).digest('hex');
        body.fill(0);
        current = installJournalPhase(directory, nextPhase({
          previous: current,
          phase: 'reconciled',
          now,
          after: observed,
          outcome: 'recovered-after-owner-death',
          completionReceipt: receipt,
          completionReceiptDigest,
        }), input.testOnlyStep);
        files.push(current);
        const installed = installCompletionReceipt(directory, receipt);
        if (installed.digest !== completionReceiptDigest) {
          fail('GREATER_REALM_CUTOVER_JOURNAL_COMPLETION_RECEIPT_MISMATCH');
        }
        current = installJournalPhase(directory, nextPhase({
          previous: current,
          phase: 'receipt-installed',
          now,
          after: observed,
          outcome: 'recovered-after-owner-death',
          completionReceipt: receipt,
          completionReceiptDigest,
        }), input.testOnlyStep);
        files.push(current);
        activeGroup.current = current;
        recoveredWrite = true;
        input.testOnlyStep?.('after-recovery-active-operation-reconciled');
      }
    }
  }

  if (!cleanupTail) {
    completedCount = 0;
    while (groups[completedCount]?.current.record.phase === 'receipt-installed') {
      completedCount += 1;
    }
    if (completedCount === commandGroupCurrent.record.operationReceiptCount + 1) {
      const completed = groups[completedCount - 1]!.current.record;
      commandGroupCurrent = installCommandGroup(directory, nextCommandGroupPhase({
        previous: commandGroupCurrent,
        phase: 'operation-checkpoint',
        now,
        operationReceiptChainDigest: completed.completionReceiptDigest!,
        operationReceiptCount: completedCount,
      }), input.testOnlyStep);
      commandGroups.push(commandGroupCurrent);
    }
    if (completedCount !== commandGroupCurrent.record.operationReceiptCount) {
      fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHECKPOINT_MISMATCH');
    }
  }
  let tip: JournalRecord | undefined = groups.at(-1)?.current.record;
  let chainDigest = commandGroupCurrent.record.operationReceiptChainDigest;
  let chainCount = commandGroupCurrent.record.operationReceiptCount;

  const cleanupStartedCommand = (): void => {
    if (retention !== null) {
      if (input.cleanupArtifact === undefined) {
        fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_CLEANUP_REQUIRED');
      }
      input.cleanupArtifact(retention, fullArtifactCleanupContext({
        directory,
        groups,
        groupDigest,
        command,
        target,
        sourceRelease,
        artifactRetentionRecord: retention,
        operationReceiptChainDigest: chainDigest,
        operationReceiptCount: chainCount,
      }));
      input.testOnlyStep?.('after-recovery-artifact-cleanup');
    }
    const terminal = commandGroups.at(-1)!;
    removeInstalledFilesInOrder(
      directory,
      commandGroups.slice(0, -1),
      file => `command-group-ordinal-${file.record.phaseOrdinal}`,
      input.testOnlyStep,
    );
    input.testOnlyStep?.('after-recovery-nonterminal-wal-removal');
    input.authorization.disposeRecoveryOwnership();
    unlinkExact(terminal.installed.path, terminal.installed);
    fsyncDirectory(directory);
    input.testOnlyStep?.('after-recovery-terminal-files-removed');
    input.authorization.releaseOriginalLock();
  };

  if (commandGroupCurrent.record.phase === 'started') {
    if (groups.length !== 0 || commands.length !== 0) {
      fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHAIN_INVALID');
    }
    cleanupStartedCommand();
    return Object.freeze({
      outcome: 'cleared-before-write',
      groupDigest,
      operationReceiptChainDigest: chainDigest,
      operationReceiptCount: chainCount,
    });
  }
  if (commandGroupCurrent.record.phase !== 'command-reconciled') {
    if (
      commandGroupCurrent.record.before === null
      || commandGroupCurrent.record.terminalExpectedAfterPredicate === null
    ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_PLAN_INVALID');
    if (input.inspectCommand !== undefined) {
      const inspected = await input.inspectCommand(Object.freeze({
        groupDigest,
        command,
        sourceRelease,
        beforeStatus: commandGroupCurrent.record.before.status,
        beforeAudit: commandGroupCurrent.record.before.audit,
        terminalExpectedAfterPredicate:
          commandGroupCurrent.record.terminalExpectedAfterPredicate,
        operationReceiptChainDigest: chainDigest,
        operationReceiptCount: chainCount,
      }));
      const terminalAfter = snapshot(inspected.status, inspected.audit);
      if (
        chainCount === 0
        && !exactSameSnapshot(commandGroupCurrent.record.before, terminalAfter)
      ) fail('GREATER_REALM_CUTOVER_COMMAND_ZERO_RECEIPT_CONCURRENT_DRIFT');
      if (chainCount > 0 && expectedAfterMatches({
        before: commandGroupCurrent.record.before,
        after: terminalAfter,
        predicate: commandGroupCurrent.record.terminalExpectedAfterPredicate,
      })) {
        commandGroupCurrent = installCommandGroup(directory, nextCommandGroupPhase({
          previous: commandGroupCurrent,
          phase: 'command-reconciled',
          now,
          terminalAfter,
          receiptAfter: snapshot(
            inspected.receiptStatus ?? inspected.status,
            inspected.receiptAudit ?? inspected.audit,
          ),
        }), input.testOnlyStep);
        commandGroups.push(commandGroupCurrent);
      }
    }
    if (commandGroupCurrent.record.phase !== 'command-reconciled') {
      if (input.resumeCommand === undefined || input.recoveryControl === undefined) {
        fail('GREATER_REALM_CUTOVER_COMMAND_RESUME_DRIVER_REQUIRED');
      }
      if (
        canonicalJson(input.recoveryControl.lockIdentity)
          !== canonicalJson(input.lockIdentity)
      ) fail('GREATER_REALM_CUTOVER_RECOVERY_CONTROL_INVALID');
      input.recoveryControl.assertCanStartWrite();
      const reopened = buildGreaterRealmCutoverOperationJournalChain({
        directory,
        repositoryRoot: input.repositoryRoot,
        control: input.recoveryControl,
        command,
        target,
        sourceRelease,
        ...(retention === null ? {} : { artifactRetentionRecord: retention }),
        ...(input.now === undefined ? {} : { now: input.now }),
        ...(input.testOnlyStep === undefined ? {} : { testOnlyStep: input.testOnlyStep }),
      }, Object.freeze({
        commandGroups,
        operationGroups: groups,
      }));
      await input.resumeCommand(Object.freeze({
        command,
        sourceRelease,
        operationJournal: reopened,
        assertCanStartWrite: input.recoveryControl.assertCanStartWrite,
      }));
      input.recoveryControl.assertCanStartWrite();
      commandGroups = commandGroupJournalFiles(directory, input.lockIdentity.lockId);
      commandGroupCurrent = commandGroups.at(-1)!;
      groups = [...recoveryOperationGroups(listGreaterRealmCutoverOperationJournals({
        directory,
        repositoryRoot: input.repositoryRoot,
        lockIdentity: input.lockIdentity,
      }))];
      if (
        commandGroupCurrent.record.phase !== 'command-reconciled'
        || commandGroupCurrent.record.groupDigest !== groupDigest
        || canonicalJson(commandGroupCurrent.record.sourceRelease) !== canonicalJson(sourceRelease)
        || canonicalJson(commandGroupCurrent.record.terminalExpectedAfterPredicate)
          !== canonicalJson(commandGroups[1]?.record.terminalExpectedAfterPredicate)
      ) fail('GREATER_REALM_CUTOVER_COMMAND_RESUME_TERMINAL_INVALID');
      for (let index = 0; index < groups.length; index += 1) {
        const record = groups[index]!.current.record;
        if (
          record.phase !== 'receipt-installed'
          || record.operationOrdinal !== index + 1
          || record.groupDigest !== groupDigest
          || (index === 0
            ? record.previousOperationReceiptDigest !== null
            : record.previousOperationReceiptDigest
              !== groups[index - 1]!.current.record.completionReceiptDigest)
        ) fail('GREATER_REALM_CUTOVER_JOURNAL_OPERATION_CHAIN_INVALID');
      }
      chainDigest = commandGroupCurrent.record.operationReceiptChainDigest;
      chainCount = commandGroupCurrent.record.operationReceiptCount;
      tip = groups.at(-1)?.current.record;
      if (
        chainCount !== groups.length
        || (chainCount === 0
          ? chainDigest !== emptyGreaterRealmCutoverOperationReceiptChain({
              command, target, sourceRelease,
            }).operationReceiptChainDigest
          : chainDigest !== tip?.completionReceiptDigest)
      ) fail('GREATER_REALM_CUTOVER_COMMAND_GROUP_CHECKPOINT_MISMATCH');
      input.testOnlyStep?.('after-recovery-command-resume-terminal-reconciled');
    }
  }

  if (commands.length === 0) {
    if (input.commandReceiptForRecoveredChain === undefined) {
      fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_RECOVERY_REQUIRED');
    }
    const recovered = await input.commandReceiptForRecoveredChain(
      Object.freeze({
        command,
        sourceRelease,
        beforeStatus: commandGroupCurrent.record.receiptBefore!.status,
        beforeAudit: commandGroupCurrent.record.receiptBefore!.audit,
        afterStatus: commandGroupCurrent.record.receiptAfter!.status,
        afterAudit: commandGroupCurrent.record.receiptAfter!.audit,
        operations: Object.freeze(groups.map(group => {
          const operation = group.current.record;
          if (
            operation.phase !== 'receipt-installed'
            || operation.after === null
            || operation.outcome === null
            || operation.completionReceiptDigest === null
          ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_RECOVERY_INVALID');
          return Object.freeze({
            operationOrdinal: operation.operationOrdinal,
            planDigest: operation.planDigest,
            operation: operation.operation,
            beforeStatus: operation.before.status,
            beforeAudit: operation.before.audit,
            afterStatus: operation.after.status,
            afterAudit: operation.after.audit,
            outcome: operation.outcome,
            completionReceiptDigest: operation.completionReceiptDigest,
          });
        })),
        operationReceiptChainDigest: chainDigest,
        operationReceiptCount: chainCount,
        outcome: tip?.outcome ?? 'command-reconciled-without-write',
      }),
    );
    const expectedKind = commandReceiptKindFor(command);
    const receiptRecord = canonicalValue({
      ...recovered.record,
      operationReceiptChainDigest: chainDigest,
      operationReceiptCount: chainCount,
    }) as Readonly<Record<string, unknown>>;
    if (
      recovered.kind !== expectedKind
      || receiptRecord.atlasSourceCommit !== sourceRelease.atlasSourceCommit
      || receiptRecord.moduleSourceCommit !== sourceRelease.moduleSourceCommit
      || receiptRecord.atlasId !== sourceRelease.atlasId
      || receiptRecord.publicReleaseId !== sourceRelease.publicReleaseId
      || receiptRecord.expectedReleaseSha256 !== sourceRelease.expectedReleaseSha256
    ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_RECOVERY_INVALID');
    const recordedAt = new Date(now).toISOString();
    const receiptBody = commandReceiptBody({
      kind: recovered.kind,
      recordedAt,
      record: receiptRecord,
      target,
    });
    const expectedReceiptDigest = createHash('sha256').update(receiptBody).digest('hex');
    receiptBody.fill(0);
    const prepared: CommandJournalRecord = Object.freeze({
      schemaVersion: 1,
      profile: COMMAND_JOURNAL_PROFILE,
      lockId: input.lockIdentity.lockId,
      phase: 'prepared',
      previousPhaseDigest: null,
      groupDigest,
      command,
      sourceRelease,
      operationReceiptChainDigest: chainDigest,
      operationReceiptCount: chainCount,
      receiptKind: recovered.kind,
      recordedAt,
      receiptRecord,
      artifactRetentionRecord: retention,
      expectedReceiptDigest,
      expectedReceiptBasename: `greater-realm-${receiptPrefix(recovered.kind)}-${expectedReceiptDigest}.json`,
      installedReceiptDigest: null,
    });
    commands = [installCommandJournal(directory, prepared)];
  }

  const preparedCommand = commands[0]!.record;
  if (
    commandGroupCurrent.record.phase !== 'command-reconciled'
    || preparedCommand.groupDigest !== groupDigest
    || preparedCommand.operationReceiptChainDigest !== chainDigest
    || preparedCommand.operationReceiptCount !== chainCount
  ) fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_CHAIN_MISMATCH');
  const receiptBody = commandReceiptBody({
    kind: preparedCommand.receiptKind,
    recordedAt: preparedCommand.recordedAt,
    record: preparedCommand.receiptRecord,
    target,
  });
  let commandReceipt: InstalledFile;
  try {
    commandReceipt = installImmutableFile({
      directory,
      basename: preparedCommand.expectedReceiptBasename,
      body: receiptBody,
      maximumBytes: MAX_COMPLETION_RECEIPT_BYTES,
      temporaryBasename: `.${preparedCommand.expectedReceiptBasename.slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
    });
  } finally {
    receiptBody.fill(0);
  }
  if (commandReceipt.digest !== preparedCommand.expectedReceiptDigest) {
    fail('GREATER_REALM_CUTOVER_COMMAND_RECEIPT_MISMATCH');
  }
  if (commands.at(-1)!.record.phase !== 'receipt-installed') {
    commands.push(installCommandJournal(directory, Object.freeze({
      ...preparedCommand,
      phase: 'receipt-installed',
      previousPhaseDigest: commands[0]!.installed.digest,
      installedReceiptDigest: preparedCommand.expectedReceiptDigest,
    })));
  }
  input.testOnlyStep?.('after-recovery-final-receipt-installed');
  if (retention !== null) {
    if (input.cleanupArtifact === undefined) {
      fail('GREATER_REALM_CUTOVER_JOURNAL_ARTIFACT_CLEANUP_REQUIRED');
    }
    input.cleanupArtifact(retention, fullArtifactCleanupContext({
      directory,
      groups,
      groupDigest,
      command,
      target,
      sourceRelease,
      artifactRetentionRecord: retention,
      operationReceiptChainDigest: chainDigest,
      operationReceiptCount: chainCount,
    }));
    input.testOnlyStep?.('after-recovery-artifact-cleanup');
  }

  for (const group of groups) {
    removeJournalFiles(directory, group.files, input.testOnlyStep);
  }
  const terminalCommandGroup = commandGroups.at(-1)!;
  removeInstalledFilesInOrder(
    directory,
    commandGroups.slice(0, -1),
    file => `command-group-ordinal-${file.record.phaseOrdinal}`,
    input.testOnlyStep,
  );
  const terminalCommand = commands.at(-1)!;
  removeInstalledFilesInOrder(
    directory,
    commands.slice(0, -1),
    file => `command-${file.record.phase}`,
    input.testOnlyStep,
  );
  input.testOnlyStep?.('after-recovery-nonterminal-wal-removal');
  input.authorization.disposeRecoveryOwnership();
  unlinkExact(terminalCommandGroup.installed.path, terminalCommandGroup.installed);
  fsyncDirectory(directory);
  input.testOnlyStep?.('after-recovery-terminal-command-group-removed');
  unlinkExact(terminalCommand.installed.path, terminalCommand.installed);
  fsyncDirectory(directory);
  input.testOnlyStep?.('after-recovery-terminal-command-authority-removed');
  input.testOnlyStep?.('after-recovery-terminal-files-removed');
  input.authorization.releaseOriginalLock();
  return Object.freeze({
    outcome: recoveredWrite ? 'recovered-after-write' : 'completed-idempotently',
    groupDigest,
    operationReceiptChainDigest: chainDigest,
    operationReceiptCount: chainCount,
    planDigest: tip?.planDigest,
    completionReceiptDigest: tip?.completionReceiptDigest ?? undefined,
    commandReceiptDigest: commandReceipt.digest,
  });
}

export const greaterRealmCutoverOperationJournalTestSeams = Object.freeze({
  canonicalJson,
  digest,
  parseJournalRecord,
  snapshot,
});
