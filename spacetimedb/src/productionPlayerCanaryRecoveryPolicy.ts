export type ProductionPlayerCanaryRecoveryDisposition =
  | 'recall-required'
  | 'return-in-progress'
  | 'terminal-evidence-candidate'
  | 'terminal-evidence-impossible';

export function productionPlayerCanaryStructuralEvidenceCandidate(input: Readonly<{
  terminalSafe: boolean;
  observedAtMicros: bigint;
  notAfterMicros: bigint;
  dispatchReceiptCount: number;
  correlatedRecallReceiptCount: number;
  noOpRecallReceiptCount: number;
  unexpectedReceiptCount: number;
}>): boolean {
  return input.terminalSafe
    && input.observedAtMicros < input.notAfterMicros
    && input.dispatchReceiptCount === 4
    && input.correlatedRecallReceiptCount === 4
    && input.noOpRecallReceiptCount === 0
    && input.unexpectedReceiptCount === 0;
}

export function productionPlayerCanaryRecoveryDisposition(input: Readonly<{
  terminalSafe: boolean;
  structuralEvidenceCandidate: boolean;
  outboundWorkerCount: number;
  gatheringWorkerCount: number;
  returningWorkerCount: number;
}>): ProductionPlayerCanaryRecoveryDisposition {
  if (input.structuralEvidenceCandidate) return 'terminal-evidence-candidate';
  if (input.outboundWorkerCount > 0 || input.gatheringWorkerCount > 0) {
    return 'recall-required';
  }
  if (input.returningWorkerCount > 0) return 'return-in-progress';
  return 'terminal-evidence-impossible';
}
