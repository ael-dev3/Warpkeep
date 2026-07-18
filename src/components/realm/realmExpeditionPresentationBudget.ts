import type { RealmQuality } from './realmQuality';

/**
 * One scene-wide ceiling for every expedition resource. A Food layer must not
 * silently double Gold's previously reviewed model, wagon, or mixer budget.
 */
export const HEGEMONY_EXPEDITION_SCENE_LIMITS = Object.freeze({
  maximumRenderedNodes: Object.freeze({
    high: 72,
    balanced: 44,
    reduced: 20
  } as const),
  maximumRenderedWagons: Object.freeze({
    high: 17,
    balanced: 10,
    reduced: 0
  } as const),
  wagonAnimationBudget: Object.freeze({
    desktop: Object.freeze({ highOrBalanced: 4, total: 12 }),
    mobile: Object.freeze({ highOrBalanced: 2, total: 6 })
  })
});

/**
 * The Food Farm High mesh is intentionally much richer than the Gold Mine
 * High mesh. Its independent ceiling protects a Food-only scene before the
 * shared scene allocator has to make a cross-resource tradeoff.
 */
export const HEGEMONY_WHEAT_FARM_RENDER_LIMITS = Object.freeze({
  maximumRenderedNodes: Object.freeze({
    high: 16,
    balanced: 24,
    reduced: 12
  } as const)
});

export type RealmExpeditionLayerBudget = Readonly<{
  maximumRenderedNodes: number;
  maximumRenderedWagons: number;
  wagonAnimationBudget: Readonly<{
    highOrBalanced: number;
    total: number;
  }>;
}>;

export type RealmExpeditionSceneBudget = Readonly<{
  gold: RealmExpeditionLayerBudget;
  food: RealmExpeditionLayerBudget;
}>;

type ResourceCounts = Readonly<{ gold: number; food: number }>;

function asCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Split a finite scene budget across the active resource layers. A one-layer
 * scene preserves the historical Gold limits. With both layers present, all
 * returned caps sum to no more than the same global ceiling, even before a
 * layer resolves its GLBs or discovers an occupation.
 */
function splitBudget(total: number, counts: ResourceCounts): Readonly<{ gold: number; food: number }> {
  const goldCount = asCount(counts.gold);
  const foodCount = asCount(counts.food);
  const active = (goldCount > 0 ? 1 : 0) + (foodCount > 0 ? 1 : 0);
  if (total <= 0 || active === 0) return Object.freeze({ gold: 0, food: 0 });
  if (active === 1) {
    return Object.freeze({
      gold: goldCount > 0 ? Math.min(total, goldCount) : 0,
      food: foodCount > 0 ? Math.min(total, foodCount) : 0
    });
  }

  const totalCount = goldCount + foodCount;
  const goldExact = (total * goldCount) / totalCount;
  const foodExact = (total * foodCount) / totalCount;
  let gold = Math.min(goldCount, Math.floor(goldExact));
  let food = Math.min(foodCount, Math.floor(foodExact));
  let remaining = total - gold - food;
  const priority: Array<'gold' | 'food'> = goldExact - gold >= foodExact - food
    ? ['gold', 'food']
    : ['food', 'gold'];
  while (remaining > 0) {
    const next = priority.find((resource) => (
      resource === 'gold' ? gold < goldCount : food < foodCount
    ));
    if (!next) break;
    if (next === 'gold') gold += 1;
    else food += 1;
    remaining -= 1;
  }
  return Object.freeze({ gold, food });
}

function layerBudget(
  nodes: number,
  wagons: number,
  detailedAnimations: number,
  allAnimations: number,
): RealmExpeditionLayerBudget {
  return Object.freeze({
    maximumRenderedNodes: nodes,
    maximumRenderedWagons: wagons,
    wagonAnimationBudget: Object.freeze({
      highOrBalanced: detailedAnimations,
      total: allAnimations
    })
  });
}

export function createRealmExpeditionSceneBudget(input: Readonly<{
  quality: RealmQuality;
  goldNodeCount: number;
  foodNodeCount: number;
  mobile: boolean;
}>): RealmExpeditionSceneBudget {
  const counts = Object.freeze({
    gold: asCount(input.goldNodeCount),
    food: asCount(input.foodNodeCount)
  });
  const maximumSceneNodes = HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes[input.quality];
  const maximumFoodNodes = HEGEMONY_WHEAT_FARM_RENDER_LIMITS.maximumRenderedNodes[input.quality];
  const provisionalNodeCaps = splitBudget(
    maximumSceneNodes,
    Object.freeze({
      gold: counts.gold,
      food: Math.min(counts.food, maximumFoodNodes)
    })
  );
  // Keep this explicit even though splitBudget receives the Food capacity:
  // a future allocator change cannot accidentally reintroduce a 72-Farm High
  // scene. Any recovered Food capacity is offered only to existing Gold rows.
  const foodNodes = Math.min(provisionalNodeCaps.food, maximumFoodNodes);
  const goldNodes = Math.min(
    counts.gold,
    provisionalNodeCaps.gold + Math.max(0, provisionalNodeCaps.food - foodNodes),
    maximumSceneNodes - foodNodes
  );
  const nodeCaps = Object.freeze({ gold: goldNodes, food: foodNodes });
  const wagonCaps = splitBudget(
    HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedWagons[input.quality],
    counts
  );
  const animationCeiling = input.mobile
    ? HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.mobile
    : HEGEMONY_EXPEDITION_SCENE_LIMITS.wagonAnimationBudget.desktop;
  const detailedAnimationCaps = splitBudget(animationCeiling.highOrBalanced, counts);
  const animationCaps = splitBudget(animationCeiling.total, counts);
  return Object.freeze({
    gold: layerBudget(
      nodeCaps.gold,
      wagonCaps.gold,
      detailedAnimationCaps.gold,
      animationCaps.gold
    ),
    food: layerBudget(
      nodeCaps.food,
      wagonCaps.food,
      detailedAnimationCaps.food,
      animationCaps.food
    )
  });
}
