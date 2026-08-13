// @vitest-environment node

import { readdirSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import {
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
  AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE,
  authBridgeNotificationPreparedDeployClosureTestSeams,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure.mjs';
import {
  deriveAuthBridgeNotificationPreparedDeployClosurePaths,
} from '../scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs';

const seams = authBridgeNotificationPreparedDeployClosureTestSeams!;
const RAW = 'raw-file-sha256-v1';
const PROJECTED = 'reviewed-release-transition-projection-sha256-v1';

const CANARY_RAW_RUNTIME_PATHS = Object.freeze([
  'owner-canary/index.html',
  'scripts/auth-bridge-config-attestation.d.mts',
  'scripts/auth-bridge-config-attestation.mjs',
  'scripts/notification-pages-live-hermes-authority.d.mts',
  'scripts/notification-pages-live-hermes-authority.mjs',
  'scripts/notification-pages-live-receipt.d.mts',
  'scripts/notification-pages-live-receipt.mjs',
  'scripts/production-admin-token-budget.d.mts',
  'scripts/production-admin-token-budget.mjs',
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-baseline-reconciliation.d.mts',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-core.ts',
  'scripts/production-player-canary-deploy-authority.d.mts',
  'scripts/production-player-canary-deploy-authority.mjs',
  'scripts/production-player-canary-evidence-authority.d.mts',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-owner-approval.d.mts',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/production-player-canary-receipt.d.mts',
  'scripts/production-player-canary-receipt.mjs',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/verify-production-dist-exclusions.mjs',
  'spacetimedb/src/index.ts',
  'spacetimedb/src/productionPlayerCanaryBaseline.ts',
  'spacetimedb/src/productionPlayerCanaryBaselinePolicy.ts',
  'spacetimedb/src/productionPlayerCanaryEvidence.ts',
  'spacetimedb/src/reducers/castleWorkers.ts',
  'spacetimedb/src/schema.ts',
  'src/owner-canary/OwnerCanaryApp.tsx',
  'src/owner-canary/main.tsx',
  'src/owner-canary/ownerCanary.css',
  'src/owner-canary/ownerCanaryAuthClient.ts',
  'src/owner-canary/ownerCanaryController.ts',
  'src/owner-canary/ownerCanaryEvidence.ts',
  'src/owner-canary/ownerCanaryProductionRuntime.ts',
  'src/owner-canary/ownerCanaryRuntime.ts',
  'src/spacetime/module_bindings/admin_capture_production_player_canary_baseline_v_1_reducer.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_baseline_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_evidence_v_1_procedure.ts',
  'src/spacetime/module_bindings/index.ts',
  'src/spacetime/module_bindings/types.ts',
  'src/spacetime/module_bindings/types/procedures.ts',
  'src/spacetime/module_bindings/types/reducers.ts',
  'vite.config.ts',
  ...readdirSync('services/auth-bridge/src')
    .filter(name => name.endsWith('.ts'))
    .map(name => `services/auth-bridge/src/${name}`),
].sort());

function manifestWithProfiles(
  profileForPath: (path: string) => string =
    path => seams.expectedMemberDigestProfile(path),
) {
  return {
    schemaVersion: 2,
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE,
    members: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS.map(
      path => ({
        path,
        digestProfile: profileForPath(path),
        sha256: '0'.repeat(64),
      }),
    ),
  };
}

describe('production player canary prepared-deploy closure', () => {
  it('derives every canary runtime member into the exact raw closure', () => {
    const derived = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: process.cwd(),
    });
    expect(derived).toEqual(
      AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
    );
    expect(new Set(CANARY_RAW_RUNTIME_PATHS).size)
      .toBe(CANARY_RAW_RUNTIME_PATHS.length);
    for (const path of CANARY_RAW_RUNTIME_PATHS) {
      expect(derived, path).toContain(path);
      expect(seams.expectedMemberDigestProfile(path), path).toBe(RAW);
    }
  }, 30_000);

  it('rejects projection substitution for every canary raw runtime member', () => {
    const canonical = Buffer.from(
      `${JSON.stringify(manifestWithProfiles(), null, 2)}\n`,
      'utf8',
    );
    expect(() => seams.parseManifest(canonical)).not.toThrow();

    for (const hostilePath of CANARY_RAW_RUNTIME_PATHS) {
      const hostile = manifestWithProfiles(path =>
        path === hostilePath
          ? PROJECTED
          : seams.expectedMemberDigestProfile(path));
      const bytes = Buffer.from(`${JSON.stringify(hostile, null, 2)}\n`, 'utf8');
      try {
        expect(() => seams.parseManifest(bytes), hostilePath).toThrow(
          'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID',
        );
      } finally { bytes.fill(0); }
    }
    canonical.fill(0);
  });
});
