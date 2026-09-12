export const ACTIVATION_GENERATION_RECEIPT_PROFILE:
  'warpkeep-sealed-realms-activation-generation-receipt-v1';
export type ActivationGenerationReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof ACTIVATION_GENERATION_RECEIPT_PROFILE;
  sourceCommit: string;
  sourceAuthorityDigest: string;
  operation: 'activation-evidence-generate';
  runId: string;
  runAttempt: number;
  activationEvidenceDigest: string;
  activationChainDigest: string;
  descriptorSha256: string;
  artifactSha256: string;
  artifactSchemaVersion: 1 | 2 | 3;
  artifactProfile: 'warpkeep-0.4.0-sealed-launch-v1' | 'warpkeep-0.4.0-sealed-launch-v2' | 'warpkeep-0.4.0-sealed-launch-ptr-update-v3';
  generatedAt: string;
  outcome: 'generated';
}>;
/** Data codecs; no file writes or authority creation. */
export function activationGenerationReceiptBytes(input: ActivationGenerationReceipt): Buffer;
export function parseActivationGenerationReceipt(input: Uint8Array): ActivationGenerationReceipt;
export function activationGenerationReceiptDigest(input: Uint8Array): string;
