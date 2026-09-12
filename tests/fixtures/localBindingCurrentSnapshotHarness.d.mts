export const CURRENT_SNAPSHOT_WSL_PATH: 'C:/Windows/System32/wsl.exe';

export class CurrentSnapshotHarnessError extends Error {
  readonly code: string;
  constructor(code: string);
}

export type CurrentSnapshotHarnessResult = Readonly<{ stdout: string; stderr: string }>;

export function runBoundedNativeProcess(
  executable: string,
  args: readonly string[],
  options: Readonly<{
    timeoutMs: number;
    cwd?: string;
    env?: NodeJS.ProcessEnv;
  }>,
): CurrentSnapshotHarnessResult;

export function selectCurrentSnapshotSecurityEligibility(input?: Readonly<{
  platform?: NodeJS.Platform;
  launcherExists?: boolean;
  probe?: () => CurrentSnapshotHarnessResult;
}>): Readonly<{ eligible: true } | { eligible: false; reason: string }>;

export function runCurrentSnapshotSecurityFixture(
  fixturePath: string,
): CurrentSnapshotHarnessResult;
