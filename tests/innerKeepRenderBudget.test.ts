import { describe, expect, it } from 'vitest';

import {
  INNER_KEEP_AUTHORED_PERIMETER_TREE_BUDGETS,
  INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES,
  INNER_KEEP_AUTHORED_STATIC_RENDER_BUDGETS,
} from '../src/components/inner-keep/createInnerKeepAuthoredPresentation';
import {
  INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS,
  innerKeepSceneGraphExceedsRenderBudget,
  type InnerKeepSceneQuality,
} from '../src/components/inner-keep/createInnerKeepSceneLayer';
import { INNER_KEEP_PRESENTATION_PLACEMENTS } from '../src/components/inner-keep/innerKeepPresentationLayoutPolicy';
import { INNER_KEEP_STATIC_RUNTIME_ASSETS } from '../src/components/inner-keep/innerKeepRuntimeAssetCatalog.generated';
import {
  INNER_KEEP_WEATHERED_WALL_SKIRT_ASSET_ID,
  INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS,
} from '../src/components/inner-keep/innerKeepTownAtmospherePolicy';
import { INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS } from '../scripts/qa-observer/inner-keep-qa-contract.mjs';

function maximumAuthoredStaticComplexity(quality: InnerKeepSceneQuality) {
  const profile = quality === 'reduced' ? 'compact' : quality;
  const modelByAssetId = new Map(INNER_KEEP_STATIC_RUNTIME_ASSETS.map((asset) => [
    asset.id,
    asset.models[profile],
  ] as const));
  const fixedPlacements = INNER_KEEP_PRESENTATION_PLACEMENTS.filter((placement) => (
    placement.anchor === 'fixed'
  ));
  let drawCalls = fixedPlacements.reduce((total, placement) => (
    total + modelByAssetId.get(placement.assetId)!.drawCalls
  ), 0);
  let triangleCount = fixedPlacements.reduce((total, placement) => (
    total + modelByAssetId.get(placement.assetId)!.triangles * placement.instances.length
  ), 0);
  drawCalls += INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES.reduce((total, assetId) => (
    total + modelByAssetId.get(assetId)!.drawCalls
  ), 0);
  for (
    let index = 0;
    index < INNER_KEEP_AUTHORED_PERIMETER_TREE_BUDGETS[quality];
    index += 1
  ) {
    const assetId = INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES[
      index % INNER_KEEP_AUTHORED_PERIMETER_TREE_SPECIES.length
    ]!;
    triangleCount += modelByAssetId.get(assetId)!.triangles;
  }
  const weatheredWall = modelByAssetId.get(INNER_KEEP_WEATHERED_WALL_SKIRT_ASSET_ID)!;
  drawCalls += weatheredWall.drawCalls;
  triangleCount += weatheredWall.triangles
    * INNER_KEEP_WEATHERED_WALL_SKIRT_PLACEMENTS.length;
  return Object.freeze({ drawCalls, triangleCount });
}

describe('Inner Keep authored render budgets', () => {
  it('keeps source scene-graph ceilings aligned with the reviewed QA ceilings', () => {
    expect(INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS).toEqual(
      INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS,
    );
  });

  for (const quality of ['high', 'balanced', 'reduced'] as const) {
    it(`keeps exact ${quality} static metadata within its hard instanced budget`, () => {
      expect(maximumAuthoredStaticComplexity(quality)).toEqual({
        drawCalls: INNER_KEEP_AUTHORED_STATIC_RENDER_BUDGETS[quality].drawCalls,
        triangleCount: INNER_KEEP_AUTHORED_STATIC_RENDER_BUDGETS[quality].triangles,
      });
    });
  }

  it('flags a one-call or one-triangle scene graph regression past each ceiling', () => {
    for (const quality of ['high', 'balanced', 'reduced'] as InnerKeepSceneQuality[]) {
      const budget = INNER_KEEP_SCENE_GRAPH_RENDER_BUDGETS[quality];
      expect(innerKeepSceneGraphExceedsRenderBudget(quality, {
        drawCalls: budget.drawCalls,
        triangleCount: budget.triangles,
      })).toBe(false);
      expect(innerKeepSceneGraphExceedsRenderBudget(quality, {
        drawCalls: budget.drawCalls + 1,
        triangleCount: budget.triangles,
      })).toBe(true);
      expect(innerKeepSceneGraphExceedsRenderBudget(quality, {
        drawCalls: budget.drawCalls,
        triangleCount: budget.triangles + 1,
      })).toBe(true);
    }
  });
});
