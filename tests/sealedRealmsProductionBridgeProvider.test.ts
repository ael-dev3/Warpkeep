// @vitest-environment node

import { chmodSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { sealedRealmsPrivateBase } from './helpers/sealedRealmsPrivateRoots';
import { createSealedRealmsProductionPrivateState, SEALED_REALMS_PRIVATE_STATE_VERSION } from '../scripts/sealed-realms-production-private-state.mjs';
import { authenticateSealedRealmsProductionSourceAuthority } from '../scripts/sealed-realms-production-source-authority.mjs';
import {
  createSealedRealmsProductionAuthBridgeState,
  createSealedRealmsProductionAuthBridgeStateTestCapability,
} from '../scripts/sealed-realms-production-auth-bridge-state.mjs';
import {
  assertSealedRealmsProductionBridgeProvider,
  consumeSealedRealmsProductionBridgeObservation,
  createSealedRealmsProductionBridgeProvider,
  createSealedRealmsProductionBridgeProviderTestCapability,
  inspectSealedRealmsProductionBridgeProvider,
} from '../scripts/sealed-realms-production-bridge-provider.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  canonicalAuthBridgeNotificationPreparedReceiptPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  parseAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
  authBridgeNotificationPreparedVersionContract,
} from '../scripts/auth-bridge-notification-prepared-deploy-adapter.mjs';
import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL, DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
} from '../scripts/auth-bridge-config-attestation.mjs';

const SOURCE = 'a'.repeat(40);
const VERSION = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT = '223e4567-e89b-42d3-a456-426614174000';
const PTR = '9'.repeat(64);
const ACCOUNT = 'b'.repeat(32);
const ZONE = 'c'.repeat(32);
const NOW = new Date('2026-09-12T10:00:00.000Z');
const SOURCE_DIGEST = '5f0b19aa2b2912605b073d6f36e76a2f4f1f7b24aa39b1632d002307bece37ee';
const API_TOKEN = 'cloudflare-bridge-provider-test-token';
const ADMIN_TOKEN = 'private-bridge-provider-test-token';
const liveAttestation = {
  schemaVersion: 1 as const, profile: 'warpkeep-admission-notification-bridge-v1' as const,
  bridgeSourceCommit: SOURCE, notificationDeliveryEnabled: false,
  notificationTransportConfigured: true as const, admissionNotificationStoreConfigured: true as const,
  notificationClientCount: 1 as const,
  notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  publicAuthEnabled: true, accessExpectedFidRequired: false,
};
const cleanups: Array<() => void> = [];

function authority(source = SOURCE) {
  return authenticateSealedRealmsProductionSourceAuthority({
    operation: 'activation-evidence-inspect', workflowInputSha: source,
    readGit: args => {
      if (args[0] !== 'rev-parse') throw new Error('Unexpected Git request');
      return `${source}\n`;
    },
    readBinding: () => ({ schemaVersion: 1, profile: 'warpkeep-0.4.0-sealed-launch-v1',
      pagesDeploymentApproved: false, preparationSourceCommit: null }),
    verifyEvidence: verifiedSha => ({ verifiedSha }),
  });
}

function environment() {
  return {
    WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID: ACCOUNT, WARPKEEP_AUTH_BRIDGE_ZONE_ID: ZONE,
    WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN: API_TOKEN,
    WARPKEEP_PRODUCTION_ADMIN_TOKEN: ADMIN_TOKEN,
    WARPKEEP_PTR_SPACETIMEDB_DATABASE: PTR,
  };
}

function fixture() {
  const temporaryRoot = realpathSync(tmpdir());
  const home = mkdtempSync(join(temporaryRoot, 'warpkeep-bridge-provider-'));
  cleanups.push(() => {
    // This test owns exactly the temporary directory it created.
    if (dirname(home) !== temporaryRoot || !home.startsWith(join(temporaryRoot, 'warpkeep-bridge-provider-'))) {
      throw new Error('Unexpected fixture cleanup path');
    }
    rmSync(home, { recursive: true, force: true });
  });
  for (const suffix of ['audit/private', 'runtime', 'cache']) {
    const path = join(sealedRealmsPrivateBase(home), suffix);
    mkdirSync(path, { recursive: true, mode: 0o700 }); chmodSync(path, 0o700);
  }
  const privateState = createSealedRealmsProductionPrivateState({ reportedHome: home,
    testOnlyOwnerUid: statSync(home).uid, testOnlyFsync: () => {}, testOnlyAllowPlatformMode: true });
  const receipt = parseAuthBridgeNotificationPreparedReceipt({
    schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: SOURCE,
    notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    notificationClientCount: 1, notificationDeliveryEnabled: false,
    notificationTransportConfigured: true, admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false, accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false, pagesPresentationEnabled: false,
    liveAttestationDigest: canonicalAuthBridgeReleaseAttestationDigest(liveAttestation),
    preparedAt: '2026-09-12T09:00:00.000Z', expiresAt: '2026-09-12T11:00:00.000Z',
  });
  const f = {
    home, privateState, authority: authority(), repositoryRoot: realpathSync(process.cwd()),
    at: NOW.getTime(), now: () => new Date(f.at), receipt,
    receiptDigest: canonicalAuthBridgeNotificationPreparedReceiptPublication(receipt).receiptDigest,
    journal: { journalHeadDigest: '3'.repeat(64),
      profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3', outcome: 'verified',
      predecessorDigest: null, runId: '42', runAttempt: 1,
      completedAt: '2026-09-12T09:00:00.000Z', sourceCommit: SOURCE, workerVersionId: VERSION },
    upload: { sourceCommit: SOURCE, workerVersionId: VERSION, sourceDigest: SOURCE_DIGEST,
      uploadRecordDigest: '4'.repeat(64), completedJournalHeadDigest: '3'.repeat(64), journalHeadDigest: '3'.repeat(64) },
    source: { workerVersionId: VERSION, bridgeSourceCommit: SOURCE, sourceDigest: SOURCE_DIGEST,
      ptrDatabaseIdentity: PTR, oldestObservedAt: NOW.toISOString(), inspectedAt: NOW.toISOString() },
    live: { deploymentId: DEPLOYMENT, workerVersionId: VERSION, bridgeSourceCommit: SOURCE,
      ptrDatabaseIdentity: PTR, ptrBindingDigest: '5'.repeat(64),
      controlPlaneAttestationDigest: '6'.repeat(64),
      publicAttestationDigest: receipt.liveAttestationDigest, privateAttestationDigest: '7'.repeat(64),
      ptrBindingAttestationDigest: '8'.repeat(64), liveAttestation: { ...liveAttestation },
      oldestObservedAt: NOW.toISOString(), inspectedAt: NOW.toISOString() },
  };
  const resolveReceipt = vi.fn(async () => ({ receipt: structuredClone(f.receipt), receiptDigest: f.receiptDigest }));
  const resolveJournal = vi.fn(async () => structuredClone(f.journal));
  const resolveUpload = vi.fn(async () => structuredClone(f.upload));
  const inspectSource = vi.fn(async () => structuredClone(f.source));
  const inspectLive = vi.fn(async () => structuredClone(f.live));
  const fetchImpl = vi.fn<typeof fetch>(async () => { throw new Error('Unexpected network request'); });
  const required = { authority: f.authority, privateState, repositoryRoot: f.repositoryRoot, fetchImpl };
  const options = () => ({ ...required,
    testOnlyCapability: createSealedRealmsProductionBridgeProviderTestCapability(),
    testOnlyEnvironment: environment(), testOnlyNow: f.now,
    testOnlyResolveReceipt: resolveReceipt, testOnlyResolveJournal: resolveJournal,
    testOnlyResolveUpload: resolveUpload, testOnlyInspectSource: inspectSource, testOnlyInspectLive: inspectLive });
  const provider = (overrides: Record<string, unknown> = {}) =>
    createSealedRealmsProductionBridgeProvider({ ...options(), ...overrides } as never);
  const unavailable = vi.fn(() => { throw new Error('Unrelated adapter must not run'); });
  const bridgeOptions = (bridgeProvider: ReturnType<typeof provider>) => ({ ...required, bridgeProvider,
    inspectImportReceipt: unavailable, authenticateImportResult: unavailable, resolveOwnerProvisionReceipt: unavailable,
    now: f.now, testOnlyCapability: createSealedRealmsProductionAuthBridgeStateTestCapability(),
    testOnlyResolvePreparedReceipt: resolveReceipt, testOnlyResolveCompletedJournal: resolveJournal });
  return Object.assign(f, { required, options, provider, bridgeOptions, unavailable,
    resolveReceipt, resolveJournal, resolveUpload, inspectSource, inspectLive, fetchImpl });
}
type Fixture = ReturnType<typeof fixture>;
type Provider = ReturnType<typeof createSealedRealmsProductionBridgeProvider>;
const inspect = (f: Fixture, provider: Provider) => inspectSealedRealmsProductionBridgeProvider({
  provider, preparedReceiptDigest: f.receiptDigest, journalHeadDigest: f.journal.journalHeadDigest,
});
const consume = (f: Fixture, provider: Provider, observation: Awaited<ReturnType<typeof inspect>>) =>
  consumeSealedRealmsProductionBridgeObservation({ provider, observation,
    preparedReceiptDigest: f.receiptDigest, journalHeadDigest: f.journal.journalHeadDigest, now: f.now() });

/** Real source/control-plane/public/private HTTP parsers; only transport is synthetic. */
function httpFixture(f: Fixture) {
  const contract = authBridgeNotificationPreparedVersionContract({ accountId: ACCOUNT, zoneId: ZONE,
    sourceCommit: SOURCE, sourceDigest: SOURCE_DIGEST,
    beforeModes: { bridgeSourceCommit: AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT,
      publicAuthEnabled: true, accessExpectedFidRequired: false },
  }) as unknown as { variables: Record<string, string>; secretBindingNames: string[] };
  const namespaces = [
    ['ADMISSION_NOTIFICATIONS', 'AdmissionNotification', '01d53045d07a4f79ab21646de395d82c'],
    ['AUTH_RATE_LIMITER', 'AuthRateLimiter', 'd800d603256f4a0f9907ba0b9267bc89'],
    ['CHALLENGE_REPLAY_GUARD', 'ChallengeReplayGuard', 'bbda3461bd4c4caf91478705d65374fc'],
    ['QA_CHALLENGE_REPLAY_GUARD', 'QaChallengeReplayGuard', '28d55581e3124399b8cfbc2bd4019bef'],
    ['SESSION_FAMILIES', 'SessionFamily', 'b4525a7a374743deb3666471fe2ae06c'],
  ];
  const named = ['AdmissionNotification', 'AuthRateLimiter', 'ChallengeReplayGuard',
    'DurableObjectAdmissionNotificationStore', 'DurableObjectChallengeStore',
    'DurableObjectQaObserverChallengeStore', 'DurableObjectSessionFamilyStore',
    'MemoryChallengeStore', 'MemoryQaObserverChallengeStore', 'MemorySessionFamilyStore',
    'MiniAppWebhookInvalidError', 'MiniAppWebhookVerifierUnavailableError',
    'QaChallengeReplayGuard', 'SessionFamily', 'SpacetimeHttpAccessRequestResolver',
    'SpacetimeHttpAuthEpochResolver', 'SpacetimeHttpQaObserverResolver',
    'admissionNotificationDeliveryContractDigest', 'admissionNotificationDeliveryContractVector',
    'createAuthBridge', 'createMiniAppWebhookVerifier', 'serializeAdmissionNotificationDeliveryContract',
    'ReleaseRecoveryObservationEntrypoint'];
  const bindings = [
    { name: 'CF_VERSION_METADATA', type: 'version_metadata' },
    ...Object.entries(contract.variables).map(([name, text]) => ({ name, type: 'plain_text', text })),
    { name: 'PTR_SPACETIMEDB_DATABASE', type: 'plain_text', text: PTR },
    ...contract.secretBindingNames.map(name => ({ name, type: 'secret_text' })),
    ...namespaces.map(([name, class_name, namespace_id]) => ({ name, type: 'durable_object_namespace', class_name, namespace_id })),
  ];
  const version = { id: VERSION, number: 2,
    annotations: { 'workers/message': `Warpkeep notification preparation ${SOURCE}`,
      'workers/tag': `notification-prepared-${SOURCE}`, 'workers/triggered_by': 'version_upload' },
    metadata: { author_email: '', author_id: 'e'.repeat(32), created_on: '2026-09-11T09:00:00.000Z', has_preview: false, source: 'api' },
    resources: { bindings,
      script: { etag: 'f'.repeat(64), handlers: ['fetch'], last_deployed_from: 'api',
        named_handlers: named.map(name => ({ name, handlers: ['class'] })) },
      script_runtime: { compatibility_date: '2026-07-11', compatibility_flags: ['nodejs_compat'],
        migration_tag: 'v5', usage_model: 'standard' } },
  };
  const primary = farcasterRpcEndpointFingerprint(DEFAULT_FARCASTER_RPC_PRIMARY_URL);
  const secondary = farcasterRpcEndpointFingerprint(DEFAULT_FARCASTER_RPC_SECONDARY_URL);
  const privateBody = {
    profile: 'warpkeep-auth-v2', digest: 'e'.repeat(64),
    farcasterRpcEndpointFingerprints: [primary, secondary].sort(),
    farcasterRpcEndpointRoleFingerprints: { primary, secondary },
    miniAppHubEndpointFingerprints: ['1'.repeat(64), '2'.repeat(64)], signingPublicKeyThumbprint: 'A'.repeat(43),
    quickAuthIssuer: 'https://auth.farcaster.xyz', quickAuthDomain: 'warpkeep.com', quickAuthBrowserOrigin: 'https://warpkeep.com',
    quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange', quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
    quickAuthMaxTokenBytes: 8192, quickAuthMaxIssuerLifetimeSeconds: 3600,
    accessRequestStatusPath: '/v2/access/status', accessRequestSubmitPath: '/v2/access/request',
    accessRequestResolverTokenTtlSeconds: 15, accessRequestResolverTimeoutMilliseconds: 5000,
    accessRequestStatusProcedure: 'access_request_get_status_v1', accessRequestSubmitProcedure: 'access_request_submit_v1',
    approvalNotificationsEnabled: false, miniAppNotificationClientFids: [9152], miniAppWebhookPath: '/v1/farcaster/miniapp/webhook',
    admissionNotificationPath: '/v1/admin/admission-notification', admissionNotificationRecoveryPath: '/v1/admin/admission-notification-recovery',
    admissionNotificationStatusPath: '/v1/admin/admission-notification-status', publicAuthEnabled: true, accessExpectedFidRequired: false,
    ptrEnabled: true, ptrSpacetimeDbDatabase: PTR, ptrAudience: 'warpkeep-ptr-spacetimedb',
    qaObserverEnabled: false, qaObserverSpacetimeDbUri: null, qaObserverSpacetimeDbDatabase: null,
    qaObserverAudience: null, qaObserverKeyFingerprint: null, qaObserverKeyRegisteredAt: null, qaObserverKeyExpiresAt: null,
    qaObserverMaxRegistrationLifetimeMilliseconds: 366 * 24 * 60 * 60 * 1000,
  };
  const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers`;
  const worker = `${base}/scripts/warpkeep-auth-bridge`;
  const records = new Map<string, unknown>([
    [`${base}/scripts`, [{ id: 'warpkeep-auth-bridge', migration_tag: 'v5', cache_options: { enabled: false } }]],
    [`${base}/domains?service=warpkeep-auth-bridge`, [{ id: 'domain', zone_id: ZONE, zone_name: 'warpkeep.com',
      hostname: 'auth.warpkeep.com', service: 'warpkeep-auth-bridge', environment: 'production',
      cert_id: 'certificate', enabled: true, previews_enabled: false }]],
    [`${worker}/subdomain`, { enabled: false, previews_enabled: false }],
    [`${base}/services/warpkeep-auth-bridge/environments/production/routes?show_zonename=true`, []],
    [`${worker}/script-settings`, { logpush: false, observability: { enabled: false } }],
    [`${worker}/versions/${VERSION}`, version],
    [`${worker}/deployments`, [{ id: DEPLOYMENT, strategy: 'percentage', versions: [{ version_id: VERSION, percentage: 100 }] }]],
    [`${worker}/versions?deployable=true&page=1&per_page=100`, { items: [{ id: VERSION }] }],
    [`${worker}/versions?page=1&per_page=1`, { items: [{ id: VERSION }] }],
  ]);
  const state = { module: 'export default { fetch() { return new Response("ready") } };\n', privateBody, records, version };
  vi.spyOn(performance, 'now').mockReturnValue(0);
  const fetchImpl = vi.fn<typeof fetch>(async (request, init) => {
    const url = String(request);
    const headers: Record<string, string> = { 'content-type': 'application/json', date: f.now().toUTCString(), 'cache-control': 'no-store' };
    let body: string;
    if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
      expect(init?.method).toBe('GET'); expect(new Headers(init?.headers).has('authorization')).toBe(false);
      Object.assign(headers, {
        'content-type': 'application/json; charset=utf-8',
        'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
        'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
        'referrer-policy': 'no-referrer', 'strict-transport-security': 'max-age=31536000; includeSubDomains',
        'cross-origin-opener-policy': 'same-origin', 'cross-origin-resource-policy': 'same-site',
        'x-content-type-options': 'nosniff', 'x-frame-options': 'DENY', 'x-permitted-cross-domain-policies': 'none',
      });
      body = JSON.stringify(liveAttestation);
    } else if (url === 'https://auth.warpkeep.com/v1/admin/config-attestation') {
      expect(init?.method).toBe('POST'); expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`);
      body = JSON.stringify(state.privateBody);
    } else {
      expect(init?.method).toBe('GET'); expect(init?.body).toBeUndefined();
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${API_TOKEN}`);
      if (url === `${worker}/content/v2?version=${VERSION}`) {
        headers['content-type'] = 'multipart/form-data; boundary=provider-fixture'; headers['cf-entrypoint'] = 'index.js';
        body = '--provider-fixture\r\nContent-Disposition: form-data; name="index.js"; filename="index.js"\r\n'
          + `Content-Type: application/javascript+module\r\n\r\n${state.module}\r\n--provider-fixture--\r\n`;
      } else {
        if (!records.has(url)) throw new Error(`Unexpected HTTP request: ${url}`);
        body = JSON.stringify({ success: true, errors: [], messages: [], result: records.get(url),
          ...(url.includes('/domains?') ? { result_info: { count: 1 } } : {}) });
      }
    }
    const response = new Response(body, { status: 200, headers });
    Object.defineProperty(response, 'url', { value: url }); return response;
  });
  const options = f.options();
  const { testOnlyInspectSource: _source, testOnlyInspectLive: _live, ...realInspectors } = options;
  return { state, fetchImpl, provider: createSealedRealmsProductionBridgeProvider({ ...realInspectors, fetchImpl } as never) };
}

afterEach(() => {
  vi.restoreAllMocks(); vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

describe('sealed bridge shared observation authority', () => {
  it('captures credentials privately and consumes both projections from one verified observation', async () => {
    const f = fixture(); const supplied = f.options();
    const provider = createSealedRealmsProductionBridgeProvider(supplied as never);
    expect(supplied.testOnlyEnvironment).not.toHaveProperty('WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN');
    expect(supplied.testOnlyEnvironment).not.toHaveProperty('WARPKEEP_PRODUCTION_ADMIN_TOKEN');
    f.source.oldestObservedAt = '2026-09-12T09:59:30.000Z';
    const observation = await inspect(f, provider);
    expect(Object.isFrozen(provider)).toBe(true); expect(Object.isFrozen(observation)).toBe(true);
    expect(Reflect.ownKeys(provider)).toEqual([]); expect(Reflect.ownKeys(observation)).toEqual([]);
    const result = consume(f, provider, observation);
    expect(result.deployment).toMatchObject({ deploymentId: DEPLOYMENT, workerVersionId: VERSION,
      bridgeSourceCommit: SOURCE, publicAttestationDigest: f.receipt.liveAttestationDigest,
      observedAt: f.source.oldestObservedAt });
    expect(result.binding).toMatchObject({ ptrDatabaseIdentity: PTR, ptrBindingDigest: f.live.ptrBindingDigest,
      observedAt: f.source.oldestObservedAt });
    expect(f.inspectSource).toHaveBeenCalledOnce(); expect(f.inspectLive).toHaveBeenCalledOnce();
    expect(f.resolveReceipt).toHaveBeenCalledTimes(2); expect(f.resolveJournal).toHaveBeenCalledTimes(2);
    expect(f.resolveUpload).toHaveBeenCalledTimes(2);
    const request = f.inspectSource.mock.calls[0] as unknown as [Record<string, unknown>];
    expect(request[0]).toMatchObject({ workerVersionId: VERSION, ptrSpacetimeDbDatabase: PTR,
      contract: { sourceCommit: SOURCE, sourceDigest: SOURCE_DIGEST } });
    expect(JSON.stringify(result)).not.toContain('token');
    expect(() => consume(f, provider, observation)).toThrow('OBSERVATION_INVALID');
  });

  it.each(['authority', 'privateState', 'repositoryRoot', 'fabrication'] as const)(
    'rejects a provider attached to a different %s', kind => {
      const f = fixture(); const other = fixture(); const provider = f.provider();
      expect(() => assertSealedRealmsProductionBridgeProvider(
        kind === 'fabrication' ? Object.freeze({}) : provider,
        kind === 'authority' ? authority() : f.authority,
        kind === 'privateState' ? other.privateState : f.privateState,
        kind === 'repositoryRoot' ? other.home : f.repositoryRoot,
      )).toThrow('AUTHORITY_INVALID');
      expect(f.inspectSource).not.toHaveBeenCalled();
    },
  );

  it('rejects forged observations, a different provider, and substituted authority coordinates', async () => {
    const f = fixture(); const provider = f.provider(); const observation = await inspect(f, provider);
    expect(() => consume(f, provider, {} as never)).toThrow('OBSERVATION_INVALID');
    expect(() => consume(f, f.provider(), observation)).toThrow('OBSERVATION_INVALID');
    expect(() => consumeSealedRealmsProductionBridgeObservation({ provider, observation,
      preparedReceiptDigest: 'f'.repeat(64), journalHeadDigest: f.journal.journalHeadDigest, now: f.now(),
    })).toThrow('OBSERVATION_INVALID');
    expect(consume(f, provider, observation).binding.ptrDatabaseIdentity).toBe(PTR);
  });

  it.each(['authority', 'privateState'] as const)('requires the genuine %s capability at construction', key => {
    const f = fixture();
    expect(() => f.provider({ [key]: Object.freeze({}) })).toThrow();
    expect(f.resolveReceipt).not.toHaveBeenCalled(); expect(f.inspectSource).not.toHaveBeenCalled();
  });

  it('cannot attach the provider to another state owner or combine it with independent callbacks', () => {
    const f = fixture(); const other = fixture(); const provider = f.provider();
    expect(() => createSealedRealmsProductionAuthBridgeState({ ...f.bridgeOptions(provider),
      privateState: other.privateState } as never)).toThrow('AUTHORITY_INVALID');
    expect(() => createSealedRealmsProductionAuthBridgeState({ ...f.bridgeOptions(provider),
      deploymentAttester: f.inspectLive, bindingAttester: f.inspectLive } as never)).toThrow('STATE_INPUT_INVALID');
    expect(f.inspectLive).not.toHaveBeenCalled();
    expect(other.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
  });

  it('rejects production callback injection even with a test capability minted earlier', () => {
    const f = fixture(); const options = f.options();
    const stateCapability = createSealedRealmsProductionAuthBridgeStateTestCapability();
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => createSealedRealmsProductionBridgeProvider(options as never)).toThrow('TEST_ONLY_FORBIDDEN');
    expect(() => createSealedRealmsProductionBridgeProviderTestCapability()).toThrow('TEST_ONLY_FORBIDDEN');
    const independent = { ...f.required, deploymentAttester: f.inspectLive, bindingAttester: f.inspectLive,
      inspectImportReceipt: f.unavailable, authenticateImportResult: f.unavailable,
      resolveOwnerProvisionReceipt: f.unavailable };
    expect(() => createSealedRealmsProductionAuthBridgeState(independent as never)).toThrow('TEST_ONLY_CAPABILITY_INVALID');
    expect(() => createSealedRealmsProductionAuthBridgeState({ ...independent,
      testOnlyCapability: stateCapability } as never)).toThrow('TEST_ONLY_CAPABILITY_INVALID');
    expect(f.inspectLive).not.toHaveBeenCalled();
  });

  it('rejects extra fields and accessor/proxy input without evaluating them', () => {
    const f = fixture(); const getter = vi.fn(() => f.authority);
    const options = f.options();
    Object.defineProperty(options, 'authority', { enumerable: true, get: getter });
    expect(() => createSealedRealmsProductionBridgeProvider(options as never)).toThrow('INPUT_INVALID');
    expect(getter).not.toHaveBeenCalled();
    expect(() => f.provider({ deploymentAttester: f.inspectLive })).toThrow('INPUT_INVALID');
    expect(() => createSealedRealmsProductionBridgeProvider(new Proxy(f.options(), {}) as never)).toThrow('INPUT_INVALID');
  });

  it('allows unused construction without credentials but rejects inspection of its captured missing configuration', async () => {
    const f = fixture(); const captured: NodeJS.ProcessEnv = {};
    const provider = f.provider({ testOnlyEnvironment: captured });
    expect(assertSealedRealmsProductionBridgeProvider(provider, f.authority, f.privateState, f.repositoryRoot)).toBe(provider);
    Object.assign(captured, environment());
    await expect(inspect(f, provider)).rejects.toThrow('CONFIGURATION_INVALID');
    expect(f.resolveReceipt).not.toHaveBeenCalled(); expect(f.inspectSource).not.toHaveBeenCalled();
  });

  it('uses the captured valid configuration despite later environment mutation', async () => {
    const f = fixture(); const captured = environment(); const provider = f.provider({ testOnlyEnvironment: captured });
    captured.WARPKEEP_PTR_SPACETIMEDB_DATABASE = 'f'.repeat(64);
    captured.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID = 'e'.repeat(32);
    captured.WARPKEEP_AUTH_BRIDGE_CLOUDFLARE_API_TOKEN = 'replacement-cloudflare-test-token';
    consume(f, provider, await inspect(f, provider));
    expect(f.inspectSource).toHaveBeenCalledWith(expect.objectContaining({ ptrSpacetimeDbDatabase: PTR, apiToken: API_TOKEN,
      contract: expect.objectContaining({ accountId: ACCOUNT }) }));
  });

  it.each(['missing token', 'same tokens', 'GitHub token reused', 'G001 PTR', 'invalid account'])(
    'rejects captured invalid configuration at first use: %s', async kind => {
      const f = fixture(); const config: NodeJS.ProcessEnv = environment();
      if (kind === 'missing token') delete config.WARPKEEP_PRODUCTION_ADMIN_TOKEN;
      if (kind === 'same tokens') config.WARPKEEP_PRODUCTION_ADMIN_TOKEN = API_TOKEN;
      if (kind === 'GitHub token reused') config.GITHUB_TOKEN = API_TOKEN;
      if (kind === 'G001 PTR') config.WARPKEEP_PTR_SPACETIMEDB_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
      if (kind === 'invalid account') config.WARPKEEP_AUTH_BRIDGE_ACCOUNT_ID = 'invalid';
      const provider = f.provider({ testOnlyEnvironment: config });
      await expect(inspect(f, provider)).rejects.toThrow('CONFIGURATION_INVALID');
      expect(f.resolveReceipt).not.toHaveBeenCalled(); expect(f.fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('forbids retaining a test provider or observation after leaving the test process mode', async () => {
    const f = fixture(); const provider = f.provider(); const observation = await inspect(f, provider);
    vi.stubEnv('NODE_ENV', 'production');
    expect(() => assertSealedRealmsProductionBridgeProvider(provider, f.authority, f.privateState, f.repositoryRoot)).toThrow('TEST_ONLY_FORBIDDEN');
    await expect(inspect(f, provider)).rejects.toThrow('TEST_ONLY_FORBIDDEN');
    expect(() => consume(f, provider, observation)).toThrow('TEST_ONLY_FORBIDDEN');
  });

  it.each([
    ['receipt source', (f: Fixture) => { f.receipt = { ...f.receipt, bridgeSourceCommit: 'b'.repeat(40) }; }],
    ['receipt digest', (f: Fixture) => { f.receiptDigest = 'b'.repeat(64); }],
    ['receipt expiry', (f: Fixture) => { f.receipt = { ...f.receipt, expiresAt: NOW.toISOString() }; }],
    ['journal source', (f: Fixture) => { f.journal.sourceCommit = 'b'.repeat(40); }],
    ['journal version', (f: Fixture) => { f.journal.workerVersionId = DEPLOYMENT; }],
    ['upload source', (f: Fixture) => { f.upload.sourceCommit = 'b'.repeat(40); }],
    ['upload version', (f: Fixture) => { f.upload.workerVersionId = DEPLOYMENT; }],
    ['upload head', (f: Fixture) => { f.upload.journalHeadDigest = 'b'.repeat(64); }],
    ['upload digest', (f: Fixture) => { f.upload.sourceDigest = 'invalid'; }],
    ['upload record', (f: Fixture) => { f.upload.uploadRecordDigest = 'invalid'; }],
  ] as const)('rejects %s before any remote observation', async (_name, mutate) => {
    const f = fixture(); const provider = f.provider(); mutate(f);
    await expect(inspect(f, provider)).rejects.toThrow();
    expect(f.inspectSource).not.toHaveBeenCalled(); expect(f.inspectLive).not.toHaveBeenCalled();
  });

  it.each([
    ['source digest', (f: Fixture) => { f.source.sourceDigest = 'b'.repeat(64); }],
    ['source version', (f: Fixture) => { f.source.workerVersionId = DEPLOYMENT; }],
    ['source commit', (f: Fixture) => { f.source.bridgeSourceCommit = 'b'.repeat(40); }],
    ['source PTR', (f: Fixture) => { f.source.ptrDatabaseIdentity = 'b'.repeat(64); }],
    ['live version', (f: Fixture) => { f.live.workerVersionId = DEPLOYMENT; }],
    ['live source', (f: Fixture) => { f.live.bridgeSourceCommit = 'b'.repeat(40); }],
    ['live PTR', (f: Fixture) => { f.live.ptrDatabaseIdentity = 'b'.repeat(64); }],
    ['live deployment', (f: Fixture) => { f.live.deploymentId = 'invalid'; }],
    ['live binding digest', (f: Fixture) => { f.live.ptrBindingDigest = 'invalid'; }],
    ['public digest', (f: Fixture) => { f.live.publicAttestationDigest = 'b'.repeat(64); }],
    ['canonical public body', (f: Fixture) => { f.live.liveAttestation.publicAuthEnabled = false; }],
  ] as const)('rejects a mismatched %s without yielding authority', async (_name, mutate) => {
    const f = fixture(); const provider = f.provider(); mutate(f);
    await expect(inspect(f, provider)).rejects.toThrow('OBSERVATION_INVALID');
    expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
  });

  it.each(['receipt', 'journal', 'upload'] as const)('reopens %s after asynchronous network work', async kind => {
    const f = fixture(); let resume!: () => void; let entered!: () => void;
    const ready = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { resume = resolve; });
    f.inspectLive.mockImplementationOnce(async () => { entered(); await gate; return structuredClone(f.live); });
    const pending = inspect(f, f.provider()); await ready;
    if (kind === 'receipt') {
      f.receipt = { ...f.receipt, expiresAt: '2026-09-12T10:45:00.000Z' };
      f.receiptDigest = canonicalAuthBridgeNotificationPreparedReceiptPublication(f.receipt).receiptDigest;
    } else if (kind === 'journal') f.journal.runId = '43';
    else f.upload.uploadRecordDigest = 'f'.repeat(64);
    resume(); await expect(pending).rejects.toThrow('AUTHORITY_DRIFT');
  });

  it.each(['source stale', 'live stale', 'source future', 'live future',
    'source completion future', 'live completion future', 'live completion malformed',
    'source completion before observation', 'live completion before observation'])(
    'rejects invalid chronology: %s', async kind => {
      const f = fixture(); const provider = f.provider();
      const proof = kind.startsWith('source') ? f.source : f.live;
      if (kind.endsWith(' stale')) proof.oldestObservedAt = new Date(NOW.getTime() - 300_000).toISOString();
      else if (kind.endsWith(' completion malformed')) proof.inspectedAt = 'invalid';
      else if (kind.endsWith(' completion before observation')) {
        proof.inspectedAt = new Date(NOW.getTime() - 1).toISOString();
      } else if (kind.endsWith(' completion future')) proof.inspectedAt = new Date(NOW.getTime() + 1).toISOString();
      else proof.oldestObservedAt = new Date(NOW.getTime() + 1).toISOString();
      await expect(inspect(f, provider)).rejects.toThrow();
    },
  );

  it('rejects source evidence that expires while the live inspector is awaited', async () => {
    const f = fixture(); f.inspectLive.mockImplementationOnce(async () => {
      f.at += 300_000; return { ...f.live, oldestObservedAt: f.now().toISOString(), inspectedAt: f.now().toISOString() };
    });
    await expect(inspect(f, f.provider())).rejects.toThrow('OBSERVATION_STALE');
  });

  it('rejects a receipt that expires during observation without writing authority', async () => {
    const f = fixture();
    f.receipt = { ...f.receipt, expiresAt: new Date(NOW.getTime() + 1000).toISOString() };
    f.receiptDigest = canonicalAuthBridgeNotificationPreparedReceiptPublication(f.receipt).receiptDigest;
    f.inspectLive.mockImplementationOnce(async () => { f.at += 1000; return structuredClone(f.live); });
    const state = createSealedRealmsProductionAuthBridgeState(f.bridgeOptions(f.provider()) as never);
    await expect(state.establish()).rejects.toThrow('ATTESTATION_INVALID');
    expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
  });

  it('rejects clock rollback across asynchronous source inspection', async () => {
    const f = fixture();
    f.inspectSource.mockImplementationOnce(async () => { f.at -= 1; return structuredClone(f.source); });
    await expect(inspect(f, f.provider())).rejects.toThrow('CLOCK_INVALID');
    expect(f.inspectLive).not.toHaveBeenCalled();
  });

  it.each(['caller clock back', 'owner clock advanced', 'receipt expired'])(
    'rechecks real owner time at consumption: %s', async kind => {
      const f = fixture(); const provider = f.provider(); const observation = await inspect(f, provider);
      const sampled = f.now();
      if (kind === 'caller clock back') sampled.setTime(sampled.getTime() - 1);
      else f.at += kind === 'receipt expired' ? 3_600_000 : 300_000;
      expect(() => consumeSealedRealmsProductionBridgeObservation({ provider, observation,
        preparedReceiptDigest: f.receiptDigest, journalHeadDigest: f.journal.journalHeadDigest, now: sampled,
      })).toThrow('OBSERVATION_STALE');
    },
  );

  it('creates the first durable authority from shared provider facts without a previous chain', async () => {
    const f = fixture(); const { provider, fetchImpl } = httpFixture(f);
    expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
    const state = createSealedRealmsProductionAuthBridgeState(f.bridgeOptions(provider) as never);
    await expect(state.establish()).resolves.toEqual({ ready: true });
    const names = f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' });
    expect(names).toHaveLength(1); expect(names[0]).toMatch(/^auth-bridge-import-authority-[a-f0-9]{64}\.jsonl$/);
    const bytes = readFileSync(join(sealedRealmsPrivateBase(f.home), 'runtime', SEALED_REALMS_PRIVATE_STATE_VERSION, 'bridge', names[0]));
    const record = JSON.parse(bytes.toString('utf8'));
    expect(record).toMatchObject({ recordType: 'deploymentAuthority', sourceCommit: SOURCE,
      previousRecordDigest: null, preparedReceiptDigest: f.receiptDigest,
      completedJournalHeadDigest: f.journal.journalHeadDigest, deploymentId: DEPLOYMENT,
      workerVersionId: VERSION, ptrDatabaseIdentity: PTR,
      publicAttestationDigest: f.receipt.liveAttestationDigest });
    expect(Buffer.from(record.preparedReceiptBodyBase64, 'base64').toString('utf8'))
      .toBe(`${JSON.stringify(f.receipt)}\n`);
    expect(f.unavailable).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes('/content/v2?'))).toBe(true);
    expect(fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/v1/admin/config-attestation'))).toBe(true);
    expect(f.inspectSource).not.toHaveBeenCalled(); expect(f.inspectLive).not.toHaveBeenCalled();
  });

  it.each([
    ['version metadata binding', 'VERSION_BINDING_MISMATCH'],
    ['recovery entrypoint', 'VERSION_EXPORT_MISMATCH'],
  ] as const)('rejects missing %s through the real HTTP parser before writing authority', async (kind, code) => {
    const f = fixture(); const http = httpFixture(f);
    if (kind === 'version metadata binding') {
      http.state.version.resources.bindings = http.state.version.resources.bindings
        .filter(binding => binding.name !== 'CF_VERSION_METADATA');
    } else {
      http.state.version.resources.script.named_handlers = http.state.version.resources.script.named_handlers
        .filter(handler => handler.name !== 'ReleaseRecoveryObservationEntrypoint');
    }
    // Assert the inner parser error so an unrelated fixture failure cannot satisfy this rejection.
    await expect(inspect(f, http.provider)).rejects.toThrow(code);
    const state = createSealedRealmsProductionAuthBridgeState(f.bridgeOptions(http.provider) as never);
    await expect(state.establish()).rejects.toThrow('ATTESTATION_INVALID');
    expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
    expect(http.fetchImpl.mock.calls.some(([url]) => String(url).endsWith('/v1/admin/config-attestation'))).toBe(false);
    expect(f.inspectSource).not.toHaveBeenCalled(); expect(f.inspectLive).not.toHaveBeenCalled();
    expect(f.unavailable).not.toHaveBeenCalled();
  });

  it.each(['uploaded bytes', 'private PTR'])(
    'does not write authority when actual HTTP inspection rejects changed %s', async kind => {
      const f = fixture(); const http = httpFixture(f);
      if (kind === 'uploaded bytes') http.state.module += '// unexpected executable source\n';
      else http.state.privateBody.ptrSpacetimeDbDatabase = 'f'.repeat(64);
      const state = createSealedRealmsProductionAuthBridgeState(f.bridgeOptions(http.provider) as never);
      await expect(state.establish()).rejects.toThrow('ATTESTATION_INVALID');
      expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
      expect(f.unavailable).not.toHaveBeenCalled();
    },
  );

  it.each(['provider reopen', 'state final reopen'])(
    'writes no first authority when drift occurs at %s', async boundary => {
      const f = fixture(); const provider = f.provider();
      if (boundary === 'provider reopen') f.inspectLive.mockImplementationOnce(async () => {
        f.upload.uploadRecordDigest = 'b'.repeat(64); return structuredClone(f.live);
      });
      else f.resolveJournal.mockImplementation(async () => {
        // State reads once; provider reads before+after; then state independently reopens.
        return { ...f.journal, runId: f.resolveJournal.mock.calls.length >= 4 ? '43' : '42' };
      });
      const state = createSealedRealmsProductionAuthBridgeState(f.bridgeOptions(provider) as never);
      await expect(state.establish()).rejects.toThrow();
      expect(f.privateState.list({ root: 'runtime', relativeDirectory: 'bridge' })).toEqual([]);
      expect(f.unavailable).not.toHaveBeenCalled();
    },
  );
});
