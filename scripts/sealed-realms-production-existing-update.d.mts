import type { PtrProductionExistingUpdateAdapter, PtrProductionExistingUpdateInput } from './ptr-production-existing-update-adapter.mjs';
import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionContinuationInput, SealedRealmsProductionContinuationClaim,
  SealedRealmsProductionContinuationReconciliation, SealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';

export class SealedRealmsExistingUpdateError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionExistingUpdateAdapter(input: PtrProductionExistingUpdateInput): PtrProductionExistingUpdateAdapter;
type Binding = Readonly<Pick<SealedRealmsProductionContinuationInput,
  'subject' | 'evidenceDigest' | 'receiptDigests' | 'predecessorDigests'>>;
declare const syntheticUpdate: unique symbol;
export type SyntheticExistingUpdateAdapter = Readonly<{
  [syntheticUpdate]: true;
  inspectForContinuation(input: Readonly<{ authority: SealedRealmsProductionSourceAuthority }>): Promise<Binding>;
  reopenContinuation(input: Readonly<{ authority: SealedRealmsProductionSourceAuthority }>): Binding;
  consumeContinuationEntry(input: SealedRealmsProductionContinuationInput & Readonly<{
    claim: SealedRealmsProductionContinuationClaim; selection: Binding;
  }>): Promise<Readonly<{ status: 'completed' }>>;
  reconcileContinuation(input: Readonly<{
    reconciliation: SealedRealmsProductionContinuationReconciliation;
    store: SealedRealmsProductionContinuationStore;
    sourceAuthority: SealedRealmsProductionSourceAuthority;
    selection: Binding;
  }>): Promise<Readonly<{ outcome: 'effect-applied' | 'no-effect'; observationDigest: string }>>;
  /** Diagnostic synthetic record only; no activation or production receipt accepts this profile. */
  inspectResult(): Readonly<Record<string, unknown>> | undefined;
  dispose(): void;
}>;
export function createSyntheticExistingUpdateAdapter(input: Readonly<{
  lane: 'g002' | 'ptr'; origin: string; databaseIdentity: string; sourceCommit: string;
  candidateBytes: Uint8Array; candidateSchemaBytes: Uint8Array;
  readAdminToken: () => string | Promise<string>;
  privateState: SealedRealmsProductionPrivateState; runtimeRoot: string;
}>): SyntheticExistingUpdateAdapter;
export function assertSealedRealmsExistingUpdateAdapter(adapter: unknown, lane: 'g002' | 'ptr'): SyntheticExistingUpdateAdapter | PtrProductionExistingUpdateAdapter;
