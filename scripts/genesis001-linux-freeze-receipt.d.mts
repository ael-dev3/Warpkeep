import type { Genesis001LinuxPolicyReceipt } from './genesis001-linux-policy-receipt.mjs';
export const GENESIS_001_SERVER_FREEZE_PROFILE: 'warpkeep-genesis-001-server-freeze-v1';
export const GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE: 'warpkeep-g001-linux-freeze-confirmation-v1';
export const GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE: 'warpkeep-g001-linux-freeze-current-state-v1';
export type Genesis001LinuxFreezeCensusBinding = Readonly<{
  firstDigest: string;
  secondDigest: string;
  confirmationDigest: string;
  confirmationRecordDigest: string;
  consumedRecordDigest: string;
  secondObservedAt: string;
  expiresAt: string;
  consumedAt: string;
}>;
export type Genesis001LinuxFreezeConfirmationReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof GENESIS_001_LINUX_FREEZE_CONFIRMATION_PROFILE;
  sourceCommit: string;
  census: Genesis001LinuxFreezeCensusBinding;
  policyObservation: Genesis001LinuxPolicyReceipt;
  receiptDigest: string;
}>;
export type Genesis001LinuxFreezeCurrentStateReceipt = Readonly<{
  schemaVersion: 1;
  profile: typeof GENESIS_001_LINUX_FREEZE_CURRENT_STATE_PROFILE;
  sourceCommit: string;
  confirmationReceiptDigest: string;
  policyObservation: Genesis001LinuxPolicyReceipt;
  receiptDigest: string;
}>;
/** Pure provenance validation; never authenticates the producer or grants authority. */
export function createGenesis001LinuxFreezeConfirmationReceipt(value: unknown, commit: string): Genesis001LinuxFreezeConfirmationReceipt;
export function verifyGenesis001LinuxFreezeConfirmationReceipt(value: unknown, commit: string): Genesis001LinuxFreezeConfirmationReceipt;
export function createGenesis001LinuxFreezeCurrentStateReceipt(value: unknown, commit: string): Genesis001LinuxFreezeCurrentStateReceipt;
export function verifyGenesis001LinuxFreezeCurrentStateReceipt(value: unknown, commit: string): Genesis001LinuxFreezeCurrentStateReceipt;
/** Requires separately authenticated census/producer ownership and trusted verification time. */
export function projectGenesis001LinuxFreezeEvidence(value: unknown, verificationTimestamp: string): Readonly<{
  g001AdmissionControlProfile: typeof GENESIS_001_SERVER_FREEZE_PROFILE;
  g001FreezeConfirmationReceiptDigest: string;
  g001FreezeCurrentStateReceiptDigest: string;
}>;
