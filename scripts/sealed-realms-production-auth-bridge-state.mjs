import { createHash, randomBytes } from 'node:crypto';

import {
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  parseAuthBridgeNotificationPreparedReceipt,
  resolveExistingAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';
import {
  resolveExistingAuthBridgeNotificationPreparedDeployJournal,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  assertSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';
import {
  preparationSourceCommitFromSealedRealmsProductionAuthority,
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';

export const SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE =
  'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
export const SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RECEIPT_PROFILE =
  'warpkeep-sealed-realms-auth-bridge-suspension-private-v1';
export const SEALED_REALMS_AUTH_BRIDGE_ACCESS_REQUEST_URL =
  'https://auth.warpkeep.com/v2/access/request';

const SUSPENSION_CONTENT_TYPE = 'application/json; charset=utf-8';
const SUSPENSION_ORIGIN = 'https://warpkeep.com';
const MAX_PROBE_BYTES = 16 * 1_024;
const MAX_CHAIN_BYTES = 512 * 1_024;
const MAX_CHAIN_RECORDS = 128;
const COMMIT = /^[a-f0-9]{40}$/u;
const DIGEST = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const AUTHORITY_RECORD_PREFIX =
  'warpkeep.sealed-realms.auth-bridge-import-authority-record.v1\n';
const SUSPENSION_RECEIPT_PREFIX =
  'warpkeep.sealed-realms.auth-bridge-suspension-private-receipt.v1\n';
const observations = new WeakMap();
const bridgeStates = new WeakSet();
const bridgeStateSources = new WeakMap();
const testOnlyCapabilities = new WeakSet();
const gateConfirmations = new WeakMap();
const activationConfirmations = new WeakMap();
const consumedActivationConfirmations = new WeakSet();
const activationEvidenceGenerators = new WeakMap();
const activationEvidenceMembers = new WeakMap();
const ownerProvisionConfirmations = new WeakMap();
const ownerProvisionChainClaims = new WeakMap();

export class SealedRealmsProductionAuthBridgeStateError extends Error {
  constructor(code) {
    super(code);
    this.name = 'SealedRealmsProductionAuthBridgeStateError';
    this.code = code;
  }
}

function fail(code) {
  throw new SealedRealmsProductionAuthBridgeStateError(code);
}

/** Test-only fixture authority; production construction cannot forge it. */
export function createSealedRealmsProductionAuthBridgeStateTestCapability() {
  if (process.env.NODE_ENV !== 'test') {
    fail('SEALED_REALMS_AUTH_BRIDGE_TEST_ONLY_FORBIDDEN');
  }
  const capability = Object.freeze({});
  testOnlyCapabilities.add(capability);
  return capability;
}

function exactObject(value, keys, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail(code);
  return value;
}

function exactSuspensionJson(bytes) {
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(source);
  } catch {
    fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
  }
  exactObject(value, ['error'], 'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
  exactObject(
    value.error,
    ['code', 'message'],
    'SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID',
  );
  if (
    value.error.code !== 'admission_requests_suspended'
    || value.error.message !== 'New admission requests are temporarily suspended.'
  ) fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
}

async function inspectOneSuspensionResponse(fetchImpl, request) {
  let response;
  let bytes;
  try {
    response = await fetchImpl(SEALED_REALMS_AUTH_BRIDGE_ACCESS_REQUEST_URL, request);
    if (
      response === null || typeof response !== 'object'
      || response.redirected === true
      || response.headers?.has('location') !== false
      || response.status !== 503
      || response.headers.get('content-type') !== SUSPENSION_CONTENT_TYPE
      || response.headers.get('access-control-allow-origin') !== SUSPENSION_ORIGIN
    ) fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
    const raw = await response.arrayBuffer();
    bytes = Buffer.from(raw);
    if (bytes.byteLength < 1 || bytes.byteLength > MAX_PROBE_BYTES) {
      fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
    }
    exactSuspensionJson(bytes);
    return Object.freeze({
      noRedirect: true,
      contentType: SUSPENSION_CONTENT_TYPE,
      accessControlAllowOrigin: SUSPENSION_ORIGIN,
      status: 503,
      bodyBase64: bytes.toString('base64'),
      digest: createHash('sha256').update(bytes).digest('hex'),
    });
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RESPONSE_INVALID');
  } finally {
    bytes?.fill(0);
  }
}

/**
 * Executes both exact suspended-admission probes. Returned data deliberately
 * excludes private response bytes; authenticated internal state keeps them
 * only for later owner-private record construction.
 */
export async function inspectSealedRealmsAdmissionSuspension({ fetchImpl } = {}) {
  if (typeof fetchImpl !== 'function') {
    fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_INPUT_INVALID');
  }
  const post = await inspectOneSuspensionResponse(fetchImpl, Object.freeze({
    method: 'POST',
    redirect: 'manual',
    headers: Object.freeze({
      origin: SUSPENSION_ORIGIN,
      'content-type': 'application/json',
    }),
    body: '{}',
  }));
  const options = await inspectOneSuspensionResponse(fetchImpl, Object.freeze({
    method: 'OPTIONS',
    redirect: 'manual',
    headers: Object.freeze({
      origin: SUSPENSION_ORIGIN,
      'access-control-request-method': 'POST',
      'access-control-request-headers':
        'authorization, content-type, x-warpkeep-expected-fid',
    }),
  }));
  const publicObservation = Object.freeze({
    postNoRedirect: post.noRedirect,
    postContentType: post.contentType,
    postAccessControlAllowOrigin: post.accessControlAllowOrigin,
    postProbeStatus: post.status,
    postProbeDigest: post.digest,
    optionsNoRedirect: options.noRedirect,
    optionsContentType: options.contentType,
    optionsAccessControlAllowOrigin: options.accessControlAllowOrigin,
    optionsProbeStatus: options.status,
    optionsProbeDigest: options.digest,
  });
  observations.set(publicObservation, Object.freeze({ post, options }));
  return publicObservation;
}

function privateSuspensionObservation(observation) {
  const value = observations.get(observation);
  if (value === undefined) {
    fail('SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_OBSERVATION_INVALID');
  }
  return value;
}

export function assertSealedRealmsAdmissionSuspensionObservation(observation) {
  privateSuspensionObservation(observation);
  return observation;
}

function strictUtc(value, code) {
  if (
    typeof value !== 'string' || !STRICT_UTC.test(value)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function digestRecord(bytes) {
  return createHash('sha256').update(AUTHORITY_RECORD_PREFIX).update(bytes).digest('hex');
}

function canonicalLine(value, code = 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID') {
  return canonicalJsonBytes(value, 32 * 1_024, code);
}

function canonicalJsonBytes(value, maximumBytes, code) {
  let bytes;
  try {
    bytes = Buffer.from(`${JSON.stringify(value)}\n`, 'utf8');
  } catch {
    fail(code);
  }
  if (bytes.byteLength < 2 || bytes.byteLength > maximumBytes) {
    bytes.fill(0);
    fail(code);
  }
  return bytes;
}

function canonicalBase64(value, minimum, maximum, code) {
  if (typeof value !== 'string' || value.length < 4 || value.length > maximum * 2) {
    fail(code);
  }
  let bytes;
  try {
    bytes = Buffer.from(value, 'base64');
  } catch {
    fail(code);
  }
  if (
    bytes.byteLength < minimum || bytes.byteLength > maximum
    || bytes.toString('base64') !== value
  ) {
    bytes.fill(0);
    fail(code);
  }
  return bytes;
}

function requiredDigest(value, code) {
  if (typeof value !== 'string' || !DIGEST.test(value)) fail(code);
  return value;
}

function requiredUuid(value, code) {
  if (typeof value !== 'string' || !UUID.test(value)) fail(code);
  return value;
}

function requiredCommit(value, code) {
  if (typeof value !== 'string' || !COMMIT.test(value)) fail(code);
  return value;
}

function expectedKeys(recordType) {
  const base = [
    'schemaVersion', 'profile', 'recordType', 'sourceCommit', 'previousRecordDigest',
  ];
  const suffixes = {
    deploymentAuthority: [
      'preparedReceiptBodyBase64', 'preparedReceiptDigest', 'preparedAt', 'expiresAt',
      'completedJournalHeadDigest', 'completedJournalProfile', 'completedJournalOutcome',
      'completedJournalPredecessorDigest', 'runId', 'runAttempt', 'completedAt',
      'deploymentId', 'workerVersionId', 'bridgeSourceCommit', 'ptrDatabaseIdentity',
      'ptrBindingDigest', 'controlPlaneAttestationDigest', 'publicAttestationDigest',
      'privateAttestationDigest', 'ptrBindingAttestationDigest', 'recordedAt',
    ],
    g002Gate: [
      'deploymentAuthorityDigest', 'lane', 'supersedesGateDigest', 'confirmationDigest',
      'deploymentId', 'workerVersionId', 'bridgeSourceCommit', 'ptrDatabaseIdentity',
      'ptrBindingDigest', 'deploymentAttestationDigest', 'bindingAttestationDigest',
      'postNoRedirect', 'postContentType', 'postAccessControlAllowOrigin',
      'postProbeStatus', 'postProbeBodyBase64', 'postProbeDigest', 'optionsNoRedirect',
      'optionsContentType', 'optionsAccessControlAllowOrigin', 'optionsProbeStatus',
      'optionsProbeBodyBase64', 'optionsProbeDigest', 'observedAt', 'nonce',
    ],
    ptrGate: [
      'deploymentAuthorityDigest', 'lane', 'supersedesGateDigest', 'confirmationDigest',
      'deploymentId', 'workerVersionId', 'bridgeSourceCommit', 'ptrDatabaseIdentity',
      'ptrBindingDigest', 'deploymentAttestationDigest', 'bindingAttestationDigest',
      'postNoRedirect', 'postContentType', 'postAccessControlAllowOrigin',
      'postProbeStatus', 'postProbeBodyBase64', 'postProbeDigest', 'optionsNoRedirect',
      'optionsContentType', 'optionsAccessControlAllowOrigin', 'optionsProbeStatus',
      'optionsProbeBodyBase64', 'optionsProbeDigest', 'observedAt', 'nonce',
    ],
    g002ImportAuthorityCrossLink: [
      'deploymentAuthorityDigest', 'lane', 'consumedGateDigest',
      'realmImportReceiptDigest', 'outcome', 'linkedAt',
    ],
    ptrImportAuthorityCrossLink: [
      'deploymentAuthorityDigest', 'lane', 'consumedGateDigest',
      'realmImportReceiptDigest', 'outcome', 'linkedAt',
    ],
  };
  const suffix = suffixes[recordType];
  if (suffix === undefined) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  return Object.freeze([...base, ...suffix]);
}

function exactRecord(value, recordType) {
  exactObject(value, expectedKeys(recordType), 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (
    value.schemaVersion !== 1
    || value.profile !== SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE
    || value.recordType !== recordType
  ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  requiredCommit(value.sourceCommit, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (value.previousRecordDigest !== null) {
    requiredDigest(value.previousRecordDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  return value;
}

function validateReceiptBody(value) {
  const bytes = canonicalBase64(
    value.preparedReceiptBodyBase64,
    1,
    8 * 1_024,
    'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID',
  );
  try {
    if (digest(bytes) !== value.preparedReceiptDigest) {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const receipt = parseAuthBridgeNotificationPreparedReceipt(JSON.parse(source));
    const canonical = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    if (
      canonical.receiptBytesBase64 !== value.preparedReceiptBodyBase64
      || canonical.receiptDigest !== value.preparedReceiptDigest
      || receipt.bridgeSourceCommit !== value.sourceCommit
      || receipt.preparedAt !== value.preparedAt
      || receipt.expiresAt !== value.expiresAt
    ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  } finally {
    bytes.fill(0);
  }
}

function validateDeploymentAuthority(value) {
  exactRecord(value, 'deploymentAuthority');
  if (value.previousRecordDigest !== null) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  requiredDigest(value.preparedReceiptDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  validateReceiptBody(value);
  strictUtc(value.preparedAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  strictUtc(value.expiresAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (Date.parse(value.expiresAt) <= Date.parse(value.preparedAt)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  requiredDigest(value.completedJournalHeadDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (![
    'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
    'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
  ].includes(value.completedJournalProfile)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  if (![
    'verified', 'verified-after-release-error', 'already-verified',
    'verified-read-only-recovery',
  ].includes(value.completedJournalOutcome)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  if (value.completedJournalPredecessorDigest !== null) {
    requiredDigest(value.completedJournalPredecessorDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  if (
    typeof value.runId !== 'string' || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1 || value.runAttempt > 1_000
  ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  strictUtc(value.completedAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  requiredUuid(value.deploymentId, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  requiredUuid(value.workerVersionId, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (value.bridgeSourceCommit !== value.sourceCommit) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  for (const key of [
    'ptrDatabaseIdentity', 'ptrBindingDigest', 'controlPlaneAttestationDigest',
    'publicAttestationDigest', 'privateAttestationDigest', 'ptrBindingAttestationDigest',
  ]) requiredDigest(value[key], 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  strictUtc(value.recordedAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  return value;
}

function validateProbeRecord(value, prefix) {
  if (
    value[`${prefix}NoRedirect`] !== true
    || value[`${prefix}ContentType`] !== SUSPENSION_CONTENT_TYPE
    || value[`${prefix}AccessControlAllowOrigin`] !== SUSPENSION_ORIGIN
    || value[`${prefix}ProbeStatus`] !== 503
  ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  const bytes = canonicalBase64(
    value[`${prefix}ProbeBodyBase64`],
    1,
    MAX_PROBE_BYTES,
    'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID',
  );
  try {
    if (digest(bytes) !== value[`${prefix}ProbeDigest`]) {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
    }
    exactSuspensionJson(bytes);
  } finally {
    bytes.fill(0);
  }
}

function validateGate(value, deployment) {
  const expectedType = value.recordType === 'g002Gate' ? 'g002Gate' : 'ptrGate';
  exactRecord(value, expectedType);
  const lane = expectedType === 'g002Gate' ? 'g002' : 'ptr';
  if (value.lane !== lane) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  for (const key of [
    'deploymentAuthorityDigest', 'confirmationDigest', 'deploymentAttestationDigest',
    'bindingAttestationDigest', 'nonce',
  ]) requiredDigest(value[key], 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  if (value.supersedesGateDigest !== null) {
    requiredDigest(value.supersedesGateDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  }
  if (
    value.deploymentAuthorityDigest !== deployment.digest
    || value.deploymentId !== deployment.value.deploymentId
    || value.workerVersionId !== deployment.value.workerVersionId
    || value.bridgeSourceCommit !== deployment.value.bridgeSourceCommit
    || value.ptrDatabaseIdentity !== deployment.value.ptrDatabaseIdentity
    || value.ptrBindingDigest !== deployment.value.ptrBindingDigest
  ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  validateProbeRecord(value, 'post');
  validateProbeRecord(value, 'options');
  strictUtc(value.observedAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  return value;
}

function validateCrossLink(value, deployment) {
  const expectedType = value.recordType === 'g002ImportAuthorityCrossLink'
    ? 'g002ImportAuthorityCrossLink'
    : 'ptrImportAuthorityCrossLink';
  exactRecord(value, expectedType);
  if (
    value.lane !== (expectedType === 'g002ImportAuthorityCrossLink' ? 'g002' : 'ptr')
    || value.deploymentAuthorityDigest !== deployment.digest
    || !DIGEST.test(value.consumedGateDigest)
    || !DIGEST.test(value.realmImportReceiptDigest)
    || !['applied', 'adopted'].includes(value.outcome)
  ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  strictUtc(value.linkedAt, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
  return value;
}

function parseAuthorityChain(bytes, expectedSourceCommit) {
  if (!(bytes instanceof Uint8Array) && !Buffer.isBuffer(bytes)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
  }
  const body = Buffer.from(bytes);
  try {
    if (body.byteLength < 2 || body.byteLength > MAX_CHAIN_BYTES || body.at(-1) !== 0x0a) {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    const lines = source.split('\n');
    lines.pop();
    if (lines.length < 1 || lines.length > MAX_CHAIN_RECORDS || lines.some(line => line.length === 0)) {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
    }
    const records = [];
    let previousDigest = null;
    for (const line of lines) {
      let value;
      try { value = JSON.parse(line); } catch {
        fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
      }
      if (JSON.stringify(value) !== line) {
        fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
      }
      if (records.length === 0) validateDeploymentAuthority(value);
      else if (value?.recordType === 'g002Gate' || value?.recordType === 'ptrGate') {
        validateGate(value, records[0]);
      } else if (
        value?.recordType === 'g002ImportAuthorityCrossLink'
        || value?.recordType === 'ptrImportAuthorityCrossLink'
      ) validateCrossLink(value, records[0]);
      else fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
      if (
        value.sourceCommit !== expectedSourceCommit
        || value.previousRecordDigest !== previousDigest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_RECORD_INVALID');
      const lineBytes = Buffer.from(`${line}\n`, 'utf8');
      const record = Object.freeze({ value: Object.freeze(value), digest: digestRecord(lineBytes) });
      lineBytes.fill(0);
      records.push(record);
      previousDigest = record.digest;
    }
    const deployment = records[0];
    let g002Final = null;
    let g002Cross = null;
    let ptrFinal = null;
    let ptrCross = null;
    let phase = 'g002';
    for (const record of records.slice(1)) {
      const { value } = record;
      if (value.recordType === 'g002Gate') {
        if (phase !== 'g002') fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        if (
          (g002Final === null && value.supersedesGateDigest !== null)
          || (g002Final !== null && value.supersedesGateDigest !== g002Final.digest)
        ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        g002Final = record;
        continue;
      }
      if (value.recordType === 'g002ImportAuthorityCrossLink') {
        if (
          phase !== 'g002' || g002Final === null
          || value.consumedGateDigest !== g002Final.digest
        ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        g002Cross = record;
        phase = 'ptr';
        continue;
      }
      if (value.recordType === 'ptrGate') {
        if (phase !== 'ptr') fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        if (
          (ptrFinal === null && value.supersedesGateDigest !== null)
          || (ptrFinal !== null && value.supersedesGateDigest !== ptrFinal.digest)
        ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        ptrFinal = record;
        continue;
      }
      if (value.recordType === 'ptrImportAuthorityCrossLink') {
        if (
          phase !== 'ptr' || ptrFinal === null
          || value.consumedGateDigest !== ptrFinal.digest
        ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
        ptrCross = record;
        phase = 'complete';
        continue;
      }
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_GRAMMAR_INVALID');
    }
    return Object.freeze({
      records: Object.freeze(records),
      deployment,
      g002Final,
      g002Cross,
      ptrFinal,
      ptrCross,
      phase,
    });
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
  } finally {
    body.fill(0);
  }
}

function authorityChainDigest({
  sourceCommit,
  preparedReceiptDigest,
  completedJournalHeadDigest,
  deploymentId,
  workerVersionId,
  ptrBindingDigest,
}) {
  const tuple = JSON.stringify([
    SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE,
    sourceCommit,
    preparedReceiptDigest,
    completedJournalHeadDigest,
    deploymentId,
    workerVersionId,
    ptrBindingDigest,
  ]);
  return digest(Buffer.from(tuple, 'utf8'));
}

function chainPath(chainDigest) {
  requiredDigest(chainDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
  return `bridge/auth-bridge-import-authority-${chainDigest}.jsonl`;
}

function lockPath(chainDigest) {
  requiredDigest(chainDigest, 'SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
  return `bridge/locks/auth-bridge-import-authority-${chainDigest}.lock`;
}

function currentTime(now) {
  let value;
  try { value = now(); } catch { fail('SEALED_REALMS_AUTH_BRIDGE_CLOCK_INVALID'); }
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    fail('SEALED_REALMS_AUTH_BRIDGE_CLOCK_INVALID');
  }
  return value;
}

function randomDigest(randomBytesImpl) {
  let bytes;
  try { bytes = randomBytesImpl(32); } catch {
    fail('SEALED_REALMS_AUTH_BRIDGE_RANDOM_INVALID');
  }
  if (!(bytes instanceof Uint8Array) || bytes.byteLength !== 32) {
    fail('SEALED_REALMS_AUTH_BRIDGE_RANDOM_INVALID');
  }
  const value = Buffer.from(bytes).toString('hex');
  if (value.length !== 64) fail('SEALED_REALMS_AUTH_BRIDGE_RANDOM_INVALID');
  return value;
}

function deploymentAttestationDigest(value) {
  return digest(Buffer.from(JSON.stringify([
    value.deploymentId,
    value.workerVersionId,
    value.bridgeSourceCommit,
    value.controlPlaneAttestationDigest,
    value.publicAttestationDigest,
    value.privateAttestationDigest,
    value.observedAt,
  ]), 'utf8'));
}

function validateDeploymentAttestation(value, sourceCommit, completedJournal) {
  exactObject(value, [
    'deploymentId', 'workerVersionId', 'bridgeSourceCommit',
    'controlPlaneAttestationDigest', 'publicAttestationDigest',
    'privateAttestationDigest', 'observedAt',
  ], 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  requiredUuid(value.deploymentId, 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  requiredUuid(value.workerVersionId, 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  if (
    value.workerVersionId !== completedJournal.workerVersionId
    || value.bridgeSourceCommit !== sourceCommit
  ) fail('SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  for (const key of [
    'controlPlaneAttestationDigest', 'publicAttestationDigest', 'privateAttestationDigest',
  ]) requiredDigest(value[key], 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  strictUtc(value.observedAt, 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_INVALID');
  return Object.freeze(value);
}

function validateBindingAttestation(value) {
  exactObject(value, [
    'ptrDatabaseIdentity', 'ptrBindingDigest', 'ptrBindingAttestationDigest', 'observedAt',
  ], 'SEALED_REALMS_AUTH_BRIDGE_BINDING_ATTESTATION_INVALID');
  for (const key of [
    'ptrDatabaseIdentity', 'ptrBindingDigest', 'ptrBindingAttestationDigest',
  ]) requiredDigest(value[key], 'SEALED_REALMS_AUTH_BRIDGE_BINDING_ATTESTATION_INVALID');
  strictUtc(value.observedAt, 'SEALED_REALMS_AUTH_BRIDGE_BINDING_ATTESTATION_INVALID');
  return Object.freeze(value);
}

function validateImportReceiptResolution(value, lane, authority, code) {
  const common = [
    'disposition', 'sourceCommit', 'deploymentId', 'workerVersionId',
    'ptrDatabaseIdentity', 'ptrBindingDigest',
  ];
  if (value?.disposition === 'adopted') {
    exactObject(value, [...common, 'receiptDigest'], code);
    requiredDigest(value.receiptDigest, code);
  } else if (value?.disposition === 'no-effect') {
    exactObject(value, [...common, 'noEffectDigest'], code);
    requiredDigest(value.noEffectDigest, code);
  } else {
    fail(code);
  }
  if (
    value.sourceCommit !== authority.sourceCommit
    || value.deploymentId !== authority.deploymentId
    || value.workerVersionId !== authority.workerVersionId
    || value.ptrDatabaseIdentity !== authority.ptrDatabaseIdentity
    || value.ptrBindingDigest !== authority.ptrBindingDigest
  ) fail(code);
  return Object.freeze(value);
}

function validateOwnerProvisionReceipt(value, authority, expectedReceiptDigest, code) {
  exactObject(value, [
    'sourceCommit', 'deploymentId', 'workerVersionId', 'ptrDatabaseIdentity',
    'ptrBindingDigest', 'receiptDigest', 'provisionReceiptDigest',
  ], code);
  for (const key of ['receiptDigest', 'provisionReceiptDigest']) requiredDigest(value[key], code);
  if (
    value.sourceCommit !== authority.sourceCommit
    || value.deploymentId !== authority.deploymentId
    || value.workerVersionId !== authority.workerVersionId
    || value.ptrDatabaseIdentity !== authority.ptrDatabaseIdentity
    || value.ptrBindingDigest !== authority.ptrBindingDigest
    || value.receiptDigest !== expectedReceiptDigest
  ) fail(code);
  return Object.freeze(value);
}

function exactReceiptEvidence(value, expectedReceiptDigest, key, code) {
  exactObject(value, ['receiptDigest', key], code);
  if (value.receiptDigest !== expectedReceiptDigest) fail(code);
  requiredDigest(value[key], code);
  return Object.freeze(value);
}

function allowedObject(value, allowed, code) {
  if (
    value === null || typeof value !== 'object' || Array.isArray(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || Object.keys(value).some(key => !allowed.includes(key))
  ) fail(code);
  return value;
}

function validateCompletedJournal(value, sourceCommit) {
  exactObject(value, [
    'journalHeadDigest', 'profile', 'outcome', 'predecessorDigest', 'runId',
    'runAttempt', 'completedAt', 'sourceCommit', 'workerVersionId',
  ], 'SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  requiredDigest(value.journalHeadDigest, 'SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  if (![
    'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
    'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
  ].includes(value.profile) || ![
    'verified', 'verified-after-release-error', 'already-verified',
    'verified-read-only-recovery',
  ].includes(value.outcome)) fail('SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  if (value.predecessorDigest !== null) {
    requiredDigest(value.predecessorDigest, 'SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  }
  if (
    typeof value.runId !== 'string' || !RUN_ID.test(value.runId)
    || !Number.isSafeInteger(value.runAttempt) || value.runAttempt < 1 || value.runAttempt > 1_000
    || value.sourceCommit !== sourceCommit
  ) fail('SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  strictUtc(value.completedAt, 'SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  requiredUuid(value.workerVersionId, 'SEALED_REALMS_AUTH_BRIDGE_JOURNAL_INVALID');
  return Object.freeze(value);
}

function requireFresh(value, now, code) {
  const timestamp = Date.parse(strictUtc(value, code));
  const current = now.getTime();
  if (timestamp > current || current - timestamp > 5 * 60 * 1_000) fail(code);
  return value;
}

function privateAuthorityRecord(chain) {
  const record = chain.deployment;
  if (record === undefined) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
  return record;
}

function privateChainSummary(chain) {
  return Object.freeze({
    g002Sealed: chain.g002Cross !== null,
    ptrSealed: chain.ptrCross !== null,
    complete: chain.phase === 'complete',
  });
}

/**
 * Builds an owner-private chain capability. Attesters are narrow injected
 * producers; neither an authority path nor bridge identity can be supplied to
 * individual lifecycle calls.
 */
export function createSealedRealmsProductionAuthBridgeState(input) {
  const options = allowedObject(input, [
    'authority', 'privateState', 'repositoryRoot', 'reportedHome',
    'deploymentAttester', 'bindingAttester', 'fetchImpl', 'now', 'randomBytesImpl',
    'inspectImportReceipt', 'authenticateImportResult', 'resolveOwnerProvisionReceipt',
    'testOnlyCapability', 'testOnlyResolvePreparedReceipt', 'testOnlyResolveCompletedJournal',
  ], 'SEALED_REALMS_AUTH_BRIDGE_STATE_INPUT_INVALID');
  if (
    typeof options.repositoryRoot !== 'string'
    || typeof options.deploymentAttester !== 'function'
    || typeof options.bindingAttester !== 'function'
    || typeof options.fetchImpl !== 'function'
    || typeof options.inspectImportReceipt !== 'function'
    || typeof options.authenticateImportResult !== 'function'
    || typeof options.resolveOwnerProvisionReceipt !== 'function'
    || (options.now !== undefined && typeof options.now !== 'function')
    || (options.randomBytesImpl !== undefined && typeof options.randomBytesImpl !== 'function')
    || (options.testOnlyResolvePreparedReceipt !== undefined
      && typeof options.testOnlyResolvePreparedReceipt !== 'function')
    || (options.testOnlyResolveCompletedJournal !== undefined
      && typeof options.testOnlyResolveCompletedJournal !== 'function')
  ) fail('SEALED_REALMS_AUTH_BRIDGE_STATE_INPUT_INVALID');
  const testOnlyResolvers = options.testOnlyResolvePreparedReceipt !== undefined
    || options.testOnlyResolveCompletedJournal !== undefined;
  const testOnlySeams = testOnlyResolvers
    || options.reportedHome !== undefined
    || options.now !== undefined
    || options.randomBytesImpl !== undefined;
  if (
    (testOnlySeams && !testOnlyCapabilities.has(options.testOnlyCapability))
    || (!testOnlySeams && options.testOnlyCapability !== undefined)
  ) fail('SEALED_REALMS_AUTH_BRIDGE_TEST_ONLY_CAPABILITY_INVALID');
  const privateState = assertSealedRealmsProductionPrivateState(options.privateState);
  let ownerClaims = ownerProvisionChainClaims.get(privateState);
  if (ownerClaims === undefined) {
    ownerClaims = new Map();
    ownerProvisionChainClaims.set(privateState, ownerClaims);
  }
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(options.authority);
  if (options.authority.mode !== 'S') {
    fail('SEALED_REALMS_AUTH_BRIDGE_SOURCE_MODE_INVALID');
  }
  const now = options.now ?? (() => new Date());
  const randomBytesImpl = options.randomBytesImpl ?? randomBytes;
  const receiptResolver = options.testOnlyResolvePreparedReceipt
    ?? resolveExistingAuthBridgeNotificationPreparedReceipt;
  const journalResolver = options.testOnlyResolveCompletedJournal
    ?? resolveExistingAuthBridgeNotificationPreparedDeployJournal;

  const resolveFacts = async () => {
    const sampled = currentTime(now);
    let receiptResolution;
    let journalResolution;
    let deployment;
    let binding;
    try {
      receiptResolution = await receiptResolver({
        repositoryRoot: options.repositoryRoot,
        reportedHome: options.reportedHome,
        expectedSourceCommit: sourceCommit,
        now: sampled,
      });
      journalResolution = await journalResolver({
        repositoryRoot: options.repositoryRoot,
        reportedHome: options.reportedHome,
      });
    } catch (error) {
      if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
      fail('SEALED_REALMS_AUTH_BRIDGE_EXISTING_STATE_INVALID');
    }
    exactObject(
      receiptResolution,
      ['receipt', 'receiptDigest'],
      'SEALED_REALMS_AUTH_BRIDGE_RECEIPT_INVALID',
    );
    const receipt = parseAuthBridgeNotificationPreparedReceipt(receiptResolution.receipt);
    const receiptPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    if (
      receiptResolution.receiptDigest !== receiptPublication.receiptDigest
      || receipt.bridgeSourceCommit !== sourceCommit
      || Date.parse(receipt.preparedAt) > sampled.getTime()
      || Date.parse(receipt.expiresAt) <= sampled.getTime()
    ) fail('SEALED_REALMS_AUTH_BRIDGE_RECEIPT_INVALID');
    const journal = validateCompletedJournal(journalResolution, sourceCommit);
    try {
      deployment = await options.deploymentAttester(Object.freeze({
        sourceCommit,
        runId: journal.runId,
        runAttempt: journal.runAttempt,
      }));
      binding = await options.bindingAttester(Object.freeze({ sourceCommit }));
    } catch (error) {
      if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
      fail('SEALED_REALMS_AUTH_BRIDGE_ATTESTATION_INVALID');
    }
    deployment = validateDeploymentAttestation(deployment, sourceCommit, journal);
    binding = validateBindingAttestation(binding);
    // The first sample only bounds acquisition.  Reopen both existing
    // authorities after async attestation and validate them against a fresh
    // completion sample so a receipt/attestation cannot expire mid-flight.
    const recheckStarted = currentTime(now);
    if (recheckStarted.getTime() < sampled.getTime()) {
      fail('SEALED_REALMS_AUTH_BRIDGE_ATTESTATION_INVALID');
    }
    let recheckedReceiptResolution;
    let recheckedJournalResolution;
    try {
      recheckedReceiptResolution = await receiptResolver({
        repositoryRoot: options.repositoryRoot,
        reportedHome: options.reportedHome,
        expectedSourceCommit: sourceCommit,
        now: recheckStarted,
      });
      recheckedJournalResolution = await journalResolver({
        repositoryRoot: options.repositoryRoot,
        reportedHome: options.reportedHome,
      });
    } catch (error) {
      if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
      fail('SEALED_REALMS_AUTH_BRIDGE_EXISTING_STATE_INVALID');
    }
    const completed = currentTime(now);
    if (completed.getTime() < recheckStarted.getTime()) {
      fail('SEALED_REALMS_AUTH_BRIDGE_ATTESTATION_INVALID');
    }
    exactObject(
      recheckedReceiptResolution,
      ['receipt', 'receiptDigest'],
      'SEALED_REALMS_AUTH_BRIDGE_RECEIPT_INVALID',
    );
    const recheckedReceipt = parseAuthBridgeNotificationPreparedReceipt(recheckedReceiptResolution.receipt);
    const recheckedPublication = canonicalAuthBridgeNotificationPreparedReceiptPublication(recheckedReceipt);
    const recheckedJournal = validateCompletedJournal(recheckedJournalResolution, sourceCommit);
    if (
      recheckedReceiptResolution.receiptDigest !== recheckedPublication.receiptDigest
      || recheckedPublication.receiptDigest !== receiptPublication.receiptDigest
      || JSON.stringify(recheckedJournal) !== JSON.stringify(journal)
      || recheckedReceipt.bridgeSourceCommit !== sourceCommit
      || Date.parse(recheckedReceipt.preparedAt) > completed.getTime()
      || Date.parse(recheckedReceipt.expiresAt) <= completed.getTime()
    ) fail('SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT');
    requireFresh(deployment.observedAt, completed, 'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_STALE');
    requireFresh(binding.observedAt, completed, 'SEALED_REALMS_AUTH_BRIDGE_BINDING_ATTESTATION_STALE');
    return Object.freeze({
      sampled: completed,
      receipt,
      receiptPublication,
      journal,
      deployment,
      binding,
    });
  };

  const createInitialRecord = (facts) => Object.freeze({
    schemaVersion: 1,
    profile: SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE,
    recordType: 'deploymentAuthority',
    sourceCommit,
    previousRecordDigest: null,
    preparedReceiptBodyBase64: facts.receiptPublication.receiptBytesBase64,
    preparedReceiptDigest: facts.receiptPublication.receiptDigest,
    preparedAt: facts.receipt.preparedAt,
    expiresAt: facts.receipt.expiresAt,
    completedJournalHeadDigest: facts.journal.journalHeadDigest,
    completedJournalProfile: facts.journal.profile,
    completedJournalOutcome: facts.journal.outcome,
    completedJournalPredecessorDigest: facts.journal.predecessorDigest,
    runId: facts.journal.runId,
    runAttempt: facts.journal.runAttempt,
    completedAt: facts.journal.completedAt,
    deploymentId: facts.deployment.deploymentId,
    workerVersionId: facts.deployment.workerVersionId,
    bridgeSourceCommit: facts.deployment.bridgeSourceCommit,
    ptrDatabaseIdentity: facts.binding.ptrDatabaseIdentity,
    ptrBindingDigest: facts.binding.ptrBindingDigest,
    controlPlaneAttestationDigest: facts.deployment.controlPlaneAttestationDigest,
    publicAttestationDigest: facts.deployment.publicAttestationDigest,
    privateAttestationDigest: facts.deployment.privateAttestationDigest,
    ptrBindingAttestationDigest: facts.binding.ptrBindingAttestationDigest,
    recordedAt: facts.sampled.toISOString(),
  });

  const assertFreshImmediatelyBeforeMutation = (facts) => {
    const mutationTime = currentTime(now);
    if (
      mutationTime.getTime() < facts.sampled.getTime()
      || Date.parse(facts.receipt.expiresAt) <= mutationTime.getTime()
    ) fail('SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT');
    requireFresh(
      facts.deployment.observedAt,
      mutationTime,
      'SEALED_REALMS_AUTH_BRIDGE_DEPLOYMENT_ATTESTATION_STALE',
    );
    requireFresh(
      facts.binding.observedAt,
      mutationTime,
      'SEALED_REALMS_AUTH_BRIDGE_BINDING_ATTESTATION_STALE',
    );
    return mutationTime;
  };

  const establish = async () => {
    const facts = await resolveFacts();
    const initial = createInitialRecord(facts);
    const derivedDigest = authorityChainDigest({
      sourceCommit,
      preparedReceiptDigest: initial.preparedReceiptDigest,
      completedJournalHeadDigest: initial.completedJournalHeadDigest,
      deploymentId: initial.deploymentId,
      workerVersionId: initial.workerVersionId,
      ptrBindingDigest: initial.ptrBindingDigest,
    });
    const relativePath = chainPath(derivedDigest);
    const recovery = initial.completedJournalProfile
      === 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1';
    let catalog = authorityChainCatalog();
    const existing = catalog.find(entry => entry.relativePath === relativePath);
    const siblings = catalog.filter(entry => entry.relativePath !== relativePath);
    if (recovery) {
      // Task 6D only authenticates Task 6E's already-durable recovery chain.
      // It cannot manufacture, repair, or choose a recovery authority.
      if (existing === undefined) {
        // A changed existing authority must surface as drift rather than being
        // relabelled a recovery request. A genuinely fresh recovery has no
        // sibling and is simply unavailable until Task 6E persists it.
        if (initial.completedJournalOutcome !== 'verified-read-only-recovery') {
          fail('SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_INVALID');
        }
        if (siblings.length === 1) {
          assertRecoveryCoexistence(siblings[0].chain, initial, facts);
        } else if (siblings.length !== 0) {
          fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT');
        }
        fail('SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_MISSING');
      }
      assertFactsMatchAuthority(facts, existing.chain);
      if (initial.completedJournalOutcome !== 'verified-read-only-recovery') {
        fail('SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_INVALID');
      }
      if (siblings.length !== 1) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT');
      assertRecoveryCoexistence(siblings[0].chain, initial, facts);
    } else {
      if (siblings.length !== 0) {
        if (existing === undefined && siblings.length === 1) {
          assertFactsMatchAuthority(facts, siblings[0].chain);
        }
        fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT');
      }
      const bytes = canonicalLine(initial);
      try {
        try {
          assertFreshImmediatelyBeforeMutation(facts);
          privateState.write({ root: 'runtime', relativePath, bytes });
        } catch (error) {
          if (error?.code !== 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') throw error;
          const persisted = readChain(relativePath);
          const current = privateAuthorityRecord(persisted).value;
          for (const key of [
            'sourceCommit', 'preparedReceiptDigest', 'completedJournalHeadDigest',
            'deploymentId', 'workerVersionId', 'bridgeSourceCommit',
            'ptrDatabaseIdentity', 'ptrBindingDigest',
          ]) {
            if (current[key] !== initial[key]) {
              fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT');
            }
          }
        }
      } finally {
        bytes.fill(0);
      }
    }
    const chain = readChain(relativePath);
    assertFactsMatchAuthority(facts, chain);
    catalog = authorityChainCatalog();
    const current = catalog.find(entry => entry.relativePath === relativePath);
    const remaining = catalog.filter(entry => entry.relativePath !== relativePath);
    if (
      current === undefined
      || (!recovery && remaining.length !== 0)
      || (recovery && (
        remaining.length !== 1
        || !assertRecoveryCoexistence(remaining[0].chain, initial, facts)
      ))
    ) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_CONFLICT');
    return Object.freeze({ relativePath, chainDigest: derivedDigest, chain });
  };

  const readChain = (relativePath) => {
    const bytes = privateState.read({ root: 'runtime', relativePath });
    try { return parseAuthorityChain(bytes, sourceCommit); } finally { bytes.fill(0); }
  };

  const authorityChainCatalog = () => {
    const names = privateState.list({ root: 'runtime', relativeDirectory: 'bridge' });
    const chains = [];
    for (const name of names) {
      if (/^auth-bridge-import-authority-[a-f0-9]{64}\.jsonl$/u.test(name)) {
        const relativePath = `bridge/${name}`;
        const chain = readChain(relativePath);
        const authority = privateAuthorityRecord(chain).value;
        const derivedDigest = authorityChainDigest({
          sourceCommit: authority.sourceCommit,
          preparedReceiptDigest: authority.preparedReceiptDigest,
          completedJournalHeadDigest: authority.completedJournalHeadDigest,
          deploymentId: authority.deploymentId,
          workerVersionId: authority.workerVersionId,
          ptrBindingDigest: authority.ptrBindingDigest,
        });
        if (relativePath !== chainPath(derivedDigest)) {
          fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
        }
        chains.push(Object.freeze({ relativePath, chain }));
      } else if (!['locks', 'activation-evidence'].includes(name)) {
        fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_INVALID');
      }
    }
    if (names.includes('locks')) {
      const locks = privateState.list({ root: 'runtime', relativeDirectory: 'bridge/locks' });
      if (locks.length !== 0) fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_BUSY');
    }
    return Object.freeze(chains.sort((left, right) =>
      left.relativePath.localeCompare(right.relativePath)));
  };

  const assertRecoveryCoexistence = (oldChain, recoveryInitial, facts) => {
    const old = privateAuthorityRecord(oldChain).value;
    const permittedPhase = oldChain.phase === 'complete' || (
      oldChain.phase === 'ptr'
      && oldChain.g002Final !== null
      && oldChain.g002Cross !== null
      && oldChain.ptrFinal === null
      && oldChain.ptrCross === null
    );
    if (
      !permittedPhase
      || old.completedJournalProfile
        !== 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3'
      || Date.parse(old.expiresAt) > facts.sampled.getTime()
      || recoveryInitial.completedJournalPredecessorDigest !== old.completedJournalHeadDigest
      || recoveryInitial.preparedReceiptDigest === old.preparedReceiptDigest
      || recoveryInitial.completedJournalHeadDigest === old.completedJournalHeadDigest
      || old.sourceCommit !== recoveryInitial.sourceCommit
      || old.deploymentId !== recoveryInitial.deploymentId
      || old.workerVersionId !== recoveryInitial.workerVersionId
      || old.bridgeSourceCommit !== recoveryInitial.bridgeSourceCommit
      || old.ptrDatabaseIdentity !== recoveryInitial.ptrDatabaseIdentity
      || old.ptrBindingDigest !== recoveryInitial.ptrBindingDigest
      || facts.deployment.deploymentId !== recoveryInitial.deploymentId
      || facts.deployment.workerVersionId !== recoveryInitial.workerVersionId
      || facts.binding.ptrDatabaseIdentity !== recoveryInitial.ptrDatabaseIdentity
      || facts.binding.ptrBindingDigest !== recoveryInitial.ptrBindingDigest
    ) fail('SEALED_REALMS_AUTH_BRIDGE_RECOVERY_CHAIN_INVALID');
    return true;
  };

  const acquireChainLock = (derivedDigest) => {
    const relativePath = lockPath(derivedDigest);
    const lockBytes = Buffer.from(`${randomDigest(randomBytesImpl)}\n`, 'utf8');
    try {
      try {
        privateState.write({ root: 'runtime', relativePath, bytes: lockBytes });
      } catch (error) {
        if (error?.code === 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') {
          fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_BUSY');
        }
        throw error;
      }
    } finally {
      lockBytes.fill(0);
    }
    return Object.freeze({ relativePath });
  };

  const releaseChainLock = (lock) => {
    try {
      privateState.remove({ root: 'runtime', relativePath: lock.relativePath });
    } catch {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_BUSY');
    }
  };

  const appendUnderChainLock = (relativePath, expectedHeadDigest, value) => {
    const chain = readChain(relativePath);
    const head = chain.records.at(-1);
    if (head?.digest !== expectedHeadDigest) {
      fail('SEALED_REALMS_AUTH_BRIDGE_CHAIN_REPLACED');
    }
    const line = canonicalLine(value);
    try {
      privateState.append({ root: 'runtime', relativePath, bytes: line });
    } finally {
      line.fill(0);
    }
    return readChain(relativePath);
  };

  const append = (relativePath, derivedDigest, expectedHeadDigest, value) => {
    const lock = acquireChainLock(derivedDigest);
    let appended = false;
    try {
      const chain = appendUnderChainLock(relativePath, expectedHeadDigest, value);
      appended = true;
      return chain;
    } finally {
      // An interrupted/ambiguous append deliberately leaves the durable lock.
      // A fully fsynced append releases it only after the new chain rereads.
      if (appended) releaseChainLock(lock);
    }
  };

  const assertFactsMatchAuthority = (facts, chain) => {
    const authority = privateAuthorityRecord(chain).value;
    if (
      Date.parse(authority.expiresAt) <= facts.sampled.getTime()
      || facts.receiptPublication.receiptDigest !== authority.preparedReceiptDigest
      || facts.receipt.preparedAt !== authority.preparedAt
      || facts.receipt.expiresAt !== authority.expiresAt
      || facts.journal.journalHeadDigest !== authority.completedJournalHeadDigest
      || facts.journal.profile !== authority.completedJournalProfile
      || facts.journal.outcome !== authority.completedJournalOutcome
      || facts.journal.predecessorDigest !== authority.completedJournalPredecessorDigest
      || facts.journal.runId !== authority.runId
      || facts.journal.runAttempt !== authority.runAttempt
      || facts.journal.completedAt !== authority.completedAt
      || facts.deployment.deploymentId !== authority.deploymentId
      || facts.deployment.workerVersionId !== authority.workerVersionId
      || facts.deployment.bridgeSourceCommit !== authority.bridgeSourceCommit
      || facts.binding.ptrDatabaseIdentity !== authority.ptrDatabaseIdentity
      || facts.binding.ptrBindingDigest !== authority.ptrBindingDigest
    ) fail('SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_DRIFT');
    return authority;
  };

  const inspectImmutableImportReceipt = async (lane, authority, code) => {
    let resolution;
    try {
      resolution = await options.inspectImportReceipt(Object.freeze({
        lane,
        sourceCommit,
        deploymentId: authority.deploymentId,
        workerVersionId: authority.workerVersionId,
        ptrDatabaseIdentity: authority.ptrDatabaseIdentity,
        ptrBindingDigest: authority.ptrBindingDigest,
      }));
    } catch (error) {
      if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
      fail(code);
    }
    return validateImportReceiptResolution(resolution, lane, authority, code);
  };

  const authenticatedImportedReceipt = async (lane, chain, code) => {
    const facts = await resolveFacts();
    const authority = assertFactsMatchAuthority(facts, chain);
    const crossLink = lane === 'g002' ? chain.g002Cross : chain.ptrCross;
    if (crossLink === null) fail(code);
    const resolution = await inspectImmutableImportReceipt(lane, authority, code);
    if (
      resolution.disposition !== 'adopted'
      || resolution.receiptDigest !== crossLink.value.realmImportReceiptDigest
    ) fail(code);
    return Object.freeze({ authority, receiptDigest: resolution.receiptDigest });
  };

  const authenticatedOwnerProvisionReceipt = async (chain, imported, code) => {
    let value;
    try {
      value = await options.resolveOwnerProvisionReceipt(Object.freeze({
        sourceCommit,
        deploymentId: imported.authority.deploymentId,
        workerVersionId: imported.authority.workerVersionId,
        ptrDatabaseIdentity: imported.authority.ptrDatabaseIdentity,
        ptrBindingDigest: imported.authority.ptrBindingDigest,
        receiptDigest: imported.receiptDigest,
      }));
    } catch (error) {
      if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
      fail(code);
    }
    return validateOwnerProvisionReceipt(value, imported.authority, imported.receiptDigest, code);
  };

  const importCrossLink = ({ lane, chain, gate, resolution, outcome, linkedAt }) => Object.freeze({
    schemaVersion: 1,
    profile: SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE,
    recordType: lane === 'g002'
      ? 'g002ImportAuthorityCrossLink'
      : 'ptrImportAuthorityCrossLink',
    sourceCommit,
    previousRecordDigest: gate.digest,
    deploymentAuthorityDigest: chain.deployment.digest,
    lane,
    consumedGateDigest: gate.digest,
    realmImportReceiptDigest: resolution.receiptDigest,
    outcome,
    linkedAt,
  });

  const inspectGate = async ({ lane } = {}) => {
    if (!['g002', 'ptr'].includes(lane)) {
      fail('SEALED_REALMS_AUTH_BRIDGE_GATE_INPUT_INVALID');
    }
    const established = await establish();
    const prior = established.chain;
    if (
      (lane === 'g002' && prior.phase !== 'g002')
      || (lane === 'ptr' && prior.phase !== 'ptr')
    ) fail('SEALED_REALMS_AUTH_BRIDGE_GATE_STATE_INVALID');
    const facts = await resolveFacts();
    const authority = assertFactsMatchAuthority(facts, prior);
    const previousGate = lane === 'g002' ? prior.g002Final : prior.ptrFinal;
    if (previousGate !== null) {
      // An abandoned confirmation can only be superseded after the owned
      // immutable-receipt reader proves either durable adoption or no effect.
      const recovery = await inspectImmutableImportReceipt(
        lane,
        authority,
        'SEALED_REALMS_AUTH_BRIDGE_GATE_RECOVERY_INVALID',
      );
      if (recovery.disposition === 'adopted') {
        const crossLink = importCrossLink({
          lane,
          chain: prior,
          gate: previousGate,
          resolution: recovery,
          outcome: 'adopted',
          linkedAt: facts.sampled.toISOString(),
        });
        assertFreshImmediatelyBeforeMutation(facts);
        append(
          established.relativePath,
          established.chainDigest,
          previousGate.digest,
          crossLink,
        );
        const confirmation = Object.freeze({});
        gateConfirmations.set(confirmation, Object.freeze({
          lane,
          relativePath: established.relativePath,
          chainDigest: established.chainDigest,
          gateDigest: previousGate.digest,
          observedAt: facts.sampled.toISOString(),
          adopted: true,
        }));
        return Object.freeze({ confirmation });
      }
    }
    const observation = await inspectSealedRealmsAdmissionSuspension({ fetchImpl: options.fetchImpl });
    const privateObservation = privateSuspensionObservation(observation);
    const finalFacts = await resolveFacts();
    const finalAuthority = assertFactsMatchAuthority(finalFacts, prior);
    const confirmationDigest = randomDigest(randomBytesImpl);
    const nonce = randomDigest(randomBytesImpl);
    if (confirmationDigest === nonce) fail('SEALED_REALMS_AUTH_BRIDGE_RANDOM_INVALID');
    const recordType = lane === 'g002' ? 'g002Gate' : 'ptrGate';
    const record = Object.freeze({
      schemaVersion: 1,
      profile: SEALED_REALMS_AUTH_BRIDGE_AUTHORITY_PROFILE,
      recordType,
      sourceCommit,
      previousRecordDigest: prior.records.at(-1).digest,
      deploymentAuthorityDigest: prior.deployment.digest,
      lane,
      supersedesGateDigest: previousGate?.digest ?? null,
      confirmationDigest,
      deploymentId: finalAuthority.deploymentId,
      workerVersionId: finalAuthority.workerVersionId,
      bridgeSourceCommit: finalAuthority.bridgeSourceCommit,
      ptrDatabaseIdentity: finalAuthority.ptrDatabaseIdentity,
      ptrBindingDigest: finalAuthority.ptrBindingDigest,
      deploymentAttestationDigest: deploymentAttestationDigest(finalFacts.deployment),
      bindingAttestationDigest: finalFacts.binding.ptrBindingAttestationDigest,
      postNoRedirect: privateObservation.post.noRedirect,
      postContentType: privateObservation.post.contentType,
      postAccessControlAllowOrigin: privateObservation.post.accessControlAllowOrigin,
      postProbeStatus: privateObservation.post.status,
      postProbeBodyBase64: privateObservation.post.bodyBase64,
      postProbeDigest: privateObservation.post.digest,
      optionsNoRedirect: privateObservation.options.noRedirect,
      optionsContentType: privateObservation.options.contentType,
      optionsAccessControlAllowOrigin: privateObservation.options.accessControlAllowOrigin,
      optionsProbeStatus: privateObservation.options.status,
      optionsProbeBodyBase64: privateObservation.options.bodyBase64,
      optionsProbeDigest: privateObservation.options.digest,
      observedAt: finalFacts.sampled.toISOString(),
      nonce,
    });
    assertFreshImmediatelyBeforeMutation(finalFacts);
    const chain = append(
      established.relativePath,
      established.chainDigest,
      prior.records.at(-1).digest,
      record,
    );
    const gate = chain.records.at(-1);
    const confirmation = Object.freeze({});
    gateConfirmations.set(confirmation, Object.freeze({
      lane,
      relativePath: established.relativePath,
      chainDigest: established.chainDigest,
      gateDigest: gate.digest,
      observedAt: record.observedAt,
    }));
    return Object.freeze({ confirmation });
  };

  const applyGate = async (input = {}) => {
    exactObject(input, ['confirmation', 'apply'], 'SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_INVALID');
    const { confirmation, apply } = input;
    const member = gateConfirmations.get(confirmation);
    if (member === undefined || typeof apply !== 'function') {
      fail('SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_INVALID');
    }
    // A confirmation is claimed synchronously before any clock, file, probe,
    // or network await.  Concurrent apply calls therefore cannot release the
    // same import core twice.
    gateConfirmations.delete(confirmation);
    const sampled = currentTime(now);
    if (
      sampled.getTime() - Date.parse(member.observedAt) > 5 * 60 * 1_000
      || sampled.getTime() < Date.parse(member.observedAt)
    ) fail('SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_EXPIRED');
    if (member.adopted === true) {
      return Object.freeze({ status: 'cross-linked' });
    }
    // Hold the durable sibling lock over all reads, attestations, and the
    // optional import core.  This serializes the full mutation decision rather
    // than merely the final JSONL append.  A core-started failure leaves the
    // lock as a durable ambiguity fence for the read-only adoption path.
    const lock = acquireChainLock(member.chainDigest);
    try {
      const chain = readChain(member.relativePath);
      const gate = chain.records.at(-1);
      if (
        gate?.digest !== member.gateDigest
        || gate.value.recordType !== (member.lane === 'g002' ? 'g002Gate' : 'ptrGate')
        || (member.lane === 'g002' && chain.phase !== 'g002')
        || (member.lane === 'ptr' && chain.phase !== 'ptr')
      ) fail('SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_INVALID');
      const facts = await resolveFacts();
      const authority = assertFactsMatchAuthority(facts, chain);
      let resolution = await inspectImmutableImportReceipt(
        member.lane,
        authority,
        'SEALED_REALMS_AUTH_BRIDGE_IMPORT_RECEIPT_INVALID',
      );
      // The opaque confirmation was irreversibly consumed before a caller-owned
      // import core can run. A crash/error leaves the gate pending for adoption.
      const wasNoEffect = resolution.disposition === 'no-effect';
      if (wasNoEffect) {
        let result;
        try {
          result = await apply();
        } catch {
          fail('SEALED_REALMS_AUTH_BRIDGE_GATE_APPLY_AMBIGUOUS');
        }
        try {
          resolution = await options.authenticateImportResult(Object.freeze({
            lane: member.lane,
            result,
            sourceCommit,
            deploymentId: authority.deploymentId,
            workerVersionId: authority.workerVersionId,
            ptrDatabaseIdentity: authority.ptrDatabaseIdentity,
            ptrBindingDigest: authority.ptrBindingDigest,
          }));
        } catch (error) {
          if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
          fail('SEALED_REALMS_AUTH_BRIDGE_IMPORT_RESULT_INVALID');
        }
        resolution = validateImportReceiptResolution(
          resolution,
          member.lane,
          authority,
          'SEALED_REALMS_AUTH_BRIDGE_IMPORT_RESULT_INVALID',
        );
        if (resolution.disposition !== 'adopted') {
          fail('SEALED_REALMS_AUTH_BRIDGE_IMPORT_RESULT_INVALID');
        }
      }
      const finalFacts = await resolveFacts();
      assertFactsMatchAuthority(finalFacts, chain);
      requireFresh(
        gate.value.observedAt,
        finalFacts.sampled,
        'SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_EXPIRED',
      );
      const finalChain = readChain(member.relativePath);
      const finalGate = finalChain.records.at(-1);
      if (
        finalGate?.digest !== gate.digest
        || finalGate.value.recordType !== gate.value.recordType
      ) fail('SEALED_REALMS_AUTH_BRIDGE_GATE_CONFIRMATION_INVALID');
      const crossLink = importCrossLink({
        lane: member.lane,
        chain: finalChain,
        gate: finalGate,
        resolution,
        outcome: wasNoEffect ? 'applied' : 'adopted',
        linkedAt: finalFacts.sampled.toISOString(),
      });
      assertFreshImmediatelyBeforeMutation(finalFacts);
      appendUnderChainLock(member.relativePath, finalGate.digest, crossLink);
      return Object.freeze({ status: 'cross-linked' });
    } finally {
      // A process interruption leaves this no-clobber lock behind. A caught
      // local error releases it while the pending immutable gate remains the
      // durable ambiguity fence that only exact adoption/no-effect may settle.
      releaseChainLock(lock);
    }
  };

  const inspect = async () => {
    const established = await establish();
    return privateChainSummary(established.chain);
  };

  const inspectOwnerProvisionEvidence = async (input = {}) => {
    exactObject(input, ['inspect'], 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_INPUT_INVALID');
    if (typeof input.inspect !== 'function') {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_INPUT_INVALID');
    }
    const established = await establish();
    if (established.chain.phase !== 'complete') {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_INPUT_INVALID');
    }
    const imported = await authenticatedImportedReceipt(
      'ptr',
      established.chain,
      'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RECEIPT_INVALID',
    );
    let evidence;
    try { evidence = await input.inspect(Object.freeze({})); } catch {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_INSPECTION_INVALID');
    }
    exactReceiptEvidence(
      evidence,
      imported.receiptDigest,
      'inspectionDigest',
      'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_INSPECTION_INVALID',
    );
    // Reopen the immutable PTR receipt after the asynchronous inspection. A
    // stale inspection cannot mint a provision-capable confirmation.
    const finalImported = await authenticatedImportedReceipt(
      'ptr',
      established.chain,
      'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RECEIPT_INVALID',
    );
    if (finalImported.receiptDigest !== imported.receiptDigest) {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RECEIPT_INVALID');
    }
    const observedAt = currentTime(now).toISOString();
    const claimKey = `${established.chainDigest}:${finalImported.receiptDigest}`;
    if (ownerClaims.has(claimKey)) {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_BUSY');
    }
    const confirmation = Object.freeze({});
    ownerClaims.set(claimKey, Object.freeze({ confirmation }));
    ownerProvisionConfirmations.set(confirmation, Object.freeze({
      relativePath: established.relativePath,
      chainDigest: established.chainDigest,
      receiptDigest: finalImported.receiptDigest,
      claimKey,
      observedAt,
    }));
    return Object.freeze({ confirmation });
  };

  const applyOwnerProvision = async (input = {}) => {
    exactObject(input, ['confirmation', 'provision'], 'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
    if (typeof input.provision !== 'function') {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
    }
    const member = ownerProvisionConfirmations.get(input.confirmation);
    if (
      member === undefined
      || ownerClaims.get(member.claimKey)?.confirmation !== input.confirmation
    ) {
      fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
    }
    // Claim before the first await so concurrent owner-provision requests
    // cannot issue two side effects from one inspection confirmation.
    ownerProvisionConfirmations.delete(input.confirmation);
    const lock = acquireChainLock(member.chainDigest);
    try {
      const chain = readChain(member.relativePath);
      if (chain.phase !== 'complete') {
        fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
      }
      const imported = await authenticatedImportedReceipt(
        'ptr',
        chain,
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RECEIPT_INVALID',
      );
      if (imported.receiptDigest !== member.receiptDigest) {
        fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
      }
      requireFresh(
        member.observedAt,
        currentTime(now),
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_EXPIRED',
      );
      let result;
      try { result = await input.provision(Object.freeze({})); } catch {
        fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_AMBIGUOUS');
      }
      requireFresh(
        member.observedAt,
        currentTime(now),
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_EXPIRED',
      );
      exactReceiptEvidence(
        result,
        imported.receiptDigest,
        'provisionReceiptDigest',
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RESULT_INVALID',
      );
      const finalChain = readChain(member.relativePath);
      if (
        finalChain.deployment.digest !== chain.deployment.digest
        || finalChain.ptrCross?.digest !== chain.ptrCross?.digest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_CONFIRMATION_INVALID');
      const reauthenticated = await authenticatedImportedReceipt(
        'ptr',
        finalChain,
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RESULT_INVALID',
      );
      const persisted = await authenticatedOwnerProvisionReceipt(
        finalChain,
        reauthenticated,
        'SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RESULT_INVALID',
      );
      if (
        reauthenticated.receiptDigest !== imported.receiptDigest
        || persisted.provisionReceiptDigest !== result.provisionReceiptDigest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_OWNER_PROVISION_RESULT_INVALID');
      return Object.freeze({});
    } finally {
      releaseChainLock(lock);
    }
  };

  const inspectLiveEvidence = async (input = {}) => {
    exactObject(input, ['lane', 'inspect'], 'SEALED_REALMS_AUTH_BRIDGE_LIVE_INPUT_INVALID');
    if (!['g002', 'ptr'].includes(input.lane) || typeof input.inspect !== 'function') {
      fail('SEALED_REALMS_AUTH_BRIDGE_LIVE_INPUT_INVALID');
    }
    const established = await establish();
    const imported = await authenticatedImportedReceipt(
      input.lane,
      established.chain,
      'SEALED_REALMS_AUTH_BRIDGE_LIVE_RECEIPT_INVALID',
    );
    let persistedOwner;
    if (input.lane === 'ptr') {
      persistedOwner = await authenticatedOwnerProvisionReceipt(
        established.chain,
        imported,
        'SEALED_REALMS_AUTH_BRIDGE_LIVE_RECEIPT_INVALID',
      );
    }
    let evidence;
    try { evidence = await input.inspect(Object.freeze({})); } catch {
      fail('SEALED_REALMS_AUTH_BRIDGE_LIVE_EVIDENCE_INVALID');
    }
    if (input.lane === 'g002') {
      exactReceiptEvidence(
        evidence,
        imported.receiptDigest,
        'evidenceDigest',
        'SEALED_REALMS_AUTH_BRIDGE_LIVE_EVIDENCE_INVALID',
      );
    } else {
      exactObject(
        evidence,
        ['receiptDigest', 'provisionReceiptDigest', 'evidenceDigest'],
        'SEALED_REALMS_AUTH_BRIDGE_LIVE_EVIDENCE_INVALID',
      );
      if (
        evidence.receiptDigest !== imported.receiptDigest
        || evidence.provisionReceiptDigest !== persistedOwner.provisionReceiptDigest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_LIVE_EVIDENCE_INVALID');
      requiredDigest(evidence.evidenceDigest, 'SEALED_REALMS_AUTH_BRIDGE_LIVE_EVIDENCE_INVALID');
    }
    return Object.freeze({});
  };

  const assertNoActivationReplay = () => {
    const existing = privateState.list({
      root: 'runtime', relativeDirectory: 'bridge/activation-evidence',
    });
    if (
      existing.some(name => !/^auth-bridge-suspension-[a-f0-9]{64}\.json$/u.test(name))
      || existing.length !== 0
    ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_REPLAY');
  };

  const inspectActivationEvidence = async () => {
    const established = await establish();
    const chain = established.chain;
    if (
      chain.phase !== 'complete' || chain.g002Final === null || chain.g002Cross === null
      || chain.ptrFinal === null || chain.ptrCross === null
    ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CHAIN_INCOMPLETE');
    const facts = await resolveFacts();
    const authority = assertFactsMatchAuthority(facts, chain);
    assertNoActivationReplay();
    const observation = await inspectSealedRealmsAdmissionSuspension({ fetchImpl: options.fetchImpl });
    const privateObservation = privateSuspensionObservation(observation);
    const finalFacts = await resolveFacts();
    const finalAuthority = assertFactsMatchAuthority(finalFacts, chain);
    const finalChain = readChain(established.relativePath);
    if (
      finalChain.deployment.digest !== chain.deployment.digest
      || finalChain.g002Final?.digest !== chain.g002Final.digest
      || finalChain.g002Cross?.digest !== chain.g002Cross.digest
      || finalChain.ptrFinal?.digest !== chain.ptrFinal.digest
      || finalChain.ptrCross?.digest !== chain.ptrCross.digest
    ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_REPLAY');
    const nonce = randomDigest(randomBytesImpl);
    if (
      nonce === chain.g002Final.value.nonce || nonce === chain.ptrFinal.value.nonce
    ) fail('SEALED_REALMS_AUTH_BRIDGE_RANDOM_INVALID');
    const activationGate = Object.freeze({
      deploymentAuthorityDigest: chain.deployment.digest,
      g002GateDigest: chain.g002Final.digest,
      g002ImportAuthorityCrossLinkDigest: chain.g002Cross.digest,
      ptrGateDigest: chain.ptrFinal.digest,
      ptrImportAuthorityCrossLinkDigest: chain.ptrCross.digest,
      deploymentAttestationDigest: deploymentAttestationDigest(finalFacts.deployment),
      bindingAttestationDigest: finalFacts.binding.ptrBindingAttestationDigest,
      postNoRedirect: privateObservation.post.noRedirect,
      postContentType: privateObservation.post.contentType,
      postAccessControlAllowOrigin: privateObservation.post.accessControlAllowOrigin,
      postProbeStatus: privateObservation.post.status,
      postProbeBodyBase64: privateObservation.post.bodyBase64,
      postProbeDigest: privateObservation.post.digest,
      optionsNoRedirect: privateObservation.options.noRedirect,
      optionsContentType: privateObservation.options.contentType,
      optionsAccessControlAllowOrigin: privateObservation.options.accessControlAllowOrigin,
      optionsProbeStatus: privateObservation.options.status,
      optionsProbeBodyBase64: privateObservation.options.bodyBase64,
      optionsProbeDigest: privateObservation.options.digest,
      confirmationDigest: randomDigest(randomBytesImpl),
      observedAt: finalFacts.sampled.toISOString(),
      nonce,
    });
    const receipt = Object.freeze({
      schemaVersion: 1,
      profile: SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RECEIPT_PROFILE,
      sourceCommit,
      deploymentAuthority: finalChain.deployment.value,
      g002Gate: finalChain.g002Final.value,
      g002ImportAuthorityCrossLink: finalChain.g002Cross.value,
      ptrGate: finalChain.ptrFinal.value,
      ptrImportAuthorityCrossLink: finalChain.ptrCross.value,
      activationGate,
    });
    assertNoActivationReplay();
    const bytes = canonicalJsonBytes(
      receipt,
      256 * 1_024,
      'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_RECEIPT_INVALID',
    );
    const receiptDigest = createHash('sha256')
      .update(SUSPENSION_RECEIPT_PREFIX).update(bytes).digest('hex');
    const relativePath = `bridge/activation-evidence/auth-bridge-suspension-${receiptDigest}.json`;
    try {
      assertFreshImmediatelyBeforeMutation(finalFacts);
      privateState.write({ root: 'runtime', relativePath, bytes });
    } catch (error) {
      if (error?.code !== 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') throw error;
      fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_REPLAY');
    } finally {
      bytes.fill(0);
    }
    const confirmation = Object.freeze({});
    activationConfirmations.set(confirmation, Object.freeze({
      sourceCommit: finalAuthority.sourceCommit,
      relativePath: established.relativePath,
      receiptDigest,
      observedAt: finalFacts.sampled.toISOString(),
      chainDigest: established.chainDigest,
      privateState,
      now,
      deploymentDigest: finalChain.deployment.digest,
      g002GateDigest: finalChain.g002Final.digest,
      g002CrossDigest: finalChain.g002Cross.digest,
      ptrGateDigest: finalChain.ptrFinal.digest,
      ptrCrossDigest: finalChain.ptrCross.digest,
      memberCommitment: activationGate.confirmationDigest,
      reauthenticate: async (reopenedChain) => {
        const reopenedFacts = await resolveFacts();
        assertFactsMatchAuthority(reopenedFacts, reopenedChain);
        return reopenedFacts;
      },
    }));
    return Object.freeze({ confirmation });
  };

  const state = Object.freeze({
    establish: async () => {
      await establish();
      return Object.freeze({ ready: true });
    },
    inspect,
    inspectGate,
    applyGate,
    inspectOwnerProvisionEvidence,
    applyOwnerProvision,
    inspectLiveEvidence,
    inspectActivationEvidence,
  });
  bridgeStates.add(state);
  bridgeStateSources.set(state, sourceCommit);
  return state;
}

export function assertSealedRealmsProductionAuthBridgeState(state) {
  if (!bridgeStates.has(state)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_STATE_CAPABILITY_INVALID');
  }
  return state;
}

/** Requires a fresh opaque dispatcher authority for the same authenticated S. */
export function assertSealedRealmsProductionAuthBridgeStateAuthority(state, authority) {
  assertSealedRealmsProductionAuthBridgeState(state);
  sourceCommitFromSealedRealmsProductionAuthority(authority);
  const preparationSourceCommit =
    preparationSourceCommitFromSealedRealmsProductionAuthority(authority);
  if (bridgeStateSources.get(state) !== preparationSourceCommit) {
    fail('SEALED_REALMS_AUTH_BRIDGE_SOURCE_MISMATCH');
  }
  return state;
}

function activationRecordDigest(value) {
  const line = canonicalLine(value, 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  try { return digestRecord(line); } finally { line.fill(0); }
}

function deepFreezePrivateProjection(value) {
  if (value !== null && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreezePrivateProjection(child);
    Object.freeze(value);
  }
  return value;
}

function validateActivationReceipt(receipt, member) {
  exactObject(receipt, [
    'schemaVersion', 'profile', 'sourceCommit', 'deploymentAuthority', 'g002Gate',
    'g002ImportAuthorityCrossLink', 'ptrGate', 'ptrImportAuthorityCrossLink', 'activationGate',
  ], 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  if (
    receipt.schemaVersion !== 1
    || receipt.profile !== SEALED_REALMS_AUTH_BRIDGE_SUSPENSION_RECEIPT_PROFILE
    || receipt.sourceCommit !== member.sourceCommit
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  validateDeploymentAuthority(receipt.deploymentAuthority);
  const deployment = Object.freeze({
    value: receipt.deploymentAuthority,
    digest: activationRecordDigest(receipt.deploymentAuthority),
  });
  validateGate(receipt.g002Gate, deployment);
  validateCrossLink(receipt.g002ImportAuthorityCrossLink, deployment);
  validateGate(receipt.ptrGate, deployment);
  validateCrossLink(receipt.ptrImportAuthorityCrossLink, deployment);
  const g002GateDigest = activationRecordDigest(receipt.g002Gate);
  const g002CrossDigest = activationRecordDigest(receipt.g002ImportAuthorityCrossLink);
  const ptrGateDigest = activationRecordDigest(receipt.ptrGate);
  const ptrCrossDigest = activationRecordDigest(receipt.ptrImportAuthorityCrossLink);
  if (
    deployment.digest !== member.deploymentDigest
    || g002GateDigest !== member.g002GateDigest
    || g002CrossDigest !== member.g002CrossDigest
    || ptrGateDigest !== member.ptrGateDigest
    || ptrCrossDigest !== member.ptrCrossDigest
    || receipt.g002ImportAuthorityCrossLink.previousRecordDigest !== g002GateDigest
    || receipt.g002ImportAuthorityCrossLink.consumedGateDigest !== g002GateDigest
    || receipt.ptrGate.previousRecordDigest !== g002CrossDigest
    || receipt.ptrImportAuthorityCrossLink.previousRecordDigest !== ptrGateDigest
    || receipt.ptrImportAuthorityCrossLink.consumedGateDigest !== ptrGateDigest
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  const gate = receipt.activationGate;
  exactObject(gate, [
    'deploymentAuthorityDigest', 'g002GateDigest', 'g002ImportAuthorityCrossLinkDigest',
    'ptrGateDigest', 'ptrImportAuthorityCrossLinkDigest', 'deploymentAttestationDigest',
    'bindingAttestationDigest', 'postNoRedirect', 'postContentType',
    'postAccessControlAllowOrigin', 'postProbeStatus', 'postProbeBodyBase64',
    'postProbeDigest', 'optionsNoRedirect', 'optionsContentType',
    'optionsAccessControlAllowOrigin', 'optionsProbeStatus', 'optionsProbeBodyBase64',
    'optionsProbeDigest', 'confirmationDigest', 'observedAt', 'nonce',
  ], 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  for (const key of [
    'deploymentAuthorityDigest', 'g002GateDigest', 'g002ImportAuthorityCrossLinkDigest',
    'ptrGateDigest', 'ptrImportAuthorityCrossLinkDigest', 'deploymentAttestationDigest',
    'bindingAttestationDigest', 'confirmationDigest', 'nonce',
  ]) requiredDigest(gate[key], 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  validateProbeRecord(gate, 'post');
  validateProbeRecord(gate, 'options');
  strictUtc(gate.observedAt, 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  if (
    gate.deploymentAuthorityDigest !== deployment.digest
    || gate.g002GateDigest !== g002GateDigest
    || gate.g002ImportAuthorityCrossLinkDigest !== g002CrossDigest
    || gate.ptrGateDigest !== ptrGateDigest
    || gate.ptrImportAuthorityCrossLinkDigest !== ptrCrossDigest
    || gate.confirmationDigest !== member.memberCommitment
    || gate.observedAt !== member.observedAt
    || gate.nonce === receipt.g002Gate.nonce
    || gate.nonce === receipt.ptrGate.nonce
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
}

async function consumeActivationEvidenceConfirmation(confirmation) {
  const member = activationConfirmations.get(confirmation);
  if (member === undefined || consumedActivationConfirmations.has(confirmation)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  }
  // Consume synchronously before opening owner-private state. A malformed,
  // swapped, or expired receipt remains permanently non-replayable.
  consumedActivationConfirmations.add(confirmation);
  activationConfirmations.delete(confirmation);
  const current = currentTime(member.now);
  if (
    current.getTime() < Date.parse(member.observedAt)
    || current.getTime() - Date.parse(member.observedAt) >= 5 * 60 * 1_000
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_EXPIRED');
  const relativePath = `bridge/activation-evidence/auth-bridge-suspension-${member.receiptDigest}.json`;
  let bytes;
  let receipt;
  try {
    bytes = member.privateState.read({ root: 'runtime', relativePath });
    if (
      createHash('sha256').update(SUSPENSION_RECEIPT_PREFIX).update(bytes).digest('hex')
        !== member.receiptDigest
    ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    receipt = JSON.parse(source);
    if (
      `${JSON.stringify(receipt)}\n` !== source
    ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
    validateActivationReceipt(receipt, member);
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  } finally {
    bytes?.fill(0);
  }
  let chain;
  try {
    const chainBytes = member.privateState.read({ root: 'runtime', relativePath: member.relativePath });
    try { chain = parseAuthorityChain(chainBytes, member.sourceCommit); } finally { chainBytes.fill(0); }
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  }
  if (
    chain.deployment.digest !== member.deploymentDigest
    || chain.g002Final?.digest !== member.g002GateDigest
    || chain.g002Cross?.digest !== member.g002CrossDigest
    || chain.ptrFinal?.digest !== member.ptrGateDigest
    || chain.ptrCross?.digest !== member.ptrCrossDigest
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  try {
    await member.reauthenticate(chain);
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  }
  let finalReceipt;
  try {
    const reopened = member.privateState.read({ root: 'runtime', relativePath });
    try {
      if (
        createHash('sha256').update(SUSPENSION_RECEIPT_PREFIX).update(reopened).digest('hex')
          !== member.receiptDigest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
      const source = new TextDecoder('utf-8', { fatal: true }).decode(reopened);
      finalReceipt = JSON.parse(source);
      if (`${JSON.stringify(finalReceipt)}\n` !== source) {
        fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
      }
      validateActivationReceipt(finalReceipt, member);
      if (JSON.stringify(finalReceipt) !== JSON.stringify(receipt)) {
        fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
      }
    } finally { reopened.fill(0); }
    const finalChainBytes = member.privateState.read({
      root: 'runtime', relativePath: member.relativePath,
    });
    try {
      const finalChain = parseAuthorityChain(finalChainBytes, member.sourceCommit);
      if (
        finalChain.deployment.digest !== member.deploymentDigest
        || finalChain.g002Final?.digest !== member.g002GateDigest
        || finalChain.g002Cross?.digest !== member.g002CrossDigest
        || finalChain.ptrFinal?.digest !== member.ptrGateDigest
        || finalChain.ptrCross?.digest !== member.ptrCrossDigest
      ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
    } finally { finalChainBytes.fill(0); }
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_INVALID');
  }
  const finalCurrent = currentTime(member.now);
  if (
    finalCurrent.getTime() < Date.parse(member.observedAt)
    || finalCurrent.getTime() - Date.parse(member.observedAt) >= 5 * 60 * 1_000
  ) fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_CONFIRMATION_EXPIRED');
  const opaqueMember = Object.freeze({});
  activationEvidenceMembers.set(opaqueMember, deepFreezePrivateProjection({
    authBridgeSuspensionPrivateReceipt: finalReceipt,
  }));
  return opaqueMember;
}

/**
 * Task 6E may capture its fixed activation generator here. The capability is
 * opaque and cannot be supplied through dispatch/lane inputs.
 */
export function createSealedRealmsProductionActivationEvidenceGenerator(input) {
  const options = exactObject(
    input,
    ['generate'],
    'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID',
  );
  if (typeof options.generate !== 'function') {
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID');
  }
  const capability = Object.freeze({});
  activationEvidenceGenerators.set(capability, options.generate);
  return capability;
}

/**
 * The activation lane may retain this branded capability, but it is never an
 * operation input and cannot be reconstructed from dispatcher data.
 */
export function assertSealedRealmsProductionActivationEvidenceGenerator(generator) {
  if (!activationEvidenceGenerators.has(generator)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID');
  }
  return generator;
}

/** Verifies an opaque member handed only to a captured Task 6E generator. */
export function assertSealedRealmsProductionActivationEvidenceMember(member) {
  if (!activationEvidenceMembers.has(member)) {
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_MEMBER_INVALID');
  }
  return member;
}

/** Narrow Task 6E-only accessor for the authenticated deeply-frozen private receipt projection. */
export function readSealedRealmsProductionActivationEvidenceMember(member) {
  assertSealedRealmsProductionActivationEvidenceMember(member);
  return activationEvidenceMembers.get(member);
}

/** Consumes private evidence without exposing a member or private receipt. */
export async function consumeSealedRealmsProductionActivationEvidenceConfirmation(confirmation) {
  await consumeActivationEvidenceConfirmation(confirmation);
  return Object.freeze({});
}

/**
 * The Task 6E escrow route: claim/reopen/re-attest first, then hand an opaque
 * member to its already captured fixed generator. Nothing from that callback
 * is returned through Task 6D's dispatcher boundary.
 */
export async function consumeSealedRealmsProductionActivationEvidenceForGenerator(input) {
  exactObject(input, ['confirmation', 'generator'], 'SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID');
  const generate = activationEvidenceGenerators.get(input.generator);
  if (generate === undefined) {
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID');
  }
  const member = await consumeActivationEvidenceConfirmation(input.confirmation);
  try {
    await generate(Object.freeze({ member }));
  } catch (error) {
    if (error instanceof SealedRealmsProductionAuthBridgeStateError) throw error;
    fail('SEALED_REALMS_AUTH_BRIDGE_ACTIVATION_GENERATOR_INVALID');
  } finally { activationEvidenceMembers.delete(member); }
  return Object.freeze({});
}
