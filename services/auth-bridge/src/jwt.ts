import type {
  AccessRequestOperation,
  AccessRequestResolverTokenClaims,
  AdminTokenClaims,
  Genesis002AdminTokenClaims,
  AuthEpochResolverTokenClaims,
  PlayerTokenClaims,
  PtrAdminTokenClaims,
  PtrOwnerTokenClaims,
  QaSnapshotResolverTokenClaims,
} from './types'
import {
  ADMIN_TOKEN_TTL_SECONDS,
  GENESIS_002_OIDC_AUDIENCE,
  INTERNAL_ACCESS_REQUEST_RESOLVER_TOKEN_TTL_SECONDS,
  INTERNAL_AUTH_EPOCH_RESOLVER_TOKEN_TTL_SECONDS,
  PLAYER_TOKEN_TTL_SECONDS,
  PTR_TOKEN_TTL_SECONDS,
  QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS,
  type BridgeConfig,
} from './config'

const encoder = new TextEncoder()
const MAX_AUTH_EPOCH = 0xffff_ffff

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
  claims:
    | PlayerTokenClaims
    | PtrOwnerTokenClaims
    | PtrAdminTokenClaims
    | AdminTokenClaims
    | AuthEpochResolverTokenClaims
    | AccessRequestResolverTokenClaims
    | QaSnapshotResolverTokenClaims,
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

/** Short, owner-bound token for the independently isolated Public Test Realm. */
export function ptrOwnerClaims(
  config: BridgeConfig,
  nowSeconds: number,
  fid: string,
  authEpoch: number,
  ttlSeconds = PTR_TOKEN_TTL_SECONDS,
): PtrOwnerTokenClaims {
  const ptr = config.ptrSpacetimeDb
  const numericFid = Number(fid)
  if (
    !ptr
    || config.ptrEnabled !== true
    || config.playerCanaryOwnerFid !== fid
    || !Number.isSafeInteger(nowSeconds)
    || nowSeconds < 0
    || !Number.isSafeInteger(ttlSeconds)
    || ttlSeconds < 1
    || ttlSeconds > PTR_TOKEN_TTL_SECONDS
    || nowSeconds > Number.MAX_SAFE_INTEGER - ttlSeconds
    || !/^[1-9]\d{0,15}$/.test(fid)
    || !Number.isSafeInteger(numericFid)
    || String(numericFid) !== fid
    || !Number.isSafeInteger(authEpoch)
    || authEpoch < 1
    || authEpoch > MAX_AUTH_EPOCH
  ) {
    throw new Error('Invalid PTR access-token configuration.')
  }
  return {
    iss: config.issuer,
    sub: `farcaster:${fid}`,
    aud: [ptr.audience],
    token_type: 'spacetime-access',
    auth_version: 2,
    realm_id: 'PTR',
    fid,
    auth_epoch: authEpoch,
    roles: ['warpkeep-ptr-owner'],
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    session_iat: nowSeconds,
    session_exp: nowSeconds + ttlSeconds,
    jti: randomId(),
  }
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

function hermesAdminClaims<const TAudience extends string>(
  issuer: string,
  audience: TAudience,
  nowSeconds: number,
  ttlSeconds: number,
): AdminTokenClaims & Readonly<{ aud: [TAudience] }> {
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

/** Five-minute Hermes token that grants authority only in sealed Genesis 002. */
export function genesis002AdminClaims(
  config: BridgeConfig,
  nowSeconds: number,
): Genesis002AdminTokenClaims {
  return hermesAdminClaims(
    config.issuer,
    GENESIS_002_OIDC_AUDIENCE,
    nowSeconds,
    ADMIN_TOKEN_TTL_SECONDS,
  )
}

/** Five-minute Hermes token for provisioning only the isolated PTR database. */
export function ptrAdminClaims(
  config: BridgeConfig,
  nowSeconds: number,
  ownerFid: string,
  ownerAuthEpoch: number,
): PtrAdminTokenClaims {
  const ptr = config.ptrSpacetimeDb
  const numericOwnerFid = Number(ownerFid)
  if (
    !config.ptrEnabled
    || !ptr
    || config.playerCanaryOwnerFid !== ownerFid
    || !/^[1-9]\d{0,15}$/.test(ownerFid)
    || !Number.isSafeInteger(numericOwnerFid)
    || String(numericOwnerFid) !== ownerFid
    || !Number.isSafeInteger(ownerAuthEpoch)
    || ownerAuthEpoch < 1
    || ownerAuthEpoch > MAX_AUTH_EPOCH
  ) throw new Error('Invalid PTR admin-token configuration.')
  return {
    ...hermesAdminClaims(config.issuer, ptr.audience, nowSeconds, ADMIN_TOKEN_TTL_SECONDS),
    ptr_owner_fid: ownerFid,
    ptr_owner_auth_epoch: ownerAuthEpoch,
  }
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

/** Fresh 15-second writer token bound to one canonical server-verified FID. */
export function accessRequestResolverClaims(
  issuer: string,
  audience: string,
  requestFid: string,
  requestOperation: AccessRequestOperation,
  nowSeconds: number,
): AccessRequestResolverTokenClaims {
  return {
    iss: issuer,
    sub: 'service:access-request-resolver',
    aud: [audience],
    token_type: 'spacetime-access',
    roles: ['warpkeep-access-request-resolver'],
    request_fid: requestFid,
    request_operation: requestOperation,
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + INTERNAL_ACCESS_REQUEST_RESOLVER_TOKEN_TTL_SECONDS,
    jti: randomId(),
  }
}

/** Fresh server-only token bound to the registered QA device thumbprint. */
export function qaSnapshotResolverClaims(
  issuer: string,
  audience: string,
  deviceThumbprint: string,
  nowSeconds: number,
): QaSnapshotResolverTokenClaims {
  return {
    iss: issuer,
    sub: 'service:qa-snapshot-resolver',
    aud: [audience],
    token_type: 'spacetime-access',
    roles: ['warpkeep-qa-snapshot-resolver'],
    device_thumbprint: deviceThumbprint,
    iat: nowSeconds,
    nbf: nowSeconds,
    exp: nowSeconds + QA_SNAPSHOT_RESOLVER_TOKEN_TTL_SECONDS,
    jti: randomId(),
  }
}
