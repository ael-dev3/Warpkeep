import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync,
} from 'node:fs';
import { registerHooks } from 'node:module';
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE =
  'warpkeep-auth-bridge-notification-prepared-deploy-closure-v1';
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH =
  'scripts/auth-bridge-notification-prepared-deploy-closure-v1.json';

const MEMBER_PATH = /^(?:docs\/operations\/(?:genesis-001-policy-observation-launch-envelope|greater-realm-production-launch-envelope)\.sh\.txt|(?:owner-canary\/)?index\.html|package(?:-lock)?\.json|public\/\.well-known\/farcaster\.json|vite\.config\.ts|spacetimedb\/(?:package\.json|pnpm-(?:lock|workspace)\.yaml|(?:src|genesis002|ptr\/generated-bindings)\/[A-Za-z0-9._/-]+)|(?:\.github\/workflows|config\/releases|scripts|services\/auth-bridge|src)\/[A-Za-z0-9._/-]+)$/u;
// This is the exact generated client/operator ABI reached from shipped roots.
// PTR module source, private table bindings, build output, and config stay out.
const PTR_GENERATED_BINDING_MEMBER_PATHS = new Set([
  'spacetimedb/ptr/generated-bindings/admin_begin_greater_realm_verification_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_finalize_greater_realm_release_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_get_greater_realm_status_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_chunk_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_components_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_regions_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_provision_ptr_owner_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_stage_greater_realm_release_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_suspend_ptr_owner_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/admin_verify_greater_realm_batch_v_1_reducer.ts',
  'spacetimedb/ptr/generated-bindings/get_ptr_owner_status_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_bootstrap_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_chunk_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_resource_locations_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/get_realm_atlas_window_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/index.ts',
  'spacetimedb/ptr/generated-bindings/plan_realm_route_v_1_procedure.ts',
  'spacetimedb/ptr/generated-bindings/types.ts',
]);
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const MAX_MANIFEST_BYTES = 256 * 1_024;
const MAX_MEMBER_BYTES = 4 * 1_024 * 1_024;
const MAX_MEMBERS = 997;
const MANIFEST_KEYS = Object.freeze(['schemaVersion', 'profile', 'members']);
const MEMBER_KEYS = Object.freeze(['path', 'digestProfile', 'sha256']);
const RAW_FILE_DIGEST_PROFILE = 'raw-file-sha256-v1';
const BOOTSTRAP_PIN_DIGEST_PROFILE =
  'bootstrap-pin-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE =
  'reviewed-release-transition-projection-sha256-v1';
const REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE =
  'reviewed-release-transition-plus-bootstrap-pin-projection-sha256-v1';
const authenticatedSourceClosureAuthorities = new WeakSet();
const authenticatedSourceClosureRawMemberDigests = new WeakMap();
let activeAttestedModuleLoad;
let attestedModuleLoadHookRegistered = false;
const BOOTSTRAP_PIN_CANONICAL_VALUE = '0'.repeat(64);
const BOOTSTRAP_PIN_BINDINGS = Object.freeze([
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_SOURCE_CLOSURE_MANIFEST_SHA256',
    path: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_VERIFIER_SHA256',
    path: 'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
  }),
  Object.freeze({
    name: 'WARPKEEP_PREPARED_INSTALLED_TOOLCHAIN_MANIFEST_SHA256',
    path:
      'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
  }),
  Object.freeze({
    name: 'WARPKEEP_NOTIFICATION_PAGES_PROTECTED_DEPLOY_LAUNCHER_SHA256',
    path: 'scripts/notification-pages-private-deploy-launcher.mjs',
  }),
]);
const BOOTSTRAP_PINNED_WORKFLOWS = new Map([
  ['.github/workflows/notification-bridge-b0.yml', Object.freeze({
    indentation: '      ',
    bindings: Object.freeze(BOOTSTRAP_PIN_BINDINGS.slice(0, 4)),
  })],
  ['.github/workflows/notification-bridge-prepared.yml', Object.freeze({
    indentation: '      ',
    bindings: Object.freeze(BOOTSTRAP_PIN_BINDINGS.slice(0, 4)),
  })],
  ['.github/workflows/deploy-pages.yml', Object.freeze({
    indentation: '  ',
    bindings: BOOTSTRAP_PIN_BINDINGS,
  })],
]);

const REVIEWED_RELEASE_SOURCE_PATHS = Object.freeze({
  package: 'package.json',
  packageLock: 'package-lock.json',
  farcasterContract: 'scripts/farcaster-miniapp-contract.mjs',
  farcasterManifest: 'public/.well-known/farcaster.json',
  modulePolicy: 'spacetimedb/src/greaterRealmV17Policy.ts',
  publisher: 'scripts/greater-realm-production-publisher-core.ts',
  downstream: 'scripts/greater-realm-downstream-release-policy.ts',
  clientPresentation: 'src/spacetime/greaterRealmProviderBridge.ts',
  serverPresentation: 'src/greater-realm/greaterRealmTransport.ts',
  pages: '.github/workflows/deploy-pages.yml',
  hermes: 'scripts/hermes-admin.ts',
  preparedBinding:
    'scripts/auth-bridge-notification-prepared-release-binding.mjs',
  privateBinding: 'scripts/notification-pages-private-release-binding.mjs',
  liveRootBinding: 'scripts/notification-pages-live-release-binding.mjs',
  productionPlayerCanaryBinding:
    'scripts/production-player-canary-release-binding.mjs',
  sealedLaunchBinding: 'config/releases/0.4.0-sealed-launch.json',
});

const INERT_CLIENT_RELEASE_VERSION = '0.3.43';
const ACTIVE_CLIENT_RELEASE_VERSION = '0.4.0';
const INERT_FARCASTER_DESCRIPTION =
  'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';
const INERT_CLIENT_RELEASE_STATE = 'I';
const ACTIVE_CLIENT_RELEASE_STATE = 'A';

const REVIEWED_RELEASE_SOURCE_PATH_SET =
  new Set(Object.values(REVIEWED_RELEASE_SOURCE_PATHS));

const REVIEWED_RELEASE_PHASE_IDENTITIES = new Map([
  // Production-approved pre-generation.
  ['FF|FFFF|FF|FF|0|0|NNNN|N', INERT_CLIENT_RELEASE_STATE],
  // Candidate-approved inert append.
  ['FF|TTFF|FF|FF|0|0|NNNN|N', INERT_CLIENT_RELEASE_STATE],
  // Import-only forward fix.
  ['TF|TTTF|FF|FF|0|0|NNNN|N', INERT_CLIENT_RELEASE_STATE],
  // Activation-only forward fix.
  ['FT|TTFT|FF|FF|0|0|NNNN|N', INERT_CLIENT_RELEASE_STATE],
  // Generation-zero notification Pages activation remains world-client inert.
  ['FT|TTFT|FT|FF|1|0|PPNN|N', INERT_CLIENT_RELEASE_STATE],
  // Durable Pages root installed while Hermes and world presentation stay inert.
  ['FT|TTFT|FT|FF|1|0|NNPN|N', INERT_CLIENT_RELEASE_STATE],
  // Final notification delivery approval still retains the 0.3.43 world client.
  ['FT|TTFT|FT|FF|1|1|NNPN|N', INERT_CLIENT_RELEASE_STATE],
  // Owner-approved 0.4.0 shell: both legacy Greater Realm presentation lanes,
  // admissions, and notifications remain off while exact sealed receipts bind
  // the distinct, zero-population Genesis 002 database.
  ['FF|FFFF|FF|FF|0|0|NNNN|P', ACTIVE_CLIENT_RELEASE_STATE],
]);

function expectedMemberDigestProfile(memberPath) {
  if (
    REVIEWED_RELEASE_SOURCE_PATH_SET.has(memberPath)
    && BOOTSTRAP_PINNED_WORKFLOWS.has(memberPath)
  ) {
    return REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE;
  }
  if (REVIEWED_RELEASE_SOURCE_PATH_SET.has(memberPath)) {
    return REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE;
  }
  if (BOOTSTRAP_PINNED_WORKFLOWS.has(memberPath)) {
    return BOOTSTRAP_PIN_DIGEST_PROFILE;
  }
  return RAW_FILE_DIGEST_PROFILE;
}

// This checked-in path namespace is the builtins-only runtime completeness
// authority. The policy-only TypeScript graph derivation must equal it exactly.
export const AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS =
  Object.freeze([
    '.github/workflows/deploy-pages.yml',
    '.github/workflows/notification-bridge-b0.yml',
    '.github/workflows/notification-bridge-prepared.yml',
    '.github/workflows/verify.yml',
    'config/releases/0.4.0-sealed-launch.json',
    'docs/operations/genesis-001-policy-observation-launch-envelope.sh.txt',
    'docs/operations/greater-realm-production-launch-envelope.sh.txt',
    'index.html',
    'owner-canary/index.html',
    'package-lock.json',
    'package.json',
    'public/.well-known/farcaster.json',
    'scripts/access-requests/reset-plan.ts',
    'scripts/admission-notifications/recovery-plan.ts',
    'scripts/alpha-activation-controls.ts',
    'scripts/alpha-v10-activation-controls.ts',
    'scripts/atlas/greater-realm-atmosphere.ts',
    'scripts/atlas/greater-realm-attempt-checkpoint.ts',
    'scripts/atlas/greater-realm-biomes.ts',
    'scripts/atlas/greater-realm-candidate-generator.ts',
    'scripts/atlas/greater-realm-candidate-package.ts',
    'scripts/atlas/greater-realm-candidate-rejection.ts',
    'scripts/atlas/greater-realm-castle-distribution.ts',
    'scripts/atlas/greater-realm-chunk-benchmark.ts',
    'scripts/atlas/greater-realm-cli.ts',
    'scripts/atlas/greater-realm-composition.ts',
    'scripts/atlas/greater-realm-contracts.ts',
    'scripts/atlas/greater-realm-geology-authority.ts',
    'scripts/atlas/greater-realm-geomorphology.ts',
    'scripts/atlas/greater-realm-git.ts',
    'scripts/atlas/greater-realm-hydrology-authority.ts',
    'scripts/atlas/greater-realm-legacy-lowlands.ts',
    'scripts/atlas/greater-realm-living-world.ts',
    'scripts/atlas/greater-realm-pending-owner-report.ts',
    'scripts/atlas/greater-realm-private-authority-validation.ts',
    'scripts/atlas/greater-realm-private-markers.d.mts',
    'scripts/atlas/greater-realm-private-markers.mjs',
    'scripts/atlas/greater-realm-private-seed.ts',
    'scripts/atlas/greater-realm-private-workspace.ts',
    'scripts/atlas/greater-realm-relief-structure.ts',
    'scripts/atlas/greater-realm-runtime-release-test-fixture.ts',
    'scripts/atlas/greater-realm-runtime-release.ts',
    'scripts/atlas/greater-realm-sanitized-review.ts',
    'scripts/atlas/greater-realm-strategic-audits.ts',
    'scripts/atlas/greater-realm-terraces.ts',
    'scripts/atlas/greater-realm-terrain.ts',
    'scripts/atlas/greater-realm-toolchain-bootstrap.d.mts',
    'scripts/atlas/greater-realm-toolchain-bootstrap.mjs',
    'scripts/atlas/greater-realm-topographic-qa.ts',
    'scripts/atlas/greater-realm-topography-patch-support.ts',
    'scripts/atlas/greater-realm-topography.ts',
    'scripts/auth-bridge-config-attestation.d.mts',
    'scripts/auth-bridge-config-attestation.mjs',
    'scripts/auth-bridge-notification-b0-cloudflare-runtime.d.mts',
    'scripts/auth-bridge-notification-b0-cloudflare-runtime.mjs',
    'scripts/auth-bridge-notification-b0-deploy-adapter.d.mts',
    'scripts/auth-bridge-notification-b0-deploy-adapter.mjs',
    'scripts/auth-bridge-notification-b0-deploy-journal.d.mts',
    'scripts/auth-bridge-notification-b0-deploy-journal.mjs',
    'scripts/auth-bridge-notification-b0-deploy.d.mts',
    'scripts/auth-bridge-notification-b0-deploy.mjs',
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.d.mts',
    'scripts/auth-bridge-notification-prepared-cloudflare-runtime.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-adapter.d.mts',
    'scripts/auth-bridge-notification-prepared-deploy-adapter.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-closure-policy.d.mts',
    'scripts/auth-bridge-notification-prepared-deploy-closure-policy.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-closure.d.mts',
    'scripts/auth-bridge-notification-prepared-deploy-closure.mjs',
    'scripts/auth-bridge-notification-prepared-deploy-journal.d.mts',
    'scripts/auth-bridge-notification-prepared-deploy-journal.mjs',
    'scripts/auth-bridge-notification-prepared-deploy.d.mts',
    'scripts/auth-bridge-notification-prepared-deploy.mjs',
    'scripts/auth-bridge-notification-prepared-installed-toolchain-darwin-arm64-v1.json',
    'scripts/auth-bridge-notification-prepared-installed-toolchain.d.mts',
    'scripts/auth-bridge-notification-prepared-installed-toolchain.mjs',
    'scripts/auth-bridge-notification-prepared-receipt.d.mts',
    'scripts/auth-bridge-notification-prepared-receipt.mjs',
    'scripts/auth-bridge-notification-prepared-release-binding.d.mts',
    'scripts/auth-bridge-notification-prepared-release-binding.mjs',
    'scripts/daily-marks-operator.ts',
    'scripts/entry-agreement-policy.d.mts',
    'scripts/entry-agreement-policy.mjs',
    'scripts/farcaster-miniapp-contract.mjs',
    'scripts/founder-admission-authority.ts',
    'scripts/generate-0.4.0-sealed-launch-activation.d.mts',
    'scripts/generate-0.4.0-sealed-launch-activation.mjs',
    'scripts/genesis001-admission-monitor-current-state.d.mts',
    'scripts/genesis001-admission-monitor-current-state.mjs',
    'scripts/genesis001-admission-monitor-suspension.ts',
    'scripts/genesis001-census-privacy-safe-receipt.d.mts',
    'scripts/genesis001-census-privacy-safe-receipt.mjs',
    'scripts/genesis001-frozen-materializer.d.mts',
    'scripts/genesis001-frozen-materializer.mjs',
    'scripts/genesis001-frozen-publisher-core.ts',
    'scripts/genesis001-frozen-publisher-runtime.ts',
    'scripts/genesis001-frozen-publisher.ts',
    'scripts/genesis001-policy-observation-receipt.d.mts',
    'scripts/genesis001-policy-observation-receipt.mjs',
    'scripts/genesis001-sealed-launch-adoption.d.mts',
    'scripts/genesis001-sealed-launch-adoption.mjs',
    'scripts/genesis002-activation-receipts.d.mts',
    'scripts/genesis002-activation-receipts.mjs',
    'scripts/genesis002-private-loopback-verifier.ts',
    'scripts/genesis002-production-import-core.ts',
    'scripts/genesis002-production-import-operator.ts',
    'scripts/genesis002-production-publisher-cli.ts',
    'scripts/genesis002-production-publisher.d.mts',
    'scripts/genesis002-production-publisher.mjs',
    'scripts/genesis002-production-transport.ts',
    'scripts/genesis002-sealed-live-receipt.d.mts',
    'scripts/genesis002-sealed-live-receipt.mjs',
    'scripts/genesis002_module_bindings/accept_alpha_terms_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/access_request_get_status_v_1_procedure.ts',
    'scripts/genesis002_module_bindings/access_request_submit_v_1_procedure.ts',
    'scripts/genesis002_module_bindings/access_request_v_1_table.ts',
    'scripts/genesis002_module_bindings/admin_admit_founder_for_access_request_v_2_reducer.ts',
    'scripts/genesis002_module_bindings/admin_admit_founder_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_allow_fid_for_access_request_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_allow_fid_reducer.ts',
    'scripts/genesis002_module_bindings/admin_audit_table.ts',
    'scripts/genesis002_module_bindings/admin_begin_greater_realm_verification_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_bump_auth_epoch_reducer.ts',
    'scripts/genesis002_module_bindings/admin_disable_fid_reducer.ts',
    'scripts/genesis002_module_bindings/admin_finalize_greater_realm_release_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_get_greater_realm_import_plan_v_1_procedure.ts',
    'scripts/genesis002_module_bindings/admin_get_greater_realm_status_v_1_procedure.ts',
    'scripts/genesis002_module_bindings/admin_import_greater_realm_chunk_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_import_greater_realm_components_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_import_greater_realm_regions_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_reset_access_request_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_stage_greater_realm_release_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_upsert_realm_profile_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/admin_verify_greater_realm_batch_v_1_reducer.ts',
    'scripts/genesis002_module_bindings/allowed_fid_table.ts',
    'scripts/genesis002_module_bindings/alpha_terms_acceptance_v_1_table.ts',
    'scripts/genesis002_module_bindings/auth_resolver_get_fid_admission_v_2_procedure.ts',
    'scripts/genesis002_module_bindings/bootstrap_player_reducer.ts',
    'scripts/genesis002_module_bindings/bootstrap_player_v_2_reducer.ts',
    'scripts/genesis002_module_bindings/castle_table.ts',
    'scripts/genesis002_module_bindings/get_my_admission_status_v_2_procedure.ts',
    'scripts/genesis002_module_bindings/get_realm_status_v_1_procedure.ts',
    'scripts/genesis002_module_bindings/greater_realm_activation_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_castle_claim_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_castle_slot_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_cell_occupancy_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_cell_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_chunk_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_navigation_component_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_release_v_1_table.ts',
    'scripts/genesis002_module_bindings/greater_realm_resource_node_v_1_table.ts',
    'scripts/genesis002_module_bindings/index.ts',
    'scripts/genesis002_module_bindings/mark_account_v_1_table.ts',
    'scripts/genesis002_module_bindings/player_ownership_v_2_table.ts',
    'scripts/genesis002_module_bindings/player_table.ts',
    'scripts/genesis002_module_bindings/player_v_2_table.ts',
    'scripts/genesis002_module_bindings/realm_atlas_v_1_table.ts',
    'scripts/genesis002_module_bindings/realm_atlas_visible_region_v_1_table.ts',
    'scripts/genesis002_module_bindings/realm_profile_v_1_table.ts',
    'scripts/genesis002_module_bindings/realm_worker_system_v_2_table.ts',
    'scripts/genesis002_module_bindings/resource_account_v_1_table.ts',
    'scripts/genesis002_module_bindings/types.ts',
    'scripts/greater-realm-cutover-operation-journal.ts',
    'scripts/greater-realm-cutover-receipts.ts',
    'scripts/greater-realm-cutover-write-control.ts',
    'scripts/greater-realm-downstream-release-policy.ts',
    'scripts/greater-realm-legacy-production-seal.d.mts',
    'scripts/greater-realm-legacy-production-seal.mjs',
    'scripts/greater-realm-openat.ts',
    'scripts/greater-realm-production-bootstrap.d.mts',
    'scripts/greater-realm-production-bootstrap.mjs',
    'scripts/greater-realm-production-immutable-artifact.ts',
    'scripts/greater-realm-production-import-core.ts',
    'scripts/greater-realm-production-import-operator.ts',
    'scripts/greater-realm-production-legacy-aggregate.ts',
    'scripts/greater-realm-production-pages-evidence-operator.ts',
    'scripts/greater-realm-production-pages-evidence.ts',
    'scripts/greater-realm-production-provenance.ts',
    'scripts/greater-realm-production-publisher-core.ts',
    'scripts/greater-realm-production-publisher.ts',
    'scripts/greater-realm-production-relocation-core.ts',
    'scripts/greater-realm-production-relocation-operator.ts',
    'scripts/greater-realm-production-transport.ts',
    'scripts/greater-realm-production-verifier-core.ts',
    'scripts/greater-realm-production-verifier.ts',
    'scripts/greater-realm-release-gate-deploy-boundary.d.mts',
    'scripts/greater-realm-release-gate-deploy-boundary.mjs',
    'scripts/hermes-admin.ts',
    'scripts/hermes-machine-output.ts',
    'scripts/inner-keep-operator-core.ts',
    'scripts/inner-keep-operator.ts',
    'scripts/inner-keep-population-runtime-contract.d.mts',
    'scripts/inner-keep-population-runtime-contract.mjs',
    'scripts/inner-keep-rabbit-runtime-contract.d.mts',
    'scripts/inner-keep-rabbit-runtime-contract.mjs',
    'scripts/inner-keep-runtime-asset-contract.d.mts',
    'scripts/inner-keep-runtime-asset-contract.mjs',
    'scripts/notification-pages-build-release-validator.d.mts',
    'scripts/notification-pages-build-release-validator.mjs',
    'scripts/notification-pages-deploy-lane.d.mts',
    'scripts/notification-pages-deploy-lane.mjs',
    'scripts/notification-pages-live-hermes-authority.d.mts',
    'scripts/notification-pages-live-hermes-authority.mjs',
    'scripts/notification-pages-live-receipt.d.mts',
    'scripts/notification-pages-live-receipt.mjs',
    'scripts/notification-pages-live-release-binding.d.mts',
    'scripts/notification-pages-live-release-binding.mjs',
    'scripts/notification-pages-private-deploy-journal.d.mts',
    'scripts/notification-pages-private-deploy-journal.mjs',
    'scripts/notification-pages-private-deploy-launcher.d.mts',
    'scripts/notification-pages-private-deploy-launcher.mjs',
    'scripts/notification-pages-private-deploy-operator.d.mts',
    'scripts/notification-pages-private-deploy-operator.mjs',
    'scripts/notification-pages-private-handoff.d.mts',
    'scripts/notification-pages-private-handoff.mjs',
    'scripts/notification-pages-private-release-binding.d.mts',
    'scripts/notification-pages-private-release-binding.mjs',
    'scripts/notification-pages-release-source-parser.d.mts',
    'scripts/notification-pages-release-source-parser.mjs',
    'scripts/private-operator-report.ts',
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
    'scripts/production-player-canary-release-binding.mjs',
    'scripts/profiles/farcaster-profile-policy.ts',
    'scripts/profiles/founder-admission-plan.ts',
    'scripts/profiles/profile-apply-audit.ts',
    'scripts/profiles/profile-plan-artifact.ts',
    'scripts/profiles/profile-transport.ts',
    'scripts/profiles/profiles-operator.ts',
    'scripts/ptr-production-admin-token.ts',
    'scripts/ptr-production-import-core.ts',
    'scripts/ptr-production-import-operator.ts',
    'scripts/ptr-production-publisher-cli.ts',
    'scripts/ptr-production-publisher.d.mts',
    'scripts/ptr-production-publisher.mjs',
    'scripts/ptr-production-receipt-file.ts',
    'scripts/ptr-production-release-receipts.ts',
    'scripts/ptr-production-transport.ts',
    'scripts/publish-spacetime-dev.d.mts',
    'scripts/publish-spacetime-dev.mjs',
    'scripts/qa-observer/local-fullstack-spacetime.d.mts',
    'scripts/qa-observer/local-fullstack-spacetime.mjs',
    'scripts/qa-observer/local-vite-fs-deny.d.mts',
    'scripts/qa-observer/local-vite-fs-deny.mjs',
    'scripts/spacetime-additive-migration-proof.d.mts',
    'scripts/spacetime-additive-migration-proof.mjs',
    'scripts/spacetime-cli-attestation.d.mts',
    'scripts/spacetime-cli-attestation.mjs',
    'scripts/spacetime-publish-receipt.d.mts',
    'scripts/spacetime-publish-receipt.mjs',
    'scripts/spacetime-table-schema-attestation.d.mts',
    'scripts/spacetime-table-schema-attestation.mjs',
    'scripts/validate-pages-deploy-config.mjs',
    'scripts/verify-0.4.0-sealed-launch.d.mts',
    'scripts/verify-0.4.0-sealed-launch.mjs',
    'scripts/verify-admission-request-suspension.d.mts',
    'scripts/verify-admission-request-suspension.mjs',
    'scripts/verify-alpha-production.mjs',
    'scripts/verify-auth-bridge-notification-b0-policy.d.mts',
    'scripts/verify-auth-bridge-notification-b0-policy.mjs',
    'scripts/verify-auth-bridge-notification-prepared-policy.d.mts',
    'scripts/verify-auth-bridge-notification-prepared-policy.mjs',
    'scripts/verify-auth-bridge-notification-prepared-receipt.mjs',
    'scripts/verify-greater-realm-release-gates.d.mts',
    'scripts/verify-greater-realm-release-gates.mjs',
    'scripts/verify-production-dist-exclusions.mjs',
    'scripts/warpkeep-package-version.d.mts',
    'scripts/warpkeep-package-version.mjs',
    'scripts/water-revision-operator.ts',
    'scripts/worker-return-repair-operator-core.ts',
    'scripts/worker-return-repair-operator.ts',
    'scripts/worker-rollout-controls.ts',
    'scripts/worker-rollout-operator-core.ts',
    'scripts/worker-rollout-operator.ts',
    'services/auth-bridge/package.json',
    'services/auth-bridge/pnpm-lock.yaml',
    'services/auth-bridge/pnpm-workspace.yaml',
    'services/auth-bridge/src/admissionNotifications.ts',
    'services/auth-bridge/src/app.ts',
    'services/auth-bridge/src/browserBinding.ts',
    'services/auth-bridge/src/challengeStore.ts',
    'services/auth-bridge/src/config.ts',
    'services/auth-bridge/src/farcaster.ts',
    'services/auth-bridge/src/index.ts',
    'services/auth-bridge/src/jwt.ts',
    'services/auth-bridge/src/miniAppWebhook.ts',
    'services/auth-bridge/src/qaObserver.ts',
    'services/auth-bridge/src/rateLimit.ts',
    'services/auth-bridge/src/sessionCookie.ts',
    'services/auth-bridge/src/sessionFamily.ts',
    'services/auth-bridge/src/spacetimeAccessRequestResolver.ts',
    'services/auth-bridge/src/spacetimeAuthEpochResolver.ts',
    'services/auth-bridge/src/spacetimeQaObserverResolver.ts',
    'services/auth-bridge/src/types.ts',
    'services/auth-bridge/test-workerd/authBridge.workerd.test.ts',
    'services/auth-bridge/test-workerd/tsconfig.json',
    'services/auth-bridge/test-workerd/worker-configuration.d.ts',
    'services/auth-bridge/test/admissionNotifications.test.ts',
    'services/auth-bridge/test/app.test.ts',
    'services/auth-bridge/test/browserBinding.test.ts',
    'services/auth-bridge/test/challengeStore.test.ts',
    'services/auth-bridge/test/farcaster.test.ts',
    'services/auth-bridge/test/miniAppWebhook.test.ts',
    'services/auth-bridge/test/ptrOwnerExchange.test.ts',
    'services/auth-bridge/test/qaObserver.test.ts',
    'services/auth-bridge/test/rateLimit.test.ts',
    'services/auth-bridge/test/sessionFamily.test.ts',
    'services/auth-bridge/test/spacetimeAccessRequestResolver.test.ts',
    'services/auth-bridge/test/spacetimeAuthEpochResolver.test.ts',
    'services/auth-bridge/test/spacetimeQaObserverResolver.test.ts',
    'services/auth-bridge/tsconfig.json',
    'services/auth-bridge/vitest.config.ts',
    'services/auth-bridge/vitest.workerd.config.ts',
    'services/auth-bridge/wrangler.toml',
    'spacetimedb/genesis002/package.json',
    'spacetimedb/genesis002/src/atlasImportReducers.ts',
    'spacetimedb/genesis002/src/auth.ts',
    'spacetimedb/genesis002/src/contract.ts',
    'spacetimedb/genesis002/src/index.ts',
    'spacetimedb/genesis002/src/lifecycle.ts',
    'spacetimedb/genesis002/src/policy.ts',
    'spacetimedb/genesis002/src/population.ts',
    'spacetimedb/genesis002/src/reducers.ts',
    'spacetimedb/genesis002/src/schema.ts',
    'spacetimedb/genesis002/tsconfig.json',
    'spacetimedb/package.json',
    'spacetimedb/pnpm-lock.yaml',
    'spacetimedb/pnpm-workspace.yaml',
    'spacetimedb/ptr/generated-bindings/admin_begin_greater_realm_verification_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_finalize_greater_realm_release_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_get_greater_realm_status_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_chunk_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_components_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_import_greater_realm_regions_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_provision_ptr_owner_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_stage_greater_realm_release_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_suspend_ptr_owner_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/admin_verify_greater_realm_batch_v_1_reducer.ts',
    'spacetimedb/ptr/generated-bindings/get_ptr_owner_status_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/get_realm_atlas_bootstrap_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/get_realm_atlas_chunk_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/get_realm_atlas_resource_locations_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/get_realm_atlas_window_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/index.ts',
    'spacetimedb/ptr/generated-bindings/plan_realm_route_v_1_procedure.ts',
    'spacetimedb/ptr/generated-bindings/types.ts',
    'spacetimedb/src/accessRequestPolicy.ts',
    'spacetimedb/src/adminPolicy.ts',
    'spacetimedb/src/admissionPolicy.ts',
    'spacetimedb/src/alphaActivationPolicy.ts',
    'spacetimedb/src/alphaV10ActivationPolicy.ts',
    'spacetimedb/src/auth.ts',
    'spacetimedb/src/castleWorkerAuthority.ts',
    'spacetimedb/src/castleWorkerCommandPolicy.ts',
    'spacetimedb/src/castleWorkerPolicy.ts',
    'spacetimedb/src/castleWorkerRolloutAuthority.ts',
    'spacetimedb/src/castleWorkerRolloutPolicy.ts',
    'spacetimedb/src/castleWorkerRoster.ts',
    'spacetimedb/src/claims.ts',
    'spacetimedb/src/config.ts',
    'spacetimedb/src/dailyMarksAuthority.ts',
    'spacetimedb/src/entryAgreementPolicy.ts',
    'spacetimedb/src/foodExpeditionAuthority.ts',
    'spacetimedb/src/foodExpeditionPolicy.ts',
    'spacetimedb/src/foodSitePolicy.ts',
    'spacetimedb/src/forestLayoutAuthority.ts',
    'spacetimedb/src/forestLayoutContract.ts',
    'spacetimedb/src/forestLayoutPolicy.ts',
    'spacetimedb/src/foundingAuthority.ts',
    'spacetimedb/src/foundingPolicy.ts',
    'spacetimedb/src/genesis001AccessPolicy.ts',
    'spacetimedb/src/goldExpeditionAuthority.ts',
    'spacetimedb/src/goldExpeditionPolicy.ts',
    'spacetimedb/src/goldSitePolicy.ts',
    'spacetimedb/src/greaterRealmActivationPolicy.ts',
    'spacetimedb/src/greaterRealmActivationState.ts',
    'spacetimedb/src/greaterRealmCurrentAuthority.ts',
    'spacetimedb/src/greaterRealmCutoverAudit.ts',
    'spacetimedb/src/greaterRealmCutoverStatus.ts',
    'spacetimedb/src/greaterRealmFoundingAuthority.ts',
    'spacetimedb/src/greaterRealmFoundingPolicy.ts',
    'spacetimedb/src/greaterRealmPublicReadAuthority.ts',
    'spacetimedb/src/greaterRealmRelocationAuthority.ts',
    'spacetimedb/src/greaterRealmRelocationDormant.ts',
    'spacetimedb/src/greaterRealmRelocationSnapshot.ts',
    'spacetimedb/src/greaterRealmResourceLocationAuthority.ts',
    'spacetimedb/src/greaterRealmV17Authority.ts',
    'spacetimedb/src/greaterRealmV17LegacyAuthority.ts',
    'spacetimedb/src/greaterRealmV17Policy.ts',
    'spacetimedb/src/greaterRealmWorkerAuthority.ts',
    'spacetimedb/src/greaterRealmWorkerPolicy.ts',
    'spacetimedb/src/greaterRealmWorkerReadAuthority.ts',
    'spacetimedb/src/index.ts',
    'spacetimedb/src/innerKeepAuthority.ts',
    'spacetimedb/src/innerKeepBuilderAuthority.ts',
    'spacetimedb/src/innerKeepLayoutPolicy.ts',
    'spacetimedb/src/innerKeepPolicy.ts',
    'spacetimedb/src/legacyExpeditionReturnAuthority.ts',
    'spacetimedb/src/lifecycle.ts',
    'spacetimedb/src/lowlandsSurface.ts',
    'spacetimedb/src/marksAuthorityPolicy.ts',
    'spacetimedb/src/playerOwnershipPolicy.ts',
    'spacetimedb/src/productionPlayerCanaryApproval.ts',
    'spacetimedb/src/productionPlayerCanaryApprovalPolicy.ts',
    'spacetimedb/src/productionPlayerCanaryBaseline.ts',
    'spacetimedb/src/productionPlayerCanaryBaselinePolicy.ts',
    'spacetimedb/src/productionPlayerCanaryEvidence.ts',
    'spacetimedb/src/productionPlayerCanaryRecovery.ts',
    'spacetimedb/src/productionPlayerCanaryRecoveryPolicy.ts',
    'spacetimedb/src/productionPlayerCanaryRoutePolicy.ts',
    'spacetimedb/src/profileAuthorityPolicy.ts',
    'spacetimedb/src/qaObserverPolicy.ts',
    'spacetimedb/src/realmChatPolicy.ts',
    'spacetimedb/src/reducers/accessRequests.ts',
    'spacetimedb/src/reducers/admin.ts',
    'spacetimedb/src/reducers/admission.ts',
    'spacetimedb/src/reducers/alphaStatus.ts',
    'spacetimedb/src/reducers/alphaStatusV10.ts',
    'spacetimedb/src/reducers/castleWorkers.ts',
    'spacetimedb/src/reducers/dailyMarks.ts',
    'spacetimedb/src/reducers/foodExpeditions.ts',
    'spacetimedb/src/reducers/forestLayout.ts',
    'spacetimedb/src/reducers/genesis001AccessPolicy.ts',
    'spacetimedb/src/reducers/goldExpeditions.ts',
    'spacetimedb/src/reducers/greaterRealm.ts',
    'spacetimedb/src/reducers/greaterRealmCutover.ts',
    'spacetimedb/src/reducers/innerKeep.ts',
    'spacetimedb/src/reducers/qaObserver.ts',
    'spacetimedb/src/reducers/realmChat.ts',
    'spacetimedb/src/reducers/resources.ts',
    'spacetimedb/src/reducers/stoneExpeditions.ts',
    'spacetimedb/src/reducers/waterLayout.ts',
    'spacetimedb/src/reducers/waterRevision.ts',
    'spacetimedb/src/reducers/woodExpeditions.ts',
    'spacetimedb/src/reducers/worldSeed.ts',
    'spacetimedb/src/resourceAuthority.ts',
    'spacetimedb/src/resourceAuthorityPolicy.ts',
    'spacetimedb/src/resourceExpeditionReservationAuthority.ts',
    'spacetimedb/src/resourceSitePlacementPolicy.ts',
    'spacetimedb/src/schema.ts',
    'spacetimedb/src/sha256.ts',
    'spacetimedb/src/stoneExpeditionAuthority.ts',
    'spacetimedb/src/stoneExpeditionPolicy.ts',
    'spacetimedb/src/stoneSitePolicy.ts',
    'spacetimedb/src/waterAuthority.ts',
    'spacetimedb/src/waterRevision.ts',
    'spacetimedb/src/waterRevisionAuthority.ts',
    'spacetimedb/src/waterWorld.ts',
    'spacetimedb/src/woodExpeditionAuthority.ts',
    'spacetimedb/src/woodExpeditionPolicy.ts',
    'spacetimedb/src/woodSitePolicy.ts',
    'spacetimedb/src/world.ts',
    'spacetimedb/src/worldCastleIntegrity.ts',
    'spacetimedb/src/worldSeedPolicy.ts',
    'src/App.tsx',
    'src/build/buildInfo.ts',
    'src/build/buildInfoTypes.ts',
    'src/components/WarpkeepExperience.css',
    'src/components/WarpkeepExperience.tsx',
    'src/components/audio/WarpkeepAudioDirector.tsx',
    'src/components/audio/WarpkeepHapticsDirector.tsx',
    'src/components/audio/WarpkeepSfxDirector.tsx',
    'src/components/audio/audioDirector.ts',
    'src/components/audio/index.ts',
    'src/components/audio/proceduralSfxEngine.ts',
    'src/components/audio/sfxEvents.ts',
    'src/components/audio/waterAmbience.ts',
    'src/components/auth/FarcasterAccessRequest.css',
    'src/components/auth/FarcasterAccessRequest.tsx',
    'src/components/auth/FarcasterAdmissionCheck.css',
    'src/components/auth/FarcasterAdmissionCheck.tsx',
    'src/components/auth/FarcasterAdmissionNotificationOptIn.css',
    'src/components/auth/FarcasterAdmissionNotificationOptIn.tsx',
    'src/components/auth/FarcasterAdmissionPanel.css',
    'src/components/auth/FarcasterAdmissionPanel.tsx',
    'src/components/auth/FarcasterIdentityBadge.tsx',
    'src/components/auth/FarcasterMiniAppEntryGate.css',
    'src/components/auth/FarcasterMiniAppEntryGate.tsx',
    'src/components/auth/FarcasterQrAuthPanel.css',
    'src/components/auth/FarcasterQrAuthPanel.tsx',
    'src/components/errors/WarpkeepErrorBoundary.css',
    'src/components/errors/WarpkeepErrorBoundary.tsx',
    'src/components/errors/warpkeepRootErrorHandlers.ts',
    'src/components/inner-keep/InnerKeepScreen.css',
    'src/components/inner-keep/InnerKeepScreen.tsx',
    'src/components/inner-keep/createInnerKeepAuthoredPresentation.ts',
    'src/components/inner-keep/createInnerKeepEcology.ts',
    'src/components/inner-keep/createInnerKeepFarCountryside.ts',
    'src/components/inner-keep/createInnerKeepOuterWorldPresentation.ts',
    'src/components/inner-keep/createInnerKeepPopulationPresentation.ts',
    'src/components/inner-keep/createInnerKeepRabbitPresentation.ts',
    'src/components/inner-keep/createInnerKeepSceneLayer.ts',
    'src/components/inner-keep/createInnerKeepTerrainDrapedGeometry.ts',
    'src/components/inner-keep/createInnerKeepTownAtmosphere.ts',
    'src/components/inner-keep/innerKeepAmbientPolicy.ts',
    'src/components/inner-keep/innerKeepAmbientTimeline.ts',
    'src/components/inner-keep/innerKeepFarCountrysidePolicy.ts',
    'src/components/inner-keep/innerKeepFixedPlacementExclusions.ts',
    'src/components/inner-keep/innerKeepFreePlacementPolicy.ts',
    'src/components/inner-keep/innerKeepLayoutV1.ts',
    'src/components/inner-keep/innerKeepOuterWorldPolicy.ts',
    'src/components/inner-keep/innerKeepPathSampler.ts',
    'src/components/inner-keep/innerKeepPlacement.ts',
    'src/components/inner-keep/innerKeepPresentation.ts',
    'src/components/inner-keep/innerKeepPresentationLayoutPolicy.ts',
    'src/components/inner-keep/innerKeepRabbitRuntimeAssets.ts',
    'src/components/inner-keep/innerKeepRuntimeAssetCatalog.generated.ts',
    'src/components/inner-keep/innerKeepTownAtmospherePolicy.ts',
    'src/components/inner-keep/loadInnerKeepRabbitAssets.ts',
    'src/components/inner-keep/loadInnerKeepRuntimeAssets.ts',
    'src/components/menu/AlphaParticipationTermsDialog.css',
    'src/components/menu/AlphaParticipationTermsDialog.tsx',
    'src/components/menu/CreditsRoll.css',
    'src/components/menu/CreditsRoll.tsx',
    'src/components/menu/LatestPatchNotesPopover.css',
    'src/components/menu/LatestPatchNotesPopover.tsx',
    'src/components/menu/MenuDevelopmentNotice.tsx',
    'src/components/menu/RealmChoiceSelector.css',
    'src/components/menu/RealmChoiceSelector.tsx',
    'src/components/menu/SettingsPanel.css',
    'src/components/menu/SettingsPanel.tsx',
    'src/components/menu/WarpkeepBuildStamp.tsx',
    'src/components/menu/WarpkeepMainMenu.css',
    'src/components/menu/WarpkeepMainMenu.tsx',
    'src/components/menu/latestPatchNotes.ts',
    'src/components/menu/menuCommands.ts',
    'src/components/menu/realmChoicePolicy.ts',
    'src/components/menu/useModalFocusBoundary.ts',
    'src/components/profile/StaticProfileImageCanvas.tsx',
    'src/components/realm/CastleInspectionPanel.tsx',
    'src/components/realm/FoodFarmInspectionPanel.css',
    'src/components/realm/FoodFarmInspectionPanel.tsx',
    'src/components/realm/GoldMineInspectionPanel.css',
    'src/components/realm/GoldMineInspectionPanel.tsx',
    'src/components/realm/GreaterRealmWorldScene.tsx',
    'src/components/realm/LoggingCampInspectionPanel.css',
    'src/components/realm/LoggingCampInspectionPanel.tsx',
    'src/components/realm/RealmAccessibilityControls.tsx',
    'src/components/realm/RealmCastleLabels.tsx',
    'src/components/realm/RealmCastlePresentation.css',
    'src/components/realm/RealmChatDock.css',
    'src/components/realm/RealmChatDock.tsx',
    'src/components/realm/RealmFullScreenSurface.css',
    'src/components/realm/RealmFullScreenSurface.tsx',
    'src/components/realm/RealmHud.tsx',
    'src/components/realm/RealmMapScreen.css',
    'src/components/realm/RealmMapScreen.tsx',
    'src/components/realm/RealmNodeWorkerDispatch.css',
    'src/components/realm/RealmNodeWorkerDispatch.tsx',
    'src/components/realm/RealmObserverHud.tsx',
    'src/components/realm/RealmPlayerChrome.css',
    'src/components/realm/RealmRecordPrimitives.css',
    'src/components/realm/RealmRecordPrimitives.tsx',
    'src/components/realm/RealmRendererRecoveryPanel.tsx',
    'src/components/realm/RealmResourceBalancePanel.css',
    'src/components/realm/RealmResourceBalancePanel.tsx',
    'src/components/realm/RealmResourceOccupantDetails.tsx',
    'src/components/realm/RealmResourceOccupantMarkers.tsx',
    'src/components/realm/RealmTerrainInspectionPanel.css',
    'src/components/realm/RealmTerrainInspectionPanel.tsx',
    'src/components/realm/RealmWorkerPresenceMarkers.css',
    'src/components/realm/RealmWorkerPresenceMarkers.tsx',
    'src/components/realm/StoneQuarryInspectionPanel.css',
    'src/components/realm/StoneQuarryInspectionPanel.tsx',
    'src/components/realm/WaterInspectionPanel.css',
    'src/components/realm/WaterInspectionPanel.tsx',
    'src/components/realm/WorkerCommandCenter.css',
    'src/components/realm/WorkerCommandCenter.tsx',
    'src/components/realm/WorkerInspectionPanel.css',
    'src/components/realm/WorkerInspectionPanel.tsx',
    'src/components/realm/castleInstancePlanning.ts',
    'src/components/realm/createGreaterRealmWorldCanvasHost.ts',
    'src/components/realm/createLowPolyGrassGeometry.ts',
    'src/components/realm/createRealmAmbientEcologyLayer.ts',
    'src/components/realm/createRealmDecorativeForestLayer.ts',
    'src/components/realm/createRealmEnvironment.ts',
    'src/components/realm/createRealmForestWindMaterial.ts',
    'src/components/realm/createRealmGrassLayer.ts',
    'src/components/realm/createRealmGrassMaterial.ts',
    'src/components/realm/createRealmProceduralForestFallback.ts',
    'src/components/realm/createRealmProceduralWorkerWagonFallback.ts',
    'src/components/realm/createRealmRabbitLayer.ts',
    'src/components/realm/createRealmScene.ts',
    'src/components/realm/createRealmTerrainFeatures.ts',
    'src/components/realm/createRealmTerrainMaterial.ts',
    'src/components/realm/createRealmWildflowerGeometry.ts',
    'src/components/realm/createRealmWildflowerLayer.ts',
    'src/components/realm/createRealmWildflowerMaterial.ts',
    'src/components/realm/createTerrainDecorations.ts',
    'src/components/realm/createTerrainGeometry.ts',
    'src/components/realm/greaterRealmSceneStrategy.ts',
    'src/components/realm/greaterRealmWorldSnapshotAuthority.ts',
    'src/components/realm/greaterRealmWorldViewPolicy.ts',
    'src/components/realm/hegemonyKeepPrefabRepository.ts',
    'src/components/realm/hegemonyTreeRuntimeAssets.ts',
    'src/components/realm/loadHegemonyCastleAssembly.ts',
    'src/components/realm/loadHegemonyExpeditionAssets.ts',
    'src/components/realm/loadHegemonyKeep.ts',
    'src/components/realm/loadHegemonyLandscapeBase.ts',
    'src/components/realm/loadHegemonyTreeAssets.ts',
    'src/components/realm/loadRealmProfileImage.ts',
    'src/components/realm/loadRealmRabbitAsset.ts',
    'src/components/realm/realmAmbientScheduler.ts',
    'src/components/realm/realmAuthoritySchedule.ts',
    'src/components/realm/realmCameraController.ts',
    'src/components/realm/realmCastleInstanceLayer.ts',
    'src/components/realm/realmCastlePresentation.ts',
    'src/components/realm/realmCastleProjectionGeometry.ts',
    'src/components/realm/realmChromePresentation.ts',
    'src/components/realm/realmExpeditionPresentationBudget.ts',
    'src/components/realm/realmFoodExpeditionPresentation.ts',
    'src/components/realm/realmFoodNodeLayer.ts',
    'src/components/realm/realmFoodNodePresentation.ts',
    'src/components/realm/realmForestActiveWindow.ts',
    'src/components/realm/realmForestLayer.ts',
    'src/components/realm/realmGoldExpeditionPresentation.ts',
    'src/components/realm/realmGoldNodeLayer.ts',
    'src/components/realm/realmGoldNodePresentation.ts',
    'src/components/realm/realmGrassActiveWindow.ts',
    'src/components/realm/realmInteractionState.ts',
    'src/components/realm/realmLivingEnvironment.ts',
    'src/components/realm/realmMapPresentationHelpers.ts',
    'src/components/realm/realmMapProjectionStability.ts',
    'src/components/realm/realmMeasuredComposition.ts',
    'src/components/realm/realmModelRequestLifecycle.ts',
    'src/components/realm/realmNavigatorFocus.ts',
    'src/components/realm/realmPickArbitration.ts',
    'src/components/realm/realmPinchZoom.ts',
    'src/components/realm/realmPointerGestureCoordinator.ts',
    'src/components/realm/realmQuality.ts',
    'src/components/realm/realmRabbitRuntimeAsset.ts',
    'src/components/realm/realmRendererDiagnostics.ts',
    'src/components/realm/realmRendererEmergencyQuality.ts',
    'src/components/realm/realmRendererRecovery.ts',
    'src/components/realm/realmResourceOccupantInspector.ts',
    'src/components/realm/realmResourceOccupantPresentation.ts',
    'src/components/realm/realmResourcePresentation.ts',
    'src/components/realm/realmResourceSiteCatalogPolicy.ts',
    'src/components/realm/realmResourceSiteWorldAccents.ts',
    'src/components/realm/realmStoneExpeditionPresentation.ts',
    'src/components/realm/realmStoneNodeLayer.ts',
    'src/components/realm/realmStoneNodePresentation.ts',
    'src/components/realm/realmSurfaceDisturbanceField.ts',
    'src/components/realm/realmSurfaceNavigation.ts',
    'src/components/realm/realmTextureResources.ts',
    'src/components/realm/realmTypes.ts',
    'src/components/realm/realmVegetationCapability.ts',
    'src/components/realm/realmWaterAmbiencePresentation.ts',
    'src/components/realm/realmWaterChannelPresentation.ts',
    'src/components/realm/realmWaterInspectionPresentation.ts',
    'src/components/realm/realmWaterLayer.ts',
    'src/components/realm/realmWaterNavigation.ts',
    'src/components/realm/realmWaterPhase.ts',
    'src/components/realm/realmWaterProjection.ts',
    'src/components/realm/realmWaterTerrainProjection.ts',
    'src/components/realm/realmWoodExpeditionPresentation.ts',
    'src/components/realm/realmWoodNodeLayer.ts',
    'src/components/realm/realmWoodNodePresentation.ts',
    'src/components/realm/realmWorkerLayer.ts',
    'src/components/realm/realmWorkerLocomotion.ts',
    'src/components/realm/realmWorkerPresentation.ts',
    'src/components/realm/realmWorkerRouteLayer.ts',
    'src/components/realm/realmWorkerRoutePresentation.ts',
    'src/components/realm/realmWorkerSfxPresentation.ts',
    'src/components/realm/realmWorkerWagonRuntime.ts',
    'src/components/realm/realmWorldPortraitLayout.ts',
    'src/components/realm/useRealmChromeMode.ts',
    'src/components/realm/useRealmSurfaceNavigation.ts',
    'src/components/realm/useRealmWorkerRecallLifecycle.ts',
    'src/components/title/BlackHoleGateway.tsx',
    'src/components/title/TitleGatewayHint.tsx',
    'src/components/title/WarpkeepTitleScreen.css',
    'src/components/title/WarpkeepTitleScreen3D.tsx',
    'src/components/title/WarpkeepTitleScreenFallback.tsx',
    'src/components/title/gatewayActivation.ts',
    'src/components/title/gatewayInteraction.ts',
    'src/components/title/gatewayPointerProjection.ts',
    'src/components/title/gatewayVfx.ts',
    'src/components/title/gatewayVfxShaders.ts',
    'src/components/title/gatewayVfxSpec.ts',
    'src/components/title/loadWarpkeepTitle.ts',
    'src/components/title/titleDeparturePose.ts',
    'src/components/title/titleInteraction.ts',
    'src/components/title/titleLayout.ts',
    'src/components/title/titleMaterialReveal.ts',
    'src/components/title/titlePresentationController.ts',
    'src/components/title/titlePresentationMachine.ts',
    'src/components/title/titleSceneSpec.ts',
    'src/components/title/titleScreenTypes.ts',
    'src/components/transition/WarpTransitionOverlay.css',
    'src/components/transition/WarpTransitionOverlay.tsx',
    'src/components/transition/experienceTransition.ts',
    'src/farcaster/FarcasterAuthProvider.tsx',
    'src/farcaster/FarcasterAuthProviderCore.tsx',
    'src/farcaster/accessRequestStateMachine.ts',
    'src/farcaster/farcasterAuthClient.ts',
    'src/farcaster/farcasterAuthContext.ts',
    'src/farcaster/farcasterAuthDiagnostics.ts',
    'src/farcaster/farcasterAuthMachine.ts',
    'src/farcaster/farcasterAuthTypes.ts',
    'src/farcaster/farcasterBrowserBinding.ts',
    'src/farcaster/farcasterDeviceSession.ts',
    'src/farcaster/farcasterOidcBridgeClient.ts',
    'src/farcaster/farcasterOidcSession.ts',
    'src/farcaster/farcasterPresentationSession.ts',
    'src/farcaster/farcasterProjectLinks.ts',
    'src/farcaster/farcasterQrCode.ts',
    'src/farcaster/miniapp/MiniAppHostProvider.tsx',
    'src/farcaster/miniapp/index.ts',
    'src/farcaster/miniapp/miniAppRuntime.ts',
    'src/farcaster/useAccessRequest.ts',
    'src/game/map/canonicalPassableRoute.ts',
    'src/game/map/canonicalWaterNavigation.ts',
    'src/game/map/deterministicBudget.ts',
    'src/game/map/generateTerrainMap.ts',
    'src/game/map/hegemonyLandmarks.ts',
    'src/game/map/hegemonyLowlandsSpec.ts',
    'src/game/map/hexCoordinates.ts',
    'src/game/map/realmForestBiomes.ts',
    'src/game/map/realmForestEcology.ts',
    'src/game/map/realmGrass.ts',
    'src/game/map/realmGrassNoise.ts',
    'src/game/map/realmGrassPalette.ts',
    'src/game/map/realmNorthernSnow.ts',
    'src/game/map/realmPrevailingWind.ts',
    'src/game/map/realmRiverBankPresentation.ts',
    'src/game/map/realmSeed.ts',
    'src/game/map/realmSharedForestPlacements.ts',
    'src/game/map/realmSouthernDesert.ts',
    'src/game/map/realmTerrainFeatures.ts',
    'src/game/map/realmTerrainSemantics.ts',
    'src/game/map/realmTerrainSurface.ts',
    'src/game/map/realmVegetationField.ts',
    'src/game/map/realmVegetationMask.ts',
    'src/game/map/terrainColor.ts',
    'src/game/map/terrainDecorations.ts',
    'src/game/map/terrainHeight.ts',
    'src/game/map/terrainPlacements.ts',
    'src/game/map/terrainTypes.ts',
    'src/greater-realm/createGreaterRealmSceneRuntime.ts',
    'src/greater-realm/greaterRealmChunkStream.ts',
    'src/greater-realm/greaterRealmClientRuntime.ts',
    'src/greater-realm/greaterRealmPresentationPlan.ts',
    'src/greater-realm/greaterRealmPublicContract.ts',
    'src/greater-realm/greaterRealmRuntimePolicy.ts',
    'src/greater-realm/greaterRealmTransport.ts',
    'src/greater-realm/greaterRealmWorkerControl.ts',
    'src/legal/alphaTermsPolicy.ts',
    'src/legal/publicDocuments.ts',
    'src/legal/realmChatPolicy.ts',
    'src/main.tsx',
    'src/marks/marksPolicy.ts',
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
    'src/ptr/PtrRealmProvider.tsx',
    'src/ptr/ptrGreaterRealmBridge.ts',
    'src/ptr/ptrRealmAuthClient.ts',
    'src/ptr/ptrRealmConfig.ts',
    'src/ptr/ptrRealmConnection.ts',
    'src/ptr/ptrRealmPresentationPolicy.ts',
    'src/release/admissionLaunchPolicy.ts',
    'src/release/realmReleaseIdentity.ts',
    'src/security/publicImageUrl.ts',
    'src/security/publicProfileText.ts',
    'src/settings/audioPreference.ts',
    'src/settings/graphicsPreference.ts',
    'src/settings/networkPreloadPolicy.ts',
    'src/spacetime/WarpkeepSpacetimeProvider.tsx',
    'src/spacetime/canonicalGenesisSnapshot.ts',
    'src/spacetime/expeditionIdempotencyKey.ts',
    'src/spacetime/greaterRealmProviderBridge.ts',
    'src/spacetime/index.ts',
    'src/spacetime/innerKeepCommandIdempotency.ts',
    'src/spacetime/innerKeepProjection.ts',
    'src/spacetime/module_bindings/accept_alpha_terms_v_1_reducer.ts',
    'src/spacetime/module_bindings/access_request_get_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/access_request_submit_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_activate_daily_marks_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_activate_genesis_water_layout_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_activate_genesis_water_revision_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_activate_inner_keep_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_activate_realm_chat_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_activate_worker_system_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_admit_founder_for_access_request_v_2_reducer.ts',
    'src/spacetime/module_bindings/admin_admit_founder_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_allow_fid_for_access_request_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_allow_fid_reducer.ts',
    'src/spacetime/module_bindings/admin_backfill_daily_mark_accounts_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_backfill_inner_keep_builders_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_backfill_resource_accounts_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_backfill_worker_roster_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_begin_greater_realm_drain_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_begin_greater_realm_verification_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_begin_worker_legacy_drain_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_bump_auth_epoch_reducer.ts',
    'src/spacetime/module_bindings/admin_capture_production_player_canary_baseline_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_commit_greater_realm_active_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_complete_worker_legacy_drain_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_deactivate_inner_keep_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_disable_fid_reducer.ts',
    'src/spacetime/module_bindings/admin_disable_realm_chat_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_expand_genesis_world_v_3_reducer.ts',
    'src/spacetime/module_bindings/admin_finalize_greater_realm_release_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_freeze_greater_realm_activation_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_get_access_request_admission_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_access_request_reset_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_v_10_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_v_2_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_v_3_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_v_4_procedure.ts',
    'src/spacetime/module_bindings/admin_get_alpha_status_v_8_procedure.ts',
    'src/spacetime/module_bindings/admin_get_daily_marks_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_fid_auth_epoch_procedure.ts',
    'src/spacetime/module_bindings/admin_get_greater_realm_cutover_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_greater_realm_import_plan_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_greater_realm_reenable_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_greater_realm_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_inner_keep_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_production_player_canary_approval_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_production_player_canary_baseline_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_production_player_canary_evidence_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_production_player_canary_recovery_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_realm_chat_report_context_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_realm_chat_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_get_worker_rollout_status_v_2_procedure.ts',
    'src/spacetime/module_bindings/admin_get_worker_system_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_halt_greater_realm_activation_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_import_greater_realm_chunk_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_import_greater_realm_components_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_import_greater_realm_regions_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_inspect_genesis_water_layout_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_inspect_genesis_water_revision_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_list_access_requests_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_list_realm_chat_reports_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_plan_greater_realm_relocation_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_plan_inner_keep_builders_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_plan_inner_keep_catalog_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_plan_production_player_canary_routes_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_plan_worker_roster_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_prepare_greater_realm_activation_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_register_production_player_canary_approval_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_relocate_greater_realm_canary_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_repair_missing_worker_return_schedule_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_reset_access_request_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_resolve_realm_chat_report_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_resume_greater_realm_active_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_rollback_greater_realm_before_commit_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_forest_layout_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_tier_i_food_sites_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_tier_i_gold_sites_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_tier_i_stone_sites_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_tier_i_wood_sites_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_water_layout_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_genesis_water_revision_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_inner_keep_catalog_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_seed_world_reducer.ts',
    'src/spacetime/module_bindings/admin_stage_greater_realm_release_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_stage_realm_chat_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_stage_worker_system_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_tombstone_realm_chat_message_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_upsert_realm_profile_v_1_reducer.ts',
    'src/spacetime/module_bindings/admin_verify_greater_realm_batch_v_1_reducer.ts',
    'src/spacetime/module_bindings/auth_resolver_get_fid_admission_v_2_procedure.ts',
    'src/spacetime/module_bindings/bootstrap_player_reducer.ts',
    'src/spacetime/module_bindings/bootstrap_player_v_2_reducer.ts',
    'src/spacetime/module_bindings/castle_inner_keep_building_v_1_table.ts',
    'src/spacetime/module_bindings/castle_slot_v_1_table.ts',
    'src/spacetime/module_bindings/castle_table.ts',
    'src/spacetime/module_bindings/castle_worker_v_1_table.ts',
    'src/spacetime/module_bindings/collect_food_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/collect_gold_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/collect_resources_v_1_reducer.ts',
    'src/spacetime/module_bindings/collect_stone_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/collect_wood_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_food_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_gold_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_greater_realm_worker_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_stone_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_wood_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/dispatch_worker_v_1_reducer.ts',
    'src/spacetime/module_bindings/food_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/food_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/food_site_v_1_table.ts',
    'src/spacetime/module_bindings/genesis_001_access_policy_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_alpha_backend_info_procedure.ts',
    'src/spacetime/module_bindings/get_my_admission_status_procedure.ts',
    'src/spacetime/module_bindings/get_my_admission_status_v_2_procedure.ts',
    'src/spacetime/module_bindings/get_my_entry_agreement_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_food_expedition_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_gold_expedition_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_inner_keep_request_status_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_inner_keep_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_resource_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_resource_state_v_2_procedure.ts',
    'src/spacetime/module_bindings/get_my_stone_expedition_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_wood_expedition_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_worker_control_state_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_my_worker_control_state_v_2_procedure.ts',
    'src/spacetime/module_bindings/get_my_worker_roster_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_production_player_canary_runtime_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_atlas_bootstrap_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_atlas_chunk_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_atlas_resource_locations_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_atlas_window_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_chat_history_v_1_procedure.ts',
    'src/spacetime/module_bindings/get_realm_chat_recent_v_1_procedure.ts',
    'src/spacetime/module_bindings/gold_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/gold_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/gold_site_v_1_table.ts',
    'src/spacetime/module_bindings/greater_realm_cell_occupancy_v_1_table.ts',
    'src/spacetime/module_bindings/index.ts',
    'src/spacetime/module_bindings/inner_keep_build_level_v_1_table.ts',
    'src/spacetime/module_bindings/inner_keep_building_catalog_v_1_table.ts',
    'src/spacetime/module_bindings/inner_keep_layout_v_1_table.ts',
    'src/spacetime/module_bindings/inner_keep_slot_v_1_table.ts',
    'src/spacetime/module_bindings/inner_keep_start_project_v_1_reducer.ts',
    'src/spacetime/module_bindings/plan_realm_route_v_1_procedure.ts',
    'src/spacetime/module_bindings/player_table.ts',
    'src/spacetime/module_bindings/player_v_2_table.ts',
    'src/spacetime/module_bindings/qa_observer_get_realm_attestation_v_2_procedure.ts',
    'src/spacetime/module_bindings/qa_observer_get_realm_snapshot_v_1_procedure.ts',
    'src/spacetime/module_bindings/realm_atlas_v_1_table.ts',
    'src/spacetime/module_bindings/realm_atlas_visible_region_v_1_table.ts',
    'src/spacetime/module_bindings/realm_chat_status_v_1_table.ts',
    'src/spacetime/module_bindings/realm_environment_v_1_table.ts',
    'src/spacetime/module_bindings/realm_forest_instance_v_1_table.ts',
    'src/spacetime/module_bindings/realm_forest_layout_v_1_table.ts',
    'src/spacetime/module_bindings/realm_profile_v_1_table.ts',
    'src/spacetime/module_bindings/realm_v_1_table.ts',
    'src/spacetime/module_bindings/realm_water_body_v_1_table.ts',
    'src/spacetime/module_bindings/realm_water_cell_v_1_table.ts',
    'src/spacetime/module_bindings/realm_water_layout_v_1_table.ts',
    'src/spacetime/module_bindings/realm_water_revision_v_1_table.ts',
    'src/spacetime/module_bindings/realm_worker_system_v_1_table.ts',
    'src/spacetime/module_bindings/realm_worker_system_v_2_table.ts',
    'src/spacetime/module_bindings/recall_all_workers_v_1_reducer.ts',
    'src/spacetime/module_bindings/recall_production_player_canary_worker_v_1_reducer.ts',
    'src/spacetime/module_bindings/recall_worker_v_1_reducer.ts',
    'src/spacetime/module_bindings/report_realm_chat_message_v_1_reducer.ts',
    'src/spacetime/module_bindings/return_legacy_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/send_realm_chat_message_v_1_reducer.ts',
    'src/spacetime/module_bindings/stone_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/stone_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/stone_site_v_1_table.ts',
    'src/spacetime/module_bindings/types.ts',
    'src/spacetime/module_bindings/types/procedures.ts',
    'src/spacetime/module_bindings/types/reducers.ts',
    'src/spacetime/module_bindings/wood_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/wood_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/wood_site_v_1_table.ts',
    'src/spacetime/module_bindings/worker_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/world_tile_meta_v_1_table.ts',
    'src/spacetime/module_bindings/world_tile_table.ts',
    'src/spacetime/playerModuleBindings.ts',
    'src/spacetime/publicRealmProjectionPolicy.ts',
    'src/spacetime/realmChatPresentation.ts',
    'src/spacetime/warpkeepBackendTypes.ts',
    'src/spacetime/warpkeepConfig.ts',
    'src/spacetime/warpkeepConnection.ts',
    'src/spacetime/warpkeepProtocol.ts',
    'src/spacetime/workerCommandIdempotency.ts',
    'src/spacetime/workerPrivateSync.ts',
    'src/styles/global.css',
    'vite.config.ts',
  ]);

export class AuthBridgeNotificationPreparedDeployClosureError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthBridgeNotificationPreparedDeployClosureError';
    this.code = code;
  }
}

function fail(code) {
  throw new AuthBridgeNotificationPreparedDeployClosureError(code);
}

function exactKeys(value, keys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value)) === JSON.stringify(keys);
}

function canonicalRepository(repositoryRoot) {
  if (typeof repositoryRoot !== 'string' || !isAbsolute(repositoryRoot)) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  }
  let repository;
  let status;
  try {
    repository = realpathSync(resolve(repositoryRoot));
    status = lstatSync(resolve(repositoryRoot));
  } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  }
  if (
    repository !== resolve(repositoryRoot)
    || status.isSymbolicLink()
    || !status.isDirectory()
    || typeof process.getuid !== 'function'
    || status.uid !== process.getuid()
    || (status.mode & 0o022) !== 0
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_REPOSITORY_INVALID');
  return repository;
}

function canonicalMemberPath(repository, memberPath, code) {
  if (
    typeof memberPath !== 'string'
    || !MEMBER_PATH.test(memberPath)
    || (memberPath.startsWith('spacetimedb/ptr/')
      && !PTR_GENERATED_BINDING_MEMBER_PATHS.has(memberPath))
    || memberPath.includes('//')
    || memberPath.split('/').some(part => part === '.' || part === '..')
  ) fail(code);
  const requested = resolve(repository, memberPath);
  let canonical;
  let status;
  try {
    canonical = realpathSync(requested);
    status = lstatSync(requested);
  } catch {
    fail(code);
  }
  const difference = relative(repository, canonical);
  if (
    canonical !== requested
    || difference === ''
    || difference === '..'
    || difference.startsWith(`..${sep}`)
    || isAbsolute(difference)
    || status.isSymbolicLink()
    || !status.isFile()
    || status.size < 1
    || status.size > MAX_MEMBER_BYTES
  ) fail(code);
  return canonical;
}

function readMember(repository, memberPath, code) {
  const path = canonicalMemberPath(repository, memberPath, code);
  let descriptor;
  let body;
  try {
    descriptor = openSync(
      path,
      fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW,
    );
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.uid !== process.getuid()
      || (before.mode & 0o022) !== 0
      || before.nlink !== 1
      || before.size < 1
      || before.size > MAX_MEMBER_BYTES
    ) fail(code);
    body = Buffer.allocUnsafe(before.size);
    let offset = 0;
    while (offset < body.byteLength) {
      const count = readSync(
        descriptor,
        body,
        offset,
        body.byteLength - offset,
        offset,
      );
      if (count < 1) fail(code);
      offset += count;
    }
    const after = fstatSync(descriptor);
    const pathAfter = lstatSync(path);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.mode !== after.mode
      || before.nlink !== after.nlink
      || before.uid !== after.uid
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || before.dev !== pathAfter.dev
      || before.ino !== pathAfter.ino
      || before.mode !== pathAfter.mode
      || before.nlink !== pathAfter.nlink
      || before.uid !== pathAfter.uid
      || before.size !== pathAfter.size
      || before.mtimeMs !== pathAfter.mtimeMs
      || before.ctimeMs !== pathAfter.ctimeMs
      || pathAfter.isSymbolicLink()
    ) fail(code);
    return body;
  } catch (error) {
    if (body !== undefined) body.fill(0);
    if (error instanceof AuthBridgeNotificationPreparedDeployClosureError) {
      throw error;
    }
    fail(code);
  } finally {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the primary failure. */ }
    }
  }
}

function parseManifest(body) {
  if (body.byteLength < 2 || body.byteLength > MAX_MANIFEST_BYTES) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
  }
  let source;
  let value;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    value = JSON.parse(source);
  } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
  }
  if (
    !exactKeys(value, MANIFEST_KEYS)
    || value.schemaVersion !== 2
    || value.profile !== AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE
    || !Array.isArray(value.members)
    || value.members.length < 1
    || value.members.length > MAX_MEMBERS
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
  let previous = '';
  for (const member of value.members) {
    if (
      !exactKeys(member, MEMBER_KEYS)
      || !MEMBER_PATH.test(member.path ?? '')
      || member.digestProfile !== expectedMemberDigestProfile(member.path)
      || !SHA256_HEX.test(member.sha256 ?? '')
      || member.path <= previous
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
    previous = member.path;
  }
  const canonical = `${JSON.stringify(value, null, 2)}\n`;
  if (canonical !== source) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_NOT_CANONICAL');
  }
  return value;
}

function manifestMemberSetMatchesExpected(manifest) {
  return JSON.stringify(manifest.members.map(member => member.path))
    === JSON.stringify(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS);
}

function sha256Body(body) {
  return createHash('sha256').update(body).digest('hex');
}

function moduleSourceBody(source) {
  if (typeof source === 'string') return Buffer.from(source, 'utf8');
  if (source instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(source));
  }
  if (ArrayBuffer.isView(source)) {
    return Buffer.from(new Uint8Array(
      source.buffer,
      source.byteOffset,
      source.byteLength,
    ));
  }
  fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_SOURCE_INVALID');
}

function ensureAttestedModuleLoadHook() {
  if (attestedModuleLoadHookRegistered) return;
  registerHooks({
    load(url, context, nextLoad) {
      const result = nextLoad(url, context);
      const active = activeAttestedModuleLoad;
      if (active === undefined) return result;
      if (url.startsWith('node:')) return result;
      let moduleUrl;
      let memberPath;
      try {
        moduleUrl = new URL(url);
        if (
          moduleUrl.protocol !== 'file:'
          || moduleUrl.search !== ''
          || moduleUrl.hash !== ''
        ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_PATH_INVALID');
        const modulePath = fileURLToPath(moduleUrl);
        const difference = relative(active.repositoryRoot, modulePath);
        if (
          difference === ''
          || difference === '..'
          || difference.startsWith(`..${sep}`)
          || isAbsolute(difference)
        ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_PATH_INVALID');
        memberPath = difference.split(sep).join('/');
      } catch (error) {
        if (error instanceof AuthBridgeNotificationPreparedDeployClosureError) {
          throw error;
        }
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_PATH_INVALID');
      }
      const expectedDigest = active.rawMemberDigests.get(memberPath);
      if (expectedDigest === undefined || result.format !== 'module') {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_UNATTESTED');
      }
      const body = moduleSourceBody(result.source);
      if (sha256Body(body) !== expectedDigest) {
        body.fill(0);
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_DIGEST_MISMATCH');
      }
      active.observedMemberPaths.add(memberPath);
      return { ...result, source: body };
    },
  });
  attestedModuleLoadHookRegistered = true;
}

function reviewedReleaseSource(body) {
  try {
    const source = new TextDecoder('utf-8', { fatal: true }).decode(body);
    if (Buffer.byteLength(source, 'utf8') !== body.byteLength) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
    }
    return source;
  } catch (error) {
    if (error instanceof AuthBridgeNotificationPreparedDeployClosureError) {
      throw error;
    }
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
}

function projectReviewedReleaseSource(body, pattern, canonicalMatch, inspect) {
  const source = reviewedReleaseSource(body);
  const matches = [...source.matchAll(pattern)];
  if (matches.length !== 1 || matches[0].index === undefined) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
  const match = matches[0];
  const state = inspect(match.slice(1));
  return Object.freeze({
    body: Buffer.from(
      source.slice(0, match.index)
        + canonicalMatch
        + source.slice(match.index + match[0].length),
      'utf8',
    ),
    state,
  });
}

function booleanState(values) {
  if (values.some(value => value !== 'true' && value !== 'false')) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
  return values.map(value => value === 'true' ? 'T' : 'F').join('');
}

function bindingState(values) {
  const nulls = values.filter(value => value === 'null').length;
  if (nulls === values.length) return 'N';
  if (nulls === 0) return 'P';
  fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
}

function projectSealedLaunchBinding(body) {
  const source = reviewedReleaseSource(body);
  let value;
  try { value = JSON.parse(source); } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || `${JSON.stringify(value, null, 2)}\n` !== source
    || value.schemaVersion !== 1
    || value.profile !== 'warpkeep-0.4.0-sealed-launch-v1'
    || typeof value.pagesDeploymentApproved !== 'boolean'
    || value.g002PresentationEnabled !== false
    || typeof value.ptrPresentationEnabled !== 'boolean'
    || value.legacyGreaterRealmClientPresentationEnabled !== false
    || value.legacyGreaterRealmServerPresentationEnabled !== false
    || value.admissionNotificationsEnabled !== false
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  const keys = Object.keys(value);
  const firstOperational = keys.indexOf('preparationSourceCommit');
  const lastOperational = keys.indexOf('ptrAccessRequestSurfacePresent');
  if (
    firstOperational !== 3
    || lastOperational <= firstOperational
    || keys[lastOperational + 1] !== 'g002PresentationEnabled'
    || keys[lastOperational + 2] !== 'ptrPresentationEnabled'
    || keys.at(-5) !== 'g002PresentationEnabled'
    || keys.at(-4) !== 'ptrPresentationEnabled'
    || keys.at(-3) !== 'legacyGreaterRealmClientPresentationEnabled'
    || keys.at(-2) !== 'legacyGreaterRealmServerPresentationEnabled'
    || keys.at(-1) !== 'admissionNotificationsEnabled'
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  const operationalKeys = keys.slice(firstOperational, lastOperational + 1);
  const nulls = operationalKeys.filter(key => value[key] === null).length;
  const state = value.pagesDeploymentApproved === false
    && value.ptrPresentationEnabled === false
    && nulls === operationalKeys.length
    ? 'N'
    : value.pagesDeploymentApproved === true
      && value.ptrPresentationEnabled === true
      && nulls === 0
      ? 'P'
      : undefined;
  if (state === undefined) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
  const canonical = { ...value, pagesDeploymentApproved: false };
  for (const key of operationalKeys) canonical[key] = null;
  canonical.ptrPresentationEnabled = false;
  return Object.freeze({
    body: Buffer.from(`${JSON.stringify(canonical, null, 2)}\n`, 'utf8'),
    state,
  });
}

function exactClientReleaseState(values, inertValue, activeValue) {
  if (values.length < 1 || values.some(value => value !== values[0])) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
  }
  if (values[0] === inertValue) return INERT_CLIENT_RELEASE_STATE;
  if (values[0] === activeValue) return ACTIVE_CLIENT_RELEASE_STATE;
  fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID');
}

function canonicalReviewedReleaseMemberBodies(memberBodies) {
  const body = role => {
    const member = memberBodies.get(REVIEWED_RELEASE_SOURCE_PATHS[role]);
    if (member === undefined) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
    }
    return member;
  };
  const projected = new Map();
  const record = (role, projection) => {
    projected.set(REVIEWED_RELEASE_SOURCE_PATHS[role], projection.body);
    return projection.state;
  };

  try {
  const packageIdentity = record('package', projectReviewedReleaseSource(
    body('package'),
    /^  "version": "(0\.3\.43|0\.4\.0)",$/gmu,
    `  "version": "${INERT_CLIENT_RELEASE_VERSION}",`,
    values => exactClientReleaseState(
      values,
      INERT_CLIENT_RELEASE_VERSION,
      ACTIVE_CLIENT_RELEASE_VERSION,
    ),
  ));
  const packageLockIdentity = record(
    'packageLock',
    projectReviewedReleaseSource(
      body('packageLock'),
      /^\{\n  "name": "warpkeep",\n  "version": "(0\.3\.43|0\.4\.0)",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": \{\n    "": \{\n      "name": "warpkeep",\n      "version": "(0\.3\.43|0\.4\.0)",$/gmu,
      '{\n'
        + '  "name": "warpkeep",\n'
        + `  "version": "${INERT_CLIENT_RELEASE_VERSION}",\n`
        + '  "lockfileVersion": 3,\n'
        + '  "requires": true,\n'
        + '  "packages": {\n'
        + '    "": {\n'
        + '      "name": "warpkeep",\n'
        + `      "version": "${INERT_CLIENT_RELEASE_VERSION}",`,
      values => exactClientReleaseState(
        values,
        INERT_CLIENT_RELEASE_VERSION,
        ACTIVE_CLIENT_RELEASE_VERSION,
      ),
    ),
  );
  const farcasterContractIdentity = record(
    'farcasterContract',
    projectReviewedReleaseSource(
      body('farcasterContract'),
      /^  description:\n    '(Command four Workers, gather resources and return to a permanent keep in Genesis 001\. Invite-only Alpha\.|Explore a six-region world foundation\. The core gameplay loop remains incomplete; invite-only Alpha\.)',$/gmu,
      '  description:\n'
        + `    '${INERT_FARCASTER_DESCRIPTION}',`,
      values => values.length === 1 && values[0] === INERT_FARCASTER_DESCRIPTION
        ? INERT_CLIENT_RELEASE_STATE
        : fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID'),
    ),
  );
  const farcasterManifestIdentity = record(
    'farcasterManifest',
    projectReviewedReleaseSource(
      body('farcasterManifest'),
      /^    "description": "(Command four Workers, gather resources and return to a permanent keep in Genesis 001\. Invite-only Alpha\.|Explore a six-region world foundation\. The core gameplay loop remains incomplete; invite-only Alpha\.)",$/gmu,
      `    "description": "${INERT_FARCASTER_DESCRIPTION}",`,
      values => values.length === 1 && values[0] === INERT_FARCASTER_DESCRIPTION
        ? INERT_CLIENT_RELEASE_STATE
        : fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_SOURCE_INVALID'),
    ),
  );

  const modulePolicy = record('modulePolicy', projectReviewedReleaseSource(
    body('modulePolicy'),
    /^export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = (false|true);\nexport const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = (false|true);$/gmu,
    'export const GREATER_REALM_V17_IMPORT_MUTATIONS_ALLOWED = false;\n'
      + 'export const GREATER_REALM_V17_ACTIVATION_MUTATIONS_ALLOWED = false;',
    values => {
      const state = booleanState(values);
      if (state === 'TT') {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
      }
      return state;
    },
  ));

  const publisher = record('publisher', projectReviewedReleaseSource(
    body('publisher'),
    /^export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object\.freeze\(\{\n  entryAgreementApproved: (false|true),\n  additivePublishApproved: (false|true),\n  importForwardFixApproved: (false|true),\n  activationForwardFixApproved: (false|true),\n  clientActivationApproved: (false|true),\n  admissionNotificationsApproved: (false|true),\n\} as const\);$/gmu,
    'export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({\n'
      + '  entryAgreementApproved: false,\n'
      + '  additivePublishApproved: false,\n'
      + '  importForwardFixApproved: false,\n'
      + '  activationForwardFixApproved: false,\n'
      + '  clientActivationApproved: false,\n'
      + '  admissionNotificationsApproved: false,\n'
      + '} as const);',
    values => {
      const state = booleanState(values);
      if (state.slice(4) !== 'FF') {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
      }
      const upstream = state.slice(0, 4);
      if (!['FFFF', 'TTFF', 'TTTF', 'TTFT'].includes(upstream)) {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
      }
      return upstream;
    },
  ));

  const downstream = record('downstream', projectReviewedReleaseSource(
    body('downstream'),
    /^export const GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS = Object\.freeze\(\{\n  clientActivationApproved: (false|true),\n  admissionNotificationsApproved: (false|true),\n\} as const\);$/gmu,
    'export const GREATER_REALM_DOWNSTREAM_RELEASE_FLAGS = Object.freeze({\n'
      + '  clientActivationApproved: false,\n'
      + '  admissionNotificationsApproved: false,\n'
      + '} as const);',
    values => {
      const state = booleanState(values);
      if (!['FF', 'FT', 'TT'].includes(state)) {
        fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
      }
      return state;
    },
  ));

  const clientPresentation = record(
    'clientPresentation',
    projectReviewedReleaseSource(
      body('clientPresentation'),
      /^export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = (false|true) as const;$/gmu,
      'export const GREATER_REALM_CLIENT_PRESENTATION_ALLOWED = false as const;',
      booleanState,
    ),
  );
  const serverPresentation = record(
    'serverPresentation',
    projectReviewedReleaseSource(
      body('serverPresentation'),
      /^export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = (false|true) as const;$/gmu,
      'export const GREATER_REALM_SERVER_PRESENTATION_ALLOWED = false as const;',
      booleanState,
    ),
  );
  const presentation = `${clientPresentation}${serverPresentation}`;

  const pages = record('pages', projectReviewedReleaseSource(
    body('pages'),
    /^      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: '(false|true)'$/gmu,
    "      VITE_WARPKEEP_ADMISSION_NOTIFICATIONS_ENABLED: 'false'",
    values => booleanState(values) === 'T' ? '1' : '0',
  ));
  const hermes = record('hermes', projectReviewedReleaseSource(
    body('hermes'),
    /^export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = (false|true) as const;$/gmu,
    'export const FOUNDER_ADMISSION_NOTIFICATION_DELIVERY_APPROVED = false as const;',
    values => booleanState(values) === 'T' ? '1' : '0',
  ));

  const preparedBinding = record(
    'preparedBinding',
    projectReviewedReleaseSource(
      body('preparedBinding'),
      /^export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPreparedReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPreparedBridgeSourceCommit: (null|'[a-f0-9]{40}'),\n\}\);$/gmu,
      'export const AUTH_BRIDGE_NOTIFICATION_PREPARED_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPreparedReceiptDigest: null,\n'
        + '  notificationPreparedBridgeSourceCommit: null,\n'
        + '});',
      bindingState,
    ),
  );
  const privateBinding = record(
    'privateBinding',
    projectReviewedReleaseSource(
      body('privateBinding'),
      /^export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPagesActiveV17EvidenceDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesDeployedModuleReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesExpectedFounderCount: (null|(?:[1-9]|[1-9][0-9]|[1-5][0-9]{2}|600)),\n\}\);$/gmu,
      'export const NOTIFICATION_PAGES_PRIVATE_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPagesActiveV17EvidenceDigest: null,\n'
        + '  notificationPagesDeployedModuleReceiptDigest: null,\n'
        + '  notificationPagesExpectedFounderCount: null,\n'
        + '});',
      bindingState,
    ),
  );
  const liveRootBinding = record(
    'liveRootBinding',
    projectReviewedReleaseSource(
      body('liveRootBinding'),
      /^export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING = Object\.freeze\(\{\n  notificationPagesLiveRootReceiptDigest: (null|'[a-f0-9]{64}'),\n  notificationPagesLiveRootPagesSourceCommit: (null|'[a-f0-9]{40}'),\n\}\);$/gmu,
      'export const NOTIFICATION_PAGES_LIVE_RELEASE_BINDING = Object.freeze({\n'
        + '  notificationPagesLiveRootReceiptDigest: null,\n'
        + '  notificationPagesLiveRootPagesSourceCommit: null,\n'
        + '});',
      bindingState,
    ),
  );
  const productionPlayerCanaryBinding = record(
    'productionPlayerCanaryBinding',
    projectReviewedReleaseSource(
      body('productionPlayerCanaryBinding'),
      /^export const PRODUCTION_PLAYER_CANARY_RELEASE_BINDING = Object\.freeze\(\{\n  productionPlayerCanaryReceiptDigest: (null|'[a-f0-9]{64}'),\n  productionPlayerCanarySourceCommit: (null|'[a-f0-9]{40}'),\n\}\);$/gmu,
      'export const PRODUCTION_PLAYER_CANARY_RELEASE_BINDING = Object.freeze({\n'
        + '  productionPlayerCanaryReceiptDigest: null,\n'
        + '  productionPlayerCanarySourceCommit: null,\n'
        + '});',
      bindingState,
    ),
  );
  const sealedLaunchBinding = record(
    'sealedLaunchBinding',
    projectSealedLaunchBinding(body('sealedLaunchBinding')),
  );

  const phaseKey = [
    modulePolicy,
    publisher,
    downstream,
    presentation,
    pages,
    hermes,
    `${preparedBinding}${privateBinding}${liveRootBinding}`
      + productionPlayerCanaryBinding,
    sealedLaunchBinding,
  ].join('|');
  const requiredClientReleaseIdentity =
    REVIEWED_RELEASE_PHASE_IDENTITIES.get(phaseKey);
  if (
    requiredClientReleaseIdentity === undefined
    || packageIdentity !== requiredClientReleaseIdentity
    || packageLockIdentity !== requiredClientReleaseIdentity
    || farcasterContractIdentity !== INERT_CLIENT_RELEASE_STATE
    || farcasterManifestIdentity !== INERT_CLIENT_RELEASE_STATE
  ) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_RELEASE_PHASE_INVALID');
  }
  return projected;
  } catch (error) {
    for (const projectedBody of projected.values()) projectedBody.fill(0);
    throw error;
  }
}

function readBootstrapPinValues(repository, manifestSha256) {
  const values = new Map();
  for (const binding of BOOTSTRAP_PIN_BINDINGS) {
    if (binding.path === AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH) {
      values.set(binding.name, manifestSha256);
      continue;
    }
    const body = readMember(
      repository,
      binding.path,
      'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID',
    );
    try { values.set(binding.name, sha256Body(body)); } finally { body.fill(0); }
  }
  return values;
}

function canonicalPinnedWorkflowBody(memberPath, body, expectedPins) {
  let source;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(body); } catch {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
  }
  const workflow = BOOTSTRAP_PINNED_WORKFLOWS.get(memberPath);
  if (workflow === undefined) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
  }
  let canonical = source;
  for (const binding of BOOTSTRAP_PIN_BINDINGS) {
    const definitionPattern = new RegExp(
      `^\\s*${binding.name}\\s*:`,
      'gmu',
    );
    const expectedHere = workflow.bindings.includes(binding);
    const exactPattern = new RegExp(
      `^${workflow.indentation}${binding.name}: '([a-f0-9]{64})'$`,
      'gmu',
    );
    const definitions = [...source.matchAll(definitionPattern)];
    const exact = [...source.matchAll(exactPattern)];
    if (
      definitions.length !== (expectedHere ? 1 : 0)
      || exact.length !== (expectedHere ? 1 : 0)
      || (expectedHere && exact[0][1] !== expectedPins.get(binding.name))
    ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
    if (!expectedHere) continue;
    canonical = canonical.replace(
      exactPattern,
      `${workflow.indentation}${binding.name}: '${BOOTSTRAP_PIN_CANONICAL_VALUE}'`,
    );
  }
  if (canonical === source) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_BOOTSTRAP_INVALID');
  }
  return Buffer.from(canonical, 'utf8');
}

export function verifyAuthBridgeNotificationPreparedDeployClosure({
  repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
} = {}) {
  const repository = canonicalRepository(repositoryRoot);
  const manifestBody = readMember(
    repository,
    AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MANIFEST_PATH,
    'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID',
  );
  const manifestSha256 = sha256Body(manifestBody);
  let manifest;
  try { manifest = parseManifest(manifestBody); } finally { manifestBody.fill(0); }
  if (
    JSON.stringify(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS)
      !== JSON.stringify(
        [...AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS].sort(),
      )
    || !manifestMemberSetMatchesExpected(manifest)
  ) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_SET_INVALID');
  }
  const expectedPins = readBootstrapPinValues(repository, manifestSha256);
  const releaseMemberBodies = new Map();
  let releaseBodies;
  try {
    for (const memberPath of Object.values(REVIEWED_RELEASE_SOURCE_PATHS)) {
      releaseMemberBodies.set(memberPath, readMember(
        repository,
        memberPath,
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID',
      ));
    }
    releaseBodies = canonicalReviewedReleaseMemberBodies(releaseMemberBodies);
    for (const body of releaseMemberBodies.values()) body.fill(0);
    releaseMemberBodies.clear();
    for (const member of manifest.members) {
      const releaseBody = releaseBodies.get(member.path);
      const body = releaseBody ?? readMember(
        repository,
        member.path,
        'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MEMBER_INVALID',
      );
      let canonicalBody;
      try {
        if (member.digestProfile === RAW_FILE_DIGEST_PROFILE) {
          if (
            releaseBody !== undefined
            || BOOTSTRAP_PINNED_WORKFLOWS.has(member.path)
          ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
          canonicalBody = body;
        } else if (
          member.digestProfile === BOOTSTRAP_PIN_DIGEST_PROFILE
        ) {
          if (
            releaseBody !== undefined
            || !BOOTSTRAP_PINNED_WORKFLOWS.has(member.path)
          ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
          canonicalBody = canonicalPinnedWorkflowBody(
            member.path,
            body,
            expectedPins,
          );
        } else if (
          member.digestProfile
            === REVIEWED_RELEASE_TRANSITION_DIGEST_PROFILE
        ) {
          if (
            releaseBody === undefined
            || BOOTSTRAP_PINNED_WORKFLOWS.has(member.path)
          ) {
            fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
          }
          canonicalBody = body;
        } else if (
          member.digestProfile
            === REVIEWED_RELEASE_TRANSITION_PLUS_BOOTSTRAP_PIN_DIGEST_PROFILE
        ) {
          if (
            releaseBody === undefined
            || !BOOTSTRAP_PINNED_WORKFLOWS.has(member.path)
          ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
          canonicalBody = canonicalPinnedWorkflowBody(
            member.path,
            body,
            expectedPins,
          );
        } else {
          fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MANIFEST_INVALID');
        }
        if (sha256Body(canonicalBody) !== member.sha256) {
          fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_DIGEST_MISMATCH');
        }
      } finally {
        if (canonicalBody !== undefined && canonicalBody !== body) {
          canonicalBody.fill(0);
        }
        if (releaseBody === undefined) body.fill(0);
      }
    }
  } finally {
    for (const body of releaseMemberBodies.values()) body.fill(0);
    if (releaseBodies !== undefined) {
      for (const body of releaseBodies.values()) body.fill(0);
    }
  }
  const authority = Object.freeze({
    profile: AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_PROFILE,
    memberCount: manifest.members.length,
    manifestSha256,
    repositoryRoot: repository,
    ownerUid: process.getuid(),
  });
  authenticatedSourceClosureAuthorities.add(authority);
  authenticatedSourceClosureRawMemberDigests.set(authority, new Map(
    manifest.members
      .filter(member => member.digestProfile === RAW_FILE_DIGEST_PROFILE)
      .map(member => [member.path, member.sha256]),
  ));
  return authority;
}

export function assertAuthBridgeNotificationPreparedDeployClosureAuthority(
  authority,
  { repositoryRoot } = {},
) {
  if (
    !authenticatedSourceClosureAuthorities.has(authority)
    || authority.repositoryRoot !== canonicalRepository(repositoryRoot)
    || authority.ownerUid !== process.getuid()
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_AUTHORITY_INVALID');
  return authority;
}

export async function importAuthBridgeNotificationPreparedAttestedModules({
  authority,
  repositoryRoot,
  memberPaths,
} = {}) {
  const authenticated = assertAuthBridgeNotificationPreparedDeployClosureAuthority(
    authority,
    { repositoryRoot },
  );
  const rawMemberDigests =
    authenticatedSourceClosureRawMemberDigests.get(authenticated);
  if (
    rawMemberDigests === undefined
    || !Array.isArray(memberPaths)
    || memberPaths.length < 1
    || memberPaths.length > 16
    || memberPaths.some(memberPath => (
      typeof memberPath !== 'string'
      || !rawMemberDigests.has(memberPath)
    ))
    || new Set(memberPaths).size !== memberPaths.length
  ) fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_SET_INVALID');
  ensureAttestedModuleLoadHook();
  if (activeAttestedModuleLoad !== undefined) {
    fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_LOAD_BUSY');
  }
  const observedMemberPaths = new Set();
  activeAttestedModuleLoad = {
    repositoryRoot: authenticated.repositoryRoot,
    rawMemberDigests,
    observedMemberPaths,
  };
  try {
    const modules = [];
    for (const memberPath of memberPaths) {
      modules.push(await import(
        pathToFileURL(resolve(authenticated.repositoryRoot, memberPath)).href
      ));
    }
    if (memberPaths.some(memberPath => !observedMemberPaths.has(memberPath))) {
      fail('AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_MODULE_NOT_LOADED');
    }
    return Object.freeze(modules);
  } finally {
    activeAttestedModuleLoad = undefined;
  }
}

export const authBridgeNotificationPreparedDeployClosureTestSeams =
  process.env.NODE_ENV === 'test' && process.env.VITEST === 'true'
    ? Object.freeze({
        expectedMemberDigestProfile,
        manifestMemberSetMatchesExpected,
        parseManifest,
      })
    : undefined;

function main() {
  const closure = verifyAuthBridgeNotificationPreparedDeployClosure();
  process.stdout.write(
    `auth bridge notification prepared deploy closure: ${closure.memberCount} members verified\n`,
  );
}

if (
  process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try { main(); } catch (error) {
    process.stderr.write(`${
      error instanceof AuthBridgeNotificationPreparedDeployClosureError
        ? error.code
        : 'AUTH_BRIDGE_PREPARED_DEPLOY_CLOSURE_FAILED'
    }\n`);
    process.exitCode = 1;
  }
}
