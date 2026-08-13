import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  assertCastleWorkerRoster,
  castleWorkerPublicStateIsConsistent,
} from './castleWorkerRoster';
import { WARPKEEP_ALPHA_TERMS_VERSION } from './entryAgreementPolicy';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  assertGreaterRealmCurrentWorldV1,
} from './greaterRealmCurrentAuthority';
import { assertGenesisResourceForFid } from './resourceAuthority';
import {
  type ProductionPlayerCanaryBaselineInput,
  type ProductionPlayerCanaryBaselineStatus,
  type ProductionPlayerCanaryPristineBaselineMaterial,
  type ValidProductionPlayerCanaryBaselineInput,
  assertProductionPlayerCanaryPristineBaselineMaterial,
  failProductionPlayerCanaryBaseline,
  productionPlayerCanaryBaselineCommitments,
  productionPlayerCanaryBaselineErrorCode,
  productionPlayerCanaryMissingBaselineStatus,
  productionPlayerCanaryBaselineStatusForStoredRow,
  reconcileProductionPlayerCanaryStoredBaselines,
  validateProductionPlayerCanaryBaselineInput,
} from './productionPlayerCanaryBaselinePolicy';
import type warpkeep from './schema';

export {
  PRODUCTION_PLAYER_CANARY_BASELINE_PROFILE,
  ProductionPlayerCanaryBaselineError,
  type ProductionPlayerCanaryBaselineInput,
  type ProductionPlayerCanaryBaselineStatus,
  assertProductionPlayerCanaryPristineBaselineMaterial,
  productionPlayerCanaryBaselineCommitments,
  productionPlayerCanaryBaselineErrorCode,
  productionPlayerCanaryChallengeDigest,
} from './productionPlayerCanaryBaselinePolicy';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type BaselineRow = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['productionPlayerCanaryBaselineV1']['challengeDigest']['find']
>>;

const MAXIMUM_ADMIN_AUDIT_ROWS = 16_384;

function fail(code: string): never {
  return failProductionPlayerCanaryBaseline(code);
}

function timestampMicros(value: { microsSinceUnixEpoch: bigint }): bigint {
  return value.microsSinceUnixEpoch;
}

function sameTimestamp(
  left: { microsSinceUnixEpoch: bigint } | undefined,
  right: { microsSinceUnixEpoch: bigint } | undefined,
): boolean {
  return left === undefined
    ? right === undefined
    : right !== undefined
      && timestampMicros(left) === timestampMicros(right);
}

const validateInput = validateProductionPlayerCanaryBaselineInput;

function exactZeroRows<Row>(rows: Iterable<Row>, code: string): void {
  for (const _row of rows) fail(code);
}

/** The same legacy graph exclusion is required at capture and final evidence. */
export function assertProductionPlayerCanaryNoLegacyJourneyResidue(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castleId: bigint,
): void {
  if (
    ctx.db.goldExpeditionV1.fid.find(fid) !== null
    || ctx.db.foodExpeditionV1.fid.find(fid) !== null
    || ctx.db.woodExpeditionV1.fid.find(fid) !== null
    || ctx.db.stoneExpeditionV1.fid.find(fid) !== null
  ) fail('PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT');
  exactZeroRows(
    ctx.db.goldNodeOccupationV1.byOriginCastle.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.foodNodeOccupationV1.byOriginCastle.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.woodNodeOccupationV1.byOriginCastle.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.stoneNodeOccupationV1.byOriginCastle.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.goldExpeditionScheduleV1.originCastleId.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.foodExpeditionScheduleV1.originCastleId.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.woodExpeditionScheduleV1.originCastleId.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.stoneExpeditionScheduleV1.originCastleId.filter(castleId),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.goldExpeditionIdempotencyV1.fid.filter(fid),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.foodExpeditionIdempotencyV1.fid.filter(fid),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.woodExpeditionIdempotencyV1.fid.filter(fid),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
  exactZeroRows(
    ctx.db.stoneExpeditionIdempotencyV1.fid.filter(fid),
    'PRODUCTION_PLAYER_CANARY_LEGACY_JOURNEY_PRESENT',
  );
}

function countRows<Row>(rows: Iterable<Row>, maximum: bigint, code: string): bigint {
  let count = 0n;
  for (const _row of rows) {
    count += 1n;
    if (count > maximum) fail(code);
  }
  return count;
}

function buildPristineMaterial(
  ctx: WarpkeepReducerContext,
  input: ValidProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryPristineBaselineMaterial {
  const world = assertGreaterRealmCurrentWorldV1(ctx, 'active');
  const founder = assertGreaterRealmCurrentFounderForFidV1(ctx, input.fid);
  const claim = founder.greaterRealmClaim;
  const castle = founder.castle;
  const slot = claim === undefined
    ? null
    : ctx.db.greaterRealmCastleSlotV1.slotId.find(claim.slotId);
  if (
    founder.source !== 'v17'
    || claim === undefined
    || slot === null
    || claim.claimKind !== 'founded'
    || claim.state !== 'active'
    || slot.tier !== 1
    || castle.level !== 1
    || claim.atlasId !== world.atlas.atlasId
    || claim.activationId !== world.activation.activationId
  ) fail('PRODUCTION_PLAYER_CANARY_DIRECT_TIER_ONE_FOUNDER_REQUIRED');

  const allowed = ctx.db.allowedFid.fid.find(input.fid);
  const request = ctx.db.accessRequestV1.fid.find(input.fid);
  const profile = ctx.db.realmProfileV1.fid.find(input.fid);
  const player = ctx.db.playerV2.fid.find(input.fid);
  const ownership = ctx.db.playerOwnershipV2.fid.find(input.fid);
  const acceptance = ctx.db.alphaTermsAcceptanceV1.acceptanceKey.find(
    `${input.fid.toString()}:${WARPKEEP_ALPHA_TERMS_VERSION}`,
  );
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  const admittedAt = profile === null ? undefined : profile.admittedAt;
  if (
    allowed === null
    || !allowed.enabled
    || allowed.authEpoch !== 1
    || request === null
    || request.requestCycle !== 0n
    || profile === null
    || player === null
    || ownership === null
    || acceptance === null
    || admittedAt === undefined
    || resource.founderSource !== 'v17'
    || resource.castle.castleId !== castle.castleId
    || player.fid !== input.fid
    || player.status !== 'active'
    || !sameTimestamp(player.joinedAt, admittedAt)
    || ownership.fid !== input.fid
    || profile.firstAuthenticatedAt === undefined
    || profile.publicStatus !== 'active'
    || !profile.communityStatsVisible
    || acceptance.fid !== input.fid
    || acceptance.termsVersion !== WARPKEEP_ALPHA_TERMS_VERSION
    || timestampMicros(acceptance.acceptedAt)
      < timestampMicros(profile.firstAuthenticatedAt)
    || !sameTimestamp(allowed.invitedAt, admittedAt)
    || !sameTimestamp(castle.createdAt, admittedAt)
    || !sameTimestamp(claim.plannedAt, admittedAt)
    || !sameTimestamp(claim.activatedAt, admittedAt)
    || !sameTimestamp(resource.account.createdAt, admittedAt)
  ) fail('PRODUCTION_PLAYER_CANARY_NORMAL_ADMISSION_REQUIRED');

  let matchingAdmissionAuditCount = 0;
  let inspectedAuditRows = 0;
  for (const audit of ctx.db.adminAudit.iter()) {
    inspectedAuditRows += 1;
    if (inspectedAuditRows > MAXIMUM_ADMIN_AUDIT_ROWS) {
      fail('PRODUCTION_PLAYER_CANARY_AUDIT_BOUND_EXCEEDED');
    }
    if (
      audit.targetFid === input.fid
      && audit.action === 'admit_founder_for_access_request_v2'
      && sameTimestamp(audit.createdAt, allowed.invitedAt)
    ) matchingAdmissionAuditCount += 1;
  }
  if (matchingAdmissionAuditCount !== 1) {
    fail('PRODUCTION_PLAYER_CANARY_NORMAL_ADMISSION_REQUIRED');
  }

  assertProductionPlayerCanaryNoLegacyJourneyResidue(
    ctx,
    input.fid,
    castle.castleId,
  );
  const roster = [...assertCastleWorkerRoster(ctx, castle.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal);
  const pristineWorkers = roster.map(worker => Object.freeze({
    workerId: worker.workerId,
    originCastleId: worker.originCastleId,
    ordinal: worker.ordinal,
    status: worker.status,
    timelineRevision: worker.timelineRevision,
    revision: worker.revision,
    optionalTimelineEmpty: castleWorkerPublicStateIsConsistent(worker)
      && worker.resourceKind === undefined
      && worker.siteId === undefined
      && worker.startedAtMicros === undefined
      && worker.arrivesAtMicros === undefined
      && worker.gatheringEndsAtMicros === undefined
      && worker.returnStartedAtMicros === undefined
      && worker.returnsAtMicros === undefined
      && worker.routeSteps === undefined
      && worker.returnStartProgressBasisPoints === undefined,
  }));
  let scheduleCount = 0n;
  for (const worker of roster) {
    scheduleCount += countRows(
      ctx.db.workerAssignmentScheduleV1.byWorker.filter(worker.workerId),
      1n,
      'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED',
    );
  }
  const account = resource.account;
  const material = Object.freeze({
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
    challengeDigest: input.challengeDigest,
    castleId: castle.castleId,
    atlasId: world.atlas.atlasId,
    atlasRevision: world.atlas.revision,
    capturedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    resourceSettledThroughMicros: account.settledThroughMicros,
    resourceRevision: account.revision,
    resourceFood: account.food,
    resourceWood: account.wood,
    resourceStone: account.stone,
    resourceGold: account.gold,
    resourcePolicyVersion: account.policyVersion,
    resourceCreatedAtMicros: timestampMicros(account.createdAt),
    resourceUpdatedAtMicros: timestampMicros(account.updatedAt),
    admittedAtMicros: timestampMicros(admittedAt),
    acceptedAtMicros: timestampMicros(acceptance.acceptedAt),
    requestedAtMicros: timestampMicros(request.requestedAt),
    invitedAtMicros: timestampMicros(allowed.invitedAt),
    pristineWorkers: Object.freeze(pristineWorkers),
    assignmentCount: countRows(
      ctx.db.workerAssignmentV1.byFid.filter(input.fid),
      1n,
      'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED',
    ),
    occupationCount: countRows(
      ctx.db.workerNodeOccupationV1.byOriginCastle.filter(castle.castleId),
      1n,
      'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED',
    ),
    scheduleCount,
    commandReceiptCount: countRows(
      ctx.db.workerCommandIdempotencyV1.byFid.filter(input.fid),
      1n,
      'PRODUCTION_PLAYER_CANARY_BASELINE_PRISTINE_REQUIRED',
    ),
  });
  assertProductionPlayerCanaryPristineBaselineMaterial(material);
  return material;
}

function storedRow(row: BaselineRow) {
  return Object.freeze({
    challengeDigest: row.challengeDigest,
    fid: row.fid,
    reviewedAdmissionPlanDigest: row.reviewedAdmissionPlanDigest,
    baselineCommitment: row.baselineCommitment,
    castleId: row.castleId,
    atlasId: row.atlasId,
    atlasRevision: row.atlasRevision,
    capturedAtMicros: timestampMicros(row.capturedAt),
    resourceSettledThroughMicros: row.resourceSettledThroughMicros,
    resourceRevision: row.resourceRevision,
    resourceFood: row.resourceFood,
    resourceWood: row.resourceWood,
    resourceStone: row.resourceStone,
    resourceGold: row.resourceGold,
    resourcePolicyVersion: row.resourcePolicyVersion,
    resourceCreatedAtMicros: row.resourceCreatedAtMicros,
    pristineRosterCommitment: row.pristineRosterCommitment,
  });
}

function statusForRow(
  row: BaselineRow,
  input: ValidProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryBaselineStatus {
  return productionPlayerCanaryBaselineStatusForStoredRow(storedRow(row), input);
}

function existingBaselineRow(
  ctx: WarpkeepReducerContext,
  input: ValidProductionPlayerCanaryBaselineInput,
): BaselineRow | null {
  const byChallenge = ctx.db.productionPlayerCanaryBaselineV1.challengeDigest.find(
    input.challengeDigest,
  );
  const byFid = ctx.db.productionPlayerCanaryBaselineV1.fid.find(input.fid);
  const reconciliation = reconcileProductionPlayerCanaryStoredBaselines(
    byChallenge === null ? null : storedRow(byChallenge),
    byFid === null ? null : storedRow(byFid),
    input,
  );
  return reconciliation.row === null ? null : byChallenge;
}

/**
 * Capture at most once. An exact lost-response replay returns the immutable
 * row even after the journey has begun; any nonce/plan/FID collision fails.
 */
export function captureProductionPlayerCanaryBaseline(
  ctx: WarpkeepReducerContext,
  rawInput: ProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryBaselineStatus {
  const input = validateInput(rawInput);
  const existing = existingBaselineRow(ctx, input);
  if (existing !== null) return statusForRow(existing, input);

  const material = buildPristineMaterial(ctx, input);
  const commitments = productionPlayerCanaryBaselineCommitments(material);
  const rosterCommitment = commitments.pristineRosterCommitment;
  const commitment = commitments.serverBaselineCommitment;
  if (ctx.db.productionPlayerCanaryBaselineV1.baselineCommitment.find(commitment) !== null) {
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_CONFLICT');
  }
  const inserted = ctx.db.productionPlayerCanaryBaselineV1.insert({
    challengeDigest: material.challengeDigest,
    fid: material.fid,
    reviewedAdmissionPlanDigest: material.reviewedAdmissionPlanDigest,
    baselineCommitment: commitment,
    castleId: material.castleId,
    atlasId: material.atlasId,
    atlasRevision: material.atlasRevision,
    capturedAt: ctx.timestamp,
    resourceSettledThroughMicros: material.resourceSettledThroughMicros,
    resourceRevision: material.resourceRevision,
    resourceFood: material.resourceFood,
    resourceWood: material.resourceWood,
    resourceStone: material.resourceStone,
    resourceGold: material.resourceGold,
    resourcePolicyVersion: material.resourcePolicyVersion,
    resourceCreatedAtMicros: material.resourceCreatedAtMicros,
    pristineRosterCommitment: rosterCommitment,
  });
  return statusForRow(inserted, input);
}

/** Read and reconcile the immutable row without consulting mutable journey state. */
export function inspectProductionPlayerCanaryBaseline(
  ctx: WarpkeepReducerContext,
  rawInput: ProductionPlayerCanaryBaselineInput,
): ProductionPlayerCanaryBaselineStatus {
  const input = validateInput(rawInput);
  const row = existingBaselineRow(ctx, input);
  return row === null
    ? productionPlayerCanaryMissingBaselineStatus(input)
    : statusForRow(row, input);
}

/** Final evidence loads this raw private snapshot by nonce-derived challenge. */
export function requireProductionPlayerCanaryBaselineRow(
  ctx: WarpkeepReducerContext,
  rawInput: ProductionPlayerCanaryBaselineInput,
): BaselineRow {
  const input = validateInput(rawInput);
  const row = existingBaselineRow(ctx, input);
  if (row === null) fail('PRODUCTION_PLAYER_CANARY_BASELINE_REQUIRED');
  statusForRow(row, input);
  return row;
}
