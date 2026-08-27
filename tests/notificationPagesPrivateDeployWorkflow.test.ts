// @vitest-environment node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repositoryRoot = resolve(import.meta.dirname, '..');
const workflowPath = resolve(repositoryRoot, '.github/workflows/deploy-pages.yml');
const operatorPath = resolve(
  repositoryRoot,
  'scripts/notification-pages-private-deploy-operator.mjs',
);

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
  it('uses the dependency-free sealed-launch classifier for the verified main run', () => {
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
    expect(classify).toContain(
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages',
    );
    expect(classify).not.toMatch(/(?:npm|pnpm) (?:ci|install)/u);
    expect(classify).not.toContain('services/auth-bridge/node_modules');
    expect(classify).not.toContain('notification-pages-live-receipt.mjs');
    expect(source).not.toContain(
      'notification-pages-private-deploy-operator.mjs classify',
    );
    expect(source).toContain(
      'WARPKEEP_PAGES_SOURCE_COMMIT: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).toContain("deployment-lane == 'sealed-g002'");
    expect(source).not.toContain("deployment-lane == 'closed-review'");
    expect(source).toContain("deployment-lane == 'gen0'");
    expect(source).toContain("deployment-lane == 'durable'");
    expect(document.jobs).toHaveProperty('deploy');
    expect(document.jobs).toHaveProperty('private-toolchain');
    expect(document.jobs).toHaveProperty('private-deploy');
  });

  it('ends preparation before artifacts, deployment authority, or notification lanes', () => {
    const source = workflow();
    const verifier = readFileSync(
      resolve(repositoryRoot, 'scripts/verify-0.4.0-sealed-launch.mjs'),
      'utf8',
    );
    const classify = job(source, 'classify', 'build');
    const build = job(source, 'build', 'deploy');
    const deploy = job(source, 'deploy', 'verify-live');
    const privateToolchain = job(source, 'private-toolchain', 'private-deploy');
    const privateDeploy = job(source, 'private-deploy');

    expect(verifier).toContain(
      "return result.phase === 'activation' ? 'sealed-g002' : 'sealed-launch-blocked';",
    );
    expect(classify).not.toMatch(
      /(?:actions\/(?:upload|deploy)-pages|environment:|pages:\s*write|id-token:\s*write|secrets\.|npm ci)/u,
    );
    expect(build).toContain("deployment-lane == 'sealed-g002'");
    expect(build).not.toContain('sealed-launch-blocked');
    expect(build.indexOf('npm run verify:sealed-launch:activation')).toBeLessThan(
      build.indexOf('npm run build'),
    );
    expect(build.indexOf('npm run build')).toBeLessThan(
      build.indexOf('actions/upload-pages-artifact@'),
    );
    expect(deploy).toContain("deployment-lane == 'sealed-g002'");
    expect(deploy).not.toContain('sealed-launch-blocked');
    expect(privateToolchain).not.toContain('sealed-launch-blocked');
    expect(privateDeploy).not.toContain('sealed-launch-blocked');
    expect(privateToolchain).toMatch(/deployment-lane == 'gen0'[\s\S]*deployment-lane == 'durable'/u);
    expect(privateDeploy).toMatch(/deployment-lane == 'gen0'[\s\S]*deployment-lane == 'durable'/u);
    expect(verifier).not.toMatch(/\?\s*'(?:gen0|durable)'/u);
    expect(source).not.toContain('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED');
  });

  it('builds the source literal and validates notification authority statically', () => {
    const source = workflow();
    const build = job(source, 'build', 'deploy');
    expect(build).toContain(
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    );
    expect(build).not.toContain('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED');
    expect(build).toContain('npm run verify:sealed-launch:activation');
    expect(build).not.toContain('npm run validate:pages-config');
    expect(build).not.toContain('npm run verify:greater-realm-release-gates');
    expect(build.indexOf('npm run verify:sealed-launch:activation')).toBeLessThan(
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
    )).toHaveLength(5);
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
    expect(privateDeploy).toContain('attest-deployment-source');
    expect(source).not.toMatch(
      /node scripts\/notification-pages-private-deploy-operator\.mjs/u,
    );
    expect(privateDeploy.match(/\/usr\/bin\/env -i/g)?.length).toBeGreaterThanOrEqual(5);
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

  it('proves protected main and both exact workflow runs in the attested process', () => {
    const privateDeploy = job(workflow(), 'private-deploy');
    const operator = readFileSync(operatorPath, 'utf8');
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
    expect(privateDeploy).not.toMatch(/(?:gh api|jq -e)/u);
    expect(privateDeploy.match(/8<<<"\$GH_TOKEN"/g)).toHaveLength(3);
    expect(privateDeploy.match(/WARPKEEP_SOURCE_VERIFY_RUN_ID=/g)).toHaveLength(5);
    expect(privateDeploy.match(/WARPKEEP_SOURCE_VERIFY_RUN_ATTEMPT=/g))
      .toHaveLength(5);
    for (const requirement of [
      '`/repos/${REPOSITORY}/branches/main`',
      '`/repos/${REPOSITORY}/actions/runs/${request.runId}`',
      '`/repos/${REPOSITORY}/actions/runs/${request.sourceRunId}`',
      "status: 'in_progress'",
      "conclusion: 'success'",
      "event: 'workflow_run'",
      "event: 'push'",
      'workflow: WORKFLOW',
      'workflow: SOURCE_WORKFLOW',
    ]) expect(operator).toContain(requirement);
    expect(operator.match(/assertDeploymentAuthority\(/g)).toHaveLength(2);
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
