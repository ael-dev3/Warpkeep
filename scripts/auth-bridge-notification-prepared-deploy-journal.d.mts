export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_STATE_CHILD:
  'bridge-prepared-deploy-journal-v3';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-read-only-recovery-v1';

export type AuthBridgeNotificationPreparedReadOnlyRecoveryHead = Readonly<{
  schemaVersion: 1;
  profile: typeof AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE;
  sourceCommit: string;
  runId: string;
  runAttempt: number;
  priorPreparedReceiptDigest: string;
  priorCompletedJournalHeadDigest: string;
  preparedReceiptDigest: string;
  deploymentId: string;
  workerVersionId: string;
  bridgeSourceCommit: string;
  ptrDatabaseIdentity: string;
  ptrBindingDigest: string;
  controlPlaneAttestationDigest: string;
  publicAttestationDigest: string;
  privateAttestationDigest: string;
  ptrBindingAttestationDigest: string;
  completedAt: string;
  noDeploy: true;
  outcome: 'verified-read-only-recovery';
}>;

export class AuthBridgeNotificationPreparedDeployJournalError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export function resolveExistingAuthBridgeNotificationPreparedDeployJournal(
  options: Readonly<{
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
  }>,
): Readonly<{
  journalHeadDigest: string;
  profile: 'warpkeep-auth-bridge-notification-prepared-deploy-journal-v3'
    | typeof AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE;
  outcome: 'verified' | 'verified-after-release-error'
    | 'verified-read-only-recovery';
  predecessorDigest: string | null;
  runId: string;
  runAttempt: number;
  completedAt: string;
  sourceCommit: string;
  workerVersionId: string;
}>;

export function writeAuthBridgeNotificationPreparedReadOnlyRecoveryHead(
  options: Readonly<{
    head: AuthBridgeNotificationPreparedReadOnlyRecoveryHead;
    repositoryRoot: string;
    reportedHome?: string;
    randomBytesImpl?: (size: number) => Buffer;
    processIdentity?: string;
    processIdentityProbe?: (pid: number) => Readonly<{
      state: 'present' | 'absent' | 'ambiguous';
      identity?: string;
    }>;
  }>,
): Readonly<{
  path: string;
  journalHeadDigest: string;
  result: 'installed' | 'unchanged';
}>;

export function resolveAuthBridgeNotificationPreparedRecoveryJournalAuthority(
  options: Readonly<{
    repositoryRoot: string;
    reportedHome?: string;
  }>,
): Readonly<{
  schemaVersion: 1 | null;
  journalHeadDigest: string;
  profile: typeof AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_JOURNAL_PROFILE
    | typeof AUTH_BRIDGE_NOTIFICATION_PREPARED_READ_ONLY_RECOVERY_PROFILE;
  outcome: 'verified' | 'verified-after-release-error'
    | 'verified-read-only-recovery';
  predecessorDigest: string | null;
  runId: string;
  runAttempt: number;
  completedAt: string;
  sourceCommit: string;
  workerVersionId: string;
  priorPreparedReceiptDigest: string | null;
  preparedReceiptDigest: string | null;
  deploymentId: string | null;
  ptrDatabaseIdentity: string | null;
  ptrBindingDigest: string | null;
  bridgeSourceCommit: string | null;
  controlPlaneAttestationDigest: string | null;
  publicAttestationDigest: string | null;
  privateAttestationDigest: string | null;
  ptrBindingAttestationDigest: string | null;
  noDeploy: true | null;
}>;

export type AuthBridgeNotificationPreparedDeployJournal = Readonly<{
  operationId: string;
  directory: string;
  inspect: () => Readonly<{
    operationId: string;
    contractDigest: string;
    phase: 'prepared' | 'remote-reconcile-started' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | 'upload-adjudication-required' | null;
    phases: readonly string[];
    uploadMode: 'version' | null;
    predecessorDeploymentId: string | null;
    predecessorVersionId: string | null;
    uploadAdjudicationReason: 'invalid-upload-response' | 'definitive-provider-rejection' | null;
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
  uploadAdjudicationRequired: (input: Readonly<{
    reason: 'invalid-upload-response' | 'definitive-provider-rejection';
  }>) => Promise<void>;
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
