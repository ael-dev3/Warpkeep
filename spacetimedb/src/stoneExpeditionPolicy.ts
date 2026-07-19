/**
 * Pure server-owned timing, settlement, and capacity rules for a Tier-I
 * Stone Quarry wagon. Browser clocks, paths, and reward values never enter
 * these calculations.
 */
export const STONE_EXPEDITION_POLICY_VERSION = 'genesis-stone-quarry-expedition-v1';
export const STONE_WAGON_TRAVEL_MICROS_PER_STEP = 30_000_000n;
export const STONE_GATHER_QUANTUM_MICROS = 60_000_000n;
export const STONE_GATHER_RATE_PER_QUANTUM = 1n;
export const STONE_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;
export const STONE_GATHERING_QUANTA = STONE_GATHERING_DURATION_MICROS / STONE_GATHER_QUANTUM_MICROS;
export const STONE_GATHERING_TOTAL_STONE = STONE_GATHERING_QUANTA * STONE_GATHER_RATE_PER_QUANTUM;
export const STONE_EXPEDITION_U64_MAX = (1n << 64n) - 1n;

export type StoneExpeditionPhaseV1 = 'outbound' | 'gathering' | 'returning';

export type StoneExpeditionTimelineV1 = Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type StoneExpeditionAccrualStateV1 = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedStone: bigint;
  creditedStone: bigint;
  policyVersion: string;
}>;

export type StoneExpeditionAccrualPlanV1 = Readonly<{
  accruedStone: bigint;
  newlyAccruedStone: bigint;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

export class StoneExpeditionPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'StoneExpeditionPolicyError';
  }
}

function fail(code: string): never {
  throw new StoneExpeditionPolicyError(code);
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= STONE_EXPEDITION_U64_MAX;
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (!isU64(value)) fail(code);
}

function checkedSum(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || right > STONE_EXPEDITION_U64_MAX - left) fail(code);
  return left + right;
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || (left !== 0n && right > STONE_EXPEDITION_U64_MAX / left)) {
    fail(code);
  }
  return left * right;
}

function isPhase(value: string): value is StoneExpeditionPhaseV1 {
  return value === 'outbound' || value === 'gathering' || value === 'returning';
}

/** A browser-created UUID-like idempotency key, bounded before persistence. */
export function assertStoneExpeditionIdempotencyKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{15,79}$/.test(value)) {
    fail('STONE_EXPEDITION_IDEMPOTENCY_KEY_INVALID');
  }
}

/**
 * Compute timestamps exclusively from the canonical passable-route length.
 * One map step takes thirty seconds, followed by exactly thirty days at the
 * Stone Quarry and the same deterministic return journey.
 */
export function planStoneExpeditionTimeline(
  startedAtMicros: bigint,
  routeSteps: number,
): StoneExpeditionTimelineV1 {
  assertU64(startedAtMicros, 'STONE_EXPEDITION_START_TIME_INVALID');
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) {
    fail('STONE_EXPEDITION_ROUTE_INVALID');
  }
  const travelMicros = checkedProduct(
    BigInt(routeSteps),
    STONE_WAGON_TRAVEL_MICROS_PER_STEP,
    'STONE_EXPEDITION_TIME_OVERFLOW',
  );
  const arrivesAtMicros = checkedSum(
    startedAtMicros,
    travelMicros,
    'STONE_EXPEDITION_TIME_OVERFLOW',
  );
  const gatheringEndsAtMicros = checkedSum(
    arrivesAtMicros,
    STONE_GATHERING_DURATION_MICROS,
    'STONE_EXPEDITION_TIME_OVERFLOW',
  );
  const returnsAtMicros = checkedSum(
    gatheringEndsAtMicros,
    travelMicros,
    'STONE_EXPEDITION_TIME_OVERFLOW',
  );
  return Object.freeze({
    startedAtMicros,
    arrivesAtMicros,
    gatheringEndsAtMicros,
    returnsAtMicros,
  });
}

/** Validate persisted Stone state before using it for an inventory credit. */
export function stoneExpeditionStateIsConsistent(
  state: StoneExpeditionAccrualStateV1,
): boolean {
  if (
    state.policyVersion !== STONE_EXPEDITION_POLICY_VERSION
    || !isPhase(state.phase)
    || !isU64(state.startedAtMicros)
    || !isU64(state.arrivesAtMicros)
    || !isU64(state.gatheringEndsAtMicros)
    || !isU64(state.returnsAtMicros)
    || !isU64(state.settledThroughMicros)
    || !isU64(state.accruedStone)
    || !isU64(state.creditedStone)
  ) return false;
  const timelineIsConsistent = state.startedAtMicros < state.arrivesAtMicros
    && state.arrivesAtMicros < state.gatheringEndsAtMicros
    && state.gatheringEndsAtMicros < state.returnsAtMicros
    && state.arrivesAtMicros <= state.settledThroughMicros
    && state.settledThroughMicros <= state.gatheringEndsAtMicros
    && state.creditedStone <= state.accruedStone
    && state.accruedStone <= STONE_GATHERING_TOTAL_STONE;
  if (!timelineIsConsistent) return false;
  // `returning` is written only by the same transaction that settles the
  // fixed deadline and releases the Stone reservation. A partial returning
  // row would otherwise create an ambiguous reserve after the site opens.
  return state.phase !== 'returning'
    || (
      state.accruedStone === STONE_GATHERING_TOTAL_STONE
      && state.creditedStone === STONE_GATHERING_TOTAL_STONE
    );
}

/**
 * Calculate whole-minute Stone output through the lesser of server time and
 * the fixed expiry. The authority writes only on collection and lifecycle
 * transitions, never once per minute.
 */
export function planStoneExpeditionAccrual(
  state: StoneExpeditionAccrualStateV1,
  observedAtMicros: bigint,
): StoneExpeditionAccrualPlanV1 {
  if (!stoneExpeditionStateIsConsistent(state)) fail('STONE_EXPEDITION_STATE_INVALID');
  assertU64(observedAtMicros, 'STONE_EXPEDITION_OBSERVED_TIME_INVALID');
  const ceiling = observedAtMicros < state.gatheringEndsAtMicros
    ? observedAtMicros
    : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({
      accruedStone: state.accruedStone,
      newlyAccruedStone: 0n,
      completedQuanta: 0n,
      settledThroughMicros: state.settledThroughMicros,
    });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / STONE_GATHER_QUANTUM_MICROS;
  const elapsedWholeMicros = checkedProduct(
    completedQuanta,
    STONE_GATHER_QUANTUM_MICROS,
    'STONE_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const settledThroughMicros = checkedSum(
    state.settledThroughMicros,
    elapsedWholeMicros,
    'STONE_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const newlyAccruedStone = checkedProduct(
    completedQuanta,
    STONE_GATHER_RATE_PER_QUANTUM,
    'STONE_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const accruedStone = checkedSum(
    state.accruedStone,
    newlyAccruedStone,
    'STONE_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  if (accruedStone > STONE_GATHERING_TOTAL_STONE) fail('STONE_EXPEDITION_ACCRUAL_CAP');
  return Object.freeze({
    accruedStone,
    newlyAccruedStone,
    completedQuanta,
    settledThroughMicros,
  });
}

/**
 * Reserve the complete remaining Stone Quarry award against the uncapped
 * passive Stone projection at the gathering deadline. Unlike Gold (whose
 * passive rate is deliberately zero), Stone capacity must include every
 * ten-minute passive Stone quantum through the full thirty-day lease.
 */
export function assertStoneExpeditionCapacity(
  projectedStoneAtGatheringEnd: bigint,
  creditedStone: bigint,
  resourceBalanceCap: bigint,
): void {
  if (
    !isU64(projectedStoneAtGatheringEnd)
    || !isU64(creditedStone)
    || !isU64(resourceBalanceCap)
    || creditedStone > STONE_GATHERING_TOTAL_STONE
  ) fail('STONE_EXPEDITION_ACCOUNT_STATE_INVALID');
  if (projectedStoneAtGatheringEnd > resourceBalanceCap) {
    fail('STONE_EXPEDITION_ACCOUNT_CAPACITY');
  }
  const remainingAward = STONE_GATHERING_TOTAL_STONE - creditedStone;
  if (remainingAward > resourceBalanceCap - projectedStoneAtGatheringEnd) {
    fail('STONE_EXPEDITION_ACCOUNT_CAPACITY');
  }
}
