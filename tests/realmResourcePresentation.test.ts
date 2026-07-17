import { describe, expect, it } from 'vitest';

import {
  MAX_REALM_RESOURCE_QUANTITY,
  REALM_ECONOMIC_RESOURCE_ORDER,
  decodeRealmResourceProjection,
  formatCompactRealmResourceQuantity,
  formatExactRealmResourceQuantity,
  isRealmEconomicResourceKey
} from '../src/components/realm/realmResourcePresentation';

describe('Realm resource presentation groundwork', () => {
  it('keeps the approved resource order separate from Marks', () => {
    expect(REALM_ECONOMIC_RESOURCE_ORDER).toEqual(['food', 'wood', 'stone', 'gold']);
    expect(isRealmEconomicResourceKey('food')).toBe(true);
    expect(isRealmEconomicResourceKey('marks')).toBe(false);
  });

  it('decodes only an exact bounded future server projection', () => {
    expect(decodeRealmResourceProjection({
      balances: { food: 1n, wood: 2n, stone: 3n, gold: 4n },
      observedAtMicros: 5n
    })).toEqual({
      status: 'ready',
      balances: { food: 1n, wood: 2n, stone: 3n, gold: 4n },
      observedAtMicros: 5n
    });
    for (const invalid of [
      null,
      { balances: { food: 1n, wood: 2n, stone: 3n } },
      { balances: { food: -1n, wood: 2n, stone: 3n, gold: 4n } },
      { balances: { food: MAX_REALM_RESOURCE_QUANTITY + 1n, wood: 2n, stone: 3n, gold: 4n } },
      { balances: { food: 1, wood: 2n, stone: 3n, gold: 4n } },
      { balances: { food: 1n, wood: 2n, stone: 3n, gold: 4n, marks: 5n } },
      { balances: { food: 1n, wood: 2n, stone: 3n, gold: 4n }, clientAccrued: true }
    ]) expect(decodeRealmResourceProjection(invalid)).toBeUndefined();
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
