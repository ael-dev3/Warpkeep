import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { Building04 } from '../../../spacetimedb/gameplay04/policy';
import type { Placement04 } from '../../../spacetimedb/gameplay04/placement';
import type { InnerKeepRuntimeAssetBundle } from '../inner-keep/loadInnerKeepRuntimeAssets';
import { createKeep04Scene, type Scene04, type VisualState04 } from './createKeep04Scene';
import { loadKeep04Assets } from './loadKeep04Assets';
import type { Quality04 } from './keep04VisualProfile';

export type Keep04SceneHostProps = Readonly<{
  visual: VisualState04; quality: Quality04; reducedMotion: boolean;
  onSelect: (kind: Building04) => void; onPlacement: (placement: Placement04) => void;
  onMode: (mode: 'loading' | 'webgl' | 'fallback') => void;
}>;

export function Keep04SceneHost(props: Keep04SceneHostProps) {
  const element = useRef<HTMLDivElement>(null); const current = useRef(props); current.current = props;
  const runtime = useRef<{ scene: Scene04; request: () => void; reset: () => void } | null>(null);
  const [mode, setMode] = useState<'loading' | 'webgl' | 'fallback'>('loading');
  useEffect(() => {
    const host = element.current!; const abort = new AbortController();
    let retired = false; let renderer: THREE.WebGLRenderer | undefined; let scene: Scene04 | undefined;
    let bundle: InnerKeepRuntimeAssetBundle | undefined; let frame = 0; let last = -Infinity;
    let observer: ResizeObserver | undefined; const listeners: Array<() => void> = [];
    const set = (value: typeof mode) => { if (!retired) { setMode(value); current.current.onMode(value); } };
    function request() { if (!retired && !document.hidden && !frame && scene) frame = requestAnimationFrame(draw); }
    function draw(now: number) {
      frame = 0; if (retired || document.hidden || !scene || !renderer) return;
      const interval = 1000 / ({ high: 30, balanced: 24, reduced: 15 }[props.quality]);
      if (now - last < interval) { request(); return; }
      last = now; const active = scene.update(now / 1000);
      renderer.render(scene.scene, scene.camera);
      // Actual renderer submissions include shadow work; scene telemetry separately accounts unique buffers.
      const telemetry = scene.telemetry();
      host.dataset.drawCalls = String(renderer.info.render.calls); host.dataset.triangles = String(renderer.info.render.triangles);
      host.dataset.geometryBytes = String(telemetry.geometryBytes); host.dataset.textureBytes = String(telemetry.textureBytes);
      host.dataset.fallback = telemetry.fallback;
      if (active) request();
    }
    function release() {
      abort.abort(); if (frame) cancelAnimationFrame(frame); frame = 0; observer?.disconnect();
      listeners.splice(0).forEach(remove => remove()); runtime.current = null;
      scene?.dispose(); scene = undefined; bundle?.dispose(); bundle = undefined;
      renderer?.dispose(); renderer?.forceContextLoss(); renderer?.domElement.remove(); renderer = undefined;
    }
    function failure() { release(); set('fallback'); }
    function listen<K extends keyof HTMLElementEventMap>(target: HTMLElement, event: K, listener: (event: HTMLElementEventMap[K]) => void) {
      target.addEventListener(event, listener); listeners.push(() => target.removeEventListener(event, listener));
    }
    set('loading');
    if (typeof WebGL2RenderingContext === 'undefined') { set('fallback'); return () => { retired = true; abort.abort(); }; }
    try {
      renderer = new THREE.WebGLRenderer({ antialias: props.quality === 'high', powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, props.quality === 'high' ? 1.5 : 1));
      renderer.shadowMap.enabled = props.quality === 'high'; renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
      const canvas = renderer.domElement; canvas.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
      canvas.setAttribute('aria-label', 'Verdant Citadel 3D grounds. Use the placement schematic for keyboard placement.'); canvas.setAttribute('role', 'img');
      host.appendChild(canvas);
      const contextLost = (event: Event) => { event.preventDefault(); failure(); };
      canvas.addEventListener('webglcontextlost', contextLost); listeners.push(() => canvas.removeEventListener('webglcontextlost', contextLost));
      let pointer: { id: number; x: number; y: number; dragged: boolean } | null = null;
      let panX = 0; let panZ = 0;
      listen(canvas, 'pointerdown', event => { pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false }; canvas.setPointerCapture(event.pointerId); });
      listen(canvas, 'pointermove', event => {
        if (!pointer || !scene || pointer.id !== event.pointerId) return;
        const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y;
        if (!pointer.dragged && Math.hypot(dx, dy) < 6) return;
        pointer.dragged = true;
        const nextX = Math.max(-12, Math.min(12, panX - dx * .08)); const nextZ = Math.max(-12, Math.min(12, panZ - dy * .08));
        scene.camera.position.x += nextX - panX; scene.camera.position.z += nextZ - panZ;
        panX = nextX; panZ = nextZ; pointer.x = event.clientX; pointer.y = event.clientY; request();
      });
      listen(canvas, 'pointerup', event => {
        const click = pointer && !pointer.dragged; pointer = null;
        if (!click || !scene) return;
        const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
        const x = (event.clientX - rect.left) / rect.width * 2 - 1; const y = 1 - (event.clientY - rect.top) / rect.height * 2;
        const kind = scene.pickBuilding(x, y); if (kind) { current.current.onSelect(kind); return; }
        const visual = current.current.visual;
        if (visual.draft && !visual.buildings.some(building => building.kind === visual.draft!.kind)) {
          const placement = scene.pickPlacement(x, y, visual.draft.kind);
          if (placement) current.current.onPlacement({ ...placement, rotation: visual.draft.rotation });
        }
      });
      listen(canvas, 'pointercancel', () => { pointer = null; });
      const wheel = (event: WheelEvent) => { if (!scene) return; event.preventDefault(); scene.camera.zoom = Math.max(.8, Math.min(2, scene.camera.zoom * Math.exp(-event.deltaY * .001))); scene.camera.updateProjectionMatrix(); request(); };
      canvas.addEventListener('wheel', wheel, { passive: false }); listeners.push(() => canvas.removeEventListener('wheel', wheel));
      const visibility = () => { if (document.hidden && frame) { cancelAnimationFrame(frame); frame = 0; } else request(); };
      document.addEventListener('visibilitychange', visibility); listeners.push(() => document.removeEventListener('visibilitychange', visibility));
      void loadKeep04Assets({ quality: props.quality, reducedMotion: props.reducedMotion, signal: abort.signal }).then(loaded => {
        if (retired || abort.signal.aborted) { loaded.dispose(); return; }
        bundle = loaded;
        try {
          scene = createKeep04Scene({ quality: props.quality, reducedMotion: props.reducedMotion, assets: bundle });
          const resize = () => { if (!scene || !renderer) return; const width = host.clientWidth; const height = host.clientHeight; if (!width || !height) return;
            renderer.setSize(width, height, false); scene.resize(width, height); panX = panZ = 0; request(); };
          runtime.current = { scene, request, reset: () => { if (scene) scene.camera.zoom = 1; resize(); } };
          scene.reconcile(current.current.visual); observer = new ResizeObserver(resize); observer.observe(host); resize(); set('webgl'); request();
        } catch { failure(); }
      }, () => { if (!retired && !abort.signal.aborted) failure(); });
    } catch { failure(); }
    return () => { retired = true; release(); };
  }, [props.quality, props.reducedMotion]);
  useEffect(() => { runtime.current?.scene.reconcile(props.visual); runtime.current?.request(); }, [props.visual]);
  function zoom(factor: number) { const active = runtime.current; if (!active) return; active.scene.camera.zoom = Math.max(.8, Math.min(2, active.scene.camera.zoom * factor)); active.scene.camera.updateProjectionMatrix(); active.request(); }
  return <section aria-label="Verdant Citadel scene" data-mode={mode}>
    <div ref={element} style={{ position: 'relative', width: '100%', height: mode === 'fallback' ? 0 : 'clamp(220px, 43vw, 620px)', overflow: 'hidden', borderRadius: 8, background: '#a3b3a1' }} />
    {mode === 'loading' && <p role="status">Preparing the citadel. Placement controls remain available below.</p>}
    {mode === 'webgl' && <><p style={{ marginTop: 10 }}>Verdant Citadel · Drag to pan · Scroll to zoom</p><div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" aria-label="Zoom in" onClick={() => zoom(1.2)}>+</button><button type="button" aria-label="Zoom out" onClick={() => zoom(1 / 1.2)}>−</button>
      <button type="button" onClick={() => runtime.current?.reset()}>Fit grounds</button>
    </div><small>Existing pinned Hegemony models · Verdant Citadel composition and material treatment.</small></>}
  </section>;
}
