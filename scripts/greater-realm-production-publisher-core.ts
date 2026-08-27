import { createHash } from 'node:crypto';

import { isGreaterRealmCutoverWriteNotStartedError } from './greater-realm-cutover-write-control';
import {
  createGreaterRealmCutoverExpectedAfterPredicate,
  emptyGreaterRealmCutoverOperationReceiptChain,
  type GreaterRealmCutoverOperationJournalChain,
  type GreaterRealmCutoverWritePermit,
} from './greater-realm-cutover-operation-journal';
import { GREATER_REALM_CUTOVER_RECEIPT_TARGET } from './greater-realm-cutover-receipts';

import {
  ACCESS_REQUEST_V13_TABLE_CONTRACTS,
  DAILY_MARK_V14_TABLE_CONTRACTS,
  INNER_KEEP_V15_TABLE_CONTRACTS,
  PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  WORKER_V12_TABLE_CONTRACTS,
  verifyExactProductionV14ModuleSchema,
  isSpacetimePublishContainmentError,
  type GreaterRealmPublishSupervisorIdentity,
  type MigrationArtifactReceipt,
} from './publish-spacetime-dev.mjs';
import { canonicalTableSchemaBoundaryDigest } from './spacetime-table-schema-attestation.mjs';

import {
  projectGreaterRealmProductionImportStatus,
  type GreaterRealmProductionImportStatus,
} from './greater-realm-production-import-core';
import {
  projectGreaterRealmProductionCutoverStatusShape,
  projectGreaterRealmProductionCutoverStatusForCompileMode,
  type GreaterRealmProductionCutoverStatus,
} from './greater-realm-production-relocation-core';

export const GREATER_REALM_PRODUCTION_PUBLISH_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database: 'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  deleteData: 'never',
} as const);

/**
 * These checked-in values deliberately remain false. The operator can only
 * receive an approved envelope from a separately reviewed release change.
 */
export const GREATER_REALM_PRODUCTION_RELEASE_FLAGS = Object.freeze({
  entryAgreementApproved: false,
  additivePublishApproved: false,
  importForwardFixApproved: false,
  activationForwardFixApproved: false,
  clientActivationApproved: false,
  admissionNotificationsApproved: false,
} as const);

export const GREATER_REALM_PRODUCTION_PUBLISH_LANE = Object.freeze({
  APPEND_INERT_V17: 'append-inert-v17',
  ENABLE_IMPORT_ONLY_V17: 'enable-import-only-v17',
  FORWARD_IMPORT_IMPORTING_V17: 'forward-import-importing-v17',
  FORWARD_IMPORT_READY_V17: 'forward-import-ready-v17',
  HANDOFF_ACTIVATION_READY_V17: 'handoff-activation-ready-v17',
  FORWARD_ACTIVATION_READY_V17: 'forward-activation-ready-v17',
  FORWARD_ACTIVATION_PREPARED_V17: 'forward-activation-prepared-v17',
  FORWARD_ACTIVATION_DRAINING_V17: 'forward-activation-draining-v17',
  FORWARD_ACTIVATION_FROZEN_V17: 'forward-activation-frozen-v17',
  FORWARD_ACTIVATION_PLANNED_V17: 'forward-activation-planned-v17',
  FORWARD_ACTIVATION_CANARY_V17: 'forward-activation-canary-v17',
  FORWARD_ACTIVATION_ACTIVE_V17: 'forward-activation-active-v17',
  FORWARD_ACTIVATION_HALTED_V17: 'forward-activation-halted-v17',
  FORWARD_ACTIVATION_ROLLED_BACK_V17: 'forward-activation-rolled-back-v17',
} as const);

export type GreaterRealmProductionPublishLane =
  typeof GREATER_REALM_PRODUCTION_PUBLISH_LANE[keyof typeof GREATER_REALM_PRODUCTION_PUBLISH_LANE];

export type GreaterRealmProductionModuleDeltaPolicy =
  | 'append-approval-only'
  | 'import-gate-only'
  | 'activation-gate-only'
  | 'reviewed-same-schema';

export type GreaterRealmProductionReleaseFlags = Readonly<{
  entryAgreementApproved: boolean;
  additivePublishApproved: boolean;
  importForwardFixApproved: boolean;
  activationForwardFixApproved: boolean;
  clientActivationApproved: boolean;
  admissionNotificationsApproved: boolean;
}>;

export type GreaterRealmProductionPublishReceipt = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-greater-realm-production-publish-v1';
  lane: GreaterRealmProductionPublishLane;
  outcome: 'verified' | 'verified-after-submission-error';
  target: typeof GREATER_REALM_PRODUCTION_PUBLISH_TARGET;
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  moduleDeltaPolicy: GreaterRealmProductionModuleDeltaPolicy;
  artifactDigest: string;
  v14TableSchemaDigest: string;
  v17TableSchemaDigest: string;
  currentCandidateTableSchemaDigest: string;
  predecessorTableCount: number;
  postTableCount: 86;
  schemaMutation: 'append-30' | 'none';
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
  releaseState: string;
  activationMode?: string;
  historicalAggregateDigest: string;
  operationReceiptChainDigest: string;
  operationReceiptCount: number;
}>;

export class GreaterRealmProductionPublisherError extends Error {
  constructor(readonly code: string, readonly publishAttempted = false) {
    super(code);
    this.name = 'GreaterRealmProductionPublisherError';
  }
}

function fail(code: string, publishAttempted = false): never {
  throw new GreaterRealmProductionPublisherError(code, publishAttempted);
}

const V16_TABLES = Object.freeze([
  'realm_chat_status_v1',
  'realm_chat_channel_v1',
  'realm_chat_message_v1',
  'realm_chat_recent_v1',
  'realm_chat_rate_event_v1',
  'realm_chat_send_receipt_v1',
  'realm_chat_report_v1',
  'realm_chat_report_rate_event_v1',
] as const);

const V17_TABLES = Object.freeze([
  'greater_realm_release_v1',
  'greater_realm_chunk_v1',
  'greater_realm_navigation_component_v1',
  'greater_realm_cell_v1',
  'greater_realm_castle_slot_v1',
  'greater_realm_castle_claim_v1',
  'greater_realm_cell_occupancy_v1',
  'greater_realm_resource_node_v1',
  'greater_realm_activation_v1',
  'realm_atlas_v1',
  'realm_atlas_visible_region_v1',
  'realm_worker_system_v2',
] as const);

const CURRENT_CANDIDATE_TABLES = Object.freeze([
  'production_player_canary_baseline_v1',
  'production_player_canary_approval_registration_v1',
] as const);

function contractRefs(
  contracts: Readonly<Record<string, Readonly<{ productTypeRef: number }>>>,
): Readonly<Record<string, number>> {
  return Object.freeze(Object.fromEntries(
    Object.entries(contracts).map(([name, contract]) => [name, contract.productTypeRef]),
  ));
}

export const GREATER_REALM_PRODUCTION_V14_TABLE_REFS = Object.freeze({
  ...PRODUCTION_V11_TABLE_PRODUCT_TYPE_REFS,
  ...contractRefs(WORKER_V12_TABLE_CONTRACTS),
  ...contractRefs(ACCESS_REQUEST_V13_TABLE_CONTRACTS),
  ...contractRefs(DAILY_MARK_V14_TABLE_CONTRACTS),
});

export const GREATER_REALM_PRODUCTION_V17_TABLE_REFS = Object.freeze({
  ...GREATER_REALM_PRODUCTION_V14_TABLE_REFS,
  ...contractRefs(INNER_KEEP_V15_TABLE_CONTRACTS),
  ...Object.fromEntries(V16_TABLES.map((name, index) => [name, 64 + index])),
  ...Object.fromEntries(V17_TABLES.map((name, index) => [name, 72 + index])),
});

export const GREATER_REALM_PRODUCTION_CURRENT_CANDIDATE_TABLE_REFS = Object.freeze({
  ...GREATER_REALM_PRODUCTION_V17_TABLE_REFS,
  ...Object.fromEntries(CURRENT_CANDIDATE_TABLES.map((name, index) => [name, 84 + index])),
});

const SHA256 = /^[0-9a-f]{64}$/u;

type SchemaDescription = Readonly<{
  tables: readonly Readonly<Record<string, unknown>>[];
  typespace: Readonly<Record<string, unknown>>;
  [key: string]: unknown;
}>;

function record(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function schema(value: unknown): SchemaDescription {
  const description = record(value, 'GREATER_REALM_PRODUCTION_SCHEMA_INVALID');
  if (!Array.isArray(description.tables) || description.typespace === null
    || typeof description.typespace !== 'object' || Array.isArray(description.typespace)) {
    fail('GREATER_REALM_PRODUCTION_SCHEMA_INVALID');
  }
  return description as SchemaDescription;
}

function canonicalJson(value: unknown): string {
  const visit = (current: unknown): unknown => {
    if (typeof current === 'bigint') return current.toString();
    if (Array.isArray(current)) return current.map(visit);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(Object.entries(current as Readonly<Record<string, unknown>>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, visit(child)]));
    }
    return current;
  };
  return JSON.stringify(visit(value));
}

function tableMap(description: SchemaDescription): ReadonlyMap<string, Readonly<Record<string, unknown>>> {
  const entries: Array<readonly [string, Readonly<Record<string, unknown>>]> = [];
  for (const raw of description.tables) {
    const table = record(raw, 'GREATER_REALM_PRODUCTION_SCHEMA_INVALID');
    if (typeof table.name !== 'string' || entries.some(([name]) => name === table.name)) {
      fail('GREATER_REALM_PRODUCTION_SCHEMA_INVALID');
    }
    entries.push([table.name, table]);
  }
  return new Map(entries);
}

function assertExactRefs(
  description: SchemaDescription,
  expected: Readonly<Record<string, number>>,
  digest: string,
): void {
  const tables = tableMap(description);
  const names = Object.keys(expected);
  if (
    tables.size !== names.length
    || names.some(name => tables.get(name)?.product_type_ref !== expected[name])
    || !SHA256.test(digest)
  ) fail('GREATER_REALM_PRODUCTION_SCHEMA_BOUNDARY_MISMATCH');
  let actualDigest: string;
  try {
    actualDigest = canonicalTableSchemaBoundaryDigest(description, names);
  } catch {
    fail('GREATER_REALM_PRODUCTION_SCHEMA_BOUNDARY_MISMATCH');
  }
  if (actualDigest !== digest) fail('GREATER_REALM_PRODUCTION_SCHEMA_BOUNDARY_MISMATCH');
}

function signatures(
  description: SchemaDescription,
  names: readonly string[],
): Readonly<Record<string, string>> {
  const tables = tableMap(description);
  return Object.freeze(Object.fromEntries(names.map(name => {
    const table = tables.get(name);
    if (table === undefined) fail('GREATER_REALM_PRODUCTION_SCHEMA_BOUNDARY_MISMATCH');
    return [name, canonicalJson(table)];
  })));
}

export function verifyGreaterRealmV14ProductionPredecessor(
  value: unknown,
  artifactReceipt: MigrationArtifactReceipt,
): Readonly<{ tableSignatures: Readonly<Record<string, string>>; tableCount: 56 }> {
  const description = schema(value);
  // Preserve the complete legacy contract and active Worker ABI check already
  // used by the existing production publisher.
  try {
    verifyExactProductionV14ModuleSchema(
      description,
      artifactReceipt.v12TableSchemaDigest,
      artifactReceipt.v13TableSchemaDigest,
      artifactReceipt.v14TableSchemaDigest,
    );
  } catch {
    fail('GREATER_REALM_PRODUCTION_V14_PREDECESSOR_INVALID');
  }
  assertExactRefs(
    description,
    GREATER_REALM_PRODUCTION_V14_TABLE_REFS,
    artifactReceipt.v14TableSchemaDigest,
  );
  return Object.freeze({
    tableSignatures: signatures(description, Object.keys(GREATER_REALM_PRODUCTION_V14_TABLE_REFS)),
    tableCount: 56,
  });
}

export function verifyGreaterRealmCurrentCandidateProductionSchema(input: Readonly<{
  description: unknown;
  artifactReceipt: MigrationArtifactReceipt;
  predecessorSignatures?: Readonly<Record<string, string>>;
}>): Readonly<{ tableSignatures: Readonly<Record<string, string>>; tableCount: 86 }> {
  const description = schema(input.description);
  const v17Names = new Set(Object.keys(GREATER_REALM_PRODUCTION_V17_TABLE_REFS));
  assertExactRefs(
    Object.freeze({
      ...description,
      tables: description.tables.filter(table => (
        typeof table.name === 'string' && v17Names.has(table.name)
      )),
    }),
    GREATER_REALM_PRODUCTION_V17_TABLE_REFS,
    input.artifactReceipt.v17TableSchemaDigest,
  );
  assertExactRefs(
    description,
    GREATER_REALM_PRODUCTION_CURRENT_CANDIDATE_TABLE_REFS,
    input.artifactReceipt.currentCandidateTableSchemaDigest,
  );
  const tableSignatures = signatures(
    description,
    Object.keys(GREATER_REALM_PRODUCTION_CURRENT_CANDIDATE_TABLE_REFS),
  );
  if (input.predecessorSignatures !== undefined) {
    const expectedNames = Object.keys(input.predecessorSignatures);
    if (expectedNames.length !== 56 && expectedNames.length !== 86) {
      fail('GREATER_REALM_PRODUCTION_PREDECESSOR_CAPTURE_INVALID');
    }
    for (const name of expectedNames) {
      if (tableSignatures[name] !== input.predecessorSignatures[name]) {
        fail('GREATER_REALM_PRODUCTION_EXISTING_TABLE_CHANGED');
      }
    }
  }
  return Object.freeze({ tableSignatures, tableCount: 86 });
}

function exactFlags(value: GreaterRealmProductionReleaseFlags): void {
  const expected = [
    'entryAgreementApproved',
    'additivePublishApproved',
    'importForwardFixApproved',
    'activationForwardFixApproved',
    'clientActivationApproved',
    'admissionNotificationsApproved',
  ];
  if (
    value === null
    || typeof value !== 'object'
    || Object.keys(value).sort().join(',') !== expected.sort().join(',')
    || Object.values(value).some(flag => typeof flag !== 'boolean')
  ) fail('GREATER_REALM_PRODUCTION_RELEASE_FLAGS_INVALID');
}

export function requireGreaterRealmProductionPublishLane(
  lane: GreaterRealmProductionPublishLane,
  flags: GreaterRealmProductionReleaseFlags = GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
): void {
  exactFlags(flags);
  if (!flags.entryAgreementApproved || !flags.additivePublishApproved) {
    fail('GREATER_REALM_PRODUCTION_COMPOSITE_APPROVAL_REQUIRED');
  }
  if (!Object.values(GREATER_REALM_PRODUCTION_PUBLISH_LANE).includes(lane)) {
    fail('GREATER_REALM_PRODUCTION_PUBLISH_LANE_INVALID');
  }
  if (
    (
      lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17
      || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17
      || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17
    )
    && !flags.importForwardFixApproved
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_FORWARD_FIX_NOT_APPROVED');
  if (
    lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17
    && lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17
    && lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17
    && lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17
    && !flags.activationForwardFixApproved
  ) fail('GREATER_REALM_PRODUCTION_ACTIVATION_FORWARD_FIX_NOT_APPROVED');
  const importLane = lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17
    || lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17;
  const activationLane = lane !== GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17
    && !importLane;
  if (
    flags.importForwardFixApproved !== importLane
    || flags.activationForwardFixApproved !== activationLane
  ) fail('GREATER_REALM_PRODUCTION_FORWARD_APPROVAL_ENVELOPE_INVALID');
  // Publishing a server lane cannot silently approve either downstream
  // presentation or notification delivery.
  if (flags.clientActivationApproved || flags.admissionNotificationsApproved) {
    fail('GREATER_REALM_PRODUCTION_DOWNSTREAM_APPROVAL_MUST_REMAIN_SEPARATE');
  }
}

type CompileMode = readonly [boolean, boolean];
type PublisherStatus = GreaterRealmProductionImportStatus
  | GreaterRealmProductionCutoverStatus;

type ExpectedAtlasRelease = Readonly<{
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
}>;

type LanePlan = Readonly<{
  statusKind: 'import' | 'cutover';
  before?: CompileMode;
  after: CompileMode;
  releaseState: GreaterRealmProductionImportStatus['state'];
  activationMode?: string;
}>;

function expectedCompileMode(lane: GreaterRealmProductionPublishLane): LanePlan {
  const FF = Object.freeze([false, false] as const);
  const TF = Object.freeze([true, false] as const);
  const FT = Object.freeze([false, true] as const);
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17) {
    return Object.freeze({ statusKind: 'import', after: FF, releaseState: 'absent' });
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17) {
    return Object.freeze({
      statusKind: 'import', before: FF, after: TF, releaseState: 'absent',
    });
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_IMPORTING_V17) {
    return Object.freeze({
      statusKind: 'import', before: TF, after: TF, releaseState: 'importing',
    });
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_IMPORT_READY_V17) {
    return Object.freeze({
      statusKind: 'import', before: TF, after: TF, releaseState: 'ready',
    });
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17) {
    return Object.freeze({
      statusKind: 'cutover', before: TF, after: FT,
      releaseState: 'ready', activationMode: 'absent',
    });
  }
  const activationMode = lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_READY_V17
    ? 'absent'
    : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_PREPARED_V17
      ? 'prepared'
      : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_DRAINING_V17
        ? 'draining'
        : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_FROZEN_V17
          ? 'frozen'
          : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_PLANNED_V17
            ? 'planned'
            : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_CANARY_V17
              ? 'canary'
              : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_ACTIVE_V17
                ? 'active'
                : lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.FORWARD_ACTIVATION_HALTED_V17
                  ? 'halted'
                  : 'rolled-back';
  const releaseState = activationMode === 'canary' || activationMode === 'active'
    || activationMode === 'halted'
    ? activationMode
    : 'ready';
  return Object.freeze({
    statusKind: 'cutover', before: FT, after: FT, releaseState, activationMode,
  });
}

export function greaterRealmProductionModuleDeltaPolicy(
  lane: GreaterRealmProductionPublishLane,
): GreaterRealmProductionModuleDeltaPolicy {
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17) {
    return 'append-approval-only';
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.ENABLE_IMPORT_ONLY_V17) {
    return 'import-gate-only';
  }
  if (lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.HANDOFF_ACTIVATION_READY_V17) {
    return 'activation-gate-only';
  }
  return 'reviewed-same-schema';
}

function compileMode(mode: CompileMode) {
  return Object.freeze({
    importMutationsCompiled: mode[0],
    activationMutationsCompiled: mode[1],
  });
}

function assertCutoverPhaseContract(
  status: GreaterRealmProductionCutoverStatus,
  plan: LanePlan,
): void {
  if (
    status.releaseState !== plan.releaseState
    || status.activationMode !== plan.activationMode
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_PHASE_MISMATCH');
  const rootsAbsent = status.atlasRows === 0n
    && status.atlasMode === 'absent'
    && status.visibleRegionRows === 0n
    && status.activeVisibleRegionRows === 0n
    && status.workerSystemV2Rows === 0n
    && status.workerSystemV2Mode === 'absent';
  const publicMode = status.activationMode === 'canary'
    || status.activationMode === 'active'
    || (status.activationMode === 'halted' && status.currentWorldGraphApplicable);
  const rootsExact = status.atlasRows === 1n
    && status.atlasMode === status.activationMode
    && status.visibleRegionRows === 6n
    && status.activeVisibleRegionRows === 6n
    && status.workerSystemV2Rows === 1n
    && status.workerSystemV2Mode === status.activationMode;
  if (
    (status.activationMode === 'absent' && status.activationPresent)
    || (status.activationMode !== 'absent' && !status.activationPresent)
    || (publicMode && !rootsExact)
    || (!publicMode && !rootsAbsent)
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_PHASE_ROOT_MISMATCH');
}

function statusWithoutCompileMode(status: PublisherStatus): string {
  return canonicalJson(Object.fromEntries(Object.entries(status).filter(([key]) => (
    key !== 'importMutationsCompiled' && key !== 'activationMutationsCompiled'
  ))));
}

function assertExpectedAtlasRelease(
  status: GreaterRealmProductionCutoverStatus,
  expected: ExpectedAtlasRelease,
): void {
  if (
    !status.releasePresent
    || status.sourceCommit !== expected.atlasSourceCommit
    || status.atlasId !== expected.atlasId
    || status.publicReleaseId !== expected.publicReleaseId
    || status.expectedReleaseSha256 !== expected.expectedReleaseSha256
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_ATLAS_RELEASE_MISMATCH');
}

function projectPublisherStatus(input: Readonly<{
  value: unknown;
  plan: LanePlan;
  mode: CompileMode;
  expectedAtlasRelease: ExpectedAtlasRelease;
  projectCutoverStatus?: typeof projectGreaterRealmProductionCutoverStatusForCompileMode;
}>): PublisherStatus {
  if (input.plan.statusKind === 'import') {
    const status = projectGreaterRealmProductionImportStatus(input.value);
    if (
      status.importMutationsCompiled !== input.mode[0]
      || status.activationMutationsCompiled !== input.mode[1]
      || status.state !== input.plan.releaseState
    ) fail('GREATER_REALM_PRODUCTION_PUBLISH_COMPILE_MODE_MISMATCH');
    return status;
  }
  const projectCutoverStatus = input.projectCutoverStatus
    ?? projectGreaterRealmProductionCutoverStatusForCompileMode;
  const status = projectCutoverStatus(input.value, compileMode(input.mode));
  assertExpectedAtlasRelease(status, input.expectedAtlasRelease);
  assertCutoverPhaseContract(status, input.plan);
  return status;
}

function assertImportReleaseAuthority(input: Readonly<{
  status: GreaterRealmProductionImportStatus;
  authority: GreaterRealmProductionCutoverStatus;
  expectedAtlasRelease: ExpectedAtlasRelease;
  mode: CompileMode;
}>): void {
  const { status, authority } = input;
  assertExpectedAtlasRelease(authority, input.expectedAtlasRelease);
  if (
    !status.present
    || authority.importMutationsCompiled !== input.mode[0]
    || authority.activationMutationsCompiled !== input.mode[1]
    || authority.releaseState !== status.state
    || authority.atlasId !== status.atlasId
    || authority.publicReleaseId !== status.publicReleaseId
    || authority.importEpoch !== status.importEpoch
    || authority.expectedComponentCount !== status.expectedComponentCount
    || authority.expectedChunkCount !== status.expectedChunkCount
    || authority.expectedCellCount !== status.expectedCellCount
    || authority.expectedSlotCount !== status.expectedSlotCount
    || authority.expectedResourceNodeCount !== status.expectedResourceNodeCount
    || authority.regionManifestRows !== status.regionManifestRows
    || authority.componentRows !== status.componentRows
    || authority.chunkRows !== status.chunkRows
    || authority.cellRows !== status.cellRows
    || authority.slotRows !== status.slotRows
    || authority.resourceNodeRows !== status.resourceRows
    || authority.greaterRealmClaimRows !== status.claimRows
    || authority.greaterRealmOccupancyRows !== status.occupancyRows
    || authority.activationRows !== status.activationRows
    || authority.atlasRows !== status.publicAtlasRows
    || authority.visibleRegionRows !== status.publicRegionRows
    || authority.workerSystemV2Rows !== status.workerSystemRows
    || authority.releaseImportsExact !== status.importsExact
    || authority.releaseReady !== status.ready
    || authority.activationPresent
    || authority.activationMode !== 'absent'
    || status.claimRows !== 0n
    || status.occupancyRows !== 0n
    || status.activationRows !== 0n
    || status.publicAtlasRows !== 0n
    || status.publicRegionRows !== 0n
    || status.workerSystemRows !== 0n
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_IMPORT_AUTHORITY_MISMATCH');
}

function releaseState(status: PublisherStatus): string {
  return 'releaseState' in status ? status.releaseState : status.state;
}

function activationMode(status: PublisherStatus): string | undefined {
  return 'activationMode' in status ? status.activationMode : undefined;
}

function digestHistoricalAggregate(value: unknown): string {
  return createHash('sha256')
    .update('warpkeep-greater-realm-production-historical-aggregate-v1\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex');
}

function publisherJournalStatus(input: Readonly<{
  append: boolean;
  schemaDigest: string;
  status?: PublisherStatus;
}>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    schemaDigest: input.schemaDigest,
    ...(input.append
      ? {}
      : {
          stateDigest: createHash('sha256')
            .update('warpkeep-greater-realm-publisher-state-without-compile-v1\0', 'utf8')
            .update(statusWithoutCompileMode(input.status!), 'utf8')
            .digest('hex'),
        }),
    importMutationsCompiled: input.status?.importMutationsCompiled ?? false,
    activationMutationsCompiled: input.status?.activationMutationsCompiled ?? false,
  });
}

function publisherArtifactAudit(
  artifactReceipt: MigrationArtifactReceipt,
): Readonly<Record<string, string>> {
  return Object.freeze({
    artifactDigest: artifactReceipt.artifactDigest,
    v11TableSchemaDigest: artifactReceipt.v11TableSchemaDigest,
    v12TableSchemaDigest: artifactReceipt.v12TableSchemaDigest,
    v13TableSchemaDigest: artifactReceipt.v13TableSchemaDigest,
    v14TableSchemaDigest: artifactReceipt.v14TableSchemaDigest,
    v15TableSchemaDigest: artifactReceipt.v15TableSchemaDigest,
    v16TableSchemaDigest: artifactReceipt.v16TableSchemaDigest,
    v17TableSchemaDigest: artifactReceipt.v17TableSchemaDigest,
    currentCandidateTableSchemaDigest: artifactReceipt.currentCandidateTableSchemaDigest,
  });
}

function publisherReceiptStatus(input: Readonly<{
  lane: GreaterRealmProductionPublishLane;
  moduleDeltaPolicy: GreaterRealmProductionModuleDeltaPolicy;
  schemaDigest: string;
  status?: PublisherStatus;
  historicalAggregateDigest: string;
}>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    lane: input.lane,
    moduleDeltaPolicy: input.moduleDeltaPolicy,
    schemaDigest: input.schemaDigest,
    importMutationsCompiled: input.status?.importMutationsCompiled ?? false,
    activationMutationsCompiled: input.status?.activationMutationsCompiled ?? false,
    releaseState: input.status === undefined ? 'absent' : releaseState(input.status),
    activationMode: input.status === undefined ? null : activationMode(input.status) ?? null,
    historicalAggregateDigest: input.historicalAggregateDigest,
  });
}

export async function inspectGreaterRealmProductionPublisherRecoverySnapshot(input: Readonly<{
  lane: GreaterRealmProductionPublishLane;
  moduleDeltaPolicy: GreaterRealmProductionModuleDeltaPolicy;
  expectedAtlasSourceCommit: string;
  expectedAtlasId: string;
  expectedPublicReleaseId: string;
  expectedReleaseSha256: string;
  artifactReceipt: MigrationArtifactReceipt;
  readSchema: () => Promise<unknown>;
  readImportStatus?: () => Promise<unknown>;
  readCutoverStatus?: () => Promise<unknown>;
  readHistoricalAggregate: () => Promise<unknown>;
  testOnlyDependencies?: Readonly<{
    verifyV14Predecessor?: typeof verifyGreaterRealmV14ProductionPredecessor;
    verifyCurrentCandidateSchema?: typeof verifyGreaterRealmCurrentCandidateProductionSchema;
  }>;
}>): Promise<Readonly<{
  status: Readonly<Record<string, unknown>>;
  audit: Readonly<Record<string, unknown>>;
  receiptStatus: Readonly<Record<string, unknown>>;
  receiptAudit: Readonly<Record<string, unknown>>;
}>> {
  if (input.moduleDeltaPolicy !== greaterRealmProductionModuleDeltaPolicy(input.lane)) {
    fail('GREATER_REALM_PRODUCTION_MODULE_DELTA_POLICY_INVALID');
  }
  const append = input.lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17;
  const verifyV14Predecessor = input.testOnlyDependencies?.verifyV14Predecessor
    ?? verifyGreaterRealmV14ProductionPredecessor;
  const verifyCurrentCandidateSchema = input.testOnlyDependencies?.verifyCurrentCandidateSchema
    ?? verifyGreaterRealmCurrentCandidateProductionSchema;
  const description = await input.readSchema();
  let schemaDigest: string;
  let appendAlreadyPublished = false;
  if (append) {
    try {
      verifyV14Predecessor(description, input.artifactReceipt);
      schemaDigest = input.artifactReceipt.v14TableSchemaDigest;
    } catch {
      verifyCurrentCandidateSchema({
        description,
        artifactReceipt: input.artifactReceipt,
      });
      schemaDigest = input.artifactReceipt.currentCandidateTableSchemaDigest;
      appendAlreadyPublished = true;
    }
  } else {
    verifyCurrentCandidateSchema({
      description,
      artifactReceipt: input.artifactReceipt,
    });
    schemaDigest = input.artifactReceipt.currentCandidateTableSchemaDigest;
  }
  const plan = expectedCompileMode(input.lane);
  const expectedAtlasRelease = Object.freeze({
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
  });
  let status: PublisherStatus | undefined;
  if (!append || appendAlreadyPublished) {
    const reader = plan.statusKind === 'import'
      ? input.readImportStatus
      : input.readCutoverStatus;
    if (reader === undefined) fail('GREATER_REALM_PRODUCTION_PUBLISH_STATUS_READER_REQUIRED');
    const raw = await reader();
    const shape = plan.statusKind === 'import'
      ? projectGreaterRealmProductionImportStatus(raw)
      : projectGreaterRealmProductionCutoverStatusShape(raw);
    const observedMode = Object.freeze([
      shape.importMutationsCompiled,
      shape.activationMutationsCompiled,
    ] as const);
    const allowed = [plan.before, plan.after].some(mode => (
      mode !== undefined && mode[0] === observedMode[0] && mode[1] === observedMode[1]
    ));
    if (!allowed) fail('GREATER_REALM_PRODUCTION_PUBLISH_COMPILE_MODE_MISMATCH');
    status = projectPublisherStatus({
      value: raw,
      plan,
      mode: observedMode,
      expectedAtlasRelease,
    });
    if ('present' in status && status.present) {
      if (input.readCutoverStatus === undefined) {
        fail('GREATER_REALM_PRODUCTION_PUBLISH_RELEASE_AUTHORITY_READER_REQUIRED');
      }
      const authority = projectGreaterRealmProductionCutoverStatusShape(
        await input.readCutoverStatus(),
      );
      assertImportReleaseAuthority({
        status,
        authority,
        expectedAtlasRelease,
        mode: observedMode,
      });
    }
  }
  const historicalAggregateDigest = digestHistoricalAggregate(
    await input.readHistoricalAggregate(),
  );
  const audit = Object.freeze({
    historicalAggregateDigest,
    ...publisherArtifactAudit(input.artifactReceipt),
  });
  return Object.freeze({
    status: publisherJournalStatus({ append, schemaDigest, status }),
    audit,
    receiptStatus: publisherReceiptStatus({
      lane: input.lane,
      moduleDeltaPolicy: input.moduleDeltaPolicy,
      schemaDigest,
      status,
      historicalAggregateDigest,
    }),
    receiptAudit: audit,
  });
}

/**
 * Exact publisher state machine. All reads and the publish call are injected
 * so static and fake-transport tests exercise every guard without network I/O.
 */
export async function executeGreaterRealmProductionPublishLane(input: Readonly<{
  lane: GreaterRealmProductionPublishLane;
  flags?: GreaterRealmProductionReleaseFlags;
  expectedAtlasSourceCommit: string;
  expectedAtlasId: string;
  expectedPublicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  moduleDeltaPolicy: GreaterRealmProductionModuleDeltaPolicy;
  artifactReceipt: MigrationArtifactReceipt;
  readSchema: () => Promise<unknown>;
  readImportStatus?: () => Promise<unknown>;
  readCutoverStatus?: () => Promise<unknown>;
  readHistoricalAggregate: () => Promise<unknown>;
  assertCanStartWrite: () => void;
  publish: (writePermit?: GreaterRealmCutoverWritePermit) => Promise<void>;
  publishExecutableIdentity?: Readonly<{ path: string; digest: string }>;
  publishSupervisorIdentity?: GreaterRealmPublishSupervisorIdentity;
  operationJournal?: GreaterRealmCutoverOperationJournalChain;
  operationJournalLifecycle?: Readonly<{
    prepared: () => void;
    settled: () => void;
  }>;
  testOnlyDependencies?: Readonly<{
    verifyV14Predecessor?: typeof verifyGreaterRealmV14ProductionPredecessor;
    verifyCurrentCandidateSchema?: typeof verifyGreaterRealmCurrentCandidateProductionSchema;
    projectCutoverStatus?: typeof projectGreaterRealmProductionCutoverStatusForCompileMode;
    projectCutoverStatusShape?: typeof projectGreaterRealmProductionCutoverStatusShape;
  }>;
}>): Promise<GreaterRealmProductionPublishReceipt> {
  requireGreaterRealmProductionPublishLane(
    input.lane,
    input.flags ?? GREATER_REALM_PRODUCTION_RELEASE_FLAGS,
  );
  if (
    !/^[0-9a-f]{40}$/u.test(input.expectedAtlasSourceCommit)
    || !/^[0-9a-f]{40}$/u.test(input.moduleSourceCommit)
    || typeof input.expectedAtlasId !== 'string'
    || input.expectedAtlasId.length < 1
    || input.expectedAtlasId.length > 512
    || typeof input.expectedPublicReleaseId !== 'string'
    || input.expectedPublicReleaseId.length < 1
    || input.expectedPublicReleaseId.length > 512
    || !SHA256.test(input.expectedReleaseSha256)
  ) fail('GREATER_REALM_PRODUCTION_PUBLISH_SOURCE_PROVENANCE_INVALID');
  if (
    !SHA256.test(input.artifactReceipt.artifactDigest)
    || !SHA256.test(input.artifactReceipt.v14TableSchemaDigest)
    || !SHA256.test(input.artifactReceipt.v17TableSchemaDigest)
    || !SHA256.test(input.artifactReceipt.currentCandidateTableSchemaDigest)
  ) fail('GREATER_REALM_PRODUCTION_MIGRATION_RECEIPT_INVALID');

  const append = input.lane === GREATER_REALM_PRODUCTION_PUBLISH_LANE.APPEND_INERT_V17;
  if (input.moduleDeltaPolicy !== greaterRealmProductionModuleDeltaPolicy(input.lane)) {
    fail('GREATER_REALM_PRODUCTION_MODULE_DELTA_POLICY_INVALID');
  }
  const expectedAtlasRelease = Object.freeze({
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
  });
  const operationReceiptChain = () => input.operationJournal?.summary()
    ?? emptyGreaterRealmCutoverOperationReceiptChain({
      command: Object.freeze({ kind: 'publish', name: input.lane }),
      target: GREATER_REALM_CUTOVER_RECEIPT_TARGET,
      sourceRelease: Object.freeze({
        atlasSourceCommit: input.expectedAtlasSourceCommit,
        moduleSourceCommit: input.moduleSourceCommit,
        atlasId: input.expectedAtlasId,
        publicReleaseId: input.expectedPublicReleaseId,
        expectedReleaseSha256: input.expectedReleaseSha256,
      }),
    });
  const verifyV14Predecessor = input.testOnlyDependencies?.verifyV14Predecessor
    ?? verifyGreaterRealmV14ProductionPredecessor;
  const verifyCurrentCandidateSchema = input.testOnlyDependencies?.verifyCurrentCandidateSchema
    ?? verifyGreaterRealmCurrentCandidateProductionSchema;
  let predecessorSignatures: Readonly<Record<string, string>>;
  let beforeStatus: PublisherStatus | undefined;
  const plan = expectedCompileMode(input.lane);
  const statusReader = plan.statusKind === 'import'
    ? input.readImportStatus
    : input.readCutoverStatus;
  try {
    const beforeSchema = await input.readSchema();
    if (append) {
      predecessorSignatures = verifyV14Predecessor(
        beforeSchema,
        input.artifactReceipt,
      ).tableSignatures;
    } else {
      predecessorSignatures = verifyCurrentCandidateSchema({
        description: beforeSchema,
        artifactReceipt: input.artifactReceipt,
      }).tableSignatures;
      if (statusReader === undefined || plan.before === undefined) {
        fail('GREATER_REALM_PRODUCTION_PUBLISH_STATUS_READER_REQUIRED');
      }
      beforeStatus = projectPublisherStatus({
        value: await statusReader(),
        plan,
        mode: plan.before,
        expectedAtlasRelease,
        projectCutoverStatus: input.testOnlyDependencies?.projectCutoverStatus,
      });
      if ('present' in beforeStatus && beforeStatus.present) {
        if (input.readCutoverStatus === undefined) {
          fail('GREATER_REALM_PRODUCTION_PUBLISH_RELEASE_AUTHORITY_READER_REQUIRED');
        }
        const authority = (
          input.testOnlyDependencies?.projectCutoverStatusShape
          ?? projectGreaterRealmProductionCutoverStatusShape
        )(await input.readCutoverStatus());
        assertImportReleaseAuthority({
          status: beforeStatus,
          authority,
          expectedAtlasRelease,
          mode: plan.before,
        });
      }
    }
  } catch (error) {
    if (error instanceof GreaterRealmProductionPublisherError) throw error;
    fail('GREATER_REALM_PRODUCTION_PREPUBLICATION_INSPECTION_FAILED');
  }
  const beforeHistorical = await input.readHistoricalAggregate().catch(() => (
    fail('GREATER_REALM_PRODUCTION_PREPUBLICATION_AGGREGATE_FAILED')
  ));
  const historicalAggregateDigest = digestHistoricalAggregate(beforeHistorical);
  const beforeJournalStatus = publisherJournalStatus({
    append,
    schemaDigest: append
      ? input.artifactReceipt.v14TableSchemaDigest
      : input.artifactReceipt.currentCandidateTableSchemaDigest,
    status: beforeStatus,
  });
  const beforeJournalAudit = Object.freeze({
    historicalAggregateDigest,
    ...publisherArtifactAudit(input.artifactReceipt),
  });

  // A final read prevents a code-forward write derived from stale status.
  if (!append) {
    const rawFresh = await statusReader!().catch(() => (
      fail('GREATER_REALM_PRODUCTION_PREWRITE_INSPECTION_FAILED')
    ));
    const fresh = projectPublisherStatus({
      value: rawFresh,
      plan,
      mode: plan.before!,
      expectedAtlasRelease,
      projectCutoverStatus: input.testOnlyDependencies?.projectCutoverStatus,
    });
    if ('present' in fresh && fresh.present) {
      if (input.readCutoverStatus === undefined) {
        fail('GREATER_REALM_PRODUCTION_PUBLISH_RELEASE_AUTHORITY_READER_REQUIRED');
      }
      const authority = (
        input.testOnlyDependencies?.projectCutoverStatusShape
        ?? projectGreaterRealmProductionCutoverStatusShape
      )(await input.readCutoverStatus());
      assertImportReleaseAuthority({
        status: fresh,
        authority,
        expectedAtlasRelease,
        mode: plan.before!,
      });
    }
    if (statusWithoutCompileMode(fresh) !== statusWithoutCompileMode(beforeStatus!)) {
      fail('GREATER_REALM_PRODUCTION_PREWRITE_STATUS_CHANGED');
    }
  }

  const terminalExpectedAfterPredicate = createGreaterRealmCutoverExpectedAfterPredicate({
    moduleSourceCommit: input.moduleSourceCommit,
    contract: `publish-${input.lane}-v1`,
    statusRules: Object.freeze({
      schemaDigest: Object.freeze({
        rule: 'equals', value: input.artifactReceipt.currentCandidateTableSchemaDigest,
      }),
      ...(!append && 'stateDigest' in beforeJournalStatus
        ? {
            stateDigest: Object.freeze({
              rule: 'equals' as const,
              value: beforeJournalStatus.stateDigest,
            }),
          }
        : {}),
      importMutationsCompiled: Object.freeze({ rule: 'equals', value: plan.after[0] }),
      activationMutationsCompiled: Object.freeze({ rule: 'equals', value: plan.after[1] }),
    }),
    auditRules: Object.freeze({
      historicalAggregateDigest: Object.freeze({
        rule: 'equals', value: historicalAggregateDigest,
      }),
      ...Object.fromEntries(Object.entries(publisherArtifactAudit(input.artifactReceipt))
        .map(([key, value]) => [key, Object.freeze({ rule: 'equals' as const, value })])),
    }),
  });
  input.operationJournal?.bindCommandPlan({
    beforeStatus: beforeJournalStatus,
    beforeAudit: beforeJournalAudit,
    receiptBeforeStatus: publisherReceiptStatus({
      lane: input.lane,
      moduleDeltaPolicy: input.moduleDeltaPolicy,
      schemaDigest: beforeJournalStatus.schemaDigest as string,
      status: beforeStatus,
      historicalAggregateDigest,
    }),
    receiptBeforeAudit: beforeJournalAudit,
    terminalExpectedAfterPredicate,
  });
  const journalOperation = await input.operationJournal?.prepare({
    operationKind: 'publish',
    operationName: input.lane,
    arguments: Object.freeze({
      artifactDigest: input.artifactReceipt.artifactDigest,
      v17TableSchemaDigest: input.artifactReceipt.v17TableSchemaDigest,
      currentCandidateTableSchemaDigest:
        input.artifactReceipt.currentCandidateTableSchemaDigest,
      artifactReceipt: input.artifactReceipt,
    }),
    identity: Object.freeze({
      lane: input.lane,
      moduleDeltaPolicy: input.moduleDeltaPolicy,
      artifactDigest: input.artifactReceipt.artifactDigest,
      v14TableSchemaDigest: input.artifactReceipt.v14TableSchemaDigest,
      v17TableSchemaDigest: input.artifactReceipt.v17TableSchemaDigest,
      currentCandidateTableSchemaDigest:
        input.artifactReceipt.currentCandidateTableSchemaDigest,
      artifactReceipt: input.artifactReceipt,
      ...(input.publishExecutableIdentity === undefined
        ? {}
        : { publishExecutableIdentity: input.publishExecutableIdentity }),
      ...(input.publishSupervisorIdentity === undefined
        ? {}
        : { publishSupervisorIdentity: input.publishSupervisorIdentity }),
    }),
    beforeStatus: beforeJournalStatus,
    beforeAudit: beforeJournalAudit,
    expectedAfterPredicate: terminalExpectedAfterPredicate,
  });
  if (journalOperation !== undefined) input.operationJournalLifecycle?.prepared();

  let publishFailed = false;
  input.assertCanStartWrite();
  try {
    await input.publish(journalOperation?.writePermit);
  } catch (error) {
    if (isGreaterRealmCutoverWriteNotStartedError(error)) {
      const abandoned = await journalOperation?.abandonAfterRejectedPermit(error, async () => {
        const schemaDescription = await input.readSchema();
        let status: PublisherStatus | undefined;
        if (append) {
          verifyV14Predecessor(schemaDescription, input.artifactReceipt);
        } else {
          verifyCurrentCandidateSchema({
            description: schemaDescription,
            artifactReceipt: input.artifactReceipt,
          });
          status = projectPublisherStatus({
            value: await statusReader!(),
            plan,
            mode: plan.before!,
            expectedAtlasRelease,
            projectCutoverStatus: input.testOnlyDependencies?.projectCutoverStatus,
          });
        }
        return Object.freeze({
          status: publisherJournalStatus({
            append,
            schemaDigest: append
              ? input.artifactReceipt.v14TableSchemaDigest
              : input.artifactReceipt.currentCandidateTableSchemaDigest,
            status,
          }),
          audit: Object.freeze({
            historicalAggregateDigest: digestHistoricalAggregate(
              await input.readHistoricalAggregate(),
            ),
            ...publisherArtifactAudit(input.artifactReceipt),
          }),
        });
      });
      if (abandoned === true) input.operationJournalLifecycle?.settled();
      throw error;
    }
    if (isSpacetimePublishContainmentError(error)) {
      await journalOperation?.markManualAmbiguity({
        reason: 'containment-unproven',
        identity: Object.freeze({
          lane: input.lane,
          moduleDeltaPolicy: input.moduleDeltaPolicy,
          artifactDigest: input.artifactReceipt.artifactDigest,
          ...(input.publishExecutableIdentity === undefined
            ? {}
            : { publishExecutableIdentity: input.publishExecutableIdentity }),
          ...(input.publishSupervisorIdentity === undefined
            ? {}
            : { publishSupervisorIdentity: input.publishSupervisorIdentity }),
        }),
      });
      throw error;
    }
    publishFailed = true;
  }
  if (publishFailed && input.moduleDeltaPolicy === 'reviewed-same-schema') {
    // A same-schema/same-mode postflight cannot distinguish the old module
    // from the reviewed forward fix. Without a remotely stored module digest
    // or nonce, any submission error is irreducibly ambiguous.
    fail('GREATER_REALM_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS', true);
  }

  let postStatus: PublisherStatus;
  let postHistoricalAggregateDigest: string;
  try {
    verifyCurrentCandidateSchema({
      description: await input.readSchema(),
      artifactReceipt: input.artifactReceipt,
      predecessorSignatures,
    });
    if (statusReader === undefined) {
      fail('GREATER_REALM_PRODUCTION_PUBLISH_STATUS_READER_REQUIRED', true);
    }
    postStatus = projectPublisherStatus({
      value: await statusReader(),
      plan,
      mode: plan.after,
      expectedAtlasRelease,
      projectCutoverStatus: input.testOnlyDependencies?.projectCutoverStatus,
    });
    if ('present' in postStatus && postStatus.present) {
      if (input.readCutoverStatus === undefined) {
        fail('GREATER_REALM_PRODUCTION_PUBLISH_RELEASE_AUTHORITY_READER_REQUIRED', true);
      }
      const authority = (
        input.testOnlyDependencies?.projectCutoverStatusShape
        ?? projectGreaterRealmProductionCutoverStatusShape
      )(await input.readCutoverStatus());
      assertImportReleaseAuthority({
        status: postStatus,
        authority,
        expectedAtlasRelease,
        mode: plan.after,
      });
    }
    if (!append && statusWithoutCompileMode(postStatus) !== statusWithoutCompileMode(beforeStatus!)) {
      fail('GREATER_REALM_PRODUCTION_FORWARD_FIX_CHANGED_STATE', true);
    }
    const afterHistorical = await input.readHistoricalAggregate();
    postHistoricalAggregateDigest = digestHistoricalAggregate(afterHistorical);
    if (postHistoricalAggregateDigest !== historicalAggregateDigest) {
      fail('GREATER_REALM_PRODUCTION_HISTORICAL_AGGREGATE_CHANGED', true);
    }
  } catch (error) {
    fail('GREATER_REALM_PRODUCTION_PUBLISH_OUTCOME_AMBIGUOUS', true);
  }

  await journalOperation?.reconcile({
    afterStatus: publisherJournalStatus({
      append,
      schemaDigest: input.artifactReceipt.currentCandidateTableSchemaDigest,
      status: postStatus,
    }),
    afterAudit: Object.freeze({
      historicalAggregateDigest: postHistoricalAggregateDigest!,
      ...publisherArtifactAudit(input.artifactReceipt),
    }),
    outcome: publishFailed ? 'verified-after-submission-error' : 'verified',
  });
  input.operationJournal?.reconcileCommand({
    afterStatus: publisherJournalStatus({
      append,
      schemaDigest: input.artifactReceipt.currentCandidateTableSchemaDigest,
      status: postStatus,
    }),
    afterAudit: Object.freeze({
      historicalAggregateDigest: postHistoricalAggregateDigest!,
      ...publisherArtifactAudit(input.artifactReceipt),
    }),
    receiptAfterStatus: publisherReceiptStatus({
      lane: input.lane,
      moduleDeltaPolicy: input.moduleDeltaPolicy,
      schemaDigest: input.artifactReceipt.currentCandidateTableSchemaDigest,
      status: postStatus,
      historicalAggregateDigest: postHistoricalAggregateDigest!,
    }),
    receiptAfterAudit: Object.freeze({
      historicalAggregateDigest: postHistoricalAggregateDigest!,
      ...publisherArtifactAudit(input.artifactReceipt),
    }),
  });
  if (journalOperation !== undefined) input.operationJournalLifecycle?.settled();

  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-publish-v1',
    lane: input.lane,
    outcome: publishFailed ? 'verified-after-submission-error' : 'verified',
    target: GREATER_REALM_PRODUCTION_PUBLISH_TARGET,
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
    moduleSourceCommit: input.moduleSourceCommit,
    moduleDeltaPolicy: input.moduleDeltaPolicy,
    artifactDigest: input.artifactReceipt.artifactDigest,
    v14TableSchemaDigest: input.artifactReceipt.v14TableSchemaDigest,
    v17TableSchemaDigest: input.artifactReceipt.v17TableSchemaDigest,
    currentCandidateTableSchemaDigest:
      input.artifactReceipt.currentCandidateTableSchemaDigest,
    predecessorTableCount: append ? 56 : 86,
    postTableCount: 86,
    schemaMutation: append ? 'append-30' : 'none',
    importMutationsCompiled: postStatus.importMutationsCompiled,
    activationMutationsCompiled: postStatus.activationMutationsCompiled,
    releaseState: releaseState(postStatus),
    ...(activationMode(postStatus) === undefined
      ? {}
      : { activationMode: activationMode(postStatus) }),
    historicalAggregateDigest,
    ...operationReceiptChain(),
  });
}

export const greaterRealmProductionPublisherTestSeams = Object.freeze({
  canonicalJson,
  digestHistoricalAggregate,
  expectedCompileMode,
  signatures,
  statusWithoutCompileMode,
});
