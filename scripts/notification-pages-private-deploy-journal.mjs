import { createHash, randomBytes } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  ensureCanonicalProductionAdminStateDirectory,
  probeProductionAdminProcessIdentity,
  productionAdminRecordedOwnerIsDead,
  requireCurrentProductionAdminProcessIdentity,
} from './production-admin-token-budget.mjs';

export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE =
  'warpkeep-notification-pages-private-deploy-journal-v1';
export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_STATE_CHILD =
  'notification-pages-private-deploy-journal-v1';
export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE =
  'warpkeep-notification-pages-deploy-skipped-adjudication-v1';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_DIRECTORY_ENTRIES = 1_024;
// The receipt chain supports generations 0..255. One compact terminal per
// completed generation plus one bounded active history and all recognized
// repair temporaries stays well below the hard directory bound:
// 512 + 128 + 64 + 32 + 1 = 737 entries.
const MAX_TERMINAL_OPERATIONS = 512;
const MAX_ACTIVE_RECORDS = 128;
const SHA256 = /^[0-9a-f]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PHASES = Object.freeze([
  'prepared',
  'reconciled-exact-current',
  'reconciled-not-current',
  'candidate-authorized',
  'deploy-invoked',
  'postflight-not-current',
  'postflight-completed',
]);
const RECORD_FILE = /^notification-pages-private-deploy-([0-9a-f]{64})-([0-9]{8})-([a-z-]+)\.json$/u;
const TEMPORARY_FILE = /^\.notification-pages-private-deploy-([0-9a-f]{64})-([0-9]{8})-([a-z-]+)-([0-9a-f]{24})\.json\.tmp$/u;
const TERMINAL_FILE = /^notification-pages-private-deploy-([0-9a-f]{64})-terminal\.json$/u;
const TERMINAL_TEMPORARY_FILE = /^\.notification-pages-private-deploy-([0-9a-f]{64})-terminal-([0-9a-f]{24})\.json\.tmp$/u;
const ABANDONMENT_FILE = /^notification-pages-private-deploy-([0-9a-f]{64})-abandonment-([0-9]{8})\.json$/u;
const ABANDONMENT_TEMPORARY_FILE = /^\.notification-pages-private-deploy-([0-9a-f]{64})-abandonment-([0-9]{8})-([0-9a-f]{24})\.json\.tmp$/u;
const LOCK_FILE = '.notification-pages-private-deploy.lock';
const LOCK_TEMPORARY_FILE = /^\.notification-pages-private-deploy-lock-([1-9][0-9]{0,19})-([0-9a-f]{16})-([0-9a-f]{24})\.tmp$/u;
const RECORD_KEYS = Object.freeze([
  'contractDigest',
  'operationId',
  'payload',
  'phase',
  'previousRecordDigest',
  'profile',
  'recordedAt',
  'runAttempt',
  'runId',
  'schemaVersion',
  'sequence',
]);
const TERMINAL_KEYS = Object.freeze([
  'candidateAuthorityDigest',
  'completedAt',
  'contractDigest',
  'deploymentInvoked',
  'finalRecordDigest',
  'finalSequence',
  'operationId',
  'profile',
  'receiptDigest',
  'receiptResult',
  'runAttempt',
  'runId',
  'schemaVersion',
]);
const ABANDONMENT_KEYS = Object.freeze([
  'adjudicationDigest',
  'candidatePagesSourceCommit',
  'checkpointSequence',
  'contractDigest',
  'deployRecordDigest',
  'deploySequence',
  'operationId',
  'profile',
  'reason',
  'retiredAt',
  'retiredRecordDigest',
  'retiredSequence',
  'runAttempt',
  'runId',
  'schemaVersion',
]);

export class NotificationPagesPrivateDeployJournalError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'NotificationPagesPrivateDeployJournalError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new NotificationPagesPrivateDeployJournalError(
    code,
    deploymentMayHaveChanged,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalValue(value, depth = 0) {
  if (depth > 32) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_VALUE_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_VALUE_INVALID');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => canonicalValue(item, depth + 1));
  }
  if (!isRecord(value)) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_VALUE_INVALID');
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (
      key.length < 1
      || key.length > 128
      || key === '__proto__'
      || key === 'constructor'
      || key === 'prototype'
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_VALUE_INVALID');
    output[key] = canonicalValue(value[key], depth + 1);
  }
  return output;
}

function canonicalBytes(value) {
  const bytes = Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_FILE_BYTES) {
    bytes.fill(0);
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_VALUE_INVALID');
  }
  return bytes;
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestValue(value) {
  const bytes = canonicalBytes(value);
  try {
    return digestBytes(bytes);
  } finally {
    bytes.fill(0);
  }
}

function randomId(randomBytesImpl) {
  const bytes = randomBytesImpl(12);
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== 12) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_RANDOM_INVALID');
  }
  return bytes.toString('hex');
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(directory, constants.O_RDONLY);
    fsyncSync(descriptor);
  } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FSYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function ensureDirectory({ repositoryRoot, reportedHome }) {
  if (!isAbsolute(repositoryRoot ?? '') || resolve(repositoryRoot) !== repositoryRoot) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_REPOSITORY_INVALID');
  }
  let repository;
  try {
    repository = realpathSync(repositoryRoot);
    if (repository !== repositoryRoot || lstatSync(repositoryRoot).isSymbolicLink()) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_REPOSITORY_INVALID');
    }
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployJournalError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_REPOSITORY_INVALID');
  }
  const parent = ensureCanonicalProductionAdminStateDirectory(reportedHome);
  const requested = join(parent, NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_STATE_CHILD);
  if (!existsSync(requested)) {
    try {
      mkdirSync(requested, { mode: DIRECTORY_MODE });
      chmodSync(requested, DIRECTORY_MODE);
      fsyncDirectory(requested);
      fsyncDirectory(parent);
    } catch {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_CREATE_FAILED');
    }
  }
  try {
    let status = lstatSync(requested);
    const uid = process.getuid?.();
    const mode = status.mode & 0o7777;
    if (
      status.isDirectory()
      && !status.isSymbolicLink()
      && (uid === undefined || status.uid === uid)
      && (mode & ~DIRECTORY_MODE) === 0
      && mode !== DIRECTORY_MODE
    ) {
      chmodSync(requested, DIRECTORY_MODE);
      fsyncDirectory(requested);
      fsyncDirectory(parent);
      status = lstatSync(requested);
    }
    const directory = realpathSync(requested);
    if (
      directory !== requested
      || dirname(directory) !== parent
      || !status.isDirectory()
      || status.isSymbolicLink()
      || (uid !== undefined && status.uid !== uid)
      || (status.mode & 0o7777) !== DIRECTORY_MODE
      || inside(repository, directory)
      || inside(directory, repository)
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    return Object.freeze({ directory, uid });
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployJournalError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
}

function assertFile(status, uid, links = 1) {
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || (uid !== undefined && status.uid !== uid)
    || (status.mode & 0o7777) !== FILE_MODE
    || status.nlink !== links
    || status.size < 2
    || status.size > MAX_FILE_BYTES
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_INVALID');
}

function readStable(path, uid, links = 1) {
  let descriptor;
  try {
    const named = lstatSync(path);
    assertFile(named, uid, links);
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    assertFile(before, uid, links);
    if (before.dev !== named.dev || before.ino !== named.ino) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs
      || bytes.byteLength !== before.size
      || bytes.at(-1) !== 0x0a
    ) {
      bytes.fill(0);
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
    }
    return Object.freeze({ bytes, identity: Object.freeze({
      dev: before.dev,
      ino: before.ino,
      nlink: links,
      mode: FILE_MODE,
    }) });
  } catch (error) {
    if (error instanceof NotificationPagesPrivateDeployJournalError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function unlinkExact(path, identity, uid) {
  let status;
  try { status = lstatSync(path); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  }
  assertFile(status, uid, identity.nlink);
  if (status.dev !== identity.dev || status.ino !== identity.ino) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  }
  try { unlinkSync(path); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  }
}

function unlinkTemporaryExact(path, identity, uid) {
  let status;
  try { status = lstatSync(path); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  }
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || (uid !== undefined && status.uid !== uid)
    || status.nlink !== identity.nlink
    || (status.mode & 0o7777) !== identity.mode
    || status.dev !== identity.dev
    || status.ino !== identity.ino
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  try { unlinkSync(path); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_REPLACED');
  }
}

function publish({ directory, name, temporaryName, value, uid }) {
  const destination = join(directory, name);
  const temporary = join(directory, temporaryName);
  const bytes = canonicalBytes(value);
  let descriptor;
  let identity;
  let linked = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    fchmodSync(descriptor, FILE_MODE);
    const opened = fstatSync(descriptor);
    if (
      !opened.isFile()
      || (uid !== undefined && opened.uid !== uid)
      || (opened.mode & 0o7777) !== FILE_MODE
      || opened.nlink !== 1
      || opened.size !== 0
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_WRITE_FAILED');
    identity = Object.freeze({ dev: opened.dev, ino: opened.ino, nlink: 1, mode: FILE_MODE });
    let offset = 0;
    while (offset < bytes.byteLength) {
      const written = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      if (written <= 0) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_WRITE_FAILED');
      offset += written;
    }
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      written.dev !== identity.dev
      || written.ino !== identity.ino
      || written.size !== bytes.byteLength
      || written.nlink !== 1
      || (written.mode & 0o7777) !== FILE_MODE
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    try {
      linkSync(temporary, destination);
      linked = true;
      fsyncDirectory(directory);
      unlinkExact(temporary, { ...identity, nlink: 2 }, uid);
      identity = undefined;
      fsyncDirectory(directory);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readStable(destination, uid);
      try {
        if (!existing.bytes.equals(bytes)) {
          fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ALREADY_EXISTS');
        }
      } finally {
        existing.bytes.fill(0);
      }
      unlinkExact(temporary, identity, uid);
      identity = undefined;
      fsyncDirectory(directory);
    }
    const installed = readStable(destination, uid);
    try {
      if (!installed.bytes.equals(bytes)) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_WRITE_FAILED');
      }
    } finally {
      installed.bytes.fill(0);
    }
    return digestBytes(bytes);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve primary error. */ }
    }
    if (!linked && identity !== undefined) {
      try { unlinkExact(temporary, identity, uid); } catch { /* Preserve primary error. */ }
    }
    if (error instanceof NotificationPagesPrivateDeployJournalError) throw error;
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_WRITE_FAILED');
  } finally {
    bytes.fill(0);
  }
}

function parseCanonical(bytes) {
  let value;
  try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_INVALID');
  }
  const expected = canonicalBytes(value);
  try {
    if (!expected.equals(bytes)) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_FILE_NOT_CANONICAL');
    }
  } finally {
    expected.fill(0);
  }
  return value;
}

function validatePayload(phase, payload) {
  const value = canonicalValue(payload);
  if (!isRecord(value)) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'candidate-authorized'
    && (Object.keys(value).join(',') !== 'candidateAuthorityDigest'
      || !SHA256.test(value.candidateAuthorityDigest))
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'postflight-completed'
    && (Object.keys(value).join(',') !== 'receiptDigest,receiptResult'
      || !SHA256.test(value.receiptDigest)
      || !['installed', 'unchanged'].includes(value.receiptResult))
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    ['reconciled-exact-current', 'reconciled-not-current', 'postflight-not-current']
      .includes(phase)
    && (Object.keys(value).join(',') !== 'mode'
      || !['gen0', 'durable'].includes(value.mode))
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'deploy-invoked'
    && (Object.keys(value).join(',')
      !== 'candidateAuthorityDigest,candidatePagesSourceCommit'
      || (value.candidateAuthorityDigest !== null
        && !SHA256.test(value.candidateAuthorityDigest))
      || !/^[0-9a-f]{40}$/u.test(value.candidatePagesSourceCommit))
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (phase === 'prepared' && Object.keys(value).join(',') !== 'handoff') {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  }
  return Object.freeze(value);
}

function parseRecord(name, bytes) {
  const match = RECORD_FILE.exec(name);
  const value = parseCanonical(bytes);
  if (
    match === null
    || !isRecord(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(RECORD_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE
    || value.operationId !== match[1]
    || value.sequence !== Number(match[2])
    || value.phase !== match[3]
    || !PHASES.includes(value.phase)
    || !SHA256.test(value.contractDigest)
    || (value.previousRecordDigest !== null && !SHA256.test(value.previousRecordDigest))
    || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt)
    || value.runAttempt < 1
    || value.runAttempt > 1_000
    || !STRICT_UTC.test(value.recordedAt)
    || new Date(value.recordedAt).toISOString() !== value.recordedAt
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_RECORD_INVALID');
  value.payload = validatePayload(value.phase, value.payload);
  return Object.freeze({
    value: Object.freeze(value),
    digest: digestBytes(bytes),
    name,
  });
}

function parseTerminal(name, bytes) {
  const match = TERMINAL_FILE.exec(name);
  const value = parseCanonical(bytes);
  if (
    match === null
    || !isRecord(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(TERMINAL_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE
    || value.operationId !== match[1]
    || !SHA256.test(value.contractDigest)
    || createHash('sha256')
      .update(
        `${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n`
          + `${value.contractDigest}\n`,
      )
      .digest('hex') !== value.operationId
    || (value.candidateAuthorityDigest !== null
      && !SHA256.test(value.candidateAuthorityDigest))
    || typeof value.deploymentInvoked !== 'boolean'
    || !SHA256.test(value.finalRecordDigest)
    || !Number.isSafeInteger(value.finalSequence)
    || value.finalSequence < 3
    || value.finalSequence > 99_999_999
    || !SHA256.test(value.receiptDigest)
    || !['installed', 'unchanged'].includes(value.receiptResult)
    || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt)
    || value.runAttempt < 1
    || value.runAttempt > 1_000
    || !STRICT_UTC.test(value.completedAt)
    || new Date(value.completedAt).toISOString() !== value.completedAt
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_TERMINAL_INVALID');
  return Object.freeze({
    value: Object.freeze(value),
    digest: digestBytes(bytes),
    name,
  });
}

function parseAbandonment(name, bytes) {
  const match = ABANDONMENT_FILE.exec(name);
  const value = parseCanonical(bytes);
  if (
    match === null
    || !isRecord(value)
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(ABANDONMENT_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE
    || value.operationId !== match[1]
    || value.checkpointSequence !== Number(match[2])
    || !SHA256.test(value.contractDigest)
    || createHash('sha256')
      .update(
        `${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n`
          + `${value.contractDigest}\n`,
      )
      .digest('hex') !== value.operationId
    || !SHA256.test(value.adjudicationDigest)
    || !/^[0-9a-f]{40}$/u.test(value.candidatePagesSourceCommit)
    || !SHA256.test(value.deployRecordDigest)
    || !Number.isSafeInteger(value.deploySequence)
    || value.deploySequence < 1
    || value.deploySequence > 99_999_999
    || !Number.isSafeInteger(value.retiredSequence)
    || value.retiredSequence < value.deploySequence
    || value.retiredSequence > 99_999_998
    || value.checkpointSequence !== value.retiredSequence + 1
    || !SHA256.test(value.retiredRecordDigest)
    || value.reason !== 'github-actions-deploy-step-skipped'
    || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt)
    || value.runAttempt < 1
    || value.runAttempt > 1_000
    || !STRICT_UTC.test(value.retiredAt)
    || new Date(value.retiredAt).toISOString() !== value.retiredAt
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
  return Object.freeze({
    value: Object.freeze(value),
    digest: digestBytes(bytes),
    name,
  });
}

function repairTemporaries(directory, uid) {
  const names = readdirSync(directory).filter(name => TEMPORARY_FILE.test(name));
  if (names.length > 64) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  for (const name of names.sort()) {
    const match = TEMPORARY_FILE.exec(name);
    const temporaryPath = join(directory, name);
    const temporary = lstatSync(temporaryPath);
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || ![1, 2].includes(temporary.nlink)
      || (temporary.nlink === 1
        ? ((temporary.mode & 0o7777) & ~FILE_MODE) !== 0
        : (temporary.mode & 0o7777) !== FILE_MODE)
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const destination = join(directory, `notification-pages-private-deploy-${match[1]}-${match[2]}-${match[3]}.json`);
    let final;
    try { final = lstatSync(destination); } catch (error) {
      if (error?.code !== 'ENOENT') fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    if (
      final !== undefined
      && final.dev === temporary.dev
      && final.ino === temporary.ino
    ) {
      if (temporary.nlink !== 2 || final.nlink !== 2) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      const opened = readStable(destination, uid, 2);
      try { parseRecord(destination.split('/').at(-1), opened.bytes); } finally { opened.bytes.fill(0); }
      unlinkExact(temporaryPath, {
        dev: temporary.dev, ino: temporary.ino, nlink: 2, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else if (temporary.nlink === 1) {
      if ((temporary.mode & 0o7777) !== FILE_MODE) {
        chmodSync(temporaryPath, FILE_MODE);
      }
      unlinkTemporaryExact(temporaryPath, {
        dev: temporary.dev, ino: temporary.ino, nlink: 1, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
}

function repairTerminalTemporaries(directory, uid) {
  const names = readdirSync(directory)
    .filter(name => TERMINAL_TEMPORARY_FILE.test(name));
  if (names.length > 64) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  for (const name of names.sort()) {
    const match = TERMINAL_TEMPORARY_FILE.exec(name);
    if (match === null) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    const temporaryPath = join(directory, name);
    const temporary = lstatSync(temporaryPath);
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || ![1, 2].includes(temporary.nlink)
      || (temporary.nlink === 1
        ? ((temporary.mode & 0o7777) & ~FILE_MODE) !== 0
        : (temporary.mode & 0o7777) !== FILE_MODE)
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const destination = join(
      directory,
      `notification-pages-private-deploy-${match[1]}-terminal.json`,
    );
    let final;
    try { final = lstatSync(destination); } catch (error) {
      if (error?.code !== 'ENOENT') {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
    }
    if (
      final !== undefined
      && final.dev === temporary.dev
      && final.ino === temporary.ino
    ) {
      if (temporary.nlink !== 2 || final.nlink !== 2) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      const opened = readStable(destination, uid, 2);
      try { parseTerminal(destination.split('/').at(-1), opened.bytes); } finally {
        opened.bytes.fill(0);
      }
      unlinkExact(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        nlink: 2,
        mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else if (temporary.nlink === 1) {
      if ((temporary.mode & 0o7777) !== FILE_MODE) {
        chmodSync(temporaryPath, FILE_MODE);
      }
      unlinkTemporaryExact(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        nlink: 1,
        mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
}

function repairAbandonmentTemporaries(directory, uid) {
  const names = readdirSync(directory)
    .filter(name => ABANDONMENT_TEMPORARY_FILE.test(name));
  if (names.length > 64) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  for (const name of names.sort()) {
    const match = ABANDONMENT_TEMPORARY_FILE.exec(name);
    if (match === null) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    const temporaryPath = join(directory, name);
    const temporary = lstatSync(temporaryPath);
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || ![1, 2].includes(temporary.nlink)
      || (temporary.nlink === 1
        ? ((temporary.mode & 0o7777) & ~FILE_MODE) !== 0
        : (temporary.mode & 0o7777) !== FILE_MODE)
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const destination = join(
      directory,
      `notification-pages-private-deploy-${match[1]}`
        + `-abandonment-${match[2]}.json`,
    );
    let final;
    try { final = lstatSync(destination); } catch (error) {
      if (error?.code !== 'ENOENT') {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
    }
    if (
      final !== undefined
      && final.dev === temporary.dev
      && final.ino === temporary.ino
    ) {
      if (temporary.nlink !== 2 || final.nlink !== 2) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      const opened = readStable(destination, uid, 2);
      try { parseAbandonment(destination.split('/').at(-1), opened.bytes); } finally {
        opened.bytes.fill(0);
      }
      unlinkExact(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        nlink: 2,
        mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else if (temporary.nlink === 1) {
      if ((temporary.mode & 0o7777) !== FILE_MODE) {
        chmodSync(temporaryPath, FILE_MODE);
      }
      unlinkTemporaryExact(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        nlink: 1,
        mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
}

function processIdentityDigest(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex').slice(0, 16);
}

function repairLockTemporaries(directory, uid, processIdentityProbe) {
  const names = readdirSync(directory).filter(name => LOCK_TEMPORARY_FILE.test(name));
  if (names.length > 32) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  let final;
  try { final = lstatSync(join(directory, LOCK_FILE)); } catch (error) {
    if (error?.code !== 'ENOENT') fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  let paired = false;
  for (const name of names.sort()) {
    const match = LOCK_TEMPORARY_FILE.exec(name);
    if (match === null) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const path = join(directory, name);
    const temporary = lstatSync(path);
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || (temporary.nlink === 1
        ? ((temporary.mode & 0o7777) & ~FILE_MODE) !== 0
        : (temporary.mode & 0o7777) !== FILE_MODE)
      || ![1, 2].includes(temporary.nlink)
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const linked = final !== undefined
      && final.dev === temporary.dev
      && final.ino === temporary.ino;
    if (linked) {
      if (paired || temporary.nlink !== 2 || final.nlink !== 2) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      const lock = readStable(join(directory, LOCK_FILE), uid, 2);
      lock.bytes.fill(0);
      unlinkExact(path, {
        dev: temporary.dev, ino: temporary.ino, nlink: 2, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
      final = lstatSync(join(directory, LOCK_FILE));
      paired = true;
    } else if (temporary.nlink === 1) {
      const pid = Number(match[1]);
      const observed = processIdentityProbe(pid);
      if (
        observed?.state === 'present'
        && typeof observed.identity === 'string'
        && processIdentityDigest(observed.identity) === match[2]
      ) continue;
      if (observed?.state === 'ambiguous') {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_LOCK_AMBIGUOUS');
      }
      if ((temporary.mode & 0o7777) !== FILE_MODE) chmodSync(path, FILE_MODE);
      unlinkTemporaryExact(path, {
        dev: temporary.dev, ino: temporary.ino, nlink: 1, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  if (final !== undefined) assertFile(final, uid);
}

function loadJournalState(directory, uid) {
  const names = readdirSync(directory).sort();
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  const histories = new Map();
  const terminals = new Map();
  const abandonmentVersions = new Map();
  for (const name of names) {
    if (name === LOCK_FILE) continue;
    if (LOCK_TEMPORARY_FILE.test(name)) {
      const status = lstatSync(join(directory, name));
      if (
        !status.isFile()
        || status.isSymbolicLink()
        || (uid !== undefined && status.uid !== uid)
        || status.nlink !== 1
        || ((status.mode & 0o7777) & ~FILE_MODE) !== 0
        || status.size > MAX_FILE_BYTES
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      continue;
    }
    if (
      TEMPORARY_FILE.test(name)
      || TERMINAL_TEMPORARY_FILE.test(name)
      || ABANDONMENT_TEMPORARY_FILE.test(name)
    ) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    if (TERMINAL_FILE.test(name)) {
      const opened = readStable(join(directory, name), uid);
      let terminal;
      try { terminal = parseTerminal(name, opened.bytes); } finally {
        opened.bytes.fill(0);
      }
      if (terminals.has(terminal.value.operationId)) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_TERMINAL_INVALID');
      }
      terminals.set(terminal.value.operationId, Object.freeze({
        ...terminal,
        identity: opened.identity,
      }));
      continue;
    }
    if (ABANDONMENT_FILE.test(name)) {
      const opened = readStable(join(directory, name), uid);
      let abandonment;
      try { abandonment = parseAbandonment(name, opened.bytes); } finally {
        opened.bytes.fill(0);
      }
      const versions = abandonmentVersions.get(abandonment.value.operationId) ?? [];
      versions.push(Object.freeze({
        ...abandonment,
        identity: opened.identity,
      }));
      abandonmentVersions.set(abandonment.value.operationId, versions);
      continue;
    }
    if (!RECORD_FILE.test(name)) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    const opened = readStable(join(directory, name), uid);
    let record;
    try { record = parseRecord(name, opened.bytes); } finally { opened.bytes.fill(0); }
    record = Object.freeze({ ...record, identity: opened.identity });
    const records = histories.get(record.value.operationId) ?? [];
    records.push(record);
    histories.set(record.value.operationId, records);
  }
  const abandonments = new Map();
  const obsoleteAbandonments = [];
  for (const [operationId, versions] of abandonmentVersions) {
    versions.sort(
      (left, right) => left.value.checkpointSequence
        - right.value.checkpointSequence,
    );
    if (versions.length > 2) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
    }
    const latest = versions.at(-1);
    for (const prior of versions.slice(0, -1)) {
      if (
        prior.value.contractDigest !== latest.value.contractDigest
        || prior.value.checkpointSequence >= latest.value.checkpointSequence
        || prior.value.candidatePagesSourceCommit
          !== latest.value.candidatePagesSourceCommit
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
      obsoleteAbandonments.push(prior);
    }
    abandonments.set(operationId, latest);
  }
  if (terminals.size + abandonments.size > MAX_TERMINAL_OPERATIONS) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED');
  }
  let activeRecordCount = 0;
  const compactedRecords = [];
  for (const [operationId, allRecords] of histories) {
    allRecords.sort((left, right) => left.value.sequence - right.value.sequence);
    const abandonment = abandonments.get(operationId);
    const terminal = terminals.get(operationId);
    if (terminal !== undefined) {
      if (
        abandonment !== undefined
        && (abandonment.value.contractDigest !== terminal.value.contractDigest
          || abandonment.value.checkpointSequence >= terminal.value.finalSequence)
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
      for (const record of allRecords) {
        if (
          record.value.contractDigest !== terminal.value.contractDigest
          || record.value.sequence > terminal.value.finalSequence
          || (record.value.sequence === terminal.value.finalSequence
            && (record.digest !== terminal.value.finalRecordDigest
              || record.value.phase !== 'postflight-completed'
              || record.value.payload.receiptDigest !== terminal.value.receiptDigest
              || record.value.payload.receiptResult !== terminal.value.receiptResult))
        ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
        compactedRecords.push(record);
      }
      continue;
    }
    let records = allRecords;
    if (abandonment !== undefined) {
      if (allRecords.some(
        record => record.value.contractDigest !== abandonment.value.contractDigest,
      )) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
      const retired = allRecords.filter(
        record => record.value.sequence < abandonment.value.checkpointSequence,
      );
      const exactRetired = retired.find(
        record => record.value.sequence === abandonment.value.retiredSequence,
      );
      if (
        exactRetired !== undefined
        && exactRetired.digest !== abandonment.value.retiredRecordDigest
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
      compactedRecords.push(...retired);
      records = allRecords.filter(
        record => record.value.sequence > abandonment.value.checkpointSequence,
      );
      histories.set(operationId, records);
    }
    activeRecordCount += records.length;
    let previous = abandonment;
    for (const record of records) {
      if (
        record.value.sequence !== (
          previous?.value.checkpointSequence
          ?? previous?.value.sequence
          ?? 0
        ) + 1
        || record.value.previousRecordDigest !== (previous?.digest ?? null)
        || (previous !== undefined
          && record.value.contractDigest !== previous.value.contractDigest)
        || (previous !== undefined
          && Date.parse(record.value.recordedAt) < Date.parse(
            previous.value.retiredAt ?? previous.value.recordedAt,
          ))
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
      previous = record;
    }
    const first = records[0] ?? abandonment;
    const expectedOperationId = createHash('sha256')
      .update(`${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n${first.value.contractDigest}\n`)
      .digest('hex');
    if (first.value.operationId !== expectedOperationId) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
    }
  }
  if (activeRecordCount > MAX_ACTIVE_RECORDS) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED');
  }
  return Object.freeze({
    abandonments,
    compactedRecords: Object.freeze(compactedRecords),
    histories,
    obsoleteAbandonments: Object.freeze(obsoleteAbandonments),
    terminals,
  });
}

function pruneCompactedRecords(state, journalState) {
  let changed = false;
  for (const record of journalState.compactedRecords) {
    unlinkExact(join(state.directory, record.name), record.identity, state.uid);
    changed = true;
  }
  for (const abandonment of journalState.obsoleteAbandonments) {
    unlinkExact(
      join(state.directory, abandonment.name),
      abandonment.identity,
      state.uid,
    );
    changed = true;
  }
  for (const [operationId, abandonment] of journalState.abandonments) {
    if (!journalState.terminals.has(operationId)) continue;
    unlinkExact(
      join(state.directory, abandonment.name),
      abandonment.identity,
      state.uid,
    );
    changed = true;
  }
  if (changed) fsyncDirectory(state.directory);
}

function installCompletedTerminal(state, records, randomBytesImpl) {
  const final = records.at(-1);
  if (final?.value.phase !== 'postflight-completed') {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
  }
  validateHistory(records, final.value.contractDigest);
  const candidate = [...records].reverse().find(
    record => record.value.phase === 'candidate-authorized',
  );
  const terminal = Object.freeze(canonicalValue({
    candidateAuthorityDigest:
      candidate?.value.payload.candidateAuthorityDigest ?? null,
    completedAt: final.value.recordedAt,
    contractDigest: final.value.contractDigest,
    deploymentInvoked: records.some(
      record => record.value.phase === 'deploy-invoked',
    ),
    finalRecordDigest: final.digest,
    finalSequence: final.value.sequence,
    operationId: final.value.operationId,
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
    receiptDigest: final.value.payload.receiptDigest,
    receiptResult: final.value.payload.receiptResult,
    runAttempt: final.value.runAttempt,
    runId: final.value.runId,
    schemaVersion: 1,
  }));
  const name = `notification-pages-private-deploy-${final.value.operationId}-terminal.json`;
  publish({
    directory: state.directory,
    name,
    temporaryName:
      `.notification-pages-private-deploy-${final.value.operationId}`
        + `-terminal-${randomId(randomBytesImpl)}.json.tmp`,
    value: terminal,
    uid: state.uid,
  });
  // Re-read before unlinking any source record. The durable terminal is the
  // sole authority after the first unlink, and loadJournalState explicitly
  // validates every possible crash-left record against it.
  const installed = loadJournalState(state.directory, state.uid);
  const parsed = installed.terminals.get(final.value.operationId);
  if (
    parsed === undefined
    || parsed.value.finalRecordDigest !== final.digest
    || parsed.value.finalSequence !== final.value.sequence
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
  pruneCompactedRecords(state, installed);
}

function repairAndCompactCompletedHistories(state, randomBytesImpl) {
  let journalState = loadJournalState(state.directory, state.uid);
  pruneCompactedRecords(state, journalState);
  journalState = loadJournalState(state.directory, state.uid);
  for (const [operationId, records] of journalState.histories) {
    if (
      !journalState.terminals.has(operationId)
      && records.at(-1)?.value.phase === 'postflight-completed'
    ) {
      installCompletedTerminal(state, records, randomBytesImpl);
    }
  }
  // A final read proves that every completed operation has exactly one compact
  // terminal and no record remnants before ordinary state-machine use.
  journalState = loadJournalState(state.directory, state.uid);
  if ([...journalState.histories.values()].some(
    records => records.at(-1)?.value.phase === 'postflight-completed',
  )) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
  return journalState;
}

function lockValue(operationId, lockId, processStartIdentity) {
  return Object.freeze(canonicalValue({
    lockId,
    operationId,
    owner: { pid: process.pid, processStartIdentity },
    profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
    schemaVersion: 1,
  }));
}

function readLock(path, uid) {
  const opened = readStable(path, uid);
  try {
    const value = parseCanonical(opened.bytes);
    if (
      !isRecord(value)
      || Object.keys(value).join(',') !== 'lockId,operationId,owner,profile,schemaVersion'
      || value.schemaVersion !== 1
      || value.profile !== NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE
      || !/^[0-9a-f]{24}$/u.test(value.lockId)
      || !SHA256.test(value.operationId)
      || !isRecord(value.owner)
      || Object.keys(value.owner).join(',') !== 'pid,processStartIdentity'
      || !Number.isSafeInteger(value.owner.pid)
      || value.owner.pid < 1
      || typeof value.owner.processStartIdentity !== 'string'
      || value.owner.processStartIdentity.length < 8
      || value.owner.processStartIdentity.length > 128
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_LOCK_INVALID');
    return Object.freeze({ value: Object.freeze(value), identity: opened.identity });
  } finally {
    opened.bytes.fill(0);
  }
}

function acquireLock(state, operationId, randomBytesImpl, identity, probe) {
  repairLockTemporaries(state.directory, state.uid, probe);
  const path = join(state.directory, LOCK_FILE);
  if (existsSync(path)) {
    const current = readLock(path, state.uid);
    const dead = productionAdminRecordedOwnerIsDead({
      ...current.value.owner,
      probe,
    });
    if (dead !== true) {
      fail(dead === false
        ? 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_BUSY'
        : 'NOTIFICATION_PAGES_DEPLOY_JOURNAL_LOCK_AMBIGUOUS');
    }
    unlinkExact(path, current.identity, state.uid);
    fsyncDirectory(state.directory);
  }
  const lockId = randomId(randomBytesImpl);
  const value = lockValue(operationId, lockId, identity);
  const identityDigest = processIdentityDigest(identity);
  publish({
    directory: state.directory,
    name: LOCK_FILE,
    temporaryName:
      `.notification-pages-private-deploy-lock-${process.pid}-${identityDigest}-${lockId}.tmp`,
    value,
    uid: state.uid,
  });
  return Object.freeze({ path, value, identity: readLock(path, state.uid).identity });
}

function releaseLock(state, lock) {
  const current = readLock(lock.path, state.uid);
  if (
    current.identity.dev !== lock.identity.dev
    || current.identity.ino !== lock.identity.ino
    || digestValue(current.value) !== digestValue(lock.value)
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_LOCK_REPLACED');
  unlinkExact(lock.path, current.identity, state.uid);
  fsyncDirectory(state.directory);
}

function validateHistory(records, contractDigest) {
  if (records.some(record => record.value.contractDigest !== contractDigest)) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CONTRACT_MISMATCH');
  }
  const byRun = new Map();
  for (const record of records) {
    const key = `${record.value.runId}/${record.value.runAttempt}`;
    const phases = byRun.get(key) ?? [];
    phases.push(record.value.phase);
    byRun.set(key, phases);
  }
  for (const phases of byRun.values()) {
    if (
      phases[0] !== 'prepared'
      || phases.filter(value => value === 'prepared').length !== 1
    ) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
    }
    const reconciliations = phases.filter(value => value.startsWith('reconciled-'));
    if (reconciliations.length > 2) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
    }
    if (
      phases.includes('deploy-invoked')
      && !phases.includes('reconciled-not-current')
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
    if (
      phases.includes('postflight-completed')
      && !phases.includes('reconciled-exact-current')
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
  }
  if (records.filter(record => record.value.phase === 'deploy-invoked').length > 1) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
  }
}

function createJournal({
  state,
  operationId,
  contract,
  contractDigest,
  runId,
  runAttempt,
  clock,
  randomBytesImpl,
}) {
  const runKey = `${runId}/${runAttempt}`;
  const readOperation = () => {
    const journalState = loadJournalState(state.directory, state.uid);
    for (const [otherId, records] of journalState.histories) {
      if (
        otherId !== operationId
        && records.length !== 0
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_OTHER_OPERATION_UNFINISHED');
    }
    const terminal = journalState.terminals.get(operationId) ?? null;
    if (
      terminal !== null
      && terminal.value.contractDigest !== contractDigest
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CONTRACT_MISMATCH');
    const abandonment = journalState.abandonments.get(operationId) ?? null;
    if (
      abandonment !== null
      && abandonment.value.contractDigest !== contractDigest
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CONTRACT_MISMATCH');
    const records = journalState.histories.get(operationId) ?? [];
    validateHistory(records, contractDigest);
    return Object.freeze({ abandonment, records, terminal });
  };
  const append = (phase, payload, { effectBoundary = false } = {}) => {
    const validatedPayload = validatePayload(phase, payload);
    const operationState = readOperation();
    if (operationState.terminal !== null) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ALREADY_COMPLETED');
    }
    const { records } = operationState;
    if (records.length >= MAX_ACTIVE_RECORDS) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED');
    }
    const sameRun = records.filter(
      record => `${record.value.runId}/${record.value.runAttempt}` === runKey,
    );
    const existing = sameRun.find(record => record.value.phase === phase);
    if (existing !== undefined) {
      if (digestValue(existing.value.payload) !== digestValue(validatedPayload)) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PAYLOAD_MISMATCH');
      }
      if (effectBoundary) {
        fail('NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED', true);
      }
      return;
    }
    const completed = records.find(record => record.value.phase === 'postflight-completed');
    if (completed !== undefined) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ALREADY_COMPLETED');
    }
    const phases = sameRun.map(record => record.value.phase);
    const latest = phases.at(-1);
    if (
      (phase === 'prepared' && sameRun.length !== 0)
      || (phase !== 'prepared' && phases[0] !== 'prepared')
      || (phase.startsWith('reconciled-')
        && !['prepared', 'deploy-invoked', 'postflight-not-current'].includes(latest))
      || (phase === 'candidate-authorized'
        && latest !== 'reconciled-not-current')
      || (phase === 'deploy-invoked'
        && !['reconciled-not-current', 'candidate-authorized'].includes(latest))
      || (phase === 'postflight-not-current'
        && !['deploy-invoked', 'postflight-not-current'].includes(latest))
      || (phase === 'postflight-completed'
        && latest !== 'reconciled-exact-current')
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_TRANSITION_INVALID');
    if (
      phase === 'deploy-invoked'
      && records.some(record => record.value.phase === 'deploy-invoked')
    ) fail('NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED', true);
    const previous = records.at(-1) ?? operationState.abandonment ?? undefined;
    const sampled = clock();
    if (!(sampled instanceof Date) || Number.isNaN(sampled.getTime())) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CLOCK_INVALID');
    }
    const recordedAt = previous !== undefined
      && sampled.getTime() < Date.parse(
        previous.value.retiredAt ?? previous.value.recordedAt,
      )
      ? (previous.value.retiredAt ?? previous.value.recordedAt)
      : sampled.toISOString();
    const sequence = (
      previous?.value.checkpointSequence
      ?? previous?.value.sequence
      ?? 0
    ) + 1;
    if (sequence > 99_999_999) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED');
    const record = Object.freeze(canonicalValue({
      contractDigest,
      operationId,
      payload: validatedPayload,
      phase,
      previousRecordDigest: previous?.digest ?? null,
      profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
      recordedAt,
      runAttempt,
      runId,
      schemaVersion: 1,
      sequence,
    }));
    const ordinal = String(sequence).padStart(8, '0');
    const name = `notification-pages-private-deploy-${operationId}-${ordinal}-${phase}.json`;
    publish({
      directory: state.directory,
      name,
      temporaryName: `.${name.slice(0, -5)}-${randomId(randomBytesImpl)}.json.tmp`,
      value: record,
      uid: state.uid,
    });
    const installed = readOperation();
    if (phase === 'postflight-completed') {
      installCompletedTerminal(state, installed.records, randomBytesImpl);
      const compacted = readOperation();
      if (compacted.terminal === null || compacted.records.length !== 0) {
        fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_COMPACTION_INVALID');
      }
    }
  };
  return Object.freeze({
    operationId,
    directory: state.directory,
    inspect() {
      const operationState = readOperation();
      if (operationState.terminal !== null) {
        const { value } = operationState.terminal;
        return Object.freeze({
          operationId,
          contractDigest,
          phase: 'postflight-completed',
          completed: true,
          candidateAuthorityDigest: value.candidateAuthorityDigest,
          deploymentInvoked: value.deploymentInvoked,
          latestHandoff: null,
          phases: Object.freeze(['postflight-completed']),
        });
      }
      const { records } = operationState;
      const candidate = [...records].reverse().find(
        record => record.value.phase === 'candidate-authorized',
      );
      const handoff = [...records].reverse().find(
        record => record.value.phase === 'prepared',
      );
      const current = records.at(-1);
      return Object.freeze({
        operationId,
        contractDigest,
        phase: current?.value.phase ?? null,
        completed: current?.value.phase === 'postflight-completed',
        candidateAuthorityDigest:
          candidate?.value.payload.candidateAuthorityDigest ?? null,
        deploymentInvoked: records.some(
          record => record.value.phase === 'deploy-invoked',
        ),
        latestHandoff: handoff?.value.payload.handoff ?? null,
        phases: Object.freeze(records.map(record => record.value.phase)),
      });
    },
    prepared(handoff) { return append('prepared', { handoff }); },
    reconciledExactCurrent(mode) {
      return append('reconciled-exact-current', { mode });
    },
    reconciledNotCurrent(mode) {
      return append('reconciled-not-current', { mode });
    },
    candidateAuthorized(candidateAuthorityDigest) {
      return append('candidate-authorized', { candidateAuthorityDigest });
    },
    deployInvoked(candidateAuthorityDigest) {
      return append('deploy-invoked', {
        candidateAuthorityDigest,
        candidatePagesSourceCommit: contract.candidatePagesSourceCommit,
      }, {
        effectBoundary: true,
      });
    },
    postflightNotCurrent(mode) {
      return append('postflight-not-current', { mode });
    },
    completed(receiptDigest, receiptResult) {
      return append('postflight-completed', { receiptDigest, receiptResult });
    },
  });
}

/**
 * Hold the repository-exclusive owner lock while one command advances an
 * append-only deployment operation. No callback may retain the journal.
 */
export async function withNotificationPagesPrivateDeployJournal({
  contract,
  repositoryRoot,
  reportedHome,
  runId,
  runAttempt,
  clock = () => new Date(),
  randomBytesImpl = randomBytes,
  processIdentity,
  processIdentityProbe = probeProductionAdminProcessIdentity,
  operation,
} = {}) {
  if (
    !isRecord(contract)
    || !isAbsolute(repositoryRoot ?? '')
    || !RUN_ID.test(runId ?? '')
    || !Number.isSafeInteger(runAttempt)
    || runAttempt < 1
    || runAttempt > 1_000
    || typeof clock !== 'function'
    || typeof randomBytesImpl !== 'function'
    || typeof processIdentityProbe !== 'function'
    || typeof operation !== 'function'
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_INPUT_INVALID');
  const canonicalContract = Object.freeze(canonicalValue(contract));
  const contractDigest = digestValue(canonicalContract);
  const operationId = createHash('sha256')
    .update(`${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n${contractDigest}\n`)
    .digest('hex');
  const state = ensureDirectory({ repositoryRoot, reportedHome });
  const identity = processIdentity
    ?? requireCurrentProductionAdminProcessIdentity(processIdentityProbe);
  if (typeof identity !== 'string' || identity.length < 8 || identity.length > 128) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PROCESS_INVALID');
  }
  const lock = acquireLock(
    state,
    operationId,
    randomBytesImpl,
    identity,
    processIdentityProbe,
  );
  let primary;
  try {
    // Record temporaries are repaired only after the global lock is ours. A
    // contender can therefore never unlink the first writer's pre-link file.
    repairTemporaries(state.directory, state.uid);
    repairTerminalTemporaries(state.directory, state.uid);
    repairAbandonmentTemporaries(state.directory, state.uid);
    repairAndCompactCompletedHistories(state, randomBytesImpl);
    const journal = createJournal({
      state,
      operationId,
      contract: canonicalContract,
      contractDigest,
      runId,
      runAttempt,
      clock,
      randomBytesImpl,
    });
    journal.inspect();
    return await operation(journal);
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    try { releaseLock(state, lock); } catch (error) {
      if (primary === undefined) throw error;
    }
  }
}

/**
 * Retire exactly one deployment marker only after an authenticated GitHub
 * Actions adjudicator proves that the following deploy action was skipped.
 * Any missing, running, cancelled, failed, timed-out, or otherwise uncertain
 * deploy step remains a typed may-have-changed stop.
 */
export async function recoverNotificationPagesPrivateDeploySkippedInvocation({
  repositoryRoot,
  reportedHome,
  clock = () => new Date(),
  randomBytesImpl = randomBytes,
  processIdentity,
  processIdentityProbe = probeProductionAdminProcessIdentity,
  adjudicate,
} = {}) {
  if (
    !isAbsolute(repositoryRoot ?? '')
    || typeof clock !== 'function'
    || typeof randomBytesImpl !== 'function'
    || typeof processIdentityProbe !== 'function'
    || typeof adjudicate !== 'function'
  ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_INPUT_INVALID');
  const state = ensureDirectory({ repositoryRoot, reportedHome });
  const identity = processIdentity
    ?? requireCurrentProductionAdminProcessIdentity(processIdentityProbe);
  if (typeof identity !== 'string' || identity.length < 8 || identity.length > 128) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_PROCESS_INVALID');
  }
  const recoveryLockOperationId = createHash('sha256')
    .update(
      `${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n`
        + 'skipped-deployment-recovery\n',
    )
    .digest('hex');
  const lock = acquireLock(
    state,
    recoveryLockOperationId,
    randomBytesImpl,
    identity,
    processIdentityProbe,
  );
  let primary;
  try {
    repairTemporaries(state.directory, state.uid);
    repairTerminalTemporaries(state.directory, state.uid);
    repairAbandonmentTemporaries(state.directory, state.uid);
    let journalState = repairAndCompactCompletedHistories(
      state,
      randomBytesImpl,
    );
    const unfinished = [...journalState.histories.entries()].filter(
      ([, records]) => records.length !== 0,
    );
    const invoked = unfinished.filter(([, records]) => records.some(
      record => record.value.phase === 'deploy-invoked',
    ));
    if (invoked.length === 0) {
      return Object.freeze({ recovered: false });
    }
    if (unfinished.length !== 1 || invoked.length !== 1) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS', true);
    }
    const [operationId, records] = invoked[0];
    const deploy = [...records].reverse().find(
      record => record.value.phase === 'deploy-invoked',
    );
    if (deploy === undefined) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS', true);
    }
    const afterDeploy = records.filter(
      record => record.value.sequence > deploy.value.sequence,
    );
    if (afterDeploy.some(
      record => record.value.phase === 'reconciled-exact-current',
    )) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS', true);
    const request = Object.freeze({
      candidatePagesSourceCommit:
        deploy.value.payload.candidatePagesSourceCommit,
      contractDigest: deploy.value.contractDigest,
      deployRecordDigest: deploy.digest,
      deploySequence: deploy.value.sequence,
      operationId,
      runAttempt: deploy.value.runAttempt,
      runId: deploy.value.runId,
    });
    let rawProof;
    try { rawProof = await adjudicate(request); } catch {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS', true);
    }
    const proof = canonicalValue(rawProof);
    const proofKeys = [
      'candidatePagesSourceCommit',
      'deployStepConclusion',
      'deployStepName',
      'jobConclusion',
      'jobId',
      'jobName',
      'jobStatus',
      'markerStepConclusion',
      'markerStepName',
      'profile',
      'repository',
      'runAttempt',
      'runId',
      'schemaVersion',
      'workflow',
    ];
    if (
      !isRecord(proof)
      || Object.keys(proof).join(',') !== proofKeys.join(',')
      || proof.schemaVersion !== 1
      || proof.profile
        !== NOTIFICATION_PAGES_PRIVATE_DEPLOY_ABANDONMENT_PROOF_PROFILE
      || proof.repository !== 'ael-dev3/Warpkeep'
      || proof.workflow !== '.github/workflows/deploy-pages.yml'
      || proof.jobName !== 'Notification Pages private deploy v1'
      || !/^[1-9][0-9]{0,19}$/u.test(proof.jobId ?? '')
      || proof.jobStatus !== 'completed'
      || !['cancelled', 'failure', 'timed_out'].includes(proof.jobConclusion)
      || proof.markerStepName
        !== 'Recheck protected source and durably mark deployment invocation'
      || proof.markerStepConclusion !== 'success'
      || proof.deployStepName
        !== 'Deploy private-authorized release to GitHub Pages'
      || proof.deployStepConclusion !== 'skipped'
      || proof.runId !== deploy.value.runId
      || proof.runAttempt !== deploy.value.runAttempt
      || proof.candidatePagesSourceCommit
        !== deploy.value.payload.candidatePagesSourceCommit
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_AMBIGUOUS', true);
    const previous = records.at(-1);
    const sampled = clock();
    if (!(sampled instanceof Date) || Number.isNaN(sampled.getTime())) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CLOCK_INVALID');
    }
    const recordedAt = sampled.getTime() < Date.parse(previous.value.recordedAt)
      ? previous.value.recordedAt
      : sampled.toISOString();
    const checkpointSequence = previous.value.sequence + 1;
    if (checkpointSequence > 99_999_999 || records.length >= MAX_ACTIVE_RECORDS) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CAPACITY_EXCEEDED');
    }
    const checkpoint = Object.freeze(canonicalValue({
      adjudicationDigest: digestValue(proof),
      candidatePagesSourceCommit:
        deploy.value.payload.candidatePagesSourceCommit,
      checkpointSequence,
      contractDigest: deploy.value.contractDigest,
      operationId,
      deployRecordDigest: deploy.digest,
      deploySequence: deploy.value.sequence,
      profile: NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE,
      reason: 'github-actions-deploy-step-skipped',
      retiredAt: recordedAt,
      retiredRecordDigest: previous.digest,
      retiredSequence: previous.value.sequence,
      runAttempt: deploy.value.runAttempt,
      runId: deploy.value.runId,
      schemaVersion: 1,
    }));
    const ordinal = String(checkpointSequence).padStart(8, '0');
    const name = `notification-pages-private-deploy-${operationId}`
      + `-abandonment-${ordinal}.json`;
    publish({
      directory: state.directory,
      name,
      temporaryName:
        `.notification-pages-private-deploy-${operationId}`
          + `-abandonment-${ordinal}-${randomId(randomBytesImpl)}.json.tmp`,
      value: checkpoint,
      uid: state.uid,
    });
    journalState = loadJournalState(state.directory, state.uid);
    const installed = journalState.abandonments.get(operationId);
    if (
      installed?.value.checkpointSequence !== checkpointSequence
      || installed.value.adjudicationDigest !== checkpoint.adjudicationDigest
    ) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
    }
    pruneCompactedRecords(state, journalState);
    journalState = loadJournalState(state.directory, state.uid);
    const retained = journalState.abandonments.get(operationId);
    if (
      retained?.value.checkpointSequence !== checkpointSequence
      || (journalState.histories.get(operationId)?.length ?? 0) !== 0
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ABANDONMENT_INVALID');
    return Object.freeze({
      recovered: true,
      operationId,
      candidatePagesSourceCommit:
        deploy.value.payload.candidatePagesSourceCommit,
      adjudicationDigest: checkpoint.adjudicationDigest,
    });
  } catch (error) {
    primary = error;
    throw error;
  } finally {
    try { releaseLock(state, lock); } catch (error) {
      if (primary === undefined) throw error;
    }
  }
}
