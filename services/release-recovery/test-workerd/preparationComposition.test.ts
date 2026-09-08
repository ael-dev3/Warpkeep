import { env } from 'cloudflare:workers'
import { reset } from 'cloudflare:test'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRecoveryGateway } from '../src/gateway.js'
import { prepareRecoveryFromEnvironment } from '../src/signerPreparation.js'
import { verifyPreparationReceipt } from '../src/preparationReceipt.js'
import { preparationFixture } from '../test/preparationFixture.js'

vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))
afterEach(async () => { vi.unstubAllGlobals(); await reset() })
describe('gateway, actual preparation signer and SQLite control composition', () => {
  it('produces authenticated reservation without full arming and retries exact receipt bytes', async () => {
    const fixture = await preparationFixture()
    vi.stubGlobal('fetch', fixture.fetch)
    const gateway = createRecoveryGateway({ signer: env.RECOVERY_PREPARATION_ACTUAL_SIGNER, log: () => {} })
    const request = () => new Request('https://release-auth.warpkeep.com/v1/recovery/prepare', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ oidcToken: fixture.token, preparationCommit: fixture.preparationCommit }),
    })
    const first = await gateway.fetch(request())
    expect(first.status).toBe(200)
    const body = await first.json() as { preparationReceiptJws: string }
    const retry = await gateway.fetch(request())
    expect(retry.status).toBe(200)
    expect(await retry.json()).toEqual(body)
    const payload = JSON.parse(atob(body.preparationReceiptJws.split('.')[1]!.replace(/-/gu, '+').replace(/_/gu, '/')))
    const intent = await verifyPreparationReceipt(body.preparationReceiptJws, payload.intent)
    expect(intent.preparationCommit).toBe(fixture.preparationCommit)
    expect(intent.runId).toBe('9007199254740995')
    const state = await env.RECOVERY_LEDGER_V2.getByName('warpkeep-release-recovery-control-v2').reconcileControl({ enabled: false, authorizationEpoch: 3 })
    expect(state.usedRequestIds).toEqual([])
    expect(state.maxConsumedAuthorizationEpoch).toBeNull()
  })
  it('refuses absent deploy policy before any GitHub calls or durable namespace access', async () => {
    const fixture = await preparationFixture()
    vi.stubGlobal('fetch', fixture.fetch)
    const namespace = { getByName: vi.fn(() => { throw new Error('must not open') }) }
    await expect(prepareRecoveryFromEnvironment({ ...fixture.environment, RECOVERY_ENABLED: 'false',
      RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_SIGNING_PRIVATE_JWK: '', RELEASE_RECOVERY_RPC_SECRET: '',
      RECOVERY_LEDGER_V2: namespace as never }, { oidcToken: fixture.token, preparationCommit: fixture.preparationCommit })).rejects.toThrow()
    expect(fixture.calls).toEqual([])
    expect(namespace.getByName).not.toHaveBeenCalled()
  })
})
