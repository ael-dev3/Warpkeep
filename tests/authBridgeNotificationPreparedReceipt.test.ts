// @vitest-environment node

import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
} from '../scripts/auth-bridge-config-attestation.mjs';
import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KEYS,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD,
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST,
  AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  canonicalAuthBridgeReleaseAttestationDigest,
  fetchFreshAuthBridgeReleaseAttestation,
  ensureAuthBridgeNotificationPreparedReceiptDirectory,
  inspectPrivateAuthBridgeNotificationPreparedReceipt,
  inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest,
  parseAuthBridgeNotificationPreparedReceipt,
  prepareAuthBridgeNotificationPreparedReceipt,
  readPrivateAuthBridgeNotificationPreparedReceipt,
  verifyAuthBridgeNotificationPreparedReceipt,
  writePrivateAuthBridgeNotificationPreparedReceipt,
  type AuthBridgeNotificationPreparedReceipt,
} from '../scripts/auth-bridge-notification-prepared-receipt.mjs';

const NOW = new Date('2026-08-11T12:00:00.000Z');
const ADMIN_TOKEN = 'test-admin-token-that-is-long-enough-for-production';
const SOURCE_COMMIT = 'a'.repeat(40);
const PREDECESSOR_SOURCE_COMMIT = 'b'.repeat(40);
const DELIVERY_CONTRACT_DIGEST =
  AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST;
const temporaryDirectories: string[] = [];
const PRIMARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
);
const SECONDARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
);
const HUB_FINGERPRINTS = ['1'.repeat(64), '2'.repeat(64)] as const;
const PTR_DATABASE = 'b'.repeat(64);
const PTR_AUDIENCE = 'warpkeep-ptr-spacetimedb';

const RELEASE_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy':
    'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
  date: NOW.toUTCString(),
});

function temporaryHome(prefix = 'warpkeep-bridge-prepared-'): string {
  const home = mkdtempSync(join(realpathSync(tmpdir()), prefix));
  chmodSync(home, 0o700);
  temporaryDirectories.push(home);
  return home;
}

afterEach(() => {
  vi.restoreAllMocks();
  for (const path of temporaryDirectories.splice(0)) {
    rmSync(path, { recursive: true, force: true });
  }
});

function releaseAttestation(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-admission-notification-bridge-v1' as const,
    bridgeSourceCommit: SOURCE_COMMIT,
    notificationDeliveryEnabled: false as const,
    notificationTransportConfigured: true as const,
    admissionNotificationStoreConfigured: true as const,
    notificationClientCount: 1 as const,
    notificationDeliveryContractDigest: DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    ...overrides,
  };
}

function releaseResponse({
  body = releaseAttestation(),
  source = JSON.stringify(body),
  headers = {},
  url = AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
  redirected = false,
}: {
  body?: Record<string, unknown>;
  source?: string;
  headers?: HeadersInit;
  url?: string;
  redirected?: boolean;
} = {}): Response {
  const response = new Response(source, {
    status: 200,
    headers: { ...RELEASE_HEADERS, ...headers },
  });
  Object.defineProperty(response, 'url', { value: url });
  Object.defineProperty(response, 'redirected', { value: redirected });
  return response;
}

function privateBody({
  prepared,
  publicAuthEnabled = true,
  accessExpectedFidRequired = false,
}: {
  prepared: boolean;
  publicAuthEnabled?: boolean;
  accessExpectedFidRequired?: boolean;
}): Record<string, unknown> {
  return {
    profile: 'warpkeep-auth-v2',
    digest: (prepared ? 'e' : 'd').repeat(64),
    farcasterRpcEndpointFingerprints: [
      PRIMARY_FINGERPRINT,
      SECONDARY_FINGERPRINT,
    ].sort(),
    farcasterRpcEndpointRoleFingerprints: {
      primary: PRIMARY_FINGERPRINT,
      secondary: SECONDARY_FINGERPRINT,
    },
    miniAppHubEndpointFingerprints: [...HUB_FINGERPRINTS],
    signingPublicKeyThumbprint: 'A'.repeat(43),
    quickAuthIssuer: 'https://auth.farcaster.xyz',
    quickAuthDomain: 'warpkeep.com',
    quickAuthBrowserOrigin: 'https://warpkeep.com',
    quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange',
    quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
    quickAuthMaxTokenBytes: 8 * 1_024,
    quickAuthMaxIssuerLifetimeSeconds: 60 * 60,
    accessRequestStatusPath: '/v2/access/status',
    accessRequestSubmitPath: '/v2/access/request',
    accessRequestResolverTokenTtlSeconds: 15,
    accessRequestResolverTimeoutMilliseconds: 5_000,
    accessRequestStatusProcedure: 'access_request_get_status_v1',
    accessRequestSubmitProcedure: 'access_request_submit_v1',
    approvalNotificationsEnabled: false,
    miniAppNotificationClientFids: [9_152],
    miniAppWebhookPath: '/v1/farcaster/miniapp/webhook',
    admissionNotificationPath: '/v1/admin/admission-notification',
    admissionNotificationRecoveryPath:
      '/v1/admin/admission-notification-recovery',
    admissionNotificationStatusPath: '/v1/admin/admission-notification-status',
    publicAuthEnabled,
    accessExpectedFidRequired,
    ptrEnabled: prepared,
    ptrSpacetimeDbDatabase: prepared ? PTR_DATABASE : null,
    ptrAudience: prepared ? PTR_AUDIENCE : null,
    qaObserverEnabled: false,
    qaObserverSpacetimeDbUri: null,
    qaObserverSpacetimeDbDatabase: null,
    qaObserverAudience: null,
    qaObserverKeyFingerprint: null,
    qaObserverKeyRegisteredAt: null,
    qaObserverKeyExpiresAt: null,
    qaObserverMaxRegistrationLifetimeMilliseconds:
      366 * 24 * 60 * 60 * 1_000,
  };
}

function privateResponse(body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
    },
  });
}

function preparationFetch({
  prePrivate = privateBody({ prepared: false }),
  postPrivate = privateBody({ prepared: true }),
  publicBody = releaseAttestation(),
}: {
  prePrivate?: Record<string, unknown>;
  postPrivate?: Record<string, unknown>;
  publicBody?: Record<string, unknown>;
} = {}) {
  let privateCalls = 0;
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === 'https://auth.warpkeep.com/v1/admin/config-attestation') {
      privateCalls += 1;
      return privateResponse(privateCalls === 1 ? prePrivate : postPrivate);
    }
    if (url === AUTH_BRIDGE_RELEASE_ATTESTATION_URL) {
      return releaseResponse({ body: publicBody });
    }
    throw new Error('unexpected test URL');
  });
}

async function authenticatedReceipt() {
  const deploy = vi.fn(async () => undefined);
  const fetchMock = preparationFetch();
  const prepared = await prepareAuthBridgeNotificationPreparedReceipt({
    adminToken: ADMIN_TOKEN,
    expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
    deploy,
    expectedBridgeSourceCommit: SOURCE_COMMIT,
    fetchImpl: fetchMock as typeof fetch,
    clock: () => NOW,
  });
  return { prepared, deploy, fetchMock };
}

function receipt(
  overrides: Partial<AuthBridgeNotificationPreparedReceipt> = {},
): AuthBridgeNotificationPreparedReceipt {
  const attestation = releaseAttestation();
  return {
    schemaVersion: 1,
    kind: 'warpkeep-auth-bridge-notification-prepared-v1',
    bridgeOrigin: 'https://auth.warpkeep.com',
    bridgeSourceCommit: SOURCE_COMMIT,
    notificationDeliveryContractDigest: DELIVERY_CONTRACT_DIGEST,
    notificationClientCount: 1,
    notificationDeliveryEnabled: false,
    notificationTransportConfigured: true,
    admissionNotificationStoreConfigured: true,
    publicAuthEnabledBefore: true,
    publicAuthEnabledAfter: true,
    accessExpectedFidRequiredBefore: false,
    accessExpectedFidRequiredAfter: false,
    hermesExecutionApproved: false,
    pagesPresentationEnabled: false,
    liveAttestationDigest:
      canonicalAuthBridgeReleaseAttestationDigest(attestation),
    preparedAt: NOW.toISOString(),
    expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1_000).toISOString(),
    ...overrides,
  };
}

describe('auth bridge notification-prepared receipt ABI', () => {
  it('parses only the exact ordered object and preserves the reviewed digest vector', () => {
    const value = receipt();
    expect(Object.keys(value)).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KEYS,
    );
    expect(parseAuthBridgeNotificationPreparedReceipt(value)).toEqual(value);
    expect(value.notificationDeliveryContractDigest).toBe(
      DELIVERY_CONTRACT_DIGEST,
    );
    expect(value.liveAttestationDigest).toBe(
      createHash('sha256')
        .update(JSON.stringify(releaseAttestation()))
        .digest('hex'),
    );
  });

  it('rejects missing, extra, reordered, malformed, and leaking fields', () => {
    const missing = { ...receipt() } as Record<string, unknown>;
    delete missing.bridgeSourceCommit;
    const extra = { ...receipt(), adminToken: 'not-allowed' };
    const reordered = Object.fromEntries(Object.entries(receipt()).reverse());
    const wrongOrigin = { ...receipt(), bridgeOrigin: 'https://evil.example' };
    const rawFid = { ...receipt(), fid: 9_152 };

    for (const value of [missing, extra, reordered, wrongOrigin, rawFid]) {
      expect(() => parseAuthBridgeNotificationPreparedReceipt(value)).toThrow(
        /AUTH_BRIDGE_PREPARED_RECEIPT_/u,
      );
    }
  });

  it('requires unchanged public-auth and expected-FID modes and inert later gates', () => {
    for (const value of [
      { ...receipt(), publicAuthEnabledAfter: false },
      { ...receipt(), accessExpectedFidRequiredAfter: true },
      { ...receipt(), hermesExecutionApproved: true },
      { ...receipt(), pagesPresentationEnabled: true },
    ]) {
      expect(() => parseAuthBridgeNotificationPreparedReceipt(value)).toThrow(
        'AUTH_BRIDGE_PREPARED_RECEIPT_CONTRACT_INVALID',
      );
    }
  });

  it('accepts only canonical UTC and a positive lifetime of at most 24 hours', () => {
    for (const value of [
      { ...receipt(), preparedAt: '2026-08-11T12:00:00Z' },
      { ...receipt(), preparedAt: '2026-08-11T12:00:00.000+00:00' },
      { ...receipt(), expiresAt: NOW.toISOString() },
      {
        ...receipt(),
        expiresAt: new Date(NOW.getTime() + 24 * 60 * 60 * 1_000 + 1)
          .toISOString(),
      },
    ]) {
      expect(() => parseAuthBridgeNotificationPreparedReceipt(value)).toThrow(
        /AUTH_BRIDGE_PREPARED_RECEIPT_/u,
      );
    }
  });
});

describe('fresh public release-attestation binding', () => {
  it('uses an exact-host credential-free GET and hashes exact canonical bytes', async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => releaseResponse());
    const result = await fetchFreshAuthBridgeReleaseAttestation({
      fetchImpl: fetchMock as typeof fetch,
      now: NOW,
    });

    expect(result).toEqual({
      attestation: releaseAttestation(),
      digest: canonicalAuthBridgeReleaseAttestationDigest(releaseAttestation()),
      responseDate: NOW.toUTCString(),
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe(AUTH_BRIDGE_RELEASE_ATTESTATION_URL);
    expect(new URL(String(url)).search).toBe('');
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    const requestHeaders = new Headers(init?.headers);
    expect([...requestHeaders.keys()].sort()).toEqual([
      'accept',
      'cache-control',
    ]);
    expect(requestHeaders.has('authorization')).toBe(false);
    expect(requestHeaders.has('cookie')).toBe(false);
    expect(requestHeaders.has('origin')).toBe(false);
    expect(init).not.toHaveProperty('body');
  });

  it('accepts decoded gzip length and rejects absent or identity mismatches', async () => {
    const source = JSON.stringify(releaseAttestation());
    const gzipLength = Math.max(1, Math.floor(Buffer.byteLength(source) / 2));
    await expect(fetchFreshAuthBridgeReleaseAttestation({
      fetchImpl: vi.fn(async () => releaseResponse({
        source,
        headers: {
          'content-encoding': 'gzip',
          'content-length': String(gzipLength),
        },
      })) as typeof fetch,
      now: NOW,
    })).resolves.toMatchObject({ attestation: releaseAttestation() });

    for (const contentEncoding of [undefined, 'identity']) {
      const headers: Record<string, string> = {
        'content-length': String(Buffer.byteLength(source) + 1),
      };
      if (contentEncoding !== undefined) {
        headers['content-encoding'] = contentEncoding;
      }
      const fetchImpl = vi.fn(
        async () => releaseResponse({ source, headers }),
      ) as typeof fetch;
      await expect(fetchFreshAuthBridgeReleaseAttestation({
        fetchImpl,
        now: NOW,
      })).rejects.toThrow('AUTH_BRIDGE_PREPARED_ATTESTATION_SIZE_INVALID');
    }

    await expect(fetchFreshAuthBridgeReleaseAttestation({
      fetchImpl: vi.fn(async () => releaseResponse({
        source,
        headers: {
          'content-encoding': 'gzip',
          'content-length': String(16 * 1_024 + 1),
        },
      })) as typeof fetch,
      now: NOW,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_ATTESTATION_SIZE_INVALID');
  });

  it('rejects stale, cache-mediated, CORS, redirected, or noncanonical evidence', async () => {
    const cases = [
      releaseResponse({
        headers: {
          date: new Date(NOW.getTime() - 5 * 60 * 1_000 - 1).toUTCString(),
        },
      }),
      releaseResponse({ headers: { age: '0' } }),
      releaseResponse({ headers: { 'access-control-allow-origin': '*' } }),
      releaseResponse({ redirected: true }),
      releaseResponse({ url: 'https://auth.warpkeep.com/v1/release-attestation?x=1' }),
      releaseResponse({ source: `${JSON.stringify(releaseAttestation())}\n` }),
      releaseResponse({
        body: Object.fromEntries(Object.entries(releaseAttestation()).reverse()),
      }),
    ];
    for (const response of cases) {
      const fetchImpl = vi.fn(async () => response) as typeof fetch;
      await expect(fetchFreshAuthBridgeReleaseAttestation({
        fetchImpl,
        now: NOW,
      })).rejects.toThrow(/AUTH_BRIDGE_PREPARED_ATTESTATION_/u);
    }
  });

  it('prepares and verifies unchanged auth modes against a second fresh response', async () => {
    const { prepared, deploy, fetchMock } = await authenticatedReceipt();
    expect(prepared).toEqual(receipt());
    expect(JSON.stringify(prepared)).not.toContain(PTR_DATABASE);
    expect(deploy).toHaveBeenCalledExactlyOnceWith({
      bridgeSourceCommit: SOURCE_COMMIT,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    });
    expect(fetchMock.mock.calls.map(call => String(call[0]))).toEqual([
      'https://auth.warpkeep.com/v1/admin/config-attestation',
      'https://auth.warpkeep.com/v1/admin/config-attestation',
      AUTH_BRIDGE_RELEASE_ATTESTATION_URL,
    ]);

    await expect(verifyAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: new Date(NOW.getTime() + 1_000),
    })).resolves.toEqual({
      receipt: prepared,
      liveAttestation: releaseAttestation(),
    });
  });

  it('binds a reviewed predecessor source separately from the prepared source', async () => {
    const deploy = vi.fn(async () => undefined);
    const prepared = await prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      expectedPredecessorBridgeSourceCommit: PREDECESSOR_SOURCE_COMMIT,
      fetchImpl: preparationFetch() as typeof fetch,
      clock: () => NOW,
    });
    expect(deploy).toHaveBeenCalledExactlyOnceWith({
      bridgeSourceCommit: PREDECESSOR_SOURCE_COMMIT,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
    });
    expect(prepared.bridgeSourceCommit).toBe(SOURCE_COMMIT);
  });

  it('rejects any notification-enabled private or public prepared post-state', async () => {
    const enabledPrivate = privateBody({ prepared: true });
    enabledPrivate.approvalNotificationsEnabled = true;
    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy: vi.fn(async () => undefined),
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: preparationFetch({ postPrivate: enabledPrivate }) as typeof fetch,
      clock: () => NOW,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    });

    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy: vi.fn(async () => undefined),
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: preparationFetch({
        publicBody: releaseAttestation({ notificationDeliveryEnabled: true }),
      }) as typeof fetch,
      clock: () => NOW,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_PUBLIC_POSTSTATE_INVALID');
  });

  it('cannot prepare writable evidence without authenticated preserved pre-state', async () => {
    const deploy = vi.fn(async () => undefined);
    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: preparationFetch({
        postPrivate: privateBody({
          prepared: true,
          publicAuthEnabled: false,
        }),
      }) as typeof fetch,
      clock: () => NOW,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_PRIVATE_POSTSTATE_INVALID');

    const failedDeploy = vi.fn(async () => {
      throw new Error('deploy failed');
    });
    const fetchMock = preparationFetch();
    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy: failedDeploy,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: fetchMock as typeof fetch,
      clock: () => NOW,
    })).rejects.toThrow('deploy failed');
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires B0-disabled PRE state and the exact protected PTR database in POST state', async () => {
    const missingExpectedFetch = preparationFetch();
    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      deploy: vi.fn(async () => undefined),
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: missingExpectedFetch as typeof fetch,
      clock: () => NOW,
    } as never)).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_INPUT_INVALID',
    });
    expect(missingExpectedFetch).not.toHaveBeenCalled();

    for (const responses of [
      { prePrivate: privateBody({ prepared: true }) },
      {
        postPrivate: privateBody({ prepared: true }) as Record<string, unknown>,
        mutate: true,
      },
    ]) {
      if (responses.mutate) {
        responses.postPrivate!.ptrSpacetimeDbDatabase = 'c'.repeat(64);
      }
      const deploy = vi.fn(async () => undefined);
      const fetchMock = preparationFetch(responses);
      await expect(prepareAuthBridgeNotificationPreparedReceipt({
        adminToken: ADMIN_TOKEN,
        expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
        deploy,
        expectedBridgeSourceCommit: SOURCE_COMMIT,
        fetchImpl: fetchMock as typeof fetch,
        clock: () => NOW,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      });
      if (responses.prePrivate) expect(deploy).not.toHaveBeenCalled();
    }
  });

  it('keeps predecessor compatibility unavailable to the prepared PRE read', async () => {
    const predecessor = privateBody({ prepared: false });
    delete predecessor.admissionNotificationRecoveryPath;
    delete predecessor.ptrEnabled;
    delete predecessor.ptrSpacetimeDbDatabase;
    delete predecessor.ptrAudience;
    const deploy = vi.fn(async () => undefined);
    const fetchMock = preparationFetch({ prePrivate: predecessor });

    await expect(prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy,
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: fetchMock as typeof fetch,
      clock: () => NOW,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(deploy).not.toHaveBeenCalled();
  });

  it('validates source, lifetime, and clock before credentialed I/O', async () => {
    for (const overrides of [
      { expectedBridgeSourceCommit: 'A'.repeat(40) },
      { lifetimeMilliseconds: 0 },
      { lifetimeMilliseconds: 24 * 60 * 60 * 1_000 + 1 },
      { clock: () => new Date(Number.NaN) },
    ]) {
      const fetchImpl = vi.fn(async () => privateResponse(
        privateBody({ prepared: false }),
      )) as typeof fetch;
      const deploy = vi.fn(async () => undefined);
      await expect(prepareAuthBridgeNotificationPreparedReceipt({
        adminToken: ADMIN_TOKEN,
        expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
        deploy,
        expectedBridgeSourceCommit: SOURCE_COMMIT,
        fetchImpl,
        clock: () => NOW,
        ...overrides,
      })).rejects.toThrow(/AUTH_BRIDGE_PREPARED_/u);
      expect(fetchImpl).not.toHaveBeenCalled();
      expect(deploy).not.toHaveBeenCalled();
    }
  });

  it('rejects changed live bindings and an expired receipt before network I/O', async () => {
    for (const body of [
      releaseAttestation({ bridgeSourceCommit: 'b'.repeat(40) }),
      releaseAttestation({
        notificationDeliveryContractDigest: 'b'.repeat(64),
      }),
      releaseAttestation({ publicAuthEnabled: false }),
      releaseAttestation({ accessExpectedFidRequired: true }),
    ]) {
      const fetchImpl = vi.fn(async () => releaseResponse({ body })) as typeof fetch;
      await expect(verifyAuthBridgeNotificationPreparedReceipt({
        receipt: receipt(),
        fetchImpl,
        now: NOW,
      })).rejects.toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_LIVE_MISMATCH');
    }

    await expect(verifyAuthBridgeNotificationPreparedReceipt({
      receipt: receipt({ liveAttestationDigest: 'b'.repeat(64) }),
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_LIVE_MISMATCH');

    const fetchImpl = vi.fn(async () => releaseResponse()) as typeof fetch;
    await expect(verifyAuthBridgeNotificationPreparedReceipt({
      receipt: receipt(),
      fetchImpl,
      now: new Date(NOW.getTime() + 24 * 60 * 60 * 1_000),
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRED');
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('private production-admin prepared receipt storage', () => {
  it('rejects arbitrary parsed receipts without authenticated predeploy evidence', () => {
    expect(() => writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: receipt() as never,
      repositoryRoot: process.cwd(),
      reportedHome: '/private/tmp/unused',
      now: NOW,
    })).toThrow('AUTH_BRIDGE_PREPARED_AUTHENTICATED_PRESTATE_REQUIRED');
  });

  it('does not install authenticated evidence after its expiry', async () => {
    const prepared = await prepareAuthBridgeNotificationPreparedReceipt({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      deploy: vi.fn(async () => undefined),
      expectedBridgeSourceCommit: SOURCE_COMMIT,
      fetchImpl: preparationFetch() as typeof fetch,
      clock: () => NOW,
      lifetimeMilliseconds: 1,
    });
    expect(() => writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: temporaryHome('warpkeep-bridge-expired-'),
      now: new Date(NOW.getTime() + 1),
    })).toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_EXPIRED');
  });

  it('ignores ambient HOME and installs canonical 0700/0600 no-clobber state', async () => {
    const home = temporaryHome();
    const { prepared } = await authenticatedReceipt();
    const priorHome = process.env.HOME;
    process.env.HOME = join(home, 'ambient-home-must-not-be-used');
    try {
      const first = writePrivateAuthBridgeNotificationPreparedReceipt({
        receipt: prepared,
        repositoryRoot: process.cwd(),
        reportedHome: home,
        now: NOW,
      });
      const second = writePrivateAuthBridgeNotificationPreparedReceipt({
        receipt: prepared,
        repositoryRoot: process.cwd(),
        reportedHome: home,
        now: NOW,
      });
      const expectedDirectory = join(
        home,
        '.warpkeep',
        'private',
        'production-admin-v1',
        AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD,
      );
      expect(first.path.startsWith(`${expectedDirectory}/`)).toBe(true);
      expect(first.path).not.toContain('ambient-home-must-not-be-used');
      expect(second).toMatchObject({
        path: first.path,
        receiptDigest: first.receiptDigest,
        result: 'unchanged',
      });
      expect(statSync(expectedDirectory).mode & 0o7777).toBe(0o700);
      expect(statSync(first.path).mode & 0o7777).toBe(0o600);
      expect(lstatSync(first.path).nlink).toBe(1);
      expect(readPrivateAuthBridgeNotificationPreparedReceipt({
        receiptPath: first.path,
        repositoryRoot: process.cwd(),
        reportedHome: home,
      })).toEqual(receipt());
    } finally {
      if (priorHome === undefined) delete process.env.HOME;
      else process.env.HOME = priorHome;
    }
  });

  it('strictly inspects private bytes and fresh live evidence together', async () => {
    const home = temporaryHome();
    const { prepared } = await authenticatedReceipt();
    const written = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      now: NOW,
    });
    await expect(inspectPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: written.path,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      fetchImpl: vi.fn(async () => releaseResponse()) as typeof fetch,
      now: NOW,
    })).resolves.toMatchObject({ receipt: receipt() });

    const fetchMock = vi.fn(async () => releaseResponse()) as typeof fetch;
    await expect(inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest({
      receiptDigest: written.receiptDigest,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      fetchImpl: fetchMock,
      now: NOW,
    })).resolves.toEqual({
      receipt: receipt(),
      liveAttestation: releaseAttestation(),
      receiptDigest: written.receiptDigest,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const mismatchedFetch = vi.fn(async () => releaseResponse()) as typeof fetch;
    await expect(inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest({
      receiptDigest: 'f'.repeat(64),
      repositoryRoot: process.cwd(),
      reportedHome: home,
      fetchImpl: mismatchedFetch,
      now: NOW,
    })).rejects.toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_FILE_INVALID');
    expect(mismatchedFetch).not.toHaveBeenCalled();
  });

  it('repairs exact linked pairs without deleting live or crashed prelink temporaries', async () => {
    const home = temporaryHome('warpkeep-bridge-publication-repair-');
    const { prepared } = await authenticatedReceipt();
    const installed = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      now: NOW,
    });
    const directory = dirname(installed.path);
    const linkedTemporary = join(
      directory,
      `.auth-bridge-notification-prepared-${installed.receiptDigest}-${'1'.repeat(24)}.json.tmp`,
    );
    linkSync(installed.path, linkedTemporary);
    expect(lstatSync(installed.path).nlink).toBe(2);

    expect(readPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: installed.path,
      repositoryRoot: process.cwd(),
      reportedHome: home,
    })).toEqual(receipt());
    expect(existsSync(linkedTemporary)).toBe(false);
    expect(lstatSync(installed.path).nlink).toBe(1);

    const partialTemporary = join(
      directory,
      `.auth-bridge-notification-prepared-${installed.receiptDigest}-${'2'.repeat(24)}.json.tmp`,
    );
    writeFileSync(partialTemporary, '{', { mode: 0o600 });
    expect(readPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: installed.path,
      repositoryRoot: process.cwd(),
      reportedHome: home,
    })).toEqual(receipt());
    expect(existsSync(partialTemporary)).toBe(true);
  });

  it('normalizes a disappearing temporary during dedicated-directory validation', async () => {
    const home = temporaryHome('warpkeep-bridge-disappearing-temp-');
    const { prepared } = await authenticatedReceipt();
    const installed = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      now: NOW,
    });
    const temporary = join(
      dirname(installed.path),
      `.auth-bridge-notification-prepared-${installed.receiptDigest}-${'3'.repeat(24)}.json.tmp`,
    );
    writeFileSync(temporary, '{', { mode: 0o600 });
    let removed = false;

    expect(() => ensureAuthBridgeNotificationPreparedReceiptDirectory({
      repositoryRoot: process.cwd(),
      reportedHome: home,
      testOnlyBeforeDedicatedEntryMetadata(path) {
        if (path === temporary && !removed) {
          removed = true;
          rmSync(path);
        }
      },
    })).not.toThrow();
    expect(removed).toBe(true);
    expect(existsSync(temporary)).toBe(false);
  });

  it('repairs exact owner-only umask subsets without accepting broader permissions', async () => {
    const home = temporaryHome('warpkeep-bridge-umask-repair-');
    const warpkeep = join(home, '.warpkeep');
    mkdirSync(warpkeep, { mode: 0o700 });
    chmodSync(warpkeep, 0o000);

    const directory = ensureAuthBridgeNotificationPreparedReceiptDirectory({
      repositoryRoot: process.cwd(),
      reportedHome: home,
    });
    expect(lstatSync(warpkeep).mode & 0o7777).toBe(0o700);

    const unpublished = join(
      directory,
      `.auth-bridge-notification-prepared-${'4'.repeat(64)}-${'5'.repeat(24)}.json.tmp`,
    );
    writeFileSync(unpublished, '{', { mode: 0o600 });
    chmodSync(unpublished, 0o000);
    expect(() => ensureAuthBridgeNotificationPreparedReceiptDirectory({
      repositoryRoot: process.cwd(),
      reportedHome: home,
    })).not.toThrow();
    expect(lstatSync(unpublished).mode & 0o7777).toBe(0o000);
  });

  it('rejects repository overlap, symlinks, non-owner-write modes, and extra files', async () => {
    const { prepared } = await authenticatedReceipt();
    const repositoryHome = join(process.cwd(), '.bridge-prepared-test-home');
    mkdirSync(repositoryHome, { mode: 0o700 });
    temporaryDirectories.push(repositoryHome);
    expect(() => writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: repositoryHome,
      now: NOW,
    })).toThrow('AUTH_BRIDGE_PREPARED_REPOSITORY_OVERLAP');

    const home = temporaryHome('warpkeep-bridge-hostile-');
    const actual = join(home, 'actual');
    mkdirSync(actual, { mode: 0o700 });
    symlinkSync(actual, join(home, '.warpkeep'));
    expect(() => writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      now: NOW,
    })).toThrow(/STATE_DIRECTORY_INVALID/u);

    const writableHome = temporaryHome('warpkeep-bridge-writable-');
    chmodSync(writableHome, 0o770);
    expect(() => writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: writableHome,
      now: NOW,
    })).toThrow('AUTH_BRIDGE_PREPARED_ACCOUNT_HOME_INVALID');

    const extraHome = temporaryHome('warpkeep-bridge-extra-');
    const installed = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: extraHome,
      now: NOW,
    });
    writeFileSync(join(installed.path, '..', 'secret.txt'), 'unexpected', {
      mode: 0o600,
    });
    expect(() => readPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: installed.path,
      repositoryRoot: process.cwd(),
      reportedHome: extraHome,
    })).toThrow('AUTH_BRIDGE_PREPARED_STATE_NOT_DEDICATED');

    const specialHome = temporaryHome('warpkeep-bridge-special-directory-');
    const special = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: specialHome,
      now: NOW,
    });
    chmodSync(dirname(special.path), 0o1700);
    expect(() => readPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: special.path,
      repositoryRoot: process.cwd(),
      reportedHome: specialHome,
    })).toThrow('AUTH_BRIDGE_PREPARED_STATE_DIRECTORY_INVALID');
  });

  it('rejects altered bytes, permissive or special files, hard links, and path escapes', async () => {
    const { prepared } = await authenticatedReceipt();
    for (const mutation of ['bytes', 'mode', 'special', 'link'] as const) {
      const home = temporaryHome(`warpkeep-bridge-${mutation}-`);
      const installed = writePrivateAuthBridgeNotificationPreparedReceipt({
        receipt: prepared,
        repositoryRoot: process.cwd(),
        reportedHome: home,
        now: NOW,
      });
      if (mutation === 'bytes') {
        writeFileSync(installed.path, `${readFileSync(installed.path, 'utf8')} `, {
          mode: 0o600,
        });
      } else if (mutation === 'mode') {
        chmodSync(installed.path, 0o640);
      } else if (mutation === 'special') {
        chmodSync(installed.path, 0o700);
      } else {
        linkSync(installed.path, join(home, 'second-link'));
      }
      expect(
        () => readPrivateAuthBridgeNotificationPreparedReceipt({
          receiptPath: installed.path,
          repositoryRoot: process.cwd(),
          reportedHome: home,
        }),
        `receipt mutation ${mutation} must be rejected`,
      ).toThrow(/AUTH_BRIDGE_PREPARED_/u);
    }

    const home = temporaryHome('warpkeep-bridge-path-');
    const installed = writePrivateAuthBridgeNotificationPreparedReceipt({
      receipt: prepared,
      repositoryRoot: process.cwd(),
      reportedHome: home,
      now: NOW,
    });
    expect(() => readPrivateAuthBridgeNotificationPreparedReceipt({
      receiptPath: join(home, 'outside.json'),
      repositoryRoot: process.cwd(),
      reportedHome: home,
    })).toThrow('AUTH_BRIDGE_PREPARED_RECEIPT_PATH_INVALID');
    expect(installed.result).toBe('installed');
  });
});
