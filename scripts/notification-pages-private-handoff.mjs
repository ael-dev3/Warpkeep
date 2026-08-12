import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
} from 'node:fs';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS,
  parseAuthBridgeNotificationPreparedReceipt,
  verifyAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';

export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_KIND =
  'warpkeep-notification-pages-private-handoff-v1';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW =
  '.github/workflows/deploy-pages.yml';
export const NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY =
  'ael-dev3/Warpkeep';

const CIPHER = 'aes-256-gcm';
const REPOSITORY_ROOT = realpathSync(resolve(import.meta.dirname, '..'));
const FILE_MODE = 0o600;
const KEY_BYTES = 32;
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PREPARED_RECEIPT_BYTES = 8 * 1024;
const MAX_CUTOVER_RECEIPT_BYTES = 64 * 1024;
const MAX_HANDOFF_BYTES = 256 * 1024;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const BASE64URL = /^(?:[A-Za-z0-9_-]{2,})$/u;
const U64 = /^(?:0|[1-9][0-9]*)$/u;
const U64_MAXIMUM = (1n << 64n) - 1n;
const MAXIMUM_FOUNDER_COUNT = 600;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
});

const HEADER_KEYS = Object.freeze([
  'repository',
  'workflow',
  'workflowRunId',
  'workflowRunAttempt',
  'pagesSourceCommit',
  'expectedFounderCount',
  'activeEvidenceMaximumAgeMilliseconds',
  'bridgeSourceCommit',
  'preparedReceiptDigest',
  'activeV17ReceiptDigest',
  'deployedModuleReceiptDigest',
  'createdAt',
  'expiresAt',
]);
const PAYLOAD_KEYS = Object.freeze([
  'preparedReceipt',
  'activeV17Receipt',
  'deployedModuleReceipt',
]);
const ENVELOPE_KEYS = Object.freeze([
  'schemaVersion',
  'kind',
  'cipher',
  'keyId',
  'header',
  'nonce',
  'ciphertext',
  'authenticationTag',
]);
const PRIVATE_RECEIPT_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'recordedAt', 'target', 'record',
].sort());
const ACTIVE_RECORD_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'command', 'reducer', 'outcome', 'submitted',
  'atlasSourceCommit', 'atlasId', 'publicReleaseId', 'expectedReleaseSha256',
  'moduleSourceCommit', 'beforeMode', 'afterMode', 'releaseState',
  'currentFounderCount', 'founderCapacityRemaining', 'activeClaimRows',
  'occupancyRows', 'legacyClaimRows', 'auditRowsBefore', 'auditRowsAfter',
  'auditRowsDelta', 'activeAdmissionEligible', 'topologySnapshotDigest',
  'relocationPlanDigest', 'statusDigest', 'operationReceiptChainDigest',
  'operationReceiptCount',
].sort());
const PUBLISH_RECORD_KEYS = Object.freeze([
  'schemaVersion', 'kind', 'lane', 'outcome', 'target', 'atlasSourceCommit',
  'atlasId', 'publicReleaseId', 'expectedReleaseSha256', 'moduleSourceCommit',
  'moduleDeltaPolicy', 'artifactDigest', 'v14TableSchemaDigest',
  'v17TableSchemaDigest', 'predecessorTableCount', 'postTableCount',
  'schemaMutation', 'importMutationsCompiled', 'activationMutationsCompiled',
  'releaseState', 'activationMode', 'historicalAggregateDigest',
  'operationReceiptChainDigest', 'operationReceiptCount',
  'moduleTreeId', 'dependencyClosureDigest',
].sort());

export class NotificationPagesPrivateHandoffError extends Error {
  constructor(code) {
    super(code);
    this.name = 'NotificationPagesPrivateHandoffError';
    this.code = code;
  }
}

function fail(code) {
  throw new NotificationPagesPrivateHandoffError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function exactOrderedKeys(value, keys) {
  return isRecord(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function canonicalUtc(value, code) {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function exactDate(value, code) {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) fail(code);
  return value.getTime();
}

function digest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function exactPattern(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function exactU64(value) {
  if (!exactPattern(value, U64)) return false;
  try {
    return BigInt(value) <= U64_MAXIMUM;
  } catch {
    return false;
  }
}

function keyId(key) {
  return createHash('sha256')
    .update('warpkeep-notification-pages-handoff-key-v1\0', 'utf8')
    .update(key)
    .digest('hex');
}

function decodeCanonicalBase64Url(value, expectedBytes, code) {
  if (typeof value !== 'string' || !BASE64URL.test(value) || value.includes('=')) {
    fail(code);
  }
  let bytes;
  try {
    bytes = Buffer.from(value, 'base64url');
  } catch {
    fail(code);
  }
  if (
    bytes.byteLength !== expectedBytes
    || bytes.toString('base64url') !== value
  ) {
    bytes.fill(0);
    fail(code);
  }
  return bytes;
}

function decodeBoundedReceipt(value, maximum, code) {
  if (typeof value !== 'string' || !BASE64URL.test(value) || value.includes('=')) {
    fail(code);
  }
  let bytes;
  try {
    bytes = Buffer.from(value, 'base64url');
  } catch {
    fail(code);
  }
  if (
    bytes.byteLength < 1
    || bytes.byteLength > maximum
    || bytes.toString('base64url') !== value
  ) {
    bytes.fill(0);
    fail(code);
  }
  return bytes;
}

function parseCanonicalJson(bytes, pretty, code) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail(code);
  }
  const canonical = `${JSON.stringify(value, null, pretty ? 2 : undefined)}\n`;
  if (source !== canonical) fail(code);
  return value;
}

function exactTarget(value, code) {
  if (
    !exactOrderedKeys(value, ['database', 'deleteData', 'uri'])
    || value.uri !== TARGET.uri
    || value.database !== TARGET.database
    || value.deleteData !== TARGET.deleteData
  ) fail(code);
}

function commonSourceRelease(record, code) {
  if (
    !exactPattern(record.atlasSourceCommit, SOURCE_COMMIT)
    || !exactPattern(record.moduleSourceCommit, SOURCE_COMMIT)
    || typeof record.atlasId !== 'string'
    || record.atlasId.length < 1
    || record.atlasId.length > 512
    || typeof record.publicReleaseId !== 'string'
    || record.publicReleaseId.length < 1
    || record.publicReleaseId.length > 512
    || !exactPattern(record.expectedReleaseSha256, SHA256_HEX)
    || !exactPattern(record.operationReceiptChainDigest, SHA256_HEX)
    || !Number.isSafeInteger(record.operationReceiptCount)
    || record.operationReceiptCount < 0
  ) fail(code);
  return Object.freeze({
    atlasSourceCommit: record.atlasSourceCommit,
    atlasId: record.atlasId,
    publicReleaseId: record.publicReleaseId,
    expectedReleaseSha256: record.expectedReleaseSha256,
    moduleSourceCommit: record.moduleSourceCommit,
  });
}

function inside(parent, candidate) {
  const difference = relative(parent, candidate);
  return difference === '' || (
    difference !== '..'
    && !difference.startsWith(`..${sep}`)
    && !isAbsolute(difference)
  );
}

function parsePrivateCutoverReceipt(bytes, kind, recordKeys, recordValidator, code) {
  const value = parseCanonicalJson(bytes, true, code);
  if (
    !exactOrderedKeys(value, PRIVATE_RECEIPT_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== kind
  ) fail(code);
  canonicalUtc(value.recordedAt, code);
  exactTarget(value.target, code);
  if (!exactOrderedKeys(value.record, recordKeys)) fail(code);
  const sourceRelease = recordValidator(value.record, code);
  return Object.freeze({ wrapper: value, record: value.record, sourceRelease });
}

function validateActiveRecord(record, code) {
  const sourceRelease = commonSourceRelease(record, code);
  const population = Number.isSafeInteger(record.currentFounderCount)
    ? record.currentFounderCount
    : -1;
  if (
    record.schemaVersion !== 1
    || record.kind !== 'warpkeep-greater-realm-production-relocation-v1'
    || record.command !== 'commit'
    || record.reducer !== 'admin_commit_greater_realm_active_v1'
    || (record.outcome !== 'verified' && record.outcome !== 'verified-after-submission-error')
    || record.submitted !== true
    || record.beforeMode !== 'canary'
    || record.afterMode !== 'active'
    || record.releaseState !== 'active'
    || population < 1
    || population > MAXIMUM_FOUNDER_COUNT
    || record.founderCapacityRemaining !== MAXIMUM_FOUNDER_COUNT - population
    || record.activeClaimRows !== population.toString()
    || record.occupancyRows !== population.toString()
    || record.legacyClaimRows !== '0'
    || !exactU64(record.auditRowsBefore)
    || !exactU64(record.auditRowsAfter)
    || record.auditRowsDelta !== '1'
    || record.activeAdmissionEligible !== (population < MAXIMUM_FOUNDER_COUNT)
    || BigInt(record.auditRowsAfter) - BigInt(record.auditRowsBefore) !== 1n
    || !exactPattern(record.topologySnapshotDigest, SHA256_HEX)
    || !exactPattern(record.relocationPlanDigest, SHA256_HEX)
    || !exactPattern(record.statusDigest, SHA256_HEX)
    || record.operationReceiptCount !== 1
  ) fail(code);
  return sourceRelease;
}

function validatePublishRecord(record, code) {
  const sourceRelease = commonSourceRelease(record, code);
  exactTarget(record.target, code);
  if (
    record.schemaVersion !== 1
    || record.kind !== 'warpkeep-greater-realm-production-publish-v1'
    || record.lane !== 'forward-activation-active-v17'
    || (record.outcome !== 'verified' && record.outcome !== 'verified-after-submission-error')
    || record.moduleDeltaPolicy !== 'reviewed-same-schema'
    || !exactPattern(record.artifactDigest, SHA256_HEX)
    || !exactPattern(record.v14TableSchemaDigest, SHA256_HEX)
    || !exactPattern(record.v17TableSchemaDigest, SHA256_HEX)
    || record.predecessorTableCount !== 84
    || record.postTableCount !== 84
    || record.schemaMutation !== 'none'
    || record.importMutationsCompiled !== false
    || record.activationMutationsCompiled !== true
    || record.releaseState !== 'active'
    || record.activationMode !== 'active'
    || !exactPattern(record.historicalAggregateDigest, SHA256_HEX)
    || record.operationReceiptCount !== 1
    || !exactPattern(record.moduleTreeId, SOURCE_COMMIT)
    || !exactPattern(record.dependencyClosureDigest, SHA256_HEX)
  ) fail(code);
  return sourceRelease;
}

function validateHeader(value, now) {
  if (
    !exactOrderedKeys(value, HEADER_KEYS)
    || value.repository !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY
    || value.workflow !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW
    || !exactPattern(value.workflowRunId, RUN_ID)
    || !exactPattern(value.workflowRunAttempt, RUN_ID)
    || !exactPattern(value.pagesSourceCommit, SOURCE_COMMIT)
    || !Number.isSafeInteger(value.expectedFounderCount)
    || value.expectedFounderCount < 1
    || value.expectedFounderCount > MAXIMUM_FOUNDER_COUNT
    || !Number.isSafeInteger(value.activeEvidenceMaximumAgeMilliseconds)
    || value.activeEvidenceMaximumAgeMilliseconds < 1
    || value.activeEvidenceMaximumAgeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
    || !exactPattern(value.bridgeSourceCommit, SOURCE_COMMIT)
    || !exactPattern(value.preparedReceiptDigest, SHA256_HEX)
    || !exactPattern(value.activeV17ReceiptDigest, SHA256_HEX)
    || !exactPattern(value.deployedModuleReceiptDigest, SHA256_HEX)
  ) fail('NOTIFICATION_PAGES_HANDOFF_HEADER_INVALID');
  const createdAt = canonicalUtc(value.createdAt, 'NOTIFICATION_PAGES_HANDOFF_TIME_INVALID');
  const expiresAt = canonicalUtc(value.expiresAt, 'NOTIFICATION_PAGES_HANDOFF_TIME_INVALID');
  const lifetime = Date.parse(expiresAt) - Date.parse(createdAt);
  const current = exactDate(now, 'NOTIFICATION_PAGES_HANDOFF_TIME_INVALID');
  if (
    lifetime <= 0
    || lifetime > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
    || Date.parse(createdAt) > current
    || Date.parse(expiresAt) <= current
  ) fail('NOTIFICATION_PAGES_HANDOFF_EXPIRED');
  return Object.freeze({ ...value });
}

function aad(header) {
  return Buffer.from(
    `${NOTIFICATION_PAGES_PRIVATE_HANDOFF_KIND}\0${JSON.stringify(header)}`,
    'utf8',
  );
}

function parseEnvelopeBytes(bytes, now) {
  if (!Buffer.isBuffer(bytes) || bytes.byteLength < 1 || bytes.byteLength > MAX_HANDOFF_BYTES) {
    fail('NOTIFICATION_PAGES_HANDOFF_FILE_INVALID');
  }
  const value = parseCanonicalJson(bytes, false, 'NOTIFICATION_PAGES_HANDOFF_ENVELOPE_INVALID');
  if (
    !exactOrderedKeys(value, ENVELOPE_KEYS)
    || value.schemaVersion !== 1
    || value.kind !== NOTIFICATION_PAGES_PRIVATE_HANDOFF_KIND
    || value.cipher !== CIPHER
    || typeof value.keyId !== 'string'
    || !SHA256_HEX.test(value.keyId)
    || typeof value.ciphertext !== 'string'
    || !BASE64URL.test(value.ciphertext)
  ) fail('NOTIFICATION_PAGES_HANDOFF_ENVELOPE_INVALID');
  return Object.freeze({ value, header: validateHeader(value.header, now) });
}

function privateInputPath(path, repositoryRoot, code) {
  if (
    typeof path !== 'string'
    || !isAbsolute(path)
    || resolve(path) !== path
    || typeof repositoryRoot !== 'string'
    || !isAbsolute(repositoryRoot)
    || resolve(repositoryRoot) !== repositoryRoot
  ) fail(code);
  if (repositoryRoot !== REPOSITORY_ROOT) fail('NOTIFICATION_PAGES_HANDOFF_REPOSITORY_INVALID');
  let repository;
  let parent;
  let parentMetadata;
  let parentFollowedMetadata;
  try {
    repository = realpathSync(repositoryRoot);
    parent = realpathSync(dirname(path));
    parentMetadata = lstatSync(dirname(path));
    parentFollowedMetadata = statSync(dirname(path));
  } catch {
    fail(code);
  }
  if (
    repository !== repositoryRoot
    || parent !== dirname(path)
    || !parentMetadata.isDirectory()
    || parentMetadata.isSymbolicLink()
    || !parentFollowedMetadata.isDirectory()
    || (process.getuid !== undefined && parentMetadata.uid !== process.getuid())
    || (parentFollowedMetadata.mode & 0o7777) !== 0o700
    || inside(repository, path)
    || inside(path, repository)
  ) fail(code);
}

function gitResult(arguments_) {
  return spawnSync(
    '/usr/bin/git',
    ['--no-optional-locks', ...arguments_],
    {
      cwd: REPOSITORY_ROOT,
      encoding: 'utf8',
      env: {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_CONFIG_SYSTEM: '/dev/null',
        GIT_NO_REPLACE_OBJECTS: '1',
        HOME: '/nonexistent',
        PATH: '/usr/bin:/bin',
      },
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
}

function exactGitLine(arguments_, pattern, code) {
  const result = gitResult(arguments_);
  const value = result.status === 0 ? result.stdout.trim() : '';
  if (!exactPattern(value, pattern)) fail(code);
  return value;
}

function assertGitAncestor(ancestor, descendant) {
  const result = gitResult(['merge-base', '--is-ancestor', ancestor, descendant]);
  if (result.status !== 0 || result.stdout !== '') {
    fail('NOTIFICATION_PAGES_HANDOFF_GIT_ANCESTRY_INVALID');
  }
}

function assertNotificationPagesGitProvenance(header, sourceRelease, moduleTreeId) {
  const head = exactGitLine(
    ['rev-parse', '--verify', 'HEAD^{commit}'],
    SOURCE_COMMIT,
    'NOTIFICATION_PAGES_HANDOFF_PAGES_SOURCE_INVALID',
  );
  if (head !== header.pagesSourceCommit) {
    fail('NOTIFICATION_PAGES_HANDOFF_PAGES_SOURCE_INVALID');
  }
  for (const commit of [
    sourceRelease.atlasSourceCommit,
    sourceRelease.moduleSourceCommit,
    header.bridgeSourceCommit,
  ]) {
    const resolved = exactGitLine(
      ['rev-parse', '--verify', `${commit}^{commit}`],
      SOURCE_COMMIT,
      'NOTIFICATION_PAGES_HANDOFF_GIT_SOURCE_INVALID',
    );
    if (resolved !== commit) fail('NOTIFICATION_PAGES_HANDOFF_GIT_SOURCE_INVALID');
  }
  assertGitAncestor(sourceRelease.atlasSourceCommit, sourceRelease.moduleSourceCommit);
  assertGitAncestor(sourceRelease.moduleSourceCommit, header.pagesSourceCommit);
  assertGitAncestor(header.bridgeSourceCommit, header.pagesSourceCommit);
  const tree = exactGitLine(
    ['rev-parse', '--verify', `${sourceRelease.moduleSourceCommit}^{tree}`],
    SOURCE_COMMIT,
    'NOTIFICATION_PAGES_HANDOFF_MODULE_TREE_INVALID',
  );
  if (tree !== moduleTreeId) fail('NOTIFICATION_PAGES_HANDOFF_MODULE_TREE_INVALID');
  const moduleDelta = gitResult([
    'diff',
    '--quiet',
    '--no-ext-diff',
    '--no-textconv',
    sourceRelease.moduleSourceCommit,
    header.pagesSourceCommit,
    '--',
    'spacetimedb',
  ]);
  if (moduleDelta.status !== 0 || moduleDelta.stdout !== '') {
    fail('NOTIFICATION_PAGES_HANDOFF_MODULE_SOURCE_DRIFT');
  }
}

function stablePrivateFile(path, repositoryRoot, maximum, code) {
  privateInputPath(path, repositoryRoot, code);
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) fail(code);
  let descriptor;
  try {
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.nlink !== 1
      || (process.getuid !== undefined && before.uid !== process.getuid())
      || (before.mode & 0o7777) !== FILE_MODE
      || before.size < 1
      || before.size > maximum
    ) fail(code);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
    ) {
      bytes.fill(0);
      fail(code);
    }
    return bytes;
  } catch (error) {
    if (error instanceof NotificationPagesPrivateHandoffError) throw error;
    fail(code);
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function readNotificationPagesPrivateHandoffKey(path, repositoryRoot) {
  const bytes = stablePrivateFile(
    path,
    repositoryRoot,
    128,
    'NOTIFICATION_PAGES_HANDOFF_KEY_FILE_INVALID',
  );
  try {
    let source;
    try {
      source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      fail('NOTIFICATION_PAGES_HANDOFF_KEY_INVALID');
    }
    if (source.endsWith('\n')) source = source.slice(0, -1);
    if (source.includes('\n') || source.includes('\r') || source.trim() !== source) {
      fail('NOTIFICATION_PAGES_HANDOFF_KEY_INVALID');
    }
    return decodeCanonicalBase64Url(
      source,
      KEY_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_KEY_INVALID',
    );
  } finally {
    bytes.fill(0);
  }
}

export function createNotificationPagesPrivateHandoff({
  key,
  workflowRunId,
  workflowRunAttempt,
  pagesSourceCommit,
  expectedFounderCount,
  activeEvidenceMaximumAgeMilliseconds,
  bridgeSourceCommit,
  preparedReceiptBytes,
  activeV17ReceiptBytes,
  deployedModuleReceiptBytes,
  createdAt,
  expiresAt,
  randomBytesImpl = randomBytes,
} = {}) {
  if (!Buffer.isBuffer(key) || key.byteLength !== KEY_BYTES) {
    fail('NOTIFICATION_PAGES_HANDOFF_KEY_INVALID');
  }
  if (
    !(preparedReceiptBytes instanceof Uint8Array)
    || preparedReceiptBytes.byteLength < 1
    || preparedReceiptBytes.byteLength > MAX_PREPARED_RECEIPT_BYTES
    || !(activeV17ReceiptBytes instanceof Uint8Array)
    || activeV17ReceiptBytes.byteLength < 1
    || activeV17ReceiptBytes.byteLength > MAX_CUTOVER_RECEIPT_BYTES
    || !(deployedModuleReceiptBytes instanceof Uint8Array)
    || deployedModuleReceiptBytes.byteLength < 1
    || deployedModuleReceiptBytes.byteLength > MAX_CUTOVER_RECEIPT_BYTES
  ) fail('NOTIFICATION_PAGES_HANDOFF_RECEIPT_SIZE_INVALID');
  const prepared = Buffer.from(preparedReceiptBytes ?? []);
  const active = Buffer.from(activeV17ReceiptBytes ?? []);
  const deployed = Buffer.from(deployedModuleReceiptBytes ?? []);
  let nonce;
  let plaintext;
  try {
    const preparedValue = parseAuthBridgeNotificationPreparedReceipt(
      parseCanonicalJson(prepared, false, 'NOTIFICATION_PAGES_HANDOFF_PREPARED_RECEIPT_INVALID'),
    );
    const creation = createdAt ?? new Date();
    const createdAtMs = exactDate(creation, 'NOTIFICATION_PAGES_HANDOFF_TIME_INVALID');
    const expiry = expiresAt ?? new Date(preparedValue.expiresAt);
    const header = validateHeader({
      repository: NOTIFICATION_PAGES_PRIVATE_HANDOFF_REPOSITORY,
      workflow: NOTIFICATION_PAGES_PRIVATE_HANDOFF_WORKFLOW,
      workflowRunId,
      workflowRunAttempt,
      pagesSourceCommit,
      expectedFounderCount,
      activeEvidenceMaximumAgeMilliseconds,
      bridgeSourceCommit,
      preparedReceiptDigest: digest(prepared),
      activeV17ReceiptDigest: digest(active),
      deployedModuleReceiptDigest: digest(deployed),
      createdAt: creation.toISOString(),
      expiresAt: expiry.toISOString(),
    }, creation);
    if (
      prepared.byteLength > MAX_PREPARED_RECEIPT_BYTES
      || `${JSON.stringify(preparedValue)}\n` !== prepared.toString('utf8')
      || preparedValue.bridgeSourceCommit !== bridgeSourceCommit
      || preparedValue.expiresAt !== header.expiresAt
    ) fail('NOTIFICATION_PAGES_HANDOFF_PREPARED_RECEIPT_INVALID');
    const activeReceipt = parsePrivateCutoverReceipt(
      active,
      'warpkeep-greater-realm-production-relocation-v1',
      ACTIVE_RECORD_KEYS,
      validateActiveRecord,
      'NOTIFICATION_PAGES_HANDOFF_ACTIVE_RECEIPT_INVALID',
    );
    const deployedReceipt = parsePrivateCutoverReceipt(
      deployed,
      'warpkeep-greater-realm-production-publish-v1',
      PUBLISH_RECORD_KEYS,
      validatePublishRecord,
      'NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID',
    );
    if (JSON.stringify(activeReceipt.sourceRelease) !== JSON.stringify(deployedReceipt.sourceRelease)) {
      fail('NOTIFICATION_PAGES_HANDOFF_SOURCE_RELEASE_MISMATCH');
    }
    if (activeReceipt.record.currentFounderCount !== header.expectedFounderCount) {
      fail('NOTIFICATION_PAGES_HANDOFF_FOUNDER_COUNT_MISMATCH');
    }
    const activeRecordedAt = Date.parse(activeReceipt.wrapper.recordedAt);
    const deployedRecordedAt = Date.parse(deployedReceipt.wrapper.recordedAt);
    const preparedAt = Date.parse(preparedValue.preparedAt);
    if (
      activeRecordedAt > deployedRecordedAt
      || deployedRecordedAt > preparedAt
      || preparedAt > createdAtMs
      || createdAtMs - activeRecordedAt > header.activeEvidenceMaximumAgeMilliseconds
    ) fail('NOTIFICATION_PAGES_HANDOFF_EVIDENCE_ORDER_INVALID');
    const payload = Object.freeze({
      preparedReceipt: prepared.toString('base64url'),
      activeV17Receipt: active.toString('base64url'),
      deployedModuleReceipt: deployed.toString('base64url'),
    });
    plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    nonce = randomBytesImpl(NONCE_BYTES);
    if (!Buffer.isBuffer(nonce) || nonce.byteLength !== NONCE_BYTES) {
      fail('NOTIFICATION_PAGES_HANDOFF_NONCE_INVALID');
    }
    const associatedData = aad(header);
    try {
      const cipher = createCipheriv(CIPHER, key, nonce, { authTagLength: TAG_BYTES });
      cipher.setAAD(associatedData);
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const authenticationTag = cipher.getAuthTag();
      const envelope = Object.freeze({
        schemaVersion: 1,
        kind: NOTIFICATION_PAGES_PRIVATE_HANDOFF_KIND,
        cipher: CIPHER,
        keyId: keyId(key),
        header,
        nonce: nonce.toString('base64url'),
        ciphertext: ciphertext.toString('base64url'),
        authenticationTag: authenticationTag.toString('base64url'),
      });
      const bytes = Buffer.from(`${JSON.stringify(envelope)}\n`, 'utf8');
      if (bytes.byteLength > MAX_HANDOFF_BYTES) {
        bytes.fill(0);
        fail('NOTIFICATION_PAGES_HANDOFF_FILE_INVALID');
      }
      return Object.freeze({
        bytes,
        digest: digest(bytes),
        keyId: envelope.keyId,
        header,
      });
    } finally {
      associatedData.fill(0);
    }
  } finally {
    prepared.fill(0);
    active.fill(0);
    deployed.fill(0);
    plaintext?.fill(0);
    nonce?.fill(0);
  }
}

export async function inspectNotificationPagesPrivateHandoff({
  handoffPath,
  keyPath,
  repositoryRoot,
  expectedHandoffDigest,
  expectedKeyId,
  expectedWorkflowRunId,
  expectedWorkflowRunAttempt,
  expectedPagesSourceCommit,
  expectedFounderCount,
  expectedActiveEvidenceMaximumAgeMilliseconds,
  expectedPreparedReceiptDigest,
  expectedActiveV17ReceiptDigest,
  expectedDeployedModuleReceiptDigest,
  expectedBridgeSourceCommit,
  fetchImpl = fetch,
  now = new Date(),
} = {}) {
  for (const [value, pattern] of [
    [expectedHandoffDigest, SHA256_HEX],
    [expectedKeyId, SHA256_HEX],
    [expectedWorkflowRunId, RUN_ID],
    [expectedWorkflowRunAttempt, RUN_ID],
    [expectedPagesSourceCommit, SOURCE_COMMIT],
    [expectedPreparedReceiptDigest, SHA256_HEX],
    [expectedActiveV17ReceiptDigest, SHA256_HEX],
    [expectedDeployedModuleReceiptDigest, SHA256_HEX],
    [expectedBridgeSourceCommit, SOURCE_COMMIT],
  ]) {
    if (!exactPattern(value, pattern)) {
      fail('NOTIFICATION_PAGES_HANDOFF_EXPECTATION_INVALID');
    }
  }
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > MAXIMUM_FOUNDER_COUNT
    || !Number.isSafeInteger(expectedActiveEvidenceMaximumAgeMilliseconds)
    || expectedActiveEvidenceMaximumAgeMilliseconds < 1
    || expectedActiveEvidenceMaximumAgeMilliseconds
      > AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS
  ) fail('NOTIFICATION_PAGES_HANDOFF_EXPECTATION_INVALID');
  if (handoffPath === keyPath) {
    fail('NOTIFICATION_PAGES_HANDOFF_EXPECTATION_INVALID');
  }
  const envelopeBytes = stablePrivateFile(
    handoffPath,
    repositoryRoot,
    MAX_HANDOFF_BYTES,
    'NOTIFICATION_PAGES_HANDOFF_FILE_INVALID',
  );
  const key = readNotificationPagesPrivateHandoffKey(keyPath, repositoryRoot);
  let plaintext;
  let preparedBytes;
  let activeBytes;
  let deployedBytes;
  try {
    if (digest(envelopeBytes) !== expectedHandoffDigest) {
      fail('NOTIFICATION_PAGES_HANDOFF_DIGEST_MISMATCH');
    }
    const parsed = parseEnvelopeBytes(envelopeBytes, now);
    const { value, header } = parsed;
    if (
      value.keyId !== expectedKeyId
      || keyId(key) !== expectedKeyId
      || header.workflowRunId !== expectedWorkflowRunId
      || header.workflowRunAttempt !== expectedWorkflowRunAttempt
      || header.pagesSourceCommit !== expectedPagesSourceCommit
      || header.expectedFounderCount !== expectedFounderCount
      || header.activeEvidenceMaximumAgeMilliseconds
        !== expectedActiveEvidenceMaximumAgeMilliseconds
      || header.preparedReceiptDigest !== expectedPreparedReceiptDigest
      || header.activeV17ReceiptDigest !== expectedActiveV17ReceiptDigest
      || header.deployedModuleReceiptDigest !== expectedDeployedModuleReceiptDigest
      || header.bridgeSourceCommit !== expectedBridgeSourceCommit
    ) fail('NOTIFICATION_PAGES_HANDOFF_BINDING_MISMATCH');
    const nonce = decodeCanonicalBase64Url(
      value.nonce,
      NONCE_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_ENVELOPE_INVALID',
    );
    const tag = decodeCanonicalBase64Url(
      value.authenticationTag,
      TAG_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_ENVELOPE_INVALID',
    );
    const ciphertext = decodeBoundedReceipt(
      value.ciphertext,
      MAX_HANDOFF_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_ENVELOPE_INVALID',
    );
    const associatedData = aad(header);
    try {
      const decipher = createDecipheriv(CIPHER, key, nonce, { authTagLength: TAG_BYTES });
      decipher.setAAD(associatedData);
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      fail('NOTIFICATION_PAGES_HANDOFF_AUTHENTICATION_FAILED');
    } finally {
      nonce.fill(0);
      tag.fill(0);
      ciphertext.fill(0);
      associatedData.fill(0);
    }
    let payload;
    try {
      payload = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plaintext));
    } catch {
      fail('NOTIFICATION_PAGES_HANDOFF_PAYLOAD_INVALID');
    }
    if (
      !exactOrderedKeys(payload, PAYLOAD_KEYS)
      || JSON.stringify(payload) !== plaintext.toString('utf8')
    ) fail('NOTIFICATION_PAGES_HANDOFF_PAYLOAD_INVALID');
    preparedBytes = decodeBoundedReceipt(
      payload.preparedReceipt,
      MAX_PREPARED_RECEIPT_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_PREPARED_RECEIPT_INVALID',
    );
    activeBytes = decodeBoundedReceipt(
      payload.activeV17Receipt,
      MAX_CUTOVER_RECEIPT_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_ACTIVE_RECEIPT_INVALID',
    );
    deployedBytes = decodeBoundedReceipt(
      payload.deployedModuleReceipt,
      MAX_CUTOVER_RECEIPT_BYTES,
      'NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID',
    );
    if (
      digest(preparedBytes) !== header.preparedReceiptDigest
      || digest(activeBytes) !== header.activeV17ReceiptDigest
      || digest(deployedBytes) !== header.deployedModuleReceiptDigest
    ) fail('NOTIFICATION_PAGES_HANDOFF_RECEIPT_DIGEST_MISMATCH');
    const preparedReceipt = parseAuthBridgeNotificationPreparedReceipt(
      parseCanonicalJson(
        preparedBytes,
        false,
        'NOTIFICATION_PAGES_HANDOFF_PREPARED_RECEIPT_INVALID',
      ),
    );
    if (
      `${JSON.stringify(preparedReceipt)}\n` !== preparedBytes.toString('utf8')
      || preparedReceipt.bridgeSourceCommit !== header.bridgeSourceCommit
      || preparedReceipt.expiresAt !== header.expiresAt
    ) fail('NOTIFICATION_PAGES_HANDOFF_PREPARED_RECEIPT_INVALID');
    const activeReceipt = parsePrivateCutoverReceipt(
      activeBytes,
      'warpkeep-greater-realm-production-relocation-v1',
      ACTIVE_RECORD_KEYS,
      validateActiveRecord,
      'NOTIFICATION_PAGES_HANDOFF_ACTIVE_RECEIPT_INVALID',
    );
    const deployedReceipt = parsePrivateCutoverReceipt(
      deployedBytes,
      'warpkeep-greater-realm-production-publish-v1',
      PUBLISH_RECORD_KEYS,
      validatePublishRecord,
      'NOTIFICATION_PAGES_HANDOFF_MODULE_RECEIPT_INVALID',
    );
    if (JSON.stringify(activeReceipt.sourceRelease) !== JSON.stringify(deployedReceipt.sourceRelease)) {
      fail('NOTIFICATION_PAGES_HANDOFF_SOURCE_RELEASE_MISMATCH');
    }
    if (activeReceipt.record.currentFounderCount !== header.expectedFounderCount) {
      fail('NOTIFICATION_PAGES_HANDOFF_FOUNDER_COUNT_MISMATCH');
    }
    const activeRecordedAt = Date.parse(activeReceipt.wrapper.recordedAt);
    const deployedRecordedAt = Date.parse(deployedReceipt.wrapper.recordedAt);
    const preparedAt = Date.parse(preparedReceipt.preparedAt);
    if (
      activeRecordedAt > deployedRecordedAt
      || deployedRecordedAt > preparedAt
      || preparedAt > Date.parse(header.createdAt)
      || Date.parse(header.createdAt) - activeRecordedAt
        > header.activeEvidenceMaximumAgeMilliseconds
    ) fail('NOTIFICATION_PAGES_HANDOFF_EVIDENCE_ORDER_INVALID');
    assertNotificationPagesGitProvenance(
      header,
      activeReceipt.sourceRelease,
      deployedReceipt.record.moduleTreeId,
    );
    const verifiedPrepared = await verifyAuthBridgeNotificationPreparedReceipt({
      receipt: preparedReceipt,
      fetchImpl,
      now,
    });
    return Object.freeze({
      handoffDigest: expectedHandoffDigest,
      keyId: expectedKeyId,
      workflowRunId: header.workflowRunId,
      workflowRunAttempt: header.workflowRunAttempt,
      pagesSourceCommit: header.pagesSourceCommit,
      expectedFounderCount: header.expectedFounderCount,
      activeEvidenceMaximumAgeMilliseconds:
        header.activeEvidenceMaximumAgeMilliseconds,
      createdAt: header.createdAt,
      expiresAt: header.expiresAt,
      preparedReceiptDigest: header.preparedReceiptDigest,
      activeV17ReceiptDigest: header.activeV17ReceiptDigest,
      deployedModuleReceiptDigest: header.deployedModuleReceiptDigest,
      bridgeSourceCommit: header.bridgeSourceCommit,
      preparedReceipt: verifiedPrepared.receipt,
      liveAttestation: verifiedPrepared.liveAttestation,
      activeV17Receipt: activeReceipt.record,
      deployedModuleReceipt: deployedReceipt.record,
      sourceRelease: activeReceipt.sourceRelease,
    });
  } catch (error) {
    if (error instanceof NotificationPagesPrivateHandoffError) throw error;
    fail('NOTIFICATION_PAGES_HANDOFF_INVALID');
  } finally {
    envelopeBytes.fill(0);
    key.fill(0);
    plaintext?.fill(0);
    preparedBytes?.fill(0);
    activeBytes?.fill(0);
    deployedBytes?.fill(0);
  }
}
