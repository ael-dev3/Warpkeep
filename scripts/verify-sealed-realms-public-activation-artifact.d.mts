export class SealedRealmsPublicActivationArtifactVerificationError
  extends Error {
  readonly code: string;
}

export function verifySealedRealmsPublicActivationArtifact(): Buffer;
