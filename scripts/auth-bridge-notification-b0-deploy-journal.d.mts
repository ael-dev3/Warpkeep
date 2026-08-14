export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_PROFILE:
  'warpkeep-auth-bridge-notification-b0-deploy-journal-v1';
export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_JOURNAL_STATE_CHILD:
  'bridge-notification-b0-deploy-journal-v1';

export class AuthBridgeNotificationB0DeployJournalError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export type AuthBridgeNotificationB0DeployJournal = Readonly<{
  operationId: string;
  directory: string;
  inspect: () => Readonly<{
    operationId: string;
    contractDigest: string;
    phase: 'prepared' | 'remote-reconcile-started' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | 'receipt-publication-intent' | 'receipt-published' | null;
    phases: readonly string[];
    uploadMode: 'version' | null;
    predecessorDeploymentId: string | null;
    predecessorVersionId: string | null;
    completedDeployment: Readonly<Record<string, unknown>> | null;
    receiptPublicationIntent: Readonly<{
      receiptBytesBase64: string;
      receiptDigest: string;
    }> | null;
    publishedReceipt: Readonly<{ receiptDigest: string }> | null;
  }>;
  prepared: (contract: Readonly<Record<string, unknown>>) => Promise<void>;
  remoteReconcileStarted: (input: Readonly<{
    predecessorDeploymentId: string;
    predecessorVersionId: string;
    sourceCommit: string;
    sourceDigest: string;
    versionTag: string;
  }>) => Promise<void>;
  uploadInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  uploaded: (version: Readonly<Record<string, unknown>>) => Promise<void>;
  releaseUncertain: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  releaseInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
  completed: (deployment: Readonly<Record<string, unknown>>) => Promise<void>;
  receiptPublicationIntent: (input: Readonly<{
    receiptBytesBase64: string;
    receiptDigest: string;
  }>) => Promise<void>;
  receiptPublished: (input: Readonly<{
    receiptDigest: string;
  }>) => Promise<void>;
}>;

export function withAuthBridgeNotificationB0DeployJournal<T>(
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
    operation: (journal: AuthBridgeNotificationB0DeployJournal) => T | Promise<T>;
  }>,
): Promise<T>;
