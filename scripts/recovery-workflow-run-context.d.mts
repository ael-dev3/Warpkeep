/** Read-only metadata cross-check. Does not authenticate OIDC, artifacts or deployment authority. */
export function readRecoveryWorkflowRunContext(): Promise<Readonly<{
  pagesRunId: string; pagesRunAttempt: string; sourceVerifyRunId: string;
  sourceVerifyRunAttempt: string; candidateCommit: string;
}>>;
/** Exact run-scoped artifact metadata; archive contents must still be independently verified. */
export function readRecoveryWorkflowArtifactMetadata(): Promise<Awaited<ReturnType<typeof readRecoveryWorkflowRunContext>> & Readonly<{
  artifactId: string; artifactName: string; artifactSize: number; advertisedArchiveSha256: string; artifactEtag: string;
}>>;
