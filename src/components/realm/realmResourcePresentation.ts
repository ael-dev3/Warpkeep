/**
 * The future authoritative resource projection is deliberately distinct from
 * Marks. Economic resources will be server-owned quantities; Marks retain
 * their separately gated public-community-stat presentation boundary.
 */
export const REALM_ECONOMIC_RESOURCE_ORDER = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold'
] as const);

export type RealmEconomicResourceKey = typeof REALM_ECONOMIC_RESOURCE_ORDER[number];

export type RealmResourceBalances = Readonly<Record<RealmEconomicResourceKey, bigint>>;

/**
 * A browser-facing projection contract for a future authoritative resource
 * subscription. This is a type boundary only: no client-side accrual,
 * optimistic update, storage, or fixture is an authority source.
 */
export type RealmResourcePresentation =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{
      status: 'ready';
      balances: RealmResourceBalances;
      observedAtMicros?: bigint;
    }>;

/**
 * Marks may appear next to the resource family, but must never enter resource
 * balances, production, costs, or formatting. Its value remains subject to
 * the existing public community-stat visibility gate.
 */
export type RealmMarksPresentation =
  | Readonly<{ status: 'unavailable' }>
  | Readonly<{ status: 'ready'; balanceMicros: bigint }>;

const COMPACT_RESOURCE_SCALES = Object.freeze([
  { threshold: 1_000_000_000_000n, divisor: 1_000_000_000_000n, suffix: 'T' },
  { threshold: 1_000_000_000n, divisor: 1_000_000_000n, suffix: 'B' },
  { threshold: 1_000_000n, divisor: 1_000_000n, suffix: 'M' },
  { threshold: 1_000n, divisor: 1_000n, suffix: 'K' }
]);

export function isRealmEconomicResourceKey(value: string): value is RealmEconomicResourceKey {
  return REALM_ECONOMIC_RESOURCE_ORDER.some((key) => key === value);
}

/**
 * Keeps exact quantities on bigint paths. The compact display intentionally
 * truncates rather than rounds across a suffix boundary: 999,999 is "999K",
 * never a misleading "1M". Use formatExactRealmResourceQuantity for an
 * assistive label or tooltip.
 */
export function formatCompactRealmResourceQuantity(value: unknown): string | undefined {
  if (typeof value !== 'bigint' || value < 0n) return undefined;
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
  return typeof value === 'bigint' && value >= 0n ? value.toString() : undefined;
}
