/**
 * Future economic resources are distinct from Community Marks. This module is
 * presentation groundwork only: it creates no balance, accrual, timer, cost,
 * construction action, or browser authority.
 */
export const REALM_ECONOMIC_RESOURCE_ORDER = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold'
] as const);

export type RealmEconomicResourceKey = typeof REALM_ECONOMIC_RESOURCE_ORDER[number];
export type RealmResourceBalances = Readonly<Record<RealmEconomicResourceKey, bigint>>;

/** Matches the bounded unsigned quantity expected from a future server row. */
export const MAX_REALM_RESOURCE_QUANTITY = (1n << 64n) - 1n;

export type RealmResourcePresentation =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      status: 'ready';
      balances: RealmResourceBalances;
      observedAtMicros?: bigint;
    }>;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function boundedQuantity(value: unknown): value is bigint {
  return typeof value === 'bigint'
    && value >= 0n
    && value <= MAX_REALM_RESOURCE_QUANTITY;
}

/**
 * Fail-closed decoder for a future authenticated SpacetimeDB projection.
 * Callers must establish transport/session authority before passing a row;
 * this pure decoder only prevents malformed, negative, oversized, or
 * structurally ambiguous browser data from becoming player-facing state.
 */
export function decodeRealmResourceProjection(value: unknown): RealmResourcePresentation | undefined {
  if (!plainRecord(value)) return undefined;
  const keys = Object.keys(value).sort();
  const expectedKeys = ['balances', 'observedAtMicros'];
  const rawBalances = value.balances;
  if (
    keys.some((key) => !expectedKeys.includes(key))
    || !keys.includes('balances')
    || !plainRecord(rawBalances)
  ) return undefined;
  const balanceKeys = Object.keys(rawBalances).sort();
  const expectedBalanceKeys = [...REALM_ECONOMIC_RESOURCE_ORDER].sort();
  if (
    balanceKeys.length !== expectedBalanceKeys.length
    || balanceKeys.some((key, index) => key !== expectedBalanceKeys[index])
  ) return undefined;

  const balances = Object.fromEntries(REALM_ECONOMIC_RESOURCE_ORDER.map((key) => (
    [key, rawBalances[key]]
  ))) as Record<RealmEconomicResourceKey, unknown>;
  if (REALM_ECONOMIC_RESOURCE_ORDER.some((key) => !boundedQuantity(balances[key]))) {
    return undefined;
  }
  const observedAtMicros = value.observedAtMicros;
  if (observedAtMicros !== undefined && !boundedQuantity(observedAtMicros)) return undefined;

  return Object.freeze({
    status: 'ready' as const,
    balances: Object.freeze({
      food: balances.food,
      wood: balances.wood,
      stone: balances.stone,
      gold: balances.gold
    }) as RealmResourceBalances,
    ...(observedAtMicros === undefined ? {} : { observedAtMicros })
  });
}

const COMPACT_RESOURCE_SCALES = Object.freeze([
  { threshold: 1_000_000_000_000n, divisor: 1_000_000_000_000n, suffix: 'T' },
  { threshold: 1_000_000_000n, divisor: 1_000_000_000n, suffix: 'B' },
  { threshold: 1_000_000n, divisor: 1_000_000n, suffix: 'M' },
  { threshold: 1_000n, divisor: 1_000n, suffix: 'K' }
]);

export function isRealmEconomicResourceKey(value: string): value is RealmEconomicResourceKey {
  return REALM_ECONOMIC_RESOURCE_ORDER.some((key) => key === value);
}

/** Truncates compact display values so 999,999 never becomes a misleading 1M. */
export function formatCompactRealmResourceQuantity(value: unknown): string | undefined {
  if (!boundedQuantity(value)) return undefined;
  if (value < 1_000n) return value.toString();

  const scale = COMPACT_RESOURCE_SCALES.find((candidate) => value >= candidate.threshold);
  if (!scale) return value.toString();
  const whole = value / scale.divisor;
  if (whole >= 100n) return `${whole}${scale.suffix}`;
  const tenths = (value * 10n) / scale.divisor;
  const integer = tenths / 10n;
  const fraction = tenths % 10n;
  return fraction === 0n
    ? `${integer}${scale.suffix}`
    : `${integer}.${fraction}${scale.suffix}`;
}

export function formatExactRealmResourceQuantity(value: unknown): string | undefined {
  return boundedQuantity(value) ? value.toString() : undefined;
}
