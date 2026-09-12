import type {
  LedgerClaimedState,
  LedgerReconciliationProof,
  LedgerReconciliationRequiredState,
} from '../src/ledger.js'
import type { DeploymentReconciliationProofReader } from '../src/reconciliationProof.js'

const failClosedReader: DeploymentReconciliationProofReader = async () =>
  Object.freeze({ outcome: 'ambiguous' })

let reader: DeploymentReconciliationProofReader = failClosedReader

export function setTestReconciliationProofReader(value: DeploymentReconciliationProofReader): void {
  reader = value
}

export function resetTestReconciliationProofReader(): void {
  reader = failClosedReader
}

export async function readDeploymentReconciliationProof(
  record: LedgerClaimedState | LedgerReconciliationRequiredState,
): Promise<LedgerReconciliationProof> {
  return reader(record)
}
