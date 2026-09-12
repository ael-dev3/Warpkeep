import { describe, expect, it, vi } from 'vitest'
import {
  AUTH_BRIDGE_RELEASE_ATTESTATION_KEYS,
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
  farcasterRpcEndpointFingerprint,
  parseAuthBridgeReleaseAttestation,
  verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation,
  verifyAuthBridgeNotificationB0RpcRoleAttestation,
  verifyAuthBridgePreparedConfigAttestation,
  verifyAuthBridgePreparedPredeployRpcRoleAttestation,
  verifyAuthBridgePreparedRpcRoleAttestation,
  verifyAuthBridgeReleaseAttestation,
  verifyAuthBridgeRpcRoleAttestation,
} from '../scripts/auth-bridge-config-attestation.mjs'

const ADMIN_TOKEN = 'test-admin-token-that-is-long-enough-for-production'
const SOURCE_COMMIT = 'a'.repeat(40)
const DELIVERY_CONTRACT_DIGEST =
  '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9'
const PRIMARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_PRIMARY_URL,
)
const SECONDARY_FINGERPRINT = farcasterRpcEndpointFingerprint(
  DEFAULT_FARCASTER_RPC_SECONDARY_URL,
)
const HUB_FINGERPRINTS = ['1'.repeat(64), '2'.repeat(64)] as const
const PTR_DATABASE = 'b'.repeat(64)
const PTR_AUDIENCE = 'warpkeep-ptr-spacetimedb'

function privateBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    profile: 'warpkeep-auth-v2',
    digest: 'd'.repeat(64),
    farcasterRpcEndpointFingerprints: [
      PRIMARY_FINGERPRINT,
      SECONDARY_FINGERPRINT,
    ].sort(),
    farcasterRpcEndpointRoleFingerprints: {
      primary: PRIMARY_FINGERPRINT,
      secondary: SECONDARY_FINGERPRINT,
    },
    miniAppHubEndpointFingerprints: [],
    signingPublicKeyThumbprint: 'A'.repeat(43),
    quickAuthIssuer: 'https://auth.farcaster.xyz',
    quickAuthDomain: 'warpkeep.com',
    quickAuthBrowserOrigin: 'https://warpkeep.com',
    quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange',
    quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
    quickAuthMaxTokenBytes: 8 * 1024,
    quickAuthMaxIssuerLifetimeSeconds: 60 * 60,
    accessRequestStatusPath: '/v2/access/status',
    accessRequestSubmitPath: '/v2/access/request',
    accessRequestResolverTokenTtlSeconds: 15,
    accessRequestResolverTimeoutMilliseconds: 5_000,
    accessRequestStatusProcedure: 'access_request_get_status_v1',
    accessRequestSubmitProcedure: 'access_request_submit_v1',
    approvalNotificationsEnabled: false,
    miniAppNotificationClientFids: [],
    miniAppWebhookPath: '/v1/farcaster/miniapp/webhook',
    admissionNotificationPath: '/v1/admin/admission-notification',
    admissionNotificationRecoveryPath:
      '/v1/admin/admission-notification-recovery',
    admissionNotificationStatusPath: '/v1/admin/admission-notification-status',
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    ptrEnabled: false,
    ptrSpacetimeDbDatabase: null,
    ptrAudience: null,
    qaObserverEnabled: false,
    qaObserverSpacetimeDbUri: null,
    qaObserverSpacetimeDbDatabase: null,
    qaObserverAudience: null,
    qaObserverKeyFingerprint: null,
    qaObserverKeyRegisteredAt: null,
    qaObserverKeyExpiresAt: null,
    qaObserverMaxRegistrationLifetimeMilliseconds: 366 * 24 * 60 * 60 * 1_000,
    ...overrides,
  }
}

function privateResponse(
  body: Record<string, unknown> = privateBody(),
  headers: HeadersInit = {},
): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'cache-control': 'no-store',
      'content-type': 'application/json; charset=utf-8',
      ...headers,
    },
  })
}

function b0PredecessorPrivateBody(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const body = privateBody(overrides)
  delete body.admissionNotificationRecoveryPath
  delete body.ptrEnabled
  delete body.ptrSpacetimeDbDatabase
  delete body.ptrAudience
  return body
}

function releaseAttestation(overrides: Record<string, unknown> = {}) {
  return {
    schemaVersion: 1 as const,
    profile: 'warpkeep-admission-notification-bridge-v1' as const,
    bridgeSourceCommit: SOURCE_COMMIT,
    notificationDeliveryEnabled: true as const,
    notificationTransportConfigured: true as const,
    admissionNotificationStoreConfigured: true as const,
    notificationClientCount: 1 as const,
    notificationDeliveryContractDigest: DELIVERY_CONTRACT_DIGEST,
    publicAuthEnabled: true,
    accessExpectedFidRequired: false,
    ...overrides,
  }
}

const RELEASE_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'content-type': 'application/json; charset=utf-8',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
} as const

function releaseResponse(
  body: Record<string, unknown> = releaseAttestation(),
  headers: HeadersInit = {},
  source = JSON.stringify(body),
): Response {
  return new Response(source, {
    status: 200,
    headers: { ...RELEASE_HEADERS, ...headers },
  })
}

function preparedPrivateBody(overrides: Record<string, unknown> = {}) {
  return privateBody({
    approvalNotificationsEnabled: false,
    miniAppHubEndpointFingerprints: [...HUB_FINGERPRINTS],
    miniAppNotificationClientFids: [9_152],
    ptrEnabled: true,
    ptrSpacetimeDbDatabase: PTR_DATABASE,
    ptrAudience: PTR_AUDIENCE,
    ...overrides,
  })
}

describe('private auth bridge RPC role attestation', () => {
  it('strictly verifies the ordered RPC/PTR contract and returns every release mode', async () => {
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => privateResponse())
    const fetchImpl = fetchMock as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).resolves.toEqual({
      profile: 'warpkeep-auth-v2',
      digest: 'd'.repeat(64),
      farcasterRpcEndpointRoleFingerprints: {
        primary: PRIMARY_FINGERPRINT,
        secondary: SECONDARY_FINGERPRINT,
      },
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: false,
      notificationClientCount: 0,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
      ptrEnabled: false,
      ptrSpacetimeDbDatabase: null,
      ptrAudience: null,
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://auth.warpkeep.com/v1/admin/config-attestation')
    expect(init).toMatchObject({
      method: 'POST',
      cache: 'no-store',
      redirect: 'error',
    })
    const requestHeaders = new Headers(init?.headers)
    expect(requestHeaders.get('authorization')).toBe(`Bearer ${ADMIN_TOKEN}`)
    expect(requestHeaders.has('origin')).toBe(false)
    expect(init).not.toHaveProperty('body')
  })

  it('accepts exact predecessor and current shapes only at the B0 seam', async () => {
    const predecessorFetch = vi.fn(async () => privateResponse(
      b0PredecessorPrivateBody(),
    )) as typeof fetch
    await expect(verifyAuthBridgeNotificationB0RpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: predecessorFetch,
    })).resolves.toMatchObject({
      notificationDeliveryEnabled: false,
      notificationTransportConfigured: false,
      notificationClientCount: 0,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
      ptrEnabled: false,
      ptrSpacetimeDbDatabase: null,
      ptrAudience: null,
    })

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse(
        b0PredecessorPrivateBody(),
      )) as typeof fetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse(
        b0PredecessorPrivateBody(),
      )) as typeof fetch,
      b0Contract: true,
    } as unknown as Parameters<
      typeof verifyAuthBridgeRpcRoleAttestation
    >[0])).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })

    await expect(verifyAuthBridgeNotificationB0RpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse()) as typeof fetch,
    })).resolves.toMatchObject({
      notificationDeliveryEnabled: false,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
      ptrEnabled: false,
      ptrSpacetimeDbDatabase: null,
      ptrAudience: null,
    })

    const missingStatus = b0PredecessorPrivateBody()
    delete missingStatus.admissionNotificationStatusPath
    await expect(verifyAuthBridgeNotificationB0RpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse(missingStatus)) as typeof fetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })
  })

  it('rejects missing, extra, reordered, and malformed private fields', async () => {
    const missing = privateBody()
    delete missing.publicAuthEnabled
    const extra = privateBody({ bridgeSourceCommit: SOURCE_COMMIT })
    const malformed = privateBody({ approvalNotificationsEnabled: 'false' })
    const reordered = Object.fromEntries(Object.entries(privateBody()).reverse())

    for (const body of [missing, extra, reordered, malformed]) {
      const fetchImpl = vi.fn(async () => privateResponse(body)) as typeof fetch
      await expect(verifyAuthBridgeRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      })
    }
  })

  it('binds prepared PTR activation to the exact immutable database and fixed audience', async () => {
    await expect(verifyAuthBridgePreparedRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      fetchImpl: vi.fn(async () => privateResponse(
        preparedPrivateBody(),
      )) as typeof fetch,
    })).resolves.toMatchObject({
      ptrEnabled: true,
      ptrSpacetimeDbDatabase: PTR_DATABASE,
      ptrAudience: PTR_AUDIENCE,
    })

    for (const body of [
      preparedPrivateBody({ approvalNotificationsEnabled: true }),
      preparedPrivateBody({ ptrEnabled: false }),
      preparedPrivateBody({ ptrSpacetimeDbDatabase: 'c'.repeat(64) }),
      preparedPrivateBody({ ptrSpacetimeDbDatabase: 'warpkeep-ptr' }),
      preparedPrivateBody({ ptrSpacetimeDbDatabase: null }),
      preparedPrivateBody({ ptrAudience: 'alternate-audience' }),
      b0PredecessorPrivateBody(),
    ]) {
      await expect(verifyAuthBridgePreparedRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
        fetchImpl: vi.fn(async () => privateResponse(body)) as typeof fetch,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      })
    }

    for (const body of [
      privateBody({ ptrEnabled: true }),
      privateBody({ ptrSpacetimeDbDatabase: PTR_DATABASE }),
      privateBody({ ptrAudience: PTR_AUDIENCE }),
      preparedPrivateBody(),
    ]) {
      await expect(verifyAuthBridgeNotificationB0RpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl: vi.fn(async () => privateResponse(body)) as typeof fetch,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      })
    }

    for (const expectedPtrSpacetimeDbDatabase of [
      undefined,
      'warpkeep-ptr',
      'B'.repeat(64),
      'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    ]) {
      const fetchImpl = vi.fn(async () => privateResponse(
        preparedPrivateBody(),
      )) as typeof fetch
      await expect(verifyAuthBridgePreparedRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        expectedPtrSpacetimeDbDatabase:
          expectedPtrSpacetimeDbDatabase as string,
        fetchImpl,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_INPUT_INVALID',
      })
      expect(fetchImpl).not.toHaveBeenCalled()
    }
  })

  it('keeps legacy B0 delivery enabled while the prepared transition disables its post-state', async () => {
    const enabledB0 = privateBody({
      approvalNotificationsEnabled: true,
      miniAppHubEndpointFingerprints: [...HUB_FINGERPRINTS],
      miniAppNotificationClientFids: [9_152],
    })

    await expect(verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse(enabledB0)) as typeof fetch,
    })).resolves.toMatchObject({ notificationDeliveryEnabled: true })

    await expect(verifyAuthBridgeNotificationB0CurrentRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: vi.fn(async () => privateResponse(privateBody())) as typeof fetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })

    await expect(verifyAuthBridgePreparedPredeployRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      fetchImpl: vi.fn(async () => privateResponse(enabledB0)) as typeof fetch,
    })).resolves.toMatchObject({ notificationDeliveryEnabled: true })

    await expect(verifyAuthBridgePreparedRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      fetchImpl: vi.fn(async () => privateResponse(
        preparedPrivateBody({ approvalNotificationsEnabled: true }),
      )) as typeof fetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })
  })

  it('rejects inconsistent or noncanonical notification transport fields', async () => {
    for (const overrides of [
      { approvalNotificationsEnabled: true },
      { miniAppHubEndpointFingerprints: [...HUB_FINGERPRINTS] },
      { miniAppNotificationClientFids: [9_152] },
      { miniAppNotificationClientFids: [9_153, 9_152] },
      { miniAppHubEndpointFingerprints: [...HUB_FINGERPRINTS].reverse() },
    ]) {
      const fetchImpl = vi.fn(async () => privateResponse(
        privateBody(overrides),
      )) as typeof fetch
      await expect(verifyAuthBridgeRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl,
      })).rejects.toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
      })
    }
  })

  it('rejects swapped roles even when the unordered endpoint set is unchanged', async () => {
    const fetchImpl = vi.fn(async () => privateResponse(privateBody({
      farcasterRpcEndpointRoleFingerprints: {
        primary: SECONDARY_FINGERPRINT,
        secondary: PRIMARY_FINGERPRINT,
      },
    }))) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_RPC_ROLES_INVALID',
    })
  })

  it('categorizes a changed legacy endpoint set as an RPC-role failure', async () => {
    const fetchImpl = vi.fn(async () => privateResponse(privateBody({
      farcasterRpcEndpointFingerprints: [PRIMARY_FINGERPRINT, 'f'.repeat(64)].sort(),
    }))) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_RPC_ROLES_INVALID',
    })
  })

  it('rejects a noncanonical bridge before the credential reaches fetch', async () => {
    const fetchImpl = vi.fn(async () => privateResponse()) as typeof fetch

    await expect(verifyAuthBridgeRpcRoleAttestation({
      bridgeUrl: 'https://evil.example',
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_INPUT_INVALID',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects browser-readable or cacheable private responses', async () => {
    const corsFetch = vi.fn(async () => privateResponse(privateBody(), {
      'access-control-allow-origin': 'https://warpkeep.com',
    })) as typeof fetch
    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: corsFetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_HEADERS_INVALID',
    })

    const cacheableFetch = vi.fn(async () => privateResponse(
      privateBody(),
      { 'cache-control': 'public, max-age=60' },
    )) as typeof fetch
    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: cacheableFetch,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_HEADERS_INVALID',
    })
  })

  it('categorizes private HTTP rejection without exposing response details', async () => {
    for (const [status, code] of [
      [401, 'AUTH_BRIDGE_PRIVATE_ATTESTATION_AUTH_REJECTED'],
      [403, 'AUTH_BRIDGE_PRIVATE_ATTESTATION_AUTH_REJECTED'],
      [429, 'AUTH_BRIDGE_PRIVATE_ATTESTATION_RATE_LIMITED'],
      [201, 'AUTH_BRIDGE_PRIVATE_ATTESTATION_HTTP_REJECTED'],
      [500, 'AUTH_BRIDGE_PRIVATE_ATTESTATION_HTTP_REJECTED'],
    ] as const) {
      const fetchImpl = vi.fn(async () => new Response('private response', {
        status,
      })) as typeof fetch
      let observed: unknown
      try {
        await verifyAuthBridgeRpcRoleAttestation({
          adminToken: ADMIN_TOKEN,
          fetchImpl,
        })
      } catch (error) {
        observed = error
      }
      expect(observed).toMatchObject({ code })
      expect(String((observed as Error).message)).not.toContain(ADMIN_TOKEN)
      expect(String((observed as Error).message)).not.toContain('private response')
      expect(String((observed as Error).message)).not.toMatch(
        /\b(?:201|401|403|429|500)\b|unauthorized|forbidden|too many requests/u,
      )
    }
  })

  it('reduces malformed responses and hostile stream errors to a fixed category', async () => {
    const nonResponse = vi.fn(async () => ({} as Response)) as typeof fetch
    await expect(verifyAuthBridgeRpcRoleAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl: nonResponse,
    })).rejects.toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })

    const injected = `upstream ${ADMIN_TOKEN} private response 429`
    const hostileResponse = new Response(new ReadableStream({
      pull(controller) {
        controller.error(new Error(injected))
      },
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json; charset=utf-8',
      },
    })
    let observed: unknown
    try {
      await verifyAuthBridgeRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl: vi.fn(async () => hostileResponse) as typeof fetch,
      })
    } catch (error) {
      observed = error
    }
    expect(observed).toMatchObject({
      code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_CONTRACT_INVALID',
    })
    expect(String((observed as Error).message)).not.toContain(ADMIN_TOKEN)
    expect(String((observed as Error).message)).not.toContain(injected)
  })

  it('keeps credentials out of transport failure messages', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error(ADMIN_TOKEN)
    }) as typeof fetch

    let message = ''
    try {
      await verifyAuthBridgeRpcRoleAttestation({
        adminToken: ADMIN_TOKEN,
        fetchImpl,
      })
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
      expect(error).toMatchObject({
        code: 'AUTH_BRIDGE_PRIVATE_ATTESTATION_UNREACHABLE',
      })
    }
    expect(message).toContain('attestation endpoint was unreachable')
    expect(message).not.toContain(ADMIN_TOKEN)
  })
})

describe('public auth bridge release attestation', () => {
  it('exports and parses the exact ordered prepared-only ten-field contract', () => {
    const expected = releaseAttestation()
    expect(AUTH_BRIDGE_RELEASE_ATTESTATION_KEYS).toEqual(Object.keys(expected))
    expect(parseAuthBridgeReleaseAttestation(expected)).toEqual(expected)
    const sealed = releaseAttestation({ notificationDeliveryEnabled: false })
    expect(parseAuthBridgeReleaseAttestation(sealed)).toEqual(sealed)
  })

  it('rejects missing, extra, malformed, and reordered public fields', () => {
    const missing = releaseAttestation()
    delete (missing as Record<string, unknown>).bridgeSourceCommit
    const extra = releaseAttestation({ sourceUrl: 'https://private.example' })
    const malformed = releaseAttestation({ bridgeSourceCommit: 'A'.repeat(40) })
    const reordered = Object.fromEntries(
      Object.entries(releaseAttestation()).reverse(),
    )

    for (const value of [missing, extra, malformed, reordered]) {
      expect(() => parseAuthBridgeReleaseAttestation(value)).toThrow(
        /public release attestation/u,
      )
    }
  })

  it('verifies exact bytes, headers, canonical host, and credential-free request shape', async () => {
    const expected = releaseAttestation()
    const fetchMock = vi.fn(async (
      _input: RequestInfo | URL,
      _init?: RequestInit,
    ) => releaseResponse())
    const result = await verifyAuthBridgeReleaseAttestation({
      expected,
      fetchImpl: fetchMock as typeof fetch,
    })

    expect(result).toEqual(expected)
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0]
    expect(String(url)).toBe('https://auth.warpkeep.com/v1/release-attestation')
    expect(init).toMatchObject({
      method: 'GET',
      cache: 'no-store',
      redirect: 'error',
    })
    const headers = new Headers(init?.headers)
    expect(headers.has('authorization')).toBe(false)
    expect(headers.has('origin')).toBe(false)
    expect(init).not.toHaveProperty('body')
  })

  it('rejects semantically equal but noncanonical bytes and unsafe response headers', async () => {
    const expected = releaseAttestation()
    const prettyFetch = vi.fn(async () => releaseResponse(
      expected,
      {},
      JSON.stringify(expected, null, 2),
    )) as typeof fetch
    await expect(verifyAuthBridgeReleaseAttestation({
      expected,
      fetchImpl: prettyFetch,
    })).rejects.toThrow('did not match the reviewed deployment')

    const unsafeHeaders: readonly Record<string, string>[] = [
      { 'cache-control': 'public' },
      { 'content-type': 'application/json' },
      { 'access-control-allow-origin': '*' },
      { location: 'https://redirect.example/' },
      { 'x-frame-options': 'SAMEORIGIN' },
    ]
    for (const headers of unsafeHeaders) {
      const fetchImpl = vi.fn(async () => releaseResponse(
        expected,
        headers,
      )) as typeof fetch
      await expect(verifyAuthBridgeReleaseAttestation({
        expected,
        fetchImpl,
      })).rejects.toThrow(/forbidden response header|security headers/u)
    }
  })

  it('rejects a noncanonical bridge before any public I/O', async () => {
    const fetchImpl = vi.fn(async () => releaseResponse()) as typeof fetch
    await expect(verifyAuthBridgeReleaseAttestation({
      bridgeUrl: 'https://evil.example',
      expected: releaseAttestation(),
      fetchImpl,
    })).rejects.toThrow('pinned to the canonical Warpkeep bridge')
    expect(fetchImpl).not.toHaveBeenCalled()
  })
})

describe('prepared auth bridge configuration attestation', () => {
  it('requires every explicit reviewed expectation before making I/O', async () => {
    const fetchImpl = vi.fn(async () => releaseResponse()) as typeof fetch
    await expect(verifyAuthBridgePreparedConfigAttestation({
      adminToken: ADMIN_TOKEN,
      fetchImpl,
    } as never)).rejects.toThrow('public release attestation shape')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('rejects a notification-enabled prepared expectation before making I/O', async () => {
    const fetchImpl = vi.fn(async () => releaseResponse()) as typeof fetch
    await expect(verifyAuthBridgePreparedConfigAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      expectedReleaseAttestation: releaseAttestation({
        notificationDeliveryEnabled: true,
      }),
      fetchImpl,
    })).rejects.toThrow('prepared notification delivery mode')
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('binds the strict private modes to the exact public deployment contract', async () => {
    const expected = releaseAttestation({
      notificationDeliveryEnabled: false,
      publicAuthEnabled: false,
      accessExpectedFidRequired: true,
    })
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => (
      String(input).endsWith('/v1/admin/config-attestation')
        ? privateResponse(preparedPrivateBody({
          publicAuthEnabled: false,
          accessExpectedFidRequired: true,
        }))
        : releaseResponse(expected)
    ))

    await expect(verifyAuthBridgePreparedConfigAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      expectedReleaseAttestation: expected,
      fetchImpl: fetchMock as typeof fetch,
    })).resolves.toEqual({
      releaseAttestation: expected,
      configurationDigest: 'd'.repeat(64),
      farcasterRpcEndpointRoleFingerprints: {
        primary: PRIMARY_FINGERPRINT,
        secondary: SECONDARY_FINGERPRINT,
      },
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('fails closed on private/public mode drift before public attestation I/O', async () => {
    const fetchMock = vi.fn(async () => privateResponse(preparedPrivateBody({
      publicAuthEnabled: false,
    })))
    await expect(verifyAuthBridgePreparedConfigAttestation({
      adminToken: ADMIN_TOKEN,
      expectedPtrSpacetimeDbDatabase: PTR_DATABASE,
      expectedReleaseAttestation: releaseAttestation({
        notificationDeliveryEnabled: false,
        publicAuthEnabled: true,
      }),
      fetchImpl: fetchMock as typeof fetch,
    })).rejects.toThrow('private and public bridge release modes did not match')
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
