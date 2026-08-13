import {
  readBridgeConfig,
  type BridgeConfig,
  type MiniAppNotificationConfig,
} from './config'
import { signEs256Jwt } from './jwt'
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
  AdmissionNotificationGeneration,
  AdmissionNotificationQueueInput,
  AdmissionNotificationRecoveryInput,
  AdmissionNotificationQueueStatus,
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
const DIAGNOSTICS_RECORD = 'admission-notification-diagnostics-v1'
const STATE_VERSION = 1
const MAX_SUBSCRIPTIONS = 8
const MAX_SEEN_EVENTS = 32
const MAX_REVOKED_TOKEN_IDS = 32
const MAX_DELIVERY_ATTEMPTS = 6
const MAX_VERIFICATION_FAILURES = 64
const DELIVERY_LIFETIME_MILLISECONDS = 24 * 60 * 60 * 1_000
const DELIVERY_TIMEOUT_MILLISECONDS = 15_000
const DELIVERY_RESPONSE_MAX_BYTES = 64 * 1_024
const MAX_NOTIFICATION_TOKEN_BYTES = 2 * 1_024
const SUBSCRIPTION_MAX_LIFETIME_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000
const TARGET_URL = 'https://warpkeep.com/?miniApp=true'
const ADMISSION_NOTIFICATION_TITLE = 'Welcome to the Hegemony Empire'
const ADMISSION_NOTIFICATION_BODY =
  'The gates have answered your name. Cross the threshold, Founder—your legacy awaits.'
const RETRY_DELAYS_MILLISECONDS = Object.freeze([
  30_000,
  2 * 60_000,
  10 * 60_000,
  60 * 60_000,
  4 * 60 * 60_000,
  12 * 60 * 60_000,
])

export const ADMISSION_NOTIFICATION_DELIVERY_CONTRACT_PROFILE =
  'warpkeep.admission-notification.delivery-contract.v1' as const

/**
 * Canonical, non-secret delivery contract used by the public release
 * attestation and protected deployment tooling. Runtime coordinates are
 * normalized by readBridgeConfig before reaching this boundary. The operator
 * secret is deliberately neither serialized nor hashed.
 */
export function admissionNotificationDeliveryContractVector(
  config: MiniAppNotificationConfig,
): readonly unknown[] {
  const hubUrls = Object.freeze([...config.hubUrls].sort())
  const clients = Object.freeze([...config.clients]
    .sort((left, right) => (
      left.appFid - right.appFid
      || (left.deliveryUrl < right.deliveryUrl
        ? -1
        : left.deliveryUrl > right.deliveryUrl ? 1 : 0)
    ))
    .map(client => Object.freeze([
      String(client.appFid),
      client.deliveryUrl,
    ])))
  return Object.freeze([
    ADMISSION_NOTIFICATION_DELIVERY_CONTRACT_PROFILE,
    Object.freeze(['hubUrls', hubUrls]),
    Object.freeze(['clients', clients]),
    Object.freeze(['targetUrl', TARGET_URL]),
    Object.freeze(['title', ADMISSION_NOTIFICATION_TITLE]),
    Object.freeze(['body', ADMISSION_NOTIFICATION_BODY]),
    Object.freeze([
      'notificationIdProfile',
      'warpkeep-access-approved-v2-r<requestedAtMicros>',
    ]),
    Object.freeze(['maximumDeliveryAttempts', MAX_DELIVERY_ATTEMPTS]),
    Object.freeze(['retryDelaysMilliseconds', RETRY_DELAYS_MILLISECONDS]),
    Object.freeze(['deliveryLifetimeMilliseconds', DELIVERY_LIFETIME_MILLISECONDS]),
  ])
}

export function serializeAdmissionNotificationDeliveryContract(
  config: MiniAppNotificationConfig,
): string {
  return JSON.stringify(admissionNotificationDeliveryContractVector(config))
}

export async function admissionNotificationDeliveryContractDigest(
  config: MiniAppNotificationConfig,
): Promise<string> {
  const bytes = new TextEncoder().encode(
    serializeAdmissionNotificationDeliveryContract(config),
  )
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return Array.from(
      digest,
      byte => byte.toString(16).padStart(2, '0'),
    ).join('')
  } finally {
    bytes.fill(0)
  }
}

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
  lastAttemptAt?: number
  lastFailureReason?: AdmissionNotificationRetryReason
}>

type AdmissionDelivery = Readonly<{
  queuedAt: number
  expiresAt: number
  attempts: readonly DeliveryAttempt[]
  recoveryId?: string
}> & AdmissionNotificationGeneration

type RetiredAdmittedQueueInput = Readonly<{
  fid: string
  queuedAt: number
  authEpoch: number
  kind?: 'admitted'
}>

type InternalAdmissionNotificationQueueInput =
  | AdmissionNotificationQueueInput
  | RetiredAdmittedQueueInput

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
  lastRecoveryRequestAtMicros?: number
  lastRecoveryId?: string
  lastRecoveryAt?: number
  delivery?: AdmissionDelivery
}>

type PersistedPendingNotificationState = Readonly<{
  version: 1
  fid: string
  lastSentRequestAtMicros?: number
  lastExhaustedRequestAtMicros?: number
  lastRecoveryRequestAtMicros?: number
  lastRecoveryId?: string
  lastRecoveryAt?: number
  delivery?: Readonly<{
    requestedAtMicros: number
    queuedAt: number
    expiresAt: number
    attempts: readonly DeliveryAttempt[]
    recoveryId?: string
  }>
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

function isRecoveryId(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value)
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
      ],
    )
    || !Array.isArray(value.retryReasons)
    || value.retryReasons.some(reason => !isRetryReason(reason))
    || new Set(value.retryReasons).size !== value.retryReasons.length
    || (value.lastAttemptAt !== undefined && !isTimestamp(value.lastAttemptAt))
    || (value.lastFailureReason !== undefined && !isRetryReason(value.lastFailureReason))
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
      [
        'delivery',
        'lastSentRequestAtMicros',
        'lastExhaustedRequestAtMicros',
        'lastRecoveryRequestAtMicros',
        'lastRecoveryId',
        'lastRecoveryAt',
      ],
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
    || (
      value.lastRecoveryRequestAtMicros !== undefined
      && !isRequestedAtMicros(value.lastRecoveryRequestAtMicros)
    )
    || (value.lastRecoveryId !== undefined && !isRecoveryId(value.lastRecoveryId))
    || (value.lastRecoveryAt !== undefined && !isTimestamp(value.lastRecoveryAt))
    || new Set([
      value.lastRecoveryRequestAtMicros !== undefined,
      value.lastRecoveryId !== undefined,
      value.lastRecoveryAt !== undefined,
    ]).size !== 1
  ) throw new Error('Invalid pending admission notification state.')
  let delivery: PersistedPendingNotificationState['delivery']
  if (value.delivery !== undefined) {
    if (
      !isRecord(value.delivery)
      || !exactKeys(
        value.delivery,
        ['requestedAtMicros', 'queuedAt', 'expiresAt', 'attempts'],
        ['recoveryId'],
      )
      || !isRequestedAtMicros(value.delivery.requestedAtMicros)
      || !isTimestamp(value.delivery.queuedAt)
      || !isTimestamp(value.delivery.expiresAt)
      || value.delivery.expiresAt <= value.delivery.queuedAt
      || value.delivery.expiresAt - value.delivery.queuedAt
        !== DELIVERY_LIFETIME_MILLISECONDS
      || (value.delivery.recoveryId !== undefined && !isRecoveryId(value.delivery.recoveryId))
    ) throw new Error('Invalid pending admission notification state.')
    const attempts = readDeliveryAttempts(value.delivery.attempts)
    if (!attempts) throw new Error('Invalid pending admission notification state.')
    delivery = Object.freeze({
      requestedAtMicros: value.delivery.requestedAtMicros,
      queuedAt: value.delivery.queuedAt,
      expiresAt: value.delivery.expiresAt,
      attempts,
      ...(value.delivery.recoveryId === undefined
        ? {}
        : { recoveryId: value.delivery.recoveryId }),
    })
  }
  const recoveryRequestAtMicros = value.lastRecoveryRequestAtMicros
  const recoveryPresent = recoveryRequestAtMicros !== undefined
  if (
    recoveryPresent
    && (
      value.lastExhaustedRequestAtMicros === undefined
      || value.lastExhaustedRequestAtMicros < recoveryRequestAtMicros
      || (
        delivery !== undefined
        && delivery.requestedAtMicros === recoveryRequestAtMicros
        && (
          delivery.recoveryId !== value.lastRecoveryId
          || delivery.queuedAt !== value.lastRecoveryAt
        )
      )
    )
  ) throw new Error('Invalid pending admission notification state.')
  if (
    delivery?.recoveryId !== undefined
    && (
      !recoveryPresent
      || delivery.requestedAtMicros !== recoveryRequestAtMicros
      || delivery.recoveryId !== value.lastRecoveryId
      || delivery.queuedAt !== value.lastRecoveryAt
    )
  ) throw new Error('Invalid pending admission notification state.')
  return Object.freeze({
    version: 1,
    fid: value.fid,
    ...(value.lastSentRequestAtMicros === undefined
      ? {}
      : { lastSentRequestAtMicros: value.lastSentRequestAtMicros }),
    ...(value.lastExhaustedRequestAtMicros === undefined
      ? {}
      : { lastExhaustedRequestAtMicros: value.lastExhaustedRequestAtMicros }),
    ...(value.lastRecoveryRequestAtMicros === undefined
      ? {}
      : { lastRecoveryRequestAtMicros: value.lastRecoveryRequestAtMicros }),
    ...(value.lastRecoveryId === undefined ? {} : { lastRecoveryId: value.lastRecoveryId }),
    ...(value.lastRecoveryAt === undefined ? {} : { lastRecoveryAt: value.lastRecoveryAt }),
    ...(delivery ? { delivery } : {}),
  })
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
    ...(pending?.lastRecoveryRequestAtMicros === undefined
      ? {}
      : { lastRecoveryRequestAtMicros: pending.lastRecoveryRequestAtMicros }),
    ...(pending?.lastRecoveryId === undefined
      ? {}
      : { lastRecoveryId: pending.lastRecoveryId }),
    ...(pending?.lastRecoveryAt === undefined
      ? {}
      : { lastRecoveryAt: pending.lastRecoveryAt }),
    ...(!legacy.delivery && pending?.delivery
      ? {
          delivery: Object.freeze({
            kind: 'pending-request' as const,
            requestedAtMicros: pending.delivery.requestedAtMicros,
            queuedAt: pending.delivery.queuedAt,
            expiresAt: pending.delivery.expiresAt,
            attempts: pending.delivery.attempts,
            ...(pending.delivery.recoveryId === undefined
              ? {}
              : { recoveryId: pending.delivery.recoveryId }),
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

function internalUrl(path: 'event' | 'queue' | 'recover' | 'status'): string {
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

async function readDiagnostics(response: Response): Promise<AdmissionNotificationDiagnostics> {
  if (!response.ok) throw new Error('Admission notification store unavailable.')
  const value: unknown = await response.json()
  if (
    !isRecord(value)
    || !exactKeys(
      value,
      [
        'status',
        'deliveryAttemptCount',
        'verificationFailureCount',
        'subscribed',
        'recoveryCount',
        'retryReasons',
      ],
      [
        'generation',
        'authEpoch',
        'requestedAtMicros',
        'lastRecoveryAt',
        'lastAttemptAt',
        'lastFailureReason',
        'nextAttemptAt',
      ],
    )
    || (
      value.status !== 'queued'
      && value.status !== 'already-sent'
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
    || (value.generation === 'pending-request' && !isRequestedAtMicros(value.requestedAtMicros))
    || (value.generation === 'admitted' && !isAuthEpoch(value.authEpoch))
    || (value.generation !== 'pending-request' && value.requestedAtMicros !== undefined)
    || typeof value.deliveryAttemptCount !== 'number'
    || !Number.isSafeInteger(value.deliveryAttemptCount)
    || value.deliveryAttemptCount < 0
    || typeof value.verificationFailureCount !== 'number'
    || !Number.isSafeInteger(value.verificationFailureCount)
    || value.verificationFailureCount < 0
    || typeof value.subscribed !== 'boolean'
    || typeof value.recoveryCount !== 'number'
    || !Number.isSafeInteger(value.recoveryCount)
    || value.recoveryCount < 0
    || value.recoveryCount > 1
    || (value.lastRecoveryAt !== undefined && !isTimestamp(value.lastRecoveryAt))
    || (value.recoveryCount === 0) !== (value.lastRecoveryAt === undefined)
    || (value.recoveryCount === 1 && value.generation !== 'pending-request')
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
    status: value.status,
    ...(value.generation === undefined ? {} : { generation: value.generation }),
    ...(value.authEpoch === undefined ? {} : { authEpoch: value.authEpoch }),
    ...(value.requestedAtMicros === undefined
      ? {}
      : { requestedAtMicros: value.requestedAtMicros as number }),
    deliveryAttemptCount: value.deliveryAttemptCount as number,
    verificationFailureCount: value.verificationFailureCount as number,
    subscribed: value.subscribed as boolean,
    recoveryCount: value.recoveryCount as number,
    ...(value.lastRecoveryAt === undefined ? {} : { lastRecoveryAt: value.lastRecoveryAt }),
    retryReasons: Object.freeze([...value.retryReasons] as AdmissionNotificationRetryReason[]),
    ...(value.lastAttemptAt === undefined ? {} : { lastAttemptAt: value.lastAttemptAt }),
    ...(value.lastFailureReason === undefined
      ? {}
      : { lastFailureReason: value.lastFailureReason }),
    ...(value.nextAttemptAt === undefined ? {} : { nextAttemptAt: value.nextAttemptAt }),
  })
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

  async recoverAdmission(
    input: AdmissionNotificationRecoveryInput,
  ): Promise<AdmissionNotificationQueueStatus> {
    const response = await (await this.stub(input.fid)).fetch(internalUrl('recover'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (response.status === 409) throw new AdmissionNotificationRecoveryConflictError()
    return readQueueStatus(response)
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

export class AdmissionNotificationRecoveryConflictError extends Error {
  constructor() {
    super('Admission notification recovery conflict.')
    this.name = 'AdmissionNotificationRecoveryConflictError'
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

function validQueueInput(value: unknown): value is InternalAdmissionNotificationQueueInput {
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

function validRecoveryInput(value: unknown): value is AdmissionNotificationRecoveryInput {
  return isRecord(value)
    && exactKeys(
      value,
      ['fid', 'kind', 'requestedAtMicros', 'recoveredAt', 'recoveryId'],
    )
    && isSafeFid(value.fid)
    && value.kind === 'pending-request'
    && isRequestedAtMicros(value.requestedAtMicros)
    && isTimestamp(value.recoveredAt)
    && isRecoveryId(value.recoveryId)
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
  })
}

function attemptsForSubscriptions(
  delivery: AdmissionDelivery,
  subscriptions: readonly Subscription[],
): readonly DeliveryAttempt[] {
  // A request generation belongs to one player and may have only one active
  // transport target. Keep its first attempt stable even if a later webhook
  // removes that token; attemptDelivery will terminate instead of retargeting.
  // An unbound generation selects the newest configured subscription with a
  // deterministic tie-break, preventing fan-out across Farcaster clients.
  const existing = delivery.attempts.find(attempt => attempt.status === 'sent')
    ?? delivery.attempts.find(attempt => attempt.status !== 'exhausted')
    ?? delivery.attempts[0]
  if (existing) return Object.freeze([existing])

  const subscription = [...subscriptions].sort((left, right) => (
    right.enabledAt - left.enabledAt
    || left.appFid - right.appFid
    || left.tokenId.localeCompare(right.tokenId)
  ))[0]
  if (!subscription) return Object.freeze([])
  return Object.freeze([Object.freeze({
    appFid: subscription.appFid,
    tokenId: subscription.tokenId,
    status: 'pending' as const,
    attempts: 0,
    verificationFailures: 0,
  })])
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
        ...(state.delivery.recoveryId === undefined
          ? {}
          : { recoveryId: state.delivery.recoveryId }),
      })
    : undefined
  if (
    !delivery
    && state.lastSentRequestAtMicros === undefined
    && state.lastExhaustedRequestAtMicros === undefined
    && state.lastRecoveryRequestAtMicros === undefined
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
    ...(state.lastRecoveryRequestAtMicros === undefined
      ? {}
      : { lastRecoveryRequestAtMicros: state.lastRecoveryRequestAtMicros }),
    ...(state.lastRecoveryId === undefined ? {} : { lastRecoveryId: state.lastRecoveryId }),
    ...(state.lastRecoveryAt === undefined ? {} : { lastRecoveryAt: state.lastRecoveryAt }),
    ...(delivery ? { delivery } : {}),
  })
}

async function persistAndSchedule(
  storage: DurableObjectState['storage'],
  state: PersistedNotificationState,
  now: number,
): Promise<void> {
  const legacyState = legacyStateForPersistence(state)
  const pendingState = pendingStateForPersistence(state)
  await storage.transaction(async transaction => {
    await transaction.put(STATE_KEY, legacyState)
    if (pendingState) await transaction.put(PENDING_STATE_RECORD, pendingState)
    else await transaction.delete(PENDING_STATE_RECORD)
  })
  const alarmAt = nextAlarmAt(state, now)
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

async function recordDiagnostics(
  storage: DurableObjectState['storage'],
  generation: AdmissionNotificationGeneration,
  retryReasons: readonly AdmissionNotificationRetryReason[],
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

function notificationId(delivery: AdmissionDelivery): string {
  return delivery.kind === 'admitted'
    ? `warpkeep-access-approved-v1-e${delivery.authEpoch}`
    : `warpkeep-access-approved-v2-r${delivery.requestedAtMicros}`
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
        notificationId: notificationId(delivery),
        title: ADMISSION_NOTIFICATION_TITLE,
        body: ADMISSION_NOTIFICATION_BODY,
        targetUrl: TARGET_URL,
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

function retireAttemptWithoutDelivery(attempt: DeliveryAttempt): DeliveryAttempt {
  return Object.freeze({
    ...attempt,
    status: 'exhausted',
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
    : state.lastSentRequestAtMicros !== undefined
      && state.lastSentRequestAtMicros >= generation.requestedAtMicros
}

function exhaustedForGeneration(
  state: PersistedNotificationState,
  generation: AdmissionNotificationGeneration,
): boolean {
  return generation.kind === 'admitted'
    ? state.lastExhaustedAuthEpoch !== undefined
      && state.lastExhaustedAuthEpoch >= generation.authEpoch
    : state.lastExhaustedRequestAtMicros !== undefined
      && state.lastExhaustedRequestAtMicros >= generation.requestedAtMicros
}

function deliveryIsAuthorizedRecovery(
  state: PersistedNotificationState,
  delivery: AdmissionDelivery,
): boolean {
  return delivery.kind === 'pending-request'
    && delivery.recoveryId !== undefined
    && state.lastRecoveryRequestAtMicros === delivery.requestedAtMicros
    && state.lastRecoveryId === delivery.recoveryId
    && state.lastRecoveryAt !== undefined
}

function queueStatus(state: PersistedNotificationState): AdmissionNotificationQueueStatus {
  if (state.delivery && sentForGeneration(state, deliveryGeneration(state.delivery))) {
    return 'already-sent'
  }
  if (
    state.delivery
    && exhaustedForGeneration(state, deliveryGeneration(state.delivery))
    && !deliveryIsAuthorizedRecovery(state, state.delivery)
  ) {
    return 'delivery-exhausted'
  }
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

function diagnosticsForState(
  state: PersistedNotificationState | null,
  persistedDiagnostics: PersistedNotificationDiagnostics | null,
): AdmissionNotificationDiagnostics {
  if (!state) {
    return Object.freeze({
      status: 'not-subscribed',
      deliveryAttemptCount: 0,
      verificationFailureCount: 0,
      subscribed: false,
      recoveryCount: 0,
      retryReasons: Object.freeze([]),
    })
  }
  const delivery = state.delivery
  const attempts = delivery?.attempts ?? []
  const generation = delivery
    ? deliveryGeneration(delivery)
    : persistedDiagnostics?.generation
  const status = delivery
    ? queueStatus(state)
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
  const recoveryMatchesGeneration = generation?.kind === 'pending-request'
    && state.lastRecoveryRequestAtMicros === generation.requestedAtMicros
  return Object.freeze({
    status,
    ...(generation === undefined ? {} : { generation: generation.kind }),
    ...(generation?.kind === 'admitted' ? { authEpoch: generation.authEpoch } : {}),
    ...(generation?.kind === 'pending-request'
      ? { requestedAtMicros: generation.requestedAtMicros }
      : {}),
    deliveryAttemptCount: attempts.reduce((sum, attempt) => sum + attempt.attempts, 0),
    verificationFailureCount: attempts.reduce(
      (sum, attempt) => sum + attempt.verificationFailures,
      0,
    ),
    subscribed: state.subscriptions.length > 0,
    recoveryCount: recoveryMatchesGeneration ? 1 : 0,
    ...(recoveryMatchesGeneration && state.lastRecoveryAt !== undefined
      ? { lastRecoveryAt: state.lastRecoveryAt }
      : {}),
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
    let delivery = pruned.delivery
    if (!delivery) {
      if (pruned === state) return state
      const next = withNextRevision(pruned)
      await persistAndSchedule(this.state.storage, next, now)
      return next
    }
    if (delivery.kind === 'admitted') {
      // Admitted-epoch notifications were a legacy reconciliation path. A
      // player-visible alert is now owned exclusively by the exact pending
      // access-request generation, so no persisted legacy alarm can emit a
      // second notification after admission becomes authoritative.
      const next = withNextRevision(Object.freeze({
        ...pruned,
        delivery: undefined,
        lastExhaustedAuthEpoch: Math.max(
          pruned.lastExhaustedAuthEpoch ?? 0,
          delivery.authEpoch,
        ),
      }))
      await persistAndSchedule(this.state.storage, next, now)
      return next
    }
    const generation = deliveryGeneration(delivery)
    if (
      sentForGeneration(pruned, generation)
      || (
        exhaustedForGeneration(pruned, generation)
        && !deliveryIsAuthorizedRecovery(pruned, delivery)
      )
    ) {
      // A terminal generation receipt always wins over webhook refreshes and
      // stale alarms. Clear the retained delivery shell before any attempt can
      // be rebuilt around a new token.
      const next = withNextRevision(Object.freeze({ ...pruned, delivery: undefined }))
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
              lastExhaustedRequestAtMicros: Math.max(
                pruned.lastExhaustedRequestAtMicros ?? 0,
                delivery.requestedAtMicros,
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

    delivery = Object.freeze({
      ...delivery,
      attempts: attemptsForSubscriptions(delivery, pruned.subscriptions),
    })
    const singleTargetState = Object.freeze({ ...pruned, delivery })

    // Persisted data is never trusted as an outbound destination. Reapply the
    // current deployment allowlist immediately before every network request.
    let subscriptions = [...singleTargetState.subscriptions]
    let nextBase: PersistedNotificationState = singleTargetState
    let invalidatedGeneration = false
    let latestAttemptAt: number | undefined
    let latestFailureReason: AdmissionNotificationRetryReason | undefined
    const attempts: DeliveryAttempt[] = []
    const retryReasons: AdmissionNotificationRetryReason[] = []
    const resolver = this.configuredAdmissionResolver ?? defaultAdmissionResolver(config)
    const requestResolver = this.configuredAccessRequestResolver
      ?? defaultAccessRequestResolver(config)
    for (const attempt of delivery.attempts) {
      const subscription = subscriptions.find(candidate => (
        candidate.appFid === attempt.appFid && candidate.tokenId === attempt.tokenId
      ))
      if (!subscription) {
        // Once a request has selected a transport target, token rotation,
        // opt-out, expiry, or client removal terminates that generation. Never
        // reset its attempt counter or redirect it to another subscription.
        invalidatedGeneration = true
        attempts.push(retireAttemptWithoutDelivery(attempt))
        continue
      }
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
        if (admission.state !== 'enabled') {
          const request = await requestResolver.getStatus(state.fid)
          generationIsCurrent = request.status === 'requested'
            && request.requestedAtMicros === delivery.requestedAtMicros
        }
      } catch {
        // Resolver availability is not a Farcaster delivery attempt. Back it
        // off separately so an upstream outage cannot permanently exhaust the
        // admission epoch before any notification request is made.
        const reason = 'request-verification'
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
        await persistAndSchedule(this.state.storage, cancelled, now)
        return cancelled
      }
      const outcome = await sendOne(subscription, delivery, this.fetchImpl)
      latestAttemptAt = now
      if (outcome.result === 'successful') {
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
      ...(attempts.length > 0 && attempts.every(attempt => attempt.status === 'sent')
        ? {
            lastSentRequestAtMicros: Math.max(
              nextBase.lastSentRequestAtMicros ?? 0,
              delivery.requestedAtMicros,
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
        ? {
            lastExhaustedRequestAtMicros: Math.max(
              nextBase.lastExhaustedRequestAtMicros ?? 0,
              delivery.requestedAtMicros,
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
    try {
      await recordDiagnostics(
        this.state.storage,
        deliveryGeneration(delivery),
        retryReasons,
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
      return new Response(JSON.stringify(diagnosticsForState(existing, diagnostics)), {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'cache-control': 'no-store',
        },
      })
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
        })
      }

      next = withNextRevision(next)
      await persistAndSchedule(this.state.storage, next, now)
      if (value.event.type === 'enabled' && next.delivery) {
        await this.attemptDelivery(next)
      }
      return new Response(null, { status: 204 })
    }

    if (url.pathname === '/recover') {
      if (!validRecoveryInput(value)) return new Response(null, { status: 400 })
      if (!config.approvalNotificationsEnabled) return new Response(null, { status: 503 })
      const now = this.currentTime()
      if (Math.abs(now - value.recoveredAt) > 60_000) return new Response(null, { status: 400 })
      const existing = await readCombinedState(this.state.storage)
      if (!existing || existing.fid !== value.fid) return new Response(null, { status: 409 })
      const generation: AdmissionNotificationGeneration = Object.freeze({
        kind: 'pending-request',
        requestedAtMicros: value.requestedAtMicros,
      })
      if (sentForGeneration(existing, generation)) {
        return new Response(JSON.stringify({ status: 'already-sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (existing.lastRecoveryRequestAtMicros === generation.requestedAtMicros) {
        if (existing.lastRecoveryId !== value.recoveryId) {
          return new Response(null, { status: 409 })
        }
        let replayed = existing
        if (
          replayed.delivery
          && generationEquals(deliveryGeneration(replayed.delivery), generation)
        ) replayed = await this.attemptDelivery(replayed)
        return new Response(JSON.stringify({ status: replayed.delivery
          ? queueStatus(replayed)
          : 'delivery-exhausted' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        existing.lastRecoveryRequestAtMicros !== undefined
        && existing.lastRecoveryRequestAtMicros > generation.requestedAtMicros
      ) return new Response(null, { status: 409 })
      if (
        existing.lastExhaustedRequestAtMicros !== generation.requestedAtMicros
        || (
          existing.delivery !== undefined
          && (
            !generationEquals(deliveryGeneration(existing.delivery), generation)
            || existing.delivery.attempts.some(attempt => (
              attempt.status !== 'sent' && attempt.status !== 'exhausted'
            ))
          )
        )
      ) return new Response(null, { status: 409 })

      const pruned = pruneSubscriptions(existing, config, now)
      if (pruned.subscriptions.length === 0) {
        if (pruned !== existing) {
          await persistAndSchedule(
            this.state.storage,
            withNextRevision(pruned),
            now,
          )
        }
        return new Response(JSON.stringify({ status: 'not-subscribed' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }

      const delivery: AdmissionDelivery = Object.freeze({
        ...generation,
        queuedAt: value.recoveredAt,
        expiresAt: value.recoveredAt + DELIVERY_LIFETIME_MILLISECONDS,
        attempts: Object.freeze([]),
        recoveryId: value.recoveryId,
      })
      let next = withNextRevision(Object.freeze({
        ...pruned,
        lastRecoveryRequestAtMicros: generation.requestedAtMicros,
        lastRecoveryId: value.recoveryId,
        lastRecoveryAt: value.recoveredAt,
        delivery: Object.freeze({
          ...delivery,
          attempts: attemptsForSubscriptions(delivery, pruned.subscriptions),
        }),
      }))
      await persistAndSchedule(this.state.storage, next, now)
      next = await this.attemptDelivery(next)
      return new Response(JSON.stringify({ status: queueStatus(next) }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
      })
    }

    if (url.pathname === '/queue') {
      if (!validQueueInput(value)) return new Response(null, { status: 400 })
      if (!config.approvalNotificationsEnabled) return new Response(null, { status: 503 })
      const now = this.currentTime()
      if (Math.abs(now - value.queuedAt) > 60_000) return new Response(null, { status: 400 })
      const existing = await readCombinedState(this.state.storage)
      if (existing && existing.fid !== value.fid) return new Response(null, { status: 409 })
      let next = existing ?? emptyState(value.fid, now)
      if (value.kind !== 'pending-request') {
        // Keep accepting the old internal shape long enough to retire any
        // in-flight caller safely, but make it terminal without a provider
        // request. This is the final defense against duplicate post-admission
        // notifications from older operator tooling or queued Durable Objects.
        next = withNextRevision(Object.freeze({
          ...next,
          ...(next.delivery?.kind === 'admitted' ? { delivery: undefined } : {}),
          lastExhaustedAuthEpoch: Math.max(
            next.lastExhaustedAuthEpoch ?? 0,
            value.authEpoch,
          ),
        }))
        await persistAndSchedule(this.state.storage, next, now)
        return new Response(JSON.stringify({ status: 'delivery-exhausted' }), {
          status: 200,
          headers: {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          },
        })
      }
      const generation: AdmissionNotificationGeneration = Object.freeze({
        kind: 'pending-request',
        requestedAtMicros: value.requestedAtMicros,
      })
      if (sentForGeneration(next, generation)) {
        return new Response(JSON.stringify({ status: 'already-sent' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        exhaustedForGeneration(next, generation)
        && !(next.delivery && deliveryIsAuthorizedRecovery(next, next.delivery))
      ) {
        return new Response(JSON.stringify({ status: 'delivery-exhausted' }), {
          status: 200,
          headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
        })
      }
      if (
        next.delivery?.kind === 'pending-request'
        && generation.requestedAtMicros < next.delivery.requestedAtMicros
      ) {
        return new Response(null, { status: 409 })
      }
      if (
        !next.delivery
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
    const state = await readCombinedState(this.state.storage)
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
      // Keep active 24-hour work recoverable after a transient rollout fault;
      // an idle consent record still sleeps until its retention boundary.
      await this.state.storage.setAlarm(state.delivery
        ? Math.min(
            state.delivery.expiresAt,
            state.retentionExpiresAt,
            now + RETRY_DELAYS_MILLISECONDS[0],
          )
        : state.retentionExpiresAt)
      return
    }
    const next = await this.attemptDelivery(state)
    if (
      !next.delivery
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
