import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  assertCastleWorkerRoster,
  castleWorkerPublicStateIsConsistent,
} from './castleWorkerRoster';
import {
  CASTLE_WORKER_GATHER_QUANTUM_MICROS,
  CASTLE_WORKER_TRAVEL_MICROS_PER_STEP,
  CASTLE_WORKERS_PER_CASTLE,
  workerResourceKinds,
  workerResourcePolicy,
} from './castleWorkerPolicy';
import { workerCommandReceiptShapeIsValid } from './castleWorkerCommandPolicy';
import { WARPKEEP_ALPHA_TERMS_VERSION } from './entryAgreementPolicy';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  assertGreaterRealmCurrentWorldV1,
} from './greaterRealmCurrentAuthority';
import {
  parseGreaterRealmPublicCapacityLeaseV1,
} from './greaterRealmActivationPolicy';
import {
  resolveGreaterRealmResourceLocationV1,
} from './greaterRealmResourceLocationAuthority';
import {
  greaterRealmWorkerRouteStepsWithinBoundV1,
} from './greaterRealmWorkerAuthority';
import {
  greaterRealmWorkerCapacityDigestV1,
  greaterRealmWorkerDispatchFingerprintV2,
  parseGreaterRealmWorkerDispatchReceiptKindV2,
} from './greaterRealmWorkerPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
import {
  RESOURCE_BALANCE_CAP,
  planResourceSettlement,
} from './resourceAuthorityPolicy';
import {
  productionPlayerCanaryBaselineErrorCode,
  requireProductionPlayerCanaryBaselineRow,
} from './productionPlayerCanaryBaseline';
import {
  requireProductionPlayerCanaryApprovalRegistrationV1,
  productionPlayerCanaryApprovalErrorCode,
} from './productionPlayerCanaryApproval';
import {
  PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS,
  productionPlayerCanaryCommandAuthorityV1,
  productionPlayerCanaryRoutePolicyErrorCode,
} from './productionPlayerCanaryRoutePolicy';
import type warpkeep from './schema';
import { sha256Hex } from './sha256';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type WorkerReceipt = NonNullable<ReturnType<
  WarpkeepReducerContext['db']['workerCommandIdempotencyV1']['requestKey']['find']
>>;

export const PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_PROFILE =
  'warpkeep-production-player-canary-admin-evidence-v1';

const SHA256 = /^[0-9a-f]{64}$/u;
const MAXIMUM_ADMIN_AUDIT_ROWS = 16_384;
const U64_MAX = 0xffff_ffff_ffff_ffffn;

export type ProductionPlayerCanaryAdminEvidenceInput = Readonly<{
  fid: bigint;
  reviewedAdmissionPlanDigest: string;
  evidenceNonce: string;
}>;

export type ProductionPlayerCanaryAdminEvidence = Readonly<{
  profile: typeof PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_PROFILE;
  challengeDigest: string;
  reviewedAdmissionPlanDigest: string;
  serverBaselineCommitment: string;
  admissionProfileDigest: string;
  evidenceDigest: string;
  routeSetCommitment: string;
  commandSetCommitment: string;
  ownerApprovalArtifactDigest: string;
  ownerApprovalCommitment: string;
  approvalRegistrationCommitment: string;
  requestCycle: bigint;
  requestedAtMicros: bigint;
  baselineCapturedAtMicros: bigint;
  observedAtMicros: bigint;
  earliestDispatchAtMicros: bigint;
  latestRecallAtMicros: bigint;
  directTierOneFounder: true;
  normalRequestAdmission: true;
  ownerBound: true;
  currentTermsAccepted: true;
  workerCount: number;
  dispatchReceiptCount: number;
  recallReceiptCount: number;
  distinctResourceKindCount: number;
  minimumGatheringElapsedMicros: bigint;
  maximumGatheringElapsedMicros: bigint;
  maximumRouteSteps: number;
  terminalIdleWorkerCount: number;
  terminalAssignmentCount: bigint;
  terminalOccupationCount: bigint;
  terminalScheduleCount: bigint;
  isolatedResourceKindCount: number;
  resourceQuantumCount: number;
  foodDelta: bigint;
  woodDelta: bigint;
  stoneDelta: bigint;
  goldDelta: bigint;
}>;

export class ProductionPlayerCanaryEvidenceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ProductionPlayerCanaryEvidenceError';
  }
}

function fail(code: string): never {
  throw new ProductionPlayerCanaryEvidenceError(code);
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
      && left.microsSinceUnixEpoch === right.microsSinceUnixEpoch;
}

function requireU64(value: bigint, code: string): bigint {
  if (typeof value !== 'bigint' || value < 0n || value > U64_MAX) fail(code);
  return value;
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
  code: string,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) fail(code);
    result.push(row);
  }
  return Object.freeze(result);
}

function framed(values: readonly (string | number | bigint | boolean)[]): string {
  return values.map((value) => {
    const text = value.toString();
    return `${text.length}:${text}`;
  }).join('|');
}

function profileField(value: string | undefined): string {
  return value === undefined ? '-' : `+${value}`;
}

function admissionProfileDigest(profile: Readonly<{
  canonicalUsername: string | undefined;
  displayName: string | undefined;
  pfpUrl: string | undefined;
  publicBio: string | undefined;
}>): string {
  return sha256Hex(`${framed([
    'warpkeep.production-player-canary.admission-profile.v1',
    profileField(profile.canonicalUsername),
    profileField(profile.displayName),
    profileField(profile.pfpUrl),
    profileField(profile.publicBio),
  ])}\n`);
}

function exactReceipt(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  idempotencyKey: string,
): WorkerReceipt {
  const row = ctx.db.workerCommandIdempotencyV1.requestKey.find(
    `${fid.toString()}:${idempotencyKey}`,
  );
  if (
    row === null
    || row.fid !== fid
    || !workerCommandReceiptShapeIsValid(row)
  ) fail('PRODUCTION_PLAYER_CANARY_COMMAND_RECEIPT_INVALID');
  return row;
}

function exactZeroRows<Row>(rows: Iterable<Row>, code: string): void {
  for (const _row of rows) fail(code);
}

function assertNoLegacyJourneyResidue(
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

/**
 * Admin-only, read-only aggregate for one exact player-path canary.
 *
 * FID, command keys, worker/location/castle identifiers, and private topology
 * participate only in the returned digest. None is projected in the result.
 */
export function inspectProductionPlayerCanaryAdminEvidence(
  ctx: WarpkeepReducerContext,
  input: ProductionPlayerCanaryAdminEvidenceInput,
): ProductionPlayerCanaryAdminEvidence {
  if (
    input.fid < 1n
    || input.fid > BigInt(Number.MAX_SAFE_INTEGER)
    || !SHA256.test(input.reviewedAdmissionPlanDigest)
    || !SHA256.test(input.evidenceNonce)
  ) fail('PRODUCTION_PLAYER_CANARY_EVIDENCE_INPUT_INVALID');
  const baselineRow = requireProductionPlayerCanaryBaselineRow(ctx, {
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
  });
  const registration = requireProductionPlayerCanaryApprovalRegistrationV1(ctx, {
    fid: input.fid,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    evidenceNonce: input.evidenceNonce,
  });
  const commandAuthority = productionPlayerCanaryCommandAuthorityV1({
    evidenceNonce: input.evidenceNonce,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baselineRow.baselineCommitment,
    routeSetCommitment: baselineRow.routeSetCommitment,
  });
  if (
    registration.routeSetCommitment !== baselineRow.routeSetCommitment
    || registration.commandKeyPolicyVersion
      !== commandAuthority.commandKeyPolicyVersion
    || registration.commandSetCommitment !== commandAuthority.commandSetCommitment
  ) fail('PRODUCTION_PLAYER_CANARY_APPROVAL_REGISTRATION_INVALID');
  const dispatchKeys = commandAuthority.commands.map(
    command => command.dispatchIdempotencyKey,
  );
  const recallKeys = commandAuthority.commands.map(
    command => command.recallIdempotencyKey,
  );
  const baseline = Object.freeze({
    food: requireU64(
      baselineRow.resourceFood,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    wood: requireU64(
      baselineRow.resourceWood,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    stone: requireU64(
      baselineRow.resourceStone,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    gold: requireU64(
      baselineRow.resourceGold,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    settledThroughMicros: requireU64(
      baselineRow.resourceSettledThroughMicros,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    revision: requireU64(
      baselineRow.resourceRevision,
      'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
    ),
    policyVersion: baselineRow.resourcePolicyVersion,
  });
  const baselineObservedAtMicros = requireU64(
    timestampMicros(baselineRow.capturedAt),
    'PRODUCTION_PLAYER_CANARY_BASELINE_INVALID',
  );
  if (
    baselineObservedAtMicros < baseline.settledThroughMicros
    || baseline.food > RESOURCE_BALANCE_CAP
    || baseline.wood > RESOURCE_BALANCE_CAP
    || baseline.stone > RESOURCE_BALANCE_CAP
    || baseline.gold > RESOURCE_BALANCE_CAP
  ) fail('PRODUCTION_PLAYER_CANARY_BASELINE_INVALID');

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
    || baselineRow.castleId !== castle.castleId
    || baselineRow.atlasId !== world.atlas.atlasId
    || baselineRow.atlasRevision !== world.atlas.revision
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
    || timestampMicros(request.requestedAt) <= 0n
    || timestampMicros(request.requestedAt) >= timestampMicros(allowed.invitedAt)
    || baselineObservedAtMicros < timestampMicros(acceptance.acceptedAt)
  ) fail('PRODUCTION_PLAYER_CANARY_NORMAL_ADMISSION_REQUIRED');

  let matchingAdmissionAuditCount = 0;
  let inspectedAuditRows = 0;
  let matchingAdmissionAuditMaterial = '';
  for (const audit of ctx.db.adminAudit.iter()) {
    inspectedAuditRows += 1;
    if (inspectedAuditRows > MAXIMUM_ADMIN_AUDIT_ROWS) {
      fail('PRODUCTION_PLAYER_CANARY_AUDIT_BOUND_EXCEEDED');
    }
    if (
      audit.targetFid === input.fid
      && audit.action === 'admit_founder_for_access_request_v2'
      && sameTimestamp(audit.createdAt, allowed.invitedAt)
    ) {
      matchingAdmissionAuditCount += 1;
      matchingAdmissionAuditMaterial = framed([
        audit.action,
        audit.actorSubject,
        timestampMicros(audit.createdAt),
        audit.note,
      ]);
    }
  }
  if (matchingAdmissionAuditCount !== 1) {
    fail('PRODUCTION_PLAYER_CANARY_NORMAL_ADMISSION_REQUIRED');
  }

  assertNoLegacyJourneyResidue(ctx, input.fid, castle.castleId);
  const allReceipts = boundedRows(
    ctx.db.workerCommandIdempotencyV1.byFid.filter(input.fid),
    9,
    'PRODUCTION_PLAYER_CANARY_COMMAND_RECEIPT_OVERFLOW',
  );
  if (allReceipts.length !== 8) {
    fail('PRODUCTION_PLAYER_CANARY_EXACT_COMMAND_RECEIPTS_REQUIRED');
  }
  const roster = [...assertCastleWorkerRoster(ctx, castle.castleId)]
    .sort((left, right) => left.ordinal - right.ordinal);
  if (roster.length !== CASTLE_WORKERS_PER_CASTLE) {
    fail('PRODUCTION_PLAYER_CANARY_ROSTER_INVALID');
  }

  const privateJourneyMaterial: string[] = [];
  const routeApprovalMaterial: string[] = [];
  const resourceKinds = new Set<string>();
  const gatheringElapsed: bigint[] = [];
  const routeStepCounts: number[] = [];
  const dispatchTimestamps: bigint[] = [];
  const recallTimestamps: bigint[] = [];
  for (let index = 0; index < CASTLE_WORKERS_PER_CASTLE; index += 1) {
    const ordinal = index + 1;
    const worker = roster[index]!;
    const dispatch = exactReceipt(ctx, input.fid, dispatchKeys[index]!);
    const recall = exactReceipt(ctx, input.fid, recallKeys[index]!);
    if (
      worker.ordinal !== ordinal
      || worker.originCastleId !== castle.castleId
      || worker.status !== 'idle'
      || !castleWorkerPublicStateIsConsistent(worker)
      || worker.revision !== 4n
      || worker.timelineRevision !== 4
      || dispatch.workerId !== worker.workerId
      || dispatch.resourceKind === undefined
      || dispatch.siteId === undefined
      || dispatch.assignmentId === undefined
      || !dispatch.commandKind.startsWith('dispatch-v2:')
      || dispatch.resultRevision !== 1n
      || recall.commandKind !== 'recall'
      || recall.workerId !== dispatch.workerId
      || recall.resourceKind !== dispatch.resourceKind
      || recall.siteId !== dispatch.siteId
      || recall.assignmentId !== dispatch.assignmentId
      || recall.resultRevision !== 3n
      || timestampMicros(recall.createdAt) <= timestampMicros(dispatch.createdAt)
      || baselineObservedAtMicros > timestampMicros(dispatch.createdAt)
      || timestampMicros(dispatch.createdAt) < registration.approvedAtMicros
      || timestampMicros(recall.createdAt) >= registration.notAfterMicros
    ) fail('PRODUCTION_PLAYER_CANARY_JOURNEY_INVALID');

    const metadata = parseGreaterRealmWorkerDispatchReceiptKindV2(
      dispatch.commandKind,
    );
    const lease = parseGreaterRealmPublicCapacityLeaseV1({
      leaseId: dispatch.siteId,
      nodeCount: metadata.nodeCount,
    });
    const location = resolveGreaterRealmResourceLocationV1(
      ctx,
      world.atlas.atlasId,
      lease.locationId,
    );
    const first = location.rows[0]!;
    const origin = ctx.db.greaterRealmCellV1.cellKey.find(castle.tileKey);
    if (
      origin === null
      || location.resourceKind !== dispatch.resourceKind
      || location.nodeCount !== metadata.nodeCount
      || metadata.expectedRevision !== world.atlas.revision
      || metadata.capacityDigest !== greaterRealmWorkerCapacityDigestV1({
        atlasId: world.atlas.atlasId,
        atlasRevision: world.atlas.revision,
        locationId: location.locationId,
        cellKey: first.cellKey,
        regionId: first.regionId,
        componentKey: first.componentKey,
        resourceKind: first.resourceKind,
        tier: first.tier,
        policyVersion: first.policyVersion,
        nodeCount: location.nodeCount,
      })
      || metadata.fingerprint !== greaterRealmWorkerDispatchFingerprintV2({
        fid: input.fid,
        castleId: castle.castleId,
        workerId: worker.workerId,
        resourceKind: dispatch.resourceKind,
        locationId: location.locationId,
        expectedRevision: metadata.expectedRevision,
      })
    ) fail('PRODUCTION_PLAYER_CANARY_REACHABILITY_INVALID');
    const routeSteps = greaterRealmWorkerRouteStepsWithinBoundV1(
      ctx,
      world.atlas.atlasId,
      location.component.componentKey,
      location.component.rootCellKey,
      origin,
      location.destination,
      PRODUCTION_PLAYER_CANARY_MAXIMUM_ROUTE_STEPS,
    );
    if (routeSteps === undefined) {
      fail('PRODUCTION_PLAYER_CANARY_REACHABILITY_INVALID');
    }
    const elapsed = timestampMicros(recall.createdAt)
      - timestampMicros(dispatch.createdAt)
      - BigInt(routeSteps) * CASTLE_WORKER_TRAVEL_MICROS_PER_STEP;
    if (
      elapsed < CASTLE_WORKER_GATHER_QUANTUM_MICROS
      || elapsed >= CASTLE_WORKER_GATHER_QUANTUM_MICROS * 2n
    ) fail('PRODUCTION_PLAYER_CANARY_NATURAL_GATHERING_INVALID');
    resourceKinds.add(dispatch.resourceKind);
    gatheringElapsed.push(elapsed);
    routeStepCounts.push(routeSteps);
    dispatchTimestamps.push(timestampMicros(dispatch.createdAt));
    recallTimestamps.push(timestampMicros(recall.createdAt));
    routeApprovalMaterial.push(framed([
      ordinal,
      worker.workerId,
      dispatch.resourceKind,
      location.locationId,
      metadata.expectedRevision,
      routeSteps,
      metadata.nodeCount,
    ]));
    privateJourneyMaterial.push(framed([
      ordinal,
      dispatch.requestKey,
      dispatch.workerId,
      dispatch.resourceKind,
      dispatch.siteId,
      dispatch.assignmentId,
      dispatch.commandKind,
      dispatch.resultRevision,
      timestampMicros(dispatch.createdAt),
      recall.requestKey,
      recall.resultRevision,
      timestampMicros(recall.createdAt),
      routeSteps,
      elapsed,
    ]));
  }
  if (
    resourceKinds.size !== workerResourceKinds().length
    || workerResourceKinds().some(kind => !resourceKinds.has(kind))
  ) fail('PRODUCTION_PLAYER_CANARY_DISTINCT_RESOURCES_REQUIRED');
  if (
    dispatchTimestamps.reduce((maximum, value) => value > maximum ? value : maximum)
      - dispatchTimestamps.reduce((minimum, value) => value < minimum ? value : minimum)
      > 30_000_000n
  ) fail('PRODUCTION_PLAYER_CANARY_DISPATCH_BURST_INVALID');
  if (
    recallTimestamps.reduce((maximum, value) => value > maximum ? value : maximum)
      - recallTimestamps.reduce((minimum, value) => value < minimum ? value : minimum)
      > 30_000_000n
  ) fail('PRODUCTION_PLAYER_CANARY_RECALL_BURST_INVALID');

  const terminalAssignments = boundedRows(
    ctx.db.workerAssignmentV1.byFid.filter(input.fid),
    1,
    'PRODUCTION_PLAYER_CANARY_TERMINAL_GRAPH_INVALID',
  );
  const terminalOccupations = boundedRows(
    ctx.db.workerNodeOccupationV1.byOriginCastle.filter(castle.castleId),
    1,
    'PRODUCTION_PLAYER_CANARY_TERMINAL_GRAPH_INVALID',
  );
  let terminalScheduleCount = 0n;
  for (const worker of roster) {
    for (const _schedule of ctx.db.workerAssignmentScheduleV1.byWorker.filter(
      worker.workerId,
    )) {
      terminalScheduleCount += 1n;
      fail('PRODUCTION_PLAYER_CANARY_TERMINAL_GRAPH_INVALID');
    }
  }
  if (terminalAssignments.length !== 0 || terminalOccupations.length !== 0) {
    fail('PRODUCTION_PLAYER_CANARY_TERMINAL_GRAPH_INVALID');
  }

  const observedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
  if (
    observedAtMicros < baselineObservedAtMicros
    || observedAtMicros >= registration.notAfterMicros
    || resource.account.revision <= baseline.revision
  ) fail('PRODUCTION_PLAYER_CANARY_RESOURCE_EVIDENCE_INVALID');
  let baselineProjected;
  let terminalProjected;
  try {
    baselineProjected = planResourceSettlement(
      baseline,
      resource.terrainKind,
      observedAtMicros,
    );
    terminalProjected = planResourceSettlement(
      resource.account,
      resource.terrainKind,
      observedAtMicros,
    );
  } catch {
    fail('PRODUCTION_PLAYER_CANARY_RESOURCE_EVIDENCE_INVALID');
  }
  const deltas = {
    food: terminalProjected.balances.food - baselineProjected.balances.food,
    wood: terminalProjected.balances.wood - baselineProjected.balances.wood,
    stone: terminalProjected.balances.stone - baselineProjected.balances.stone,
    gold: terminalProjected.balances.gold - baselineProjected.balances.gold,
  };
  for (const kind of workerResourceKinds()) {
    if (deltas[kind] !== workerResourcePolicy(kind).ratePerQuantum) {
      fail('PRODUCTION_PLAYER_CANARY_RESOURCE_ISOLATION_INVALID');
    }
  }

  const minimumGatheringElapsedMicros = gatheringElapsed.reduce(
    (minimum, value) => value < minimum ? value : minimum,
  );
  const maximumGatheringElapsedMicros = gatheringElapsed.reduce(
    (maximum, value) => value > maximum ? value : maximum,
  );
  const maximumRouteSteps = routeStepCounts.reduce(
    (maximum, value) => value > maximum ? value : maximum,
  );
  const earliestDispatchAtMicros = dispatchTimestamps.reduce(
    (minimum, value) => value < minimum ? value : minimum,
  );
  const latestRecallAtMicros = recallTimestamps.reduce(
    (maximum, value) => value > maximum ? value : maximum,
  );
  const challengeDigest = sha256Hex(`${framed([
    'warpkeep.production-player-canary.challenge.v1',
    input.evidenceNonce,
  ])}\n`);
  if (challengeDigest !== baselineRow.challengeDigest) {
    fail('PRODUCTION_PLAYER_CANARY_BASELINE_INVALID');
  }
  const currentAdmissionProfileDigest = admissionProfileDigest(profile);
  const routeSetCommitment = sha256Hex(`${framed([
    'warpkeep.production-player-canary.route-set.v1',
    input.evidenceNonce,
    input.reviewedAdmissionPlanDigest,
    ...routeApprovalMaterial,
  ])}\n`);
  if (routeSetCommitment !== registration.routeSetCommitment) {
    fail('PRODUCTION_PLAYER_CANARY_ROUTE_APPROVAL_MISMATCH');
  }
  const evidenceDigest = sha256Hex(`${framed([
    'warpkeep.production-player-canary.admin-evidence.v1',
    challengeDigest,
    input.reviewedAdmissionPlanDigest,
    baselineRow.baselineCommitment,
    routeSetCommitment,
    registration.commandSetCommitment,
    registration.ownerApprovalArtifactDigest,
    registration.ownerApprovalCommitment,
    registration.approvalRegistrationCommitment,
    input.fid,
    request.requestCycle,
    timestampMicros(request.requestedAt),
    allowed.authEpoch,
    timestampMicros(allowed.invitedAt),
    matchingAdmissionAuditMaterial,
    currentAdmissionProfileDigest,
    claim.slotId,
    claim.castleId,
    claim.allocationSequence,
    claim.claimKind,
    claim.state,
    world.atlas.atlasId,
    world.atlas.revision,
    baselineObservedAtMicros,
    baseline.settledThroughMicros,
    baseline.revision,
    baseline.food,
    baseline.wood,
    baseline.stone,
    baseline.gold,
    ...privateJourneyMaterial,
    observedAtMicros,
    earliestDispatchAtMicros,
    latestRecallAtMicros,
    terminalProjected.balances.food,
    terminalProjected.balances.wood,
    terminalProjected.balances.stone,
    terminalProjected.balances.gold,
    deltas.food,
    deltas.wood,
    deltas.stone,
    deltas.gold,
  ])}\n`);

  return Object.freeze({
    profile: PRODUCTION_PLAYER_CANARY_ADMIN_EVIDENCE_PROFILE,
    challengeDigest,
    reviewedAdmissionPlanDigest: input.reviewedAdmissionPlanDigest,
    serverBaselineCommitment: baselineRow.baselineCommitment,
    admissionProfileDigest: currentAdmissionProfileDigest,
    evidenceDigest,
    routeSetCommitment,
    commandSetCommitment: registration.commandSetCommitment,
    ownerApprovalArtifactDigest: registration.ownerApprovalArtifactDigest,
    ownerApprovalCommitment: registration.ownerApprovalCommitment,
    approvalRegistrationCommitment: registration.approvalRegistrationCommitment,
    requestCycle: request.requestCycle,
    requestedAtMicros: timestampMicros(request.requestedAt),
    baselineCapturedAtMicros: baselineObservedAtMicros,
    observedAtMicros,
    earliestDispatchAtMicros,
    latestRecallAtMicros,
    directTierOneFounder: true,
    normalRequestAdmission: true,
    ownerBound: true,
    currentTermsAccepted: true,
    workerCount: CASTLE_WORKERS_PER_CASTLE,
    dispatchReceiptCount: CASTLE_WORKERS_PER_CASTLE,
    recallReceiptCount: CASTLE_WORKERS_PER_CASTLE,
    distinctResourceKindCount: workerResourceKinds().length,
    minimumGatheringElapsedMicros,
    maximumGatheringElapsedMicros,
    maximumRouteSteps,
    terminalIdleWorkerCount: CASTLE_WORKERS_PER_CASTLE,
    terminalAssignmentCount: BigInt(terminalAssignments.length),
    terminalOccupationCount: BigInt(terminalOccupations.length),
    terminalScheduleCount,
    isolatedResourceKindCount: workerResourceKinds().length,
    resourceQuantumCount: workerResourceKinds().length,
    foodDelta: deltas.food,
    woodDelta: deltas.wood,
    stoneDelta: deltas.stone,
    goldDelta: deltas.gold,
  });
}

export function productionPlayerCanaryEvidenceErrorCode(
  error: unknown,
): string | undefined {
  return productionPlayerCanaryBaselineErrorCode(error)
    ?? productionPlayerCanaryApprovalErrorCode(error)
    ?? productionPlayerCanaryRoutePolicyErrorCode(error)
    ?? (error instanceof ProductionPlayerCanaryEvidenceError
    ? error.code
    : undefined);
}
