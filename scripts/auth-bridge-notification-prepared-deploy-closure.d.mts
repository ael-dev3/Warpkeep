export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH:
  'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json';

export class AuthBridgeNotificationPreparedDeployClosureError extends Error {
  readonly code: string;
}

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS:
  readonly string[];

export function verifyAuthBridgeNotificationPreparedDeployClosure(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<{
  profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
  memberCount: number;
  manifestSha256: string;
  repositoryRoot: string;
  ownerUid: number;
}>;

export function assertAuthBridgeNotificationPreparedDeployClosureAuthority<
  T extends Readonly<{
    profile: 'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
    memberCount: number;
    manifestSha256: string;
    repositoryRoot: string;
    ownerUid: number;
  }>,
>(authority: T, options: Readonly<{ repositoryRoot: string }>): T;
