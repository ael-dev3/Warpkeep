import { expect, it } from 'vitest'
import { parseSignerControl, reconcileSignerControl } from '../src/signerControl.js'
import { createLedgerV2Control, reconcileLedgerV2Control } from '../src/ledgerV2.js'
import { arming } from './signerControlFixture.js'
const config = () => ({ RECOVERY_ENABLED: 'false', RECOVERY_AUTHORIZATION_EPOCH: '3', RECOVERY_ARMING_MANIFEST: JSON.stringify(arming()) })
it('uses the real ledger transition rules for enable, disable, advance and replay', async () => {
  let state = createLedgerV2Control({ authorizationEpoch: 3 })
  const ledger = { async reconcileControl(input: Parameters<typeof reconcileLedgerV2Control>[1]) {
    state = reconcileLedgerV2Control(state, input)
    return state
  } }
  expect((await reconcileSignerControl({ ...config(), RECOVERY_ENABLED: 'true' }, ledger)).enabled).toBe(true)
  expect((await reconcileSignerControl(config(), ledger)).enabled).toBe(false)
  await expect(reconcileSignerControl({ ...config(), RECOVERY_ENABLED: 'true' }, ledger)).rejects.toThrow('RECOVERY_LEDGER_ARMING_ALREADY_USED')
  const advanced = { ...config(), RECOVERY_AUTHORIZATION_EPOCH: '4', RECOVERY_ARMING_MANIFEST: JSON.stringify(arming({ authorizationEpoch: 4 })) }
  expect((await reconcileSignerControl(advanced, ledger)).authorizationEpoch).toBe(4)
  expect(state.activeArming).toBeNull()
  await expect(reconcileSignerControl(config(), ledger)).rejects.toThrow('RECOVERY_LEDGER_EPOCH_DECREASE')
})
it('parses exact deploy control and preserves every arming field', () => {
  expect(parseSignerControl(config())).toEqual({ enabled: false, authorizationEpoch: 3, arming: arming() })
  expect(parseSignerControl({ ...config(), RECOVERY_ENABLED: 'true' }).enabled).toBe(true)
})
it('rejects coercion, epoch mismatch, duplicate manifest keys and missing authority', () => {
  const manifest = config().RECOVERY_ARMING_MANIFEST
  expect(manifest[0]).toBe('{')
  for (const change of [ { RECOVERY_ENABLED: 'TRUE' }, { RECOVERY_ENABLED: true },
    { RECOVERY_AUTHORIZATION_EPOCH: '03' }, { RECOVERY_AUTHORIZATION_EPOCH: '4' },
    { RECOVERY_AUTHORIZATION_EPOCH: '9007199254740992' }, { RECOVERY_ARMING_MANIFEST: '{}' },
    // Duplicate only the root field, without changing any nested JSON.
    { RECOVERY_ARMING_MANIFEST: `{"authorizationEpoch":3,${manifest.slice(1)}` },
    { RECOVERY_ARMING_MANIFEST: 'x'.repeat(32769) }, { extra: 'secret' } ]) {
    expect(() => parseSignerControl({ ...config(), ...change })).toThrow('RECOVERY_SIGNER_CONTROL_INVALID')
  }
  expect(() => parseSignerControl({})).toThrow('RECOVERY_SIGNER_CONTROL_INVALID')
})
