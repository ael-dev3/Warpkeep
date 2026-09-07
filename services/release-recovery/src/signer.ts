import { githubFail, snapshotExactDataObject } from './config.js'
import { signRecoveryStatusJws } from './crypto.js'
import { RECOVERY_AUDIENCE, RECOVERY_ISSUER } from './protocol.js'
import { RECOVERY_KEY_ID } from './recoveryPublicKey.js'
import { parseSignerControl, reconcileSignerControl } from './signerControl.js'
import { validateSignerSecrets } from './signerSecrets.js'

type ControlLedger = Parameters<typeof reconcileSignerControl>[1]

/** Private composition core. The Worker entrypoint must supply deploy-owned inputs
 * and the fixed control-object stub; none of these are RPC request parameters. */
export class RecoverySigner {
  constructor(private readonly control: unknown, private readonly secrets: unknown,
    private readonly ledger: ControlLedger, private readonly now = () => Math.floor(Date.now() / 1000)) {}

  async status(...args: []): Promise<Readonly<{ statusJws: string }>> {
    if (args.length !== 0) githubFail('RECOVERY_SIGNER_REQUEST_INVALID')
    // Validate all local material before making the durable control transition.
    const control = snapshotExactDataObject(this.control, ['RECOVERY_ENABLED', 'RECOVERY_AUTHORIZATION_EPOCH', 'RECOVERY_ARMING_MANIFEST'], 'RECOVERY_SIGNER_CONTROL_INVALID')
    const config = parseSignerControl(control)
    const secrets = await validateSignerSecrets(this.secrets)
    const before = this.now()
    if (!Number.isSafeInteger(before) || before < 0 || before > Number.MAX_SAFE_INTEGER - 60) githubFail('RECOVERY_SIGNER_TIME_INVALID')
    const state = await reconcileSignerControl(control, this.ledger)
    const iat = this.now()
    if (!Number.isSafeInteger(iat) || iat < before || iat > Number.MAX_SAFE_INTEGER - 60) githubFail('RECOVERY_SIGNER_TIME_INVALID')
    if (state.enabled !== config.enabled || state.authorizationEpoch !== config.authorizationEpoch) githubFail('RECOVERY_SIGNER_CONTROL_INVALID')
    const statusJws = await signRecoveryStatusJws({
      schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-status-v1',
      iss: RECOVERY_ISSUER, aud: RECOVERY_AUDIENCE,
      sub: 'warpkeep-0.4.0-recovery-control-status', kid: RECOVERY_KEY_ID,
      enabled: state.enabled, authorizationEpoch: state.authorizationEpoch,
      iat, nbf: iat, exp: iat + 60,
    }, secrets.privateJwk)
    return Object.freeze({ statusJws })
  }
}
