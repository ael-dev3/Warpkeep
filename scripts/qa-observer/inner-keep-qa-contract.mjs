import {
  INNER_KEEP_QA_SCENARIO_IDS,
  INNER_KEEP_QA_SCENARIO_MANIFEST,
  innerKeepQaScenarioById,
} from '../../src/dev/innerKeepQaScenarioManifest.mjs';

export const INNER_KEEP_QA_ROUTE = '/dev/inner-keep-qa.html';
export const INNER_KEEP_QA_CASE_COUNT = INNER_KEEP_QA_SCENARIO_MANIFEST.length;
export const INNER_KEEP_QA_MAX_READY_MILLISECONDS = 30_000;

function exactPort(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 65_535) {
    throw new TypeError('Invalid Inner Keep QA loopback port.');
  }
  return value;
}

export function innerKeepQaUrl(options = {}) {
  const selectedPort = exactPort(options.port ?? 5173);
  const scenario = innerKeepQaScenarioById(options.scenario ?? 'empty');
  if (options.scenario !== undefined && scenario.id !== options.scenario) {
    throw new TypeError('Invalid Inner Keep QA scenario.');
  }
  const url = new URL(INNER_KEEP_QA_ROUTE, `http://127.0.0.1:${selectedPort}`);
  url.searchParams.set('scenario', scenario.id);
  return url.toString();
}

function exactRecord(value, message) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(message);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(message);
  }
  return value;
}

function exactInteger(value, minimum = 0, maximum = 1_000_000_000) {
  return Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

const EVIDENCE_KEYS = Object.freeze([
  'activeConversationCount',
  'ambientActorCount',
  'animationFrameCap',
  'animationMixerCount',
  'assetFallbackCount',
  'assetStatus',
  'authoredAssetCount',
  'authoredPlacementCount',
  'authoredTreeCount',
  'barracksPlacementPresent',
  'builderBusyVisible',
  'buildingPickTargetCount',
  'canvasCount',
  'catalogueBuildingControlCount',
  'cathedralPlacementPresent',
  'completedBuildingCount',
  'completionRevealActive',
  'constructionSiteCount',
  'documentHeight',
  'documentWidth',
  'enabledCatalogueBuildingControlCount',
  'enabledMapBuildingControlCount',
  'enabledSlotControlCount',
  'exactWildlifeCount',
  'exteriorActorCount',
  'exteriorMountedActorCount',
  'exteriorPatrolUnitCount',
  'exteriorTreeCount',
  'farCountrysideFieldParcelCount',
  'farCountrysideFieldTuftCount',
  'farCountrysideHedgerowTreeCount',
  'farCountrysideStatus',
  'farCountrysideTerrainTriangleCount',
  'finalModelCount',
  'grassBladeCount',
  'horizontalOverflow',
  'innerKeepRenderer',
  'insufficientResourcesVisible',
  'levelVisible',
  'mapBuildingControlCount',
  'maximumPendingRafCount',
  'mountedActorCount',
  'outerWorldRuntimeAssetFailureCount',
  'outerWorldStatus',
  'patrolUnitCount',
  'placementPreviewActive',
  'placementPreviewValid',
  'proceduralWildlifeCount',
  'progressBasisPoints',
  'quality',
  'rafOwnerCount',
  'reducedMotion',
  'renderMode',
  'rendererCount',
  'rendererDrawCalls',
  'rendererTriangles',
  'runtimeAssetFailureCount',
  'scaffoldPresent',
  'scenario',
  'sceneGraphDrawCalls',
  'sceneGraphTriangles',
  'scenicResourceNodeCount',
  'slotControlCount',
  'slotCount',
  'slotGeometryCount',
  'smokeSpriteCount',
  'status',
  'terrainHeightRangeMillimeters',
  'terrainTriangleCount',
  'topographicFeatureCount',
  'tradeWagonCount',
  'version',
  'verticalOverflow',
  'viewportHeight',
  'viewportWidth',
  'waterSurfaceCount',
  'webglContextCount',
  'wildlifeAssetStatus',
  'wildlifeCount',
]);

export function parseInnerKeepQaEvidence(value) {
  const candidate = exactRecord(value, 'Invalid Inner Keep QA evidence.');
  const keys = Object.keys(candidate).sort();
  if (
    keys.length !== EVIDENCE_KEYS.length
    || keys.some((key, index) => key !== EVIDENCE_KEYS[index])
    || candidate.version !== 3
    || !INNER_KEEP_QA_SCENARIO_IDS.includes(candidate.scenario)
    || !['webgl', 'fallback'].includes(candidate.renderMode)
    || !['webgl', 'fallback'].includes(candidate.innerKeepRenderer)
    || !['high', 'balanced', 'reduced'].includes(candidate.quality)
    || !['idle', 'loading', 'ready', 'degraded'].includes(candidate.assetStatus)
    || ![
      'idle',
      'loading',
      'ready',
      'fallback',
      'partial',
      'aborted',
      'disposed',
    ].includes(candidate.outerWorldStatus)
    || !['idle', 'ready', 'degraded'].includes(candidate.farCountrysideStatus)
    || ![
      'idle',
      'disabled',
      'loading',
      'ready',
      'failed',
      'aborted',
      'disposed',
    ].includes(candidate.wildlifeAssetStatus)
    || candidate.status !== 'ready'
    || typeof candidate.reducedMotion !== 'boolean'
    || typeof candidate.barracksPlacementPresent !== 'boolean'
    || typeof candidate.cathedralPlacementPresent !== 'boolean'
    || typeof candidate.scaffoldPresent !== 'boolean'
    || typeof candidate.completionRevealActive !== 'boolean'
    || typeof candidate.horizontalOverflow !== 'boolean'
    || typeof candidate.verticalOverflow !== 'boolean'
    || typeof candidate.builderBusyVisible !== 'boolean'
    || typeof candidate.insufficientResourcesVisible !== 'boolean'
    || typeof candidate.levelVisible !== 'boolean'
    || typeof candidate.placementPreviewActive !== 'boolean'
    || typeof candidate.placementPreviewValid !== 'boolean'
    || ![
      candidate.activeConversationCount,
      candidate.ambientActorCount,
      candidate.animationFrameCap,
      candidate.animationMixerCount,
      candidate.assetFallbackCount,
      candidate.authoredAssetCount,
      candidate.authoredPlacementCount,
      candidate.authoredTreeCount,
      candidate.buildingPickTargetCount,
      candidate.canvasCount,
      candidate.catalogueBuildingControlCount,
      candidate.completedBuildingCount,
      candidate.constructionSiteCount,
      candidate.documentHeight,
      candidate.documentWidth,
      candidate.enabledCatalogueBuildingControlCount,
      candidate.enabledMapBuildingControlCount,
      candidate.enabledSlotControlCount,
      candidate.exactWildlifeCount,
      candidate.exteriorActorCount,
      candidate.exteriorMountedActorCount,
      candidate.exteriorPatrolUnitCount,
      candidate.exteriorTreeCount,
      candidate.farCountrysideFieldParcelCount,
      candidate.farCountrysideFieldTuftCount,
      candidate.farCountrysideHedgerowTreeCount,
      candidate.farCountrysideTerrainTriangleCount,
      candidate.finalModelCount,
      candidate.grassBladeCount,
      candidate.mapBuildingControlCount,
      candidate.maximumPendingRafCount,
      candidate.mountedActorCount,
      candidate.outerWorldRuntimeAssetFailureCount,
      candidate.patrolUnitCount,
      candidate.proceduralWildlifeCount,
      candidate.rafOwnerCount,
      candidate.rendererCount,
      candidate.rendererDrawCalls,
      candidate.rendererTriangles,
      candidate.runtimeAssetFailureCount,
      candidate.scenicResourceNodeCount,
      candidate.sceneGraphDrawCalls,
      candidate.sceneGraphTriangles,
      candidate.slotControlCount,
      candidate.slotCount,
      candidate.slotGeometryCount,
      candidate.smokeSpriteCount,
      candidate.terrainHeightRangeMillimeters,
      candidate.terrainTriangleCount,
      candidate.topographicFeatureCount,
      candidate.tradeWagonCount,
      candidate.viewportHeight,
      candidate.viewportWidth,
      candidate.waterSurfaceCount,
      candidate.webglContextCount,
      candidate.wildlifeCount,
    ].every((entry) => exactInteger(entry))
    || !(
      candidate.progressBasisPoints === null
      || exactInteger(candidate.progressBasisPoints, 0, 10_000)
    )
  ) throw new TypeError('Invalid Inner Keep QA evidence.');
  return Object.freeze({ ...candidate });
}

export const INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS = Object.freeze({
  high: Object.freeze({ drawCalls: 650, triangles: 900_000 }),
  balanced: Object.freeze({ drawCalls: 550, triangles: 520_000 }),
  reduced: Object.freeze({ drawCalls: 400, triangles: 250_000 }),
});

const EXPECTED_LIVING_SCENE_BY_QUALITY = Object.freeze({
  high: Object.freeze({
    activeConversationMaximum: 2,
    ambientActorCount: 20,
    animationFrameCap: 30,
    authoredTreeCount: 18,
    exteriorActorCount: 10,
    exteriorMountedActorCount: 6,
    exteriorPatrolUnitCount: 8,
    exteriorTreeCount: 88,
    grassBladeCount: 3_000,
    mountedActorCount: 6,
    patrolUnitCount: 12,
    rendererDrawCallsMaximum: 1_000,
    rendererTrianglesMaximum: 1_200_000,
    scenicResourceNodeCount: 8,
    sceneGraphDrawCallsMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.high.drawCalls,
    sceneGraphTrianglesMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.high.triangles,
    farCountrysideFieldParcelCount: 820,
    farCountrysideFieldTuftCount: 320,
    farCountrysideHedgerowTreeCount: 32,
    farCountrysideTerrainTriangleCount: 9_760,
    terrainTriangleCount: 34_848,
    wildlifeCount: 10,
  }),
  balanced: Object.freeze({
    activeConversationMaximum: 1,
    ambientActorCount: 12,
    animationFrameCap: 24,
    authoredTreeCount: 12,
    exteriorActorCount: 6,
    exteriorMountedActorCount: 4,
    exteriorPatrolUnitCount: 4,
    exteriorTreeCount: 56,
    grassBladeCount: 1_800,
    mountedActorCount: 4,
    patrolUnitCount: 6,
    // The enlarged keep and distant countryside expose materially more exact
    // scenery while retaining a bounded single-renderer presentation.
    rendererDrawCallsMaximum: 700,
    rendererTrianglesMaximum: 750_000,
    scenicResourceNodeCount: 6,
    sceneGraphDrawCallsMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.balanced.drawCalls,
    sceneGraphTrianglesMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.balanced.triangles,
    farCountrysideFieldParcelCount: 648,
    farCountrysideFieldTuftCount: 192,
    farCountrysideHedgerowTreeCount: 20,
    farCountrysideTerrainTriangleCount: 5_632,
    terrainTriangleCount: 18_432,
    wildlifeCount: 7,
  }),
  reduced: Object.freeze({
    activeConversationMaximum: 0,
    ambientActorCount: 8,
    animationFrameCap: 18,
    authoredTreeCount: 6,
    exteriorActorCount: 3,
    exteriorMountedActorCount: 2,
    exteriorPatrolUnitCount: 2,
    exteriorTreeCount: 28,
    grassBladeCount: 600,
    mountedActorCount: 2,
    patrolUnitCount: 4,
    rendererDrawCallsMaximum: 450,
    rendererTrianglesMaximum: 350_000,
    scenicResourceNodeCount: 4,
    sceneGraphDrawCallsMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.reduced.drawCalls,
    sceneGraphTrianglesMaximum: INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.reduced.triangles,
    farCountrysideFieldParcelCount: 360,
    farCountrysideFieldTuftCount: 96,
    farCountrysideHedgerowTreeCount: 10,
    farCountrysideTerrainTriangleCount: 2_120,
    terrainTriangleCount: 6_728,
    wildlifeCount: 4,
  }),
});

function expectLivingScene(evidence, scenario) {
  if (scenario.renderMode === 'fallback') {
    return evidence.assetStatus === 'idle'
      && evidence.authoredAssetCount === 0
      && evidence.authoredPlacementCount === 0
      && evidence.authoredTreeCount === 0
      && evidence.grassBladeCount === 0
      && evidence.waterSurfaceCount === 0
      && evidence.ambientActorCount === 0
      && evidence.mountedActorCount === 0
      && evidence.patrolUnitCount === 0
      && evidence.activeConversationCount === 0
      && evidence.animationFrameCap === 0
      && evidence.animationMixerCount === 0
      && evidence.sceneGraphDrawCalls === 0
      && evidence.sceneGraphTriangles === 0
      && evidence.runtimeAssetFailureCount === 0
      && evidence.outerWorldStatus === 'idle'
      && evidence.outerWorldRuntimeAssetFailureCount === 0
      && evidence.topographicFeatureCount === 0
      && evidence.terrainTriangleCount === 0
      && evidence.terrainHeightRangeMillimeters === 0
      && evidence.farCountrysideStatus === 'idle'
      && evidence.farCountrysideTerrainTriangleCount === 0
      && evidence.farCountrysideFieldParcelCount === 0
      && evidence.farCountrysideFieldTuftCount === 0
      && evidence.farCountrysideHedgerowTreeCount === 0
      && evidence.exteriorTreeCount === 0
      && evidence.scenicResourceNodeCount === 0
      && evidence.wildlifeAssetStatus === 'idle'
      && evidence.wildlifeCount === 0
      && evidence.exactWildlifeCount === 0
      && evidence.proceduralWildlifeCount === 0
      && evidence.tradeWagonCount === 0
      && evidence.exteriorActorCount === 0
      && evidence.exteriorMountedActorCount === 0
      && evidence.exteriorPatrolUnitCount === 0
      && evidence.cathedralPlacementPresent === false
      && evidence.barracksPlacementPresent === false;
  }
  const expected = EXPECTED_LIVING_SCENE_BY_QUALITY[scenario.quality];
  const motionDisabled = scenario.reducedMotion || scenario.quality === 'reduced';
  const conversationEvidenceMatches = scenario.id === 'active-conversation'
    ? evidence.activeConversationCount === 1
    : evidence.activeConversationCount <= expected.activeConversationMaximum;
  return evidence.assetStatus === 'ready'
    && evidence.authoredAssetCount === 38
    && evidence.authoredPlacementCount === 101
    && evidence.authoredTreeCount === expected.authoredTreeCount
    && evidence.grassBladeCount === expected.grassBladeCount
    && evidence.waterSurfaceCount === 2
    && evidence.ambientActorCount === expected.ambientActorCount
    && evidence.mountedActorCount === expected.mountedActorCount
    && evidence.patrolUnitCount === expected.patrolUnitCount
    && conversationEvidenceMatches
    && (!motionDisabled || evidence.activeConversationCount === 0)
    && evidence.animationMixerCount === (
      motionDisabled ? 0 : expected.ambientActorCount + expected.wildlifeCount
    )
    && evidence.animationFrameCap === (
      scenario.reducedMotion ? 0 : expected.animationFrameCap
    )
    && evidence.rendererDrawCalls <= expected.rendererDrawCallsMaximum
    && evidence.rendererTriangles <= expected.rendererTrianglesMaximum
    && evidence.sceneGraphDrawCalls > 0
    && evidence.sceneGraphDrawCalls <= expected.sceneGraphDrawCallsMaximum
    && evidence.sceneGraphTriangles > 0
    && evidence.sceneGraphTriangles <= expected.sceneGraphTrianglesMaximum
    && evidence.runtimeAssetFailureCount === 0
    && evidence.outerWorldStatus === 'ready'
    && evidence.outerWorldRuntimeAssetFailureCount === 0
    && evidence.topographicFeatureCount === 9
    && evidence.terrainTriangleCount === expected.terrainTriangleCount
    && evidence.terrainHeightRangeMillimeters > 0
    && evidence.farCountrysideStatus === 'ready'
    && evidence.farCountrysideTerrainTriangleCount
      === expected.farCountrysideTerrainTriangleCount
    && evidence.farCountrysideFieldParcelCount
      === expected.farCountrysideFieldParcelCount
    && evidence.farCountrysideFieldTuftCount
      === expected.farCountrysideFieldTuftCount
    && evidence.farCountrysideHedgerowTreeCount
      === expected.farCountrysideHedgerowTreeCount
    && evidence.exteriorTreeCount === expected.exteriorTreeCount
    && evidence.scenicResourceNodeCount === expected.scenicResourceNodeCount
    && evidence.wildlifeAssetStatus === 'ready'
    && evidence.wildlifeCount === expected.wildlifeCount
    && evidence.exactWildlifeCount === expected.wildlifeCount
    && evidence.proceduralWildlifeCount === 0
    && evidence.tradeWagonCount === 1
    && evidence.exteriorActorCount === expected.exteriorActorCount
    && evidence.exteriorMountedActorCount === expected.exteriorMountedActorCount
    && evidence.exteriorPatrolUnitCount === expected.exteriorPatrolUnitCount
    && evidence.cathedralPlacementPresent === false
    && evidence.barracksPlacementPresent === false;
}

function expectCompletedPresentation(evidence) {
  return evidence.completedBuildingCount === 1
    && evidence.constructionSiteCount === 0
    && evidence.finalModelCount === (evidence.renderMode === 'webgl' ? 1 : 0)
    && evidence.scaffoldPresent === false
    && evidence.smokeSpriteCount === 0;
}

function expectConstructionPresentation(evidence) {
  return evidence.completedBuildingCount === 0
    && evidence.constructionSiteCount === 1
    && evidence.finalModelCount === 0
    && evidence.scaffoldPresent === true
    && evidence.smokeSpriteCount > 0;
}

/**
 * Validates only aggregate synthetic presentation facts. No text, IDs, costs,
 * timestamps, screenshots, or browser URLs are accepted into the result.
 */
export function assertInnerKeepQaScenarioEvidence(
  value,
  expectedScenarioId,
  phase = 'steady',
) {
  const evidence = parseInnerKeepQaEvidence(value);
  const scenario = innerKeepQaScenarioById(expectedScenarioId);
  const expectedProgress = scenario.progressBasisPoints;
  const hasAuthoritativeBuilding = [
    'complete',
    'constructing',
    'completion-reveal',
    'builder-busy',
    'missing-asset',
  ].includes(scenario.state);
  const placementPreviewExpected = [
    'builder-busy',
    'insufficient',
  ].includes(scenario.state) && scenario.renderMode === 'webgl';
  const expectedCatalogueControlCount = scenario.catalogueOpen ? 6 : 0;
  const expectedMapBuildingControlCount = hasAuthoritativeBuilding ? 1 : 0;
  if (
    scenario.id !== expectedScenarioId
    || evidence.scenario !== scenario.id
    || evidence.renderMode !== scenario.renderMode
    || evidence.innerKeepRenderer !== scenario.renderMode
    || evidence.quality !== scenario.quality
    || evidence.reducedMotion !== scenario.reducedMotion
    || evidence.progressBasisPoints !== expectedProgress
    || evidence.catalogueBuildingControlCount !== expectedCatalogueControlCount
    || evidence.enabledCatalogueBuildingControlCount !== expectedCatalogueControlCount
    || evidence.mapBuildingControlCount !== expectedMapBuildingControlCount
    || evidence.enabledMapBuildingControlCount !== expectedMapBuildingControlCount
    || evidence.slotControlCount !== 0
    || evidence.enabledSlotControlCount !== 0
    || evidence.slotCount !== 0
    || evidence.placementPreviewActive !== placementPreviewExpected
    || evidence.placementPreviewValid !== placementPreviewExpected
    || evidence.horizontalOverflow
    || evidence.verticalOverflow
    || evidence.documentWidth > evidence.viewportWidth + 1
    || evidence.documentHeight > evidence.viewportHeight + 1
  ) throw new TypeError('Inner Keep QA scenario evidence mismatched.');

  if (scenario.renderMode === 'webgl') {
    if (
      evidence.canvasCount !== 1
      || evidence.rendererCount !== 1
      || evidence.rendererDrawCalls < 1
      || evidence.rendererTriangles < 1
      || evidence.webglContextCount !== 1
      || evidence.rafOwnerCount !== 1
      || evidence.maximumPendingRafCount > 1
      || evidence.slotGeometryCount !== 0
      || evidence.buildingPickTargetCount !== expectedMapBuildingControlCount
    ) throw new TypeError('Inner Keep QA single-renderer evidence mismatched.');
  } else if (
    evidence.canvasCount !== 0
    || evidence.rendererCount !== 0
    || evidence.rendererDrawCalls !== 0
    || evidence.rendererTriangles !== 0
    || evidence.webglContextCount !== 0
    || evidence.rafOwnerCount !== 0
    || evidence.maximumPendingRafCount !== 0
    || evidence.slotGeometryCount !== 0
    || evidence.buildingPickTargetCount !== 0
  ) {
    throw new TypeError('Inner Keep QA fallback resource evidence mismatched.');
  }

  if (!expectLivingScene(evidence, scenario)) {
    throw new TypeError('Inner Keep QA living-scene evidence mismatched.');
  }

  const constructing = [
    'constructing',
    'completion-reveal',
    'builder-busy',
  ].includes(scenario.state);
  const completed = ['complete', 'missing-asset'].includes(scenario.state);
  if (
    phase === 'reveal'
    && scenario.state === 'completion-reveal'
  ) {
    if (
      evidence.completedBuildingCount !== 1
      || evidence.constructionSiteCount !== 0
      || evidence.finalModelCount !== 1
      || !evidence.scaffoldPresent
      || !evidence.completionRevealActive
      || evidence.smokeSpriteCount < 1
    ) throw new TypeError('Inner Keep QA completion reveal evidence mismatched.');
  } else if (
    phase === 'completed'
    && scenario.state === 'completion-reveal'
  ) {
    if (!expectCompletedPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA completed reveal evidence mismatched.');
    }
  } else if (constructing) {
    if (!expectConstructionPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA construction evidence mismatched.');
    }
  } else if (completed) {
    if (!expectCompletedPresentation(evidence) || evidence.completionRevealActive) {
      throw new TypeError('Inner Keep QA completed-building evidence mismatched.');
    }
  } else if (
    evidence.completedBuildingCount !== 0
    || evidence.constructionSiteCount !== 0
    || evidence.finalModelCount !== 0
    || evidence.scaffoldPresent
    || evidence.smokeSpriteCount !== 0
  ) {
    throw new TypeError('Inner Keep QA empty presentation evidence mismatched.');
  }

  if (
    (scenario.state === 'missing-asset' && evidence.assetFallbackCount < 1)
    || (scenario.state === 'builder-busy' && !evidence.builderBusyVisible)
    || (scenario.state === 'insufficient' && !evidence.insufficientResourcesVisible)
    || (scenario.level !== null && !evidence.levelVisible)
  ) throw new TypeError('Inner Keep QA scenario UI evidence mismatched.');
  return evidence;
}

export function innerKeepQaBrowserCases(port) {
  const selectedPort = exactPort(port);
  return Object.freeze(INNER_KEEP_QA_SCENARIO_MANIFEST.map((scenario) => Object.freeze({
    id: scenario.id,
    scenario,
    url: innerKeepQaUrl({ port: selectedPort, scenario: scenario.id }),
    viewport: Object.freeze(
      scenario.id === 'empty'
        ? { width: 844, height: 390 }
        : ['construction-99-percent', 'compact-quality', 'reduced-motion',
        'missing-asset-fallback', '2d-fallback'].includes(scenario.id)
        ? { width: 390, height: 844 }
        : { width: 1_440, height: 900 }
    )
  })));
}
