import { useCallback, useLayoutEffect, useRef, useState, type ReactElement } from 'react';
import type { Building04, Resource04 } from '../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../spacetimedb/gameplay04/placement';
import { Keep04Screen, type Keep04UiSelection } from '../components/keep04/Keep04Screen';
import { GreaterRealmWorldScene, type WorldSelection04 } from '../components/realm/GreaterRealmWorldScene';
import type { RealmMapScreenProps } from '../components/realm/RealmMapScreen';
import type { RealmSurfaceRoute } from '../components/realm/realmSurfaceNavigation';
import { useRealmSurfaceNavigation } from '../components/realm/useRealmSurfaceNavigation';
import { useReducedMotionPreference } from '../components/realm/realmMapPresentationHelpers';
import { useMiniAppHost, useMiniAppBackNavigation } from '../farcaster/miniapp';
import { resolvePtrRealmPresentation } from './ptrRealmPresentationPolicy';
import { isCurrentPtrGameplay04Capability, type PtrGameplay04Capability } from './ptrRealmConnection';
import { useGameplay04Controller } from './gameplay04/useGameplay04Controller';
import type { Controller04, Snapshot04 } from './gameplay04/createGameplay04Controller';
import type { WorkerView04 } from './gameplay04/gameplay04Presentation';
import { PtrSessionRenewalNotice } from './PtrSessionContinuation';

type Props = RealmMapScreenProps & { ptrGameplay04: PtrGameplay04Capability };
const BUILDINGS: readonly Building04[] = ['city-mill', 'lumber-camp', 'city-stoneworks', 'city-goldworks', 'city-barracks', 'grand-covenant-cathedral'];
function buildingKind(value: string): value is Building04 { return BUILDINGS.includes(value as Building04); }

/** The outer boundary stays inert for an expired, copied or mismatched capability. */
export function PtrGameplay04SurfaceHost(props: Props): ReactElement {
  const { ptrRealmAuthority: authority, ptrViewAnchor: anchor, greaterRealm: bridge, ptrGameplay04: capability } = props;
  if (!authority || !anchor || !bridge || bridge.phase !== 'available' || bridge.presentationAllowed !== true
    || !resolvePtrRealmPresentation({ authority, viewAnchor: anchor, legacySurfacePresent: false })
    || props.identity.fid !== authority.fid
    || !isCurrentPtrGameplay04Capability(capability, authority, bridge.sessionGeneration)
    || capability.scope.databaseIdentity !== authority.databaseIdentity
    || capability.scope.anchorQ !== anchor.q || capability.scope.anchorR !== anchor.r) {
    return <main><p role="status">PTR is unavailable.</p><button onClick={props.onRequestReturn}>Return to Menu</button></main>;
  }
  const identityKey = [capability.scope.generation, capability.scope.databaseIdentity, anchor.castleId, anchor.q, anchor.r, authority.fid].join(':');
  return <CurrentSurface {...props} key={identityKey} identityKey={identityKey} />;
}

function CurrentSurface(props: Props & { identityKey: string }) {
  const miniAppHost = useMiniAppHost();
  const reducedMotion = useReducedMotionPreference();
  const { controller, snapshot } = useGameplay04Controller(props.ptrGameplay04);
  const surface = useRealmSurfaceNavigation({ historyEnabled: !miniAppHost.isMiniApp, identityKey: props.identityKey });
  const [initialSurface] = useState(props.ptrInitialSurface ?? 'world');
  const [restoringSurface, setRestoringSurface] = useState(initialSurface === 'keep');
  const [noticeDismissed, setNoticeDismissed] = useState(false);
  const content = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Placement04 | null>(null);
  const [resourceFocus, setResourceFocus] = useState<Resource04 | null>(null);
  const [openPanel, setOpenPanel] = useState<'controls' | 'resources'>();
  const [worldRevision, setWorldRevision] = useState(0);
  useLayoutEffect(() => {
    // Navigation has just reset to this capability's empty history envelope.
    // Reopen only the keep root, without mounting a transient world scene or
    // importing a former panel, placement draft, target or history entry.
    if (initialSurface === 'keep') surface.replace({ kind: 'inner-keep' });
    setRestoringSurface(false);
  }, [initialSurface, surface.replace]);
  useLayoutEffect(() => {
    // Observe controller publication directly: pending may become disposed in
    // the same React batch as renewal. The owner retains only this boolean.
    const report = () => {
      const phase = controller.getSnapshot().phase;
      if (phase === 'pending' || phase === 'uncertain') props.onPtrCommandStateChange?.(true);
      else if (phase === 'ready' || phase === 'uninitialized') props.onPtrCommandStateChange?.(false);
    };
    report();
    return controller.subscribe(report);
  }, [controller, props.onPtrCommandStateChange]);
  useLayoutEffect(() => {
    // Rejected public assertions require a new world read and a new selection,
    // never an optimistic assignment or a silent retry against the old site.
    if (snapshot.problem === 'target' || snapshot.problem === 'capacity' || snapshot.problem === 'reconfirm') {
      setWorldRevision(value => value + 1);
    }
  }, [snapshot.problem]);
  const handleBack = useCallback(() => {
    if (surface.depth > 0) surface.back(); else props.onRequestReturn();
  }, [surface.depth, surface.back, props.onRequestReturn]);
  useMiniAppBackNavigation(surface.depth + 1, handleBack);
  const route = surface.current;
  const knownRoute = route === undefined || route.kind === 'inner-keep' || route.kind === 'inner-keep-catalogue' || route.kind === 'workers'
    || ((route.kind === 'inner-keep-placement' || route.kind === 'inner-keep-building') && buildingKind(route.buildingKind));
  useLayoutEffect(() => {
    if (!restoringSurface && knownRoute) props.onPtrSurfaceChange?.(route === undefined ? 'world' : 'keep');
  }, [knownRoute, restoringSurface, route, props.onPtrSurfaceChange]);
  useLayoutEffect(() => {
    if (!knownRoute) surface.closeToRealm();
    if (route?.kind !== 'inner-keep-placement') setDraft(null);
  }, [knownRoute, route, surface.closeToRealm]);
  const selectedKind = route && (route.kind === 'inner-keep-placement' || route.kind === 'inner-keep-building') && buildingKind(route.buildingKind)
    ? route.buildingKind : null;
  const existing = snapshot.view?.buildings.find(building => building.kind === selectedKind);
  const placement = route?.kind === 'inner-keep-placement' && !existing && draft?.kind === selectedKind ? draft : null;
  const selection: Keep04UiSelection = {
    selectedKind: route?.kind === 'inner-keep-building' && !existing ? null : selectedKind,
    draft: existing?.placement ?? placement,
    panel: route?.kind === 'workers' ? 'workers' : route && route.kind !== 'inner-keep' ? 'buildings' : null,
  };
  function changeSelection(next: Keep04UiSelection) {
    if (snapshot.phase !== 'ready' || !snapshot.view) return;
    if (next.panel === null) { surface.back(); return; }
    let nextRoute: RealmSurfaceRoute;
    if (next.panel === 'workers') nextRoute = { kind: 'workers' };
    else if (next.selectedKind !== null && buildingKind(next.selectedKind)) {
      const completed = snapshot.view.buildings.find(building => building.kind === next.selectedKind);
      nextRoute = { kind: completed ? 'inner-keep-building' : 'inner-keep-placement', buildingKind: next.selectedKind };
      setDraft(completed ? null : next.draft?.kind === next.selectedKind ? next.draft : null);
    } else { nextRoute = { kind: 'inner-keep-catalogue' }; setDraft(null); }
    if (route?.kind === nextRoute.kind && 'buildingKind' in route && 'buildingKind' in nextRoute && route.buildingKind === nextRoute.buildingKind) return;
    if (nextRoute.kind === 'inner-keep-catalogue' && route?.kind === 'inner-keep-placement') surface.back();
    else surface.push(nextRoute);
  }
  const worldSelection = useCallback((value: WorldSelection04 | null) => {
    // The target never survives its scene. Retain only the last verified atlas
    // assertion for build/recall; server binding checks still decide freshness.
    if (value && value.sessionGeneration === props.ptrGameplay04.scope.generation) controller.setAtlas(value.atlas);
  }, [controller, props.ptrGameplay04]);
  const onPhaseChange = useCallback(() => {}, []);
  function findResources(resource: Resource04 | null) {
    setResourceFocus(resource); setOpenPanel('resources'); setDraft(null); surface.closeToRealm();
  }
  if (restoringSurface) return <p role="status">Opening keep…</p>;
  if (!knownRoute) return <p role="status">Returning to world…</p>;
  return <main className="realm-map-screen realm-map-screen--greater-realm ptr-gameplay-surface" aria-label="PTR" data-realm-world-scene-strategy="greater-realm">
    {props.ptrContinuationNotice && !noticeDismissed && (snapshot.view !== null || snapshot.phase === 'uninitialized') &&
      <PtrSessionRenewalNotice onDismiss={() => { setNoticeDismissed(true); props.onDismissPtrContinuationNotice?.(); content.current?.focus({ preventScroll: true }); }} />}
    <div ref={content} tabIndex={-1} className={`ptr-gameplay-surface__content${route === undefined ? '' : ' ptr-gameplay-surface__content--keep'}`}>
    {route === undefined ? <>
      <GreaterRealmWorldScene key={worldRevision} bridge={props.greaterRealm as AvailableBridge} identityFid={props.identity.fid}
        identityKey={props.identityKey} ownCastle={props.ptrViewAnchor!} resolvedGraphicsQuality={props.resolvedGraphicsQuality}
        onPhaseChange={onPhaseChange} narrowOpenPanel={openPanel} onNarrowOpenPanelChange={setOpenPanel}
        resourceFocus04={resourceFocus} onGameplay04WorldSelection={worldSelection}
        renderGameplay04WorldPanel={(value, validate) => <WorldWorkerPanel snapshot={snapshot} controller={controller} selection={value} validateSelection={validate} />} />
      <div className="greater-realm-world__continuity"><button type="button" onClick={handleBack}>Back</button>
        <button type="button" onClick={() => surface.push({ kind: 'inner-keep' })}>Open keep</button>
        {resourceFocus && <button type="button" onClick={() => setResourceFocus(null)}>Show all resources</button>}
      </div>
    </> : <Keep04Screen snapshot={snapshot} controller={controller} selection={selection} onSelectionChange={changeSelection}
      onBack={handleBack} quality={props.resolvedGraphicsQuality === 'cinematic' ? 'high' : props.resolvedGraphicsQuality === 'performance' ? 'reduced' : 'balanced'}
      reducedMotion={reducedMotion} onFindResources={findResources} onReturnToWorld={surface.closeToRealm} />}
    </div>
  </main>;
}

type AvailableBridge = Extract<NonNullable<RealmMapScreenProps['greaterRealm']>, { phase: 'available' }>;
const DURATIONS = [['60 seconds', 60_000_000n], ['10 minutes', 600_000_000n], ['1 hour', 3_600_000_000n], ['8 hours', 28_800_000_000n]] as const;

function JourneyRoute({ worker }: { worker: WorkerView04 }) {
  if (!worker.route.length || worker.route.length > 8193) return null;
  let minQ = Infinity, maxQ = -Infinity, minR = Infinity, maxR = -Infinity;
  for (const { q, r } of worker.route) {
    if (!Number.isSafeInteger(q) || !Number.isSafeInteger(r)) return null;
    minQ = Math.min(minQ, q); maxQ = Math.max(maxQ, q); minR = Math.min(minR, r); maxR = Math.max(maxR, r);
  }
  const start = worker.route[0], target = worker.route.at(-1)!;
  return <figure style={{ margin: 0, maxWidth: 280 }} aria-label={`Worker ${worker.ordinal + 1} Journey route`}>
    <figcaption>Journey route</figcaption><p>Worker {worker.ordinal + 1} · {worker.phase}</p>
    <svg role="img" aria-label={`Start ${start.q}, ${start.r}; target ${target.q}, ${target.r}`} viewBox={`${minQ - 1} ${minR - 1} ${maxQ - minQ + 2} ${maxR - minR + 2}`} width="100%" height="120">
      <polyline points={worker.route.map(point => `${point.q},${point.r}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg><p>Start ({start.q}, {start.r}) → Target ({target.q}, {target.r})</p>
  </figure>;
}

function WorldWorkerPanel({ snapshot, controller, selection, validateSelection }: {
  snapshot: Snapshot04; controller: Controller04; selection: WorldSelection04 | null;
  validateSelection: (selection: WorldSelection04) => boolean;
}) {
  const [ordinal, setOrdinal] = useState(0);
  const [duration, setDuration] = useState<bigint>(60_000_000n);
  const view = snapshot.view;
  const target = selection?.target;
  const idle = view?.workers.find(worker => worker.ordinal === ordinal)?.phase === 'idle';
  const ready = snapshot.phase === 'ready';
  const enabled = ready && idle && selection !== null && target != null && validateSelection(selection);
  const effects = view?.state.completedEffects;
  const rate = target && effects ? { food: effects.foodYieldPerQuantum, wood: effects.woodYieldPerQuantum, stone: effects.stoneYieldPerQuantum, gold: effects.goldYieldPerQuantum }[target.resource] : null;
  return <section aria-label="0.4 Workers">
    <h2>Workers</h2>
    {snapshot.problem === 'target' && <p role="status">That resource location changed. Choose a current Realm location.</p>}
    {snapshot.problem === 'capacity' && <p role="status">That resource location is full. Choose another location.</p>}
    {!ready && <p role="status">{snapshot.phase === 'pending' ? 'Request pending. Awaiting Realm update.' : snapshot.phase === 'uncertain' ? 'Outcome unknown.' : 'Refresh keep state before dispatch.'}</p>}
    {snapshot.phase === 'uncertain' && <><button onClick={() => void controller.refresh()}>Check outcome</button><button onClick={() => void controller.retryPending()}>Retry same request</button></>}
    {snapshot.phase === 'failed' && <button onClick={() => void controller.refresh()}>Refresh keep</button>}
    {target ? <>
      <p>{target.resource} at {target.q}, {target.r} · {target.locationId}</p>
      <p>Node count is informational. The Realm decides available reservations.</p>
      <label>Idle Worker <select aria-label="Idle Worker" value={ordinal} onChange={event => setOrdinal(Number(event.target.value))}>
        {view?.workers.map(worker => <option key={worker.ordinal} value={worker.ordinal} disabled={worker.phase !== 'idle'}>Worker {worker.ordinal + 1} · {worker.phase}</option>)}
      </select></label>
      <div role="group" aria-label="Gathering duration">{DURATIONS.map(([label, micros]) => <button type="button" key={label} aria-pressed={duration === micros} onClick={() => setDuration(micros)}>{label}</button>)}</div>
      <p>Preview only: {DURATIONS.find(([, micros]) => micros === duration)?.[0]} gathering; {rate === null ? 'unknown' : (rate * (duration / 10_000_000n)).toString()} yield, excluding travel. Resources are not spendable until the Realm confirms return.</p>
      <button type="button" disabled={!enabled} onClick={() => {
        if (!selection || !selection.target || !validateSelection(selection)) return;
        const current = controller.getSnapshot();
        if (current.phase !== 'ready' || current.view?.workers.find(worker => worker.ordinal === ordinal)?.phase !== 'idle') return;
        void controller.submit({ kind: 'dispatch', workerOrdinal: ordinal, target: selection.target, durationMicros: duration });
      }}>Dispatch Worker {ordinal + 1}</button>
    </> : <p>Select a current public resource location to dispatch.</p>}
    {view?.workers.map(worker => <div key={worker.ordinal}>
      <JourneyRoute worker={worker} />
      {worker.phase !== 'idle' && <button type="button" disabled={!ready || !selection || !validateSelection(selection) || worker.phase === 'returning'} onClick={() => {
        if (selection && validateSelection(selection) && controller.getSnapshot().phase === 'ready') void controller.submit({ kind: 'recall', workerOrdinal: worker.ordinal, atlasRevision: selection.atlas.revision });
      }}>Recall Worker {worker.ordinal + 1}</button>}
    </div>)}
  </section>;
}
