import { describe, expect, it } from 'vitest';

import {
  MAX_REALM_MARKS_BALANCE_MICROS,
  MAX_REALM_RESOURCE_QUANTITY,
  REALM_ECONOMIC_RESOURCE_ORDER,
  REALM_RESOURCE_BALANCE_CAP,
  REALM_RESOURCE_POLICY_VERSION,
  decodeRealmResourceProjection,
  formatCompactRealmResourceQuantity,
  formatExactRealmResourceQuantity,
  isRealmEconomicResourceKey
} from '../src/components/realm/realmResourcePresentation';

const OWN_FID = 539_854n;

function validResourceProjection() {
  return {
    fid: OWN_FID,
    food: 101n,
    wood: 202n,
    stone: 303n,
    gold: 404n,
    pendingFood: 11n,
    pendingWood: 12n,
    pendingStone: 13n,
    pendingGold: 14n,
    marksBalanceMicros: 5_000_000n,
    observedAtMicros: 2_000n,
    settledThroughMicros: 1_000n,
    nextCollectAtMicros: 2_500n,
    revision: 7n,
    resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
    marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
    terrainKind: 'forest'
  } as const;
}

describe('Realm resource presentation', () => {
  it('keeps the approved resource order separate from Marks', () => {
    expect(REALM_ECONOMIC_RESOURCE_ORDER).toEqual(['food', 'wood', 'stone', 'gold']);
    expect(isRealmEconomicResourceKey('food')).toBe(true);
    expect(isRealmEconomicResourceKey('marks')).toBe(false);
  });

  it('decodes the exact authenticated procedure result into deeply frozen state', () => {
    const decoded = decodeRealmResourceProjection(validResourceProjection(), OWN_FID);

    expect(decoded).toEqual({
      status: 'ready',
      fid: OWN_FID,
      balances: { food: 101n, wood: 202n, stone: 303n, gold: 404n },
      pendingBalances: { food: 11n, wood: 12n, stone: 13n, gold: 14n },
      marksBalanceMicros: 5_000_000n,
      observedAtMicros: 2_000n,
      settledThroughMicros: 1_000n,
      nextCollectAtMicros: 2_500n,
      revision: 7n,
      resourcePolicyVersion: REALM_RESOURCE_POLICY_VERSION,
      marksPolicyVersion: 'snap-current-linked-wallet-1to1-v1',
      terrainKind: 'forest'
    });
    expect(Object.isFrozen(decoded)).toBe(true);
    expect(decoded?.status === 'ready' && Object.isFrozen(decoded.balances)).toBe(true);
    expect(decoded?.status === 'ready' && Object.isFrozen(decoded.pendingBalances)).toBe(true);
  });

  it('rejects missing, extra, inherited, symbolic, non-enumerable, and accessor keys', () => {
    const valid = validResourceProjection();
    const { gold: _gold, ...missing } = valid;
    expect(decodeRealmResourceProjection(missing, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({ ...valid, clientAccrued: true }, OWN_FID)).toBeUndefined();

    const symbolic = { ...valid, [Symbol('contamination')]: true };
    expect(decodeRealmResourceProjection(symbolic, OWN_FID)).toBeUndefined();

    const nonEnumerable = { ...valid };
    Object.defineProperty(nonEnumerable, 'contamination', { value: true });
    expect(decodeRealmResourceProjection(nonEnumerable, OWN_FID)).toBeUndefined();

    const inherited = Object.assign(Object.create({ contamination: true }), valid);
    expect(decodeRealmResourceProjection(inherited, OWN_FID)).toBeUndefined();

    const accessor = { ...valid };
    Object.defineProperty(accessor, 'food', { enumerable: true, get: () => 101n });
    expect(decodeRealmResourceProjection(accessor, OWN_FID)).toBeUndefined();
  });

  it('rejects non-bigint, negative, oversized, zero, and mismatched FIDs', () => {
    for (const fid of [539_854, -1n, 0n, MAX_REALM_RESOURCE_QUANTITY + 1n, OWN_FID + 1n]) {
      expect(decodeRealmResourceProjection({ ...validResourceProjection(), fid }, OWN_FID))
        .toBeUndefined();
    }
    expect(decodeRealmResourceProjection(validResourceProjection(), 0n)).toBeUndefined();
    expect(decodeRealmResourceProjection(validResourceProjection(), MAX_REALM_RESOURCE_QUANTITY + 1n))
      .toBeUndefined();
  });

  it('rejects malformed economic quantities and u64 cap overflow', () => {
    const fields = [
      'food', 'wood', 'stone', 'gold',
      'pendingFood', 'pendingWood', 'pendingStone', 'pendingGold',
      'observedAtMicros', 'settledThroughMicros', 'nextCollectAtMicros', 'revision'
    ] as const;
    for (const field of fields) {
      for (const invalid of [1, -1n, MAX_REALM_RESOURCE_QUANTITY + 1n]) {
        expect(decodeRealmResourceProjection({
          ...validResourceProjection(),
          [field]: invalid
        }, OWN_FID)).toBeUndefined();
      }
    }

    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      food: REALM_RESOURCE_BALANCE_CAP,
      pendingFood: 1n
    }, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      gold: REALM_RESOURCE_BALANCE_CAP - 1n,
      pendingGold: 2n
    }, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      wood: REALM_RESOURCE_BALANCE_CAP + 1n,
      pendingWood: 0n
    }, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      food: REALM_RESOURCE_BALANCE_CAP,
      pendingFood: 0n
    }, OWN_FID)).toBeDefined();
  });

  it('rejects malformed Marks, policy, terrain, and contradictory timestamps', () => {
    for (const marksBalanceMicros of [1, -1n, MAX_REALM_MARKS_BALANCE_MICROS + 1n]) {
      expect(decodeRealmResourceProjection({
        ...validResourceProjection(),
        marksBalanceMicros
      }, OWN_FID)).toBeUndefined();
    }
    for (const resourcePolicyVersion of [
      '',
      'genesis-resource-yield-v2',
      `${REALM_RESOURCE_POLICY_VERSION} `
    ]) {
      expect(decodeRealmResourceProjection({
        ...validResourceProjection(),
        resourcePolicyVersion
      }, OWN_FID)).toBeUndefined();
    }
    for (const marksPolicyVersion of [
      '',
      ' snap-current-linked-wallet-1to1-v1',
      'snap-current-linked-wallet-1to1-v2',
      'SNAP-V1',
      'snap--v1',
      `a${'-a'.repeat(64)}`,
      'snap\u0000v1'
    ]) {
      expect(decodeRealmResourceProjection({
        ...validResourceProjection(),
        marksPolicyVersion
      }, OWN_FID)).toBeUndefined();
    }
    for (const terrainKind of ['', 'plains', 'Forest', 1]) {
      expect(decodeRealmResourceProjection({
        ...validResourceProjection(),
        terrainKind
      }, OWN_FID)).toBeUndefined();
    }

    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      settledThroughMicros: 2_001n
    }, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      nextCollectAtMicros: 2_000n
    }, OWN_FID)).toBeUndefined();
    expect(decodeRealmResourceProjection({
      ...validResourceProjection(),
      nextCollectAtMicros: 1_999n
    }, OWN_FID)).toBeUndefined();
  });

  it('accepts all seven canonical resource terrains', () => {
    for (const terrainKind of [
      'lowland',
      'meadow',
      'forest',
      'heath',
      'ridge',
      'lake',
      'ancient-stone'
    ] as const) {
      expect(decodeRealmResourceProjection({
        ...validResourceProjection(),
        terrainKind
      }, OWN_FID)).toMatchObject({ status: 'ready', terrainKind });
    }
  });

  it('formats non-negative bounded quantities without floating-point authority', () => {
    expect(formatCompactRealmResourceQuantity(999n)).toBe('999');
    expect(formatCompactRealmResourceQuantity(1_500n)).toBe('1.5K');
    expect(formatCompactRealmResourceQuantity(999_999n)).toBe('999K');
    expect(formatCompactRealmResourceQuantity(1_250_000n)).toBe('1.2M');
    expect(formatCompactRealmResourceQuantity(MAX_REALM_RESOURCE_QUANTITY)).toBe('18446744T');
    expect(formatCompactRealmResourceQuantity(-1n)).toBeUndefined();
    expect(formatCompactRealmResourceQuantity(MAX_REALM_RESOURCE_QUANTITY + 1n)).toBeUndefined();
    expect(formatExactRealmResourceQuantity(12_345n)).toBe('12345');
    expect(formatExactRealmResourceQuantity(12.5)).toBeUndefined();
  });
});
