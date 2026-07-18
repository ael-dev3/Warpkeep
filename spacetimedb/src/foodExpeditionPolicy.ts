/**
 * Pure server-owned timing, settlement, and capacity rules for a Tier-I
 * Wheat Farm wagon. Browser clocks, paths, and reward values never enter
 * these calculations.
 */
export const FOOD_EXPEDITION_POLICY_VERSION = 'genesis-food-wheat-farm-expedition-v1';
export const FOOD_WAGON_TRAVEL_MICROS_PER_STEP = 30_000_000n;
export const FOOD_GATHER_QUANTUM_MICROS = 60_000_000n;
export const FOOD_GATHER_RATE_PER_QUANTUM = 1n;
export const FOOD_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;
export const FOOD_GATHERING_QUANTA = FOOD_GATHERING_DURATION_MICROS / FOOD_GATHER_QUANTUM_MICROS;
export const FOOD_GATHERING_TOTAL_FOOD = FOOD_GATHERING_QUANTA * FOOD_GATHER_RATE_PER_QUANTUM;
export const FOOD_EXPEDITION_U64_MAX = (1n << 64n) - 1n;

export type FoodExpeditionPhaseV1 = 'outbound' | 'gathering' | 'returning';

export type FoodExpeditionTimelineV1 = Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type FoodExpeditionAccrualStateV1 = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedFood: bigint;
  creditedFood: bigint;
  policyVersion: string;
}>;

export type FoodExpeditionAccrualPlanV1 = Readonly<{
  accruedFood: bigint;
  newlyAccruedFood: bigint;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

export class FoodExpeditionPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'FoodExpeditionPolicyError';
  }
}

function fail(code: string): never {
  throw new FoodExpeditionPolicyError(code);
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= FOOD_EXPEDITION_U64_MAX;
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (!isU64(value)) fail(code);
}

function checkedSum(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || right > FOOD_EXPEDITION_U64_MAX - left) fail(code);
  return left + right;
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || (left !== 0n && right > FOOD_EXPEDITION_U64_MAX / left)) {
    fail(code);
  }
  return left * right;
}

function isPhase(value: string): value is FoodExpeditionPhaseV1 {
  return value === 'outbound' || value === 'gathering' || value === 'returning';
}

/** A browser-created UUID-like idempotency key, bounded before persistence. */
export function assertFoodExpeditionIdempotencyKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{15,79}$/.test(value)) {
    fail('FOOD_EXPEDITION_IDEMPOTENCY_KEY_INVALID');
  }
}

/**
 * Compute timestamps exclusively from the canonical passable-route length.
 * One map step takes thirty seconds, followed by exactly thirty days at the
 * Wheat Farm and the same deterministic return journey.
 */
export function planFoodExpeditionTimeline(
  startedAtMicros: bigint,
  routeSteps: number,
): FoodExpeditionTimelineV1 {
  assertU64(startedAtMicros, 'FOOD_EXPEDITION_START_TIME_INVALID');
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) {
    fail('FOOD_EXPEDITION_ROUTE_INVALID');
  }
  const travelMicros = checkedProduct(
    BigInt(routeSteps),
    FOOD_WAGON_TRAVEL_MICROS_PER_STEP,
    'FOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const arrivesAtMicros = checkedSum(
    startedAtMicros,
    travelMicros,
    'FOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const gatheringEndsAtMicros = checkedSum(
    arrivesAtMicros,
    FOOD_GATHERING_DURATION_MICROS,
    'FOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const returnsAtMicros = checkedSum(
    gatheringEndsAtMicros,
    travelMicros,
    'FOOD_EXPEDITION_TIME_OVERFLOW',
  );
  return Object.freeze({
    startedAtMicros,
    arrivesAtMicros,
    gatheringEndsAtMicros,
    returnsAtMicros,
  });
}

/** Validate persisted Food state before using it for an inventory credit. */
export function foodExpeditionStateIsConsistent(
  state: FoodExpeditionAccrualStateV1,
): boolean {
  if (
    state.policyVersion !== FOOD_EXPEDITION_POLICY_VERSION
    || !isPhase(state.phase)
    || !isU64(state.startedAtMicros)
    || !isU64(state.arrivesAtMicros)
    || !isU64(state.gatheringEndsAtMicros)
    || !isU64(state.returnsAtMicros)
    || !isU64(state.settledThroughMicros)
    || !isU64(state.accruedFood)
    || !isU64(state.creditedFood)
  ) return false;
  const timelineIsConsistent = state.startedAtMicros < state.arrivesAtMicros
    && state.arrivesAtMicros < state.gatheringEndsAtMicros
    && state.gatheringEndsAtMicros < state.returnsAtMicros
    && state.arrivesAtMicros <= state.settledThroughMicros
    && state.settledThroughMicros <= state.gatheringEndsAtMicros
    && state.creditedFood <= state.accruedFood
    && state.accruedFood <= FOOD_GATHERING_TOTAL_FOOD;
  if (!timelineIsConsistent) return false;
  // `returning` is written only by the same transaction that settles the
  // fixed deadline and releases the Food reservation. A partial returning
  // row would otherwise create an ambiguous reserve after the site opens.
  return state.phase !== 'returning'
    || (
      state.accruedFood === FOOD_GATHERING_TOTAL_FOOD
      && state.creditedFood === FOOD_GATHERING_TOTAL_FOOD
    );
}

/**
 * Calculate whole-minute Food output through the lesser of server time and
 * the fixed expiry. The authority writes only on collection and lifecycle
 * transitions, never once per minute.
 */
export function planFoodExpeditionAccrual(
  state: FoodExpeditionAccrualStateV1,
  observedAtMicros: bigint,
): FoodExpeditionAccrualPlanV1 {
  if (!foodExpeditionStateIsConsistent(state)) fail('FOOD_EXPEDITION_STATE_INVALID');
  assertU64(observedAtMicros, 'FOOD_EXPEDITION_OBSERVED_TIME_INVALID');
  const ceiling = observedAtMicros < state.gatheringEndsAtMicros
    ? observedAtMicros
    : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({
      accruedFood: state.accruedFood,
      newlyAccruedFood: 0n,
      completedQuanta: 0n,
      settledThroughMicros: state.settledThroughMicros,
    });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / FOOD_GATHER_QUANTUM_MICROS;
  const elapsedWholeMicros = checkedProduct(
    completedQuanta,
    FOOD_GATHER_QUANTUM_MICROS,
    'FOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const settledThroughMicros = checkedSum(
    state.settledThroughMicros,
    elapsedWholeMicros,
    'FOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const newlyAccruedFood = checkedProduct(
    completedQuanta,
    FOOD_GATHER_RATE_PER_QUANTUM,
    'FOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const accruedFood = checkedSum(
    state.accruedFood,
    newlyAccruedFood,
    'FOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  if (accruedFood > FOOD_GATHERING_TOTAL_FOOD) fail('FOOD_EXPEDITION_ACCRUAL_CAP');
  return Object.freeze({
    accruedFood,
    newlyAccruedFood,
    completedQuanta,
    settledThroughMicros,
  });
}

/**
 * Reserve the complete remaining Wheat Farm award against the uncapped
 * passive Food projection at the gathering deadline. Unlike Gold (whose
 * passive rate is deliberately zero), Food capacity must include every
 * ten-minute passive Food quantum through the full thirty-day lease.
 */
export function assertFoodExpeditionCapacity(
  projectedFoodAtGatheringEnd: bigint,
  creditedFood: bigint,
  resourceBalanceCap: bigint,
): void {
  if (
    !isU64(projectedFoodAtGatheringEnd)
    || !isU64(creditedFood)
    || !isU64(resourceBalanceCap)
    || creditedFood > FOOD_GATHERING_TOTAL_FOOD
  ) fail('FOOD_EXPEDITION_ACCOUNT_STATE_INVALID');
  if (projectedFoodAtGatheringEnd > resourceBalanceCap) {
    fail('FOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const remainingAward = FOOD_GATHERING_TOTAL_FOOD - creditedFood;
  if (remainingAward > resourceBalanceCap - projectedFoodAtGatheringEnd) {
    fail('FOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
}
