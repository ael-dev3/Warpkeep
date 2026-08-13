export const AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_PATH:
  'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json';

export class AuthBridgeNotificationPreparedInstalledToolchainError extends Error {
  readonly code: string;
}

export function createAuthBridgeNotificationPreparedInstalledToolchainCandidate(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<Record<string, unknown>>;

export function verifyAuthBridgeNotificationPreparedInstalledToolchain(
  options?: Readonly<{
    repositoryRoot?: string;
    nodeExecutable?: string;
    wranglerEntrypoint?: string;
  }>,
): Readonly<{
  profile: 'warpkeep-auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1';
  sourceClosureManifestSha256: string;
  runnerIdentityDigest: string;
  resolverNamespaceEntryCount: number;
  resolverNamespaceSha256: string;
  entryCount: number;
  totalFileBytes: number;
  treeSha256: string;
  wranglerEntrypoint: string;
}>;

export function assertAuthBridgeNotificationPreparedInstalledToolchainAuthority<
  T extends ReturnType<
    typeof verifyAuthBridgeNotificationPreparedInstalledToolchain
  >,
>(
  authority: T,
  options: Readonly<{ repositoryRoot: string; nodeExecutable?: string }>,
): T;
