import type {
  AdminTokenClaims,
  AuthEpochResolverTokenClaims,
  PlayerTokenClaims,
} from './types'
import {
  ADMIN_TOKEN_TTL_SECONDS,
  INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS,
  PLAYER_TOKEN_TTL_SECONDS,
  type BridgeConfig,
} from './config'

const encoder = new TextEncoder()

function base64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function base64UrlJson(value: unknown): string {
  return base64Url(encoder.encode(JSON.stringify(value)))
}

export function randomId(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return base64Url(bytes)
}

/** SIWE requires a nonce of at least eight alphanumeric characters. */
export function randomSiweNonce(byteLength = 18): string {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function signingKey(config: BridgeConfig): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    config.privateJwk as JsonWebKey,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
}

export async function signEs256Jwt(
  config: BridgeConfig,
  claims: PlayerTokenClaims | AdminTokenClaims | AuthEpochResolverTokenClaims,
): Promise<string> {
  const encodedHeader = base64UrlJson({ alg: 'ES256', typ: 'JWT', kid: config.keyId })
  const encodedPayload = base64UrlJson(claims)
  const signingInput = `${encodedHeader}.${encodedPayload}`
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    await signingKey(config),
    encoder.encode(signingInput),
  )
  return `${signingInput}.${base64Url(new Uint8Array(signature))}`
}

export function playerClaims(
  config: BridgeConfig,
  nowSeconds: number,
  fid: string,
  authEpoch: number,
  ttlSeconds = PLAYER_TOKEN_TTL_SECONDS,
): PlayerTokenClaims {
  if (!Number.isSafeInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > PLAYER_TOKEN_TTL_SECONDS) {
    throw new Error('Invalid player access-token lifetime.')
  }
  return {
    iss: config.issuer,
    sub: `farcaster:${fid}`,
    aud: [config.audience],
    token_type: 'spacetime-access',
    auth_version: 2,
    fid,
    auth_epoch: authEpoch,
    roles: [],
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    session_iat: nowSeconds,
    session_exp: nowSeconds + ttlSeconds,
    jti: randomId(),
  }
}

function hermesAdminClaims(
  issuer: string,
  audience: string,
  nowSeconds: number,
  ttlSeconds: number,
): AdminTokenClaims {
  return {
    iss: issuer,
    sub: 'service:hermes',
    aud: [audience],
    token_type: 'spacetime-access',
    roles: ['warpkeep-admin'],
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    jti: randomId(),
  }
}

/** Five-minute external Hermes token for the server-only admin endpoint. */
export function adminClaims(config: BridgeConfig, nowSeconds: number): AdminTokenClaims {
  return hermesAdminClaims(config.issuer, config.audience, nowSeconds, ADMIN_TOKEN_TTL_SECONDS)
}

/** Fresh 15-second resolver token bound to one canonical verified FID. */
export function authEpochResolverClaims(
  issuer: string,
  audience: string,
  resolverFid: string,
  nowSeconds: number,
): AuthEpochResolverTokenClaims {
  return {
    iss: issuer,
    sub: 'service:auth-epoch-resolver',
    aud: [audience],
    token_type: 'spacetime-access',
    roles: ['warpkeep-auth-epoch-resolver'],
    resolver_fid: resolverFid,
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS,
    jti: randomId(),
  }
}
