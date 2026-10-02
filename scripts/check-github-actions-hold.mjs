import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { validateGithubActionsBudgetConfig } from './github-actions-budget.mjs';

// Operator preflight only: GET requests, no dispatch, retry, settings or file writes.
// Run-history and trigger-chain review remain separate prerequisites for mutations.
if (process.argv.length !== 3 || process.argv[2] !== '--check') {
  throw new Error('Usage: node scripts/check-github-actions-hold.mjs --check');
}
const configuration = validateGithubActionsBudgetConfig(JSON.parse(fs.readFileSync(
  fileURLToPath(new URL('../config/github-actions-budget.json', import.meta.url)), 'utf8')));
if (configuration.admissionEnabled || configuration.enabledPlans.length) {
  throw new Error('CURRENT_ACTIONS_HOLD_CONFIG_REQUIRED');
}
function get(endpoint) {
  const result = spawnSync('gh', ['api', '--method', 'GET', endpoint], {
    encoding: 'utf8', windowsHide: true, timeout: 30_000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.status !== 0 || result.signal || result.error) {
    throw new Error(`GITHUB_ACTIONS_HOLD_READ_FAILED:${endpoint}`);
  }
  return JSON.parse(result.stdout);
}
const observed = [];
for (const repository of configuration.repositories) {
  if (get(`repos/${repository}/actions/permissions`).enabled !== false) {
    throw new Error(`REPOSITORY_ACTIONS_HOLD_NOT_CONFIRMED:${repository}`);
  }
  for (const status of ['queued', 'in_progress', 'requested', 'waiting', 'pending']) {
    const page = get(`repos/${repository}/actions/runs?status=${status}&per_page=100&page=1`);
    // Any work is a hold failure; do not cancel it or interpret missing data as empty.
    if (page.total_count !== 0 || !Array.isArray(page.workflow_runs) || page.workflow_runs.length) {
      throw new Error(`REPOSITORY_ACTIONS_WORK_PRESENT_OR_UNKNOWN:${repository}:${status}`);
    }
  }
  if (get(`repos/${repository}/actions/permissions`).enabled !== false) {
    throw new Error(`REPOSITORY_ACTIONS_HOLD_CHANGED:${repository}`);
  }
  observed.push({ repository, enabled: false, activeRuns: 0 });
}
console.log(JSON.stringify({ observedAt: new Date().toISOString(), repositories: observed,
  enforcement: configuration.enforcement, remoteEffects: false,
  totalDailyMinutes: null, scope: 'Current disabled settings and idle queues only; not a daily usage total, atomic reservation, complete history review or release acceptance.' }));
