export declare const PRODUCTION_PLAYER_CANARY_APPROVAL_RECONCILIATION_PROFILE:
  'warpkeep-production-player-canary-approval-reconciliation-v1';

export declare class ProductionPlayerCanaryApprovalReconciliationError extends Error {
  readonly code: string;
  readonly disposition:
    | 'halt'
    | 'safe-pre-mutation-failure'
    | 'explicit-operator-retry-required';
}

export declare function productionPlayerCanaryApprovalRegistrationArgumentsV1(
  input: Readonly<{
    fid: bigint;
    baselineReconciliation: unknown;
    routePlan: Readonly<Record<string, unknown>>;
    inspectedApproval: Readonly<Record<string, unknown>>;
  }>,
): Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  commandKeyPolicyVersion: string;
  commandSetCommitment: string;
  ownerApprovalArtifactDigest: string;
  ownerApprovalCommitment: string;
  approvedAtMicros: bigint;
  notAfterMicros: bigint;
}>;

export declare function registerAndReconcileProductionPlayerCanaryApprovalV1(
  input: Readonly<{
    adminSecret: string;
    arguments: Readonly<Record<string, unknown>>;
    assertCanStartWrite: (() => void) & Readonly<{
      markSubmissionUncertain?: () => Promise<void>;
      bindWriteNotStartedError?: (error: unknown) => void;
    }>;
  }>,
): Promise<Readonly<Record<string, unknown>>>;

export declare function requireProductionPlayerCanaryApprovalReconciliation(
  value: unknown,
): Readonly<Record<string, unknown>>;

export declare const productionPlayerCanaryApprovalReconciliationTestSeams:
  Readonly<Record<string, (...args: any[]) => any>> | undefined;
