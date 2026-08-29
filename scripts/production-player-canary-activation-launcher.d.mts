export const PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE:
  'warpkeep-production-player-canary-activation-launcher-v1';
export const EXPECTED_PROTECTED_SOURCE_CLOSURE_MEMBER_COUNT: 997;

export type ProductionPlayerCanaryActivationLaunch = Readonly<{
  schemaVersion: 1;
  profile: typeof PRODUCTION_PLAYER_CANARY_ACTIVATION_LAUNCHER_PROFILE;
  operatorOperationId: string;
  candidatePagesSourceTree: string;
  request: Readonly<Record<string, unknown>>;
}>;

export class ProductionPlayerCanaryActivationLauncherError extends Error {
  readonly code: string;
}

export function parseProductionPlayerCanaryActivationLaunch(
  value: unknown,
): ProductionPlayerCanaryActivationLaunch;

export function runProductionPlayerCanaryActivationLauncher(
  launch: unknown,
): Promise<Readonly<{ activationRequestDigest: string }>>;

export const productionPlayerCanaryActivationLauncherTestSeams:
  | Readonly<{
    runWithDependencies(
      launch: unknown,
      dependencies?: Readonly<{
    now?: () => Date;
    inspectCheckout?: () => Readonly<{ commit: string; tree: string }>;
    assertProtectedSource?: (input: Readonly<Record<string, unknown>>) => void;
    verifySourceClosure?: (
      input: Readonly<{ repositoryRoot: string }>,
    ) => Readonly<Record<string, unknown>>;
    assertSourceTransition?: (
      input: Readonly<Record<string, unknown>>,
    ) => Readonly<Record<string, unknown>>;
    inspectTerminalJournal?: (
      input: Readonly<{ operatorOperationId: string }>,
    ) => Readonly<Record<string, unknown>>;
    inspectSettledReceipt?: (
      input: Readonly<{ expectedReceiptDigest: string }>,
    ) => Readonly<Record<string, unknown>>;
    inspectReferences?: (
      request: Readonly<Record<string, unknown>>,
      now: Date,
    ) => Promise<Readonly<{
      plan: Readonly<Record<string, unknown>>;
      approval: Readonly<Record<string, unknown>>;
    }>>;
    requireReferences?: (
      request: Readonly<Record<string, unknown>>,
      plan: Readonly<Record<string, unknown>>,
      approval: Readonly<Record<string, unknown>>,
    ) => unknown;
    preflightPublication?: (
      input: Readonly<{ request: Readonly<Record<string, unknown>> }>,
    ) => Readonly<Record<string, unknown>>;
    writeRequest?: (
      input: Readonly<{
        request: Readonly<Record<string, unknown>>;
        now: Date;
      }>,
    ) => Promise<Readonly<{ activationRequestDigest: string }>>;
      }>,
    ): Promise<Readonly<{ activationRequestDigest: string }>>;
  inspectExactCheckout(): Readonly<{ commit: string; tree: string }>;
  readCanonicalLaunchFromDescriptor(
    descriptor?: number,
  ): ProductionPlayerCanaryActivationLaunch;
  readCanonicalLaunchWithIo(
    descriptor: number,
    io: Readonly<{
      fstat: typeof import('node:fs').fstatSync;
      read: typeof import('node:fs').readSync;
    }>,
  ): ProductionPlayerCanaryActivationLaunch;
  requireSettledReceipt(
    launch: ProductionPlayerCanaryActivationLaunch,
    journal: Readonly<Record<string, unknown>>,
    inspected: Readonly<Record<string, unknown>>,
    now: Date,
  ): Readonly<Record<string, unknown>>;
  requireTerminalJournal(
    launch: ProductionPlayerCanaryActivationLaunch,
    journal: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>>;
  requirePrivateAuthorityCrossBinding(
    launch: ProductionPlayerCanaryActivationLaunch,
    journal: Readonly<Record<string, unknown>>,
    receipt: Readonly<Record<string, unknown>>,
    references: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>>;
  }>
  | undefined;
