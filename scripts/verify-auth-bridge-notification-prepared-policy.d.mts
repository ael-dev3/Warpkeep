export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOYMENT_BLOCKER:
  'AUTH_BRIDGE_PREPARED_DEPLOY_ADAPTER_AND_PRIVATE_SINK_UNAVAILABLE';

export function verifyAuthBridgeNotificationPreparedStaticPolicy(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<{
  bridgeNotificationDeliveryEnabled: true;
  hermesExecutionApproved: false;
  pagesPresentationEnabled: false;
  checkedInWorkerGateEnabled: false;
  deploymentMechanicsReady: false;
  blocker: 'AUTH_BRIDGE_PREPARED_DEPLOY_ADAPTER_AND_PRIVATE_SINK_UNAVAILABLE';
}>;
