export class SealedRealmsProductionBundlesError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type SealedRealmsProductionBundleLane = 'activation' | 'g001' | 'g002' | 'ptr';
export type SealedRealmsProductionWorkflowFactory =
  | 'createSealedRealmsProductionActivationWorkflowRuntime'
  | 'createSealedRealmsProductionG001WorkflowRuntime'
  | 'createSealedRealmsProductionG002WorkflowRuntime'
  | 'createSealedRealmsProductionPtrWorkflowRuntime';
export type SealedRealmsProductionWorkflowFactoryFailure =
  | 'SEALED_REALMS_ACTIVATION_WORKFLOW_INPUT_INVALID'
  | 'SEALED_REALMS_G001_WORKFLOW_INPUT_INVALID'
  | 'SEALED_REALMS_G002_WORKFLOW_INPUT_INVALID'
  | 'SEALED_REALMS_PTR_WORKFLOW_INPUT_INVALID';
export type SealedRealmsProductionBundleGraphMember = Readonly<{
  path: string;
  byteLength: number;
  sha256: string;
}>;
export type SealedRealmOperationBundleSpecification = Readonly<{
  entryPath: string;
  basename: string;
  requiredGraphPaths: readonly string[];
  factoryExport: SealedRealmsProductionWorkflowFactory;
  factoryFailureCode: SealedRealmsProductionWorkflowFactoryFailure;
  exportNames: readonly [SealedRealmsProductionWorkflowFactory, string];
}>;
export type SealedRealmOperationBundle = Readonly<{
  lane: SealedRealmsProductionBundleLane;
  basename: string;
  bytes: Uint8Array;
  byteDigest: string;
  sourceClosureDigest: string;
  graphManifest: readonly SealedRealmsProductionBundleGraphMember[];
  exportNames: readonly [SealedRealmsProductionWorkflowFactory, string];
  factoryExport: SealedRealmsProductionWorkflowFactory;
  factoryFailureCode: SealedRealmsProductionWorkflowFactoryFailure;
}>;

export function buildSealedRealmOperationBundle(input: Readonly<{
  lane: SealedRealmsProductionBundleLane;
  sourceRoot: string;
  build: typeof import('esbuild').build;
}>): Promise<SealedRealmOperationBundle>;

export function getSealedRealmOperationBundleSpecification(
  lane: SealedRealmsProductionBundleLane,
): SealedRealmOperationBundleSpecification;

export function deriveSealedRealmOperationBundleSourceClosureDigest(
  lane: SealedRealmsProductionBundleLane,
  manifest: readonly SealedRealmsProductionBundleGraphMember[],
): string;
