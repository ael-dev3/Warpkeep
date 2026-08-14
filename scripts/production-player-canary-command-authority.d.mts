export declare const PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION:
  'warpkeep-production-player-canary-command-key-v2';

export declare class ProductionPlayerCanaryCommandAuthorityError extends Error {
  readonly code: string;
}

export type ProductionPlayerCanaryCommandAuthorityV2 = Readonly<{
  commandKeyPolicyVersion:
    typeof PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION;
  commandSetCommitment: string;
  recoveryFenceIdempotencyKey: string;
  commands: readonly Readonly<{
    ordinal: number;
    dispatchIdempotencyKey: string;
    recallIdempotencyKey: string;
  }>[];
}>;

export declare function deriveProductionPlayerCanaryCommandAuthorityV2(
  input: Readonly<{
    challengeDigest: string;
    reviewedAdmissionPlanDigest: string;
    serverBaselineCommitment: string;
    routeSetCommitment: string;
  }>,
): ProductionPlayerCanaryCommandAuthorityV2;
