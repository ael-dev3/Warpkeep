import { describe, expect, it } from 'vitest';

import {
  FOOD_EXPEDITION_GATHERING_DURATION_MICROS,
  FOOD_EXPEDITION_POLICY_VERSION,
  createFoodExpeditionIdempotencyKey,
  decodeFoodExpeditionPresentation,
  foodExpeditionForNode
} from '../src/components/realm/realmFoodExpeditionPresentation';

function activeRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    expeditionId: '00000000-0000-4000-8000-000000000001',
    siteId: 'genesis-001:food:0001',
    originCastleId: 7n,
    phase: 'gathering',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 30n,
    returnsAtMicros: 40n,
    accruedFood: 3n,
    pendingFood: 3n,
    creditedFood: 0n,
    rateFoodPerMinute: 1n,
    gatheringDurationMicros: FOOD_EXPEDITION_GATHERING_DURATION_MICROS,
    expeditionPolicyVersion: FOOD_EXPEDITION_POLICY_VERSION,
    ...overrides
  };
}

describe('Food expedition private presentation boundary', () => {
  it('accepts only the exact Food procedure shape and joins it to its matching public occupation', () => {
    const state = decodeFoodExpeditionPresentation(activeRecord());
    expect(state).toMatchObject({
      status: 'ready',
      active: true,
      pendingFood: 3n,
      expedition: { originCastleId: 7, siteId: 'genesis-001:food:0001' }
    });
    expect(foodExpeditionForNode(state, {
      siteId: 'genesis-001:food:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    })).toBe(state);
    expect(foodExpeditionForNode(state, {
      siteId: 'genesis-001:food:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 31n,
      returnsAtMicros: 40n
    })).toBeUndefined();
  });

  it('fails closed for schema drift, wrong Food policy, unsafe ids, or non-unit Food rate', () => {
    expect(decodeFoodExpeditionPresentation({ ...activeRecord(), extra: true }))
      .toEqual({ status: 'unavailable' });
    expect(decodeFoodExpeditionPresentation(activeRecord({
      expeditionPolicyVersion: 'untrusted-policy'
    }))).toEqual({ status: 'unavailable' });
    expect(decodeFoodExpeditionPresentation(activeRecord({
      originCastleId: BigInt(Number.MAX_SAFE_INTEGER) + 1n
    }))).toEqual({ status: 'unavailable' });
    expect(decodeFoodExpeditionPresentation(activeRecord({ rateFoodPerMinute: 2n })))
      .toEqual({ status: 'unavailable' });
  });

  it('creates a UUIDv4 idempotency key only when browser-grade entropy exists', () => {
    const key = createFoodExpeditionIdempotencyKey();
    if (key !== undefined) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
