export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING: Readonly<{
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
}>;

export type NotificationPagesLiveReleaseBinding = typeof NOTIFICATION_PAGES_LIVE_RELEASE_BINDING;

export class NotificationPagesLiveReleaseBindingError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function parseNotificationPagesLiveReleaseBinding(
  value: unknown,
  options?: Readonly<{ required?: boolean }>,
): Readonly<{
  notificationPagesLiveRootReceiptDigest: string | null;
  notificationPagesLiveRootPagesSourceCommit: string | null;
}>;
