/** Local preparation only; no deployment authority. */
export function derivePreparedLinuxRecoveryBundle(): Promise<Readonly<{
  profile: 'warpkeep-recovery-bundle-preparation-linux-x64-v1';
  sourceCommit: string; sourceTree: string; path: string; bytes: Buffer; sha256: string;
  inputs: readonly Readonly<{path: string; byteLength: number; sha256: string}>[];
  files: readonly Readonly<{path: string; bytes: Uint8Array}>[];
}>>;
