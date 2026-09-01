import type { SealedRealmsProductionPrivateState } from './sealed-realms-production-private-state.mjs';
import type {
  SealedRealmsProductionContinuationClaim,
  SealedRealmsProductionContinuationKind,
  SealedRealmsProductionContinuationReconciliation,
  SealedRealmsProductionContinuationStore,
} from './sealed-realms-production-continuation.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

export class SealedRealmsProductionReconciliationError extends Error {
  readonly code: string;
  constructor(code: string);
}

declare const sealedRealmsPublicationConfirmation: unique symbol;
export type SealedRealmsPublicationConfirmation = Readonly<{
  readonly [sealedRealmsPublicationConfirmation]: true;
}>;

export type SealedRealmsProductionContinuationEvidenceBinding = Readonly<{
  subject: string;
  evidenceDigest: string;
  receiptDigests: readonly string[];
  predecessorDigests: readonly string[];
}>;

export function createSealedRealmsProductionPublicationReconciler(input: Readonly<{
  privateState: SealedRealmsProductionPrivateState;
  lane: 'g002' | 'ptr';
  postflight: (input: Readonly<{
    lane: 'g002' | 'ptr';
    marker: Readonly<Record<string, unknown>>;
  }>) => Readonly<{
    outcome: 'adopted' | 'no-effect';
    databaseIdentity: string | null;
    publicationReceiptDigest: string | null;
    observationDigest: string;
    observedAt: string;
  }> | Promise<Readonly<{
    outcome: 'adopted' | 'no-effect';
    databaseIdentity: string | null;
    publicationReceiptDigest: string | null;
    observationDigest: string;
    observedAt: string;
  }>>;
}>): Readonly<{
  inspect: (input: Readonly<Record<string, unknown>>) => Promise<
    Readonly<{ confirmation: SealedRealmsPublicationConfirmation }>
    | Readonly<{ status: 'reconciled' }>
  >;
  reconcile: (input: Readonly<{
    confirmation: SealedRealmsPublicationConfirmation;
  }>) => Promise<Readonly<{
    status: 'reconciled';
  }>>;
  inspectForContinuation: (input: Readonly<{
    marker: Readonly<Record<string, unknown>>;
  }>) => Promise<SealedRealmsProductionContinuationEvidenceBinding>;
  reopenContinuation: () => SealedRealmsProductionContinuationEvidenceBinding;
  consumeContinuationEntry: (input: Readonly<{
    claim: SealedRealmsProductionContinuationClaim;
    store: SealedRealmsProductionContinuationStore;
    sourceAuthority: SealedRealmsProductionSourceAuthority;
    kind: SealedRealmsProductionContinuationKind;
    runId: string;
    runAttempt: string | number;
    subject: string;
    evidenceDigest: string;
    receiptDigests: readonly string[];
    predecessorDigests: readonly string[];
    publish: (input: Readonly<{
      marker: Readonly<Record<string, unknown>>;
    }>) => unknown | Promise<unknown>;
  }>) => Promise<Readonly<{ status: 'submitted' }>>;
  reconcileContinuation: (input: Readonly<{
    reconciliation: SealedRealmsProductionContinuationReconciliation;
    selection: SealedRealmsProductionContinuationEvidenceBinding;
  }>) => Promise<Readonly<{
    outcome: 'effect-applied' | 'no-effect';
    observationDigest: string;
  }>>;
}>;

export function assertSealedRealmsProductionPublicationReconciler(
  reconciler: unknown,
): ReturnType<typeof createSealedRealmsProductionPublicationReconciler>;
