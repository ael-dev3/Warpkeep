/** Fixed native history read; no caller receipt, verifier, repository or workflow context. */
export function readSealedRealmsProductionRetainedFixtureSources(input: Readonly<{
  operatingCommit: string; githubToken: Buffer | null;
}>): Promise<Readonly<Record<string, unknown>>>;
