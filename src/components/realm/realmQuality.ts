import { HEGEMONY_FRONTIER_KEEP } from '../../game/map/hegemonyLandmarks';

export type RealmQuality = 'high' | 'balanced' | 'reduced';

export type RealmLightingSpec = Readonly<{
  toneMappingExposure: number;
  sunIntensity: number;
}>;

export const REALM_LIGHTING_SPECS: Readonly<Record<RealmQuality, RealmLightingSpec>> = {
  high: { toneMappingExposure: 1.02, sunIntensity: 2 },
  balanced: { toneMappingExposure: 1, sunIntensity: 1.85 },
  reduced: { toneMappingExposure: 0.98, sunIntensity: 1.7 }
};

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
  balanced: {
    id: 'balanced',
    subdivisionsPerEdge: 6,
    playableRadius: 4,
    renderRadius: 5,
    greenTuftsPerPlayableCell: 7,
    greenTuftsPerApronCell: 2,
    dryTuftsPerPlayableCell: 1,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.58,
    stoneChanceApron: 0.22,
    dynamicShadows: true,
    shadowMapSize: 1024,
    keepAssetPath: HEGEMONY_FRONTIER_KEEP.runtimeAssetPaths.balanced,
    pixelRatioCap: 1.75,
    maxDrawingBufferPixels: 5_200_000,
    fogNear: 34,
    fogFar: 66
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
    fogNear: 30,
    fogFar: 58
  }
} as const;

export type RealmQualityInput = Readonly<{
  width: number;
  height: number;
  devicePixelRatio: number;
  maxTextureSize?: number;
}>;

/**
 * Preserve enough internal resolution for readable borders and keep details
 * while still allowing oversized canvases to honour their pixel budget.
 */
export const MIN_REALM_PIXEL_RATIO = 0.5;

function finitePositive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function selectRealmQuality(input: RealmQualityInput): RealmQuality {
  const width = finitePositive(input.width, 1280);
  const height = finitePositive(input.height, 720);
  const dpr = finitePositive(input.devicePixelRatio, 1);
  const maxTextureSize = finitePositive(input.maxTextureSize ?? 8192, 8192);
  const shortestSide = Math.min(width, height);

  if (maxTextureSize < 4096 || shortestSide < 280 || width * height * dpr * dpr > 18_000_000) {
    return 'reduced';
  }
  if (width >= 1180 && height >= 680 && dpr <= 2.5 && maxTextureSize >= 8192) {
    return 'high';
  }
  return 'balanced';
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
  const minimumPixelRatio = Math.min(safeDpr, MIN_REALM_PIXEL_RATIO);
  return Math.max(
    minimumPixelRatio,
    Math.min(safeDpr, spec.pixelRatioCap, pixelBudgetRatio)
  );
}
