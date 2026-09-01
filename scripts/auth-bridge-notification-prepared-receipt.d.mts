import type { AuthBridgeReleaseAttestation } from './auth-bridge-config-attestation.mjs';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KIND:
  'warpkeep-auth-bridge-notification-prepared-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_KEYS: readonly [
  'schemaVersion',
  'kind',
  'bridgeOrigin',
  'bridgeSourceCommit',
  'notificationDeliveryContractDigest',
  'notificationClientCount',
  'notificationDeliveryEnabled',
  'notificationTransportConfigured',
  'admissionNotificationStoreConfigured',
  'publicAuthEnabledBefore',
  'publicAuthEnabledAfter',
  'accessExpectedFidRequiredBefore',
  'accessExpectedFidRequiredAfter',
  'hermesExecutionApproved',
  'pagesPresentationEnabled',
  'liveAttestationDigest',
  'preparedAt',
  'expiresAt',
];
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RECEIPT_LIFETIME_MILLISECONDS:
  number;
export const AUTH_BRIDGE_RELEASE_ATTESTATION_URL:
  'https://auth.warpkeep.com/v1/release-attestation';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_STATE_CHILD:
  'bridge-prepared-receipts-v1';
export const AUTH_BRIDGE_NOTIFICATION_DELIVERY_CONTRACT_DIGEST:
  '13429727ea5257946e3b659e07f912cf8cd81985fadecb03c63311994a01f7d9';

export type AuthBridgeNotificationPreparedReceipt = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-auth-bridge-notification-prepared-v1';
  bridgeOrigin: 'https://auth.warpkeep.com';
  bridgeSourceCommit: string;
  notificationDeliveryContractDigest: string;
  notificationClientCount: 1;
  notificationDeliveryEnabled: boolean;
  notificationTransportConfigured: true;
  admissionNotificationStoreConfigured: true;
  publicAuthEnabledBefore: boolean;
  publicAuthEnabledAfter: boolean;
  accessExpectedFidRequiredBefore: boolean;
  accessExpectedFidRequiredAfter: boolean;
  hermesExecutionApproved: false;
  pagesPresentationEnabled: false;
  liveAttestationDigest: string;
  preparedAt: string;
  expiresAt: string;
}>;

declare const authenticatedPreparedReceipt: unique symbol;
export type AuthenticatedAuthBridgeNotificationPreparedReceipt =
  AuthBridgeNotificationPreparedReceipt & Readonly<{
    [authenticatedPreparedReceipt]: true;
  }>;

export type AuthBridgeNotificationPreparedWriteResult = Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>;

export class AuthBridgeNotificationPreparedReceiptError extends Error {
  readonly code: string;
  constructor(code: string);
}

/** Reads exactly one existing eligible receipt without creating or repairing state. */
export function resolveExistingAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
    expectedSourceCommit: string;
    now?: Date;
  }>,
): Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptDigest: string;
}>;

export function ensureAuthBridgeNotificationPreparedReceiptDirectory(
  options: Readonly<{
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
    /** Test-only seam for a directory-entry disappearance race. */
    testOnlyBeforeDedicatedEntryMetadata?: (path: string) => void;
  }>,
): string;

export function parseAuthBridgeNotificationPreparedReceipt(
  value: unknown,
): AuthBridgeNotificationPreparedReceipt;

export function canonicalAuthBridgeReleaseAttestationDigest(
  attestation: AuthBridgeReleaseAttestation,
): string;

export function createAuthBridgeNotificationPreparedReadOnlyRecoveryReceipt(
  options: Readonly<{
    priorReceipt: AuthBridgeNotificationPreparedReceipt;
    liveAttestation: AuthBridgeReleaseAttestation;
    preparedAt: Date;
    now?: Date;
    lifetimeMilliseconds?: number;
  }>,
): AuthenticatedAuthBridgeNotificationPreparedReceipt;

export function canonicalAuthBridgeNotificationPreparedReceiptPublication(
  receipt: AuthBridgeNotificationPreparedReceipt,
): Readonly<{
  receiptBytesBase64: string;
  receiptDigest: string;
}>;

export function writePrivateAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    receipt: AuthenticatedAuthBridgeNotificationPreparedReceipt;
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
    now?: Date;
  }>,
): AuthBridgeNotificationPreparedWriteResult;

export function readPrivateAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    receiptPath: string;
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
  }>,
): AuthBridgeNotificationPreparedReceipt;

export function fetchFreshAuthBridgeReleaseAttestation(
  options?: Readonly<{
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<Readonly<{
  attestation: AuthBridgeReleaseAttestation;
  digest: string;
  responseDate: string;
}>>;

export function prepareAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    adminToken: string;
    expectedPtrSpacetimeDbDatabase: string;
    deploy: (preservedModes: Readonly<{
      bridgeSourceCommit: string;
      publicAuthEnabled: boolean;
      accessExpectedFidRequired: boolean;
    }>) => void | Promise<void>;
    expectedBridgeSourceCommit: string;
    expectedPredecessorBridgeSourceCommit?: string;
    fetchImpl?: typeof fetch;
    clock?: () => Date;
    lifetimeMilliseconds?: number;
  }>,
): Promise<AuthenticatedAuthBridgeNotificationPreparedReceipt>;

export function prepareAuthBridgeNotificationB0Receipt(
  options: Readonly<{
    adminToken: string;
    deploy: (preservedModes: Readonly<{
      bridgeSourceCommit: string;
      publicAuthEnabled: boolean;
      accessExpectedFidRequired: boolean;
    }>) => void | Promise<void>;
    expectedBridgeSourceCommit: string;
    fetchImpl?: typeof fetch;
    clock?: () => Date;
    lifetimeMilliseconds?: number;
  }>,
): Promise<AuthenticatedAuthBridgeNotificationPreparedReceipt>;

export function authenticateAuthBridgeNotificationPreparedReceiptForPublication(
  options: Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    adminToken: string;
    expectedBridgeSourceCommit: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<AuthenticatedAuthBridgeNotificationPreparedReceipt>;

export function verifyAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    receipt: AuthBridgeNotificationPreparedReceipt;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  liveAttestation: AuthBridgeReleaseAttestation;
}>>;

export function inspectPrivateAuthBridgeNotificationPreparedReceipt(
  options: Readonly<{
    receiptPath: string;
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  liveAttestation: AuthBridgeReleaseAttestation;
}>>;

export function inspectPrivateAuthBridgeNotificationPreparedReceiptByDigest(
  options: Readonly<{
    receiptDigest: string;
    repositoryRoot: string;
    /** Test-only substitute for the OS account home. */
    reportedHome?: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  liveAttestation: AuthBridgeReleaseAttestation;
  receiptDigest: string;
}>>;

export function resolveExpiredAuthBridgeNotificationPreparedReceiptByDigest(
  options: Readonly<{
    receiptDigest: string;
    expectedSourceCommit: string;
    repositoryRoot: string;
    reportedHome?: string;
    now?: Date;
  }>,
): Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptDigest: string;
}>;

export function resolveFreshAuthBridgeNotificationPreparedReceiptByDigest(
  options: Readonly<{
    receiptDigest: string;
    expectedSourceCommit: string;
    repositoryRoot: string;
    reportedHome?: string;
    now?: Date;
  }>,
): Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptDigest: string;
}>;

export function resolvePendingAuthBridgeNotificationPreparedRecoveryReceipt(
  options: Readonly<{
    expectedSourceCommit: string;
    excludedReceiptDigest: string;
    repositoryRoot: string;
    reportedHome?: string;
    now?: Date;
  }>,
): Readonly<{
  receipt: AuthBridgeNotificationPreparedReceipt;
  receiptDigest: string;
}> | null;
