// @vitest-environment node

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
} from '../scripts/auth-bridge-config-attestation.mjs';
import {
  inspectAuthBridgeNotificationPreparedRecoveryAuthority,
} from '../scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  authenticateAuthBridgeNotificationPreparedReceiptForPublication,
  canonicalAuthBridgeReleaseAttestationDigest,
  fetchFreshAuthBridgeReleaseAttestation,
  parseAuthBridgeNotificationPreparedReceipt,
  verifyAuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';

const NOW = new Date('2026-08-13T00:00:00.900Z');
const SOURCE = 'c'.repeat(40);
const VERSION = '123e4567-e89b-42d3-a456-426614174000';
const DEPLOYMENT = '323e4567-e89b-42d3-a456-426614174000';
const PTR = '9'.repeat(64);
const ACCOUNT = 'a'.repeat(32);
const ZONE = 'b'.repeat(32);
const ADMIN_TOKEN = 'production-recovery-test-token-value';
const API_TOKEN = 'cloudflare-recovery-test-token-value';
const PRIVATE_URL = 'https://auth.warpkeep.com/v1/admin/config-attestation';
const API_BASE = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT}/workers/scripts/warpkeep-auth-bridge`;

const releaseHeaders = {
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
};

const live = Object.freeze({
  schemaVersion: 1 as const,
  profile: 'warpkeep-admission-notification-bridge-v1' as const,
  bridgeSourceCommit: SOURCE,
  notificationDeliveryEnabled: false,
  notificationTransportConfigured: true,
  admissionNotificationStoreConfigured: true,
  notificationClientCount: 1,
  notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  publicAuthEnabled: true,
  accessExpectedFidRequired: false,
});

function privateBody(prepared = true) {
  const primary = farcasterRpcEndpointFingerprint(DEFAULT_FARCASTER_RPC_PRIMARY_URL);
  const secondary = farcasterRpcEndpointFingerprint(DEFAULT_FARCASTER_RPC_SECONDARY_URL);
  return {
    profile: 'warpkeep-auth-v2', digest: 'e'.repeat(64),
    farcasterRpcEndpointFingerprints: [primary, secondary].sort(),
    farcasterRpcEndpointRoleFingerprints: { primary, secondary },
    miniAppHubEndpointFingerprints: ['1'.repeat(64), '2'.repeat(64)],
    signingPublicKeyThumbprint: 'A'.repeat(43),
    quickAuthIssuer: 'https://auth.farcaster.xyz', quickAuthDomain: 'warpkeep.com',
    quickAuthBrowserOrigin: 'https://warpkeep.com',
    quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange',
    quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
    quickAuthMaxTokenBytes: 8 * 1_024, quickAuthMaxIssuerLifetimeSeconds: 3_600,
    accessRequestStatusPath: '/v2/access/status', accessRequestSubmitPath: '/v2/access/request',
    accessRequestResolverTokenTtlSeconds: 15, accessRequestResolverTimeoutMilliseconds: 5_000,
    accessRequestStatusProcedure: 'access_request_get_status_v1',
    accessRequestSubmitProcedure: 'access_request_submit_v1',
    approvalNotificationsEnabled: !prepared, miniAppNotificationClientFids: [9_152],
    miniAppWebhookPath: '/v1/farcaster/miniapp/webhook',
    admissionNotificationPath: '/v1/admin/admission-notification',
    admissionNotificationRecoveryPath: '/v1/admin/admission-notification-recovery',
    admissionNotificationStatusPath: '/v1/admin/admission-notification-status',
    publicAuthEnabled: true, accessExpectedFidRequired: false,
    ptrEnabled: prepared, ptrSpacetimeDbDatabase: prepared ? PTR : null,
    ptrAudience: prepared ? 'warpkeep-ptr-spacetimedb' : null,
    qaObserverEnabled: false, qaObserverSpacetimeDbUri: null,
    qaObserverSpacetimeDbDatabase: null, qaObserverAudience: null,
    qaObserverKeyFingerprint: null, qaObserverKeyRegisteredAt: null,
    qaObserverKeyExpiresAt: null,
    qaObserverMaxRegistrationLifetimeMilliseconds: 366 * 24 * 60 * 60 * 1_000,
  };
}

function jsonResponse(url: string, value: unknown, date: Date, headers = {}) {
  const response = new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store',
      date: date.toUTCString(), ...headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  return response;
}

function elapsedClock() {
  let elapsed = 0;
  vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
  return {
    advance: (milliseconds: number) => { elapsed += milliseconds; },
    now: () => new Date(NOW.getTime() + elapsed),
  };
}

function provider(options: {
  delay?: number;
  responseDate?: (url: string, receivedAt: Date) => Date;
  afterResponse?: (url: string) => void;
} = {}) {
  const clock = elapsedClock();
  const dates: string[] = [];
  const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    await Promise.resolve();
    clock.advance(options.delay ?? 250);
    const url = String(input);
    const date = options.responseDate?.(url, clock.now()) ?? clock.now();
    dates.push(date.toUTCString());
    let response: Response;
    if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
      expect(init?.method).toBe('GET');
      expect(new Headers(init?.headers).has('authorization')).toBe(false);
      response = jsonResponse(url, live, date, releaseHeaders);
    } else if (url === PRIVATE_URL) {
      expect(init?.method).toBe('POST');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`);
      response = jsonResponse(url, privateBody(), date);
    } else {
      expect(url.startsWith(`${API_BASE}/`)).toBe(true);
      expect(init?.method).toBe('GET');
      expect(new Headers(init?.headers).get('authorization')).toBe(`Bearer ${API_TOKEN}`);
      let result;
      if (url === `${API_BASE}/deployments`) result = [{
        id: DEPLOYMENT, strategy: 'percentage',
        versions: [{ version_id: VERSION, percentage: 100 }],
      }];
      else if (url === `${API_BASE}/versions?deployable=true&page=1&per_page=100`
        || url === `${API_BASE}/versions?page=1&per_page=1`) result = { items: [{ id: VERSION }] };
      else if (url === `${API_BASE}/versions/${VERSION}`) result = {
        id: VERSION,
        annotations: {
          'workers/tag': `notification-prepared-${SOURCE}`,
          'workers/message': `Warpkeep notification preparation ${SOURCE}`,
        },
        resources: { bindings: [{ name: 'PTR_SPACETIMEDB_DATABASE', type: 'plain_text', text: PTR }] },
      };
      else throw new Error(`unexpected provider URL ${url}`);
      response = jsonResponse(url, { success: true, errors: [], messages: [], result }, date);
    }
    options.afterResponse?.(url);
    return response;
  });
  return { clock, dates, fetchImpl, run: (now = NOW) => inspectAuthBridgeNotificationPreparedRecoveryAuthority({
    expected: { workerVersionId: VERSION, bridgeSourceCommit: SOURCE }, now,
    accountId: ACCOUNT, zoneId: ZONE, apiToken: API_TOKEN, adminToken: ADMIN_TOKEN, fetchImpl,
  }) };
}

function receipt(expiresAt: Date, notificationDeliveryEnabled = false) {
  const attestation = { ...live, notificationDeliveryEnabled };
  return parseAuthBridgeNotificationPreparedReceipt({
    schemaVersion: 1, kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com', bridgeSourceCommit: SOURCE,
    notificationDeliveryContractDigest: AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
    notificationClientCount: 1, notificationDeliveryEnabled,
    notificationTransportConfigured: true, admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true, publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false, accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false, pagesPresentationEnabled: false,
    liveAttestationDigest: canonicalAuthBridgeReleaseAttestationDigest(attestation),
    preparedAt: new Date(NOW.getTime() - 60_000).toISOString(), expiresAt: expiresAt.toISOString(),
  });
}

afterEach(() => { vi.restoreAllMocks(); });

describe('production recovery timing', () => {
  it('accepts real provider responses crossing seconds throughout awaited reads', async () => {
    const test = provider();
    const result = await test.run();
    expect(test.fetchImpl).toHaveBeenCalledTimes(8);
    expect(test.dates.every(date => Date.parse(date) > NOW.getTime())).toBe(true);
    expect(result).toMatchObject({ workerVersionId: VERSION, bridgeSourceCommit: SOURCE,
      deploymentId: DEPLOYMENT, ptrDatabaseIdentity: PTR,
      publicAttestationDigest: canonicalAuthBridgeReleaseAttestationDigest(live),
      inspectedAt: test.clock.now().toISOString(),
    });
    expect(Date.parse(result.oldestObservedAt)).toBe(Math.min(...test.dates.map(Date.parse)));
  });

  it.each(['control', 'public', 'private'] as const)(
    'rejects a future %s Date against actual response time', async endpoint => {
      const test = provider({ responseDate: (url, date) => {
        const chosen = endpoint === 'control' ? url === `${API_BASE}/deployments`
          : endpoint === 'public' ? url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL : url === PRIVATE_URL;
        return chosen ? new Date(date.getTime() + 10_000) : date;
      } });
      await expect(test.run()).rejects.toMatchObject({
        code: endpoint === 'private' ? 'AUTH_BRIDGE_PRIVATE_ATTESTATION_UNREACHABLE'
          : 'AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_STALE',
      });
    },
  );

  it('rejects early enumeration evidence that expires before final reconciliation', async () => {
    const test = provider({ delay: 60_000 });
    await expect(test.run()).rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_RECOVERY_ATTESTATION_STALE' });
    expect(test.fetchImpl).toHaveBeenCalledTimes(8);
  });

  it('owns its time snapshot even when the caller changes its Date during a read', async () => {
    const callerNow = new Date(NOW);
    const test = provider({ afterResponse: () => callerNow.setUTCFullYear(2040) });
    const result = await test.run(callerNow);
    expect(result.inspectedAt).toBe(test.clock.now().toISOString());
    expect(result.inspectedAt.startsWith('2026-')).toBe(true);
  });

  it.each(['clock', 'currentTime', 'testOnlyCapability'])(
    'does not expose a production %s override', async field => {
      const fetchImpl = vi.fn();
      await expect(inspectAuthBridgeNotificationPreparedRecoveryAuthority({
        expected: { workerVersionId: VERSION, bridgeSourceCommit: SOURCE }, now: NOW,
        accountId: ACCOUNT, zoneId: ZONE, apiToken: API_TOKEN, adminToken: ADMIN_TOKEN,
        fetchImpl, [field]: () => new Date('2040-01-01T00:00:00.000Z'),
      } as never)).rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_RECOVERY_INPUT_INVALID' });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe('receipt attestation timing', () => {
  it('samples elapsed request time before public response freshness validation', async () => {
    const clock = elapsedClock();
    const fetchImpl = vi.fn(async () => {
      await Promise.resolve();
      clock.advance(65_000);
      return jsonResponse(AUTH_BRIDGE_RELEASE_ATTESTATION_URL, live, clock.now(), releaseHeaders);
    });
    await expect(fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now: NOW }))
      .resolves.toMatchObject({ digest: canonicalAuthBridgeReleaseAttestationDigest(live) });
  });

  it.each([-300_001, 61_000])('preserves public Date bounds at offset %s ms from receipt time', async offset => {
    const clock = elapsedClock();
    const fetchImpl = vi.fn(async () => {
      await Promise.resolve();
      clock.advance(65_000);
      return jsonResponse(AUTH_BRIDGE_RELEASE_ATTESTATION_URL, live,
        new Date(clock.now().getTime() + offset), releaseHeaders);
    });
    await expect(fetchFreshAuthBridgeReleaseAttestation({ fetchImpl, now: NOW }))
      .rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_ATTESTATION_NOT_FRESH' });
  });

  it('does not let a caller Date mutation extend a receipt lifetime', async () => {
    const clock = elapsedClock();
    const callerNow = new Date(NOW);
    const document = receipt(new Date(NOW.getTime() + 2_000));
    const fetchImpl = vi.fn(async () => {
      await Promise.resolve();
      clock.advance(2_000);
      callerNow.setUTCFullYear(2000);
      return jsonResponse(AUTH_BRIDGE_RELEASE_ATTESTATION_URL, live, clock.now(), releaseHeaders);
    });
    await expect(verifyAuthBridgeNotificationPreparedReceipt({ receipt: document, fetchImpl, now: callerNow }))
      .rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRED' });
  });

  it('rechecks public evidence freshness after streaming its canonical body', async () => {
    const clock = elapsedClock();
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    const response = new Response(new ReadableStream<Uint8Array>({ start(value) { controller = value; } }), {
      status: 200, headers: { ...releaseHeaders, date: NOW.toUTCString() },
    });
    Object.defineProperty(response, 'url', { value: AUTH_BRIDGE_RELEASE_ATTESTATION_URL });
    const operation = fetchFreshAuthBridgeReleaseAttestation({ fetchImpl: async () => response, now: NOW });
    await Promise.resolve();
    await Promise.resolve();
    expect(response.body!.locked).toBe(true);
    clock.advance(300_001);
    controller.enqueue(new TextEncoder().encode(JSON.stringify(live)));
    controller.close();
    await expect(operation).rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_ATTESTATION_NOT_FRESH' });
  });

  it.each([
    ['verify', 0, 2_000, 1],
    ['publication private read', 2_000, 0, 1],
    ['publication public read', 1_000, 1_000, 2],
  ] as const)(
    'rejects a receipt expiring during %s', async (mode, privateDelay, publicDelay, requests) => {
      const clock = elapsedClock();
      const document = receipt(new Date(NOW.getTime() + 2_000), mode !== 'verify');
      const fetchImpl = vi.fn(async (input: RequestInfo | URL) => {
        await Promise.resolve();
        if (String(input) === PRIVATE_URL) {
          clock.advance(privateDelay);
          return jsonResponse(PRIVATE_URL, privateBody(false), clock.now());
        }
        clock.advance(publicDelay);
        return jsonResponse(AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
          { ...live, notificationDeliveryEnabled: mode !== 'verify' }, clock.now(), releaseHeaders);
      });
      const operation = mode === 'verify'
        ? verifyAuthBridgeNotificationPreparedReceipt({ receipt: document, fetchImpl, now: NOW })
        : authenticateAuthBridgeNotificationPreparedReceiptForPublication({
          receipt: document, adminToken: ADMIN_TOKEN, expectedBridgeSourceCommit: SOURCE, fetchImpl, now: NOW,
        });
      await expect(operation).rejects.toMatchObject({ code: 'AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRED' });
      expect(fetchImpl).toHaveBeenCalledTimes(requests);
    },
  );
});
