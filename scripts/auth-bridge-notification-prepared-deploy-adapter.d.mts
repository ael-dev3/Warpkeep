export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_PROFILE:
  'warpkeep-auth-bridge-notification-prepared-deploy-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_WRANGLER_VERSION: '4.110.0';

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
    prepareUpload: (contract: Readonly<Record<string, unknown>>) => Promise<Readonly<{ mode: 'migration' | 'version' }>>;
    uploadVersion: (
      contract: Readonly<Record<string, unknown>>,
      plan: Readonly<{ mode: 'migration' | 'version' }>,
    ) => Promise<Readonly<{ versionId?: string }>>;
    reconcileVersion: (contract: Readonly<Record<string, unknown>>) => Promise<readonly string[]>;
    inspectVersion: (versionId: string) => Promise<unknown>;
    releaseVersion: (input: Readonly<{ versionId: string; percentage: 100; message: string }>) => Promise<void>;
    inspectDeployment: () => Promise<unknown>;
    journal: Readonly<{
      inspect: () => Readonly<{
        phase: 'prepared' | 'upload-invoked' | 'uploaded' | 'release-uncertain' | 'release-invoked' | 'completed' | null;
      }>;
      prepared: (contract: Readonly<Record<string, unknown>>) => Promise<void>;
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

export function prepareAndWriteAuthBridgeNotificationPreparedReceipt(
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
  }>,
): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>>;
