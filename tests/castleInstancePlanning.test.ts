import { describe, expect, it } from 'vitest';

import {
  packCastleInstances,
  selectCastleLod,
  type CastleInstanceCandidate,
  type CastleLodPolicy
} from '../src/components/realm/castleInstancePlanning';

const POLICY: CastleLodPolicy = Object.freeze({
  highEnterPixels: 96,
  highExitPixels: 76,
  balancedEnterPixels: 36,
  balancedExitPixels: 28,
  maximumLod: 'high',
  selectedMinimumLod: 'high',
  highInstanceBudget: 8,
  balancedInstanceBudget: 24
});

function candidate(
  castleId: number,
  projectedDiameterPixels: number,
  visible = true,
  cameraDistance = castleId
): CastleInstanceCandidate<Readonly<{ q: number; r: number }>> {
  return {
    castleId,
    projectedDiameterPixels,
    cameraDistance,
    visible,
    data: { q: castleId, r: -castleId }
  };
}

describe('castle instance planning', () => {
  it('packs four castles deterministically and resolves both mapping directions', () => {
    const castles = [
      candidate(40, 12),
      candidate(10, 120),
      candidate(30, 52),
      candidate(20, 10)
    ];
    const first = packCastleInstances(castles, {
      policy: POLICY,
      selectedCastleId: 20
    });
    const reordered = packCastleInstances([...castles].reverse(), {
      policy: POLICY,
      selectedCastleId: 20
    });

    expect(first.buckets.high.map((entry) => entry.castleId)).toEqual([10, 20]);
    expect(first.buckets.balanced.map((entry) => entry.castleId)).toEqual([30]);
    expect(first.buckets.compact.map((entry) => entry.castleId)).toEqual([40]);
    expect(reordered.buckets).toEqual(first.buckets);
    expect(first.resolveCastleId('high', 1)).toBe(20);
    expect(first.resolveInstance(30)).toEqual({ lod: 'balanced', instanceId: 0 });
    expect(first.resolveInstance(40)).toEqual({ lod: 'compact', instanceId: 0 });
    expect(first.resolveCastleId('compact', 4)).toBeUndefined();
  });

  it('retains hysteresis across enter and exit thresholds', () => {
    expect(selectCastleLod(100, undefined, false, POLICY)).toBe('high');
    expect(selectCastleLod(80, 'high', false, POLICY)).toBe('high');
    expect(selectCastleLod(75, 'high', false, POLICY)).toBe('balanced');

    expect(selectCastleLod(35, 'compact', false, POLICY)).toBe('compact');
    expect(selectCastleLod(36, 'compact', false, POLICY)).toBe('balanced');
    expect(selectCastleLod(29, 'balanced', false, POLICY)).toBe('balanced');
    expect(selectCastleLod(27, 'balanced', false, POLICY)).toBe('compact');
  });

  it('promotes the selected castle without exceeding the device LOD ceiling', () => {
    expect(selectCastleLod(1, undefined, true, POLICY)).toBe('high');
    expect(selectCastleLod(1, undefined, false, POLICY)).toBe('compact');
    expect(selectCastleLod(1, undefined, true, {
      ...POLICY,
      maximumLod: 'balanced'
    })).toBe('balanced');
    expect(selectCastleLod(1, undefined, true, {
      ...POLICY,
      maximumLod: 'compact'
    })).toBe('compact');
  });

  it('rebuilds instance IDs after LOD changes without stale reverse mappings', () => {
    const initial = packCastleInstances([
      candidate(4, 12),
      candidate(3, 52),
      candidate(2, 120),
      candidate(1, 12)
    ], { policy: POLICY });
    const repacked = packCastleInstances([
      candidate(3, 100),
      candidate(1, 40),
      candidate(4, 12, false),
      candidate(2, 70)
    ], {
      policy: POLICY,
      previousLods: initial.lodByCastleId
    });

    expect(repacked.buckets.high.map((entry) => entry.castleId)).toEqual([3]);
    expect(repacked.buckets.balanced.map((entry) => entry.castleId)).toEqual([1, 2]);
    expect(repacked.buckets.compact).toEqual([]);
    expect(repacked.resolveInstance(1)).toEqual({ lod: 'balanced', instanceId: 0 });
    expect(repacked.resolveInstance(2)).toEqual({ lod: 'balanced', instanceId: 1 });
    expect(repacked.resolveCastleId('balanced', 0)).toBe(1);
    expect(repacked.resolveCastleId('balanced', 1)).toBe(2);
    expect(repacked.resolveInstance(4)).toBeUndefined();
    expect(repacked.lodByCastleId['4']).toBe('compact');
  });

  it('packs one hundred castles independently of subscription order', () => {
    const castles = Array.from({ length: 100 }, (_, index) => {
      const castleId = index + 1;
      const pixels = castleId % 3 === 0 ? 110 : castleId % 3 === 1 ? 48 : 12;
      return candidate(castleId, pixels);
    });
    const shuffled = [...castles].sort((left, right) => (
      ((left.castleId * 37) % 101) - ((right.castleId * 37) % 101)
    ));
    const first = packCastleInstances(castles, { policy: POLICY });
    const second = packCastleInstances(shuffled, { policy: POLICY });

    expect(first.totalVisible).toBe(100);
    expect(second.buckets).toEqual(first.buckets);
    expect(first.buckets.high).toHaveLength(POLICY.highInstanceBudget);
    expect(first.buckets.balanced).toHaveLength(POLICY.balancedInstanceBudget);
    expect(first.buckets.compact).toHaveLength(
      100 - POLICY.highInstanceBudget - POLICY.balancedInstanceBudget
    );
    (['compact', 'balanced', 'high'] as const).forEach((lod) => {
      const ids = first.buckets[lod].map((entry) => entry.castleId);
      expect(ids).toEqual([...ids].sort((left, right) => left - right));
      ids.forEach((castleId, instanceId) => {
        expect(first.resolveCastleId(lod, instanceId)).toBe(castleId);
        expect(first.resolveInstance(castleId)).toEqual({ lod, instanceId });
      });
    });
  });

  it('reserves bounded higher LODs for the selected and nearest visible castles', () => {
    const constrained = {
      ...POLICY,
      highInstanceBudget: 2,
      balancedInstanceBudget: 3
    };
    const castles = Array.from({ length: 10 }, (_, index) => (
      candidate(index + 1, 120, true, 10 - index)
    ));
    const packed = packCastleInstances(castles, {
      policy: constrained,
      selectedCastleId: 1
    });

    expect(packed.buckets.high.map((entry) => entry.castleId)).toEqual([1, 10]);
    expect(packed.buckets.balanced.map((entry) => entry.castleId)).toEqual([7, 8, 9]);
    expect(packed.buckets.compact.map((entry) => entry.castleId)).toEqual([2, 3, 4, 5, 6]);
    expect(packed.resolveInstance(1)?.lod).toBe('high');
  });

  it('fails closed for duplicate authoritative castle IDs', () => {
    expect(() => packCastleInstances([
      candidate(7, 20),
      candidate(7, 120)
    ])).toThrow(/duplicate castle ID/i);
  });
});
