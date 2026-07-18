/**
 * Pure server-owned timing, settlement, and capacity rules for a Tier-I
 * Logging Camp wagon. Browser clocks, paths, and reward values never enter
 * these calculations.
 */
export const WOOD_EXPEDITION_POLICY_VERSION = 'genesis-wood-logging-camp-expedition-v1';
export const WOOD_WAGON_TRAVEL_MICROS_PER_STEP = 30_000_000n;
export const WOOD_GATHER_QUANTUM_MICROS = 60_000_000n;
export const WOOD_GATHER_RATE_PER_QUANTUM = 1n;
export const WOOD_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;
export const WOOD_GATHERING_QUANTA = WOOD_GATHERING_DURATION_MICROS / WOOD_GATHER_QUANTUM_MICROS;
export const WOOD_GATHERING_TOTAL_WOOD = WOOD_GATHERING_QUANTA * WOOD_GATHER_RATE_PER_QUANTUM;
export const WOOD_EXPEDITION_U64_MAX = (1n << 64n) - 1n;

export type WoodExpeditionPhaseV1 = 'outbound' | 'gathering' | 'returning';

export type WoodExpeditionTimelineV1 = Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type WoodExpeditionAccrualStateV1 = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedWood: bigint;
  creditedWood: bigint;
  policyVersion: string;
}>;

export type WoodExpeditionAccrualPlanV1 = Readonly<{
  accruedWood: bigint;
  newlyAccruedWood: bigint;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

export class WoodExpeditionPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'WoodExpeditionPolicyError';
  }
}

function fail(code: string): never {
  throw new WoodExpeditionPolicyError(code);
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= WOOD_EXPEDITION_U64_MAX;
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (!isU64(value)) fail(code);
}

function checkedSum(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || right > WOOD_EXPEDITION_U64_MAX - left) fail(code);
  return left + right;
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || (left !== 0n && right > WOOD_EXPEDITION_U64_MAX / left)) {
    fail(code);
  }
  return left * right;
}

function isPhase(value: string): value is WoodExpeditionPhaseV1 {
  return value === 'outbound' || value === 'gathering' || value === 'returning';
}

/** A browser-created UUID-like idempotency key, bounded before persistence. */
export function assertWoodExpeditionIdempotencyKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{15,79}$/.test(value)) {
    fail('WOOD_EXPEDITION_IDEMPOTENCY_KEY_INVALID');
  }
}

/**
 * Compute timestamps exclusively from the canonical passable-route length.
 * One map step takes thirty seconds, followed by exactly thirty days at the
 * Logging Camp and the same deterministic return journey.
 */
export function planWoodExpeditionTimeline(
  startedAtMicros: bigint,
  routeSteps: number,
): WoodExpeditionTimelineV1 {
  assertU64(startedAtMicros, 'WOOD_EXPEDITION_START_TIME_INVALID');
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) {
    fail('WOOD_EXPEDITION_ROUTE_INVALID');
  }
  const travelMicros = checkedProduct(
    BigInt(routeSteps),
    WOOD_WAGON_TRAVEL_MICROS_PER_STEP,
    'WOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const arrivesAtMicros = checkedSum(
    startedAtMicros,
    travelMicros,
    'WOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const gatheringEndsAtMicros = checkedSum(
    arrivesAtMicros,
    WOOD_GATHERING_DURATION_MICROS,
    'WOOD_EXPEDITION_TIME_OVERFLOW',
  );
  const returnsAtMicros = checkedSum(
    gatheringEndsAtMicros,
    travelMicros,
    'WOOD_EXPEDITION_TIME_OVERFLOW',
  );
  return Object.freeze({
    startedAtMicros,
    arrivesAtMicros,
    gatheringEndsAtMicros,
    returnsAtMicros,
  });
}

/** Validate persisted Wood state before using it for an inventory credit. */
export function woodExpeditionStateIsConsistent(
  state: WoodExpeditionAccrualStateV1,
): boolean {
  if (
    state.policyVersion !== WOOD_EXPEDITION_POLICY_VERSION
    || !isPhase(state.phase)
    || !isU64(state.startedAtMicros)
    || !isU64(state.arrivesAtMicros)
    || !isU64(state.gatheringEndsAtMicros)
    || !isU64(state.returnsAtMicros)
    || !isU64(state.settledThroughMicros)
    || !isU64(state.accruedWood)
    || !isU64(state.creditedWood)
  ) return false;
  const timelineIsConsistent = state.startedAtMicros < state.arrivesAtMicros
    && state.arrivesAtMicros < state.gatheringEndsAtMicros
    && state.gatheringEndsAtMicros < state.returnsAtMicros
    && state.arrivesAtMicros <= state.settledThroughMicros
    && state.settledThroughMicros <= state.gatheringEndsAtMicros
    && state.creditedWood <= state.accruedWood
    && state.accruedWood <= WOOD_GATHERING_TOTAL_WOOD;
  if (!timelineIsConsistent) return false;
  // `returning` is written only by the same transaction that settles the
  // fixed deadline and releases the Wood reservation. A partial returning
  // row would otherwise create an ambiguous reserve after the site opens.
  return state.phase !== 'returning'
    || (
      state.accruedWood === WOOD_GATHERING_TOTAL_WOOD
      && state.creditedWood === WOOD_GATHERING_TOTAL_WOOD
    );
}

/**
 * Calculate whole-minute Wood output through the lesser of server time and
 * the fixed expiry. The authority writes only on collection and lifecycle
 * transitions, never once per minute.
 */
export function planWoodExpeditionAccrual(
  state: WoodExpeditionAccrualStateV1,
  observedAtMicros: bigint,
): WoodExpeditionAccrualPlanV1 {
  if (!woodExpeditionStateIsConsistent(state)) fail('WOOD_EXPEDITION_STATE_INVALID');
  assertU64(observedAtMicros, 'WOOD_EXPEDITION_OBSERVED_TIME_INVALID');
  const ceiling = observedAtMicros < state.gatheringEndsAtMicros
    ? observedAtMicros
    : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({
      accruedWood: state.accruedWood,
      newlyAccruedWood: 0n,
      completedQuanta: 0n,
      settledThroughMicros: state.settledThroughMicros,
    });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / WOOD_GATHER_QUANTUM_MICROS;
  const elapsedWholeMicros = checkedProduct(
    completedQuanta,
    WOOD_GATHER_QUANTUM_MICROS,
    'WOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const settledThroughMicros = checkedSum(
    state.settledThroughMicros,
    elapsedWholeMicros,
    'WOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const newlyAccruedWood = checkedProduct(
    completedQuanta,
    WOOD_GATHER_RATE_PER_QUANTUM,
    'WOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const accruedWood = checkedSum(
    state.accruedWood,
    newlyAccruedWood,
    'WOOD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  if (accruedWood > WOOD_GATHERING_TOTAL_WOOD) fail('WOOD_EXPEDITION_ACCRUAL_CAP');
  return Object.freeze({
    accruedWood,
    newlyAccruedWood,
    completedQuanta,
    settledThroughMicros,
  });
}

/**
 * Reserve the complete remaining Logging Camp award against the uncapped
 * passive Wood projection at the gathering deadline. Unlike Gold (whose
 * passive rate is deliberately zero), Wood capacity must include every
 * ten-minute passive Wood quantum through the full thirty-day lease.
 */
export function assertWoodExpeditionCapacity(
  projectedWoodAtGatheringEnd: bigint,
  creditedWood: bigint,
  resourceBalanceCap: bigint,
): void {
  if (
    !isU64(projectedWoodAtGatheringEnd)
    || !isU64(creditedWood)
    || !isU64(resourceBalanceCap)
    || creditedWood > WOOD_GATHERING_TOTAL_WOOD
  ) fail('WOOD_EXPEDITION_ACCOUNT_STATE_INVALID');
  if (projectedWoodAtGatheringEnd > resourceBalanceCap) {
    fail('WOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const remainingAward = WOOD_GATHERING_TOTAL_WOOD - creditedWood;
  if (remainingAward > resourceBalanceCap - projectedWoodAtGatheringEnd) {
    fail('WOOD_EXPEDITION_ACCOUNT_CAPACITY');
  }
}
