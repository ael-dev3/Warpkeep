import {
  prepareAuthBridgeNotificationPreparedReceipt,
  writePrivateAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE =
  'warpkeep-auth-bridge-notification-prepared-deploy-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION = '4.110.0';

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
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES =
  Object.freeze([
  'ADMIN_TOKEN_SECRET',
  'FARCASTER_RPC_URL',
  'FARCASTER_RPC_URL_SECONDARY',
  'NOTIFICATION_OPERATOR_SECRET',
  'SESSION_COOKIE_KEY',
  'SIGNING_KEY_JWK',
  ]);
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING =
  'PLAYER_CANARY_OWNER_FID';
const SECRET_BINDING_NAMES = Object.freeze([
  ...AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES.slice(0, 4),
  AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING,
  ...AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES.slice(4),
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

export class AuthBridgeNotificationPreparedDeployError extends Error {
  constructor(code, deploymentMayHaveChanged = false) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedDeployError';
    this.code = code;
    this.deploymentMayHaveChanged = deploymentMayHaveChanged;
  }
}

function fail(code, deploymentMayHaveChanged = false) {
  throw new AuthBridgeNotificationPreparedDeployError(
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
      'AUTH_BRIDGE_PREPARED_DEPLOY_BEFORE_MODES_INVALID',
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
      'AUTH_BRIDGE_PREPARED_DEPLOY_BEFORE_MODES_INVALID',
    ),
    QA_OBSERVER_ENABLED: 'false',
    SPACETIMEDB_DATABASE:
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_BRIDGE_SOURCE_COMMIT: sourceCommit,
  });
}

function versionTag(sourceCommit) {
  return `notification-prepared-${sourceCommit}`;
}

function versionMessage(sourceCommit) {
  return `Warpkeep notification preparation ${sourceCommit}`;
}

export function authBridgeNotificationPreparedVersionContract({
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
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_INPUT_INVALID');
  return Object.freeze({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
    wranglerVersion: AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION,
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
    secretBindingNames: SECRET_BINDING_NAMES,
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
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CONTRACT_INVALID');
  const expected = authBridgeNotificationPreparedVersionContract({
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
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CONTRACT_MISMATCH');
  }
  return expected;
}

export function attestAuthBridgeNotificationPreparedVersion({
  value,
  contract,
} = {}) {
  const canonicalContract = canonicalVersionContract(contract);
  if (
    !exactKeys(value, VERSION_KEYS)
    || !exactPattern(value.versionId, VERSION_ID)
    || !exactPattern(value.createdAt, STRICT_UTC)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_INVALID');
  strictUtc(value.createdAt, 'AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_INVALID');
  const expected = Object.freeze({
    ...canonicalContract,
    versionId: value.versionId,
    createdAt: value.createdAt,
  });
  if (!exactJson(value, expected)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_MISMATCH');
  }
  return Object.freeze({ ...value });
}

export function attestAuthBridgeNotificationPreparedDeployment({
  value,
  contract,
  versionId,
  versionCreatedAt,
  now,
} = {}) {
  const canonicalContract = canonicalVersionContract(contract);
  if (!exactPattern(versionId, VERSION_ID)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  const createdAt = strictUtc(
    versionCreatedAt,
    'AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID',
  );
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  if (!exactKeys(value, DEPLOYMENT_KEYS)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID', true);
  }
  strictUtc(
    value.observedAt,
    'AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_INVALID',
  );
  if (
    Date.parse(value.observedAt) < Date.parse(createdAt)
    || Date.parse(value.observedAt) > now.getTime()
    || now.getTime() - Date.parse(value.observedAt) > 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_STALE', true);
  const expected = Object.freeze({
    schemaVersion: 1,
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
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
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_MISMATCH', true);
  }
  return Object.freeze({ ...value });
}

function functionValue(value, code) {
  if (typeof value !== 'function') fail(code);
  return value;
}

function ambiguous(primary, code = 'AUTH_BRIDGE_PREPARED_DEPLOY_OUTCOME_AMBIGUOUS') {
  const error = new AuthBridgeNotificationPreparedDeployError(code, true);
  error.cause = primary;
  return error;
}

const OPERATOR_ADJUDICATION_CODES = new Set([
  'AUTH_BRIDGE_PREPARED_DEPLOY_MIGRATION_OPERATOR_ADJUDICATION_REQUIRED',
  'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
  'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
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
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_INVALID', true);
  }
  const createdAt = strictUtc(
    versionCreatedAt,
    'AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_INVALID',
  );
  if (
    !(now instanceof Date)
    || Number.isNaN(now.getTime())
    || !exactKeys(value, DEPLOYMENT_KEYS)
    || !exactPattern(value.versionId, VERSION_ID)
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_INVALID', true);
  strictUtc(value.observedAt, 'AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_INVALID');
  if (
    Date.parse(value.observedAt) < Date.parse(createdAt)
    || Date.parse(value.observedAt) > now.getTime()
    || now.getTime() - Date.parse(value.observedAt) > 5 * 60 * 1_000
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_STALE', true);
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
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE,
    accountId: canonicalContract.accountId,
    zoneId: canonicalContract.zoneId,
    workerName: canonicalContract.workerName,
    route: canonicalContract.route,
    trafficPercentage: 100,
  };
  if (!exactJson(infrastructure, expectedInfrastructure)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_INFRASTRUCTURE_MISMATCH', true);
  }
  if (value.versionId !== versionId) {
    if (value.versionId !== predecessorVersionId) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_PREDECESSOR_DRIFT', true);
    }
    return undefined;
  }
  return attestAuthBridgeNotificationPreparedDeployment({
    value,
    contract: canonicalContract,
    versionId,
    versionCreatedAt,
    now,
  });
}

/**
 * One nondeploying version upload and one irreversible 100% deployment. The
 * exact v5/six-secret predecessor is durably pinned before reconciliation and
 * re-attested immediately before the sole deployment POST.
 */
export async function executeAuthBridgeNotificationPreparedDeployAdapter({
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
    [prepareUpload, 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_PREPARATION_REQUIRED'],
    [uploadVersion, 'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_REQUIRED'],
    [inspectVersion, 'AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_INSPECTION_REQUIRED'],
    [reconcileVersion, 'AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_RECONCILIATION_REQUIRED'],
    [assertPredecessorStable, 'AUTH_BRIDGE_PREPARED_DEPLOY_PREDECESSOR_INSPECTION_REQUIRED'],
    [releaseVersion, 'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_REQUIRED'],
    [inspectDeployment, 'AUTH_BRIDGE_PREPARED_DEPLOY_POSTFLIGHT_REQUIRED'],
    [assertCanStartWrite, 'AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REQUIRED'],
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
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_JOURNAL_REQUIRED');
  const canonicalContract = canonicalVersionContract(contract);
  if (typeof clock !== 'function') {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOCK_REQUIRED');
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
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_PREPARATION_INVALID');
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
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_PREDECESSOR_INVALID');
  }
  const prior = await reconcileVersion(canonicalContract);
  if (!Array.isArray(prior) || prior.length > 1) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_RECONCILIATION_INVALID');
  }
  if (prior.length === 1 && !exactPattern(prior[0], VERSION_ID)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_RECONCILIATION_INVALID');
  }
  let versionId = prior[0];
  if (
    versionId === undefined
    && startingPhase !== 'remote-reconcile-started'
  ) {
    throw ambiguous(
      undefined,
      'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OPERATOR_ADJUDICATION_REQUIRED',
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
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_PREPARATION_INVALID');
    if (await assertCanStartWrite('upload') !== true) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
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
        === 'AUTH_BRIDGE_PREPARED_CLOUDFLARE_UPLOAD_RESPONSE_INVALID';
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
        'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      );
    }
    if (uploadResponseInvalid) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_RESPONSE_INVALID');
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
        'AUTH_BRIDGE_PREPARED_DEPLOY_UPLOAD_OUTCOME_AMBIGUOUS',
      );
    }
    versionId = reconciled[0];
  }
  const version = attestAuthBridgeNotificationPreparedVersion({
    value: await inspectVersion(versionId),
    contract: canonicalContract,
  });
  if (version.versionId !== versionId) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_VERSION_MISMATCH');
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
      'AUTH_BRIDGE_PREPARED_DEPLOY_PRE_RELEASE_RECONCILIATION_AMBIGUOUS',
    );
  }
  if (preReleaseDeployment !== undefined) {
    try {
      await journal.completed(preReleaseDeployment);
    } catch (error) {
      throw ambiguous(
        error,
        'AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
      );
    }
    return Object.freeze({
      outcome: 'already-verified',
      contract: canonicalContract,
      version,
      deployment: preReleaseDeployment,
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
      'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OPERATOR_ADJUDICATION_REQUIRED',
    );
  }
  if (await assertCanStartWrite('release') !== true) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_WRITE_PERMIT_REJECTED');
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
    deployment = attestAuthBridgeNotificationPreparedDeployment({
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
      'AUTH_BRIDGE_PREPARED_DEPLOY_RELEASE_OUTCOME_AMBIGUOUS',
    );
  }
  try {
    await journal.completed(deployment);
  } catch (error) {
    if (releaseInvoked) throw ambiguous(
      error,
      'AUTH_BRIDGE_PREPARED_DEPLOY_COMPLETION_OUTCOME_AMBIGUOUS',
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
export async function prepareAndWriteAuthBridgeNotificationPreparedReceipt({
  adminToken,
  expectedBridgeSourceCommit,
  fetchImpl,
  clock,
  lifetimeMilliseconds,
  repositoryRoot,
  reportedHome,
  deploy,
} = {}) {
  functionValue(deploy, 'AUTH_BRIDGE_PREPARED_DEPLOY_OPERATION_REQUIRED');
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
    receipt = await prepareAuthBridgeNotificationPreparedReceipt({
      adminToken,
      expectedBridgeSourceCommit,
      fetchImpl,
      clock: trackedClock,
      lifetimeMilliseconds,
      deploy: async beforeModes => {
        deploymentStarted = true;
        await deploy(beforeModes);
      },
    });
  } catch (error) {
    if (deploymentStarted) {
      throw ambiguous(
        error,
        'AUTH_BRIDGE_PREPARED_DEPLOY_RECEIPT_PREPARATION_AMBIGUOUS',
      );
    }
    throw error;
  }
  if (!(lastClockValue instanceof Date) || Number.isNaN(lastClockValue.getTime())) {
    throw ambiguous(
      undefined,
      'AUTH_BRIDGE_PREPARED_DEPLOY_RECEIPT_PREPARATION_AMBIGUOUS',
    );
  }
  try {
    return writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt,
      repositoryRoot,
      reportedHome,
      now: new Date(lastClockValue.getTime()),
    });
  } catch (error) {
    throw ambiguous(
      error,
      'AUTH_BRIDGE_PREPARED_DEPLOY_RECEIPT_PUBLICATION_FAILED',
    );
  }
}
