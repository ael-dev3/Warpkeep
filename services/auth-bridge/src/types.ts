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
  /** A private Optimism RPC URL used by the official Farcaster verifier. */
  FARCASTER_RPC_URL?: string
  OIDC_AUDIENCE?: string
  /** Stable public JWK key id. May also be supplied inside SIGNING_KEY_JWK. */
  OIDC_KEY_ID?: string
  /** Cloudflare managed secret containing a private P-256 JWK JSON object. */
  SIGNING_KEY_JWK?: string
  /** Cloudflare managed secret for the server-only admin endpoint. */
  ADMIN_TOKEN_SECRET?: string
  /** Cloudflare managed HMAC key for opaque HttpOnly session cookies. */
  SESSION_COOKIE_KEY?: string
  /** Non-secret Maincloud origin used only by the Worker auth-epoch lookup. */
  SPACETIMEDB_URI?: string
  /** Non-secret database name used only by the Worker auth-epoch lookup. */
  SPACETIMEDB_DATABASE?: string
  /** Emergency public-auth kill switch. Trust coordinates remain immutable. */
  PUBLIC_AUTH_ENABLED?: string
  ENVIRONMENT?: string
  CHALLENGE_REPLAY_GUARD?: DurableObjectNamespace
  AUTH_RATE_LIMITER?: DurableObjectNamespace
  SESSION_FAMILIES?: DurableObjectNamespace
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
  | 'rate_limited'
  | 'rate_limit_failed'
  | 'configuration_error'
  | 'plaintext_request_rejected'
  | 'issuer_host_rejected'
  | 'public_auth_paused'
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

export type RateLimitAction = 'challenge' | 'exchange' | 'session-refresh' | 'admin-token'

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number }

export interface RateLimiter {
  check(request: Request, action: RateLimitAction): Promise<RateLimitResult>
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

export interface AuthEpochResolverTokenClaims {
  iss: string
  sub: 'service:auth-epoch-resolver'
  aud: string[]
  token_type: 'spacetime-access'
  roles: ['warpkeep-auth-epoch-resolver']
  iat: number
  nbf: number
  exp: number
  jti: string
}

export type SessionFamilyState = 'pending' | 'bound'

export interface SessionFamilyRecord {
  version: 1
  origin: string
  identity: PublicIdentity
  state: SessionFamilyState
  authEpoch?: number
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
