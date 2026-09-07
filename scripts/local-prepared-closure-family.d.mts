/** Prospective closure outputs, not installed release or deployment authority. */
export function derivePreparedClosureFamily(options: Readonly<{ repositoryRoot: string }>): Promise<Readonly<{
  memberCount: number;
  manifestSha256: string;
  files: readonly Readonly<{ path: string; bytes: Uint8Array }>[];
}>>;
