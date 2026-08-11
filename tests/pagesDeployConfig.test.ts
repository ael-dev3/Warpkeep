import { spawnSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { validatePagesDeploymentConfiguration } from '../scripts/validate-pages-deploy-config.mjs';
import {
  verifyGreaterRealmReleaseGateEnvelope,
  verifyGreaterRealmReleaseGateState,
} from '../scripts/verify-greater-realm-release-gates.mjs';

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
    const premature = validate({ VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'true' });
    expect(premature.status).not.toBe(0);
    expect(premature.stderr).toContain('must remain false');

    const ambiguous = validate({
      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'TRUE'
    });
    expect(ambiguous.status).not.toBe(0);
    expect(ambiguous.stderr).toContain(
      'VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED must be exactly true or false.'
    );
  });

  it('attests that the current tree is one exact safe phase with distinct verifiers', () => {
    expect(verifyGreaterRealmReleaseGateState()).toMatch(
      /^Greater Realm release phase=(?:closed-review|pre-generation|candidate-approved-inert-append|import-only|activation-only|activation-client|activation-client-and-notifications); legacy=100 and v17=600 verifiers are distinct\.$/u,
    );
  });

  it('accepts only the exact safe release phase state machine', () => {
    const fields = [
      'importMutationsCompiled',
      'activationMutationsCompiled',
      'clientPresentationAllowed',
      'serverPresentationAllowed',
      'entryAgreementApproved',
      'additivePublishApproved',
      'importForwardFixApproved',
      'activationForwardFixApproved',
      'clientActivationApproved',
      'admissionNotificationsApproved',
      'pagesNotificationsEnabled',
    ] as const;
    const accepted = new Set<string>();
    let rejected = 0;
    for (const entryAgreementReleaseStatus of [
      'review-only-rollout-blocked', 'production-approved',
    ] as const) {
      for (let mask = 0; mask < 2 ** fields.length; mask += 1) {
        const envelope = Object.fromEntries([
          ['entryAgreementReleaseStatus', entryAgreementReleaseStatus],
          ...fields.map((field, index) => [field, (mask & (1 << index)) !== 0]),
        ]);
        try {
          accepted.add(verifyGreaterRealmReleaseGateEnvelope(envelope));
        } catch {
          rejected += 1;
        }
      }
    }
    expect([...accepted].sort()).toEqual([
      'activation-client',
      'activation-client-and-notifications',
      'activation-only',
      'candidate-approved-inert-append',
      'closed-review',
      'import-only',
      'pre-generation',
    ]);
    expect(rejected).toBe(2 ** (fields.length + 1) - accepted.size);
    expect(() => verifyGreaterRealmReleaseGateEnvelope({
      entryAgreementReleaseStatus: 'production-approved',
      ...Object.fromEntries(fields.map(field => [field, false])),
      activationMutationsCompiled: true,
      entryAgreementApproved: true,
      additivePublishApproved: true,
      activationForwardFixApproved: true,
      admissionNotificationsApproved: true,
      pagesNotificationsEnabled: true,
    })).toThrow(/PHASE_INVALID/);
    expect(() => verifyGreaterRealmReleaseGateEnvelope({
      entryAgreementReleaseStatus: 'production-approved',
      ...Object.fromEntries(fields.map(field => [field, false])),
      importMutationsCompiled: true,
      activationMutationsCompiled: true,
    })).toThrow(/ENVELOPE_INVALID/);
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
