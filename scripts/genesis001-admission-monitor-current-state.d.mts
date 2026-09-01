export const GENESIS001_ADMISSION_MONITOR_CURRENT_STATE_PROFILE: string;
export const GENESIS001_ADMISSION_MONITOR_LABEL: string;
export const EXPECTED_MONITOR_PLIST_SHA256: string;
export const EXPECTED_MONITOR_PROGRAM_SHA256: string;

export class Genesis001AdmissionMonitorCurrentStateError extends Error {
  readonly code: string;
}

export type Genesis001AdmissionMonitorCurrentStateSnapshot = Readonly<{
  label: string;
  domain: string;
  disabled: boolean;
  loaded: boolean;
  plistSha256: string;
  programSha256: string;
}>;

export type Genesis001AdmissionMonitorCurrentStateReceipt = Readonly<{
  schemaVersion: 1;
  profile: string;
  realmId: 'GENESIS_001';
  release: '0.3.43';
  sourceCommit: string;
  observedAt: string;
  label: string;
  disabled: boolean;
  loaded: boolean;
  monitorPlistSha256: string;
  monitorProgramSha256: string;
}>;

export function createGenesis001AdmissionMonitorCurrentStateReceiptForTesting(
  snapshot: Genesis001AdmissionMonitorCurrentStateSnapshot,
  sourceCommit: string,
  observedAt: Date,
): Genesis001AdmissionMonitorCurrentStateReceipt;

export function parseGenesis001AdmissionMonitorDisabledState(
  output: string,
): boolean;
