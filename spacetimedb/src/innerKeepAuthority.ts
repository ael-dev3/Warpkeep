import { ScheduleAt } from 'spacetimedb';
import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import { settleAllWorkerAssignmentsForFid, projectMyWorkerState } from './castleWorkerAuthority';
import { CASTLE_WORKERS_PER_CASTLE } from './castleWorkerPolicy';
import { CASTLE_WORKER_MAX_CASTLES } from './castleWorkerRolloutPolicy';
import {
  innerKeepBuilderRowIsIdleAndCanonical,
  innerKeepBuilderRowMatchesCastle,
  InnerKeepBuilderAuthorityError,
} from './innerKeepBuilderAuthority';
import {
  CANONICAL_INNER_KEEP_LAYOUT,
  CANONICAL_INNER_KEEP_SLOTS,
  INNER_KEEP_ASSET_CATALOG_DIGEST,
  INNER_KEEP_LAYOUT_DIGEST,
  INNER_KEEP_LAYOUT_ID,
  INNER_KEEP_LAYOUT_POLICY_VERSION,
  innerKeepActivationLifecycle,
  innerKeepLifecycleRequiresBuilders,
  matchesCanonicalInnerKeepLayout,
  matchesCanonicalInnerKeepSlot,
} from './innerKeepLayoutPolicy';
import {
  CANONICAL_INNER_KEEP_BUILDING_CATALOG,
  CANONICAL_INNER_KEEP_LEVEL_POLICIES,
  INNER_KEEP_MAXIMUM_LEVEL,
  INNER_KEEP_POLICY_DIGEST,
  INNER_KEEP_POLICY_VERSION,
  INNER_KEEP_PROTOCOL_CAPABILITY,
  InnerKeepPolicyError,
  canonicalInnerKeepBuildingPolicy,
  canonicalInnerKeepCost,
  canonicalInnerKeepLevelPolicy,
  innerKeepActivationRowsAreSafe,
  matchesCanonicalInnerKeepBuildingPolicy,
  matchesCanonicalInnerKeepLevelPolicy,
  type InnerKeepBuildingKind,
  type InnerKeepCompletedLevels,
} from './innerKeepPolicy';
import { assertGenesisResourceForFid } from './resourceAuthority';
import { GENESIS_RESOURCE_POLICY_VERSION } from './resourceAuthorityPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;
type CastleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castle']['castleId']['find']>>;
type LayoutRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['innerKeepLayoutV1']['layoutId']['find']>>;
type BuildingRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleInnerKeepBuildingV1']['buildingKey']['find']>>;
type BuilderRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleInnerBuilderV1']['castleId']['find']>>;
type ReceiptRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleInnerBuildReceiptV1']['receiptKey']['find']>>;
type ScheduleRow = NonNullable<ReturnType<WarpkeepReducerContext['db']['castleInnerConstructionScheduleV1']['scheduleId']['find']>>;

const U64_MAX = (1n << 64n) - 1n;
const INNER_KEEP_BUILDINGS_PER_CASTLE = 4;
const INNER_KEEP_REQUEST_KEY_PATTERN = /^[a-z0-9][a-z0-9-]{15,79}$/;
const SHA256_HEX = /^[0-9a-f]{64}$/;
const GIT_COMMIT_HEX = /^[0-9a-f]{40}$/;
const CLIENT_RELEASE_PATTERN = /^(?:alpha-)?0\.3\.[0-9]+(?:[-+][a-z0-9.-]+)?$/;

export class InnerKeepAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'InnerKeepAuthorityError';
  }
}

function fail(code: string): never {
  throw new InnerKeepAuthorityError(code);
}

function safeNextU64(value: bigint, code: string): bigint {
  if (value < 0n || value >= U64_MAX) fail(code);
  return value + 1n;
}

function safeAddU64(left: bigint, right: bigint, code: string): bigint {
  if (left < 0n || right < 0n || left > U64_MAX || right > U64_MAX - left) fail(code);
  return left + right;
}

function boundedRows<Row>(rows: Iterable<Row>, maximum: number, code: string): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) fail(code);
    result.push(row);
  }
  return result;
}

export function assertInnerKeepRequestKey(value: string): void {
  if (!INNER_KEEP_REQUEST_KEY_PATTERN.test(value)) fail('INNER_KEEP_REQUEST_KEY_INVALID');
}

export function innerKeepBuildingKey(castleId: bigint, buildingKind: string): string {
  if (castleId < 0n || castleId > U64_MAX) fail('INNER_KEEP_CASTLE_ID_INVALID');
  canonicalInnerKeepBuildingPolicy(buildingKind);
  return `${castleId.toString()}:${buildingKind}`;
}

export function innerKeepSlotKey(castleId: bigint, slotId: string): string {
  if (castleId < 0n || castleId > U64_MAX || !/^inner-keep-slot-[ml][0-9]{2}$/.test(slotId)) {
    fail('INNER_KEEP_SLOT_INVALID');
  }
  return `${castleId.toString()}:${slotId}`;
}

function receiptKey(fid: bigint, requestKey: string): string {
  assertInnerKeepRequestKey(requestKey);
  if (fid <= 0n || fid > U64_MAX) fail('INNER_KEEP_FID_INVALID');
  return `${fid.toString()}:${requestKey}`;
}

function staticCatalogState(ctx: WarpkeepReducerContext): Readonly<{
  layout: LayoutRow | undefined;
  layoutExact: boolean;
  slotsExact: boolean;
  buildingsExact: boolean;
  levelsExact: boolean;
  exact: boolean;
}> {
  const storedLayout = ctx.db.innerKeepLayoutV1.layoutId.find(INNER_KEEP_LAYOUT_ID);
  const layout = storedLayout ?? undefined;
  const layoutLifecycle = layout === undefined ? 'invalid' : innerKeepActivationLifecycle(layout);
  const layoutTimeValid = layout !== undefined
    && layout.createdAt.microsSinceUnixEpoch >= 0n
    && layoutLifecycle !== 'invalid'
    && (layout.activatedAt === undefined
      || layout.activatedAt.microsSinceUnixEpoch >= layout.createdAt.microsSinceUnixEpoch);
  const layoutExact = ctx.db.innerKeepLayoutV1.count() === 1n
    && layout !== undefined
    && matchesCanonicalInnerKeepLayout(layout)
    && layoutTimeValid;

  let slotsExact = ctx.db.innerKeepSlotV1.count() === BigInt(CANONICAL_INNER_KEEP_SLOTS.length);
  if (slotsExact) {
    for (const expected of CANONICAL_INNER_KEEP_SLOTS) {
      const stored = ctx.db.innerKeepSlotV1.slotId.find(expected.slotId);
      if (stored === null || !matchesCanonicalInnerKeepSlot(stored)) {
        slotsExact = false;
        break;
      }
    }
  }

  let buildingsExact = ctx.db.innerKeepBuildingCatalogV1.count()
    === BigInt(CANONICAL_INNER_KEEP_BUILDING_CATALOG.length);
  if (buildingsExact) {
    for (const expected of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
      const stored = ctx.db.innerKeepBuildingCatalogV1.buildingKind.find(expected.buildingKind);
      if (stored === null || !matchesCanonicalInnerKeepBuildingPolicy(stored)) {
        buildingsExact = false;
        break;
      }
    }
  }

  let levelsExact = ctx.db.innerKeepBuildLevelV1.count()
    === BigInt(CANONICAL_INNER_KEEP_LEVEL_POLICIES.length);
  if (levelsExact) {
    for (const expected of CANONICAL_INNER_KEEP_LEVEL_POLICIES) {
      const stored = ctx.db.innerKeepBuildLevelV1.levelKey.find(expected.levelKey);
      if (stored === null || !matchesCanonicalInnerKeepLevelPolicy(stored)) {
        levelsExact = false;
        break;
      }
    }
  }

  return Object.freeze({
    layout,
    layoutExact,
    slotsExact,
    buildingsExact,
    levelsExact,
    exact: layoutExact && slotsExact && buildingsExact && levelsExact,
  });
}

function assertStaticCatalogExact(ctx: WarpkeepReducerContext): LayoutRow {
  const state = staticCatalogState(ctx);
  if (!state.exact || state.layout === undefined) fail('INNER_KEEP_CATALOG_INTEGRITY');
  return state.layout;
}

function workerSystemIsReady(ctx: WarpkeepReducerContext): boolean {
  const system = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  return ctx.db.realmWorkerSystemV1.count() === 1n
    && system !== null
    && system.mode === 'active'
    && !system.legacyDrainRequired
    && BigInt(system.expectedCastleCount) === ctx.db.castle.count()
    && system.expectedWorkerCount === system.expectedCastleCount * CASTLE_WORKERS_PER_CASTLE
    && BigInt(system.expectedWorkerCount) === ctx.db.castleWorkerV1.count()
    && ctx.db.goldExpeditionV1.count() === 0n
    && ctx.db.foodExpeditionV1.count() === 0n
    && ctx.db.woodExpeditionV1.count() === 0n
    && ctx.db.stoneExpeditionV1.count() === 0n
    && ctx.db.goldNodeOccupationV1.count() === 0n
    && ctx.db.foodNodeOccupationV1.count() === 0n
    && ctx.db.woodNodeOccupationV1.count() === 0n
    && ctx.db.stoneNodeOccupationV1.count() === 0n
    && ctx.db.goldExpeditionScheduleV1.count() === 0n
    && ctx.db.foodExpeditionScheduleV1.count() === 0n
    && ctx.db.woodExpeditionScheduleV1.count() === 0n
    && ctx.db.stoneExpeditionScheduleV1.count() === 0n;
}

function assertInnerKeepComponentActive(ctx: WarpkeepReducerContext): LayoutRow {
  const layout = assertStaticCatalogExact(ctx);
  if (!layout.active || layout.activatedAt === undefined) fail('INNER_KEEP_UNAVAILABLE');
  if (!workerSystemIsReady(ctx)) fail('INNER_KEEP_BACKEND_SYNCHRONIZING');
  return layout;
}

function buildingRowsForCastle(ctx: WarpkeepReducerContext, castleId: bigint): readonly BuildingRow[] {
  return boundedRows(
    ctx.db.castleInnerKeepBuildingV1.byCastle.filter(castleId),
    INNER_KEEP_BUILDINGS_PER_CASTLE + 1,
    'INNER_KEEP_BUILDING_LIMIT',
  );
}

function schedulesForBuilding(ctx: WarpkeepReducerContext, buildingKey: string): readonly ScheduleRow[] {
  return boundedRows(
    ctx.db.castleInnerConstructionScheduleV1.byBuilding.filter(buildingKey),
    2,
    'INNER_KEEP_SCHEDULE_LIMIT',
  );
}

function scheduleMatchesBuilding(schedule: ScheduleRow, building: BuildingRow): boolean {
  const scheduledValue = schedule.scheduledAt.value;
  const scheduledAtMicros = typeof scheduledValue === 'object'
    && scheduledValue !== null
    && 'microsSinceUnixEpoch' in scheduledValue
    && typeof scheduledValue.microsSinceUnixEpoch === 'bigint'
    ? scheduledValue.microsSinceUnixEpoch
    : undefined;
  return schedule.scheduledAt.tag === 'Time'
    && scheduledAtMicros === building.completesAtMicros
    && schedule.buildingKey === building.buildingKey
    && schedule.expectedRevision === building.revision
    && schedule.expectedTargetLevel === building.targetLevel;
}

function buildingRowIsConsistent(ctx: WarpkeepReducerContext, row: BuildingRow): boolean {
  try {
    const policy = canonicalInnerKeepBuildingPolicy(row.buildingKind);
    const levelPolicy = canonicalInnerKeepLevelPolicy(row.buildingKind, row.targetLevel);
    const castle = ctx.db.castle.castleId.find(row.castleId);
    const slot = ctx.db.innerKeepSlotV1.slotId.find(row.slotId);
    if (
      castle === null
      || slot === null
      || !matchesCanonicalInnerKeepSlot(slot)
      || !slot.active
      || slot.footprintClass !== policy.footprintClass
      || row.buildingKey !== innerKeepBuildingKey(row.castleId, row.buildingKind)
      || row.slotKey !== innerKeepSlotKey(row.castleId, row.slotId)
      || row.completedLevel < 0
      || row.targetLevel < 1
      || row.targetLevel > policy.maximumLevel
      || row.startedAtMicros > row.completesAtMicros
      || row.completesAtMicros - row.startedAtMicros !== levelPolicy.durationMicros
      || row.completesAtMicros > U64_MAX
      || row.revision < 0n
      || row.policyVersion !== INNER_KEEP_POLICY_VERSION
    ) return false;
    if (row.phase === 'constructing') return row.targetLevel === row.completedLevel + 1;
    if (row.phase === 'complete') return row.completedLevel === row.targetLevel;
    return false;
  } catch (error) {
    if (error instanceof InnerKeepPolicyError || error instanceof InnerKeepAuthorityError) return false;
    throw error;
  }
}

function builderForCastle(ctx: WarpkeepReducerContext, castle: CastleRow): BuilderRow {
  const byCastle = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
  const byFid = ctx.db.castleInnerBuilderV1.fid.find(castle.ownerFid);
  if (
    byCastle === null
    || byFid === null
    || byCastle.castleId !== byFid.castleId
    || !innerKeepBuilderRowMatchesCastle(byCastle, castle)
  ) fail('INNER_KEEP_BUILDER_INTEGRITY');
  return byCastle;
}

function assertBuilderProjectGraph(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
  builder: BuilderRow,
): readonly BuildingRow[] {
  const buildings = buildingRowsForCastle(ctx, castle.castleId);
  if (buildings.some(row => !buildingRowIsConsistent(ctx, row))) fail('INNER_KEEP_BUILDING_INTEGRITY');
  const constructing = buildings.filter(row => row.phase === 'constructing');
  if (constructing.length > 1) fail('INNER_KEEP_BUILDER_INTEGRITY');
  if (builder.activeBuildingKey === undefined) {
    if (builder.busyUntilMicros !== undefined || constructing.length !== 0) fail('INNER_KEEP_BUILDER_INTEGRITY');
  } else {
    if (
      builder.busyUntilMicros === undefined
      || constructing.length !== 1
      || constructing[0]!.buildingKey !== builder.activeBuildingKey
      || constructing[0]!.completesAtMicros !== builder.busyUntilMicros
    ) fail('INNER_KEEP_BUILDER_INTEGRITY');
  }
  for (const building of buildings) {
    const schedules = schedulesForBuilding(ctx, building.buildingKey);
    if (building.phase === 'complete' && schedules.length !== 0) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
    if (
      building.phase === 'constructing'
      && (
        schedules.length > 1
        || (schedules.length === 1 && !scheduleMatchesBuilding(schedules[0]!, building))
      )
    ) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  }
  return buildings;
}

function deleteSchedulesForBuilding(ctx: WarpkeepReducerContext, buildingKey: string): void {
  for (const schedule of schedulesForBuilding(ctx, buildingKey)) {
    ctx.db.castleInnerConstructionScheduleV1.scheduleId.delete(schedule.scheduleId);
  }
}

function completeProject(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
  builder: BuilderRow,
  building: BuildingRow,
  now: bigint,
): BuildingRow {
  if (
    building.phase !== 'constructing'
    || builder.activeBuildingKey !== building.buildingKey
    || builder.busyUntilMicros !== building.completesAtMicros
  ) fail('INNER_KEEP_COMPLETION_INTEGRITY');
  if (now < building.completesAtMicros) fail('INNER_KEEP_COMPLETION_EARLY');
  if (!buildingRowIsConsistent(ctx, building)) fail('INNER_KEEP_BUILDING_INTEGRITY');
  deleteSchedulesForBuilding(ctx, building.buildingKey);
  const completed = {
    ...building,
    completedLevel: building.targetLevel,
    phase: 'complete',
    revision: safeNextU64(building.revision, 'INNER_KEEP_BUILDING_REVISION'),
  };
  ctx.db.castleInnerKeepBuildingV1.buildingKey.update(completed);
  ctx.db.castleInnerBuilderV1.castleId.update({
    ...builder,
    activeBuildingKey: undefined,
    busyUntilMicros: undefined,
    revision: safeNextU64(builder.revision, 'INNER_KEEP_BUILDER_REVISION'),
    updatedAt: ctx.timestamp,
  });
  const stored = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(building.buildingKey);
  const idle = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
  if (
    stored === null
    || idle === null
    || !buildingRowIsConsistent(ctx, stored)
    || !innerKeepBuilderRowIsIdleAndCanonical(idle, castle)
  ) fail('INNER_KEEP_COMPLETION_INTEGRITY');
  return stored;
}

function reconcileOverdueProject(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
  builder: BuilderRow,
  now: bigint,
): BuilderRow {
  const buildings = assertBuilderProjectGraph(ctx, castle, builder);
  if (builder.activeBuildingKey === undefined) return builder;
  const building = buildings.find(row => row.buildingKey === builder.activeBuildingKey);
  if (building === undefined) fail('INNER_KEEP_BUILDER_INTEGRITY');
  const schedules = schedulesForBuilding(ctx, building.buildingKey);
  if (schedules.length === 1 && !scheduleMatchesBuilding(schedules[0]!, building)) {
    fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  }
  if (now < building.completesAtMicros) {
    // A missing callback row is recoverable only after the canonical project
    // becomes overdue. Until then, fail without mutating so operators retain
    // an unambiguous window for exact schedule delivery or forward repair.
    if (schedules.length !== 1) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
    return builder;
  }
  completeProject(ctx, castle, builder, building, now);
  const idle = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
  if (idle === null) fail('INNER_KEEP_BUILDER_INTEGRITY');
  return idle;
}

/**
 * Caller-owned entry synchronization. Inactive state is projection-only;
 * active, Worker-ready state may finish one exact overdue project before the
 * surrounding procedure projects it from the same transaction.
 */
export function synchronizeMyInnerKeepEntry(
  ctx: WarpkeepReducerContext,
  castle: CastleRow,
): void {
  const catalog = staticCatalogState(ctx);
  if (!catalog.exact || catalog.layout?.active !== true) return;
  assertInnerKeepComponentActive(ctx);
  const builder = builderForCastle(ctx, castle);
  reconcileOverdueProject(ctx, castle, builder, ctx.timestamp.microsSinceUnixEpoch);
}

function completedLevels(buildings: readonly BuildingRow[]): InnerKeepCompletedLevels {
  const result: Partial<Record<InnerKeepBuildingKind, number>> = {};
  for (const building of buildings) {
    if (building.completedLevel <= 0) continue;
    const policy = canonicalInnerKeepBuildingPolicy(building.buildingKind);
    result[policy.buildingKind] = building.completedLevel;
  }
  return Object.freeze(result);
}

function priorReceiptMatches(
  row: ReceiptRow,
  input: Readonly<{
    fid: bigint;
    castle: CastleRow;
    slotId: string;
    buildingKind: string;
    requestKey: string;
  }>,
): boolean {
  try {
    return row.receiptKey === receiptKey(input.fid, input.requestKey)
      && row.fid === input.fid
      && row.requestKey === input.requestKey
      && row.castleId === input.castle.castleId
      && row.buildingKey === innerKeepBuildingKey(input.castle.castleId, input.buildingKind)
      && row.slotId === input.slotId
      && row.buildingKind === input.buildingKind
      && row.targetLevel >= 1
      && row.targetLevel <= INNER_KEEP_MAXIMUM_LEVEL
      && row.policyVersion === INNER_KEEP_POLICY_VERSION
      && row.startedAt.microsSinceUnixEpoch >= input.castle.createdAt.microsSinceUnixEpoch;
  } catch (error) {
    if (error instanceof InnerKeepPolicyError || error instanceof InnerKeepAuthorityError) return false;
    throw error;
  }
}

export type InnerKeepStartResult = Readonly<{
  building: BuildingRow;
  receipt: ReceiptRow;
  idempotent: boolean;
}>;

/** Atomic initial-build/upgrade authority. The caller supplies no economic state. */
export function startInnerKeepProject(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    castle: CastleRow;
    slotId: string;
    buildingKind: string;
    requestKey: string;
  }>,
): InnerKeepStartResult {
  const requestReceiptKey = receiptKey(input.fid, input.requestKey);
  const prior = ctx.db.castleInnerBuildReceiptV1.receiptKey.find(requestReceiptKey);
  if (prior !== null) {
    if (!priorReceiptMatches(prior, input)) fail('INNER_KEEP_IDEMPOTENCY_CONFLICT');
    const building = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(prior.buildingKey);
    if (
      building === null
      || building.castleId !== input.castle.castleId
      || building.slotId !== prior.slotId
      || building.buildingKind !== prior.buildingKind
      || building.completedLevel < prior.targetLevel && building.targetLevel !== prior.targetLevel
      || !buildingRowIsConsistent(ctx, building)
    ) fail('INNER_KEEP_IDEMPOTENCY_STALE');
    return Object.freeze({ building, receipt: prior, idempotent: true });
  }

  assertInnerKeepComponentActive(ctx);
  if (input.castle.ownerFid !== input.fid) fail('INNER_KEEP_NOT_OWNED');
  const canonicalSlot = CANONICAL_INNER_KEEP_SLOTS.find(row => row.slotId === input.slotId);
  const storedSlot = ctx.db.innerKeepSlotV1.slotId.find(input.slotId);
  if (
    canonicalSlot === undefined
    || storedSlot === null
    || !matchesCanonicalInnerKeepSlot(storedSlot)
    || !storedSlot.active
  ) fail('INNER_KEEP_SLOT_UNAVAILABLE');
  const buildingPolicy = canonicalInnerKeepBuildingPolicy(input.buildingKind);
  const storedCatalog = ctx.db.innerKeepBuildingCatalogV1.buildingKind.find(input.buildingKind);
  if (
    storedCatalog === null
    || !matchesCanonicalInnerKeepBuildingPolicy(storedCatalog)
    || !storedCatalog.active
  ) fail('INNER_KEEP_BUILDING_UNAVAILABLE');
  if (storedSlot.footprintClass !== buildingPolicy.footprintClass) {
    fail('INNER_KEEP_FOOTPRINT_INCOMPATIBLE');
  }

  let builder = builderForCastle(ctx, input.castle);
  builder = reconcileOverdueProject(ctx, input.castle, builder, ctx.timestamp.microsSinceUnixEpoch);
  if (builder.activeBuildingKey !== undefined || builder.busyUntilMicros !== undefined) {
    fail('INNER_KEEP_BUILDER_BUSY');
  }
  const buildings = assertBuilderProjectGraph(ctx, input.castle, builder);
  const projectKey = innerKeepBuildingKey(input.castle.castleId, input.buildingKind);
  const requestedSlotKey = innerKeepSlotKey(input.castle.castleId, input.slotId);
  const slotOccupant = ctx.db.castleInnerKeepBuildingV1.slotKey.find(requestedSlotKey);
  let existing = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(projectKey);
  let targetLevel: number;
  if (existing === null) {
    if (slotOccupant !== null) fail('INNER_KEEP_SLOT_OCCUPIED');
    targetLevel = 1;
  } else {
    if (
      existing.slotId !== input.slotId
      || existing.slotKey !== requestedSlotKey
      || slotOccupant?.buildingKey !== existing.buildingKey
    ) fail('INNER_KEEP_BUILDING_ALREADY_EXISTS');
    if (existing.phase !== 'complete' || !buildingRowIsConsistent(ctx, existing)) {
      fail('INNER_KEEP_BUILDING_INTEGRITY');
    }
    if (existing.completedLevel >= INNER_KEEP_MAXIMUM_LEVEL) fail('INNER_KEEP_MAXIMUM_LEVEL');
    targetLevel = existing.completedLevel + 1;
  }

  const cost = canonicalInnerKeepCost(
    input.buildingKind,
    targetLevel,
    completedLevels(buildings),
  );
  // Materialize passive and generic-Worker quanta at the authoritative start
  // timestamp while the existing reservation planner preserves active awards.
  settleAllWorkerAssignmentsForFid(ctx, input.fid, ctx.timestamp.microsSinceUnixEpoch);
  const resource = assertGenesisResourceForFid(ctx, input.fid).account;
  if (resource.food < cost.effectiveCost.food) fail('INNER_KEEP_INSUFFICIENT_FOOD');
  if (resource.wood < cost.effectiveCost.wood) fail('INNER_KEEP_INSUFFICIENT_WOOD');
  if (resource.stone < cost.effectiveCost.stone) fail('INNER_KEEP_INSUFFICIENT_STONE');
  if (resource.gold < cost.effectiveCost.gold) fail('INNER_KEEP_INSUFFICIENT_GOLD');

  ctx.db.resourceAccountV1.fid.update({
    ...resource,
    food: resource.food - cost.effectiveCost.food,
    wood: resource.wood - cost.effectiveCost.wood,
    stone: resource.stone - cost.effectiveCost.stone,
    gold: resource.gold - cost.effectiveCost.gold,
    revision: safeNextU64(resource.revision, 'INNER_KEEP_RESOURCE_REVISION'),
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
    updatedAt: ctx.timestamp,
  });

  const startedAtMicros = ctx.timestamp.microsSinceUnixEpoch;
  const completesAtMicros = safeAddU64(startedAtMicros, cost.durationMicros, 'INNER_KEEP_TIME_OVERFLOW');
  const project: BuildingRow = existing === null
    ? {
      buildingKey: projectKey,
      castleId: input.castle.castleId,
      slotKey: requestedSlotKey,
      slotId: input.slotId,
      buildingKind: buildingPolicy.buildingKind,
      completedLevel: 0,
      targetLevel,
      phase: 'constructing',
      startedAtMicros,
      completesAtMicros,
      revision: 0n,
      policyVersion: INNER_KEEP_POLICY_VERSION,
    }
    : {
      ...existing,
      targetLevel,
      phase: 'constructing',
      startedAtMicros,
      completesAtMicros,
      revision: safeNextU64(existing.revision, 'INNER_KEEP_BUILDING_REVISION'),
      policyVersion: INNER_KEEP_POLICY_VERSION,
    };
  if (existing === null) ctx.db.castleInnerKeepBuildingV1.insert(project);
  else ctx.db.castleInnerKeepBuildingV1.buildingKey.update(project);

  ctx.db.castleInnerBuilderV1.castleId.update({
    ...builder,
    activeBuildingKey: project.buildingKey,
    busyUntilMicros: project.completesAtMicros,
    revision: safeNextU64(builder.revision, 'INNER_KEEP_BUILDER_REVISION'),
    updatedAt: ctx.timestamp,
  });
  ctx.db.castleInnerConstructionScheduleV1.insert({
    scheduleId: 0n,
    scheduledAt: ScheduleAt.time(project.completesAtMicros),
    buildingKey: project.buildingKey,
    expectedRevision: project.revision,
    expectedTargetLevel: project.targetLevel,
  });
  const insertedReceipt = ctx.db.castleInnerBuildReceiptV1.insert({
    receiptKey: requestReceiptKey,
    fid: input.fid,
    requestKey: input.requestKey,
    castleId: input.castle.castleId,
    buildingKey: project.buildingKey,
    slotId: input.slotId,
    buildingKind: buildingPolicy.buildingKind,
    targetLevel,
    deductedFood: cost.effectiveCost.food,
    deductedWood: cost.effectiveCost.wood,
    deductedStone: cost.effectiveCost.stone,
    deductedGold: cost.effectiveCost.gold,
    startedAt: ctx.timestamp,
    policyVersion: INNER_KEEP_POLICY_VERSION,
  });

  const busy = builderForCastle(ctx, input.castle);
  const storedProject = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(project.buildingKey);
  const storedSchedules = storedProject === null
    ? []
    : schedulesForBuilding(ctx, storedProject.buildingKey);
  if (
    storedProject === null
    || !buildingRowIsConsistent(ctx, storedProject)
    || busy.activeBuildingKey !== storedProject.buildingKey
    || busy.busyUntilMicros !== storedProject.completesAtMicros
    || storedSchedules.length !== 1
    || !scheduleMatchesBuilding(storedSchedules[0]!, storedProject)
  ) fail('INNER_KEEP_START_INTEGRITY');
  return Object.freeze({ building: storedProject, receipt: insertedReceipt, idempotent: false });
}

/** Exact schedule completion; stale or early authority fails closed. */
export function runInnerKeepConstructionSchedule(
  ctx: WarpkeepReducerContext,
  schedule: ScheduleRow,
): void {
  const persisted = ctx.db.castleInnerConstructionScheduleV1.scheduleId.find(schedule.scheduleId);
  if (persisted === null) return;
  const building = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(persisted.buildingKey);
  if (building === null) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  if (
    building.phase !== 'constructing'
    || persisted.scheduleId !== schedule.scheduleId
    || !scheduleMatchesBuilding(persisted, building)
    || !scheduleMatchesBuilding(schedule, building)
  ) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  const castle = ctx.db.castle.castleId.find(building.castleId);
  if (castle === null) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  const builder = builderForCastle(ctx, castle);
  if (
    builder.activeBuildingKey !== building.buildingKey
    || builder.busyUntilMicros !== building.completesAtMicros
  ) fail('INNER_KEEP_SCHEDULE_INTEGRITY');
  completeProject(ctx, castle, builder, building, ctx.timestamp.microsSinceUnixEpoch);
}

export type MyInnerKeepState = Readonly<{
  castleId: bigint;
  componentActive: boolean;
  componentReady: boolean;
  builderPresent: boolean;
  builderBusy: boolean;
  activeBuildingKey: string | undefined;
  busyUntilMicros: bigint | undefined;
  builderRevision: bigint;
  storedFood: bigint;
  storedWood: bigint;
  storedStone: bigint;
  storedGold: bigint;
  projectedFood: bigint;
  projectedWood: bigint;
  projectedStone: bigint;
  projectedGold: bigint;
  resourceRevision: bigint;
  observedAtMicros: bigint;
  policyVersion: string;
  layoutDigest: string;
  assetCatalogDigest: string;
}>;

export function projectMyInnerKeepState(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  castle: CastleRow,
): MyInnerKeepState {
  const catalog = staticCatalogState(ctx);
  const componentActive = catalog.exact && catalog.layout?.active === true;
  const resource = assertGenesisResourceForFid(ctx, fid).account;
  const builder = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
  if (builder !== null && !innerKeepBuilderRowMatchesCastle(builder, castle)) {
    fail('INNER_KEEP_BUILDER_INTEGRITY');
  }
  const builderRequired = catalog.exact
    && catalog.layout !== undefined
    && innerKeepLifecycleRequiresBuilders(innerKeepActivationLifecycle(catalog.layout));
  if (builderRequired && builder === null) fail('INNER_KEEP_BUILDER_INTEGRITY');
  const componentReady = componentActive && builder !== null && workerSystemIsReady(ctx);
  const projected = componentReady
    ? projectMyWorkerState(ctx, fid, ctx.timestamp.microsSinceUnixEpoch).balances
    : resource;
  return Object.freeze({
    castleId: castle.castleId,
    componentActive,
    componentReady,
    builderPresent: builder !== null,
    builderBusy: builder?.activeBuildingKey !== undefined,
    activeBuildingKey: builder?.activeBuildingKey,
    busyUntilMicros: builder?.busyUntilMicros,
    builderRevision: builder?.revision ?? 0n,
    storedFood: resource.food,
    storedWood: resource.wood,
    storedStone: resource.stone,
    storedGold: resource.gold,
    projectedFood: projected.food,
    projectedWood: projected.wood,
    projectedStone: projected.stone,
    projectedGold: projected.gold,
    resourceRevision: resource.revision,
    observedAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
  });
}

export function getMyInnerKeepRequestStatus(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  requestKey: string,
): ReceiptRow | undefined {
  const key = receiptKey(fid, requestKey);
  const receipt = ctx.db.castleInnerBuildReceiptV1.receiptKey.find(key);
  if (receipt === null) return undefined;
  const castle = ctx.db.castle.ownerFid.find(fid);
  if (castle === null || !priorReceiptMatches(receipt, {
    fid,
    castle,
    slotId: receipt.slotId,
    buildingKind: receipt.buildingKind,
    requestKey,
  })) fail('INNER_KEEP_RECEIPT_INTEGRITY');
  return receipt;
}

export type InnerKeepCatalogPlan = Readonly<{
  missingLayout: number;
  missingSlots: number;
  missingBuildings: number;
  missingLevels: number;
  ready: boolean;
}>;

/** Exact deterministic seed plan. Conflicting rows are never overwritten. */
export function planInnerKeepCatalogSeed(ctx: WarpkeepReducerContext): InnerKeepCatalogPlan {
  if (
    ctx.db.innerKeepLayoutV1.count() > 1n
    || ctx.db.innerKeepSlotV1.count() > BigInt(CANONICAL_INNER_KEEP_SLOTS.length)
    || ctx.db.innerKeepBuildingCatalogV1.count() > BigInt(CANONICAL_INNER_KEEP_BUILDING_CATALOG.length)
    || ctx.db.innerKeepBuildLevelV1.count() > BigInt(CANONICAL_INNER_KEEP_LEVEL_POLICIES.length)
  ) fail('INNER_KEEP_CATALOG_CONFLICT');
  const layout = ctx.db.innerKeepLayoutV1.layoutId.find(INNER_KEEP_LAYOUT_ID);
  if (layout !== null && !matchesCanonicalInnerKeepLayout(layout)) fail('INNER_KEEP_CATALOG_CONFLICT');
  let missingSlots = 0;
  for (const expected of CANONICAL_INNER_KEEP_SLOTS) {
    const stored = ctx.db.innerKeepSlotV1.slotId.find(expected.slotId);
    if (stored === null) missingSlots += 1;
    else if (!matchesCanonicalInnerKeepSlot(stored)) fail('INNER_KEEP_CATALOG_CONFLICT');
  }
  let missingBuildings = 0;
  for (const expected of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    const stored = ctx.db.innerKeepBuildingCatalogV1.buildingKind.find(expected.buildingKind);
    if (stored === null) missingBuildings += 1;
    else if (!matchesCanonicalInnerKeepBuildingPolicy(stored)) fail('INNER_KEEP_CATALOG_CONFLICT');
  }
  let missingLevels = 0;
  for (const expected of CANONICAL_INNER_KEEP_LEVEL_POLICIES) {
    const stored = ctx.db.innerKeepBuildLevelV1.levelKey.find(expected.levelKey);
    if (stored === null) missingLevels += 1;
    else if (!matchesCanonicalInnerKeepLevelPolicy(stored)) fail('INNER_KEEP_CATALOG_CONFLICT');
  }
  const missingLayout = layout === null ? 1 : 0;
  if (
    ctx.db.innerKeepLayoutV1.count() !== BigInt(1 - missingLayout)
    || ctx.db.innerKeepSlotV1.count()
      !== BigInt(CANONICAL_INNER_KEEP_SLOTS.length - missingSlots)
    || ctx.db.innerKeepBuildingCatalogV1.count()
      !== BigInt(CANONICAL_INNER_KEEP_BUILDING_CATALOG.length - missingBuildings)
    || ctx.db.innerKeepBuildLevelV1.count()
      !== BigInt(CANONICAL_INNER_KEEP_LEVEL_POLICIES.length - missingLevels)
  ) fail('INNER_KEEP_CATALOG_CONFLICT');
  if (
    missingLayout === 1
    && (
      ctx.db.castleInnerKeepBuildingV1.count() !== 0n
      || ctx.db.castleInnerBuilderV1.count() !== 0n
      || ctx.db.castleInnerBuildReceiptV1.count() !== 0n
      || ctx.db.castleInnerConstructionScheduleV1.count() !== 0n
    )
  ) fail('INNER_KEEP_CATALOG_CONFLICT');
  return Object.freeze({
    missingLayout,
    missingSlots,
    missingBuildings,
    missingLevels,
    ready: missingLayout === 0 && missingSlots === 0 && missingBuildings === 0 && missingLevels === 0,
  });
}

export function seedInnerKeepCatalog(ctx: WarpkeepReducerContext): InnerKeepCatalogPlan {
  const plan = planInnerKeepCatalogSeed(ctx);
  if (plan.missingLayout === 1) {
    ctx.db.innerKeepLayoutV1.insert({
      ...CANONICAL_INNER_KEEP_LAYOUT,
      active: false,
      createdAt: ctx.timestamp,
      activatedAt: undefined,
    });
  }
  for (const row of CANONICAL_INNER_KEEP_SLOTS) {
    if (ctx.db.innerKeepSlotV1.slotId.find(row.slotId) === null) ctx.db.innerKeepSlotV1.insert({ ...row });
  }
  for (const row of CANONICAL_INNER_KEEP_BUILDING_CATALOG) {
    if (ctx.db.innerKeepBuildingCatalogV1.buildingKind.find(row.buildingKind) !== null) continue;
    const { baseCost: _baseCost, ...stored } = row;
    ctx.db.innerKeepBuildingCatalogV1.insert(stored);
  }
  for (const row of CANONICAL_INNER_KEEP_LEVEL_POLICIES) {
    if (ctx.db.innerKeepBuildLevelV1.levelKey.find(row.levelKey) === null) {
      ctx.db.innerKeepBuildLevelV1.insert({ ...row });
    }
  }
  const after = planInnerKeepCatalogSeed(ctx);
  if (!after.ready || !staticCatalogState(ctx).exact) fail('INNER_KEEP_CATALOG_INTEGRITY');
  return plan;
}

export type InnerKeepBuilderPlan = Readonly<{
  expectedCastles: number;
  existingBuilders: number;
  missingBuilders: number;
  ready: boolean;
}>;

export function planInnerKeepBuilderBackfill(ctx: WarpkeepReducerContext): InnerKeepBuilderPlan {
  const layout = assertStaticCatalogExact(ctx);
  if (innerKeepActivationLifecycle(layout) !== 'never-activated') {
    fail('INNER_KEEP_BACKFILL_AFTER_ACTIVATION');
  }
  if (
    ctx.db.castle.count() > BigInt(CASTLE_WORKER_MAX_CASTLES)
    || ctx.db.castleInnerKeepBuildingV1.count() !== 0n
    || ctx.db.castleInnerBuildReceiptV1.count() !== 0n
    || ctx.db.castleInnerConstructionScheduleV1.count() !== 0n
  ) fail('INNER_KEEP_BACKFILL_PRECONDITION');
  const castles = [...ctx.db.castle.iter()];
  const castleIds = new Set(castles.map(castle => castle.castleId.toString()));
  for (const builder of ctx.db.castleInnerBuilderV1.iter()) {
    const castle = ctx.db.castle.castleId.find(builder.castleId);
    if (
      castle === null
      || !castleIds.has(builder.castleId.toString())
      || !innerKeepBuilderRowIsIdleAndCanonical(builder, castle)
    ) fail('INNER_KEEP_BUILDER_CONFLICT');
  }
  let missingBuilders = 0;
  for (const castle of castles) {
    const byCastle = ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId);
    const byFid = ctx.db.castleInnerBuilderV1.fid.find(castle.ownerFid);
    if (byCastle === null && byFid === null) missingBuilders += 1;
    else if (
      byCastle === null
      || byFid === null
      || byCastle.castleId !== byFid.castleId
      || !innerKeepBuilderRowIsIdleAndCanonical(byCastle, castle)
    ) fail('INNER_KEEP_BUILDER_CONFLICT');
  }
  return Object.freeze({
    expectedCastles: castles.length,
    existingBuilders: Number(ctx.db.castleInnerBuilderV1.count()),
    missingBuilders,
    ready: missingBuilders === 0 && ctx.db.castleInnerBuilderV1.count() === ctx.db.castle.count(),
  });
}

export function backfillInnerKeepBuilders(ctx: WarpkeepReducerContext): InnerKeepBuilderPlan {
  const plan = planInnerKeepBuilderBackfill(ctx);
  const castles = [...ctx.db.castle.iter()].sort((left, right) => (
    left.castleId < right.castleId ? -1 : left.castleId > right.castleId ? 1 : 0
  ));
  for (const castle of castles) {
    if (ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId) !== null) continue;
    ctx.db.castleInnerBuilderV1.insert({
      castleId: castle.castleId,
      fid: castle.ownerFid,
      activeBuildingKey: undefined,
      busyUntilMicros: undefined,
      revision: 0n,
      policyVersion: INNER_KEEP_POLICY_VERSION,
      createdAt: ctx.timestamp,
      updatedAt: ctx.timestamp,
    });
  }
  if (!planInnerKeepBuilderBackfill(ctx).ready) fail('INNER_KEEP_BUILDER_INTEGRITY');
  return plan;
}

export type InnerKeepActivationAttestation = Readonly<{
  capability: string;
  policyDigest: string;
  layoutDigest: string;
  assetCatalogDigest: string;
  clientRelease: string;
  clientArtifactDigest: string;
  moduleArtifactDigest: string;
  sourceCommit: string;
  expectedCastleCount: number;
}>;

function validateActivationAttestation(attestation: InnerKeepActivationAttestation): void {
  if (
    attestation.capability !== INNER_KEEP_PROTOCOL_CAPABILITY
    || attestation.policyDigest !== INNER_KEEP_POLICY_DIGEST
    || attestation.layoutDigest !== INNER_KEEP_LAYOUT_DIGEST
    || attestation.assetCatalogDigest !== INNER_KEEP_ASSET_CATALOG_DIGEST
    || !CLIENT_RELEASE_PATTERN.test(attestation.clientRelease)
    || !SHA256_HEX.test(attestation.clientArtifactDigest)
    || !SHA256_HEX.test(attestation.moduleArtifactDigest)
    || !GIT_COMMIT_HEX.test(attestation.sourceCommit)
    || !Number.isSafeInteger(attestation.expectedCastleCount)
    || attestation.expectedCastleCount < 0
    || attestation.expectedCastleCount > CASTLE_WORKER_MAX_CASTLES
  ) fail('INNER_KEEP_ACTIVATION_ATTESTATION_INVALID');
}

export function activateInnerKeep(
  ctx: WarpkeepReducerContext,
  attestation: InnerKeepActivationAttestation,
): LayoutRow {
  validateActivationAttestation(attestation);
  const layout = assertStaticCatalogExact(ctx);
  const aggregate = inspectInnerKeep(ctx);
  if (layout.active) {
    if (
      aggregate.builderRows !== aggregate.castleRows
      || aggregate.missingBuilders !== 0n
      || aggregate.orphanBuilders !== 0n
      || aggregate.invalidBuilders !== 0n
      || aggregate.invalidBuildings !== 0n
      || aggregate.invalidSchedules !== 0n
      || aggregate.builderProjectMismatches !== 0n
      || aggregate.castleRows !== BigInt(attestation.expectedCastleCount)
      || !workerSystemIsReady(ctx)
    ) fail('INNER_KEEP_ACTIVATION_NOT_READY');
    return layout;
  }
  const activationRowsSafe = innerKeepActivationRowsAreSafe({
    previouslyActivated: innerKeepActivationLifecycle(layout) !== 'never-activated',
    buildingRows: aggregate.buildingRows,
    activeProjects: aggregate.activeProjects,
    receiptRows: aggregate.receiptRows,
    scheduleRows: aggregate.scheduleRows,
  });
  if (
    aggregate.builderRows !== aggregate.castleRows
    || aggregate.missingBuilders !== 0n
    || aggregate.orphanBuilders !== 0n
    || aggregate.invalidBuilders !== 0n
    || aggregate.invalidBuildings !== 0n
    || aggregate.invalidSchedules !== 0n
    || aggregate.builderProjectMismatches !== 0n
    || !activationRowsSafe
    || aggregate.castleRows !== BigInt(attestation.expectedCastleCount)
    || !workerSystemIsReady(ctx)
  ) fail('INNER_KEEP_ACTIVATION_NOT_READY');
  return ctx.db.innerKeepLayoutV1.layoutId.update({
    ...layout,
    active: true,
    // Preserve the first activation as durable lifecycle history. A later
    // deactivate/reactivate cycle must never make this look newly initialized.
    activatedAt: layout.activatedAt ?? ctx.timestamp,
  });
}

export function deactivateInnerKeep(
  ctx: WarpkeepReducerContext,
  capability: string,
): LayoutRow {
  if (capability !== INNER_KEEP_PROTOCOL_CAPABILITY) fail('INNER_KEEP_DEACTIVATION_ATTESTATION_INVALID');
  const layout = assertStaticCatalogExact(ctx);
  if (!layout.active) return layout;
  return ctx.db.innerKeepLayoutV1.layoutId.update({ ...layout, active: false });
}

export type InnerKeepAggregate = Readonly<{
  layoutRows: bigint;
  slotRows: bigint;
  buildingCatalogRows: bigint;
  levelPolicyRows: bigint;
  castleRows: bigint;
  builderRows: bigint;
  buildingRows: bigint;
  activeProjects: bigint;
  receiptRows: bigint;
  scheduleRows: bigint;
  missingBuilders: bigint;
  orphanBuilders: bigint;
  invalidBuilders: bigint;
  invalidBuildings: bigint;
  invalidSchedules: bigint;
  builderProjectMismatches: bigint;
  staticCatalogExact: boolean;
  workerSystemReady: boolean;
  readyForCatalogSeed: boolean;
  readyForBuilderBackfill: boolean;
  readyForActivation: boolean;
  active: boolean;
  policyVersion: string;
  policyDigest: string;
  layoutPolicyVersion: string;
  layoutDigest: string;
  assetCatalogDigest: string;
}>;

/** Counts-only aggregate; no FID, balance, receipt key, or private row payload. */
export function inspectInnerKeep(ctx: WarpkeepReducerContext): InnerKeepAggregate {
  const catalog = staticCatalogState(ctx);
  let missingBuilders = 0n;
  for (const castle of ctx.db.castle.iter()) {
    if (ctx.db.castleInnerBuilderV1.castleId.find(castle.castleId) === null) missingBuilders += 1n;
  }
  let orphanBuilders = 0n;
  let invalidBuilders = 0n;
  let builderProjectMismatches = 0n;
  for (const builder of ctx.db.castleInnerBuilderV1.iter()) {
    const castle = ctx.db.castle.castleId.find(builder.castleId);
    if (castle === null || castle.ownerFid !== builder.fid) {
      orphanBuilders += 1n;
      continue;
    }
    if (!innerKeepBuilderRowMatchesCastle(builder, castle)) invalidBuilders += 1n;
    const project = builder.activeBuildingKey === undefined
      ? undefined
      : ctx.db.castleInnerKeepBuildingV1.buildingKey.find(builder.activeBuildingKey) ?? undefined;
    if (
      (builder.activeBuildingKey === undefined && builder.busyUntilMicros !== undefined)
      || (builder.activeBuildingKey !== undefined && (
        project === undefined
        || project.castleId !== builder.castleId
        || project.phase !== 'constructing'
        || project.completesAtMicros !== builder.busyUntilMicros
      ))
    ) builderProjectMismatches += 1n;
  }
  let invalidBuildings = 0n;
  let activeProjects = 0n;
  for (const building of ctx.db.castleInnerKeepBuildingV1.iter()) {
    if (!buildingRowIsConsistent(ctx, building)) invalidBuildings += 1n;
    const builder = ctx.db.castleInnerBuilderV1.castleId.find(building.castleId);
    const schedules = schedulesForBuilding(ctx, building.buildingKey);
    if (building.phase === 'constructing') {
      activeProjects += 1n;
      const constructingForCastle = buildingRowsForCastle(ctx, building.castleId)
        .filter(row => row.phase === 'constructing');
      if (
        builder === null
        || builder.activeBuildingKey !== building.buildingKey
        || builder.busyUntilMicros !== building.completesAtMicros
        || constructingForCastle.length !== 1
      ) builderProjectMismatches += 1n;
    } else if (
      building.phase === 'complete'
      && (builder?.activeBuildingKey === building.buildingKey || schedules.length !== 0)
    ) builderProjectMismatches += 1n;
  }
  let invalidSchedules = 0n;
  for (const schedule of ctx.db.castleInnerConstructionScheduleV1.iter()) {
    const building = ctx.db.castleInnerKeepBuildingV1.buildingKey.find(schedule.buildingKey);
    if (
      building === null
      || building.phase !== 'constructing'
      || !scheduleMatchesBuilding(schedule, building)
      || schedulesForBuilding(ctx, schedule.buildingKey).length !== 1
    ) invalidSchedules += 1n;
  }
  for (const building of ctx.db.castleInnerKeepBuildingV1.iter()) {
    if (
      building.phase === 'constructing'
      && schedulesForBuilding(ctx, building.buildingKey).length === 0
    ) invalidSchedules += 1n;
  }
  const zeroGameplay = ctx.db.castleInnerKeepBuildingV1.count() === 0n
    && ctx.db.castleInnerBuildReceiptV1.count() === 0n
    && ctx.db.castleInnerConstructionScheduleV1.count() === 0n;
  const allBuildersIdle = [...ctx.db.castleInnerBuilderV1.iter()].every(builder => {
    const castle = ctx.db.castle.castleId.find(builder.castleId);
    return castle !== null && innerKeepBuilderRowIsIdleAndCanonical(builder, castle);
  });
  const buildersReady = missingBuilders === 0n
    && orphanBuilders === 0n
    && invalidBuilders === 0n
    && ctx.db.castleInnerBuilderV1.count() === ctx.db.castle.count();
  const workerReady = workerSystemIsReady(ctx);
  const activationRowsSafe = innerKeepActivationRowsAreSafe({
    previouslyActivated: catalog.layout !== undefined
      && innerKeepActivationLifecycle(catalog.layout) !== 'never-activated',
    buildingRows: ctx.db.castleInnerKeepBuildingV1.count(),
    activeProjects,
    receiptRows: ctx.db.castleInnerBuildReceiptV1.count(),
    scheduleRows: ctx.db.castleInnerConstructionScheduleV1.count(),
  });
  return Object.freeze({
    layoutRows: ctx.db.innerKeepLayoutV1.count(),
    slotRows: ctx.db.innerKeepSlotV1.count(),
    buildingCatalogRows: ctx.db.innerKeepBuildingCatalogV1.count(),
    levelPolicyRows: ctx.db.innerKeepBuildLevelV1.count(),
    castleRows: ctx.db.castle.count(),
    builderRows: ctx.db.castleInnerBuilderV1.count(),
    buildingRows: ctx.db.castleInnerKeepBuildingV1.count(),
    activeProjects,
    receiptRows: ctx.db.castleInnerBuildReceiptV1.count(),
    scheduleRows: ctx.db.castleInnerConstructionScheduleV1.count(),
    missingBuilders,
    orphanBuilders,
    invalidBuilders,
    invalidBuildings,
    invalidSchedules,
    builderProjectMismatches,
    staticCatalogExact: catalog.exact,
    workerSystemReady: workerReady,
    readyForCatalogSeed: ctx.db.innerKeepLayoutV1.count() === 0n
      && ctx.db.innerKeepSlotV1.count() === 0n
      && ctx.db.innerKeepBuildingCatalogV1.count() === 0n
      && ctx.db.innerKeepBuildLevelV1.count() === 0n
      && ctx.db.castleInnerBuilderV1.count() === 0n
      && zeroGameplay,
    readyForBuilderBackfill: catalog.exact
      && catalog.layout !== undefined
      && innerKeepActivationLifecycle(catalog.layout) === 'never-activated'
      && zeroGameplay
      && orphanBuilders === 0n
      && invalidBuilders === 0n
      && allBuildersIdle,
    readyForActivation: catalog.exact
      && !catalog.layout?.active
      && buildersReady
      && allBuildersIdle
      && activationRowsSafe
      && invalidBuildings === 0n
      && invalidSchedules === 0n
      && builderProjectMismatches === 0n
      && workerReady,
    active: catalog.exact && catalog.layout?.active === true,
    policyVersion: INNER_KEEP_POLICY_VERSION,
    policyDigest: INNER_KEEP_POLICY_DIGEST,
    layoutPolicyVersion: INNER_KEEP_LAYOUT_POLICY_VERSION,
    layoutDigest: INNER_KEEP_LAYOUT_DIGEST,
    assetCatalogDigest: INNER_KEEP_ASSET_CATALOG_DIGEST,
  });
}

export function innerKeepErrorCode(error: unknown): string | undefined {
  if (error instanceof InnerKeepAuthorityError) return error.code;
  if (error instanceof InnerKeepBuilderAuthorityError) return error.code;
  if (error instanceof InnerKeepPolicyError) return error.code;
  return undefined;
}

/** Keep entry synchronization failures useful without exposing private graph shape. */
export function innerKeepEntryErrorCode(error: unknown): string | undefined {
  const code = innerKeepErrorCode(error);
  if (
    code === 'INNER_KEEP_UNAVAILABLE'
    || code === 'INNER_KEEP_BACKEND_SYNCHRONIZING'
  ) return code;
  return code === undefined ? undefined : 'INNER_KEEP_STATE_INTEGRITY';
}
