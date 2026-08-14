export const AUTH_BRIDGE_NOTIFICATION_B0_DEPLOY_PROFILE:
  'warpkeep-auth-bridge-notification-b0-deploy-v1';
export const AUTH_BRIDGE_NOTIFICATION_B0_WRANGLER_VERSION: '4.110.0';
export const AUTH_BRIDGE_NOTIFICATION_B0_SECRET_BINDING_NAMES:
  readonly ['ADMIN_TOKEN_SECRET', 'FARCASTER_RPC_URL', 'FARCASTER_RPC_URL_SECONDARY', 'NOTIFICATION_OPERATOR_SECRET', 'SESSION_COOKIE_KEY', 'SIGNING_KEY_JWK'];

export class AuthBridgeNotificationB0DeployError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export function authBridgeNotificationB0VersionContract(
  options: Readonly<{
    accountId: string;
    zoneId: string;
    sourceCommit: string;
    sourceDigest: string;
    beforeModes: Readonly<{
      bridgeSourceCommit: string;
      publicAuthEnabled: boolean;
      accessExpectedFidRequired: boolean;
    }>;
  }>,
): Readonly<Record<string, unknown>>;

export function attestAuthBridgeNotificationB0Version(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
  }>,
): Readonly<Record<string, unknown>>;

export function attestAuthBridgeNotificationB0Deployment(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
    versionId: string;
    versionCreatedAt: string;
    now: Date;
  }>,
): Readonly<Record<string, unknown>>;

export function executeAuthBridgeNotificationB0DeployAdapter(
  options: Readonly<{
    contract: Readonly<Record<string, unknown>>;
    prepareUpload: (contract: Readonly<Record<string, unknown>>) => Promise<Readonly<{
      mode: 'version';
      predecessorDeploymentId: string;
      predecessorVersionId: string;
    }>>;
    uploadVersion: (
      contract: Readonly<Record<string, unknown>>,
      plan: Readonly<{
        mode: 'version';
        predecessorDeploymentId: string;
        predecessorVersionId: string;
      }>,
    ) => Promise<Readonly<{ versionId: string }>>;
    reconcileVersion: (contract: Readonly<Record<string, unknown>>) => Promise<readonly string[]>;
    inspectVersion: (versionId: string) => Promise<unknown>;
    assertPredecessorStable: (predecessor: Readonly<{
      deploymentId: string;
      versionId: string;
    }>) => Promise<void>;
    releaseVersion: (input: Readonly<{
      versionId: string;
      predecessorDeploymentId: string;
      predecessorVersionId: string;
      percentage: 100;
      message: string;
    }>) => Promise<void>;
    inspectDeployment: () => Promise<unknown>;
    journal: Readonly<{
      inspect: () => Readonly<{
        phase: 'prepared' | 'remote-reconcile-started' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | 'receipt-publication-intent' | 'receipt-published' | null;
        predecessorDeploymentId: string | null;
        predecessorVersionId: string | null;
        completedDeployment?: Readonly<Record<string, unknown>> | null;
      }>;
      prepared: (contract: Readonly<Record<string, unknown>>) => Promise<void>;
      remoteReconcileStarted: (input: Readonly<Record<string, unknown>>) => Promise<void>;
      uploadInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
      uploaded: (version: Readonly<Record<string, unknown>>) => Promise<void>;
      releaseUncertain: (input: Readonly<Record<string, unknown>>) => Promise<void>;
      releaseInvoked: (input: Readonly<Record<string, unknown>>) => Promise<void>;
      completed: (deployment: Readonly<Record<string, unknown>>) => Promise<void>;
    }>;
    assertCanStartWrite: (phase: 'upload' | 'release') => true | Promise<true>;
    clock?: () => Date;
  }>,
): Promise<Readonly<Record<string, unknown>>>;

export function prepareAndWriteAuthBridgeNotificationB0Receipt(
  options: Readonly<{
    adminToken: string;
    expectedBridgeSourceCommit: string;
    fetchImpl?: typeof fetch;
    clock?: () => Date;
    lifetimeMilliseconds?: number;
    repositoryRoot: string;
    reportedHome?: string;
    deploy: (beforeModes: Readonly<{
      bridgeSourceCommit: string;
      publicAuthEnabled: boolean;
      accessExpectedFidRequired: boolean;
    }>) => Promise<void>;
    withPublicationJournal: <T>(
      operation: (journal: Readonly<{
        inspect: () => Readonly<{
          receiptPublicationIntent: Readonly<{
            receiptBytesBase64: string;
            receiptDigest: string;
          }> | null;
          publishedReceipt: Readonly<{ receiptDigest: string }> | null;
        }>;
        receiptPublicationIntent: (input: Readonly<{
          receiptBytesBase64: string;
          receiptDigest: string;
        }>) => Promise<void>;
        receiptPublished: (input: Readonly<{
          receiptDigest: string;
        }>) => Promise<void>;
      }>) => T | Promise<T>,
    ) => Promise<T>;
    testOnlyAfterDeployCompleted?: () => void | Promise<void>;
    testOnlyAfterReceiptPublicationIntent?: () => void | Promise<void>;
    testOnlyAfterReceiptWrite?: (
      result: Readonly<{
        path: string;
        receiptDigest: string;
        result: 'installed' | 'unchanged';
      }>,
    ) => void | Promise<void>;
  }>,
): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>>;
