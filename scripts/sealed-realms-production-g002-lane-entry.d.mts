import type { SealedRealmsProductionAuthBridgeState } from './sealed-realms-production-auth-bridge-state.mjs';
import type {
  createSealedRealmsProductionPublicationReconciler,
} from './sealed-realms-production-reconciliation.mjs';
import type { SealedRealmsProductionSourceAuthority } from './sealed-realms-production-source-authority.mjs';
import type { SealedRealmsProductionContinuationStore } from './sealed-realms-production-continuation.mjs';
import type { SealedRealmsProductionWorkflowPermit } from './sealed-realms-production-workflow-authority.mjs';

export class SealedRealmsProductionG002LaneError extends Error { readonly code: string; constructor(code: string); }
export function createSealedRealmsProductionG002Lane(input: Readonly<{
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
}>): Readonly<{
  execute: (input: Readonly<{
    operation: 'g002-publish-inspect' | 'g002-publish-apply' | 'g002-import-inspect'
      | 'g002-import-apply' | 'g002-live-inspect';
    authority: SealedRealmsProductionSourceAuthority;
    continuation: Readonly<{
      permit: SealedRealmsProductionWorkflowPermit;
      store: SealedRealmsProductionContinuationStore;
      runId: string;
      runAttempt: string;
      sourceAuthority: SealedRealmsProductionSourceAuthority;
    }>;
  }>) => Promise<Readonly<{
    status: 'publish-inspected' | 'submitted' | 'import-inspected' | 'cross-linked'
      | 'live-inspected' | 'completed';
  }>>;
}>;
export function assertSealedRealmsProductionG002Lane(
  lane: unknown,
): ReturnType<typeof createSealedRealmsProductionG002Lane>;
