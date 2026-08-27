export type AttestedSpacetimeCli = Readonly<{
  path: string;
  directory: string;
  digest: string;
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
