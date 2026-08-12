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
}>;

export function verifyGreaterRealmReleaseGateEnvelope(
  value: unknown,
  options?: GreaterRealmReleaseGateVerificationOptions,
  dependencies?: GreaterRealmReleaseGateVerificationDependencies,
): Promise<string>;

export function verifyGreaterRealmReleaseGateState(
  options?: GreaterRealmReleaseGateVerificationOptions,
  dependencies?: GreaterRealmReleaseGateVerificationDependencies,
): Promise<string>;
