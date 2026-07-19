import { describe, expect, it } from 'vitest';

import {
  STONE_EXPEDITION_GATHERING_DURATION_MICROS,
  STONE_EXPEDITION_POLICY_VERSION,
  createStoneExpeditionIdempotencyKey,
  decodeStoneExpeditionPresentation,
  stoneExpeditionForNode
} from '../src/components/realm/realmStoneExpeditionPresentation';

function activeRecord(overrides: Record<string, unknown> = {}) {
  return {
    active: true,
    expeditionId: '00000000-0000-4000-8000-000000000001',
    siteId: 'genesis-001:stone:0001',
    originCastleId: 7n,
    phase: 'gathering',
    startedAtMicros: 10n,
    arrivesAtMicros: 20n,
    gatheringEndsAtMicros: 30n,
    returnsAtMicros: 40n,
    accruedStone: 3n,
    pendingStone: 3n,
    creditedStone: 0n,
    rateStonePerMinute: 1n,
    gatheringDurationMicros: STONE_EXPEDITION_GATHERING_DURATION_MICROS,
    expeditionPolicyVersion: STONE_EXPEDITION_POLICY_VERSION,
    ...overrides
  };
}

describe('Stone expedition private presentation boundary', () => {
  it('accepts only the exact Stone procedure shape and joins it to its matching public occupation', () => {
    const state = decodeStoneExpeditionPresentation(activeRecord());
    expect(state).toMatchObject({
      status: 'ready',
      active: true,
      pendingStone: 3n,
      expedition: { originCastleId: 7, siteId: 'genesis-001:stone:0001' }
    });
    expect(stoneExpeditionForNode(state, {
      siteId: 'genesis-001:stone:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 30n,
      returnsAtMicros: 40n
    })).toBe(state);
    expect(stoneExpeditionForNode(state, {
      siteId: 'genesis-001:stone:0001',
      originCastleId: 7,
      phase: 'gathering',
      startedAtMicros: 10n,
      arrivesAtMicros: 20n,
      gatheringEndsAtMicros: 31n,
      returnsAtMicros: 40n
    })).toBeUndefined();
  });

  it('fails closed for schema drift, accessors, wrong Stone policy, unsafe ids, or non-unit rate', () => {
    expect(decodeStoneExpeditionPresentation({ ...activeRecord(), extra: true }))
      .toEqual({ status: 'unavailable' });
    const accessorRecord = activeRecord();
    Object.defineProperty(accessorRecord, 'pendingStone', {
      enumerable: true,
      get: () => 3n
    });
    expect(decodeStoneExpeditionPresentation(accessorRecord))
      .toEqual({ status: 'unavailable' });
    expect(decodeStoneExpeditionPresentation(activeRecord({
      expeditionPolicyVersion: 'untrusted-policy'
    }))).toEqual({ status: 'unavailable' });
    expect(decodeStoneExpeditionPresentation(activeRecord({
      originCastleId: BigInt(Number.MAX_SAFE_INTEGER) + 1n
    }))).toEqual({ status: 'unavailable' });
    expect(decodeStoneExpeditionPresentation(activeRecord({ rateStonePerMinute: 2n })))
      .toEqual({ status: 'unavailable' });
  });

  it('creates a UUIDv4 idempotency key only when browser-grade entropy exists', () => {
    const key = createStoneExpeditionIdempotencyKey();
    if (key !== undefined) {
      expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
  });
});
