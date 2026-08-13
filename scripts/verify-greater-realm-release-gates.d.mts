export type GreaterRealmReleaseGateVerificationOptions = Readonly<{
  fetchImpl?: typeof fetch;
  now?: Date;
}>;

export type GreaterRealmReleaseGateVerificationDependencies = Readonly<{
  inspectPreparedReceiptByDigest?: (
    options: Readonly<{
      receiptDigest: string;
      repositoryRoot: string;
      fetchImpl?: typeof fetch;
      now?: Date;
    }>,
  ) => Promise<Readonly<{
    receiptDigest: string;
    receipt: Readonly<{ bridgeSourceCommit: string }>;
    liveAttestation: Readonly<{
      bridgeSourceCommit: string;
      notificationDeliveryContractDigest: string;
      notificationDeliveryEnabled: boolean;
      notificationTransportConfigured: boolean;
      admissionNotificationStoreConfigured: boolean;
      notificationClientCount: number;
    }>;
  }>>;
  assertBridgeSourceAncestor?: (
    bridgeSourceCommit: string,
    repositoryRoot: string,
  ) => void | Promise<void>;
  assertPagesLiveRootSourceAncestor?: (
    pagesSourceCommit: string,
    repositoryRoot: string,
  ) => void | Promise<void>;
}>;

export const GREATER_REALM_NOTIFICATION_RELEASE_PHASE: Readonly<{
  PAGES_PRESENTATION_ACTIVATION: 'notification-pages-presentation-activation';
  DURABLE_FINAL: 'notification-durable-final';
}>;

export type GreaterRealmNotificationReleaseAuthority = Readonly<{
  phase:
    | typeof GREATER_REALM_NOTIFICATION_RELEASE_PHASE.PAGES_PRESENTATION_ACTIVATION
    | typeof GREATER_REALM_NOTIFICATION_RELEASE_PHASE.DURABLE_FINAL;
  notificationPreparedReceiptDigest: string | null;
  notificationPreparedBridgeSourceCommit: string | null;
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
}>;

export type GreaterRealmReleaseGateEnvelope = Readonly<{
  entryAgreementReleaseStatus: 'review-only-rollout-blocked' | 'production-approved';
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
  clientPresentationAllowed: boolean;
  serverPresentationAllowed: boolean;
  entryAgreementApproved: boolean;
  additivePublishApproved: boolean;
  importForwardFixApproved: boolean;
  activationForwardFixApproved: boolean;
  clientActivationApproved: boolean;
  admissionNotificationsApproved: boolean;
  hermesNotificationDeliveryApproved: boolean;
  pagesNotificationsEnabled: boolean;
  notificationPreparedReceiptDigest: string | null;
  notificationPreparedBridgeSourceCommit: string | null;
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
}>;

export function parseGreaterRealmNotificationReleaseAuthority(
  value: unknown,
): GreaterRealmNotificationReleaseAuthority;

export function verifyGreaterRealmReleaseGateEnvelope(
  value: unknown,
  options?: GreaterRealmReleaseGateVerificationOptions,
  dependencies?: GreaterRealmReleaseGateVerificationDependencies,
): Promise<string>;

export function verifyGreaterRealmReleaseGateState(
  options?: GreaterRealmReleaseGateVerificationOptions,
  dependencies?: GreaterRealmReleaseGateVerificationDependencies,
): Promise<string>;
