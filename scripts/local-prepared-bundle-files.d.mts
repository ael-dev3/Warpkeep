type PreparedOperationBundles = Awaited<ReturnType<
  typeof import('./local-operation-bundle-runtime.mjs').derivePreparedLinuxOperationBundles
>>;

export class LocalPreparedBundleFilesError extends Error {
  readonly code: 'LOCAL_PREPARED_BUNDLE_FILES_INVALID';
  constructor();
}

export type LocalPreparedOperationBundleFile = Readonly<{
  path: string;
  bytes: Uint8Array;
}>;

export type LocalPreparedOperationBundleFiles = Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  files: readonly LocalPreparedOperationBundleFile[];
}>;

export function derivePreparedOperationBundleFiles(input: Readonly<{
  bundles: PreparedOperationBundles;
  entryDeclarations: Map<string, Uint8Array>;
}>): LocalPreparedOperationBundleFiles;
