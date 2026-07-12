import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function workflow(name: string) {
  return readFileSync(resolve(repositoryRoot, '.github/workflows', name), 'utf8');
}

describe('GitHub workflow security policy', () => {
  it('pins every external action to an immutable full commit SHA', () => {
    const source = `${workflow('verify.yml')}\n${workflow('deploy-pages.yml')}`;
    const references = [...source.matchAll(/^\s*uses:\s*([^\s#]+)(?:\s+#.*)?$/gm)]
      .map(match => match[1]);
    expect(references.length).toBeGreaterThan(0);
    for (const reference of references) {
      expect(reference).toMatch(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+@[0-9a-f]{40}$/);
    }
  });

  it('keeps Pages deployment authority out of the dependency-running build job', () => {
    const source = workflow('deploy-pages.yml');
    const build = source.slice(source.indexOf('  build:'), source.indexOf('  deploy:'));
    const deploy = source.slice(source.indexOf('  deploy:'));
    expect(build).not.toMatch(/^\s+pages:\s*write\s*$/m);
    expect(build).not.toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(deploy).toMatch(/^\s+pages:\s*write\s*$/m);
    expect(deploy).toMatch(/^\s+id-token:\s*write\s*$/m);
    expect(source).not.toContain('enablement: true');
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
    const source = `${workflow('verify.yml')}\n${workflow('deploy-pages.yml')}`;
    const checkoutCount = (source.match(/actions\/checkout@/g) ?? []).length;
    const disabledCredentialCount = (source.match(/persist-credentials:\s*false/g) ?? []).length;
    expect(disabledCredentialCount).toBe(checkoutCount);
    expect(source).toContain('pnpm --dir services/auth-bridge audit --audit-level high');
    expect(source).toContain('pnpm --dir spacetimedb audit --audit-level high');
    expect(source).toContain('npm audit signatures');
  });

  it('runs on the stacked security PR and ignores every Wrangler secret-file variant', () => {
    const source = workflow('verify.yml');
    expect(source).toContain('branches: [main, feat/spacetimedb-basic-connection]');
    const ignored = execFileSync(
      'git',
      ['check-ignore', 'services/auth-bridge/.dev.vars.production'],
      { cwd: repositoryRoot, encoding: 'utf8' }
    );
    expect(ignored.trim()).toBe('services/auth-bridge/.dev.vars.production');
  });
});
