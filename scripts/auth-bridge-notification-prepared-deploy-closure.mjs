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

const MEMBER_PATH = /^(?:package(?:-lock)?\.json|public\/\.well-known\/farcaster\.json|(?:\.github\/workflows|scripts|services\/auth-bridge|spacetimedb\/src|src)\/[A-Za-z0-9._/-]+)$/u;
const SHA256_HEX = /^[a-f0-9]{64}$/u;
const MAX_MANIFEST_BYTES = 192 * 1_024;
const MAX_MEMBER_BYTES = 4 * 1_024 * 1_024;
const MAX_MEMBERS = 384;
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
});

const INERT_CLIENT_RELEASE_VERSION = '0.3.43';
const ACTIVE_CLIENT_RELEASE_VERSION = '0.3.44';
const INERT_FARCASTER_DESCRIPTION =
  'Command four Workers, gather resources and return to a permanent keep in Genesis 001. Invite-only Alpha.';
const ACTIVE_FARCASTER_DESCRIPTION =
  'Explore a six-region world foundation. The core gameplay loop remains incomplete; invite-only Alpha.';
const INERT_CLIENT_RELEASE_STATE = 'I';
const ACTIVE_CLIENT_RELEASE_STATE = 'A';

const REVIEWED_RELEASE_SOURCE_PATH_SET =
  new Set(Object.values(REVIEWED_RELEASE_SOURCE_PATHS));

const REVIEWED_RELEASE_PHASE_IDENTITIES = new Map([
  // Production-approved pre-generation.
  ['FF|FFFF|FF|FF|0|0|NNN', INERT_CLIENT_RELEASE_STATE],
  // Candidate-approved inert append.
  ['FF|TTFF|FF|FF|0|0|NNN', INERT_CLIENT_RELEASE_STATE],
  // Import-only forward fix.
  ['TF|TTTF|FF|FF|0|0|NNN', INERT_CLIENT_RELEASE_STATE],
  // Activation-only forward fix.
  ['FT|TTFT|FF|FF|0|0|NNN', INERT_CLIENT_RELEASE_STATE],
  // Client and server presentation are approved together after active proof.
  ['FT|TTFT|TF|TT|0|0|NNN', ACTIVE_CLIENT_RELEASE_STATE],
  // Generation-zero notification Pages activation.
  ['FT|TTFT|TT|TT|1|0|PPN', ACTIVE_CLIENT_RELEASE_STATE],
  // Durable Pages root installed while Hermes remains inert.
  ['FT|TTFT|TT|TT|1|0|NNP', ACTIVE_CLIENT_RELEASE_STATE],
  // Final notification delivery approval.
  ['FT|TTFT|TT|TT|1|1|NNP', ACTIVE_CLIENT_RELEASE_STATE],
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
    '.github/workflows/notification-bridge-prepared.yml',
    '.github/workflows/verify.yml',
    'package-lock.json',
    'package.json',
    'public/.well-known/farcaster.json',
    'scripts/access-requests/reset-plan.ts',
    'scripts/admission-notifications/recovery-plan.ts',
    'scripts/alpha-activation-controls.ts',
    'scripts/alpha-v10-activation-controls.ts',
    'scripts/auth-bridge-config-attestation.d.mts',
    'scripts/auth-bridge-config-attestation.mjs',
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
    'scripts/entry-agreement-policy.d.mts',
    'scripts/entry-agreement-policy.mjs',
    'scripts/farcaster-miniapp-contract.mjs',
    'scripts/founder-admission-authority.ts',
    'scripts/greater-realm-downstream-release-policy.ts',
    'scripts/greater-realm-production-bootstrap.mjs',
    'scripts/greater-realm-production-publisher-core.ts',
    'scripts/greater-realm-release-gate-deploy-boundary.d.mts',
    'scripts/greater-realm-release-gate-deploy-boundary.mjs',
    'scripts/hermes-admin.ts',
    'scripts/hermes-machine-output.ts',
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
    'scripts/production-admin-token-budget.d.mts',
    'scripts/production-admin-token-budget.mjs',
    'scripts/profiles/farcaster-profile-policy.ts',
    'scripts/profiles/founder-admission-plan.ts',
    'scripts/profiles/profile-transport.ts',
    'scripts/validate-pages-deploy-config.mjs',
    'scripts/verify-alpha-production.mjs',
    'scripts/verify-auth-bridge-notification-prepared-policy.d.mts',
    'scripts/verify-auth-bridge-notification-prepared-policy.mjs',
    'scripts/verify-greater-realm-release-gates.d.mts',
    'scripts/verify-greater-realm-release-gates.mjs',
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
    'spacetimedb/src/alphaActivationPolicy.ts',
    'spacetimedb/src/alphaV10ActivationPolicy.ts',
    'spacetimedb/src/castleWorkerPolicy.ts',
    'spacetimedb/src/config.ts',
    'spacetimedb/src/entryAgreementPolicy.ts',
    'spacetimedb/src/foodExpeditionPolicy.ts',
    'spacetimedb/src/foodSitePolicy.ts',
    'spacetimedb/src/forestLayoutContract.ts',
    'spacetimedb/src/forestLayoutPolicy.ts',
    'spacetimedb/src/goldExpeditionPolicy.ts',
    'spacetimedb/src/goldSitePolicy.ts',
    'spacetimedb/src/greaterRealmV17Policy.ts',
    'spacetimedb/src/lowlandsSurface.ts',
    'spacetimedb/src/profileAuthorityPolicy.ts',
    'spacetimedb/src/resourceAuthorityPolicy.ts',
    'spacetimedb/src/resourceSitePlacementPolicy.ts',
    'spacetimedb/src/stoneExpeditionPolicy.ts',
    'spacetimedb/src/stoneSitePolicy.ts',
    'spacetimedb/src/waterWorld.ts',
    'spacetimedb/src/woodExpeditionPolicy.ts',
    'spacetimedb/src/woodSitePolicy.ts',
    'spacetimedb/src/world.ts',
    'src/greater-realm/greaterRealmTransport.ts',
    'src/security/publicImageUrl.ts',
    'src/spacetime/greaterRealmProviderBridge.ts',
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
    'src/spacetime/module_bindings/admin_plan_worker_roster_v_1_procedure.ts',
    'src/spacetime/module_bindings/admin_prepare_greater_realm_activation_v_1_reducer.ts',
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
    'src/spacetime/module_bindings/recall_worker_v_1_reducer.ts',
    'src/spacetime/module_bindings/report_realm_chat_message_v_1_reducer.ts',
    'src/spacetime/module_bindings/return_legacy_expedition_v_1_reducer.ts',
    'src/spacetime/module_bindings/send_realm_chat_message_v_1_reducer.ts',
    'src/spacetime/module_bindings/stone_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/stone_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/stone_site_v_1_table.ts',
    'src/spacetime/module_bindings/types.ts',
    'src/spacetime/module_bindings/wood_expedition_schedule_v_1_table.ts',
    'src/spacetime/module_bindings/wood_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/wood_site_v_1_table.ts',
    'src/spacetime/module_bindings/worker_node_occupation_v_1_table.ts',
    'src/spacetime/module_bindings/world_tile_meta_v_1_table.ts',
    'src/spacetime/module_bindings/world_tile_table.ts',
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

function sha256Body(body) {
  return createHash('sha256').update(body).digest('hex');
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
    /^  "version": "(0\.3\.43|0\.3\.44)",$/gmu,
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
      /^\{\n  "name": "warpkeep",\n  "version": "(0\.3\.43|0\.3\.44)",\n  "lockfileVersion": 3,\n  "requires": true,\n  "packages": \{\n    "": \{\n      "name": "warpkeep",\n      "version": "(0\.3\.43|0\.3\.44)",$/gmu,
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
      values => exactClientReleaseState(
        values,
        INERT_FARCASTER_DESCRIPTION,
        ACTIVE_FARCASTER_DESCRIPTION,
      ),
    ),
  );
  const farcasterManifestIdentity = record(
    'farcasterManifest',
    projectReviewedReleaseSource(
      body('farcasterManifest'),
      /^    "description": "(Command four Workers, gather resources and return to a permanent keep in Genesis 001\. Invite-only Alpha\.|Explore a six-region world foundation\. The core gameplay loop remains incomplete; invite-only Alpha\.)",$/gmu,
      `    "description": "${INERT_FARCASTER_DESCRIPTION}",`,
      values => exactClientReleaseState(
        values,
        INERT_FARCASTER_DESCRIPTION,
        ACTIVE_FARCASTER_DESCRIPTION,
      ),
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
      if (!['FF', 'TF', 'TT'].includes(state)) {
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

  const phaseKey = [
    modulePolicy,
    publisher,
    downstream,
    presentation,
    pages,
    hermes,
    `${preparedBinding}${privateBinding}${liveRootBinding}`,
  ].join('|');
  const requiredClientReleaseIdentity =
    REVIEWED_RELEASE_PHASE_IDENTITIES.get(phaseKey);
  if (
    requiredClientReleaseIdentity === undefined
    || [
      packageIdentity,
      packageLockIdentity,
      farcasterContractIdentity,
      farcasterManifestIdentity,
    ].some(identity => identity !== requiredClientReleaseIdentity)
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
  const manifestPaths = manifest.members.map(member => member.path);
  if (
    JSON.stringify(AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS)
      !== JSON.stringify(
        [...AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS].sort(),
      )
    || JSON.stringify(manifestPaths)
      !== JSON.stringify(
        AUTH_BRIDGE_NOTIFICATION_PREPARED_DEPLOY_CLOSURE_MEMBER_PATHS,
      )
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
