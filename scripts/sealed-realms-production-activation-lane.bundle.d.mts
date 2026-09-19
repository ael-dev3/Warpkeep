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
}>): Promise<ActivationWorkflowRuntime>;

/** Fixed desktop read of authenticated retained history; no workflow/effect authority. */
export function readSealedRealmsProductionRetainedFixtureSources(input: Readonly<{
  operatingCommit: string; githubToken: Buffer | null;
}>): Promise<Readonly<Record<string, unknown>>>;

export function runSealedRealmsProductionActivationOperation(input: Readonly<{
  runtime: ActivationWorkflowRuntime;
  operation: SealedRealmsProductionActivationOperation;
  workflowInputSha: string;
}>): ReturnType<SealedRealmsProductionDispatcher['dispatch']>;
