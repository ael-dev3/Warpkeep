import type {
  AdminGreaterRealmCutoverStatusV1,
  AdminGreaterRealmReenableStatusV1,
} from '../src/spacetime/module_bindings/types';
import { CASTLE_WORKERS_PER_CASTLE } from '../spacetimedb/src/castleWorkerPolicy';
import {
  GREATER_REALM_CASTLE_CAPACITY,
  GREATER_REALM_CASTLES_PER_REGION,
  GREATER_REALM_PUBLIC_REGIONS,
  GREATER_REALM_RESOURCE_KINDS,
  GREATER_REALM_RESOURCE_MARGIN_PER_SLOT,
} from '../spacetimedb/src/greaterRealmV17Policy';

const U32_MAXIMUM = 0xffff_ffff;
const U64_MAXIMUM = (1n << 64n) - 1n;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SOURCE_COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const ROSTER_DIGEST_PATTERN = /^[0-9a-f]{16}$/;
const OPAQUE_PUBLIC_ID_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._:-]*$/;
const INITIAL_ATLAS_REVISION = 1n;
const RESOURCE_NODE_CAPACITY = GREATER_REALM_CASTLE_CAPACITY
  * GREATER_REALM_RESOURCE_MARGIN_PER_SLOT
  * GREATER_REALM_RESOURCE_KINDS.length;

export type FounderAdmissionAuthorityMode = 'legacy' | 'greater-realm';

export type FounderReenableTargetStatus = Readonly<{
  admissionState: 'missing' | 'enabled' | 'disabled';
  authEpoch: number;
  requestState: 'not_requested' | 'pending' | 'resolved';
  requestCycle: bigint | undefined;
  requestedAtMicros: bigint | undefined;
}>;

export class FounderAdmissionAuthorityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FounderAdmissionAuthorityError';
  }
}

const CUTOVER_STATUS_FIELDS = Object.freeze([
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'releaseRows',
  'releasePresent',
  'atlasId',
  'publicReleaseId',
  'sourceCommit',
  'importEpoch',
  'releaseState',
  'verificationPhase',
  'verificationCursor',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'regionManifestRows',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'activeSlotRows',
  'resourceNodeRows',
  'activeResourceNodeRows',
  'releaseImportsExact',
  'releaseVerificationExact',
  'releaseReady',
  'activationRows',
  'activationPresent',
  'activationMode',
  'everActive',
  'topologySnapshotDigest',
  'relocationPlanDigest',
  'snapshotCastleDigest',
  'snapshotWorkerDigest',
  'snapshotResourceDigest',
  'snapshotMarksDigest',
  'snapshotInnerKeepDigest',
  'snapshotScheduleDigest',
  'snapshotCastleCount',
  'snapshotWorkerCount',
  'snapshotResourceAccountCount',
  'snapshotMarkAccountCount',
  'snapshotInnerKeepBuildingCount',
  'snapshotClaimCount',
  'snapshotOccupancyCount',
  'nextAllocationSequence',
  'postCanaryFoundingCount',
  'postCanaryDispatchCount',
  'rollbackEligible',
  'resumeEligible',
  'legacyFoundingOpen',
  'legacyJourneyDispatchOpen',
  'castleCapacity',
  'currentFounderCount',
  'founderCapacityRemaining',
  'castleRows',
  'greaterRealmClaimRows',
  'greaterRealmOccupancyRows',
  'plannedClaimRows',
  'activeClaimRows',
  'unknownClaimStateRows',
  'relocatedClaimRows',
  'foundedClaimRows',
  'unknownClaimKindRows',
  'legacyClaimRows',
  'legacyOccupiedWorldTileRows',
  'lowlandsFounderCount',
  'frostmereFounderCount',
  'sunscarFounderCount',
  'mirefenFounderCount',
  'stonewakeFounderCount',
  'emberwoodFounderCount',
  'unassignedRegionFounderCount',
  'profileRows',
  'markAccountRows',
  'resourceAccountRows',
  'allowedFidRows',
  'enabledAllowedFidRows',
  'castleWorkerRows',
  'idleCastleWorkerRows',
  'nonIdleCastleWorkerRows',
  'auditRows',
  'legacyRealmRows',
  'legacyRealmActive',
  'atlasRows',
  'atlasMode',
  'atlasRevision',
  'atlasCastleCapacity',
  'atlasVisibleRegionCount',
  'atlasVisibleCellCount',
  'atlasVisibleChunkCount',
  'visibleRegionRows',
  'activeVisibleRegionRows',
  'workerSystemV2Rows',
  'workerSystemV2Mode',
  'workerSystemV2RosterDigest',
  'workerSystemV2CurrentCastleCount',
  'workerSystemV2CurrentWorkerCount',
  'workerSystemV1Rows',
  'workerSystemV1Mode',
  'workerSystemV1RosterDigest',
  'workerSystemV1ExpectedCastleCount',
  'workerSystemV1ExpectedWorkerCount',
  'workerSystemV1LegacyDrainRequired',
  'goldNodeOccupationRows',
  'goldExpeditionRows',
  'goldExpeditionScheduleRows',
  'foodNodeOccupationRows',
  'foodExpeditionRows',
  'foodExpeditionScheduleRows',
  'woodNodeOccupationRows',
  'woodExpeditionRows',
  'woodExpeditionScheduleRows',
  'stoneNodeOccupationRows',
  'stoneExpeditionRows',
  'stoneExpeditionScheduleRows',
  'workerAssignmentRows',
  'workerNodeOccupationRows',
  'workerAssignmentScheduleRows',
  'currentWorldGraphApplicable',
  'currentWorldGraphExact',
  'currentWorldIntegrityViolationCount',
  'activeAdmissionEligible',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

type MissingCutoverField = Exclude<
  keyof AdminGreaterRealmCutoverStatusV1,
  typeof CUTOVER_STATUS_FIELDS[number]
>;
const CUTOVER_STATUS_FIELDS_ARE_EXHAUSTIVE:
  [MissingCutoverField] extends [never] ? true : false = true;
void CUTOVER_STATUS_FIELDS_ARE_EXHAUSTIVE;

const CUTOVER_U32_FIELDS = Object.freeze([
  'expectedRegionCount',
  'expectedComponentCount',
  'expectedChunkCount',
  'expectedCellCount',
  'expectedSlotCount',
  'expectedResourceNodeCount',
  'componentExpectedCellCount',
  'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount',
  'importedPassableCellCount',
  'verifiedComponentCount',
  'verifiedChunkCount',
  'verifiedCellCount',
  'verifiedSlotCount',
  'verifiedResourceNodeCount',
  'regionManifestRows',
  'snapshotCastleCount',
  'snapshotWorkerCount',
  'snapshotResourceAccountCount',
  'snapshotMarkAccountCount',
  'snapshotInnerKeepBuildingCount',
  'snapshotClaimCount',
  'snapshotOccupancyCount',
  'postCanaryFoundingCount',
  'postCanaryDispatchCount',
  'castleCapacity',
  'currentFounderCount',
  'founderCapacityRemaining',
  'lowlandsFounderCount',
  'frostmereFounderCount',
  'sunscarFounderCount',
  'mirefenFounderCount',
  'stonewakeFounderCount',
  'emberwoodFounderCount',
  'unassignedRegionFounderCount',
  'atlasCastleCapacity',
  'atlasVisibleRegionCount',
  'atlasVisibleCellCount',
  'atlasVisibleChunkCount',
  'workerSystemV2CurrentCastleCount',
  'workerSystemV2CurrentWorkerCount',
  'workerSystemV1ExpectedCastleCount',
  'workerSystemV1ExpectedWorkerCount',
  'currentWorldIntegrityViolationCount',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const CUTOVER_U64_FIELDS = Object.freeze([
  'releaseRows',
  'verificationCursor',
  'componentRows',
  'chunkRows',
  'cellRows',
  'slotRows',
  'activeSlotRows',
  'resourceNodeRows',
  'activeResourceNodeRows',
  'activationRows',
  'nextAllocationSequence',
  'castleRows',
  'greaterRealmClaimRows',
  'greaterRealmOccupancyRows',
  'plannedClaimRows',
  'activeClaimRows',
  'unknownClaimStateRows',
  'relocatedClaimRows',
  'foundedClaimRows',
  'unknownClaimKindRows',
  'legacyClaimRows',
  'legacyOccupiedWorldTileRows',
  'profileRows',
  'markAccountRows',
  'resourceAccountRows',
  'allowedFidRows',
  'enabledAllowedFidRows',
  'castleWorkerRows',
  'idleCastleWorkerRows',
  'nonIdleCastleWorkerRows',
  'auditRows',
  'legacyRealmRows',
  'atlasRows',
  'visibleRegionRows',
  'activeVisibleRegionRows',
  'workerSystemV2Rows',
  'workerSystemV1Rows',
  'goldNodeOccupationRows',
  'goldExpeditionRows',
  'goldExpeditionScheduleRows',
  'foodNodeOccupationRows',
  'foodExpeditionRows',
  'foodExpeditionScheduleRows',
  'woodNodeOccupationRows',
  'woodExpeditionRows',
  'woodExpeditionScheduleRows',
  'stoneNodeOccupationRows',
  'stoneExpeditionRows',
  'stoneExpeditionScheduleRows',
  'workerAssignmentRows',
  'workerNodeOccupationRows',
  'workerAssignmentScheduleRows',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const CUTOVER_BOOLEAN_FIELDS = Object.freeze([
  'importMutationsCompiled',
  'activationMutationsCompiled',
  'releasePresent',
  'releaseImportsExact',
  'releaseVerificationExact',
  'releaseReady',
  'activationPresent',
  'everActive',
  'rollbackEligible',
  'resumeEligible',
  'legacyFoundingOpen',
  'legacyJourneyDispatchOpen',
  'legacyRealmActive',
  'workerSystemV1LegacyDrainRequired',
  'currentWorldGraphApplicable',
  'currentWorldGraphExact',
  'activeAdmissionEligible',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const CUTOVER_STRING_FIELDS = Object.freeze([
  'releaseState',
  'verificationPhase',
  'activationMode',
  'atlasMode',
  'workerSystemV2Mode',
  'workerSystemV1Mode',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const CUTOVER_OPTION_STRING_FIELDS = Object.freeze([
  'atlasId',
  'publicReleaseId',
  'sourceCommit',
  'expectedReleaseSha256',
  'releaseHeaderSha256',
  'verificationDigest',
  'topologySnapshotDigest',
  'relocationPlanDigest',
  'snapshotCastleDigest',
  'snapshotWorkerDigest',
  'snapshotResourceDigest',
  'snapshotMarksDigest',
  'snapshotInnerKeepDigest',
  'snapshotScheduleDigest',
  'workerSystemV2RosterDigest',
  'workerSystemV1RosterDigest',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const REGION_COUNT_FIELDS = Object.freeze([
  'lowlandsFounderCount',
  'frostmereFounderCount',
  'sunscarFounderCount',
  'mirefenFounderCount',
  'stonewakeFounderCount',
  'emberwoodFounderCount',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const REENABLE_STATUS_FIELDS = Object.freeze([
  'currentWorldGraphApplicable',
  'targetFounderGraphExact',
  'targetAllowedEnabled',
  'targetAuthEpoch',
  'targetRequestCycle',
  'targetRequestedAtMicros',
  'targetReenableEligible',
] as const satisfies readonly (keyof AdminGreaterRealmReenableStatusV1)[]);

type MissingReenableField = Exclude<
  keyof AdminGreaterRealmReenableStatusV1,
  typeof REENABLE_STATUS_FIELDS[number]
>;
const REENABLE_STATUS_FIELDS_ARE_EXHAUSTIVE:
  [MissingReenableField] extends [never] ? true : false = true;
void REENABLE_STATUS_FIELDS_ARE_EXHAUSTIVE;

function fail(message: string): never {
  throw new FounderAdmissionAuthorityError(message);
}

function exactObjectFields(
  value: object,
  expected: readonly string[],
  message: string,
): void {
  const actual = Object.keys(value);
  if (
    actual.length !== expected.length
    || actual.some((field, index) => field !== expected[index])
  ) fail(message);
}

function validateCutoverWire(status: AdminGreaterRealmCutoverStatusV1): void {
  exactObjectFields(
    status,
    CUTOVER_STATUS_FIELDS,
    'Greater Realm cutover status did not match the frozen 137-field ABI.',
  );
  for (const field of CUTOVER_U32_FIELDS) {
    const value: unknown = status[field];
    if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > U32_MAXIMUM) {
      fail('Greater Realm cutover status contained an invalid u32 value.');
    }
  }
  for (const field of CUTOVER_U64_FIELDS) {
    const value: unknown = status[field];
    if (typeof value !== 'bigint' || value < 0n || value > U64_MAXIMUM) {
      fail('Greater Realm cutover status contained an invalid u64 value.');
    }
  }
  for (const field of CUTOVER_BOOLEAN_FIELDS) {
    if (typeof status[field] !== 'boolean') {
      fail('Greater Realm cutover status contained an invalid boolean value.');
    }
  }
  for (const field of CUTOVER_STRING_FIELDS) {
    if (typeof status[field] !== 'string') {
      fail('Greater Realm cutover status contained an invalid mode value.');
    }
  }
  for (const field of CUTOVER_OPTION_STRING_FIELDS) {
    const value: unknown = status[field];
    if (value !== undefined && typeof value !== 'string') {
      fail('Greater Realm cutover status contained invalid release metadata.');
    }
  }
  for (const field of ['importEpoch', 'atlasRevision'] as const) {
    const value = status[field];
    if (value !== undefined && (typeof value !== 'bigint' || value < 0n || value > U64_MAXIMUM)) {
      fail('Greater Realm cutover status contained invalid revision metadata.');
    }
  }
}

function validateReenableWire(status: AdminGreaterRealmReenableStatusV1): void {
  exactObjectFields(
    status,
    REENABLE_STATUS_FIELDS,
    'Greater Realm re-enable status did not match the frozen 7-field ABI.',
  );
  if (
    typeof status.currentWorldGraphApplicable !== 'boolean'
    || typeof status.targetFounderGraphExact !== 'boolean'
    || typeof status.targetAllowedEnabled !== 'boolean'
    || typeof status.targetReenableEligible !== 'boolean'
    || (
      status.targetAuthEpoch !== undefined
      && (
        !Number.isInteger(status.targetAuthEpoch)
        || status.targetAuthEpoch < 0
        || status.targetAuthEpoch > U32_MAXIMUM
      )
    )
    || (
      status.targetRequestCycle !== undefined
      && (
        typeof status.targetRequestCycle !== 'bigint'
        || status.targetRequestCycle < 0n
        || status.targetRequestCycle > U64_MAXIMUM
      )
    )
    || (
      status.targetRequestedAtMicros !== undefined
      && (
        typeof status.targetRequestedAtMicros !== 'bigint'
        || status.targetRequestedAtMicros < 0n
        || status.targetRequestedAtMicros > U64_MAXIMUM
      )
    )
  ) fail('Greater Realm re-enable status contained an invalid value.');
}

function requiredString(
  value: string | undefined,
  pattern?: RegExp,
): value is string {
  return value !== undefined
    && value.length > 0
    && value.normalize('NFKC') === value
    && (pattern === undefined || pattern.test(value));
}

export function selectFounderAdmissionAuthorityMode(
  status: AdminGreaterRealmCutoverStatusV1,
): FounderAdmissionAuthorityMode {
  validateCutoverWire(status);
  if (status.currentWorldGraphApplicable) return 'greater-realm';
  if (
    status.legacyFoundingOpen
    && !status.currentWorldGraphExact
    && status.currentWorldIntegrityViolationCount === 0
    && !status.activeAdmissionEligible
  ) return 'legacy';
  return fail('Founder admission is closed at the current world transition checkpoint.');
}

function verifyGreaterRealmActiveCheckpoint(
  status: AdminGreaterRealmCutoverStatusV1,
  requireCapacity: boolean,
): void {
  validateCutoverWire(status);
  const founders = status.currentFounderCount;
  const founderRows = BigInt(founders);
  const expectedWorkers = founders * CASTLE_WORKERS_PER_CASTLE;
  const regionTotal = REGION_COUNT_FIELDS.reduce(
    (total, field) => total + status[field],
    status.unassignedRegionFounderCount,
  );
  if (
    // The published steady-state artifact is deliberately FT: import remains
    // compiled closed while the audited activation/halts authority is present.
    status.importMutationsCompiled
    || !status.activationMutationsCompiled
    || status.releaseRows !== 1n
    || !status.releasePresent
    || status.releaseState !== 'active'
    || status.verificationPhase !== 'complete'
    || status.verificationCursor !== 0n
    || !status.releaseImportsExact
    || !status.releaseVerificationExact
    || status.releaseReady
    || !requiredString(status.atlasId, OPAQUE_PUBLIC_ID_PATTERN)
    || !requiredString(status.publicReleaseId, OPAQUE_PUBLIC_ID_PATTERN)
    || !requiredString(status.sourceCommit, SOURCE_COMMIT_PATTERN)
    || status.importEpoch === undefined
    || status.importEpoch < 1n
    || !requiredString(status.expectedReleaseSha256, SHA256_PATTERN)
    || !requiredString(status.releaseHeaderSha256, SHA256_PATTERN)
    || !requiredString(status.verificationDigest)
    || status.expectedRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || status.regionManifestRows !== GREATER_REALM_PUBLIC_REGIONS.length
    || status.expectedComponentCount < 1
    || status.expectedChunkCount < 1
    || status.expectedCellCount < 1
    || status.componentRows !== BigInt(status.expectedComponentCount)
    || status.chunkRows !== BigInt(status.expectedChunkCount)
    || status.cellRows !== BigInt(status.expectedCellCount)
    || status.verifiedComponentCount !== status.expectedComponentCount
    || status.verifiedChunkCount !== status.expectedChunkCount
    || status.verifiedCellCount !== status.expectedCellCount
    || status.componentExpectedCellCount !== status.importedPassableCellCount
    || status.componentExpectedCellCount < GREATER_REALM_CASTLE_CAPACITY
    || status.expectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || status.componentExpectedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || status.verifiedSlotCount !== GREATER_REALM_CASTLE_CAPACITY
    || status.slotRows !== BigInt(GREATER_REALM_CASTLE_CAPACITY)
    || status.activeSlotRows !== status.slotRows
    || status.expectedResourceNodeCount !== RESOURCE_NODE_CAPACITY
    || status.componentExpectedResourceNodeCount !== RESOURCE_NODE_CAPACITY
    || status.verifiedResourceNodeCount !== RESOURCE_NODE_CAPACITY
    || status.resourceNodeRows !== BigInt(RESOURCE_NODE_CAPACITY)
    || status.activeResourceNodeRows !== status.resourceNodeRows
    || status.activationRows !== 1n
    || !status.activationPresent
    || status.activationMode !== 'active'
    || !status.everActive
    || status.rollbackEligible
    || status.resumeEligible
    || status.legacyFoundingOpen
    || status.legacyJourneyDispatchOpen
    || !requiredString(status.topologySnapshotDigest, SHA256_PATTERN)
    || !requiredString(status.relocationPlanDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotCastleDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotWorkerDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotResourceDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotMarksDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotInnerKeepDigest, SHA256_PATTERN)
    || !requiredString(status.snapshotScheduleDigest, SHA256_PATTERN)
    || status.snapshotCastleCount > founders
    || status.snapshotWorkerCount
      !== status.snapshotCastleCount * CASTLE_WORKERS_PER_CASTLE
    || status.snapshotResourceAccountCount !== status.snapshotCastleCount
    || status.snapshotMarkAccountCount !== status.snapshotCastleCount
    || status.snapshotClaimCount !== status.snapshotCastleCount
    || status.snapshotOccupancyCount !== status.snapshotCastleCount
    || status.snapshotCastleCount + status.postCanaryFoundingCount !== founders
    || status.nextAllocationSequence !== founderRows
    || status.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || founders > GREATER_REALM_CASTLE_CAPACITY
    || status.founderCapacityRemaining !== GREATER_REALM_CASTLE_CAPACITY - founders
    || (requireCapacity && founders >= GREATER_REALM_CASTLE_CAPACITY)
    || status.castleRows !== founderRows
    || status.greaterRealmClaimRows !== founderRows
    || status.greaterRealmOccupancyRows !== founderRows
    || status.plannedClaimRows !== 0n
    || status.activeClaimRows !== founderRows
    || status.unknownClaimStateRows !== 0n
    || status.relocatedClaimRows !== BigInt(status.snapshotCastleCount)
    || status.foundedClaimRows !== BigInt(status.postCanaryFoundingCount)
    || status.unknownClaimKindRows !== 0n
    || status.legacyClaimRows !== 0n
    || status.legacyOccupiedWorldTileRows !== 0n
    || REGION_COUNT_FIELDS.some(field => (
      status[field] > GREATER_REALM_CASTLES_PER_REGION
    ))
    || status.unassignedRegionFounderCount !== 0
    || regionTotal !== founders
    || status.profileRows !== founderRows
    || status.markAccountRows !== founderRows
    || status.resourceAccountRows !== founderRows
    || status.allowedFidRows !== founderRows
    || status.enabledAllowedFidRows > founderRows
    || status.castleWorkerRows !== BigInt(expectedWorkers)
    || status.idleCastleWorkerRows + status.nonIdleCastleWorkerRows
      !== status.castleWorkerRows
    || status.legacyRealmRows !== 1n
    || status.legacyRealmActive
    || status.atlasRows !== 1n
    || status.atlasMode !== 'active'
    || status.atlasRevision !== INITIAL_ATLAS_REVISION
    || status.atlasCastleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || status.atlasVisibleRegionCount !== GREATER_REALM_PUBLIC_REGIONS.length
    || status.atlasVisibleCellCount !== status.expectedCellCount
    || status.atlasVisibleChunkCount !== status.expectedChunkCount
    || status.visibleRegionRows !== BigInt(GREATER_REALM_PUBLIC_REGIONS.length)
    || status.activeVisibleRegionRows !== status.visibleRegionRows
    || status.workerSystemV2Rows !== 1n
    || status.workerSystemV2Mode !== 'active'
    || !requiredString(status.workerSystemV2RosterDigest, ROSTER_DIGEST_PATTERN)
    || status.workerSystemV2CurrentCastleCount !== founders
    || status.workerSystemV2CurrentWorkerCount !== expectedWorkers
    || status.workerSystemV1Rows !== 1n
    || status.workerSystemV1Mode !== 'active'
    || !requiredString(status.workerSystemV1RosterDigest, ROSTER_DIGEST_PATTERN)
    || status.workerSystemV1ExpectedCastleCount !== founders
    || status.workerSystemV1ExpectedWorkerCount !== expectedWorkers
    || status.workerSystemV1LegacyDrainRequired
    || status.workerSystemV1RosterDigest !== status.workerSystemV2RosterDigest
    || !status.currentWorldGraphApplicable
    || !status.currentWorldGraphExact
    || status.currentWorldIntegrityViolationCount !== 0
    || status.activeAdmissionEligible !== (status.founderCapacityRemaining > 0)
    || (requireCapacity && !status.activeAdmissionEligible)
  ) {
    fail('Greater Realm admission checkpoint was not an exact active 600-castle authority.');
  }
}

export function verifyGreaterRealmAdmissionPrecondition(
  status: AdminGreaterRealmCutoverStatusV1,
): Readonly<AdminGreaterRealmCutoverStatusV1> {
  verifyGreaterRealmActiveCheckpoint(status, true);
  return Object.freeze({ ...status });
}

const FOUNDER_U32_INCREMENT_FIELDS = Object.freeze([
  'currentFounderCount',
  'postCanaryFoundingCount',
  'workerSystemV2CurrentCastleCount',
  'workerSystemV1ExpectedCastleCount',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const FOUNDER_U64_INCREMENT_FIELDS = Object.freeze([
  'nextAllocationSequence',
  'castleRows',
  'greaterRealmClaimRows',
  'greaterRealmOccupancyRows',
  'activeClaimRows',
  'foundedClaimRows',
  'profileRows',
  'markAccountRows',
  'resourceAccountRows',
  'allowedFidRows',
  'enabledAllowedFidRows',
  'auditRows',
] as const satisfies readonly (keyof AdminGreaterRealmCutoverStatusV1)[]);

const FOUNDER_MUTABLE_FIELDS = new Set<keyof AdminGreaterRealmCutoverStatusV1>([
  ...FOUNDER_U32_INCREMENT_FIELDS,
  ...FOUNDER_U64_INCREMENT_FIELDS,
  'founderCapacityRemaining',
  ...REGION_COUNT_FIELDS,
  'castleWorkerRows',
  'idleCastleWorkerRows',
  'workerSystemV2RosterDigest',
  'workerSystemV2CurrentWorkerCount',
  'workerSystemV1RosterDigest',
  'workerSystemV1ExpectedWorkerCount',
  'activeAdmissionEligible',
]);

function verifyPreservedCutoverFields(
  status: AdminGreaterRealmCutoverStatusV1,
  before: AdminGreaterRealmCutoverStatusV1,
  mutableFields: ReadonlySet<keyof AdminGreaterRealmCutoverStatusV1>,
  message: string,
): void {
  for (const field of CUTOVER_STATUS_FIELDS) {
    if (!mutableFields.has(field) && status[field] !== before[field]) fail(message);
  }
}

export function verifyGreaterRealmAdmissionPostcondition(
  status: AdminGreaterRealmCutoverStatusV1,
  before: AdminGreaterRealmCutoverStatusV1,
): Readonly<AdminGreaterRealmCutoverStatusV1> {
  verifyGreaterRealmActiveCheckpoint(before, true);
  verifyGreaterRealmActiveCheckpoint(status, false);
  for (const field of FOUNDER_U32_INCREMENT_FIELDS) {
    if ((status[field] as number) !== (before[field] as number) + 1) {
      fail('Greater Realm founder admission did not produce the exact +1 transition.');
    }
  }
  for (const field of FOUNDER_U64_INCREMENT_FIELDS) {
    if ((status[field] as bigint) !== (before[field] as bigint) + 1n) {
      fail('Greater Realm founder admission did not produce the exact +1 transition.');
    }
  }
  if (
    status.founderCapacityRemaining !== before.founderCapacityRemaining - 1
    || status.castleWorkerRows
      !== before.castleWorkerRows + BigInt(CASTLE_WORKERS_PER_CASTLE)
    || status.idleCastleWorkerRows
      !== before.idleCastleWorkerRows + BigInt(CASTLE_WORKERS_PER_CASTLE)
    || status.workerSystemV2CurrentWorkerCount
      !== before.workerSystemV2CurrentWorkerCount + CASTLE_WORKERS_PER_CASTLE
    || status.workerSystemV1ExpectedWorkerCount
      !== before.workerSystemV1ExpectedWorkerCount + CASTLE_WORKERS_PER_CASTLE
    || status.workerSystemV2RosterDigest === before.workerSystemV2RosterDigest
    || status.workerSystemV1RosterDigest === before.workerSystemV1RosterDigest
    || status.workerSystemV2RosterDigest !== status.workerSystemV1RosterDigest
  ) fail('Greater Realm founder admission changed an invalid capacity or worker transition.');
  const changedRegions = REGION_COUNT_FIELDS.filter(field => (
    status[field] === before[field] + 1
  ));
  if (
    changedRegions.length !== 1
    || REGION_COUNT_FIELDS.some(field => (
      status[field] !== before[field] && status[field] !== before[field] + 1
    ))
  ) fail('Greater Realm founder admission did not change exactly one public region count.');
  verifyPreservedCutoverFields(
    status,
    before,
    FOUNDER_MUTABLE_FIELDS,
    'Greater Realm founder admission changed unrelated aggregate state.',
  );
  return Object.freeze({ ...status });
}

export type GreaterRealmReenableCheckpoint = Readonly<{
  status: Readonly<AdminGreaterRealmCutoverStatusV1>;
  targetProof: Readonly<AdminGreaterRealmReenableStatusV1>;
  target: FounderReenableTargetStatus;
}>;

export function verifyGreaterRealmReenablePreconditionV1(
  status: AdminGreaterRealmCutoverStatusV1,
  targetProof: AdminGreaterRealmReenableStatusV1,
  target: FounderReenableTargetStatus,
): GreaterRealmReenableCheckpoint {
  verifyGreaterRealmActiveCheckpoint(status, false);
  validateReenableWire(targetProof);
  if (
    target.admissionState !== 'disabled'
    || !Number.isInteger(target.authEpoch)
    || target.authEpoch < 1
    || target.authEpoch >= U32_MAXIMUM
    || target.requestState !== 'pending'
    || target.requestCycle !== BigInt(target.authEpoch) + 1n
    || target.requestedAtMicros === undefined
    || target.requestedAtMicros < 1n
    || target.requestedAtMicros > U64_MAXIMUM
    || status.enabledAllowedFidRows >= status.allowedFidRows
    || !targetProof.currentWorldGraphApplicable
    || !targetProof.targetFounderGraphExact
    || targetProof.targetAllowedEnabled
    || targetProof.targetAuthEpoch !== target.authEpoch
    || targetProof.targetRequestCycle !== target.requestCycle
    || targetProof.targetRequestedAtMicros !== target.requestedAtMicros
    || !targetProof.targetReenableEligible
  ) fail('Greater Realm re-enable requires one exact disabled v17 founder request CAS.');
  return Object.freeze({
    status: Object.freeze({ ...status }),
    targetProof: Object.freeze({ ...targetProof }),
    target: Object.freeze({ ...target }),
  });
}

const REENABLE_MUTABLE_FIELDS = new Set<keyof AdminGreaterRealmCutoverStatusV1>([
  'enabledAllowedFidRows',
  'auditRows',
]);

export function verifyGreaterRealmReenablePostconditionV1(
  status: AdminGreaterRealmCutoverStatusV1,
  targetProof: AdminGreaterRealmReenableStatusV1,
  target: FounderReenableTargetStatus,
  before: GreaterRealmReenableCheckpoint,
): void {
  verifyGreaterRealmReenablePreconditionV1(
    before.status,
    before.targetProof,
    before.target,
  );
  verifyGreaterRealmActiveCheckpoint(status, false);
  validateReenableWire(targetProof);
  if (
    target.admissionState !== 'enabled'
    || target.authEpoch !== before.target.authEpoch + 1
    || target.requestState !== 'resolved'
    || target.requestCycle !== before.target.requestCycle
    || target.requestedAtMicros !== before.target.requestedAtMicros
    || !targetProof.currentWorldGraphApplicable
    || !targetProof.targetFounderGraphExact
    || !targetProof.targetAllowedEnabled
    || targetProof.targetAuthEpoch !== target.authEpoch
    || targetProof.targetRequestCycle !== target.requestCycle
    || targetProof.targetRequestedAtMicros !== target.requestedAtMicros
    || targetProof.targetReenableEligible
    || status.enabledAllowedFidRows !== before.status.enabledAllowedFidRows + 1n
    || status.auditRows !== before.status.auditRows + 1n
  ) fail('Greater Realm re-enable postcondition was not the exact target transition.');
  verifyPreservedCutoverFields(
    status,
    before.status,
    REENABLE_MUTABLE_FIELDS,
    'Greater Realm re-enable changed unrelated aggregate state.',
  );
}
