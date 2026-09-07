/** Matching public attestation plus signed completed outcome, not full release acceptance. */
export function runRecoveryWorkflowPostflight(): Promise<Readonly<{
  outcome: 'completed'; deploymentAttestationSha256: string; terminalJws: string;
}>>;
