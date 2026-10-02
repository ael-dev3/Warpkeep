// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  accountGithubActionsBudget, chargeGithubActionsJob, estimateGithubActionsPlan,
  evaluateGithubActionsAdmission, validateGithubActionsBudgetConfig,
  type GithubActionsBudgetConfig, type GithubActionsInventory, type GithubActionsJob,
  type GithubActionsPlan, type GithubActionsRun,
} from '../scripts/github-actions-budget.mjs';

const day = '2026-10-02';
const now = '2026-10-02T12:05:00Z';
const policy: GithubActionsBudgetConfig = {
  schemaVersion: 1, dayBoundary: 'UTC', enforcement: 'repository-actions-disabled',
  admissionEnabled: false, dailyRunnerMinutes: 10, maxInventoryAgeSeconds: 300,
  repositories: ['ael-dev3/Warpkeep', 'ael-dev3/Warpkeep-Live', 'ael-dev3/Warpkeep-Assets', 'ael-dev3/Warpkeep-Water-Engine'],
  enabledPlans: [],
};
const job = (id = 1, started_at = '2026-10-02T12:00:00Z', completed_at = '2026-10-02T12:01:00Z'): GithubActionsJob => ({
  id, status: 'completed', conclusion: 'success', started_at, completed_at, runner_id: 42, steps: [],
});
const run = (jobs: readonly GithubActionsJob[], id = 1): GithubActionsRun => ({
  id, status: 'completed', conclusion: 'success', run_attempt: 1,
  attempts: [{ run_attempt: 1, status: 'completed', conclusion: 'success', jobsComplete: true,
    totalJobs: jobs.length, jobs }],
});
const inventory = (runs: readonly GithubActionsRun[] = []): GithubActionsInventory => ({
  schemaVersion: 1, startedAt: '2026-10-02T12:04:00Z', completedAt: '2026-10-02T12:04:30Z',
  repositories: policy.repositories.map((repository, index) => ({ repository, actionsEnabled: false,
    runsComplete: true, attemptsComplete: true, jobsComplete: true,
    totalRuns: index === 0 ? runs.length : 0, runs: index === 0 ? runs : [] })),
});
const plan = (): GithubActionsPlan => ({
  id: 'bounded-smoke', bounded: true, downstreamsComplete: true,
  earliestStartAt: '2026-10-02T12:06:00Z', latestCompletionAt: '2026-10-02T12:10:00Z',
  jobs: [{ id: 'smoke', repository: policy.repositories[0], runner: 'github-hosted',
    maxExecutionSeconds: 60, setupSeconds: 15, postSeconds: 5, maxExecutions: 1 }],
});
const accounting = (value: unknown) => accountGithubActionsBudget(policy, value, day, now);

describe('GitHub Actions daily observed execution accounting', () => {
  it.each([[0, 1], [1, 1], [59_999, 1], [60_000, 1], [60_001, 2], [120_000, 2]])(
    'rounds each allocated job duration %i milliseconds to %i minutes', (milliseconds, minutes) => {
      const began = '2026-10-02T12:00:00.000Z';
      const ended = new Date(Date.parse(began) + milliseconds).toISOString();
      expect(chargeGithubActionsJob(job(1, began, ended), day).chargeMinutes).toBe(minutes);
    });
  it('sums parallel jobs instead of using wall-clock duration', () => {
    const result = accounting(inventory([run([job(1), job(2), job(3)])]));
    expect(result).toMatchObject({ known: true, chargedMinutes: 3, accountedJobs: 3, remainingMinutes: 7 });
  });
  it('aggregates repositories and charges self-hosted runner executions too', () => {
    const base = inventory([run([job(1)])]);
    const value = { ...base, repositories: base.repositories.map((repository, index) => index === 1
      ? { ...repository, totalRuns: 1, runs: [run([job(1, '2026-10-02T12:00:00Z', '2026-10-02T12:01:01Z')])] }
      : repository) };
    expect(accounting(value)).toMatchObject({ known: true, chargedMinutes: 3, accountedJobs: 2 });
  });
  it('charges failure, cancellation, neutral and allocated skipped jobs', () => {
    const jobs = ['failure', 'cancelled', 'neutral', 'skipped'].map((conclusion, index) => ({ ...job(index + 1), conclusion }));
    expect(accounting(inventory([run(jobs)]))).toMatchObject({ known: true, chargedMinutes: 4 });
  });
  it('counts every rerun attempt, including an unsuccessful predecessor', () => {
    const initial = run([job(1)]);
    const value = { ...initial, run_attempt: 2, attempts: [
      { ...initial.attempts[0], conclusion: 'failure' },
      { ...initial.attempts[0], run_attempt: 2, jobs: [job(2)] },
    ] };
    expect(accounting(inventory([value]))).toMatchObject({ known: true, chargedMinutes: 2, attemptedRuns: 2 });
  });
  it('deduplicates identical retained job and attempt evidence without losing allocations', () => {
    const initial = run([job(1)]);
    const attempt = { ...initial.attempts[0], jobs: [job(1), job(1)] };
    expect(accounting(inventory([{ ...initial, attempts: [attempt, attempt] }]))).toMatchObject({
      known: true, chargedMinutes: 1, attemptedRuns: 1, accountedJobs: 1,
    });
  });
  it('rejects conflicting duplicate evidence and a missing predecessor attempt', () => {
    const initial = run([job(1)]);
    expect(accounting(inventory([{ ...initial, attempts: [initial.attempts[0],
      { ...initial.attempts[0], conclusion: 'failure' }] }])).reasons).toContain('CONFLICTING_ATTEMPT_DUPLICATE');
    expect(accounting(inventory([{ ...initial, run_attempt: 2,
      attempts: [{ ...initial.attempts[0], run_attempt: 2 }] }])).reasons).toContain('RERUN_ATTEMPT_GAP');
  });
  it('does not reuse one job identity to mask two attempt executions', () => {
    const initial = run([job(1)]);
    expect(accounting(inventory([{ ...initial, run_attempt: 2, attempts: [initial.attempts[0],
      { ...initial.attempts[0], run_attempt: 2 }] }])).reasons).toContain('JOB_REUSED_ACROSS_ATTEMPTS');
  });
  it('holds conflicting duplicate job timings instead of choosing the cheaper copy', () => {
    const initial = run([job(1)]);
    const value = { ...initial, attempts: [{ ...initial.attempts[0], jobs: [job(1),
      job(1, '2026-10-02T12:00:00Z', '2026-10-02T12:03:00Z')] }] };
    expect(accounting(inventory([value])).reasons).toContain('CONFLICTING_JOB_DUPLICATE');
  });
  it('charges the full rounded job to each touched UTC day', () => {
    const crossing = job(1, '2026-10-01T23:59:20Z', '2026-10-02T00:00:40Z');
    expect(chargeGithubActionsJob(crossing, '2026-10-01').chargeMinutes).toBe(2);
    expect(chargeGithubActionsJob(crossing, day).chargeMinutes).toBe(2);
    expect(chargeGithubActionsJob(crossing, '2026-10-03').chargeMinutes).toBe(0);
  });
  it('does not charge a job ending exactly at midnight to the following day', () => {
    const ending = job(1, '2026-10-01T23:59:00Z', '2026-10-02T00:00:00Z');
    expect(chargeGithubActionsJob(ending, '2026-10-01').chargeMinutes).toBe(1);
    expect(chargeGithubActionsJob(ending, day).chargeMinutes).toBe(0);
  });
  it('accepts zero only with terminal, empty-step, null-start and no-runner evidence', () => {
    const neverStarted = { ...job(), started_at: null, runner_id: 0, neverStarted: true, conclusion: 'failure' };
    expect(accounting(inventory([run([neverStarted])]))).toMatchObject({
      known: true, chargedMinutes: 0, zeroAllocationJobs: 1, accountedJobs: 1,
    });
    expect(accounting(inventory([run([{ ...neverStarted, runner_id: null }])])).known).toBe(true);
  });
  it.each([
    { runner_id: 0 }, { runner_id: null }, { runner_id: 0, neverStarted: true },
    { runner_id: 42, started_at: null, neverStarted: true },
    { runner_id: 0, started_at: null, neverStarted: true, steps: [{ number: 1, status: 'completed',
      conclusion: 'success', started_at: null, completed_at: null }] },
  ])('holds ambiguous or contradictory zero-allocation evidence %#', changes => {
    const result = accounting(inventory([run([{ ...job(), ...changes }])]));
    expect(result.known).toBe(false); expect(result.chargedMinutes).toBeNull(); expect(result.remainingMinutes).toBeNull();
  });
  it('holds inflight runs and jobs even when one finished job can be counted', () => {
    const initial = run([job(1), { ...job(2), status: 'in_progress', conclusion: null, completed_at: null }]);
    const active = { ...initial, status: 'in_progress', conclusion: null,
      attempts: [{ ...initial.attempts[0], status: 'in_progress', conclusion: null }] };
    const result = accounting(inventory([active]));
    expect(result).toMatchObject({ known: false, chargedMinutes: null, observedMinutesLowerBound: 1 });
    expect(result.reasons).toEqual(expect.arrayContaining(['ACTIVE_JOB_COST_UNKNOWN', 'ACTIVE_RUN_COST_UNKNOWN']));
  });
  it.each(['runsComplete', 'attemptsComplete', 'jobsComplete'])('holds missing %s pagination', field => {
    const base = inventory();
    expect(accounting({ ...base, repositories: base.repositories.map((repository, index) => index === 0
      ? { ...repository, [field]: false } : repository) }).known).toBe(false);
  });
  it('holds missing repositories, jobs, empty unexplained job sets and stale snapshots', () => {
    const base = inventory([run([job()])]);
    expect(accounting({ ...base, repositories: base.repositories.slice(1) }).reasons).toContain('REPOSITORY_COVERAGE_INCOMPLETE');
    expect(accounting(inventory([run([])]))).toMatchObject({ known: false, chargedMinutes: null });
    const missing = { ...base.repositories[0], runs: [{ ...base.repositories[0].runs[0], attempts: [
      { ...base.repositories[0].runs[0].attempts[0], totalJobs: 2 },
    ] }] };
    expect(accounting({ ...base, repositories: [missing, ...base.repositories.slice(1)] }).reasons).toContain('ATTEMPT_JOB_COUNT_MISMATCH');
    expect(accounting({ ...base, startedAt: '2026-10-02T11:59:59Z' }).reasons).toContain('INVENTORY_STALE');
  });
  it.each([
    { started_at: '2026-10-02T12:02:00Z' }, { completed_at: '2026-02-30T12:01:00Z' },
    { completed_at: '2026-10-02T12:06:00Z' }, { started_at: '2026-10-02T12:00:00+00:00' },
    { runner_id: Number.NaN }, { id: Number.POSITIVE_INFINITY },
  ])('holds malformed, reversed, noncanonical and future evidence %#', changes => {
    expect(accounting(inventory([run([{ ...job(), ...changes }])])).known).toBe(false);
  });
  it('does not mutate retained source records or read policy from a hardcoded limit', () => {
    const data = inventory([run([job()])]); const before = structuredClone(data);
    const result = accountGithubActionsBudget({ ...policy, dailyRunnerMinutes: 1 }, data, day, now);
    expect(result.remainingMinutes).toBe(0); expect(data).toEqual(before);
    expect(() => validateGithubActionsBudgetConfig({ ...policy, dailyRunnerMinutes: undefined })).toThrow('INVALID_CONFIG');
  });
  it('does not present future UTC days or API failures as known zero consumption', () => {
    expect(accountGithubActionsBudget(policy, inventory(), '2026-10-03', now).reasons).toContain('UTC_DAY_IN_FUTURE');
    expect(accounting({ error: 'upstream-transport-failure' })).toMatchObject({ known: false,
      chargedMinutes: null, remainingMinutes: null });
  });
});

describe('bounded plans do not confer permission to execute', () => {
  it('reserves every parallel job, possible repeat, setup, post and downstream allocation', () => {
    const value = plan();
    const estimate = estimateGithubActionsPlan(policy, { ...value, jobs: [
      { ...value.jobs[0], maxExecutions: 2 },
      { ...value.jobs[0], id: 'pages', repository: policy.repositories[1] },
    ] });
    expect(estimate).toMatchObject({ reservedMinutesPerTouchedDay: 6, jobs: 2, atomicReservation: false });
  });
  it.each([
    { bounded: false }, { downstreamsComplete: false }, { jobs: [] },
    { jobs: [{ ...plan().jobs[0], maxExecutionSeconds: null }] },
    { jobs: [{ ...plan().jobs[0], setupSeconds: undefined }] },
    { jobs: [{ ...plan().jobs[0], maxExecutions: 0 }] },
  ])('rejects unbounded or incomplete plans %#', changes => {
    expect(() => estimateGithubActionsPlan(policy, { ...plan(), ...changes })).toThrow();
  });
  it('refuses the old full lane and a fitting smoke while the actual stop is active', () => {
    const data = inventory();
    const smoke = evaluateGithubActionsAdmission(policy, data, day, now, plan());
    expect(smoke).toMatchObject({ allowed: false, remoteEffects: false, estimate: { reservedMinutesPerTouchedDay: 2 } });
    expect(smoke.reasons).toEqual(expect.arrayContaining(['ADMISSION_DISABLED', 'REPOSITORY_ACTIONS_DISABLED', 'PLAN_NOT_ENABLED']));
    const full = { ...plan(), id: 'legacy-verify', latestCompletionAt: '2026-10-02T14:00:00Z',
      jobs: [{ ...plan().jobs[0], maxExecutionSeconds: 62 * 60 }] };
    expect(evaluateGithubActionsAdmission(policy, data, day, now, full).reasons).toContain('DAILY_BUDGET_EXCEEDED');
  });
  it('reports the budget boundary without granting an atomic reservation', () => {
    const data = inventory([run(Array.from({ length: 8 }, (_, index) => job(index + 1)))]);
    const result = evaluateGithubActionsAdmission(policy, data, day, now, plan());
    expect(result.reasons).not.toContain('DAILY_BUDGET_EXCEEDED');
    expect(result.allowed).toBe(false); expect(result.atomicReservation).toBe(false);
    const oneMore = inventory([run(Array.from({ length: 9 }, (_, index) => job(index + 1)))]);
    expect(evaluateGithubActionsAdmission(policy, oneMore, day, now, plan()).reasons).toContain('DAILY_BUDGET_EXCEEDED');
  });
  it('requires accounting for every reserved UTC day and proves all repositories disabled', () => {
    const value = { ...plan(), earliestStartAt: '2026-10-02T23:59:00Z', latestCompletionAt: '2026-10-03T00:03:00Z' };
    expect(estimateGithubActionsPlan(policy, value)).toMatchObject({ firstDay: day, lastDay: '2026-10-03', reservedMinutesPerTouchedDay: 2 });
    const data = inventory();
    const enabled = { ...data, repositories: data.repositories.map((repository, index) => index === 3
      ? { ...repository, actionsEnabled: true } : repository) };
    expect(evaluateGithubActionsAdmission(policy, enabled, day, now, value).reasons).toEqual(expect.arrayContaining([
      'OTHER_DAY_ACCOUNTING_REQUIRED', 'REPOSITORY_HARD_STOP_NOT_CONFIRMED',
    ]));
  });
  it('does not turn an edited policy switch into re-enable or dispatch authority', () => {
    const result = evaluateGithubActionsAdmission({ ...policy, admissionEnabled: true, enabledPlans: ['bounded-smoke'] },
      inventory(), day, now, plan());
    expect(result.allowed).toBe(false); expect(result.reasons).toContain('REPOSITORY_ACTIONS_DISABLED');
  });
});
