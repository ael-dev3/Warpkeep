import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const isolatedRootTestRun = [
  '# These two contracts need the complete prepared toolchain. Their',
  '# serial run remains bounded independently of scanning and builds.',
  'timeout --foreground --signal=TERM --kill-after=30s 12m npm test -- \\',
  '  tests/authBridgeNotificationPreparedWorkflow.test.ts \\',
  '  tests/productionPlayerCanaryClosure.test.ts \\',
  '  --maxWorkers=1 \\',
  '  --testTimeout=180000',
  '',
].join('\n');
const rootShardRun = [
  '# Vitest shards its discovered test files after applying these exact',
  '# exclusions. All four legs must succeed; no file is silently skipped.',
  'timeout --foreground --signal=TERM --kill-after=30s 48m npm test -- \\',
  '  --exclude tests/authBridgeNotificationPreparedWorkflow.test.ts \\',
  '  --exclude tests/productionPlayerCanaryClosure.test.ts \\',
  '  --exclude tests/sealedRealmsProductionActivationRecords.test.ts \\',
  '  --exclude tests/ptrProductionExistingUpdateContinuation.test.ts \\',
  '  --exclude tests/greaterRealmRuntimeRelease.test.ts \\',
  '  --shard="${{ matrix.selector }}" \\',
  '  --maxWorkers=1',
  '',
].join('\n');
const heavyRootTestRun = [
  'timeout --foreground --signal=TERM --kill-after=30s 48m npm test -- \\',
  '  "${{ matrix.selector }}" \\',
  '  --maxWorkers=1 \\',
  '  --testTimeout=180000',
  '',
].join('\n');
const activationTableTitle =
  'fixed recovery candidate source/receipt derivation derives actual committed source and private records without inventing live facts: ';
const activationRestRun = [
  'timeout --foreground --signal=TERM --kill-after=30s 48m npm test -- \\',
  '  "${{ matrix.selector }}" \\',
  `  --testNamePattern='^(?!${activationTableTitle}).*$' \\`,
  '  --maxWorkers=1 \\',
  '  --testTimeout=180000',
  '',
].join('\n');
const activationGroupRun = [
  'timeout --foreground --signal=TERM --kill-after=30s 48m npm test -- \\',
  '  tests/sealedRealmsProductionActivationRecords.test.ts \\',
  `  --testNamePattern="^${activationTableTitle}(\${{ matrix.selector }})$" \\`,
  '  --maxWorkers=1 \\',
  '  --testTimeout=180000',
  '',
].join('\n');

interface WorkflowStep {
  name?: string;
  if?: string;
  run?: string;
  uses?: string;
  with?: Record<string, unknown>;
  [key: string]: unknown;
}

interface WorkflowJob {
  'timeout-minutes'?: number;
  env?: Record<string, unknown>;
  strategy?: { 'fail-fast'?: boolean; matrix?: Record<string, unknown> };
  steps?: WorkflowStep[];
}

function workflow(name: string) {
  return readFileSync(resolve(repositoryRoot, '.github/workflows', name), 'utf8');
}

function workflowJob(workflowName: string, jobName: string): WorkflowJob {
  const document = parse(workflow(workflowName)) as {
    jobs?: Record<string, WorkflowJob>;
  };
  const job = document.jobs?.[jobName];
  if (job === undefined) throw new Error(`workflow job ${jobName} missing`);
  return job;
}

function workflowJobSource(workflowName: string, jobName: string): string {
  const source = workflow(workflowName);
  const jobs = [...source.matchAll(/^  ([a-z0-9-]+):\s*$/gm)];
  const index = jobs.findIndex(match => match[1] === jobName);
  if (index < 0) throw new Error(`workflow job ${jobName} missing`);
  return source.slice(jobs[index].index, jobs[index + 1]?.index);
}

function allWorkflows() {
  const directory = resolve(repositoryRoot, '.github/workflows');
  return readdirSync(directory)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map(name => workflow(name));
}

describe('GitHub workflow security policy', () => {
  it('keeps the patched pnpm authority across direct calls and nested retained-package scripts', () => {
    for (const name of ['verify.yml', 'deploy-pages.yml']) {
      const document = parse(workflow(name)) as {
        env: Record<string, unknown>;
        jobs: Record<string, WorkflowJob>;
      };
      expect(document.env.pnpm_config_pm_on_fail, name).toBe('ignore');
      for (const [jobName, job] of Object.entries(document.jobs)) {
        const steps = job.steps ?? [];
        const setups = steps.filter(step => step.uses?.startsWith('pnpm/action-setup@'));
        const calls = steps.flatMap(step => [...(step.run ?? '').matchAll(/\bpnpm\s+(?!--version\b)(\S+)/gu)]);
        if (calls.length === 0 && setups.length === 0) continue;
        expect(setups, `${name}:${jobName}`).toHaveLength(1);
        expect(setups[0].with?.version, `${name}:${jobName}`).toBe('11.11.0');
        if (Object.hasOwn(job.env ?? {}, 'pnpm_config_pm_on_fail')) {
          expect(job.env?.pnpm_config_pm_on_fail, `${name}:${jobName}`).toBe('ignore');
        }
        for (const step of steps) {
          const env = step.env as Record<string, unknown> | undefined;
          if (Object.hasOwn(env ?? {}, 'pnpm_config_pm_on_fail')) {
            expect(env?.pnpm_config_pm_on_fail, `${name}:${jobName}:${step.name}`).toBe('ignore');
          }
        }
        for (const call of calls) {
          expect(call[1], `${name}:${jobName}`).toBe('--pm-on-fail=ignore');
        }
      }
    }
    for (const path of ['spacetimedb', 'spacetimedb/genesis002', 'spacetimedb/ptr',
      'services/auth-bridge', 'services/release-recovery']) {
      const manifest = JSON.parse(readFileSync(resolve(repositoryRoot, path, 'package.json'), 'utf8'));
      expect(manifest.packageManager, path).toBe('pnpm@11.7.0');
    }
  });

  it('supersedes only the same PR verification, leaving main and deployment locks separate', () => {
    const verify = parse(workflow('verify.yml'));
    expect(verify.concurrency).toEqual({
      group: 'verify-pr-${{ github.event.pull_request.number || github.run_id }}',
      'cancel-in-progress': "${{ github.event_name == 'pull_request' }}",
    });
    const pages = parse(workflow('deploy-pages.yml'));
    expect(pages.concurrency).toEqual({
      group: 'warpkeep-production-state',
      'cancel-in-progress': false,
    });
    for (const job of Object.values(verify.jobs)) {
      expect(job).not.toHaveProperty('concurrency');
    }
  });

  it('pins every external action to an immutable full commit SHA', () => {
    const source = allWorkflows().join('\n');
    const references = [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)]
      .map(match => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/);
    }
  });

  it('keeps public candidate preparation read-only and separate from dormant private deployment', () => {
    const source = workflow('deploy-pages.yml');
    const build = source.slice(source.indexOf('  build:'), source.indexOf('  deploy:'));
    const deploy = source.slice(source.indexOf('  deploy:'));
    expect(build).toMatch(/^\s+contents:\s*read\s*$/m);
    expect(build).not.toMatch(/^\s+pages:\s*(?:read|write)\s*$/m);
    expect(build).not.toMatch(/^\s+pages:\s*write\s*$/m);
    expect(build).not.toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(build).not.toMatch(/actions\/(?:configure|upload|deploy)-pages@/u);
    expect(build).toContain("deployment-lane == 'public-mirror-candidate'");
    expect(deploy).not.toContain("deployment-lane == 'public-mirror-candidate'");
    expect(deploy).toMatch(/^\s+pages:\s*write\s*$/m);
    expect(deploy).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(source).not.toContain('enablement: true');
  });

  it('prepares the public candidate only after successful Verify for exact current main', () => {
    const source = workflow('deploy-pages.yml');
    const trigger = source.slice(source.indexOf('on:'), source.indexOf('permissions:'));
    const build = source.slice(source.indexOf('  build:'), source.indexOf('  deploy:'));
    const deploy = source.slice(
      source.indexOf('  deploy:'),
      source.indexOf('  verify-live:')
    );
    expect(trigger).toMatch(/^\s+workflow_run:\s*$/m);
    expect(trigger).toMatch(/^\s+workflows:\s*\[Verify\]\s*$/m);
    expect(trigger).toMatch(/^\s+types:\s*\[completed\]\s*$/m);
    expect(trigger).toMatch(/^\s+branches:\s*\[main\]\s*$/m);
    expect(trigger).not.toMatch(/^\s+push:\s*$/m);
    expect(trigger).not.toMatch(/^\s+workflow_dispatch:\s*$/m);
    expect(build).toContain("github.event.workflow_run.conclusion == 'success'");
    expect(build).toContain("github.event.workflow_run.event == 'push'");
    expect(build).toContain("github.event.workflow_run.head_branch == 'main'");
    expect(build).toContain("deployment-lane == 'public-mirror-candidate'");
    expect(build).toContain(
      'WARPKEEP_VERIFIED_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(build).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq \'.object.sha\'',
    );
    expect(build).toContain(
      '[[ "$current_main" != "$WARPKEEP_VERIFIED_SHA" ]]',
    );
    expect(deploy).toContain(
      'WARPKEEP_VERIFIED_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(deploy).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/git/ref/heads/main" --jq \'.object.sha\'',
    );
    expect(deploy).toContain(
      '[[ "$current_main" != "$WARPKEEP_VERIFIED_SHA" ]]',
    );
    expect(deploy.indexOf('Confirm artifact SHA remains current main')).toBeLessThan(
      deploy.indexOf('actions/deploy-pages@'),
    );
    expect(build).toContain(
      'VITE_WARPKEEP_SHARED_ALPHA_ENABLED: ${{ vars.WARPKEEP_SHARED_ALPHA_ENABLED }}',
    );
    expect(build).toContain(
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    );
    expect(build).not.toContain('vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED');
    expect(build).toContain('[[ "$VITE_WARPKEEP_SHARED_ALPHA_ENABLED" != \'true\' ]]');
    expect(build).toContain(
      'WARPKEEP_SHARED_ALPHA_ENABLED must be true for owner PTR.',
    );
    expect(build).toContain('npm run verify:sealed-launch:activation');
    expect(build).toContain('npm run validate:pages-config');
    expect(build.indexOf('npm ci')).toBeLessThan(
      build.indexOf('npm run validate:pages-config'),
    );
    expect(build.indexOf('npm run validate:pages-config')).toBeLessThan(
      build.indexOf('npm run build'),
    );
    expect(build).not.toContain('npm run verify:greater-realm-release-gates');
    const ptrPagesBuildGate =
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=pages-build';
    expect(build).toContain(ptrPagesBuildGate);
    expect(build.indexOf(ptrPagesBuildGate)).toBeLessThan(
      build.indexOf('\n      - name: Install\n'),
    );
    const pages = parse(source) as { jobs: Record<string, WorkflowJob> };
    const verificationPhases = Object.fromEntries(Object.entries(pages.jobs)
      .flatMap(([name, job]) => {
        const phases = (job.steps ?? []).flatMap(step => [...(step.run ?? '')
          .matchAll(/scripts\/verify-0\.4\.0-sealed-launch\.mjs --phase=([a-z-]+)/g)]
          .map(match => match[1]));
        return phases.length ? [[name, phases]] : [];
      }));
    expect(verificationPhases).toEqual({
      classify: ['pages'], build: ['pages-build'], deploy: ['activation'],
      'verify-live': ['activation'], 'deploy-recovery': ['pages-build'],
    });
    expect(build.indexOf('npm run verify:sealed-launch:activation')).toBeLessThan(
      build.indexOf('npm run build'),
    );
    expect(build.indexOf('npm run build')).toBeLessThan(
      build.indexOf('node scripts/verify-public-pages-payload.mjs --write'),
    );
    expect(build.indexOf('node scripts/verify-public-pages-payload.mjs --write')).toBeLessThan(
      build.indexOf('node scripts/verify-public-pages-payload.mjs --check'),
    );
    expect(source).toContain('group: warpkeep-production-state');
    expect(source).not.toMatch(/^\s+group:\s*pages\s*$/m);
  });

  it('serializes deployment and its postflight in one non-cancelling workflow scope', () => {
    const source = workflow('deploy-pages.yml');
    const concurrencyStart = source.indexOf('concurrency:');
    const jobsStart = source.indexOf('jobs:');
    const deployStart = source.indexOf('  deploy:');
    const postflightStart = source.indexOf('  verify-live:');
    const concurrency = source.slice(concurrencyStart, jobsStart);
    const deploy = source.slice(deployStart, postflightStart);
    const postflight = workflowJobSource('deploy-pages.yml', 'verify-live');

    expect(concurrencyStart).toBeGreaterThan(-1);
    expect(concurrencyStart).toBeLessThan(jobsStart);
    expect(source.match(/^concurrency:\s*$/gm)).toHaveLength(1);
    expect(source).not.toMatch(/^[ \t]+concurrency:\s*$/gm);
    expect(source.match(/^[ \t]+cancel-in-progress:\s*/gm)).toHaveLength(1);
    expect(concurrency).toMatch(
      /^\s+group:\s*warpkeep-production-state\s*$/m,
    );
    expect(concurrency).toMatch(/^\s+cancel-in-progress:\s*false\s*$/m);
    expect(concurrency).not.toMatch(/^\s+cancel-in-progress:\s*true\s*$/m);

    expect(deployStart).toBeGreaterThan(jobsStart);
    expect(postflightStart).toBeGreaterThan(deployStart);
    expect(deploy.match(/^      - /gm)).toHaveLength(7);
    expect(deploy).toMatch(/^      - name: Confirm artifact SHA remains current main$/m);
    expect(deploy).toMatch(/^      - name: Checkout exact deployment source$/m);
    expect(deploy).toMatch(
      /^      - name: Re-attest release authority immediately before deployment$/m,
    );
    expect(deploy).toMatch(
      /^      - name: Install exact deployment-boundary parser dependencies$/m,
    );
    expect(deploy).toMatch(/^      - name: Deploy to GitHub Pages$/m);
    expect(deploy).toContain('Confirm artifact SHA remains current main');
    expect(deploy).toContain('actions/deploy-pages@');
    expect(deploy).toContain('deployment-attempted: ${{ steps.deployment-attempt.outputs.attempted }}');
    expect(deploy).toContain('node-version: 22.22.3');
    expect(deploy).toContain('umask 0022');
    expect(deploy).toContain(
      'npm ci --ignore-scripts --no-audit --no-fund',
    );
    expect(deploy).toContain(
      'scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    );
    expect(deploy).not.toContain('scripts/verify-greater-realm-release-gates.mjs');
    expect(deploy.indexOf(
      'scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    )).toBeLessThan(
      deploy.indexOf('actions/deploy-pages@'),
    );
    expect(deploy.slice(
      deploy.indexOf('scripts/verify-0.4.0-sealed-launch.mjs --phase=activation'),
      deploy.indexOf('actions/deploy-pages@'),
    ).match(/^      - name:/gm)).toHaveLength(1);
    expect(postflight).toContain('needs: deploy');
    expect(postflight).toContain(
      "if: ${{ always() && needs.deploy.outputs.deployment-attempted == 'true' }}",
    );
    expect(postflight).toContain(
      'Re-verify sealed-launch receipts and closed presentation gates',
    );
    expect(postflight).toContain(
      'WARPKEEP_VERIFIED_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(postflight).toContain('node-version: 22.22.3');
    expect(postflight).toContain('Install exact live-verification resolver tree');
    expect(postflight).toContain(
      'npm ci --ignore-scripts --no-audit --no-fund',
    );
    expect(postflight.indexOf(
      'npm ci --ignore-scripts --no-audit --no-fund',
    )).toBeLessThan(
      postflight.indexOf('node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation'),
    );
    expect(postflight).toContain(
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    );
    expect(postflight).toContain('npm run verify:admission-request-suspension');
    expect(postflight.indexOf(
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    )).toBeLessThan(
      postflight.indexOf('Verify exact live release'),
    );
    expect(postflight).toContain('Verify exact live release');
  });

  it('builds and verifies the exact successful Verify head SHA', () => {
    const source = workflow('deploy-pages.yml');
    const pages = parse(source) as { jobs: Record<string, WorkflowJob> };
    expect(Object.keys(pages.jobs).sort()).toEqual([
      'build', 'classify', 'deploy', 'deploy-recovery', 'private-deploy',
      'private-toolchain', 'verify-live',
    ]);
    for (const [name, job] of Object.entries(pages.jobs)) {
      const checkouts = job.steps?.filter(step => step.uses?.startsWith('actions/checkout@')) ?? [];
      expect(checkouts, `${name} must check out its own verified source`).toHaveLength(1);
      expect(checkouts[0].with).toMatchObject({
        ref: '${{ github.event.workflow_run.head_sha }}',
        'fetch-depth': name === 'private-toolchain' ? 1 : 0,
        'persist-credentials': false,
      });
    }
    expect(source).toContain(
      'VITE_WARPKEEP_BUILD_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).toContain(
      'WARPKEEP_EXPECTED_DEPLOYED_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).not.toContain('${{ github.sha }}');
  });

  it('runs bounded read-only live verification and fails closed on auth mode ambiguity', () => {
    const liveVerification = workflowJobSource('deploy-pages.yml', 'verify-live');

    expect(liveVerification).toContain('needs: deploy');
    expect(liveVerification).toContain(
      "if: ${{ always() && needs.deploy.outputs.deployment-attempted == 'true' }}",
    );
    expect(liveVerification).toMatch(/^\s+contents:\s*read\s*$/m);
    expect(liveVerification).not.toMatch(/^\s+pages:\s*write\s*$/m);
    expect(liveVerification).not.toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(liveVerification).toContain(
      'VITE_WARPKEEP_SHARED_ALPHA_ENABLED: ${{ vars.WARPKEEP_SHARED_ALPHA_ENABLED }}',
    );
    expect(liveVerification).toContain(
      "true) verification_mode='--require-auth-v2-enabled'",
    );
    expect(liveVerification).toContain(
      "false) verification_mode='--require-auth-v2'",
    );
    expect(liveVerification).toContain(
      'WARPKEEP_SHARED_ALPHA_ENABLED must be exactly true or false.',
    );
    expect(liveVerification).toContain('maximum_attempts=4');
    expect(liveVerification).toContain(
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    );
    expect(liveVerification.indexOf(
      'node scripts/verify-0.4.0-sealed-launch.mjs --phase=activation',
    )).toBeLessThan(
      liveVerification.indexOf('npm run verify:admission-request-suspension'),
    );
    expect(liveVerification.indexOf(
      'npm run verify:admission-request-suspension',
    )).toBeLessThan(
      liveVerification.indexOf('node scripts/verify-alpha-production.mjs'),
    );
    expect(liveVerification).toContain(
      'node scripts/verify-alpha-production.mjs "$verification_mode"',
    );
    expect(liveVerification).not.toContain('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(liveVerification).not.toMatch(/\b(?:curl|wget)\b/);
  });

  it('makes the default local production verifier match the enabled live auth-v2 contract', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(repositoryRoot, 'package.json'), 'utf8')
    ) as { scripts?: Record<string, string> };

    expect(packageJson.scripts?.['verify:alpha-production']).toBe(
      'node scripts/verify-alpha-production.mjs --require-auth-v2-enabled'
    );
    expect(packageJson.scripts?.['verify:alpha-production:contained']).toBe(
      'node scripts/verify-alpha-production.mjs --require-auth-v2'
    );
  });

  it('keeps public candidate bytes local while retaining the dormant recovery uploader', () => {
    const source = workflow('deploy-pages.yml');
    const build = workflowJobSource('deploy-pages.yml', 'build');
    expect(build).not.toMatch(/actions\/(?:configure|upload|deploy)-pages@/u);
    expect(build).toContain('node scripts/verify-public-pages-payload.mjs --write');
    expect(build).toContain('node scripts/verify-public-pages-payload.mjs --check');
    expect(source).toContain(
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
    );
    expect(source).not.toContain(
      'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa',
    );
    expect(source).not.toContain('actions/upload-artifact@');
    expect(workflowJobSource('deploy-pages.yml', 'deploy-recovery')).toContain('path: ./dist');
    expect(workflowJobSource('deploy-pages.yml', 'deploy-recovery')).toContain('include-hidden-files: true');
    expect(source).toContain('npm run verify:miniapp:release');
  });

  it('pins the reviewed Node 24 action generations instead of deprecated Node 20 releases', () => {
    const source = allWorkflows().join('\n');
    for (const reference of [
      'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      'pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86',
      'actions/configure-pages@45bfe0192ca1faeb007ade9deae92b16b8254a0d',
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
      'actions/deploy-pages@cd2ce8fcbc39b97be8ca5fce6e763baed58fa128',
    ]) {
      expect(source).toContain(reference);
    }
    for (const deprecatedReference of [
      'actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5',
      'actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020',
      'pnpm/action-setup@b906affcce14559ad1aafd4ab0e942779e9f58b1',
      'actions/configure-pages@983d7736d9b0ae728b81ab479565c72886d7745b',
      'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
      'actions/deploy-pages@d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e',
    ]) {
      expect(source).not.toContain(deprecatedReference);
    }
  });

  it('bounds every workflow job duration', () => {
    for (const source of allWorkflows()) {
      const document = parse(source) as { name: string; jobs: Record<string, WorkflowJob> };
      expect(Object.keys(document.jobs).length).toBeGreaterThan(0);
      for (const [name, job] of Object.entries(document.jobs)) {
        const timeout = job['timeout-minutes'];
        const context = `${document.name}/${name} must set a positive integer timeout-minutes`;
        expect(Number.isInteger(timeout), context).toBe(true);
        expect(timeout, context).toBeGreaterThan(0);
      }
    }
  });

  it('bounds each root-test runner and retains all discovered files across the split', () => {
    const linux = workflowJob('verify.yml', 'linux');
    expect(linux['timeout-minutes']).toBe(75);
    expect(linux.steps?.filter(step => step.name === 'Run isolated root security tests')).toEqual([
      { name: 'Run isolated root security tests', run: isolatedRootTestRun },
    ]);
    const matrixJob = workflowJob('verify.yml', 'root-tests');
    expect(matrixJob['timeout-minutes']).toBe(55);
    const matrix = [
      { kind: 'shard', selector: '1/4' },
      { kind: 'shard', selector: '2/4' },
      { kind: 'shard', selector: '3/4' },
      { kind: 'shard', selector: '4/4' },
      { kind: 'heavy', selector: 'tests/ptrProductionExistingUpdateContinuation.test.ts' },
      { kind: 'heavy', selector: 'tests/greaterRealmRuntimeRelease.test.ts' },
      { kind: 'activation-rest', selector: 'tests/sealedRealmsProductionActivationRecords.test.ts' },
      { kind: 'activation', selector: 'missing-live-inputs|bootstrap-tree|bootstrap-blob|bootstrap-sha|missing-record' },
      { kind: 'activation', selector: 'wrong-private-store|wrong-operation|changed-head|replacement-objects' },
      { kind: 'activation', selector: 'caller-facts|expired-records|historical-context|historical-forged-time' },
      { kind: 'activation', selector: 'historical-malformed-time|historical-changed-completion|historical-late-changed-completion|historical-replaced-corpus' },
    ];
    expect(matrixJob.strategy).toEqual({
      'fail-fast': false,
      matrix: { include: matrix },
    });
    expect(matrixJob.steps?.filter(step => step.name === 'Run root test shard')).toEqual([
      { name: 'Run root test shard', if: "matrix.kind == 'shard'", run: rootShardRun },
    ]);
    expect(matrixJob.steps?.filter(step => step.name === 'Run isolated heavy root test')).toEqual([
      { name: 'Run isolated heavy root test', if: "matrix.kind == 'heavy'", run: heavyRootTestRun },
    ]);
    expect(matrixJob.steps?.filter(step => step.name === 'Run activation-records tests outside the long candidate table')).toEqual([
      { name: 'Run activation-records tests outside the long candidate table',
        if: "matrix.kind == 'activation-rest'", run: activationRestRun },
    ]);
    expect(matrixJob.steps?.filter(step => step.name === 'Run bounded activation-records candidate group')).toEqual([
      { name: 'Run bounded activation-records candidate group',
        if: "matrix.kind == 'activation'", run: activationGroupRun },
    ]);
    const excluded = [...rootShardRun.matchAll(/--exclude (tests\/[^\s]+)/gu)].map(match => match[1]);
    expect(excluded).toEqual([
      'tests/authBridgeNotificationPreparedWorkflow.test.ts',
      'tests/productionPlayerCanaryClosure.test.ts',
      'tests/sealedRealmsProductionActivationRecords.test.ts',
      ...matrix.filter(entry => entry.kind === 'heavy').map(entry => entry.selector),
    ]);
    expect(new Set(excluded).size).toBe(5);
    for (const file of excluded) {
      expect(readdirSync(resolve(repositoryRoot, 'tests'))).toContain(file.slice('tests/'.length));
    }
    expect(readFileSync(resolve(repositoryRoot, 'vite.config.ts'), 'utf8'))
      .toContain("include: ['tests/**/*.{test,spec}.{ts,tsx}']");

    const activationSource = readFileSync(resolve(repositoryRoot,
      'tests/sealedRealmsProductionActivationRecords.test.ts'), 'utf8');
    const tableStart = activationSource.indexOf("describe('fixed recovery candidate source/receipt derivation'");
    expect(tableStart).toBeGreaterThan(0);
    const tableCases = /it\.each\(\[([\s\S]*?)\]\)\(\s*'derives actual committed source and private records without inventing live facts: %s'/u
      .exec(activationSource.slice(tableStart))?.[1];
    expect(tableCases).toBeDefined();
    const scenarios = [...tableCases!.matchAll(/'([^']+)'/gu)].map(match => match[1]);
    const groups = matrix.filter(entry => entry.kind === 'activation')
      .map(entry => entry.selector.split('|'));
    expect(groups.map(group => group.length)).toEqual([5, 4, 4, 4]);
    expect(groups.flat()).toEqual(scenarios);
    const patterns = groups.map(group => new RegExp(
      `^${activationTableTitle}(${group.join('|')})$`, 'u',
    ));
    for (const scenario of scenarios) {
      const fullName = `${activationTableTitle}${scenario}`;
      expect(patterns.filter(pattern => pattern.test(fullName))).toHaveLength(1);
      expect(new RegExp(`^(?!${activationTableTitle}).*$`, 'u').test(fullName)).toBe(false);
    }
    expect(new RegExp(`^(?!${activationTableTitle}).*$`, 'u').test(
      'connected recovery activation generation uses the fixed generator',
    )).toBe(true);
  });

  it('uses a checksum-verified CLI archive and never pipes a remote installer to a shell', () => {
    const source = workflow('verify.yml');
    expect(source).not.toContain('install.spacetimedb.com');
    expect(source).not.toMatch(/curl[^\n|]*\|\s*(?:ba)?sh/);
    expect(source).toContain('cb03bb4706dc6bd6ef080c9bbd220a6e7d10430a65e7be2ba6be27ec7e3a9118');
    expect(source).toContain('sha256sum --check --strict');
    expect(source).toContain('spacetime-x86_64-unknown-linux-gnu.tar.gz');
    expect(source).toContain('spacetimedb-cli spacetimedb-standalone');
  });

  it('gives every matrix leg the same root-test prerequisites as Linux', () => {
    const verify = workflowJob('verify.yml', 'linux');
    const steps = workflowJob('verify.yml', 'root-tests').steps ?? [];
    const testsAt = steps.findIndex(step => step.name?.startsWith('Run ') === true);
    const reattestAt = steps.findIndex(step => step.name === 'Re-attest runner-private Node after dependency install');
    expect(testsAt).toBeGreaterThan(reattestAt);
    for (const name of [
        'Checkout',
        'Setup Node',
        'Setup pinned pnpm for bridge runtime-contract tests',
        'Stage Node in a runner-private toolchain path',
        'Install dependencies',
        'Install exact bridge runtime-test toolchain',
        'Validate PTR lock and install SpacetimeDB module dependencies',
        'Re-attest runner-private Node after dependency install',
        'Install pinned SpacetimeDB CLI',
        'Prepare exact offline YAML archive for manifest tests',
    ]) {
      const expected = verify.steps?.find(step => step.name === name);
      expect(expected, `${name} must exist in Linux`).toBeDefined();
      expect(steps.filter(step => step.name === name), `${name} differs from Linux`).toEqual([expected]);
      expect(steps.findIndex(step => step.name === name), `${name} must precede tests`)
        .toBeLessThan(testsAt);
    }
  });

  it('does not rerun the full root suite after successful Verify when building Pages', () => {
    const pages = workflowJob('deploy-pages.yml', 'build');
    expect(pages.steps?.some(step => step.name === 'Test')).toBe(false);
    expect(pages.steps?.some(step => /\bnpm test\b/u.test(step.run ?? ''))).toBe(false);
  });

  it('does not persist checkout credentials and audits every package boundary', () => {
    const source = allWorkflows().join('\n');
    const checkoutCount = (source.match(/actions\/checkout@/g) ?? []).length;
    const disabledCredentialCount = (source.match(/persist-credentials:\s*false/g) ?? []).length;
    expect(disabledCredentialCount).toBe(checkoutCount);
    expect(source).toContain('pnpm --pm-on-fail=ignore --dir services/auth-bridge audit --audit-level low');
    expect(source).toContain('pnpm --pm-on-fail=ignore --dir spacetimedb audit --audit-level low');
    expect(source).toContain('npm audit signatures');
  });

  it('runs root tests from an integrity-checked private Node copy', () => {
    const rootTestWorkflows = [
      {
        source: workflowJobSource('verify.yml', 'linux'),
        job: workflowJob('verify.yml', 'linux'),
        stepName: 'Run isolated root security tests',
        run: isolatedRootTestRun,
        condition: undefined,
      },
      {
        source: workflowJobSource('verify.yml', 'root-tests'),
        job: workflowJob('verify.yml', 'root-tests'),
        stepName: 'Run root test shard',
        run: rootShardRun,
        condition: "matrix.kind == 'shard'",
      },
      {
        source: workflowJobSource('verify.yml', 'root-tests'),
        job: workflowJob('verify.yml', 'root-tests'),
        stepName: 'Run isolated heavy root test',
        run: heavyRootTestRun,
        condition: "matrix.kind == 'heavy'",
      },
      {
        source: workflowJobSource('verify.yml', 'root-tests'),
        job: workflowJob('verify.yml', 'root-tests'),
        stepName: 'Run activation-records tests outside the long candidate table',
        run: activationRestRun,
        condition: "matrix.kind == 'activation-rest'",
      },
      {
        source: workflowJobSource('verify.yml', 'root-tests'),
        job: workflowJob('verify.yml', 'root-tests'),
        stepName: 'Run bounded activation-records candidate group',
        run: activationGroupRun,
        condition: "matrix.kind == 'activation'",
      },
    ];

    for (const { source, job, stepName, run, condition } of rootTestWorkflows) {
      expect(source).toContain('Stage Node in a runner-private toolchain path');
      expect(source).toContain('source_command="$(command -v node)"');
      expect(source).toContain('[[ -L "$source_command" ]]');
      expect(source).toContain('case "$source_node" in');
      expect(source).toContain('"$RUNNER_TOOL_CACHE"/*) ;;');
      expect(source).toContain('mktemp -d "$RUNNER_TEMP/warpkeep-node.XXXXXX"');
      expect(source).toContain('chmod 0700 "$private_root"');
      expect(source).toContain('install -d -m 0700 "$private_bin"');
      expect(source).toContain(
        'install -m 0700 "$source_node" "$private_bin/node"',
      );
      expect(source).toContain('"$source_sha_before" != "$source_sha_after"');
      expect(source).toContain('"$source_sha_before" != "$staged_sha"');
      expect(source).toContain('echo "$private_bin" >> "$GITHUB_PATH"');
      expect(source).toContain(
        'echo "WARPKEEP_PRIVATE_NODE=$private_bin/node" >> "$GITHUB_ENV"',
      );
      expect(source).toContain(
        'echo "WARPKEEP_PRIVATE_NODE_SHA256=$staged_sha" >> "$GITHUB_ENV"',
      );
      expect(source).toMatch(/run: npm ci(?:\r?\n|$)/u);
      expect(source).toContain(
        'Re-attest runner-private Node after dependency install',
      );
      expect(source.indexOf('run: npm ci')).toBeLessThan(
        source.indexOf('Re-attest runner-private Node after dependency install'),
      );
      expect(source).toContain('node_mode="$(stat -c \'%a\' "$WARPKEEP_PRIVATE_NODE")"');
      expect(source).toContain('$((8#$node_mode & 0022)) -ne 0');
      expect(source).toContain('| sha256sum --check --strict -');
      expect(job.steps?.filter(step => step.name === stepName)).toEqual([
        condition === undefined
          ? { name: stepName, run }
          : { name: stepName, if: condition, run },
      ]);
      expect(source).not.toMatch(/npm test -- --maxWorkers=[3-9]/);
    }
  });

  it('runs verification for every pull-request base and ignores every Wrangler secret-file variant', () => {
    const source = workflow('verify.yml');
    expect(source).toContain('pull_request:');
    expect(source).not.toMatch(/pull_request:\s*\n\s+branches:/);
    const ignored = execFileSync(
      'git',
      ['check-ignore', 'services/auth-bridge/.dev.vars.production'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    );
    expect(ignored.trim()).toBe('services/auth-bridge/.dev.vars.production');
  });

  it('does not keep a private-repo CodeQL workflow that cannot upload results', () => {
    expect(readdirSync(resolve(repositoryRoot, '.github/workflows'))).not.toContain('codeql.yml');
  });
});
