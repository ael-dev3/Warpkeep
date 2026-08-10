import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState
} from 'react';
import * as THREE from 'three';

import { InnerKeepScreen } from '../components/inner-keep/InnerKeepScreen';
import {
  createInnerKeepSceneLayer,
  type InnerKeepSceneLayer,
  type InnerKeepSceneTelemetry
} from '../components/inner-keep/createInnerKeepSceneLayer';
import type { InnerKeepBuildingKind } from '../components/inner-keep/innerKeepPresentation';
import {
  initialInnerKeepPlacementDraft,
  type InnerKeepPlacementDraft
} from '../components/inner-keep/innerKeepPlacement';
import { REALM_LIGHTING_SPECS } from '../components/realm/realmQuality';
import {
  completeSyntheticInnerKeepQaPresentation,
  createSyntheticInnerKeepQaPresentation
} from './innerKeepQaFixture';
import { innerKeepQaRuntimeInstrumentation } from './innerKeepQaInstrumentation';
import { readInnerKeepQaRendererEvidence } from './innerKeepQaRendererEvidence';
import type { InnerKeepQaScenario } from './innerKeepQaScenarioManifest.mjs';

const EMPTY_TELEMETRY: InnerKeepSceneTelemetry = Object.freeze({
  status: 'empty',
  assetStatus: 'idle',
  triangleCount: 0,
  drawCalls: 0,
  smokeSpriteCount: 0,
  grassBladeCount: 0,
  waterSurfaceCount: 0,
  authoredAssetCount: 0,
  authoredPlacementCount: 0,
  authoredTreeCount: 0,
  ambientActorCount: 0,
  mountedActorCount: 0,
  patrolUnitCount: 0,
  activeConversationCount: 0,
  animationMixerCount: 0,
  runtimeAssetFailureCount: 0,
  outerWorldStatus: 'idle',
  outerWorldRuntimeAssetFailureCount: 0,
  topographicFeatureCount: 0,
  terrainTriangleCount: 0,
  terrainHeightRangeMillimeters: 0,
  farCountrysideStatus: 'idle',
  farCountrysideTerrainTriangleCount: 0,
  farCountrysideFieldParcelCount: 0,
  farCountrysideFieldTuftCount: 0,
  farCountrysideHedgerowTreeCount: 0,
  exteriorTreeCount: 0,
  scenicResourceNodeCount: 0,
  wildlifeAssetStatus: 'idle',
  wildlifeCount: 0,
  exactWildlifeCount: 0,
  proceduralWildlifeCount: 0,
  tradeWagonCount: 0,
  exteriorActorCount: 0,
  exteriorMountedActorCount: 0,
  exteriorPatrolUnitCount: 0,
  slotCount: 0,
  buildingPickTargetCount: 0,
  placementPreviewActive: false,
  placementPreviewValid: false,
  completedBuildingCount: 0,
  constructionSiteCount: 0,
  completionRevealActive: false
});
const qaInstrumentation = innerKeepQaRuntimeInstrumentation();

type SceneEvidence = Readonly<{
  barracksPlacementPresent: boolean;
  cathedralPlacementPresent: boolean;
  finalModelCount: number;
  scaffoldPresent: boolean;
  slotGeometryCount: number;
}>;

function sceneEvidence(layer: InnerKeepSceneLayer): SceneEvidence {
  let barracksPlacementPresent = false;
  let cathedralPlacementPresent = false;
  let finalModelCount = 0;
  let scaffoldPresent = false;
  let slotGeometryCount = 0;
  layer.scene.traverse((object) => {
    if (
      object.name
        === 'inner-keep-authored-placement:grand-covenant-cathedral-main-building'
      || object.name === 'inner-keep-completed-building:grand-covenant-cathedral'
    ) {
      cathedralPlacementPresent = true;
    } else if (
      object.name
        === 'inner-keep-authored-placement:shieldcourt-barracks-west-garrison'
      || object.name === 'inner-keep-completed-building:city-barracks'
    ) {
      barracksPlacementPresent = true;
    } else if (object.name.startsWith('inner-keep-completed-building:')) {
      finalModelCount += 1;
    } else if (object.name === 'inner-keep-construction-scaffold') {
      scaffoldPresent = true;
    } else if (object.name.startsWith('inner-keep-slot-pad:')) {
      slotGeometryCount += 1;
    }
  });
  return Object.freeze({
    barracksPlacementPresent,
    cathedralPlacementPresent,
    finalModelCount,
    scaffoldPresent,
    slotGeometryCount
  });
}

function telemetryKey(telemetry: InnerKeepSceneTelemetry, evidence: SceneEvidence) {
  return [
    telemetry.status,
    telemetry.assetStatus,
    telemetry.triangleCount,
    telemetry.drawCalls,
    telemetry.smokeSpriteCount,
    telemetry.grassBladeCount,
    telemetry.waterSurfaceCount,
    telemetry.authoredAssetCount,
    telemetry.authoredPlacementCount,
    telemetry.authoredTreeCount,
    telemetry.ambientActorCount,
    telemetry.mountedActorCount,
    telemetry.patrolUnitCount,
    telemetry.activeConversationCount,
    telemetry.animationMixerCount,
    telemetry.runtimeAssetFailureCount,
    telemetry.outerWorldStatus,
    telemetry.outerWorldRuntimeAssetFailureCount,
    telemetry.topographicFeatureCount,
    telemetry.terrainTriangleCount,
    telemetry.terrainHeightRangeMillimeters,
    telemetry.farCountrysideStatus,
    telemetry.farCountrysideTerrainTriangleCount,
    telemetry.farCountrysideFieldParcelCount,
    telemetry.farCountrysideFieldTuftCount,
    telemetry.farCountrysideHedgerowTreeCount,
    telemetry.exteriorTreeCount,
    telemetry.scenicResourceNodeCount,
    telemetry.wildlifeAssetStatus,
    telemetry.wildlifeCount,
    telemetry.exactWildlifeCount,
    telemetry.proceduralWildlifeCount,
    telemetry.tradeWagonCount,
    telemetry.exteriorActorCount,
    telemetry.exteriorMountedActorCount,
    telemetry.exteriorPatrolUnitCount,
    telemetry.slotCount,
    telemetry.buildingPickTargetCount,
    telemetry.placementPreviewActive,
    telemetry.placementPreviewValid,
    telemetry.completedBuildingCount,
    telemetry.constructionSiteCount,
    telemetry.completionRevealActive,
    evidence.barracksPlacementPresent,
    evidence.cathedralPlacementPresent,
    evidence.finalModelCount,
    evidence.scaffoldPresent,
    evidence.slotGeometryCount
  ].join(':');
}

export function InnerKeepQaHarness({ scenario }: Readonly<{
  scenario: InnerKeepQaScenario;
}>) {
  const [presentation, setPresentation] = useState(() => (
    createSyntheticInnerKeepQaPresentation(scenario)
  ));
  const initialScenarioBuildingKind = (
    scenario.selectedBuildingKind as InnerKeepBuildingKind | null
  );
  const initialScenarioBuildingExists = initialScenarioBuildingKind !== null
    && presentation.buildings.some(({ buildingKind }) => (
      buildingKind === initialScenarioBuildingKind
    ));
  const [catalogueOpen, setCatalogueOpen] = useState(scenario.catalogueOpen);
  const [placementBuildingKind, setPlacementBuildingKind] =
    useState<InnerKeepBuildingKind | undefined>(
      initialScenarioBuildingKind !== null && !initialScenarioBuildingExists
        ? initialScenarioBuildingKind
        : undefined
    );
  const [placementDraft, setPlacementDraft] = useState<InnerKeepPlacementDraft | null>(() => (
    initialScenarioBuildingKind !== null && !initialScenarioBuildingExists
      ? initialInnerKeepPlacementDraft(initialScenarioBuildingKind, presentation.buildings)
      : null
  ));
  const [selectedBuildingKind, setSelectedBuildingKind] =
    useState<InnerKeepBuildingKind | undefined>(
      initialScenarioBuildingExists ? initialScenarioBuildingKind ?? undefined : undefined
    );
  const [sceneTelemetry, setSceneTelemetry] = useState(EMPTY_TELEMETRY);
  const [sceneState, setSceneState] = useState<'loading' | 'ready' | 'unavailable'>(
    scenario.renderMode === 'fallback' ? 'ready' : 'loading'
  );
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<InnerKeepSceneLayer | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const frameRef = useRef<number | null>(null);
  const firstFrameTimeRef = useRef<number | null>(null);
  const presentationRef = useRef(presentation);
  const lastTelemetryKeyRef = useRef('');
  presentationRef.current = presentation;

  const publishBrowserEvidence = useCallback((
    layer: InnerKeepSceneLayer | null = layerRef.current
  ) => {
    const root = rootRef.current;
    if (!root) return;
    const instrumentation = qaInstrumentation.snapshot();
    const rendererEvidence = readInnerKeepQaRendererEvidence(rendererRef.current);
    const currentPresentation = presentationRef.current;
    const telemetry = layer?.getTelemetry() ?? Object.freeze({
      ...EMPTY_TELEMETRY,
      status: scenario.renderMode === 'fallback' ? 'ready' : 'empty',
      slotCount: 0,
      completedBuildingCount: scenario.renderMode === 'fallback'
        ? currentPresentation.buildings.filter((building) => building.phase === 'complete').length
        : 0,
      constructionSiteCount: scenario.renderMode === 'fallback'
        ? currentPresentation.buildings.filter((building) => building.phase === 'constructing').length
        : 0
    });
    const evidence = layer ? sceneEvidence(layer) : Object.freeze({
      barracksPlacementPresent: false,
      cathedralPlacementPresent: false,
      finalModelCount: 0,
      scaffoldPresent: false,
      slotGeometryCount: 0
    });
    root.dataset.innerKeepQaRendererCount = String(instrumentation.rendererCount);
    root.dataset.innerKeepQaWebglContextCount = String(instrumentation.webglContextCount);
    root.dataset.innerKeepQaRafOwnerCount = String(instrumentation.rafOwnerCount);
    root.dataset.innerKeepQaPendingRafCount = String(
      instrumentation.pendingAnimationFrameCount
    );
    root.dataset.innerKeepQaMaximumPendingRafCount = String(
      instrumentation.maximumPendingAnimationFrameCount
    );
    root.dataset.innerKeepQaRequestedRafCount = String(
      instrumentation.requestedAnimationFrameCount
    );
    root.dataset.innerKeepQaAnimationFrameCap = String(
      layer?.getAnimationFrameCap() ?? 0
    );
    root.dataset.innerKeepQaSlotCount = String(telemetry.slotCount);
    root.dataset.innerKeepQaBuildingPickTargetCount = String(
      telemetry.buildingPickTargetCount
    );
    root.dataset.innerKeepQaPlacementPreviewActive = String(
      telemetry.placementPreviewActive
    );
    root.dataset.innerKeepQaPlacementPreviewValid = String(
      telemetry.placementPreviewValid
    );
    root.dataset.innerKeepQaTriangleCount = String(telemetry.triangleCount);
    root.dataset.innerKeepQaDrawCalls = String(telemetry.drawCalls);
    root.dataset.innerKeepQaRendererDrawCalls = String(rendererEvidence.drawCalls);
    root.dataset.innerKeepQaRendererTriangles = String(rendererEvidence.triangles);
    root.dataset.innerKeepQaSmokeSpriteCount = String(telemetry.smokeSpriteCount);
    root.dataset.innerKeepQaAssetStatus = telemetry.assetStatus;
    root.dataset.innerKeepQaGrassBladeCount = String(telemetry.grassBladeCount);
    root.dataset.innerKeepQaWaterSurfaceCount = String(telemetry.waterSurfaceCount);
    root.dataset.innerKeepQaAuthoredAssetCount = String(telemetry.authoredAssetCount);
    root.dataset.innerKeepQaAuthoredPlacementCount = String(
      telemetry.authoredPlacementCount
    );
    root.dataset.innerKeepQaAuthoredTreeCount = String(telemetry.authoredTreeCount);
    root.dataset.innerKeepQaAmbientActorCount = String(telemetry.ambientActorCount);
    root.dataset.innerKeepQaMountedActorCount = String(telemetry.mountedActorCount);
    root.dataset.innerKeepQaPatrolUnitCount = String(telemetry.patrolUnitCount);
    root.dataset.innerKeepQaActiveConversationCount = String(
      telemetry.activeConversationCount
    );
    root.dataset.innerKeepQaAnimationMixerCount = String(telemetry.animationMixerCount);
    root.dataset.innerKeepQaRuntimeAssetFailureCount = String(
      telemetry.runtimeAssetFailureCount
    );
    root.dataset.innerKeepQaOuterWorldStatus = telemetry.outerWorldStatus;
    root.dataset.innerKeepQaOuterWorldRuntimeAssetFailureCount = String(
      telemetry.outerWorldRuntimeAssetFailureCount
    );
    root.dataset.innerKeepQaTopographicFeatureCount = String(
      telemetry.topographicFeatureCount
    );
    root.dataset.innerKeepQaTerrainTriangleCount = String(
      telemetry.terrainTriangleCount
    );
    root.dataset.innerKeepQaTerrainHeightRangeMillimeters = String(
      telemetry.terrainHeightRangeMillimeters
    );
    root.dataset.innerKeepQaFarCountrysideStatus = telemetry.farCountrysideStatus;
    root.dataset.innerKeepQaFarCountrysideTerrainTriangleCount = String(
      telemetry.farCountrysideTerrainTriangleCount
    );
    root.dataset.innerKeepQaFarCountrysideFieldParcelCount = String(
      telemetry.farCountrysideFieldParcelCount
    );
    root.dataset.innerKeepQaFarCountrysideFieldTuftCount = String(
      telemetry.farCountrysideFieldTuftCount
    );
    root.dataset.innerKeepQaFarCountrysideHedgerowTreeCount = String(
      telemetry.farCountrysideHedgerowTreeCount
    );
    root.dataset.innerKeepQaExteriorTreeCount = String(telemetry.exteriorTreeCount);
    root.dataset.innerKeepQaScenicResourceNodeCount = String(
      telemetry.scenicResourceNodeCount
    );
    root.dataset.innerKeepQaWildlifeAssetStatus = telemetry.wildlifeAssetStatus;
    root.dataset.innerKeepQaWildlifeCount = String(telemetry.wildlifeCount);
    root.dataset.innerKeepQaExactWildlifeCount = String(telemetry.exactWildlifeCount);
    root.dataset.innerKeepQaProceduralWildlifeCount = String(
      telemetry.proceduralWildlifeCount
    );
    root.dataset.innerKeepQaTradeWagonCount = String(telemetry.tradeWagonCount);
    root.dataset.innerKeepQaExteriorActorCount = String(telemetry.exteriorActorCount);
    root.dataset.innerKeepQaExteriorMountedActorCount = String(
      telemetry.exteriorMountedActorCount
    );
    root.dataset.innerKeepQaExteriorPatrolUnitCount = String(
      telemetry.exteriorPatrolUnitCount
    );
    root.dataset.innerKeepQaBarracksPlacementPresent = String(
      evidence.barracksPlacementPresent
    );
    root.dataset.innerKeepQaCathedralPlacementPresent = String(
      evidence.cathedralPlacementPresent
    );
    root.dataset.innerKeepQaCompletedBuildingCount = String(
      telemetry.completedBuildingCount
    );
    root.dataset.innerKeepQaConstructionSiteCount = String(
      telemetry.constructionSiteCount
    );
    root.dataset.innerKeepQaCompletionRevealActive = String(
      telemetry.completionRevealActive
    );
    root.dataset.innerKeepQaFinalModelCount = String(evidence.finalModelCount);
    root.dataset.innerKeepQaScaffoldPresent = String(evidence.scaffoldPresent);
    root.dataset.innerKeepQaSlotGeometryCount = String(evidence.slotGeometryCount);
    const nextKey = telemetryKey(telemetry, evidence);
    if (lastTelemetryKeyRef.current !== nextKey) {
      lastTelemetryKeyRef.current = nextKey;
      setSceneTelemetry(telemetry);
    }
  }, [scenario.renderMode]);

  useLayoutEffect(() => {
    if (scenario.renderMode !== 'webgl') {
      publishBrowserEvidence(null);
      return undefined;
    }
    const canvas = canvasRef.current;
    if (!canvas) {
      setSceneState('unavailable');
      return undefined;
    }
    const unregisterAnimationOwner = qaInstrumentation
      .registerAnimationOwner('inner-keep-qa-render-loop');
    let disposed = false;
    let layer: InnerKeepSceneLayer | null = null;
    let nextRenderedFrameTime: number | null = null;
    let unregisterRenderer: (() => void) | null = null;
    const renderFrame = (frameTime: number) => {
      frameRef.current = null;
      if (disposed || !layer || !rendererRef.current) return;
      const frameCap = layer.getAnimationFrameCap();
      if (
        frameCap > 0
        && nextRenderedFrameTime !== null
        && frameTime + 0.5 < nextRenderedFrameTime
      ) {
        scheduleFrame();
        return;
      }
      if (frameCap > 0) {
        const interval = 1_000 / frameCap;
        nextRenderedFrameTime ??= frameTime;
        do {
          nextRenderedFrameTime += interval;
        } while (nextRenderedFrameTime <= frameTime + 0.5);
      } else {
        nextRenderedFrameTime = null;
      }
      firstFrameTimeRef.current ??= frameTime;
      const elapsedSeconds = (scenario.initialElapsedSeconds ?? 0)
        + Math.max(0, frameTime - firstFrameTimeRef.current) / 1_000;
      layer.update(elapsedSeconds);
      rendererRef.current.render(layer.scene, layer.camera);
      publishBrowserEvidence(layer);
      if (layer.isAnimationActive()) scheduleFrame();
    };
    const scheduleFrame = () => {
      if (disposed || frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(renderFrame);
      publishBrowserEvidence(layer);
    };
    try {
      const renderer = new THREE.WebGLRenderer({
        alpha: false,
        antialias: scenario.quality !== 'reduced',
        canvas,
        powerPreference: 'high-performance'
      });
      unregisterRenderer = qaInstrumentation.recordRendererCreated();
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure =
        REALM_LIGHTING_SPECS[scenario.quality].toneMappingExposure;
      renderer.shadowMap.enabled = scenario.quality !== 'reduced';
      renderer.shadowMap.type = THREE.PCFShadowMap;
      rendererRef.current = renderer;
      layer = createInnerKeepSceneLayer({
        canvas,
        quality: scenario.quality,
        reducedMotion: scenario.reducedMotion,
        requestRender: scheduleFrame,
        baseUrl: import.meta.env.BASE_URL,
        maxAnisotropy: renderer.capabilities.getMaxAnisotropy()
      });
      layerRef.current = layer;
      const resize = () => {
        const width = Math.max(1, canvas.clientWidth || window.innerWidth || 1);
        const height = Math.max(1, canvas.clientHeight || window.innerHeight || 1);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        renderer.setSize(width, height, false);
        layer?.setViewport(width, height);
        scheduleFrame();
      };
      resize();
      layer.reconcile(presentationRef.current, { owningTerrainKind: 'forest' });
      layer.setPlacementDraft(placementDraft);
      const selected = selectedBuildingKind === undefined
        ? undefined
        : presentationRef.current.buildings.find(({ buildingKind }) => (
          buildingKind === selectedBuildingKind
        ));
      layer.setSelectedBuilding(selected?.buildingKey ?? null);
      setSceneState('ready');
      publishBrowserEvidence(layer);
      const resizeObserver = typeof ResizeObserver === 'function'
        ? new ResizeObserver(resize)
        : null;
      resizeObserver?.observe(canvas);
      window.addEventListener('resize', resize);
      return () => {
        disposed = true;
        window.removeEventListener('resize', resize);
        resizeObserver?.disconnect();
        if (frameRef.current !== null) {
          window.cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        layer?.dispose();
        renderer.dispose();
        renderer.forceContextLoss();
        unregisterRenderer?.();
        unregisterRenderer = null;
        layerRef.current = null;
        rendererRef.current = null;
        unregisterAnimationOwner();
      };
    } catch {
      disposed = true;
      layer?.dispose();
      rendererRef.current?.dispose();
      rendererRef.current?.forceContextLoss();
      rendererRef.current = null;
      layerRef.current = null;
      unregisterRenderer?.();
      unregisterRenderer = null;
      setSceneState('unavailable');
      unregisterAnimationOwner();
      publishBrowserEvidence(null);
      return undefined;
    }
  }, [
    publishBrowserEvidence,
    scenario.initialElapsedSeconds,
    scenario.quality,
    scenario.reducedMotion,
    scenario.renderMode
  ]);

  useEffect(() => {
    const layer = layerRef.current;
    if (!layer) {
      publishBrowserEvidence(null);
      return;
    }
    layer.reconcile(presentation, { owningTerrainKind: 'forest' });
    publishBrowserEvidence(layer);
  }, [presentation, publishBrowserEvidence]);

  useEffect(() => {
    const layer = layerRef.current;
    layer?.setPlacementDraft(placementDraft);
    const selected = selectedBuildingKind === undefined
      ? undefined
      : presentation.buildings.find(({ buildingKind }) => (
        buildingKind === selectedBuildingKind
      ));
    layer?.setSelectedBuilding(selected?.buildingKey ?? null);
    publishBrowserEvidence(layer);
  }, [placementDraft, presentation.buildings, publishBrowserEvidence, selectedBuildingKind]);

  const handleBack = useCallback(() => {
    if (placementBuildingKind) {
      setPlacementBuildingKind(undefined);
      setPlacementDraft(null);
      return;
    }
    if (catalogueOpen) {
      setCatalogueOpen(false);
      return;
    }
    if (selectedBuildingKind) {
      setSelectedBuildingKind(undefined);
      return;
    }
  }, [catalogueOpen, placementBuildingKind, selectedBuildingKind]);

  const observeCompletion = useCallback(() => {
    setPresentation((current) => completeSyntheticInnerKeepQaPresentation(current));
  }, []);

  const ready = scenario.renderMode === 'fallback'
    ? sceneState === 'ready'
    : sceneState === 'ready'
      && sceneTelemetry.status === 'ready'
      && sceneTelemetry.assetStatus === 'ready'
      && sceneTelemetry.outerWorldStatus === 'ready'
      && sceneTelemetry.wildlifeAssetStatus === 'ready';

  return (
    <div
      className="inner-keep-qa"
      data-inner-keep-qa-progress-bps={scenario.progressBasisPoints ?? 'none'}
      data-inner-keep-qa-quality={scenario.quality}
      data-inner-keep-qa-reduced-motion={String(scenario.reducedMotion)}
      data-inner-keep-qa-render-mode={scenario.renderMode}
      data-inner-keep-qa-scenario={scenario.id}
      data-inner-keep-qa-status={
        ready ? 'ready' : sceneState === 'ready' ? 'loading' : sceneState
      }
      ref={rootRef}
    >
      {scenario.renderMode === 'webgl' ? (
        <canvas
          aria-hidden="true"
          className="inner-keep-qa__canvas"
          data-inner-keep-qa-canvas="true"
          ref={canvasRef}
        />
      ) : null}

      <InnerKeepScreen
        catalogueOpen={catalogueOpen}
        onBack={handleBack}
        onBeginPlacement={(buildingKind) => {
          setCatalogueOpen(false);
          setSelectedBuildingKind(undefined);
          setPlacementBuildingKind(buildingKind);
          setPlacementDraft(initialInnerKeepPlacementDraft(
            buildingKind,
            presentation.buildings
          ));
        }}
        onCloseToRealm={() => undefined}
        onOpenBuilding={(buildingKind) => {
          setCatalogueOpen(false);
          setPlacementBuildingKind(undefined);
          setPlacementDraft(null);
          setSelectedBuildingKind(buildingKind);
        }}
        onOpenCatalogue={() => {
          setSelectedBuildingKind(undefined);
          setPlacementBuildingKind(undefined);
          setPlacementDraft(null);
          setCatalogueOpen(true);
        }}
        onPlacementDraftChange={setPlacementDraft}
        onRequestSync={() => undefined}
        onStartProject={async () => undefined}
        placementBuildingKind={placementBuildingKind}
        placementDraft={placementDraft}
        presentation={presentation}
        renderMode={scenario.renderMode}
        selectedBuildingKind={selectedBuildingKind}
      />

      <aside
        aria-label="Synthetic Inner Keep QA status"
        className="inner-keep-qa__status"
      >
        <span>LOCAL INNER KEEP QA</span>
        <strong>{scenario.label}</strong>
        <small>SYNTHETIC · LOOPBACK ONLY · NO AUTHORITY</small>
        {scenario.state === 'completion-reveal' ? (
          <button
            data-inner-keep-qa-complete="true"
            disabled={presentation.buildings.every((building) => building.phase === 'complete')}
            onClick={observeCompletion}
            type="button"
          >
            OBSERVE AUTHORITATIVE COMPLETION
          </button>
        ) : null}
      </aside>
    </div>
  );
}

export default InnerKeepQaHarness;
