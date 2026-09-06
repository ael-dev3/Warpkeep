import { INNER_KEEP_STATIC_RUNTIME_ASSETS } from '../inner-keep/innerKeepRuntimeAssetCatalog.generated';
import { loadInnerKeepRuntimeAssetBundle, type InnerKeepRuntimeAssetBundle } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { KEEP04_VISUAL_PROFILE as P, type Quality04 } from './keep04VisualProfile';

export const KEEP04_BUILDING_IDS = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'] as const;
export const KEEP04_TREE_IDS = ['courtyard-linden-teardrop', 'pruned-ornamental-three-tier'] as const;

/** Raw pinned bytes are a conservative keep-only preflight, NOT a world+keep transfer measurement. */
export function planKeep04Assets(quality: Quality04) {
  const staticAssetIds = [...KEEP04_BUILDING_IDS, ...KEEP04_TREE_IDS];
  const budget = P.budgets[quality];
  // High assets alone exceed the high total gate. This is no arbitrary per-keep share:
  // complete encoded world+keep transfer still requires the production-path measurement.
  const candidates: Quality04[] = quality === 'high' ? ['balanced', 'reduced'] : ['reduced'];
  for (const sourceQuality of candidates) {
    const profile = sourceQuality === 'reduced' ? 'compact' : sourceQuality;
    let bytes = 0; let triangles = 0; let draws = 0;
    for (const id of staticAssetIds) {
      const asset = INNER_KEEP_STATIC_RUNTIME_ASSETS.find(entry => entry.id === id)!;
      const model = asset.models[profile]; const instances = asset.family === 'trees' ? budget.trees / 2 : 1;
      bytes += model.bytes; triangles += model.triangles * instances; draws += model.drawCalls * instances;
    }
    if (bytes <= budget.transferBytes && triangles <= budget.triangles - 12000 && draws <= budget.draws - 45) {
      return Object.freeze({ sourceQuality, staticAssetIds, populationActorIds: [] as const, bytes, triangles, draws });
    }
  }
  throw new RangeError('Keep asset catalog exceeds the selected budget.');
}

export async function loadKeep04Assets(options: Readonly<{ quality: Quality04; reducedMotion: boolean; signal: AbortSignal }>): Promise<InnerKeepRuntimeAssetBundle> {
  const plan = planKeep04Assets(options.quality);
  return loadInnerKeepRuntimeAssetBundle({ ...options, quality: plan.sourceQuality, baseUrl: import.meta.env.BASE_URL,
    staticAssetIds: plan.staticAssetIds, populationActorIds: plan.populationActorIds });
}
