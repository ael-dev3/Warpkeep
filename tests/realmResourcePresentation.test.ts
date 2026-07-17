import { describe, expect, it } from 'vitest';

import {
  formatCompactRealmResourceQuantity,
  formatExactRealmResourceQuantity,
  isRealmEconomicResourceKey,
  REALM_ECONOMIC_RESOURCE_ORDER,
  type RealmResourcePresentation
} from '../src/components/realm/realmResourcePresentation';

describe('realm resource presentation contract', () => {
  it('keeps the future economic resource family stable and excludes Marks', () => {
    expect(REALM_ECONOMIC_RESOURCE_ORDER).toEqual(['food', 'wood', 'stone', 'gold']);
    expect(isRealmEconomicResourceKey('food')).toBe(true);
    expect(isRealmEconomicResourceKey('gold')).toBe(true);
    expect(isRealmEconomicResourceKey('marks')).toBe(false);
  });

  it('formats compact quantities without a Number conversion or false zero', () => {
    expect(formatCompactRealmResourceQuantity(0n)).toBe('0');
    expect(formatCompactRealmResourceQuantity(1n)).toBe('1');
    expect(formatCompactRealmResourceQuantity(999n)).toBe('999');
    expect(formatCompactRealmResourceQuantity(1_200n)).toBe('1.2K');
    expect(formatCompactRealmResourceQuantity(12_400n)).toBe('12.4K');
    expect(formatCompactRealmResourceQuantity(999_999n)).toBe('999K');
    expect(formatCompactRealmResourceQuantity(1_200_000n)).toBe('1.2M');
    expect(formatCompactRealmResourceQuantity(1_200_000_000n)).toBe('1.2B');
    expect(formatCompactRealmResourceQuantity(1_200_000_000_000n)).toBe('1.2T');
  });

  it('keeps exact labels exact and fails closed for missing or invalid values', () => {
    const beyondSafeInteger = 9_007_199_254_740_993n;
    expect(formatCompactRealmResourceQuantity(beyondSafeInteger)).toBe('9007T');
    expect(formatExactRealmResourceQuantity(beyondSafeInteger)).toBe('9007199254740993');
    expect(formatCompactRealmResourceQuantity(undefined)).toBeUndefined();
    expect(formatCompactRealmResourceQuantity(-1n)).toBeUndefined();
    expect(formatExactRealmResourceQuantity('1000')).toBeUndefined();

    const loading: RealmResourcePresentation = { status: 'loading' };
    const unavailable: RealmResourcePresentation = { status: 'unavailable' };
    expect(loading.status).toBe('loading');
    expect(unavailable.status).toBe('unavailable');
  });
});
