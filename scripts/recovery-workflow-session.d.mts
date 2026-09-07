export interface RecoveryWorkflowSession {
  checkDeploymentBoundary(): Promise<Readonly<{ authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number }>>;
  finish(endpoint: 'complete' | 'reconcile'): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number }>>;
  dispose(): void;
}
/** In-memory composition. Caller must verify source/artifact context; no durable handoff or deployment effect. */
export function beginRecoveryWorkflowSession(bindingSource: string, expectedSource: string): Promise<Readonly<RecoveryWorkflowSession>>;
