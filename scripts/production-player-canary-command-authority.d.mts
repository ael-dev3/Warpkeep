export declare const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION:
  'warpkeep-production-player-canary-command-key-v1';

export declare class ProductionPlayerCanaryCommandAuthorityError extends Error {
  readonly code: string;
}

export type ProductionPlayerCanaryCommandAuthorityV1 = Readonly<{
  commandKeyPolicyVersion:
    typeof PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION;
  commandSetCommitment: string;
  commands: readonly Readonly<{
    ordinal: number;
    dispatchIdempotencyKey: string;
    recallIdempotencyKey: string;
  }>[];
}>;

export declare function deriveProductionPlayerCanaryCommandAuthorityV1(
  input: Readonly<{
    evidenceNonce: string;
    reviewedAdmissionPlanDigest: string;
    serverBaselineCommitment: string;
    routeSetCommitment: string;
  }>,
): ProductionPlayerCanaryCommandAuthorityV1;
