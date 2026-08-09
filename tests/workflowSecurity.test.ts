import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function workflow(name: string) {
  return readFileSync(resolve(repositoryRoot, '.github/workflows', name), 'utf8');
}

function allWorkflows() {
  const directory = resolve(repositoryRoot, '.github/workflows');
  return readdirSync(directory)
    .filter(name => name.endsWith('.yml') || name.endsWith('.yaml'))
    .sort()
    .map(name => workflow(name));
}

describe('GitHub workflow security policy', () => {
  it('pins every external action to an immutable full commit SHA', () => {
    const source = allWorkflows().join('\n');
    const references = [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)]
      .map(match => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[0-9a-f]{40}$/);
    }
  });

  it('keeps Pages deployment authority out of the dependency-running build job', () => {
    const source = workflow('deploy-pages.yml');
    const build = source.slice(source.indexOf('  build:'), source.indexOf('  deploy:'));
    const deploy = source.slice(source.indexOf('  deploy:'));
    expect(build).toMatch(/^\s+pages:\s*read\s*$/m);
    expect(build).not.toMatch(/^\s+pages:\s*write\s*$/m);
    expect(build).not.toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(deploy).toMatch(/^\s+pages:\s*write\s*$/m);
    expect(deploy).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(source).not.toContain('enablement: true');
  });

  it('deploys Pages only after successful Verify completion for a main push', () => {
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
      "VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: ${{ vars.WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED || 'false' }}",
    );
    expect(build).toContain('true | false) ;;');
    expect(build).toContain(
      'WARPKEEP_SHARED_ALPHA_ENABLED must be exactly true or false.',
    );
    expect(source).toContain('group: pages-main');
    expect(source).not.toMatch(/^\s+group:\s*pages\s*$/m);
  });

  it('builds and verifies the exact successful Verify head SHA', () => {
    const source = workflow('deploy-pages.yml');
    const checkoutCount = (source.match(/actions\/checkout@/g) ?? []).length;
    const exactRefCount = (
      source.match(/ref:\s*\$\{\{ github\.event\.workflow_run\.head_sha \}\}/g) ?? []
    ).length;

    expect(checkoutCount).toBe(2);
    expect(exactRefCount).toBe(checkoutCount);
    expect(source).toContain(
      'VITE_WARPKEEP_BUILD_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).toContain(
      'WARPKEEP_EXPECTED_DEPLOYED_SHA: ${{ github.event.workflow_run.head_sha }}',
    );
    expect(source).not.toContain('${{ github.sha }}');
  });

  it('runs bounded read-only live verification and fails closed on auth mode ambiguity', () => {
    const source = workflow('deploy-pages.yml');
    const liveVerification = source.slice(source.indexOf('  verify-live:'));

    expect(liveVerification).toContain('needs: deploy');
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

  it('uses the reviewed Pages uploader with a SHA-pinned nested dependency', () => {
    const source = workflow('deploy-pages.yml');
    expect(source).toContain(
      'actions/upload-pages-artifact@fc324d3547104276b827a68afc52ff2a11cc49c9',
    );
    expect(source).not.toContain(
      'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa',
    );
    expect(source).not.toContain('actions/upload-artifact@');
    expect(source).toContain('path: ./dist');
    expect(source).toContain('include-hidden-files: true');
    expect(source).toContain('npm run verify:miniapp:release');
  });

  it('pins the reviewed Node 24 action generations instead of deprecated Node 20 releases', () => {
    const source = allWorkflows().join('\n');
    for (const reference of [
      'actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0',
      'actions/setup-node@820762786026740c76f36085b0efc47a31fe5020',
      'pnpm/action-setup@0ebf47130e4866e96fce0953f49152a61190b271',
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
    const jobs = allWorkflows()
      .map(source => source.slice(source.indexOf('jobs:')))
      .join('\n');
    const jobCount = (jobs.match(/^  [a-z0-9-]+:\s*$/gm) ?? []).length;
    const timeoutCount = (jobs.match(/^    timeout-minutes:\s*[1-9][0-9]*\s*$/gm) ?? []).length;
    expect(timeoutCount).toBe(jobCount);
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

  it('does not persist checkout credentials and audits every package boundary', () => {
    const source = allWorkflows().join('\n');
    const checkoutCount = (source.match(/actions\/checkout@/g) ?? []).length;
    const disabledCredentialCount = (source.match(/persist-credentials:\s*false/g) ?? []).length;
    expect(disabledCredentialCount).toBe(checkoutCount);
    expect(source).toContain('pnpm --dir services/auth-bridge audit --audit-level low');
    expect(source).toContain('pnpm --dir spacetimedb audit --audit-level low');
    expect(source).toContain('npm audit signatures');
  });

  it('runs root tests from an integrity-checked private Node copy', () => {
    const rootTestWorkflows = [
      workflow('verify.yml'),
      workflow('deploy-pages.yml'),
    ];

    for (const source of rootTestWorkflows) {
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
      expect(source).not.toContain('npm ci --ignore-scripts');
      expect(source).toContain(
        'Re-attest runner-private Node after dependency install',
      );
      expect(source.indexOf('run: npm ci')).toBeLessThan(
        source.indexOf('Re-attest runner-private Node after dependency install'),
      );
      expect(source).toContain('node_mode="$(stat -c \'%a\' "$WARPKEEP_PRIVATE_NODE")"');
      expect(source).toContain('$((8#$node_mode & 0022)) -ne 0');
      expect(source).toContain('| sha256sum --check --strict -');
      expect(source).toContain('npm test -- --maxWorkers=2');
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

  it('runs CodeQL without executing a repository build', () => {
    const source = workflow('codeql.yml');
    expect(source).toContain('security-events: write');
    expect(source).toContain('languages: javascript-typescript');
    expect(source).toContain('build-mode: none');
    expect(source).not.toMatch(/^\s+run:/m);
    expect(source).toContain('pull_request:');
    expect(source).not.toMatch(/pull_request:\s*\n\s+branches:/);
  });
});
