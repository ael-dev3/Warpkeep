/** Internal comparison only; no deployment authority. */
export function verifyPreparedReleaseCandidateBytes(options: Readonly<{
  sourceRoot: string;
  candidateRoot: string;
  sourceCommit: string;
  sourceTree: string;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>): Readonly<{
  sourceCommit: string;
  sourceTree: string;
  checkedSourceFiles: number;
  checkedCandidateFiles: number;
  outputFiles: number;
  preservedSourceFiles: number;
}>;
