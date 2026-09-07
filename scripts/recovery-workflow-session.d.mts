export interface RecoveryWorkflowSession {
  checkDeploymentBoundary(): Promise<Readonly<{ authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number }>>;
  finish(endpoint: 'complete' | 'reconcile'): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number }>>;
  dispose(): void;
}
/** Caller verifies source/artifact context and provisions private storage; no deployment or process-resume effect. */
export function beginRecoveryWorkflowSession(bindingSource: string, expectedSource: string, privateRoot: string): Promise<Readonly<RecoveryWorkflowSession>>;
