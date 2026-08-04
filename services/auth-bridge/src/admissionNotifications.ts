import { readBridgeConfig, type BridgeConfig } from './config'
import { randomId, signEs256Jwt } from './jwt'
import {
  AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  SpacetimeHttpAuthEpochResolver,
} from './spacetimeAuthEpochResolver'
import {
  ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS,
  SpacetimeHttpAccessRequestResolver,
} from './spacetimeAccessRequestResolver'
import type {
  AccessRequestResolver,
  AdmissionNotificationAcknowledgementStatus,
  AdmissionNotificationGeneration,
  AdmissionNotificationQueueInput,
  AdmissionNotificationQueueStatus,
  AdmissionNotificationReissueInput,
  AdmissionNotificationReissueResult,
  AdmissionNotificationDiagnostics,
  AdmissionNotificationRetryReason,
  AdmissionNotificationStore,
  AuthEpochResolver,
  DurableObjectNamespace,
  DurableObjectState,
  VerifiedMiniAppWebhookEvent,
  WorkerEnv,
} from './types'

const INTERNAL_ORIGIN = 'https://admission-notification.internal'
const STATE_KEY = 'admission-notification-v1'
const PENDING_STATE_RECORD = 'admission-notification-pending-v2'
const PENDING_GRANT_RECORD = 'admission-notification-grant-v3'
const PENDING_GRANT_REISSUE_RECORD = 'admission-notification-grant-reissue-v1'
const DIAGNOSTICS_RECORD = 'admission-notification-diagnostics-v1'
const STATE_VERSION = 1
const MAX_SUBSCRIPTIONS = 8
const MAX_SEEN_EVENTS = 32
const MAX_REVOKED_TOKEN_IDS = 32
const MAX_DELIVERY_ATTEMPTS = 6
const MAX_VERIFICATION_FAILURES = 64
const MAX_PENDING_GRANT_REISSUES = 2
const DELIVERY_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000
const PENDING_GRANT_REISSUE_COOLDOWN_MILLISECONDS = 5 * 60 * 1_000
const DELIVERY_TIMEOUT_MILLISECONDS = 15_000
const DELIVERY_RESPONSE_MAX_BYTES = 64 * 1_024
const MAX_NOTIFICATION_TOKEN_BYTES = 2 * 1_024
const SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000
const TARGET_URL = 'https://warpkeep.com/?miniApp=true'
const GRANT_TARGET_FRAGMENT = 'warpkeep-grant-v1'
const HEGEMONY_WELCOME_NOTIFICATION_TITLE = 'Welcome to the Hegemony Empire'
const HEGEMONY_WELCOME_NOTIFICATION_BODY =
  'The gates have answered your name. Cross the threshold, Founder—your legacy awaits.'
const RETRY_DELAYS_MILLISECONDS = Object.freeze([
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  12 * 60 * 60_000,
])
const LEGACY_TRANSPORT_RETRY_MINIMUM_AGE_MILLISECONDS = 30_000

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

type PersistedNotificationDiagnostics = Readonly<{
  generation: AdmissionNotificationGeneration
  retryReasons: readonly AdmissionNotificationRetryReason[]
  deliveryAttemptCount: number
  verificationFailureCount: number
  lastAttemptAt?: number
  lastFailureReason?: AdmissionNotificationRetryReason
}>

type AdmissionDelivery = Readonly<{
  queuedAt: number
  expiresAt: number
  attempts: readonly DeliveryAttempt[]
}> & AdmissionNotificationGeneration

type LegacyPersistedNotificationState = Readonly<{
  version: 1
  revision: number
  fid: string
  retentionExpiresAt: number
  subscriptions: readonly Subscription[]
  seenEventIds: readonly string[]
  revokedTokenIds: readonly string[]
  lastSentAuthEpoch?: number
  lastExhaustedAuthEpoch?: number
  delivery?: Readonly<{
    authEpoch: number
    queuedAt: number
    expiresAt: number
    attempts: readonly DeliveryAttempt[]
  }>
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
  lastSentRequestAtMicros?: number
  lastExhaustedRequestAtMicros?: number
  delivery?: AdmissionDelivery
}>

type PersistedPendingNotificationState = Readonly<{
  version: 1
  fid: string
  lastSentRequestAtMicros?: number
  lastExhaustedRequestAtMicros?: number
  delivery?: Readonly<{
    requestedAtMicros: number
    queuedAt: number
    expiresAt: number
    attempts: readonly DeliveryAttempt[]
  }>
}>

type PendingGrantIntentBase = Readonly<{
  version: 1
  fid: string
  requestedAtMicros: number
  intentId: string
  createdAt: number
  expiresAt: number
}>

type PersistedPendingGrantIntent = PendingGrantIntentBase & (
  | Readonly<{
      ticket: string
      ticketHash?: never
      providerAcceptedAt?: number
      acknowledgedAt?: never
    }>
  | Readonly<{
      ticket?: never
      ticketHash: string
      providerAcceptedAt: number
      acknowledgedAt: number
    }>
)

type PersistedPendingGrantReissueState = Readonly<{
  version: 1
  fid: string
  requestedAtMicros: number
  initialGrantCreatedAt: number
  reissueCount: number
  lastReissuedAt?: number
  providerAcceptedAt?: number
  clientAcknowledgedAt?: number
}>

type NotificationDependencies = Readonly<{
  fetchImpl?: typeof fetch
  now?: () => number
  configReader?: (env: WorkerEnv) => BridgeConfig
  admissionResolver?: AuthEpochResolver
  accessRequestResolver?: AccessRequestResolver
}>

type DeliveryResult =
  | 'successful'
  | 'invalid'
  | 'retryable'
  | 'terminal'

type DeliveryOutcome = Readonly<{
  result: DeliveryResult
  retryReason?: Exclude<
    AdmissionNotificationRetryReason,
    'admission-verification' | 'request-verification'
  >
}>

type FailedTokenReason =
  | 'domain_mismatch'
  | 'target_url_mismatch'
  | 'no_webhook_url'
  | 'invalid_token'
  | 'unknown'

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

function isRequestedAtMicros(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
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

function isGrantIntentId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{22}$/.test(value)
}

function isGrantTicket(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/.test(value)
}

function isGrantTicketHash(value: unknown): value is string {
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

function isRetryReason(value: unknown): value is AdmissionNotificationRetryReason {
  return value === 'admission-verification'
    || value === 'request-verification'
    || value === 'transport'
    || value === 'transport-timeout'
    || value === 'transport-fetch-rejected'
    || value === 'upstream-status'
    || value === 'upstream-redirect'
    || value === 'upstream-client-status'
    || value === 'upstream-server-status'
    || value === 'invalid-response'
    || value === 'response-content-type'
    || value === 'response-size'
    || value === 'response-body'
    || value === 'response-json'
    || value === 'response-schema'
    || value === 'rate-limited'
    || value === 'provider-domain-mismatch'
    || value === 'provider-target-url-mismatch'
    || value === 'provider-no-webhook-url'
    || value === 'provider-invalid-token'
    || value === 'provider-unknown'
}

function isFailedTokenReason(value: unknown): value is FailedTokenReason {
  return value === 'domain_mismatch'
    || value === 'target_url_mismatch'
    || value === 'no_webhook_url'
    || value === 'invalid_token'
    || value === 'unknown'
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

function readPersistedDiagnostics(value: unknown): PersistedNotificationDiagnostics | null {
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      ['retryReasons'],
      [
        'generation',
        'authEpoch',
        'requestedAtMicros',
        'lastAttemptAt',
        'lastFailureReason',
        'deliveryAttemptCount',
        'verificationFailureCount',
      ],
    )
    || !Array.isArray(value.retryReasons)
    || value.retryReasons.some(reason => !isRetryReason(reason))
    || new Set(value.retryReasons).size !== value.retryReasons.length
    || (value.lastAttemptAt !== undefined && !isTimestamp(value.lastAttemptAt))
    || (value.lastFailureReason !== undefined && !isRetryReason(value.lastFailureReason))
    || (value.deliveryAttemptCount !== undefined && (
      typeof value.deliveryAttemptCount !== 'number'
      || !Number.isSafeInteger(value.deliveryAttemptCount)
      || value.deliveryAttemptCount < 0
    ))
    || (value.verificationFailureCount !== undefined && (
      typeof value.verificationFailureCount !== 'number'
      || !Number.isSafeInteger(value.verificationFailureCount)
      || value.verificationFailureCount < 0
    ))
  ) return null
  const generation = value.generation === undefined && isAuthEpoch(value.authEpoch)
    ? Object.freeze({ kind: 'admitted' as const, authEpoch: value.authEpoch })
    : value.generation === 'admitted'
      && isAuthEpoch(value.authEpoch)
      && value.requestedAtMicros === undefined
      ? Object.freeze({ kind: 'admitted' as const, authEpoch: value.authEpoch })
      : value.generation === 'pending-request'
        && isRequestedAtMicros(value.requestedAtMicros)
        && value.authEpoch === undefined
        ? Object.freeze({
            kind: 'pending-request' as const,
            requestedAtMicros: value.requestedAtMicros,
          })
        : null
  if (!generation) return null
  return Object.freeze({
    generation,
    retryReasons: Object.freeze([...value.retryReasons] as AdmissionNotificationRetryReason[]),
    deliveryAttemptCount: value.deliveryAttemptCount ?? 0,
    verificationFailureCount: value.verificationFailureCount ?? 0,
    ...(value.lastAttemptAt === undefined ? {} : { lastAttemptAt: value.lastAttemptAt }),
    ...(value.lastFailureReason === undefined
      ? {}
      : { lastFailureReason: value.lastFailureReason }),
  })
}

function readDeliveryAttempts(value: unknown): readonly DeliveryAttempt[] | null {
  if (!Array.isArray(value) || value.length > MAX_SUBSCRIPTIONS) return null
  const attempts = value.map(readAttempt)
  if (
    attempts.some(attempt => attempt === null)
    || new Set(attempts.map(attempt => attempt!.appFid)).size !== attempts.length
  ) return null
  return Object.freeze(attempts as DeliveryAttempt[])
}

function readLegacyDelivery(value: unknown): AdmissionDelivery | null {
  if (
    !isRecord(value)
    || !exactKeys(value, ['authEpoch', 'queuedAt', 'expiresAt', 'attempts'])
    || !isAuthEpoch(value.authEpoch)
    || !isTimestamp(value.queuedAt)
    || !isTimestamp(value.expiresAt)
    || value.expiresAt <= value.queuedAt
    || value.expiresAt - value.queuedAt !== DELIVERY_LIFETIME_MILLISECONDS
  ) {
    return null
  }
  const attempts = readDeliveryAttempts(value.attempts)
  if (!attempts) return null
  return Object.freeze({
    kind: 'admitted',
    authEpoch: value.authEpoch,
    queuedAt: value.queuedAt,
    expiresAt: value.expiresAt,
    attempts,
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
  const delivery = value.delivery === undefined ? undefined : readLegacyDelivery(value.delivery)
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

function readPendingState(value: unknown): PersistedPendingNotificationState | null {
  if (value === undefined) return null
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      ['version', 'fid'],
      ['delivery', 'lastSentRequestAtMicros', 'lastExhaustedRequestAtMicros'],
    )
    || value.version !== STATE_VERSION
    || !isSafeFid(value.fid)
    || (
      value.lastSentRequestAtMicros !== undefined
      && !isRequestedAtMicros(value.lastSentRequestAtMicros)
    )
    || (
      value.lastExhaustedRequestAtMicros !== undefined
      && !isRequestedAtMicros(value.lastExhaustedRequestAtMicros)
    )
  ) throw new Error('Invalid pending admission notification state.')
  let delivery: PersistedPendingNotificationState['delivery']
  if (value.delivery !== undefined) {
    if (
      !isRecord(value.delivery)
      || !exactKeys(
        value.delivery,
        ['requestedAtMicros', 'queuedAt', 'expiresAt', 'attempts'],
      )
      || !isRequestedAtMicros(value.delivery.requestedAtMicros)
      || !isTimestamp(value.delivery.queuedAt)
      || !isTimestamp(value.delivery.expiresAt)
      || value.delivery.expiresAt <= value.delivery.queuedAt
      || value.delivery.expiresAt - value.delivery.queuedAt
        !== DELIVERY_LIFETIME_MILLISECONDS
    ) throw new Error('Invalid pending admission notification state.')
    const attempts = readDeliveryAttempts(value.delivery.attempts)
    if (!attempts) throw new Error('Invalid pending admission notification state.')
    delivery = Object.freeze({
      requestedAtMicros: value.delivery.requestedAtMicros,
      queuedAt: value.delivery.queuedAt,
      expiresAt: value.delivery.expiresAt,
      attempts,
    })
  }
  return Object.freeze({
    version: 1,
    fid: value.fid,
    ...(value.lastSentRequestAtMicros === undefined
      ? {}
      : { lastSentRequestAtMicros: value.lastSentRequestAtMicros }),
    ...(value.lastExhaustedRequestAtMicros === undefined
      ? {}
      : { lastExhaustedRequestAtMicros: value.lastExhaustedRequestAtMicros }),
    ...(delivery ? { delivery } : {}),
  })
}

function readPendingGrantIntent(value: unknown): PersistedPendingGrantIntent | null {
  if (value === undefined) return null
  const hasRawTicket = isRecord(value) && Object.prototype.hasOwnProperty.call(value, 'ticket')
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        'version',
        'fid',
        'requestedAtMicros',
        'intentId',
        'createdAt',
        'expiresAt',
        ...(hasRawTicket ? ['ticket'] : ['ticketHash', 'providerAcceptedAt', 'acknowledgedAt']),
      ],
      hasRawTicket ? ['providerAcceptedAt'] : [],
    )
    || value.version !== 1
    || !isSafeFid(value.fid)
    || !isRequestedAtMicros(value.requestedAtMicros)
    || !isGrantIntentId(value.intentId)
    || (hasRawTicket ? !isGrantTicket(value.ticket) : !isGrantTicketHash(value.ticketHash))
    || !isTimestamp(value.createdAt)
    || !isTimestamp(value.expiresAt)
    || value.expiresAt <= value.createdAt
    || value.expiresAt - value.createdAt !== DELIVERY_LIFETIME_MILLISECONDS
    || (value.providerAcceptedAt !== undefined && (
      !isTimestamp(value.providerAcceptedAt)
      || value.providerAcceptedAt < value.createdAt
      || value.providerAcceptedAt >= value.expiresAt
    ))
    || (!hasRawTicket && (
      !isTimestamp(value.providerAcceptedAt)
      || !isTimestamp(value.acknowledgedAt)
      || value.acknowledgedAt < value.providerAcceptedAt
      || value.acknowledgedAt >= value.expiresAt
    ))
  ) throw new Error('Invalid pending admission grant intent.')
  return Object.freeze({
    version: 1,
    fid: value.fid,
    requestedAtMicros: value.requestedAtMicros,
    intentId: value.intentId,
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    ...(hasRawTicket
      ? {
          ticket: value.ticket as string,
          ...(value.providerAcceptedAt === undefined
            ? {}
            : { providerAcceptedAt: value.providerAcceptedAt as number }),
        }
      : {
          ticketHash: value.ticketHash as string,
          providerAcceptedAt: value.providerAcceptedAt as number,
          acknowledgedAt: value.acknowledgedAt as number,
        }),
  })
}

function readPendingGrantReissueState(
  value: unknown,
): PersistedPendingGrantReissueState | null {
  if (value === undefined) return null
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        'version',
        'fid',
        'requestedAtMicros',
        'initialGrantCreatedAt',
        'reissueCount',
      ],
      ['lastReissuedAt', 'providerAcceptedAt', 'clientAcknowledgedAt'],
    )
    || value.version !== 1
    || !isSafeFid(value.fid)
    || !isRequestedAtMicros(value.requestedAtMicros)
    || !isTimestamp(value.initialGrantCreatedAt)
    || typeof value.reissueCount !== 'number'
    || !Number.isSafeInteger(value.reissueCount)
    || value.reissueCount < 0
    || value.reissueCount > MAX_PENDING_GRANT_REISSUES
    || (value.reissueCount === 0) !== (value.lastReissuedAt === undefined)
    || (value.lastReissuedAt !== undefined && (
      !isTimestamp(value.lastReissuedAt)
      || value.lastReissuedAt < value.initialGrantCreatedAt
    ))
    || (value.providerAcceptedAt !== undefined && (
      !isTimestamp(value.providerAcceptedAt)
      || value.providerAcceptedAt < value.initialGrantCreatedAt
      || (
        value.lastReissuedAt !== undefined
        && value.providerAcceptedAt < value.lastReissuedAt
      )
    ))
    || (value.clientAcknowledgedAt !== undefined && (
      !isTimestamp(value.clientAcknowledgedAt)
      || value.providerAcceptedAt === undefined
      || value.clientAcknowledgedAt < value.providerAcceptedAt
    ))
  ) throw new Error('Invalid pending admission grant reissue state.')
  return Object.freeze({
    version: 1,
    fid: value.fid,
    requestedAtMicros: value.requestedAtMicros,
    initialGrantCreatedAt: value.initialGrantCreatedAt,
    reissueCount: value.reissueCount,
    ...(value.lastReissuedAt === undefined
      ? {}
      : { lastReissuedAt: value.lastReissuedAt }),
    ...(value.providerAcceptedAt === undefined
      ? {}
      : { providerAcceptedAt: value.providerAcceptedAt }),
    ...(value.clientAcknowledgedAt === undefined
      ? {}
      : { clientAcknowledgedAt: value.clientAcknowledgedAt }),
  })
}

function grantMatchesGeneration(
  grant: PersistedPendingGrantIntent | null,
  generation: AdmissionNotificationGeneration,
  fid?: string,
): grant is PersistedPendingGrantIntent {
  return grant !== null
    && generation.kind === 'pending-request'
    && grant.requestedAtMicros === generation.requestedAtMicros
    && (fid === undefined || grant.fid === fid)
}

function reissueStateMatchesGeneration(
  state: PersistedPendingGrantReissueState | null,
  generation: AdmissionNotificationGeneration,
  fid?: string,
): state is PersistedPendingGrantReissueState {
  return state !== null
    && generation.kind === 'pending-request'
    && state.requestedAtMicros === generation.requestedAtMicros
    && (fid === undefined || state.fid === fid)
}

function createPendingGrantIntent(
  fid: string,
  requestedAtMicros: number,
  now: number,
): PersistedPendingGrantIntent {
  return Object.freeze({
    version: 1,
    fid,
    requestedAtMicros,
    intentId: randomId(16),
    ticket: randomId(32),
    createdAt: now,
    expiresAt: now + DELIVERY_LIFETIME_MILLISECONDS,
  })
}

function createPendingGrantReissueState(
  fid: string,
  requestedAtMicros: number,
  initialGrantCreatedAt: number,
): PersistedPendingGrantReissueState {
  return Object.freeze({
    version: 1,
    fid,
    requestedAtMicros,
    initialGrantCreatedAt,
    reissueCount: 0,
  })
}

async function grantTicketHash(ticket: string): Promise<string> {
  const bytes = new TextEncoder().encode(`warpkeep-grant-ticket-v1\0${ticket}`)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    bytes.fill(0)
  }
}

async function timingSafeGrantTicketMatch(
  candidate: string,
  grantIntent: PersistedPendingGrantIntent,
): Promise<boolean> {
  const [actual, target] = await Promise.all([
    grantTicketHash(candidate),
    typeof grantIntent.ticket === 'string'
      ? grantTicketHash(grantIntent.ticket)
      : Promise.resolve(grantIntent.ticketHash),
  ])
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ target.charCodeAt(index)
  }
  return difference === 0
}

async function readCombinedState(
  storage: DurableObjectState['storage'],
): Promise<PersistedNotificationState | null> {
  const [legacyValue, pendingValue] = await Promise.all([
    storage.get<unknown>(STATE_KEY),
    storage.get<unknown>(PENDING_STATE_RECORD),
  ])
  const legacy = readState(legacyValue)
  const pending = readPendingState(pendingValue)
  if (!legacy) {
    if (pending) throw new Error('Orphaned pending admission notification state.')
    return null
  }
  if (pending && pending.fid !== legacy.fid) {
    throw new Error('Mismatched pending admission notification state.')
  }
  // A rollback can legitimately leave pending-v2 work behind while the older
  // Worker writes a new admitted-v1 delivery. The live admitted generation is
  // authoritative in that conflict; the next write removes the stale pending
  // delivery while retaining only its bounded token-free receipt.
  return Object.freeze({
    ...legacy,
    ...(pending?.lastSentRequestAtMicros === undefined
      ? {}
      : { lastSentRequestAtMicros: pending.lastSentRequestAtMicros }),
    ...(pending?.lastExhaustedRequestAtMicros === undefined
      ? {}
      : { lastExhaustedRequestAtMicros: pending.lastExhaustedRequestAtMicros }),
    ...(!legacy.delivery && pending?.delivery
      ? {
          delivery: Object.freeze({
            kind: 'pending-request' as const,
            requestedAtMicros: pending.delivery.requestedAtMicros,
            queuedAt: pending.delivery.queuedAt,
            expiresAt: pending.delivery.expiresAt,
            attempts: pending.delivery.attempts,
          }),
        }
      : {}),
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

function internalUrl(path: 'event' | 'queue' | 'reissue' | 'status' | 'ack'): string {
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
      && value.status !== 'awaiting-client'
      && value.status !== 'client-acknowledged'
      && value.status !== 'delivery-exhausted'
      && value.status !== 'not-subscribed'
    )
  ) {
    throw new Error('Admission notification store returned invalid state.')
  }
  return value.status
}

async function readReissueStatus(response: Response): Promise<AdmissionNotificationReissueResult> {
  if (!response.ok) throw new Error('Admission notification store unavailable.')
  const value: unknown = await response.json()
  if (!isRecord(value)) {
    throw new Error('Admission notification store returned invalid state.')
  }
  if (value.status === 'reissued') {
    if (
      !exactKeys(value, ['status', 'deliveryStatus'])
      || (
        value.deliveryStatus !== 'queued'
        && value.deliveryStatus !== 'already-sent'
        && value.deliveryStatus !== 'awaiting-client'
        && value.deliveryStatus !== 'client-acknowledged'
        && value.deliveryStatus !== 'delivery-exhausted'
        && value.deliveryStatus !== 'not-subscribed'
      )
    ) throw new Error('Admission notification store returned invalid state.')
    return Object.freeze({ status: 'reissued', deliveryStatus: value.deliveryStatus })
  }
  if (value.status === 'cooldown') {
    if (
      !exactKeys(value, ['status', 'retryAfterSeconds'])
      || typeof value.retryAfterSeconds !== 'number'
      || !Number.isSafeInteger(value.retryAfterSeconds)
      || value.retryAfterSeconds < 1
      || value.retryAfterSeconds > Math.ceil(
        PENDING_GRANT_REISSUE_COOLDOWN_MILLISECONDS / 1_000,
      )
    ) throw new Error('Admission notification store returned invalid state.')
    return Object.freeze({ status: 'cooldown', retryAfterSeconds: value.retryAfterSeconds })
  }
  if (
    exactKeys(value, ['status'])
    && (
      value.status === 'limit-reached'
      || value.status === 'client-acknowledged'
      || value.status === 'not-ready'
      || value.status === 'not-subscribed'
      || value.status === 'stale'
      || value.status === 'paused'
    )
  ) return Object.freeze({ status: value.status })
  throw new Error('Admission notification store returned invalid state.')
}

async function readDiagnostics(response: Response): Promise<AdmissionNotificationDiagnostics> {
  if (!response.ok) throw new Error('Admission notification store unavailable.')
  const value: unknown = await response.json()
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        'version',
        'systemState',
        'subscriptionState',
        'status',
        'activeSubscriptionCount',
        'activeClientFids',
        'activeAttemptCount',
        'pendingAttemptCount',
        'retryingAttemptCount',
        'sentAttemptCount',
        'exhaustedAttemptCount',
        'deliveryAttemptCount',
        'verificationFailureCount',
        'grantState',
        'deliveryState',
        'retryReasons',
      ],
      [
        'generation',
        'authEpoch',
        'deliveryQueuedAt',
        'deliveryExpiresAt',
        'grantCreatedAt',
        'grantExpiresAt',
        'providerAcceptedAt',
        'clientAcknowledgedAt',
        'lastAttemptAt',
        'lastFailureReason',
        'nextAttemptAt',
      ],
    )
    || value.version !== 2
    || (value.systemState !== 'enabled' && value.systemState !== 'paused')
    || (value.subscriptionState !== 'active' && value.subscriptionState !== 'absent')
    || (
      value.status !== 'queued'
      && value.status !== 'already-sent'
      && value.status !== 'awaiting-client'
      && value.status !== 'client-acknowledged'
      && value.status !== 'delivery-exhausted'
      && value.status !== 'not-subscribed'
    )
    || (value.authEpoch !== undefined && !isAuthEpoch(value.authEpoch))
    || (
      value.generation !== undefined
      && value.generation !== 'admitted'
      && value.generation !== 'pending-request'
    )
    || (value.generation === 'pending-request' && value.authEpoch !== undefined)
    || (value.generation === 'admitted' && !isAuthEpoch(value.authEpoch))
    || (value.generation !== 'admitted' && value.authEpoch !== undefined)
    || ![
      value.activeSubscriptionCount,
      value.activeAttemptCount,
      value.pendingAttemptCount,
      value.retryingAttemptCount,
      value.sentAttemptCount,
      value.exhaustedAttemptCount,
      value.deliveryAttemptCount,
      value.verificationFailureCount,
    ].every(candidate => (
      typeof candidate === 'number'
      && Number.isSafeInteger(candidate)
      && candidate >= 0
    ))
    || !Array.isArray(value.activeClientFids)
    || value.activeClientFids.some(candidate => !isAppFid(candidate))
    || new Set(value.activeClientFids).size !== value.activeClientFids.length
    || value.activeClientFids.some((candidate, index) => (
      index > 0 && candidate <= (value.activeClientFids as number[])[index - 1]
    ))
    || value.activeSubscriptionCount !== value.activeClientFids.length
    || (value.subscriptionState === 'active') !== (value.activeSubscriptionCount > 0)
    || value.activeAttemptCount !== (value.pendingAttemptCount as number)
      + (value.retryingAttemptCount as number)
      + (value.sentAttemptCount as number)
      + (value.exhaustedAttemptCount as number)
    || (
      value.grantState !== 'none'
      && value.grantState !== 'created'
      && value.grantState !== 'provider-accepted'
      && value.grantState !== 'client-acknowledged'
    )
    || (
      value.deliveryState !== 'idle'
      && value.deliveryState !== 'pending'
      && value.deliveryState !== 'retry-scheduled'
      && value.deliveryState !== 'succeeded'
      && value.deliveryState !== 'exhausted'
    )
    || (value.deliveryState === 'idle' && value.activeAttemptCount !== 0)
    || (value.deliveryState === 'pending' && (
      value.activeAttemptCount === 0
      || value.pendingAttemptCount === 0
      || value.retryingAttemptCount !== 0
    ))
    || (value.deliveryState === 'retry-scheduled'
      && value.retryingAttemptCount === 0)
    || (value.deliveryState === 'succeeded' && (
      value.activeAttemptCount === 0
      || value.sentAttemptCount !== value.activeAttemptCount
    ))
    || (value.deliveryState === 'exhausted' && (
      value.activeAttemptCount === 0
      || value.exhaustedAttemptCount === 0
      || (value.sentAttemptCount as number) + (value.exhaustedAttemptCount as number)
        !== value.activeAttemptCount
    ))
    || (value.deliveryQueuedAt !== undefined && !isTimestamp(value.deliveryQueuedAt))
    || (value.deliveryExpiresAt !== undefined && !isTimestamp(value.deliveryExpiresAt))
    || (value.deliveryQueuedAt === undefined) !== (value.deliveryExpiresAt === undefined)
    || (value.deliveryState === 'idle') !== (value.deliveryQueuedAt === undefined)
    || (value.deliveryQueuedAt !== undefined && value.deliveryExpiresAt! <= value.deliveryQueuedAt)
    || (value.grantCreatedAt !== undefined && !isTimestamp(value.grantCreatedAt))
    || (value.grantExpiresAt !== undefined && !isTimestamp(value.grantExpiresAt))
    || (value.grantCreatedAt === undefined) !== (value.grantExpiresAt === undefined)
    || (value.grantState === 'none') !== (value.grantCreatedAt === undefined)
    || (value.grantCreatedAt !== undefined && value.grantExpiresAt! <= value.grantCreatedAt)
    || (value.providerAcceptedAt !== undefined && !isTimestamp(value.providerAcceptedAt))
    || (value.clientAcknowledgedAt !== undefined && !isTimestamp(value.clientAcknowledgedAt))
    || (value.grantState === 'created' && value.providerAcceptedAt !== undefined)
    || (
      value.grantState === 'provider-accepted'
      && (value.providerAcceptedAt === undefined || value.clientAcknowledgedAt !== undefined)
    )
    || (
      value.grantState === 'client-acknowledged'
      && (value.providerAcceptedAt === undefined || value.clientAcknowledgedAt === undefined)
    )
    || (value.grantState === 'none' && (
      value.providerAcceptedAt !== undefined || value.clientAcknowledgedAt !== undefined
    ))
    || (value.providerAcceptedAt !== undefined && (
      value.grantCreatedAt === undefined
      || value.providerAcceptedAt < value.grantCreatedAt
      || value.providerAcceptedAt >= value.grantExpiresAt!
    ))
    || (value.clientAcknowledgedAt !== undefined && (
      value.providerAcceptedAt === undefined
      || value.clientAcknowledgedAt < value.providerAcceptedAt
      || value.clientAcknowledgedAt >= value.grantExpiresAt!
    ))
    || !Array.isArray(value.retryReasons)
    || value.retryReasons.some(reason => !isRetryReason(reason))
    || new Set(value.retryReasons).size !== value.retryReasons.length
    || (value.lastAttemptAt !== undefined && !isTimestamp(value.lastAttemptAt))
    || (value.lastFailureReason !== undefined && !isRetryReason(value.lastFailureReason))
    || (value.nextAttemptAt !== undefined && !isTimestamp(value.nextAttemptAt))
  ) {
    throw new Error('Admission notification store returned invalid diagnostics.')
  }
  return Object.freeze({
    version: 2,
    systemState: value.systemState,
    subscriptionState: value.subscriptionState,
    status: value.status,
    ...(value.generation === undefined ? {} : { generation: value.generation }),
    ...(value.authEpoch === undefined ? {} : { authEpoch: value.authEpoch }),
    activeSubscriptionCount: value.activeSubscriptionCount as number,
    activeClientFids: Object.freeze([...value.activeClientFids] as number[]),
    activeAttemptCount: value.activeAttemptCount as number,
    pendingAttemptCount: value.pendingAttemptCount as number,
    retryingAttemptCount: value.retryingAttemptCount as number,
    sentAttemptCount: value.sentAttemptCount as number,
    exhaustedAttemptCount: value.exhaustedAttemptCount as number,
    deliveryAttemptCount: value.deliveryAttemptCount as number,
    verificationFailureCount: value.verificationFailureCount as number,
    ...(value.deliveryQueuedAt === undefined ? {} : {
      deliveryQueuedAt: value.deliveryQueuedAt,
      deliveryExpiresAt: value.deliveryExpiresAt as number,
    }),
    grantState: value.grantState,
    ...(value.grantCreatedAt === undefined ? {} : {
      grantCreatedAt: value.grantCreatedAt,
      grantExpiresAt: value.grantExpiresAt as number,
    }),
    ...(value.providerAcceptedAt === undefined
      ? {}
      : { providerAcceptedAt: value.providerAcceptedAt }),
    ...(value.clientAcknowledgedAt === undefined
      ? {}
      : { clientAcknowledgedAt: value.clientAcknowledgedAt }),
    deliveryState: value.deliveryState,
    retryReasons: Object.freeze([...value.retryReasons] as AdmissionNotificationRetryReason[]),
    ...(value.lastAttemptAt === undefined ? {} : { lastAttemptAt: value.lastAttemptAt }),
    ...(value.lastFailureReason === undefined
      ? {}
      : { lastFailureReason: value.lastFailureReason }),
    ...(value.nextAttemptAt === undefined ? {} : { nextAttemptAt: value.nextAttemptAt }),
  })
}

async function readAcknowledgementStatus(
  response: Response,
): Promise<AdmissionNotificationAcknowledgementStatus> {
  if (!response.ok) throw new Error('Admission notification store unavailable.')
  const value: unknown = await response.json()
  if (
    !isRecord(value)
    || !exactKeys(value, ['status'])
    || (
      value.status !== 'accepted'
      && value.status !== 'not-ready'
      && value.status !== 'stale'
      && value.status !== 'context-mismatch'
    )
  ) throw new Error('Admission notification store returned invalid state.')
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

  async queueAdmission(
    input: AdmissionNotificationQueueInput,
  ): Promise<AdmissionNotificationQueueStatus> {
    const response = await (await this.stub(input.fid)).fetch(internalUrl('queue'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return readQueueStatus(response)
  }

  async reissueAdmission(
    input: AdmissionNotificationReissueInput,
  ): Promise<AdmissionNotificationReissueResult> {
    const response = await (await this.stub(input.fid)).fetch(internalUrl('reissue'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    return readReissueStatus(response)
  }

  async acknowledge(
    fid: string,
    ticket: string,
    notificationId: string,
  ): Promise<AdmissionNotificationAcknowledgementStatus> {
    const response = await (await this.stub(fid)).fetch(internalUrl('ack'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fid, ticket, notificationId }),
    })
    return readAcknowledgementStatus(response)
  }

  async inspect(fid: string): Promise<AdmissionNotificationDiagnostics> {
    const response = await (await this.stub(fid)).fetch(internalUrl('status'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fid }),
    })
    return readDiagnostics(response)
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

function validQueueInput(value: unknown): value is AdmissionNotificationQueueInput {
  if (!isRecord(value) || !isSafeFid(value.fid) || !isTimestamp(value.queuedAt)) return false
  if (
    value.kind === undefined
    && exactKeys(value, ['fid', 'authEpoch', 'queuedAt'])
    && isAuthEpoch(value.authEpoch)
  ) return true
  return value.kind === 'admitted'
    && exactKeys(value, ['fid', 'kind', 'authEpoch', 'queuedAt'])
    && isAuthEpoch(value.authEpoch)
    || value.kind === 'pending-request'
      && exactKeys(value, ['fid', 'kind', 'requestedAtMicros', 'queuedAt'])
      && isRequestedAtMicros(value.requestedAtMicros)
}

function validReissueInput(value: unknown): value is AdmissionNotificationReissueInput {
  return isRecord(value)
    && exactKeys(value, ['fid', 'requestedAtMicros', 'reissuedAt'])
    && isSafeFid(value.fid)
    && isRequestedAtMicros(value.requestedAtMicros)
    && isTimestamp(value.reissuedAt)
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

function attemptForPersistence(attempt: DeliveryAttempt): DeliveryAttempt {
  return Object.freeze({
    appFid: attempt.appFid,
    tokenId: attempt.tokenId,
    status: attempt.status,
    attempts: attempt.attempts,
    verificationFailures: attempt.verificationFailures,
    ...(attempt.nextAttemptAt === undefined ? {} : { nextAttemptAt: attempt.nextAttemptAt }),
  })
}

function legacyStateForPersistence(
  state: PersistedNotificationState,
): LegacyPersistedNotificationState {
  return Object.freeze({
    version: 1,
    revision: state.revision,
    fid: state.fid,
    retentionExpiresAt: state.retentionExpiresAt,
    subscriptions: state.subscriptions,
    seenEventIds: state.seenEventIds,
    revokedTokenIds: state.revokedTokenIds,
    ...(state.lastSentAuthEpoch === undefined
      ? {}
      : { lastSentAuthEpoch: state.lastSentAuthEpoch }),
    ...(state.lastExhaustedAuthEpoch === undefined
      ? {}
      : { lastExhaustedAuthEpoch: state.lastExhaustedAuthEpoch }),
    ...(state.delivery?.kind === 'admitted'
      ? {
          delivery: Object.freeze({
            authEpoch: state.delivery.authEpoch,
            queuedAt: state.delivery.queuedAt,
            expiresAt: state.delivery.expiresAt,
            attempts: Object.freeze(state.delivery.attempts.map(attemptForPersistence)),
          }),
        }
      : {}),
  })
}

function pendingStateForPersistence(
  state: PersistedNotificationState,
): PersistedPendingNotificationState | null {
  const delivery = state.delivery?.kind === 'pending-request'
    ? Object.freeze({
        requestedAtMicros: state.delivery.requestedAtMicros,
        queuedAt: state.delivery.queuedAt,
        expiresAt: state.delivery.expiresAt,
        attempts: Object.freeze(state.delivery.attempts.map(attemptForPersistence)),
      })
    : undefined
  if (
    !delivery
    && state.lastSentRequestAtMicros === undefined
    && state.lastExhaustedRequestAtMicros === undefined
  ) return null
  return Object.freeze({
    version: 1,
    fid: state.fid,
    ...(state.lastSentRequestAtMicros === undefined
      ? {}
      : { lastSentRequestAtMicros: state.lastSentRequestAtMicros }),
    ...(state.lastExhaustedRequestAtMicros === undefined
      ? {}
      : { lastExhaustedRequestAtMicros: state.lastExhaustedRequestAtMicros }),
    ...(delivery ? { delivery } : {}),
  })
}

async function persistAndSchedule(
  storage: DurableObjectState['storage'],
  state: PersistedNotificationState,
  now: number,
  grantIntent?: PersistedPendingGrantIntent | null,
  reissueState?: PersistedPendingGrantReissueState,
): Promise<void> {
  const legacyState = legacyStateForPersistence(state)
  const pendingState = pendingStateForPersistence(state)
  await storage.transaction(async transaction => {
    await transaction.put(STATE_KEY, legacyState)
    if (pendingState) await transaction.put(PENDING_STATE_RECORD, pendingState)
    else await transaction.delete(PENDING_STATE_RECORD)
    if (grantIntent === null) await transaction.delete(PENDING_GRANT_RECORD)
    else if (grantIntent !== undefined) await transaction.put(PENDING_GRANT_RECORD, grantIntent)
    if (reissueState !== undefined) {
      await transaction.put(PENDING_GRANT_REISSUE_RECORD, reissueState)
    }
  })
  const retainedGrant = grantIntent === undefined
    ? readPendingGrantIntent(await storage.get<unknown>(PENDING_GRANT_RECORD))
    : grantIntent
  const stateAlarmAt = nextAlarmAt(state, now)
  const alarmAt = retainedGrant && retainedGrant.expiresAt > now
    ? stateAlarmAt === null
      ? retainedGrant.expiresAt
      : Math.min(stateAlarmAt, retainedGrant.expiresAt)
    : stateAlarmAt
  if (alarmAt === null) await storage.deleteAlarm?.()
  else await storage.setAlarm(alarmAt)
}

async function purgePersistedState(storage: DurableObjectState['storage']): Promise<void> {
  await storage.deleteAlarm?.()
  await storage.deleteAll()
}

function generationEquals(
  left: AdmissionNotificationGeneration,
  right: AdmissionNotificationGeneration,
): boolean {
  return left.kind === right.kind
    && (left.kind === 'admitted'
      ? right.kind === 'admitted' && left.authEpoch === right.authEpoch
      : right.kind === 'pending-request'
        && left.requestedAtMicros === right.requestedAtMicros)
}

function deliveryGeneration(delivery: AdmissionDelivery): AdmissionNotificationGeneration {
  return delivery.kind === 'admitted'
    ? Object.freeze({ kind: 'admitted', authEpoch: delivery.authEpoch })
    : Object.freeze({
        kind: 'pending-request',
        requestedAtMicros: delivery.requestedAtMicros,
      })
}

/**
 * Older Cloudflare deployments classified their runtime-level redirect failure
 * as the broad `transport` reason. An authenticated operator replay may bring
 * the exact legacy fifth-attempt generation forward after Farcaster's minimum
 * retry interval. The legacy record did not store a last-attempt timestamp, so
 * derive it from the persisted four-hour backoff invariant. The attempt counter
 * and six-attempt ceiling never reset. Current deployments emit richer records,
 * so this compatibility path cannot become a general-purpose backoff bypass.
 */
function recoverLegacyTransportBackoff(
  state: PersistedNotificationState,
  diagnostics: PersistedNotificationDiagnostics | null,
  generation: AdmissionNotificationGeneration,
  now: number,
): PersistedNotificationState {
  if (
    !state.delivery
    || state.delivery.kind !== 'admitted'
    || generation.kind !== 'admitted'
    || !generationEquals(deliveryGeneration(state.delivery), generation)
    || !diagnostics
    || !generationEquals(diagnostics.generation, generation)
    || diagnostics.retryReasons.length !== 1
    || diagnostics.retryReasons[0] !== 'transport'
    || diagnostics.lastFailureReason !== undefined
    || diagnostics.lastAttemptAt !== undefined
    || state.delivery.attempts.length === 0
    || state.delivery.attempts.some((attempt) => (
      attempt.status !== 'retrying'
      || attempt.attempts !== MAX_DELIVERY_ATTEMPTS - 1
      || attempt.nextAttemptAt === undefined
      || attempt.nextAttemptAt <= now
      || attempt.nextAttemptAt - RETRY_DELAYS_MILLISECONDS[attempt.attempts - 1]
        > now - LEGACY_TRANSPORT_RETRY_MINIMUM_AGE_MILLISECONDS
    ))
  ) return state

  const attempts = state.delivery.attempts.map((attempt) => {
    return Object.freeze({
      appFid: attempt.appFid,
      tokenId: attempt.tokenId,
      status: 'pending' as const,
      attempts: attempt.attempts,
      verificationFailures: attempt.verificationFailures,
    })
  })
  return Object.freeze({
    ...state,
    delivery: Object.freeze({
      ...state.delivery,
      attempts: Object.freeze(attempts),
    }),
  })
}

async function recordDiagnostics(
  storage: DurableObjectState['storage'],
  generation: AdmissionNotificationGeneration,
  retryReasons: readonly AdmissionNotificationRetryReason[],
  deliveryAttemptCount: number,
  verificationFailureCount: number,
  lastAttemptAt?: number,
  lastFailureReason?: AdmissionNotificationRetryReason,
): Promise<void> {
  const existing = readPersistedDiagnostics(await storage.get<unknown>(DIAGNOSTICS_RECORD))
  const combined = new Set<AdmissionNotificationRetryReason>(
    existing && generationEquals(existing.generation, generation)
      ? existing.retryReasons
      : [],
  )
  retryReasons.forEach(reason => combined.add(reason))
  await storage.put(DIAGNOSTICS_RECORD, Object.freeze({
    generation: generation.kind,
    ...(generation.kind === 'admitted'
      ? { authEpoch: generation.authEpoch }
      : { requestedAtMicros: generation.requestedAtMicros }),
    retryReasons: Object.freeze(Array.from(combined).sort()),
    deliveryAttemptCount: Math.max(
      deliveryAttemptCount,
      existing && generationEquals(existing.generation, generation)
        ? existing.deliveryAttemptCount
        : 0,
    ),
    verificationFailureCount: Math.max(
      verificationFailureCount,
      existing && generationEquals(existing.generation, generation)
        ? existing.verificationFailureCount
        : 0,
    ),
    ...(lastAttemptAt === undefined
      ? existing && generationEquals(existing.generation, generation)
        && existing.lastAttemptAt !== undefined
        ? { lastAttemptAt: existing.lastAttemptAt }
        : {}
      : { lastAttemptAt }),
    ...(lastFailureReason === undefined
      ? lastAttemptAt === undefined
        && existing && generationEquals(existing.generation, generation)
        && existing.lastFailureReason !== undefined
        ? { lastFailureReason: existing.lastFailureReason }
        : {}
      : { lastFailureReason }),
  }))
}

function notificationId(
  delivery: AdmissionDelivery,
  grantIntent: PersistedPendingGrantIntent | null,
): string {
  return delivery.kind === 'admitted'
    ? `warpkeep-access-approved-v1-e${delivery.authEpoch}`
    : grantMatchesGeneration(grantIntent, delivery)
      ? `warpkeep-access-grant-v3-i${grantIntent.intentId}`
      : responseFailure('invalid-response')
}

function targetUrl(
  delivery: AdmissionDelivery,
  grantIntent: PersistedPendingGrantIntent | null,
): string {
  if (delivery.kind === 'admitted') return TARGET_URL
  if (
    !grantMatchesGeneration(grantIntent, delivery)
    || typeof grantIntent.ticket !== 'string'
  ) {
    return responseFailure('invalid-response')
  }
  return `${TARGET_URL}#${GRANT_TARGET_FRAGMENT}=${grantIntent.ticket}`
}

class NotificationResponseError extends Error {
  constructor(readonly reason: AdmissionNotificationRetryReason) {
    super('Invalid notification response.')
    this.name = 'NotificationResponseError'
  }
}

function responseFailure(reason: AdmissionNotificationRetryReason): never {
  throw new NotificationResponseError(reason)
}

async function boundedDeliveryJson(response: Response): Promise<unknown> {
  if (!response.body) return responseFailure('response-body')
  const contentType = response.headers.get('content-type') ?? ''
  if (!/^application\/json(?:\s*;.*)?$/i.test(contentType)) {
    return responseFailure('response-content-type')
  }
  const length = response.headers.get('content-length')
  if (length && (!/^\d+$/.test(length) || Number(length) > DELIVERY_RESPONSE_MAX_BYTES)) {
    return responseFailure('response-size')
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
        return responseFailure('response-size')
      }
      chunks.push(value)
    }
  } catch (error) {
    if (error instanceof NotificationResponseError) throw error
    return responseFailure('response-body')
  } finally {
    try { reader.releaseLock() } catch { /* Reader cleanup is best effort. */ }
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    return responseFailure('response-json')
  }
}

function tokenArray(value: unknown, requestedToken: string): boolean {
  return Array.isArray(value)
    && value.length <= 1
    && value.every(token => token === requestedToken)
}

function failedTokenReason(
  value: unknown,
  requestedToken: string,
): FailedTokenReason | null | undefined {
  if (value === undefined) return undefined
  if (!Array.isArray(value) || value.length > 1) return null
  if (value.length === 0) return undefined
  const failed = value[0]
  if (
    !isRecord(failed)
    || failed.token !== requestedToken
    || !isFailedTokenReason(failed.reason)
    || (
      failed.fid !== undefined
      && (
        typeof failed.fid !== 'number'
        || !Number.isSafeInteger(failed.fid)
        || failed.fid < 1
      )
    )
  ) return null
  return failed.reason
}

function providerRetryReason(
  reason: Exclude<FailedTokenReason, 'invalid_token'>,
): Exclude<
  AdmissionNotificationRetryReason,
  'admission-verification' | 'request-verification'
> {
  if (reason === 'domain_mismatch') return 'provider-domain-mismatch'
  if (reason === 'target_url_mismatch') return 'provider-target-url-mismatch'
  if (reason === 'no_webhook_url') return 'provider-no-webhook-url'
  return 'provider-unknown'
}

function deliveryResult(value: unknown, requestedToken: string): DeliveryOutcome | null {
  if (!isRecord(value) || !isRecord(value.result)) {
    return null
  }
  const result = value.result
  if (
    !tokenArray(result.successfulTokens, requestedToken)
    || !tokenArray(result.invalidTokens, requestedToken)
    || !tokenArray(result.rateLimitedTokens, requestedToken)
  ) return null
  const failedReason = failedTokenReason(result.failedTokens, requestedToken)
  if (failedReason === null) return null
  const successful = (result.successfulTokens as unknown[]).length
  const invalid = (result.invalidTokens as unknown[]).length
  const rateLimited = (result.rateLimitedTokens as unknown[]).length
  const categories = successful + invalid + rateLimited
  if (categories > 1) return null
  if (successful === 1) {
    return failedReason === undefined ? Object.freeze({ result: 'successful' }) : null
  }
  if (invalid === 1) {
    if (failedReason !== undefined && failedReason !== 'invalid_token') return null
    return Object.freeze({ result: 'invalid', retryReason: 'provider-invalid-token' })
  }
  if (rateLimited === 1) {
    return failedReason === undefined
      ? Object.freeze({ result: 'retryable', retryReason: 'rate-limited' })
      : null
  }
  if (failedReason === undefined) return null
  if (failedReason === 'invalid_token') {
    return Object.freeze({ result: 'invalid', retryReason: 'provider-invalid-token' })
  }
  if (failedReason === 'domain_mismatch' || failedReason === 'target_url_mismatch') {
    return Object.freeze({
      result: 'invalid',
      retryReason: providerRetryReason(failedReason),
    })
  }
  if (failedReason === 'no_webhook_url') {
    return Object.freeze({
      result: 'terminal',
      retryReason: 'provider-no-webhook-url',
    })
  }
  return Object.freeze({
    result: 'retryable',
    retryReason: providerRetryReason(failedReason),
  })
}

async function sendOne(
  subscription: Subscription,
  delivery: AdmissionDelivery,
  grantIntent: PersistedPendingGrantIntent | null,
  fetchImpl: typeof fetch,
): Promise<DeliveryOutcome> {
  let response: Response
  const signal = AbortSignal.timeout(DELIVERY_TIMEOUT_MILLISECONDS)
  try {
    response = await fetchImpl(subscription.url, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        notificationId: notificationId(delivery, grantIntent),
        title: HEGEMONY_WELCOME_NOTIFICATION_TITLE,
        body: HEGEMONY_WELCOME_NOTIFICATION_BODY,
        targetUrl: targetUrl(delivery, grantIntent),
        tokens: [subscription.token],
      }),
      cache: 'no-store',
      // Cloudflare rejects `redirect: "error"` before issuing the subrequest.
      // Manual mode returns a 3xx for the fail-closed status classifier below
      // without ever forwarding the private notification token elsewhere.
      redirect: 'manual',
      signal,
    })
  } catch {
    return Object.freeze({
      result: 'retryable',
      retryReason: signal.aborted ? 'transport-timeout' : 'transport-fetch-rejected',
    })
  }
  if (response.status !== 200) {
    try { await response.body?.cancel() } catch { /* Resource cleanup is best effort. */ }
    if (response.status === 429) {
      return Object.freeze({ result: 'retryable', retryReason: 'rate-limited' })
    }
    if (response.status >= 300 && response.status < 400) {
      return Object.freeze({ result: 'terminal', retryReason: 'upstream-redirect' })
    }
    if (response.status >= 500) {
      return Object.freeze({ result: 'retryable', retryReason: 'upstream-server-status' })
    }
    return Object.freeze({
      result: 'terminal',
      retryReason: 'upstream-client-status',
    })
  }
  try {
    return deliveryResult(
      await boundedDeliveryJson(response),
      subscription.token,
    ) ?? Object.freeze({ result: 'retryable', retryReason: 'response-schema' })
  } catch (error) {
    return Object.freeze({
      result: 'retryable',
      retryReason: signal.aborted
        ? 'transport-timeout'
        : error instanceof NotificationResponseError
        ? error.reason as Exclude<
            AdmissionNotificationRetryReason,
            'admission-verification' | 'request-verification'
          >
        : 'invalid-response',
    })
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

function terminalAttempt(attempt: DeliveryAttempt): DeliveryAttempt {
  return Object.freeze({
    ...attempt,
    status: 'exhausted',
    attempts: Math.min(MAX_DELIVERY_ATTEMPTS, attempt.attempts + 1),
    verificationFailures: 0,
    nextAttemptAt: undefined,
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

function sentForGeneration(
  state: PersistedNotificationState,
  generation: AdmissionNotificationGeneration,
): boolean {
  return generation.kind === 'admitted'
    ? state.lastSentAuthEpoch !== undefined
      && state.lastSentAuthEpoch >= generation.authEpoch
    : state.lastSentRequestAtMicros === generation.requestedAtMicros
}

function exhaustedForGeneration(
  state: PersistedNotificationState,
  generation: AdmissionNotificationGeneration,
): boolean {
  return generation.kind === 'admitted'
    ? state.lastExhaustedAuthEpoch !== undefined
      && state.lastExhaustedAuthEpoch >= generation.authEpoch
    : state.lastExhaustedRequestAtMicros === generation.requestedAtMicros
}

function queueStatus(
  state: PersistedNotificationState,
  grantIntent: PersistedPendingGrantIntent | null = null,
): AdmissionNotificationQueueStatus {
  if (!state.delivery || state.delivery.kind === 'pending-request') {
    if (grantIntent?.acknowledgedAt !== undefined) return 'client-acknowledged'
    if (grantIntent?.providerAcceptedAt !== undefined) return 'awaiting-client'
  }
  if (
    state.delivery?.kind === 'admitted'
    && sentForGeneration(state, deliveryGeneration(state.delivery))
  ) {
    return 'already-sent'
  }
  if (
    state.delivery?.kind === 'admitted'
    && exhaustedForGeneration(state, deliveryGeneration(state.delivery))
  ) {
    return 'delivery-exhausted'
  }
  if (!state.delivery || state.subscriptions.length === 0) return 'not-subscribed'
  if (
    state.delivery?.kind === 'admitted'
    && state.delivery.attempts.length > 0
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

function pendingGenerationStatus(
  state: PersistedNotificationState,
  generation: Readonly<{ kind: 'pending-request'; requestedAtMicros: number }>,
  grantIntent: PersistedPendingGrantIntent | null,
  reissueState: PersistedPendingGrantReissueState,
): AdmissionNotificationQueueStatus {
  if (reissueState.clientAcknowledgedAt !== undefined) return 'client-acknowledged'
  if (grantMatchesGeneration(grantIntent, generation, state.fid)) {
    if (grantIntent.acknowledgedAt !== undefined) return 'client-acknowledged'
    if (grantIntent.providerAcceptedAt !== undefined) return 'awaiting-client'
    if (
      state.delivery?.kind === 'pending-request'
      && state.delivery.requestedAtMicros === generation.requestedAtMicros
    ) return queueStatus(state, grantIntent)
  }
  return 'delivery-exhausted'
}

function diagnosticsForState(
  state: PersistedNotificationState | null,
  persistedDiagnostics: PersistedNotificationDiagnostics | null,
  grantIntent: PersistedPendingGrantIntent | null,
  reissueState: PersistedPendingGrantReissueState | null,
  notificationsEnabled: boolean,
): AdmissionNotificationDiagnostics {
  if (!state) {
    return Object.freeze({
      version: 2,
      systemState: notificationsEnabled ? 'enabled' : 'paused',
      subscriptionState: 'absent',
      status: 'not-subscribed',
      activeSubscriptionCount: 0,
      activeClientFids: Object.freeze([]),
      activeAttemptCount: 0,
      pendingAttemptCount: 0,
      retryingAttemptCount: 0,
      sentAttemptCount: 0,
      exhaustedAttemptCount: 0,
      deliveryAttemptCount: 0,
      verificationFailureCount: 0,
      grantState: 'none',
      deliveryState: 'idle',
      retryReasons: Object.freeze([]),
    })
  }
  const delivery = state.delivery
  const attempts = delivery?.attempts ?? []
  const generation = delivery
    ? deliveryGeneration(delivery)
    : grantIntent
      ? Object.freeze({
          kind: 'pending-request' as const,
          requestedAtMicros: grantIntent.requestedAtMicros,
        })
      : reissueState
        ? Object.freeze({
            kind: 'pending-request' as const,
            requestedAtMicros: reissueState.requestedAtMicros,
          })
      : persistedDiagnostics?.generation
  const status = delivery
    ? queueStatus(state, grantIntent)
    : grantIntent?.acknowledgedAt !== undefined
      ? 'client-acknowledged'
      : reissueState?.clientAcknowledgedAt !== undefined
        ? 'client-acknowledged'
      : grantIntent?.providerAcceptedAt !== undefined
        ? 'awaiting-client'
      : reissueState !== null
        ? 'delivery-exhausted'
    : generation === undefined
      ? 'not-subscribed'
      : sentForGeneration(state, generation)
      ? 'already-sent'
      : exhaustedForGeneration(state, generation)
        ? 'delivery-exhausted'
        : 'not-subscribed'
  const nextAttemptAt = attempts.reduce<number | undefined>((earliest, attempt) => {
    if (attempt.nextAttemptAt === undefined) return earliest
    return earliest === undefined ? attempt.nextAttemptAt : Math.min(earliest, attempt.nextAttemptAt)
  }, undefined)
  const matchingDiagnostics = generation && persistedDiagnostics
    && generationEquals(generation, persistedDiagnostics.generation)
    ? persistedDiagnostics
    : undefined
  const retryReasons = matchingDiagnostics?.retryReasons ?? Object.freeze([])
  const activeClientFids = Object.freeze(
    state.subscriptions.map(subscription => subscription.appFid).sort((left, right) => left - right),
  )
  const pendingAttemptCount = attempts.filter(attempt => attempt.status === 'pending').length
  const retryingAttemptCount = attempts.filter(attempt => attempt.status === 'retrying').length
  const sentAttemptCount = attempts.filter(attempt => attempt.status === 'sent').length
  const exhaustedAttemptCount = attempts.filter(attempt => attempt.status === 'exhausted').length
  const grantState = grantIntent?.acknowledgedAt !== undefined
    ? 'client-acknowledged' as const
    : grantIntent?.providerAcceptedAt !== undefined
      ? 'provider-accepted' as const
      : grantIntent
        ? 'created' as const
        : 'none' as const
  const deliveryState = !delivery
    ? 'idle' as const
    : retryingAttemptCount > 0
      ? 'retry-scheduled' as const
      : attempts.length > 0 && sentAttemptCount === attempts.length
        ? 'succeeded' as const
        : attempts.length > 0
          && sentAttemptCount + exhaustedAttemptCount === attempts.length
          && exhaustedAttemptCount > 0
          ? 'exhausted' as const
          : 'pending' as const
  return Object.freeze({
    version: 2,
    systemState: notificationsEnabled ? 'enabled' : 'paused',
    subscriptionState: state.subscriptions.length > 0 ? 'active' : 'absent',
    status,
    ...(generation === undefined ? {} : { generation: generation.kind }),
    ...(generation?.kind === 'admitted' ? { authEpoch: generation.authEpoch } : {}),
    activeSubscriptionCount: state.subscriptions.length,
    activeClientFids,
    activeAttemptCount: attempts.length,
    pendingAttemptCount,
    retryingAttemptCount,
    sentAttemptCount,
    exhaustedAttemptCount,
    deliveryAttemptCount: Math.max(
      attempts.reduce((sum, attempt) => sum + attempt.attempts, 0),
      matchingDiagnostics?.deliveryAttemptCount ?? 0,
    ),
    verificationFailureCount: Math.max(
      attempts.reduce((sum, attempt) => sum + attempt.verificationFailures, 0),
      matchingDiagnostics?.verificationFailureCount ?? 0,
    ),
    ...(delivery === undefined ? {} : {
      deliveryQueuedAt: delivery.queuedAt,
      deliveryExpiresAt: delivery.expiresAt,
    }),
    grantState,
    ...(grantIntent === null ? {} : {
      grantCreatedAt: grantIntent.createdAt,
      grantExpiresAt: grantIntent.expiresAt,
      ...(grantIntent.providerAcceptedAt === undefined
        ? {}
        : { providerAcceptedAt: grantIntent.providerAcceptedAt }),
      ...(grantIntent.acknowledgedAt === undefined
        ? {}
        : { clientAcknowledgedAt: grantIntent.acknowledgedAt }),
    }),
    deliveryState,
    retryReasons,
    ...(matchingDiagnostics?.lastAttemptAt === undefined
      ? {}
      : { lastAttemptAt: matchingDiagnostics.lastAttemptAt }),
    ...(matchingDiagnostics?.lastFailureReason === undefined
      ? {}
      : { lastFailureReason: matchingDiagnostics.lastFailureReason }),
    ...(nextAttemptAt === undefined ? {} : { nextAttemptAt }),
  })
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

function defaultAccessRequestResolver(config: BridgeConfig): AccessRequestResolver {
  return new SpacetimeHttpAccessRequestResolver({
    uri: config.spacetimeDbUri,
    database: config.spacetimeDbDatabase,
    issuer: config.issuer,
    audience: config.audience,
    timeoutMs: ACCESS_REQUEST_RESOLVER_TIMEOUT_MILLISECONDS,
  }, {
    signer: claims => signEs256Jwt(config, claims),
  })
}

export class AdmissionNotification {
  private readonly fetchImpl: typeof fetch
  private readonly now: () => number
  private readonly configReader: (env: WorkerEnv) => BridgeConfig
  private readonly configuredAdmissionResolver?: AuthEpochResolver
  private readonly configuredAccessRequestResolver?: AccessRequestResolver
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
    this.configuredAccessRequestResolver = dependencies.accessRequestResolver
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
    let grantIntent = readPendingGrantIntent(
      await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
    )
    let reissueState = readPendingGrantReissueState(
      await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
    )
    if (
      delivery.kind === 'pending-request'
      && !grantMatchesGeneration(grantIntent, delivery, state.fid)
    ) {
      const next = withNextRevision(Object.freeze({ ...pruned, delivery: undefined }))
      await persistAndSchedule(this.state.storage, next, now, null)
      return next
    }
    if (
      delivery.kind === 'pending-request'
      && reissueState
      && !reissueStateMatchesGeneration(reissueState, delivery, state.fid)
    ) {
      const next = withNextRevision(Object.freeze({ ...pruned, delivery: undefined }))
      await persistAndSchedule(this.state.storage, next, now, null)
      return next
    }
    if (now >= delivery.expiresAt) {
      const exhausted = delivery.attempts.some(attempt => attempt.status === 'exhausted')
      const next = withNextRevision(Object.freeze({
        ...pruned,
        delivery: undefined,
        ...(exhausted
          ? delivery.kind === 'admitted'
            ? {
                lastExhaustedAuthEpoch: Math.max(
                  pruned.lastExhaustedAuthEpoch ?? 0,
                  delivery.authEpoch,
                ),
              }
            : {
                lastExhaustedRequestAtMicros: Math.max(
                  pruned.lastExhaustedRequestAtMicros ?? 0,
                  delivery.requestedAtMicros,
                ),
              }
          : {}),
      }))
      await persistAndSchedule(
        this.state.storage,
        next,
        now,
        delivery.kind === 'pending-request' ? null : undefined,
      )
      return next
    }

    if (!config.approvalNotificationsEnabled) {
      // The kill switch invalidates every queued delivery generation. Consent
      // remains revocable through signed disable webhooks, but no stale queue
      // can spring back to life when delivery is enabled again.
      const next = withNextRevision(Object.freeze({ ...pruned, delivery: undefined }))
      await persistAndSchedule(
        this.state.storage,
        next,
        now,
        delivery.kind === 'pending-request' ? null : undefined,
      )
      return next
    }

    // Persisted data is never trusted as an outbound destination. Reapply the
    // current deployment allowlist immediately before every network request.
    let subscriptions = [...pruned.subscriptions]
    let nextBase = pruned
    let invalidatedGeneration = false
    let latestAttemptAt: number | undefined
    let latestFailureReason: AdmissionNotificationRetryReason | undefined
    let outboundAttemptCount = 0
    const attempts: DeliveryAttempt[] = []
    const retryReasons: AdmissionNotificationRetryReason[] = []
    const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
    const requestResolver = this.configuredAccessRequestResolver
      ?? defaultAccessRequestResolver(config)
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
      const latest = await readCombinedState(this.state.storage)
      if (!latest || latest.revision !== state.revision) {
        return latest ?? emptyState(state.fid, now)
      }
      let generationIsCurrent = false
      try {
        const admission = await resolver.resolve(state.fid)
        if (delivery.kind === 'admitted') {
          generationIsCurrent = admission.state === 'enabled'
            && admission.authEpoch === delivery.authEpoch
        } else if (admission.state !== 'enabled') {
          const request = await requestResolver.getStatus(state.fid)
          generationIsCurrent = request.status === 'requested'
            && request.requestedAtMicros === delivery.requestedAtMicros
        }
      } catch {
        // Resolver availability is not a Farcaster delivery attempt. Back it
        // off separately so an upstream outage cannot permanently exhaust the
        // admission epoch before any notification request is made.
        const reason = delivery.kind === 'admitted'
          ? 'admission-verification'
          : 'request-verification'
        retryReasons.push(reason)
        attempts.push(deferForAdmissionVerification(attempt, now, delivery.expiresAt))
        continue
      }
      const afterAdmissionCheck = await readCombinedState(this.state.storage)
      if (!afterAdmissionCheck || afterAdmissionCheck.revision !== state.revision) {
        return afterAdmissionCheck ?? emptyState(state.fid, now)
      }
      if (!generationIsCurrent) {
        const cancelled = withNextRevision(Object.freeze({
          ...afterAdmissionCheck,
          delivery: undefined,
        }))
        await persistAndSchedule(
          this.state.storage,
          cancelled,
          now,
          delivery.kind === 'pending-request' ? null : undefined,
        )
        return cancelled
      }
      const outcome = await sendOne(subscription, delivery, grantIntent, this.fetchImpl)
      outboundAttemptCount += 1
      latestAttemptAt = now
      if (outcome.result === 'successful') {
        if (
          delivery.kind === 'pending-request'
          && grantMatchesGeneration(grantIntent, delivery, state.fid)
          && grantIntent.providerAcceptedAt === undefined
        ) {
          grantIntent = Object.freeze({ ...grantIntent, providerAcceptedAt: now })
          const currentReissueState = reissueStateMatchesGeneration(
            reissueState,
            delivery,
            state.fid,
          )
            ? reissueState
            : createPendingGrantReissueState(
                state.fid,
                delivery.requestedAtMicros,
                grantIntent.createdAt,
              )
          reissueState = Object.freeze({
            ...currentReissueState,
            providerAcceptedAt: now,
          })
        }
        attempts.push(Object.freeze({
          appFid: attempt.appFid,
          tokenId: attempt.tokenId,
          status: 'sent',
          attempts: attempt.attempts + 1,
          verificationFailures: 0,
        }))
      } else if (outcome.result === 'invalid') {
        if (outcome.retryReason) retryReasons.push(outcome.retryReason)
        latestFailureReason = outcome.retryReason ?? 'invalid-response'
        invalidatedGeneration = true
        subscriptions = subscriptions.filter(candidate => candidate.appFid !== attempt.appFid)
        nextBase = withRevokedTokenIds(nextBase, [attempt.tokenId])
      } else if (outcome.result === 'terminal') {
        const reason = outcome.retryReason ?? 'invalid-response'
        latestFailureReason = reason
        retryReasons.push(reason)
        attempts.push(terminalAttempt(attempt))
      } else {
        const reason = outcome.retryReason ?? 'invalid-response'
        latestFailureReason = reason
        retryReasons.push(reason)
        attempts.push(retryAttempt(
          attempt,
          now,
          delivery.expiresAt,
        ))
      }
    }
    const current = await readCombinedState(this.state.storage)
    if (!current || current.revision !== state.revision) {
      // A disable/remove or newer enable/queue event won the race while the
      // network request was in flight. Never resurrect or overwrite it.
      return current ?? emptyState(state.fid, now)
    }
    const next = withNextRevision(Object.freeze({
      ...nextBase,
      subscriptions: Object.freeze(subscriptions),
      delivery: Object.freeze({ ...delivery, attempts: Object.freeze(attempts) }),
      ...(delivery.kind === 'admitted'
        && attempts.length > 0
        && attempts.every(attempt => attempt.status === 'sent')
        ? {
            lastSentAuthEpoch: Math.max(
              nextBase.lastSentAuthEpoch ?? 0,
              delivery.authEpoch,
            ),
          }
        : {}),
      ...(invalidatedGeneration || (
        attempts.length > 0
        && attempts.some(attempt => attempt.status === 'exhausted')
        && attempts.every(attempt => (
          attempt.status === 'sent' || attempt.status === 'exhausted'
        ))
      )
        ? delivery.kind === 'admitted'
          ? {
              lastExhaustedAuthEpoch: Math.max(
                nextBase.lastExhaustedAuthEpoch ?? 0,
                delivery.authEpoch,
              ),
            }
          : {
              lastExhaustedRequestAtMicros: Math.max(
                nextBase.lastExhaustedRequestAtMicros ?? 0,
                delivery.requestedAtMicros,
              ),
            }
        : {}),
    }))
    // Keep the bounded delivery while the client grant remains unacknowledged.
    // Provider acceptance is only transport evidence; it never writes the
    // legacy pending-request success receipt that older operator code treated
    // as admission authorization.
    await persistAndSchedule(
      this.state.storage,
      next,
      now,
      delivery.kind === 'pending-request' ? grantIntent : undefined,
      delivery.kind === 'pending-request' ? reissueState ?? undefined : undefined,
    )
    try {
      await recordDiagnostics(
        this.state.storage,
        deliveryGeneration(delivery),
        retryReasons,
        delivery.attempts.reduce((sum, attempt) => sum + attempt.attempts, 0)
          + outboundAttemptCount,
        attempts.reduce((sum, attempt) => sum + attempt.verificationFailures, 0),
        latestAttemptAt,
        latestFailureReason,
      )
    } catch {
      // Diagnostics are subordinate to delivery state. Losing a static reason
      // must not turn an idempotently queued send into an apparent failure.
    }
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

    if (url.pathname === '/status') {
      if (!isRecord(value) || !exactKeys(value, ['fid']) || !isSafeFid(value.fid)) {
        return new Response(null, { status: 400 })
      }
      const existing = await readCombinedState(this.state.storage)
      if (existing && existing.fid !== value.fid) return new Response(null, { status: 409 })
      const diagnostics = readPersistedDiagnostics(
        await this.state.storage.get<unknown>(DIAGNOSTICS_RECORD),
      )
      const grantIntent = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      const reissueState = readPendingGrantReissueState(
        await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
      )
      return new Response(JSON.stringify(
        diagnosticsForState(
          existing ? pruneSubscriptions(existing, config, this.currentTime()) : null,
          diagnostics,
          grantIntent,
          reissueState,
          config.approvalNotificationsEnabled,
        ),
      ), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
    }

    if (url.pathname === '/ack') {
      if (
        !isRecord(value)
        || !exactKeys(value, ['fid', 'ticket', 'notificationId'])
        || !isSafeFid(value.fid)
        || !isGrantTicket(value.ticket)
        || typeof value.notificationId !== 'string'
        || !/^warpkeep-access-grant-v3-i[A-Za-z0-9_-]{22}$/.test(
          value.notificationId,
        )
      ) return new Response(null, { status: 400 })
      const neutral = (status: AdmissionNotificationAcknowledgementStatus) => (
        new Response(JSON.stringify({ status }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      )
      const now = this.currentTime()
      const existing = await readCombinedState(this.state.storage)
      const grantIntent = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      if (
        !existing
        || existing.fid !== value.fid
        || !grantIntent
        || grantIntent.fid !== value.fid
        || !(await timingSafeGrantTicketMatch(value.ticket, grantIntent))
      ) return neutral('stale')
      if (
        value.notificationId
        !== `warpkeep-access-grant-v3-i${grantIntent.intentId}`
      ) return neutral('context-mismatch')
      if (!config.approvalNotificationsEnabled) {
        const delivery = existing.delivery?.kind === 'pending-request'
          && existing.delivery.requestedAtMicros === grantIntent.requestedAtMicros
          ? undefined
          : existing.delivery
        const next = withNextRevision(Object.freeze({ ...existing, delivery }))
        await persistAndSchedule(this.state.storage, next, now, null)
        return neutral('stale')
      }
      if (grantIntent.expiresAt <= now) {
        const delivery = existing.delivery?.kind === 'pending-request'
          && existing.delivery.requestedAtMicros === grantIntent.requestedAtMicros
          ? undefined
          : existing.delivery
        const next = withNextRevision(Object.freeze({ ...existing, delivery }))
        await persistAndSchedule(this.state.storage, next, now, null)
        return neutral('stale')
      }
      if (grantIntent.providerAcceptedAt === undefined) return neutral('not-ready')

      const invalidateGrant = async (): Promise<Response> => {
        const delivery = existing.delivery?.kind === 'pending-request'
          && existing.delivery.requestedAtMicros === grantIntent.requestedAtMicros
          ? undefined
          : existing.delivery
        const next = withNextRevision(Object.freeze({ ...existing, delivery }))
        await persistAndSchedule(this.state.storage, next, now, null)
        return neutral('stale')
      }

      const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
      const requestResolver = this.configuredAccessRequestResolver
        ?? defaultAccessRequestResolver(config)
      try {
        const admission = await resolver.resolve(existing.fid)
        if (admission.state === 'enabled') return invalidateGrant()
        const request = await requestResolver.getStatus(existing.fid)
        if (
          request.status !== 'requested'
          || request.requestedAtMicros !== grantIntent.requestedAtMicros
        ) return invalidateGrant()
      } catch {
        return neutral('not-ready')
      }

      const latest = await readCombinedState(this.state.storage)
      const latestGrant = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      const latestReissueState = readPendingGrantReissueState(
        await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
      )
      if (
        !latest
        || latest.revision !== existing.revision
        || !latestGrant
        || latestGrant.intentId !== grantIntent.intentId
        || latestGrant.providerAcceptedAt === undefined
        || (
          latestReissueState !== null
          && !reissueStateMatchesGeneration(
            latestReissueState,
            {
              kind: 'pending-request',
              requestedAtMicros: latestGrant.requestedAtMicros,
            },
            latestGrant.fid,
          )
        )
        || !(await timingSafeGrantTicketMatch(value.ticket, latestGrant))
      ) return neutral('stale')
      if (
        value.notificationId
        !== `warpkeep-access-grant-v3-i${latestGrant.intentId}`
      ) return neutral('context-mismatch')
      if (latestGrant.acknowledgedAt !== undefined) return neutral('accepted')
      const delivery = latest.delivery?.kind === 'pending-request'
        && latest.delivery.requestedAtMicros === latestGrant.requestedAtMicros
        ? undefined
        : latest.delivery
      const next = withNextRevision(Object.freeze({ ...latest, delivery }))
      const nextReissueState = Object.freeze({
        ...(latestReissueState ?? createPendingGrantReissueState(
          latestGrant.fid,
          latestGrant.requestedAtMicros,
          latestGrant.createdAt,
        )),
        providerAcceptedAt: latestGrant.providerAcceptedAt,
        clientAcknowledgedAt: now,
      })
      await persistAndSchedule(this.state.storage, next, now, Object.freeze({
        version: 1 as const,
        fid: latestGrant.fid,
        requestedAtMicros: latestGrant.requestedAtMicros,
        intentId: latestGrant.intentId,
        createdAt: latestGrant.createdAt,
        expiresAt: latestGrant.expiresAt,
        providerAcceptedAt: latestGrant.providerAcceptedAt,
        acknowledgedAt: now,
        ticketHash: await grantTicketHash(value.ticket),
      }), nextReissueState)
      return neutral('accepted')
    }

    if (url.pathname === '/reissue') {
      if (!validReissueInput(value)) return new Response(null, { status: 400 })
      const respond = (result: AdmissionNotificationReissueResult): Response => (
        new Response(JSON.stringify(result), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      )
      if (!config.approvalNotificationsEnabled) {
        return respond(Object.freeze({ status: 'paused' }))
      }
      const now = this.currentTime()
      if (Math.abs(now - value.reissuedAt) > 60_000) return new Response(null, { status: 400 })
      let existing = await readCombinedState(this.state.storage)
      let grantIntent = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      let reissueState = readPendingGrantReissueState(
        await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
      )
      if (!existing || existing.fid !== value.fid) {
        return respond(Object.freeze({ status: 'stale' }))
      }

      const invalidateCurrentGrant = async (): Promise<AdmissionNotificationReissueResult> => {
        const delivery = existing!.delivery?.kind === 'pending-request'
          && existing!.delivery.requestedAtMicros === value.requestedAtMicros
          ? undefined
          : existing!.delivery
        existing = withNextRevision(Object.freeze({ ...existing!, delivery }))
        await persistAndSchedule(this.state.storage, existing, now, null)
        return Object.freeze({ status: 'stale' })
      }

      if (
        reissueState
        && (
          reissueState.fid !== value.fid
          || reissueState.requestedAtMicros !== value.requestedAtMicros
        )
      ) {
        return respond(Object.freeze({ status: 'stale' }))
      }

      const generation = Object.freeze({
        kind: 'pending-request' as const,
        requestedAtMicros: value.requestedAtMicros,
      })
      if (!reissueState) {
        if (!grantMatchesGeneration(grantIntent, generation, value.fid)) {
          return respond(Object.freeze({ status: 'stale' }))
        }
        reissueState = Object.freeze({
          ...createPendingGrantReissueState(
            value.fid,
            value.requestedAtMicros,
            grantIntent.createdAt,
          ),
          ...(grantIntent.providerAcceptedAt === undefined
            ? {}
            : { providerAcceptedAt: grantIntent.providerAcceptedAt }),
          ...(grantIntent.acknowledgedAt === undefined
            ? {}
            : { clientAcknowledgedAt: grantIntent.acknowledgedAt }),
        })
        existing = withNextRevision(existing)
        await persistAndSchedule(
          this.state.storage,
          existing,
          now,
          grantIntent,
          reissueState,
        )
      } else if (grantMatchesGeneration(grantIntent, generation, value.fid)) {
        const shouldRecordProvider = reissueState.providerAcceptedAt === undefined
          && grantIntent.providerAcceptedAt !== undefined
        const shouldRecordAcknowledgement = reissueState.clientAcknowledgedAt === undefined
          && grantIntent.acknowledgedAt !== undefined
        if (shouldRecordProvider || shouldRecordAcknowledgement) {
          reissueState = Object.freeze({
            ...reissueState,
            ...(shouldRecordProvider
              ? { providerAcceptedAt: grantIntent.providerAcceptedAt }
              : {}),
            ...(shouldRecordAcknowledgement
              ? { clientAcknowledgedAt: grantIntent.acknowledgedAt }
              : {}),
          })
          existing = withNextRevision(existing)
          await persistAndSchedule(
            this.state.storage,
            existing,
            now,
            grantIntent,
            reissueState,
          )
        }
      }

      if (reissueState.clientAcknowledgedAt !== undefined) {
        return respond(Object.freeze({ status: 'client-acknowledged' }))
      }
      if (reissueState.providerAcceptedAt === undefined) {
        return respond(Object.freeze({ status: 'not-ready' }))
      }

      const pruned = pruneSubscriptions(existing, config, now)
      if (pruned.subscriptions.length === 0) {
        if (pruned !== existing) {
          existing = withNextRevision(pruned)
          await persistAndSchedule(this.state.storage, existing, now)
        }
        return respond(Object.freeze({ status: 'not-subscribed' }))
      }
      const expectedRevision = existing.revision
      const expectedIntentId = grantMatchesGeneration(grantIntent, generation, value.fid)
        ? grantIntent.intentId
        : undefined
      const expectedReissueCount = reissueState.reissueCount
      const expectedLastReissuedAt = reissueState.lastReissuedAt
      const expectedProviderAcceptedAt = reissueState.providerAcceptedAt
      const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
      const requestResolver = this.configuredAccessRequestResolver
        ?? defaultAccessRequestResolver(config)
      try {
        const admission = await resolver.resolve(value.fid)
        if (admission.state !== 'disabled') return respond(await invalidateCurrentGrant())
        const requestStatus = await requestResolver.getStatus(value.fid)
        if (
          requestStatus.status !== 'requested'
          || requestStatus.requestedAtMicros !== value.requestedAtMicros
        ) return respond(await invalidateCurrentGrant())
      } catch {
        return new Response(null, { status: 503 })
      }

      const latest = await readCombinedState(this.state.storage)
      const latestGrant = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      const latestReissueState = readPendingGrantReissueState(
        await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
      )
      if (
        !latest
        || latest.revision !== expectedRevision
        || !reissueStateMatchesGeneration(latestReissueState, generation, value.fid)
        || latestReissueState.reissueCount !== expectedReissueCount
        || latestReissueState.lastReissuedAt !== expectedLastReissuedAt
        || latestReissueState.providerAcceptedAt !== expectedProviderAcceptedAt
        || latestReissueState.clientAcknowledgedAt !== undefined
        || (
          expectedIntentId === undefined
            ? grantMatchesGeneration(latestGrant, generation, value.fid)
            : !grantMatchesGeneration(latestGrant, generation, value.fid)
              || latestGrant.intentId !== expectedIntentId
        )
      ) return respond(Object.freeze({ status: 'stale' }))
      existing = latest
      grantIntent = latestGrant
      reissueState = latestReissueState
      if (reissueState.reissueCount >= MAX_PENDING_GRANT_REISSUES) {
        return respond(Object.freeze({ status: 'limit-reached' }))
      }
      // A delayed retry can reach Farcaster well after the reissue was
      // created. Start the next quiet window at the latest provider handoff,
      // not merely at intent creation, so transport backoff cannot collapse
      // two player-visible notifications together.
      const cooldownStartedAt = reissueState.providerAcceptedAt!
      const retryAt = cooldownStartedAt + PENDING_GRANT_REISSUE_COOLDOWN_MILLISECONDS
      if (now < retryAt) {
        return respond(Object.freeze({
          status: 'cooldown',
          retryAfterSeconds: Math.ceil((retryAt - now) / 1_000),
        }))
      }

      const nextGrant = createPendingGrantIntent(value.fid, value.requestedAtMicros, now)
      const {
        providerAcceptedAt: _providerAcceptedAt,
        clientAcknowledgedAt: _clientAcknowledgedAt,
        ...retainedReissueState
      } = reissueState
      const nextReissueState = Object.freeze({
        ...retainedReissueState,
        reissueCount: reissueState.reissueCount + 1,
        lastReissuedAt: now,
      })
      const delivery: AdmissionDelivery = Object.freeze({
        kind: 'pending-request',
        requestedAtMicros: value.requestedAtMicros,
        queuedAt: now,
        expiresAt: nextGrant.expiresAt,
        attempts: Object.freeze([]),
      })
      let next = withNextRevision(Object.freeze({
        ...existing,
        delivery: Object.freeze({
          ...delivery,
          attempts: attemptsForSubscriptions(delivery, existing.subscriptions),
        }),
      }))
      await persistAndSchedule(
        this.state.storage,
        next,
        now,
        nextGrant,
        nextReissueState,
      )
      next = await this.attemptDelivery(next)
      const deliveredGrant = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      return respond(Object.freeze({
        status: 'reissued',
        deliveryStatus: queueStatus(next, deliveredGrant),
      }))
    }

    if (url.pathname === '/event') {
      if (!validVerifiedEvent(value, config)) return new Response(null, { status: 400 })
      // An add event without notification details records no consent and must
      // not cause the player FID or any host metadata to be persisted.
      if (value.event.type === 'observed') return new Response(null, { status: 204 })
      const now = this.currentTime()
      const existing = await readCombinedState(this.state.storage)
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
        next = withRevokedTokenIds(
          next,
          next.subscriptions
            .filter(candidate => (
              candidate.appFid === value.appFid && candidate.tokenId !== id
            ))
            .map(candidate => candidate.tokenId),
        )
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
      await persistAndSchedule(
        this.state.storage,
        next,
        now,
        value.event.type === 'disabled' && next.subscriptions.length === 0
          ? null
          : undefined,
      )
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
      let existing = await readCombinedState(this.state.storage)
      if (existing && existing.fid !== value.fid) return new Response(null, { status: 409 })
      let next = existing ?? emptyState(value.fid, now)
      const generation: AdmissionNotificationGeneration = value.kind === 'pending-request'
        ? Object.freeze({
            kind: 'pending-request',
            requestedAtMicros: value.requestedAtMicros,
          })
        : Object.freeze({ kind: 'admitted', authEpoch: value.authEpoch })
      let grantIntent = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      let reissueState = readPendingGrantReissueState(
        await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
      )
      if (generation.kind === 'admitted' && sentForGeneration(next, generation)) {
        return new Response(JSON.stringify({ status: 'already-sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        generation.kind === 'admitted'
        && exhaustedForGeneration(next, generation)
      ) {
        return new Response(JSON.stringify({ status: 'delivery-exhausted' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        next.delivery?.kind === 'admitted'
        && generation.kind === 'admitted'
        && generation.authEpoch < next.delivery.authEpoch
      ) {
        return new Response(null, { status: 409 })
      }
      if (
        next.delivery?.kind === 'pending-request'
        && generation.kind === 'pending-request'
        && generation.requestedAtMicros < next.delivery.requestedAtMicros
      ) {
        return new Response(null, { status: 409 })
      }
      const respond = (status: AdmissionNotificationQueueStatus): Response => (
        new Response(JSON.stringify({ status }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      )

      let newGrant = false
      if (generation.kind === 'pending-request') {
        if (
          (reissueState && reissueState.requestedAtMicros > generation.requestedAtMicros)
          || (grantIntent && grantIntent.requestedAtMicros > generation.requestedAtMicros)
        ) return new Response(null, { status: 409 })

        if (!reissueState && grantMatchesGeneration(grantIntent, generation, value.fid)) {
          reissueState = Object.freeze({
            ...createPendingGrantReissueState(
              value.fid,
              generation.requestedAtMicros,
              grantIntent.createdAt,
            ),
            ...(grantIntent.providerAcceptedAt === undefined
              ? {}
              : { providerAcceptedAt: grantIntent.providerAcceptedAt }),
            ...(grantIntent.acknowledgedAt === undefined
              ? {}
              : { clientAcknowledgedAt: grantIntent.acknowledgedAt }),
          })
          next = withNextRevision(next)
          await persistAndSchedule(
            this.state.storage,
            next,
            now,
            grantIntent,
            reissueState,
          )
          existing = next
        }

        const observedReissueState = reissueState
        if (reissueStateMatchesGeneration(reissueState, generation, value.fid)) {
          if (
            grantIntent
            && !grantMatchesGeneration(grantIntent, generation, value.fid)
          ) return new Response(null, { status: 409 })

          if (
            grantMatchesGeneration(grantIntent, generation, value.fid)
            && grantIntent.expiresAt <= now
          ) {
            if (
              next.delivery?.kind === 'pending-request'
              && next.delivery.requestedAtMicros === generation.requestedAtMicros
            ) next = Object.freeze({ ...next, delivery: undefined })
            next = withNextRevision(next)
            await persistAndSchedule(this.state.storage, next, now, null)
            grantIntent = null
          }

          if (!grantMatchesGeneration(grantIntent, generation, value.fid)) {
            if (
              next.delivery?.kind === 'pending-request'
              && next.delivery.requestedAtMicros === generation.requestedAtMicros
            ) {
              next = withNextRevision(Object.freeze({ ...next, delivery: undefined }))
              await persistAndSchedule(this.state.storage, next, now, null)
            }
            return respond(pendingGenerationStatus(
              next,
              generation,
              grantIntent,
              reissueState,
            ))
          }

          if (
            reissueState.providerAcceptedAt === undefined
            && grantIntent.providerAcceptedAt !== undefined
            || reissueState.clientAcknowledgedAt === undefined
              && grantIntent.acknowledgedAt !== undefined
          ) {
            reissueState = Object.freeze({
              ...reissueState,
              ...(grantIntent.providerAcceptedAt === undefined
                ? {}
                : { providerAcceptedAt: grantIntent.providerAcceptedAt }),
              ...(grantIntent.acknowledgedAt === undefined
                ? {}
                : { clientAcknowledgedAt: grantIntent.acknowledgedAt }),
            })
            next = withNextRevision(next)
            await persistAndSchedule(
              this.state.storage,
              next,
              now,
              grantIntent,
              reissueState,
            )
          }
          if (
            grantIntent.providerAcceptedAt !== undefined
            || grantIntent.acknowledgedAt !== undefined
            || next.delivery?.kind !== 'pending-request'
            || next.delivery.requestedAtMicros !== generation.requestedAtMicros
          ) return respond(pendingGenerationStatus(next, generation, grantIntent, reissueState))
        } else {
          if (
            observedReissueState
            && generation.requestedAtMicros <= observedReissueState.requestedAtMicros
          ) return new Response(null, { status: 409 })

          const expectedRevision = next.revision
          const expectedStatePersisted = existing !== null
          const expectedGrantIntentId = grantIntent?.intentId
          const expectedReissueRequest = observedReissueState?.requestedAtMicros
          const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
          const requestResolver = this.configuredAccessRequestResolver
            ?? defaultAccessRequestResolver(config)
          try {
            const admission = await resolver.resolve(value.fid)
            if (admission.state !== 'disabled') return new Response(null, { status: 409 })
            const requestStatus = await requestResolver.getStatus(value.fid)
            if (
              requestStatus.status !== 'requested'
              || requestStatus.requestedAtMicros !== generation.requestedAtMicros
            ) return new Response(null, { status: 409 })
          } catch {
            return new Response(null, { status: 503 })
          }
          const latest = await readCombinedState(this.state.storage)
          const latestGrant = readPendingGrantIntent(
            await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
          )
          const latestReissueState = readPendingGrantReissueState(
            await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
          )
          if (
            (expectedStatePersisted
              ? !latest || latest.revision !== expectedRevision
              : latest !== null)
            || latestGrant?.intentId !== expectedGrantIntentId
            || latestReissueState?.requestedAtMicros !== expectedReissueRequest
          ) return new Response(null, { status: 409 })
          next = latest ?? next
          grantIntent = createPendingGrantIntent(
            value.fid,
            generation.requestedAtMicros,
            now,
          )
          reissueState = createPendingGrantReissueState(
            value.fid,
            generation.requestedAtMicros,
            now,
          )
          newGrant = true
        }
      }
      const diagnostics = readPersistedDiagnostics(
        await this.state.storage.get<unknown>(DIAGNOSTICS_RECORD),
      )
      next = recoverLegacyTransportBackoff(next, diagnostics, generation, now)
      if (
        newGrant
        || !next.delivery
        || !generationEquals(deliveryGeneration(next.delivery), generation)
      ) {
        const delivery: AdmissionDelivery = Object.freeze({
          ...generation,
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
      await persistAndSchedule(
        this.state.storage,
        next,
        now,
        generation.kind === 'pending-request' ? grantIntent : undefined,
        generation.kind === 'pending-request' ? reissueState ?? undefined : undefined,
      )
      next = await this.attemptDelivery(next)
      grantIntent = readPendingGrantIntent(
        await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
      )
      return respond(queueStatus(next, grantIntent))
    }

    return new Response(null, { status: 404 })
  }

  async alarm(): Promise<void> {
    await this.serialized(() => this.handleAlarm())
  }

  private async handleAlarm(): Promise<void> {
    let state = await readCombinedState(this.state.storage)
    if (!state) {
      await purgePersistedState(this.state.storage)
      return
    }
    const now = this.currentTime()
    if (now >= state.retentionExpiresAt) {
      await purgePersistedState(this.state.storage)
      return
    }
    let grantIntent = readPendingGrantIntent(
      await this.state.storage.get<unknown>(PENDING_GRANT_RECORD),
    )
    if (grantIntent && grantIntent.expiresAt <= now) {
      const delivery = state.delivery?.kind === 'pending-request'
        && state.delivery.requestedAtMicros === grantIntent.requestedAtMicros
        ? undefined
        : state.delivery
      state = withNextRevision(Object.freeze({ ...state, delivery }))
      await persistAndSchedule(this.state.storage, state, now, null)
      grantIntent = null
    }
    try {
      this.config()
    } catch {
      // Configuration loss can suppress delivery but never unbound cleanup.
      // Keep active 24-hour work recoverable after a transient rollout fault;
      // an idle consent record still sleeps until its retention boundary.
      await this.state.storage.setAlarm(state.delivery
        ? Math.min(
            state.delivery.expiresAt,
            grantIntent?.expiresAt ?? state.retentionExpiresAt,
            state.retentionExpiresAt,
            now + RETRY_DELAYS_MILLISECONDS[0],
          )
        : Math.min(
            grantIntent?.expiresAt ?? state.retentionExpiresAt,
            state.retentionExpiresAt,
          ))
      return
    }
    const next = await this.attemptDelivery(state)
    const retainedReissueState = readPendingGrantReissueState(
      await this.state.storage.get<unknown>(PENDING_GRANT_REISSUE_RECORD),
    )
    if (
      !next.delivery
      && retainedReissueState === null
      && next.subscriptions.length === 0
      && next.revokedTokenIds.length === 0
      && next.lastSentAuthEpoch === undefined
      && next.lastExhaustedAuthEpoch === undefined
      && next.lastSentRequestAtMicros === undefined
      && next.lastExhaustedRequestAtMicros === undefined
    ) {
      await purgePersistedState(this.state.storage)
    }
  }
}
