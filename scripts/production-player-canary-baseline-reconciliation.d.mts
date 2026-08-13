export declare const PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_PROFILE:
  'warpkeep-production-player-canary-baseline-reconciliation-v1';

export declare class ProductionPlayerCanaryBaselineReconciliationError extends Error {
  readonly code: string;
  readonly disposition:
    | 'halt'
    | 'safe-pre-mutation-failure'
    | 'explicit-operator-retry-required';
}

export type ProductionPlayerCanaryBaselineReconciliationStatus = Readonly<{
  profile: 'warpkeep-production-player-canary-server-baseline-v1';
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  capturedAtMicros: bigint;
  baselineCaptured: boolean;
  directTierOneFounder: boolean;
  normalRequestAdmission: boolean;
  pristineWorkerCount: number;
  terminalGraphEmpty: boolean;
  pristineResourceAccount: boolean;
}>;

export type ProductionPlayerCanaryBaselineReconciliation = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_BASELINE_RECONCILIATION_PROFILE;
  submissionOutcome:
    | 'capture-acknowledged'
    | 'existing-row-after-write-not-started'
    | 'row-reconciled-after-submission-error';
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  capturedAtMicros: bigint;
  status: ProductionPlayerCanaryBaselineReconciliationStatus;
}>;

export type ProductionPlayerCanaryBaselineWritePermit = (() => void) & Readonly<{
  markSubmissionUncertain?: () => Promise<void>;
  bindWriteNotStartedError?: (error: unknown) => void;
}>;

export type ProductionPlayerCanaryBaselineReconciliationInput = Readonly<{
  adminSecret: string;
  arguments: Readonly<{
    fid: bigint;
    reviewedAdmissionPlanDigest: string;
    evidenceNonce: string;
  }>;
  assertCanStartWrite: ProductionPlayerCanaryBaselineWritePermit;
  expectedServerBaselineCommitment?: string;
}>;

export declare function productionPlayerCanaryBaselineChallengeDigest(
  evidenceNonce: string,
): string;
export declare function captureAndReconcileProductionPlayerCanaryBaselineV1(
  input: ProductionPlayerCanaryBaselineReconciliationInput,
): Promise<ProductionPlayerCanaryBaselineReconciliation>;
export declare function requireProductionPlayerCanaryBaselineReconciliation(
  value: unknown,
): ProductionPlayerCanaryBaselineReconciliation;
export declare function requireProductionPlayerCanaryBaselineReconciliationForApproval(
  value: unknown,
  approval: unknown,
): ProductionPlayerCanaryBaselineReconciliation;
export declare const productionPlayerCanaryBaselineReconciliationTestSeams:
  Readonly<{
    reconcileWithDependencies: (
      input: ProductionPlayerCanaryBaselineReconciliationInput,
      dependencies: Readonly<{
        openSession: (adminSecret: string) => Promise<unknown>;
        capture: (input: Readonly<{
          session: unknown;
          arguments: ProductionPlayerCanaryBaselineReconciliationInput['arguments'];
          assertCanStartWrite: ProductionPlayerCanaryBaselineWritePermit;
        }>) => Promise<void>;
        refresh: (session: unknown) => Promise<void>;
        read: (input: Readonly<{
          session: unknown;
          arguments: ProductionPlayerCanaryBaselineReconciliationInput['arguments'];
        }>) => Promise<unknown>;
      }>,
    ) => Promise<ProductionPlayerCanaryBaselineReconciliation>;
    brandCapturedStatusForTest: (
      status: ProductionPlayerCanaryBaselineReconciliationStatus,
      input: ProductionPlayerCanaryBaselineReconciliationInput,
    ) => ProductionPlayerCanaryBaselineReconciliation;
  }> | undefined;
