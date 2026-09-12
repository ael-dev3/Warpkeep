import { githubFail } from './config.js'
import { verifyPostDeployClaimReceiptCorrelation } from './claimReceiptCorrelation.js'
import { signRecoveryTerminalJws } from './crypto.js'
import { verifyGitHubWorkflowIdentity } from './githubOidc.js'
import type { LedgerSignerClaimProjection } from './ledgerV2.js'
import { RECOVERY_AUDIENCE, RECOVERY_ISSUER } from './protocol.js'
import { createDeploymentReconciliationProofReader } from './reconciliationEvidence.js'
import { RECOVERY_KEY_ID } from './recoveryPublicKey.js'
import { parseSignerControl } from './signerControl.js'
import type { SignerIssueRuntime } from './signerIssue.js'
import { snapshotSignerRequest } from './signerRequests.js'
import { validateSignerSecrets } from './signerSecrets.js'

function clock(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 900) githubFail('RECOVERY_SIGNER_TIME_INVALID')
  return value
}

async function terminalResponse(p: LedgerSignerClaimProjection, privateJwk: JsonWebKey, iat: number) {
  if ((p.state !== 'completed' && p.state !== 'not-deployed') || p.terminal === undefined
    || p.terminal.outcome !== p.state || p.terminal.completedAt > iat) githubFail('RECOVERY_LEDGER_TERMINAL_UNAVAILABLE')
  const a = p.authorization
  return Object.freeze({ terminalJws: await signRecoveryTerminalJws({
    schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-terminal-v1', iss: RECOVERY_ISSUER, aud: RECOVERY_AUDIENCE,
    sub: 'warpkeep-0.4.0-recovery-terminal-attestation', kid: RECOVERY_KEY_ID,
    requestId: p.requestId, authorizationJti: a.authorizationJti, authorizationJwsSha256: p.authorizationJwsSha256,
    candidateCommit: a.locators.candidateCommit, candidateTree: a.candidateTree, artifactId: a.locators.artifactId, artifactName: a.artifactName,
    githubArtifactArchiveSha256: a.githubArtifactArchiveSha256, innerArtifactTarSha256: a.innerArtifactTarSha256,
    contentManifestSha256: a.contentManifestSha256, deploymentAttestationSha256: a.deploymentAttestationSha256,
    operation: a.operation, canonicalOrigin: a.canonicalOrigin, pagesRunId: a.workflowIdentity.pagesRunId, pagesRunAttempt: a.workflowIdentity.pagesRunAttempt,
    sourceVerifyRunId: a.locators.sourceVerifyRunId, sourceVerifyRunAttempt: a.locators.sourceVerifyRunAttempt,
    authorizationEpoch: a.authorizationEpoch, completedAt: p.terminal.completedAt, outcome: p.terminal.outcome,
    iat, nbf: iat, exp: iat + 900,
  }, privateJwk) })
}

export async function completeRecoveryAuthorization(endpoint: 'complete' | 'reconcile', request: unknown,
  control: unknown, secrets: unknown, runtime: SignerIssueRuntime, now: () => number) {
  const req = snapshotSignerRequest(endpoint, request)
  // Validate deployment configuration, but do not require the consumed epoch to
  // remain enabled: revocation cannot erase an actual deployment outcome.
  parseSignerControl(control)
  const key = await validateSignerSecrets(secrets)
  const identity = await verifyGitHubWorkflowIdentity({ token: req.oidcToken, candidateCommit: req.candidateCommit,
    environment: runtime.githubApp, fetch: runtime.fetch, nowSeconds: clock(now) })
  const ledger = runtime.requestLedger(req.requestId)
  const projection = await ledger.readClaimedProjection({ requestId: req.requestId })
  if (projection.requestId !== req.requestId
    || Object.entries(projection.authorization.locators).some(([name, value]) => req[name] !== value)
    || Object.entries(projection.authorization.workflowIdentity).some(([name, value]) => identity[name as keyof typeof identity] !== value)) githubFail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  await verifyPostDeployClaimReceiptCorrelation({ compact: req.claimReceiptJws, projection, nowSeconds: clock(now) })
  if (projection.state !== 'completed' && projection.state !== 'not-deployed') {
    const proof = await createDeploymentReconciliationProofReader({ githubApp: runtime.githubApp, fetch: runtime.fetch })(projection)
    if (proof.outcome !== 'completed') githubFail('RECOVERY_LEDGER_COMPLETION_NOT_PROVEN')
    await ledger.complete({ requestId: req.requestId, proof, now: clock(now) })
  }
  const terminal = await ledger.readTerminalProjection({ requestId: req.requestId })
  if (terminal.rowBindingDigest !== projection.rowBindingDigest) githubFail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  return terminalResponse(terminal, key.privateJwk, clock(now))
}

export async function readRecoveryTerminal(request: unknown, control: unknown, secrets: unknown,
  runtime: SignerIssueRuntime, now: () => number) {
  const req = snapshotSignerRequest('terminal', request)
  parseSignerControl(control)
  const key = await validateSignerSecrets(secrets)
  const terminal = await runtime.requestLedger(req.requestId).readTerminalProjection({ requestId: req.requestId })
  if (terminal.requestId !== req.requestId) githubFail('RECOVERY_CLAIM_RECEIPT_MISMATCH')
  return terminalResponse(terminal, key.privateJwk, clock(now))
}
