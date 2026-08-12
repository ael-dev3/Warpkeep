export const NOTIFICATION_PAGES_LIVE_RECEIPT_KIND:
  'warpkeep-notification-pages-live-v1';
export const NOTIFICATION_PAGES_LIVE_STATE_CHILD:
  'notification-pages-live-receipts-v1';
export const NOTIFICATION_PAGES_LIVE_PAGES_ORIGIN: 'https://warpkeep.com';
export const NOTIFICATION_PAGES_LIVE_BRIDGE_ORIGIN:
  'https://auth.warpkeep.com';
export const NOTIFICATION_PAGES_LIVE_PROTECTED_PATHS: readonly string[];

export class NotificationPagesLiveReceiptError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type NotificationPagesLiveSourceRelease = Readonly<{
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
}>;

export type NotificationPagesLivePreparedBinding = Readonly<{
  receiptDigest: string;
  bridgeOrigin: 'https://auth.warpkeep.com';
  bridgeSourceCommit: string;
  notificationDeliveryContractDigest: string;
  notificationClientCount: 1;
  notificationDeliveryEnabled: true;
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

export type NotificationPagesLiveReceipt = Readonly<{
  schemaVersion: 1;
  kind: typeof NOTIFICATION_PAGES_LIVE_RECEIPT_KIND;
  recordedAt: string;
  repository: 'ael-dev3/Warpkeep';
  handoff: Readonly<{
    digest: string;
    keyId: string;
    workflow: '.github/workflows/deploy-pages.yml';
    workflowRunId: string;
    workflowRunAttempt: string;
    createdAt: string;
    expiresAt: string;
    preparedReceiptDigest: string;
    activeV17EvidenceDigest: string;
    deployedModuleReceiptDigest: string;
    activeEvidenceMaximumAgeMilliseconds: number;
  }>;
  chain: Readonly<{
    generation: number;
    previousReceiptDigest: string | null;
    previousPagesSourceCommit: string | null;
  }>;
  pages: Readonly<{
    origin: 'https://warpkeep.com';
    sourceCommit: string;
    liveBuildSha: string;
    liveFrontendDigest: string;
    rootAssetCount: number;
    notificationsPresentationEnabled: true;
    hermesExecutionApprovedAtActivation: false;
  }>;
  bridge: Readonly<{
    origin: 'https://auth.warpkeep.com';
    sourceCommit: string;
    liveAttestationDigest: string;
    liveAttestation: Readonly<Record<string, unknown>>;
  }>;
  sourceRelease: NotificationPagesLiveSourceRelease;
  expectedFounderCount: number;
  preparedBinding: NotificationPagesLivePreparedBinding;
}>;

export type NotificationPagesPrivateHandoffExpectations = Readonly<{
  handoffPath: string;
  keyPath: string;
  expectedHandoffDigest: string;
  expectedKeyId: string;
  expectedWorkflowRunId: string;
  expectedWorkflowRunAttempt: string;
  expectedPagesSourceCommit: string;
  expectedFounderCount: number;
  expectedActiveEvidenceMaximumAgeMilliseconds: number;
  expectedPreparedReceiptDigest: string;
  expectedActiveV17EvidenceDigest: string;
  expectedDeployedModuleReceiptDigest: string;
  expectedBridgeSourceCommit: string;
}>;

export type NotificationPagesLiveInspection = Readonly<{
  path: string;
  receiptDigest: string;
  receipt: NotificationPagesLiveReceipt;
  preparedBinding: NotificationPagesLivePreparedBinding;
  chainRootReceiptDigest: string;
  chainRootPagesSourceCommit: string;
  liveAttestation: Readonly<Record<string, unknown>>;
}>;

export type NotificationPagesLiveCandidateAuthority =
  NotificationPagesLiveInspection & Readonly<{
    candidatePagesSourceCommit: string;
    livePagesSourceCommit: string;
  }> & (
    Readonly<{
      candidateAlreadyLive: true;
      candidateAuthorityPath: null;
      candidateAuthorityDigest: null;
      candidateAuthority: null;
    }>
    | Readonly<{
      candidateAlreadyLive: false;
      candidateAuthorityPath: string;
      candidateAuthorityDigest: string;
      candidateAuthority: Readonly<Record<string, unknown>>;
      candidatePreparedBinding: NotificationPagesLivePreparedBinding | null;
      candidateLiveAttestation: Readonly<Record<string, unknown>> | null;
    }>
  );

export function parseNotificationPagesLiveReceipt(
  value: unknown,
  options?: Readonly<{ now?: Date }>,
): NotificationPagesLiveReceipt;

export function ensureNotificationPagesLiveReceiptDirectory(options: Readonly<{
  directory: string;
  repositoryRoot: string;
}>): string;

export function defaultNotificationPagesLiveReceiptDirectory(): string;

export function writePrivateNotificationPagesLiveReceipt(options: Readonly<{
  directory: string;
  repositoryRoot: string;
  handoffExpectations: NotificationPagesPrivateHandoffExpectations;
  expectedNotificationsPresentationEnabled: true;
  expectedHermesExecutionApproved: false;
  fetchImpl?: typeof fetch;
  now?: Date;
  randomBytesImpl?: (size: number) => Buffer;
}>): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
  receipt: NotificationPagesLiveReceipt;
  preparedBinding: NotificationPagesLivePreparedBinding;
  chainRootReceiptDigest: string;
  chainRootPagesSourceCommit: string;
}>>;

export function inspectPrivateNotificationPagesLiveReceiptByPagesSourceCommit(
  options: Readonly<{
    directory: string;
    repositoryRoot: string;
    pagesSourceCommit: string;
    expectedChainRootReceiptDigest: string;
    expectedChainRootPagesSourceCommit: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
): Promise<NotificationPagesLiveInspection>;

export function inspectLatestPrivateNotificationPagesLiveReceiptForCandidate(
  options: Readonly<{
    directory: string;
    repositoryRoot: string;
    candidatePagesSourceCommit: string;
    expectedChainRootReceiptDigest: string;
    expectedChainRootPagesSourceCommit: string;
    stagedHandoffExpectations?: NotificationPagesPrivateHandoffExpectations;
    fetchImpl?: typeof fetch;
    now?: Date;
    randomBytesImpl?: (size: number) => Buffer;
  }>,
): Promise<NotificationPagesLiveCandidateAuthority>;

export function promoteNotificationPagesLiveReceipt(options: Readonly<{
  directory: string;
  repositoryRoot: string;
  candidateAuthorityDigest: string;
  candidatePagesSourceCommit: string;
  expectedChainRootReceiptDigest: string;
  expectedChainRootPagesSourceCommit: string;
  fetchImpl?: typeof fetch;
  now?: Date;
  randomBytesImpl?: (size: number) => Buffer;
}>): Promise<Readonly<{
  path: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
  receipt: NotificationPagesLiveReceipt;
  preparedBinding: NotificationPagesLivePreparedBinding;
  chainRootReceiptDigest: string;
  chainRootPagesSourceCommit: string;
  liveAttestation?: Readonly<Record<string, unknown>>;
}>>;
