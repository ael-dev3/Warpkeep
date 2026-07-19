import type { RealmQuality } from './realmQuality';

/**
 * One scene-wide ceiling for every expedition resource. Gold, Food, Wood, and Stone
 * must share this allocator rather than each adding their own model, wagon,
 * or mixer ceiling to the same realm scene.
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

/**
 * Logging Camps have a broad rendered envelope and a richer High mesh than
 * the original Gold Mine. Its independent cap protects a Wood-only scene
 * before the shared allocator makes a cross-resource tradeoff.
 */
export const HEGEMONY_LOGGING_CAMP_RENDER_LIMITS = Object.freeze({
  maximumRenderedNodes: Object.freeze({
    high: 18,
    balanced: 24,
    reduced: 12
  } as const)
});

export const HEGEMONY_STONE_QUARRY_RENDER_LIMITS = Object.freeze({
  maximumRenderedNodes: Object.freeze({
    high: 18,
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
  wood: RealmExpeditionLayerBudget;
  stone: RealmExpeditionLayerBudget;
}>;

type ExpeditionResource = 'gold' | 'food' | 'wood' | 'stone';
type ResourceCounts = Readonly<Record<ExpeditionResource, number>>;
type ResourceBudget = Readonly<Record<ExpeditionResource, number>>;
const EXPEDITION_RESOURCES: readonly ExpeditionResource[] = Object.freeze([
  'gold',
  'food',
  'wood',
  'stone'
]);

function asCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

/**
 * Split a finite scene budget across the active resource layers. A one-layer
 * scene preserves the historical Gold limits. With both layers present, all
 * returned caps sum to no more than the same global ceiling, even before a
 * layer resolves its GLBs or discovers an occupation.
 */
function splitBudget(total: number, counts: ResourceCounts): ResourceBudget {
  const boundedTotal = asCount(total);
  const normalized = Object.freeze({
    gold: asCount(counts.gold),
    food: asCount(counts.food),
    wood: asCount(counts.wood),
    stone: asCount(counts.stone)
  });
  const active = EXPEDITION_RESOURCES.filter((resource) => normalized[resource] > 0);
  const allocations: Record<ExpeditionResource, number> = { gold: 0, food: 0, wood: 0, stone: 0 };
  if (boundedTotal <= 0 || active.length === 0) return Object.freeze(allocations);
  if (active.length === 1) {
    const resource = active[0]!;
    allocations[resource] = Math.min(boundedTotal, normalized[resource]);
    return Object.freeze(allocations);
  }

  const totalCount = active.reduce((sum, resource) => sum + normalized[resource], 0);
  const exact = new Map<ExpeditionResource, number>();
  for (const resource of active) {
    const value = (boundedTotal * normalized[resource]) / totalCount;
    exact.set(resource, value);
    allocations[resource] = Math.min(normalized[resource], Math.floor(value));
  }
  let remaining = boundedTotal - active.reduce((sum, resource) => sum + allocations[resource], 0);
  const priority = [...active].sort((left, right) => (
    (exact.get(right)! - allocations[right]) - (exact.get(left)! - allocations[left])
    || EXPEDITION_RESOURCES.indexOf(left) - EXPEDITION_RESOURCES.indexOf(right)
  ));
  while (remaining > 0) {
    const next = priority.find((resource) => allocations[resource] < normalized[resource]);
    if (!next) break;
    allocations[next] += 1;
    remaining -= 1;
  }
  return Object.freeze(allocations);
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
  woodNodeCount: number;
  stoneNodeCount?: number;
  mobile: boolean;
}>): RealmExpeditionSceneBudget {
  const counts = Object.freeze({
    gold: asCount(input.goldNodeCount),
    food: asCount(input.foodNodeCount),
    wood: asCount(input.woodNodeCount),
    stone: asCount(input.stoneNodeCount ?? 0)
  });
  const maximumSceneNodes = HEGEMONY_EXPEDITION_SCENE_LIMITS.maximumRenderedNodes[input.quality];
  const maximumFoodNodes = HEGEMONY_WHEAT_FARM_RENDER_LIMITS.maximumRenderedNodes[input.quality];
  const maximumWoodNodes = HEGEMONY_LOGGING_CAMP_RENDER_LIMITS.maximumRenderedNodes[input.quality];
  const maximumStoneNodes = HEGEMONY_STONE_QUARRY_RENDER_LIMITS.maximumRenderedNodes[input.quality];
  const nodeCaps = splitBudget(
    maximumSceneNodes,
    Object.freeze({
      gold: counts.gold,
      food: Math.min(counts.food, maximumFoodNodes),
      wood: Math.min(counts.wood, maximumWoodNodes),
      stone: Math.min(counts.stone, maximumStoneNodes)
    })
  );
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
    ),
    wood: layerBudget(
      nodeCaps.wood,
      wagonCaps.wood,
      detailedAnimationCaps.wood,
      animationCaps.wood
    ),
    stone: layerBudget(
      nodeCaps.stone,
      wagonCaps.stone,
      detailedAnimationCaps.stone,
      animationCaps.stone
    )
  });
}
