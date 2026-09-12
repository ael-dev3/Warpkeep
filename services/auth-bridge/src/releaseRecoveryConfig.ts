import {
  ConfigurationError,
  GENESIS_002_OIDC_AUDIENCE,
  PRODUCTION_SPACETIMEDB_DATABASE,
  PRODUCTION_SPACETIMEDB_URI,
  PTR_OIDC_AUDIENCE,
  readBridgeConfig,
  type BridgeConfig,
} from './config.js'
import type { WorkerEnv } from './types.js'

export const RELEASE_RECOVERY_BRIDGE_SERVICE = 'warpkeep-auth-bridge' as const
export const RELEASE_RECOVERY_BRIDGE_WORKER_VERSION = 'warpkeep-auth-bridge-release-recovery-v1' as const
export const RELEASE_RECOVERY_GENESIS_001_AUDIENCE = 'warpkeep-spacetimedb' as const
export const RELEASE_RECOVERY_SPACETIME_ORIGIN = 'https://maincloud.spacetimedb.com' as const

const RELEASE_RECOVERY_CONFIG_PROFILE = 'warpkeep-release-recovery-bridge-config-v1' as const
const RELEASE_RECOVERY_CONFIG_DOMAIN = 'warpkeep.release-recovery.bridge-config.v1\n'
const RELEASE_RECOVERY_CANARY_DOMAIN = 'warpkeep.release-recovery.bridge-config.canary-fid.v1\n'
const DATABASE_IDENTITY_PATTERN = /^[0-9a-f]{64}$/
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/
const CANONICAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const CANONICAL_POSITIVE_DECIMAL_PATTERN = /^[1-9][0-9]{0,15}$/
const CANONICAL_32_BYTE_BASE64URL_PATTERN = /^[A-Za-z0-9_-]{43}$/

const encoder = new TextEncoder()

export const RELEASE_RECOVERY_BRIDGE_CONFIG_KEYS = Object.freeze([
  'schemaVersion',
  'profile',
  'bridgeWorkerVersion',
  'bridgeSourceCommit',
  'bridgeConfigEpoch',
  'spacetimeOrigin',
  'genesis001Database',
  'genesis002Database',
  'ptrDatabase',
  'genesis001Audience',
  'genesis002Audience',
  'ptrAudience',
  'ptrEnabled',
  'signingPublicJwkThumbprint',
  'rpcCredentialSha256',
  'censusPepperSha256',
  'canaryFidHmacSha256',
] as const)

export type ReleaseRecoveryConfig = Readonly<{
  bridgeConfig: BridgeConfig
  bridgeService: typeof RELEASE_RECOVERY_BRIDGE_SERVICE
  bridgeWorkerVersion: typeof RELEASE_RECOVERY_BRIDGE_WORKER_VERSION
  bridgeWorkerVersionId: string
  bridgeSourceCommit: string
  bridgeConfigEpoch: number
  bridgeConfigIdentity: string
  spacetimeOrigin: typeof RELEASE_RECOVERY_SPACETIME_ORIGIN
  genesis001Database: string
  genesis002Database: string
  ptrDatabase: string
  genesis001Audience: typeof RELEASE_RECOVERY_GENESIS_001_AUDIENCE
  genesis002Audience: typeof GENESIS_002_OIDC_AUDIENCE
  ptrAudience: typeof PTR_OIDC_AUDIENCE
  rpcCredential: string
  censusPepperBytes: Uint8Array
  canaryFid: string
}>

type ConfigProjection = Readonly<{
  schemaVersion: 1
  profile: typeof RELEASE_RECOVERY_CONFIG_PROFILE
  bridgeWorkerVersion: typeof RELEASE_RECOVERY_BRIDGE_WORKER_VERSION
  bridgeSourceCommit: string
  bridgeConfigEpoch: number
  spacetimeOrigin: typeof RELEASE_RECOVERY_SPACETIME_ORIGIN
  genesis001Database: string
  genesis002Database: string
  ptrDatabase: string
  genesis001Audience: typeof RELEASE_RECOVERY_GENESIS_001_AUDIENCE
  genesis002Audience: typeof GENESIS_002_OIDC_AUDIENCE
  ptrAudience: typeof PTR_OIDC_AUDIENCE
  ptrEnabled: true
  signingPublicJwkThumbprint: string
  rpcCredentialSha256: string
  censusPepperSha256: string
  canaryFidHmacSha256: string
}>

function invalid(): never {
  throw new ConfigurationError()
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function decodeCanonical32ByteBase64Url(value: unknown): Uint8Array {
  if (typeof value !== 'string' || !CANONICAL_32_BYTE_BASE64URL_PATTERN.test(value)) invalid()
  try {
    const binary = atob(`${value.replace(/-/g, '+').replace(/_/g, '/')}=`)
    const bytes = Uint8Array.from(binary, character => character.charCodeAt(0))
    if (bytes.length !== 32 || encodeBase64Url(bytes) !== value) invalid()
    return bytes
  } catch (error) {
    if (error instanceof ConfigurationError) throw error
    return invalid()
  }
}

async function sha256(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', arrayBuffer(bytes)))
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await sha256(bytes)
  try {
    return hex(digest)
  } finally {
    digest.fill(0)
  }
}

async function constantWorkBytesEqual(left: Uint8Array, right: Uint8Array): Promise<boolean> {
  const [leftDigest, rightDigest] = await Promise.all([sha256(left), sha256(right)])
  try {
    let difference = left.length ^ right.length
    for (let index = 0; index < leftDigest.length; index += 1) {
      difference |= leftDigest[index] ^ rightDigest[index]
    }
    return difference === 0
  } finally {
    leftDigest.fill(0)
    rightDigest.fill(0)
  }
}

export async function releaseRecoveryRpcCredentialMatches(
  provided: string,
  expected: string,
): Promise<boolean> {
  const providedBytes = encoder.encode(provided)
  const expectedBytes = encoder.encode(expected)
  try {
    return await constantWorkBytesEqual(providedBytes, expectedBytes)
  } finally {
    providedBytes.fill(0)
    expectedBytes.fill(0)
  }
}

function framedInput(domain: string, payload: Uint8Array): Uint8Array {
  const domainBytes = encoder.encode(`warpkeep-recovery-v1:${domain}:`)
  const result = new Uint8Array(4 + domainBytes.length + 8 + payload.length)
  const view = new DataView(result.buffer)
  view.setUint32(0, domainBytes.length, false)
  result.set(domainBytes, 4)
  view.setBigUint64(4 + domainBytes.length, BigInt(payload.length), false)
  result.set(payload, 12 + domainBytes.length)
  return result
}

async function hmacSha256Hex(keyBytes: Uint8Array, message: Uint8Array): Promise<string> {
  let key: CryptoKey
  try {
    key = await crypto.subtle.importKey(
      'raw',
      arrayBuffer(keyBytes),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    )
  } catch {
    return invalid()
  }
  const signature = new Uint8Array(await crypto.subtle.sign('HMAC', key, arrayBuffer(message)))
  try {
    return hex(signature)
  } finally {
    signature.fill(0)
  }
}

async function signingPublicJwkThumbprint(config: BridgeConfig): Promise<string> {
  const canonical = encoder.encode(JSON.stringify({
    crv: 'P-256',
    kty: 'EC',
    x: config.privateJwk.x,
    y: config.privateJwk.y,
  }))
  const digest = await sha256(canonical)
  try {
    return encodeBase64Url(digest)
  } finally {
    canonical.fill(0)
    digest.fill(0)
  }
}

function exactEnvString(env: WorkerEnv, name: keyof WorkerEnv): string {
  const value = env[name]
  if (typeof value !== 'string' || value.length === 0) invalid()
  return value
}

function parseVersionId(value: unknown): string {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) invalid()
  const descriptor = Object.getOwnPropertyDescriptor(value, 'id')
  if (
    descriptor === undefined
    || !('value' in descriptor)
    || typeof descriptor.value !== 'string'
    || !CANONICAL_UUID_PATTERN.test(descriptor.value)
  ) invalid()
  return descriptor.value
}

function parsePositiveEpoch(value: string): number {
  if (!CANONICAL_POSITIVE_DECIMAL_PATTERN.test(value)) invalid()
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed) || parsed <= 0 || String(parsed) !== value) invalid()
  return parsed
}

function serializeProjection(projection: ConfigProjection): Uint8Array {
  const record = projection as Readonly<Record<(typeof RELEASE_RECOVERY_BRIDGE_CONFIG_KEYS)[number], unknown>>
  return encoder.encode(`{${RELEASE_RECOVERY_BRIDGE_CONFIG_KEYS.map(
    key => `${JSON.stringify(key)}:${JSON.stringify(record[key])}`,
  ).join(',')}}`)
}

async function assertSecretSeparation(
  bridgeConfig: BridgeConfig,
  rpcWire: string,
  rpcBytes: Uint8Array,
  censusWire: string,
  censusBytes: Uint8Array,
): Promise<void> {
  const signingScalarBytes = decodeCanonical32ByteBase64Url(bridgeConfig.privateJwk.d)
  const localOpaqueSecrets = [
    bridgeConfig.adminTokenSecret,
    bridgeConfig.sessionCookieKey,
    ...(bridgeConfig.miniAppNotifications ? [bridgeConfig.miniAppNotifications.operatorSecret] : []),
  ]
  const localWireValues = [bridgeConfig.privateJwk.d, ...localOpaqueSecrets]
  const localSemanticBytes = [
    signingScalarBytes,
    ...localOpaqueSecrets.map(value => encoder.encode(value)),
  ]
  const rpcWireBytes = encoder.encode(rpcWire)
  const censusWireBytes = encoder.encode(censusWire)
  try {
    const checks: Array<Promise<boolean>> = [
      constantWorkBytesEqual(rpcWireBytes, censusWireBytes),
      constantWorkBytesEqual(rpcBytes, censusBytes),
    ]
    for (let index = 0; index < localWireValues.length; index += 1) {
      const localWireBytes = encoder.encode(localWireValues[index])
      checks.push(constantWorkBytesEqual(rpcWireBytes, localWireBytes))
      checks.push(constantWorkBytesEqual(censusWireBytes, localWireBytes))
      checks.push(constantWorkBytesEqual(rpcBytes, localSemanticBytes[index]))
      checks.push(constantWorkBytesEqual(censusBytes, localSemanticBytes[index]))
      localWireBytes.fill(0)
    }
    const collisions = await Promise.all(checks)
    if (collisions.some(Boolean)) invalid()
  } finally {
    signingScalarBytes.fill(0)
    rpcWireBytes.fill(0)
    censusWireBytes.fill(0)
    for (let index = 1; index < localSemanticBytes.length; index += 1) {
      localSemanticBytes[index].fill(0)
    }
  }
}

/**
 * Parse the recovery-only observer settings. Public routes never call this
 * function, so their existing configuration contract remains unchanged.
 */
async function parseReleaseRecoveryConfig(env: WorkerEnv): Promise<ReleaseRecoveryConfig> {
  const bridgeConfig = readBridgeConfig(env)
  const bridgeWorkerVersionId = parseVersionId(env.CF_VERSION_METADATA)
  const bridgeSourceCommit = exactEnvString(env, 'RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT')
  if (!SOURCE_COMMIT_PATTERN.test(bridgeSourceCommit)) invalid()
  const bridgeConfigEpoch = parsePositiveEpoch(
    exactEnvString(env, 'RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH'),
  )
  const genesis002Database = exactEnvString(env, 'GENESIS_002_SPACETIMEDB_DATABASE')
  const rpcCredential = exactEnvString(env, 'RELEASE_RECOVERY_RPC_SECRET')
  const censusPepper = exactEnvString(env, 'RELEASE_RECOVERY_CENSUS_PEPPER')

  if (
    env.SPACETIMEDB_URI !== RELEASE_RECOVERY_SPACETIME_ORIGIN
    || env.SPACETIMEDB_DATABASE !== PRODUCTION_SPACETIMEDB_DATABASE
    || env.OIDC_AUDIENCE !== RELEASE_RECOVERY_GENESIS_001_AUDIENCE
    || env.PTR_ENABLED !== 'true'
    || env.PTR_OIDC_AUDIENCE !== PTR_OIDC_AUDIENCE
    || bridgeConfig.spacetimeDbUri !== RELEASE_RECOVERY_SPACETIME_ORIGIN
    || bridgeConfig.spacetimeDbDatabase !== PRODUCTION_SPACETIMEDB_DATABASE
    || bridgeConfig.audience !== RELEASE_RECOVERY_GENESIS_001_AUDIENCE
    || bridgeConfig.ptrEnabled !== true
    || bridgeConfig.ptrSpacetimeDb?.audience !== PTR_OIDC_AUDIENCE
    || bridgeConfig.playerCanaryOwnerFid === undefined
    || !DATABASE_IDENTITY_PATTERN.test(genesis002Database)
  ) invalid()

  const ptrDatabase = bridgeConfig.ptrSpacetimeDb.database
  if (
    !DATABASE_IDENTITY_PATTERN.test(ptrDatabase)
    || genesis002Database === PRODUCTION_SPACETIMEDB_DATABASE
    || ptrDatabase === PRODUCTION_SPACETIMEDB_DATABASE
    || ptrDatabase === genesis002Database
  ) invalid()

  const rpcBytes = decodeCanonical32ByteBase64Url(rpcCredential)
  try {
    const censusPepperBytes = decodeCanonical32ByteBase64Url(censusPepper)
    let retainCensusPepper = false
    try {
      await assertSecretSeparation(
        bridgeConfig,
        rpcCredential,
        rpcBytes,
        censusPepper,
        censusPepperBytes,
      )

      const canaryPayload = encoder.encode(bridgeConfig.playerCanaryOwnerFid)
      const canaryFrame = framedInput(RELEASE_RECOVERY_CANARY_DOMAIN, canaryPayload)
      let canaryFidHmacSha256: string
      try {
        canaryFidHmacSha256 = await hmacSha256Hex(censusPepperBytes, canaryFrame)
      } finally {
        canaryPayload.fill(0)
        canaryFrame.fill(0)
      }

      const projection: ConfigProjection = {
        schemaVersion: 1,
        profile: RELEASE_RECOVERY_CONFIG_PROFILE,
        bridgeWorkerVersion: RELEASE_RECOVERY_BRIDGE_WORKER_VERSION,
        bridgeSourceCommit,
        bridgeConfigEpoch,
        spacetimeOrigin: RELEASE_RECOVERY_SPACETIME_ORIGIN,
        genesis001Database: PRODUCTION_SPACETIMEDB_DATABASE,
        genesis002Database,
        ptrDatabase,
        genesis001Audience: RELEASE_RECOVERY_GENESIS_001_AUDIENCE,
        genesis002Audience: GENESIS_002_OIDC_AUDIENCE,
        ptrAudience: PTR_OIDC_AUDIENCE,
        ptrEnabled: true,
        signingPublicJwkThumbprint: await signingPublicJwkThumbprint(bridgeConfig),
        rpcCredentialSha256: await sha256Hex(rpcBytes),
        censusPepperSha256: await sha256Hex(censusPepperBytes),
        canaryFidHmacSha256,
      }
      const projectionBytes = serializeProjection(projection)
      const identityFrame = framedInput(RELEASE_RECOVERY_CONFIG_DOMAIN, projectionBytes)
      let bridgeConfigIdentity: string
      try {
        bridgeConfigIdentity = await sha256Hex(identityFrame)
      } finally {
        projectionBytes.fill(0)
        identityFrame.fill(0)
      }

      const result = Object.freeze({
        bridgeConfig,
        bridgeService: RELEASE_RECOVERY_BRIDGE_SERVICE,
        bridgeWorkerVersion: RELEASE_RECOVERY_BRIDGE_WORKER_VERSION,
        bridgeWorkerVersionId,
        bridgeSourceCommit,
        bridgeConfigEpoch,
        bridgeConfigIdentity,
        spacetimeOrigin: RELEASE_RECOVERY_SPACETIME_ORIGIN,
        genesis001Database: PRODUCTION_SPACETIMEDB_DATABASE,
        genesis002Database,
        ptrDatabase,
        genesis001Audience: RELEASE_RECOVERY_GENESIS_001_AUDIENCE,
        genesis002Audience: GENESIS_002_OIDC_AUDIENCE,
        ptrAudience: PTR_OIDC_AUDIENCE,
        rpcCredential,
        censusPepperBytes,
        canaryFid: bridgeConfig.playerCanaryOwnerFid,
      })
      retainCensusPepper = true
      return result
    } finally {
      if (!retainCensusPepper) censusPepperBytes.fill(0)
    }
  } finally {
    rpcBytes.fill(0)
  }
}

export async function readReleaseRecoveryConfig(env: WorkerEnv): Promise<ReleaseRecoveryConfig> {
  try {
    return await parseReleaseRecoveryConfig(env)
  } catch {
    return invalid()
  }
}
