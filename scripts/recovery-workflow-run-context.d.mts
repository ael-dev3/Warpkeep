/** Read-only metadata cross-check. Does not authenticate OIDC, artifacts or deployment authority. */
export function readRecoveryWorkflowRunContext(): Promise<Readonly<{
  pagesRunId: string; pagesRunAttempt: string; sourceVerifyRunId: string;
  sourceVerifyRunAttempt: string; candidateCommit: string;
}>>;
