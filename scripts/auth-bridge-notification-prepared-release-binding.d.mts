export type AuthBridgeNotificationPreparedReleaseBinding = Readonly<{
  notificationPreparedReceiptDigest: string | null;
  notificationPreparedBridgeSourceCommit: string | null;
}>;

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING:
  AuthBridgeNotificationPreparedReleaseBinding;
