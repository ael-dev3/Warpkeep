export type NotificationPagesPrivateReleaseBinding = Readonly<{
  notificationPagesActiveV17EvidenceDigest: string | null;
  notificationPagesDeployedModuleReceiptDigest: string | null;
  notificationPagesExpectedFounderCount: number | null;
}>;

export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING:
  NotificationPagesPrivateReleaseBinding;

export class NotificationPagesPrivateReleaseBindingError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function parseNotificationPagesPrivateReleaseBinding(
  value: unknown,
  options?: Readonly<{ required?: boolean }>,
): NotificationPagesPrivateReleaseBinding;
