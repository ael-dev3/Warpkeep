// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workflowPath = resolve(repositoryRoot, '.github/workflows/deploy-pages.yml');

function workflow(): string {
  return readFileSync(workflowPath, 'utf8');
}

describe('notification Pages private deployment workflow', () => {
  it('keeps the verified workflow_run trigger and selects lanes from exact source', () => {
    const source = workflow();
    const document = parse(source) as {
      on?: Record<string, unknown>;
      jobs?: Record<string, unknown>;
    };
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_run']);
    expect(source).toContain('workflows: [Verify]');
    expect(source).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(source).toContain("github.event.workflow_run.event == 'push'");
    expect(source).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(source).not.toMatch(/^\s+(?:push|workflow_dispatch|schedule):/mu);
    expect(source).toContain(
      'node scripts/notification-pages-private-deploy-operator.mjs classify',
    );
    expect(source).toContain(
      'WARPKEEP_PAGES_SOURCE_COMMIT: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).toContain("deployment-lane == 'closed-review'");
    expect(source).toContain("deployment-lane == 'gen0'");
    expect(source).toContain("deployment-lane == 'durable'");
    expect(document.jobs).toHaveProperty('deploy');
    expect(document.jobs).toHaveProperty('private-deploy');
  });

  it('confines private authority and deployment to the repository-exclusive admin runner', () => {
    const source = workflow();
    const privateJob = source.slice(source.indexOf('  private-deploy:'));
    const publicPrefix = source.slice(0, source.indexOf('  private-deploy:'));
    for (const label of [
      'self-hosted',
      'macOS',
      'ARM64',
      'warpkeep-production-admin',
      'warpkeep-repository-exclusive',
    ]) {
      expect(privateJob).toMatch(new RegExp(`^      - ${label}$`, 'm'));
      expect(publicPrefix).not.toMatch(new RegExp(`^      - ${label}$`, 'm'));
    }
    for (const command of ['predeploy', 'mark-deploy-invoked', 'postflight']) {
      expect(privateJob).toContain(
        `node scripts/notification-pages-private-deploy-operator.mjs ${command}`,
      );
      expect(publicPrefix).not.toContain(
        `node scripts/notification-pages-private-deploy-operator.mjs ${command}`,
      );
    }
    expect(privateJob).not.toContain('secrets.');
    expect(privateJob).not.toContain('upload-artifact@');
    expect(privateJob).not.toMatch(/(?:HANDOFF|KEY)_(?:PATH|BYTES|SECRET)/u);
  });

  it('proves protected main and both exact workflow runs before the effect', () => {
    const source = workflow();
    const privateJob = source.slice(source.indexOf('  private-deploy:'));
    const mark = privateJob.indexOf(
      'node scripts/notification-pages-private-deploy-operator.mjs mark-deploy-invoked',
    );
    const recheck = privateJob.indexOf(
      'Recheck protected source and durably mark deployment invocation',
    );
    const deploy = privateJob.indexOf('actions/deploy-pages@');
    expect(mark).toBeGreaterThan(0);
    expect(recheck).toBeLessThan(mark);
    expect(mark).toBeLessThan(deploy);
    expect(privateJob.slice(
      mark,
      privateJob.lastIndexOf('- name:', deploy),
    )).not.toMatch(/^      - name:/m);
    expect(privateJob.match(/repos\/\$\{GITHUB_REPOSITORY\}\/branches\/main/g))
      .toHaveLength(2);
    expect(privateJob.match(/\.protected == true and \.commit\.sha == \$source/g))
      .toHaveLength(2);
    expect(privateJob).toContain(
      'repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}',
    );
    expect(privateJob).toContain(
      'repos/${GITHUB_REPOSITORY}/actions/runs/${WARPKEEP_SOURCE_VERIFY_RUN_ID}',
    );
    for (const requirement of [
      '(.id | tostring) == $runId',
      '(.run_attempt | tostring) == $runAttempt',
      '.status == "in_progress"',
      '.event == "workflow_run"',
      '.path == ".github/workflows/deploy-pages.yml"',
      '.repository.full_name == $repository',
      '.head_repository.full_name == $repository',
    ]) expect(privateJob).toContain(requirement);
    for (const requirement of [
      '.status == "completed"',
      '.conclusion == "success"',
      '.event == "push"',
      '.path == ".github/workflows/verify.yml"',
    ]) expect(privateJob).toContain(requirement);
  });

  it('runs always-postflight only after the durable invocation marker', () => {
    const privateJob = workflow().slice(workflow().indexOf('  private-deploy:'));
    const marker = privateJob.indexOf('id: deployment-attempt');
    const deploy = privateJob.indexOf('actions/deploy-pages@');
    const postflight = privateJob.indexOf(
      'node scripts/notification-pages-private-deploy-operator.mjs postflight',
    );
    expect(marker).toBeLessThan(deploy);
    expect(deploy).toBeLessThan(postflight);
    expect(privateJob).toContain(
      "if: ${{ always() && steps.deployment-attempt.outcome == 'success' }}",
    );
    expect(privateJob).toContain('if: ${{ always() }}');
    expect(privateJob).toContain("WARPKEEP_DEPLOYMENT_OUTCOME: ${{ steps.deployment.outcome }}");
    expect(privateJob).toContain("WARPKEEP_POSTFLIGHT_OUTCOME: ${{ steps.private-postflight.outcome }}");
    expect(privateJob).toContain(
      'Private Pages deployment did not complete its durable postflight.',
    );
    expect(privateJob).not.toMatch(/continue-on-error:\s*true/u);
  });
});
