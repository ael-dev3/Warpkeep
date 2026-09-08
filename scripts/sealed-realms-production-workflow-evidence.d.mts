declare const workflowEvidence: unique symbol;
export type SealedRealmsProductionWorkflowEvidence = Readonly<{ [workflowEvidence]: true }>;
export function createSealedRealmsProductionWorkflowEvidence(input: Readonly<{
  workflowInputSha: string;
}>): Promise<SealedRealmsProductionWorkflowEvidence>;
export function refreshSealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence): Promise<void>;
export function verifySealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence, commit: string): Readonly<{ verifiedSha: string }>;
export function revokeSealedRealmsProductionWorkflowEvidence(scope: SealedRealmsProductionWorkflowEvidence): void;
