import { describe, expect, it } from 'vitest';

import {
  WOOD_EXPEDITION_GATHERING_DURATION_MICROS,
  WOOD_EXPEDITION_POLICY_VERSION,
  createWoodExpeditionIdempotencyKey,
  decodeWoodExpeditionPresentation,
  woodExpeditionForNode
} from '../src/components/realm/realmWoodExpeditionPresentation';

function activeRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    expeditionId: '00000000-0000-4000-8000-000000000001',
    siteId: 'genesis-001:wood:0001',
    originCastleId: 7n,
    phase: 'gathering',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 30n,
    returnsAtMicros: 40n,
    accruedWood: 3n,
    pendingWood: 3n,
    creditedWood: 0n,
    rateWoodPerMinute: 1n,
    gatheringDurationMicros: WOOD_EXPEDITION_GATHERING_DURATION_MICROS,
    expeditionPolicyVersion: WOOD_EXPEDITION_POLICY_VERSION,
    ...overrides
  };
}

describe('Wood expedition private presentation boundary', () => {
  it('accepts only the exact Wood procedure shape and joins it to its matching public occupation', () => {
    const state = decodeWoodExpeditionPresentation(activeRecord());
    expect(state).toMatchObject({
      status: 'ready',
      active: true,
      pendingWood: 3n,
      expedition: { originCastleId: 7, siteId: 'genesis-001:wood:0001' }
    });
    expect(woodExpeditionForNode(state, {
      siteId: 'genesis-001:wood:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    })).toBe(state);
    expect(woodExpeditionForNode(state, {
      siteId: 'genesis-001:wood:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 31n,
      returnsAtMicros: 40n
    })).toBeUndefined();
  });

  it('fails closed for schema drift, wrong Wood policy, unsafe ids, or non-unit Wood rate', () => {
    expect(decodeWoodExpeditionPresentation({ ...activeRecord(), extra: true }))
      .toEqual({ status: 'unavailable' });
    expect(decodeWoodExpeditionPresentation(activeRecord({
      expeditionPolicyVersion: 'untrusted-policy'
    }))).toEqual({ status: 'unavailable' });
    expect(decodeWoodExpeditionPresentation(activeRecord({
      originCastleId: BigInt(Number.MAX_SAFE_INTEGER) + 1n
    }))).toEqual({ status: 'unavailable' });
    expect(decodeWoodExpeditionPresentation(activeRecord({ rateWoodPerMinute: 2n })))
      .toEqual({ status: 'unavailable' });
  });

  it('creates a UUIDv4 idempotency key only when browser-grade entropy exists', () => {
    const key = createWoodExpeditionIdempotencyKey();
    if (key !== undefined) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
