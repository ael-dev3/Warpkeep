export class SealedLaunchActivationGeneratorError extends Error {
  readonly code: string;
}

export function createSealedLaunchActivationBindingFromEvidence(
  envelope: unknown,
): Readonly<Record<string, unknown>>;

export function generateSealedLaunchActivationBindingFromDescriptor(
  descriptor?: number,
): Readonly<Record<string, unknown>>;
