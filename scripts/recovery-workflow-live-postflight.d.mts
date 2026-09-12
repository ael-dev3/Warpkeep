/** Exact public artifact check, not complete release acceptance. */
export function verifyRecoveryWorkflowLivePostflight(): Promise<Readonly<{
  liveAttestationVerified: true; deploymentAttestationSha256: string;
}>>;
