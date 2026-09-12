import { githubFail, type GitHubAppEnvironment } from './config.js'
import { parsePreparationDeployment, snapshotPreparationRequest } from './preparationPolicy.js'
import { verifyPreparationWorkflowIdentity } from './preparationOidc.js'
import { signPreparationReceipt } from './preparationReceipt.js'
import { validateSignerSecrets } from './signerSecrets.js'
import type { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'
import { snapshotPreparationIntent } from './preparationIntent.js'

export type PreparationSignerEnvironment = Readonly<{
  RECOVERY_ENABLED: string
  RECOVERY_AUTHORIZATION_EPOCH: string
  RECOVERY_ARMING_MANIFEST?: string
  RECOVERY_PREPARATION_POLICY?: string
  RECOVERY_SIGNING_PRIVATE_JWK: string
  RELEASE_RECOVERY_RPC_SECRET: string
  GITHUB_APP_ID: string
  GITHUB_APP_INSTALLATION_ID: string
  GITHUB_APP_PRIVATE_KEY_PEM: string
  RECOVERY_LEDGER_V2: DurableObjectNamespace<ReleaseRecoveryAuthorizationLedgerV2>
}>

/** Private service entry: deploy-owned namespace and policy; HTTP only supplies token and source S. */
export async function prepareRecoveryFromEnvironment(
  env: PreparationSignerEnvironment, request: unknown, extra: readonly unknown[] = [],
): Promise<Readonly<{ preparationReceiptJws: string }>> {
  if (extra.length !== 0) githubFail('RECOVERY_PREPARATION_REQUEST_INVALID')
  const captured = snapshotPreparationRequest(request)
  const deployment = parsePreparationDeployment({ RECOVERY_ENABLED: env.RECOVERY_ENABLED,
    RECOVERY_AUTHORIZATION_EPOCH: env.RECOVERY_AUTHORIZATION_EPOCH, RECOVERY_ARMING_MANIFEST: env.RECOVERY_ARMING_MANIFEST,
    RECOVERY_PREPARATION_POLICY: env.RECOVERY_PREPARATION_POLICY })
  const githubApp: GitHubAppEnvironment = { GITHUB_APP_ID: env.GITHUB_APP_ID,
    GITHUB_APP_INSTALLATION_ID: env.GITHUB_APP_INSTALLATION_ID, GITHUB_APP_PRIVATE_KEY_PEM: env.GITHUB_APP_PRIVATE_KEY_PEM }
  const secrets = await validateSignerSecrets({ RECOVERY_SIGNING_PRIVATE_JWK: env.RECOVERY_SIGNING_PRIVATE_JWK,
    RELEASE_RECOVERY_RPC_SECRET: env.RELEASE_RECOVERY_RPC_SECRET })
  const started = Date.now()
  const proof = await verifyPreparationWorkflowIdentity({ token: captured.oidcToken,
    preparationCommit: captured.preparationCommit, environment: githubApp,
    fetch: globalThis.fetch, nowSeconds: Math.floor(started / 1000) })
  // All bounded network observations precede durable writes. A delayed verifier cannot reserve after this lease.
  if (Date.now() - started > 90_000 || Math.floor(Date.now() / 1000) >= proof.expiresAt) githubFail('RECOVERY_PREPARATION_DEADLINE_EXCEEDED')
  const control = env.RECOVERY_LEDGER_V2.getByName('warpkeep-release-recovery-control-v2')
  const reservation = await control.reservePreparationIntent({ ...deployment, identity: proof.identity, now: Math.floor(Date.now() / 1000) })
  try {
    const intent = snapshotPreparationIntent(reservation.intent)
    if (reservation.preparationReceiptJws !== null) return Object.freeze({ preparationReceiptJws: reservation.preparationReceiptJws })
    const preparationReceiptJws = await signPreparationReceipt(intent, secrets.privateJwk)
    const finalized = await control.finalizePreparationIntent({ intent, preparationReceiptJws })
    try {
      // Copy only producer data; do not pass the DO's RPC lifecycle capability across the signer hop.
      return Object.freeze({ preparationReceiptJws: finalized.preparationReceiptJws })
    } finally { finalized[Symbol.dispose]() }
  } finally { reservation[Symbol.dispose]() }
}
