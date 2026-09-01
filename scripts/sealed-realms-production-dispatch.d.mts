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

declare const dispatchContextBrand: unique symbol;
declare const preparedDispatchBrand: unique symbol;

export type SealedRealmsProductionDispatchContext = Readonly<{
  [dispatchContextBrand]: true;
}>;
export type SealedRealmsProductionPreparedDispatch = Readonly<{
  [preparedDispatchBrand]: true;
}>;
export type SealedRealmsProductionLaneRequest = Readonly<{
  operation: SealedRealmsProductionOperation;
  authority: SealedRealmsProductionSourceAuthority;
  continuation: Readonly<{
    permit: SealedRealmsProductionWorkflowPermit;
    store: SealedRealmsProductionContinuationStore;
    runId: string;
    runAttempt: string;
    sourceAuthority: SealedRealmsProductionSourceAuthority;
  }>;
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

export function createSealedRealmsProductionDispatchContext(input: Readonly<{
  readGit: (arguments_: readonly string[]) => Uint8Array | string;
  readBinding: (commit: string) => Readonly<Record<string, unknown>>;
  verifyEvidence: (commit: string) => Readonly<{ verifiedSha: string }>;
  permit: SealedRealmsProductionWorkflowPermit;
  continuationStore: SealedRealmsProductionContinuationStore;
  runId: string;
  runAttempt: string | number;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
}>): SealedRealmsProductionDispatchContext;
export function assertSealedRealmsProductionDispatchContext(
  context: unknown,
): SealedRealmsProductionDispatchContext;
export function prepareSealedRealmsProductionDispatch(
  context: SealedRealmsProductionDispatchContext,
  request: Readonly<{
    operation: SealedRealmsProductionOperation;
    workflowInputSha: string;
  }>,
): SealedRealmsProductionPreparedDispatch;
export function openSealedRealmsProductionPreparedDispatch(
  prepared: SealedRealmsProductionPreparedDispatch,
): Readonly<{
  lane: 'g001' | 'g002' | 'ptr' | 'activation';
  request: SealedRealmsProductionLaneRequest;
}>;
export function earlySealedRealmsProductionDispatchResult(
  prepared: SealedRealmsProductionPreparedDispatch,
): Readonly<{
  operation: 'activation-evidence-generate';
  status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE';
}> | undefined;
export function completeSealedRealmsProductionDispatch(
  prepared: SealedRealmsProductionPreparedDispatch,
  value: Readonly<{ status?: SealedRealmsProductionSafeStatus; ready?: boolean }>,
): Readonly<{
  operation: string;
  status?: SealedRealmsProductionSafeStatus;
  ready?: boolean;
}>;
export function rejectSealedRealmsProductionLaneFailure(error: unknown): never;
