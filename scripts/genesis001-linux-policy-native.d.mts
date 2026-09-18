import type { SealedRealmsProductionWorkflowEvidence } from './sealed-realms-production-workflow-evidence.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';
declare const preparationBrand: unique symbol;
export type FixedLinuxG001PolicyPreparation = Readonly<{ [preparationBrand]: true }>;
export type Genesis001LinuxPolicyPreparation = FixedLinuxG001PolicyPreparation;
declare const censusPreparationBrand: unique symbol;
export type FixedLinuxG001CensusPreparation = Readonly<{ [censusPreparationBrand]: true }>;
export function prepareFixedLinuxG001CensusObservation(adminSecret: string): Promise<FixedLinuxG001CensusPreparation>;
export function assertFixedLinuxG001CensusPreparation(handle: FixedLinuxG001CensusPreparation): void;
export function executeFixedLinuxG001CensusObservation(handle: FixedLinuxG001CensusPreparation,
  evidence: SealedRealmsProductionWorkflowEvidence): Promise<Readonly<{
    profile: 'warpkeep-g001-linux-census-completed-v1'; sourceCommit: string; attemptId: string;
    githubRunId: string; githubRunAttempt: string; receiptDigest: string; completedAt: string; mutationSubmitted: false;
  }>>;
declare const activationCensusBrand: unique symbol;
/** Genuine same-process native read, never a completed-workflow or write proof. */
export type FixedLinuxG001ActivationCensusEvidence = Readonly<{ [activationCensusBrand]: true }>;
export function executeFixedLinuxG001ActivationCensusObservation(handle: FixedLinuxG001CensusPreparation,
  input: Readonly<{ sourceAuthority: SealedRealmsProductionSourceAuthority;
    workflowPermit: SealedRealmsProductionWorkflowPermit;
    workflowEvidence: SealedRealmsProductionWorkflowEvidence;
  }>): Promise<FixedLinuxG001ActivationCensusEvidence>;
export function readFixedLinuxG001ActivationCensusEvidence(capability: FixedLinuxG001ActivationCensusEvidence,
  input: Readonly<{ sourceAuthority: SealedRealmsProductionSourceAuthority;
    workflowPermit: SealedRealmsProductionWorkflowPermit;
  }>): ReturnType<typeof import('./genesis001-linux-census-attempt.mjs').readFixedLinuxG001CensusAttempt>;
export function prepareFixedLinuxG001PolicyObservation(): Promise<FixedLinuxG001PolicyPreparation>;
export function assertFixedLinuxG001PolicyPreparation(handle: FixedLinuxG001PolicyPreparation): void;
export function disposeFixedLinuxG001PolicyObservation(handle: FixedLinuxG001PolicyPreparation | FixedLinuxG001CensusPreparation): void;
export function executeFixedLinuxG001PolicyObservation(handle: FixedLinuxG001PolicyPreparation, evidence: SealedRealmsProductionWorkflowEvidence): Promise<Readonly<{
  profile: 'warpkeep-g001-linux-policy-execution-v1'; sourceCommit: string; sourceTree: string;
  operatorBlob: string; operatorSha256: string;
  runtime: Readonly<{ profile: 'warpkeep-g001-policy-observation-linux-x64-v1'; nodeVersion: 'v22.22.3'; nodeSha256: string }>;
  dependencyClosureSha256: string;
  execution: Readonly<{ runId: string; bundleSha256: string; sourceClosureSha256: string }>;
  cleanup: Readonly<{ outcome: 'cleaned'; runId: string; namespaceInventorySha256: string }>;
  policyObservationReceipt: Readonly<Record<string, unknown>>;
}>>;
