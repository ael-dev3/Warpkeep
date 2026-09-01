const COMMIT = /^[0-9a-f]{40}$/u;

/**
 * Task 7–9 replace this fixed boundary with workflow-attested Verify evidence.
 * Until then, a local checkout or caller-supplied SHA can never attest itself.
 */
export function verifySealedRealmsProductionWorkflowEvidence(commit) {
  const code = COMMIT.test(commit ?? '')
    ? 'SEALED_REALMS_TASK_7_WORKFLOW_EVIDENCE_UNAVAILABLE'
    : 'SEALED_REALMS_WORKFLOW_EVIDENCE_SOURCE_INVALID';
  const error = new Error(code);
  error.name = 'SealedRealmsProductionWorkflowEvidenceError';
  error.code = code;
  throw error;
}
