import { createHash } from 'node:crypto';

import {
  verifyGreaterRealmRuntimeReleaseArtifacts,
  type GreaterRealmRuntimeReleaseArtifacts,
} from './atlas/greater-realm-runtime-release';
import {
  projectGreaterRealmProductionCutoverStatusShape,
  type GreaterRealmProductionCutoverStatus,
} from './greater-realm-production-relocation-core';

export const GREATER_REALM_PRODUCTION_IMPORT_REDUCERS = Object.freeze({
  stage: 'admin_stage_greater_realm_release_v1',
  components: 'admin_import_greater_realm_components_v1',
  regions: 'admin_import_greater_realm_regions_v1',
  chunk: 'admin_import_greater_realm_chunk_v1',
  beginVerification: 'admin_begin_greater_realm_verification_v1',
  verifyBatch: 'admin_verify_greater_realm_batch_v1',
  finalize: 'admin_finalize_greater_realm_release_v1',
} as const);

export const GREATER_REALM_PRODUCTION_IMPORT_LIMITS = Object.freeze({
  componentRows: 128,
  regionRows: 6,
  verifyRows: 256,
  maximumOperations: 4_096,
} as const);

const SHA256 = /^[0-9a-f]{64}$/u;
const SOURCE_COMMIT = /^[0-9a-f]{40}$/u;
const VERIFY_DIGEST = /^(?:[0-9a-f]{64}|sha256-v1:[0-9a-f]{64}:[0-9]+:.*)$/u;
const U64_MAXIMUM = (1n << 64n) - 1n;

export type GreaterRealmProductionImportStatus = Readonly<{
  present: boolean;
  atlasId?: string;
  publicReleaseId?: string;
  state: 'absent' | 'importing' | 'verifying' | 'ready' | 'canary' | 'active' | 'halted' | 'rolled-back';
  importEpoch?: bigint;
  verificationPhase: 'components' | 'chunks' | 'cells' | 'component-slots' | 'slots' | 'component-resources' | 'resources' | 'component-finalize' | 'complete';
  verificationCursor: bigint;
  verificationDigest: string;
  expectedComponentCount: number;
  expectedChunkCount: number;
  expectedCellCount: number;
  expectedSlotCount: number;
  expectedResourceNodeCount: number;
  regionManifestRows: number;
  componentRows: bigint;
  chunkRows: bigint;
  cellRows: bigint;
  slotRows: bigint;
  resourceRows: bigint;
  claimRows: bigint;
  occupancyRows: bigint;
  activationRows: bigint;
  publicAtlasRows: bigint;
  publicRegionRows: bigint;
  workerSystemRows: bigint;
  importsExact: boolean;
  ready: boolean;
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
}>;

export type GreaterRealmProductionImportReducer =
  typeof GREATER_REALM_PRODUCTION_IMPORT_REDUCERS[keyof typeof GREATER_REALM_PRODUCTION_IMPORT_REDUCERS];

export type GreaterRealmProductionImportTransport = Readonly<{
  /** Every call is an independent transaction on the owner-scoped session. */
  inspect: () => Promise<unknown>;
  /** Independent exact release-identity/status projection transaction. */
  inspectAuthority: () => Promise<unknown>;
  /** One reducer transaction; transport failures are never retried here. */
  submit: (
    reducer: GreaterRealmProductionImportReducer,
    arguments_: Readonly<Record<string, unknown>>,
  ) => Promise<void>;
}>;

export type GreaterRealmProductionImportOutcome =
  | 'ready'
  | 'already-ready'
  | 'verified-after-submission-error';

export type GreaterRealmProductionImportReceipt = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-greater-realm-production-import-v1';
  outcome: GreaterRealmProductionImportOutcome;
  atlasId: string;
  publicReleaseId: string;
  atlasSourceCommit: string;
  moduleSourceCommit: string;
  importEpoch: string;
  expectedReleaseSha256: string;
  verificationDigest: string;
  operationsSubmitted: number;
  postcondition: 'ready-import-only';
}>;

export class GreaterRealmProductionImportError extends Error {
  constructor(
    readonly code: string,
    readonly submitted = false,
  ) {
    super(code);
    this.name = 'GreaterRealmProductionImportError';
  }
}

function fail(code: string, submitted = false): never {
  throw new GreaterRealmProductionImportError(code, submitted);
}

function exactKeys(value: Readonly<Record<string, unknown>>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function record(value: unknown, code: string): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail(code);
  return value as Readonly<Record<string, unknown>>;
}

function readBoolean(value: unknown, code: string): boolean {
  if (value === true || value === false) return value;
  fail(code);
}

function readString(value: unknown, code: string, optional = false): string | undefined {
  if (value === undefined && optional) return undefined;
  if (typeof value !== 'string' || value.length < 1 || value.length > 512) fail(code);
  return value;
}

function readU64(value: unknown, code: string, optional = false): bigint | undefined {
  if (value === undefined && optional) return undefined;
  const parsed = typeof value === 'bigint'
    ? value
    : typeof value === 'number' && Number.isSafeInteger(value)
      ? BigInt(value)
      : typeof value === 'string' && /^(?:0|[1-9][0-9]*)$/u.test(value)
        ? BigInt(value)
        : undefined;
  if (parsed === undefined || parsed < 0n || parsed > U64_MAXIMUM) fail(code);
  return parsed;
}

function readU32(value: unknown, code: string): number {
  const parsed = readU64(value, code);
  if (parsed === undefined || parsed > 0xffff_ffffn) fail(code);
  return Number(parsed);
}

const STATUS_KEYS = Object.freeze([
  'present',
  'atlasId',
  'publicReleaseId',
  'state',
  'importEpoch',
  'verificationPhase',
  'verificationCursor',
  'verificationDigest',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'resourceRows',
  'claimRows',
  'occupancyRows',
  'activationRows',
  'publicAtlasRows',
  'publicRegionRows',
  'workerSystemRows',
  'importsExact',
  'ready',
  'importMutationsCompiled',
  'activationMutationsCompiled',
] as const);

const RELEASE_STATES = Object.freeze([
  'absent', 'importing', 'verifying', 'ready', 'canary', 'active', 'halted', 'rolled-back',
] as const);
const VERIFY_PHASES = Object.freeze([
  'components', 'chunks', 'cells', 'component-slots', 'slots',
  'component-resources', 'resources', 'component-finalize', 'complete',
] as const);

/** Strictly projects the bounded import status; extra fields fail closed. */
export function projectGreaterRealmProductionImportStatus(
  value: unknown,
): GreaterRealmProductionImportStatus {
  const status = record(value, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID');
  if (!exactKeys(status, STATUS_KEYS)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_STATUS_SHAPE_CHANGED');
  }
  if (!RELEASE_STATES.includes(status.state as never)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  if (!VERIFY_PHASES.includes(status.verificationPhase as never)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID');
  }
  const projected = Object.freeze({
    present: readBoolean(status.present, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    atlasId: readString(status.atlasId, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID', true),
    publicReleaseId: readString(status.publicReleaseId, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID', true),
    state: status.state as GreaterRealmProductionImportStatus['state'],
    importEpoch: readU64(status.importEpoch, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID', true),
    verificationPhase: status.verificationPhase as GreaterRealmProductionImportStatus['verificationPhase'],
    verificationCursor: readU64(status.verificationCursor, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    verificationDigest: readString(status.verificationDigest, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    expectedComponentCount: readU32(status.expectedComponentCount, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    expectedChunkCount: readU32(status.expectedChunkCount, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    expectedCellCount: readU32(status.expectedCellCount, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    expectedSlotCount: readU32(status.expectedSlotCount, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    expectedResourceNodeCount: readU32(status.expectedResourceNodeCount, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    regionManifestRows: readU32(status.regionManifestRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    componentRows: readU64(status.componentRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    chunkRows: readU64(status.chunkRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    cellRows: readU64(status.cellRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    slotRows: readU64(status.slotRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    resourceRows: readU64(status.resourceRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    claimRows: readU64(status.claimRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    occupancyRows: readU64(status.occupancyRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    activationRows: readU64(status.activationRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    publicAtlasRows: readU64(status.publicAtlasRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    publicRegionRows: readU64(status.publicRegionRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    workerSystemRows: readU64(status.workerSystemRows, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID')!,
    importsExact: readBoolean(status.importsExact, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    ready: readBoolean(status.ready, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    importMutationsCompiled: readBoolean(status.importMutationsCompiled, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
    activationMutationsCompiled: readBoolean(status.activationMutationsCompiled, 'GREATER_REALM_PRODUCTION_IMPORT_STATUS_INVALID'),
  });
  if (
    projected.present !== (projected.state !== 'absent')
    || projected.present !== (projected.atlasId !== undefined)
    || projected.present !== (projected.publicReleaseId !== undefined)
    || projected.present !== (projected.importEpoch !== undefined)
    || (!projected.present && (
      projected.expectedComponentCount !== 0
      || projected.expectedChunkCount !== 0
      || projected.expectedCellCount !== 0
      || projected.expectedSlotCount !== 0
      || projected.expectedResourceNodeCount !== 0
      || projected.componentRows !== 0n
      || projected.chunkRows !== 0n
      || projected.cellRows !== 0n
      || projected.slotRows !== 0n
      || projected.resourceRows !== 0n
    ))
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_STATUS_INCONSISTENT');
  return projected;
}

function sha256(value: Uint8Array | string): string {
  return createHash('sha256').update(value).digest('hex');
}

function canonicalJsonText(value: unknown): string {
  return `${JSON.stringify(value, (_key, child) => (
    typeof child === 'bigint' ? child.toString() : child
  ))}\n`;
}

const HEADER_KEYS = Object.freeze([
  'schema', 'classification', 'atlasId', 'publicReleaseId',
  'publicApprovalReceiptId', 'sourceCommit', 'generatorVersion',
  'sourceFormatVersion', 'livingWorldVersion', 'runtimePartitionVersion',
  'rendererContractVersion', 'visibleTierMax', 'totals', 'legacyLowlandsBridge',
] as const);

function releaseHeader(manifest: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  const keys = Object.keys(manifest);
  if (
    keys.length !== HEADER_KEYS.length + 4
    || HEADER_KEYS.some((key, index) => keys[index] !== key)
    || keys.at(-4) !== 'regions'
    || keys.at(-3) !== 'components'
    || keys.at(-2) !== 'chunks'
    || keys.at(-1) !== 'releaseSha256'
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_ORDER_CHANGED');
  return Object.freeze(Object.fromEntries(HEADER_KEYS.map(key => [key, manifest[key]])));
}

function wireComponent(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    componentKey: row.componentKey,
    componentOrdinal: row.componentOrdinal,
    regionMask: row.regionMask,
    rootCellKey: row.rootCellKey,
    expectedCellCount: row.expectedCellCount,
    maxRouteDepth: row.maxRouteDepth,
    expectedSlotCount: row.expectedSlotCount,
    expectedFoodNodeCount: row.expectedFoodNodeCount,
    expectedWoodNodeCount: row.expectedWoodNodeCount,
    expectedStoneNodeCount: row.expectedStoneNodeCount,
    expectedGoldNodeCount: row.expectedGoldNodeCount,
    componentSha256: row.componentSha256,
  });
}

function wireRegion(row: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> {
  return Object.freeze({
    regionId: row.regionId,
    publicName: row.publicName,
    ordinal: row.ordinal,
    tier: row.tier,
    cellCount: row.cellCount,
    passableCellCount: row.passableCellCount,
    chunkCount: row.chunkCount,
    castleCapacity: row.castleCapacity,
    resourceLocationCount: row.resourceLocationCount,
    resourceNodeCount: row.resourceNodeCount,
    foodNodeCount: row.foodNodeCount,
    woodNodeCount: row.woodNodeCount,
    stoneNodeCount: row.stoneNodeCount,
    goldNodeCount: row.goldNodeCount,
    active: row.active,
  });
}

type ImportAuthority = Readonly<{
  atlasId: string;
  publicReleaseId: string;
  publicApprovalReceiptId: string;
  sourceCommit: string;
  releaseSha256: string;
  totals: Readonly<{
    regionCount: number;
    componentCount: number;
    chunkCount: number;
    cellCount: number;
    castleSlotCount: number;
    resourceNodeCount: number;
  }>;
  components: readonly Readonly<Record<string, unknown>>[];
  regions: readonly Readonly<Record<string, unknown>>[];
  headerJson: string;
}>;

function importAuthority(
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
  verifyArtifacts: (artifacts: GreaterRealmRuntimeReleaseArtifacts) => void =
    verifyGreaterRealmRuntimeReleaseArtifacts,
): ImportAuthority {
  verifyArtifacts(artifacts);
  const manifest = record(artifacts.manifest, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID');
  const totalsRecord = record(manifest.totals, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID');
  const components = manifest.components;
  const regions = manifest.regions;
  const total = (key: string): number => readU32(
    totalsRecord[key],
    'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID',
  );
  if (!Array.isArray(components) || !Array.isArray(regions)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID');
  }
  const authority = Object.freeze({
    atlasId: readString(manifest.atlasId, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID')!,
    publicReleaseId: readString(manifest.publicReleaseId, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID')!,
    publicApprovalReceiptId: readString(manifest.publicApprovalReceiptId, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID')!,
    sourceCommit: readString(manifest.sourceCommit, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID')!,
    releaseSha256: readString(manifest.releaseSha256, 'GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID')!,
    totals: Object.freeze({
      regionCount: total('regionCount'),
      componentCount: total('componentCount'),
      chunkCount: total('chunkCount'),
      cellCount: total('cellCount'),
      castleSlotCount: total('castleSlotCount'),
      resourceNodeCount: total('resourceNodeCount'),
    }),
    components: Object.freeze((components as Readonly<Record<string, unknown>>[]).map(wireComponent)),
    regions: Object.freeze((regions as Readonly<Record<string, unknown>>[]).map(wireRegion)),
    headerJson: canonicalJsonText(releaseHeader(manifest)),
  });
  if (
    !SHA256.test(authority.releaseSha256)
    || !SOURCE_COMMIT.test(authority.sourceCommit)
    || authority.totals.regionCount !== authority.regions.length
    || authority.totals.componentCount !== authority.components.length
    || authority.totals.chunkCount !== artifacts.chunks.length
    || authority.totals.castleSlotCount !== 600
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_MANIFEST_INVALID');
  return authority;
}

function statusMatchesRelease(
  status: GreaterRealmProductionImportStatus,
  authority: ImportAuthority,
  importEpoch: bigint,
): boolean {
  return status.present
    && status.atlasId === authority.atlasId
    && status.publicReleaseId === authority.publicReleaseId
    && status.importEpoch === importEpoch
    && status.expectedComponentCount === authority.totals.componentCount
    && status.expectedChunkCount === authority.totals.chunkCount
    && status.expectedCellCount === authority.totals.cellCount
    && status.expectedSlotCount === authority.totals.castleSlotCount
    && status.expectedResourceNodeCount === authority.totals.resourceNodeCount;
}

function assertAuthorityAgreement(
  status: GreaterRealmProductionImportStatus,
  cutover: GreaterRealmProductionCutoverStatus,
  authority: ImportAuthority,
  importEpoch: bigint,
): void {
  const present = status.present;
  if (
    cutover.importMutationsCompiled !== status.importMutationsCompiled
    || cutover.activationMutationsCompiled !== status.activationMutationsCompiled
    || cutover.releaseRows !== (present ? 1n : 0n)
    || cutover.releasePresent !== present
    || cutover.releaseState !== status.state
    || cutover.atlasId !== status.atlasId
    || cutover.publicReleaseId !== status.publicReleaseId
    || cutover.importEpoch !== status.importEpoch
    || cutover.componentRows !== status.componentRows
    || cutover.chunkRows !== status.chunkRows
    || cutover.cellRows !== status.cellRows
    || cutover.slotRows !== status.slotRows
    || cutover.resourceNodeRows !== status.resourceRows
    || cutover.regionManifestRows !== status.regionManifestRows
    || cutover.greaterRealmClaimRows !== status.claimRows
    || cutover.greaterRealmOccupancyRows !== status.occupancyRows
    || cutover.activationRows !== status.activationRows
    || cutover.atlasRows !== status.publicAtlasRows
    || cutover.visibleRegionRows !== status.publicRegionRows
    || cutover.workerSystemV2Rows !== status.workerSystemRows
    || cutover.releaseImportsExact !== status.importsExact
    || cutover.releaseReady !== status.ready
    || (present && (
      cutover.sourceCommit !== authority.sourceCommit
      || cutover.expectedReleaseSha256 !== authority.releaseSha256
      || cutover.releaseHeaderSha256 !== sha256(authority.headerJson)
      || cutover.expectedRegionCount !== authority.totals.regionCount
      || cutover.expectedComponentCount !== authority.totals.componentCount
      || cutover.expectedChunkCount !== authority.totals.chunkCount
      || cutover.expectedCellCount !== authority.totals.cellCount
      || cutover.expectedSlotCount !== authority.totals.castleSlotCount
      || cutover.expectedResourceNodeCount !== authority.totals.resourceNodeCount
      || cutover.importEpoch !== importEpoch
      || cutover.verificationPhase !== status.verificationPhase
      || cutover.verificationCursor !== status.verificationCursor
      || cutover.verificationDigest !== status.verificationDigest
    ))
    || (!present && (
      cutover.sourceCommit !== undefined
      || cutover.expectedReleaseSha256 !== undefined
      || cutover.releaseHeaderSha256 !== undefined
      || cutover.expectedRegionCount !== 0
      || cutover.expectedComponentCount !== 0
      || cutover.expectedChunkCount !== 0
      || cutover.expectedCellCount !== 0
      || cutover.expectedSlotCount !== 0
      || cutover.expectedResourceNodeCount !== 0
    ))
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_AUTHORITY_STATUS_MISMATCH');
}

function assertImportOnlyStatus(
  status: GreaterRealmProductionImportStatus,
  authority: ImportAuthority,
  importEpoch: bigint,
): void {
  if (!status.importMutationsCompiled || status.activationMutationsCompiled) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_COMPILE_MODE_INVALID');
  }
  if (status.present && !statusMatchesRelease(status, authority, importEpoch)) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_RELEASE_CONFLICT');
  }
  if (
    status.ready !== (status.state === 'ready')
    || status.componentRows > BigInt(authority.totals.componentCount)
    || status.chunkRows > BigInt(authority.totals.chunkCount)
    || status.cellRows > BigInt(authority.totals.cellCount)
    || status.slotRows > BigInt(authority.totals.castleSlotCount)
    || status.resourceRows > BigInt(authority.totals.resourceNodeCount)
    || status.regionManifestRows > authority.totals.regionCount
    ||
    status.claimRows !== 0n
    || status.occupancyRows !== 0n
    || status.activationRows !== 0n
    || status.publicAtlasRows !== 0n
    || status.publicRegionRows !== 0n
    || status.workerSystemRows !== 0n
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_PREMATURE_ACTIVATION');
}

async function inspectBoundImportStatus(input: Readonly<{
  transport: GreaterRealmProductionImportTransport;
  authority: ImportAuthority;
  importEpoch: bigint;
  unavailableCode: string;
  submitted: boolean;
  projectAuthorityStatus: (value: unknown) => GreaterRealmProductionCutoverStatus;
}>): Promise<Readonly<{
  status: GreaterRealmProductionImportStatus;
  authorityStatus: GreaterRealmProductionCutoverStatus;
}>> {
  try {
    const status = projectGreaterRealmProductionImportStatus(
      await input.transport.inspect(),
    );
    const authorityStatus = input.projectAuthorityStatus(
      await input.transport.inspectAuthority(),
    );
    assertImportOnlyStatus(status, input.authority, input.importEpoch);
    assertAuthorityAgreement(
      status,
      authorityStatus,
      input.authority,
      input.importEpoch,
    );
    return Object.freeze({ status, authorityStatus });
  } catch (error) {
    if (error instanceof GreaterRealmProductionImportError) throw error;
    fail(input.unavailableCode, input.submitted);
  }
}

/** Read-only identity/manifest binding used by the operator's inspect command. */
export function verifyGreaterRealmProductionImportAuthority(input: Readonly<{
  statusValue: unknown;
  authorityStatusValue: unknown;
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  importEpoch: bigint;
  testOnlyDependencies?: Readonly<{
    verifyArtifacts?: (artifacts: GreaterRealmRuntimeReleaseArtifacts) => void;
    projectAuthorityStatus?: (value: unknown) => GreaterRealmProductionCutoverStatus;
  }>;
}>): GreaterRealmProductionImportStatus {
  const authority = importAuthority(
    input.artifacts,
    input.testOnlyDependencies?.verifyArtifacts ?? verifyGreaterRealmRuntimeReleaseArtifacts,
  );
  const status = projectGreaterRealmProductionImportStatus(input.statusValue);
  const authorityStatus = (
    input.testOnlyDependencies?.projectAuthorityStatus
      ?? projectGreaterRealmProductionCutoverStatusShape
  )(input.authorityStatusValue);
  assertImportOnlyStatus(status, authority, input.importEpoch);
  assertAuthorityAgreement(status, authorityStatus, authority, input.importEpoch);
  return status;
}

function readyPostcondition(
  status: GreaterRealmProductionImportStatus,
  authority: ImportAuthority,
  importEpoch: bigint,
): boolean {
  return statusMatchesRelease(status, authority, importEpoch)
    && status.state === 'ready'
    && status.verificationPhase === 'complete'
    && status.verificationCursor === 0n
    && SHA256.test(status.verificationDigest)
    && status.importsExact
    && status.ready
    && status.componentRows === BigInt(authority.totals.componentCount)
    && status.chunkRows === BigInt(authority.totals.chunkCount)
    && status.cellRows === BigInt(authority.totals.cellCount)
    && status.slotRows === BigInt(authority.totals.castleSlotCount)
    && status.resourceRows === BigInt(authority.totals.resourceNodeCount)
    && status.regionManifestRows === authority.totals.regionCount
    && status.claimRows === 0n
    && status.occupancyRows === 0n
    && status.activationRows === 0n
    && status.publicAtlasRows === 0n
    && status.publicRegionRows === 0n
    && status.workerSystemRows === 0n;
}

type PlannedImportOperation = Readonly<{
  reducer: GreaterRealmProductionImportReducer;
  arguments: Readonly<Record<string, unknown>>;
}>;

const VERIFIED_COUNT_FIELDS = Object.freeze([
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
] as const);

const VERIFICATION_PHASE_ORDER = Object.freeze([
  'components', 'chunks', 'cells', 'component-slots', 'slots',
  'component-resources', 'resources', 'component-finalize', 'complete',
] as const);

function unchangedStatusExcept(
  before: GreaterRealmProductionImportStatus,
  after: GreaterRealmProductionImportStatus,
  allowed: ReadonlySet<keyof GreaterRealmProductionImportStatus>,
): boolean {
  return STATUS_KEYS.every(field => allowed.has(field) || before[field] === after[field]);
}

function verifiedCountsUnchanged(
  before: GreaterRealmProductionCutoverStatus,
  after: GreaterRealmProductionCutoverStatus,
  changed?: Readonly<{ field: typeof VERIFIED_COUNT_FIELDS[number]; value: number }>,
): boolean {
  return VERIFIED_COUNT_FIELDS.every(field => (
    after[field] === (changed?.field === field ? changed.value : before[field])
  ));
}

function importedCountsExact(
  status: GreaterRealmProductionImportStatus,
  authority: ImportAuthority,
): boolean {
  return status.componentRows === BigInt(authority.totals.componentCount)
    && status.regionManifestRows === authority.totals.regionCount
    && status.chunkRows === BigInt(authority.totals.chunkCount)
    && status.cellRows === BigInt(authority.totals.cellCount)
    && status.slotRows === BigInt(authority.totals.castleSlotCount)
    && status.resourceRows === BigInt(authority.totals.resourceNodeCount);
}

function numberFromOperation(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : undefined;
}

/** Exact per-reducer proof used for both acknowledged and ambiguous writes. */
function importOperationPostcondition(input: Readonly<{
  operation: PlannedImportOperation;
  before: GreaterRealmProductionImportStatus;
  after: GreaterRealmProductionImportStatus;
  beforeAuthority: GreaterRealmProductionCutoverStatus;
  afterAuthority: GreaterRealmProductionCutoverStatus;
  authority: ImportAuthority;
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
}>): boolean {
  const { operation, before, after, beforeAuthority, afterAuthority, authority } = input;
  const only = (...fields: readonly (keyof GreaterRealmProductionImportStatus)[]) => (
    unchangedStatusExcept(before, after, new Set(fields))
  );
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.stage) {
    return only(
      'present', 'atlasId', 'publicReleaseId', 'state', 'importEpoch',
      'verificationDigest', 'expectedComponentCount', 'expectedChunkCount',
      'expectedCellCount', 'expectedSlotCount', 'expectedResourceNodeCount',
    )
      && after.present
      && after.state === 'importing'
      && after.atlasId === authority.atlasId
      && after.publicReleaseId === authority.publicReleaseId
      && after.verificationDigest !== before.verificationDigest
      && VERIFY_DIGEST.test(after.verificationDigest)
      && !after.importsExact
      && !after.ready
      && afterAuthority.componentExpectedCellCount === 0
      && afterAuthority.componentExpectedSlotCount === 0
      && afterAuthority.componentExpectedResourceNodeCount === 0
      && afterAuthority.importedPassableCellCount === 0
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components) {
    const rows = operation.arguments.rows;
    if (!Array.isArray(rows) || rows.length < 1) return false;
    const sum = (field: string): number | undefined => {
      let total = 0;
      for (const value of rows) {
        if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
        const row = value as Readonly<Record<string, unknown>>;
        const amount = numberFromOperation(row[field]);
        if (amount === undefined) return undefined;
        total += amount;
        if (!Number.isSafeInteger(total)) return undefined;
      }
      return total;
    };
    const cells = sum('expectedCellCount');
    const slots = sum('expectedSlotCount');
    const food = sum('expectedFoodNodeCount');
    const wood = sum('expectedWoodNodeCount');
    const stone = sum('expectedStoneNodeCount');
    const gold = sum('expectedGoldNodeCount');
    if ([cells, slots, food, wood, stone, gold].some(value => value === undefined)) return false;
    return only('componentRows')
      && after.componentRows === before.componentRows + BigInt(rows.length)
      && afterAuthority.componentExpectedCellCount
        === beforeAuthority.componentExpectedCellCount + cells!
      && afterAuthority.componentExpectedSlotCount
        === beforeAuthority.componentExpectedSlotCount + slots!
      && afterAuthority.componentExpectedResourceNodeCount
        === beforeAuthority.componentExpectedResourceNodeCount + food! + wood! + stone! + gold!
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.regions) {
    const rows = operation.arguments.rows;
    return Array.isArray(rows)
      && rows.length > 0
      && only('regionManifestRows')
      && after.regionManifestRows === before.regionManifestRows + rows.length
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk) {
    const artifact = input.artifacts.chunks[Number(before.chunkRows)];
    if (artifact === undefined) return false;
    const { cells, castleSlots, resourceNodes } = artifact.payload;
    if (!Array.isArray(cells) || !Array.isArray(castleSlots) || !Array.isArray(resourceNodes)) {
      return false;
    }
    const passableCells = cells.filter(cell => cell.passable).length;
    return only('chunkRows', 'cellRows', 'slotRows', 'resourceRows', 'importsExact')
      && after.chunkRows === before.chunkRows + 1n
      && after.cellRows === before.cellRows + BigInt(cells.length)
      && after.slotRows === before.slotRows + BigInt(castleSlots.length)
      && after.resourceRows === before.resourceRows + BigInt(resourceNodes.length)
      && after.importsExact === importedCountsExact(after, authority)
      && afterAuthority.importedPassableCellCount
        === beforeAuthority.importedPassableCellCount + passableCells
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.beginVerification) {
    return only('state', 'verificationPhase', 'verificationCursor', 'verificationDigest')
      && before.state === 'importing'
      && before.importsExact
      && after.state === 'verifying'
      && after.verificationPhase === 'components'
      && after.verificationCursor === 0n
      && after.verificationDigest !== before.verificationDigest
      && VERIFY_DIGEST.test(after.verificationDigest)
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch) {
    if (before.state !== 'verifying' || before.verificationPhase === 'complete') return false;
    const requestedRows = numberFromOperation(operation.arguments.requestedRows);
    if (requestedRows === undefined || requestedRows < 1) return false;
    const phase = before.verificationPhase;
    const total = phase === 'components' || phase === 'component-slots'
      || phase === 'component-resources' || phase === 'component-finalize'
      ? before.expectedComponentCount
      : phase === 'chunks' ? before.expectedChunkCount
        : phase === 'cells' ? before.expectedCellCount
          : phase === 'slots' ? before.expectedSlotCount
            : before.expectedResourceNodeCount;
    const start = Number(before.verificationCursor);
    if (!Number.isSafeInteger(start) || start < 0 || start > total) return false;
    const end = Math.min(total, start + requestedRows);
    const reachedEnd = end === total;
    const phaseIndex = VERIFICATION_PHASE_ORDER.indexOf(phase);
    const expectedPhase = reachedEnd
      ? VERIFICATION_PHASE_ORDER[phaseIndex + 1]
      : phase;
    if (expectedPhase === undefined) return false;
    const expectedCursor = BigInt(reachedEnd ? 0 : end);
    const verifiedField = phase === 'components' ? 'verifiedComponentCount'
      : phase === 'chunks' ? 'verifiedChunkCount'
        : phase === 'cells' ? 'verifiedCellCount'
          : phase === 'slots' ? 'verifiedSlotCount'
            : phase === 'resources' ? 'verifiedResourceNodeCount'
              : undefined;
    if (verifiedField !== undefined && beforeAuthority[verifiedField] !== start) return false;
    return only('verificationPhase', 'verificationCursor', 'verificationDigest')
      && after.state === 'verifying'
      && after.verificationPhase === expectedPhase
      && after.verificationCursor === expectedCursor
      && VERIFY_DIGEST.test(after.verificationDigest)
      && (end === start || after.verificationDigest !== before.verificationDigest)
      && verifiedCountsUnchanged(
        beforeAuthority,
        afterAuthority,
        verifiedField === undefined ? undefined : { field: verifiedField, value: end },
      );
  }
  if (operation.reducer === GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize) {
    return only('state', 'ready')
      && before.state === 'verifying'
      && before.verificationPhase === 'complete'
      && after.state === 'ready'
      && after.ready
      && verifiedCountsUnchanged(beforeAuthority, afterAuthority);
  }
  return false;
}

function planNextOperation(
  status: GreaterRealmProductionImportStatus,
  authority: ImportAuthority,
  artifacts: GreaterRealmRuntimeReleaseArtifacts,
  importEpoch: bigint,
  publicName: string,
): PlannedImportOperation | undefined {
  if (!status.present) {
    return Object.freeze({
      reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.stage,
      arguments: Object.freeze({
        atlasId: authority.atlasId,
        publicReleaseId: authority.publicReleaseId,
        publicApprovalReceiptId: authority.publicApprovalReceiptId,
        sourceCommit: authority.sourceCommit,
        generatorVersion: artifacts.manifest.generatorVersion,
        sourceFormatVersion: artifacts.manifest.sourceFormatVersion,
        livingWorldVersion: artifacts.manifest.livingWorldVersion,
        runtimePartitionVersion: artifacts.manifest.runtimePartitionVersion,
        rendererContractVersion: artifacts.manifest.rendererContractVersion,
        expectedRegionCount: authority.totals.regionCount,
        expectedComponentCount: authority.totals.componentCount,
        expectedChunkCount: authority.totals.chunkCount,
        expectedCellCount: authority.totals.cellCount,
        expectedSlotCount: authority.totals.castleSlotCount,
        expectedResourceNodeCount: authority.totals.resourceNodeCount,
        expectedReleaseSha256: authority.releaseSha256,
        importEpoch,
        releaseHeaderJson: authority.headerJson,
      }),
    });
  }
  if (status.state === 'importing') {
    if (status.componentRows < BigInt(authority.components.length)) {
      const start = Number(status.componentRows);
      return Object.freeze({
        reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.components,
        arguments: Object.freeze({
          atlasId: authority.atlasId,
          importEpoch,
          rows: authority.components.slice(
            start,
            start + GREATER_REALM_PRODUCTION_IMPORT_LIMITS.componentRows,
          ),
        }),
      });
    }
    if (status.regionManifestRows < authority.regions.length) {
      const start = status.regionManifestRows;
      return Object.freeze({
        reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.regions,
        arguments: Object.freeze({
          atlasId: authority.atlasId,
          importEpoch,
          rows: authority.regions.slice(
            start,
            start + GREATER_REALM_PRODUCTION_IMPORT_LIMITS.regionRows,
          ),
        }),
      });
    }
    if (status.chunkRows < BigInt(artifacts.chunks.length)) {
      const chunk = artifacts.chunks[Number(status.chunkRows)];
      if (chunk === undefined) fail('GREATER_REALM_PRODUCTION_IMPORT_CURSOR_INVALID');
      return Object.freeze({
        reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.chunk,
        arguments: Object.freeze({
          atlasId: authority.atlasId,
          importEpoch,
          payloadSha256: sha256(chunk.bytes),
          payloadJson: chunk.bytes.toString('utf8'),
        }),
      });
    }
    if (!status.importsExact) fail('GREATER_REALM_PRODUCTION_IMPORT_COUNTS_NOT_EXACT');
    return Object.freeze({
      reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.beginVerification,
      arguments: Object.freeze({ atlasId: authority.atlasId, importEpoch }),
    });
  }
  if (status.state === 'verifying') {
    if (status.verificationPhase !== 'complete') {
      return Object.freeze({
        reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.verifyBatch,
        arguments: Object.freeze({
          atlasId: authority.atlasId,
          importEpoch,
          requestedRows: GREATER_REALM_PRODUCTION_IMPORT_LIMITS.verifyRows,
        }),
      });
    }
    if (!SHA256.test(status.verificationDigest)) {
      fail('GREATER_REALM_PRODUCTION_IMPORT_VERIFY_DIGEST_INVALID');
    }
    return Object.freeze({
      reducer: GREATER_REALM_PRODUCTION_IMPORT_REDUCERS.finalize,
      arguments: Object.freeze({
        atlasId: authority.atlasId,
        importEpoch,
        publicApprovalReceiptId: authority.publicApprovalReceiptId,
        expectedReleaseSha256: authority.releaseSha256,
        expectedVerificationDigest: status.verificationDigest,
        publicName,
      }),
    });
  }
  if (status.state === 'ready') return undefined;
  fail('GREATER_REALM_PRODUCTION_IMPORT_STATE_NOT_RESUMABLE');
}

function receipt(
  outcome: GreaterRealmProductionImportOutcome,
  authority: ImportAuthority,
  importEpoch: bigint,
  status: GreaterRealmProductionImportStatus,
  operationsSubmitted: number,
  moduleSourceCommit: string,
): GreaterRealmProductionImportReceipt {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-import-v1',
    outcome,
    atlasId: authority.atlasId,
    publicReleaseId: authority.publicReleaseId,
    atlasSourceCommit: authority.sourceCommit,
    moduleSourceCommit,
    importEpoch: importEpoch.toString(),
    expectedReleaseSha256: authority.releaseSha256,
    verificationDigest: status.verificationDigest,
    operationsSubmitted,
    postcondition: 'ready-import-only',
  });
}

/**
 * Resumable import driver. Every mutation is preceded and followed by a fresh
 * bounded status read. A transport error is never retried blind: status must
 * prove the transition before the driver may continue.
 */
export async function executeGreaterRealmProductionImport(input: Readonly<{
  artifacts: GreaterRealmRuntimeReleaseArtifacts;
  moduleSourceCommit: string;
  importEpoch: bigint;
  publicName: string;
  transport: GreaterRealmProductionImportTransport;
  maximumOperations?: number;
  testOnlyDependencies?: Readonly<{
    verifyArtifacts?: (artifacts: GreaterRealmRuntimeReleaseArtifacts) => void;
    projectAuthorityStatus?: (value: unknown) => GreaterRealmProductionCutoverStatus;
  }>;
}>): Promise<GreaterRealmProductionImportReceipt> {
  if (
    !SOURCE_COMMIT.test(input.moduleSourceCommit)
    || input.importEpoch < 1n
    || input.importEpoch > U64_MAXIMUM
    || typeof input.publicName !== 'string'
    || input.publicName.length < 1
    || input.publicName.length > 96
    || /[\u0000-\u001f\u007f]/u.test(input.publicName)
  ) fail('GREATER_REALM_PRODUCTION_IMPORT_INPUT_INVALID');
  const maximumOperations = input.maximumOperations
    ?? GREATER_REALM_PRODUCTION_IMPORT_LIMITS.maximumOperations;
  if (!Number.isSafeInteger(maximumOperations) || maximumOperations < 1 || maximumOperations > 4_096) {
    fail('GREATER_REALM_PRODUCTION_IMPORT_INPUT_INVALID');
  }
  const authority = importAuthority(
    input.artifacts,
    input.testOnlyDependencies?.verifyArtifacts ?? verifyGreaterRealmRuntimeReleaseArtifacts,
  );
  const projectAuthorityStatus = input.testOnlyDependencies?.projectAuthorityStatus
    ?? projectGreaterRealmProductionCutoverStatusShape;
  let checkpoint = await inspectBoundImportStatus({
    transport: input.transport,
    authority,
    importEpoch: input.importEpoch,
    unavailableCode: 'GREATER_REALM_PRODUCTION_IMPORT_INITIAL_INSPECTION_UNAVAILABLE',
    submitted: false,
    projectAuthorityStatus,
  });
  let status = checkpoint.status;
  if (readyPostcondition(status, authority, input.importEpoch)) {
    return receipt(
      'already-ready', authority, input.importEpoch, status, 0, input.moduleSourceCommit,
    );
  }

  let operationsSubmitted = 0;
  let recoveredSubmissionError = false;
  while (operationsSubmitted < maximumOperations) {
    const operation = planNextOperation(
      status,
      authority,
      input.artifacts,
      input.importEpoch,
      input.publicName,
    );
    if (operation === undefined) {
      if (!readyPostcondition(status, authority, input.importEpoch)) {
        fail('GREATER_REALM_PRODUCTION_IMPORT_READY_POSTCONDITION_FAILED', operationsSubmitted > 0);
      }
      return receipt(
        recoveredSubmissionError ? 'verified-after-submission-error' : 'ready',
        authority,
        input.importEpoch,
        status,
        operationsSubmitted,
        input.moduleSourceCommit,
      );
    }

    // Read immediately before every write so a stale long-running operator can
    // never submit a plan derived from an earlier state.
    const freshBeforeCheckpoint = await inspectBoundImportStatus({
      transport: input.transport,
      authority,
      importEpoch: input.importEpoch,
      unavailableCode: 'GREATER_REALM_PRODUCTION_IMPORT_PREWRITE_INSPECTION_UNAVAILABLE',
      submitted: operationsSubmitted > 0,
      projectAuthorityStatus,
    });
    const freshBefore = freshBeforeCheckpoint.status;
    const freshOperation = planNextOperation(
      freshBefore,
      authority,
      input.artifacts,
      input.importEpoch,
      input.publicName,
    );
    if (
      freshOperation === undefined
      || freshOperation.reducer !== operation.reducer
      || canonicalJsonText(freshOperation.arguments) !== canonicalJsonText(operation.arguments)
    ) {
      status = freshBefore;
      continue;
    }

    let submissionFailed = false;
    try {
      await input.transport.submit(operation.reducer, operation.arguments);
    } catch {
      submissionFailed = true;
    }
    operationsSubmitted += 1;

    const afterCheckpoint = await inspectBoundImportStatus({
      transport: input.transport,
      authority,
      importEpoch: input.importEpoch,
      unavailableCode: 'GREATER_REALM_PRODUCTION_IMPORT_MUTATION_OUTCOME_AMBIGUOUS',
      submitted: true,
      projectAuthorityStatus,
    });
    status = afterCheckpoint.status;
    const advanced = importOperationPostcondition({
      operation,
      before: freshBefore,
      after: status,
      beforeAuthority: freshBeforeCheckpoint.authorityStatus,
      afterAuthority: afterCheckpoint.authorityStatus,
      authority,
      artifacts: input.artifacts,
    });
    if (!advanced) {
      fail(
        submissionFailed
          ? 'GREATER_REALM_PRODUCTION_IMPORT_MUTATION_REJECTED_OR_UNCOMMITTED'
          : 'GREATER_REALM_PRODUCTION_IMPORT_MUTATION_POSTCONDITION_FAILED',
        true,
      );
    }
    if (submissionFailed) recoveredSubmissionError = true;
    if (readyPostcondition(status, authority, input.importEpoch)) {
      return receipt(
        recoveredSubmissionError ? 'verified-after-submission-error' : 'ready',
        authority,
        input.importEpoch,
        status,
        operationsSubmitted,
        input.moduleSourceCommit,
      );
    }
  }
  fail('GREATER_REALM_PRODUCTION_IMPORT_OPERATION_LIMIT', operationsSubmitted > 0);
}

export const greaterRealmProductionImportTestSeams = Object.freeze({
  canonicalJsonText,
  importAuthority,
  planNextOperation,
  readyPostcondition,
});
