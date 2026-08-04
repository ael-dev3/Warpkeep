export function parseInnerKeepRabbitVerificationMode(
  argumentsList: readonly string[]
): 'repository' | 'production-dist';
export function verifyInnerKeepRabbitRuntimeInstall(options?: Readonly<{
  mode?: 'repository' | 'production-dist';
  argumentsList?: readonly string[];
  outputRoot?: string;
}>): Readonly<{
  mode: 'repository' | 'production-dist';
  files: number;
  bytes: number;
  digest: string;
  presentationOnly: true;
}>;
