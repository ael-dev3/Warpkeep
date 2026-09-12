import { afterEach, describe, expect, it, vi } from 'vitest'
import * as signer from '../src/signerPtrObservation.js'
import * as observation from '../src/ptrObservation.js'
import { createRecoveryGateway, type RecoverySignerService } from '../src/gateway.js'
import { preparationPrivateJwk } from './preparationFixture.js'
import { ptrObservationBridgeFixture } from './ptrObservationBridgeFixture.js'
import { ptrObservationOidcFixture } from './ptrObservationOidcFixture.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE',
    y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
const common = { bindingDigest: '1'.repeat(64), inspectionDigest: '2'.repeat(64), inspectionRecordDigest: '3'.repeat(64),
  predecessorDigest: null, predecessorReceiptDigest: null, beforeProgram: 'a'.repeat(64), candidateProgram: 'b'.repeat(64),
  scopeDigest: '4'.repeat(64), issuedRecordDigest: '5'.repeat(64), claimRecordDigest: '6'.repeat(64),
  claimRunId: '9007199254740995', claimRunAttempt: '2' }
async function fixture(options: { now?: number; post?: boolean; audience?: string; job?: string;
  change?: (env: Record<string, any>, bridge: ReturnType<typeof ptrObservationBridgeFixture>) => void;
  metadata?: NonNullable<Parameters<typeof ptrObservationOidcFixture>[0]>['mutate'] } = {}) {
  const now = options.now ?? 1_800_000_000
  const oidc = await ptrObservationOidcFixture({ now,
    ...(options.post ? { runId: '9007199254740997', checkRunId: '9007199254740999', requestId: '223e4567-e89b-42d3-a456-426614174000' } : {}),
    claims: { aud: options.audience ?? 'https://release-auth.warpkeep.com/g002-update-observation' },
    mutate(url, value) {
      if (url.includes('/jobs?')) for (const job of value.jobs as Record<string, unknown>[])
        if (job.name === 'observe_ptr') job.name = options.job ?? 'operate_g002'
      if (value.name === 'observe_ptr') value.name = options.job ?? 'operate_g002'
      options.metadata?.(url, value)
    } })
  const requests: unknown[] = [], bridge = ptrObservationBridgeFixture(now)
  bridge.requestId = oidc.requestId
  if (options.post) bridge.g002.programKeccak256 = common.candidateProgram
  const env: Record<string, any> = { ...oidc.environment, RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '3',
    RECOVERY_SIGNING_PRIVATE_JWK: JSON.stringify(preparationPrivateJwk), RELEASE_RECOVERY_RPC_SECRET: 'A'.repeat(43),
    AUTH_BRIDGE_OBSERVER: { async observeReleaseRecoveryState(request: unknown) {
      requests.push(request); options.change?.(env, bridge); return bridge
    } } }
  Object.defineProperty(env, 'RECOVERY_ARMING_MANIFEST', { get() { throw new Error('observation cannot read arming') } })
  vi.spyOn(Date, 'now').mockReturnValue(now * 1000); vi.stubGlobal('fetch', oidc.fetch)
  const request = { oidcToken: oidc.token, sourceCommit: oidc.sourceCommit, requestId: oidc.requestId, context: { ...common, phase: 'pre' as const } }
  const log = vi.fn()
  const gateway = createRecoveryGateway({ signer: {
    g002UpdateObservation: (value: unknown) => signer.observeG002UpdateFromEnvironment(env as never, value),
  } as unknown as RecoverySignerService, log })
  const post = (value: unknown, endpoint = 'g002-update-observation') => gateway.fetch(new Request(`https://release-auth.warpkeep.com/v1/recovery/${endpoint}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) }))
  return { env, now, oidc, requests, request, log, post }
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('connected G002 observation gateway and signer', () => {
  it('authenticates real OIDC and signs actual bridge pre/post evidence through the gateway', async () => {
    const first = await fixture(), response = await first.post(first.request)
    expect(response.status).toBe(200)
    const pre = await response.json() as { g002UpdateObservationJws: string }
    const preData = await observation.verifyHistoricalG002UpdateObservation(pre.g002UpdateObservationJws)
    expect(preData.context.phase).toBe('pre')
    expect(first.requests).toHaveLength(1)
    expect(first.oidc.calls.filter(url => url.endsWith('/branches/main'))).toHaveLength(2)
    const second = await fixture({ now: first.now + 120, post: true })
    const postRequest = { ...second.request, context: { ...common, phase: 'post',
      preObservationJwsSha256: Buffer.from(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(pre.g002UpdateObservationJws))).toString('hex'),
      completionReceiptDigest: '7'.repeat(64), completionRecordDigest: '8'.repeat(64), terminalRecordDigest: '9'.repeat(64),
      terminalRunId: '9007199254740997', terminalRunAttempt: '2', terminalOutcome: 'reconciled-effect-applied',
      terminalAt: new Date((second.now - 1) * 1000).toISOString() }, preObservationJws: pre.g002UpdateObservationJws }
    const postResponse = await second.post(postRequest)
    expect(postResponse.status).toBe(200)
    const post = await postResponse.json() as { g002UpdateObservationJws: string }
    const pair = await observation.verifyG002UpdateObservationPair(pre.g002UpdateObservationJws, post.g002UpdateObservationJws)
    expect(pair.post.observation.g002.programKeccak256).toBe(common.candidateProgram)
    expect(pair.post.context.claimRunId).toBe(common.claimRunId)
    expect(pair.post.identity.runId).toBe('9007199254740997')
    expect(second.requests).toHaveLength(1)
    expect(JSON.stringify([...first.log.mock.calls, ...second.log.mock.calls])).not.toMatch(/oidcToken|bindingDigest|claimRecordDigest|sourceCommit/u)
  })
  it.each([
    { audience: 'https://release-auth.warpkeep.com/ptr-update-observation' },
    { audience: 'https://release-auth.warpkeep.com/ptr-observation' },
    { job: 'operate_ptr' }, { job: 'observe_ptr' }, { job: 'operate' },
  ])('refuses foreign audience or job %j before private observation', async options => {
    const f = await fixture(options)
    const result = await f.post(f.request)
    expect(result.status).toBe(503)
    expect(await result.json()).toEqual({ code: 'RECOVERY_G002_UPDATE_OBSERVATION_UNAVAILABLE', requestId: f.request.requestId })
    expect(f.requests).toHaveLength(0)
  })
  it.each(['epoch', 'source', 'target', 'population', 'expiry'])('revalidates %s across actual awaits', async kind => {
    let branches = 0
    const f = await fixture({ change(env, bridge) {
      if (kind === 'epoch') env.RECOVERY_AUTHORIZATION_EPOCH = '9'
      if (kind === 'target') bridge.g002.databaseIdentity = 'd'.repeat(64)
      if (kind === 'population') bridge.g002.playerCount = 1
    }, metadata(url, value) { if (kind === 'source' && url.endsWith('/branches/main') && ++branches === 2) value.protected = false } })
    if (kind === 'expiry') {
      const verify = crypto.subtle.verify.bind(crypto.subtle)
      vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (algorithm, key, signature, data) => {
        const valid = await verify(algorithm, key, signature, data)
        if (Buffer.from(new TextDecoder().decode(data).split('.')[0]!, 'base64url').toString().includes('warpkeep-recovery-g002-update-observation+jws'))
          vi.mocked(Date.now).mockReturnValue((f.now + 90) * 1000)
        return valid
      })
    }
    expect((await f.post(f.request)).status).toBe(503)
  })
  it('rejects expanded inputs, foreign claims, copied captures and extra RPC args without mutation authority', async () => {
    const f = await fixture()
    for (const value of [{ ...f.request, realm: 'PTR' }, { ...f.request, preObservationJws: 'a.b.c' },
      { ...f.request, context: { ...f.request.context, realm: 'GENESIS_002' } }])
      expect((await f.post(value)).status).toBe(400)
    expect((await f.post({ ...f.request, context: { ...f.request.context, claimRunId: '11' } })).status).toBe(503)
    await expect(signer.observeG002UpdateFromEnvironment(f.env as never, f.request, ['private-extra'])).rejects.toThrow('RECOVERY_G002_UPDATE_OBSERVATION_UNAVAILABLE')
    expect(f.requests).toHaveLength(0)
  })
})
