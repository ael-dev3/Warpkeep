import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  foodExpeditionErrorCode,
  returnActiveFoodExpedition,
} from './foodExpeditionAuthority';
import {
  goldExpeditionErrorCode,
  returnActiveGoldExpedition,
} from './goldExpeditionAuthority';
import {
  stoneExpeditionErrorCode,
  returnActiveStoneExpedition,
} from './stoneExpeditionAuthority';
import {
  woodExpeditionErrorCode,
  returnActiveWoodExpedition,
} from './woodExpeditionAuthority';
import type { WorkerResourceKind } from './castleWorkerPolicy';
import {
  CASTLE_WORKER_MAX_CASTLES,
  workerRolloutPhaseAt,
} from './castleWorkerRolloutPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

export const WORKER_LEGACY_DRAIN_CAPABILITY =
  'genesis-001-worker-legacy-drain-v1';

const MAX_LEGACY_EXPEDITIONS_PER_RESOURCE = CASTLE_WORKER_MAX_CASTLES;
const MAX_LEGACY_OCCUPATIONS_PER_RESOURCE = CASTLE_WORKER_MAX_CASTLES;
const MAX_LEGACY_SCHEDULES_PER_RESOURCE =
  CASTLE_WORKER_MAX_CASTLES * 3;
const BOUNDED_ERROR_CODE = /^[A-Z][A-Z0-9_]{0,63}$/;

export class LegacyExpeditionReturnAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'LegacyExpeditionReturnAuthorityError';
  }
}

function fail(code: string): never {
  throw new LegacyExpeditionReturnAuthorityError(code);
}

export type LegacyExpeditionEarlyReturnResult = Readonly<{
  resourceKind: WorkerResourceKind;
  returned: boolean;
  creditedAmount: bigint;
  schedulesRemoved: number;
}>;

/**
 * One caller-bound early-return boundary for all retired wagon types. Each
 * resource authority independently verifies ownership and the exact matching
 * expedition, occupation, and schedule graph before it mutates anything.
 */
export function returnActiveLegacyExpedition(
  ctx: WarpkeepReducerContext,
  input: Readonly<{
    fid: bigint;
    resourceKind: WorkerResourceKind;
    expeditionId: string;
  }>,
): LegacyExpeditionEarlyReturnResult {
  const system = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  const phase = workerRolloutPhaseAt(
    system,
    ctx.db.realmWorkerSystemV1.count(),
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (phase !== 'draining') fail('WORKER_LEGACY_DRAIN_PHASE_INVALID');
  if (input.resourceKind === 'gold') {
    const result = returnActiveGoldExpedition(ctx, input.fid, input.expeditionId);
    return Object.freeze({
      resourceKind: input.resourceKind,
      returned: result.returned,
      creditedAmount: result.creditedGold,
      schedulesRemoved: result.schedulesRemoved,
    });
  }
  if (input.resourceKind === 'food') {
    const result = returnActiveFoodExpedition(ctx, input.fid, input.expeditionId);
    return Object.freeze({
      resourceKind: input.resourceKind,
      returned: result.returned,
      creditedAmount: result.creditedFood,
      schedulesRemoved: result.schedulesRemoved,
    });
  }
  if (input.resourceKind === 'wood') {
    const result = returnActiveWoodExpedition(ctx, input.fid, input.expeditionId);
    return Object.freeze({
      resourceKind: input.resourceKind,
      returned: result.returned,
      creditedAmount: result.creditedWood,
      schedulesRemoved: result.schedulesRemoved,
    });
  }
  if (input.resourceKind === 'stone') {
    const result = returnActiveStoneExpedition(ctx, input.fid, input.expeditionId);
    return Object.freeze({
      resourceKind: input.resourceKind,
      returned: result.returned,
      creditedAmount: result.creditedStone,
      schedulesRemoved: result.schedulesRemoved,
    });
  }
  return fail('LEGACY_EXPEDITION_RESOURCE_KIND_INVALID');
}

export type WorkerLegacyDrainCounts = Readonly<{
  goldExpeditions: number;
  foodExpeditions: number;
  woodExpeditions: number;
  stoneExpeditions: number;
  goldOccupations: number;
  foodOccupations: number;
  woodOccupations: number;
  stoneOccupations: number;
  goldSchedules: number;
  foodSchedules: number;
  woodSchedules: number;
  stoneSchedules: number;
}>;

export type WorkerLegacyDrainAttestation = WorkerLegacyDrainCounts & Readonly<{
  capability: string;
}>;

export type WorkerLegacyDrainResult = Readonly<{
  completed: boolean;
  returnedExpeditions: number;
  removedSchedules: number;
  creditedGold: bigint;
  creditedFood: bigint;
  creditedWood: bigint;
  creditedStone: bigint;
  before: WorkerLegacyDrainCounts;
  after: WorkerLegacyDrainCounts;
  cutoverAtMicros: bigint;
}>;

function safeCount(value: bigint, maximum: number): number {
  if (value < 0n || value > BigInt(maximum)) {
    fail('WORKER_LEGACY_DRAIN_CAPACITY');
  }
  return Number(value);
}

export function inspectWorkerLegacyDrainCounts(
  ctx: WarpkeepReducerContext,
): WorkerLegacyDrainCounts {
  return Object.freeze({
    goldExpeditions: safeCount(
      ctx.db.goldExpeditionV1.count(),
      MAX_LEGACY_EXPEDITIONS_PER_RESOURCE,
    ),
    foodExpeditions: safeCount(
      ctx.db.foodExpeditionV1.count(),
      MAX_LEGACY_EXPEDITIONS_PER_RESOURCE,
    ),
    woodExpeditions: safeCount(
      ctx.db.woodExpeditionV1.count(),
      MAX_LEGACY_EXPEDITIONS_PER_RESOURCE,
    ),
    stoneExpeditions: safeCount(
      ctx.db.stoneExpeditionV1.count(),
      MAX_LEGACY_EXPEDITIONS_PER_RESOURCE,
    ),
    goldOccupations: safeCount(
      ctx.db.goldNodeOccupationV1.count(),
      MAX_LEGACY_OCCUPATIONS_PER_RESOURCE,
    ),
    foodOccupations: safeCount(
      ctx.db.foodNodeOccupationV1.count(),
      MAX_LEGACY_OCCUPATIONS_PER_RESOURCE,
    ),
    woodOccupations: safeCount(
      ctx.db.woodNodeOccupationV1.count(),
      MAX_LEGACY_OCCUPATIONS_PER_RESOURCE,
    ),
    stoneOccupations: safeCount(
      ctx.db.stoneNodeOccupationV1.count(),
      MAX_LEGACY_OCCUPATIONS_PER_RESOURCE,
    ),
    goldSchedules: safeCount(
      ctx.db.goldExpeditionScheduleV1.count(),
      MAX_LEGACY_SCHEDULES_PER_RESOURCE,
    ),
    foodSchedules: safeCount(
      ctx.db.foodExpeditionScheduleV1.count(),
      MAX_LEGACY_SCHEDULES_PER_RESOURCE,
    ),
    woodSchedules: safeCount(
      ctx.db.woodExpeditionScheduleV1.count(),
      MAX_LEGACY_SCHEDULES_PER_RESOURCE,
    ),
    stoneSchedules: safeCount(
      ctx.db.stoneExpeditionScheduleV1.count(),
      MAX_LEGACY_SCHEDULES_PER_RESOURCE,
    ),
  });
}

function countsAreZero(counts: WorkerLegacyDrainCounts): boolean {
  return Object.values(counts).every(value => value === 0);
}

function countsMatch(
  counts: WorkerLegacyDrainCounts,
  expected: WorkerLegacyDrainCounts,
): boolean {
  return (Object.keys(counts) as (keyof WorkerLegacyDrainCounts)[])
    .every(key => counts[key] === expected[key]);
}

function boundedExpeditions<Row>(
  rows: Iterable<Row>,
  expectedCount: number,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= MAX_LEGACY_EXPEDITIONS_PER_RESOURCE) {
      fail('WORKER_LEGACY_DRAIN_CAPACITY');
    }
    result.push(row);
  }
  if (result.length !== expectedCount) fail('WORKER_LEGACY_DRAIN_STATE_CHANGED');
  return Object.freeze(result);
}

/**
 * Final, separately attested cutover. The first application must match every
 * reviewed per-table count. A lost-response retry over the already-empty
 * draining graph is a no-op, while any partial, malformed, or changed graph
 * fails the surrounding transaction closed.
 */
export function completeWorkerLegacyDrain(
  ctx: WarpkeepReducerContext,
  attestation: WorkerLegacyDrainAttestation,
): WorkerLegacyDrainResult {
  if (attestation.capability !== WORKER_LEGACY_DRAIN_CAPABILITY) {
    fail('WORKER_LEGACY_DRAIN_CAPABILITY_MISMATCH');
  }
  const system = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  const phase = workerRolloutPhaseAt(
    system,
    ctx.db.realmWorkerSystemV1.count(),
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (phase !== 'draining') fail('WORKER_LEGACY_DRAIN_PHASE_INVALID');

  const before = inspectWorkerLegacyDrainCounts(ctx);
  if (countsAreZero(before)) {
    return Object.freeze({
      completed: false,
      returnedExpeditions: 0,
      removedSchedules: 0,
      creditedGold: 0n,
      creditedFood: 0n,
      creditedWood: 0n,
      creditedStone: 0n,
      before,
      after: before,
      cutoverAtMicros: ctx.timestamp.microsSinceUnixEpoch,
    });
  }
  const expected: WorkerLegacyDrainCounts = Object.freeze({
    goldExpeditions: attestation.goldExpeditions,
    foodExpeditions: attestation.foodExpeditions,
    woodExpeditions: attestation.woodExpeditions,
    stoneExpeditions: attestation.stoneExpeditions,
    goldOccupations: attestation.goldOccupations,
    foodOccupations: attestation.foodOccupations,
    woodOccupations: attestation.woodOccupations,
    stoneOccupations: attestation.stoneOccupations,
    goldSchedules: attestation.goldSchedules,
    foodSchedules: attestation.foodSchedules,
    woodSchedules: attestation.woodSchedules,
    stoneSchedules: attestation.stoneSchedules,
  });
  if (!countsMatch(before, expected)) fail('WORKER_LEGACY_DRAIN_COUNT_MISMATCH');

  const gold = boundedExpeditions(
    ctx.db.goldExpeditionV1.iter(),
    before.goldExpeditions,
  );
  const food = boundedExpeditions(
    ctx.db.foodExpeditionV1.iter(),
    before.foodExpeditions,
  );
  const wood = boundedExpeditions(
    ctx.db.woodExpeditionV1.iter(),
    before.woodExpeditions,
  );
  const stone = boundedExpeditions(
    ctx.db.stoneExpeditionV1.iter(),
    before.stoneExpeditions,
  );
  let returnedExpeditions = 0;
  let removedSchedules = 0;
  let creditedGold = 0n;
  let creditedFood = 0n;
  let creditedWood = 0n;
  let creditedStone = 0n;
  for (const expedition of gold) {
    const result = returnActiveGoldExpedition(ctx, expedition.fid, expedition.expeditionId);
    if (!result.returned) fail('WORKER_LEGACY_DRAIN_STATE_CHANGED');
    returnedExpeditions += 1;
    removedSchedules += result.schedulesRemoved;
    creditedGold += result.creditedGold;
  }
  for (const expedition of food) {
    const result = returnActiveFoodExpedition(ctx, expedition.fid, expedition.expeditionId);
    if (!result.returned) fail('WORKER_LEGACY_DRAIN_STATE_CHANGED');
    returnedExpeditions += 1;
    removedSchedules += result.schedulesRemoved;
    creditedFood += result.creditedFood;
  }
  for (const expedition of wood) {
    const result = returnActiveWoodExpedition(ctx, expedition.fid, expedition.expeditionId);
    if (!result.returned) fail('WORKER_LEGACY_DRAIN_STATE_CHANGED');
    returnedExpeditions += 1;
    removedSchedules += result.schedulesRemoved;
    creditedWood += result.creditedWood;
  }
  for (const expedition of stone) {
    const result = returnActiveStoneExpedition(ctx, expedition.fid, expedition.expeditionId);
    if (!result.returned) fail('WORKER_LEGACY_DRAIN_STATE_CHANGED');
    returnedExpeditions += 1;
    removedSchedules += result.schedulesRemoved;
    creditedStone += result.creditedStone;
  }

  const after = inspectWorkerLegacyDrainCounts(ctx);
  if (!countsAreZero(after)) fail('WORKER_LEGACY_DRAIN_INCOMPLETE');
  return Object.freeze({
    completed: true,
    returnedExpeditions,
    removedSchedules,
    creditedGold,
    creditedFood,
    creditedWood,
    creditedStone,
    before,
    after,
    cutoverAtMicros: ctx.timestamp.microsSinceUnixEpoch,
  });
}

export function legacyExpeditionReturnErrorCode(
  error: unknown,
): string | undefined {
  const code = error instanceof LegacyExpeditionReturnAuthorityError
    ? error.code
    : goldExpeditionErrorCode(error)
      ?? foodExpeditionErrorCode(error)
      ?? woodExpeditionErrorCode(error)
      ?? stoneExpeditionErrorCode(error);
  return code !== undefined && BOUNDED_ERROR_CODE.test(code) ? code : undefined;
}
