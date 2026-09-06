import { useEffect, useId, useRef, useState } from 'react';
import type { Building04, Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { Controller04, Snapshot04 } from '../../ptr/gameplay04/createGameplay04Controller';
import { initialPlacement04 } from '../../ptr/gameplay04/gameplay04Placement';
import { PENDING_LABEL04 } from '../../ptr/gameplay04/gameplay04Presentation';
import { Keep04BuildingPanel, RESOURCES04 } from './Keep04BuildingPanel';
import { Keep04Schematic } from './Keep04Schematic';
import { Keep04SceneHost, type Keep04SceneHostProps } from './Keep04SceneHost';
import { evaluatePlacement04 } from '../../../spacetimedb/gameplay04/placement';
import { estimatedTime04, Keep04WorkerPanel } from './Keep04WorkerPanel';
import './Keep04Screen.css';

export type Keep04UiSelection = Readonly<{
  selectedKind: Building04 | null; draft: Placement04 | null; panel: 'workers' | 'buildings' | null;
}>;
export type Keep04ScreenProps = Readonly<{
  snapshot: Snapshot04; controller: Controller04; selection: Keep04UiSelection;
  onSelectionChange: (selection: Keep04UiSelection) => void; onBack: () => void;
  quality: 'high' | 'balanced' | 'reduced'; reducedMotion: boolean;
  onFindResources: (resource: Resource04 | null) => void; onReturnToWorld: () => void;
  onSceneObservation?: Keep04SceneHostProps['onObservation']; qaFault?: Keep04SceneHostProps['qaFault'];
}>;

export function Keep04Screen({ snapshot, controller, selection, onSelectionChange, onBack, quality, reducedMotion, onFindResources, onReturnToWorld, onSceneObservation, qaFault }: Keep04ScreenProps) {
  const { view, phase, problem } = snapshot;
  const panelId = useId();
  const [nowMs, setNowMs] = useState(Date.now);
  const [sceneMode, setSceneMode] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  const opener = useRef<HTMLElement | SVGElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const buildingsButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const schematic = useRef<HTMLDetailsElement>(null);
  const wasReady = useRef(phase === 'ready');
  const ready = phase === 'ready' && view !== null;
  const activeTimer = ready && (view.state.project !== undefined || view.workers.some(worker => worker.phase !== 'idle'));
  useEffect(() => {
    if (!activeTimer) return;
    setNowMs(Date.now()); const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTimer]);
  useEffect(() => {
    if (ready && selection.panel) closeButton.current?.focus();
  }, [selection.panel, ready]);
  useEffect(() => {
    // Keep the same DOM and focus, but reopen controls if graphics disappear.
    if (sceneMode !== 'webgl' && schematic.current) schematic.current.open = true;
  }, [sceneMode]);
  useEffect(() => {
    if (wasReady.current && !ready && (!document.activeElement || document.activeElement === document.body || root.current?.contains(document.activeElement))) backButton.current?.focus();
    wasReady.current = ready;
  }, [ready]);
  function closePanel() {
    onSelectionChange({ ...selection, panel: null });
    (opener.current?.isConnected ? opener.current : buildingsButton.current)?.focus();
  }
  function openPanel(panel: 'workers' | 'buildings', control: HTMLElement) {
    opener.current = control; onSelectionChange({ ...selection, panel });
  }
  function selectBuilding(kind: Building04) {
    if (!view) return;
    if (selection.panel !== 'buildings') {
      const active = document.activeElement;
      opener.current = (active instanceof HTMLElement || active instanceof SVGElement) && active !== document.body && root.current?.contains(active) ? active : buildingsButton.current;
    }
    const existing = view.buildings.find(building => building.kind === kind);
    onSelectionChange({ panel: 'buildings', selectedKind: kind,
      draft: existing?.placement ?? (selection.draft?.kind === kind ? selection.draft : initialPlacement04(kind, view.buildings.map(building => building.placement))) });
  }
  return <div ref={root} className="keep04" data-quality={quality} data-reduced-motion={reducedMotion} onKeyDown={event => {
    if (event.key === 'Escape' && ready && selection.panel) { event.preventDefault(); closePanel(); }
  }}>
    <header className="keep04-header">
      <button ref={backButton} type="button" onClick={onBack}>Back</button>
      <div><p className="keep04-eyebrow">VERDANT CITADEL</p><h1>Your keep</h1></div>
    </header>
    <p className="keep04-reentry">A previous action may have completed while you were away. Keep state is refreshed from the Realm.</p>
    {!ready && <section className="keep04-state" aria-label="Keep status">
      <p role="status">{phase === 'uninitialized' ? 'Your keep is ready to initialize.' : phase === 'uncertain' ? 'Outcome unknown. Check the Realm or retry the same request.' : phase === 'failed' ? 'The keep could not be refreshed.' : phase === 'disposed' ? 'Keep authority is no longer available.' : phase === 'pending' ? 'Request pending. Awaiting Realm update.' : 'Loading keep from the Realm…'}</p>
      {phase === 'uninitialized' && <button type="button" onClick={() => { void controller.submit({ kind: 'initialize' }); }}>Initialize keep</button>}
      {phase === 'uncertain' && <><button type="button" onClick={() => { void controller.refresh(); }}>Check outcome</button><button type="button" onClick={() => { void controller.retryPending(); }}>Retry same request</button></>}
      {phase === 'failed' && <button type="button" onClick={() => { void controller.refresh(); }}>Refresh keep</button>}
    </section>}
    {view !== null && <div hidden={!ready}>
      <section className="keep04-resources" aria-label="Resources">
        {RESOURCES04.map(resource => <div key={resource}><span>{resource[0].toUpperCase() + resource.slice(1)}</span><strong>{view.balances[resource].toString()}</strong><small>Pending {view.pending[resource].toString()}</small></div>)}
        <p>{PENDING_LABEL04}</p>
      </section>
      <nav className="keep04-primary-nav" aria-label="Primary keep actions">
        <button type="button" aria-controls={selection.panel ? panelId : undefined} aria-expanded={selection.panel === 'buildings'} onClick={event => openPanel('buildings', event.currentTarget)}>Open building catalog</button>
        <button type="button" aria-controls={selection.panel ? panelId : undefined} aria-expanded={selection.panel === 'workers'} onClick={event => openPanel('workers', event.currentTarget)}>Manage Workers</button>
      </nav>
      {problem === 'capacity' && <p role="status">That resource location is full. Find another location.</p>}
      {problem === 'target' && <p role="status">That resource location changed. Choose a current Realm location.</p>}
      <div className="keep04-workspace" data-panel-open={selection.panel !== null}>
        <div className="keep04-scene-region">
          {ready && <Keep04SceneHost quality={quality} reducedMotion={reducedMotion} onMode={setSceneMode}
            onObservation={onSceneObservation} {...(import.meta.env.DEV ? { qaFault } : {})}
            visual={{ buildings: view.buildings, selectedKind: selection.selectedKind, draft: selection.panel === 'buildings' ? selection.draft : null,
              draftValid: selection.draft !== null && evaluatePlacement04(selection.draft, view.buildings.filter(building => building.kind !== selection.draft!.kind).map(building => building.placement)).valid }}
            onSelect={selectBuilding} onPlacement={draft => onSelectionChange({ ...selection, draft })} />}
          {sceneMode === 'fallback' && <p role="status">3D graphics are unavailable. Your keep and commands remain available in the placement schematic.</p>}
          <details ref={schematic} open>
            <summary style={{ cursor: 'pointer', padding: '12px 0', minHeight: 44 }}>Placement schematic and keyboard controls</summary>
            <Keep04Schematic buildings={view.buildings} draft={selection.panel === 'buildings' ? selection.draft : null} selectedKind={selection.selectedKind}
              onSelect={selectBuilding} onChange={draft => onSelectionChange({ ...selection, draft })} />
          </details>
          {view.buildings.filter(building => building.phase === 'constructing').map(building => <p key={building.kind} className="keep04-construction">
            Constructing level {building.targetLevel} · Estimated build time: <span>{estimatedTime04(building.completesAtMicros!, nowMs)}</span>
          </p>)}
        </div>
        {selection.panel && <aside id={panelId} className="keep04-panel" aria-label="Command panel">
          <button ref={closeButton} className="keep04-close" type="button" onClick={closePanel}>Close panel</button>
          {selection.panel === 'workers'
            ? <Keep04WorkerPanel view={view} enabled={ready} nowMs={nowMs} onFindResources={onFindResources} onRecall={ordinal => {
              if (view.atlas) void controller.submit({ kind: 'recall', workerOrdinal: ordinal, atlasRevision: view.atlas.revision });
            }} />
            : <Keep04BuildingPanel view={view} selectedKind={selection.selectedKind} draft={selection.draft} enabled={ready} problem={problem}
              onSelect={selectBuilding} onConfirm={quote => { void controller.submit({ kind: 'build', quote }); }} onFindResources={onFindResources}
              onCancelDraft={() => { onSelectionChange({ ...selection, selectedKind: null, draft: null }); closeButton.current?.focus(); }} />}
        </aside>}
      </div>
      <nav className="keep04-dock" aria-label="Keep commands">
        {view.workers.map(worker => <button key={worker.ordinal} type="button" onClick={event => openPanel('workers', event.currentTarget)} aria-expanded={selection.panel === 'workers'}>Worker {worker.ordinal + 1} · {worker.phase}</button>)}
        <button ref={buildingsButton} type="button" onClick={event => openPanel('buildings', event.currentTarget)} aria-expanded={selection.panel === 'buildings'}>Buildings</button>
        <button type="button" onClick={() => onFindResources(null)}>Find resources</button>
        <button type="button" onClick={onReturnToWorld}>Return to world</button>
      </nav>
    </div>}
  </div>;
}
