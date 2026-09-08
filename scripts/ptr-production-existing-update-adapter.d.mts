import type { SealedRealmsProductionSourceAuthority } from "./sealed-realms-production-source-authority.mjs";
import type { SealedRealmsProductionPrivateState } from "./sealed-realms-production-private-state.mjs";
import type { SyntheticExistingUpdateAdapter } from "./sealed-realms-production-existing-update.mjs";
import type { preparePtrSourceBuiltArtifact } from "./ptr-production-publisher.mjs";

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
