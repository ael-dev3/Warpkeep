/** Runtime context must be independently verified. Keep the derived claim context private. */
export function verifyRecoveryAuthorization(compact: string, bindingSource: string, expectedSource: string, nowSeconds: number): Readonly<{
  claimExpectedSource: string; issuedAt: number; expiresAt: number;
}>;
