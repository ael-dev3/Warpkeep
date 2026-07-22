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

  it('refuses a manually dispatched Pages deployment from any non-main ref', () => {
    const source = workflow('deploy-pages.yml');
    const build = source.slice(source.indexOf('  build:'), source.indexOf('  deploy:'));
    const deploy = source.slice(source.indexOf('  deploy:'));
    const mainRefGuard = /^\s+if:\s*github\.ref\s*==\s*'refs\/heads\/main'\s*$/m;

    expect(source).toMatch(/^\s*workflow_dispatch:\s*$/m);
    expect(build).toMatch(mainRefGuard);
    expect(deploy).toMatch(mainRefGuard);
    expect(source).toContain('group: pages-${{ github.ref }}');
    expect(source).not.toMatch(/^\s+group:\s*pages\s*$/m);
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
