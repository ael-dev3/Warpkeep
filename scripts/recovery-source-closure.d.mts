/** Immutable data derived from complete Git source; does not establish protected workflow authority. */
export function deriveRecoverySourceClosure(
  input: Readonly<{ repositoryRoot: string; sourceCommit: string }>,
): Promise<
  Readonly<{
    source: string;
    sourceCommit: string;
    sourceTree: string;
    sourceClosureSha256: string;
  }>
>;
export function assertRecoverySourceClosureSnapshot(
  input: Readonly<{
    repositoryRoot: string;
    sourceCommit: string;
    sourceTree: string;
  }>,
): void;
