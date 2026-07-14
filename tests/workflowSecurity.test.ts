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
      'actions/upload-pages-artifact@7b1f4a764d45c48632c6b24a0339c27f5614fb0b',
    );
    expect(source).not.toContain(
      'actions/upload-pages-artifact@56afc609e74202658d3ffba0e8f6dda462b719fa',
    );
    expect(source).not.toContain('actions/upload-artifact@');
    expect(source).toContain('path: ./dist');
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
    expect(source).toContain('pnpm --dir services/auth-bridge audit --audit-level high');
    expect(source).toContain('pnpm --dir spacetimedb audit --audit-level high');
    expect(source).toContain('npm audit signatures');
  });

  it('runs on both stacked security and activation PR bases and ignores every Wrangler secret-file variant', () => {
    const source = workflow('verify.yml');
    expect(source).toContain(
      'branches: [main, feat/spacetimedb-basic-connection, security/alpha-0.2-preflight, ops/alpha-0.2-live-activation]',
    );
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
    expect(source).toContain(
      'branches: [main, feat/spacetimedb-basic-connection, security/alpha-0.2-preflight, ops/alpha-0.2-live-activation]',
    );
  });
});
