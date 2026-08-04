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
const FID = '12345'
const APP_FID = 9_152
const DELIVERY_URL = 'https://api.farcaster.xyz/v1/frame-notifications'
const TOKEN = 'test-notification-token-with-enough-entropy'
const INTERNAL_ORIGIN = 'https://admission-notification.internal'
const STATE_KEY = 'admission-notification-v1'
const PENDING_STATE_RECORD = 'admission-notification-pending-v2'
const PENDING_GRANT_RECORD = 'admission-notification-grant-v3'
const PENDING_GRANT_REISSUE_RECORD = 'admission-notification-grant-reissue-v1'
const DIAGNOSTICS_RECORD = 'admission-notification-diagnostics-v1'

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

function internalRequest(
  path: 'event' | 'queue' | 'reissue' | 'status' | 'ack',
  body: unknown,
): Request {
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
      accessRequestResolver: options.accessRequestResolver ?? {
        getStatus: vi.fn(async () => ({ status: 'not-requested' } as const)),
        submit: vi.fn(async () => ({ status: 'not-requested' } as const)),
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

async function queue(
  notification: AdmissionNotification,
  authEpoch = 7,
  queuedAt = NOW,
): Promise<Response> {
  return notification.fetch(internalRequest('queue', { fid: FID, authEpoch, queuedAt }))
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

async function acknowledge(
  notification: AdmissionNotification,
  ticket: string,
  notificationId: string,
): Promise<Response> {
  return notification.fetch(internalRequest('ack', { fid: FID, ticket, notificationId }))
}

async function reissue(
  notification: AdmissionNotification,
  requestedAtMicros: number,
  reissuedAt: number,
): Promise<Response> {
  return notification.fetch(internalRequest('reissue', {
    fid: FID,
    requestedAtMicros,
    reissuedAt,
  }))
}

function grantNotificationId(grant: Readonly<{ intentId: string }>): string {
  return `warpkeep-access-grant-v3-i${grant.intentId}`
}

function pendingGrant(storage: FakeStorage): {
  intentId: string
  ticket: string
  requestedAtMicros: number
  providerAcceptedAt?: number
  acknowledgedAt?: number
} {
  return storage.values.get(PENDING_GRANT_RECORD) as {
    intentId: string
    ticket: string
    requestedAtMicros: number
    providerAcceptedAt?: number
    acknowledgedAt?: number
  }
}

function pendingReissueState(storage: FakeStorage): {
  fid: string
  requestedAtMicros: number
  initialGrantCreatedAt: number
  reissueCount: number
  lastReissuedAt?: number
  providerAcceptedAt?: number
  clientAcknowledgedAt?: number
} {
  return storage.values.get(PENDING_GRANT_REISSUE_RECORD) as {
    fid: string
    requestedAtMicros: number
    initialGrantCreatedAt: number
    reissueCount: number
    lastReissuedAt?: number
    providerAcceptedAt?: number
    clientAcknowledgedAt?: number
  }
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
    expect(deliveryInit?.redirect).toBe('manual')
    const payload = JSON.parse(String(deliveryInit?.body))
    expect(payload).toEqual({
      notificationId: 'warpkeep-access-approved-v1-e7',
      title: 'Welcome to the Hegemony Empire',
      body: 'The gates have answered your name. Cross the threshold, Founder—your legacy awaits.',
      targetUrl: 'https://warpkeep.com/?miniApp=true',
      tokens: [TOKEN],
    })
    expect(payload.title).toHaveLength(30)
    expect(payload.body).toHaveLength(83)
    expect(`${payload.title} ${payload.body}`).not.toMatch(/genesis|realm/i)

    const duplicate = await queue(h.notification)
    await expect(duplicate.json()).resolves.toEqual({ status: 'already-sent' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
    expect(stored(h.storage)).not.toContain('"kind"')
    expect(stored(h.storage)).not.toContain('"lastAttemptAt"')
    expect(stored(h.storage)).not.toContain('"lastFailureReason"')
  })

  it('stages a unique click grant after provider acceptance for the exact pending request', async () => {
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
    await expect(response.json()).resolves.toEqual({ status: 'awaiting-client' })
    expect(accessRequestResolver.getStatus).toHaveBeenCalledWith(FID)
    expect(fetchImpl).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    const grant = pendingGrant(h.storage)
    expect(grant.intentId).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(grant.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(payload).toMatchObject({
      notificationId: `warpkeep-access-grant-v3-i${grant.intentId}`,
      title: 'Welcome to the Hegemony Empire',
      body: 'The gates have answered your name. Cross the threshold, Founder—your legacy awaits.',
      targetUrl: `https://warpkeep.com/?miniApp=true#warpkeep-grant-v1=${grant.ticket}`,
    })
    expect(payload.title).toHaveLength(30)
    expect(payload.body).toHaveLength(83)
    expect(`${payload.title} ${payload.body}`).not.toMatch(/genesis|realm/i)
    expect(pendingStored(h.storage)).not.toContain('lastSentRequestAtMicros')
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
      version: 2,
      systemState: 'enabled',
      subscriptionState: 'active',
      status: 'awaiting-client',
      generation: 'pending-request',
      activeSubscriptionCount: 1,
      activeClientFids: [9_152],
      activeAttemptCount: 1,
      sentAttemptCount: 1,
      deliveryAttemptCount: 1,
      deliveryQueuedAt: NOW,
      deliveryExpiresAt: NOW + 24 * 60 * 60 * 1_000,
      grantState: 'provider-accepted',
      grantCreatedAt: NOW,
      grantExpiresAt: NOW + 24 * 60 * 60 * 1_000,
      providerAcceptedAt: NOW,
      deliveryState: 'succeeded',
    })
    expect(await (await inspect(h.notification)).text()).not.toContain(grant.ticket)
  })

  it('reissues only through the bounded operator transition while ordinary polling stays inert', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
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
    const originalGrant = pendingGrant(h.storage)
    expect(pendingReissueState(h.storage)).toMatchObject({
      requestedAtMicros,
      reissueCount: 0,
      providerAcceptedAt: NOW,
    })
    expect(Object.keys(h.storage.values.get(PENDING_GRANT_RECORD) as object).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'fid',
      'intentId',
      'providerAcceptedAt',
      'requestedAtMicros',
      'ticket',
      'version',
    ])

    await expect((await queuePending(
      h.notification,
      requestedAtMicros,
    )).json()).resolves.toEqual({ status: 'awaiting-client' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW,
    )).json()).resolves.toEqual({ status: 'cooldown', retryAfterSeconds: 300 })
    expect(fetchImpl).toHaveBeenCalledOnce()

    h.setNow(NOW + 5 * 60 * 1_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({
      status: 'reissued',
      deliveryStatus: 'awaiting-client',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const nextGrant = pendingGrant(h.storage)
    expect(nextGrant.intentId).not.toBe(originalGrant.intentId)
    expect(nextGrant.ticket).not.toBe(originalGrant.ticket)
    expect(nextGrant).toMatchObject({
      createdAt: NOW + 5 * 60 * 1_000,
      expiresAt: NOW + 5 * 60 * 1_000 + 24 * 60 * 60 * 1_000,
      providerAcceptedAt: NOW + 5 * 60 * 1_000,
    })
    expect(Object.keys(h.storage.values.get(PENDING_GRANT_RECORD) as object).sort()).toEqual([
      'createdAt',
      'expiresAt',
      'fid',
      'intentId',
      'providerAcceptedAt',
      'requestedAtMicros',
      'ticket',
      'version',
    ])
    expect(pendingReissueState(h.storage)).toMatchObject({
      requestedAtMicros,
      reissueCount: 1,
      lastReissuedAt: NOW + 5 * 60 * 1_000,
      providerAcceptedAt: NOW + 5 * 60 * 1_000,
    })
    const pendingRecord = h.storage.values.get(PENDING_STATE_RECORD) as {
      delivery: { queuedAt: number; expiresAt: number }
    }
    expect(Object.keys(pendingRecord).sort()).toEqual(['delivery', 'fid', 'version'])
    expect(Object.keys(pendingRecord.delivery).sort()).toEqual([
      'attempts',
      'expiresAt',
      'queuedAt',
      'requestedAtMicros',
    ])
    expect(pendingRecord.delivery.expiresAt - pendingRecord.delivery.queuedAt)
      .toBe(24 * 60 * 60 * 1_000)
    await expect((await acknowledge(
      h.notification,
      originalGrant.ticket,
      grantNotificationId(originalGrant),
    )).json()).resolves.toEqual({ status: 'stale' })
    const diagnosticsText = await (await inspect(h.notification)).text()
    expect(diagnosticsText).not.toContain(originalGrant.ticket)
    expect(diagnosticsText).not.toContain(nextGrant.ticket)
    expect(diagnosticsText).not.toContain('reissueCount')
    const sidecarText = JSON.stringify(h.storage.values.get(PENDING_GRANT_REISSUE_RECORD))
    expect(sidecarText).not.toContain(originalGrant.ticket)
    expect(sidecarText).not.toContain(nextGrant.ticket)
    expect(sidecarText).not.toContain(originalGrant.intentId)
    expect(sidecarText).not.toContain(nextGrant.intentId)
    expect(sidecarText).not.toContain(TOKEN)
  })

  it('caps reissues at two for one exact pending request', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
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
    for (const offset of [5, 10]) {
      const reissuedAt = NOW + offset * 60 * 1_000
      h.setNow(reissuedAt)
      await expect((await reissue(
        h.notification,
        requestedAtMicros,
        reissuedAt,
      )).json()).resolves.toMatchObject({ status: 'reissued' })
    }
    h.setNow(NOW + 15 * 60 * 1_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 15 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'limit-reached' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(pendingReissueState(h.storage).reissueCount).toBe(2)
  })

  it('starts each reissue cooldown at the latest provider handoff', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    let deliveryCall = 0
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      deliveryCall += 1
      if (deliveryCall === 2) {
        return Response.json({
          result: {
            successfulTokens: [],
            invalidTokens: [],
            rateLimitedTokens: [TOKEN],
          },
        })
      }
      return successfulDelivery()
    })
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

    h.setNow(NOW + 5 * 60 * 1_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toMatchObject({
      status: 'reissued',
      deliveryStatus: 'queued',
    })
    expect(pendingReissueState(h.storage).providerAcceptedAt).toBeUndefined()

    h.setNow(NOW + 5 * 60 * 1_000 + 30_000)
    await h.notification.alarm()
    expect(pendingReissueState(h.storage).providerAcceptedAt)
      .toBe(NOW + 5 * 60 * 1_000 + 30_000)

    h.setNow(NOW + 10 * 60 * 1_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 10 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'cooldown', retryAfterSeconds: 30 })
    expect(fetchImpl).toHaveBeenCalledTimes(3)

    h.setNow(NOW + 10 * 60 * 1_000 + 30_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 10 * 60 * 1_000 + 30_000,
    )).json()).resolves.toMatchObject({ status: 'reissued' })
    expect(fetchImpl).toHaveBeenCalledTimes(4)
  })

  it('retains the sidecar across pause and keeps ordinary resume polling inert', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    let notificationsEnabled = true
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      configReader: () => config(notificationsEnabled),
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
    const initialSidecar = pendingReissueState(h.storage)

    h.setNow(NOW + 5 * 60 * 1_000)
    notificationsEnabled = false
    await h.notification.alarm()
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
    expect(pendingReissueState(h.storage)).toEqual(initialSidecar)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'paused' })

    notificationsEnabled = true
    await expect((await queuePending(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toMatchObject({ status: 'reissued' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(pendingReissueState(h.storage).reissueCount).toBe(1)
  })

  it('retains the exact-request cap after repeated raw-grant expiry beyond 24 hours', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
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

    let currentTime = NOW + 24 * 60 * 60 * 1_000
    for (let expectedCount = 1; expectedCount <= 2; expectedCount += 1) {
      h.setNow(currentTime)
      await h.notification.alarm()
      expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
      await expect((await queuePending(
        h.notification,
        requestedAtMicros,
        currentTime,
      )).json()).resolves.toEqual({ status: 'delivery-exhausted' })
      await expect((await reissue(
        h.notification,
        requestedAtMicros,
        currentTime,
      )).json()).resolves.toMatchObject({ status: 'reissued' })
      expect(pendingReissueState(h.storage).reissueCount).toBe(expectedCount)
      currentTime += 24 * 60 * 60 * 1_000
    }
    h.setNow(currentTime)
    await h.notification.alarm()
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      currentTime,
    )).json()).resolves.toEqual({ status: 'limit-reached' })
    expect(fetchImpl).toHaveBeenCalledTimes(3)
    expect(pendingReissueState(h.storage).reissueCount).toBe(2)
  })

  it('retains provider receipt and acknowledgement across opt-out and re-enable', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const token = (JSON.parse(String(init?.body)) as { tokens: string[] }).tokens[0]
      return successfulDelivery(token)
    })
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
    const initialProviderAcceptedAt = pendingReissueState(h.storage).providerAcceptedAt
    await applyEvent(h.notification, disabledEvent())
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
    expect(pendingReissueState(h.storage).providerAcceptedAt).toBe(initialProviderAcceptedAt)

    h.setNow(NOW + 5 * 60 * 1_000)
    await applyEvent(h.notification, enabledEvent(
      'e'.repeat(64),
      `${TOKEN}-replacement`,
    ))
    await expect((await queuePending(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'delivery-exhausted' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toMatchObject({ status: 'reissued' })
    const reissuedGrant = pendingGrant(h.storage)
    await acknowledge(
      h.notification,
      reissuedGrant.ticket,
      grantNotificationId(reissuedGrant),
    )
    expect(pendingReissueState(h.storage).clientAcknowledgedAt)
      .toBe(NOW + 5 * 60 * 1_000)
    await applyEvent(h.notification, disabledEvent('f'.repeat(64)))
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
    h.setNow(NOW + 10 * 60 * 1_000)
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 10 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'client-acknowledged' })
  })

  it('serializes acknowledgement and reissue so exactly one grant wins', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const makeHarness = () => createHarness({
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      },
    })

    const ackFirst = makeHarness()
    await applyEvent(ackFirst.notification, enabledEvent())
    await queuePending(ackFirst.notification, requestedAtMicros)
    const acknowledgedGrant = pendingGrant(ackFirst.storage)
    await acknowledge(
      ackFirst.notification,
      acknowledgedGrant.ticket,
      grantNotificationId(acknowledgedGrant),
    )
    ackFirst.setNow(NOW + 5 * 60 * 1_000)
    await expect((await reissue(
      ackFirst.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'client-acknowledged' })

    const reissueFirst = makeHarness()
    await applyEvent(reissueFirst.notification, enabledEvent('c'.repeat(64)))
    await queuePending(reissueFirst.notification, requestedAtMicros)
    const staleGrant = pendingGrant(reissueFirst.storage)
    reissueFirst.setNow(NOW + 5 * 60 * 1_000)
    await reissue(
      reissueFirst.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )
    await expect((await acknowledge(
      reissueFirst.notification,
      staleGrant.ticket,
      grantNotificationId(staleGrant),
    )).json()).resolves.toEqual({ status: 'stale' })
    const winningGrant = pendingGrant(reissueFirst.storage)
    await expect((await acknowledge(
      reissueFirst.notification,
      winningGrant.ticket,
      grantNotificationId(winningGrant),
    )).json()).resolves.toEqual({ status: 'accepted' })
  })

  it('fails closed on paused, reset, or non-disabled authority without resending', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    let admissionState: 'disabled' | 'missing' = 'disabled'
    let liveRequestedAtMicros = requestedAtMicros
    let notificationsEnabled = true
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      configReader: () => config(notificationsEnabled),
      resolver: {
        resolve: vi.fn(async () => ({ state: admissionState, authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({
          status: 'requested',
          requestedAtMicros: liveRequestedAtMicros,
        } as const)),
        submit: vi.fn(async () => ({ status: 'not-requested' } as const)),
      },
    })
    await applyEvent(h.notification, enabledEvent())
    await queuePending(h.notification, requestedAtMicros)
    h.setNow(NOW + 5 * 60 * 1_000)

    notificationsEnabled = false
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'paused' })
    notificationsEnabled = true
    admissionState = 'missing'
    await expect((await reissue(
      h.notification,
      requestedAtMicros,
      NOW + 5 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'stale' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)

    admissionState = 'disabled'
    liveRequestedAtMicros += 1_000
    await queuePending(h.notification, requestedAtMicros + 1_000, NOW + 5 * 60 * 1_000)
    const queuedFetchCount = fetchImpl.mock.calls.length
    h.setNow(NOW + 10 * 60 * 1_000)
    liveRequestedAtMicros += 1_000
    await expect((await reissue(
      h.notification,
      requestedAtMicros + 1_000,
      NOW + 10 * 60 * 1_000,
    )).json()).resolves.toEqual({ status: 'stale' })
    expect(fetchImpl).toHaveBeenCalledTimes(queuedFetchCount)
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
    await expect(second.json()).resolves.toEqual({ status: 'awaiting-client' })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    const notificationIds = fetchImpl.mock.calls.map(call => (
      JSON.parse(String(call[1]?.body)) as { notificationId: string }
    ).notificationId)
    expect(new Set(notificationIds).size).toBe(2)
  })

  it('acknowledges a provider-accepted grant once and accepts an exact replay', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const h = createHarness({
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
    const grant = pendingGrant(h.storage)

    await expect((await acknowledge(
      h.notification,
      'Z'.repeat(43),
      grantNotificationId(grant),
    )).json()).resolves.toEqual({
      status: 'stale',
    })
    await expect((await acknowledge(
      h.notification,
      grant.ticket,
      `warpkeep-access-grant-v3-i${'X'.repeat(22)}`,
    )).json()).resolves.toEqual({
      status: 'context-mismatch',
    })
    expect(pendingGrant(h.storage).acknowledgedAt).toBeUndefined()
    await expect((await acknowledge(
      h.notification,
      grant.ticket,
      grantNotificationId(grant),
    )).json()).resolves.toEqual({
      status: 'accepted',
    })
    await expect((await acknowledge(
      h.notification,
      grant.ticket,
      grantNotificationId(grant),
    )).json()).resolves.toEqual({
      status: 'accepted',
    })
    expect(pendingGrant(h.storage).acknowledgedAt).toBe(NOW)
    expect(JSON.stringify(h.storage.values.get(PENDING_GRANT_RECORD))).not.toContain(grant.ticket)
    expect(JSON.stringify(h.storage.values.get(PENDING_GRANT_RECORD))).toContain('ticketHash')
    expect(h.storage.values.has(PENDING_STATE_RECORD)).toBe(false)
    const diagnostics = await (await inspect(h.notification)).text()
    expect(diagnostics).not.toContain(grant.ticket)
    expect(JSON.parse(diagnostics)).toMatchObject({
      status: 'client-acknowledged',
      generation: 'pending-request',
      subscriptionState: 'active',
      activeSubscriptionCount: 1,
      activeAttemptCount: 0,
      grantState: 'client-acknowledged',
      grantCreatedAt: NOW,
      providerAcceptedAt: NOW,
      clientAcknowledgedAt: NOW,
      deliveryState: 'idle',
    })
  })

  it('invalidates an acknowledged replay after the exact request is reset', async () => {
    let requestedAtMicros = 1_799_999_999_000_000
    const h = createHarness({
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
    const grant = pendingGrant(h.storage)
    const ticket = grant.ticket

    await expect((await acknowledge(
      h.notification,
      ticket,
      grantNotificationId(grant),
    )).json()).resolves.toEqual({
      status: 'accepted',
    })
    requestedAtMicros += 1_000
    await expect((await acknowledge(
      h.notification,
      ticket,
      grantNotificationId(grant),
    )).json()).resolves.toEqual({
      status: 'stale',
    })
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
  })

  it('does not acknowledge a grant before the provider accepts it', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const h = createHarness({
      fetchImpl: vi.fn<typeof fetch>(async () => Response.json({
        result: {
          successfulTokens: [],
          invalidTokens: [],
          rateLimitedTokens: [TOKEN],
        },
      })),
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

    const grant = pendingGrant(h.storage)
    await expect((await acknowledge(
      h.notification,
      grant.ticket,
      grantNotificationId(grant),
    )).json()).resolves.toEqual({ status: 'not-ready' })
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      status: 'queued',
    })
  })

  it('erases the raw grant capability on notification opt-out and expiry', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
    const createPendingHarness = () => createHarness({
      resolver: {
        resolve: vi.fn(async () => ({ state: 'disabled', authEpoch: 0 } as const)),
      },
      accessRequestResolver: {
        getStatus: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
        submit: vi.fn(async () => ({ status: 'requested', requestedAtMicros } as const)),
      },
    })

    const optedOut = createPendingHarness()
    await applyEvent(optedOut.notification, enabledEvent())
    await queuePending(optedOut.notification, requestedAtMicros)
    expect(pendingGrant(optedOut.storage).ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
    await applyEvent(optedOut.notification, disabledEvent())
    expect(optedOut.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)

    const expired = createPendingHarness()
    await applyEvent(expired.notification, enabledEvent())
    await queuePending(expired.notification, requestedAtMicros)
    expired.setNow(NOW + 24 * 60 * 60 * 1_000)
    await expired.notification.alarm()
    expect(expired.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
  })

  it('rejects the prior ticket after the exact access request is reset', async () => {
    let requestedAtMicros = 1_799_999_999_000_000
    const h = createHarness({
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
    const oldGrant = pendingGrant(h.storage)

    requestedAtMicros += 1_000
    await expect((await acknowledge(
      h.notification,
      oldGrant.ticket,
      grantNotificationId(oldGrant),
    )).json()).resolves.toEqual({
      status: 'stale',
    })
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
    await queuePending(h.notification, requestedAtMicros, NOW + 1)
    const nextGrant = pendingGrant(h.storage)
    expect(nextGrant.intentId).not.toBe(oldGrant.intentId)
    expect(nextGrant.ticket).not.toBe(oldGrant.ticket)
    await expect((await acknowledge(
      h.notification,
      oldGrant.ticket,
      grantNotificationId(oldGrant),
    )).json()).resolves.toEqual({
      status: 'stale',
    })
  })

  it('does not let a rollback-era pending success receipt authorize a v3 grant', async () => {
    const requestedAtMicros = 1_799_999_999_000_000
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
    h.storage.values.set(PENDING_STATE_RECORD, {
      version: 1,
      fid: FID,
      lastSentRequestAtMicros: requestedAtMicros,
    })

    await expect((await queuePending(
      h.notification,
      requestedAtMicros,
    )).json()).resolves.toEqual({ status: 'awaiting-client' })
    expect(fetchImpl).toHaveBeenCalledOnce()
    const payload = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body)) as {
      notificationId: string
    }
    expect(payload.notificationId).toMatch(/^warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22}$/)
    expect(pendingGrant(h.storage).ticket).toMatch(/^[A-Za-z0-9_-]{43}$/)
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
    expect(response.status).toBe(409)
    expect(await response.text()).toBe('')
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).not.toContain('"delivery"')
    expect(h.storage.values.has(PENDING_GRANT_RECORD)).toBe(false)
    expect(h.storage.values.has(PENDING_GRANT_REISSUE_RECORD)).toBe(false)
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

  it('retains verified consent while outbound delivery is paused', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => successfulDelivery())
    const h = createHarness({
      fetchImpl,
      configReader: () => config(false),
    })

    const enabled = await applyEvent(h.notification, enabledEvent())
    expect(enabled.status).toBe(204)
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).toContain(TOKEN)
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      version: 2,
      systemState: 'paused',
      subscriptionState: 'active',
      activeSubscriptionCount: 1,
      activeClientFids: [9_152],
      deliveryState: 'idle',
    })
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
    await expect((await inspect(h.notification)).json()).resolves.toMatchObject({
      status: 'not-subscribed',
      subscriptionState: 'active',
      activeSubscriptionCount: 1,
      activeClientFids: [9_152],
      grantState: 'none',
      deliveryState: 'idle',
    })
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
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
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

  it('lets an operator replay bring only a legacy transport backoff forward', async () => {
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
    h.storage.values.set(DIAGNOSTICS_RECORD, {
      authEpoch: 7,
      retryReasons: ['transport'],
    })

    await expect((await queue(h.notification)).json()).resolves.toEqual({
      status: 'already-sent',
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
    expect(stored(h.storage)).toContain('"attempts":6')
    expect(stored(h.storage)).toContain('"lastSentAuthEpoch":7')
  })

  it('does not accelerate a current transport retry classification', async () => {
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
          attempts: 1,
          verificationFailures: 0,
          nextAttemptAt: NOW + 30_000,
        }],
      },
    })
    h.storage.values.set(DIAGNOSTICS_RECORD, {
      generation: 'admitted',
      authEpoch: 7,
      retryReasons: ['transport-fetch-rejected'],
      lastAttemptAt: NOW - 30_000,
      lastFailureReason: 'transport-fetch-rejected',
    })

    await expect((await queue(h.notification)).json()).resolves.toEqual({ status: 'queued' })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(stored(h.storage)).toContain('"attempts":1')
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
    expect(stored(h.storage)).toContain('"status":"exhausted"')
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
      version: 2,
      systemState: 'enabled',
      subscriptionState: 'absent',
      status: 'not-subscribed',
      activeSubscriptionCount: 0,
      activeClientFids: [],
      activeAttemptCount: 0,
      pendingAttemptCount: 0,
      retryingAttemptCount: 0,
      sentAttemptCount: 0,
      exhaustedAttemptCount: 0,
      deliveryAttemptCount: 0,
      verificationFailureCount: 0,
      grantState: 'none',
      deliveryState: 'idle',
      retryReasons: [],
    })
    await applyEvent(h.notification, enabledEvent())
    await queue(h.notification)

    const response = await inspect(h.notification)
    expect(response.status).toBe(200)
    const text = await response.text()
    expect(text).not.toContain(TOKEN)
    expect(JSON.parse(text)).toEqual({
      version: 2,
      systemState: 'enabled',
      subscriptionState: 'active',
      status: 'queued',
      generation: 'admitted',
      authEpoch: 7,
      activeSubscriptionCount: 1,
      activeClientFids: [9_152],
      activeAttemptCount: 1,
      pendingAttemptCount: 0,
      retryingAttemptCount: 1,
      sentAttemptCount: 0,
      exhaustedAttemptCount: 0,
      deliveryAttemptCount: 0,
      verificationFailureCount: 1,
      deliveryQueuedAt: NOW,
      deliveryExpiresAt: NOW + 24 * 60 * 60 * 1_000,
      grantState: 'none',
      deliveryState: 'retry-scheduled',
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
      deliveryAttemptCount: 6,
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
