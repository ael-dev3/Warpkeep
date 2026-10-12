export class GithubActionsBudgetError extends Error { readonly code: string; }
export type GithubActionsBudgetConfig = Readonly<{
  schemaVersion: 1; dayBoundary: 'UTC'; enforcement: 'repository-actions-disabled';
  admissionEnabled: boolean; dailyRunnerMinutes: number; maxInventoryAgeSeconds: number;
  repositories: readonly string[]; enabledPlans: readonly string[];
}>;
export type GithubActionsJob = Readonly<{
  id: number; status: string; conclusion: string | null; started_at: string | null;
  completed_at: string | null; runner_id: number | null; neverStarted?: boolean;
  steps: readonly Readonly<{ number: number; status: string; conclusion: string | null;
    started_at: string | null; completed_at: string | null }>[];
}>;
export type GithubActionsAttempt = Readonly<{
  run_attempt: number; status: string; conclusion: string | null; jobsComplete: boolean;
  totalJobs: number; jobs: readonly GithubActionsJob[];
}>;
export type GithubActionsRun = Readonly<{
  id: number; run_attempt: number; status: string; conclusion: string | null;
  attempts: readonly GithubActionsAttempt[];
}>;
export type GithubActionsInventory = Readonly<{
  schemaVersion: 1; startedAt: string; completedAt: string;
  repositories: readonly Readonly<{ repository: string; actionsEnabled: boolean;
    runsComplete: boolean; attemptsComplete: boolean; jobsComplete: boolean;
    totalRuns: number; runs: readonly GithubActionsRun[] }>[];
}>;
export type GithubActionsBudgetAccounting = Readonly<{
  schemaVersion: 1; day: string; known: boolean; basis: string;
  chargedMinutes: number | null; observedMinutesLowerBound: number; remainingMinutes: number | null;
  overBudget: boolean | null; accountedJobs: number; zeroAllocationJobs: number;
  dailyChargedJobs: number; attemptedRuns: number;
  repositories: readonly Readonly<{ repository: string; actionsEnabled: boolean }>[];
  reasons: readonly string[]; enforcement: string | null; atomicReservation: false;
}>;
export type GithubActionsPlan = Readonly<{
  id: string; bounded: boolean; downstreamsComplete: boolean;
  earliestStartAt: string; latestCompletionAt: string;
  jobs: readonly Readonly<{ id: string; repository: string; runner: 'github-hosted' | 'self-hosted';
    maxExecutionSeconds: number; setupSeconds: number; postSeconds: number; maxExecutions: number }>[];
}>;
export type GithubActionsPlanEstimate = Readonly<{
  planId: string; reservedMinutesPerTouchedDay: number; firstDay: string; lastDay: string;
  jobs: number; atomicReservation: false;
}>;
export function validateGithubActionsBudgetConfig(value: unknown): GithubActionsBudgetConfig;
export function chargeGithubActionsJob(job: unknown, day: string): Readonly<{
  jobId: number; roundedMinutes: number; chargeMinutes: number; zeroAllocationProven: boolean;
}>;
export function accountGithubActionsBudget(configuration: unknown, inventory: unknown, day: string,
  now: string): GithubActionsBudgetAccounting;
export function estimateGithubActionsPlan(configuration: unknown, plan: unknown): GithubActionsPlanEstimate;
export function evaluateGithubActionsAdmission(configuration: unknown, inventory: unknown, day: string,
  now: string, plan: unknown): Readonly<{ allowed: false; accounting: GithubActionsBudgetAccounting;
    estimate: GithubActionsPlanEstimate | null; reasons: readonly string[];
    atomicReservation: false; remoteEffects: false }>;
