import { afterEach, describe, expect, it, vi } from 'vitest'
import { observePtrFromEnvironment } from '../src/signerPtrObservation.js'
import { verifyPtrObservation } from '../src/ptrObservation.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { ptrObservationOidcFixture } from './ptrObservationOidcFixture.js'
import { PTR_OBSERVATION_COMMIT, PTR_OBSERVATION_EPOCH, PTR_OBSERVATION_REQUEST_ID,
  ptrObservationBridgeFixture } from './ptrObservationBridgeFixture.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))

async function fixture(options: Readonly<{ mutateAfterBridge?: (env: Record<string, unknown>) => void,
  bridge?: unknown, oidcMutate?: NonNullable<Parameters<typeof ptrObservationOidcFixture>[0]>['mutate'] }> = {}) {
  const now = 1_800_000_000
  const oidc = await ptrObservationOidcFixture({ now, mutate: options.oidcMutate })
  const requests: unknown[] = []
  const env: Record<string, any> = {
    RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: String(PTR_OBSERVATION_EPOCH),
    RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(preparationPrivateJwk), RELEASE_RECOVERY_RPC_SECRET: 'A'.repeat(43),
    GITHUB_APP_ID: oidc.environment.GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID: oidc.environment.GITHUB_APP_INSTALLATION_ID,
    GITHUB_APP_PRIVATE_KEY_PEM: oidc.environment.GITHUB_APP_PRIVATE_KEY_PEM,
    AUTH_BRIDGE_OBSERVER: { async observeReleaseRecoveryState(request: unknown) {
      requests.push(request)
      options.mutateAfterBridge?.(env)
      return options.bridge ?? ptrObservationBridgeFixture(now)
    } },
  }
  Object.defineProperty(env, 'RECOVERY_ARMING_MANIFEST', { get() { throw new Error('must not read arming') } })
  vi.spyOn(Date, 'now').mockReturnValue(now * 1000)
  vi.stubGlobal('fetch', oidc.fetch)
  return { env, oidc, requests, now }
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

describe('read-only existing PTR observation signer', () => {
  it('authenticates, calls the existing private observer exactly once, refreshes proof and signs its strict capture', async () => {
    const { env, oidc, requests, now } = await fixture()
    const result = await observePtrFromEnvironment(env as never,
      { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId })
    expect(requests).toEqual([{ schemaVersion: 1, profile: 'warpkeep-release-recovery-realm-observation-request-v1',
      rpcCredential: 'A'.repeat(43), requestId: PTR_OBSERVATION_REQUEST_ID,
      candidateCommit: PTR_OBSERVATION_COMMIT, recoveryAuthorizationEpoch: PTR_OBSERVATION_EPOCH }])
    const identity = { sourceCommit: oidc.sourceCommit, sourceTree: 'd'.repeat(40), runId: '9007199254740995',
      runAttempt: '2', checkRunId: '9007199254740993', requestId: oidc.requestId }
    const verified = await verifyPtrObservation(result.ptrObservationJws, identity, now)
    expect(verified).toMatchObject({ purpose: 'existing-ptr-state-observation', identity,
      observation: { ptr: { ownerEnabled: true, singletonOwnerCount: 1 } } })
    expect(oidc.calls.filter(url => url.endsWith('/branches/main'))).toHaveLength(2)
  })

  it.each([
    ['enabled recovery', (env: Record<string, any>) => { env.RECOVERY_ENABLED = 'true' }],
    ['changed epoch', (env: Record<string, any>) => { env.RECOVERY_AUTHORIZATION_EPOCH = '4' }],
  ])('refuses %s after the private await and signs nothing', async (_name, mutateAfterBridge) => {
    const { env, oidc } = await fixture({ mutateAfterBridge })
    await expect(observePtrFromEnvironment(env as never,
      { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId })).rejects.toThrow('RECOVERY_PTR_OBSERVATION_UNAVAILABLE')
  })

  it('refuses a stale refreshed GitHub proof after observing private state', async () => {
    let branches = 0
    const { env, oidc } = await fixture({ oidcMutate(url, value) {
      if (url.endsWith('/branches/main') && ++branches === 2) value.protected = false
    } })
    await expect(observePtrFromEnvironment(env as never,
      { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId })).rejects.toThrow('RECOVERY_PTR_OBSERVATION_UNAVAILABLE')
  })

  it('refuses observation expiry during awaited signature verification while OIDC and total deadline remain valid', async () => {
    const { env, oidc, now } = await fixture()
    const verify = crypto.subtle.verify.bind(crypto.subtle)
    let observationVerified = false
    vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (algorithm, key, signature, data) => {
      const valid = await verify(algorithm, key, signature, data)
      const header = Buffer.from(new TextDecoder().decode(data).split('.')[0]!, 'base64url').toString()
      if (header.includes('"typ":"warpkeep-recovery-ptr-observation+jws"')) {
        expect(valid).toBe(true)
        observationVerified = true
        // The signature remains genuine, but its 90-second observation window
        // expires before this awaited crypto operation returns. The 100-second
        // request budget and 300-second OIDC credential are still valid.
        vi.mocked(Date.now).mockReturnValue((now + 90) * 1000)
        await Promise.resolve()
      }
      return valid
    })
    await expect(observePtrFromEnvironment(env as never,
      { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId }))
      .rejects.toThrow('RECOVERY_PTR_OBSERVATION_UNAVAILABLE')
    expect(observationVerified).toBe(true)
  })

  it('refuses malformed private evidence, invalid deploy control and extra RPC arguments with one safe error', async () => {
    const { env, oidc } = await fixture({ bridge: { privateOwnerFid: 'must-not-escape' } })
    for (const operation of [
      () => observePtrFromEnvironment(env as never, { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId }),
      () => observePtrFromEnvironment({ ...env, RECOVERY_AUTHORIZATION_EPOCH: '03' } as never,
        { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId }),
      () => observePtrFromEnvironment(env as never,
        { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId }, ['unexpected']),
    ]) {
      try { await operation(); expect.fail() } catch (error) {
        expect(String(error)).toContain('RECOVERY_PTR_OBSERVATION_UNAVAILABLE')
        expect(String(error)).not.toContain('must-not-escape')
      }
    }
  })
})
