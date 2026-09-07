export { OperationBundleRuntimeError } from './local-operation-bundle-runtime-core.mjs';

export function derivePreparedLinuxOperationBundleFiles(...arguments_: []): Promise<import('./local-prepared-bundle-files.mjs').LocalPreparedOperationBundleFiles>;

export function derivePreparedLinuxOperationBundles(...arguments_: []): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bundles: readonly Readonly<{
    lane: 'activation' | 'g001' | 'g002' | 'ptr';
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
