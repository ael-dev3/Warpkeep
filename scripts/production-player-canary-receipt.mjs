import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';

import {
  assertProductionAdminTrustedAncestors,
  canonicalProductionAdminAccountHome,
} from './production-admin-token-budget.mjs';

import {
  PRODUCTION_PLAYER_CANARY_RELEASE_BINDING,
  parseProductionPlayerCanaryReleaseBinding,
} from './production-player-canary-release-binding.mjs';
import {
  parseProductionPlayerCanaryEvidenceAuthority,
  requireProductionPlayerCanaryExpectedEvidenceAuthority,
} from './production-player-canary-evidence-authority.mjs';

export const PRODUCTION_PLAYER_CANARY_PROFILE =
  'warpkeep-production-player-canary-v1';
export const PRODUCTION_PLAYER_CANARY_PREDECESSOR_TUPLE =
  'FT|TTFT|FT|FF|1|1|NNPN';
export const PRODUCTION_PLAYER_CANARY_PREDECESSOR_VERSION = '0.3.43';
export const PRODUCTION_PLAYER_CANARY_RECEIPT_MAXIMUM_AGE_MS =
  24 * 60 * 60 * 1_000;
export const PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS =
  5 * 60 * 1_000;

const activationAuthorityBrand = new WeakSet();
const activationAuthorityFreshness = new WeakMap();

const RECEIPT_DIRECTORY_NAME = 'production-player-canary-receipts-v1';
const RECEIPT_NAME = /^production-player-canary-([0-9a-f]{64})\.json$/u;
const TEMPORARY_NAME = /^\.production-player-canary-([0-9a-f]{64})\.json-([0-9a-f]{32})\.tmp$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const COMMIT = /^[0-9a-f]{40}$/u;
const ISO_INSTANT = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/u;
const MAXIMUM_RECEIPT_BYTES = 48 * 1_024;
const FORBIDDEN_KEY_SEGMENTS = new Set([
  'fid', 'rawsubject', 'subjectvalue', 'jwt', 'accesstoken', 'refreshtoken',
  'credential', 'credentials', 'password', 'authorization', 'cookie',
  'workerid', 'locationid', 'nodeid', 'castleid', 'cellkey', 'chunkhandle',
  'routecell',
]);
const TOP_LEVEL_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'source',
  'predecessor',
  'evidenceAuthority',
  'recordedAt',
]);
const SOURCE_KEYS = Object.freeze([
  'protectedCommit', 'protectedTree',
]);
const PREDECESSOR_KEYS = Object.freeze([
  'phaseTuple', 'releaseVersion', 'worldClientPresentationEnabled',
  'worldServerPresentationEnabled', 'pagesSourceCommit',
  'liveReceiptDigest', 'liveRootReceiptDigest', 'liveRootPagesSourceCommit',
]);

export class ProductionPlayerCanaryReceiptError extends Error {
  constructor(code) {
    super(code);
    this.name = 'ProductionPlayerCanaryReceiptError';
    this.code = code;
  }
}

function fail(code) {
  throw new ProductionPlayerCanaryReceiptError(code);
}

function exactKeys(value, expected, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).sort().join(',') !== [...expected].sort().join(',')
  ) fail(code);
  return value;
}

function exactDigest(value) {
  return typeof value === 'string' && SHA256.test(value);
}

function exactCommit(value) {
  return typeof value === 'string' && COMMIT.test(value);
}

function exactInstant(value) {
  return typeof value === 'string'
    && ISO_INSTANT.test(value)
    && new Date(value).toISOString() === value;
}

function parseEvidenceAuthority(value) {
  try {
    return parseProductionPlayerCanaryEvidenceAuthority(value);
  } catch {
    return fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
  }
}

function assertNoPrivateKeys(value, ancestors = new Set()) {
  if (value === null || typeof value !== 'object') return;
  if (ancestors.has(value)) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (const child of value) assertNoPrivateKeys(child, ancestors);
      return;
    }
    for (const [key, child] of Object.entries(value)) {
      const segments = key.split(/(?=[A-Z])|[^A-Za-z0-9]+/u)
        .filter(Boolean).map(segment => segment.toLowerCase());
      const joined = segments.join('');
      if (
        segments.some(segment => FORBIDDEN_KEY_SEGMENTS.has(segment))
        || FORBIDDEN_KEY_SEGMENTS.has(joined)
      ) fail('PRODUCTION_PLAYER_CANARY_PRIVATE_FIELD_REJECTED');
      assertNoPrivateKeys(child, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map(key => [
      key, canonicalize(value[key]),
    ]));
  }
  return value;
}

export function canonicalProductionPlayerCanaryReceiptBytes(receipt) {
  return Buffer.from(`${JSON.stringify(canonicalize(receipt))}\n`, 'utf8');
}

export function parseProductionPlayerCanaryReceipt(value) {
  assertNoPrivateKeys(value);
  const receipt = exactKeys(
    value, TOP_LEVEL_KEYS, 'PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID',
  );
  const source = exactKeys(
    receipt.source, SOURCE_KEYS, 'PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID',
  );
  const predecessor = exactKeys(
    receipt.predecessor, PREDECESSOR_KEYS, 'PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID',
  );
  const authority = parseEvidenceAuthority(
    receipt.evidenceAuthority,
  );
  const recordedAtMs = exactInstant(receipt.recordedAt)
    ? Date.parse(receipt.recordedAt) : Number.NaN;
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== PRODUCTION_PLAYER_CANARY_PROFILE
    || !exactCommit(source.protectedCommit) || !exactCommit(source.protectedTree)
    || source.protectedCommit !== authority.protectedCommit
    || source.protectedTree !== authority.protectedTree
    || predecessor.phaseTuple !== PRODUCTION_PLAYER_CANARY_PREDECESSOR_TUPLE
    || predecessor.releaseVersion !== PRODUCTION_PLAYER_CANARY_PREDECESSOR_VERSION
    || predecessor.worldClientPresentationEnabled !== false
    || predecessor.worldServerPresentationEnabled !== false
    || !exactCommit(predecessor.pagesSourceCommit)
    || predecessor.pagesSourceCommit !== source.protectedCommit
    || !exactDigest(predecessor.liveReceiptDigest)
    || !exactDigest(predecessor.liveRootReceiptDigest)
    || !exactCommit(predecessor.liveRootPagesSourceCommit)
    || authority.notificationPagesLiveReceiptDigest !== predecessor.liveReceiptDigest
    || authority.notificationPagesLiveRootReceiptDigest
      !== predecessor.liveRootReceiptDigest
    || authority.notificationPagesLivePagesSourceCommit
      !== predecessor.pagesSourceCommit
    || authority.notificationPagesLiveRootPagesSourceCommit
      !== predecessor.liveRootPagesSourceCommit
    || !Number.isSafeInteger(recordedAtMs)
    || receipt.recordedAt !== authority.recordedAt
  ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
  return Object.freeze(canonicalize(receipt));
}

function exactDirectory(path, code) {
  try {
    assertProductionAdminTrustedAncestors(path);
    if (!isAbsolute(path) || resolve(path) !== path || realpathSync(path) !== path) fail(code);
    const status = lstatSync(path, { bigint: true });
    if (
      !status.isDirectory() || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o700n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
    ) fail(code);
    return path;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryReceiptError) throw error;
    return fail(code);
  }
}

export function defaultProductionPlayerCanaryReceiptDirectory() {
  return join(
    canonicalProductionAdminAccountHome(),
    '.warpkeep', 'private', 'production-admin-v1', RECEIPT_DIRECTORY_NAME,
  );
}

function fsyncDirectory(directory) {
  const descriptor = openSync(
    directory,
    constants.O_RDONLY | (constants.O_DIRECTORY ?? 0) | (constants.O_NOFOLLOW ?? 0),
  );
  try { fsyncSync(descriptor); } finally { closeSync(descriptor); }
}

function assertReceiptFileMetadata(path, allowedLinks = 1n) {
  const status = lstatSync(path, { bigint: true });
  if (
    !status.isFile() || status.isSymbolicLink()
    || (status.mode & 0o7777n) !== 0o600n || status.nlink !== allowedLinks
    || status.size < 1n || status.size > BigInt(MAXIMUM_RECEIPT_BYTES)
    || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
  ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  return status;
}

function readFileDigest(path, allowedLinks = 1n) {
  const status = assertReceiptFileMetadata(path, allowedLinks);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== status.dev || before.ino !== status.ino
      || before.mode !== status.mode || before.uid !== status.uid
      || before.nlink !== status.nlink || before.size !== status.size
      || before.mtimeNs !== status.mtimeNs || before.ctimeNs !== status.ctimeNs
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.uid !== before.uid || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || current.dev !== before.dev || current.ino !== before.ino
      || current.mode !== before.mode || current.uid !== before.uid
      || current.nlink !== before.nlink || current.size !== before.size
      || current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs
    ) {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    bytes.fill(0);
    return Object.freeze({ status, digest });
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

/** Repair only the two exact no-clobber publication crash states. */
function reconcileReceiptDirectory(directory) {
  const names = readdirSync(directory).sort();
  if (names.length > 2) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  const temporaryNames = names.filter(name => TEMPORARY_NAME.test(name));
  if (temporaryNames.length > 1) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  }
  for (const name of temporaryNames) {
    const match = TEMPORARY_NAME.exec(name);
    if (match === null) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    const temporary = join(directory, name);
    const status = lstatSync(temporary, { bigint: true });
    if (
      !status.isFile() || status.isSymbolicLink()
      || (status.mode & 0o7777n) !== 0o600n
      || (process.getuid !== undefined && status.uid !== BigInt(process.getuid()))
      || (status.nlink !== 1n && status.nlink !== 2n)
      || status.size > BigInt(MAXIMUM_RECEIPT_BYTES)
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    if (status.nlink === 1n) {
      unlinkSync(temporary);
      fsyncDirectory(directory);
      continue;
    }
    const destination = join(directory, `production-player-canary-${match[1]}.json`);
    let destinationStatus;
    try { destinationStatus = lstatSync(destination, { bigint: true }); } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    }
    if (
      destinationStatus.dev !== status.dev || destinationStatus.ino !== status.ino
      || destinationStatus.nlink !== 2n
      || readFileDigest(destination, 2n).digest !== match[1]
      || readFileDigest(temporary, 2n).digest !== match[1]
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    unlinkSync(temporary);
    fsyncDirectory(directory);
    assertReceiptFileMetadata(destination);
  }
  const repairedNames = readdirSync(directory).sort();
  if (repairedNames.length > 1 || repairedNames.some(name => !RECEIPT_NAME.test(name))) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  }
  for (const name of repairedNames) {
    const match = RECEIPT_NAME.exec(name);
    if (match === null || readFileDigest(join(directory, name)).digest !== match[1]) {
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
    }
  }
}

function sameCanonicalValue(left, right) {
  const leftBytes = canonicalProductionPlayerCanaryReceiptBytes(left);
  const rightBytes = canonicalProductionPlayerCanaryReceiptBytes(right);
  try {
    return leftBytes.equals(rightBytes);
  } finally {
    leftBytes.fill(0);
    rightBytes.fill(0);
  }
}

/**
 * A durable receipt records the exact historical observation that issued it.
 * A later activation inspection necessarily has a later DB observation time and
 * therefore a different DB evidence digest.  Those two values are historical
 * issuance coordinates, not release invariants.  Every other authority field is
 * stable and must remain byte-identical across the fresh activation inspection.
 */
function activationInvariantEvidenceAuthority(value) {
  const authority = parseEvidenceAuthority(value);
  const {
    adminGameplayEvidenceDigest: _historicalAdminGameplayEvidenceDigest,
    recordedAt: _historicalRecordedAt,
    ...stableAuthority
  } = authority;
  return stableAuthority;
}

function readExactReceipt(path, expectedDigest) {
  let descriptor;
  try {
    const pathStatus = lstatSync(path, { bigint: true });
    if (
      !pathStatus.isFile() || pathStatus.isSymbolicLink()
      || (pathStatus.mode & 0o7777n) !== 0o600n || pathStatus.nlink !== 1n
      || pathStatus.size < 1n || pathStatus.size > BigInt(MAXIMUM_RECEIPT_BYTES)
      || (process.getuid !== undefined && pathStatus.uid !== BigInt(process.getuid()))
      || realpathSync(path) !== path
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_INVALID');
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor, { bigint: true });
    if (
      before.dev !== pathStatus.dev || before.ino !== pathStatus.ino
      || before.mode !== pathStatus.mode || before.uid !== pathStatus.uid
      || before.nlink !== pathStatus.nlink || before.size !== pathStatus.size
      || before.mtimeNs !== pathStatus.mtimeNs || before.ctimeNs !== pathStatus.ctimeNs
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_INVALID');
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    const current = lstatSync(path, { bigint: true });
    if (
      after.dev !== before.dev || after.ino !== before.ino || after.mode !== before.mode
      || after.uid !== before.uid || after.nlink !== before.nlink || after.size !== before.size
      || after.mtimeNs !== before.mtimeNs || after.ctimeNs !== before.ctimeNs
      || current.dev !== before.dev || current.ino !== before.ino
      || current.mode !== before.mode || current.uid !== before.uid
      || current.nlink !== before.nlink || current.size !== before.size
      || current.mtimeNs !== before.mtimeNs || current.ctimeNs !== before.ctimeNs
      || createHash('sha256').update(bytes).digest('hex') !== expectedDigest
    ) {
      bytes.fill(0);
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_CHANGED');
    }
    return bytes;
  } catch (error) {
    if (error instanceof ProductionPlayerCanaryReceiptError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_INVALID');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function inspectActivationAuthority(input, now) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_INPUT_INVALID');
  }
  const binding = parseProductionPlayerCanaryReleaseBinding(
    input.binding ?? PRODUCTION_PLAYER_CANARY_RELEASE_BINDING,
    { required: true },
  );
  const expectedCandidatePagesSourceCommit =
    input.expectedCandidatePagesSourceCommit
      ?? input.expectedPredecessorPagesSourceCommit;
  if (
    !exactCommit(input.expectedPredecessorPagesSourceCommit)
    || input.expectedPredecessorPagesSourceCommit
      !== binding.productionPlayerCanarySourceCommit
    || !exactCommit(expectedCandidatePagesSourceCommit)
    || !exactCommit(input.expectedProtectedTree)
    || !exactDigest(input.expectedLiveRootReceiptDigest)
    || !exactCommit(input.expectedLiveRootPagesSourceCommit)
    || !exactDigest(input.expectedLiveReceiptDigest)
    || !exactCommit(input.expectedLivePagesSourceCommit)
    || input.expectedEvidenceAuthority === undefined
    || !Number.isSafeInteger(now)
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_INPUT_INVALID');
  const expectedEvidenceAuthority =
    requireProductionPlayerCanaryExpectedEvidenceAuthority(
      input.expectedEvidenceAuthority,
    );
  const directory = exactDirectory(
    input.directory ?? defaultProductionPlayerCanaryReceiptDirectory(),
    'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_INVALID',
  );
  reconcileReceiptDirectory(directory);
  const digest = binding.productionPlayerCanaryReceiptDigest;
  const filename = `production-player-canary-${digest}.json`;
  if (!RECEIPT_NAME.test(filename)) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_INVALID');
  const path = join(directory, filename);
  const bytes = readExactReceipt(path, digest);
  let receipt;
  try {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
    }
    receipt = parseProductionPlayerCanaryReceipt(parsed);
    const canonical = canonicalProductionPlayerCanaryReceiptBytes(receipt);
    try {
      if (!canonical.equals(bytes)) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_NONCANONICAL');
    } finally {
      canonical.fill(0);
    }
  } finally {
    bytes.fill(0);
  }
  const recordedAtMs = Date.parse(receipt.recordedAt);
  const freshRecordedAtMs = Date.parse(expectedEvidenceAuthority.recordedAt);
  const notAfterMs = Date.parse(receipt.evidenceAuthority.notAfter);
  if (
    receipt.source.protectedCommit !== binding.productionPlayerCanarySourceCommit
    || receipt.source.protectedTree !== input.expectedProtectedTree
    || receipt.predecessor.pagesSourceCommit
      !== input.expectedPredecessorPagesSourceCommit
    || receipt.predecessor.liveRootReceiptDigest
      !== input.expectedLiveRootReceiptDigest
    || receipt.predecessor.liveRootPagesSourceCommit
      !== input.expectedLiveRootPagesSourceCommit
    || receipt.predecessor.liveReceiptDigest !== input.expectedLiveReceiptDigest
    || receipt.predecessor.pagesSourceCommit !== input.expectedLivePagesSourceCommit
    || receipt.evidenceAuthority.notificationPagesLiveRootReceiptDigest
      !== input.expectedLiveRootReceiptDigest
    || receipt.evidenceAuthority.notificationPagesLiveRootPagesSourceCommit
      !== input.expectedLiveRootPagesSourceCommit
    || !sameCanonicalValue(
      activationInvariantEvidenceAuthority(receipt.evidenceAuthority),
      activationInvariantEvidenceAuthority(expectedEvidenceAuthority),
    )
    || recordedAtMs > now
    || freshRecordedAtMs > now
    || now - freshRecordedAtMs
      > PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS
    || now > notAfterMs
    || now - recordedAtMs > PRODUCTION_PLAYER_CANARY_RECEIPT_MAXIMUM_AGE_MS
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_MISMATCH');
  const authority = Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_PROFILE,
    candidatePagesSourceCommit: expectedCandidatePagesSourceCommit,
    productionPlayerCanaryReceiptDigest: digest,
    productionPlayerCanarySourceCommit: receipt.source.protectedCommit,
    productionPlayerCanarySourceTree: receipt.source.protectedTree,
    predecessorPhaseTuple: receipt.predecessor.phaseTuple,
    predecessorReleaseVersion: receipt.predecessor.releaseVersion,
    predecessorLiveRootReceiptDigest: receipt.predecessor.liveRootReceiptDigest,
    predecessorLiveRootPagesSourceCommit: receipt.predecessor.liveRootPagesSourceCommit,
    normalAdmission: true,
    exactlyOnceNotification: true,
    sameAdmissionGeneration: true,
    sameFounder: true,
    directTierOneFounder: true,
    workerCount: 4,
    dispatchReceiptCount: 4,
    recallReceiptCount: 4,
    distinctResourceKindCount: 4,
    naturalGatheringWindowSatisfied: true,
    terminalIdleWorkerCount: 4,
    terminalGraphEmpty: true,
    isolatedResourceKindCount: 4,
    resourceQuantumCount: 4,
    humanRouteAndTimeCutoffSatisfied: true,
    recordedAt: receipt.recordedAt,
    notAfter: receipt.evidenceAuthority.notAfter,
  });
  activationAuthorityBrand.add(authority);
  activationAuthorityFreshness.set(authority, Object.freeze({
    inspectedAtMs: now,
    notAfterMs: Date.parse(receipt.evidenceAuthority.notAfter),
  }));
  return authority;
}

export function inspectProductionPlayerCanaryActivationAuthority(input) {
  const now = input?.now ?? new Date();
  if (!(now instanceof Date) || !Number.isSafeInteger(now.getTime())) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_INPUT_INVALID');
  }
  return inspectActivationAuthority(input, now.getTime());
}

export function requireProductionPlayerCanaryActivationAuthority(value) {
  if (!activationAuthorityBrand.has(value)) {
    fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_REQUIRED');
  }
  return value;
}

export function productionPlayerCanaryActivationAuthorityDigest(value) {
  const authority = requireProductionPlayerCanaryActivationAuthority(value);
  return createHash('sha256')
    .update('warpkeep.production-player-canary.activation-authority.v1\0', 'utf8')
    .update(JSON.stringify(authority), 'utf8')
    .digest('hex');
}

export function requireFreshProductionPlayerCanaryActivationAuthority(
  value,
  {
    candidatePagesSourceCommit,
    predecessorPagesSourceCommit,
    now = Date.now(),
  } = {},
) {
  const authority = requireProductionPlayerCanaryActivationAuthority(value);
  const freshness = activationAuthorityFreshness.get(authority);
  if (
    freshness === undefined
    || !Number.isSafeInteger(now)
    || !exactCommit(candidatePagesSourceCommit)
    || !exactCommit(predecessorPagesSourceCommit)
    || authority.candidatePagesSourceCommit !== candidatePagesSourceCommit
    || authority.productionPlayerCanarySourceCommit
      !== predecessorPagesSourceCommit
    || freshness.inspectedAtMs > now
    || now - freshness.inspectedAtMs
      > PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS
    || now > freshness.notAfterMs
  ) fail('PRODUCTION_PLAYER_CANARY_ACTIVATION_AUTHORITY_STALE');
  return authority;
}

export function sameProductionPlayerCanaryActivationAuthority(left, right) {
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
    return false;
  }
  return Object.keys(left).length === Object.keys(right).length
    && Object.keys(left).every(key => left[key] === right[key]);
}

function installReceipt(input, testHooks = {}) {
  const receipt = parseProductionPlayerCanaryReceipt(input.receipt);
  const directory = exactDirectory(
    input.directory ?? defaultProductionPlayerCanaryReceiptDirectory(),
    'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_INVALID',
  );
  reconcileReceiptDirectory(directory);
  const bytes = canonicalProductionPlayerCanaryReceiptBytes(receipt);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const filename = `production-player-canary-${digest}.json`;
  const destination = join(directory, filename);
  const existingNames = readdirSync(directory).sort();
  if (
    existingNames.length === 1
    && existingNames[0] !== filename
  ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_CONFLICT');
  const nonce = (input.randomId ?? (() => randomUUID().replaceAll('-', '')))();
  if (!/^[0-9a-f]{32}$/u.test(nonce)) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INSTALL_INVALID');
  const temporary = join(directory, `.${filename}-${nonce}.tmp`);
  let descriptor;
  let linked = false;
  try {
    try {
      const existing = readExactReceipt(destination, digest);
      try {
        if (!existing.equals(bytes)) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_CONFLICT');
      } finally { existing.fill(0); }
      return Object.freeze({ filename, receiptDigest: digest, result: 'unchanged' });
    } catch (error) {
      if (
        !(error instanceof ProductionPlayerCanaryReceiptError)
        || error.code !== 'PRODUCTION_PLAYER_CANARY_RECEIPT_FILE_INVALID'
      ) throw error;
      try { lstatSync(destination); } catch (statusError) {
        if (statusError?.code !== 'ENOENT') throw error;
      }
    }
    descriptor = openSync(
      temporary,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL
        | (constants.O_NOFOLLOW ?? 0),
      0o600,
    );
    let offset = 0;
    while (offset < bytes.length) {
      const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
      if (written <= 0) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INSTALL_INVALID');
      offset += written;
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    linked = true;
    fsyncDirectory(directory);
    testHooks.afterLink?.();
    unlinkSync(temporary);
    linked = false;
    fsyncDirectory(directory);
    const installed = readExactReceipt(destination, digest);
    installed.fill(0);
    return Object.freeze({ filename, receiptDigest: digest, result: 'installed' });
  } catch (error) {
    if (linked) {
      // Preserve the hard-linked temporary as explicit crash evidence. The
      // operator must reconcile it before any later canary attempt.
    } else {
      try { unlinkSync(temporary); } catch { /* No temporary was installed. */ }
    }
    if (error instanceof ProductionPlayerCanaryReceiptError) throw error;
    return fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INSTALL_INVALID');
  } finally {
    bytes.fill(0);
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function receiptForEvidenceAuthority(authority) {
  return {
    schemaVersion: 1,
    profile: PRODUCTION_PLAYER_CANARY_PROFILE,
    source: {
      protectedCommit: authority.protectedCommit,
      protectedTree: authority.protectedTree,
    },
    predecessor: {
      phaseTuple: PRODUCTION_PLAYER_CANARY_PREDECESSOR_TUPLE,
      releaseVersion: PRODUCTION_PLAYER_CANARY_PREDECESSOR_VERSION,
      worldClientPresentationEnabled: false,
      worldServerPresentationEnabled: false,
      pagesSourceCommit: authority.notificationPagesLivePagesSourceCommit,
      liveReceiptDigest: authority.notificationPagesLiveReceiptDigest,
      liveRootReceiptDigest: authority.notificationPagesLiveRootReceiptDigest,
      liveRootPagesSourceCommit:
        authority.notificationPagesLiveRootPagesSourceCommit,
    },
    evidenceAuthority: authority,
    recordedAt: authority.recordedAt,
  };
}

/** Bind a durable operator intent to the exact bytes before publication. */
export function productionPlayerCanaryReceiptDigestForEvidenceAuthority(value) {
  const authority = requireProductionPlayerCanaryExpectedEvidenceAuthority(value);
  const bytes = canonicalProductionPlayerCanaryReceiptBytes(
    receiptForEvidenceAuthority(authority),
  );
  try {
    return createHash('sha256').update(bytes).digest('hex');
  } finally {
    bytes.fill(0);
  }
}

export function prepareProductionPlayerCanaryReceiptInstallation({
  evidenceAuthority: value,
} = {}) {
  const authority = requireProductionPlayerCanaryExpectedEvidenceAuthority(value);
  const receiptDigest = productionPlayerCanaryReceiptDigestForEvidenceAuthority(
    authority,
  );
  const authorityBytes = Buffer.from(JSON.stringify(authority), 'utf8');
  try {
    return Object.freeze({
      receiptDigest,
      evidenceAuthorityDigest: createHash('sha256')
        .update('warpkeep.production-player-canary.evidence-authority.v1\0', 'utf8')
        .update(authorityBytes)
        .digest('hex'),
      recordedAt: authority.recordedAt,
      notAfter: authority.notAfter,
    });
  } finally {
    authorityBytes.fill(0);
  }
}

/**
 * Recover an exact post-link operator crash from a previously journaled digest.
 * No fresh authority is inferred and no different receipt is accepted.
 */
export function reconcileProductionPlayerCanaryReceiptInstallation({
  directory = defaultProductionPlayerCanaryReceiptDirectory(),
  expectedReceiptDigest,
} = {}) {
  if (!exactDigest(expectedReceiptDigest)) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_RECONCILIATION_INPUT_INVALID');
  }
  const canonicalDirectory = exactDirectory(
    directory,
    'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_INVALID',
  );
  const expectedFilename =
    `production-player-canary-${expectedReceiptDigest}.json`;
  for (const name of readdirSync(canonicalDirectory).sort()) {
    const temporary = TEMPORARY_NAME.exec(name);
    if (
      name !== expectedFilename
      && (temporary === null || temporary[1] !== expectedReceiptDigest)
    ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  }
  reconcileReceiptDirectory(canonicalDirectory);
  const names = readdirSync(canonicalDirectory).sort();
  if (names.length === 0) {
    return Object.freeze({ state: 'absent' });
  }
  if (names.length !== 1 || names[0] !== expectedFilename) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_CONTENT_INVALID');
  }
  const bytes = readExactReceipt(
    join(canonicalDirectory, expectedFilename),
    expectedReceiptDigest,
  );
  try {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
    }
    const receipt = parseProductionPlayerCanaryReceipt(parsed);
    const canonical = canonicalProductionPlayerCanaryReceiptBytes(receipt);
    try {
      if (!canonical.equals(bytes)) {
        fail('PRODUCTION_PLAYER_CANARY_RECEIPT_NONCANONICAL');
      }
    } finally {
      canonical.fill(0);
    }
  } finally {
    bytes.fill(0);
  }
  return Object.freeze({
    state: 'installed',
    filename: expectedFilename,
    receiptDigest: expectedReceiptDigest,
    result: 'unchanged',
  });
}

function inspectSettledReceiptAtDirectory(directory, expectedReceiptDigest) {
  if (!exactDigest(expectedReceiptDigest)) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INSPECTION_INPUT_INVALID');
  }
  const canonicalDirectory = exactDirectory(
    directory,
    'PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_INVALID',
  );
  const filename = `production-player-canary-${expectedReceiptDigest}.json`;
  let names;
  try { names = readdirSync(canonicalDirectory).sort(); } catch {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_DIRECTORY_INVALID');
  }
  if (names.length !== 1 || names[0] !== filename) {
    fail('PRODUCTION_PLAYER_CANARY_RECEIPT_NOT_SETTLED');
  }
  const bytes = readExactReceipt(
    join(canonicalDirectory, filename),
    expectedReceiptDigest,
  );
  try {
    let parsed;
    try {
      parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch {
      fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INVALID');
    }
    const receipt = parseProductionPlayerCanaryReceipt(parsed);
    const canonical = canonicalProductionPlayerCanaryReceiptBytes(receipt);
    try {
      if (!canonical.equals(bytes)) {
        fail('PRODUCTION_PLAYER_CANARY_RECEIPT_NONCANONICAL');
      }
    } finally { canonical.fill(0); }
    return Object.freeze({
      filename,
      receiptDigest: expectedReceiptDigest,
      receipt,
    });
  } finally { bytes.fill(0); }
}

/**
 * Inspect exactly one installed receipt. Unlike reconciliation, this function
 * never removes a temporary, installs a hard link, or fsyncs a directory.
 */
export function inspectSettledProductionPlayerCanaryReceipt(input = {}) {
  const ownKeys = input !== null && typeof input === 'object'
    ? Reflect.ownKeys(input)
    : [];
  if (
    input === null
    || typeof input !== 'object'
    || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype
    || ownKeys.some(key => typeof key !== 'string')
    || ownKeys.join('\0') !== 'expectedReceiptDigest'
    || (() => {
      const descriptor = Object.getOwnPropertyDescriptor(
        input,
        'expectedReceiptDigest',
      );
      return descriptor === undefined
        || descriptor.enumerable !== true
        || !Object.hasOwn(descriptor, 'value')
        || Object.hasOwn(descriptor, 'get')
        || Object.hasOwn(descriptor, 'set');
    })()
  ) fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INSPECTION_INPUT_INVALID');
  return inspectSettledReceiptAtDirectory(
    defaultProductionPlayerCanaryReceiptDirectory(),
    input.expectedReceiptDigest,
  );
}

export function installProductionPlayerCanaryReceipt(input) {
  const authority = requireProductionPlayerCanaryExpectedEvidenceAuthority(
    input?.evidenceAuthority,
  );
  const receipt = receiptForEvidenceAuthority(authority);
  if (input?.expectedReceiptDigest !== undefined) {
    const bytes = canonicalProductionPlayerCanaryReceiptBytes(receipt);
    try {
      if (createHash('sha256').update(bytes).digest('hex')
        !== input.expectedReceiptDigest) {
        fail('PRODUCTION_PLAYER_CANARY_RECEIPT_INTENT_MISMATCH');
      }
    } finally { bytes.fill(0); }
  }
  return installReceipt({
    directory: input.directory,
    randomId: input.randomId,
    receipt,
  });
}

export const productionPlayerCanaryReceiptTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
      exactDirectory,
      inspectActivationAuthority,
      inspectSettledReceiptAtDirectory,
      installReceipt,
      reconcileReceiptDirectory,
      receiptName: RECEIPT_NAME,
      temporaryName: TEMPORARY_NAME,
    })
    : undefined;
