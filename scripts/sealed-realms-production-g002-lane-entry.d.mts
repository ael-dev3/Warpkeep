import type { SyntheticExistingUpdateAdapter } from './sealed-realms-production-existing-update.mjs';
import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  createSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import type {
  SealedRealmsProductionDispatchContextInput,
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

export class SealedRealmsProductionG002LaneError extends Error { readonly code: string; constructor(code: string); }
declare const g002LaneBrand: unique symbol;
declare const g002DispatchContextBrand: unique symbol;
export type SealedRealmsProductionG002Lane = Readonly<{ [g002LaneBrand]: true }>;
export type SealedRealmsProductionG002DispatchContext =
  Readonly<{ [g002DispatchContextBrand]: true }>;
export function createSealedRealmsProductionG002DispatchContext(
  input: SealedRealmsProductionDispatchContextInput,
): SealedRealmsProductionG002DispatchContext;
export function createSealedRealmsProductionG002Lane(input: Readonly<{
  existingUpdate?: SyntheticExistingUpdateAdapter;
  reconciler: ReturnType<typeof createSealedRealmsProductionPublicationReconciler>;
  bridgeState: SealedRealmsProductionAuthBridgeState;
  createPublishMarker: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  publish: (context: Readonly<{
    sourceCommit: string;
    marker?: Readonly<Record<string, unknown>>;
  }>) => unknown | Promise<unknown>;
  importCore: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  liveInspect: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    receiptDigest: string;
    evidenceDigest: string;
  }> | Promise<Readonly<{
    receiptDigest: string;
    evidenceDigest: string;
  }>>;
}>): SealedRealmsProductionG002Lane;
export function assertSealedRealmsProductionG002Lane(
  lane: unknown,
): SealedRealmsProductionG002Lane;
export function createSealedRealmsProductionG002Dispatcher(input: Readonly<{
  context: SealedRealmsProductionG002DispatchContext;
  lane: SealedRealmsProductionG002Lane;
}>): SealedRealmsProductionDispatcher;
