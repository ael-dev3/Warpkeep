import { env } from 'cloudflare:workers'
import { reset, evictDurableObject, runInDurableObject } from 'cloudflare:test'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { arming } from '../test/signerControlFixture.js'
import { signPreparationReceipt } from '../src/preparationReceipt.js'
const PRIVATE_JWK = { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA', d: '3Cfq7fh3QQUIL6yuWLcD7fYN4-26tQgG07i-8nj462o' }
vi.mock('../src/recoveryPublicKey.js', () => ({
  RECOVERY_KEY_ID: 'warpkeep-0.4.0-recovery-2026-09-03-1',
  RECOVERY_KEY_THUMBPRINT: 'zbHwk528B5de5kuNzI98k4Y-rljmW6fbkH-aVZomk4M',
  RECOVERY_PUBLIC_JWK: { kty: 'EC', crv: 'P-256', x: 'WH7HKo4O4eNz7FE1vrGVNDAOMZ4y15Hz5UhLwBZQMUE', y: 'nqmP_QGGfKiOK99bEqu6_r9cKtcn4pYdmiDiKsBD2AA' },
}))

const name = 'warpkeep-release-recovery-control-v2'
const input = () => ({
  policy: { schemaVersion: 1 as const, profile: 'warpkeep-recovery-preparation-policy-v1' as const,
    enabled: true as const, authorizationEpoch: 3,
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' as const,
    environment: 'notification-bridge-prepared' as const, operation: 'activation-evidence-generate' as const },
  identity: { preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40), runId: '12', runAttempt: '1', checkRunId: '13' },
  configuredArming: null, now: 100,
})
beforeEach(async () => { await reset() })
describe('real preparation control ledger', () => {
  it('reserves without consuming authorization and retains exact signed receipt across eviction', async () => {
    let control = env.RECOVERY_LEDGER_V2.getByName(name)
    const first = await control.reservePreparationIntent(input())
    const compact = await signPreparationReceipt(first.intent, PRIVATE_JWK)
    expect(await control.finalizePreparationIntent({ intent: first.intent, preparationReceiptJws: compact })).toEqual({ preparationReceiptJws: compact })
    await evictDurableObject(control)
    control = env.RECOVERY_LEDGER_V2.getByName(name)
    const retry = await control.reservePreparationIntent({ ...input(), now: 200, identity: { ...input().identity, runAttempt: '2' } })
    expect(retry).toEqual({ intent: first.intent, preparationReceiptJws: compact })
    const populated = await control.reservePreparationIntent({ ...input(),
      configuredArming: arming({ requestId: first.intent.requestId }), now: 201 })
    expect(populated).toEqual({ intent: first.intent, preparationReceiptJws: compact })
    expect(populated.intent.configuredArmingDigest).toBeNull()
    const state = await control.reconcileControl({ enabled: false, authorizationEpoch: 3 })
    expect(state.usedRequestIds).toEqual([])
    expect(state.maxConsumedAuthorizationEpoch).toBeNull()
    const armed = await control.reconcileControl({ enabled: true, authorizationEpoch: 3, arming: arming({ requestId: first.intent.requestId }) })
    expect(armed.usedRequestIds).toEqual([first.intent.requestId])
    await expect(runInDurableObject(control, instance => instance.reservePreparationIntent(input()))).rejects.toThrow()
  })
  it('rejects conflicting source, foreign arming, forged receipts and request-object writes', async () => {
    const control = env.RECOVERY_LEDGER_V2.getByName(name)
    const first = await control.reservePreparationIntent(input())
    await expect(runInDurableObject(control, instance => instance.reservePreparationIntent({ ...input(), identity: { ...input().identity, preparationCommit: 'e'.repeat(40) } }))).rejects.toThrow()
    await expect(runInDurableObject(control, instance => instance.reconcileControl({ enabled: true, authorizationEpoch: 3, arming: arming() }))).rejects.toThrow()
    await expect(runInDurableObject(control, instance => instance.finalizePreparationIntent({ intent: first.intent, preparationReceiptJws: 'a.b.c' }))).rejects.toThrow()
    await expect(runInDurableObject(env.RECOVERY_LEDGER_V2.getByName(first.intent.requestId), instance => instance.reservePreparationIntent(input()))).rejects.toThrow()
  })
  it('preserves legacy arming and consumed epochs while allowing explicit disabled advancement', async () => {
    const control = env.RECOVERY_LEDGER_V2.getByName(name)
    await control.reconcileControl({ enabled: true, authorizationEpoch: 3, arming: arming() })
    await control.reconcileControl({ enabled: false, authorizationEpoch: 3 })
    await expect(runInDurableObject(control, instance => instance.reservePreparationIntent(input()))).rejects.toThrow()
    const next = await control.reservePreparationIntent({ ...input(), policy: { ...input().policy, authorizationEpoch: 4 } })
    expect(next.intent.authorizationEpoch).toBe(4)
    const state = await control.reconcileControl({ enabled: false, authorizationEpoch: 4 })
    expect(state.usedRequestIds).toEqual([arming().requestId])
    expect(state.maxConsumedAuthorizationEpoch).toBe(3)
  })
  it('refuses a retained receipt if its control epoch advances during signature verification', async () => {
    const control = env.RECOVERY_LEDGER_V2.getByName(name)
    const first = await control.reservePreparationIntent(input())
    const compact = await signPreparationReceipt(first.intent, PRIVATE_JWK)
    await control.finalizePreparationIntent({ intent: first.intent, preparationReceiptJws: compact })
    await runInDurableObject(control, async instance => {
      const original = crypto.subtle.verify.bind(crypto.subtle)
      let advanced = false
      const spy = vi.spyOn(crypto.subtle, 'verify').mockImplementation(async (...args) => {
        const valid = await original(...args)
        if (!advanced) {
          advanced = true
          await instance.reconcileControl({ enabled: false, authorizationEpoch: 4 })
        }
        return valid
      })
      try {
        await expect(instance.reservePreparationIntent(input())).rejects.toThrow('RECOVERY_PREPARATION_CONTROL_CONFLICT')
        expect(advanced).toBe(true)
      } finally { spy.mockRestore() }
    })
  })
})
