import type { GenesisTerrainKind } from './world';

export const GENESIS_RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1';
export const RESOURCE_PRODUCTION_QUANTUM_MICROS = 600_000_000n;
export const RESOURCE_BALANCE_CAP = 1_000_000n;
export const RESOURCE_U64_MAX = (1n << 64n) - 1n;

/** Compatibility aliases for realm-facing call sites. */
export const REALM_RESOURCE_POLICY_VERSION = GENESIS_RESOURCE_POLICY_VERSION;
export const REALM_RESOURCE_QUANTUM_MICROS = RESOURCE_PRODUCTION_QUANTUM_MICROS;
export const REALM_RESOURCE_BALANCE_CAP = RESOURCE_BALANCE_CAP;

export type RealmResourceKind = 'food' | 'wood' | 'stone' | 'gold';

export type RealmResourceBalances = Readonly<{
  food: bigint;
  wood: bigint;
  stone: bigint;
  gold: bigint;
}>;

export type ResourceBalances = RealmResourceBalances;
export type GenesisResourceTerrainKind = GenesisTerrainKind;

export const GENESIS_STARTING_RESOURCE_BALANCES: ResourceBalances = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n,
});

export const REALM_RESOURCE_STARTING_BALANCES = GENESIS_STARTING_RESOURCE_BALANCES;

/** Whole-resource production earned per completed ten-minute server-time quantum. */
export const REALM_RESOURCE_TERRAIN_RATES: Readonly<
  Record<GenesisTerrainKind, RealmResourceBalances>
> = Object.freeze({
  // Tier-I Gold comes only from the persistent expedition authority. Keeping
  // passive terrain Gold at zero prevents a second hidden issuance path.
  lowland: Object.freeze({ food: 8n, wood: 5n, stone: 3n, gold: 0n }),
  meadow: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 0n }),
  forest: Object.freeze({ food: 5n, wood: 10n, stone: 3n, gold: 0n }),
  heath: Object.freeze({ food: 5n, wood: 6n, stone: 5n, gold: 0n }),
  ridge: Object.freeze({ food: 3n, wood: 4n, stone: 10n, gold: 0n }),
  lake: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 0n }),
  'ancient-stone': Object.freeze({ food: 3n, wood: 4n, stone: 8n, gold: 0n }),
});

const RESOURCE_KINDS: readonly RealmResourceKind[] = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold',
]);

const ZERO_RESOURCE_BALANCES: RealmResourceBalances = Object.freeze({
  food: 0n,
  wood: 0n,
  stone: 0n,
  gold: 0n,
});

export class ResourceAuthorityPolicyError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'ResourceAuthorityPolicyError';
  }
}

export { ResourceAuthorityPolicyError as RealmResourceAuthorityPolicyError };

export type ResourceAccountState = Readonly<{
  food: bigint;
  wood: bigint;
  stone: bigint;
  gold: bigint;
  settledThroughMicros: bigint;
  revision: bigint;
  policyVersion: string;
}>;

export type RealmResourceAuthorityState = ResourceAccountState;

export type RealmResourceSettlementInput = Readonly<{
  account: ResourceAccountState;
  terrainKind: string;
  /** Must come from the authoritative reducer context, never a browser clock. */
  observedAtMicros: bigint;
}>;

export type RealmResourceSettlementPlan = Readonly<{
  balances: RealmResourceBalances;
  deltas: RealmResourceBalances;
  completedQuanta: bigint;
  nextCollectAtMicros: bigint;
  settledThroughMicros: bigint;
  revision: bigint;
  policyVersion: string;
}>;

export type ResourceSettlementPlan = RealmResourceSettlementPlan;

/**
 * Uncapped, server-time-only projection for authorities that must reserve a
 * future reward against passive production. It is intentionally separate
 * from the ordinary collect plan: normal inventory settlement still caps each
 * balance, whereas an expedition preflight must see the raw Food that would
 * exist at its fixed gathering deadline.
 */
export type RawResourceSettlementProjection = Readonly<{
  rawBalances: RealmResourceBalances;
  rawDeltas: RealmResourceBalances;
  completedQuanta: bigint;
  settledThroughMicros: bigint;
}>;

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= RESOURCE_U64_MAX;
}

function assertU64(value: unknown, code: string): asserts value is bigint {
  if (!isU64(value)) throw new ResourceAuthorityPolicyError(code);
}

function frozenBalances(values: RealmResourceBalances): RealmResourceBalances {
  return Object.freeze({
    food: values.food,
    wood: values.wood,
    stone: values.stone,
    gold: values.gold,
  });
}

function assertBalancesAreCanonical(balances: RealmResourceBalances): void {
  for (const resource of RESOURCE_KINDS) {
    const balance: unknown = balances?.[resource];
    if (!isU64(balance) || balance > REALM_RESOURCE_BALANCE_CAP) {
      throw new ResourceAuthorityPolicyError('RESOURCE_BALANCE_CORRUPT');
    }
  }
}

export function resourceAccountStateIsConsistent(state: ResourceAccountState): boolean {
  if (
    state.policyVersion !== GENESIS_RESOURCE_POLICY_VERSION
    || !isU64(state.settledThroughMicros)
    || !isU64(state.revision)
  ) {
    return false;
  }
  try {
    assertBalancesAreCanonical(state);
    return true;
  } catch {
    return false;
  }
}

function terrainRates(terrainKind: string): RealmResourceBalances {
  if (!Object.prototype.hasOwnProperty.call(REALM_RESOURCE_TERRAIN_RATES, terrainKind)) {
    throw new ResourceAuthorityPolicyError('RESOURCE_TERRAIN_INVALID');
  }
  return REALM_RESOURCE_TERRAIN_RATES[terrainKind as GenesisTerrainKind];
}

function checkedU64Product(left: bigint, right: bigint): bigint {
  if (left < 0n || right < 0n || (left !== 0n && right > RESOURCE_U64_MAX / left)) {
    throw new ResourceAuthorityPolicyError('RESOURCE_ARITHMETIC_OVERFLOW');
  }
  return left * right;
}

function checkedU64Sum(left: bigint, right: bigint): bigint {
  if (left < 0n || right < 0n || right > RESOURCE_U64_MAX - left) {
    throw new ResourceAuthorityPolicyError('RESOURCE_ARITHMETIC_OVERFLOW');
  }
  return left + right;
}

function nextBalance(
  current: bigint,
  rate: bigint,
  completedQuanta: bigint,
  balanceCap = REALM_RESOURCE_BALANCE_CAP,
  reservationErrorCode = 'RESOURCE_BALANCE_CAP_INVALID',
): Readonly<{ balance: bigint; delta: bigint }> {
  if (
    !isU64(balanceCap)
    || balanceCap > REALM_RESOURCE_BALANCE_CAP
    || current > balanceCap
  ) {
    throw new ResourceAuthorityPolicyError(reservationErrorCode);
  }
  const remainingCapacity = balanceCap - current;
  const potentialDelta = checkedU64Product(rate, completedQuanta);
  const delta = potentialDelta > remainingCapacity ? remainingCapacity : potentialDelta;
  return Object.freeze({ balance: current + delta, delta });
}

function nextRawBalance(
  current: bigint,
  rate: bigint,
  completedQuanta: bigint,
): Readonly<{ balance: bigint; delta: bigint }> {
  const delta = checkedU64Product(rate, completedQuanta);
  return Object.freeze({
    balance: checkedU64Sum(current, delta),
    delta,
  });
}

/**
 * Creates a canonical founder resource state. The cursor must be captured from
 * the server reducer context at founding/backfill time.
 */
export function createInitialRealmResourceState(
  settledThroughMicros: bigint,
): ResourceAccountState {
  assertU64(settledThroughMicros, 'RESOURCE_CURSOR_INVALID');
  return Object.freeze({
    ...GENESIS_STARTING_RESOURCE_BALANCES,
    settledThroughMicros,
    revision: 0n,
    policyVersion: GENESIS_RESOURCE_POLICY_VERSION,
  });
}

/**
 * Project passive resources without applying the inventory cap. This is not a
 * credit path and writes nothing; it exists so long-running Food and Wood
 * expeditions can reserve capacity for their own thirty-day awards and every
 * passive quantum through each immutable gathering deadline.
 */
export function planRawResourceSettlement(
  state: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): RawResourceSettlementProjection {
  if (state.policyVersion !== REALM_RESOURCE_POLICY_VERSION) {
    throw new ResourceAuthorityPolicyError('RESOURCE_POLICY_MISMATCH');
  }
  assertU64(observedAtMicros, 'RESOURCE_OBSERVED_TIME_INVALID');
  assertU64(state.settledThroughMicros, 'RESOURCE_CURSOR_INVALID');
  if (state.settledThroughMicros > observedAtMicros) {
    throw new ResourceAuthorityPolicyError('RESOURCE_CURSOR_IN_FUTURE');
  }
  assertU64(state.revision, 'RESOURCE_REVISION_INVALID');
  if (state.revision === RESOURCE_U64_MAX) {
    throw new ResourceAuthorityPolicyError('RESOURCE_REVISION_EXHAUSTED');
  }
  assertBalancesAreCanonical(state);
  const rates = terrainRates(terrainKind);
  const completedQuanta = (
    observedAtMicros - state.settledThroughMicros
  ) / REALM_RESOURCE_QUANTUM_MICROS;
  const elapsedWholeQuantaMicros = checkedU64Product(
    completedQuanta,
    REALM_RESOURCE_QUANTUM_MICROS,
  );
  const settledThroughMicros = checkedU64Sum(
    state.settledThroughMicros,
    elapsedWholeQuantaMicros,
  );
  const food = nextRawBalance(state.food, rates.food, completedQuanta);
  const wood = nextRawBalance(state.wood, rates.wood, completedQuanta);
  const stone = nextRawBalance(state.stone, rates.stone, completedQuanta);
  const gold = nextRawBalance(state.gold, rates.gold, completedQuanta);
  return Object.freeze({
    rawBalances: frozenBalances({
      food: food.balance,
      wood: wood.balance,
      stone: stone.balance,
      gold: gold.balance,
    }),
    rawDeltas: frozenBalances({
      food: food.delta,
      wood: wood.delta,
      stone: stone.delta,
      gold: gold.delta,
    }),
    completedQuanta,
    settledThroughMicros,
  });
}

/**
 * Settles deterministic passive production using authoritative server time.
 * Incomplete time remains behind the returned cursor. Completed time always
 * advances the cursor, including while every balance is already capped.
 */
function settleRealmResourcesWithExpeditionCaps(
  input: RealmResourceSettlementInput,
  caps: Readonly<{ food: bigint; wood: bigint; stone: bigint }>,
): RealmResourceSettlementPlan {
  const { account, observedAtMicros } = input;
  if (account.policyVersion !== REALM_RESOURCE_POLICY_VERSION) {
    throw new ResourceAuthorityPolicyError('RESOURCE_POLICY_MISMATCH');
  }
  assertU64(observedAtMicros, 'RESOURCE_OBSERVED_TIME_INVALID');
  assertU64(account.settledThroughMicros, 'RESOURCE_CURSOR_INVALID');
  if (account.settledThroughMicros > observedAtMicros) {
    throw new ResourceAuthorityPolicyError('RESOURCE_CURSOR_IN_FUTURE');
  }
  assertU64(account.revision, 'RESOURCE_REVISION_INVALID');
  if (account.revision === RESOURCE_U64_MAX) {
    throw new ResourceAuthorityPolicyError('RESOURCE_REVISION_EXHAUSTED');
  }
  assertBalancesAreCanonical(account);
  if (!isU64(caps.food) || caps.food > REALM_RESOURCE_BALANCE_CAP || account.food > caps.food) {
    throw new ResourceAuthorityPolicyError('RESOURCE_FOOD_RESERVATION_BREACH');
  }
  if (!isU64(caps.wood) || caps.wood > REALM_RESOURCE_BALANCE_CAP || account.wood > caps.wood) {
    throw new ResourceAuthorityPolicyError('RESOURCE_WOOD_RESERVATION_BREACH');
  }
  if (!isU64(caps.stone) || caps.stone > REALM_RESOURCE_BALANCE_CAP || account.stone > caps.stone) {
    throw new ResourceAuthorityPolicyError('RESOURCE_STONE_RESERVATION_BREACH');
  }
  const rates = terrainRates(input.terrainKind);

  const elapsedMicros = observedAtMicros - account.settledThroughMicros;
  const completedQuanta = elapsedMicros / REALM_RESOURCE_QUANTUM_MICROS;
  const elapsedWholeQuantaMicros = checkedU64Product(
    completedQuanta,
    REALM_RESOURCE_QUANTUM_MICROS,
  );
  const settledThroughMicros = checkedU64Sum(
    account.settledThroughMicros,
    elapsedWholeQuantaMicros,
  );
  const nextCollectAtMicros = checkedU64Sum(
    settledThroughMicros,
    REALM_RESOURCE_QUANTUM_MICROS,
  );

  if (completedQuanta === 0n) {
    return Object.freeze({
      balances: frozenBalances(account),
      deltas: frozenBalances(ZERO_RESOURCE_BALANCES),
      completedQuanta,
      nextCollectAtMicros,
      settledThroughMicros,
      revision: account.revision,
      policyVersion: account.policyVersion,
    });
  }

  const food = nextBalance(
    account.food,
    rates.food,
    completedQuanta,
    caps.food,
    'RESOURCE_FOOD_RESERVATION_BREACH',
  );
  const wood = nextBalance(
    account.wood,
    rates.wood,
    completedQuanta,
    caps.wood,
    'RESOURCE_WOOD_RESERVATION_BREACH',
  );
  const stone = nextBalance(
    account.stone,
    rates.stone,
    completedQuanta,
    caps.stone,
    'RESOURCE_STONE_RESERVATION_BREACH',
  );
  const gold = nextBalance(account.gold, rates.gold, completedQuanta);

  return Object.freeze({
    balances: frozenBalances({
      food: food.balance,
      wood: wood.balance,
      stone: stone.balance,
      gold: gold.balance,
    }),
    deltas: frozenBalances({
      food: food.delta,
      wood: wood.delta,
      stone: stone.delta,
      gold: gold.delta,
    }),
    completedQuanta,
    nextCollectAtMicros,
    settledThroughMicros,
    revision: account.revision + 1n,
    policyVersion: account.policyVersion,
  });
}

/**
 * Settles deterministic passive production using the ordinary inventory cap.
 * Incomplete time remains behind the returned cursor. Completed time always
 * advances the cursor, including while every balance is already capped.
 */
export function settleRealmResources(
  input: RealmResourceSettlementInput,
): RealmResourceSettlementPlan {
  return settleRealmResourcesWithExpeditionCaps(input, {
    food: REALM_RESOURCE_BALANCE_CAP,
    wood: REALM_RESOURCE_BALANCE_CAP,
    stone: REALM_RESOURCE_BALANCE_CAP,
  });
}

/** Reducer-friendly positional form of {@link settleRealmResources}. */
export function planResourceSettlement(
  state: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): ResourceSettlementPlan {
  return settleRealmResources({ account: state, terrainKind, observedAtMicros });
}

/**
 * Resource-specific reservation values are the exact uncredited awards from
 * private authority rows, never browser input. Passive Food and Wood each
 * stop below their own remaining award so either lifecycle can settle late
 * without overflowing its account field.
 */
export function planResourceSettlementWithExpeditionReservations(
  state: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
  reservations: Readonly<{ food: bigint; wood: bigint; stone?: bigint }>,
): ResourceSettlementPlan {
  if (!isU64(reservations.food) || reservations.food > REALM_RESOURCE_BALANCE_CAP) {
    throw new ResourceAuthorityPolicyError('RESOURCE_FOOD_RESERVATION_INVALID');
  }
  if (!isU64(reservations.wood) || reservations.wood > REALM_RESOURCE_BALANCE_CAP) {
    throw new ResourceAuthorityPolicyError('RESOURCE_WOOD_RESERVATION_INVALID');
  }
  const stoneReservation = reservations.stone ?? 0n;
  if (!isU64(stoneReservation) || stoneReservation > REALM_RESOURCE_BALANCE_CAP) {
    throw new ResourceAuthorityPolicyError('RESOURCE_STONE_RESERVATION_INVALID');
  }
  return settleRealmResourcesWithExpeditionCaps(
    { account: state, terrainKind, observedAtMicros },
    {
      food: REALM_RESOURCE_BALANCE_CAP - reservations.food,
      wood: REALM_RESOURCE_BALANCE_CAP - reservations.wood,
      stone: REALM_RESOURCE_BALANCE_CAP - stoneReservation,
    },
  );
}

/**
 * Compatibility wrapper for the v7 Food-only authority surface. New
 * authority callers use the paired reservation API above so an active Wood
 * expedition is preserved as well.
 */
export function planResourceSettlementWithFoodReservation(
  state: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
  reservedFood: bigint,
): ResourceSettlementPlan {
  return planResourceSettlementWithExpeditionReservations(
    state,
    terrainKind,
    observedAtMicros,
    { food: reservedFood, wood: 0n },
  );
}
