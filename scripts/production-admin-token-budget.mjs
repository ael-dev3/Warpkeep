import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
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
  readdirSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const PRODUCTION_ADMIN_TOKEN_WINDOW_MS = 300_000;
export const PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM = 6;
export const PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS = 300_000;

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const WRITABLE_BY_NON_OWNER = 0o022;
const STICKY = 0o1000;
const LEDGER_FILE = 'admin-token-budget-v1.json';
const LEDGER_LOCK_FILE = '.admin-token-budget-v1.lock';
const LEDGER_TEMPORARY_FILE = /^\.admin-token-budget-v1-[0-9a-f]{32}\.tmp$/u;
const LEDGER_PROFILE = 'warpkeep-production-admin-token-budget-v1';
const LOCK_PROFILE = 'warpkeep-production-admin-token-budget-lock-v1';
const LOCK_LIFETIME_MS = 30_000;
const LOCK_WAIT_MS = 25;
const LOCK_WAIT_MAXIMUM_MS = 5_000;
const MAX_STATE_BYTES = 64 * 1024;

export class ProductionAdminTokenBudgetError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionAdminTokenBudgetError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionAdminTokenBudgetError(code);
}

function currentUid() {
  return process.getuid?.();
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

export function assertProductionAdminTrustedAncestors(path) {
  if (!isAbsolute(path)) fail('PRODUCTION_ADMIN_STATE_PATH_NOT_ABSOLUTE');
  const uid = currentUid();
  let current = resolve(path);
  while (true) {
    if (existsSync(current)) {
      const status = lstatSync(current);
      if (status.isSymbolicLink() || !status.isDirectory()) {
        fail('PRODUCTION_ADMIN_STATE_ANCESTOR_INVALID');
      }
      if (uid !== undefined && status.uid !== uid && status.uid !== 0) {
        fail('PRODUCTION_ADMIN_STATE_ANCESTOR_OWNER_INVALID');
      }
      if (
        (status.mode & WRITABLE_BY_NON_OWNER) !== 0
        && !(status.uid === 0 && (status.mode & STICKY) !== 0)
      ) fail('PRODUCTION_ADMIN_STATE_ANCESTOR_WRITABLE');
    }
    const parent = dirname(current);
    if (parent === current) return;
    current = parent;
  }
}

/** Ambient HOME is deliberately ignored so it cannot split the shared budget. */
export function canonicalProductionAdminAccountHome(reportedHome = userInfo().homedir) {
  if (!isAbsolute(reportedHome)) fail('PRODUCTION_ADMIN_ACCOUNT_HOME_INVALID');
  const requested = resolve(reportedHome);
  assertProductionAdminTrustedAncestors(requested);
  let canonical;
  try {
    canonical = realpathSync(requested);
  } catch {
    fail('PRODUCTION_ADMIN_ACCOUNT_HOME_INVALID');
  }
  const status = lstatSync(requested);
  if (
    canonical !== requested
    || status.isSymbolicLink()
    || !status.isDirectory()
    || (currentUid() !== undefined && status.uid !== currentUid())
    || (status.mode & WRITABLE_BY_NON_OWNER) !== 0
  ) fail('PRODUCTION_ADMIN_ACCOUNT_HOME_INVALID');
  return canonical;
}

function createPrivateDirectory(path, parent) {
  mkdirSync(path, { mode: DIRECTORY_MODE });
  chmodSync(path, DIRECTORY_MODE);
  const status = lstatSync(path);
  const canonical = realpathSync(path);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (currentUid() !== undefined && status.uid !== currentUid())
    || (status.mode & 0o7777) !== DIRECTORY_MODE
    || dirname(canonical) !== parent
  ) fail('PRODUCTION_ADMIN_STATE_DIRECTORY_CREATE_FAILED');
  return canonical;
}

function ensurePrivateDirectory(path) {
  const requested = resolve(path);
  assertProductionAdminTrustedAncestors(requested);
  const missing = [];
  let ancestor = requested;
  while (!existsSync(ancestor)) {
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) fail('PRODUCTION_ADMIN_STATE_DIRECTORY_INVALID');
    ancestor = parent;
  }
  let parent = realpathSync(ancestor);
  for (const child of missing) parent = createPrivateDirectory(child, parent);
  const status = lstatSync(requested);
  const canonical = realpathSync(requested);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (currentUid() !== undefined && status.uid !== currentUid())
    || (status.mode & 0o7777) !== DIRECTORY_MODE
    || canonical !== requested
  ) fail('PRODUCTION_ADMIN_STATE_DIRECTORY_INVALID');
  return canonical;
}

export function ensureCanonicalProductionAdminStateDirectory(reportedHome = userInfo().homedir) {
  const home = canonicalProductionAdminAccountHome(reportedHome);
  let parent = home;
  for (const name of ['.warpkeep', 'private', 'production-admin-v1']) {
    const path = join(parent, name);
    if (!existsSync(path)) parent = createPrivateDirectory(path, parent);
    else {
      const status = lstatSync(path);
      const canonical = realpathSync(path);
      if (
        !status.isDirectory()
        || status.isSymbolicLink()
        || (currentUid() !== undefined && status.uid !== currentUid())
        || (status.mode & 0o7777) !== DIRECTORY_MODE
        || dirname(canonical) !== parent
      ) fail('PRODUCTION_ADMIN_STATE_DIRECTORY_INVALID');
      parent = canonical;
    }
  }
  return parent;
}

export function defaultProductionAdminStateDirectory() {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep',
    'private',
    'production-admin-v1',
  );
}

export function probeProductionAdminProcessIdentity(pid) {
  if (!Number.isSafeInteger(pid) || pid < 1) return Object.freeze({ state: 'ambiguous' });
  const psPath = '/bin/ps';
  try {
    const status = lstatSync(psPath);
    if (
      status.isSymbolicLink()
      || !status.isFile()
      || status.uid !== 0
      || (status.mode & WRITABLE_BY_NON_OWNER) !== 0
    ) return Object.freeze({ state: 'ambiguous' });
  } catch {
    return Object.freeze({ state: 'ambiguous' });
  }
  const result = spawnSync(psPath, ['-p', String(pid), '-o', 'lstart='], {
    encoding: 'utf8',
    env: Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', TZ: 'UTC' }),
    stdio: ['ignore', 'pipe', 'ignore'],
    timeout: 2_000,
    maxBuffer: 4_096,
  });
  if (result.error !== undefined || result.signal !== null) {
    return Object.freeze({ state: 'ambiguous' });
  }
  const value = result.stdout.trim();
  if (result.status === 1 && value === '') return Object.freeze({ state: 'absent' });
  if (
    result.status !== 0
    || !/^[A-Z][a-z]{2} [A-Z][a-z]{2} [ 0-9][0-9] [0-9:]{8} [0-9]{4}$/u.test(value)
  ) return Object.freeze({ state: 'ambiguous' });
  return Object.freeze({ state: 'present', identity: value });
}

export function requireCurrentProductionAdminProcessIdentity(
  probe = probeProductionAdminProcessIdentity,
) {
  const result = probe(process.pid);
  if (result.state !== 'present') fail('PRODUCTION_ADMIN_PROCESS_IDENTITY_UNAVAILABLE');
  return result.identity;
}

export function productionAdminRecordedOwnerIsDead({
  pid,
  processStartIdentity,
  probe = probeProductionAdminProcessIdentity,
}) {
  const result = probe(pid);
  if (result.state === 'ambiguous') return undefined;
  if (result.state === 'absent') return true;
  return result.identity !== processStartIdentity;
}

function validTime(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function validId(value) {
  return typeof value === 'string' && /^[0-9a-f]{32}$/u.test(value);
}

function resolveStateDirectory(options) {
  return options.stateDirectory === undefined
    ? ensureCanonicalProductionAdminStateDirectory()
    : ensurePrivateDirectory(options.stateDirectory);
}

function assertStateDirectoryEntries(directory) {
  for (const name of [LEDGER_FILE, LEDGER_LOCK_FILE]) {
    const path = join(directory, name);
    if (!existsSync(path)) continue;
    const status = lstatSync(path);
    if (
      status.isSymbolicLink()
      || !status.isFile()
      || status.nlink !== 1
      || (currentUid() !== undefined && status.uid !== currentUid())
      || (status.mode & 0o7777) !== FILE_MODE
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
  }
}

function repairTokenLedgerLockPublication(directory) {
  const lockPath = join(directory, LEDGER_LOCK_FILE);
  const temporaryNames = readdirSync(directory)
    .filter(name => LEDGER_TEMPORARY_FILE.test(name))
    .sort();
  if (temporaryNames.length > 32) {
    fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
  }
  let lockStatus;
  try {
    lockStatus = lstatSync(lockPath);
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  let repairedPair = false;
  for (const name of temporaryNames) {
    const path = join(directory, name);
    const status = lstatSync(path);
    if (
      status.isSymbolicLink()
      || !status.isFile()
      || (currentUid() !== undefined && status.uid !== currentUid())
      || (status.mode & 0o7777) !== FILE_MODE
      || (status.nlink !== 1 && status.nlink !== 2)
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
    const linkedToFinal = lockStatus !== undefined
      && lockStatus.dev === status.dev
      && lockStatus.ino === status.ino;
    if (linkedToFinal) {
      if (repairedPair || status.nlink !== 2 || lockStatus.nlink !== 2) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
      }
      const opened = readExactJsonFile(lockPath, 4_096, undefined, 2);
      const lock = parseLock(opened?.value);
      if (name !== `.admin-token-budget-v1-${lock.lockId}.tmp`) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
      }
      unlinkExact(path, {
        dev: status.dev,
        ino: status.ino,
        nlink: 2,
        mode: FILE_MODE,
        uid: status.uid,
      });
      fsyncDirectory(directory);
      lockStatus = lstatSync(lockPath);
      if (lockStatus.nlink !== 1) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
      }
      const repaired = readExactJsonFile(lockPath, 4_096);
      if (JSON.stringify(parseLock(repaired?.value)) !== JSON.stringify(lock)) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
      }
      repairedPair = true;
      continue;
    }
    // A one-link temp was never published as the lock. It has no authority and
    // is safe to remove from this owner-only namespace even if SIGKILL left a
    // partial JSON body.
    if (status.nlink !== 1) {
      fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
    }
    unlinkExact(path, {
      dev: status.dev,
      ino: status.ino,
      nlink: 1,
      mode: FILE_MODE,
      uid: status.uid,
    });
    fsyncDirectory(directory);
  }
  if (lockStatus !== undefined && lockStatus.nlink !== 1) {
    fail('PRODUCTION_ADMIN_TOKEN_LEDGER_DIRECTORY_INVALID');
  }
}

function exactObjectKeys(value, keys) {
  return Object.keys(value).join(',') === keys.join(',');
}

function parseOwner(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactObjectKeys(value, ['pid', 'processStartIdentity'])
    || !Number.isSafeInteger(value.pid)
    || value.pid < 1
    || typeof value.processStartIdentity !== 'string'
    || value.processStartIdentity.length < 8
    || value.processStartIdentity.length > 128
  ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
  return Object.freeze({ pid: value.pid, processStartIdentity: value.processStartIdentity });
}

function parseLedger(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactObjectKeys(value, [
      'schemaVersion', 'profile', 'windowMs', 'maximumAttempts', 'lastObservedAtMs',
      'attempts', 'reservations',
    ])
    || value.schemaVersion !== 1
    || value.profile !== LEDGER_PROFILE
    || value.windowMs !== PRODUCTION_ADMIN_TOKEN_WINDOW_MS
    || value.maximumAttempts !== PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
    || !validTime(value.lastObservedAtMs)
    || !Array.isArray(value.attempts)
    || !Array.isArray(value.reservations)
  ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
  let priorAttempt = -1;
  const attempts = value.attempts.map(attempt => {
    if (
      attempt === null
      || typeof attempt !== 'object'
      || Array.isArray(attempt)
      || !exactObjectKeys(attempt, ['attemptId', 'attemptedAtMs', 'reservationId'])
      || !validId(attempt.attemptId)
      || !validTime(attempt.attemptedAtMs)
      || attempt.attemptedAtMs < priorAttempt
      || attempt.attemptedAtMs > value.lastObservedAtMs
      || !(attempt.reservationId === null || validId(attempt.reservationId))
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    priorAttempt = attempt.attemptedAtMs;
    return Object.freeze({ ...attempt });
  });
  const reservationIds = new Set();
  const reservations = value.reservations.map(reservation => {
    if (
      reservation === null
      || typeof reservation !== 'object'
      || Array.isArray(reservation)
      || !exactObjectKeys(reservation, [
        'reservationId', 'owner', 'createdAtMs', 'expiresAtMs', 'remaining',
      ])
      || !validId(reservation.reservationId)
      || reservationIds.has(reservation.reservationId)
      || !validTime(reservation.createdAtMs)
      || !validTime(reservation.expiresAtMs)
      || reservation.expiresAtMs < reservation.createdAtMs
      || reservation.expiresAtMs > value.lastObservedAtMs + PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS
      || !Number.isSafeInteger(reservation.remaining)
      || reservation.remaining < 0
      || reservation.remaining > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    reservationIds.add(reservation.reservationId);
    return Object.freeze({ ...reservation, owner: parseOwner(reservation.owner) });
  });
  if (
    attempts.length
      + reservations.reduce((sum, reservation) => sum + reservation.remaining, 0)
      > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
  ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
  return {
    schemaVersion: 1,
    profile: LEDGER_PROFILE,
    windowMs: PRODUCTION_ADMIN_TOKEN_WINDOW_MS,
    maximumAttempts: PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM,
    lastObservedAtMs: value.lastObservedAtMs,
    attempts,
    reservations,
  };
}

function initialLedger(now) {
  return {
    schemaVersion: 1,
    profile: LEDGER_PROFILE,
    windowMs: PRODUCTION_ADMIN_TOKEN_WINDOW_MS,
    maximumAttempts: PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM,
    lastObservedAtMs: now,
    attempts: [],
    reservations: [],
  };
}

function readExactJsonFile(path, maximumBytes, missingValue, expectedNlink = 1) {
  let descriptor;
  try {
    try {
      descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    } catch (error) {
      if (error?.code === 'ENOENT') return missingValue;
      throw error;
    }
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size < 1
      || before.size > maximumBytes
      || before.nlink !== expectedNlink
      || (before.mode & 0o7777) !== FILE_MODE
      || (currentUid() !== undefined && before.uid !== currentUid())
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    const body = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    try {
      return Object.freeze({
        value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)),
        dev: before.dev,
        ino: before.ino,
        nlink: before.nlink,
        mode: before.mode & 0o7777,
        uid: before.uid,
      });
    } catch {
      fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    }
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function writeAll(descriptor, body) {
  let offset = 0;
  while (offset < body.byteLength) {
    const written = writeSync(descriptor, body, offset, body.byteLength - offset);
    if (written <= 0) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_WRITE_FAILED');
    offset += written;
  }
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, constants.O_RDONLY);
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function writeLedger(directory, ledger, randomId = () => randomUUID().replaceAll('-', '')) {
  const body = Buffer.from(`${JSON.stringify(ledger)}\n`, 'utf8');
  if (body.byteLength > MAX_STATE_BYTES) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_WRITE_FAILED');
  const temporary = join(directory, `.admin-token-budget-v1-${randomId()}.tmp`);
  if (!LEDGER_TEMPORARY_FILE.test(temporary.slice(directory.length + 1))) {
    fail('PRODUCTION_ADMIN_TOKEN_LEDGER_WRITE_FAILED');
  }
  let descriptor;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    writeAll(descriptor, body);
    fsyncSync(descriptor);
    chmodSync(temporary, FILE_MODE);
    closeSync(descriptor);
    descriptor = undefined;
    renameSync(temporary, join(directory, LEDGER_FILE));
    fsyncDirectory(directory);
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Surface the primary fixed failure. */ }
    }
    try { unlinkSync(temporary); } catch { /* It may already be atomically installed. */ }
    if (error instanceof ProductionAdminTokenBudgetError) throw error;
    fail('PRODUCTION_ADMIN_TOKEN_LEDGER_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
}

function parseLock(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || !exactObjectKeys(value, [
      'schemaVersion', 'profile', 'lockId', 'owner', 'createdAtMs', 'expiresAtMs',
    ])
    || value.schemaVersion !== 1
    || value.profile !== LOCK_PROFILE
    || !validId(value.lockId)
    || !validTime(value.createdAtMs)
    || !validTime(value.expiresAtMs)
    || value.expiresAtMs - value.createdAtMs !== LOCK_LIFETIME_MS
  ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_INVALID');
  return Object.freeze({ ...value, owner: parseOwner(value.owner) });
}

function unlinkExact(path, expected) {
  const current = lstatSync(path);
  if (
    current.isSymbolicLink()
    || !current.isFile()
    || current.dev !== expected.dev
    || current.ino !== expected.ino
    || current.nlink !== (expected.nlink ?? 1)
    || (current.mode & 0o7777) !== (expected.mode ?? FILE_MODE)
    || (currentUid() !== undefined && current.uid !== (expected.uid ?? currentUid()))
  ) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_REPLACED');
  unlinkSync(path);
}

function delay(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function acquireLedgerLock(directory, options, owner) {
  const lockPath = join(directory, LEDGER_LOCK_FILE);
  const startedAt = options.now();
  const startedMonotonic = options.monotonicNow();
  if (!validTime(startedAt)) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
  if (!Number.isFinite(startedMonotonic) || startedMonotonic < 0) {
    fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
  }
  while (true) {
    const now = options.now();
    const monotonic = options.monotonicNow();
    if (!validTime(now) || now < startedAt) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
    if (
      !Number.isFinite(monotonic)
      || monotonic < startedMonotonic
      || monotonic - startedMonotonic > Number.MAX_SAFE_INTEGER
    ) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
    const record = Object.freeze({
      schemaVersion: 1,
      profile: LOCK_PROFILE,
      lockId: options.randomId(),
      owner,
      createdAtMs: now,
      expiresAtMs: now + LOCK_LIFETIME_MS,
    });
    const body = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
    const temporary = join(directory, `.admin-token-budget-v1-${record.lockId}.tmp`);
    let descriptor;
    let temporaryCreated = false;
    let temporaryIdentity;
    let lockClaimed = false;
    try {
      descriptor = openSync(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      temporaryCreated = true;
      const created = fstatSync(descriptor);
      temporaryIdentity = Object.freeze({
        dev: created.dev,
        ino: created.ino,
        mode: created.mode & 0o7777,
        uid: created.uid,
      });
      options.testOnlyStep?.('lock-temp-opened');
      writeAll(descriptor, body);
      fsyncSync(descriptor);
      chmodSync(temporary, FILE_MODE);
      const status = fstatSync(descriptor);
      if (status.dev !== temporaryIdentity.dev || status.ino !== temporaryIdentity.ino) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_FAILED');
      }
      closeSync(descriptor);
      descriptor = undefined;
      // A fully written, fsynced inode is atomically claimed without replacing
      // a competing lock. SIGKILL can leave a valid lock or an inert temp, never
      // an empty/partial final lock that cannot be inspected and recovered.
      linkSync(temporary, lockPath);
      lockClaimed = true;
      fsyncDirectory(directory);
      options.testOnlyStep?.('lock-linked');
      unlinkExact(temporary, { ...temporaryIdentity, nlink: 2 });
      temporaryCreated = false;
      fsyncDirectory(directory);
      body.fill(0);
      return Object.freeze({
        path: lockPath,
        dev: status.dev,
        ino: status.ino,
        mode: status.mode & 0o7777,
        uid: status.uid,
        nlink: 1,
      });
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Continue to the fixed failure. */ }
      }
      if (temporaryCreated) {
        try {
          if (temporaryIdentity !== undefined) {
            unlinkExact(temporary, {
              ...temporaryIdentity,
              nlink: lockClaimed ? 2 : 1,
            });
          }
        } catch { /* Preserve the fixed failure. */ }
      }
      if (lockClaimed) {
        try {
          if (temporaryIdentity !== undefined) unlinkExact(lockPath, temporaryIdentity);
          fsyncDirectory(directory);
        } catch { /* A valid recoverable lock remains fail-closed. */ }
      }
      body.fill(0);
      if (error?.code !== 'EEXIST') {
        if (error instanceof ProductionAdminTokenBudgetError) throw error;
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_FAILED');
      }
      const existing = readExactJsonFile(lockPath, 4_096);
      if (existing === undefined) continue;
      const existingRecord = parseLock(existing.value);
      if (now < existingRecord.createdAtMs) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
      const dead = productionAdminRecordedOwnerIsDead({
        ...existingRecord.owner,
        probe: options.processIdentityProbe,
      });
      if (now >= existingRecord.expiresAtMs && dead === true) {
        try {
          unlinkExact(lockPath, existing);
          fsyncDirectory(directory);
        } catch {
          fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_RECOVERY_FAILED');
        }
        continue;
      }
      if (monotonic - startedMonotonic >= LOCK_WAIT_MAXIMUM_MS) {
        fail('PRODUCTION_ADMIN_TOKEN_LEDGER_BUSY');
      }
      await (options.delay ?? delay)(LOCK_WAIT_MS);
    }
  }
}

function normalizedOptions(options = {}) {
  const now = options.now ?? Date.now;
  const processIdentityProbe = options.processIdentityProbe
    ?? probeProductionAdminProcessIdentity;
  const randomId = options.randomId ?? (() => randomUUID().replaceAll('-', ''));
  const monotonicNow = options.monotonicNow ?? (() => performance.now());
  return Object.freeze({ ...options, now, monotonicNow, processIdentityProbe, randomId });
}

async function mutateLedgerOperation(
  optionsInput,
  mutation,
  interrupted,
  allowStaleOwnedRelease,
) {
  const options = normalizedOptions(optionsInput);
  const directory = resolveStateDirectory(options);
  repairTokenLedgerLockPublication(directory);
  assertStateDirectoryEntries(directory);
  const processStartIdentity = requireCurrentProductionAdminProcessIdentity(
    options.processIdentityProbe,
  );
  const owner = Object.freeze({ pid: process.pid, processStartIdentity });
  const lock = await acquireLedgerLock(directory, options, owner);
  let mutationError;
  let result;
  try {
    if (interrupted()) {
      fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INTERRUPTED_BEFORE_MUTATION');
    }
    const observedNow = options.now();
    if (!validTime(observedNow)) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_INVALID');
    const opened = readExactJsonFile(join(directory, LEDGER_FILE), MAX_STATE_BYTES);
    const ledger = opened === undefined ? initialLedger(observedNow) : parseLedger(opened.value);
    if (observedNow < ledger.lastObservedAtMs && !allowStaleOwnedRelease) {
      fail('PRODUCTION_ADMIN_TOKEN_CLOCK_ROLLBACK');
    }
    const now = allowStaleOwnedRelease
      ? Math.max(observedNow, ledger.lastObservedAtMs)
      : observedNow;
    ledger.attempts = ledger.attempts.filter(attempt => (
      now - attempt.attemptedAtMs <= PRODUCTION_ADMIN_TOKEN_WINDOW_MS
    ));
    const retainedReservations = [];
    for (const reservation of ledger.reservations) {
      if (now < reservation.createdAtMs) fail('PRODUCTION_ADMIN_TOKEN_CLOCK_ROLLBACK');
      const expired = now > reservation.expiresAtMs;
      if (!expired) {
        retainedReservations.push(reservation);
        continue;
      }
      const dead = productionAdminRecordedOwnerIsDead({
        ...reservation.owner,
        probe: options.processIdentityProbe,
      });
      if (dead !== true) retainedReservations.push(reservation);
    }
    ledger.reservations = retainedReservations;
    ledger.lastObservedAtMs = now;
    result = await mutation({ ledger, now, owner, options });
    if (interrupted()) {
      fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INTERRUPTED_BEFORE_MUTATION');
    }
    if (
      ledger.attempts.length
        + ledger.reservations.reduce((sum, reservation) => sum + reservation.remaining, 0)
        > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
    ) fail('PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
    writeLedger(directory, ledger, options.randomId);
  } catch (error) {
    mutationError = error;
  }
  let cleanupError;
  try {
    unlinkExact(lock.path, lock);
    fsyncDirectory(directory);
  } catch (error) {
    cleanupError = error;
  }
  if (mutationError !== undefined && cleanupError !== undefined) {
    throw new AggregateError(
      [mutationError, cleanupError],
      'PRODUCTION_ADMIN_TOKEN_LEDGER_MULTIPLE_FAILURES',
    );
  }
  if (mutationError !== undefined) throw mutationError;
  if (cleanupError !== undefined) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_LOCK_CLEANUP_FAILED');
  return result;
}

async function mutateLedger(optionsInput, mutation, behavior = {}) {
  let interruptedBy;
  const onSigint = () => { interruptedBy ??= 'SIGINT'; };
  const onSigterm = () => { interruptedBy ??= 'SIGTERM'; };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  let result;
  let operationError;
  try {
    if (interruptedBy === undefined) {
      result = await mutateLedgerOperation(
        optionsInput,
        mutation,
        () => interruptedBy !== undefined,
        behavior.allowStaleOwnedRelease === true,
      );
    }
  } catch (error) {
    operationError = error;
  } finally {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
  }
  const interruption = interruptedBy === undefined
    ? undefined
    : new ProductionAdminTokenBudgetError(
        `PRODUCTION_ADMIN_TOKEN_LEDGER_INTERRUPTED_${interruptedBy}`,
      );
  if (operationError !== undefined && interruption !== undefined) {
    throw new AggregateError(
      [operationError, interruption],
      'PRODUCTION_ADMIN_TOKEN_LEDGER_MULTIPLE_FAILURES',
    );
  }
  if (operationError !== undefined) throw operationError;
  if (interruption !== undefined) throw interruption;
  return result;
}

function requireOwnedReservation(ledger, reservationId, owner) {
  if (!validId(reservationId)) fail('PRODUCTION_ADMIN_TOKEN_RESERVATION_INVALID');
  const reservation = ledger.reservations.find(value => value.reservationId === reservationId);
  if (
    reservation === undefined
    || reservation.owner.pid !== owner.pid
    || reservation.owner.processStartIdentity !== owner.processStartIdentity
  ) fail('PRODUCTION_ADMIN_TOKEN_RESERVATION_INVALID');
  return reservation;
}

export async function reserveProductionAdminTokenBudget(input = {}) {
  const slots = input.slots;
  if (
    !Number.isSafeInteger(slots)
    || slots < 1
    || slots > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
  ) fail('PRODUCTION_ADMIN_TOKEN_RESERVATION_INVALID');
  return mutateLedger(input, ({ ledger, now, owner, options }) => {
    const committed = ledger.attempts.length
      + ledger.reservations.reduce((sum, reservation) => sum + reservation.remaining, 0);
    if (committed + slots > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM) {
      fail('PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
    }
    const reservationId = options.randomId();
    if (!validId(reservationId)) fail('PRODUCTION_ADMIN_TOKEN_RESERVATION_INVALID');
    ledger.reservations.push(Object.freeze({
      reservationId,
      owner,
      createdAtMs: now,
      expiresAtMs: now + PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS,
      remaining: slots,
    }));
    return Object.freeze({ reservationId, remaining: slots });
  });
}

export async function ensureProductionAdminTokenReservation(input) {
  const minimumRemaining = input.minimumRemaining;
  if (
    !Number.isSafeInteger(minimumRemaining)
    || minimumRemaining < 1
    || minimumRemaining > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
  ) fail('PRODUCTION_ADMIN_TOKEN_RESERVATION_INVALID');
  return mutateLedger(input, ({ ledger, now, owner }) => {
    const reservation = requireOwnedReservation(ledger, input.reservationId, owner);
    const additional = Math.max(0, minimumRemaining - reservation.remaining);
    const committed = ledger.attempts.length
      + ledger.reservations.reduce((sum, value) => sum + value.remaining, 0);
    if (committed + additional > PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM) {
      fail('PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
    }
    const replacement = Object.freeze({
      ...reservation,
      expiresAtMs: now + PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS,
      remaining: reservation.remaining + additional,
    });
    ledger.reservations = ledger.reservations.map(value => (
      value.reservationId === replacement.reservationId ? replacement : value
    ));
    return Object.freeze({
      reservationId: replacement.reservationId,
      remaining: replacement.remaining,
    });
  });
}

export async function releaseProductionAdminTokenReservation(input) {
  return mutateLedger(input, ({ ledger, owner }) => {
    const reservation = requireOwnedReservation(ledger, input.reservationId, owner);
    ledger.reservations = ledger.reservations.filter(value => (
      value.reservationId !== reservation.reservationId
    ));
    return Object.freeze({
      reservationId: reservation.reservationId,
      released: reservation.remaining,
    });
  }, { allowStaleOwnedRelease: true });
}

/** Record first: a rejected or unreachable HTTP request still consumes quota. */
export async function recordProductionAdminTokenAttempt(input = {}) {
  return mutateLedger(input, ({ ledger, now, owner, options }) => {
    const reservationId = input.reservationId ?? null;
    if (reservationId === null) {
      const committed = ledger.attempts.length
        + ledger.reservations.reduce((sum, reservation) => sum + reservation.remaining, 0);
      if (committed >= PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM) {
        fail('PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
      }
    } else {
      const reservation = requireOwnedReservation(ledger, reservationId, owner);
      if (reservation.remaining < 1) fail('PRODUCTION_ADMIN_TOKEN_BUDGET_EXHAUSTED');
      const replacement = Object.freeze({
        ...reservation,
        expiresAtMs: now + PRODUCTION_ADMIN_TOKEN_RESERVATION_LIFETIME_MS,
        remaining: reservation.remaining - 1,
      });
      ledger.reservations = ledger.reservations.map(value => (
        value.reservationId === reservation.reservationId ? replacement : value
      ));
    }
    const attemptId = options.randomId();
    if (!validId(attemptId)) fail('PRODUCTION_ADMIN_TOKEN_LEDGER_INVALID');
    ledger.attempts.push(Object.freeze({ attemptId, attemptedAtMs: now, reservationId }));
    return Object.freeze({ attemptId, attemptedAtMs: now, reservationId });
  });
}

export async function inspectProductionAdminTokenBudget(options = {}) {
  return mutateLedger(options, ({ ledger }) => Object.freeze({
    attempts: ledger.attempts.length,
    reserved: ledger.reservations.reduce((sum, reservation) => sum + reservation.remaining, 0),
    reservations: ledger.reservations.length,
    remaining: PRODUCTION_ADMIN_TOKEN_WINDOW_MAXIMUM
      - ledger.attempts.length
      - ledger.reservations.reduce((sum, reservation) => sum + reservation.remaining, 0),
    lastObservedAtMs: ledger.lastObservedAtMs,
  }));
}

export const productionAdminTokenBudgetTestSeams = Object.freeze({
  inside,
  parseLedger,
  parseLock,
  resolveStateDirectory,
});
