export declare const PRODUCTION_PLAYER_CANARY_RELEASE_BINDING: Readonly<{
  productionPlayerCanaryReceiptDigest: string | null;
  productionPlayerCanarySourceCommit: string | null;
}>;

export declare class ProductionPlayerCanaryReleaseBindingError extends Error {
  readonly code: string;
}

export declare function parseProductionPlayerCanaryReleaseBinding(
  value: unknown,
  options?: Readonly<{ required?: boolean }>,
): typeof PRODUCTION_PLAYER_CANARY_RELEASE_BINDING;
