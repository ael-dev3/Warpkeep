export class SealedLaunchActivationGeneratorError extends Error {
  readonly code: string;
}

export function ptrProductionPublishReceiptDigest(
  receipt: Readonly<Record<string, unknown>>,
): string;

export function ptrProductionAtlasImportReceiptDigest(
  receipt: Readonly<Record<string, unknown>>,
): string;

export function ptrOwnerProvisionReceiptDigest(
  receipt: Readonly<Record<string, unknown>>,
): string;

export function ptrSealedLiveReceiptDigest(
  receipt: Readonly<Record<string, unknown>>,
): string;

export function createSealedLaunchActivationBindingFromEvidence(
  envelope: unknown,
  testOnlyPreparationBootstrapAuthority?: Readonly<{
    preparationSourceCommit: string;
    moduleTreeId: string;
    bootstrapBlob: string;
    bootstrapSha256: string;
  }>,
): Readonly<Record<string, unknown>>;

export function generateSealedLaunchActivationBindingFromDescriptor(
  descriptor?: number,
  testOnlyPreparationBootstrapAuthority?: Readonly<{
    preparationSourceCommit: string;
    moduleTreeId: string;
    bootstrapBlob: string;
    bootstrapSha256: string;
  }>,
): Readonly<Record<string, unknown>>;
