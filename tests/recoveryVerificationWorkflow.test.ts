// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

type Step = {
  name?: string; uses?: string; run?: string; if?: string;
  with?: Record<string, unknown>;
};
type Job = {
  needs?: string[]; if?: string; steps: Step[];
  'runs-on'?: string; 'timeout-minutes'?: number;
};
const root = resolve(import.meta.dirname, '..');
const source = readFileSync(resolve(root, '.github/workflows/verify.yml'), 'utf8');
const workflow = parse(source) as {
  permissions: Record<string, string>;
  jobs: Record<string, Job>;
};
const predecessors = ['linux', 'auth-bridge', 'release-recovery', 'spacetimedb-module', 'native-contract'];

// Evaluate only the workflow's result-comparison grammar, never arbitrary code.
// This exercises both actual predicates over every possible predecessor result.
function matches(expression: string, results: Record<string, string>): boolean {
  return expression.split('||').map(disjunction => disjunction.split('&&').map(term => {
    const match = /^needs\.([a-z-]+)\.result\s*(==|!=)\s*'success'$/u.exec(term.trim());
    if (!match || !Object.hasOwn(results, match[1])) throw new Error('Unexpected aggregate condition');
    return match[2] === '==' ? results[match[1]] === 'success' : results[match[1]] !== 'success';
  }).every(Boolean)).some(Boolean);
}

describe('required recovery verification', () => {
  it('runs full recovery checks and audit with a fixed toolchain and no deployment authority', () => {
    const job = workflow.jobs['release-recovery'];
    expect(job).toBeDefined();
    expect(job['runs-on']).toBe('ubuntu-22.04');
    expect(job['timeout-minutes']).toBeGreaterThan(0);
    expect(workflow.permissions).toEqual({ contents: 'read' });
    for (const key of ['environment', 'permissions', 'env', 'if', 'continue-on-error', 'uses', 'secrets']) {
      expect(job).not.toHaveProperty(key);
    }
    expect(job.steps.filter(step => step.uses)).toEqual([
      {
        name: 'Checkout',
        uses: 'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
        with: { 'persist-credentials': false },
      },
      {
        name: 'Setup Node',
        uses: 'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
        with: { 'node-version': '22.22.3' },
      },
      {
        name: 'Setup pnpm',
        uses: 'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
        with: { version: '11.7.0', run_install: false },
      },
    ]);
    expect(job.steps.filter(step => step.run).map(step => step.run)).toEqual([
      'pnpm --dir services/release-recovery install --frozen-lockfile',
      'pnpm --dir services/release-recovery run check',
      'pnpm --dir services/release-recovery audit --audit-level low',
    ]);
    for (const step of job.steps) {
      for (const key of ['if', 'continue-on-error', 'env', 'working-directory']) {
        expect(step).not.toHaveProperty(key);
      }
    }
    const manifest = JSON.parse(readFileSync(resolve(root, 'services/release-recovery/package.json'), 'utf8'));
    const checks = manifest.scripts.check.split(' && ');
    expect(checks).toEqual(expect.arrayContaining([
      'tsc --noEmit',
      'tsc --noEmit -p test-workerd/tsconfig.json',
      'wrangler types test-workerd/worker-configuration.d.ts --config wrangler.workerd.toml --include-runtime false --check',
      'vitest run',
      'vitest run --config vitest.workerd.config.ts',
    ]));
  });

  it('rejects every non-success combination, including cancelled and skipped recovery', () => {
    const aggregate = workflow.jobs.verify;
    expect(aggregate.needs).toEqual(predecessors);
    expect(aggregate.if).toBe('${{ always() }}');
    expect(aggregate.steps).toHaveLength(2);
    for (const step of aggregate.steps) expect(step).not.toHaveProperty('continue-on-error');
    const states = ['success', 'failure', 'cancelled', 'skipped'];
    for (let combination = 0; combination < 4 ** predecessors.length; combination += 1) {
      const results = Object.fromEntries(predecessors.map((name, index) => [
        name, states[Math.floor(combination / 4 ** index) % 4],
      ]));
      const selected = aggregate.steps.filter(step => matches(step.if ?? '', results));
      expect(selected, JSON.stringify(results)).toHaveLength(1);
      expect(selected[0].run, JSON.stringify(results)).toBe(
        Object.values(results).every(result => result === 'success') ? 'exit 0' : 'exit 1',
      );
    }
  });
});
