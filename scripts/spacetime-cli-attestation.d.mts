export type SpacetimeCliProvenance = Readonly<{
  version: '2.6.1';
  commit: '052c83fe984a4c4eb7bb4f9afa5c6b1903891d87';
  cliExecutableSha256: string;
  standaloneExecutableSha256: string;
}>;

export type AttestedSpacetimeCli = Readonly<{
  path: string;
  directory: string;
  digest: string;
  provenance: SpacetimeCliProvenance;
  verify: () => void;
  cleanup: () => void;
}>;

export function verifyPinnedCliAttestation(
  versionOutput: string,
  digest: string,
  platform?: string,
  arch?: string,
): void;

export function attestPinnedSpacetimeCli(
  executable: string,
  spawnSyncProcess?: (...arguments_: readonly unknown[]) => unknown,
  sourceEnvironment?: Readonly<Record<string, string | undefined>>,
): AttestedSpacetimeCli;
