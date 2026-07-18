/**
 * Pure, server-owned timing and settlement rules for a Tier-I Gold wagon. No
 * browser clock, client route, or caller-provided reward value participates in
 * these calculations.
 */
export const GOLD_EXPEDITION_POLICY_VERSION = 'genesis-gold-wagon-expedition-v1';
export const GOLD_WAGON_TRAVEL_MICROS_PER_STEP = 30_000_000n;
export const GOLD_GATHER_QUANTUM_MICROS = 60_000_000n;
export const GOLD_GATHER_RATE_PER_QUANTUM = 1n;
export const GOLD_GATHERING_DURATION_MICROS = 30n * 24n * 60n * 60n * 1_000_000n;
export const GOLD_GATHERING_QUANTA = GOLD_GATHERING_DURATION_MICROS / GOLD_GATHER_QUANTUM_MICROS;
export const GOLD_GATHERING_TOTAL_GOLD = GOLD_GATHERING_QUANTA * GOLD_GATHER_RATE_PER_QUANTUM;
export const GOLD_EXPEDITION_U64_MAX = (1n << 64n) - 1n;

export type GoldExpeditionPhaseV1 = 'outbound' | 'gathering' | 'returning';

export type GoldExpeditionTimelineV1 = Readonly<{
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
}>;

export type GoldExpeditionAccrualStateV1 = Readonly<{
  phase: string;
  startedAtMicros: bigint;
  arrivesAtMicros: bigint;
  gatheringEndsAtMicros: bigint;
  returnsAtMicros: bigint;
  settledThroughMicros: bigint;
  accruedGold: bigint;
  creditedGold: bigint;
  policyVersion: string;
}>;

export type GoldExpeditionAccrualPlanV1 = Readonly<{
  accruedGold: bigint;
  newlyAccruedGold: bigint;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

export class GoldExpeditionPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'GoldExpeditionPolicyError';
  }
}

function fail(code: string): never {
  throw new GoldExpeditionPolicyError(code);
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= GOLD_EXPEDITION_U64_MAX;
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (!isU64(value)) fail(code);
}

function checkedSum(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || right > GOLD_EXPEDITION_U64_MAX - left) fail(code);
  return left + right;
}

function checkedProduct(left: bigint, right: bigint, code: string): bigint {
  if (!isU64(left) || !isU64(right) || (left !== 0n && right > GOLD_EXPEDITION_U64_MAX / left)) {
    fail(code);
  }
  return left * right;
}

function isPhase(value: string): value is GoldExpeditionPhaseV1 {
  return value === 'outbound' || value === 'gathering' || value === 'returning';
}

/** A browser-created UUID-like idempotency key, bounded before persistence. */
export function assertGoldExpeditionIdempotencyKey(value: string): void {
  if (!/^[a-z0-9][a-z0-9-]{15,79}$/.test(value)) {
    fail('GOLD_EXPEDITION_IDEMPOTENCY_KEY_INVALID');
  }
}

/**
 * Compute server timestamps from a canonical passable route length. One map
 * step takes 30 seconds; all waiting/gathering time is separate and exact.
 */
export function planGoldExpeditionTimeline(
  startedAtMicros: bigint,
  routeSteps: number,
): GoldExpeditionTimelineV1 {
  assertU64(startedAtMicros, 'GOLD_EXPEDITION_START_TIME_INVALID');
  if (!Number.isSafeInteger(routeSteps) || routeSteps <= 0) {
    fail('GOLD_EXPEDITION_ROUTE_INVALID');
  }
  const travelMicros = checkedProduct(
    BigInt(routeSteps),
    GOLD_WAGON_TRAVEL_MICROS_PER_STEP,
    'GOLD_EXPEDITION_TIME_OVERFLOW',
  );
  const arrivesAtMicros = checkedSum(
    startedAtMicros,
    travelMicros,
    'GOLD_EXPEDITION_TIME_OVERFLOW',
  );
  const gatheringEndsAtMicros = checkedSum(
    arrivesAtMicros,
    GOLD_GATHERING_DURATION_MICROS,
    'GOLD_EXPEDITION_TIME_OVERFLOW',
  );
  const returnsAtMicros = checkedSum(
    gatheringEndsAtMicros,
    travelMicros,
    'GOLD_EXPEDITION_TIME_OVERFLOW',
  );
  return Object.freeze({
    startedAtMicros,
    arrivesAtMicros,
    gatheringEndsAtMicros,
    returnsAtMicros,
  });
}

/**
 * Validate persisted timing/accrual state before using it for a credit. This
 * is intentionally strict: a corrupt private row is never repaired from a
 * public timer or a browser hint.
 */
export function goldExpeditionStateIsConsistent(
  state: GoldExpeditionAccrualStateV1,
): boolean {
  if (
    state.policyVersion !== GOLD_EXPEDITION_POLICY_VERSION
    || !isPhase(state.phase)
    || !isU64(state.startedAtMicros)
    || !isU64(state.arrivesAtMicros)
    || !isU64(state.gatheringEndsAtMicros)
    || !isU64(state.returnsAtMicros)
    || !isU64(state.settledThroughMicros)
    || !isU64(state.accruedGold)
    || !isU64(state.creditedGold)
  ) return false;
  return state.startedAtMicros < state.arrivesAtMicros
    && state.arrivesAtMicros < state.gatheringEndsAtMicros
    && state.gatheringEndsAtMicros < state.returnsAtMicros
    && state.arrivesAtMicros <= state.settledThroughMicros
    && state.settledThroughMicros <= state.gatheringEndsAtMicros
    && state.creditedGold <= state.accruedGold
    && state.accruedGold <= GOLD_GATHERING_TOTAL_GOLD;
}

/**
 * Calculate whole-minute Gold output through the lesser of server time and
 * the fixed 30-day expiry. The row is not written every minute: callers can
 * expose this plan privately and the expiry schedule settles the final amount
 * transactionally exactly once.
 */
export function planGoldExpeditionAccrual(
  state: GoldExpeditionAccrualStateV1,
  observedAtMicros: bigint,
): GoldExpeditionAccrualPlanV1 {
  if (!goldExpeditionStateIsConsistent(state)) fail('GOLD_EXPEDITION_STATE_INVALID');
  assertU64(observedAtMicros, 'GOLD_EXPEDITION_OBSERVED_TIME_INVALID');
  const ceiling = observedAtMicros < state.gatheringEndsAtMicros
    ? observedAtMicros
    : state.gatheringEndsAtMicros;
  if (ceiling <= state.settledThroughMicros) {
    return Object.freeze({
      accruedGold: state.accruedGold,
      newlyAccruedGold: 0n,
      completedQuanta: 0n,
      settledThroughMicros: state.settledThroughMicros,
    });
  }
  const completedQuanta = (ceiling - state.settledThroughMicros) / GOLD_GATHER_QUANTUM_MICROS;
  const elapsedWholeMicros = checkedProduct(
    completedQuanta,
    GOLD_GATHER_QUANTUM_MICROS,
    'GOLD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const settledThroughMicros = checkedSum(
    state.settledThroughMicros,
    elapsedWholeMicros,
    'GOLD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const newlyAccruedGold = checkedProduct(
    completedQuanta,
    GOLD_GATHER_RATE_PER_QUANTUM,
    'GOLD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  const accruedGold = checkedSum(
    state.accruedGold,
    newlyAccruedGold,
    'GOLD_EXPEDITION_ACCRUAL_OVERFLOW',
  );
  if (accruedGold > GOLD_GATHERING_TOTAL_GOLD) fail('GOLD_EXPEDITION_ACCRUAL_CAP');
  return Object.freeze({
    accruedGold,
    newlyAccruedGold,
    completedQuanta,
    settledThroughMicros,
  });
}

/** Fail dispatch before a 30-day expedition could ever be truncated by the account cap. */
export function assertGoldExpeditionCapacity(
  currentGold: bigint,
  resourceBalanceCap: bigint,
): void {
  if (!isU64(currentGold) || !isU64(resourceBalanceCap) || currentGold > resourceBalanceCap) {
    fail('GOLD_EXPEDITION_ACCOUNT_STATE_INVALID');
  }
  if (GOLD_GATHERING_TOTAL_GOLD > resourceBalanceCap - currentGold) {
    fail('GOLD_EXPEDITION_ACCOUNT_CAPACITY');
  }
}
