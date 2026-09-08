import type { Genesis001PolicyObservationReceipt } from './genesis001-policy-observation-receipt.mjs';
export const GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE: 'warpkeep-g001-linux-policy-observation-v1';
export const GENESIS_001_LINUX_POLICY_OPERATOR_PATH: 'scripts/genesis001-policy-observation-receipt.mjs';
export type Genesis001LinuxPolicyReceipt = Readonly<{
  profile: typeof GENESIS_001_LINUX_POLICY_RECEIPT_PROFILE;
  protectedCommit: string;
  moduleTreeId: string;
  operatorBlob: string;
  operatorSha256: string;
  runtime: Readonly<{
    profile: 'warpkeep-g001-policy-observation-linux-x64-v1';
    nodeVersion: 'v22.22.3';
    nodeSha256: string;
  }>;
  dependencyClosureSha256: string;
  execution: Readonly<{
    runId: string;
    bundleSha256: string;
    sourceClosureSha256: string;
  }>;
  cleanup: Readonly<{
    outcome: 'cleaned';
    runId: string;
    namespaceInventorySha256: string;
  }>;
  policyObservationReceipt: Genesis001PolicyObservationReceipt;
  receiptLinkSha256: string;
}>;
/** Pure validation, not an authority issuer. */
export function createGenesis001LinuxPolicyReceipt(
  result: unknown,
  commit: string,
): Genesis001LinuxPolicyReceipt;
export function verifyGenesis001LinuxPolicyReceipt(
  value: unknown,
  commit: string,
): Genesis001LinuxPolicyReceipt;
