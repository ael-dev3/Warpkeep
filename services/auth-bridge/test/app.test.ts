import { createSiweMessage } from 'viem/siwe'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthBridge, type AuthBridgeDependencies } from '../src/app'
import { MemoryChallengeStore } from '../src/challengeStore'
import { FarcasterVerifierUnavailableError } from '../src/farcaster'
import type {
  AuthEpochResolver,
  FarcasterVerifier,
  RateLimiter,
  SafeLogEvent,
  WorkerEnv,
} from '../src/types'

const ORIGIN = 'https://ael-dev3.github.io'
const DOMAIN = 'ael-dev3.github.io'
const SIWE_URI = 'https://ael-dev3.github.io/Warpkeep/'
const FID = '12345'
const ADMIN_SECRET = 'TEST_ONLY_ADMIN_SECRET_'.repeat(2)
let privateJwk: JsonWebKey

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
  privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey)
})

function env(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ISSUER: 'https://bridge.warpkeep.example',
    ALLOWED_ORIGINS: ORIGIN,
    FARCASTER_DOMAIN: DOMAIN,
    FARCASTER_SIWE_URI: SIWE_URI,
    FARCASTER_RPC_URL: 'https://optimism-rpc.internal.example',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    OIDC_KEY_ID: 'test-es256-2026',
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    SIGNING_KEY_JWK: JSON.stringify(privateJwk),
    ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    ENVIRONMENT: 'production',
    ...overrides,
  }
}

function request(path: string, body?: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (body !== undefined && !headers.has('content-type')) headers.set('content-type', 'application/json')
  return new Request(`https://bridge.warpkeep.example${path}`, {
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

interface Harness {
  app: ReturnType<typeof createAuthBridge>
  verifier: FarcasterVerifier & { verify: ReturnType<typeof vi.fn> }
  resolver: AuthEpochResolver & { resolve: ReturnType<typeof vi.fn> }
  events: SafeLogEvent[]
  setNow(value: number): void
}

function harness(options: {
  epoch?: number
  resolver?: AuthEpochResolver
  verifier?: FarcasterVerifier
  rateLimiter?: RateLimiter
  signer?: AuthBridgeDependencies['signer']
} = {}): Harness {
  const verifier = options.verifier ?? {
    verify: vi.fn(async () => ({ fid: FID })),
  }
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => options.epoch ?? 7),
  }
  const events: SafeLogEvent[] = []
  let now = Date.now()
  const app = createAuthBridge({
    challengeStore: new MemoryChallengeStore(),
    verifier,
    authEpochResolver: resolver,
    rateLimiter: options.rateLimiter ?? { check: async () => ({ allowed: true }) },
    signer: options.signer,
    now: () => now,
    logger: { event: (event) => events.push(event) },
  })
  return {
    app,
    verifier: verifier as Harness['verifier'],
    resolver: resolver as Harness['resolver'],
    events,
    setNow(value) { now = value },
  }
}

async function issueChallenge(h: Harness): Promise<Record<string, unknown>> {
  const response = await h.app.fetch(request('/v1/farcaster/challenge', {
    domain: DOMAIN,
    siweUri: SIWE_URI,
  }, { headers: { origin: ORIGIN } }), env())
  expect(response.status).toBe(201)
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
    identity: { fid: FID, username: 'warpkeeper', displayName: 'Warp Keeper', pfpUrl: 'https://cdn.example/pfp.png' },
    ...overrides,
  }
}

describe('Warpkeep auth bridge', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rate-limits credential-bearing POST routes without affecting health or preflight', async () => {
    const check = vi.fn(async (_request: Request, action: string) => (
      action === 'challenge'
        ? { allowed: false as const, retryAfterSeconds: 17 }
        : { allowed: true as const }
    ))
    const h = harness({ rateLimiter: { check } })

    expect((await h.app.fetch(request('/healthz'), env())).status).toBe(200)
    expect((await h.app.fetch(request('/v1/farcaster/challenge', undefined, {
      method: 'OPTIONS',
      headers: { origin: ORIGIN, 'access-control-request-method': 'POST' },
    }), env())).status).toBe(204)
    expect(check).not.toHaveBeenCalled()

    const limited = await h.app.fetch(request('/v1/farcaster/challenge', {}, {
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
    const response = await h.app.fetch(request('/v1/farcaster/challenge', {}, {
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
      authEpochResolver: { resolve: vi.fn(async () => 0) },
      logger: { event: (event) => events.push(event) },
    })
    const headerCases: HeadersInit[] = [
      { origin: ORIGIN },
      { origin: ORIGIN, 'x-forwarded-for': '203.0.113.7' },
      { origin: ORIGIN, 'cf-connecting-ip': 'bad', 'x-forwarded-for': '203.0.113.7' },
    ]
    for (const headers of headerCases) {
      const response = await app.fetch(request('/v1/farcaster/challenge', {}, { headers }), env({
        AUTH_RATE_LIMITER: namespace as never,
      }))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({ error: { code: 'rate_limit_unavailable' } })
    }
    expect(namespace.idFromName).not.toHaveBeenCalled()
    expect(events.filter((event) => event === 'rate_limit_failed')).toHaveLength(3)
  })

  it.each(['/v1/farcaster/challenge', '/v1/farcaster/exchange'])(
    'rejects a simple hostile browser request to %s before quota consumption',
    async (pathname) => {
    const check = vi.fn(async () => ({ allowed: true as const }))
    const h = harness({ rateLimiter: { check } })
    const response = await h.app.fetch(new Request(`https://bridge.warpkeep.example${pathname}`, {
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

  it('does not consume a challenge when exchange is rate-limited', async () => {
    const check = vi.fn()
      .mockResolvedValueOnce({ allowed: true })
      .mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 11 })
      .mockResolvedValueOnce({ allowed: true })
    const h = harness({ rateLimiter: { check } })
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)

    const blocked = await h.app.fetch(request('/v1/farcaster/exchange', proof, {
      headers: { origin: ORIGIN },
    }), env())
    expect(blocked.status).toBe(429)
    expect(h.verifier.verify).not.toHaveBeenCalled()

    const retry = await h.app.fetch(request('/v1/farcaster/exchange', proof, {
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
      issuer: 'https://bridge.warpkeep.example',
      jwks_uri: 'https://bridge.warpkeep.example/.well-known/jwks.json',
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

    const exchange = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(200)
    const result = await json(exchange)
    expect(result.tokenType).toBe('spacetime-access')
    const claims = decodeJwtPayload(String(result.token))
    expect(claims).toMatchObject({
      iss: 'https://bridge.warpkeep.example',
      sub: `farcaster:${FID}`,
      aud: ['warpkeep-spacetimedb'],
      token_type: 'spacetime-access',
      fid: FID,
      auth_epoch: 11,
      roles: [],
      username: 'warpkeeper',
      display_name: 'Warp Keeper',
      pfp_url: 'https://cdn.example/pfp.png',
    })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(30 * 24 * 60 * 60)
    expect(claims.session_iat).toBe(claims.iat)
    expect(claims.session_exp).toBe(claims.exp)
    expect(h.verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ acceptAuthAddress: true, nonce: challenge.nonce }))
    expect(h.resolver.resolve).toHaveBeenCalledWith(FID)
    expect(h.events).toContain('auth_epoch_resolved')

    const jwks = await h.app.fetch(request('/.well-known/jwks.json'), env())
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      ((await json(jwks)).keys as JsonWebKey[])[0],
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    )
    const [header, payload, signature] = String(result.token).split('.')
    await expect(crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      decodeBase64Url(signature) as unknown as BufferSource,
      new TextEncoder().encode(`${header}.${payload}`),
    )).resolves.toBe(true)

    const replay = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(replay.status).toBe(401)
    await expect(replay.json()).resolves.toMatchObject({ error: { code: 'challenge_not_found' } })
  })

  it('preserves the missing-row epoch zero baseline', async () => {
    const h = harness({ epoch: 0 })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(
      request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }),
      env(),
    )
    expect(exchange.status).toBe(200)
    expect(decodeJwtPayload(String((await json(exchange)).token)).auth_epoch).toBe(0)
  })

  it('does not issue a player JWT when the server-side auth epoch lookup fails', async () => {
    const h = harness({ resolver: { resolve: async () => { throw new Error('offline') } } })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(503)
    await expect(exchange.json()).resolves.toMatchObject({ error: { code: 'authorization_unavailable' } })
    expect(h.events).toContain('auth_epoch_failed')
  })

  it('rejects arbitrary SIWF context, invalid proof signatures, and FID mismatches', async () => {
    const h = harness()
    const badChallenge = await h.app.fetch(request('/v1/farcaster/challenge', {
      domain: 'evil.example', siweUri: SIWE_URI,
    }, { headers: { origin: ORIGIN } }), env())
    expect(badChallenge.status).toBe(400)

    const challenge = await issueChallenge(h)
    h.verifier.verify.mockRejectedValueOnce(new Error('invalid signature'))
    const invalidSignature = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(invalidSignature.status).toBe(401)
    await expect(invalidSignature.json()).resolves.toMatchObject({ error: { code: 'invalid_proof' } })
    const invalidReplay = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(invalidReplay.status).toBe(401)
    await expect(invalidReplay.json()).resolves.toMatchObject({ error: { code: 'challenge_not_found' } })

    const secondChallenge = await issueChallenge(h)
    h.verifier.verify.mockResolvedValueOnce({ fid: '99999' })
    const mismatch = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(secondChallenge), { headers: { origin: ORIGIN } }), env())
    expect(mismatch.status).toBe(401)
    await expect(mismatch.json()).resolves.toMatchObject({ error: { code: 'fid_mismatch' } })
  })

  it('accepts a bounded smart-account signature shape for official verification', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request('/v1/farcaster/exchange', {
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

    const unavailable = await h.app.fetch(request('/v1/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(unavailable.status).toBe(503)
    await expect(unavailable.json()).resolves.toMatchObject({ error: { code: 'verification_unavailable' } })

    const retry = await h.app.fetch(request('/v1/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(retry.status).toBe(200)
    expect(verifier.verify).toHaveBeenCalledTimes(2)
  })

  it('enforces the CORS allowlist and rejects oversize bodies before parsing', async () => {
    const h = harness()
    const preflight = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/farcaster/challenge', {
      method: 'OPTIONS',
      headers: {
        origin: ORIGIN,
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    }), env())
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)

    const blocked = await h.app.fetch(request('/v1/farcaster/challenge', {}, { headers: { origin: 'https://evil.example' } }), env())
    expect(blocked.status).toBe(403)
    expect(blocked.headers.get('access-control-allow-origin')).toBeNull()

    const tooLarge = await h.app.fetch(request('/v1/farcaster/challenge', { domain: DOMAIN, siweUri: SIWE_URI, padding: 'x'.repeat(20_000) }, { headers: { origin: ORIGIN } }), env())
    expect(tooLarge.status).toBe(413)

    const wrongMediaType = await h.app.fetch(request('/v1/farcaster/challenge', {}, {
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
    const oversized = new Request('https://bridge.warpkeep.example/v1/farcaster/challenge', {
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

  it('requires the server-only admin secret and issues a five-minute admin token', async () => {
    const h = harness()
    const missing = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', { method: 'POST' }), env())
    expect(missing.status).toBe(401)

    const browser = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { origin: ORIGIN, authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(browser.status).toBe(403)

    const granted = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { authorization: `Bearer ${ADMIN_SECRET}` },
    }), env())
    expect(granted.status).toBe(200)
    const grantedBody = await json(granted)
    expect(grantedBody.tokenType).toBe('spacetime-access')
    const claims = decodeJwtPayload(String(grantedBody.token))
    expect(claims).toMatchObject({ sub: 'service:hermes', roles: ['warpkeep-admin'], token_type: 'spacetime-access' })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(5 * 60)
  })

  it('accepts a production-normalized zero-byte admin stream but rejects content', async () => {
    const h = harness()
    const authorization = ['Be', 'arer ', ADMIN_SECRET].join('')
    const normalizedEmptyStream = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
      method: 'POST',
      headers: { authorization },
      body: new Uint8Array(0),
    }), env())
    expect(normalizedEmptyStream.status).toBe(200)

    const bodyRejected = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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
      const response = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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
      const response = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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
    const streamed = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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
    const limitedResponse = await limited.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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
    const browserResponse = await browser.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
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

  it('requires the non-secret direct Maincloud configuration in production', async () => {
    const h = harness()
    const missing = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_URI: undefined }))
    expect(missing.status).toBe(503)
    const insecure = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_URI: 'http://maincloud.spacetimedb.com' }))
    expect(insecure.status).toBe(503)
    const malformedDatabase = await h.app.fetch(request('/healthz'), env({ SPACETIMEDB_DATABASE: 'warpkeep/unsafe' }))
    expect(malformedDatabase.status).toBe(503)
  })

  it('never places proof material in the default logger output', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
    const resolver = { resolve: vi.fn(async () => 3) }
    const app = createAuthBridge({
      challengeStore: new MemoryChallengeStore(),
      verifier,
      authEpochResolver: resolver,
      rateLimiter: { check: async () => ({ allowed: true }) },
    })
    const challengeResponse = await app.fetch(request('/v1/farcaster/challenge', {
      domain: DOMAIN, siweUri: SIWE_URI,
    }, { headers: { origin: ORIGIN } }), env())
    const challenge = await json(challengeResponse)
    const proof = proofFor(challenge)
    const exchange = await app.fetch(request('/v1/farcaster/exchange', proof, { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(200)
    const output = JSON.stringify(log.mock.calls)
    expect(output).toContain('exchange_succeeded')
    expect(output).not.toContain(String(proof.message))
    expect(output).not.toContain(String(proof.signature))
    expect(output).not.toContain(String(proof.nonce))
    expect(output).not.toContain(String(proof.requestId))
    expect(output).not.toContain(FID)
  })

  it('claims a challenge before upstream work so concurrent copies do not amplify it', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    let releaseVerification!: () => void
    h.verifier.verify.mockImplementationOnce(() => new Promise((resolve) => {
      releaseVerification = () => resolve({ fid: FID })
    }))

    const first = h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    await vi.waitFor(() => expect(h.verifier.verify).toHaveBeenCalledTimes(1))
    const contender = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
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

    const response = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), {
      headers: { origin: ORIGIN },
    }), env())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'challenge_expired' } })
    expect(h.resolver.resolve).toHaveBeenCalledTimes(1)
    expect(h.events).not.toContain('exchange_succeeded')

    const replay = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), {
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

    const response = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), {
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
        .mockResolvedValueOnce(9),
    }
    const h = harness({ resolver })
    const challenge = await issueChallenge(h)
    const first = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(first.status).toBe(503)

    const retry = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(retry.status).toBe(200)
    expect(resolver.resolve).toHaveBeenCalledTimes(2)
  })

  it('rejects an invalid signed-message expiry without converting it into a 500', async () => {
    const h = harness()
    const challenge = await issueChallenge(h)
    const proof = proofFor(challenge)
    const message = String(proof.message).replace(/^Expiration Time:.*$/m, 'Expiration Time: invalid')
    const response = await h.app.fetch(request('/v1/farcaster/exchange', {
      ...proof,
      message,
    }, { headers: { origin: ORIGIN } }), env())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'invalid_proof' } })
  })
})
