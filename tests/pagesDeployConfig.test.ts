import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { validatePagesDeploymentConfiguration } from '../scripts/validate-pages-deploy-config.mjs';

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
    VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false',
    VITE_WARPKEEP_AUTH_BRIDGE_URL: '',
    VITE_WARPKEEP_OIDC_ISSUER: '',
    VITE_WARPKEEP_OIDC_AUDIENCE: 'warpkeep-spacetimedb',
    VITE_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    VITE_SPACETIMEDB_DATABASE: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
    ...overrides
  };
}

function validateCli(overrides?: Record<string, string>) {
  return spawnSync(process.execPath, ['scripts/validate-pages-deploy-config.mjs'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: deploymentEnvironment(overrides)
  });
}

function validate(overrides?: Record<string, string>) {
  try {
    const stdout = validatePagesDeploymentConfiguration(
      deploymentEnvironment(overrides),
      { entryAgreementReleaseStatus: 'production-approved' },
    );
    return { status: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      status: 1,
      stdout: '',
      stderr: error instanceof Error ? error.message : String(error),
    };
  }
}

describe('Pages deployment configuration validation', () => {
  it('blocks the review-only agreement from the real deployment entry point', () => {
    const result = validateCli();
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('entry agreement is review-only');
    expect(result.stderr).toContain('coordinated Pages and SpacetimeDB rollout approval');
  });

  it('accepts the root-base canonical build with shared alpha deliberately disabled', () => {
    const result = validate();
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('shared alpha disabled');
  });

  it('pins public database coordinates even while shared alpha is disabled', () => {
    const result = validate({
      VITE_SPACETIMEDB_DATABASE: 'warpkeep-89e4u'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e');
  });

  it('requires an exact fail-closed admission-notification presentation gate', () => {
    expect(validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false' }).status).toBe(0);
    expect(validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true' }).status).toBe(0);

    const ambiguous = validate({
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'TRUE'
    });
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toContain(
      'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED must be exactly true or false.'
    );
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

    const matchingLookalike = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://lookalike.example',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://lookalike.example'
    });
    expect(matchingLookalike.status).not.toBe(0);
    expect(matchingLookalike.stderr).toContain('https://auth.warpkeep.com');
  });

  it('pins the active Maincloud database rather than accepting a lookalike name', () => {
    const result = validate({
      VITE_WARPKEEP_SHARED_ALPHA_ENABLED: 'true',
      VITE_WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      VITE_WARPKEEP_OIDC_ISSUER: 'https://auth.warpkeep.com',
      VITE_SPACETIMEDB_DATABASE: 'lookalike-database'
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e');
  });
});
