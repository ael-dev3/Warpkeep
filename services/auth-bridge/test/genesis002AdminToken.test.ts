import { beforeAll, describe, expect, it, vi } from 'vitest'

import { createAuthBridge } from '../src/app'
import { PRODUCTION_SPACETIMEDB_DATABASE } from '../src/config'
import type { RateLimiter, SafeLogEvent, WorkerEnv } from '../src/types'

const PATH = '/v1/admin/genesis-002-token'
const ADMIN_SECRET = 'TEST_ONLY_ADMIN_SECRET_'.repeat(2)
const SESSION_COOKIE_KEY = 'TEST_ONLY_SESSION_COOKIE_KEY_'.repeat(2)
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
    ISSUER: 'https://auth.warpkeep.com',
    ALLOWED_ORIGINS: 'https://warpkeep.com',
    FARCASTER_DOMAIN: 'warpkeep.com',
    FARCASTER_SIWE_URI: 'https://warpkeep.com/Warpkeep/',
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

function request(path = PATH, init: RequestInit = {}): Request {
  return new Request(`https://auth.warpkeep.com${path}`, {
    method: 'POST',
    headers: { authorization: `Bearer ${ADMIN_SECRET}`, ...init.headers },
    ...init,
  })
}

function decodePayload(token: string): Record<string, unknown> {
  const encoded = token.split('.')[1]!.replace(/-/gu, '+').replace(/_/gu, '/')
  return JSON.parse(atob(encoded)) as Record<string, unknown>
}

function harness(options: Readonly<{
  rateLimiter?: RateLimiter
  signer?: () => Promise<string>
}> = {}) {
  const events: SafeLogEvent[] = []
  return {
    events,
    app: createAuthBridge({
      rateLimiter: options.rateLimiter ?? { check: async () => ({ allowed: true }) },
      signer: options.signer,
      now: () => 1_800_000_000_000,
      logger: { event: event => events.push(event) },
    }),
  }
}

describe('Genesis 002 administrator token route', () => {
  it('issues only a no-store five-minute Hermes token for the exact G002 audience', async () => {
    const h = harness()
    const response = await h.app.fetch(request(), env())
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as Record<string, unknown>
    expect(body).toMatchObject({ tokenType: 'spacetime-access', expiresIn: 300 })
    expect(decodePayload(String(body.token))).toMatchObject({
      iss: 'https://auth.warpkeep.com',
      sub: 'service:hermes',
      aud: ['warpkeep-genesis-002-spacetimedb'],
      token_type: 'spacetime-access',
      roles: ['warpkeep-admin'],
      iat: 1_800_000_000,
      nbf: 1_800_000_000,
      exp: 1_800_000_300,
    })
    expect(decodePayload(String(body.token)).aud).not.toContain('warpkeep-spacetimedb')
    expect(decodePayload(String(body.token)).aud).not.toContain('warpkeep-ptr-spacetimedb')
    expect(h.events).toEqual(['genesis002_admin_token_issued'])
  })

  it.each([
    ['origin', request(PATH, { headers: { origin: 'https://warpkeep.com' } }), 403],
    ['query', request(`${PATH}?format=json`), 400],
    ['bare query', request(`${PATH}?`), 400],
    ['body', request(PATH, { body: '{}' }), 400],
    ['wrong secret', request(PATH, { headers: { authorization: 'Bearer wrong-secret' } }), 401],
  ])('rejects %s without minting', async (_name, candidate, status) => {
    const signer = vi.fn(async () => 'must-not-mint')
    const h = harness({ signer })
    const response = await h.app.fetch(candidate, env())
    expect(response.status).toBe(status)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(signer).not.toHaveBeenCalled()
  })

  it('fails closed on rate-limit and signing failures with typed safe events', async () => {
    const limited = harness({
      rateLimiter: { check: async () => ({ allowed: false, retryAfterSeconds: 17 }) },
    })
    const limitedResponse = await limited.app.fetch(request(), env())
    expect(limitedResponse.status).toBe(429)
    expect(limitedResponse.headers.get('retry-after')).toBe('17')

    const unavailable = harness({
      rateLimiter: { check: async () => { throw new Error('unavailable') } },
    })
    const unavailableResponse = await unavailable.app.fetch(request(), env())
    expect(unavailableResponse.status).toBe(503)
    expect(unavailable.events).toEqual(['rate_limit_failed'])

    const unsigned = harness({ signer: async () => { throw new Error('disabled') } })
    const unsignedResponse = await unsigned.app.fetch(request(), env())
    expect(unsignedResponse.status).toBe(503)
    expect(unsigned.events).toEqual(['configuration_error'])

    const rejected = harness()
    const digest = vi.spyOn(crypto.subtle, 'digest')
    const rejectedResponse = await rejected.app.fetch(request(PATH, {
      headers: { authorization: 'Bearer wrong-secret' },
    }), env())
    expect(rejectedResponse.status).toBe(401)
    expect(digest).toHaveBeenCalled()
    digest.mockRestore()
    expect(rejected.events).toEqual(['genesis002_admin_token_rejected'])
    expect(rejected.events).not.toContain('admin_token_rejected')
  })
})
