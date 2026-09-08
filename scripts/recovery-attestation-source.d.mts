import type { DeploymentAttestationIdentity } from './generate-warpkeep-deployment-attestation.mjs';
/** Bounded immutable Git-object validation only, not provider or receipt authentication. */
export function readRecoveryActivationGitSource(
  readGit: (arguments_: readonly string[]) => string | Uint8Array,
  candidateCommit: string,
): Readonly<{
  binding: Readonly<Record<string, unknown>>;
  identity: Readonly<DeploymentAttestationIdentity>;
}>;
/** Local source consistency only; not GitHub protection, receipt or closure authentication. */
export function readRecoveryAttestationSource(repositoryRoot: string): Readonly<DeploymentAttestationIdentity>;
