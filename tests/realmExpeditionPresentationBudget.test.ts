import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_EXPEDITION_SCENE_LIMITS,
  HEGEMONY_LOGGING_CAMP_RENDER_LIMITS,
  HEGEMONY_WHEAT_FARM_RENDER_LIMITS,
  createRealmExpeditionSceneBudget
} from '../src/components/realm/realmExpeditionPresentationBudget';

describe('shared Gold, Food, and Wood expedition presentation budget', () => {
  it('keeps a Food-only High scene materially below the historic 72-mine cap', () => {
    const budget = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 0,
      foodNodeCount: 96,
      woodNodeCount: 0,
      mobile: false
    });

    expect(budget.gold.maximumRenderedNodes).toBe(0);
    expect(budget.food.maximumRenderedNodes).toBe(
      HEGEMONY_WHEAT_FARM_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(budget.food.maximumRenderedNodes).toBe(16);
    expect(budget.food.maximumRenderedNodes).toBeLessThan(
      HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high
    );
  });

  it('splits all node, wagon, and animation ceilings across concurrent Gold and Food layers', () => {
    const budget = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 0,
      mobile: false
    });

    expect(budget.gold.maximumRenderedNodes + budget.food.maximumRenderedNodes)
      .toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high);
    expect(budget.food.maximumRenderedNodes)
      .toBeLessThanOrEqual(HEGEMONY_WHEAT_FARM_RENDER_LIMITS.maximumRenderedNodes.high);
    expect(budget.gold.maximumRenderedWagons + budget.food.maximumRenderedWagons)
      .toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons.high);
    expect(
      budget.gold.wagonAnimationBudget.total + budget.food.wagonAnimationBudget.total
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop.total);
    expect(
      budget.gold.wagonAnimationBudget.highOrBalanced
      + budget.food.wagonAnimationBudget.highOrBalanced
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop.highOrBalanced);
    expect(budget.wood.maximumRenderedNodes).toBe(0);
  });

  it('preserves the Gold-only ceiling and applies the smaller combined mobile mixer limit', () => {
    const goldOnly = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 96,
      foodNodeCount: 0,
      woodNodeCount: 0,
      mobile: false
    });
    expect(goldOnly.gold.maximumRenderedNodes)
      .toBe(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high);
    expect(goldOnly.food.maximumRenderedNodes).toBe(0);

    const mobile = createRealmExpeditionSceneBudget({
      quality: 'balanced',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 0,
      mobile: true
    });
    expect(mobile.food.maximumRenderedNodes)
      .toBeLessThanOrEqual(HEGEMONY_WHEAT_FARM_RENDER_LIMITS.maximumRenderedNodes.balanced);
    expect(mobile.gold.wagonAnimationBudget.total + mobile.food.wagonAnimationBudget.total)
      .toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile.total);
    expect(
      mobile.gold.wagonAnimationBudget.highOrBalanced
      + mobile.food.wagonAnimationBudget.highOrBalanced
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile.highOrBalanced);
  });

  it('gives a Wood-only Realm its reviewed Camp cap while retaining the shared ceiling', () => {
    const budget = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 0,
      foodNodeCount: 0,
      woodNodeCount: 96,
      mobile: false
    });

    expect(budget.gold.maximumRenderedNodes).toBe(0);
    expect(budget.food.maximumRenderedNodes).toBe(0);
    expect(budget.wood.maximumRenderedNodes).toBe(
      HEGEMONY_LOGGING_CAMP_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(budget.wood.maximumRenderedNodes).toBe(18);
    expect(budget.wood.maximumRenderedNodes).toBeLessThanOrEqual(
      HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high
    );
  });

  it('shares every ceiling across concurrent Gold, Food, and Wood layers', () => {
    const desktop = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 96,
      mobile: false
    });
    const mobile = createRealmExpeditionSceneBudget({
      quality: 'balanced',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 96,
      mobile: true
    });

    expect(
      desktop.gold.maximumRenderedNodes
      + desktop.food.maximumRenderedNodes
      + desktop.wood.maximumRenderedNodes
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high);
    expect(desktop.wood.maximumRenderedNodes).toBeLessThanOrEqual(
      HEGEMONY_LOGGING_CAMP_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(
      desktop.gold.maximumRenderedWagons
      + desktop.food.maximumRenderedWagons
      + desktop.wood.maximumRenderedWagons
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons.high);
    expect(
      desktop.gold.wagonAnimationBudget.total
      + desktop.food.wagonAnimationBudget.total
      + desktop.wood.wagonAnimationBudget.total
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop.total);
    expect(
      mobile.gold.wagonAnimationBudget.highOrBalanced
      + mobile.food.wagonAnimationBudget.highOrBalanced
      + mobile.wood.wagonAnimationBudget.highOrBalanced
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile.highOrBalanced);
  });
});
