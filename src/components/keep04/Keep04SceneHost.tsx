import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { InnerKeepRuntimeAssetBundle } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { createKeep04Scene, type Scene04, type VisualState04 } from './createKeep04Scene';
import { loadKeep04Assets } from './loadKeep04Assets';
import { KEEP04_VISUAL_PROFILE, type Quality04 } from './keep04VisualProfile';
import { BUILDING_NAMES04 } from './Keep04BuildingPanel';

export type Keep04SceneHostProps = Readonly<{
  visual: VisualState04; quality: Quality04; reducedMotion: boolean;
  onSelect: (kind: Building04) => void; onPlacement: (placement: Placement04) => void;
  onMode: (mode: 'loading' | 'webgl' | 'fallback') => void;
  onObservation?: (observation: Keep04Observation) => void;
  qaFault?: 'none' | 'missing-model' | 'voxel-failure' | 'webgl-unavailable';
}>;

/** Numeric renderer observations only; owned bytes estimate CPU-side buffers, not GPU allocation. */
export type Keep04Observation = Readonly<{
  event: 'loading' | 'frame' | 'disposed' | 'context-lost' | 'fallback'; timestampMs: number;
  frameWorkMs: number | null; renderCalls: number | null; renderTriangles: number | null;
  rendererGeometries: number | null; rendererTextures: number | null;
  ownedGeometryBytes: number | null; ownedTextureBytes: number | null; voxelPreparationMs: number | null;
  pendingRafs: number; activeLoaders: number; activeListeners: number;
}>;

export function Keep04SceneHost(props: Keep04SceneHostProps) {
  const element = useRef<HTMLDivElement>(null); const current = useRef(props); current.current = props;
  const wrapper = useRef<HTMLElement>(null); const toolbar = useRef<HTMLDivElement>(null);
  const runtime = useRef<{ scene: Scene04; request: () => void; reset: () => void; inspect: () => void; reconcile: () => void } | null>(null);
  const [mode, setMode] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  const [inspectedKind, setInspectedKind] = useState<Building04 | null>(null);
  const [recovery, setRecovery] = useState(0);
  useEffect(() => {
    const host = element.current!; const abort = new AbortController();
    let retired = false; let renderer: THREE.WebGLRenderer | undefined; let scene: Scene04 | undefined;
    let bundle: InnerKeepRuntimeAssetBundle | undefined; let frame = 0; let last = -Infinity;
    let observer: ResizeObserver | undefined; const listeners: Array<() => void> = [];
    let recoveryCanvas: HTMLCanvasElement | undefined; let removeRecovery: (() => void) | undefined;
    let lost = false;
    let activeLoaders = 0;
    let inspection: { kind: Building04; bounds: THREE.Box3 } | null = null;
    let panX = 0; let panZ = 0;
    const qaFault = import.meta.env.DEV ? props.qaFault : undefined;
    function observe(event: Keep04Observation['event'], frameWorkMs: number | null = null, timestampMs = performance.now()) {
      const callback = current.current.onObservation; if (!callback) return;
      try {
        const telemetry = scene?.telemetry();
        callback(Object.freeze({ event, timestampMs, frameWorkMs,
          renderCalls: renderer?.info.render.calls ?? null, renderTriangles: renderer?.info.render.triangles ?? null,
          rendererGeometries: renderer?.info.memory?.geometries ?? null, rendererTextures: renderer?.info.memory?.textures ?? null,
          ownedGeometryBytes: telemetry?.geometryBytes ?? null, ownedTextureBytes: telemetry?.textureBytes ?? null,
          voxelPreparationMs: telemetry?.voxelPreparationMs ?? null, pendingRafs: frame ? 1 : 0,
          activeLoaders, activeListeners: listeners.length + (removeRecovery ? 1 : 0),
        }));
      } catch { /* An observer must never change rendering, commands, or cleanup. */ }
    }
    const set = (value: typeof mode) => { if (!retired) { setMode(value); current.current.onMode(value); } };
    function request() { if (!retired && !document.hidden && !frame && scene) frame = requestAnimationFrame(draw); }
    function draw(now: number) {
      frame = 0; if (retired || document.hidden || !scene || !renderer) return;
      const interval = 1000 / ({ high: 30, balanced: 24, reduced: 15 }[props.quality]);
      const elapsed = now - last;
      // Keep the cadence phase instead of throwing away a late RAF's remainder.
      // 0.05ms covers timestamp rounding without conceding a whole display frame.
      const tolerance = .05;
      if (!props.reducedMotion && elapsed + tolerance < interval) { request(); return; }
      // Rebase after idle/a long stall; render at most once, never replay missed frames.
      // Reduced motion is event-driven feedback, so it needs no throttle-only RAFs.
      last = props.reducedMotion || !Number.isFinite(last) || elapsed >= interval * 2
        ? now : last + Math.floor((elapsed + tolerance) / interval) * interval;
      try {
        const workStarted = current.current.onObservation ? performance.now() : 0;
        const active = scene.update(now / 1000);
        renderer.render(scene.scene, scene.camera);
        const budget = KEEP04_VISUAL_PROFILE.budgets[props.quality];
        if (renderer.info.render.calls > budget.hardDraws || renderer.info.render.triangles > budget.hardTriangles) { failure(); return; }
        // Actual renderer submissions include shadow work; scene telemetry separately accounts unique buffers.
        const telemetry = scene.telemetry();
        host.dataset.drawCalls = String(renderer.info.render.calls); host.dataset.triangles = String(renderer.info.render.triangles);
        host.dataset.geometryBytes = String(telemetry.geometryBytes); host.dataset.textureBytes = String(telemetry.textureBytes);
        host.dataset.fallback = telemetry.fallback;
        if (active) request();
        if (current.current.onObservation) observe('frame', performance.now() - workStarted, now);
      } catch { failure(); }
    }
    function release(keepRecovery = false) {
      abort.abort(); if (frame) cancelAnimationFrame(frame); frame = 0; observer?.disconnect();
      listeners.splice(0).forEach(remove => remove()); runtime.current = null;
      scene?.dispose(); scene = undefined; bundle?.dispose(); bundle = undefined;
      renderer?.dispose();
      // A naturally lost context must be allowed to restore. Only retain its
      // canvas/restoration listener, never the retired scene, bundle or renderer.
      if (!keepRecovery) { renderer?.forceContextLoss(); renderer?.domElement.remove(); removeRecovery?.(); removeRecovery = undefined; recoveryCanvas?.remove(); }
      renderer = undefined;
      wrapper.current?.style.removeProperty('--keep04-scene-toolbar-height');
      observe(keepRecovery ? 'context-lost' : 'disposed');
    }
    function failure() { release(); set('fallback'); observe('fallback'); }
    function reconcile() {
      try {
        scene?.reconcile(current.current.visual);
        if (inspection && scene) {
          const visual = current.current.visual; const kind = visual.selectedKind;
          // Polls/draft motion need only check existence, not remeasure every mesh.
          const hasSite = kind && (visual.buildings.some(building => building.kind === kind) || visual.draft?.kind === kind);
          if (!hasSite) reset();
          else if (kind !== inspection.kind) inspect();
        }
        request();
      } catch { failure(); }
    }
    function resize() {
      const region = wrapper.current; const controls = toolbar.current;
      if (region && controls) region.style.setProperty('--keep04-scene-toolbar-height', `${controls.getBoundingClientRect().height}px`);
      if (!scene || !renderer) return;
      const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return;
      renderer.setSize(width, height, false); scene.resize(width, height);
      if (inspection) scene.fitSite(inspection.bounds, width / height);
      scene.camera.position.x += panX; scene.camera.position.z += panZ;
      scene.camera.updateMatrixWorld(true); request();
    }
    function reset() {
      inspection = null; setInspectedKind(null); panX = panZ = 0;
      if (scene) scene.camera.zoom = 1; resize();
    }
    function inspect() {
      const kind = current.current.visual.selectedKind; const bounds = scene?.selectedSiteBounds();
      if (!kind || !bounds || !scene) { reset(); return; }
      inspection = { kind, bounds }; setInspectedKind(kind); panX = panZ = 0; scene.camera.zoom = 1; resize();
    }
    function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, event: K, listener: (event: HTMLElementEventMap[K]) => void) {
      target.addEventListener(event, listener); listeners.push(() => target.removeEventListener(event, listener));
    }
    set('loading'); setInspectedKind(null);
    if ((import.meta.env.DEV && qaFault === 'webgl-unavailable') || typeof WebGL2RenderingContext === 'undefined') { set('fallback'); observe('fallback'); return () => { retired = true; release(); }; }
    async function initialize() {
      let loaded: InnerKeepRuntimeAssetBundle | undefined;
      try {
        activeLoaders = 1; observe('loading');
        loaded = await loadKeep04Assets({ quality: props.quality, reducedMotion: props.reducedMotion, signal: abort.signal });
        activeLoaders = 0;
        if (retired || abort.signal.aborted) return;
        if (loaded.failures.length) throw new Error('Keep graphics assets unavailable.');
        bundle = loaded; loaded = undefined;
        renderer = new THREE.WebGLRenderer({ antialias: props.quality === 'high', powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, { high: 1.75, balanced: 1.5, reduced: 1 }[props.quality]));
        renderer.shadowMap.enabled = props.quality === 'high'; renderer.shadowMap.type = THREE.PCFShadowMap;
        renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
        const canvas = renderer.domElement; canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
        canvas.setAttribute('aria-label', 'Verdant Citadel 3D grounds. Use the placement schematic for keyboard placement.'); canvas.setAttribute('role', 'img');
        host.appendChild(canvas);
        const contextLost = (event: Event) => { event.preventDefault(); if (retired || lost) return; lost = true; release(true); set('fallback'); };
        canvas.addEventListener('webglcontextlost', contextLost); listeners.push(() => canvas.removeEventListener('webglcontextlost', contextLost));
        const contextRestored = () => { if (retired || !lost) return; lost = false; setRecovery(value => value + 1); };
        recoveryCanvas = canvas;
        canvas.addEventListener('webglcontextrestored', contextRestored);
        removeRecovery = () => canvas.removeEventListener('webglcontextrestored', contextRestored);
        let pointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
        const pointers = new Map<number, { x: number; y: number }>();
        listen(canvas, 'pointerdown', event => {
          if (event.button !== 0) return;
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          if (pointers.size > 1) { if (pointer) pointer.dragged = true; }
          else pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
          canvas.setPointerCapture(event.pointerId);
        });
        listen(canvas, 'pointermove', event => {
          if (pointers.size > 1 && pointers.has(event.pointerId) && scene) {
            const before = [...pointers.values()]; const oldDistance = Math.hypot(before[0].x - before[1].x, before[0].y - before[1].y);
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const after = [...pointers.values()]; const distance = Math.hypot(after[0].x - after[1].x, after[0].y - after[1].y);
            if (oldDistance > 0 && distance > 0) { scene.camera.zoom = Math.max(.8, Math.min(2, scene.camera.zoom * distance / oldDistance)); scene.camera.updateProjectionMatrix(); request(); }
            return;
          }
          if (!pointer || !scene || pointer.id !== event.pointerId) return;
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
          if (!pointer.dragged && Math.hypot(dx, dy) < 6) return;
          pointer.dragged = true;
          const nextX = Math.max(-12, Math.min(12, panX - dx * .08)); const nextZ = Math.max(-12, Math.min(12, panZ - dy * .08));
          scene.camera.position.x += nextX - panX; scene.camera.position.z += nextZ - panZ;
          panX = nextX; panZ = nextZ; pointer.x = event.clientX; pointer.y = event.clientY; request();
        });
        listen(canvas, 'pointerup', event => {
          const click = pointers.size === 1 && pointer?.id === event.pointerId && !pointer.dragged
            && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) < 6;
          pointers.delete(event.pointerId);
          if (pointer?.id === event.pointerId || pointers.size === 0) pointer = null;
          if (!click || !scene) return;
          const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
          if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
          const x = (event.clientX - rect.left) / rect.width * 2 - 1; const y = 1 - (event.clientY - rect.top) / rect.height * 2;
          const kind = scene.pickBuilding(x, y); if (kind) { current.current.onSelect(kind); return; }
          const visual = current.current.visual;
          if (visual.draft && !visual.buildings.some(building => building.kind === visual.draft!.kind)) {
            const placement = scene.pickPlacement(x, y, visual.draft.kind);
            if (placement) current.current.onPlacement({ ...placement, rotation: visual.draft.rotation });
          }
        });
        const cancelPointer = () => { pointer = null; pointers.clear(); };
        listen(canvas, 'pointercancel', cancelPointer); listen(canvas, 'lostpointercapture', cancelPointer);
        const wheel = (event: WheelEvent) => { if (!scene) return; event.preventDefault(); scene.camera.zoom = Math.max(.8, Math.min(2, scene.camera.zoom * Math.exp(-event.deltaY * .001))); scene.camera.updateProjectionMatrix(); request(); };
        canvas.addEventListener('wheel', wheel, { passive: false }); listeners.push(() => canvas.removeEventListener('wheel', wheel));
        const visibility = () => { if (document.hidden) { if (frame) cancelAnimationFrame(frame); frame = 0; cancelPointer(); }
          else reconcile(); };
        document.addEventListener('visibilitychange', visibility); listeners.push(() => document.removeEventListener('visibilitychange', visibility));
        const sceneAssets = import.meta.env.DEV && qaFault === 'missing-model'
          ? { ...bundle, staticPrefabs: new Map([...bundle.staticPrefabs].filter(([id]) => id !== 'city-mill')) } : bundle;
        scene = createKeep04Scene({ quality: props.quality, reducedMotion: props.reducedMotion, assets: sceneAssets,
          ...(import.meta.env.DEV ? { qaVoxelFailure: qaFault === 'voxel-failure' } : {}) });
        runtime.current = { scene, request, reconcile, reset, inspect };
        scene.reconcile(current.current.visual);
        if (scene.telemetry().fallback === 'budget') throw new Error('Keep graphics budget exceeded.');
        observer = new ResizeObserver(resize); observer.observe(host);
        if (toolbar.current) observer.observe(toolbar.current, { box: 'border-box' });
        window.addEventListener('resize', resize); listeners.push(() => window.removeEventListener('resize', resize));
        resize(); set('webgl'); request();
      } catch { activeLoaders = 0; if (!retired && !abort.signal.aborted) failure(); }
      finally { activeLoaders = 0; loaded?.dispose(); if (retired) observe('disposed'); }
    }
    void initialize();
    return () => { retired = true; release(); };
  }, [props.quality, props.reducedMotion, recovery, import.meta.env.DEV ? props.qaFault : undefined]);
  useEffect(() => { runtime.current?.reconcile(); }, [props.visual]);
  function zoom(factor: number) { const active = runtime.current; if (!active) return; active.scene.camera.zoom = Math.max(.8, Math.min(2, active.scene.camera.zoom * factor)); active.scene.camera.updateProjectionMatrix(); active.request(); }
  const hasSite = props.visual.selectedKind !== null && (props.visual.buildings.some(building => building.kind === props.visual.selectedKind) || props.visual.draft?.kind === props.visual.selectedKind);
  return <section ref={wrapper} className="keep04-scene" aria-label="Verdant Citadel scene" tabIndex={-1} data-mode={mode}>
    <div ref={toolbar} className="keep04-scene-toolbar">
      <button type="button" aria-label="Zoom in" disabled={mode !== 'webgl'} onClick={() => zoom(1.2)}>+</button>
      <button type="button" aria-label="Zoom out" disabled={mode !== 'webgl'} onClick={() => zoom(1 / 1.2)}>−</button>
      <button type="button" disabled={mode !== 'webgl'} onClick={() => runtime.current?.reset()}>Fit grounds</button>
      <button type="button" disabled={mode !== 'webgl' || !hasSite} onClick={event => {
        runtime.current?.inspect(); wrapper.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' }); event.currentTarget.focus({ preventScroll: true });
      }}>Inspect selected site</button>
    </div>
    <div ref={element} className="keep04-scene-canvas" />
    {mode === 'loading' && <p role="status">Preparing the citadel. Placement controls remain available below.</p>}
    {mode === 'webgl' && <><p>{inspectedKind ? `Inspecting ${BUILDING_NAMES04[inspectedKind]}` : 'Whole grounds'} · Drag to pan · Scroll to zoom</p>
      {!hasSite && <p>Select a building or draft to inspect its site.</p>}
      <small>Existing pinned Hegemony models · Verdant Citadel composition and material treatment.</small></>}
  </section>;
}
