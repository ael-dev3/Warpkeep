import { parseSiweMessage } from 'viem/siwe'
import {
  BROWSER_BINDING_METHOD,
  isCanonicalBrowserBindingValue,
  matchesS256BrowserBinding,
} from './browserBinding'
import {
  ADMIN_TOKEN_TTL_SECONDS,
  CHALLENGE_TTL_MILLISECONDS,
  ConfigurationError,
  MAX_REQUEST_BYTES,
  PLAYER_TOKEN_TTL_SECONDS,
  SESSION_FAMILY_TTL_SECONDS,
  publicJwk,
  readBridgeConfig,
  type BridgeConfig,
} from './config'
import { DurableObjectChallengeStore } from './challengeStore'
import { FarcasterVerifierUnavailableError, createOfficialFarcasterVerifier } from './farcaster'
import { adminClaims, playerClaims, randomId, randomSiweNonce, signEs256Jwt } from './jwt'
import { DurableObjectRateLimiter } from './rateLimit'
import {
  DurableObjectSessionFamilyStore,
} from './sessionFamily'
import {
  createSessionCookieValue,
  createSessionFamilyId,
  expiredSessionSetCookie,
  readVerifiedSessionCookie,
  sessionSetCookie,
} from './sessionCookie'
import {
  AUTH_EPOCH_RESOLVER_TIMEOUT_MILLISECONDS,
  SpacetimeHttpAuthEpochResolver,
  authEpochResolverFailureStage,
  type AuthEpochResolverFailureStage,
} from './spacetimeAuthEpochResolver'
import type {
  AdmissionResolution,
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
  SessionFamilyRecord,
  SessionFamilyStore,
  WorkerEnv,
} from './types'

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
}

const MAX_PROOF_SIGNATURE_BYTES = 4 * 1024
export const REQUEST_BODY_TIMEOUT_MILLISECONDS = 8_000
export const FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS = 8_000
const AUTH_EPOCH_PROBE_PATH = '/v1/admin/auth-epoch-probe'
const CONFIG_ATTESTATION_PATH = '/v1/admin/config-attestation'
const AUTH_EPOCH_PROBE_FID = '9007199254740991'
const V2_CHALLENGE_PATH = '/v2/farcaster/challenge'
const V2_EXCHANGE_PATH = '/v2/farcaster/exchange'
const V2_REFRESH_PATH = '/v2/session/refresh'
const V2_LOGOUT_PATH = '/v2/session/logout'
const LEGACY_CHALLENGE_PATH = '/v1/farcaster/challenge'
const LEGACY_EXCHANGE_PATH = '/v1/farcaster/exchange'

const AUTH_EPOCH_FAILURE_EVENTS: Readonly<Record<AuthEpochResolverFailureStage, SafeLogEvent>> = Object.freeze({
  signing: 'auth_epoch_failed_signing',
  fetch_request: 'auth_epoch_failed_fetch_request',
  fetch_body: 'auth_epoch_failed_fetch_body',
  timeout: 'auth_epoch_failed_timeout',
  upstream_status: 'auth_epoch_failed_upstream_status',
  response_validation: 'auth_epoch_failed_response_validation',
})

const FORBIDDEN_REQUEST_KEYS = new Set([
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
  sessionFamilyStore?: SessionFamilyStore
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

function emptyResponseHeaders(headers: HeadersInit = {}): Headers {
  const merged = new Headers(JSON_HEADERS)
  merged.delete('content-type')
  new Headers(headers).forEach((value, name) => merged.set(name, value))
  return merged
}

function errorResponse(error: HttpError, headers: HeadersInit = {}): Response {
  const merged: Record<string, string> = {}
  new Headers(headers).forEach((value, name) => { merged[name] = value })
  new Headers(error.responseHeaders).forEach((value, name) => { merged[name] = value })
  return json({ error: { code: error.code, message: error.publicMessage } }, error.status, merged)
}

function corsHeaders(origin: string, credentials = false): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'access-control-max-age': '600',
    ...(credentials ? { 'access-control-allow-credentials': 'true' } : {}),
    vary: 'Origin',
  }
}

function isCredentialedPath(pathname: string): boolean {
  return pathname === V2_CHALLENGE_PATH
    || pathname === V2_EXCHANGE_PATH
    || pathname === V2_REFRESH_PATH
    || pathname === V2_LOGOUT_PATH
}

function publicCorsHeaders(request: Request, config: BridgeConfig, pathname = new URL(request.url).pathname): HeadersInit {
  const origin = request.headers.get('origin')
  return origin && config.allowedOrigins.has(origin)
    ? corsHeaders(origin, isCredentialedPath(pathname))
    : {}
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
  return pathname === '/v1/admin/token'
    || pathname === AUTH_EPOCH_PROBE_PATH
    || pathname === CONFIG_ATTESTATION_PATH
}

function isPublicAuthPath(pathname: string): boolean {
  return pathname === V2_CHALLENGE_PATH
    || pathname === V2_EXCHANGE_PATH
    || pathname === V2_REFRESH_PATH
}

function isLegacyAuthPath(pathname: string): boolean {
  return pathname === LEGACY_CHALLENGE_PATH || pathname === LEGACY_EXCHANGE_PATH
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
  return new Response(null, {
    status: 204,
    headers: emptyResponseHeaders(corsHeaders(origin, isCredentialedPath(new URL(request.url).pathname))),
  })
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
  const { chunks, totalBytes } = await withRequestBodyDeadline(reader, async () => {
    const chunks: Uint8Array[] = []
    let totalBytes = 0
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        totalBytes += value.byteLength
        if (totalBytes > MAX_REQUEST_BYTES) {
          cancelReaderBestEffort(reader)
          throw new HttpError(413, 'body_too_large', 'Request body is too large.')
        }
        chunks.push(value)
      }
      return { chunks, totalBytes }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // A timed-out read may still be settling after best-effort cancellation.
      }
    }
  })

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

function cancelReaderBestEffort(reader: ReadableStreamDefaultReader<Uint8Array>): void {
  try {
    void reader.cancel().catch(() => {
      // The already-selected static response remains authoritative.
    })
  } catch {
    // A synchronous cancellation failure cannot alter the static response.
  }
}

async function withRequestBodyDeadline<T>(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  operation: () => Promise<T>,
): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new HttpError(408, 'request_body_timeout', 'Request body was not received in time.'))
      cancelReaderBestEffort(reader)
    }, REQUEST_BODY_TIMEOUT_MILLISECONDS)
  })
  try {
    return await Promise.race([operation(), deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
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
    if (!allowed.includes(key) || FORBIDDEN_REQUEST_KEYS.has(key)) {
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

function requireAdmission(value: AdmissionResolution): AdmissionResolution {
  if (!value || typeof value !== 'object') throw new Error('Invalid admission resolver result.')
  if (value.state === 'enabled') {
    if (!Number.isSafeInteger(value.authEpoch) || value.authEpoch < 1 || value.authEpoch > MAX_AUTH_EPOCH) {
      throw new Error('Invalid admission resolver result.')
    }
    return Object.freeze({ state: 'enabled', authEpoch: value.authEpoch })
  }
  if ((value.state === 'missing' || value.state === 'disabled') && value.authEpoch === 0) {
    return Object.freeze({ state: value.state, authEpoch: 0 })
  }
  throw new Error('Invalid admission resolver result.')
}

function sanitizeIdentity(input: Record<string, unknown>, expectedFid: string): PublicIdentity {
  requireExactKeys(input, ['fid'])
  if (canonicalFid(input.fid) !== expectedFid) {
    throw new HttpError(400, 'fid_mismatch', 'The proof identity does not match the request.')
  }
  return { fid: expectedFid }
}

function parseChallengeRequest(
  request: Record<string, unknown>,
  config: BridgeConfig,
): Pick<ChallengeRecord, 'bindingChallenge' | 'bindingMethod'> {
  requireExactKeys(request, ['domain', 'siweUri', 'bindingChallenge', 'bindingMethod'])
  if (request.domain !== config.domain) {
    throw new HttpError(400, 'invalid_request', 'Invalid SIWF domain.')
  }
  if (request.siweUri !== config.siweUri) {
    throw new HttpError(400, 'invalid_request', 'Invalid SIWF URI.')
  }
  if (
    request.bindingMethod !== BROWSER_BINDING_METHOD
    || !isCanonicalBrowserBindingValue(request.bindingChallenge)
  ) {
    throw new HttpError(400, 'invalid_request', 'Invalid browser binding.')
  }
  return {
    bindingChallenge: request.bindingChallenge,
    bindingMethod: BROWSER_BINDING_METHOD,
  }
}

function parseExpiry(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new HttpError(400, 'invalid_request', 'Invalid challenge expiry.')
  }
  return value
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
  bindingVerifier: string
  rememberDevice: boolean
  identity: PublicIdentity
}

function bindingRejection(logger: SafeLogger, event: 'exchange_binding_missing' | 'exchange_binding_invalid'): never {
  logger.event(event)
  throw new HttpError(401, 'browser_binding_invalid', 'This sign-in challenge is invalid.')
}

function parseExchangeRequest(body: Record<string, unknown>, logger: SafeLogger): ExchangeInput {
  requireExactKeys(body, [
    'message', 'signature', 'nonce', 'fid', 'requestId', 'domain', 'siweUri', 'expirationTime', 'expiresAt',
    'bindingVerifier', 'rememberDevice', 'identity',
  ])
  if (!Object.prototype.hasOwnProperty.call(body, 'bindingVerifier')) {
    bindingRejection(logger, 'exchange_binding_missing')
  }
  if (!isCanonicalBrowserBindingValue(body.bindingVerifier)) {
    bindingRejection(logger, 'exchange_binding_invalid')
  }
  if (typeof body.rememberDevice !== 'boolean') {
    throw new HttpError(400, 'invalid_request', 'Invalid session preference.')
  }
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
    bindingVerifier: body.bindingVerifier,
    rememberDevice: body.rememberDevice,
    identity: sanitizeIdentity(identityCandidate as Record<string, unknown>, fid),
  }
}

function sameChallengeRecord(left: ChallengeRecord, right: ChallengeRecord): boolean {
  return left.version === right.version
    && left.requestId === right.requestId
    && left.nonce === right.nonce
    && left.origin === right.origin
    && left.domain === right.domain
    && left.siweUri === right.siweUri
    && left.createdAt === right.createdAt
    && left.expiresAt === right.expiresAt
    && left.bindingChallenge === right.bindingChallenge
    && left.bindingMethod === right.bindingMethod
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

async function configurationAttestation(config: BridgeConfig): Promise<string> {
  const canonical = JSON.stringify({
    profile: 'warpkeep-auth-v2',
    issuer: config.issuer,
    allowedOrigins: [...config.allowedOrigins].sort(),
    domain: config.domain,
    siweUri: config.siweUri,
    audience: config.audience,
    keyId: config.keyId,
    spacetimeDbUri: config.spacetimeDbUri,
    spacetimeDbDatabase: config.spacetimeDbDatabase,
    publicAuthEnabled: config.publicAuthEnabled,
    environment: config.environment,
    browserBinding: 'S256',
    accessTokenTtlSeconds: PLAYER_TOKEN_TTL_SECONDS,
    sessionFamilyTtlSeconds: SESSION_FAMILY_TTL_SECONDS,
    sessionCookie: '__Host-warpkeep_session; Secure; HttpOnly; SameSite=Strict; Path=/',
  })
  const bytes = new TextEncoder().encode(canonical)
  try {
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
    return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('')
  } finally {
    bytes.fill(0)
  }
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
  await withRequestBodyDeadline(reader, async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read()
        if (done) return
        if (!value || value.byteLength === 0) continue
        cancelReaderBestEffort(reader)
        throw new HttpError(400, 'admin_body_not_allowed', 'This endpoint does not accept a request body.')
      }
    } finally {
      try {
        reader.releaseLock()
      } catch {
        // A timed-out read may still be settling after best-effort cancellation.
      }
    }
  })
}

async function verifyFarcasterWithDeadline(
  verifier: FarcasterVerifier,
  input: Parameters<FarcasterVerifier['verify']>[0],
): Promise<Awaited<ReturnType<FarcasterVerifier['verify']>>> {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new FarcasterVerifierUnavailableError())
    }, FARCASTER_VERIFICATION_TIMEOUT_MILLISECONDS)
  })
  try {
    const verification = Promise.resolve().then(() => verifier.verify(input))
    return await Promise.race([verification, deadline])
  } finally {
    if (timeout !== undefined) clearTimeout(timeout)
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

function defaultSessionFamilyStore(env: WorkerEnv): SessionFamilyStore {
  if (!env.SESSION_FAMILIES) throw new ConfigurationError()
  return new DurableObjectSessionFamilyStore(env.SESSION_FAMILIES)
}

function sessionFamilyRecord(
  origin: string,
  identity: PublicIdentity,
  admission: AdmissionResolution,
  rememberDevice: boolean,
  createdAt: number,
): SessionFamilyRecord {
  if (admission.state === 'disabled') throw new Error('Disabled identities cannot create sessions.')
  return Object.freeze({
    version: 1,
    origin,
    identity,
    state: admission.state === 'enabled' ? 'bound' : 'pending',
    ...(admission.state === 'enabled' ? { authEpoch: admission.authEpoch } : {}),
    rememberDevice,
    currentGeneration: 1,
    createdAt,
    expiresAt: createdAt + SESSION_FAMILY_TTL_SECONDS * 1_000,
  })
}

function browserIdentity(identity: PublicIdentity): {
  fid: number
} {
  const fid = Number(identity.fid)
  if (!Number.isSafeInteger(fid) || fid <= 0) throw new Error('Invalid session identity.')
  return { fid }
}

async function sessionResponseBody(
  config: BridgeConfig,
  signer: typeof signEs256Jwt,
  record: SessionFamilyRecord,
  issuedAtMilliseconds: number,
): Promise<Record<string, unknown>> {
  const identity = browserIdentity(record.identity)
  const base = {
    version: 2,
    identity,
    sessionExpiresAt: record.expiresAt,
  }
  if (record.state === 'pending') {
    return { ...base, status: 'pending-admission' }
  }
  const authEpoch = record.authEpoch
  if (!Number.isSafeInteger(authEpoch) || (authEpoch as number) < 1) {
    throw new Error('Invalid bound session family.')
  }
  const issuedAt = Math.floor(issuedAtMilliseconds / 1_000)
  const familyExpiresAt = Math.floor(record.expiresAt / 1_000)
  const ttlSeconds = Math.min(PLAYER_TOKEN_TTL_SECONDS, familyExpiresAt - issuedAt)
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1) {
    throw new HttpError(401, 'session_expired', 'This browser session has expired.', {
      'set-cookie': expiredSessionSetCookie(),
    })
  }
  const claims = playerClaims(
    config,
    issuedAt,
    record.identity.fid,
    authEpoch as number,
    ttlSeconds,
  )
  const accessToken = await signer(config, claims)
  return {
    ...base,
    status: 'authorized',
    accessToken,
    tokenType: 'spacetime-access',
    accessExpiresAt: claims.exp * 1_000,
  }
}

async function sessionCookieHeader(
  config: BridgeConfig,
  familyId: string,
  record: SessionFamilyRecord,
  nowMilliseconds: number,
): Promise<string> {
  const remainingSeconds = Math.min(
    SESSION_FAMILY_TTL_SECONDS,
    Math.floor((record.expiresAt - nowMilliseconds) / 1_000),
  )
  if (!Number.isSafeInteger(remainingSeconds) || remainingSeconds < 1) {
    throw new Error('Session family has expired.')
  }
  return sessionSetCookie(
    await createSessionCookieValue(config.sessionCookieKey, familyId, record.currentGeneration),
    record.rememberDevice,
    remainingSeconds,
  )
}

function invalidSessionError(status = 401): HttpError {
  return new HttpError(status, 'session_invalid', 'This browser session is not authorized.', {
    'set-cookie': expiredSessionSetCookie(),
  })
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
      let url: URL
      try {
        url = new URL(request.url)
      } catch {
        return errorResponse(new HttpError(400, 'invalid_request_url', 'Request URL is invalid.'))
      }
      if (url.protocol !== 'https:') {
        logger.event('plaintext_request_rejected')
        return errorResponse(new HttpError(426, 'https_required', 'HTTPS is required.'))
      }

      let config: BridgeConfig
      try {
        config = configReader(env)
      } catch {
        logger.event('configuration_error')
        return errorResponse(new HttpError(503, 'service_misconfigured', 'Authentication service is not configured.'))
      }
      if (url.origin !== config.issuer) {
        logger.event('issuer_host_rejected')
        return errorResponse(new HttpError(421, 'misdirected_request', 'Request host is not authoritative.'))
      }

      try {
        if (isLegacyAuthPath(url.pathname)) {
          logger.event('legacy_auth_rejected')
          throw new HttpError(410, 'legacy_auth_retired', 'This authentication protocol has been retired.')
        }
        if (isPublicAuthPath(url.pathname) && !config.publicAuthEnabled) {
          logger.event('public_auth_paused')
          throw new HttpError(
            503,
            'public_auth_paused',
            'Farcaster sign-in is temporarily paused for security hardening.',
          )
        }
        if (request.method === 'OPTIONS' && isCredentialedPath(url.pathname)) {
          return allowedPreflight(request, config)
        }

        if (request.method === 'GET' && url.pathname === '/healthz') {
          return json({
            ok: true,
            service: 'warpkeep-auth-bridge',
            securityProfile: 'warpkeep-auth-v2',
            publicAuthEnabled: config.publicAuthEnabled,
          }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
          const issuer = config.issuer
          return json({
            issuer,
            jwks_uri: `${issuer}/.well-known/jwks.json`,
            subject_types_supported: ['public'],
            id_token_signing_alg_values_supported: ['ES256'],
            claims_supported: [
              'sub', 'aud', 'fid', 'token_type', 'auth_version', 'auth_epoch', 'roles', 'session_iat', 'session_exp',
            ],
          }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'GET' && url.pathname === '/.well-known/jwks.json') {
          return json({ keys: [publicJwk(config)] }, 200, publicCorsHeaders(request, config))
        }

        if (request.method === 'POST' && url.pathname === V2_CHALLENGE_PATH) {
          const origin = requireAllowedBrowserOrigin(request, config)
          await enforceRateLimit(request, 'challenge', env, dependencies.rateLimiter, logger)
          const body = await parseObjectBody(request)
          const browserBinding = parseChallengeRequest(body, config)
          const createdAt = now()
          const expiresAt = createdAt + CHALLENGE_TTL_MILLISECONDS
          const challenge: ChallengeRecord = {
            version: 2,
            requestId: randomId(),
            nonce: randomSiweNonce(),
            origin,
            domain: config.domain,
            siweUri: config.siweUri,
            createdAt,
            expiresAt,
            bindingChallenge: browserBinding.bindingChallenge,
            bindingMethod: browserBinding.bindingMethod,
          }
          const store = dependencies.challengeStore ?? defaultChallengeStore(env)
          await store.put(challenge)
          logger.event('challenge_binding_created')
          logger.event('challenge_issued')
          return json({
            nonce: challenge.nonce,
            requestId: challenge.requestId,
            createdAt,
            expiresAt,
            domain: challenge.domain,
            siweUri: challenge.siweUri,
            expirationTime: new Date(expiresAt).toISOString(),
          }, 201, corsHeaders(origin, true))
        }

        if (request.method === 'POST' && url.pathname === V2_EXCHANGE_PATH) {
          const origin = requireAllowedBrowserOrigin(request, config)
          await enforceRateLimit(request, 'exchange', env, dependencies.rateLimiter, logger)
          const body = await parseObjectBody(request)
          const input = parseExchangeRequest(body, logger)
          const store = dependencies.challengeStore ?? defaultChallengeStore(env)
          const challenge = await store.get(input.requestId)
          if (!challenge) throw new HttpError(401, 'challenge_not_found', 'This sign-in challenge is invalid or already used.')
          const currentTime = now()
          verifyLocalChallenge(input, challenge, origin, currentTime)
          let bindingVerifier = input.bindingVerifier
          let bindingMatches: boolean
          try {
            bindingMatches = await matchesS256BrowserBinding(
              bindingVerifier,
              challenge.bindingChallenge,
            )
          } catch {
            logger.event('internal_error')
            throw new HttpError(503, 'binding_verification_unavailable', 'Authentication is temporarily unavailable.')
          } finally {
            input.bindingVerifier = ''
            body.bindingVerifier = ''
            bindingVerifier = ''
          }
          if (!bindingMatches) {
            logger.event('exchange_binding_mismatch')
            throw new HttpError(401, 'browser_binding_invalid', 'This sign-in challenge is invalid.')
          }
          logger.event('exchange_binding_verified')
          verifySignedMessage(input, challenge, currentTime)

          // Claim the challenge before any paid/upstream work. Only one
          // contender can verify, resolve an epoch, or sign. Retryable service
          // failures restore the still-live challenge below.
          const claimed = await store.consume(input.requestId)
          if (!claimed || !sameChallengeRecord(claimed, challenge)) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_replayed', 'This sign-in challenge is invalid or already used.')
          }
          const verifier = dependencies.verifier ?? createOfficialFarcasterVerifier(config.farcasterRpcUrl)
          let verifiedFid: string
          try {
            verifiedFid = canonicalFid((await verifyFarcasterWithDeadline(verifier, {
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

          // Resolve from authoritative server state after the atomic claim;
          // an outage restores the still-live five-minute challenge below.
          let admission: AdmissionResolution
          try {
            admission = requireAdmission(
              await (dependencies.authEpochResolver ?? defaultAuthEpochResolver(config)).resolve(verifiedFid),
            )
          } catch (error) {
            await restoreRetryableChallenge(store, claimed, now)
            logAuthEpochFailure(logger, error)
            throw new HttpError(503, 'authorization_unavailable', 'Authorization is temporarily unavailable.')
          }
          logger.event('auth_epoch_resolved')
          if (admission.state === 'disabled') {
            logger.event('session_rejected')
            throw invalidSessionError(403)
          }

          // Upstream verification and authorization can cross the challenge's
          // absolute deadline. Re-read authoritative time immediately before
          // signing; an already claimed expired challenge stays consumed.
          const signingTime = now()
          if (!Number.isSafeInteger(signingTime) || signingTime < 0 || signingTime >= challenge.expiresAt) {
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_expired', 'This sign-in challenge has expired.')
          }
          const sessionStore = dependencies.sessionFamilyStore ?? defaultSessionFamilyStore(env)
          const familyId = createSessionFamilyId()
          const family = sessionFamilyRecord(
            origin,
            input.identity,
            admission,
            input.rememberDevice,
            signingTime,
          )
          let responseBody: Record<string, unknown>
          let setCookie: string
          try {
            responseBody = await sessionResponseBody(
              config,
              dependencies.signer ?? signEs256Jwt,
              family,
              signingTime,
            )
            setCookie = await sessionCookieHeader(config, familyId, family, signingTime)
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
          try {
            await sessionStore.create(familyId, family)
          } catch {
            await restoreRetryableChallenge(store, claimed, now)
            logger.event('internal_error')
            throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.')
          }
          const storedAt = now()
          if (!Number.isSafeInteger(storedAt) || storedAt < 0 || storedAt >= challenge.expiresAt) {
            try {
              await sessionStore.revoke(familyId)
            } catch {
              // The expired proof still fails closed; the orphan expires by alarm.
            }
            logger.event('exchange_rejected')
            throw new HttpError(401, 'challenge_expired', 'This sign-in challenge has expired.')
          }
          logger.event('session_created')
          if (family.state === 'pending') logger.event('session_pending')
          logger.event('exchange_succeeded')
          return json(responseBody, 200, {
            ...corsHeaders(origin, true),
            'set-cookie': setCookie,
          })
        }

        if (request.method === 'POST' && url.pathname === V2_REFRESH_PATH) {
          const origin = requireAllowedBrowserOrigin(request, config)
          await enforceRateLimit(request, 'session-refresh', env, dependencies.rateLimiter, logger)
          requireExactKeys(await parseObjectBody(request), [])
          const cookie = await readVerifiedSessionCookie(request, config.sessionCookieKey)
          if (!cookie) {
            logger.event('session_rejected')
            throw invalidSessionError()
          }
          const sessionStore = dependencies.sessionFamilyStore ?? defaultSessionFamilyStore(env)
          let existing: SessionFamilyRecord | null
          try {
            existing = await sessionStore.get(cookie.familyId)
          } catch {
            logger.event('internal_error')
            throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.')
          }
          if (!existing || existing.origin !== origin) {
            logger.event('session_rejected')
            throw invalidSessionError()
          }

          let admission: AdmissionResolution
          try {
            admission = requireAdmission(
              await (dependencies.authEpochResolver ?? defaultAuthEpochResolver(config)).resolve(existing.identity.fid),
            )
          } catch (error) {
            logAuthEpochFailure(logger, error)
            throw new HttpError(503, 'authorization_unavailable', 'Authorization is temporarily unavailable.')
          }
          logger.event('auth_epoch_resolved')
          const refreshTime = now()
          if (!Number.isSafeInteger(refreshTime) || refreshTime < 0) {
            throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.')
          }
          let refreshed: Awaited<ReturnType<SessionFamilyStore['refresh']>>
          try {
            refreshed = await sessionStore.refresh(
              cookie.familyId,
              cookie.generation,
              origin,
              admission,
              refreshTime,
            )
          } catch {
            logger.event('internal_error')
            throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.')
          }
          if (!refreshed) {
            logger.event('session_revoked')
            throw invalidSessionError(admission.state === 'disabled' ? 403 : 401)
          }

          let setCookie: string
          try {
            setCookie = await sessionCookieHeader(config, refreshed.familyId, refreshed.record, refreshTime)
          } catch {
            logger.event('configuration_error')
            throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.')
          }
          let responseBody: Record<string, unknown>
          try {
            responseBody = await sessionResponseBody(
              config,
              dependencies.signer ?? signEs256Jwt,
              refreshed.record,
              refreshTime,
            )
          } catch (error) {
            if (error instanceof HttpError) throw error
            logger.event('configuration_error')
            throw new HttpError(503, 'signing_unavailable', 'Authentication signing is temporarily unavailable.', {
              'set-cookie': setCookie,
            })
          }
          logger.event('session_refreshed')
          if (refreshed.record.state === 'pending') logger.event('session_pending')
          return json(responseBody, 200, {
            ...corsHeaders(origin, true),
            'set-cookie': setCookie,
          })
        }

        if (request.method === 'POST' && url.pathname === V2_LOGOUT_PATH) {
          const origin = requireAllowedBrowserOrigin(request, config)
          requireExactKeys(await parseObjectBody(request), [])
          const cookie = await readVerifiedSessionCookie(request, config.sessionCookieKey)
          if (cookie) {
            try {
              await (dependencies.sessionFamilyStore ?? defaultSessionFamilyStore(env)).revoke(cookie.familyId)
              logger.event('session_revoked')
            } catch {
              // Expire this browser's reference but do not claim that the
              // server-side family was revoked. A copied cookie remains a
              // bounded residual risk until the store recovers or its alarm
              // expires the family.
              logger.event('session_revoke_failed')
              throw new HttpError(503, 'session_unavailable', 'Authentication is temporarily unavailable.', {
                'set-cookie': expiredSessionSetCookie(),
              })
            }
          }
          const headers = emptyResponseHeaders(corsHeaders(origin, true))
          headers.set('set-cookie', expiredSessionSetCookie())
          return new Response(null, { status: 204, headers })
        }

        if (request.method === 'POST' && url.pathname === '/v1/admin/token') {
          requireAdminNoOrigin(request)
          if (url.search) {
            throw new HttpError(400, 'admin_query_not_allowed', 'This endpoint does not accept query parameters.')
          }
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
            requireAdmission(
              await (dependencies.authEpochResolver ?? defaultAuthEpochResolver(config)).resolve(AUTH_EPOCH_PROBE_FID),
            )
          } catch (error) {
            const stage = authEpochResolverFailureStage(error)
            if (!stage) throw error
            logger.event('auth_epoch_probe_failed')
            return json({ ok: false, stage }, 503)
          }
          logger.event('auth_epoch_probe_succeeded')
          return json({ ok: true })
        }

        if (request.method === 'POST' && url.pathname === CONFIG_ATTESTATION_PATH) {
          requireAdminNoOrigin(request)
          await enforceRateLimit(request, 'admin-token', env, dependencies.rateLimiter, logger)
          await rejectAdminBody(request)
          const credential = adminCredential(request)
          if (!credential || !(await timingSafeSecretMatch(credential, config.adminTokenSecret))) {
            logger.event('config_attestation_rejected')
            throw new HttpError(401, 'invalid_admin_credentials', 'Admin credentials are invalid.')
          }
          if (url.search) {
            throw new HttpError(400, 'admin_query_not_allowed', 'This endpoint does not accept query parameters.')
          }
          const digest = await configurationAttestation(config)
          logger.event('config_attestation_issued')
          return json({
            profile: 'warpkeep-auth-v2',
            digest,
            publicAuthEnabled: config.publicAuthEnabled,
          })
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
