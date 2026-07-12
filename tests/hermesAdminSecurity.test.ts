import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
const TEST_SECRET = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);

function runHermes(
  args: string[],
  overrides: Record<string, string | undefined> = {}
) {
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
    WARPKEEP_ADMIN_TOKEN_SECRET: TEST_SECRET,
    ...overrides
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return spawnSync(process.execPath, [tsxCli, 'scripts/hermes-admin.ts', ...args], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env,
    timeout: 5_000
  });
}

describe('Hermes credential destination policy', () => {
  it.each([
    ['bridge', { WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example' }],
    ['SpacetimeDB origin', { WARPKEEP_SPACETIMEDB_URI: 'https://lookalike.example' }],
    ['database', { WARPKEEP_SPACETIMEDB_DATABASE: 'lookalike-db' }]
  ])('rejects a non-canonical %s before network use', (_label, overrides) => {
    const result = runHermes(['inspect-alpha', '--json'], overrides);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('require the canonical Warpkeep production targets');
    expect(`${result.stdout}${result.stderr}`).not.toContain(TEST_SECRET);
  });

  it('allows custom targets only for a secret-free dry run', () => {
    const result = runHermes(
      ['allow-fid', '12345', 'test-only-note', '--dry-run', '--confirm'],
      {
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.example',
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
        WARPKEEP_AUTH_BRIDGE_URL: undefined,
        WARPKEEP_ADMIN_TOKEN_SECRET: undefined
      }
    );
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('"dryRun":true');
    expect(result.stderr).toBe('');
  });
});
