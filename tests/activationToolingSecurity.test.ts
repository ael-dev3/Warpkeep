import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import {
  readFileSync,
  realpathSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_REQUEST_V13_TABLE_CONTRACTS,
  DAILY_MARK_V14_TABLE_CONTRACTS,
  GENESIS_WORLD_PUBLISH_STAGE,
  INNER_KEEP_MODULE_PREDECESSOR,
  INNER_KEEP_PUBLICATION_STAGE,
  INNER_KEEP_V15_TABLE_CONTRACTS,
  PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  RESOURCE_PUBLISH_ROLLOUT_STAGE,
  WORKER_FORWARD_REPAIR,
  WORKER_FORWARD_REPAIR_CHECKPOINT,
  WORKER_MODULE_PREDECESSOR,
  WORKER_PUBLISH_ROLLOUT_STAGE,
  WORKER_V12_TABLE_CONTRACTS,
  accessRequestV13InspectChildArguments,
  alphaV10AggregateChildArguments,
  alphaV12AggregateChildArguments,
  alphaV8AggregateChildArguments,
  canonicalSchemaDescribeChildArguments,
  createPrivatePublishSnapshot,
  dailyMarksV14InspectChildArguments,
  executeProtocolV15InactivePublicationLane,
  innerKeepV15InspectChildArguments,
  parseCanonicalSchemaDescription,
  parseMigrationProofReceipt,
  parsePublishArguments,
  planWorkerV12CodePublication,
  publishPostV12AggregateChildArguments,
  publishPreV12AggregateChildArguments,
  publishChildEnvironment,
  publishModule,
  readFoundedPublishExpectations,
  requireCanonicalPublishCoordinates,
  requireEntryAgreementProductionRelease,
  requireCurrentReviewOnlyProductionPublishReady,
  requireGreaterRealmV17ProductionPublishReady,
  requireRealmChatV16ProductionPublishReady,
  requireReviewedAdditivePublicationLane,
  runCurrentAdditiveMigrationProof,
  validateIssuerDeployment,
  verifyCanonicalDatabaseList,
  verifyFreshAlphaStatusV8Aggregate,
  verifyFreshAlphaStatusV10Aggregate,
  verifyFreshAlphaStatusV12Aggregate,
  verifyFreshAccessRequestV13Aggregate,
  verifyFreshPublishExactV12Aggregate,
  verifyFreshPublishPreV12Aggregate,
  verifyFreshProductionV11Schema,
  verifyFreshProductionV12ModuleSchema,
  verifyFreshProductionV13ModuleSchema,
  verifyFreshProductionV14ModuleSchema,
  verifyFreshProductionV14InnerKeepPredecessor,
  verifyFreshActiveDailyMarksV14,
  verifyFreshFoundedProtocolV3Aggregate,
  verifyFreshResourceProtocolV4PrebackfillAggregate,
  verifyFreshResourceProtocolV4ReadyAggregate,
  verifyMigrationArtifactReceipt,
  verifyEmptyDailyMarksV14StatusOutput,
  verifyEmptyInactiveInnerKeepV15StatusOutput,
  verifyActiveDailyMarksV14StatusOutput,
  verifyPinnedCliAttestation,
  verifyPostPublishAlphaStatusV8Aggregate,
  verifyPostPublishAlphaStatusV10Aggregate,
  verifyPostPublishAlphaStatusV12Aggregate,
  verifyPostPublishAccessRequestV13Aggregate,
  verifyPostPublishCombinedV12Aggregate,
  verifyPostPublishFoundedProtocolV3Aggregate,
  verifyPostPublishProductionV12Schema,
  verifyPostPublishProductionV12ModuleSchema,
  verifyPostPublishProductionV13ModuleSchema,
  verifyPostPublishProductionV13ActiveModuleSchema,
  verifyPostPublishProductionV13SchemaFromV11,
  verifyPostPublishProductionV14ModuleSchema,
  verifyPostPublishProductionV14ActiveModuleSchema,
  verifyPostPublishProductionV15InactiveModuleSchema,
  verifyPostPublishEmptyDailyMarksV14,
  verifyPostPublishEmptyInactiveInnerKeepV15,
  verifyPostPublishActiveDailyMarksV14,
  verifyPostPublishResourceProtocolV4PrebackfillAggregate,
  verifyPostPublishResourceProtocolV4ReadyAggregate,
  verifyPostPublishResourcePublicationCheckpoints,
  verifyPrivacySafeAlphaStatusV8Output,
  verifyPrivacySafeAlphaStatusV10Output,
  verifyPrivacySafeAlphaStatusV12Output,
  verifyPrivacySafeAccessRequestV13AggregateOutput,
  verifyPrivacySafePublishPostV12Output,
  verifyPrivacySafePublishPreV12Output,
  verifyActiveAlphaStatusV12,
  verifyAlphaStatusV12ForStage,
  verifyEmptyAlphaStatusV12,
  verifyReturnNodeReuseRepairAlphaStatusV12,
  verifyExactProductionV11Schema,
  verifyExactProductionV12Schema,
  verifyExactProductionV12ModuleSchema,
  verifyWorkerV12ModuleAbi,
  verifyWorkerV12ModulePredecessor,
  verifyExactProductionV13Schema,
  verifyExactProductionV13SchemaFromV11,
  verifyExactProductionV13ModuleSchema,
  verifyExactProductionV14Schema,
  verifyExactProductionV14ModuleSchema,
  verifyExactProductionV14InnerKeepPredecessor,
  verifyExactProductionV15Schema,
  verifyExactProductionV15ModuleSchema,
  verifyHistoricalPublicationAggregateUnchanged,
  verifyInnerKeepV14PredecessorAbi,
  verifyInnerKeepV15ModuleAbi,
  verifyWorkerV13ModulePredecessor,
  verifyWorkerV14ModulePredecessor,
} from '../scripts/publish-spacetime-dev.mjs';
import {
  readPrivateSpacetimePublishSuccessReceipt,
  writePrivateSpacetimePublishSuccessReceipt,
} from '../scripts/spacetime-publish-receipt.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS, ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS, ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION, ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION, formatAdditiveMigrationProofReceipt } from '../scripts/spacetime-additive-migration-proof.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { canonicalTableSchemaBoundaryDigest } from '../scripts/spacetime-table-schema-attestation.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { PROTECTED_AGGREGATE_STAGE, parseProductionVerifierArguments, protectedAggregateChildArguments, protectedAggregateChildEnvironment, protectedAggregateChildOptions, requiredProtectedAggregateSecret, resourceV4AggregateChildArguments, resourceV4ReadyAggregateChildEnvironment, resourceV4ReadyAggregateChildOptions, rootAssetUrls, shouldInspectConfiguredProtectedAggregate, validateProductionSigningKey, verifyBridge, verifyExpectedAlphaAggregate, verifyExpectedAlphaV2Aggregate, verifyExpectedAlphaV3Aggregate, verifyExpectedAlphaV4ResourcePrebackfillAggregate, verifyExpectedAlphaV4ResourceReadyAggregate, verifyFrontendEmbeddingHeaders, verifyPostBackfillResourceAggregateCheckpoints, verifyRootAssets } from '../scripts/verify-alpha-production.mjs';
// @ts-expect-error Repository JavaScript scripts intentionally expose test hooks.
import { cleanupMigrationProofResources, containServerProcessErrors, installMigrationProofSignalCleanup, stopServer } from '../scripts/verify-spacetime-additive-migration.mjs';
import {
  ALPHA_ACTIVATION_COMPONENTS,
  ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../spacetimedb/src/alphaActivationPolicy';
import {
  ALPHA_V10_ACTIVATION_COMPONENTS,
  ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
} from '../spacetimedb/src/alphaV10ActivationPolicy';
import { WARPKEEP_BACKEND_PROTOCOL_VERSION } from '../spacetimedb/src/config';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const provenArtifactPath = resolve(repositoryRoot, 'spacetimedb/dist/bundle.js');
const CANONICAL_DATABASE_IDENTITY = 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e';
const ISSUER = 'https://auth.warpkeep.com';
const FRONTEND = 'https://warpkeep.com';
const AUTH_V2_CLAIMS = [
  'sub',
  'aud',
  'fid',
  'token_type',
  'auth_version',
  'auth_epoch',
  'roles',
  'session_iat',
  'session_exp',
];
const AUTH_V2_SECURITY_HEADERS = {
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'referrer-policy': 'no-referrer',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'cross-origin-opener-policy': 'same-origin',
  'cross-origin-resource-policy': 'same-site',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'x-permitted-cross-domain-policies': 'none',
};
const AUTH_V2_CREDENTIAL_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
  '/v2/session/logout',
]);
const AUTH_V2_QUICK_AUTH_PATH = '/v2/farcaster/quick-auth/exchange';
const AUTH_V2_ACCESS_REQUEST_PATHS = new Set([
  '/v2/access/status',
  '/v2/access/request',
]);
const AUTH_V2_PAUSED_PATHS = new Set([
  '/v2/farcaster/challenge',
  '/v2/farcaster/exchange',
  '/v2/session/refresh',
  AUTH_V2_QUICK_AUTH_PATH,
  ...AUTH_V2_ACCESS_REQUEST_PATHS,
]);
const AUTH_V2_SERVER_ONLY_ADMIN_PATHS = new Set([
  '/v1/admin/token',
  '/v1/admin/auth-epoch-probe',
  '/v1/admin/config-attestation',
]);
let publicJwk: JsonWebKey;

function alphaStatusV8(overrides: Record<string, unknown> = {}) {
  const { gold, forest, food, wood } = ALPHA_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    goldSitePolicyVersion: gold.sitePolicyVersion,
    goldExpeditionPolicyVersion: gold.expeditionPolicyVersion,
    canonicalGoldSiteCatalogDigest: gold.siteCatalogDigest,
    goldSites: '0',
    canonicalGoldSites: '0',
    goldOccupations: '0',
    goldExpeditions: '0',
    goldIdempotencyReceipts: '0',
    goldSchedules: '0',
    forestLayoutVersion: forest.layoutVersion,
    forestPolicyVersion: forest.policyVersion,
    canonicalForestLayoutDigest: forest.layoutDigest,
    canonicalForestAssetCatalogDigest: forest.assetCatalogDigest,
    forestLayouts: '0',
    canonicalForestLayouts: '0',
    forestInstances: '0',
    canonicalForestInstances: '0',
    foodSitePolicyVersion: food.sitePolicyVersion,
    foodExpeditionPolicyVersion: food.expeditionPolicyVersion,
    canonicalFoodSiteCatalogDigest: food.siteCatalogDigest,
    foodSites: '0',
    canonicalFoodSites: '0',
    foodOccupations: '0',
    foodExpeditions: '0',
    foodIdempotencyReceipts: '0',
    foodSchedules: '0',
    woodSitePolicyVersion: wood.sitePolicyVersion,
    woodExpeditionPolicyVersion: wood.expeditionPolicyVersion,
    canonicalWoodSiteCatalogDigest: wood.siteCatalogDigest,
    woodSites: '0',
    canonicalWoodSites: '0',
    woodOccupations: '0',
    woodExpeditions: '0',
    woodIdempotencyReceipts: '0',
    woodSchedules: '0',
    ...overrides,
  };
}

function alphaStatusV10(overrides: Record<string, unknown> = {}) {
  const { water, stone } = ALPHA_V10_ACTIVATION_COMPONENTS;
  return {
    schemaProtocolVersion: ALPHA_V10_ACTIVATION_SCHEMA_PROTOCOL_VERSION,
    backendProtocolVersion: WARPKEEP_BACKEND_PROTOCOL_VERSION,
    waterPolicyVersion: water.policyVersion,
    waterLayoutVersion: water.layoutVersion,
    canonicalWaterLayoutDigest: water.layoutDigest,
    waterActivated: false,
    waterLayouts: '0',
    canonicalWaterLayouts: '0',
    waterBodies: '0',
    canonicalWaterBodies: '0',
    waterCells: '0',
    canonicalWaterCells: '0',
    realmEnvironments: '0',
    canonicalRealmEnvironments: '0',
    stoneSitePolicyVersion: stone.sitePolicyVersion,
    stoneExpeditionPolicyVersion: stone.expeditionPolicyVersion,
    canonicalStoneSiteCatalogDigest: stone.siteCatalogDigest,
    stoneSites: '0',
    canonicalStoneSites: '0',
    stoneOccupations: '0',
    stoneExpeditions: '0',
    stoneIdempotencyReceipts: '0',
    stoneSchedules: '0',
    ...overrides,
  };
}

function alphaStatusV12(overrides: Record<string, unknown> = {}) {
  const zeroCounts = Object.fromEntries([
    'systemRows', 'expectedCastleCount', 'expectedWorkerCount', 'actualWorkerCount',
    'castlesWithExtraWorkers', 'duplicateOrdinals', 'malformedWorkerIds',
    'invalidWorkerStates', 'idleWorkers', 'outboundWorkers', 'gatheringWorkers',
    'returningWorkers', 'assignments', 'occupations', 'schedules', 'orphanWorkers',
    'orphanAssignments', 'assignmentsMissingOccupation',
    'assignmentsWithoutSingleSchedule', 'orphanOccupations', 'orphanSchedules',
    'invalidSchedules', 'assignmentPublicMismatches', 'occupationSiteMismatches',
    'invalidAssignments', 'idempotencyReceipts', 'invalidIdempotencyReceipts',
    'idempotencyOverflowFids',
  ].map(field => [field, '0']));
  return {
    ...zeroCounts,
    mode: 'absent',
    systemConfigValid: false,
    legacyDrainRequired: true,
    expectedCountsMatch: false,
    rosterDigestMatches: false,
    castlesMissingWorkers: '4',
    legacyExpeditions: '2',
    legacyOccupations: '1',
    legacySchedules: '3',
    rosterDigest: '',
    rosterDigestExpected: '0123456789abcdef',
    ...overrides,
  };
}

function activeAlphaStatusV12(overrides: Record<string, unknown> = {}) {
  return alphaStatusV12({
    systemRows: '1',
    expectedCastleCount: '4',
    expectedWorkerCount: '16',
    actualWorkerCount: '16',
    idleWorkers: '12',
    outboundWorkers: '1',
    gatheringWorkers: '2',
    returningWorkers: '1',
    assignments: '4',
    occupations: '3',
    schedules: '4',
    idempotencyReceipts: '7',
    mode: 'active',
    systemConfigValid: true,
    legacyDrainRequired: false,
    expectedCountsMatch: true,
    rosterDigestMatches: true,
    castlesMissingWorkers: '0',
    legacyExpeditions: '0',
    legacyOccupations: '0',
    legacySchedules: '0',
    rosterDigest: '0123456789abcdef',
    rosterDigestExpected: '0123456789abcdef',
    ...overrides,
  });
}

function repairableActiveAlphaStatusV12(
  checkpoint: 'active-predecessor' | 'candidate-pending',
  overrides: Record<string, unknown> = {},
) {
  return activeAlphaStatusV12({
    schedules: '3',
    assignmentsWithoutSingleSchedule: '1',
    occupationSiteMismatches:
      checkpoint === 'active-predecessor' ? '1' : '0',
    ...overrides,
  });
}

function publishProtocolV3Status(overrides: Record<string, unknown> = {}) {
  const invariantFields = [
    'orphanedPlayerRowsV2',
    'orphanedOwnershipRowsV2',
    'orphanedCastleClaims',
    'orphanedCastles',
    'orphanedRealmProfiles',
    'orphanedMarkAccounts',
    'orphanedBurnCredits',
    'orphanedTermsAcceptances',
    'founderStateGaps',
    'markAccountInvariantViolations',
    'publicMarkProjectionViolations',
    'duplicateBurnReferences',
    'burnAccountReconciliationViolations',
    'ambiguousActiveWalletAddresses',
    'staticWorldDriftViolations',
    'termsAcceptanceInvariantViolations',
  ];
  return {
    worldTiles: '1261',
    occupiedWorldTiles: '4',
    worldTileMeta: '1261',
    realms: '1',
    castleSlots: '100',
    castleSlotClaims: '4',
    legacyPlayers: '0',
    playersV2: '1',
    playerOwnershipsV2: '1',
    castles: '4',
    realmProfiles: '4',
    markAccounts: '4',
    snapBurnCredits: '0',
    walletAttributions: '0',
    walletAttributionSnapshots: '0',
    scanCursors: '0',
    scanBatches: '0',
    alphaTermsAcceptances: '1',
    allowedFids: '4',
    enabledAllowedFids: '4',
    auditEntries: '7',
    ...Object.fromEntries(invariantFields.map(field => [field, '0'])),
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
    ...overrides,
  };
}

function publishResourceV4Status(
  stage: 'prebackfill' | 'ready' = 'prebackfill',
  overrides: Record<string, unknown> = {},
) {
  return {
    allowedFids: '4',
    castles: '4',
    markAccounts: '4',
    resourceAccounts: stage === 'ready' ? '4' : '0',
    missingResourceAccounts: stage === 'ready' ? '0' : '4',
    orphanedResourceAccounts: '0',
    resourceInvariantViolations: '0',
    protocolVersion: 3,
    resourcePolicyVersion: 'genesis-resource-yield-v1',
    ...overrides,
  };
}

function emptyDailyMarksV14Status(overrides: Record<string, unknown> = {}) {
  return {
    policyVersion: 'admitted-daily-mark-v1',
    utcDay: '20665',
    allowedFids: '4',
    enabledAllowedFids: '3',
    markAccounts: '4',
    dailyAccounts: '0',
    legacyZeroAccounts: '4',
    invalidAccounts: '0',
    realmProfiles: '4',
    profileProjectionViolations: '0',
    missingFounderState: '0',
    grants: '0',
    currentDayGrants: '0',
    grantInvariantViolations: '0',
    grantAccountReconciliationViolations: '0',
    scheduleRows: '0',
    scheduleConfigValid: true,
    legacyCompatibilityRows: '0',
    readyForBackfill: true,
    readyForActivation: false,
    active: false,
    ...overrides,
  };
}

function activeDailyMarksV14Status(overrides: Record<string, unknown> = {}) {
  return {
    ...emptyDailyMarksV14Status(),
    dailyAccounts: '4',
    legacyZeroAccounts: '0',
    grants: '21',
    currentDayGrants: '3',
    scheduleRows: '1',
    readyForBackfill: false,
    readyForActivation: false,
    active: true,
    ...overrides,
  };
}

function emptyInactiveInnerKeepV15Status(
  overrides: Record<string, unknown> = {},
) {
  return {
    layoutRows: '0',
    slotRows: '0',
    buildingCatalogRows: '0',
    levelPolicyRows: '0',
    castleRows: '4',
    builderRows: '0',
    buildingRows: '0',
    activeProjects: '0',
    receiptRows: '0',
    scheduleRows: '0',
    missingBuilders: '4',
    orphanBuilders: '0',
    invalidBuilders: '0',
    invalidBuildings: '0',
    invalidSchedules: '0',
    builderProjectMismatches: '0',
    staticCatalogExact: false,
    workerSystemReady: true,
    readyForCatalogSeed: true,
    readyForBuilderBackfill: false,
    readyForActivation: false,
    active: false,
    policyVersion: 'genesis-001-inner-keep-construction-v1',
    policyDigest: 'a'.repeat(64),
    layoutPolicyVersion: 'genesis-001-inner-keep-free-placement-v1',
    layoutDigest: 'b'.repeat(64),
    assetCatalogDigest: 'c'.repeat(64),
    ...overrides,
  };
}

function productionSchemaDescription(includeWorkerV12: boolean) {
  const refs: Record<string, number> = {
    ...PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  };
  if (includeWorkerV12) {
    for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
      refs[name] = contract.productTypeRef;
    }
  }
  const types: Array<{
    Product: {
      elements: Array<{
        name: { some: string };
        algebraic_type: Record<string, unknown>;
      }>;
    };
  }> = Array.from({ length: Math.max(...Object.values(refs)) + 1 }, (_unused, ref) => ({
    Product: { elements: [{ name: { some: `legacy_field_${ref}` }, algebraic_type: { U64: {} } }] },
  }));
  const tables: Array<{
    name: string;
    product_type_ref: number;
    table_access: Record<string, object>;
    indexes: Array<Record<string, unknown>>;
    constraints: Array<Record<string, unknown>>;
  }> = Object.entries(refs).map(([name, productTypeRef]) => ({
    name,
    product_type_ref: productTypeRef,
    table_access: { [name === 'admin_audit' ? 'Private' : 'Public']: {} },
    indexes: [{ name: `${name}_by_primary`, algorithm: { BTree: { columns: [0] } } }],
    constraints: [{ name: `${name}_primary`, data: { Unique: { columns: [0] } } }],
  }));
  if (includeWorkerV12) {
    for (const [name, contract] of Object.entries(WORKER_V12_TABLE_CONTRACTS)) {
      types[contract.productTypeRef] = {
        Product: {
          elements: contract.fields.map(field => ({
            name: { some: field },
            algebraic_type: { String: {} },
          })),
        },
      };
      const table = tables.find(candidate => candidate.name === name)!;
      table.table_access = { [contract.access]: {} };
    }
  }
  return { tables, typespace: { types } };
}

function withAccessRequestV13<T>(description: T): T {
  const candidate = structuredClone(description) as T & {
    tables: Array<{
      name: string;
      product_type_ref: number;
      table_access: Record<string, object>;
      indexes: Array<Record<string, unknown>>;
      constraints: Array<Record<string, unknown>>;
    }>;
    typespace: {
      types: Array<{
        Product: {
          elements: Array<{
            name: { some: string };
            algebraic_type: Record<string, unknown>;
          }>;
        };
      }>;
    };
  };
  const [name, contract] = Object.entries(
    ACCESS_REQUEST_V13_TABLE_CONTRACTS,
  )[0]!;
  candidate.typespace.types[contract.productTypeRef] = {
    Product: {
      elements: contract.fields.map((field, index) => ({
        name: { some: field },
        algebraic_type: index === 0 ? { U64: {} } : { Timestamp: {} },
      })),
    },
  };
  candidate.tables.push({
    name,
    product_type_ref: contract.productTypeRef,
    table_access: { [contract.access]: {} },
    indexes: [{
      name: `${name}_by_primary`,
      algorithm: { BTree: { columns: [0] } },
    }],
    constraints: [{
      name: `${name}_primary`,
      data: { Unique: { columns: [0] } },
    }],
  });
  return candidate;
}

function withDailyMarksV14<T>(description: T): T {
  const candidate = structuredClone(description) as T & {
    tables: Array<{
      name: string;
      product_type_ref: number;
      table_access: Record<string, object>;
      indexes: Array<Record<string, unknown>>;
      constraints: Array<Record<string, unknown>>;
    }>;
    typespace: {
      types: Array<{
        Product: {
          elements: Array<{
            name: { some: string };
            algebraic_type: Record<string, unknown>;
          }>;
        };
      }>;
    };
  };
  for (const [name, contract] of Object.entries(
    DAILY_MARK_V14_TABLE_CONTRACTS,
  )) {
    candidate.typespace.types[contract.productTypeRef] = {
      Product: {
        elements: contract.fields.map((field, index) => ({
          name: { some: field },
          algebraic_type: index === 0
            ? { String: {} }
            : field === 'granted_at'
                || field === 'scheduled_at'
              ? { Timestamp: {} }
              : { U64: {} },
        })),
      },
    };
    candidate.tables.push({
      name,
      product_type_ref: contract.productTypeRef,
      table_access: { [contract.access]: {} },
      indexes: [{
        name: `${name}_by_primary`,
        algorithm: { BTree: { columns: [0] } },
      }],
      constraints: [{
        name: `${name}_primary`,
        data: { Unique: { columns: [0] } },
      }],
    });
  }
  return candidate;
}

const predecessorActivationFields = [
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
] as const;
const candidateActivationFields = [
  ...predecessorActivationFields.slice(0, 3),
  ['moduleArtifactDigest', 'String'],
  ...predecessorActivationFields.slice(3),
] as const;
const predecessorWorkerStatusFields = [
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
] as const;
const candidateWorkerStatusFields = [
  ...predecessorWorkerStatusFields.slice(0, 20),
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
  ...predecessorWorkerStatusFields.slice(20),
] as const;
const completeDrainFields = [
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
] as const;
const returnScheduleRepairFields = [
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
] as const;
const workerSystemStatusFields = [
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
] as const;
const workerRosterPlanFields = [
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
] as const;
const workerResourceStateFields = [
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
] as const;

function workerModuleSchemaDescription(
  state: 'predecessor' | 'active-predecessor' | 'candidate',
  includeAccessRequestV13 = false,
  includeDailyMarksV14 = false,
) {
  const v13Description = (
    includeAccessRequestV13
      ? withAccessRequestV13(productionSchemaDescription(true))
      : productionSchemaDescription(true)
  );
  const description = (
    includeDailyMarksV14
      ? withDailyMarksV14(v13Description)
      : v13Description
  ) as ReturnType<
    typeof productionSchemaDescription
  > & {
    reducers: Array<Record<string, unknown>>;
    misc_exports: Array<Record<string, unknown>>;
  };
  type FixtureType = string | Record<string, unknown>;
  type FixtureField = readonly [string, FixtureType];
  const shiftV15TypeRefs = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(shiftV15TypeRefs);
    if (value === null || typeof value !== 'object') return value;
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [
      key,
      key === 'Ref' && Number.isSafeInteger(entry) && Number(entry) >= 56
        ? Number(entry) + 8
        : shiftV15TypeRefs(entry),
    ]));
  };
  const predecessorTypes = description.typespace.types;
  const shiftedTypes = [
    ...predecessorTypes.slice(0, 56),
    ...Array.from({ length: 8 }, () => ({ Product: { elements: [] } })),
    ...predecessorTypes.slice(56).map(type => (
      shiftV15TypeRefs(type) as Record<string, unknown>
    )),
  ] as unknown as typeof description.typespace.types;
  description.typespace.types = shiftedTypes;
  description.reducers = shiftV15TypeRefs(
    description.reducers,
  ) as Array<Record<string, unknown>>;
  description.misc_exports = shiftV15TypeRefs(
    description.misc_exports,
  ) as Array<Record<string, unknown>>;
  const product = (fields: readonly FixtureField[]) => ({
    elements: fields.map(([name, type]) => ({
      name: { some: name },
      algebraic_type: typeof type === 'string' ? { [type]: {} } : type,
    })),
  });
  const reducer = (
    name: string,
    fields: readonly FixtureField[],
  ) => ({
    name,
    params: product(fields),
    lifecycle: { none: [] },
  });
  const types = description.typespace.types as Array<Record<string, unknown>>;
  const addProduct = (fields: readonly FixtureField[]) => {
    const ref = types.length;
    types.push({ Product: product(fields) });
    return ref;
  };
  const optionString = {
    Sum: {
      variants: product([
        ['some', 'String'],
        ['none', { Product: { elements: [] } }],
      ]).elements,
    },
  };
  types[WORKER_V12_TABLE_CONTRACTS.worker_assignment_schedule_v_1.productTypeRef] = {
    Product: product([
      ['schedule_id', 'U64'],
      ['scheduled_at', {
        Sum: {
          variants: product([
            ['Interval', {
              Product: product([['__time_duration_micros__', 'I64']]),
            }],
            ['Time', {
              Product: product([['__timestamp_micros_since_unix_epoch__', 'I64']]),
            }],
          ]).elements,
        },
      }],
      ['assignment_id', 'String'],
      ['worker_id', 'String'],
      ['timeline_revision', 'U32'],
      ['stage', 'String'],
    ]),
  };
  const activeAbi = state !== 'predecessor';
  const statusFields = activeAbi
    ? candidateWorkerStatusFields
    : predecessorWorkerStatusFields;
  const statusRef = addProduct(statusFields);
  const systemStatusRef = addProduct(workerSystemStatusFields);
  const rosterPlanRef = addProduct(workerRosterPlanFields);
  const resourceStateRef = addProduct(workerResourceStateFields);
  const privateWorkerRef = addProduct([
    ['worker_id', 'String'],
    ['ordinal', 'U32'],
    ['status', 'String'],
    ['resource_kind', optionString],
    ['site_id', optionString],
    ['accrued_amount', 'U64'],
    ['materialized_amount', 'U64'],
    ['available_amount', 'U64'],
    ['observed_at_micros', 'U64'],
    ['revision', 'U64'],
  ]);
  const rosterRef = addProduct([
    ['fid', 'U64'],
    ['castle_id', 'U64'],
    ['observed_at_micros', 'U64'],
    ['workers', { Array: { Ref: privateWorkerRef } }],
  ]);
  const controlStateRef = addProduct([
    ['fid', 'U64'],
    ['castle_id', 'U64'],
    ['observed_at_micros', 'U64'],
    ['workers', { Array: { Ref: privateWorkerRef } }],
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
  description.reducers = [
    reducer(
      'admin_activate_worker_system_v1',
      activeAbi
        ? candidateActivationFields
        : predecessorActivationFields,
    ),
    reducer('admin_backfill_worker_roster_v1', []),
    reducer('admin_begin_worker_legacy_drain_v1', []),
    reducer('admin_stage_worker_system_v1', []),
    reducer('dispatch_worker_v1', [
      ['workerId', 'String'],
      ['resourceKind', 'String'],
      ['siteId', 'String'],
      ['idempotencyKey', 'String'],
    ]),
    reducer('recall_all_workers_v1', [['idempotencyKey', 'String']]),
    reducer('recall_worker_v1', [
      ['workerId', 'String'],
      ['idempotencyKey', 'String'],
    ]),
    reducer('run_worker_assignment_schedule_v_1', [[
      'arg',
      {
        Ref: WORKER_V12_TABLE_CONTRACTS
          .worker_assignment_schedule_v_1.productTypeRef,
      },
    ]]),
  ];
  if (activeAbi) {
    description.reducers.push(
      reducer('admin_complete_worker_legacy_drain_v1', completeDrainFields),
      reducer('return_legacy_expedition_v1', [
        ['resourceKind', 'String'],
        ['expeditionId', 'String'],
      ]),
    );
  }
  if (state === 'candidate') {
    description.reducers.push(
      reducer(
        'admin_repair_missing_worker_return_schedule_v1',
        returnScheduleRepairFields,
      ),
    );
  }
  description.misc_exports = [
    ['admin_get_worker_rollout_status_v2', statusRef],
    ['admin_get_worker_system_status_v1', systemStatusRef],
    ['admin_plan_worker_roster_v1', rosterPlanRef],
    ['get_my_resource_state_v2', resourceStateRef],
    ['get_my_worker_roster_v1', rosterRef],
    ...(state === 'candidate'
      ? [['get_my_worker_control_state_v1', controlStateRef] as const]
      : []),
  ].map(([name, returnRef]) => ({
    Procedure: {
      name,
      params: product([]),
      return_type: { Ref: returnRef },
    },
  }));
  return description;
}

function innerKeepV15ModuleSchemaDescription() {
  const description = workerModuleSchemaDescription(
    'candidate',
    true,
    true,
  ) as ReturnType<typeof workerModuleSchemaDescription> & {
    reducers: Array<Record<string, unknown>>;
    misc_exports: Array<Record<string, unknown>>;
    tables: Array<{
      name: string;
      product_type_ref: number;
      table_access: Record<string, object>;
      indexes: Array<Record<string, unknown>>;
      constraints: Array<Record<string, unknown>>;
    }>;
    typespace: { types: Array<Record<string, unknown>> };
  };
  type FixtureType = string | Record<string, unknown>;
  type FixtureField = readonly [string, FixtureType];
  const product = (fields: readonly FixtureField[]) => ({
    elements: fields.map(([name, type]) => ({
      name: { some: name },
      algebraic_type: typeof type === 'string' ? { [type]: {} } : type,
    })),
  });
  const reducer = (name: string, fields: readonly FixtureField[]) => ({
    name,
    params: product(fields),
    lifecycle: { none: [] },
  });
  const addProduct = (fields: readonly FixtureField[]) => {
    const ref = description.typespace.types.length;
    description.typespace.types.push({ Product: product(fields) });
    return ref;
  };
  const option = (type: FixtureType) => ({
    Sum: {
      variants: product([
        ['some', type],
        ['none', { Product: { elements: [] } }],
      ]).elements,
    },
  });
  const scheduleAt = {
    Sum: {
      variants: product([
        ['Interval', {
          Product: product([['__time_duration_micros__', 'I64']]),
        }],
        ['Time', {
          Product: product([['__timestamp_micros_since_unix_epoch__', 'I64']]),
        }],
      ]).elements,
    },
  };
  for (const [name, contract] of Object.entries(INNER_KEEP_V15_TABLE_CONTRACTS)) {
    const schedule = name === 'castle_inner_construction_schedule_v_1';
    description.typespace.types[contract.productTypeRef] = {
      Product: product(contract.fields.map(field => [
        field,
        schedule
          ? field === 'scheduled_at'
            ? scheduleAt
            : field === 'building_key'
              ? 'String'
              : field === 'expected_target_level'
                ? 'U32'
                : 'U64'
          : 'String',
      ] as const)),
    };
    description.tables.push({
      name,
      product_type_ref: contract.productTypeRef,
      table_access: { [contract.access]: {} },
      indexes: [{
        name: `${name}_by_primary`,
        algorithm: { BTree: { columns: [0] } },
      }],
      constraints: [{
        name: `${name}_primary`,
        data: { Unique: { columns: [0] } },
      }],
    });
  }

  description.reducers.push(
    reducer('inner_keep_start_project_v1', [
      ['buildingKind', 'String'],
      ['localXMicrounits', 'I64'],
      ['localZMicrounits', 'I64'],
      ['rotationMilliDegrees', 'U32'],
      ['requestKey', 'String'],
      ['expectedTargetLevel', 'U32'],
      ['expectedProjectRevision', 'String'],
      ['expectedPolicyDigest', 'String'],
      ['expectedLayoutDigest', 'String'],
    ]),
    reducer('admin_seed_inner_keep_catalog_v1', [
      ['capability', 'String'],
      ['policyDigest', 'String'],
      ['layoutDigest', 'String'],
      ['assetCatalogDigest', 'String'],
      ['expectedMissingLayout', 'U32'],
      ['expectedMissingSlots', 'U32'],
      ['expectedMissingBuildings', 'U32'],
      ['expectedMissingLevels', 'U32'],
    ]),
    reducer('admin_backfill_inner_keep_builders_v1', [
      ['capability', 'String'],
      ['policyDigest', 'String'],
      ['layoutDigest', 'String'],
      ['assetCatalogDigest', 'String'],
      ['expectedCastles', 'U32'],
      ['expectedExistingBuilders', 'U32'],
      ['expectedMissingBuilders', 'U32'],
    ]),
    reducer('admin_activate_inner_keep_v1', [
      ['capability', 'String'],
      ['policyDigest', 'String'],
      ['layoutDigest', 'String'],
      ['assetCatalogDigest', 'String'],
      ['clientRelease', 'String'],
      ['clientArtifactDigest', 'String'],
      ['moduleArtifactDigest', 'String'],
      ['sourceCommit', 'String'],
      ['expectedCastleCount', 'U32'],
    ]),
    reducer('admin_deactivate_inner_keep_v1', [
      ['capability', 'String'],
      ['expectedCastleCount', 'U32'],
      ['expectedActiveProjects', 'U32'],
    ]),
    reducer('run_inner_keep_construction_schedule_v_1', [[
      'arg',
      {
        Ref: INNER_KEEP_V15_TABLE_CONTRACTS
          .castle_inner_construction_schedule_v_1.productTypeRef,
      },
    ]]),
  );

  const stateRef = addProduct([
    ['castleId', 'U64'],
    ['componentActive', 'Bool'],
    ['componentReady', 'Bool'],
    ['builderPresent', 'Bool'],
    ['builderBusy', 'Bool'],
    ['activeBuildingKey', option('String')],
    ['busyUntilMicros', option('U64')],
    ['builderRevision', 'U64'],
    ['storedFood', 'U64'],
    ['storedWood', 'U64'],
    ['storedStone', 'U64'],
    ['storedGold', 'U64'],
    ['projectedFood', 'U64'],
    ['projectedWood', 'U64'],
    ['projectedStone', 'U64'],
    ['projectedGold', 'U64'],
    ['resourceRevision', 'U64'],
    ['observedAtMicros', 'U64'],
    ['policyVersion', 'String'],
    ['layoutDigest', 'String'],
    ['assetCatalogDigest', 'String'],
  ]);
  const requestStatusRef = addProduct([
    ['found', 'Bool'],
    ['castleId', option('U64')],
    ['buildingKey', option('String')],
    ['buildingKind', option('String')],
    ['localXMicrounits', option('I64')],
    ['localZMicrounits', option('I64')],
    ['rotationMilliDegrees', option('U32')],
    ['targetLevel', option('U32')],
    ['deductedFood', option('U64')],
    ['deductedWood', option('U64')],
    ['deductedStone', option('U64')],
    ['deductedGold', option('U64')],
    ['startedAtMicros', option('U64')],
    ['policyVersion', option('String')],
  ]);
  const adminStatusRef = addProduct([
    ['layoutRows', 'U64'],
    ['slotRows', 'U64'],
    ['buildingCatalogRows', 'U64'],
    ['levelPolicyRows', 'U64'],
    ['castleRows', 'U64'],
    ['builderRows', 'U64'],
    ['buildingRows', 'U64'],
    ['activeProjects', 'U64'],
    ['receiptRows', 'U64'],
    ['scheduleRows', 'U64'],
    ['missingBuilders', 'U64'],
    ['orphanBuilders', 'U64'],
    ['invalidBuilders', 'U64'],
    ['invalidBuildings', 'U64'],
    ['invalidSchedules', 'U64'],
    ['builderProjectMismatches', 'U64'],
    ['staticCatalogExact', 'Bool'],
    ['workerSystemReady', 'Bool'],
    ['readyForCatalogSeed', 'Bool'],
    ['readyForBuilderBackfill', 'Bool'],
    ['readyForActivation', 'Bool'],
    ['active', 'Bool'],
    ['policyVersion', 'String'],
    ['policyDigest', 'String'],
    ['layoutPolicyVersion', 'String'],
    ['layoutDigest', 'String'],
    ['assetCatalogDigest', 'String'],
  ]);
  const catalogPlanRef = addProduct([
    ['missingLayout', 'U32'],
    ['missingSlots', 'U32'],
    ['missingBuildings', 'U32'],
    ['missingLevels', 'U32'],
    ['ready', 'Bool'],
  ]);
  const builderPlanRef = addProduct([
    ['expectedCastles', 'U32'],
    ['existingBuilders', 'U32'],
    ['missingBuilders', 'U32'],
    ['ready', 'Bool'],
  ]);
  description.misc_exports.push(
    {
      Procedure: {
        name: 'get_my_inner_keep_state_v1',
        params: product([]),
        return_type: { Ref: stateRef },
      },
    },
    {
      Procedure: {
        name: 'get_my_inner_keep_request_status_v1',
        params: product([['requestKey', 'String']]),
        return_type: { Ref: requestStatusRef },
      },
    },
    {
      Procedure: {
        name: 'admin_get_inner_keep_status_v1',
        params: product([]),
        return_type: { Ref: adminStatusRef },
      },
    },
    {
      Procedure: {
        name: 'admin_plan_inner_keep_catalog_v1',
        params: product([]),
        return_type: { Ref: catalogPlanRef },
      },
    },
    {
      Procedure: {
        name: 'admin_plan_inner_keep_builders_v1',
        params: product([]),
        return_type: { Ref: builderPlanRef },
      },
    },
  );
  return description;
}

beforeAll(async () => {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify'],
  );
  publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
});

afterEach(() => {
  vi.useRealTimers();
});

function jsonResponse(value: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  return new Response(JSON.stringify(value), { ...init, headers });
}

function validDocuments() {
  return {
    discovery: {
      issuer: ISSUER,
      jwks_uri: `${ISSUER}/.well-known/jwks.json`,
      id_token_signing_alg_values_supported: ['ES256'],
    },
    jwks: {
      keys: [{
        kty: 'EC',
        crv: 'P-256',
        alg: 'ES256',
        use: 'sig',
        kid: 'warpkeep-test-key',
        x: publicJwk.x,
        y: publicJwk.y,
      }],
    },
  };
}

type AuthV2FixtureOptions = {
  health?: Record<string, unknown>;
  publicAuthEnabled?: boolean;
  discoveryClaims?: string[];
  omitSecurityHeader?: string;
  legacyNotRetired?: boolean;
  omitCredentialedCors?: boolean;
  exposeHostileCors?: boolean;
  publicRoutesNotPaused?: boolean;
  publicRoutesPaused?: boolean;
  adminCorsLeak?: Readonly<{
    pathname: string;
    method: 'GET' | 'OPTIONS' | 'POST';
    origin: string;
  }>;
};

function authV2Headers(
  extra: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = new Headers(AUTH_V2_SECURITY_HEADERS);
  if (omitSecurityHeader) headers.delete(omitSecurityHeader);
  new Headers(extra).forEach((value, name) => headers.set(name, value));
  return headers;
}

function credentialedCors(
  origin: string,
  allowedHeaders = 'content-type',
): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': allowedHeaders,
    'access-control-allow-credentials': 'true',
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function quickAuthCors(
  origin: string,
  allowedHeaders = 'authorization, content-type',
): HeadersInit {
  return {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': allowedHeaders,
    'access-control-max-age': '600',
    vary: 'Origin',
  };
}

function authV2JsonResponse(
  value: unknown,
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  const headers = authV2Headers(extraHeaders, omitSecurityHeader);
  headers.set('content-type', 'application/json; charset=utf-8');
  return new Response(JSON.stringify(value), { status, headers });
}

function authV2EmptyResponse(
  status: number,
  extraHeaders: HeadersInit = {},
  omitSecurityHeader?: string,
) {
  return new Response(null, {
    status,
    headers: authV2Headers(extraHeaders, omitSecurityHeader),
  });
}

function authV2BridgeFetch(options: AuthV2FixtureOptions = {}) {
  const publicAuthEnabled = options.publicAuthEnabled ?? false;
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const requestHeaders = new Headers(init?.headers);
    const origin = requestHeaders.get('origin');
    if (url.origin !== ISSUER) throw new Error('Unexpected fixture origin.');

    if (method === 'GET' && url.pathname === '/healthz') {
      return authV2JsonResponse(options.health ?? {
        ok: true,
        service: 'warpkeep-auth-bridge',
        securityProfile: 'warpkeep-auth-v2',
        publicAuthEnabled,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return authV2JsonResponse({
        issuer: ISSUER,
        jwks_uri: `${ISSUER}/.well-known/jwks.json`,
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['ES256'],
        claims_supported: options.discoveryClaims ?? AUTH_V2_CLAIMS,
      }, 200, {}, options.omitSecurityHeader);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return authV2JsonResponse({
        keys: [{
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: 'warpkeep-test-key',
          x: publicJwk.x,
          y: publicJwk.y,
        }],
      }, 200, {}, options.omitSecurityHeader);
    }

    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      if (options.legacyNotRetired) {
        return authV2EmptyResponse(204, origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          'access-control-max-age': '600',
          vary: 'Origin',
        } : {}, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'legacy_auth_retired',
          message: 'This authentication protocol has been retired.',
        },
      }, 410, origin === FRONTEND ? {
        'access-control-allow-origin': FRONTEND,
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '600',
        vary: 'Origin',
      } : {}, options.omitSecurityHeader);
    }

    if (
      method === 'OPTIONS'
      && (
        AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)
        || url.pathname === AUTH_V2_QUICK_AUTH_PATH
        || AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
      )
    ) {
      const quickAuth = url.pathname === AUTH_V2_QUICK_AUTH_PATH
        || (
          AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
          && requestHeaders
            .get('access-control-request-headers')
            ?.split(',')
            .some(header => header.trim().toLowerCase() === 'authorization')
        );
      const corsForOrigin = (value: string) => (
        quickAuth
          ? quickAuthCors(
              value,
              AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
                ? 'authorization, content-type, x-warpkeep-expected-fid'
                : undefined,
            )
          : credentialedCors(
              value,
              AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
                ? 'content-type, x-warpkeep-expected-fid'
                : undefined,
            )
      );
      const cors = origin === FRONTEND
        ? corsForOrigin(FRONTEND)
        : options.exposeHostileCors
          ? corsForOrigin(origin ?? '*')
          : {};
      if (!quickAuth && options.omitCredentialedCors && origin === FRONTEND) {
        delete (cors as Record<string, string>)['access-control-allow-credentials'];
      }
      const publicRoutesPaused = options.publicRoutesPaused
        ?? (!publicAuthEnabled && !options.publicRoutesNotPaused);
      if (AUTH_V2_PAUSED_PATHS.has(url.pathname) && publicRoutesPaused) {
        return authV2JsonResponse({
          error: {
            code: 'public_auth_paused',
            message: 'Farcaster sign-in is temporarily paused for security hardening.',
          },
        }, 503, cors, options.omitSecurityHeader);
      }
      if (origin === FRONTEND) {
        return authV2EmptyResponse(204, cors, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: {
          code: 'origin_not_allowed',
          message: 'This browser origin is not allowed.',
        },
      }, 403, {}, options.omitSecurityHeader);
    }

    if (
      (method === 'GET' || method === 'OPTIONS' || method === 'POST')
      && AUTH_V2_SERVER_ONLY_ADMIN_PATHS.has(url.pathname)
    ) {
      const leak = options.adminCorsLeak;
      const cors: HeadersInit = leak
        && leak.pathname === url.pathname
        && leak.method === method
        && leak.origin === origin
        ? { 'access-control-allow-origin': origin }
        : {};
      if (method === 'POST') {
        return authV2JsonResponse({
          error: {
            code: 'admin_browser_forbidden',
            message: 'This endpoint is server-only.',
          },
        }, 403, cors, options.omitSecurityHeader);
      }
      return authV2JsonResponse({
        error: { code: 'not_found', message: 'Route not found.' },
      }, 404, cors, options.omitSecurityHeader);
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function legacyBridgeFetch() {
  const documents = validDocuments();
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const origin = new Headers(init?.headers).get('origin');
    if (method === 'GET' && url.pathname === '/healthz') {
      return jsonResponse({ ok: true, service: 'warpkeep-auth-bridge' });
    }
    if (method === 'GET' && url.pathname === '/.well-known/openid-configuration') {
      return jsonResponse(documents.discovery);
    }
    if (method === 'GET' && url.pathname === '/.well-known/jwks.json') {
      return jsonResponse(documents.jwks);
    }
    if (
      method === 'OPTIONS'
      && (url.pathname === '/v1/farcaster/challenge' || url.pathname === '/v1/farcaster/exchange')
    ) {
      return new Response(null, {
        status: origin === FRONTEND ? 204 : 403,
        headers: origin === FRONTEND ? {
          'access-control-allow-origin': FRONTEND,
          'access-control-allow-methods': 'POST, OPTIONS',
          'access-control-allow-headers': 'content-type',
          vary: 'Origin',
        } : {},
      });
    }
    if (method === 'OPTIONS' && url.pathname === '/v1/admin/token') {
      return jsonResponse({ error: { code: 'not_found' } }, { status: 404 });
    }
    throw new Error(`Unexpected fixture request: ${method} ${url.pathname}`);
  });
}

function withNonCanonicalPaddingBits(value: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const index = alphabet.indexOf(value.at(-1) ?? '');
  if (index < 0 || index % 4 !== 0) throw new Error('Expected a canonical test coordinate.');
  return `${value.slice(0, -1)}${alphabet[index + 1]}`;
}

async function withTestProvenArtifact<T>(callback: (receipt: {
  artifactPath: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
  v13TableSchemaDigest: string;
  v14TableSchemaDigest: string;
  v15TableSchemaDigest: string;
  v16TableSchemaDigest: string;
  v17TableSchemaDigest: string;
  artifactDigest: string;
}) => Promise<T> | T): Promise<T> {
  let previous: Buffer | undefined;
  try {
    previous = await readFile(provenArtifactPath);
  } catch {
    // A clean checkout has no ignored build output to preserve.
  }
  const content = Buffer.from('test-only-proven-spacetimedb-artifact');
  await mkdir(dirname(provenArtifactPath), { recursive: true });
  await writeFile(provenArtifactPath, content, { mode: 0o600 });
  const receipt = Object.freeze({
    artifactPath: provenArtifactPath,
    v11TableSchemaDigest: 'a'.repeat(64),
    v12TableSchemaDigest: 'b'.repeat(64),
    v13TableSchemaDigest: 'c'.repeat(64),
    v14TableSchemaDigest: 'd'.repeat(64),
    v15TableSchemaDigest: 'e'.repeat(64),
    v16TableSchemaDigest: 'f'.repeat(64),
    v17TableSchemaDigest: '0'.repeat(64),
    artifactDigest: createHash('sha256').update(content).digest('hex'),
  });
  try {
    return await callback(receipt);
  } finally {
    if (previous === undefined) await rm(provenArtifactPath, { force: true });
    else await writeFile(provenArtifactPath, previous);
  }
}

describe('activation publish safety', () => {
  it('accepts only direct, no-store, bounded OIDC documents with one exact public key', async () => {
    const documents = validDocuments();
    const calls: Array<{ url: string; init: RequestInit | undefined }> = [];
    const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return jsonResponse(url.endsWith('/openid-configuration') ? documents.discovery : documents.jwks);
    };

    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch)).resolves.toBeUndefined();
    expect(calls).toHaveLength(2);
    expect(calls.every(({ init }) => init?.redirect === 'error' && init.cache === 'no-store')).toBe(true);
  });

  it('rejects redirects, wrong media types, chunked oversized bodies, and incomplete keys', async () => {
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(null, {
      status: 302,
      headers: { location: 'https://redirect.example/' },
    })) as typeof fetch)).rejects.toThrow(/without redirects/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => jsonResponse(validDocuments().discovery, {
      headers: { 'content-type': 'application/jsonp' },
    })) as typeof fetch)).rejects.toThrow(/exact JSON/i);

    await expect(validateIssuerDeployment(ISSUER, (async () => new Response('{}', {
      headers: {
        'content-type': 'application/json',
        'content-length': String(64 * 1_024 + 1),
      },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const oversized = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
        controller.close();
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(oversized, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const cancelFailure = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(64 * 1_024 + 1));
      },
      cancel() {
        throw new Error('publish-stream-cancel-sentinel');
      },
    });
    await expect(validateIssuerDeployment(ISSUER, (async () => new Response(cancelFailure, {
      headers: { 'content-type': 'application/json' },
    })) as typeof fetch)).rejects.toThrow(/response limit/i);

    const documents = validDocuments();
    delete (documents.jwks.keys[0] as { x?: string }).x;
    const incompleteKeyFetch = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, incompleteKeyFetch as typeof fetch))
      .rejects.toThrow(/public-only ES256 signing key/i);
  });

  it('rejects syntactically shaped coordinates that are not a usable P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = 'A'.repeat(43);
    documents.jwks.keys[0].y = 'A'.repeat(43);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/usable public-only ES256/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/unusable public signing key/i);
  });

  it('rejects a non-canonical base64url encoding of a valid P-256 point', async () => {
    const documents = validDocuments();
    documents.jwks.keys[0].x = withNonCanonicalPaddingBits(documents.jwks.keys[0].x!);
    const fetchImpl = async (input: string | URL | Request) => (
      String(input).endsWith('/openid-configuration')
        ? jsonResponse(documents.discovery)
        : jsonResponse(documents.jwks)
    );
    await expect(validateIssuerDeployment(ISSUER, fetchImpl as typeof fetch))
      .rejects.toThrow(/exact public-only ES256 signing key/i);
    await expect(validateProductionSigningKey(documents.jwks.keys[0]))
      .rejects.toThrow(/invalid or private signing key/i);
  });

  it('publishes only an owner-private artifact snapshot after the proven source is replaced', async () => {
    const calls: unknown[][] = [];
    let snapshotPath = '';
    let snapshotDirectory = '';
    let snapshotBytes = Buffer.alloc(0);
    let snapshotFileMode = 0;
    let snapshotDirectoryMode = 0;
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    const fakeSpawn = (...args: unknown[]) => {
      calls.push(args);
      const publishArguments = args[1] as string[];
      snapshotPath = publishArguments[publishArguments.indexOf('--js-path') + 1] ?? '';
      snapshotDirectory = dirname(snapshotPath);
      writeFileSync(provenArtifactPath, 'test-only-replacement-after-attestation');
      snapshotBytes = readFileSync(snapshotPath);
      snapshotFileMode = statSync(snapshotPath).mode & 0o777;
      snapshotDirectoryMode = statSync(snapshotDirectory).mode & 0o777;
      queueMicrotask(() => child.emit('close', 0, null));
      return child;
    };
    const databaseIdentity = CANONICAL_DATABASE_IDENTITY;
    await withTestProvenArtifact(async receipt => {
      await expect(publishModule(
        'spacetime',
        databaseIdentity,
        receipt,
        fakeSpawn as never,
      )).resolves.toBeUndefined();
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe('spacetime');
    expect(snapshotPath).not.toBe(provenArtifactPath);
    expect(snapshotPath).toBe(join(snapshotDirectory, 'module.js'));
    expect(snapshotBytes).toEqual(Buffer.from('test-only-proven-spacetimedb-artifact'));
    expect(snapshotFileMode).toBe(0o400);
    expect(snapshotDirectoryMode).toBe(0o700);
    expect(calls[0]?.[1]).toEqual([
      'publish',
      '--server', 'https://maincloud.spacetimedb.com',
      '--js-path', snapshotPath,
      '--delete-data=never',
      '--yes=remote,skip-login',
      databaseIdentity,
    ]);
    expect(calls[0]?.[1]).not.toContain('--module-path');
    expect(calls[0]?.[2]).toMatchObject({
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    expect(calls[0]?.[2]).not.toHaveProperty('shell');
    expect(calls[0]?.[2]).toHaveProperty('env');
    expect(() => statSync(snapshotPath)).toThrow();
    expect(() => statSync(snapshotDirectory)).toThrow();
  });

  it('executes only the attested CLI snapshot after its source path is replaced', async () => {
    const sourceDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-cli-source-'));
    const sourcePath = join(sourceDirectory, 'spacetime-test');
    const original = Buffer.from('#!/bin/sh\nprintf original-cli');
    await writeFile(sourcePath, original, { mode: 0o700 });
    const digest = createHash('sha256').update(original).digest('hex');
    const snapshot = createPrivatePublishSnapshot(sourcePath, digest, 'executable');
    const snapshotPath = snapshot.path;
    const snapshotDirectory = snapshot.directory;
    try {
      expect(snapshotPath).not.toBe(sourcePath);
      expect(snapshotPath).toBe(join(snapshotDirectory, 'spacetime'));
      expect(statSync(snapshotDirectory).mode & 0o777).toBe(0o700);
      expect(statSync(snapshotPath).mode & 0o777).toBe(0o500);

      await writeFile(sourcePath, '#!/bin/sh\nprintf replaced-cli', { mode: 0o700 });
      const result = spawnSync(snapshotPath, [], { encoding: 'utf8' });
      expect(result.status).toBe(0);
      expect(result.signal).toBeNull();
      expect(result.stdout).toBe('original-cli');
      expect(readFileSync(snapshotPath)).toEqual(original);
    } finally {
      snapshot.cleanup();
      await rm(sourceDirectory, { recursive: true, force: true });
    }
    expect(() => statSync(snapshotPath)).toThrow();
    expect(() => statSync(snapshotDirectory)).toThrow();
  });

  it('requires an anonymous immutable-identity v11 schema and one exact additive v12 suffix', () => {
    expect(canonicalSchemaDescribeChildArguments()).toEqual([
      'describe',
      '--json',
      '--anonymous',
      '--server', 'https://maincloud.spacetimedb.com',
      '--no-config',
      CANONICAL_DATABASE_IDENTITY,
    ]);
    expect(canonicalSchemaDescribeChildArguments()).not.toContain('warpkeep-89e4u');

    const v11 = productionSchemaDescription(false);
    const parsed = parseCanonicalSchemaDescription(JSON.stringify(v11));
    const v11TableNames = Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS);
    const v11TableSchemaDigest = canonicalTableSchemaBoundaryDigest(parsed, v11TableNames);
    const predecessor = verifyExactProductionV11Schema(parsed, v11TableSchemaDigest);
    expect(Object.keys(predecessor)).toHaveLength(47);

    const calls: unknown[][] = [];
    const v11Spawn = (...args: unknown[]) => {
      calls.push(args);
      return { status: 0, signal: null, stdout: JSON.stringify(v11), stderr: '' };
    };
    expect(verifyFreshProductionV11Schema(
      'spacetime',
      v11TableSchemaDigest,
      v11Spawn as never,
    ))
      .toEqual(predecessor);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(canonicalSchemaDescribeChildArguments());
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe('');
    expect(options.env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET');
    expect(options.env).not.toHaveProperty('WARPKEEP_ADMIN_TOKEN_SECRET_STDIN');

    const v12 = productionSchemaDescription(true);
    const v12TableNames = [
      ...v11TableNames,
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(v12, v12TableNames);
    expect(verifyExactProductionV12Schema(
      predecessor,
      v12,
      v12TableSchemaDigest,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      totalTableCount: 53,
    });
    expect(verifyPostPublishProductionV12Schema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      (() => ({ status: 0, signal: null, stdout: JSON.stringify(v12), stderr: '' })) as never,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      totalTableCount: 53,
    });

    const extraV11Table = structuredClone(v11);
    extraV11Table.tables.push({
      name: 'unexpected_table',
      product_type_ref: 47,
      table_access: { Public: {} },
      indexes: [],
      constraints: [],
    });
    expect(() => verifyExactProductionV11Schema(extraV11Table, v11TableSchemaDigest))
      .toThrow(/table set/i);

    const allPublicV11 = structuredClone(v11);
    allPublicV11.tables.find(table => table.name === 'admin_audit')!.table_access = { Public: {} };
    expect(() => verifyExactProductionV11Schema(allPublicV11, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11FieldType = structuredClone(v11);
    const castleRef = PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS.castle;
    changedV11FieldType.typespace.types[castleRef].Product.elements[0].algebraic_type = {
      String: {},
    };
    expect(() => verifyExactProductionV11Schema(changedV11FieldType, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11Index = structuredClone(v11);
    changedV11Index.tables.find(table => table.name === 'castle')!.indexes[0] = {
      name: 'castle_by_primary',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyExactProductionV11Schema(changedV11Index, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedV11Constraint = structuredClone(v11);
    changedV11Constraint.tables.find(table => table.name === 'castle')!.constraints[0] = {
      name: 'castle_primary',
      data: { Unique: { columns: [1] } },
    };
    expect(() => verifyExactProductionV11Schema(changedV11Constraint, v11TableSchemaDigest))
      .toThrow(/proven publication boundary/i);

    const changedPredecessor = structuredClone(v12);
    changedPredecessor.tables.find(table => table.name === 'castle')!.table_access = { Private: {} };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedPredecessor,
      v12TableSchemaDigest,
    ))
      .toThrow(/pre-existing production table changed/i);

    const changedWorker = structuredClone(v12);
    changedWorker.tables.find(table => table.name === 'worker_assignment_v1')!.table_access = { Public: {} };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorker,
      v12TableSchemaDigest,
    ))
      .toThrow(/exact v12 contract/i);

    const workerRef = WORKER_V12_TABLE_CONTRACTS.castle_worker_v1.productTypeRef;
    const changedWorkerFieldType = structuredClone(v12);
    changedWorkerFieldType.typespace.types[workerRef].Product.elements[0].algebraic_type = {
      U64: {},
    };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerFieldType,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const changedWorkerIndex = structuredClone(v12);
    changedWorkerIndex.tables.find(table => table.name === 'castle_worker_v1')!.indexes[0] = {
      name: 'castle_worker_v1_by_primary',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerIndex,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const changedWorkerConstraint = structuredClone(v12);
    changedWorkerConstraint.tables
      .find(table => table.name === 'castle_worker_v1')!.constraints[0] = {
        name: 'castle_worker_v1_primary',
        data: { Unique: { columns: [1] } },
      };
    expect(() => verifyExactProductionV12Schema(
      predecessor,
      changedWorkerConstraint,
      v12TableSchemaDigest,
    )).toThrow(/proven publication boundary/i);

    const nestedV11 = structuredClone(v11);
    const nestedRef = nestedV11.typespace.types.length;
    nestedV11.typespace.types.push({
      Product: { elements: [{ name: { some: 'nested' }, algebraic_type: { U64: {} } }] },
    });
    nestedV11.typespace.types[castleRef].Product.elements[0].algebraic_type = { Ref: nestedRef };
    const nestedDigest = canonicalTableSchemaBoundaryDigest(nestedV11, v11TableNames);
    expect(() => verifyExactProductionV11Schema(nestedV11, nestedDigest)).not.toThrow();
    const changedNestedType = structuredClone(nestedV11);
    changedNestedType.typespace.types[nestedRef].Product.elements[0].algebraic_type = {
      String: {},
    };
    expect(() => verifyExactProductionV11Schema(changedNestedType, nestedDigest))
      .toThrow(/proven publication boundary/i);

    const unrelatedSchema = structuredClone(nestedV11);
    unrelatedSchema.typespace.types.push({
      Product: { elements: [{ name: { some: 'reducer_only' }, algebraic_type: { Bool: {} } }] },
    });
    Object.assign(unrelatedSchema, {
      reducers: [{ name: 'unrelated_reducer' }],
      procedures: [{ name: 'unrelated_procedure' }],
    });
    expect(canonicalTableSchemaBoundaryDigest(unrelatedSchema, v11TableNames))
      .toBe(nestedDigest);

    const indeterminate = () => verifyPostPublishProductionV12Schema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(indeterminate).toThrow(/indeterminate.*anonymous read-only schema inspection/i);
    expect(indeterminate).not.toThrow(/private|retry/i);
    expect(() => parseCanonicalSchemaDescription('private, not json'))
      .toThrow(/machine-readable JSON/i);
  });

  it('requires an exact private ref-53 v13 append over a captured v12 predecessor', () => {
    const v12 = workerModuleSchemaDescription('candidate');
    const v12TableNames = [
      ...Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v12,
      v12TableNames,
    );
    const predecessor = verifyExactProductionV12ModuleSchema(
      v12,
      v12TableSchemaDigest,
    );
    const v13 = workerModuleSchemaDescription('candidate', true);
    const v13TableNames = [
      ...v12TableNames,
      ...Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS),
    ];
    const v13TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v13,
      v13TableNames,
    );

    expect(verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      v13,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toEqual({
      predecessorTableCount: 53,
      appendedAccessRequestTableCount: 1,
      totalTableCount: 54,
    });
    expect(verifyPostPublishProductionV13ModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v13),
        stderr: '',
      })) as never,
    )).toEqual({
      predecessorTableCount: 53,
      appendedAccessRequestTableCount: 1,
      totalTableCount: 54,
      moduleState: 'candidate',
    });

    const publicRequestTable = structuredClone(v13);
    publicRequestTable.tables
      .find(table => table.name === 'access_request_v1')!.table_access = {
        Public: {},
      };
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      publicRequestTable,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/exact private v13 contract/i);

    const changedRequestField = structuredClone(v13);
    changedRequestField.typespace.types[
      ACCESS_REQUEST_V13_TABLE_CONTRACTS.access_request_v1.productTypeRef
    ].Product.elements[1]!.name.some = 'updated_at';
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      changedRequestField,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/exact private v13 contract/i);

    const changedRequestType = structuredClone(v13);
    changedRequestType.typespace.types[
      ACCESS_REQUEST_V13_TABLE_CONTRACTS.access_request_v1.productTypeRef
    ].Product.elements[0]!.algebraic_type = { String: {} };
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      changedRequestType,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/v13 table schema.*proven publication boundary/i);

    const changedPredecessor = structuredClone(v13);
    changedPredecessor.tables
      .find(table => table.name === 'castle')!.table_access = { Private: {} };
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      changedPredecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/v12 table schema.*proven publication boundary|pre-existing production table/i);

    const unexpectedTable = structuredClone(v13);
    unexpectedTable.tables.push({
      name: 'unexpected_table',
      product_type_ref: 54,
      table_access: { Private: {} },
      indexes: [],
      constraints: [],
    });
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      unexpectedTable,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/table set.*exact publication boundary/i);

    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      v13,
      '0'.repeat(64),
      v13TableSchemaDigest,
    )).toThrow(/v12 table schema.*proven publication boundary/i);
    expect(() => verifyExactProductionV13Schema(
      predecessor.tableSignatures,
      v13,
      v12TableSchemaDigest,
      '0'.repeat(64),
    )).toThrow(/v13 table schema.*proven publication boundary/i);

    const indeterminate = () => verifyPostPublishProductionV13ModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 1,
        signal: null,
        stdout: 'private',
        stderr: 'private',
      })) as never,
    );
    expect(indeterminate).toThrow(/post-publication v13 module checkpoint is indeterminate/i);
    expect(indeterminate).not.toThrow(/private|retry/i);
  });

  it('guards an exact code-only active-v13 publication with complete signatures and candidate ABI', () => {
    const activeV12 = workerModuleSchemaDescription('active-predecessor');
    const activeV13 = workerModuleSchemaDescription('active-predecessor', true);
    const candidateV13 = workerModuleSchemaDescription('candidate', true);
    const v12TableNames = [
      ...Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v13TableNames = [
      ...v12TableNames,
      ...Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      activeV12,
      v12TableNames,
    );
    const v13TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      activeV13,
      v13TableNames,
    );
    expect(canonicalTableSchemaBoundaryDigest(candidateV13, v13TableNames))
      .toBe(v13TableSchemaDigest);

    const predecessor = verifyExactProductionV13ModuleSchema(
      activeV13,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    );
    expect(predecessor.moduleState).toBe('active-predecessor');
    expect(predecessor.totalTableCount).toBe(54);
    expect(Object.keys(predecessor.tableSignatures)).toHaveLength(54);
    expect(verifyWorkerV13ModulePredecessor(
      predecessor.moduleState,
      WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE,
    )).toBe('active-predecessor');

    const alreadyCandidate = verifyExactProductionV13ModuleSchema(
      candidateV13,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    );
    expect(verifyWorkerV13ModulePredecessor(
      alreadyCandidate.moduleState,
      WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE,
    )).toBe('candidate');
    expect(verifyWorkerV13ModulePredecessor(
      alreadyCandidate.moduleState,
      WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE_V14_EMPTY,
    )).toBe('candidate');
    expect(() => verifyWorkerV13ModulePredecessor(
      'predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE,
    )).toThrow(/exact active production v13 ABI/i);
    expect(() => verifyWorkerV13ModulePredecessor(
      'active-predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE,
    )).toThrow(/exact active production v13 ABI/i);

    const preflightCalls: unknown[][] = [];
    expect(verifyFreshProductionV13ModuleSchema(
      'spacetime',
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      ((...args: unknown[]) => {
        preflightCalls.push(args);
        return {
          status: 0,
          signal: null,
          stdout: JSON.stringify(activeV13),
          stderr: '',
        };
      }) as never,
    )).toEqual(predecessor);
    expect(preflightCalls).toHaveLength(1);
    expect(preflightCalls[0]?.[1]).toEqual(canonicalSchemaDescribeChildArguments());

    expect(verifyPostPublishProductionV13ActiveModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(candidateV13),
        stderr: '',
      })) as never,
    )).toEqual(alreadyCandidate);
    expect(verifyPostPublishProductionV13ActiveModuleSchema(
      'spacetime',
      alreadyCandidate,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(candidateV13),
        stderr: '',
      })) as never,
    )).toEqual(alreadyCandidate);

    expect(() => verifyExactProductionV13ModuleSchema(
      workerModuleSchemaDescription('predecessor', true),
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/active-or-candidate Worker ABI/i);
    expect(() => verifyExactProductionV13ModuleSchema(
      activeV13,
      v12TableSchemaDigest,
      '0'.repeat(64),
    )).toThrow(/v13 table schema.*proven publication boundary/i);

    const driftedCandidate = structuredClone(candidateV13);
    driftedCandidate.tables
      .find(table => table.name === 'access_request_v1')!.indexes.push({
        name: 'unexpected_access_request_index',
        algorithm: { BTree: { columns: [0] } },
      });
    expect(() => verifyPostPublishProductionV13ActiveModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(driftedCandidate),
        stderr: '',
      })) as never,
    )).toThrow(/post-publication active-v13 module checkpoint is indeterminate/i);
    expect(() => verifyPostPublishProductionV13ActiveModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(activeV13),
        stderr: '',
      })) as never,
    )).toThrow(/post-publication active-v13 module checkpoint is indeterminate/i);
  });

  it('requires the exact private refs 54-55 v14 append over a captured active v13 predecessor', () => {
    const v12 = workerModuleSchemaDescription('candidate');
    const v13 = workerModuleSchemaDescription('candidate', true);
    const v14 = workerModuleSchemaDescription('candidate', true, true);
    const v12TableNames = [
      ...Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v13TableNames = [
      ...v12TableNames,
      ...Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS),
    ];
    const v14TableNames = [
      ...v13TableNames,
      ...Object.keys(DAILY_MARK_V14_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v12,
      v12TableNames,
    );
    const v13TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v13,
      v13TableNames,
    );
    const v14TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v14,
      v14TableNames,
    );
    const predecessor = verifyExactProductionV13ModuleSchema(
      v13,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    );

    expect(verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      v14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toEqual({
      predecessorTableCount: 54,
      appendedDailyMarkTableCount: 2,
      totalTableCount: 56,
    });
    const completeV14 = verifyExactProductionV14ModuleSchema(
      v14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    );
    expect(completeV14.moduleState).toBe('candidate');
    expect(completeV14.totalTableCount).toBe(56);
    expect(Object.keys(completeV14.tableSignatures)).toHaveLength(56);
    expect(verifyWorkerV14ModulePredecessor(
      completeV14.moduleState,
      WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
    )).toBe('candidate');
    expect(() => verifyWorkerV14ModulePredecessor(
      'active-predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
    )).toThrow(/exact active production v14 candidate ABI/i);
    expect(() => verifyWorkerV14ModulePredecessor(
      'candidate',
      WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE,
    )).toThrow(/exact active production v14 candidate ABI/i);
    expect(verifyFreshProductionV14ModuleSchema(
      'spacetime',
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v14),
        stderr: '',
      })) as never,
    )).toEqual(completeV14);
    const wrongAbiV14 = workerModuleSchemaDescription(
      'active-predecessor',
      true,
      true,
    );
    expect(canonicalTableSchemaBoundaryDigest(wrongAbiV14, v14TableNames))
      .toBe(v14TableSchemaDigest);
    expect(() => verifyExactProductionV14ModuleSchema(
      wrongAbiV14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toThrow(/reviewed Worker candidate ABI/i);
    expect(verifyPostPublishProductionV14ActiveModuleSchema(
      'spacetime',
      completeV14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v14),
        stderr: '',
      })) as never,
    )).toEqual(completeV14);
    expect(verifyPostPublishProductionV14ModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v14),
        stderr: '',
      })) as never,
    )).toEqual({
      predecessorTableCount: 54,
      appendedDailyMarkTableCount: 2,
      totalTableCount: 56,
      moduleState: 'candidate',
    });
    const changedCapturedV14 = {
      ...completeV14,
      tableSignatures: {
        ...completeV14.tableSignatures,
        castle: 'tampered-signature',
      },
    };
    expect(() => verifyPostPublishProductionV14ActiveModuleSchema(
      'spacetime',
      changedCapturedV14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v14),
        stderr: '',
      })) as never,
    )).toThrow(/post-publication active-v14 module checkpoint is indeterminate/i);
    expect(() => verifyPostPublishProductionV14ActiveModuleSchema(
      'spacetime',
      completeV14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/post-publication active-v14 module checkpoint is indeterminate/i);
    const emptyStatus = emptyDailyMarksV14Status();
    expect(verifyEmptyDailyMarksV14StatusOutput(JSON.stringify(emptyStatus)))
      .toEqual(emptyStatus);
    const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
    expect(dailyMarksV14InspectChildArguments(tsxCli)).toEqual([
      tsxCli,
      'scripts/daily-marks-operator.ts',
      'inspect',
    ]);
    const inspectCalls: unknown[][] = [];
    expect(verifyPostPublishEmptyDailyMarksV14(
      's'.repeat(32),
      ((...args: unknown[]) => {
        inspectCalls.push(args);
        return {
          status: 0,
          signal: null,
          stdout: JSON.stringify(emptyStatus),
          stderr: '',
        };
      }) as never,
    )).toEqual(emptyStatus);
    expect(inspectCalls).toHaveLength(1);
    expect(inspectCalls[0]?.[0]).toBe(process.execPath);
    expect(inspectCalls[0]?.[1]).toEqual(
      dailyMarksV14InspectChildArguments(tsxCli),
    );
    expect(inspectCalls[0]?.[2]).toMatchObject({
      input: 's'.repeat(32),
      timeout: 30_000,
      env: {
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
    });
    expect(() => verifyEmptyDailyMarksV14StatusOutput(JSON.stringify(
      emptyDailyMarksV14Status({ grants: '1' }),
    ))).toThrow(/exact empty pre-backfill state/i);
    expect(() => verifyEmptyDailyMarksV14StatusOutput(JSON.stringify(
      emptyDailyMarksV14Status({ scheduleRows: '1' }),
    ))).toThrow(/exact empty pre-backfill state/i);
    expect(() => verifyEmptyDailyMarksV14StatusOutput(JSON.stringify({
      ...emptyStatus,
      fid: '101',
    }))).toThrow(/unexpected fields/i);
    expect(() => verifyPostPublishEmptyDailyMarksV14(
      's'.repeat(32),
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/empty daily-Marks v14 checkpoint is indeterminate/i);

    const activeStatus = activeDailyMarksV14Status();
    const activeExpectations = {
      expectedEnabledAllowedFidCount: 3,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    };
    expect(verifyActiveDailyMarksV14StatusOutput(
      JSON.stringify(activeStatus),
      4,
      3,
    )).toEqual(activeStatus);
    expect(verifyActiveDailyMarksV14StatusOutput(
      JSON.stringify(activeDailyMarksV14Status({ currentDayGrants: '0' })),
      4,
      3,
    )).toEqual(activeDailyMarksV14Status({ currentDayGrants: '0' }));
    const activeInspectCalls: unknown[][] = [];
    const activeInspectSpawn = ((...args: unknown[]) => {
      activeInspectCalls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(activeStatus),
        stderr: '',
      };
    }) as never;
    expect(verifyFreshActiveDailyMarksV14(
      's'.repeat(32),
      activeExpectations,
      activeInspectSpawn,
    )).toEqual(activeStatus);
    expect(verifyPostPublishActiveDailyMarksV14(
      's'.repeat(32),
      activeExpectations,
      activeInspectSpawn,
    )).toEqual(activeStatus);
    expect(activeInspectCalls).toHaveLength(2);
    for (const call of activeInspectCalls) {
      expect(call[0]).toBe(process.execPath);
      expect(call[1]).toEqual(dailyMarksV14InspectChildArguments(tsxCli));
      expect(call[2]).toMatchObject({
        input: 's'.repeat(32),
        timeout: 30_000,
        env: {
          WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
          WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
          WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
          WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
        },
      });
    }
    for (const invalid of [
      { enabledAllowedFids: '2' },
      { dailyAccounts: '3' },
      { currentDayGrants: '4' },
      { grantInvariantViolations: '1' },
      { grantAccountReconciliationViolations: '1' },
      { scheduleRows: '0' },
      { scheduleConfigValid: false },
      { active: false },
    ]) {
      expect(() => verifyActiveDailyMarksV14StatusOutput(
        JSON.stringify(activeDailyMarksV14Status(invalid)),
        4,
        3,
      )).toThrow(/exact active internally valid state/i);
    }
    expect(() => verifyActiveDailyMarksV14StatusOutput(
      JSON.stringify({ ...activeStatus, fid: '101' }),
      4,
      3,
    )).toThrow(/unexpected fields/i);
    expect(() => verifyFreshActiveDailyMarksV14(
      's'.repeat(32),
      activeExpectations,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/failed.*no publish was attempted/i);
    expect(() => verifyPostPublishActiveDailyMarksV14(
      's'.repeat(32),
      activeExpectations,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/active daily-Marks v14 checkpoint is indeterminate/i);

    const publicGrantTable = structuredClone(v14);
    publicGrantTable.tables
      .find(table => table.name === 'daily_mark_grant_v1')!.table_access = {
        Public: {},
      };
    expect(() => verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      publicGrantTable,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toThrow(/exact private v14 contract/i);

    const changedScheduleField = structuredClone(v14);
    changedScheduleField.typespace.types[
      DAILY_MARK_V14_TABLE_CONTRACTS.daily_mark_schedule_v_1.productTypeRef
    ].Product.elements[2]!.name.some = 'legacy_policy_version';
    expect(() => verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      changedScheduleField,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toThrow(/exact private v14 contract/i);

    const changedGrantType = structuredClone(v14);
    changedGrantType.typespace.types[
      DAILY_MARK_V14_TABLE_CONTRACTS.daily_mark_grant_v1.productTypeRef
    ].Product.elements[1]!.algebraic_type = { String: {} };
    expect(() => verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      changedGrantType,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toThrow(/v14 table schema.*proven publication boundary/i);

    const changedPredecessor = structuredClone(v14);
    changedPredecessor.tables
      .find(table => table.name === 'access_request_v1')!.constraints.push({
        name: 'unexpected_access_request_constraint',
        data: { Unique: { columns: [1] } },
      });
    expect(() => verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      changedPredecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
    )).toThrow(/v13 table schema.*proven publication boundary|pre-existing production table/i);

    expect(() => verifyExactProductionV14Schema(
      predecessor.tableSignatures,
      v14,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      '0'.repeat(64),
    )).toThrow(/v14 table schema.*proven publication boundary/i);
    expect(() => verifyPostPublishProductionV14ModuleSchema(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      v14TableSchemaDigest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/post-publication v14 module checkpoint is indeterminate/i);
  });

  it('guards the exact refs 56-63 inactive-v15 append over one captured active-v14 ABI', () => {
    const v12 = workerModuleSchemaDescription('candidate');
    const v13 = workerModuleSchemaDescription('candidate', true);
    const v14 = workerModuleSchemaDescription('candidate', true, true);
    const v15 = innerKeepV15ModuleSchemaDescription();
    const v12Names = [
      ...Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v13Names = [...v12Names, ...Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS)];
    const v14Names = [...v13Names, ...Object.keys(DAILY_MARK_V14_TABLE_CONTRACTS)];
    const v15Names = [...v14Names, ...Object.keys(INNER_KEEP_V15_TABLE_CONTRACTS)];
    const v12Digest = canonicalTableSchemaBoundaryDigest(v12, v12Names);
    const v13Digest = canonicalTableSchemaBoundaryDigest(v13, v13Names);
    const v14Digest = canonicalTableSchemaBoundaryDigest(v14, v14Names);
    const v15Digest = canonicalTableSchemaBoundaryDigest(v15, v15Names);

    expect(verifyInnerKeepV14PredecessorAbi(v14)).toBe('absent');
    const predecessor = verifyExactProductionV14InnerKeepPredecessor(
      v14,
      v12Digest,
      v13Digest,
      v14Digest,
    );
    expect(predecessor).toMatchObject({
      moduleState: 'candidate',
      innerKeepModuleState: 'absent',
      totalTableCount: 56,
    });
    expect(Object.keys(predecessor.tableSignatures)).toHaveLength(56);
    expect(verifyFreshProductionV14InnerKeepPredecessor(
      'spacetime',
      v12Digest,
      v13Digest,
      v14Digest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v14),
        stderr: '',
      })) as never,
    )).toEqual(predecessor);

    expect(verifyExactProductionV15Schema(
      predecessor.tableSignatures,
      v15,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
    )).toEqual({
      predecessorTableCount: 56,
      appendedInnerKeepTableCount: 8,
      totalTableCount: 64,
    });
    expect(verifyInnerKeepV15ModuleAbi(v15)).toBe('candidate');
    const completeV15 = verifyExactProductionV15ModuleSchema(
      v15,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
    );
    expect(completeV15).toMatchObject({
      moduleState: 'candidate',
      innerKeepModuleState: 'candidate',
      totalTableCount: 64,
    });
    expect(Object.keys(completeV15.tableSignatures)).toHaveLength(64);
    expect(verifyPostPublishProductionV15InactiveModuleSchema(
      'spacetime',
      predecessor,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v15),
        stderr: '',
      })) as never,
    )).toEqual({
      predecessorTableCount: 56,
      appendedInnerKeepTableCount: 8,
      totalTableCount: 64,
      moduleState: 'candidate',
      innerKeepModuleState: 'candidate',
    });

    const changedPredecessor = structuredClone(v15);
    changedPredecessor.tables.find(table => table.name === 'castle')!
      .indexes.push({
        name: 'unexpected_castle_index',
        algorithm: { BTree: { columns: [1] } },
      });
    expect(() => verifyExactProductionV15Schema(
      predecessor.tableSignatures,
      changedPredecessor,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
    )).toThrow(/v1[234] table schema.*proven publication boundary|pre-existing production table/i);

    const publicBuilder = structuredClone(v15);
    publicBuilder.tables.find(
      table => table.name === 'castle_inner_builder_v1',
    )!.table_access = { Public: {} };
    expect(() => verifyExactProductionV15Schema(
      predecessor.tableSignatures,
      publicBuilder,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
    )).toThrow(/exact v15 contract/i);

    const driftedAbi = structuredClone(v15);
    const startReducer = driftedAbi.reducers.find(
      reducer => reducer.name === 'inner_keep_start_project_v1',
    ) as {
      params: {
        elements: Array<{ algebraic_type: Record<string, unknown> }>;
      };
    };
    startReducer.params.elements[0]!.algebraic_type = { U64: {} };
    expect(() => verifyInnerKeepV15ModuleAbi(driftedAbi))
      .toThrow(/partial, unknown, or changed/i);
    expect(() => verifyInnerKeepV14PredecessorAbi(v15))
      .toThrow(/already exposed an Inner Keep ABI/i);
    expect(() => verifyPostPublishProductionV15InactiveModuleSchema(
      'spacetime',
      predecessor,
      v12Digest,
      v13Digest,
      v14Digest,
      v15Digest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/inactive-v15 module checkpoint is indeterminate/i);
  });

  it('requires an exact empty inactive Inner Keep postflight and unchanged historical aggregates', () => {
    const empty = emptyInactiveInnerKeepV15Status();
    expect(verifyEmptyInactiveInnerKeepV15StatusOutput(
      JSON.stringify(empty),
      4,
    )).toEqual(empty);
    const tsxCli = resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs');
    expect(innerKeepV15InspectChildArguments(tsxCli)).toEqual([
      tsxCli,
      'scripts/inner-keep-operator.ts',
      'inspect-inner-keep',
    ]);
    const inspectCalls: unknown[][] = [];
    expect(verifyPostPublishEmptyInactiveInnerKeepV15(
      's'.repeat(32),
      4,
      ((...args: unknown[]) => {
        inspectCalls.push(args);
        return {
          status: 0,
          signal: null,
          stdout: JSON.stringify(empty),
          stderr: '',
        };
      }) as never,
    )).toEqual(empty);
    expect(inspectCalls[0]?.[1]).toEqual(innerKeepV15InspectChildArguments(tsxCli));
    expect(inspectCalls[0]?.[2]).toMatchObject({
      input: 's'.repeat(32),
      timeout: 30_000,
      env: {
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      },
    });
    for (const change of [
      { layoutRows: '1' },
      { builderRows: '4' },
      { missingBuilders: '3' },
      { active: true },
      { readyForCatalogSeed: false },
    ]) {
      expect(() => verifyEmptyInactiveInnerKeepV15StatusOutput(
        JSON.stringify(emptyInactiveInnerKeepV15Status(change)),
        4,
      )).toThrow(/exact empty inactive post-publication state/i);
    }
    expect(() => verifyEmptyInactiveInnerKeepV15StatusOutput(
      JSON.stringify({ ...empty, fid: '123' }),
      4,
    )).toThrow(/unexpected fields/i);
    expect(() => verifyEmptyInactiveInnerKeepV15StatusOutput(
      JSON.stringify(emptyInactiveInnerKeepV15Status({
        layoutPolicyVersion: 'genesis-001-inner-keep-layout-v1',
      })),
      4,
    )).toThrow(/invalid policy attestations/i);
    const privateAccessRequestPage = {
      entries: [{
        fid: '123',
        requestedAt: '2026-08-03T00:00:00.000Z',
        admissionState: 'not-admitted',
        requestState: 'pending',
      }],
      nextCursor: null,
      hasMore: false,
      totalRequests: '1',
      pendingRequests: '1',
    };
    expect(accessRequestV13InspectChildArguments(tsxCli)).toEqual([
      tsxCli,
      'scripts/hermes-admin.ts',
      'list-access-requests',
      '--limit',
      '1',
      '--include-resolved',
      '--json',
    ]);
    const projectedAccessCounts = verifyPrivacySafeAccessRequestV13AggregateOutput(
      JSON.stringify(privateAccessRequestPage),
    );
    expect(projectedAccessCounts).toEqual({
      totalRequests: '1',
      pendingRequests: '1',
    });
    expect(JSON.stringify(projectedAccessCounts)).not.toContain('123');
    const accessInspect = vi.fn((..._args: unknown[]) => ({
      status: 0,
      signal: null,
      stdout: JSON.stringify(privateAccessRequestPage),
      stderr: '',
    }));
    expect(verifyFreshAccessRequestV13Aggregate(
      's'.repeat(32),
      accessInspect as never,
    )).toEqual(projectedAccessCounts);
    expect(verifyPostPublishAccessRequestV13Aggregate(
      's'.repeat(32),
      accessInspect as never,
    )).toEqual(projectedAccessCounts);
    expect(accessInspect).toHaveBeenCalledTimes(2);
    expect(accessInspect.mock.calls[0]?.[1]).toEqual(
      accessRequestV13InspectChildArguments(tsxCli),
    );
    expect(() => verifyPrivacySafeAccessRequestV13AggregateOutput(JSON.stringify({
      ...privateAccessRequestPage,
      pendingRequests: '2',
    }))).toThrow(/inconsistent aggregate counts/i);
    expect(() => verifyPrivacySafeAccessRequestV13AggregateOutput(JSON.stringify({
      ...privateAccessRequestPage,
      secret: 'private',
    }))).toThrow(/invalid private page envelope/i);
    const aggregate = Object.freeze({ protocolV3: { castles: '4' } });
    expect(verifyHistoricalPublicationAggregateUnchanged(
      aggregate,
      structuredClone(aggregate),
    )).toEqual(aggregate);
    expect(() => verifyHistoricalPublicationAggregateUnchanged(
      aggregate,
      { protocolV3: { castles: '5' } },
    )).toThrow(/historical aggregate state changed/i);
  });

  it('retains the reviewed v11 lane while proving both v12 and v13 append boundaries', () => {
    const v11 = productionSchemaDescription(false);
    const v11TableNames = Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS);
    const v11TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v11,
      v11TableNames,
    );
    const predecessor = verifyExactProductionV11Schema(
      v11,
      v11TableSchemaDigest,
    );
    const v12 = workerModuleSchemaDescription('candidate');
    const v13 = workerModuleSchemaDescription('candidate', true);
    const v12TableNames = [
      ...v11TableNames,
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const v13TableNames = [
      ...v12TableNames,
      ...Object.keys(ACCESS_REQUEST_V13_TABLE_CONTRACTS),
    ];
    const v12TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v12,
      v12TableNames,
    );
    const v13TableSchemaDigest = canonicalTableSchemaBoundaryDigest(
      v13,
      v13TableNames,
    );

    expect(verifyExactProductionV13SchemaFromV11(
      predecessor,
      v13,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      appendedAccessRequestTableCount: 1,
      totalTableCount: 54,
    });
    expect(verifyPostPublishProductionV13SchemaFromV11(
      'spacetime',
      predecessor,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(v13),
        stderr: '',
      })) as never,
    )).toEqual({
      predecessorTableCount: 47,
      appendedWorkerTableCount: 6,
      appendedAccessRequestTableCount: 1,
      totalTableCount: 54,
    });

    const driftedV11 = structuredClone(v13);
    driftedV11.tables.find(table => table.name === 'castle')!.indexes[0] = {
      name: 'castle_by_primary',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyExactProductionV13SchemaFromV11(
      predecessor,
      driftedV11,
      v12TableSchemaDigest,
      v13TableSchemaDigest,
    )).toThrow(/v12 table schema.*proven publication boundary|pre-existing production table/i);
  });

  it('routes every retained publication lane through its exact post-checkpoint', () => {
    const publisher = readFileSync(
      resolve(repositoryRoot, 'scripts/publish-spacetime-dev.mjs'),
      'utf8',
    );
    expect(publisher).toMatch(
      /await publishModule\(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt\);[\s\S]*verifyPostPublishProductionV13ModuleSchema\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest/,
    );
    expect(publisher).toMatch(
      /verifyFreshProductionV11Schema\([\s\S]*await publishModule\(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt\);[\s\S]*verifyPostPublishProductionV13SchemaFromV11\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest/,
    );
    expect(publisher).toMatch(
      /EXACT_V13_ACTIVE[\s\S]*verifyFreshProductionV13ModuleSchema\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest,[\s\S]*await publishModule\(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt\);[\s\S]*verifyPostPublishProductionV13ActiveModuleSchema\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest/,
    );
    expect(publisher).toMatch(
      /EXACT_V13_ACTIVE_V14_EMPTY[\s\S]*verifyFreshProductionV13ModuleSchema\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest,[\s\S]*await publishModule\(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt\);[\s\S]*verifyPostPublishProductionV14ModuleSchema\([\s\S]*artifactReceipt\.v12TableSchemaDigest,[\s\S]*artifactReceipt\.v13TableSchemaDigest,[\s\S]*artifactReceipt\.v14TableSchemaDigest,[\s\S]*verifyPostPublishEmptyDailyMarksV14\(adminTokenSecret\)/,
    );
    const exactV14ActiveLane = publisher.slice(
      publisher.indexOf('const exactV14Active = workerModulePredecessor'),
      publisher.indexOf('} else if (exactV14Append)', publisher.indexOf(
        'const exactV14Active = workerModulePredecessor',
      )),
    );
    expect(exactV14ActiveLane).toContain('WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE');
    expect(exactV14ActiveLane).toContain('verifyFreshProductionV14ModuleSchema(');
    expect(exactV14ActiveLane).toContain('artifactReceipt.v12TableSchemaDigest');
    expect(exactV14ActiveLane).toContain('artifactReceipt.v13TableSchemaDigest');
    expect(exactV14ActiveLane).toContain('artifactReceipt.v14TableSchemaDigest');
    expect(exactV14ActiveLane).toContain('verifyFreshActiveDailyMarksV14(');
    expect(exactV14ActiveLane).toContain(
      'await publishModule(executable, CANONICAL_DATABASE_IDENTITY, artifactReceipt);',
    );
    expect(exactV14ActiveLane).toContain('verifyPostPublishProductionV14ActiveModuleSchema(');
    expect(exactV14ActiveLane).toContain('verifyPostPublishActiveDailyMarksV14(');
    expect(exactV14ActiveLane.indexOf('verifyFreshProductionV14ModuleSchema('))
      .toBeLessThan(exactV14ActiveLane.indexOf('await publishModule('));
    expect(exactV14ActiveLane.indexOf('verifyFreshActiveDailyMarksV14('))
      .toBeLessThan(exactV14ActiveLane.indexOf('await publishModule('));
    expect(exactV14ActiveLane.indexOf('verifyPostPublishProductionV14ActiveModuleSchema('))
      .toBeGreaterThan(exactV14ActiveLane.indexOf('await publishModule('));
    expect(exactV14ActiveLane.indexOf('verifyPostPublishActiveDailyMarksV14('))
      .toBeGreaterThan(exactV14ActiveLane.indexOf('await publishModule('));
    expect(publisher).toContain("'--delete-data=never'");
    const privateWorkerReceipt = publisher.slice(
      publisher.indexOf('const receipt = writePrivateSpacetimePublishSuccessReceipt({'),
      publisher.indexOf("console.log(JSON.stringify({\n          publication: 'verified'", publisher.indexOf(
        'const receipt = writePrivateSpacetimePublishSuccessReceipt({',
      )),
    );
    expect(privateWorkerReceipt).toContain(
      'v12TableSchemaDigest: artifactReceipt.v12TableSchemaDigest',
    );
    expect(privateWorkerReceipt).not.toContain('v13TableSchemaDigest');
  });

  it('pins the inert boundary, exact active predecessor, and additive atomic candidate ABI', () => {
    const inertPredecessor = workerModuleSchemaDescription('predecessor');
    const activePredecessor = workerModuleSchemaDescription('active-predecessor');
    const candidate = workerModuleSchemaDescription('candidate');
    const tableNames = [
      ...Object.keys(PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS),
      ...Object.keys(WORKER_V12_TABLE_CONTRACTS),
    ];
    const digest = canonicalTableSchemaBoundaryDigest(inertPredecessor, tableNames);
    expect(canonicalTableSchemaBoundaryDigest(activePredecessor, tableNames)).toBe(digest);
    expect(canonicalTableSchemaBoundaryDigest(candidate, tableNames)).toBe(digest);
    expect(verifyWorkerV12ModuleAbi(inertPredecessor)).toBe('predecessor');
    expect(verifyWorkerV12ModuleAbi(activePredecessor)).toBe('active-predecessor');
    expect(verifyWorkerV12ModuleAbi(candidate)).toBe('candidate');
    expect(verifyWorkerV12ModulePredecessor(
      'predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V12_EMPTY,
    )).toBe('predecessor');
    expect(verifyWorkerV12ModulePredecessor(
      'active-predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE,
    )).toBe('active-predecessor');
    expect(verifyWorkerV12ModulePredecessor(
      'candidate',
      WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE,
    )).toBe('candidate');
    expect(() => verifyWorkerV12ModulePredecessor(
      'active-predecessor',
      WORKER_MODULE_PREDECESSOR.EXACT_V12_EMPTY,
    )).toThrow(/did not match the exact production v12 ABI/i);
    expect(planWorkerV12CodePublication(
      'active-predecessor',
      WORKER_FORWARD_REPAIR.NONE,
    )).toEqual({
      prePublicationCheckpoint: WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
      postPublicationCheckpoint: WORKER_FORWARD_REPAIR_CHECKPOINT.HEALTHY,
    });
    expect(planWorkerV12CodePublication(
      'active-predecessor',
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
    )).toEqual({
      prePublicationCheckpoint:
        WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
      postPublicationCheckpoint:
        WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
    });
    expect(planWorkerV12CodePublication(
      'candidate',
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
    )).toEqual({
      prePublicationCheckpoint:
        WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING,
      postPublicationCheckpoint:
        WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING,
    });
    expect(() => planWorkerV12CodePublication(
      'predecessor',
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
    )).toThrow(/forward-repair publication plan was invalid/i);
    expect(() => planWorkerV12CodePublication(
      'unknown',
      WORKER_FORWARD_REPAIR.NONE,
    )).toThrow(/module state was invalid/i);

    const inert = verifyExactProductionV12ModuleSchema(inertPredecessor, digest);
    expect(inert.moduleState).toBe('predecessor');
    const captured = verifyExactProductionV12ModuleSchema(activePredecessor, digest);
    expect(captured.moduleState).toBe('active-predecessor');
    expect(captured.totalTableCount).toBe(53);
    expect(Object.keys(captured.tableSignatures)).toHaveLength(53);
    const alreadyPublished = verifyExactProductionV12ModuleSchema(candidate, digest);
    expect(alreadyPublished.moduleState).toBe('candidate');

    const preflightCalls: unknown[][] = [];
    expect(verifyFreshProductionV12ModuleSchema(
      'spacetime',
      digest,
      ((...args: unknown[]) => {
        preflightCalls.push(args);
        return {
          status: 0,
          signal: null,
          stdout: JSON.stringify(activePredecessor),
          stderr: '',
        };
      }) as never,
    )).toEqual(captured);
    expect(preflightCalls).toHaveLength(1);
    expect(preflightCalls[0]?.[1]).toEqual(canonicalSchemaDescribeChildArguments());

    expect(verifyPostPublishProductionV12ModuleSchema(
      'spacetime',
      captured,
      digest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(candidate),
        stderr: '',
      })) as never,
    )).toEqual(alreadyPublished);

    expect(verifyPostPublishProductionV12ModuleSchema(
      'spacetime',
      alreadyPublished,
      digest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(candidate),
        stderr: '',
      })) as never,
    )).toEqual(alreadyPublished);

    const tableDrift = structuredClone(candidate);
    tableDrift.tables.find(table => table.name === 'castle')!.indexes[0] = {
      name: 'changed_after_capture',
      algorithm: { BTree: { columns: [1] } },
    };
    expect(() => verifyPostPublishProductionV12ModuleSchema(
      'spacetime',
      captured,
      digest,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(tableDrift),
        stderr: '',
      })) as never,
    )).toThrow(/indeterminate.*fresh anonymous read-only schema and ABI inspection/i);

    const partial = structuredClone(inertPredecessor);
    partial.reducers.push(
      workerModuleSchemaDescription('candidate').reducers.find(
        reducer => reducer.name === 'return_legacy_expedition_v1',
      )!,
    );
    expect(() => verifyWorkerV12ModuleAbi(partial))
      .toThrow(/partial, unknown, or changed/i);

    const missingModuleDigest = structuredClone(candidate);
    const activation = missingModuleDigest.reducers.find(
      reducer => reducer.name === 'admin_activate_worker_system_v1',
    )!;
    activation.params = {
      elements: (activation.params as { elements: Array<{
        name: { some: string };
        algebraic_type: Record<string, unknown>;
      }> }).elements.filter(field => field.name.some !== 'moduleArtifactDigest'),
    };
    expect(() => verifyWorkerV12ModuleAbi(missingModuleDigest))
      .toThrow(/partial, unknown, or changed/i);

    const incompleteStatus = structuredClone(candidate);
    const statusProcedure = incompleteStatus.misc_exports[0]!.Procedure as {
      return_type: { Ref: number };
    };
    incompleteStatus.typespace.types[
      statusProcedure.return_type.Ref
    ]!.Product.elements = incompleteStatus.typespace.types[
      statusProcedure.return_type.Ref
    ]!.Product.elements.filter(
      field => field.name.some !== 'legacy_gold_expeditions',
    );
    expect(() => verifyWorkerV12ModuleAbi(incompleteStatus))
      .toThrow(/partial, unknown, or changed/i);

    expect(() => verifyFreshProductionV12ModuleSchema(
      'spacetime',
      digest,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    )).toThrow(/preflight failed.*no publish was attempted/i);
  });

  it('rejects every missing, extra, or drifted critical Worker API surface', () => {
    const candidate = workerModuleSchemaDescription('candidate');
    for (const reducer of candidate.reducers) {
      const missing = structuredClone(candidate);
      missing.reducers = missing.reducers.filter(
        entry => entry.name !== reducer.name,
      );
      expect(
        () => verifyWorkerV12ModuleAbi(missing),
        `missing reducer ${String(reducer.name)}`,
      ).toThrow(/partial, unknown, or changed/i);
    }
    for (const entry of candidate.misc_exports) {
      const procedureName = (entry.Procedure as { name: string }).name;
      const missing = structuredClone(candidate);
      missing.misc_exports = missing.misc_exports.filter(
        candidateEntry => (
          (candidateEntry.Procedure as { name: string }).name !== procedureName
        ),
      );
      expect(
        () => verifyWorkerV12ModuleAbi(missing),
        `missing procedure ${procedureName}`,
      ).toThrow(/partial, unknown, or changed/i);
    }
    const activePredecessor = structuredClone(candidate);
    activePredecessor.reducers = activePredecessor.reducers.filter(
      reducer => reducer.name !== 'admin_repair_missing_worker_return_schedule_v1',
    );
    activePredecessor.misc_exports = activePredecessor.misc_exports.filter(
      entry => (
        (entry.Procedure as { name: string }).name
        !== 'get_my_worker_control_state_v1'
      ),
    );
    expect(verifyWorkerV12ModuleAbi(activePredecessor))
      .toBe('active-predecessor');

    const extraReducer = structuredClone(candidate);
    const stagedReducer = extraReducer.reducers.find(
      reducer => reducer.name === 'admin_stage_worker_system_v1',
    )!;
    extraReducer.reducers.push({
      ...structuredClone(stagedReducer),
      name: 'admin_debug_worker_override_v1',
    });
    expect(() => verifyWorkerV12ModuleAbi(extraReducer))
      .toThrow(/partial, unknown, or changed/i);

    const extraProcedure = structuredClone(candidate);
    const systemStatusProcedure = extraProcedure.misc_exports.find(
      entry => (
        (entry.Procedure as { name: string }).name
          === 'admin_get_worker_system_status_v1'
      ),
    )!;
    extraProcedure.misc_exports.push({
      Procedure: {
        ...structuredClone(
          systemStatusProcedure.Procedure as Record<string, unknown>,
        ),
        name: 'admin_debug_worker_status_v1',
      },
    });
    expect(() => verifyWorkerV12ModuleAbi(extraProcedure))
      .toThrow(/partial, unknown, or changed/i);

    const driftedCommand = structuredClone(candidate);
    const dispatch = driftedCommand.reducers.find(
      reducer => reducer.name === 'dispatch_worker_v1',
    )!;
    const dispatchParams = dispatch.params as {
      elements: Array<{
        name: { some: string };
        algebraic_type: Record<string, unknown>;
      }>;
    };
    dispatchParams.elements.find(
      field => field.name.some === 'workerId',
    )!.algebraic_type = { U64: {} };
    expect(() => verifyWorkerV12ModuleAbi(driftedCommand))
      .toThrow(/partial, unknown, or changed/i);

    const driftedNestedRoster = structuredClone(candidate);
    const rosterProcedure = driftedNestedRoster.misc_exports.find(
      entry => (
        (entry.Procedure as { name: string }).name === 'get_my_worker_roster_v1'
      ),
    )!.Procedure as { return_type: { Ref: number } };
    const rosterType = driftedNestedRoster.typespace.types[
      rosterProcedure.return_type.Ref
    ] as {
      Product: {
        elements: Array<{
          name: { some: string };
          algebraic_type: { Array?: { Ref: number } };
        }>;
      };
    };
    const privateWorkerRef = rosterType.Product.elements.find(
      field => field.name.some === 'workers',
    )!.algebraic_type.Array!.Ref;
    const privateWorkerType = driftedNestedRoster.typespace.types[
      privateWorkerRef
    ] as {
      Product: {
        elements: Array<{
          name: { some: string };
          algebraic_type: Record<string, unknown>;
        }>;
      };
    };
    privateWorkerType.Product.elements.find(
      field => field.name.some === 'status',
    )!.algebraic_type = { Bool: {} };
    expect(() => verifyWorkerV12ModuleAbi(driftedNestedRoster))
      .toThrow(/partial, unknown, or changed/i);

    const driftedAtomicControl = structuredClone(candidate);
    const controlProcedure = driftedAtomicControl.misc_exports.find(
      entry => (
        (entry.Procedure as { name: string }).name
          === 'get_my_worker_control_state_v1'
      ),
    )!.Procedure as { return_type: { Ref: number } };
    const controlType = driftedAtomicControl.typespace.types[
      controlProcedure.return_type.Ref
    ] as {
      Product: {
        elements: Array<{
          name: { some: string };
          algebraic_type: Record<string, unknown>;
        }>;
      };
    };
    controlType.Product.elements.find(
      field => field.name.some === 'observed_at_micros',
    )!.algebraic_type = { String: {} };
    expect(() => verifyWorkerV12ModuleAbi(driftedAtomicControl))
      .toThrow(/partial, unknown, or changed/i);
  });

  it('binds an exact single migration receipt and rejects artifact changes before spawn', async () => {
    await withTestProvenArtifact(async receipt => {
      const success = `${formatAdditiveMigrationProofReceipt({
        summary: 'test-only receipt.',
        v11TableSchemaDigest: receipt.v11TableSchemaDigest,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest,
        v13TableSchemaDigest: receipt.v13TableSchemaDigest,
        v14TableSchemaDigest: receipt.v14TableSchemaDigest,
        v15TableSchemaDigest: receipt.v15TableSchemaDigest,
        v16TableSchemaDigest: receipt.v16TableSchemaDigest,
        v17TableSchemaDigest: receipt.v17TableSchemaDigest,
        artifactDigest: receipt.artifactDigest,
      })}\n`;
      const parsed = parseMigrationProofReceipt(success);
      expect(parsed).toEqual(receipt);
      expect(Object.isFrozen(parsed)).toBe(true);
      expect(() => requireReviewedAdditivePublicationLane(parsed))
        .toThrow(/explicit exact-v14-active predecessor and append-inactive stage/i);
      expect(requireReviewedAdditivePublicationLane(
        parsed,
        INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
        INNER_KEEP_PUBLICATION_STAGE.APPEND_INACTIVE,
      )).toEqual(parsed);
      expect(() => requireReviewedAdditivePublicationLane(
        parsed,
        INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
        undefined,
      )).toThrow(/explicit exact-v14-active predecessor and append-inactive stage/i);
      expect(() => parseMigrationProofReceipt('')).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(`${success}${success}`)).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        `protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION}`,
        `protocol-v${ADDITIVE_MIGRATION_PROOF_PROTOCOL_VERSION - 1}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ADDITIVE_MIGRATION_PROOF_SPACETIME_CLI_VERSION,
        '0.0.0',
      )))
        .toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace('artifact_sha256=', 'artifact_digest=')))
        .toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`
          + ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v13_table_schema_sha256=${receipt.v13TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v14_table_schema_sha256=${receipt.v14TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v15_table_schema_sha256=${receipt.v15TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v16_table_schema_sha256=${receipt.v16TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v17_table_schema_sha256=${receipt.v17TableSchemaDigest}`,
        '',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`
          + ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
        ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`
          + ` v11_table_schema_sha256=${receipt.v11TableSchemaDigest}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`
          + ` v13_table_schema_sha256=${receipt.v13TableSchemaDigest}`,
        ` v13_table_schema_sha256=${receipt.v13TableSchemaDigest}`
          + ` v12_table_schema_sha256=${receipt.v12TableSchemaDigest}`,
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(
        receipt.v11TableSchemaDigest,
        'not-a-digest',
      ))).toThrow(/exact success receipt/i);
      expect(() => parseMigrationProofReceipt(success.replace(receipt.artifactDigest, '0'.repeat(64))))
        .toThrow(/changed after migration/i);
      expect(() => parseMigrationProofReceipt(success.replace(receipt.artifactDigest, 'not-a-digest')))
        .toThrow(/exact success receipt/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactPath: resolve(repositoryRoot, 'spacetimedb/dist/other.js'),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        artifactDigest: receipt.artifactDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v13TableSchemaDigest: receipt.v13TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v14TableSchemaDigest: receipt.v14TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v15TableSchemaDigest: receipt.v15TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v16TableSchemaDigest: receipt.v16TableSchemaDigest.toUpperCase(),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({
        ...receipt,
        v17TableSchemaDigest: 'A'.repeat(64),
      })).toThrow(/receipt was invalid/i);
      expect(() => verifyMigrationArtifactReceipt({ ...receipt, extra: true }))
        .toThrow(/receipt was invalid/i);
      await expect(publishModule(
        'spacetime',
        'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b5700',
        receipt,
        vi.fn() as never,
      )).rejects.toThrow(/pinned canonical database identity/i);

      await writeFile(provenArtifactPath, 'test-only-changed-artifact');
      expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/changed after migration/i);
      const spawnProcess = vi.fn();
      await expect(publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        spawnProcess as never,
      )).rejects.toThrow(/changed after migration/i);
      expect(spawnProcess).not.toHaveBeenCalled();
    });
  });

  it('retains earlier rehearsal guards and hard-closes the review-only v17 artifact', () => {
    const publisher = readFileSync(
      resolve(repositoryRoot, 'scripts/publish-spacetime-dev.mjs'),
      'utf8',
    );
    const proof = publisher.indexOf(
      'runCurrentAdditiveMigrationProof(executable)',
    );
    const gate = publisher.indexOf(
      'const artifactReceipt = requireReviewedAdditivePublicationLane(',
    );
    const lane = publisher.indexOf(
      'executeProtocolV15InactivePublicationLane({',
      gate,
    );
    const laneDefinition = publisher.indexOf(
      'export async function executeProtocolV15InactivePublicationLane(',
    );
    const hardClose = publisher.indexOf(
      'requireCurrentReviewOnlyProductionPublishReady();',
      laneDefinition,
    );
    const publish = publisher.indexOf(
      'await (dependencies.publishModule ?? publishModule)(',
      laneDefinition,
    );

    expect(proof).toBeGreaterThan(-1);
    expect(gate).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(proof);
    expect(lane).toBeGreaterThan(proof);
    expect(laneDefinition).toBeGreaterThan(-1);
    expect(hardClose).toBeGreaterThan(laneDefinition);
    expect(publish).toBeGreaterThan(hardClose);
    expect(publisher).toContain('INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE');
    expect(publisher).toContain('INNER_KEEP_PUBLICATION_STAGE.APPEND_INACTIVE');
    expect(publisher).toContain("'--delete-data=never'");
    expect(() => requireRealmChatV16ProductionPublishReady())
      .toThrow(/protocol v16 is review-only/i);
    expect(() => requireGreaterRealmV17ProductionPublishReady())
      .toThrow(/protocol v17 is review-only/i);
    expect(() => requireCurrentReviewOnlyProductionPublishReady())
      .toThrow(/protocol v17 is review-only/i);
    const composite = publisher.slice(
      publisher.indexOf('export function requireCurrentReviewOnlyProductionPublishReady()'),
      publisher.indexOf('/**\n * Retain the reviewed active-v14', publisher.indexOf(
        'export function requireCurrentReviewOnlyProductionPublishReady()',
      )),
    );
    expect(composite).toContain('requireGreaterRealmV17ProductionPublishReady();');
    expect(composite).toContain('requireRealmChatV16ProductionPublishReady();');
  });

  it('runs the inactive-v15 dry run as reads only and keeps publish behind all preflights', async () => {
    const receipt = Object.freeze({
      artifactPath: provenArtifactPath,
      v11TableSchemaDigest: '1'.repeat(64),
      v12TableSchemaDigest: '2'.repeat(64),
      v13TableSchemaDigest: '3'.repeat(64),
      v14TableSchemaDigest: '4'.repeat(64),
      v15TableSchemaDigest: '5'.repeat(64),
      v16TableSchemaDigest: '6'.repeat(64),
      v17TableSchemaDigest: '7'.repeat(64),
      artifactDigest: '8'.repeat(64),
    });
    const expectations = Object.freeze({
      expectedEnabledAllowedFidCount: 3,
      expectedFounderCount: 4,
      expectedPlayerCount: 4,
      expectedTermsAcceptanceCount: 4,
    });
    const baseOptions = {
      executable: '/private/pinned-spacetime',
      artifactReceipt: receipt,
      adminTokenSecret: 's'.repeat(32),
      publishConfirmation: 'warpkeep',
      foundedExpectations: expectations,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
      innerKeepModulePredecessor:
        INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      innerKeepPublicationStage:
        INNER_KEEP_PUBLICATION_STAGE.APPEND_INACTIVE,
    };
    const historical = Object.freeze({ protocolV3: { castles: '4' } });
    const daily = Object.freeze({ grants: '21', active: true });
    const accessRequests = Object.freeze({
      totalRequests: '2',
      pendingRequests: '1',
    });
    const publish = vi.fn();
    const postSchema = vi.fn();
    const postAggregate = vi.fn();
    const postDaily = vi.fn();
    const postInnerKeep = vi.fn();
    const postAccessRequests = vi.fn();
    const dependencies = {
      verifyMigrationArtifactReceipt: vi.fn(() => receipt),
      verifyFreshProductionV14InnerKeepPredecessor: vi.fn(() => ({
        moduleState: 'candidate',
        innerKeepModuleState: 'absent',
        tableSignatures: Object.freeze({}),
        totalTableCount: 56,
      })),
      verifyWorkerV14ModulePredecessor: vi.fn(() => 'candidate'),
      verifyFreshPublishExactV12Aggregate: vi.fn(() => historical),
      verifyFreshActiveDailyMarksV14: vi.fn(() => daily),
      verifyFreshAccessRequestV13Aggregate: vi.fn(() => accessRequests),
      publishModule: publish,
      verifyPostPublishProductionV15InactiveModuleSchema: postSchema,
      verifyPostPublishResourcePublicationCheckpoints: postAggregate,
      verifyPostPublishActiveDailyMarksV14: postDaily,
      verifyPostPublishAccessRequestV13Aggregate: postAccessRequests,
      verifyPostPublishEmptyInactiveInnerKeepV15: postInnerKeep,
    };

    for (const publishConfirmation of [undefined, 'not-warpkeep']) {
      await expect(executeProtocolV15InactivePublicationLane(
        { ...baseOptions, dryRun: false, publishConfirmation },
        dependencies,
      )).rejects.toThrow(/WARPKEEP_PUBLISH_CONFIRM=warpkeep/i);
      expect(Object.values(dependencies).every(dependency => (
        !('mock' in dependency) || dependency.mock.calls.length === 0
      ))).toBe(true);
    }

    await expect(executeProtocolV15InactivePublicationLane(
      { ...baseOptions, dryRun: true },
      dependencies,
    )).resolves.toEqual({
      publication: 'dry-run-verified',
      protocol: 'v15',
      stage: INNER_KEEP_PUBLICATION_STAGE.APPEND_INACTIVE,
      predecessor: INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      deletion: 'disabled',
      networkMode: 'read-only',
    });
    expect(publish).not.toHaveBeenCalled();
    expect(postSchema).not.toHaveBeenCalled();
    expect(postAggregate).not.toHaveBeenCalled();
    expect(postDaily).not.toHaveBeenCalled();
    expect(postInnerKeep).not.toHaveBeenCalled();
    expect(postAccessRequests).not.toHaveBeenCalled();

    await expect(executeProtocolV15InactivePublicationLane(
      { ...baseOptions, dryRun: false },
      dependencies,
    )).rejects.toThrow(/protocol v17 is review-only/i);
    expect(publish).not.toHaveBeenCalled();
    expect(postSchema).not.toHaveBeenCalled();
    expect(postAggregate).not.toHaveBeenCalled();
    expect(postDaily).not.toHaveBeenCalled();
    expect(postInnerKeep).not.toHaveBeenCalled();
    expect(postAccessRequests).not.toHaveBeenCalled();
  });

  it('gives the real scheduler migration proof a dedicated bounded process deadline', async () => {
    await withTestProvenArtifact(async receipt => {
      const calls: unknown[][] = [];
      const success = `${formatAdditiveMigrationProofReceipt({
        summary: 'test-only scheduler receipt.',
        v11TableSchemaDigest: receipt.v11TableSchemaDigest,
        v12TableSchemaDigest: receipt.v12TableSchemaDigest,
        v13TableSchemaDigest: receipt.v13TableSchemaDigest,
        v14TableSchemaDigest: receipt.v14TableSchemaDigest,
        v15TableSchemaDigest: receipt.v15TableSchemaDigest,
        v16TableSchemaDigest: receipt.v16TableSchemaDigest,
        v17TableSchemaDigest: receipt.v17TableSchemaDigest,
        artifactDigest: receipt.artifactDigest,
      })}\n`;
      const fakeSpawnSync = (...args: unknown[]) => {
        calls.push(args);
        return {
          error: undefined,
          signal: null,
          status: 0,
          stderr: '',
          stdout: success,
        };
      };

      expect(runCurrentAdditiveMigrationProof('spacetime', fakeSpawnSync as never))
        .toEqual(receipt);
      expect(calls).toHaveLength(1);
      expect(calls[0]?.[0]).toBe(process.execPath);
      expect(calls[0]?.[1]).toEqual(['scripts/verify-spacetime-additive-migration.mjs']);
      expect(calls[0]?.[2]).toMatchObject({
        timeout: ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS,
      });
      expect(ADDITIVE_MIGRATION_PROOF_PROCESS_TIMEOUT_MILLISECONDS)
        .toBe(20 * 60 * 1_000);
      expect(ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS)
        .toBe(10 * 60 * 1_000);
      expect(ADDITIVE_MIGRATION_PROOF_MINIMUM_LIFECYCLE_MILLISECONDS)
        .toBeGreaterThan(5 * 60 * 1_000);
    });
  });

  it('rejects a symlink at the canonical proven-artifact path', async () => {
    await withTestProvenArtifact(async receipt => {
      await rm(provenArtifactPath, { force: true });
      try {
        await symlink(resolve(repositoryRoot, 'spacetimedb/src/config.ts'), provenArtifactPath);
        expect(() => verifyMigrationArtifactReceipt(receipt)).toThrow(/could not be read/i);
      } finally {
        await rm(provenArtifactPath, { force: true });
      }
    });
  });

  it('kills and rejects a publish whose combined output exceeds the fixed bound', async () => {
    await withTestProvenArtifact(async receipt => {
      let snapshotPath = '';
      const child = new EventEmitter() as EventEmitter & {
        kill: ReturnType<typeof vi.fn>;
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      child.kill = vi.fn();
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      const publish = publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        ((...args: unknown[]) => {
          const publishArguments = args[1] as string[];
          snapshotPath = publishArguments[publishArguments.indexOf('--js-path') + 1] ?? '';
          return child;
        }) as never,
      );
      await vi.waitFor(() => expect(snapshotPath).not.toBe(''));
      child.stdout.emit('data', Buffer.alloc(1_000_001));
      child.emit('close', 1, 'SIGKILL');
      await expect(publish).rejects.toThrow(/output exceeded its fixed bound/i);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      expect(snapshotPath).not.toBe('');
      expect(() => statSync(snapshotPath)).toThrow();
    });
  });

  it('rejects unknown publisher flags and noncanonical production coordinates', () => {
    expect(parsePublishArguments([
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.V11,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
      '--dry-run',
    ])).toEqual({
      dryRun: true,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.V11,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v12-empty',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V12_EMPTY,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v12-active',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v13-active',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v13-active-v14-empty',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor:
        WORKER_MODULE_PREDECESSOR.EXACT_V13_ACTIVE_V14_EMPTY,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
    });
    expect(parsePublishArguments([
      '--dry-run',
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
      '--inner-keep-module-predecessor=exact-v14-active',
      '--inner-keep-publication-stage=append-inactive',
    ])).toEqual({
      dryRun: true,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.NONE,
      innerKeepModulePredecessor:
        INNER_KEEP_MODULE_PREDECESSOR.EXACT_V14_ACTIVE,
      innerKeepPublicationStage:
        INNER_KEEP_PUBLICATION_STAGE.APPEND_INACTIVE,
    });
    expect(parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v12-active',
      '--worker-forward-repair=return-node-reuse-v1',
    ])).toEqual({
      dryRun: false,
      resourceRolloutStage: RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      genesisWorldRolloutStage: GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
      workerRolloutStage: WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      workerModulePredecessor: WORKER_MODULE_PREDECESSOR.EXACT_V12_ACTIVE,
      workerForwardRepair: WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
    });
    expect(() => parsePublishArguments([])).toThrow(/explicit resource rollout stage/i);
    expect(() => parsePublishArguments(['--dry-run'])).toThrow(/explicit resource rollout stage/i);
    expect(() => parsePublishArguments(['--dryrun'])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--dry-run',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=prebackfill',
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=unknown',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--worker-rollout-stage=empty',
    ])).toThrow(/explicit Genesis world stage/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=pre-expansion',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
    ])).toThrow(/explicit Worker rollout stage/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=unknown',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-rollout-stage=empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v12-empty',
      '--worker-module-predecessor=exact-v12-empty',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=unknown',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-forward-repair=none',
    ])).toThrow(/exact active-v12 module predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v12-active',
      '--worker-forward-repair=none',
    ])).toThrow(/exact active-v12 module predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v13-active',
      '--worker-forward-repair=none',
    ])).toThrow(/exact active-v13 module predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v13-active-v14-empty',
      '--worker-forward-repair=none',
    ])).toThrow(/exact active-v13-to-empty-v14 module predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
    ])).toThrow(/exact active-v14 module predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v13-active-v14-empty',
      '--worker-forward-repair=return-node-reuse-v1',
    ])).toThrow(/schema-only.*worker-forward-repair=none/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
    ])).toThrow(/active-v14.*resource ready.*Genesis expanded.*Worker active.*worker-forward-repair=none/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
    ])).toThrow(/active-v14.*resource ready.*Genesis expanded.*Worker active.*worker-forward-repair=none/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=return-node-reuse-v1',
    ])).toThrow(/active-v14.*resource ready.*Genesis expanded.*Worker active.*worker-forward-repair=none/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
      '--inner-keep-module-predecessor=exact-v14-active',
    ])).toThrow(/both an explicit module predecessor and an explicit publication stage/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v13-active',
      '--worker-forward-repair=none',
      '--inner-keep-module-predecessor=exact-v14-active',
      '--inner-keep-publication-stage=append-inactive',
    ])).toThrow(/Inner Keep v15 append requires the exact active-v14 predecessor/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=active',
      '--worker-module-predecessor=exact-v14-active',
      '--worker-forward-repair=none',
      '--inner-keep-module-predecessor=exact-v14-active',
      '--inner-keep-publication-stage=append-inactive',
      '--inner-keep-publication-stage=append-inactive',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
    ])).toThrow(/explicit Worker forward-repair selection/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=unknown',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
      '--worker-forward-repair=none',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parsePublishArguments([
      '--resource-rollout-stage=ready',
      '--genesis-world-stage=expanded',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=return-node-reuse-v1',
    ])).toThrow(/exact ready, expanded, active-v12 production predecessor/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-lookalike',
    })).toThrow(/canonical existing/i);
    expect(() => requireCanonicalPublishCoordinates({
      WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep',
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    })).not.toThrow();
  });

  it('blocks production publication while the entry agreement remains review-only', () => {
    expect(() => requireEntryAgreementProductionRelease())
      .toThrow(/entry agreement is review-only/i);
    expect(() => requireEntryAgreementProductionRelease('production-approved'))
      .not.toThrow();
    expect(() => requireEntryAgreementProductionRelease(
      'review-only-rollout-blocked',
      true,
    )).not.toThrow();
    expect(() => requireEntryAgreementProductionRelease(''))
      .toThrow(/coordinated Pages and SpacetimeDB rollout approval/i);
  });

  it('binds the repair operator to one recent private successful publication receipt', async () => {
    const root = await mkdtemp(join(
      realpathSync(tmpdir()),
      'warpkeep-publish-receipt-',
    ));
    const controlledRepository = join(root, 'repository');
    const receiptDirectory = join(root, 'receipts');
    const artifactDigest = 'a'.repeat(64);
    const v12TableSchemaDigest = 'b'.repeat(64);
    const recordedAt = new Date('2026-07-27T20:00:00.000Z');
    try {
      await mkdir(controlledRepository, { mode: 0o700 });
      await mkdir(receiptDirectory, { mode: 0o700 });
      const written = writePrivateSpacetimePublishSuccessReceipt({
        directory: receiptDirectory,
        repositoryRoot: controlledRepository,
        artifactDigest,
        v12TableSchemaDigest,
        workerForwardRepair: WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
        postPublicationCheckpoint:
          WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
        now: recordedAt,
      });
      expect(written.artifactDigest).toBe(artifactDigest);
      expect(written.v12TableSchemaDigest).toBe(v12TableSchemaDigest);
      expect((await stat(receiptDirectory)).mode & 0o777).toBe(0o700);
      const receiptPath = join(
        receiptDirectory,
        `spacetime-publish-success-${artifactDigest}.json`,
      );
      expect((await stat(receiptPath)).mode & 0o777).toBe(0o600);
      const body = await readFile(receiptPath, 'utf8');
      expect(body).toContain('"deleteData": "never"');
      expect(body).toContain('"postVerification": "passed"');
      expect(body).not.toMatch(
        /"(?:fid|workerId|assignmentId|siteId|token|proof|identity)"\s*:/i,
      );
      expect(readPrivateSpacetimePublishSuccessReceipt({
        directory: receiptDirectory,
        repositoryRoot: controlledRepository,
        artifactDigest,
        now: new Date(recordedAt.getTime() + 60_000),
      })).toMatchObject({
        artifactDigest,
        v12TableSchemaDigest,
        postPublicationCheckpoint:
          WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
      });
      expect(() => readPrivateSpacetimePublishSuccessReceipt({
        directory: receiptDirectory,
        repositoryRoot: controlledRepository,
        artifactDigest,
        now: new Date(recordedAt.getTime() + 25 * 60 * 60 * 1_000),
      })).toThrow(/RECEIPT_EXPIRED/);
      expect(() => writePrivateSpacetimePublishSuccessReceipt({
        directory: receiptDirectory,
        repositoryRoot: controlledRepository,
        artifactDigest,
        v12TableSchemaDigest: 'c'.repeat(64),
        workerForwardRepair: WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
        postPublicationCheckpoint:
          WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
        now: new Date(recordedAt.getTime() + 60_000),
      })).toThrow(/EXISTING_MISMATCH/);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('requires exact canonical founded-state expectations for a live republish', () => {
    const expectations = readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '3',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    });
    expect(expectations).toEqual({
      expectedEnabledAllowedFidCount: 3,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    });
    expect(Object.isFrozen(expectations)).toBe(true);
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '0',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toEqual({
      expectedEnabledAllowedFidCount: 0,
      expectedFounderCount: 4,
      expectedPlayerCount: 0,
      expectedTermsAcceptanceCount: 0,
    });
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '2',
    })).toEqual({
      expectedEnabledAllowedFidCount: 4,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 2,
    });
    expect(readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '99',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '100',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '100',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '300',
    })).toEqual({
      expectedEnabledAllowedFidCount: 99,
      expectedFounderCount: 100,
      expectedPlayerCount: 100,
      expectedTermsAcceptanceCount: 300,
    });

    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '0',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_FOUNDER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_ENABLED_ALLOWED_FID_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '04',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_PLAYER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '0',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '01',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '0',
    })).toThrow(/EXPECTED_PLAYER_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '4',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '01',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '3',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '3',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '4',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/expectations were invalid/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '3',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '3',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '7',
    })).toThrow(/expectations were invalid/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '100',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '100',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '100',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '601',
    })).toThrow(/EXPECTED_TERMS_ACCEPTANCE_COUNT.*canonical integer/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '5',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/expectations were invalid/i);
    expect(() => readFoundedPublishExpectations({
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: '04',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: '4',
      WARPKEEP_EXPECTED_PLAYER_COUNT: '1',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: '1',
    })).toThrow(/EXPECTED_ENABLED_ALLOWED_FID_COUNT.*canonical integer/i);
  });

  it('pins the exact CLI build and canonical existing database identity', () => {
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.1; Commit: 052c83fe984a4c4eb7bb4f9afa5c6b1903891d87',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).not.toThrow();
    expect(() => verifyPinnedCliAttestation(
      'spacetimedb tool version 2.6.2; Commit: other',
      '4d76214ab1ba1462bd1500739641ec1c8322f99529d899c28612bfa665ccdfc6',
      'darwin',
      'arm64',
    )).toThrow(/exact reviewed/i);
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep   | c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).not.toThrow();
    expect(() => verifyCanonicalDatabaseList(
      'warpkeep   | a2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e\n',
    )).toThrow(/identity/i);
  });

  it('runs the exact founded protocol-v3 aggregate as the fresh pre-publication hard stop', () => {
    const calls: unknown[][] = [];
    const invariantFields = [
      'orphanedPlayerRowsV2',
      'orphanedOwnershipRowsV2',
      'orphanedCastleClaims',
      'orphanedCastles',
      'orphanedRealmProfiles',
      'orphanedMarkAccounts',
      'orphanedBurnCredits',
      'orphanedTermsAcceptances',
      'founderStateGaps',
      'markAccountInvariantViolations',
      'publicMarkProjectionViolations',
      'duplicateBurnReferences',
      'burnAccountReconciliationViolations',
      'ambiguousActiveWalletAddresses',
      'staticWorldDriftViolations',
      'termsAcceptanceInvariantViolations',
    ];
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
      status: 0,
      signal: null,
      stdout: JSON.stringify({
        worldTiles: '1261',
        occupiedWorldTiles: '4',
        worldTileMeta: '1261',
        realms: '1',
        castleSlots: '100',
        castleSlotClaims: '4',
        legacyPlayers: '0',
        playersV2: '1',
        playerOwnershipsV2: '1',
        castles: '4',
        realmProfiles: '4',
        markAccounts: '4',
        snapBurnCredits: '0',
        walletAttributions: '0',
        walletAttributionSnapshots: '0',
        scanCursors: '0',
        scanBatches: '0',
        alphaTermsAcceptances: '1',
        allowedFids: '4',
        enabledAllowedFids: '4',
        auditEntries: '7',
        ...Object.fromEntries(invariantFields.map(field => [field, '0'])),
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001',
      }),
      stderr: '',
      };
    };
    const testSecret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      } as never,
      fakeSpawnSync,
    )).toThrow(/expectations are required/i);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
    )).not.toThrow();
    expect(calls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-alpha-v3',
      '--json',
    ]);
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.env).toMatchObject({
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
    });
    expect(options.input).toBe(testSecret);
    expect(Object.keys(options.env ?? {}).sort()).toEqual([
      'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
      'WARPKEEP_AUTH_BRIDGE_URL',
      'WARPKEEP_SPACETIMEDB_DATABASE',
      'WARPKEEP_SPACETIMEDB_URI',
    ]);
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(testSecret);
    expect(JSON.stringify(options.env)).not.toContain(testSecret);

    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 5,
        expectedFounderCount: 5,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
    )).toThrow(/did not match the required rollout stage/i);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
        extra: true,
      } as never,
      fakeSpawnSync,
    )).toThrow(/expectations are required/i);
    expect(() => verifyFreshFoundedProtocolV3Aggregate(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      fakeSpawnSync,
      GENESIS_WORLD_PUBLISH_STAGE.EXPANDED,
    )).toThrow(/did not match the required rollout stage/i);

    const postPublishFailure = () => verifyPostPublishFoundedProtocolV3Aggregate(
      'TEST_ONLY_HERMES_SECRET_'.repeat(2),
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postPublishFailure).toThrow(/fresh read-only inspection/i);
    expect(postPublishFailure).not.toThrow(/no publish was attempted/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('runs an exact counts-only resource procedure-v4 checkpoint only for post-publish pre-backfill state', () => {
    const calls: unknown[][] = [];
    const aggregate = {
      allowedFids: '4',
      castles: '4',
      markAccounts: '4',
      resourceAccounts: '0',
      missingResourceAccounts: '4',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const testSecret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      4,
      fakeSpawnSync,
    )).not.toThrow();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-alpha-v4',
      '--json',
    ]);
    const options = calls[0]?.[2] as {
      env?: Record<string, string>;
      input?: string;
      timeout?: number;
      maxBuffer?: number;
      killSignal?: string;
    };
    expect(options).toMatchObject({
      input: testSecret,
      timeout: 30_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(testSecret);
    expect(JSON.stringify(options.env)).not.toContain(testSecret);

    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      5,
      fakeSpawnSync,
    )).toThrow(/pre-backfill state/i);
    expect(() => verifyFreshResourceProtocolV4PrebackfillAggregate(
      testSecret,
      0,
      fakeSpawnSync,
    )).toThrow(/founder count was invalid/i);

    const readyAggregate = {
      ...aggregate,
      resourceAccounts: '4',
      missingResourceAccounts: '0',
    };
    const readySpawn = vi.fn(() => ({
      status: 0,
      signal: null,
      stdout: JSON.stringify(readyAggregate),
      stderr: '',
    }));
    expect(() => verifyFreshResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      readySpawn as never,
    )).not.toThrow();
    expect(readySpawn).toHaveBeenCalledOnce();
    expect(() => verifyFreshResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      fakeSpawnSync,
    )).toThrow(/post-backfill ready state/i);

    const postPublishFailure = () => verifyPostPublishResourceProtocolV4PrebackfillAggregate(
      testSecret,
      4,
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postPublishFailure).toThrow(/indeterminate.*fresh read-only inspection/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
    expect(postPublishFailure).not.toThrow(/no publish was attempted/i);
    const postReadyFailure = () => verifyPostPublishResourceProtocolV4ReadyAggregate(
      testSecret,
      4,
      (() => ({ status: 1, signal: null, stdout: '', stderr: '' })) as never,
    );
    expect(postReadyFailure).toThrow(/ready.*indeterminate.*fresh read-only inspection/i);
    expect(postReadyFailure).not.toThrow(/retry/i);

    const orderedFailureCalls: unknown[][] = [];
    const orderedFailureSpawn = (...args: unknown[]) => {
      orderedFailureCalls.push(args);
      return {
        status: 1,
        signal: null,
        stdout: '',
        stderr: '',
      };
    };
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      orderedFailureSpawn as never,
    )).toThrow(/combined protocol-v3\/v4\/v8\/v10\/v12 checkpoint is indeterminate/i);
    expect(orderedFailureCalls).toHaveLength(1);
    expect(orderedFailureCalls[0]?.[1]).toEqual([
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
      'scripts/hermes-admin.ts',
      'inspect-publish-post-v12',
      '--json',
    ]);
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      'unknown',
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      orderedFailureSpawn as never,
    )).toThrow(/rollout stage was invalid/i);
    expect(() => verifyPostPublishResourcePublicationCheckpoints(
      testSecret,
      {
        expectedEnabledAllowedFidCount: 4,
        expectedFounderCount: 4,
        expectedPlayerCount: 1,
        expectedTermsAcceptanceCount: 1,
      },
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      'staged',
      orderedFailureSpawn as never,
    )).toThrow(/Worker rollout stage was invalid/i);
  });

  it('uses exactly one bounded token-bearing child before and after publish for every aggregate checkpoint', () => {
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    const expectations = {
      expectedEnabledAllowedFidCount: 3,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    };
    const preEnvelope = {
      protocolV3: {
        ...publishProtocolV3Status(),
        enabledAllowedFids: '3',
      },
      resourceV4: publishResourceV4Status(),
    };
    const postEnvelope = {
      ...preEnvelope,
      alphaV8: alphaStatusV8(),
      alphaV10: alphaStatusV10(),
      workerV12: alphaStatusV12(),
    };
    const calls: unknown[][] = [];
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      const childArguments = args[1] as string[];
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(childArguments.includes('inspect-publish-pre-v12')
          ? preEnvelope
          : postEnvelope),
        stderr: '',
      };
    };

    expect(verifyFreshPublishPreV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      fakeSpawnSync as never,
    )).toEqual(preEnvelope);
    expect(verifyPostPublishCombinedV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      fakeSpawnSync as never,
    )).toEqual(postEnvelope);

    expect(calls).toHaveLength(2);
    expect(calls[0]?.[0]).toBe(process.execPath);
    expect(calls[0]?.[1]).toEqual(publishPreV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    expect(calls[1]?.[0]).toBe(process.execPath);
    expect(calls[1]?.[1]).toEqual(publishPostV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const preOptions = calls[0]?.[2] as {
      env?: Record<string, string>;
      input?: string;
      timeout?: number;
      maxBuffer?: number;
      killSignal?: string;
    };
    const postOptions = calls[1]?.[2] as typeof preOptions;
    expect(preOptions).toMatchObject({
      input: secret,
      timeout: 90_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    expect(postOptions).toMatchObject({
      input: secret,
      timeout: 150_000,
      maxBuffer: 1_000_000,
      killSignal: 'SIGKILL',
    });
    for (const [index, options] of [preOptions, postOptions].entries()) {
      expect(options.env).toEqual({
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      });
      expect(JSON.stringify(calls[index]?.[1])).not.toContain(secret);
      expect(JSON.stringify(options.env)).not.toContain(secret);
    }
  });

  it('requires the exact selected v12 aggregate before a code-only republish', () => {
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    const expectations = {
      expectedEnabledAllowedFidCount: 4,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
    };
    const envelope = {
      protocolV3: publishProtocolV3Status(),
      resourceV4: publishResourceV4Status('ready'),
      alphaV8: alphaStatusV8(),
      alphaV10: alphaStatusV10(),
      workerV12: alphaStatusV12(),
    };
    const spawn = vi.fn((..._args: unknown[]) => ({
      status: 0,
      signal: null,
      stdout: JSON.stringify(envelope),
      stderr: '',
    }));
    expect(verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      spawn as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
    )).toEqual(envelope);
    expect(spawn).toHaveBeenCalledOnce();
    expect(spawn.mock.calls[0]?.[1]).toEqual(publishPostV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));

    const activeEnvelope = {
      ...envelope,
      workerV12: activeAlphaStatusV12(),
    };
    expect(verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(activeEnvelope),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
    )).toEqual(activeEnvelope);

    const repairablePredecessorEnvelope = {
      ...envelope,
      workerV12: repairableActiveAlphaStatusV12('active-predecessor'),
    };
    expect(verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(repairablePredecessorEnvelope),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toEqual(repairablePredecessorEnvelope);

    const repairableCandidateEnvelope = {
      ...envelope,
      workerV12: repairableActiveAlphaStatusV12('candidate-pending'),
    };
    expect(verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(repairableCandidateEnvelope),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING,
    )).toEqual(repairableCandidateEnvelope);
    expect(verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(activeEnvelope),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING,
    )).toEqual(activeEnvelope);

    const staged = {
      ...envelope,
      workerV12: alphaStatusV12({
        mode: 'staged',
        systemRows: '1',
        systemConfigValid: true,
        legacyDrainRequired: false,
      }),
    };
    expect(() => verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(staged),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
    )).toThrow(/no publish was attempted.*selected rollout stage/i);

    const inconsistentActive = {
      ...activeEnvelope,
      workerV12: activeAlphaStatusV12({ schedules: '3' }),
    };
    expect(() => verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(inconsistentActive),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
    )).toThrow(/no publish was attempted.*selected rollout stage/i);

    const wrongRepairCheckpoint = {
      ...repairablePredecessorEnvelope,
      workerV12: repairableActiveAlphaStatusV12(
        'active-predecessor',
        { occupationSiteMismatches: '0' },
      ),
    };
    expect(() => verifyFreshPublishExactV12Aggregate(
      secret,
      expectations,
      RESOURCE_PUBLISH_ROLLOUT_STAGE.READY,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      (() => ({
        status: 0,
        signal: null,
        stdout: JSON.stringify(wrongRepairCheckpoint),
        stderr: '',
      })) as never,
      GENESIS_WORLD_PUBLISH_STAGE.PRE_EXPANSION,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toThrow(/no publish was attempted.*selected rollout stage/i);
  });

  it('rejects malformed or identity-bearing combined publication envelopes', () => {
    const preEnvelope = {
      protocolV3: publishProtocolV3Status(),
      resourceV4: publishResourceV4Status(),
    };
    const postEnvelope = {
      ...preEnvelope,
      alphaV8: alphaStatusV8(),
      alphaV10: alphaStatusV10(),
      workerV12: alphaStatusV12(),
    };
    expect(verifyPrivacySafePublishPreV12Output(JSON.stringify(preEnvelope)))
      .toEqual(preEnvelope);
    expect(verifyPrivacySafePublishPostV12Output(JSON.stringify(postEnvelope)))
      .toEqual(postEnvelope);
    for (const invalid of [
      '',
      '[]',
      JSON.stringify({ ...preEnvelope, token: 'private' }),
      JSON.stringify({ protocolV3: preEnvelope.protocolV3 }),
      JSON.stringify({ ...preEnvelope, resourceV4: [] }),
    ]) {
      expect(() => verifyPrivacySafePublishPreV12Output(invalid)).toThrow();
    }
    for (const invalid of [
      JSON.stringify({ ...postEnvelope, fid: '539854' }),
      JSON.stringify({ ...postEnvelope, alphaV10: null }),
      JSON.stringify({
        ...postEnvelope,
        workerV12: { ...postEnvelope.workerV12, token: 'private' },
      }),
    ]) {
      const spawn = vi.fn(() => ({
        status: 0,
        signal: null,
        stdout: invalid,
        stderr: '',
      }));
      expect(() => verifyPostPublishCombinedV12Aggregate(
        'TEST_ONLY_HERMES_SECRET_'.repeat(2),
        {
          expectedEnabledAllowedFidCount: 4,
          expectedFounderCount: 4,
          expectedPlayerCount: 1,
          expectedTermsAcceptanceCount: 1,
        },
        RESOURCE_PUBLISH_ROLLOUT_STAGE.PREBACKFILL,
        WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
        spawn as never,
      )).toThrow(/combined protocol-v3\/v4\/v8\/v10\/v12 checkpoint is indeterminate/i);
      expect(spawn).toHaveBeenCalledOnce();
    }
  });

  it('requires one closed, privacy-safe v8 checkpoint after publication and before seeding', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV8();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV8Aggregate(secret, fakeSpawnSync)).toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[0]).toBe(process.execPath);
    expect(calls[0]?.[1]).toEqual(alphaV8AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV8Aggregate(secret, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, goldSites: 0 },
      { ...aggregate, goldSites: '00' },
      { ...aggregate, goldSites: '18446744073709551616' },
      { ...aggregate, schemaProtocolVersion: 7 },
      { ...aggregate, canonicalGoldSiteCatalogDigest: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV8Output(JSON.stringify(invalid)))
        .toThrow();
    }

    const postPublishFailure = () => verifyPostPublishAlphaStatusV8Aggregate(
      secret,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v8 inspection.*before any component seed/i);
    expect(postPublishFailure).not.toThrow(/private/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('requires one closed, privacy-safe v10 checkpoint after publication', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV10();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV10Aggregate(secret, fakeSpawnSync)).toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(alphaV10AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV10Aggregate(secret, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, waterCells: 0 },
      { ...aggregate, waterCells: '00' },
      { ...aggregate, stoneSites: '18446744073709551616' },
      { ...aggregate, schemaProtocolVersion: 9 },
      { ...aggregate, waterActivated: 'false' },
      { ...aggregate, canonicalWaterLayoutDigest: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV10Output(JSON.stringify(invalid)))
        .toThrow();
    }

    const postPublishFailure = () => verifyPostPublishAlphaStatusV10Aggregate(
      secret,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v10 inspection.*Water or Stone activation/i);
    expect(postPublishFailure).not.toThrow(/private/i);
    expect(postPublishFailure).not.toThrow(/retry/i);
  });

  it('requires the exact empty and inert Worker v12 checkpoint after publication', () => {
    const calls: unknown[][] = [];
    const aggregate = alphaStatusV12();
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(aggregate),
        stderr: '',
      };
    };
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    expect(verifyFreshAlphaStatusV12Aggregate(secret, 4, fakeSpawnSync))
      .toEqual(aggregate);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual(alphaV12AggregateChildArguments(
      resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
    ));
    const options = calls[0]?.[2] as { env?: Record<string, string>; input?: string };
    expect(options.input).toBe(secret);
    expect(options.env).toEqual({
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
      WARPKEEP_AUTH_BRIDGE_URL: ISSUER,
      WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
    });
    expect(JSON.stringify(calls[0]?.[1])).not.toContain(secret);
    expect(JSON.stringify(options.env)).not.toContain(secret);
    expect(() => verifyPostPublishAlphaStatusV12Aggregate(secret, 4, fakeSpawnSync))
      .not.toThrow();

    for (const invalid of [
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, assignments: 0 },
      { ...aggregate, assignments: '00' },
      { ...aggregate, assignments: '18446744073709551616' },
      { ...aggregate, systemConfigValid: 'false' },
      { ...aggregate, mode: 'disabled' },
      { ...aggregate, rosterDigestExpected: 'not-a-digest' },
    ]) {
      expect(() => verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(invalid)))
        .toThrow();
    }
    for (const nonempty of [
      { ...aggregate, systemRows: '1' },
      { ...aggregate, mode: 'staged' },
      { ...aggregate, systemConfigValid: true },
      { ...aggregate, legacyDrainRequired: false },
      { ...aggregate, expectedCountsMatch: true },
      { ...aggregate, rosterDigestMatches: true },
      { ...aggregate, castlesMissingWorkers: '3' },
      { ...aggregate, actualWorkerCount: '1' },
      { ...aggregate, assignments: '1' },
      { ...aggregate, occupations: '1' },
      { ...aggregate, schedules: '1' },
      { ...aggregate, idempotencyReceipts: '1' },
      { ...aggregate, rosterDigest: '0123456789abcdef' },
    ]) {
      expect(() => verifyEmptyAlphaStatusV12(
        verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(nonempty)),
        4,
      )).toThrow(/empty, inert Worker suffix/i);
    }
    expect(() => verifyEmptyAlphaStatusV12(
      verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(aggregate)),
      0,
    )).toThrow(/expected founder count/i);

    const postPublishFailure = () => verifyPostPublishAlphaStatusV12Aggregate(
      secret,
      4,
      (() => ({ status: 1, signal: null, stdout: 'private', stderr: 'private' })) as never,
    );
    expect(postPublishFailure).toThrow(/read-only v12 inspection.*before any merge/i);
    expect(postPublishFailure).not.toThrow(/private|retry/i);
  });

  it('accepts only a coherent privacy-safe active Worker v12 checkpoint', () => {
    const aggregate = verifyPrivacySafeAlphaStatusV12Output(
      JSON.stringify(activeAlphaStatusV12()),
    );
    const repairablePredecessor = verifyPrivacySafeAlphaStatusV12Output(
      JSON.stringify(repairableActiveAlphaStatusV12('active-predecessor')),
    );
    const repairableCandidate = verifyPrivacySafeAlphaStatusV12Output(
      JSON.stringify(repairableActiveAlphaStatusV12('candidate-pending')),
    );
    expect(verifyActiveAlphaStatusV12(aggregate, 4)).toEqual(aggregate);
    expect(verifyAlphaStatusV12ForStage(
      aggregate,
      4,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
    )).toEqual(aggregate);
    expect(verifyAlphaStatusV12ForStage(
      verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(alphaStatusV12())),
      4,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
    )).toEqual(alphaStatusV12());
    expect(() => verifyAlphaStatusV12ForStage(
      aggregate,
      4,
      'draining',
    )).toThrow(/rollout stage was invalid/i);
    expect(verifyReturnNodeReuseRepairAlphaStatusV12(
      repairablePredecessor,
      4,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toEqual(repairablePredecessor);
    expect(verifyReturnNodeReuseRepairAlphaStatusV12(
      repairableCandidate,
      4,
      WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
    )).toEqual(repairableCandidate);
    expect(verifyReturnNodeReuseRepairAlphaStatusV12(
      aggregate,
      4,
      WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_EXISTING,
    )).toEqual(aggregate);
    expect(verifyAlphaStatusV12ForStage(
      repairablePredecessor,
      4,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toEqual(repairablePredecessor);

    for (const invalid of [
      { schedules: '4' },
      { assignmentsWithoutSingleSchedule: '0' },
      { assignmentsWithoutSingleSchedule: '2' },
      { occupationSiteMismatches: '0' },
      { orphanSchedules: '1' },
      { invalidSchedules: '1' },
      { legacySchedules: '1' },
    ]) {
      const status = verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(
        repairableActiveAlphaStatusV12('active-predecessor', invalid),
      ));
      expect(
        () => verifyReturnNodeReuseRepairAlphaStatusV12(
          status,
          4,
          WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
        ),
        JSON.stringify(invalid),
      ).toThrow(/exact bounded return-node-reuse repair checkpoint/i);
    }
    expect(() => verifyReturnNodeReuseRepairAlphaStatusV12(
      repairableCandidate,
      4,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toThrow(/exact bounded return-node-reuse repair checkpoint/i);
    expect(() => verifyReturnNodeReuseRepairAlphaStatusV12(
      repairablePredecessor,
      4,
      WORKER_FORWARD_REPAIR_CHECKPOINT.CANDIDATE_PENDING,
    )).toThrow(/exact bounded return-node-reuse repair checkpoint/i);
    expect(() => verifyAlphaStatusV12ForStage(
      repairablePredecessor,
      4,
      WORKER_PUBLISH_ROLLOUT_STAGE.EMPTY,
      WORKER_FORWARD_REPAIR.RETURN_NODE_REUSE_V1,
      WORKER_FORWARD_REPAIR_CHECKPOINT.ACTIVE_PREDECESSOR,
    )).toThrow(/requires the active Worker rollout stage/i);
    expect(() => verifyAlphaStatusV12ForStage(
      aggregate,
      4,
      WORKER_PUBLISH_ROLLOUT_STAGE.ACTIVE,
      'unknown',
    )).toThrow(/forward-repair selection was invalid/i);

    for (const invalid of [
      { mode: 'staged' },
      { systemRows: '0' },
      { systemConfigValid: false },
      { legacyDrainRequired: true },
      { expectedCastleCount: '3' },
      { expectedWorkerCount: '15' },
      { actualWorkerCount: '15' },
      { expectedCountsMatch: false },
      { rosterDigestMatches: false },
      { rosterDigest: '' },
      { rosterDigestExpected: 'fedcba9876543210' },
      { idleWorkers: '11' },
      { assignments: '3' },
      { occupations: '4' },
      { schedules: '3' },
      { castlesMissingWorkers: '1' },
      { invalidWorkerStates: '1' },
      { orphanAssignments: '1' },
      { invalidIdempotencyReceipts: '1' },
      { idempotencyOverflowFids: '1' },
      { legacyExpeditions: '1' },
      { legacyOccupations: '1' },
      { legacySchedules: '1' },
    ]) {
      const status = verifyPrivacySafeAlphaStatusV12Output(JSON.stringify(
        activeAlphaStatusV12(invalid),
      ));
      expect(
        () => verifyActiveAlphaStatusV12(status, 4),
        JSON.stringify(invalid),
      ).toThrow(/healthy active Worker graph/i);
    }
    expect(() => verifyActiveAlphaStatusV12(aggregate, 0))
      .toThrow(/expected founder count/i);
  });

  it('escalates a hard deadline and reports unproven containment when close never arrives', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & { kill: ReturnType<typeof vi.fn> };
    child.kill = vi.fn();
    await withTestProvenArtifact(async receipt => {
      const publish = publishModule(
        'spacetime',
        CANONICAL_DATABASE_IDENTITY,
        receipt,
        (() => child) as never,
      );
      const rejection = publish.then(
        () => undefined,
        error => error,
      );

      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(120_000);
      expect(child.kill).toHaveBeenCalledWith('SIGTERM');
      child.emit('error', new Error('test-only signal delivery failure'));
      await vi.advanceTimersByTimeAsync(5_000);
      expect(child.kill).toHaveBeenCalledWith('SIGKILL');
      child.emit('error', new Error('test-only forced-kill delivery failure'));
      await vi.advanceTimersByTimeAsync(5_000);
      await expect(rejection).resolves.toMatchObject({
        code: 'SPACETIMEDB_PUBLISH_PROCESS_GROUP_UNCONTAINED',
        nonReconcilable: true,
      });
    });
  });

  it('contains loopback-server spawn errors and awaits close after forced cleanup', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);
    containServerProcessErrors(child);
    expect(() => child.emit('error', new Error('test-only-startup-failure'))).not.toThrow();

    let completed = false;
    const cleanup = stopServer(child, 100, 100).then(() => { completed = true; });
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(100);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    expect(completed).toBe(false);
    child.emit('close', null, 'SIGKILL');
    await cleanup;
    expect(completed).toBe(true);
  });

  it('fails closed when a killed loopback child never reports close', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);

    const cleanup = stopServer(child, 100, 100);
    const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(child.listenerCount('close')).toBe(0);
  });

  it('removes private migration data when loopback cleanup reaches its hard deadline', async () => {
    vi.useFakeTimers();
    const dataDirectory = await mkdtemp(join(tmpdir(), 'warpkeep-cleanup-test-'));
    await writeFile(join(dataDirectory, 'cli.toml'), 'test-only-private-credential');
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);

    try {
      const cleanup = cleanupMigrationProofResources(child, dataDirectory, 100, 100);
      const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
      await vi.advanceTimersByTimeAsync(200);
      await rejection;
      await expect(stat(dataDirectory)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(dataDirectory, { recursive: true, force: true });
    }
  });

  it('preserves the live-server failure when directory removal also fails', async () => {
    vi.useFakeTimers();
    const child = new EventEmitter() as EventEmitter & {
      exitCode: number | null;
      signalCode: NodeJS.Signals | null;
      kill: ReturnType<typeof vi.fn>;
    };
    child.exitCode = null;
    child.signalCode = null;
    child.kill = vi.fn(() => true);
    const removeDirectory = vi.fn(async () => {
      throw new Error('test-only-removal-failure');
    });

    const cleanup = cleanupMigrationProofResources(
      child,
      '/test-only-private-migration-directory',
      100,
      100,
      removeDirectory,
    );
    const rejection = expect(cleanup).rejects.toThrow(/cleanup deadline/i);
    await vi.advanceTimersByTimeAsync(200);
    await rejection;
    expect(removeDirectory).toHaveBeenCalledTimes(1);
  });

  it('runs one synchronous cleanup and exits with the received signal status', () => {
    const processTarget = new EventEmitter() as EventEmitter & {
      exit: ReturnType<typeof vi.fn>;
    };
    processTarget.exit = vi.fn();
    const cleanup = vi.fn();
    const remove = installMigrationProofSignalCleanup(cleanup, processTarget);

    processTarget.emit('SIGINT');
    processTarget.emit('SIGTERM');

    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledWith(130);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
    expect(() => remove()).not.toThrow();
  });

  it('fails closed without exposing signal-cleanup errors', () => {
    const processTarget = new EventEmitter() as EventEmitter & {
      exit: ReturnType<typeof vi.fn>;
    };
    processTarget.exit = vi.fn();
    const cleanup = vi.fn(() => {
      throw new Error('test-only-private-cleanup-detail');
    });
    installMigrationProofSignalCleanup(cleanup, processTarget);

    expect(() => processTarget.emit('SIGTERM')).not.toThrow();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(processTarget.exit).toHaveBeenCalledWith(1);
    expect(processTarget.listenerCount('SIGINT')).toBe(0);
    expect(processTarget.listenerCount('SIGTERM')).toBe(0);
  });

  it('returns a failing status when dry-run issuer configuration is absent', () => {
    const result = spawnSync(process.execPath, [
      'scripts/publish-spacetime-dev.mjs',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: {},
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WARPKEEP_OIDC_ISSUER is required');
  });

  it('requires the founded-state expectation contract even for a dry run', () => {
    const result = spawnSync(process.execPath, [
      'scripts/publish-spacetime-dev.mjs',
      '--dry-run',
      '--resource-rollout-stage=prebackfill',
      '--genesis-world-stage=pre-expansion',
      '--worker-rollout-stage=empty',
      '--worker-forward-repair=none',
    ], {
      cwd: repositoryRoot,
      encoding: 'utf8',
      env: { WARPKEEP_OIDC_ISSUER: ISSUER },
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('WARPKEEP_EXPECTED_FOUNDER_COUNT');
  });
});

describe('bounded auth-v2 production readiness verification', () => {
  afterEach(() => vi.restoreAllMocks());

  it('preserves the explicit legacy-compatible mode for the currently contained service', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = legacyBridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, { fetchImpl })).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(8);
    expect(log).toHaveBeenCalledWith(
      'bridge: legacy-compatible health, discovery, JWKS, and strict CORS verified (auth-v2 gate not requested)',
    );
  });

  it('attests contained auth-v2 using only bounded non-mutating requests', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = authV2BridgeFetch();

    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2: true,
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(35);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(url.origin).toBe(ISSUER);
      expect(init?.method ?? 'GET').toMatch(/^(?:GET|OPTIONS|POST)$/);
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      if (
        AUTH_V2_CREDENTIAL_PATHS.has(url.pathname)
        || url.pathname === AUTH_V2_QUICK_AUTH_PATH
        || AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
        || url.pathname === '/v1/farcaster/challenge'
        || url.pathname === '/v1/farcaster/exchange'
      ) {
        expect(headers.get('access-control-request-method')).toBe('POST');
        expect(headers.get('access-control-request-headers')).toBe(
          url.pathname === AUTH_V2_QUICK_AUTH_PATH
            || (
              AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
              && headers.get('access-control-request-headers')
                ?.includes('authorization')
            )
            ? AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
              ? 'authorization, content-type, x-warpkeep-expected-fid'
              : 'authorization, content-type'
            : AUTH_V2_ACCESS_REQUEST_PATHS.has(url.pathname)
              ? 'content-type, x-warpkeep-expected-fid'
              : 'content-type',
        );
        expect([FRONTEND, 'https://not-warpkeep.invalid']).toContain(headers.get('origin'));
      }
      if (AUTH_V2_SERVER_ONLY_ADMIN_PATHS.has(url.pathname)) {
        expect([FRONTEND, 'https://not-warpkeep.invalid']).toContain(headers.get('origin'));
        if (init?.method === 'OPTIONS') {
          expect(headers.get('access-control-request-method')).toBe('POST');
          expect(headers.get('access-control-request-headers')).toBe('authorization, content-type');
        } else {
          expect(headers.has('access-control-request-method')).toBe(false);
          expect(headers.has('access-control-request-headers')).toBe(false);
        }
      }
    }
    for (const pathname of AUTH_V2_SERVER_ONLY_ADMIN_PATHS) {
      const calls = fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);
      expect(calls).toHaveLength(4);
      expect(calls.map(([, init]) => init?.method)).toEqual(['GET', 'OPTIONS', 'OPTIONS', 'POST']);
    }
    for (const pathname of AUTH_V2_ACCESS_REQUEST_PATHS) {
      const calls = fetchImpl.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === pathname,
      );
      expect(calls).toHaveLength(4);
      expect(calls.map(([, init]) => init?.method)).toEqual([
        'OPTIONS',
        'OPTIONS',
        'OPTIONS',
        'OPTIONS',
      ]);
      expect(calls.map(([, init]) => new Headers(init?.headers).get('origin'))).toEqual([
        FRONTEND,
        'https://not-warpkeep.invalid',
        FRONTEND,
        'https://not-warpkeep.invalid',
      ]);
      expect(calls.map(([, init]) => (
        new Headers(init?.headers).get('access-control-request-headers')
      ))).toEqual([
        'content-type, x-warpkeep-expected-fid',
        'content-type, x-warpkeep-expected-fid',
        'authorization, content-type, x-warpkeep-expected-fid',
        'authorization, content-type, x-warpkeep-expected-fid',
      ]);
    }
    expect(log).toHaveBeenCalledWith(
      'bridge: contained auth-v2 health, discovery, JWKS, retired v1, security headers, and credentialed plus bearer access CORS verified',
    );
  });

  it('attests enabled auth-v2 without creating challenge or session state', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const fetchImpl = authV2BridgeFetch({ publicAuthEnabled: true });

    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2Enabled: true,
      fetchImpl,
    })).resolves.toBeUndefined();

    expect(fetchImpl).toHaveBeenCalledTimes(35);
    for (const [input, init] of fetchImpl.mock.calls) {
      const url = new URL(String(input));
      const headers = new Headers(init?.headers);
      expect(url.origin).toBe(ISSUER);
      expect(init?.method ?? 'GET').toMatch(/^(?:GET|OPTIONS|POST)$/);
      expect(init?.body).toBeUndefined();
      expect(init?.redirect).toBe('manual');
      expect(init?.cache).toBe('no-store');
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(headers.has('authorization')).toBe(false);
      expect(headers.has('cookie')).toBe(false);
      expect(headers.has('x-fid')).toBe(false);
    }
    for (const pathname of AUTH_V2_SERVER_ONLY_ADMIN_PATHS) {
      const calls = fetchImpl.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);
      expect(calls).toHaveLength(4);
      expect(calls.map(([, init]) => init?.method)).toEqual(['GET', 'OPTIONS', 'OPTIONS', 'POST']);
    }
    for (const pathname of AUTH_V2_ACCESS_REQUEST_PATHS) {
      const calls = fetchImpl.mock.calls.filter(
        ([input]) => new URL(String(input)).pathname === pathname,
      );
      expect(calls).toHaveLength(4);
      expect(calls.map(([, init]) => (
        new Headers(init?.headers).get('access-control-request-headers')
      ))).toEqual([
        'content-type, x-warpkeep-expected-fid',
        'content-type, x-warpkeep-expected-fid',
        'authorization, content-type, x-warpkeep-expected-fid',
        'authorization, content-type, x-warpkeep-expected-fid',
      ]);
    }
    expect(log).toHaveBeenCalledWith(
      'bridge: enabled auth-v2 read-only health, discovery, JWKS, retired v1, security headers, and credentialed plus bearer access CORS verified',
    );
  });

  it.each([
    [
      'a disabled public-auth switch',
      { publicAuthEnabled: false },
      /enabled Warpkeep security profile/i,
    ],
    [
      'paused public routes behind an enabled health response',
      { publicAuthEnabled: true, publicRoutesPaused: true },
      /enabled preflight did not return an empty HTTP 204 response/i,
    ],
  ] as const)(
    'fails the enabled auth-v2 gate for %s',
    async (_label, options, expectedError) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch(options),
      })).rejects.toThrow(expectedError);
    },
  );

  it.each([...AUTH_V2_SERVER_ONLY_ADMIN_PATHS])(
    'fails closed when allowed-origin GET exposes CORS on %s',
    async (pathname) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch({
          publicAuthEnabled: true,
          adminCorsLeak: { pathname, method: 'GET', origin: FRONTEND },
        }),
      })).rejects.toThrow(/exposed browser CORS/i);
    },
  );

  it.each([...AUTH_V2_SERVER_ONLY_ADMIN_PATHS])(
    'fails closed when credential-free allowed-origin POST exposes CORS on %s',
    async (pathname) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch({
          publicAuthEnabled: true,
          adminCorsLeak: { pathname, method: 'POST', origin: FRONTEND },
        }),
      })).rejects.toThrow(/exposed browser CORS/i);
    },
  );

  it.each([
    ...[...AUTH_V2_SERVER_ONLY_ADMIN_PATHS].map(pathname => [pathname, FRONTEND] as const),
    ...[...AUTH_V2_SERVER_ONLY_ADMIN_PATHS].map(pathname => [pathname, 'https://not-warpkeep.invalid'] as const),
  ])(
    'fails closed when an admin preflight exposes CORS on %s to %s',
    async (pathname, origin) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2Enabled: true,
        fetchImpl: authV2BridgeFetch({
          publicAuthEnabled: true,
          adminCorsLeak: { pathname, method: 'OPTIONS', origin },
        }),
      })).rejects.toThrow(/exposed browser CORS/i);
    },
  );

  it('rejects simultaneous paused and enabled auth-v2 library modes', async () => {
    await expect(verifyBridge(FRONTEND, ISSUER, {
      requireAuthV2: true,
      requireAuthV2Enabled: true,
      fetchImpl: authV2BridgeFetch(),
    })).rejects.toThrow(/mutually exclusive/i);
  });

  it.each([
    [
      'a legacy health document',
      { health: { ok: true, service: 'warpkeep-auth-bridge' } },
      /contained Warpkeep security profile/i,
    ],
    [
      'an enabled public-auth switch',
      {
        health: {
          ok: true,
          service: 'warpkeep-auth-bridge',
          securityProfile: 'warpkeep-auth-v2',
          publicAuthEnabled: true,
        },
      },
      /contained Warpkeep security profile/i,
    ],
    [
      'incomplete v2 discovery claims',
      { discoveryClaims: AUTH_V2_CLAIMS.slice(0, -1) },
      /exact required profile and claims/i,
    ],
    [
      'a missing HSTS policy',
      { omitSecurityHeader: 'strict-transport-security' },
      /exact strict-transport-security security header/i,
    ],
    [
      'a non-retired v1 route',
      { legacyNotRetired: true },
      /retired bridge .* returned HTTP 204/i,
    ],
    [
      'non-credentialed v2 CORS',
      { omitCredentialedCors: true },
      /exact credentialed browser CORS/i,
    ],
    [
      'hostile-origin credentialed CORS',
      { exposeHostileCors: true },
      /exposed browser CORS to an untrusted origin/i,
    ],
    [
      'v2 routes that are not demonstrably paused',
      { publicRoutesNotPaused: true },
      /paused check returned HTTP 204/i,
    ],
  ] as const)(
    'fails the explicit auth-v2 gate for %s',
    async (_label, options, expectedError) => {
      vi.spyOn(console, 'log').mockImplementation(() => undefined);
      await expect(verifyBridge(FRONTEND, ISSUER, {
        requireAuthV2: true,
        fetchImpl: authV2BridgeFetch(options),
      })).rejects.toThrow(expectedError);
    },
  );
});

describe('bounded frontend root-asset verification', () => {
  it('fails closed on response headers that can break Mini App embedding', () => {
    expect(() => verifyFrontendEmbeddingHeaders(new Headers())).not.toThrow();
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'x-frame-options': 'SAMEORIGIN',
    }))).toThrow(/x-frame-options/i);
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'cross-origin-opener-policy': 'same-origin',
    }))).toThrow(/cross-origin-opener-policy/i);
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'cross-origin-embedder-policy': 'require-corp',
    }))).toThrow(/cross-origin-embedder-policy/i);
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'content-security-policy': "default-src 'self'; frame-ancestors https://farcaster.xyz",
    }))).toThrow(/frame-ancestors/i);
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'content-security-policy': "default-src 'self', frame-ancestors 'none'",
    }))).toThrow(/frame-ancestors/i);
    expect(() => verifyFrontendEmbeddingHeaders(new Headers({
      'content-security-policy': "default-src 'self'; frame-src https://farcaster.xyz",
    }))).not.toThrow();
  });

  it('rejects a document with more than the fixed unique root-asset count', () => {
    const tags = Array.from({ length: 17 }, (_, index) => (
      `<script type="module" src="/assets/root-${index}.js"></script>`
    )).join('');
    expect(() => rootAssetUrls(tags, FRONTEND)).toThrow(/too many root application assets/i);
  });

  it('verifies root assets sequentially under one cumulative byte budget', async () => {
    const assets = [
      new URL('/assets/root-a.js', FRONTEND),
      new URL('/assets/root-b.js', FRONTEND),
      new URL('/assets/root.css', FRONTEND),
    ];
    let active = 0;
    let maximumActive = 0;
    const result = await verifyRootAssets(assets, undefined, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>(resolvePromise => queueMicrotask(resolvePromise));
      active -= 1;
      return { byteLength: 1, shaMatches: false };
    });
    expect(result).toEqual({ totalBytes: 3, shaMatches: false });
    expect(maximumActive).toBe(1);

    const budgets: number[] = [];
    await expect(verifyRootAssets(assets, undefined, async (
      _asset: URL,
      _sha: string | undefined,
      maximumBytes: number,
    ) => {
      budgets.push(maximumBytes);
      return { byteLength: maximumBytes, shaMatches: false };
    })).rejects.toThrow(/cumulative byte limit/i);
    expect(budgets).toEqual([16_000_000, 8_000_000]);
  });
});

describe('protected aggregate child isolation', () => {
  const additiveV2Aggregate = Object.freeze({
    worldTiles: '61',
    legacyPlayers: '0',
    playersV2: '0',
    playerOwnershipsV2: '0',
    consistentPlayerPairsV2: '0',
    orphanedPlayerRowsV2: '0',
    orphanedOwnershipRowsV2: '0',
    castles: '0',
    allowedFids: '0',
    enabledAllowedFids: '0',
    auditEntries: '2',
    protocolVersion: 2,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
  });

  const v3InvariantFields = Object.freeze([
    'orphanedPlayerRowsV2',
    'orphanedOwnershipRowsV2',
    'orphanedCastleClaims',
    'orphanedCastles',
    'orphanedRealmProfiles',
    'orphanedMarkAccounts',
    'orphanedBurnCredits',
    'orphanedTermsAcceptances',
    'founderStateGaps',
    'markAccountInvariantViolations',
    'publicMarkProjectionViolations',
    'duplicateBurnReferences',
    'burnAccountReconciliationViolations',
    'ambiguousActiveWalletAddresses',
    'staticWorldDriftViolations',
    'termsAcceptanceInvariantViolations',
  ]);
  const additiveV3PreseedAggregate = Object.freeze({
    worldTiles: '61',
    occupiedWorldTiles: '0',
    worldTileMeta: '0',
    realms: '0',
    castleSlots: '0',
    castleSlotClaims: '0',
    legacyPlayers: '0',
    playersV2: '0',
    playerOwnershipsV2: '0',
    castles: '0',
    realmProfiles: '0',
    markAccounts: '0',
    snapBurnCredits: '0',
    walletAttributions: '0',
    walletAttributionSnapshots: '0',
    scanCursors: '0',
    scanBatches: '0',
    alphaTermsAcceptances: '0',
    allowedFids: '0',
    enabledAllowedFids: '0',
    auditEntries: '2',
    ...Object.fromEntries(v3InvariantFields.map(field => [field, '0'])),
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001',
  });
  const genesisV3SeededEmptyAggregate = Object.freeze({
    ...additiveV3PreseedAggregate,
    worldTiles: '1261',
    worldTileMeta: '1261',
    realms: '1',
    castleSlots: '100',
    auditEntries: '3',
  });
  const genesisV3FoundedAggregate = Object.freeze({
    ...genesisV3SeededEmptyAggregate,
    occupiedWorldTiles: '3',
    castleSlotClaims: '3',
    castles: '3',
    realmProfiles: '3',
    markAccounts: '3',
    allowedFids: '3',
    enabledAllowedFids: '3',
    auditEntries: '6',
  });
  const authenticatedGenesisV3FoundedAggregate = Object.freeze({
    ...genesisV3FoundedAggregate,
    playersV2: '1',
    playerOwnershipsV2: '1',
    alphaTermsAcceptances: '1',
  });
  const historicalAndCurrentEntryAgreementAggregate = Object.freeze({
    ...authenticatedGenesisV3FoundedAggregate,
    alphaTermsAcceptances: '2',
  });
  const completeEntryAgreementHistoryAggregate = Object.freeze({
    ...authenticatedGenesisV3FoundedAggregate,
    alphaTermsAcceptances: '6',
  });
  const genesisGenerationV3FoundedAggregate = Object.freeze({
    ...genesisV3FoundedAggregate,
    worldTiles: '10000',
    worldTileMeta: '10000',
  });
  const foundedAggregateWithRevokedAdmission = Object.freeze({
    ...genesisV3FoundedAggregate,
    enabledAllowedFids: '2',
  });

  it('accepts only exact legacy and additive-v2 aggregate objects', () => {
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
    }))).not.toThrow();
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(additiveV2Aggregate))).not.toThrow();
  });

  it('accepts exact protocol and world-generation rollout aggregate stages', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(additiveV3PreseedAggregate),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(foundedAggregateWithRevokedAdmission),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      0,
      0,
      2,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      1,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(historicalAndCurrentEntryAgreementAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisGenerationV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
      3,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it('accepts only the exact counts-only resource procedure-v4 pre-backfill aggregate', () => {
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '0',
      missingResourceAccounts: '3',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
      JSON.stringify(aggregate),
      3,
    )).not.toThrow();

    for (const value of [
      { ...aggregate, resourceAccounts: '1', missingResourceAccounts: '2' },
      { ...aggregate, orphanedResourceAccounts: '1' },
      { ...aggregate, resourceInvariantViolations: '1' },
      { ...aggregate, protocolVersion: 4 },
      { ...aggregate, resourcePolicyVersion: 'other' },
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, balance: '200' },
      { ...aggregate, resourceAccounts: 0 },
      { ...aggregate, resourceAccounts: '00' },
    ]) {
      expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
        JSON.stringify(value),
        3,
      )).toThrow();
    }

    const missing = { ...aggregate } as Record<string, unknown>;
    delete missing.missingResourceAccounts;
    expect(() => verifyExpectedAlphaV4ResourcePrebackfillAggregate(
      JSON.stringify(missing),
      3,
    )).toThrow(/unexpected fields/i);
  });

  it('accepts only the exact counts-only resource procedure-v4 post-backfill ready aggregate', () => {
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '3',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(aggregate),
      3,
    )).not.toThrow();

    for (const value of [
      { ...aggregate, resourceAccounts: '0', missingResourceAccounts: '3' },
      { ...aggregate, allowedFids: '2' },
      { ...aggregate, castles: '2' },
      { ...aggregate, markAccounts: '2' },
      { ...aggregate, orphanedResourceAccounts: '1' },
      { ...aggregate, resourceInvariantViolations: '1' },
      { ...aggregate, protocolVersion: 4 },
      { ...aggregate, resourcePolicyVersion: 'other' },
      { ...aggregate, fid: '424242424242' },
      { ...aggregate, food: '200' },
      { ...aggregate, resourceAccounts: 3 },
      { ...aggregate, resourceAccounts: '03' },
    ]) {
      expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
        JSON.stringify(value),
        3,
      )).toThrow();
    }

    const missing = { ...aggregate } as Record<string, unknown>;
    delete missing.resourceInvariantViolations;
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(missing),
      3,
    )).toThrow(/unexpected fields/i);
    expect(() => verifyExpectedAlphaV4ResourceReadyAggregate(
      JSON.stringify(aggregate),
      undefined,
    )).toThrow(/expected founder count/i);
  });

  it.each(v3InvariantFields)(
    'rejects a nonzero protocol-v3 %s invariant at every empty rollout stage',
    field => {
      for (const [stage, fixture] of [
        [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
        [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
        [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED, genesisV3FoundedAggregate],
      ] as const) {
        expect(() => verifyExpectedAlphaV3Aggregate(
          JSON.stringify({ ...fixture, [field]: '1' }),
          stage,
          stage === PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED ? 3 : undefined,
        )).toThrow(/invariant/i);
      }
    },
  );

  it.each([
    'occupiedWorldTiles',
    'walletAttributionSnapshots',
    'scanBatches',
    'alphaTermsAcceptances',
  ])('rejects rogue protocol-v3 %s rows at every empty rollout stage', field => {
    for (const [stage, fixture] of [
      [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
      [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
    ] as const) {
      expect(() => verifyExpectedAlphaV3Aggregate(
        JSON.stringify({ ...fixture, [field]: '1' }),
        stage,
      )).toThrow(/rollout stage/i);
    }
  });

  it.each([
    'legacyPlayers',
    'playersV2',
    'playerOwnershipsV2',
    'snapBurnCredits',
    'walletAttributions',
    'walletAttributionSnapshots',
    'scanCursors',
    'scanBatches',
    'alphaTermsAcceptances',
  ])('rejects rogue protocol-v3 founded-stage %s rows', field => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...genesisV3FoundedAggregate, [field]: '1' }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it.each([
    ['playersV2', '2'],
    ['playerOwnershipsV2', '2'],
    ['alphaTermsAcceptances', '2'],
  ])('requires authenticated founded-stage %s to match its exact expectation', (field, value) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...authenticatedGenesisV3FoundedAggregate, [field]: value }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      1,
    )).toThrow(/rollout stage/i);
  });

  it('keeps founded-stage authenticated count expectations at zero by default', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it('allows every supported immutable entry-agreement row per player and rejects another', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(historicalAndCurrentEntryAgreementAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      2,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(completeEntryAgreementHistoryAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      6,
    )).not.toThrow();
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(authenticatedGenesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      1,
      7,
    )).toThrow(/entry-agreement row count was invalid/i);
  });

  it.each([
    [PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED, additiveV3PreseedAggregate],
    [PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY, genesisV3SeededEmptyAggregate],
  ] as const)('rejects authenticated expectations outside the founded stage: %s', (stage, fixture) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(fixture),
      stage,
      undefined,
      1,
      1,
    )).toThrow(/require the founded aggregate stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(fixture),
      stage,
      undefined,
      0,
      0,
      0,
    )).toThrow(/require the founded aggregate stage/i);
  });

  it.each([
    ['player count', genesisV3FoundedAggregate, 4, 0],
    ['entry-agreement row count', authenticatedGenesisV3FoundedAggregate, 1, 7],
  ])('rejects an expected %s above its bounded aggregate limit', (_label, aggregate, players, terms) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(aggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      players,
      terms,
    )).toThrow(/was invalid/i);
  });

  it.each([
    'occupiedWorldTiles',
    'castleSlotClaims',
    'castles',
    'realmProfiles',
    'markAccounts',
    'allowedFids',
  ])('requires founded-stage %s to equal the private expected count', field => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify({ ...genesisV3FoundedAggregate, [field]: '2' }),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
  });

  it('keeps founder state while checking the independently enabled admission count', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(foundedAggregateWithRevokedAdmission),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      0,
      0,
      2,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      0,
      0,
      4,
    )).toThrow(/enabled allowed-FID count was invalid/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
      0,
      0,
      -1,
    )).toThrow(/enabled allowed-FID count was invalid/i);
  });

  it.each([
    ['missing field', (() => {
      const value = { ...additiveV3PreseedAggregate } as Record<string, unknown>;
      delete value.markAccounts;
      return value;
    })()],
    ['unexpected identity-shaped field', { ...additiveV3PreseedAggregate, identity: 'forbidden' }],
    ['numeric u64 count', { ...additiveV3PreseedAggregate, markAccounts: 0 }],
    ['noncanonical decimal count', { ...additiveV3PreseedAggregate, markAccounts: '00' }],
    ['oversized u64 count', { ...additiveV3PreseedAggregate, markAccounts: '18446744073709551616' }],
    ['wrong protocol type', { ...additiveV3PreseedAggregate, protocolVersion: '3' }],
    ['wrong seed type', { ...additiveV3PreseedAggregate, worldSeed: '3445214658' }],
    ['wrong seed name', { ...additiveV3PreseedAggregate, worldSeedName: 'OTHER' }],
  ])('rejects a protocol-v3 aggregate with %s', (_label, value) => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(value),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toThrow();
  });

  it('keeps preseed and seeded-empty state expectations distinct', () => {
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(additiveV3PreseedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3SeededEmptyAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
      3,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toThrow(/rollout stage/i);
    expect(() => verifyExpectedAlphaV3Aggregate(
      JSON.stringify(genesisV3FoundedAggregate),
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    )).toThrow(/expected founder count/i);
  });

  it.each([
    ['missing ownership count', (() => {
      const value = { ...additiveV2Aggregate } as Record<string, unknown>;
      delete value.playerOwnershipsV2;
      return value;
    })()],
    ['unexpected identity-shaped field', { ...additiveV2Aggregate, identity: 'forbidden' }],
    ['nonzero orphan count', { ...additiveV2Aggregate, orphanedPlayerRowsV2: '1' }],
    ['wrong protocol', { ...additiveV2Aggregate, protocolVersion: 1 }],
    ['wrong generation', { ...additiveV2Aggregate, worldSeedName: 'OTHER' }],
  ])('rejects a protocol-v2 aggregate with %s', (_label, value) => {
    expect(() => verifyExpectedAlphaV2Aggregate(JSON.stringify(value))).toThrow();
  });

  it('rejects malformed and extra-key legacy aggregate output', () => {
    expect(() => verifyExpectedAlphaAggregate('{')).toThrow(/machine-readable/i);
    expect(() => verifyExpectedAlphaAggregate(JSON.stringify({
      worldTiles: '61',
      allowedFids: '0',
      enabledAllowedFids: '0',
      players: '0',
      castles: '0',
      identity: 'forbidden',
    }))).toThrow(/unexpected fields/i);
  });

  it('passes only the four required values and never forwards the ambient environment', () => {
    process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL = 'must-not-be-forwarded';
    try {
      const child = protectedAggregateChildEnvironment(ISSUER);
      expect(Object.keys(child).sort()).toEqual([
        'WARPKEEP_ADMIN_TOKEN_SECRET_STDIN',
        'WARPKEEP_AUTH_BRIDGE_URL',
        'WARPKEEP_SPACETIMEDB_DATABASE',
        'WARPKEEP_SPACETIMEDB_URI',
      ]);
      expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
      expect(JSON.stringify(child)).not.toContain('test-only-secret');
    } finally {
      delete process.env.WARPKEEP_UNRELATED_SECRET_SENTINEL;
    }
  });

  it('hard-kills a hung read-only aggregate child at the fixed deadline', () => {
    const options = protectedAggregateChildOptions(repositoryRoot, ISSUER, 'test-only-secret');
    expect(options).toMatchObject({
      cwd: repositoryRoot,
      encoding: 'utf8',
      maxBuffer: 1_000_000,
      timeout: 30_000,
      killSignal: 'SIGKILL',
    });
    expect(options.input).toBe('test-only-secret');
    expect(JSON.stringify(options.env)).not.toContain('test-only-secret');
  });

  it('selects the exact aggregate command for every rollout stage', () => {
    expect(protectedAggregateChildArguments('/test/tsx', false)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha', '--json',
    ]);
    expect(protectedAggregateChildArguments('/test/tsx', true)).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v2', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(protectedAggregateChildArguments(
      '/test/tsx',
      PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    )).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v3', '--json',
    ]);
    expect(resourceV4AggregateChildArguments('/test/tsx')).toEqual([
      '/test/tsx', 'scripts/hermes-admin.ts', 'inspect-alpha-v4', '--json',
    ]);
  });

  it('runs founded-v3 and resource-v4 readiness against one immutable child target', () => {
    const calls: unknown[][] = [];
    const secret = 'TEST_ONLY_HERMES_SECRET_'.repeat(2);
    const exactEnvironment = {
      WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
      WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
    };
    const aggregate = {
      allowedFids: '3',
      castles: '3',
      markAccounts: '3',
      resourceAccounts: '3',
      missingResourceAccounts: '0',
      orphanedResourceAccounts: '0',
      resourceInvariantViolations: '0',
      protocolVersion: 3,
      resourcePolicyVersion: 'genesis-resource-yield-v1',
    };
    const foundedAggregate = {
      ...authenticatedGenesisV3FoundedAggregate,
      enabledAllowedFids: '2',
    };
    const fakeSpawnSync = (...args: unknown[]) => {
      calls.push(args);
      const childArguments = args[1] as string[];
      return {
        status: 0,
        signal: null,
        stdout: JSON.stringify(
          childArguments.includes('inspect-alpha-v3')
            ? foundedAggregate
            : aggregate,
        ),
        stderr: '',
      };
    };
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    try {
      expect(() => verifyPostBackfillResourceAggregateCheckpoints(
        ISSUER,
        3,
        1,
        1,
        secret,
        fakeSpawnSync,
        repositoryRoot,
        exactEnvironment,
        PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
        2,
      )).not.toThrow();
      expect(calls).toHaveLength(2);
      expect(calls[0]?.[0]).toBe(process.execPath);
      expect(calls[0]?.[1]).toEqual([
        resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
        'scripts/hermes-admin.ts',
        'inspect-alpha-v3',
        '--json',
      ]);
      expect(calls[1]?.[0]).toBe(process.execPath);
      expect(calls[1]?.[1]).toEqual([
        resolve(repositoryRoot, 'node_modules/tsx/dist/cli.mjs'),
        'scripts/hermes-admin.ts',
        'inspect-alpha-v4',
        '--json',
      ]);
      const options = calls[0]?.[2] as ReturnType<typeof resourceV4ReadyAggregateChildOptions>;
      expect(calls[1]?.[2]).toBe(options);
      expect(options).toEqual(resourceV4ReadyAggregateChildOptions(
        repositoryRoot,
        ISSUER,
        secret,
        exactEnvironment,
      ));
      expect(options.env).toEqual(resourceV4ReadyAggregateChildEnvironment(
        ISSUER,
        exactEnvironment,
      ));
      expect(options.env).toEqual({
        WARPKEEP_SPACETIMEDB_URI: 'https://maincloud.spacetimedb.com',
        WARPKEEP_SPACETIMEDB_DATABASE: CANONICAL_DATABASE_IDENTITY,
        WARPKEEP_AUTH_BRIDGE_URL: 'https://auth.warpkeep.com',
        WARPKEEP_ADMIN_TOKEN_SECRET_STDIN: '1',
      });
      expect(JSON.stringify(options.env)).not.toContain(secret);
      expect(log).toHaveBeenCalledWith(
        'alpha status: required Genesis protocol-v3 founded aggregate state verified',
      );
      expect(log).toHaveBeenCalledWith(
        'alpha status: required resource procedure-v4 ready aggregate state verified',
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(
        JSON.stringify(foundedAggregate),
      );
      expect(JSON.stringify(log.mock.calls)).not.toContain(JSON.stringify(aggregate));
    } finally {
      log.mockRestore();
    }

    const childFailure = () => verifyPostBackfillResourceAggregateCheckpoints(
      ISSUER,
      3,
      1,
      1,
      secret,
      ((...args: unknown[]) => {
        const childArguments = args[1] as string[];
        return childArguments.includes('inspect-alpha-v3')
          ? {
            status: 0,
            signal: null,
            stdout: JSON.stringify(authenticatedGenesisV3FoundedAggregate),
            stderr: '',
          }
          : { status: 1, signal: null, stdout: 'private', stderr: 'private' };
      }) as never,
      repositoryRoot,
      exactEnvironment,
    );
    expect(childFailure).toThrow(/ready aggregate inspection failed/i);
    expect(childFailure).not.toThrow(/private/i);

    for (const [bridge, environment, expected] of [
      ['https://staging-auth.warpkeep.com', exactEnvironment, /canonical Warpkeep bridge/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_URI: 'https://staging.spacetimedb.com',
      }, /remapped SpacetimeDB URI/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-89e4u',
      }, /immutable production database identity/i],
      [ISSUER, {
        ...exactEnvironment,
        WARPKEEP_SPACETIMEDB_DATABASE: 'warpkeep-staging',
      }, /immutable production database identity/i],
    ] as const) {
      expect(() => resourceV4ReadyAggregateChildOptions(
        repositoryRoot,
        bridge,
        secret,
        environment,
      )).toThrow(expected);
      const spawn = vi.fn();
      expect(() => verifyPostBackfillResourceAggregateCheckpoints(
        bridge,
        3,
        1,
        1,
        secret,
        spawn as never,
        repositoryRoot,
        environment,
      )).toThrow(expected);
      expect(spawn).not.toHaveBeenCalled();
    }
    expect(() => resourceV4ReadyAggregateChildOptions(
      repositoryRoot,
      ISSUER,
      'too-short',
      exactEnvironment,
    )).toThrow(/32-to-512-byte Hermes credential/i);
  });

  it('rejects unknown or duplicate production-verifier flags', () => {
    const defaults = {
      requireProtectedAggregate: false,
      requireAdditiveV2Aggregate: false,
      requireAdditiveV3PreseedAggregate: false,
      requireGenesisV3SeededEmptyAggregate: false,
      requireGenesisV3FoundedAggregate: false,
      requireGenesisGenerationV3FoundedAggregate: false,
      requireResourceV4ReadyAggregate: false,
      expectedFounderCount: undefined,
      expectedPlayerCount: 0,
      expectedTermsAcceptanceCount: 0,
      expectedEnabledAllowedFidCount: undefined,
      requireAuthV2: false,
      requireAuthV2Enabled: false,
      requireRpcRoleAttestation: false,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.LEGACY,
    };
    expect(parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-additive-v2-aggregate',
    ])).toEqual({
      ...defaults,
      requireAdditiveV2Aggregate: true,
      requireAuthV2: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
    ])).toEqual({
      ...defaults,
      requireAuthV2Enabled: true,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
      '--require-rpc-role-attestation',
    ])).toEqual({
      ...defaults,
      requireAuthV2Enabled: true,
      requireRpcRoleAttestation: true,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
      '--require-additive-v2-aggregate',
    ])).toEqual({
      ...defaults,
      requireAdditiveV2Aggregate: true,
      requireAuthV2Enabled: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V2,
    });
    expect(parseProductionVerifierArguments([
      '--require-protected-aggregate',
      '--require-additive-v3-preseed-aggregate',
    ])).toEqual({
      ...defaults,
      requireProtectedAggregate: true,
      requireAdditiveV3PreseedAggregate: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.ADDITIVE_V3_PRESEED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-seeded-empty-aggregate',
    ])).toEqual({
      ...defaults,
      requireGenesisV3SeededEmptyAggregate: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_SEEDED_EMPTY,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 3,
      expectedEnabledAllowedFidCount: 3,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-generation-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      requireGenesisGenerationV3FoundedAggregate: true,
      expectedFounderCount: 3,
      expectedEnabledAllowedFidCount: 3,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-auth-v2-enabled',
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=1',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      requireResourceV4ReadyAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
      expectedEnabledAllowedFidCount: 4,
      requireAuthV2Enabled: true,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=1',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 1,
      expectedEnabledAllowedFidCount: 4,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=4',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=2',
    ])).toEqual({
      ...defaults,
      requireGenesisV3FoundedAggregate: true,
      expectedFounderCount: 4,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 2,
      expectedEnabledAllowedFidCount: 4,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_V3_FOUNDED,
    });
    expect(parseProductionVerifierArguments([
      '--require-genesis-generation-v3-founded-aggregate',
      '--expected-founder-count=8',
      '--expected-enabled-allowed-fid-count=7',
    ])).toMatchObject({
      expectedFounderCount: 8,
      expectedEnabledAllowedFidCount: 7,
      aggregateStage: PROTECTED_AGGREGATE_STAGE.GENESIS_GENERATION_V3_FOUNDED,
    });
    expect(() => parseProductionVerifierArguments(['--require-auth-v3']))
      .toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments(['--require-genesis-v2-seeded-empty-aggregate']))
      .toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-auth-v2',
    ])).toThrow(/unknown or duplicate/i);
    expect(() => parseProductionVerifierArguments([
      '--require-auth-v2',
      '--require-auth-v2-enabled',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-additive-v2-aggregate',
      '--require-additive-v3-preseed-aggregate',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-additive-v3-preseed-aggregate',
      '--require-genesis-v3-seeded-empty-aggregate',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-seeded-empty-aggregate',
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
    ])).toThrow(/mutually exclusive/i);
    expect(() => parseProductionVerifierArguments([
      '--require-resource-v4-ready-aggregate',
    ])).toThrow(/requires the founded protocol-v3 aggregate stage/i);
    expect(() => parseProductionVerifierArguments([
      '--require-resource-v4-ready-aggregate',
      '--require-resource-v4-ready-aggregate',
    ])).toThrow(/unknown or duplicate/i);
  });

  it.each([
    [[
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=0',
    ]],
    [[
      '--require-genesis-v3-founded-aggregate',
      '--require-resource-v4-ready-aggregate',
      '--expected-founder-count=3',
      '--expected-terms-acceptance-count=0',
    ]],
  ])('requires explicit authenticated counts for a resource-v4 readiness check: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/requires explicit player and Terms acceptance counts/i);
  });

  it.each([
    [['--require-genesis-v3-founded-aggregate']],
    [['--expected-founder-count=3']],
    [['--require-additive-v3-preseed-aggregate', '--expected-founder-count=3']],
  ])('requires the founded aggregate flag/count pair: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/supplied together/i);
  });

  it.each([
    [['--expected-player-count=0']],
    [['--expected-terms-acceptance-count=0']],
    [['--expected-enabled-allowed-fid-count=0']],
    [['--require-additive-v3-preseed-aggregate', '--expected-player-count=0']],
  ])('rejects founded authenticated expectations at another stage: %j', arguments_ => {
    expect(() => parseProductionVerifierArguments(arguments_))
      .toThrow(/require the founded aggregate stage/i);
  });

  it.each(['0', '00', '01', '101', '-1', '+1', '1.0', '1e2', 'abc', ''])(
    'rejects invalid expected founder count %j',
    value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        `--expected-founder-count=${value}`,
      ])).toThrow(/canonical integer/i);
    },
  );

  it('rejects duplicate expected founder counts', () => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-founder-count=3',
    ])).toThrow(/unknown or duplicate/i);
  });

  it.each(['-1', '00', '01', '+1', '1.0', '1e2', '101', 'abc', ''])
    ('rejects noncanonical or out-of-range expected player counts: %j', value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        '--expected-founder-count=3',
        `--expected-player-count=${value}`,
      ])).toThrow(/canonical integer/i);
    });

  it.each(['-1', '00', '01', '+1', '1.0', '1e2', '101', 'abc', ''])
    ('rejects noncanonical or out-of-range enabled allowed-FID counts: %j', value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        '--expected-founder-count=3',
        `--expected-enabled-allowed-fid-count=${value}`,
      ])).toThrow(/canonical integer/i);
    });

  it.each(['-1', '00', '01', '+1', '1.0', '1e2', '601', 'abc', ''])
    ('rejects noncanonical or globally out-of-range entry-agreement counts: %j', value => {
      expect(() => parseProductionVerifierArguments([
        '--require-genesis-v3-founded-aggregate',
        '--expected-founder-count=3',
        `--expected-terms-acceptance-count=${value}`,
      ])).toThrow(/canonical integer/i);
    });

  it.each([
    '--expected-player-count=1',
    '--expected-terms-acceptance-count=1',
    '--expected-enabled-allowed-fid-count=1',
  ])('rejects duplicate authenticated count argument %s', argument => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      argument,
      argument,
    ])).toThrow(/unknown or duplicate/i);
  });

  it('rejects an authenticated player count above the expected founder count', () => {
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=4',
    ])).toThrow(/cannot exceed/i);
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-enabled-allowed-fid-count=4',
    ])).toThrow(/cannot exceed/i);
  });

  it('allows the complete immutable acceptance history per player but fails closed above it', () => {
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=6',
    ])).toMatchObject({
      expectedFounderCount: 3,
      expectedPlayerCount: 1,
      expectedTermsAcceptanceCount: 6,
      expectedEnabledAllowedFidCount: 3,
    });
    expect(() => parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=3',
      '--expected-player-count=1',
      '--expected-terms-acceptance-count=7',
    ])).toThrow(/supported immutable row history/i);
    expect(parseProductionVerifierArguments([
      '--require-genesis-v3-founded-aggregate',
      '--expected-founder-count=100',
      '--expected-player-count=100',
      '--expected-terms-acceptance-count=600',
    ])).toMatchObject({
      expectedFounderCount: 100,
      expectedPlayerCount: 100,
      expectedTermsAcceptanceCount: 600,
      expectedEnabledAllowedFidCount: 100,
    });
  });

  it('fails closed when the activation gate requires an unavailable aggregate credential', () => {
    expect(() => requiredProtectedAggregateSecret(undefined, true))
      .toThrow(/protected aggregate inspection was required/i);
    expect(requiredProtectedAggregateSecret(undefined, false)).toBeUndefined();
  });

  it('keeps operator RPC proof independent from legacy aggregate inspection', () => {
    expect(shouldInspectConfiguredProtectedAggregate(false, true)).toBe(false);
    expect(shouldInspectConfiguredProtectedAggregate(true, true)).toBe(true);
    expect(shouldInspectConfiguredProtectedAggregate(false, false)).toBe(true);
    expect(shouldInspectConfiguredProtectedAggregate(true, false)).toBe(true);
  });

  it('does not forward ambient Warpkeep data to the publish CLI', () => {
    const child = publishChildEnvironment({
      PATH: '/test/bin',
      HOME: '/test/home',
      WARPKEEP_UNRELATED_SECRET_SENTINEL: 'must-not-be-forwarded',
      WARPKEEP_ADMIN_TOKEN_SECRET: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_ENABLED_ALLOWED_FID_COUNT: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_FOUNDER_COUNT: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_PLAYER_COUNT: 'must-not-be-forwarded',
      WARPKEEP_EXPECTED_TERMS_ACCEPTANCE_COUNT: 'must-not-be-forwarded',
      SIGNING_KEY_JWK: 'must-not-be-forwarded',
    });
    expect(child).toEqual({ PATH: '/test/bin', HOME: '/test/home' });
    expect(JSON.stringify(child)).not.toContain('must-not-be-forwarded');
  });
});
