import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import type { Building04, Resource04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { Controller04, Snapshot04 } from '../../ptr/gameplay04/createGameplay04Controller';
import { initialPlacement04 } from '../../ptr/gameplay04/gameplay04Placement';
import { PENDING_LABEL04 } from '../../ptr/gameplay04/gameplay04Presentation';
import { BUILDING_NAMES04, Keep04BuildingPanel, RESOURCES04 } from './Keep04BuildingPanel';
import { activeKeep04LoopStage04, isKeep04FirstJourney04, Keep04LoopRail } from './Keep04LoopRail';
import { Keep04Schematic } from './Keep04Schematic';
import { Keep04SceneHost, type Keep04SceneHostProps } from './Keep04SceneHost';
import type { Keep04WorkerVisual, VisualState04 } from './createKeep04Scene';
import { evaluatePlacement04 } from '../../../spacetimedb/gameplay04/placement';
import { constructionProgress04 } from './constructionProgress04';
import { estimatedTime04, Keep04WorkerPanel } from './Keep04WorkerPanel';
import { keep04NextStep04 } from './keep04NextStep';
import { emitWarpkeepSfx } from '../audio/sfxEvents';
import { GAMEPLAY04_SFX_BUILDING } from '../../ptr/gameplay04/gameplay04Sfx';
import './Keep04Screen.css';

export type Keep04UiSelection = Readonly<{
  selectedKind: Building04 | null; draft: Placement04 | null; panel: 'workers' | 'buildings' | null;
}>;
export type Keep04ScreenProps = Readonly<{
  snapshot: Snapshot04; controller: Controller04; selection: Keep04UiSelection;
  onSelectionChange: (selection: Keep04UiSelection) => void; onBack: () => void;
  quality: 'high' | 'balanced' | 'reduced'; reducedMotion: boolean;
  onFindResources: (resource: Resource04 | null, workerOrdinal?: number) => void; onReturnToWorld: () => void;
  onSceneObservation?: Keep04SceneHostProps['onObservation']; qaFault?: Keep04SceneHostProps['qaFault'];
  /** Development QA only: a fixed local hour for the scene's daylight mood. */
  daylightHour?: number;
}>;

function samePlacement04(first: Placement04 | null, second: Placement04 | null): boolean {
  return first === second || (first !== null && second !== null
    && first.kind === second.kind && first.x === second.x && first.z === second.z && first.rotation === second.rotation);
}

const micros04 = (value: bigint | undefined) => value === undefined ? null : Number(value / 1000n);

// Small decorative glyphs drawn inline (no network bytes). Labels stay the accessible names.
const RESOURCE_ICON04: Readonly<Record<Resource04, ReactElement>> = {
  food: <g fill="currentColor"><path d="M10 18.5V6.5" stroke="currentColor" strokeWidth="1.4" fill="none" strokeLinecap="round" /><ellipse cx="10" cy="4.2" rx="1.6" ry="2.7" /><ellipse cx="7.5" cy="8" rx="1.6" ry="2.8" transform="rotate(-30 7.5 8)" /><ellipse cx="12.5" cy="8" rx="1.6" ry="2.8" transform="rotate(30 12.5 8)" /><ellipse cx="7.6" cy="12.4" rx="1.5" ry="2.6" transform="rotate(-34 7.6 12.4)" /><ellipse cx="12.4" cy="12.4" rx="1.5" ry="2.6" transform="rotate(34 12.4 12.4)" /></g>,
  wood: <g><rect x="2.5" y="7" width="12.5" height="7" rx="1.4" fill="currentColor" /><circle cx="15" cy="10.5" r="4" fill="currentColor" /><circle cx="15" cy="10.5" r="2.4" fill="none" stroke="#2a1d14" strokeOpacity=".55" /><circle cx="15" cy="10.5" r=".8" fill="#2a1d14" fillOpacity=".55" /></g>,
  stone: <g><path d="M3.5 13.5 6 6.5l6-2.5 5 4 .5 6-5 3.5-6-.5z" fill="currentColor" /><path d="M6 6.5 9.5 11l7.5-2.5M9.5 11l2.5 6.5" fill="none" stroke="#1c2a26" strokeOpacity=".45" /></g>,
  gold: <g><circle cx="10" cy="10" r="7" fill="currentColor" /><circle cx="10" cy="10" r="4.6" fill="none" stroke="#5a3d0c" strokeOpacity=".5" strokeWidth="1.1" /><path d="M10 6.8 11 9.2h2.5l-2 1.5.8 2.4L10 11.6l-2.3 1.5.8-2.4-2-1.5H9z" fill="#5a3d0c" fillOpacity=".55" /></g>,
};

function Keep04ResourceIcon({ resource }: Readonly<{ resource: Resource04 }>) {
  return <svg className="keep04-resource-icon" viewBox="0 0 20 20" aria-hidden="true" focusable="false">{RESOURCE_ICON04[resource]}</svg>;
}

/** Small inline glyphs for the construction and steward cards (CSS may not reference url() assets). */
function Keep04HammerIcon() {
  return <svg className="keep04-card-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M2.5 13.5 9 7" stroke="#e9cf98" strokeWidth="2" strokeLinecap="round" /><path d="M7.5 3.5 10 1l4.5 4.5L12 8z" fill="#e9cf98" />
  </svg>;
}

function Keep04ScrollIcon() {
  return <svg className="keep04-card-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
    <path d="M3 2.5h8.5a2 2 0 0 1 2 2v9H5a2 2 0 0 1-2-2z" fill="#d9bf82" />
    <path d="M5.5 5.5h5.5M5.5 8h5.5M5.5 10.5h3.5" stroke="#243a33" strokeWidth="1.1" strokeLinecap="round" />
  </svg>;
}

/** The Verdant Citadel mark: pale towers, teal roofs and one restrained warp accent on a brass-edged shield. */
function Keep04Crest() {
  return <svg className="keep04-crest" viewBox="0 0 40 46" aria-hidden="true" focusable="false">
    <path d="M20 2 37 8v14c0 11-7.5 18.5-17 22C10.5 40.5 3 33 3 22V8z" fill="#183a33" stroke="#c9ab64" strokeWidth="2" />
    <path d="M9 34V17h6v17zm16 0V17h6v17zM15 34V22h10v12z" fill="#e6dec4" />
    <path d="M16 34V19h8v15z" fill="#d6ceb3" />
    <path d="M8.5 17 12 11.5l3.5 5.5zm16 0L28 11.5l3.5 5.5zm-9 2L20 13l4.5 6z" fill="#3f8380" />
    <path d="M18 34v-4.5a2 2 0 0 1 4 0V34z" fill="#3e3128" />
    <circle cx="20" cy="9.6" r="1.4" fill="#c7a6ff" />
  </svg>;
}

/** Confirmed journey phases only: no yields, balances or route targets reach the scene. */
export function keep04WorkerVisuals(view: Snapshot04['view']): readonly Keep04WorkerVisual[] {
  if (!view) return [];
  return view.state.workers.map(worker => {
    const assignment = worker.assignment;
    const phase = (assignment?.phase ?? 'idle') as Keep04WorkerVisual['phase'];
    const started = phase === 'outbound' ? assignment?.dispatchedAt : phase === 'gathering' ? assignment?.arrivesAt
      : phase === 'returning' ? assignment?.recalledAt ?? assignment?.gatheringStopsAt : undefined;
    const ends = phase === 'outbound' ? assignment?.arrivesAt : phase === 'gathering' ? assignment?.gatheringStopsAt
      : phase === 'returning' ? assignment?.returnsAt : undefined;
    // An outbound recall returns with an empty cart; only confirmed earnings can give it cargo.
    const resource = phase === 'returning' && assignment?.earned === 0n ? null : assignment?.resource ?? null;
    return Object.freeze({ ordinal: worker.ordinal, phase, resource: resource as Keep04WorkerVisual['resource'],
      phaseStartedAtMs: micros04(started), phaseEndsAtMs: micros04(ends) });
  });
}

function sameWorkers04(first: readonly Keep04WorkerVisual[] = [], second: readonly Keep04WorkerVisual[] = []) {
  return first.length === second.length && first.every((worker, index) => {
    const next = second[index];
    return worker.ordinal === next.ordinal && worker.phase === next.phase && worker.resource === next.resource
      && worker.phaseStartedAtMs === next.phaseStartedAtMs && worker.phaseEndsAtMs === next.phaseEndsAtMs;
  });
}

function sameSceneVisual04(first: VisualState04, second: VisualState04): boolean {
  if (first.selectedKind !== second.selectedKind || first.draftValid !== second.draftValid
    || !samePlacement04(first.draft, second.draft) || first.buildings.length !== second.buildings.length
    || !sameWorkers04(first.workers, second.workers)) return false;
  return first.buildings.every((building, index) => {
    const next = second.buildings[index];
    return building.kind === next.kind && samePlacement04(building.placement, next.placement)
      && building.completedLevel === next.completedLevel && building.targetLevel === next.targetLevel
      && building.phase === next.phase && building.startsAtMicros === next.startsAtMicros
      && building.completesAtMicros === next.completesAtMicros;
  });
}

export function Keep04Screen({ snapshot, controller, selection, onSelectionChange, onBack, quality, reducedMotion, onFindResources, onReturnToWorld, onSceneObservation, qaFault, daylightHour }: Keep04ScreenProps) {
  const { view, phase, problem } = snapshot;
  const panelId = useId();
  const [nowMs, setNowMs] = useState(Date.now);
  const [sceneMode, setSceneMode] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  const opener = useRef<HTMLElement | SVGElement | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const buildingsButton = useRef<HTMLButtonElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const decisionHeader = useRef<HTMLDivElement>(null);
  const commandPanel = useRef<HTMLElement>(null);
  const schematic = useRef<HTMLDetailsElement>(null);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const selectionNavigation = useRef<Building04 | null>(null);
  const ready = phase === 'ready' && view !== null;
  // Refreshes and pending commands retain the last confirmed view and local
  // focus. Only ready grants command authority; failures and expired scopes hide it.
  const visible = (phase === 'ready' || phase === 'refreshing' || phase === 'pending') && view !== null;
  const firstIdleWorker = view?.workers.find(worker => worker.phase === 'idle');
  const showFirstJourney = visible && view !== null && isKeep04FirstJourney04(view);
  // One clear next step for a returning Keeper, after the first journey card.
  const nextStep = visible && view !== null && !showFirstJourney ? keep04NextStep04(view, nowMs) : null;
  const constructionStatuses = view?.buildings.filter(building => building.phase === 'constructing').map(building => {
    const construction = building.startsAtMicros !== null && building.completesAtMicros !== null
      ? constructionProgress04(building.startsAtMicros, building.completesAtMicros, nowMs)
      : null;
    return <section key={building.kind} className="keep04-construction" aria-label={`${BUILDING_NAMES04[building.kind]} construction`}>
      <p><Keep04HammerIcon /><strong>{BUILDING_NAMES04[building.kind]}</strong> · Constructing level {building.targetLevel} · Estimated time remaining: <span>{construction?.remaining ?? estimatedTime04(building.completesAtMicros!, nowMs)}</span></p>
      {construction && <div className="keep04-construction-progress">
        <div className="keep04-construction-progress-track" role="progressbar" aria-label={`${BUILDING_NAMES04[building.kind]} scene construction progress`}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={construction.percent} aria-valuetext={construction.label}>
          <span style={{ width: `${construction.percent}%` }} />
        </div>
        <span className="keep04-construction-progress-label">{construction.label}</span>
      </div>}
    </section>;
  }) ?? [];
  const sceneBuildings = view?.buildings;
  const sceneWorkers = useMemo(() => keep04WorkerVisuals(view), [view]);
  const previousSceneVisual = useRef<VisualState04 | null>(null);
  // Countdown text updates once a second; only actual placement/structure changes
  // should reconcile the 3D scene or wake its renderer.
  const sceneVisual = useMemo(() => {
    const buildings = sceneBuildings ?? [];
    const candidate = selection.panel === 'buildings' ? selection.draft : null;
    const next: VisualState04 = { buildings, selectedKind: selection.selectedKind, workers: sceneWorkers,
      draft: candidate,
      draftValid: candidate !== null && evaluatePlacement04(candidate,
        buildings.filter(building => building.kind !== candidate.kind).map(building => building.placement)).valid };
    if (previousSceneVisual.current !== null && sameSceneVisual04(previousSceneVisual.current, next)) {
      return previousSceneVisual.current;
    }
    return next;
  }, [sceneBuildings, sceneWorkers, selection.selectedKind, selection.draft, selection.panel]);
  useLayoutEffect(() => { previousSceneVisual.current = sceneVisual; }, [sceneVisual]);
  const wasVisible = useRef(visible);
  const activeTimer = visible && (view.state.project !== undefined || view.workers.some(worker => worker.phase !== 'idle'));
  useEffect(() => {
    if (!activeTimer) return;
    setNowMs(Date.now()); const timer = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [activeTimer]);
  useLayoutEffect(() => {
    const header = decisionHeader.current; const element = root.current;
    if (!visible || !header || !element) return;
    // Includes wrapping, font changes and safe-area padding, not a guessed
    // mobile height. Resizing updates offsets without moving the user's scroll.
    const measure = () => element.style.setProperty('--keep04-decision-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(header, { box: 'border-box' }); window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect(); window.removeEventListener('resize', measure);
      element.style.removeProperty('--keep04-decision-height');
    };
  }, [visible]);
  useEffect(() => {
    // Align when a panel opens or returns from an unavailable state. Refreshes,
    // pending commands, resizes and draft edits preserve the user's scroll.
    if (visible && selection.panel && selectionNavigation.current === null) focusPanel();
  }, [selection.panel, visible]);
  useEffect(() => {
    if (!visible || selection.panel !== 'buildings') { selectionNavigation.current = null; return; }
    if (selectionNavigation.current !== null && selectionNavigation.current === selection.selectedKind) {
      selectionNavigation.current = null; focusReview();
    }
  });
  useEffect(() => {
    // Keep the same DOM and focus, but reopen controls if graphics disappear.
    if (sceneMode !== 'webgl' && schematic.current) schematic.current.open = true;
  }, [sceneMode]);
  useEffect(() => {
    if (wasVisible.current && !visible && (!document.activeElement || document.activeElement === document.body || root.current?.contains(document.activeElement))) backButton.current?.focus();
    wasVisible.current = visible;
  }, [visible]);
  function focusPanel() {
    const compact = decisionHeader.current !== null && getComputedStyle(decisionHeader.current).position === 'sticky';
    if (compact) {
      // Skip the intervening scene without collapsing/unmounting the schematic.
      commandPanel.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' });
      closeButton.current?.focus({ preventScroll: true });
    } else closeButton.current?.focus();
  }
  function closePanel() {
    selectionNavigation.current = null;
    onSelectionChange({ ...selection, panel: null });
    (opener.current?.isConnected ? opener.current : buildingsButton.current)?.focus();
  }
  function openPanel(panel: 'workers' | 'buildings', control: HTMLElement) {
    selectionNavigation.current = null;
    opener.current = control; onSelectionChange({ ...selection, panel });
    if (selection.panel === panel && decisionHeader.current && getComputedStyle(decisionHeader.current).position === 'sticky') focusPanel();
  }
  function selectBuilding(kind: Building04) {
    if (!view) return;
    if (selection.panel !== 'buildings') {
      const active = document.activeElement;
      opener.current = (active instanceof HTMLElement || active instanceof SVGElement) && active !== document.body && root.current?.contains(active) ? active : buildingsButton.current;
    }
    const existing = view.buildings.find(building => building.kind === kind);
    if (selection.selectedKind !== kind) emitWarpkeepSfx({ kind: 'keep-building-selected', building: GAMEPLAY04_SFX_BUILDING[kind] });
    if (selection.selectedKind !== kind || selection.panel !== 'buildings') selectionNavigation.current = kind;
    onSelectionChange({ panel: 'buildings', selectedKind: kind,
      draft: existing?.placement ?? (selection.draft?.kind === kind ? selection.draft : initialPlacement04(kind, view.buildings.map(building => building.placement))) });
  }
  function placeDraft(draft: Placement04) {
    // A short tock on open ground, a muted thud where the site is blocked.
    if (view && !samePlacement04(draft, selection.draft)) {
      const valid = evaluatePlacement04(draft, view.buildings.filter(building => building.kind !== draft.kind).map(building => building.placement)).valid;
      emitWarpkeepSfx({ kind: valid ? 'keep-placement-valid' : 'keep-placement-blocked' });
    }
    onSelectionChange({ ...selection, draft });
  }
  function alignAndFocus(element: HTMLElement | SVGSVGElement | null) {
    element?.scrollIntoView?.({ block: 'start', behavior: 'instant' }); element?.focus({ preventScroll: true });
  }
  function focusReview() { if (visible) alignAndFocus(reviewHeading.current); }
  function viewSite() {
    if (!visible || !schematic.current) return;
    schematic.current.open = true;
    alignAndFocus(schematic.current.querySelector('svg'));
  }
  return <div ref={root} className="keep04" data-quality={quality} data-reduced-motion={reducedMotion} onKeyDown={event => {
    if (event.key === 'Escape' && visible && selection.panel) { event.preventDefault(); closePanel(); }
  }}>
    <header className="keep04-header">
      <button ref={backButton} type="button" onClick={onBack}>Back</button>
      <Keep04Crest />
      <div><p className="keep04-eyebrow">VERDANT CITADEL</p><h1>Your keep</h1></div>
    </header>
    <p className="keep04-reentry">Progress saved in the Realm. Resources become available when Workers return.</p>
    {!visible && <section className="keep04-state" aria-label="Keep status">
      <p role="status">{phase === 'uninitialized' ? 'Your grounds are ready. Establish your keep to begin.' : phase === 'uncertain' ? 'Outcome unknown. Check the Realm or retry the same request.' : phase === 'failed' ? 'The keep could not be refreshed.' : phase === 'disposed' ? 'Your keep session has ended.' : phase === 'pending' ? 'Request pending. Awaiting Realm update.' : 'Loading keep from the Realm…'}</p>
      {phase === 'uninitialized' && <button type="button" onClick={() => { void controller.submit({ kind: 'initialize' }); }}>Establish keep</button>}
      {phase === 'uncertain' && <><button type="button" onClick={() => { void controller.refresh(); }}>Check outcome</button><button type="button" onClick={() => { void controller.retryPending(); }}>Retry same request</button></>}
      {phase === 'failed' && <button type="button" onClick={() => { void controller.refresh(); }}>Refresh keep</button>}
    </section>}
    {phase === 'refreshing' && visible && <p role="status">Refreshing keep from the Realm… Commands are temporarily unavailable.</p>}
    {ready && view.atlas === null && <p role="status">Return to world to refresh the Realm before building or recalling Workers.</p>}
    {view !== null && <div className="keep04-ready" hidden={!visible}>
      <div ref={decisionHeader} className="keep04-decision-header">
        <section className="keep04-resources" aria-label="Resources">
          {RESOURCES04.map(resource => {
            const pending = view.pending[resource] > 0n;
            const label = resource[0].toUpperCase() + resource.slice(1);
            const available = view.balances[resource].toString();
            const incoming = view.pending[resource].toString();
            return <div key={resource} data-resource={resource} data-pending={pending ? 'true' : undefined}>
              <span><Keep04ResourceIcon resource={resource} />{label}</span>
              <strong aria-label={`${label}: ${available} available`}>{available}</strong>
              {pending && <small className="keep04-resource-pending" aria-label={`${label}: ${incoming} pending and not spendable`}>Pending {incoming}</small>}
            </div>;
          })}
          <p>{RESOURCES04.some(resource => view.pending[resource] > 0n) ? PENDING_LABEL04 : "No resources awaiting return"}</p>
          {phase === 'pending' && visible && <p role="status">Request pending. Your last confirmed keep stays visible until the Realm updates.</p>}
        </section>
        <nav className="keep04-primary-nav" aria-label="Primary keep actions">
          <button type="button" aria-controls={selection.panel ? panelId : undefined} aria-expanded={selection.panel === 'buildings'} onClick={event => openPanel('buildings', event.currentTarget)}>Open building catalog</button>
          <button type="button" aria-controls={selection.panel ? panelId : undefined} aria-expanded={selection.panel === 'workers'} onClick={event => openPanel('workers', event.currentTarget)}>Manage Workers</button>
        </nav>
      </div>
      {showFirstJourney && firstIdleWorker !== undefined && <section className="keep04-first-journey" aria-label="First journey">
        <p className="keep04-eyebrow">YOUR FIRST RETURN</p>
        <h2>Start with one useful journey.</h2>
        <p>Start with a City Mill. It needs Food, Wood, and Stone; City Goldworks also requires Gold. Check costs under Buildings, then send idle Workers to gather missing resources in parallel. Only confirmed returns can fund construction.</p>
        <button type="button" onClick={() => onFindResources(null, firstIdleWorker.ordinal)}>Choose a resource location</button>
      </section>}
      {constructionStatuses.length === 1 ? constructionStatuses[0] : constructionStatuses.length > 1 ?
        <details className="keep04-construction-group">
          <summary>{constructionStatuses.length} constructions underway · View progress</summary>
          {constructionStatuses}
        </details> : null}
      {/* After construction progress, which stays in the first phone view. */}
      {nextStep && <section className="keep04-next-step" aria-label="Next step" data-next-step={nextStep.kind}>
        <p className="keep04-eyebrow"><Keep04ScrollIcon />STEWARD&apos;S ADVICE</p>
        <h2>{nextStep.title}</h2>
        <p>{nextStep.detail}</p>
        {nextStep.kind === 'build' && <button type="button" onClick={() => selectBuilding(nextStep.building)}>Review {BUILDING_NAMES04[nextStep.building]}</button>}
        {nextStep.kind === 'gather' && <button type="button" onClick={() => onFindResources(nextStep.resource, nextStep.workerOrdinal)}>Start gathering {nextStep.resource}</button>}
      </section>}
      {problem === 'capacity' && <p className="keep04-problem" role="status">That resource location is full. Find another location.</p>}
      {problem === 'target' && <p className="keep04-problem" role="status">That resource location changed. Choose a current Realm location.</p>}
      <div className="keep04-workspace" data-panel-open={selection.panel !== null}>
        <div className="keep04-scene-region">
          {visible && <Keep04SceneHost quality={quality} reducedMotion={reducedMotion} onMode={setSceneMode}
            ambientLife={quality !== 'reduced' && !reducedMotion}
            onObservation={onSceneObservation} {...(import.meta.env.DEV ? { qaFault, daylightHour } : {})}
            visual={sceneVisual}
            onSelect={selectBuilding} onPlacement={placeDraft} />}
          {sceneMode === 'fallback' && <p role="status">3D graphics are unavailable. Your keep and commands remain available in the placement schematic.</p>}
          <details ref={schematic} open>
            <summary style={{ cursor: 'pointer', padding: '12px 0', minHeight: 44 }}>Placement schematic and keyboard controls</summary>
            <Keep04Schematic buildings={view.buildings} draft={selection.panel === 'buildings' ? selection.draft : null} selectedKind={selection.selectedKind}
              onSelect={selectBuilding} onChange={placeDraft}
              onReview={selection.panel === 'buildings' ? focusReview : undefined} />
          </details>
        </div>
        {selection.panel && <aside ref={commandPanel} id={panelId} className="keep04-panel" aria-label="Command panel">
          <button ref={closeButton} className="keep04-close" type="button" onClick={closePanel}>Close panel</button>
          {selection.panel === 'workers'
            ? <Keep04WorkerPanel view={view} enabled={ready} nowMs={nowMs} onFindResources={onFindResources} onRecall={ordinal => {
              if (view.atlas) void controller.submit({ kind: 'recall', workerOrdinal: ordinal, atlasRevision: view.atlas.revision });
            }} />
            : <Keep04BuildingPanel view={view} nowMs={nowMs} selectedKind={selection.selectedKind} draft={selection.draft} enabled={ready} problem={problem}
              onSelect={selectBuilding} onConfirm={quote => {
                if (controller.getSnapshot().phase !== 'ready') return false;
                void controller.submit({ kind: 'build', quote }); return true;
              }} onFindResources={onFindResources}
              onViewSite={viewSite} reviewHeadingRef={reviewHeading}
              onCancelDraft={() => { onSelectionChange({ ...selection, selectedKind: null, draft: null }); closeButton.current?.focus(); }} />}
        </aside>}
      </div>
      <Keep04LoopRail stage={activeKeep04LoopStage04(selection, view)} />
      <nav className="keep04-dock" aria-label="Keep commands">
        {view.workers.map(worker => <button key={worker.ordinal} type="button" data-phase={worker.phase} onClick={event => openPanel('workers', event.currentTarget)} aria-expanded={selection.panel === 'workers'}>Worker {worker.ordinal + 1} · {worker.phase}</button>)}
        <button ref={buildingsButton} type="button" onClick={event => openPanel('buildings', event.currentTarget)} aria-expanded={selection.panel === 'buildings'}>Buildings</button>
        <button type="button" onClick={() => onFindResources(null)}>Find resources</button>
        <button type="button" onClick={onReturnToWorld}>Return to world</button>
      </nav>
    </div>}
  </div>;
}
