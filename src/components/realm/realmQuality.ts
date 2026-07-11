import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';

export type RealmQuality = 'high' | 'compact' | 'reduced';

export type RealmQualitySpec = Readonly<{
  id: RealmQuality;
  subdivisionsPerEdge: number;
  playableRadius: 4;
  renderRadius: 5;
  greenTuftsPerPlayableCell: number;
  greenTuftsPerApronCell: number;
  dryTuftsPerPlayableCell: number;
  dryTuftsPerApronCell: number;
  stoneChancePlayable: number;
  stoneChanceApron: number;
  dynamicShadows: boolean;
  shadowMapSize: 0 | 1024 | 2048;
  keepAssetPath: string;
  pixelRatioCap: number;
  maxDrawingBufferPixels: number;
  fogNear: number;
  fogFar: number;
}>;

export const REALM_QUALITY_SPECS: Readonly<Record<RealmQuality, RealmQualitySpec>> = {
  high: {
    id: 'high',
    subdivisionsPerEdge: 8,
    playableRadius: 4,
    renderRadius: 5,
    greenTuftsPerPlayableCell: 11,
    greenTuftsPerApronCell: 4,
    dryTuftsPerPlayableCell: 2,
    dryTuftsPerApronCell: 1,
    stoneChancePlayable: 0.78,
    stoneChanceApron: 0.28,
    dynamicShadows: true,
    shadowMapSize: 2048,
    keepAssetPath: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.high,
    pixelRatioCap: 2,
    maxDrawingBufferPixels: 8_400_000,
    fogNear: 28,
    fogFar: 58
  },
  compact: {
    id: 'compact',
    subdivisionsPerEdge: 5,
    playableRadius: 4,
    renderRadius: 5,
    greenTuftsPerPlayableCell: 5,
    greenTuftsPerApronCell: 2,
    dryTuftsPerPlayableCell: 1,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.46,
    stoneChanceApron: 0.18,
    dynamicShadows: false,
    shadowMapSize: 0,
    keepAssetPath: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.compact,
    pixelRatioCap: 1.6,
    maxDrawingBufferPixels: 4_200_000,
    fogNear: 26,
    fogFar: 52
  },
  reduced: {
    id: 'reduced',
    subdivisionsPerEdge: 3,
    playableRadius: 4,
    renderRadius: 5,
    greenTuftsPerPlayableCell: 1,
    greenTuftsPerApronCell: 0,
    dryTuftsPerPlayableCell: 0,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.2,
    stoneChanceApron: 0.08,
    dynamicShadows: false,
    shadowMapSize: 0,
    keepAssetPath: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.compact,
    pixelRatioCap: 1.25,
    maxDrawingBufferPixels: 2_400_000,
    fogNear: 24,
    fogFar: 48
  }
} as const;

export type RealmQualityInput = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  maxTextureSize?: number;
}>;

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function selectRealmQuality(input: RealmQualityInput): RealmQuality {
  const width = finitePositive(input.width, 1280);
  const height = finitePositive(input.height, 720);
  const dpr = finitePositive(input.devicePixelRatio, 1);
  const maxTextureSize = finitePositive(input.maxTextureSize ?? 8192, 8192);
  const shortestSide = Math.min(width, height);

  if (maxTextureSize < 4096 || shortestSide < 360 || width * height * dpr * dpr > 18_000_000) {
    return 'reduced';
  }
  if (width >= 1180 && height >= 680 && dpr <= 2.5 && maxTextureSize >= 8192) {
    return 'high';
  }
  return 'compact';
}

export function resolveRealmPixelRatio(
  width: number,
  height: number,
  devicePixelRatio: number,
  spec: RealmQualitySpec
) {
  const safeWidth = finitePositive(width, 1);
  const safeHeight = finitePositive(height, 1);
  const safeDpr = finitePositive(devicePixelRatio, 1);
  const pixelBudgetRatio = Math.sqrt(spec.maxDrawingBufferPixels / (safeWidth * safeHeight));
  return Math.max(1, Math.min(safeDpr, spec.pixelRatioCap, pixelBudgetRatio));
}
