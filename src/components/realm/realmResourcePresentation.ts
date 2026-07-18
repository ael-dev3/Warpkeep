import {
  isRealmTerrainKind,
  type RealmTerrainKind
} from '../../game/map/realmTerrainSemantics';
import { MARK_ATTRIBUTION_POLICY_ID } from '../../marks/marksPolicy';

/**
 * Economic resources are authoritative server state. Marks remain a distinct,
 * independently governed balance even when both are returned by the same
 * authenticated player-only procedure.
 */
export const REALM_ECONOMIC_RESOURCE_ORDER = Object.freeze([
  'food',
  'wood',
  'stone',
  'gold'
] as const);

export const REALM_RESOURCE_POLICY_VERSION = 'genesis-resource-yield-v1' as const;

export type RealmEconomicResourceKey = typeof REALM_ECONOMIC_RESOURCE_ORDER[number];
export type RealmResourceBalances = Readonly<Record<RealmEconomicResourceKey, bigint>>;

/** SpacetimeDB stores economic resource quantities and timestamps as u64. */
export const MAX_REALM_RESOURCE_QUANTITY = (1n << 64n) - 1n;
/** Compiled gameplay cap applied to each stored balance plus pending yield. */
export const REALM_RESOURCE_BALANCE_CAP = 1_000_000n;
/** Marks use their existing u128 accounting domain and never enter resource balances. */
export const MAX_REALM_MARKS_BALANCE_MICROS = (1n << 128n) - 1n;

const AUTHORITATIVE_RESOURCE_KEYS = Object.freeze([
  'fid',
  'food',
  'wood',
  'stone',
  'gold',
  'pendingFood',
  'pendingWood',
  'pendingStone',
  'pendingGold',
  'marksBalanceMicros',
  'observedAtMicros',
  'settledThroughMicros',
  'nextCollectAtMicros',
  'revision',
  'resourcePolicyVersion',
  'marksPolicyVersion',
  'terrainKind'
] as const);

type AuthoritativeResourceKey = typeof AUTHORITATIVE_RESOURCE_KEYS[number];

export type ReadyRealmResourcePresentation = Readonly<{
  status: 'ready';
  fid: bigint;
  balances: RealmResourceBalances;
  pendingBalances: RealmResourceBalances;
  marksBalanceMicros: bigint;
  observedAtMicros: bigint;
  settledThroughMicros: bigint;
  nextCollectAtMicros: bigint;
  revision: bigint;
  resourcePolicyVersion: typeof REALM_RESOURCE_POLICY_VERSION;
  marksPolicyVersion: string;
  terrainKind: RealmTerrainKind;
}>;

export type RealmResourcePresentation =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'unavailable' }>
  | ReadyRealmResourcePresentation;

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  try {
    const prototype = Object.getPrototypeOf(value);
    return prototype === Object.prototype || prototype === null;
  } catch {
    return false;
  }
}

/**
 * Reads only an exact plain object made of enumerable own data properties.
 * Reflecting all own keys also rejects symbols and non-enumerable smuggling;
 * reading descriptors prevents an accessor from executing inside the decoder.
 */
function exactPlainDataRecord(
  value: unknown,
  expectedKeys: readonly AuthoritativeResourceKey[]
): Readonly<Record<AuthoritativeResourceKey, unknown>> | undefined {
  if (!plainRecord(value)) return undefined;
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length
      || ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key as AuthoritativeResourceKey))
    ) return undefined;

    const result = {} as Record<AuthoritativeResourceKey, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) {
        return undefined;
      }
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return undefined;
  }
}

function boundedU64(value: unknown): value is bigint {
  return typeof value === 'bigint'
    && value >= 0n
    && value <= MAX_REALM_RESOURCE_QUANTITY;
}

function boundedU128(value: unknown): value is bigint {
  return typeof value === 'bigint'
    && value >= 0n
    && value <= MAX_REALM_MARKS_BALANCE_MICROS;
}

function quantitiesFit(
  balances: RealmResourceBalances,
  pendingBalances: RealmResourceBalances
) {
  return REALM_ECONOMIC_RESOURCE_ORDER.every((key) => (
    balances[key] <= REALM_RESOURCE_BALANCE_CAP
    && pendingBalances[key] <= REALM_RESOURCE_BALANCE_CAP - balances[key]
  ));
}

/**
 * Fail-closed decoder for `get_my_resource_state_v1`.
 *
 * Transport/session authority must already be established. Requiring the
 * verified FID again prevents a valid response belonging to a different
 * identity from becoming the current player's presentation state.
 */
export function decodeRealmResourceProjection(
  value: unknown,
  expectedOwnFid: bigint
): RealmResourcePresentation | undefined {
  if (!boundedU64(expectedOwnFid) || expectedOwnFid === 0n) return undefined;
  const raw = exactPlainDataRecord(value, AUTHORITATIVE_RESOURCE_KEYS);
  if (raw === undefined) return undefined;

  if (
    !boundedU64(raw.fid)
    || raw.fid === 0n
    || raw.fid !== expectedOwnFid
    || !boundedU64(raw.food)
    || !boundedU64(raw.wood)
    || !boundedU64(raw.stone)
    || !boundedU64(raw.gold)
    || !boundedU64(raw.pendingFood)
    || !boundedU64(raw.pendingWood)
    || !boundedU64(raw.pendingStone)
    || !boundedU64(raw.pendingGold)
    || !boundedU128(raw.marksBalanceMicros)
    || !boundedU64(raw.observedAtMicros)
    || !boundedU64(raw.settledThroughMicros)
    || !boundedU64(raw.nextCollectAtMicros)
    || !boundedU64(raw.revision)
    || raw.resourcePolicyVersion !== REALM_RESOURCE_POLICY_VERSION
    || raw.marksPolicyVersion !== MARK_ATTRIBUTION_POLICY_ID
    || !isRealmTerrainKind(raw.terrainKind)
  ) return undefined;

  // A projection is contradictory if it settles in the future or advertises
  // a collection boundary that is not strictly after the observation.
  if (
    raw.settledThroughMicros > raw.observedAtMicros
    || raw.nextCollectAtMicros <= raw.observedAtMicros
  ) return undefined;

  const balances = Object.freeze({
    food: raw.food,
    wood: raw.wood,
    stone: raw.stone,
    gold: raw.gold
  });
  const pendingBalances = Object.freeze({
    food: raw.pendingFood,
    wood: raw.pendingWood,
    stone: raw.pendingStone,
    gold: raw.pendingGold
  });
  if (!quantitiesFit(balances, pendingBalances)) return undefined;

  return Object.freeze({
    status: 'ready' as const,
    fid: raw.fid,
    balances,
    pendingBalances,
    marksBalanceMicros: raw.marksBalanceMicros,
    observedAtMicros: raw.observedAtMicros,
    settledThroughMicros: raw.settledThroughMicros,
    nextCollectAtMicros: raw.nextCollectAtMicros,
    revision: raw.revision,
    resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
    marksPolicyVersion: raw.marksPolicyVersion,
    terrainKind: raw.terrainKind
  });
}

const COMPACT_RESOURCE_SCALES = Object.freeze([
  { threshold: 1_000_000_000_000n, divisor: 1_000_000_000_000n, suffix: 'T' },
  { threshold: 1_000_000_000n, divisor: 1_000_000_000n, suffix: 'B' },
  { threshold: 1_000_000n, divisor: 1_000_000n, suffix: 'M' },
  { threshold: 1_000n, divisor: 1_000n, suffix: 'K' }
]);
const MICROS_PER_VISIBLE_MARK = 1_000_000n;
const COMPACT_MARK_SCALES = Object.freeze([
  { threshold: 1_000_000_000_000_000n, divisor: 1_000_000_000_000_000n, suffix: 'Q' },
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
  if (!boundedU64(value)) return undefined;
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
  return boundedU64(value) ? value.toString() : undefined;
}

/** Keeps the visible Marks rail bounded while exact micros remain in its aria label. */
export function formatCompactRealmMarkMicros(value: unknown): string | undefined {
  if (!boundedU128(value)) return undefined;
  const wholeMarks = value / MICROS_PER_VISIBLE_MARK;
  if (wholeMarks < 1_000n) {
    const hundredths = (value * 100n) / MICROS_PER_VISIBLE_MARK;
    if (value > 0n && hundredths === 0n) return '<0.01';
    const whole = hundredths / 100n;
    const fraction = hundredths % 100n;
    if (fraction === 0n) return whole.toString();
    return `${whole}.${fraction.toString().padStart(2, '0').replace(/0+$/, '')}`;
  }

  if (wholeMarks >= 1_000_000_000_000_000_000n) {
    const digits = wholeMarks.toString();
    return `${digits[0]}.${digits[1]}e${digits.length - 1}`;
  }

  const scale = COMPACT_MARK_SCALES.find(({ threshold }) => wholeMarks >= threshold);
  if (scale) {
    const tenths = (value * 10n) / (MICROS_PER_VISIBLE_MARK * scale.divisor);
    const whole = tenths / 10n;
    const fraction = tenths % 10n;
    return fraction === 0n || whole >= 100n
      ? `${whole}${scale.suffix}`
      : `${whole}.${fraction}${scale.suffix}`;
  }
  return wholeMarks.toString();
}
