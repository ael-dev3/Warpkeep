/** Internal derivation only: no installation, source authentication or release authority. */
export function derivePreparedSourcePins(options: Readonly<{ repositoryRoot: string }>): Readonly<{
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>;
