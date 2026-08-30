import type {
  SealedRealmsActivationEvidenceConfirmation,
  SealedRealmsProductionActivationEvidenceGenerator,
  SealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

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
  }>) => Promise<Readonly<{
    status: 'activation-evidence-inspected' | 'completed';
    confirmation?: SealedRealmsActivationEvidenceConfirmation;
  }>>;
}>;
export function assertSealedRealmsProductionActivationLane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionActivationLane>;
