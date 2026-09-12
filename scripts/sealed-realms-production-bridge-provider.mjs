import { realpathSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { assertSealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import {
  sourceCommitFromSealedRealmsProductionAuthority,
} from './sealed-realms-production-source-authority.mjs';
import {
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  parseAuthBridgeNotificationPreparedReceipt,
  resolveExistingAuthBridgeNotificationPreparedReceipt,
} from './auth-bridge-notification-prepared-receipt.mjs';
import {
  resolveAuthBridgeNotificationPreparedOriginalUploadAuthority,
  resolveExistingAuthBridgeNotificationPreparedDeployJournal,
} from './auth-bridge-notification-prepared-deploy-journal.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  authBridgeNotificationPreparedVersionContract,
} from './auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  inspectAuthBridgeNotificationPreparedRecoveryAuthority,
  inspectAuthBridgeNotificationPreparedRecoverySource,
} from './auth-bridge-notification-prepared-cloudflare-runtime.mjs';

const providers = new WeakMap();
const observations = new WeakMap();
const testCapabilities = new WeakSet();
const HASH = /^[a-f0-9]{64}$/u;
const ID = /^[a-f0-9]{32}$/u;
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const SECRET = /^\S{20,4096}$/u;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const G001 = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const MAX_AGE = 5 * 60 * 1000;

function fail(suffix) {
  const error = new Error(`SEALED_REALMS_BRIDGE_PROVIDER_${suffix}`);
  error.code = error.message;
  throw error;
}

function input(value, allowed, required = allowed) {
  if (types.isProxy(value) || value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Object.prototype) fail('INPUT_INVALID');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string'
    || !allowed.includes(key) || !descriptors[key].enumerable
    || !Object.hasOwn(descriptors[key], 'value'))
    || required.some(key => !Object.hasOwn(descriptors, key))) fail('INPUT_INVALID');
  return Object.freeze(Object.fromEntries(Object.entries(descriptors)
    .map(([key, descriptor]) => [key, descriptor.value])));
}

function timestamp(value) {
  if (typeof value !== 'string' || !UTC.test(value)
    || !Number.isFinite(Date.parse(value))
    || new Date(value).toISOString() !== value) fail('OBSERVATION_INVALID');
  return Date.parse(value);
}

function fresh(observedAt, now) {
  const observed = timestamp(observedAt);
  if (observed > now.getTime() || now.getTime() - observed >= MAX_AGE) {
    fail('OBSERVATION_STALE');
  }
}

function captureConfiguration(environment) {
  const names = ['WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID', 'WARPKEEP_AUTH_BRIDGE_ZONE_ID',
    'WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN', 'WARPKEEP_PRODUCTION_ADMIN_TOKEN',
    'WARPKEEP_PTR_SPACETIMEDB_DATABASE'];
  const value = Object.fromEntries([...names, 'GITHUB_TOKEN'].map(name => [name, environment[name]]));
  delete environment.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN;
  delete environment.WARPKEEP_PRODUCTION_ADMIN_TOKEN;
  return Object.freeze(value);
}

function configuration(value) {
  if (!ID.test(value.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID ?? '')
    || !ID.test(value.WARPKEEP_AUTH_BRIDGE_ZONE_ID ?? '')
    || !SECRET.test(value.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN ?? '')
    || !SECRET.test(value.WARPKEEP_PRODUCTION_ADMIN_TOKEN ?? '')
    || value.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN === value.WARPKEEP_PRODUCTION_ADMIN_TOKEN
    || value.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN === value.GITHUB_TOKEN
    || value.WARPKEEP_PRODUCTION_ADMIN_TOKEN === value.GITHUB_TOKEN
    || !HASH.test(value.WARPKEEP_PTR_SPACETIMEDB_DATABASE ?? '')
    || value.WARPKEEP_PTR_SPACETIMEDB_DATABASE === G001) fail('CONFIGURATION_INVALID');
  return Object.freeze({
    accountId: value.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID,
    zoneId: value.WARPKEEP_AUTH_BRIDGE_ZONE_ID,
    apiToken: value.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN,
    adminToken: value.WARPKEEP_PRODUCTION_ADMIN_TOKEN,
    ptrDatabaseIdentity: value.WARPKEEP_PTR_SPACETIMEDB_DATABASE,
  });
}

export function createSealedRealmsProductionBridgeProviderTestCapability() {
  if (process.env.NODE_ENV !== 'test') fail('TEST_ONLY_FORBIDDEN');
  const capability = Object.freeze({});
  testCapabilities.add(capability);
  return capability;
}

/** Capture credentials once; public provider/observation objects carry no data. */
export function createSealedRealmsProductionBridgeProvider(options) {
  const required = ['authority', 'privateState', 'repositoryRoot', 'fetchImpl'];
  const seams = ['testOnlyEnvironment', 'testOnlyNow', 'testOnlyResolveReceipt',
    'testOnlyResolveJournal', 'testOnlyResolveUpload', 'testOnlyInspectSource', 'testOnlyInspectLive'];
  const value = input(options, [...required, 'testOnlyCapability', ...seams], required);
  const testing = seams.some(key => Object.hasOwn(value, key));
  if ((testing && (process.env.NODE_ENV !== 'test' || !testCapabilities.has(value.testOnlyCapability)))
    || (!testing && Object.hasOwn(value, 'testOnlyCapability'))) fail('TEST_ONLY_FORBIDDEN');
  if (typeof value.fetchImpl !== 'function' || typeof value.repositoryRoot !== 'string'
    || !isAbsolute(value.repositoryRoot)
    || seams.filter(key => key !== 'testOnlyEnvironment').some(key =>
      Object.hasOwn(value, key) && typeof value[key] !== 'function')) fail('INPUT_INVALID');
  const sourceCommit = sourceCommitFromSealedRealmsProductionAuthority(value.authority);
  const privateState = assertSealedRealmsProductionPrivateState(value.privateState);
  if (value.authority.mode !== 'S') fail('SOURCE_INVALID');
  if (!testing && realpathSync(value.repositoryRoot) !== resolve(value.repositoryRoot)) {
    fail('REPOSITORY_INVALID');
  }
  // Some realm operations construct bridge state without using it. Capture and
  // scrub now, but require these credentials only when an observation is used.
  const capturedConfig = captureConfiguration(value.testOnlyEnvironment ?? process.env);
  const provider = Object.freeze({});
  providers.set(provider, Object.freeze({
    authority: value.authority, privateState, sourceCommit, repositoryRoot: value.repositoryRoot, testing,
    fetchImpl: value.fetchImpl, capturedConfig,
    now: value.testOnlyNow ?? (() => new Date()),
    receipt: value.testOnlyResolveReceipt ?? resolveExistingAuthBridgeNotificationPreparedReceipt,
    journal: value.testOnlyResolveJournal ?? resolveExistingAuthBridgeNotificationPreparedDeployJournal,
    upload: value.testOnlyResolveUpload ?? resolveAuthBridgeNotificationPreparedOriginalUploadAuthority,
    inspectSource: value.testOnlyInspectSource ?? inspectAuthBridgeNotificationPreparedRecoverySource,
    inspectLive: value.testOnlyInspectLive ?? inspectAuthBridgeNotificationPreparedRecoveryAuthority,
  }));
  return provider;
}

export function assertSealedRealmsProductionBridgeProvider(provider, authority, privateState, repositoryRoot) {
  const state = providers.get(provider);
  if (state?.testing && process.env.NODE_ENV !== 'test') fail('TEST_ONLY_FORBIDDEN');
  if (state === undefined || state.authority !== authority || state.privateState !== privateState
    || state.repositoryRoot !== repositoryRoot
    || sourceCommitFromSealedRealmsProductionAuthority(authority) !== state.sourceCommit) {
    fail('AUTHORITY_INVALID');
  }
  return provider;
}

export async function inspectSealedRealmsProductionBridgeProvider(options) {
  const value = input(options, ['provider', 'preparedReceiptDigest', 'journalHeadDigest']);
  const state = providers.get(value.provider);
  if (state?.testing && process.env.NODE_ENV !== 'test') fail('TEST_ONLY_FORBIDDEN');
  if (state === undefined || !HASH.test(value.preparedReceiptDigest ?? '')
    || !HASH.test(value.journalHeadDigest ?? '')) fail('AUTHORITY_INVALID');
  const config = configuration(state.capturedConfig);
  let lastTime = -Infinity;
  const now = () => {
    const sampled = state.now();
    if (!(sampled instanceof Date) || !Number.isFinite(sampled.getTime())
      || sampled.getTime() < lastTime) fail('CLOCK_INVALID');
    lastTime = sampled.getTime();
    return new Date(lastTime);
  };
  const read = async () => {
    const at = now();
    const resolved = await state.receipt({ repositoryRoot: state.repositoryRoot,
      expectedSourceCommit: state.sourceCommit, now: at });
    const receipt = parseAuthBridgeNotificationPreparedReceipt(resolved.receipt);
    const publication = canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt);
    const journal = await state.journal({ repositoryRoot: state.repositoryRoot });
    const upload = await state.upload({ repositoryRoot: state.repositoryRoot });
    const finished = now();
    if (publication.receiptDigest !== resolved.receiptDigest
      || resolved.receiptDigest !== value.preparedReceiptDigest
      || receipt.bridgeSourceCommit !== state.sourceCommit
      || timestamp(receipt.preparedAt) > at.getTime()
      || timestamp(receipt.expiresAt) <= finished.getTime()
      || journal.journalHeadDigest !== value.journalHeadDigest
      || journal.sourceCommit !== state.sourceCommit
      || !UUID.test(journal.workerVersionId ?? '')
      || upload.sourceCommit !== state.sourceCommit
      || upload.workerVersionId !== journal.workerVersionId
      || upload.journalHeadDigest !== journal.journalHeadDigest
      || !HASH.test(upload.sourceDigest ?? '')
      || !HASH.test(upload.uploadRecordDigest ?? '')
      || !HASH.test(upload.completedJournalHeadDigest ?? '')) fail('AUTHORITY_DRIFT');
    return { receipt, journal, upload, snapshot: JSON.stringify([receipt, journal, upload]) };
  };
  const first = await read();
  const contract = authBridgeNotificationPreparedVersionContract({
    accountId: config.accountId, zoneId: config.zoneId,
    sourceCommit: state.sourceCommit, sourceDigest: first.upload.sourceDigest,
    beforeModes: {
      bridgeSourceCommit: AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      publicAuthEnabled: first.receipt.publicAuthEnabledBefore,
      accessExpectedFidRequired: first.receipt.accessExpectedFidRequiredBefore,
    },
  });
  const sourceStartedAt = now();
  const source = await state.inspectSource({ contract,
    workerVersionId: first.upload.workerVersionId,
    ptrSpacetimeDbDatabase: config.ptrDatabaseIdentity,
    apiToken: config.apiToken, fetchImpl: state.fetchImpl, now: sourceStartedAt });
  const liveStartedAt = now();
  fresh(source.oldestObservedAt, liveStartedAt);
  if (source.workerVersionId !== first.upload.workerVersionId
    || source.bridgeSourceCommit !== state.sourceCommit
    || source.sourceDigest !== first.upload.sourceDigest
    || source.ptrDatabaseIdentity !== config.ptrDatabaseIdentity
    || timestamp(source.inspectedAt) < sourceStartedAt.getTime()
    || timestamp(source.oldestObservedAt) > timestamp(source.inspectedAt)
    || timestamp(source.inspectedAt) > liveStartedAt.getTime()) fail('OBSERVATION_INVALID');
  const live = await state.inspectLive({
    expected: Object.freeze({ workerVersionId: first.upload.workerVersionId,
      bridgeSourceCommit: state.sourceCommit }), now: liveStartedAt,
    accountId: config.accountId, zoneId: config.zoneId,
    apiToken: config.apiToken, adminToken: config.adminToken, fetchImpl: state.fetchImpl,
  });
  const reopened = await read();
  const completed = now();
  if (reopened.snapshot !== first.snapshot) fail('AUTHORITY_DRIFT');
  fresh(source.oldestObservedAt, completed);
  fresh(live.oldestObservedAt, completed);
  if (!UUID.test(live.deploymentId ?? '')
    || live.workerVersionId !== first.upload.workerVersionId
    || live.bridgeSourceCommit !== state.sourceCommit
    || live.ptrDatabaseIdentity !== config.ptrDatabaseIdentity
    || timestamp(live.inspectedAt) < liveStartedAt.getTime()
    || timestamp(live.inspectedAt) > completed.getTime()
    || timestamp(live.oldestObservedAt) > timestamp(live.inspectedAt)
    || ['ptrBindingDigest', 'controlPlaneAttestationDigest', 'publicAttestationDigest',
      'privateAttestationDigest', 'ptrBindingAttestationDigest'].some(key => !HASH.test(live[key] ?? ''))
    || live.publicAttestationDigest !== first.receipt.liveAttestationDigest
    || canonicalAuthBridgeReleaseAttestationDigest(live.liveAttestation)
      !== first.receipt.liveAttestationDigest) fail('OBSERVATION_INVALID');
  const observedAt = source.oldestObservedAt < live.oldestObservedAt
    ? source.oldestObservedAt : live.oldestObservedAt;
  const observation = Object.freeze({});
  observations.set(observation, Object.freeze({ provider: value.provider,
    sourceDigest: first.upload.sourceDigest, uploadRecordDigest: first.upload.uploadRecordDigest,
    preparedReceiptDigest: value.preparedReceiptDigest, journalHeadDigest: value.journalHeadDigest,
    expiresAt: first.receipt.expiresAt, completedAt: completed.toISOString(),
    deployment: Object.freeze({ deploymentId: live.deploymentId, workerVersionId: live.workerVersionId,
      bridgeSourceCommit: live.bridgeSourceCommit, controlPlaneAttestationDigest: live.controlPlaneAttestationDigest,
      publicAttestationDigest: live.publicAttestationDigest, privateAttestationDigest: live.privateAttestationDigest,
      observedAt }),
    binding: Object.freeze({ ptrDatabaseIdentity: live.ptrDatabaseIdentity, ptrBindingDigest: live.ptrBindingDigest,
      ptrBindingAttestationDigest: live.ptrBindingAttestationDigest, observedAt }),
  }));
  return observation;
}

/** Consume both projections together; fabricated or reused observations fail. */
export function consumeSealedRealmsProductionBridgeObservation(options) {
  const value = input(options, ['provider', 'observation', 'preparedReceiptDigest', 'journalHeadDigest', 'now']);
  const observed = observations.get(value.observation);
  const owner = providers.get(value.provider);
  if (owner?.testing && process.env.NODE_ENV !== 'test') fail('TEST_ONLY_FORBIDDEN');
  if (observed === undefined || owner === undefined || observed.provider !== value.provider
    || observed.preparedReceiptDigest !== value.preparedReceiptDigest
    || observed.journalHeadDigest !== value.journalHeadDigest) fail('OBSERVATION_INVALID');
  if (!(value.now instanceof Date) || !Number.isFinite(value.now.getTime())
    || value.now.getTime() < timestamp(observed.completedAt)
    || value.now.getTime() >= timestamp(observed.expiresAt)) fail('OBSERVATION_STALE');
  fresh(observed.deployment.observedAt, value.now);
  fresh(observed.binding.observedAt, value.now);
  const actualNow = owner.now();
  if (!(actualNow instanceof Date) || !Number.isFinite(actualNow.getTime())
    || actualNow.getTime() < value.now.getTime()
    || actualNow.getTime() >= timestamp(observed.expiresAt)) fail('OBSERVATION_STALE');
  fresh(observed.deployment.observedAt, actualNow);
  fresh(observed.binding.observedAt, actualNow);
  observations.delete(value.observation);
  return Object.freeze({ deployment: observed.deployment, binding: observed.binding });
}
