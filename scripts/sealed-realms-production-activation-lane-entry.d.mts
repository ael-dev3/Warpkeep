import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';
import type { SealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';
import type {
  SealedRealmsProductionDispatchContext,
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

export class SealedRealmsProductionActivationLaneError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionActivationLane(input: Readonly<{
  bridgeState: SealedRealmsProductionAuthBridgeState;
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'activation-evidence-inspect' | 'activation-evidence-generate';
    authority: SealedRealmsProductionSourceAuthority;
    continuation: Readonly<{
      permit: SealedRealmsProductionWorkflowPermit;
      store: SealedRealmsProductionContinuationStore;
      runId: string;
      runAttempt: string;
      sourceAuthority: SealedRealmsProductionSourceAuthority;
    }>;
  }>) => Promise<Readonly<{
    status: 'activation-evidence-inspected';
  }>>;
}>;
export function assertSealedRealmsProductionActivationLane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionActivationLane>;
export function createSealedRealmsProductionActivationDispatcher(input: Readonly<{
  context: SealedRealmsProductionDispatchContext;
  lane: ReturnType<typeof createSealedRealmsProductionActivationLane>;
}>): SealedRealmsProductionDispatcher;
