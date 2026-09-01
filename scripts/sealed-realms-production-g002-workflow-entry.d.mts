import type {
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

type G002Operation =
  | 'g002-publish-inspect'
  | 'g002-publish-apply'
  | 'g002-import-inspect'
  | 'g002-import-apply'
  | 'g002-live-inspect';
declare const g002WorkflowRuntimeBrand: unique symbol;
type G002WorkflowRuntime = Readonly<{ [g002WorkflowRuntimeBrand]: true }>;

export function createSealedRealmsProductionG002WorkflowRuntime(input: Readonly<{
  operation: G002Operation;
  workflowInputSha: string;
}>): G002WorkflowRuntime;

export function runSealedRealmsProductionG002Operation(input: Readonly<{
  runtime: G002WorkflowRuntime;
  operation: G002Operation;
  workflowInputSha: string;
}>): ReturnType<SealedRealmsProductionDispatcher['dispatch']>;
