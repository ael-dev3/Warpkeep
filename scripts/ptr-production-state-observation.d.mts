import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { PtrUpdateObservation, PtrUpdateObservationContext,
  G002UpdateObservation, G002UpdateObservationContext } from '../services/release-recovery/src/ptrObservation.js';
export function observePtrProductionState(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  reattest: () => Promise<void>;
  sourceCommit: string; sourceTree: string; runId: string; runAttempt: string;
}>): Promise<Readonly<{ operation: 'ptr-state-inspect'; status: 'state-inspected' }>>;
type PtrProductionUpdateObservationInput = Readonly<{
  reattest: () => Promise<void>;
  sourceCommit: string; sourceTree: string; runId: string; runAttempt: string;
}> & (Readonly<{
  context: Extract<PtrUpdateObservationContext, { phase: 'pre' }>;
}> | Readonly<{
  context: Extract<PtrUpdateObservationContext, { phase: 'post' }>;
  preObservationJws: string;
}>);
export function requestPtrProductionUpdateObservation(
  input: PtrProductionUpdateObservationInput,
): Promise<Readonly<{ compact: string; observation: PtrUpdateObservation }>>;
type G002ProductionUpdateObservationInput = Readonly<{
  reattest: () => Promise<void>;
  sourceCommit: string; sourceTree: string; runId: string; runAttempt: string;
}> & (Readonly<{
  context: Extract<G002UpdateObservationContext, { phase: 'pre' }>;
}> | Readonly<{
  context: Extract<G002UpdateObservationContext, { phase: 'post' }>;
  preObservationJws: string;
}>);
export function requestG002ProductionUpdateObservation(
  input: G002ProductionUpdateObservationInput,
): Promise<Readonly<{ compact: string; observation: G002UpdateObservation }>>;
