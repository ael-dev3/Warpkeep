import type {
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

type PtrOperation =
  | 'ptr-state-inspect'
  | 'ptr-update-inspect'
  | 'ptr-update-apply'
  | 'ptr-publish-inspect'
  | 'ptr-publish-apply'
  | 'ptr-import-inspect'
  | 'ptr-import-apply'
  | 'ptr-owner-provision-inspect'
  | 'ptr-owner-provision'
  | 'ptr-live-inspect';
declare const ptrWorkflowRuntimeBrand: unique symbol;
type PtrWorkflowRuntime = Readonly<{ [ptrWorkflowRuntimeBrand]: true }>;

export function createSealedRealmsProductionPtrWorkflowRuntime(input: Readonly<{
  operation: PtrOperation;
  workflowInputSha: string;
}>): Promise<PtrWorkflowRuntime>;

export function runSealedRealmsProductionPtrOperation(input: Readonly<{
  runtime: PtrWorkflowRuntime;
  operation: PtrOperation;
  workflowInputSha: string;
}>): ReturnType<SealedRealmsProductionDispatcher['dispatch']>
  | Promise<Readonly<{ operation: 'ptr-state-inspect'; status: 'state-inspected' }>>;
