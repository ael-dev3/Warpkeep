/** Strict pre-deployment claim gate. Expected coordinates must come from verified authorization. */
export function verifyRecoveryClaimReceipt(compact: string, expectedSource: string, nowSeconds: number): Readonly<{
  authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number;
}>;
