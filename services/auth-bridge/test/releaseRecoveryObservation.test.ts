import { describe, expect, it, vi } from 'vitest'

import {
  observeReleaseRecoveryState,
  ReleaseRecoveryObservationError,
  type ReleaseRecoveryObservationDependencies,
  type ReleaseRecoveryRequestContext,
} from '../src/releaseRecoveryObservation'
import type { ReleaseRecoveryConfig } from '../src/releaseRecoveryConfig'
import type { SpacetimeReleaseRecoveryResolution } from '../src/spacetimeReleaseRecoveryResolver'
import type { WorkerEnv } from '../src/types'

const RPC_CREDENTIAL = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
const REQUEST_ID = '123e4567-e89b-42d3-a456-426614174000'
const CANDIDATE_COMMIT = 'a'.repeat(40)
const G001_DATABASE = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e'
const G002_DATABASE = '1'.repeat(64)
const PTR_DATABASE = '2'.repeat(64)

const DIGESTS = Object.freeze({
  programIdentityBeforeTranscriptHmacSha256: '1'.repeat(64),
  g001PolicyResponseHmacSha256: '2'.repeat(64),
  g001AlphaBeforeResponseHmacSha256: '3'.repeat(64),
  g001PlayerEnumerationBeforeResponseHmacSha256: '4'.repeat(64),
  g001AdmissionStatusesResponseHmacSha256: '5'.repeat(64),
  g001PlayerEnumerationAfterResponseHmacSha256: '6'.repeat(64),
  g001AlphaAfterResponseHmacSha256: '7'.repeat(64),
  g002StatusResponseHmacSha256: '8'.repeat(64),
  ptrAdminStatusResponseHmacSha256: '9'.repeat(64),
  ptrOwnerStatusResponseHmacSha256: 'a'.repeat(64),
  programIdentityAfterTranscriptHmacSha256: 'b'.repeat(64),
})

const G001 = Object.freeze({
  databaseIdentity: G001_DATABASE,
  programKeccak256: 'c'.repeat(64),
  realmId: 'GENESIS_001' as const,
  releaseVersion: '0.3.43' as const,
  playerAccessEnabled: true as const,
  admissionStateMutationsEnabled: false as const,
  accessRequestSubmissionsEnabled: false as const,
  sourceBaselineCommit: '2ae51984e1fa6ce5b0028c1a250359fed79d819b' as const,
  freezeReleaseNonce: '3f158f17acd5e1e63c74befef7cb3ccab7cb07feaaed432e7483467e1c856f00' as const,
  admittedPlayerCount: 1,
  enabledPlayerCount: 1,
  censusStable: true as const,
  admittedPlayerCensusHmacSha256: 'd'.repeat(64),
  alphaInvariantHmacSha256: 'e'.repeat(64),
})

const G002 = Object.freeze({
  databaseIdentity: G002_DATABASE,
  programKeccak256: 'f'.repeat(64),
  realmId: 'GENESIS_002' as const,
  databaseName: 'warpkeep-genesis-002' as const,
  moduleIdentity: 'warpkeep-genesis-002-sealed-v1' as const,
  releaseVersion: '0.4.0' as const,
  launchState: 'sealed' as const,
  admissionsOpen: false as const,
  accessRequestsOpen: false as const,
  sealed: true as const,
  atlasReady: true as const,
  playerCount: 0,
  generalAdmissionCount: 0,
  populationGuardPassed: true as const,
  atlasId: 'GENESIS_002_GREATER_REALM',
  publicReleaseId: 'GRR-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  publicApprovalReceiptId: 'GRA-ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  atlasSourceCommit: 'b'.repeat(40),
  expectedReleaseSha256: '1'.repeat(64),
  releaseHeaderSha256: '2'.repeat(64),
  verificationDigest: '3'.repeat(64),
  sealedStateHmacSha256: '4'.repeat(64),
})

const PTR = Object.freeze({
  databaseIdentity: PTR_DATABASE,
  programKeccak256: '5'.repeat(64),
  realmId: 'PTR' as const,
  releaseVersion: '0.4.0-ptr.1' as const,
  moduleIdentity: 'warpkeep-ptr-owner-view-v1' as const,
  launchState: 'owner-only' as const,
  admissionsOpen: false as const,
  accessRequestsOpen: false as const,
  sealed: true as const,
  atlasReady: true as const,
  populationGuardPassed: true as const,
  singletonOwnerCount: 1,
  ownerEnabled: true as const,
  generalAdmissionCount: 0,
  atlasId: 'PTR_GREATER_REALM',
  publicReleaseId: 'GRR-BCDEFGHIJKLMNOPQRSTUVWXYZA',
  publicApprovalReceiptId: 'GRA-BCDEFGHIJKLMNOPQRSTUVWXYZA',
  atlasSourceCommit: 'c'.repeat(40),
  expectedReleaseSha256: '6'.repeat(64),
  releaseHeaderSha256: '7'.repeat(64),
  verificationDigest: '8'.repeat(64),
  sealedStateHmacSha256: '9'.repeat(64),
  ownerInvariantHmacSha256: 'a'.repeat(64),
})

const RESOLUTION = Object.freeze({
  observedFrom: 1_700_000_000,
  observedThrough: 1_700_000_001,
  g001: G001,
  g002: G002,
  ptr: PTR,
  upstreamResponseDigests: DIGESTS,
}) satisfies SpacetimeReleaseRecoveryResolution

const CONFIG = Object.freeze({
  bridgeConfig: Object.freeze({}),
  bridgeService: 'warpkeep-auth-bridge',
  bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
  bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd',
  bridgeSourceCommit: 'd'.repeat(40),
  bridgeConfigEpoch: 11,
  bridgeConfigIdentity: 'e'.repeat(64),
  spacetimeOrigin: 'https://maincloud.spacetimedb.com',
  genesis001Database: G001_DATABASE,
  genesis002Database: G002_DATABASE,
  ptrDatabase: PTR_DATABASE,
  genesis001Audience: 'warpkeep-spacetimedb',
  genesis002Audience: 'warpkeep-genesis-002-spacetimedb',
  ptrAudience: 'warpkeep-ptr-spacetimedb',
  rpcCredential: RPC_CREDENTIAL,
  censusPepperBytes: new Uint8Array(32),
  canaryFid: '12345',
}) as unknown as ReleaseRecoveryConfig

const REQUEST = Object.freeze({
  schemaVersion: 1 as const,
  profile: 'warpkeep-release-recovery-realm-observation-request-v1' as const,
  rpcCredential: RPC_CREDENTIAL,
  requestId: REQUEST_ID,
  candidateCommit: CANDIDATE_COMMIT,
  recoveryAuthorizationEpoch: 7,
})

function dependencies(
  resolution: unknown = RESOLUTION,
): ReleaseRecoveryObservationDependencies {
  return {
    readConfig: vi.fn(async () => CONFIG),
    rpcCredentialMatches: vi.fn(async () => true),
    createResolver: vi.fn(() => ({
      resolve: async () => resolution as SpacetimeReleaseRecoveryResolution,
    })),
  }
}

async function observationFailure(
  operation: Promise<unknown>,
  forbiddenDetail?: string,
): Promise<ReleaseRecoveryObservationError> {
  let caught: unknown
  try {
    await operation
  } catch (error) {
    caught = error
  }
  expect(caught).toBeInstanceOf(ReleaseRecoveryObservationError)
  expect(caught).toMatchObject({
    name: 'ReleaseRecoveryObservationError',
    message: 'RELEASE_RECOVERY_OBSERVATION_FAILED',
  })
  expect(Object.hasOwn(caught as object, 'stack')).toBe(false)
  expect(Object.hasOwn(caught as object, 'cause')).toBe(false)
  if (forbiddenDetail !== undefined) {
    expect(JSON.stringify(caught)).not.toContain(forbiddenDetail)
  }
  return caught as ReleaseRecoveryObservationError
}

describe('release recovery realm observation boundary', () => {
  it('returns only exact immutable correlation, bridge, realm, and response-digest evidence', async () => {
    const result = await observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      dependencies(),
    )

    expect(result).toEqual({
      schemaVersion: 1,
      profile: 'warpkeep-release-recovery-realm-observation-v1',
      requestId: REQUEST_ID,
      candidateCommit: CANDIDATE_COMMIT,
      recoveryAuthorizationEpoch: 7,
      observedFrom: 1_700_000_000,
      observedThrough: 1_700_000_001,
      bridgeService: 'warpkeep-auth-bridge',
      bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v1',
      bridgeWorkerVersionId: '01234567-89ab-4cde-8f01-23456789abcd',
      bridgeSourceCommit: 'd'.repeat(40),
      bridgeConfigIdentity: 'e'.repeat(64),
      bridgeConfigEpoch: 11,
      publicAdmissionRequestsOpen: false,
      g001: G001,
      g002: G002,
      ptr: PTR,
      upstreamResponseDigests: DIGESTS,
    })
    expect(Object.isFrozen(result)).toBe(true)
    expect(Object.isFrozen(result.g001)).toBe(true)
    expect(Object.isFrozen(result.g002)).toBe(true)
    expect(Object.isFrozen(result.ptr)).toBe(true)
    expect(Object.isFrozen(result.upstreamResponseDigests)).toBe(true)
    expect(Object.keys(result)).toEqual([
      'schemaVersion', 'profile', 'requestId', 'candidateCommit',
      'recoveryAuthorizationEpoch', 'observedFrom', 'observedThrough',
      'bridgeService', 'bridgeWorkerVersion', 'bridgeWorkerVersionId',
      'bridgeSourceCommit', 'bridgeConfigIdentity', 'bridgeConfigEpoch',
      'publicAdmissionRequestsOpen', 'g001', 'g002', 'ptr',
      'upstreamResponseDigests',
    ])
    expect(Object.keys(result.g001)).toEqual(Object.keys(G001))
    expect(Object.keys(result.g002)).toEqual(Object.keys(G002))
    expect(Object.keys(result.ptr)).toEqual(Object.keys(PTR))
    expect(Object.keys(result.upstreamResponseDigests)).toEqual(Object.keys(DIGESTS))
    expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThanOrEqual(64 * 1024)
    expect(JSON.stringify(result)).not.toMatch(/rpcCredential|censusPepper|canaryFid|ownerFid|authEpoch|sessionExpiresAt|token|raw/i)
  })

  it('rejects every mutated request scalar before recovery configuration is read', async () => {
    const mutations: readonly Readonly<Record<string, unknown>>[] = [
      { ...REQUEST, schemaVersion: 2 },
      { ...REQUEST, profile: 'warpkeep-release-recovery-realm-observation-request-v2' },
      { ...REQUEST, rpcCredential: 'A'.repeat(42) },
      { ...REQUEST, requestId: '123E4567-e89b-42d3-a456-426614174000' },
      { ...REQUEST, candidateCommit: 'A'.repeat(40) },
      { ...REQUEST, recoveryAuthorizationEpoch: 0 },
      { ...REQUEST, recoveryAuthorizationEpoch: 1.5 },
      { ...REQUEST, recoveryAuthorizationEpoch: Number.MAX_SAFE_INTEGER + 1 },
    ]

    for (const request of mutations) {
      const readConfig = vi.fn(async () => CONFIG)
      const operation = observeReleaseRecoveryState(
        {} as WorkerEnv,
        request as never,
        { ...dependencies(), readConfig },
      )
      const failure = observationFailure(operation)
      expect(readConfig).not.toHaveBeenCalled()
      await failure
    }
  })

  it('rejects missing, extra, symbol, accessor, nonenumerable, and exotic request structure without reading it', async () => {
    let accessorReads = 0
    const accessor = { ...REQUEST }
    Object.defineProperty(accessor, 'rpcCredential', {
      enumerable: true,
      get() {
        accessorReads += 1
        return RPC_CREDENTIAL
      },
    })
    const withSymbol = { ...REQUEST, [Symbol('private')]: 'secret' }
    const nonenumerable = { ...REQUEST }
    Object.defineProperty(nonenumerable, 'private', { value: 'secret', enumerable: false })
    const inherited = Object.assign(Object.create({ inherited: 'secret' }), REQUEST)
    const missing = { ...REQUEST } as Record<string, unknown>
    delete missing.candidateCommit
    const invalid: readonly unknown[] = [
      null,
      [],
      missing,
      { ...REQUEST, databaseIdentity: G001_DATABASE },
      withSymbol,
      accessor,
      nonenumerable,
      inherited,
    ]

    for (const request of invalid) {
      const readConfig = vi.fn(async () => CONFIG)
      const operation = observeReleaseRecoveryState(
        {} as WorkerEnv,
        request as never,
        { ...dependencies(), readConfig },
      )
      const failure = observationFailure(operation)
      expect(readConfig).not.toHaveBeenCalled()
      await failure
    }
    expect(accessorReads).toBe(0)
  })

  it('authenticates before resolver construction and returns a fresh detail-free failure', async () => {
    const pepper = new Uint8Array(32).fill(0x5a)
    const config = Object.freeze({ ...CONFIG, censusPepperBytes: pepper }) as ReleaseRecoveryConfig
    const createResolver = vi.fn(() => ({ resolve: async () => RESOLUTION }))
    const deps: ReleaseRecoveryObservationDependencies = {
      readConfig: async () => config,
      rpcCredentialMatches: async () => false,
      createResolver,
    }

    const first = await observationFailure(
      observeReleaseRecoveryState({} as WorkerEnv, REQUEST, deps),
      RPC_CREDENTIAL,
    )
    const second = await observationFailure(
      observeReleaseRecoveryState({} as WorkerEnv, REQUEST, {
        ...deps,
        readConfig: async () => Object.freeze({
          ...CONFIG,
          censusPepperBytes: new Uint8Array(32).fill(0x5a),
        }) as ReleaseRecoveryConfig,
      }),
      RPC_CREDENTIAL,
    )

    expect(first).not.toBe(second)
    expect(createResolver).not.toHaveBeenCalled()
    expect([...pepper]).toEqual(new Array<number>(32).fill(0))
  })

  it('sanitizes config, comparator, resolver-construction, and resolver failures and clears pepper bytes', async () => {
    const sensitive = 'https://private.example/?token=secret-owner-fid-12345'
    const cases: readonly Readonly<{
      dependencies: (pepper: Uint8Array) => ReleaseRecoveryObservationDependencies
      hasConfig: boolean
    }>[] = [
      {
        dependencies: () => ({ readConfig: async () => { throw new Error(sensitive) } }),
        hasConfig: false,
      },
      {
        dependencies: pepper => ({
          readConfig: async () => Object.freeze({ ...CONFIG, censusPepperBytes: pepper }) as ReleaseRecoveryConfig,
          rpcCredentialMatches: async () => { throw new Error(sensitive) },
        }),
        hasConfig: true,
      },
      {
        dependencies: pepper => ({
          readConfig: async () => Object.freeze({ ...CONFIG, censusPepperBytes: pepper }) as ReleaseRecoveryConfig,
          rpcCredentialMatches: async () => true,
          createResolver: () => { throw new Error(sensitive) },
        }),
        hasConfig: true,
      },
      {
        dependencies: pepper => ({
          readConfig: async () => Object.freeze({ ...CONFIG, censusPepperBytes: pepper }) as ReleaseRecoveryConfig,
          rpcCredentialMatches: async () => true,
          createResolver: () => ({ resolve: async () => { throw new Error(sensitive) } }),
        }),
        hasConfig: true,
      },
    ]

    for (const fixture of cases) {
      const pepper = new Uint8Array(32).fill(0xa5)
      await observationFailure(
        observeReleaseRecoveryState(
          {} as WorkerEnv,
          REQUEST,
          fixture.dependencies(pepper),
        ),
        sensitive,
      )
      expect([...pepper]).toEqual(new Array<number>(32).fill(fixture.hasConfig ? 0 : 0xa5))
    }
  })

  it('rejects substituted timestamps, databases, nested fields, digests, and resolver correlation', async () => {
    const mutations: readonly ((resolution: Record<string, unknown>) => void)[] = [
      resolution => { resolution.requestId = '123e4567-e89b-42d3-a456-426614174099' },
      resolution => { resolution.observedFrom = -1 },
      resolution => { resolution.observedThrough = 1_700_000_076 },
      resolution => { (resolution.g001 as Record<string, unknown>).databaseIdentity = G002_DATABASE },
      resolution => { (resolution.g001 as Record<string, unknown>).ownerFid = '12345' },
      resolution => { (resolution.g001 as Record<string, unknown>).enabledPlayerCount = 0 },
      resolution => { (resolution.g002 as Record<string, unknown>).databaseIdentity = PTR_DATABASE },
      resolution => { (resolution.g002 as Record<string, unknown>).sealed = false },
      resolution => { (resolution.ptr as Record<string, unknown>).databaseIdentity = G002_DATABASE },
      resolution => { (resolution.ptr as Record<string, unknown>).sessionExpiresAt = '1700000000' },
      resolution => { (resolution.ptr as Record<string, unknown>).ownerEnabled = false },
      resolution => {
        (resolution.upstreamResponseDigests as Record<string, unknown>)
          .g001PolicyResponseHmacSha256 = 'A'.repeat(64)
      },
    ]

    for (const mutate of mutations) {
      const resolution = structuredClone(RESOLUTION) as unknown as Record<string, unknown>
      mutate(resolution)
      await observationFailure(observeReleaseRecoveryState(
        {} as WorkerEnv,
        REQUEST,
        dependencies(resolution),
      ))
    }
  })

  it('rejects substituted bridge metadata and configuration identity', async () => {
    const mutations: readonly Partial<ReleaseRecoveryConfig>[] = [
      { bridgeService: 'other-service' as never },
      { bridgeWorkerVersion: 'warpkeep-auth-bridge-release-recovery-v2' as never },
      { bridgeWorkerVersionId: 'not-a-uuid' },
      { bridgeSourceCommit: 'A'.repeat(40) },
      { bridgeConfigIdentity: 'A'.repeat(64) },
      { bridgeConfigEpoch: 0 },
      { genesis001Database: G002_DATABASE },
    ]

    for (const mutation of mutations) {
      const config = Object.freeze({
        ...CONFIG,
        ...mutation,
        censusPepperBytes: new Uint8Array(32),
      }) as ReleaseRecoveryConfig
      await observationFailure(observeReleaseRecoveryState(
        {} as WorkerEnv,
        REQUEST,
        {
          readConfig: async () => config,
          rpcCredentialMatches: async () => true,
          createResolver: () => ({ resolve: async () => RESOLUTION }),
        },
      ))
    }
  })

  it('rejects a resolver result that could canonicalize beyond the 64 KiB RPC response cap', async () => {
    const oversized = structuredClone(RESOLUTION) as unknown as Record<string, unknown>
    ;(oversized.g002 as Record<string, unknown>).atlasId = 'X'.repeat(65 * 1024)

    await observationFailure(observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      dependencies(oversized),
    ))
  })

  it('creates one 75-second context before the first await, injects it, and cancels it', async () => {
    const events: string[] = []
    const controller = new AbortController()
    const cancel = vi.fn(() => events.push('cancel'))
    let context: ReleaseRecoveryRequestContext | undefined
    const operation = observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      {
        clockMilliseconds: () => {
          events.push('clock')
          return 1_000
        },
        timerFactory: milliseconds => {
          events.push(`timer:${milliseconds}`)
          return { signal: controller.signal, fired: () => false, cancel }
        },
        readConfig: async () => {
          events.push('config')
          return Object.freeze({
            ...CONFIG,
            censusPepperBytes: new Uint8Array(32).fill(0x5a),
          }) as ReleaseRecoveryConfig
        },
        rpcCredentialMatches: async () => {
          events.push('credential')
          return true
        },
        createResolver: (_config, requestContext) => {
          events.push('resolver')
          context = requestContext
          return { resolve: async () => RESOLUTION }
        },
      },
    )

    expect(events.slice(0, 3)).toEqual(['clock', 'timer:75000', 'config'])
    await expect(operation).resolves.toBeDefined()
    expect(context).toMatchObject({
      signal: controller.signal,
      deadlineMilliseconds: 76_000,
    })
    expect(cancel).toHaveBeenCalledOnce()
    expect(events.at(-1)).toBe('cancel')
    expect(context?.clockMilliseconds()).toBe(1_000)
    expect(context?.fired()).toBe(false)
  })

  it('rejects an I/O-updated deadline after config and timer firing after credential', async () => {
    let now = 1_000
    const credential = vi.fn(async () => true)
    const resolver = vi.fn(() => ({ resolve: async () => RESOLUTION }))
    await observationFailure(observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      {
        clockMilliseconds: () => now,
        timerFactory: () => ({
          signal: new AbortController().signal,
          fired: () => false,
          cancel: () => undefined,
        }),
        readConfig: async () => {
          now = 76_001
          return Object.freeze({
            ...CONFIG,
            censusPepperBytes: new Uint8Array(32),
          }) as ReleaseRecoveryConfig
        },
        rpcCredentialMatches: credential,
        createResolver: resolver,
      },
    ))
    expect(credential).not.toHaveBeenCalled()
    expect(resolver).not.toHaveBeenCalled()

    let fired = false
    const resolverAfterCredential = vi.fn(() => ({ resolve: async () => RESOLUTION }))
    await observationFailure(observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      {
        clockMilliseconds: () => 1_000,
        timerFactory: () => ({
          signal: new AbortController().signal,
          fired: () => fired,
          cancel: () => undefined,
        }),
        readConfig: async () => Object.freeze({
          ...CONFIG,
          censusPepperBytes: new Uint8Array(32),
        }) as ReleaseRecoveryConfig,
        rpcCredentialMatches: async () => {
          fired = true
          return true
        },
        createResolver: resolverAfterCredential,
      },
    ))
    expect(resolverAfterCredential).not.toHaveBeenCalled()
  })

  it('races stalled configuration parsing against the overall abort signal', async () => {
    const controller = new AbortController()
    let didFire = false
    const cancel = vi.fn()
    const operation = observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      {
        clockMilliseconds: () => 1_000,
        timerFactory: () => ({
          signal: controller.signal,
          fired: () => didFire,
          cancel,
        }),
        readConfig: () => new Promise<ReleaseRecoveryConfig>(() => undefined),
      },
    )
    didFire = true
    controller.abort()

    await observationFailure(operation)
    expect(cancel).toHaveBeenCalledOnce()
  })

  it('zeroes a stalled configuration pepper when it resolves after the overall abort won', async () => {
    const controller = new AbortController()
    let didFire = false
    let resolveConfig!: (config: ReleaseRecoveryConfig) => void
    const stalledConfig = new Promise<ReleaseRecoveryConfig>(resolve => {
      resolveConfig = resolve
    })
    const pepper = new Uint8Array(32).fill(0xa5)
    const lateConfig = Object.freeze({
      ...CONFIG,
      censusPepperBytes: pepper,
    }) as ReleaseRecoveryConfig
    const operation = observeReleaseRecoveryState(
      {} as WorkerEnv,
      REQUEST,
      {
        clockMilliseconds: () => 1_000,
        timerFactory: () => ({
          signal: controller.signal,
          fired: () => didFire,
          cancel: () => undefined,
        }),
        readConfig: () => stalledConfig,
      },
    )
    didFire = true
    controller.abort()

    await observationFailure(operation)
    expect([...pepper]).toEqual(new Array<number>(32).fill(0xa5))
    resolveConfig(lateConfig)
    await stalledConfig
    await Promise.resolve()
    expect([...pepper]).toEqual(new Array<number>(32).fill(0))
  })
})
