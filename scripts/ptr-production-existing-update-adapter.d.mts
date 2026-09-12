import type { SealedRealmsProductionSourceAuthority } from "./sealed-realms-production-source-authority.mjs";
import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import type { SyntheticExistingUpdateAdapter } from "./sealed-realms-production-existing-update.mjs";
import type { preparePtrSourceBuiltArtifact } from "./ptr-production-publisher.mjs";
import type { SealedRealmsProductionContinuationStore, readSealedRealmsProductionContinuationCompletion } from "./sealed-realms-production-continuation.mjs";

declare const productionUpdate: unique symbol;
export type PtrProductionExistingUpdateAdapter = Readonly<{
  [productionUpdate]: true;
  inspectForContinuation: SyntheticExistingUpdateAdapter["inspectForContinuation"];
  reopenContinuation: SyntheticExistingUpdateAdapter["reopenContinuation"];
  consumeContinuationEntry: SyntheticExistingUpdateAdapter["consumeContinuationEntry"];
  reconcileContinuation: SyntheticExistingUpdateAdapter["reconcileContinuation"];
  inspectResult: () => Readonly<Record<string, unknown>> | undefined;
  dispose: () => void;
}>;
export type PtrProductionExistingUpdateInput = Readonly<{
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
  artifact: ReturnType<typeof preparePtrSourceBuiltArtifact>;
}>;
export function createPtrProductionExistingUpdateAdapter(
  input: PtrProductionExistingUpdateInput,
): PtrProductionExistingUpdateAdapter;
export function isPtrProductionExistingUpdateAdapter(
  value: unknown,
): value is PtrProductionExistingUpdateAdapter;

declare const ptrCompletion: unique symbol;
export type PtrExistingUpdateCompletion = Readonly<{ [ptrCompletion]: true }>;
export type PtrExistingUpdateReceipt = Readonly<{
  schemaVersion: 1;
  profile: 'warpkeep-ptr-existing-update-receipt-v1';
  binding: Readonly<Record<string, string>>;
  inspectionDigest: string;
  inspectionRecordDigest: string;
  submissionRecordDigest: string;
  acknowledgementRecordDigest: string | null;
  completionRecordDigest: string;
  predecessorDigest: string | null;
  predecessorReceiptDigest: string | null;
  beforeProgram: string;
  preservation: Readonly<Record<string, unknown>>;
  planDigest: string;
  installedPlanDigest: string;
  inspectionHostObservationDigest: string;
  acknowledgement: 'received' | 'not-received';
  responseDigest: string | null;
  submission: Readonly<{ runId: string; runAttempt: number; observedAt: string }>;
  completionObservedAt: string;
  continuation: ReturnType<typeof readSealedRealmsProductionContinuationCompletion>;
}>;
export function exportPtrExistingUpdateCompletion(input: Readonly<{
  adapter: PtrProductionExistingUpdateAdapter;
  authority: SealedRealmsProductionSourceAuthority;
  store: SealedRealmsProductionContinuationStore;
}>): PtrExistingUpdateCompletion;
export function readPtrExistingUpdateCompletion(input: Readonly<{
  completion: PtrExistingUpdateCompletion;
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
}>): PtrExistingUpdateReceipt;
