/** Audit evidence only, not deployment authority. Expectations must come from verified authorization. */
export function verifyRecoveryTerminal(compact: string, expectedSource: string, nowSeconds: number): Readonly<{
  outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number;
}>;
