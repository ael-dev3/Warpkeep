import type { WorkerEnv } from './types'

export const PLAYER_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60
export const ADMIN_TOKEN_TTL_SECONDS = 5 * 60
export const INTERNAL_ADMIN_TOKEN_TTL_SECONDS = 60
export const CHALLENGE_TTL_MILLISECONDS = 5 * 60 * 1000
export const MAX_REQUEST_BYTES = 16 * 1024

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
  spacetimeDbUri: string
  spacetimeDbDatabase: string
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
  if (url.search || url.hash || url.pathname !== '/' && url.pathname !== '') {
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

function parseKeyId(value: string): string {
  if (!/^[A-Za-z0-9._-]{1,128}$/.test(value)) {
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
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
    throw new ConfigurationError()
  }
  return value
}

export function readBridgeConfig(env: WorkerEnv): BridgeConfig {
  const environment: 'development' | 'production' = env.ENVIRONMENT === 'development'
    ? 'development'
    : 'production'
  const production = environment === 'production'
  const { issuer, issuerUrl } = parseIssuer(required(env, 'ISSUER'), production)
  const allowedOrigins = parseAllowedOrigins(required(env, 'ALLOWED_ORIGINS'), production)
  const domain = required(env, 'FARCASTER_DOMAIN')
  const siweUri = required(env, 'FARCASTER_SIWE_URI')
  const siweUrl = parseAbsoluteUrl(siweUri)
  if (siweUrl.host !== domain || siweUrl.toString() !== siweUri) {
    throw new ConfigurationError()
  }
  if (production && siweUrl.protocol !== 'https:') {
    throw new ConfigurationError()
  }
  if (!allowedOrigins.has(siweUrl.origin)) {
    throw new ConfigurationError()
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

  return {
    issuer,
    issuerUrl,
    allowedOrigins,
    domain,
    siweUri,
    farcasterRpcUrl,
    audience: env.OIDC_AUDIENCE?.trim() || 'warpkeep-spacetimedb',
    keyId: parseKeyId(configuredKid),
    privateJwk,
    adminTokenSecret: required(env, 'ADMIN_TOKEN_SECRET'),
    spacetimeDbUri,
    spacetimeDbDatabase,
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
