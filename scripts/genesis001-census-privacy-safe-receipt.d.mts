export const GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE:
  'warpkeep-genesis-001-census-export-privacy-safe-v1';

export class Genesis001CensusPrivacySafeReceiptError extends Error {
  readonly code: string;
}

export function executeGenesis001CensusPrivacySafeReceipt(
  input: Readonly<{
    sourceCommit: string;
    censusPath: string;
    exporterReceiptPath: string;
    privateReceiptDirectory: string;
    randomBytes?: (size: number) => Uint8Array;
    spawn?: (...arguments_: readonly unknown[]) => unknown;
  }>,
  hooks?: Readonly<{
    afterCensusOpen?: () => void;
    beforeReceiptCreate?: () => void;
    afterReceiptCreate?: () => void;
  }>,
): Readonly<{
  profile: typeof GENESIS_001_CENSUS_PRIVACY_SAFE_RECEIPT_PROFILE;
  opaqueProofDigest: string;
  privateReceiptBasename: string;
}>;
