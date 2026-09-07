/** A fresh enabled status is necessary, but is not deployment authorization. */
export function verifyRecoveryStatus(compact: string, expectedEpoch: number, nowSeconds: number): Readonly<{
  authorizationEpoch: number; issuedAt: number; expiresAt: number;
}>;
