import { createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fchmodSync,
  fstatSync,
  ftruncateSync,
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
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  ensureCanonicalProductionAdminStateDirectory,
  probeProductionAdminProcessIdentity,
  requireCurrentProductionAdminProcessIdentity,
} from './production-admin-token-budget.mjs';

export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE =
  'warpkeep-auth-bridge-notification-b0-deploy-journal-v1';
export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD =
  'bridge-notification-b0-deploy-journal-v1';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_FILE_BYTES = 64 * 1_024;
const MAX_DIRECTORY_ENTRIES = 1_024;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const PHASES = Object.freeze({
  prepared: 1,
  'remote-reconcile-started': 2,
  'upload-invoked': 3,
  uploaded: 4,
  'release-uncertain': 5,
  'release-invoked': 6,
  completed: 7,
  'receipt-publication-intent': 8,
  'receipt-published': 9,
});
const PHASE_PATTERN = '(prepared|remote-reconcile-started|upload-invoked|uploaded|release-uncertain|release-invoked|completed|receipt-publication-intent|receipt-published)';
const RECORD_FILE = new RegExp(
  `^auth-bridge-notification-b0-deploy-([a-f0-9]{64})-(0[1-9])-${PHASE_PATTERN}\\.json$`,
  'u',
);
const RECORD_TEMPORARY_FILE = new RegExp(
  `^\\.auth-bridge-notification-b0-deploy-([a-f0-9]{64})-(0[1-9])-${PHASE_PATTERN}-([a-f0-9]{24})\\.json\\.tmp$`,
  'u',
);
const LOCK_FILE = '.auth-bridge-notification-b0-deploy.lock';
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
]);
const LOCK_KEYS = Object.freeze([
  'lockId',
  'operationId',
  'owner',
  'profile',
  'schemaVersion',
]);
const B0_LOCK_HELPER = String.raw`
import fcntl,sys
try:
    fcntl.flock(3,fcntl.LOCK_EX|fcntl.LOCK_NB)
except BlockingIOError:
    sys.exit(73)
except Exception as error:
    print(str(error),file=sys.stderr,flush=True)
    sys.exit(74)
print("READY",flush=True)
`;

export class AuthBridgeNotificationB0DeployJournalError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'AuthBridgeNotificationB0DeployJournalError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new AuthBridgeNotificationB0DeployJournalError(
    code,
    deploymentMayHaveChanged,
  );
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, keys) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function canonicalValue(value, depth = 0) {
  if (depth > 32) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_VALUE_INVALID');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_VALUE_INVALID');
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(item => canonicalValue(item, depth + 1));
  }
  if (!isRecord(value)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_VALUE_INVALID');
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (
      key.length === 0
      || key.length > 128
      || key === '__proto__'
      || key === 'constructor'
      || key === 'prototype'
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_VALUE_INVALID');
    output[key] = canonicalValue(value[key], depth + 1);
  }
  return output;
}

function canonicalBody(value) {
  const body = Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
  if (body.byteLength > MAX_FILE_BYTES) {
    body.fill(0);
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_VALUE_INVALID');
  }
  return body;
}

function digestBody(body) {
  return createHash('sha256').update(body).digest('hex');
}

function digestValue(value) {
  const body = canonicalBody(value);
  try { return digestBody(body); } finally { body.fill(0); }
}

function strictUtc(value) {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_RECORD_INVALID');
  return value;
}

function dateNow(clock) {
  const value = clock();
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_CLOCK_INVALID');
  }
  return value.toISOString();
}

function ownerUid() {
  const uid = process.getuid?.();
  if (!Number.isSafeInteger(uid) || uid < 0) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_ACCOUNT_INVALID');
  }
  return uid;
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function fsyncDirectory(path) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_DIRECTORY ?? 0));
    fsyncSync(descriptor);
  } catch {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FSYNC_FAILED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function assertPrivateDirectory(path, uid, expectedParent) {
  let metadata;
  let canonical;
  try {
    metadata = lstatSync(path);
    canonical = realpathSync(path);
  } catch {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  if (
    metadata.isSymbolicLink()
    || !metadata.isDirectory()
    || metadata.uid !== uid
    || (metadata.mode & 0o7777) !== DIRECTORY_MODE
    || canonical !== path
    || (expectedParent !== undefined && dirname(canonical) !== expectedParent)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  return canonical;
}

function ensureJournalDirectory({ reportedHome, repositoryRoot }) {
  const uid = ownerUid();
  const parent = ensureCanonicalProductionAdminStateDirectory(reportedHome);
  const path = join(
    parent,
    AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD,
  );
  if (!existsSync(path)) {
    try {
      mkdirSync(path, { mode: DIRECTORY_MODE });
      chmodSync(path, DIRECTORY_MODE);
      fsyncDirectory(path);
      fsyncDirectory(parent);
    } catch (error) {
      if (error?.code !== 'EEXIST') {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_CREATE_FAILED');
      }
    }
  }
  const created = lstatSync(path);
  const createdMode = created.mode & 0o7777;
  if (
    createdMode !== DIRECTORY_MODE
    && created.isDirectory()
    && !created.isSymbolicLink()
    && created.uid === uid
    && (createdMode & ~DIRECTORY_MODE) === 0
  ) {
    try {
      if (realpathSync(path) !== path || dirname(path) !== parent) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      chmodSync(path, DIRECTORY_MODE);
      fsyncDirectory(path);
      fsyncDirectory(parent);
    } catch (error) {
      if (error instanceof AuthBridgeNotificationB0DeployJournalError) {
        throw error;
      }
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_CREATE_FAILED');
    }
  }
  const directory = assertPrivateDirectory(path, uid, parent);
  if (!isAbsolute(repositoryRoot)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_REPOSITORY_INVALID');
  }
  let repository;
  try {
    repository = realpathSync(resolve(repositoryRoot));
    const status = lstatSync(resolve(repositoryRoot));
    if (
      repository !== resolve(repositoryRoot)
      || status.isSymbolicLink()
      || !status.isDirectory()
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_REPOSITORY_INVALID');
  } catch (error) {
    if (error instanceof AuthBridgeNotificationB0DeployJournalError) throw error;
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_REPOSITORY_INVALID');
  }
  if (inside(repository, directory) || inside(directory, repository)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_REPOSITORY_OVERLAP');
  }
  return Object.freeze({ directory, uid });
}

function writeAll(descriptor, body) {
  let offset = 0;
  while (offset < body.byteLength) {
    const written = writeSync(
      descriptor,
      body,
      offset,
      body.byteLength - offset,
    );
    if (written <= 0) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_WRITE_FAILED');
    offset += written;
  }
}

function assertFileStatus(
  status,
  uid,
  expectedLinks = 1,
  expectedMode = FILE_MODE,
) {
  if (
    status.isSymbolicLink()
    || !status.isFile()
    || status.uid !== uid
    || (status.mode & 0o7777) !== expectedMode
    || status.nlink !== expectedLinks
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_INVALID');
}

function readExactFile(path, uid, expectedLinks = 1) {
  let before;
  let descriptor;
  let body;
  try {
    before = lstatSync(path);
    assertFileStatus(before, uid, expectedLinks);
    if (before.size < 2 || before.size > MAX_FILE_BYTES) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_INVALID');
    }
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(descriptor);
    if (opened.dev !== before.dev || opened.ino !== before.ino) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_REPLACED');
    }
    body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs
      || body.byteLength !== before.size
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_REPLACED');
  } catch (error) {
    if (error instanceof AuthBridgeNotificationB0DeployJournalError) throw error;
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (body[body.byteLength - 1] !== 0x0a) {
    body.fill(0);
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_INVALID');
  }
  return Object.freeze({
    body,
    identity: Object.freeze({
      dev: before.dev,
      ino: before.ino,
      uid: before.uid,
      mode: before.mode & 0o7777,
      nlink: before.nlink,
    }),
  });
}

function parseCanonicalJson(body) {
  let value;
  try {
    value = JSON.parse(body.toString('utf8'));
  } catch {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_INVALID');
  }
  const expected = canonicalBody(value);
  try {
    if (!expected.equals(body)) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_NOT_CANONICAL');
    }
  } finally {
    expected.fill(0);
  }
  return value;
}

function exactUnlink(path, expected, uid) {
  let current;
  try { current = lstatSync(path); } catch {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_REPLACED');
  }
  assertFileStatus(current, uid, expected.nlink, expected.mode ?? FILE_MODE);
  if (current.dev !== expected.dev || current.ino !== expected.ino) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_REPLACED');
  }
  try { unlinkSync(path); } catch {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_FILE_REPLACED');
  }
}

function randomId(randomBytesImpl) {
  const value = randomBytesImpl(12);
  if (!Buffer.isBuffer(value) || value.byteLength !== 12) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_RANDOM_INVALID');
  }
  return value.toString('hex');
}

function publishNoReplace({
  directory,
  destinationName,
  temporaryName,
  value,
  uid,
}) {
  const destination = join(directory, destinationName);
  const temporary = join(directory, temporaryName);
  const body = canonicalBody(value);
  let descriptor;
  let identity;
  let linked = false;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    fchmodSync(descriptor, FILE_MODE);
    const opened = fstatSync(descriptor);
    assertFileStatus(opened, uid, 1);
    identity = Object.freeze({
      dev: opened.dev,
      ino: opened.ino,
      uid: opened.uid,
      mode: opened.mode & 0o7777,
      nlink: 1,
    });
    writeAll(descriptor, body);
    fsyncSync(descriptor);
    const written = fstatSync(descriptor);
    if (
      written.dev !== identity.dev
      || written.ino !== identity.ino
      || written.size !== body.byteLength
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_WRITE_FAILED');
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    linked = true;
    fsyncDirectory(directory);
    exactUnlink(temporary, { ...identity, nlink: 2 }, uid);
    fsyncDirectory(directory);
    const published = readExactFile(destination, uid);
    try {
      if (!published.body.equals(body)) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_WRITE_FAILED');
      }
    } finally {
      published.body.fill(0);
    }
    return Object.freeze({
      digest: digestBody(body),
      identity: Object.freeze({ ...identity, nlink: 1 }),
    });
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the primary failure. */ }
    }
    if (!linked && identity !== undefined) {
      try { exactUnlink(temporary, identity, uid); } catch { /* Fail closed. */ }
    }
    if (error instanceof AuthBridgeNotificationB0DeployJournalError) throw error;
    if (error?.code === 'EEXIST') {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_ALREADY_EXISTS');
    }
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
}

function lockValue(value) {
  if (
    !exactKeys(value, LOCK_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE
    || !SHA256_HEX.test(value.operationId)
    || !/^[a-f0-9]{24}$/u.test(value.lockId)
    || !exactKeys(value.owner, ['pid', 'processStartIdentity'])
    || !Number.isSafeInteger(value.owner.pid)
    || value.owner.pid < 1
    || typeof value.owner.processStartIdentity !== 'string'
    || value.owner.processStartIdentity.length < 8
    || value.owner.processStartIdentity.length > 128
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_INVALID');
  return value;
}

function readLock(path, uid, expectedLinks = 1) {
  const opened = readExactFile(path, uid, expectedLinks);
  try {
    return Object.freeze({
      value: lockValue(parseCanonicalJson(opened.body)),
      identity: opened.identity,
    });
  } finally {
    opened.body.fill(0);
  }
}

function acquireLock({
  directory,
  uid,
  operationId,
  randomBytesImpl,
  processIdentity,
}) {
  const lockPath = join(directory, LOCK_FILE);
  const lockId = randomId(randomBytesImpl);
  const value = Object.freeze(canonicalValue({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE,
    operationId,
    lockId,
    owner: {
      pid: process.pid,
      processStartIdentity: processIdentity,
    },
  }));
  const expectedBody = canonicalBody(value);
  let descriptor;
  let released = false;
  try {
    let created = false;
    try {
      descriptor = openSync(
        lockPath,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      created = true;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      descriptor = openSync(
        lockPath,
        constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      );
    }
    if (created) fchmodSync(descriptor, FILE_MODE);
    const opened = fstatSync(descriptor);
    const named = lstatSync(lockPath);
    assertFileStatus(opened, uid, 1);
    if (opened.dev !== named.dev || opened.ino !== named.ino) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_RACE');
    }
    const result = spawnSync('/usr/bin/python3', [
      '-I', '-c', B0_LOCK_HELPER,
    ], {
      cwd: directory,
      env: {
        PATH: '/usr/bin:/bin',
        HOME: '/nonexistent',
        LC_ALL: 'C',
        PYTHONHASHSEED: '0',
      },
      stdio: ['ignore', 'pipe', 'pipe', descriptor],
      timeout: 5_000,
      killSignal: 'SIGKILL',
      maxBuffer: 4_096,
      encoding: 'utf8',
    });
    if (result.status === 73) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_BUSY');
    }
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || result.stdout !== 'READY\n'
      || result.stderr !== ''
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_INVALID');
    const afterHelper = fstatSync(descriptor);
    const namedAfterHelper = lstatSync(lockPath);
    if (
      afterHelper.dev !== opened.dev
      || afterHelper.ino !== opened.ino
      || namedAfterHelper.dev !== opened.dev
      || namedAfterHelper.ino !== opened.ino
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_RACE');
    ftruncateSync(descriptor, 0);
    let offset = 0;
    while (offset < expectedBody.byteLength) {
      const written = writeSync(
        descriptor,
        expectedBody,
        offset,
        expectedBody.byteLength - offset,
        offset,
      );
      if (written <= 0) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_WRITE_FAILED');
      }
      offset += written;
    }
    fsyncSync(descriptor);
    fsyncDirectory(directory);
    const installed = readLock(lockPath, uid);
    if (
      installed.identity.dev !== opened.dev
      || installed.identity.ino !== opened.ino
      || digestValue(installed.value) !== digestValue(value)
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_INVALID');
    const lock = Object.freeze({
      assertActive() {
        if (released || descriptor === undefined) {
          fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_REQUIRED');
        }
        let held;
        try { held = fstatSync(descriptor); } catch {
          fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_REQUIRED');
        }
        const current = readLock(lockPath, uid);
        if (
          held.dev !== opened.dev
          || held.ino !== opened.ino
          || current.identity.dev !== opened.dev
          || current.identity.ino !== opened.ino
          || digestValue(current.value) !== digestValue(value)
        ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_RACE');
      },
      release() {
        if (released) return;
        lock.assertActive();
        released = true;
        closeSync(descriptor);
        descriptor = undefined;
      },
    });
    lock.assertActive();
    return lock;
  } catch (error) {
    if (!released && descriptor !== undefined) closeSync(descriptor);
    released = true;
    descriptor = undefined;
    if (error instanceof AuthBridgeNotificationB0DeployJournalError) throw error;
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_LOCK_UNAVAILABLE');
  } finally {
    expectedBody.fill(0);
  }
}

function phasePayload(phase, value) {
  const payload = canonicalValue(value);
  const expectedKeys = {
    prepared: ['contract'],
    'remote-reconcile-started': [
      'predecessorDeploymentId', 'predecessorVersionId', 'sourceCommit',
      'sourceDigest', 'versionTag',
    ],
    'upload-invoked': ['sourceCommit', 'sourceDigest', 'uploadMode', 'versionTag'],
    'release-uncertain': ['sourceCommit', 'versionId', 'versionTag'],
    'release-invoked': ['sourceCommit', 'versionId', 'versionTag'],
    'receipt-publication-intent': [
      'receiptBytesBase64', 'receiptDigest',
    ],
    'receipt-published': ['receiptDigest'],
  }[phase];
  if (expectedKeys !== undefined && !exactKeys(payload, expectedKeys)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  }
  if (
    ['remote-reconcile-started', 'upload-invoked'].includes(phase)
    && (!SOURCE_COMMIT.test(payload.sourceCommit)
      || !SHA256_HEX.test(payload.sourceDigest)
      || typeof payload.versionTag !== 'string')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'remote-reconcile-started'
    && (!VERSION_ID.test(payload.predecessorDeploymentId)
      || !VERSION_ID.test(payload.predecessorVersionId))
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'upload-invoked'
    && payload.uploadMode !== 'version'
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    ['release-uncertain', 'release-invoked'].includes(phase)
    && (!SOURCE_COMMIT.test(payload.sourceCommit)
      || !VERSION_ID.test(payload.versionId)
      || typeof payload.versionTag !== 'string')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'uploaded'
    && (!isRecord(payload)
      || !VERSION_ID.test(payload.versionId)
      || !SOURCE_COMMIT.test(payload.sourceCommit)
      || !SHA256_HEX.test(payload.sourceDigest))
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (
    phase === 'completed'
    && (!isRecord(payload)
      || !VERSION_ID.test(payload.versionId)
      || !SOURCE_COMMIT.test(payload.sourceCommit))
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  if (phase === 'receipt-publication-intent') {
    let bytes;
    try {
      if (
        typeof payload.receiptBytesBase64 !== 'string'
        || payload.receiptBytesBase64.length < 4
        || payload.receiptBytesBase64.length > 12 * 1_024
        || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u
          .test(payload.receiptBytesBase64)
        || !SHA256_HEX.test(payload.receiptDigest ?? '')
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
      bytes = Buffer.from(payload.receiptBytesBase64, 'base64');
      if (
        bytes.byteLength < 2
        || bytes.byteLength > 8 * 1_024
        || bytes[bytes.byteLength - 1] !== 0x0a
        || bytes.toString('base64') !== payload.receiptBytesBase64
        || digestBody(bytes) !== payload.receiptDigest
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
      const source = bytes.subarray(0, -1).toString('utf8');
      if (`${JSON.stringify(JSON.parse(source))}\n` !== bytes.toString('utf8')) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
      }
    } catch (error) {
      if (error instanceof AuthBridgeNotificationB0DeployJournalError) throw error;
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
    } finally {
      bytes?.fill(0);
    }
  }
  if (
    phase === 'receipt-published'
    && !SHA256_HEX.test(payload.receiptDigest ?? '')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_INVALID');
  return Object.freeze(payload);
}

function recordName(operationId, phase) {
  const ordinal = String(PHASES[phase]).padStart(2, '0');
  return `auth-bridge-notification-b0-deploy-${operationId}-${ordinal}-${phase}.json`;
}

function parseRecord(name, body) {
  const match = RECORD_FILE.exec(name);
  const value = parseCanonicalJson(body);
  if (
    match === null
    || !exactKeys(value, RECORD_KEYS)
    || value.schemaVersion !== 1
    || value.profile !== AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE
    || value.operationId !== match[1]
    || PHASES[value.phase] !== Number(match[2])
    || value.phase !== match[3]
    || !SHA256_HEX.test(value.contractDigest)
    || (value.previousRecordDigest !== null
      && !SHA256_HEX.test(value.previousRecordDigest))
    || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt)
    || value.runAttempt < 1
    || value.runAttempt > 1_000
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_RECORD_INVALID');
  strictUtc(value.recordedAt);
  value.payload = phasePayload(value.phase, value.payload);
  return Object.freeze({
    value: Object.freeze(value),
    digest: digestBody(body),
    ordinal: PHASES[value.phase],
    name,
  });
}

function inspectRecordFile(directory, name, uid, expectedLinks = 1) {
  const opened = readExactFile(join(directory, name), uid, expectedLinks);
  try {
    return Object.freeze({
      ...parseRecord(name, opened.body),
      identity: opened.identity,
    });
  } finally {
    opened.body.fill(0);
  }
}

function repairRecordPublications(directory, uid) {
  const names = readdirSync(directory).filter(name => RECORD_TEMPORARY_FILE.test(name));
  if (names.length > 64) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  for (const name of names.sort()) {
    const match = RECORD_TEMPORARY_FILE.exec(name);
    const temporaryPath = join(directory, name);
    const temporary = lstatSync(temporaryPath);
    if (
      temporary.isSymbolicLink()
      || !temporary.isFile()
      || temporary.uid !== uid
      || ((temporary.mode & 0o7777) !== FILE_MODE
        && !(
          temporary.nlink === 1
          && ((temporary.mode & 0o7777) & ~FILE_MODE) === 0
        ))
      || ![1, 2].includes(temporary.nlink)
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    const destinationName = `auth-bridge-notification-b0-deploy-${match[1]}-${match[2]}-${match[3]}.json`;
    const destinationPath = join(directory, destinationName);
    let destination;
    try { destination = lstatSync(destinationPath); } catch (error) {
      if (error?.code !== 'ENOENT') {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
    }
    const linked = destination !== undefined
      && destination.dev === temporary.dev
      && destination.ino === temporary.ino;
    if (linked) {
      if (temporary.nlink !== 2 || destination.nlink !== 2) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      inspectRecordFile(directory, destinationName, uid, 2);
      exactUnlink(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        uid,
        mode: temporary.mode & 0o7777,
        nlink: 2,
      }, uid);
      fsyncDirectory(directory);
    } else {
      if (temporary.nlink !== 1) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
      }
      exactUnlink(temporaryPath, {
        dev: temporary.dev,
        ino: temporary.ino,
        uid,
        mode: temporary.mode & 0o7777,
        nlink: 1,
      }, uid);
      fsyncDirectory(directory);
    }
  }
}

function loadHistories(directory, uid) {
  const names = readdirSync(directory);
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
  }
  const histories = new Map();
  for (const name of names.sort()) {
    if (name === LOCK_FILE) {
      readLock(join(directory, name), uid);
      continue;
    }
    if (RECORD_TEMPORARY_FILE.test(name)) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    if (!RECORD_FILE.test(name)) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_DIRECTORY_INVALID');
    }
    const record = inspectRecordFile(directory, name, uid);
    const values = histories.get(record.value.operationId) ?? [];
    values.push(record);
    histories.set(record.value.operationId, values);
  }
  for (const records of histories.values()) {
    records.sort((left, right) => left.ordinal - right.ordinal);
    let previous;
    for (const record of records) {
      if (
        (previous === undefined && record.value.phase !== 'prepared')
        || (previous !== undefined
          && (record.ordinal <= previous.ordinal
            || record.value.previousRecordDigest !== previous.digest
            || record.value.contractDigest !== previous.value.contractDigest
            || Date.parse(record.value.recordedAt) < Date.parse(previous.value.recordedAt)))
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_HISTORY_INVALID');
      previous = record;
    }
    const operationId = records[0].value.operationId;
    const expectedOperationId = createHash('sha256')
      .update(`${AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE}\n${records[0].value.contractDigest}\n`)
      .digest('hex');
    if (operationId !== expectedOperationId) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_HISTORY_INVALID');
    }
  }
  return histories;
}

function createJournal({
  directory,
  uid,
  lock,
  operationId,
  contract,
  contractDigest,
  runId,
  runAttempt,
  clock,
  randomBytesImpl,
}) {
  const readRecords = () => {
    lock.assertActive();
    const records = loadHistories(directory, uid).get(operationId) ?? [];
    lock.assertActive();
    if (records.length > 0) {
      const prepared = records[0];
      if (
        prepared.value.contractDigest !== contractDigest
        || digestValue(prepared.value.payload.contract) !== contractDigest
        || digestValue(prepared.value.payload.contract) !== digestValue(contract)
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_CONTRACT_MISMATCH');
    }
    return records;
  };

  const transition = async (phase, input, behavior = 'idempotent') => {
    const payload = phasePayload(phase, input);
    const records = readRecords();
    const existing = records.find(record => record.value.phase === phase);
    if (existing !== undefined) {
      if (digestValue(existing.value.payload) !== digestValue(payload)) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PAYLOAD_MISMATCH');
      }
      if (behavior === 'effect-boundary') {
        const code = {
          'upload-invoked': 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_ALREADY_INVOKED',
          'release-invoked': 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_ALREADY_INVOKED',
        }[phase];
        fail(code ?? 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_EFFECT_ALREADY_INVOKED', true);
      }
      return;
    }
    const previous = records.at(-1);
    const ordinal = PHASES[phase];
    if (
      (phase === 'prepared' && previous !== undefined)
      || (phase !== 'prepared' && previous === undefined)
      || (previous !== undefined && previous.ordinal >= ordinal)
      || (phase === 'remote-reconcile-started'
        && previous?.value.phase !== 'prepared')
      || (phase === 'upload-invoked'
        && previous?.value.phase !== 'remote-reconcile-started')
      || (phase === 'uploaded'
        && !['remote-reconcile-started', 'upload-invoked']
          .includes(previous?.value.phase))
      || (phase === 'release-uncertain' && previous?.value.phase !== 'uploaded')
      || (phase === 'release-invoked'
        && previous?.value.phase !== 'release-uncertain')
      || (phase === 'completed'
        && !['uploaded', 'release-uncertain', 'release-invoked']
          .includes(previous?.value.phase))
      || (phase === 'receipt-publication-intent'
        && previous?.value.phase !== 'completed')
      || (phase === 'receipt-published'
        && (previous?.value.phase !== 'receipt-publication-intent'
          || input.receiptDigest !== previous.value.payload.receiptDigest))
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_TRANSITION_INVALID');
    const sampledAt = dateNow(clock);
    const recordedAt = previous !== undefined
      && Date.parse(sampledAt) < Date.parse(previous.value.recordedAt)
      ? previous.value.recordedAt
      : sampledAt;
    const record = Object.freeze(canonicalValue({
      schemaVersion: 1,
      profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE,
      operationId,
      contractDigest,
      phase,
      previousRecordDigest: previous?.digest ?? null,
      payload,
      runId,
      runAttempt,
      recordedAt,
    }));
    const name = recordName(operationId, phase);
    const id = randomId(randomBytesImpl);
    lock.assertActive();
    publishNoReplace({
      directory,
      destinationName: name,
      temporaryName: `.${name.slice(0, -5)}-${id}.json.tmp`,
      value: record,
      uid,
    });
    lock.assertActive();
    readRecords();
  };

  return Object.freeze({
    operationId,
    directory,
    inspect() {
      const records = readRecords();
      const current = records.at(-1);
      return Object.freeze({
        operationId,
        contractDigest,
        phase: current?.value.phase ?? null,
        phases: Object.freeze(records.map(record => record.value.phase)),
        uploadMode: records.find(
          record => record.value.phase === 'upload-invoked',
        )?.value.payload.uploadMode ?? null,
        predecessorDeploymentId: records.find(
          record => record.value.phase === 'remote-reconcile-started',
        )?.value.payload.predecessorDeploymentId ?? null,
        predecessorVersionId: records.find(
          record => record.value.phase === 'remote-reconcile-started',
        )?.value.payload.predecessorVersionId ?? null,
        completedDeployment: records.find(
          record => record.value.phase === 'completed',
        )?.value.payload ?? null,
        receiptPublicationIntent: records.find(
          record => record.value.phase === 'receipt-publication-intent',
        )?.value.payload ?? null,
        publishedReceipt: records.find(
          record => record.value.phase === 'receipt-published',
        )?.value.payload ?? null,
      });
    },
    prepared(value) {
      if (digestValue(value) !== contractDigest) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_CONTRACT_MISMATCH');
      }
      return transition('prepared', { contract });
    },
    remoteReconcileStarted(value) {
      return transition('remote-reconcile-started', value);
    },
    uploadInvoked(value) {
      return transition('upload-invoked', value, 'effect-boundary');
    },
    uploaded(value) { return transition('uploaded', value); },
    releaseUncertain(value) { return transition('release-uncertain', value); },
    releaseInvoked(value) {
      return transition('release-invoked', value, 'effect-boundary');
    },
    completed(value) { return transition('completed', value); },
    receiptPublicationIntent(value) {
      return transition('receipt-publication-intent', value);
    },
    receiptPublished(value) { return transition('receipt-published', value); },
  });
}

/**
 * Holds one fixed-inode kernel deployment lock while the callback uses an
 * append-only, no-replace journal. The callback must not retain `journal`.
 */
export async function withAuthBridgeNotificationB0DeployJournal({
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
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_INPUT_INVALID');
  const canonicalContract = Object.freeze(canonicalValue(contract));
  const contractDigest = digestValue(canonicalContract);
  const operationId = createHash('sha256')
    .update(`${AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE}\n${contractDigest}\n`)
    .digest('hex');
  const state = ensureJournalDirectory({ reportedHome, repositoryRoot });
  const identity = processIdentity
    ?? requireCurrentProductionAdminProcessIdentity(processIdentityProbe);
  if (
    typeof identity !== 'string'
    || identity.length < 8
    || identity.length > 128
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROCESS_INVALID');
  const lock = acquireLock({
    ...state,
    operationId,
    randomBytesImpl,
    processIdentity: identity,
  });
  let primaryError;
  try {
    repairRecordPublications(state.directory, state.uid);
    const journal = createJournal({
      ...state,
      lock,
      operationId,
      contract: canonicalContract,
      contractDigest,
      runId,
      runAttempt,
      clock,
      randomBytesImpl,
    });
    // Validate the entire dedicated namespace before user code can observe or
    // advance the journal, even if the callback itself performs no transition.
    journal.inspect();
    return await operation(journal);
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      lock.release();
    } catch (releaseError) {
      if (primaryError === undefined) throw releaseError;
    }
  }
}
