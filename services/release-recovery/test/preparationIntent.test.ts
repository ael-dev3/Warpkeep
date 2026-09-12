import { describe, expect, it } from 'vitest'
import { choosePreparationIntent, snapshotPreparationIdentity, assertPreparationArming } from '../src/preparationIntent.js'
import { createLedgerV2Control } from '../src/ledgerV2.js'
import { arming } from './signerControlFixture.js'

const policy = { schemaVersion: 1 as const, profile: 'warpkeep-recovery-preparation-policy-v1' as const, enabled: true as const,
  authorizationEpoch: 3, workflowRef: 'ael-dev3/Warpkeep/.github/workflows/sealed-realms-production.yml@refs/heads/main' as const,
  environment: 'notification-bridge-prepared' as const, operation: 'activation-evidence-generate' as const }
const identity = { preparationCommit: 'c'.repeat(40), preparationTree: 'd'.repeat(40), runId: '12', runAttempt: '1', checkRunId: '13' }
const control = createLedgerV2Control({ authorizationEpoch: 3 })
const input = { policy, identity, configuredArming: null, now: 100 }
describe('preparation intent boundary', () => {
  it.each(['runId', 'runAttempt', 'checkRunId'])('rejects hostile %s without invoking coercion', key => {
    let calls = 0
    const hostile = { [Symbol.toPrimitive]() { calls++; throw new Error('executed') } }
    expect(() => snapshotPreparationIdentity({ ...identity, [key]: hostile })).toThrow()
    expect(calls).toBe(0)
  })
  it('adopts configured request identity and commits the full available tuple', () => {
    const configuredArming = arming()
    const intent = choosePreparationIntent({ ...input, configuredArming }, control, null, () => { throw new Error('must not allocate') })
    expect(intent.requestId).toBe(configuredArming.requestId)
    expect(() => assertPreparationArming(intent, configuredArming)).not.toThrow()
    expect(() => assertPreparationArming(intent, arming({ bridgeConfigEpoch: 5 }))).toThrow()
    expect(() => choosePreparationIntent({ ...input, configuredArming: arming({ bridgeConfigEpoch: 5 }) }, control,
      intent, () => { throw new Error('must not allocate') })).toThrow()
  })
  it('allows full future commitments only when no prior configured tuple existed', () => {
    const intent = choosePreparationIntent(input, control, null, () => arming().requestId)
    expect(() => assertPreparationArming(intent, arming({ bridgeConfigEpoch: 5 }))).not.toThrow()
    expect(() => assertPreparationArming(intent, arming({ preparationTree: 'e'.repeat(40) }))).toThrow()
  })
  it('retries are byte-stable and never allocate another request', () => {
    const first = choosePreparationIntent(input, control, null, () => arming().requestId)
    const retry = choosePreparationIntent({ ...input, now: 200, identity: { ...identity, runAttempt: '2' } }, control, first,
      () => { throw new Error('must not allocate') })
    expect(JSON.stringify(retry)).toBe(JSON.stringify(first))
  })
  it('retains the original intent when its matching full manifest is populated later', () => {
    const first = choosePreparationIntent(input, control, null, () => arming().requestId)
    const retry = choosePreparationIntent({ ...input, configuredArming: arming(), now: 200 }, control, first,
      () => { throw new Error('must not allocate') })
    expect(JSON.stringify(retry)).toBe(JSON.stringify(first))
    expect(retry.configuredArmingDigest).toBeNull()
    for (const delta of [{ requestId: '123e4567-e89b-42d3-a456-426614174001' },
      { preparationCommit: 'e'.repeat(40) }, { preparationTree: 'e'.repeat(40) }, { authorizationEpoch: 4 }]) {
      expect(() => choosePreparationIntent({ ...input, configuredArming: arming(delta) }, control, first,
        () => { throw new Error('must not allocate') })).toThrow()
    }
  })
})
