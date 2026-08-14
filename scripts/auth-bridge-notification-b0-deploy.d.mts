export class AuthBridgeNotificationB0DeployEntrypointError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function attestAuthBridgeNotificationB0DeployCheckout(
  options: Readonly<{
    repositoryRoot: string;
    sourceCommit: string;
  }>,
): Promise<string>;

export function createAuthBridgeNotificationB0GithubWritePermit(
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

export function runAuthBridgeNotificationB0Deploy(
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
