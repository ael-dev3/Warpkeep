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

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_FILE_BYTES = 64 * 1024;
const MAX_DIRECTORY_ENTRIES = 1_024;
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
const LOCK_FILE = '.notification-pages-private-deploy.lock';
const LOCK_TEMPORARY_FILE = /^\.notification-pages-private-deploy-lock-([0-9a-f]{24})\.tmp$/u;
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
    const status = lstatSync(requested);
    const directory = realpathSync(requested);
    const uid = process.getuid?.();
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
    linkSync(temporary, destination);
    linked = true;
    fsyncDirectory(directory);
    unlinkExact(temporary, { ...identity, nlink: 2 }, uid);
    fsyncDirectory(directory);
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
    if (error?.code === 'EEXIST') {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_ALREADY_EXISTS');
    }
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
    && (Object.keys(value).join(',') !== 'candidateAuthorityDigest'
      || (value.candidateAuthorityDigest !== null
        && !SHA256.test(value.candidateAuthorityDigest)))
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
      || (temporary.mode & 0o7777) !== FILE_MODE
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
      unlinkExact(temporaryPath, {
        dev: temporary.dev, ino: temporary.ino, nlink: 1, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
}

function repairLockTemporaries(directory, uid) {
  const names = readdirSync(directory).filter(name => LOCK_TEMPORARY_FILE.test(name));
  if (names.length > 32) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  let final;
  try { final = lstatSync(join(directory, LOCK_FILE)); } catch (error) {
    if (error?.code !== 'ENOENT') fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  let paired = false;
  for (const name of names.sort()) {
    const path = join(directory, name);
    const temporary = lstatSync(path);
    if (
      !temporary.isFile()
      || temporary.isSymbolicLink()
      || (uid !== undefined && temporary.uid !== uid)
      || (temporary.mode & 0o7777) !== FILE_MODE
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
      unlinkExact(path, {
        dev: temporary.dev, ino: temporary.ino, nlink: 1, mode: FILE_MODE,
      }, uid);
      fsyncDirectory(directory);
    } else fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  if (final !== undefined) assertFile(final, uid);
}

function loadHistories(directory, uid) {
  const names = readdirSync(directory).sort();
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  const histories = new Map();
  for (const name of names) {
    if (name === LOCK_FILE) continue;
    if (LOCK_TEMPORARY_FILE.test(name) || TEMPORARY_FILE.test(name)) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    if (!RECORD_FILE.test(name)) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    const opened = readStable(join(directory, name), uid);
    let record;
    try { record = parseRecord(name, opened.bytes); } finally { opened.bytes.fill(0); }
    const records = histories.get(record.value.operationId) ?? [];
    records.push(record);
    histories.set(record.value.operationId, records);
  }
  for (const records of histories.values()) {
    records.sort((left, right) => left.value.sequence - right.value.sequence);
    let previous;
    for (const record of records) {
      if (
        record.value.sequence !== (previous?.value.sequence ?? 0) + 1
        || record.value.previousRecordDigest !== (previous?.digest ?? null)
        || (previous !== undefined
          && record.value.contractDigest !== previous.value.contractDigest)
        || (previous !== undefined
          && Date.parse(record.value.recordedAt) < Date.parse(previous.value.recordedAt))
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
      previous = record;
    }
    const first = records[0];
    const expectedOperationId = createHash('sha256')
      .update(`${NOTIFICATION_PAGES_PRIVATE_DEPLOY_JOURNAL_PROFILE}\n${first.value.contractDigest}\n`)
      .digest('hex');
    if (first.value.operationId !== expectedOperationId) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_HISTORY_INVALID');
    }
  }
  return histories;
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
  repairLockTemporaries(state.directory, state.uid);
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
  publish({
    directory: state.directory,
    name: LOCK_FILE,
    temporaryName: `.notification-pages-private-deploy-lock-${lockId}.tmp`,
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
    if (phases[0] !== 'prepared' || phases.filter(value => value === 'prepared').length !== 1) {
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
  const readRecords = () => {
    const histories = loadHistories(state.directory, state.uid);
    for (const [otherId, records] of histories) {
      if (
        otherId !== operationId
        && records.at(-1)?.value.phase !== 'postflight-completed'
      ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_OTHER_OPERATION_UNFINISHED');
    }
    const records = histories.get(operationId) ?? [];
    validateHistory(records, contractDigest);
    return records;
  };
  const append = (phase, payload, { effectBoundary = false } = {}) => {
    const validatedPayload = validatePayload(phase, payload);
    const records = readRecords();
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
        && !['prepared', 'deploy-invoked'].includes(latest))
      || (phase === 'candidate-authorized'
        && latest !== 'reconciled-not-current')
      || (phase === 'deploy-invoked'
        && !['reconciled-not-current', 'candidate-authorized'].includes(latest))
      || (phase === 'postflight-not-current' && latest !== 'deploy-invoked')
      || (phase === 'postflight-completed'
        && latest !== 'reconciled-exact-current')
    ) fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_TRANSITION_INVALID');
    if (
      phase === 'deploy-invoked'
      && records.some(record => record.value.phase === 'deploy-invoked')
    ) fail('NOTIFICATION_PAGES_DEPLOY_ALREADY_INVOKED', true);
    const previous = records.at(-1);
    const sampled = clock();
    if (!(sampled instanceof Date) || Number.isNaN(sampled.getTime())) {
      fail('NOTIFICATION_PAGES_DEPLOY_JOURNAL_CLOCK_INVALID');
    }
    const recordedAt = previous !== undefined
      && sampled.getTime() < Date.parse(previous.value.recordedAt)
      ? previous.value.recordedAt
      : sampled.toISOString();
    const sequence = (previous?.value.sequence ?? 0) + 1;
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
    readRecords();
  };
  return Object.freeze({
    operationId,
    directory: state.directory,
    inspect() {
      const records = readRecords();
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
      return append('deploy-invoked', { candidateAuthorityDigest }, {
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
  repairTemporaries(state.directory, state.uid);
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
