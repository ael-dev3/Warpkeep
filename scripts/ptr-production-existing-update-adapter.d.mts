import type { SealedRealmsProductionSourceAuthority } from "./sealed-realms-production-source-authority.mjs";
import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import type { SyntheticExistingUpdateAdapter } from "./sealed-realms-production-existing-update.mjs";
import type { preparePtrSourceBuiltArtifact } from "./ptr-production-publisher.mjs";
import type { SealedRealmsProductionContinuationStore, readSealedRealmsProductionContinuationCompletion } from "./sealed-realms-production-continuation.mjs";
import type { SealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';

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
  observation: Readonly<{ sourceTree: string; runId: string; runAttempt: string }>;
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
export function readPtrExistingUpdateCompletionFromPrivateState(input: Readonly<{
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
  store: SealedRealmsProductionContinuationStore;
}>): PtrExistingUpdateReceipt;
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

declare const ptrAdoption: unique symbol;
export type PtrExistingStateAdoption = Readonly<{ [ptrAdoption]: true }>;
export type PtrExistingStateAdoptionEnvelope = Readonly<{
  schemaVersion: 4;
  profile: 'warpkeep-ptr-existing-state-adoption-v1';
  sourceCommit: string;
  sourceTree: string;
  completionReceipt: PtrExistingUpdateReceipt;
  preObservationJws: string;
  postObservationJws: string;
}>;
export function capturePtrExistingUpdateAdoption(input: Readonly<{
  adapter: PtrProductionExistingUpdateAdapter;
  authority: SealedRealmsProductionSourceAuthority;
  store: SealedRealmsProductionContinuationStore;
  permit: SealedRealmsProductionWorkflowPermit;
  runId: string;
  runAttempt: string;
}>): Promise<PtrExistingStateAdoption>;
export function readPtrExistingStateAdoption(input: Readonly<{
  adoption: PtrExistingStateAdoption;
  authority: SealedRealmsProductionSourceAuthority;
  privateState: SealedRealmsProductionPrivateState;
}>): Promise<PtrExistingStateAdoptionEnvelope>;
