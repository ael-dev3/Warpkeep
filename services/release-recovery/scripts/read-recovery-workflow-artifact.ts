import { join } from 'node:path';
import { inspectPagesArtifact } from '../src/archive.js';
import { githubRedirect } from '../src/http.js';
import { readRecoveryWorkflowArtifactMetadata } from '../../../scripts/recovery-workflow-run-context.mjs';
import { readRecoveryAttestationSource } from '../../../scripts/recovery-attestation-source.mjs';
import { verifyWarpkeepDeploymentAttestation } from '../../../scripts/generate-warpkeep-deployment-attestation.mjs';
import { readLocalBindingBoundedFile } from '../../../scripts/local-binding-bounded-file.mjs';

const fail = (): never => { throw new Error('RECOVERY_WORKFLOW_ARTIFACT_INVALID'); };

/** Local workflow composition. No deployment, caller coordinates or artifact overrides. */
export async function readRecoveryWorkflowArtifact(...args: readonly unknown[]): Promise<Readonly<{
  bindingSource: string; contextSource: string;
}>> {
  let token: string | undefined;
  let attestationBytes: Uint8Array | undefined;
  let bindingBytes: Buffer | undefined;
  try {
    if (args.length !== 0) fail();
    const root = process.cwd();
    const identity = readRecoveryAttestationSource(root);
    const metadata = await readRecoveryWorkflowArtifactMetadata();
    if (metadata.candidateCommit !== identity.candidateCommit) fail();
    const local = verifyWarpkeepDeploymentAttestation({ distRoot: join(root, 'dist'), identity });
    token = process.env.GITHUB_TOKEN;
    if (typeof token !== 'string' || !/^[\x21-\x7e]{1,16384}$/u.test(token)) fail();
    const response = await githubRedirect(globalThis.fetch,
      `https://api.github.com/repos/ael-dev3/Warpkeep/actions/artifacts/${metadata.artifactId}/zip`, `Bearer ${token}`);
    token = undefined;
    const artifact = await inspectPagesArtifact(response, identity, undefined, { archiveByteLength: metadata.artifactSize });
    attestationBytes = artifact.deploymentAttestationBytes;
    if (artifact.githubArtifactArchiveSha256 !== metadata.advertisedArchiveSha256
        || artifact.deploymentAttestationSha256 !== local.deploymentAttestationSha256
        || artifact.contentManifestSha256 !== local.contentManifestSha256) fail();
    // Re-fetch metadata only: never download the archive a second time.
    if (JSON.stringify(await readRecoveryWorkflowArtifactMetadata()) !== JSON.stringify(metadata)
        || JSON.stringify(readRecoveryAttestationSource(root)) !== JSON.stringify(identity)
        || JSON.stringify(verifyWarpkeepDeploymentAttestation({ distRoot: join(root, 'dist'), identity }))
          !== JSON.stringify(local)) fail();
    bindingBytes = readLocalBindingBoundedFile(join(root, 'config/releases/0.4.0-sealed-launch.json'),
      { maximumBytes: 2 * 1024 * 1024 }).body;
    const bindingSource = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bindingBytes);
    // The final committed-source read also checks this exact working binding.
    if (JSON.stringify(readRecoveryAttestationSource(root)) !== JSON.stringify(identity)) fail();
    const contextSource = JSON.stringify({ pagesRunId: metadata.pagesRunId, pagesRunAttempt: metadata.pagesRunAttempt,
      sourceVerifyRunId: metadata.sourceVerifyRunId, sourceVerifyRunAttempt: metadata.sourceVerifyRunAttempt,
      candidateCommit: identity.candidateCommit, candidateTree: identity.candidateTree, artifactId: metadata.artifactId,
      githubArtifactArchiveSha256: artifact.githubArtifactArchiveSha256, innerArtifactTarSha256: artifact.innerArtifactTarSha256,
      contentManifestSha256: artifact.contentManifestSha256, deploymentAttestationSha256: artifact.deploymentAttestationSha256 });
    return Object.freeze({ bindingSource, contextSource });
  } catch { return fail(); }
  finally { token = undefined; attestationBytes?.fill(0); bindingBytes?.fill(0); }
}
