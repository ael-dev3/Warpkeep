/** A fresh enabled status is necessary, but is not deployment authorization. */
export function verifyRecoveryStatus(compact: string, expectedEpoch: number, nowSeconds: number): Readonly<{
  authorizationEpoch: number; issuedAt: number; expiresAt: number;
}>;
/** Consumes and closes a binary stdin stream; checks the real clock after EOF. */
export function verifyRecoveryStatusFromStdin(input: import('node:stream').Readable, expectedEpoch: number): Promise<Readonly<{
  authorizationEpoch: number; issuedAt: number; expiresAt: number;
}>>;
