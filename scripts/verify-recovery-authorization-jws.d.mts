/** Runtime context must be independently verified. Keep the derived claim context private. */
export function verifyRecoveryAuthorization(compact: string, bindingSource: string, expectedSource: string, nowSeconds: number): Readonly<{
  claimExpectedSource: string; issuedAt: number; expiresAt: number;
}>;
/** Consumes private input. The returned claim context must never be logged or published. */
export function verifyRecoveryAuthorizationFromStdin(input: import('node:stream').Readable): Promise<Readonly<{
  claimExpectedSource: string; issuedAt: number; expiresAt: number;
}>>;
