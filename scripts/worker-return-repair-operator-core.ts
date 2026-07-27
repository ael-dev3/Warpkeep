import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} from 'node:path';

import type {
  AdminRepairMissingWorkerReturnScheduleV1Params,
} from '../src/spacetime/module_bindings/types/reducers';

export const WORKER_RETURN_REPAIR_PRODUCTION_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  bridge: 'https://auth.warpkeep.com',
  label: 'warpkeep-production',
});

export const WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY =
  'genesis-001-worker-return-schedule-repair-v1';
export const WORKER_RETURN_SCHEDULE_REPAIR_REDUCER =
  'admin_repair_missing_worker_return_schedule_v1';

const U64_MAXIMUM = (1n << 64n) - 1n;
const U32_MAXIMUM = 0xffff_ffffn;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const ROSTER_DIGEST_HEX = /^[0-9a-f]{16}$/;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const RECEIPT_NAME =
  /^worker-return-repair-\d{8}T\d{9}Z-(?:inspect|apply)-[0-9a-f]{12}\.json$/;
const TEMPORARY_RECEIPT_NAME =
  /^\.worker-return-repair-\d{8}T\d{9}Z-(?:inspect|apply)-[0-9a-f]{12}\.json\.tmp$/;
const LOCK_NAME = '.worker-return-repair.lock';

const STATUS_U64_FIELDS = Object.freeze([
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
] as const);

const STATUS_BOOLEAN_FIELDS = Object.freeze([
  'systemConfigValid',
  'legacyDrainRequired',
  'expectedCountsMatch',
  'rosterDigestMatches',
] as const);

const STATUS_STRING_FIELDS = Object.freeze([
  'mode',
  'rosterDigest',
  'rosterDigestExpected',
] as const);

const STATUS_KEYS = Object.freeze([
  ...STATUS_U64_FIELDS,
  ...STATUS_BOOLEAN_FIELDS,
  ...STATUS_STRING_FIELDS,
].sort());

const STRUCTURAL_ZERO_FIELDS = Object.freeze([
  'castlesMissingWorkers',
  'castlesWithExtraWorkers',
  'duplicateOrdinals',
  'malformedWorkerIds',
  'invalidWorkerStates',
  'orphanWorkers',
  'orphanAssignments',
  'assignmentsMissingOccupation',
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
] as const);

type StatusU64Field = (typeof STATUS_U64_FIELDS)[number];
type StatusBooleanField = (typeof STATUS_BOOLEAN_FIELDS)[number];
type StatusStringField = (typeof STATUS_STRING_FIELDS)[number];

export type WorkerReturnRepairStatus = Readonly<
  Record<StatusU64Field, bigint>
  & Record<StatusBooleanField, boolean>
  & Record<StatusStringField, string>
>;

export type WorkerReturnRepairCommand = 'inspect' | 'apply';

export type WorkerReturnRepairLocalAttestation = Readonly<{
  sourceCommit: string;
  moduleArtifactDigest: string;
  publicationReceiptDigest: string;
}>;

export type WorkerReturnRepairEnvelope = Readonly<
  AdminRepairMissingWorkerReturnScheduleV1Params
>;

export type WorkerReturnRepairOutcome =
  | 'intent-recorded'
  | 'inspected'
  | 'already-healthy'
  | 'schedule-restored'
  | 'return-completed'
  | 'verified-after-submission-error'
  | 'blocked'
  | 'mutation-rejected-or-uncommitted'
  | 'mutation-outcome-ambiguous';

export type WorkerReturnRepairExecutionRecord = Readonly<{
  command: WorkerReturnRepairCommand;
  outcome: WorkerReturnRepairOutcome;
  submitted: boolean;
  reducer?: typeof WORKER_RETURN_SCHEDULE_REPAIR_REDUCER;
  envelope?: WorkerReturnRepairEnvelope;
  before?: WorkerReturnRepairStatus;
  after?: WorkerReturnRepairStatus;
  verifiedTransition?: 'schedule-restored' | 'return-completed';
  reasonCode?: string;
}>;

export class WorkerReturnRepairOperatorError extends Error {
  constructor(
    readonly code: string,
    readonly record?: WorkerReturnRepairExecutionRecord,
  ) {
    super(code);
    this.name = 'WorkerReturnRepairOperatorError';
  }
}

function fail(
  code: string,
  record?: WorkerReturnRepairExecutionRecord,
): never {
  throw new WorkerReturnRepairOperatorError(code, record);
}

function exactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

export function projectWorkerReturnRepairStatus(
  value: unknown,
): WorkerReturnRepairStatus {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('WORKER_RETURN_REPAIR_STATUS_INVALID');
  }
  const status = value as Readonly<Record<string, unknown>>;
  if (!exactKeys(status, STATUS_KEYS)) {
    fail('WORKER_RETURN_REPAIR_STATUS_FIELDS_INVALID');
  }
  for (const field of STATUS_U64_FIELDS) {
    if (
      typeof status[field] !== 'bigint'
      || status[field] < 0n
      || status[field] > U64_MAXIMUM
    ) fail('WORKER_RETURN_REPAIR_STATUS_COUNT_INVALID');
  }
  for (const field of STATUS_BOOLEAN_FIELDS) {
    if (typeof status[field] !== 'boolean') {
      fail('WORKER_RETURN_REPAIR_STATUS_FLAG_INVALID');
    }
  }
  if (
    status.mode !== 'absent'
    && status.mode !== 'staged'
    && status.mode !== 'active'
  ) fail('WORKER_RETURN_REPAIR_STATUS_MODE_INVALID');
  if (
    typeof status.rosterDigest !== 'string'
    || (
      status.rosterDigest !== ''
      && !ROSTER_DIGEST_HEX.test(status.rosterDigest)
    )
    || typeof status.rosterDigestExpected !== 'string'
    || !ROSTER_DIGEST_HEX.test(status.rosterDigestExpected)
  ) fail('WORKER_RETURN_REPAIR_STATUS_ROSTER_DIGEST_INVALID');
  return Object.freeze(Object.fromEntries(
    [...STATUS_U64_FIELDS, ...STATUS_BOOLEAN_FIELDS, ...STATUS_STRING_FIELDS]
      .map(field => [field, status[field]]),
  )) as WorkerReturnRepairStatus;
}

function activeWorkerCount(status: WorkerReturnRepairStatus): bigint {
  return status.outboundWorkers
    + status.gatheringWorkers
    + status.returningWorkers;
}

function exactActiveBaseline(status: WorkerReturnRepairStatus): boolean {
  const activeWorkers = activeWorkerCount(status);
  return status.mode === 'active'
    && status.systemRows === 1n
    && status.systemConfigValid
    && !status.legacyDrainRequired
    && status.expectedCastleCount >= 1n
    && status.expectedCastleCount <= 100n
    && status.expectedWorkerCount === status.expectedCastleCount * 4n
    && status.actualWorkerCount === status.expectedWorkerCount
    && status.expectedCountsMatch
    && status.rosterDigestMatches
    && ROSTER_DIGEST_HEX.test(status.rosterDigest)
    && status.rosterDigest === status.rosterDigestExpected
    && status.idleWorkers + activeWorkers === status.actualWorkerCount
    && status.assignments === activeWorkers
    && status.occupations
      === status.outboundWorkers + status.gatheringWorkers
    && STRUCTURAL_ZERO_FIELDS.every(field => status[field] === 0n);
}

export function classifyWorkerReturnRepairStatus(
  status: WorkerReturnRepairStatus,
): 'healthy' | 'candidate' | 'blocked' {
  if (!exactActiveBaseline(status)) return 'blocked';
  if (
    status.assignmentsWithoutSingleSchedule === 0n
    && status.schedules === status.assignments
  ) return 'healthy';
  if (
    status.returningWorkers >= 1n
    && status.assignmentsWithoutSingleSchedule === 1n
    && status.schedules + 1n === status.assignments
  ) return 'candidate';
  return 'blocked';
}

function toU32(value: bigint, code: string): number {
  if (value < 0n || value > U32_MAXIMUM) fail(code);
  return Number(value);
}

export function buildWorkerReturnRepairEnvelope(
  status: WorkerReturnRepairStatus,
  attestation: WorkerReturnRepairLocalAttestation,
): WorkerReturnRepairEnvelope {
  if (classifyWorkerReturnRepairStatus(status) !== 'candidate') {
    fail('WORKER_RETURN_REPAIR_PRECONDITION_MISMATCH');
  }
  if (
    !GIT_COMMIT_HEX.test(attestation.sourceCommit)
    || !SHA256_HEX.test(attestation.moduleArtifactDigest)
    || !SHA256_HEX.test(attestation.publicationReceiptDigest)
  ) fail('WORKER_RETURN_REPAIR_LOCAL_ATTESTATION_INVALID');
  return Object.freeze({
    capability: WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY,
    sourceCommit: attestation.sourceCommit,
    moduleArtifactDigest: attestation.moduleArtifactDigest,
    expectedCastleCount: toU32(
      status.expectedCastleCount,
      'WORKER_RETURN_REPAIR_CASTLE_COUNT_OUT_OF_RANGE',
    ),
    expectedWorkerCount: toU32(
      status.expectedWorkerCount,
      'WORKER_RETURN_REPAIR_WORKER_COUNT_OUT_OF_RANGE',
    ),
    expectedAssignments: toU32(
      status.assignments,
      'WORKER_RETURN_REPAIR_ASSIGNMENT_COUNT_OUT_OF_RANGE',
    ),
    expectedOccupations: toU32(
      status.occupations,
      'WORKER_RETURN_REPAIR_OCCUPATION_COUNT_OUT_OF_RANGE',
    ),
    expectedSchedules: toU32(
      status.schedules,
      'WORKER_RETURN_REPAIR_SCHEDULE_COUNT_OUT_OF_RANGE',
    ),
    expectedReturningWorkers: toU32(
      status.returningWorkers,
      'WORKER_RETURN_REPAIR_RETURNING_COUNT_OUT_OF_RANGE',
    ),
    expectedMissingSchedules: 1,
    rosterDigest: status.rosterDigest,
  });
}

function statusEquals(
  left: WorkerReturnRepairStatus,
  right: WorkerReturnRepairStatus,
): boolean {
  return [...STATUS_U64_FIELDS, ...STATUS_BOOLEAN_FIELDS, ...STATUS_STRING_FIELDS]
    .every(field => left[field] === right[field]);
}

function sameExcept(
  before: WorkerReturnRepairStatus,
  after: WorkerReturnRepairStatus,
  exceptions: ReadonlySet<string>,
): boolean {
  return [...STATUS_U64_FIELDS, ...STATUS_BOOLEAN_FIELDS, ...STATUS_STRING_FIELDS]
    .every(field => exceptions.has(field) || before[field] === after[field]);
}

export function verifyWorkerReturnRepairTransition(
  before: WorkerReturnRepairStatus,
  after: WorkerReturnRepairStatus,
): 'schedule-restored' | 'return-completed' {
  if (
    classifyWorkerReturnRepairStatus(before) !== 'candidate'
    || classifyWorkerReturnRepairStatus(after) !== 'healthy'
  ) fail('WORKER_RETURN_REPAIR_POSTCONDITION_NOT_HEALTHY');

  if (
    sameExcept(before, after, new Set([
      'schedules',
      'assignmentsWithoutSingleSchedule',
    ]))
    && after.schedules === before.schedules + 1n
    && after.assignmentsWithoutSingleSchedule === 0n
  ) return 'schedule-restored';

  if (
    sameExcept(before, after, new Set([
      'idleWorkers',
      'returningWorkers',
      'assignments',
      'assignmentsWithoutSingleSchedule',
    ]))
    && after.idleWorkers === before.idleWorkers + 1n
    && after.returningWorkers + 1n === before.returningWorkers
    && after.assignments + 1n === before.assignments
    && after.schedules === before.schedules
    && after.assignmentsWithoutSingleSchedule === 0n
  ) return 'return-completed';

  fail('WORKER_RETURN_REPAIR_POSTCONDITION_DRIFT');
}

function blockedRecord(
  command: WorkerReturnRepairCommand,
  reasonCode: string,
  before?: WorkerReturnRepairStatus,
): WorkerReturnRepairExecutionRecord {
  return Object.freeze({
    command,
    outcome: 'blocked',
    submitted: false,
    ...(before === undefined ? {} : { before }),
    reasonCode,
  });
}

export async function executeWorkerReturnRepairCommand(input: Readonly<{
  command: WorkerReturnRepairCommand;
  confirmed: boolean;
  localAttestation?: WorkerReturnRepairLocalAttestation;
  inspect: () => Promise<unknown>;
  submit: (envelope: WorkerReturnRepairEnvelope) => Promise<void>;
}>): Promise<WorkerReturnRepairExecutionRecord> {
  if (input.command === 'apply' && !input.confirmed) {
    fail('WORKER_RETURN_REPAIR_CONFIRMATION_REQUIRED');
  }

  let rawBefore: unknown;
  try {
    rawBefore = await input.inspect();
  } catch {
    const reasonCode = 'WORKER_RETURN_REPAIR_INITIAL_INSPECTION_UNAVAILABLE';
    throw new WorkerReturnRepairOperatorError(
      reasonCode,
      blockedRecord(input.command, reasonCode),
    );
  }

  let before: WorkerReturnRepairStatus;
  try {
    before = projectWorkerReturnRepairStatus(rawBefore);
  } catch {
    const reasonCode = 'WORKER_RETURN_REPAIR_INITIAL_INSPECTION_INVALID';
    throw new WorkerReturnRepairOperatorError(
      reasonCode,
      blockedRecord(input.command, reasonCode),
    );
  }

  if (input.command === 'inspect') {
    return Object.freeze({
      command: input.command,
      outcome: 'inspected',
      submitted: false,
      before,
      after: before,
    });
  }

  const classification = classifyWorkerReturnRepairStatus(before);
  if (classification === 'healthy') {
    return Object.freeze({
      command: input.command,
      outcome: 'already-healthy',
      submitted: false,
      before,
      after: before,
    });
  }
  if (classification !== 'candidate') {
    const reasonCode = 'WORKER_RETURN_REPAIR_PRECONDITION_MISMATCH';
    throw new WorkerReturnRepairOperatorError(
      reasonCode,
      blockedRecord(input.command, reasonCode, before),
    );
  }

  let envelope: WorkerReturnRepairEnvelope;
  try {
    if (input.localAttestation === undefined) {
      fail('WORKER_RETURN_REPAIR_LOCAL_ATTESTATION_REQUIRED');
    }
    envelope = buildWorkerReturnRepairEnvelope(
      before,
      input.localAttestation,
    );
  } catch (error) {
    const reasonCode = error instanceof WorkerReturnRepairOperatorError
      ? error.code
      : 'WORKER_RETURN_REPAIR_LOCAL_ATTESTATION_INVALID';
    throw new WorkerReturnRepairOperatorError(
      reasonCode,
      blockedRecord(input.command, reasonCode, before),
    );
  }

  let submissionFailed = false;
  try {
    await input.submit(envelope);
  } catch {
    submissionFailed = true;
  }

  let rawAfter: unknown;
  try {
    rawAfter = await input.inspect();
  } catch {
    const reasonCode = 'WORKER_RETURN_REPAIR_POST_INSPECTION_UNAVAILABLE';
    const record = Object.freeze({
      command: input.command,
      outcome: 'mutation-outcome-ambiguous' as const,
      submitted: true,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope,
      before,
      reasonCode,
    });
    throw new WorkerReturnRepairOperatorError(reasonCode, record);
  }

  let after: WorkerReturnRepairStatus;
  try {
    after = projectWorkerReturnRepairStatus(rawAfter);
  } catch {
    const reasonCode = 'WORKER_RETURN_REPAIR_POST_INSPECTION_INVALID';
    const record = Object.freeze({
      command: input.command,
      outcome: 'mutation-outcome-ambiguous' as const,
      submitted: true,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope,
      before,
      reasonCode,
    });
    throw new WorkerReturnRepairOperatorError(reasonCode, record);
  }

  try {
    const verifiedTransition = verifyWorkerReturnRepairTransition(before, after);
    return Object.freeze({
      command: input.command,
      outcome: submissionFailed
        ? 'verified-after-submission-error'
        : verifiedTransition,
      submitted: true,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope,
      before,
      after,
      verifiedTransition,
      ...(submissionFailed
        ? {
            reasonCode:
              'WORKER_RETURN_REPAIR_SUBMISSION_ERROR_VERIFIED_BY_AGGREGATE',
          }
        : {}),
    });
  } catch {
    if (submissionFailed && statusEquals(before, after)) {
      const reasonCode =
        'WORKER_RETURN_REPAIR_MUTATION_REJECTED_OR_UNCOMMITTED';
      const record = Object.freeze({
        command: input.command,
        outcome: 'mutation-rejected-or-uncommitted' as const,
        submitted: true,
        reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
        envelope,
        before,
        after,
        reasonCode,
      });
      throw new WorkerReturnRepairOperatorError(reasonCode, record);
    }
    const reasonCode = 'WORKER_RETURN_REPAIR_MUTATION_OUTCOME_AMBIGUOUS';
    const record = Object.freeze({
      command: input.command,
      outcome: 'mutation-outcome-ambiguous' as const,
      submitted: true,
      reducer: WORKER_RETURN_SCHEDULE_REPAIR_REDUCER,
      envelope,
      before,
      after,
      reasonCode,
    });
    throw new WorkerReturnRepairOperatorError(reasonCode, record);
  }
}

export function parseWorkerReturnRepairArguments(
  argv: readonly string[],
): Readonly<{
  command: WorkerReturnRepairCommand;
  confirmed: boolean;
}> {
  const command = argv[0] as WorkerReturnRepairCommand | undefined;
  if (command !== 'inspect' && command !== 'apply') {
    fail('WORKER_RETURN_REPAIR_USAGE');
  }
  const flags = argv.slice(1);
  if (
    flags.some(flag => flag !== '--confirm')
    || new Set(flags).size !== flags.length
    || (command === 'inspect' && flags.length !== 0)
  ) fail('WORKER_RETURN_REPAIR_ARGUMENTS_INVALID');
  const confirmed = flags.includes('--confirm');
  if (command === 'apply' && !confirmed) {
    fail('WORKER_RETURN_REPAIR_CONFIRMATION_REQUIRED');
  }
  return Object.freeze({ command, confirmed });
}

export function canonicalWorkerReturnRepairTarget(
  env: Readonly<Record<string, string | undefined>>,
) {
  if (
    (
      env.WARPKEEP_SPACETIMEDB_URI !== undefined
      && env.WARPKEEP_SPACETIMEDB_URI
        !== WORKER_RETURN_REPAIR_PRODUCTION_TARGET.uri
    )
    || (
      env.WARPKEEP_SPACETIMEDB_DATABASE !== undefined
      && env.WARPKEEP_SPACETIMEDB_DATABASE
        !== WORKER_RETURN_REPAIR_PRODUCTION_TARGET.database
    )
    || (
      env.WARPKEEP_AUTH_BRIDGE_URL !== undefined
      && env.WARPKEEP_AUTH_BRIDGE_URL
        !== WORKER_RETURN_REPAIR_PRODUCTION_TARGET.bridge
    )
  ) fail('WORKER_RETURN_REPAIR_TARGET_OVERRIDE_REJECTED');
  return WORKER_RETURN_REPAIR_PRODUCTION_TARGET;
}

export function defaultWorkerReturnRepairReceiptDirectory(): string {
  return join(
    homedir(),
    'Library',
    'Application Support',
    'Warpkeep',
    'private',
    'worker-return-repair-receipts',
  );
}

function pathOverlaps(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === ''
    || (
      difference !== '..'
      && !difference.startsWith(`..${sep}`)
      && !isAbsolute(difference)
    );
}

function assertPrivateDirectory(
  directory: string,
  repositoryRoot: string,
): string {
  if (!isAbsolute(directory)) {
    fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_NOT_ABSOLUTE');
  }
  const resolvedDirectory = resolve(directory);
  const canonicalRepository = realpathSync(resolve(repositoryRoot));
  if (
    pathOverlaps(canonicalRepository, resolvedDirectory)
    || pathOverlaps(resolvedDirectory, canonicalRepository)
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');

  const missing: string[] = [];
  let ancestor = resolvedDirectory;
  while (!existsSync(ancestor)) {
    missing.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_INVALID');
    }
    ancestor = parent;
  }

  let inspected = ancestor;
  while (true) {
    const status = lstatSync(inspected);
    if (status.isSymbolicLink()) {
      fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_SYMLINK_REJECTED');
    }
    const parent = dirname(inspected);
    if (parent === inspected) break;
    inspected = parent;
  }

  const ancestorStatus = lstatSync(ancestor);
  if (!ancestorStatus.isDirectory() || ancestorStatus.isSymbolicLink()) {
    fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_INVALID');
  }
  let canonicalParent = realpathSync(ancestor);
  if (
    pathOverlaps(canonicalRepository, canonicalParent)
    || pathOverlaps(canonicalParent, canonicalRepository)
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');

  for (const path of missing) {
    try {
      mkdirSync(path, { recursive: false, mode: PRIVATE_DIRECTORY_MODE });
    } catch {
      fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_CREATE_FAILED');
    }
    const status = lstatSync(path);
    if (
      !status.isDirectory()
      || status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o777) !== PRIVATE_DIRECTORY_MODE
    ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_CREATE_FAILED');
    const canonicalCreated = realpathSync(path);
    if (
      dirname(canonicalCreated) !== canonicalParent
      || pathOverlaps(canonicalRepository, canonicalCreated)
      || pathOverlaps(canonicalCreated, canonicalRepository)
    ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');
    canonicalParent = canonicalCreated;
  }

  const finalStatus = lstatSync(resolvedDirectory);
  if (
    !finalStatus.isDirectory()
    || finalStatus.isSymbolicLink()
    || (process.getuid !== undefined && finalStatus.uid !== process.getuid())
    || (statSync(resolvedDirectory).mode & 0o777) !== PRIVATE_DIRECTORY_MODE
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_INVALID');
  const canonicalDirectory = realpathSync(resolvedDirectory);
  if (
    pathOverlaps(canonicalRepository, canonicalDirectory)
    || pathOverlaps(canonicalDirectory, canonicalRepository)
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');

  for (const entry of readdirSync(canonicalDirectory, {
    withFileTypes: true,
  })) {
    if (
      !entry.isFile()
      || (
        entry.name !== LOCK_NAME
        && !RECEIPT_NAME.test(entry.name)
        && !TEMPORARY_RECEIPT_NAME.test(entry.name)
      )
    ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_NOT_DEDICATED');
    const status = lstatSync(join(canonicalDirectory, entry.name));
    if (
      status.isSymbolicLink()
      || (process.getuid !== undefined && status.uid !== process.getuid())
      || (status.mode & 0o777) !== PRIVATE_FILE_MODE
    ) fail('WORKER_RETURN_REPAIR_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  return canonicalDirectory;
}

function printable(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printable);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Readonly<Record<string, unknown>>)
        .map(([key, child]) => [key, printable(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  const canonicalize = (current: unknown): unknown => {
    if (Array.isArray(current)) return current.map(canonicalize);
    if (current !== null && typeof current === 'object') {
      return Object.fromEntries(
        Object.entries(current as Readonly<Record<string, unknown>>)
          .sort(([left], [right]) => (
            left < right ? -1 : left > right ? 1 : 0
          ))
          .map(([key, child]) => [key, canonicalize(child)]),
      );
    }
    return current;
  };
  return `${JSON.stringify(canonicalize(printable(value)), null, 2)}\n`;
}

function writeAll(descriptor: number, bytes: Buffer): void {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const written = writeSync(
      descriptor,
      bytes,
      offset,
      bytes.byteLength - offset,
    );
    if (written <= 0) fail('WORKER_RETURN_REPAIR_RECEIPT_WRITE_FAILED');
    offset += written;
  }
}

function assertEnvelope(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('WORKER_RETURN_REPAIR_RECEIPT_ENVELOPE_INVALID');
  }
  const envelope = value as Readonly<Record<string, unknown>>;
  const keys = [
    'capability',
    'sourceCommit',
    'moduleArtifactDigest',
    'expectedCastleCount',
    'expectedWorkerCount',
    'expectedAssignments',
    'expectedOccupations',
    'expectedSchedules',
    'expectedReturningWorkers',
    'expectedMissingSchedules',
    'rosterDigest',
  ];
  if (
    !exactKeys(envelope, keys)
    || envelope.capability !== WORKER_RETURN_SCHEDULE_REPAIR_CAPABILITY
    || typeof envelope.sourceCommit !== 'string'
    || !GIT_COMMIT_HEX.test(envelope.sourceCommit)
    || typeof envelope.moduleArtifactDigest !== 'string'
    || !SHA256_HEX.test(envelope.moduleArtifactDigest)
    || typeof envelope.rosterDigest !== 'string'
    || !ROSTER_DIGEST_HEX.test(envelope.rosterDigest)
    || keys
      .filter(key => key.startsWith('expected'))
      .some(key => (
        !Number.isSafeInteger(envelope[key])
        || (envelope[key] as number) < 0
        || (envelope[key] as number) > Number(U32_MAXIMUM)
      ))
    || envelope.expectedMissingSchedules !== 1
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_ENVELOPE_INVALID');
}

function assertExecutionRecord(
  record: WorkerReturnRepairExecutionRecord,
): void {
  const row = record as unknown as Readonly<Record<string, unknown>>;
  if (
    !Object.keys(row).every(key => [
      'command',
      'outcome',
      'submitted',
      'reducer',
      'envelope',
      'before',
      'after',
      'verifiedTransition',
      'reasonCode',
    ].includes(key))
    || (record.command !== 'inspect' && record.command !== 'apply')
    || ![
      'intent-recorded',
      'inspected',
      'already-healthy',
      'schedule-restored',
      'return-completed',
      'verified-after-submission-error',
      'blocked',
      'mutation-rejected-or-uncommitted',
      'mutation-outcome-ambiguous',
    ].includes(record.outcome)
    || typeof record.submitted !== 'boolean'
    || (
      record.reasonCode !== undefined
      && (
        record.reasonCode.length === 0
        || record.reasonCode.length > 128
        || !/^[A-Z0-9_]+$/.test(record.reasonCode)
      )
    )
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_RECORD_INVALID');
  if (record.before !== undefined) {
    projectWorkerReturnRepairStatus(record.before);
  }
  if (record.after !== undefined) {
    projectWorkerReturnRepairStatus(record.after);
  }
  if (record.envelope !== undefined) assertEnvelope(record.envelope);
  if (
    record.reducer !== undefined
    && record.reducer !== WORKER_RETURN_SCHEDULE_REPAIR_REDUCER
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_RECORD_INVALID');
  if (
    record.verifiedTransition !== undefined
    && record.verifiedTransition !== 'schedule-restored'
    && record.verifiedTransition !== 'return-completed'
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_RECORD_INVALID');
  if (
    record.outcome === 'intent-recorded'
    && (
      record.command !== 'apply'
      || record.submitted
      || record.reducer !== WORKER_RETURN_SCHEDULE_REPAIR_REDUCER
      || record.envelope === undefined
      || record.before !== undefined
      || record.after !== undefined
      || record.verifiedTransition !== undefined
      || record.reasonCode !== undefined
    )
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_RECORD_INVALID');
}

function publishPrivateJson(
  directory: string,
  filename: string,
  value: unknown,
): Readonly<{ path: string; digest: string }> {
  if (basename(filename) !== filename || !RECEIPT_NAME.test(filename)) {
    fail('WORKER_RETURN_REPAIR_RECEIPT_NAME_INVALID');
  }
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.tmp`);
  const body = Buffer.from(canonicalJson(value), 'utf8');
  const digest = createHash('sha256').update(body).digest('hex');
  let descriptor: number | undefined;
  try {
    descriptor = openSync(
      temporary,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
    writeAll(descriptor, body);
    fsyncSync(descriptor);
    chmodSync(temporary, PRIVATE_FILE_MODE);
    closeSync(descriptor);
    descriptor = undefined;
    linkSync(temporary, destination);
    unlinkSync(temporary);
    const directoryDescriptor = openSync(directory, constants.O_RDONLY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } catch {
    if (descriptor !== undefined) {
      try { closeSync(descriptor); } catch { /* Preserve the fixed error. */ }
    }
    try { unlinkSync(temporary); } catch { /* Preserve existing evidence. */ }
    fail('WORKER_RETURN_REPAIR_RECEIPT_WRITE_FAILED');
  } finally {
    body.fill(0);
  }
  const status = lstatSync(destination);
  if (
    !status.isFile()
    || status.isSymbolicLink()
    || (status.mode & 0o777) !== PRIVATE_FILE_MODE
    || readFileSync(destination).byteLength === 0
  ) fail('WORKER_RETURN_REPAIR_RECEIPT_WRITE_FAILED');
  return Object.freeze({ path: destination, digest });
}

export function writePrivateWorkerReturnRepairReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  record: WorkerReturnRepairExecutionRecord;
  now?: Date;
}>): Readonly<{ path: string; digest: string }> {
  assertExecutionRecord(input.record);
  const directory = assertPrivateDirectory(
    input.directory,
    input.repositoryRoot,
  );
  const recordedAt = (input.now ?? new Date()).toISOString();
  const timestamp = recordedAt.replace(/[-:.]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const filename =
    `worker-return-repair-${timestamp}-${input.record.command}-${suffix}.json`;
  return publishPrivateJson(directory, filename, Object.freeze({
    schemaVersion: 1,
    kind: 'worker-return-schedule-repair',
    recordedAt,
    target: Object.freeze({
      label: WORKER_RETURN_REPAIR_PRODUCTION_TARGET.label,
      uri: WORKER_RETURN_REPAIR_PRODUCTION_TARGET.uri,
      database: WORKER_RETURN_REPAIR_PRODUCTION_TARGET.database,
    }),
    ...input.record,
  }));
}

export async function withWorkerReturnRepairOperatorLock<T>(
  directory: string,
  repositoryRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const privateDirectory = assertPrivateDirectory(directory, repositoryRoot);
  const lockPath = join(privateDirectory, LOCK_NAME);
  let descriptor: number;
  try {
    descriptor = openSync(
      lockPath,
      constants.O_CREAT
        | constants.O_EXCL
        | constants.O_WRONLY
        | (constants.O_NOFOLLOW ?? 0),
      PRIVATE_FILE_MODE,
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      fail('WORKER_RETURN_REPAIR_OPERATOR_ALREADY_RUNNING');
    }
    fail('WORKER_RETURN_REPAIR_OPERATOR_LOCK_FAILED');
  }
  try {
    writeAll(descriptor, Buffer.from(`${process.pid}\n`, 'ascii'));
    fsyncSync(descriptor);
    chmodSync(lockPath, PRIVATE_FILE_MODE);
    return await operation();
  } finally {
    const opened = fstatSync(descriptor);
    closeSync(descriptor);
    try {
      const current = lstatSync(lockPath);
      if (current.dev === opened.dev && current.ino === opened.ino) {
        unlinkSync(lockPath);
      }
    } catch {
      // Never remove a replacement lock or auto-age a stale lock.
    }
  }
}
