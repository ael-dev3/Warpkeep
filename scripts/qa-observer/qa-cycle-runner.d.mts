export type QaTier = 'quick' | 'standard' | 'deep';
export type QaBrokerMode = 'off' | 'health' | 'snapshot';
export type QaCheckStatus = 'pass' | 'fail' | 'timeout';

export type QaCheck = Readonly<{
  id: string;
  executable: string;
  args: readonly string[];
  maximumAttempts?: 1 | 2;
  networkBoundary?: 'self-contained-browser';
  timeoutMs: number;
}>;

export type QaCheckResult = Readonly<{
  id: string;
  status: QaCheckStatus;
  durationMs: number;
}>;

export type QaCycleCheckResult = Readonly<{
  id: string;
  status: QaCheckStatus;
  durationMs: number;
  attempts: 0 | 1 | 2;
}>;

export type QaCycleReport = Readonly<{
  version: 2;
  startedAt: string;
  finishedAt: string;
  tier: QaTier;
  broker: QaBrokerMode;
  status: 'pass' | 'fail';
  durationMs: number;
  checks: readonly QaCycleCheckResult[];
}>;

export class QaCycleLockError extends Error {}

export function qaCycleEnvironment(): Readonly<Record<string, string>>;
export function attestQaRepository(repositoryRoot?: string): Promise<void>;
export function acquireQaCycleLock(
  lockPath?: string,
  options?: Readonly<{
    now?: Date;
    pid?: number;
    runId?: string;
    isProcessAlive?: (pid: number) => boolean;
  }>,
): Promise<Readonly<{ runId: string; release(): Promise<void> }>>;
export function tierForLocalHour(hour: number): QaTier;
export function checksForTier(tier: QaTier): readonly QaCheck[];
export function qaNetworkSandboxContract(
  check: QaCheck,
  options?: Readonly<{
    authViteCacheRoot?: string;
    authViteConfigRoot?: string;
    buildOutputRoot?: string;
    npmCache?: string;
    observatoryRoot?: string;
    platform?: NodeJS.Platform;
    profilePath?: string;
    repositoryRoot?: string;
    rootTscCacheRoot?: string;
    rootViteCacheRoot?: string;
    rootViteConfigRoot?: string;
    runtimeHome?: string;
    runtimeTmp?: string;
    socketTmpRoot?: string;
    spacetimeCliRoot?: string;
    spacetimeDistRoot?: string;
    spacetimeV1DistRoot?: string;
    spacetimeV2DistRoot?: string;
    spacetimeV3DistRoot?: string;
    userHome?: string;
  }>,
): Readonly<{ executable: string; args: readonly string[] }>;
export function runCommandCheck(
  check: QaCheck,
  options?: Readonly<{
    cwd?: string;
    timeoutMs?: number;
    environment?: Readonly<Record<string, string>>;
    commandContract?: (check: QaCheck) => Readonly<{
      executable: string;
      args: readonly string[];
    }>;
  }>,
): Promise<QaCheckResult>;
export function probeLocalBrokerHealth(
  options?: Readonly<{
    socketPath?: string;
    timeoutMs?: number;
  }>,
): Promise<void>;
export function probeLocalBrokerSnapshot(
  options?: Readonly<{
    socketPath?: string;
    timeoutMs?: number;
  }>,
): Promise<void>;
export function runQaCycle(options?: Readonly<{
  startedAt?: Date;
  tier?: QaTier | 'auto';
  broker?: QaBrokerMode;
  executeCheck?: (
    check: QaCheck,
    options: Readonly<{ cwd: string; timeoutMs: number }>,
  ) => Promise<QaCheckResult>;
  probeBroker?: () => Promise<void>;
}>): Promise<QaCycleReport>;
export function writePrivateReport(
  report: QaCycleReport,
  options?: Readonly<{
    reportsDirectory?: string;
    now?: Date;
    randomSuffix?: string;
  }>,
): Promise<string>;
export function prunePrivateReports(options?: Readonly<{
  reportsDirectory?: string;
  now?: Date;
  retentionDays?: number;
  maximumReports?: number;
}>): Promise<number>;
