import type {
  InnerKeepQaScenario,
  InnerKeepQaScenarioId
} from '../../src/dev/innerKeepQaScenarioManifest.mjs';

export const INNER_KEEP_QA_ROUTE: '/dev/inner-keep-qa.html';
export const INNER_KEEP_QA_CASE_COUNT: number;
export const INNER_KEEP_QA_MAX_READY_MILLISECONDS: 30000;
export const INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS: Readonly<Record<
  'high' | 'balanced' | 'reduced',
  Readonly<{ drawCalls: number; triangles: number }>
>>;

export type InnerKeepQaEvidence = Readonly<{
  version: 2;
  scenario: InnerKeepQaScenarioId;
  renderMode: 'webgl' | 'fallback';
  innerKeepRenderer: 'webgl' | 'fallback';
  quality: 'high' | 'balanced' | 'reduced';
  reducedMotion: boolean;
  status: 'ready';
  assetStatus: 'idle' | 'loading' | 'ready' | 'degraded';
  progressBasisPoints: number | null;
  canvasCount: number;
  rendererCount: number;
  rendererDrawCalls: number;
  rendererTriangles: number;
  sceneGraphDrawCalls: number;
  sceneGraphTriangles: number;
  webglContextCount: number;
  rafOwnerCount: number;
  maximumPendingRafCount: number;
  slotControlCount: number;
  enabledSlotControlCount: number;
  slotCount: number;
  slotGeometryCount: number;
  smokeSpriteCount: number;
  grassBladeCount: number;
  waterSurfaceCount: number;
  authoredAssetCount: number;
  authoredPlacementCount: number;
  authoredTreeCount: number;
  ambientActorCount: number;
  animationFrameCap: number;
  mountedActorCount: number;
  patrolUnitCount: number;
  activeConversationCount: number;
  animationMixerCount: number;
  runtimeAssetFailureCount: number;
  outerWorldStatus:
    | 'idle'
    | 'loading'
    | 'ready'
    | 'fallback'
    | 'partial'
    | 'aborted'
    | 'disposed';
  outerWorldRuntimeAssetFailureCount: number;
  topographicFeatureCount: number;
  terrainTriangleCount: number;
  terrainHeightRangeMillimeters: number;
  farCountrysideStatus: 'idle' | 'ready' | 'degraded';
  farCountrysideTerrainTriangleCount: number;
  farCountrysideFieldParcelCount: number;
  farCountrysideFieldTuftCount: number;
  farCountrysideHedgerowTreeCount: number;
  exteriorTreeCount: number;
  scenicResourceNodeCount: number;
  wildlifeAssetStatus:
    | 'idle'
    | 'disabled'
    | 'loading'
    | 'ready'
    | 'failed'
    | 'aborted'
    | 'disposed';
  wildlifeCount: number;
  exactWildlifeCount: number;
  proceduralWildlifeCount: number;
  tradeWagonCount: number;
  exteriorActorCount: number;
  exteriorMountedActorCount: number;
  exteriorPatrolUnitCount: number;
  barracksPlacementPresent: boolean;
  cathedralPlacementPresent: boolean;
  constructionSiteCount: number;
  completedBuildingCount: number;
  finalModelCount: number;
  scaffoldPresent: boolean;
  completionRevealActive: boolean;
  assetFallbackCount: number;
  builderBusyVisible: boolean;
  insufficientResourcesVisible: boolean;
  levelVisible: boolean;
  viewportWidth: number;
  viewportHeight: number;
  documentWidth: number;
  documentHeight: number;
  horizontalOverflow: boolean;
  verticalOverflow: boolean;
}>;

export function innerKeepQaUrl(options?: Readonly<{
  port?: number;
  scenario?: InnerKeepQaScenarioId;
}>): string;
export function parseInnerKeepQaEvidence(value: unknown): InnerKeepQaEvidence;
export function assertInnerKeepQaScenarioEvidence(
  value: unknown,
  expectedScenarioId: InnerKeepQaScenarioId,
  phase?: 'steady' | 'reveal' | 'completed'
): InnerKeepQaEvidence;
export function innerKeepQaBrowserCases(port: number): readonly Readonly<{
  id: InnerKeepQaScenarioId;
  scenario: InnerKeepQaScenario;
  url: string;
  viewport: Readonly<{ width: number; height: number }>;
}>[];
