import type { PtrProductionExistingUpdateAdapter } from './ptr-production-existing-update-adapter.mjs';
import type { SyntheticExistingUpdateAdapter } from './sealed-realms-production-existing-update.mjs';
import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  createSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import type {
  SealedRealmsProductionDispatchContextInput,
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

export class SealedRealmsProductionPtrLaneError extends Error { readonly code: string; constructor(code: string); }
declare const ptrLaneBrand: unique symbol;
declare const ptrDispatchContextBrand: unique symbol;
export type SealedRealmsProductionPtrLane = Readonly<{ [ptrLaneBrand]: true }>;
export type SealedRealmsProductionPtrDispatchContext =
  Readonly<{ [ptrDispatchContextBrand]: true }>;
export function createSealedRealmsProductionPtrDispatchContext(
  input: SealedRealmsProductionDispatchContextInput,
): SealedRealmsProductionPtrDispatchContext;
export function createSealedRealmsProductionPtrLane(input: Readonly<{
  existingUpdate?: SyntheticExistingUpdateAdapter | PtrProductionExistingUpdateAdapter;
  reconciler: ReturnType<typeof createSealedRealmsProductionPublicationReconciler>;
  bridgeState: SealedRealmsProductionAuthBridgeState;
  createPublishMarker: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  publish: (context: Readonly<{
    sourceCommit: string;
    marker?: Readonly<Record<string, unknown>>;
  }>) => unknown | Promise<unknown>;
  importCore: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  inspectOwnerProvision: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    receiptDigest: string;
    inspectionDigest: string;
  }> | Promise<Readonly<{ receiptDigest: string; inspectionDigest: string }>>;
  provisionOwner: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    receiptDigest: string;
    provisionReceiptDigest: string;
  }> | Promise<Readonly<{ receiptDigest: string; provisionReceiptDigest: string }>>;
  liveInspect: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    receiptDigest: string;
    provisionReceiptDigest: string;
    evidenceDigest: string;
  }> | Promise<Readonly<{
    receiptDigest: string;
    provisionReceiptDigest: string;
    evidenceDigest: string;
  }>>;
}>): SealedRealmsProductionPtrLane;
export function assertSealedRealmsProductionPtrLane(
  lane: unknown,
): SealedRealmsProductionPtrLane;
export function createSealedRealmsProductionPtrDispatcher(input: Readonly<{
  context: SealedRealmsProductionPtrDispatchContext;
  lane: SealedRealmsProductionPtrLane;
}>): SealedRealmsProductionDispatcher;
