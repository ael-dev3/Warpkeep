import { createSiweMessage } from 'viem/siwe'
import { Errors as QuickAuthErrors } from '@farcaster/quick-auth'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ADMISSION_NOTIFICATION_STATUS_PATH,
  FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS,
  QUICK_AUTH_MAX_ISSUER_LIFETIME_SECONDS,
  REQUEST_BODY_TIMEOUT_MILLISECONDS,
  createAuthBridge,
  farcasterRpcEndpointFingerprint,
  type AuthBridgeDependencies,
} from '../src/app'
import { MemoryChallengeStore } from '../src/challengeStore'
import { PLAYER_TOKEN_TTL_SECONDS, PRODUCTION_SPACETIMEDB_DATABASE } from '../src/config'
import { FarcasterVerifierUnavailableError } from '../src/farcaster'
import { qaObserverKeyThumbprint } from '../src/qaObserver'
import {
  MiniAppWebhookInvalidError,
  MiniAppWebhookVerifierUnavailableError,
} from '../src/miniAppWebhook'
import { MemorySessionFamilyStore } from '../src/sessionFamily'
import {
  AuthEpochResolverFailure,
  type AuthEpochResolverFailureStage,
} from '../src/spacetimeAuthEpochResolver'
import { AccessRequestResolverFailure } from '../src/spacetimeAccessRequestResolver'
import type {
  AccessRequestResolver,
  AdmissionNotificationStore,
  AuthEpochResolver,
  ChallengeRecord,
  ChallengeStore,
  FarcasterVerifier,
  MiniAppWebhookVerifier,
  QuickAuthVerifier,
  RateLimiter,
  SafeLogEvent,
  SessionFamilyStore,
  WorkerEnv,
} from '../src/types'

const ORIGIN = 'https://warpkeep.example'
const DOMAIN = 'warpkeep.example'
const SIWE_URI = 'https://warpkeep.example/Warpkeep/'
const FID = '12345'
const QUICK_AUTH_ORIGIN = 'https://warpkeep.com'
const QUICK_AUTH_DOMAIN = 'warpkeep.com'
const QUICK_AUTH_ISSUER = 'https://auth.farcaster.xyz'
const QUICK_AUTH_PATH = '/v2/farcaster/quick-auth/exchange'
const ACCESS_STATUS_PATH = '/v2/access/status'
const ACCESS_REQUEST_PATH = '/v2/access/request'
const syntheticQuickAuthSegment = (value: object) => btoa(JSON.stringify(value))
  .replaceAll('+', '-')
  .replaceAll('/', '_')
  .replace(/=+$/u, '')
const QUICK_AUTH_TOKEN = [
  syntheticQuickAuthSegment({ alg: 'ES256' }),
  syntheticQuickAuthSegment({ sub: 12_345 }),
  'signature',
].join('.')
const ADMIN_SECRET = 'TEST_ONLY_ADMIN_SECRET_'.repeat(2)
const SESSION_COOKIE_KEY = 'TEST_ONLY_SESSION_COOKIE_KEY_'.repeat(2)
const NOTIFICATION_OPERATOR_SECRET = 'TEST_ONLY_NOTIFICATION_OPERATOR_SECRET_'.repeat(2)
const MINIAPP_WEBHOOK_PATH = '/v1/farcaster/miniapp/webhook'
const ADMISSION_NOTIFICATION_PATH = '/v1/admin/admission-notification'
const SERVER_ONLY_ADMIN_PATHS = [
  '/v1/admin/token',
  '/v1/admin/auth-epoch-probe',
  '/v1/admin/config-attestation',
  ADMISSION_NOTIFICATION_PATH,
  ADMISSION_NOTIFICATION_STATUS_PATH,
] as const
const BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const WRONG_BINDING_VERIFIER = 'A'.repeat(43)
let privateJwk: JsonWebKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
})

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ISSUER: 'https://auth.warpkeep.example',
    ALLOWED_ORIGINS: ORIGIN,
    FARCASTER_DOMAIN: DOMAIN,
    FARCASTER_SIWE_URI: SIWE_URI,
    FARCASTER_RPC_URL: 'https://optimism-rpc-one.example.com',
    FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-two.example.net',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    OIDC_KEY_ID: 'test-es256-2026',
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE,
    PUBLIC_AUTH_ENABLED: 'true',
    QA_OBSERVER_ENABLED: 'false',
    SIGNING_KEY_JWK: JSON.stringify(privateJwk),
    ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    SESSION_COOKIE_KEY,
    ENVIRONMENT: 'production',
    ...overrides,
  }
}

function notificationEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return env({
    APPROVAL_NOTIFICATIONS_ENABLED: 'true',
    MINIAPP_NOTIFICATION_HUB_URLS:
      'https://rho.farcaster.xyz:3381/,https://hub.pinata.cloud/',
    MINIAPP_NOTIFICATION_CLIENTS:
      '9152=https://api.farcaster.xyz/v1/frame-notifications',
    NOTIFICATION_OPERATOR_SECRET,
    ...overrides,
  })
}

function request(path: string, body?: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return new Request(`https://auth.warpkeep.example${path}`, {
    ...init,
    method: init.method ?? (body === undefined ? 'GET' : 'POST'),
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(encoded)) as Record<string, unknown>
}

function decodeBase64Url(value: string): Uint8Array {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>
}

function responseCookie(response: Response): string {
  const setCookie = response.headers.get('set-cookie')
  if (!setCookie) throw new Error('Expected a session cookie.')
  return setCookie.split(';', 1)[0]
}

interface Harness {
  app: ReturnType<typeof createAuthBridge>
  verifier: FarcasterVerifier & { verify: ReturnType<typeof vi.fn> }
  quickAuthVerifier: QuickAuthVerifier & { verifyJwt: ReturnType<typeof vi.fn> }
  resolver: AuthEpochResolver & { resolve: ReturnType<typeof vi.fn> }
  accessRequestResolver: AccessRequestResolver
  sessionStore: SessionFamilyStore
  events: SafeLogEvent[]
  setNow(value: number): void
}

function harness(options: {
  epoch?: number
  resolver?: AuthEpochResolver
  verifier?: FarcasterVerifier
  quickAuthVerifier?: QuickAuthVerifier
  accessRequestResolver?: AccessRequestResolver
  rateLimiter?: RateLimiter
  signer?: AuthBridgeDependencies['signer']
  challengeStore?: ChallengeStore
  sessionFamilyStore?: SessionFamilyStore
  miniAppWebhookVerifier?: MiniAppWebhookVerifier
  admissionNotificationStore?: AdmissionNotificationStore
} = {}): Harness {
  let now = Date.now()
  const verifier = options.verifier ?? {
    verify: vi.fn(async () => ({ fid: FID })),
  }
  const quickAuthVerifier = options.quickAuthVerifier ?? {
    verifyJwt: vi.fn(async () => ({
      sub: Number(FID),
      iss: QUICK_AUTH_ISSUER,
      aud: QUICK_AUTH_DOMAIN,
      iat: Math.floor(now / 1_000) - 1,
      exp: Math.floor(now / 1_000) + 300,
    })),
  }
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => (options.epoch ?? 7) === 0
      ? ({ state: 'missing', authEpoch: 0 } as const)
      : ({ state: 'enabled', authEpoch: options.epoch ?? 7 } as const)),
  }
  const accessRequestResolver = options.accessRequestResolver ?? {
    getStatus: vi.fn(async () => ({ status: 'not-requested' } as const)),
    submit: vi.fn(async () => ({
      status: 'requested',
      requestedAtMicros: 1_785_414_896_000_000,
    } as const)),
  }
  const events: SafeLogEvent[] = []
  const sessionStore = options.sessionFamilyStore ?? new MemorySessionFamilyStore()
  const app = createAuthBridge({
    challengeStore: options.challengeStore ?? new MemoryChallengeStore(),
    verifier,
    quickAuthVerifier,
    authEpochResolver: resolver,
    accessRequestResolver,
    sessionFamilyStore: sessionStore,
    miniAppWebhookVerifier: options.miniAppWebhookVerifier,
    admissionNotificationStore: options.admissionNotificationStore,
    rateLimiter: options.rateLimiter ?? { check: async () => ({ allowed: true }) },
    signer: options.signer,
    now: () => now,
    logger: { event: (event) => events.push(event) },
  })
  return {
    app,
    verifier: verifier as Harness['verifier'],
    quickAuthVerifier: quickAuthVerifier as Harness['quickAuthVerifier'],
    resolver: resolver as Harness['resolver'],
    accessRequestResolver,
    sessionStore,
    events,
    setNow(value) { now = value },
  }
}

function quickAuthRequest(
  token: string | null = QUICK_AUTH_TOKEN,
  body: unknown = {},
  init: RequestInit = {},
  path = QUICK_AUTH_PATH,
): Request {
  const headers = new Headers(init.headers)
  if (!headers.has('origin')) headers.set('origin', QUICK_AUTH_ORIGIN)
  if (token !== null && !headers.has('authorization')) headers.set('authorization', `Bearer ${token}`)
  return request(path, body, { ...init, headers })
}

function accessBearerRequest(
  path: typeof ACCESS_STATUS_PATH | typeof ACCESS_REQUEST_PATH,
  body: unknown = {},
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers)
  if (!headers.has('origin')) headers.set('origin', QUICK_AUTH_ORIGIN)
  if (!headers.has('authorization')) {
    headers.set('authorization', `Bearer ${QUICK_AUTH_TOKEN}`)
  }
  if (!headers.has('x-warpkeep-expected-fid')) {
    headers.set('x-warpkeep-expected-fid', FID)
  }
  return request(path, body, { ...init, headers })
}

async function issueChallenge(h: Harness): Promise<Record<string, unknown>> {
  const response = await h.app.fetch(request('/v2/farcaster/challenge', {
    domain: DOMAIN,
    siweUri: SIWE_URI,
    bindingChallenge: BINDING_CHALLENGE,
    bindingMethod: 'S256',
  }, { headers: { origin: ORIGIN } }), env())
  expect(response.status).toBe(201)
  expect(h.events).toContain('challenge_binding_created')
  return json(response)
}

function proofFor(challenge: Record<string, unknown>, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const expirationTime = String(challenge.expirationTime)
  const message = createSiweMessage({
    domain: DOMAIN,
    address: '0x0000000000000000000000000000000000000001',
    chainId: 10,
    uri: SIWE_URI,
    version: '1',
    nonce: String(challenge.nonce),
    issuedAt: new Date(Number(challenge.createdAt)),
    expirationTime: new Date(expirationTime),
    requestId: String(challenge.requestId),
  })
  return {
    message,
    signature: `0x${'a'.repeat(130)}`,
    nonce: challenge.nonce,
    fid: FID,
    requestId: challenge.requestId,
    domain: DOMAIN,
    siweUri: SIWE_URI,
    expirationTime,
    expiresAt: challenge.expiresAt,
    bindingVerifier: BINDING_VERIFIER,
    rememberDevice: true,
    identity: { fid: FID },
    ...overrides,
  }
}

describe('Warpkeep auth bridge', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects plaintext before configuration or request-body work', async () => {
    const h = harness()
    const response = await h.app.fetch(new Request('http://auth.warpkeep.example/v2/farcaster/exchange', {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: ORIGIN },
      body: '{not-json'
    }), env({ ISSUER: undefined }))
    expect(response.status).toBe(426)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(h.events).toEqual(['plaintext_request_rejected'])
  })

  it('keeps health available while the independent public-auth kill switch rejects challenge and exchange', async () => {
    const h = harness()
    const disabled = env({ PUBLIC_AUTH_ENABLED: 'false' })
    const health = await h.app.fetch(request('/healthz'), disabled)
    expect(health.status).toBe(200)
    await expect(health.json()).resolves.toEqual({
      ok: true,
      service: 'warpkeep-auth-bridge',
      securityProfile: 'warpkeep-auth-v2',
      publicAuthEnabled: false,
    })
    for (const path of ['/v2/farcaster/challenge', '/v2/farcaster/exchange']) {
      const response = await h.app.fetch(request(path, {}, { headers: { origin: ORIGIN } }), disabled)
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'public_auth_paused' }
      })
    }
    expect(h.events).toEqual(['public_auth_paused', 'public_auth_paused'])
  })

  it('adds long-lived HSTS and centralized security headers to HTTPS responses', async () => {
    const response = await harness().app.fetch(request('/healthz'), env())
    expect(response.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    expect(response.headers.get('cross-origin-resource-policy')).toBe('same-site')
    expect(response.headers.get('x-content-type-options')).toBe('nosniff')
    expect(response.headers.get('x-frame-options')).toBe('DENY')
    expect(response.headers.get('referrer-policy')).toBe('no-referrer')
    expect(response.headers.get('content-security-policy')).toContain("default-src 'none'")
  })

  it('rejects alternate request hosts and cross-site production cookie origins', async () => {
    const h = harness()
    const misdirected = await h.app.fetch(new Request('https://alternate.warpkeep.example/healthz'), env())
    expect(misdirected.status).toBe(421)
    expect(misdirected.headers.has('access-control-allow-origin')).toBe(false)
    expect(h.events).toContain('issuer_host_rejected')

    const crossSite = await h.app.fetch(request('/healthz'), env({
      ALLOWED_ORIGINS: 'https://ael-dev3.github.io',
      FARCASTER_DOMAIN: 'ael-dev3.github.io',
      FARCASTER_SIWE_URI: 'https://ael-dev3.github.io/Warpkeep/',
    }))
    expect(crossSite.status).toBe(503)
    await expect(crossSite.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
  })

  it('rejects userinfo in the public issuer and SIWE trust coordinates', async () => {
    const h = harness()
    for (const overrides of [
      { ISSUER: 'https://operator:credential@auth.warpkeep.example' },
      { FARCASTER_SIWE_URI: 'https://operator:credential@warpkeep.example/' },
    ]) {
      const response = await h.app.fetch(request('/healthz'), env(overrides))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
    }
  })

  it('rate-limits credential-bearing POST routes without affecting health or preflight', async () => {
    const check = vi.fn(async (_request: Request, action: string) => (
      action === 'challenge'
        ? { allowed: false as const, retryAfterSeconds: 17 }
        : { allowed: true as const }
    ))
    const h = harness({ rateLimiter: { check } })

    expect((await h.app.fetch(request('/healthz'), env())).status).toBe(200)
    expect((await h.app.fetch(request('/v2/farcaster/challenge', undefined, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    }), env())).status).toBe(204)
    expect(check).not.toHaveBeenCalled()

    const limited = await h.app.fetch(request('/v2/farcaster/challenge', {}, {
      headers: { origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7' },
    }), env())
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('17')
    expect(limited.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(check).toHaveBeenCalledTimes(1)
    expect(check.mock.calls[0]?.[1]).toBe('challenge')
    expect(h.events).toContain('rate_limited')
  })

  it('rate-limits the admin token path without adding browser CORS', async () => {
    const h = harness({
      rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 29 }) },
    })
    const limited = await h.app.fetch(request('/v1/admin/token', undefined, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBe('29')
    expect(limited.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('fails closed when distributed rate control is unavailable', async () => {
    const h = harness({
      rateLimiter: { check: async () => { throw new Error('offline') } },
    })
    const response = await h.app.fetch(request('/v2/farcaster/challenge', {}, {
      headers: { origin: ORIGIN },
    }), env())
    expect(response.status).toBe(503)
    expect(h.events).toContain('rate_limit_failed')
  })

  it('fails closed when CF-Connecting-IP is missing or malformed and never trusts X-Forwarded-For', async () => {
    const events: SafeLogEvent[] = []
    const namespace = {
      idFromName: vi.fn(),
      get: vi.fn(),
    }
    const app = createAuthBridge({
      challengeStore: new MemoryChallengeStore(),
      verifier: { verify: vi.fn(async () => ({ fid: FID })) },
      authEpochResolver: { resolve: vi.fn(async () => ({ state: 'missing', authEpoch: 0 } as const)) },
      logger: { event: (event) => events.push(event) },
    })
    const headerCases: HeadersInit[] = [
      { origin: ORIGIN },
      { origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' },
      { origin: ORIGIN, 'cf-connecting-ip': 'bad', 'x-forwarded-for': '203.0.113.7' },
    ]
    for (const headers of headerCases) {
      const response = await app.fetch(request('/v2/farcaster/challenge', {}, { headers }), env({
        AUTH_RATE_LIMITER: namespace as never,
      }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'rate_limit_unavailable' } })
    }
    expect(namespace.idFromName).not.toHaveBeenCalled()
    expect(events.filter((event) => event === 'rate_limit_failed')).toHaveLength(3)
  })

  it.each(['/v2/farcaster/challenge', '/v2/farcaster/exchange'])(
    'rejects a simple hostile browser request to %s before quota consumption',
    async (pathname) => {
    const check = vi.fn(async () => ({ allowed: true as const }))
    const h = harness({ rateLimiter: { check } })
    const response = await h.app.fetch(new Request(`https://auth.warpkeep.example${pathname}`, {
      method: 'POST',
      headers: {
        origin: 'https://hostile.example',
        'content-type': 'text/plain',
        'cf-connecting-ip': '203.0.113.7',
      },
      body: 'drive-by',
    }), env())
    expect(response.status).toBe(403)
    expect(check).not.toHaveBeenCalled()
    },
  )

  it('rejects browser-origin admin requests before they can consume an admin bucket', async () => {
    const check = vi.fn(async () => ({ allowed: true as const }))
    const h = harness({ rateLimiter: { check } })
    const response = await h.app.fetch(request('/v1/admin/token', undefined, {
      method: 'POST',
      headers: { origin: ORIGIN, 'cf-connecting-ip': '203.0.113.7' },
    }), env())
    expect(response.status).toBe(403)
    expect(check).not.toHaveBeenCalled()
  })

  it.each(SERVER_ONLY_ADMIN_PATHS.flatMap(pathname => [ORIGIN, 'https://hostile.example']
    .map(origin => [pathname, origin] as const)))(
    'rejects browser POST access to %s from %s without exposing CORS',
    async (pathname, origin) => {
      const check = vi.fn(async () => ({ allowed: true as const }))
      const h = harness({ rateLimiter: { check } })
      const response = await h.app.fetch(request(pathname, undefined, {
        method: 'POST',
        headers: { origin },
      }), env())

      expect(response.status).toBe(403)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'admin_browser_forbidden', message: 'This endpoint is server-only.' },
      })
      expect([...response.headers.keys()].filter(name => name.startsWith('access-control-'))).toEqual([])
      expect(check).not.toHaveBeenCalled()
    },
  )

  it.each(SERVER_ONLY_ADMIN_PATHS.flatMap(pathname => [ORIGIN, 'https://hostile.example']
    .flatMap(origin => ['GET', 'OPTIONS'].map(method => [method, pathname, origin] as const))))(
    'keeps unsupported %s browser access to %s from %s CORS-free',
    async (method, pathname, origin) => {
      const headers: Record<string, string> = { origin }
      if (method === 'OPTIONS') {
        headers['access-control-request-method'] = 'POST'
        headers['access-control-request-headers'] = 'authorization, content-type'
      }
      const response = await harness().app.fetch(request(pathname, undefined, {
        method,
        headers,
      }), env())

      expect(response.status).toBe(404)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'not_found', message: 'Route not found.' },
      })
      expect([...response.headers.keys()].filter(name => name.startsWith('access-control-'))).toEqual([])
    },
  )

  it.each([
    ['/v2/farcaster/challenge', 'challenge_query_not_allowed'],
    ['/v2/farcaster/exchange', 'exchange_query_not_allowed'],
    ['/v2/session/refresh', 'refresh_query_not_allowed'],
    ['/v2/session/logout', 'logout_query_not_allowed'],
  ] as const)(
    'rejects query strings on %s before rate limiting or identity work',
    async (pathname, code) => {
      const check = vi.fn(async () => ({ allowed: true as const }))
      const h = harness({ rateLimiter: { check } })
      const response = await h.app.fetch(request(`${pathname}?caller=value`, {
        caller: 'must-not-be-parsed',
      }, {
        headers: { origin: ORIGIN },
      }), env())

      expect(response.status).toBe(400)
      await expect(response.json()).resolves.toEqual({
        error: {
          code,
          message: 'This endpoint does not accept query parameters.',
        },
      })
      expect(response.headers.get('access-control-allow-origin')).toBe(ORIGIN)
      expect(response.headers.get('access-control-allow-credentials')).toBe('true')
      expect(check).not.toHaveBeenCalled()
      expect(h.verifier.verify).not.toHaveBeenCalled()
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    },
  )

  it('does not consume a challenge when exchange is rate-limited', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 11 })
      .mockResolvedValueOnce({ allowed: true })
    const h = harness({ rateLimiter: { check } })
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)

    const blocked = await h.app.fetch(request('/v2/farcaster/exchange', {
      ...proof,
      bindingVerifier: WRONG_BINDING_VERIFIER,
    }, {
      headers: { origin: ORIGIN },
    }), env())
    expect(blocked.status).toBe(429)
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.events).not.toContain('exchange_binding_mismatch')

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proof, {
      headers: { origin: ORIGIN },
    }), env())
    expect(retry.status).toBe(200)
    expect(h.verifier.verify).toHaveBeenCalledTimes(1)
  })

  it('publishes an exact OIDC issuer and a public-only ES256 JWKS without an external resolver configuration', async () => {
    const h = harness()
    const discovery = await h.app.fetch(request('/.well-known/openid-configuration'), env())
    expect(discovery.status).toBe(200)
    await expect(discovery.json()).resolves.toMatchObject({
      issuer: 'https://auth.warpkeep.example',
      jwks_uri: 'https://auth.warpkeep.example/.well-known/jwks.json',
      id_token_signing_alg_values_supported: ['ES256'],
    })

    const jwks = await h.app.fetch(request('/.well-known/jwks.json'), env())
    const body = await json(jwks)
    const key = (body.keys as Record<string, unknown>[])[0]
    expect(key).toMatchObject({ kty: 'EC', crv: 'P-256', alg: 'ES256', use: 'sig', kid: 'test-es256-2026' })
    expect(key).not.toHaveProperty('d')
    expect(JSON.stringify(body)).not.toContain(privateJwk.d ?? '')
  })

  it('issues a replay-protected player token with verified stable claims', async () => {
    const h = harness({ epoch: 11 })
    const challenge = await issueChallenge(h)
    expect(challenge).toMatchObject({ domain: DOMAIN, siweUri: SIWE_URI })
    expect(typeof challenge.createdAt).toBe('number')
    expect(typeof challenge.expiresAt).toBe('number')
    expect(Number(challenge.expiresAt) - Number(challenge.createdAt)).toBe(5 * 60 * 1_000)

    const exchange = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(200)
    const result = await json(exchange)
    expect(result).toMatchObject({ version: 2, status: 'authorized' })
    expect(result.identity).toEqual({ fid: Number(FID) })
    expect(result.tokenType).toBe('spacetime-access')
    const claims = decodeJwtPayload(String(result.accessToken))
    expect(claims).toMatchObject({
      iss: 'https://auth.warpkeep.example',
      sub: `farcaster:${FID}`,
      aud: ['warpkeep-spacetimedb'],
      token_type: 'spacetime-access',
      auth_version: 2,
      fid: FID,
      auth_epoch: 11,
      roles: [],
    })
    expect(claims).not.toHaveProperty('username')
    expect(claims).not.toHaveProperty('display_name')
    expect(claims).not.toHaveProperty('pfp_url')
    expect(Number(claims.exp) - Number(claims.iat)).toBe(10 * 60)
    expect(claims.session_iat).toBe(claims.iat)
    expect(claims.session_exp).toBe(claims.exp)
    expect(h.verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ acceptAuthAddress: true, nonce: challenge.nonce }))
    expect(h.resolver.resolve).toHaveBeenCalledWith(FID)
    expect(h.events).toContain('auth_epoch_resolved')

    const familyId = responseCookie(exchange).split('=', 2)[1]?.split('.')[1]
    expect(familyId).toMatch(/^[A-Za-z0-9_-]{32}$/)
    const storedFamily = await h.sessionStore.get(familyId!)
    expect(storedFamily?.identity).toEqual({ fid: FID })
    expect(Object.keys(storedFamily?.identity ?? {})).toEqual(['fid'])

    const jwks = await h.app.fetch(request('/.well-known/jwks.json'), env())
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      ((await json(jwks)).keys as JsonWebKey[])[0],
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const [header, payload, signature] = String(result.accessToken).split('.')
    await expect(crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      decodeBase64Url(signature) as unknown as BufferSource,
      new TextEncoder().encode(`${header}.${payload}`),
    )).resolves.toBe(true)
    expect(exchange.headers.get('set-cookie')).toContain('__Host-warpkeep_session=')
    expect(exchange.headers.get('set-cookie')).toContain('Secure; HttpOnly; SameSite=Strict')

    const replay = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(replay.status).toBe(401)
    await expect(replay.json()).resolves.toMatchObject({ error: { code: 'challenge_not_found' } })
  })

  it('rejects optional profile metadata before proof work and keeps the challenge retryable', async () => {
    const h = harness({ epoch: 11 })
    const challenge = await issueChallenge(h)
    const profileBearing = proofFor(challenge, {
      identity: {
        fid: FID,
        username: 'must-not-persist',
        displayName: 'Must Not Persist',
        pfpUrl: 'https://tracking.example/profile.png?user=12345',
      },
    })
    const rejected = await h.app.fetch(request('/v2/farcaster/exchange', profileBearing, {
      headers: { origin: ORIGIN },
    }), env())
    expect(rejected.status).toBe(400)
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(retry.status).toBe(200)
  })

  it('creates only a pending cookie family for a missing admission row', async () => {
    const h = harness({ epoch: 0 })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(
      request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }),
      env(),
    )
    expect(exchange.status).toBe(200)
    const body = await json(exchange)
    expect(body).toEqual({
      version: 2,
      status: 'pending-admission',
      identity: { fid: Number(FID) },
      sessionExpiresAt: expect.any(Number),
    })
    expect(body).not.toHaveProperty('accessToken')
    expect(body).not.toHaveProperty('token')
    expect(exchange.headers.get('set-cookie')).toContain('__Host-warpkeep_session=')
  })

  it('creates and refreshes a tokenless pending family for a freshly proven disabled founder', async () => {
    const signer = vi.fn(async () => 'must-not-be-issued')
    const h = harness({
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      signer,
    })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    expect(exchange.status).toBe(200)
    const pending = await json(exchange)
    expect(pending).toMatchObject({
      version: 2,
      status: 'pending-admission',
      identity: { fid: Number(FID) },
    })
    expect(pending).not.toHaveProperty('accessToken')
    expect(signer).not.toHaveBeenCalled()

    const firstCookie = responseCookie(exchange)
    const familyId = firstCookie.split('=', 2)[1]?.split('.')[1]
    await expect(h.sessionStore.get(familyId!)).resolves.toMatchObject({
      state: 'pending',
      pendingAdmissionState: 'disabled',
      identity: { fid: FID },
    })

    h.setNow(Number(challenge.createdAt) + 1_000)
    const refresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: firstCookie },
    }), env())
    expect(refresh.status).toBe(200)
    const refreshed = await json(refresh)
    expect(refreshed).toMatchObject({
      version: 2,
      status: 'pending-admission',
      identity: { fid: Number(FID) },
    })
    expect(refreshed).not.toHaveProperty('accessToken')
    expect(responseCookie(refresh)).not.toBe(firstCookie)
    expect(signer).not.toHaveBeenCalled()
  })

  it('binds a pending cookie family once after first admission and only then returns a short access token', async () => {
    let admission: Awaited<ReturnType<AuthEpochResolver['resolve']>> = { state: 'missing', authEpoch: 0 }
    const resolver: AuthEpochResolver = { resolve: vi.fn(async () => admission) }
    const h = harness({ resolver })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    const pending = await json(exchange)
    expect(pending).toMatchObject({ version: 2, status: 'pending-admission' })
    expect(JSON.stringify(pending)).not.toContain('accessToken')

    admission = { state: 'enabled', authEpoch: 1 } as const
    h.setNow(Number(challenge.createdAt) + 1_000)
    const refresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: responseCookie(exchange) },
    }), env())
    expect(refresh.status).toBe(200)
    const authorized = await json(refresh)
    expect(authorized).toMatchObject({ version: 2, status: 'authorized', tokenType: 'spacetime-access' })
    expect(authorized.identity).toEqual({ fid: Number(FID) })
    const claims = decodeJwtPayload(String(authorized.accessToken))
    expect(claims).toMatchObject({ auth_version: 2, auth_epoch: 1 })
    expect(claims).not.toHaveProperty('username')
    expect(claims).not.toHaveProperty('display_name')
    expect(claims).not.toHaveProperty('pfp_url')
    expect(Number(claims.exp) - Number(claims.iat)).toBe(600)
  })

  it('rotates cookies, recovers one parallel/lost response, and revokes stale reuse after grace', async () => {
    const h = harness({ epoch: 7 })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    const firstCookie = responseCookie(exchange)
    const createdAt = Number(challenge.createdAt)

    h.setNow(createdAt + 1_000)
    const firstRefresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: firstCookie },
    }), env())
    expect(firstRefresh.status).toBe(200)
    const rotatedCookie = responseCookie(firstRefresh)
    expect(rotatedCookie).not.toBe(firstCookie)

    h.setNow(createdAt + 2_000)
    const recovered = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: firstCookie },
    }), env())
    expect(recovered.status).toBe(200)
    expect(responseCookie(recovered)).toBe(rotatedCookie)

    h.setNow(createdAt + 31_001)
    const stale = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: firstCookie },
    }), env())
    expect(stale.status).toBe(401)
    expect(stale.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(h.events).toContain('session_revoked')
  })

  it('revokes a bound family instead of adopting a bumped epoch', async () => {
    let admission: Awaited<ReturnType<AuthEpochResolver['resolve']>> = { state: 'enabled', authEpoch: 7 }
    const resolver: AuthEpochResolver = { resolve: vi.fn(async () => admission) }
    const h = harness({ resolver })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    admission = { state: 'enabled', authEpoch: 8 }
    h.setNow(Number(challenge.createdAt) + 1_000)
    const refresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: responseCookie(exchange) },
    }), env())
    expect(refresh.status).toBe(401)
    expect(refresh.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(h.events).toContain('session_revoked')
  })

  it('revokes a pre-revocation bound family instead of downgrading it to application authority', async () => {
    let admission: Awaited<ReturnType<AuthEpochResolver['resolve']>> = {
      state: 'enabled',
      authEpoch: 7,
    }
    const resolver: AuthEpochResolver = { resolve: vi.fn(async () => admission) }
    const h = harness({ resolver })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    expect(exchange.status).toBe(200)

    admission = { state: 'disabled', authEpoch: 0 }
    h.setNow(Number(challenge.createdAt) + 1_000)
    const refresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie: responseCookie(exchange) },
    }), env())
    expect(refresh.status).toBe(403)
    await expect(refresh.json()).resolves.toMatchObject({
      error: { code: 'session_invalid' },
    })
    expect(refresh.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(h.events).toContain('session_revoked')
  })

  it('clears and revokes the family on logout even though public session refresh is paused', async () => {
    const h = harness({ epoch: 7 })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge, { rememberDevice: false }),
      { headers: { origin: ORIGIN } },
    ), env())
    const cookie = responseCookie(exchange)
    expect(exchange.headers.get('set-cookie')).not.toContain('Max-Age=2592000')

    const logout = await h.app.fetch(request('/v2/session/logout', {}, {
      headers: { origin: ORIGIN, cookie },
    }), env({ PUBLIC_AUTH_ENABLED: 'false' }))
    expect(logout.status).toBe(204)
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(logout.headers.get('access-control-allow-credentials')).toBe('true')

    const refresh = await h.app.fetch(request('/v2/session/refresh', {}, {
      headers: { origin: ORIGIN, cookie },
    }), env())
    expect(refresh.status).toBe(401)
  })

  it('expires the browser cookie but reports a generic failure when durable logout revocation fails', async () => {
    const backing = new MemorySessionFamilyStore()
    const sessionFamilyStore: SessionFamilyStore = {
      create: (familyId, record) => backing.create(familyId, record),
      get: (familyId) => backing.get(familyId),
      refresh: (familyId, generation, origin, admission, now) => (
        backing.refresh(familyId, generation, origin, admission, now)
      ),
      revoke: async () => { throw new Error('sensitive-store-detail') },
    }
    const h = harness({ epoch: 7, sessionFamilyStore })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())

    const logout = await h.app.fetch(request('/v2/session/logout', {}, {
      headers: { origin: ORIGIN, cookie: responseCookie(exchange) },
    }), env({ PUBLIC_AUTH_ENABLED: 'false' }))
    expect(logout.status).toBe(503)
    await expect(logout.json()).resolves.toEqual({
      error: { code: 'session_unavailable', message: 'Authentication is temporarily unavailable.' },
    })
    expect(logout.headers.get('set-cookie')).toContain('Max-Age=0')
    expect(logout.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(logout.headers.get('access-control-allow-credentials')).toBe('true')
    expect(h.events).toContain('session_revoke_failed')
    expect(h.events).not.toContain('session_revoked')
    expect(JSON.stringify(h.events)).not.toContain('sensitive-store-detail')
  })

  it('retires legacy bearer routes and gives v2 preflight exact credentialed CORS', async () => {
    const h = harness()
    for (const path of ['/v1/farcaster/challenge', '/v1/farcaster/exchange']) {
      const retired = await h.app.fetch(request(path, {}, { headers: { origin: ORIGIN } }), env())
      expect(retired.status).toBe(410)
      await expect(retired.json()).resolves.toMatchObject({ error: { code: 'legacy_auth_retired' } })
    }
    const preflight = await h.app.fetch(request('/v2/session/refresh', undefined, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    }), env())
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(preflight.headers.get('access-control-allow-credentials')).toBe('true')
    expect(preflight.headers.get('strict-transport-security')).toBe('max-age=31536000; includeSubDomains')
    expect(preflight.headers.get('cross-origin-resource-policy')).toBe('same-site')
    expect(preflight.headers.get('x-content-type-options')).toBe('nosniff')
    expect(preflight.headers.has('content-type')).toBe(false)
  })

  it('does not issue a player JWT when the server-side auth epoch lookup fails', async () => {
    const h = harness({ resolver: { resolve: async () => { throw new Error('offline') } } })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(503)
    await expect(exchange.json()).resolves.toMatchObject({ error: { code: 'authorization_unavailable' } })
    expect(h.events).toContain('auth_epoch_failed')
    expect(h.events.filter((event) => event.startsWith('auth_epoch_failed_'))).toEqual([])
  })

  it.each([
    ['signing', 'auth_epoch_failed_signing'],
    ['fetch_request', 'auth_epoch_failed_fetch_request'],
    ['fetch_body', 'auth_epoch_failed_fetch_body'],
    ['timeout', 'auth_epoch_failed_timeout'],
    ['upstream_status', 'auth_epoch_failed_upstream_status'],
    ['response_validation', 'auth_epoch_failed_response_validation'],
  ] as const)('keeps the %s resolver stage out of the browser response and emits only its static event', async (stage, event) => {
    const h = harness({
      resolver: { resolve: async () => { throw new AuthEpochResolverFailure(stage) } },
    })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(
      request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }),
      env(),
    )

    expect(exchange.status).toBe(503)
    const body = await json(exchange)
    expect(body).toMatchObject({ error: { code: 'authorization_unavailable' } })
    expect(JSON.stringify(body)).not.toContain(stage)
    expect(h.events).toContain('auth_epoch_failed')
    expect(h.events).toContain(event)
    expect(h.events.filter((candidate) => candidate.startsWith('auth_epoch_failed_'))).toEqual([event])
  })

  it('requires an exact canonical S256 binding before persisting a challenge', async () => {
    const put = vi.fn(async () => undefined)
    const challengeStore: ChallengeStore = {
      put,
      get: vi.fn(async () => null),
      consume: vi.fn(async () => null),
    }
    const h = harness({ challengeStore })
    const invalidRequests: Record<string, unknown>[] = [
      { domain: DOMAIN, siweUri: SIWE_URI },
      {
        domain: DOMAIN,
        siweUri: SIWE_URI,
        bindingChallenge: BINDING_CHALLENGE,
        bindingMethod: 'plain',
      },
      {
        domain: DOMAIN,
        siweUri: SIWE_URI,
        bindingChallenge: 'A'.repeat(42),
        bindingMethod: 'S256',
      },
      {
        domain: DOMAIN,
        siweUri: SIWE_URI,
        bindingChallenge: `${'A'.repeat(42)}B`,
        bindingMethod: 'S256',
      },
      {
        domain: DOMAIN,
        siweUri: SIWE_URI,
        bindingChallenge: BINDING_CHALLENGE,
        bindingMethod: 'S256',
        bindingVerifier: BINDING_VERIFIER,
      },
    ]

    for (const body of invalidRequests) {
      const response = await h.app.fetch(request('/v2/farcaster/challenge', body, {
        headers: { origin: ORIGIN },
      }), env())
      expect(response.status).toBe(400)
    }
    expect(put).not.toHaveBeenCalled()

    const response = await h.app.fetch(request('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }, { headers: { origin: ORIGIN } }), env())
    expect(response.status).toBe(201)
    expect(put).toHaveBeenCalledOnce()
    expect(put).toHaveBeenCalledWith(expect.objectContaining({
      version: 2,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }))
    const responseText = await response.text()
    expect(responseText).not.toContain(BINDING_CHALLENGE)
    expect(responseText).not.toContain(BINDING_VERIFIER)
  })

  it('rejects arbitrary SIWF context, invalid proof signatures, and FID mismatches', async () => {
    const h = harness()
    const badChallenge = await h.app.fetch(request('/v2/farcaster/challenge', {
      domain: 'evil.example',
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }, { headers: { origin: ORIGIN } }), env())
    expect(badChallenge.status).toBe(400)

    const challenge = await issueChallenge(h)
    h.verifier.verify.mockRejectedValueOnce(new Error('invalid signature'))
    const invalidSignature = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(invalidSignature.status).toBe(401)
    await expect(invalidSignature.json()).resolves.toMatchObject({ error: { code: 'invalid_proof' } })
    const invalidReplay = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(invalidReplay.status).toBe(401)
    await expect(invalidReplay.json()).resolves.toMatchObject({ error: { code: 'challenge_not_found' } })

    const secondChallenge = await issueChallenge(h)
    h.verifier.verify.mockResolvedValueOnce({ fid: '99999' })
    const mismatch = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(secondChallenge), { headers: { origin: ORIGIN } }), env())
    expect(mismatch.status).toBe(401)
    await expect(mismatch.json()).resolves.toMatchObject({ error: { code: 'fid_mismatch' } })
  })

  it('accepts a bounded smart-account signature shape for official verification', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request('/v2/farcaster/exchange', {
      ...proofFor(challenge),
      signature: `0x${'ab'.repeat(96)}`,
    }, { headers: { origin: ORIGIN } }), env())

    expect(exchange.status).toBe(200)
    expect(h.verifier.verify).toHaveBeenCalledWith(expect.objectContaining({
      signature: `0x${'ab'.repeat(96)}`,
    }))
  })

  it('restores a challenge only when the Farcaster verifier is unavailable', async () => {
    const verifier: FarcasterVerifier = { verify: vi.fn() }
    vi.mocked(verifier.verify)
      .mockRejectedValueOnce(new FarcasterVerifierUnavailableError())
      .mockResolvedValueOnce({ fid: FID })
    const h = harness({ verifier })
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)

    const unavailable = await h.app.fetch(request('/v2/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toMatchObject({ error: { code: 'verification_unavailable' } })

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(retry.status).toBe(200)
    expect(verifier.verify).toHaveBeenCalledTimes(2)
  })

  it('bounds a stalled Farcaster verifier and restores the still-live claimed challenge', async () => {
    let verificationCalls = 0
    let markVerificationStarted!: () => void
    const verificationStarted = new Promise<void>((resolve) => {
      markVerificationStarted = resolve
    })
    const verifier: FarcasterVerifier = {
      async verify() {
        verificationCalls += 1
        if (verificationCalls === 1) {
          markVerificationStarted()
          return new Promise<never>(() => undefined)
        }
        return { fid: FID }
      },
    }
    const h = harness({ verifier })
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)

    vi.useFakeTimers()
    try {
      const pending = h.app.fetch(request('/v2/farcaster/exchange', proof, {
        headers: { origin: ORIGIN },
      }), env())
      await verificationStarted
      await vi.advanceTimersByTimeAsync(FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS)

      const unavailable = await pending
      expect(unavailable.status).toBe(503)
      await expect(unavailable.json()).resolves.toEqual({
        error: {
          code: 'verification_unavailable',
          message: 'Farcaster verification is temporarily unavailable.',
        },
      })
      expect(h.events).toContain('exchange_rejected')

      const retry = await h.app.fetch(request('/v2/farcaster/exchange', proof, {
        headers: { origin: ORIGIN },
      }), env())
      expect(retry.status).toBe(200)
      expect(verificationCalls).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('enforces the CORS allowlist and rejects oversize bodies before parsing', async () => {
    const h = harness()
    const preflight = await h.app.fetch(new Request('https://auth.warpkeep.example/v2/farcaster/challenge', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env())
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)

    const blocked = await h.app.fetch(request('/v2/farcaster/challenge', {}, { headers: { origin: 'https://evil.example' } }), env())
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull()

    const tooLarge = await h.app.fetch(request('/v2/farcaster/challenge', { domain: DOMAIN, siweUri: SIWE_URI, padding: 'x'.repeat(20_000) }, { headers: { origin: ORIGIN } }), env())
    expect(tooLarge.status).toBe(413)

    const wrongMediaType = await h.app.fetch(request('/v2/farcaster/challenge', {}, {
      headers: { origin: ORIGIN, 'content-type': 'application/jsonp' },
    }), env())
    expect(wrongMediaType.status).toBe(415)
  })

  it('cancels a chunked body as soon as it crosses the byte limit', async () => {
    const h = harness()
    let cancelled = false
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(9_000))
        if (pulls >= 3) controller.close()
      },
      cancel() {
        cancelled = true
      },
    }, { highWaterMark: 0 })
    const oversized = new Request('https://auth.warpkeep.example/v2/farcaster/challenge', {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json' },
      body,
      duplex: 'half',
    } as RequestInit)

    const response = await h.app.fetch(oversized, env())
    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(pulls).toBeLessThanOrEqual(2)
  })

  it('bounds stalled browser JSON and server-only admin request bodies', async () => {
    const h = harness()
    vi.useFakeTimers()
    try {
      let browserBodyCancelled = false
      const browserBody = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('{'))
        },
        cancel() {
          browserBodyCancelled = true
        },
      })
      const browserResponsePromise = h.app.fetch(new Request(
        'https://auth.warpkeep.example/v2/session/logout',
        {
          method: 'POST',
          headers: { origin: ORIGIN, 'content-type': 'application/json' },
          body: browserBody,
          duplex: 'half',
        } as RequestInit,
      ), env())
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(REQUEST_BODY_TIMEOUT_MILLISECONDS)
      const browserResponse = await browserResponsePromise
      expect(browserResponse.status).toBe(408)
      await expect(browserResponse.json()).resolves.toEqual({
        error: {
          code: 'request_body_timeout',
          message: 'Request body was not received in time.',
        },
      })
      expect(browserResponse.headers.get('access-control-allow-origin')).toBe(ORIGIN)
      expect(browserResponse.headers.get('access-control-allow-credentials')).toBe('true')
      expect(browserBodyCancelled).toBe(true)

      let adminBodyCancelled = false
      const adminBody = new ReadableStream<Uint8Array>({
        start() {
          // A chunked zero-byte body that never closes must remain bounded.
        },
        cancel() {
          adminBodyCancelled = true
        },
      })
      const adminResponsePromise = h.app.fetch(new Request(
        'https://auth.warpkeep.example/v1/admin/token',
        {
          method: 'POST',
          headers: { authorization: `Bearer ${ADMIN_SECRET}` },
          body: adminBody,
          duplex: 'half',
        } as RequestInit,
      ), env())
      await vi.advanceTimersByTimeAsync(0)
      await vi.advanceTimersByTimeAsync(REQUEST_BODY_TIMEOUT_MILLISECONDS)
      const adminResponse = await adminResponsePromise
      expect(adminResponse.status).toBe(408)
      await expect(adminResponse.json()).resolves.toEqual({
        error: {
          code: 'request_body_timeout',
          message: 'Request body was not received in time.',
        },
      })
      expect(adminResponse.headers.has('access-control-allow-origin')).toBe(false)
      expect(adminBodyCancelled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('requires the server-only admin secret and issues a five-minute admin token', async () => {
    const h = harness()
    const missing = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', { method: 'POST' }), env())
    expect(missing.status).toBe(401)

    const digest = vi.spyOn(crypto.subtle, 'digest')
    const oversized = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { authorization: `Bearer ${'A'.repeat(513)}` },
    }), env())
    expect(oversized.status).toBe(401)
    await expect(oversized.json()).resolves.toMatchObject({ error: { code: 'invalid_admin_credentials' } })
    expect(digest).not.toHaveBeenCalled()
    digest.mockRestore()

    const browser = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { origin: ORIGIN, authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(browser.status).toBe(403)

    const queried = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token?format=json', {
      method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(queried.status).toBe(400)
    await expect(queried.json()).resolves.toMatchObject({ error: { code: 'admin_query_not_allowed' } })

    const granted = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(granted.status).toBe(200)
    const grantedBody = await json(granted)
    expect(grantedBody.tokenType).toBe('spacetime-access')
    const claims = decodeJwtPayload(String(grantedBody.token))
    expect(claims).toMatchObject({ sub: 'service:hermes', roles: ['warpkeep-admin'], token_type: 'spacetime-access' })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(5 * 60)
  })

  it('routes the input-free synthetic probe through the configured resolver', async () => {
    const resolve = vi.fn(async () => ({ state: 'enabled', authEpoch: 37 } as const))
    const check = vi.fn(async (_request: Request, _action: string) => ({ allowed: true as const }))
    const h = harness({ resolver: { resolve }, rateLimiter: { check } })
    const response = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())

    expect(response.status).toBe(200)
    const responseText = await response.text()
    expect(JSON.parse(responseText)).toEqual({ ok: true })
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(resolve).toHaveBeenCalledOnce()
    expect(resolve).toHaveBeenCalledWith('9007199254740991')
    expect(responseText).not.toContain('37')
    expect(check).toHaveBeenCalledOnce()
    expect(check.mock.calls[0]?.[1]).toBe('admin-token')
    expect(h.events).toContain('auth_epoch_probe_succeeded')
  })

  it('returns a private deterministic non-secret configuration attestation', async () => {
    const h = harness()
    const call = (overrides: Partial<WorkerEnv> = {}) => h.app.fetch(new Request(
      'https://auth.warpkeep.example/v1/admin/config-attestation',
      { method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` } },
    ), env(overrides))
    const first = await call()
    const second = await call()
    expect(first.status).toBe(200)
    const firstBody = await json(first)
    const secondBody = await json(second)
    expect(firstBody).toEqual(secondBody)
    const farcasterRpcEndpointFingerprints = (await Promise.all([
      farcasterRpcEndpointFingerprint('https://optimism-rpc-one.example.com/'),
      farcasterRpcEndpointFingerprint('https://optimism-rpc-two.example.net/'),
    ])).sort()
    const farcasterRpcEndpointRoleFingerprints = {
      primary: await farcasterRpcEndpointFingerprint(
        'https://optimism-rpc-one.example.com/',
      ),
      secondary: await farcasterRpcEndpointFingerprint(
        'https://optimism-rpc-two.example.net/',
      ),
    }
    const signingPublicKeyThumbprint = await qaObserverKeyThumbprint({
      kty: 'EC',
      crv: 'P-256',
      x: String(privateJwk.x),
      y: String(privateJwk.y),
    })
    expect(firstBody).toMatchObject({
      profile: 'warpkeep-auth-v2',
      farcasterRpcEndpointFingerprints,
      farcasterRpcEndpointRoleFingerprints,
      approvalNotificationsEnabled: false,
      miniAppHubEndpointFingerprints: [],
      miniAppNotificationClientFids: [],
      signingPublicKeyThumbprint,
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
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
      qaObserverEnabled: false,
      qaObserverSpacetimeDbUri: null,
      qaObserverSpacetimeDbDatabase: null,
      qaObserverAudience: null,
      qaObserverKeyFingerprint: null,
      qaObserverKeyRegisteredAt: null,
      qaObserverKeyExpiresAt: null,
      qaObserverMaxRegistrationLifetimeMilliseconds: 366 * 24 * 60 * 60 * 1_000,
    })
    const reviewedCanonical = JSON.stringify({
      profile: 'warpkeep-auth-v2',
      issuer: 'https://auth.warpkeep.example',
      allowedOrigins: ['https://warpkeep.example'],
      domain: 'warpkeep.example',
      siweUri: 'https://warpkeep.example/Warpkeep/',
      audience: 'warpkeep-spacetimedb',
      keyId: 'test-es256-2026',
      farcasterRpcEndpointFingerprints,
      farcasterRpcEndpointRoleFingerprints,
      approvalNotificationsEnabled: false,
      miniAppHubEndpointFingerprints: [],
      miniAppNotificationClients: [],
      signingPublicKeyThumbprint,
      spacetimeDbUri: 'https://maincloud.spacetimedb.com',
      spacetimeDbDatabase: PRODUCTION_SPACETIMEDB_DATABASE,
      publicAuthEnabled: true,
      accessExpectedFidRequired: false,
      qaObserverEnabled: false,
      qaObserverSpacetimeDbUri: null,
      qaObserverSpacetimeDbDatabase: null,
      qaObserverAudience: null,
      qaObserverKeyFingerprint: null,
      qaObserverKeyRegisteredAt: null,
      qaObserverKeyExpiresAt: null,
      qaObserverScope: 'realm.snapshot',
      qaObserverChallengeTtlMilliseconds: 60_000,
      qaObserverMaxRegistrationLifetimeMilliseconds: 366 * 24 * 60 * 60 * 1_000,
      qaSnapshotResolverTokenTtlSeconds: 15,
      qaSnapshotResolverTimeoutMilliseconds: 5_000,
      qaSnapshotProcedure: 'qa_observer_get_realm_attestation_v2',
      environment: 'production',
      browserBinding: 'S256',
      quickAuthIssuer: 'https://auth.farcaster.xyz',
      quickAuthDomain: 'warpkeep.com',
      quickAuthBrowserOrigin: 'https://warpkeep.com',
      quickAuthExchangePath: '/v2/farcaster/quick-auth/exchange',
      quickAuthVerifierPackage: '@farcaster/quick-auth@0.0.8',
      quickAuthMaxTokenBytes: 8 * 1024,
      quickAuthMaxIssuerLifetimeSeconds: 60 * 60,
      accessTokenTtlSeconds: 600,
      authEpochResolverTokenTtlSeconds: 15,
      authEpochResolverTimeoutMilliseconds: 5_000,
      accessRequestStatusPath: '/v2/access/status',
      accessRequestSubmitPath: '/v2/access/request',
      accessRequestResolverTokenTtlSeconds: 15,
      accessRequestResolverTimeoutMilliseconds: 5_000,
      accessRequestStatusProcedure: 'access_request_get_status_v1',
      accessRequestSubmitProcedure: 'access_request_submit_v1',
      challengeTtlMilliseconds: 5 * 60 * 1_000,
      sessionFamilyTtlSeconds: 30 * 24 * 60 * 60,
      sessionCookie: '__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/',
    })
    const reviewedDigest = Array.from(new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(reviewedCanonical)),
    ), (byte) => byte.toString(16).padStart(2, '0')).join('')
    expect(firstBody.digest).toBe(reviewedDigest)
    const serialized = JSON.stringify(firstBody)
    expect(serialized).not.toContain(ADMIN_SECRET)
    expect(serialized).not.toContain(SESSION_COOKIE_KEY)
    expect(serialized).not.toContain(privateJwk.d ?? '')
    expect(serialized).not.toContain('https://optimism-rpc-one.example.com')
    expect(serialized).not.toContain('https://optimism-rpc-two.example.net')
    const paused = await json(await call({ PUBLIC_AUTH_ENABLED: 'false' }))
    expect(paused.digest).not.toBe(reviewedDigest)
    expect(paused.publicAuthEnabled).toBe(false)
    const strictAccessCorrelation = await json(await call({
      ACCESS_EXPECTED_FID_REQUIRED: 'true',
    }))
    expect(strictAccessCorrelation.digest).not.toBe(reviewedDigest)
    expect(strictAccessCorrelation.accessExpectedFidRequired).toBe(true)
    const rpcDrift = await json(await call({
      FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-three.example.org',
    }))
    expect(rpcDrift.digest).not.toBe(reviewedDigest)
    expect(rpcDrift.farcasterRpcEndpointFingerprints).not.toEqual(farcasterRpcEndpointFingerprints)
    expect(rpcDrift.farcasterRpcEndpointRoleFingerprints).toEqual({
      primary: farcasterRpcEndpointRoleFingerprints.primary,
      secondary: await farcasterRpcEndpointFingerprint(
        'https://optimism-rpc-three.example.org/',
      ),
    })
    const rpcRoleSwap = await json(await call({
      FARCASTER_RPC_URL: 'https://optimism-rpc-two.example.net/',
      FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-one.example.com/',
    }))
    expect(rpcRoleSwap.farcasterRpcEndpointFingerprints)
      .toEqual(farcasterRpcEndpointFingerprints)
    expect(rpcRoleSwap.farcasterRpcEndpointRoleFingerprints).toEqual({
      primary: farcasterRpcEndpointRoleFingerprints.secondary,
      secondary: farcasterRpcEndpointRoleFingerprints.primary,
    })
    expect(rpcRoleSwap.digest).not.toBe(reviewedDigest)
    const replacementPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const replacementJwk = await crypto.subtle.exportKey('jwk', replacementPair.privateKey)
    const signingKeyDrift = await json(await call({
      SIGNING_KEY_JWK: JSON.stringify(replacementJwk),
    }))
    expect(signingKeyDrift.digest).not.toBe(reviewedDigest)
    expect(signingKeyDrift.signingPublicKeyThumbprint).not.toBe(signingPublicKeyThumbprint)
    expect(first.headers.has('access-control-allow-origin')).toBe(false)
    expect(h.events).toContain('config_attestation_issued')
  })

  it('wires the synthetic probe to the production resolver factory', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('["missing",0]', {
      headers: { 'content-type': 'application/json' },
    }))
    const events: SafeLogEvent[] = []
    const app = createAuthBridge({
      rateLimiter: { check: async () => ({ allowed: true }) },
      logger: { event: (event) => events.push(event) },
    })
    const response = await app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ ok: true })
    expect(upstream).toHaveBeenCalledOnce()
    const [input, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit]
    expect(input.toString()).toBe(
      `https://maincloud.spacetimedb.com/v1/database/${PRODUCTION_SPACETIMEDB_DATABASE}/call/auth_resolver_get_fid_admission_v2`,
    )
    expect(init.body).toBe('[9007199254740991]')
    expect(init.redirect).toBe('manual')
    expect(events).toContain('auth_epoch_probe_succeeded')
  })

  it.each([
    'signing',
    'fetch_request',
    'fetch_body',
    'timeout',
    'upstream_status',
    'response_validation',
  ] as const)('returns only the authenticated closed %s probe stage', async (stage: AuthEpochResolverFailureStage) => {
    const h = harness({
      resolver: { resolve: async () => { throw new AuthEpochResolverFailure(stage) } },
    })
    const response = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())

    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toEqual({ ok: false, stage })
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(h.events).toContain('auth_epoch_probe_failed')
  })

  it('does not fabricate a probe stage for an unexpected resolver bug', async () => {
    const h = harness({
      resolver: { resolve: async () => { throw new Error('unexpected-sensitive-detail') } },
    })
    const response = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())

    expect(response.status).toBe(500)
    const body = await json(response)
    expect(body).toEqual({ error: { code: 'internal_error', message: 'Authentication service failed.' } })
    expect(JSON.stringify(body)).not.toContain('unexpected-sensitive-detail')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(h.events).toContain('internal_error')
    expect(h.events).not.toContain('auth_epoch_probe_failed')
  })

  it('keeps an unexpected production-resolver contract bug untyped and private', async () => {
    const sensitive = 'unexpected-sensitive-production-response-contract-detail'
    const malformedResponse = {
      get ok(): boolean {
        throw new Error(sensitive)
      },
    } as Response
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(malformedResponse)
    const events: SafeLogEvent[] = []
    const app = createAuthBridge({
      rateLimiter: { check: async () => ({ allowed: true }) },
      logger: { event: (event) => events.push(event) },
    })
    const response = await app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())

    expect(response.status).toBe(500)
    const responseText = await response.text()
    expect(JSON.parse(responseText)).toEqual({
      error: { code: 'internal_error', message: 'Authentication service failed.' },
    })
    expect(responseText).not.toContain(sensitive)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(upstream).toHaveBeenCalledOnce()
    expect(events).toContain('internal_error')
    expect(events).not.toContain('auth_epoch_probe_failed')
  })

  it('keeps the synthetic probe server-only, input-free, rate-limited, and CORS-free', async () => {
    const resolve = vi.fn(async () => ({ state: 'missing', authEpoch: 0 } as const))
    const h = harness({ resolver: { resolve } })

    for (const method of ['GET', 'OPTIONS']) {
      const unsupported = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
        method,
        headers: { origin: ORIGIN, authorization: `Bearer ${ADMIN_SECRET}` },
      }), env())
      expect(unsupported.status).toBe(404)
      expect(unsupported.headers.has('access-control-allow-origin')).toBe(false)
    }

    const missing = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
    }), env())
    expect(missing.status).toBe(401)
    expect(missing.headers.has('access-control-allow-origin')).toBe(false)

    const wrongCredential = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${'Z'.repeat(ADMIN_SECRET.length)}` },
    }), env())
    expect(wrongCredential.status).toBe(401)
    await expect(wrongCredential.json()).resolves.toEqual({
      error: { code: 'invalid_admin_credentials', message: 'Admin credentials are invalid.' },
    })
    expect(wrongCredential.headers.has('access-control-allow-origin')).toBe(false)
    expect(resolve).not.toHaveBeenCalled()
    expect(h.events.filter((event) => event === 'admin_probe_rejected')).toHaveLength(2)

    const browser = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { origin: ORIGIN, authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(browser.status).toBe(403)
    expect(browser.headers.has('access-control-allow-origin')).toBe(false)

    const queried = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe?fid=12345', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(queried.status).toBe(400)
    await expect(queried.json()).resolves.toMatchObject({ error: { code: 'admin_query_not_allowed' } })
    expect(queried.headers.has('access-control-allow-origin')).toBe(false)

    const bodied = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
      body: '{}',
    }), env())
    expect(bodied.status).toBe(400)
    await expect(bodied.json()).resolves.toMatchObject({ error: { code: 'admin_body_not_allowed' } })
    expect(resolve).not.toHaveBeenCalled()
    expect(h.events).toContain('admin_probe_rejected')

    const check = vi.fn(async (_request: Request, _action: string) => ({ allowed: false as const, retryAfterSeconds: 23 }))
    const limitedResolve = vi.fn(async () => ({ state: 'missing', authEpoch: 0 } as const))
    const limited = harness({ resolver: { resolve: limitedResolve }, rateLimiter: { check } })
    const limitedResponse = await limited.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('retry-after')).toBe('23')
    expect(limitedResponse.headers.has('access-control-allow-origin')).toBe(false)
    expect(check.mock.calls[0]?.[1]).toBe('admin-token')
    expect(limitedResolve).not.toHaveBeenCalled()
  })

  it('does not pull a synthetic-probe body before the browser-origin or rate-limit gates', async () => {
    const authorization = `Bearer ${ADMIN_SECRET}`
    let browserPulls = 0
    const browserBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        browserPulls += 1
        controller.enqueue(new Uint8Array([1]))
      },
    }, { highWaterMark: 0 })
    const browserCheck = vi.fn(async () => ({ allowed: true as const }))
    const browser = harness({ rateLimiter: { check: browserCheck } })
    const browserResponse = await browser.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization, origin: ORIGIN },
      body: browserBody,
      duplex: 'half',
    } as RequestInit), env())
    expect(browserResponse.status).toBe(403)
    expect(browserPulls).toBe(0)
    expect(browserCheck).not.toHaveBeenCalled()

    let limitedPulls = 0
    const limitedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        limitedPulls += 1
        controller.enqueue(new Uint8Array([1]))
      },
    }, { highWaterMark: 0 })
    const limited = harness({
      rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 11 }) },
    })
    const limitedResponse = await limited.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/auth-epoch-probe', {
      method: 'POST',
      headers: { authorization },
      body: limitedBody,
      duplex: 'half',
    } as RequestInit), env())
    expect(limitedResponse.status).toBe(429)
    expect(limitedPulls).toBe(0)
  })

  it('accepts a production-normalized zero-byte admin stream but rejects content', async () => {
    const h = harness()
    const authorization = ['Be', 'arer ', ADMIN_SECRET].join('')
    const normalizedEmptyStream = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization },
      body: new Uint8Array(0),
    }), env())
    expect(normalizedEmptyStream.status).toBe(200)

    const bodyRejected = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization },
      body: '{}',
    }), env())
    expect(bodyRejected.status).toBe(400)
    await expect(bodyRejected.json()).resolves.toMatchObject({ error: { code: 'admin_body_not_allowed' } })
  })

  it('rejects malformed, duplicate, positive, and oversized Content-Length framing', async () => {
    const h = harness()
    const authorization = ['Be', 'arer ', ADMIN_SECRET].join('')
    const cases: Array<{ name: string; headers: Headers; status: number; code: string }> = []
    for (const contentLength of ['', ' \t', '1', String(16 * 1024 + 1)]) {
      const headers = new Headers({ authorization })
      headers.set('content-length', contentLength)
      cases.push({
        name: `Content-Length ${JSON.stringify(contentLength)}`,
        headers,
        status: contentLength === String(16 * 1024 + 1) ? 413 : 400,
        code: contentLength === String(16 * 1024 + 1) ? 'body_too_large' : 'admin_body_not_allowed',
      })
    }
    const duplicateHeaders = new Headers({ authorization })
    duplicateHeaders.append('content-length', '0')
    duplicateHeaders.append('content-length', '0')
    cases.push({ name: 'duplicate Content-Length', headers: duplicateHeaders, status: 400, code: 'admin_body_not_allowed' })

    for (const framingCase of cases) {
      expect(framingCase.headers.has('content-length')).toBe(true)
      const response = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
        method: 'POST',
        headers: framingCase.headers,
        body: new Uint8Array(0),
      }), env())
      expect(response.status, framingCase.name).toBe(framingCase.status)
      await expect(response.json()).resolves.toMatchObject({ error: { code: framingCase.code } })
    }
  })

  it('rejects raw admin body bytes before decoding and cancels the stream immediately', async () => {
    const h = harness()
    const authorization = ['Be', 'arer ', ADMIN_SECRET].join('')
    const bodyCases: Array<{ name: string; body: ArrayBuffer; headers: HeadersInit }> = [
      { name: 'UTF-8 BOM', body: new Uint8Array([0xef, 0xbb, 0xbf]).buffer, headers: { authorization } },
      { name: 'UTF-8 BOM with advertised zero length', body: new Uint8Array([0xef, 0xbb, 0xbf]).buffer, headers: { authorization, 'content-length': '0' } },
      { name: 'invalid UTF-8', body: new Uint8Array([0xff]).buffer, headers: { authorization } },
    ]
    for (const bodyCase of bodyCases) {
      const response = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
        method: 'POST',
        headers: bodyCase.headers,
        body: bodyCase.body,
      }), env())
      expect(response.status, bodyCase.name).toBe(400)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'admin_body_not_allowed' } })
    }

    let cancelled = false
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        if (pulls === 1) controller.enqueue(new Uint8Array([1]))
        else controller.close()
      },
      cancel() {
        cancelled = true
      },
    }, { highWaterMark: 0 })
    const streamed = await h.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization },
      body,
      duplex: 'half',
    } as RequestInit), env())
    expect(streamed.status).toBe(400)
    await expect(streamed.json()).resolves.toMatchObject({ error: { code: 'admin_body_not_allowed' } })
    expect(cancelled).toBe(true)
    expect(pulls).toBe(1)
  })

  it('does not pull an admin body before the rate-limit and browser-origin gates', async () => {
    const authorization = ['Be', 'arer ', ADMIN_SECRET].join('')
    let limitedPulls = 0
    const limitedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        limitedPulls += 1
        controller.enqueue(new Uint8Array([1]))
      },
    }, { highWaterMark: 0 })
    const limited = harness({
      rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 11 }) },
    })
    const limitedResponse = await limited.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization },
      body: limitedBody,
      duplex: 'half',
    } as RequestInit), env())
    expect(limitedResponse.status).toBe(429)
    expect(limitedPulls).toBe(0)

    let browserPulls = 0
    const browserBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        browserPulls += 1
        controller.enqueue(new Uint8Array([1]))
      },
    }, { highWaterMark: 0 })
    const browser = harness()
    const browserResponse = await browser.app.fetch(new Request('https://auth.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization, origin: ORIGIN },
      body: browserBody,
      duplex: 'half',
    } as RequestInit), env())
    expect(browserResponse.status).toBe(403)
    expect(browserPulls).toBe(0)
  })

  it('fails closed when the managed admin secret is too short', async () => {
    const h = harness()
    const response = await h.app.fetch(request('/healthz'), env({ ADMIN_TOKEN_SECRET: 'too-short' }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
  })

  it('defaults staged access correlation off and accepts only exact boolean overrides', async () => {
    const h = harness()
    expect((await h.app.fetch(request('/healthz'), env({
      ACCESS_EXPECTED_FID_REQUIRED: undefined,
    }))).status).toBe(200)
    expect((await h.app.fetch(request('/healthz'), env({
      ACCESS_EXPECTED_FID_REQUIRED: 'true',
    }))).status).toBe(200)
    expect((await h.app.fetch(request('/healthz'), env({
      ACCESS_EXPECTED_FID_REQUIRED: 'false',
    }))).status).toBe(200)

    for (const value of ['', 'TRUE', '1', 'false ']) {
      const response = await h.app.fetch(request('/healthz'), env({
        ACCESS_EXPECTED_FID_REQUIRED: value,
      }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'service_misconfigured' },
      })
    }
  })

  it('fails closed when the session-cookie HMAC key is missing, short, or reused implicitly', async () => {
    const h = harness()
    for (const value of [undefined, 'too-short', ADMIN_SECRET, privateJwk.d]) {
      const response = await h.app.fetch(request('/healthz'), env({ SESSION_COOKIE_KEY: value }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
    }
  })

  it('fails closed when the admin secret reuses the OIDC private scalar', async () => {
    const h = harness()
    const response = await h.app.fetch(request('/healthz'), env({
      ADMIN_TOKEN_SECRET: privateJwk.d,
    }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
  })

  it('requires two independent public HTTPS Farcaster RPC origins in production', async () => {
    const h = harness()
    const invalidProductionOverrides: readonly Partial<WorkerEnv>[] = [
      { FARCASTER_RPC_URL_SECONDARY: undefined },
      { FARCASTER_RPC_URL: 'http://optimism-rpc-one.example.com' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-one.example.com/secondary' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://127.0.0.1' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://10.0.0.1' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://[2001:db8::1]' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc.internal' },
      { FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-two.example.net/#fragment' },
    ]
    for (const overrides of invalidProductionOverrides) {
      const response = await h.app.fetch(request('/healthz'), env(overrides))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
    }

    const localDevelopment = {
      ENVIRONMENT: 'development',
      ISSUER: 'https://localhost:8787',
      ALLOWED_ORIGINS: 'http://localhost:5173',
      FARCASTER_DOMAIN: 'localhost:5173',
      FARCASTER_SIWE_URI: 'http://localhost:5173/',
      FARCASTER_RPC_URL: 'http://127.0.0.1:8545',
      FARCASTER_RPC_URL_SECONDARY: undefined,
      SPACETIMEDB_URI: 'http://127.0.0.1:3000',
      SPACETIMEDB_DATABASE: 'warpkeep-dev',
    } satisfies Partial<WorkerEnv>
    const developmentRequest = () => new Request('https://localhost:8787/healthz')
    const accepted = await h.app.fetch(developmentRequest(), env(localDevelopment))
    expect(accepted.status).toBe(200)

    const remoteSingle = await h.app.fetch(developmentRequest(), env({
      ...localDevelopment,
      FARCASTER_RPC_URL: 'https://optimism-rpc-one.example.com',
    }))
    expect(remoteSingle.status).toBe(503)
  })

  it('pins notification trust coordinates and requires an unrelated operator secret', async () => {
    const h = harness()
    expect((await h.app.fetch(request('/healthz'), notificationEnv())).status).toBe(200)
    expect((await h.app.fetch(request('/healthz'), notificationEnv({
      APPROVAL_NOTIFICATIONS_ENABLED: 'false',
    }))).status).toBe(200)

    const invalidOverrides: readonly Partial<WorkerEnv>[] = [
      {
        APPROVAL_NOTIFICATIONS_ENABLED: 'true',
        MINIAPP_NOTIFICATION_HUB_URLS: undefined,
        MINIAPP_NOTIFICATION_CLIENTS: undefined,
        NOTIFICATION_OPERATOR_SECRET: undefined,
      },
      {
        APPROVAL_NOTIFICATIONS_ENABLED: 'false',
        MINIAPP_NOTIFICATION_HUB_URLS: 'https://hub.pinata.cloud/,https://rho.farcaster.xyz:3381/',
        MINIAPP_NOTIFICATION_CLIENTS: undefined,
        NOTIFICATION_OPERATOR_SECRET: undefined,
      },
      { MINIAPP_NOTIFICATION_HUB_URLS: 'https://hub.pinata.cloud/,https://hub.pinata.cloud/' },
      { MINIAPP_NOTIFICATION_HUB_URLS: 'http://hub-one.example.com/,https://hub-two.example.net/' },
      { MINIAPP_NOTIFICATION_HUB_URLS: 'https://127.0.0.1/,https://hub-two.example.net/' },
      { MINIAPP_NOTIFICATION_HUB_URLS: 'https://hub-one.example.com/path,https://hub-two.example.net/' },
      { MINIAPP_NOTIFICATION_CLIENTS: '9152=http://api.farcaster.xyz/v1/frame-notifications' },
      { MINIAPP_NOTIFICATION_CLIENTS: '9152=https://127.0.0.1/v1/frame-notifications' },
      { MINIAPP_NOTIFICATION_CLIENTS: '9152=https://api.farcaster.xyz/' },
      { MINIAPP_NOTIFICATION_CLIENTS: '9152=https://api.farcaster.xyz/v1/frame-notifications?token=bad' },
      { NOTIFICATION_OPERATOR_SECRET: ADMIN_SECRET },
      { NOTIFICATION_OPERATOR_SECRET: SESSION_COOKIE_KEY },
      { NOTIFICATION_OPERATOR_SECRET: privateJwk.d },
      { APPROVAL_NOTIFICATIONS_ENABLED: 'TRUE' },
    ]
    for (const overrides of invalidOverrides) {
      const response = await h.app.fetch(request('/healthz'), notificationEnv(overrides))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'service_misconfigured' },
      })
    }
  })

  it('fails closed without a public issuer and writes only static safe log events', async () => {
    const h = harness()
    const response = await h.app.fetch(request('/healthz'), env({ ISSUER: undefined }))
    expect(response.status).toBe(503)
    expect(h.events).toContain('configuration_error')
    expect(JSON.stringify(h.events)).not.toContain(ADMIN_SECRET)
    expect(JSON.stringify(h.events)).not.toContain(FID)
  })

  it('fails gracefully when private key configuration is malformed', async () => {
    const h = harness()
    const response = await h.app.fetch(request('/.well-known/jwks.json'), env({
      SIGNING_KEY_JWK: JSON.stringify({ kty: 'EC', crv: 'P-256', x: 'bad', y: 'bad', d: 'bad' }),
    }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
  })

  it('accepts only a string key ID when it falls back to the private JWK kid', async () => {
    const h = harness()
    const valid = await h.app.fetch(request('/.well-known/jwks.json'), env({
      OIDC_KEY_ID: undefined,
      SIGNING_KEY_JWK: JSON.stringify({ ...privateJwk, kid: 'jwk-fallback-key' }),
    }))
    expect(valid.status).toBe(200)
    await expect(valid.json()).resolves.toMatchObject({
      keys: [expect.objectContaining({ kid: 'jwk-fallback-key' })],
    })

    for (const kid of [123, true]) {
      const response = await h.app.fetch(request('/.well-known/jwks.json'), env({
        OIDC_KEY_ID: undefined,
        SIGNING_KEY_JWK: JSON.stringify({ ...privateJwk, kid }),
      }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
    }
  })

  it('requires the non-secret direct Maincloud configuration in production', async () => {
    const h = harness()
    const missing = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_URI: undefined }))
    expect(missing.status).toBe(503)
    const insecure = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_URI: 'http://maincloud.spacetimedb.com' }))
    expect(insecure.status).toBe(503)
    const malformedDatabase = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_DATABASE: 'warpkeep/unsafe' }))
    expect(malformedDatabase.status).toBe(503)
    const lookalikeUri = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_URI: 'https://lookalike.example' }))
    expect(lookalikeUri.status).toBe(503)
    const lookalikeDatabase = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_DATABASE: 'lookalike-database' }))
    expect(lookalikeDatabase.status).toBe(503)
    const mutableFormerAlias = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_DATABASE: 'warpkeep-89e4u' }))
    expect(mutableFormerAlias.status).toBe(503)

    const development = await h.app.fetch(request('/healthz'), env({
      ENVIRONMENT: 'development',
      SPACETIMEDB_URI: 'http://127.0.0.1:3000',
      SPACETIMEDB_DATABASE: 'warpkeep-dev',
    }))
    expect(development.status).toBe(200)

    const canonicalDowngrade = await h.app.fetch(request('/healthz'), env({
      ENVIRONMENT: 'development',
      ISSUER: 'https://auth.warpkeep.com',
      ALLOWED_ORIGINS: 'https://warpkeep.com',
      FARCASTER_DOMAIN: 'warpkeep.com',
      FARCASTER_SIWE_URI: 'https://warpkeep.com/',
      SPACETIMEDB_URI: 'http://127.0.0.1:3000',
      SPACETIMEDB_DATABASE: 'warpkeep-dev',
    }))
    expect(canonicalDowngrade.status).toBe(503)
  })

  it('never places proof material in the default logger output', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
    const resolver = { resolve: vi.fn(async () => ({ state: 'enabled', authEpoch: 3 } as const)) }
    const app = createAuthBridge({
      challengeStore: new MemoryChallengeStore(),
      verifier,
      authEpochResolver: resolver,
      sessionFamilyStore: new MemorySessionFamilyStore(),
      rateLimiter: { check: async () => ({ allowed: true }) },
    })
    const challengeResponse = await app.fetch(request('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }, { headers: { origin: ORIGIN } }), env())
    const challenge = await json(challengeResponse)
    const proof = proofFor(challenge)
    const exchange = await app.fetch(request('/v2/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(200)
    const output = JSON.stringify(log.mock.calls)
    expect(output).toContain('exchange_succeeded')
    expect(output).not.toContain(String(proof.message))
    expect(output).not.toContain(String(proof.signature))
    expect(output).not.toContain(String(proof.nonce))
    expect(output).not.toContain(String(proof.requestId))
    expect(output).not.toContain(BINDING_VERIFIER)
    expect(output).not.toContain(BINDING_CHALLENGE)
    expect(output).not.toContain(FID)
  })

  it('rejects a copied completed proof with no browser-held binding', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const { bindingVerifier: _bindingVerifier, ...copiedProof } = proofFor(challenge)
    const observer = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      copiedProof,
      { headers: { origin: ORIGIN } },
    ), env())

    expect(observer.status).toBe(401)
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()
    expect(h.events).toContain('exchange_binding_missing')

    const legitimate = await h.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(challenge),
      { headers: { origin: ORIGIN } },
    ), env())
    expect(legitimate.status).toBe(200)
    expect(h.events).toContain('exchange_binding_verified')
  })

  it('rejects malformed binding verifiers before proof work without consuming the challenge', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    for (const bindingVerifier of [
      '',
      'A'.repeat(42),
      'A'.repeat(44),
      `${'A'.repeat(42)}B`,
    ]) {
      const response = await h.app.fetch(request('/v2/farcaster/exchange', {
        ...proofFor(challenge),
        bindingVerifier,
      }, { headers: { origin: ORIGIN } }), env())
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'browser_binding_invalid',
          message: 'This sign-in challenge is invalid.',
        },
      })
    }
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()
    expect(h.events.filter((event) => event === 'exchange_binding_invalid')).toHaveLength(4)

    const legitimate = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(legitimate.status).toBe(200)
  })

  it('rejects a canonical but incorrect verifier before consume and permits the bound browser retry', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const observer = await h.app.fetch(request('/v2/farcaster/exchange', {
      ...proofFor(challenge),
      bindingVerifier: WRONG_BINDING_VERIFIER,
    }, { headers: { origin: ORIGIN } }), env())

    expect(observer.status).toBe(401)
    await expect(observer.json()).resolves.toMatchObject({
      error: { code: 'browser_binding_invalid' },
    })
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()
    expect(h.events).toContain('exchange_binding_mismatch')

    const legitimate = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(legitimate.status).toBe(200)
    expect(h.verifier.verify).toHaveBeenCalledTimes(1)
  })

  it('fails closed before consume when S256 digest verification is unavailable', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('digest unavailable'))

    const unavailable = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toEqual({
      error: {
        code: 'binding_verification_unavailable',
        message: 'Authentication is temporarily unavailable.',
      },
    })
    expect(h.events).toContain('internal_error')
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(retry.status).toBe(200)
    expect(h.events).toContain('exchange_binding_verified')
  })

  it('claims a challenge before upstream work so concurrent copies do not amplify it', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    let releaseVerification!: () => void
    h.verifier.verify.mockImplementationOnce(() => new Promise((resolve) => {
      releaseVerification = () => resolve({ fid: FID })
    }))

    const first = h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    await vi.waitFor(() => expect(h.verifier.verify).toHaveBeenCalledTimes(1))
    const contender = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(contender.status).toBe(401)
    expect(h.verifier.verify).toHaveBeenCalledTimes(1)
    expect(h.resolver.resolve).not.toHaveBeenCalled()

    releaseVerification()
    expect((await first).status).toBe(200)
    expect(h.resolver.resolve).toHaveBeenCalledTimes(1)
  })

  it('does not issue a token when upstream work crosses the challenge deadline', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const expiresAt = Number(challenge.expiresAt)
    h.setNow(expiresAt - 1)
    h.verifier.verify.mockImplementationOnce(async () => {
      h.setNow(expiresAt + 1)
      return { fid: FID }
    })

    const response = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'challenge_expired' } })
    expect(h.resolver.resolve).toHaveBeenCalledTimes(1)
    expect(h.events).not.toContain('exchange_succeeded')

    const replay = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(replay.status).toBe(401)
  })

  it('discards a signed token when signing itself crosses the challenge deadline', async () => {
    let advanceClock: () => void = () => undefined
    const h = harness({
      signer: vi.fn(async () => {
        advanceClock()
        return 'header.payload.signature'
      }),
    })
    const challenge = await issueChallenge(h)
    const expiresAt = Number(challenge.expiresAt)
    h.setNow(expiresAt - 1)
    advanceClock = () => h.setNow(expiresAt + 1)

    const response = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'challenge_expired' } })
    expect(h.events).not.toContain('exchange_succeeded')
  })

  it('restores a claimed challenge after a transient epoch lookup failure', async () => {
    const resolver = {
      resolve: vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ state: 'enabled', authEpoch: 9 } as const),
    }
    const h = harness({ resolver })
    const challenge = await issueChallenge(h)
    const first = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(first.status).toBe(503)

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(retry.status).toBe(200)
    expect(resolver.resolve).toHaveBeenCalledTimes(2)
  })

  it('restores the complete v2 binding record after a transient signing failure', async () => {
    const signer = vi.fn()
      .mockRejectedValueOnce(new Error('transient signing failure'))
      .mockResolvedValueOnce('header.payload.signature')
    const h = harness({ signer })
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)

    const first = await h.app.fetch(request('/v2/farcaster/exchange', proof, {
      headers: { origin: ORIGIN },
    }), env())
    expect(first.status).toBe(503)
    await expect(first.json()).resolves.toMatchObject({ error: { code: 'signing_unavailable' } })

    const retry = await h.app.fetch(request('/v2/farcaster/exchange', proof, {
      headers: { origin: ORIGIN },
    }), env())
    expect(retry.status).toBe(200)
    expect(signer).toHaveBeenCalledTimes(2)
    expect(h.verifier.verify).toHaveBeenCalledTimes(2)
    expect(h.resolver.resolve).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid signed-message expiry without converting it into a 500', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)
    const message = String(proof.message).replace(/^Expiration Time:.*$/m, 'Expiration Time: invalid')
    const response = await h.app.fetch(request('/v2/farcaster/exchange', {
      ...proof,
      message,
    }, { headers: { origin: ORIGIN } }), env())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'invalid_proof' } })
  })

  it('invalidates an outstanding challenge when the current SIWF trust URI changes', async () => {
    const h = harness()
    const previousSiweUri = 'https://warpkeep.example/previous-auth-scope/'
    const challengeResponse = await h.app.fetch(request('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: previousSiweUri,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }, { headers: { origin: ORIGIN } }), env({ FARCASTER_SIWE_URI: previousSiweUri }))
    expect(challengeResponse.status).toBe(201)
    const challenge = await json(challengeResponse)
    const expirationTime = String(challenge.expirationTime)
    const previousMessage = createSiweMessage({
      domain: DOMAIN,
      address: '0x0000000000000000000000000000000000000001',
      chainId: 10,
      uri: previousSiweUri,
      version: '1',
      nonce: String(challenge.nonce),
      issuedAt: new Date(Number(challenge.createdAt)),
      expirationTime: new Date(expirationTime),
      requestId: String(challenge.requestId),
    })
    const response = await h.app.fetch(request('/v2/farcaster/exchange', {
      ...proofFor(challenge),
      message: previousMessage,
      siweUri: previousSiweUri,
    }, { headers: { origin: ORIGIN } }), env())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'challenge_mismatch' } })
    expect(h.verifier.verify).not.toHaveBeenCalled()
  })

  it('rejects a challenge record whose persisted lifetime exceeds the protocol ceiling', async () => {
    const createdAt = Date.now()
    const record: ChallengeRecord = {
      version: 2,
      requestId: 'A'.repeat(24),
      nonce: 'a'.repeat(36),
      origin: ORIGIN,
      domain: DOMAIN,
      siweUri: SIWE_URI,
      createdAt,
      expiresAt: createdAt + 10 * 60 * 1_000,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }
    const consume = vi.fn(async () => record)
    const h = harness({
      challengeStore: {
        put: async () => undefined,
        get: async () => record,
        consume,
      },
    })
    h.setNow(createdAt + 1)
    const response = await h.app.fetch(request('/v2/farcaster/exchange', proofFor({
      ...record,
      expirationTime: new Date(record.expiresAt).toISOString(),
    }), { headers: { origin: ORIGIN } }), env())

    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'challenge_mismatch' } })
    expect(consume).not.toHaveBeenCalled()
    expect(h.verifier.verify).not.toHaveBeenCalled()
  })

  it('maps challenge storage faults to a retryable fail-closed response', async () => {
    const putFailure = harness({
      challengeStore: {
        put: async () => { throw new Error('private store detail') },
        get: async () => null,
        consume: async () => null,
      },
    })
    const putResponse = await putFailure.app.fetch(request('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }, { headers: { origin: ORIGIN } }), env())

    const timestamp = Date.now()
    const getFailure = harness({
      challengeStore: {
        put: async () => undefined,
        get: async () => { throw new Error('private store detail') },
        consume: async () => null,
      },
    })
    const getResponse = await getFailure.app.fetch(request('/v2/farcaster/exchange', proofFor({
      nonce: 'a'.repeat(36),
      requestId: 'A'.repeat(24),
      createdAt: timestamp,
      expiresAt: timestamp + 5 * 60 * 1_000,
      expirationTime: new Date(timestamp + 5 * 60 * 1_000).toISOString(),
    }), { headers: { origin: ORIGIN } }), env())

    let storedChallenge: ChallengeRecord | null = null
    const consumeFailure = harness({
      challengeStore: {
        put: async challenge => { storedChallenge = challenge },
        get: async () => storedChallenge,
        consume: async () => { throw new Error('private store detail') },
      },
    })
    const issued = await issueChallenge(consumeFailure)
    const consumeResponse = await consumeFailure.app.fetch(request(
      '/v2/farcaster/exchange',
      proofFor(issued),
      { headers: { origin: ORIGIN } },
    ), env())

    for (const [h, response] of [
      [putFailure, putResponse],
      [getFailure, getResponse],
      [consumeFailure, consumeResponse],
    ] as const) {
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: { code: 'challenge_unavailable', message: 'Authentication is temporarily unavailable.' },
      })
      expect(h.events).toContain('internal_error')
    }
    expect(consumeFailure.verifier.verify).not.toHaveBeenCalled()
  })

  describe('Farcaster admission notifications', () => {
    const verifiedEnableEvent = Object.freeze({
      eventId: 'a'.repeat(64),
      fid: FID,
      appFid: 9_152,
      event: Object.freeze({
        type: 'enabled' as const,
        details: Object.freeze({
          token: 'notification-token-that-never-enters-browser-state',
          url: 'https://api.farcaster.xyz/v1/frame-notifications',
        }),
      }),
    })

    it('keeps both endpoints independently fail-closed while rollout is paused', async () => {
      const verify = vi.fn(async () => verifiedEnableEvent)
      const applyEvent = vi.fn(async () => undefined)
      const queueAdmission = vi.fn(async () => 'queued' as const)
      const h = harness({
        miniAppWebhookVerifier: { verify },
        admissionNotificationStore: { applyEvent, queueAdmission },
      })

      for (const candidate of [
        request(MINIAPP_WEBHOOK_PATH, { header: 'h', payload: 'p', signature: 's' }),
        request(ADMISSION_NOTIFICATION_PATH, { fid: FID }, {
          headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` },
        }),
        request(ADMISSION_NOTIFICATION_STATUS_PATH, { fid: FID }, {
          headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` },
        }),
      ]) {
        const response = await h.app.fetch(candidate, env())
        expect(response.status).toBe(503)
        await expect(response.json()).resolves.toMatchObject({
          error: { code: 'approval_notifications_paused' },
        })
        expect(response.headers.has('access-control-allow-origin')).toBe(false)
      }
      // The webhook must still be authenticated while paused so a genuine
      // disable/remove can erase consent; enabled events remain unpersisted.
      expect(verify).toHaveBeenCalledOnce()
      expect(applyEvent).not.toHaveBeenCalled()
      expect(queueAdmission).not.toHaveBeenCalled()
    })

    it('accepts only a server-to-server verified webhook and returns no token material', async () => {
      const verify = vi.fn(async () => verifiedEnableEvent)
      const applyEvent = vi.fn(async () => undefined)
      const h = harness({
        miniAppWebhookVerifier: { verify },
        admissionNotificationStore: {
          applyEvent,
          queueAdmission: vi.fn(async () => 'queued' as const),
        },
      })
      const signedEnvelope = { header: 'header', payload: 'payload', signature: 'signature' }

      const browserAttempt = await h.app.fetch(request(MINIAPP_WEBHOOK_PATH, signedEnvelope, {
        headers: { origin: ORIGIN },
      }), notificationEnv())
      expect(browserAttempt.status).toBe(403)
      expect(verify).not.toHaveBeenCalled()

      const accepted = await h.app.fetch(
        request(MINIAPP_WEBHOOK_PATH, signedEnvelope),
        notificationEnv(),
      )
      expect(accepted.status).toBe(200)
      expect(await accepted.text()).toBe('')
      expect(accepted.headers.has('access-control-allow-origin')).toBe(false)
      expect(verify).toHaveBeenCalledWith(signedEnvelope)
      expect(applyEvent).toHaveBeenCalledWith(verifiedEnableEvent)
      expect(h.events).toEqual([
        'miniapp_webhook_verified',
        'miniapp_notification_subscribed',
      ])
      expect(JSON.stringify(h.events)).not.toContain(verifiedEnableEvent.event.details.token)
    })

    it('continues accepting signed opt-outs while delivery is paused', async () => {
      const disabledEvent = Object.freeze({
        eventId: 'd'.repeat(64),
        fid: FID,
        appFid: 9_152,
        event: Object.freeze({ type: 'disabled' as const }),
      })
      const verify = vi.fn(async () => disabledEvent)
      const applyEvent = vi.fn(async () => undefined)
      const h = harness({
        miniAppWebhookVerifier: { verify },
        admissionNotificationStore: {
          applyEvent,
          queueAdmission: vi.fn(async () => 'not-subscribed' as const),
        },
      })
      const response = await h.app.fetch(request(
        MINIAPP_WEBHOOK_PATH,
        { header: 'header', payload: 'payload', signature: 'signature' },
      ), notificationEnv({ APPROVAL_NOTIFICATIONS_ENABLED: 'false' }))

      expect(response.status).toBe(200)
      expect(verify).toHaveBeenCalledOnce()
      expect(applyEvent).toHaveBeenCalledWith(disabledEvent)
      expect(h.events).toEqual([
        'miniapp_webhook_verified',
        'miniapp_notification_unsubscribed',
      ])
    })

    it('distinguishes invalid signed input from verifier dependency failure', async () => {
      for (const [error, status, code, expectedEvents] of [
        [
          new MiniAppWebhookInvalidError(),
          400,
          'miniapp_webhook_invalid',
          ['miniapp_webhook_rejected'],
        ],
        [
          new MiniAppWebhookVerifierUnavailableError('rpc_all_transports'),
          503,
          'miniapp_webhook_verification_unavailable',
          [
            'miniapp_webhook_verifier_unavailable',
            'miniapp_webhook_verifier_unavailable_rpc_all_transports',
          ],
        ],
      ] as const) {
        const applyEvent = vi.fn(async () => undefined)
        const h = harness({
          miniAppWebhookVerifier: { verify: vi.fn(async () => { throw error }) },
          admissionNotificationStore: {
            applyEvent,
            queueAdmission: vi.fn(async () => 'queued' as const),
          },
        })
        const response = await h.app.fetch(request(
          MINIAPP_WEBHOOK_PATH,
          { header: 'h', payload: 'p', signature: 's' },
        ), notificationEnv())
        expect(response.status).toBe(status)
        await expect(response.json()).resolves.toMatchObject({ error: { code } })
        expect(applyEvent).not.toHaveBeenCalled()
        expect(h.events).toEqual(expectedEvents)
      }
    })

    it('uses the separate operator secret and rechecks live admission before queuing', async () => {
      const queueAdmission = vi.fn(async () => 'queued' as const)
      const store: AdmissionNotificationStore = {
        applyEvent: vi.fn(async () => undefined),
        queueAdmission,
      }
      const h = harness({ admissionNotificationStore: store })

      for (const headers of [
        new Headers({ authorization: `Bearer ${ADMIN_SECRET}` }),
        new Headers({
          authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}`,
          origin: ORIGIN,
        }),
      ]) {
        const rejected = await h.app.fetch(
          request(ADMISSION_NOTIFICATION_PATH, { fid: FID }, { headers }),
          notificationEnv(),
        )
        expect(rejected.status).toBe(headers.has('origin') ? 403 : 401)
        expect(rejected.headers.has('access-control-allow-origin')).toBe(false)
      }
      expect(queueAdmission).not.toHaveBeenCalled()

      const accepted = await h.app.fetch(request(
        ADMISSION_NOTIFICATION_PATH,
        { fid: FID },
        { headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` } },
      ), notificationEnv())
      expect(accepted.status).toBe(202)
      const acceptedBody = await accepted.json()
      expect(acceptedBody).toEqual({ status: 'queued' })
      expect(h.resolver.resolve).toHaveBeenCalledWith(FID)
      expect(queueAdmission).toHaveBeenCalledWith({
        fid: FID,
        kind: 'admitted',
        authEpoch: 7,
        queuedAt: expect.any(Number),
      })
      expect(h.events).toContain('admission_notification_queued')
      expect(JSON.stringify(acceptedBody)).not.toContain(NOTIFICATION_OPERATOR_SECRET)
    })

    it('does not queue for a missing or disabled identity without a pending request', async () => {
      const queueAdmission = vi.fn(async () => 'queued' as const)
      const h = harness({
        epoch: 0,
        admissionNotificationStore: {
          applyEvent: vi.fn(async () => undefined),
          queueAdmission,
        },
      })
      const response = await h.app.fetch(request(
        ADMISSION_NOTIFICATION_PATH,
        { fid: FID },
        { headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` } },
      ), notificationEnv())
      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'access_request_not_pending' },
      })
      expect(queueAdmission).not.toHaveBeenCalled()
    })

    it('queues the exact pending request before admission becomes visible', async () => {
      const requestedAtMicros = 1_785_414_896_000_000
      const queueAdmission = vi.fn(async () => 'already-sent' as const)
      const getStatus = vi.fn(async () => ({
        status: 'requested' as const,
        requestedAtMicros,
      }))
      const h = harness({
        epoch: 0,
        accessRequestResolver: {
          getStatus,
          submit: vi.fn(async () => ({ status: 'not-requested' } as const)),
        },
        admissionNotificationStore: {
          applyEvent: vi.fn(async () => undefined),
          queueAdmission,
        },
      })

      const response = await h.app.fetch(request(
        ADMISSION_NOTIFICATION_PATH,
        { fid: FID },
        { headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` } },
      ), notificationEnv())

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({ status: 'already-sent' })
      expect(getStatus).toHaveBeenCalledWith(FID)
      expect(queueAdmission).toHaveBeenCalledWith({
        fid: FID,
        kind: 'pending-request',
        requestedAtMicros,
        queuedAt: expect.any(Number),
      })
      expect(h.events).toContain('admission_notification_succeeded')
    })

    it('exposes only token-free diagnostics to the separate operator credential', async () => {
      const inspect = vi.fn(async () => Object.freeze({
        status: 'queued' as const,
        authEpoch: 7,
        deliveryAttemptCount: 1,
        verificationFailureCount: 0,
        retryReasons: Object.freeze(['invalid-response'] as const),
        nextAttemptAt: 1_800_000_030_000,
      }))
      const h = harness({
        admissionNotificationStore: {
          applyEvent: vi.fn(async () => undefined),
          queueAdmission: vi.fn(async () => 'queued' as const),
          inspect,
        },
      })

      for (const headers of [
        new Headers({ authorization: `Bearer ${ADMIN_SECRET}` }),
        new Headers({
          authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}`,
          origin: ORIGIN,
        }),
      ]) {
        const rejected = await h.app.fetch(request(
          ADMISSION_NOTIFICATION_STATUS_PATH,
          { fid: FID },
          { headers },
        ), notificationEnv())
        expect(rejected.status).toBe(headers.has('origin') ? 403 : 401)
      }
      expect(inspect).not.toHaveBeenCalled()

      const accepted = await h.app.fetch(request(
        ADMISSION_NOTIFICATION_STATUS_PATH,
        { fid: FID },
        { headers: { authorization: `Bearer ${NOTIFICATION_OPERATOR_SECRET}` } },
      ), notificationEnv())
      expect(accepted.status).toBe(200)
      const body = await accepted.json()
      expect(body).toEqual({
        status: 'queued',
        authEpoch: 7,
        deliveryAttemptCount: 1,
        verificationFailureCount: 0,
        retryReasons: ['invalid-response'],
        nextAttemptAt: 1_800_000_030_000,
      })
      expect(inspect).toHaveBeenCalledWith(FID)
      expect(h.events).toContain('admission_notification_inspected')
      expect(JSON.stringify(body)).not.toContain(NOTIFICATION_OPERATOR_SECRET)
      expect(JSON.stringify(body)).not.toContain(verifiedEnableEvent.event.details.token)
    })
  })

  describe('neutral access requests', () => {
    it('reuses exact Quick Auth and returns only neutral status projections', async () => {
      const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const submit = vi.fn(async () => ({
        status: 'requested',
        requestedAtMicros: 1_785_414_896_000_000,
      } as const))
      const h = harness({
        epoch: 0,
        accessRequestResolver: { getStatus, submit },
      })
      h.setNow(1_800_000_000_000)

      const statusResponse = await h.app.fetch(
        accessBearerRequest(ACCESS_STATUS_PATH),
        env(),
      )
      const submitResponse = await h.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env(),
      )

      expect(statusResponse.status).toBe(200)
      await expect(statusResponse.json()).resolves.toEqual({
        version: 1,
        status: 'not-requested',
      })
      expect(submitResponse.status).toBe(200)
      const submitBody = await json(submitResponse)
      expect(submitBody).toEqual({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_896_000,
      })
      expect(JSON.stringify(submitBody)).not.toContain(FID)
      expect(getStatus).toHaveBeenCalledOnce()
      expect(getStatus).toHaveBeenCalledWith(FID)
      expect(submit).toHaveBeenCalledOnce()
      expect(submit).toHaveBeenCalledWith(FID)
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledTimes(2)
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenNthCalledWith(1, {
        token: QUICK_AUTH_TOKEN,
        domain: QUICK_AUTH_DOMAIN,
      })
      expect(h.resolver.resolve).toHaveBeenCalledTimes(2)
      for (const response of [statusResponse, submitResponse]) {
        expect(response.headers.get('access-control-allow-origin'))
          .toBe(QUICK_AUTH_ORIGIN)
        expect(response.headers.has('access-control-allow-credentials')).toBe(false)
        expect(response.headers.has('set-cookie')).toBe(false)
      }
      expect(h.events).toContain('access_status_succeeded')
      expect(h.events).toContain('access_request_succeeded')
    })

    it('keeps a legacy headerless client available while correlation is staged', async () => {
      const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const h = harness({
        epoch: 0,
        accessRequestResolver: {
          getStatus,
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      const response = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            authorization: `Bearer ${QUICK_AUTH_TOKEN}`,
          },
        },
      ), env({ ACCESS_EXPECTED_FID_REQUIRED: undefined }))

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual({
        version: 1,
        status: 'not-requested',
      })
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledOnce()
      expect(h.resolver.resolve).toHaveBeenCalledOnce()
      expect(getStatus).toHaveBeenCalledOnce()
      expect(getStatus).toHaveBeenCalledWith(FID)
    })

    it('enforces the reviewed Quick Auth issuer-lifetime boundary before access authority', async () => {
      const nowSeconds = 1_800_000_000
      const payload = (lifetimeSeconds: number) => ({
        sub: Number(FID),
        iss: QUICK_AUTH_ISSUER,
        aud: QUICK_AUTH_DOMAIN,
        iat: nowSeconds,
        exp: nowSeconds + lifetimeSeconds,
      })

      const acceptedGetStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const accepted = harness({
        epoch: 0,
        quickAuthVerifier: {
          verifyJwt: vi.fn(async () => payload(QUICK_AUTH_MAX_ISSUER_LIFETIME_SECONDS)),
        },
        accessRequestResolver: {
          getStatus: acceptedGetStatus,
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      accepted.setNow(nowSeconds * 1_000)
      const acceptedResponse = await accepted.app.fetch(
        accessBearerRequest(ACCESS_STATUS_PATH),
        env(),
      )

      expect(acceptedResponse.status).toBe(200)
      expect(accepted.resolver.resolve).toHaveBeenCalledOnce()
      expect(acceptedGetStatus).toHaveBeenCalledOnce()

      const rejectedGetStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const rejected = harness({
        epoch: 0,
        quickAuthVerifier: {
          verifyJwt: vi.fn(async () => payload(QUICK_AUTH_MAX_ISSUER_LIFETIME_SECONDS + 1)),
        },
        accessRequestResolver: {
          getStatus: rejectedGetStatus,
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      rejected.setNow(nowSeconds * 1_000)
      const rejectedResponse = await rejected.app.fetch(
        accessBearerRequest(ACCESS_STATUS_PATH),
        env(),
      )

      expect(rejectedResponse.status).toBe(401)
      await expect(rejectedResponse.json()).resolves.toEqual({
        error: {
          code: 'access_auth_invalid',
          message: 'Farcaster authentication could not be verified.',
        },
      })
      expect(rejected.resolver.resolve).not.toHaveBeenCalled()
      expect(rejectedGetStatus).not.toHaveBeenCalled()
    })

    it('rejects Quick Auth identity drift before admission or request resolution', async () => {
      const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const submit = vi.fn(async () => ({
        status: 'requested',
        requestedAtMicros: 1_785_414_896_000_000,
      } as const))
      const h = harness({
        epoch: 0,
        accessRequestResolver: { getStatus, submit },
      })
      const response = await h.app.fetch(accessBearerRequest(
        ACCESS_REQUEST_PATH,
        {},
        { headers: { 'x-warpkeep-expected-fid': '54321' } },
      ), env())

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'access_identity_changed',
          message: 'The authenticated identity changed. Refresh and try again.',
        },
      })
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledOnce()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
      expect(getStatus).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      expect(JSON.stringify(h.events)).not.toContain(FID)
      expect(JSON.stringify(h.events)).not.toContain('54321')
    })

    it('accepts a valid pending family without rotating its generation or cookie', async () => {
      const backing = new MemorySessionFamilyStore()
      const refresh = vi.fn((
        familyId: string,
        generation: number,
        origin: string,
        admission: Parameters<SessionFamilyStore['refresh']>[3],
        currentTime: number,
      ) => backing.refresh(familyId, generation, origin, admission, currentTime))
      const revoke = vi.fn((familyId: string) => backing.revoke(familyId))
      const sessionFamilyStore: SessionFamilyStore = {
        create: (familyId, record) => backing.create(familyId, record),
        get: (familyId) => backing.get(familyId),
        refresh,
        revoke,
      }
      const getStatus = vi.fn(async () => ({
        status: 'requested',
        requestedAtMicros: 1_785_414_896_000_000,
      } as const))
      const h = harness({
        epoch: 0,
        sessionFamilyStore,
        accessRequestResolver: {
          getStatus,
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      const challenge = await issueChallenge(h)
      const exchange = await h.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(challenge),
        { headers: { origin: ORIGIN } },
      ), env())
      expect(exchange.status).toBe(200)
      const cookie = responseCookie(exchange)
      const familyId = cookie.split('=', 2)[1]?.split('.')[1]
      const before = await backing.get(familyId!)

      const statusResponse = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: ORIGIN,
            cookie,
            'x-warpkeep-expected-fid': FID,
          },
        },
      ), env())

      expect(statusResponse.status).toBe(200)
      await expect(statusResponse.json()).resolves.toEqual({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_896_000,
      })
      expect(statusResponse.headers.get('access-control-allow-origin')).toBe(ORIGIN)
      expect(statusResponse.headers.get('access-control-allow-credentials')).toBe('true')
      expect(statusResponse.headers.has('set-cookie')).toBe(false)
      expect(getStatus).toHaveBeenCalledWith(FID)
      expect(refresh).not.toHaveBeenCalled()
      expect(revoke).not.toHaveBeenCalled()
      await expect(backing.get(familyId!)).resolves.toEqual(before)
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
    })

    it('rejects a replaced pending-session cookie before reading another FID request', async () => {
      const secondFid = '54321'
      const verifier = {
        verify: vi.fn()
          .mockResolvedValueOnce({ fid: FID })
          .mockResolvedValueOnce({ fid: secondFid }),
      }
      const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const submit = vi.fn(async () => ({ status: 'already-admitted' } as const))
      const h = harness({
        epoch: 0,
        verifier,
        accessRequestResolver: { getStatus, submit },
      })

      const firstChallenge = await issueChallenge(h)
      const firstExchange = await h.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(firstChallenge),
        { headers: { origin: ORIGIN } },
      ), env())
      expect(firstExchange.status).toBe(200)

      const secondChallenge = await issueChallenge(h)
      const secondExchange = await h.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(secondChallenge, {
          fid: secondFid,
          identity: { fid: secondFid },
        }),
        { headers: { origin: ORIGIN } },
      ), env())
      expect(secondExchange.status).toBe(200)
      h.resolver.resolve.mockClear()

      const response = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: ORIGIN,
            cookie: responseCookie(secondExchange),
            'x-warpkeep-expected-fid': FID,
          },
        },
      ), env())

      expect(response.status).toBe(409)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'access_identity_changed' },
      })
      expect(h.resolver.resolve).not.toHaveBeenCalled()
      expect(getStatus).not.toHaveBeenCalled()
      expect(submit).not.toHaveBeenCalled()
      expect(JSON.stringify(h.events)).not.toContain(FID)
      expect(JSON.stringify(h.events)).not.toContain(secondFid)
    })

    it('accepts a freshly proven disabled pending family without minting gameplay authority', async () => {
      const signer = vi.fn(async () => 'must-not-be-issued')
      const getStatus = vi.fn(async () => ({
        status: 'requested',
        requestedAtMicros: 1_785_414_896_000_000,
      } as const))
      const h = harness({
        resolver: {
          resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
        },
        signer,
        accessRequestResolver: {
          getStatus,
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      const challenge = await issueChallenge(h)
      const exchange = await h.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(challenge),
        { headers: { origin: ORIGIN } },
      ), env())
      expect(exchange.status).toBe(200)
      const exchangeBody = await json(exchange)
      expect(exchangeBody).toMatchObject({
        version: 2,
        status: 'pending-admission',
        identity: { fid: Number(FID) },
      })
      expect(exchangeBody).not.toHaveProperty('accessToken')
      expect(signer).not.toHaveBeenCalled()

      const statusResponse = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: ORIGIN,
            cookie: responseCookie(exchange),
            'x-warpkeep-expected-fid': FID,
          },
        },
      ), env())
      expect(statusResponse.status).toBe(200)
      await expect(statusResponse.json()).resolves.toEqual({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_896_000,
      })
      expect(getStatus).toHaveBeenCalledWith(FID)
      expect(signer).not.toHaveBeenCalled()
    })

    it('short-circuits admitted identities and accepts tokenless disabled reapplications', async () => {
      const admittedResolver = {
        getStatus: vi.fn(async () => ({ status: 'not-requested' } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros: 1 } as const)),
      }
      const admitted = harness({ accessRequestResolver: admittedResolver })
      const admittedResponse = await admitted.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env(),
      )
      expect(admittedResponse.status).toBe(200)
      await expect(admittedResponse.json()).resolves.toEqual({
        version: 1,
        status: 'already-admitted',
      })
      expect(admittedResolver.getStatus).not.toHaveBeenCalled()
      expect(admittedResolver.submit).not.toHaveBeenCalled()

      const disabledResolver = {
        getStatus: vi.fn(async () => ({ status: 'not-requested' } as const)),
        submit: vi.fn(async () => ({
          status: 'requested',
          requestedAtMicros: 1_785_414_896_000_000,
        } as const)),
      }
      const disabled = harness({
        resolver: {
          resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
        },
        accessRequestResolver: disabledResolver,
      })
      const disabledResponse = await disabled.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env(),
      )
      expect(disabledResponse.status).toBe(200)
      await expect(disabledResponse.json()).resolves.toEqual({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_896_000,
      })
      expect(disabledResolver.getStatus).not.toHaveBeenCalled()
      expect(disabledResolver.submit).toHaveBeenCalledOnce()
      expect(disabledResolver.submit).toHaveBeenCalledWith(FID)
      expect(disabledResponse.headers.has('set-cookie')).toBe(false)
      expect(disabledResponse.headers.get('access-control-allow-origin'))
        .toBe(QUICK_AUTH_ORIGIN)
    })

    it('expires mismatched pending-session credentials or bound-epoch drift', async () => {
      const disabledResolve = vi.fn()
        .mockResolvedValueOnce({ state: 'missing', authEpoch: 0 } as const)
        .mockResolvedValueOnce({ state: 'disabled', authEpoch: 0 } as const)
      const disabled = harness({ resolver: { resolve: disabledResolve } })
      const disabledChallenge = await issueChallenge(disabled)
      const disabledExchange = await disabled.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(disabledChallenge),
        { headers: { origin: ORIGIN } },
      ), env())
      const disabledCookie = responseCookie(disabledExchange)
      const disabledFamilyId = disabledCookie.split('=', 2)[1]?.split('.')[1]
      const disabledResponse = await disabled.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: ORIGIN,
            cookie: disabledCookie,
            'x-warpkeep-expected-fid': FID,
          },
        },
      ), env())
      expect(disabledResponse.status).toBe(403)
      await expect(disabledResponse.json()).resolves.toMatchObject({
        error: { code: 'session_invalid' },
      })
      expect(disabledResponse.headers.get('set-cookie')).toContain('Max-Age=0')
      await expect(disabled.sessionStore.get(disabledFamilyId!)).resolves.toBeNull()

      const driftResolve = vi.fn()
        .mockResolvedValueOnce({ state: 'enabled', authEpoch: 7 } as const)
        .mockResolvedValueOnce({ state: 'enabled', authEpoch: 8 } as const)
      const drifted = harness({ resolver: { resolve: driftResolve } })
      const driftChallenge = await issueChallenge(drifted)
      const driftExchange = await drifted.app.fetch(request(
        '/v2/farcaster/exchange',
        proofFor(driftChallenge),
        { headers: { origin: ORIGIN } },
      ), env())
      const driftCookie = responseCookie(driftExchange)
      const driftFamilyId = driftCookie.split('=', 2)[1]?.split('.')[1]
      const driftResponse = await drifted.app.fetch(request(
        ACCESS_REQUEST_PATH,
        {},
        {
          headers: {
            origin: ORIGIN,
            cookie: driftCookie,
            'x-warpkeep-expected-fid': FID,
          },
        },
      ), env())
      expect(driftResponse.status).toBe(401)
      await expect(driftResponse.json()).resolves.toMatchObject({
        error: { code: 'session_invalid' },
      })
      expect(driftResponse.headers.get('set-cookie')).toContain('Max-Age=0')
      await expect(drifted.sessionStore.get(driftFamilyId!)).resolves.toBeNull()
    })

    it('rejects caller FIDs, queries, mixed credentials, and malformed bearers before identity work', async () => {
      const h = harness({ epoch: 0 })
      const missingCorrelation = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        {},
        {
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            authorization: `Bearer ${QUICK_AUTH_TOKEN}`,
          },
        },
      ), env({ ACCESS_EXPECTED_FID_REQUIRED: 'true' }))
      expect(missingCorrelation.status).toBe(400)
      await expect(missingCorrelation.json()).resolves.toMatchObject({
        error: { code: 'access_expected_fid_required' },
      })

      const malformedCorrelation = await h.app.fetch(accessBearerRequest(
        ACCESS_STATUS_PATH,
        {},
        { headers: { 'x-warpkeep-expected-fid': `0${FID}` } },
      ), env())
      expect(malformedCorrelation.status).toBe(400)
      await expect(malformedCorrelation.json()).resolves.toMatchObject({
        error: { code: 'access_expected_fid_invalid' },
      })

      const callerFid = await h.app.fetch(accessBearerRequest(
        ACCESS_REQUEST_PATH,
        { fid: Number(FID) },
      ), env())
      expect(callerFid.status).toBe(400)
      await expect(callerFid.json()).resolves.toMatchObject({
        error: { code: 'invalid_request' },
      })

      const queried = await h.app.fetch(request(
        `${ACCESS_STATUS_PATH}?fid=${FID}`,
        {},
        {
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            authorization: `Bearer ${QUICK_AUTH_TOKEN}`,
          },
        },
      ), env())
      expect(queried.status).toBe(400)
      await expect(queried.json()).resolves.toMatchObject({
        error: { code: 'access_query_not_allowed' },
      })

      const mixed = await h.app.fetch(accessBearerRequest(
        ACCESS_STATUS_PATH,
        {},
        { headers: { cookie: '__Host-warpkeep_session=untrusted' } },
      ), env())
      expect(mixed.status).toBe(401)
      await expect(mixed.json()).resolves.toMatchObject({
        error: { code: 'access_auth_invalid' },
      })

      const malformed = await h.app.fetch(accessBearerRequest(
        ACCESS_STATUS_PATH,
        {},
        { headers: { authorization: 'Bearer invalid' } },
      ), env())
      expect(malformed.status).toBe(401)
      await expect(malformed.json()).resolves.toMatchObject({
        error: { code: 'access_auth_invalid' },
      })
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    })

    it('uses exact dual-mode CORS and a dedicated closed rate action', async () => {
      const h = harness({ epoch: 0 })
      const bearerPreflight = await h.app.fetch(request(
        ACCESS_REQUEST_PATH,
        undefined,
        {
          method: 'OPTIONS',
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'Authorization, Content-Type, X-Warpkeep-Expected-Fid',
          },
        },
      ), env())
      expect(bearerPreflight.status).toBe(204)
      expect(bearerPreflight.headers.get('access-control-allow-origin'))
        .toBe(QUICK_AUTH_ORIGIN)
      expect(bearerPreflight.headers.get('access-control-allow-headers'))
        .toBe('authorization, content-type, x-warpkeep-expected-fid')
      expect(bearerPreflight.headers.has('access-control-allow-credentials'))
        .toBe(false)

      const sessionPreflight = await h.app.fetch(request(
        ACCESS_STATUS_PATH,
        undefined,
        {
          method: 'OPTIONS',
          headers: {
            origin: ORIGIN,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'Content-Type, X-Warpkeep-Expected-Fid',
          },
        },
      ), env())
      expect(sessionPreflight.status).toBe(204)
      expect(sessionPreflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)
      expect(sessionPreflight.headers.get('access-control-allow-headers'))
        .toBe('content-type, x-warpkeep-expected-fid')
      expect(sessionPreflight.headers.get('access-control-allow-credentials'))
        .toBe('true')

      const stagedLegacyPreflight = await h.app.fetch(request(
        ACCESS_REQUEST_PATH,
        undefined,
        {
          method: 'OPTIONS',
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'Authorization, Content-Type',
          },
        },
      ), env({ ACCESS_EXPECTED_FID_REQUIRED: undefined }))
      expect(stagedLegacyPreflight.status).toBe(204)
      expect(stagedLegacyPreflight.headers.get('access-control-allow-headers'))
        .toBe('authorization, content-type, x-warpkeep-expected-fid')

      const missingCorrelationPreflight = await h.app.fetch(request(
        ACCESS_REQUEST_PATH,
        undefined,
        {
          method: 'OPTIONS',
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'Authorization, Content-Type',
          },
        },
      ), env({ ACCESS_EXPECTED_FID_REQUIRED: 'true' }))
      expect(missingCorrelationPreflight.status).toBe(403)
      await expect(missingCorrelationPreflight.json()).resolves.toMatchObject({
        error: { code: 'header_not_allowed' },
      })

      const hostile = await h.app.fetch(accessBearerRequest(
        ACCESS_STATUS_PATH,
        {},
        { headers: { origin: 'https://hostile.example' } },
      ), env())
      expect(hostile.status).toBe(403)
      expect(hostile.headers.has('access-control-allow-origin')).toBe(false)
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()

      const check = vi.fn(async (_request: Request, _action: string) => ({
        allowed: false as const,
        retryAfterSeconds: 17,
      }))
      const limited = harness({ epoch: 0, rateLimiter: { check } })
      const limitedResponse = await limited.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env(),
      )
      expect(limitedResponse.status).toBe(429)
      expect(limitedResponse.headers.get('retry-after')).toBe('17')
      expect(check).toHaveBeenCalledOnce()
      expect(check.mock.calls[0]?.[1]).toBe('access-request')
      expect(limited.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(limited.resolver.resolve).not.toHaveBeenCalled()
    })

    it('does not retry or status-read after an outcome-ambiguous submit failure', async () => {
      const privateDetail = 'private upstream response detail'
      const ambiguousFailure = Object.assign(
        new AccessRequestResolverFailure('fetch_body'),
        { privateDetail },
      )
      const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
      const submit = vi.fn(async () => {
        throw ambiguousFailure
      })
      const h = harness({
        epoch: 0,
        accessRequestResolver: { getStatus, submit },
      })

      const response = await h.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env(),
      )
      const responseText = await response.text()

      expect(response.status).toBe(503)
      expect(JSON.parse(responseText)).toEqual({
        error: {
          code: 'access_request_unavailable',
          message: 'Access requests are temporarily unavailable.',
        },
      })
      expect(submit).toHaveBeenCalledOnce()
      expect(submit).toHaveBeenCalledWith(FID)
      expect(getStatus).not.toHaveBeenCalled()
      expect(h.events).toContain('access_request_failed')
      expect(h.events).toContain('access_request_failed_fetch_body')
      expect(h.events).toContain('access_request_rejected')
      expect(h.events).not.toContain('access_request_succeeded')
      expect(responseText).not.toContain(FID)
      expect(responseText).not.toContain(privateDetail)
      expect(JSON.stringify(h.events)).not.toContain(FID)
      expect(JSON.stringify(h.events)).not.toContain(privateDetail)
      expect(response.headers.has('set-cookie')).toBe(false)
    })

    it('preserves the public-auth kill switch and emits only closed failure stages', async () => {
      const paused = harness({ epoch: 0 })
      const pausedResponse = await paused.app.fetch(
        accessBearerRequest(ACCESS_REQUEST_PATH),
        env({ PUBLIC_AUTH_ENABLED: 'false' }),
      )
      expect(pausedResponse.status).toBe(503)
      await expect(pausedResponse.json()).resolves.toMatchObject({
        error: { code: 'public_auth_paused' },
      })

      const pausedBearerPreflight = await paused.app.fetch(request(
        ACCESS_REQUEST_PATH,
        undefined,
        {
          method: 'OPTIONS',
          headers: {
            origin: QUICK_AUTH_ORIGIN,
            'access-control-request-method': 'POST',
            'access-control-request-headers': 'Authorization, Content-Type, X-Warpkeep-Expected-Fid',
          },
        },
      ), env({ PUBLIC_AUTH_ENABLED: 'false' }))
      expect(pausedBearerPreflight.status).toBe(503)
      await expect(pausedBearerPreflight.json()).resolves.toMatchObject({
        error: { code: 'public_auth_paused' },
      })
      expect(pausedBearerPreflight.headers.get('access-control-allow-origin'))
        .toBe(QUICK_AUTH_ORIGIN)
      expect(pausedBearerPreflight.headers.get('access-control-allow-headers'))
        .toBe('authorization, content-type, x-warpkeep-expected-fid')
      expect(pausedBearerPreflight.headers.has('access-control-allow-credentials'))
        .toBe(false)
      expect(paused.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(paused.resolver.resolve).not.toHaveBeenCalled()

      const failure = harness({
        epoch: 0,
        accessRequestResolver: {
          getStatus: vi.fn(async () => {
            throw new AccessRequestResolverFailure('timeout')
          }),
          submit: vi.fn(async () => ({ status: 'already-admitted' } as const)),
        },
      })
      const failureResponse = await failure.app.fetch(
        accessBearerRequest(ACCESS_STATUS_PATH),
        env(),
      )
      const failureText = await failureResponse.text()
      expect(failureResponse.status).toBe(503)
      expect(JSON.parse(failureText)).toEqual({
        error: {
          code: 'access_request_unavailable',
          message: 'Access requests are temporarily unavailable.',
        },
      })
      expect(failure.events).toContain('access_request_failed')
      expect(failure.events).toContain('access_request_failed_timeout')
      expect(failure.events).toContain('access_request_rejected')
      expect(failureText).not.toContain(FID)
      expect(JSON.stringify(failure.events)).not.toContain(FID)
      expect(failureResponse.headers.has('set-cookie')).toBe(false)
    })
  })

  describe('Farcaster Quick Auth exchange', () => {
    it('exchanges an exact verified bearer for the existing short player JWT without cookies', async () => {
      const h = harness()
      const now = 1_800_000_000_000
      h.setNow(now)
      const response = await h.app.fetch(quickAuthRequest(
        QUICK_AUTH_TOKEN,
        {},
        { headers: { cookie: '__Host-warpkeep_session=ignored' } },
      ), env())

      expect(response.status).toBe(200)
      expect(response.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledOnce()
      expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledWith({
        token: QUICK_AUTH_TOKEN,
        domain: QUICK_AUTH_DOMAIN,
      })
      expect(h.resolver.resolve).toHaveBeenCalledWith(FID)
      const body = await json(response)
      expect(body).toMatchObject({
        version: 2,
        identity: { fid: Number(FID) },
        status: 'authorized',
        tokenType: 'spacetime-access',
        accessExpiresAt: now + PLAYER_TOKEN_TTL_SECONDS * 1_000,
      })
      expect(body).not.toHaveProperty('sessionExpiresAt')
      const claims = decodeJwtPayload(String(body.accessToken))
      expect(claims).toMatchObject({
        iss: 'https://auth.warpkeep.example',
        sub: `farcaster:${FID}`,
        aud: ['warpkeep-spacetimedb'],
        fid: FID,
        token_type: 'spacetime-access',
        auth_version: 2,
        auth_epoch: 7,
        roles: [],
        iat: Math.floor(now / 1_000),
        nbf: Math.floor(now / 1_000),
        exp: Math.floor(now / 1_000) + PLAYER_TOKEN_TTL_SECONDS,
        session_iat: Math.floor(now / 1_000),
        session_exp: Math.floor(now / 1_000) + PLAYER_TOKEN_TTL_SECONDS,
      })
      expect(claims).not.toHaveProperty('username')
      expect(claims).not.toHaveProperty('pfp_url')
      expect(h.events).toContain('auth_epoch_resolved')
      expect(h.events).toContain('quick_auth_succeeded')
      expect(h.events).not.toContain('session_created')
    })

    it('accepts the reviewed issuer-lifetime maximum and rejects one second longer', async () => {
      const nowSeconds = 1_800_000_000
      const payload = (lifetimeSeconds: number) => ({
        sub: Number(FID),
        iss: QUICK_AUTH_ISSUER,
        aud: QUICK_AUTH_DOMAIN,
        iat: nowSeconds,
        exp: nowSeconds + lifetimeSeconds,
      })

      const accepted = harness({
        quickAuthVerifier: {
          verifyJwt: vi.fn(async () => payload(QUICK_AUTH_MAX_ISSUER_LIFETIME_SECONDS)),
        },
      })
      accepted.setNow(nowSeconds * 1_000)
      const acceptedResponse = await accepted.app.fetch(quickAuthRequest(), env())
      expect(acceptedResponse.status).toBe(200)
      expect(accepted.resolver.resolve).toHaveBeenCalledOnce()

      const rejected = harness({
        quickAuthVerifier: {
          verifyJwt: vi.fn(async () => payload(QUICK_AUTH_MAX_ISSUER_LIFETIME_SECONDS + 1)),
        },
      })
      rejected.setNow(nowSeconds * 1_000)
      const rejectedResponse = await rejected.app.fetch(quickAuthRequest(), env())
      expect(rejectedResponse.status).toBe(401)
      await expect(rejectedResponse.json()).resolves.toEqual({
        error: {
          code: 'quick_auth_invalid',
          message: 'Farcaster authentication could not be verified.',
        },
      })
      expect(rejected.resolver.resolve).not.toHaveBeenCalled()
    })

    it('returns the same cookie-free tokenless pending semantics for missing and disabled FIDs', async () => {
      const pending = harness({ epoch: 0 })
      const pendingResponse = await pending.app.fetch(quickAuthRequest(), env())
      expect(pendingResponse.status).toBe(200)
      await expect(pendingResponse.json()).resolves.toEqual({
        version: 2,
        identity: { fid: Number(FID) },
        status: 'pending-admission',
      })
      expect(pendingResponse.headers.has('set-cookie')).toBe(false)
      expect(pendingResponse.headers.has('access-control-allow-credentials')).toBe(false)

      const disabledSigner = vi.fn(async () => 'must-not-be-issued')
      const disabled = harness({
        resolver: { resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)) },
        signer: disabledSigner,
      })
      const disabledResponse = await disabled.app.fetch(quickAuthRequest(), env())
      expect(disabledResponse.status).toBe(200)
      await expect(disabledResponse.json()).resolves.toEqual({
        version: 2,
        identity: { fid: Number(FID) },
        status: 'pending-admission',
      })
      expect(disabledResponse.headers.has('set-cookie')).toBe(false)
      expect(disabledResponse.headers.has('access-control-allow-credentials')).toBe(false)
      expect(disabledSigner).not.toHaveBeenCalled()
      expect(disabled.events).toContain('quick_auth_succeeded')
    })

    it.each([
      ['missing', null, undefined],
      ['wrong scheme', null, 'Basic abc.def.ghi'],
      ['empty bearer', null, 'Bearer '],
      ['not a compact JWT', null, 'Bearer abc.def'],
      ['embedded whitespace', null, 'Bearer abc.def.ghi extra'],
      ['oversized', null, `Bearer ${'a'.repeat(8 * 1024)}.b.c`],
    ] as const)('rejects a %s Authorization credential generically', async (_label, token, authorization) => {
      const h = harness()
      const headers: Record<string, string> = authorization === undefined
        ? {}
        : { authorization }
      const response = await h.app.fetch(quickAuthRequest(token, {}, { headers }), env())

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'quick_auth_invalid',
          message: 'Farcaster authentication could not be verified.',
        },
      })
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    })

    it.each([
      ['zero FID', { sub: 0 }],
      ['fractional FID', { sub: 12345.5 }],
      ['string FID', { sub: FID }],
      ['unsafe FID', { sub: Number.MAX_SAFE_INTEGER + 1 }],
      ['wrong issuer', { iss: 'https://hostile.example' }],
      ['wrong audience', { aud: 'hostile.example' }],
      ['array audience', { aud: [QUICK_AUTH_DOMAIN] }],
      ['future issued-at', { iat: 1_800_000_001 }],
      ['expired', { exp: 1_800_000_000 }],
      ['non-increasing lifetime', { iat: 1_799_999_999, exp: 1_799_999_999 }],
      ['extra claim', { jti: 'caller-supplied' }],
    ] as const)('rejects verified payloads with %s', async (_label, override) => {
      const now = 1_800_000_000_000
      const payload = {
        sub: Number(FID),
        iss: QUICK_AUTH_ISSUER,
        aud: QUICK_AUTH_DOMAIN,
        iat: 1_799_999_999,
        exp: 1_800_000_300,
        ...override,
      }
      const verifyJwt = vi.fn(async () => payload)
      const h = harness({ quickAuthVerifier: { verifyJwt } })
      h.setNow(now)
      const response = await h.app.fetch(quickAuthRequest(), env())

      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'quick_auth_invalid' },
      })
      expect(verifyJwt).toHaveBeenCalledOnce()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
      expect(response.headers.has('set-cookie')).toBe(false)
    })

    it('maps verifier outages to a retryable generic response without exposing details', async () => {
      const privateFailure = `${QUICK_AUTH_TOKEN}: private verifier detail`
      const verifyJwt = vi.fn(async () => { throw new Error(privateFailure) })
      const h = harness({ quickAuthVerifier: { verifyJwt } })
      const response = await h.app.fetch(quickAuthRequest(), env())
      const responseText = await response.text()

      expect(response.status).toBe(503)
      expect(responseText).toContain('verification_unavailable')
      expect(responseText).not.toContain(QUICK_AUTH_TOKEN)
      expect(responseText).not.toContain('private verifier detail')
      expect(JSON.stringify(h.events)).not.toContain(QUICK_AUTH_TOKEN)
      expect(JSON.stringify(h.events)).not.toContain('private verifier detail')
      expect(h.events).toContain('quick_auth_verifier_unavailable')
      expect(h.events).toContain('quick_auth_rejected')
      expect(h.resolver.resolve).not.toHaveBeenCalled()
      expect(response.headers.has('set-cookie')).toBe(false)
    })

    it('bounds a stalled Quick Auth verifier without reaching admission authority', async () => {
      let markVerificationStarted!: () => void
      const verificationStarted = new Promise<void>((resolve) => {
        markVerificationStarted = resolve
      })
      const verifyJwt = vi.fn(async () => {
        markVerificationStarted()
        return new Promise<never>(() => undefined)
      })
      const h = harness({ quickAuthVerifier: { verifyJwt } })

      vi.useFakeTimers()
      try {
        const pending = h.app.fetch(quickAuthRequest(), env())
        await verificationStarted
        await vi.advanceTimersByTimeAsync(FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS)

        const unavailable = await pending
        expect(unavailable.status).toBe(503)
        await expect(unavailable.json()).resolves.toEqual({
          error: {
            code: 'verification_unavailable',
            message: 'Farcaster authentication is temporarily unavailable.',
          },
        })
        expect(verifyJwt).toHaveBeenCalledOnce()
        expect(h.resolver.resolve).not.toHaveBeenCalled()
        expect(h.events).toContain('quick_auth_verifier_unavailable')
        expect(h.events).toContain('quick_auth_rejected')
        expect(unavailable.headers.has('set-cookie')).toBe(false)
      } finally {
        vi.useRealTimers()
      }
    })

    it('maps an invalid Quick Auth JWT to the same non-retryable credential response', async () => {
      const verifyJwt = vi.fn(async () => {
        throw new QuickAuthErrors.InvalidTokenError('private invalid-token detail')
      })
      const h = harness({ quickAuthVerifier: { verifyJwt } })
      const response = await h.app.fetch(quickAuthRequest(), env())
      const responseText = await response.text()

      expect(response.status).toBe(401)
      expect(responseText).toContain('quick_auth_invalid')
      expect(responseText).not.toContain('private invalid-token detail')
      expect(h.events).not.toContain('quick_auth_verifier_unavailable')
      expect(h.events).toContain('quick_auth_rejected')
      expect(h.resolver.resolve).not.toHaveBeenCalled()
      expect(response.headers.has('set-cookie')).toBe(false)
    })

    it('accepts only an empty JSON object and rejects every query before verification', async () => {
      const h = harness()
      const extraBody = await h.app.fetch(quickAuthRequest(QUICK_AUTH_TOKEN, {
        fid: Number(FID),
      }), env())
      expect(extraBody.status).toBe(400)
      await expect(extraBody.json()).resolves.toMatchObject({ error: { code: 'invalid_request' } })

      const query = await h.app.fetch(quickAuthRequest(
        QUICK_AUTH_TOKEN,
        {},
        {},
        `${QUICK_AUTH_PATH}?domain=${QUICK_AUTH_DOMAIN}`,
      ), env())
      expect(query.status).toBe(400)
      await expect(query.json()).resolves.toEqual({
        error: {
          code: 'quick_auth_query_not_allowed',
          message: 'This endpoint does not accept query parameters.',
        },
      })
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    })

    it('uses exact non-credentialed CORS only on the Quick Auth route', async () => {
      const h = harness()
      const preflight = await h.app.fetch(request(QUICK_AUTH_PATH, undefined, {
        method: 'OPTIONS',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Authorization, Content-Type',
        },
      }), env())
      expect(preflight.status).toBe(204)
      expect(preflight.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
      expect(preflight.headers.get('access-control-allow-headers')).toBe('authorization, content-type')
      expect(preflight.headers.has('access-control-allow-credentials')).toBe(false)
      expect(preflight.headers.has('set-cookie')).toBe(false)
      expect(preflight.headers.has('content-type')).toBe(false)

      const hostile = await h.app.fetch(quickAuthRequest(QUICK_AUTH_TOKEN, {}, {
        headers: { origin: 'https://hostile.example' },
      }), env())
      expect(hostile.status).toBe(403)
      expect(hostile.headers.has('access-control-allow-origin')).toBe(false)
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()

      const extraHeader = await h.app.fetch(request(QUICK_AUTH_PATH, undefined, {
        method: 'OPTIONS',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type, x-caller-fid',
        },
      }), env())
      expect(extraHeader.status).toBe(403)
      await expect(extraHeader.json()).resolves.toMatchObject({ error: { code: 'header_not_allowed' } })

      const existingSiwf = await h.app.fetch(request('/v2/farcaster/exchange', undefined, {
        method: 'OPTIONS',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      }), env())
      expect(existingSiwf.status).toBe(403)
      expect(existingSiwf.headers.get('access-control-allow-headers')).toBe('content-type')
      expect(existingSiwf.headers.get('access-control-allow-credentials')).toBe('true')
    })

    it('rate-limits before verifier work and shares the SIWF exchange action', async () => {
      const check = vi.fn(async (_request: Request, _action: string) => ({
        allowed: false as const,
        retryAfterSeconds: 23,
      }))
      const h = harness({ rateLimiter: { check } })
      const response = await h.app.fetch(quickAuthRequest(), env())

      expect(response.status).toBe(429)
      expect(response.headers.get('retry-after')).toBe('23')
      expect(response.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(check).toHaveBeenCalledOnce()
      expect(check.mock.calls[0]?.[1]).toBe('exchange')
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    })

    it('preserves the public-auth kill switch for Quick Auth', async () => {
      const h = harness()
      const response = await h.app.fetch(quickAuthRequest(), env({ PUBLIC_AUTH_ENABLED: 'false' }))

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'public_auth_paused' } })
      expect(response.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
      expect(response.headers.has('access-control-allow-credentials')).toBe(false)
      expect(h.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
      expect(h.resolver.resolve).not.toHaveBeenCalled()
    })

    it('fails closed without a token when authoritative admission is unavailable', async () => {
      const h = harness({
        resolver: { resolve: vi.fn(async () => { throw new Error('private resolver detail') }) },
      })
      const response = await h.app.fetch(quickAuthRequest(), env())

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'authorization_unavailable',
          message: 'Authorization is temporarily unavailable.',
        },
      })
      expect(response.headers.has('set-cookie')).toBe(false)
      expect(h.events).toContain('auth_epoch_failed')
      expect(h.events).toContain('quick_auth_rejected')
    })
  })
})
