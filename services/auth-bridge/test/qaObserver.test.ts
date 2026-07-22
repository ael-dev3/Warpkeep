import { beforeAll, describe, expect, it, vi } from 'vitest'
import { createAuthBridge } from '../src/app'
import {
  PRODUCTION_SPACETIMEDB_DATABASE,
  QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS,
  type PublicEcJwk,
} from '../src/config'
import {
  MemoryQaObserverChallengeStore,
  canonicalQaObserverSigningInput,
  qaObserverKeyThumbprint,
} from '../src/qaObserver'
import type { QaObserverRealmSnapshot } from '../src/spacetimeQaObserverResolver'
import { QaSnapshotResolverFailure } from '../src/spacetimeQaObserverResolver'
import type { RateLimitAction, SafeLogEvent, WorkerEnv } from '../src/types'

const ISSUER = 'https://auth.warpkeep.example'
const ORIGIN = 'https://warpkeep.example'
const ADMIN_SECRET = 'TEST_ONLY_ADMIN_SECRET_'.repeat(2)
const SESSION_COOKIE_KEY = 'TEST_ONLY_SESSION_COOKIE_KEY_'.repeat(2)
const QA_DATABASE_IDENTITY = 'd2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const NOW = 1_800_000_000_000

let signingPrivateJwk: JsonWebKey
let qaPrivateKey: CryptoKey
let qaPublicJwk: PublicEcJwk

const SNAPSHOT: QaObserverRealmSnapshot = Object.freeze({
  version: 2,
  protocolVersion: 3,
  worldSeed: 3_445_214_658,
  worldSeedName: 'HEGEMONY_GENESIS_001',
  worldTileCount: 10_000,
  worldTileMetaCount: 10_000,
  realm: Object.freeze({
    realmId: 'GENESIS_001',
    numericSeed: 3_445_214_658,
    generationVersion: 3,
    authoritativeRadius: 58,
    renderRadius: 60,
    playerCapacity: 100,
  }),
  aggregates: Object.freeze({
    castleCount: 1,
    profileCount: 1,
    foundedCount: 0,
    activeCount: 1,
  }),
})

const SNAPSHOT_V2: QaObserverRealmSnapshot = Object.freeze({
  ...SNAPSHOT,
  worldTileCount: 1_261,
  worldTileMetaCount: 1_261,
  realm: Object.freeze({
    ...SNAPSHOT.realm,
    generationVersion: 2,
    authoritativeRadius: 20,
    renderRadius: 22,
  }),
})

const RAW_SPACETIME_SNAPSHOT = Object.freeze([
  2,
  3,
  3_445_214_658,
  'HEGEMONY_GENESIS_001',
  10_000,
  10_000,
  Object.freeze(['GENESIS_001', 3_445_214_658, 3, 58, 60, 100]),
  Object.freeze([1, 1, 0, 1]),
])

const RAW_SPACETIME_SNAPSHOT_V2 = Object.freeze([
  2,
  3,
  3_445_214_658,
  'HEGEMONY_GENESIS_001',
  1_261,
  1_261,
  Object.freeze(['GENESIS_001', 3_445_214_658, 2, 20, 22, 100]),
  Object.freeze([1, 1, 0, 1]),
])

beforeAll(async () => {
  const signingPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  signingPrivateJwk = await crypto.subtle.exportKey('jwk', signingPair.privateKey)

  const qaPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  )
  qaPrivateKey = qaPair.privateKey
  const exported = await crypto.subtle.exportKey('jwk', qaPair.publicKey)
  qaPublicJwk = {
    kty: 'EC',
    crv: 'P-256',
    x: String(exported.x),
    y: String(exported.y),
  }
})

function environment(overrides: Partial<WorkerEnv> = {}): WorkerEnv {
  return {
    ISSUER,
    ALLOWED_ORIGINS: ORIGIN,
    FARCASTER_DOMAIN: 'warpkeep.example',
    FARCASTER_SIWE_URI: `${ORIGIN}/`,
    FARCASTER_RPC_URL: 'https://optimism-rpc.internal.example',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    OIDC_KEY_ID: 'test-key',
    SIGNING_KEY_JWK: JSON.stringify(signingPrivateJwk),
    ADMIN_TOKEN_SECRET: ADMIN_SECRET,
    SESSION_COOKIE_KEY,
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE,
    QA_OBSERVER_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    QA_OBSERVER_SPACETIMEDB_DATABASE: QA_DATABASE_IDENTITY,
    QA_OBSERVER_OIDC_AUDIENCE: 'warpkeep-qa-observer-spacetimedb',
    PUBLIC_AUTH_ENABLED: 'false',
    QA_OBSERVER_ENABLED: 'true',
    QA_OBSERVER_PUBLIC_JWK: JSON.stringify(qaPublicJwk),
    QA_OBSERVER_KEY_REGISTERED_AT: new Date(NOW).toISOString(),
    QA_OBSERVER_KEY_EXPIRES_AT: new Date(NOW + 24 * 60 * 60 * 1_000).toISOString(),
    ENVIRONMENT: 'production',
    ...overrides,
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

async function sign(signingInput: string, key = qaPrivateKey): Promise<string> {
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    new TextEncoder().encode(signingInput),
  )
  return base64Url(new Uint8Array(signature))
}

function makeNonCanonicalBase64Url(value: string, unusedBitMask = 15): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
  const finalIndex = alphabet.indexOf(value.at(-1) ?? '')
  if (finalIndex < 0 || (finalIndex & unusedBitMask) !== 0) {
    throw new Error('Expected a canonical base64url tail.')
  }
  return `${value.slice(0, -1)}${alphabet[finalIndex + 1]}`
}

function harness(options: {
  resolver?: { resolve(deviceThumbprint: string): Promise<QaObserverRealmSnapshot> }
  useDefaultResolver?: boolean
} = {}) {
  let now = NOW
  const events: SafeLogEvent[] = []
  const resolve = options.resolver?.resolve ?? vi.fn(async () => SNAPSHOT)
  const rateCheck = vi.fn(async (_request: Request, _action: RateLimitAction) => ({ allowed: true as const }))
  const app = createAuthBridge({
    qaChallengeStore: new MemoryQaObserverChallengeStore(),
    ...(options.useDefaultResolver ? {} : { qaSnapshotResolver: { resolve } }),
    rateLimiter: { check: rateCheck },
    logger: { event: event => events.push(event) },
    now: () => now,
  })
  return {
    app,
    events,
    resolve,
    rateCheck,
    setNow(value: number) { now = value },
  }
}

function post(path: string, body?: unknown, headers: HeadersInit = {}): Request {
  const requestHeaders = new Headers(headers)
  if (body !== undefined) requestHeaders.set('content-type', 'application/json')
  return new Request(`${ISSUER}${path}`, {
    method: 'POST',
    headers: requestHeaders,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

function expectNoCors(response: Response): void {
  expect([...response.headers.keys()].filter(name => name.startsWith('access-control-'))).toEqual([])
  expect(response.headers.has('vary')).toBe(false)
}

async function challenge(h: ReturnType<typeof harness>, env = environment()) {
  const response = await h.app.fetch(post('/v1/qa/challenge'), env)
  expect(response.status).toBe(201)
  return response.json() as Promise<Record<string, unknown>>
}

describe('machine-bound QA observer bridge', () => {
  it('keeps the QA gate independent, returns the exact helper contract, and binds canonical ASCII', async () => {
    const h = harness()
    const response = await h.app.fetch(post('/v1/qa/challenge'), environment({ PUBLIC_AUTH_ENABLED: 'false' }))
    expect(response.status).toBe(201)
    expectNoCors(response)
    expect(response.headers.get('cache-control')).toBe('no-store')
    const body = await response.json() as Record<string, unknown>
    expect(Object.keys(body)).toEqual([
      'version', 'requestId', 'challenge', 'expiresAt', 'keyThumbprint', 'scope', 'signingInput',
    ])
    expect(body).toMatchObject({ version: 1, scope: 'realm.snapshot', expiresAt: NOW + 60_000 })
    const expectedThumbprint = await qaObserverKeyThumbprint(qaPublicJwk)
    expect(body.keyThumbprint).toBe(expectedThumbprint)
    expect(body.signingInput).toBe(canonicalQaObserverSigningInput({
      issuer: ISSUER,
      requestId: String(body.requestId),
      challenge: String(body.challenge),
      keyThumbprint: expectedThumbprint,
      expiresAt: Number(body.expiresAt),
    }))
    expect(String(body.signingInput).endsWith('\n')).toBe(false)
    expect(h.rateCheck).toHaveBeenCalledWith(expect.any(Request), 'qa-challenge')
    expect(h.events).toEqual(['qa_challenge_issued'])
  })

  it('includes the independent gate, registered-key fingerprint, registration, and expiry only in admin attestation', async () => {
    const h = harness()
    const response = await h.app.fetch(post('/v1/admin/config-attestation', undefined, {
      authorization: `Bearer ${ADMIN_SECRET}`,
    }), environment())
    expect(response.status).toBe(200)
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    await expect(response.json()).resolves.toMatchObject({
      profile: 'warpkeep-auth-v2',
      publicAuthEnabled: false,
      qaObserverEnabled: true,
      qaObserverSpacetimeDbUri: 'https://maincloud.spacetimedb.com',
      qaObserverSpacetimeDbDatabase: QA_DATABASE_IDENTITY,
      qaObserverAudience: 'warpkeep-qa-observer-spacetimedb',
      qaObserverKeyFingerprint: await qaObserverKeyThumbprint(qaPublicJwk),
      qaObserverKeyRegisteredAt: new Date(NOW).toISOString(),
      qaObserverKeyExpiresAt: new Date(NOW + 24 * 60 * 60 * 1_000).toISOString(),
      qaObserverMaxRegistrationLifetimeMilliseconds: QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS,
    })
  })

  it('requires a complete dedicated observer target, pins production origin, and rejects gameplay reuse', async () => {
    const h = harness()
    const invalidOverrides: readonly Partial<WorkerEnv>[] = [
      {
        QA_OBSERVER_SPACETIMEDB_URI: undefined,
        QA_OBSERVER_SPACETIMEDB_DATABASE: undefined,
        QA_OBSERVER_OIDC_AUDIENCE: undefined,
      },
      { QA_OBSERVER_SPACETIMEDB_DATABASE: undefined },
      { QA_OBSERVER_OIDC_AUDIENCE: undefined },
      { QA_OBSERVER_SPACETIMEDB_URI: undefined },
      { QA_OBSERVER_SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE },
      { QA_OBSERVER_SPACETIMEDB_DATABASE: 'warpkeep-89e4u' },
      { QA_OBSERVER_SPACETIMEDB_DATABASE: 'warpkeep-qa-observer-test' },
      { QA_OBSERVER_OIDC_AUDIENCE: 'warpkeep-spacetimedb' },
      { QA_OBSERVER_SPACETIMEDB_URI: 'http://maincloud.spacetimedb.com' },
      { QA_OBSERVER_SPACETIMEDB_URI: 'https://attacker.example' },
      { QA_OBSERVER_SPACETIMEDB_DATABASE: 'warpkeep/qa-observer' },
      { QA_OBSERVER_OIDC_AUDIENCE: 'observer audience with spaces' },
    ]

    for (const overrides of invalidOverrides) {
      const response = await h.app.fetch(post('/v1/qa/challenge'), environment(overrides))
      expect(response.status).toBe(503)
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'service_misconfigured' },
      })
    }

    const partialWhilePaused = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_ENABLED: 'false',
      QA_OBSERVER_SPACETIMEDB_DATABASE: undefined,
    }))
    expect(partialWhilePaused.status).toBe(503)
    await expect(partialWhilePaused.json()).resolves.toMatchObject({
      error: { code: 'service_misconfigured' },
    })
  })

  it('uses only the dedicated observer target and audience in the default resolver', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify(RAW_SPACETIME_SNAPSHOT),
      { headers: { 'content-type': 'application/json' } },
    ))
    try {
      const h = harness({ useDefaultResolver: true })
      const issued = await challenge(h)
      const response = await h.app.fetch(post('/v1/qa/realm-snapshot', {
        requestId: issued.requestId,
        signature: await sign(String(issued.signingInput)),
      }), environment())

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual(SNAPSHOT)
      expect(upstream).toHaveBeenCalledOnce()
      const [input, init] = upstream.mock.calls[0] as unknown as [URL, RequestInit]
      expect(input.toString()).toBe(
        `https://maincloud.spacetimedb.com/v1/database/${QA_DATABASE_IDENTITY}/call/qa_observer_get_realm_attestation_v2`,
      )
      expect(input.toString()).not.toContain(`/database/${PRODUCTION_SPACETIMEDB_DATABASE}/`)
      const authorization = new Headers(init.headers).get('authorization')
      expect(authorization).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/)
      const payloadSegment = authorization!.slice('Bearer '.length).split('.')[1]
      const payload = JSON.parse(atob(payloadSegment.replace(/-/g, '+').replace(/_/g, '/'))) as Record<string, unknown>
      expect(payload.aud).toEqual(['warpkeep-qa-observer-spacetimedb'])
      expect(payload.aud).not.toEqual(['warpkeep-spacetimedb'])
    } finally {
      upstream.mockRestore()
    }
  })

  it('keeps the exact generation-v2 attestation usable during the v3 rollout', async () => {
    const upstream = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify(RAW_SPACETIME_SNAPSHOT_V2),
      { headers: { 'content-type': 'application/json' } },
    ))
    try {
      const h = harness({ useDefaultResolver: true })
      const issued = await challenge(h)
      const response = await h.app.fetch(post('/v1/qa/realm-snapshot', {
        requestId: issued.requestId,
        signature: await sign(String(issued.signingInput)),
      }), environment())

      expect(response.status).toBe(200)
      await expect(response.json()).resolves.toEqual(SNAPSHOT_V2)
      expect(upstream).toHaveBeenCalledOnce()
    } finally {
      upstream.mockRestore()
    }
  })

  it('verifies one raw P-256 proof, returns only the strict sanitized snapshot, and rejects replay', async () => {
    const h = harness()
    const issued = await challenge(h)
    const signature = await sign(String(issued.signingInput))
    expect(signature).toHaveLength(86)
    const first = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: issued.requestId,
      signature,
    }), environment())
    expect(first.status).toBe(200)
    expectNoCors(first)
    expect(await first.json()).toEqual(SNAPSHOT)
    expect(h.resolve).toHaveBeenCalledExactlyOnceWith(issued.keyThumbprint)
    expect(h.rateCheck.mock.calls.at(-1)?.[1]).toBe('qa-snapshot')

    const replay = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: issued.requestId,
      signature,
    }), environment())
    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ error: { code: 'qa_challenge_invalid' } })
    expect(h.resolve).toHaveBeenCalledTimes(1)
    const serialized = JSON.stringify(SNAPSHOT)
    for (const forbidden of [
      'fid', 'identity', 'token', 'authEpoch', 'pfpUrl', 'marks', 'castleId',
      'tileKey', 'username', 'displayName', 'publicBio', 'portraitAvailable',
    ]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden.toLowerCase())
    }
    expect(h.events).toContain('qa_snapshot_succeeded')
    expect(h.events).toContain('qa_challenge_rejected')
  })

  it('consumes a challenge on wrong-key or wrong-signature proof before any snapshot work', async () => {
    for (const mode of ['invalid-scalar', 'wrong-key', 'noncanonical-base64url'] as const) {
      const h = harness()
      const issued = await challenge(h)
      const signature = mode === 'invalid-scalar'
        ? 'A'.repeat(86)
        : mode === 'wrong-key' ? await (async () => {
            const other = await crypto.subtle.generateKey(
              { name: 'ECDSA', namedCurve: 'P-256' },
              false,
              ['sign', 'verify'],
            )
            return sign(String(issued.signingInput), other.privateKey)
          })() : makeNonCanonicalBase64Url(await sign(String(issued.signingInput)))
      const rejected = await h.app.fetch(post('/v1/qa/realm-snapshot', {
        requestId: issued.requestId,
        signature,
      }), environment())
      expect(rejected.status).toBe(401)
      expect(await rejected.json()).toMatchObject({ error: { code: 'qa_proof_invalid' } })
      const retry = await h.app.fetch(post('/v1/qa/realm-snapshot', {
        requestId: issued.requestId,
        signature: await sign(String(issued.signingInput)),
      }), environment())
      expect(retry.status).toBe(401)
      expect(h.resolve).not.toHaveBeenCalled()
      expect(h.events).toContain('qa_signature_rejected')
    }
  })

  it('fails closed for expiry, disabled/malformed registration, origins, query, body, and shape drift', async () => {
    const h = harness()
    const disabled = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_ENABLED: 'false',
      QA_OBSERVER_PUBLIC_JWK: undefined,
      QA_OBSERVER_KEY_REGISTERED_AT: undefined,
      QA_OBSERVER_KEY_EXPIRES_AT: undefined,
    }))
    expect(disabled.status).toBe(503)
    expect(await disabled.json()).toMatchObject({ error: { code: 'qa_observer_paused' } })

    const malformed = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_PUBLIC_JWK: JSON.stringify({ ...qaPublicJwk, d: 'private' }),
    }))
    expect(malformed.status).toBe(503)
    expect(await malformed.json()).toMatchObject({ error: { code: 'service_misconfigured' } })

    for (const keyExpiresAt of [NOW - 1, NOW, NOW + 59_999, NOW + 60_000]) {
      const expiry = await h.app.fetch(post('/v1/qa/challenge'), environment({
        QA_OBSERVER_KEY_EXPIRES_AT: new Date(keyExpiresAt).toISOString(),
      }))
      expect(expiry.status).toBe(403)
      expectNoCors(expiry)
      expect(await expiry.json()).toMatchObject({ error: { code: 'qa_device_expired' } })
    }

    const minimum = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(NOW + 60_001).toISOString(),
    }))
    expect(minimum.status).toBe(201)
    expectNoCors(minimum)

    const maximum = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(
        NOW + QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS,
      ).toISOString(),
    }))
    expect(maximum.status).toBe(201)
    expectNoCors(maximum)

    const overMaximum = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(
        NOW + QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS + 1,
      ).toISOString(),
    }))
    expect(overMaximum.status).toBe(403)
    expectNoCors(overMaximum)
    expect(await overMaximum.json()).toMatchObject({ error: { code: 'qa_device_expired' } })

    h.setNow(NOW + 1)
    const overMaximumAfterTimePasses = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(
        NOW + QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS + 1,
      ).toISOString(),
    }))
    expect(overMaximumAfterTimePasses.status).toBe(403)
    expectNoCors(overMaximumAfterTimePasses)
    expect(await overMaximumAfterTimePasses.json()).toMatchObject({
      error: { code: 'qa_device_expired' },
    })
    h.setNow(NOW)

    const futureRegistration = await h.app.fetch(post('/v1/qa/challenge'), environment({
      QA_OBSERVER_KEY_REGISTERED_AT: new Date(NOW + 1).toISOString(),
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(NOW + 24 * 60 * 60 * 1_000).toISOString(),
    }))
    expect(futureRegistration.status).toBe(403)
    expectNoCors(futureRegistration)
    expect(await futureRegistration.json()).toMatchObject({ error: { code: 'qa_device_expired' } })

    const exchangeChallenge = await challenge(h)
    const overMaximumExchange = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: exchangeChallenge.requestId,
      signature: await sign(String(exchangeChallenge.signingInput)),
    }), environment({
      QA_OBSERVER_KEY_EXPIRES_AT: new Date(
        NOW + QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS + 1,
      ).toISOString(),
    }))
    expect(overMaximumExchange.status).toBe(403)
    expectNoCors(overMaximumExchange)
    expect(await overMaximumExchange.json()).toMatchObject({ error: { code: 'qa_device_expired' } })
    expect(h.resolve).not.toHaveBeenCalled()

    for (const overrides of [
      { QA_OBSERVER_PUBLIC_JWK: undefined },
      { QA_OBSERVER_KEY_REGISTERED_AT: undefined },
      { QA_OBSERVER_KEY_EXPIRES_AT: undefined },
      { QA_OBSERVER_KEY_EXPIRES_AT: '2026-10-15T00:00:00Z' },
      {
        QA_OBSERVER_PUBLIC_JWK: JSON.stringify({
          ...qaPublicJwk,
          x: makeNonCanonicalBase64Url(qaPublicJwk.x, 3),
        }),
      },
      {
        QA_OBSERVER_PUBLIC_JWK: JSON.stringify({
          kty: 'EC',
          crv: 'P-256',
          x: 'A'.repeat(43),
          y: 'A'.repeat(43),
        }),
      },
    ]) {
      const invalidRegistration = await h.app.fetch(
        post('/v1/qa/challenge'),
        environment(overrides),
      )
      expect(invalidRegistration.status).toBe(503)
      expectNoCors(invalidRegistration)
      expect(await invalidRegistration.json()).toMatchObject({ error: { code: 'service_misconfigured' } })
    }

    const origin = await h.app.fetch(post('/v1/qa/challenge', undefined, { origin: ORIGIN }), environment())
    expect(origin.status).toBe(403)
    expectNoCors(origin)
    const query = await h.app.fetch(post('/v1/qa/challenge?unexpected=1'), environment())
    expect(query.status).toBe(400)
    const body = await h.app.fetch(post('/v1/qa/challenge', {}), environment())
    expect(body.status).toBe(400)

    const issued = await challenge(h)
    h.setNow(Number(issued.expiresAt))
    const expired = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: issued.requestId,
      signature: await sign(String(issued.signingInput)),
    }), environment())
    expect(expired.status).toBe(401)
    expect(h.resolve).not.toHaveBeenCalled()

    const extra = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: issued.requestId,
      signature: 'A'.repeat(86),
      fid: 1,
    }), environment())
    expect(extra.status).toBe(400)
  })

  it('treats the complete absence of Origin as the server-only boundary and never emits CORS', async () => {
    const h = harness()
    for (const path of ['/v1/qa/challenge', '/v1/qa/realm-snapshot']) {
      for (const origin of ['', 'null', ORIGIN, 'https://hostile.example']) {
        const response = await h.app.fetch(post(
          path,
          path.endsWith('realm-snapshot') ? { requestId: 'A'.repeat(24), signature: 'A'.repeat(86) } : undefined,
          { origin },
        ), environment())
        expect(response.status).toBe(403)
        expectNoCors(response)
        expect(await response.json()).toMatchObject({ error: { code: 'qa_browser_forbidden' } })
      }
    }
    expect(h.rateCheck).not.toHaveBeenCalled()
    expect(h.resolve).not.toHaveBeenCalled()
  })

  it('maps closed upstream failure stages without returning a token or raw upstream detail', async () => {
    const h = harness({
      resolver: { resolve: async () => { throw new QaSnapshotResolverFailure('timeout') } },
    })
    const issued = await challenge(h)
    const response = await h.app.fetch(post('/v1/qa/realm-snapshot', {
      requestId: issued.requestId,
      signature: await sign(String(issued.signingInput)),
    }), environment())
    expect(response.status).toBe(503)
    const text = await response.text()
    expect(text).toContain('qa_snapshot_unavailable')
    expect(text).not.toContain('Bearer')
    expect(text).not.toContain('timeout')
    expect(h.events).toContain('qa_snapshot_failed_timeout')
  })
})
