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
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
  productionAdminRecordedOwnerIsDead,
  requireCurrentProductionAdminProcessIdentity,
  type ProductionAdminProcessIdentityProbe,
} from './production-admin-token-budget.mjs';
import {
  GreaterRealmCutoverWriteNotStartedError,
  isGreaterRealmCutoverWriteNotStartedError,
} from './greater-realm-cutover-write-control';
import {
  inspectGreaterRealmCutoverOperationRecoveryPlan,
  requireGreaterRealmCutoverPrivateDirectory,
  recoverGreaterRealmCutoverOperationJournal,
  type GreaterRealmCutoverJournalLockIdentity,
  type GreaterRealmCutoverOperationJournalControl,
  type GreaterRealmCutoverRecoveryPlan,
  type GreaterRealmImmutableArtifactRetentionRecord,
} from './greater-realm-cutover-operation-journal';

const GREATER_REALM_RECOVERY_OWNER_AUTHORIZATION: unique symbol = Symbol(
  'warpkeep-greater-realm-recovery-owner-authorization',
);

export type GreaterRealmCutoverRecoveryOwnerAuthorization = Readonly<{
  [GREATER_REALM_RECOVERY_OWNER_AUTHORIZATION]: true;
  plan: GreaterRealmCutoverRecoveryPlan;
  assertRecoveryWriteAuthorized: () => void;
  abandonCurrentRecoveryOwnershipBeforeUse: () => void;
  releaseOriginalLock: () => void;
  disposeRecoveryOwnership: () => void;
}>;

export const GREATER_REALM_CUTOVER_RECEIPT_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
} as const);

export const GREATER_REALM_CUTOVER_RECEIPT_KINDS = Object.freeze([
  'warpkeep-greater-realm-production-publish-v1',
  'warpkeep-greater-realm-production-import-v1',
  'warpkeep-greater-realm-production-relocation-v1',
] as const);

export type GreaterRealmCutoverReceiptKind =
  typeof GREATER_REALM_CUTOVER_RECEIPT_KINDS[number];

export type GreaterRealmPrivateReceiptWriteResult = Readonly<{
  path: string;
  receiptDigest: string;
  recordedAt: string;
  result: 'installed' | 'unchanged';
}>;

export type GreaterRealmCutoverOperatorLockControl = GreaterRealmCutoverOperationJournalControl & Readonly<{
  /**
   * Must be called synchronously at the last boundary before starting an
   * external write. An interruption never aborts an in-flight write, but it
   * closes the lock against every subsequent write.
   */
  assertCanStartWrite: () => void;
}>;

export class GreaterRealmCutoverReceiptError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmCutoverReceiptError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmCutoverReceiptError(code);
}

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 64 * 1024;
const RECEIPT_FILE = /^greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}\.json$/u;
const TEMPORARY_FILE = /^\.greater-realm-(?:publish|import|relocation)-[0-9a-f]{64}-[0-9a-f]{12}\.json\.tmp$/u;
const OPERATOR_LOCK_FILE = '.greater-realm-cutover.lock';
const OPERATOR_LOCK_TEMPORARY_FILE = /^\.greater-realm-cutover-[0-9a-f]{32}-[1-9][0-9]*-[0-9a-f]{64}\.lock\.tmp$/u;
const OPERATION_JOURNAL_FILE = /^\.greater-realm-cutover-operation-[0-9a-f]{32}-(?:prepared|submission-uncertain|manual-ambiguity|reconciled|receipt-installed)\.json$/u;
const OPERATION_JOURNAL_TEMPORARY_FILE = /^\.greater-realm-cutover-operation-[0-9a-f]{32}-(?:prepared|submission-uncertain|manual-ambiguity|reconciled|receipt-installed)-[0-9a-f]{12}\.json\.tmp$/u;
const OPERATION_RECEIPT_FILE = /^greater-realm-operation-[0-9a-f]{64}\.json$/u;
const OPERATION_RECEIPT_TEMPORARY_FILE = /^\.greater-realm-operation-[0-9a-f]{64}-[0-9a-f]{12}\.json\.tmp$/u;
const COMMAND_JOURNAL_FILE = /^\.greater-realm-cutover-command-[0-9a-f]{32}-(?:prepared|receipt-installed)\.json$/u;
const COMMAND_JOURNAL_TEMPORARY_FILE = /^\.greater-realm-cutover-command-[0-9a-f]{32}-(?:prepared|receipt-installed)-[0-9a-f]{12}\.json\.tmp$/u;
const COMMAND_GROUP_JOURNAL_FILE = /^\.greater-realm-cutover-command-group-[0-9a-f]{32}-[0-9]{8}-(?:started|planned|operation-checkpoint|command-reconciled)\.json$/u;
const RECOVERY_OWNER_FILE = /^\.greater-realm-cutover-recovery-owner-([0-9a-f]{32})-([0-9]{8})\.json$/u;
const OPERATOR_LOCK_MAX_BYTES = 4 * 1024;
const OPERATOR_LOCK_LIFETIME_MS = 24 * 60 * 60 * 1_000;
const OPERATOR_LOCK_PROFILE = 'warpkeep-greater-realm-cutover-operator-lock-v1';
const RECOVERY_OWNER_PROFILE = 'warpkeep-greater-realm-cutover-recovery-owner-v1';

type RecoveryOwnerRecord = Readonly<{
  schemaVersion: 1;
  profile: typeof RECOVERY_OWNER_PROFILE;
  claimId: string;
  claimOrdinal: number;
  previousClaimDigest: string | null;
  oldLockIdentity: GreaterRealmCutoverJournalLockIdentity;
  oldOwnerDeathProof: Readonly<{
    result: 'dead';
    observedAtMs: number;
    settlementWindowMs: typeof OPERATOR_LOCK_LIFETIME_MS;
  }>;
  recoveringPid: number;
  recoveringProcessStartIdentity: string;
  groupDigest: string;
  recoveryAuthorityKind: 'command-group-phase' | 'command-receipt';
  recoveryAuthorityDigest: string;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
  confirmationDigest: string;
  createdAtMs: number;
  expiresAtMs: number;
}>;

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
      fail('GREATER_REALM_CUTOVER_RECEIPT_SYMLINK_REJECTED');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

function privateDirectory(directory: string, repositoryRoot: string): string {
  return requireGreaterRealmCutoverPrivateDirectory({ directory, repositoryRoot });
}

function jsonSafe(value: unknown, ancestors = new Set<object>()): unknown {
  if (
    value === null
    || typeof value === 'boolean'
    || typeof value === 'string'
  ) return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
    return value;
  }
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object' || ancestors.has(value)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) return value.map(child => jsonSafe(child, ancestors));
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      fail('GREATER_REALM_CUTOVER_RECEIPT_RECORD_INVALID');
    }
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => {
        if (/secret|token|credential|actor|subject|fid|castleId|cellKey|slotId|nodeId/iu.test(key)) {
          fail('GREATER_REALM_CUTOVER_RECEIPT_PRIVATE_FIELD_REJECTED');
        }
        return [key, jsonSafe(child, ancestors)];
      }));
  } finally {
    ancestors.delete(value);
  }
}

function receiptPrefix(kind: GreaterRealmCutoverReceiptKind): 'publish' | 'import' | 'relocation' {
  if (kind.endsWith('publish-v1')) return 'publish';
  if (kind.endsWith('import-v1')) return 'import';
  return 'relocation';
}

function readExact(path: string, expected: Buffer): void {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size !== expected.byteLength
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
      || before.nlink !== 1
      || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_EXISTING_MISMATCH');
    const actual = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !actual.equals(expected)
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_EXISTING_MISMATCH');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function defaultGreaterRealmCutoverReceiptDirectory(): string {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep',
    'private',
    'production-admin-v1',
    'greater-realm-cutover-receipts',
  );
}

type OperatorLockRecord = Readonly<{
  schemaVersion: 1;
  profile: typeof OPERATOR_LOCK_PROFILE;
  lockId: string;
  pid: number;
  processStartIdentity: string;
  createdAtMs: number;
  expiresAtMs: number;
}>;

function validTime(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function operatorLockRecord(input: Readonly<{
  now: number;
  processStartIdentity: string;
}>): OperatorLockRecord {
  if (!validTime(input.now)) fail('GREATER_REALM_CUTOVER_OPERATOR_CLOCK_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: OPERATOR_LOCK_PROFILE,
    lockId: randomUUID().replaceAll('-', ''),
    pid: process.pid,
    processStartIdentity: input.processStartIdentity,
    createdAtMs: input.now,
    expiresAtMs: input.now + OPERATOR_LOCK_LIFETIME_MS,
  });
}

function parseOperatorLock(value: unknown): OperatorLockRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(raw).join(',')
      !== 'schemaVersion,profile,lockId,pid,processStartIdentity,createdAtMs,expiresAtMs'
    || raw.schemaVersion !== 1
    || raw.profile !== OPERATOR_LOCK_PROFILE
    || typeof raw.lockId !== 'string'
    || !/^[0-9a-f]{32}$/u.test(raw.lockId)
    || !Number.isSafeInteger(raw.pid)
    || Number(raw.pid) < 1
    || typeof raw.processStartIdentity !== 'string'
    || raw.processStartIdentity.length < 8
    || raw.processStartIdentity.length > 128
    || !validTime(raw.createdAtMs)
    || !validTime(raw.expiresAtMs)
    || Number(raw.expiresAtMs) - Number(raw.createdAtMs) !== OPERATOR_LOCK_LIFETIME_MS
  ) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_INVALID');
  return Object.freeze(raw as OperatorLockRecord);
}

function readOperatorLock(lockPath: string): Readonly<{
  record: OperatorLockRecord;
  dev: number;
  ino: number;
}> {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(lockPath, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size < 1
      || before.size > OPERATOR_LOCK_MAX_BYTES
      || before.nlink !== 1
      || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_INVALID');
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_INVALID');
    }
    return Object.freeze({
      record: parseOperatorLock(value),
      dev: before.dev,
      ino: before.ino,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function journalLockIdentity(
  opened: ReturnType<typeof readOperatorLock>,
): GreaterRealmCutoverJournalLockIdentity {
  return Object.freeze({
    lockId: opened.record.lockId,
    pid: opened.record.pid,
    processStartIdentity: opened.record.processStartIdentity,
    createdAtMs: opened.record.createdAtMs,
    expiresAtMs: opened.record.expiresAtMs,
    dev: opened.dev,
    ino: opened.ino,
  });
}

function parseRecoveryOwnerRecord(value: unknown): RecoveryOwnerRecord {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
  }
  const raw = value as Readonly<Record<string, unknown>>;
  if (
    Object.keys(raw).join(',') !== [
      'schemaVersion', 'profile', 'claimId', 'claimOrdinal', 'previousClaimDigest',
      'oldLockIdentity', 'oldOwnerDeathProof', 'recoveringPid',
      'recoveringProcessStartIdentity', 'groupDigest', 'recoveryAuthorityKind',
      'recoveryAuthorityDigest',
      'operationReceiptChainDigest', 'operationReceiptCount', 'confirmationDigest',
      'createdAtMs', 'expiresAtMs',
    ].join(',')
    || raw.schemaVersion !== 1
    || raw.profile !== RECOVERY_OWNER_PROFILE
    || typeof raw.claimId !== 'string' || !/^[0-9a-f]{32}$/u.test(raw.claimId)
    || !Number.isSafeInteger(raw.claimOrdinal) || Number(raw.claimOrdinal) < 1
    || (raw.previousClaimDigest !== null
      && (typeof raw.previousClaimDigest !== 'string'
        || !/^[0-9a-f]{64}$/u.test(raw.previousClaimDigest)))
    || !Number.isSafeInteger(raw.recoveringPid) || Number(raw.recoveringPid) < 1
    || typeof raw.recoveringProcessStartIdentity !== 'string'
    || raw.recoveringProcessStartIdentity.length < 8
    || raw.recoveringProcessStartIdentity.length > 128
    || (raw.recoveryAuthorityKind !== 'command-group-phase'
      && raw.recoveryAuthorityKind !== 'command-receipt')
    || ![raw.groupDigest, raw.recoveryAuthorityDigest,
      raw.operationReceiptChainDigest, raw.confirmationDigest]
      .every(value => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value))
    || !Number.isSafeInteger(raw.operationReceiptCount)
    || Number(raw.operationReceiptCount) < 0
    || Number(raw.operationReceiptCount) > 4_096
    || !validTime(raw.createdAtMs)
    || !validTime(raw.expiresAtMs)
    || Number(raw.expiresAtMs) - Number(raw.createdAtMs) !== OPERATOR_LOCK_LIFETIME_MS
  ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
  const lock = raw.oldLockIdentity as GreaterRealmCutoverJournalLockIdentity;
  const proof = raw.oldOwnerDeathProof as RecoveryOwnerRecord['oldOwnerDeathProof'];
  if (
    lock === null || typeof lock !== 'object'
    || Object.keys(lock).sort().join(',')
      !== ['lockId', 'pid', 'processStartIdentity', 'createdAtMs', 'expiresAtMs', 'dev', 'ino']
        .sort().join(',')
    || typeof lock.lockId !== 'string' || !/^[0-9a-f]{32}$/u.test(lock.lockId)
    || !Number.isSafeInteger(lock.pid) || lock.pid < 1
    || typeof lock.processStartIdentity !== 'string'
    || !validTime(lock.createdAtMs) || !validTime(lock.expiresAtMs)
    || !Number.isSafeInteger(lock.dev) || !Number.isSafeInteger(lock.ino)
    || proof === null || typeof proof !== 'object'
    || Object.keys(proof).join(',') !== 'result,observedAtMs,settlementWindowMs'
    || proof.result !== 'dead'
    || !validTime(proof.observedAtMs)
    || proof.settlementWindowMs !== OPERATOR_LOCK_LIFETIME_MS
  ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
  return Object.freeze(raw as RecoveryOwnerRecord);
}

type OpenedRecoveryOwner = Readonly<{
  path: string;
  record: RecoveryOwnerRecord;
  dev: number;
  ino: number;
  digest: string;
  body: Buffer;
}>;

function readRecoveryOwner(path: string): OpenedRecoveryOwner {
  let descriptor: number | undefined;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile() || before.size < 1 || before.size > 16 * 1024
      || before.nlink !== 1 || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs || before.ctimeMs !== after.ctimeMs
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
    let parsed: unknown;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body));
    } catch {
      fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
    }
    const record = parseRecoveryOwnerRecord(parsed);
    const match = RECOVERY_OWNER_FILE.exec(path.split('/').at(-1)!);
    if (
      match === null || match[1] !== record.oldLockIdentity.lockId
      || Number(match[2]) !== record.claimOrdinal
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_INVALID');
    return Object.freeze({
      path,
      record,
      dev: before.dev,
      ino: before.ino,
      digest: createHash('sha256').update(body).digest('hex'),
      body,
    });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function recoveryOwners(directory: string, lockId: string): OpenedRecoveryOwner[] {
  const owners = readdirSync(directory)
    .filter(name => RECOVERY_OWNER_FILE.test(name))
    .map(name => readRecoveryOwner(join(directory, name)))
    .filter(owner => owner.record.oldLockIdentity.lockId === lockId)
    .sort((left, right) => left.record.claimOrdinal - right.record.claimOrdinal);
  for (let index = 0; index < owners.length; index += 1) {
    const owner = owners[index]!;
    if (
      owner.record.claimOrdinal !== index + 1
      || owner.record.previousClaimDigest !== (index === 0 ? null : owners[index - 1]!.digest)
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_CHAIN_INVALID');
  }
  return owners;
}

function oneUseRecoveryConfirmation(
  plan: GreaterRealmCutoverRecoveryPlan,
  previousClaimDigest: string | null,
): string {
  return createHash('sha256')
    .update('warpkeep-greater-realm-cutover-one-use-recovery-confirmation-v1\0', 'utf8')
    .update(JSON.stringify({
      planConfirmationDigest: plan.confirmationDigest,
      previousClaimDigest,
    }), 'utf8')
    .digest('hex');
}

function oneUseLockOnlyRecoveryConfirmation(
  lockIdentity: GreaterRealmCutoverJournalLockIdentity,
): string {
  return createHash('sha256')
    .update('warpkeep-greater-realm-cutover-one-use-lock-only-recovery-confirmation-v1\0', 'utf8')
    .update(JSON.stringify({ lockIdentity, durableWalState: 'exactly-empty' }), 'utf8')
    .digest('hex');
}

function unlinkExactOperatorLock(
  lockPath: string,
  expected: Readonly<{ dev: number; ino: number }>,
): void {
  let current;
  try {
    current = lstatSync(lockPath);
  } catch {
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_CLEANUP_FAILED');
  }
  if (
    current.isSymbolicLink()
    || !current.isFile()
    || current.dev !== expected.dev
    || current.ino !== expected.ino
  ) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_REPLACED');
  try {
    unlinkSync(lockPath);
  } catch {
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_CLEANUP_FAILED');
  }
}

function fsyncPrivateDirectory(directory: string): void {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

type LinkedPublicationIdentity = Readonly<{ dev: number; ino: number }>;

function readExactLinkedPublication(input: Readonly<{
  path: string;
  expectedBody: Buffer;
  maximumBytes: number;
  expectedNlink: number;
  failureCode: string;
}>): LinkedPublicationIdentity {
  let descriptor: number | undefined;
  let actual: Buffer | undefined;
  try {
    descriptor = openSync(input.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size !== input.expectedBody.byteLength
      || before.size < 1
      || before.size > input.maximumBytes
      || before.nlink !== input.expectedNlink
      || (before.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && before.uid !== process.getuid())
    ) fail(input.failureCode);
    actual = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.nlink !== after.nlink
      || before.mode !== after.mode
      || before.uid !== after.uid
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !actual.equals(input.expectedBody)
    ) fail(input.failureCode);
    return Object.freeze({ dev: before.dev, ino: before.ino });
  } catch (error) {
    if (error instanceof GreaterRealmCutoverReceiptError) throw error;
    return fail(input.failureCode);
  } finally {
    actual?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function linkedPublicationTemporaryStatus(path: string): Stats | undefined {
  try {
    return lstatSync(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function completeLinkedPublication(input: Readonly<{
  directory: string;
  temporary: string;
  destination: string;
  identity: LinkedPublicationIdentity;
  body: Buffer;
  maximumBytes: number;
  failureCode: string;
}>): void {
  const readCompletedDestination = (): void => {
    const installed = readExactLinkedPublication({
      path: input.destination,
      expectedBody: input.body,
      maximumBytes: input.maximumBytes,
      expectedNlink: 1,
      failureCode: input.failureCode,
    });
    if (installed.dev !== input.identity.dev || installed.ino !== input.identity.ino) {
      fail(input.failureCode);
    }
  };

  let temporaryWasAlreadyRemoved = false;
  const temporaryStatus = linkedPublicationTemporaryStatus(input.temporary);
  if (temporaryStatus === undefined) {
    temporaryWasAlreadyRemoved = true;
  } else {
    if (
      temporaryStatus.isSymbolicLink()
      || !temporaryStatus.isFile()
      || temporaryStatus.dev !== input.identity.dev
      || temporaryStatus.ino !== input.identity.ino
      || temporaryStatus.nlink !== 2
      || temporaryStatus.size !== input.body.byteLength
      || (temporaryStatus.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && temporaryStatus.uid !== process.getuid())
    ) fail(input.failureCode);
    try {
      const verifiedTemporary = readExactLinkedPublication({
        path: input.temporary,
        expectedBody: input.body,
        maximumBytes: input.maximumBytes,
        expectedNlink: 2,
        failureCode: input.failureCode,
      });
      if (
        verifiedTemporary.dev !== input.identity.dev
        || verifiedTemporary.ino !== input.identity.ino
      ) fail(input.failureCode);
    } catch (error) {
      if (linkedPublicationTemporaryStatus(input.temporary) !== undefined) throw error;
      temporaryWasAlreadyRemoved = true;
    }
  }

  if (!temporaryWasAlreadyRemoved) {
    try {
      unlinkSync(input.temporary);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') fail(input.failureCode);
      temporaryWasAlreadyRemoved = true;
    }
  }

  if (temporaryWasAlreadyRemoved) readCompletedDestination();
  fsyncPrivateDirectory(input.directory);
  readCompletedDestination();
  if (linkedPublicationTemporaryStatus(input.temporary) !== undefined) {
    fail(input.failureCode);
  }
}

function unlinkExactRecoveryOwner(opened: OpenedRecoveryOwner): void {
  const current = lstatSync(opened.path);
  if (
    current.isSymbolicLink() || !current.isFile() || current.nlink !== 1
    || current.dev !== opened.dev || current.ino !== opened.ino
    || (current.mode & 0o7777) !== FILE_MODE
  ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_REPLACED');
  unlinkSync(opened.path);
}

function installRecoveryOwner(
  directory: string,
  record: RecoveryOwnerRecord,
  testOnlyStep?: (step: string) => void,
): OpenedRecoveryOwner {
  const basename = `.greater-realm-cutover-recovery-owner-${record.oldLockIdentity.lockId}-${String(
    record.claimOrdinal,
  ).padStart(8, '0')}.json`;
  const destination = join(directory, basename);
  const recoveringStartDigest = createHash('sha256')
    .update(record.recoveringProcessStartIdentity, 'utf8')
    .digest('hex');
  const temporary = join(
    directory,
    `${basename.slice(0, -5)}-${record.claimId}-${record.recoveringPid}-${recoveringStartDigest}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
  );
  const body = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  let descriptor: number | undefined;
  let opened: Readonly<{ dev: number; ino: number }> | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const initial = fstatSync(descriptor);
    opened = Object.freeze({ dev: initial.dev, ino: initial.ino });
    let offset = 0;
    let partialWriteStepReported = false;
    while (offset < body.byteLength) {
      const remaining = body.byteLength - offset;
      const written = writeSync(
        descriptor,
        body,
        offset,
        Math.min(
          remaining,
          partialWriteStepReported ? remaining : Math.max(1, Math.floor(body.byteLength / 2)),
        ),
      );
      if (written <= 0) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_WRITE_FAILED');
      offset += written;
      if (!partialWriteStepReported) {
        partialWriteStepReported = true;
        testOnlyStep?.('after-recovery-owner-partial-write-before-fsync');
      }
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    const ready = fstatSync(descriptor);
    if (
      ready.dev !== opened.dev || ready.ino !== opened.ino
      || ready.nlink !== 1 || ready.size !== body.byteLength
      || (ready.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && ready.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    testOnlyStep?.('before-recovery-owner-link');
    try {
      linkSync(temporary, destination);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_CAS_CONFLICT');
      }
      throw error;
    }
    fsyncPrivateDirectory(directory);
    testOnlyStep?.('after-recovery-owner-fsync');
    completeLinkedPublication({
      directory,
      temporary,
      destination,
      identity: opened,
      body,
      maximumBytes: 16 * 1024,
      failureCode: 'GREATER_REALM_CUTOVER_RECOVERY_OWNER_WRITE_FAILED',
    });
    const installed = readRecoveryOwner(destination);
    if (
      installed.dev !== opened.dev || installed.ino !== opened.ino
      || !installed.body.equals(body)
    ) {
      fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_WRITE_FAILED');
    }
    return installed;
  } catch (error) {
    if (opened !== undefined && existsSync(temporary)) {
      try {
        const status = lstatSync(temporary);
        if (status.dev === opened.dev && status.ino === opened.ino) unlinkSync(temporary);
      } catch { /* Shared exact pair repair handles a linked crash boundary. */ }
    }
    throw error;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
    body.fill(0);
  }
}

function claimGreaterRealmCutoverRecoveryOwnership(input: Readonly<{
  directory: string;
  openedLock: ReturnType<typeof readOperatorLock>;
  plan: GreaterRealmCutoverRecoveryPlan;
  confirmationDigest: string;
  now: number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
  testOnlyStep?: (step: string) => void;
}>): GreaterRealmCutoverRecoveryOwnerAuthorization {
  const lockIdentity = journalLockIdentity(input.openedLock);
  if (JSON.stringify(input.plan.lockIdentity) !== JSON.stringify(lockIdentity)) {
    fail('GREATER_REALM_CUTOVER_RECOVERY_PLAN_LOCK_MISMATCH');
  }
  const owners = recoveryOwners(input.directory, lockIdentity.lockId);
  const previous = owners.at(-1);
  if (previous !== undefined) {
    if (
      productionAdminRecordedOwnerIsDead({
        pid: previous.record.recoveringPid,
        processStartIdentity: previous.record.recoveringProcessStartIdentity,
        probe: input.processIdentityProbe,
      }) !== true
    ) fail('GREATER_REALM_CUTOVER_RECOVERY_OWNER_ACTIVE_OR_AMBIGUOUS');
  }
  const expectedConfirmation = oneUseRecoveryConfirmation(
    input.plan,
    previous?.digest ?? null,
  );
  if (input.confirmationDigest !== expectedConfirmation) {
    fail('GREATER_REALM_CUTOVER_RECOVERY_CONFIRMATION_INVALID');
  }
  const processStartIdentity = requireCurrentProductionAdminProcessIdentity(
    input.processIdentityProbe,
  );
  const record: RecoveryOwnerRecord = Object.freeze({
    schemaVersion: 1,
    profile: RECOVERY_OWNER_PROFILE,
    claimId: randomUUID().replaceAll('-', ''),
    claimOrdinal: owners.length + 1,
    previousClaimDigest: previous?.digest ?? null,
    oldLockIdentity: lockIdentity,
    oldOwnerDeathProof: Object.freeze({
      result: 'dead',
      observedAtMs: input.now,
      settlementWindowMs: OPERATOR_LOCK_LIFETIME_MS,
    }),
    recoveringPid: process.pid,
    recoveringProcessStartIdentity: processStartIdentity,
    groupDigest: input.plan.groupDigest,
    recoveryAuthorityKind: input.plan.recoveryAuthorityKind,
    recoveryAuthorityDigest: input.plan.recoveryAuthorityDigest,
    operationReceiptChainDigest: input.plan.operationReceiptChainDigest,
    operationReceiptCount: input.plan.operationReceiptCount,
    confirmationDigest: input.confirmationDigest,
    createdAtMs: input.now,
    expiresAtMs: input.now + OPERATOR_LOCK_LIFETIME_MS,
  });
  const claimed = installRecoveryOwner(input.directory, record, input.testOnlyStep);
  let originalReleased = false;
  let disposed = false;
  const assertRecoveryWriteAuthorized = (): void => {
    if (originalReleased || disposed) {
      throw new GreaterRealmCutoverWriteNotStartedError(
        'GREATER_REALM_CUTOVER_RECOVERY_OWNERSHIP_NOT_HELD',
      );
    }
    const currentLock = readOperatorLock(join(input.directory, OPERATOR_LOCK_FILE));
    if (
      currentLock.dev !== input.openedLock.dev || currentLock.ino !== input.openedLock.ino
      || currentLock.record.lockId !== input.openedLock.record.lockId
    ) throw new GreaterRealmCutoverWriteNotStartedError(
      'GREATER_REALM_CUTOVER_RECOVERY_ORIGINAL_LOCK_REPLACED',
    );
    const currentClaim = readRecoveryOwner(claimed.path);
    try {
      if (
        currentClaim.dev !== claimed.dev || currentClaim.ino !== claimed.ino
        || !currentClaim.body.equals(claimed.body)
        || currentClaim.record.recoveringPid !== process.pid
        || currentClaim.record.recoveringProcessStartIdentity !== processStartIdentity
      ) throw new GreaterRealmCutoverWriteNotStartedError(
        'GREATER_REALM_CUTOVER_RECOVERY_OWNER_REPLACED',
      );
    } finally {
      currentClaim.body.fill(0);
    }
    const currentOwners = recoveryOwners(input.directory, lockIdentity.lockId);
    try {
      const latest = currentOwners.at(-1);
      if (
        currentOwners.length !== owners.length + 1
        || latest === undefined
        || latest.path !== claimed.path
        || latest.dev !== claimed.dev
        || latest.ino !== claimed.ino
        || latest.digest !== claimed.digest
      ) throw new GreaterRealmCutoverWriteNotStartedError(
        'GREATER_REALM_CUTOVER_RECOVERY_OWNER_NOT_UNIQUE_LATEST',
      );
    } finally {
      for (const owner of currentOwners) owner.body.fill(0);
    }
  };
  return Object.freeze({
    [GREATER_REALM_RECOVERY_OWNER_AUTHORIZATION]: true as const,
    plan: input.plan,
    assertRecoveryWriteAuthorized,
    abandonCurrentRecoveryOwnershipBeforeUse: (): void => {
      if (originalReleased || disposed) fail('GREATER_REALM_CUTOVER_RECOVERY_RELEASE_INVALID');
      assertRecoveryWriteAuthorized();
      const errors: unknown[] = [];
      try { unlinkExactRecoveryOwner(claimed); } catch (error) { errors.push(error); }
      try { fsyncPrivateDirectory(input.directory); } catch (error) { errors.push(error); }
      for (const owner of owners) owner.body.fill(0);
      claimed.body.fill(0);
      disposed = true;
      if (errors.length === 1) throw errors[0];
      if (errors.length > 1) {
        throw new AggregateError(
          errors,
          'GREATER_REALM_CUTOVER_RECOVERY_OWNER_ABANDON_FAILED',
        );
      }
      input.testOnlyStep?.('after-unused-recovery-owner-claim-removed');
    },
    releaseOriginalLock: (): void => {
      if (originalReleased || !disposed) fail('GREATER_REALM_CUTOVER_RECOVERY_RELEASE_INVALID');
      const currentLock = readOperatorLock(join(input.directory, OPERATOR_LOCK_FILE));
      if (
        currentLock.dev !== input.openedLock.dev || currentLock.ino !== input.openedLock.ino
        || currentLock.record.lockId !== input.openedLock.record.lockId
      ) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_REPLACED');
      input.testOnlyStep?.('before-recovery-original-lock-unlink');
      unlinkExactOperatorLock(join(input.directory, OPERATOR_LOCK_FILE), input.openedLock);
      fsyncPrivateDirectory(input.directory);
      input.testOnlyStep?.('after-recovery-original-lock-unlink');
      originalReleased = true;
    },
    disposeRecoveryOwnership: (): void => {
      if (originalReleased || disposed) fail('GREATER_REALM_CUTOVER_RECOVERY_RELEASE_INVALID');
      assertRecoveryWriteAuthorized();
      const claims = [...owners, claimed].reverse();
      try {
        // Remove the newest authority first and durably commit every unlink.
        // Any crash therefore leaves a complete, parseable prefix 1..N.
        for (const owner of claims) {
          unlinkExactRecoveryOwner(owner);
          fsyncPrivateDirectory(input.directory);
          input.testOnlyStep?.(
            `after-recovery-owner-claim-${owner.record.claimOrdinal}-removed`,
          );
        }
      } finally {
        for (const owner of claims) owner.body.fill(0);
      }
      disposed = true;
      input.testOnlyStep?.('after-recovery-owner-claims-removed');
    },
  });
}

export type GreaterRealmCutoverOperatorLockInspection = Readonly<{
  lockId: string;
  pid: number;
  createdAtMs: number;
  expiresAtMs: number;
  ownerState: 'live' | 'dead' | 'ambiguous';
  expired: boolean;
  recoveryEligible: boolean;
}>;

export function inspectGreaterRealmCutoverOperatorLock(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
}>): GreaterRealmCutoverOperatorLockInspection {
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const { record } = readOperatorLock(join(directory, OPERATOR_LOCK_FILE));
  const now = (input.now ?? Date.now)();
  if (!validTime(now) || now < record.createdAtMs) {
    fail('GREATER_REALM_CUTOVER_OPERATOR_CLOCK_INVALID');
  }
  const dead = productionAdminRecordedOwnerIsDead({
    pid: record.pid,
    processStartIdentity: record.processStartIdentity,
    probe: input.processIdentityProbe,
  });
  const ownerState = dead === undefined ? 'ambiguous' : dead ? 'dead' : 'live';
  const expired = now >= record.expiresAtMs;
  return Object.freeze({
    lockId: record.lockId,
    pid: record.pid,
    createdAtMs: record.createdAtMs,
    expiresAtMs: record.expiresAtMs,
    ownerState,
    expired,
    // Exact process death, not elapsed wall-clock time, is the primary
    // authority. The TTL remains visible as a secondary stale-state bound.
    recoveryEligible: ownerState === 'dead',
  });
}

export type GreaterRealmCutoverOperatorJournalRecoveryInspection = Readonly<{
  recoveryMode: 'journal' | 'command-receipt' | 'lock-only';
  lock: GreaterRealmCutoverOperatorLockInspection;
  plan: GreaterRealmCutoverRecoveryPlan | null;
  recoveryOwnerState: 'none' | 'live' | 'dead' | 'ambiguous';
  recoveryOwnerExpiresAtMs: number | null;
  recoveryEligible: boolean;
  confirmationDigest: string | null;
}>;

/** Read-only first half of the mandatory inspect/confirm recovery handshake. */
export function inspectGreaterRealmCutoverOperatorJournalRecovery(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
}>): GreaterRealmCutoverOperatorJournalRecoveryInspection {
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const opened = readOperatorLock(join(directory, OPERATOR_LOCK_FILE));
  const lock = inspectGreaterRealmCutoverOperatorLock(input);
  const owners = recoveryOwners(directory, opened.record.lockId);
  const latest = owners.at(-1);
  let recoveryOwnerState: 'none' | 'live' | 'dead' | 'ambiguous' = 'none';
  if (latest !== undefined) {
    const dead = productionAdminRecordedOwnerIsDead({
      pid: latest.record.recoveringPid,
      processStartIdentity: latest.record.recoveringProcessStartIdentity,
      probe: input.processIdentityProbe,
    });
    recoveryOwnerState = dead === undefined ? 'ambiguous' : dead ? 'dead' : 'live';
  }
  const names = readdirSync(directory);
  const hasDurableWal = names.some(name => (
    OPERATION_JOURNAL_FILE.test(name)
    || COMMAND_JOURNAL_FILE.test(name)
    || COMMAND_GROUP_JOURNAL_FILE.test(name)
  ));
  if (!hasDurableWal) {
    const hasOtherPrivateState = names.some(name => (
      name.startsWith('.') && name !== OPERATOR_LOCK_FILE
    ));
    if (owners.length !== 0 || hasOtherPrivateState) {
      for (const owner of owners) owner.body.fill(0);
      fail('GREATER_REALM_CUTOVER_LOCK_ONLY_RECOVERY_AMBIGUOUS');
    }
    const confirmationDigest = lock.recoveryEligible
      ? oneUseLockOnlyRecoveryConfirmation(journalLockIdentity(opened))
      : null;
    return Object.freeze({
      recoveryMode: 'lock-only',
      lock,
      plan: null,
      recoveryOwnerState: 'none',
      recoveryOwnerExpiresAtMs: null,
      recoveryEligible: lock.recoveryEligible,
      confirmationDigest,
    });
  }
  const plan = inspectGreaterRealmCutoverOperationRecoveryPlan({
    directory,
    repositoryRoot: input.repositoryRoot,
    lockIdentity: journalLockIdentity(opened),
  });
  const recoveryEligible = lock.recoveryEligible
    && (latest === undefined || recoveryOwnerState === 'dead');
  const confirmationDigest = recoveryEligible
    ? oneUseRecoveryConfirmation(plan, latest?.digest ?? null)
    : null;
  for (const owner of owners) owner.body.fill(0);
  return Object.freeze({
    recoveryMode: plan.recoveryAuthorityKind === 'command-receipt'
      ? 'command-receipt'
      : 'journal',
    lock,
    plan,
    recoveryOwnerState,
    recoveryOwnerExpiresAtMs: latest?.record.expiresAtMs ?? null,
    recoveryEligible,
    confirmationDigest,
  });
}

/** Explicit recovery; a TTL by itself is never authority to steal a lock. */
export function recoverGreaterRealmCutoverOperatorLock(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  confirmationDigest: string;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
}>): GreaterRealmCutoverOperatorLockInspection {
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const lockPath = join(directory, OPERATOR_LOCK_FILE);
  const opened = readOperatorLock(lockPath);
  const recoveryInspection = inspectGreaterRealmCutoverOperatorJournalRecovery(input);
  const inspection = recoveryInspection.lock;
  if (
    recoveryInspection.recoveryMode !== 'lock-only'
    || !recoveryInspection.recoveryEligible
    || recoveryInspection.confirmationDigest !== input.confirmationDigest
    || inspection.lockId !== opened.record.lockId
  ) {
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_RECOVERY_REJECTED');
  }
  if (readdirSync(directory).some(name => (
    name.startsWith('.') && name !== OPERATOR_LOCK_FILE
  ))) {
    fail('GREATER_REALM_CUTOVER_OPERATOR_JOURNAL_RECOVERY_REQUIRED');
  }
  unlinkExactOperatorLock(lockPath, opened);
  fsyncPrivateDirectory(directory);
  return inspection;
}

/**
 * Explicit dead-owner recovery for a lock with one durable operation journal.
 * Exact owner death and one-use recovery authority are proven before any
 * remote inspection callback is allowed to run. TTL is metadata, not authority.
 */
export async function recoverGreaterRealmCutoverOperatorJournal(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  confirmationDigest: string;
  inspect: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['inspect'];
  classifyPublishRecovery?: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['classifyPublishRecovery'];
  inspectCommand?: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['inspectCommand'];
  resumeCommand?: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['resumeCommand'];
  commandReceiptForRecoveredChain?: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['commandReceiptForRecoveredChain'];
  expectedPlanDigest?: string;
  revalidateArtifact?: (record: GreaterRealmImmutableArtifactRetentionRecord) => void;
  cleanupArtifact?: Parameters<typeof recoverGreaterRealmCutoverOperationJournal>[0]['cleanupArtifact'];
  /** Local-only credential/session validation after claim, before inspection or WAL mutation. */
  prepareRecovery?: () => void | Promise<void>;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
  testOnlyStep?: (step: string) => void;
}>): Promise<Readonly<{
  lock: GreaterRealmCutoverOperatorLockInspection;
  recovery: Awaited<ReturnType<typeof recoverGreaterRealmCutoverOperationJournal>>;
}>> {
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const lockPath = join(directory, OPERATOR_LOCK_FILE);
  const opened = readOperatorLock(lockPath);
  const recoveryInspection = inspectGreaterRealmCutoverOperatorJournalRecovery(input);
  const inspection = recoveryInspection.lock;
  if (
    recoveryInspection.recoveryMode === 'lock-only'
    || recoveryInspection.plan === null
    || !recoveryInspection.recoveryEligible
    || recoveryInspection.confirmationDigest !== input.confirmationDigest
    || inspection.lockId !== opened.record.lockId
  ) {
    fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_RECOVERY_REJECTED');
  }
  const lockIdentity = journalLockIdentity(opened);
  const now = (input.now ?? Date.now)();
  const authorization = claimGreaterRealmCutoverRecoveryOwnership({
    directory,
    openedLock: opened,
    plan: recoveryInspection.plan,
    confirmationDigest: input.confirmationDigest,
    now,
    ...(input.processIdentityProbe === undefined
      ? {}
      : { processIdentityProbe: input.processIdentityProbe }),
    ...(input.testOnlyStep === undefined ? {} : { testOnlyStep: input.testOnlyStep }),
  });
  if (input.prepareRecovery !== undefined) {
    try {
      await input.prepareRecovery();
    } catch (primaryError) {
      try {
        authorization.abandonCurrentRecoveryOwnershipBeforeUse();
      } catch (cleanupError) {
        throw new AggregateError(
          [primaryError, cleanupError],
          'GREATER_REALM_CUTOVER_RECOVERY_PREFLIGHT_CLEANUP_FAILED',
        );
      }
      throw primaryError;
    }
  }
  let interruptedBy: NodeJS.Signals | undefined;
  const onSigint = () => { interruptedBy ??= 'SIGINT'; };
  const onSigterm = () => { interruptedBy ??= 'SIGTERM'; };
  let retained = true;
  const control: GreaterRealmCutoverOperatorLockControl = Object.freeze({
    lockIdentity,
    assertCanStartWrite: (): void => {
      if (interruptedBy !== undefined) {
        throw new GreaterRealmCutoverWriteNotStartedError(
          `GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_${interruptedBy}`,
        );
      }
      authorization.assertRecoveryWriteAuthorized();
    },
    retainLockForRecovery: (): void => {
      if (retained) fail('GREATER_REALM_CUTOVER_OPERATOR_RECOVERY_RETENTION_INVALID');
      retained = true;
    },
    releaseLockRecoveryRetention: (): void => {
      if (!retained) fail('GREATER_REALM_CUTOVER_OPERATOR_RECOVERY_RETENTION_INVALID');
      retained = false;
    },
  });
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    const recovery = await recoverGreaterRealmCutoverOperationJournal({
      directory,
      repositoryRoot: input.repositoryRoot,
      lockIdentity,
      authorization,
      recoveryControl: control,
      inspect: input.inspect,
      ...(input.classifyPublishRecovery === undefined
        ? {}
        : { classifyPublishRecovery: input.classifyPublishRecovery }),
      ...(input.inspectCommand === undefined ? {} : { inspectCommand: input.inspectCommand }),
      ...(input.resumeCommand === undefined ? {} : { resumeCommand: input.resumeCommand }),
      ...(input.commandReceiptForRecoveredChain === undefined
        ? {}
        : { commandReceiptForRecoveredChain: input.commandReceiptForRecoveredChain }),
      ...(input.expectedPlanDigest === undefined
        ? {}
        : { expectedPlanDigest: input.expectedPlanDigest }),
      ...(input.revalidateArtifact === undefined
        ? {}
        : { revalidateArtifact: input.revalidateArtifact }),
      ...(input.cleanupArtifact === undefined
        ? {}
        : { cleanupArtifact: input.cleanupArtifact }),
      ...(input.now === undefined ? {} : { now: input.now }),
      ...(input.processIdentityProbe === undefined
        ? {}
        : { processIdentityProbe: input.processIdentityProbe }),
      ...(input.testOnlyStep === undefined ? {} : { testOnlyStep: input.testOnlyStep }),
    });
    return Object.freeze({ lock: inspection, recovery });
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
}

/** Serializes all production cutover writes in the same owner-only directory. */
export async function withGreaterRealmCutoverOperatorLock<T>(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  operation: (control: GreaterRealmCutoverOperatorLockControl) => Promise<T>;
  now?: () => number;
  processIdentityProbe?: (pid: number) => ProductionAdminProcessIdentityProbe;
  testOnlyStep?: (step: string) => void;
}>): Promise<T> {
  let directory: string | undefined;
  let lockPath: string | undefined;
  let temporaryPath: string | undefined;
  let descriptor: number | undefined;
  let body: Buffer | undefined;
  let opened: Readonly<{ dev: number; ino: number }> | undefined;
  let lockIdentity: GreaterRealmCutoverJournalLockIdentity | undefined;
  let lockClaimed = false;
  let retainedForRecovery = false;
  let operationResult: T | undefined;
  let operationError: unknown;
  let cleanupError: unknown;
  let interruptedBy: NodeJS.Signals | undefined;
  const onSigint = () => { interruptedBy ??= 'SIGINT'; };
  const onSigterm = () => { interruptedBy ??= 'SIGTERM'; };
  const control: GreaterRealmCutoverOperatorLockControl = Object.freeze({
    get lockIdentity(): GreaterRealmCutoverJournalLockIdentity {
      if (lockIdentity === undefined || !lockClaimed) {
        fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_NOT_HELD');
      }
      return lockIdentity;
    },
    assertCanStartWrite: (): void => {
      if (interruptedBy !== undefined) {
        throw new GreaterRealmCutoverWriteNotStartedError(
          `GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_${interruptedBy}`,
        );
      }
      if (!lockClaimed) {
        throw new GreaterRealmCutoverWriteNotStartedError(
          'GREATER_REALM_CUTOVER_OPERATOR_LOCK_NOT_HELD',
        );
      }
    },
    retainLockForRecovery: (): void => {
      if (!lockClaimed || retainedForRecovery) {
        fail('GREATER_REALM_CUTOVER_OPERATOR_RECOVERY_RETENTION_INVALID');
      }
      retainedForRecovery = true;
    },
    releaseLockRecoveryRetention: (): void => {
      if (!lockClaimed || !retainedForRecovery) {
        fail('GREATER_REALM_CUTOVER_OPERATOR_RECOVERY_RETENTION_INVALID');
      }
      retainedForRecovery = false;
    },
  });
  // Containment begins before path validation or allocation. A signal during
  // any setup boundary is recorded, while exact cleanup remains awaited.
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  try {
    input.testOnlyStep?.('before-directory');
    directory = privateDirectory(input.directory, input.repositoryRoot);
    input.testOnlyStep?.('after-directory');
    lockPath = join(directory, OPERATOR_LOCK_FILE);
    const record = operatorLockRecord({
      now: (input.now ?? Date.now)(),
      processStartIdentity: requireCurrentProductionAdminProcessIdentity(
        input.processIdentityProbe,
      ),
    });
    input.testOnlyStep?.('after-record');
    body = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const processStartDigest = createHash('sha256')
      .update(record.processStartIdentity, 'utf8')
      .digest('hex');
    temporaryPath = join(
      directory,
      `.greater-realm-cutover-${record.lockId}-${record.pid}-${processStartDigest}.lock.tmp`,
    );
    descriptor = openSync(
      temporaryPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const created = fstatSync(descriptor);
    opened = Object.freeze({ dev: created.dev, ino: created.ino });
    input.testOnlyStep?.('after-temp-open');
    let offset = 0;
    let partialWriteStepReported = false;
    while (offset < body.byteLength) {
      const remaining = body.byteLength - offset;
      const written = writeSync(
        descriptor,
        body,
        offset,
        Math.min(
          remaining,
          partialWriteStepReported ? remaining : Math.max(1, Math.floor(body.byteLength / 2)),
        ),
      );
      if (written <= 0) fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_FAILED');
      offset += written;
      if (!partialWriteStepReported) {
        partialWriteStepReported = true;
        input.testOnlyStep?.('after-partial-lock-write-before-fsync');
      }
    }
    input.testOnlyStep?.('after-write');
    fsyncSync(descriptor);
    input.testOnlyStep?.('after-fsync');
    chmodSync(temporaryPath, FILE_MODE);
    input.testOnlyStep?.('after-chmod');
    const status = fstatSync(descriptor);
    if (
      status.dev !== opened.dev || status.ino !== opened.ino
      || status.nlink !== 1 || status.size !== body.byteLength
      || (status.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && status.uid !== process.getuid())
    ) {
      fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_FAILED');
    }
    try {
      linkSync(temporaryPath, lockPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        fail('GREATER_REALM_CUTOVER_OPERATOR_ALREADY_RUNNING');
      }
      throw error;
    }
    lockClaimed = true;
    lockIdentity = Object.freeze({
      lockId: record.lockId,
      pid: record.pid,
      processStartIdentity: record.processStartIdentity,
      createdAtMs: record.createdAtMs,
      expiresAtMs: record.expiresAtMs,
      dev: opened.dev,
      ino: opened.ino,
    });
    input.testOnlyStep?.('after-link');
    fsyncPrivateDirectory(directory);
    input.testOnlyStep?.('after-directory-fsync');
    completeLinkedPublication({
      directory,
      temporary: temporaryPath,
      destination: lockPath,
      identity: opened,
      body,
      maximumBytes: OPERATOR_LOCK_MAX_BYTES,
      failureCode: 'GREATER_REALM_CUTOVER_OPERATOR_LOCK_FAILED',
    });
    temporaryPath = undefined;
    input.testOnlyStep?.('after-temp-unlink');
    input.testOnlyStep?.('before-operation');
    if (interruptedBy === undefined) {
      try {
        operationResult = await input.operation(control);
      } catch (error) {
        operationError = error;
      }
    }
  } catch (error) {
    operationError = error;
  } finally {
    try {
      if (descriptor !== undefined) {
        closeSync(descriptor);
        descriptor = undefined;
      }
      if (temporaryPath !== undefined && opened !== undefined) {
        unlinkExactOperatorLock(temporaryPath, opened);
        temporaryPath = undefined;
        if (directory !== undefined) fsyncPrivateDirectory(directory);
      }
      if (lockClaimed && !retainedForRecovery) {
        if (lockPath === undefined || opened === undefined || directory === undefined) {
          fail('GREATER_REALM_CUTOVER_OPERATOR_LOCK_CLEANUP_FAILED');
        }
        unlinkExactOperatorLock(lockPath, opened);
        fsyncPrivateDirectory(directory);
        lockClaimed = false;
      }
    } catch (error) {
      cleanupError = error;
    } finally {
      process.off('SIGINT', onSigint);
      process.off('SIGTERM', onSigterm);
      body?.fill(0);
    }
  }
  const interruptionCode = interruptedBy === undefined
    ? undefined
    : `GREATER_REALM_CUTOVER_OPERATOR_INTERRUPTED_${interruptedBy}`;
  const operationAlreadySurfacedInterruption = interruptionCode !== undefined
    && isGreaterRealmCutoverWriteNotStartedError(operationError)
    && operationError.code === interruptionCode;
  const interruption = interruptionCode === undefined || operationAlreadySurfacedInterruption
    ? undefined
    : new GreaterRealmCutoverReceiptError(interruptionCode);
  const retainedJournal = retainedForRecovery && operationError === undefined
    ? new GreaterRealmCutoverReceiptError(
        'GREATER_REALM_CUTOVER_OPERATOR_JOURNAL_RETAINED_FOR_RECOVERY',
      )
    : undefined;
  const errors = [operationError, cleanupError, interruption, retainedJournal]
    .filter((error): error is unknown => error !== undefined);
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) {
    throw new AggregateError(errors, 'GREATER_REALM_CUTOVER_OPERATOR_MULTIPLE_FAILURES');
  }
  return operationResult as T;
}

/** No-clobber, owner-only receipt write outside the repository. */
export function writePrivateGreaterRealmCutoverReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  kind: GreaterRealmCutoverReceiptKind;
  record: Readonly<Record<string, unknown>>;
  now?: Date;
}>): GreaterRealmPrivateReceiptWriteResult {
  if (!GREATER_REALM_CUTOVER_RECEIPT_KINDS.includes(input.kind)) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_KIND_INVALID');
  }
  const recordedAt = (input.now ?? new Date()).toISOString();
  if (new Date(recordedAt).toISOString() !== recordedAt) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_TIME_INVALID');
  }
  const body = Buffer.from(`${JSON.stringify(jsonSafe({
    schemaVersion: 1,
    kind: input.kind,
    recordedAt,
    target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
    record: input.record,
  }), null, 2)}\n`, 'utf8');
  if (body.byteLength < 1 || body.byteLength > MAX_RECEIPT_BYTES) {
    fail('GREATER_REALM_CUTOVER_RECEIPT_SIZE_INVALID');
  }
  const receiptDigest = createHash('sha256').update(body).digest('hex');
  const directory = privateDirectory(input.directory, input.repositoryRoot);
  const basename = `greater-realm-${receiptPrefix(input.kind)}-${receiptDigest}.json`;
  const destination = join(directory, basename);
  if (existsSync(destination)) {
    readExact(destination, body);
    return Object.freeze({
      path: destination,
      receiptDigest,
      recordedAt,
      result: 'unchanged',
    });
  }
  const temporary = join(
    directory,
    `.${basename.slice(0, -5)}-${randomUUID().replaceAll('-', '').slice(0, 12)}.json.tmp`,
  );
  let descriptor: number | undefined;
  let opened: LinkedPublicationIdentity | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    const initial = fstatSync(descriptor);
    opened = Object.freeze({ dev: initial.dev, ino: initial.ino });
    let offset = 0;
    while (offset < body.byteLength) {
      const written = writeSync(descriptor, body, offset, body.byteLength - offset);
      if (written <= 0) fail('GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    const ready = fstatSync(descriptor);
    if (
      ready.dev !== opened.dev || ready.ino !== opened.ino
      || ready.nlink !== 1 || ready.size !== body.byteLength
      || (ready.mode & 0o7777) !== FILE_MODE
      || (process.getuid !== undefined && ready.uid !== process.getuid())
    ) fail('GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    fsyncPrivateDirectory(directory);
    completeLinkedPublication({
      directory,
      temporary,
      destination,
      identity: opened,
      body,
      maximumBytes: MAX_RECEIPT_BYTES,
      failureCode: 'GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED',
    });
    readExact(destination, body);
    return Object.freeze({
      path: destination,
      receiptDigest,
      recordedAt,
      result: 'installed',
    });
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the fixed error. */ }
    }
    if (opened !== undefined) {
      try {
        const temporaryStatus = lstatSync(temporary);
        if (
          temporaryStatus.dev === opened.dev && temporaryStatus.ino === opened.ino
          && (temporaryStatus.nlink === 1 || temporaryStatus.nlink === 2)
        ) unlinkSync(temporary);
      } catch { /* Preserve the fixed error. */ }
    }
    if (error instanceof GreaterRealmCutoverReceiptError) throw error;
    fail('GREATER_REALM_CUTOVER_RECEIPT_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
}
