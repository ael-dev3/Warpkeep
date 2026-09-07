export interface DeploymentAttestationIdentity {
  candidateCommit: string;
  candidateTree: string;
  recoveryAuthorizationCoreSha256: string;
  sourceClosureProfile: string;
  sourceClosureSha256: string;
}
type Input = Readonly<{ distRoot: string; identity: Readonly<DeploymentAttestationIdentity> }>;
/** Byte derivation only; does not authenticate source, install files, or authorize deployment. */
export function deriveWarpkeepDeploymentAttestation(options: Input): Readonly<{ path: string; bytes: Uint8Array }>;
export function verifyWarpkeepDeploymentAttestation(options: Input): Readonly<{ deploymentAttestationSha256: string; contentManifestSha256: string }>;
/** Exclusive install and readback in a disposable build; no source authentication or deployment authority. */
export function installWarpkeepDeploymentAttestation(options: Input): Readonly<{ deploymentAttestationSha256: string; contentManifestSha256: string }>;
