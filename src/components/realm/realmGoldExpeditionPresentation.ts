import {
  isGoldNodeOccupationPhase,
  type GoldNodeOccupationPhase
} from './realmGoldNodePresentation';
import { createExpeditionIdempotencyKey } from '../../spacetime/expeditionIdempotencyKey';

export const GOLD_EXPEDITION_POLICY_VERSION = 'genesis-gold-wagon-expedition-v1' as const;
export const GOLD_EXPEDITION_RATE_PER_MINUTE = 1n;
export const GOLD_EXPEDITION_GATHERING_DURATION_MICROS =
  30n * 24n * 60n * 60n * 1_000_000n;
const U64_MAX = (1n << 64n) - 1n;

const GOLD_EXPEDITION_RESPONSE_KEYS = Object.freeze([
  'active',
  'expeditionId',
  'siteId',
  'originCastleId',
  'phase',
  'startedAtMicros',
  'arrivesAtMicros',
  'gatheringEndsAtMicros',
  'returnsAtMicros',
  'accruedGold',
  'pendingGold',
  'creditedGold',
  'rateGoldPerMinute',
  'gatheringDurationMicros',
  'expeditionPolicyVersion'
] as const);

type GoldExpeditionResponseKey = typeof GOLD_EXPEDITION_RESPONSE_KEYS[number];

export type ReadyGoldExpeditionPresentation = Readonly<{
  status: 'ready';
  active: boolean;
  accruedGold: bigint;
  pendingGold: bigint;
  creditedGold: bigint;
  rateGoldPerMinute: bigint;
  gatheringDurationMicros: bigint;
  /** Present only for the authenticated player's active server record. */
  expedition?: Readonly<{
    expeditionId: string;
    siteId: string;
    originCastleId: number;
    phase: GoldNodeOccupationPhase;
    startedAtMicros: bigint;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
    policyVersion: typeof GOLD_EXPEDITION_POLICY_VERSION;
  }>;
}>;

export type GoldExpeditionPresentation =
  | Readonly<{ status: 'unavailable' }>
  | ReadyGoldExpeditionPresentation;

/**
 * Produces a reducer idempotency key only from browser CSPRNG entropy. A
 * missing secure RNG means no dispatch should be attempted; falling back to
 * Math.random would turn a harmless retry guard into a replay/collision risk.
 */
export function createGoldExpeditionIdempotencyKey(): string | undefined {
  return createExpeditionIdempotencyKey();
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
    keys.length !== GOLD_EXPEDITION_RESPONSE_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !GOLD_EXPEDITION_RESPONSE_KEYS.includes(key as GoldExpeditionResponseKey))
  ) return undefined;
  const result = {} as Record<GoldExpeditionResponseKey, unknown>;
  for (const key of GOLD_EXPEDITION_RESPONSE_KEYS) {
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
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  }
  if (
    typeof value === 'bigint'
    && value > 0n
    && value <= BigInt(Number.MAX_SAFE_INTEGER)
  ) return Number(value);
  return undefined;
}

function inactiveProjection(raw: Readonly<Record<GoldExpeditionResponseKey, unknown>>) {
  return raw.expeditionId === undefined
    && raw.siteId === undefined
    && raw.originCastleId === undefined
    && raw.phase === undefined
    && raw.startedAtMicros === undefined
    && raw.arrivesAtMicros === undefined
    && raw.gatheringEndsAtMicros === undefined
    && raw.returnsAtMicros === undefined
    && raw.expeditionPolicyVersion === undefined
    && raw.accruedGold === 0n
    && raw.pendingGold === 0n
    && raw.creditedGold === 0n;
}

/**
 * Exact, private procedure decoder. It intentionally has no browser fallback
 * for active expeditions: malformed owner-only data stays unavailable rather
 * than displaying an unverified pending-Gold figure.
 */
export function decodeGoldExpeditionPresentation(value: unknown): GoldExpeditionPresentation {
  const raw = exactDataRecord(value);
  if (
    raw === undefined
    || typeof raw.active !== 'boolean'
    || !isU64(raw.accruedGold)
    || !isU64(raw.pendingGold)
    || !isU64(raw.creditedGold)
    || raw.rateGoldPerMinute !== GOLD_EXPEDITION_RATE_PER_MINUTE
    || raw.gatheringDurationMicros !== GOLD_EXPEDITION_GATHERING_DURATION_MICROS
    || raw.creditedGold > raw.accruedGold
  ) return { status: 'unavailable' };

  if (!raw.active) {
    if (!inactiveProjection(raw)) return { status: 'unavailable' };
    return Object.freeze({
      status: 'ready' as const,
      active: false,
      accruedGold: raw.accruedGold,
      pendingGold: raw.pendingGold,
      creditedGold: raw.creditedGold,
      rateGoldPerMinute: raw.rateGoldPerMinute,
      gatheringDurationMicros: raw.gatheringDurationMicros
    });
  }

  if (
    !isSafeId(raw.expeditionId)
    || !isSafeId(raw.siteId)
    || safePositiveU64AsNumber(raw.originCastleId) === undefined
    || !isGoldNodeOccupationPhase(raw.phase)
    || !isU64(raw.startedAtMicros)
    || !isU64(raw.arrivesAtMicros)
    || !isU64(raw.gatheringEndsAtMicros)
    || !isU64(raw.returnsAtMicros)
    || raw.startedAtMicros >= raw.arrivesAtMicros
    || raw.arrivesAtMicros >= raw.gatheringEndsAtMicros
    || raw.gatheringEndsAtMicros >= raw.returnsAtMicros
    || raw.expeditionPolicyVersion !== GOLD_EXPEDITION_POLICY_VERSION
  ) return { status: 'unavailable' };

  const originCastleId = safePositiveU64AsNumber(raw.originCastleId);
  // The condition above proves the conversion. Keep the explicit guard so a
  // future edit cannot accidentally emit an unbounded u64 into scene state.
  if (originCastleId === undefined) return { status: 'unavailable' };

  return Object.freeze({
    status: 'ready' as const,
    active: true,
    accruedGold: raw.accruedGold,
    pendingGold: raw.pendingGold,
    creditedGold: raw.creditedGold,
    rateGoldPerMinute: raw.rateGoldPerMinute,
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

/** Only an exact own private record may reveal pending Gold in an inspector. */
export function goldExpeditionForNode(
  value: GoldExpeditionPresentation | undefined,
  node: Readonly<{
    siteId: string;
    originCastleId: number;
    phase: GoldNodeOccupationPhase;
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
