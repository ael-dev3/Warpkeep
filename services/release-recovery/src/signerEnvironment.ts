import { RecoverySigner } from './signer.js'
import type { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'
import type { ReleaseRecoveryObservationService } from './realmEvidence.js'
import { parseSpacetimeProgramPins } from './spacetimeProgramPins.js'
import { RAW_MODULE_DEF_V10_MAX_BYTES } from './rawModuleDefV10.js'
import { githubFail } from './config.js'

export interface RecoverySignerEnvironment {
  RECOVERY_ENABLED: string
  RECOVERY_AUTHORIZATION_EPOCH: string
  RECOVERY_ARMING_MANIFEST: string
  RECOVERY_SIGNING_PRIVATE_JWK: string
  RELEASE_RECOVERY_RPC_SECRET: string
  GITHUB_APP_ID: string
  GITHUB_APP_INSTALLATION_ID: string
  GITHUB_APP_PRIVATE_KEY_PEM: string
  AUTH_BRIDGE_OBSERVER: ReleaseRecoveryObservationService
  RECOVERY_LEDGER_V2: DurableObjectNamespace<ReleaseRecoveryAuthorizationLedgerV2>
}

export type CompiledSignerFixtures = Readonly<{ manifest: ArrayBuffer; g001: ArrayBuffer; g002: ArrayBuffer; ptr: ArrayBuffer }>

/** Only compiled modules supply fixture bytes. No caller-controlled paths or URLs. */
export function signerFromEnvironment(env: RecoverySignerEnvironment, compiled: CompiledSignerFixtures): RecoverySigner {
  const manifest = new Uint8Array(compiled.manifest)
  const pins = parseSpacetimeProgramPins(manifest)
  const schemas = { g001: new Uint8Array(compiled.g001), g002: new Uint8Array(compiled.g002), ptr: new Uint8Array(compiled.ptr) }
  if (Object.values(schemas).some(bytes => bytes.byteLength === 0 || bytes.byteLength > RAW_MODULE_DEF_V10_MAX_BYTES)) githubFail('RECOVERY_SIGNER_CONFIGURATION_INVALID')
  const control = { RECOVERY_ENABLED: env.RECOVERY_ENABLED, RECOVERY_AUTHORIZATION_EPOCH: env.RECOVERY_AUTHORIZATION_EPOCH,
    RECOVERY_ARMING_MANIFEST: env.RECOVERY_ARMING_MANIFEST }
  const secrets = { RECOVERY_SIGNING_PRIVATE_JWK: env.RECOVERY_SIGNING_PRIVATE_JWK, RELEASE_RECOVERY_RPC_SECRET: env.RELEASE_RECOVERY_RPC_SECRET }
  const ledger = env.RECOVERY_LEDGER_V2.getByName('warpkeep-release-recovery-control-v2')
  return new RecoverySigner(control, secrets, ledger, () => Math.floor(Date.now() / 1000), {
    githubApp: { GITHUB_APP_ID: env.GITHUB_APP_ID, GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID,
      GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM },
    fetch: globalThis.fetch,
    observation: { bridge: env.AUTH_BRIDGE_OBSERVER, pins, expectedRawModuleDefV10Fixtures: schemas },
    requestLedger: requestId => env.RECOVERY_LEDGER_V2.getByName(requestId),
  })
}
