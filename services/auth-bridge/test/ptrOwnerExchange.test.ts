import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  PRODUCTION_SPACETIMEDB_DATABASE,
  PTR_TOKEN_TTL_SECONDS,
  readBridgeConfig,
  type BridgeConfig,
} from '../src/config'
import { createAuthBridge, type AuthBridgeDependencies } from '../src/app'
import type {
  QuickAuthVerifier,
  SafeLogEvent,
  WorkerEnv,
} from '../src/types'
import * as jwt from '../src/jwt'

const OWNER_FID = '12345'
const PTR_DATABASE_IDENTITY = '1'.repeat(64)
const PTR_AUDIENCE = 'warpkeep-ptr-spacetimedb'
const PTR_EXCHANGE_PATH = '/v2/farcaster/ptr/exchange'
const PTR_ADMIN_TOKEN_PATH = '/v1/admin/ptr-token'
const ADMIN_TOKEN_PATH = '/v1/admin/token'
const CONFIG_ATTESTATION_PATH = '/v1/admin/config-attestation'
const QUICK_AUTH_ORIGIN = 'https://warpkeep.com'
const QUICK_AUTH_ISSUER = 'https://auth.farcaster.xyz'
const QUICK_AUTH_DOMAIN = 'warpkeep.com'
const QUICK_AUTH_TOKEN = 'header.payload.signature'
const ADMIN_SECRET = 'admin-secret-that-is-longer-than-thirty-two-bytes'

let privateJwk: JsonWebKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
})

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ISSUER: 'https://auth.warpkeep.example',
    ALLOWED_ORIGINS: 'https://warpkeep.example',
    FARCASTER_DOMAIN: 'warpkeep.example',
    FARCASTER_SIWE_URI: 'https://warpkeep.example/Warpkeep/',
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
    SESSION_COOKIE_KEY: 'cookie-key-that-is-also-longer-than-thirty-two-bytes',
    ENVIRONMENT: 'production',
    ...overrides,
  }
}

function ptrEnv(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return env({
    PTR_ENABLED: 'true',
    PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
    PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
    PLAYER_CANARY_OWNER_FID: OWNER_FID,
    ...overrides,
  })
}

function ptrRequest(
  body: unknown = {},
  init: RequestInit = {},
): Request {
  const headers = new Headers(init.headers)
  if (!headers.has('origin')) headers.set('origin', QUICK_AUTH_ORIGIN)
  if (!headers.has('authorization')) headers.set('authorization', `Bearer ${QUICK_AUTH_TOKEN}`)
  if (!headers.has('content-type')) headers.set('content-type', 'application/json')
  return new Request(`https://auth.warpkeep.example${PTR_EXCHANGE_PATH}`, {
    ...init,
    method: init.method ?? 'POST',
    headers,
    body: JSON.stringify(body),
  })
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
  return JSON.parse(atob(encoded)) as Record<string, unknown>
}

function quickAuthPayload(nowMilliseconds: number, fid = OWNER_FID): Record<string, unknown> {
  return {
    sub: Number(fid),
    iss: QUICK_AUTH_ISSUER,
    aud: QUICK_AUTH_DOMAIN,
    iat: Math.floor(nowMilliseconds / 1_000),
    exp: Math.floor(nowMilliseconds / 1_000) + 300,
  }
}

function routeHarness(options: {
  nowValues?: readonly number[]
  payload?: Record<string, unknown>
  signer?: AuthBridgeDependencies['signer']
} = {}) {
  const values = options.nowValues ?? [1_800_000_000_000]
  let clockIndex = 0
  const now = vi.fn(() => values[Math.min(clockIndex++, values.length - 1)]!)
  const payload = options.payload ?? quickAuthPayload(values[0]!)
  const verifyJwt = vi.fn(async () => payload)
  const rateLimit = vi.fn(async (_request: Request, _action: string) => ({ allowed: true as const }))
  const events: SafeLogEvent[] = []
  const app = createAuthBridge({
    quickAuthVerifier: { verifyJwt },
    rateLimiter: { check: rateLimit },
    ...(options.signer ? { signer: options.signer } : {}),
    now,
    logger: { event: event => events.push(event) },
  })
  return { app, events, now, payload, rateLimit, verifyJwt }
}

describe('owner-only PTR exchange', () => {
  it('defaults disabled and enables only a complete isolated PTR target', () => {
    const disabled = readBridgeConfig(env())
    expect(disabled.ptrEnabled).toBe(false)
    expect(disabled.ptrSpacetimeDb).toBeUndefined()

    const enabled = readBridgeConfig(env({
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    }))
    expect(enabled.ptrEnabled).toBe(true)
    expect(enabled.ptrSpacetimeDb).toEqual({
      database: PTR_DATABASE_IDENTITY,
      audience: PTR_AUDIENCE,
    })
  })

  it('rejects incomplete, non-exact, aliased, or colliding PTR configuration', () => {
    const valid = {
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    } satisfies Partial<WorkerEnv>
    const invalid: readonly Partial<WorkerEnv>[] = [
      { ...valid, PTR_ENABLED: 'TRUE' },
      { ...valid, PTR_SPACETIMEDB_DATABASE: undefined },
      { ...valid, PTR_OIDC_AUDIENCE: undefined },
      { ...valid, PLAYER_CANARY_OWNER_FID: undefined },
      { ...valid, PTR_SPACETIMEDB_DATABASE: 'ptr-alias' },
      { ...valid, PTR_SPACETIMEDB_DATABASE: ` ${PTR_DATABASE_IDENTITY}` },
      { ...valid, PTR_OIDC_AUDIENCE: 'warpkeep-ptr-other' },
      { ...valid, PTR_SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE },
      { ...valid, OIDC_AUDIENCE: PTR_AUDIENCE },
      {
        ...valid,
        QA_OBSERVER_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        QA_OBSERVER_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
        QA_OBSERVER_OIDC_AUDIENCE: 'warpkeep-qa-observer-spacetimedb',
      },
      {
        ...valid,
        QA_OBSERVER_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        QA_OBSERVER_SPACETIMEDB_DATABASE: '2'.repeat(64),
        QA_OBSERVER_OIDC_AUDIENCE: PTR_AUDIENCE,
      },
    ]
    for (const overrides of invalid) {
      expect(() => readBridgeConfig(env(overrides))).toThrow()
    }
  })

  it('builds a 120-second owner token scoped only to PTR', () => {
    const config = readBridgeConfig(env({
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    }))
    const ptrOwnerClaims = (jwt as unknown as {
      ptrOwnerClaims?: (config: BridgeConfig, nowSeconds: number, fid: string) => Record<string, unknown>
    }).ptrOwnerClaims
    expect(ptrOwnerClaims).toBeTypeOf('function')

    const claims = ptrOwnerClaims!(config, 1_800_000_000, OWNER_FID)
    expect(claims).toMatchObject({
      iss: config.issuer,
      sub: `farcaster:${OWNER_FID}`,
      aud: [PTR_AUDIENCE],
      token_type: 'spacetime-access',
      auth_version: 2,
      realm_id: 'PTR',
      fid: OWNER_FID,
      auth_epoch: 1,
      roles: ['warpkeep-ptr-owner'],
      iat: 1_800_000_000,
      nbf: 1_800_000_000,
      exp: 1_800_000_120,
      session_iat: 1_800_000_000,
      session_exp: 1_800_000_120,
    })
    expect(claims.jti).toMatch(/^[A-Za-z0-9_-]{24}$/)
    expect(Object.keys(claims).sort()).toEqual([
      'aud',
      'auth_epoch',
      'auth_version',
      'exp',
      'fid',
      'iat',
      'iss',
      'jti',
      'nbf',
      'realm_id',
      'roles',
      'session_exp',
      'session_iat',
      'sub',
      'token_type',
    ])
  })

  it('refuses malformed PTR owner claim inputs before a token can be signed', () => {
    const config = readBridgeConfig(ptrEnv())
    const ptrOwnerClaims = (jwt as unknown as {
      ptrOwnerClaims: (
        config: BridgeConfig,
        nowSeconds: number,
        fid: string,
        ttlSeconds?: number,
      ) => Record<string, unknown>
    }).ptrOwnerClaims
    for (const nowSeconds of [Number.NaN, -1, 1.5, Number.MAX_SAFE_INTEGER]) {
      expect(() => ptrOwnerClaims(config, nowSeconds, OWNER_FID)).toThrow()
    }
    for (const fid of ['', '0', '012345', '1.5', '67890', '9007199254740992']) {
      expect(() => ptrOwnerClaims(config, 1_800_000_000, fid)).toThrow()
    }
    const disabledConfig = readBridgeConfig(env({
      PTR_ENABLED: 'false',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    }))
    expect(() => ptrOwnerClaims(disabledConfig, 1_800_000_000, OWNER_FID)).toThrow()
    expect(() => ptrOwnerClaims(
      config,
      1_800_000_000,
      OWNER_FID,
      PTR_TOKEN_TTL_SECONDS + 1,
    )).toThrow()
  })

  it('issues an exact owner response and PTR-only JWT without consulting Genesis admission', async () => {
    const now = 1_800_000_000_000
    const quickAuthVerifier: QuickAuthVerifier = {
      verifyJwt: vi.fn(async () => ({
        sub: Number(OWNER_FID),
        iss: QUICK_AUTH_ISSUER,
        aud: QUICK_AUTH_DOMAIN,
        iat: now / 1_000 - 1,
        exp: now / 1_000 + 300,
      })),
    }
    const rateLimit = vi.fn(async (_request: Request, _action: string) => ({ allowed: true as const }))
    const events: SafeLogEvent[] = []
    const app = createAuthBridge({
      quickAuthVerifier,
      authEpochResolver: {
        resolve: vi.fn(async () => { throw new Error('PTR must not consult Genesis admission') }),
      },
      rateLimiter: { check: rateLimit },
      now: () => now,
      logger: { event: event => events.push(event) },
    })

    const response = await app.fetch(ptrRequest(), ptrEnv({ PUBLIC_AUTH_ENABLED: 'false' }))

    expect(response.status).toBe(200)
    expect(response.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
    expect(response.headers.has('access-control-allow-credentials')).toBe(false)
    expect(response.headers.has('set-cookie')).toBe(false)
    const body = await response.json() as Record<string, unknown>
    expect(Object.keys(body)).toEqual([
      'version',
      'status',
      'realmId',
      'identity',
      'databaseIdentity',
      'accessToken',
      'tokenType',
      'accessExpiresAt',
    ])
    expect(body).toMatchObject({
      version: 1,
      status: 'authorized',
      realmId: 'PTR',
      identity: { fid: Number(OWNER_FID) },
      databaseIdentity: PTR_DATABASE_IDENTITY,
      tokenType: 'spacetime-access',
      accessExpiresAt: now + PTR_TOKEN_TTL_SECONDS * 1_000,
    })
    expect(decodeJwtPayload(String(body.accessToken))).toMatchObject({
      aud: [PTR_AUDIENCE],
      sub: `farcaster:${OWNER_FID}`,
      fid: OWNER_FID,
      realm_id: 'PTR',
      roles: ['warpkeep-ptr-owner'],
      auth_epoch: 1,
      session_iat: now / 1_000,
      session_exp: now / 1_000 + PTR_TOKEN_TTL_SECONDS,
    })
    expect(quickAuthVerifier.verifyJwt).toHaveBeenCalledWith({
      token: QUICK_AUTH_TOKEN,
      domain: QUICK_AUTH_DOMAIN,
    })
    expect(rateLimit).toHaveBeenCalledOnce()
    expect(rateLimit.mock.calls[0]?.[1]).toBe('exchange')
    expect(events).toEqual(['ptr_exchange_succeeded'])
  })

  it('returns a generic denial for a non-owner without resolving admission or leaking either FID', async () => {
    const h = routeHarness()
    const response = await h.app.fetch(ptrRequest(), ptrEnv({
      PLAYER_CANARY_OWNER_FID: '67890',
    }))

    expect(response.status).toBe(403)
    const text = await response.text()
    expect(JSON.parse(text)).toEqual({
      error: {
        code: 'ptr_forbidden',
        message: 'PTR authorization was not granted.',
      },
    })
    expect(text).not.toContain(OWNER_FID)
    expect(text).not.toContain('67890')
    expect(JSON.stringify(h.events)).not.toContain(OWNER_FID)
    expect(JSON.stringify(h.events)).not.toContain('67890')
    expect(h.events).toEqual(['ptr_exchange_rejected'])
  })

  it('rejects absent, wrong, or mixed credentials before Quick Auth verification', async () => {
    const requests = [
      ptrRequest({}, { headers: { authorization: '' } }),
      ptrRequest({}, { headers: { authorization: 'Basic abc' } }),
      ptrRequest({}, { headers: { cookie: '__Host-warpkeep_session=mixed' } }),
      ptrRequest({}, { headers: { 'proxy-authorization': 'Bearer proxy' } }),
    ]
    for (const candidate of requests) {
      const h = routeHarness()
      const response = await h.app.fetch(candidate, ptrEnv())
      expect(response.status).toBe(401)
      await expect(response.json()).resolves.toEqual({
        error: {
          code: 'quick_auth_invalid',
          message: 'Farcaster authentication could not be verified.',
        },
      })
      expect(h.verifyJwt).not.toHaveBeenCalled()
      expect(h.events).toEqual(['ptr_exchange_rejected'])
    }
  })

  it('accepts a 120-second-old proof and rejects one second older before signing', async () => {
    const now = 1_800_000_000_000
    const payloadAtAge = (ageSeconds: number) => ({
      ...quickAuthPayload(now),
      iat: now / 1_000 - ageSeconds,
      exp: now / 1_000 + 300,
    })
    const accepted = routeHarness({ payload: payloadAtAge(PTR_TOKEN_TTL_SECONDS) })
    expect((await accepted.app.fetch(ptrRequest(), ptrEnv())).status).toBe(200)

    const signer = vi.fn(async () => 'must-not-be-issued')
    const rejected = routeHarness({
      payload: payloadAtAge(PTR_TOKEN_TTL_SECONDS + 1),
      signer,
    })
    const response = await rejected.app.fetch(ptrRequest(), ptrEnv())
    expect(response.status).toBe(401)
    expect(signer).not.toHaveBeenCalled()
    expect(rejected.events).toEqual(['ptr_exchange_rejected'])
  })

  it('revalidates freshness before signing and discards a signed token after completion drift', async () => {
    const now = 1_800_000_000_000
    const tooLate = now + (PTR_TOKEN_TTL_SECONDS + 1) * 1_000
    const beforeSigner = vi.fn(async () => 'must-not-be-issued')
    const before = routeHarness({
      nowValues: [now, tooLate],
      payload: quickAuthPayload(now),
      signer: beforeSigner,
    })
    expect((await before.app.fetch(ptrRequest(), ptrEnv())).status).toBe(401)
    expect(beforeSigner).not.toHaveBeenCalled()

    const payload = quickAuthPayload(now)
    const completionSigner = vi.fn(async () => {
      payload.sub = 67890
      return 'header.payload.signature'
    })
    const completion = routeHarness({ payload, signer: completionSigner })
    const response = await completion.app.fetch(ptrRequest(), ptrEnv())
    expect(response.status).toBe(403)
    expect(completionSigner).toHaveBeenCalledOnce()
    expect(completion.events).toEqual(['ptr_exchange_rejected'])
    expect(await response.text()).not.toContain('67890')
  })

  it('fails closed while disabled or incomplete before rate limiting and verification', async () => {
    const disabled = routeHarness()
    const disabledResponse = await disabled.app.fetch(ptrRequest(), env({ PTR_ENABLED: 'false' }))
    expect(disabledResponse.status).toBe(503)
    await expect(disabledResponse.json()).resolves.toMatchObject({ error: { code: 'ptr_unavailable' } })
    expect(disabled.rateLimit).not.toHaveBeenCalled()
    expect(disabled.verifyJwt).not.toHaveBeenCalled()

    const incomplete = routeHarness()
    const incompleteResponse = await incomplete.app.fetch(ptrRequest(), env({ PTR_ENABLED: 'true' }))
    expect(incompleteResponse.status).toBe(503)
    await expect(incompleteResponse.json()).resolves.toMatchObject({ error: { code: 'service_misconfigured' } })
    expect(incomplete.rateLimit).not.toHaveBeenCalled()
    expect(incomplete.verifyJwt).not.toHaveBeenCalled()
  })

  it('enforces exact empty JSON, no query, and exact non-credentialed CORS', async () => {
    const preflight = routeHarness()
    const preflightResponse = await preflight.app.fetch(new Request(
      `https://auth.warpkeep.example${PTR_EXCHANGE_PATH}`,
      {
        method: 'OPTIONS',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'Authorization, Content-Type',
        },
      },
    ), ptrEnv())
    expect(preflightResponse.status).toBe(204)
    expect(preflightResponse.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
    expect(preflightResponse.headers.get('access-control-allow-headers')).toBe('authorization, content-type')
    expect(preflightResponse.headers.has('access-control-allow-credentials')).toBe(false)
    expect(preflight.rateLimit).not.toHaveBeenCalled()

    const hostile = routeHarness()
    const hostileResponse = await hostile.app.fetch(ptrRequest({}, {
      headers: { origin: 'https://hostile.example' },
    }), ptrEnv())
    expect(hostileResponse.status).toBe(403)
    expect(hostileResponse.headers.has('access-control-allow-origin')).toBe(false)
    expect(hostile.verifyJwt).not.toHaveBeenCalled()

    for (const candidate of [
      ptrRequest({ extra: true }),
      new Request(`https://auth.warpkeep.example${PTR_EXCHANGE_PATH}?`, {
        method: 'POST',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          authorization: `Bearer ${QUICK_AUTH_TOKEN}`,
          'content-type': 'application/json',
        },
        body: '{}',
      }),
    ]) {
      const h = routeHarness()
      const response = await h.app.fetch(candidate, ptrEnv())
      expect(response.status).toBe(400)
      expect(h.verifyJwt).not.toHaveBeenCalled()
      expect(response.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
    }
  })

  it('issues a distinct five-minute Hermes admin token scoped only to the PTR audience', async () => {
    const now = 1_800_000_000_000
    const h = routeHarness({ nowValues: [now] })
    const adminRequest = (path: string) => new Request(`https://auth.warpkeep.example${path}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    })

    const [mainResponse, ptrResponse] = await Promise.all([
      h.app.fetch(adminRequest(ADMIN_TOKEN_PATH), ptrEnv()),
      h.app.fetch(adminRequest(PTR_ADMIN_TOKEN_PATH), ptrEnv()),
    ])

    expect(mainResponse.status).toBe(200)
    expect(ptrResponse.status).toBe(200)
    const mainBody = await mainResponse.json() as Record<string, unknown>
    const ptrBody = await ptrResponse.json() as Record<string, unknown>
    expect(Object.keys(ptrBody)).toEqual(['token', 'tokenType', 'expiresIn'])
    expect(ptrBody).toMatchObject({ tokenType: 'spacetime-access', expiresIn: 5 * 60 })
    const mainClaims = decodeJwtPayload(String(mainBody.token))
    const ptrClaims = decodeJwtPayload(String(ptrBody.token))
    expect(mainClaims).toMatchObject({
      sub: 'service:hermes',
      aud: ['warpkeep-spacetimedb'],
      roles: ['warpkeep-admin'],
    })
    expect(ptrClaims).toMatchObject({
      sub: 'service:hermes',
      aud: [PTR_AUDIENCE],
      roles: ['warpkeep-admin'],
      iat: now / 1_000,
      nbf: now / 1_000,
      exp: now / 1_000 + 5 * 60,
    })
    expect(ptrClaims.aud).not.toEqual(mainClaims.aud)
    expect(ptrResponse.headers.has('access-control-allow-origin')).toBe(false)
  })

  it('denies PTR administration while disabled or malformed before credentials or signing', async () => {
    const signer = vi.fn(async () => 'must-not-be-issued')
    const disabled = routeHarness({ signer })
    const request = () => new Request(`https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`, {
      method: 'POST',
      headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    })
    const disabledResponse = await disabled.app.fetch(request(), env({
      PTR_ENABLED: 'false',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
    }))
    expect(disabledResponse.status).toBe(503)
    await expect(disabledResponse.json()).resolves.toMatchObject({
      error: { code: 'ptr_admin_unavailable' },
    })
    expect(disabled.rateLimit).not.toHaveBeenCalled()
    expect(signer).not.toHaveBeenCalled()

    const malformed = routeHarness({ signer })
    const malformedResponse = await malformed.app.fetch(request(), env({ PTR_ENABLED: 'true' }))
    expect(malformedResponse.status).toBe(503)
    await expect(malformedResponse.json()).resolves.toMatchObject({
      error: { code: 'service_misconfigured' },
    })
    expect(malformed.rateLimit).not.toHaveBeenCalled()
    expect(signer).not.toHaveBeenCalled()
  })

  it('keeps PTR administration server-only, bodyless, queryless, and secret-authenticated', async () => {
    const cases = [
      {
        request: new Request(`https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`, {
          method: 'POST',
          headers: { origin: QUICK_AUTH_ORIGIN, authorization: `Bearer ${ADMIN_SECRET}` },
        }),
        status: 403,
      },
      {
        request: new Request(`https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}?format=json`, {
          method: 'POST',
          headers: { authorization: `Bearer ${ADMIN_SECRET}` },
        }),
        status: 400,
      },
      {
        request: new Request(`https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`, {
          method: 'POST',
          headers: { authorization: `Bearer ${ADMIN_SECRET}`, 'content-type': 'application/json' },
          body: '{}',
        }),
        status: 400,
      },
      {
        request: new Request(`https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`, {
          method: 'POST',
          headers: { authorization: 'Bearer wrong-admin-secret' },
        }),
        status: 401,
      },
    ] as const
    for (const testCase of cases) {
      const h = routeHarness()
      const response = await h.app.fetch(testCase.request, ptrEnv())
      expect(response.status).toBe(testCase.status)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
      expect(JSON.stringify(h.events)).not.toContain(ADMIN_SECRET)
      expect(JSON.stringify(h.events)).not.toContain(OWNER_FID)
    }
  })

  it('rate-limits the PTR admin token before reading credentials and never adds CORS', async () => {
    const check = vi.fn(async (_request: Request, _action: string) => ({
      allowed: false as const,
      retryAfterSeconds: 41,
    }))
    const signer = vi.fn(async () => 'must-not-be-issued')
    const events: SafeLogEvent[] = []
    const app = createAuthBridge({
      rateLimiter: { check },
      signer,
      logger: { event: event => events.push(event) },
    })
    const response = await app.fetch(new Request(
      `https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`,
      { method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` } },
    ), ptrEnv())

    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('41')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(check).toHaveBeenCalledOnce()
    expect(check.mock.calls[0]?.[1]).toBe('admin-token')
    expect(signer).not.toHaveBeenCalled()
    expect(events).toEqual(['rate_limited'])
  })

  it('fails closed before signing a PTR admin token when the clock is invalid', async () => {
    for (const invalidNow of [Number.NaN, -1, Number.MAX_SAFE_INTEGER + 1]) {
      const signer = vi.fn(async () => 'must-not-be-issued')
      const h = routeHarness({ nowValues: [invalidNow], signer })
      const response = await h.app.fetch(new Request(
        `https://auth.warpkeep.example${PTR_ADMIN_TOKEN_PATH}`,
        { method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` } },
      ), ptrEnv())

      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'signing_unavailable' },
      })
      expect(signer).not.toHaveBeenCalled()
      expect(h.events).not.toContain('ptr_admin_token_issued')
    }
  })

  it('binds non-secret PTR state and immutable target coordinates into private authority', async () => {
    const h = routeHarness()
    const call = (overrides: Partial<WorkerEnv>) => h.app.fetch(new Request(
      `https://auth.warpkeep.example${CONFIG_ATTESTATION_PATH}`,
      { method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` } },
    ), env(overrides))
    const disabled = await call({ PTR_ENABLED: 'false' })
    const configured = await call({
      PTR_ENABLED: 'false',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
    })
    const drifted = await call({
      PTR_ENABLED: 'false',
      PTR_SPACETIMEDB_DATABASE: '2'.repeat(64),
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
    })
    const enabled = await call({
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    })
    const enabledOtherOwner = await call({
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: PTR_AUDIENCE,
      PLAYER_CANARY_OWNER_FID: '67890',
    })

    for (const response of [disabled, configured, drifted, enabled, enabledOtherOwner]) {
      expect(response.status).toBe(200)
      expect(response.headers.has('access-control-allow-origin')).toBe(false)
    }
    const disabledBody = await disabled.json() as Record<string, unknown>
    const configuredBody = await configured.json() as Record<string, unknown>
    const driftedBody = await drifted.json() as Record<string, unknown>
    const enabledBody = await enabled.json() as Record<string, unknown>
    const enabledOtherOwnerBody = await enabledOtherOwner.json() as Record<string, unknown>
    expect(disabledBody).toMatchObject({
      ptrEnabled: false,
      ptrSpacetimeDbDatabase: null,
      ptrAudience: null,
    })
    expect(configuredBody).toMatchObject({
      ptrEnabled: false,
      ptrSpacetimeDbDatabase: PTR_DATABASE_IDENTITY,
      ptrAudience: PTR_AUDIENCE,
    })
    expect(enabledBody).toMatchObject({
      ptrEnabled: true,
      ptrSpacetimeDbDatabase: PTR_DATABASE_IDENTITY,
      ptrAudience: PTR_AUDIENCE,
    })
    expect(new Set([
      disabledBody.digest,
      configuredBody.digest,
      driftedBody.digest,
      enabledBody.digest,
    ]).size).toBe(4)
    expect(enabledOtherOwnerBody.digest).toBe(enabledBody.digest)
    expect(JSON.stringify(enabledBody)).not.toContain(OWNER_FID)
    expect(JSON.stringify(enabledOtherOwnerBody)).not.toContain('67890')

    const malformed = await call({
      PTR_ENABLED: 'true',
      PTR_SPACETIMEDB_DATABASE: PTR_DATABASE_IDENTITY,
      PTR_OIDC_AUDIENCE: 'warpkeep-ptr-other',
      PLAYER_CANARY_OWNER_FID: OWNER_FID,
    })
    expect(malformed.status).toBe(503)
    await expect(malformed.json()).resolves.toMatchObject({
      error: { code: 'service_misconfigured' },
    })
  })
})
