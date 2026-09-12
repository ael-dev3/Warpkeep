import type { PreparedAllRealmLinuxBindings } from './local-binding-runtime.mjs';
import type { LocalPreparedOperationBundleFiles } from './local-prepared-bundle-files.mjs';

export class LocalReleaseArtifactInputsError extends Error {
  readonly code: string;
  constructor(code: string);
}

export function derivePreparedLinuxArtifactInputs(...arguments_: []): Promise<Readonly<{
  profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  sourceCommit: string;
  sourceTree: string;
  bindings: PreparedAllRealmLinuxBindings;
  bundles: LocalPreparedOperationBundleFiles;
  recovery: Awaited<ReturnType<typeof import('./local-recovery-bundle-runtime.mjs').derivePreparedLinuxRecoveryBundle>>;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>>;
