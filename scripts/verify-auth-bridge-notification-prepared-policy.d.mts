export function verifyAuthBridgeNotificationPreparedStaticPolicy(
  options?: Readonly<{ repositoryRoot?: string }>,
): Readonly<{
  bridgeNotificationDeliveryEnabled: true;
  hermesExecutionApproved: false;
  pagesPresentationEnabled: false;
  checkedInWorkerGateEnabled: false;
  deploymentMechanicsReady: true;
  dedicatedPersistentRunnerRequired: true;
  guardedRecoveryRequired: true;
  privateReceiptSinkRequired: true;
  installedToolchainByteAttestationRequired: true;
  executableSecurityClosureMemberCount: number;
}>;
