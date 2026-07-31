import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  constants,
  chmodSync,
  closeSync,
  fchmodSync,
  fstatSync,
  fsyncSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  PROTECTED_AGGREGATE_STAGE,
  protectedAggregateChildArguments,
  resourceV4AggregateChildArguments,
  verifyExpectedAlphaV3Aggregate,
  verifyExpectedAlphaV4ResourcePrebackfillAggregate,
  verifyExpectedAlphaV4ResourceReadyAggregate,
} from './verify-alpha-production.mjs';
import {
  ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS,
  parseAdditiveMigrationProofReceipt,
} from './spacetime-additive-migration-proof.mjs';
import {
  canonicalTableSchemaBoundaryDigest,
} from './spacetime-table-schema-attestation.mjs';
import {
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM,
} from './entry-agreement-policy.mjs';
import {
  attestPinnedSpacetimeCli,
  verifyPinnedCliAttestation,
} from './spacetime-cli-attestation.mjs';
import {
  defaultSpacetimePublishReceiptDirectory,
  writePrivateSpacetimePublishSuccessReceipt,
} from './spacetime-publish-receipt.mjs';

export {
  attestPinnedSpacetimeCli,
  verifyPinnedCliAttestation,
};

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CANONICAL_DATABASE = 'warpkeep';
const CANONICAL_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const CANONICAL_MAINCLOUD_URI = 'https://maincloud.spacetimedb.com';
const CANONICAL_BRIDGE = 'https://auth.warpkeep.com';
const PROVEN_ARTIFACT_PATH = resolve(repositoryRoot, 'spacetimedb', 'dist', 'bundle.js');
const database = process.env.WARPKEEP_SPACETIMEDB_DATABASE || CANONICAL_DATABASE;
const configuredIssuer = process.env.WARPKEEP_OIDC_ISSUER;
const sourceConfigPath = join(repositoryRoot, 'spacetimedb', 'src', 'config.ts');
const command = process.env.SPACETIME_BIN || 'spacetime';
const MAX_CHILD_OUTPUT_BYTES = 1_000_000;
const PREFLIGHT_TIMEOUT_MILLISECONDS = 3 * 60 * 1_000;
const MAX_OIDC_DOCUMENT_BYTES = 64 * 1_024;
const OIDC_REQUEST_TIMEOUT_MILLISECONDS = 10_000;
const PUBLISH_TIMEOUT_MILLISECONDS = 2 * 60 * 1_000;
const PUBLISH_KILL_GRACE_MILLISECONDS = 5_000;
// A P-256 coordinate is exactly 32 bytes. The final base64url character must
// have zero padding bits, preventing alternate encodings of the same point.
const JWK_COORDINATE = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const JWK_KEY_ID = /^[A-Za-z0-9._-]{1,128}$/;
const PUBLISH_CHILD_ENVIRONMENT_KEYS = Object.freeze([
  'PATH', 'HOME', 'USER', 'LOGNAME', 'TMPDIR', 'TMP', 'TEMP',
  'XDG_CONFIG_HOME', 'XDG_DATA_HOME',
  'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'SYSTEMROOT', 'COMSPEC', 'PATHEXT',
]);
const MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER =
  WARPKEEP_ENTRY_AGREEMENT_ACCEPTANCE_RECORDS_PER_FID_MAXIMUM;
const MAX_ENTRY_AGREEMENT_ACCEPTANCE_COUNT =
  100 * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER;
const SHA256_DIGEST = /^[0-9a-f]{64}$/;

export const RESOURCE_PUBLISH_ROLLOUT_STAGE = Object.freeze({
  PREBACKFILL: 'prebackfill',
  READY: 'ready',
});
export const GENESIS_WORLD_PUBLISH_STAGE = Object.freeze({
  PRE_EXPANSION: 'pre-expansion',
  EXPANDED: 'expanded',
});
export const WORKER_PUBLISH_ROLLOUT_STAGE = Object.freeze({
  EMPTY: 'empty',
  ACTIVE: 'active',
});
export const WORKER_MODULE_PREDECESSOR = Object.freeze({
  V11: 'v11',
  EXACT_V12_EMPTY: 'exact-v12-empty',
  EXACT_V12_ACTIVE: 'exact-v12-active',
  EXACT_V13_ACTIVE: 'exact-v13-active',
});
export const WORKER_FORWARD_REPAIR = Object.freeze({
  NONE: 'none',
  RETURN_NODE_REUSE_V1: 'return-node-reuse-v1',
});
export const WORKER_FORWARD_REPAIR_CHECKPOINT = Object.freeze({
  HEALTHY: 'healthy',
  ACTIVE_PREDECESSOR: 'active-predecessor',
  CANDIDATE_PENDING: 'candidate-pending',
  CANDIDATE_EXISTING: 'candidate-existing',
});

export const PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS = Object.freeze({
  allowed_fid: 0,
  world_tile: 1,
  player: 2,
  castle: 3,
  admin_audit: 4,
  player_v2: 5,
  player_ownership_v2: 6,
  realm_v1: 7,
  world_tile_meta_v1: 8,
  castle_slot_v1: 9,
  castle_slot_claim_v1: 10,
  realm_profile_v1: 11,
  mark_account_v1: 12,
  snap_burn_credit_v1: 13,
  fid_wallet_attribution_v1: 14,
  wallet_attribution_snapshot_v1: 15,
  snap_scan_cursor_v1: 16,
  snap_scan_batch_v1: 17,
  alpha_terms_acceptance_v1: 18,
  resource_account_v1: 19,
  gold_site_v1: 20,
  gold_node_occupation_v1: 21,
  gold_expedition_v1: 22,
  gold_expedition_idempotency_v1: 23,
  gold_expedition_schedule_v_1: 24,
  realm_forest_layout_v1: 25,
  realm_forest_instance_v1: 26,
  food_site_v1: 27,
  food_node_occupation_v1: 28,
  food_expedition_v1: 29,
  food_expedition_idempotency_v1: 30,
  food_expedition_schedule_v_1: 31,
  wood_site_v1: 32,
  wood_node_occupation_v1: 33,
  wood_expedition_v1: 34,
  wood_expedition_idempotency_v1: 35,
  wood_expedition_schedule_v_1: 36,
  realm_water_layout_v1: 37,
  realm_water_body_v1: 38,
  realm_water_cell_v1: 39,
  realm_environment_v1: 40,
  stone_site_v1: 41,
  stone_node_occupation_v1: 42,
  stone_expedition_v1: 43,
  stone_expedition_idempotency_v1: 44,
  stone_expedition_schedule_v_1: 45,
  realm_water_revision_v1: 46,
});
export const WORKER_V12_TABLE_CONTRACTS = Object.freeze({
  realm_worker_system_v1: Object.freeze({
    productTypeRef: 47,
    access: 'Public',
    fields: Object.freeze([
      'realm_id', 'policy_version', 'workers_per_castle', 'expected_castle_count',
      'expected_worker_count', 'roster_digest', 'mode', 'legacy_drain_required',
      'created_at', 'activated_at',
    ]),
  }),
  castle_worker_v1: Object.freeze({
    productTypeRef: 48,
    access: 'Public',
    fields: Object.freeze([
      'worker_id', 'origin_castle_id', 'ordinal', 'status', 'resource_kind',
      'site_id', 'started_at_micros', 'arrives_at_micros',
      'gathering_ends_at_micros', 'return_started_at_micros',
      'returns_at_micros', 'route_steps', 'return_start_progress_basis_points',
      'timeline_revision', 'revision',
    ]),
  }),
  worker_assignment_v1: Object.freeze({
    productTypeRef: 49,
    access: 'Private',
    fields: Object.freeze([
      'assignment_id', 'worker_id', 'fid', 'origin_castle_id', 'resource_kind',
      'site_id', 'phase', 'started_at_micros', 'arrives_at_micros',
      'gathering_ends_at_micros', 'return_started_at_micros',
      'returns_at_micros', 'route_steps', 'return_start_progress_basis_points',
      'settled_through_micros', 'accrued_amount', 'materialized_amount',
      'timeline_revision', 'policy_version', 'created_at', 'updated_at',
    ]),
  }),
  worker_node_occupation_v1: Object.freeze({
    productTypeRef: 50,
    access: 'Public',
    fields: Object.freeze([
      'node_key', 'resource_kind', 'site_id', 'worker_id', 'worker_ordinal',
      'origin_castle_id', 'phase', 'started_at_micros', 'arrives_at_micros',
      'gathering_ends_at_micros', 'timeline_revision',
    ]),
  }),
  worker_command_idempotency_v1: Object.freeze({
    productTypeRef: 51,
    access: 'Private',
    fields: Object.freeze([
      'request_key', 'fid', 'worker_id', 'command_kind', 'resource_kind',
      'site_id', 'assignment_id', 'result_revision', 'created_at',
    ]),
  }),
  worker_assignment_schedule_v_1: Object.freeze({
    productTypeRef: 52,
    access: 'Private',
    fields: Object.freeze([
      'schedule_id', 'scheduled_at', 'assignment_id', 'worker_id',
      'timeline_revision', 'stage',
    ]),
  }),
});
export const ACCESS_REQUEST_V13_TABLE_CONTRACTS = Object.freeze({
  access_request_v1: Object.freeze({
    productTypeRef: 53,
    access: 'Private',
    fields: Object.freeze([
      'fid',
      'request_cycle',
      'requested_at',
    ]),
  }),
});

const WORKER_V12_PREDECESSOR_ACTIVATION_FIELDS = Object.freeze([
  ['capability', 'String'],
  ['clientRelease', 'String'],
  ['clientArtifactDigest', 'String'],
  ['sourceCommit', 'String'],
  ['resourceStateVersion', 'U32'],
  ['resourcePolicyVersion', 'String'],
  ['resourceCatalogDigest', 'String'],
  ['expectedCastleCount', 'U32'],
  ['expectedWorkerCount', 'U32'],
  ['rosterDigest', 'String'],
  ['resourceRosterDigest', 'String'],
]);
const WORKER_V12_CANDIDATE_ACTIVATION_FIELDS = Object.freeze([
  ['capability', 'String'],
  ['clientRelease', 'String'],
  ['clientArtifactDigest', 'String'],
  ['moduleArtifactDigest', 'String'],
  ['sourceCommit', 'String'],
  ['resourceStateVersion', 'U32'],
  ['resourcePolicyVersion', 'String'],
  ['resourceCatalogDigest', 'String'],
  ['expectedCastleCount', 'U32'],
  ['expectedWorkerCount', 'U32'],
  ['rosterDigest', 'String'],
  ['resourceRosterDigest', 'String'],
]);
const WORKER_V12_COMPLETE_DRAIN_FIELDS = Object.freeze([
  ['capability', 'String'],
  ['sourceCommit', 'String'],
  ['moduleArtifactDigest', 'String'],
  ['expectedCastleCount', 'U32'],
  ['expectedWorkerCount', 'U32'],
  ['rosterDigest', 'String'],
  ['resourceRosterDigest', 'String'],
  ['resourceCatalogDigest', 'String'],
  ['goldExpeditions', 'U32'],
  ['foodExpeditions', 'U32'],
  ['woodExpeditions', 'U32'],
  ['stoneExpeditions', 'U32'],
  ['goldOccupations', 'U32'],
  ['foodOccupations', 'U32'],
  ['woodOccupations', 'U32'],
  ['stoneOccupations', 'U32'],
  ['goldSchedules', 'U32'],
  ['foodSchedules', 'U32'],
  ['woodSchedules', 'U32'],
  ['stoneSchedules', 'U32'],
]);
const WORKER_V12_RETURN_SCHEDULE_REPAIR_FIELDS = Object.freeze([
  ['capability', 'String'],
  ['sourceCommit', 'String'],
  ['moduleArtifactDigest', 'String'],
  ['expectedCastleCount', 'U32'],
  ['expectedWorkerCount', 'U32'],
  ['expectedAssignments', 'U32'],
  ['expectedOccupations', 'U32'],
  ['expectedSchedules', 'U32'],
  ['expectedReturningWorkers', 'U32'],
  ['expectedMissingSchedules', 'U32'],
  ['rosterDigest', 'String'],
]);
const WORKER_V12_RETURN_LEGACY_FIELDS = Object.freeze([
  ['resourceKind', 'String'],
  ['expeditionId', 'String'],
]);
const WORKER_V12_PREDECESSOR_STATUS_FIELDS = Object.freeze([
  ['phase', 'String'],
  ['system_rows', 'U64'],
  ['system_config_valid', 'Bool'],
  ['expected_castle_count', 'U32'],
  ['expected_worker_count', 'U32'],
  ['actual_castle_count', 'U64'],
  ['actual_worker_count', 'U64'],
  ['roster_digest', 'String'],
  ['expected_roster_digest', 'String'],
  ['malformed_worker_graph_rows', 'U64'],
  ['resource_accounts', 'U64'],
  ['missing_resource_accounts', 'U64'],
  ['orphaned_resource_accounts', 'U64'],
  ['resource_invariant_violations', 'U64'],
  ['resource_roster_digest', 'String'],
  ['canonical_resource_catalog', 'Bool'],
  ['resource_catalog_digest', 'String'],
  ['legacy_expeditions', 'U64'],
  ['legacy_occupations', 'U64'],
  ['legacy_schedules', 'U64'],
  ['generic_assignments', 'U64'],
  ['generic_occupations', 'U64'],
  ['generic_schedules', 'U64'],
  ['generic_command_receipts', 'U64'],
]);
const WORKER_V12_RESOURCE_STATUS_FIELDS = Object.freeze([
  ['legacy_gold_expeditions', 'U64'],
  ['legacy_food_expeditions', 'U64'],
  ['legacy_wood_expeditions', 'U64'],
  ['legacy_stone_expeditions', 'U64'],
  ['legacy_gold_occupations', 'U64'],
  ['legacy_food_occupations', 'U64'],
  ['legacy_wood_occupations', 'U64'],
  ['legacy_stone_occupations', 'U64'],
  ['legacy_gold_schedules', 'U64'],
  ['legacy_food_schedules', 'U64'],
  ['legacy_wood_schedules', 'U64'],
  ['legacy_stone_schedules', 'U64'],
]);
const WORKER_V12_CANDIDATE_STATUS_FIELDS = Object.freeze([
  ...WORKER_V12_PREDECESSOR_STATUS_FIELDS.slice(0, 20),
  ...WORKER_V12_RESOURCE_STATUS_FIELDS,
  ...WORKER_V12_PREDECESSOR_STATUS_FIELDS.slice(20),
]);
const WORKER_V12_SYSTEM_STATUS_FIELDS = Object.freeze([
  ['system_rows', 'U64'],
  ['mode', 'String'],
  ['system_config_valid', 'Bool'],
  ['legacy_drain_required', 'Bool'],
  ['expected_castle_count', 'U64'],
  ['expected_worker_count', 'U64'],
  ['actual_worker_count', 'U64'],
  ['expected_counts_match', 'Bool'],
  ['roster_digest_matches', 'Bool'],
  ['castles_missing_workers', 'U64'],
  ['castles_with_extra_workers', 'U64'],
  ['duplicate_ordinals', 'U64'],
  ['malformed_worker_ids', 'U64'],
  ['invalid_worker_states', 'U64'],
  ['idle_workers', 'U64'],
  ['outbound_workers', 'U64'],
  ['gathering_workers', 'U64'],
  ['returning_workers', 'U64'],
  ['assignments', 'U64'],
  ['occupations', 'U64'],
  ['schedules', 'U64'],
  ['orphan_workers', 'U64'],
  ['orphan_assignments', 'U64'],
  ['assignments_missing_occupation', 'U64'],
  ['assignments_without_single_schedule', 'U64'],
  ['orphan_occupations', 'U64'],
  ['orphan_schedules', 'U64'],
  ['invalid_schedules', 'U64'],
  ['assignment_public_mismatches', 'U64'],
  ['occupation_site_mismatches', 'U64'],
  ['invalid_assignments', 'U64'],
  ['idempotency_receipts', 'U64'],
  ['invalid_idempotency_receipts', 'U64'],
  ['idempotency_overflow_fids', 'U64'],
  ['legacy_expeditions', 'U64'],
  ['legacy_occupations', 'U64'],
  ['legacy_schedules', 'U64'],
  ['roster_digest', 'String'],
  ['roster_digest_expected', 'String'],
]);
const WORKER_V12_ROSTER_PLAN_FIELDS = Object.freeze([
  ['ready', 'Bool'],
  ['activation_blocked_by_legacy_rows', 'Bool'],
  ['mode', 'String'],
  ['system_config_valid', 'Bool'],
  ['legacy_drain_required', 'Bool'],
  ['expected_castle_count', 'U64'],
  ['expected_worker_count', 'U64'],
  ['actual_worker_count', 'U64'],
  ['expected_counts_match', 'Bool'],
  ['roster_digest_matches', 'Bool'],
  ['castles_missing_workers', 'U64'],
  ['castles_with_extra_workers', 'U64'],
  ['orphan_workers', 'U64'],
  ['orphan_assignments', 'U64'],
  ['assignments_missing_occupation', 'U64'],
  ['assignments_without_single_schedule', 'U64'],
  ['orphan_occupations', 'U64'],
  ['orphan_schedules', 'U64'],
  ['invalid_schedules', 'U64'],
  ['assignment_public_mismatches', 'U64'],
  ['occupation_site_mismatches', 'U64'],
  ['invalid_worker_states', 'U64'],
  ['invalid_assignments', 'U64'],
  ['invalid_idempotency_receipts', 'U64'],
  ['idempotency_overflow_fids', 'U64'],
  ['legacy_expeditions', 'U64'],
  ['legacy_occupations', 'U64'],
  ['legacy_schedules', 'U64'],
  ['roster_digest', 'String'],
  ['roster_digest_expected', 'String'],
]);
const WORKER_V12_RESOURCE_STATE_FIELDS = Object.freeze([
  ['fid', 'U64'],
  ['food', 'U64'],
  ['wood', 'U64'],
  ['stone', 'U64'],
  ['gold', 'U64'],
  ['worker_pending_food', 'U64'],
  ['worker_pending_wood', 'U64'],
  ['worker_pending_stone', 'U64'],
  ['worker_pending_gold', 'U64'],
  ['observed_at_micros', 'U64'],
  ['settled_through_micros', 'U64'],
  ['revision', 'U64'],
  ['resource_policy_version', 'String'],
  ['worker_policy_version', 'String'],
  ['worker_system_mode', 'String'],
]);
const WORKER_V12_OPTION_STRING_TYPE = workerSumType([
  ['some', 'String'],
  ['none', workerProductType([])],
]);
const WORKER_V12_PRIVATE_WORKER_FIELDS = Object.freeze([
  ['worker_id', 'String'],
  ['ordinal', 'U32'],
  ['status', 'String'],
  ['resource_kind', WORKER_V12_OPTION_STRING_TYPE],
  ['site_id', WORKER_V12_OPTION_STRING_TYPE],
  ['accrued_amount', 'U64'],
  ['materialized_amount', 'U64'],
  ['available_amount', 'U64'],
  ['observed_at_micros', 'U64'],
  ['revision', 'U64'],
]);
const WORKER_V12_ROSTER_FIELDS = Object.freeze([
  ['fid', 'U64'],
  ['castle_id', 'U64'],
  ['observed_at_micros', 'U64'],
  [
    'workers',
    workerArrayType(workerRefType(WORKER_V12_PRIVATE_WORKER_FIELDS)),
  ],
]);
const WORKER_V12_CONTROL_STATE_FIELDS = Object.freeze([
  ['fid', 'U64'],
  ['castle_id', 'U64'],
  ['observed_at_micros', 'U64'],
  [
    'workers',
    workerArrayType(workerRefType(WORKER_V12_PRIVATE_WORKER_FIELDS)),
  ],
  ['food', 'U64'],
  ['wood', 'U64'],
  ['stone', 'U64'],
  ['gold', 'U64'],
  ['worker_pending_food', 'U64'],
  ['worker_pending_wood', 'U64'],
  ['worker_pending_stone', 'U64'],
  ['worker_pending_gold', 'U64'],
  ['settled_through_micros', 'U64'],
  ['revision', 'U64'],
  ['resource_policy_version', 'String'],
  ['worker_policy_version', 'String'],
  ['worker_system_mode', 'String'],
]);
const WORKER_V12_TIMESTAMP_TYPE = workerSumType([
  [
    'Interval',
    workerProductType([['__time_duration_micros__', 'I64']]),
  ],
  [
    'Time',
    workerProductType([['__timestamp_micros_since_unix_epoch__', 'I64']]),
  ],
]);
const WORKER_V12_SCHEDULE_ROW_FIELDS = Object.freeze([
  ['schedule_id', 'U64'],
  ['scheduled_at', WORKER_V12_TIMESTAMP_TYPE],
  ['assignment_id', 'String'],
  ['worker_id', 'String'],
  ['timeline_revision', 'U32'],
  ['stage', 'String'],
]);
const WORKER_V12_COMMON_REDUCER_FIELDS = Object.freeze({
  admin_backfill_worker_roster_v1: Object.freeze([]),
  admin_begin_worker_legacy_drain_v1: Object.freeze([]),
  admin_stage_worker_system_v1: Object.freeze([]),
  dispatch_worker_v1: Object.freeze([
    ['workerId', 'String'],
    ['resourceKind', 'String'],
    ['siteId', 'String'],
    ['idempotencyKey', 'String'],
  ]),
  recall_all_workers_v1: Object.freeze([
    ['idempotencyKey', 'String'],
  ]),
  recall_worker_v1: Object.freeze([
    ['workerId', 'String'],
    ['idempotencyKey', 'String'],
  ]),
  run_worker_assignment_schedule_v_1: Object.freeze([
    ['arg', workerRefType(WORKER_V12_SCHEDULE_ROW_FIELDS)],
  ]),
});
const WORKER_V12_COMMON_PROCEDURE_FIELDS = Object.freeze({
  admin_get_worker_system_status_v1: WORKER_V12_SYSTEM_STATUS_FIELDS,
  admin_plan_worker_roster_v1: WORKER_V12_ROSTER_PLAN_FIELDS,
  get_my_resource_state_v2: WORKER_V12_RESOURCE_STATE_FIELDS,
  get_my_worker_roster_v1: WORKER_V12_ROSTER_FIELDS,
});
const WORKER_V12_ACTIVE_REDUCER_FIELDS = Object.freeze({
  ...WORKER_V12_COMMON_REDUCER_FIELDS,
  admin_activate_worker_system_v1: WORKER_V12_CANDIDATE_ACTIVATION_FIELDS,
  admin_complete_worker_legacy_drain_v1: WORKER_V12_COMPLETE_DRAIN_FIELDS,
  return_legacy_expedition_v1: WORKER_V12_RETURN_LEGACY_FIELDS,
});
const WORKER_V12_REPAIR_CANDIDATE_REDUCER_FIELDS = Object.freeze({
  ...WORKER_V12_ACTIVE_REDUCER_FIELDS,
  admin_repair_missing_worker_return_schedule_v1:
    WORKER_V12_RETURN_SCHEDULE_REPAIR_FIELDS,
});
const WORKER_V12_ACTIVE_PROCEDURE_FIELDS = Object.freeze({
  ...WORKER_V12_COMMON_PROCEDURE_FIELDS,
  admin_get_worker_rollout_status_v2: WORKER_V12_CANDIDATE_STATUS_FIELDS,
});
const WORKER_V12_ATOMIC_PROCEDURE_FIELDS = Object.freeze({
  ...WORKER_V12_ACTIVE_PROCEDURE_FIELDS,
  get_my_worker_control_state_v1: WORKER_V12_CONTROL_STATE_FIELDS,
});

const ALPHA_V8_COUNT_FIELDS = Object.freeze([
  'goldSites',
  'canonicalGoldSites',
  'goldOccupations',
  'goldExpeditions',
  'goldIdempotencyReceipts',
  'goldSchedules',
  'forestLayouts',
  'canonicalForestLayouts',
  'forestInstances',
  'canonicalForestInstances',
  'foodSites',
  'canonicalFoodSites',
  'foodOccupations',
  'foodExpeditions',
  'foodIdempotencyReceipts',
  'foodSchedules',
  'woodSites',
  'canonicalWoodSites',
  'woodOccupations',
  'woodExpeditions',
  'woodIdempotencyReceipts',
  'woodSchedules',
]);
const ALPHA_V8_POLICY_FIELDS = Object.freeze([
  'goldSitePolicyVersion',
  'goldExpeditionPolicyVersion',
  'forestPolicyVersion',
  'foodSitePolicyVersion',
  'foodExpeditionPolicyVersion',
  'woodSitePolicyVersion',
  'woodExpeditionPolicyVersion',
]);
const ALPHA_V8_DIGEST_FIELDS = Object.freeze([
  'canonicalGoldSiteCatalogDigest',
  'canonicalForestLayoutDigest',
  'canonicalForestAssetCatalogDigest',
  'canonicalFoodSiteCatalogDigest',
  'canonicalWoodSiteCatalogDigest',
]);
const ALPHA_V8_STATUS_KEYS = Object.freeze([
  'schemaProtocolVersion',
  'backendProtocolVersion',
  'forestLayoutVersion',
  ...ALPHA_V8_POLICY_FIELDS,
  ...ALPHA_V8_DIGEST_FIELDS,
  ...ALPHA_V8_COUNT_FIELDS,
].sort());
const ALPHA_V10_COUNT_FIELDS = Object.freeze([
  'waterLayouts',
  'canonicalWaterLayouts',
  'waterBodies',
  'canonicalWaterBodies',
  'waterCells',
  'canonicalWaterCells',
  'realmEnvironments',
  'canonicalRealmEnvironments',
  'stoneSites',
  'canonicalStoneSites',
  'stoneOccupations',
  'stoneExpeditions',
  'stoneIdempotencyReceipts',
  'stoneSchedules',
]);
const ALPHA_V10_POLICY_FIELDS = Object.freeze([
  'waterPolicyVersion',
  'stoneSitePolicyVersion',
  'stoneExpeditionPolicyVersion',
]);
const ALPHA_V10_DIGEST_FIELDS = Object.freeze([
  'canonicalWaterLayoutDigest',
  'canonicalStoneSiteCatalogDigest',
]);
const ALPHA_V10_STATUS_KEYS = Object.freeze([
  'schemaProtocolVersion',
  'backendProtocolVersion',
  'waterLayoutVersion',
  'waterActivated',
  ...ALPHA_V10_POLICY_FIELDS,
  ...ALPHA_V10_DIGEST_FIELDS,
  ...ALPHA_V10_COUNT_FIELDS,
].sort());
const ALPHA_V12_U64_FIELDS = Object.freeze([
  'systemRows',
  'expectedCastleCount',
  'expectedWorkerCount',
  'actualWorkerCount',
  'castlesMissingWorkers',
  'castlesWithExtraWorkers',
  'duplicateOrdinals',
  'malformedWorkerIds',
  'invalidWorkerStates',
  'idleWorkers',
  'outboundWorkers',
  'gatheringWorkers',
  'returningWorkers',
  'assignments',
  'occupations',
  'schedules',
  'orphanWorkers',
  'orphanAssignments',
  'assignmentsMissingOccupation',
  'assignmentsWithoutSingleSchedule',
  'orphanOccupations',
  'orphanSchedules',
  'invalidSchedules',
  'assignmentPublicMismatches',
  'occupationSiteMismatches',
  'invalidAssignments',
  'idempotencyReceipts',
  'invalidIdempotencyReceipts',
  'idempotencyOverflowFids',
  'legacyExpeditions',
  'legacyOccupations',
  'legacySchedules',
]);
const ALPHA_V12_BOOLEAN_FIELDS = Object.freeze([
  'systemConfigValid',
  'legacyDrainRequired',
  'expectedCountsMatch',
  'rosterDigestMatches',
]);
const ALPHA_V12_STRING_FIELDS = Object.freeze([
  'mode',
  'rosterDigest',
  'rosterDigestExpected',
]);
const ALPHA_V12_STATUS_KEYS = Object.freeze([
  ...ALPHA_V12_U64_FIELDS,
  ...ALPHA_V12_BOOLEAN_FIELDS,
  ...ALPHA_V12_STRING_FIELDS,
].sort());
const EMPTY_WORKER_V12_ZERO_FIELDS = Object.freeze([
  'systemRows',
  'expectedCastleCount',
  'expectedWorkerCount',
  'actualWorkerCount',
  'castlesWithExtraWorkers',
  'duplicateOrdinals',
  'malformedWorkerIds',
  'invalidWorkerStates',
  'idleWorkers',
  'outboundWorkers',
  'gatheringWorkers',
  'returningWorkers',
  'assignments',
  'occupations',
  'schedules',
  'orphanWorkers',
  'orphanAssignments',
  'assignmentsMissingOccupation',
  'assignmentsWithoutSingleSchedule',
  'orphanOccupations',
  'orphanSchedules',
  'invalidSchedules',
  'assignmentPublicMismatches',
  'occupationSiteMismatches',
  'invalidAssignments',
  'idempotencyReceipts',
  'invalidIdempotencyReceipts',
  'idempotencyOverflowFids',
]);
const ACTIVE_WORKER_V12_ZERO_FIELDS = Object.freeze([
  'castlesMissingWorkers',
  'castlesWithExtraWorkers',
  'duplicateOrdinals',
  'malformedWorkerIds',
  'invalidWorkerStates',
  'orphanWorkers',
  'orphanAssignments',
  'assignmentsMissingOccupation',
  'assignmentsWithoutSingleSchedule',
  'orphanOccupations',
  'orphanSchedules',
  'invalidSchedules',
  'assignmentPublicMismatches',
  'occupationSiteMismatches',
  'invalidAssignments',
  'invalidIdempotencyReceipts',
  'idempotencyOverflowFids',
  'legacyExpeditions',
  'legacyOccupations',
  'legacySchedules',
]);
const REPAIRABLE_ACTIVE_WORKER_V12_ZERO_FIELDS = Object.freeze(
  ACTIVE_WORKER_V12_ZERO_FIELDS.filter(field => (
    field !== 'assignmentsWithoutSingleSchedule'
    && field !== 'occupationSiteMismatches'
  )),
);
const U64_MAXIMUM = (1n << 64n) - 1n;

class SafePublishError extends Error {}

function fail(message) {
  throw new SafePublishError(message);
}

const PRIVATE_SNAPSHOT_DIRECTORY_MODE = 0o700;
const PRIVATE_SNAPSHOT_ARTIFACT_MODE = 0o400;
const PRIVATE_SNAPSHOT_EXECUTABLE_MODE = 0o500;
const MAX_PRIVATE_SNAPSHOT_BYTES = 128 * 1_024 * 1_024;
const PRIVATE_SNAPSHOT_KINDS = Object.freeze({
  ARTIFACT: 'artifact',
  EXECUTABLE: 'executable',
});

function readExactVerifiedSourceBytes(sourcePath, expectedDigest, kind) {
  if (
    typeof sourcePath !== 'string'
    || !isAbsolute(sourcePath)
    || typeof expectedDigest !== 'string'
    || !SHA256_DIGEST.test(expectedDigest)
    || typeof kind !== 'string'
    || !Object.values(PRIVATE_SNAPSHOT_KINDS).includes(kind)
  ) {
    fail('The private publication snapshot request was invalid.');
  }

  let descriptor;
  try {
    descriptor = openSync(sourcePath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const before = fstatSync(descriptor);
    if (
      !before.isFile()
      || before.size < 1
      || before.size > MAX_PRIVATE_SNAPSHOT_BYTES
    ) {
      fail('The private publication snapshot source was not a regular file.');
    }
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || bytes.byteLength !== after.size
    ) {
      fail('The private publication snapshot source changed while it was read.');
    }
    const digest = createHash('sha256').update(bytes).digest('hex');
    if (digest !== expectedDigest) {
      fail(kind === PRIVATE_SNAPSHOT_KINDS.ARTIFACT
        ? 'The proven SpacetimeDB artifact changed after migration verification.'
        : 'The exact reviewed SpacetimeDB CLI binary was not active on this platform.');
    }
    // The caller copies this exact verified buffer. It never reopens the
    // mutable source path between attestation and snapshot creation.
    return Object.freeze({ bytes, digest });
  } catch (error) {
    if (error instanceof SafePublishError) throw error;
    fail('The private publication snapshot source could not be read safely.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

export function createPrivatePublishSnapshot(sourcePath, expectedDigest, kind) {
  const verified = readExactVerifiedSourceBytes(sourcePath, expectedDigest, kind);
  let directory;
  let descriptor;
  try {
    directory = mkdtempSync(join(tmpdir(), 'warpkeep-publish-snapshot-'));
    chmodSync(directory, PRIVATE_SNAPSHOT_DIRECTORY_MODE);
    const directoryMetadata = statSync(directory);
    if (
      !directoryMetadata.isDirectory()
      || (directoryMetadata.mode & 0o777) !== PRIVATE_SNAPSHOT_DIRECTORY_MODE
    ) {
      fail('The private publication snapshot directory permissions were not exact.');
    }

    const snapshotPath = join(
      directory,
      // The pinned CLI is a multicall binary and dispatches from argv[0]. Keep
      // its reviewed command name while changing only the private directory.
      kind === PRIVATE_SNAPSHOT_KINDS.EXECUTABLE ? 'spacetime' : 'module.js',
    );
    const snapshotMode = kind === PRIVATE_SNAPSHOT_KINDS.EXECUTABLE
      ? PRIVATE_SNAPSHOT_EXECUTABLE_MODE
      : PRIVATE_SNAPSHOT_ARTIFACT_MODE;
    descriptor = openSync(
      snapshotPath,
      constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW,
      PRIVATE_SNAPSHOT_DIRECTORY_MODE,
    );
    writeFileSync(descriptor, verified.bytes);
    fchmodSync(descriptor, snapshotMode);
    fsyncSync(descriptor);
    const snapshotMetadata = fstatSync(descriptor);
    if (
      !snapshotMetadata.isFile()
      || snapshotMetadata.size !== verified.bytes.byteLength
      || (snapshotMetadata.mode & 0o777) !== snapshotMode
    ) {
      fail('The private publication snapshot was not created exactly.');
    }
    closeSync(descriptor);
    descriptor = undefined;

    let cleaned = false;
    const cleanup = () => {
      if (cleaned) return;
      try {
        rmSync(directory, { recursive: true, force: true });
        cleaned = true;
      } catch {
        fail('Private publication snapshot cleanup failed; no further publication is safe.');
      }
    };
    return Object.freeze({
      path: snapshotPath,
      directory,
      digest: verified.digest,
      cleanup,
    });
  } catch (error) {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Cleanup below remains mandatory. */ }
    }
    if (directory !== undefined) {
      try { rmSync(directory, { recursive: true, force: true }); } catch {
        fail('Private publication snapshot cleanup failed; no further publication is safe.');
      }
    }
    if (error instanceof SafePublishError) throw error;
    fail('The private publication snapshot could not be created safely.');
  }
}

function requireHttpsOrigin(value, label) {
  if (typeof value !== 'string' || value.length === 0) {
    fail(`${label} is required.`);
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${label} must be a stable public HTTPS origin.`);
  }
  if (url.protocol !== 'https:' || url.origin !== value || url.hostname.endsWith('.invalid')) {
    fail(`${label} must be a stable public HTTPS origin.`);
  }
  return url.origin;
}

async function readBoundedJson(response, label) {
  if (!response.ok) fail(`${label} is not reachable without redirects.`);
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(response.headers.get('content-type') ?? '')) {
    fail(`${label} did not return exact JSON.`);
  }
  const advertisedLength = response.headers.get('content-length');
  if (advertisedLength && (!/^\d+$/.test(advertisedLength) || Number(advertisedLength) > MAX_OIDC_DOCUMENT_BYTES)) {
    fail(`${label} exceeded the response limit.`);
  }
  if (!response.body) fail(`${label} returned no response body.`);

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;
  let exceededLimit = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_OIDC_DOCUMENT_BYTES) {
        try { await reader.cancel(); } catch { /* The bounded rejection remains generic. */ }
        exceededLimit = true;
        break;
      }
      chunks.push(value);
    }
  } catch {
    fail(`${label} returned an invalid response body.`);
  } finally {
    try { reader.releaseLock(); } catch { /* No response detail may escape. */ }
  }
  if (exceededLimit) fail(`${label} exceeded the response limit.`);

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    fail(`${label} returned invalid JSON.`);
  }
}

async function fetchOidcDocument(url, label, fetchImpl) {
  let response;
  try {
    response = await fetchImpl(url, {
      redirect: 'error',
      cache: 'no-store',
      signal: AbortSignal.timeout(OIDC_REQUEST_TIMEOUT_MILLISECONDS),
      headers: { accept: 'application/json' },
    });
  } catch {
    fail(`${label} is not reachable without redirects.`);
  }
  return readBoundedJson(response, label);
}

export async function validateIssuerDeployment(issuer, fetchImpl = fetch) {
  const configuration = await fetchOidcDocument(
    `${issuer}/.well-known/openid-configuration`,
    'OIDC discovery',
    fetchImpl,
  );
  if (
    !configuration
    || typeof configuration !== 'object'
    || configuration.issuer !== issuer
    || configuration.jwks_uri !== `${issuer}/.well-known/jwks.json`
    || !Array.isArray(configuration.id_token_signing_alg_values_supported)
    || !configuration.id_token_signing_alg_values_supported.includes('ES256')
  ) {
    fail('OIDC discovery does not describe the configured issuer and ES256 contract.');
  }
  const document = await fetchOidcDocument(configuration.jwks_uri, 'OIDC JWKS', fetchImpl);
  if (
    !Array.isArray(document?.keys)
    || document.keys.length !== 1
    || document.keys.some(key => (
      !key
      || typeof key !== 'object'
      || 'd' in key
      || key.kty !== 'EC'
      || key.crv !== 'P-256'
      || key.alg !== 'ES256'
      || key.use !== 'sig'
      || typeof key.kid !== 'string' || !JWK_KEY_ID.test(key.kid)
      || typeof key.x !== 'string' || !JWK_COORDINATE.test(key.x)
      || typeof key.y !== 'string' || !JWK_COORDINATE.test(key.y)
    ))
  ) {
    fail('OIDC JWKS is missing one exact public-only ES256 signing key.');
  }
  try {
    await crypto.subtle.importKey(
      'jwk',
      document.keys[0],
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify'],
    );
  } catch {
    fail('OIDC JWKS is missing one usable public-only ES256 signing key.');
  }
}

export function publishChildEnvironment(source = process.env) {
  return Object.freeze(Object.fromEntries(
    PUBLISH_CHILD_ENVIRONMENT_KEYS
      .filter((key) => typeof source[key] === 'string' && source[key].length > 0)
      .map((key) => [key, source[key]]),
  ));
}

export function parsePublishArguments(arguments_ = process.argv.slice(2)) {
  let dryRun = false;
  let resourceRolloutStage;
  let genesisWorldRolloutStage;
  let workerRolloutStage;
  let workerModulePredecessor = WORKER_MODULE_PREDECESSOR.V11;
  let workerModulePredecessorExplicit = false;
  let workerForwardRepair;
  for (const argument of arguments_) {
    if (argument === '--dry-run' && !dryRun) {
      dryRun = true;
      continue;
    }
    if (
      argument.startsWith('--resource-rollout-stage=')
      && resourceRolloutStage === undefined
    ) {
      const value = argument.slice('--resource-rollout-stage='.length);
      if (Object.values(RESOURCE_PUBLISH_ROLLOUT_STAGE).includes(value)) {
        resourceRolloutStage = value;
        continue;
      }
    }
    if (
      argument.startsWith('--genesis-world-stage=')
      && genesisWorldRolloutStage === undefined
    ) {
      const value = argument.slice('--genesis-world-stage='.length);
      if (Object.values(GENESIS_WORLD_PUBLISH_STAGE).includes(value)) {
        genesisWorldRolloutStage = value;
        continue;
      }
    }
    if (
      argument.startsWith('--worker-rollout-stage=')
      && workerRolloutStage === undefined
    ) {
      const value = argument.slice('--worker-rollout-stage='.length);
      if (Object.values(WORKER_PUBLISH_ROLLOUT_STAGE).includes(value)) {
        workerRolloutStage = value;
        continue;
      }
    }
    if (
      argument.startsWith('--worker-module-predecessor=')
      && !workerModulePredecessorExplicit
    ) {
      const value = argument.slice('--worker-module-predecessor='.length);
      if (Object.values(WORKER_MODULE_PREDECESSOR).includes(value)) {
        workerModulePredecessor = value;
        workerModulePredecessorExplicit = true;
        continue;
      }
    }
    if (
      argument.startsWith('--worker-forward-repair=')
      && workerForwardRepair === undefined
    ) {
      const value = argument.slice('--worker-forward-repair='.length);
      if (Object.values(WORKER_FORWARD_REPAIR).includes(value)) {
        workerForwardRepair = value;
        continue;
      }
    }
    fail('Usage: publish-spacetime-dev.mjs [--dry-run] --resource-rollout-stage=<prebackfill|ready> --genesis-world-stage=<pre-expansion|expanded> --worker-rollout-stage=<empty|active> [--worker-module-predecessor=<v11|exact-v12-empty|exact-v12-active|exact-v13-active>] --worker-forward-repair=<none|return-node-reuse-v1>. Unknown or duplicate arguments are rejected.');
  }
  if (resourceRolloutStage === undefined) {
    fail('An explicit resource rollout stage is required: prebackfill for the first additive publication or ready for an already-backfilled republish.');
  }
  if (genesisWorldRolloutStage === undefined) {
    fail('An explicit Genesis world stage is required: pre-expansion for the exact 1,261-cell predecessor or expanded for the exact 10,000-cell target.');
  }
  if (workerRolloutStage === undefined) {
    fail('An explicit Worker rollout stage is required.');
  }
  if (workerForwardRepair === undefined) {
    fail('An explicit Worker forward-repair selection is required.');
  }
  if (
    (
      workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE
      || workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE
    )
      !== (workerRolloutStage === WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE)
  ) {
    fail('The exact active-v12 module predecessor or exact active-v13 module predecessor requires the active Worker rollout stage, and no other predecessor may use it.');
  }
  if (
    workerForwardRepair === WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1
    && (
      resourceRolloutStage !== RESOURCE_PUBLISH_ROLLOUT_STAGE.READY
      || genesisWorldRolloutStage !== GENESIS_WORLD_PUBLISH_STAGE.EXPANDED
      || workerRolloutStage !== WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE
      || (
        workerModulePredecessor !== WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE
        && workerModulePredecessor !== WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE
      )
    )
  ) {
    fail('The return-node-reuse-v1 forward repair requires the exact ready, expanded, active-v12 production predecessor or exact active-v13 production predecessor.');
  }
  return Object.freeze({
    dryRun,
    resourceRolloutStage,
    genesisWorldRolloutStage,
    workerRolloutStage,
    workerModulePredecessor,
    workerForwardRepair,
  });
}

export function requireCanonicalPublishCoordinates(source = process.env) {
  if (
    (source.WARPKEEP_SPACETIMEDB_DATABASE ?? CANONICAL_DATABASE) !== CANONICAL_DATABASE
    || (source.WARPKEEP_SPACETIMEDB_URI ?? CANONICAL_MAINCLOUD_URI) !== CANONICAL_MAINCLOUD_URI
  ) {
    fail('The production publisher is pinned to the canonical existing Warpkeep database.');
  }
}

function validateFoundedPublishExpectations(value) {
  if (
    value === null
    || typeof value !== 'object'
    || Object.keys(value).sort().join(',') !== [
      'expectedFounderCount',
      'expectedPlayerCount',
      'expectedTermsAcceptanceCount',
    ].sort().join(',')
  ) {
    fail('Exact founded protocol-v3 publication expectations are required.');
  }
  const {
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  } = value;
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
    || !Number.isSafeInteger(expectedPlayerCount)
    || expectedPlayerCount < 0
    || expectedPlayerCount > expectedFounderCount
    || !Number.isSafeInteger(expectedTermsAcceptanceCount)
    || expectedTermsAcceptanceCount < 0
    || expectedTermsAcceptanceCount
      > expectedPlayerCount * MAX_ENTRY_AGREEMENT_ACCEPTANCE_ROWS_PER_PLAYER
  ) {
    fail('Founded protocol-v3 publication expectations were invalid.');
  }
  return Object.freeze({
    expectedFounderCount,
    expectedPlayerCount,
    expectedTermsAcceptanceCount,
  });
}

export function readFoundedPublishExpectations(source = process.env) {
  const readCount = (key, minimum, maximum = 100) => {
    const value = source[key];
    if (
      typeof value !== 'string'
      || !/^(?:0|[1-9]\d*)$/.test(value)
      || Number(value) < minimum
      || Number(value) > maximum
    ) {
      fail(`${key} must be a canonical integer from ${minimum} through ${maximum}.`);
    }
    return Number(value);
  };
  return validateFoundedPublishExpectations({
    expectedFounderCount: readCount('WARPKEEP_EXPECTED_FOUNDER_COUNT', 1),
    expectedPlayerCount: readCount('WARPKEEP_EXPECTED_PLAYER_COUNT', 0),
    expectedTermsAcceptanceCount: readCount(
      'WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT',
      0,
      MAX_ENTRY_AGREEMENT_ACCEPTANCE_COUNT,
    ),
  });
}

function foundedAggregateStageForWorldStage(genesisWorldRolloutStage) {
  if (genesisWorldRolloutStage === GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION) {
    return PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED;
  }
  if (genesisWorldRolloutStage === GENESIS_WORLD_PUBLISH_STAGE.EXPANDED) {
    return PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED;
  }
  fail('The Genesis world publication stage was invalid.');
}

function runBoundedSync(executable, arguments_, options, spawnSyncProcess = spawnSync) {
  const result = spawnSyncProcess(executable, arguments_, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: publishChildEnvironment(),
    input: '',
    maxBuffer: MAX_CHILD_OUTPUT_BYTES,
    timeout: PREFLIGHT_TIMEOUT_MILLISECONDS,
    killSignal: 'SIGKILL',
    ...options,
  });
  if (result.error || result.status !== 0 || result.signal) {
    fail('A bounded publication preflight failed. No publish was attempted.');
  }
  return result;
}

export function verifyCanonicalDatabaseList(output) {
  if (typeof output !== 'string') fail('The canonical database identity could not be verified.');
  const normalized = output.replace(/\u001b\[[0-9;]*m/g, '');
  const exactEntry = new RegExp(
    `^${CANONICAL_DATABASE}\\s+\\|\\s+${CANONICAL_DATABASE_IDENTITY}$`,
  );
  const matches = normalized.split(/\r?\n/).filter(line => (
    exactEntry.test(line.trim())
  ));
  if (matches.length !== 1) {
    fail('The canonical existing Warpkeep database identity could not be verified.');
  }
}

export function attestCanonicalDatabase(executable, spawnSyncProcess = spawnSync) {
  const result = runBoundedSync(executable, [
    'list',
    '--server', CANONICAL_MAINCLOUD_URI,
    '--yes',
  ], {}, spawnSyncProcess);
  verifyCanonicalDatabaseList(result.stdout);
}

export function canonicalSchemaDescribeChildArguments() {
  return [
    'describe',
    '--json',
    '--anonymous',
    '--server', CANONICAL_MAINCLOUD_URI,
    '--no-config',
    CANONICAL_DATABASE_IDENTITY,
  ];
}

export function parseCanonicalSchemaDescription(output) {
  let description;
  try {
    description = JSON.parse(output);
  } catch {
    fail('The canonical schema inspection did not return machine-readable JSON.');
  }
  if (
    !description
    || typeof description !== 'object'
    || Array.isArray(description)
    || !Array.isArray(description.tables)
    || !description.typespace
    || typeof description.typespace !== 'object'
    || !Array.isArray(description.typespace.types)
  ) {
    fail('The canonical schema inspection returned an invalid description.');
  }
  return description;
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`
    )).join(',')}}`;
  }
  return JSON.stringify(value);
}

function schemaTableSignature(description, name) {
  const matches = description.tables.filter(candidate => candidate?.name === name);
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0].product_type_ref)) {
    fail('The canonical schema did not contain one exact required table.');
  }
  const table = matches[0];
  const rowType = description.typespace.types[table.product_type_ref];
  if (!rowType || typeof rowType !== 'object' || Array.isArray(rowType)) {
    fail('The canonical schema did not contain one exact required row type.');
  }
  return { ...table, rowType };
}

function verifyExactTableIdentities(description, expectedRefs) {
  const expectedNames = Object.keys(expectedRefs).sort();
  const actualNames = description.tables.map(table => table?.name).sort();
  if (
    actualNames.length !== expectedNames.length
    || actualNames.some((name, index) => name !== expectedNames[index])
  ) {
    fail('The canonical schema table set did not match the exact publication boundary.');
  }
  for (const [name, expectedRef] of Object.entries(expectedRefs)) {
    const signature = schemaTableSignature(description, name);
    if (signature.product_type_ref !== expectedRef) {
      fail('The canonical schema product-type references did not match the exact publication boundary.');
    }
  }
}

function schemaFieldNames(description, name) {
  const elements = schemaTableSignature(description, name).rowType?.Product?.elements;
  if (!Array.isArray(elements)) {
    fail('The canonical Worker schema row fields were absent.');
  }
  const fields = elements.map(element => element?.name?.some);
  if (fields.some(field => typeof field !== 'string')) {
    fail('The canonical Worker schema row fields were invalid.');
  }
  return fields;
}

function schemaTableAccess(description, name) {
  const access = schemaTableSignature(description, name).table_access;
  if (!access || typeof access !== 'object' || Array.isArray(access)) {
    fail('The canonical Worker schema table access was invalid.');
  }
  const keys = Object.keys(access);
  if (keys.length !== 1) fail('The canonical Worker schema table access was invalid.');
  return keys[0];
}

/**
 * Require the live predecessor to be exactly the deployed v11 table boundary.
 * The returned canonical signatures are retained in memory and compared after
 * publication so no pre-existing table can drift unnoticed.
 */
export function verifyExactProductionV11Schema(description, expectedTableSchemaDigest) {
  verifyExactTableIdentities(description, PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS);
  try {
    if (
      typeof expectedTableSchemaDigest !== 'string'
      || !SHA256_DIGEST.test(expectedTableSchemaDigest)
      || canonicalTableSchemaBoundaryDigest(
        description,
        Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ) !== expectedTableSchemaDigest
    ) {
      fail('The canonical v11 table schema did not match the proven publication boundary.');
    }
  } catch (error) {
    if (
      error instanceof SafePublishError
      && error.message === 'The canonical v11 table schema did not match the proven publication boundary.'
    ) throw error;
    fail('The canonical v11 table schema did not match the proven publication boundary.');
  }
  return Object.freeze(Object.fromEntries(
    Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS).map(name => [
      name,
      canonicalJson(schemaTableSignature(description, name)),
    ]),
  ));
}

/** Require an exact v12 suffix while preserving every captured v11 signature. */
export function verifyExactProductionV12Schema(
  predecessorSignatures,
  description,
  expectedTableSchemaDigest,
) {
  if (
    !predecessorSignatures
    || typeof predecessorSignatures !== 'object'
    || Array.isArray(predecessorSignatures)
    || Object.keys(predecessorSignatures).sort().join(',')
      !== Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS).sort().join(',')
    || Object.values(predecessorSignatures).some(value => typeof value !== 'string')
  ) {
    fail('The captured production v11 schema boundary was invalid.');
  }
  const v12Refs = Object.freeze({
    ...PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
    ...Object.fromEntries(Object.entries(WORKER_V12_TABLE_CONTRACTS)
      .map(([name, contract]) => [name, contract.productTypeRef])),
  });
  verifyExactTableIdentities(description, v12Refs);
  for (const name of Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS)) {
    if (canonicalJson(schemaTableSignature(description, name)) !== predecessorSignatures[name]) {
      fail('A pre-existing production table changed during the v12 publication.');
    }
  }
  for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
    if (
      schemaTableAccess(description, name) !== contract.access
      || canonicalJson(schemaFieldNames(description, name)) !== canonicalJson(contract.fields)
    ) {
      fail('The appended Worker schema did not match the exact v12 contract.');
    }
  }
  try {
    if (
      typeof expectedTableSchemaDigest !== 'string'
      || !SHA256_DIGEST.test(expectedTableSchemaDigest)
      || canonicalTableSchemaBoundaryDigest(
        description,
        Object.keys(v12Refs),
      ) !== expectedTableSchemaDigest
    ) {
      fail('The canonical v12 table schema did not match the proven publication boundary.');
    }
  } catch (error) {
    if (
      error instanceof SafePublishError
      && error.message === 'The canonical v12 table schema did not match the proven publication boundary.'
    ) throw error;
    fail('The canonical v12 table schema did not match the proven publication boundary.');
  }
  return Object.freeze({
    predecessorTableCount: Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS).length,
    appendedWorkerTableCount: Object.keys(WORKER_V12_TABLE_CONTRACTS).length,
    totalTableCount: Object.keys(v12Refs).length,
  });
}

function productionV12TableRefs() {
  return Object.freeze({
    ...PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
    ...Object.fromEntries(Object.entries(WORKER_V12_TABLE_CONTRACTS)
      .map(([name, contract]) => [name, contract.productTypeRef])),
  });
}

function productionV13TableRefs() {
  return Object.freeze({
    ...productionV12TableRefs(),
    ...Object.fromEntries(Object.entries(ACCESS_REQUEST_V13_TABLE_CONTRACTS)
      .map(([name, contract]) => [name, contract.productTypeRef])),
  });
}

function requireCapturedTableSignatures(signatures, refs, boundary) {
  if (
    !signatures
    || typeof signatures !== 'object'
    || Array.isArray(signatures)
    || Object.keys(signatures).sort().join(',')
      !== Object.keys(refs).sort().join(',')
    || Object.values(signatures).some(value => typeof value !== 'string')
  ) fail(`The captured production ${boundary} schema boundary was invalid.`);
}

function projectedTableSchemaBoundaryDigest(description, tableNames) {
  if (
    !description
    || typeof description !== 'object'
    || !Array.isArray(description.tables)
    || !Array.isArray(tableNames)
    || tableNames.some(name => typeof name !== 'string')
  ) fail('The canonical schema projection was invalid.');
  const selected = new Set(tableNames);
  return canonicalTableSchemaBoundaryDigest({
    ...description,
    tables: description.tables.filter(table => selected.has(table?.name)),
  }, tableNames);
}

function verifyProductionV13Contracts(
  description,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
) {
  const v12Refs = productionV12TableRefs();
  const v13Refs = productionV13TableRefs();
  verifyExactTableIdentities(description, v13Refs);
  for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
    if (
      schemaTableAccess(description, name) !== contract.access
      || canonicalJson(schemaFieldNames(description, name))
        !== canonicalJson(contract.fields)
    ) fail('The appended Worker schema did not match the exact v12 contract.');
  }
  for (const [name, contract] of Object.entries(
    ACCESS_REQUEST_V13_TABLE_CONTRACTS,
  )) {
    if (
      schemaTableAccess(description, name) !== contract.access
      || canonicalJson(schemaFieldNames(description, name))
        !== canonicalJson(contract.fields)
    ) fail('The appended access-request schema did not match the exact private v13 contract.');
  }
  try {
    if (
      typeof expectedV12TableSchemaDigest !== 'string'
      || !SHA256_DIGEST.test(expectedV12TableSchemaDigest)
      || projectedTableSchemaBoundaryDigest(
        description,
        Object.keys(v12Refs),
      ) !== expectedV12TableSchemaDigest
    ) fail('The canonical v12 table schema did not match the proven publication boundary.');
    if (
      typeof expectedV13TableSchemaDigest !== 'string'
      || !SHA256_DIGEST.test(expectedV13TableSchemaDigest)
      || canonicalTableSchemaBoundaryDigest(
        description,
        Object.keys(v13Refs),
      ) !== expectedV13TableSchemaDigest
    ) fail('The canonical v13 table schema did not match the proven publication boundary.');
  } catch (error) {
    if (
      error instanceof SafePublishError
      && (
        error.message
          === 'The canonical v12 table schema did not match the proven publication boundary.'
        || error.message
          === 'The canonical v13 table schema did not match the proven publication boundary.'
      )
    ) throw error;
    fail('The canonical v13 table schema did not match the proven publication boundary.');
  }
  return Object.freeze({
    v12Refs,
    v13Refs,
  });
}

/**
 * Require the exact v13 append over a captured v12 predecessor. Every
 * predecessor signature, the v12 boundary digest, and the new private ref-53
 * boundary digest remain independently attested.
 */
export function verifyExactProductionV13Schema(
  predecessorSignatures,
  description,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
) {
  const v12Refs = productionV12TableRefs();
  requireCapturedTableSignatures(predecessorSignatures, v12Refs, 'v12');
  const contracts = verifyProductionV13Contracts(
    description,
    expectedV12TableSchemaDigest,
    expectedV13TableSchemaDigest,
  );
  for (const name of Object.keys(v12Refs)) {
    if (
      canonicalJson(schemaTableSignature(description, name))
        !== predecessorSignatures[name]
    ) fail('A pre-existing production table changed during the v13 publication.');
  }
  return Object.freeze({
    predecessorTableCount: Object.keys(v12Refs).length,
    appendedAccessRequestTableCount:
      Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS).length,
    totalTableCount: Object.keys(contracts.v13Refs).length,
  });
}

/**
 * Retain the reviewed v11 exceptional lane while binding both append
 * boundaries. This proves the six exact Worker tables and the one exact
 * private request table without weakening any captured v11 signature.
 */
export function verifyExactProductionV13SchemaFromV11(
  predecessorSignatures,
  description,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
) {
  requireCapturedTableSignatures(
    predecessorSignatures,
    PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
    'v11',
  );
  const contracts = verifyProductionV13Contracts(
    description,
    expectedV12TableSchemaDigest,
    expectedV13TableSchemaDigest,
  );
  for (const name of Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS)) {
    if (
      canonicalJson(schemaTableSignature(description, name))
        !== predecessorSignatures[name]
    ) fail('A pre-existing production table changed during the v13 publication.');
  }
  return Object.freeze({
    predecessorTableCount:
      Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS).length,
    appendedWorkerTableCount: Object.keys(WORKER_V12_TABLE_CONTRACTS).length,
    appendedAccessRequestTableCount:
      Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS).length,
    totalTableCount: Object.keys(contracts.v13Refs).length,
  });
}

function workerProductType(fields) {
  return `Product<${canonicalJson(fields)}>`;
}

function workerSumType(fields) {
  return `Sum<${canonicalJson(fields)}>`;
}

function workerRefType(fields) {
  return `Ref<${workerProductType(fields)}>`;
}

function workerArrayType(elementType) {
  return `Array<${elementType}>`;
}

function isEmptyAlgebraicPayload(payload) {
  return (
    (Array.isArray(payload) && payload.length === 0)
    || (
      payload
      && typeof payload === 'object'
      && !Array.isArray(payload)
      && Object.keys(payload).length === 0
    )
  );
}

function workerAlgebraicType(
  description,
  value,
  label,
  activeRefs = new Set(),
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    fail(`The ${label} Worker module ABI contained an invalid algebraic type.`);
  }
  const keys = Object.keys(value);
  const name = keys.length === 1 ? keys[0] : undefined;
  const payload = name === undefined ? undefined : value[name];
  if (
    ['Bool', 'I64', 'String', 'U32', 'U64'].includes(name)
    && isEmptyAlgebraicPayload(payload)
  ) return name;
  if (name === 'Array') {
    return workerArrayType(workerAlgebraicType(
      description,
      payload,
      label,
      activeRefs,
    ));
  }
  if (name === 'Product' || name === 'Sum') {
    if (
      !payload
      || typeof payload !== 'object'
      || Array.isArray(payload)
      || Object.keys(payload).length !== 1
    ) fail(`The ${label} Worker module ABI contained an invalid ${name} type.`);
    const key = name === 'Product' ? 'elements' : 'variants';
    if (!Object.hasOwn(payload, key)) {
      fail(`The ${label} Worker module ABI contained an invalid ${name} type.`);
    }
    const fields = workerProductFields(
      description,
      payload[key],
      `${label} ${name.toLowerCase()}`,
      activeRefs,
    );
    return name === 'Product'
      ? workerProductType(fields)
      : workerSumType(fields);
  }
  if (
    name === 'Ref'
    && Number.isSafeInteger(payload)
    && payload >= 0
    && Array.isArray(description?.typespace?.types)
    && description.typespace.types[payload] !== undefined
  ) {
    if (activeRefs.has(payload)) {
      fail(`The ${label} Worker module ABI contained a cyclic type reference.`);
    }
    const nextRefs = new Set(activeRefs);
    nextRefs.add(payload);
    return `Ref<${workerAlgebraicType(
      description,
      description.typespace.types[payload],
      label,
      nextRefs,
    )}>`;
  }
  fail(`The ${label} Worker module ABI contained an unsupported algebraic type.`);
}

function workerProductFields(
  description,
  elements,
  label,
  activeRefs = new Set(),
) {
  if (!Array.isArray(elements)) {
    fail(`The ${label} Worker module ABI fields were absent.`);
  }
  return elements.map(element => {
    if (
      !element
      || typeof element !== 'object'
      || Array.isArray(element)
      || Object.keys(element).sort().join(',') !== 'algebraic_type,name'
      || !element.name
      || typeof element.name !== 'object'
      || Array.isArray(element.name)
      || Object.keys(element.name).length !== 1
      || typeof element.name.some !== 'string'
    ) fail(`The ${label} Worker module ABI fields were invalid.`);
    return Object.freeze([
      element.name.some,
      workerAlgebraicType(
        description,
        element.algebraic_type,
        label,
        activeRefs,
      ),
    ]);
  });
}

function criticalWorkerReducerName(name) {
  return typeof name === 'string'
    && (name.includes('worker') || name.includes('legacy_expedition'));
}

function criticalWorkerProcedureName(name) {
  return typeof name === 'string'
    && (name.includes('worker') || name === 'get_my_resource_state_v2');
}

function collectWorkerReducerAbi(description) {
  if (!Array.isArray(description.reducers)) {
    fail('The canonical schema did not expose a reducer ABI.');
  }
  const reducers = Object.create(null);
  for (const reducer of description.reducers.filter(
    candidate => criticalWorkerReducerName(candidate?.name),
  )) {
    if (
      Object.hasOwn(reducers, reducer.name)
      || canonicalJson(reducer.lifecycle) !== canonicalJson({ none: [] })
    ) {
      fail('The canonical schema did not contain one exact required Worker reducer.');
    }
    reducers[reducer.name] = workerProductFields(
      description,
      reducer?.params?.elements,
      `${reducer.name} reducer`,
    );
  }
  return reducers;
}

function collectWorkerProcedureAbi(description) {
  if (!Array.isArray(description.misc_exports)) {
    fail('The canonical schema did not expose a procedure ABI.');
  }
  const procedures = Object.create(null);
  const matches = description.misc_exports
    .map(entry => entry?.Procedure)
    .filter(procedure => criticalWorkerProcedureName(procedure?.name));
  for (const procedure of matches) {
    if (Object.hasOwn(procedures, procedure.name)) {
      fail('The canonical schema did not contain one exact required Worker procedure.');
    }
    if (workerProductFields(
      description,
      procedure?.params?.elements,
      `${procedure.name} procedure parameters`,
    ).length !== 0) fail('The required Worker procedure parameters were invalid.');
    const returnType = procedure?.return_type;
    if (
      !returnType
      || typeof returnType !== 'object'
      || Array.isArray(returnType)
      || Object.keys(returnType).length !== 1
      || !Number.isSafeInteger(returnType.Ref)
      || returnType.Ref < 0
      || !Array.isArray(description?.typespace?.types)
      || !description.typespace.types[returnType.Ref]?.Product
    ) fail('The required Worker procedure return type was invalid.');
    procedures[procedure.name] = workerProductFields(
      description,
      description.typespace.types[returnType.Ref].Product.elements,
      `${procedure.name} procedure`,
      new Set([returnType.Ref]),
    );
  }
  return procedures;
}

function fieldsMatch(actual, expected) {
  return actual !== undefined
    && actual.length === expected.length
    && actual.every((field, index) => (
      field[0] === expected[index][0]
      && field[1] === expected[index][1]
    ));
}

function surfaceMatches(actual, expected) {
  const actualNames = Object.keys(actual).sort();
  const expectedNames = Object.keys(expected).sort();
  return canonicalJson(actualNames) === canonicalJson(expectedNames)
    && actualNames.every(name => fieldsMatch(actual[name], expected[name]));
}

/**
 * Distinguish the historical inert-v12 boundary, the exact active Worker-v12
 * predecessor, and the one Alpha 0.3.21 additive repair candidate. Every
 * critical reducer and procedure is pinned, including nested roster/control
 * and scheduler types; missing, extra, or drifted Worker APIs match no state.
 */
export function verifyWorkerV12ModuleAbi(description) {
  const reducerAbi = collectWorkerReducerAbi(description);
  const procedureAbi = collectWorkerProcedureAbi(description);
  const inertPredecessor = surfaceMatches(reducerAbi, {
    ...WORKER_V12_COMMON_REDUCER_FIELDS,
    admin_activate_worker_system_v1:
      WORKER_V12_PREDECESSOR_ACTIVATION_FIELDS,
  }) && surfaceMatches(procedureAbi, {
    ...WORKER_V12_COMMON_PROCEDURE_FIELDS,
    admin_get_worker_rollout_status_v2:
      WORKER_V12_PREDECESSOR_STATUS_FIELDS,
  });
  const activePredecessor = surfaceMatches(
    reducerAbi,
    WORKER_V12_ACTIVE_REDUCER_FIELDS,
  ) && surfaceMatches(
    procedureAbi,
    WORKER_V12_ACTIVE_PROCEDURE_FIELDS,
  );
  const candidate = surfaceMatches(
    reducerAbi,
    WORKER_V12_REPAIR_CANDIDATE_REDUCER_FIELDS,
  ) && surfaceMatches(
    procedureAbi,
    WORKER_V12_ATOMIC_PROCEDURE_FIELDS,
  );
  if (!inertPredecessor && !activePredecessor && !candidate) {
    fail('The production Worker v12 module ABI was partial, unknown, or changed.');
  }
  if (candidate) return 'candidate';
  if (activePredecessor) return 'active-predecessor';
  return 'predecessor';
}

/**
 * Bind the operator-selected production predecessor to the exact ABI state.
 * A fully installed candidate is accepted so the guarded publisher can
 * reinstall the exact reviewed artifact and bind live code to the local proof.
 */
export function verifyWorkerV12ModulePredecessor(
  moduleState,
  workerModulePredecessor,
) {
  const expectedState = workerModulePredecessor
    === WORKER_MODULE_PREDECESSOR.EXACT_V12_EMPTY
    ? 'predecessor'
    : workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE
      ? 'active-predecessor'
      : undefined;
  if (
    expectedState === undefined
    || (moduleState !== expectedState && moduleState !== 'candidate')
  ) {
    fail('The selected Worker module predecessor did not match the exact production v12 ABI.');
  }
  return moduleState;
}

/** Bind the code-only v13 lane to an exact active or already-candidate ABI. */
export function verifyWorkerV13ModulePredecessor(
  moduleState,
  workerModulePredecessor,
) {
  if (
    workerModulePredecessor !== WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE
    || (
      moduleState !== 'active-predecessor'
      && moduleState !== 'candidate'
    )
  ) {
    fail('The selected Worker module predecessor did not match the exact active production v13 ABI.');
  }
  return moduleState;
}

export function planWorkerV12CodePublication(
  moduleState,
  workerForwardRepair,
) {
  if (
    moduleState !== 'predecessor'
    && moduleState !== 'active-predecessor'
    && moduleState !== 'candidate'
  ) fail('The Worker v12 publication module state was invalid.');
  if (workerForwardRepair === WORKER_FORWARD_REPAIR.NONE) {
    return Object.freeze({
      prePublicationCheckpoint: WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
      postPublicationCheckpoint: WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
    });
  }
  if (
    workerForwardRepair !== WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1
    || (
      moduleState !== 'active-predecessor'
      && moduleState !== 'candidate'
    )
  ) fail('The Worker v12 forward-repair publication plan was invalid.');
  return Object.freeze({
    prePublicationCheckpoint: moduleState === 'candidate'
      ? WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING
      : WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    postPublicationCheckpoint: moduleState === 'candidate'
      ? WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING
      : WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
  });
}

/**
 * Preflight for a publication over an already-appended v12 Worker suffix. The
 * migration proof supplies the accepted v12 boundary digest; all 53 exact
 * table signatures are captured so the post-publication v13 check can prove
 * that ref 53 was the sole schema append.
 */
export function verifyExactProductionV12ModuleSchema(
  description,
  expectedTableSchemaDigest,
) {
  const refs = productionV12TableRefs();
  verifyExactTableIdentities(description, refs);
  for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
    if (
      schemaTableAccess(description, name) !== contract.access
      || canonicalJson(schemaFieldNames(description, name))
        !== canonicalJson(contract.fields)
    ) fail('The appended Worker schema did not match the exact v12 contract.');
  }
  try {
    if (
      typeof expectedTableSchemaDigest !== 'string'
      || !SHA256_DIGEST.test(expectedTableSchemaDigest)
      || canonicalTableSchemaBoundaryDigest(
        description,
        Object.keys(refs),
      ) !== expectedTableSchemaDigest
    ) fail('The canonical v12 table schema did not match the proven publication boundary.');
  } catch (error) {
    if (
      error instanceof SafePublishError
      && error.message
        === 'The canonical v12 table schema did not match the proven publication boundary.'
    ) throw error;
    fail('The canonical v12 table schema did not match the proven publication boundary.');
  }
  const tableSignatures = Object.freeze(Object.fromEntries(
    Object.keys(refs).map(name => [
      name,
      canonicalJson(schemaTableSignature(description, name)),
    ]),
  ));
  return Object.freeze({
    moduleState: verifyWorkerV12ModuleAbi(description),
    tableSignatures,
    totalTableCount: Object.keys(refs).length,
  });
}

export function verifyFreshProductionV12ModuleSchema(
  executable,
  expectedTableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    return verifyExactProductionV12ModuleSchema(
      parseCanonicalSchemaDescription(result.stdout),
      expectedTableSchemaDigest,
    );
  } catch {
    fail('Exact production v12 schema and module-ABI preflight failed. No publish was attempted.');
  }
}

/**
 * Code-only v13 preflight. Both proven v12/v13 digests, every table contract,
 * every product-type reference, and all 54 complete signatures are bound to
 * one anonymous schema description before publication is allowed.
 */
export function verifyExactProductionV13ModuleSchema(
  description,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
) {
  const contracts = verifyProductionV13Contracts(
    description,
    expectedV12TableSchemaDigest,
    expectedV13TableSchemaDigest,
  );
  const moduleState = verifyWorkerV12ModuleAbi(description);
  if (
    moduleState !== 'active-predecessor'
    && moduleState !== 'candidate'
  ) {
    fail('The exact production v13 module did not expose an accepted active-or-candidate Worker ABI.');
  }
  const tableSignatures = Object.freeze(Object.fromEntries(
    Object.keys(contracts.v13Refs).map(name => [
      name,
      canonicalJson(schemaTableSignature(description, name)),
    ]),
  ));
  return Object.freeze({
    moduleState,
    tableSignatures,
    totalTableCount: Object.keys(contracts.v13Refs).length,
  });
}

export function verifyFreshProductionV13ModuleSchema(
  executable,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    return verifyExactProductionV13ModuleSchema(
      parseCanonicalSchemaDescription(result.stdout),
      expectedV12TableSchemaDigest,
      expectedV13TableSchemaDigest,
    );
  } catch {
    fail('Exact production v13 schema and active-or-candidate module-ABI preflight failed. No publish was attempted.');
  }
}

export function verifyPostPublishProductionV12ModuleSchema(
  executable,
  predecessor,
  expectedTableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    if (
      !predecessor
      || (predecessor.moduleState !== 'predecessor'
        && predecessor.moduleState !== 'active-predecessor'
        && predecessor.moduleState !== 'candidate')
      || !predecessor.tableSignatures
      || typeof predecessor.tableSignatures !== 'object'
      || Array.isArray(predecessor.tableSignatures)
    ) fail('The captured production v12 predecessor was invalid.');
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    const after = verifyExactProductionV12ModuleSchema(
      parseCanonicalSchemaDescription(result.stdout),
      expectedTableSchemaDigest,
    );
    if (
      after.moduleState !== 'candidate'
      || canonicalJson(after.tableSignatures)
        !== canonicalJson(predecessor.tableSignatures)
    ) fail('The code-only v12 publication did not preserve every table signature and install the exact candidate ABI.');
    return after;
  } catch {
    fail('Post-publication v12 module checkpoint is indeterminate; perform a fresh anonymous read-only schema and ABI inspection before any Worker command, client deployment, or further publication decision.');
  }
}

export function verifyPostPublishProductionV13ModuleSchema(
  executable,
  predecessor,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    if (
      !predecessor
      || (
        predecessor.moduleState !== 'predecessor'
        && predecessor.moduleState !== 'active-predecessor'
        && predecessor.moduleState !== 'candidate'
      )
      || !predecessor.tableSignatures
      || typeof predecessor.tableSignatures !== 'object'
      || Array.isArray(predecessor.tableSignatures)
    ) fail('The captured production v12 predecessor was invalid.');
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    const description = parseCanonicalSchemaDescription(result.stdout);
    const schema = verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      description,
      expectedV12TableSchemaDigest,
      expectedV13TableSchemaDigest,
    );
    const moduleState = verifyWorkerV12ModuleAbi(description);
    if (moduleState !== 'candidate') {
      fail('The v13 publication did not install the exact Worker candidate ABI.');
    }
    return Object.freeze({
      ...schema,
      moduleState,
    });
  } catch {
    fail('Post-publication v13 module checkpoint is indeterminate; perform a fresh anonymous read-only schema and ABI inspection before any Worker command, client deployment, or further publication decision.');
  }
}

/**
 * Code-only v13 postflight. No table is appended here: all 54 captured table
 * signatures must remain byte-for-byte identical while the exact candidate
 * Worker ABI is installed under the same two proven schema digests.
 */
export function verifyPostPublishProductionV13ActiveModuleSchema(
  executable,
  predecessor,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    if (
      !predecessor
      || (
        predecessor.moduleState !== 'active-predecessor'
        && predecessor.moduleState !== 'candidate'
      )
    ) fail('The captured production v13 predecessor ABI was invalid.');
    requireCapturedTableSignatures(
      predecessor.tableSignatures,
      productionV13TableRefs(),
      'v13',
    );
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    const after = verifyExactProductionV13ModuleSchema(
      parseCanonicalSchemaDescription(result.stdout),
      expectedV12TableSchemaDigest,
      expectedV13TableSchemaDigest,
    );
    if (
      after.moduleState !== 'candidate'
      || canonicalJson(after.tableSignatures)
        !== canonicalJson(predecessor.tableSignatures)
    ) {
      fail('The code-only v13 publication did not preserve every table signature and install the exact candidate ABI.');
    }
    return after;
  } catch {
    fail('Post-publication active-v13 module checkpoint is indeterminate; perform a fresh anonymous read-only schema and ABI inspection before any Worker command, client deployment, or further publication decision.');
  }
}

export function verifyFreshProductionV11Schema(
  executable,
  expectedTableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    return verifyExactProductionV11Schema(
      parseCanonicalSchemaDescription(result.stdout),
      expectedTableSchemaDigest,
    );
  } catch {
    fail('Exact production v11 schema preflight failed. No publish was attempted.');
  }
}

export function verifyPostPublishProductionV12Schema(
  executable,
  predecessorSignatures,
  expectedTableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    return verifyExactProductionV12Schema(
      predecessorSignatures,
      parseCanonicalSchemaDescription(result.stdout),
      expectedTableSchemaDigest,
    );
  } catch {
    fail('Post-publication v12 schema checkpoint is indeterminate; a fresh anonymous read-only schema inspection is required before any merge, client deployment, Worker seed, backfill, activation, or further publication decision.');
  }
}

export function verifyPostPublishProductionV13SchemaFromV11(
  executable,
  predecessorSignatures,
  expectedV12TableSchemaDigest,
  expectedV13TableSchemaDigest,
  spawnSyncProcess = spawnSync,
) {
  try {
    const result = runBoundedSync(
      executable,
      canonicalSchemaDescribeChildArguments(),
      { timeout: 30_000 },
      spawnSyncProcess,
    );
    const description = parseCanonicalSchemaDescription(result.stdout);
    const schema = verifyExactProductionV13SchemaFromV11(
      predecessorSignatures,
      description,
      expectedV12TableSchemaDigest,
      expectedV13TableSchemaDigest,
    );
    if (verifyWorkerV12ModuleAbi(description) !== 'candidate') {
      fail('The v13 publication did not install the exact Worker candidate ABI.');
    }
    return schema;
  } catch {
    fail('Post-publication v13 schema checkpoint is indeterminate; a fresh anonymous read-only schema inspection is required before any merge, client deployment, Worker seed, backfill, activation, or further publication decision.');
  }
}

function digestArtifact(artifactPath) {
  let descriptor;
  try {
    descriptor = openSync(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
    const metadata = fstatSync(descriptor);
    if (!metadata.isFile()) {
      fail('The proven SpacetimeDB artifact was not a regular file.');
    }
    return createHash('sha256').update(readFileSync(descriptor)).digest('hex');
  } catch (error) {
    if (error instanceof SafePublishError) throw error;
    fail('The proven SpacetimeDB artifact could not be read.');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

function validateMigrationArtifactReceiptShape(receipt) {
  if (
    receipt === null
    || typeof receipt !== 'object'
    || Object.keys(receipt).sort().join(',')
      !== 'artifactDigest,artifactPath,v11TableSchemaDigest,v12TableSchemaDigest,v13TableSchemaDigest'
    || receipt.artifactPath !== PROVEN_ARTIFACT_PATH
    || !SHA256_DIGEST.test(receipt.v11TableSchemaDigest ?? '')
    || !SHA256_DIGEST.test(receipt.v12TableSchemaDigest ?? '')
    || !SHA256_DIGEST.test(receipt.v13TableSchemaDigest ?? '')
    || !SHA256_DIGEST.test(receipt.artifactDigest ?? '')
  ) {
    fail('The additive migration proof artifact receipt was invalid.');
  }
  return Object.freeze({
    artifactPath: receipt.artifactPath,
    v11TableSchemaDigest: receipt.v11TableSchemaDigest,
    v12TableSchemaDigest: receipt.v12TableSchemaDigest,
    v13TableSchemaDigest: receipt.v13TableSchemaDigest,
    artifactDigest: receipt.artifactDigest,
  });
}

export function verifyMigrationArtifactReceipt(receipt) {
  const validated = validateMigrationArtifactReceiptShape(receipt);
  const currentDigest = digestArtifact(validated.artifactPath);
  if (currentDigest !== validated.artifactDigest) {
    fail('The proven SpacetimeDB artifact changed after migration verification.');
  }
  return validated;
}

export function parseMigrationProofReceipt(output) {
  let proofReceipt;
  try {
    proofReceipt = parseAdditiveMigrationProofReceipt(output);
  } catch {
    fail('The current additive migration proof did not produce its exact success receipt.');
  }
  return verifyMigrationArtifactReceipt({
    artifactPath: PROVEN_ARTIFACT_PATH,
    v11TableSchemaDigest: proofReceipt.v11TableSchemaDigest,
    v12TableSchemaDigest: proofReceipt.v12TableSchemaDigest,
    v13TableSchemaDigest: proofReceipt.v13TableSchemaDigest,
    artifactDigest: proofReceipt.artifactDigest,
  });
}

export function runCurrentAdditiveMigrationProof(executable, spawnSyncProcess = spawnSync) {
  const result = runBoundedSync(process.execPath, [
    'scripts/verify-spacetime-additive-migration.mjs',
  ], {
    env: {
      ...publishChildEnvironment(),
      SPACETIME_BIN: executable,
    },
    timeout: ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS,
  }, spawnSyncProcess);
  return parseMigrationProofReceipt(result.stdout);
}

export function verifyFreshFoundedProtocolV3Aggregate(
  secret,
  expectations,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  const exactExpectations = validateFoundedPublishExpectations(expectations);
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected preflight.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const aggregateStage = foundedAggregateStageForWorldStage(genesisWorldRolloutStage);
  const result = runBoundedSync(
    process.execPath,
    protectedAggregateChildArguments(tsxCli, aggregateStage),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        // Inspect the same immutable identity passed to `spacetime publish`.
        // The human-readable database name is mutable after its list attestation
        // and therefore cannot be the final data-state authorization boundary.
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV3Aggregate(
    result.stdout,
    aggregateStage,
    exactExpectations.expectedFounderCount,
    exactExpectations.expectedPlayerCount,
    exactExpectations.expectedTermsAcceptanceCount,
  );
}

export function verifyFreshResourceProtocolV4PrebackfillAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected resource checkpoint.');
  }
  if (!Number.isSafeInteger(expectedFounderCount) || expectedFounderCount < 1 || expectedFounderCount > 100) {
    fail('The resource checkpoint expected founder count was invalid.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    resourceV4AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV4ResourcePrebackfillAggregate(result.stdout, expectedFounderCount);
}

export function verifyFreshResourceProtocolV4ReadyAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh protected resource checkpoint.');
  }
  if (!Number.isSafeInteger(expectedFounderCount) || expectedFounderCount < 1 || expectedFounderCount > 100) {
    fail('The resource checkpoint expected founder count was invalid.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    resourceV4AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  verifyExpectedAlphaV4ResourceReadyAggregate(result.stdout, expectedFounderCount);
}

export function alphaV8AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-alpha-v8',
    '--json',
  ];
}

export function alphaV10AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-alpha-v10',
    '--json',
  ];
}

export function alphaV12AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-alpha-v12',
    '--json',
  ];
}

export function publishPreV12AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-publish-pre-v12',
    '--json',
  ];
}

export function publishPostV12AggregateChildArguments(tsxCli) {
  return [
    tsxCli,
    'scripts/hermes-admin.ts',
    'inspect-publish-post-v12',
    '--json',
  ];
}

function parsePublishAggregateEnvelope(output, expectedKeys, label) {
  let envelope;
  try {
    envelope = JSON.parse(output);
  } catch {
    fail(`${label} did not return machine-readable JSON.`);
  }
  if (
    !envelope
    || typeof envelope !== 'object'
    || Array.isArray(envelope)
    || Object.keys(envelope).sort().join(',') !== [...expectedKeys].sort().join(',')
    || expectedKeys.some(key => (
      !envelope[key]
      || typeof envelope[key] !== 'object'
      || Array.isArray(envelope[key])
    ))
  ) fail(`${label} returned an invalid aggregate-only envelope.`);
  return Object.freeze({ ...envelope });
}

export function verifyPrivacySafePublishPreV12Output(output) {
  return parsePublishAggregateEnvelope(
    output,
    ['protocolV3', 'resourceV4'],
    'Pre-publication combined inspection',
  );
}

export function verifyPrivacySafePublishPostV12Output(output) {
  return parsePublishAggregateEnvelope(
    output,
    ['protocolV3', 'resourceV4', 'alphaV8', 'alphaV10', 'workerV12'],
    'Post-publication combined inspection',
  );
}

/**
 * The Hermes child already verifies exact v8 policy identities and catalog
 * shape. This second boundary accepts only its closed, aggregate-only JSON
 * envelope before the publisher treats the post-publication read as complete.
 */
export function verifyPrivacySafeAlphaStatusV8Output(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('Alpha procedure-v8 inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('Alpha procedure-v8 inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== ALPHA_V8_STATUS_KEYS.length
    || actualKeys.some((key, index) => key !== ALPHA_V8_STATUS_KEYS[index])
  ) {
    fail('Alpha procedure-v8 inspection returned unexpected fields.');
  }
  if (
    status.schemaProtocolVersion !== 8
    || status.backendProtocolVersion !== 3
    || !Number.isSafeInteger(status.forestLayoutVersion)
    || status.forestLayoutVersion < 1
  ) {
    fail('Alpha procedure-v8 inspection returned invalid protocol metadata.');
  }
  for (const field of ALPHA_V8_POLICY_FIELDS) {
    if (
      typeof status[field] !== 'string'
      || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(status[field])
    ) {
      fail('Alpha procedure-v8 inspection returned an invalid policy identifier.');
    }
  }
  for (const field of ALPHA_V8_DIGEST_FIELDS) {
    if (typeof status[field] !== 'string' || !/^[0-9a-f]{64}$/.test(status[field])) {
      fail('Alpha procedure-v8 inspection returned an invalid canonical digest.');
    }
  }
  for (const field of ALPHA_V8_COUNT_FIELDS) {
    const value = status[field];
    if (
      typeof value !== 'string'
      || !/^(?:0|[1-9]\d*)$/.test(value)
      || value.length > 20
      || BigInt(value) > U64_MAXIMUM
    ) {
      fail('Alpha procedure-v8 inspection returned an invalid aggregate count.');
    }
  }
  return Object.freeze({ ...status });
}

export function verifyFreshAlphaStatusV8Aggregate(
  secret,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh Alpha v8 checkpoint.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    alphaV8AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  return verifyPrivacySafeAlphaStatusV8Output(result.stdout);
}

/** Accept only the closed aggregate-only v10 JSON envelope from Hermes. */
export function verifyPrivacySafeAlphaStatusV10Output(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('Alpha procedure-v10 inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('Alpha procedure-v10 inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== ALPHA_V10_STATUS_KEYS.length
    || actualKeys.some((key, index) => key !== ALPHA_V10_STATUS_KEYS[index])
  ) fail('Alpha procedure-v10 inspection returned unexpected fields.');
  if (
    status.schemaProtocolVersion !== 10
    || status.backendProtocolVersion !== 3
    || !Number.isSafeInteger(status.waterLayoutVersion)
    || status.waterLayoutVersion < 1
    || typeof status.waterActivated !== 'boolean'
  ) fail('Alpha procedure-v10 inspection returned invalid protocol metadata.');
  for (const field of ALPHA_V10_POLICY_FIELDS) {
    if (
      typeof status[field] !== 'string'
      || !/^[a-z0-9][a-z0-9._:-]{0,127}$/i.test(status[field])
    ) fail('Alpha procedure-v10 inspection returned an invalid policy identifier.');
  }
  for (const field of ALPHA_V10_DIGEST_FIELDS) {
    if (typeof status[field] !== 'string' || !/^[0-9a-f]{64}$/.test(status[field])) {
      fail('Alpha procedure-v10 inspection returned an invalid canonical digest.');
    }
  }
  for (const field of ALPHA_V10_COUNT_FIELDS) {
    const value = status[field];
    if (
      typeof value !== 'string'
      || !/^(?:0|[1-9]\d*)$/.test(value)
      || value.length > 20
      || BigInt(value) > U64_MAXIMUM
    ) fail('Alpha procedure-v10 inspection returned an invalid aggregate count.');
  }
  return Object.freeze({ ...status });
}

export function verifyFreshAlphaStatusV10Aggregate(
  secret,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh Alpha v10 checkpoint.');
  }
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    alphaV10AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  return verifyPrivacySafeAlphaStatusV10Output(result.stdout);
}

/** Accept only the exact aggregate-only Worker v12 JSON envelope from Hermes. */
export function verifyPrivacySafeAlphaStatusV12Output(output) {
  let status;
  try {
    status = JSON.parse(output);
  } catch {
    fail('Alpha procedure-v12 inspection did not return machine-readable JSON.');
  }
  if (!status || typeof status !== 'object' || Array.isArray(status)) {
    fail('Alpha procedure-v12 inspection returned an invalid status object.');
  }
  const actualKeys = Object.keys(status).sort();
  if (
    actualKeys.length !== ALPHA_V12_STATUS_KEYS.length
    || actualKeys.some((key, index) => key !== ALPHA_V12_STATUS_KEYS[index])
  ) fail('Alpha procedure-v12 inspection returned unexpected fields.');
  for (const field of ALPHA_V12_U64_FIELDS) {
    const value = status[field];
    if (
      typeof value !== 'string'
      || !/^(?:0|[1-9]\d*)$/.test(value)
      || value.length > 20
      || BigInt(value) > U64_MAXIMUM
    ) fail('Alpha procedure-v12 inspection returned an invalid aggregate count.');
  }
  for (const field of ALPHA_V12_BOOLEAN_FIELDS) {
    if (typeof status[field] !== 'boolean') {
      fail('Alpha procedure-v12 inspection returned an invalid status flag.');
    }
  }
  if (
    (status.mode !== 'absent' && status.mode !== 'staged' && status.mode !== 'active')
    || (status.rosterDigest !== ''
      && (typeof status.rosterDigest !== 'string'
        || !/^[0-9a-f]{16}$/.test(status.rosterDigest)))
    || typeof status.rosterDigestExpected !== 'string'
    || !/^[0-9a-f]{16}$/.test(status.rosterDigestExpected)
  ) fail('Alpha procedure-v12 inspection returned invalid Worker metadata.');
  return Object.freeze({ ...status });
}

export function verifyEmptyAlphaStatusV12(status, expectedFounderCount) {
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
  ) fail('The empty Worker checkpoint expected founder count was invalid.');
  if (
    status.mode !== 'absent'
    || status.systemConfigValid !== false
    || status.legacyDrainRequired !== true
    || status.expectedCountsMatch !== false
    || status.rosterDigestMatches !== false
    || status.castlesMissingWorkers !== String(expectedFounderCount)
    || status.rosterDigest !== ''
    || EMPTY_WORKER_V12_ZERO_FIELDS.some(field => status[field] !== '0')
  ) {
    fail('Alpha procedure-v12 did not prove an empty, inert Worker suffix.');
  }
  return status;
}

export function verifyActiveAlphaStatusV12(status, expectedFounderCount) {
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
  ) fail('The active Worker checkpoint expected founder count was invalid.');
  const expectedWorkerCount = BigInt(expectedFounderCount * 4);
  const occupiedWorkerCount = BigInt(status.outboundWorkers)
    + BigInt(status.gatheringWorkers);
  const activeWorkerCount = BigInt(status.outboundWorkers)
    + BigInt(status.gatheringWorkers)
    + BigInt(status.returningWorkers);
  if (
    status.mode !== 'active'
    || status.systemRows !== '1'
    || status.systemConfigValid !== true
    || status.legacyDrainRequired !== false
    || status.expectedCastleCount !== String(expectedFounderCount)
    || status.expectedWorkerCount !== String(expectedWorkerCount)
    || status.actualWorkerCount !== String(expectedWorkerCount)
    || status.expectedCountsMatch !== true
    || status.rosterDigestMatches !== true
    || status.rosterDigest === ''
    || status.rosterDigest !== status.rosterDigestExpected
    || BigInt(status.idleWorkers) + activeWorkerCount !== expectedWorkerCount
    || BigInt(status.assignments) !== activeWorkerCount
    || BigInt(status.occupations) !== occupiedWorkerCount
    || BigInt(status.schedules) !== activeWorkerCount
    || ACTIVE_WORKER_V12_ZERO_FIELDS.some(field => status[field] !== '0')
  ) {
    fail('Alpha procedure-v12 did not prove an exact healthy active Worker graph.');
  }
  return status;
}

function verifyRepairableActiveAlphaStatusV12(
  status,
  expectedFounderCount,
  checkpoint,
) {
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
  ) fail('The repairable active Worker checkpoint expected founder count was invalid.');
  const expectedWorkerCount = BigInt(expectedFounderCount * 4);
  const outboundWorkers = BigInt(status.outboundWorkers);
  const gatheringWorkers = BigInt(status.gatheringWorkers);
  const returningWorkers = BigInt(status.returningWorkers);
  const activeWorkerCount = outboundWorkers + gatheringWorkers + returningWorkers;
  const expectedOccupationSiteMismatches = checkpoint
    === WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR
    ? '1'
    : checkpoint === WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING
      ? '0'
      : undefined;
  if (
    expectedOccupationSiteMismatches === undefined
    || status.mode !== 'active'
    || status.systemRows !== '1'
    || status.systemConfigValid !== true
    || status.legacyDrainRequired !== false
    || status.expectedCastleCount !== String(expectedFounderCount)
    || status.expectedWorkerCount !== String(expectedWorkerCount)
    || status.actualWorkerCount !== String(expectedWorkerCount)
    || status.expectedCountsMatch !== true
    || status.rosterDigestMatches !== true
    || status.rosterDigest === ''
    || status.rosterDigest !== status.rosterDigestExpected
    || returningWorkers < 1n
    || BigInt(status.idleWorkers) + activeWorkerCount !== expectedWorkerCount
    || BigInt(status.assignments) !== activeWorkerCount
    || BigInt(status.occupations) !== outboundWorkers + gatheringWorkers
    || BigInt(status.schedules) + 1n !== BigInt(status.assignments)
    || status.assignmentsWithoutSingleSchedule !== '1'
    || status.occupationSiteMismatches !== expectedOccupationSiteMismatches
    || REPAIRABLE_ACTIVE_WORKER_V12_ZERO_FIELDS.some(
      field => status[field] !== '0',
    )
  ) {
    fail('Alpha procedure-v12 did not prove the exact bounded return-node-reuse repair checkpoint.');
  }
  return status;
}

export function verifyReturnNodeReuseRepairAlphaStatusV12(
  status,
  expectedFounderCount,
  checkpoint,
) {
  if (
    checkpoint === WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING
  ) {
    try {
      return verifyRepairableActiveAlphaStatusV12(
        status,
        expectedFounderCount,
        WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
      );
    } catch {
      return verifyActiveAlphaStatusV12(status, expectedFounderCount);
    }
  }
  return verifyRepairableActiveAlphaStatusV12(
    status,
    expectedFounderCount,
    checkpoint,
  );
}

export function verifyAlphaStatusV12ForStage(
  status,
  expectedFounderCount,
  workerRolloutStage,
  workerForwardRepair = WORKER_FORWARD_REPAIR.NONE,
  workerForwardRepairCheckpoint = WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
) {
  if (
    workerForwardRepair === WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1
  ) {
    if (workerRolloutStage !== WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE) {
      fail('The return-node-reuse repair checkpoint requires the active Worker rollout stage.');
    }
    return verifyReturnNodeReuseRepairAlphaStatusV12(
      status,
      expectedFounderCount,
      workerForwardRepairCheckpoint,
    );
  }
  if (workerForwardRepair !== WORKER_FORWARD_REPAIR.NONE) {
    fail('The Alpha v12 checkpoint Worker forward-repair selection was invalid.');
  }
  if (workerRolloutStage === WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY) {
    return verifyEmptyAlphaStatusV12(status, expectedFounderCount);
  }
  if (workerRolloutStage === WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE) {
    return verifyActiveAlphaStatusV12(status, expectedFounderCount);
  }
  fail('The Alpha v12 checkpoint Worker rollout stage was invalid.');
}

export function verifyFreshAlphaStatusV12Aggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  const secretBytes = typeof secret === 'string' ? new TextEncoder().encode(secret).byteLength : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the fresh Alpha v12 checkpoint.');
  }
  if (
    !Number.isSafeInteger(expectedFounderCount)
    || expectedFounderCount < 1
    || expectedFounderCount > 100
  ) fail('The Alpha v12 checkpoint expected founder count was invalid.');
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const result = runBoundedSync(
    process.execPath,
    alphaV12AggregateChildArguments(tsxCli),
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout: 30_000,
    },
    spawnSyncProcess,
  );
  return verifyEmptyAlphaStatusV12(
    verifyPrivacySafeAlphaStatusV12Output(result.stdout),
    expectedFounderCount,
  );
}

function runCombinedPublishInspection(
  secret,
  arguments_,
  spawnSyncProcess,
  timeout,
) {
  const secretBytes = typeof secret === 'string'
    ? new TextEncoder().encode(secret).byteLength
    : 0;
  if (secretBytes < 32 || secretBytes > 512) {
    fail('A local 32-to-512-byte Hermes credential is required for the combined publication checkpoint.');
  }
  return runBoundedSync(
    process.execPath,
    arguments_,
    {
      env: {
        WARPKEEP_SPACETIMEDB_URI: CANONICAL_MAINCLOUD_URI,
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: CANONICAL_BRIDGE,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
      input: secret,
      timeout,
    },
    spawnSyncProcess,
  ).stdout;
}

function verifyCombinedProtocolV3AndResourceV4(
  envelope,
  expectations,
  resourceRolloutStage,
  genesisWorldRolloutStage,
) {
  const aggregateStage = foundedAggregateStageForWorldStage(
    genesisWorldRolloutStage,
  );
  verifyExpectedAlphaV3Aggregate(
    JSON.stringify(envelope.protocolV3),
    aggregateStage,
    expectations.expectedFounderCount,
    expectations.expectedPlayerCount,
    expectations.expectedTermsAcceptanceCount,
  );
  if (resourceRolloutStage === RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL) {
    verifyExpectedAlphaV4ResourcePrebackfillAggregate(
      JSON.stringify(envelope.resourceV4),
      expectations.expectedFounderCount,
    );
  } else if (resourceRolloutStage === RESOURCE_PUBLISH_ROLLOUT_STAGE.READY) {
    verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(envelope.resourceV4),
      expectations.expectedFounderCount,
    );
  } else {
    fail('The combined publication checkpoint resource stage was invalid.');
  }
}

function validateCombinedPublishStages(
  resourceRolloutStage,
  genesisWorldRolloutStage,
) {
  if (
    resourceRolloutStage !== RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL
    && resourceRolloutStage !== RESOURCE_PUBLISH_ROLLOUT_STAGE.READY
  ) fail('The combined publication checkpoint resource rollout stage was invalid.');
  foundedAggregateStageForWorldStage(genesisWorldRolloutStage);
}

export function verifyFreshPublishPreV12Aggregate(
  secret,
  expectations,
  resourceRolloutStage,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  const exactExpectations = validateFoundedPublishExpectations(expectations);
  validateCombinedPublishStages(resourceRolloutStage, genesisWorldRolloutStage);
  const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
  const output = runCombinedPublishInspection(
    secret,
    publishPreV12AggregateChildArguments(tsxCli),
    spawnSyncProcess,
    90_000,
  );
  const envelope = verifyPrivacySafePublishPreV12Output(output);
  verifyCombinedProtocolV3AndResourceV4(
    envelope,
    exactExpectations,
    resourceRolloutStage,
    genesisWorldRolloutStage,
  );
  return envelope;
}

export function verifyPostPublishCombinedV12Aggregate(
  secret,
  expectations,
  resourceRolloutStage,
  workerRolloutStage,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
  workerForwardRepair = WORKER_FORWARD_REPAIR.NONE,
  workerForwardRepairCheckpoint = WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
) {
  const exactExpectations = validateFoundedPublishExpectations(expectations);
  validateCombinedPublishStages(resourceRolloutStage, genesisWorldRolloutStage);
  if (
    workerRolloutStage !== WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY
    && workerRolloutStage !== WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE
  ) {
    fail('The post-publication Worker rollout stage was invalid.');
  }
  try {
    const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
    const output = runCombinedPublishInspection(
      secret,
      publishPostV12AggregateChildArguments(tsxCli),
      spawnSyncProcess,
      150_000,
    );
    const envelope = verifyPrivacySafePublishPostV12Output(output);
    verifyCombinedProtocolV3AndResourceV4(
      envelope,
      exactExpectations,
      resourceRolloutStage,
      genesisWorldRolloutStage,
    );
    verifyPrivacySafeAlphaStatusV8Output(JSON.stringify(envelope.alphaV8));
    verifyPrivacySafeAlphaStatusV10Output(JSON.stringify(envelope.alphaV10));
    verifyAlphaStatusV12ForStage(
      verifyPrivacySafeAlphaStatusV12Output(
        JSON.stringify(envelope.workerV12),
      ),
      exactExpectations.expectedFounderCount,
      workerRolloutStage,
      workerForwardRepair,
      workerForwardRepairCheckpoint,
    );
    return envelope;
  } catch {
    fail('Post-publication combined protocol-v3/v4/v8/v10/v12 checkpoint is indeterminate; a fresh read-only inspection is required before any Worker mutation, client deployment, or further publication decision.');
  }
}

/**
 * The already-v12 exception uses the same closed aggregate envelope before
 * publication. Its distinct error makes clear that no mutation was attempted.
 */
export function verifyFreshPublishExactV12Aggregate(
  secret,
  expectations,
  resourceRolloutStage,
  workerRolloutStage,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
  workerForwardRepair = WORKER_FORWARD_REPAIR.NONE,
  workerForwardRepairCheckpoint = WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
) {
  try {
    return verifyPostPublishCombinedV12Aggregate(
      secret,
      expectations,
      resourceRolloutStage,
      workerRolloutStage,
      spawnSyncProcess,
      genesisWorldRolloutStage,
      workerForwardRepair,
      workerForwardRepairCheckpoint,
    );
  } catch {
    fail('Exact-v12 pre-publication aggregate checkpoint failed. No publish was attempted; the Worker graph must remain at the explicitly selected rollout stage.');
  }
}

export function verifyPostPublishFoundedProtocolV3Aggregate(
  secret,
  expectations,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
) {
  try {
    verifyFreshFoundedProtocolV3Aggregate(
      secret,
      expectations,
      spawnSyncProcess,
      genesisWorldRolloutStage,
    );
  } catch {
    // Publication has already returned success. Never surface a preflight-style
    // "no publish attempted" message or invite another publication when only
    // the bounded post-publication inspection failed.
    fail('Post-publication protocol-v3 verification is indeterminate; a fresh read-only inspection is required before any backfill or further publication decision.');
  }
}

export function verifyPostPublishResourceProtocolV4PrebackfillAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  try {
    verifyFreshResourceProtocolV4PrebackfillAggregate(
      secret,
      expectedFounderCount,
      spawnSyncProcess,
    );
  } catch {
    // The module is already published. The operator must establish state with
    // a fresh bounded read-only inspection; neither backfill nor another
    // publication attempt is safe to suggest from this indeterminate point.
    fail('Post-publication resource procedure-v4 checkpoint is indeterminate; a fresh read-only inspection is required before any backfill or further publication decision.');
  }
}

export function verifyPostPublishResourceProtocolV4ReadyAggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  try {
    verifyFreshResourceProtocolV4ReadyAggregate(
      secret,
      expectedFounderCount,
      spawnSyncProcess,
    );
  } catch {
    fail('Post-publication ready resource procedure-v4 checkpoint is indeterminate; a fresh read-only inspection is required before any further publication decision.');
  }
}

export function verifyPostPublishAlphaStatusV8Aggregate(
  secret,
  spawnSyncProcess = spawnSync,
) {
  try {
    return verifyFreshAlphaStatusV8Aggregate(secret, spawnSyncProcess);
  } catch {
    fail('Post-publication Alpha procedure-v8 checkpoint is indeterminate; a fresh read-only v8 inspection is required before any component seed or further publication decision.');
  }
}

export function verifyPostPublishAlphaStatusV10Aggregate(
  secret,
  spawnSyncProcess = spawnSync,
) {
  try {
    return verifyFreshAlphaStatusV10Aggregate(secret, spawnSyncProcess);
  } catch {
    fail('Post-publication Alpha procedure-v10 checkpoint is indeterminate; a fresh read-only v10 inspection is required before Water or Stone activation.');
  }
}

export function verifyPostPublishAlphaStatusV12Aggregate(
  secret,
  expectedFounderCount,
  spawnSyncProcess = spawnSync,
) {
  try {
    return verifyFreshAlphaStatusV12Aggregate(
      secret,
      expectedFounderCount,
      spawnSyncProcess,
    );
  } catch {
    fail('Post-publication Alpha procedure-v12 checkpoint is indeterminate; a fresh read-only v12 inspection is required before any merge, client deployment, Worker seed, backfill, activation, or further publication decision.');
  }
}

export function verifyPostPublishResourcePublicationCheckpoints(
  secret,
  expectations,
  resourceRolloutStage,
  workerRolloutStage,
  spawnSyncProcess = spawnSync,
  genesisWorldRolloutStage = GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
  workerForwardRepair = WORKER_FORWARD_REPAIR.NONE,
  workerForwardRepairCheckpoint = WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
) {
  return verifyPostPublishCombinedV12Aggregate(
    secret,
    expectations,
    resourceRolloutStage,
    workerRolloutStage,
    spawnSyncProcess,
    genesisWorldRolloutStage,
    workerForwardRepair,
    workerForwardRepairCheckpoint,
  );
}

export async function publishModule(
  spacetimeCommand,
  targetDatabase,
  artifactReceipt,
  spawnProcess = spawn,
) {
  if (targetDatabase !== CANONICAL_DATABASE_IDENTITY) {
    fail('The production publish target was not the pinned canonical database identity.');
  }
  const artifact = validateMigrationArtifactReceiptShape(artifactReceipt);
  const artifactSnapshot = createPrivatePublishSnapshot(
    artifact.artifactPath,
    artifact.artifactDigest,
    PRIVATE_SNAPSHOT_KINDS.ARTIFACT,
  );
  const arguments_ = [
    'publish',
    '--server', CANONICAL_MAINCLOUD_URI,
    '--js-path', artifactSnapshot.path,
    '--delete-data=never',
    '--yes=remote',
    '--no-config',
    targetDatabase,
  ];
  try {
    await new Promise((resolvePromise, rejectPromise) => {
      let settled = false;
      let timedOut = false;
      let outputExceeded = false;
      let outputBytes = 0;
      let deadline;
      let forcedKill;
      const settle = (callback) => {
        if (settled) return;
        settled = true;
        if (deadline !== undefined) clearTimeout(deadline);
        if (forcedKill !== undefined) clearTimeout(forcedKill);
        callback();
      };

      let child;
      try {
        child = spawnProcess(spacetimeCommand, arguments_, {
          cwd: repositoryRoot,
          // A compatibility or break-clients prompt must see EOF and abort. The
          // bounded output is consumed without mirroring private process detail.
          stdio: ['ignore', 'pipe', 'pipe'],
          // The CLI uses local config/Home and standard network settings. It
          // never receives ambient Warpkeep signing, admin, RPC, or review data.
          env: publishChildEnvironment(),
        });
      } catch (error) {
        settle(() => rejectPromise(error));
        return;
      }
      const observeOutput = (stream) => {
        if (!stream || typeof stream.on !== 'function') return;
        stream.on('data', chunk => {
          outputBytes += chunk.byteLength;
          if (outputBytes <= MAX_CHILD_OUTPUT_BYTES || outputExceeded) return;
          outputExceeded = true;
          try { child.kill('SIGKILL'); } catch { /* The bounded failure remains generic. */ }
          forcedKill = setTimeout(() => {
            settle(() => rejectPromise(new Error('SpacetimeDB publish output exceeded its fixed bound.')));
          }, PUBLISH_KILL_GRACE_MILLISECONDS);
        });
      };
      observeOutput(child.stdout);
      observeOutput(child.stderr);
      child.on('error', (error) => {
        // A signal-delivery error can arrive after the deadline. Keep the forced
        // SIGKILL timer alive in that case instead of abandoning the child. Keep
        // this listener installed so a second kill-delivery error is not emitted
        // as an unhandled EventEmitter error after forced settlement.
        if (!timedOut) settle(() => rejectPromise(error));
      });
      child.once('close', (code) => settle(() => {
        if (!timedOut && !outputExceeded && code === 0) resolvePromise();
        else rejectPromise(new Error('SpacetimeDB publish did not complete successfully.'));
      }));

      deadline = setTimeout(() => {
        timedOut = true;
        try { child.kill('SIGTERM'); } catch { /* Fall through to the forced deadline. */ }
        forcedKill = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* The outcome remains indeterminate. */ }
          // Do not wait indefinitely for a child that ignores termination or
          // withholds its close event. Treat the publication outcome as
          // indeterminate and require a fresh read-only inspection.
          settle(() => rejectPromise(new Error('SpacetimeDB publish exceeded its hard deadline.')));
        }, PUBLISH_KILL_GRACE_MILLISECONDS);
      }, PUBLISH_TIMEOUT_MILLISECONDS);
    });
  } finally {
    artifactSnapshot.cleanup();
  }
}

async function main() {
  const {
    dryRun,
    resourceRolloutStage,
    genesisWorldRolloutStage,
    workerRolloutStage,
    workerModulePredecessor,
    workerForwardRepair,
  } = parsePublishArguments();
  requireCanonicalPublishCoordinates();
  if (database !== CANONICAL_DATABASE) fail('The production publisher target was not canonical.');
  const issuer = requireHttpsOrigin(configuredIssuer, 'WARPKEEP_OIDC_ISSUER');
  if (issuer !== CANONICAL_BRIDGE) fail('The production issuer was not canonical.');
  const sourceConfig = await readFile(sourceConfigPath, 'utf8');
  const sourceMatch = sourceConfig.match(/^export const WARPKEEP_OIDC_ISSUER\s*=\s*'([^']+)';\s*$/m);
  if (!sourceMatch || sourceMatch[1] !== issuer) {
    fail('The module source issuer must exactly match WARPKEEP_OIDC_ISSUER before publishing.');
  }
  if (!dryRun && process.env.WARPKEEP_PUBLISH_CONFIRM !== database) {
    fail(`Set WARPKEEP_PUBLISH_CONFIRM=${database} after reviewing the target database; publish was not attempted.`);
  }
  const foundedExpectations = readFoundedPublishExpectations();
  // Remove the Hermes credential from the ambient environment before the
  // long-running proof spawns any children. The bounded aggregate helpers
  // receive it only through stdin and every child environment stays allowlisted.
  let adminTokenSecret = process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  delete process.env.WARPKEEP_ADMIN_TOKEN_SECRET;
  const executableSnapshot = attestPinnedSpacetimeCli(command);
  try {
    // Keep every proof, inspection, publish, and checkpoint bound to the one
    // attested CLI copy for this complete publication lifecycle.
    const executable = executableSnapshot.path;
    const artifactReceipt = runCurrentAdditiveMigrationProof(executable);
    if (dryRun) {
      await validateIssuerDeployment(issuer);
      console.log(`Dry run: verified the pinned CLI, current additive migration, founded-state expectation contract, explicit ${resourceRolloutStage} resource stage, explicit ${genesisWorldRolloutStage} Genesis world stage, explicit ${workerRolloutStage} Worker stage, explicit ${workerModulePredecessor} module predecessor, explicit ${workerForwardRepair} Worker forward-repair selection, and ${issuer}; would update the canonical existing database without deleting data.`);
      return;
    }
    await validateIssuerDeployment(issuer);
    attestCanonicalDatabase(executable);
    if (
      workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V12_EMPTY
      || workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE
      || workerModulePredecessor === WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE
    ) {
      const exactV13Active = workerModulePredecessor
        === WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE;
      const predecessorSchema = exactV13Active
        ? verifyFreshProductionV13ModuleSchema(
          executable,
          artifactReceipt.v12TableSchemaDigest,
          artifactReceipt.v13TableSchemaDigest,
        )
        : verifyFreshProductionV12ModuleSchema(
          executable,
          artifactReceipt.v12TableSchemaDigest,
        );
      if (exactV13Active) {
        verifyWorkerV13ModulePredecessor(
          predecessorSchema.moduleState,
          workerModulePredecessor,
        );
      } else {
        verifyWorkerV12ModulePredecessor(
          predecessorSchema.moduleState,
          workerModulePredecessor,
        );
      }
      const publicationPlan = planWorkerV12CodePublication(
        predecessorSchema.moduleState,
        workerForwardRepair,
      );
      verifyFreshPublishExactV12Aggregate(
        adminTokenSecret,
        foundedExpectations,
        resourceRolloutStage,
        workerRolloutStage,
        spawnSync,
        genesisWorldRolloutStage,
        workerForwardRepair,
        publicationPlan.prePublicationCheckpoint,
      );
      await publishModule(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt);
      if (exactV13Active) {
        verifyPostPublishProductionV13ActiveModuleSchema(
          executable,
          predecessorSchema,
          artifactReceipt.v12TableSchemaDigest,
          artifactReceipt.v13TableSchemaDigest,
        );
      } else {
        verifyPostPublishProductionV13ModuleSchema(
          executable,
          predecessorSchema,
          artifactReceipt.v12TableSchemaDigest,
          artifactReceipt.v13TableSchemaDigest,
        );
      }
      verifyPostPublishResourcePublicationCheckpoints(
        adminTokenSecret,
        foundedExpectations,
        resourceRolloutStage,
        workerRolloutStage,
        spawnSync,
        genesisWorldRolloutStage,
        workerForwardRepair,
        publicationPlan.postPublicationCheckpoint,
      );
      if (
        workerForwardRepair === WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1
      ) {
        const receipt = writePrivateSpacetimePublishSuccessReceipt({
          directory:
            process.env.WARPKEEP_SPACETIME_PUBLISH_RECEIPT_DIR
            ?? defaultSpacetimePublishReceiptDirectory(),
          repositoryRoot,
          artifactDigest: artifactReceipt.artifactDigest,
          v12TableSchemaDigest: artifactReceipt.v12TableSchemaDigest,
          workerForwardRepair,
          postPublicationCheckpoint:
            publicationPlan.postPublicationCheckpoint,
        });
        console.log(JSON.stringify({
          publication: 'verified',
          deletion: 'disabled',
          receiptDigest: receipt.receiptDigest,
        }));
      }
    } else {
      const predecessorSchema = verifyFreshProductionV11Schema(
        executable,
        artifactReceipt.v11TableSchemaDigest,
      );
      verifyFreshPublishPreV12Aggregate(
        adminTokenSecret,
        foundedExpectations,
        resourceRolloutStage,
        spawnSync,
        genesisWorldRolloutStage,
      );
      await publishModule(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt);
      verifyPostPublishProductionV13SchemaFromV11(
        executable,
        predecessorSchema,
        artifactReceipt.v12TableSchemaDigest,
        artifactReceipt.v13TableSchemaDigest,
      );
      verifyPostPublishResourcePublicationCheckpoints(
        adminTokenSecret,
        foundedExpectations,
        resourceRolloutStage,
        workerRolloutStage,
        spawnSync,
        genesisWorldRolloutStage,
        workerForwardRepair,
        WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
      );
    }
  } finally {
    adminTokenSecret = undefined;
    executableSnapshot.cleanup();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof SafePublishError
      ? error.message
      : 'Non-destructive publish did not complete. The outcome may be indeterminate; perform a fresh read-only Maincloud inspection before any further publication decision.');
    process.exitCode = 1;
  });
}
