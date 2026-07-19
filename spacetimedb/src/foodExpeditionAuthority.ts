import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import {
  FOOD_EXPEDITION_POLICY_VERSION,
  FOOD_EXPEDITION_U64_MAX,
  FOOD_GATHERING_TOTAL_FOOD,
  FoodExpeditionPolicyError,
  assertFoodExpeditionCapacity,
  assertFoodExpeditionIdempotencyKey,
  foodExpeditionStateIsConsistent,
  planFoodExpeditionAccrual,
  planFoodExpeditionTimeline,
} from './foodExpeditionPolicy';
import {
  CANONICAL_TIER_I_FOOD_SITES_V1,
  FOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_FOOD_SITE_COUNT,
  canonicalFoodSiteV1ForId,
  matchesCanonicalTierIFoodSiteV1,
} from './foodSitePolicy';
import { canonicalPassableRouteSteps } from './goldSitePolicy';
import {
  RESOURCE_BALANCE_CAP,
  ResourceAuthorityPolicyError,
  planRawResourceSettlement,
} from './resourceAuthorityPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
import {
  ResourceExpeditionReservationAuthorityError,
  activeExpeditionResourceReservations,
  planResourceSettlementForActiveExpeditionReservations,
} from './resourceExpeditionReservationAuthority';
import type warpkeep from './schema';
import {
  CANONICAL_REALM,
  canonicalMetaForKey,
  canonicalTileForKey,
  matchesCanonicalTerrain,
  matchesCanonicalWorldMeta,
} from './world';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type FoodSiteRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['foodSiteV1']['siteId']['find']>
>;
type FoodOccupationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['foodNodeOccupationV1']['siteId']['find']>
>;
type FoodExpeditionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['foodExpeditionV1']['expeditionId']['find']>
>;
type FoodScheduleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['foodExpeditionScheduleV1']['scheduleId']['find']>
>;

const SCHEDULE_STAGE_ARRIVAL = 'arrival';
const SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
const SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';

export class FoodExpeditionAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FoodExpeditionAuthorityError';
  }
}

function fail(code: string): never {
  throw new FoodExpeditionAuthorityError(code);
}

function safeNextRevision(current: bigint): bigint {
  if (current < 0n || current >= FOOD_EXPEDITION_U64_MAX) {
    fail('FOOD_EXPEDITION_RESOURCE_REVISION');
  }
  return current + 1n;
}

function isFoodTerrain(kind: string): boolean {
  return kind === 'lowland' || kind === 'meadow';
}

function assertCanonicalFoodSiteRow(row: FoodSiteRow): void {
  if (!matchesCanonicalTierIFoodSiteV1(row)) fail('FOOD_SITE_INTEGRITY');
  const tile = canonicalTileForKey(`${row.q},${row.r}`);
  const meta = canonicalMetaForKey(`${row.q},${row.r}`);
  if (
    tile === undefined
    || meta === undefined
    || !meta.passable
    || meta.staticContentKind !== 'resource-capable'
    || !isFoodTerrain(meta.terrainKind)
  ) fail('FOOD_SITE_INTEGRITY');
}

type FoodSiteShape = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

function assertFoodSiteWorldRows(
  ctx: WarpkeepReducerContext,
  site: FoodSiteShape,
): void {
  const tileKey = `${site.q},${site.r}`;
  const expectedTile = canonicalTileForKey(tileKey);
  const expectedMeta = canonicalMetaForKey(tileKey);
  const storedTile = ctx.db.worldTile.key.find(tileKey);
  const storedMeta = ctx.db.worldTileMetaV1.tileKey.find(tileKey);
  if (
    expectedTile === undefined
    || expectedMeta === undefined
    || storedTile === null
    || storedMeta === null
    || !matchesCanonicalTerrain(storedTile)
    || !matchesCanonicalWorldMeta(storedMeta)
    || storedTile.q !== site.q
    || storedTile.r !== site.r
    || storedMeta.staticContentKind !== 'resource-capable'
    || !storedMeta.passable
    || !isFoodTerrain(storedMeta.terrainKind)
  ) fail('FOOD_SITE_WORLD_INTEGRITY');
}

function requestKeyFor(fid: bigint, idempotencyKey: string): string {
  assertFoodExpeditionIdempotencyKey(idempotencyKey);
  return `${fid}:${idempotencyKey}`;
}

function occupationMatchesExpedition(
  occupation: FoodOccupationRow,
  expedition: FoodExpeditionRow,
): boolean {
  return occupation.siteId === expedition.siteId
    && occupation.originCastleId === expedition.originCastleId
    && occupation.startedAtMicros === expedition.startedAtMicros
    && occupation.arrivesAtMicros === expedition.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === expedition.gatheringEndsAtMicros
    && occupation.returnsAtMicros === expedition.returnsAtMicros;
}

function assertOccupationMatchesExpedition(
  occupation: FoodOccupationRow,
  expedition: FoodExpeditionRow,
): void {
  if (!occupationMatchesExpedition(occupation, expedition)) {
    fail('FOOD_OCCUPATION_INTEGRITY');
  }
}

function currentOccupationPhaseFor(expedition: FoodExpeditionRow): 'outbound' | 'gathering' {
  if (expedition.phase === 'outbound') return 'outbound';
  if (expedition.phase === 'gathering') return 'gathering';
  fail('FOOD_OCCUPATION_PHASE_INVALID');
}

function assertExpeditionState(expedition: FoodExpeditionRow): void {
  if (!foodExpeditionStateIsConsistent(expedition)) fail('FOOD_EXPEDITION_STATE_INVALID');
}

function insertSchedule(
  ctx: WarpkeepReducerContext,
  expedition: FoodExpeditionRow,
  stage: string,
  atMicros: bigint,
): void {
  ctx.db.foodExpeditionScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    originCastleId: expedition.originCastleId,
    siteId: expedition.siteId,
    stage,
  });
}

function expectedScheduleTimeMicros(
  expedition: FoodExpeditionRow,
  stage: string,
): bigint | undefined {
  if (stage === SCHEDULE_STAGE_ARRIVAL) return expedition.arrivesAtMicros;
  if (stage === SCHEDULE_STAGE_GATHERING_EXPIRY) return expedition.gatheringEndsAtMicros;
  if (stage === SCHEDULE_STAGE_RETURN_COMPLETE) return expedition.returnsAtMicros;
  return undefined;
}

function scheduleMatchesExpedition(
  schedule: FoodScheduleRow,
  expedition: FoodExpeditionRow,
): boolean {
  const expectedAtMicros = expectedScheduleTimeMicros(expedition, schedule.stage);
  return expectedAtMicros !== undefined
    && schedule.originCastleId === expedition.originCastleId
    && schedule.siteId === expedition.siteId
    && schedule.scheduledAt.tag === 'Time'
    && schedule.scheduledAt.value.microsSinceUnixEpoch === expectedAtMicros;
}

/**
 * Check the private remaining-award reservation before a direct Food credit.
 * Passive Food is capped by the shared resource-policy adapter on every read
 * and settlement path; this check confirms the active row and account still
 * leave room for its exact uncredited award.
 */
function assertFoodCapacityReservation(
  ctx: WarpkeepReducerContext,
  resource: ReturnType<typeof assertGenesisResourceForFid>,
  expedition: Pick<FoodExpeditionRow, 'creditedFood'>,
): void {
  const reservedFood = activeExpeditionResourceReservations(ctx, resource.account.fid).food;
  if (reservedFood !== FOOD_GATHERING_TOTAL_FOOD - expedition.creditedFood) {
    fail('FOOD_EXPEDITION_RESERVATION_INTEGRITY');
  }
  assertFoodExpeditionCapacity(
    resource.account.food,
    expedition.creditedFood,
    RESOURCE_BALANCE_CAP,
  );
}

function transitionArrival(
  ctx: WarpkeepReducerContext,
  expedition: FoodExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.arrivesAtMicros) {
    fail('FOOD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase === 'gathering' || expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound') fail('FOOD_EXPEDITION_PHASE_INVALID');
  const occupation = ctx.db.foodNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('FOOD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound') fail('FOOD_OCCUPATION_PHASE_INVALID');
  ctx.db.foodExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'gathering',
    updatedAt: ctx.timestamp,
  });
  ctx.db.foodNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'gathering',
  });
}

function creditExpiredFood(
  ctx: WarpkeepReducerContext,
  expedition: FoodExpeditionRow,
): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now < expedition.gatheringEndsAtMicros) fail('FOOD_EXPEDITION_SCHEDULE_EARLY');
  if (expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound' && expedition.phase !== 'gathering') {
    fail('FOOD_EXPEDITION_PHASE_INVALID');
  }
  const occupation = ctx.db.foodNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('FOOD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound' && occupation.phase !== 'gathering') {
    fail('FOOD_OCCUPATION_PHASE_INVALID');
  }

  const accrual = planFoodExpeditionAccrual(expedition, expedition.gatheringEndsAtMicros);
  const credit = accrual.accruedFood - expedition.creditedFood;
  if (credit < 0n) fail('FOOD_EXPEDITION_CREDIT_INVALID');
  const resource = assertGenesisResourceForFid(ctx, expedition.fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('FOOD_EXPEDITION_OWNER_INTEGRITY');
  }
  assertFoodCapacityReservation(ctx, resource, expedition);
  // Advance normally to the current authoritative timestamp while preserving
  // the exact uncredited Food reserve. This handles delayed scheduler delivery
  // without cursor rewind and releases the reserve atomically with the award.
  const passiveSettlement = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    expedition.fid,
    resource.account,
    resource.terrainKind,
    now,
  );
  if (credit > RESOURCE_BALANCE_CAP - passiveSettlement.balances.food) {
    fail('FOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const revision = passiveSettlement.completedQuanta === 0n
    ? safeNextRevision(resource.account.revision)
    : passiveSettlement.revision;
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    ...passiveSettlement.balances,
    food: passiveSettlement.balances.food + credit,
    settledThroughMicros: passiveSettlement.settledThroughMicros,
    revision,
    policyVersion: passiveSettlement.policyVersion,
    updatedAt: ctx.timestamp,
  });
  ctx.db.foodExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'returning',
    settledThroughMicros: accrual.settledThroughMicros,
    accruedFood: accrual.accruedFood,
    creditedFood: accrual.accruedFood,
    updatedAt: ctx.timestamp,
  });
  // Keep the lease until the wagon reaches its castle. Public presentation and
  // server availability now describe the same round-trip lifecycle.
  ctx.db.foodNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'returning',
  });
}

function completeReturn(
  ctx: WarpkeepReducerContext,
  expedition: FoodExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.returnsAtMicros) {
    fail('FOOD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase !== 'returning') fail('FOOD_EXPEDITION_RETURN_STATE');
  const occupation = ctx.db.foodNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('FOOD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'returning') fail('FOOD_OCCUPATION_PHASE_INVALID');
  ctx.db.foodNodeOccupationV1.siteId.delete(occupation.siteId);
  ctx.db.foodExpeditionV1.expeditionId.delete(expedition.expeditionId);
}

export type FoodSiteSeedPlan = Readonly<{
  missing: readonly FoodSiteShape[];
}>;

/**
 * Fail-closed plan for the canonical 96-site Food catalog. Stored unknown,
 * duplicate, or edited rows block every insert before a seed mutates state.
 */
export function planGenesisTierIFoodSiteSeed(
  ctx: WarpkeepReducerContext,
  expectedSiteCount: bigint,
  policyVersion: string,
): FoodSiteSeedPlan {
  if (
    expectedSiteCount !== BigInt(GENESIS_TIER_I_FOOD_SITE_COUNT)
    || policyVersion !== FOOD_SITE_POLICY_VERSION
    || ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId) === null
  ) fail('FOOD_SITE_SEED_PRECONDITION');

  const seen = new Set<string>();
  for (const row of ctx.db.foodSiteV1.iter()) {
    if (seen.has(row.siteId)) fail('FOOD_SITE_SEED_CONFLICT');
    seen.add(row.siteId);
    assertCanonicalFoodSiteRow(row);
    assertFoodSiteWorldRows(ctx, row);
  }
  if (seen.size > GENESIS_TIER_I_FOOD_SITE_COUNT) fail('FOOD_SITE_SEED_CONFLICT');

  const missing: FoodSiteShape[] = [];
  for (const site of CANONICAL_TIER_I_FOOD_SITES_V1) {
    const existing = ctx.db.foodSiteV1.siteId.find(site.siteId);
    if (existing === null) {
      assertFoodSiteWorldRows(ctx, site);
      missing.push(site);
      continue;
    }
    assertCanonicalFoodSiteRow(existing);
    assertFoodSiteWorldRows(ctx, existing);
  }
  return Object.freeze({ missing: Object.freeze(missing) });
}

export function insertGenesisTierIFoodSite(
  ctx: WarpkeepReducerContext,
  site: FoodSiteShape,
): FoodSiteRow {
  if (ctx.db.foodSiteV1.siteId.find(site.siteId) !== null) fail('FOOD_SITE_SEED_CONFLICT');
  if (!matchesCanonicalTierIFoodSiteV1(site)) fail('FOOD_SITE_SEED_CONFLICT');
  assertFoodSiteWorldRows(ctx, site);
  return ctx.db.foodSiteV1.insert(site);
}

export type FoodExpeditionDispatch = Readonly<{
  expedition: FoodExpeditionRow;
  idempotent: boolean;
}>;

/**
 * Atomic caller-bound Food dispatch. The browser supplies only a canonical
 * site ID and bounded retry key; authority derives the founder, castle,
 * server time, route, capacity reservation, phase, and reward internally.
 */
export function dispatchGenesisFoodExpedition(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    siteId: string;
    idempotencyKey: string;
  }>,
): FoodExpeditionDispatch {
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  const requestKey = requestKeyFor(input.fid, input.idempotencyKey);
  const prior = ctx.db.foodExpeditionIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.siteId !== input.siteId) {
      fail('FOOD_EXPEDITION_IDEMPOTENCY_CONFLICT');
    }
    const expedition = ctx.db.foodExpeditionV1.expeditionId.find(prior.expeditionId);
    if (
      expedition === null
      || expedition.fid !== input.fid
      || expedition.siteId !== input.siteId
      || expedition.originCastleId !== resource.castle.castleId
    ) fail('FOOD_EXPEDITION_IDEMPOTENCY_STALE');
    assertExpeditionState(expedition);
    return Object.freeze({ expedition, idempotent: true });
  }

  const site = ctx.db.foodSiteV1.siteId.find(input.siteId);
  if (site === null || !site.active) fail('FOOD_SITE_UNAVAILABLE');
  assertCanonicalFoodSiteRow(site);
  assertFoodSiteWorldRows(ctx, site);
  if (ctx.db.foodNodeOccupationV1.siteId.find(site.siteId) !== null) {
    fail('FOOD_SITE_OCCUPIED');
  }
  for (const existing of ctx.db.foodExpeditionV1.siteId.filter(site.siteId)) {
    assertExpeditionState(existing);
    fail('FOOD_SITE_EXPEDITION_CONFLICT');
  }
  if (ctx.db.foodExpeditionV1.originCastleId.find(resource.castle.castleId) !== null) {
    fail('FOOD_WAGON_ALREADY_DEPLOYED');
  }
  const routeSteps = canonicalPassableRouteSteps(resource.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('FOOD_EXPEDITION_ROUTE_INVALID');
  const timeline = planFoodExpeditionTimeline(
    ctx.timestamp.microsSinceUnixEpoch,
    routeSteps,
  );
  const rawPassiveProjection = planRawResourceSettlement(
    resource.account,
    resource.terrainKind,
    timeline.gatheringEndsAtMicros,
  );
  assertFoodExpeditionCapacity(
    rawPassiveProjection.rawBalances.food,
    0n,
    RESOURCE_BALANCE_CAP,
  );
  const expedition = ctx.db.foodExpeditionV1.insert({
    expeditionId: ctx.newUuidV7().toString(),
    fid: input.fid,
    originCastleId: resource.castle.castleId,
    siteId: site.siteId,
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedFood: 0n,
    creditedFood: 0n,
    policyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  assertExpeditionState(expedition);
  ctx.db.foodNodeOccupationV1.insert({
    siteId: site.siteId,
    originCastleId: resource.castle.castleId,
    phase: currentOccupationPhaseFor(expedition),
    startedAtMicros: expedition.startedAtMicros,
    arrivesAtMicros: expedition.arrivesAtMicros,
    gatheringEndsAtMicros: expedition.gatheringEndsAtMicros,
    returnsAtMicros: expedition.returnsAtMicros,
  });
  ctx.db.foodExpeditionIdempotencyV1.insert({
    requestKey,
    fid: input.fid,
    siteId: site.siteId,
    expeditionId: expedition.expeditionId,
    createdAt: ctx.timestamp,
  });
  insertSchedule(ctx, expedition, SCHEDULE_STAGE_ARRIVAL, expedition.arrivesAtMicros);
  insertSchedule(
    ctx,
    expedition,
    SCHEDULE_STAGE_GATHERING_EXPIRY,
    expedition.gatheringEndsAtMicros,
  );
  insertSchedule(ctx, expedition, SCHEDULE_STAGE_RETURN_COMPLETE, expedition.returnsAtMicros);
  return Object.freeze({ expedition, idempotent: false });
}

/**
 * Claim completed whole Food minutes from the caller's active Wheat Farm
 * wagon. The capacity reservation is revalidated before every write; no
 * browser timing or per-minute mutation exists.
 */
export function collectActiveFoodExpedition(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  const expedition = ctx.db.foodExpeditionV1.fid.find(fid);
  if (expedition === null) return;
  assertExpeditionState(expedition);
  if (expedition.fid !== fid) fail('FOOD_EXPEDITION_OWNER_INTEGRITY');
  const resource = assertGenesisResourceForFid(ctx, fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('FOOD_EXPEDITION_OWNER_INTEGRITY');
  }
  assertFoodCapacityReservation(ctx, resource, expedition);
  const accrual = planFoodExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const credit = accrual.accruedFood - expedition.creditedFood;
  if (credit < 0n) fail('FOOD_EXPEDITION_CREDIT_INVALID');
  if (credit === 0n) return;
  if (credit > RESOURCE_BALANCE_CAP - resource.account.food) {
    fail('FOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    food: resource.account.food + credit,
    revision: safeNextRevision(resource.account.revision),
    updatedAt: ctx.timestamp,
  });
  ctx.db.foodExpeditionV1.expeditionId.update({
    ...expedition,
    settledThroughMicros: accrual.settledThroughMicros,
    accruedFood: accrual.accruedFood,
    creditedFood: accrual.accruedFood,
    updatedAt: ctx.timestamp,
  });
}

/** Internal-only target of one-shot Food lifecycle schedule rows. */
export function runFoodExpeditionSchedule(
  ctx: WarpkeepReducerContext,
  schedule: FoodScheduleRow,
): void {
  const expedition = ctx.db.foodExpeditionV1.originCastleId.find(schedule.originCastleId);
  if (expedition === null) return;
  if (!scheduleMatchesExpedition(schedule, expedition)) return;
  assertExpeditionState(expedition);
  if (schedule.stage === SCHEDULE_STAGE_ARRIVAL) {
    transitionArrival(ctx, expedition);
    return;
  }
  if (schedule.stage === SCHEDULE_STAGE_GATHERING_EXPIRY) {
    creditExpiredFood(ctx, expedition);
    return;
  }
  // A late return delivery settles the immutable gathering endpoint first,
  // then removes this wagon. Stale delivery cannot affect a later expedition
  // because the full site/origin/timeline tuple is validated above.
  if (expedition.phase === 'outbound' || expedition.phase === 'gathering') {
    creditExpiredFood(ctx, expedition);
    const returning = ctx.db.foodExpeditionV1.expeditionId.find(expedition.expeditionId);
    if (returning === null) fail('FOOD_EXPEDITION_RETURN_STATE');
    assertExpeditionState(returning);
    completeReturn(ctx, returning);
    return;
  }
  completeReturn(ctx, expedition);
}

export function myFoodExpeditionState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): Readonly<{
  expedition: FoodExpeditionRow | undefined;
  accruedFood: bigint;
  pendingFood: bigint;
}> {
  const expedition = ctx.db.foodExpeditionV1.fid.find(fid);
  if (expedition === null) {
    return Object.freeze({ expedition: undefined, accruedFood: 0n, pendingFood: 0n });
  }
  assertExpeditionState(expedition);
  const accrual = planFoodExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const pendingFood = accrual.accruedFood - expedition.creditedFood;
  if (pendingFood < 0n) fail('FOOD_EXPEDITION_CREDIT_INVALID');
  return Object.freeze({ expedition, accruedFood: accrual.accruedFood, pendingFood });
}

export function foodExpeditionErrorCode(error: unknown): string | undefined {
  if (
    error instanceof FoodExpeditionAuthorityError
    || error instanceof FoodExpeditionPolicyError
    || error instanceof ResourceExpeditionReservationAuthorityError
    || error instanceof ResourceAuthorityPolicyError
  ) return error.code;
  return undefined;
}
