export class Genesis001LocalNodeProcessError extends Error {
  readonly code: string;
}

export interface Genesis001LocalNodeProcessOptions {
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
  readonly timeout: number;
  readonly maxStdout: number;
  readonly maxStderr: number;
}

export function runGenesis001NodeBoundedProcess(
  executable: string,
  arguments_: readonly string[],
  options: Genesis001LocalNodeProcessOptions,
): Promise<Readonly<{ stdout: Buffer; stderr: Buffer }>>;
