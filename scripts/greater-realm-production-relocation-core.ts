import { createHash } from 'node:crypto';

export const GREATER_REALM_PRODUCTION_CUTOVER_STATUS_PROCEDURE =
  'admin_get_greater_realm_cutover_status_v_1' as const;

export const GREATER_REALM_PRODUCTION_RELOCATION_COMMAND = Object.freeze({
  INSPECT: 'inspect',
  PREPARE: 'prepare',
  BEGIN_DRAIN: 'begin-drain',
  FREEZE: 'freeze',
  PLAN: 'plan',
  CANARY: 'canary',
  COMMIT: 'commit',
  HALT: 'halt',
  RESUME: 'resume',
  ROLLBACK: 'rollback',
} as const);

export type GreaterRealmProductionRelocationCommand =
  typeof GREATER_REALM_PRODUCTION_RELOCATION_COMMAND[
    keyof typeof GREATER_REALM_PRODUCTION_RELOCATION_COMMAND
  ];

export const GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS = Object.freeze({
  prepare: 'admin_prepare_greater_realm_activation_v1',
  'begin-drain': 'admin_begin_greater_realm_drain_v1',
  freeze: 'admin_freeze_greater_realm_activation_v1',
  plan: 'admin_plan_greater_realm_relocation_v1',
  canary: 'admin_relocate_greater_realm_canary_v1',
  commit: 'admin_commit_greater_realm_active_v1',
  halt: 'admin_halt_greater_realm_activation_v1',
  resume: 'admin_resume_greater_realm_active_v1',
  rollback: 'admin_rollback_greater_realm_before_commit_v1',
} as const);

export type GreaterRealmProductionRelocationReducer =
  typeof GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS[
    keyof typeof GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS
  ];

const BOOLEAN_FIELDS = Object.freeze([
  'importMutationsCompiled', 'activationMutationsCompiled', 'releasePresent',
  'releaseImportsExact', 'releaseVerificationExact', 'releaseReady',
  'activationPresent', 'everActive',
  'rollbackEligible', 'resumeEligible', 'legacyFoundingOpen',
  'legacyJourneyDispatchOpen', 'legacyRealmActive',
  'workerSystemV1LegacyDrainRequired', 'currentWorldGraphApplicable',
  'currentWorldGraphExact', 'activeAdmissionEligible',
] as const);

const OPTIONAL_STRING_FIELDS = Object.freeze([
  'atlasId', 'publicReleaseId', 'sourceCommit', 'expectedReleaseSha256',
  'releaseHeaderSha256', 'verificationDigest', 'topologySnapshotDigest',
  'relocationPlanDigest', 'snapshotCastleDigest', 'snapshotWorkerDigest',
  'snapshotResourceDigest', 'snapshotMarksDigest', 'snapshotInnerKeepDigest',
  'snapshotScheduleDigest', 'workerSystemV2RosterDigest',
  'workerSystemV1RosterDigest',
] as const);

const OPTIONAL_U64_FIELDS = Object.freeze(['importEpoch', 'atlasRevision'] as const);

const STRING_FIELDS = Object.freeze([
  'releaseState', 'verificationPhase', 'activationMode', 'atlasMode',
  'workerSystemV2Mode', 'workerSystemV1Mode',
] as const);

const U32_FIELDS = Object.freeze([
  'expectedRegionCount', 'expectedComponentCount', 'expectedChunkCount',
  'expectedCellCount', 'expectedSlotCount', 'expectedResourceNodeCount',
  'componentExpectedCellCount', 'componentExpectedSlotCount',
  'componentExpectedResourceNodeCount', 'importedPassableCellCount',
  'verifiedComponentCount', 'verifiedChunkCount', 'verifiedCellCount',
  'verifiedSlotCount', 'verifiedResourceNodeCount', 'regionManifestRows',
  'snapshotCastleCount', 'snapshotWorkerCount',
  'snapshotResourceAccountCount', 'snapshotMarkAccountCount',
  'snapshotInnerKeepBuildingCount', 'snapshotClaimCount',
  'snapshotOccupancyCount', 'postCanaryFoundingCount',
  'postCanaryDispatchCount', 'castleCapacity', 'currentFounderCount',
  'founderCapacityRemaining', 'lowlandsFounderCount',
  'frostmereFounderCount', 'sunscarFounderCount', 'mirefenFounderCount',
  'stonewakeFounderCount', 'emberwoodFounderCount',
  'unassignedRegionFounderCount', 'atlasCastleCapacity',
  'atlasVisibleRegionCount', 'atlasVisibleCellCount',
  'atlasVisibleChunkCount', 'workerSystemV2CurrentCastleCount',
  'workerSystemV2CurrentWorkerCount', 'workerSystemV1ExpectedCastleCount',
  'workerSystemV1ExpectedWorkerCount', 'currentWorldIntegrityViolationCount',
] as const);

const U64_FIELDS = Object.freeze([
  'releaseRows', 'verificationCursor', 'componentRows', 'chunkRows', 'cellRows', 'slotRows',
  'activeSlotRows', 'resourceNodeRows', 'activeResourceNodeRows',
  'activationRows', 'nextAllocationSequence', 'castleRows',
  'greaterRealmClaimRows', 'greaterRealmOccupancyRows', 'plannedClaimRows',
  'activeClaimRows', 'unknownClaimStateRows', 'relocatedClaimRows',
  'foundedClaimRows', 'unknownClaimKindRows', 'legacyClaimRows',
  'legacyOccupiedWorldTileRows', 'profileRows', 'markAccountRows',
  'resourceAccountRows', 'allowedFidRows', 'enabledAllowedFidRows',
  'castleWorkerRows', 'idleCastleWorkerRows', 'nonIdleCastleWorkerRows',
  'auditRows', 'legacyRealmRows', 'atlasRows', 'visibleRegionRows',
  'activeVisibleRegionRows', 'workerSystemV2Rows', 'workerSystemV1Rows',
  'goldNodeOccupationRows', 'goldExpeditionRows', 'goldExpeditionScheduleRows',
  'foodNodeOccupationRows', 'foodExpeditionRows', 'foodExpeditionScheduleRows',
  'woodNodeOccupationRows', 'woodExpeditionRows', 'woodExpeditionScheduleRows',
  'stoneNodeOccupationRows', 'stoneExpeditionRows',
  'stoneExpeditionScheduleRows', 'workerAssignmentRows',
  'workerNodeOccupationRows', 'workerAssignmentScheduleRows',
] as const);

export const GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS = Object.freeze([
  ...BOOLEAN_FIELDS,
  ...OPTIONAL_STRING_FIELDS,
  ...OPTIONAL_U64_FIELDS,
  ...STRING_FIELDS,
  ...U32_FIELDS,
  ...U64_FIELDS,
] as const);

type BooleanField = typeof BOOLEAN_FIELDS[number];
type OptionalStringField = typeof OPTIONAL_STRING_FIELDS[number];
type OptionalU64Field = typeof OPTIONAL_U64_FIELDS[number];
type StringField = typeof STRING_FIELDS[number];
type U32Field = typeof U32_FIELDS[number];
type U64Field = typeof U64_FIELDS[number];

export type GreaterRealmProductionCutoverStatus = Readonly<
  Record<BooleanField, boolean>
  & Record<OptionalStringField, string | undefined>
  & Record<OptionalU64Field, bigint | undefined>
  & Record<StringField, string>
  & Record<U32Field, number>
  & Record<U64Field, bigint>
>;

export type GreaterRealmProductionCompileMode = Readonly<{
  importMutationsCompiled: boolean;
  activationMutationsCompiled: boolean;
}>;

export type GreaterRealmProductionRelocationReceipt = Readonly<{
  schemaVersion: 1;
  kind: 'warpkeep-greater-realm-production-relocation-v1';
  command: GreaterRealmProductionRelocationCommand;
  reducer?: GreaterRealmProductionRelocationReducer;
  outcome: 'inspected' | 'already-satisfied' | 'verified' | 'verified-after-submission-error';
  submitted: boolean;
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  beforeMode: string;
  afterMode: string;
  releaseState: string;
  currentFounderCount: number;
  founderCapacityRemaining: number;
  activeClaimRows: string;
  occupancyRows: string;
  legacyClaimRows: string;
  auditRowsBefore: string;
  auditRowsAfter: string;
  auditRowsDelta: '0' | '1';
  activeAdmissionEligible: boolean;
  topologySnapshotDigest?: string;
  relocationPlanDigest?: string;
  statusDigest: string;
}>;

export type GreaterRealmProductionRelocationTransport = Readonly<{
  inspect: () => Promise<unknown>;
  submit: (
    reducer: GreaterRealmProductionRelocationReducer,
    arguments_: Readonly<Record<never, never>>,
  ) => Promise<void>;
}>;

export class GreaterRealmProductionRelocationError extends Error {
  constructor(
    readonly code: string,
    readonly submitted = false,
  ) {
    super(code);
    this.name = 'GreaterRealmProductionRelocationError';
  }
}

function fail(code: string, submitted = false): never {
  throw new GreaterRealmProductionRelocationError(code, submitted);
}

function exactKeys(value: Readonly<Record<string, unknown>>): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...GREATER_REALM_PRODUCTION_CUTOVER_STATUS_FIELDS].sort();
  return actual.length === expected.length
    && actual.every((key, index) => key === expected[index]);
}

function record(value: unknown): Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVALID');
  }
  return value as Readonly<Record<string, unknown>>;
}

function readU64(value: unknown): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > ((1n << 64n) - 1n)) {
    fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVALID');
  }
  return value;
}

function readU32(value: unknown): number {
  if (!Number.isInteger(value) || (value as number) < 0 || (value as number) > 0xffff_ffff) {
    fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVALID');
  }
  return value as number;
}

function readString(value: unknown): string {
  if (
    typeof value !== 'string'
    || value.length < 1
    || value.length > 512
    || /[\u0000-\u001f\u007f]/u.test(value)
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVALID');
  return value;
}

const RELEASE_STATES = new Set([
  'absent', 'importing', 'verifying', 'ready', 'canary', 'active', 'halted', 'rolled-back',
]);
const ACTIVATION_MODES = new Set([
  'absent', 'prepared', 'draining', 'frozen', 'planned', 'canary', 'active',
  'halted', 'rolled-back',
]);
const ROOT_MODES = new Set(['absent', 'canary', 'active', 'halted']);
const VERIFY_PHASES = new Set([
  'absent', 'components', 'chunks', 'cells', 'component-slots', 'slots',
  'component-resources', 'resources', 'component-finalize', 'complete',
]);

function decodeGreaterRealmProductionCutoverStatus(
  value: unknown,
): GreaterRealmProductionCutoverStatus {
  const input = record(value);
  if (!exactKeys(input)) fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_SHAPE_CHANGED');
  const output: Record<string, unknown> = {};
  for (const field of BOOLEAN_FIELDS) {
    if (typeof input[field] !== 'boolean') fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVALID');
    output[field] = input[field];
  }
  for (const field of OPTIONAL_STRING_FIELDS) {
    output[field] = input[field] === undefined ? undefined : readString(input[field]);
  }
  for (const field of OPTIONAL_U64_FIELDS) {
    output[field] = input[field] === undefined ? undefined : readU64(input[field]);
  }
  for (const field of STRING_FIELDS) output[field] = readString(input[field]);
  for (const field of U32_FIELDS) output[field] = readU32(input[field]);
  for (const field of U64_FIELDS) output[field] = readU64(input[field]);
  const status = Object.freeze(output) as GreaterRealmProductionCutoverStatus;
  if (
    !RELEASE_STATES.has(status.releaseState)
    || !ACTIVATION_MODES.has(status.activationMode)
    || !ROOT_MODES.has(status.atlasMode)
    || !ROOT_MODES.has(status.workerSystemV2Mode)
    || !VERIFY_PHASES.has(status.verificationPhase)
    || !['absent', 'staged', 'active'].includes(status.workerSystemV1Mode)
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_MODE_INVALID');
  return status;
}

/** Exact generated shape/type decoder; callers must add phase-specific invariants. */
export function projectGreaterRealmProductionCutoverStatusShape(
  value: unknown,
): GreaterRealmProductionCutoverStatus {
  return decodeGreaterRealmProductionCutoverStatus(value);
}

/** Strict parser for a publisher checkpoint with one exact compile mode. */
export function projectGreaterRealmProductionCutoverStatusForCompileMode(
  value: unknown,
  compileMode: GreaterRealmProductionCompileMode,
): GreaterRealmProductionCutoverStatus {
  if (
    typeof compileMode.importMutationsCompiled !== 'boolean'
    || typeof compileMode.activationMutationsCompiled !== 'boolean'
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_COMPILE_MODE_INVALID');
  const status = decodeGreaterRealmProductionCutoverStatus(value);
  assertGreaterRealmProductionCutoverInvariants(status, compileMode);
  return status;
}

/** Strict relocation/active-verifier parser: import off, activation on. */
export function projectGreaterRealmProductionCutoverStatus(
  value: unknown,
): GreaterRealmProductionCutoverStatus {
  return projectGreaterRealmProductionCutoverStatusForCompileMode(value, {
    importMutationsCompiled: false,
    activationMutationsCompiled: true,
  });
}

function exactPopulation(status: GreaterRealmProductionCutoverStatus): boolean {
  const population = BigInt(status.currentFounderCount);
  return status.castleRows === population
    && status.profileRows === population
    && status.markAccountRows === population
    && status.resourceAccountRows === population
    && status.allowedFidRows === population
    && status.enabledAllowedFidRows <= status.allowedFidRows
    && status.castleWorkerRows === population * 4n
    && status.idleCastleWorkerRows + status.nonIdleCastleWorkerRows
      === status.castleWorkerRows;
}

function journeyRows(status: GreaterRealmProductionCutoverStatus): bigint {
  return status.goldNodeOccupationRows + status.goldExpeditionRows
    + status.goldExpeditionScheduleRows + status.foodNodeOccupationRows
    + status.foodExpeditionRows + status.foodExpeditionScheduleRows
    + status.woodNodeOccupationRows + status.woodExpeditionRows
    + status.woodExpeditionScheduleRows + status.stoneNodeOccupationRows
    + status.stoneExpeditionRows + status.stoneExpeditionScheduleRows
    + status.workerAssignmentRows + status.workerNodeOccupationRows
    + status.workerAssignmentScheduleRows;
}

function assertPublicActiveGraph(
  status: GreaterRealmProductionCutoverStatus,
  mode: 'canary' | 'active' | 'halted',
): void {
  const population = BigInt(status.currentFounderCount);
  if (
    status.releaseState !== mode
    || status.activationMode !== mode
    || status.atlasRows !== 1n
    || status.atlasMode !== mode
    || status.visibleRegionRows !== 6n
    || status.activeVisibleRegionRows !== 6n
    || status.workerSystemV2Rows !== 1n
    || status.workerSystemV2Mode !== mode
    || status.activeSlotRows !== 600n
    || status.activeResourceNodeRows !== 12_000n
    || status.greaterRealmClaimRows !== population
    || status.greaterRealmOccupancyRows !== population
    || status.activeClaimRows !== population
    || status.legacyClaimRows !== 0n
    || status.legacyOccupiedWorldTileRows !== 0n
    || status.legacyRealmActive
    || status.legacyRealmRows !== 1n
    || status.workerSystemV2CurrentCastleCount !== status.currentFounderCount
    || status.workerSystemV2CurrentWorkerCount !== status.currentFounderCount * 4
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_PUBLIC_GRAPH_INVALID');
}

export function assertGreaterRealmProductionCutoverInvariants(
  status: GreaterRealmProductionCutoverStatus,
  compileMode: GreaterRealmProductionCompileMode = Object.freeze({
    importMutationsCompiled: false,
    activationMutationsCompiled: true,
  }),
): void {
  if (
    status.importMutationsCompiled !== compileMode.importMutationsCompiled
    || status.activationMutationsCompiled !== compileMode.activationMutationsCompiled
    || status.releaseRows !== (status.releasePresent ? 1n : 0n)
    || status.activationRows !== (status.activationPresent ? 1n : 0n)
    || status.releasePresent !== (status.atlasId !== undefined)
    || status.releasePresent !== (status.publicReleaseId !== undefined)
    || status.releasePresent !== (status.sourceCommit !== undefined)
    || status.releasePresent !== (status.importEpoch !== undefined)
    || status.activationPresent !== (status.activationMode !== 'absent')
    || status.castleCapacity !== 600
    || status.currentFounderCount > status.castleCapacity
    || status.founderCapacityRemaining
      !== status.castleCapacity - status.currentFounderCount
    || status.expectedRegionCount !== 6
    || status.expectedSlotCount !== 600
    || status.regionManifestRows !== status.expectedRegionCount
    || status.componentExpectedCellCount !== status.importedPassableCellCount
    || status.importedPassableCellCount > status.expectedCellCount
    || status.componentExpectedSlotCount !== status.expectedSlotCount
    || status.componentExpectedResourceNodeCount !== status.expectedResourceNodeCount
    || status.verifiedComponentCount !== status.expectedComponentCount
    || status.verifiedChunkCount !== status.expectedChunkCount
    || status.verifiedCellCount !== status.expectedCellCount
    || status.verifiedSlotCount !== status.expectedSlotCount
    || status.verifiedResourceNodeCount !== status.expectedResourceNodeCount
    || status.verificationPhase !== 'complete'
    || status.verificationCursor !== 0n
    || !status.releaseVerificationExact
    || status.componentRows !== BigInt(status.expectedComponentCount)
    || status.chunkRows !== BigInt(status.expectedChunkCount)
    || status.cellRows !== BigInt(status.expectedCellCount)
    || status.slotRows !== BigInt(status.expectedSlotCount)
    || status.resourceNodeRows !== 12_000n
    || status.expectedResourceNodeCount !== 12_000
    || status.unknownClaimStateRows !== 0n
    || status.unknownClaimKindRows !== 0n
    || !exactPopulation(status)
    || status.currentWorldIntegrityViolationCount !== 0
    || (status.currentWorldGraphApplicable && !status.currentWorldGraphExact)
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_STATUS_INVARIANT_FAILED');

  const assignedFounderCount = status.lowlandsFounderCount
    + status.frostmereFounderCount + status.sunscarFounderCount
    + status.mirefenFounderCount + status.stonewakeFounderCount
    + status.emberwoodFounderCount + status.unassignedRegionFounderCount;
  if (
    (status.currentWorldGraphApplicable
      && (assignedFounderCount !== status.currentFounderCount
        || status.unassignedRegionFounderCount !== 0))
    || (!status.currentWorldGraphApplicable && assignedFounderCount !== 0)
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_REGION_COUNTS_INVALID');

  if (status.releaseState === 'canary') assertPublicActiveGraph(status, 'canary');
  if (status.releaseState === 'active') assertPublicActiveGraph(status, 'active');
  if (status.releaseState === 'halted' && status.currentWorldGraphApplicable) {
    assertPublicActiveGraph(status, 'halted');
  }
  if (
    status.activeAdmissionEligible !== (
      status.releaseState === 'active'
      && status.activationMode === 'active'
      && status.currentWorldGraphExact
      && status.atlasMode === 'active'
      && status.workerSystemV2Mode === 'active'
      && status.founderCapacityRemaining > 0
    )
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_ADMISSION_GATE_INVALID');
  if (
    (status.activationMode === 'frozen'
      || status.activationMode === 'planned'
      || status.activationMode === 'canary')
    && (status.nonIdleCastleWorkerRows !== 0n || journeyRows(status) !== 0n)
  ) fail('GREATER_REALM_PRODUCTION_CUTOVER_QUIET_WINDOW_INVALID');
}

type MutationCommand = Exclude<GreaterRealmProductionRelocationCommand, 'inspect'>;

function targetMode(command: MutationCommand, before: GreaterRealmProductionCutoverStatus): string {
  if (command === 'prepare') return 'prepared';
  if (command === 'begin-drain') return 'draining';
  if (command === 'freeze') return 'frozen';
  if (command === 'plan') return 'planned';
  if (command === 'canary') return 'canary';
  if (command === 'commit' || command === 'resume') return 'active';
  if (command === 'halt') return 'halted';
  if (command === 'rollback') return 'rolled-back';
  return before.activationMode;
}

function commandIsAlreadySatisfied(
  command: MutationCommand,
  status: GreaterRealmProductionCutoverStatus,
): boolean {
  return status.activationMode === targetMode(command, status)
    && (command !== 'rollback' || status.releaseState === 'ready')
    && (command !== 'commit' && command !== 'resume' || status.releaseState === 'active')
    && (command !== 'halt' || status.releaseState === 'halted');
}

function assertCommandPrecondition(
  command: MutationCommand,
  status: GreaterRealmProductionCutoverStatus,
): void {
  if (
    !status.releasePresent
    || !status.releaseImportsExact
    || !status.releaseVerificationExact
  ) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_RELEASE_NOT_READY');
  }
  if (commandIsAlreadySatisfied(command, status)) return;
  const allowed = command === 'prepare'
    ? !status.activationPresent && status.releaseReady && status.releaseState === 'ready'
    : command === 'begin-drain'
      ? status.activationMode === 'prepared'
      : command === 'freeze'
        ? status.activationMode === 'draining'
        : command === 'plan'
          ? status.activationMode === 'frozen'
          : command === 'canary'
            ? status.activationMode === 'planned'
            : command === 'commit'
              ? status.activationMode === 'canary'
              : command === 'halt'
                ? status.activationPresent && status.activationMode !== 'rolled-back'
                : command === 'resume'
                  ? status.activationMode === 'halted' && status.resumeEligible
                  : status.rollbackEligible;
  if (!allowed) fail('GREATER_REALM_PRODUCTION_RELOCATION_TRANSITION_BLOCKED');
}

function assertPopulationUnchanged(
  before: GreaterRealmProductionCutoverStatus,
  after: GreaterRealmProductionCutoverStatus,
): void {
  for (const field of [
    'castleCapacity', 'currentFounderCount', 'founderCapacityRemaining',
    'castleRows', 'profileRows', 'markAccountRows', 'resourceAccountRows',
    'allowedFidRows', 'enabledAllowedFidRows', 'castleWorkerRows',
  ] as const) {
    if (after[field] !== before[field]) {
      fail('GREATER_REALM_PRODUCTION_RELOCATION_POPULATION_CHANGED', true);
    }
  }
}

function assertPostcondition(
  command: MutationCommand,
  before: GreaterRealmProductionCutoverStatus,
  after: GreaterRealmProductionCutoverStatus,
): void {
  assertPopulationUnchanged(before, after);
  if (after.auditRows !== before.auditRows + 1n) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_AUDIT_DELTA_INVALID', true);
  }
  if (after.activationMode !== targetMode(command, before)) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_POSTCONDITION_FAILED', true);
  }
  if (
    (command === 'canary' && after.releaseState !== 'canary')
    || ((command === 'commit' || command === 'resume') && after.releaseState !== 'active')
    || (command === 'halt' && after.releaseState !== 'halted')
    || (command === 'rollback' && after.releaseState !== 'ready')
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_POSTCONDITION_FAILED', true);
  if (
    command === 'rollback'
    && (after.rollbackEligible || after.resumeEligible || after.everActive)
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_ROLLBACK_INVALID', true);
  if (
    command === 'commit'
    && (!after.everActive || after.rollbackEligible || after.resumeEligible)
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_COMMIT_INVALID', true);
  if (command === 'resume' && (!after.everActive || after.resumeEligible)) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_RESUME_INVALID', true);
  }
}

function canonicalStatus(status: GreaterRealmProductionCutoverStatus): string {
  return JSON.stringify(Object.fromEntries(Object.entries(status)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value])));
}

function statusDigest(status: GreaterRealmProductionCutoverStatus): string {
  return createHash('sha256')
    .update('warpkeep-greater-realm-production-cutover-status-v1\0', 'utf8')
    .update(canonicalStatus(status), 'utf8')
    .digest('hex');
}

export function digestGreaterRealmProductionCutoverStatus(
  status: GreaterRealmProductionCutoverStatus,
): string {
  return statusDigest(status);
}

function assertExpectedAtlasRelease(
  status: GreaterRealmProductionCutoverStatus,
  expected: Readonly<{
    atlasSourceCommit: string;
    atlasId: string;
    publicReleaseId: string;
    expectedReleaseSha256: string;
  }>,
  submitted = false,
): void {
  if (
    status.sourceCommit !== expected.atlasSourceCommit
    || status.atlasId !== expected.atlasId
    || status.publicReleaseId !== expected.publicReleaseId
    || status.expectedReleaseSha256 !== expected.expectedReleaseSha256
  ) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_ATLAS_RELEASE_MISMATCH', submitted);
  }
}

function receipt(input: Readonly<{
  command: GreaterRealmProductionRelocationCommand;
  outcome: GreaterRealmProductionRelocationReceipt['outcome'];
  submitted: boolean;
  reducer?: GreaterRealmProductionRelocationReducer;
  atlasSourceCommit: string;
  atlasId: string;
  publicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  before: GreaterRealmProductionCutoverStatus;
  after: GreaterRealmProductionCutoverStatus;
}>): GreaterRealmProductionRelocationReceipt {
  return Object.freeze({
    schemaVersion: 1,
    kind: 'warpkeep-greater-realm-production-relocation-v1',
    command: input.command,
    ...(input.reducer === undefined ? {} : { reducer: input.reducer }),
    outcome: input.outcome,
    submitted: input.submitted,
    atlasSourceCommit: input.atlasSourceCommit,
    atlasId: input.atlasId,
    publicReleaseId: input.publicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
    moduleSourceCommit: input.moduleSourceCommit,
    beforeMode: input.before.activationMode,
    afterMode: input.after.activationMode,
    releaseState: input.after.releaseState,
    currentFounderCount: input.after.currentFounderCount,
    founderCapacityRemaining: input.after.founderCapacityRemaining,
    activeClaimRows: input.after.activeClaimRows.toString(),
    occupancyRows: input.after.greaterRealmOccupancyRows.toString(),
    legacyClaimRows: input.after.legacyClaimRows.toString(),
    auditRowsBefore: input.before.auditRows.toString(),
    auditRowsAfter: input.after.auditRows.toString(),
    auditRowsDelta: (input.after.auditRows - input.before.auditRows).toString() as '0' | '1',
    activeAdmissionEligible: input.after.activeAdmissionEligible,
    topologySnapshotDigest: input.after.topologySnapshotDigest,
    relocationPlanDigest: input.after.relocationPlanDigest,
    statusDigest: statusDigest(input.after),
  });
}

/** One explicit relocation phase with status-before-write reconciliation. */
export async function executeGreaterRealmProductionRelocation(input: Readonly<{
  command: GreaterRealmProductionRelocationCommand;
  confirmed: boolean;
  expectedAtlasSourceCommit: string;
  expectedAtlasId: string;
  expectedPublicReleaseId: string;
  expectedReleaseSha256: string;
  moduleSourceCommit: string;
  transport: GreaterRealmProductionRelocationTransport;
}>): Promise<GreaterRealmProductionRelocationReceipt> {
  if (!Object.values(GREATER_REALM_PRODUCTION_RELOCATION_COMMAND).includes(input.command)) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_COMMAND_INVALID');
  }
  if (input.command !== 'inspect' && !input.confirmed) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_CONFIRMATION_REQUIRED');
  }
  if (
    !/^[0-9a-f]{40}$/u.test(input.expectedAtlasSourceCommit)
    || !/^[0-9a-f]{40}$/u.test(input.moduleSourceCommit)
    || typeof input.expectedAtlasId !== 'string'
    || input.expectedAtlasId.length < 1
    || typeof input.expectedPublicReleaseId !== 'string'
    || input.expectedPublicReleaseId.length < 1
    || !/^[0-9a-f]{64}$/u.test(input.expectedReleaseSha256)
  ) fail('GREATER_REALM_PRODUCTION_RELOCATION_SOURCE_PROVENANCE_INVALID');
  const expectedAtlasRelease = Object.freeze({
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
  });
  let before: GreaterRealmProductionCutoverStatus;
  try {
    before = projectGreaterRealmProductionCutoverStatus(await input.transport.inspect());
    assertExpectedAtlasRelease(before, expectedAtlasRelease);
  } catch (error) {
    if (error instanceof GreaterRealmProductionRelocationError) throw error;
    fail('GREATER_REALM_PRODUCTION_RELOCATION_INITIAL_INSPECTION_UNAVAILABLE');
  }
  if (input.command === 'inspect') {
    return receipt({
      command: input.command,
      outcome: 'inspected',
      submitted: false,
      atlasSourceCommit: input.expectedAtlasSourceCommit,
      atlasId: input.expectedAtlasId,
      publicReleaseId: input.expectedPublicReleaseId,
      expectedReleaseSha256: input.expectedReleaseSha256,
      moduleSourceCommit: input.moduleSourceCommit,
      before,
      after: before,
    });
  }
  assertCommandPrecondition(input.command, before);
  const reducer = GREATER_REALM_PRODUCTION_RELOCATION_REDUCERS[input.command];
  if (commandIsAlreadySatisfied(input.command, before)) {
    return receipt({
      command: input.command,
      reducer,
      outcome: 'already-satisfied',
      submitted: false,
      before,
      after: before,
      atlasSourceCommit: input.expectedAtlasSourceCommit,
      atlasId: input.expectedAtlasId,
      publicReleaseId: input.expectedPublicReleaseId,
      expectedReleaseSha256: input.expectedReleaseSha256,
      moduleSourceCommit: input.moduleSourceCommit,
    });
  }

  let fresh: GreaterRealmProductionCutoverStatus;
  try {
    fresh = projectGreaterRealmProductionCutoverStatus(await input.transport.inspect());
    assertExpectedAtlasRelease(fresh, expectedAtlasRelease);
  } catch (error) {
    if (error instanceof GreaterRealmProductionRelocationError) throw error;
    fail('GREATER_REALM_PRODUCTION_RELOCATION_PREWRITE_INSPECTION_UNAVAILABLE');
  }
  if (canonicalStatus(fresh) !== canonicalStatus(before)) {
    fail('GREATER_REALM_PRODUCTION_RELOCATION_PREWRITE_STATUS_CHANGED');
  }
  assertCommandPrecondition(input.command, fresh);

  let submissionFailed = false;
  try {
    await input.transport.submit(reducer, Object.freeze({}));
  } catch {
    submissionFailed = true;
  }
  let after: GreaterRealmProductionCutoverStatus;
  try {
    after = projectGreaterRealmProductionCutoverStatus(await input.transport.inspect());
    assertExpectedAtlasRelease(after, expectedAtlasRelease, true);
  } catch (error) {
    if (error instanceof GreaterRealmProductionRelocationError) throw error;
    fail('GREATER_REALM_PRODUCTION_RELOCATION_MUTATION_OUTCOME_AMBIGUOUS', true);
  }
  try {
    assertPostcondition(input.command, fresh, after);
  } catch (error) {
    if (error instanceof GreaterRealmProductionRelocationError) throw error;
    fail('GREATER_REALM_PRODUCTION_RELOCATION_POSTCONDITION_FAILED', true);
  }
  return receipt({
    command: input.command,
    reducer,
    outcome: submissionFailed ? 'verified-after-submission-error' : 'verified',
    submitted: true,
    atlasSourceCommit: input.expectedAtlasSourceCommit,
    atlasId: input.expectedAtlasId,
    publicReleaseId: input.expectedPublicReleaseId,
    expectedReleaseSha256: input.expectedReleaseSha256,
    moduleSourceCommit: input.moduleSourceCommit,
    before: fresh,
    after,
  });
}

export const greaterRealmProductionRelocationTestSeams = Object.freeze({
  canonicalStatus,
  journeyRows,
  statusDigest,
});
