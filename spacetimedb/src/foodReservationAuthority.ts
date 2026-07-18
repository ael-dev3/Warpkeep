import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  FOOD_GATHERING_TOTAL_FOOD,
  foodExpeditionStateIsConsistent,
} from './foodExpeditionPolicy';
import {
  type ResourceAccountState,
  type ResourceSettlementPlan,
  planResourceSettlementWithFoodReservation,
} from './resourceAuthorityPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * Small neutral bridge between private Food-wagon state and the generic
 * resource policy. Keeping it separate prevents a resource-policy ↔ Food
 * authority cycle while ensuring every passive settlement path sees the same
 * remaining-award reservation.
 */
export class FoodReservationAuthorityError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FoodReservationAuthorityError';
  }
}

function fail(code: string): never {
  throw new FoodReservationAuthorityError(code);
}

/**
 * Return the exact uncredited 30-day Food award for the caller's private
 * wagon. A returning wagon with the complete award already credited reserves
 * zero, allowing normal passive Food production during its trip home.
 */
export function activeFoodExpeditionReservation(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): bigint {
  const expedition = ctx.db.foodExpeditionV1.fid.find(fid);
  if (expedition === null) return 0n;
  if (!foodExpeditionStateIsConsistent(expedition)) {
    fail('FOOD_EXPEDITION_RESERVATION_STATE_INVALID');
  }
  return FOOD_GATHERING_TOTAL_FOOD - expedition.creditedFood;
}

/**
 * The only authority-facing passive settlement adapter. Every caller passes
 * server-owned account, terrain, time, and FID; this function loads no public
 * browser state and caps Food below the exact remaining expedition award.
 */
export function planResourceSettlementForActiveFoodReservation(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  account: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): ResourceSettlementPlan {
  return planResourceSettlementWithFoodReservation(
    account,
    terrainKind,
    observedAtMicros,
    activeFoodExpeditionReservation(ctx, fid),
  );
}
