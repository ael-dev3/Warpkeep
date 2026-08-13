export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-deploy-journal-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD:
  'bridge-prepared-deploy-journal-v1';

export class AuthBridgeNotificationPreparedDeployJournalError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type AuthBridgeNotificationPreparedDeployJournal = Readonly<{
  operationId: string;
  directory: string;
  inspect: () => Readonly<{
    operationId: string;
    contractDigest: string;
    phase: 'prepared' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | null;
    phases: readonly string[];
    uploadMode: 'migration' | 'version' | null;
  }>;
  prepared: (contract: Readonly<Record<string, unknown>>) => Promise<void>;
  uploadInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  uploaded: (version: Readonly<Record<string, unknown>>) => Promise<void>;
  releaseUncertain: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  releaseInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  completed: (deployment: Readonly<Record<string, unknown>>) => Promise<void>;
}>;

export function withAuthBridgeNotificationPreparedDeployJournal<T>(
  options: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    repositoryRoot: string;
    reportedHome?: string;
    runId: string;
    runAttempt: number;
    clock?: () => Date;
    randomBytesImpl?: (size: number) => Buffer;
    processIdentity?: string;
    processIdentityProbe?: (pid: number) => Readonly<{
      state: 'present' | 'absent' | 'ambiguous';
      identity?: string;
    }>;
    operation: (journal: AuthBridgeNotificationPreparedDeployJournal) => T | Promise<T>;
  }>,
): Promise<T>;
