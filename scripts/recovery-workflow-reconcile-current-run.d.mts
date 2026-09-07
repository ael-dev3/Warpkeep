/** Reconciliation acknowledgment only, not release acceptance or deployment authority. */
export function reconcileRecoveryWorkflowCurrentRun(): Promise<Readonly<{
  outcome: 'completed' | 'not-deployed';
}>>;
