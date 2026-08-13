export const NOTIFICATION_PAGES_RELEASE_SOURCE_PARSER_PROFILE:
  'warpkeep-notification-pages-release-source-parser-v1';

export class NotificationPagesReleaseSourceParserError extends Error {
  readonly code: string;
}

export type NotificationPagesReleaseSources = Readonly<{
  phase: Readonly<{
    pagesPresentationEnabled: boolean;
    hermesExecutionApproved: boolean;
  }>;
  preparedBinding: Readonly<{
    notificationPreparedReceiptDigest: string | null;
    notificationPreparedBridgeSourceCommit: string | null;
  }>;
  privateBinding: Readonly<{
    notificationPagesActiveV17EvidenceDigest: string | null;
    notificationPagesDeployedModuleReceiptDigest: string | null;
    notificationPagesExpectedFounderCount: number | null;
  }>;
  liveRootBinding: Readonly<{
    notificationPagesLiveRootReceiptDigest: string | null;
    notificationPagesLiveRootPagesSourceCommit: string | null;
  }>;
}>;

export function parseNotificationPagesReleaseSources(
  sources: Readonly<{
    pagesWorkflowSource: string;
    hermesSource: string;
    preparedBindingSource: string;
    privateBindingSource: string;
    liveRootBindingSource: string;
  }>,
): NotificationPagesReleaseSources;

export function readNotificationPagesReleaseSources(
  options: Readonly<{ repositoryRoot: string }>,
): NotificationPagesReleaseSources;
