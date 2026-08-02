import { readBridgeConfig, type BridgeConfig } from './config'
import { signEs256Jwt } from './jwt'
import {
  AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  SpacetimeHttpAuthEpochResolver,
} from './spacetimeAuthEpochResolver'
import type {
  AdmissionNotificationQueueStatus,
  AdmissionNotificationStore,
  AuthEpochResolver,
  DurableObjectNamespace,
  DurableObjectState,
  VerifiedMiniAppWebhookEvent,
  WorkerEnv,
} from './types'

const INTERNAL_ORIGIN = 'https://admission-notification.internal'
const STATE_KEY = 'admission-notification-v1'
const STATE_VERSION = 1
const MAX_SUBSCRIPTIONS = 8
const MAX_SEEN_EVENTS = 32
const MAX_REVOKED_TOKEN_IDS = 32
const MAX_DELIVERY_ATTEMPTS = 6
const MAX_VERIFICATION_FAILURES = 64
const DELIVERY_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000
const DELIVERY_TIMEOUT_MILLISECONDS = 8_000
const DELIVERY_RESPONSE_MAX_BYTES = 64 * 1_024
const MAX_NOTIFICATION_TOKEN_BYTES = 2 * 1_024
const SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000
const TARGET_URL = 'https://warpkeep.com/?miniApp=true'
const NOTIFICATION_TITLE = 'The Hegemony admits you'
const NOTIFICATION_BODY = 'Your keep awaits in Genesis 001. Enter the living Realm.'
const RETRY_DELAYS_MILLISECONDS = Object.freeze([
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  12 * 60 * 60_000,
])

type DeliveryAttemptStatus = 'pending' | 'retrying' | 'sent' | 'exhausted'

type Subscription = Readonly<{
  appFid: number
  url: string
  token: string
  tokenId: string
  enabledAt: number
  expiresAt: number
}>

type DeliveryAttempt = Readonly<{
  appFid: number
  tokenId: string
  status: DeliveryAttemptStatus
  attempts: number
  verificationFailures: number
  nextAttemptAt?: number
}>

type AdmissionDelivery = Readonly<{
  authEpoch: number
  queuedAt: number
  expiresAt: number
  attempts: readonly DeliveryAttempt[]
}>

type PersistedNotificationState = Readonly<{
  version: 1
  revision: number
  fid: string
  retentionExpiresAt: number
  subscriptions: readonly Subscription[]
  seenEventIds: readonly string[]
  revokedTokenIds: readonly string[]
  lastSentAuthEpoch?: number
  lastExhaustedAuthEpoch?: number
  delivery?: AdmissionDelivery
}>

type NotificationDependencies = Readonly<{
  fetchImpl?: typeof fetch
  now?: () => number
  configReader?: (env: WorkerEnv) => BridgeConfig
  admissionResolver?: AuthEpochResolver
}>

type DeliveryResult =
  | 'successful'
  | 'invalid'
  | 'retryable'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value)
  return required.every(key => Object.prototype.hasOwnProperty.call(value, key))
    && keys.every(key => required.includes(key) || optional.includes(key))
}

function isSafeFid(value: unknown): value is string {
  if (typeof value !== 'string' || !/^[1-9]\d{0,15}$/.test(value)) return false
  try {
    return BigInt(value) <= BigInt(Number.MAX_SAFE_INTEGER)
  } catch {
    return false
  }
}

function isAppFid(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
}

function isTimestamp(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isAuthEpoch(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 1
    && value <= 0xffff_ffff
}

function isRevision(value: unknown): value is number {
  return typeof value === 'number'
    && Number.isSafeInteger(value)
    && value >= 0
    && value < Number.MAX_SAFE_INTEGER
}

function isEventId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isToken(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const bytes = new TextEncoder().encode(value)
  try {
    return bytes.byteLength >= 16
      && bytes.byteLength <= MAX_NOTIFICATION_TOKEN_BYTES
      && !/[\u0000-\u0020\u007f]/.test(value)
  } finally {
    bytes.fill(0)
  }
}

function isTokenId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
}

function isStoredDeliveryUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length < 1 || value.length > 2_048) return false
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.search === ''
      && url.hash === ''
      && url.toString() === value
  } catch {
    return false
  }
}

function isDeliveryStatus(value: unknown): value is DeliveryAttemptStatus {
  return value === 'pending'
    || value === 'retrying'
    || value === 'sent'
    || value === 'exhausted'
}

function readSubscription(value: unknown): Subscription | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['appFid', 'url', 'token', 'tokenId', 'enabledAt', 'expiresAt'])
    || !isAppFid(value.appFid)
    || !isStoredDeliveryUrl(value.url)
    || !isToken(value.token)
    || !isTokenId(value.tokenId)
    || !isTimestamp(value.enabledAt)
    || !isTimestamp(value.expiresAt)
    || value.expiresAt <= value.enabledAt
    || value.expiresAt - value.enabledAt !== SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS
  ) {
    return null
  }
  return Object.freeze({
    appFid: value.appFid,
    url: value.url,
    token: value.token,
    tokenId: value.tokenId,
    enabledAt: value.enabledAt,
    expiresAt: value.expiresAt,
  })
}

function readAttempt(value: unknown): DeliveryAttempt | null {
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      ['appFid', 'tokenId', 'status', 'attempts'],
      ['nextAttemptAt', 'verificationFailures'],
    )
    || !isAppFid(value.appFid)
    || !isTokenId(value.tokenId)
    || !isDeliveryStatus(value.status)
    || typeof value.attempts !== 'number'
    || !Number.isSafeInteger(value.attempts)
    || value.attempts < 0
    || value.attempts > MAX_DELIVERY_ATTEMPTS
    || (value.verificationFailures !== undefined && (
      typeof value.verificationFailures !== 'number'
      || !Number.isSafeInteger(value.verificationFailures)
      || value.verificationFailures < 0
      || value.verificationFailures > MAX_VERIFICATION_FAILURES
    ))
    || (value.nextAttemptAt !== undefined && !isTimestamp(value.nextAttemptAt))
    || (value.status === 'retrying') !== (value.nextAttemptAt !== undefined)
  ) {
    return null
  }
  return Object.freeze({
    appFid: value.appFid,
    tokenId: value.tokenId,
    status: value.status,
    attempts: value.attempts,
    verificationFailures: value.verificationFailures ?? 0,
    ...(value.nextAttemptAt === undefined ? {} : { nextAttemptAt: value.nextAttemptAt }),
  })
}

function readDelivery(value: unknown): AdmissionDelivery | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['authEpoch', 'queuedAt', 'expiresAt', 'attempts'])
    || !isAuthEpoch(value.authEpoch)
    || !isTimestamp(value.queuedAt)
    || !isTimestamp(value.expiresAt)
    || value.expiresAt <= value.queuedAt
    || value.expiresAt - value.queuedAt !== DELIVERY_LIFETIME_MILLISECONDS
    || !Array.isArray(value.attempts)
    || value.attempts.length > MAX_SUBSCRIPTIONS
  ) {
    return null
  }
  const attempts = value.attempts.map(readAttempt)
  if (
    attempts.some(attempt => attempt === null)
    || new Set(attempts.map(attempt => attempt!.appFid)).size !== attempts.length
  ) {
    return null
  }
  return Object.freeze({
    authEpoch: value.authEpoch,
    queuedAt: value.queuedAt,
    expiresAt: value.expiresAt,
    attempts: Object.freeze(attempts as DeliveryAttempt[]),
  })
}

function readState(value: unknown): PersistedNotificationState | null {
  if (value === undefined) return null
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        'version',
        'revision',
        'fid',
        'retentionExpiresAt',
        'subscriptions',
        'seenEventIds',
        'revokedTokenIds',
      ],
      ['delivery', 'lastSentAuthEpoch', 'lastExhaustedAuthEpoch'],
    )
    || value.version !== STATE_VERSION
    || !isRevision(value.revision)
    || !isSafeFid(value.fid)
    || !isTimestamp(value.retentionExpiresAt)
    || !Array.isArray(value.subscriptions)
    || value.subscriptions.length > MAX_SUBSCRIPTIONS
    || !Array.isArray(value.seenEventIds)
    || value.seenEventIds.length > MAX_SEEN_EVENTS
    || value.seenEventIds.some(id => !isEventId(id))
    || new Set(value.seenEventIds).size !== value.seenEventIds.length
    || !Array.isArray(value.revokedTokenIds)
    || value.revokedTokenIds.length > MAX_REVOKED_TOKEN_IDS
    || value.revokedTokenIds.some(id => !isTokenId(id))
    || new Set(value.revokedTokenIds).size !== value.revokedTokenIds.length
    || (value.lastSentAuthEpoch !== undefined && !isAuthEpoch(value.lastSentAuthEpoch))
    || (value.lastExhaustedAuthEpoch !== undefined && !isAuthEpoch(value.lastExhaustedAuthEpoch))
  ) {
    throw new Error('Invalid admission notification state.')
  }
  const subscriptions = value.subscriptions.map(readSubscription)
  if (
    subscriptions.some(subscription => subscription === null)
    || new Set(subscriptions.map(subscription => subscription!.appFid)).size
      !== subscriptions.length
  ) {
    throw new Error('Invalid admission notification state.')
  }
  const delivery = value.delivery === undefined ? undefined : readDelivery(value.delivery)
  if (value.delivery !== undefined && !delivery) {
    throw new Error('Invalid admission notification state.')
  }
  return Object.freeze({
    version: 1,
    revision: value.revision,
    fid: value.fid,
    retentionExpiresAt: value.retentionExpiresAt,
    subscriptions: Object.freeze(subscriptions as Subscription[]),
    seenEventIds: Object.freeze([...value.seenEventIds] as string[]),
    revokedTokenIds: Object.freeze([...value.revokedTokenIds] as string[]),
    ...(value.lastSentAuthEpoch === undefined
      ? {}
      : { lastSentAuthEpoch: value.lastSentAuthEpoch }),
    ...(value.lastExhaustedAuthEpoch === undefined
      ? {}
      : { lastExhaustedAuthEpoch: value.lastExhaustedAuthEpoch }),
    ...(delivery ? { delivery } : {}),
  })
}

function emptyState(fid: string, now: number): PersistedNotificationState {
  return Object.freeze({
    version: 1,
    revision: 0,
    fid,
    retentionExpiresAt: now + SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS,
    subscriptions: Object.freeze([]),
    seenEventIds: Object.freeze([]),
    revokedTokenIds: Object.freeze([]),
  })
}

async function tokenId(token: string): Promise<string> {
  const bytes = new TextEncoder().encode(`warpkeep-notification-token-v1\0${token}`)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    bytes.fill(0)
  }
}

async function objectName(fid: string): Promise<string> {
  const bytes = new TextEncoder().encode(`warpkeep-admission-notification-v1\0${fid}`)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return `warpkeep-admission-notification:v1:${Array.from(
      digest,
      byte => byte.toString(16).padStart(2, '0'),
    ).join('')}`
  } finally {
    bytes.fill(0)
  }
}

function internalUrl(path: 'event' | 'queue'): string {
  return `${INTERNAL_ORIGIN}/${path}`
}

async function readQueueStatus(response: Response): Promise<AdmissionNotificationQueueStatus> {
  if (!response.ok) throw new Error('Admission notification store unavailable.')
  const value: unknown = await response.json()
  if (
    !isRecord(value)
    || !exactKeys(value, ['status'])
    || (
      value.status !== 'queued'
      && value.status !== 'already-sent'
      && value.status !== 'delivery-exhausted'
      && value.status !== 'not-subscribed'
    )
  ) {
    throw new Error('Admission notification store returned invalid state.')
  }
  return value.status
}

export class DurableObjectAdmissionNotificationStore implements AdmissionNotificationStore {
  constructor(private readonly namespace: DurableObjectNamespace) {}

  private async stub(fid: string) {
    const id = this.namespace.idFromName(await objectName(fid))
    return this.namespace.get(id)
  }

  async applyEvent(event: VerifiedMiniAppWebhookEvent): Promise<void> {
    const response = await (await this.stub(event.fid)).fetch(internalUrl('event'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(event),
    })
    if (response.status !== 204) {
      throw new Error('Admission notification store unavailable.')
    }
  }

  async queueAdmission(input: Readonly<{
    fid: string
    authEpoch: number
    queuedAt: number
  }>): Promise<AdmissionNotificationQueueStatus> {
    const response = await (await this.stub(input.fid)).fetch(internalUrl('queue'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return readQueueStatus(response)
  }
}

function configuredClient(config: BridgeConfig, appFid: number, url: string): boolean {
  return config.miniAppNotifications?.clients.some(client => (
    client.appFid === appFid && client.deliveryUrl === url
  )) === true
}

function configuredAppFid(config: BridgeConfig, appFid: number): boolean {
  return config.miniAppNotifications?.clients.some(client => client.appFid === appFid) === true
}

function validVerifiedEvent(value: unknown, config: BridgeConfig): value is VerifiedMiniAppWebhookEvent {
  if (
    !isRecord(value)
    || !exactKeys(value, ['eventId', 'fid', 'appFid', 'event'])
    || !isEventId(value.eventId)
    || !isSafeFid(value.fid)
    || !isAppFid(value.appFid)
    || !isRecord(value.event)
  ) {
    return false
  }
  if (value.event.type === 'disabled') {
    // A retired client FID may still send the final signed opt-out required to
    // erase its old token. The event path below is a no-op unless that exact
    // app FID already owns persisted state.
    return exactKeys(value.event, ['type'])
  }
  if (value.event.type === 'observed') {
    return configuredAppFid(config, value.appFid) && exactKeys(value.event, ['type'])
  }
  return value.event.type === 'enabled'
    && exactKeys(value.event, ['type', 'details'])
    && isRecord(value.event.details)
    && exactKeys(value.event.details, ['token', 'url'])
    && isToken(value.event.details.token)
    && typeof value.event.details.url === 'string'
    && configuredClient(config, value.appFid, value.event.details.url)
}

function validQueueInput(value: unknown): value is Readonly<{
  fid: string
  authEpoch: number
  queuedAt: number
}> {
  return isRecord(value)
    && exactKeys(value, ['fid', 'authEpoch', 'queuedAt'])
    && isSafeFid(value.fid)
    && isAuthEpoch(value.authEpoch)
    && isTimestamp(value.queuedAt)
}

function withSeenEvent(
  state: PersistedNotificationState,
  eventId: string,
): PersistedNotificationState {
  if (state.seenEventIds.includes(eventId)) return state
  return Object.freeze({
    ...state,
    seenEventIds: Object.freeze([
      ...state.seenEventIds.slice(-(MAX_SEEN_EVENTS - 1)),
      eventId,
    ]),
  })
}

function withRevokedTokenIds(
  state: PersistedNotificationState,
  tokenIds: readonly string[],
): PersistedNotificationState {
  const revokedTokenIds = [...state.revokedTokenIds]
  for (const id of tokenIds) {
    if (!revokedTokenIds.includes(id)) revokedTokenIds.push(id)
  }
  return Object.freeze({
    ...state,
    revokedTokenIds: Object.freeze(revokedTokenIds.slice(-MAX_REVOKED_TOKEN_IDS)),
  })
}

function withNextRevision(state: PersistedNotificationState): PersistedNotificationState {
  if (state.revision >= Number.MAX_SAFE_INTEGER - 1) {
    throw new Error('Admission notification revision exhausted.')
  }
  return Object.freeze({ ...state, revision: state.revision + 1 })
}

function pruneSubscriptions(
  state: PersistedNotificationState,
  config: BridgeConfig,
  now: number,
): PersistedNotificationState {
  const subscriptions = state.subscriptions.filter(subscription => (
    subscription.expiresAt > now
    && configuredClient(config, subscription.appFid, subscription.url)
  ))
  if (subscriptions.length === state.subscriptions.length) return state
  const liveTokenIds = new Set(subscriptions.map(subscription => subscription.tokenId))
  const removedTokenIds = state.subscriptions
    .filter(subscription => !liveTokenIds.has(subscription.tokenId))
    .map(subscription => subscription.tokenId)
  const withTombstones = withRevokedTokenIds(state, removedTokenIds)
  return Object.freeze({
    ...withTombstones,
    subscriptions: Object.freeze(subscriptions),
    ...(state.delivery
      ? {
          delivery: Object.freeze({
            ...state.delivery,
            attempts: Object.freeze(state.delivery.attempts.filter(attempt => (
              liveTokenIds.has(attempt.tokenId)
            ))),
          }),
        }
      : {}),
  })
}

function attemptsForSubscriptions(
  delivery: AdmissionDelivery,
  subscriptions: readonly Subscription[],
): readonly DeliveryAttempt[] {
  return Object.freeze(subscriptions.map(subscription => {
    const existing = delivery.attempts.find(attempt => attempt.appFid === subscription.appFid)
    if (existing?.status === 'sent') return existing
    if (existing?.tokenId === subscription.tokenId) {
      return existing
    }
    return Object.freeze({
      appFid: subscription.appFid,
      tokenId: subscription.tokenId,
      status: 'pending' as const,
      attempts: 0,
      verificationFailures: 0,
    })
  }))
}

function nextAlarmAt(state: PersistedNotificationState, now: number): number | null {
  const delivery = state.delivery
  const subscriptionExpiries = [
    ...state.subscriptions.map(subscription => subscription.expiresAt),
    state.retentionExpiresAt,
  ]
  if (!delivery) {
    return subscriptionExpiries.length > 0 ? Math.min(...subscriptionExpiries) : null
  }
  if (now >= delivery.expiresAt) return now
  if (delivery.attempts.some(attempt => attempt.status === 'pending')) return now
  const candidates = delivery.attempts.flatMap(attempt => (
    attempt.status === 'retrying' && attempt.nextAttemptAt !== undefined
      ? [attempt.nextAttemptAt]
      : []
  ))
  return Math.min(...candidates, ...subscriptionExpiries, delivery.expiresAt)
}

async function persistAndSchedule(
  storage: DurableObjectState['storage'],
  state: PersistedNotificationState,
  now: number,
): Promise<void> {
  await storage.put(STATE_KEY, state)
  const alarmAt = nextAlarmAt(state, now)
  if (alarmAt === null) await storage.deleteAlarm?.()
  else await storage.setAlarm(alarmAt)
}

async function purgePersistedState(storage: DurableObjectState['storage']): Promise<void> {
  await storage.deleteAlarm?.()
  await storage.deleteAll()
}

function notificationId(authEpoch: number): string {
  return `warpkeep-access-approved-v1-e${authEpoch}`
}

async function boundedDeliveryJson(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Invalid notification response.')
  const contentType = response.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    throw new Error('Invalid notification response.')
  }
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > DELIVERY_RESPONSE_MAX_BYTES)) {
    throw new Error('Invalid notification response.')
  }
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > DELIVERY_RESPONSE_MAX_BYTES) {
        try { await reader.cancel() } catch { /* Fail closed below. */ }
        throw new Error('Invalid notification response.')
      }
      chunks.push(value)
    }
  } finally {
    try { reader.releaseLock() } catch { /* Reader cleanup is best effort. */ }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
}

function tokenArray(value: unknown, requestedToken: string): boolean {
  return Array.isArray(value)
    && value.length <= 1
    && value.every(token => token === requestedToken)
}

function deliveryResult(value: unknown, requestedToken: string): DeliveryResult | null {
  if (!isRecord(value) || !exactKeys(value, ['result']) || !isRecord(value.result)) {
    return null
  }
  const result = value.result
  if (!exactKeys(
    result,
    ['successfulTokens', 'invalidTokens', 'rateLimitedTokens'],
    ['failedTokens'],
  )) return null
  if (
    !tokenArray(result.successfulTokens, requestedToken)
    || !tokenArray(result.invalidTokens, requestedToken)
    || !tokenArray(result.rateLimitedTokens, requestedToken)
  ) return null
  const successful = (result.successfulTokens as unknown[]).length
  const invalid = (result.invalidTokens as unknown[]).length
  const rateLimited = (result.rateLimitedTokens as unknown[]).length
  let failed: 'invalid' | 'retryable' | null = null
  if (result.failedTokens !== undefined) {
    if (!Array.isArray(result.failedTokens) || result.failedTokens.length > 1) return null
    if (result.failedTokens.length === 1) {
      const entry = result.failedTokens[0]
      if (
        !isRecord(entry)
        || !exactKeys(entry, ['token', 'reason'], ['fid'])
        || entry.token !== requestedToken
        || (
          entry.reason !== 'domain_mismatch'
          && entry.reason !== 'target_url_mismatch'
          && entry.reason !== 'no_webhook_url'
          && entry.reason !== 'invalid_token'
          && entry.reason !== 'unknown'
        )
        || (entry.fid !== undefined && !isAppFid(entry.fid))
      ) return null
      failed = entry.reason === 'unknown' ? 'retryable' : 'invalid'
    }
  }
  const categories = successful + invalid + rateLimited + (failed ? 1 : 0)
  if (categories !== 1) return null
  if (successful === 1) return 'successful'
  if (invalid === 1 || failed === 'invalid') return 'invalid'
  return 'retryable'
}

async function sendOne(
  subscription: Subscription,
  delivery: AdmissionDelivery,
  fetchImpl: typeof fetch,
): Promise<DeliveryResult> {
  let response: Response
  try {
    response = await fetchImpl(subscription.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        notificationId: notificationId(delivery.authEpoch),
        title: NOTIFICATION_TITLE,
        body: NOTIFICATION_BODY,
        targetUrl: TARGET_URL,
        tokens: [subscription.token],
      }),
      cache: 'no-store',
      redirect: 'error',
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MILLISECONDS),
    })
  } catch {
    return 'retryable'
  }
  if (!response.ok) return 'retryable'
  try {
    return deliveryResult(
      await boundedDeliveryJson(response),
      subscription.token,
    ) ?? 'retryable'
  } catch {
    return 'retryable'
  }
}

function retryAttempt(
  attempt: DeliveryAttempt,
  now: number,
  expiresAt: number,
): DeliveryAttempt {
  const attempts = attempt.attempts + 1
  if (attempts >= MAX_DELIVERY_ATTEMPTS) {
    return Object.freeze({
      ...attempt,
      status: 'exhausted',
      attempts,
      verificationFailures: 0,
      nextAttemptAt: undefined,
    })
  }
  const delay = RETRY_DELAYS_MILLISECONDS[Math.min(
    attempts - 1,
    RETRY_DELAYS_MILLISECONDS.length - 1,
  )]
  const nextAttemptAt = Math.min(expiresAt, now + delay)
  return Object.freeze({
    ...attempt,
    status: 'retrying',
    attempts,
    verificationFailures: 0,
    nextAttemptAt,
  })
}

function deferForAdmissionVerification(
  attempt: DeliveryAttempt,
  now: number,
  expiresAt: number,
): DeliveryAttempt {
  const verificationFailures = Math.min(
    MAX_VERIFICATION_FAILURES,
    attempt.verificationFailures + 1,
  )
  const delay = RETRY_DELAYS_MILLISECONDS[Math.min(
    verificationFailures - 1,
    RETRY_DELAYS_MILLISECONDS.length - 1,
  )]
  return Object.freeze({
    ...attempt,
    status: 'retrying',
    verificationFailures,
    nextAttemptAt: Math.min(expiresAt, now + delay),
  })
}

function queueStatus(state: PersistedNotificationState): AdmissionNotificationQueueStatus {
  if (
    state.delivery
    && state.lastSentAuthEpoch !== undefined
    && state.lastSentAuthEpoch >= state.delivery.authEpoch
  ) return 'already-sent'
  if (
    state.delivery
    && state.lastExhaustedAuthEpoch !== undefined
    && state.lastExhaustedAuthEpoch >= state.delivery.authEpoch
  ) return 'delivery-exhausted'
  if (!state.delivery || state.subscriptions.length === 0) return 'not-subscribed'
  if (
    state.delivery.attempts.length > 0
    && state.delivery.attempts.every(attempt => attempt.status === 'sent')
  ) return 'already-sent'
  if (
    state.delivery.attempts.length > 0
    && state.delivery.attempts.every(attempt => (
      attempt.status === 'sent' || attempt.status === 'exhausted'
    ))
  ) return 'delivery-exhausted'
  return 'queued'
}

function defaultAdmissionResolver(config: BridgeConfig): AuthEpochResolver {
  return new SpacetimeHttpAuthEpochResolver({
    uri: config.spacetimeDbUri,
    database: config.spacetimeDbDatabase,
    issuer: config.issuer,
    audience: config.audience,
    timeoutMs: AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  }, {
    signer: claims => signEs256Jwt(config, claims),
  })
}

export class AdmissionNotification {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly configReader: (env: WorkerEnv) => BridgeConfig
  private readonly configuredAdmissionResolver?: AuthEpochResolver
  private operationTail: Promise<void> = Promise.resolve()

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: WorkerEnv,
    dependencies: NotificationDependencies = {},
  ) {
    this.fetchImpl = dependencies.fetchImpl ?? fetch
    this.now = dependencies.now ?? Date.now
    this.configReader = dependencies.configReader ?? readBridgeConfig
    this.configuredAdmissionResolver = dependencies.admissionResolver
  }

  private config(): BridgeConfig {
    const config = this.configReader(this.env)
    if (!config.miniAppNotifications) {
      throw new Error('Admission notifications are disabled.')
    }
    return config
  }

  private currentTime(): number {
    const now = this.now()
    if (!isTimestamp(now)) throw new Error('Invalid notification clock.')
    return now
  }

  private async serialized<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail
    let release!: () => void
    this.operationTail = new Promise<void>(resolve => {
      release = resolve
    })
    await previous
    try {
      return await operation()
    } finally {
      release()
    }
  }

  private async attemptDelivery(state: PersistedNotificationState): Promise<PersistedNotificationState> {
    const now = this.currentTime()
    const config = this.config()
    const pruned = pruneSubscriptions(state, config, now)
    const delivery = pruned.delivery
    if (!delivery) {
      if (pruned === state) return state
      const next = withNextRevision(pruned)
      await persistAndSchedule(this.state.storage, next, now)
      return next
    }
    if (now >= delivery.expiresAt) {
      const exhausted = delivery.attempts.some(attempt => attempt.status === 'exhausted')
      const next = withNextRevision(Object.freeze({
        ...pruned,
        delivery: undefined,
        ...(exhausted
          ? {
              lastExhaustedAuthEpoch: Math.max(
                pruned.lastExhaustedAuthEpoch ?? 0,
                delivery.authEpoch,
              ),
            }
          : {}),
      }))
      await persistAndSchedule(this.state.storage, next, now)
      return next
    }

    if (!config.approvalNotificationsEnabled) {
      // The kill switch invalidates every queued delivery generation. Consent
      // remains revocable through signed disable webhooks, but no stale queue
      // can spring back to life when delivery is enabled again.
      const next = withNextRevision(Object.freeze({ ...pruned, delivery: undefined }))
      await persistAndSchedule(this.state.storage, next, now)
      return next
    }

    // Persisted data is never trusted as an outbound destination. Reapply the
    // current deployment allowlist immediately before every network request.
    let subscriptions = [...pruned.subscriptions]
    let nextBase = pruned
    const attempts: DeliveryAttempt[] = []
    const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
    for (const attempt of delivery.attempts) {
      const subscription = subscriptions.find(candidate => (
        candidate.appFid === attempt.appFid && candidate.tokenId === attempt.tokenId
      ))
      if (!subscription) continue
      if (
        attempt.status === 'sent'
        || attempt.status === 'exhausted'
        || (attempt.status === 'retrying' && attempt.nextAttemptAt! > now)
      ) {
        attempts.push(attempt)
        continue
      }

      // Defense in depth for storage corruption or a configuration swap while
      // a delivery generation is active.
      if (!configuredClient(config, subscription.appFid, subscription.url)) continue
      const latest = readState(await this.state.storage.get<unknown>(STATE_KEY))
      if (!latest || latest.revision !== state.revision) {
        return latest ?? emptyState(state.fid, now)
      }
      let admitted = false
      try {
        const admission = await resolver.resolve(state.fid)
        admitted = admission.state === 'enabled' && admission.authEpoch === delivery.authEpoch
      } catch {
        // Resolver availability is not a Farcaster delivery attempt. Back it
        // off separately so an upstream outage cannot permanently exhaust the
        // admission epoch before any notification request is made.
        attempts.push(deferForAdmissionVerification(attempt, now, delivery.expiresAt))
        continue
      }
      const afterAdmissionCheck = readState(await this.state.storage.get<unknown>(STATE_KEY))
      if (!afterAdmissionCheck || afterAdmissionCheck.revision !== state.revision) {
        return afterAdmissionCheck ?? emptyState(state.fid, now)
      }
      if (!admitted) {
        const cancelled = withNextRevision(Object.freeze({
          ...afterAdmissionCheck,
          delivery: undefined,
        }))
        await persistAndSchedule(this.state.storage, cancelled, now)
        return cancelled
      }
      const result = await sendOne(subscription, delivery, this.fetchImpl)
      if (result === 'successful') {
        attempts.push(Object.freeze({
          ...attempt,
          status: 'sent',
          attempts: attempt.attempts + 1,
          verificationFailures: 0,
          nextAttemptAt: undefined,
        }))
      } else if (result === 'invalid') {
        subscriptions = subscriptions.filter(candidate => candidate.appFid !== attempt.appFid)
        nextBase = withRevokedTokenIds(nextBase, [attempt.tokenId])
      } else {
        attempts.push(retryAttempt(attempt, now, delivery.expiresAt))
      }
    }
    const current = readState(await this.state.storage.get<unknown>(STATE_KEY))
    if (!current || current.revision !== state.revision) {
      // A disable/remove or newer enable/queue event won the race while the
      // network request was in flight. Never resurrect or overwrite it.
      return current ?? emptyState(state.fid, now)
    }
    const next = withNextRevision(Object.freeze({
      ...nextBase,
      subscriptions: Object.freeze(subscriptions),
      delivery: Object.freeze({ ...delivery, attempts: Object.freeze(attempts) }),
      ...(attempts.length > 0 && attempts.every(attempt => attempt.status === 'sent')
        ? {
            lastSentAuthEpoch: Math.max(
              nextBase.lastSentAuthEpoch ?? 0,
              delivery.authEpoch,
            ),
          }
        : {}),
      ...(attempts.length > 0
        && attempts.some(attempt => attempt.status === 'exhausted')
        && attempts.every(attempt => (
          attempt.status === 'sent' || attempt.status === 'exhausted'
        ))
        ? {
            lastExhaustedAuthEpoch: Math.max(
              nextBase.lastExhaustedAuthEpoch ?? 0,
              delivery.authEpoch,
            ),
          }
        : {}),
    }))
    // Keep a token-free queued admission until its bounded expiry. This closes
    // the legitimate race where Hermes commits admission just before the host's
    // notification-enabled webhook reaches us; a later enable event can still
    // attach its one delivery attempt. Explicit disable/remove events erase raw
    // token material immediately in the event path below.
    await persistAndSchedule(this.state.storage, next, now)
    return next
  }

  async fetch(request: Request): Promise<Response> {
    return this.serialized(() => this.handleFetch(request))
  }

  private async handleFetch(request: Request): Promise<Response> {
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return new Response(null, { status: 404 })
    }
    if (
      url.origin !== INTERNAL_ORIGIN
      || request.method !== 'POST'
      || request.headers.get('content-type') !== 'application/json'
      || url.search
    ) {
      return new Response(null, { status: 404 })
    }

    let value: unknown
    try {
      value = await request.json()
    } catch {
      return new Response(null, { status: 400 })
    }
    let config: BridgeConfig
    try {
      config = this.config()
    } catch {
      return new Response(null, { status: 503 })
    }

    if (url.pathname === '/event') {
      if (!validVerifiedEvent(value, config)) return new Response(null, { status: 400 })
      // An add event without notification details records no consent and must
      // not cause the player FID or any host metadata to be persisted.
      if (value.event.type === 'observed') return new Response(null, { status: 204 })
      if (value.event.type === 'enabled' && !config.approvalNotificationsEnabled) {
        return new Response(null, { status: 503 })
      }
      const now = this.currentTime()
      const existing = readState(await this.state.storage.get<unknown>(STATE_KEY))
      if (existing && existing.fid !== value.fid) return new Response(null, { status: 409 })
      if (
        value.event.type === 'disabled'
        && (!existing || !existing.subscriptions.some(candidate => candidate.appFid === value.appFid))
      ) {
        return new Response(null, { status: 204 })
      }
      let next = existing ?? emptyState(value.fid, now)
      if (next.seenEventIds.includes(value.eventId)) return new Response(null, { status: 204 })
      next = withSeenEvent(next, value.eventId)

      if (value.event.type === 'enabled') {
        const id = await tokenId(value.event.details.token)
        if (next.revokedTokenIds.includes(id)) {
          next = withNextRevision(next)
          await persistAndSchedule(this.state.storage, next, now)
          return new Response(null, { status: 204 })
        }
        const subscription = Object.freeze({
          appFid: value.appFid,
          url: value.event.details.url,
          token: value.event.details.token,
          tokenId: id,
          enabledAt: now,
          expiresAt: now + SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS,
        })
        const subscriptions = Object.freeze([
          ...next.subscriptions.filter(candidate => candidate.appFid !== value.appFid),
          subscription,
        ].sort((left, right) => left.appFid - right.appFid))
        next = Object.freeze({
          ...next,
          retentionExpiresAt: Math.max(
            next.retentionExpiresAt,
            now + SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS,
          ),
          subscriptions,
          ...(next.delivery
            ? {
                delivery: Object.freeze({
                  ...next.delivery,
                  attempts: attemptsForSubscriptions(next.delivery, subscriptions),
                }),
              }
            : {}),
        })
      } else if (value.event.type === 'disabled') {
        const removedTokenIds = next.subscriptions
          .filter(candidate => candidate.appFid === value.appFid)
          .map(candidate => candidate.tokenId)
        next = withRevokedTokenIds(next, removedTokenIds)
        const subscriptions = Object.freeze(
          next.subscriptions.filter(candidate => candidate.appFid !== value.appFid),
        )
        next = Object.freeze({
          ...next,
          retentionExpiresAt: Math.max(
            next.retentionExpiresAt,
            now + SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS,
          ),
          subscriptions,
          ...(next.delivery && subscriptions.length > 0
            ? {
                delivery: Object.freeze({
                  ...next.delivery,
                  attempts: Object.freeze(
                    next.delivery.attempts.filter(attempt => attempt.appFid !== value.appFid),
                  ),
                }),
              }
            : { delivery: undefined }),
        })
      }

      next = withNextRevision(next)
      await persistAndSchedule(this.state.storage, next, now)
      if (value.event.type === 'enabled' && next.delivery) {
        await this.attemptDelivery(next)
      }
      return new Response(null, { status: 204 })
    }

    if (url.pathname === '/queue') {
      if (!validQueueInput(value)) return new Response(null, { status: 400 })
      if (!config.approvalNotificationsEnabled) return new Response(null, { status: 503 })
      const now = this.currentTime()
      if (Math.abs(now - value.queuedAt) > 60_000) return new Response(null, { status: 400 })
      const existing = readState(await this.state.storage.get<unknown>(STATE_KEY))
      if (existing && existing.fid !== value.fid) return new Response(null, { status: 409 })
      let next = existing ?? emptyState(value.fid, now)
      if (next.lastSentAuthEpoch !== undefined && value.authEpoch <= next.lastSentAuthEpoch) {
        return new Response(JSON.stringify({ status: 'already-sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        next.lastExhaustedAuthEpoch !== undefined
        && value.authEpoch <= next.lastExhaustedAuthEpoch
      ) {
        return new Response(JSON.stringify({ status: 'delivery-exhausted' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (next.delivery && value.authEpoch < next.delivery.authEpoch) {
        return new Response(null, { status: 409 })
      }
      if (!next.delivery || value.authEpoch > next.delivery.authEpoch) {
        const delivery: AdmissionDelivery = Object.freeze({
          authEpoch: value.authEpoch,
          queuedAt: value.queuedAt,
          expiresAt: value.queuedAt + DELIVERY_LIFETIME_MILLISECONDS,
          attempts: Object.freeze([]),
        })
        next = Object.freeze({
          ...next,
          delivery: Object.freeze({
            ...delivery,
            attempts: attemptsForSubscriptions(delivery, next.subscriptions),
          }),
        })
      } else {
        next = Object.freeze({
          ...next,
          delivery: Object.freeze({
            ...next.delivery,
            attempts: attemptsForSubscriptions(next.delivery, next.subscriptions),
          }),
        })
      }
      next = withNextRevision(next)
      await persistAndSchedule(this.state.storage, next, now)
      next = await this.attemptDelivery(next)
      return new Response(JSON.stringify({ status: queueStatus(next) }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }

    return new Response(null, { status: 404 })
  }

  async alarm(): Promise<void> {
    await this.serialized(() => this.handleAlarm())
  }

  private async handleAlarm(): Promise<void> {
    const state = readState(await this.state.storage.get<unknown>(STATE_KEY))
    if (!state) {
      await purgePersistedState(this.state.storage)
      return
    }
    const now = this.currentTime()
    if (now >= state.retentionExpiresAt) {
      await purgePersistedState(this.state.storage)
      return
    }
    try {
      this.config()
    } catch {
      // Configuration loss can suppress delivery but never unbound cleanup.
      await this.state.storage.setAlarm(state.retentionExpiresAt)
      return
    }
    const next = await this.attemptDelivery(state)
    if (
      !next.delivery
      && next.subscriptions.length === 0
      && next.revokedTokenIds.length === 0
      && next.lastSentAuthEpoch === undefined
      && next.lastExhaustedAuthEpoch === undefined
    ) {
      await purgePersistedState(this.state.storage)
    }
  }
}
