export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-deploy-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION: '4.110.0';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_REVIEWED_B0_SOURCE_COMMIT:
  '308f901d91a1fb68d90f157a2ec164ed1acaf51d';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_PREEXISTING_SECRET_BINDING_NAMES:
  readonly ['ADMIN_TOKEN_SECRET', 'FARCASTER_RPC_URL', 'FARCASTER_RPC_URL_SECONDARY', 'NOTIFICATION_OPERATOR_SECRET', 'SESSION_COOKIE_KEY', 'SIGNING_KEY_JWK'];
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_PLAYER_CANARY_SECRET_BINDING:
  'PLAYER_CANARY_OWNER_FID';

export class AuthBridgeNotificationPreparedDeployError extends Error {
  readonly code: string;
  readonly deploymentMayHaveChanged: boolean;
  constructor(code: string, deploymentMayHaveChanged?: boolean);
}

export function authBridgeNotificationPreparedVersionContract(
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

export function attestAuthBridgeNotificationPreparedVersion(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
  }>,
): Readonly<Record<string, unknown>>;

export function attestAuthBridgeNotificationPreparedDeployment(
  options: Readonly<{
    value: unknown;
    contract: Readonly<Record<string, unknown>>;
    versionId: string;
    versionCreatedAt: string;
    now: Date;
  }>,
): Readonly<Record<string, unknown>>;

export function executeAuthBridgeNotificationPreparedDeployAdapter(
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
        phase: 'prepared' | 'remote-reconcile-started' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | 'upload-adjudication-required' | null;
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
    assertCanStartWrite: (phase: 'upload' | 'release') => true | Promise<true>;
    clock?: () => Date;
  }>,
): Promise<Readonly<Record<string, unknown>>>;

export function prepareAndWriteAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    adminToken: string;
    expectedBridgeSourceCommit: string;
    expectedPredecessorBridgeSourceCommit: string;
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
  }>,
): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>>;
