export class AuthBridgeNotificationPreparedDeployEntrypointError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function attestAuthBridgeNotificationPreparedDeployCheckout(
  options: Readonly<{
    repositoryRoot: string;
    sourceCommit: string;
  }>,
): Promise<string>;

export function createAuthBridgeNotificationPreparedGithubWritePermit(
  options: Readonly<{
    githubToken: string;
    sourceCommit: string;
    runId: string;
    runAttempt: string | number;
    repositoryRoot: string;
    fetchImpl?: typeof fetch;
    isInterrupted?: () => boolean;
    attestCheckout?: (input: Readonly<{
      repositoryRoot: string;
      sourceCommit: string;
    }>) => string | Promise<string>;
  }>,
): (phase: 'upload' | 'release') => Promise<true>;

export function runAuthBridgeNotificationPreparedDeploy(
  options?: Readonly<{
    environment?: NodeJS.ProcessEnv;
    fetchImpl?: typeof fetch;
    repositoryRoot?: string;
    nodeExecutable?: string;
    wranglerEntrypoint?: string;
    clock?: () => Date;
  }>,
): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>>;

export const authBridgeNotificationPreparedDeployTestSeams: Readonly<{
  copyAndScrubEnvironment: (environment: NodeJS.ProcessEnv) => Readonly<Record<string, string>>;
  settleGitInspections: <Value>(
    inspections: readonly Promise<Value>[],
  ) => Promise<readonly Value[]>;
}>;
