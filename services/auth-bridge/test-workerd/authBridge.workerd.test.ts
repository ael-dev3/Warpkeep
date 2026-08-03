import { env } from 'cloudflare:workers'
import { runInDurableObject } from 'cloudflare:test'
import { encodeAbiParameters } from 'viem'
import { privateKeyToAccount } from 'viem/accounts'
import { createSiweMessage } from 'viem/siwe'
import { describe, expect, it, vi } from 'vitest'
import { AdmissionNotification } from '../src/admissionNotifications'
import { createAuthBridge } from '../src/app'
import {
  DurableObjectQaObserverChallengeStore,
  createQaObserverChallenge,
} from '../src/qaObserver'
import type { BridgeConfig } from '../src/config'
import { createMiniAppWebhookVerifier } from '../src/miniAppWebhook'
import type {
  AccessRequestResolver,
  AdmissionResolution,
  DurableObjectState,
  DurableObjectStorage,
  DurableObjectTransaction,
  DurableObjectNamespace,
  SafeLogEvent,
  WorkerEnv,
} from '../src/types'

const ORIGIN = 'https://warpkeep.test'
const DOMAIN = 'warpkeep.test'
const SIWE_URI = 'https://warpkeep.test/'
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
const BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM'
const WRONG_BINDING_VERIFIER = 'A'.repeat(43)
const INTERNAL_ORIGIN = 'https://challenge-replay-guard.internal'
const NOTIFICATION_INTERNAL_ORIGIN = 'https://admission-notification.internal'

class WorkerdMemoryStorage implements DurableObjectStorage {
  readonly values = new Map<string, unknown>()
  alarm: number | Date | undefined

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined
  }

  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value)
  }

  async delete(key: string): Promise<boolean> {
    return this.values.delete(key)
  }

  async deleteAll(): Promise<void> {
    this.values.clear()
    this.alarm = undefined
  }

  async setAlarm(scheduledTime: number | Date): Promise<void> {
    this.alarm = scheduledTime
  }

  async deleteAlarm(): Promise<void> {
    this.alarm = undefined
  }

  async transaction<T>(closure: (txn: DurableObjectTransaction) => Promise<T>): Promise<T> {
    return closure({
      get: key => this.get(key),
      put: (key, value) => this.put(key, value),
      delete: key => this.delete(key),
    })
  }
}

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
  accessExpectedFidRequired: false,
  qaObserverEnabled: false,
  approvalNotificationsEnabled: false,
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

function quickAuthPost(
  token: string | null = QUICK_AUTH_TOKEN,
  body: unknown = {},
  headers: HeadersInit = {},
): Request {
  const requestHeaders = new Headers(headers)
  requestHeaders.set('content-type', 'application/json')
  requestHeaders.set('origin', QUICK_AUTH_ORIGIN)
  if (token !== null && !requestHeaders.has('authorization')) {
    requestHeaders.set('authorization', `Bearer ${token}`)
  }
  return new Request(`https://auth.warpkeep.test${QUICK_AUTH_PATH}`, {
    method: 'POST',
    headers: requestHeaders,
    body: JSON.stringify(body),
  })
}

function accessBearerPost(
  path: typeof ACCESS_STATUS_PATH | typeof ACCESS_REQUEST_PATH,
): Request {
  return new Request(`https://auth.warpkeep.test${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${QUICK_AUTH_TOKEN}`,
      'content-type': 'application/json',
      origin: QUICK_AUTH_ORIGIN,
    },
    body: '{}',
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

function harness(options: {
  admission?: AdmissionResolution
  accessRequestResolver?: AccessRequestResolver
  rateLimiter?: { check(request: Request, action: string): Promise<{ allowed: true } | { allowed: false; retryAfterSeconds: number }> }
} = {}) {
  const verifier = { verify: vi.fn(async () => ({ fid: FID })) }
  const quickAuthVerifier = {
    verifyJwt: vi.fn(async () => {
      const now = Math.floor(Date.now() / 1_000)
      return {
        sub: Number(FID),
        iss: QUICK_AUTH_ISSUER,
        aud: QUICK_AUTH_DOMAIN,
        iat: now - 1,
        exp: now + 300,
      }
    }),
  }
  const resolver = {
    resolve: vi.fn(async (): Promise<AdmissionResolution> => (
      options.admission ?? { state: 'enabled', authEpoch: 7 }
    )),
  }
  const signer = vi.fn(async (_config: BridgeConfig, _claims: unknown) => 'workerd.test.token')
  const accessRequestResolver = options.accessRequestResolver ?? {
    getStatus: vi.fn(async () => ({ status: 'not-requested' } as const)),
    submit: vi.fn(async () => ({
      status: 'requested',
      requestedAtMicros: 1_785_414_896_000_000,
    } as const)),
  }
  const app = createAuthBridge({
    configReader: () => CONFIG,
    verifier,
    quickAuthVerifier,
    authEpochResolver: resolver,
    accessRequestResolver,
    rateLimiter: options.rateLimiter ?? { check: async () => ({ allowed: true }) },
    signer,
    logger: { event: vi.fn() },
  })
  return {
    app,
    verifier,
    quickAuthVerifier,
    resolver,
    accessRequestResolver,
    signer,
  }
}

async function signedMiniAppWebhookFixture() {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify'],
  ) as CryptoKeyPair
  const rawPublicKey = new Uint8Array(await crypto.subtle.exportKey('raw', keyPair.publicKey))
  const appKey = `0x${Buffer.from(rawPublicKey).toString('hex')}` as const
  const header = Buffer.from(JSON.stringify({
    fid: Number(FID),
    type: 'app_key',
    key: appKey,
  })).toString('base64url')
  const deliveryUrl = 'https://api.farcaster.xyz/v1/frame-notifications'
  const token = 'workerd-notification-token-with-enough-entropy'
  const payload = Buffer.from(JSON.stringify({
    event: 'notifications_enabled',
    notificationDetails: { token, url: deliveryUrl },
  })).toString('base64url')
  const signedInput = new TextEncoder().encode(`${header}.${payload}`)
  const signature = Buffer.from(await crypto.subtle.sign(
    { name: 'Ed25519' },
    keyPair.privateKey,
    signedInput,
  )).toString('base64url')
  const webhookConfig: BridgeConfig = {
    ...CONFIG,
    approvalNotificationsEnabled: true,
    miniAppNotifications: {
      hubUrls: Object.freeze([
        'https://rho.farcaster.xyz:3381/',
        'https://hub.pinata.cloud/',
      ]),
      clients: Object.freeze([{ appFid: 9_152, deliveryUrl }]),
      operatorSecret: 'workerd-notification-secret-at-least-32-bytes',
    },
  }
  const requestAccount = privateKeyToAccount(`0x${'22'.repeat(32)}`)
  const deadline = 9_999_999_999n
  const requestSignature = await requestAccount.signTypedData({
    domain: {
      name: 'Farcaster SignedKeyRequestValidator',
      version: '1',
      chainId: 10,
      verifyingContract: '0x00000000fc700472606ed4fa22623acf62c60553',
    },
    types: {
      SignedKeyRequest: [
        { name: 'requestFid', type: 'uint256' },
        { name: 'key', type: 'bytes' },
        { name: 'deadline', type: 'uint256' },
      ],
    },
    primaryType: 'SignedKeyRequest',
    message: { requestFid: 9_152n, key: appKey, deadline },
  })
  const metadata = encodeAbiParameters([{
    type: 'tuple',
    components: [
      { type: 'uint256' },
      { type: 'address' },
      { type: 'bytes' },
      { type: 'uint256' },
    ],
  }], [[9_152n, requestAccount.address, requestSignature, deadline]])
  const requestInits: (RequestInit | undefined)[] = []
  const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    requestInits.push(init)
    return new Response(JSON.stringify({
      events: [{
        type: 'EVENT_TYPE_SIGNER',
        signerEventBody: {
          eventType: 'SIGNER_EVENT_TYPE_ADD',
          keyType: 1,
          metadataType: 1,
          key: appKey,
          metadata: Buffer.from(metadata.slice(2), 'hex').toString('base64'),
        },
      }],
    }), { headers: { 'content-type': 'application/json' } })
  }) as typeof fetch

  return {
    appKey,
    deliveryUrl,
    fetchImpl,
    header,
    payload,
    requestInits,
    signature,
    token,
    webhookConfig,
  }
}

describe('auth bridge production bindings in workerd', () => {
  it('delivers through Cloudflare-compatible manual redirect handling in workerd', async () => {
    const deliveryUrl = 'https://api.farcaster.xyz/v1/frame-notifications'
    const token = 'workerd-notification-token-with-enough-entropy'
    const notificationConfig: BridgeConfig = {
      ...CONFIG,
      approvalNotificationsEnabled: true,
      miniAppNotifications: {
        hubUrls: Object.freeze([
          'https://rho.farcaster.xyz:3381/',
          'https://hub.pinata.cloud/',
        ]),
        clients: Object.freeze([{ appFid: 9_152, deliveryUrl }]),
        operatorSecret: 'workerd-notification-secret-at-least-32-bytes',
      },
    }
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      if (init?.redirect === 'error') {
        throw new TypeError('workerd rejects redirect:error before subrequest dispatch')
      }
      expect(init?.redirect).toBe('manual')
      return Response.json({
        result: {
          successfulTokens: [token],
          invalidTokens: [],
          rateLimitedTokens: [],
          failedTokens: [],
        },
      })
    })
    const storage = new WorkerdMemoryStorage()
    const notification = new AdmissionNotification(
      { storage } as DurableObjectState,
      {} as WorkerEnv,
      {
        now: () => 1_800_000_000_000,
        fetchImpl,
        configReader: () => notificationConfig,
        admissionResolver: {
          resolve: async () => ({ state: 'enabled', authEpoch: 7 }),
        },
        accessRequestResolver: {
          getStatus: async () => ({ status: 'not-requested' }),
          submit: async () => ({ status: 'not-requested' }),
        },
      },
    )
    const event = await notification.fetch(new Request(
      `${NOTIFICATION_INTERNAL_ORIGIN}/event`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          eventId: 'a'.repeat(64),
          fid: FID,
          appFid: 9_152,
          event: { type: 'enabled', details: { token, url: deliveryUrl } },
        }),
      },
    ))
    expect(event.status).toBe(204)

    const queued = await notification.fetch(new Request(
      `${NOTIFICATION_INTERNAL_ORIGIN}/queue`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fid: FID,
          kind: 'admitted',
          authEpoch: 7,
          queuedAt: 1_800_000_000_000,
        }),
      },
    ))
    await expect(queued.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it('verifies Farcaster Ed25519 JFS envelopes with the production workerd runtime', async () => {
    const fixture = await signedMiniAppWebhookFixture()
    const activeOnChainRpcVerifier = vi.fn(async () => true)
    const verifier = createMiniAppWebhookVerifier(fixture.webhookConfig, {
      fetchImpl: fixture.fetchImpl,
      activeOnChainRpcVerifier,
    })

    await expect(verifier.verify({
      header: fixture.header,
      payload: fixture.payload,
      signature: fixture.signature,
    })).resolves.toMatchObject({
      fid: FID,
      appFid: 9_152,
      event: {
        type: 'enabled',
        details: { token: fixture.token, url: fixture.deliveryUrl },
      },
    })
    expect(fixture.fetchImpl).toHaveBeenCalledTimes(2)
    for (const init of fixture.requestInits) {
      expect(init).toMatchObject({
        method: 'GET',
        cache: 'no-store',
        redirect: 'manual',
      })
      expect(init?.signal).toBeInstanceOf(AbortSignal)
    }
    expect(activeOnChainRpcVerifier).toHaveBeenCalledTimes(2)
  })

  it('falls back after two primary transport failures and persists the signed event', async () => {
    const fixture = await signedMiniAppWebhookFixture()
    const failedProviders: string[] = []
    const rpcSignals: AbortSignal[] = []
    const activeOnChainRpcVerifier = vi.fn(async (
      rpcUrl: string,
      _fid: number,
      _appKey: string,
      _attestation: unknown,
      signal: AbortSignal,
    ) => {
      rpcSignals.push(signal)
      if (rpcUrl === fixture.webhookConfig.farcasterRpcUrls[0]) {
        throw new Error('synthetic primary transport failure')
      }
      return true
    })
    const applyEvent = vi.fn(async () => undefined)
    const events: SafeLogEvent[] = []
    const app = createAuthBridge({
      configReader: () => fixture.webhookConfig,
      miniAppWebhookVerifierFactory: (config, dependencies) => (
        createMiniAppWebhookVerifier(config, {
          ...dependencies,
          fetchImpl: fixture.fetchImpl,
          activeOnChainRpcVerifier,
          rpcFallbackObserver: provider => {
            failedProviders.push(provider)
            dependencies?.rpcFallbackObserver?.(provider)
          },
        })
      ),
      admissionNotificationStore: {
        applyEvent,
        queueAdmission: vi.fn(async () => 'queued' as const),
      },
      rateLimiter: { check: async () => ({ allowed: true }) },
      logger: { event: event => events.push(event) },
    })
    const response = await app.fetch(new Request(
      'https://auth.warpkeep.test/v1/farcaster/miniapp/webhook',
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          header: fixture.header,
          payload: fixture.payload,
          signature: fixture.signature,
        }),
      },
    ), env as unknown as WorkerEnv)

    expect(response.status).toBe(200)
    expect(await response.text()).toBe('')
    expect(response.headers.has('access-control-allow-origin')).toBe(false)
    expect(failedProviders).toEqual(['primary'])
    expect(activeOnChainRpcVerifier.mock.calls.filter(
      ([rpcUrl]) => rpcUrl === fixture.webhookConfig.farcasterRpcUrls[0],
    )).toHaveLength(2)
    expect(activeOnChainRpcVerifier.mock.calls.filter(
      ([rpcUrl]) => rpcUrl === fixture.webhookConfig.farcasterRpcUrls[1],
    )).toHaveLength(1)
    expect(rpcSignals).toHaveLength(3)
    expect(rpcSignals.every(signal => signal.aborted)).toBe(true)
    expect(applyEvent).toHaveBeenCalledOnce()
    expect(applyEvent).toHaveBeenCalledWith(expect.objectContaining({
      fid: FID,
      appFid: 9_152,
      event: expect.objectContaining({ type: 'enabled' }),
    }))
    expect(events).toEqual([
      'miniapp_webhook_rpc_primary_fallback',
      'miniapp_webhook_verified',
      'miniapp_notification_subscribed',
    ])
    const serializedEvents = JSON.stringify(events)
    expect(serializedEvents).not.toContain(FID)
    expect(serializedEvents).not.toContain(fixture.token)
    expect(serializedEvents).not.toContain(fixture.deliveryUrl)
  })

  it('keeps Quick Auth cookie-free while reusing authoritative admission and player claims', async () => {
    const h = harness()
    const bridgeEnv = env as unknown as WorkerEnv
    const authorized = await h.app.fetch(quickAuthPost(
      QUICK_AUTH_TOKEN,
      {},
      { cookie: '__Host-warpkeep_session=must-be-ignored' },
    ), bridgeEnv)

    expect(authorized.status).toBe(200)
    expect(authorized.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
    expect(authorized.headers.has('access-control-allow-credentials')).toBe(false)
    expect(authorized.headers.has('set-cookie')).toBe(false)
    expect(await authorized.json()).toMatchObject({
      version: 2,
      identity: { fid: Number(FID) },
      status: 'authorized',
      accessToken: 'workerd.test.token',
      tokenType: 'spacetime-access',
    })
    expect(h.quickAuthVerifier.verifyJwt).toHaveBeenCalledWith({
      token: QUICK_AUTH_TOKEN,
      domain: QUICK_AUTH_DOMAIN,
    })
    expect(h.resolver.resolve).toHaveBeenCalledWith(FID)
    const signedClaims = h.signer.mock.calls[0]?.[1] as Record<string, unknown>
    expect(signedClaims).toMatchObject({ fid: FID, auth_epoch: 7, token_type: 'spacetime-access' })
    expect(signedClaims).not.toHaveProperty('username')
    expect(signedClaims).not.toHaveProperty('pfp_url')

    h.resolver.resolve.mockResolvedValueOnce({ state: 'missing', authEpoch: 0 })
    const pending = await h.app.fetch(quickAuthPost(), bridgeEnv)
    expect(pending.status).toBe(200)
    expect(await pending.json()).toEqual({
      version: 2,
      identity: { fid: Number(FID) },
      status: 'pending-admission',
    })
    expect(pending.headers.has('set-cookie')).toBe(false)

    h.resolver.resolve.mockResolvedValueOnce({ state: 'disabled', authEpoch: 0 })
    const disabled = await h.app.fetch(quickAuthPost(), bridgeEnv)
    expect(disabled.status).toBe(200)
    expect(await disabled.json()).toEqual({
      version: 2,
      identity: { fid: Number(FID) },
      status: 'pending-admission',
    })
    expect(disabled.headers.has('set-cookie')).toBe(false)
    expect(h.signer).toHaveBeenCalledTimes(1)
  })

  it('enforces Quick Auth CORS and rate limiting before verifier work in workerd', async () => {
    const bridgeEnv = env as unknown as WorkerEnv
    const preflight = await harness().app.fetch(new Request(
      `https://auth.warpkeep.test${QUICK_AUTH_PATH}`,
      {
        method: 'OPTIONS',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      },
    ), bridgeEnv)
    expect(preflight.status).toBe(204)
    expect(preflight.headers.get('access-control-allow-origin')).toBe(QUICK_AUTH_ORIGIN)
    expect(preflight.headers.get('access-control-allow-headers')).toBe('authorization, content-type')
    expect(preflight.headers.has('access-control-allow-credentials')).toBe(false)

    const check = vi.fn(async (_request: Request, _action: string) => ({
      allowed: false as const,
      retryAfterSeconds: 19,
    }))
    const limitedHarness = harness({ rateLimiter: { check } })
    const limited = await limitedHarness.app.fetch(quickAuthPost(), bridgeEnv)
    expect(limited.status).toBe(429)
    expect(check.mock.calls[0]?.[1]).toBe('exchange')
    expect(limitedHarness.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
    expect(limited.headers.has('set-cookie')).toBe(false)

    const malformedHarness = harness()
    const malformed = await malformedHarness.app.fetch(quickAuthPost(
      null,
      {},
      { authorization: 'Bearer not-a-jwt' },
    ), bridgeEnv)
    expect(malformed.status).toBe(401)
    expect(await malformed.json()).toMatchObject({ error: { code: 'quick_auth_invalid' } })
    expect(malformedHarness.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
  })

  it('supports neutral access requests through Quick Auth and a non-rotating pending family in workerd', async () => {
    const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
    const submit = vi.fn(async () => ({
      status: 'requested',
      requestedAtMicros: 1_785_414_896_000_000,
    } as const))
    const h = harness({
      admission: { state: 'missing', authEpoch: 0 },
      accessRequestResolver: { getStatus, submit },
    })
    const bridgeEnv = env as unknown as WorkerEnv

    const bearerStatus = await h.app.fetch(
      accessBearerPost(ACCESS_STATUS_PATH),
      bridgeEnv,
    )
    expect(bearerStatus.status).toBe(200)
    expect(await bearerStatus.json()).toEqual({
      version: 1,
      status: 'not-requested',
    })
    expect(bearerStatus.headers.get('access-control-allow-origin'))
      .toBe(QUICK_AUTH_ORIGIN)
    expect(bearerStatus.headers.has('access-control-allow-credentials')).toBe(false)
    expect(bearerStatus.headers.has('set-cookie')).toBe(false)

    const bearerSubmit = await h.app.fetch(
      accessBearerPost(ACCESS_REQUEST_PATH),
      bridgeEnv,
    )
    expect(bearerSubmit.status).toBe(200)
    expect(await bearerSubmit.json()).toEqual({
      version: 1,
      status: 'requested',
      requestedAt: 1_785_414_896_000,
    })
    expect(getStatus).toHaveBeenCalledOnce()
    expect(getStatus).toHaveBeenCalledWith(FID)
    expect(submit).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledWith(FID)

    const issued = await h.app.fetch(post('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }), bridgeEnv)
    expect(issued.status).toBe(201)
    const challenge = await issued.json() as IssuedChallenge
    const exchange = await h.app.fetch(
      post('/v2/farcaster/exchange', proofFor(challenge)),
      bridgeEnv,
    )
    expect(exchange.status).toBe(200)
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toMatch(/^__Host-warpkeep_session=v1\./)
    const familyId = cookie!.split('=', 2)[1].split('.')[1]
    const familyStub = env.SESSION_FAMILIES.get(
      env.SESSION_FAMILIES.idFromName(`warpkeep-session:v1:${familyId}`),
    )
    const before = await runInDurableObject(familyStub, async (_instance, state) => (
      state.storage.get('session-family')
    ))

    const sessionStatus = await h.app.fetch(
      post(ACCESS_STATUS_PATH, {}, { cookie: cookie! }),
      bridgeEnv,
    )
    expect(sessionStatus.status).toBe(200)
    expect(await sessionStatus.json()).toEqual({
      version: 1,
      status: 'not-requested',
    })
    expect(sessionStatus.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(sessionStatus.headers.get('access-control-allow-credentials')).toBe('true')
    expect(sessionStatus.headers.has('set-cookie')).toBe(false)
    const after = await runInDurableObject(familyStub, async (_instance, state) => (
      state.storage.get('session-family')
    ))
    expect(after).toEqual(before)
    expect(after).toMatchObject({ state: 'pending', currentGeneration: 1 })
    expect(getStatus).toHaveBeenCalledTimes(2)
    expect(submit).toHaveBeenCalledOnce()
    expect(h.signer).not.toHaveBeenCalled()
  })

  it('supports revoked-founder reapplication without gameplay tokens in workerd', async () => {
    const getStatus = vi.fn(async () => ({ status: 'not-requested' } as const))
    const submit = vi.fn(async () => ({
      status: 'requested',
      requestedAtMicros: 1_785_414_896_000_000,
    } as const))
    const h = harness({
      admission: { state: 'disabled', authEpoch: 0 },
      accessRequestResolver: { getStatus, submit },
    })
    const bridgeEnv = env as unknown as WorkerEnv

    const bearerSubmit = await h.app.fetch(
      accessBearerPost(ACCESS_REQUEST_PATH),
      bridgeEnv,
    )
    expect(bearerSubmit.status).toBe(200)
    expect(await bearerSubmit.json()).toEqual({
      version: 1,
      status: 'requested',
      requestedAt: 1_785_414_896_000,
    })
    expect(submit).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledWith(FID)

    const issued = await h.app.fetch(post('/v2/farcaster/challenge', {
      domain: DOMAIN,
      siweUri: SIWE_URI,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256',
    }), bridgeEnv)
    const challenge = await issued.json() as IssuedChallenge
    const exchange = await h.app.fetch(
      post('/v2/farcaster/exchange', proofFor(challenge)),
      bridgeEnv,
    )
    expect(exchange.status).toBe(200)
    expect(await exchange.clone().json()).toMatchObject({
      version: 2,
      status: 'pending-admission',
      identity: { fid: Number(FID) },
    })
    const cookie = exchange.headers.get('set-cookie')?.split(';', 1)[0]
    expect(cookie).toMatch(/^__Host-warpkeep_session=v1\./)
    const familyId = cookie!.split('=', 2)[1].split('.')[1]
    const familyStub = env.SESSION_FAMILIES.get(
      env.SESSION_FAMILIES.idFromName(`warpkeep-session:v1:${familyId}`),
    )
    const stored = await runInDurableObject(familyStub, async (_instance, state) => (
      state.storage.get('session-family')
    ))
    expect(stored).toMatchObject({
      state: 'pending',
      pendingAdmissionState: 'disabled',
      currentGeneration: 1,
    })

    const sessionStatus = await h.app.fetch(
      post(ACCESS_STATUS_PATH, {}, { cookie: cookie! }),
      bridgeEnv,
    )
    expect(sessionStatus.status).toBe(200)
    expect(await sessionStatus.json()).toEqual({
      version: 1,
      status: 'not-requested',
    })
    expect(getStatus).toHaveBeenCalledOnce()
    expect(getStatus).toHaveBeenCalledWith(FID)

    const refresh = await h.app.fetch(
      post('/v2/session/refresh', {}, { cookie: cookie! }),
      bridgeEnv,
    )
    expect(refresh.status).toBe(200)
    expect(await refresh.json()).toMatchObject({
      version: 2,
      status: 'pending-admission',
      identity: { fid: Number(FID) },
    })
    expect(refresh.headers.get('set-cookie')).toMatch(/__Host-warpkeep_session=v1\./)
    expect(getStatus).toHaveBeenCalledOnce()
    expect(submit).toHaveBeenCalledOnce()
    expect(h.signer).not.toHaveBeenCalled()
  })

  it('keeps access-request preflights and rate limits exact in workerd', async () => {
    const bridgeEnv = env as unknown as WorkerEnv
    const bearerPreflight = await harness().app.fetch(new Request(
      `https://auth.warpkeep.test${ACCESS_REQUEST_PATH}`,
      {
        method: 'OPTIONS',
        headers: {
          origin: QUICK_AUTH_ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'authorization, content-type',
        },
      },
    ), bridgeEnv)
    expect(bearerPreflight.status).toBe(204)
    expect(bearerPreflight.headers.get('access-control-allow-origin'))
      .toBe(QUICK_AUTH_ORIGIN)
    expect(bearerPreflight.headers.get('access-control-allow-headers'))
      .toBe('authorization, content-type, x-warpkeep-expected-fid')
    expect(bearerPreflight.headers.has('access-control-allow-credentials')).toBe(false)

    const sessionPreflight = await harness().app.fetch(new Request(
      `https://auth.warpkeep.test${ACCESS_STATUS_PATH}`,
      {
        method: 'OPTIONS',
        headers: {
          origin: ORIGIN,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      },
    ), bridgeEnv)
    expect(sessionPreflight.status).toBe(204)
    expect(sessionPreflight.headers.get('access-control-allow-origin')).toBe(ORIGIN)
    expect(sessionPreflight.headers.get('access-control-allow-headers'))
      .toBe('content-type, x-warpkeep-expected-fid')
    expect(sessionPreflight.headers.get('access-control-allow-credentials')).toBe('true')

    const check = vi.fn(async (_request: Request, _action: string) => ({
      allowed: false as const,
      retryAfterSeconds: 13,
    }))
    const limited = harness({
      admission: { state: 'missing', authEpoch: 0 },
      rateLimiter: { check },
    })
    const response = await limited.app.fetch(
      accessBearerPost(ACCESS_REQUEST_PATH),
      bridgeEnv,
    )
    expect(response.status).toBe(429)
    expect(response.headers.get('retry-after')).toBe('13')
    expect(check.mock.calls[0]?.[1]).toBe('access-request')
    expect(limited.quickAuthVerifier.verifyJwt).not.toHaveBeenCalled()
    expect(limited.resolver.resolve).not.toHaveBeenCalled()
  })

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
