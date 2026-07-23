import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  CASTLE_WORKERS_PER_CASTLE,
  type WorkerResourceKind,
  workerNodeKey,
  workerResourcePolicy,
} from './castleWorkerPolicy';
import {
  CASTLE_WORKER_MAX_CASTLES,
  legacyDispatchWorkerStateBlocker,
  planDeterministicWorkerBackfill,
  workerRolloutPhaseAt,
} from './castleWorkerRolloutPolicy';

import {
  FOOD_GATHERING_TOTAL_FOOD,
  foodExpeditionStateIsConsistent,
} from './foodExpeditionPolicy';
import {
  GOLD_GATHERING_TOTAL_GOLD,
  goldExpeditionStateIsConsistent,
} from './goldExpeditionPolicy';
import {
  WOOD_GATHERING_TOTAL_WOOD,
  woodExpeditionStateIsConsistent,
} from './woodExpeditionPolicy';
import {
  STONE_GATHERING_TOTAL_STONE,
  stoneExpeditionStateIsConsistent,
} from './stoneExpeditionPolicy';
import {
  type ResourceAccountState,
  type ResourceSettlementPlan,
  planResourceSettlementWithExpeditionReservations,
} from './resourceAuthorityPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * The private bridge between active expeditions and generic passive-resource
 * settlement. It exposes only remaining aggregate capacity, never a site,
 * route, expedition id, or caller identity to a public projection.
 */
export class ResourceExpeditionReservationAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ResourceExpeditionReservationAuthorityError';
  }
}

function fail(code: string): never {
  throw new ResourceExpeditionReservationAuthorityError(code);
}

function boundedRows<Row>(
  rows: Iterable<Row>,
  maximum: number,
): readonly Row[] {
  const result: Row[] = [];
  for (const row of rows) {
    if (result.length >= maximum) {
      fail('WORKER_PREACTIVATION_STATE_INVALID');
    }
    result.push(row);
  }
  return result;
}

export type ActiveExpeditionResourceReservations = Readonly<{
  food: bigint;
  wood: bigint;
  stone: bigint;
  gold: bigint;
}>;

/**
 * Legacy creation closes at the explicit drain boundary, not only after
 * generic activation. Existing rows keep their unchanged scheduled lifecycle.
 */
export function assertLegacyExpeditionDispatchAllowed(
  ctx: WarpkeepReducerContext,
  resourceKind: WorkerResourceKind,
  siteId: string,
): void {
  const workerSystem = ctx.db.realmWorkerSystemV1.realmId.find('GENESIS_001');
  const phase = workerRolloutPhaseAt(
    workerSystem,
    ctx.db.realmWorkerSystemV1.count(),
    ctx.timestamp.microsSinceUnixEpoch,
  );
  if (phase === 'draining' || phase === 'active') {
    fail('LEGACY_EXPEDITION_DISPATCH_RETIRED');
  }
  if (phase === 'invalid') fail('WORKER_SYSTEM_INTEGRITY');

  const nodeKey = workerNodeKey(resourceKind, siteId);
  const workerCount = ctx.db.castleWorkerV1.count();
  const maximumWorkerRows = BigInt(
    CASTLE_WORKER_MAX_CASTLES * CASTLE_WORKERS_PER_CASTLE,
  );
  const actualCastleCount = ctx.db.castle.count();
  let rosterDigestMatches = phase === 'absent';
  let wholeCastleWorkerSubset = phase === 'absent' && workerCount === 0n;
  let invalidWorkerRows = 0n;
  if (phase === 'staged') {
    if (
      actualCastleCount > BigInt(CASTLE_WORKER_MAX_CASTLES)
      || workerCount > maximumWorkerRows
    ) {
      invalidWorkerRows = 1n;
    } else {
      const castleIds = boundedRows(
        ctx.db.castle.iter(),
        CASTLE_WORKER_MAX_CASTLES,
      ).map(castle => castle.castleId);
      const workerRows = boundedRows(
        ctx.db.castleWorkerV1.iter(),
        CASTLE_WORKER_MAX_CASTLES * CASTLE_WORKERS_PER_CASTLE,
      );
      if (
        BigInt(castleIds.length) !== actualCastleCount
        || BigInt(workerRows.length) !== workerCount
      ) {
        invalidWorkerRows = 1n;
      } else {
        try {
          const plan = planDeterministicWorkerBackfill(castleIds, workerRows);
          rosterDigestMatches =
            plan.expectedCastleCount === workerSystem?.expectedCastleCount
            && plan.expectedWorkerCount === workerSystem?.expectedWorkerCount
            && plan.rosterDigest === workerSystem?.rosterDigest;
          wholeCastleWorkerSubset = true;
        } catch {
          invalidWorkerRows = 1n;
        }
      }
    }
  }
  const blocker = legacyDispatchWorkerStateBlocker({
    phase,
    exactGenericNodeOccupied:
      ctx.db.workerNodeOccupationV1.nodeKey.find(nodeKey) !== null,
    genericAssignments: ctx.db.workerAssignmentV1.count(),
    genericOccupations: ctx.db.workerNodeOccupationV1.count(),
    genericSchedules: ctx.db.workerAssignmentScheduleV1.count(),
    genericCommandReceipts: ctx.db.workerCommandIdempotencyV1.count(),
    workerCount,
    actualCastleCount,
    expectedCastleCount: workerSystem?.expectedCastleCount ?? 0,
    expectedWorkerCount: workerSystem?.expectedWorkerCount ?? 0,
    rosterDigestMatches,
    wholeCastleWorkerSubset,
    invalidWorkerRows,
  });
  if (blocker !== undefined) fail(blocker);
}

/**
 * Return exact uncredited thirty-day awards for every active legacy wagon and
 * generic assignment. A returning row has already credited its whole award and
 * thus reserves zero. Independent tables permit one legacy wagon of each
 * resource type while generic workers add their own private reservations.
 */
export function activeExpeditionResourceReservations(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): ActiveExpeditionResourceReservations {
  const food = ctx.db.foodExpeditionV1.fid.find(fid);
  if (food !== null && !foodExpeditionStateIsConsistent(food)) {
    fail('FOOD_EXPEDITION_RESERVATION_STATE_INVALID');
  }
  const wood = ctx.db.woodExpeditionV1.fid.find(fid);
  if (wood !== null && !woodExpeditionStateIsConsistent(wood)) {
    fail('WOOD_EXPEDITION_RESERVATION_STATE_INVALID');
  }
  const stone = ctx.db.stoneExpeditionV1.fid.find(fid);
  if (stone !== null && !stoneExpeditionStateIsConsistent(stone)) {
    fail('STONE_EXPEDITION_RESERVATION_STATE_INVALID');
  }
  const gold = ctx.db.goldExpeditionV1.fid.find(fid);
  if (gold !== null && !goldExpeditionStateIsConsistent(gold)) {
    fail('GOLD_EXPEDITION_RESERVATION_STATE_INVALID');
  }
  let foodReservation = food === null ? 0n : FOOD_GATHERING_TOTAL_FOOD - food.creditedFood;
  let woodReservation = wood === null ? 0n : WOOD_GATHERING_TOTAL_WOOD - wood.creditedWood;
  let stoneReservation = stone === null ? 0n : STONE_GATHERING_TOTAL_STONE - stone.creditedStone;
  let goldReservation = gold === null ? 0n : GOLD_GATHERING_TOTAL_GOLD - gold.creditedGold;
  let workerAssignmentCount = 0;
  for (const assignment of ctx.db.workerAssignmentV1.byFid.filter(fid)) {
    workerAssignmentCount += 1;
    if (workerAssignmentCount > CASTLE_WORKERS_PER_CASTLE) {
      fail('WORKER_ASSIGNMENT_LIMIT');
    }
    if (assignment.phase === 'returning') continue;
    const total = workerResourcePolicy(assignment.resourceKind).gatheringTotal;
    // Reserve the complete remaining award, not only the currently accrued
    // amount. This leaves room for lazy server-time settlement to materialize
    // the exact future output without truncation.
    const fullRemaining = total - assignment.materializedAmount;
    if (fullRemaining < 0n) throw new ResourceExpeditionReservationAuthorityError('WORKER_RESERVATION_INVALID');
    if (assignment.resourceKind === 'food') foodReservation += fullRemaining;
    if (assignment.resourceKind === 'wood') woodReservation += fullRemaining;
    if (assignment.resourceKind === 'stone') stoneReservation += fullRemaining;
    if (assignment.resourceKind === 'gold') goldReservation += fullRemaining;
  }
  return Object.freeze({ food: foodReservation, wood: woodReservation, stone: stoneReservation, gold: goldReservation });
}

/**
 * The only authority-facing passive-settlement adapter. Every call derives
 * all reservations from private state and caps each resource field before a
 * delayed Food, Wood, or Stone lifecycle award can be credited.
 */
export function planResourceSettlementForActiveExpeditionReservations(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  account: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): ResourceSettlementPlan {
  return planResourceSettlementWithExpeditionReservations(
    account,
    terrainKind,
    observedAtMicros,
    activeExpeditionResourceReservations(ctx, fid),
  );
}
