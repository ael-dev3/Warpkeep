/** Internal rollback-capable publication only; does not mark a release prepared. */
export function installPreparedReleaseTransaction(input: Readonly<{
  candidateRoot: string;
  sourceCommit: string;
  sourceTree: string;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>): Readonly<{ status: 'installed-unverified'; transactionId: string }>;
