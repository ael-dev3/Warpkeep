import type {
  SealedRealmsBridgeGateConfirmation,
  SealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  createSealedRealmsProductionPublicationReconciler,
  SealedRealmsPublicationConfirmation,
} from './sealed-realms-production-reconciliation.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

export class SealedRealmsProductionG002LaneError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionG002Lane(input: Readonly<{
  reconciler: ReturnType<typeof createSealedRealmsProductionPublicationReconciler>;
  bridgeState: SealedRealmsProductionAuthBridgeState;
  createPublishMarker: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  publish: (context: Readonly<{
    sourceCommit: string;
    confirmation: SealedRealmsPublicationConfirmation;
  }>) => unknown | Promise<unknown>;
  importCore: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  liveInspect: (context: Readonly<{ sourceCommit: string }>) => Readonly<{
    receiptDigest: string;
    evidenceDigest: string;
  }> | Promise<Readonly<{
    receiptDigest: string;
    evidenceDigest: string;
  }>>;
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'g002-publish-inspect' | 'g002-publish-apply' | 'g002-import-inspect'
      | 'g002-import-apply' | 'g002-live-inspect';
    authority: SealedRealmsProductionSourceAuthority;
    input?: Readonly<{ confirmation: SealedRealmsPublicationConfirmation | SealedRealmsBridgeGateConfirmation }>;
  }>) => Promise<Readonly<{
    status: 'publish-inspected' | 'submitted' | 'import-inspected' | 'cross-linked' | 'live-inspected';
    confirmation?: SealedRealmsPublicationConfirmation | SealedRealmsBridgeGateConfirmation;
  }>>;
}>;
export function assertSealedRealmsProductionG002Lane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionG002Lane>;
