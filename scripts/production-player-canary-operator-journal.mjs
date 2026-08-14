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
import { isAbsolute, join, relative, resolve, sep } from 'node:path';

import {
  canonicalProductionAdminAccountHome,
  ensureCanonicalProductionAdminStateDirectory,
} from './production-admin-token-budget.mjs';

export const PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE =
  'warpkeep-production-player-canary-operator-journal-v1';
export const PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD =
  'production-player-canary-operator-journal-v1';
export const PRODUCTION_PLAYER_CANARY_OPERATOR_PHASES = Object.freeze([
  'prepared',
  'baseline-submit-intent',
  'baseline-submission-uncertain',
  'baseline-absence-observed',
  'baseline-reconciled',
  'owner-approval-install-intent',
  'owner-approval-installed',
  'approval-submit-intent',
  'approval-submission-uncertain',
  'approval-absence-observed',
  'approval-reconciled',
  'awaiting-authoritative-evidence',
  'receipt-install-intent',
  'receipt-install-not-published',
  'receipt-installed',
]);

const PHASE_SET = new Set(PRODUCTION_PLAYER_CANARY_OPERATOR_PHASES);
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const MAX_FILE_BYTES = 128 * 1024;
const MAX_DIRECTORY_ENTRIES = 512;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const ID = /^[0-9a-f]{32}$/u;
const REFERENCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}\.json$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RECORD_FILE = /^production-player-canary-operator-([0-9a-f]{32})-([0-9]{8})-([a-z-]+)\.json$/u;
const LOCK_FILE = '.production-player-canary-operator.lock';
const TEMPORARY_FILE = /^\.(.+\.json)\.([0-9a-f]{24})\.tmp$/u;
const RECORD_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'operationId', 'sequence', 'phase',
  'previousRecordDigest', 'recordedAt', 'payload',
]);
const CONTRACT_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'operationId', 'evidenceNonce',
  'reviewedAdmissionClaimDigest', 'subjectCommitment',
  'repositoryRoot', 'protectedCommit', 'protectedTree',
  'founderPlanDirectory', 'reviewedAdmissionPlanReference',
  'ownerApprovalDirectory', 'receiptDirectory',
]);
const JOURNALED_CONTRACT_KEYS = Object.freeze(
  CONTRACT_KEYS.filter(key => key !== 'evidenceNonce'),
);

export class ProductionPlayerCanaryOperatorJournalError extends Error {
  constructor(code, disposition = 'halt', cause) {
    super(code);
    this.name = 'ProductionPlayerCanaryOperatorJournalError';
    this.code = code;
    this.disposition = disposition;
    if (cause !== undefined) Object.defineProperty(this, 'cause', {
      value: cause,
      configurable: false,
      enumerable: false,
      writable: false,
    });
  }
}

function fail(code, disposition = 'halt', cause) {
  throw new ProductionPlayerCanaryOperatorJournalError(code, disposition, cause);
}

function exactOwnDataKeys(value, keys, ordered) {
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
  ) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some(key => typeof key !== 'string')) return false;
  const compared = ordered ? ownKeys : [...ownKeys].sort();
  const expected = ordered ? keys : [...keys].sort();
  if (compared.join('\0') !== expected.join('\0')) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return ownKeys.every(key => {
    const descriptor = descriptors[key];
    return descriptor.enumerable === true
      && Object.hasOwn(descriptor, 'value')
      && !Object.hasOwn(descriptor, 'get')
      && !Object.hasOwn(descriptor, 'set');
  });
}

function exactRecord(value, keys, code) {
  if (
    !exactOwnDataKeys(value, keys, true)
  ) fail(code);
  return value;
}

function exactKeysUnordered(value, keys, code) {
  if (
    !exactOwnDataKeys(value, keys, false)
  ) fail(code);
  return value;
}

function canonicalValue(value, depth = 0) {
  if (depth > 32) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_VALUE_INVALID');
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'boolean'
  ) return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_VALUE_INVALID');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    return Object.freeze({ __warpkeepBigInt: value.toString() });
  }
  if (Array.isArray(value)) {
    return value.map(item => canonicalValue(item, depth + 1));
  }
  if (typeof value !== 'object') {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_VALUE_INVALID');
  }
  const output = {};
  for (const key of Object.keys(value).sort()) {
    if (
      key.length < 1
      || key.length > 128
      || key === '__proto__'
      || key === 'prototype'
      || key === 'constructor'
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_VALUE_INVALID');
    output[key] = canonicalValue(value[key], depth + 1);
  }
  return output;
}

function canonicalBytes(value) {
  const bytes = Buffer.from(`${JSON.stringify(canonicalValue(value))}\n`, 'utf8');
  if (bytes.byteLength < 2 || bytes.byteLength > MAX_FILE_BYTES) {
    bytes.fill(0);
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_VALUE_INVALID');
  }
  return bytes;
}

function digestBytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function digestValue(value) {
  const bytes = canonicalBytes(value);
  try { return digestBytes(bytes); } finally { bytes.fill(0); }
}

function framed(values) {
  return values.map(value => {
    const text = value.toString();
    return `${Buffer.byteLength(text, 'utf8')}:${text}`;
  }).join('|');
}

export function productionPlayerCanaryOperatorConfirmationDigest({
  operationId,
  action,
  attempt,
  effectDigest,
} = {}) {
  if (
    typeof operationId !== 'string'
    || !ID.test(operationId)
    || ![
      'capture-baseline', 'install-owner-approval', 'register-approval',
    ].includes(action)
    || !Number.isSafeInteger(attempt)
    || attempt < 1
    || attempt > 8
    || typeof effectDigest !== 'string'
    || !SHA256.test(effectDigest)
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_CONFIRMATION_INPUT_INVALID');
  return createHash('sha256').update(`${framed([
    'warpkeep.production-player-canary.operator-confirmation.v1',
    operationId,
    action,
    attempt,
    effectDigest,
  ])}\n`, 'utf8').digest('hex');
}

export function productionPlayerCanaryOperatorEffectDigest(value) {
  return digestValue(value);
}

function randomId(size, randomBytesImpl = randomBytes) {
  const bytes = randomBytesImpl(size);
  if (!Buffer.isBuffer(bytes) || bytes.byteLength !== size) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RANDOM_INVALID');
  }
  return bytes.toString('hex');
}

function canonicalInstant(now) {
  const value = now instanceof Date ? now : new Date(now);
  if (
    !Number.isSafeInteger(value.getTime())
    || !STRICT_UTC.test(value.toISOString())
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_CLOCK_INVALID');
  return value.toISOString();
}

function fsyncDirectory(directory) {
  let descriptor;
  try {
    descriptor = openSync(
      directory,
      constants.O_RDONLY | (constants.O_DIRECTORY ?? 0)
        | (constants.O_NOFOLLOW ?? 0),
    );
    fsyncSync(descriptor);
  } catch (cause) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FSYNC_FAILED', 'halt', cause);
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

function ensurePrivateDirectory(path, parent) {
  const requested = resolve(path);
  if (!inside(parent, requested) || requested === parent) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  }
  if (!existsSync(requested)) {
    try {
      mkdirSync(requested, { mode: DIRECTORY_MODE });
      chmodSync(requested, DIRECTORY_MODE);
      fsyncDirectory(parent);
    } catch (cause) {
      fail(
        'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID',
        'halt',
        cause,
      );
    }
  }
  try {
    const status = lstatSync(requested);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (status.mode & 0o7777) !== DIRECTORY_MODE
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || realpathSync(requested) !== requested
      || realpathSync(join(requested, '..')) !== parent
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOperatorJournalError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  }
  return requested;
}

function journalDirectory(reportedHome) {
  const parent = ensureCanonicalProductionAdminStateDirectory(reportedHome);
  return ensurePrivateDirectory(
    join(parent, PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD),
    parent,
  );
}

function existingPrivateDirectory(path, parent) {
  const requested = resolve(path);
  try {
    const status = lstatSync(requested, { bigint: true });
    if (
      requested === parent
      || !inside(parent, requested)
      || !status.isDirectory()
      || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined
        && status.uid !== BigInt(process.getuid()))
      || realpathSync(requested) !== requested
      || realpathSync(join(requested, '..')) !== parent
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOperatorJournalError) throw error;
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  }
  return requested;
}

function existingJournalDirectory(reportedHome) {
  const home = canonicalProductionAdminAccountHome(reportedHome);
  let parent = home;
  for (const name of [
    '.warpkeep',
    'private',
    'production-admin-v1',
    PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_STATE_CHILD,
  ]) parent = existingPrivateDirectory(join(parent, name), parent);
  return parent;
}

function sameFile(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.uid === right.uid
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function readExactFile(path, expectedLinks = 1n) {
  let descriptor;
  try {
    const named = lstatSync(path, { bigint: true });
    if (
      !named.isFile()
      || named.isSymbolicLink()
      || named.nlink !== expectedLinks
      || (named.mode & 0o7777n) !== 0o600n
      || named.size < 2n
      || named.size > BigInt(MAX_FILE_BYTES)
      || (process.getuid !== undefined && named.uid !== BigInt(process.getuid()))
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (!sameFile(named, before)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_CHANGED');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (!sameFile(before, after) || !sameFile(before, current)) {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_CHANGED');
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryOperatorJournalError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function recognizedDestination(name) {
  return RECORD_FILE.test(name);
}

function reconcileTemporaries(directory) {
  const names = readdirSync(directory).sort();
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_CONTENT_INVALID');
  }
  for (const name of names) {
    const match = TEMPORARY_FILE.exec(name);
    if (match === null) continue;
    const destinationName = match[1];
    if (!recognizedDestination(destinationName)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_CONTENT_INVALID');
    }
    const temporary = join(directory, name);
    const status = lstatSync(temporary, { bigint: true });
    if (status.nlink === 1n) {
      if (
        !status.isFile()
        || status.isSymbolicLink()
        || ((status.mode & 0o7777n) & ~0o600n) !== 0n
        || status.size > BigInt(MAX_FILE_BYTES)
        || (process.getuid !== undefined
          && status.uid !== BigInt(process.getuid()))
      ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_INVALID');
      unlinkSync(temporary);
      fsyncDirectory(directory);
      continue;
    }
    if (status.nlink !== 2n) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_INVALID');
    }
    const destination = join(directory, destinationName);
    const destinationStatus = lstatSync(destination, { bigint: true });
    if (!sameFile(status, destinationStatus)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_INVALID');
    }
    const temporaryBytes = readExactFile(temporary, 2n);
    const destinationBytes = readExactFile(destination, 2n);
    try {
      if (!temporaryBytes.equals(destinationBytes)) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_CHANGED');
      }
    } finally {
      temporaryBytes.fill(0);
      destinationBytes.fill(0);
    }
    unlinkSync(temporary);
    fsyncDirectory(directory);
  }
}

function installImmutable(directory, destinationName, value, randomBytesImpl) {
  if (!recognizedDestination(destinationName)) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILENAME_INVALID');
  }
  const destination = join(directory, destinationName);
  const bytes = canonicalBytes(value);
  const temporaryName = `.${destinationName}.${randomId(12, randomBytesImpl)}.tmp`;
  const temporary = join(directory, temporaryName);
  let descriptor;
  let linked = false;
  try {
    if (existsSync(destination)) {
      const existing = readExactFile(destination);
      try {
        if (!existing.equals(bytes)) {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_CONFLICT');
        }
      } finally { existing.fill(0); }
      return Object.freeze({ path: destination, digest: digestBytes(bytes) });
    }
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0),
      FILE_MODE,
    );
    let offset = 0;
    while (offset < bytes.byteLength) {
      const count = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
      if (count < 1) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_WRITE_FAILED');
      offset += count;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    chmodSync(temporary, FILE_MODE);
    try {
      linkSync(temporary, destination);
      linked = true;
      fsyncDirectory(directory);
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      const existing = readExactFile(destination);
      try {
        if (!existing.equals(bytes)) {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_CONFLICT');
        }
      } finally { existing.fill(0); }
    }
    unlinkSync(temporary);
    linked = false;
    fsyncDirectory(directory);
    const installed = readExactFile(destination);
    try {
      if (!installed.equals(bytes)) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_FILE_CHANGED');
      }
    } finally { installed.fill(0); }
    return Object.freeze({ path: destination, digest: digestBytes(bytes) });
  } catch (error) {
    if (!linked) {
      try { unlinkSync(temporary); } catch { /* Preserve the primary result. */ }
    }
    if (error instanceof ProductionPlayerCanaryOperatorJournalError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_WRITE_FAILED', 'halt', error);
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseReference(value) {
  const reference = exactKeysUnordered(
    value,
    ['filename', 'sha256'],
    'PRODUCTION_PLAYER_CANARY_OPERATOR_CONTRACT_INVALID',
  );
  if (
    typeof reference.filename !== 'string'
    || !REFERENCE_NAME.test(reference.filename)
    || typeof reference.sha256 !== 'string'
    || !SHA256.test(reference.sha256)
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_CONTRACT_INVALID');
  return Object.freeze({
    filename: reference.filename,
    sha256: reference.sha256,
  });
}

function journaledContract(contract) {
  return Object.freeze(Object.fromEntries(
    JOURNALED_CONTRACT_KEYS.map(key => [key, contract[key]]),
  ));
}

function parseJournaledContract(value) {
  const contract = exactKeysUnordered(
    value,
    JOURNALED_CONTRACT_KEYS,
    'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID',
  );
  return journaledContract(parseProductionPlayerCanaryOperatorContract({
    ...contract,
    evidenceNonce: '0'.repeat(64),
  }));
}

export function parseProductionPlayerCanaryOperatorContract(value) {
  const contract = exactKeysUnordered(
    value,
    CONTRACT_KEYS,
    'PRODUCTION_PLAYER_CANARY_OPERATOR_CONTRACT_INVALID',
  );
  if (
    contract.schemaVersion !== 1
    || contract.profile !== 'warpkeep-production-player-canary-operator-v1'
    || typeof contract.operationId !== 'string'
    || !ID.test(contract.operationId)
    || typeof contract.evidenceNonce !== 'string'
    || !SHA256.test(contract.evidenceNonce)
    || typeof contract.reviewedAdmissionClaimDigest !== 'string'
    || !SHA256.test(contract.reviewedAdmissionClaimDigest)
    || typeof contract.subjectCommitment !== 'string'
    || !SHA256.test(contract.subjectCommitment)
    || typeof contract.protectedCommit !== 'string'
    || !COMMIT.test(contract.protectedCommit)
    || typeof contract.protectedTree !== 'string'
    || !COMMIT.test(contract.protectedTree)
    || [
      contract.repositoryRoot,
      contract.founderPlanDirectory,
      contract.ownerApprovalDirectory,
      contract.receiptDirectory,
    ].some(path => typeof path !== 'string'
      || !isAbsolute(path)
      || resolve(path) !== path)
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_CONTRACT_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: contract.profile,
    operationId: contract.operationId,
    evidenceNonce: contract.evidenceNonce,
    reviewedAdmissionClaimDigest: contract.reviewedAdmissionClaimDigest,
    subjectCommitment: contract.subjectCommitment,
    repositoryRoot: contract.repositoryRoot,
    protectedCommit: contract.protectedCommit,
    protectedTree: contract.protectedTree,
    founderPlanDirectory: contract.founderPlanDirectory,
    reviewedAdmissionPlanReference:
      parseReference(contract.reviewedAdmissionPlanReference),
    ownerApprovalDirectory: contract.ownerApprovalDirectory,
    receiptDirectory: contract.receiptDirectory,
  });
}

function recordFilename(record) {
  return `production-player-canary-operator-${record.operationId}-${String(
    record.sequence,
  ).padStart(8, '0')}-${record.phase}.json`;
}

function validTransition(previous, phase) {
  if (previous === null) return phase === 'prepared';
  const allowed = {
    prepared: ['baseline-submit-intent'],
    'baseline-submit-intent': [
      'baseline-submission-uncertain',
      'baseline-absence-observed',
      'baseline-reconciled',
    ],
    'baseline-submission-uncertain': [
      'baseline-absence-observed',
      'baseline-reconciled',
    ],
    'baseline-absence-observed': ['baseline-submit-intent'],
    'baseline-reconciled': ['owner-approval-install-intent'],
    'owner-approval-install-intent': ['owner-approval-installed'],
    'owner-approval-installed': ['approval-submit-intent'],
    'approval-submit-intent': [
      'approval-submission-uncertain',
      'approval-absence-observed',
      'approval-reconciled',
    ],
    'approval-submission-uncertain': [
      'approval-absence-observed',
      'approval-reconciled',
    ],
    'approval-absence-observed': ['approval-submit-intent'],
    'approval-reconciled': ['awaiting-authoritative-evidence'],
    'awaiting-authoritative-evidence': ['receipt-install-intent'],
    'receipt-install-intent': [
      'receipt-install-not-published',
      'receipt-installed',
    ],
    'receipt-install-not-published': ['receipt-install-intent'],
    'receipt-installed': [],
  };
  return allowed[previous]?.includes(phase) === true;
}

function exactPayloadKeys(payload, keys) {
  return exactKeysUnordered(
    payload,
    keys,
    'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID',
  );
}

function validReferencePayload(value) {
  try { parseReference(value); return true; } catch { return false; }
}

function validatePayload(phase, payload, previous) {
  if (phase === 'prepared') {
    const value = exactPayloadKeys(payload, ['contract', 'contractDigest']);
    if (typeof value.contractDigest !== 'string' || !SHA256.test(value.contractDigest)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    }
    return Object.freeze({
      contract: parseJournaledContract(value.contract),
      contractDigest: value.contractDigest,
    });
  }
  if (phase.endsWith('-submit-intent')) {
    const value = exactPayloadKeys(payload, [
      'attempt', 'argumentsDigest', 'confirmationDigest',
    ]);
    if (
      !Number.isSafeInteger(value.attempt)
      || value.attempt < 1
      || value.attempt > 8
      || typeof value.argumentsDigest !== 'string'
      || !SHA256.test(value.argumentsDigest)
      || typeof value.confirmationDigest !== 'string'
      || !SHA256.test(value.confirmationDigest)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase.endsWith('-submission-uncertain')) {
    const value = exactPayloadKeys(payload, [
      'attempt', 'argumentsDigest', 'confirmationDigest',
    ]);
    if (
      previous === null
      || value.attempt !== previous.payload.attempt
      || value.argumentsDigest !== previous.payload.argumentsDigest
      || value.confirmationDigest !== previous.payload.confirmationDigest
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase.endsWith('-absence-observed')) {
    const value = exactPayloadKeys(payload, [
      'attempt', 'argumentsDigest', 'disposition',
    ]);
    if (
      previous === null
      || value.attempt !== previous.payload.attempt
      || value.argumentsDigest !== previous.payload.argumentsDigest
      || value.disposition !== 'explicit-operator-retry-required'
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase === 'baseline-reconciled') {
    const value = exactPayloadKeys(payload, [
      'attempt', 'challengeDigest', 'reviewedAdmissionPlanDigest',
      'serverBaselineCommitment', 'routeSetCommitment', 'capturedAtMicros',
      'submissionOutcome',
    ]);
    if (
      !Number.isSafeInteger(value.attempt)
      || value.attempt < 1
      || [
        value.challengeDigest,
        value.reviewedAdmissionPlanDigest,
        value.serverBaselineCommitment,
        value.routeSetCommitment,
      ].some(candidate => typeof candidate !== 'string' || !SHA256.test(candidate))
      || typeof value.capturedAtMicros !== 'string'
      || !/^[1-9][0-9]{0,19}$/u.test(value.capturedAtMicros)
      || ![
        'capture-acknowledged', 'existing-row-after-write-not-started',
        'row-reconciled-after-submission-error', 'existing-row-reacquired',
      ].includes(value.submissionOutcome)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase === 'owner-approval-install-intent') {
    const value = exactPayloadKeys(payload, [
      'reference', 'approvalCommitment', 'routeSetCommitment',
      'commandSetCommitment', 'confirmationDigest',
    ]);
    if (!validReferencePayload(value.reference)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    }
    for (const key of [
      'approvalCommitment', 'routeSetCommitment', 'commandSetCommitment',
      'confirmationDigest',
    ]) {
      if (typeof value[key] !== 'string' || !SHA256.test(value[key])) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
      }
    }
    return Object.freeze({ ...value, reference: Object.freeze({ ...value.reference }) });
  }
  if (phase === 'owner-approval-installed') {
    const value = exactPayloadKeys(payload, [
      'reference', 'approvalCommitment', 'routeSetCommitment',
      'commandSetCommitment',
    ]);
    if (
      previous?.phase !== 'owner-approval-install-intent'
      || !validReferencePayload(value.reference)
      || JSON.stringify(value.reference) !== JSON.stringify(previous.payload.reference)
      || value.approvalCommitment !== previous.payload.approvalCommitment
      || value.routeSetCommitment !== previous.payload.routeSetCommitment
      || value.commandSetCommitment !== previous.payload.commandSetCommitment
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value, reference: Object.freeze({ ...value.reference }) });
  }
  if (phase === 'approval-reconciled') {
    const value = exactPayloadKeys(payload, [
      'attempt', 'approvalRegistrationCommitment', 'routeSetCommitment',
      'commandSetCommitment', 'registeredAtMicros', 'submissionOutcome',
    ]);
    if (
      !Number.isSafeInteger(value.attempt)
      || value.attempt < 1
      || [
        value.approvalRegistrationCommitment,
        value.routeSetCommitment,
        value.commandSetCommitment,
      ].some(candidate => typeof candidate !== 'string' || !SHA256.test(candidate))
      || typeof value.registeredAtMicros !== 'string'
      || !/^[1-9][0-9]{0,19}$/u.test(value.registeredAtMicros)
      || ![
        'register-acknowledged', 'existing-row-after-write-not-started',
        'row-reconciled-after-submission-error', 'existing-row-reacquired',
      ].includes(value.submissionOutcome)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase === 'awaiting-authoritative-evidence') {
    exactPayloadKeys(payload, []);
    return Object.freeze({});
  }
  if (phase === 'receipt-install-intent') {
    const value = exactPayloadKeys(payload, [
      'attempt', 'receiptDigest', 'evidenceAuthorityDigest',
      'recordedAt', 'notAfter',
    ]);
    if (
      !Number.isSafeInteger(value.attempt)
      || value.attempt < 1
      || value.attempt > 8
      || typeof value.receiptDigest !== 'string'
      || !SHA256.test(value.receiptDigest)
      || typeof value.evidenceAuthorityDigest !== 'string'
      || !SHA256.test(value.evidenceAuthorityDigest)
      || typeof value.recordedAt !== 'string'
      || !STRICT_UTC.test(value.recordedAt)
      || typeof value.notAfter !== 'string'
      || !STRICT_UTC.test(value.notAfter)
      || Date.parse(value.notAfter) <= Date.parse(value.recordedAt)
    ) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    }
    return Object.freeze({ ...value });
  }
  if (phase === 'receipt-installed') {
    const value = exactPayloadKeys(payload, [
      'filename', 'receiptDigest', 'result',
    ]);
    if (
      typeof value.filename !== 'string'
      || value.filename !== `production-player-canary-${value.receiptDigest}.json`
      || typeof value.receiptDigest !== 'string'
      || !SHA256.test(value.receiptDigest)
      || !['installed', 'unchanged'].includes(value.result)
      || previous?.payload.receiptDigest !== value.receiptDigest
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  if (phase === 'receipt-install-not-published') {
    const value = exactPayloadKeys(payload, ['receiptDigest']);
    if (
      typeof value.receiptDigest !== 'string'
      || !SHA256.test(value.receiptDigest)
      || previous?.payload.receiptDigest !== value.receiptDigest
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    return Object.freeze({ ...value });
  }
  return fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
}

function parseJournalRecord(raw, previous, expectedOperationId) {
  const record = exactKeysUnordered(
    raw,
    RECORD_KEYS,
    'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID',
  );
  if (
    record.schemaVersion !== 1
    || record.profile !== PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE
    || record.operationId !== expectedOperationId
    || !ID.test(record.operationId)
    || !Number.isSafeInteger(record.sequence)
    || record.sequence !== (previous?.sequence ?? 0) + 1
    || typeof record.phase !== 'string'
    || !PHASE_SET.has(record.phase)
    || !validTransition(previous?.phase ?? null, record.phase)
    || record.previousRecordDigest !== (previous?.digest ?? null)
    || typeof record.recordedAt !== 'string'
    || !STRICT_UTC.test(record.recordedAt)
    || !Number.isSafeInteger(Date.parse(record.recordedAt))
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
  const payload = validatePayload(record.phase, record.payload, previous);
  const canonical = canonicalBytes({ ...record, payload });
  const digest = digestBytes(canonical);
  canonical.fill(0);
  return Object.freeze({ ...record, payload, digest });
}

function loadRecords(directory, operationId) {
  const names = readdirSync(directory).sort();
  if (names.length > MAX_DIRECTORY_ENTRIES) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_CONTENT_INVALID');
  }
  const recordNames = names.filter(name => RECORD_FILE.test(name));
  const records = [];
  for (const name of recordNames) {
    const match = RECORD_FILE.exec(name);
    if (match === null || match[1] !== operationId) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_OPERATION_CONFLICT');
    }
    const bytes = readExactFile(join(directory, name));
    let raw;
    try {
      raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
    }
    const previous = records.at(-1) ?? null;
    const record = parseJournalRecord(raw, previous, operationId);
    const canonical = canonicalBytes({
      schemaVersion: record.schemaVersion,
      profile: record.profile,
      operationId: record.operationId,
      sequence: record.sequence,
      phase: record.phase,
      previousRecordDigest: record.previousRecordDigest,
      recordedAt: record.recordedAt,
      payload: record.payload,
    });
    try {
      if (!canonical.equals(bytes) || recordFilename(record) !== name) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_RECORD_INVALID');
      }
    } finally {
      bytes.fill(0);
      canonical.fill(0);
    }
    records.push(record);
  }
  for (const name of names) {
    if (
      RECORD_FILE.test(name)
      || name === LOCK_FILE
      || TEMPORARY_FILE.test(name)
    ) continue;
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_CONTENT_INVALID');
  }
  return records;
}

function inspectTerminalReceiptJournalAtHome(operationId, reportedHome) {
  if (typeof operationId !== 'string' || !ID.test(operationId)) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_INSPECTION_INPUT_INVALID');
  }
  const directory = existingJournalDirectory(reportedHome);
  let names;
  try { names = readdirSync(directory).sort(); } catch {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_DIRECTORY_INVALID');
  }
  if (
    names.length < 1
    || names.some(name => {
      const match = RECORD_FILE.exec(name);
      return name !== LOCK_FILE && (match === null || match[1] !== operationId);
    })
  ) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
  }
  assertTerminalJournalLockQuiescent(directory, operationId);
  const records = loadRecords(directory, operationId);
  const prepared = records[0];
  const ownerApproval = records.findLast(
    record => record.phase === 'owner-approval-installed',
  );
  const baseline = records.findLast(
    record => record.phase === 'baseline-reconciled',
  );
  const approval = records.findLast(
    record => record.phase === 'approval-reconciled',
  );
  const receiptIntent = records.findLast(
    record => record.phase === 'receipt-install-intent',
  );
  const terminal = records.at(-1);
  if (
    prepared?.phase !== 'prepared'
    || prepared.payload.contract.operationId !== operationId
    || baseline === undefined
    || ownerApproval === undefined
    || approval === undefined
    || receiptIntent === undefined
    || terminal?.phase !== 'receipt-installed'
    || terminal.payload.receiptDigest !== receiptIntent.payload.receiptDigest
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
  return Object.freeze({
    operationId,
    contract: prepared.payload.contract,
    ownerApprovalReference: ownerApproval.payload.reference,
    baselineCheckpoint: baseline.payload,
    ownerApprovalCheckpoint: ownerApproval.payload,
    approvalCheckpoint: approval.payload,
    receiptIntent: receiptIntent.payload,
    receipt: terminal.payload,
    terminalRecordDigest: terminal.digest,
  });
}

/**
 * Read a completed operator chain without taking its lock, reconciling a
 * temporary, creating a directory, or appending a later journal phase.
 */
export function inspectProductionPlayerCanaryTerminalReceiptJournal(input = {}) {
  if (
    !exactOwnDataKeys(input, ['operatorOperationId'], true)
  ) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_INSPECTION_INPUT_INVALID');
  }
  return inspectTerminalReceiptJournalAtHome(
    input.operatorOperationId,
    undefined,
  );
}

const OPERATOR_LOCK_HELPER = String.raw`
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

function assertTerminalJournalLockQuiescent(directory, operationId) {
  const path = join(directory, LOCK_FILE);
  let before;
  let descriptor;
  try {
    before = readLock(path);
    if (before.value.operationId !== operationId) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
    }
    descriptor = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    const result = spawnSync('/usr/bin/python3', [
      '-I', '-c', OPERATOR_LOCK_HELPER,
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
    if (
      result.status !== 0
      || result.signal !== null
      || result.error !== undefined
      || result.stdout !== 'READY\n'
      || result.stderr !== ''
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
    const after = readLock(path);
    if (
      after.digest !== before.digest
      || !sameFile(after.identity, before.identity)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
  } catch (error) {
    if (
      error instanceof ProductionPlayerCanaryOperatorJournalError
      && error.code === 'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED'
    ) throw error;
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_NOT_SETTLED');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function parseLockBytes(bytes) {
  let raw;
  try {
    raw = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
  }
  const value = exactKeysUnordered(raw, [
    'schemaVersion', 'profile', 'lockId', 'operationId', 'pid', 'recordedAt',
  ], 'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
  if (
    value.schemaVersion !== 1
    || value.profile !== PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE
    || typeof value.lockId !== 'string'
    || !ID.test(value.lockId)
    || typeof value.operationId !== 'string'
    || !ID.test(value.operationId)
    || !Number.isSafeInteger(value.pid)
    || value.pid < 1
    || typeof value.recordedAt !== 'string'
    || !STRICT_UTC.test(value.recordedAt)
  ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
  const canonical = canonicalBytes(value);
  try {
    if (!canonical.equals(bytes)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
    }
  } finally { canonical.fill(0); }
  return Object.freeze({ ...value });
}

function readLock(path, expectedLinks = 1n) {
  const before = lstatSync(path, { bigint: true });
  const bytes = readExactFile(path, expectedLinks);
  try {
    const value = parseLockBytes(bytes);
    const current = lstatSync(path, { bigint: true });
    if (!sameFile(before, current)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_RACE');
    }
    return Object.freeze({
      value,
      digest: digestBytes(bytes),
      identity: current,
    });
  } finally { bytes.fill(0); }
}

async function acquireLock(directory, operationId, options) {
  const path = join(directory, LOCK_FILE);
  const recordedAt = canonicalInstant((options.now ?? Date.now)());
  const value = Object.freeze({
    schemaVersion: 1,
    profile: PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE,
    lockId: randomId(16, options.randomBytes),
    operationId,
    pid: process.pid,
    recordedAt,
  });
  const expectedBytes = canonicalBytes(value);
  let descriptor;
  let released = false;
  try {
    let created = false;
    try {
      descriptor = openSync(
        path,
        constants.O_RDWR | constants.O_CREAT | constants.O_EXCL
          | (constants.O_NOFOLLOW ?? 0),
        FILE_MODE,
      );
      created = true;
    } catch (cause) {
      if (cause?.code !== 'EEXIST') throw cause;
      descriptor = openSync(
        path,
        constants.O_RDWR | (constants.O_NOFOLLOW ?? 0),
      );
    }
    if (created) fchmodSync(descriptor, FILE_MODE);
    const opened = fstatSync(descriptor, { bigint: true });
    const named = lstatSync(path, { bigint: true });
    if (
      !opened.isFile()
      || opened.isSymbolicLink()
      || opened.nlink !== 1n
      || (opened.mode & 0o7777n) !== 0o600n
      || (process.getuid !== undefined && opened.uid !== BigInt(process.getuid()))
      || !sameFile(opened, named)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
    const result = spawnSync('/usr/bin/python3', [
      '-I', '-c', OPERATOR_LOCK_HELPER,
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
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCKED');
    }
    if (
      result.error !== undefined
      || result.status !== 0
      || result.signal !== null
      || result.stdout !== 'READY\n'
      || result.stderr !== ''
    ) fail(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID',
      'halt',
      result.error ?? new Error(
        result.stderr || `lock-helper-exit:${result.status}/${result.signal}`,
      ),
    );
    const afterHelper = fstatSync(descriptor, { bigint: true });
    const namedAfterHelper = lstatSync(path, { bigint: true });
    if (
      !sameFile(opened, afterHelper)
      || !sameFile(opened, namedAfterHelper)
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_RACE');
    ftruncateSync(descriptor, 0);
    let offset = 0;
    while (offset < expectedBytes.length) {
      offset += writeSync(
        descriptor,
        expectedBytes,
        offset,
        expectedBytes.length - offset,
        offset,
      );
    }
    fsyncSync(descriptor);
    fsyncDirectory(directory);
    const installed = readLock(path);
    if (installed.digest !== digestBytes(expectedBytes)) {
      fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_INVALID');
    }
    const lock = Object.freeze({
      assertActive() {
        if (released || descriptor === undefined) {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_REQUIRED');
        }
        let held;
        try {
          held = fstatSync(descriptor, { bigint: true });
        } catch {
          fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_REQUIRED');
        }
        const current = readLock(path);
        if (
          !sameFile(held, installed.identity)
          || !sameFile(held, current.identity)
          || current.digest !== installed.digest
          || !sameFile(current.identity, installed.identity)
        ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_RACE');
      },
      async release() {
        if (released) return;
        lock.assertActive();
        released = true;
        closeSync(descriptor);
        descriptor = undefined;
      },
    });
    lock.assertActive();
    reconcileTemporaries(directory);
    lock.assertActive();
    return lock;
  } catch (error) {
    if (!released && descriptor !== undefined) closeSync(descriptor);
    released = true;
    descriptor = undefined;
    if (error instanceof ProductionPlayerCanaryOperatorJournalError) throw error;
    fail(
      'PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_LOCK_UNAVAILABLE',
      'halt',
      error,
    );
  } finally {
    expectedBytes.fill(0);
  }
}

function projectReconciliation(kind, value, attempt) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_RECONCILIATION_INVALID');
  }
  if (kind === 'baseline') return {
    attempt,
    challengeDigest: value.challengeDigest,
    reviewedAdmissionPlanDigest: value.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: value.serverBaselineCommitment,
    routeSetCommitment: value.routeSetCommitment,
    capturedAtMicros: value.capturedAtMicros?.toString(),
    submissionOutcome: value.submissionOutcome,
  };
  return {
    attempt,
    approvalRegistrationCommitment: value.approvalRegistrationCommitment,
    routeSetCommitment: value.routeSetCommitment,
    commandSetCommitment: value.commandSetCommitment,
    registeredAtMicros: value.registeredAtMicros?.toString(),
    submissionOutcome: value.submissionOutcome,
  };
}

function buildJournal(directory, contract, lock, options) {
  let records = loadRecords(directory, contract.operationId);
  const append = (phase, payload) => {
    lock.assertActive();
    const previous = records.at(-1) ?? null;
    const record = Object.freeze({
      schemaVersion: 1,
      profile: PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PROFILE,
      operationId: contract.operationId,
      sequence: (previous?.sequence ?? 0) + 1,
      phase,
      previousRecordDigest: previous?.digest ?? null,
      recordedAt: canonicalInstant((options.now ?? Date.now)()),
      payload: canonicalValue(payload),
    });
    parseJournalRecord(record, previous, contract.operationId);
    installImmutable(
      directory,
      recordFilename(record),
      record,
      options.randomBytes,
    );
    records = loadRecords(directory, contract.operationId);
    return records.at(-1);
  };
  const contractDigest = digestValue(contract);
  const persistedContract = journaledContract(contract);
  if (records.length === 0) append('prepared', {
    contract: persistedContract,
    contractDigest,
  });
  const preparedContract = records[0].payload.contract;
  if (
    records[0].payload.contractDigest !== contractDigest
    || JSON.stringify(preparedContract) !== JSON.stringify(persistedContract)
  ) {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_OPERATION_CONFLICT');
  }
  const inspect = () => {
    const current = records.at(-1);
    return Object.freeze({
      contract,
      phase: current.phase,
      sequence: current.sequence,
      payload: current.payload,
      recordDigest: current.digest,
    });
  };
  const beginWrite = (kind, { arguments: arguments_, confirmationDigest }) => {
    const phase = `${kind}-submit-intent`;
    const attempt = records.filter(record => record.phase === phase).length + 1;
    const argumentsDigest = digestValue(arguments_);
    append(phase, { attempt, argumentsDigest, confirmationDigest });
    let uncertain = false;
    let rejectedBeforeUncertain;
    const markSubmissionUncertain = async () => {
      if (uncertain || rejectedBeforeUncertain !== undefined) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_WRITE_PERMIT_INVALID');
      }
      append(`${kind}-submission-uncertain`, {
        attempt,
        argumentsDigest,
        confirmationDigest,
      });
      uncertain = true;
      await new Promise(resolveTurn => setImmediate(resolveTurn));
    };
    const bindWriteNotStartedError = error => {
      if (
        uncertain
        || rejectedBeforeUncertain !== undefined
        || error === null
        || typeof error !== 'object'
        || error.name !== 'GreaterRealmCutoverWriteNotStartedError'
        || error.writeStarted !== false
      ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_WRITE_PERMIT_INVALID');
      rejectedBeforeUncertain = error;
    };
    const permit = Object.assign(() => {
      lock.assertActive();
      if (!uncertain || rejectedBeforeUncertain !== undefined) {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_WRITE_PERMIT_INVALID');
      }
      const current = inspect();
      if (
        current.phase !== `${kind}-submission-uncertain`
        || current.payload.attempt !== attempt
        || current.payload.argumentsDigest !== argumentsDigest
      ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_WRITE_PERMIT_INVALID');
    }, { markSubmissionUncertain, bindWriteNotStartedError });
    return Object.freeze({ attempt, argumentsDigest, permit });
  };
  const attemptFor = kind => {
    const current = inspect();
    if (
      current.phase !== `${kind}-submit-intent`
      && current.phase !== `${kind}-submission-uncertain`
    ) fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_PHASE_INVALID');
    return current.payload.attempt;
  };
  return Object.freeze({
    inspect,
    payloadFor: phase => records.findLast(record => record.phase === phase)?.payload ?? null,
    beginBaselineWrite: arguments_ => beginWrite('baseline', arguments_),
    baselineAbsenceObserved: () => {
      const current = inspect();
      return append('baseline-absence-observed', {
        attempt: current.payload.attempt,
        argumentsDigest: current.payload.argumentsDigest,
        disposition: 'explicit-operator-retry-required',
      });
    },
    baselineReconciled: value => append(
      'baseline-reconciled',
      projectReconciliation('baseline', value, attemptFor('baseline')),
    ),
    ownerApprovalInstallIntent: value => append(
      'owner-approval-install-intent',
      value,
    ),
    ownerApprovalInstalled: value => append('owner-approval-installed', value),
    beginApprovalWrite: arguments_ => beginWrite('approval', arguments_),
    approvalAbsenceObserved: () => {
      const current = inspect();
      return append('approval-absence-observed', {
        attempt: current.payload.attempt,
        argumentsDigest: current.payload.argumentsDigest,
        disposition: 'explicit-operator-retry-required',
      });
    },
    approvalReconciled: value => append(
      'approval-reconciled',
      projectReconciliation('approval', value, attemptFor('approval')),
    ),
    awaitingAuthoritativeEvidence: () => append(
      'awaiting-authoritative-evidence',
      {},
    ),
    receiptInstallIntent: value => append('receipt-install-intent', {
      ...value,
      attempt: records.filter(record =>
        record.phase === 'receipt-install-intent').length + 1,
    }),
    receiptInstallNotPublished: () => append(
      'receipt-install-not-published',
      { receiptDigest: inspect().payload.receiptDigest },
    ),
    receiptInstalled: result => append('receipt-installed', result),
  });
}

/**
 * Serialize one private operator phase. Phase records are append-only; the
 * transient no-clobber lock is recovered only after process-identity proof.
 */
async function withJournalDependencies({
  contract: rawContract,
  reportedHome,
  validateBeforePrepare,
  operation,
} = {}, injected = {}) {
  const contract = parseProductionPlayerCanaryOperatorContract(rawContract);
  if (typeof operation !== 'function') {
    fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_OPERATION_INVALID');
  }
  const directory = journalDirectory(reportedHome);
  const options = {
    now: injected.now,
    randomBytes: injected.randomBytes,
    probeProcessIdentity: injected.probeProcessIdentity,
    currentProcessIdentity: injected.currentProcessIdentity,
  };
  const lock = await acquireLock(directory, contract.operationId, options);
  try {
    if (loadRecords(directory, contract.operationId).length === 0
      && validateBeforePrepare !== undefined) {
      if (typeof validateBeforePrepare !== 'function') {
        fail('PRODUCTION_PLAYER_CANARY_OPERATOR_JOURNAL_OPERATION_INVALID');
      }
      await validateBeforePrepare();
    }
    const journal = buildJournal(directory, contract, lock, options);
    return await operation(journal);
  } finally {
    await lock.release();
  }
}

export function withProductionPlayerCanaryOperatorJournal(input) {
  return withJournalDependencies(input);
}

export const productionPlayerCanaryOperatorJournalTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      canonicalBytes,
      digestValue,
      journalDirectory,
      inspectTerminalReceiptJournalAtHome,
      loadRecords,
      reconcileTemporaries,
      withJournalDependencies,
    })
    : undefined;
