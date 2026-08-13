export function deriveAuthBridgeNotificationPreparedDeployClosurePaths(
  options?: Readonly<{ repositoryRoot?: string }>,
): readonly string[];

export function verifyAuthBridgeNotificationPreparedDeployClosurePolicy(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<{
  profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
  memberCount: number;
  manifestSha256: string;
  repositoryRoot: string;
  ownerUid: number;
}>;
