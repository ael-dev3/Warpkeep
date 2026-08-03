import { describe, expect, it } from 'vitest';

import {
  REALM_LIVING_REALM_BUDGETS,
  resolveRealmLivingRealmBudget
} from '../src/components/realm/realmQuality';
import { REALM_RABBIT_RUNTIME_ASSET } from '../src/components/realm/realmRabbitRuntimeAsset';

describe('Living Realm quality budgets', () => {
  it('keeps High and Balanced within the hard V1 limits', () => {
    expect(REALM_LIVING_REALM_BUDGETS.high).toMatchObject({
      grassDisturbanceSlots: 8,
      waterRippleSlots: 4,
      birdInstances: 12,
      rabbitInstances: 10,
      moteCount: 36,
      transientParticleCount: 96,
      plannerHz: 10,
      addedDrawCalls: 3,
      addedTriangles: 1_484
    });
    expect(REALM_LIVING_REALM_BUDGETS.balanced).toMatchObject({
      grassDisturbanceSlots: 4,
      waterRippleSlots: 2,
      birdInstances: 6,
      rabbitInstances: 6,
      moteCount: 18,
      transientParticleCount: 48,
      plannerHz: 7,
      addedDrawCalls: 3,
      addedTriangles: 888
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

  it.each(['high', 'balanced'] as const)(
    'derives the declared %s ecology draw and triangle ceilings from concrete layers',
    (quality) => {
      const budget = REALM_LIVING_REALM_BUDGETS[quality];
      const birdTriangles = budget.birdInstances * 2;
      const rabbitTriangles = budget.rabbitInstances
        * REALM_RABBIT_RUNTIME_ASSET.triangles;
      expect(budget.addedDrawCalls).toBe(
        Number(budget.birdInstances > 0)
        + Number(budget.moteCount + budget.transientParticleCount > 0)
        + Number(budget.rabbitInstances > 0)
      );
      expect(budget.addedTriangles).toBe(birdTriangles + rabbitTriangles);
    }
  );
});
