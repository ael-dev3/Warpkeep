import { githubFail, recoveryRealmBindingProjectionFromArmed } from './config.js'
import { signRecoveryClaimJws, verifyRecoveryAuthorizationJws } from './crypto.js'
import { recheckGitHubEvidenceMetadata } from './githubEvidence.js'
import { verifyGitHubWorkflowIdentity } from './githubOidc.js'
import { RECOVERY_AUDIENCE, RECOVERY_ISSUER } from './protocol.js'
import { observeRecoveryRealmEvidence } from './realmEvidence.js'
import { RECOVERY_KEY_ID } from './recoveryPublicKey.js'
import { parseSignerControl, reconcileSignerControl } from './signerControl.js'
import type { SignerIssueRuntime } from './signerIssue.js'
import { snapshotSignerRequest } from './signerRequests.js'
import { validateSignerSecrets } from './signerSecrets.js'

export async function claimRecoveryAuthorization(request: unknown, controlInput: unknown, secretInput: unknown,
  controlLedger: Parameters<typeof reconcileSignerControl>[1], runtime: SignerIssueRuntime,
  now: () => number): Promise<Readonly<{ claimReceiptJws: string }>> {
  const req = snapshotSignerRequest('claim', request)
  const config = parseSignerControl(controlInput)
  const control = Object.freeze({ RECOVERY_ENABLED: String(config.enabled), RECOVERY_AUTHORIZATION_EPOCH: String(config.authorizationEpoch),
    RECOVERY_ARMING_MANIFEST: JSON.stringify(config.arming) })
  if (!config.enabled || req.requestId !== config.arming.requestId) githubFail('RECOVERY_SIGNER_CONTROL_INVALID')
  let previous = -1
  const clock = () => {
    const value = now()
    if (!Number.isSafeInteger(value) || value < 0 || value < previous || value > Number.MAX_SAFE_INTEGER - 1200) githubFail('RECOVERY_SIGNER_TIME_INVALID')
    previous = value
    return value
  }
  const secrets = await validateSignerSecrets(secretInput)
  await verifyRecoveryAuthorizationJws(req.authorizationJws, clock())
  const identity = await verifyGitHubWorkflowIdentity({ token: req.oidcToken, candidateCommit: req.candidateCommit,
    environment: runtime.githubApp, fetch: runtime.fetch, nowSeconds: clock() })
  const locators = Object.freeze({ requestId: req.requestId, candidateCommit: req.candidateCommit,
    sourceVerifyRunId: req.sourceVerifyRunId, sourceVerifyRunAttempt: req.sourceVerifyRunAttempt, artifactId: req.artifactId })
  let authority = await reconcileSignerControl(control, controlLedger)
  const ledger = runtime.requestLedger(req.requestId)
  const retained = await ledger.readIssued({ control: authority, locators, identity, now: clock() })
  if (retained.authorizationJws !== req.authorizationJws) githubFail('RECOVERY_LEDGER_JWS_MISMATCH')
  await recheckGitHubEvidenceMetadata({ githubMetadata: retained.authorization.githubMetadata,
    githubMetadataSha256: retained.authorization.githubMetadataSha256, environment: runtime.githubApp, fetch: runtime.fetch })
  const realm = await observeRecoveryRealmEvidence({ ...runtime.observation, rpcCredential: secrets.rpcCredential,
    binding: recoveryRealmBindingProjectionFromArmed(config.arming), armed: config.arming, candidateCommit: req.candidateCommit,
    fetch: runtime.fetch, phase: 'claim', sequence: 2 })
  authority = await reconcileSignerControl(control, controlLedger)
  const claimedAt = clock()
  if (realm.phase !== 'claim' || realm.observationSequence !== 2
    || !Number.isSafeInteger(realm.observedFrom) || realm.observedFrom < 0
    || !Number.isSafeInteger(realm.observedThrough) || realm.observedThrough < realm.observedFrom
    || realm.observedThrough > claimedAt || claimedAt - realm.observedFrom > 120) githubFail('RECOVERY_SIGNER_CLAIM_EVIDENCE_STALE')
  // The ledger commits and erases authorization bytes before receipt signing.
  const result = await ledger.claim({ control: authority, locators, identity, authorizationJws: req.authorizationJws,
    liveInvariantDigest: realm.liveInvariantDigest, claimSnapshotDigest: realm.evidenceSnapshotDigest, now: claimedAt })
  const a = result.authorization
  const c = result.claim
  const claimReceiptJws = await signRecoveryClaimJws({
    schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-claim-v1', iss: RECOVERY_ISSUER, aud: RECOVERY_AUDIENCE,
    sub: 'warpkeep-0.4.0-recovery-deployment-claim', kid: RECOVERY_KEY_ID,
    requestId: a.locators.requestId, authorizationJti: a.authorizationJti, authorizationJwsSha256: result.authorizationJwsSha256,
    pagesRunId: a.workflowIdentity.pagesRunId, pagesRunAttempt: a.workflowIdentity.pagesRunAttempt,
    sourceVerifyRunId: a.locators.sourceVerifyRunId, sourceVerifyRunAttempt: a.locators.sourceVerifyRunAttempt,
    candidateCommit: a.locators.candidateCommit, candidateTree: a.candidateTree, artifactId: a.locators.artifactId, artifactName: a.artifactName,
    githubArtifactArchiveSha256: a.githubArtifactArchiveSha256, innerArtifactTarSha256: a.innerArtifactTarSha256,
    contentManifestSha256: a.contentManifestSha256, deploymentAttestationSha256: a.deploymentAttestationSha256,
    operation: a.operation, canonicalOrigin: a.canonicalOrigin, authorizationEpoch: a.authorizationEpoch,
    claimSequence: c.claimSequence, claimedAt: c.claimedAt, claimDeadline: c.claimDeadline,
    iat: c.claimedAt, nbf: c.claimedAt, exp: c.claimedAt + 120,
  }, secrets.privateJwk)
  return Object.freeze({ claimReceiptJws })
}
