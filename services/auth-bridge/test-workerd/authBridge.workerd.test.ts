import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { createSiweMessage } from 'viem/siwe'
import { describe, expect, it, vi } from 'vitest'
import { createAuthBridge } from '../src/app'
import {
  DurableObjectQaObserverChallengeStore,
  createQaObserverChallenge,
} from '../src/qaObserver'
import type { BridgeConfig } from '../src/config'
import type { AdmissionResolution, DurableObjectNamespace, WorkerEnv } from '../src/types'

const ORIGIN = 'https://warpkeep.test'
const DOMAIN = 'warpkeep.test'
const SIWE_URI = 'https://warpkeep.test/'
const FID = '12345'
const BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const WRONG_BINDING_VERIFIER = 'A'.repeat(43)
const INTERNAL_ORIGIN = 'https://challenge-replay-guard.internal'

const CONFIG: BridgeConfig = {
  issuer: 'https://auth.warpkeep.test',
  issuerUrl: new URL('https://auth.warpkeep.test'),
  allowedOrigins: new Set([ORIGIN]),
  domain: DOMAIN,
  siweUri: SIWE_URI,
  farcasterRpcUrls: Object.freeze([
    'https://optimism-rpc-one.example.com/',
    'https://optimism-rpc-two.example.net/',
  ]),
  audience: 'warpkeep-spacetimedb',
  keyId: 'workerd-test-key',
  privateJwk: {
    kty: 'EC',
    crv: 'P-256',
    x: 'A'.repeat(43),
    y: 'B'.repeat(43),
    d: 'C'.repeat(43),
  },
  adminTokenSecret: 'workerd-test-admin-secret-at-least-32-bytes',
  sessionCookieKey: 'workerd-test-session-key-separate-at-least-32-bytes',
  spacetimeDbUri: 'https://maincloud.spacetimedb.com',
  spacetimeDbDatabase: 'warpkeep-test',
  publicAuthEnabled: true,
  qaObserverEnabled: false,
  environment: 'production',
}

interface IssuedChallenge {
  nonce: string
  requestId: string
  createdAt: number
  expiresAt: number
  domain: string
  siweUri: string
  expirationTime: string
}

function post(path: string, body: unknown, headers: HeadersInit = {}): Request {
  return new Request(`https://auth.warpkeep.test${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: ORIGIN,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function proofFor(challenge: IssuedChallenge, bindingVerifier = BINDING_VERIFIER) {
  return {
    message: createSiweMessage({
      domain: DOMAIN,
      address: '0x0000000000000000000000000000000000000001',
      chainId: 10,
      uri: SIWE_URI,
      version: '1',
      nonce: challenge.nonce,
      issuedAt: new Date(challenge.createdAt),
      expirationTime: new Date(challenge.expirationTime),
      requestId: challenge.requestId,
    }),
    signature: `0x${'a'.repeat(130)}`,
    nonce: challenge.nonce,
    fid: FID,
    requestId: challenge.requestId,
    domain: DOMAIN,
    siweUri: SIWE_URI,
    expirationTime: challenge.expirationTime,
    expiresAt: challenge.expiresAt,
    bindingVerifier,
    rememberDevice: true,
    identity: { fid: FID },
  }
}

function harness() {
  const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
  const resolver = {
    resolve: vi.fn(async (): Promise<AdmissionResolution> => ({ state: 'enabled', authEpoch: 7 })),
  }
  const signer = vi.fn(async (_config: BridgeConfig, _claims: unknown) => 'workerd.test.token')
  const app = createAuthBridge({
    configReader: () => CONFIG,
    verifier,
    authEpochResolver: resolver,
    rateLimiter: { check: async () => ({ allowed: true }) },
    signer,
    logger: { event: vi.fn() },
  })
  return { app, verifier, resolver, signer }
}

describe('auth bridge production bindings in workerd', () => {
  it('isolates QA challenges in their dedicated Durable Object and atomically consumes once', async () => {
    const store = new DurableObjectQaObserverChallengeStore(
      env.QA_CHALLENGE_REPLAY_GUARD as unknown as DurableObjectNamespace,
    )
    const createdAt = Date.now()
    const challenge = createQaObserverChallenge(
      CONFIG.issuer,
      'A'.repeat(43),
      createdAt,
      createdAt + 60_000,
    )
    await store.put(challenge)
    await expect(store.get(challenge.requestId)).resolves.toEqual(challenge)
    const consumed = await Promise.all([
      store.consume(challenge.requestId),
      store.consume(challenge.requestId),
    ])
    expect(consumed.filter(Boolean)).toHaveLength(1)
    expect(consumed.find(Boolean)).toEqual(challenge)
    await expect(store.get(challenge.requestId)).resolves.toBeNull()
  })

  it('keeps an S256 mismatch retryable, consumes the correct retry, and rejects its replay', async () => {
    const h = harness()
    const bridgeEnv = env as unknown as WorkerEnv
    const issuedResponse = await h.app.fetch(post('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }), bridgeEnv)
    expect(issuedResponse.status).toBe(201)
    const challenge = await issuedResponse.json() as IssuedChallenge

    const wrong = await h.app.fetch(
      post('/v2/farcaster/exchange', proofFor(challenge, WRONG_BINDING_VERIFIER)),
      bridgeEnv,
    )
    expect(wrong.status).toBe(401)
    expect(await wrong.json()).toMatchObject({ error: { code: 'browser_binding_invalid' } })
    expect(h.verifier.verify).not.toHaveBeenCalled()
    expect(h.resolver.resolve).not.toHaveBeenCalled()
    expect(h.signer).not.toHaveBeenCalled()

    const id = env.CHALLENGE_REPLAY_GUARD.idFromName(`warpkeep-challenge:${challenge.requestId}`)
    const stub = env.CHALLENGE_REPLAY_GUARD.get(id)
    const retained = await stub.fetch(`${INTERNAL_ORIGIN}/record`)
    expect(retained.status).toBe(200)
    expect(await retained.json()).toMatchObject({
      version: 2,
      requestId: challenge.requestId,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    })

    const correct = await h.app.fetch(
      post('/v2/farcaster/exchange', proofFor(challenge)),
      bridgeEnv,
    )
    expect(correct.status).toBe(200)
    expect(await correct.json()).toMatchObject({
      identity: { fid: Number(FID) },
      accessToken: 'workerd.test.token',
      tokenType: 'spacetime-access',
    })
    expect(h.verifier.verify).toHaveBeenCalledTimes(1)
    expect(h.resolver.resolve).toHaveBeenCalledTimes(1)
    expect(h.signer).toHaveBeenCalledTimes(1)
    const signedClaims = h.signer.mock.calls[0]?.[1] as Record<string, unknown>
    expect(signedClaims).not.toHaveProperty('username')
    expect(signedClaims).not.toHaveProperty('display_name')
    expect(signedClaims).not.toHaveProperty('pfp_url')
    expect((await stub.fetch(`${INTERNAL_ORIGIN}/record`)).status).toBe(404)

    const replay = await h.app.fetch(
      post('/v2/farcaster/exchange', proofFor(challenge)),
      bridgeEnv,
    )
    expect(replay.status).toBe(401)
    expect(await replay.json()).toMatchObject({ error: { code: 'challenge_not_found' } })
    expect(h.verifier.verify).toHaveBeenCalledTimes(1)
    expect(h.resolver.resolve).toHaveBeenCalledTimes(1)
    expect(h.signer).toHaveBeenCalledTimes(1)
  })

  it('rejects new legacy v1 writes and purges a persisted legacy v1 record', async () => {
    const requestId = 'legacy-v1-workerd-regression'
    const id = env.CHALLENGE_REPLAY_GUARD.idFromName(`warpkeep-challenge:${requestId}`)
    const stub = env.CHALLENGE_REPLAY_GUARD.get(id)
    const createdAt = Date.now()
    const legacyRecord = {
      version: 1,
      requestId,
      nonce: 'legacy-v1-nonce',
      origin: ORIGIN,
      domain: DOMAIN,
      siweUri: SIWE_URI,
      createdAt,
      expiresAt: createdAt + 5 * 60 * 1_000,
    }

    const rejectedWrite = await stub.fetch(`${INTERNAL_ORIGIN}/record`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(legacyRecord),
    })
    expect(rejectedWrite.status).toBe(400)

    await runInDurableObject(stub, async (_instance, state) => {
      await state.storage.put('challenge', legacyRecord)
    })
    const seeded = await runInDurableObject(stub, async (_instance, state) => (
      (await state.storage.get('challenge')) !== undefined
    ))
    expect(seeded).toBe(true)

    const rejectedRead = await stub.fetch(`${INTERNAL_ORIGIN}/record`)
    expect(rejectedRead.status).toBe(404)
    const remains = await runInDurableObject(stub, async (_instance, state) => (
      (await state.storage.get('challenge')) !== undefined
    ))
    expect(remains).toBe(false)
  })

  it('rotates the real session-family object, recovers one old-cookie retry, and revokes an epoch mismatch', async () => {
    const h = harness()
    const bridgeEnv = env as unknown as WorkerEnv
    const issued = await h.app.fetch(post('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }), bridgeEnv)
    const challenge = await issued.json() as IssuedChallenge
    const exchange = await h.app.fetch(post('/v2/farcaster/exchange', proofFor(challenge)), bridgeEnv)
    expect(exchange.status).toBe(200)
    const originalCookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    expect(originalCookie).toMatch(/^__Host-warpkeep_session=v1\.[A-Za-z0-9_-]{32}\.1\.[A-Za-z0-9_-]{43}$/)
    const cookieValue = originalCookie!.slice('__Host-warpkeep_session='.length)
    const familyId = cookieValue.split('.')[1]
    const familyStub = env.SESSION_FAMILIES.get(
      env.SESSION_FAMILIES.idFromName(`warpkeep-session:v1:${familyId}`),
    )
    const stored = await runInDurableObject(familyStub, async (_instance, state) => (
      state.storage.get('session-family')
    ))
    expect(stored).toMatchObject({
      version: 1,
      identity: { fid: FID },
      state: 'bound',
      authEpoch: 7,
      currentGeneration: 1,
    })
    expect(Object.keys((stored as { identity: object }).identity)).toEqual(['fid'])
    expect(JSON.stringify(stored)).not.toContain(cookieValue)
    expect(JSON.stringify(stored)).not.toContain('workerd.test.token')

    const firstRefresh = await h.app.fetch(post('/v2/session/refresh', {}, { cookie: originalCookie! }), bridgeEnv)
    expect(firstRefresh.status).toBe(200)
    const rotatedCookie = firstRefresh.headers.get('set-cookie')?.split(';', 1)[0]
    expect(rotatedCookie).toMatch(/^__Host-warpkeep_session=v1\.[A-Za-z0-9_-]{32}\.2\.[A-Za-z0-9_-]{43}$/)

    const recovered = await h.app.fetch(post('/v2/session/refresh', {}, { cookie: originalCookie! }), bridgeEnv)
    expect(recovered.status).toBe(200)
    expect(recovered.headers.get('set-cookie')?.split(';', 1)[0]).toBe(rotatedCookie)

    h.resolver.resolve.mockResolvedValue({ state: 'enabled', authEpoch: 8 })
    const mismatch = await h.app.fetch(post('/v2/session/refresh', {}, { cookie: rotatedCookie! }), bridgeEnv)
    expect(mismatch.status).toBe(401)
    expect(mismatch.headers.get('set-cookie')).toContain('Max-Age=0')
    const remains = await runInDurableObject(familyStub, async (_instance, state) => (
      (await state.storage.get('session-family')) !== undefined
    ))
    expect(remains).toBe(false)
  })
})
