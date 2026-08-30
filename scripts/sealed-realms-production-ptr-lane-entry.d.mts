import type {
  SealedRealmsBridgeGateConfirmation,
  SealedRealmsOwnerProvisionConfirmation,
  SealedRealmsProductionAuthBridgeState,
} from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  createSealedRealmsProductionPublicationReconciler,
  SealedRealmsPublicationConfirmation,
} from './sealed-realms-production-reconciliation.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';

export class SealedRealmsProductionPtrLaneError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionPtrLane(input: Readonly<{
  reconciler: ReturnType<typeof createSealedRealmsProductionPublicationReconciler>;
  bridgeState: SealedRealmsProductionAuthBridgeState;
  createPublishMarker: (context: Readonly<{ sourceCommit: string }>) => unknown | Promise<unknown>;
  publish: (context: Readonly<{
    sourceCommit: string;
    confirmation: SealedRealmsPublicationConfirmation;
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
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'ptr-publish-inspect' | 'ptr-publish-apply' | 'ptr-import-inspect'
      | 'ptr-import-apply' | 'ptr-owner-provision-inspect' | 'ptr-owner-provision'
      | 'ptr-live-inspect';
    authority: SealedRealmsProductionSourceAuthority;
    input?: Readonly<{
      confirmation: SealedRealmsPublicationConfirmation | SealedRealmsBridgeGateConfirmation
        | SealedRealmsOwnerProvisionConfirmation;
    }>;
  }>) => Promise<Readonly<{
    status: 'publish-inspected' | 'submitted' | 'import-inspected' | 'cross-linked'
      | 'owner-provision-inspected' | 'owner-provisioned' | 'live-inspected';
    confirmation?: SealedRealmsPublicationConfirmation | SealedRealmsBridgeGateConfirmation
      | SealedRealmsOwnerProvisionConfirmation;
  }>>;
}>;
export function assertSealedRealmsProductionPtrLane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionPtrLane>;
