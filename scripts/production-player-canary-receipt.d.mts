export declare const PRODUCTION_PLAYER_CANARY_PROFILE:
  'warpkeep-production-player-canary-v1';
export declare const PRODUCTION_PLAYER_CANARY_PREDECESSOR_TUPLE:
  'FT|TTFT|FT|FF|1|1|NNPN';
export declare const PRODUCTION_PLAYER_CANARY_PREDECESSOR_VERSION: '0.3.43';
export declare const PRODUCTION_PLAYER_CANARY_RECEIPT_MAXIMUM_AGE_MS: number;
export declare const PRODUCTION_PLAYER_CANARY_FRESH_INSPECTION_MAXIMUM_AGE_MS: number;

export declare class ProductionPlayerCanaryReceiptError extends Error {
  readonly code: string;
}

export declare function canonicalProductionPlayerCanaryReceiptBytes(
  receipt: unknown,
): Buffer;
export declare function parseProductionPlayerCanaryReceipt(value: unknown): unknown;
export declare function defaultProductionPlayerCanaryReceiptDirectory(): string;
export declare function inspectProductionPlayerCanaryActivationAuthority(input: Readonly<{
  binding?: unknown;
  directory?: string;
  expectedPredecessorPagesSourceCommit: string;
  expectedProtectedTree: string;
  expectedLiveReceiptDigest: string;
  expectedLivePagesSourceCommit: string;
  expectedLiveRootReceiptDigest: string;
  expectedLiveRootPagesSourceCommit: string;
  /**
   * Must be the branded result of fresh private plan/Hermes/bridge/DB inspection.
   * Its observation timestamp and DB evidence digest may be newer than the
   * historical receipt; every stable release invariant must still match.
   */
  expectedEvidenceAuthority: unknown;
}>): Readonly<Record<string, string | number | boolean>>;
export declare function sameProductionPlayerCanaryActivationAuthority(
  left: unknown,
  right: unknown,
): boolean;
export declare function installProductionPlayerCanaryReceipt(input: Readonly<{
  /** Branded fresh result from inspectProductionPlayerCanaryExpectedEvidenceAuthority. */
  evidenceAuthority: unknown;
  directory?: string;
  randomId?: () => string;
}>): Readonly<{
  filename: string;
  receiptDigest: string;
  result: 'installed' | 'unchanged';
}>;
export declare const productionPlayerCanaryReceiptTestSeams: Readonly<{
  installReceipt: (
    input: Readonly<{ receipt: unknown; directory?: string; randomId?: () => string }>,
    hooks?: Readonly<{ afterLink?: () => void }>,
  ) => Readonly<{
    filename: string;
    receiptDigest: string;
    result: 'installed' | 'unchanged';
  }>;
  reconcileReceiptDirectory: (directory: string) => void;
  inspectActivationAuthority: (
    input: Readonly<Record<string, unknown>>,
    now: number,
  ) => Readonly<Record<string, string | number | boolean>>;
}> | undefined;
