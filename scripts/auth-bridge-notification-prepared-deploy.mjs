import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import {
  importAuthBridgeNotificationPreparedAttestedModules,
  verifyAuthBridgeNotificationPreparedDeployClosure,
} from './auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  verifyAuthBridgeNotificationPreparedInstalledToolchain,
} from './auth-bridge-notification-prepared-installed-toolchain.mjs';
import {
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt,
  parseAuthBridgeNotificationPreparedReceipt,
  readPrivateAuthBridgeNotificationPreparedReceipt,
  resolveExpiredAuthBridgeNotificationPreparedReceiptByDigest,
  resolveFreshAuthBridgeNotificationPreparedReceiptByDigest,
  resolvePendingAuthBridgeNotificationPreparedRecoveryReceipt,
  verifyAuthBridgeNotificationPreparedReceipt,
  writePrivateAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';
import {
  resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority,
  writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  inspectAuthBridgeNotificationPreparedRecoveryAuthority,
} from './auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import {
  createSealedRealmsProductionPrivateState,
} from './sealed-realms-production-private-state.mjs';

const execFileAsync = promisify(execFile);
const REPOSITORY = 'ael-dev3/Warpkeep';
const WORKFLOW_PATH = '.github/workflows/notification-bridge-prepared.yml';
const WORKFLOW_REF = `${REPOSITORY}/${WORKFLOW_PATH}@refs/heads/main`;
const GITHUB_ORIGIN = 'https://api.github.com';
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const RUN_ID = /^[1-9][0-9]{0,19}$/u;
const SECRET = /^\S{20,4096}$/u;
const POSITIVE_FID = /^[1-9][0-9]{0,15}$/u;
const SPACETIMEDB_DATABASE_IDENTITY = /^[a-f0-9]{64}$/u;
const PRODUCTION_SPACETIMEDB_DATABASE =
  'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const MAX_GITHUB_RESPONSE_BYTES = 512 * 1024;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024;
const MAX_TRACKED_LISTING_BYTES = 256 * 1024;
const REQUIRED_ENVIRONMENT = Object.freeze([
  'GITHUB_ACTIONS',
  'GITHUB_EVENT_NAME',
  'GITHUB_REF',
  'GITHUB_REPOSITORY',
  'GITHUB_RUN_ATTEMPT',
  'GITHUB_RUN_ID',
  'GITHUB_SHA',
  'GITHUB_TOKEN',
  'GITHUB_WORKFLOW_REF',
  'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
  'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
  'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
  'WARPKEEP_PLAYER_CANARY_OWNER_FID',
  'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
  'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
]);
const FORBIDDEN_ENVIRONMENT = Object.freeze([
  'CLOUDFLARE_API_BASE_URL',
  'CLOUDFLARE_API_KEY',
  'CLOUDFLARE_EMAIL',
  'CLOUDFLARE_API_TOKEN',
  'WRANGLER_API_ENVIRONMENT',
  'WRANGLER_AUTH_DOMAIN',
  'WRANGLER_PROFILE',
  'WRANGLER_SEND_METRICS',
  'BASH_ENV',
  'ENV',
  'NODE_OPTIONS',
  'NODE_PATH',
  'NODE_EXTRA_CA_CERTS',
  'NODE_TLS_REJECT_UNAUTHORIZED',
  'NODE_DEBUG',
  'NODE_DEBUG_NATIVE',
  'OPENSSL_CONF',
  'SSL_CERT_FILE',
  'SSL_CERT_DIR',
  'SSLKEYLOGFILE',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'ALL_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'all_proxy',
  'no_proxy',
  'DYLD_INSERT_LIBRARIES',
  'DYLD_LIBRARY_PATH',
  'DYLD_FRAMEWORK_PATH',
  'DYLD_FALLBACK_LIBRARY_PATH',
  'DYLD_FALLBACK_FRAMEWORK_PATH',
  'LD_PRELOAD',
  'LD_LIBRARY_PATH',
]);
const RECOVERY_AUTHORITY_PROFILE =
  'warpkeep-sealed-realms-auth-bridge-import-authority-v1';
const RECOVERY_RECORD_PREFIX =
  'warpkeep.sealed-realms.auth-bridge-import-authority-record.v1\n';
const RECOVERY_AUTHORITY_FILE =
  /^auth-bridge-import-authority-([a-f0-9]{64})\.jsonl$/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const RECOVERY_AUTHORITY_KEYS = Object.freeze([
  'schemaVersion', 'profile', 'recordType', 'sourceCommit', 'previousRecordDigest',
  'preparedReceiptBodyBase64', 'preparedReceiptDigest', 'preparedAt', 'expiresAt',
  'completedJournalHeadDigest', 'completedJournalProfile', 'completedJournalOutcome',
  'completedJournalPredecessorDigest', 'runId', 'runAttempt', 'completedAt',
  'deploymentId', 'workerVersionId', 'bridgeSourceCommit', 'ptrDatabaseIdentity',
  'ptrBindingDigest', 'controlPlaneAttestationDigest', 'publicAttestationDigest',
  'privateAttestationDigest', 'ptrBindingAttestationDigest', 'recordedAt',
]);
const RECOVERY_GATE_SUFFIX = Object.freeze([
  'deploymentAuthorityDigest', 'lane', 'supersedesGateDigest', 'confirmationDigest',
  'deploymentId', 'workerVersionId', 'bridgeSourceCommit', 'ptrDatabaseIdentity',
  'ptrBindingDigest', 'deploymentAttestationDigest', 'bindingAttestationDigest',
  'postNoRedirect', 'postContentType', 'postAccessControlAllowOrigin',
  'postProbeStatus', 'postProbeBodyBase64', 'postProbeDigest', 'optionsNoRedirect',
  'optionsContentType', 'optionsAccessControlAllowOrigin', 'optionsProbeStatus',
  'optionsProbeBodyBase64', 'optionsProbeDigest', 'observedAt', 'nonce',
]);
const RECOVERY_CROSS_SUFFIX = Object.freeze([
  'deploymentAuthorityDigest', 'lane', 'consumedGateDigest',
  'realmImportReceiptDigest', 'outcome', 'linkedAt',
]);
const RECOVERY_INSPECTION_STABLE_KEYS = Object.freeze([
  'deploymentId', 'workerVersionId', 'bridgeSourceCommit',
  'ptrDatabaseIdentity', 'ptrBindingDigest',
]);
const recoveryTestCapabilities = new WeakSet();
const productionRecoveryCapability = Object.freeze({});
recoveryTestCapabilities.add(productionRecoveryCapability);
let productionRecoveryTestRuntime = null;

export function createAuthBridgeNotificationPreparedRecoveryTestCapability() {
  if (process.env.NODE_ENV !== 'test') {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_TEST_ONLY_FORBIDDEN');
  }
  const capability = Object.freeze({});
  recoveryTestCapabilities.add(capability);
  return capability;
}

export class AuthBridgeNotificationPreparedDeployEntrypointError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedDeployEntrypointError';
    this.code = code;
  }
}

function fail(code) {
  throw new AuthBridgeNotificationPreparedDeployEntrypointError(code);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function canonicalDirectory(path, code) {
  if (typeof path !== 'string' || !isAbsolute(path)) fail(code);
  let canonical;
  let status;
  try {
    canonical = realpathSync(resolve(path));
    status = lstatSync(resolve(path));
  } catch {
    fail(code);
  }
  if (
    canonical !== resolve(path)
    || status.isSymbolicLink()
    || !status.isDirectory()
  ) fail(code);
  return canonical;
}

function copyAndScrubEnvironment(environment) {
  const values = {};
  for (const name of REQUIRED_ENVIRONMENT) {
    if (typeof environment[name] !== 'string') {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_INVALID');
    }
    values[name] = environment[name];
  }
  for (const name of FORBIDDEN_ENVIRONMENT) {
    if (environment[name] !== undefined) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_FORBIDDEN');
    }
  }
  for (const name of [
    'GITHUB_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_PLAYER_CANARY_OWNER_FID',
    'WARPKEEP_PTR_SPACETIMEDB_DATABASE',
    'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ]) delete environment[name];
  if (
    values.GITHUB_ACTIONS !== 'true'
    || values.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || values.GITHUB_REF !== 'refs/heads/main'
    || values.GITHUB_REPOSITORY !== REPOSITORY
    || values.GITHUB_WORKFLOW_REF !== WORKFLOW_REF
    || !SOURCE_COMMIT.test(values.GITHUB_SHA)
    || !RUN_ID.test(values.GITHUB_RUN_ID)
    || !RUN_ID.test(values.GITHUB_RUN_ATTEMPT)
    || Number(values.GITHUB_RUN_ATTEMPT) > 1_000
    || !SECRET.test(values.GITHUB_TOKEN)
    || !SECRET.test(values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN)
    || !SECRET.test(values.WARPKEEP_PRODUCTION_ADMIN_TOKEN)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ZONE_ID)
    || !POSITIVE_FID.test(values.WARPKEEP_PLAYER_CANARY_OWNER_FID)
    || BigInt(values.WARPKEEP_PLAYER_CANARY_OWNER_FID)
      > BigInt(Number.MAX_SAFE_INTEGER)
    || !SPACETIMEDB_DATABASE_IDENTITY.test(
      values.WARPKEEP_PTR_SPACETIMEDB_DATABASE,
    )
    || values.WARPKEEP_PTR_SPACETIMEDB_DATABASE
      === PRODUCTION_SPACETIMEDB_DATABASE
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_ENVIRONMENT_INVALID');
  return Object.freeze(values);
}

function copyAndScrubRecoveryEnvironment(environment) {
  if (!isRecord(environment)) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_ENVIRONMENT_INVALID');
  }
  const required = [
    'GITHUB_ACTIONS', 'GITHUB_EVENT_NAME', 'GITHUB_REF', 'GITHUB_REPOSITORY',
    'GITHUB_RUN_ATTEMPT', 'GITHUB_RUN_ID', 'GITHUB_SHA', 'GITHUB_TOKEN',
    'GITHUB_WORKFLOW_REF',
    'WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_ZONE_ID', 'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ];
  const values = Object.fromEntries(required.map(name => [name, environment[name]]));
  for (const name of [
    'GITHUB_TOKEN',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN',
    'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
  ]) delete environment[name];
  if (
    required.some(name => typeof values[name] !== 'string')
    || FORBIDDEN_ENVIRONMENT.some(name => environment[name] !== undefined)
    || values.GITHUB_ACTIONS !== 'true'
    || values.GITHUB_EVENT_NAME !== 'workflow_dispatch'
    || values.GITHUB_REF !== 'refs/heads/main'
    || values.GITHUB_REPOSITORY !== REPOSITORY
    || values.GITHUB_WORKFLOW_REF !== WORKFLOW_REF
    || !SOURCE_COMMIT.test(values.GITHUB_SHA)
    || !RUN_ID.test(values.GITHUB_RUN_ID)
    || !RUN_ID.test(values.GITHUB_RUN_ATTEMPT)
    || Number(values.GITHUB_RUN_ATTEMPT) > 1_000
    || !SECRET.test(values.GITHUB_TOKEN)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID)
    || !ACCOUNT_ID.test(values.WARPKEEP_AUTH_BRIDGE_ZONE_ID)
    || !SECRET.test(values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN)
    || !SECRET.test(values.WARPKEEP_PRODUCTION_ADMIN_TOKEN)
    || values.GITHUB_TOKEN === values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN
    || values.GITHUB_TOKEN === values.WARPKEEP_PRODUCTION_ADMIN_TOKEN
    || values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN
      === values.WARPKEEP_PRODUCTION_ADMIN_TOKEN
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_ENVIRONMENT_INVALID');
  return Object.freeze(values);
}

function exactRecoveryObject(value, keys) {
  if (
    !isRecord(value)
    || Object.getPrototypeOf(value) !== Object.prototype
    || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys)
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  return value;
}

function recoveryTimestamp(value) {
  if (
    typeof value !== 'string'
    || !STRICT_UTC.test(value)
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  return value;
}

function assertRecoveryInspectionFreshAt(inspection, now) {
  if (
    !isRecord(inspection)
    || !(now instanceof Date)
    || Number.isNaN(now.getTime())
    || typeof inspection.oldestObservedAt !== 'string'
    || !STRICT_UTC.test(inspection.oldestObservedAt)
    || new Date(Date.parse(inspection.oldestObservedAt)).toISOString()
      !== inspection.oldestObservedAt
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_INVALID');
  const oldest = Date.parse(inspection.oldestObservedAt);
  if (
    oldest > now.getTime()
    || now.getTime() - oldest >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_STALE');
}

function assertRecoveryInspectionRound(inspection) {
  if (
    !isRecord(inspection)
    || !UUID.test(inspection.deploymentId ?? '')
    || !UUID.test(inspection.workerVersionId ?? '')
    || !SOURCE_COMMIT.test(inspection.bridgeSourceCommit ?? '')
    || !SHA256.test(inspection.ptrDatabaseIdentity ?? '')
    || !SHA256.test(inspection.ptrBindingDigest ?? '')
    || !isRecord(inspection.liveAttestation)
    || [
      'controlPlaneAttestationDigest', 'publicAttestationDigest',
      'privateAttestationDigest', 'ptrBindingAttestationDigest',
    ].some(key => !SHA256.test(inspection[key] ?? ''))
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_INVALID');
}

function assertRecoveryInspectionStable(candidate, baseline) {
  if (
    !isRecord(candidate)
    || RECOVERY_INSPECTION_STABLE_KEYS.some(
      key => candidate[key] !== baseline[key],
    )
    || JSON.stringify(candidate.liveAttestation)
      !== JSON.stringify(baseline.liveAttestation)
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
}

function assertRecoveryInspectionBoundToPrior(
  inspection,
  prior,
  verifiedReceipt,
) {
  if (
    !isRecord(prior)
    || !isRecord(verifiedReceipt)
    || !isRecord(verifiedReceipt.liveAttestation)
    || inspection.deploymentId !== prior.deploymentId
    || inspection.workerVersionId !== prior.workerVersionId
    || inspection.bridgeSourceCommit !== prior.bridgeSourceCommit
    || inspection.ptrDatabaseIdentity !== prior.ptrDatabaseIdentity
    || inspection.ptrBindingDigest !== prior.ptrBindingDigest
    || JSON.stringify(inspection.liveAttestation)
      !== JSON.stringify(verifiedReceipt.liveAttestation)
    || canonicalAuthBridgeReleaseAttestationDigest(
      verifiedReceipt.liveAttestation,
    ) !== verifiedReceipt.receipt?.liveAttestationDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
}

function recoveryRecordDigest(line) {
  return createHash('sha256')
    .update(RECOVERY_RECORD_PREFIX)
    .update(`${line}\n`, 'utf8')
    .digest('hex');
}

function validateRecoveryProbe(value, prefix) {
  const body = Buffer.from(value[`${prefix}ProbeBodyBase64`] ?? '', 'base64');
  try {
    let parsed;
    try { parsed = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)); } catch {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    }
    if (
      value[`${prefix}NoRedirect`] !== true
      || value[`${prefix}ContentType`] !== 'application/json; charset=utf-8'
      || value[`${prefix}AccessControlAllowOrigin`] !== 'https://warpkeep.com'
      || value[`${prefix}ProbeStatus`] !== 503
      || body.byteLength < 1 || body.byteLength > 16 * 1024
      || body.toString('base64') !== value[`${prefix}ProbeBodyBase64`]
      || createHash('sha256').update(body).digest('hex')
        !== value[`${prefix}ProbeDigest`]
      || JSON.stringify(parsed) !== JSON.stringify({
        error: {
          code: 'admission_requests_suspended',
          message: 'New admission requests are temporarily suspended.',
        },
      })
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  } finally { body.fill(0); }
}

function validateRecoveryDeploymentAuthority(value, sourceCommit) {
  exactRecoveryObject(value, RECOVERY_AUTHORITY_KEYS);
  const receiptBytes = Buffer.from(value.preparedReceiptBodyBase64 ?? '', 'base64');
  try {
    let receipt;
    try {
      receipt = parseAuthBridgeNotificationPreparedReceipt(JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(receiptBytes),
      ));
    } catch { fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID'); }
    const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    if (
      value.schemaVersion !== 1
      || value.profile !== RECOVERY_AUTHORITY_PROFILE
      || value.recordType !== 'deploymentAuthority'
      || value.sourceCommit !== sourceCommit
      || value.previousRecordDigest !== null
      || publication.receiptBytesBase64 !== value.preparedReceiptBodyBase64
      || publication.receiptDigest !== value.preparedReceiptDigest
      || receipt.bridgeSourceCommit !== sourceCommit
      || receipt.preparedAt !== value.preparedAt
      || receipt.expiresAt !== value.expiresAt
      || !SHA256.test(value.completedJournalHeadDigest ?? '')
      || ![
        'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3',
        'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
      ].includes(value.completedJournalProfile)
      || ![
        'verified', 'verified-after-release-error', 'already-verified',
        'verified-read-only-recovery',
      ].includes(value.completedJournalOutcome)
      || (value.completedJournalPredecessorDigest !== null
        && !SHA256.test(value.completedJournalPredecessorDigest ?? ''))
      || !RUN_ID.test(value.runId ?? '')
      || !Number.isSafeInteger(value.runAttempt)
      || value.runAttempt < 1 || value.runAttempt > 1_000
      || !UUID.test(value.deploymentId ?? '')
      || !UUID.test(value.workerVersionId ?? '')
      || value.bridgeSourceCommit !== sourceCommit
      || [
        'ptrDatabaseIdentity', 'ptrBindingDigest',
        'controlPlaneAttestationDigest', 'publicAttestationDigest',
        'privateAttestationDigest', 'ptrBindingAttestationDigest',
      ].some(key => !SHA256.test(value[key] ?? ''))
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    for (const key of ['preparedAt', 'expiresAt', 'completedAt', 'recordedAt']) {
      recoveryTimestamp(value[key]);
    }
    if (Date.parse(value.expiresAt) <= Date.parse(value.preparedAt)) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    }
    return Object.freeze({ value: Object.freeze(value), receipt });
  } finally { receiptBytes.fill(0); }
}

function parseRecoveryAuthorityChain(bytesInput, sourceCommit) {
  const bytes = Buffer.from(bytesInput);
  try {
    if (bytes.byteLength < 2 || bytes.byteLength > 512 * 1024 || bytes.at(-1) !== 10) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    }
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    const lines = source.split('\n');
    lines.pop();
    if (lines.length < 1 || lines.length > 128 || lines.some(line => line.length === 0)) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    }
    let previousDigest = null;
    let phase = 'g002';
    let g002Gate = null;
    let ptrGate = null;
    let deployment;
    for (const [index, line] of lines.entries()) {
      let value;
      try { value = JSON.parse(line); } catch {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
      }
      if (JSON.stringify(value) !== line || value.sourceCommit !== sourceCommit
        || value.previousRecordDigest !== previousDigest) {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
      }
      if (index === 0) {
        deployment = validateRecoveryDeploymentAuthority(value, sourceCommit);
      } else if (['g002Gate', 'ptrGate'].includes(value.recordType)) {
        const lane = value.recordType === 'g002Gate' ? 'g002' : 'ptr';
        exactRecoveryObject(value, [
          'schemaVersion', 'profile', 'recordType', 'sourceCommit',
          'previousRecordDigest', ...RECOVERY_GATE_SUFFIX,
        ]);
        const priorGate = lane === 'g002' ? g002Gate : ptrGate;
        if (
          phase !== lane || value.schemaVersion !== 1
          || value.profile !== RECOVERY_AUTHORITY_PROFILE
          || value.lane !== lane
          || value.deploymentAuthorityDigest !== recoveryRecordDigest(lines[0])
          || value.supersedesGateDigest !== priorGate
          || value.deploymentId !== deployment.value.deploymentId
          || value.workerVersionId !== deployment.value.workerVersionId
          || value.bridgeSourceCommit !== deployment.value.bridgeSourceCommit
          || value.ptrDatabaseIdentity !== deployment.value.ptrDatabaseIdentity
          || value.ptrBindingDigest !== deployment.value.ptrBindingDigest
          || ['confirmationDigest', 'deploymentAttestationDigest',
            'bindingAttestationDigest', 'nonce'].some(key =>
            !SHA256.test(value[key] ?? ''))
        ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
        recoveryTimestamp(value.observedAt);
        validateRecoveryProbe(value, 'post');
        validateRecoveryProbe(value, 'options');
        if (lane === 'g002') g002Gate = recoveryRecordDigest(line);
        else ptrGate = recoveryRecordDigest(line);
      } else if ([
        'g002ImportAuthorityCrossLink', 'ptrImportAuthorityCrossLink',
      ].includes(value.recordType)) {
        const lane = value.recordType.startsWith('g002') ? 'g002' : 'ptr';
        exactRecoveryObject(value, [
          'schemaVersion', 'profile', 'recordType', 'sourceCommit',
          'previousRecordDigest', ...RECOVERY_CROSS_SUFFIX,
        ]);
        const gate = lane === 'g002' ? g002Gate : ptrGate;
        if (
          phase !== lane || gate === null || value.schemaVersion !== 1
          || value.profile !== RECOVERY_AUTHORITY_PROFILE
          || value.lane !== lane || value.consumedGateDigest !== gate
          || value.deploymentAuthorityDigest !== recoveryRecordDigest(lines[0])
          || !SHA256.test(value.realmImportReceiptDigest ?? '')
          || !['applied', 'adopted'].includes(value.outcome)
        ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
        recoveryTimestamp(value.linkedAt);
        phase = lane === 'g002' ? 'ptr' : 'complete';
      } else fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
      previousDigest = recoveryRecordDigest(line);
    }
    if (
      phase !== 'complete'
      && !(phase === 'ptr' && g002Gate !== null && ptrGate === null)
      && !(phase === 'g002' && lines.length === 1
        && deployment.value.completedJournalProfile
          === 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1')
    ) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
    }
    return Object.freeze({ ...deployment, phase });
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedDeployEntrypointError) throw error;
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  } finally { bytes.fill(0); }
}

function resolveRecoveryPriorAuthority({ privateState, sourceCommit, journal, now }) {
  if (
    !isRecord(privateState) || typeof privateState.list !== 'function'
    || typeof privateState.read !== 'function' || !SOURCE_COMMIT.test(sourceCommit ?? '')
    || !isRecord(journal) || !(now instanceof Date) || Number.isNaN(now.getTime())
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  const names = privateState.list({ root: 'runtime', relativeDirectory: 'bridge' });
  if (!Array.isArray(names) || names.length > 16) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
  }
  const chains = [];
  for (const name of names) {
    const match = RECOVERY_AUTHORITY_FILE.exec(name);
    if (match === null) {
      if (!['locks', 'activation-evidence'].includes(name)) {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
      }
      continue;
    }
    const bytes = privateState.read({
      root: 'runtime', relativePath: `bridge/${name}`,
    });
    try {
      const chain = parseRecoveryAuthorityChain(bytes, sourceCommit);
      const authority = chain.value;
      const digest = createHash('sha256').update(JSON.stringify([
        RECOVERY_AUTHORITY_PROFILE, sourceCommit, authority.preparedReceiptDigest,
        authority.completedJournalHeadDigest, authority.deploymentId,
        authority.workerVersionId, authority.ptrBindingDigest,
      ])).digest('hex');
      if (digest !== match[1]) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_INVALID');
      chains.push(chain);
    } finally { bytes.fill?.(0); }
  }
  if (names.includes('locks')) {
    const locks = privateState.list({ root: 'runtime', relativeDirectory: 'bridge/locks' });
    if (!Array.isArray(locks) || locks.length !== 0) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_BUSY');
    }
  }
  const eligible = chains.filter(chain => (
    chain.value.completedJournalHeadDigest === journal.journalHeadDigest
    && chain.value.completedJournalProfile === journal.profile
    && chain.value.completedJournalOutcome === journal.outcome
    && chain.value.completedJournalPredecessorDigest === journal.predecessorDigest
    && chain.value.runId === journal.runId
    && chain.value.runAttempt === journal.runAttempt
    && chain.value.completedAt === journal.completedAt
    && chain.value.workerVersionId === journal.workerVersionId
    && chain.value.sourceCommit === journal.sourceCommit
    && (journal.profile
      === 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1'
      || Date.parse(chain.value.expiresAt) <= now.getTime())
  ));
  if (
    eligible.length === 0
    && journal.profile
      === 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1'
  ) {
    const pending = chains.filter(chain => (
      chain.value.completedJournalHeadDigest === journal.predecessorDigest
      && chain.value.preparedReceiptDigest
        === journal.priorPreparedReceiptDigest
      && chain.value.sourceCommit === journal.sourceCommit
      && chain.value.workerVersionId === journal.workerVersionId
      && chain.value.deploymentId === journal.deploymentId
      && chain.value.ptrDatabaseIdentity === journal.ptrDatabaseIdentity
      && chain.value.ptrBindingDigest === journal.ptrBindingDigest
      && Date.parse(chain.value.expiresAt) <= now.getTime()
    ));
    if (pending.length === 1 && chains.length === 1) {
      return Object.freeze({
        ...pending[0],
        pendingRecoveryHead: Object.freeze({ ...journal }),
      });
    }
  }
  if (
    eligible.length !== 1
    || (journal.profile
      === 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3'
      && chains.length !== 1)
  ) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_AMBIGUOUS');
  }
  return eligible[0];
}

function recoveryAuthorityChainDigest(value) {
  return createHash('sha256').update(JSON.stringify([
    RECOVERY_AUTHORITY_PROFILE,
    value.sourceCommit,
    value.preparedReceiptDigest,
    value.completedJournalHeadDigest,
    value.deploymentId,
    value.workerVersionId,
    value.ptrBindingDigest,
  ])).digest('hex');
}

/**
 * Task 6E's sole durable recovery-authority write. The caller cannot select a
 * path or digest: both are derived from the authenticated receipt, journal,
 * deployment, and PTR binding tuple recognized by the frozen Task 6D reader.
 */
function createRecoveryAuthorityChain({
  privateState,
  sourceCommit,
  priorAuthority,
  receiptPublication,
  journal,
  inspection,
  recordedAt,
}) {
  if (
    !isRecord(privateState)
    || typeof privateState.list !== 'function'
    || typeof privateState.read !== 'function'
    || typeof privateState.write !== 'function'
    || !SOURCE_COMMIT.test(sourceCommit ?? '')
    || !isRecord(priorAuthority)
    || !isRecord(priorAuthority.value)
    || !isRecord(receiptPublication)
    || !isRecord(receiptPublication.receipt)
    || !isRecord(journal)
    || !isRecord(inspection)
    || !(recordedAt instanceof Date)
    || Number.isNaN(recordedAt.getTime())
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_INVALID');
  const prior = priorAuthority.value;
  const receipt = parseAuthBridgeNotificationPreparedReceipt(
    receiptPublication.receipt,
  );
  const canonicalPublication =
    canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
  if (
    canonicalPublication.receiptDigest !== receiptPublication.receiptDigest
    || canonicalPublication.receiptBytesBase64
      !== receiptPublication.receiptBytesBase64
    || receipt.bridgeSourceCommit !== sourceCommit
    || journal.schemaVersion !== 1
    || journal.profile
      !== 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1'
    || journal.sourceCommit !== sourceCommit
    || journal.priorPreparedReceiptDigest !== prior.preparedReceiptDigest
    || journal.priorCompletedJournalHeadDigest
      !== prior.completedJournalHeadDigest
    || journal.preparedReceiptDigest !== canonicalPublication.receiptDigest
    || journal.predecessorDigest !== prior.completedJournalHeadDigest
    || journal.outcome !== 'verified-read-only-recovery'
    || journal.noDeploy !== true
    || !SHA256.test(journal.journalHeadDigest ?? '')
    || journal.journalHeadDigest !== createHash('sha256')
      .update(`${JSON.stringify(Object.fromEntries([
        'schemaVersion', 'profile', 'sourceCommit', 'runId', 'runAttempt',
        'priorPreparedReceiptDigest', 'priorCompletedJournalHeadDigest',
        'preparedReceiptDigest', 'deploymentId', 'workerVersionId',
        'bridgeSourceCommit', 'ptrDatabaseIdentity', 'ptrBindingDigest',
        'controlPlaneAttestationDigest', 'publicAttestationDigest',
        'privateAttestationDigest', 'ptrBindingAttestationDigest',
        'completedAt', 'noDeploy', 'outcome',
      ].map(key => [key, journal[key]])))}\n`).digest('hex')
    || journal.deploymentId !== prior.deploymentId
    || journal.workerVersionId !== prior.workerVersionId
    || journal.bridgeSourceCommit !== sourceCommit
    || journal.ptrDatabaseIdentity !== prior.ptrDatabaseIdentity
    || journal.ptrBindingDigest !== prior.ptrBindingDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_INVALID');
  for (const key of [
    'deploymentId', 'workerVersionId', 'bridgeSourceCommit',
    'ptrDatabaseIdentity', 'ptrBindingDigest',
  ]) {
    if (inspection[key] !== journal[key]) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_INVALID');
    }
  }
  for (const key of [
    'controlPlaneAttestationDigest', 'publicAttestationDigest',
    'privateAttestationDigest', 'ptrBindingAttestationDigest',
  ]) {
    if (inspection[key] !== journal[key] || !SHA256.test(journal[key] ?? '')) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_INVALID');
    }
  }
  const record = Object.freeze({
    schemaVersion: 1,
    profile: RECOVERY_AUTHORITY_PROFILE,
    recordType: 'deploymentAuthority',
    sourceCommit,
    previousRecordDigest: null,
    preparedReceiptBodyBase64: canonicalPublication.receiptBytesBase64,
    preparedReceiptDigest: canonicalPublication.receiptDigest,
    preparedAt: receipt.preparedAt,
    expiresAt: receipt.expiresAt,
    completedJournalHeadDigest: journal.journalHeadDigest,
    completedJournalProfile: journal.profile,
    completedJournalOutcome: journal.outcome,
    completedJournalPredecessorDigest: journal.predecessorDigest,
    runId: journal.runId,
    runAttempt: journal.runAttempt,
    completedAt: journal.completedAt,
    deploymentId: journal.deploymentId,
    workerVersionId: journal.workerVersionId,
    bridgeSourceCommit: journal.bridgeSourceCommit,
    ptrDatabaseIdentity: journal.ptrDatabaseIdentity,
    ptrBindingDigest: journal.ptrBindingDigest,
    controlPlaneAttestationDigest: journal.controlPlaneAttestationDigest,
    publicAttestationDigest: journal.publicAttestationDigest,
    privateAttestationDigest: journal.privateAttestationDigest,
    ptrBindingAttestationDigest: journal.ptrBindingAttestationDigest,
    recordedAt: recordedAt.toISOString(),
  });
  validateRecoveryDeploymentAuthority(record, sourceCommit);
  const digest = recoveryAuthorityChainDigest(record);
  const relativePath =
    `bridge/auth-bridge-import-authority-${digest}.jsonl`;
  const body = Buffer.from(`${JSON.stringify(record)}\n`, 'utf8');
  const readExact = () => {
    let persisted;
    try {
      persisted = privateState.read({ root: 'runtime', relativePath });
      if (!Buffer.from(persisted).equals(body)) {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
      }
      const parsed = parseRecoveryAuthorityChain(persisted, sourceCommit);
      if (
        parsed.value.completedJournalHeadDigest !== journal.journalHeadDigest
        || recoveryAuthorityChainDigest(parsed.value) !== digest
      ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
    } catch (error) {
      if (error instanceof AuthBridgeNotificationPreparedDeployEntrypointError) {
        throw error;
      }
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
    } finally { persisted?.fill?.(0); }
  };
  try {
    const names = privateState.list({
      root: 'runtime', relativeDirectory: 'bridge',
    });
    const expectedName = relativePath.slice('bridge/'.length);
    const eligibleNames = names.filter(name => RECOVERY_AUTHORITY_FILE.test(name));
    const oldName = `auth-bridge-import-authority-${recoveryAuthorityChainDigest(prior)}.jsonl`;
    if (
      !Array.isArray(names)
      || !names.includes(oldName)
      || eligibleNames.some(name => name !== oldName && name !== expectedName)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
    if (names.includes('locks')) {
      const locks = privateState.list({
        root: 'runtime', relativeDirectory: 'bridge/locks',
      });
      if (!Array.isArray(locks) || locks.length !== 0) {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_BUSY');
      }
    }
    if (names.includes(expectedName)) {
      readExact();
      return Object.freeze({ relativePath, chainDigest: digest, result: 'unchanged' });
    }
    try {
      privateState.write({ root: 'runtime', relativePath, bytes: body });
    } catch (error) {
      if (error?.code !== 'SEALED_REALMS_PRIVATE_STATE_FILE_EXISTS') throw error;
      readExact();
      return Object.freeze({ relativePath, chainDigest: digest, result: 'unchanged' });
    }
    readExact();
    const after = privateState.list({
      root: 'runtime', relativeDirectory: 'bridge',
    });
    const afterAuthorities = after.filter(name => RECOVERY_AUTHORITY_FILE.test(name));
    if (
      afterAuthorities.length !== 2
      || !afterAuthorities.includes(oldName)
      || !afterAuthorities.includes(expectedName)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CHAIN_CONFLICT');
    return Object.freeze({ relativePath, chainDigest: digest, result: 'installed' });
  } finally { body.fill(0); }
}

export const authBridgeNotificationPreparedDeployTestSeams = Object.freeze({
  createRecoveryAuthorityChain: input => {
    if (
      process.env.NODE_ENV !== 'test'
      || !isRecord(input)
      || !recoveryTestCapabilities.has(input.testOnlyCapability)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_TEST_ONLY_FORBIDDEN');
    const { testOnlyCapability: _testOnlyCapability, ...boundedInput } = input;
    return createRecoveryAuthorityChain(boundedInput);
  },
  withProductionRecoveryRuntime: async ({
    testOnlyCapability,
    runtime,
    operation,
  } = {}) => {
    const runtimeKeys = [
      'attestCheckout', 'copyEnvironment', 'clock', 'home',
      'createPrivateState', 'createGithubWritePermit',
      'resolveJournal', 'resolvePrior', 'inspect', 'resolveFreshReceipt',
      'verifyReceipt', 'resolveExpiredReceipt', 'resolvePendingReceipt',
      'writeReceipt', 'readReceipt', 'writeHead', 'createAuthorityChain',
    ];
    if (
      process.env.NODE_ENV !== 'test'
      || !recoveryTestCapabilities.has(testOnlyCapability)
      || !isRecord(runtime)
      || JSON.stringify(Object.keys(runtime)) !== JSON.stringify(runtimeKeys)
      || runtimeKeys.some(key => typeof runtime[key] !== 'function')
      || typeof operation !== 'function'
      || productionRecoveryTestRuntime !== null
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_TEST_ONLY_FORBIDDEN');
    productionRecoveryTestRuntime = Object.freeze({ ...runtime });
    try { return await operation(); }
    finally { productionRecoveryTestRuntime = null; }
  },
  copyAndScrubEnvironment,
  copyAndScrubRecoveryEnvironment,
  parseRecoveryAuthorityChain,
  resolveRecoveryPriorAuthority,
  settleGitInspections,
});

async function boundedExactGit(repositoryRoot, args, maximumOutputBytes) {
  let result;
  try {
    result = await execFileAsync('/usr/bin/git', [
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.untrackedCache=false',
      ...args,
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: Object.freeze({
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        HOME: '/dev/null',
        LANG: 'C',
        LC_ALL: 'C',
        PATH: '/usr/bin:/bin',
        TZ: 'UTC',
      }),
      maxBuffer: maximumOutputBytes,
      timeout: 5_000,
      windowsHide: true,
    });
  } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED');
  }
  if (
    result.stderr !== ''
    || Buffer.byteLength(result.stdout, 'utf8') > maximumOutputBytes
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED');
  return result.stdout.trim();
}

function exactGit(repositoryRoot, args) {
  return boundedExactGit(repositoryRoot, args, MAX_GIT_OUTPUT_BYTES);
}

function exactTrackedListing(repositoryRoot) {
  return boundedExactGit(
    repositoryRoot,
    ['ls-files', '-v'],
    MAX_TRACKED_LISTING_BYTES,
  );
}

async function settleGitInspections(inspections) {
  const results = await Promise.allSettled(inspections);
  if (results.some(result => result.status === 'rejected')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GIT_INSPECTION_FAILED');
  }
  return results.map(result => result.value);
}

export async function attestAuthBridgeNotificationPreparedDeployCheckout({
  repositoryRoot,
  sourceCommit,
} = {}) {
  const repository = canonicalDirectory(
    repositoryRoot,
    'AUTH_BRIDGE_PREPARED_DEPLOY_REPOSITORY_INVALID',
  );
  if (!SOURCE_COMMIT.test(sourceCommit ?? '')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_SOURCE_COMMIT_INVALID');
  }
  const [topLevel, head, status, origin, trackedEntries] = await settleGitInspections([
    exactGit(repository, ['rev-parse', '--show-toplevel']),
    exactGit(repository, ['rev-parse', 'HEAD']),
    exactGit(repository, ['status', '--porcelain=v1', '--untracked-files=all']),
    exactGit(repository, ['remote', 'get-url', 'origin']),
    exactTrackedListing(repository),
    exactGit(repository, ['diff-index', '--quiet', '--cached', 'HEAD', '--']),
    exactGit(repository, ['diff-files', '--quiet', '--']),
    exactGit(repository, [
      'diff',
      '--no-ext-diff',
      '--no-textconv',
      '--exit-code',
      'HEAD',
      '--',
    ]),
  ]);
  if (
    topLevel !== repository
    || head !== sourceCommit
    || status !== ''
    || trackedEntries.length < 1
    || trackedEntries.split('\n').some(entry => !entry.startsWith('H '))
    || ![
      `https://github.com/${REPOSITORY}`,
      `https://github.com/${REPOSITORY}.git`,
      `git@github.com:${REPOSITORY}.git`,
    ].includes(origin)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CHECKOUT_MISMATCH');
  return repository;
}

async function boundedGithubJson(response) {
  if (
    !(response instanceof Response)
    || response.redirected
    || response.status !== 200
    || new URL(response.url).origin !== GITHUB_ORIGIN
    || !/^application\/json(?:;\s*charset=utf-8)?$/iu.test(
      response.headers.get('content-type') ?? '',
    )
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  const length = response.headers.get('content-length');
  if (
    length !== null
    && (!/^[0-9]+$/u.test(length)
      || Number(length) > MAX_GITHUB_RESPONSE_BYTES)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_GITHUB_RESPONSE_BYTES) {
    body.fill(0);
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  }
  try { return JSON.parse(body.toString('utf8')); } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_GITHUB_RESPONSE_INVALID');
  } finally {
    body.fill(0);
  }
}

/** Fresh, read-only GitHub re-attestation before each protected durable write. */
export function createAuthBridgeNotificationPreparedGithubWritePermit({
  githubToken,
  sourceCommit,
  runId,
  runAttempt,
  repositoryRoot,
  fetchImpl = fetch,
  isInterrupted = () => false,
  attestCheckout = attestAuthBridgeNotificationPreparedDeployCheckout,
} = {}) {
  if (
    !SECRET.test(githubToken ?? '')
    || !SOURCE_COMMIT.test(sourceCommit ?? '')
    || !RUN_ID.test(runId ?? '')
    || !RUN_ID.test(String(runAttempt ?? ''))
    || typeof fetchImpl !== 'function'
    || typeof isInterrupted !== 'function'
    || typeof attestCheckout !== 'function'
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_INPUT_INVALID');
  const request = async path => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    let response;
    try {
      response = await fetchImpl(`${GITHUB_ORIGIN}${path}`, {
        method: 'GET',
        headers: {
          accept: 'application/vnd.github+json',
          authorization: `Bearer ${githubToken}`,
          'x-github-api-version': '2022-11-28',
        },
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal: controller.signal,
      });
    } catch {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_UNAVAILABLE');
    } finally {
      clearTimeout(timer);
    }
    return boundedGithubJson(response);
  };
  return async phase => {
    if (
      !['upload', 'release', 'recovery'].includes(phase)
      || isInterrupted()
    ) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
    }
    await attestCheckout({
      repositoryRoot,
      sourceCommit,
    });
    const [branch, run] = await Promise.all([
      request(`/repos/${REPOSITORY}/branches/main`),
      request(`/repos/${REPOSITORY}/actions/runs/${runId}`),
    ]);
    if (
      !isRecord(branch)
      || branch.name !== 'main'
      || branch.protected !== true
      || branch.commit?.sha !== sourceCommit
      || !isRecord(run)
      || String(run.id) !== runId
      || run.run_attempt !== Number(runAttempt)
      || run.event !== 'workflow_dispatch'
      || run.status !== 'in_progress'
      || run.conclusion !== null
      || run.head_branch !== 'main'
      || run.head_sha !== sourceCommit
      || run.path !== WORKFLOW_PATH
      || run.repository?.full_name !== REPOSITORY
      || isInterrupted()
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
    return true;
  };
}

/**
 * Separate no-deploy composition boundary. Production resolves
 * `priorAuthority` internally before invoking this function; the explicit
 * values are accepted only by the test process so mutation-free sequencing is
 * directly executable without protected state or network access.
 */
async function runProductionAuthBridgeNotificationPreparedReadOnlyRecovery({
  environment,
  fetchImpl,
  repositoryRoot,
  clock,
}) {
  if (
    !isRecord(environment)
    || typeof fetchImpl !== 'function'
    || typeof clock !== 'function'
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID');
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const inferredRepository = resolve(scriptDirectory, '..');
  const runtime = productionRecoveryTestRuntime ?? Object.freeze({
    attestCheckout: attestAuthBridgeNotificationPreparedDeployCheckout,
    copyEnvironment: copyAndScrubRecoveryEnvironment,
    clock: currentClock => currentClock(),
    home: () => userInfo().homedir,
    createPrivateState: createSealedRealmsProductionPrivateState,
    createGithubWritePermit:
      createAuthBridgeNotificationPreparedGithubWritePermit,
    resolveJournal:
      resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority,
    resolvePrior: resolveRecoveryPriorAuthority,
    inspect: inspectAuthBridgeNotificationPreparedRecoveryAuthority,
    resolveFreshReceipt:
      resolveFreshAuthBridgeNotificationPreparedReceiptByDigest,
    verifyReceipt: verifyAuthBridgeNotificationPreparedReceipt,
    resolveExpiredReceipt:
      resolveExpiredAuthBridgeNotificationPreparedReceiptByDigest,
    resolvePendingReceipt:
      resolvePendingAuthBridgeNotificationPreparedRecoveryReceipt,
    writeReceipt: writePrivateAuthBridgeNotificationPreparedReceipt,
    readReceipt: readPrivateAuthBridgeNotificationPreparedReceipt,
    writeHead: writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead,
    createAuthorityChain: createRecoveryAuthorityChain,
  });
  const sourceCommit = environment.GITHUB_SHA;
  if (!SOURCE_COMMIT.test(sourceCommit ?? '')) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_SOURCE_COMMIT_INVALID');
  }
  const repository = await runtime.attestCheckout({
    repositoryRoot: repositoryRoot ?? inferredRepository,
    sourceCommit,
  });
  if (repository !== inferredRepository) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_REPOSITORY_INVALID');
  }
  const values = runtime.copyEnvironment(environment);
  if (values.GITHUB_SHA !== sourceCommit) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_SOURCE_COMMIT_INVALID');
  }
  let recoveryWritePermit;
  const assertCanStartRecoveryWrite = async boundary => {
    if (!['receipt', 'head', 'authority'].includes(boundary)) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_WRITE_PERMIT_INVALID');
    }
    if (recoveryWritePermit === undefined) {
      recoveryWritePermit = runtime.createGithubWritePermit({
        githubToken: values.GITHUB_TOKEN,
        sourceCommit: values.GITHUB_SHA,
        runId: values.GITHUB_RUN_ID,
        runAttempt: values.GITHUB_RUN_ATTEMPT,
        repositoryRoot: repository,
        fetchImpl,
        attestCheckout: runtime.attestCheckout,
      });
    }
    if (typeof recoveryWritePermit !== 'function') {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_WRITE_PERMIT_INVALID');
    }
    if (await recoveryWritePermit('recovery') !== true) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_WRITE_PERMIT_REJECTED');
    }
  };
  let reportedHome;
  try { reportedHome = runtime.home(); } catch {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_PRIVATE_STATE_INVALID');
  }
  const privateState = runtime.createPrivateState({ reportedHome });
  const sampleClock = () => {
    const value = runtime.clock(clock);
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_INVALID');
    }
    return value;
  };
  const initialNow = sampleClock();
  const priorJournal = runtime.resolveJournal({
      repositoryRoot: repository,
    });
  const resolvePinnedPriorAuthority = (journal = priorJournal) => runtime.resolvePrior({
    privateState,
    sourceCommit: values.GITHUB_SHA,
    journal,
    now: sampleClock(),
  });
  const firstPrior = resolvePinnedPriorAuthority();
  const inspect = ({ expected, now }) =>
    runtime.inspect({
      expected,
      now,
      accountId: values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
      zoneId: values.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
      apiToken: values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN,
      adminToken: values.WARPKEEP_PRODUCTION_ADMIN_TOKEN,
      fetchImpl,
    });
  if (firstPrior.pendingRecoveryHead !== undefined) {
    const pendingHead = firstPrior.pendingRecoveryHead;
    const persisted = runtime.resolveFreshReceipt({
      repositoryRoot: repository,
      receiptDigest: pendingHead.preparedReceiptDigest,
      expectedSourceCommit: values.GITHUB_SHA,
      now: initialNow,
    });
    const persistedLive = await runtime.verifyReceipt({
      receipt: persisted.receipt,
      fetchImpl,
      now: initialNow,
    });
    const expected = Object.freeze({
      workerVersionId: firstPrior.value.workerVersionId,
      bridgeSourceCommit: values.GITHUB_SHA,
    });
    const firstInspection = await inspect({ expected, now: initialNow });
    assertRecoveryInspectionRound(firstInspection);
    assertRecoveryInspectionBoundToPrior(
      firstInspection,
      firstPrior.value,
      persistedLive,
    );
    const inspectedAt = sampleClock();
    if (
      inspectedAt.getTime() < initialNow.getTime()
      || inspectedAt.getTime() - initialNow.getTime() >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(firstInspection, inspectedAt);
    await assertCanStartRecoveryWrite('authority');
    const finalInspectionAt = sampleClock();
    if (
      finalInspectionAt.getTime() < inspectedAt.getTime()
      || finalInspectionAt.getTime() - initialNow.getTime() >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(firstInspection, finalInspectionAt);
    const finalInspection = await inspect({
      expected,
      now: finalInspectionAt,
    });
    assertRecoveryInspectionRound(finalInspection);
    assertRecoveryInspectionBoundToPrior(
      finalInspection,
      firstPrior.value,
      persistedLive,
    );
    const finishedAt = sampleClock();
    if (
      finishedAt.getTime() < finalInspectionAt.getTime()
      || finishedAt.getTime() - initialNow.getTime() >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(finalInspection, finishedAt);
    assertRecoveryInspectionStable(finalInspection, firstInspection);
    await assertCanStartRecoveryWrite('authority');
    const finalJournal = runtime.resolveJournal({ repositoryRoot: repository });
    const finalPrior = resolvePinnedPriorAuthority(finalJournal);
    const finalReceipt = runtime.resolveFreshReceipt({
      repositoryRoot: repository,
      receiptDigest: pendingHead.preparedReceiptDigest,
      expectedSourceCommit: values.GITHUB_SHA,
      now: finishedAt,
    });
    if (
      JSON.stringify(finalJournal) !== JSON.stringify(pendingHead)
      || finalPrior.pendingRecoveryHead?.journalHeadDigest
        !== pendingHead.journalHeadDigest
      || JSON.stringify(finalPrior.value) !== JSON.stringify(firstPrior.value)
      || finalReceipt.receiptDigest !== persisted.receiptDigest
      || JSON.stringify(finalReceipt.receipt) !== JSON.stringify(persisted.receipt)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
    const boundaryAt = sampleClock();
    if (
      boundaryAt.getTime() < finishedAt.getTime()
      || boundaryAt.getTime() - initialNow.getTime() >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(finalInspection, boundaryAt);
    const authorityInput = {
      privateState,
      sourceCommit: values.GITHUB_SHA,
      priorAuthority: finalPrior,
      receiptPublication: Object.freeze({
        receipt: finalReceipt.receipt,
        ...canonicalAuthBridgeNotificationPreparedReceiptPublication(
          finalReceipt.receipt,
        ),
      }),
      journal: Object.freeze({
        ...pendingHead,
        priorCompletedJournalHeadDigest: pendingHead.predecessorDigest,
      }),
      inspection: Object.freeze({
        ...finalInspection,
        controlPlaneAttestationDigest:
          pendingHead.controlPlaneAttestationDigest,
        publicAttestationDigest: pendingHead.publicAttestationDigest,
        privateAttestationDigest: pendingHead.privateAttestationDigest,
        ptrBindingAttestationDigest:
          pendingHead.ptrBindingAttestationDigest,
      }),
      recordedAt: boundaryAt,
    };
    runtime.createAuthorityChain(authorityInput);
    return Object.freeze({ outcome: 'verified-read-only-recovery' });
  }
  if (
    priorJournal.profile
      === 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1'
    && Date.parse(firstPrior.receipt.expiresAt) > initialNow.getTime()
  ) {
    const persisted =
      runtime.resolveFreshReceipt({
      repositoryRoot: repository,
      receiptDigest: firstPrior.value.preparedReceiptDigest,
      expectedSourceCommit: values.GITHUB_SHA,
      now: initialNow,
    });
    const persistedLive = await runtime.verifyReceipt({
      receipt: persisted.receipt,
      fetchImpl,
      now: initialNow,
    });
    if (
      persisted.receiptDigest !== firstPrior.value.preparedReceiptDigest
      || JSON.stringify(persisted.receipt) !== JSON.stringify(firstPrior.receipt)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_PRIOR_AUTHORITY_INVALID');
    const expected = Object.freeze({
      workerVersionId: firstPrior.value.workerVersionId,
      bridgeSourceCommit: values.GITHUB_SHA,
    });
    const firstInspection = await inspect({ expected, now: initialNow });
    assertRecoveryInspectionRound(firstInspection);
    assertRecoveryInspectionBoundToPrior(
      firstInspection,
      firstPrior.value,
      persistedLive,
    );
    const completed = sampleClock();
    if (
      completed.getTime() < initialNow.getTime()
      || completed.getTime() - initialNow.getTime() >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(firstInspection, completed);
    const finalInspection = await inspect({ expected, now: completed });
    assertRecoveryInspectionRound(finalInspection);
    assertRecoveryInspectionBoundToPrior(
      finalInspection,
      firstPrior.value,
      persistedLive,
    );
    const finalInspectionCompletedAt = sampleClock();
    if (
      finalInspectionCompletedAt.getTime() < completed.getTime()
      || finalInspectionCompletedAt.getTime() - initialNow.getTime()
        >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(
      finalInspection,
      finalInspectionCompletedAt,
    );
    assertRecoveryInspectionStable(finalInspection, firstInspection);
    const finalJournal = runtime.resolveJournal({ repositoryRoot: repository });
    const finalPrior = resolvePinnedPriorAuthority(finalJournal);
    const finalReceipt = runtime.resolveFreshReceipt({
      repositoryRoot: repository,
      receiptDigest: firstPrior.value.preparedReceiptDigest,
      expectedSourceCommit: values.GITHUB_SHA,
      now: finalInspectionCompletedAt,
    });
    if (
      JSON.stringify(finalJournal) !== JSON.stringify(priorJournal)
      || JSON.stringify(finalPrior.value) !== JSON.stringify(firstPrior.value)
      || finalReceipt.receiptDigest !== persisted.receiptDigest
      || JSON.stringify(finalReceipt.receipt) !== JSON.stringify(persistedLive.receipt)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
    const adoptionCompletedAt = sampleClock();
    if (
      adoptionCompletedAt.getTime() < finalInspectionCompletedAt.getTime()
      || adoptionCompletedAt.getTime() - initialNow.getTime()
        >= 5 * 60 * 1_000
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
    assertRecoveryInspectionFreshAt(finalInspection, adoptionCompletedAt);
    return Object.freeze({ outcome: 'verified-read-only-recovery' });
  }
  return runAuthBridgeNotificationPreparedReadOnlyRecovery({
    testOnlyCapability: productionRecoveryCapability,
    sourceCommit: values.GITHUB_SHA,
    runId: values.GITHUB_RUN_ID,
    runAttempt: Number(values.GITHUB_RUN_ATTEMPT),
    clock: sampleClock,
    resolvePriorAuthority: resolvePinnedPriorAuthority,
    resolvePriorReceipt: ({ receiptDigest, expectedSourceCommit }) =>
      runtime.resolveExpiredReceipt({
        repositoryRoot: repository,
        receiptDigest,
        expectedSourceCommit,
        now: sampleClock(),
      }),
    resolvePendingReceipt: ({ priorPreparedReceiptDigest, now }) =>
      runtime.resolvePendingReceipt({
        repositoryRoot: repository,
        expectedSourceCommit: values.GITHUB_SHA,
        excludedReceiptDigest: priorPreparedReceiptDigest,
        now,
      }),
    inspectRecoveryAuthority: inspect,
    assertCanStartWrite: assertCanStartRecoveryWrite,
    writeReceipt: ({ receipt, now }) =>
      runtime.writeReceipt({
        receipt, repositoryRoot: repository, now,
      }),
    readWrittenReceipt: written =>
      runtime.readReceipt({
        receiptPath: written.path,
        repositoryRoot: repository,
      }),
    writeHead: ({ head }) =>
      runtime.writeHead({
        head, repositoryRoot: repository,
      }),
    resolveWrittenHead: () =>
      runtime.resolveJournal({
        repositoryRoot: repository,
      }),
    createRecoveryAuthorityChain: input => {
      const reopened =
        runtime.resolveJournal({
          repositoryRoot: repository,
        });
      if (reopened.journalHeadDigest !== input.journal.journalHeadDigest) {
        fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
      }
      return runtime.createAuthorityChain({
        ...input,
        privateState,
        sourceCommit: values.GITHUB_SHA,
      });
    },
  });
}

export async function runAuthBridgeNotificationPreparedReadOnlyRecovery(
  options = {},
) {
  if (!recoveryTestCapabilities.has(options?.testOnlyCapability)) {
    if (
      !isRecord(options)
      || Object.keys(options).length !== 0
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID');
    return runProductionAuthBridgeNotificationPreparedReadOnlyRecovery({
      environment: process.env,
      fetchImpl: fetch,
      repositoryRoot: undefined,
      clock: () => new Date(),
    });
  }
  if (
    (options.testOnlyCapability !== productionRecoveryCapability
      && process.env.NODE_ENV !== 'test')
    || !isRecord(options)
    || !recoveryTestCapabilities.has(options.testOnlyCapability)
    || Object.keys(options).some(key => ![
      'testOnlyCapability', 'sourceCommit', 'runId', 'runAttempt', 'clock',
      'resolvePriorAuthority', 'resolvePriorReceipt',
      'resolvePendingReceipt',
      'inspectRecoveryAuthority', 'assertCanStartWrite',
      'writeReceipt', 'readWrittenReceipt',
      'writeHead', 'resolveWrittenHead', 'createRecoveryAuthorityChain',
    ].includes(key))
    || !SOURCE_COMMIT.test(options.sourceCommit ?? '')
    || !RUN_ID.test(options.runId ?? '')
    || !Number.isSafeInteger(options.runAttempt)
    || options.runAttempt < 1 || options.runAttempt > 1_000
    || typeof options.clock !== 'function'
    || typeof options.resolvePriorAuthority !== 'function'
    || typeof options.resolvePriorReceipt !== 'function'
    || typeof options.resolvePendingReceipt !== 'function'
    || typeof options.inspectRecoveryAuthority !== 'function'
    || typeof options.assertCanStartWrite !== 'function'
    || typeof options.writeReceipt !== 'function'
    || typeof options.readWrittenReceipt !== 'function'
    || typeof options.writeHead !== 'function'
    || typeof options.resolveWrittenHead !== 'function'
    || typeof options.createRecoveryAuthorityChain !== 'function'
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID');
  const sampleClock = () => {
    const value = options.clock();
    if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_INVALID');
    }
    return value;
  };
  const startedAt = sampleClock();
  const resolveBoundPrior = async () => {
    const authority = await options.resolvePriorAuthority();
    const value = isRecord(authority?.value) ? authority.value : authority;
    const receiptResolution = await options.resolvePriorReceipt({
      receiptDigest: value?.preparedReceiptDigest,
      expectedSourceCommit: options.sourceCommit,
    });
    const parsed = parseAuthBridgeNotificationPreparedReceipt(
      receiptResolution?.receipt,
    );
    const publication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(parsed);
    if (
      !isRecord(authority)
      || !isRecord(value)
      || !isRecord(receiptResolution)
      || receiptResolution.receiptDigest !== value.preparedReceiptDigest
      || publication.receiptDigest !== receiptResolution.receiptDigest
      || (authority.receipt !== undefined
        && JSON.stringify(authority.receipt) !== JSON.stringify(parsed))
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_PRIOR_AUTHORITY_INVALID');
    return Object.freeze({ authority, value, receipt: parsed, publication });
  };
  const resolvedPrior = await resolveBoundPrior();
  const prior = resolvedPrior.value;
  const parsedPrior = resolvedPrior.receipt;
  const priorPublication =
    canonicalAuthBridgeNotificationPreparedReceiptPublication(parsedPrior);
  const assertPriorAuthorityStable = async () => {
    const authority = await options.resolvePriorAuthority();
    const value = isRecord(authority?.value) ? authority.value : authority;
    if (!isRecord(value) || JSON.stringify(value) !== JSON.stringify(prior)) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
    }
    return authority;
  };
  if (
    priorPublication.receiptDigest !== prior.preparedReceiptDigest
    || parsedPrior.bridgeSourceCommit !== options.sourceCommit
    || Date.parse(parsedPrior.expiresAt) > startedAt.getTime()
    || !SHA256.test(prior.completedJournalHeadDigest ?? '')
    || !UUID.test(prior.deploymentId ?? '')
    || !UUID.test(prior.workerVersionId ?? '')
    || !SHA256.test(prior.ptrDatabaseIdentity ?? '')
    || !SHA256.test(prior.ptrBindingDigest ?? '')
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_PRIOR_AUTHORITY_INVALID');
  let inspection = await options.inspectRecoveryAuthority(Object.freeze({
    expected: Object.freeze({
      workerVersionId: prior.workerVersionId,
      bridgeSourceCommit: options.sourceCommit,
    }),
    now: startedAt,
  }));
  if (
    !isRecord(inspection)
    || inspection.deploymentId !== prior.deploymentId
    || inspection.workerVersionId !== prior.workerVersionId
    || inspection.bridgeSourceCommit !== options.sourceCommit
    || inspection.ptrDatabaseIdentity !== prior.ptrDatabaseIdentity
    || inspection.ptrBindingDigest !== prior.ptrBindingDigest
    || !isRecord(inspection.liveAttestation)
    || [
      'controlPlaneAttestationDigest', 'publicAttestationDigest',
      'privateAttestationDigest', 'ptrBindingAttestationDigest',
    ].some(key => !SHA256.test(inspection[key] ?? ''))
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
  assertRecoveryInspectionRound(inspection);
  const receiptCandidateAt = sampleClock();
  if (
    receiptCandidateAt.getTime() < startedAt.getTime()
    || receiptCandidateAt.getTime() - startedAt.getTime() >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(inspection, receiptCandidateAt);
  const pendingReceipt = await options.resolvePendingReceipt({
    priorPreparedReceiptDigest: prior.preparedReceiptDigest,
    now: receiptCandidateAt,
  });
  if (pendingReceipt === null) {
    await options.assertCanStartWrite('receipt');
  }
  const finalInspectionStartedAt = sampleClock();
  if (
    finalInspectionStartedAt.getTime() < receiptCandidateAt.getTime()
    || finalInspectionStartedAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(inspection, finalInspectionStartedAt);
  const finalInspection = await options.inspectRecoveryAuthority(Object.freeze({
    expected: Object.freeze({
      workerVersionId: prior.workerVersionId,
      bridgeSourceCommit: options.sourceCommit,
    }),
    now: finalInspectionStartedAt,
  }));
  assertRecoveryInspectionRound(finalInspection);
  assertRecoveryInspectionStable(finalInspection, inspection);
  inspection = finalInspection;
  const inspectionFinishedAt = sampleClock();
  if (
    inspectionFinishedAt.getTime() < finalInspectionStartedAt.getTime()
    || inspectionFinishedAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(finalInspection, inspectionFinishedAt);
  if (pendingReceipt === null) {
    await options.assertCanStartWrite('receipt');
  }
  const immediatelyBeforeReceipt = await resolveBoundPrior();
  if (
    JSON.stringify(immediatelyBeforeReceipt.value) !== JSON.stringify(prior)
    || immediatelyBeforeReceipt.publication.receiptDigest
      !== priorPublication.receiptDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
  const receiptBoundaryAt = sampleClock();
  if (
    receiptBoundaryAt.getTime() < inspectionFinishedAt.getTime()
    || receiptBoundaryAt.getTime() - startedAt.getTime() >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(inspection, receiptBoundaryAt);
  let receipt;
  let generatedPublication;
  let writtenReceipt;
  let reopenedReceipt;
  let reopenedPublication;
  if (pendingReceipt !== null) {
    receipt = parseAuthBridgeNotificationPreparedReceipt(pendingReceipt?.receipt);
    generatedPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    const priorComparable = { ...parsedPrior };
    const recoveredComparable = { ...receipt };
    for (const key of [
      'liveAttestationDigest', 'preparedAt', 'expiresAt',
    ]) {
      delete priorComparable[key];
      delete recoveredComparable[key];
    }
    if (pendingReceipt.receiptDigest !== generatedPublication.receiptDigest) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_RECEIPT_WRITE_INVALID');
    }
    if (JSON.stringify(recoveredComparable) !== JSON.stringify(priorComparable)) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_MISMATCH');
    }
    if (
      Date.parse(receipt.preparedAt) < Date.parse(parsedPrior.expiresAt)
      || Date.parse(receipt.preparedAt) > receiptBoundaryAt.getTime()
      || Date.parse(receipt.expiresAt) <= receiptBoundaryAt.getTime()
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_TIME_INVALID');
    if (
      receipt.liveAttestationDigest
        !== canonicalAuthBridgeReleaseAttestationDigest(
          inspection.liveAttestation,
        )
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_MISMATCH');
    writtenReceipt = Object.freeze({
      receiptDigest: generatedPublication.receiptDigest,
      result: 'unchanged',
    });
    reopenedReceipt = receipt;
    reopenedPublication = generatedPublication;
  } else {
    receipt = createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt({
      priorReceipt: parsedPrior,
      liveAttestation: inspection.liveAttestation,
      preparedAt: receiptBoundaryAt,
      now: receiptBoundaryAt,
    });
    generatedPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    writtenReceipt = await options.writeReceipt({
      receipt, now: receiptBoundaryAt,
    });
    if (
      !isRecord(writtenReceipt)
      || writtenReceipt.receiptDigest !== generatedPublication.receiptDigest
    ) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_RECEIPT_WRITE_INVALID');
    }
    reopenedReceipt = parseAuthBridgeNotificationPreparedReceipt(
      await options.readWrittenReceipt(writtenReceipt),
    );
    reopenedPublication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(reopenedReceipt);
    if (
      reopenedPublication.receiptDigest !== generatedPublication.receiptDigest
      || JSON.stringify(reopenedReceipt) !== JSON.stringify(receipt)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_RECEIPT_WRITE_INVALID');
  }
  const reopenRecoveredReceipt = async now => {
    const candidate = pendingReceipt === null
      ? await options.readWrittenReceipt(writtenReceipt)
      : (await options.resolvePendingReceipt({
        priorPreparedReceiptDigest: prior.preparedReceiptDigest,
        now,
      }))?.receipt;
    const parsed = parseAuthBridgeNotificationPreparedReceipt(candidate);
    const publication =
      canonicalAuthBridgeNotificationPreparedReceiptPublication(parsed);
    if (
      publication.receiptDigest !== generatedPublication.receiptDigest
      || JSON.stringify(parsed) !== JSON.stringify(reopenedReceipt)
    ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_RECEIPT_WRITE_INVALID');
    return Object.freeze({ receipt: parsed, publication });
  };
  const beforeHeadPermitAt = sampleClock();
  if (
    beforeHeadPermitAt.getTime() < receiptBoundaryAt.getTime()
    || beforeHeadPermitAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(inspection, beforeHeadPermitAt);
  await options.assertCanStartWrite('head');
  const beforeHeadInspectionAt = sampleClock();
  if (
    beforeHeadInspectionAt.getTime() < beforeHeadPermitAt.getTime()
    || beforeHeadInspectionAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(inspection, beforeHeadInspectionAt);
  const headInspection = await options.inspectRecoveryAuthority(Object.freeze({
    expected: Object.freeze({
      workerVersionId: prior.workerVersionId,
      bridgeSourceCommit: options.sourceCommit,
    }),
    now: beforeHeadInspectionAt,
  }));
  assertRecoveryInspectionRound(headInspection);
  assertRecoveryInspectionStable(headInspection, inspection);
  const headInspectionFinishedAt = sampleClock();
  if (
    headInspectionFinishedAt.getTime() < beforeHeadInspectionAt.getTime()
    || headInspectionFinishedAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(headInspection, headInspectionFinishedAt);
  await options.assertCanStartWrite('head');
  const headBoundaryPrior = await resolveBoundPrior();
  if (
    JSON.stringify(headBoundaryPrior.value) !== JSON.stringify(prior)
    || headBoundaryPrior.publication.receiptDigest
      !== priorPublication.receiptDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
  const headBoundaryReceipt = await reopenRecoveredReceipt(
    headInspectionFinishedAt,
  );
  const beforeHeadAt = sampleClock();
  if (
    beforeHeadAt.getTime() < headInspectionFinishedAt.getTime()
    || beforeHeadAt.getTime() - startedAt.getTime() >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(headInspection, beforeHeadAt);
  const head = Object.freeze({
    schemaVersion: 1,
    profile: 'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1',
    sourceCommit: options.sourceCommit,
    runId: options.runId,
    runAttempt: options.runAttempt,
    priorPreparedReceiptDigest: prior.preparedReceiptDigest,
    priorCompletedJournalHeadDigest: prior.completedJournalHeadDigest,
    preparedReceiptDigest: headBoundaryReceipt.publication.receiptDigest,
    deploymentId: prior.deploymentId,
    workerVersionId: prior.workerVersionId,
    bridgeSourceCommit: options.sourceCommit,
    ptrDatabaseIdentity: prior.ptrDatabaseIdentity,
    ptrBindingDigest: prior.ptrBindingDigest,
    controlPlaneAttestationDigest: headInspection.controlPlaneAttestationDigest,
    publicAttestationDigest: headInspection.publicAttestationDigest,
    privateAttestationDigest: headInspection.privateAttestationDigest,
    ptrBindingAttestationDigest: headInspection.ptrBindingAttestationDigest,
    completedAt: beforeHeadAt.toISOString(),
    noDeploy: true,
    outcome: 'verified-read-only-recovery',
  });
  const writtenHead = await options.writeHead({ head });
  const generatedHeadDigest = createHash('sha256')
    .update(`${JSON.stringify(head)}\n`, 'utf8')
    .digest('hex');
  if (
    !isRecord(writtenHead)
    || writtenHead.journalHeadDigest !== generatedHeadDigest
  ) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
  }
  const reopenedHead = await options.resolveWrittenHead(writtenHead);
  for (const [key, value] of Object.entries(head)) {
    if (reopenedHead?.[key] !== value) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
    }
  }
  if (
    reopenedHead?.journalHeadDigest !== generatedHeadDigest
    || reopenedHead?.predecessorDigest !== head.priorCompletedJournalHeadDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
  const beforeAuthorityPermitAt = sampleClock();
  if (
    beforeAuthorityPermitAt.getTime() < beforeHeadAt.getTime()
    || beforeAuthorityPermitAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(headInspection, beforeAuthorityPermitAt);
  await options.assertCanStartWrite('authority');
  const beforeAuthorityInspectionAt = sampleClock();
  if (
    beforeAuthorityInspectionAt.getTime() < beforeAuthorityPermitAt.getTime()
    || beforeAuthorityInspectionAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(headInspection, beforeAuthorityInspectionAt);
  const authorityInspection = await options.inspectRecoveryAuthority(
    Object.freeze({
      expected: Object.freeze({
        workerVersionId: prior.workerVersionId,
        bridgeSourceCommit: options.sourceCommit,
      }),
      now: beforeAuthorityInspectionAt,
    }),
  );
  assertRecoveryInspectionRound(authorityInspection);
  assertRecoveryInspectionStable(authorityInspection, headInspection);
  const authorityInspectionFinishedAt = sampleClock();
  if (
    authorityInspectionFinishedAt.getTime()
      < beforeAuthorityInspectionAt.getTime()
    || authorityInspectionFinishedAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(
    authorityInspection,
    authorityInspectionFinishedAt,
  );
  await options.assertCanStartWrite('authority');
  const authorityBoundaryPrior = await resolveBoundPrior();
  if (
    JSON.stringify(authorityBoundaryPrior.value) !== JSON.stringify(prior)
    || authorityBoundaryPrior.publication.receiptDigest
      !== priorPublication.receiptDigest
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_AUTHORITY_DRIFT');
  const authorityBoundaryReceipt = await reopenRecoveredReceipt(
    authorityInspectionFinishedAt,
  );
  const authorityBoundaryHead = await options.resolveWrittenHead(writtenHead);
  for (const [key, value] of Object.entries(head)) {
    if (authorityBoundaryHead?.[key] !== value) {
      fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
    }
  }
  if (authorityBoundaryHead?.journalHeadDigest !== generatedHeadDigest) {
    fail('AUTH_BRIDGE_PREPARED_RECOVERY_HEAD_WRITE_INVALID');
  }
  const beforeAuthorityAt = sampleClock();
  if (
    beforeAuthorityAt.getTime() < authorityInspectionFinishedAt.getTime()
    || beforeAuthorityAt.getTime() - startedAt.getTime()
      >= 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_RECOVERY_CLOCK_STALE');
  assertRecoveryInspectionFreshAt(authorityInspection, beforeAuthorityAt);
  await options.createRecoveryAuthorityChain({
    priorAuthority: authorityBoundaryPrior.authority,
    receiptPublication: Object.freeze({
      receipt: authorityBoundaryReceipt.receipt,
      ...authorityBoundaryReceipt.publication,
    }),
    journal: Object.freeze({ ...head, ...authorityBoundaryHead }),
    inspection: headInspection,
    recordedAt: beforeAuthorityAt,
  });
  return Object.freeze({ outcome: 'verified-read-only-recovery' });
}

export async function runAuthBridgeNotificationPreparedDeploy({
  environment = process.env,
  fetchImpl = fetch,
  repositoryRoot,
  nodeExecutable = process.execPath,
  wranglerEntrypoint,
  clock = () => new Date(),
} = {}) {
  const scriptDirectory = dirname(fileURLToPath(import.meta.url));
  const inferredRepository = resolve(scriptDirectory, '..');
  const sourceCommit = environment.GITHUB_SHA;
  if (!SOURCE_COMMIT.test(sourceCommit ?? '')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_SOURCE_COMMIT_INVALID');
  }
  const repository = await attestAuthBridgeNotificationPreparedDeployCheckout({
    repositoryRoot: repositoryRoot ?? inferredRepository,
    sourceCommit,
  });
  if (repository !== inferredRepository) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_REPOSITORY_INVALID');
  }
  const serviceRoot = join(repository, 'services', 'auth-bridge');
  const exactWranglerEntrypoint = wranglerEntrypoint
    ?? join(serviceRoot, 'node_modules', 'wrangler', 'bin', 'wrangler.js');
  const sourceClosure = verifyAuthBridgeNotificationPreparedDeployClosure({
    repositoryRoot: repository,
  });
  const toolchain = verifyAuthBridgeNotificationPreparedInstalledToolchain({
    repositoryRoot: repository,
    nodeExecutable,
    wranglerEntrypoint: exactWranglerEntrypoint,
  });
  if (toolchain.wranglerEntrypoint !== realpathSync(exactWranglerEntrypoint)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_TOOLCHAIN_INVALID');
  }
  const sourceClosureAfterToolchain =
    verifyAuthBridgeNotificationPreparedDeployClosure({
    repositoryRoot: repository,
  });
  if (
    sourceClosureAfterToolchain.manifestSha256 !== sourceClosure.manifestSha256
    || toolchain.sourceClosureManifestSha256 !== sourceClosure.manifestSha256
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_SOURCE_CLOSURE_INVALID');
  // No credential is read or copied until the fixed installed-tree authority
  // and complete source closure have both been re-attested in this process.
  const values = copyAndScrubEnvironment(environment);
  if (values.GITHUB_SHA !== sourceCommit) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_SOURCE_COMMIT_INVALID');
  }
  const [adapter, cloudflareRuntime, deployJournal] =
    await importAuthBridgeNotificationPreparedAttestedModules({
      authority: sourceClosureAfterToolchain,
      repositoryRoot: repository,
      memberPaths: [
        'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
        'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
        'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
      ],
    });
  const {
    authBridgeNotificationPreparedVersionContract,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
    executeAuthBridgeNotificationPreparedDeployAdapter,
    prepareAndWriteAuthBridgeNotificationPreparedReceipt,
  } = adapter;
  const {
    buildAuthBridgeNotificationPreparedWranglerMultipart,
    createAuthBridgeNotificationPreparedCloudflareRuntime,
  } = cloudflareRuntime;
  const { withAuthBridgeNotificationPreparedDeployJournal } = deployJournal;
  let interrupted = false;
  const interrupt = () => { interrupted = true; };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    const permit = createAuthBridgeNotificationPreparedGithubWritePermit({
      githubToken: values.GITHUB_TOKEN,
      sourceCommit: values.GITHUB_SHA,
      runId: values.GITHUB_RUN_ID,
      runAttempt: values.GITHUB_RUN_ATTEMPT,
      repositoryRoot: repository,
      fetchImpl,
      isInterrupted: () => interrupted,
    });
    return await prepareAndWriteAuthBridgeNotificationPreparedReceipt({
      adminToken: values.WARPKEEP_PRODUCTION_ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase:
        values.WARPKEEP_PTR_SPACETIMEDB_DATABASE,
      expectedBridgeSourceCommit: values.GITHUB_SHA,
      expectedPredecessorBridgeSourceCommit:
        AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      fetchImpl,
      clock,
      repositoryRoot: repository,
      deploy: async beforeModes => {
        if (interrupted) fail('AUTH_BRIDGE_PREPARED_DEPLOY_INTERRUPTED');
        const buildToolchain =
          verifyAuthBridgeNotificationPreparedInstalledToolchain({
            repositoryRoot: repository,
            nodeExecutable,
            wranglerEntrypoint: exactWranglerEntrypoint,
          });
        if (
          buildToolchain.treeSha256 !== toolchain.treeSha256
          || buildToolchain.runnerIdentityDigest
            !== toolchain.runnerIdentityDigest
          || buildToolchain.wranglerEntrypoint !== toolchain.wranglerEntrypoint
        ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_TOOLCHAIN_INVALID');
        const placeholder = authBridgeNotificationPreparedVersionContract({
          accountId: values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
          zoneId: values.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
          sourceCommit: values.GITHUB_SHA,
          sourceDigest: '0'.repeat(64),
          beforeModes,
        });
        const bundle = await buildAuthBridgeNotificationPreparedWranglerMultipart({
          contract: placeholder,
          repositoryRoot: repository,
          serviceRoot,
          nodeExecutable,
          wranglerEntrypoint: exactWranglerEntrypoint,
        });
        const contract = authBridgeNotificationPreparedVersionContract({
          accountId: values.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
          zoneId: values.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
          sourceCommit: values.GITHUB_SHA,
          sourceDigest: bundle.sourceDigest,
          beforeModes,
        });
        try {
          await withAuthBridgeNotificationPreparedDeployJournal({
            contract,
            repositoryRoot: repository,
            runId: values.GITHUB_RUN_ID,
            runAttempt: Number(values.GITHUB_RUN_ATTEMPT),
            clock,
            operation: async journal => {
              const runtime = createAuthBridgeNotificationPreparedCloudflareRuntime({
                contract,
                apiToken: values.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN,
                playerCanaryOwnerFid:
                  values.WARPKEEP_PLAYER_CANARY_OWNER_FID,
                ptrSpacetimeDbDatabase:
                  values.WARPKEEP_PTR_SPACETIMEDB_DATABASE,
                repositoryRoot: repository,
                serviceRoot,
                nodeExecutable,
                wranglerEntrypoint: exactWranglerEntrypoint,
                multipartBody: bundle.body,
                multipartContentType: bundle.contentType,
                fetchImpl,
                clock,
                journal,
              });
              try {
                await executeAuthBridgeNotificationPreparedDeployAdapter({
                  contract,
                  ...runtime,
                  journal,
                  assertCanStartWrite: permit,
                  clock,
                });
              } finally {
                runtime.dispose();
              }
            },
          });
        } finally {
          bundle.body.fill(0);
        }
      },
    });
  } finally {
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

const invokedPath = process.argv[1] === undefined
  ? undefined
  : pathToFileURL(resolve(process.argv[1])).href;
if (invokedPath === import.meta.url) {
  runAuthBridgeNotificationPreparedDeploy().then(
    result => {
      process.stdout.write(`AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETE ${result.receiptDigest}\n`);
    },
    error => {
      const code = typeof error?.code === 'string'
        && /^[A-Z0-9_]{8,128}$/u.test(error.code)
        ? error.code
        : 'AUTH_BRIDGE_PREPARED_DEPLOY_FAILED';
      process.stderr.write(`${code}\n`);
      process.exitCode = 1;
    },
  );
}
