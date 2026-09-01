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

export type SealedRealmsProductionDispatchContextInput = Readonly<{
  readGit: (arguments_: readonly string[]) => Uint8Array | string;
  readBinding: (commit: string) => Readonly<Record<string, unknown>>;
  verifyEvidence: (commit: string) => Readonly<{ verifiedSha: string }>;
  permit: SealedRealmsProductionWorkflowPermit;
  continuationStore: SealedRealmsProductionContinuationStore;
  runId: string;
  runAttempt: string | number;
  sourceAuthority: SealedRealmsProductionSourceAuthority;
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

export function assertSealedRealmsProductionDispatchContextInput(
  input: SealedRealmsProductionDispatchContextInput,
): void;
export function authenticateSealedRealmsProductionDispatch(input: Readonly<{
  request: Readonly<{
    operation: SealedRealmsProductionOperation;
    workflowInputSha: string;
  }>;
  readGit: SealedRealmsProductionDispatchContextInput['readGit'];
  readBinding: SealedRealmsProductionDispatchContextInput['readBinding'];
  verifyEvidence: SealedRealmsProductionDispatchContextInput['verifyEvidence'];
  sourceAuthority: SealedRealmsProductionSourceAuthority;
}>): Readonly<{
  operation: SealedRealmsProductionOperation;
  lane: 'g001' | 'g002' | 'ptr' | 'activation';
}>;
export function earlySealedRealmsProductionDispatchResult(
  operation: SealedRealmsProductionOperation,
): Readonly<{
  operation: 'activation-evidence-generate';
  status: 'SEALED_REALMS_TASK_6E_AUTHORITY_UNAVAILABLE';
}> | undefined;
export function completeSealedRealmsProductionDispatch(
  operation: SealedRealmsProductionOperation,
  value: Readonly<{ status?: SealedRealmsProductionSafeStatus; ready?: boolean }>,
): Readonly<{
  operation: string;
  status?: SealedRealmsProductionSafeStatus;
  ready?: boolean;
}>;
export function rejectSealedRealmsProductionLaneFailure(error: unknown): never;
