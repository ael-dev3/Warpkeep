import { useEffect, useRef, useState } from 'react';

import { WarpkeepSfxDirector } from '../components/audio/WarpkeepSfxDirector';
import {
  measureWarpkeepAudioBuffer,
  ProceduralSfxEngine,
  renderWarpkeepSfxEventOffline,
  type WarpkeepSfxEngineSnapshot
} from '../components/audio/proceduralSfxEngine';
import {
  emitWarpkeepSfx,
  WARPKEEP_SFX_EVENT_KINDS,
  type WarpkeepSfxEvent
} from '../components/audio/sfxEvents';
import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import type { RealmQuality } from '../components/realm/realmQuality';
import type {
  GraphicsPreference,
  GraphicsQualityTier
} from '../settings/graphicsPreference';
import {
  boundedRenderedWebglQaReadyMilliseconds,
  RENDERED_WEBGL_QA_ACTIVE_WORKER_FIXTURE_MARKER,
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_FIXTURE_ID,
  RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS,
  renderedWebglQaRendererForReadyTiming,
  renderedWebglQaStatusForRenderer,
  type RenderedWebglQaFixtureVariant,
  type RenderedWebglQaPresentationMode,
  type RenderedWebglQaRenderer
} from './renderedWebglQa';
import {
  createRenderedWebglQaFixtureRealm
} from './renderedWebglQaFixture';
import type { RealmObserverHarnessRealm } from './realmObserverSnapshot';
import { createZeroQaResourcePresentation } from './qaResourceFixture';
import type {
  ReadyWorkerProjection,
  ReadyWorkerResourceState,
  WorkerRosterPresentation
} from '../components/realm/realmWorkerPresentation';

type RenderedWebglQaHarnessRealm = RealmObserverHarnessRealm & Readonly<{
  workerProjection?: ReadyWorkerProjection;
  workerResourceState?: ReadyWorkerResourceState;
  workerRoster?: WorkerRosterPresentation;
}>;

type RenderedWebglQaPhase =
  | Readonly<{ kind: 'active'; realm: RenderedWebglQaHarnessRealm }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'closed' }>;

type RenderedWebglQaObservation = Readonly<{
  renderer: RenderedWebglQaRenderer;
  readyAfterMilliseconds?: number;
}>;

export type RenderedWebglQaSfxSnapshot = WarpkeepSfxEngineSnapshot & Readonly<{
  acceptedLogicalVoiceCount: number;
}>;

let activeRenderedWebglQaSfxEngine: RenderedWebglQaSfxEngine | undefined;

class RenderedWebglQaSfxEngine extends ProceduralSfxEngine {
  private acceptedLogicalVoiceCount = 0;

  override emitBatch(events: readonly WarpkeepSfxEvent[]) {
    const accepted = super.emitBatch(events);
    this.acceptedLogicalVoiceCount += accepted;
    return accepted;
  }

  qaSnapshot(): RenderedWebglQaSfxSnapshot {
    return Object.freeze({
      ...this.snapshot(),
      acceptedLogicalVoiceCount: this.acceptedLogicalVoiceCount
    });
  }

  override dispose() {
    super.dispose();
    if (activeRenderedWebglQaSfxEngine === this) {
      activeRenderedWebglQaSfxEngine = undefined;
    }
  }
}

function createRenderedWebglQaSfxEngine() {
  const engine = new RenderedWebglQaSfxEngine();
  activeRenderedWebglQaSfxEngine = engine;
  return engine;
}

/**
 * Dev-route-only anonymous audio evidence. The production graph has no counter
 * or inspection seam, and the rendered probe receives no event payloads.
 */
export function readRenderedWebglQaSfxSnapshot():
RenderedWebglQaSfxSnapshot | null {
  return activeRenderedWebglQaSfxEngine?.qaSnapshot() ?? null;
}

function renderedWebglQaSfxEventForKind(
  kind: WarpkeepSfxEvent['kind']
): WarpkeepSfxEvent {
  switch (kind) {
    case 'ui-press':
      return { kind, emphasis: 'normal' };
    case 'select-water':
      return { kind, regime: 'river', screenX: 400 };
    case 'worker-dispatch-confirmed':
    case 'worker-recall-confirmed':
    case 'worker-arrived':
    case 'worker-returned':
      return { kind, count: 4, screenX: 400 };
    case 'select-keep':
    case 'select-worker':
    case 'select-gold':
    case 'select-food':
    case 'select-wood':
    case 'select-stone':
    case 'river-focus-entered':
      return { kind, screenX: 400 };
    default:
      return { kind };
  }
}

const RENDERED_WEBGL_QA_OFFLINE_SFX_CORPUS = Object.freeze([
  ...WARPKEEP_SFX_EVENT_KINDS.map(renderedWebglQaSfxEventForKind),
  Object.freeze({ kind: 'ui-press', emphasis: 'quiet' } as const),
  Object.freeze({ kind: 'ui-press', emphasis: 'primary' } as const),
  Object.freeze({ kind: 'select-water', regime: 'ocean', screenX: 400 } as const)
] satisfies readonly WarpkeepSfxEvent[]);

function renderedWebglQaOfflineSfxMetricsPass(
  metrics: ReturnType<typeof measureWarpkeepAudioBuffer>
) {
  return metrics.durationSeconds < 0.55
    && metrics.nonFiniteSamples === 0
    && metrics.peak < 0.99
    && metrics.clippedFraction === 0
    && Math.abs(metrics.dcOffset) < 0.05
    && metrics.rms > 0
    && metrics.tailSilenceSeconds > 0.02
    && Number.isFinite(metrics.spectralCentroidHz)
    && metrics.highFrequencyEnergyRatio >= 0
    && metrics.highFrequencyEnergyRatio <= 1;
}

/**
 * Renders the complete procedural corpus inside the dev-only browser route.
 * The caller receives one anonymous pass/fail bit; event payloads, samples,
 * and measured values remain inside this page.
 */
export async function proveRenderedWebglQaOfflineSfxCorpus(): Promise<boolean> {
  if (typeof OfflineAudioContext === 'undefined') return false;
  const renderedKinds = new Set<WarpkeepSfxEvent['kind']>();
  try {
    for (const event of RENDERED_WEBGL_QA_OFFLINE_SFX_CORPUS) {
      const buffer = await renderWarpkeepSfxEventOffline(event, 22_050);
      if (!buffer) return false;
      renderedKinds.add(event.kind);
      if (!renderedWebglQaOfflineSfxMetricsPass(
        measureWarpkeepAudioBuffer(buffer)
      )) return false;
    }
  } catch {
    return false;
  }
  return WARPKEEP_SFX_EVENT_KINDS.every((kind) => renderedKinds.has(kind));
}

/**
 * The concrete probe event remains in the dev bundle rather than crossing
 * the DevTools boundary as an event payload.
 */
export function emitRenderedWebglQaProbeSfx() {
  emitWarpkeepSfx({ kind: 'command-failed' });
}

export type RenderedWebglQaHarnessProps = Readonly<{
  fixtureVariant?: RenderedWebglQaFixtureVariant;
  presentationMode?: RenderedWebglQaPresentationMode;
  quality: RealmQuality;
  /** Test seam for the deterministic local fixture only. */
  createFixtureRealm?: () => RenderedWebglQaHarnessRealm;
}>;

function initialPhase(createFixtureRealm: () => RenderedWebglQaHarnessRealm): RenderedWebglQaPhase {
  try {
    return { kind: 'active', realm: createFixtureRealm() };
  } catch {
    return { kind: 'error' };
  }
}

function rendererFromRoot(root: HTMLElement | null): RenderedWebglQaRenderer | undefined {
  const map = root?.querySelector<HTMLElement>('.realm-map-screen');
  if (!map) return undefined;
  const renderer = map.dataset.renderer;
  if (renderer === 'loading' || renderer === 'webgl' || renderer === 'fallback') return renderer;
  return 'error';
}

function statusCopy(observation: RenderedWebglQaObservation, phase: RenderedWebglQaPhase) {
  if (phase.kind === 'error') {
    return 'Fixture initialization failed. No renderer result was accepted.';
  }
  if (phase.kind === 'closed') {
    return 'The rendered QA fixture is closed.';
  }
  if (observation.renderer === 'webgl') {
    return observation.readyAfterMilliseconds === undefined
      ? 'WebGL renderer is ready for the synthetic 100-castle fixture.'
      : `WebGL renderer is ready after ${observation.readyAfterMilliseconds} ms.`;
  }
  if (observation.renderer === 'fallback') {
    return 'Static fallback is visible. This is not a rendered-WebGL pass.';
  }
  if (observation.renderer === 'loading') {
    return 'Preparing deterministic synthetic castles for WebGL.';
  }
  return 'The renderer did not expose an accepted local QA state.';
}

function graphicsTierForRealmQuality(quality: RealmQuality): GraphicsQualityTier {
  if (quality === 'high') return 'cinematic';
  if (quality === 'reduced') return 'performance';
  return 'balanced';
}

function resourceOccupationCount(phase: RenderedWebglQaPhase) {
  if (phase.kind !== 'active') return 0;
  return (phase.realm.snapshot.goldNodeOccupations?.length ?? 0)
    + (phase.realm.snapshot.foodNodeOccupations?.length ?? 0)
    + (phase.realm.snapshot.woodNodeOccupations?.length ?? 0)
    + (phase.realm.snapshot.stoneNodeOccupations?.length ?? 0)
    + (phase.realm.snapshot.workerOccupations?.length ?? 0);
}

async function acceptSyntheticWorkerCommand() {
  // This dev-only harness intentionally exercises confirmed command UI without
  // providing a connection, reducer, authentication token, or durable state.
}

export function RenderedWebglQaHarness({
  fixtureVariant = 'baseline',
  presentationMode = 'observer',
  quality,
  createFixtureRealm = createRenderedWebglQaFixtureRealm
}: RenderedWebglQaHarnessProps) {
  const [phase, setPhase] = useState<RenderedWebglQaPhase>(() => initialPhase(createFixtureRealm));
  const [observation, setObservation] = useState<RenderedWebglQaObservation>({ renderer: 'loading' });
  const [graphicsPreference, setGraphicsPreference] = useState<GraphicsPreference>('auto');
  const [audioMuted, setAudioMuted] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const startedAtRef = useRef(
    typeof performance === 'undefined' ? Date.now() : performance.now()
  );

  useEffect(() => {
    if (phase.kind !== 'active') {
      setObservation({ renderer: phase.kind === 'closed' ? 'closed' : 'error' });
      return undefined;
    }
    const root = rootRef.current;
    if (!root) return undefined;
    let absenceTimer: number | undefined;
    let absenceFailed = false;
    const clearAbsenceTimer = () => {
      if (absenceTimer === undefined) return;
      window.clearTimeout(absenceTimer);
      absenceTimer = undefined;
    };
    const commitRenderer = (observedRenderer: RenderedWebglQaRenderer) => {
      setObservation((current) => {
        // Readiness is a time-to-first-valid-render attestation. Child-list
        // mutations continue throughout a long QA session; they must not
        // reinterpret an already accepted WebGL renderer as a fresh startup
        // and fail it merely because the page has now been open for >2 min.
        if (observedRenderer === 'webgl' && current.renderer === 'webgl') return current;
        const readyAfterMilliseconds = observedRenderer === 'webgl'
          ? boundedRenderedWebglQaReadyMilliseconds(
              startedAtRef.current,
              typeof performance === 'undefined' ? Date.now() : performance.now()
            )
          : undefined;
        const renderer = renderedWebglQaRendererForReadyTiming(
          observedRenderer,
          readyAfterMilliseconds
        );
        return current.renderer === renderer
          ? current
          : {
              renderer,
              ...(renderer === 'webgl' && readyAfterMilliseconds !== undefined
                ? { readyAfterMilliseconds }
                : {})
            };
      });
    };
    const observe = () => {
      const observedRenderer = rendererFromRoot(root);
      if (observedRenderer === undefined) {
        if (absenceTimer !== undefined || absenceFailed) return;
        absenceTimer = window.setTimeout(() => {
          absenceTimer = undefined;
          const settledRenderer = rendererFromRoot(root);
          if (settledRenderer === undefined) {
            absenceFailed = true;
            commitRenderer('error');
            return;
          }
          absenceFailed = false;
          commitRenderer(settledRenderer);
        }, RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS);
        return;
      }
      clearAbsenceTimer();
      absenceFailed = false;
      commitRenderer(observedRenderer);
    };
    const observer = new MutationObserver(observe);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['data-renderer'],
      childList: true,
      subtree: true
    });
    observe();
    return () => {
      clearAbsenceTimer();
      observer.disconnect();
    };
  }, [phase.kind]);

  const status = renderedWebglQaStatusForRenderer(observation.renderer);
  const copy = statusCopy(observation, phase);
  const statusHeading = status === 'ready'
    ? 'WEBGL READY'
    : status === 'fallback'
      ? 'STATIC FALLBACK — NOT A RENDER PASS'
      : status.toUpperCase();

  return (
    <div className="rendered-webgl-qa" ref={rootRef}>
      <aside
        aria-live="polite"
        className="rendered-webgl-qa__status"
        data-castle-count={RENDERED_WEBGL_QA_CASTLE_COUNT}
        data-fixture={RENDERED_WEBGL_QA_FIXTURE_ID}
        data-fixture-variant={fixtureVariant}
        {...(fixtureVariant === 'worker-active'
          || fixtureVariant === 'worker-locomotion'
          || fixtureVariant === 'worker-locomotion-northern'
          || fixtureVariant === 'worker-locomotion-southern'
          ? { 'data-active-worker-fixture-marker':
            RENDERED_WEBGL_QA_ACTIVE_WORKER_FIXTURE_MARKER }
          : {})}
        data-presentation-mode={presentationMode}
        data-quality={quality}
        data-resource-occupation-count={resourceOccupationCount(phase)}
        data-rendered-webgl-status={status}
        data-renderer={observation.renderer}
        {...(observation.readyAfterMilliseconds === undefined
          ? {}
          : { 'data-ready-after-ms': observation.readyAfterMilliseconds })}
      >
        <span>LOCAL RENDERED WEBGL QA</span>
        <strong>{statusHeading}</strong>
        <small>SYNTHETIC · 100 CASTLES · NO AUTHORITY · {quality.toUpperCase()}</small>
        <p>{copy}</p>
      </aside>

      {phase.kind === 'active' ? (
        <WarpkeepSfxDirector
          createEngine={createRenderedWebglQaSfxEngine}
          muted={audioMuted}
        />
      ) : null}
      {phase.kind === 'active' ? (
        <RealmMapScreen
          audioMuted={audioMuted}
          graphicsPreference={graphicsPreference}
          identity={phase.realm.identity}
          onAudioMutedChange={setAudioMuted}
          onGraphicsPreferenceChange={setGraphicsPreference}
          onRequestReturn={() => setPhase({ kind: 'closed' })}
          localQaLivingVisualTimeSeconds={8.25}
          localQaWorkerProjectionTelemetry={
            fixtureVariant === 'worker-locomotion'
            || fixtureVariant === 'worker-locomotion-northern'
            || fixtureVariant === 'worker-locomotion-southern'
          }
          presentationMode={presentationMode}
          qualityOverride={quality}
          resources={presentationMode === 'player'
            ? createZeroQaResourcePresentation(phase.realm.identity)
            : undefined}
          workerProjection={presentationMode === 'player'
            ? phase.realm.workerProjection
            : undefined}
          workerResourceState={presentationMode === 'player'
            ? phase.realm.workerResourceState
            : undefined}
          workerPrivateSync={presentationMode === 'player' && phase.realm.workerProjection
            ? Object.freeze({
                phase: 'ready',
                attempt: 1,
                queuedRefresh: false,
                retainedStale: false,
                localizedFailureCount: 0,
                commandsEnabled: true,
                lastSuccessGeneration: 1,
                lastSuccessRevision: 'synthetic-current',
                readyLatencyMilliseconds: 0
              })
            : undefined}
          workerRoster={presentationMode === 'player'
            ? phase.realm.workerRoster
            : undefined}
          onDispatchWorker={presentationMode === 'player' && phase.realm.workerProjection
            ? acceptSyntheticWorkerCommand
            : undefined}
          onRecallWorker={presentationMode === 'player' && phase.realm.workerProjection
            ? acceptSyntheticWorkerCommand
            : undefined}
          onRecallAllWorkers={presentationMode === 'player' && phase.realm.workerProjection
            ? acceptSyntheticWorkerCommand
            : undefined}
          resolvedGraphicsQuality={graphicsPreference === 'auto'
            ? graphicsTierForRealmQuality(quality)
            : graphicsPreference}
          snapshot={phase.realm.snapshot}
        />
      ) : (
        <main className="rendered-webgl-qa__terminal" role={phase.kind === 'error' ? 'alert' : 'status'}>
          <h1>{phase.kind === 'error' ? 'Rendered QA unavailable' : 'Rendered QA closed'}</h1>
          <p>{copy}</p>
        </main>
      )}
    </div>
  );
}
