import { createSiweMessage } from 'viem/siwe'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createAuthBridge } from '../src/app'
import { MemoryChallengeStore } from '../src/challengeStore'
import type { AuthEpochResolver, FarcasterVerifier, SafeLogEvent, WorkerEnv } from '../src/types'

const ORIGIN = 'https://ael-dev3.github.io'
const DOMAIN = 'ael-dev3.github.io'
const SIWE_URI = 'https://ael-dev3.github.io/Warpkeep/'
const FID = '12345'
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
    SIGNING_KEY_JWK: JSON.stringify(privateJwk),
    ADMIN_TOKEN_SECRET: 'correct-horse-battery-staple',
    ENVIRONMENT: 'production',
    ...overrides,
  }
}

function request(path: string, body?: unknown, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers)
  if (body !== undefined) headers.set('content-type', 'application/json')
  return new Request(`https://bridge.warpkeep.example${path}`, {
    ...init,
    method: body === undefined ? 'GET' : 'POST',
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
  now: number
}

function harness(options: { epoch?: number; resolver?: AuthEpochResolver } = {}): Harness {
  const verifier = {
    verify: vi.fn(async () => ({ fid: FID })),
  }
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => options.epoch ?? 7),
  }
  const events: SafeLogEvent[] = []
  const now = Date.now()
  const app = createAuthBridge({
    challengeStore: new MemoryChallengeStore(),
    verifier,
    authEpochResolver: resolver,
    now: () => now,
    logger: { event: (event) => events.push(event) },
  })
  return { app, verifier, resolver: resolver as Harness['resolver'], events, now }
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

  it('publishes an exact OIDC issuer and a public-only ES256 JWKS', async () => {
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
    expect(h.verifier.verify).toHaveBeenCalledWith(expect.objectContaining({ acceptAuthAddress: true, nonce: challenge.nonce }))
    expect(h.resolver.resolve).toHaveBeenCalledWith(FID)

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

  it('does not issue a player JWT when the server-side auth epoch resolver is absent', async () => {
    const h = harness({ resolver: { resolve: async () => { throw new Error('offline') } } })
    const challenge = await issueChallenge(h)
    const exchange = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(exchange.status).toBe(503)
    await expect(exchange.json()).resolves.toMatchObject({ error: { code: 'authorization_unavailable' } })
  })

  it('fails closed with the production default when no auth epoch resolver is configured', async () => {
    const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
    const app = createAuthBridge({ challengeStore: new MemoryChallengeStore(), verifier })
    const challengeResponse = await app.fetch(request('/v1/farcaster/challenge', {
      domain: DOMAIN, siweUri: SIWE_URI,
    }, { headers: { origin: ORIGIN } }), env())
    const challenge = await json(challengeResponse)
    const response = await app.fetch(request('/v1/farcaster/exchange', proofFor(challenge), { headers: { origin: ORIGIN } }), env())
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ error: { code: 'authorization_unavailable' } })
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

    const secondChallenge = await issueChallenge(h)
    h.verifier.verify.mockResolvedValueOnce({ fid: '99999' })
    const mismatch = await h.app.fetch(request('/v1/farcaster/exchange', proofFor(secondChallenge), { headers: { origin: ORIGIN } }), env())
    expect(mismatch.status).toBe(401)
    await expect(mismatch.json()).resolves.toMatchObject({ error: { code: 'fid_mismatch' } })
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
  })

  it('requires the server-only admin secret and issues a five-minute admin token', async () => {
    const h = harness()
    const missing = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', { method: 'POST' }), env())
    expect(missing.status).toBe(401)

    const browser = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { origin: ORIGIN, authorization: 'Bearer correct-horse-battery-staple' },
    }), env())
    expect(browser.status).toBe(403)

    const granted = await h.app.fetch(new Request('https://bridge.warpkeep.example/v1/admin/token', {
      method: 'POST', headers: { authorization: 'Bearer correct-horse-battery-staple' },
    }), env())
    expect(granted.status).toBe(200)
    const grantedBody = await json(granted)
    expect(grantedBody.tokenType).toBe('spacetime-access')
    const claims = decodeJwtPayload(String(grantedBody.token))
    expect(claims).toMatchObject({ sub: 'service:hermes', roles: ['warpkeep-admin'], token_type: 'spacetime-access' })
    expect(Number(claims.exp) - Number(claims.iat)).toBe(5 * 60)
  })

  it('fails closed without a public issuer and writes only static safe log events', async () => {
    const h = harness()
    const response = await h.app.fetch(request('/healthz'), env({ ISSUER: undefined }))
    expect(response.status).toBe(503)
    expect(h.events).toContain('configuration_error')
    expect(JSON.stringify(h.events)).not.toContain('correct-horse-battery-staple')
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

  it('never places proof material in the default logger output', async () => {
    const log = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
    const resolver = { resolve: vi.fn(async () => 3) }
    const app = createAuthBridge({
      challengeStore: new MemoryChallengeStore(),
      verifier,
      authEpochResolver: resolver,
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
  })
})
