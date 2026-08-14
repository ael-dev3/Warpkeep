import type {
  ProductionPlayerCanaryOperatorContract,
} from './production-player-canary-operator-journal.mjs';

export declare const PRODUCTION_PLAYER_CANARY_OPERATOR_PROFILE:
  'warpkeep-production-player-canary-operator-v1';

export declare class ProductionPlayerCanaryOperatorError extends Error {
  readonly code: string;
  readonly disposition: string;
}

export type ProductionPlayerCanaryOperatorCommand =
  | 'inspect'
  | 'capture-baseline'
  | 'inspect-route-plan'
  | 'prepare-owner-approval'
  | 'install-owner-approval'
  | 'register-approval'
  | 'finalize-receipt';

export declare function executeProductionPlayerCanaryOperatorPhase(
  input: Readonly<{
    command: ProductionPlayerCanaryOperatorCommand;
    contract: ProductionPlayerCanaryOperatorContract;
    reportedHome?: string;
    adminSecret?: string;
    notificationOperatorSecret?: string;
    confirmationDigest?: string;
    approval?: unknown;
    liveReceiptDirectory?: string;
  }>,
): Promise<Readonly<Record<string, unknown>>>;
export declare const productionPlayerCanaryOperatorTestSeams:
  | Readonly<{
    assertProtectedSource(contract: ProductionPlayerCanaryOperatorContract): void;
    executeWithDependencies(
      input: Readonly<Record<string, unknown>>,
      dependencies: Readonly<Record<string, unknown>>,
    ): Promise<Readonly<Record<string, unknown>>>;
    validateClaimedPlan(
      contract: ProductionPlayerCanaryOperatorContract,
      inspected: unknown,
    ): unknown;
    validateRoutePlan(plan: unknown, baseline: unknown): unknown;
  }>
  | undefined;
