/** Pure local accounting. Repository Actions settings provide the current hard stop.
 * A report or a plan estimate is not an atomic reservation or permission to execute.
 */
const DAY_MS = 86_400_000;
const TERMINAL = new Set(['success', 'failure', 'cancelled', 'skipped', 'timed_out',
  'action_required', 'neutral', 'startup_failure', 'stale']);
const ACTIVE = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending']);
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u;

export class GithubActionsBudgetError extends Error {
  constructor(code) { super(code); this.name = 'GithubActionsBudgetError'; this.code = code; }
}
function requireValue(condition, code) {
  if (!condition) throw new GithubActionsBudgetError(code);
}
const integer = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function utcTime(value) {
  requireValue(typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/u.test(value), 'INVALID_UTC_TIME');
  const normalized = value.replace(/(?:\.(\d{1,3}))?Z$/u,
    (_, fraction) => `.${(fraction ?? '').padEnd(3, '0')}Z`);
  const milliseconds = Date.parse(value);
  requireValue(Number.isSafeInteger(milliseconds) && milliseconds >= 0
    && new Date(milliseconds).toISOString() === normalized, 'INVALID_UTC_TIME');
  return milliseconds;
}
function utcDay(value) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value), 'INVALID_UTC_DAY');
  return utcTime(`${value}T00:00:00Z`);
}
function status(value) {
  requireValue(object(value) && (value.status === 'completed' || ACTIVE.has(value.status)), 'INVALID_STATUS');
  if (value.status === 'completed') requireValue(TERMINAL.has(value.conclusion), 'INVALID_CONCLUSION');
  else requireValue(value.conclusion === null, 'INVALID_CONCLUSION');
}
function add(left, right) {
  requireValue(integer(left) && integer(right) && integer(left + right), 'MINUTE_OVERFLOW');
  return left + right;
}
function unique(values, key, normalize, code) {
  const records = new Map();
  for (const value of values) {
    const normalized = normalize(value);
    const id = key(normalized);
    const previous = records.get(id);
    requireValue(previous === undefined || JSON.stringify(previous) === JSON.stringify(normalized), code);
    records.set(id, normalized);
  }
  return [...records.values()].sort((a, b) => key(a) - key(b));
}

export function validateGithubActionsBudgetConfig(value) {
  requireValue(object(value) && value.schemaVersion === 1 && value.dayBoundary === 'UTC'
    && value.enforcement === 'repository-actions-disabled' && typeof value.admissionEnabled === 'boolean'
    && integer(value.dailyRunnerMinutes, 1) && integer(value.maxInventoryAgeSeconds, 1)
    && Number.isSafeInteger(value.maxInventoryAgeSeconds * 1000)
    && Array.isArray(value.repositories) && value.repositories.length > 0
    && value.repositories.every(repository => typeof repository === 'string' && REPOSITORY.test(repository))
    && new Set(value.repositories.map(repository => repository.toLowerCase())).size === value.repositories.length
    && Array.isArray(value.enabledPlans)
    && value.enabledPlans.every(plan => typeof plan === 'string' && /^[A-Za-z0-9._-]+$/u.test(plan))
    && new Set(value.enabledPlans).size === value.enabledPlans.length, 'INVALID_CONFIG');
  return { schemaVersion: 1, dayBoundary: 'UTC', enforcement: value.enforcement,
    admissionEnabled: value.admissionEnabled, dailyRunnerMinutes: value.dailyRunnerMinutes,
    maxInventoryAgeSeconds: value.maxInventoryAgeSeconds, repositories: [...value.repositories],
    enabledPlans: [...value.enabledPlans] };
}

function normalizedJob(value) {
  requireValue(object(value) && integer(value.id, 1) && Array.isArray(value.steps)
    && (value.runner_id === null || integer(value.runner_id))
    && (value.neverStarted === undefined || typeof value.neverStarted === 'boolean'), 'INVALID_JOB');
  status(value);
  requireValue(value.started_at === null || typeof value.started_at === 'string', 'INVALID_JOB_TIME');
  requireValue(value.completed_at === null || typeof value.completed_at === 'string', 'INVALID_JOB_TIME');
  const steps = value.steps.map(step => {
    requireValue(object(step) && integer(step.number, 1), 'INVALID_STEP');
    status(step);
    requireValue(step.started_at === null || typeof step.started_at === 'string', 'INVALID_STEP');
    requireValue(step.completed_at === null || typeof step.completed_at === 'string', 'INVALID_STEP');
    return { number: step.number, status: step.status, conclusion: step.conclusion,
      started_at: step.started_at, completed_at: step.completed_at };
  });
  requireValue(new Set(steps.map(step => step.number)).size === steps.length, 'DUPLICATE_STEP');
  return { id: value.id, status: value.status, conclusion: value.conclusion,
    started_at: value.started_at, completed_at: value.completed_at,
    runner_id: value.runner_id, neverStarted: value.neverStarted === true, steps };
}

/** Charge each allocated job separately, including failures/cancellations and all runner types.
 * Midnight-straddling jobs conservatively charge their full rounded duration to each touched day.
 * These are observed job-time upper bounds, not a billing API or GPU/runner-time substitution.
 */
export function chargeGithubActionsJob(job, day) {
  const value = normalizedJob(job);
  const dayStart = utcDay(day);
  requireValue(value.status === 'completed', 'ACTIVE_JOB_COST_UNKNOWN');
  const ended = utcTime(value.completed_at);
  if (value.neverStarted) {
    requireValue(value.started_at === null && (value.runner_id === null || value.runner_id === 0)
      && value.steps.length === 0, 'NEVER_STARTED_PROOF_INVALID');
    return { jobId: value.id, roundedMinutes: 0, chargeMinutes: 0, zeroAllocationProven: true };
  }
  requireValue(integer(value.runner_id, 1) && value.started_at !== null, 'JOB_ALLOCATION_UNKNOWN');
  const began = utcTime(value.started_at);
  requireValue(ended >= began, 'JOB_TIME_REVERSED');
  const roundedMinutes = Math.max(1, Math.ceil((ended - began) / 60_000));
  requireValue(integer(roundedMinutes, 1), 'MINUTE_OVERFLOW');
  // A zero-duration allocated job still consumes one conservative rounded minute.
  const lastExecution = ended === began ? ended : ended - 1;
  const touchesDay = began < dayStart + DAY_MS && lastExecution >= dayStart;
  return { jobId: value.id, roundedMinutes, chargeMinutes: touchesDay ? roundedMinutes : 0,
    zeroAllocationProven: false };
}

function normalizedAttempt(value) {
  requireValue(object(value) && integer(value.run_attempt, 1) && value.jobsComplete === true
    && integer(value.totalJobs) && Array.isArray(value.jobs), 'ATTEMPT_JOB_COVERAGE_INCOMPLETE');
  status(value);
  const jobs = unique(value.jobs, job => job.id, normalizedJob, 'CONFLICTING_JOB_DUPLICATE');
  requireValue(jobs.length === value.totalJobs && jobs.length > 0, 'ATTEMPT_JOB_COUNT_MISMATCH');
  return { run_attempt: value.run_attempt, status: value.status, conclusion: value.conclusion,
    totalJobs: value.totalJobs, jobsComplete: true, jobs };
}
function normalizedRun(value) {
  requireValue(object(value) && integer(value.id, 1) && integer(value.run_attempt, 1)
    && Array.isArray(value.attempts), 'INVALID_RUN');
  status(value);
  const attempts = unique(value.attempts, attempt => attempt.run_attempt, normalizedAttempt,
    'CONFLICTING_ATTEMPT_DUPLICATE');
  requireValue(attempts.length === value.run_attempt
    && attempts.every((attempt, index) => attempt.run_attempt === index + 1), 'RERUN_ATTEMPT_GAP');
  const latest = attempts.at(-1);
  requireValue(latest.status === value.status && latest.conclusion === value.conclusion,
    'LATEST_ATTEMPT_STATUS_MISMATCH');
  return { id: value.id, run_attempt: value.run_attempt, status: value.status,
    conclusion: value.conclusion, attempts };
}

export function accountGithubActionsBudget(configuration, inventory, day, now) {
  const reasons = new Set();
  let observedMinutesLowerBound = 0;
  let accountedJobs = 0;
  let zeroAllocationJobs = 0;
  let dailyChargedJobs = 0;
  let attemptedRuns = 0;
  let policy;
  const repositories = [];
  try {
    policy = validateGithubActionsBudgetConfig(configuration);
    const dayStart = utcDay(day);
    const current = utcTime(now);
    requireValue(dayStart <= current, 'UTC_DAY_IN_FUTURE');
    requireValue(object(inventory) && inventory.schemaVersion === 1
      && Array.isArray(inventory.repositories), 'INVALID_INVENTORY');
    const started = utcTime(inventory.startedAt);
    const completed = utcTime(inventory.completedAt);
    requireValue(started <= completed && completed <= current, 'INVENTORY_TIME_INVALID');
    requireValue(current - started <= policy.maxInventoryAgeSeconds * 1000, 'INVENTORY_STALE');
    requireValue(inventory.repositories.length === policy.repositories.length
      && new Set(inventory.repositories.map(value => value?.repository)).size === policy.repositories.length
      && inventory.repositories.every(value => policy.repositories.includes(value?.repository)),
    'REPOSITORY_COVERAGE_INCOMPLETE');
    for (const repository of inventory.repositories) {
      requireValue(object(repository) && typeof repository.actionsEnabled === 'boolean'
        && repository.runsComplete === true && repository.attemptsComplete === true
        && repository.jobsComplete === true && integer(repository.totalRuns)
        && Array.isArray(repository.runs), 'REPOSITORY_HISTORY_INCOMPLETE');
      const runs = unique(repository.runs, run => run.id, normalizedRun, 'CONFLICTING_RUN_DUPLICATE');
      requireValue(runs.length === repository.totalRuns, 'RUN_COUNT_MISMATCH');
      repositories.push({ repository: repository.repository, actionsEnabled: repository.actionsEnabled });
      const jobOwners = new Map();
      for (const run of runs) {
        if (run.status !== 'completed') reasons.add('ACTIVE_RUN_COST_UNKNOWN');
        for (const attempt of run.attempts) {
          attemptedRuns += 1;
          if (attempt.status !== 'completed') reasons.add('ACTIVE_ATTEMPT_COST_UNKNOWN');
          for (const job of attempt.jobs) {
            const owner = `${run.id}/${attempt.run_attempt}`;
            requireValue(!jobOwners.has(job.id) || jobOwners.get(job.id) === owner, 'JOB_REUSED_ACROSS_ATTEMPTS');
            jobOwners.set(job.id, owner);
            try {
              const cost = chargeGithubActionsJob(job, day);
              // Future terminal timestamps are not usable accounting evidence.
              requireValue(utcTime(job.completed_at) <= completed, 'JOB_AFTER_INVENTORY');
              observedMinutesLowerBound = add(observedMinutesLowerBound, cost.chargeMinutes);
              accountedJobs += 1;
              if (cost.zeroAllocationProven) zeroAllocationJobs += 1;
              if (cost.chargeMinutes > 0) dailyChargedJobs += 1;
            } catch (error) { reasons.add(error instanceof GithubActionsBudgetError ? error.code : 'INVALID_JOB'); }
          }
        }
      }
    }
  } catch (error) { reasons.add(error instanceof GithubActionsBudgetError ? error.code : 'INVALID_INVENTORY'); }
  const known = reasons.size === 0;
  return { schemaVersion: 1, day, known, basis: 'per-job-ceiling-all-runners-each-touched-UTC-day',
    chargedMinutes: known ? observedMinutesLowerBound : null, observedMinutesLowerBound,
    remainingMinutes: known ? Math.max(0, policy.dailyRunnerMinutes - observedMinutesLowerBound) : null,
    overBudget: known ? observedMinutesLowerBound > policy.dailyRunnerMinutes : null,
    accountedJobs, zeroAllocationJobs, dailyChargedJobs, attemptedRuns,
    repositories, reasons: [...reasons].sort(), enforcement: policy?.enforcement ?? null,
    atomicReservation: false };
}

/** Every job, possible repeat and downstream must be listed, with setup/post execution bounded.
 * A parallel plan costs the sum of its job allocations, never its wall-clock maximum.
 */
export function estimateGithubActionsPlan(configuration, plan) {
  const policy = validateGithubActionsBudgetConfig(configuration);
  requireValue(object(plan) && typeof plan.id === 'string' && /^[A-Za-z0-9._-]+$/u.test(plan.id)
    && plan.bounded === true && plan.downstreamsComplete === true
    && Array.isArray(plan.jobs) && plan.jobs.length > 0, 'PLAN_NOT_BOUNDED');
  const began = utcTime(plan.earliestStartAt);
  const ended = utcTime(plan.latestCompletionAt);
  requireValue(ended >= began, 'PLAN_TIME_REVERSED');
  const ids = new Set();
  let reservedMinutesPerTouchedDay = 0;
  for (const job of plan.jobs) {
    requireValue(object(job) && typeof job.id === 'string' && /^[A-Za-z0-9._-]+$/u.test(job.id)
      && !ids.has(job.id) && policy.repositories.includes(job.repository)
      && ['github-hosted', 'self-hosted'].includes(job.runner)
      && integer(job.maxExecutionSeconds, 1) && integer(job.setupSeconds)
      && integer(job.postSeconds) && integer(job.maxExecutions, 1), 'INVALID_PLAN_JOB');
    ids.add(job.id);
    const seconds = add(add(job.maxExecutionSeconds, job.setupSeconds), job.postSeconds);
    requireValue(seconds * 1000 <= ended - began, 'PLAN_WINDOW_TOO_SHORT');
    const minutes = Math.ceil(seconds / 60) * job.maxExecutions;
    requireValue(integer(minutes, 1), 'MINUTE_OVERFLOW');
    reservedMinutesPerTouchedDay = add(reservedMinutesPerTouchedDay, minutes);
  }
  return { planId: plan.id, reservedMinutesPerTouchedDay,
    firstDay: new Date(began).toISOString().slice(0, 10),
    lastDay: new Date(ended === began ? ended : ended - 1).toISOString().slice(0, 10),
    jobs: plan.jobs.length, atomicReservation: false };
}

/** This policy provides no re-enable, dispatch or retry capability, even when arithmetic fits.
 * A future execution lane needs a separately reviewed atomic cross-repository authority.
 */
export function evaluateGithubActionsAdmission(configuration, inventory, day, now, plan) {
  const accounting = accountGithubActionsBudget(configuration, inventory, day, now);
  const reasons = new Set(accounting.reasons);
  let estimate = null;
  try {
    const policy = validateGithubActionsBudgetConfig(configuration);
    reasons.add('REPOSITORY_ACTIONS_DISABLED');
    if (!policy.admissionEnabled) reasons.add('ADMISSION_DISABLED');
    if (accounting.repositories.some(repository => repository.actionsEnabled)) reasons.add('REPOSITORY_HARD_STOP_NOT_CONFIRMED');
    estimate = estimateGithubActionsPlan(policy, plan);
    if (!policy.enabledPlans.includes(estimate.planId)) reasons.add('PLAN_NOT_ENABLED');
    if (estimate.firstDay !== day || estimate.lastDay !== day) reasons.add('OTHER_DAY_ACCOUNTING_REQUIRED');
    if (accounting.known && accounting.chargedMinutes + estimate.reservedMinutesPerTouchedDay > policy.dailyRunnerMinutes)
      reasons.add('DAILY_BUDGET_EXCEEDED');
  } catch (error) { reasons.add(error instanceof GithubActionsBudgetError ? error.code : 'INVALID_PLAN'); }
  return { allowed: false, accounting, estimate, reasons: [...reasons].sort(),
    atomicReservation: false, remoteEffects: false };
}
