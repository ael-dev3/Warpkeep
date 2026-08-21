import {
  authenticateAuthBridgeNotificationPreparedReceiptForPublication,
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  parseAuthBridgeNotificationPreparedReceipt,
  prepareAuthBridgeNotificationB0Receipt,
  writePrivateAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';

export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE =
  'warpkeep-auth-bridge-notification-b0-deploy-v1';
export const AUTH_BRIDGE_NOTIFICATION_B0_WRANGLER_VERSION = '4.110.0';

const ACCOUNT_ID = /^[a-f0-9]{32}$/u;
const SOURCE_COMMIT = /^[a-f0-9]{40}$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const VERSION_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const STRICT_UTC = /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d\.\d{3}Z$/u;
const WORKER_NAME = 'warpkeep-auth-bridge';
const ENTRYPOINT = 'src/index.ts';
const WORKERS_DEV = false;
const ROUTE = Object.freeze({
  pattern: 'auth.warpkeep.com',
  customDomain: true,
});
const COMPATIBILITY_DATE = '2026-07-11';
const COMPATIBILITY_FLAGS = Object.freeze(['nodejs_compat']);
const DURABLE_OBJECT_BINDINGS = Object.freeze([
  Object.freeze({ name: 'ADMISSION_NOTIFICATIONS', className: 'AdmissionNotification' }),
  Object.freeze({ name: 'AUTH_RATE_LIMITER', className: 'AuthRateLimiter' }),
  Object.freeze({ name: 'CHALLENGE_REPLAY_GUARD', className: 'ChallengeReplayGuard' }),
  Object.freeze({ name: 'QA_CHALLENGE_REPLAY_GUARD', className: 'QaChallengeReplayGuard' }),
  Object.freeze({ name: 'SESSION_FAMILIES', className: 'SessionFamily' }),
]);
const MIGRATIONS = Object.freeze([
  Object.freeze({ tag: 'v1', newSqliteClasses: Object.freeze(['ChallengeReplayGuard']) }),
  Object.freeze({ tag: 'v2', newSqliteClasses: Object.freeze(['AuthRateLimiter']) }),
  Object.freeze({ tag: 'v3', newSqliteClasses: Object.freeze(['SessionFamily']) }),
  Object.freeze({ tag: 'v4', newSqliteClasses: Object.freeze(['QaChallengeReplayGuard']) }),
  Object.freeze({ tag: 'v5', newSqliteClasses: Object.freeze(['AdmissionNotification']) }),
]);
export const AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES = Object.freeze([
  'ADMIN_TOKEN_SECRET',
  'FARCASTER_RPC_URL',
  'FARCASTER_RPC_URL_SECONDARY',
  'NOTIFICATION_OPERATOR_SECRET',
  'SESSION_COOKIE_KEY',
  'SIGNING_KEY_JWK',
]);
const CONTRACT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'wranglerVersion',
  'accountId',
  'zoneId',
  'workerName',
  'entrypoint',
  'workersDev',
  'route',
  'versionTag',
  'versionMessage',
  'sourceCommit',
  'sourceDigest',
  'compatibilityDate',
  'compatibilityFlags',
  'variables',
  'secretBindingNames',
  'durableObjectBindings',
  'migrations',
]);
const VERSION_KEYS = Object.freeze([
  ...CONTRACT_KEYS,
  'versionId',
  'createdAt',
]);
const DEPLOYMENT_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'accountId',
  'zoneId',
  'workerName',
  'route',
  'versionId',
  'versionTag',
  'sourceCommit',
  'trafficPercentage',
  'observedAt',
]);

export class AuthBridgeNotificationB0DeployError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'AuthBridgeNotificationB0DeployError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new AuthBridgeNotificationB0DeployError(
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

function exactPattern(value, pattern) {
  return typeof value === 'string' && pattern.test(value);
}

function strictUtc(value, code) {
  if (
    !exactPattern(value, STRICT_UTC)
    || Number.isNaN(Date.parse(value))
    || new Date(Date.parse(value)).toISOString() !== value
  ) fail(code);
  return value;
}

function booleanString(value, code) {
  if (value !== true && value !== false) fail(code);
  return value ? 'true' : 'false';
}

function variables(sourceCommit, beforeModes) {
  return Object.freeze({
    ACCESS_EXPECTED_FID_REQUIRED: booleanString(
      beforeModes.accessExpectedFidRequired,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_BEFORE_MODES_INVALID',
    ),
    ALLOWED_ORIGINS: 'https://warpkeep.com',
    APPROVAL_NOTIFICATIONS_ENABLED: 'true',
    ENVIRONMENT: 'production',
    FARCASTER_DOMAIN: 'warpkeep.com',
    FARCASTER_SIWE_URI: 'https://warpkeep.com/',
    ISSUER: 'https://auth.warpkeep.com',
    MINIAPP_NOTIFICATION_CLIENTS:
      '9152=https://api.farcaster.xyz/v1/frame-notifications',
    MINIAPP_NOTIFICATION_HUB_URLS:
      'https://rho.farcaster.xyz:3381/,https://hub.pinata.cloud/',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    OIDC_KEY_ID: 'warpkeep-alpha-2026-07-01',
    PUBLIC_AUTH_ENABLED: booleanString(
      beforeModes.publicAuthEnabled,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_BEFORE_MODES_INVALID',
    ),
    QA_OBSERVER_ENABLED: 'false',
    SPACETIMEDB_DATABASE:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_BRIDGE_SOURCE_COMMIT: sourceCommit,
  });
}

function versionTag(sourceCommit) {
  return `notification-b0-${sourceCommit}`;
}

function versionMessage(sourceCommit) {
  return `Warpkeep notification B0 ${sourceCommit}`;
}

export function authBridgeNotificationB0VersionContract({
  accountId,
  zoneId,
  sourceCommit,
  sourceDigest,
  beforeModes,
} = {}) {
  if (
    !exactPattern(accountId, ACCOUNT_ID)
    || !exactPattern(zoneId, ACCOUNT_ID)
    || !exactPattern(sourceCommit, SOURCE_COMMIT)
    || !exactPattern(sourceDigest, SHA256_HEX)
    || !isRecord(beforeModes)
    || JSON.stringify(Object.keys(beforeModes))
      !== JSON.stringify([
        'bridgeSourceCommit',
        'publicAuthEnabled',
        'accessExpectedFidRequired',
      ])
    || beforeModes.bridgeSourceCommit !== sourceCommit
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_INPUT_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
    wranglerVersion: AUTH_BRIDGE_NOTIFICATION_B0_WRANGLER_VERSION,
    accountId,
    zoneId,
    workerName: WORKER_NAME,
    entrypoint: ENTRYPOINT,
    workersDev: WORKERS_DEV,
    route: ROUTE,
    versionTag: versionTag(sourceCommit),
    versionMessage: versionMessage(sourceCommit),
    sourceCommit,
    sourceDigest,
    compatibilityDate: COMPATIBILITY_DATE,
    compatibilityFlags: COMPATIBILITY_FLAGS,
    variables: variables(sourceCommit, beforeModes),
    secretBindingNames: AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES,
    durableObjectBindings: DURABLE_OBJECT_BINDINGS,
    migrations: MIGRATIONS,
  });
}

function exactJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function canonicalVersionContract(value) {
  if (
    !exactKeys(value, CONTRACT_KEYS)
    || !isRecord(value.variables)
    || !['true', 'false'].includes(value.variables.PUBLIC_AUTH_ENABLED)
    || !['true', 'false'].includes(value.variables.ACCESS_EXPECTED_FID_REQUIRED)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_CONTRACT_INVALID');
  const expected = authBridgeNotificationB0VersionContract({
    accountId: value.accountId,
    zoneId: value.zoneId,
    sourceCommit: value.sourceCommit,
    sourceDigest: value.sourceDigest,
    beforeModes: {
      bridgeSourceCommit: value.sourceCommit,
      publicAuthEnabled: value.variables.PUBLIC_AUTH_ENABLED === 'true',
      accessExpectedFidRequired:
        value.variables.ACCESS_EXPECTED_FID_REQUIRED === 'true',
    },
  });
  if (!exactJson(value, expected)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_CONTRACT_MISMATCH');
  }
  return expected;
}

export function attestAuthBridgeNotificationB0Version({
  value,
  contract,
} = {}) {
  const canonicalContract = canonicalVersionContract(contract);
  if (
    !exactKeys(value, VERSION_KEYS)
    || !exactPattern(value.versionId, VERSION_ID)
    || !exactPattern(value.createdAt, STRICT_UTC)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_INVALID');
  strictUtc(value.createdAt, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_INVALID');
  const expected = Object.freeze({
    ...canonicalContract,
    versionId: value.versionId,
    createdAt: value.createdAt,
  });
  if (!exactJson(value, expected)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_MISMATCH');
  }
  return Object.freeze({ ...value });
}

export function attestAuthBridgeNotificationB0Deployment({
  value,
  contract,
  versionId,
  versionCreatedAt,
  now,
} = {}) {
  const canonicalContract = canonicalVersionContract(contract);
  if (!exactPattern(versionId, VERSION_ID)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  const createdAt = strictUtc(
    versionCreatedAt,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_INVALID',
  );
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  if (!exactKeys(value, DEPLOYMENT_KEYS)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  strictUtc(
    value.observedAt,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_INVALID',
  );
  if (
    Date.parse(value.observedAt) < Date.parse(createdAt)
    || Date.parse(value.observedAt) > now.getTime()
    || now.getTime() - Date.parse(value.observedAt) > 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_STALE', true);
  const expected = Object.freeze({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
    accountId: canonicalContract.accountId,
    zoneId: canonicalContract.zoneId,
    workerName: WORKER_NAME,
    route: ROUTE,
    versionId,
    versionTag: canonicalContract.versionTag,
    sourceCommit: canonicalContract.sourceCommit,
    trafficPercentage: 100,
    observedAt: value.observedAt,
  });
  if (!exactJson(value, expected)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_MISMATCH', true);
  }
  return Object.freeze({ ...value });
}

function functionValue(value, code) {
  if (typeof value !== 'function') fail(code);
  return value;
}

function ambiguous(primary, code = 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OUTCOME_AMBIGUOUS') {
  const error = new AuthBridgeNotificationB0DeployError(code, true);
  error.cause = primary;
  return error;
}

const OPERATOR_ADJUDICATION_CODES = new Set([
  'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_MIGRATION_OPERATOR_ADJUDICATION_REQUIRED',
  'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
  'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
]);

function rethrowOperatorAdjudication(error) {
  if (
    isRecord(error)
    && error.deploymentMayHaveChanged === true
    && OPERATOR_ADJUDICATION_CODES.has(error.code)
  ) throw error;
}

function attestReleaseCandidateDeployment({
  value,
  contract,
  versionId,
  versionCreatedAt,
  predecessorVersionId,
  now,
}) {
  const canonicalContract = canonicalVersionContract(contract);
  if (!exactPattern(versionId, VERSION_ID)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_INVALID', true);
  }
  const createdAt = strictUtc(
    versionCreatedAt,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_INVALID',
  );
  if (
    !(now instanceof Date)
    || Number.isNaN(now.getTime())
    || !exactKeys(value, DEPLOYMENT_KEYS)
    || !exactPattern(value.versionId, VERSION_ID)
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_INVALID', true);
  strictUtc(value.observedAt, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_INVALID');
  if (
    Date.parse(value.observedAt) < Date.parse(createdAt)
    || Date.parse(value.observedAt) > now.getTime()
    || now.getTime() - Date.parse(value.observedAt) > 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_STALE', true);
  const infrastructure = {
    schemaVersion: value.schemaVersion,
    profile: value.profile,
    accountId: value.accountId,
    zoneId: value.zoneId,
    workerName: value.workerName,
    route: value.route,
    trafficPercentage: value.trafficPercentage,
  };
  const expectedInfrastructure = {
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE,
    accountId: canonicalContract.accountId,
    zoneId: canonicalContract.zoneId,
    workerName: canonicalContract.workerName,
    route: canonicalContract.route,
    trafficPercentage: 100,
  };
  if (!exactJson(infrastructure, expectedInfrastructure)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_INFRASTRUCTURE_MISMATCH', true);
  }
  if (value.versionId !== versionId) {
    if (value.versionId !== predecessorVersionId) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PREDECESSOR_DRIFT', true);
    }
    return undefined;
  }
  return attestAuthBridgeNotificationB0Deployment({
    value,
    contract: canonicalContract,
    versionId,
    versionCreatedAt,
    now,
  });
}

function stableCompletedDeployment({
  stored,
  current,
  contract,
  versionId,
  versionCreatedAt,
}) {
  if (
    !isRecord(stored)
    || JSON.stringify(Object.keys(stored).sort())
      !== JSON.stringify([...DEPLOYMENT_KEYS].sort())
  ) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_RECORD_INVALID', true);
  }
  const createdAt = strictUtc(
    versionCreatedAt,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_RECORD_INVALID',
  );
  strictUtc(
    stored.observedAt,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_RECORD_INVALID',
  );
  if (Date.parse(stored.observedAt) < Date.parse(createdAt)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_RECORD_INVALID', true);
  }
  const normalizedStored = Object.fromEntries(
    DEPLOYMENT_KEYS.map(key => [key, stored[key]]),
  );
  normalizedStored.route = isRecord(stored.route)
    ? {
      pattern: stored.route.pattern,
      customDomain: stored.route.customDomain,
    }
    : stored.route;
  const stableStored = { ...normalizedStored, observedAt: current.observedAt };
  if (!exactJson(stableStored, current)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_DRIFT', true);
  }
  const expected = {
    ...attestAuthBridgeNotificationB0Deployment({
      value: current,
      contract,
      versionId,
      versionCreatedAt,
      now: new Date(current.observedAt),
    }),
    observedAt: stored.observedAt,
  };
  if (!exactJson(normalizedStored, expected)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_RECORD_INVALID', true);
  }
  return Object.freeze({ ...expected });
}

/**
 * One nondeploying version upload and one irreversible 100% deployment. The
 * exact six-secret predecessor is durably pinned before reconciliation
 * and re-attested immediately before the sole deployment POST. The candidate
 * is always a code-only nondeploying v5 version. Its exact reviewed predecessor
 * is already at v5, so the candidate never replays Durable Object migrations.
 */
export async function executeAuthBridgeNotificationB0DeployAdapter({
  contract,
  prepareUpload,
  uploadVersion,
  inspectVersion,
  reconcileVersion,
  assertPredecessorStable,
  releaseVersion,
  inspectDeployment,
  journal,
  assertCanStartWrite,
  clock = () => new Date(),
} = {}) {
  for (const [value, code] of [
    [prepareUpload, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_PREPARATION_REQUIRED'],
    [uploadVersion, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_REQUIRED'],
    [inspectVersion, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_INSPECTION_REQUIRED'],
    [reconcileVersion, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_RECONCILIATION_REQUIRED'],
    [assertPredecessorStable, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PREDECESSOR_INSPECTION_REQUIRED'],
    [releaseVersion, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_REQUIRED'],
    [inspectDeployment, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_POSTFLIGHT_REQUIRED'],
    [assertCanStartWrite, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_WRITE_PERMIT_REQUIRED'],
  ]) functionValue(value, code);
  if (
    !isRecord(journal)
    || ![
      'prepared',
      'inspect',
      'remoteReconcileStarted',
      'uploadInvoked',
      'uploaded',
      'releaseUncertain',
      'releaseInvoked',
      'completed',
    ]
      .every(name => typeof journal[name] === 'function')
  ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_REQUIRED');
  const canonicalContract = canonicalVersionContract(contract);
  if (typeof clock !== 'function') {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_CLOCK_REQUIRED');
  }
  await journal.prepared(canonicalContract);
  let journalState = journal.inspect();
  let uploadPlan;
  if (journalState.phase === 'prepared') {
    uploadPlan = await prepareUpload(canonicalContract);
    if (
      !exactKeys(uploadPlan, [
        'mode', 'predecessorDeploymentId', 'predecessorVersionId',
      ])
      || uploadPlan.mode !== 'version'
      || !exactPattern(uploadPlan.predecessorDeploymentId, VERSION_ID)
      || !exactPattern(uploadPlan.predecessorVersionId, VERSION_ID)
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_PREPARATION_INVALID');
    await journal.remoteReconcileStarted(Object.freeze({
      predecessorDeploymentId: uploadPlan.predecessorDeploymentId,
      predecessorVersionId: uploadPlan.predecessorVersionId,
      sourceCommit: canonicalContract.sourceCommit,
      sourceDigest: canonicalContract.sourceDigest,
      versionTag: canonicalContract.versionTag,
    }));
    journalState = journal.inspect();
  }
  const startingPhase = journalState.phase;
  const predecessorDeploymentId = journalState.predecessorDeploymentId;
  const predecessorVersionId = journalState.predecessorVersionId;
  if (
    !exactPattern(predecessorDeploymentId, VERSION_ID)
    || !exactPattern(predecessorVersionId, VERSION_ID)
  ) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PREDECESSOR_INVALID');
  }
  const prior = await reconcileVersion(canonicalContract);
  if (!Array.isArray(prior) || prior.length > 1) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_RECONCILIATION_INVALID');
  }
  if (prior.length === 1 && !exactPattern(prior[0], VERSION_ID)) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_RECONCILIATION_INVALID');
  }
  let versionId = prior[0];
  if (
    versionId === undefined
    && startingPhase !== 'remote-reconcile-started'
  ) {
    throw ambiguous(
      undefined,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
    );
  }
  if (versionId === undefined) {
    uploadPlan ??= await prepareUpload(canonicalContract);
    if (
      !exactKeys(uploadPlan, [
        'mode', 'predecessorDeploymentId', 'predecessorVersionId',
      ])
      || uploadPlan.mode !== 'version'
      || uploadPlan.predecessorDeploymentId !== predecessorDeploymentId
      || uploadPlan.predecessorVersionId !== predecessorVersionId
    ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_PREPARATION_INVALID');
    if (await assertCanStartWrite('upload') !== true) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_WRITE_PERMIT_REJECTED');
    }
    await journal.uploadInvoked(Object.freeze({
      versionTag: canonicalContract.versionTag,
      sourceCommit: canonicalContract.sourceCommit,
      sourceDigest: canonicalContract.sourceDigest,
      uploadMode: uploadPlan.mode,
    }));
    let upload;
    let uploadError;
    let uploadResponseInvalid = false;
    try {
      upload = await uploadVersion(canonicalContract, uploadPlan);
    } catch (error) {
      uploadError = error;
      uploadResponseInvalid = error?.code
        === 'AUTH_BRIDGE_NOTIFICATION_B0_CLOUDFLARE_UPLOAD_RESPONSE_INVALID';
    }
    if (
      uploadError === undefined
      && (!exactKeys(upload, ['versionId'])
        || !exactPattern(upload.versionId, VERSION_ID))
    ) {
      uploadError = upload;
      uploadResponseInvalid = true;
    }
    let reconciled;
    try {
      reconciled = await reconcileVersion(canonicalContract);
    } catch (reconcileError) {
      rethrowOperatorAdjudication(reconcileError);
      throw ambiguous(
        uploadError === undefined
          ? reconcileError
          : new AggregateError([uploadError, reconcileError]),
        'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      );
    }
    if (uploadResponseInvalid) {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_RESPONSE_INVALID');
    }
    if (
      !Array.isArray(reconciled)
      || reconciled.length !== 1
      || !exactPattern(reconciled[0], VERSION_ID)
      || (uploadError === undefined
        && upload?.versionId !== undefined
        && upload.versionId !== reconciled[0])
    ) {
      throw ambiguous(
        uploadError ?? upload,
        'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      );
    }
    versionId = reconciled[0];
  }
  const version = attestAuthBridgeNotificationB0Version({
    value: await inspectVersion(versionId),
    contract: canonicalContract,
  });
  if (version.versionId !== versionId) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_VERSION_MISMATCH');
  }
  await journal.uploaded(version);
  const recoveryPhase = journal.inspect().phase;
  let preReleaseDeployment;
  try {
    preReleaseDeployment = attestReleaseCandidateDeployment({
      value: await inspectDeployment(),
      contract: canonicalContract,
      versionId: version.versionId,
      versionCreatedAt: version.createdAt,
      predecessorVersionId,
      now: clock(),
    });
  } catch (error) {
    rethrowOperatorAdjudication(error);
    throw ambiguous(
      error,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PRE_RELEASE_RECONCILIATION_AMBIGUOUS',
    );
  }
  const storedCompletion = journal.inspect().completedDeployment ?? null;
  if (storedCompletion !== null && preReleaseDeployment === undefined) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_DRIFT', true);
  }
  if (preReleaseDeployment !== undefined) {
    const completion = storedCompletion === null
      ? preReleaseDeployment
      : stableCompletedDeployment({
        stored: storedCompletion,
        current: preReleaseDeployment,
        contract: canonicalContract,
        versionId: version.versionId,
        versionCreatedAt: version.createdAt,
      });
    try {
      await journal.completed(completion);
    } catch (error) {
      throw ambiguous(
        error,
        'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
      );
    }
    return Object.freeze({
      outcome: 'already-verified',
      contract: canonicalContract,
      version,
      deployment: completion,
    });
  }
  await journal.releaseUncertain(Object.freeze({
    versionId: version.versionId,
    versionTag: version.versionTag,
    sourceCommit: version.sourceCommit,
  }));
  if (recoveryPhase === 'release-invoked') {
    throw ambiguous(
      undefined,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
    );
  }
  if (await assertCanStartWrite('release') !== true) {
    fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_WRITE_PERMIT_REJECTED');
  }
  await assertPredecessorStable(Object.freeze({
    deploymentId: predecessorDeploymentId,
    versionId: predecessorVersionId,
  }));
  let releaseError;
  let releaseInvoked = false;
  try {
    await journal.releaseInvoked(Object.freeze({
      versionId: version.versionId,
      versionTag: version.versionTag,
      sourceCommit: version.sourceCommit,
    }));
    releaseInvoked = true;
    await releaseVersion(Object.freeze({
      versionId: version.versionId,
      predecessorDeploymentId,
      predecessorVersionId,
      percentage: 100,
      message: version.versionMessage,
    }));
  } catch (error) {
    releaseError = error;
  }
  let deployment;
  try {
    deployment = attestAuthBridgeNotificationB0Deployment({
      value: await inspectDeployment(),
      contract: canonicalContract,
      versionId: version.versionId,
      versionCreatedAt: version.createdAt,
      now: clock(),
    });
  } catch (error) {
    rethrowOperatorAdjudication(error);
    throw ambiguous(
      releaseError === undefined
        ? error
        : new AggregateError([releaseError, error]),
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RELEASE_OUTCOME_AMBIGUOUS',
    );
  }
  try {
    await journal.completed(deployment);
  } catch (error) {
    if (releaseInvoked) throw ambiguous(
      error,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
    );
    throw error;
  }
  return Object.freeze({
    outcome: releaseError === undefined
      ? 'verified'
      : 'verified-after-release-error',
    contract: canonicalContract,
    version,
    deployment,
  });
}

/**
 * Composes authenticated PRE/POST bridge inspection, the exact deploy state
 * machine, and crash-safe private receipt publication. The deployment adapter
 * never receives the bridge administrator token.
 */
export async function prepareAndWriteAuthBridgeNotificationB0Receipt({
  adminToken,
  expectedBridgeSourceCommit,
  fetchImpl,
  clock,
  lifetimeMilliseconds,
  repositoryRoot,
  reportedHome,
  deploy,
  withPublicationJournal,
  testOnlyAfterDeployCompleted,
  testOnlyAfterReceiptPublicationIntent,
  testOnlyAfterReceiptWrite,
} = {}) {
  functionValue(deploy, 'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_OPERATION_REQUIRED');
  functionValue(
    withPublicationJournal,
    'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_JOURNAL_REQUIRED',
  );
  for (const hook of [
    testOnlyAfterDeployCompleted,
    testOnlyAfterReceiptPublicationIntent,
    testOnlyAfterReceiptWrite,
  ]) {
    if (hook !== undefined && typeof hook !== 'function') {
      fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_TEST_HOOK_INVALID');
    }
  }
  const sourceClock = clock ?? (() => new Date());
  let lastClockValue;
  const trackedClock = () => {
    const value = sourceClock();
    lastClockValue = value;
    return value;
  };
  let deploymentStarted = false;
  let receipt;
  try {
    receipt = await prepareAuthBridgeNotificationB0Receipt({
      adminToken,
      expectedBridgeSourceCommit,
      fetchImpl,
      clock: trackedClock,
      lifetimeMilliseconds,
      deploy: async beforeModes => {
        deploymentStarted = true;
        await deploy(beforeModes);
        await testOnlyAfterDeployCompleted?.();
      },
    });
  } catch (error) {
    if (deploymentStarted) {
      throw ambiguous(
        error,
        'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PREPARATION_AMBIGUOUS',
      );
    }
    throw error;
  }
  if (!(lastClockValue instanceof Date) || Number.isNaN(lastClockValue.getTime())) {
    throw ambiguous(
      undefined,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PREPARATION_AMBIGUOUS',
    );
  }
  try {
    return await withPublicationJournal(async journal => {
      if (
        !isRecord(journal)
        || typeof journal.inspect !== 'function'
        || typeof journal.receiptPublicationIntent !== 'function'
        || typeof journal.receiptPublished !== 'function'
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_JOURNAL_REQUIRED');
      const generated = canonicalAuthBridgeNotificationPreparedReceiptPublication(
        receipt,
      );
      let state = journal.inspect();
      let intent = state.receiptPublicationIntent ?? null;
      if (intent === null) {
        await journal.receiptPublicationIntent(generated);
        await testOnlyAfterReceiptPublicationIntent?.();
        state = journal.inspect();
        intent = state.receiptPublicationIntent ?? null;
      }
      if (
        !isRecord(intent)
        || !exactKeys(intent, ['receiptBytesBase64', 'receiptDigest'])
        || !SHA256_HEX.test(intent.receiptDigest ?? '')
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_INTENT_INVALID');
      const bytes = Buffer.from(intent.receiptBytesBase64, 'base64');
      let parsed;
      try {
        if (
          bytes.byteLength < 2
          || bytes[bytes.byteLength - 1] !== 0x0a
        ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_INTENT_INVALID');
        parsed = parseAuthBridgeNotificationPreparedReceipt(
          JSON.parse(bytes.subarray(0, -1).toString('utf8')),
        );
      } catch (error) {
        if (error instanceof AuthBridgeNotificationB0DeployError) throw error;
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_INTENT_INVALID');
      } finally {
        bytes.fill(0);
      }
      const canonical = canonicalAuthBridgeNotificationPreparedReceiptPublication(
        parsed,
      );
      if (!exactJson(canonical, intent)) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_INTENT_INVALID');
      }
      const publicationReceipt = exactJson(generated, intent)
        ? receipt
        : await authenticateAuthBridgeNotificationPreparedReceiptForPublication({
          receipt: parsed,
          adminToken,
          expectedBridgeSourceCommit,
          fetchImpl,
          now: new Date(lastClockValue.getTime()),
        });
      const result = writePrivateAuthBridgeNotificationPreparedReceipt({
        receipt: publicationReceipt,
        repositoryRoot,
        reportedHome,
        now: new Date(lastClockValue.getTime()),
      });
      if (result.receiptDigest !== intent.receiptDigest) {
        fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PUBLICATION_MISMATCH');
      }
      await testOnlyAfterReceiptWrite?.(result);
      await journal.receiptPublished({ receiptDigest: result.receiptDigest });
      const published = journal.inspect().publishedReceipt;
      if (
        !isRecord(published)
        || !exactKeys(published, ['receiptDigest'])
        || published.receiptDigest !== result.receiptDigest
      ) fail('AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PUBLICATION_MISMATCH');
      return result;
    });
  } catch (error) {
    throw ambiguous(
      error,
      'AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_RECEIPT_PUBLICATION_FAILED',
    );
  }
}
