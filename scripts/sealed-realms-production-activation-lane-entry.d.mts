import type {
  SealedRealmsActivationEvidenceConfirmation,
  SealedRealmsProductionActivationEvidenceGenerator,
  SealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';
import type { SealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';

export class SealedRealmsProductionActivationLaneError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionActivationLane(input: Readonly<{
  bridgeState: SealedRealmsProductionAuthBridgeState;
  /** Captured at trusted Task 6E initialization; never dispatch input. */
  task6EGenerator?: SealedRealmsProductionActivationEvidenceGenerator;
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'activation-evidence-inspect' | 'activation-evidence-generate';
    authority: SealedRealmsProductionSourceAuthority;
    input?: Readonly<{ confirmation: SealedRealmsActivationEvidenceConfirmation }>;
    continuation?: Readonly<{
      permit: SealedRealmsProductionWorkflowPermit;
      store: SealedRealmsProductionContinuationStore;
      runId: string;
      runAttempt: string;
    }>;
  }>) => Promise<Readonly<{
    status: 'activation-evidence-inspected' | 'completed';
    confirmation?: SealedRealmsActivationEvidenceConfirmation;
  }>>;
}>;
export function assertSealedRealmsProductionActivationLane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionActivationLane>;
