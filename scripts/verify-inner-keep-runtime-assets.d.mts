export type InnerKeepAssetVerificationMode = 'repository' | 'production-dist';

export function parseInnerKeepAssetVerificationMode(
  argumentsList: readonly string[]
): InnerKeepAssetVerificationMode;
export function verifyInnerKeepRuntimeAssetInstall(options?: Readonly<{
  mode?: InnerKeepAssetVerificationMode;
  argumentsList?: readonly string[];
  outputRoot?: string;
}>): Readonly<{
  mode: InnerKeepAssetVerificationMode;
  files: number;
  models: number;
  previews: number;
  bytes: number;
  digest: string;
  reusedTrees: number;
}>;
export function main(argumentsList?: readonly string[]): void;
