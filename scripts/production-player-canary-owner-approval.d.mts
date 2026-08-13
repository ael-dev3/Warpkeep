export declare const PRODUCTION_PLAYER_CANARY_OWNER_APPROVAL_KIND:
  'warpkeep-production-player-canary-owner-approval-v1';

export declare class ProductionPlayerCanaryOwnerApprovalError extends Error {
  readonly code: string;
}

export declare function productionPlayerCanaryRouteSetCommitment(
  input: Readonly<Record<string, unknown>>,
): string;
export declare function parseProductionPlayerCanaryOwnerApproval(
  value: unknown,
): Readonly<Record<string, unknown>>;
export declare function writeProductionPlayerCanaryOwnerApproval(input: Readonly<{
  directory: string;
  approval: Readonly<Record<string, unknown>>;
  /** Branded result of freshly authenticated server baseline reconciliation. */
  baselineReconciliation: unknown;
}>): Readonly<{ filename: string; sha256: string }>;
export declare function inspectProductionPlayerCanaryOwnerApproval(input: Readonly<{
  directory: string;
  reference: Readonly<{ filename: string; sha256: string }>;
  now: Date;
}>): Readonly<{
  approval: Readonly<Record<string, unknown>>;
  artifactDigest: string;
  approvalCommitment: string;
  routeSetCommitment: string;
  commandSetCommitment: string;
}>;
export declare const productionPlayerCanaryOwnerApprovalTestSeams: Readonly<{
  sameFile: (
    left: Readonly<Record<string, unknown>>,
    right: Readonly<Record<string, unknown>>,
  ) => boolean;
}> | undefined;
