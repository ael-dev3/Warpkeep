import { describe, expect, it } from 'vitest';

import {
  REALM_LIVING_REALM_BUDGETS,
  resolveRealmLivingRealmBudget
} from '../src/components/realm/realmQuality';

describe('Living Realm quality budgets', () => {
  it('keeps High and Balanced within the hard V1 limits', () => {
    expect(REALM_LIVING_REALM_BUDGETS.high).toMatchObject({
      grassDisturbanceSlots: 8,
      waterRippleSlots: 4,
      birdInstances: 12,
      moteCount: 36,
      transientParticleCount: 96,
      plannerHz: 10,
      addedDrawCalls: 2
    });
    expect(REALM_LIVING_REALM_BUDGETS.balanced).toMatchObject({
      grassDisturbanceSlots: 4,
      waterRippleSlots: 2,
      birdInstances: 6,
      moteCount: 18,
      transientParticleCount: 48,
      plannerHz: 7,
      addedDrawCalls: 2
    });
  });

  it('collapses all optional moving ecology for Reduced or reduced motion', () => {
    expect(Object.values(REALM_LIVING_REALM_BUDGETS.reduced).filter(Boolean))
      .toEqual([]);
    expect(resolveRealmLivingRealmBudget('high', true))
      .toBe(REALM_LIVING_REALM_BUDGETS.reduced);
    expect(resolveRealmLivingRealmBudget('balanced', false))
      .toBe(REALM_LIVING_REALM_BUDGETS.balanced);
  });
});
