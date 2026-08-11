export type GreaterRealmTrustedToolchainReceipt = Readonly<{
  manifestSha256: string;
  profile: string;
  tsxCli: string;
  verifiedPackageCount: number;
}>;

export function verifyGreaterRealmTrustedToolchain(input?: Readonly<{
  repositoryRoot?: string;
  runtimeNode?: string;
  platform?: string;
  architecture?: string;
}>): GreaterRealmTrustedToolchainReceipt;

export function reverifyGreaterRealmTrustedToolchain(
  receipt: GreaterRealmTrustedToolchainReceipt,
  input?: Readonly<{
    repositoryRoot?: string;
    runtimeNode?: string;
    platform?: string;
    architecture?: string;
  }>,
): GreaterRealmTrustedToolchainReceipt;

export function computeGreaterRealmPackageTree(
  packageRoot: string,
  options?: Readonly<{ excludedFiles?: readonly string[] }>,
): Readonly<{
  byteCount: number;
  fileCount: number;
  treeSha256: string;
}>;

export const greaterRealmToolchainBootstrapTestSeams: Readonly<{
  assertInvocation(
    arguments_: readonly string[],
    environment: Readonly<Record<string, string | undefined>>,
    repositoryRoot: string,
  ): void;
}>;
