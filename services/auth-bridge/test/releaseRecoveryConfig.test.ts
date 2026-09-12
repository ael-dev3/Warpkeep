import { describe, expect, it, vi } from 'vitest'

import {
  ConfigurationError,
  PRODUCTION_SPACETIMEDB_DATABASE,
  readBridgeConfig,
} from '../src/config.js'
import {
  RELEASE_RECOVERY_BRIDGE_CONFIG_KEYS,
  readReleaseRecoveryConfig,
  releaseRecoveryRpcCredentialMatches,
} from '../src/releaseRecoveryConfig.js'
import type { WorkerEnv } from '../src/types.js'

const PRIVATE_JWK = Object.freeze({
  kty: 'EC',
  crv: 'P-256',
  x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
  y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA',
  d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o',
})

const RPC_CREDENTIAL = 'AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8'
const CENSUS_PEPPER = 'ICEiIyQlJicoKSorLC0uLzAxMjM0NTY3ODk6Ozw9Pj8'
const A_BYTES_SECRET = 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE'
const B_BYTES_SECRET = 'QkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkI'
const OTHER_RPC_CREDENTIAL = 'Q0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0NDQ0M'
const GENESIS_002_DATABASE = 'b'.repeat(64)
const PTR_DATABASE = 'd'.repeat(64)
const BRIDGE_SOURCE_COMMIT = 'e'.repeat(40)
const BRIDGE_VERSION_ID = '01234567-89ab-4cde-8f01-23456789abcd'

function bridgeEnv(overrides: Record<string, unknown> = {}): WorkerEnv {
  return {
    ISSUER: 'https://auth.warpkeep.com',
    ALLOWED_ORIGINS: 'https://warpkeep.com',
    FARCASTER_DOMAIN: 'warpkeep.com',
    FARCASTER_SIWE_URI: 'https://warpkeep.com/',
    FARCASTER_RPC_URL: 'https://optimism-rpc-one.example.com',
    FARCASTER_RPC_URL_SECONDARY: 'https://optimism-rpc-two.example.net',
    OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    OIDC_KEY_ID: 'test-es256-2026',
    SIGNING_KEY_JWK: JSON.stringify(PRIVATE_JWK),
    ADMIN_TOKEN_SECRET: `admin-${'a'.repeat(32)}`,
    SESSION_COOKIE_KEY: `session-${'b'.repeat(32)}`,
    PLAYER_CANARY_OWNER_FID: '12345',
    PTR_ENABLED: 'true',
    PTR_SPACETIMEDB_DATABASE: PTR_DATABASE,
    PTR_OIDC_AUDIENCE: 'warpkeep-ptr-spacetimedb',
    SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE,
    PUBLIC_AUTH_ENABLED: 'true',
    QA_OBSERVER_ENABLED: 'false',
    ENVIRONMENT: 'production',
    GENESIS_002_SPACETIMEDB_DATABASE: GENESIS_002_DATABASE,
    RELEASE_RECOVERY_RPC_SECRET: RPC_CREDENTIAL,
    RELEASE_RECOVERY_CENSUS_PEPPER: CENSUS_PEPPER,
    RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT: BRIDGE_SOURCE_COMMIT,
    RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: '7',
    CF_VERSION_METADATA: Object.freeze({
      id: BRIDGE_VERSION_ID,
      tag: 'ignored-version-tag',
      timestamp: '2026-09-03T00:00:00.000Z',
    }),
    ...overrides,
  } as WorkerEnv
}

function notificationSettings(secret: string): Record<string, unknown> {
  return {
    APPROVAL_NOTIFICATIONS_ENABLED: 'true',
    MINIAPP_NOTIFICATION_HUB_URLS:
      'https://rho.farcaster.xyz:3381/,https://hub.pinata.cloud/',
    MINIAPP_NOTIFICATION_CLIENTS:
      '9152=https://api.farcaster.xyz/v1/frame-notifications',
    NOTIFICATION_OPERATOR_SECRET: secret,
  }
}

describe('release-recovery-only bridge configuration', () => {
  it('parses the exact recovery coordinates and derives the pinned length-framed identity', async () => {
    const config = await readReleaseRecoveryConfig(bridgeEnv())

    expect(config).toMatchObject({
      bridgeService: 'warpkeep-auth-bridge',
      bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
      bridgeWorkerVersionId: BRIDGE_VERSION_ID,
      bridgeSourceCommit: BRIDGE_SOURCE_COMMIT,
      bridgeConfigEpoch: 7,
      bridgeConfigIdentity: '8b1826d4ef72a083c7c97c8b7de965d8a2e75eb9a2966ac0cb29b2563b12b490',
      spacetimeOrigin: 'https://maincloud.spacetimedb.com',
      genesis001Database: PRODUCTION_SPACETIMEDB_DATABASE,
      genesis002Database: GENESIS_002_DATABASE,
      ptrDatabase: PTR_DATABASE,
      genesis001Audience: 'warpkeep-spacetimedb',
      genesis002Audience: 'warpkeep-genesis-002-spacetimedb',
      ptrAudience: 'warpkeep-ptr-spacetimedb',
      rpcCredential: RPC_CREDENTIAL,
      canaryFid: '12345',
    })
    expect([...config.censusPepperBytes]).toEqual(Array.from({ length: 32 }, (_, index) => index + 32))
    expect(config.bridgeConfig.privateJwk).toMatchObject(PRIVATE_JWK)
    expect(Object.isFrozen(config)).toBe(true)
    expect(RELEASE_RECOVERY_BRIDGE_CONFIG_KEYS).toHaveLength(17)
    expect(config).not.toHaveProperty('signingPublicJwkThumbprint')
    expect(config).not.toHaveProperty('rpcCredentialSha256')
    expect(config).not.toHaveProperty('censusPepperSha256')
    expect(config).not.toHaveProperty('canaryFidHmacSha256')
  })

  it('leaves existing public config startup independent of recovery-only settings', async () => {
    const env = bridgeEnv({
      GENESIS_002_SPACETIMEDB_DATABASE: undefined,
      RELEASE_RECOVERY_RPC_SECRET: undefined,
      RELEASE_RECOVERY_CENSUS_PEPPER: undefined,
      RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT: undefined,
      RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: undefined,
      CF_VERSION_METADATA: undefined,
    })

    expect(() => readBridgeConfig(env)).not.toThrow()
    await expect(readReleaseRecoveryConfig(env)).rejects.toBeInstanceOf(ConfigurationError)
  })

  it.each([
    ['missing Version Metadata', { CF_VERSION_METADATA: undefined }],
    ['string Version Metadata', { CF_VERSION_METADATA: BRIDGE_VERSION_ID }],
    ['missing Version Metadata id', { CF_VERSION_METADATA: {} }],
    ['uppercase Version Metadata id', { CF_VERSION_METADATA: { id: BRIDGE_VERSION_ID.toUpperCase() } }],
    ['unhyphenated Version Metadata id', { CF_VERSION_METADATA: { id: BRIDGE_VERSION_ID.replaceAll('-', '') } }],
    ['invalid Version Metadata version nibble', { CF_VERSION_METADATA: { id: '01234567-89ab-0cde-8f01-23456789abcd' } }],
    ['invalid Version Metadata variant nibble', { CF_VERSION_METADATA: { id: '01234567-89ab-4cde-7f01-23456789abcd' } }],
    ['PTR disabled', { PTR_ENABLED: 'false' }],
    ['PTR gate absent', { PTR_ENABLED: undefined }],
    ['wrong Maincloud origin', { SPACETIMEDB_URI: 'https://example.com' }],
    ['wrong G001 audience', { OIDC_AUDIENCE: 'warpkeep-other-spacetimedb' }],
    ['wrong PTR audience', { PTR_OIDC_AUDIENCE: 'warpkeep-ptr-other' }],
    ['missing G002 identity', { GENESIS_002_SPACETIMEDB_DATABASE: undefined }],
    ['noncanonical G002 identity', { GENESIS_002_SPACETIMEDB_DATABASE: 'B'.repeat(64) }],
    ['G002 reuses G001 identity', { GENESIS_002_SPACETIMEDB_DATABASE: PRODUCTION_SPACETIMEDB_DATABASE }],
    ['PTR reuses G002 identity', { PTR_SPACETIMEDB_DATABASE: GENESIS_002_DATABASE }],
    ['missing source commit', { RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT: undefined }],
    ['noncanonical source commit', { RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT: ` ${BRIDGE_SOURCE_COMMIT}` }],
    ['zero config epoch', { RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: '0' }],
    ['noncanonical config epoch', { RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: '07' }],
    ['unsafe config epoch', { RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: '9007199254740992' }],
    ['padded RPC credential', { RELEASE_RECOVERY_RPC_SECRET: `${RPC_CREDENTIAL}=` }],
    ['short RPC credential', { RELEASE_RECOVERY_RPC_SECRET: 'AA' }],
    ['padded census pepper', { RELEASE_RECOVERY_CENSUS_PEPPER: `${CENSUS_PEPPER}=` }],
    ['short census pepper', { RELEASE_RECOVERY_CENSUS_PEPPER: 'AA' }],
  ])('rejects %s', async (_label, overrides) => {
    await expect(readReleaseRecoveryConfig(bridgeEnv(overrides))).rejects.toThrowError(
      'Bridge configuration is incomplete or invalid.',
    )
  })

  it.each([
    ['RPC and census bytes', { RELEASE_RECOVERY_CENSUS_PEPPER: RPC_CREDENTIAL }],
    ['RPC and signing scalar', { RELEASE_RECOVERY_RPC_SECRET: PRIVATE_JWK.d }],
    ['census and signing scalar', { RELEASE_RECOVERY_CENSUS_PEPPER: PRIVATE_JWK.d }],
    ['RPC wire and admin wire', { ADMIN_TOKEN_SECRET: RPC_CREDENTIAL }],
    ['census wire and admin wire', { ADMIN_TOKEN_SECRET: CENSUS_PEPPER }],
    ['RPC bytes and admin UTF-8', { RELEASE_RECOVERY_RPC_SECRET: A_BYTES_SECRET, ADMIN_TOKEN_SECRET: 'A'.repeat(32) }],
    ['census bytes and admin UTF-8', { RELEASE_RECOVERY_CENSUS_PEPPER: B_BYTES_SECRET, ADMIN_TOKEN_SECRET: 'B'.repeat(32) }],
    ['RPC wire and session wire', { SESSION_COOKIE_KEY: RPC_CREDENTIAL }],
    ['census wire and session wire', { SESSION_COOKIE_KEY: CENSUS_PEPPER }],
    ['RPC bytes and session UTF-8', { RELEASE_RECOVERY_RPC_SECRET: A_BYTES_SECRET, SESSION_COOKIE_KEY: 'A'.repeat(32) }],
    ['census bytes and session UTF-8', { RELEASE_RECOVERY_CENSUS_PEPPER: B_BYTES_SECRET, SESSION_COOKIE_KEY: 'B'.repeat(32) }],
    ['RPC wire and notification wire', {
      ...notificationSettings(RPC_CREDENTIAL),
    }],
    ['census wire and notification wire', {
      ...notificationSettings(CENSUS_PEPPER),
    }],
    ['RPC bytes and notification UTF-8', {
      RELEASE_RECOVERY_RPC_SECRET: A_BYTES_SECRET,
      ...notificationSettings('A'.repeat(32)),
    }],
    ['census bytes and notification UTF-8', {
      RELEASE_RECOVERY_CENSUS_PEPPER: B_BYTES_SECRET,
      ...notificationSettings('B'.repeat(32)),
    }],
  ])('rejects the %s collision', async (_label, overrides) => {
    await expect(readReleaseRecoveryConfig(bridgeEnv(overrides))).rejects.toBeInstanceOf(ConfigurationError)
  })

  it('uses two real SHA-256 operations for both matching and different RPC wire values', async () => {
    const digest = vi.spyOn(crypto.subtle, 'digest')
    try {
      await expect(releaseRecoveryRpcCredentialMatches(RPC_CREDENTIAL, RPC_CREDENTIAL)).resolves.toBe(true)
      expect(digest).toHaveBeenCalledTimes(2)
      digest.mockClear()

      await expect(releaseRecoveryRpcCredentialMatches(OTHER_RPC_CREDENTIAL, RPC_CREDENTIAL)).resolves.toBe(false)
      expect(digest).toHaveBeenCalledTimes(2)
    } finally {
      digest.mockRestore()
    }
  })

  it('remaps hostile Version Metadata inspection failures to the generic config error', async () => {
    const secretDetail = 'do-not-disclose-version-binding-detail'
    const hostileMetadata = new Proxy({}, {
      getOwnPropertyDescriptor() {
        throw new Error(secretDetail)
      },
    })

    let failure: unknown
    try {
      await readReleaseRecoveryConfig(bridgeEnv({ CF_VERSION_METADATA: hostileMetadata }))
    } catch (error) {
      failure = error
    }
    expect(failure).toBeInstanceOf(ConfigurationError)
    expect(String(failure)).not.toContain(secretDetail)
  })

  it('changes the computed identity for each mutable identity input but not for Version Metadata', async () => {
    const baseline = await readReleaseRecoveryConfig(bridgeEnv())
    const alternatePair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const alternatePrivateJwk = await crypto.subtle.exportKey('jwk', alternatePair.privateKey)
    const mutations: ReadonlyArray<readonly [string, Record<string, unknown>]> = [
      ['signing public JWK', { SIGNING_KEY_JWK: JSON.stringify(alternatePrivateJwk) }],
      ['bridge source commit', { RELEASE_RECOVERY_BRIDGE_SOURCE_COMMIT: 'f'.repeat(40) }],
      ['bridge config epoch', { RELEASE_RECOVERY_BRIDGE_CONFIG_EPOCH: '8' }],
      ['G002 identity', { GENESIS_002_SPACETIMEDB_DATABASE: '8'.repeat(64) }],
      ['PTR identity', { PTR_SPACETIMEDB_DATABASE: '9'.repeat(64) }],
      ['RPC bytes', { RELEASE_RECOVERY_RPC_SECRET: OTHER_RPC_CREDENTIAL }],
      ['census bytes', { RELEASE_RECOVERY_CENSUS_PEPPER: A_BYTES_SECRET }],
      ['canary FID', { PLAYER_CANARY_OWNER_FID: '12346' }],
    ]

    for (const [label, overrides] of mutations) {
      const mutated = await readReleaseRecoveryConfig(bridgeEnv(overrides))
      expect(mutated.bridgeConfigIdentity, label).not.toBe(baseline.bridgeConfigIdentity)
    }

    const newDeployment = await readReleaseRecoveryConfig(bridgeEnv({
      CF_VERSION_METADATA: { id: '11111111-2222-3333-8444-555555555555' },
    }))
    expect(newDeployment.bridgeWorkerVersionId).not.toBe(baseline.bridgeWorkerVersionId)
    expect(newDeployment.bridgeConfigIdentity).toBe(baseline.bridgeConfigIdentity)
  })

  it('never accepts a deploy-supplied assertion for the computed config identity', async () => {
    const asserted = await readReleaseRecoveryConfig(bridgeEnv({
      RELEASE_RECOVERY_BRIDGE_CONFIG_IDENTITY: '0'.repeat(64),
    }))

    expect(asserted.bridgeConfigIdentity).toBe(
      '8b1826d4ef72a083c7c97c8b7de965d8a2e75eb9a2966ac0cb29b2563b12b490',
    )
  })
})
