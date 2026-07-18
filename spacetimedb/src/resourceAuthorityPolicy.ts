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
  lowland: Object.freeze({ food: 8n, wood: 5n, stone: 3n, gold: 1n }),
  meadow: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 1n }),
  forest: Object.freeze({ food: 5n, wood: 10n, stone: 3n, gold: 1n }),
  heath: Object.freeze({ food: 5n, wood: 6n, stone: 5n, gold: 2n }),
  ridge: Object.freeze({ food: 3n, wood: 4n, stone: 10n, gold: 2n }),
  lake: Object.freeze({ food: 10n, wood: 4n, stone: 2n, gold: 1n }),
  'ancient-stone': Object.freeze({ food: 3n, wood: 4n, stone: 8n, gold: 4n }),
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
): Readonly<{ balance: bigint; delta: bigint }> {
  const remainingCapacity = REALM_RESOURCE_BALANCE_CAP - current;
  const potentialDelta = checkedU64Product(rate, completedQuanta);
  const delta = potentialDelta > remainingCapacity ? remainingCapacity : potentialDelta;
  return Object.freeze({ balance: current + delta, delta });
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
 * Settles deterministic passive production using authoritative server time.
 * Incomplete time remains behind the returned cursor. Completed time always
 * advances the cursor, including while every balance is already capped.
 */
export function settleRealmResources(
  input: RealmResourceSettlementInput,
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

  const food = nextBalance(account.food, rates.food, completedQuanta);
  const wood = nextBalance(account.wood, rates.wood, completedQuanta);
  const stone = nextBalance(account.stone, rates.stone, completedQuanta);
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

/** Reducer-friendly positional form of {@link settleRealmResources}. */
export function planResourceSettlement(
  state: ResourceAccountState,
  terrainKind: string,
  observedAtMicros: bigint,
): ResourceSettlementPlan {
  return settleRealmResources({ account: state, terrainKind, observedAtMicros });
}
