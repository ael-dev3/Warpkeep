import type { ReadyRealmResourcePresentation } from '../../src/components/realm/realmResourcePresentation';

export function createReadyResourceState(
  fid = 12_345,
  revision = 0n,
): ReadyRealmResourcePresentation {
  return Object.freeze({
    status: 'ready',
    fid: BigInt(fid),
    balances: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
    pendingBalances: Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n }),
    marksBalanceMicros: 0n,
    observedAtMicros: 1_800_000_000_000_000n + revision,
    settledThroughMicros: 1_800_000_000_000_000n,
    nextCollectAtMicros: 1_800_000_600_000_000n,
    revision,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
    terrainKind: 'lowland',
  });
}
