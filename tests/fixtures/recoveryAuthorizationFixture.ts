import { createRecoveryActivationBinding } from '../../scripts/recovery-activation-candidate.mjs';
import { recoveryBindingCandidate } from './recoveryBindingCandidate';

// Synthetic public-coordinate fixture only; never deployment evidence.
export function recoveryAuthorizationFixture() {
  const b = createRecoveryActivationBinding(`${JSON.stringify(recoveryBindingCandidate(), null, 2)}\n`);
  const context = { pagesRunId: '123', pagesRunAttempt: '1', sourceVerifyRunId: '456', sourceVerifyRunAttempt: '2',
    candidateCommit: 'a'.repeat(40), candidateTree: 'c'.repeat(40), artifactId: '789',
    githubArtifactArchiveSha256: '6'.repeat(64), innerArtifactTarSha256: '7'.repeat(64),
    contentManifestSha256: '8'.repeat(64), deploymentAttestationSha256: '9'.repeat(64) };
  const payload = {
    schemaVersion: 1, profile: 'warpkeep-0.4.0-recovery-authorization-v1',
    iss: 'https://release-auth.warpkeep.com', aud: 'warpkeep-0.4.0-sealed-launch',
    sub: 'warpkeep-0.4.0-recovery-deployment', kid: 'warpkeep-0.4.0-recovery-2026-09-03-1',
    requestId: b.recoveryAuthorizationRequestId, jti: '123e4567-e89b-42d3-a456-426614174005',
    authorizationEpoch: b.recoveryAuthorizationEpoch, repository: 'ael-dev3/Warpkeep',
    repositoryId: '1273513252', repositoryOwnerId: '183124839', ref: 'refs/heads/main',
    workflowRef: 'ael-dev3/Warpkeep/.github/workflows/deploy-pages.yml@refs/heads/main',
    workflowSha: context.candidateCommit, environment: 'github-pages', eventName: 'workflow_run',
    pagesRunId: context.pagesRunId, pagesRunAttempt: context.pagesRunAttempt,
    sourceVerifyRunId: context.sourceVerifyRunId, sourceVerifyRunAttempt: context.sourceVerifyRunAttempt,
    predecessorCommit: b.preparationSourceCommit, candidateCommit: context.candidateCommit,
    candidateTree: context.candidateTree, sourceClosureProfile: b.sourceClosureProfile,
    sourceClosureSha256: b.sourceClosureSha256, recoveryAuthorizationCoreSha256: b.recoveryAuthorizationCoreSha256,
    artifactId: context.artifactId, artifactName: 'github-pages-recovery-123-1',
    githubArtifactArchiveSha256: context.githubArtifactArchiveSha256, innerArtifactTarSha256: context.innerArtifactTarSha256,
    contentManifestSha256: context.contentManifestSha256, deploymentAttestationSha256: context.deploymentAttestationSha256,
    releaseVersion: '0.4.0', operation: 'github-pages-production-deploy', canonicalOrigin: 'https://warpkeep.com',
    authWorker: 'warpkeep-auth-bridge', genesis001Database: b.g001DatabaseIdentity,
    genesis002Database: b.g002DatabaseIdentity, ptrDatabase: b.ptrDatabaseIdentity,
    historicalGenesis001ReceiptStatus: 'unavailable',
    historicalGenesis001ReceiptExpectedSha256: '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63',
    g001ReleaseVersion: '0.3.43', g001PlayerAccessEnabled: true, g001AdmissionStateMutationsEnabled: false,
    g001AccessRequestSubmissionsEnabled: false, g001BaselineAbiSha256: b.g001BaselineAbiSha256,
    g002Sealed: true, g002PlayerCount: 0, g002GeneralAdmissionCount: 0,
    ptrSingletonOwnerCount: 1, ptrGeneralAdmissionCount: 0,
    observedFrom: 1000, observedThrough: 1001, issuanceEvidenceSnapshotDigest: 'd'.repeat(64),
    liveInvariantDigest: 'e'.repeat(64), iat: 1010, nbf: 1010, exp: 1910,
  };
  return { bindingSource: `${JSON.stringify(b, null, 2)}\n`, context, payload };
}
