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

function job(source: string, name: string, next?: string): string {
  const start = source.indexOf(`  ${name}:`);
  const end = next === undefined ? source.length : source.indexOf(`  ${next}:`);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

const privateLabels = [
  'self-hosted',
  'macOS',
  'ARM64',
  'warpkeep-production-admin',
  'warpkeep-repository-exclusive',
];

describe('notification Pages private deployment workflow', () => {
  it('uses a dependency-free source-binding classifier for the verified main run', () => {
    const source = workflow();
    const document = parse(source) as {
      on?: Record<string, unknown>;
      jobs?: Record<string, unknown>;
    };
    const classify = job(source, 'classify', 'build');
    expect(Object.keys(document.on ?? {})).toEqual(['workflow_run']);
    expect(source).toContain('workflows: [Verify]');
    expect(source).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(source).toContain("github.event.workflow_run.event == 'push'");
    expect(source).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(source).not.toMatch(/^\s+(?:push|workflow_dispatch|schedule):/mu);
    expect(classify).toContain('node scripts/notification-pages-deploy-lane.mjs');
    expect(classify).not.toMatch(/(?:npm|pnpm) (?:ci|install)/u);
    expect(classify).not.toContain('services/auth-bridge/node_modules');
    expect(classify).not.toContain('notification-pages-live-receipt.mjs');
    expect(source).not.toContain(
      'notification-pages-private-deploy-operator.mjs classify',
    );
    expect(source).toContain(
      'WARPKEEP_PAGES_SOURCE_COMMIT: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).toContain("deployment-lane == 'closed-review'");
    expect(source).toContain("deployment-lane == 'gen0'");
    expect(source).toContain("deployment-lane == 'durable'");
    expect(document.jobs).toHaveProperty('deploy');
    expect(document.jobs).toHaveProperty('private-toolchain');
    expect(document.jobs).toHaveProperty('private-deploy');
  });

  it('builds the source literal and validates notification authority statically', () => {
    const source = workflow();
    const build = job(source, 'build', 'deploy');
    expect(build).toContain(
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    );
    expect(build).not.toContain('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED');
    expect(build).toContain('npm run validate:pages-release-build');
    expect(build).not.toContain('npm run validate:pages-config');
    expect(build).not.toContain('npm run verify:greater-realm-release-gates');
    expect(build.indexOf('npm run validate:pages-release-build')).toBeLessThan(
      build.indexOf('npm run build'),
    );
    expect(build).toContain('actions/upload-pages-artifact@');
  });

  it('installs only in a contents-read job and binds the persistent runner identity', () => {
    const source = workflow();
    const toolchain = job(source, 'private-toolchain', 'private-deploy');
    const privateDeploy = job(source, 'private-deploy');
    for (const label of privateLabels) {
      expect(toolchain).toMatch(new RegExp(`^      - ${label}$`, 'm'));
      expect(privateDeploy).toMatch(new RegExp(`^      - ${label}$`, 'm'));
    }
    expect(toolchain).toMatch(/^    permissions:\n      contents: read$/m);
    expect(toolchain).not.toMatch(/^\s+(?:pages|id-token):\s*write$/m);
    expect(toolchain).toContain('clean: true');
    expect(toolchain).toContain('version: 11.7.0');
    expect(toolchain).toContain('node-version: 22.22.3');
    expect(toolchain).toContain('--offline');
    expect(toolchain).toContain('--frozen-lockfile');
    expect(toolchain).toContain('--ignore-scripts');
    expect(toolchain).toContain('--package-import-method=copy');
    expect(toolchain).toContain(
      'scripts/notification-pages-private-deploy-launcher.mjs',
    );
    expect(toolchain).toContain('attest-toolchain');
    expect(toolchain).toContain(
      'runner-identity-digest: ${{ steps.private-toolchain-authority.outputs.runner-identity-digest }}',
    );
    expect(privateDeploy).toContain('needs: [classify, build, private-toolchain]');
    expect(privateDeploy).toContain('clean: false');
    expect(privateDeploy.match(
      /WARPKEEP_EXPECTED_RUNNER_IDENTITY_DIGEST="\$\{\{ needs\.private-toolchain\.outputs\.runner-identity-digest \}\}"/g,
    )).toHaveLength(4);
    expect(privateDeploy).not.toMatch(/(?:npm|pnpm) (?:ci|install)/u);
  });

  it('loads private authority only through the exact A-B-A launcher boundary', () => {
    const source = workflow();
    const privateDeploy = job(source, 'private-deploy');
    for (const command of [
      'predeploy',
      'mark-deploy-invoked',
      'postflight',
    ]) {
      expect(privateDeploy).toContain(
        `scripts/notification-pages-private-deploy-launcher.mjs ${command}`,
      );
    }
    expect(privateDeploy).toMatch(
      /scripts\/notification-pages-private-deploy-launcher\.mjs \\\n+\s+recover-skipped-invocation/u,
    );
    expect(source).not.toMatch(
      /node scripts\/notification-pages-private-deploy-operator\.mjs/u,
    );
    expect(privateDeploy.match(/\/usr\/bin\/env -i/g)?.length).toBeGreaterThanOrEqual(4);
    for (const override of [
      'NODE_OPTIONS',
      'NODE_PATH',
      'BASH_ENV',
      'GIT_CONFIG_GLOBAL',
      'LD_LIBRARY_PATH',
      'PYTHONPATH',
    ]) expect(privateDeploy).toContain(override);
    expect(privateDeploy).not.toContain('secrets.');
    expect(privateDeploy).not.toContain('upload-artifact@');
    expect(privateDeploy).not.toMatch(/(?:HANDOFF|KEY)_(?:PATH|BYTES|SECRET)/u);
  });

  it('retires only an API-proven skipped action without exposing its token', () => {
    const privateDeploy = job(workflow(), 'private-deploy');
    const recovery = privateDeploy.indexOf(
      'scripts/notification-pages-private-deploy-launcher.mjs \\\n            recover-skipped-invocation',
    );
    const predeploy = privateDeploy.indexOf(
      'scripts/notification-pages-private-deploy-launcher.mjs predeploy',
    );
    expect(privateDeploy).toContain('name: Notification Pages private deploy v1');
    expect(recovery).toBeGreaterThan(0);
    expect(recovery).toBeLessThan(predeploy);
    expect(privateDeploy).toContain('GH_TOKEN: ${{ github.token }}');
    expect(privateDeploy).toContain('8<<<"$GH_TOKEN"');
    expect(privateDeploy).not.toMatch(/(?:GH_TOKEN|github\.token).*env -i/u);
    expect(privateDeploy).not.toContain('WARPKEEP_GITHUB_TOKEN');
  });

  it('proves protected main and both exact workflow runs before the effect', () => {
    const privateDeploy = job(workflow(), 'private-deploy');
    const mark = privateDeploy.indexOf(
      'scripts/notification-pages-private-deploy-launcher.mjs mark-deploy-invoked',
    );
    const recheck = privateDeploy.indexOf(
      'Recheck protected source and durably mark deployment invocation',
    );
    const deploy = privateDeploy.indexOf('actions/deploy-pages@');
    expect(mark).toBeGreaterThan(0);
    expect(recheck).toBeLessThan(mark);
    expect(mark).toBeLessThan(deploy);
    expect(privateDeploy.slice(
      mark,
      privateDeploy.lastIndexOf('- name:', deploy),
    )).not.toMatch(/^      - name:/m);
    expect(privateDeploy.match(/repos\/\$\{GITHUB_REPOSITORY\}\/branches\/main/g))
      .toHaveLength(2);
    expect(privateDeploy.match(/\.protected == true and \.commit\.sha == \$source/g))
      .toHaveLength(2);
    expect(privateDeploy).toContain(
      'repos/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}',
    );
    expect(privateDeploy).toContain(
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
    ]) expect(privateDeploy).toContain(requirement);
    for (const requirement of [
      '.status == "completed"',
      '.conclusion == "success"',
      '.event == "push"',
      '.path == ".github/workflows/verify.yml"',
    ]) expect(privateDeploy).toContain(requirement);
  });

  it('runs always-postflight after every durable invocation marker outcome', () => {
    const privateDeploy = job(workflow(), 'private-deploy');
    const marker = privateDeploy.indexOf('id: deployment-attempt');
    const deploy = privateDeploy.indexOf('actions/deploy-pages@');
    const postflight = privateDeploy.indexOf(
      'scripts/notification-pages-private-deploy-launcher.mjs postflight',
    );
    expect(marker).toBeLessThan(deploy);
    expect(deploy).toBeLessThan(postflight);
    expect(privateDeploy).toContain(
      "if: ${{ always() && steps.deployment-attempt.outcome == 'success' }}",
    );
    expect(privateDeploy).toContain('if: ${{ always() }}');
    expect(privateDeploy).toContain(
      'WARPKEEP_DEPLOYMENT_OUTCOME: ${{ steps.deployment.outcome }}',
    );
    expect(privateDeploy).toContain(
      'WARPKEEP_POSTFLIGHT_OUTCOME: ${{ steps.private-postflight.outcome }}',
    );
    expect(privateDeploy).toContain(
      'Private Pages deployment did not complete its durable postflight.',
    );
    expect(privateDeploy).not.toMatch(/continue-on-error:\s*true/u);
  });
});
