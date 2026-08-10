import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { innerKeepPresentationIntegrity } from '../src/components/inner-keep/innerKeepPresentation';
import {
  INNER_KEEP_QA_CONSTRUCTION_DURATION_MICROS,
  completeSyntheticInnerKeepQaPresentation,
  createSyntheticInnerKeepQaPresentation
} from '../src/dev/innerKeepQaFixture';
import {
  INNER_KEEP_QA_SCENARIO_IDS,
  INNER_KEEP_QA_SCENARIO_MANIFEST,
  innerKeepQaScenarioById,
  readInnerKeepQaScenario
} from '../src/dev/innerKeepQaScenarioManifest.mjs';
import {
  INNER_KEEP_QA_CASE_COUNT,
  INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS,
  assertInnerKeepQaScenarioEvidence,
  innerKeepQaBrowserCases,
  innerKeepQaUrl
} from '../scripts/qa-observer/inner-keep-qa-contract.mjs';
import {
  analyzeInnerKeepQaScreenshot,
  assertInnerKeepQaScreenshotWindow
} from '../scripts/qa-observer/inner-keep-browser-probe.mjs';

const EXPECTED_SCENARIOS = Object.freeze([
  'empty',
  'high-quality',
  'active-conversation',
  'completed-level-1',
  'completed-level-2',
  'completed-level-3',
  'completed-level-4',
  'completed-level-5',
  'construction-1-percent',
  'construction-50-percent',
  'construction-99-percent',
  'completion-reveal',
  'builder-busy',
  'insufficient-resources',
  'compact-quality',
  'reduced-motion',
  'missing-asset-fallback',
  '2d-fallback'
]);

function evidenceFor(
  scenarioId: (typeof INNER_KEEP_QA_SCENARIO_IDS)[number],
  overrides: Readonly<Record<string, unknown>> = {}
) {
  const scenario = innerKeepQaScenarioById(scenarioId);
  const webgl = scenario.renderMode === 'webgl';
  const constructing = [
    'constructing',
    'completion-reveal',
    'builder-busy'
  ].includes(scenario.state);
  const completed = ['complete', 'missing-asset'].includes(scenario.state);
  const living = scenario.quality === 'high'
    ? {
        actorCount: 20,
        animationFrameCap: 30,
        animationMixerCount: 30,
        authoredTreeCount: 18,
        exteriorActorCount: 10,
        exteriorMountedActorCount: 6,
        exteriorPatrolUnitCount: 8,
        exteriorTreeCount: 88,
        grassBladeCount: 3_000,
        mountedActorCount: 6,
        patrolUnitCount: 12,
        rendererDrawCalls: 636,
        rendererTriangles: 534_156,
        resourceNodeCount: 8,
        sceneGraphDrawCalls: 329,
        sceneGraphTriangles: 274_564,
        farFieldParcelCount: 820,
        farFieldTuftCount: 320,
        farHedgerowTreeCount: 32,
        farTerrainTriangleCount: 9_760,
        terrainTriangleCount: 34_848,
        wildlifeCount: 10
      }
    : scenario.quality === 'reduced'
    ? {
        actorCount: 8,
        animationFrameCap: 18,
        animationMixerCount: 0,
        authoredTreeCount: 6,
        exteriorActorCount: 3,
        exteriorMountedActorCount: 2,
        exteriorPatrolUnitCount: 2,
        exteriorTreeCount: 28,
        grassBladeCount: 600,
        mountedActorCount: 2,
        patrolUnitCount: 4,
        rendererDrawCalls: 188,
        rendererTriangles: 70_331,
        resourceNodeCount: 4,
        sceneGraphDrawCalls: 190,
        sceneGraphTriangles: 75_000,
        farFieldParcelCount: 360,
        farFieldTuftCount: 96,
        farHedgerowTreeCount: 10,
        farTerrainTriangleCount: 2_120,
        terrainTriangleCount: 6_728,
        wildlifeCount: 4
      }
    : {
        actorCount: 12,
        animationFrameCap: 24,
        animationMixerCount: 19,
        authoredTreeCount: 12,
        exteriorActorCount: 6,
        exteriorMountedActorCount: 4,
        exteriorPatrolUnitCount: 4,
        exteriorTreeCount: 56,
        grassBladeCount: 1_800,
        mountedActorCount: 4,
        patrolUnitCount: 6,
        rendererDrawCalls: 261,
        rendererTriangles: 148_096,
        resourceNodeCount: 6,
        sceneGraphDrawCalls: 250,
        sceneGraphTriangles: 160_000,
        farFieldParcelCount: 648,
        farFieldTuftCount: 192,
        farHedgerowTreeCount: 20,
        farTerrainTriangleCount: 5_632,
        terrainTriangleCount: 18_432,
        wildlifeCount: 7
      };
  return {
    version: 3,
    scenario: scenario.id,
    renderMode: scenario.renderMode,
    innerKeepRenderer: scenario.renderMode,
    quality: scenario.quality,
    reducedMotion: scenario.reducedMotion,
    status: 'ready',
    assetStatus: webgl ? 'ready' : 'idle',
    progressBasisPoints: scenario.progressBasisPoints,
    canvasCount: webgl ? 1 : 0,
    rendererCount: webgl ? 1 : 0,
    rendererDrawCalls: webgl ? living.rendererDrawCalls : 0,
    rendererTriangles: webgl ? living.rendererTriangles : 0,
    sceneGraphDrawCalls: webgl ? living.sceneGraphDrawCalls : 0,
    sceneGraphTriangles: webgl ? living.sceneGraphTriangles : 0,
    webglContextCount: webgl ? 1 : 0,
    rafOwnerCount: webgl ? 1 : 0,
    maximumPendingRafCount: webgl ? 1 : 0,
    catalogueBuildingControlCount: scenario.catalogueOpen ? 6 : 0,
    enabledCatalogueBuildingControlCount: scenario.catalogueOpen ? 6 : 0,
    mapBuildingControlCount: constructing || completed ? 1 : 0,
    enabledMapBuildingControlCount: constructing || completed ? 1 : 0,
    slotControlCount: 0,
    enabledSlotControlCount: 0,
    slotCount: 0,
    slotGeometryCount: 0,
    buildingPickTargetCount: webgl && (constructing || completed) ? 1 : 0,
    placementPreviewActive: webgl && [
      'builder-busy',
      'insufficient'
    ].includes(scenario.state),
    placementPreviewValid: webgl && [
      'builder-busy',
      'insufficient'
    ].includes(scenario.state),
    smokeSpriteCount: constructing ? 96 : 0,
    grassBladeCount: webgl ? living.grassBladeCount : 0,
    waterSurfaceCount: webgl ? 2 : 0,
    authoredAssetCount: webgl ? 38 : 0,
    authoredPlacementCount: webgl ? 101 : 0,
    authoredTreeCount: webgl ? living.authoredTreeCount : 0,
    ambientActorCount: webgl ? living.actorCount : 0,
    animationFrameCap: webgl && !scenario.reducedMotion
      ? living.animationFrameCap
      : 0,
    mountedActorCount: webgl ? living.mountedActorCount : 0,
    patrolUnitCount: webgl ? living.patrolUnitCount : 0,
    activeConversationCount: scenario.id === 'active-conversation' ? 1 : 0,
    animationMixerCount: webgl && !scenario.reducedMotion
      ? living.animationMixerCount
      : 0,
    runtimeAssetFailureCount: 0,
    outerWorldStatus: webgl ? 'ready' : 'idle',
    outerWorldRuntimeAssetFailureCount: 0,
    topographicFeatureCount: webgl ? 9 : 0,
    terrainTriangleCount: webgl ? living.terrainTriangleCount : 0,
    terrainHeightRangeMillimeters: webgl ? 2_480 : 0,
    farCountrysideStatus: webgl ? 'ready' : 'idle',
    farCountrysideTerrainTriangleCount: webgl ? living.farTerrainTriangleCount : 0,
    farCountrysideFieldParcelCount: webgl ? living.farFieldParcelCount : 0,
    farCountrysideFieldTuftCount: webgl ? living.farFieldTuftCount : 0,
    farCountrysideHedgerowTreeCount: webgl ? living.farHedgerowTreeCount : 0,
    exteriorTreeCount: webgl ? living.exteriorTreeCount : 0,
    scenicResourceNodeCount: webgl ? living.resourceNodeCount : 0,
    wildlifeAssetStatus: webgl ? 'ready' : 'idle',
    wildlifeCount: webgl ? living.wildlifeCount : 0,
    exactWildlifeCount: webgl ? living.wildlifeCount : 0,
    proceduralWildlifeCount: 0,
    tradeWagonCount: webgl ? 1 : 0,
    exteriorActorCount: webgl ? living.exteriorActorCount : 0,
    exteriorMountedActorCount: webgl ? living.exteriorMountedActorCount : 0,
    exteriorPatrolUnitCount: webgl ? living.exteriorPatrolUnitCount : 0,
    barracksPlacementPresent: false,
    cathedralPlacementPresent: false,
    constructionSiteCount: constructing ? 1 : 0,
    completedBuildingCount: completed ? 1 : 0,
    finalModelCount: completed && webgl ? 1 : 0,
    scaffoldPresent: constructing,
    completionRevealActive: false,
    assetFallbackCount: scenario.state === 'missing-asset' ? 2 : 0,
    builderBusyVisible: scenario.state === 'builder-busy',
    insufficientResourcesVisible: scenario.state === 'insufficient',
    levelVisible: scenario.level !== null,
    viewportWidth: 1_440,
    viewportHeight: 900,
    documentWidth: 1_440,
    documentHeight: 900,
    horizontalOverflow: false,
    verticalOverflow: false,
    ...overrides
  };
}

function innerKeepScreenshotPng(blank: boolean) {
  const chunk = (type: string, data: Buffer) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.byteLength);
    return Buffer.concat([length, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
  };
  const width = 320;
  const height = 320;
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 6;
  const rows = Buffer.alloc((width * 4 + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const row = y * (width * 4 + 1);
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      rows[offset] = blank ? 0 : (x * 7 + y * 3) & 0xff;
      rows[offset + 1] = blank ? 0 : (x * 2 + y * 11) & 0xff;
      rows[offset + 2] = blank ? 0 : (x * 13 + y * 5) & 0xff;
      rows[offset + 3] = 255;
    }
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0))
  ]).toString('base64');
}

describe('local Inner Keep QA fixtures', () => {
  it('pins every requested scenario once and rejects arbitrary query input', () => {
    expect(INNER_KEEP_QA_SCENARIO_IDS).toEqual(EXPECTED_SCENARIOS);
    expect(INNER_KEEP_QA_SCENARIO_MANIFEST).toHaveLength(18);
    expect(INNER_KEEP_QA_CASE_COUNT).toBe(18);
    expect(new Set(INNER_KEEP_QA_SCENARIO_IDS).size).toBe(18);
    expect(readInnerKeepQaScenario('?scenario=construction-50-percent').id)
      .toBe('construction-50-percent');
    expect(readInnerKeepQaScenario('?scenario=not-reviewed').id).toBe('empty');
    expect(readInnerKeepQaScenario('?scenario=empty&extra=true').id).toBe('empty');
    expect(readInnerKeepQaScenario('?scenario=empty&scenario=completed-level-5').id)
      .toBe('empty');
    expect(INNER_KEEP_QA_SCENARIO_MANIFEST.every((scenario) => (
      !Object.hasOwn(scenario, 'selectedSlotId')
    ))).toBe(true);
    expect(INNER_KEEP_QA_SCENARIO_MANIFEST.filter(({ catalogueOpen }) => (
      catalogueOpen
    )).map(({ id }) => id)).toEqual(['high-quality']);
  });

  it('starts from an empty yard and keeps Barracks and Cathedral player-built', () => {
    const presentation = createSyntheticInnerKeepQaPresentation(
      innerKeepQaScenarioById('empty'),
      2_000_000_000_000_000n
    );
    expect(presentation.buildings).toEqual([]);
    expect(presentation.catalogue.map(({ buildingKind }) => buildingKind)).toEqual([
      'city-mill',
      'lumber-camp',
      'city-stoneworks',
      'city-goldworks',
      'city-barracks',
      'grand-covenant-cathedral'
    ]);
  });

  it('builds integrity-valid synthetic projections with exact construction progress', () => {
    const observedAtMicros = 2_000_000_000_000_000n;
    for (const scenario of INNER_KEEP_QA_SCENARIO_MANIFEST) {
      const presentation = createSyntheticInnerKeepQaPresentation(
        scenario,
        observedAtMicros
      );
      expect(innerKeepPresentationIntegrity(presentation), scenario.id).toBe(true);
      expect(presentation.castleId).toBeTypeOf('bigint');
      expect(presentation.catalogue).toHaveLength(6);
      expect(JSON.stringify(presentation, (_key, value) => (
        typeof value === 'bigint' ? value.toString() : value
      ))).not.toMatch(/(?:fid|token|wallet|receipt|requestKey)/i);
      if (scenario.progressBasisPoints !== null) {
        const building = presentation.buildings[0];
        expect(building?.phase).toBe('constructing');
        expect(observedAtMicros - building!.startedAtMicros!).toBe(
          INNER_KEEP_QA_CONSTRUCTION_DURATION_MICROS
            * BigInt(scenario.progressBasisPoints) / 10_000n
        );
      }
    }
  });

  it('uses only reviewed content-addressed catalogue previews and shared effect copy', () => {
    const presentation = createSyntheticInnerKeepQaPresentation(
      innerKeepQaScenarioById('empty'),
      2_000_000_000_000_000n
    );
    const previewPaths = presentation.catalogue.map((entry) => entry.previewUrl);
    expect(new Set(previewPaths).size).toBe(6);
    expect(previewPaths.every((path) => (
      /^images\/inner-keep\/catalog\/[a-z-]+-[a-f0-9]{16}\.png$/.test(path ?? '')
    ))).toBe(true);
    expect(presentation.catalogue.map((entry) => entry.effectCopy)).toEqual([
      'Each completed level lowers future Food costs by 5%, up to 25%.',
      'Each completed level lowers future Wood costs by 5%, up to 25%.',
      'Each completed level lowers future Stone costs by 5%, up to 25%.',
      'Each completed level lowers future Gold costs by 5%, up to 25%.',
      'A major military project for the growing town.',
      'A monumental civic project for the heart of the town.'
    ]);
  });

  it('removes only the reviewed missing-art preview in the fallback scenario', () => {
    const presentation = createSyntheticInnerKeepQaPresentation(
      innerKeepQaScenarioById('missing-asset-fallback'),
      2_000_000_000_000_000n
    );
    expect(presentation.catalogue.map(({ buildingKind, previewUrl }) => ({
      buildingKind,
      previewUrl
    }))).toEqual([
      { buildingKind: 'city-mill', previewUrl: undefined },
      expect.objectContaining({ buildingKind: 'lumber-camp' }),
      expect.objectContaining({ buildingKind: 'city-stoneworks' }),
      expect.objectContaining({ buildingKind: 'city-goldworks' }),
      expect.objectContaining({ buildingKind: 'city-barracks' }),
      expect.objectContaining({ buildingKind: 'grand-covenant-cathedral' })
    ]);
  });

  it('models an authoritative construction-to-complete observation without an empty state', () => {
    const scenario = innerKeepQaScenarioById('completion-reveal');
    const constructing = createSyntheticInnerKeepQaPresentation(
      scenario,
      2_000_000_000_000_000n
    );
    const complete = completeSyntheticInnerKeepQaPresentation(constructing);
    expect(constructing.buildings).toMatchObject([{ phase: 'constructing' }]);
    expect(complete.buildings).toMatchObject([{
      completedLevel: 1,
      phase: 'complete',
      targetLevel: 1
    }]);
    expect(complete.projectRevision).toBe(constructing.projectRevision + 1n);
    expect(complete.builder).toEqual({ state: 'idle' });
    expect(innerKeepPresentationIntegrity(complete)).toBe(true);
  });
});

describe('local Inner Keep rendered evidence contract', () => {
  it('reduces screenshots to bounded visual aggregates and rejects blank frames', () => {
    expect(analyzeInnerKeepQaScreenshot(
      innerKeepScreenshotPng(false),
      { width: 320, height: 320 }
    )).toMatchObject({
      distinctColourBuckets: expect.any(Number),
      luminanceRange: expect.any(Number),
      opaqueSamples: 651,
      sampleCount: 651
    });
    expect(() => analyzeInnerKeepQaScreenshot(
      innerKeepScreenshotPng(true),
      { width: 320, height: 320 }
    )).toThrow(/credible visual output/i);
    expect(() => analyzeInnerKeepQaScreenshot(
      innerKeepScreenshotPng(false),
      { width: 321, height: 320 }
    )).toThrow(/screenshot/i);
  });

  it('sandwiches conversation and high-quality screenshots with exact evidence', () => {
    expect(assertInnerKeepQaScreenshotWindow(
      evidenceFor('active-conversation'),
      evidenceFor('active-conversation'),
      'active-conversation'
    )).toEqual({
      activeConversationCount: 1,
      quality: 'balanced',
      scenario: 'active-conversation'
    });
    expect(() => assertInnerKeepQaScreenshotWindow(
      evidenceFor('active-conversation'),
      evidenceFor('active-conversation', { activeConversationCount: 0 }),
      'active-conversation'
    )).toThrow(/living-scene|conversation screenshot/i);
    expect(assertInnerKeepQaScreenshotWindow(
      evidenceFor('high-quality'),
      evidenceFor('high-quality'),
      'high-quality'
    )).toEqual({
      activeConversationCount: 0,
      quality: 'high',
      scenario: 'high-quality'
    });
    expect(() => assertInnerKeepQaScreenshotWindow(
      evidenceFor('high-quality', { ambientActorCount: 19 }),
      evidenceFor('high-quality', { ambientActorCount: 19 }),
      'high-quality'
    )).toThrow(/living-scene|high-quality screenshot/i);
  });

  it('formats only the fixed numeric-loopback route and complete case matrix', () => {
    expect(innerKeepQaUrl({ port: 41734, scenario: 'completion-reveal' })).toBe(
      'http://127.0.0.1:41734/dev/inner-keep-qa.html?scenario=completion-reveal'
    );
    expect(() => innerKeepQaUrl({ port: 0 })).toThrow(/loopback port/i);
    expect(() => innerKeepQaUrl({
      port: 41734,
      scenario: 'arbitrary' as 'empty'
    })).toThrow(/scenario/i);
    const cases = innerKeepQaBrowserCases(41734);
    expect(cases.map((entry) => entry.id)).toEqual(EXPECTED_SCENARIOS);
    expect(cases.find((entry) => entry.id === 'empty')?.viewport).toEqual({
      width: 844,
      height: 390
    });
    expect(cases.filter((entry) => entry.viewport.width === 390).map((entry) => entry.id))
      .toEqual([
        'construction-99-percent',
        'compact-quality',
        'reduced-motion',
        'missing-asset-fallback',
        '2d-fallback'
      ]);
  });

  it('requires exactly one renderer/context/RAF owner for WebGL and none for fallback', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('construction-50-percent'),
      'construction-50-percent'
    )).toMatchObject({
      buildingPickTargetCount: 1,
      canvasCount: 1,
      finalModelCount: 0,
      rendererCount: 1,
      rendererDrawCalls: 261,
      rendererTriangles: 148_096,
      scaffoldPresent: true,
      slotCount: 0,
      slotGeometryCount: 0,
      webglContextCount: 1
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('2d-fallback', {
        viewportWidth: 390,
        viewportHeight: 844,
        documentWidth: 390,
        documentHeight: 844
      }),
      '2d-fallback'
    )).toMatchObject({
      canvasCount: 0,
      rendererCount: 0,
      rendererDrawCalls: 0,
      rendererTriangles: 0,
      buildingPickTargetCount: 0,
      slotControlCount: 0,
      slotCount: 0,
      webglContextCount: 0
    });
    for (const override of [
      { rendererCount: 2 },
      { rendererDrawCalls: 0 },
      { rendererTriangles: 0 },
      { webglContextCount: 2 },
      { rafOwnerCount: 2 },
      { maximumPendingRafCount: 2 },
      { slotGeometryCount: 1 }
    ]) {
      expect(() => assertInnerKeepQaScenarioEvidence(
        evidenceFor('empty', override),
        'empty'
      )).toThrow(/single-renderer/i);
    }
    for (const override of [
      { slotControlCount: 1 },
      { enabledSlotControlCount: 1 },
      { slotCount: 1 }
    ]) {
      expect(() => assertInnerKeepQaScenarioEvidence(
        evidenceFor('empty', override),
        'empty'
      )).toThrow(/mismatched/i);
    }
  });

  it('keeps the version-three free-placement evidence shape exact', () => {
    const complete = evidenceFor('empty');
    const { wildlifeCount, ...missingWildlifeCount } = complete;
    expect(wildlifeCount).toBe(7);
    expect(() => assertInnerKeepQaScenarioEvidence(
      { ...complete, version: 1 },
      'empty'
    )).toThrow(/invalid/i);
    expect(() => assertInnerKeepQaScenarioEvidence(
      missingWildlifeCount,
      'empty'
    )).toThrow(/invalid/i);
    expect(() => assertInnerKeepQaScenarioEvidence(
      { ...complete, unreviewedField: 1 },
      'empty'
    )).toThrow(/invalid/i);
  });

  it('rejects quality-cap drift in animation, scene-graph, and renderer evidence', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('empty', { rendererDrawCalls: 700 }),
      'empty'
    )).toMatchObject({ rendererDrawCalls: 700 });
    for (const override of [
      { animationFrameCap: 25 },
      {
        sceneGraphDrawCalls:
          INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.balanced.drawCalls + 1,
      },
      {
        sceneGraphTriangles:
          INNER_KEEP_QA_SCENE_GRAPH_RENDER_BUDGETS.balanced.triangles + 1,
      },
      { rendererDrawCalls: 701 },
      { rendererTriangles: 750_001 }
    ]) {
      expect(() => assertInnerKeepQaScenarioEvidence(
        evidenceFor('empty', override),
        'empty'
      )).toThrow(/living-scene/i);
    }
  });

  it('waits for the exact authored living scene and proves the fallback stays empty', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('empty'),
      'empty'
    )).toMatchObject({
      ambientActorCount: 12,
      animationMixerCount: 19,
      assetStatus: 'ready',
      authoredAssetCount: 38,
      authoredPlacementCount: 101,
      authoredTreeCount: 12,
      barracksPlacementPresent: false,
      cathedralPlacementPresent: false,
      exactWildlifeCount: 7,
      exteriorActorCount: 6,
      exteriorMountedActorCount: 4,
      exteriorPatrolUnitCount: 4,
      exteriorTreeCount: 56,
      grassBladeCount: 1_800,
      mountedActorCount: 4,
      patrolUnitCount: 6,
      scenicResourceNodeCount: 6,
      farCountrysideFieldParcelCount: 648,
      farCountrysideFieldTuftCount: 192,
      farCountrysideHedgerowTreeCount: 20,
      farCountrysideStatus: 'ready',
      farCountrysideTerrainTriangleCount: 5_632,
      terrainTriangleCount: 18_432,
      topographicFeatureCount: 9,
      tradeWagonCount: 1,
      wildlifeAssetStatus: 'ready',
      wildlifeCount: 7,
      runtimeAssetFailureCount: 0,
      waterSurfaceCount: 2
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('compact-quality', {
        viewportWidth: 390,
        viewportHeight: 844,
        documentWidth: 390,
        documentHeight: 844
      }),
      'compact-quality'
    )).toMatchObject({
      ambientActorCount: 8,
      animationMixerCount: 0,
      authoredTreeCount: 6,
      exactWildlifeCount: 4,
      exteriorActorCount: 3,
      exteriorTreeCount: 28,
      grassBladeCount: 600,
      mountedActorCount: 2,
      patrolUnitCount: 4
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('high-quality'),
      'high-quality'
    )).toMatchObject({
      ambientActorCount: 20,
      animationMixerCount: 30,
      authoredTreeCount: 18,
      catalogueBuildingControlCount: 6,
      enabledCatalogueBuildingControlCount: 6,
      exactWildlifeCount: 10,
      exteriorActorCount: 10,
      exteriorTreeCount: 88,
      grassBladeCount: 3_000,
      mountedActorCount: 6,
      patrolUnitCount: 12
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('active-conversation'),
      'active-conversation'
    ).activeConversationCount).toBe(1);
    expect(() => assertInnerKeepQaScenarioEvidence(
      evidenceFor('active-conversation', { activeConversationCount: 0 }),
      'active-conversation'
    )).toThrow(/living-scene/i);
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('reduced-motion'),
      'reduced-motion'
    ).animationMixerCount).toBe(0);
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('2d-fallback', {
        viewportWidth: 390,
        viewportHeight: 844,
        documentWidth: 390,
        documentHeight: 844
      }),
      '2d-fallback'
    )).toMatchObject({
      ambientActorCount: 0,
      assetStatus: 'idle',
      authoredAssetCount: 0,
      authoredPlacementCount: 0,
      authoredTreeCount: 0,
      barracksPlacementPresent: false,
      cathedralPlacementPresent: false,
      grassBladeCount: 0,
      farCountrysideStatus: 'idle',
      outerWorldStatus: 'idle',
      terrainTriangleCount: 0,
      wildlifeAssetStatus: 'idle',
      wildlifeCount: 0,
      waterSurfaceCount: 0
    });

    for (const override of [
      { assetStatus: 'loading' },
      { assetStatus: 'degraded' },
      { authoredAssetCount: 37 },
      { authoredPlacementCount: 100 },
      { authoredTreeCount: 11 },
      { grassBladeCount: 1_799 },
      { waterSurfaceCount: 1 },
      { ambientActorCount: 11 },
      { mountedActorCount: 3 },
      { patrolUnitCount: 5 },
      { animationMixerCount: 18 },
      { runtimeAssetFailureCount: 1 },
      { outerWorldStatus: 'loading' },
      { outerWorldRuntimeAssetFailureCount: 1 },
      { topographicFeatureCount: 8 },
      { terrainTriangleCount: 18_431 },
      { farCountrysideStatus: 'degraded' },
      { farCountrysideTerrainTriangleCount: 5_631 },
      { farCountrysideFieldParcelCount: 647 },
      { farCountrysideFieldTuftCount: 191 },
      { farCountrysideHedgerowTreeCount: 19 },
      { terrainHeightRangeMillimeters: 0 },
      { exteriorTreeCount: 55 },
      { scenicResourceNodeCount: 5 },
      { wildlifeAssetStatus: 'loading' },
      { wildlifeCount: 6 },
      { exactWildlifeCount: 6 },
      { proceduralWildlifeCount: 1 },
      { tradeWagonCount: 0 },
      { exteriorActorCount: 5 },
      { exteriorMountedActorCount: 3 },
      { exteriorPatrolUnitCount: 3 },
      { barracksPlacementPresent: true },
      { cathedralPlacementPresent: true }
    ]) {
      expect(() => assertInnerKeepQaScenarioEvidence(
        evidenceFor('empty', override),
        'empty'
      )).toThrow(/living-scene/i);
    }
    expect(() => assertInnerKeepQaScenarioEvidence(
      evidenceFor('2d-fallback', {
        ambientActorCount: 1,
        viewportWidth: 390,
        viewportHeight: 844,
        documentWidth: 390,
        documentHeight: 844
      }),
      '2d-fallback'
    )).toThrow(/living-scene/i);
  });

  it('proves construction, bounded reveal, completed, busy, insufficient, and missing-art states', () => {
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('completion-reveal', {
        completedBuildingCount: 1,
        completionRevealActive: true,
        constructionSiteCount: 0,
        finalModelCount: 1,
        scaffoldPresent: true
      }),
      'completion-reveal',
      'reveal'
    )).toMatchObject({ completionRevealActive: true });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('completion-reveal', {
        completedBuildingCount: 1,
        completionRevealActive: false,
        constructionSiteCount: 0,
        finalModelCount: 1,
        scaffoldPresent: false,
        smokeSpriteCount: 0
      }),
      'completion-reveal',
      'completed'
    )).toMatchObject({ finalModelCount: 1, scaffoldPresent: false });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('builder-busy'),
      'builder-busy'
    )).toMatchObject({
      builderBusyVisible: true,
      buildingPickTargetCount: 1,
      mapBuildingControlCount: 1,
      placementPreviewActive: true,
      placementPreviewValid: true
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('insufficient-resources'),
      'insufficient-resources'
    )).toMatchObject({
      buildingPickTargetCount: 0,
      insufficientResourcesVisible: true,
      mapBuildingControlCount: 0,
      placementPreviewActive: true,
      placementPreviewValid: true
    });
    expect(assertInnerKeepQaScenarioEvidence(
      evidenceFor('missing-asset-fallback'),
      'missing-asset-fallback'
    ).assetFallbackCount).toBeGreaterThan(0);
  });
});

describe('local Inner Keep QA production boundary', () => {
  it('pins a loopback-only CSP, dynamic entry, and explicit production exclusion', () => {
    const root = process.cwd();
    const html = readFileSync(resolve(root, 'dev/inner-keep-qa.html'), 'utf8');
    const main = readFileSync(resolve(root, 'src/dev/innerKeepQaMain.tsx'), 'utf8');
    const harness = readFileSync(resolve(root, 'src/dev/InnerKeepQaHarness.tsx'), 'utf8');
    const fixture = readFileSync(resolve(root, 'src/dev/innerKeepQaFixture.ts'), 'utf8');
    const manifest = readFileSync(
      resolve(root, 'src/dev/innerKeepQaScenarioManifest.mjs'),
      'utf8'
    );
    const productionMain = readFileSync(resolve(root, 'src/main.tsx'), 'utf8');
    const productionApp = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    const verifier = readFileSync(
      resolve(root, 'scripts/verify-production-dist-exclusions.mjs'),
      'utf8'
    );
    const browserProbe = readFileSync(
      resolve(root, 'scripts/qa-observer/inner-keep-browser-probe.mjs'),
      'utf8'
    );
    const packageJson = JSON.parse(
      readFileSync(resolve(root, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const csp = parsed.querySelectorAll('meta[http-equiv="Content-Security-Policy"]');
    expect(csp).toHaveLength(1);
    expect(csp[0]?.getAttribute('content')).toContain("default-src 'none'");
    expect(csp[0]?.getAttribute('content')).toContain("connect-src 'self' blob: ws://127.0.0.1:*");
    expect(csp[0]?.getAttribute('content')).not.toMatch(/https:\/\/(?:warpkeep|farcaster|maincloud)/);
    expect(main).toContain('assertLocalQaRuntime()');
    expect(main).toContain("import('./InnerKeepQaHarness')");
    expect(main).not.toMatch(/^import .*InnerKeepQaHarness/m);
    expect(harness.match(/new THREE\.WebGLRenderer/g)).toHaveLength(1);
    expect(harness).toContain('createInnerKeepSceneLayer');
    expect(harness).toContain('data-inner-keep-qa-canvas');
    expect(harness).toContain('THREE.ACESFilmicToneMapping');
    expect(harness).toContain('REALM_LIGHTING_SPECS');
    expect(harness).toContain('toneMappingExposure');
    expect(`${fixture}\n${manifest}`).not.toMatch(
      /(?:useFarcasterAuth|FarcasterAuthProvider|useWarpkeepBackend|WarpkeepSpacetimeProvider|\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|document\.cookie|auth\.warpkeep\.com)/
    );
    expect(productionMain).not.toMatch(/innerKeepQa|InnerKeepQa|inner-keep-qa/i);
    expect(productionApp).not.toMatch(/innerKeepQa|InnerKeepQa|inner-keep-qa/i);
    expect(verifier).toContain('inner-keep-qa.html');
    expect(verifier).toContain('InnerKeepQaHarness');
    expect(verifier).toContain('INNER_KEEP_QA_SCENARIO_MANIFEST');
    expect(browserProbe).toContain('attestStableHeadlessChromeExecutable');
    expect(browserProbe).toContain('exactChromeExecutableIdentity');
    expect(browserProbe).toContain('DevtoolsPipeSession');
    expect(browserProbe).toContain("'Fetch.enable'");
    expect(browserProbe).toContain("'Page.captureScreenshot'");
    expect(browserProbe).toContain("from './png-visual-aggregate.mjs'");
    expect(browserProbe).toContain('analyzeInnerKeepQaScreenshot');
    expect(browserProbe).toContain('assertInnerKeepQaScreenshotWindow');
    expect(browserProbe).not.toMatch(/\bwriteFile\s*\(/u);
    expect(browserProbe).toContain("'Input.dispatchKeyEvent'");
    expect(browserProbe).toContain('exerciseWebglNativeKeyboardActivation');
    expect(browserProbe).toContain('semanticBuildingLabels');
    expect(browserProbe).toContain('catalogueBuildingControlCount');
    expect(browserProbe).toContain('buildingPickTargetCount');
    expect(browserProbe).toContain('placementPreviewValid');
    expect(browserProbe).toContain("'[data-inner-keep-slot-id]'");
    expect(browserProbe).toContain("querySelector('#inner-keep-panel-title')");
    expect(browserProbe).toContain("querySelector('.inner-keep-builder')");
    expect(browserProbe).toContain('panelTouchAction');
    expect(browserProbe).toContain('preview.naturalWidth === 320');
    for (const geometryCase of ['desktop', 'short-landscape', 'mobile-portrait']) {
      expect(browserProbe).toContain(`id: '${geometryCase}'`);
    }
    expect(browserProbe).toContain('CDP_TIMEOUT_MILLISECONDS');
    expect(browserProbe).toContain('createLoopbackViteServer');
    expect(packageJson.scripts['qa:inner-keep']).toBe(
      'node scripts/qa-observer/inner-keep-browser-probe.mjs'
    );
  });
});
