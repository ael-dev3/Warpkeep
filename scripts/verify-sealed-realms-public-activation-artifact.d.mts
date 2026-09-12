export class SealedRealmsPublicActivationArtifactVerificationError
  extends Error {
  readonly code: string;
}

export function verifySealedRealmsPublicActivationArtifact(): Buffer;
/** Format/privacy validation only; does not authenticate a deployment. */
export function verifySealedRealmsPublicActivationBytes(input: Uint8Array): Buffer;
