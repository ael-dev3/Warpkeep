import { afterEach, describe, expect, it, vi } from 'vitest'
import { observePtrFromEnvironment } from '../src/signerPtrObservation.js'
import * as updateSigner from '../src/signerPtrObservation.js'
import { verifyHistoricalPtrUpdateObservation, verifyPtrUpdateObservationPair } from '../src/ptrObservation.js'
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
  bridge?: unknown, now?: number, update?: boolean, reconciliationRun?: boolean,
  oidcMutate?: NonNullable<Parameters<typeof ptrObservationOidcFixture>[0]>['mutate'] }> = {}) {
  const now = options.now ?? 1_800_000_000
  const oidc = await ptrObservationOidcFixture({ now,
    ...(options.reconciliationRun ? { runId: '9007199254740997', checkRunId: '9007199254740999',
      requestId: '223e4567-e89b-42d3-a456-426614174000' } : {}),
    claims: options.update ? { aud: 'https://release-auth.warpkeep.com/ptr-update-observation' } : undefined,
    mutate(url, value) {
      if (options.update) {
        if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
          if (job.name === 'observe_ptr') job.name = 'operate_ptr'
        if (value.name === 'observe_ptr') value.name = 'operate_ptr'
      }
      options.oidcMutate?.(url, value)
    } })
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

const updateCommon = { bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
  predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
  scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
  claimRunId: '9007199254740995', claimRunAttempt: '2' }
function updateRequest(oidc: Awaited<ReturnType<typeof ptrObservationOidcFixture>>) {
  return { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId,
    context: { ...updateCommon, phase: 'pre' as const } }
}
describe('PTR update observation signer composition', () => {
  it('signs genuine pre/post observations through the fixed service while an expired retained pre remains historical evidence', async () => {
    expect(typeof updateSigner.observePtrUpdateFromEnvironment).toBe('function')
    const first = await fixture({ update: true })
    const pre = await updateSigner.observePtrUpdateFromEnvironment(first.env as never, updateRequest(first.oidc))
    expect(first.requests).toHaveLength(1)
    const preData = await verifyHistoricalPtrUpdateObservation(pre.ptrUpdateObservationJws)
    expect(preData.context.phase).toBe('pre')
    const now = first.now + 120, changed = ptrObservationBridgeFixture(now)
    changed.ptr.programKeccak256 = updateCommon.candidateProgram
    changed.requestId = '223e4567-e89b-42d3-a456-426614174000'
    const second = await fixture({ update: true, now, bridge: changed, reconciliationRun: true })
    const postRequest = { ...updateRequest(second.oidc), context: { ...updateCommon, phase: 'post' as const,
      preObservationJwsSha256: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pre.ptrUpdateObservationJws))).toString('hex'),
      completionReceiptDigest: '7'.repeat(64), completionRecordDigest: '8'.repeat(64), terminalRecordDigest: '9'.repeat(64),
      terminalRunId: '9007199254740997', terminalRunAttempt: '2', terminalOutcome: 'reconciled-effect-applied' as const,
      terminalAt: new Date((now - 1) * 1000).toISOString() }, preObservationJws: pre.ptrUpdateObservationJws }
    const post = await updateSigner.observePtrUpdateFromEnvironment(second.env as never, postRequest)
    const pair = await verifyPtrUpdateObservationPair(pre.ptrUpdateObservationJws, post.ptrUpdateObservationJws)
    expect(pair.post.observation.ptr.programKeccak256).toBe('b'.repeat(64))
    expect(pair.post.identity).toMatchObject({ runId: '9007199254740997', checkRunId: '9007199254740999' })
    expect(pair.post.context.claimRunId).toBe('9007199254740995')
    expect(second.requests).toHaveLength(1)
  })
  it('refuses a different original claim run before calling the observer', async () => {
    const { env, oidc, requests } = await fixture({ update: true })
    const request = updateRequest(oidc)
    await expect(updateSigner.observePtrUpdateFromEnvironment(env as never,
      { ...request, context: { ...request.context, claimRunId: '11' } })).rejects.toThrow('RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE')
    expect(requests).toHaveLength(0)
  })
  it('fails closed with missing deployment credentials, widened arguments or standalone OIDC and never calls the bridge', async () => {
    const { env, oidc, requests } = await fixture({ update: true })
    const request = updateRequest(oidc)
    for (const action of [
      () => updateSigner.observePtrUpdateFromEnvironment({ ...env, GITHUB_APP_PRIVATE_KEY_PEM: '' } as never, request),
      () => updateSigner.observePtrUpdateFromEnvironment({ ...env, RECOVERY_ENABLED: 'true' } as never, request),
      () => updateSigner.observePtrUpdateFromEnvironment(env as never, request, ['private-extra']),
    ]) await expect(action()).rejects.toThrow('RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE')
    expect(requests).toHaveLength(0)
    const standalone = await fixture()
    await expect(updateSigner.observePtrUpdateFromEnvironment(standalone.env as never, updateRequest(standalone.oidc)))
      .rejects.toThrow('RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE')
    expect(standalone.requests).toHaveLength(0)
  })
  it.each(['epoch', 'job', 'expiry'])('rechecks %s after awaited private/crypto work', async kind => {
    let refreshedBranches = 0
    const { env, oidc, now } = await fixture({ update: true,
      mutateAfterBridge: kind === 'epoch' ? value => { value.RECOVERY_AUTHORIZATION_EPOCH = '9' } : undefined,
      oidcMutate: kind === 'job' ? (url, value) => {
        if (url.endsWith('/branches/main') && ++refreshedBranches === 2) value.protected = false
      } : undefined })
    if (kind === 'expiry') {
      const verify = crypto.subtle.verify.bind(crypto.subtle)
      vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (algorithm, key, signature, data) => {
        const valid = await verify(algorithm, key, signature, data)
        const header = Buffer.from(new TextDecoder().decode(data).split('.')[0]!, 'base64url').toString()
        if (header.includes('warpkeep-recovery-ptr-update-observation+jws')) vi.mocked(Date.now).mockReturnValue((now + 90) * 1000)
        return valid
      })
    }
    await expect(updateSigner.observePtrUpdateFromEnvironment(env as never, updateRequest(oidc)))
      .rejects.toThrow('RECOVERY_PTR_UPDATE_OBSERVATION_UNAVAILABLE')
  })
})
