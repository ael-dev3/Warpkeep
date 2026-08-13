import type { NotificationPagesLiveInspection } from './notification-pages-live-receipt.mjs';

export type NotificationPagesLiveHermesAuthority = Readonly<{
  notificationPagesLiveReceiptDigest: string | null;
  notificationPagesLivePagesSourceCommit: string | null;
  notificationPagesLiveBridgeSourceCommit: string | null;
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
}>;

export const EMPTY_NOTIFICATION_PAGES_LIVE_HERMES_AUTHORITY:
  NotificationPagesLiveHermesAuthority;

export class NotificationPagesLiveHermesAuthorityError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function parseNotificationPagesLiveHermesAuthority(
  value: unknown,
  options?: Readonly<{ required?: boolean }>,
): NotificationPagesLiveHermesAuthority;

export function inspectHermesNotificationPagesLiveAuthority(
  input: Readonly<{
    required: boolean;
    pagesSourceCommit?: string;
    rootBinding?: Readonly<{
      notificationPagesLiveRootReceiptDigest: string | null;
      notificationPagesLiveRootPagesSourceCommit: string | null;
    }>;
    directory?: string;
    repositoryRoot?: string;
    fetchImpl?: typeof fetch;
    now?: Date;
  }>,
  dependencies?: Readonly<{
    inspectByPagesSourceCommit?: (
      input: Readonly<Record<string, unknown>>,
    ) => Promise<NotificationPagesLiveInspection>;
  }>,
): Promise<NotificationPagesLiveHermesAuthority>;

export function sameNotificationPagesLiveHermesAuthority(
  left: unknown,
  right: unknown,
): boolean;
