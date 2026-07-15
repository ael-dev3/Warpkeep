import { useEffect, useRef, useState } from 'react';

import { RealmMapScreen } from '../components/realm/RealmMapScreen';
import type { RealmQuality } from '../components/realm/realmQuality';
import {
  boundedRenderedWebglQaReadyMilliseconds,
  RENDERED_WEBGL_QA_CASTLE_COUNT,
  RENDERED_WEBGL_QA_FIXTURE_ID,
  RENDERED_WEBGL_QA_RENDERER_ABSENCE_GRACE_MILLISECONDS,
  renderedWebglQaRendererForReadyTiming,
  renderedWebglQaStatusForRenderer,
  type RenderedWebglQaPresentationMode,
  type RenderedWebglQaRenderer
} from './renderedWebglQa';
import {
  createRenderedWebglQaFixtureRealm
} from './renderedWebglQaFixture';
import type { RealmObserverHarnessRealm } from './realmObserverSnapshot';

type RenderedWebglQaPhase =
  | Readonly<{ kind: 'active'; realm: RealmObserverHarnessRealm }>
  | Readonly<{ kind: 'error' }>
  | Readonly<{ kind: 'closed' }>;

type RenderedWebglQaObservation = Readonly<{
  renderer: RenderedWebglQaRenderer;
  readyAfterMilliseconds?: number;
}>;

export type RenderedWebglQaHarnessProps = Readonly<{
  presentationMode?: RenderedWebglQaPresentationMode;
  quality: RealmQuality;
  /** Test seam for the deterministic local fixture only. */
  createFixtureRealm?: () => RealmObserverHarnessRealm;
}>;

function initialPhase(createFixtureRealm: () => RealmObserverHarnessRealm): RenderedWebglQaPhase {
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

export function RenderedWebglQaHarness({
  presentationMode = 'observer',
  quality,
  createFixtureRealm = createRenderedWebglQaFixtureRealm
}: RenderedWebglQaHarnessProps) {
  const [phase, setPhase] = useState<RenderedWebglQaPhase>(() => initialPhase(createFixtureRealm));
  const [observation, setObservation] = useState<RenderedWebglQaObservation>({ renderer: 'loading' });
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
        data-presentation-mode={presentationMode}
        data-quality={quality}
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
        <RealmMapScreen
          identity={phase.realm.identity}
          onRequestReturn={() => setPhase({ kind: 'closed' })}
          presentationMode={presentationMode}
          qualityOverride={quality}
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
