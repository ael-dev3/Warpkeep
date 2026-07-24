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
  readSync,
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

import {
  CASTLE_WORKER_PROTOCOL_CAPABILITY,
  CASTLE_WORKERS_PER_CASTLE,
} from '../spacetimedb/src/castleWorkerPolicy';
import {
  assertWorkerClientAttestation,
  CASTLE_WORKER_RESOURCE_CATALOG_DIGEST,
  CASTLE_WORKER_RESOURCE_STATE_VERSION,
  workerActivationBlockers,
  type WorkerClientAttestation,
} from '../spacetimedb/src/castleWorkerRolloutPolicy';
import { GENESIS_RESOURCE_POLICY_VERSION } from '../spacetimedb/src/resourceAuthorityPolicy';
import {
  projectWorkerRolloutOperatorStatus,
  type WorkerRolloutOperatorStatus,
} from './worker-rollout-controls';

export const WORKER_ROLLOUT_PRODUCTION_TARGET = Object.freeze({
  uri: 'https://maincloud.spacetimedb.com',
  database:
    'c2001f161d44e50c0a75356d79a4d10fa4a9d77ea4eddd56cda7ac6af50b570e',
  bridge: 'https://auth.warpkeep.com',
  label: 'warpkeep-production',
});

export const WORKER_LEGACY_DRAIN_CAPABILITY =
  'genesis-001-worker-legacy-drain-v1';

const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const RELEASE_PATTERN = /^alpha-0\.3\.[0-9]+(?:[-+][a-z0-9.-]+)?$/;
const U32_MAX = 0xffff_ffffn;
const MAX_ARTIFACT_FILES = 50_000;
const MAX_ARTIFACT_BYTES = 2 * 1024 * 1024 * 1024;
const PRIVATE_DIRECTORY_MODE = 0o700;
const PRIVATE_FILE_MODE = 0o600;
const PRIVATE_RECEIPT_FILE_NAME =
  /^worker-rollout-\d{8}T\d{9}Z-(?:inspect|stage|backfill|begin-drain|complete-drain|activate)-[0-9a-f]{12}\.json$/;
const PRIVATE_MIGRATION_PROOF_FILE_NAME =
  /^worker-rollout-migration-proof-\d{8}T\d{9}Z-[0-9a-f]{12}\.json$/;
const PRIVATE_ACTIVATION_BUILD_PROOF_FILE_NAME =
  /^worker-rollout-activation-build-proof-\d{8}T\d{9}Z-[0-9a-f]{12}\.json$/;

export type WorkerRolloutCommand =
  | 'inspect'
  | 'stage'
  | 'backfill'
  | 'begin-drain'
  | 'complete-drain'
  | 'activate';

export type WorkerRolloutMutationCommand = Exclude<
  WorkerRolloutCommand,
  'inspect'
>;

export type WorkerRolloutReducer =
  | 'admin_stage_worker_system_v1'
  | 'admin_backfill_worker_roster_v1'
  | 'admin_begin_worker_legacy_drain_v1'
  | 'admin_complete_worker_legacy_drain_v1'
  | 'admin_activate_worker_system_v1';

export type WorkerLegacyDrainEnvelope = Readonly<{
  capability: string;
  sourceCommit: string;
  moduleArtifactDigest: string;
  expectedCastleCount: number;
  expectedWorkerCount: number;
  rosterDigest: string;
  resourceRosterDigest: string;
  resourceCatalogDigest: string;
  goldExpeditions: number;
  foodExpeditions: number;
  woodExpeditions: number;
  stoneExpeditions: number;
  goldOccupations: number;
  foodOccupations: number;
  woodOccupations: number;
  stoneOccupations: number;
  goldSchedules: number;
  foodSchedules: number;
  woodSchedules: number;
  stoneSchedules: number;
}>;

export type WorkerRolloutReducerEnvelope =
  | Readonly<Record<never, never>>
  | WorkerLegacyDrainEnvelope
  | WorkerClientAttestation;

export type WorkerRolloutLocalAttestation = Readonly<{
  sourceCommit: string;
  moduleArtifactDigest?: string;
  clientRelease?: string;
  clientArtifactDigest?: string;
}>;

export type CanonicalArtifactDigest = Readonly<{
  algorithm: 'warpkeep-canonical-directory-v1';
  digest: string;
  fileCount: number;
  byteCount: number;
  relativeFiles: readonly string[];
}>;

export type WorkerRolloutOutcome =
  | 'inspected'
  | 'already-satisfied'
  | 'verified'
  | 'verified-after-submission-error'
  | 'blocked'
  | 'mutation-unverified'
  | 'mutation-outcome-ambiguous';

export type WorkerRolloutExecutionRecord = Readonly<{
  command: WorkerRolloutCommand;
  outcome: WorkerRolloutOutcome;
  submitted: boolean;
  reducer?: WorkerRolloutReducer;
  envelope?: WorkerRolloutReducerEnvelope;
  before?: WorkerRolloutOperatorStatus;
  after?: WorkerRolloutOperatorStatus;
  reasonCode?: string;
}>;

type WorkerRolloutPlan = Readonly<{
  reducer: WorkerRolloutReducer;
  envelope: WorkerRolloutReducerEnvelope;
  alreadySatisfied: boolean;
}>;

export class WorkerRolloutOperatorError extends Error {
  constructor(
    readonly code: string,
    readonly record?: WorkerRolloutExecutionRecord,
  ) {
    super(code);
    this.name = 'WorkerRolloutOperatorError';
  }
}

function fail(
  code: string,
  record?: WorkerRolloutExecutionRecord,
): never {
  throw new WorkerRolloutOperatorError(code, record);
}

export function parseWorkerRolloutArguments(
  argv: readonly string[],
): Readonly<{ command: WorkerRolloutCommand; confirmed: boolean }> {
  const command = argv[0] as WorkerRolloutCommand | undefined;
  if (
    command !== 'inspect'
    && command !== 'stage'
    && command !== 'backfill'
    && command !== 'begin-drain'
    && command !== 'complete-drain'
    && command !== 'activate'
  ) {
    fail(
      'WORKER_ROLLOUT_USAGE: expected '
      + '<inspect|stage|backfill|begin-drain|complete-drain|activate> [--confirm].',
    );
  }
  const flags = argv.slice(1);
  if (
    flags.some(flag => flag !== '--confirm')
    || new Set(flags).size !== flags.length
    || (command === 'inspect' && flags.length !== 0)
  ) fail('WORKER_ROLLOUT_ARGUMENTS_INVALID');
  const confirmed = flags.includes('--confirm');
  if (command !== 'inspect' && !confirmed) {
    fail(`WORKER_ROLLOUT_CONFIRMATION_REQUIRED:${command}`);
  }
  return Object.freeze({ command, confirmed });
}

export function canonicalWorkerRolloutTarget(
  env: Readonly<Record<string, string | undefined>>,
) {
  const configured = Object.freeze({
    uri: env.WARPKEEP_SPACETIMEDB_URI,
    database: env.WARPKEEP_SPACETIMEDB_DATABASE,
    bridge: env.WARPKEEP_AUTH_BRIDGE_URL,
  });
  if (
    (configured.uri !== undefined
      && configured.uri !== WORKER_ROLLOUT_PRODUCTION_TARGET.uri)
    || (
      configured.database !== undefined
      && configured.database !== WORKER_ROLLOUT_PRODUCTION_TARGET.database
    )
    || (
      configured.bridge !== undefined
      && configured.bridge !== WORKER_ROLLOUT_PRODUCTION_TARGET.bridge
    )
  ) fail('WORKER_ROLLOUT_TARGET_OVERRIDE_REJECTED');
  return WORKER_ROLLOUT_PRODUCTION_TARGET;
}

function genericRowsAreZero(status: WorkerRolloutOperatorStatus): boolean {
  return status.genericAssignments === 0n
    && status.genericOccupations === 0n
    && status.genericSchedules === 0n
    && status.genericCommandReceipts === 0n;
}

function legacyRowsAreZero(status: WorkerRolloutOperatorStatus): boolean {
  return status.legacyExpeditions === 0n
    && status.legacyOccupations === 0n
    && status.legacySchedules === 0n;
}

function exactSystemCounts(status: WorkerRolloutOperatorStatus): boolean {
  return status.systemRows === 1n
    && status.systemConfigValid
    && status.actualCastleCount > 0n
    && status.actualCastleCount === BigInt(status.expectedCastleCount)
    && status.expectedWorkerCount
      === status.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE;
}

function exactRoster(status: WorkerRolloutOperatorStatus): boolean {
  return exactSystemCounts(status)
    && status.actualWorkerCount === BigInt(status.expectedWorkerCount)
    && status.rosterDigest === status.expectedRosterDigest
    && /^[0-9a-f]{16}$/.test(status.rosterDigest)
    && status.malformedWorkerGraphRows === 0n;
}

function exactResources(status: WorkerRolloutOperatorStatus): boolean {
  return status.resourceAccounts === status.actualCastleCount
    && status.missingResourceAccounts === 0n
    && status.orphanedResourceAccounts === 0n
    && status.resourceInvariantViolations === 0n
    && /^[0-9a-f]{16}$/.test(status.resourceRosterDigest)
    && status.canonicalResourceCatalog;
}

function assertStatusBaseline(status: WorkerRolloutOperatorStatus): void {
  if (status.phase === 'invalid') fail('WORKER_ROLLOUT_STATUS_INVALID');
  if (
    (status.phase === 'absent' && (
      status.systemRows !== 0n
      || status.systemConfigValid
      || status.expectedCastleCount !== 0
      || status.expectedWorkerCount !== 0
    ))
    || (status.phase !== 'absent' && (
      status.systemRows !== 1n
      || !status.systemConfigValid
    ))
  ) fail('WORKER_ROLLOUT_SYSTEM_AGGREGATE_INVALID');
}

function assertFullPreactivationState(
  status: WorkerRolloutOperatorStatus,
  phase: 'staged' | 'draining',
): void {
  if (
    status.phase !== phase
    || !exactRoster(status)
    || !exactResources(status)
    || !genericRowsAreZero(status)
  ) fail(`WORKER_ROLLOUT_${phase.toUpperCase()}_STATE_NOT_READY`);
}

function toU32(value: bigint, label: string): number {
  if (value < 0n || value > U32_MAX) {
    fail(`WORKER_ROLLOUT_${label}_OUT_OF_RANGE`);
  }
  return Number(value);
}

function assertLocalAttestation(
  command: WorkerRolloutMutationCommand,
  attestation: WorkerRolloutLocalAttestation | undefined,
): WorkerRolloutLocalAttestation {
  if (!attestation || !GIT_COMMIT_HEX.test(attestation.sourceCommit)) {
    fail(`WORKER_ROLLOUT_${command.toUpperCase()}_SOURCE_ATTESTATION_REQUIRED`);
  }
  if (
    command === 'complete-drain'
    && (
      typeof attestation.moduleArtifactDigest !== 'string'
      || !SHA256_HEX.test(attestation.moduleArtifactDigest)
    )
  ) fail('WORKER_ROLLOUT_MODULE_ARTIFACT_ATTESTATION_REQUIRED');
  if (
    command === 'activate'
    && (
      typeof attestation.clientRelease !== 'string'
      || !RELEASE_PATTERN.test(attestation.clientRelease)
      || typeof attestation.clientArtifactDigest !== 'string'
      || !SHA256_HEX.test(attestation.clientArtifactDigest)
    )
  ) fail('WORKER_ROLLOUT_CLIENT_ARTIFACT_ATTESTATION_REQUIRED');
  return attestation;
}

export function buildWorkerRolloutPlan(
  command: WorkerRolloutMutationCommand,
  statusValue: unknown,
  localAttestation?: WorkerRolloutLocalAttestation,
): WorkerRolloutPlan {
  const status = projectWorkerRolloutOperatorStatus(statusValue);
  assertStatusBaseline(status);

  if (command === 'stage') {
    if (
      status.phase !== 'absent'
      || status.actualCastleCount === 0n
      || status.actualWorkerCount !== 0n
      || !genericRowsAreZero(status)
    ) fail('WORKER_ROLLOUT_STAGE_PRECONDITION_FAILED');
    return Object.freeze({
      reducer: 'admin_stage_worker_system_v1',
      envelope: Object.freeze({}),
      alreadySatisfied: false,
    });
  }

  if (command === 'backfill') {
    if (
      status.phase !== 'staged'
      || !exactSystemCounts(status)
      || status.rosterDigest !== status.expectedRosterDigest
      || !genericRowsAreZero(status)
    ) fail('WORKER_ROLLOUT_BACKFILL_PRECONDITION_FAILED');
    if (status.actualWorkerCount === BigInt(status.expectedWorkerCount)) {
      if (status.malformedWorkerGraphRows !== 0n) {
        fail('WORKER_ROLLOUT_BACKFILL_PRECONDITION_FAILED');
      }
      return Object.freeze({
        reducer: 'admin_backfill_worker_roster_v1',
        envelope: Object.freeze({}),
        alreadySatisfied: true,
      });
    }
    if (
      status.actualWorkerCount !== 0n
      || status.malformedWorkerGraphRows !== status.actualCastleCount
    ) fail('WORKER_ROLLOUT_BACKFILL_PRECONDITION_FAILED');
    return Object.freeze({
      reducer: 'admin_backfill_worker_roster_v1',
      envelope: Object.freeze({}),
      alreadySatisfied: false,
    });
  }

  if (command === 'begin-drain') {
    if (status.phase === 'draining') {
      assertFullPreactivationState(status, 'draining');
      return Object.freeze({
        reducer: 'admin_begin_worker_legacy_drain_v1',
        envelope: Object.freeze({}),
        alreadySatisfied: true,
      });
    }
    assertFullPreactivationState(status, 'staged');
    return Object.freeze({
      reducer: 'admin_begin_worker_legacy_drain_v1',
      envelope: Object.freeze({}),
      alreadySatisfied: false,
    });
  }

  if (command === 'complete-drain') {
    assertFullPreactivationState(status, 'draining');
    if (legacyRowsAreZero(status)) {
      return Object.freeze({
        reducer: 'admin_complete_worker_legacy_drain_v1',
        envelope: Object.freeze({}),
        alreadySatisfied: true,
      });
    }
    const local = assertLocalAttestation(command, localAttestation);
    const envelope: WorkerLegacyDrainEnvelope = Object.freeze({
      capability: WORKER_LEGACY_DRAIN_CAPABILITY,
      sourceCommit: local.sourceCommit,
      moduleArtifactDigest: local.moduleArtifactDigest as string,
      expectedCastleCount: status.expectedCastleCount,
      expectedWorkerCount: status.expectedWorkerCount,
      rosterDigest: status.rosterDigest,
      resourceRosterDigest: status.resourceRosterDigest,
      resourceCatalogDigest: status.resourceCatalogDigest,
      goldExpeditions: toU32(status.legacyGoldExpeditions, 'GOLD_EXPEDITIONS'),
      foodExpeditions: toU32(status.legacyFoodExpeditions, 'FOOD_EXPEDITIONS'),
      woodExpeditions: toU32(status.legacyWoodExpeditions, 'WOOD_EXPEDITIONS'),
      stoneExpeditions: toU32(status.legacyStoneExpeditions, 'STONE_EXPEDITIONS'),
      goldOccupations: toU32(status.legacyGoldOccupations, 'GOLD_OCCUPATIONS'),
      foodOccupations: toU32(status.legacyFoodOccupations, 'FOOD_OCCUPATIONS'),
      woodOccupations: toU32(status.legacyWoodOccupations, 'WOOD_OCCUPATIONS'),
      stoneOccupations: toU32(status.legacyStoneOccupations, 'STONE_OCCUPATIONS'),
      goldSchedules: toU32(status.legacyGoldSchedules, 'GOLD_SCHEDULES'),
      foodSchedules: toU32(status.legacyFoodSchedules, 'FOOD_SCHEDULES'),
      woodSchedules: toU32(status.legacyWoodSchedules, 'WOOD_SCHEDULES'),
      stoneSchedules: toU32(status.legacyStoneSchedules, 'STONE_SCHEDULES'),
    });
    return Object.freeze({
      reducer: 'admin_complete_worker_legacy_drain_v1',
      envelope,
      alreadySatisfied: false,
    });
  }

  if (status.phase === 'active') {
    if (
      !exactRoster(status)
      || !exactResources(status)
      || !legacyRowsAreZero(status)
    ) fail('WORKER_ROLLOUT_ACTIVE_STATE_INVALID');
    return Object.freeze({
      reducer: 'admin_activate_worker_system_v1',
      envelope: Object.freeze({}),
      alreadySatisfied: true,
    });
  }
  const local = assertLocalAttestation(command, localAttestation);
  const envelope: WorkerClientAttestation = Object.freeze({
    capability: CASTLE_WORKER_PROTOCOL_CAPABILITY,
    clientRelease: local.clientRelease as string,
    clientArtifactDigest: local.clientArtifactDigest as string,
    sourceCommit: local.sourceCommit,
    resourceStateVersion: CASTLE_WORKER_RESOURCE_STATE_VERSION,
    resourcePolicyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    resourceCatalogDigest: status.resourceCatalogDigest,
    expectedCastleCount: status.expectedCastleCount,
    expectedWorkerCount: status.expectedWorkerCount,
    rosterDigest: status.rosterDigest,
    resourceRosterDigest: status.resourceRosterDigest,
  });
  const blockers = workerActivationBlockers(status, envelope);
  if (blockers.length !== 0) {
    fail(`WORKER_ROLLOUT_ACTIVATION_BLOCKED:${blockers.join(',')}`);
  }
  return Object.freeze({
    reducer: 'admin_activate_worker_system_v1',
    envelope,
    alreadySatisfied: false,
  });
}

function statusIdentityWasStable(
  before: WorkerRolloutOperatorStatus,
  after: WorkerRolloutOperatorStatus,
): boolean {
  return after.actualCastleCount === before.actualCastleCount
    && after.expectedRosterDigest === before.expectedRosterDigest
    && after.resourceAccounts === before.resourceAccounts
    && after.missingResourceAccounts === before.missingResourceAccounts
    && after.orphanedResourceAccounts === before.orphanedResourceAccounts
    && after.resourceInvariantViolations === before.resourceInvariantViolations
    && after.resourceRosterDigest === before.resourceRosterDigest
    && after.resourceCatalogDigest === before.resourceCatalogDigest
    && after.canonicalResourceCatalog === before.canonicalResourceCatalog;
}

export function verifyWorkerRolloutTransition(
  command: WorkerRolloutMutationCommand,
  beforeValue: unknown,
  afterValue: unknown,
): WorkerRolloutOperatorStatus {
  const before = projectWorkerRolloutOperatorStatus(beforeValue);
  const after = projectWorkerRolloutOperatorStatus(afterValue);
  assertStatusBaseline(after);
  if (!statusIdentityWasStable(before, after)) {
    fail('WORKER_ROLLOUT_CONCURRENT_IDENTITY_DRIFT');
  }
  if (command === 'stage') {
    if (
      after.phase !== 'staged'
      || !exactSystemCounts(after)
      || after.actualWorkerCount !== 0n
      || after.rosterDigest !== after.expectedRosterDigest
      || !genericRowsAreZero(after)
    ) fail('WORKER_ROLLOUT_STAGE_POSTCONDITION_FAILED');
    return after;
  }
  if (command === 'backfill') {
    if (
      after.phase !== 'staged'
      || !exactRoster(after)
      || !genericRowsAreZero(after)
    ) fail('WORKER_ROLLOUT_BACKFILL_POSTCONDITION_FAILED');
    return after;
  }
  if (command === 'begin-drain') {
    assertFullPreactivationState(after, 'draining');
    return after;
  }
  if (command === 'complete-drain') {
    if (!legacyRowsAreZero(after)) {
      fail('WORKER_ROLLOUT_COMPLETE_DRAIN_POSTCONDITION_FAILED');
    }
    assertFullPreactivationState(after, 'draining');
    return after;
  }
  if (
    after.phase !== 'active'
    || !exactRoster(after)
    || !exactResources(after)
    || !legacyRowsAreZero(after)
  ) fail('WORKER_ROLLOUT_ACTIVATION_POSTCONDITION_FAILED');
  return after;
}

export async function executeWorkerRolloutCommand(input: Readonly<{
  command: WorkerRolloutCommand;
  confirmed: boolean;
  inspect: () => Promise<unknown>;
  submit: (
    reducer: WorkerRolloutReducer,
    envelope: WorkerRolloutReducerEnvelope,
  ) => Promise<void>;
  localAttestation?: WorkerRolloutLocalAttestation;
}>): Promise<WorkerRolloutExecutionRecord> {
  if (input.command !== 'inspect' && !input.confirmed) {
    fail(`WORKER_ROLLOUT_CONFIRMATION_REQUIRED:${input.command}`);
  }
  let before: WorkerRolloutOperatorStatus;
  try {
    before = projectWorkerRolloutOperatorStatus(await input.inspect());
    assertStatusBaseline(before);
  } catch {
    const reasonCode = 'WORKER_ROLLOUT_INITIAL_INSPECTION_UNAVAILABLE';
    throw new WorkerRolloutOperatorError(reasonCode, Object.freeze({
      command: input.command,
      outcome: 'blocked',
      submitted: false,
      reasonCode,
    }));
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

  let plan: WorkerRolloutPlan;
  try {
    plan = buildWorkerRolloutPlan(
      input.command,
      before,
      input.localAttestation,
    );
  } catch (error) {
    if (error instanceof WorkerRolloutOperatorError) {
      throw new WorkerRolloutOperatorError(error.code, Object.freeze({
        command: input.command,
        outcome: 'blocked',
        submitted: false,
        before,
        reasonCode: error.code,
      }));
    }
    throw error;
  }
  if (plan.alreadySatisfied) {
    return Object.freeze({
      command: input.command,
      outcome: 'already-satisfied',
      submitted: false,
      reducer: plan.reducer,
      before,
      after: before,
    });
  }

  let submissionFailed = false;
  try {
    await input.submit(plan.reducer, plan.envelope);
  } catch {
    submissionFailed = true;
  }

  let after: WorkerRolloutOperatorStatus | undefined;
  try {
    after = projectWorkerRolloutOperatorStatus(await input.inspect());
  } catch {
    const record = Object.freeze({
      command: input.command,
      outcome: 'mutation-outcome-ambiguous' as const,
      submitted: true,
      reducer: plan.reducer,
      envelope: plan.envelope,
      before,
      reasonCode: 'WORKER_ROLLOUT_POST_INSPECTION_UNAVAILABLE',
    });
    fail('WORKER_ROLLOUT_MUTATION_OUTCOME_AMBIGUOUS', record);
  }

  try {
    const verified = verifyWorkerRolloutTransition(
      input.command,
      before,
      after,
    );
    return Object.freeze({
      command: input.command,
      outcome: submissionFailed
        ? 'verified-after-submission-error'
        : 'verified',
      submitted: true,
      reducer: plan.reducer,
      envelope: plan.envelope,
      before,
      after: verified,
      ...(submissionFailed
        ? { reasonCode: 'WORKER_ROLLOUT_SUBMISSION_ERROR_VERIFIED_BY_AGGREGATE' }
        : {}),
    });
  } catch (error) {
    const reasonCode = error instanceof WorkerRolloutOperatorError
      ? error.code
      : 'WORKER_ROLLOUT_POSTCONDITION_FAILED';
    const record = Object.freeze({
      command: input.command,
      outcome: 'mutation-unverified' as const,
      submitted: true,
      reducer: plan.reducer,
      envelope: plan.envelope,
      before,
      after,
      reasonCode,
    });
    fail(
      submissionFailed
        ? 'WORKER_ROLLOUT_MUTATION_REJECTED_OR_UNCOMMITTED'
        : 'WORKER_ROLLOUT_MUTATION_POSTCONDITION_FAILED',
      record,
    );
  }
}

type ArtifactFileEntry = Readonly<{
  relativePath: string;
  byteCount: number;
  digest: string;
  containsNeedle: boolean;
}>;

function stableFileSnapshot(
  path: string,
  needle?: Buffer,
): Omit<ArtifactFileEntry, 'relativePath'> {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let descriptor: number;
  try {
    descriptor = openSync(path, flags);
  } catch {
    fail('WORKER_ROLLOUT_ARTIFACT_FILE_UNREADABLE');
  }
  try {
    const before = fstatSync(descriptor);
    if (!before.isFile() || before.size < 0 || before.size > MAX_ARTIFACT_BYTES) {
      fail('WORKER_ROLLOUT_ARTIFACT_FILE_INVALID');
    }
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    let byteCount = 0;
    let containsNeedle = false;
    let carry = Buffer.alloc(0);
    while (true) {
      const bytesRead = readSync(
        descriptor,
        buffer,
        0,
        buffer.byteLength,
        null,
      );
      if (bytesRead === 0) break;
      const chunk = buffer.subarray(0, bytesRead);
      digest.update(chunk);
      byteCount += bytesRead;
      if (needle && !containsNeedle) {
        const searchable = carry.byteLength === 0
          ? chunk
          : Buffer.concat([carry, chunk]);
        containsNeedle = searchable.indexOf(needle) !== -1;
        carry = searchable.subarray(Math.max(
          0,
          searchable.byteLength - needle.byteLength + 1,
        ));
      }
    }
    const after = fstatSync(descriptor);
    if (
      before.dev !== after.dev
      || before.ino !== after.ino
      || before.size !== after.size
      || before.mtimeMs !== after.mtimeMs
      || before.ctimeMs !== after.ctimeMs
      || byteCount !== before.size
    ) fail('WORKER_ROLLOUT_ARTIFACT_CHANGED_DURING_READ');
    return Object.freeze({
      byteCount,
      digest: digest.digest('hex'),
      containsNeedle,
    });
  } finally {
    closeSync(descriptor);
  }
}

function artifactEntries(
  root: string,
  needle?: Buffer,
): readonly ArtifactFileEntry[] {
  const rootStatus = lstatSync(root);
  if (!rootStatus.isDirectory() || rootStatus.isSymbolicLink()) {
    fail('WORKER_ROLLOUT_ARTIFACT_DIRECTORY_INVALID');
  }
  const entries: ArtifactFileEntry[] = [];
  const visit = (directory: string, prefix: string): void => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((left, right) => Buffer.compare(
        Buffer.from(left.name, 'utf8'),
        Buffer.from(right.name, 'utf8'),
      ));
    for (const child of children) {
      if (
        child.name === '.'
        || child.name === '..'
        || child.name.includes('\0')
        || child.name.normalize('NFC') !== child.name
      ) fail('WORKER_ROLLOUT_ARTIFACT_PATH_INVALID');
      const childPath = join(directory, child.name);
      const relativePath = prefix ? `${prefix}/${child.name}` : child.name;
      const status = lstatSync(childPath);
      if (status.isSymbolicLink()) fail('WORKER_ROLLOUT_ARTIFACT_SYMLINK_REJECTED');
      if (status.isDirectory()) {
        visit(childPath, relativePath);
      } else if (status.isFile()) {
        entries.push(Object.freeze({
          relativePath,
          ...stableFileSnapshot(childPath, needle),
        }));
        if (entries.length > MAX_ARTIFACT_FILES) {
          fail('WORKER_ROLLOUT_ARTIFACT_FILE_LIMIT');
        }
      } else {
        fail('WORKER_ROLLOUT_ARTIFACT_ENTRY_INVALID');
      }
    }
  };
  visit(root, '');
  if (entries.length === 0) fail('WORKER_ROLLOUT_ARTIFACT_EMPTY');
  entries.sort((left, right) => Buffer.compare(
    Buffer.from(left.relativePath, 'utf8'),
    Buffer.from(right.relativePath, 'utf8'),
  ));
  return Object.freeze(entries);
}

function digestArtifactEntries(
  entries: readonly ArtifactFileEntry[],
): CanonicalArtifactDigest {
  const digest = createHash('sha256');
  digest.update('warpkeep-canonical-directory-v1\0', 'utf8');
  let byteCount = 0;
  for (const entry of entries) {
    byteCount += entry.byteCount;
    if (!Number.isSafeInteger(byteCount) || byteCount > MAX_ARTIFACT_BYTES) {
      fail('WORKER_ROLLOUT_ARTIFACT_BYTE_LIMIT');
    }
    const pathBytes = Buffer.from(entry.relativePath, 'utf8');
    digest.update(String(pathBytes.byteLength), 'ascii');
    digest.update('\0');
    digest.update(pathBytes);
    digest.update('\0');
    digest.update(String(entry.byteCount), 'ascii');
    digest.update('\0');
    digest.update(entry.digest, 'ascii');
    digest.update('\0');
  }
  return Object.freeze({
    algorithm: 'warpkeep-canonical-directory-v1',
    digest: digest.digest('hex'),
    fileCount: entries.length,
    byteCount,
    relativeFiles: Object.freeze(entries.map(entry => entry.relativePath)),
  });
}

export function digestCanonicalArtifactDirectory(
  directory: string,
): CanonicalArtifactDigest {
  return digestArtifactEntries(artifactEntries(resolve(directory)));
}

export function attestCanonicalClientArtifactDirectory(
  directory: string,
  sourceCommit: string,
): CanonicalArtifactDigest {
  if (!GIT_COMMIT_HEX.test(sourceCommit)) {
    fail('WORKER_ROLLOUT_SOURCE_COMMIT_INVALID');
  }
  const entries = artifactEntries(
    resolve(directory),
    Buffer.from(sourceCommit, 'ascii'),
  );
  if (!entries.some(entry => entry.containsNeedle)) {
    fail('WORKER_ROLLOUT_CLIENT_ARTIFACT_SOURCE_MISMATCH');
  }
  return digestArtifactEntries(entries);
}

export function digestExactArtifactFile(path: string): string {
  return stableFileSnapshot(resolve(path)).digest;
}

export function readPackageRelease(packageJsonPath: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  } catch {
    fail('WORKER_ROLLOUT_PACKAGE_VERSION_UNAVAILABLE');
  }
  if (
    parsed === null
    || typeof parsed !== 'object'
    || Array.isArray(parsed)
  ) fail('WORKER_ROLLOUT_PACKAGE_VERSION_UNAVAILABLE');
  const version = (parsed as { version?: unknown }).version;
  const release = typeof version === 'string' ? `alpha-${version}` : '';
  if (!RELEASE_PATTERN.test(release)) {
    fail('WORKER_ROLLOUT_PACKAGE_VERSION_INVALID');
  }
  return release;
}

function pathIsInside(parent: string, candidate: string): boolean {
  const difference = relative(parent, candidate);
  return difference === ''
    || (
      difference !== '..'
      && !difference.startsWith(`..${sep}`)
      && !isAbsolute(difference)
    );
}

export function defaultWorkerRolloutReceiptDirectory(): string {
  return join(homedir(), '.warpkeep', 'private', 'worker-rollout-receipts');
}

function assertPrivateReceiptDirectory(
  directory: string,
  repositoryRoot: string,
): string {
  if (!isAbsolute(directory)) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_NOT_ABSOLUTE');
  const resolved = resolve(directory);
  const canonicalRepository = realpathSync(resolve(repositoryRoot));
  if (pathIsInside(canonicalRepository, resolved)) {
    fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_INSIDE_REPOSITORY');
  }
  if (pathIsInside(resolved, canonicalRepository)) {
    fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_CONTAINS_REPOSITORY');
  }
  const missingDirectories: string[] = [];
  let ancestor = resolved;
  while (!existsSync(ancestor)) {
    missingDirectories.unshift(ancestor);
    const parent = dirname(ancestor);
    if (parent === ancestor) {
      fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_INVALID');
    }
    ancestor = parent;
  }
  let existingAncestor = ancestor;
  while (true) {
    if (lstatSync(existingAncestor).isSymbolicLink()) {
      fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_SYMLINK_REJECTED');
    }
    const parent = dirname(existingAncestor);
    if (parent === existingAncestor) break;
    existingAncestor = parent;
  }
  const ancestorStatus = lstatSync(ancestor);
  if (!ancestorStatus.isDirectory() || ancestorStatus.isSymbolicLink()) {
    fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_INVALID');
  }
  let canonicalParent = realpathSync(ancestor);
  if (pathIsInside(canonicalRepository, canonicalParent)) {
    fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');
  }
  for (const missingDirectory of missingDirectories) {
    try {
      mkdirSync(missingDirectory, {
        recursive: false,
        mode: PRIVATE_DIRECTORY_MODE,
      });
    } catch {
      fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_CREATE_FAILED');
    }
    const created = lstatSync(missingDirectory);
    if (
      !created.isDirectory()
      || created.isSymbolicLink()
      || (process.getuid !== undefined && created.uid !== process.getuid())
      || (created.mode & 0o777) !== PRIVATE_DIRECTORY_MODE
    ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_CREATE_FAILED');
    const canonicalCreated = realpathSync(missingDirectory);
    if (
      dirname(canonicalCreated) !== canonicalParent
      || pathIsInside(canonicalRepository, canonicalCreated)
      || pathIsInside(canonicalCreated, canonicalRepository)
    ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');
    canonicalParent = canonicalCreated;
  }
  const status = lstatSync(resolved);
  if (
    !status.isDirectory()
    || status.isSymbolicLink()
    || (process.getuid !== undefined && status.uid !== process.getuid())
  ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_INVALID');
  const canonicalDirectory = realpathSync(resolved);
  if (
    pathIsInside(canonicalRepository, canonicalDirectory)
    || pathIsInside(canonicalDirectory, canonicalRepository)
  ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_REPOSITORY_OVERLAP');
  if ((statSync(canonicalDirectory).mode & 0o777) !== PRIVATE_DIRECTORY_MODE) {
    fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_PERMISSIONS');
  }
  for (const entry of readdirSync(canonicalDirectory, { withFileTypes: true })) {
    const ordinaryReceipt = PRIVATE_RECEIPT_FILE_NAME.test(entry.name);
    const migrationProof = PRIVATE_MIGRATION_PROOF_FILE_NAME.test(entry.name);
    const temporaryReceipt = entry.name.startsWith('.')
      && entry.name.endsWith('.tmp')
      && (
        PRIVATE_RECEIPT_FILE_NAME.test(entry.name.slice(1, -4))
        || PRIVATE_MIGRATION_PROOF_FILE_NAME.test(entry.name.slice(1, -4))
        || PRIVATE_ACTIVATION_BUILD_PROOF_FILE_NAME.test(
          entry.name.slice(1, -4),
        )
      );
    if (
      !entry.isFile()
      || (
        entry.name !== '.worker-rollout.lock'
        && !ordinaryReceipt
        && !migrationProof
        && !PRIVATE_ACTIVATION_BUILD_PROOF_FILE_NAME.test(entry.name)
        && !temporaryReceipt
      )
    ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_NOT_DEDICATED');
    const entryStatus = lstatSync(join(canonicalDirectory, entry.name));
    if (
      entryStatus.isSymbolicLink()
      || (process.getuid !== undefined && entryStatus.uid !== process.getuid())
      || (entryStatus.mode & 0o777) !== PRIVATE_FILE_MODE
    ) fail('WORKER_ROLLOUT_RECEIPT_DIRECTORY_NOT_DEDICATED');
  }
  return canonicalDirectory;
}

function printableValue(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(printableValue);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Readonly<Record<string, unknown>>)
      .map(([key, child]) => [key, printableValue(child)]));
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
  return `${JSON.stringify(canonicalize(printableValue(value)), null, 2)}\n`;
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: readonly string[],
): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length
    && actual.every((key, index) => key === canonical[index]);
}

function exactReceiptStatus(value: unknown): void {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail('WORKER_ROLLOUT_RECEIPT_STATUS_INVALID');
  }
  const projected = projectWorkerRolloutOperatorStatus(value);
  if (!hasExactKeys(
    value as Readonly<Record<string, unknown>>,
    Object.keys(projected),
  )) fail('WORKER_ROLLOUT_RECEIPT_STATUS_INVALID');
}

const COMPLETE_DRAIN_ENVELOPE_KEYS = Object.freeze([
  'capability',
  'sourceCommit',
  'moduleArtifactDigest',
  'expectedCastleCount',
  'expectedWorkerCount',
  'rosterDigest',
  'resourceRosterDigest',
  'resourceCatalogDigest',
  'goldExpeditions',
  'foodExpeditions',
  'woodExpeditions',
  'stoneExpeditions',
  'goldOccupations',
  'foodOccupations',
  'woodOccupations',
  'stoneOccupations',
  'goldSchedules',
  'foodSchedules',
  'woodSchedules',
  'stoneSchedules',
]);

const ACTIVATION_ENVELOPE_KEYS = Object.freeze([
  'capability',
  'clientRelease',
  'clientArtifactDigest',
  'sourceCommit',
  'resourceStateVersion',
  'resourcePolicyVersion',
  'resourceCatalogDigest',
  'expectedCastleCount',
  'expectedWorkerCount',
  'rosterDigest',
  'resourceRosterDigest',
]);

function assertReceiptEnvelope(
  reducer: WorkerRolloutReducer | undefined,
  envelope: unknown,
): void {
  if (envelope === undefined) return;
  if (
    reducer === undefined
    || envelope === null
    || typeof envelope !== 'object'
    || Array.isArray(envelope)
  ) fail('WORKER_ROLLOUT_RECEIPT_ENVELOPE_INVALID');
  const row = envelope as Readonly<Record<string, unknown>>;
  if (
    reducer === 'admin_stage_worker_system_v1'
    || reducer === 'admin_backfill_worker_roster_v1'
    || reducer === 'admin_begin_worker_legacy_drain_v1'
  ) {
    if (!hasExactKeys(row, [])) {
      fail('WORKER_ROLLOUT_RECEIPT_ENVELOPE_INVALID');
    }
    return;
  }
  if (reducer === 'admin_complete_worker_legacy_drain_v1') {
    if (
      !hasExactKeys(row, COMPLETE_DRAIN_ENVELOPE_KEYS)
      || row.capability !== WORKER_LEGACY_DRAIN_CAPABILITY
      || typeof row.sourceCommit !== 'string'
      || !GIT_COMMIT_HEX.test(row.sourceCommit)
      || typeof row.moduleArtifactDigest !== 'string'
      || !SHA256_HEX.test(row.moduleArtifactDigest)
      || row.resourceCatalogDigest !== CASTLE_WORKER_RESOURCE_CATALOG_DIGEST
      || typeof row.rosterDigest !== 'string'
      || !/^[0-9a-f]{16}$/.test(row.rosterDigest)
      || typeof row.resourceRosterDigest !== 'string'
      || !/^[0-9a-f]{16}$/.test(row.resourceRosterDigest)
      || COMPLETE_DRAIN_ENVELOPE_KEYS
        .filter(key => (
          key.endsWith('Count')
          || key.endsWith('Expeditions')
          || key.endsWith('Occupations')
          || key.endsWith('Schedules')
        ))
        .some(key => (
          !Number.isSafeInteger(row[key])
          || (row[key] as number) < 0
          || (row[key] as number) > Number(U32_MAX)
        ))
    ) fail('WORKER_ROLLOUT_RECEIPT_ENVELOPE_INVALID');
    return;
  }
  if (
    reducer !== 'admin_activate_worker_system_v1'
    || !hasExactKeys(row, ACTIVATION_ENVELOPE_KEYS)
  ) fail('WORKER_ROLLOUT_RECEIPT_ENVELOPE_INVALID');
  try {
    assertWorkerClientAttestation(row as WorkerClientAttestation);
  } catch {
    fail('WORKER_ROLLOUT_RECEIPT_ENVELOPE_INVALID');
  }
}

const PREFLIGHT_BLOCKED_RECEIPT_REASONS = new Set([
  'WORKER_ROLLOUT_LOCAL_PROOF_UNAVAILABLE',
  'WORKER_ROLLOUT_ADMIN_AUTHORITY_UNAVAILABLE',
  'WORKER_ROLLOUT_INITIAL_INSPECTION_UNAVAILABLE',
]);

function assertReceiptRecord(record: WorkerRolloutExecutionRecord): void {
  const row = record as unknown as Readonly<Record<string, unknown>>;
  if (
    Object.keys(row).some(key => ![
      'command',
      'outcome',
      'submitted',
      'reducer',
      'envelope',
      'before',
      'after',
      'reasonCode',
    ].includes(key))
    || ![
      'inspect',
      'stage',
      'backfill',
      'begin-drain',
      'complete-drain',
      'activate',
    ].includes(record.command)
    || ![
      'inspected',
      'already-satisfied',
      'verified',
      'verified-after-submission-error',
      'blocked',
      'mutation-unverified',
      'mutation-outcome-ambiguous',
    ].includes(record.outcome)
    || typeof record.submitted !== 'boolean'
    || (
      record.reasonCode !== undefined
      && (
        record.reasonCode.length === 0
        || record.reasonCode.length > 512
        || !/^[A-Z0-9_:,.-]+$/.test(record.reasonCode)
      )
    )
  ) fail('WORKER_ROLLOUT_RECEIPT_RECORD_INVALID');
  if (record.before === undefined) {
    if (
      !hasExactKeys(row, [
        'command',
        'outcome',
        'submitted',
        'reasonCode',
      ])
      || record.outcome !== 'blocked'
      || record.submitted
      || typeof record.reasonCode !== 'string'
      || !PREFLIGHT_BLOCKED_RECEIPT_REASONS.has(record.reasonCode)
      || (
        record.command === 'inspect'
        && record.reasonCode === 'WORKER_ROLLOUT_LOCAL_PROOF_UNAVAILABLE'
      )
    ) fail('WORKER_ROLLOUT_RECEIPT_RECORD_INVALID');
    return;
  }
  exactReceiptStatus(record.before);
  if (record.after !== undefined) exactReceiptStatus(record.after);
  const expectedReducer = Object.freeze({
    stage: 'admin_stage_worker_system_v1',
    backfill: 'admin_backfill_worker_roster_v1',
    'begin-drain': 'admin_begin_worker_legacy_drain_v1',
    'complete-drain': 'admin_complete_worker_legacy_drain_v1',
    activate: 'admin_activate_worker_system_v1',
  })[record.command as WorkerRolloutMutationCommand];
  if (
    (record.command === 'inspect' && record.reducer !== undefined)
    || (
      record.reducer !== undefined
      && record.reducer !== expectedReducer
    )
    || (record.submitted && (
      record.reducer === undefined
      || record.envelope === undefined
    ))
    || (!record.submitted && record.envelope !== undefined)
  ) fail('WORKER_ROLLOUT_RECEIPT_RECORD_INVALID');
  assertReceiptEnvelope(record.reducer, record.envelope);
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
    if (written <= 0) fail('WORKER_ROLLOUT_PRIVATE_WRITE_FAILED');
    offset += written;
  }
}

function publishPrivateWorkerRolloutJson(
  directory: string,
  filename: string,
  value: unknown,
): Readonly<{ path: string; digest: string }> {
  if (basename(filename) !== filename) {
    fail('WORKER_ROLLOUT_RECEIPT_NAME_INVALID');
  }
  const bytes = Buffer.from(canonicalJson(value), 'utf8');
  const digest = createHash('sha256').update(bytes).digest('hex');
  const destination = join(directory, filename);
  const temporary = join(directory, `.${filename}.tmp`);
  const descriptor = openSync(
    temporary,
    constants.O_CREAT
      | constants.O_EXCL
      | constants.O_WRONLY
      | (constants.O_NOFOLLOW ?? 0),
    PRIVATE_FILE_MODE,
  );
  try {
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, PRIVATE_FILE_MODE);
    linkSync(temporary, destination);
  } finally {
    try { unlinkSync(temporary); } catch { /* Preserve the publication error. */ }
  }
  chmodSync(destination, PRIVATE_FILE_MODE);
  const published = lstatSync(destination);
  if (
    !published.isFile()
    || published.isSymbolicLink()
    || (published.mode & 0o777) !== PRIVATE_FILE_MODE
  ) fail('WORKER_ROLLOUT_RECEIPT_FILE_PERMISSIONS');
  return Object.freeze({ path: destination, digest });
}

export function writePrivateWorkerRolloutMigrationProof(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  sourceCommit: string;
  moduleArtifactDigest: string;
  v11TableSchemaDigest: string;
  v12TableSchemaDigest: string;
  now?: Date;
}>): Readonly<{ path: string; digest: string }> {
  if (
    !GIT_COMMIT_HEX.test(input.sourceCommit)
    || !SHA256_HEX.test(input.moduleArtifactDigest)
    || !SHA256_HEX.test(input.v11TableSchemaDigest)
    || !SHA256_HEX.test(input.v12TableSchemaDigest)
  ) fail('WORKER_ROLLOUT_MIGRATION_PROOF_INVALID');
  const directory = assertPrivateReceiptDirectory(
    input.directory,
    input.repositoryRoot,
  );
  const recordedAt = (input.now ?? new Date()).toISOString();
  const timestamp = recordedAt.replace(/[-:.]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const filename =
    `worker-rollout-migration-proof-${timestamp}-${suffix}.json`;
  return publishPrivateWorkerRolloutJson(directory, filename, Object.freeze({
    schemaVersion: 1,
    kind: 'worker-rollout-complete-drain-additive-migration-proof',
    recordedAt,
    proofScope: 'loopback-only',
    dataDeletion: 'never',
    migrationProtocolVersion: 12,
    spacetimeCliVersion: '2.6.1',
    sourceCommit: input.sourceCommit,
    moduleArtifactDigest: input.moduleArtifactDigest,
    v11TableSchemaDigest: input.v11TableSchemaDigest,
    v12TableSchemaDigest: input.v12TableSchemaDigest,
    target: Object.freeze({
      label: WORKER_ROLLOUT_PRODUCTION_TARGET.label,
      uri: WORKER_ROLLOUT_PRODUCTION_TARGET.uri,
      database: WORKER_ROLLOUT_PRODUCTION_TARGET.database,
    }),
  }));
}

export function writePrivateWorkerRolloutActivationBuildProof(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  sourceCommit: string;
  clientRelease: string;
  clientArtifactDigest: string;
  pagesConfigurationDigest: string;
  now?: Date;
}>): Readonly<{ path: string; digest: string }> {
  if (
    !GIT_COMMIT_HEX.test(input.sourceCommit)
    || !RELEASE_PATTERN.test(input.clientRelease)
    || !SHA256_HEX.test(input.clientArtifactDigest)
    || !SHA256_HEX.test(input.pagesConfigurationDigest)
  ) fail('WORKER_ROLLOUT_ACTIVATION_BUILD_PROOF_INVALID');
  const directory = assertPrivateReceiptDirectory(
    input.directory,
    input.repositoryRoot,
  );
  const recordedAt = (input.now ?? new Date()).toISOString();
  const timestamp = recordedAt.replace(/[-:.]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const filename =
    `worker-rollout-activation-build-proof-${timestamp}-${suffix}.json`;
  return publishPrivateWorkerRolloutJson(directory, filename, Object.freeze({
    schemaVersion: 1,
    kind: 'worker-rollout-activation-canonical-pages-build-proof',
    recordedAt,
    buildMode: 'production',
    sourceCommit: input.sourceCommit,
    clientRelease: input.clientRelease,
    clientArtifactDigest: input.clientArtifactDigest,
    pagesConfigurationDigest: input.pagesConfigurationDigest,
    pages: Object.freeze({
      base: '/',
      releaseChannel: 'alpha',
      repositoryUrl: 'https://github.com/ael-dev3/Warpkeep',
      canonicalOrigin: 'https://warpkeep.com',
      sharedAlphaEnabled: true,
      authBridgeUrl: 'https://auth.warpkeep.com',
      oidcIssuer: 'https://auth.warpkeep.com',
      oidcAudience: 'warpkeep-spacetimedb',
      spacetimeUri: WORKER_ROLLOUT_PRODUCTION_TARGET.uri,
      spacetimeDatabase: WORKER_ROLLOUT_PRODUCTION_TARGET.database,
    }),
  }));
}

export function writePrivateWorkerRolloutReceipt(input: Readonly<{
  directory: string;
  repositoryRoot: string;
  record: WorkerRolloutExecutionRecord;
  now?: Date;
}>): Readonly<{ path: string; digest: string }> {
  assertReceiptRecord(input.record);
  const directory = assertPrivateReceiptDirectory(
    input.directory,
    input.repositoryRoot,
  );
  const recordedAt = (input.now ?? new Date()).toISOString();
  const timestamp = recordedAt.replace(/[-:.]/g, '');
  const suffix = randomUUID().replace(/-/g, '').slice(0, 12);
  const filename = `worker-rollout-${timestamp}-${input.record.command}-${suffix}.json`;
  if (basename(filename) !== filename) fail('WORKER_ROLLOUT_RECEIPT_NAME_INVALID');
  const receipt = Object.freeze({
    schemaVersion: 1,
    recordedAt,
    target: Object.freeze({
      label: WORKER_ROLLOUT_PRODUCTION_TARGET.label,
      uri: WORKER_ROLLOUT_PRODUCTION_TARGET.uri,
      database: WORKER_ROLLOUT_PRODUCTION_TARGET.database,
    }),
    ...input.record,
  });
  return publishPrivateWorkerRolloutJson(directory, filename, receipt);
}

export async function withWorkerRolloutOperatorLock<T>(
  directory: string,
  repositoryRoot: string,
  operation: () => Promise<T>,
): Promise<T> {
  const privateDirectory = assertPrivateReceiptDirectory(directory, repositoryRoot);
  const lockPath = join(privateDirectory, '.worker-rollout.lock');
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
      fail('WORKER_ROLLOUT_OPERATOR_ALREADY_RUNNING');
    }
    fail('WORKER_ROLLOUT_OPERATOR_LOCK_FAILED');
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
      // A missing lock is safe; a replacement lock must remain untouched.
    }
  }
}
