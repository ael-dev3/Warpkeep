import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  type ProductionPlayerCanaryBaselineInput,
  requireProductionPlayerCanaryBaselineRow,
  inspectProductionPlayerCanaryRoutePlan,
} from './productionPlayerCanaryBaseline';
import {
  PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION,
  type ProductionPlayerCanaryCommandAuthorityV1,
  type ProductionPlayerCanaryRoutePlanV1,
  productionPlayerCanaryCommandAuthorityV1,
} from './productionPlayerCanaryRoutePolicy';
import {
  PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE,
  ProductionPlayerCanaryApprovalError,
  productionPlayerCanaryApprovalRegistrationCommitmentV1,
  productionPlayerCanaryOwnerApprovalCommitmentV1,
  reconcileProductionPlayerCanaryApprovalRowsV1,
} from './productionPlayerCanaryApprovalPolicy';
import type warpkeep from './schema';

export {
  PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE,
  ProductionPlayerCanaryApprovalError,
  productionPlayerCanaryApprovalRegistrationCommitmentV1,
  productionPlayerCanaryOwnerApprovalCommitmentV1,
  reconcileProductionPlayerCanaryApprovalRowsV1,
} from './productionPlayerCanaryApprovalPolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type ApprovalRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['productionPlayerCanaryApprovalRegistrationV1']['challengeDigest']['find']
>>;

const SHA256 = /^[0-9a-f]{64}$/u;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

export type ProductionPlayerCanaryApprovalRegistrationInput = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  commandKeyPolicyVersion: string;
  commandSetCommitment: string;
  ownerApprovalArtifactDigest: string;
  ownerApprovalCommitment: string;
  approvedAtMicros: bigint;
  notAfterMicros: bigint;
}>;

export type ProductionPlayerCanaryApprovalRegistrationStatus = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  routeSetCommitment: string;
  commandKeyPolicyVersion: string;
  commandSetCommitment: string;
  ownerApprovalArtifactDigest: string;
  ownerApprovalCommitment: string;
  approvalRegistrationCommitment: string;
  approvedAtMicros: bigint;
  notAfterMicros: bigint;
  registeredAtMicros: bigint;
  approvalRegistered: boolean;
  routePlanBound: boolean;
  commandSetBound: boolean;
  ownerApprovalBound: boolean;
}>;

function fail(code: string): never {
  throw new ProductionPlayerCanaryApprovalError(code);
}

function timestampMicros(value: { microsSinceUnixEpoch: bigint }): bigint {
  return value.microsSinceUnixEpoch;
}

function validInput(
  input: ProductionPlayerCanaryApprovalRegistrationInput,
): ProductionPlayerCanaryApprovalRegistrationInput {
  if (
    input === null
    || typeof input !== 'object'
    || typeof input.fid !== 'bigint'
    || input.fid < 1n
    || input.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || typeof input.approvedAtMicros !== 'bigint'
    || input.approvedAtMicros < 1n
    || input.approvedAtMicros > U64_MAX
    || typeof input.notAfterMicros !== 'bigint'
    || input.notAfterMicros <= input.approvedAtMicros
    || input.notAfterMicros > U64_MAX
    || input.commandKeyPolicyVersion
      !== PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION
    || [
      input.reviewedAdmissionPlanDigest,
      input.evidenceNonce,
      input.serverBaselineCommitment,
      input.routeSetCommitment,
      input.commandSetCommitment,
      input.ownerApprovalArtifactDigest,
      input.ownerApprovalCommitment,
    ].some(value => typeof value !== 'string' || !SHA256.test(value))
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_INPUT_INVALID');
  return Object.freeze({ ...input });
}

function rowCommitmentMaterial(row: ApprovalRow) {
  return Object.freeze({
    challengeDigest: row.challengeDigest,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: row.serverBaselineCommitment,
    routeSetCommitment: row.routeSetCommitment,
    commandKeyPolicyVersion: row.commandKeyPolicyVersion,
    commandSetCommitment: row.commandSetCommitment,
    ownerApprovalArtifactDigest: row.ownerApprovalArtifactDigest,
    ownerApprovalCommitment: row.ownerApprovalCommitment,
    approvedAtMicros: row.approvedAtMicros,
    notAfterMicros: row.notAfterMicros,
  });
}

function statusForRow(row: ApprovalRow): ProductionPlayerCanaryApprovalRegistrationStatus {
  if (
    row.fid < 1n
    || row.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || row.commandKeyPolicyVersion
      !== PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION
    || row.approvedAtMicros < 1n
    || row.notAfterMicros <= row.approvedAtMicros
    || [
      row.challengeDigest,
      row.reviewedAdmissionPlanDigest,
      row.serverBaselineCommitment,
      row.routeSetCommitment,
      row.commandSetCommitment,
      row.ownerApprovalArtifactDigest,
      row.ownerApprovalCommitment,
      row.approvalRegistrationCommitment,
    ].some(value => !SHA256.test(value))
    || productionPlayerCanaryApprovalRegistrationCommitmentV1(
      rowCommitmentMaterial(row),
    )
      !== row.approvalRegistrationCommitment
    || timestampMicros(row.registeredAt) < row.approvedAtMicros
    || timestampMicros(row.registeredAt) >= row.notAfterMicros
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT');
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE,
    challengeDigest: row.challengeDigest,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: row.serverBaselineCommitment,
    routeSetCommitment: row.routeSetCommitment,
    commandKeyPolicyVersion: row.commandKeyPolicyVersion,
    commandSetCommitment: row.commandSetCommitment,
    ownerApprovalArtifactDigest: row.ownerApprovalArtifactDigest,
    ownerApprovalCommitment: row.ownerApprovalCommitment,
    approvalRegistrationCommitment: row.approvalRegistrationCommitment,
    approvedAtMicros: row.approvedAtMicros,
    notAfterMicros: row.notAfterMicros,
    registeredAtMicros: timestampMicros(row.registeredAt),
    approvalRegistered: true,
    routePlanBound: true,
    commandSetBound: true,
    ownerApprovalBound: true,
  });
}

function allRowsForInput(
  ctx: WarpkeepReducerContext,
  challengeDigest: string,
  input: ProductionPlayerCanaryApprovalRegistrationInput,
  approvalRegistrationCommitment: string,
): readonly (ApprovalRow | null)[] {
  return Object.freeze([
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.challengeDigest.find(
      challengeDigest,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.fid.find(input.fid),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.serverBaselineCommitment.find(
      input.serverBaselineCommitment,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.routeSetCommitment.find(
      input.routeSetCommitment,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.commandSetCommitment.find(
      input.commandSetCommitment,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.ownerApprovalArtifactDigest.find(
      input.ownerApprovalArtifactDigest,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.ownerApprovalCommitment.find(
      input.ownerApprovalCommitment,
    ),
    ctx.db.productionPlayerCanaryApprovalRegistrationV1.approvalRegistrationCommitment.find(
      approvalRegistrationCommitment,
    ),
  ]);
}

function inputForBaseline(
  input: ProductionPlayerCanaryApprovalRegistrationInput,
): ProductionPlayerCanaryBaselineInput {
  return Object.freeze({
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
  });
}

function requireBoundServerAuthority(
  ctx: WarpkeepReducerContext,
  input: ProductionPlayerCanaryApprovalRegistrationInput,
): Readonly<{
  baseline: ReturnType<typeof requireProductionPlayerCanaryBaselineRow>;
  routePlan: ProductionPlayerCanaryRoutePlanV1;
  commands: ProductionPlayerCanaryCommandAuthorityV1;
}> {
  const baseline = requireProductionPlayerCanaryBaselineRow(
    ctx,
    inputForBaseline(input),
  );
  const routePlan = inspectProductionPlayerCanaryRoutePlan(
    ctx,
    inputForBaseline(input),
  );
  const commands = productionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: input.evidenceNonce,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: routePlan.routeSetCommitment,
  });
  if (
    baseline.baselineCommitment !== input.serverBaselineCommitment
    || baseline.routeSetCommitment !== input.routeSetCommitment
    || routePlan.routeSetCommitment !== input.routeSetCommitment
    || commands.commandKeyPolicyVersion !== input.commandKeyPolicyVersion
    || commands.commandSetCommitment !== input.commandSetCommitment
    || input.ownerApprovalCommitment
      !== productionPlayerCanaryOwnerApprovalCommitmentV1({
        evidenceNonce: input.evidenceNonce,
        ownerApprovalArtifactDigest: input.ownerApprovalArtifactDigest,
        serverBaselineCommitment: input.serverBaselineCommitment,
        routeSetCommitment: input.routeSetCommitment,
      })
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_AUTHORITY_MISMATCH');
  return Object.freeze({ baseline, routePlan, commands });
}

/**
 * Append exactly one owner approval. Exact replay is a no-op; every partial
 * unique-key collision fails before insert and no update/delete path exists.
 */
export function registerProductionPlayerCanaryApprovalV1(
  ctx: WarpkeepReducerContext,
  rawInput: ProductionPlayerCanaryApprovalRegistrationInput,
): ProductionPlayerCanaryApprovalRegistrationStatus {
  const input = validInput(rawInput);
  const baseline = requireProductionPlayerCanaryBaselineRow(
    ctx,
    inputForBaseline(input),
  );
  const material = Object.freeze({
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: input.serverBaselineCommitment,
    routeSetCommitment: input.routeSetCommitment,
    commandKeyPolicyVersion: input.commandKeyPolicyVersion,
    commandSetCommitment: input.commandSetCommitment,
    ownerApprovalArtifactDigest: input.ownerApprovalArtifactDigest,
    ownerApprovalCommitment: input.ownerApprovalCommitment,
    approvedAtMicros: input.approvedAtMicros,
    notAfterMicros: input.notAfterMicros,
  });
  const commitment = productionPlayerCanaryApprovalRegistrationCommitmentV1(
    material,
  );
  const rows = allRowsForInput(
    ctx,
    baseline.challengeDigest,
    input,
    commitment,
  );
  const existing = reconcileProductionPlayerCanaryApprovalRowsV1({
    byChallenge: rows[0]!,
    byFid: rows[1]!,
    byBaseline: rows[2]!,
    byRouteSet: rows[3]!,
    byCommandSet: rows[4]!,
    byArtifact: rows[5]!,
    byOwnerApproval: rows[6]!,
    byRegistration: rows[7]!,
  }, commitment);
  if (existing !== null) {
    statusForRow(existing);
    if (
      existing.fid !== input.fid
      || existing.reviewedAdmissionPlanDigest !== input.reviewedAdmissionPlanDigest
      || existing.serverBaselineCommitment !== input.serverBaselineCommitment
      || existing.routeSetCommitment !== input.routeSetCommitment
      || existing.commandKeyPolicyVersion !== input.commandKeyPolicyVersion
      || existing.commandSetCommitment !== input.commandSetCommitment
      || existing.ownerApprovalArtifactDigest !== input.ownerApprovalArtifactDigest
      || existing.ownerApprovalCommitment !== input.ownerApprovalCommitment
      || existing.approvedAtMicros !== input.approvedAtMicros
      || existing.notAfterMicros !== input.notAfterMicros
    ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT');
    return statusForRow(existing);
  }
  const authority = requireBoundServerAuthority(ctx, input);
  const registeredAtMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (
    authority.baseline.capturedAt.microsSinceUnixEpoch > input.approvedAtMicros
    || input.approvedAtMicros > registeredAtMicros
    || registeredAtMicros >= input.notAfterMicros
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_TIME_INVALID');
  return statusForRow(ctx.db.productionPlayerCanaryApprovalRegistrationV1.insert({
    ...material,
    fid: input.fid,
    approvalRegistrationCommitment: commitment,
    registeredAt: ctx.timestamp,
  }));
}

/** Commitment-only admin readback. Definite absence never manufactures authority. */
export function inspectProductionPlayerCanaryApprovalRegistrationV1(
  ctx: WarpkeepReducerContext,
  rawInput: ProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryApprovalRegistrationStatus {
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, rawInput);
  const row = ctx.db.productionPlayerCanaryApprovalRegistrationV1.challengeDigest.find(
    baseline.challengeDigest,
  );
  if (row !== null) return statusForRow(row);
  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_PROFILE,
    challengeDigest: baseline.challengeDigest,
    reviewedAdmissionPlanDigest: baseline.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baseline.baselineCommitment,
    routeSetCommitment: baseline.routeSetCommitment,
    commandKeyPolicyVersion: PRODUCTION_PLAYER_CANARY_COMMAND_KEY_POLICY_VERSION,
    commandSetCommitment: '',
    ownerApprovalArtifactDigest: '',
    ownerApprovalCommitment: '',
    approvalRegistrationCommitment: '',
    approvedAtMicros: 0n,
    notAfterMicros: 0n,
    registeredAtMicros: 0n,
    approvalRegistered: false,
    routePlanBound: false,
    commandSetBound: false,
    ownerApprovalBound: false,
  });
}

export function requireProductionPlayerCanaryApprovalRegistrationV1(
  ctx: WarpkeepReducerContext,
  input: ProductionPlayerCanaryBaselineInput,
): ApprovalRow {
  const baseline = requireProductionPlayerCanaryBaselineRow(ctx, input);
  const row = ctx.db.productionPlayerCanaryApprovalRegistrationV1.challengeDigest.find(
    baseline.challengeDigest,
  );
  if (row === null) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_REQUIRED');
  statusForRow(row);
  if (
    row.fid !== input.fid
    || row.reviewedAdmissionPlanDigest !== input.reviewedAdmissionPlanDigest
    || row.serverBaselineCommitment !== baseline.baselineCommitment
    || row.routeSetCommitment !== baseline.routeSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_CONFLICT');
  return row;
}

export function productionPlayerCanaryApprovalErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof ProductionPlayerCanaryApprovalError
    ? error.code
    : undefined;
}
