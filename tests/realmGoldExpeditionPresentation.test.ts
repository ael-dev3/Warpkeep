import { describe, expect, it } from 'vitest';

import {
  GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
  GOLD_EXPEDITION_POLICY_VERSION,
  createGoldExpeditionIdempotencyKey,
  decodeGoldExpeditionPresentation,
  goldExpeditionForNode
} from '../src/components/realm/realmGoldExpeditionPresentation';

function activeRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    expeditionId: '00000000-0000-4000-8000-000000000001',
    siteId: 'genesis-001:gold:0001',
    originCastleId: 7n,
    phase: 'gathering',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 30n,
    returnsAtMicros: 40n,
    accruedGold: 3n,
    pendingGold: 3n,
    creditedGold: 0n,
    rateGoldPerMinute: 1n,
    gatheringDurationMicros: GOLD_EXPEDITION_GATHERING_DURATION_MICROS,
    expeditionPolicyVersion: GOLD_EXPEDITION_POLICY_VERSION,
    ...overrides
  };
}

describe('Gold expedition private presentation boundary', () => {
  it('accepts exact bigint procedure values and exposes them only through a matching site/castle join', () => {
    const state = decodeGoldExpeditionPresentation(activeRecord());
    expect(state).toMatchObject({
      status: 'ready',
      active: true,
      pendingGold: 3n,
      expedition: { originCastleId: 7, siteId: 'genesis-001:gold:0001' }
    });
    expect(goldExpeditionForNode(state, {
      siteId: 'genesis-001:gold:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    })).toBe(state);
    expect(goldExpeditionForNode(state, {
      siteId: 'genesis-001:gold:other',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    })).toBeUndefined();
    expect(goldExpeditionForNode(state, {
      siteId: 'genesis-001:gold:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 31n,
      returnsAtMicros: 40n
    })).toBeUndefined();
  });

  it('fails closed for schema drift, mismatched policy, and unsafe u64 scene identifiers', () => {
    expect(decodeGoldExpeditionPresentation({ ...activeRecord(), extra: true }))
      .toEqual({ status: 'unavailable' });
    expect(decodeGoldExpeditionPresentation(activeRecord({
      expeditionPolicyVersion: 'untrusted-policy'
    }))).toEqual({ status: 'unavailable' });
    expect(decodeGoldExpeditionPresentation(activeRecord({
      originCastleId: BigInt(Number.MAX_SAFE_INTEGER) + 1n
    }))).toEqual({ status: 'unavailable' });
  });

  it('creates only UUIDv4 reducer idempotency keys when secure browser crypto is available', () => {
    const key = createGoldExpeditionIdempotencyKey();
    if (key !== undefined) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
