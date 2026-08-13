import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  advanceGreaterRealmPostCanaryCounterV1,
  greaterRealmActivationPolicyErrorCode,
  selectGreaterRealmCastleAllocationV1,
} from './greaterRealmActivationPolicy';
import {
  greaterRealmActivationCheckpointFromRowV1,
  greaterRealmActivationStateErrorCode,
} from './greaterRealmActivationState';
import {
  assertGreaterRealmCurrentFounderForFidV1,
  assertGreaterRealmCurrentWorldV1,
  greaterRealmCurrentAuthorityErrorCode,
  greaterRealmCurrentPassiveTerrainV1,
  type GreaterRealmCurrentWorldV1,
} from './greaterRealmCurrentAuthority';
import {
  greaterRealmFoundedPassiveTerrainForYieldClassV1,
  greaterRealmFoundingPolicyErrorCode,
} from './greaterRealmFoundingPolicy';
import {
  captureGreaterRealmFrozenTopologyV1,
  greaterRealmRelocationSnapshotErrorCode,
} from './greaterRealmRelocationSnapshot';
import {
  ADMITTED_DAILY_MARK_POLICY_VERSION,
  markAccountIsConsistent,
} from './marksAuthorityPolicy';
import {
  admissionProfileIsComplete,
  trustedProfilesEqual,
  type AdmissionReadyTrustedProfile,
} from './profileAuthorityPolicy';
import {
  GENESIS_RESOURCE_POLICY_VERSION,
  GENESIS_STARTING_RESOURCE_BALANCES,
  resourceAccountStateIsConsistent,
} from './resourceAuthorityPolicy';
import {
  CASTLE_WORKER_POLICY_VERSION,
  CASTLE_WORKERS_PER_CASTLE,
  appendCastleWorkerRosterDigest,
  rosterDigestForCastleIds,
} from './castleWorkerPolicy';
import {
  assertCastleWorkerRoster,
  expectedWorkerRowsForCastle,
} from './castleWorkerRoster';
import {
  assertInnerKeepBuilderForExistingFounder,
  insertInnerKeepBuilderForNewFounderIfEverActivated,
} from './innerKeepBuilderAuthority';
import { GREATER_REALM_CASTLE_CAPACITY } from './greaterRealmV17Policy';
import type warpkeep from './schema';
import { HEGEMONY_REALM_ID } from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>
>;

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const INITIAL_ATLAS_REVISION = 1n;

export class GreaterRealmFoundingAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GreaterRealmFoundingAuthorityError';
  }
}

function fail(code: string): never {
  throw new GreaterRealmFoundingAuthorityError(code);
}

function translatePolicyError(error: unknown): never {
  const code = greaterRealmActivationPolicyErrorCode(error)
    ?? greaterRealmActivationStateErrorCode(error)
    ?? greaterRealmCurrentAuthorityErrorCode(error)
    ?? greaterRealmFoundingPolicyErrorCode(error)
    ?? greaterRealmRelocationSnapshotErrorCode(error);
  if (code !== undefined) fail(code);
  throw error;
}

function translatedPolicyCall<Result>(work: () => Result): Result {
  try {
    return work();
  } catch (error) {
    return translatePolicyError(error);
  }
}

function currentPopulation(
  ctx: WarpkeepReducerContext,
  intendedUnfoundedFid: bigint,
): Readonly<{ world: GreaterRealmCurrentWorldV1; count: number }> {
  const world = translatedPolicyCall(() => (
    assertGreaterRealmCurrentWorldV1(ctx, 'active')
  ));
  const expected = world.activation.snapshotCastleCount
    + world.activation.postCanaryFoundingCount;
  if (
    expected < 0
    || ctx.db.castle.count() !== BigInt(expected)
    || ctx.db.realmProfileV1.count() !== BigInt(expected)
    || ctx.db.markAccountV1.count() !== BigInt(expected)
    || ctx.db.resourceAccountV1.count() !== BigInt(expected)
    || ctx.db.allowedFid.count() !== BigInt(expected + 1)
    || ctx.db.allowedFid.fid.find(intendedUnfoundedFid) === null
  ) fail('GREATER_REALM_FOUNDER_GRAPH_COUNT_INVALID');
  for (const allowed of ctx.db.allowedFid.iter()) {
    if (
      allowed.fid !== intendedUnfoundedFid
      && ctx.db.castle.ownerFid.find(allowed.fid) === null
    ) fail('GREATER_REALM_FOUNDER_GRAPH_COUNT_INVALID');
  }
  if (expected >= GREATER_REALM_CASTLE_CAPACITY) {
    fail('GREATER_REALM_CASTLE_CAPACITY_EXHAUSTED');
  }
  return Object.freeze({ world, count: expected });
}

function allocationInputs(ctx: WarpkeepReducerContext, topologyDigest: string) {
  return Object.freeze([...ctx.db.greaterRealmCastleClaimV1.iter()].map(claim => (
    Object.freeze({
      castleId: claim.castleId,
      slotId: claim.slotId,
      allocationSequence: claim.allocationSequence,
      topologyDigest,
    })
  )));
}

/** Pick a server-internal unused ID solely to ask the existing pure selector for the next slot. */
function selectionReservationCastleId(
  claims: readonly Readonly<{ castleId: bigint }>[],
): bigint {
  const used = new Set(claims.map(claim => claim.castleId));
  let candidate = U64_MAX;
  for (let attempts = 0; attempts <= GREATER_REALM_CASTLE_CAPACITY; attempts += 1) {
    if (!used.has(candidate)) return candidate;
    candidate -= 1n;
  }
  fail('GREATER_REALM_CASTLE_ID_RESERVATION_EXHAUSTED');
}

function assertFreshFounderNamespace(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  if (
    ctx.db.castle.ownerFid.find(fid) !== null
    || ctx.db.castleSlotClaimV1.ownerFid.find(fid) !== null
    || ctx.db.greaterRealmCastleClaimV1.ownerFid.find(fid) !== null
    || ctx.db.realmProfileV1.fid.find(fid) !== null
    || ctx.db.markAccountV1.fid.find(fid) !== null
    || ctx.db.resourceAccountV1.fid.find(fid) !== null
    || ctx.db.castleInnerBuilderV1.fid.find(fid) !== null
    || ctx.db.playerV2.fid.find(fid) !== null
    || ctx.db.playerOwnershipV2.fid.find(fid) !== null
  ) fail('GREATER_REALM_FOUNDER_NAMESPACE_CONFLICT');
}

function insertProfileAndMarks(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  admissionProfile: AdmissionReadyTrustedProfile,
): void {
  const profile = ctx.db.realmProfileV1.insert({
    fid,
    canonicalUsername: admissionProfile.canonicalUsername,
    displayName: admissionProfile.displayName,
    pfpUrl: admissionProfile.pfpUrl,
    publicBio: admissionProfile.publicBio,
    admittedAt: ctx.timestamp,
    firstAuthenticatedAt: undefined,
    profileUpdatedAt: ctx.timestamp,
    publicStatus: 'founded',
    communityStatsVisible: false,
    totalSnapBurnedMicros: undefined,
    marksEarnedMicros: undefined,
    marksSpentMicros: undefined,
    marksBalanceMicros: undefined,
    marksPolicyVersion: undefined,
  });
  if (
    !admissionProfileIsComplete(profile)
    || !trustedProfilesEqual(profile, admissionProfile)
  ) fail('GREATER_REALM_FOUNDER_PROFILE_INVALID');
  const marks = ctx.db.markAccountV1.insert({
    fid,
    totalSnapBurnedMicros: 0n,
    earnedMicros: 0n,
    spentMicros: 0n,
    balanceMicros: 0n,
    policyVersion: ADMITTED_DAILY_MARK_POLICY_VERSION,
    updatedAt: ctx.timestamp,
  });
  if (!markAccountIsConsistent(marks)) fail('GREATER_REALM_FOUNDER_MARKS_INVALID');
}

function insertResourceAccount(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castle: CastleRow,
): void {
  const row = ctx.db.resourceAccountV1.insert({
    fid,
    castleId: castle.castleId,
    realmId: HEGEMONY_REALM_ID,
    ...GENESIS_STARTING_RESOURCE_BALANCES,
    settledThroughMicros: ctx.timestamp.microsSinceUnixEpoch,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  if (
    row.castleId !== castle.castleId
    || row.realmId !== HEGEMONY_REALM_ID
    || !resourceAccountStateIsConsistent(row)
  ) fail('GREATER_REALM_FOUNDER_RESOURCE_INVALID');
}

/**
 * Append one canonical idle roster without inheriting the frozen v16 rollout
 * helper's 100-castle bound. Both v1 compatibility and v17 public roots move
 * together in this transaction; generic journey behavior remains elsewhere.
 */
function appendGreaterRealmFounderWorkers(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
  priorCastleCount: number,
  atlasId: string,
): void {
  const legacy = ctx.db.realmWorkerSystemV1.realmId.find(HEGEMONY_REALM_ID);
  const current = ctx.db.realmWorkerSystemV2.atlasId.find(atlasId);
  const priorWorkerCount = priorCastleCount * CASTLE_WORKERS_PER_CASTLE;
  if (
    ctx.db.realmWorkerSystemV1.count() !== 1n
    || legacy === null
    || ctx.db.realmWorkerSystemV2.count() !== 1n
    || current === null
    || legacy.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || legacy.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || legacy.expectedCastleCount !== priorCastleCount
    || legacy.expectedWorkerCount !== priorWorkerCount
    || legacy.mode !== 'active'
    || legacy.legacyDrainRequired
    || legacy.activatedAt === undefined
    || current.policyVersion !== CASTLE_WORKER_POLICY_VERSION
    || current.workersPerCastle !== CASTLE_WORKERS_PER_CASTLE
    || current.castleCapacity !== GREATER_REALM_CASTLE_CAPACITY
    || current.currentCastleCount !== priorCastleCount
    || current.currentWorkerCount !== priorWorkerCount
    || current.mode !== 'active'
    || current.rosterDigest !== legacy.rosterDigest
    || ctx.db.castleWorkerV1.count() !== BigInt(priorWorkerCount)
  ) fail('GREATER_REALM_FOUNDER_WORKER_ROOT_INVALID');
  for (const row of expectedWorkerRowsForCastle(castle)) {
    ctx.db.castleWorkerV1.insert(row);
  }
  assertCastleWorkerRoster(ctx, castle.castleId);
  const nextCastleCount = priorCastleCount + 1;
  const nextWorkerCount = nextCastleCount * CASTLE_WORKERS_PER_CASTLE;
  const castleIds = [...ctx.db.castle.iter()].map(row => row.castleId);
  const nextDigest = rosterDigestForCastleIds(castleIds);
  if (
    castleIds.length !== nextCastleCount
    || castleIds.some(id => id !== castle.castleId && id >= castle.castleId)
    || appendCastleWorkerRosterDigest(legacy.rosterDigest, castle.castleId) !== nextDigest
    || ctx.db.castleWorkerV1.count() !== BigInt(nextWorkerCount)
  ) fail('GREATER_REALM_FOUNDER_WORKER_DIGEST_INVALID');
  ctx.db.realmWorkerSystemV1.realmId.update({
    ...legacy,
    expectedCastleCount: nextCastleCount,
    expectedWorkerCount: nextWorkerCount,
    rosterDigest: nextDigest,
  });
  ctx.db.realmWorkerSystemV2.atlasId.update({
    ...current,
    currentCastleCount: nextCastleCount,
    currentWorkerCount: nextWorkerCount,
    rosterDigest: nextDigest,
  });
}

/**
 * Create one post-commit founder using only stored release data and server
 * time. This is an internal authority reached by the two existing profiled
 * admission reducers; it is not a reducer and accepts no slot or coordinate.
 */
export function ensureGreaterRealmFounderActiveV1(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  admissionProfile: AdmissionReadyTrustedProfile,
): 'created' {
  assertFreshFounderNamespace(ctx, fid);
  const population = currentPopulation(ctx, fid);
  const { world } = population;
  const priorCastleCount = population.count;
  const topology = translatedPolicyCall(() => (
    captureGreaterRealmFrozenTopologyV1(ctx)
  ));
  if (
    topology.atlasId !== world.activation.atlasId
    || topology.topologyDigest !== world.activation.topologySnapshotDigest
    || world.activation.nextAllocationSequence !== BigInt(priorCastleCount)
  ) fail('GREATER_REALM_FOUNDER_TOPOLOGY_INVALID');
  const claims = allocationInputs(ctx, topology.topologyDigest);
  const reserved = translatedPolicyCall(() => (
    selectGreaterRealmCastleAllocationV1(
      topology.slots,
      claims,
      selectionReservationCastleId(claims),
    )
  ));
  if (
    reserved.result !== 'allocated'
    || reserved.allocation.allocationSequence !== world.activation.nextAllocationSequence
  ) fail('GREATER_REALM_FOUNDER_ALLOCATION_INVALID');
  const slot = ctx.db.greaterRealmCastleSlotV1.slotId.find(
    reserved.allocation.slotId,
  );
  const cell = slot === null ? null : ctx.db.greaterRealmCellV1.cellKey.find(slot.cellKey);
  if (
    slot === null
    || cell === null
    || !slot.active
    || slot.atlasId !== world.activation.atlasId
    || slot.tier !== 1
    || cell.atlasId !== world.activation.atlasId
    || cell.cellKey !== slot.cellKey
    || cell.regionId !== reserved.allocation.regionId
    || cell.componentKey !== slot.componentKey
    || cell.tier !== 1
    || !cell.passable
    || ctx.db.greaterRealmCellOccupancyV1.cellKey.find(cell.cellKey) !== null
  ) fail('GREATER_REALM_FOUNDER_TARGET_INVALID');
  translatedPolicyCall(() => (
    greaterRealmFoundedPassiveTerrainForYieldClassV1(cell.yieldClass)
  ));

  insertProfileAndMarks(ctx, fid, admissionProfile);
  const castle = ctx.db.castle.insert({
    castleId: 0n,
    ownerFid: fid,
    tileKey: cell.cellKey,
    q: cell.atlasQ,
    r: cell.atlasR,
    level: 1,
    name: `Greater Realm Keep ${(priorCastleCount + 1).toString().padStart(3, '0')}`,
    createdAt: ctx.timestamp,
  });
  const selected = translatedPolicyCall(() => (
    selectGreaterRealmCastleAllocationV1(
      topology.slots,
      claims,
      castle.castleId,
    )
  ));
  if (
    selected.result !== 'allocated'
    || selected.allocation.slotId !== reserved.allocation.slotId
    || selected.allocation.regionId !== reserved.allocation.regionId
    || selected.allocation.regionOrderRank !== reserved.allocation.regionOrderRank
    || selected.allocation.allocationRank !== reserved.allocation.allocationRank
    || selected.allocation.allocationSequence !== reserved.allocation.allocationSequence
    || selected.allocation.topologyDigest !== reserved.allocation.topologyDigest
  ) fail('GREATER_REALM_FOUNDER_ALLOCATION_CHANGED');
  ctx.db.greaterRealmCastleClaimV1.insert({
    slotId: slot.slotId,
    ownerFid: fid,
    castleId: castle.castleId,
    atlasId: world.activation.atlasId,
    activationId: world.activation.activationId,
    state: 'active',
    claimKind: 'founded',
    allocationSequence: selected.allocation.allocationSequence,
    plannedAt: ctx.timestamp,
    activatedAt: ctx.timestamp,
    legacySlotId: undefined,
    legacyClaimedAt: undefined,
    legacyGenerationVersion: undefined,
    legacyTileKey: undefined,
    legacyQ: undefined,
    legacyR: undefined,
  });
  ctx.db.greaterRealmCellOccupancyV1.insert({
    cellKey: cell.cellKey,
    atlasId: world.activation.atlasId,
    regionId: cell.regionId,
    castleId: castle.castleId,
    atlasRevision: INITIAL_ATLAS_REVISION,
    occupiedAt: ctx.timestamp,
  });
  insertResourceAccount(ctx, fid, castle);
  appendGreaterRealmFounderWorkers(
    ctx,
    castle,
    priorCastleCount,
    world.activation.atlasId,
  );
  insertInnerKeepBuilderForNewFounderIfEverActivated(ctx, castle);

  const checkpoint = translatedPolicyCall(() => (
    advanceGreaterRealmPostCanaryCounterV1(
      greaterRealmActivationCheckpointFromRowV1(world.activation),
      'founding',
    )
  ));
  ctx.db.greaterRealmActivationV1.activationId.update({
    ...world.activation,
    nextAllocationSequence: selected.allocation.allocationSequence + 1n,
    postCanaryFoundingCount: checkpoint.postCanaryFoundingCount,
  });

  const expectedAfter = priorCastleCount + 1;
  if (
    ctx.db.castle.count() !== BigInt(expectedAfter)
    || ctx.db.allowedFid.count() !== BigInt(expectedAfter)
    || ctx.db.realmProfileV1.count() !== BigInt(expectedAfter)
    || ctx.db.markAccountV1.count() !== BigInt(expectedAfter)
    || ctx.db.resourceAccountV1.count() !== BigInt(expectedAfter)
  ) fail('GREATER_REALM_FOUNDER_GRAPH_COUNT_INVALID');
  const founder = translatedPolicyCall(() => (
    assertGreaterRealmCurrentFounderForFidV1(ctx, fid)
  ));
  translatedPolicyCall(() => greaterRealmCurrentPassiveTerrainV1(ctx, founder));
  assertCastleWorkerRoster(ctx, castle.castleId);
  assertInnerKeepBuilderForExistingFounder(ctx, castle);
  return 'created';
}

export function greaterRealmFoundingAuthorityErrorCode(
  error: unknown,
): string | undefined {
  return error instanceof GreaterRealmFoundingAuthorityError ? error.code : undefined;
}
