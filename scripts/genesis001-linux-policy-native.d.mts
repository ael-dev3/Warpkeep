import type { SealedRealmsProductionWorkflowEvidence } from './sealed-realms-production-workflow-evidence.mjs';
declare const preparationBrand: unique symbol;
export type FixedLinuxG001PolicyPreparation = Readonly<{ [preparationBrand]: true }>;
export type Genesis001LinuxPolicyPreparation = FixedLinuxG001PolicyPreparation;
export function prepareFixedLinuxG001PolicyObservation(): Promise<FixedLinuxG001PolicyPreparation>;
export function assertFixedLinuxG001PolicyPreparation(handle: FixedLinuxG001PolicyPreparation): void;
export function disposeFixedLinuxG001PolicyObservation(handle: FixedLinuxG001PolicyPreparation): void;
export function executeFixedLinuxG001PolicyObservation(handle: FixedLinuxG001PolicyPreparation, evidence: SealedRealmsProductionWorkflowEvidence): Promise<Readonly<{
  profile: 'warpkeep-g001-linux-policy-execution-v1'; sourceCommit: string; sourceTree: string;
  operatorBlob: string; operatorSha256: string;
  runtime: Readonly<{ profile: 'warpkeep-g001-policy-observation-linux-x64-v1'; nodeVersion: 'v22.22.3'; nodeSha256: string }>;
  dependencyClosureSha256: string;
  execution: Readonly<{ runId: string; bundleSha256: string; sourceClosureSha256: string }>;
  cleanup: Readonly<{ outcome: 'cleaned'; runId: string; namespaceInventorySha256: string }>;
  policyObservationReceipt: Readonly<Record<string, unknown>>;
}>>;
