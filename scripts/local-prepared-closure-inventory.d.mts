/** Candidate source bytes only; not installed or authenticated release evidence. */
export function derivePreparedClosureInventorySource(options: Readonly<{ repositoryRoot: string }>): Readonly<{
  path: 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
  bytes: Uint8Array;
  memberCount: number;
}>;

/** Inventory-dependent subset only; not the complete Task 7 artifact family. */
export function derivePreparedClosureInventoryAndCounts(options: Readonly<{ repositoryRoot: string }>): Readonly<{
  memberCount: number;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>;
/** Prospective fixed policy expansion; apply before inventory derivation. */
export function derivePreparedClosurePolicySource(options: Readonly<{ repositoryRoot: string }>): Readonly<{
  path: 'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';
  bytes: Uint8Array;
}>;
