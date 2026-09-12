/** Build only: output bytes are not installed or authenticated release authority. */
export function buildRecoveryWorkflowArtifactModule(): Promise<Readonly<{
  bytes: Buffer; sha256: string; inputPaths: readonly string[];
}>>;
export function buildRecoveryWorkflowClaimModule(): ReturnType<typeof buildRecoveryWorkflowArtifactModule>;
