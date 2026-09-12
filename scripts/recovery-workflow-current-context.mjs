import { join } from 'node:path';
import { readRecoveryAttestationSource } from './recovery-attestation-source.mjs';
import { readRecoveryWorkflowArtifactMetadata } from './recovery-workflow-run-context.mjs';
import { verifyWarpkeepDeploymentAttestation } from './generate-warpkeep-deployment-attestation.mjs';
import { resolveRecoveryWorkflowPrivateDirectory } from './recovery-workflow-private-directory.mjs';
import { readRecoveryClaimHandoffHistory } from './recovery-claim-handoff.mjs';
import { readLocalBindingBoundedFile } from './local-binding-bounded-file.mjs';
const fail = () => { throw new Error('RECOVERY_WORKFLOW_CURRENT_CONTEXT_INVALID'); };

/** Private context only, not deployment authority. No archive download, caller
 * coordinates, new private directory, or authentication/ledger mutation. */
export async function readRecoveryWorkflowCurrentContext(...args) {
  let bindingBytes;
  try {
    if (args.length !== 0) fail();
    const root = process.cwd();
    const identity = readRecoveryAttestationSource(root);
    const metadata = await readRecoveryWorkflowArtifactMetadata();
    if (metadata.candidateCommit !== identity.candidateCommit) fail();
    const privateRoot = resolveRecoveryWorkflowPrivateDirectory(metadata.pagesRunId, metadata.pagesRunAttempt);
    const history = readRecoveryClaimHandoffHistory(privateRoot);
    if (history.purpose !== 'signed-history-only') fail();
    const historical = JSON.parse(history.contextSource);
    const local = verifyWarpkeepDeploymentAttestation({ distRoot: join(root, 'dist'), identity });
    // Only the inner TAR digest remains historical. It was signed together with
    // this exact immutable archive SHA-256; downloading again is forbidden.
    const contextSource = JSON.stringify({ pagesRunId: metadata.pagesRunId, pagesRunAttempt: metadata.pagesRunAttempt,
      sourceVerifyRunId: metadata.sourceVerifyRunId, sourceVerifyRunAttempt: metadata.sourceVerifyRunAttempt,
      candidateCommit: identity.candidateCommit, candidateTree: identity.candidateTree, artifactId: metadata.artifactId,
      githubArtifactArchiveSha256: metadata.advertisedArchiveSha256, innerArtifactTarSha256: historical.innerArtifactTarSha256,
      contentManifestSha256: local.contentManifestSha256, deploymentAttestationSha256: local.deploymentAttestationSha256 });
    if (contextSource !== history.contextSource) fail();
    if (JSON.stringify(await readRecoveryWorkflowArtifactMetadata()) !== JSON.stringify(metadata)
        || JSON.stringify(readRecoveryAttestationSource(root)) !== JSON.stringify(identity)
        || JSON.stringify(verifyWarpkeepDeploymentAttestation({ distRoot: join(root, 'dist'), identity })) !== JSON.stringify(local)
        || readRecoveryClaimHandoffHistory(privateRoot).contextSource !== contextSource) fail();
    bindingBytes = readLocalBindingBoundedFile(join(root, 'config/releases/0.4.0-sealed-launch.json'),
      { maximumBytes: 2 * 1024 * 1024 }).body;
    const bindingSource = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bindingBytes);
    if (JSON.stringify(readRecoveryAttestationSource(root)) !== JSON.stringify(identity)) fail();
    return Object.freeze({ privateRoot, bindingSource, contextSource });
  } catch { fail(); }
  finally { bindingBytes?.fill(0); }
}
