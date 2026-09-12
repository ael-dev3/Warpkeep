export function writeRecoverySourceClosureArtifact(): Promise<
  Readonly<{
    sourceCommit: string;
    sourceTree: string;
    sourceClosureSha256: string;
  }>
>;
