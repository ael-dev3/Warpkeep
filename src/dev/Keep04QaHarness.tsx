import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Keep04Screen, type Keep04UiSelection } from '../components/keep04/Keep04Screen';
import type { Keep04Observation, Keep04SceneHostProps } from '../components/keep04/Keep04SceneHost';
import type { Quality04 } from '../components/keep04/keep04VisualProfile';
import type { Controller04 } from '../ptr/gameplay04/createGameplay04Controller';
import { KEEP04_QA_SCENARIOS, createKeep04QaScenario, type Keep04QaScenarioId } from './keep04QaScenarios';
export { EMPTY_WIRE04 } from './keep04QaScenarios';

export function createKeep04QaSnapshot(fixture: 'empty' | 'construction' | 'complete', nowMs = Date.now()) {
  return createKeep04QaScenario(fixture === 'construction' ? 'mill-constructing' : fixture === 'complete' ? 'mill-complete' : 'empty', nowMs).snapshot;
}

const NUMERIC_FIELDS = ['timestampMs', 'frameWorkMs', 'renderCalls', 'renderTriangles', 'rendererGeometries', 'rendererTextures', 'ownedGeometryBytes', 'ownedTextureBytes', 'voxelPreparationMs', 'pendingRafs', 'activeLoaders', 'activeListeners'] as const;
export function serializeKeep04QaObservation(value: unknown): string {
  const source = value && typeof value === 'object' ? value : {};
  const result: Record<string, number | string | null> = {};
  const event = Object.getOwnPropertyDescriptor(source, 'event')?.value;
  result.event = ['loading', 'frame', 'disposed', 'context-lost', 'fallback'].includes(event) ? event : 'fallback';
  for (const key of NUMERIC_FIELDS) {
    const number = Object.getOwnPropertyDescriptor(source, key)?.value;
    result[key] = typeof number === 'number' && Number.isFinite(number) && number >= 0 ? number : null;
  }
  return JSON.stringify(result);
}

const CAPACITY = 12000;
type Capture = { records: unknown[]; overflow: number; observerWorkMs: number; longTasks: { startTime: number; duration: number }[]; longTaskSupported: boolean };
const newCapture = (): Capture => ({ records: [], overflow: 0, observerWorkMs: 0, longTasks: [], longTaskSupported: false });

export function Keep04QaHarness() {
  const params = new URLSearchParams(window.location.search);
  const initial = KEEP04_QA_SCENARIOS.find(id => id === params.get('scenario')) ?? 'mill-complete';
  const [id, setId] = useState<Keep04QaScenarioId>(initial);
  const [quality, setQuality] = useState<Quality04>(params.get('quality') === 'balanced' ? 'balanced' : params.get('quality') === 'reduced' ? 'reduced' : 'high');
  const [fault, setFault] = useState<Keep04SceneHostProps['qaFault']>(initial === 'fallback' ? 'webgl-unavailable' : 'none');
  const [mounted, setMounted] = useState(true);
  const scenario = useMemo(() => createKeep04QaScenario(id), [id]);
  const [selection, setSelection] = useState<Keep04UiSelection>(scenario.selection);
  const [message, setMessage] = useState('No gameplay connection. Fixture controls change presentation only.');
  const capture = useRef(newCapture());
  const output = useRef<HTMLOutputElement>(null);
  const retainedContext = useRef<WEBGL_lose_context | null>(null);
  const [capturing, setCapturing] = useState(false);
  const active = useRef(false);
  const [last, setLast] = useState('No renderer observation yet.');
  const snapshot = scenario.snapshot;
  const controller = useMemo<Controller04>(() => ({ getSnapshot: () => snapshot, subscribe: () => () => {}, refresh: async () => {}, setAtlas: () => {},
    submit: async () => { setMessage('Synthetic controller: command suppressed. No resources or authority changed.'); }, retryPending: async () => {}, dispose: () => {} }), [snapshot]);
  const observe = useCallback((observation: Keep04Observation) => {
    const started = performance.now();
    const serialized = serializeKeep04QaObservation(observation);
    if (output.current) { output.current.dataset.lastObservation = serialized; output.current.dataset.event = observation.event; }
    if (active.current) {
      if (capture.current.records.length < CAPACITY) capture.current.records.push(JSON.parse(serialized)); else capture.current.overflow++;
    }
    capture.current.observerWorkMs += performance.now() - started;
  }, []);
  useEffect(() => {
    if (!capturing || typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes.includes('longtask')) return;
    capture.current.longTaskSupported = true;
    const observer = new PerformanceObserver(list => { for (const entry of list.getEntries()) {
      if (capture.current.longTasks.length < CAPACITY) capture.current.longTasks.push({ startTime: entry.startTime, duration: entry.duration }); else capture.current.overflow++;
    } });
    observer.observe({ type: 'longtask' }); return () => observer.disconnect();
  }, [capturing]);
  function change(next: Keep04QaScenarioId) {
    setId(next); setSelection(createKeep04QaScenario(next).selection); setFault(next === 'fallback' ? 'webgl-unavailable' : 'none'); setMounted(true);
  }
  function publish() {
    setLast(JSON.stringify({ synthetic: true, scope: 'DEV keep-only; not production world/keep, owner or phone evidence', scenario: id, quality,
      capacity: CAPACITY, ...capture.current, measuredGpuUploadBytes: null, measuredGpuUploadMs: null, retainedHeapBytes: null,
      frameBoundary: 'rendered RAF callback timestamp; event-driven idle gaps are not dropped frames',
      byteProvenance: 'owned bytes are CPU-side estimates; renderer counters are renderer.info',
      lastObservation: output.current?.dataset.lastObservation ? JSON.parse(output.current.dataset.lastObservation) : null }));
  }
  function loseContext() {
    const canvas = document.querySelector<HTMLCanvasElement>('.keep04 canvas');
    const extension = canvas?.getContext('webgl2')?.getExtension('WEBGL_lose_context');
    if (!extension) { setMessage('Context-loss extension unavailable; observation not measured.'); return; }
    retainedContext.current = extension; extension.loseContext();
  }
  return <main data-qa-synthetic="true" data-qa-scenario={id} style={{ margin: 0, background: '#102520', minHeight: '100vh', color: '#f2eddf', fontFamily: 'system-ui' }}>
    <details style={{ padding: 12 }}>
      <summary>Synthetic controller · local visual QA only · Controls</summary>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <label>Scenario <select aria-label="QA scenario" value={id} onChange={event => change(event.target.value as Keep04QaScenarioId)}>{KEEP04_QA_SCENARIOS.map(name => <option key={name}>{name}</option>)}</select></label>
        <label>Quality <select aria-label="Scene quality" value={quality} onChange={event => setQuality(event.target.value as Quality04)}><option>high</option><option>balanced</option><option>reduced</option></select></label>
        <label>Graphics fault <select aria-label="Graphics fault" value={fault} onChange={event => setFault(event.target.value as Keep04SceneHostProps['qaFault'])}><option>none</option><option>missing-model</option><option>voxel-failure</option><option>webgl-unavailable</option></select></label>
        <button type="button" onClick={() => change('empty')}>Empty keep fixture</button>
        <button type="button" onClick={() => change('mill-constructing')}>Mill construction fixture</button>
        <button type="button" onClick={() => change('mill-complete')}>Mill completion fixture</button>
        <button type="button" onClick={() => setMounted(value => !value)}>{mounted ? 'Unmount keep' : 'Mount keep'}</button>
        <button type="button" onClick={loseContext}>Lose WebGL context</button>
        <button type="button" onClick={() => { retainedContext.current?.restoreContext(); retainedContext.current = null; }}>Restore WebGL context</button>
        <button type="button" onClick={() => { capture.current = newCapture(); active.current = true; setCapturing(true); }}>Start bounded observation</button>
        <button type="button" onClick={() => { active.current = false; setCapturing(false); publish(); }}>Stop and publish observation</button>
        <button type="button" onClick={publish}>Publish current observation</button>
      </div>
      <p>Keep mount/unmount cycles are not world/realm cycles. No atlas dispatch targets are fabricated. Use the real Workers panel for layout; actual dispatch requires the owner journey.</p>
      <output ref={output} data-qa-observation="true" style={{ display: 'block', overflowWrap: 'anywhere', maxHeight: 160, overflow: 'auto' }}>{last}</output>
    </details>
    <p role="status" style={{ padding: '0 12px' }}>{message}</p>
    {mounted && <Keep04Screen snapshot={snapshot} controller={controller} selection={selection} onSelectionChange={setSelection} quality={quality}
      onSceneObservation={observe} qaFault={fault} reducedMotion={scenario.reducedMotion || params.get('motion') === 'reduced'}
      onBack={() => setMounted(false)} onFindResources={() => setMessage('Synthetic controller: no Realm resource queries or dispatch targets.')}
      onReturnToWorld={() => setMessage('Synthetic controller: no world connection. Use Unmount keep for keep-only cleanup.')} />}
  </main>;
}
