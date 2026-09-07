import { createHash } from 'node:crypto';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseRecoveryBindingV2 } from './recovery-activation-candidate.mjs';
import { verifyRecoverySignedPayload } from './recovery-authorization-protocol.mjs';
const CONTEXT_KEYS = ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt',
  'candidateCommit', 'candidateTree', 'artifactId', 'githubArtifactArchiveSha256',
  'innerArtifactTarSha256', 'contentManifestSha256', 'deploymentAttestationSha256'];
const BINDING_FIELDS = Object.freeze({
  iss: 'recoveryIssuer', kid: 'recoveryKeyId', requestId: 'recoveryAuthorizationRequestId',
  authorizationEpoch: 'recoveryAuthorizationEpoch', repository: 'recoveryRepository',
  repositoryId: 'recoveryRepositoryId', repositoryOwnerId: 'recoveryRepositoryOwnerId',
  ref: 'recoveryRef', workflowRef: 'recoveryWorkflowRef', environment: 'recoveryEnvironment',
  predecessorCommit: 'preparationSourceCommit', sourceClosureProfile: 'sourceClosureProfile',
  sourceClosureSha256: 'sourceClosureSha256', recoveryAuthorizationCoreSha256: 'recoveryAuthorizationCoreSha256',
  releaseVersion: 'recoveryReleaseVersion', operation: 'recoveryOperation', canonicalOrigin: 'recoveryCanonicalOrigin',
  authWorker: 'recoveryAuthWorker', genesis001Database: 'g001DatabaseIdentity',
  genesis002Database: 'g002DatabaseIdentity', ptrDatabase: 'ptrDatabaseIdentity',
  g001ReleaseVersion: 'g001ReleaseVersion', g001PlayerAccessEnabled: 'g001PlayerAccessEnabled',
  g001AdmissionStateMutationsEnabled: 'g001AdmissionStateMutationsEnabled',
  g001AccessRequestSubmissionsEnabled: 'g001AccessRequestSubmissionsEnabled', g001BaselineAbiSha256: 'g001BaselineAbiSha256',
  ptrSingletonOwnerCount: 'ptrOwnerAnchorRows',
});
const fail = () => { throw new Error('RECOVERY_AUTHORIZATION_INVALID'); };
const integer = value => Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0);
const hex = (value, length) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`, 'u').test(value);
const decimal = value => typeof value === 'string' && /^[1-9][0-9]*$/u.test(value);
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);

/** Verifies signed authority against independently established context; does not acquire or claim it. */
export function verifyRecoveryAuthorization(...args) {
  try {
    const [compact, bindingSource, expectedSource, now] = args;
    if (args.length !== 4 || !integer(now) || typeof expectedSource !== 'string' || expectedSource.length > 16384) fail();
    const expected = JSON.parse(expectedSource);
    if (expected === null || typeof expected !== 'object' || Array.isArray(expected)
      || Object.keys(expected).length !== CONTEXT_KEYS.length
      || CONTEXT_KEYS.some((key, index) => Object.keys(expected)[index] !== key)
      || JSON.stringify(expected) !== expectedSource) fail();
    const binding = parseRecoveryBindingV2(bindingSource);
    const p = verifyRecoverySignedPayload(compact, 'authorization');
    if (CONTEXT_KEYS.some(key => p[key] !== expected[key])
      || Object.entries(BINDING_FIELDS).some(([key, source]) => p[key] !== binding[source])) fail();
    if (p.schemaVersion !== 1 || p.profile !== 'warpkeep-0.4.0-recovery-authorization-v1'
      || p.aud !== 'warpkeep-0.4.0-sealed-launch' || p.sub !== 'warpkeep-0.4.0-recovery-deployment'
      || p.eventName !== 'workflow_run' || !uuid(p.jti)
      || ['pagesRunId', 'pagesRunAttempt', 'sourceVerifyRunId', 'sourceVerifyRunAttempt', 'artifactId'].some(key => !decimal(p[key]))
      || !hex(p.candidateCommit, 40) || !hex(p.candidateTree, 40) || p.workflowSha !== p.candidateCommit
      || p.pagesRunId === p.sourceVerifyRunId
      || p.artifactName !== `github-pages-recovery-${p.pagesRunId}-${p.pagesRunAttempt}`
      || ['githubArtifactArchiveSha256', 'innerArtifactTarSha256', 'contentManifestSha256',
        'deploymentAttestationSha256', 'issuanceEvidenceSnapshotDigest', 'liveInvariantDigest'].some(key => !hex(p[key], 64))
      || p.historicalGenesis001ReceiptStatus !== 'unavailable'
      || p.historicalGenesis001ReceiptExpectedSha256 !== '5a9629c7ee695abc2b2369921274dcaa9c618b747387b90f9444429ab8e81d63'
      || p.g002Sealed !== true || p.g002PlayerCount !== 0 || p.g002GeneralAdmissionCount !== 0 || p.ptrGeneralAdmissionCount !== 0
      || !integer(p.iat) || !integer(p.exp) || p.nbf !== p.iat || p.exp <= p.iat || p.exp - p.iat > 900
      || now < p.iat || now >= p.exp
      || !integer(p.observedFrom) || !integer(p.observedThrough)
      || p.observedFrom > p.observedThrough || p.observedThrough > p.iat || p.iat - p.observedFrom > 120) fail();
    // This private projection links the later receipt to the exact verified JWS bytes.
    const claimExpectedSource = JSON.stringify({ requestId: p.requestId, authorizationJti: p.jti,
      authorizationJwsSha256: createHash('sha256').update(compact).digest('hex'),
      pagesRunId: p.pagesRunId, pagesRunAttempt: p.pagesRunAttempt, sourceVerifyRunId: p.sourceVerifyRunId,
      sourceVerifyRunAttempt: p.sourceVerifyRunAttempt, candidateCommit: p.candidateCommit, candidateTree: p.candidateTree,
      artifactId: p.artifactId, artifactName: p.artifactName, githubArtifactArchiveSha256: p.githubArtifactArchiveSha256,
      innerArtifactTarSha256: p.innerArtifactTarSha256, contentManifestSha256: p.contentManifestSha256,
      deploymentAttestationSha256: p.deploymentAttestationSha256, operation: p.operation,
      canonicalOrigin: p.canonicalOrigin, authorizationEpoch: p.authorizationEpoch });
    return Object.freeze({ claimExpectedSource, issuedAt: p.iat, expiresAt: p.exp });
  } catch { fail(); }
}
let direct = false;
try { direct = Boolean(process.argv[1]) && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { /* imported */ }
if (direct) { process.stderr.write('RECOVERY_AUTHORIZATION_CLI_NOT_IMPLEMENTED\n'); process.exitCode = 1; }
