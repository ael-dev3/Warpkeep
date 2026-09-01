import type {
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

type G001Operation =
  | 'preflight'
  | 'g001-policy-observe'
  | 'g001-census-first'
  | 'g001-census-second-inspect'
  | 'g001-census-second-suspend'
  | 'g001-current-state';
declare const g001WorkflowRuntimeBrand: unique symbol;
type G001WorkflowRuntime = Readonly<{ [g001WorkflowRuntimeBrand]: true }>;

export function createSealedRealmsProductionG001WorkflowRuntime(input: Readonly<{
  operation: G001Operation;
  workflowInputSha: string;
}>): G001WorkflowRuntime;

export function runSealedRealmsProductionG001Operation(input: Readonly<{
  runtime: G001WorkflowRuntime;
  operation: G001Operation;
  workflowInputSha: string;
}>): ReturnType<SealedRealmsProductionDispatcher['dispatch']>;
