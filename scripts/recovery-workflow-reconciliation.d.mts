/** Reconciliation only: cannot issue, claim, deploy, or enable a deployment boundary. */
export function resumeRecoveryWorkflowReconciliation(privateRoot: string, contextSource: string): Readonly<{
  reconcile(): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number; terminalJws: string }>>;
  dispose(): void;
}>;
