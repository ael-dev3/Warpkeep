import { HEGEMONY_MAIN_CASTLE } from '../../game/map/hegemonyLandmarks';

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

export type RealmEnvironmentSpec = Readonly<{
  textureWidth: 64 | 128 | 256;
  textureHeight: 32 | 64 | 128;
  environmentIntensity: number;
  sunDiscSegments: 12 | 20 | 28;
}>;

/**
 * Tiny, bounded procedural IBL profiles. The maps deliberately remain far
 * below typical HDR asset sizes: they provide restrained material separation
 * and horizon fill without adding a network fetch or a large GPU allocation.
 */
export const REALM_ENVIRONMENT_SPECS: Readonly<
  Record<RealmQuality, RealmEnvironmentSpec>
> = Object.freeze({
  high: Object.freeze({
    textureWidth: 256,
    textureHeight: 128,
    environmentIntensity: 0.36,
    sunDiscSegments: 28
  }),
  balanced: Object.freeze({
    textureWidth: 128,
    textureHeight: 64,
    environmentIntensity: 0.32,
    sunDiscSegments: 20
  }),
  reduced: Object.freeze({
    textureWidth: 64,
    textureHeight: 32,
    environmentIntensity: 0.28,
    sunDiscSegments: 12
  })
});

export type RealmQualitySpec = Readonly<{
  id: RealmQuality;
  subdivisionsPerEdge: number;
  greenTuftsPerPlayableCell: number;
  greenTuftsPerApronCell: number;
  dryTuftsPerPlayableCell: number;
  dryTuftsPerApronCell: number;
  stoneChancePlayable: number;
  stoneChanceApron: number;
  dynamicShadows: boolean;
  shadowMapSize: 0 | 1024 | 2048;
  keepAssetPath: string;
  landscapeBaseAssetPath: string;
  pixelRatioCap: number;
  maxDrawingBufferPixels: number;
  fogNear: number;
  fogFar: number;
}>;

export type RealmDecorationDensitySpec = Readonly<{
  greenTuftsPerPlayableCell: number;
  greenTuftsPerApronCell: number;
  dryTuftsPerPlayableCell: number;
  dryTuftsPerApronCell: number;
  stoneChancePlayable: number;
  stoneChanceApron: number;
}>;

export type RealmRenderPlan = Readonly<{
  subdivisionsPerEdge: number;
  terrainTriangleBudget: number;
  estimatedTerrainTriangles: number;
  decorationDensity: RealmDecorationDensitySpec;
  decorationInstanceBudget: number;
  estimatedMaximumDecorationInstances: number;
  dynamicShadows: boolean;
  shadowMapSize: 0 | 1024 | 2048;
  shadowCameraHalfExtent: number;
  shadowMode: 'contact-only';
}>;

export type RealmRenderPlanInput = Readonly<{
  playableRadius: number;
  renderRadius: number;
  playableCellCount: number;
  renderCellCount: number;
}>;

export const REALM_QUALITY_SPECS: Readonly<Record<RealmQuality, RealmQualitySpec>> = {
  high: {
    id: 'high',
    subdivisionsPerEdge: 8,
    greenTuftsPerPlayableCell: 11,
    greenTuftsPerApronCell: 4,
    dryTuftsPerPlayableCell: 2,
    dryTuftsPerApronCell: 1,
    stoneChancePlayable: 0.78,
    stoneChanceApron: 0.28,
    dynamicShadows: true,
    shadowMapSize: 2048,
    keepAssetPath: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.high,
    landscapeBaseAssetPath: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.high,
    pixelRatioCap: 2,
    maxDrawingBufferPixels: 8_400_000,
    fogNear: 28,
    fogFar: 58
  },
  balanced: {
    id: 'balanced',
    subdivisionsPerEdge: 6,
    greenTuftsPerPlayableCell: 7,
    greenTuftsPerApronCell: 2,
    dryTuftsPerPlayableCell: 1,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.58,
    stoneChanceApron: 0.22,
    dynamicShadows: true,
    shadowMapSize: 1024,
    keepAssetPath: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.balanced,
    landscapeBaseAssetPath: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.balanced,
    pixelRatioCap: 1.75,
    maxDrawingBufferPixels: 5_200_000,
    fogNear: 34,
    fogFar: 66
  },
  reduced: {
    id: 'reduced',
    subdivisionsPerEdge: 3,
    greenTuftsPerPlayableCell: 1,
    greenTuftsPerApronCell: 0,
    dryTuftsPerPlayableCell: 0,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.2,
    stoneChanceApron: 0.08,
    dynamicShadows: false,
    shadowMapSize: 0,
    keepAssetPath: HEGEMONY_MAIN_CASTLE.runtimeAssetPaths.compact,
    landscapeBaseAssetPath: HEGEMONY_MAIN_CASTLE.landscapeBaseRuntimeAssetPaths.compact,
    pixelRatioCap: 1.25,
    maxDrawingBufferPixels: 2_400_000,
    fogNear: 30,
    fogFar: 58
  }
} as const;

/**
 * Hard scene-build ceilings for canonical radius-20 Genesis 001. They bound
 * CPU-side geometry generation and GPU instance count before allocation.
 */
export const REALM_EXPANDED_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ terrainTriangles: 150_000, decorationInstances: 7_000 }),
  balanced: Object.freeze({ terrainTriangles: 90_000, decorationInstances: 5_500 }),
  reduced: Object.freeze({ terrainTriangles: 40_000, decorationInstances: 3_000 })
} satisfies Readonly<Record<RealmQuality, Readonly<{
  terrainTriangles: number;
  decorationInstances: number;
}>>>);

const EXPANDED_DECORATION_DENSITY: Readonly<Record<RealmQuality, RealmDecorationDensitySpec>> = {
  high: {
    greenTuftsPerPlayableCell: 3,
    greenTuftsPerApronCell: 1,
    dryTuftsPerPlayableCell: 1,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.42,
    stoneChanceApron: 0.15
  },
  balanced: {
    greenTuftsPerPlayableCell: 2,
    greenTuftsPerApronCell: 0,
    dryTuftsPerPlayableCell: 1,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.32,
    stoneChanceApron: 0.1
  },
  reduced: {
    greenTuftsPerPlayableCell: 1,
    greenTuftsPerApronCell: 0,
    dryTuftsPerPlayableCell: 0,
    dryTuftsPerApronCell: 0,
    stoneChancePlayable: 0.2,
    stoneChanceApron: 0.08
  }
};

function finiteCellCount(value: number) {
  return Math.max(1, Number.isFinite(value) ? Math.trunc(value) : 1);
}

function maximumDecorationInstances(
  density: RealmDecorationDensitySpec,
  playableCellCount: number,
  renderCellCount: number
) {
  const apronCellCount = Math.max(0, renderCellCount - playableCellCount);
  const playablePerCell = density.greenTuftsPerPlayableCell
    + density.dryTuftsPerPlayableCell
    + (density.stoneChancePlayable > 0 ? 1 : 0);
  const apronPerCell = density.greenTuftsPerApronCell
    + density.dryTuftsPerApronCell
    + (density.stoneChanceApron > 0 ? 1 : 0);
  return playableCellCount * playablePerCell + apronCellCount * apronPerCell;
}

/**
 * Resolve one deterministic canonical-world plan before any large arrays or
 * Three.js objects are allocated. There is deliberately no radius-four/radius-
 * five quality branch: every runtime realm uses bounded Genesis density and
 * footprint-sized castle contact shadows.
 */
export function resolveRealmRenderPlan(
  quality: RealmQualitySpec,
  input: RealmRenderPlanInput
): RealmRenderPlan {
  const playableCellCount = finiteCellCount(input.playableCellCount);
  const renderCellCount = Math.max(playableCellCount, finiteCellCount(input.renderCellCount));
  const budget = REALM_EXPANDED_RENDER_BUDGETS[quality.id];
  const subdivisionsForBudget = Math.max(1, Math.floor(Math.sqrt(
    budget.terrainTriangles / (renderCellCount * 6)
  )));
  const subdivisionsPerEdge = Math.min(
    quality.subdivisionsPerEdge,
    subdivisionsForBudget
  );
  const decorationDensity = EXPANDED_DECORATION_DENSITY[quality.id];

  return {
    subdivisionsPerEdge,
    terrainTriangleBudget: budget.terrainTriangles,
    estimatedTerrainTriangles: renderCellCount * 6 * subdivisionsPerEdge ** 2,
    decorationDensity,
    decorationInstanceBudget: budget.decorationInstances,
    estimatedMaximumDecorationInstances: maximumDecorationInstances(
      decorationDensity,
      playableCellCount,
      renderCellCount
    ),
    dynamicShadows: false,
    shadowMapSize: 0,
    shadowCameraHalfExtent: 0,
    shadowMode: 'contact-only'
  };
}

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
