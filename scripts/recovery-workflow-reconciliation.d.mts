/** Reconciliation only: cannot issue, claim, deploy, or enable a deployment boundary. */
export function resumeRecoveryWorkflowReconciliation(privateRoot: string, contextSource: string): Readonly<{
  reconcile(): Promise<Readonly<{ outcome: 'completed' | 'not-deployed'; completedAt: number; authorizationEpoch: number; issuedAt: number; expiresAt: number; terminalJws: string }>>;
  dispose(): void;
}>;
/** Before build: reconcile only an earlier attempt; never issue or deploy. */
export function reconcilePriorRecoveryWorkflowAttempt(): Promise<Readonly<{ resumed: false }> | Readonly<{ resumed: true; outcome: 'completed' | 'not-deployed' }>>;
