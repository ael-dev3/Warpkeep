import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

const FULL_SHA = 'abcdef0123456789abcdef0123456789abcdef01';

function deploymentEnvironment(overrides: Record<string, string> = {}) {
  return {
    ...process.env,
    DEPLOY_BASE: '/',
    VITE_WARPKEEP_RELEASE_CHANNEL: 'alpha',
    VITE_WARPKEEP_BUILD_SHA: FULL_SHA,
    VITE_WARPKEEP_REPOSITORY_URL: 'https://github.com/ael-dev3/Warpkeep',
    VITE_WARPKEEP_CANONICAL_ORIGIN: 'https://warpkeep.com',
    VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'false',
    VITE_WARPKEEP_AUTH_BRIDGE_URL: '',
    VITE_WARPKEEP_OIDC_ISSUER: '',
    VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
    ...overrides
  };
}

function validate(overrides?: Record<string, string>) {
  return spawnSync(process.execPath, ['scripts/validate-pages-deploy-config.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: deploymentEnvironment(overrides)
  });
}

describe('Pages deployment configuration validation', () => {
  it('accepts the root-base canonical build with shared alpha deliberately disabled', () => {
    const result = validate();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shared alpha disabled');
  });

  it('requires exact active bridge/issuer configuration and rejects unsafe activation', () => {
    const active = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com'
    });
    expect(active.status).toBe(0);
    expect(active.stdout).toContain('shared alpha enabled');

    const unsafe = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.invalid'
    });
    expect(unsafe.status).not.toBe(0);
    expect(unsafe.stderr).toContain('stable public HTTPS origin');
  });
});
