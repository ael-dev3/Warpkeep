export interface RecoveryWorkflowSession {
  persistClaim(privateRoot: string): Readonly<{ claimDeadline: number }>;
  checkDeploymentBoundary(): Promise<Readonly<{ authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number }>>;
  finish(endpoint: 'complete' | 'reconcile'): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number }>>;
  dispose(): void;
}
/** Caller verifies source/artifact context and provisions private storage; no deployment or process-resume effect. */
export function beginRecoveryWorkflowSession(bindingSource: string, expectedSource: string): Promise<Readonly<RecoveryWorkflowSession>>;
