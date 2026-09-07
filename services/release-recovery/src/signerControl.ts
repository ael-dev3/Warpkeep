import { githubFail, snapshotExactDataObject, snapshotRecoveryArmingTuple, type RecoveryArmingTuple } from './config.js'
import { parseGitHubJsonObject } from './http.js'
import type { LedgerV2ControlState } from './ledgerV2.js'

const CODE = 'RECOVERY_SIGNER_CONTROL_INVALID'
type ControlLedger = Readonly<{
  reconcileControl(input: Readonly<{ enabled: boolean; authorizationEpoch: number; arming?: RecoveryArmingTuple }>): Promise<LedgerV2ControlState>
}>
export type SignerControl = Readonly<{ enabled: boolean; authorizationEpoch: number; arming: RecoveryArmingTuple }>

/** Parse only the deploy-owned control projection, never a gateway request. */
export function parseSignerControl(input: unknown): SignerControl {
  try {
    const source = snapshotExactDataObject(input, [
      'RECOVERY_ENABLED', 'RECOVERY_AUTHORIZATION_EPOCH', 'RECOVERY_ARMING_MANIFEST',
    ], CODE)
    if (source.RECOVERY_ENABLED !== 'true' && source.RECOVERY_ENABLED !== 'false') githubFail(CODE)
    const epoch = source.RECOVERY_AUTHORIZATION_EPOCH
    if (typeof epoch !== 'string' || !/^[1-9][0-9]{0,15}$/u.test(epoch)
      || !Number.isSafeInteger(Number(epoch))) githubFail(CODE)
    const manifest = source.RECOVERY_ARMING_MANIFEST
    if (typeof manifest !== 'string' || manifest.length > 32768) githubFail(CODE)
    const bytes = new TextEncoder().encode(manifest)
    if (bytes.length > 32768) githubFail(CODE)
    let arming: RecoveryArmingTuple
    try { arming = snapshotRecoveryArmingTuple(parseGitHubJsonObject(bytes, CODE, []), CODE) }
    finally { bytes.fill(0) }
    if (arming.authorizationEpoch !== Number(epoch)) githubFail(CODE)
    return Object.freeze({ enabled: source.RECOVERY_ENABLED === 'true', authorizationEpoch: Number(epoch), arming })
  } catch { githubFail(CODE) }
}

/** The caller must supply the fixed control-object stub, never a request-provided service. */
export async function reconcileSignerControl(input: unknown, ledger: ControlLedger): Promise<LedgerV2ControlState> {
  const config = parseSignerControl(input)
  // A disabled ledger transition explicitly forbids arming, including on epoch advance.
  return ledger.reconcileControl(config.enabled ? config : Object.freeze({
    enabled: false, authorizationEpoch: config.authorizationEpoch,
  }))
}
