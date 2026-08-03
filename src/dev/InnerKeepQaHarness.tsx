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
  completeSyntheticInnerKeepQaPresentation,
  createSyntheticInnerKeepQaPresentation
} from './innerKeepQaFixture';
import { innerKeepQaRuntimeInstrumentation } from './innerKeepQaInstrumentation';
import type { InnerKeepQaScenario } from './innerKeepQaScenarioManifest.mjs';

const EMPTY_TELEMETRY: InnerKeepSceneTelemetry = Object.freeze({
  status: 'empty',
  triangleCount: 0,
  drawCalls: 0,
  smokeSpriteCount: 0,
  slotCount: 0,
  completedBuildingCount: 0,
  constructionSiteCount: 0,
  completionRevealActive: false
});
const qaInstrumentation = innerKeepQaRuntimeInstrumentation();

type SceneEvidence = Readonly<{
  finalModelCount: number;
  scaffoldPresent: boolean;
  slotGeometryCount: number;
}>;

function sceneEvidence(layer: InnerKeepSceneLayer): SceneEvidence {
  let finalModelCount = 0;
  let scaffoldPresent = false;
  let slotGeometryCount = 0;
  layer.scene.traverse((object) => {
    if (object.name.startsWith('inner-keep-completed-building:')) {
      finalModelCount += 1;
    } else if (object.name === 'inner-keep-construction-scaffold') {
      scaffoldPresent = true;
    } else if (object.name.startsWith('inner-keep-slot-pad:')) {
      slotGeometryCount += 1;
    }
  });
  return Object.freeze({ finalModelCount, scaffoldPresent, slotGeometryCount });
}

function telemetryKey(telemetry: InnerKeepSceneTelemetry, evidence: SceneEvidence) {
  return [
    telemetry.status,
    telemetry.triangleCount,
    telemetry.drawCalls,
    telemetry.smokeSpriteCount,
    telemetry.slotCount,
    telemetry.completedBuildingCount,
    telemetry.constructionSiteCount,
    telemetry.completionRevealActive,
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
  const [selectedSlotId, setSelectedSlotId] = useState<string | undefined>(
    scenario.selectedSlotId ?? undefined
  );
  const [selectedBuildingKind, setSelectedBuildingKind] =
    useState<InnerKeepBuildingKind | undefined>(
      scenario.selectedBuildingKind ?? undefined
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
  const selectedSlotIdRef = useRef(selectedSlotId);
  const lastTelemetryKeyRef = useRef('');
  presentationRef.current = presentation;
  selectedSlotIdRef.current = selectedSlotId;

  const publishBrowserEvidence = useCallback((
    layer: InnerKeepSceneLayer | null = layerRef.current
  ) => {
    const root = rootRef.current;
    if (!root) return;
    const instrumentation = qaInstrumentation.snapshot();
    const currentPresentation = presentationRef.current;
    const telemetry = layer?.getTelemetry() ?? Object.freeze({
      ...EMPTY_TELEMETRY,
      status: scenario.renderMode === 'fallback' ? 'ready' : 'empty',
      slotCount: scenario.renderMode === 'fallback' ? currentPresentation.slots.length : 0,
      completedBuildingCount: scenario.renderMode === 'fallback'
        ? currentPresentation.buildings.filter((building) => building.phase === 'complete').length
        : 0,
      constructionSiteCount: scenario.renderMode === 'fallback'
        ? currentPresentation.buildings.filter((building) => building.phase === 'constructing').length
        : 0
    });
    const evidence = layer ? sceneEvidence(layer) : Object.freeze({
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
    root.dataset.innerKeepQaSlotCount = String(telemetry.slotCount);
    root.dataset.innerKeepQaTriangleCount = String(telemetry.triangleCount);
    root.dataset.innerKeepQaDrawCalls = String(telemetry.drawCalls);
    root.dataset.innerKeepQaSmokeSpriteCount = String(telemetry.smokeSpriteCount);
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
    const renderFrame = (frameTime: number) => {
      frameRef.current = null;
      if (disposed || !layer || !rendererRef.current) return;
      firstFrameTimeRef.current ??= frameTime;
      const elapsedSeconds = Math.max(0, frameTime - firstFrameTimeRef.current) / 1_000;
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
      qaInstrumentation.recordRendererCreated();
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = scenario.quality !== 'reduced';
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      rendererRef.current = renderer;
      layer = createInnerKeepSceneLayer({
        canvas,
        quality: scenario.quality,
        reducedMotion: scenario.reducedMotion,
        requestRender: scheduleFrame
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
      layer.setSelectedSlot(selectedSlotIdRef.current ?? null);
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
        layerRef.current = null;
        rendererRef.current = null;
        unregisterAnimationOwner();
      };
    } catch {
      setSceneState('unavailable');
      unregisterAnimationOwner();
      publishBrowserEvidence(null);
      return undefined;
    }
  }, [publishBrowserEvidence, scenario.quality, scenario.reducedMotion, scenario.renderMode]);

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
    layer?.setSelectedSlot(selectedSlotId ?? null);
    publishBrowserEvidence(layer);
  }, [publishBrowserEvidence, selectedSlotId]);

  const handleBack = useCallback(() => {
    if (selectedBuildingKind) {
      setSelectedBuildingKind(undefined);
      return;
    }
    setSelectedSlotId(undefined);
  }, [selectedBuildingKind]);

  const observeCompletion = useCallback(() => {
    setPresentation((current) => completeSyntheticInnerKeepQaPresentation(current));
  }, []);

  const ready = scenario.renderMode === 'fallback'
    ? sceneState === 'ready'
    : sceneState === 'ready' && sceneTelemetry.status === 'ready';

  return (
    <div
      className="inner-keep-qa"
      data-inner-keep-qa-progress-bps={scenario.progressBasisPoints ?? 'none'}
      data-inner-keep-qa-quality={scenario.quality}
      data-inner-keep-qa-reduced-motion={String(scenario.reducedMotion)}
      data-inner-keep-qa-render-mode={scenario.renderMode}
      data-inner-keep-qa-scenario={scenario.id}
      data-inner-keep-qa-status={ready ? 'ready' : sceneState}
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
        onBack={handleBack}
        onCloseToRealm={() => undefined}
        onOpenSlot={(slotId) => {
          setSelectedSlotId(slotId);
          setSelectedBuildingKind(undefined);
        }}
        onRequestSync={() => undefined}
        onReviewBuilding={setSelectedBuildingKind}
        onStartProject={async () => undefined}
        presentation={presentation}
        renderMode={scenario.renderMode}
        selectedBuildingKind={selectedBuildingKind}
        selectedSlotId={selectedSlotId}
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
