export const NOTIFICATION_PAGES_PRIVATE_DEPLOY_LAUNCHER_PROFILE:
  'warpkeep-notification-pages-private-deploy-launcher-v1';

export class NotificationPagesPrivateDeployLauncherError extends Error {
  readonly code: string;
}

export function runNotificationPagesPrivateDeployLauncher(
  arguments_: readonly string[],
  environment: NodeJS.ProcessEnv,
  dependencies?: Readonly<{
    attestToolchain?: (options: Readonly<{
      repositoryRoot: string;
      nodeExecutable: string;
    }>) => Readonly<Record<string, unknown>>;
    attestSourceClosure?: (options: Readonly<{
      repositoryRoot: string;
    }>) => Readonly<Record<string, unknown>>;
    loadOperator?: () => Promise<Readonly<Record<string, unknown>>>;
  }>,
): Promise<void>;
