export type InnerKeepPopulationVerificationMode = 'repository' | 'production-dist';

export function parseInnerKeepPopulationVerificationMode(
  argumentsList: readonly string[]
): InnerKeepPopulationVerificationMode;
export function verifyInnerKeepPopulationRuntimeInstall(options?: Readonly<{
  mode?: InnerKeepPopulationVerificationMode;
  argumentsList?: readonly string[];
  outputRoot?: string;
}>): Readonly<{
  mode: InnerKeepPopulationVerificationMode;
  files: number;
  bytes: number;
  digest: string;
  presentationOnly: true;
}>;
export function main(argumentsList?: readonly string[]): void;
