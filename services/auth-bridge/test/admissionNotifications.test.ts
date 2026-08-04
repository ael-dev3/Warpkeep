import { describe, expect, it, vi } from 'vitest'

import { AdmissionNotification } from '../src/admissionNotifications'
import type { BridgeConfig } from '../src/config'
import type {
  AccessRequestResolver,
  AuthEpochResolver,
  DurableObjectState,
  DurableObjectStorage,
  DurableObjectTransaction,
  VerifiedMiniAppWebhookEvent,
} from '../src/types'

const NOW = 1_800_000_000_000
const REQUESTED_AT_MICROS = 1_799_999_999_000_000
const FID = '12345'
const APP_FID = 9_152
const DELIVERY_URL = 'https://api.farcaster.xyz/v1/frame-notifications'
const TOKEN = 'test-notification-token-with-enough-entropy'
const INTERNAL_ORIGIN = 'https://admission-notification.internal'
const STATE_KEY = 'admission-notification-v1'
const PENDING_STATE_RECORD = 'admission-notification-pending-v2'

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
  appFid = APP_FID,
  url = DELIVERY_URL,
): VerifiedMiniAppWebhookEvent {
  return {
    eventId,
    fid: FID,
    appFid,
    event: {
      type: 'enabled',
      details: { token, url },
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

function pendingStored(storage: FakeStorage): string {
  return JSON.stringify(storage.values.get(PENDING_STATE_RECORD))
}

function createHarness(options: {
  fetchImpl?: typeof fetch
  resolver?: AuthEpochResolver
  accessRequestResolver?: AccessRequestResolver
  configReader?: () => BridgeConfig
} = {}) {
  const storage = new FakeStorage()
  let now = NOW
  const resolver = options.resolver ?? {
    resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
  }
  const notification = new AdmissionNotification(
    { storage } as DurableObjectState,
    {},
    {
      now: () => now,
      fetchImpl: options.fetchImpl ?? vi.fn(async () => successfulDelivery()),
      configReader: options.configReader ?? (() => config()),
      admissionResolver: resolver,
      accessRequestResolver: options.accessRequestResolver ?? {
        getStatus: vi.fn(async () => ({
          status: 'requested',
          requestedAtMicros: REQUESTED_AT_MICROS,
        } as const)),
        submit: vi.fn(async () => ({
          status: 'requested',
          requestedAtMicros: REQUESTED_AT_MICROS,
        } as const)),
      },
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

async function queueAdmitted(
  notification: AdmissionNotification,
  authEpoch = 7,
  queuedAt = NOW,
): Promise<Response> {
  return notification.fetch(internalRequest('queue', { fid: FID, authEpoch, queuedAt }))
}

async function queue(
  notification: AdmissionNotification,
  requestedAtMicros = REQUESTED_AT_MICROS,
  queuedAt = NOW,
): Promise<Response> {
  return queuePending(notification, requestedAtMicros, queuedAt)
}

async function queuePending(
  notification: AdmissionNotification,
  requestedAtMicros: number,
  queuedAt = NOW,
): Promise<Response> {
  return notification.fetch(internalRequest('queue', {
    fid: FID,
    kind: 'pending-request',
    requestedAtMicros,
    queuedAt,
  }))
}

async function inspect(notification: AdmissionNotification): Promise<Response> {
  return notification.fetch(internalRequest('status', { fid: FID }))
}

describe('admission notification consent and delivery lifecycle', () => {
  it('retires direct admitted-generation queues without contacting Farcaster', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })

    const beforeConsent = await queueAdmitted(h.notification)
    await expect(beforeConsent.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).not.toHaveBeenCalled()

    const explicitLegacyShape = await h.notification.fetch(internalRequest('queue', {
      fid: FID,
      kind: 'admitted',
      authEpoch: 8,
      queuedAt: NOW,
    }))
    await expect(explicitLegacyShape.json()).resolves.toEqual({
      status: 'delivery-exhausted',
    })
    expect(fetchImpl).not.toHaveBeenCalled()

    expect((await applyEvent(h.notification, enabledEvent())).status).toBe(204)
    const duplicate = await queueAdmitted(h.notification)
    await expect(duplicate.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).toContain('"lastExhaustedAuthEpoch":8')
    expect(stored(h.storage)).not.toContain('"kind"')
    expect(stored(h.storage)).not.toContain('"lastAttemptAt"')
    expect(stored(h.storage)).not.toContain('"lastFailureReason"')
  })

  it('gets provider acceptance for the exact pending request before admission exists', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const accessRequestResolver = {
      getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
    }
    const h = createHarness({
      fetchImpl,
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver,
    })
    await applyEvent(h.notification, enabledEvent())

    const response = await queuePending(h.notification, requestedAtMicros)
    await expect(response.json()).resolves.toEqual({ status: 'already-sent' })
    expect(accessRequestResolver.getStatus).toHaveBeenCalledWith(FID)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(payload).toEqual({
      notificationId: `warpkeep-access-approved-v2-r${requestedAtMicros}`,
      title: 'Welcome to the Hegemony Empire',
      body: 'The gates have answered your name. Cross the threshold, Founder—your legacy awaits.',
      targetUrl: 'https://warpkeep.com/?miniApp=true',
      tokens: [TOKEN],
    })
    expect(JSON.stringify(payload)).not.toMatch(/Genesis 001|living Realm|12345|other player/i)
    expect(pendingStored(h.storage)).toContain(
      `"lastSentRequestAtMicros":${requestedAtMicros}`,
    )
    expect(pendingStored(h.storage)).not.toContain(TOKEN)
    const legacy = h.storage.values.get(STATE_KEY) as Record<string, unknown>
    expect(Object.keys(legacy).sort()).toEqual([
      'fid',
      'retentionExpiresAt',
      'revision',
      'revokedTokenIds',
      'seenEventIds',
      'subscriptions',
      'version',
    ])
    expect(stored(h.storage)).not.toContain('pending-request')
    expect(stored(h.storage)).not.toContain('lastSentRequestAtMicros')
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      status: 'already-sent',
      generation: 'pending-request',
    })
  })

  it('does not reuse a pending-request receipt for a later application', async () => {
    let requestedAtMicros = 1_799_999_999_000_000
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queuePending(h.notification, requestedAtMicros)

    requestedAtMicros += 1_000
    const second = await queuePending(h.notification, requestedAtMicros, NOW + 1)
    await expect(second.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const notificationIds = fetchImpl.mock.calls.map(call => (
      JSON.parse(String(call[1]?.body)) as { notificationId: string }
    ).notificationId)
    expect(new Set(notificationIds).size).toBe(2)

    const stale = await queuePending(
      h.notification,
      requestedAtMicros - 1_000,
      NOW + 2,
    )
    await expect(stale.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it('serializes concurrent queues for one request into one stable notification', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())

    const responses = await Promise.all([
      queue(h.notification),
      queue(h.notification),
      queue(h.notification),
    ])

    await Promise.all(responses.map(async response => {
      await expect(response.json()).resolves.toEqual({ status: 'already-sent' })
    }))
    expect(fetchImpl).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(payload.notificationId).toBe(
      `warpkeep-access-approved-v2-r${REQUESTED_AT_MICROS}`,
    )
  })

  it('keeps retries on the same request notification id', async () => {
    let attempt = 0
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      attempt += 1
      return attempt === 1
        ? new Response(null, { status: 503 })
        : successfulDelivery()
    })
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    await expect((await queue(h.notification)).json()).resolves.toEqual({ status: 'queued' })

    h.setNow(Number(h.storage.alarm))
    await h.notification.alarm()

    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const ids = fetchImpl.mock.calls.map(call => (
      JSON.parse(String(call[1]?.body)) as { notificationId: string }
    ).notificationId)
    expect(new Set(ids)).toEqual(new Set([
      `warpkeep-access-approved-v2-r${REQUESTED_AT_MICROS}`,
    ]))
  })

  it('does not revive a successful request after a token refresh', async () => {
    const replacementToken = 'test-replacement-token-with-enough-entropy'
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)
    expect(fetchImpl).toHaveBeenCalledOnce()

    h.setNow(NOW + 1)
    await applyEvent(h.notification, enabledEvent('b'.repeat(64), replacementToken))

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain(replacementToken)
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(pendingStored(h.storage)).toContain(
      `"lastSentRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
    expect(pendingStored(h.storage)).not.toContain('"delivery"')
  })

  it('does not revive an exhausted request after a token refresh', async () => {
    const replacementToken = 'test-replacement-token-with-enough-entropy'
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
    await expect((await queue(h.notification)).json()).resolves.toEqual({
      status: 'delivery-exhausted',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()

    h.setNow(NOW + 1)
    await applyEvent(h.notification, enabledEvent('b'.repeat(64), replacementToken))

    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(pendingStored(h.storage)).toContain(
      `"lastExhaustedRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
    expect(pendingStored(h.storage)).not.toContain('"delivery"')
  })

  it('terminates an in-flight request instead of retargeting it after token rotation', async () => {
    const replacementToken = 'test-replacement-token-with-enough-entropy'
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }))
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    await expect((await queue(h.notification)).json()).resolves.toEqual({ status: 'queued' })
    expect(fetchImpl).toHaveBeenCalledOnce()

    h.setNow(NOW + 1)
    await applyEvent(h.notification, enabledEvent('b'.repeat(64), replacementToken))

    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect((await queue(
      h.notification,
      REQUESTED_AT_MICROS,
      NOW + 1,
    )).json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(pendingStored(h.storage)).toContain(
      `"lastExhaustedRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
    expect(stored(h.storage)).toContain(replacementToken)
    expect(stored(h.storage)).not.toContain(TOKEN)
  })

  it('uses only one deterministic transport target for a player request', async () => {
    const secondAppFid = APP_FID + 1
    const secondUrl = 'https://client-two.example/notifications'
    const secondToken = 'test-second-client-token-with-enough-entropy'
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const payload = JSON.parse(String(init?.body)) as { tokens: string[] }
      return successfulDelivery(payload.tokens[0])
    })
    const baseConfig = config()
    const h = createHarness({
      fetchImpl,
      configReader: () => ({
        ...baseConfig,
        miniAppNotifications: {
          ...baseConfig.miniAppNotifications!,
          clients: Object.freeze([
            { appFid: APP_FID, deliveryUrl: DELIVERY_URL },
            { appFid: secondAppFid, deliveryUrl: secondUrl },
          ]),
        },
      }),
    })
    await applyEvent(h.notification, enabledEvent())
    h.setNow(NOW + 1)
    await applyEvent(h.notification, enabledEvent(
      'b'.repeat(64),
      secondToken,
      secondAppFid,
      secondUrl,
    ))

    await expect((await queue(h.notification, REQUESTED_AT_MICROS, NOW + 1)).json())
      .resolves.toEqual({ status: 'already-sent' })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(payload.tokens).toEqual([secondToken])
    expect(payload.tokens).not.toContain(TOKEN)
  })

  it('never accepts another FID or its token in the same durable object', async () => {
    const otherFid = '67890'
    const otherToken = 'test-other-player-token-with-enough-entropy'
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)

    const otherEvent = {
      ...enabledEvent('c'.repeat(64), otherToken),
      fid: otherFid,
    }
    expect((await applyEvent(h.notification, otherEvent)).status).toBe(409)
    const otherQueue = await h.notification.fetch(internalRequest('queue', {
      fid: otherFid,
      kind: 'pending-request',
      requestedAtMicros: REQUESTED_AT_MICROS,
      queuedAt: NOW,
    }))
    expect(otherQueue.status).toBe(409)
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).not.toContain(otherFid)
    expect(stored(h.storage)).not.toContain(otherToken)
  })

  it('cancels a staged delivery when the exact pending request no longer matches', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({
          status: 'requested',
          requestedAtMicros: requestedAtMicros + 1,
        } as const)),
        submit: vi.fn(async () => ({ status: 'not-requested' } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())

    const response = await queuePending(h.notification, requestedAtMicros)
    await expect(response.json()).resolves.toEqual({ status: 'not-subscribed' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).not.toContain('"delivery"')
  })

  it('heals a rollback conflict before processing a signed opt-out', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const fetchImpl = vi.fn<typeof fetch>(async () => Response.json({
      result: {
        successfulTokens: [],
        invalidTokens: [],
        rateLimitedTokens: [TOKEN],
      },
    }))
    const h = createHarness({
      fetchImpl,
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queuePending(h.notification, requestedAtMicros)
    expect(h.storage.values.has(PENDING_STATE_RECORD)).toBe(true)

    const legacy = h.storage.values.get(STATE_KEY) as Record<string, unknown>
    const subscriptions = legacy.subscriptions as Array<Record<string, unknown>>
    h.storage.values.set(STATE_KEY, {
      ...legacy,
      revision: Number(legacy.revision) + 1,
      delivery: {
        authEpoch: 7,
        queuedAt: NOW,
        expiresAt: NOW + 24 * 60 * 60 * 1_000,
        attempts: [{
          appFid: APP_FID,
          tokenId: subscriptions[0].tokenId,
          status: 'pending',
          attempts: 0,
          verificationFailures: 0,
        }],
      },
    })

    expect((await inspect(h.notification)).status).toBe(200)
    expect((await applyEvent(h.notification, disabledEvent())).status).toBe(204)
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(h.storage.values.has(PENDING_STATE_RECORD)).toBe(false)
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

  it('tombstones a superseded token so an old signed enable cannot restore it', async () => {
    const tokenA = 'test-notification-token-a-with-enough-entropy'
    const tokenB = 'test-notification-token-b-with-enough-entropy'
    const h = createHarness()

    await applyEvent(h.notification, enabledEvent('a'.repeat(64), tokenA))
    await applyEvent(h.notification, enabledEvent('b'.repeat(64), tokenB))
    expect(stored(h.storage)).not.toContain(tokenA)
    expect(stored(h.storage)).toContain(tokenB)

    await applyEvent(h.notification, enabledEvent('c'.repeat(64), tokenA))
    expect(stored(h.storage)).not.toContain(tokenA)
    expect(stored(h.storage)).toContain(tokenB)

    await applyEvent(h.notification, disabledEvent('d'.repeat(64)))
    expect(stored(h.storage)).not.toContain(tokenA)
    expect(stored(h.storage)).not.toContain(tokenB)
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

  it('cancels a pending notification once admission is already authoritative', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const resolver = {
      resolve: vi.fn(async () => ({ state: 'enabled', authEpoch: 7 } as const)),
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
    expect(pendingStored(h.storage)).toContain('"delivery"')

    currentConfig = config(false)
    await h.notification.alarm()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(h.storage.values.has(STATE_KEY)).toBe(false)
  })

  it('keeps active delivery recoverable across a transient configuration outage', async () => {
    let configured = true
    let deliveryAttempt = 0
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      deliveryAttempt += 1
      if (deliveryAttempt === 1) throw new TypeError('synthetic transport failure')
      return successfulDelivery()
    })
    const h = createHarness({
      fetchImpl,
      configReader: () => {
        if (!configured) throw new Error('synthetic configuration outage')
        return config()
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)
    expect(fetchImpl).toHaveBeenCalledOnce()

    const firstAlarm = Number(h.storage.alarm)
    h.setNow(firstAlarm)
    configured = false
    await h.notification.alarm()
    const recoveryAlarm = Number(h.storage.alarm)
    expect(recoveryAlarm).toBe(firstAlarm + 30_000)

    h.setNow(recoveryAlarm)
    configured = true
    await h.notification.alarm()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(pendingStored(h.storage)).toContain(
      `"lastSentRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
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

  it('does not spend the delivery-attempt ceiling on request verification outages', async () => {
    let resolverAvailable = false
    const resolver = {
      resolve: vi.fn(async () => {
        if (!resolverAvailable) throw new Error('private resolver detail')
        return { state: 'disabled', authEpoch: 0 } as const
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
    expect(pendingStored(h.storage)).not.toContain('lastExhaustedRequestAtMicros')

    resolverAvailable = true
    const recoveryAlarm = Number(h.storage.alarm)
    h.setNow(recoveryAlarm)
    await h.notification.alarm()
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(pendingStored(h.storage)).toContain(
      `"lastSentRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
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
    await expect(response.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')
  })

  it('classifies Cloudflare fetch rejection without retaining exception details', async () => {
    const privateDetail = 'private-runtime-detail-that-must-not-persist'
    const h = createHarness({
      fetchImpl: vi.fn<typeof fetch>(async (_input, init) => {
        expect(init?.redirect).toBe('manual')
        throw new TypeError(privateDetail)
      }),
    })
    await applyEvent(h.notification, enabledEvent())

    await expect((await queue(h.notification)).json()).resolves.toEqual({ status: 'queued' })
    const text = await (await inspect(h.notification)).text()
    expect(text).not.toContain(privateDetail)
    expect(JSON.parse(text)).toMatchObject({
      retryReasons: ['transport-fetch-rejected'],
      lastFailureReason: 'transport-fetch-rejected',
      lastAttemptAt: NOW,
    })
  })

  it('retires a persisted admitted retry without emitting it', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({ fetchImpl })
    await applyEvent(h.notification, enabledEvent())
    const state = h.storage.values.get(STATE_KEY) as Record<string, unknown>
    const subscriptions = state.subscriptions as Array<Record<string, unknown>>
    h.storage.values.set(STATE_KEY, {
      ...state,
      delivery: {
        authEpoch: 7,
        queuedAt: NOW - 60_000,
        expiresAt: NOW - 60_000 + 24 * 60 * 60 * 1_000,
        attempts: [{
          appFid: APP_FID,
          tokenId: subscriptions[0].tokenId,
          status: 'retrying',
          attempts: 5,
          verificationFailures: 0,
          nextAttemptAt: NOW - 30_000 + 4 * 60 * 60_000,
        }],
      },
    })
    await h.notification.alarm()
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).not.toContain('"delivery"')
    expect(stored(h.storage)).toContain('"lastExhaustedAuthEpoch":7')
  })

  it('rejects redirects without following or retrying them', async () => {
    const h = createHarness({
      fetchImpl: vi.fn<typeof fetch>(async (_input, init) => {
        expect(init?.redirect).toBe('manual')
        return new Response(null, {
          status: 302,
          headers: { location: 'https://hostile.example/collect' },
        })
      }),
    })
    await applyEvent(h.notification, enabledEvent())

    await expect((await queue(h.notification)).json()).resolves.toEqual({
      status: 'delivery-exhausted',
    })
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      retryReasons: ['upstream-redirect'],
      lastFailureReason: 'upstream-redirect',
    })
    expect(stored(h.storage)).toContain(TOKEN)
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
    expect(pendingStored(h.storage)).toContain(
      `"lastSentRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )
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
    await expect(response.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).not.toContain(TOKEN)
    expect(stored(h.storage)).toContain('revokedTokenIds')
  })

  it('purges a token after a permanent target-domain mismatch', async () => {
    const h = createHarness({
      fetchImpl: vi.fn<typeof fetch>(async () => Response.json({
        result: {
          successfulTokens: [],
          invalidTokens: [],
          rateLimitedTokens: [],
          failedTokens: [{ token: TOKEN, reason: 'target_url_mismatch' }],
        },
      })),
    })
    await applyEvent(h.notification, enabledEvent())

    await expect((await queue(h.notification)).json()).resolves.toEqual({
      status: 'delivery-exhausted',
    })
    expect(stored(h.storage)).not.toContain(TOKEN)
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      retryReasons: ['provider-target-url-mismatch'],
    })
  })

  it('retains consent but exhausts a deterministic provider configuration failure', async () => {
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
    await expect(response.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(stored(h.storage)).toContain(TOKEN)
    expect(pendingStored(h.storage)).toContain('"status":"exhausted"')
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
        retryReasons: ['response-schema'],
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
      generation: 'pending-request',
      deliveryAttemptCount: 0,
      verificationFailureCount: 1,
      retryReasons: ['request-verification'],
      nextAttemptAt: NOW + 30_000,
    })
  })

  it('never resets the six-attempt ceiling for the same access request', async () => {
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
    expect(pendingStored(h.storage)).toContain(
      `"lastExhaustedRequestAtMicros":${REQUESTED_AT_MICROS}`,
    )

    const duplicate = await queue(h.notification, REQUESTED_AT_MICROS, currentTime)
    await expect(duplicate.json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('reports the newest terminal receipt after an older successful request', async () => {
    let failDelivery = false
    let requestedAtMicros = REQUESTED_AT_MICROS
    const fetchImpl = vi.fn<typeof fetch>(async () => (
      failDelivery ? new Response(null, { status: 503 }) : successfulDelivery()
    ))
    const h = createHarness({
      fetchImpl,
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification, requestedAtMicros)

    failDelivery = true
    requestedAtMicros += 1_000
    await queue(h.notification, requestedAtMicros, NOW + 1)
    for (let attempt = 1; attempt < 6; attempt += 1) {
      const alarm = Number(h.storage.alarm)
      h.setNow(alarm)
      await h.notification.alarm()
    }
    h.setNow(NOW + 7 * 24 * 60 * 60 * 1_000)
    await h.notification.alarm()

    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      status: 'delivery-exhausted',
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
