// @vitest-environment node

import { readFileSync, readdirSync } from 'node:fs';

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
const PROTECTED_SECURITY_SWAP_PATHS = Object.freeze([
  'spacetimedb/src/auth.ts',
  'spacetimedb/src/castleWorkerAuthority.ts',
  'spacetimedb/src/greaterRealmWorkerAuthority.ts',
  'scripts/production-player-canary-activation-launcher.mjs',
  'scripts/production-player-canary-browser-launcher.mjs',
  'scripts/production-player-canary-release-binding.mjs',
]);
const RETAINED_TYPE_ONLY_DECLARATION_PATHS = Object.freeze([
  'scripts/production-player-canary-activation-launcher.d.mts',
  'scripts/production-player-canary-browser-launcher.d.mts',
  'scripts/production-player-canary-release-binding.d.mts',
]);

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
  'scripts/production-player-canary-activation-launcher.mjs',
  'scripts/production-player-canary-admin-transport.ts',
  'scripts/production-player-canary-approval-reconciliation.d.mts',
  'scripts/production-player-canary-approval-reconciliation.mjs',
  'scripts/production-player-canary-baseline-reconciliation.d.mts',
  'scripts/production-player-canary-baseline-reconciliation.mjs',
  'scripts/production-player-canary-browser-launcher.mjs',
  'scripts/production-player-canary-command-authority.d.mts',
  'scripts/production-player-canary-command-authority.mjs',
  'scripts/production-player-canary-core.ts',
  'scripts/production-player-canary-deploy-authority.d.mts',
  'scripts/production-player-canary-deploy-authority.mjs',
  'scripts/production-player-canary-evidence-authority.d.mts',
  'scripts/production-player-canary-evidence-authority.mjs',
  'scripts/production-player-canary-operator-journal.d.mts',
  'scripts/production-player-canary-operator-journal.mjs',
  'scripts/production-player-canary-operator.d.mts',
  'scripts/production-player-canary-operator.mjs',
  'scripts/production-player-canary-owner-approval.d.mts',
  'scripts/production-player-canary-owner-approval.mjs',
  'scripts/production-player-canary-receipt.d.mts',
  'scripts/production-player-canary-receipt.mjs',
  'scripts/profiles/founder-admission-plan.ts',
  'scripts/verify-production-dist-exclusions.mjs',
  'spacetimedb/src/index.ts',
  'spacetimedb/src/auth.ts',
  'spacetimedb/src/castleWorkerAuthority.ts',
  'spacetimedb/src/greaterRealmWorkerAuthority.ts',
  'spacetimedb/src/productionPlayerCanaryApproval.ts',
  'spacetimedb/src/productionPlayerCanaryApprovalPolicy.ts',
  'spacetimedb/src/productionPlayerCanaryBaseline.ts',
  'spacetimedb/src/productionPlayerCanaryBaselinePolicy.ts',
  'spacetimedb/src/productionPlayerCanaryEvidence.ts',
  'spacetimedb/src/productionPlayerCanaryRecovery.ts',
  'spacetimedb/src/productionPlayerCanaryRecoveryPolicy.ts',
  'spacetimedb/src/productionPlayerCanaryRoutePolicy.ts',
  'spacetimedb/src/reducers/castleWorkers.ts',
  'spacetimedb/src/schema.ts',
  'src/owner-canary/OwnerCanaryApp.tsx',
  'src/owner-canary/main.tsx',
  'src/owner-canary/ownerCanary.css',
  'src/owner-canary/ownerCanaryAuthClient.ts',
  'src/owner-canary/ownerCanaryController.ts',
  'src/owner-canary/ownerCanaryEvidence.ts',
  'src/owner-canary/ownerCanaryEvidenceRuntime.ts',
  'src/owner-canary/ownerCanaryProductionComposition.ts',
  'src/owner-canary/ownerCanaryProductionConfig.ts',
  'src/owner-canary/ownerCanaryProductionRuntime.ts',
  'src/owner-canary/ownerCanaryRuntime.ts',
  'src/owner-canary/ownerCanaryRuntimePlan.ts',
  'src/spacetime/module_bindings/admin_capture_production_player_canary_baseline_v_1_reducer.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_approval_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_baseline_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_evidence_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_get_production_player_canary_recovery_status_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_plan_production_player_canary_routes_v_1_procedure.ts',
  'src/spacetime/module_bindings/admin_register_production_player_canary_approval_v_1_reducer.ts',
  'src/spacetime/module_bindings/get_production_player_canary_runtime_v_1_procedure.ts',
  'src/spacetime/module_bindings/recall_production_player_canary_worker_v_1_reducer.ts',
  'src/spacetime/module_bindings/index.ts',
  'src/spacetime/module_bindings/types.ts',
  'src/spacetime/module_bindings/types/procedures.ts',
  'src/spacetime/module_bindings/types/reducers.ts',
  'src/spacetime/playerModuleBindings.ts',
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

function closureRejectsManifestBytes(body: Buffer): boolean {
  try {
    return !seams.manifestMemberSetMatchesExpected(seams.parseManifest(body));
  } catch {
    return true;
  }
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

  it('protects executable gameplay authorities while excluding only retained type declarations', () => {
    const derived = deriveAuthBridgeNotificationPreparedDeployClosurePaths({
      repositoryRoot: process.cwd(),
    });
    for (const protectedPath of PROTECTED_SECURITY_SWAP_PATHS) {
      expect(derived.filter(path => path === protectedPath))
        .toEqual([protectedPath]);
    }
    for (const declarationPath of RETAINED_TYPE_ONLY_DECLARATION_PATHS) {
      const declaration = readFileSync(declarationPath, 'utf8');
      expect(declaration.length).toBeGreaterThan(0);
      expect(declaration).toMatch(/\b(?:declare|interface|type)\b/u);
      expect(derived).not.toContain(declarationPath);
      for (const runtimePath of derived.filter(path => path.endsWith('.mjs'))) {
        expect(readFileSync(runtimePath, 'utf8'), `${runtimePath} imports ${declarationPath}`)
          .not.toContain(declarationPath);
      }
    }

    for (const protectedPath of PROTECTED_SECURITY_SWAP_PATHS) {
      const removed = manifestWithProfiles();
      removed.members = removed.members.filter(member => member.path !== protectedPath);
      const removedBytes = Buffer.from(`${JSON.stringify(removed, null, 2)}\n`, 'utf8');
      try {
        expect(closureRejectsManifestBytes(removedBytes), `removed ${protectedPath}`)
          .toBe(true);
      } finally { removedBytes.fill(0); }

      const substituted = manifestWithProfiles();
      const index = substituted.members.findIndex(member => member.path === protectedPath);
      expect(index).toBeGreaterThanOrEqual(0);
      substituted.members[index] = {
        ...substituted.members[index]!,
        path: RETAINED_TYPE_ONLY_DECLARATION_PATHS[0]!,
      };
      const substitutedBytes = Buffer.from(
        `${JSON.stringify(substituted, null, 2)}\n`,
        'utf8',
      );
      try {
        expect(
          closureRejectsManifestBytes(substitutedBytes),
          `substituted ${protectedPath}`,
        ).toBe(true);
      } finally { substitutedBytes.fill(0); }
    }
  });
});
