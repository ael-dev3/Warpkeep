import type {
  SealedRealmsProductionDispatcher,
} from './sealed-realms-production-dispatch.mjs';

type SealedRealmsProductionActivationOperation =
  | 'activation-evidence-inspect'
  | 'activation-evidence-generate';
declare const activationWorkflowRuntimeBrand: unique symbol;
type ActivationWorkflowRuntime = Readonly<{
  [activationWorkflowRuntimeBrand]: true;
}>;

export function createSealedRealmsProductionActivationWorkflowRuntime(input: Readonly<{
  operation: SealedRealmsProductionActivationOperation;
  workflowInputSha: string;
}>): ActivationWorkflowRuntime;

export function runSealedRealmsProductionActivationOperation(input: Readonly<{
  runtime: ActivationWorkflowRuntime;
  operation: SealedRealmsProductionActivationOperation;
  workflowInputSha: string;
}>): ReturnType<SealedRealmsProductionDispatcher['dispatch']>;
