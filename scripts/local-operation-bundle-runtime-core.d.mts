export type OperationBundleLane = 'activation' | 'g001' | 'g002' | 'ptr';

export class OperationBundleRuntimeError extends Error { readonly code: string; }

export interface OperationBundleCycle {
  readonly sourceCommit: string;
  readonly sourceTree: string;
  readonly lane: OperationBundleLane;
  readonly basename: string;
  readonly bundleBytes: number;
  readonly byteDigest: string;
  readonly sourceClosureDigest: string;
  readonly graphManifest: readonly Readonly<{ path: string; byteLength: number; sha256: string }>[];
  readonly exportNames: readonly string[];
  readonly factoryExport: string;
  readonly factoryFailureCode: string;
  readonly bytes: Uint8Array;
}

export function parseOperationBundleWorkerResult(
  source: string,
  expected: Readonly<{
    nonce: string; lane: OperationBundleLane; sourceCommit: string; sourceTree: string; handoffPath: string;
    byteDigest?: string;
  }>,
): Readonly<Record<string, unknown>>;

export function parseOperationBundleLoadResult(
  source: string,
  expected: Readonly<{
    nonce: string; byteDigest: string; exportNames: readonly string[]; factoryFailureCode: string;
  }>,
): Readonly<Record<string, unknown>>;

export function parseOperationBundleCliMetadata(source: string): Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundles: readonly Readonly<Record<string, unknown>>[];
}>;

export function assertReproducibleOperationBundleCycles<T extends OperationBundleCycle>(
  left: T, right: OperationBundleCycle,
): T;

export function verifyOperationBundleMaterializedGraph(
  root: string,
  manifest: readonly Readonly<{ path: string; byteLength: number; sha256: string }>[],
): void;

export function derivePreparedLinuxOperationBundleFilesCore(): Promise<import('./local-prepared-bundle-files.mjs').LocalPreparedOperationBundleFiles>;

export function derivePreparedLinuxOperationBundlesCore(): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundles: readonly Readonly<{
    lane: OperationBundleLane;
    basename: string;
    bytes: Uint8Array;
    byteDigest: string;
    sourceClosureDigest: string;
    graphManifest: readonly Readonly<{ path: string; byteLength: number; sha256: string }>[];
    exportNames: readonly string[];
    factoryExport: string;
    factoryFailureCode: string;
    load: Readonly<{
      profile: 'warpkeep-linux-operation-bundle-load-v1';
      byteDigest: string;
      exportNames: readonly string[];
      factoryFailureCode: string;
    }>;
  }>[];
}>>;
