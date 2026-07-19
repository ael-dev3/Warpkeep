import {
  isStoneNodeOccupationPhase,
  type StoneNodeOccupationPhase
} from './realmStoneNodePresentation';
import { createExpeditionIdempotencyKey } from '../../spacetime/expeditionIdempotencyKey';

export const STONE_EXPEDITION_POLICY_VERSION = 'genesis-stone-quarry-expedition-v1' as const;
export const STONE_EXPEDITION_RATE_PER_MINUTE = 1n;
export const STONE_EXPEDITION_GATHERING_DURATION_MICROS =
  30n * 24n * 60n * 60n * 1_000_000n;

const U64_MAX = (1n << 64n) - 1n;
const STONE_EXPEDITION_RESPONSE_KEYS = Object.freeze([
  'active',
  'expeditionId',
  'siteId',
  'originCastleId',
  'phase',
  'startedAtMicros',
  'arrivesAtMicros',
  'gatheringEndsAtMicros',
  'returnsAtMicros',
  'accruedStone',
  'pendingStone',
  'creditedStone',
  'rateStonePerMinute',
  'gatheringDurationMicros',
  'expeditionPolicyVersion'
] as const);

type StoneExpeditionResponseKey = typeof STONE_EXPEDITION_RESPONSE_KEYS[number];

export type ReadyStoneExpeditionPresentation = Readonly<{
  status: 'ready';
  active: boolean;
  accruedStone: bigint;
  pendingStone: bigint;
  creditedStone: bigint;
  rateStonePerMinute: bigint;
  gatheringDurationMicros: bigint;
  expedition?: Readonly<{
    expeditionId: string;
    siteId: string;
    originCastleId: number;
    phase: StoneNodeOccupationPhase;
    startedAtMicros: bigint;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
    policyVersion: typeof STONE_EXPEDITION_POLICY_VERSION;
  }>;
}>;

export type StoneExpeditionPresentation =
  | Readonly<{ status: 'unavailable' }>
  | ReadyStoneExpeditionPresentation;

/** Browser CSPRNG only; missing entropy disables dispatch instead of guessing. */
export function createStoneExpeditionIdempotencyKey(): string | undefined {
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
    keys.length !== STONE_EXPEDITION_RESPONSE_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !STONE_EXPEDITION_RESPONSE_KEYS.includes(key as StoneExpeditionResponseKey))
  ) return undefined;
  const result = {} as Record<StoneExpeditionResponseKey, unknown>;
  for (const key of STONE_EXPEDITION_RESPONSE_KEYS) {
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

function inactiveProjection(raw: Readonly<Record<StoneExpeditionResponseKey, unknown>>) {
  return raw.expeditionId === undefined
    && raw.siteId === undefined
    && raw.originCastleId === undefined
    && raw.phase === undefined
    && raw.startedAtMicros === undefined
    && raw.arrivesAtMicros === undefined
    && raw.gatheringEndsAtMicros === undefined
    && raw.returnsAtMicros === undefined
    && raw.expeditionPolicyVersion === undefined
    && raw.accruedStone === 0n
    && raw.pendingStone === 0n
    && raw.creditedStone === 0n;
}

/** Strict owner-only Stone projection: bad data disables Stone controls only. */
export function decodeStoneExpeditionPresentation(value: unknown): StoneExpeditionPresentation {
  const raw = exactDataRecord(value);
  if (
    raw === undefined
    || typeof raw.active !== 'boolean'
    || !isU64(raw.accruedStone)
    || !isU64(raw.pendingStone)
    || !isU64(raw.creditedStone)
    || raw.rateStonePerMinute !== STONE_EXPEDITION_RATE_PER_MINUTE
    || raw.gatheringDurationMicros !== STONE_EXPEDITION_GATHERING_DURATION_MICROS
    || raw.creditedStone > raw.accruedStone
  ) return { status: 'unavailable' };

  if (!raw.active) {
    if (!inactiveProjection(raw)) return { status: 'unavailable' };
    return Object.freeze({
      status: 'ready' as const,
      active: false,
      accruedStone: raw.accruedStone,
      pendingStone: raw.pendingStone,
      creditedStone: raw.creditedStone,
      rateStonePerMinute: raw.rateStonePerMinute,
      gatheringDurationMicros: raw.gatheringDurationMicros
    });
  }

  if (
    !isSafeId(raw.expeditionId)
    || !isSafeId(raw.siteId)
    || safePositiveU64AsNumber(raw.originCastleId) === undefined
    || !isStoneNodeOccupationPhase(raw.phase)
    || !isU64(raw.startedAtMicros)
    || !isU64(raw.arrivesAtMicros)
    || !isU64(raw.gatheringEndsAtMicros)
    || !isU64(raw.returnsAtMicros)
    || raw.startedAtMicros >= raw.arrivesAtMicros
    || raw.arrivesAtMicros >= raw.gatheringEndsAtMicros
    || raw.gatheringEndsAtMicros >= raw.returnsAtMicros
    || raw.expeditionPolicyVersion !== STONE_EXPEDITION_POLICY_VERSION
  ) return { status: 'unavailable' };

  const originCastleId = safePositiveU64AsNumber(raw.originCastleId);
  if (originCastleId === undefined) return { status: 'unavailable' };
  return Object.freeze({
    status: 'ready' as const,
    active: true,
    accruedStone: raw.accruedStone,
    pendingStone: raw.pendingStone,
    creditedStone: raw.creditedStone,
    rateStonePerMinute: raw.rateStonePerMinute,
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

/** A private Stone value is usable only when it exactly joins the public site. */
export function stoneExpeditionForNode(
  value: StoneExpeditionPresentation | undefined,
  node: Readonly<{
    siteId: string;
    originCastleId: number;
    phase: StoneNodeOccupationPhase;
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
