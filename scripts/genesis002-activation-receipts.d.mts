export class Genesis002ActivationReceiptError extends Error {
  readonly code: string;
}

export function genesis002PublishReceiptDigest(receipt: unknown): string;
export function genesis002ProductionImportReceiptDigest(receipt: unknown): string;
export function genesis002SealedLiveReceiptDigest(receipt: unknown): string;
