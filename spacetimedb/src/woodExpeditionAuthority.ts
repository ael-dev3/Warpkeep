import type { InferSchema, ReducerCtx } from 'spacetimedb/server';
import { ScheduleAt } from 'spacetimedb';

import {
  WOOD_EXPEDITION_POLICY_VERSION,
  WOOD_EXPEDITION_U64_MAX,
  WOOD_GATHERING_TOTAL_WOOD,
  WoodExpeditionPolicyError,
  assertWoodExpeditionCapacity,
  assertWoodExpeditionIdempotencyKey,
  woodExpeditionStateIsConsistent,
  planWoodExpeditionAccrual,
  planWoodExpeditionTimeline,
} from './woodExpeditionPolicy';
import {
  CANONICAL_TIER_I_WOOD_SITES_V1,
  WOOD_SITE_POLICY_VERSION,
  GENESIS_TIER_I_WOOD_SITE_COUNT,
  canonicalWoodSiteV1ForId,
  matchesCanonicalTierIWoodSiteV1,
} from './woodSitePolicy';
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
type WoodSiteRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['woodSiteV1']['siteId']['find']>
>;
type WoodOccupationRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['woodNodeOccupationV1']['siteId']['find']>
>;
type WoodExpeditionRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['woodExpeditionV1']['expeditionId']['find']>
>;
type WoodScheduleRow = NonNullable<
  ReturnType<WarpkeepReducerContext['db']['woodExpeditionScheduleV1']['scheduleId']['find']>
>;

const SCHEDULE_STAGE_ARRIVAL = 'arrival';
const SCHEDULE_STAGE_GATHERING_EXPIRY = 'gathering-expiry';
const SCHEDULE_STAGE_RETURN_COMPLETE = 'return-complete';

export class WoodExpeditionAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WoodExpeditionAuthorityError';
  }
}

function fail(code: string): never {
  throw new WoodExpeditionAuthorityError(code);
}

function safeNextRevision(current: bigint): bigint {
  if (current < 0n || current >= WOOD_EXPEDITION_U64_MAX) {
    fail('WOOD_EXPEDITION_RESOURCE_REVISION');
  }
  return current + 1n;
}

function isWoodTerrain(kind: string): boolean {
  return kind === 'forest';
}

function assertCanonicalWoodSiteRow(row: WoodSiteRow): void {
  if (!matchesCanonicalTierIWoodSiteV1(row)) fail('WOOD_SITE_INTEGRITY');
  const tile = canonicalTileForKey(`${row.q},${row.r}`);
  const meta = canonicalMetaForKey(`${row.q},${row.r}`);
  if (
    tile === undefined
    || meta === undefined
    || !meta.passable
    || meta.staticContentKind !== 'resource-capable'
    || !isWoodTerrain(meta.terrainKind)
  ) fail('WOOD_SITE_INTEGRITY');
}

type WoodSiteShape = Readonly<{
  siteId: string;
  q: number;
  r: number;
  tier: number;
  active: boolean;
}>;

function assertWoodSiteWorldRows(
  ctx: WarpkeepReducerContext,
  site: WoodSiteShape,
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
    || !isWoodTerrain(storedMeta.terrainKind)
  ) fail('WOOD_SITE_WORLD_INTEGRITY');
}

function requestKeyFor(fid: bigint, idempotencyKey: string): string {
  assertWoodExpeditionIdempotencyKey(idempotencyKey);
  return `${fid}:${idempotencyKey}`;
}

function occupationMatchesExpedition(
  occupation: WoodOccupationRow,
  expedition: WoodExpeditionRow,
): boolean {
  return occupation.siteId === expedition.siteId
    && occupation.originCastleId === expedition.originCastleId
    && occupation.startedAtMicros === expedition.startedAtMicros
    && occupation.arrivesAtMicros === expedition.arrivesAtMicros
    && occupation.gatheringEndsAtMicros === expedition.gatheringEndsAtMicros
    && occupation.returnsAtMicros === expedition.returnsAtMicros;
}

function assertOccupationMatchesExpedition(
  occupation: WoodOccupationRow,
  expedition: WoodExpeditionRow,
): void {
  if (!occupationMatchesExpedition(occupation, expedition)) {
    fail('WOOD_OCCUPATION_INTEGRITY');
  }
}

function currentOccupationPhaseFor(expedition: WoodExpeditionRow): 'outbound' | 'gathering' {
  if (expedition.phase === 'outbound') return 'outbound';
  if (expedition.phase === 'gathering') return 'gathering';
  fail('WOOD_OCCUPATION_PHASE_INVALID');
}

function assertExpeditionState(expedition: WoodExpeditionRow): void {
  if (!woodExpeditionStateIsConsistent(expedition)) fail('WOOD_EXPEDITION_STATE_INVALID');
}

function insertSchedule(
  ctx: WarpkeepReducerContext,
  expedition: WoodExpeditionRow,
  stage: string,
  atMicros: bigint,
): void {
  ctx.db.woodExpeditionScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(atMicros),
    originCastleId: expedition.originCastleId,
    siteId: expedition.siteId,
    stage,
  });
}

function expectedScheduleTimeMicros(
  expedition: WoodExpeditionRow,
  stage: string,
): bigint | undefined {
  if (stage === SCHEDULE_STAGE_ARRIVAL) return expedition.arrivesAtMicros;
  if (stage === SCHEDULE_STAGE_GATHERING_EXPIRY) return expedition.gatheringEndsAtMicros;
  if (stage === SCHEDULE_STAGE_RETURN_COMPLETE) return expedition.returnsAtMicros;
  return undefined;
}

function scheduleMatchesExpedition(
  schedule: WoodScheduleRow,
  expedition: WoodExpeditionRow,
): boolean {
  const expectedAtMicros = expectedScheduleTimeMicros(expedition, schedule.stage);
  return expectedAtMicros !== undefined
    && schedule.originCastleId === expedition.originCastleId
    && schedule.siteId === expedition.siteId
    && schedule.scheduledAt.tag === 'Time'
    && schedule.scheduledAt.value.microsSinceUnixEpoch === expectedAtMicros;
}

/**
 * Check the private remaining-award reservation before a direct Wood credit.
 * Passive Wood is capped by the shared resource-policy adapter on every read
 * and settlement path; this check confirms the active row and account still
 * leave room for its exact uncredited award.
 */
function assertWoodCapacityReservation(
  ctx: WarpkeepReducerContext,
  resource: ReturnType<typeof assertGenesisResourceForFid>,
  expedition: Pick<WoodExpeditionRow, 'creditedWood'>,
): void {
  const reservedWood = activeExpeditionResourceReservations(ctx, resource.account.fid).wood;
  if (reservedWood !== WOOD_GATHERING_TOTAL_WOOD - expedition.creditedWood) {
    fail('WOOD_EXPEDITION_RESERVATION_INTEGRITY');
  }
  assertWoodExpeditionCapacity(
    resource.account.wood,
    expedition.creditedWood,
    RESOURCE_BALANCE_CAP,
  );
}

function transitionArrival(
  ctx: WarpkeepReducerContext,
  expedition: WoodExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.arrivesAtMicros) {
    fail('WOOD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase === 'gathering' || expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound') fail('WOOD_EXPEDITION_PHASE_INVALID');
  const occupation = ctx.db.woodNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('WOOD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound') fail('WOOD_OCCUPATION_PHASE_INVALID');
  ctx.db.woodExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'gathering',
    updatedAt: ctx.timestamp,
  });
  ctx.db.woodNodeOccupationV1.siteId.update({
    ...occupation,
    phase: 'gathering',
  });
}

function creditExpiredWood(
  ctx: WarpkeepReducerContext,
  expedition: WoodExpeditionRow,
): void {
  const now = ctx.timestamp.microsSinceUnixEpoch;
  if (now < expedition.gatheringEndsAtMicros) fail('WOOD_EXPEDITION_SCHEDULE_EARLY');
  if (expedition.phase === 'returning') return;
  if (expedition.phase !== 'outbound' && expedition.phase !== 'gathering') {
    fail('WOOD_EXPEDITION_PHASE_INVALID');
  }
  const occupation = ctx.db.woodNodeOccupationV1.siteId.find(expedition.siteId);
  if (occupation === null) fail('WOOD_OCCUPATION_MISSING');
  assertOccupationMatchesExpedition(occupation, expedition);
  if (occupation.phase !== 'outbound' && occupation.phase !== 'gathering') {
    fail('WOOD_OCCUPATION_PHASE_INVALID');
  }

  const accrual = planWoodExpeditionAccrual(expedition, expedition.gatheringEndsAtMicros);
  const credit = accrual.accruedWood - expedition.creditedWood;
  if (credit < 0n) fail('WOOD_EXPEDITION_CREDIT_INVALID');
  const resource = assertGenesisResourceForFid(ctx, expedition.fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('WOOD_EXPEDITION_OWNER_INTEGRITY');
  }
  assertWoodCapacityReservation(ctx, resource, expedition);
  // Advance normally to the current authoritative timestamp while preserving
  // the exact uncredited Wood reserve. This handles delayed scheduler delivery
  // without cursor rewind and releases the reserve atomically with the award.
  const passiveSettlement = planResourceSettlementForActiveExpeditionReservations(
    ctx,
    expedition.fid,
    resource.account,
    resource.terrainKind,
    now,
  );
  if (credit > RESOURCE_BALANCE_CAP - passiveSettlement.balances.wood) {
    fail('WOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const revision = passiveSettlement.completedQuanta === 0n
    ? safeNextRevision(resource.account.revision)
    : passiveSettlement.revision;
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    ...passiveSettlement.balances,
    wood: passiveSettlement.balances.wood + credit,
    settledThroughMicros: passiveSettlement.settledThroughMicros,
    revision,
    policyVersion: passiveSettlement.policyVersion,
    updatedAt: ctx.timestamp,
  });
  ctx.db.woodExpeditionV1.expeditionId.update({
    ...expedition,
    phase: 'returning',
    settledThroughMicros: accrual.settledThroughMicros,
    accruedWood: accrual.accruedWood,
    creditedWood: accrual.accruedWood,
    updatedAt: ctx.timestamp,
  });
  // The Logging Camp opens at gathering completion while the private wagon
  // continues returning. The next Wood wagon may occupy the released site.
  ctx.db.woodNodeOccupationV1.siteId.delete(occupation.siteId);
}

function completeReturn(
  ctx: WarpkeepReducerContext,
  expedition: WoodExpeditionRow,
): void {
  if (ctx.timestamp.microsSinceUnixEpoch < expedition.returnsAtMicros) {
    fail('WOOD_EXPEDITION_SCHEDULE_EARLY');
  }
  if (expedition.phase !== 'returning') fail('WOOD_EXPEDITION_RETURN_STATE');
  const occupation = ctx.db.woodNodeOccupationV1.siteId.find(expedition.siteId);
  // Another Wood wagon may legally own the public lease while this completed
  // wagon returns. Only an uncleared copy of this own lease is corruption.
  if (occupation !== null && occupationMatchesExpedition(occupation, expedition)) {
    fail('WOOD_OCCUPATION_INTEGRITY');
  }
  ctx.db.woodExpeditionV1.expeditionId.delete(expedition.expeditionId);
}

export type WoodSiteSeedPlan = Readonly<{
  missing: readonly WoodSiteShape[];
}>;

/**
 * Fail-closed plan for the canonical 96-site Wood catalog. Stored unknown,
 * duplicate, or edited rows block every insert before a seed mutates state.
 */
export function planGenesisTierIWoodSiteSeed(
  ctx: WarpkeepReducerContext,
  expectedSiteCount: bigint,
  policyVersion: string,
): WoodSiteSeedPlan {
  if (
    expectedSiteCount !== BigInt(GENESIS_TIER_I_WOOD_SITE_COUNT)
    || policyVersion !== WOOD_SITE_POLICY_VERSION
    || ctx.db.realmV1.realmId.find(CANONICAL_REALM.realmId) === null
  ) fail('WOOD_SITE_SEED_PRECONDITION');

  const seen = new Set<string>();
  for (const row of ctx.db.woodSiteV1.iter()) {
    if (seen.has(row.siteId)) fail('WOOD_SITE_SEED_CONFLICT');
    seen.add(row.siteId);
    assertCanonicalWoodSiteRow(row);
    assertWoodSiteWorldRows(ctx, row);
  }
  if (seen.size > GENESIS_TIER_I_WOOD_SITE_COUNT) fail('WOOD_SITE_SEED_CONFLICT');

  const missing: WoodSiteShape[] = [];
  for (const site of CANONICAL_TIER_I_WOOD_SITES_V1) {
    const existing = ctx.db.woodSiteV1.siteId.find(site.siteId);
    if (existing === null) {
      assertWoodSiteWorldRows(ctx, site);
      missing.push(site);
      continue;
    }
    assertCanonicalWoodSiteRow(existing);
    assertWoodSiteWorldRows(ctx, existing);
  }
  return Object.freeze({ missing: Object.freeze(missing) });
}

export function insertGenesisTierIWoodSite(
  ctx: WarpkeepReducerContext,
  site: WoodSiteShape,
): WoodSiteRow {
  if (ctx.db.woodSiteV1.siteId.find(site.siteId) !== null) fail('WOOD_SITE_SEED_CONFLICT');
  if (!matchesCanonicalTierIWoodSiteV1(site)) fail('WOOD_SITE_SEED_CONFLICT');
  assertWoodSiteWorldRows(ctx, site);
  return ctx.db.woodSiteV1.insert(site);
}

export type WoodExpeditionDispatch = Readonly<{
  expedition: WoodExpeditionRow;
  idempotent: boolean;
}>;

/**
 * Atomic caller-bound Wood dispatch. The browser supplies only a canonical
 * site ID and bounded retry key; authority derives the founder, castle,
 * server time, route, capacity reservation, phase, and reward internally.
 */
export function dispatchGenesisWoodExpedition(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    siteId: string;
    idempotencyKey: string;
  }>,
): WoodExpeditionDispatch {
  const resource = assertGenesisResourceForFid(ctx, input.fid);
  const requestKey = requestKeyFor(input.fid, input.idempotencyKey);
  const prior = ctx.db.woodExpeditionIdempotencyV1.requestKey.find(requestKey);
  if (prior !== null) {
    if (prior.fid !== input.fid || prior.siteId !== input.siteId) {
      fail('WOOD_EXPEDITION_IDEMPOTENCY_CONFLICT');
    }
    const expedition = ctx.db.woodExpeditionV1.expeditionId.find(prior.expeditionId);
    if (
      expedition === null
      || expedition.fid !== input.fid
      || expedition.siteId !== input.siteId
      || expedition.originCastleId !== resource.castle.castleId
    ) fail('WOOD_EXPEDITION_IDEMPOTENCY_STALE');
    assertExpeditionState(expedition);
    return Object.freeze({ expedition, idempotent: true });
  }

  const site = ctx.db.woodSiteV1.siteId.find(input.siteId);
  if (site === null || !site.active) fail('WOOD_SITE_UNAVAILABLE');
  assertCanonicalWoodSiteRow(site);
  assertWoodSiteWorldRows(ctx, site);
  if (ctx.db.woodNodeOccupationV1.siteId.find(site.siteId) !== null) {
    fail('WOOD_SITE_OCCUPIED');
  }
  for (const existing of ctx.db.woodExpeditionV1.siteId.filter(site.siteId)) {
    assertExpeditionState(existing);
    if (existing.phase !== 'returning') fail('WOOD_SITE_EXPEDITION_CONFLICT');
  }
  if (ctx.db.woodExpeditionV1.originCastleId.find(resource.castle.castleId) !== null) {
    fail('WOOD_WAGON_ALREADY_DEPLOYED');
  }
  const routeSteps = canonicalPassableRouteSteps(resource.castle, site);
  if (routeSteps === undefined || routeSteps <= 0) fail('WOOD_EXPEDITION_ROUTE_INVALID');
  const timeline = planWoodExpeditionTimeline(
    ctx.timestamp.microsSinceUnixEpoch,
    routeSteps,
  );
  const rawPassiveProjection = planRawResourceSettlement(
    resource.account,
    resource.terrainKind,
    timeline.gatheringEndsAtMicros,
  );
  assertWoodExpeditionCapacity(
    rawPassiveProjection.rawBalances.wood,
    0n,
    RESOURCE_BALANCE_CAP,
  );
  const expedition = ctx.db.woodExpeditionV1.insert({
    expeditionId: ctx.newUuidV7().toString(),
    fid: input.fid,
    originCastleId: resource.castle.castleId,
    siteId: site.siteId,
    phase: 'outbound',
    ...timeline,
    settledThroughMicros: timeline.arrivesAtMicros,
    accruedWood: 0n,
    creditedWood: 0n,
    policyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    createdAt: ctx.timestamp,
    updatedAt: ctx.timestamp,
  });
  assertExpeditionState(expedition);
  ctx.db.woodNodeOccupationV1.insert({
    siteId: site.siteId,
    originCastleId: resource.castle.castleId,
    phase: currentOccupationPhaseFor(expedition),
    startedAtMicros: expedition.startedAtMicros,
    arrivesAtMicros: expedition.arrivesAtMicros,
    gatheringEndsAtMicros: expedition.gatheringEndsAtMicros,
    returnsAtMicros: expedition.returnsAtMicros,
  });
  ctx.db.woodExpeditionIdempotencyV1.insert({
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
 * Claim completed whole Wood minutes from the caller's active Logging Camp
 * wagon. The capacity reservation is revalidated before every write; no
 * browser timing or per-minute mutation exists.
 */
export function collectActiveWoodExpedition(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): void {
  const expedition = ctx.db.woodExpeditionV1.fid.find(fid);
  if (expedition === null) return;
  assertExpeditionState(expedition);
  if (expedition.fid !== fid) fail('WOOD_EXPEDITION_OWNER_INTEGRITY');
  const resource = assertGenesisResourceForFid(ctx, fid);
  if (resource.account.castleId !== expedition.originCastleId) {
    fail('WOOD_EXPEDITION_OWNER_INTEGRITY');
  }
  assertWoodCapacityReservation(ctx, resource, expedition);
  const accrual = planWoodExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const credit = accrual.accruedWood - expedition.creditedWood;
  if (credit < 0n) fail('WOOD_EXPEDITION_CREDIT_INVALID');
  if (credit === 0n) return;
  if (credit > RESOURCE_BALANCE_CAP - resource.account.wood) {
    fail('WOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  ctx.db.resourceAccountV1.fid.update({
    ...resource.account,
    wood: resource.account.wood + credit,
    revision: safeNextRevision(resource.account.revision),
    updatedAt: ctx.timestamp,
  });
  ctx.db.woodExpeditionV1.expeditionId.update({
    ...expedition,
    settledThroughMicros: accrual.settledThroughMicros,
    accruedWood: accrual.accruedWood,
    creditedWood: accrual.accruedWood,
    updatedAt: ctx.timestamp,
  });
}

/** Internal-only target of one-shot Wood lifecycle schedule rows. */
export function runWoodExpeditionSchedule(
  ctx: WarpkeepReducerContext,
  schedule: WoodScheduleRow,
): void {
  const expedition = ctx.db.woodExpeditionV1.originCastleId.find(schedule.originCastleId);
  if (expedition === null) return;
  if (!scheduleMatchesExpedition(schedule, expedition)) return;
  assertExpeditionState(expedition);
  if (schedule.stage === SCHEDULE_STAGE_ARRIVAL) {
    transitionArrival(ctx, expedition);
    return;
  }
  if (schedule.stage === SCHEDULE_STAGE_GATHERING_EXPIRY) {
    creditExpiredWood(ctx, expedition);
    return;
  }
  // A late return delivery settles the immutable gathering endpoint first,
  // then removes this wagon. Stale delivery cannot affect a later expedition
  // because the full site/origin/timeline tuple is validated above.
  if (expedition.phase === 'outbound' || expedition.phase === 'gathering') {
    creditExpiredWood(ctx, expedition);
    const returning = ctx.db.woodExpeditionV1.expeditionId.find(expedition.expeditionId);
    if (returning === null) fail('WOOD_EXPEDITION_RETURN_STATE');
    assertExpeditionState(returning);
    completeReturn(ctx, returning);
    return;
  }
  completeReturn(ctx, expedition);
}

export function myWoodExpeditionState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): Readonly<{
  expedition: WoodExpeditionRow | undefined;
  accruedWood: bigint;
  pendingWood: bigint;
}> {
  const expedition = ctx.db.woodExpeditionV1.fid.find(fid);
  if (expedition === null) {
    return Object.freeze({ expedition: undefined, accruedWood: 0n, pendingWood: 0n });
  }
  assertExpeditionState(expedition);
  const accrual = planWoodExpeditionAccrual(expedition, ctx.timestamp.microsSinceUnixEpoch);
  const pendingWood = accrual.accruedWood - expedition.creditedWood;
  if (pendingWood < 0n) fail('WOOD_EXPEDITION_CREDIT_INVALID');
  return Object.freeze({ expedition, accruedWood: accrual.accruedWood, pendingWood });
}

export function woodExpeditionErrorCode(error: unknown): string | undefined {
  if (
    error instanceof WoodExpeditionAuthorityError
    || error instanceof WoodExpeditionPolicyError
    || error instanceof ResourceExpeditionReservationAuthorityError
    || error instanceof ResourceAuthorityPolicyError
  ) return error.code;
  return undefined;
}
