export class LocalReleaseWorkspaceError extends Error {
  readonly code: string;
  constructor(code: string);
}

export interface PreparedLinuxReleaseWorkspace {
  readonly profile: 'warpkeep-spacetime-binding-final-preparation-linux-x64-v1';
  readonly operationRoot: string;
  readonly sourceRoot: string;
  readonly candidateRoot: string;
  readonly sourceCommit: string;
  readonly sourceTree: string;
  assertActive(): void;
  assertCandidateClean(): void;
  /** Install while retaining the captured lock; never marks a release prepared. */
  installOutputs(files: readonly Readonly<{ path: string; bytes: Uint8Array }>[]): Readonly<{
    status: 'installed-unverified'; transactionId: string;
  }>;
  /** Releases the lock; retains private checkouts and diagnostics. */
  release(): void;
}
export function capturePreparedLinuxReleaseWorkspace(...args: []): PreparedLinuxReleaseWorkspace;
