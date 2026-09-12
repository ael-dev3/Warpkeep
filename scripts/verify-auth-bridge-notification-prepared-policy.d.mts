/** Requires the caller to authenticate the enclosing release closure first. */
export function verifyAuthBridgeNotificationPreparedUploadBoundarySources(
  sources: Readonly<{
    adapterSource: string;
    journalSource: string;
    runtimeSource: string;
  }>,
): true;

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
