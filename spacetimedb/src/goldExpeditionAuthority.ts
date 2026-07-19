import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import {
  GOLD_EXPEDITION_POLICY_VERSION,
  GOLD_EXPEDITION_U64_MAX,
  GoldExpeditionPolicyError,
  assertGoldExpeditionCapacity,
  assertGoldExpeditionIdempotencyKey,
  goldExpeditionStateIsConsistent,
  planGoldExpeditionAccrual,
  planGoldExpeditionTimeline,
} from './goldExpeditionPolicy';
import {
  CANONICAL_TIER_I_GOLD_SITES_V1,
  GENESIS_TIER_I_GOLD_SITE_COUNT,
  GOLD_SITE_POLICY_VERSION,
  canonicalGoldSiteV1ForId,
  canonicalPassableRouteSteps,
  matchesCanonicalTierIGoldSiteV1,
} from './goldSitePolicy';
import {
  RESOURCE_BALANCE_CAP,
  ResourceAuthorityPolicyError,
} from './resourceAuthorityPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
import {
  ResourceExpeditionReservationAuthorityError,
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
type GoldSiteRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['goldSiteV1']['siteId']['find']>
>;
type GoldOccupationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['goldNodeOccupationV1']['siteId']['find']>
>;
type GoldExpeditionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['goldExpeditionV1']['expeditionId']['find']>
>;
type GoldScheduleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['goldExpeditionScheduleV1']['scheduleId']['find']>
>;
type CastleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>
>;
type ResourceAccountRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['resourceAccountV1']['fid']['find']>
>;

const SCHEDULE_STAGE_ARRIVAL = 'arrival';
const SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
const SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';

export class GoldExpeditionAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GoldExpeditionAuthorityError';
  }
}

function fail(code: string): never {
  throw new GoldExpeditionAuthorityError(code);
}

function timestampMicros(value: { microsSinceUnixEpoch: bigint }): bigint {
  return value.microsSinceUnixEpoch;
}

function safeNextRevision(current: bigint): bigint {
  if (current < 0n || current >= GOLD_EXPEDITION_U64_MAX) {
    fail('GOLD_EXPEDITION_RESOURCE_REVISION');
  }
  return current + 1n;
}

function assertCanonicalGoldSiteRow(row: GoldSiteRow): void {
  if (!matchesCanonicalTierIGoldSiteV1(row)) fail('GOLD_SITE_INTEGRITY');
  const tile = canonicalTileForKey(`${row.q},${row.r}`);
  const meta = canonicalMetaForKey(`${row.q},${row.r}`);
  if (
    tile === undefined
    || meta === undefined
    || !meta.passable
    || meta.staticContentKind !== 'resource-capable'
  ) fail('GOLD_SITE_INTEGRITY');
}

type GoldSiteShape = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

function assertGoldSiteWorldRows(
  ctx: WarpkeepReducerContext,
  site: GoldSiteShape,
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
  ) fail('GOLD_SITE_WORLD_INTEGRITY');
}

function requestKeyFor(fid: bigint, idempotencyKey: string): string {
  assertGoldExpeditionIdempotencyKey(idempotencyKey);
  return `${fid}:${idempotencyKey}`;
}

function occupationMatchesExpedition(
  occupation: GoldOccupationRow,
  expedition: GoldExpeditionRow,
): boolean {
  return occupation.siteId === expedition.siteId
    && occupation.originCastleId === expedition.originCastleId
    && occupation.startedAtMicros === expedition.startedAtMicros
    && occupation.arrivesAtMicros === expedition.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === expedition.gatheringEndsAtMicros
    && occupation.returnsAtMicros === expedition.returnsAtMicros;
}

function assertOccupationMatchesExpedition(
  occupation: GoldOccupationRow,
  expedition: GoldExpeditionRow,
): void {
  if (!occupationMatchesExpedition(occupation, expedition)) {
    fail('GOLD_OCCUPATION_INTEGRITY');
  }
}

function currentOccupationPhaseFor(expedition: GoldExpeditionRow): 'outbound' | 'gathering' {
  if (expedition.phase === 'outbound') return 'outbound';
  if (expedition.phase === 'gathering') return 'gathering';
  fail('GOLD_OCCUPATION_PHASE_INVALID');
}

function assertExpeditionState(expedition: GoldExpeditionRow): void {
  if (!goldExpeditionStateIsConsistent(expedition)) fail('GOLD_EXPEDITION_STATE_INVALID');
}

function insertSchedule(
  ctx: WarpkeepReducerContext,
  expedition: GoldExpeditionRow,
  stage: string,
  atMicros: bigint,
): void {
  ctx.db.goldExpeditionScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    originCastleId: expedition.originCastleId,
    siteId: expedition.siteId,
    stage,
  });
}

function expectedScheduleTimeMicros(
  expedition: GoldExpeditionRow,
  stage: string,
): bigint | undefined {
  if (stage === SCHEDULE_STAGE_ARRIVAL) return expedition.arrivesAtMicros;
  if (stage === SCHEDULE_STAGE_GATHERING_EXPIRY) return expedition.gatheringEndsAtMicros;
  if (stage === SCHEDULE_STAGE_RETURN_COMPLETE) return expedition.returnsAtMicros;
  return undefined;
}

function scheduleMatchesExpedition(
  schedule: GoldScheduleRow,
  expedition: GoldExpeditionRow,
): boolean {
  const expectedAtMicros = expectedScheduleTimeMicros(expedition, schedule.stage);
  return expectedAtMicros !== undefined
    && schedule.originCastleId === expedition.originCastleId
    && schedule.siteId === expedition.siteId
    && schedule.scheduledAt.tag === 'Time'
    && schedule.scheduledAt.value.microsSinceUnixEpoch === expectedAtMicros;
}

function transitionArrival(
  ctx: WarpkeepReducerContext,
  expedition: GoldExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.arrivesAtMicros) {
    fail('GOLD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase === 'gathering' || expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound') fail('GOLD_EXPEDITION_PHASE_INVALID');
  const occupation = ctx.db.goldNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('GOLD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound') fail('GOLD_OCCUPATION_PHASE_INVALID');
  ctx.db.goldExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'gathering',
    updatedAt: ctx.timestamp,
  });
  ctx.db.goldNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'gathering',
  });
}

function creditExpiredGold(
  ctx: WarpkeepReducerContext,
  expedition: GoldExpeditionRow,
): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now < expedition.gatheringEndsAtMicros) fail('GOLD_EXPEDITION_SCHEDULE_EARLY');
  if (expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound' && expedition.phase !== 'gathering') {
    fail('GOLD_EXPEDITION_PHASE_INVALID');
  }
  const occupation = ctx.db.goldNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('GOLD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound' && occupation.phase !== 'gathering') {
    fail('GOLD_OCCUPATION_PHASE_INVALID');
  }

  const accrual = planGoldExpeditionAccrual(expedition, expedition.gatheringEndsAtMicros);
  const credit = accrual.accruedGold - expedition.creditedGold;
  if (credit < 0n) fail('GOLD_EXPEDITION_CREDIT_INVALID');
  const resource = assertGenesisResourceForFid(ctx, expedition.fid);
  // A founder may run Gold, Food, and Wood wagons simultaneously. Gold expiry
  // therefore settles passive terrain through the shared Food/Wood reservation
  // caps used by the resource HUD/collector, never consuming either an
  // uncredited Wheat Farm or Logging Camp award when this schedule arrives first.
  const passiveSettlement = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    expedition.fid,
    resource.account,
    resource.terrainKind,
    now,
  );
  if (credit > RESOURCE_BALANCE_CAP - passiveSettlement.balances.gold) {
    // Dispatch preflights the entire thirty-day award. A later failure means
    // another authority path violated the account contract; do not truncate.
    fail('GOLD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const revision = passiveSettlement.completedQuanta === 0n
    ? safeNextRevision(resource.account.revision)
    : passiveSettlement.revision;
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    ...passiveSettlement.balances,
    gold: passiveSettlement.balances.gold + credit,
    settledThroughMicros: passiveSettlement.settledThroughMicros,
    revision,
    policyVersion: passiveSettlement.policyVersion,
    updatedAt: ctx.timestamp,
  });
  ctx.db.goldExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'returning',
    settledThroughMicros: accrual.settledThroughMicros,
    accruedGold: accrual.accruedGold,
    creditedGold: accrual.accruedGold,
    updatedAt: ctx.timestamp,
  });
  // Keep the public lease for the complete round trip. This makes the return
  // wagon observable and prevents the site from appearing available while the
  // server still holds the founder's one active Gold wagon.
  ctx.db.goldNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'returning',
  });
}

function completeReturn(
  ctx: WarpkeepReducerContext,
  expedition: GoldExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.returnsAtMicros) {
    fail('GOLD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase !== 'returning') fail('GOLD_EXPEDITION_RETURN_STATE');
  const occupation = ctx.db.goldNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('GOLD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'returning') fail('GOLD_OCCUPATION_PHASE_INVALID');
  ctx.db.goldNodeOccupationV1.siteId.delete(occupation.siteId);
  ctx.db.goldExpeditionV1.expeditionId.delete(expedition.expeditionId);
}

export type GoldSiteSeedPlan = Readonly<{
  missing: readonly GoldSiteShape[];
}>;

/**
 * Fail-closed plan for the canonical pilot catalog. Unknown, duplicate, or
 * changed rows block the entire seed before any insert is attempted.
 */
export function planGenesisTierIGoldSiteSeed(
  ctx: WarpkeepReducerContext,
  expectedSiteCount: bigint,
  policyVersion: string,
): GoldSiteSeedPlan {
  if (
    expectedSiteCount !== BigInt(GENESIS_TIER_I_GOLD_SITE_COUNT)
    || policyVersion !== GOLD_SITE_POLICY_VERSION
    || ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId) === null
  ) fail('GOLD_SITE_SEED_PRECONDITION');

  const seen = new Set<string>();
  for (const row of ctx.db.goldSiteV1.iter()) {
    if (seen.has(row.siteId)) fail('GOLD_SITE_SEED_CONFLICT');
    seen.add(row.siteId);
    assertCanonicalGoldSiteRow(row);
    assertGoldSiteWorldRows(ctx, row);
  }
  if (seen.size > GENESIS_TIER_I_GOLD_SITE_COUNT) fail('GOLD_SITE_SEED_CONFLICT');

  const missing: GoldSiteShape[] = [];
  for (const site of CANONICAL_TIER_I_GOLD_SITES_V1) {
    const existing = ctx.db.goldSiteV1.siteId.find(site.siteId);
    if (existing === null) {
      assertGoldSiteWorldRows(ctx, site);
      missing.push(site);
      continue;
    }
    assertCanonicalGoldSiteRow(existing);
    assertGoldSiteWorldRows(ctx, existing);
  }
  return Object.freeze({ missing: Object.freeze(missing) });
}

export function insertGenesisTierIGoldSite(
  ctx: WarpkeepReducerContext,
  site: GoldSiteShape,
): GoldSiteRow {
  if (ctx.db.goldSiteV1.siteId.find(site.siteId) !== null) fail('GOLD_SITE_SEED_CONFLICT');
  if (!matchesCanonicalTierIGoldSiteV1(site)) fail('GOLD_SITE_SEED_CONFLICT');
  assertGoldSiteWorldRows(ctx, site);
  return ctx.db.goldSiteV1.insert(site);
}

export type GoldExpeditionDispatch = Readonly<{
  expedition: GoldExpeditionRow;
  idempotent: boolean;
}>;

/**
 * Atomic caller-bound dispatch. The input contains only a canonical site ID
 * and a bounded idempotency key; route, timestamps, ownership, rate, and
 * occupancy are derived from private/server state in this transaction.
 */
export function dispatchGenesisGoldExpedition(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    account: ResourceAccountRow;
    castle: CastleRow;
    siteId: string;
    idempotencyKey: string;
  }>,
): GoldExpeditionDispatch {
  const requestKey = requestKeyFor(input.fid, input.idempotencyKey);
  const prior = ctx.db.goldExpeditionIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.siteId !== input.siteId) {
      fail('GOLD_EXPEDITION_IDEMPOTENCY_CONFLICT');
    }
    const expedition = ctx.db.goldExpeditionV1.expeditionId.find(prior.expeditionId);
    if (
      expedition === null
      || expedition.fid !== input.fid
      || expedition.siteId !== input.siteId
      || expedition.originCastleId !== input.castle.castleId
    ) fail('GOLD_EXPEDITION_IDEMPOTENCY_STALE');
    assertExpeditionState(expedition);
    return Object.freeze({ expedition, idempotent: true });
  }

  const site = ctx.db.goldSiteV1.siteId.find(input.siteId);
  if (site === null || !site.active) fail('GOLD_SITE_UNAVAILABLE');
  assertCanonicalGoldSiteRow(site);
  assertGoldSiteWorldRows(ctx, site);
  if (ctx.db.goldNodeOccupationV1.siteId.find(site.siteId) !== null) {
    fail('GOLD_SITE_OCCUPIED');
  }
  for (const existing of ctx.db.goldExpeditionV1.siteId.filter(site.siteId)) {
    assertExpeditionState(existing);
    fail('GOLD_SITE_EXPEDITION_CONFLICT');
  }
  if (ctx.db.goldExpeditionV1.originCastleId.find(input.castle.castleId) !== null) {
    fail('GOLD_WAGON_ALREADY_DEPLOYED');
  }
  assertGoldExpeditionCapacity(input.account.gold, RESOURCE_BALANCE_CAP);
  const routeSteps = canonicalPassableRouteSteps(input.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('GOLD_EXPEDITION_ROUTE_INVALID');
  const timeline = planGoldExpeditionTimeline(
    ctx.timestamp.microsSinceUnixEpoch,
    routeSteps,
  );
  const expedition = ctx.db.goldExpeditionV1.insert({
    expeditionId: ctx.newUuidV7().toString(),
    fid: input.fid,
    originCastleId: input.castle.castleId,
    siteId: site.siteId,
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedGold: 0n,
    creditedGold: 0n,
    policyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  assertExpeditionState(expedition);
  ctx.db.goldNodeOccupationV1.insert({
    siteId: site.siteId,
    originCastleId: input.castle.castleId,
    phase: currentOccupationPhaseFor(expedition),
    startedAtMicros: expedition.startedAtMicros,
    arrivesAtMicros: expedition.arrivesAtMicros,
    gatheringEndsAtMicros: expedition.gatheringEndsAtMicros,
    returnsAtMicros: expedition.returnsAtMicros,
  });
  ctx.db.goldExpeditionIdempotencyV1.insert({
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
 * Claim only completed whole minutes from the caller's active wagon. This
 * deliberately writes on a player collection action, never every minute. The
 * expiry schedule uses the same cursor and therefore credits only the exact
 * unclaimed remainder.
 */
export function collectActiveGoldExpedition(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  const expedition = ctx.db.goldExpeditionV1.fid.find(fid);
  if (expedition === null) return;
  assertExpeditionState(expedition);
  if (expedition.fid !== fid) fail('GOLD_EXPEDITION_OWNER_INTEGRITY');
  const resource = assertGenesisResourceForFid(ctx, fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('GOLD_EXPEDITION_OWNER_INTEGRITY');
  }
  const accrual = planGoldExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const credit = accrual.accruedGold - expedition.creditedGold;
  if (credit < 0n) fail('GOLD_EXPEDITION_CREDIT_INVALID');
  if (credit === 0n) return;
  if (credit > RESOURCE_BALANCE_CAP - resource.account.gold) {
    fail('GOLD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    gold: resource.account.gold + credit,
    revision: safeNextRevision(resource.account.revision),
    updatedAt: ctx.timestamp,
  });
  ctx.db.goldExpeditionV1.expeditionId.update({
    ...expedition,
    settledThroughMicros: accrual.settledThroughMicros,
    accruedGold: accrual.accruedGold,
    creditedGold: accrual.accruedGold,
    updatedAt: ctx.timestamp,
  });
}

/** Internal-only target of one-shot schedule rows. */
export function runGoldExpeditionSchedule(
  ctx: WarpkeepReducerContext,
  schedule: GoldScheduleRow,
): void {
  const expedition = ctx.db.goldExpeditionV1.originCastleId.find(schedule.originCastleId);
  // A completed return may delete its expedition before a stale duplicated
  // schedule is replayed. A later expedition from the same castle will fail
  // the site/timeline match below and is likewise never touched.
  if (expedition === null) return;
  if (!scheduleMatchesExpedition(schedule, expedition)) return;
  assertExpeditionState(expedition);
  if (schedule.stage === SCHEDULE_STAGE_ARRIVAL) {
    transitionArrival(ctx, expedition);
    return;
  }
  if (schedule.stage === SCHEDULE_STAGE_GATHERING_EXPIRY) {
    creditExpiredGold(ctx, expedition);
    return;
  }
  // Schedules are one-shot, but their reducer deliveries must not assume
  // ordering. If a return delivery observes a still-active expedition (for
  // example after a delayed expiry delivery), settle the fixed gathering end
  // first and then complete the return in this one transaction. Later stale
  // deliveries find no expedition and become harmless no-ops.
  if (expedition.phase === 'outbound' || expedition.phase === 'gathering') {
    creditExpiredGold(ctx, expedition);
    const returning = ctx.db.goldExpeditionV1.expeditionId.find(expedition.expeditionId);
    if (returning === null) fail('GOLD_EXPEDITION_RETURN_STATE');
    assertExpeditionState(returning);
    completeReturn(ctx, returning);
    return;
  }
  completeReturn(ctx, expedition);
}

export function myGoldExpeditionState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): Readonly<{
  expedition: GoldExpeditionRow | undefined;
  accruedGold: bigint;
  pendingGold: bigint;
}> {
  const expedition = ctx.db.goldExpeditionV1.fid.find(fid);
  if (expedition === null) {
    return Object.freeze({ expedition: undefined, accruedGold: 0n, pendingGold: 0n });
  }
  assertExpeditionState(expedition);
  const accrual = planGoldExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const pendingGold = accrual.accruedGold - expedition.creditedGold;
  if (pendingGold < 0n) fail('GOLD_EXPEDITION_CREDIT_INVALID');
  return Object.freeze({ expedition, accruedGold: accrual.accruedGold, pendingGold });
}

export function goldExpeditionErrorCode(error: unknown): string | undefined {
  if (
    error instanceof GoldExpeditionAuthorityError
    || error instanceof GoldExpeditionPolicyError
    || error instanceof ResourceExpeditionReservationAuthorityError
    || error instanceof ResourceAuthorityPolicyError
  ) return error.code;
  return undefined;
}
