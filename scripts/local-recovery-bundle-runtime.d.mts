/** Local preparation only; no deployment authority. */
export function derivePreparedLinuxRecoveryBundle(): Promise<Readonly<{
  sourceCommit: string; sourceTree: string; path: string; bytes: Buffer; sha256: string;
  inputs: readonly Readonly<{path: string; byteLength: number; sha256: string}>[];
}>>;
