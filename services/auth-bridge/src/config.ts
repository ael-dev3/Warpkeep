import type { WorkerEnv } from './types'

export const PLAYER_TOKEN_TTL_SECONDS = 10 * 60
export const PTR_TOKEN_TTL_SECONDS = 2 * 60
export const ADMIN_TOKEN_TTL_SECONDS = 5 * 60
export const INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS = 15
export const INTERNAL_ACCESS_REQUEST_RESOLVER_TOKEN_TTL_SECONDS = 15
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
export const PTR_OIDC_AUDIENCE = 'warpkeep-ptr-spacetimedb'
const PRODUCTION_ISSUER = 'https://auth.warpkeep.com'
const PRODUCTION_DOMAIN = 'warpkeep.com'
const PRODUCTION_ORIGIN = 'https://warpkeep.com'
const SPACETIMEDB_DATABASE_IDENTITY_PATTERN = /^[a-f0-9]{64}$/
const SPACETIMEDB_DATABASE_ALIAS_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/
const BRIDGE_SOURCE_COMMIT_PATTERN = /^[a-f0-9]{40}$/

export type QaObserverSpacetimeDbConfig = Readonly<{
  uri: string
  database: string
  audience: string
}>

export type PtrSpacetimeDbConfig = Readonly<{
  database: string
  audience: typeof PTR_OIDC_AUDIENCE
}>

export type FarcasterRpcUrls = readonly [string] | readonly [string, string]

export type MiniAppNotificationClient = Readonly<{
  appFid: number
  deliveryUrl: string
}>

export type MiniAppNotificationConfig = Readonly<{
  hubUrls: readonly [string, string]
  clients: readonly MiniAppNotificationClient[]
  operatorSecret: string
}>

export interface BridgeConfig {
  issuer: string
  issuerUrl: URL
  allowedOrigins: ReadonlySet<string>
  domain: string
  siweUri: string
  farcasterRpcUrls: FarcasterRpcUrls
  audience: string
  keyId: string
  privateJwk: PrivateEcJwk
  adminTokenSecret: string
  sessionCookieKey: string
  playerCanaryOwnerFid?: string
  /** Optional on hand-built test configs; absence is always treated as disabled. */
  ptrEnabled?: boolean
  ptrSpacetimeDb?: PtrSpacetimeDbConfig
  spacetimeDbUri: string
  spacetimeDbDatabase: string
  publicAuthEnabled: boolean
  accessExpectedFidRequired: boolean
  qaObserverEnabled: boolean
  qaObserverSpacetimeDb?: QaObserverSpacetimeDbConfig
  qaObserverPublicJwk?: PublicEcJwk
  qaObserverKeyRegisteredAt?: number
  qaObserverKeyExpiresAt?: number
  approvalNotificationsEnabled: boolean
  miniAppNotifications?: MiniAppNotificationConfig
  bridgeSourceCommit?: string
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
  if (
    jwk.kty !== 'EC'
    || jwk.crv !== 'P-256'
    || !jwk.x || !isCanonicalBase64UrlCoordinate(jwk.x)
    || !jwk.y || !isCanonicalBase64UrlCoordinate(jwk.y)
    || !jwk.d || !isCanonicalBase64UrlCoordinate(jwk.d)
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

function parseOptionalPlayerCanaryOwnerFid(value: string | undefined): string | undefined {
  if (value === undefined) return undefined
  const canonical = value
  if (!/^[1-9]\d{0,15}$/.test(canonical)) {
    throw new ConfigurationError()
  }
  const fid = Number(canonical)
  if (!Number.isSafeInteger(fid) || String(fid) !== canonical) {
    throw new ConfigurationError()
  }
  return canonical
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
  if (!SPACETIMEDB_DATABASE_IDENTITY_PATTERN.test(value) && !SPACETIMEDB_DATABASE_ALIAS_PATTERN.test(value)) {
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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  return normalized === 'localhost'
    || normalized.endsWith('.localhost')
    || normalized === '127.0.0.1'
    || normalized === '[::1]'
}

function isPublicDnsHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase()
  if (
    isLoopbackHostname(normalized)
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)
    || normalized.includes(':')
    || normalized.endsWith('.local')
    || normalized.endsWith('.internal')
    || normalized.endsWith('.invalid')
    || normalized.endsWith('.localhost')
    || normalized.endsWith('.test')
    || normalized.endsWith('.example')
  ) {
    return false
  }
  const label = '[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?'
  return new RegExp(`^${label}(?:\\.${label})+$`).test(normalized)
}

function parseFarcasterRpcUrls(env: WorkerEnv, production: boolean): FarcasterRpcUrls {
  const primary = parseAbsoluteUrl(required(env, 'FARCASTER_RPC_URL'))
  const secondaryValue = env.FARCASTER_RPC_URL_SECONDARY?.trim()
  const urls = secondaryValue
    ? [primary, parseAbsoluteUrl(secondaryValue)]
    : [primary]

  for (const url of urls) {
    if (
      url.username
      || url.password
      || url.hash
      || (url.protocol === 'http:' && !isLoopbackHostname(url.hostname))
      || (production && (
        url.protocol !== 'https:'
        || Boolean(url.port)
        || !isPublicDnsHostname(url.hostname)
      ))
    ) {
      throw new ConfigurationError()
    }
  }

  if (production && urls.length !== 2) {
    throw new ConfigurationError()
  }
  if (!production && urls.length === 1 && !isLoopbackHostname(primary.hostname)) {
    throw new ConfigurationError()
  }
  if (urls.length === 2 && urls[0].origin === urls[1].origin) {
    throw new ConfigurationError()
  }

  const normalized = urls.map(url => url.toString())
  return normalized.length === 2
    ? Object.freeze([normalized[0], normalized[1]])
    : Object.freeze([normalized[0]])
}

function parsePublicAuthEnabled(value: string): boolean {
  if (value !== 'true' && value !== 'false') {
    throw new ConfigurationError()
  }
  return value === 'true'
}

function parseOptionalBridgeSourceCommit(value: string | undefined): string | undefined {
  return typeof value === 'string' && BRIDGE_SOURCE_COMMIT_PATTERN.test(value)
    ? value
    : undefined
}

function parseMiniAppHubUrls(value: string, production: boolean): readonly [string, string] {
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean)
  if (entries.length !== 2) throw new ConfigurationError()
  const urls = entries.map(entry => parseAbsoluteUrl(entry))
  for (const url of urls) {
    if (
      url.username
      || url.password
      || url.search
      || url.hash
      || (url.pathname !== '/' && url.pathname !== '')
      || (production && (url.protocol !== 'https:' || !isPublicDnsHostname(url.hostname)))
      || (!production && url.protocol === 'http:' && !isLoopbackHostname(url.hostname))
    ) {
      throw new ConfigurationError()
    }
  }
  if (urls[0].origin === urls[1].origin) throw new ConfigurationError()
  return Object.freeze([urls[0].toString(), urls[1].toString()])
}

function parseMiniAppNotificationClients(
  value: string,
  production: boolean,
): readonly MiniAppNotificationClient[] {
  const entries = value.split(',').map(entry => entry.trim()).filter(Boolean)
  if (entries.length < 1 || entries.length > 8) throw new ConfigurationError()
  const seenFids = new Set<number>()
  const seenUrls = new Set<string>()
  const clients = entries.map(entry => {
    const separator = entry.indexOf('=')
    if (separator < 1 || separator !== entry.lastIndexOf('=')) {
      throw new ConfigurationError()
    }
    const fidText = entry.slice(0, separator)
    if (!/^[1-9]\d{0,15}$/.test(fidText)) throw new ConfigurationError()
    const appFid = Number(fidText)
    if (!Number.isSafeInteger(appFid) || seenFids.has(appFid)) {
      throw new ConfigurationError()
    }
    const url = parseAbsoluteUrl(entry.slice(separator + 1))
    if (
      url.username
      || url.password
      || url.search
      || url.hash
      || url.pathname === '/'
      || (production && (
        url.protocol !== 'https:'
        || Boolean(url.port)
        || !isPublicDnsHostname(url.hostname)
      ))
      || (!production && url.protocol === 'http:' && !isLoopbackHostname(url.hostname))
      || seenUrls.has(url.toString())
    ) {
      throw new ConfigurationError()
    }
    seenFids.add(appFid)
    seenUrls.add(url.toString())
    return Object.freeze({ appFid, deliveryUrl: url.toString() })
  })
  clients.sort((left, right) => left.appFid - right.appFid)
  return Object.freeze(clients)
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

  const farcasterRpcUrls = parseFarcasterRpcUrls(env, production)

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
  const playerCanaryOwnerFid = parseOptionalPlayerCanaryOwnerFid(
    env.PLAYER_CANARY_OWNER_FID,
  )
  if (
    sessionCookieKey === adminTokenSecret
    || sessionCookieKey === privateJwk.d
    || adminTokenSecret === privateJwk.d
  ) {
    throw new ConfigurationError()
  }

  const qaObserverEnabled = parsePublicAuthEnabled(required(env, 'QA_OBSERVER_ENABLED'))
  const approvalNotificationsEnabled = env.APPROVAL_NOTIFICATIONS_ENABLED === undefined
    ? false
    : parsePublicAuthEnabled(env.APPROVAL_NOTIFICATIONS_ENABLED)
  let miniAppNotifications: MiniAppNotificationConfig | undefined
  const notificationConfigurationValues = [
    env.MINIAPP_NOTIFICATION_HUB_URLS?.trim(),
    env.MINIAPP_NOTIFICATION_CLIENTS?.trim(),
    env.NOTIFICATION_OPERATOR_SECRET?.trim(),
  ]
  if (
    notificationConfigurationValues.some(Boolean)
    && !notificationConfigurationValues.every(Boolean)
  ) {
    throw new ConfigurationError()
  }
  if (notificationConfigurationValues.every(Boolean)) {
    const operatorSecret = parseAdminTokenSecret(required(env, 'NOTIFICATION_OPERATOR_SECRET'))
    if (
      operatorSecret === adminTokenSecret
      || operatorSecret === sessionCookieKey
      || operatorSecret === privateJwk.d
    ) {
      throw new ConfigurationError()
    }
    miniAppNotifications = Object.freeze({
      hubUrls: parseMiniAppHubUrls(required(env, 'MINIAPP_NOTIFICATION_HUB_URLS'), production),
      clients: parseMiniAppNotificationClients(
        required(env, 'MINIAPP_NOTIFICATION_CLIENTS'),
        production,
      ),
      operatorSecret,
    })
  }
  if (approvalNotificationsEnabled && !miniAppNotifications) {
    throw new ConfigurationError()
  }
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
      || (production && !SPACETIMEDB_DATABASE_IDENTITY_PATTERN.test(qaObserverSpacetimeDb.database))
      || qaObserverSpacetimeDb.database === spacetimeDbDatabase
      || qaObserverSpacetimeDb.audience === audience
    )
  ) {
    throw new ConfigurationError()
  }
  const ptrEnabled = env.PTR_ENABLED === undefined
    ? false
    : parsePublicAuthEnabled(env.PTR_ENABLED)
  const ptrDatabaseValue = env.PTR_SPACETIMEDB_DATABASE
  const ptrAudienceValue = env.PTR_OIDC_AUDIENCE
  const ptrValues = [ptrDatabaseValue, ptrAudienceValue]
  if (
    ptrValues.some(value => value !== undefined)
    && !ptrValues.every(value => typeof value === 'string' && value.length > 0)
  ) {
    throw new ConfigurationError()
  }
  const ptrConfigured = ptrValues.every(value => typeof value === 'string' && value.length > 0)
  if (
    ptrConfigured
    && (
      !SPACETIMEDB_DATABASE_IDENTITY_PATTERN.test(ptrDatabaseValue!)
      || ptrAudienceValue !== PTR_OIDC_AUDIENCE
      || ptrDatabaseValue === spacetimeDbDatabase
      || ptrDatabaseValue === qaObserverSpacetimeDb?.database
      || PTR_OIDC_AUDIENCE === audience
      || PTR_OIDC_AUDIENCE === qaObserverSpacetimeDb?.audience
    )
  ) {
    throw new ConfigurationError()
  }
  const ptrSpacetimeDb: PtrSpacetimeDbConfig | undefined = ptrConfigured
    ? Object.freeze({
        database: ptrDatabaseValue!,
        audience: PTR_OIDC_AUDIENCE,
      })
    : undefined
  if (ptrEnabled && (!ptrSpacetimeDb || playerCanaryOwnerFid === undefined)) {
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
  const bridgeSourceCommit = parseOptionalBridgeSourceCommit(
    env.WARPKEEP_BRIDGE_SOURCE_COMMIT,
  )

  return {
    issuer,
    issuerUrl,
    allowedOrigins,
    domain,
    siweUri,
    farcasterRpcUrls,
    audience,
    keyId: parseKeyId(configuredKid),
    privateJwk,
    adminTokenSecret,
    sessionCookieKey,
    ...(playerCanaryOwnerFid === undefined ? {} : { playerCanaryOwnerFid }),
    ptrEnabled,
    ...(ptrSpacetimeDb ? { ptrSpacetimeDb } : {}),
    spacetimeDbUri,
    spacetimeDbDatabase,
    publicAuthEnabled: parsePublicAuthEnabled(required(env, 'PUBLIC_AUTH_ENABLED')),
    accessExpectedFidRequired: env.ACCESS_EXPECTED_FID_REQUIRED === undefined
      ? false
      : parsePublicAuthEnabled(env.ACCESS_EXPECTED_FID_REQUIRED),
    qaObserverEnabled,
    approvalNotificationsEnabled,
    ...(miniAppNotifications ? { miniAppNotifications } : {}),
    ...(bridgeSourceCommit === undefined ? {} : { bridgeSourceCommit }),
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
