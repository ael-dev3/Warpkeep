import {
  isWoodNodeOccupationPhase,
  type WoodNodeOccupationPhase
} from './realmWoodNodePresentation';
import { createExpeditionIdempotencyKey } from '../../spacetime/expeditionIdempotencyKey';

export const WOOD_EXPEDITION_POLICY_VERSION = 'genesis-wood-logging-camp-expedition-v1' as const;
export const WOOD_EXPEDITION_RATE_PER_MINUTE = 1n;
export const WOOD_EXPEDITION_GATHERING_DURATION_MICROS =
  30n * 24n * 60n * 60n * 1_000_000n;

const U64_MAX = (1n << 64n) - 1n;
const WOOD_EXPEDITION_RESPONSE_KEYS = Object.freeze([
  'active',
  'expeditionId',
  'siteId',
  'originCastleId',
  'phase',
  'startedAtMicros',
  'arrivesAtMicros',
  'gatheringEndsAtMicros',
  'returnsAtMicros',
  'accruedWood',
  'pendingWood',
  'creditedWood',
  'rateWoodPerMinute',
  'gatheringDurationMicros',
  'expeditionPolicyVersion'
] as const);

type WoodExpeditionResponseKey = typeof WOOD_EXPEDITION_RESPONSE_KEYS[number];

export type ReadyWoodExpeditionPresentation = Readonly<{
  status: 'ready';
  active: boolean;
  accruedWood: bigint;
  pendingWood: bigint;
  creditedWood: bigint;
  rateWoodPerMinute: bigint;
  gatheringDurationMicros: bigint;
  expedition?: Readonly<{
    expeditionId: string;
    siteId: string;
    originCastleId: number;
    phase: WoodNodeOccupationPhase;
    startedAtMicros: bigint;
    arrivesAtMicros: bigint;
    gatheringEndsAtMicros: bigint;
    returnsAtMicros: bigint;
    policyVersion: typeof WOOD_EXPEDITION_POLICY_VERSION;
  }>;
}>;

export type WoodExpeditionPresentation =
  | Readonly<{ status: 'unavailable' }>
  | ReadyWoodExpeditionPresentation;

/** Browser CSPRNG only; missing entropy disables dispatch instead of guessing. */
export function createWoodExpeditionIdempotencyKey(): string | undefined {
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
    keys.length !== WOOD_EXPEDITION_RESPONSE_KEYS.length
    || keys.some((key) => typeof key !== 'string' || !WOOD_EXPEDITION_RESPONSE_KEYS.includes(key as WoodExpeditionResponseKey))
  ) return undefined;
  const result = {} as Record<WoodExpeditionResponseKey, unknown>;
  for (const key of WOOD_EXPEDITION_RESPONSE_KEYS) {
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

function inactiveProjection(raw: Readonly<Record<WoodExpeditionResponseKey, unknown>>) {
  return raw.expeditionId === undefined
    && raw.siteId === undefined
    && raw.originCastleId === undefined
    && raw.phase === undefined
    && raw.startedAtMicros === undefined
    && raw.arrivesAtMicros === undefined
    && raw.gatheringEndsAtMicros === undefined
    && raw.returnsAtMicros === undefined
    && raw.expeditionPolicyVersion === undefined
    && raw.accruedWood === 0n
    && raw.pendingWood === 0n
    && raw.creditedWood === 0n;
}

/** Strict owner-only Wood projection: bad data disables Wood controls only. */
export function decodeWoodExpeditionPresentation(value: unknown): WoodExpeditionPresentation {
  const raw = exactDataRecord(value);
  if (
    raw === undefined
    || typeof raw.active !== 'boolean'
    || !isU64(raw.accruedWood)
    || !isU64(raw.pendingWood)
    || !isU64(raw.creditedWood)
    || raw.rateWoodPerMinute !== WOOD_EXPEDITION_RATE_PER_MINUTE
    || raw.gatheringDurationMicros !== WOOD_EXPEDITION_GATHERING_DURATION_MICROS
    || raw.creditedWood > raw.accruedWood
  ) return { status: 'unavailable' };

  if (!raw.active) {
    if (!inactiveProjection(raw)) return { status: 'unavailable' };
    return Object.freeze({
      status: 'ready' as const,
      active: false,
      accruedWood: raw.accruedWood,
      pendingWood: raw.pendingWood,
      creditedWood: raw.creditedWood,
      rateWoodPerMinute: raw.rateWoodPerMinute,
      gatheringDurationMicros: raw.gatheringDurationMicros
    });
  }

  if (
    !isSafeId(raw.expeditionId)
    || !isSafeId(raw.siteId)
    || safePositiveU64AsNumber(raw.originCastleId) === undefined
    || !isWoodNodeOccupationPhase(raw.phase)
    || !isU64(raw.startedAtMicros)
    || !isU64(raw.arrivesAtMicros)
    || !isU64(raw.gatheringEndsAtMicros)
    || !isU64(raw.returnsAtMicros)
    || raw.startedAtMicros >= raw.arrivesAtMicros
    || raw.arrivesAtMicros >= raw.gatheringEndsAtMicros
    || raw.gatheringEndsAtMicros >= raw.returnsAtMicros
    || raw.expeditionPolicyVersion !== WOOD_EXPEDITION_POLICY_VERSION
  ) return { status: 'unavailable' };

  const originCastleId = safePositiveU64AsNumber(raw.originCastleId);
  if (originCastleId === undefined) return { status: 'unavailable' };
  return Object.freeze({
    status: 'ready' as const,
    active: true,
    accruedWood: raw.accruedWood,
    pendingWood: raw.pendingWood,
    creditedWood: raw.creditedWood,
    rateWoodPerMinute: raw.rateWoodPerMinute,
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

/** A private Wood value is usable only when it exactly joins the public site. */
export function woodExpeditionForNode(
  value: WoodExpeditionPresentation | undefined,
  node: Readonly<{
    siteId: string;
    originCastleId: number;
    phase: WoodNodeOccupationPhase;
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
