import { githubFail, type GitHubAppEnvironment } from './config.js'
import { signRecoveryAuthorizationJws, type RecoveryAuthorizationPayload } from './crypto.js'
import { loadGitHubCandidateEvidence } from './githubEvidence.js'
import { verifyGitHubWorkflowIdentity } from './githubOidc.js'
import type { ReleaseRecoveryAuthorizationLedgerV2 } from './ledgerDurableObjectV2.js'
import { RECOVERY_AUDIENCE, RECOVERY_ISSUER } from './protocol.js'
import { observeRecoveryRealmEvidence, type ObserveRecoveryRealmEvidenceInput } from './realmEvidence.js'
import { RECOVERY_KEY_ID } from './recoveryPublicKey.js'
import { parseSignerControl, reconcileSignerControl } from './signerControl.js'
import { snapshotSignerRequest } from './signerRequests.js'
import { validateSignerSecrets } from './signerSecrets.js'

export type SignerIssueRuntime = Readonly<{
  githubApp: GitHubAppEnvironment
  fetch: typeof fetch
  observation: Pick<ObserveRecoveryRealmEvidenceInput, 'bridge' | 'pins' | 'expectedRawModuleDefV10Fixtures'>
  requestLedger(requestId: string): Pick<ReleaseRecoveryAuthorizationLedgerV2,
    'status' | 'installArming' | 'reserveIssue' | 'finalizeIssue' | 'readIssued' | 'claim'>
}>

function clock(now: () => number): number {
  const value = now()
  if (!Number.isSafeInteger(value) || value < 0 || value > Number.MAX_SAFE_INTEGER - 900) githubFail('RECOVERY_SIGNER_TIME_INVALID')
  return value
}

/** Inputs besides request are private server dependencies, not RPC payload fields. */
export async function issueRecoveryAuthorization(request: unknown, controlInput: unknown, secretInput: unknown,
  controlLedger: Parameters<typeof reconcileSignerControl>[1], runtime: SignerIssueRuntime,
  now: () => number): Promise<Readonly<{ authorizationJws: string }>> {
  const req = snapshotSignerRequest('issue', request)
  const config = parseSignerControl(controlInput)
  // Reconstruct from the immutable parsed configuration before any await.
  const control = Object.freeze({ RECOVERY_ENABLED: String(config.enabled),
    RECOVERY_AUTHORIZATION_EPOCH: String(config.authorizationEpoch), RECOVERY_ARMING_MANIFEST: JSON.stringify(config.arming) })
  if (!config.enabled || req.requestId !== config.arming.requestId) githubFail('RECOVERY_SIGNER_CONTROL_INVALID')
  const secrets = await validateSignerSecrets(secretInput)
  const identity = await verifyGitHubWorkflowIdentity({ token: req.oidcToken, candidateCommit: req.candidateCommit,
    environment: runtime.githubApp, fetch: runtime.fetch, nowSeconds: clock(now) })
  const locators = Object.freeze({ requestId: req.requestId, candidateCommit: req.candidateCommit,
    sourceVerifyRunId: req.sourceVerifyRunId, sourceVerifyRunAttempt: req.sourceVerifyRunAttempt, artifactId: req.artifactId })
  let authority = await reconcileSignerControl(control, controlLedger)
  const ledger = runtime.requestLedger(req.requestId)
  const status = await ledger.status()
  if (status.role !== 'request' || status.requestId !== req.requestId) githubFail('RECOVERY_SIGNER_CONTROL_INVALID')
  if (status.state === 'issued') {
    const retained = await ledger.readIssued({ control: authority, locators, identity, now: clock(now) })
    return Object.freeze({ authorizationJws: retained.authorizationJws })
  }
  if (status.state !== null && status.state !== 'armed' && status.state !== 'issuing') githubFail('RECOVERY_LEDGER_REISSUE_DENIED')
  if (status.state === null || status.state === 'armed') await ledger.installArming({ arming: config.arming, control: authority })
  const github = await loadGitHubCandidateEvidence({ identity, candidateCommit: req.candidateCommit,
    artifactId: req.artifactId, sourceVerifyRunId: req.sourceVerifyRunId, sourceVerifyRunAttempt: req.sourceVerifyRunAttempt,
    bindingRequestId: req.requestId, armed: config.arming, environment: runtime.githubApp, fetch: runtime.fetch })
  try {
    let payload: RecoveryAuthorizationPayload | undefined
    if (status.state !== 'issuing') {
      const realm = await observeRecoveryRealmEvidence({ ...runtime.observation, rpcCredential: secrets.rpcCredential,
        binding: github.realmBinding, armed: config.arming, candidateCommit: req.candidateCommit,
        fetch: runtime.fetch, phase: 'issue', sequence: 1 })
      if (realm.phase !== 'issue' || realm.observationSequence !== 1) githubFail('RECOVERY_SIGNER_ISSUE_EVIDENCE_INVALID')
      const iat = clock(now)
      payload = Object.freeze({
        schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-authorization-v1',
        iss: RECOVERY_ISSUER, aud: RECOVERY_AUDIENCE, sub: 'warpkeep-0.4.0-recovery-deployment', kid: RECOVERY_KEY_ID,
        requestId: req.requestId, jti: crypto.randomUUID(), authorizationEpoch: config.authorizationEpoch,
        repository: identity.repository, repositoryId: identity.repositoryId, repositoryOwnerId: identity.repositoryOwnerId,
        ref: identity.ref, workflowRef: identity.workflowRef, workflowSha: identity.workflowSha,
        environment: identity.environment, eventName: identity.eventName, pagesRunId: identity.pagesRunId, pagesRunAttempt: identity.pagesRunAttempt,
        sourceVerifyRunId: github.sourceVerifyRunId, sourceVerifyRunAttempt: github.sourceVerifyRunAttempt,
        predecessorCommit: github.parentCommit, candidateCommit: req.candidateCommit, candidateTree: github.candidateTree,
        sourceClosureProfile: config.arming.sourceClosureProfile, sourceClosureSha256: github.sourceClosureSha256,
        recoveryAuthorizationCoreSha256: realm.recoveryAuthorizationCoreSha256,
        artifactId: github.pagesArtifactId, artifactName: github.pagesArtifactName,
        githubArtifactArchiveSha256: github.githubArtifactArchiveSha256, innerArtifactTarSha256: github.innerArtifactTarSha256,
        contentManifestSha256: github.contentManifestSha256, deploymentAttestationSha256: github.deploymentAttestationSha256,
        releaseVersion: config.arming.releaseVersion, operation: config.arming.operation, canonicalOrigin: config.arming.canonicalOrigin,
        authWorker: config.arming.authWorker, genesis001Database: realm.genesis001Database, genesis002Database: realm.genesis002Database, ptrDatabase: realm.ptrDatabase,
        historicalGenesis001ReceiptStatus: 'unavailable', historicalGenesis001ReceiptExpectedSha256: '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
        g001ReleaseVersion: realm.g001ReleaseVersion, g001PlayerAccessEnabled: realm.g001PlayerAccessEnabled,
        g001AdmissionStateMutationsEnabled: realm.g001AdmissionStateMutationsEnabled, g001AccessRequestSubmissionsEnabled: realm.g001AccessRequestSubmissionsEnabled,
        g001BaselineAbiSha256: realm.g001BaselineAbiSha256, g002Sealed: realm.g002Sealed, g002PlayerCount: realm.g002PlayerCount,
        g002GeneralAdmissionCount: realm.g002GeneralAdmissionCount, ptrSingletonOwnerCount: realm.ptrSingletonOwnerCount, ptrGeneralAdmissionCount: realm.ptrGeneralAdmissionCount,
        observedFrom: realm.observedFrom, observedThrough: realm.observedThrough,
        issuanceEvidenceSnapshotDigest: realm.evidenceSnapshotDigest, liveInvariantDigest: realm.liveInvariantDigest,
        iat, nbf: iat, exp: iat + 900,
      })
    }
    authority = await reconcileSignerControl(control, controlLedger)
    const reservedAt = clock(now)
    if (payload !== undefined) payload = Object.freeze({ ...payload, iat: reservedAt, nbf: reservedAt, exp: reservedAt + 900 })
    const reserved = await ledger.reserveIssue({ control: authority, locators, identity,
      ...(payload === undefined ? {} : { payload }), githubMetadata: github.githubMetadata,
      githubMetadataSha256: github.githubMetadataSha256, now: reservedAt })
    const authorizationJws = await signRecoveryAuthorizationJws(reserved.reservedPayload, secrets.privateJwk)
    const digestBytes = new TextEncoder().encode(authorizationJws)
    let authorizationJwsSha256: string
    try { authorizationJwsSha256 = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', digestBytes)), byte => byte.toString(16).padStart(2, '0')).join('') }
    finally { digestBytes.fill(0) }
    authority = await reconcileSignerControl(control, controlLedger)
    const retained = await ledger.finalizeIssue({ control: authority, locators, identity, authorizationJws, authorizationJwsSha256, now: clock(now) })
    return Object.freeze({ authorizationJws: retained.authorizationJws })
  } finally { github.recoveryBindingBytes.fill(0); github.protectedWorkflowBytes.fill(0) }
}
