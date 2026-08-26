export function verifyAuthBridgeNotificationB0StaticPolicy(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<{
  packageVersion: '0.3.43';
  exactSixSecretsRequired: true;
  playerCanarySecretForbidden: true;
  nondeployingVersionUploadRequired: true;
  oneDeploymentPostRequired: true;
  dedicatedPersistentRunnerRequired: true;
  guardedRecoveryRequired: true;
  executableSecurityClosureMemberCount: number;
}>;

export const authBridgeNotificationB0PolicyTestSeams:
  | Readonly<{
    assertExactPredecessorReattestationCount(runtimeSource: string): void;
    assertInertReleaseIdentity(
      workflowSource: string,
      packageDocument: Readonly<{ version?: unknown }>,
    ): void;
  }>
  | undefined;
