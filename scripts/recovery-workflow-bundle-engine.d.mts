import type { build } from 'esbuild';
/** Caller must attest the compiler and source; this is not an authority API. */
export function buildRecoveryWorkflowModule(sourceRoot: string, compiler: typeof build, kind: 'artifact' | 'claim'):
  ReturnType<typeof import('./build-recovery-workflow-artifact-module.mjs').buildRecoveryWorkflowArtifactModule>;
