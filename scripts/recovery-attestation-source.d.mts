import type { DeploymentAttestationIdentity } from './generate-warpkeep-deployment-attestation.mjs';
/** Local source consistency only; not GitHub protection, receipt or closure authentication. */
export function readRecoveryAttestationSource(repositoryRoot: string): Readonly<DeploymentAttestationIdentity>;
