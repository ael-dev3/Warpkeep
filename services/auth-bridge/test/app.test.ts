import { createSiweMessage } from 'viem/siwe'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS,
  REQUEST_BODY_TIMEOUT_MILLISECONDS,
  createAuthBridge,
  type AuthBridgeDependencies,
} from '../src/app'
import { MemoryChallengeStore } from '../src/challengeStore'
import { PRODUCTION_SPACETIMEDB_DATABASE } from '../src/config'
import { FarcasterVerifierUnavailableError } from '../src/farcaster'
import { MemorySessionFamilyStore } from '../src/sessionFamily'
import {
  AuthEpochResolverFailure,
  type AuthEpochResolverFailureStage,
} from '../src/spacetimeAuthEpochResolver'
import type {
  AuthEpochResolver,
  ChallengeRecord,
  ChallengeStore,
  FarcasterVerifier,
  RateLimiter,
  SafeLogEvent,
  SessionFamilyStore,
  WorkerEnv,
} from '../src/types'

const ORIGIN = 'https://warpkeep.example'
const DOMAIN = 'warpkeep.example'
const SIWE_URI = 'https://warpkeep.example/Warpkeep/'
const FID = '12345'
const ADMIN_SECRET = 'TEST_ONLY_ADMIN_SECRET_'.repeat(2)
const SESSION_COOKIE_KEY = 'TEST_ONLY_SESSION_COOKIE_KEY_'.repeat(2)
const SERVER_ONLY_ADMIN_PATHS = [
  '/v1/admin/token',
  '/v1/admin/auth-epoch-probe',
  '/v1/admin/config-attestation',
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
    FARCASTER_RPC_URL: 'https://optimism-rpc.internal.example',
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
  resolver: AuthEpochResolver & { resolve: ReturnType<typeof vi.fn> }
  sessionStore: SessionFamilyStore
  events: SafeLogEvent[]
  setNow(value: number): void
}

function harness(options: {
  epoch?: number
  resolver?: AuthEpochResolver
  verifier?: FarcasterVerifier
  rateLimiter?: RateLimiter
  signer?: AuthBridgeDependencies['signer']
  challengeStore?: ChallengeStore
  sessionFamilyStore?: SessionFamilyStore
} = {}): Harness {
  const verifier = options.verifier ?? {
    verify: vi.fn(async () => ({ fid: FID })),
  }
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => (options.epoch ?? 7) === 0
      ? ({ state: 'missing', authEpoch: 0 } as const)
      : ({ state: 'enabled', authEpoch: options.epoch ?? 7 } as const)),
  }
  const events: SafeLogEvent[] = []
  const sessionStore = options.sessionFamilyStore ?? new MemorySessionFamilyStore()
  let now = Date.now()
  const app = createAuthBridge({
    challengeStore: options.challengeStore ?? new MemoryChallengeStore(),
    verifier,
    authEpochResolver: resolver,
    sessionFamilyStore: sessionStore,
    rateLimiter: options.rateLimiter ?? { check: async () => ({ allowed: true }) },
    signer: options.signer,
    now: () => now,
    logger: { event: (event) => events.push(event) },
  })
  return {
    app,
    verifier: verifier as Harness['verifier'],
    resolver: resolver as Harness['resolver'],
    sessionStore,
    events,
    setNow(value) { now = value },
  }
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
    expect(firstBody).toMatchObject({
      profile: 'warpkeep-auth-v2',
      publicAuthEnabled: true,
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
      spacetimeDbUri: 'https://maincloud.spacetimedb.com',
      spacetimeDbDatabase: PRODUCTION_SPACETIMEDB_DATABASE,
      publicAuthEnabled: true,
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
      accessTokenTtlSeconds: 600,
      authEpochResolverTokenTtlSeconds: 15,
      authEpochResolverTimeoutMilliseconds: 5_000,
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
    const paused = await json(await call({ PUBLIC_AUTH_ENABLED: 'false' }))
    expect(paused.digest).not.toBe(reviewedDigest)
    expect(paused.publicAuthEnabled).toBe(false)
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
})
