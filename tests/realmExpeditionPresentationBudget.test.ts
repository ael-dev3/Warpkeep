import { describe, expect, it } from 'vitest';

import {
  HEGEMONY_EXPEDITION_SCENE_LIMITS,
  HEGEMONY_LOGGING_CAMP_RENDER_LIMITS,
  HEGEMONY_STONE_QUARRY_RENDER_LIMITS,
  HEGEMONY_WHEAT_FARM_RENDER_LIMITS,
  createRealmExpeditionSceneBudget
} from '../src/components/realm/realmExpeditionPresentationBudget';

describe('shared Gold, Food, Wood, and Stone expedition presentation budget', () => {
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

  it('gives a Stone-only Realm its reviewed Quarry cap while retaining the shared ceiling', () => {
    const budget = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 0,
      foodNodeCount: 0,
      woodNodeCount: 0,
      stoneNodeCount: 96,
      mobile: false
    });

    expect(budget.gold.maximumRenderedNodes).toBe(0);
    expect(budget.food.maximumRenderedNodes).toBe(0);
    expect(budget.wood.maximumRenderedNodes).toBe(0);
    expect(budget.stone.maximumRenderedNodes).toBe(
      HEGEMONY_STONE_QUARRY_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(budget.stone.maximumRenderedNodes).toBe(18);
    expect(budget.stone.maximumRenderedNodes).toBeLessThanOrEqual(
      HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high
    );
    expect(budget.stone.maximumRenderedWagons).toBe(
      HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons.high
    );
    expect(budget.stone.wagonAnimationBudget).toEqual(
      HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop
    );
  });

  it('shares every ceiling across concurrent Gold, Food, Wood, and Stone layers', () => {
    const desktop = createRealmExpeditionSceneBudget({
      quality: 'high',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 96,
      stoneNodeCount: 96,
      mobile: false
    });
    const mobile = createRealmExpeditionSceneBudget({
      quality: 'balanced',
      goldNodeCount: 96,
      foodNodeCount: 96,
      woodNodeCount: 96,
      stoneNodeCount: 96,
      mobile: true
    });

    expect(
      desktop.gold.maximumRenderedNodes
      + desktop.food.maximumRenderedNodes
      + desktop.wood.maximumRenderedNodes
      + desktop.stone.maximumRenderedNodes
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.high);
    expect(desktop.wood.maximumRenderedNodes).toBeLessThanOrEqual(
      HEGEMONY_LOGGING_CAMP_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(desktop.stone.maximumRenderedNodes).toBeLessThanOrEqual(
      HEGEMONY_STONE_QUARRY_RENDER_LIMITS.maximumRenderedNodes.high
    );
    expect(
      desktop.gold.maximumRenderedWagons
      + desktop.food.maximumRenderedWagons
      + desktop.wood.maximumRenderedWagons
      + desktop.stone.maximumRenderedWagons
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons.high);
    expect(
      desktop.gold.wagonAnimationBudget.total
      + desktop.food.wagonAnimationBudget.total
      + desktop.wood.wagonAnimationBudget.total
      + desktop.stone.wagonAnimationBudget.total
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop.total);
    expect(
      desktop.gold.wagonAnimationBudget.highOrBalanced
      + desktop.food.wagonAnimationBudget.highOrBalanced
      + desktop.wood.wagonAnimationBudget.highOrBalanced
      + desktop.stone.wagonAnimationBudget.highOrBalanced
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop.highOrBalanced);
    expect(
      mobile.gold.maximumRenderedNodes
      + mobile.food.maximumRenderedNodes
      + mobile.wood.maximumRenderedNodes
      + mobile.stone.maximumRenderedNodes
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes.balanced);
    expect(
      mobile.gold.maximumRenderedWagons
      + mobile.food.maximumRenderedWagons
      + mobile.wood.maximumRenderedWagons
      + mobile.stone.maximumRenderedWagons
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons.balanced);
    expect(
      mobile.gold.wagonAnimationBudget.total
      + mobile.food.wagonAnimationBudget.total
      + mobile.wood.wagonAnimationBudget.total
      + mobile.stone.wagonAnimationBudget.total
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile.total);
    expect(
      mobile.gold.wagonAnimationBudget.highOrBalanced
      + mobile.food.wagonAnimationBudget.highOrBalanced
      + mobile.wood.wagonAnimationBudget.highOrBalanced
      + mobile.stone.wagonAnimationBudget.highOrBalanced
    ).toBeLessThanOrEqual(HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile.highOrBalanced);
  });
});
