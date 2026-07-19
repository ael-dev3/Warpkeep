import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  FOOD_GATHERING_TOTAL_FOOD,
  foodExpeditionStateIsConsistent,
} from './foodExpeditionPolicy';
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

export type ActiveExpeditionResourceReservations = Readonly<{
  food: bigint;
  wood: bigint;
  stone: bigint;
}>;

/**
 * Return exact uncredited thirty-day awards for the caller's active Food and
 * Wood wagons. A returning row has already credited its whole award and thus
 * reserves zero. Independent tables permit one wagon of each resource type.
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
  return Object.freeze({
    food: food === null ? 0n : FOOD_GATHERING_TOTAL_FOOD - food.creditedFood,
    wood: wood === null ? 0n : WOOD_GATHERING_TOTAL_WOOD - wood.creditedWood,
    stone: stone === null ? 0n : STONE_GATHERING_TOTAL_STONE - stone.creditedStone,
  });
}

/**
 * The only authority-facing passive-settlement adapter. Every call derives
 * both reservations from private state and caps each resource field before a
 * delayed Food or Wood lifecycle award can be credited.
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
