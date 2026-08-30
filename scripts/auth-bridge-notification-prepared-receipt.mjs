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
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { userInfo } from 'node:os';
import {
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  DEFAULT_AUTH_BRIDGE_URL,
  parseAuthBridgeReleaseAttestation,
  verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation,
  verifyAuthBridgeNotificationB0RpcRoleAttestation,
  verifyAuthBridgePreparedPredeployRpcRoleAttestation,
  verifyAuthBridgePreparedRpcRoleAttestation,
} from './auth-bridge-config-attestation.mjs';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KIND =
  'warpkeep-auth-bridge-notification-prepared-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'bridgeOrigin',
  'bridgeSourceCommit',
  'notificationDeliveryContractDigest',
  'notificationClientCount',
  'notificationDeliveryEnabled',
  'notificationTransportConfigured',
  'admissionNotificationStoreConfigured',
  'publicAuthEnabledBefore',
  'publicAuthEnabledAfter',
  'accessExpectedFidRequiredBefore',
  'accessExpectedFidRequiredAfter',
  'hermesExecutionApproved',
  'pagesPresentationEnabled',
  'liveAttestationDigest',
  'preparedAt',
  'expiresAt',
]);
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS =
  24 * 60 * 60 * 1_000;
export const AUTH_BRIDGE_RELEASE_ATTESTATION_URL =
  `${DEFAULT_AUTH_BRIDGE_URL}/v1/release-attestation`;
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD =
  'bridge-prepared-receipts-v1';
export const AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST =
  '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9';

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_RECEIPT_BYTES = 8 * 1_024;
const MAX_ATTESTATION_BYTES = 16 * 1_024;
const REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const MAX_RESPONSE_AGE_MILLISECONDS = 5 * 60 * 1_000;
const MAX_RESPONSE_FUTURE_SKEW_MILLISECONDS = 60 * 1_000;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RECEIPT_FILE = /^auth-bridge-notification-prepared-[a-f0-9]{64}\.json$/u;
const TEMPORARY_FILE = /^\.auth-bridge-notification-prepared-([a-f0-9]{64})-[a-f0-9]{24}\.json\.tmp$/u;
const authenticatedPreparedReceipts = new WeakSet();

const RELEASE_SECURITY_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
});

export class AuthBridgeNotificationPreparedReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new AuthBridgeNotificationPreparedReceiptError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactOrderedKeys(value, expected) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(expected);
}

function strictUtc(value, code) {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function dateValue(value, code) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(code);
  return value.getTime();
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function ownerUid() {
  const account = userInfo();
  if (
    !account
    || typeof account.homedir !== 'string'
    || !isAbsolute(account.homedir)
    || !Number.isSafeInteger(account.uid)
    || account.uid < 0
    || (process.getuid !== undefined && process.getuid() !== account.uid)
  ) fail('AUTH_BRIDGE_PREPARED_ACCOUNT_INVALID');
  return Object.freeze({ home: resolve(account.homedir), uid: account.uid });
}

function assertPrivateDirectory(path, uid, expectedParent, code) {
  let metadata;
  let canonical;
  let followedMetadata;
  try {
    metadata = lstatSync(path);
    canonical = realpathSync(path);
    followedMetadata = statSync(path);
  } catch {
    fail(code);
  }
  if (
    !metadata.isDirectory()
    || metadata.isSymbolicLink()
    || metadata.uid !== uid
    || (followedMetadata.mode & 0o7777) !== DIRECTORY_MODE
    || canonical !== path
    || (expectedParent !== undefined && dirname(canonical) !== expectedParent)
  ) fail(code);
  return canonical;
}

function ensurePrivateChild(parent, name, uid) {
  const path = join(parent, name);
  let metadata;
  try {
    metadata = lstatSync(path);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      fail('AUTH_BRIDGE_PREPARED_STATE_CREATE_FAILED');
    }
    try {
      mkdirSync(path, { mode: DIRECTORY_MODE });
      chmodSync(path, DIRECTORY_MODE);
      fsyncReceiptDirectory(path);
      fsyncReceiptDirectory(parent);
      metadata = lstatSync(path);
    } catch {
      fail('AUTH_BRIDGE_PREPARED_STATE_CREATE_FAILED');
    }
  }
  const permissionMode = metadata.mode & 0o7777;
  if (
    permissionMode !== DIRECTORY_MODE
    && metadata.isDirectory()
    && !metadata.isSymbolicLink()
    && metadata.uid === uid
    && (permissionMode & ~DIRECTORY_MODE) === 0
  ) {
    // mkdir(2)'s requested mode is filtered by umask. If the process dies
    // before the following chmod, the exact fixed child may be an owner-only
    // subset of 0700. Repair only that no-follow/canonical private child;
    // group, other, and special bits remain a hard failure below.
    try {
      if (realpathSync(path) !== path || dirname(path) !== parent) {
        fail('AUTH_BRIDGE_PREPARED_STATE_DIRECTORY_INVALID');
      }
      chmodSync(path, DIRECTORY_MODE);
      fsyncReceiptDirectory(path);
      fsyncReceiptDirectory(parent);
    } catch (error) {
      if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
      fail('AUTH_BRIDGE_PREPARED_STATE_CREATE_FAILED');
    }
  }
  return assertPrivateDirectory(
    path,
    uid,
    parent,
    'AUTH_BRIDGE_PREPARED_STATE_DIRECTORY_INVALID',
  );
}

function assertNoRepositoryOverlap(stateRoot, repositoryRoot) {
  let repository;
  try {
    repository = realpathSync(resolve(repositoryRoot));
  } catch {
    fail('AUTH_BRIDGE_PREPARED_REPOSITORY_INVALID');
  }
  if (inside(repository, stateRoot) || inside(stateRoot, repository)) {
    fail('AUTH_BRIDGE_PREPARED_REPOSITORY_OVERLAP');
  }
}

function validateDedicatedReceiptDirectory(
  directory,
  uid,
  testOnlyBeforeEntryMetadata,
) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail('AUTH_BRIDGE_PREPARED_STATE_DIRECTORY_INVALID');
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    let metadata;
    try {
      testOnlyBeforeEntryMetadata?.(path);
      metadata = lstatSync(path);
    } catch (error) {
      // A live writer or linked-pair repair may remove an entry returned by
      // readdir before this metadata read. The vanished name has no remaining
      // authority to validate, and raw filesystem errors must never disclose
      // the owner-private receipt path to a caller or CI log.
      if (error?.code === 'ENOENT') continue;
      fail('AUTH_BRIDGE_PREPARED_STATE_NOT_DEDICATED');
    }
    const receipt = RECEIPT_FILE.test(entry.name);
    const unpublishedTemporary = TEMPORARY_FILE.test(entry.name);
    const permissionMode = metadata.mode & 0o7777;
    const safeUnpublishedMode = unpublishedTemporary
      && metadata.nlink === 1
      && (permissionMode & ~FILE_MODE) === 0;
    if (
      (!receipt && !unpublishedTemporary)
      || !entry.isFile()
      || metadata.isSymbolicLink()
      || !metadata.isFile()
      || metadata.uid !== uid
      || (receipt ? permissionMode !== FILE_MODE : !safeUnpublishedMode)
      || metadata.nlink !== 1
      || (unpublishedTemporary && metadata.size > MAX_RECEIPT_BYTES)
    ) fail('AUTH_BRIDGE_PREPARED_STATE_NOT_DEDICATED');
  }
}

function fsyncReceiptDirectory(directory) {
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0),
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function digestCanonicalReceiptFile(path, uid, expectedIdentity) {
  let descriptor;
  let bytes;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.uid !== uid
      || (before.mode & 0o7777) !== FILE_MODE
      || (before.nlink !== 1 && before.nlink !== 2)
      || before.dev !== expectedIdentity.dev
      || before.ino !== expectedIdentity.ino
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const receipt = parseAuthBridgeNotificationPreparedReceipt(JSON.parse(source));
    const canonical = receiptBytes(receipt);
    try {
      if (!bytes.equals(canonical)) {
        fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
      }
    } finally {
      canonical.fill(0);
    }
    return Object.freeze({
      digest: createHash('sha256').update(bytes).digest('hex'),
      dev: before.dev,
      ino: before.ino,
      nlink: before.nlink,
    });
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
  } finally {
    if (bytes !== undefined) bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function repairIncompleteReceiptPublications(directory, uid) {
  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    fail('AUTH_BRIDGE_PREPARED_STATE_DIRECTORY_INVALID');
  }
  for (const entry of entries) {
    const match = TEMPORARY_FILE.exec(entry.name);
    if (match === null) continue;
    const temporary = join(directory, entry.name);
    let temporaryMetadata;
    try {
      temporaryMetadata = lstatSync(temporary);
    } catch (error) {
      if (error?.code === 'ENOENT') continue;
      fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
    }
    const permissionMode = temporaryMetadata.mode & 0o7777;
    const safePermissionMode = temporaryMetadata.nlink === 1
      ? (permissionMode & ~FILE_MODE) === 0
      : permissionMode === FILE_MODE;
    if (
      !entry.isFile()
      || !temporaryMetadata.isFile()
      || temporaryMetadata.isSymbolicLink()
      || temporaryMetadata.uid !== uid
      || !safePermissionMode
      || (temporaryMetadata.nlink !== 1 && temporaryMetadata.nlink !== 2)
    ) fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');

    if (temporaryMetadata.nlink === 2) {
      const digest = match[1];
      const destination = join(
        directory,
        `auth-bridge-notification-prepared-${digest}.json`,
      );
      let destinationMetadata;
      try {
        destinationMetadata = lstatSync(destination);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
      }
      const opened = digestCanonicalReceiptFile(
        destination,
        uid,
        temporaryMetadata,
      );
      if (
        !destinationMetadata.isFile()
        || destinationMetadata.isSymbolicLink()
        || destinationMetadata.uid !== uid
        || (destinationMetadata.mode & 0o7777) !== FILE_MODE
        || (destinationMetadata.nlink !== 1 && destinationMetadata.nlink !== 2)
        || destinationMetadata.dev !== temporaryMetadata.dev
        || destinationMetadata.ino !== temporaryMetadata.ino
        || opened.digest !== digest
      ) fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
      let repaired;
      try {
        if (opened.nlink === 2) {
          try {
            unlinkSync(temporary);
          } catch (error) {
            if (error?.code !== 'ENOENT') throw error;
          }
        } else {
          try {
            lstatSync(temporary);
            fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
          } catch (error) {
            if (
              error instanceof AuthBridgeNotificationPreparedReceiptError
              || error?.code !== 'ENOENT'
            ) throw error;
          }
        }
        fsyncReceiptDirectory(directory);
        repaired = lstatSync(destination);
      } catch {
        fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
      }
      if (
        repaired.dev !== destinationMetadata.dev
        || repaired.ino !== destinationMetadata.ino
        || repaired.nlink !== 1
      ) fail('AUTH_BRIDGE_PREPARED_INCOMPLETE_INSTALL');
      continue;
    }

    // A one-link temporary has no published receipt authority. It may belong
    // to a live writer, so readers leave it inert rather than racing its write.
  }
}

function existingPrivateChild(parent, name, uid) {
  return assertPrivateDirectory(
    join(parent, name),
    uid,
    parent,
    'AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID',
  );
}

function existingPreparedReceiptDirectory({ repositoryRoot, reportedHome }) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
    fail('AUTH_BRIDGE_PREPARED_REPOSITORY_INVALID');
  }
  const account = ownerUid();
  if (
    reportedHome !== undefined
    && (typeof reportedHome !== 'string' || !isAbsolute(reportedHome))
  ) fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  const requestedHome = reportedHome === undefined
    ? account.home
    : resolve(reportedHome);
  let home;
  try {
    const metadata = lstatSync(requestedHome);
    home = realpathSync(requestedHome);
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || metadata.uid !== account.uid
      || (metadata.mode & 0o7022) !== 0
      || home !== requestedHome
    ) fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  }
  const warpkeep = existingPrivateChild(home, '.warpkeep', account.uid);
  const privateRoot = existingPrivateChild(warpkeep, 'private', account.uid);
  const productionAdmin = existingPrivateChild(
    privateRoot,
    'production-admin-v1',
    account.uid,
  );
  assertNoRepositoryOverlap(productionAdmin, repositoryRoot);
  const directory = existingPrivateChild(
    productionAdmin,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD,
    account.uid,
  );
  assertNoRepositoryOverlap(directory, repositoryRoot);
  return Object.freeze({ directory, uid: account.uid });
}

function readExistingPreparedReceipt(directory, name, uid) {
  if (!RECEIPT_FILE.test(name)) {
    fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
  }
  const path = join(directory, name);
  let descriptor;
  let bytes;
  try {
    const named = lstatSync(path);
    if (
      !named.isFile() || named.isSymbolicLink() || named.uid !== uid
      || (named.mode & 0o7777) !== FILE_MODE || named.nlink !== 1
      || named.size < 1 || named.size > MAX_RECEIPT_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile() || before.uid !== uid || (before.mode & 0o7777) !== FILE_MODE
      || before.nlink !== 1 || before.dev !== named.dev || before.ino !== named.ino
      || before.size !== named.size
    ) fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    const afterNamed = lstatSync(path);
    if (
      bytes.byteLength !== before.size || after.dev !== before.dev || after.ino !== before.ino
      || after.size !== before.size || after.mtimeMs !== before.mtimeMs
      || after.ctimeMs !== before.ctimeMs || afterNamed.dev !== before.dev
      || afterNamed.ino !== before.ino
    ) fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const receipt = parseAuthBridgeNotificationPreparedReceipt(JSON.parse(source));
    const canonical = receiptBytes(receipt);
    try {
      if (!bytes.equals(canonical)) fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    } finally {
      canonical.fill(0);
    }
    const receiptDigest = createHash('sha256').update(bytes).digest('hex');
    if (name !== `auth-bridge-notification-prepared-${receiptDigest}.json`) {
      fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    }
    return Object.freeze({ receipt, receiptDigest });
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
  } finally {
    bytes?.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/**
 * Finds one eligible existing prepared receipt without creating, repairing, or
 * accepting a caller-selected receipt path/digest. The caller supplies only the
 * already-authenticated source commit expected by the dispatcher.
 */
export function resolveExistingAuthBridgeNotificationPreparedReceipt({
  repositoryRoot,
  reportedHome,
  expectedSourceCommit,
  now = new Date(),
} = {}) {
  if (typeof expectedSourceCommit !== 'string' || !SOURCE_COMMIT.test(expectedSourceCommit)) {
    fail('AUTH_BRIDGE_PREPARED_EXPECTED_SOURCE_INVALID');
  }
  const state = existingPreparedReceiptDirectory({ repositoryRoot, reportedHome });
  let names;
  try { names = readdirSync(state.directory); } catch {
    fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
  }
  if (names.length > 64) fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
  const candidates = [];
  for (const name of names.sort()) {
    if (!RECEIPT_FILE.test(name)) {
      // A temporary or foreign file proves a concurrently mutable / non-dedicated
      // namespace. The read-only resolver must never repair it.
      fail('AUTH_BRIDGE_PREPARED_EXISTING_STATE_INVALID');
    }
    const candidate = readExistingPreparedReceipt(state.directory, name, state.uid);
    if (
      candidate.receipt.bridgeSourceCommit === expectedSourceCommit
      && Date.parse(candidate.receipt.preparedAt) <= dateValue(
        now,
        'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID',
      )
      && Date.parse(candidate.receipt.expiresAt) > dateValue(
        now,
        'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID',
      )
    ) candidates.push(candidate);
  }
  if (candidates.length !== 1) {
    fail('AUTH_BRIDGE_PREPARED_EXISTING_RECEIPT_AMBIGUOUS');
  }
  return Object.freeze(candidates[0]);
}

/**
 * Resolves the receipt directory below the OS account home, never ambient HOME.
 * `reportedHome` exists only so tests can exercise the same checks in isolation.
 */
export function ensureAuthBridgeNotificationPreparedReceiptDirectory({
  repositoryRoot,
  reportedHome,
  testOnlyBeforeDedicatedEntryMetadata,
} = {}) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
    fail('AUTH_BRIDGE_PREPARED_REPOSITORY_INVALID');
  }
  const account = ownerUid();
  if (
    reportedHome !== undefined
    && (typeof reportedHome !== 'string' || !isAbsolute(reportedHome))
  ) fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  const requestedHome = reportedHome === undefined
    ? account.home
    : resolve(reportedHome);
  let home;
  try {
    const metadata = lstatSync(requestedHome);
    home = realpathSync(requestedHome);
    if (
      !metadata.isDirectory()
      || metadata.isSymbolicLink()
      || metadata.uid !== account.uid
      || (metadata.mode & 0o7022) !== 0
      || home !== requestedHome
    ) fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');
  }
  const warpkeep = ensurePrivateChild(home, '.warpkeep', account.uid);
  const privateRoot = ensurePrivateChild(warpkeep, 'private', account.uid);
  const productionAdmin = ensurePrivateChild(
    privateRoot,
    'production-admin-v1',
    account.uid,
  );
  assertNoRepositoryOverlap(productionAdmin, repositoryRoot);
  const receipts = ensurePrivateChild(
    productionAdmin,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD,
    account.uid,
  );
  assertNoRepositoryOverlap(receipts, repositoryRoot);
  repairIncompleteReceiptPublications(receipts, account.uid);
  validateDedicatedReceiptDirectory(
    receipts,
    account.uid,
    testOnlyBeforeDedicatedEntryMetadata,
  );
  return receipts;
}

export function parseAuthBridgeNotificationPreparedReceipt(value) {
  if (!exactOrderedKeys(value, AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KEYS)) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_SHAPE_INVALID');
  }
  if (
    value.schemaVersion !== 1
    || value.kind !== AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KIND
    || value.bridgeOrigin !== DEFAULT_AUTH_BRIDGE_URL
    || typeof value.bridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(value.bridgeSourceCommit)
    || typeof value.notificationDeliveryContractDigest !== 'string'
    || !SHA256_HEX.test(value.notificationDeliveryContractDigest)
    || value.notificationDeliveryContractDigest
      !== AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST
    || value.notificationClientCount !== 1
    || typeof value.notificationDeliveryEnabled !== 'boolean'
    || value.notificationTransportConfigured !== true
    || value.admissionNotificationStoreConfigured !== true
    || typeof value.publicAuthEnabledBefore !== 'boolean'
    || typeof value.publicAuthEnabledAfter !== 'boolean'
    || value.publicAuthEnabledBefore !== value.publicAuthEnabledAfter
    || typeof value.accessExpectedFidRequiredBefore !== 'boolean'
    || typeof value.accessExpectedFidRequiredAfter !== 'boolean'
    || value.accessExpectedFidRequiredBefore
      !== value.accessExpectedFidRequiredAfter
    || value.hermesExecutionApproved !== false
    || value.pagesPresentationEnabled !== false
    || typeof value.liveAttestationDigest !== 'string'
    || !SHA256_HEX.test(value.liveAttestationDigest)
  ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_CONTRACT_INVALID');
  const preparedAt = strictUtc(
    value.preparedAt,
    'AUTH_BRIDGE_PREPARED_RECEIPT_PREPARED_TIME_INVALID',
  );
  const expiresAt = strictUtc(
    value.expiresAt,
    'AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRY_INVALID',
  );
  const lifetime = Date.parse(expiresAt) - Date.parse(preparedAt);
  if (
    lifetime <= 0
    || lifetime > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_LIFETIME_INVALID');

  return Object.freeze({
    schemaVersion: 1,
    kind: AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KIND,
    bridgeOrigin: DEFAULT_AUTH_BRIDGE_URL,
    bridgeSourceCommit: value.bridgeSourceCommit,
    notificationDeliveryContractDigest:
      value.notificationDeliveryContractDigest,
    notificationClientCount: 1,
    notificationDeliveryEnabled: value.notificationDeliveryEnabled,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: value.publicAuthEnabledBefore,
    publicAuthEnabledAfter: value.publicAuthEnabledAfter,
    accessExpectedFidRequiredBefore: value.accessExpectedFidRequiredBefore,
    accessExpectedFidRequiredAfter: value.accessExpectedFidRequiredAfter,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest: value.liveAttestationDigest,
    preparedAt,
    expiresAt,
  });
}

export function canonicalAuthBridgeReleaseAttestationDigest(attestation) {
  const parsed = parseAuthBridgeReleaseAttestation(attestation);
  return createHash('sha256').update(JSON.stringify(parsed), 'utf8').digest('hex');
}

function validateReceiptFreshness(receipt, now) {
  const current = dateValue(now, 'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID');
  if (Date.parse(receipt.preparedAt) > current) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_NOT_YET_VALID');
  }
  if (Date.parse(receipt.expiresAt) <= current) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRED');
  }
}

function receiptBytes(receipt) {
  const bytes = Buffer.from(`${JSON.stringify(receipt)}\n`, 'utf8');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_RECEIPT_BYTES) {
    bytes.fill(0);
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_SIZE_INVALID');
  }
  return bytes;
}

/** Canonical bytes/digest projection safe to bind into an owner-private WAL. */
export function canonicalAuthBridgeNotificationPreparedReceiptPublication(
  receipt,
) {
  const parsed = parseAuthBridgeNotificationPreparedReceipt(receipt);
  const bytes = receiptBytes(parsed);
  try {
    return Object.freeze({
      receiptBytesBase64: bytes.toString('base64'),
      receiptDigest: createHash('sha256').update(bytes).digest('hex'),
    });
  } finally {
    bytes.fill(0);
  }
}

function readExactReceipt(path, expectedBytes, uid) {
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.uid !== uid
      || (before.mode & 0o7777) !== FILE_MODE
      || before.nlink !== 1
      || before.size !== expectedBytes.byteLength
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_EXISTING_RECEIPT_MISMATCH');
    const actual = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || !actual.equals(expectedBytes)
    ) fail('AUTH_BRIDGE_PREPARED_EXISTING_RECEIPT_MISMATCH');
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_EXISTING_RECEIPT_MISMATCH');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Atomically installs canonical owner-only receipt bytes without replacement. */
export function writePrivateAuthBridgeNotificationPreparedReceipt({
  receipt,
  repositoryRoot,
  reportedHome,
  now = new Date(),
} = {}) {
  if (!isRecord(receipt) || !authenticatedPreparedReceipts.has(receipt)) {
    fail('AUTH_BRIDGE_PREPARED_AUTHENTICATED_PRESTATE_REQUIRED');
  }
  const parsed = parseAuthBridgeNotificationPreparedReceipt(receipt);
  validateReceiptFreshness(parsed, now);
  const bytes = receiptBytes(parsed);
  try {
    const receiptDigest = createHash('sha256').update(bytes).digest('hex');
    const directory = ensureAuthBridgeNotificationPreparedReceiptDirectory({
      repositoryRoot,
      reportedHome,
    });
    const basename = `auth-bridge-notification-prepared-${receiptDigest}.json`;
    const destination = join(directory, basename);
    const uid = ownerUid().uid;
    if (existsSync(destination)) {
      readExactReceipt(destination, bytes, uid);
      return Object.freeze({
        path: destination,
        receiptDigest,
        result: 'unchanged',
      });
    }
    const temporary = join(
      directory,
      `.${basename.slice(0, -5)}-${randomBytes(12).toString('hex')}.json.tmp`,
    );
    let descriptor;
    try {
      descriptor = openSync(
        temporary,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      let offset = 0;
      while (offset < bytes.byteLength) {
        const written = writeSync(
          descriptor,
          bytes,
          offset,
          bytes.byteLength - offset,
        );
        if (written <= 0) fail('AUTH_BRIDGE_PREPARED_RECEIPT_WRITE_FAILED');
        offset += written;
      }
      fchmodSync(descriptor, FILE_MODE);
      fsyncSync(descriptor);
      closeSync(descriptor);
      descriptor = undefined;
      try {
        linkSync(temporary, destination);
      } catch (error) {
        if (error?.code !== 'EEXIST') throw error;
        readExactReceipt(destination, bytes, uid);
      }
      try {
        unlinkSync(temporary);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      fsyncReceiptDirectory(directory);
      readExactReceipt(destination, bytes, uid);
      return Object.freeze({
        path: destination,
        receiptDigest,
        result: 'installed',
      });
    } catch (error) {
      if (descriptor !== undefined) {
        try { closeSync(descriptor); } catch { /* Preserve the fixed error. */ }
      }
      try { unlinkSync(temporary); } catch { /* Preserve the fixed error. */ }
      if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
      fail('AUTH_BRIDGE_PREPARED_RECEIPT_WRITE_FAILED');
    }
  } finally {
    bytes.fill(0);
  }
}

function exactReceiptPath(directory, receiptPath) {
  if (typeof receiptPath !== 'string' || !isAbsolute(receiptPath)) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_PATH_INVALID');
  }
  const requested = resolve(receiptPath);
  if (dirname(requested) !== directory || !RECEIPT_FILE.test(requested.slice(directory.length + 1))) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_PATH_INVALID');
  }
  return requested;
}

function exactReceiptDigest(value) {
  if (typeof value !== 'string' || !SHA256_HEX.test(value)) {
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_DIGEST_INVALID');
  }
  return value;
}

/** Strictly reads canonical bytes from the dedicated private state directory. */
export function readPrivateAuthBridgeNotificationPreparedReceipt({
  receiptPath,
  repositoryRoot,
  reportedHome,
} = {}) {
  const directory = ensureAuthBridgeNotificationPreparedReceiptDirectory({
    repositoryRoot,
    reportedHome,
  });
  const path = exactReceiptPath(directory, receiptPath);
  const uid = ownerUid().uid;
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.uid !== uid
      || (before.mode & 0o7777) !== FILE_MODE
      || before.nlink !== 1
      || before.size < 1
      || before.size > MAX_RECEIPT_BYTES
    ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_INVALID');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
    ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_CHANGED');
    let value;
    try {
      const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      value = JSON.parse(source);
      const receipt = parseAuthBridgeNotificationPreparedReceipt(value);
      const canonical = receiptBytes(receipt);
      try {
        if (!bytes.equals(canonical)) fail('AUTH_BRIDGE_PREPARED_RECEIPT_BYTES_INVALID');
      } finally {
        canonical.fill(0);
      }
      const digest = createHash('sha256').update(bytes).digest('hex');
      if (path !== join(directory, `auth-bridge-notification-prepared-${digest}.json`)) {
        fail('AUTH_BRIDGE_PREPARED_RECEIPT_FILENAME_INVALID');
      }
      return receipt;
    } catch (error) {
      if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
      fail('AUTH_BRIDGE_PREPARED_RECEIPT_JSON_INVALID');
    } finally {
      bytes.fill(0);
    }
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

async function readBoundedCanonicalReleaseAttestation(response) {
  const advertisedLength = response.headers.get('content-length');
  const contentEncoding = response.headers.get('content-encoding');
  if (
    advertisedLength !== null
    && (!/^\d+$/u.test(advertisedLength)
      || Number(advertisedLength) > MAX_ATTESTATION_BYTES)
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_SIZE_INVALID');
  if (!response.body) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_BODY_MISSING');
  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_ATTESTATION_BYTES) {
        await reader.cancel();
        fail('AUTH_BRIDGE_PREPARED_ATTESTATION_SIZE_INVALID');
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
    fail('AUTH_BRIDGE_PREPARED_ATTESTATION_BODY_INVALID');
  } finally {
    reader.releaseLock();
  }
  // Fetch exposes decoded bytes, while Cloudflare may retain the compressed
  // wire Content-Length. Both lengths stay independently bounded, but equality
  // is meaningful only when no content coding was applied (or it is identity).
  if (
    advertisedLength !== null
    && (
      contentEncoding === null
      || /^identity$/iu.test(contentEncoding)
    )
    && Number(advertisedLength) !== totalBytes
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_SIZE_INVALID');
  const bytes = Buffer.alloc(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    let source;
    let value;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      if (Buffer.byteLength(source, 'utf8') !== bytes.byteLength) {
        fail('AUTH_BRIDGE_PREPARED_ATTESTATION_BYTES_INVALID');
      }
      value = JSON.parse(source);
    } catch (error) {
      if (error instanceof AuthBridgeNotificationPreparedReceiptError) throw error;
      fail('AUTH_BRIDGE_PREPARED_ATTESTATION_JSON_INVALID');
    }
    let attestation;
    try {
      attestation = parseAuthBridgeReleaseAttestation(value);
    } catch {
      fail('AUTH_BRIDGE_PREPARED_ATTESTATION_CONTRACT_INVALID');
    }
    const canonical = JSON.stringify(attestation);
    if (source !== canonical) {
      fail('AUTH_BRIDGE_PREPARED_ATTESTATION_BYTES_INVALID');
    }
    return Object.freeze({
      attestation,
      digest: createHash('sha256').update(canonical, 'utf8').digest('hex'),
    });
  } finally {
    bytes.fill(0);
  }
}

function validateFreshResponse(response, now) {
  if (
    !response.ok
    || response.status !== 200
    || response.redirected
    || response.url !== AUTH_BRIDGE_RELEASE_ATTESTATION_URL
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_RESPONSE_INVALID');
  for (const [name, expected] of Object.entries(RELEASE_SECURITY_HEADERS)) {
    if (response.headers.get(name) !== expected) {
      fail('AUTH_BRIDGE_PREPARED_ATTESTATION_HEADERS_INVALID');
    }
  }
  for (const [name] of response.headers) {
    if (
      name.startsWith('access-control-')
      || name === 'location'
      || name === 'set-cookie'
      || name === 'age'
      || name === 'warning'
    ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_HEADERS_INVALID');
  }
  const date = response.headers.get('date');
  const current = dateValue(now, 'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID');
  if (
    date === null
    || new Date(Date.parse(date)).toUTCString() !== date
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_DATE_INVALID');
  const responseTime = Date.parse(date);
  if (
    Number.isNaN(responseTime)
    || responseTime > current + MAX_RESPONSE_FUTURE_SKEW_MILLISECONDS
    || current - responseTime > MAX_RESPONSE_AGE_MILLISECONDS
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_NOT_FRESH');
  return date;
}

/** Performs a new, credential-free, cache-bypassing GET to the exact bridge URL. */
export async function fetchFreshAuthBridgeReleaseAttestation({
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  dateValue(now, 'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID');
  const endpoint = new URL(AUTH_BRIDGE_RELEASE_ATTESTATION_URL);
  if (
    endpoint.protocol !== 'https:'
    || endpoint.hostname !== 'auth.warpkeep.com'
    || endpoint.host !== 'auth.warpkeep.com'
    || endpoint.username
    || endpoint.password
    || endpoint.search
    || endpoint.hash
    || endpoint.pathname !== '/v1/release-attestation'
  ) fail('AUTH_BRIDGE_PREPARED_ATTESTATION_ENDPOINT_INVALID');
  let response;
  try {
    response = await fetchImpl(endpoint, {
      method: 'GET',
      headers: {
        accept: 'application/json',
        'cache-control': 'no-store',
      },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MILLISECONDS),
    });
  } catch {
    fail('AUTH_BRIDGE_PREPARED_ATTESTATION_UNREACHABLE');
  }
  if (!(response instanceof Response)) {
    fail('AUTH_BRIDGE_PREPARED_ATTESTATION_RESPONSE_INVALID');
  }
  const responseDate = validateFreshResponse(response, now);
  const document = await readBoundedCanonicalReleaseAttestation(response);
  return Object.freeze({ ...document, responseDate });
}

function currentDate(clock) {
  if (typeof clock !== 'function') fail('AUTH_BRIDGE_PREPARED_CLOCK_INVALID');
  const value = clock();
  dateValue(value, 'AUTH_BRIDGE_PREPARED_VERIFICATION_TIME_INVALID');
  return value;
}

/**
 * Constructs a writable receipt only around authenticated PRE/POST private
 * attestations and a caller-supplied deployment operation. The administrator
 * credential is never passed to that operation.
 */
async function prepareAuthBridgeNotificationReceipt({
  adminToken,
  deploy,
  expectedBridgeSourceCommit,
  expectedPredecessorBridgeSourceCommit = expectedBridgeSourceCommit,
  fetchImpl = fetch,
  clock = () => new Date(),
  lifetimeMilliseconds =
    AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS,
} = {}, {
  verifyPredeployAttestation,
  verifyPostdeployAttestation,
  expectedPtrSpacetimeDbDatabase,
  expectedNotificationDeliveryEnabled,
}) {
  if (typeof deploy !== 'function') {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_OPERATION_REQUIRED');
  }
  if (
    typeof expectedBridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(expectedBridgeSourceCommit)
    || typeof expectedPredecessorBridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(expectedPredecessorBridgeSourceCommit)
  ) fail('AUTH_BRIDGE_PREPARED_EXPECTED_SOURCE_INVALID');
  if (
    !Number.isSafeInteger(lifetimeMilliseconds)
    || lifetimeMilliseconds <= 0
    || lifetimeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_LIFETIME_INVALID');
  const operationStartedAt = currentDate(clock).getTime();
  const before = await verifyPredeployAttestation({
    bridgeUrl: DEFAULT_AUTH_BRIDGE_URL,
    adminToken,
    fetchImpl,
    ...(expectedPtrSpacetimeDbDatabase === undefined
      ? {}
      : { expectedPtrSpacetimeDbDatabase }),
  });
  const beforeModes = Object.freeze({
    bridgeSourceCommit: expectedPredecessorBridgeSourceCommit,
    publicAuthEnabled: before.publicAuthEnabled,
    accessExpectedFidRequired: before.accessExpectedFidRequired,
  });

  await deploy(beforeModes);

  const after = await verifyPostdeployAttestation({
    bridgeUrl: DEFAULT_AUTH_BRIDGE_URL,
    adminToken,
    fetchImpl,
    ...(expectedPtrSpacetimeDbDatabase === undefined
      ? {}
      : { expectedPtrSpacetimeDbDatabase }),
  });
  if (
    after.notificationDeliveryEnabled !== expectedNotificationDeliveryEnabled
    || after.notificationTransportConfigured !== true
    || after.notificationClientCount !== 1
    || after.publicAuthEnabled !== beforeModes.publicAuthEnabled
    || after.accessExpectedFidRequired
      !== beforeModes.accessExpectedFidRequired
  ) fail('AUTH_BRIDGE_PREPARED_PRIVATE_POSTSTATE_INVALID');

  const verificationTime = currentDate(clock);
  if (verificationTime.getTime() < operationStartedAt) {
    fail('AUTH_BRIDGE_PREPARED_CLOCK_NOT_MONOTONIC');
  }
  const live = await fetchFreshAuthBridgeReleaseAttestation({
    fetchImpl,
    now: verificationTime,
  });
  if (
    live.attestation.bridgeSourceCommit !== expectedBridgeSourceCommit
    || live.attestation.notificationDeliveryEnabled
      !== expectedNotificationDeliveryEnabled
    || live.attestation.notificationDeliveryContractDigest
      !== AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST
    || live.attestation.publicAuthEnabled !== beforeModes.publicAuthEnabled
    || live.attestation.accessExpectedFidRequired
      !== beforeModes.accessExpectedFidRequired
  ) fail('AUTH_BRIDGE_PREPARED_PUBLIC_POSTSTATE_INVALID');

  const preparedTime = currentDate(clock);
  if (preparedTime.getTime() < verificationTime.getTime()) {
    fail('AUTH_BRIDGE_PREPARED_CLOCK_NOT_MONOTONIC');
  }
  const preparedAt = preparedTime.toISOString();
  const expiry = new Date(
    Date.parse(preparedAt) + lifetimeMilliseconds,
  ).toISOString();
  const receipt = parseAuthBridgeNotificationPreparedReceipt({
    schemaVersion: 1,
    kind: AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KIND,
    bridgeOrigin: DEFAULT_AUTH_BRIDGE_URL,
    bridgeSourceCommit: live.attestation.bridgeSourceCommit,
    notificationDeliveryContractDigest:
      live.attestation.notificationDeliveryContractDigest,
    notificationClientCount: live.attestation.notificationClientCount,
    notificationDeliveryEnabled: live.attestation.notificationDeliveryEnabled,
    notificationTransportConfigured:
      live.attestation.notificationTransportConfigured,
    admissionNotificationStoreConfigured:
      live.attestation.admissionNotificationStoreConfigured,
    publicAuthEnabledBefore: beforeModes.publicAuthEnabled,
    publicAuthEnabledAfter: live.attestation.publicAuthEnabled,
    accessExpectedFidRequiredBefore: beforeModes.accessExpectedFidRequired,
    accessExpectedFidRequiredAfter:
      live.attestation.accessExpectedFidRequired,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest: live.digest,
    preparedAt,
    expiresAt: expiry,
  });
  authenticatedPreparedReceipts.add(receipt);
  return receipt;
}

export function prepareAuthBridgeNotificationPreparedReceipt(options) {
  return prepareAuthBridgeNotificationReceipt(options, {
    verifyPredeployAttestation:
      verifyAuthBridgePreparedPredeployRpcRoleAttestation,
    verifyPostdeployAttestation: verifyAuthBridgePreparedRpcRoleAttestation,
    expectedPtrSpacetimeDbDatabase:
      options?.expectedPtrSpacetimeDbDatabase,
    expectedNotificationDeliveryEnabled: false,
  });
}

export function prepareAuthBridgeNotificationB0Receipt(options) {
  return prepareAuthBridgeNotificationReceipt(options, {
    verifyPredeployAttestation:
      verifyAuthBridgeNotificationB0RpcRoleAttestation,
    verifyPostdeployAttestation:
      verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation,
    expectedNotificationDeliveryEnabled: true,
  });
}

/**
 * Re-authenticates one exact WAL-bound receipt against current private and
 * public bridge state before a recovery process may publish its bytes.
 */
export async function authenticateAuthBridgeNotificationPreparedReceiptForPublication({
  receipt,
  adminToken,
  expectedBridgeSourceCommit,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const parsed = parseAuthBridgeNotificationPreparedReceipt(receipt);
  validateReceiptFreshness(parsed, now);
  if (
    typeof expectedBridgeSourceCommit !== 'string'
    || !SOURCE_COMMIT.test(expectedBridgeSourceCommit)
    || parsed.bridgeSourceCommit !== expectedBridgeSourceCommit
  ) fail('AUTH_BRIDGE_PREPARED_EXPECTED_SOURCE_INVALID');
  const privateAttestation = await verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation({
    bridgeUrl: DEFAULT_AUTH_BRIDGE_URL,
    adminToken,
    fetchImpl,
  });
  if (
    privateAttestation.notificationDeliveryEnabled
      !== parsed.notificationDeliveryEnabled
    || privateAttestation.notificationTransportConfigured !== true
    || privateAttestation.notificationClientCount !== 1
    || privateAttestation.publicAuthEnabled !== parsed.publicAuthEnabledAfter
    || privateAttestation.accessExpectedFidRequired
      !== parsed.accessExpectedFidRequiredAfter
  ) fail('AUTH_BRIDGE_PREPARED_PRIVATE_POSTSTATE_INVALID');
  const live = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
  bindReceiptToAttestation(parsed, live);
  authenticatedPreparedReceipts.add(parsed);
  return parsed;
}

function bindReceiptToAttestation(receipt, live) {
  const attestation = live.attestation;
  if (
    receipt.bridgeOrigin !== DEFAULT_AUTH_BRIDGE_URL
    || receipt.bridgeSourceCommit !== attestation.bridgeSourceCommit
    || receipt.notificationDeliveryContractDigest
      !== attestation.notificationDeliveryContractDigest
    || receipt.notificationClientCount !== attestation.notificationClientCount
    || receipt.notificationDeliveryEnabled
      !== attestation.notificationDeliveryEnabled
    || receipt.notificationTransportConfigured
      !== attestation.notificationTransportConfigured
    || receipt.admissionNotificationStoreConfigured
      !== attestation.admissionNotificationStoreConfigured
    || receipt.publicAuthEnabledBefore !== attestation.publicAuthEnabled
    || receipt.publicAuthEnabledAfter !== attestation.publicAuthEnabled
    || receipt.accessExpectedFidRequiredBefore
      !== attestation.accessExpectedFidRequired
    || receipt.accessExpectedFidRequiredAfter
      !== attestation.accessExpectedFidRequired
    || receipt.liveAttestationDigest !== live.digest
  ) fail('AUTH_BRIDGE_PREPARED_RECEIPT_LIVE_MISMATCH');
}

/** Re-fetches live evidence, cross-binds every release field, and checks expiry. */
export async function verifyAuthBridgeNotificationPreparedReceipt({
  receipt,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const parsed = parseAuthBridgeNotificationPreparedReceipt(receipt);
  validateReceiptFreshness(parsed, now);
  const live = await fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now });
  bindReceiptToAttestation(parsed, live);
  return Object.freeze({ receipt: parsed, liveAttestation: live.attestation });
}

/** Strict private read followed by the same fresh live cross-binding verifier. */
export async function inspectPrivateAuthBridgeNotificationPreparedReceipt({
  receiptPath,
  repositoryRoot,
  reportedHome,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const receipt = readPrivateAuthBridgeNotificationPreparedReceipt({
    receiptPath,
    repositoryRoot,
    reportedHome,
  });
  return verifyAuthBridgeNotificationPreparedReceipt({ receipt, fetchImpl, now });
}

/**
 * Resolves only the exact content-addressed receipt named by `receiptDigest`,
 * then performs the same strict private-file and fresh public-attestation
 * checks as the path-based inspector.
 */
export async function inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest({
  receiptDigest,
  repositoryRoot,
  reportedHome,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  const digest = exactReceiptDigest(receiptDigest);
  const directory = ensureAuthBridgeNotificationPreparedReceiptDirectory({
    repositoryRoot,
    reportedHome,
  });
  const inspected = await inspectPrivateAuthBridgeNotificationPreparedReceipt({
    receiptPath: join(
      directory,
      `auth-bridge-notification-prepared-${digest}.json`,
    ),
    repositoryRoot,
    reportedHome,
    fetchImpl,
    now,
  });
  return Object.freeze({
    receipt: inspected.receipt,
    liveAttestation: inspected.liveAttestation,
    receiptDigest: digest,
  });
}
