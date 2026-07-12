import { parseSiweMessage } from 'viem/siwe'
import {
  ADMIN_TOKEN_TTL_SECONDS,
  CHALLENGE_TTL_MILLISECONDS,
  ConfigurationError,
  MAX_REQUEST_BYTES,
  PLAYER_TOKEN_TTL_SECONDS,
  publicJwk,
  readBridgeConfig,
  type BridgeConfig,
} from './config'
import { DurableObjectChallengeStore } from './challengeStore'
import { FarcasterVerifierUnavailableError, createOfficialFarcasterVerifier } from './farcaster'
import { adminClaims, playerClaims, randomId, randomSiweNonce, signEs256Jwt } from './jwt'
import { DurableObjectRateLimiter } from './rateLimit'
import {
  AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  SpacetimeHttpAuthEpochResolver,
  authEpochResolverFailureStage,
  type AuthEpochResolverFailureStage,
} from './spacetimeAuthEpochResolver'
import type {
  AuthEpochResolver,
  BridgeFetchHandler,
  ChallengeRecord,
  ChallengeStore,
  FarcasterVerifier,
  PublicIdentity,
  RateLimitAction,
  RateLimiter,
  SafeLogEvent,
  SafeLogger,
  WorkerEnv,
} from './types'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
}

const MAX_PROOF_SIGNATURE_BYTES = 4 * 1024
const AUTH_EPOCH_PROBE_PATH = '/v1/admin/auth-epoch-probe'
const AUTH_EPOCH_PROBE_FID = '9007199254740991'

const AUTH_EPOCH_FAILURE_EVENTS: Readonly<Record<AuthEpochResolverFailureStage, SafeLogEvent>> = Object.freeze({
  signing: 'auth_epoch_failed_signing',
  fetch_request: 'auth_epoch_failed_fetch_request',
  fetch_body: 'auth_epoch_failed_fetch_body',
  timeout: 'auth_epoch_failed_timeout',
  upstream_status: 'auth_epoch_failed_upstream_status',
  response_validation: 'auth_epoch_failed_response_validation',
})

const SENSITIVE_EXCHANGE_KEYS = new Set([
  'channelToken', 'channelUrl', 'custody', 'verifications', 'authMethod', 'metadata',
])

class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly publicMessage: string,
    readonly responseHeaders: HeadersInit = {},
  ) {
    super(publicMessage)
  }
}

export interface AuthBridgeDependencies {
  challengeStore?: ChallengeStore
  verifier?: FarcasterVerifier
  authEpochResolver?: AuthEpochResolver
  rateLimiter?: RateLimiter
  signer?: typeof signEs256Jwt
  configReader?: (env: WorkerEnv) => BridgeConfig
  logger?: SafeLogger
  now?: () => number
}

const noSecretLogger: SafeLogger = {
  event(event: SafeLogEvent): void {
    // Events are a closed static union. No proof, token, nonce, request id,
    // error object, secret, or caller supplied value is ever written here.
    console.info(`warpkeep-auth-bridge:${event}`)
  },
}

function json(value: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { ...JSON_HEADERS, ...headers },
  })
}

function errorResponse(error: HttpError, headers: HeadersInit = {}): Response {
  const merged: Record<string, string> = {}
  new Headers(headers).forEach((value, name) => { merged[name] = value })
  new Headers(error.responseHeaders).forEach((value, name) => { merged[name] = value })
  return json({ error: { code: error.code, message: error.publicMessage } }, error.status, merged)
}

function corsHeaders(origin: string): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}

function publicCorsHeaders(request: Request, config: BridgeConfig): HeadersInit {
  const origin = request.headers.get('origin')
  return origin && config.allowedOrigins.has(origin) ? corsHeaders(origin) : {}
}

function requireAllowedBrowserOrigin(request: Request, config: BridgeConfig): string {
  const origin = request.headers.get('origin')
  if (!origin || !config.allowedOrigins.has(origin)) {
    throw new HttpError(403, 'origin_not_allowed', 'This browser origin is not allowed.')
  }
  return origin
}

function requireAdminNoOrigin(request: Request): void {
  if (request.headers.has('origin')) {
    throw new HttpError(403, 'admin_browser_forbidden', 'This endpoint is server-only.')
  }
}

function isServerOnlyAdminPath(pathname: string): boolean {
  return pathname === '/v1/admin/token' || pathname === AUTH_EPOCH_PROBE_PATH
}

function logAuthEpochFailure(logger: SafeLogger, error: unknown): void {
  logger.event('auth_epoch_failed')
  const stage = authEpochResolverFailureStage(error)
  if (stage) logger.event(AUTH_EPOCH_FAILURE_EVENTS[stage])
}

function allowedPreflight(request: Request, config: BridgeConfig): Response {
  const origin = requireAllowedBrowserOrigin(request, config)
  const method = request.headers.get('access-control-request-method')
  if (method !== 'POST') throw new HttpError(405, 'method_not_allowed', 'Only POST is allowed.')
  const requestHeaders = request.headers.get('access-control-request-headers')
  if (requestHeaders) {
    const headers = requestHeaders.split(',').map((header) => header.trim().toLowerCase()).filter(Boolean)
    if (headers.some((header) => header !== 'content-type')) {
      throw new HttpError(403, 'header_not_allowed', 'This request header is not allowed.')
    }
  }
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

function requireJsonContentType(request: Request): void {
  const contentType = request.headers.get('content-type')
  if (contentType?.split(';', 1)[0]?.trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'unsupported_media_type', 'Expected an application/json request body.')
  }
}

async function readBoundedRequestText(request: Request): Promise<string> {
  if (!request.body) return ''

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      totalBytes += value.byteLength
      if (totalBytes > MAX_REQUEST_BYTES) {
        try {
          await reader.cancel()
        } catch {
          // The public result remains a bounded 413 even if cancellation fails.
        }
        throw new HttpError(413, 'body_too_large', 'Request body is too large.')
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.')
  }
}

async function parseObjectBody(request: Request): Promise<Record<string, unknown>> {
  requireJsonContentType(request)
  const advertisedLength = request.headers.get('content-length')
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_REQUEST_BYTES)) {
    throw new HttpError(413, 'body_too_large', 'Request body is too large.')
  }
  const body = await readBoundedRequestText(request)
  let parsed: unknown
  try {
    parsed = JSON.parse(body)
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body must be valid JSON.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new HttpError(400, 'invalid_request', 'Request body must be a JSON object.')
  }
  return parsed as Record<string, unknown>
}

function requireExactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key) || SENSITIVE_EXCHANGE_KEYS.has(key)) {
      throw new HttpError(400, 'invalid_request', 'Request contains unsupported fields.')
    }
  }
}

function requireString(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > maxLength) {
    throw new HttpError(400, 'invalid_request', `Invalid ${name}.`)
  }
  return value
}

function optionalString(value: unknown, maxLength: number): string | undefined {
  return typeof value === 'string' && value.length > 0 && value.length <= maxLength ? value : undefined
}

function canonicalFid(value: unknown): string {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) throw new HttpError(400, 'invalid_request', 'Invalid fid.')
    value = String(value)
  }
  if (typeof value !== 'string' || !/^[1-9]\d{0,19}$/.test(value)) {
    throw new HttpError(400, 'invalid_request', 'Invalid fid.')
  }
  try {
    return BigInt(value).toString(10)
  } catch {
    throw new HttpError(400, 'invalid_request', 'Invalid fid.')
  }
}

function requireEpoch(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AUTH_EPOCH) {
    throw new Error('Invalid auth epoch resolver result.')
  }
  return value
}

function sanitizeIdentity(input: Record<string, unknown>, expectedFid: string): PublicIdentity {
  requireExactKeys(input, ['fid', 'username', 'displayName', 'pfpUrl'])
  if (canonicalFid(input.fid) !== expectedFid) {
    throw new HttpError(400, 'fid_mismatch', 'The proof identity does not match the request.')
  }
  const username = optionalString(input.username, 32)
  const displayName = optionalString(input.displayName, 64)?.trim()
  const pfpUrl = optionalString(input.pfpUrl, 2048)
  const safeUsername = username && /^[A-Za-z0-9][A-Za-z0-9._-]{0,31}$/.test(username) ? username : undefined
  const safeDisplayName = displayName && !/[\u0000-\u001F\u007F]/.test(displayName) ? displayName : undefined
  let safePfpUrl: string | undefined
  if (pfpUrl) {
    try {
      const parsed = new URL(pfpUrl)
      if (parsed.protocol === 'https:') safePfpUrl = parsed.toString()
    } catch {
      // Display metadata is optional, not an ownership assertion.
    }
  }
  return {
    fid: expectedFid,
    ...(safeUsername ? { username: safeUsername } : {}),
    ...(safeDisplayName ? { displayName: safeDisplayName } : {}),
    ...(safePfpUrl ? { pfpUrl: safePfpUrl } : {}),
  }
}

function expectedChallengeContext(
  request: Record<string, unknown>,
  config: BridgeConfig,
): void {
  if (request.domain !== undefined && request.domain !== config.domain) {
    throw new HttpError(400, 'invalid_request', 'Invalid SIWF domain.')
  }
  if (request.siweUri !== undefined && request.siweUri !== config.siweUri) {
    throw new HttpError(400, 'invalid_request', 'Invalid SIWF URI.')
  }
}

function parseExpiry(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, 'invalid_request', 'Invalid challenge expiry.')
  }
  return value
}

function parseChallengeRequest(body: Record<string, unknown>, config: BridgeConfig): void {
  requireExactKeys(body, ['domain', 'siweUri'])
  expectedChallengeContext(body, config)
}

interface ExchangeInput {
  message: string
  signature: `0x${string}`
  nonce: string
  fid: string
  requestId: string
  domain: string
  siweUri: string
  expirationTime: string
  expiresAt?: number
  identity: PublicIdentity
}

function parseExchangeRequest(body: Record<string, unknown>): ExchangeInput {
  requireExactKeys(body, [
    'message', 'signature', 'nonce', 'fid', 'requestId', 'domain', 'siweUri', 'expirationTime', 'expiresAt', 'identity',
  ])
  const message = requireString(body.message, 'message', 8 * 1024)
  const signature = requireString(body.signature, 'signature', 2 + MAX_PROOF_SIGNATURE_BYTES * 2)
  const signatureHexLength = signature.length - 2
  if (
    !/^0x[0-9a-fA-F]+$/.test(signature)
    || signatureHexLength % 2 !== 0
    || signatureHexLength / 2 > MAX_PROOF_SIGNATURE_BYTES
  ) {
    throw new HttpError(400, 'invalid_request', 'Invalid signature.')
  }
  const fid = canonicalFid(body.fid)
  const identityCandidate = body.identity
  if (!identityCandidate || typeof identityCandidate !== 'object' || Array.isArray(identityCandidate)) {
    throw new HttpError(400, 'invalid_request', 'Invalid identity.')
  }
  return {
    message,
    signature: signature as `0x${string}`,
    nonce: requireString(body.nonce, 'nonce', 128),
    fid,
    requestId: requireString(body.requestId, 'requestId', 128),
    domain: requireString(body.domain, 'domain', 255),
    siweUri: requireString(body.siweUri, 'siweUri', 2048),
    expirationTime: requireString(body.expirationTime, 'expirationTime', 64),
    ...(body.expiresAt === undefined ? {} : { expiresAt: parseExpiry(body.expiresAt) }),
    identity: sanitizeIdentity(identityCandidate as Record<string, unknown>, fid),
  }
}

function verifyLocalChallenge(
  input: ExchangeInput,
  challenge: ChallengeRecord,
  origin: string,
  now: number,
): void {
  if (challenge.expiresAt <= now) {
    throw new HttpError(401, 'challenge_expired', 'This sign-in challenge has expired.')
  }
  if (
    challenge.origin !== origin
    || input.nonce !== challenge.nonce
    || input.requestId !== challenge.requestId
    || input.domain !== challenge.domain
    || input.siweUri !== challenge.siweUri
    || input.expirationTime !== new Date(challenge.expiresAt).toISOString()
    || (input.expiresAt !== undefined && input.expiresAt !== challenge.expiresAt)
  ) {
    throw new HttpError(401, 'challenge_mismatch', 'This sign-in challenge is invalid.')
  }
}

function verifySignedMessage(input: ExchangeInput, challenge: ChallengeRecord, now: number): void {
  let parsed: ReturnType<typeof parseSiweMessage>
  try {
    parsed = parseSiweMessage(input.message)
  } catch {
    throw new HttpError(401, 'invalid_proof', 'The Farcaster proof could not be verified.')
  }
  const expirationTime = parsed.expirationTime
  if (
    parsed.domain !== challenge.domain
    || parsed.uri !== challenge.siweUri
    || parsed.nonce !== challenge.nonce
    || parsed.requestId !== challenge.requestId
    || !expirationTime
    || !Number.isFinite(expirationTime.getTime())
    || expirationTime.toISOString() !== new Date(challenge.expiresAt).toISOString()
    || expirationTime.getTime() <= now
  ) {
    throw new HttpError(401, 'invalid_proof', 'The Farcaster proof could not be verified.')
  }
}

async function restoreRetryableChallenge(
  store: ChallengeStore,
  challenge: ChallengeRecord,
  now: () => number,
): Promise<void> {
  let currentTime: number
  try {
    currentTime = now()
  } catch {
    return
  }
  if (!Number.isFinite(currentTime) || challenge.expiresAt <= currentTime) return
  try {
    await store.put(challenge)
  } catch {
    // Restoration is best effort. Failure leaves the challenge consumed and
    // still fails closed without exposing proof or storage details.
  }
}

async function timingSafeSecretMatch(provided: string, expected: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [providedHash, expectedHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ])
  const actual = new Uint8Array(providedHash)
  const target = new Uint8Array(expectedHash)
  let difference = 0
  for (let index = 0; index < actual.length; index += 1) difference |= actual[index] ^ target[index]
  return difference === 0
}

function adminCredential(request: Request): string | null {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const token = authorization.slice('Bearer '.length)
  return token.length > 0 ? token : null
}

async function rejectAdminBody(request: Request): Promise<void> {
  if (request.headers.has('content-length')) {
    const advertisedLength = request.headers.get('content-length')
    if (advertisedLength === null || !/^\d+$/.test(advertisedLength)) {
      throw new HttpError(400, 'admin_body_not_allowed', 'This endpoint does not accept a request body.')
    }
    const byteLength = Number(advertisedLength)
    if (!Number.isSafeInteger(byteLength) || byteLength > MAX_REQUEST_BYTES) {
      throw new HttpError(413, 'body_too_large', 'Request body is too large.')
    }
    if (byteLength > 0) {
      throw new HttpError(400, 'admin_body_not_allowed', 'This endpoint does not accept a request body.')
    }
  }
  if (!request.body) return

  const reader = request.body.getReader()
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      if (!value || value.byteLength === 0) continue
      try {
        await reader.cancel()
      } catch {
        // The endpoint remains fail-closed even if stream cancellation fails.
      }
      throw new HttpError(400, 'admin_body_not_allowed', 'This endpoint does not accept a request body.')
    }
  } finally {
    reader.releaseLock()
  }
}

const MAX_AUTH_EPOCH = 0xffff_ffff

function defaultAuthEpochResolver(config: BridgeConfig): AuthEpochResolver {
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

function defaultChallengeStore(env: WorkerEnv): ChallengeStore {
  if (!env.CHALLENGE_REPLAY_GUARD) throw new ConfigurationError()
  return new DurableObjectChallengeStore(env.CHALLENGE_REPLAY_GUARD)
}

function defaultRateLimiter(env: WorkerEnv): RateLimiter {
  if (!env.AUTH_RATE_LIMITER) throw new ConfigurationError()
  return new DurableObjectRateLimiter(env.AUTH_RATE_LIMITER)
}

async function enforceRateLimit(
  request: Request,
  action: RateLimitAction,
  env: WorkerEnv,
  configured: RateLimiter | undefined,
  logger: SafeLogger,
): Promise<void> {
  let result
  try {
    result = await (configured ?? defaultRateLimiter(env)).check(request, action)
  } catch {
    logger.event('rate_limit_failed')
    throw new HttpError(503, 'rate_limit_unavailable', 'Authentication rate control is temporarily unavailable.')
  }
  if (!result.allowed) {
    logger.event('rate_limited')
    throw new HttpError(429, 'rate_limited', 'Too many authentication requests.', {
      'retry-after': String(result.retryAfterSeconds),
    })
  }
}

/**
 * A Fetch-API-only bridge suitable for Cloudflare Workers. Dependency injection
 * keeps proof, replay, and auth-epoch behavior independently testable.
 */
export function createAuthBridge(dependencies: AuthBridgeDependencies = {}): BridgeFetchHandler {
  const configReader = dependencies.configReader ?? readBridgeConfig
  const logger = dependencies.logger ?? noSecretLogger
  const now = dependencies.now ?? Date.now

  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      let config: BridgeConfig
      try {
        config = configReader(env)
      } catch {
        logger.event('configuration_error')
        return errorResponse(new HttpError(503, 'service_misconfigured', 'Authentication service is not configured.'))
      }

      const url = new URL(request.url)
      try {
        if (request.method === 'OPTIONS' && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')) {
          return allowedPreflight(request, config)
        }

        if (request.method === 'GET' && url.pathname === '/healthz') {
          return json({ ok: true, service: 'warpkeep-auth-bridge' }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
          const issuer = config.issuer
          return json({
            issuer,
            jwks_uri: `${issuer}/.well-known/jwks.json`,
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['ES256'],
            claims_supported: [
              'sub', 'aud', 'fid', 'token_type', 'auth_epoch', 'roles', 'session_iat', 'session_exp',
            ],
          }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'GET' && url.pathname === '/.well-known/jwks.json') {
          return json({ keys: [publicJwk(config)] }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'POST' && url.pathname === '/v1/farcaster/challenge') {
          const origin = requireAllowedBrowserOrigin(request, config)
          await enforceRateLimit(request, 'challenge', env, dependencies.rateLimiter, logger)
          const body = await parseObjectBody(request)
          parseChallengeRequest(body, config)
          const createdAt = now()
          const expiresAt = createdAt + CHALLENGE_TTL_MILLISECONDS
          const challenge: ChallengeRecord = {
            version: 1,
            requestId: randomId(),
            nonce: randomSiweNonce(),
            origin,
            domain: config.domain,
            siweUri: config.siweUri,
            createdAt,
            expiresAt,
          }
          const store = dependencies.challengeStore ?? defaultChallengeStore(env)
          await store.put(challenge)
          logger.event('challenge_issued')
          return json({
            nonce: challenge.nonce,
            requestId: challenge.requestId,
            createdAt,
            expiresAt,
            domain: challenge.domain,
            siweUri: challenge.siweUri,
            expirationTime: new Date(expiresAt).toISOString(),
          }, 201, corsHeaders(origin))
        }

        if (request.method === 'POST' && url.pathname === '/v1/farcaster/exchange') {
          const origin = requireAllowedBrowserOrigin(request, config)
          await enforceRateLimit(request, 'exchange', env, dependencies.rateLimiter, logger)
          const body = await parseObjectBody(request)
          const input = parseExchangeRequest(body)
          const store = dependencies.challengeStore ?? defaultChallengeStore(env)
          const challenge = await store.get(input.requestId)
          if (!challenge) throw new HttpError(401, 'challenge_not_found', 'This sign-in challenge is invalid or already used.')
          const currentTime = now()
          verifyLocalChallenge(input, challenge, origin, currentTime)
          verifySignedMessage(input, challenge, currentTime)

          // Claim the challenge before any paid/upstream work. Only one
          // contender can verify, resolve an epoch, or sign. Retryable service
          // failures restore the still-live challenge below.
          const claimed = await store.consume(input.requestId)
          if (!claimed || claimed.nonce !== challenge.nonce || claimed.expiresAt !== challenge.expiresAt) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_replayed', 'This sign-in challenge is invalid or already used.')
          }
          const verifier = dependencies.verifier ?? createOfficialFarcasterVerifier(config.farcasterRpcUrl)
          let verifiedFid: string
          try {
            verifiedFid = canonicalFid((await verifier.verify({
              message: input.message,
              signature: input.signature,
              nonce: challenge.nonce,
              domain: challenge.domain,
              acceptAuthAddress: true,
            })).fid)
          } catch (error) {
            if (error instanceof FarcasterVerifierUnavailableError) {
              await restoreRetryableChallenge(store, claimed, now)
              logger.event('exchange_rejected')
              throw new HttpError(503, 'verification_unavailable', 'Farcaster verification is temporarily unavailable.')
            }
            logger.event('exchange_rejected')
            throw new HttpError(401, 'invalid_proof', 'The Farcaster proof could not be verified.')
          }
          if (verifiedFid !== input.fid) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'fid_mismatch', 'The Farcaster proof could not be verified.')
          }

          // Resolve from authoritative server state before one-time consumption;
          // an outage does not burn a valid five-minute user challenge.
          let authEpoch: number
          try {
            authEpoch = requireEpoch(await (dependencies.authEpochResolver ?? defaultAuthEpochResolver(config)).resolve(verifiedFid))
          } catch (error) {
            await restoreRetryableChallenge(store, claimed, now)
            logAuthEpochFailure(logger, error)
            throw new HttpError(503, 'authorization_unavailable', 'Authorization is temporarily unavailable.')
          }
          logger.event('auth_epoch_resolved')

          // Upstream verification and authorization can cross the challenge's
          // absolute deadline. Re-read authoritative time immediately before
          // signing; an already claimed expired challenge stays consumed.
          const signingTime = now()
          if (!Number.isSafeInteger(signingTime) || signingTime < 0 || signingTime >= challenge.expiresAt) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_expired', 'This sign-in challenge has expired.')
          }
          const issuedAt = Math.floor(signingTime / 1000)
          let token: string
          try {
            token = await (dependencies.signer ?? signEs256Jwt)(
              config,
              playerClaims(config, issuedAt, verifiedFid, authEpoch, input.identity),
            )
          } catch {
            await restoreRetryableChallenge(store, claimed, now)
            logger.event('configuration_error')
            throw new HttpError(503, 'signing_unavailable', 'Authentication signing is temporarily unavailable.')
          }
          const completionTime = now()
          if (!Number.isSafeInteger(completionTime) || completionTime < 0 || completionTime >= challenge.expiresAt) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_expired', 'This sign-in challenge has expired.')
          }
          logger.event('exchange_succeeded')
          return json({
            token,
            tokenType: 'spacetime-access',
            expiresAt: (issuedAt + PLAYER_TOKEN_TTL_SECONDS) * 1000,
          }, 200, corsHeaders(origin))
        }

        if (request.method === 'POST' && url.pathname === '/v1/admin/token') {
          requireAdminNoOrigin(request)
          await enforceRateLimit(request, 'admin-token', env, dependencies.rateLimiter, logger)
          await rejectAdminBody(request)
          const credential = adminCredential(request)
          if (!credential || !(await timingSafeSecretMatch(credential, config.adminTokenSecret))) {
            logger.event('admin_token_rejected')
            throw new HttpError(401, 'invalid_admin_credentials', 'Admin credentials are invalid.')
          }
          const issuedAt = Math.floor(now() / 1000)
          let token: string
          try {
            token = await (dependencies.signer ?? signEs256Jwt)(config, adminClaims(config, issuedAt))
          } catch {
            logger.event('configuration_error')
            throw new HttpError(503, 'signing_unavailable', 'Authentication signing is temporarily unavailable.')
          }
          logger.event('admin_token_issued')
          return json({ token, tokenType: 'spacetime-access', expiresIn: ADMIN_TOKEN_TTL_SECONDS })
        }

        if (request.method === 'POST' && url.pathname === AUTH_EPOCH_PROBE_PATH) {
          requireAdminNoOrigin(request)
          // Reusing the existing persisted action preserves rollback compatibility.
          await enforceRateLimit(request, 'admin-token', env, dependencies.rateLimiter, logger)
          await rejectAdminBody(request)
          const credential = adminCredential(request)
          if (!credential || !(await timingSafeSecretMatch(credential, config.adminTokenSecret))) {
            logger.event('admin_probe_rejected')
            throw new HttpError(401, 'invalid_admin_credentials', 'Admin credentials are invalid.')
          }
          if (url.search) {
            throw new HttpError(400, 'admin_query_not_allowed', 'This endpoint does not accept query parameters.')
          }
          try {
            requireEpoch(await (dependencies.authEpochResolver ?? defaultAuthEpochResolver(config)).resolve(AUTH_EPOCH_PROBE_FID))
          } catch (error) {
            const stage = authEpochResolverFailureStage(error)
            if (!stage) throw error
            logger.event('auth_epoch_probe_failed')
            return json({ ok: false, stage }, 503)
          }
          logger.event('auth_epoch_probe_succeeded')
          return json({ ok: true })
        }

        throw new HttpError(404, 'not_found', 'Route not found.')
      } catch (error) {
        if (error instanceof HttpError) {
          return errorResponse(error, isServerOnlyAdminPath(url.pathname) ? {} : publicCorsHeaders(request, config))
        }
        // Do not attach `error`, request body, headers, or any request-derived
        // fields to logs: those can contain SIWF proof or credentials.
        logger.event('internal_error')
        return errorResponse(
          new HttpError(500, 'internal_error', 'Authentication service failed.'),
          isServerOnlyAdminPath(url.pathname) ? {} : publicCorsHeaders(request, config),
        )
      }
    },
  }
}
