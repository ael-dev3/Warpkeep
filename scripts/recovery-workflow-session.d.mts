export interface RecoveryWorkflowSession {
  checkDeploymentBoundary(): Promise<Readonly<{ authorizationEpoch: number; claimSequence: number; issuedAt: number; expiresAt: number }>>;
  finish(endpoint: 'complete' | 'reconcile'): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number }>>;
  dispose(): void;
}
/** Caller verifies source/artifact context. A preflighted allocator is invoked
 * only after the signed claim returns; an existing private directory is also supported. */
export function beginRecoveryWorkflowSession(bindingSource: string, expectedSource: string, privateRoot: string | (() => string)): Promise<Readonly<RecoveryWorkflowSession>>;
