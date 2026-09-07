/** Strict pre-deployment claim gate. Expected coordinates must come from verified authorization. */
export function verifyRecoveryClaimReceipt(compact: string, expectedSource: string, nowSeconds: number): Readonly<{
  authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number;
}>;
/** Never deployment authority. Validates retained receipt until its signed twenty-minute ledger deadline. */
export function verifyRecoveryClaimCorrelation(compact: string, expectedSource: string, nowSeconds: number): Readonly<{
  purpose: 'reconciliation-only'; authorizationEpoch: number; claimedAt: number; claimDeadline: number;
}>;
/** Consumes a private canonical stdin envelope; checks the wall clock after EOF. */
export function verifyRecoveryClaimReceiptFromStdin(input: import('node:stream').Readable): Promise<Readonly<{
  authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number;
}>>;
