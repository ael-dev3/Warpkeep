import {
  isFoodNodeOccupationPhase,
  type FoodNodeOccupationPhase
} from './realmFoodNodePresentation';

export const FOOD_EXPEDITION_POLICY_VERSION = 'genesis-food-wheat-farm-expedition-v1' as const;
export const FOOD_EXPEDITION_RATE_PER_MINUTE = 1n;
export const FOOD_EXPEDITION_GATHERING_DURATION_MICROS =
  30n * 24n * 60n * 60n * 1_000_000n;

const U64_MAX = (1n << 64n) - 1n;
const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FOOD_EXPEDITION_RESPONSE_KEYS = Object.freeze([
  'active',
  'expeditionId',
  'siteId',
  'originCastleId',
  'phase',
  'startedAtMicros',
  'arrivesAtMicros',
  'gatheringEndsAtMicros',
  'returnsAtMicros',
  'accruedFood',
  'pendingFood',
  'creditedFood',
  'rateFoodPerMinute',
  'gatheringDurationMicros',
  'expeditionPolicyVersion'
] as const);

type FoodExpeditionResponseKey = typeof FOOD_EXPEDITION_RESPONSE_KEYS[number];

export type ReadyFoodExpeditionPresentation = Readonly<{
  status: 'ready';
  active: boolean;
  accruedFood: bigint;
  pendingFood: bigint;
  creditedFood: bigint;
  rateFoodPerMinute: bigint;
  gatheringDurationMicros: bigint;
  expedition?: Readonly<{
    expeditionId: string;
    siteId: string;
    originCastleId: number;
    phase: FoodNodeOccupationPhase;
    startedAtMicros: bigint;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
    policyVersion: typeof FOOD_EXPEDITION_POLICY_VERSION;
  }>;
}>;

export type FoodExpeditionPresentation =
  | Readonly<{ status: 'unavailable' }>
  | ReadyFoodExpeditionPresentation;

/** Browser CSPRNG only; missing entropy disables dispatch instead of guessing. */
export function createFoodExpeditionIdempotencyKey(): string | undefined {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi) return undefined;
  if (typeof cryptoApi.randomUUID === 'function') {
    const key = cryptoApi.randomUUID();
    return UUID_V4_PATTERN.test(key) ? key.toLowerCase() : undefined;
  }
  if (typeof cryptoApi.getRandomValues !== 'function') return undefined;
  const bytes = cryptoApi.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0')).join('');
  const key = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return UUID_V4_PATTERN.test(key) ? key : undefined;
}

function plainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactDataRecord(value: unknown) {
  if (!plainRecord(value)) return undefined;
  const keys = Reflect.ownKeys(value);
  if (
    keys.length !== FOOD_EXPEDITION_RESPONSE_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !FOOD_EXPEDITION_RESPONSE_KEYS.includes(key as FoodExpeditionResponseKey))
  ) return undefined;
  const result = {} as Record<FoodExpeditionResponseKey, unknown>;
  for (const key of FOOD_EXPEDITION_RESPONSE_KEYS) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !('value' in descriptor)) return undefined;
    result[key] = descriptor.value;
  }
  return result;
}

function isU64(value: unknown): value is bigint {
  return typeof value === 'bigint' && value >= 0n && value <= U64_MAX;
}

function isSafeId(value: unknown, maximumLength = 96): value is string {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && value.trim() === value
    && /^[a-z0-9][a-z0-9:_-]*$/i.test(value);
}

function safePositiveU64AsNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  return typeof value === 'bigint' && value > 0n && value <= BigInt(Number.MAX_SAFE_INTEGER)
    ? Number(value)
    : undefined;
}

function inactiveProjection(raw: Readonly<Record<FoodExpeditionResponseKey, unknown>>) {
  return raw.expeditionId === undefined
    && raw.siteId === undefined
    && raw.originCastleId === undefined
    && raw.phase === undefined
    && raw.startedAtMicros === undefined
    && raw.arrivesAtMicros === undefined
    && raw.gatheringEndsAtMicros === undefined
    && raw.returnsAtMicros === undefined
    && raw.expeditionPolicyVersion === undefined
    && raw.accruedFood === 0n
    && raw.pendingFood === 0n
    && raw.creditedFood === 0n;
}

/** Strict owner-only Food projection: bad data disables Food controls only. */
export function decodeFoodExpeditionPresentation(value: unknown): FoodExpeditionPresentation {
  const raw = exactDataRecord(value);
  if (
    raw === undefined
    || typeof raw.active !== 'boolean'
    || !isU64(raw.accruedFood)
    || !isU64(raw.pendingFood)
    || !isU64(raw.creditedFood)
    || raw.rateFoodPerMinute !== FOOD_EXPEDITION_RATE_PER_MINUTE
    || raw.gatheringDurationMicros !== FOOD_EXPEDITION_GATHERING_DURATION_MICROS
    || raw.creditedFood > raw.accruedFood
  ) return { status: 'unavailable' };

  if (!raw.active) {
    if (!inactiveProjection(raw)) return { status: 'unavailable' };
    return Object.freeze({
      status: 'ready' as const,
      active: false,
      accruedFood: raw.accruedFood,
      pendingFood: raw.pendingFood,
      creditedFood: raw.creditedFood,
      rateFoodPerMinute: raw.rateFoodPerMinute,
      gatheringDurationMicros: raw.gatheringDurationMicros
    });
  }

  if (
    !isSafeId(raw.expeditionId)
    || !isSafeId(raw.siteId)
    || safePositiveU64AsNumber(raw.originCastleId) === undefined
    || !isFoodNodeOccupationPhase(raw.phase)
    || !isU64(raw.startedAtMicros)
    || !isU64(raw.arrivesAtMicros)
    || !isU64(raw.gatheringEndsAtMicros)
    || !isU64(raw.returnsAtMicros)
    || raw.startedAtMicros >= raw.arrivesAtMicros
    || raw.arrivesAtMicros >= raw.gatheringEndsAtMicros
    || raw.gatheringEndsAtMicros >= raw.returnsAtMicros
    || raw.expeditionPolicyVersion !== FOOD_EXPEDITION_POLICY_VERSION
  ) return { status: 'unavailable' };

  const originCastleId = safePositiveU64AsNumber(raw.originCastleId);
  if (originCastleId === undefined) return { status: 'unavailable' };
  return Object.freeze({
    status: 'ready' as const,
    active: true,
    accruedFood: raw.accruedFood,
    pendingFood: raw.pendingFood,
    creditedFood: raw.creditedFood,
    rateFoodPerMinute: raw.rateFoodPerMinute,
    gatheringDurationMicros: raw.gatheringDurationMicros,
    expedition: Object.freeze({
      expeditionId: raw.expeditionId,
      siteId: raw.siteId,
      originCastleId,
      phase: raw.phase,
      startedAtMicros: raw.startedAtMicros,
      arrivesAtMicros: raw.arrivesAtMicros,
      gatheringEndsAtMicros: raw.gatheringEndsAtMicros,
      returnsAtMicros: raw.returnsAtMicros,
      policyVersion: raw.expeditionPolicyVersion
    })
  });
}

/** A private Food value is usable only when it exactly joins the public site. */
export function foodExpeditionForNode(
  value: FoodExpeditionPresentation | undefined,
  node: Readonly<{
    siteId: string;
    originCastleId: number;
    phase: FoodNodeOccupationPhase;
    startedAtMicros: bigint;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
  }> | undefined
) {
  if (
    value?.status !== 'ready'
    || !value.active
    || value.expedition === undefined
    || node === undefined
    || value.expedition.siteId !== node.siteId
    || value.expedition.originCastleId !== node.originCastleId
    || value.expedition.phase !== node.phase
    || value.expedition.startedAtMicros !== node.startedAtMicros
    || value.expedition.arrivesAtMicros !== node.arrivesAtMicros
    || value.expedition.gatheringEndsAtMicros !== node.gatheringEndsAtMicros
    || value.expedition.returnsAtMicros !== node.returnsAtMicros
  ) return undefined;
  return value;
}
