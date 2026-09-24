export class LocalBindingRuntimeProcessError extends Error {
  readonly code: string;
}

export function runLocalBindingBoundedProcess(
  executable: string,
  args: readonly string[],
  options: Readonly<{
    cwd: string;
    env: Readonly<Record<string, string | undefined>>;
    fd3?: string;
    /** Caller-owned open descriptor duplicated to child FD4; never copied into argv or environment. */
    inheritedFd4?: number;
    timeout: number;
    maxOutput: number;
    containProcessGroup?: boolean;
    /** Return a cleanly contained nonzero exit as bounded output and status instead of rejecting. */
    allowNonzeroExit?: boolean;
  }>,
): Promise<Readonly<{ stdout: string; stderr: string; exitCode?: number | null; signal?: string | null }>>;
