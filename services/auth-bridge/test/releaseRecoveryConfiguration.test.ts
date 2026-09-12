import * as recoveryConfigModule from '../src/releaseRecoveryConfig.js'
import { describe, expect, it, vi } from 'vitest'

import { ConfigurationError, PRODUCTION_SPACETIMEDB_DATABASE, readBridgeConfig } from '../src/config.js'
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

import { observeReleaseRecoveryConfiguration } from '../src/releaseRecoveryConfiguration.js'
const request = {
  schemaVersion: 1,
  profile: 'warpkeep-release-recovery-configuration-request-v1',
  rpcCredential: RPC_CREDENTIAL,
  requestId: '123e4567-e89b-42d3-a456-426614174000',
  preparationCommit: 'c'.repeat(40),
  recoveryAuthorizationEpoch: 3,
}
describe('private preparation config-only observation', () => {
  it('derives exact deployed config and version through actual parser without realm requests', async () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      const expected = await readReleaseRecoveryConfig(bridgeEnv())
      try {
        const observed = await observeReleaseRecoveryConfiguration(bridgeEnv(), request)
        expect(observed).toMatchObject({
          profile: 'warpkeep-release-recovery-configuration-v1',
          requestId: request.requestId,
          preparationCommit: request.preparationCommit,
          bridgeConfigIdentity: expected.bridgeConfigIdentity,
          bridgeConfigEpoch: 7,
          bridgeSourceCommit: BRIDGE_SOURCE_COMMIT,
          bridgeWorkerVersionId: BRIDGE_VERSION_ID,
        })
        expect(Object.keys(observed)).not.toContain('rpcCredential')
        expect(Object.keys(observed)).not.toContain('g001')
        expect(fetch).not.toHaveBeenCalled()
      } finally {
        expected.censusPepperBytes.fill(0)
      }
    } finally {
      vi.unstubAllGlobals()
    }
  })
  it('rejects wrong credential and malformed ownership before returning coordinates', async () => {
    await expect(
      observeReleaseRecoveryConfiguration(bridgeEnv(), { ...request, rpcCredential: OTHER_RPC_CREDENTIAL }),
    ).rejects.toThrow('RELEASE_RECOVERY_CONFIGURATION_FAILED')
    await expect(
      observeReleaseRecoveryConfiguration(bridgeEnv(), { ...request, recoveryAuthorizationEpoch: 0 }),
    ).rejects.toThrow()
    await expect(
      observeReleaseRecoveryConfiguration(bridgeEnv({ CF_VERSION_METADATA: undefined }), request),
    ).rejects.toThrow()
  })
  it('clears retained secret bytes on success, rejection and late config completion', async () => {
    const actualRead = recoveryConfigModule.readReleaseRecoveryConfig
    for (const wrong of [false, true]) {
      const config = await actualRead(bridgeEnv())
      const spy = vi.spyOn(recoveryConfigModule, 'readReleaseRecoveryConfig').mockResolvedValue(config)
      try {
        const outcome = observeReleaseRecoveryConfiguration(
          bridgeEnv(),
          wrong ? { ...request, rpcCredential: OTHER_RPC_CREDENTIAL } : request,
        )
        if (wrong) await expect(outcome).rejects.toThrow()
        else await outcome
        expect(config.censusPepperBytes.every((byte) => byte === 0)).toBe(true)
      } finally {
        spy.mockRestore()
      }
    }
    const late = await actualRead(bridgeEnv())
    let release!: (value: typeof late) => void
    const spy = vi.spyOn(recoveryConfigModule, 'readReleaseRecoveryConfig').mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve
        }),
    )
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const outcome = observeReleaseRecoveryConfiguration(bridgeEnv(), request)
      const rejected = expect(outcome).rejects.toThrow('RELEASE_RECOVERY_CONFIGURATION_FAILED')
      await vi.advanceTimersByTimeAsync(30000)
      await rejected
      release(late)
      await Promise.resolve()
      await Promise.resolve()
      expect(late.censusPepperBytes.every((byte) => byte === 0)).toBe(true)
    } finally {
      vi.useRealTimers()
      spy.mockRestore()
    }
  })
})
