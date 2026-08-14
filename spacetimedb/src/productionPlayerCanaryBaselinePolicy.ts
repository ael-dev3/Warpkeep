import { CASTLE_WORKERS_PER_CASTLE } from './castleWorkerPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  GENESIS_STARTING_RESOURCE_BALANCES,
  RESOURCE_BALANCE_CAP,
} from './resourceAuthorityPolicy';
import { sha256Hex } from './sha256';

export const PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE =
  'warpkeep-production-player-canary-server-baseline-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

export type ProductionPlayerCanaryBaselineInput = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
}>;

export type ValidProductionPlayerCanaryBaselineInput = Readonly<
  ProductionPlayerCanaryBaselineInput & { challengeDigest: string }
>;

export type ProductionPlayerCanaryCapturedBaselineStatus = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  capturedAtMicros: bigint;
  baselineCaptured: true;
  directTierOneFounder: true;
  normalRequestAdmission: true;
  pristineWorkerCount: number;
  terminalGraphEmpty: true;
  pristineResourceAccount: true;
}>;

export type ProductionPlayerCanaryMissingBaselineStatus = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: '';
  routeSetCommitment: '';
  capturedAtMicros: 0n;
  baselineCaptured: false;
  directTierOneFounder: false;
  normalRequestAdmission: false;
  pristineWorkerCount: 0;
  terminalGraphEmpty: false;
  pristineResourceAccount: false;
}>;

export type ProductionPlayerCanaryBaselineStatus =
  | ProductionPlayerCanaryCapturedBaselineStatus
  | ProductionPlayerCanaryMissingBaselineStatus;

export type ProductionPlayerCanaryPristineBaselineMaterial = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
  challengeDigest: string;
  routeSetCommitment: string;
  castleId: bigint;
  atlasId: string;
  atlasRevision: bigint;
  capturedAtMicros: bigint;
  resourceSettledThroughMicros: bigint;
  resourceRevision: bigint;
  resourceFood: bigint;
  resourceWood: bigint;
  resourceStone: bigint;
  resourceGold: bigint;
  resourcePolicyVersion: string;
  resourceCreatedAtMicros: bigint;
  resourceUpdatedAtMicros: bigint;
  admittedAtMicros: bigint;
  acceptedAtMicros: bigint;
  requestedAtMicros: bigint;
  invitedAtMicros: bigint;
  pristineWorkers: readonly Readonly<{
    workerId: string;
    originCastleId: bigint;
    ordinal: number;
    status: string;
    timelineRevision: number;
    revision: bigint;
    optionalTimelineEmpty: boolean;
  }>[];
  assignmentCount: bigint;
  occupationCount: bigint;
  scheduleCount: bigint;
  commandReceiptCount: bigint;
}>;

export type ProductionPlayerCanaryStoredBaseline = Readonly<{
  challengeDigest: string;
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  baselineCommitment: string;
  routeSetCommitment: string;
  castleId: bigint;
  atlasId: string;
  atlasRevision: bigint;
  capturedAtMicros: bigint;
  resourceSettledThroughMicros: bigint;
  resourceRevision: bigint;
  resourceFood: bigint;
  resourceWood: bigint;
  resourceStone: bigint;
  resourceGold: bigint;
  resourcePolicyVersion: string;
  resourceCreatedAtMicros: bigint;
  pristineRosterCommitment: string;
}>;

/**
 * Nonce-independent integrity audit for the append-only stored baseline.
 * This deliberately cannot recompute `baselineCommitment`: that commitment is
 * framed with the raw private evidence nonce, which is available only to the
 * final evidence path. It still proves every persisted scalar and digest shape
 * plus the exact pristine genesis resource chronology.
 */
export function assertProductionPlayerCanaryStoredBaselineIntegrityV2(
  row: ProductionPlayerCanaryStoredBaseline,
  observedAtMicros: bigint,
): void {
  const code = 'STATE_INTEGRITY';
  requireU64(row.fid, code);
  requireU64(row.castleId, code);
  requireU64(row.atlasRevision, code);
  requireU64(row.capturedAtMicros, code);
  requireU64(row.resourceSettledThroughMicros, code);
  requireU64(row.resourceRevision, code);
  requireU64(row.resourceFood, code);
  requireU64(row.resourceWood, code);
  requireU64(row.resourceStone, code);
  requireU64(row.resourceGold, code);
  requireU64(row.resourceCreatedAtMicros, code);
  requireU64(observedAtMicros, code);
  if (
    row.fid < 1n
    || row.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || row.castleId < 1n
    || row.atlasRevision < 1n
    || row.capturedAtMicros < 1n
    || row.capturedAtMicros > observedAtMicros
    || typeof row.atlasId !== 'string'
    || row.atlasId.length < 1
    || !SHA256.test(row.challengeDigest)
    || !SHA256.test(row.reviewedAdmissionPlanDigest)
    || !SHA256.test(row.baselineCommitment)
    || !SHA256.test(row.routeSetCommitment)
    || !SHA256.test(row.pristineRosterCommitment)
    || row.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
    || row.resourceRevision !== 0n
    || row.resourceFood !== GENESIS_STARTING_RESOURCE_BALANCES.food
    || row.resourceWood !== GENESIS_STARTING_RESOURCE_BALANCES.wood
    || row.resourceStone !== GENESIS_STARTING_RESOURCE_BALANCES.stone
    || row.resourceGold !== GENESIS_STARTING_RESOURCE_BALANCES.gold
    || row.resourceCreatedAtMicros < 1n
    || row.resourceCreatedAtMicros > row.capturedAtMicros
    || row.resourceSettledThroughMicros !== row.resourceCreatedAtMicros
  ) failProductionPlayerCanaryBaseline(code);
}

export class ProductionPlayerCanaryBaselineError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryBaselineError';
  }
}

export function failProductionPlayerCanaryBaseline(code: string): never {
  throw new ProductionPlayerCanaryBaselineError(code);
}

function requireU64(value: bigint, code: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) {
    failProductionPlayerCanaryBaseline(code);
  }
  return value;
}

function framed(values: readonly (string | number | bigint | boolean)[]): string {
  return values.map((value) => {
    const text = value.toString();
    return `${text.length}:${text}`;
  }).join('|');
}

export function productionPlayerCanaryChallengeDigest(evidenceNonce: string): string {
  if (typeof evidenceNonce !== 'string' || !SHA256.test(evidenceNonce)) {
    failProductionPlayerCanaryBaseline('PRODUCTION_PLAYER_CANARY_BASELINE_INPUT_INVALID');
  }
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    evidenceNonce,
  ])}\n`);
}

export function validateProductionPlayerCanaryBaselineInput(
  input: ProductionPlayerCanaryBaselineInput,
): ValidProductionPlayerCanaryBaselineInput {
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.fid !== 'bigint'
    || input.fid < 1n
    || input.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || typeof input.reviewedAdmissionPlanDigest !== 'string'
    || !SHA256.test(input.reviewedAdmissionPlanDigest)
    || typeof input.evidenceNonce !== 'string'
    || !SHA256.test(input.evidenceNonce)
  ) failProductionPlayerCanaryBaseline('PRODUCTION_PLAYER_CANARY_BASELINE_INPUT_INVALID');
  return Object.freeze({
    ...input,
    challengeDigest: productionPlayerCanaryChallengeDigest(input.evidenceNonce),
  });
}

export function assertProductionPlayerCanaryPristineBaselineMaterial(
  material: ProductionPlayerCanaryPristineBaselineMaterial,
): void {
  const code = 'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED';
  requireU64(material.fid, code);
  requireU64(material.castleId, code);
  requireU64(material.atlasRevision, code);
  requireU64(material.capturedAtMicros, code);
  requireU64(material.resourceSettledThroughMicros, code);
  requireU64(material.resourceRevision, code);
  requireU64(material.resourceFood, code);
  requireU64(material.resourceWood, code);
  requireU64(material.resourceStone, code);
  requireU64(material.resourceGold, code);
  requireU64(material.resourceCreatedAtMicros, code);
  requireU64(material.resourceUpdatedAtMicros, code);
  if (
    !SHA256.test(material.reviewedAdmissionPlanDigest)
    || !SHA256.test(material.evidenceNonce)
    || !SHA256.test(material.routeSetCommitment)
    || material.challengeDigest
      !== productionPlayerCanaryChallengeDigest(material.evidenceNonce)
    || material.atlasId.length < 1
    || material.atlasRevision < 1n
    || material.requestedAtMicros <= 0n
    || material.requestedAtMicros >= material.invitedAtMicros
    || material.invitedAtMicros !== material.admittedAtMicros
    || material.acceptedAtMicros < material.admittedAtMicros
    || material.capturedAtMicros < material.acceptedAtMicros
    || material.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
    || material.resourceRevision !== 0n
    || material.resourceFood !== GENESIS_STARTING_RESOURCE_BALANCES.food
    || material.resourceWood !== GENESIS_STARTING_RESOURCE_BALANCES.wood
    || material.resourceStone !== GENESIS_STARTING_RESOURCE_BALANCES.stone
    || material.resourceGold !== GENESIS_STARTING_RESOURCE_BALANCES.gold
    || material.resourceFood > RESOURCE_BALANCE_CAP
    || material.resourceWood > RESOURCE_BALANCE_CAP
    || material.resourceStone > RESOURCE_BALANCE_CAP
    || material.resourceGold > RESOURCE_BALANCE_CAP
    || material.resourceCreatedAtMicros !== material.admittedAtMicros
    || material.resourceSettledThroughMicros !== material.resourceCreatedAtMicros
    || material.resourceUpdatedAtMicros !== material.resourceCreatedAtMicros
    || material.assignmentCount !== 0n
    || material.occupationCount !== 0n
    || material.scheduleCount !== 0n
    || material.commandReceiptCount !== 0n
    || material.pristineWorkers.length !== CASTLE_WORKERS_PER_CASTLE
  ) failProductionPlayerCanaryBaseline(code);
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const worker = material.pristineWorkers[index]!;
    if (
      worker.ordinal !== index + 1
      || worker.originCastleId !== material.castleId
      || worker.status !== 'idle'
      || worker.timelineRevision !== 0
      || worker.revision !== 0n
      || worker.optionalTimelineEmpty !== true
    ) failProductionPlayerCanaryBaseline(code);
  }
}

function pristineRosterCommitment(
  material: ProductionPlayerCanaryPristineBaselineMaterial,
): string {
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.pristine-roster.v1',
    material.evidenceNonce,
    material.fid,
    material.castleId,
    ...material.pristineWorkers.flatMap(worker => [
      worker.ordinal,
      worker.workerId,
      worker.originCastleId,
      worker.status,
      worker.timelineRevision,
      worker.revision,
      worker.optionalTimelineEmpty,
    ]),
  ])}\n`);
}

type BaselineCommitmentMaterial = Pick<
  ProductionPlayerCanaryPristineBaselineMaterial,
  | 'fid' | 'reviewedAdmissionPlanDigest' | 'evidenceNonce' | 'challengeDigest'
  | 'routeSetCommitment'
  | 'castleId' | 'atlasId' | 'atlasRevision' | 'capturedAtMicros'
  | 'resourceSettledThroughMicros' | 'resourceRevision'
  | 'resourceFood' | 'resourceWood' | 'resourceStone' | 'resourceGold'
  | 'resourcePolicyVersion' | 'resourceCreatedAtMicros'
>;

function baselineCommitment(
  material: BaselineCommitmentMaterial,
  rosterCommitment: string,
): string {
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.server-baseline.v1',
    material.evidenceNonce,
    material.reviewedAdmissionPlanDigest,
    material.challengeDigest,
    material.routeSetCommitment,
    material.fid,
    material.castleId,
    material.atlasId,
    material.atlasRevision,
    material.capturedAtMicros,
    material.resourceSettledThroughMicros,
    material.resourceRevision,
    material.resourceFood,
    material.resourceWood,
    material.resourceStone,
    material.resourceGold,
    material.resourcePolicyVersion,
    material.resourceCreatedAtMicros,
    rosterCommitment,
  ])}\n`);
}

export function productionPlayerCanaryBaselineCommitments(
  material: ProductionPlayerCanaryPristineBaselineMaterial,
): Readonly<{
  pristineRosterCommitment: string;
  serverBaselineCommitment: string;
}> {
  assertProductionPlayerCanaryPristineBaselineMaterial(material);
  const rosterCommitment = pristineRosterCommitment(material);
  return Object.freeze({
    pristineRosterCommitment: rosterCommitment,
    serverBaselineCommitment: baselineCommitment(material, rosterCommitment),
  });
}

export function productionPlayerCanaryBaselineStatusForStoredRow(
  row: ProductionPlayerCanaryStoredBaseline,
  input: ValidProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryCapturedBaselineStatus {
  if (
    row.challengeDigest !== input.challengeDigest
    || row.fid !== input.fid
    || row.reviewedAdmissionPlanDigest !== input.reviewedAdmissionPlanDigest
    || !SHA256.test(row.routeSetCommitment)
    || !SHA256.test(row.pristineRosterCommitment)
    || row.atlasId.length < 1
    || row.atlasRevision < 1n
    || row.resourcePolicyVersion !== GENESIS_RESOURCE_POLICY_VERSION
    || row.resourceRevision !== 0n
    || row.resourceFood !== GENESIS_STARTING_RESOURCE_BALANCES.food
    || row.resourceWood !== GENESIS_STARTING_RESOURCE_BALANCES.wood
    || row.resourceStone !== GENESIS_STARTING_RESOURCE_BALANCES.stone
    || row.resourceGold !== GENESIS_STARTING_RESOURCE_BALANCES.gold
    || row.resourceCreatedAtMicros > row.capturedAtMicros
    || row.resourceSettledThroughMicros !== row.resourceCreatedAtMicros
    || baselineCommitment({ ...row, evidenceNonce: input.evidenceNonce },
      row.pristineRosterCommitment) !== row.baselineCommitment
  ) failProductionPlayerCanaryBaseline('PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT');
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE,
    challengeDigest: row.challengeDigest,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: row.baselineCommitment,
    routeSetCommitment: row.routeSetCommitment,
    capturedAtMicros: row.capturedAtMicros,
    baselineCaptured: true,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    pristineWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    terminalGraphEmpty: true,
    pristineResourceAccount: true,
  });
}

export function productionPlayerCanaryMissingBaselineStatus(
  input: ValidProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryMissingBaselineStatus {
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE,
    challengeDigest: input.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: '',
    routeSetCommitment: '',
    capturedAtMicros: 0n,
    baselineCaptured: false,
    directTierOneFounder: false,
    normalRequestAdmission: false,
    pristineWorkerCount: 0,
    terminalGraphEmpty: false,
    pristineResourceAccount: false,
  });
}

export function reconcileProductionPlayerCanaryStoredBaselines(
  byChallenge: ProductionPlayerCanaryStoredBaseline | null,
  byFid: ProductionPlayerCanaryStoredBaseline | null,
  input: ValidProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryBaselineStoredReconciliation {
  if (byChallenge === null && byFid === null) {
    return Object.freeze({ row: null, status: null });
  }
  if (
    byChallenge === null
    || byFid === null
    || byChallenge.challengeDigest !== byFid.challengeDigest
  ) failProductionPlayerCanaryBaseline('PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT');
  return Object.freeze({
    row: byChallenge,
    status: productionPlayerCanaryBaselineStatusForStoredRow(byChallenge, input),
  });
}

export type ProductionPlayerCanaryBaselineStoredReconciliation = Readonly<{
  row: ProductionPlayerCanaryStoredBaseline | null;
  status: ProductionPlayerCanaryCapturedBaselineStatus | null;
}>;

export function productionPlayerCanaryBaselineErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof ProductionPlayerCanaryBaselineError
    ? error.code
    : undefined;
}
