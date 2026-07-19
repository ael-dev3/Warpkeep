import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import {
  STONE_EXPEDITION_POLICY_VERSION,
  STONE_EXPEDITION_U64_MAX,
  STONE_GATHERING_TOTAL_STONE,
  StoneExpeditionPolicyError,
  assertStoneExpeditionCapacity,
  assertStoneExpeditionIdempotencyKey,
  stoneExpeditionStateIsConsistent,
  planStoneExpeditionAccrual,
  planStoneExpeditionTimeline,
} from './stoneExpeditionPolicy';
import {
  CANONICAL_TIER_I_STONE_SITES_V1,
  STONE_SITE_POLICY_VERSION,
  GENESIS_TIER_I_STONE_SITE_COUNT,
  canonicalStoneSiteV1ForId,
  matchesCanonicalTierIStoneSiteV1,
} from './stoneSitePolicy';
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
type StoneSiteRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['stoneSiteV1']['siteId']['find']>
>;
type StoneOccupationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['stoneNodeOccupationV1']['siteId']['find']>
>;
type StoneExpeditionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['stoneExpeditionV1']['expeditionId']['find']>
>;
type StoneScheduleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['stoneExpeditionScheduleV1']['scheduleId']['find']>
>;

const SCHEDULE_STAGE_ARRIVAL = 'arrival';
const SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
const SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';

export class StoneExpeditionAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StoneExpeditionAuthorityError';
  }
}

function fail(code: string): never {
  throw new StoneExpeditionAuthorityError(code);
}

function safeNextRevision(current: bigint): bigint {
  if (current < 0n || current >= STONE_EXPEDITION_U64_MAX) {
    fail('STONE_EXPEDITION_RESOURCE_REVISION');
  }
  return current + 1n;
}

function isStoneTerrain(kind: string): boolean {
  return kind === 'heath';
}

function assertCanonicalStoneSiteRow(row: StoneSiteRow): void {
  if (!matchesCanonicalTierIStoneSiteV1(row)) fail('STONE_SITE_INTEGRITY');
  const tile = canonicalTileForKey(`${row.q},${row.r}`);
  const meta = canonicalMetaForKey(`${row.q},${row.r}`);
  if (
    tile === undefined
    || meta === undefined
    || !meta.passable
    || meta.staticContentKind !== 'resource-capable'
    || !isStoneTerrain(meta.terrainKind)
  ) fail('STONE_SITE_INTEGRITY');
}

type StoneSiteShape = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

function assertStoneSiteWorldRows(
  ctx: WarpkeepReducerContext,
  site: StoneSiteShape,
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
    || !isStoneTerrain(storedMeta.terrainKind)
  ) fail('STONE_SITE_WORLD_INTEGRITY');
}

function requestKeyFor(fid: bigint, idempotencyKey: string): string {
  assertStoneExpeditionIdempotencyKey(idempotencyKey);
  return `${fid}:${idempotencyKey}`;
}

function occupationMatchesExpedition(
  occupation: StoneOccupationRow,
  expedition: StoneExpeditionRow,
): boolean {
  return occupation.siteId === expedition.siteId
    && occupation.originCastleId === expedition.originCastleId
    && occupation.startedAtMicros === expedition.startedAtMicros
    && occupation.arrivesAtMicros === expedition.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === expedition.gatheringEndsAtMicros
    && occupation.returnsAtMicros === expedition.returnsAtMicros;
}

function assertOccupationMatchesExpedition(
  occupation: StoneOccupationRow,
  expedition: StoneExpeditionRow,
): void {
  if (!occupationMatchesExpedition(occupation, expedition)) {
    fail('STONE_OCCUPATION_INTEGRITY');
  }
}

function currentOccupationPhaseFor(expedition: StoneExpeditionRow): 'outbound' | 'gathering' {
  if (expedition.phase === 'outbound') return 'outbound';
  if (expedition.phase === 'gathering') return 'gathering';
  fail('STONE_OCCUPATION_PHASE_INVALID');
}

function assertExpeditionState(expedition: StoneExpeditionRow): void {
  if (!stoneExpeditionStateIsConsistent(expedition)) fail('STONE_EXPEDITION_STATE_INVALID');
}

function insertSchedule(
  ctx: WarpkeepReducerContext,
  expedition: StoneExpeditionRow,
  stage: string,
  atMicros: bigint,
): void {
  ctx.db.stoneExpeditionScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    originCastleId: expedition.originCastleId,
    siteId: expedition.siteId,
    stage,
  });
}

function expectedScheduleTimeMicros(
  expedition: StoneExpeditionRow,
  stage: string,
): bigint | undefined {
  if (stage === SCHEDULE_STAGE_ARRIVAL) return expedition.arrivesAtMicros;
  if (stage === SCHEDULE_STAGE_GATHERING_EXPIRY) return expedition.gatheringEndsAtMicros;
  if (stage === SCHEDULE_STAGE_RETURN_COMPLETE) return expedition.returnsAtMicros;
  return undefined;
}

function scheduleMatchesExpedition(
  schedule: StoneScheduleRow,
  expedition: StoneExpeditionRow,
): boolean {
  const expectedAtMicros = expectedScheduleTimeMicros(expedition, schedule.stage);
  return expectedAtMicros !== undefined
    && schedule.originCastleId === expedition.originCastleId
    && schedule.siteId === expedition.siteId
    && schedule.scheduledAt.tag === 'Time'
    && schedule.scheduledAt.value.microsSinceUnixEpoch === expectedAtMicros;
}

/**
 * Check the private remaining-award reservation before a direct Stone credit.
 * Passive Stone is capped by the shared resource-policy adapter on every read
 * and settlement path; this check confirms the active row and account still
 * leave room for its exact uncredited award.
 */
function assertStoneCapacityReservation(
  ctx: WarpkeepReducerContext,
  resource: ReturnType<typeof assertGenesisResourceForFid>,
  expedition: Pick<StoneExpeditionRow, 'creditedStone'>,
): void {
  const reservedStone = activeExpeditionResourceReservations(ctx, resource.account.fid).stone;
  if (reservedStone !== STONE_GATHERING_TOTAL_STONE - expedition.creditedStone) {
    fail('STONE_EXPEDITION_RESERVATION_INTEGRITY');
  }
  assertStoneExpeditionCapacity(
    resource.account.stone,
    expedition.creditedStone,
    RESOURCE_BALANCE_CAP,
  );
}

function transitionArrival(
  ctx: WarpkeepReducerContext,
  expedition: StoneExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.arrivesAtMicros) {
    fail('STONE_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase === 'gathering' || expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound') fail('STONE_EXPEDITION_PHASE_INVALID');
  const occupation = ctx.db.stoneNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('STONE_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound') fail('STONE_OCCUPATION_PHASE_INVALID');
  ctx.db.stoneExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'gathering',
    updatedAt: ctx.timestamp,
  });
  ctx.db.stoneNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'gathering',
  });
}

function creditExpiredStone(
  ctx: WarpkeepReducerContext,
  expedition: StoneExpeditionRow,
): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now < expedition.gatheringEndsAtMicros) fail('STONE_EXPEDITION_SCHEDULE_EARLY');
  if (expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound' && expedition.phase !== 'gathering') {
    fail('STONE_EXPEDITION_PHASE_INVALID');
  }
  const occupation = ctx.db.stoneNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('STONE_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound' && occupation.phase !== 'gathering') {
    fail('STONE_OCCUPATION_PHASE_INVALID');
  }

  const accrual = planStoneExpeditionAccrual(expedition, expedition.gatheringEndsAtMicros);
  const credit = accrual.accruedStone - expedition.creditedStone;
  if (credit < 0n) fail('STONE_EXPEDITION_CREDIT_INVALID');
  const resource = assertGenesisResourceForFid(ctx, expedition.fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('STONE_EXPEDITION_OWNER_INTEGRITY');
  }
  assertStoneCapacityReservation(ctx, resource, expedition);
  // Advance normally to the current authoritative timestamp while preserving
  // the exact uncredited Stone reserve. This handles delayed scheduler delivery
  // without cursor rewind and releases the reserve atomically with the award.
  const passiveSettlement = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    expedition.fid,
    resource.account,
    resource.terrainKind,
    now,
  );
  if (credit > RESOURCE_BALANCE_CAP - passiveSettlement.balances.stone) {
    fail('STONE_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const revision = passiveSettlement.completedQuanta === 0n
    ? safeNextRevision(resource.account.revision)
    : passiveSettlement.revision;
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    ...passiveSettlement.balances,
    stone: passiveSettlement.balances.stone + credit,
    settledThroughMicros: passiveSettlement.settledThroughMicros,
    revision,
    policyVersion: passiveSettlement.policyVersion,
    updatedAt: ctx.timestamp,
  });
  ctx.db.stoneExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'returning',
    settledThroughMicros: accrual.settledThroughMicros,
    accruedStone: accrual.accruedStone,
    creditedStone: accrual.accruedStone,
    updatedAt: ctx.timestamp,
  });
  // Keep the lease until the wagon reaches its castle. Public presentation and
  // server availability now describe the same round-trip lifecycle.
  ctx.db.stoneNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'returning',
  });
}

function completeReturn(
  ctx: WarpkeepReducerContext,
  expedition: StoneExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.returnsAtMicros) {
    fail('STONE_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase !== 'returning') fail('STONE_EXPEDITION_RETURN_STATE');
  const occupation = ctx.db.stoneNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('STONE_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'returning') fail('STONE_OCCUPATION_PHASE_INVALID');
  ctx.db.stoneNodeOccupationV1.siteId.delete(occupation.siteId);
  ctx.db.stoneExpeditionV1.expeditionId.delete(expedition.expeditionId);
}

export type StoneSiteSeedPlan = Readonly<{
  missing: readonly StoneSiteShape[];
}>;

/**
 * Fail-closed plan for the canonical 96-site Stone catalog. Stored unknown,
 * duplicate, or edited rows block every insert before a seed mutates state.
 */
export function planGenesisTierIStoneSiteSeed(
  ctx: WarpkeepReducerContext,
  expectedSiteCount: bigint,
  policyVersion: string,
): StoneSiteSeedPlan {
  if (
    expectedSiteCount !== BigInt(GENESIS_TIER_I_STONE_SITE_COUNT)
    || policyVersion !== STONE_SITE_POLICY_VERSION
    || ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId) === null
  ) fail('STONE_SITE_SEED_PRECONDITION');

  const seen = new Set<string>();
  for (const row of ctx.db.stoneSiteV1.iter()) {
    if (seen.has(row.siteId)) fail('STONE_SITE_SEED_CONFLICT');
    seen.add(row.siteId);
    assertCanonicalStoneSiteRow(row);
    assertStoneSiteWorldRows(ctx, row);
  }
  if (seen.size > GENESIS_TIER_I_STONE_SITE_COUNT) fail('STONE_SITE_SEED_CONFLICT');

  const missing: StoneSiteShape[] = [];
  for (const site of CANONICAL_TIER_I_STONE_SITES_V1) {
    const existing = ctx.db.stoneSiteV1.siteId.find(site.siteId);
    if (existing === null) {
      assertStoneSiteWorldRows(ctx, site);
      missing.push(site);
      continue;
    }
    assertCanonicalStoneSiteRow(existing);
    assertStoneSiteWorldRows(ctx, existing);
  }
  return Object.freeze({ missing: Object.freeze(missing) });
}

export function insertGenesisTierIStoneSite(
  ctx: WarpkeepReducerContext,
  site: StoneSiteShape,
): StoneSiteRow {
  if (ctx.db.stoneSiteV1.siteId.find(site.siteId) !== null) fail('STONE_SITE_SEED_CONFLICT');
  if (!matchesCanonicalTierIStoneSiteV1(site)) fail('STONE_SITE_SEED_CONFLICT');
  assertStoneSiteWorldRows(ctx, site);
  return ctx.db.stoneSiteV1.insert(site);
}

export type StoneExpeditionDispatch = Readonly<{
  expedition: StoneExpeditionRow;
  idempotent: boolean;
}>;

/**
 * Atomic caller-bound Stone dispatch. The browser supplies only a canonical
 * site ID and bounded retry key; authority derives the founder, castle,
 * server time, route, capacity reservation, phase, and reward internally.
 */
export function dispatchGenesisStoneExpedition(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    siteId: string;
    idempotencyKey: string;
  }>,
): StoneExpeditionDispatch {
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  const requestKey = requestKeyFor(input.fid, input.idempotencyKey);
  const prior = ctx.db.stoneExpeditionIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.siteId !== input.siteId) {
      fail('STONE_EXPEDITION_IDEMPOTENCY_CONFLICT');
    }
    const expedition = ctx.db.stoneExpeditionV1.expeditionId.find(prior.expeditionId);
    if (
      expedition === null
      || expedition.fid !== input.fid
      || expedition.siteId !== input.siteId
      || expedition.originCastleId !== resource.castle.castleId
    ) fail('STONE_EXPEDITION_IDEMPOTENCY_STALE');
    assertExpeditionState(expedition);
    return Object.freeze({ expedition, idempotent: true });
  }

  const site = ctx.db.stoneSiteV1.siteId.find(input.siteId);
  if (site === null || !site.active) fail('STONE_SITE_UNAVAILABLE');
  assertCanonicalStoneSiteRow(site);
  assertStoneSiteWorldRows(ctx, site);
  if (ctx.db.stoneNodeOccupationV1.siteId.find(site.siteId) !== null) {
    fail('STONE_SITE_OCCUPIED');
  }
  for (const existing of ctx.db.stoneExpeditionV1.siteId.filter(site.siteId)) {
    assertExpeditionState(existing);
    fail('STONE_SITE_EXPEDITION_CONFLICT');
  }
  if (ctx.db.stoneExpeditionV1.originCastleId.find(resource.castle.castleId) !== null) {
    fail('STONE_WAGON_ALREADY_DEPLOYED');
  }
  const routeSteps = canonicalPassableRouteSteps(resource.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('STONE_EXPEDITION_ROUTE_INVALID');
  const timeline = planStoneExpeditionTimeline(
    ctx.timestamp.microsSinceUnixEpoch,
    routeSteps,
  );
  const rawPassiveProjection = planRawResourceSettlement(
    resource.account,
    resource.terrainKind,
    timeline.gatheringEndsAtMicros,
  );
  assertStoneExpeditionCapacity(
    rawPassiveProjection.rawBalances.stone,
    0n,
    RESOURCE_BALANCE_CAP,
  );
  const expedition = ctx.db.stoneExpeditionV1.insert({
    expeditionId: ctx.newUuidV7().toString(),
    fid: input.fid,
    originCastleId: resource.castle.castleId,
    siteId: site.siteId,
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedStone: 0n,
    creditedStone: 0n,
    policyVersion: STONE_EXPEDITION_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  assertExpeditionState(expedition);
  ctx.db.stoneNodeOccupationV1.insert({
    siteId: site.siteId,
    originCastleId: resource.castle.castleId,
    phase: currentOccupationPhaseFor(expedition),
    startedAtMicros: expedition.startedAtMicros,
    arrivesAtMicros: expedition.arrivesAtMicros,
    gatheringEndsAtMicros: expedition.gatheringEndsAtMicros,
    returnsAtMicros: expedition.returnsAtMicros,
  });
  ctx.db.stoneExpeditionIdempotencyV1.insert({
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
 * Claim completed whole Stone minutes from the caller's active Stone Quarry
 * wagon. The capacity reservation is revalidated before every write; no
 * browser timing or per-minute mutation exists.
 */
export function collectActiveStoneExpedition(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  const expedition = ctx.db.stoneExpeditionV1.fid.find(fid);
  if (expedition === null) return;
  assertExpeditionState(expedition);
  if (expedition.fid !== fid) fail('STONE_EXPEDITION_OWNER_INTEGRITY');
  const resource = assertGenesisResourceForFid(ctx, fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('STONE_EXPEDITION_OWNER_INTEGRITY');
  }
  assertStoneCapacityReservation(ctx, resource, expedition);
  const accrual = planStoneExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const credit = accrual.accruedStone - expedition.creditedStone;
  if (credit < 0n) fail('STONE_EXPEDITION_CREDIT_INVALID');
  if (credit === 0n) return;
  if (credit > RESOURCE_BALANCE_CAP - resource.account.stone) {
    fail('STONE_EXPEDITION_ACCOUNT_CAPACITY');
  }
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    stone: resource.account.stone + credit,
    revision: safeNextRevision(resource.account.revision),
    updatedAt: ctx.timestamp,
  });
  ctx.db.stoneExpeditionV1.expeditionId.update({
    ...expedition,
    settledThroughMicros: accrual.settledThroughMicros,
    accruedStone: accrual.accruedStone,
    creditedStone: accrual.accruedStone,
    updatedAt: ctx.timestamp,
  });
}

/** Internal-only target of one-shot Stone lifecycle schedule rows. */
export function runStoneExpeditionSchedule(
  ctx: WarpkeepReducerContext,
  schedule: StoneScheduleRow,
): void {
  const expedition = ctx.db.stoneExpeditionV1.originCastleId.find(schedule.originCastleId);
  if (expedition === null) return;
  if (!scheduleMatchesExpedition(schedule, expedition)) return;
  assertExpeditionState(expedition);
  if (schedule.stage === SCHEDULE_STAGE_ARRIVAL) {
    transitionArrival(ctx, expedition);
    return;
  }
  if (schedule.stage === SCHEDULE_STAGE_GATHERING_EXPIRY) {
    creditExpiredStone(ctx, expedition);
    return;
  }
  // A late return delivery settles the immutable gathering endpoint first,
  // then removes this wagon. Stale delivery cannot affect a later expedition
  // because the full site/origin/timeline tuple is validated above.
  if (expedition.phase === 'outbound' || expedition.phase === 'gathering') {
    creditExpiredStone(ctx, expedition);
    const returning = ctx.db.stoneExpeditionV1.expeditionId.find(expedition.expeditionId);
    if (returning === null) fail('STONE_EXPEDITION_RETURN_STATE');
    assertExpeditionState(returning);
    completeReturn(ctx, returning);
    return;
  }
  completeReturn(ctx, expedition);
}

export function myStoneExpeditionState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): Readonly<{
  expedition: StoneExpeditionRow | undefined;
  accruedStone: bigint;
  pendingStone: bigint;
}> {
  const expedition = ctx.db.stoneExpeditionV1.fid.find(fid);
  if (expedition === null) {
    return Object.freeze({ expedition: undefined, accruedStone: 0n, pendingStone: 0n });
  }
  assertExpeditionState(expedition);
  const accrual = planStoneExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const pendingStone = accrual.accruedStone - expedition.creditedStone;
  if (pendingStone < 0n) fail('STONE_EXPEDITION_CREDIT_INVALID');
  return Object.freeze({ expedition, accruedStone: accrual.accruedStone, pendingStone });
}

export function stoneExpeditionErrorCode(error: unknown): string | undefined {
  if (
    error instanceof StoneExpeditionAuthorityError
    || error instanceof StoneExpeditionPolicyError
    || error instanceof ResourceExpeditionReservationAuthorityError
    || error instanceof ResourceAuthorityPolicyError
  ) return error.code;
  return undefined;
}
