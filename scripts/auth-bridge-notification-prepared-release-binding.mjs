/**
 * Checked-in authority for the coordinated notification release.
 *
 * The bridge-prepared receipt remains owner-private. A separately reviewed
 * release changes both nullable fields together only after inspecting that
 * exact content-addressed receipt against a fresh public bridge attestation.
 */
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({
  notificationPreparedReceiptDigest: null,
  notificationPreparedBridgeSourceCommit: null,
});
