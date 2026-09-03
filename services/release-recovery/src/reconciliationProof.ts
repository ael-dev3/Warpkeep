import type {
  LedgerClaimedState,
  LedgerReconciliationProof,
  LedgerReconciliationRequiredState,
} from './ledger.js'

export type DeploymentReconciliationProofReader = (
  record: LedgerClaimedState | LedgerReconciliationRequiredState,
) => Promise<LedgerReconciliationProof>

/**
 * Task 6 statically replaces this fail-closed provider with authenticated
 * GitHub Pages and public-origin reconciliation evidence.
 */
export const readDeploymentReconciliationProof: DeploymentReconciliationProofReader = async (
  _record: LedgerClaimedState | LedgerReconciliationRequiredState,
) => Object.freeze({ outcome: 'ambiguous' })
