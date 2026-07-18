import type { InferSchema, ReducerCtx } from 'spacetimedb/server';

import {
  ResourceExpeditionReservationAuthorityError,
  activeExpeditionResourceReservations,
  planResourceSettlementForActiveExpeditionReservations,
} from './resourceExpeditionReservationAuthority';
import type {
  ResourceAccountState,
  ResourceSettlementPlan,
} from './resourceAuthorityPolicy';
import type warpkeep from './schema';

type WarpkeepReducerContext = ReducerCtx<InferSchema<typeof warpkeep>>;

/**
 * Legacy v7 import compatibility. New authority callers must use the paired
 * Food+Wood reservation bridge so another active Wood wagon cannot be lost.
 */
export {
  ResourceExpeditionReservationAuthorityError as FoodReservationAuthorityError,
};

export function activeFoodExpeditionReservation(
  ctx: WarpkeepReducerContext,
  fid: bigint,
): bigint {
  return activeExpeditionResourceReservations(ctx, fid).food;
}

/**
 * Compatibility adapter. It is intentionally backed by the paired bridge,
 * not the old Food-only policy, so old imports still preserve Wood capacity.
 */
export function planResourceSettlementForActiveFoodReservation(
  ctx: WarpkeepReducerContext,
  fid: bigint,
  account: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): ResourceSettlementPlan {
  return planResourceSettlementForActiveExpeditionReservations(
    ctx,
    fid,
    account,
    terrainKind,
    observedAtMicros,
  );
}
