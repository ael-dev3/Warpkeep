import type {
  SEALED_REALMS_OPERATIONS,
  SealedRealmsProductionSourceAuthority,
} from './sealed-realms-production-source-authority.mjs';
import type {
  SealedRealmsProductionContinuationStore,
} from './sealed-realms-production-continuation.mjs';
import type {
  SealedRealmsProductionWorkflowPermit,
} from './sealed-realms-production-workflow-authority.mjs';

export class SealedRealmsProductionDispatcherError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type SealedRealmsProductionOperation = (typeof SEALED_REALMS_OPERATIONS)[number];
export type SealedRealmsProductionSafeStatus =
  | 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE'
  | 'activation-evidence-inspected'
  | 'completed'
  | 'cross-linked'
  | 'current-state-inspected'
  | 'import-inspected'
  | 'live-inspected'
  | 'owner-provision-inspected'
  | 'owner-provisioned'
  | 'preflight-inspected'
  | 'publish-inspected'
  | 'submitted'
  | 'unavailable';
export type SealedRealmsProductionLane = Readonly<{
  execute: (input: Readonly<{
    operation: SealedRealmsProductionOperation;
    authority: SealedRealmsProductionSourceAuthority;
    continuation: Readonly<{
      permit: SealedRealmsProductionWorkflowPermit;
      store: SealedRealmsProductionContinuationStore;
      runId: string;
      runAttempt: string;
      sourceAuthority: SealedRealmsProductionSourceAuthority;
    }>;
  }>) => Readonly<{
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
  }> | Promise<Readonly<{
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
  }>>;
}>;

export type SealedRealmsProductionDispatcher = Readonly<{
  dispatch: (request: Readonly<{
    operation: SealedRealmsProductionOperation;
    workflowInputSha: string;
  }>) => Promise<Readonly<{
    operation: string;
    status?: SealedRealmsProductionSafeStatus;
    ready?: boolean;
  }>>;
}>;

export function createSealedRealmsProductionDispatcher(input: Readonly<{
  readGit: (arguments_: readonly string[]) => Uint8Array | string;
  readBinding: (commit: string) => Readonly<Record<string, unknown>>;
  verifyEvidence: (commit: string) => Readonly<{ verifiedSha: string }>;
  permit: SealedRealmsProductionWorkflowPermit;
  continuationStore: SealedRealmsProductionContinuationStore;
  runId: string;
  runAttempt: string | number;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
  g001Lane?: SealedRealmsProductionLane;
  g002Lane?: SealedRealmsProductionLane;
  ptrLane?: SealedRealmsProductionLane;
  activationLane?: SealedRealmsProductionLane;
}>): SealedRealmsProductionDispatcher;

export function assertSealedRealmsProductionDispatcher(
  dispatcher: unknown,
): SealedRealmsProductionDispatcher;
