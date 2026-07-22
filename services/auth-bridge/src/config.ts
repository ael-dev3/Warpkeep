import type { WorkerEnv } from './types'

export const PLAYER_TOKEN_TTL_SECONDS = 10 * 60
export const ADMIN_TOKEN_TTL_SECONDS = 5 * 60
export const INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS = 15
export const QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS = 15
export const QA_OBSERVER_CHALLENGE_TTL_MILLISECONDS = 60 * 1_000
export const QA_OBSERVER_MAX_REGISTRATION_LIFETIME_MILLISECONDS = 366 * 24 * 60 * 60 * 1_000
export const SESSION_FAMILY_TTL_SECONDS = 30 * 24 * 60 * 60
export const CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1000
export const MAX_REQUEST_BYTES = 16 * 1024
export const MIN_ADMIN_TOKEN_SECRET_BYTES = 32
export const MAX_ADMIN_TOKEN_SECRET_BYTES = 512
export const MIN_SESSION_COOKIE_KEY_BYTES = 32
export const MAX_SESSION_COOKIE_KEY_BYTES = 512
export const PRODUCTION_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com'
/** Immutable public address; unlike a database alias, it cannot drift after a rename. */
export const PRODUCTION_SPACETIMEDB_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
export const PRODUCTION_QA_OBSERVER_SPACETIMEDB_URI = 'https://maincloud.spacetimedb.com'
const PRODUCTION_ISSUER = 'https://auth.warpkeep.com'
const PRODUCTION_DOMAIN = 'warpkeep.com'
const PRODUCTION_ORIGIN = 'https://warpkeep.com'

export type QaObserverSpacetimeDbConfig = Readonly<{
  uri: string
  database: string
  audience: string
}>

export interface BridgeConfig {
  issuer: string
  issuerUrl: URL
  allowedOrigins: ReadonlySet<string>
  domain: string
  siweUri: string
  farcasterRpcUrl: string
  audience: string
  keyId: string
  privateJwk: PrivateEcJwk
  adminTokenSecret: string
  sessionCookieKey: string
  spacetimeDbUri: string
  spacetimeDbDatabase: string
  publicAuthEnabled: boolean
  qaObserverEnabled: boolean
  qaObserverSpacetimeDb?: QaObserverSpacetimeDbConfig
  qaObserverPublicJwk?: PublicEcJwk
  qaObserverKeyRegisteredAt?: number
  qaObserverKeyExpiresAt?: number
  environment: 'development' | 'production'
}

export interface PrivateEcJwk extends JsonWebKey {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
  d: string
  kid?: string
}

export interface PublicEcJwk extends JsonWebKey {
  kty: 'EC'
  crv: 'P-256'
  x: string
  y: string
}

export class ConfigurationError extends Error {
  constructor(message = 'Bridge configuration is incomplete or invalid.') {
    super(message)
    this.name = 'ConfigurationError'
  }
}

function required(env: WorkerEnv, name: keyof WorkerEnv): string {
  const value = env[name]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ConfigurationError()
  }
  return value.trim()
}

function parseAbsoluteUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new ConfigurationError()
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new ConfigurationError()
  }
  return url
}

function parseIssuer(value: string, production: boolean): { issuer: string; issuerUrl: URL } {
  const url = parseAbsoluteUrl(value)
  if (production && url.protocol !== 'https:') {
    throw new ConfigurationError()
  }
  if (
    url.username
    || url.password
    || url.search
    || url.hash
    || url.pathname !== '/' && url.pathname !== ''
  ) {
    throw new ConfigurationError()
  }
  return { issuer: url.origin, issuerUrl: url }
}

function parseAllowedOrigins(value: string, production: boolean): ReadonlySet<string> {
  const origins = value.split(',').map((entry) => entry.trim()).filter(Boolean)
  if (origins.length === 0) {
    throw new ConfigurationError()
  }

  const normalized = new Set<string>()
  for (const origin of origins) {
    const url = parseAbsoluteUrl(origin)
    if (url.origin !== origin || url.pathname !== '/' && url.pathname !== '') {
      throw new ConfigurationError()
    }
    if (production && url.protocol !== 'https:') {
      throw new ConfigurationError()
    }
    normalized.add(url.origin)
  }
  return normalized
}

function parsePrivateJwk(value: string): PrivateEcJwk {
  let jwk: Partial<PrivateEcJwk>
  try {
    jwk = JSON.parse(value) as Partial<PrivateEcJwk>
  } catch {
    throw new ConfigurationError()
  }
  const coordinate = /^[A-Za-z0-9_-]{43}$/
  if (
    jwk.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || !jwk.x || !coordinate.test(jwk.x)
    || !jwk.y || !coordinate.test(jwk.y)
    || !jwk.d || !coordinate.test(jwk.d)
  ) {
    throw new ConfigurationError()
  }
  return jwk as PrivateEcJwk
}

function parseKeyId(value: unknown): string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
    throw new ConfigurationError()
  }
  return value
}

function parseAdminTokenSecret(value: string): string {
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes < MIN_ADMIN_TOKEN_SECRET_BYTES || bytes > MAX_ADMIN_TOKEN_SECRET_BYTES) {
    throw new ConfigurationError()
  }
  return value
}

function parseSessionCookieKey(value: string): string {
  const bytes = new TextEncoder().encode(value).byteLength
  if (bytes < MIN_SESSION_COOKIE_KEY_BYTES || bytes > MAX_SESSION_COOKIE_KEY_BYTES) {
    throw new ConfigurationError()
  }
  return value
}

function parseSpacetimeDbUri(value: string, production: boolean): string {
  const url = parseAbsoluteUrl(value)
  if (
    (production && url.protocol !== 'https:')
    || url.username
    || url.password
    || (url.pathname !== '/' && url.pathname !== '')
    || url.search
    || url.hash
  ) {
    throw new ConfigurationError()
  }
  return url.origin
}

function parseSpacetimeDbDatabase(value: string): string {
  const databaseIdentity = /^[a-f0-9]{64}$/
  const databaseAlias = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
  if (!databaseIdentity.test(value) && !databaseAlias.test(value)) {
    throw new ConfigurationError()
  }
  return value
}

function parseAudience(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new ConfigurationError()
  }
  return value
}

function parsePublicAuthEnabled(value: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new ConfigurationError()
  }
  return value === 'true'
}

function isCanonicalBase64UrlCoordinate(value: string): boolean {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value)) return false
  try {
    const binary = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`)
    if (binary.length !== 32) return false
    let encoded = ''
    for (let index = 0; index < binary.length; index += 1) {
      encoded += binary.charAt(index)
    }
    return btoa(encoded).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_') === value
  } catch {
    return false
  }
}

function parseQaObserverPublicJwk(value: string): PublicEcJwk {
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new ConfigurationError()
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigurationError()
  }
  const record = parsed as Record<string, unknown>
  const keys = Object.keys(record)
  if (
    keys.length !== 4
    || keys.some(key => !['kty', 'crv', 'x', 'y'].includes(key))
    || record.kty !== 'EC'
    || record.crv !== 'P-256'
    || typeof record.x !== 'string'
    || !isCanonicalBase64UrlCoordinate(record.x)
    || typeof record.y !== 'string'
    || !isCanonicalBase64UrlCoordinate(record.y)
  ) {
    throw new ConfigurationError()
  }
  return Object.freeze({
    kty: 'EC',
    crv: 'P-256',
    x: record.x,
    y: record.y,
  })
}

function parseQaObserverExpiry(value: string): number {
  const parsed = Date.parse(value)
  if (
    !Number.isSafeInteger(parsed)
    || parsed < 0
    || new Date(parsed).toISOString() !== value
  ) {
    throw new ConfigurationError()
  }
  return parsed
}

export function readBridgeConfig(env: WorkerEnv): BridgeConfig {
  const configuredEnvironment: 'development' | 'production' = env.ENVIRONMENT === 'development'
    ? 'development'
    : 'production'
  const { issuer, issuerUrl } = parseIssuer(required(env, 'ISSUER'), false)
  const allowedOrigins = parseAllowedOrigins(required(env, 'ALLOWED_ORIGINS'), false)
  const domain = required(env, 'FARCASTER_DOMAIN')
  const siweUri = required(env, 'FARCASTER_SIWE_URI')
  const siweUrl = parseAbsoluteUrl(siweUri)
  if (
    siweUrl.username
    || siweUrl.password
    || siweUrl.host !== domain
    || siweUrl.toString() !== siweUri
  ) {
    throw new ConfigurationError()
  }
  const canonicalPublicBoundary = issuer === PRODUCTION_ISSUER
    || domain === PRODUCTION_DOMAIN
    || siweUrl.origin === PRODUCTION_ORIGIN
    || allowedOrigins.has(PRODUCTION_ORIGIN)
  const production = configuredEnvironment === 'production' || canonicalPublicBoundary
  const environment: 'development' | 'production' = production ? 'production' : 'development'
  if (production && siweUrl.protocol !== 'https:') {
    throw new ConfigurationError()
  }
  if (!allowedOrigins.has(siweUrl.origin)) {
    throw new ConfigurationError()
  }
  if (production) {
    if (
      issuerUrl.protocol !== 'https:'
      || !/^[a-z0-9]+(?:[.-][a-z0-9]+)+$/.test(domain)
      || issuerUrl.hostname !== `auth.${domain}`
      || issuerUrl.port
      || [...allowedOrigins].some((origin) => {
        const allowed = new URL(origin)
        return allowed.protocol !== 'https:' || allowed.hostname !== domain || allowed.port
      })
    ) {
      throw new ConfigurationError()
    }
  }

  const privateJwk = parsePrivateJwk(required(env, 'SIGNING_KEY_JWK'))
  const configuredKid = env.OIDC_KEY_ID?.trim() || privateJwk.kid
  if (!configuredKid || (env.OIDC_KEY_ID?.trim() && privateJwk.kid && env.OIDC_KEY_ID.trim() !== privateJwk.kid)) {
    throw new ConfigurationError()
  }

  const farcasterRpcUrl = required(env, 'FARCASTER_RPC_URL')
  const rpcUrl = parseAbsoluteUrl(farcasterRpcUrl)
  if (production && rpcUrl.protocol !== 'https:') throw new ConfigurationError()

  const spacetimeDbUri = parseSpacetimeDbUri(required(env, 'SPACETIMEDB_URI'), production)
  const spacetimeDbDatabase = parseSpacetimeDbDatabase(required(env, 'SPACETIMEDB_DATABASE'))
  const audience = parseAudience(env.OIDC_AUDIENCE?.trim() || 'warpkeep-spacetimedb')
  if (
    production
    && (
      spacetimeDbUri !== PRODUCTION_SPACETIMEDB_URI
      || spacetimeDbDatabase !== PRODUCTION_SPACETIMEDB_DATABASE
    )
  ) {
    throw new ConfigurationError()
  }
  const adminTokenSecret = parseAdminTokenSecret(required(env, 'ADMIN_TOKEN_SECRET'))
  const sessionCookieKey = parseSessionCookieKey(required(env, 'SESSION_COOKIE_KEY'))
  if (
    sessionCookieKey === adminTokenSecret
    || sessionCookieKey === privateJwk.d
    || adminTokenSecret === privateJwk.d
  ) {
    throw new ConfigurationError()
  }

  const qaObserverEnabled = parsePublicAuthEnabled(required(env, 'QA_OBSERVER_ENABLED'))
  const qaSpacetimeDbUriValue = env.QA_OBSERVER_SPACETIMEDB_URI?.trim()
  const qaSpacetimeDbDatabaseValue = env.QA_OBSERVER_SPACETIMEDB_DATABASE?.trim()
  const qaAudienceValue = env.QA_OBSERVER_OIDC_AUDIENCE?.trim()
  const qaUpstreamValues = [qaSpacetimeDbUriValue, qaSpacetimeDbDatabaseValue, qaAudienceValue]
  if (!qaUpstreamValues.every(Boolean) && qaUpstreamValues.some(Boolean)) {
    throw new ConfigurationError()
  }
  if (qaObserverEnabled && !qaUpstreamValues.every(Boolean)) {
    throw new ConfigurationError()
  }
  const qaObserverSpacetimeDb = qaUpstreamValues.every(Boolean)
    ? Object.freeze({
        uri: parseSpacetimeDbUri(qaSpacetimeDbUriValue!, production),
        database: parseSpacetimeDbDatabase(qaSpacetimeDbDatabaseValue!),
        audience: parseAudience(qaAudienceValue!),
      })
    : undefined
  if (
    qaObserverSpacetimeDb
    && (
      (production && qaObserverSpacetimeDb.uri !== PRODUCTION_QA_OBSERVER_SPACETIMEDB_URI)
      || qaObserverSpacetimeDb.database === spacetimeDbDatabase
      || qaObserverSpacetimeDb.audience === audience
    )
  ) {
    throw new ConfigurationError()
  }
  const qaPublicJwkValue = env.QA_OBSERVER_PUBLIC_JWK?.trim()
  const qaRegisteredAtValue = env.QA_OBSERVER_KEY_REGISTERED_AT?.trim()
  const qaExpiryValue = env.QA_OBSERVER_KEY_EXPIRES_AT?.trim()
  const qaRegistrationValues = [qaPublicJwkValue, qaRegisteredAtValue, qaExpiryValue]
  if (!qaRegistrationValues.every(Boolean) && qaRegistrationValues.some(Boolean)) {
    throw new ConfigurationError()
  }
  if (qaObserverEnabled && !qaRegistrationValues.every(Boolean)) {
    throw new ConfigurationError()
  }
  const qaObserverPublicJwk = qaPublicJwkValue
    ? parseQaObserverPublicJwk(qaPublicJwkValue)
    : undefined
  const qaObserverKeyExpiresAt = qaExpiryValue
    ? parseQaObserverExpiry(qaExpiryValue)
    : undefined
  const qaObserverKeyRegisteredAt = qaRegisteredAtValue
    ? parseQaObserverExpiry(qaRegisteredAtValue)
    : undefined

  return {
    issuer,
    issuerUrl,
    allowedOrigins,
    domain,
    siweUri,
    farcasterRpcUrl,
    audience,
    keyId: parseKeyId(configuredKid),
    privateJwk,
    adminTokenSecret,
    sessionCookieKey,
    spacetimeDbUri,
    spacetimeDbDatabase,
    publicAuthEnabled: parsePublicAuthEnabled(required(env, 'PUBLIC_AUTH_ENABLED')),
    qaObserverEnabled,
    ...(qaObserverSpacetimeDb ? { qaObserverSpacetimeDb } : {}),
    ...(qaObserverPublicJwk ? { qaObserverPublicJwk } : {}),
    ...(qaObserverKeyRegisteredAt === undefined ? {} : { qaObserverKeyRegisteredAt }),
    ...(qaObserverKeyExpiresAt === undefined ? {} : { qaObserverKeyExpiresAt }),
    environment,
  }
}

/** Only public EC fields are intentionally exposed in JWKS. */
export function publicJwk(config: BridgeConfig): Record<string, string> {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: config.privateJwk.x,
    y: config.privateJwk.y,
    kid: config.keyId,
    use: 'sig',
    alg: 'ES256',
  }
}
