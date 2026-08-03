import { describe, expect, it, vi } from 'vitest'

import { AdmissionNotification } from '../src/admissionNotifications'
import type { BridgeConfig } from '../src/config'
import type {
  AuthEpochResolver,
  DurableObjectState,
  DurableObjectStorage,
  DurableObjectTransaction,
  VerifiedMiniAppWebhookEvent,
} from '../src/types'

const NOW = 1_800_000_000_000
const FID = '12345'
const APP_FID = 9_152
const DELIVERY_URL = 'https://api.farcaster.xyz/v1/frame-notifications'
const TOKEN = 'test-notification-token-with-enough-entropy'
const INTERNAL_ORIGIN = 'https://admission-notification.internal'
const STATE_KEY = 'admission-notification-v1'

class FakeStorage implements DurableObjectStorage {
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

function config(enabled = true): BridgeConfig {
  return {
    issuer: 'https://auth.warpkeep.com',
    issuerUrl: new URL('https://auth.warpkeep.com'),
    allowedOrigins: new Set(['https://warpkeep.com']),
    domain: 'warpkeep.com',
    siweUri: 'https://warpkeep.com/',
    farcasterRpcUrls: Object.freeze([
      'https://optimism-rpc-one.example.com/',
      'https://optimism-rpc-two.example.net/',
    ]),
    audience: 'warpkeep-spacetimedb',
    keyId: 'test-key',
    privateJwk: {
      kty: 'EC',
      crv: 'P-256',
      x: 'A'.repeat(43),
      y: 'B'.repeat(43),
      d: 'C'.repeat(43),
    },
    adminTokenSecret: 'test-admin-secret-at-least-thirty-two-bytes',
    sessionCookieKey: 'test-session-secret-at-least-thirty-two-bytes',
    spacetimeDbUri: 'https://maincloud.spacetimedb.com',
    spacetimeDbDatabase: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    publicAuthEnabled: true,
    accessExpectedFidRequired: true,
    qaObserverEnabled: false,
    approvalNotificationsEnabled: enabled,
    miniAppNotifications: {
      hubUrls: Object.freeze([
        'https://rho.farcaster.xyz:3381/',
        'https://hub.pinata.cloud/',
      ]),
      clients: Object.freeze([{ appFid: APP_FID, deliveryUrl: DELIVERY_URL }]),
      operatorSecret: 'test-notification-operator-secret-at-least-thirty-two-bytes',
    },
    environment: 'production',
  }
}

function enabledEvent(
  eventId = 'a'.repeat(64),
  token = TOKEN,
): VerifiedMiniAppWebhookEvent {
  return {
    eventId,
    fid: FID,
    appFid: APP_FID,
    event: {
      type: 'enabled',
      details: { token, url: DELIVERY_URL },
    },
  }
}

function disabledEvent(eventId = 'b'.repeat(64)): VerifiedMiniAppWebhookEvent {
  return { eventId, fid: FID, appFid: APP_FID, event: { type: 'disabled' } }
}

function internalRequest(path: 'event' | 'queue' | 'status', body: unknown): Request {
  return new Request(`${INTERNAL_ORIGIN}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

function successfulDelivery(token = TOKEN): Response {
  return Response.json({
    result: {
      successfulTokens: [token],
      invalidTokens: [],
      rateLimitedTokens: [],
    },
  })
}

function stored(storage: FakeStorage): string {
  return JSON.stringify(storage.values.get(STATE_KEY))
}

function createHarness(options: {
  fetchImpl?: typeof fetch
  resolver?: AuthEpochResolver
  configReader?: () => BridgeConfig
} = {}) {
  const storage = new FakeStorage()
  let now = NOW
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => ({ state: 'enabled', authEpoch: 7 } as const)),
  }
  const notification = new AdmissionNotification(
    { storage } as DurableObjectState,
    {},
    {
      now: () => now,
      fetchImpl: options.fetchImpl ?? vi.fn(async () => successfulDelivery()),
      configReader: options.configReader ?? (() => config()),
      admissionResolver: resolver,
    },
  )
  return {
    notification,
    storage,
    resolver,
    setNow(value: number) { now = value },
  }
}

async function applyEvent(
  notification: AdmissionNotification,
  event: VerifiedMiniAppWebhookEvent,
): Promise<Response> {
  return notification.fetch(internalRequest('event', event))
}

async function queue(
  notification: AdmissionNotification,
  authEpoch = 7,
  queuedAt = NOW,
): Promise<Response> {
  return notification.fetch(internalRequest('queue', { fid: FID, authEpoch, queuedAt }))
}

async function inspect(notification: AdmissionNotification): Promise<Response> {
  return notification.fetch(internalRequest('status', { fid: FID }))
}

describe('admission notification consent and delivery lifecycle', () => {
  it('closes the queue-before-consent race and keeps a retained auth-epoch receipt', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })

    const beforeConsent = await queue(h.notification)
    await expect(beforeConsent.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(fetchImpl).not.toHaveBeenCalled()

    expect((await applyEvent(h.notification, enabledEvent())).status).toBe(204)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const [deliveryUrl, deliveryInit] = fetchImpl.mock.calls[0]
    expect(deliveryUrl).toBe(DELIVERY_URL)
    expect(deliveryInit?.redirect).toBe('error')
    const payload = JSON.parse(String(deliveryInit?.body))
    expect(payload).toEqual({
      notificationId: 'warpkeep-access-approved-v1-e7',
      title: 'The Hegemony admits you',
      body: 'Your keep awaits in Genesis 001. Enter the living Realm.',
      targetUrl: 'https://warpkeep.com/?miniApp=true',
      tokens: [TOKEN],
    })
    expect(payload.title).toHaveLength(23)
    expect(payload.body).toHaveLength(56)

    const duplicate = await queue(h.notification)
    await expect(duplicate.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
  })

  it('erases raw token material on opt-out and rejects a replay under a new envelope', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })
    expect((await applyEvent(h.notification, enabledEvent())).status).toBe(204)
    expect(stored(h.storage)).toContain(TOKEN)

    expect((await applyEvent(h.notification, disabledEvent())).status).toBe(204)
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')

    expect((await applyEvent(
      h.notification,
      enabledEvent('c'.repeat(64), TOKEN),
    )).status).toBe(204)
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('serializes overlapping enable and disable events so opt-out wins arrival order', async () => {
    const h = createHarness()
    const [enabled, disabled] = await Promise.all([
      applyEvent(h.notification, enabledEvent()),
      applyEvent(h.notification, disabledEvent()),
    ])

    expect(enabled.status).toBe(204)
    expect(disabled.status).toBe(204)
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')
  })

  it('rechecks the exact live auth epoch and never sends after revocation', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const resolver = {
      resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
    }
    const h = createHarness({ fetchImpl, resolver })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(resolver.resolve).toHaveBeenCalledWith(FID)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).not.toContain('"delivery"')
  })

  it('invalidates a queued generation when the independent feature gate is paused', async () => {
    let currentConfig = config(true)
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      configReader: () => currentConfig,
    })
    const beforeConsent = await queue(h.notification)
    await expect(beforeConsent.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(stored(h.storage)).toContain('"delivery"')

    currentConfig = config(false)
    await h.notification.alarm()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(h.storage.values.has(STATE_KEY)).toBe(false)
  })

  it('retries verifier outages from a pending alarm without exposing the token', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const resolver = {
      resolve: vi.fn(async () => { throw new Error('private resolver detail') }),
    }
    const h = createHarness({ fetchImpl, resolver })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'queued' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(h.storage.alarm).toBe(NOW + 30_000)
    expect(stored(h.storage)).toContain(TOKEN)
    expect(String(response.headers)).not.toContain(TOKEN)
  })

  it('does not spend the delivery-attempt ceiling on admission resolver outages', async () => {
    let resolverAvailable = false
    const resolver = {
      resolve: vi.fn(async () => {
        if (!resolverAvailable) throw new Error('private resolver detail')
        return { state: 'enabled', authEpoch: 7 } as const
      }),
    }
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl, resolver })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)

    for (let failure = 1; failure < 6; failure += 1) {
      const alarm = Number(h.storage.alarm)
      h.setNow(alarm)
      await h.notification.alarm()
    }
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).not.toContain('lastExhaustedAuthEpoch')

    resolverAvailable = true
    const recoveryAlarm = Number(h.storage.alarm)
    h.setNow(recoveryAlarm)
    await h.notification.alarm()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
  })

  it('purges a token that the Farcaster delivery service marks invalid', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        successfulTokens: [],
        invalidTokens: [TOKEN],
        rateLimitedTokens: [],
      },
    }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')
  })

  it('accepts the current additive Farcaster response on a successful delivery', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        successfulTokens: [TOKEN],
        invalidTokens: [],
        rateLimitedTokens: [],
        failedTokens: [],
      },
    }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
  })

  it('deduplicates the current mirrored invalid-token result before purging consent', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        successfulTokens: [],
        invalidTokens: [TOKEN],
        rateLimitedTokens: [],
        failedTokens: [{ token: TOKEN, fid: 12_345, reason: 'invalid_token' }],
      },
    }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')
  })

  it('retains consent and records a bounded retry for a structured provider failure', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        successfulTokens: [],
        invalidTokens: [],
        rateLimitedTokens: [],
        failedTokens: [{ token: TOKEN, reason: 'no_webhook_url' }],
      },
    }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'queued' })
    expect(stored(h.storage)).toContain(TOKEN)
    expect(stored(h.storage)).toContain('"status":"retrying"')
    expect(stored(h.storage)).not.toContain('retryReason')
    expect(stored(h.storage)).not.toContain('provider-no-webhook-url')
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      retryReasons: ['provider-no-webhook-url'],
    })
  })

  it('ignores additive provider metadata after validating known outcome fields', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      providerRequestId: 'opaque-provider-metadata',
      result: {
        successfulTokens: [TOKEN],
        invalidTokens: [],
        rateLimitedTokens: [],
        failedTokens: [],
        unsupportedTokens: [],
      },
    }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const response = await queue(h.notification)
    await expect(response.json()).resolves.toEqual({ status: 'already-sent' })
  })

  it('fails closed on unknown structured reasons or contradictory known outcomes', async () => {
    const responses = [
      {
        result: {
          successfulTokens: [],
          invalidTokens: [],
          rateLimitedTokens: [],
          failedTokens: [{ token: TOKEN, reason: 'future_reason' }],
        },
      },
      {
        result: {
          successfulTokens: [TOKEN],
          invalidTokens: [],
          rateLimitedTokens: [],
          failedTokens: [{ token: TOKEN, reason: 'no_webhook_url' }],
        },
      },
    ]
    for (const providerResponse of responses) {
      const h = createHarness({
        fetchImpl: vi.fn<typeof fetch>(async () => Response.json(providerResponse)),
      })
      await applyEvent(h.notification, enabledEvent())
      const response = await queue(h.notification)
      await expect(response.json()).resolves.toEqual({ status: 'queued' })
      await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
        retryReasons: ['invalid-response'],
      })
    }
  })

  it('returns only token-free delivery diagnostics', async () => {
    const resolver = {
      resolve: vi.fn(async () => { throw new Error('private resolver detail') }),
    }
    const h = createHarness({ resolver })

    await expect((await inspect(h.notification)).json()).resolves.toEqual({
      status: 'not-subscribed',
      deliveryAttemptCount: 0,
      verificationFailureCount: 0,
      retryReasons: [],
    })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)

    const response = await inspect(h.notification)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain(TOKEN)
    expect(JSON.parse(text)).toEqual({
      status: 'queued',
      authEpoch: 7,
      deliveryAttemptCount: 0,
      verificationFailureCount: 1,
      retryReasons: ['admission-verification'],
      nextAttemptAt: NOW + 30_000,
    })
  })

  it('never resets the six-attempt ceiling for the same admission epoch', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)

    let currentTime = NOW
    for (let attempt = 1; attempt < 6; attempt += 1) {
      const alarm = Number(h.storage.alarm)
      expect(Number.isSafeInteger(alarm)).toBe(true)
      currentTime = alarm
      h.setNow(alarm)
      await h.notification.alarm()
    }
    expect(fetchImpl).toHaveBeenCalledTimes(6)
    expect(stored(h.storage)).toContain('"lastExhaustedAuthEpoch":7')

    const duplicate = await queue(h.notification, 7, currentTime)
    await expect(duplicate.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('reports the newest terminal receipt after an older successful epoch', async () => {
    let failDelivery = false
    let resolverEpoch = 7
    const fetchImpl = vi.fn<typeof fetch>(async () => (
      failDelivery ? new Response(null, { status: 503 }) : successfulDelivery()
    ))
    const h = createHarness({
      fetchImpl,
      resolver: {
        resolve: vi.fn(async () => ({ state: 'enabled', authEpoch: resolverEpoch } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification, 7)

    failDelivery = true
    resolverEpoch = 8
    await queue(h.notification, 8)
    for (let attempt = 1; attempt < 6; attempt += 1) {
      const alarm = Number(h.storage.alarm)
      h.setNow(alarm)
      await h.notification.alarm()
    }
    h.setNow(NOW + 7 * 24 * 60 * 60 * 1_000)
    await h.notification.alarm()

    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      status: 'delivery-exhausted',
      authEpoch: 8,
      deliveryAttemptCount: 0,
      verificationFailureCount: 0,
    })
  })

  it('bounds raw subscription-token retention even without an admission queue', async () => {
    const h = createHarness()
    await applyEvent(h.notification, enabledEvent())
    expect(stored(h.storage)).toContain(TOKEN)
    const expiry = Number(h.storage.alarm)
    expect(expiry).toBe(NOW + 366 * 24 * 60 * 60 * 1_000)

    h.setNow(expiry)
    await h.notification.alarm()
    expect(h.storage.values.has(STATE_KEY)).toBe(false)
  })
})
