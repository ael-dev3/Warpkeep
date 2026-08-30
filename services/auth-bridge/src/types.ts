/**
 * Minimal Cloudflare Durable Object declarations. Keeping these local makes the
 * worker source independently type-checkable before `wrangler types` is run.
 */
export interface DurableObjectStorage {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
  deleteAll(): Promise<void>
  setAlarm(scheduledTime: number | Date): Promise<void>
  deleteAlarm?(): Promise<void>
  transaction<T>(closure: (txn: DurableObjectTransaction) => Promise<T>): Promise<T>
}

export interface DurableObjectTransaction {
  get<T>(key: string): Promise<T | undefined>
  put<T>(key: string, value: T): Promise<void>
  delete(key: string): Promise<boolean>
}

export interface DurableObjectState {
  readonly storage: DurableObjectStorage
}

export interface DurableObjectStub {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export interface DurableObjectId {}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId
  get(id: DurableObjectId): DurableObjectStub
}

export interface WorkerEnv {
  /** Exact public HTTPS issuer. Required; no production URL is assumed. */
  ISSUER?: string
  /** Comma-separated exact browser origins allowed to call challenge/exchange. */
  ALLOWED_ORIGINS?: string
  /** Exact SIWF domain expected in every signed message. */
  FARCASTER_DOMAIN?: string
  /** Exact SIWF URI expected in every signed message. */
  FARCASTER_SIWE_URI?: string
  /** Primary private Optimism RPC URL used by the official Farcaster verifier. */
  FARCASTER_RPC_URL?: string
  /** Independent secondary Optimism RPC URL. Required in production. */
  FARCASTER_RPC_URL_SECONDARY?: string
  OIDC_AUDIENCE?: string
  /** Stable public JWK key id. May also be supplied inside SIGNING_KEY_JWK. */
  OIDC_KEY_ID?: string
  /** Cloudflare managed secret containing a private P-256 JWK JSON object. */
  SIGNING_KEY_JWK?: string
  /** Cloudflare managed secret for the server-only admin endpoint. */
  ADMIN_TOKEN_SECRET?: string
  /** Cloudflare managed HMAC key for opaque HttpOnly session cookies. */
  SESSION_COOKIE_KEY?: string
  /**
   * Cloudflare managed secret containing the one canonical FID allowed to use
   * the production player canary exchange. It must never be a Worker var.
   */
  PLAYER_CANARY_OWNER_FID?: string
  /** Independent fail-closed gate for the owner-only Public Test Realm. */
  PTR_ENABLED?: string
  /** Exact immutable SpacetimeDB identity for the isolated PTR database. */
  PTR_SPACETIMEDB_DATABASE?: string
  /** Exact dedicated PTR audience. It must never equal a gameplay or QA audience. */
  PTR_OIDC_AUDIENCE?: string
  /** Non-secret Maincloud origin used only by the Worker auth-epoch lookup. */
  SPACETIMEDB_URI?: string
  /** Non-secret database name used only by the Worker auth-epoch lookup. */
  SPACETIMEDB_DATABASE?: string
  /** Candidate dedicated QA origin; production-pinned and independently reviewed before activation. */
  QA_OBSERVER_SPACETIMEDB_URI?: string
  /** Candidate dedicated QA database; distinct from gameplay and reviewed as identity-free before use. */
  QA_OBSERVER_SPACETIMEDB_DATABASE?: string
  /** Dedicated observer JWT audience, distinct from the gameplay audience. */
  QA_OBSERVER_OIDC_AUDIENCE?: string
  /** Emergency public-auth kill switch. Trust coordinates remain immutable. */
  PUBLIC_AUTH_ENABLED?: string
  /** Staged rollout gate for rejecting cached access clients without FID correlation. */
  ACCESS_EXPECTED_FID_REQUIRED?: string
  /** Independent fail-closed gate for the machine-bound read-only QA observer. */
  QA_OBSERVER_ENABLED?: string
  /** Fail-closed gate for Farcaster admission notification consent and delivery. */
  APPROVAL_NOTIFICATIONS_ENABLED?: string
  /** Protected-deployer injected source commit for public bridge release attestation. */
  WARPKEEP_BRIDGE_SOURCE_COMMIT?: string
  /** Two exact, independently operated Hub HTTP origins used to verify app keys. */
  MINIAPP_NOTIFICATION_HUB_URLS?: string
  /** Exact `clientFid=deliveryUrl` allowlist; prevents webhook-driven SSRF. */
  MINIAPP_NOTIFICATION_CLIENTS?: string
  /** Independent managed secret for Hermes-to-notification delivery requests. */
  NOTIFICATION_OPERATOR_SECRET?: string
  /** One registered public P-256 JWK. The corresponding private key stays on the QA Mac. */
  QA_OBSERVER_PUBLIC_JWK?: string
  /** Canonical RFC 3339 expiry for the registered QA public key. */
  QA_OBSERVER_KEY_EXPIRES_AT?: string
  /** Fixed canonical RFC 3339 timestamp of the owner-reviewed QA key registration. */
  QA_OBSERVER_KEY_REGISTERED_AT?: string
  ENVIRONMENT?: string
  CHALLENGE_REPLAY_GUARD?: DurableObjectNamespace
  QA_CHALLENGE_REPLAY_GUARD?: DurableObjectNamespace
  AUTH_RATE_LIMITER?: DurableObjectNamespace
  SESSION_FAMILIES?: DurableObjectNamespace
  ADMISSION_NOTIFICATIONS?: DurableObjectNamespace
}

export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void
}

export interface BridgeFetchHandler {
  fetch(request: Request, env: WorkerEnv, ctx?: ExecutionContextLike): Promise<Response>
}

export type SafeLogEvent =
  | 'challenge_issued'
  | 'challenge_binding_created'
  | 'exchange_succeeded'
  | 'exchange_rejected'
  | 'quick_auth_succeeded'
  | 'quick_auth_rejected'
  | 'quick_auth_verifier_unavailable'
  | 'player_canary_exchange_succeeded'
  | 'player_canary_exchange_rejected'
  | 'ptr_exchange_succeeded'
  | 'ptr_exchange_rejected'
  | 'exchange_binding_missing'
  | 'exchange_binding_invalid'
  | 'exchange_binding_mismatch'
  | 'exchange_binding_verified'
  | 'legacy_auth_rejected'
  | 'session_created'
  | 'session_pending'
  | 'session_refreshed'
  | 'session_rejected'
  | 'session_revoked'
  | 'session_revoke_failed'
  | 'admin_token_issued'
  | 'admin_token_rejected'
  | 'genesis002_admin_token_issued'
  | 'genesis002_admin_token_rejected'
  | 'ptr_admin_token_issued'
  | 'ptr_admin_token_rejected'
  | 'admin_probe_rejected'
  | 'config_attestation_issued'
  | 'config_attestation_rejected'
  | 'auth_epoch_resolved'
  | 'auth_epoch_failed'
  | 'auth_epoch_failed_signing'
  | 'auth_epoch_failed_fetch_request'
  | 'auth_epoch_failed_fetch_body'
  | 'auth_epoch_failed_timeout'
  | 'auth_epoch_failed_upstream_status'
  | 'auth_epoch_failed_response_validation'
  | 'auth_epoch_probe_succeeded'
  | 'auth_epoch_probe_failed'
  | 'access_status_succeeded'
  | 'access_request_succeeded'
  | 'access_request_rejected'
  | 'access_request_failed'
  | 'access_request_failed_signing'
  | 'access_request_failed_fetch_request'
  | 'access_request_failed_fetch_body'
  | 'access_request_failed_timeout'
  | 'access_request_failed_upstream_status'
  | 'access_request_failed_response_validation'
  | 'miniapp_webhook_verified'
  | 'miniapp_webhook_rejected'
  | 'miniapp_webhook_verifier_unavailable'
  | 'miniapp_webhook_verifier_unavailable_configuration'
  | 'miniapp_webhook_verifier_unavailable_hub_primary_fetch'
  | 'miniapp_webhook_verifier_unavailable_hub_primary_response'
  | 'miniapp_webhook_verifier_unavailable_hub_primary_attestation'
  | 'miniapp_webhook_verifier_unavailable_hub_secondary_fetch'
  | 'miniapp_webhook_verifier_unavailable_hub_secondary_response'
  | 'miniapp_webhook_verifier_unavailable_hub_secondary_attestation'
  | 'miniapp_webhook_verifier_unavailable_hub_attestation_conflict'
  | 'miniapp_webhook_verifier_unavailable_rpc_primary_transport'
  | 'miniapp_webhook_verifier_unavailable_rpc_secondary_transport'
  | 'miniapp_webhook_verifier_unavailable_rpc_all_transports'
  | 'miniapp_webhook_verifier_unavailable_rpc_disagreement'
  | 'miniapp_webhook_verifier_unavailable_unexpected'
  | 'miniapp_webhook_rpc_primary_fallback'
  | 'miniapp_webhook_rpc_secondary_fallback'
  | 'miniapp_notification_subscribed'
  | 'miniapp_notification_unsubscribed'
  | 'admission_notification_queued'
  | 'admission_notification_succeeded'
  | 'admission_notification_exhausted'
  | 'admission_notification_retrying'
  | 'admission_notification_not_subscribed'
  | 'admission_notification_rejected'
  | 'admission_notification_inspected'
  | 'admission_notification_recovery_authorized'
  | 'admission_notification_recovery_rejected'
  | 'rate_limited'
  | 'rate_limit_failed'
  | 'configuration_error'
  | 'plaintext_request_rejected'
  | 'issuer_host_rejected'
  | 'public_auth_paused'
  | 'qa_observer_paused'
  | 'qa_challenge_issued'
  | 'qa_challenge_rejected'
  | 'qa_signature_rejected'
  | 'qa_snapshot_succeeded'
  | 'qa_snapshot_rejected'
  | 'qa_snapshot_failed_signing'
  | 'qa_snapshot_failed_fetch_request'
  | 'qa_snapshot_failed_fetch_body'
  | 'qa_snapshot_failed_timeout'
  | 'qa_snapshot_failed_upstream_status'
  | 'qa_snapshot_failed_response_validation'
  | 'internal_error'

/** This deliberately cannot accept proof, token, nonce, secret, or arbitrary errors. */
export interface SafeLogger {
  event(event: SafeLogEvent): void
}

export interface ChallengeRecord {
  version: 2
  requestId: string
  nonce: string
  origin: string
  domain: string
  siweUri: string
  createdAt: number
  expiresAt: number
  bindingChallenge: string
  bindingMethod: 'S256'
}

/**
 * `consume` must be atomic. A record may be read before verification, but only a
 * successful atomic consume grants a token. This is the replay boundary.
 */
export interface ChallengeStore {
  put(challenge: ChallengeRecord): Promise<void>
  get(requestId: string): Promise<ChallengeRecord | null>
  consume(requestId: string): Promise<ChallengeRecord | null>
}

export interface FarcasterProofInput {
  nonce: string
  domain: string
  message: string
  signature: `0x${string}`
  acceptAuthAddress: true
}

export interface VerifiedFarcasterProof {
  fid: string
}

/** An injectable adapter around the official Farcaster auth verifier. */
export interface FarcasterVerifier {
  verify(input: FarcasterProofInput): Promise<VerifiedFarcasterProof>
}

/** An injectable boundary around Farcaster's Quick Auth JWT verifier. */
export interface QuickAuthVerifier {
  verifyJwt(input: Readonly<{ token: string; domain: string }>): Promise<unknown>
}

/**
 * Reads the current server-side authorization epoch for a verified FID. This is
 * deliberately not a browser request parameter: an admin epoch bump must make
 * earlier player JWTs fail module authorization immediately.
 */
export type AdmissionResolution =
  | Readonly<{ state: 'missing'; authEpoch: 0 }>
  | Readonly<{ state: 'disabled'; authEpoch: 0 }>
  | Readonly<{ state: 'enabled'; authEpoch: number }>

export interface AuthEpochResolver {
  resolve(fid: string): Promise<AdmissionResolution>
}

export type AccessRequestResolution =
  | Readonly<{ status: 'not-requested' }>
  | Readonly<{ status: 'requested'; requestedAtMicros: number }>
  | Readonly<{ status: 'already-admitted' }>

/** Narrow bridge-internal writer; the signed principal supplies the verified FID. */
export interface AccessRequestResolver {
  getStatus(fid: string): Promise<AccessRequestResolution>
  submit(fid: string): Promise<AccessRequestResolution>
}

export type AccessRequestOperation = 'status' | 'submit'

export type RateLimitAction =
  | 'challenge'
  | 'exchange'
  | 'session-refresh'
  | 'access-request'
  | 'miniapp-webhook'
  | 'admission-notification'
  | 'admin-token'
  | 'qa-challenge'
  | 'qa-snapshot'

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export interface RateLimiter {
  check(request: Request, action: RateLimitAction): Promise<RateLimitResult>
}

export type MiniAppNotificationDetails = Readonly<{
  token: string
  url: string
}>

export type VerifiedMiniAppWebhookEvent = Readonly<{
  /** SHA-256 of the exact signed envelope; retained only for bounded replay suppression. */
  eventId: string
  fid: string
  appFid: number
  event:
    | Readonly<{ type: 'enabled'; details: MiniAppNotificationDetails }>
    | Readonly<{ type: 'disabled' }>
    | Readonly<{ type: 'observed' }>
}>

/** Signature verification is injectable so route tests never need real Farcaster material. */
export interface MiniAppWebhookVerifier {
  verify(value: unknown): Promise<VerifiedMiniAppWebhookEvent>
}

export type AdmissionNotificationQueueStatus =
  | 'queued'
  | 'already-sent'
  | 'delivery-exhausted'
  | 'not-subscribed'

export type AdmissionNotificationGeneration =
  | Readonly<{
      kind: 'admitted'
      authEpoch: number
    }>
  | Readonly<{
      kind: 'pending-request'
      requestedAtMicros: number
    }>

export type AdmissionNotificationQueueInput = Readonly<{
  fid: string
  queuedAt: number
  kind: 'pending-request'
  requestedAtMicros: number
}>

export type AdmissionNotificationRecoveryInput = Readonly<{
  fid: string
  recoveredAt: number
  kind: 'pending-request'
  requestedAtMicros: number
  /** One reviewed recovery plan ID. Replays of the same ID are idempotent. */
  recoveryId: string
}>

export type AdmissionNotificationRetryReason =
  | 'admission-verification'
  | 'request-verification'
  | 'transport'
  | 'transport-timeout'
  | 'transport-fetch-rejected'
  | 'upstream-status'
  | 'upstream-redirect'
  | 'upstream-client-status'
  | 'upstream-server-status'
  | 'invalid-response'
  | 'response-content-type'
  | 'response-size'
  | 'response-body'
  | 'response-json'
  | 'response-schema'
  | 'rate-limited'
  | 'provider-domain-mismatch'
  | 'provider-target-url-mismatch'
  | 'provider-no-webhook-url'
  | 'provider-invalid-token'
  | 'provider-unknown'

export type AdmissionNotificationDiagnostics = Readonly<{
  status: AdmissionNotificationQueueStatus
  generation?: AdmissionNotificationGeneration['kind']
  authEpoch?: number
  requestedAtMicros?: number
  deliveryAttemptCount: number
  verificationFailureCount: number
  subscribed: boolean
  /** Zero or one: only one recovery is permitted for one request generation. */
  recoveryCount: number
  lastRecoveryAt?: number
  retryReasons: readonly AdmissionNotificationRetryReason[]
  lastAttemptAt?: number
  lastFailureReason?: AdmissionNotificationRetryReason
  nextAttemptAt?: number
}>

/** Raw notification tokens remain behind this server-only interface. */
export interface AdmissionNotificationStore {
  applyEvent(event: VerifiedMiniAppWebhookEvent): Promise<void>
  queueAdmission(input: AdmissionNotificationQueueInput): Promise<AdmissionNotificationQueueStatus>
  recoverAdmission?(
    input: AdmissionNotificationRecoveryInput,
  ): Promise<AdmissionNotificationQueueStatus>
  /** Operator-only, token-free delivery state used for bounded diagnosis. */
  inspect?(fid: string): Promise<AdmissionNotificationDiagnostics>
}

export interface PublicIdentity {
  fid: string
}

export interface PlayerTokenClaims {
  iss: string
  sub: string
  aud: string[]
  token_type: 'spacetime-access'
  auth_version: 2
  fid: string
  /** Current authoritative allowed_fid auth epoch, resolved server-side. */
  auth_epoch: number
  roles: []
  iat: number
  nbf: number
  exp: number
  /** Original player-session window, preserved when SpacetimeDB re-signs a WebSocket token. */
  session_iat: number
  session_exp: number
  jti: string
}

export interface AdminTokenClaims {
  iss: string
  sub: 'service:hermes'
  aud: string[]
  token_type: 'spacetime-access'
  roles: ['warpkeep-admin']
  iat: number
  nbf: number
  exp: number
  jti: string
}

export type Genesis002AdminTokenClaims = Omit<AdminTokenClaims, 'aud'> & Readonly<{
  aud: ['warpkeep-genesis-002-spacetimedb']
}>

export interface PtrOwnerTokenClaims {
  iss: string
  sub: string
  aud: [string]
  token_type: 'spacetime-access'
  auth_version: 2
  realm_id: 'PTR'
  fid: string
  auth_epoch: 1
  roles: ['warpkeep-ptr-owner']
  iat: number
  nbf: number
  exp: number
  /** Original PTR session window, preserved when SpacetimeDB re-signs a connection token. */
  session_iat: number
  session_exp: number
  jti: string
}

export interface AuthEpochResolverTokenClaims {
  iss: string
  sub: 'service:auth-epoch-resolver'
  aud: string[]
  token_type: 'spacetime-access'
  roles: ['warpkeep-auth-epoch-resolver']
  resolver_fid: string
  iat: number
  nbf: number
  exp: number
  jti: string
}

export interface AccessRequestResolverTokenClaims {
  iss: string
  sub: 'service:access-request-resolver'
  aud: string[]
  token_type: 'spacetime-access'
  roles: ['warpkeep-access-request-resolver']
  request_fid: string
  request_operation: AccessRequestOperation
  iat: number
  nbf: number
  exp: number
  jti: string
}

export interface QaSnapshotResolverTokenClaims {
  iss: string
  sub: 'service:qa-snapshot-resolver'
  aud: string[]
  token_type: 'spacetime-access'
  roles: ['warpkeep-qa-snapshot-resolver']
  device_thumbprint: string
  iat: number
  nbf: number
  exp: number
  jti: string
}

export type QaObserverScope = 'realm.snapshot'

export interface QaObserverChallengeRecord {
  version: 1
  requestId: string
  challenge: string
  createdAt: number
  expiresAt: number
  keyThumbprint: string
  scope: QaObserverScope
  signingInput: string
}

export interface QaObserverChallengeStore {
  put(challenge: QaObserverChallengeRecord): Promise<void>
  get(requestId: string): Promise<QaObserverChallengeRecord | null>
  consume(requestId: string): Promise<QaObserverChallengeRecord | null>
}

export type SessionFamilyState = 'pending' | 'bound'

export interface SessionFamilyRecord {
  version: 1
  origin: string
  identity: PublicIdentity
  state: SessionFamilyState
  authEpoch?: number
  /**
   * Admission state proven when a pending family was created. Older pending
   * records omit this field and are treated as `missing`, the only state that
   * could create a pending family before revoked-founder reapplication.
   */
  pendingAdmissionState?: 'missing' | 'disabled'
  rememberDevice: boolean
  currentGeneration: number
  previousGeneration?: number
  previousGenerationGraceUntil?: number
  createdAt: number
  expiresAt: number
}

export type SessionFamilyRefreshResult = Readonly<{
  familyId: string
  record: SessionFamilyRecord
}>

export interface SessionFamilyStore {
  create(familyId: string, record: SessionFamilyRecord): Promise<void>
  get(familyId: string): Promise<SessionFamilyRecord | null>
  refresh(
    familyId: string,
    presentedGeneration: number,
    origin: string,
    admission: AdmissionResolution,
    now: number,
  ): Promise<SessionFamilyRefreshResult | null>
  revoke(familyId: string): Promise<void>
}
