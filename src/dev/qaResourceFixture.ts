import type { RealmIdentity } from '../components/realm/realmTypes';
import {
  REALM_RESOURCE_POLICY_VERSION,
  type ReadyRealmResourcePresentation
} from '../components/realm/realmResourcePresentation';
import { MARK_ATTRIBUTION_POLICY_ID } from '../marks/marksPolicy';

const QA_RESOURCE_OBSERVED_AT_MICROS = 1_800_000_000_000_000n;
const QA_RESOURCE_QUANTUM_MICROS = 600_000_000n;
const ZERO_BALANCES = Object.freeze({ food: 0n, wood: 0n, stone: 0n, gold: 0n });

/**
 * Local presentation-only projection for browser QA. It exercises the player
 * resource chrome without claiming backend authority or granting inventory.
 */
export function createZeroQaResourcePresentation(
  identity: Readonly<Pick<RealmIdentity, 'fid'>>
): ReadyRealmResourcePresentation {
  return Object.freeze({
    status: 'ready' as const,
    fid: BigInt(identity.fid),
    balances: ZERO_BALANCES,
    pendingBalances: ZERO_BALANCES,
    marksBalanceMicros: 0n,
    observedAtMicros: QA_RESOURCE_OBSERVED_AT_MICROS,
    settledThroughMicros: QA_RESOURCE_OBSERVED_AT_MICROS,
    nextCollectAtMicros: QA_RESOURCE_OBSERVED_AT_MICROS + QA_RESOURCE_QUANTUM_MICROS,
    revision: 0n,
    resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
    marksPolicyVersion: MARK_ATTRIBUTION_POLICY_ID,
    terrainKind: 'lowland'
  });
}
