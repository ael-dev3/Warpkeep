/** Immediate preflight only; not a reusable deployment authorization. No side effect. */
export function checkPersistedRecoveryDeploymentBoundary(privateRoot: string, bindingSource: string, contextSource: string): Promise<Readonly<{
  authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number;
}>>;
