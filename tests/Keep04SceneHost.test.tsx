import '@testing-library/jest-dom/vitest';
import { useEffect, useState } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Keep04SceneHost, type Keep04SceneHostProps, type Keep04Observation } from '../src/components/keep04/Keep04SceneHost';
import * as loader from '../src/components/keep04/loadKeep04Assets';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import { PtrGameplay04SurfaceHost } from '../src/ptr/PtrGameplay04SurfaceHost';
import { createPtrRealmAuthClient } from '../src/ptr/ptrRealmAuthClient';
import { connectPtrRealm, createPtrGameplay04Capability, closePtrRealmConnectionSession, type PtrRealmConnectionBuilder, type PtrRealmConnectionLike } from '../src/ptr/ptrRealmConnection';
import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE as fixture } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type { GreaterRealmClientSnapshot } from '../src/greater-realm/greaterRealmClientRuntime';
import type { AvailableGreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';
import { ATLAS04, constructingWire04, freshWire04, MILL_PLACEMENT04, scriptedCapability04, wireWithBuilding04 } from './fixtures/gameplay04Client';
import { useGameplay04Controller } from '../src/ptr/gameplay04/useGameplay04Controller';
import { Keep04Screen, type Keep04UiSelection } from '../src/components/keep04/Keep04Screen';

// Only the external request and GPU/browser boundary are doubled. Real host and scene own their lifetimes.
vi.mock('three', async original => ({ ...await original<typeof import('three')>(), WebGLRenderer: vi.fn() }));
vi.mock('../src/farcaster/miniapp', () => ({ useMiniAppHost: () => ({ isMiniApp: true }), useMiniAppBackNavigation: () => {} }));
vi.mock('../src/components/realm/createGreaterRealmWorldCanvasHost', () => ({ createGreaterRealmWorldCanvasHost: () => {
  active++; maximum = Math.max(maximum, active);
  return { applySnapshot() {}, updatePolicy() {}, dispose() { active--; } };
} }));
const bundle = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
let queued: Map<number, FrameRequestCallback>; let sequence: number; let active: number; let maximum: number;
let renderers: RendererBoundary[]; let hidden: boolean; let observers: number;
class RendererBoundary {
  domElement = document.createElement('canvas'); shadowMap = {}; info = { render: { calls: 0, triangles: 0 }, memory: { geometries: 7, textures: 2 } };
  ratio = 0; disposed = false; scenes: THREE.Scene[] = []; camera: THREE.OrthographicCamera | undefined;
  constructor() { active++; maximum = Math.max(maximum, active); renderers.push(this); }
  setPixelRatio(value: number) { this.ratio = value; } setSize() {} forceContextLoss() {}
  dispose() { expect(this.disposed).toBe(false); this.disposed = true; active--; }
  render(scene: THREE.Scene, camera: THREE.OrthographicCamera) { expect(this.disposed).toBe(false); this.scenes.push(scene); this.camera = camera; }
}
const props = (): Keep04SceneHostProps => ({ visual: { buildings: [], selectedKind: 'city-mill', draft: { kind: 'city-mill', x: -24_000_000n, z: -20_000_000n, rotation: 90_000 }, draftValid: true }, quality: 'balanced', reducedMotion: false, onMode: vi.fn(), onPlacement: vi.fn(), onSelect: vi.fn() });
function tick(time = 0) { const callbacks = [...queued.values()]; queued.clear(); act(() => callbacks.forEach(callback => callback(time))); }
function pointer(canvas: HTMLCanvasElement, type: string, id: number, x: number, y: number) {
  const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0 }); fireEvent(canvas, event);
}
beforeEach(() => {
  vi.clearAllMocks();
  queued = new Map(); sequence = 0; active = 0; maximum = 0; renderers = []; hidden = false; observers = 0;
  vi.stubGlobal('WebGL2RenderingContext', class {});
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { queued.set(++sequence, callback); return sequence; });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => queued.delete(id));
  vi.stubGlobal('ResizeObserver', class { connected = false; observe() { if (!this.connected) observers++; this.connected = true; } disconnect() { if (this.connected) observers--; this.connected = false; } });
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => hidden ? 'hidden' : 'visible');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
  vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3);
  vi.spyOn(HTMLCanvasElement.prototype, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, x: 0, y: 0, toJSON() {} });
  Object.defineProperty(HTMLCanvasElement.prototype, 'setPointerCapture', { configurable: true, value() {} });
  vi.mocked(THREE.WebGLRenderer).mockImplementation(function () { return new RendererBoundary() as unknown as THREE.WebGLRenderer; });
  vi.spyOn(loader, 'loadKeep04Assets').mockImplementation(async () => bundle());
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function occupiedProps(x = -24_000_000n): Keep04SceneHostProps {
  const initial = props();
  return { ...initial, visual: { buildings: [{ kind: 'city-mill', placement: { ...initial.visual.draft!, x, rotation: 0 },
    completedLevel: 1, targetLevel: 1, phase: 'complete', startsAtMicros: null, completesAtMicros: null }], selectedKind: 'city-mill', draft: null, draftValid: true } };
}
const cameraState = (camera: THREE.OrthographicCamera) => ({ position: camera.position.toArray(), quaternion: camera.quaternion.toArray(),
  zoom: camera.zoom, left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom });
function expectEntrySitesVisible(camera: THREE.OrthographicCamera, x: number) {
  for (const [px, py, pz] of [[x - 5.65, 0, -24.75], [x + 5.65, 9, -15.25], [-6.5, 4.6, 34.8], [6.5, 0, 32.2], [-5, 0, -3]]) {
    const point = new THREE.Vector3(px, py, pz).project(camera);
    expect(Math.abs(point.x)).toBeLessThan(1); expect(Math.abs(point.y)).toBeLessThan(1);
  }
}

it('frames the latest occupied sites after delayed assets, leaving Fit grounds explicit', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(342);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(304);
  const pending = deferred<InnerKeepRuntimeAssetBundle>(); vi.mocked(loader.loadKeep04Assets).mockReturnValueOnce(pending.promise);
  const options = occupiedProps(30_000_000n); const mounted = render(<Keep04SceneHost {...options} />);
  const latest = occupiedProps(); mounted.rerender(<Keep04SceneHost {...latest} />);
  await act(async () => { pending.resolve(bundle()); }); tick();
  const camera = renderers[0].camera!;
  expect(screen.getByText(/^Your settlement/)).toBeVisible(); expectEntrySitesVisible(camera, -24);
  const entry = cameraState(camera); fireEvent.click(screen.getByRole('button', { name: 'Fit grounds' }));
  expect(screen.getByText(/^Whole grounds/)).toBeVisible(); expect(camera.top).toBeGreaterThan(entry.top);
  const grounds = cameraState(camera); mounted.rerender(<Keep04SceneHost {...occupiedProps(30_000_000n)} />); fireEvent.resize(window);
  expect(cameraState(camera)).toEqual(grounds);
  expect(loader.loadKeep04Assets).toHaveBeenCalledOnce(); expect(latest.onSelect).not.toHaveBeenCalled(); expect(latest.onPlacement).not.toHaveBeenCalled();
});

it('defers entry framing at zero size and uses the latest reconciled occupancy when visible', async () => {
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(0);
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(0);
  const mounted = render(<Keep04SceneHost {...occupiedProps()} />); await act(async () => {}); tick();
  expect(screen.queryByText(/^Your settlement/)).toBeNull();
  const initial = cameraState(renderers[0].camera!);
  mounted.rerender(<Keep04SceneHost {...occupiedProps(30_000_000n)} />); fireEvent.resize(window);
  expect(cameraState(renderers[0].camera!)).toEqual(initial);
  width.mockReturnValue(342); height.mockReturnValue(304); fireEvent.resize(window); tick(100);
  expect(screen.getByText(/^Your settlement/)).toBeVisible(); expectEntrySitesVisible(renderers[0].camera!, 30);
});

it('keeps an empty entry on grounds when a first building or draft arrives', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(342);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(304);
  const mounted = render(<Keep04SceneHost {...props()} />); await act(async () => {}); tick();
  const camera = renderers[0].camera!; const grounds = cameraState(camera);
  mounted.rerender(<Keep04SceneHost {...occupiedProps()} />); fireEvent.resize(window);
  expect(cameraState(camera)).toEqual(grounds); expect(screen.getByText(/^Whole grounds/)).toBeVisible();
});

it.each(['entry', 'grounds', 'inspection'] as const)('preserves %s framing, manual pan and zoom through refresh, orientation and renderer reconstruction', async mode => {
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(342);
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(304);
  const options = occupiedProps(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {}); tick();
  const caption = mode === 'entry' ? /^Your settlement/ : mode === 'grounds' ? /^Whole grounds/ : /^Inspecting City Mill/;
  if (mode === 'grounds') fireEvent.click(screen.getByRole('button', { name: 'Fit grounds' }));
  if (mode === 'inspection') fireEvent.click(screen.getByRole('button', { name: 'Inspect selected site' }));
  expect(screen.getByText(caption)).toBeVisible();
  const canvas = mounted.container.querySelector('canvas')!;
  pointer(canvas, 'pointerdown', 1, 100, 100); pointer(canvas, 'pointermove', 1, 160, 140); pointer(canvas, 'pointerup', 1, 160, 140);
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  const before = cameraState(renderers[0].camera!);
  const next = { ...options, visual: { ...options.visual, draft: { kind: 'lumber-camp' as const, x: 35_000_000n, z: 25_000_000n, rotation: 0 },
    buildings: options.visual.buildings.map(building => ({ ...building, completedLevel: 5, targetLevel: 5 })) } };
  mounted.rerender(<Keep04SceneHost {...next} />); fireEvent(document, new Event('visibilitychange'));
  expect(cameraState(renderers[0].camera!)).toEqual(before);
  width.mockReturnValue(796); height.mockReturnValue(144); fireEvent.resize(window);
  expect(renderers[0].camera!.position.toArray()).toEqual(before.position); expect(renderers[0].camera!.zoom).toBe(before.zoom);
  width.mockReturnValue(342); height.mockReturnValue(304); fireEvent.resize(window);
  expect(cameraState(renderers[0].camera!)).toEqual(before);
  mounted.rerender(<Keep04SceneHost {...next} quality="reduced" reducedMotion />); await act(async () => {}); tick(1000);
  expect(cameraState(renderers[1].camera!)).toEqual(before); expect(screen.getByText(caption)).toBeVisible();
  const replacement = mounted.container.querySelector('canvas')!;
  fireEvent(replacement, new Event('webglcontextlost', { cancelable: true }));
  fireEvent(replacement, new Event('webglcontextrestored')); await act(async () => {}); tick(2000);
  expect(cameraState(renderers[2].camera!)).toEqual(before); expect(screen.getByText(caption)).toBeVisible();
  expect(maximum).toBe(1); expect(options.onPlacement).not.toHaveBeenCalled(); expect(options.onSelect).not.toHaveBeenCalled();
  mounted.unmount(); expect(active).toBe(0); expect(queued.size).toBe(0); expect(observers).toBe(0);
});

// Real hook, controller, screen, scene host and scene; only SDK replies/assets/GPU
// are fixtures. Holding a poll prevents React batching from hiding its lifecycle.
function refreshHarness(wire = freshWire04()) {
  const scripted = scriptedCapability04();
  scripted.read.mockImplementation(async () => wire);
  let current!: ReturnType<typeof useGameplay04Controller>;
  function Harness() {
    const state = useGameplay04Controller(scripted.capability); current = state;
    const [selection, onSelectionChange] = useState<Keep04UiSelection>({ panel: 'buildings', selectedKind: 'city-mill', draft: MILL_PLACEMENT04 });
    useEffect(() => state.controller.setAtlas(ATLAS04), [state.controller]);
    return <Keep04Screen {...state} selection={selection} onSelectionChange={onSelectionChange}
      onBack={vi.fn()} quality="balanced" reducedMotion={false} onFindResources={vi.fn()} onReturnToWorld={vi.fn()} />;
  }
  return { ...scripted, mounted: render(<Harness />), current: () => current };
}

it.each(['poll', 'focus'] as const)('retains the real keep scene and focus through a held healthy %s refresh while commands stay disabled', async trigger => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const h = refreshHarness(wire); await act(async () => {}); tick();
  const canvas = h.mounted.container.querySelector('canvas')!;
  const originalScene = renderers[0].scenes[0];
  const control = screen.getByRole('application', { name: 'Keep placement schematic' }); control.focus();
  const confirm = screen.getByRole('button', { name: 'Confirm placement' }); expect(confirm).toBeEnabled();
  const response = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(response.promise);
  if (trigger === 'poll') await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  else act(() => { window.dispatchEvent(new Event('focus')); });
  expect(h.read).toHaveBeenCalledTimes(2);
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas);
  expect(control).toHaveFocus(); expect(confirm).toBeDisabled();
  expect(screen.getByText('Refreshing keep from the Realm… Commands are temporarily unavailable.')).toBeVisible();
  await act(async () => { await h.current().controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: ATLAS04.revision }); });
  fireEvent.click(confirm); expect(h.mutate).not.toHaveBeenCalled();
  expect(loader.loadKeep04Assets).toHaveBeenCalledTimes(1); expect(renderers).toHaveLength(1);
  await act(async () => { response.resolve(wire); }); tick(5000);
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas); expect(control).toHaveFocus(); expect(confirm).toBeEnabled();
  expect(renderers[0].scenes.at(-1)).toBe(originalScene); expect(loader.loadKeep04Assets).toHaveBeenCalledTimes(1);
  h.mounted.unmount(); expect(active).toBe(0); expect(queued.size).toBe(0); expect(observers).toBe(0);
});

it.each(['failed', 'malformed', 'expired'] as const)('retires the retained presentation when an in-flight refresh is %s', async outcome => {
  const h = refreshHarness(); await act(async () => {}); tick();
  const control = screen.getByRole('application', { name: 'Keep placement schematic' }); control.focus();
  const response = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(response.promise);
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(h.mounted.container.querySelector('canvas')).not.toBeNull();
  await act(async () => {
    if (outcome === 'failed') response.reject(new Error('network unavailable'));
    else {
      if (outcome === 'expired') h.expire();
      response.resolve(outcome === 'malformed' ? { ...freshWire04(), food: -1n } : freshWire04());
    }
  });
  expect(h.current().snapshot.phase).toBe(outcome === 'expired' ? 'disposed' : 'failed');
  expect(h.mounted.container.querySelector('canvas')).toBeNull(); expect(active).toBe(0);
  expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
  expect(screen.queryByRole('button', { name: 'Confirm placement' })).not.toBeInTheDocument();
  await act(async () => { await h.current().controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: ATLAS04.revision }); });
  expect(h.mutate).not.toHaveBeenCalled();
  if (outcome === 'expired') expect(h.current().snapshot.view).toBeNull();
  else {
    // A failed refresh cannot use its stale view to claim healthy refresh state.
    const retry = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(retry.promise);
    act(() => { window.dispatchEvent(new Event('focus')); });
    expect(h.current().snapshot.phase).toBe('loading'); expect(h.mounted.container.querySelector('canvas')).toBeNull();
    await act(async () => { retry.resolve(freshWire04()); });
    expect(h.current().snapshot.phase).toBe('ready'); expect(h.mounted.container.querySelector('canvas')).not.toBeNull();
  }
});

it('retains the pending scene with commands blocked and retires it when the outcome becomes uncertain', async () => {
  const h = refreshHarness(); await act(async () => {}); tick();
  const canvas = h.mounted.container.querySelector('canvas');
  const control = screen.getByRole('application', { name: 'Keep placement schematic' }); control.focus();
  const mutation = deferred<{ sequence: bigint; revision: bigint }>(); h.mutate.mockReturnValueOnce(mutation.promise);
  let work!: Promise<void>;
  act(() => { work = h.current().controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: ATLAS04.revision }); });
  expect(h.current().snapshot.phase).toBe('pending'); expect(h.mounted.container.querySelector('canvas')).toBe(canvas);
  expect(control).toHaveFocus(); expect(screen.getByRole('button', { name: 'Confirm placement' })).toBeDisabled();
  expect(screen.getByText(/Request pending/)).toBeVisible();
  await act(async () => { await h.current().controller.submit({ kind: 'recall', workerOrdinal: 1, atlasRevision: ATLAS04.revision }); });
  expect(h.mutate).toHaveBeenCalledTimes(1); expect(renderers).toHaveLength(1);
  await act(async () => { mutation.reject(new Error('unknown outcome')); await work; });
  expect(h.mounted.container.querySelector('canvas')).toBeNull(); expect(active).toBe(0);
  expect(screen.getByRole('button', { name: 'Back' })).toHaveFocus();
  const captured = h.mutate.mock.calls[0][0];
  const response = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(response.promise);
  act(() => { window.dispatchEvent(new Event('focus')); });
  expect(h.current().snapshot.phase).toBe('uncertain'); expect(h.mounted.container.querySelector('canvas')).toBeNull();
  await act(async () => { response.resolve({ ...freshWire04(), revision: 2n, lastAcceptedSequence: 2n }); });
  expect(h.current().snapshot.phase).toBe('uncertain'); expect(h.mutate).toHaveBeenCalledTimes(1);
  h.read.mockResolvedValueOnce({ ...freshWire04(), revision: 2n, lastAcceptedSequence: 2n });
  await act(async () => { await h.current().controller.retryPending(); });
  expect(h.mutate.mock.calls[1][0]).toBe(captured); expect(h.current().snapshot.phase).toBe('ready');
});

it('retains one scene through a held build and receipt, showing the new project only after the confirmed read', async () => {
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(342);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(304);
  const wire = freshWire04(); Object.assign(wire, { food: 1000n, wood: 1000n, stone: 1000n, gold: 1000n });
  const h = refreshHarness(wire); await act(async () => {}); tick();
  const canvas = h.mounted.container.querySelector('canvas'); const originalScene = renderers[0].scenes[0];
  const framing = cameraState(renderers[0].camera!);
  const resources = screen.getByRole('region', { name: 'Resources' });
  const panel = screen.getByRole('complementary', { name: 'Command panel' });
  const mutation = deferred<{ sequence: bigint; revision: bigint }>(); h.mutate.mockReturnValueOnce(mutation.promise);
  const response = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(response.promise);
  const confirm = screen.getByRole('button', { name: 'Confirm placement' }); confirm.focus(); fireEvent.click(confirm);
  expect(h.current().snapshot.phase).toBe('pending'); expect(confirm).toBeDisabled();
  expect(cameraState(renderers[0].camera!)).toEqual(framing);
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas); expect(confirm).toHaveFocus();
  expect(resources).toBeVisible(); expect(within(resources).getAllByText('1000')).toHaveLength(4);
  expect(screen.queryByText('Under construction')).not.toBeInTheDocument();
  fireEvent.click(confirm);
  await act(async () => { await h.current().controller.submit({ kind: 'recall', workerOrdinal: 0, atlasRevision: ATLAS04.revision }); });
  expect(h.mutate).toHaveBeenCalledTimes(1);
  await act(async () => { mutation.resolve({ sequence: 2n, revision: 2n }); }); tick(100);
  expect(h.current().snapshot.phase).toBe('pending'); expect(within(resources).getAllByText('1000')).toHaveLength(4);
  expect(cameraState(renderers[0].camera!)).toEqual(framing);
  expect(originalScene.getObjectByName('project:city-mill')).toBeUndefined();
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas);
  const confirmed = constructingWire04();
  Object.assign(confirmed, { revision: 2n, lastAcceptedSequence: 2n, food: 980n, wood: 960n, stone: 980n, gold: 1000n });
  await act(async () => { response.resolve(confirmed); }); tick(200);
  expect(h.current().snapshot.phase).toBe('ready');
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas);
  expect(screen.getByRole('complementary', { name: 'Command panel' })).toBe(panel);
  expect(renderers).toHaveLength(1); expect(renderers[0].scenes.at(-1)).toBe(originalScene);
  expect(loader.loadKeep04Assets).toHaveBeenCalledTimes(1);
  expect(originalScene.getObjectByName('project:city-mill')).toBeDefined();
  fireEvent.resize(window); expect(cameraState(renderers[0].camera!)).toEqual(framing);
  expect(within(resources).getByLabelText('Food: 980 available')).toBeVisible();
  expect(within(screen.getByRole('article', { name: 'City Mill' })).getByText('Under construction')).toBeVisible();
  expect(screen.queryByRole('button', { name: 'Confirm placement' })).not.toBeInTheDocument();
  expect(h.mutate).toHaveBeenCalledTimes(1);
  h.mounted.unmount(); expect(active).toBe(0); expect(queued.size).toBe(0); expect(observers).toBe(0);
});

it('reconciles an authoritative construction completion and its reveal in the same scene after polling', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(342);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(304);
  const h = refreshHarness(constructingWire04()); await act(async () => {}); tick();
  const canvas = h.mounted.container.querySelector('canvas'); const originalScene = renderers[0].scenes[0];
  const framing = cameraState(renderers[0].camera!);
  expect(originalScene.getObjectByName('project:city-mill')).toBeDefined();
  const response = deferred<ReturnType<typeof freshWire04>>(); h.read.mockReturnValueOnce(response.promise);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(h.mounted.container.querySelector('canvas')).toBe(canvas);
  const complete = wireWithBuilding04(); complete.revision = 2n;
  await act(async () => { response.resolve(complete); }); tick(5000);
  expect(renderers).toHaveLength(1); expect(renderers[0].scenes.at(-1)).toBe(originalScene);
  expect(originalScene.getObjectByName('project:city-mill')).toBeUndefined();
  const mill = originalScene.getObjectByName('building:city-mill')!;
  expect(mill.scale.x).toBeCloseTo(.94); tick(5500); expect(mill.scale.x).toBe(1);
  fireEvent.resize(window); expect(cameraState(renderers[0].camera!)).toEqual(framing);
  expect(loader.loadKeep04Assets).toHaveBeenCalledTimes(1); expect(h.mutate).not.toHaveBeenCalled();
});

it('inspects explicitly, retains zoom through resize and draft edits, and resets without loading another scene', async () => {
  const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(796);
  const height = vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(144);
  const current = props(); const mounted = render(<Keep04SceneHost {...current} />); await act(async () => {}); tick();
  const camera = renderers[0].camera!; const overview = camera.position.clone();
  const inspect = screen.getByRole('button', { name: 'Inspect selected site' }); fireEvent.click(inspect); tick(100);
  expect(camera.top).toBe(12); expect(camera.position.equals(overview)).toBe(false); expect(inspect).toHaveFocus();
  fireEvent.click(screen.getByRole('button', { name: 'Zoom in' })); expect(camera.zoom).toBe(1.2);
  const inspectedPosition = camera.position.clone();
  mounted.rerender(<Keep04SceneHost {...current} visual={{ ...current.visual, draft: { ...current.visual.draft!, x: -10_000_000n } }} />);
  expect(camera.position.equals(inspectedPosition)).toBe(true);
  fireEvent.resize(window); expect(camera.zoom).toBe(1.2); expect(camera.position.equals(inspectedPosition)).toBe(true);
  fireEvent.click(inspect); expect(camera.zoom).toBe(1); expect(camera.position.equals(inspectedPosition)).toBe(false);
  const canvas = mounted.container.querySelector('canvas')!;
  pointer(canvas, 'pointerdown', 1, 100, 100); pointer(canvas, 'pointermove', 1, 200, 150); pointer(canvas, 'pointerup', 1, 200, 150);
  const panned = camera.position.clone(); fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
  width.mockReturnValue(342); height.mockReturnValue(220); fireEvent.resize(window);
  expect(camera.zoom).toBe(1.2); expect(camera.position.distanceTo(panned)).toBeLessThan(1e-10);
  expect(camera.right / camera.top).toBeCloseTo(342 / 220);
  width.mockReturnValue(796); height.mockReturnValue(144); fireEvent.resize(window);
  expect(camera.position.distanceTo(panned)).toBeLessThan(1e-10); expect(camera.zoom).toBe(1.2);
  mounted.rerender(<Keep04SceneHost {...current} visual={{ ...current.visual, selectedKind: 'lumber-camp', draft: { ...current.visual.draft!, kind: 'lumber-camp', x: 20_000_000n } }} />);
  expect(screen.getByText(/Inspecting Lumber Camp/)).toBeVisible(); expect(camera.zoom).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Fit grounds' })); expect(camera.position.equals(overview)).toBe(true);
  expect(mounted.container.querySelectorAll('canvas')).toHaveLength(1); expect(loader.loadKeep04Assets).toHaveBeenCalledOnce();
  expect(current.onPlacement).not.toHaveBeenCalled(); expect(current.onSelect).not.toHaveBeenCalled();
  mounted.unmount(); expect(observers).toBe(0); expect(queued.size).toBe(0);
});

it('measures the real scene toolbar, retires resize ownership on loss, and keeps unavailable inspection disabled', async () => {
  const mounted = render(<Keep04SceneHost {...props()} />); await act(async () => {});
  const region = screen.getByRole('region', { name: 'Verdant Citadel scene' });
  const controls = screen.getByRole('button', { name: 'Fit grounds' }).parentElement!;
  const bounds = vi.spyOn(controls, 'getBoundingClientRect').mockReturnValue({ height: 103.5 } as DOMRect);
  fireEvent.resize(window); expect(region.style.getPropertyValue('--keep04-scene-toolbar-height')).toBe('103.5px');
  expect(controls.compareDocumentPosition(mounted.container.querySelector('canvas')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  mounted.rerender(<Keep04SceneHost {...props()} visual={{ buildings: [], selectedKind: null, draft: null, draftValid: false }} />);
  expect(screen.getByRole('button', { name: 'Inspect selected site' })).toBeDisabled();
  fireEvent(mounted.container.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }));
  expect(screen.getByRole('button', { name: 'Inspect selected site' })).toBeDisabled();
  expect(region.style.getPropertyValue('--keep04-scene-toolbar-height')).toBe('');
  bounds.mockClear(); fireEvent.resize(window); expect(bounds).not.toHaveBeenCalled(); expect(observers).toBe(0);
});

it('observes actual renderer counters, retains the restore listener on loss, and reports final cleanup without invented GPU zeros', async () => {
  const observations: Keep04Observation[] = [];
  const mounted = render(<Keep04SceneHost {...props()} onObservation={value => observations.push(value)} />);
  await act(async () => {});
  Object.assign(renderers[0].info.render, { calls: 37, triangles: 1234 }); tick(42);
  expect(observations.at(-1)).toMatchObject({ event: 'frame', timestampMs: 42, renderCalls: 37, renderTriangles: 1234, rendererGeometries: 7, rendererTextures: 2 });
  expect(observations.at(-1)!.voxelPreparationMs).toBeGreaterThanOrEqual(0);
  fireEvent(mounted.container.querySelector('canvas')!, new Event('webglcontextlost', { cancelable: true }));
  expect(observations.at(-1)).toMatchObject({ event: 'context-lost', activeListeners: 1, pendingRafs: 0, renderCalls: null, rendererGeometries: null });
  mounted.unmount();
  expect(observations.at(-1)).toMatchObject({ event: 'disposed', activeListeners: 0, pendingRafs: 0, activeLoaders: 0, rendererTextures: null });
  for (const value of observations) for (const [key, field] of Object.entries(value)) {
    if (key !== 'event' && field !== null) expect(typeof field === 'number' && Number.isFinite(field) && field >= 0).toBe(true);
  }
  expect(JSON.stringify(observations)).not.toMatch(/requestKey|identity|jwt|atlas|token/i);
});

it('isolates observer failure from frames and disposal', async () => {
  const mounted = render(<Keep04SceneHost {...props()} onObservation={() => { throw new Error('Observer failed'); }} />);
  await act(async () => {}); expect(() => tick()).not.toThrow();
  expect(renderers[0].scenes.length).toBe(1); expect(() => mounted.unmount()).not.toThrow();
  expect(active).toBe(0); expect(queued.size).toBe(0); expect(observers).toBe(0);
});

it('reports no active loader once an asset request rejects', async () => {
  vi.mocked(loader.loadKeep04Assets).mockRejectedValue(new Error('Unavailable'));
  const observations: Keep04Observation[] = [];
  render(<Keep04SceneHost {...props()} onObservation={value => observations.push(value)} />);
  await act(async () => {});
  expect(observations.at(-1)).toMatchObject({ event: 'fallback', activeLoaders: 0, activeListeners: 0, pendingRafs: 0 });
});

it.each(['missing-model', 'voxel-failure', 'webgl-unavailable'] as const)('exercises the fixed DEV graphics fault %s without changing commands', async qaFault => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} qaFault={qaFault} />);
  await act(async () => {}); tick();
  if (qaFault === 'webgl-unavailable') expect(mounted.container.querySelector('canvas')).toBeNull();
  else {
    expect(mounted.container.querySelector('canvas')).not.toBeNull();
    if (qaFault === 'voxel-failure') expect(renderers[0].scenes[0].getObjectByName('simple-perimeter-fallback')).toBeDefined();
  }
  expect(options.onPlacement).not.toHaveBeenCalled(); mounted.unmount(); expect(active).toBe(0);
});

it('removes only the selected DEV Mill source from a successfully loaded bundle and uses the real fallback silhouette', async () => {
  const root = new THREE.Group(); const geometry = new THREE.BoxGeometry(1, 1, 1); const material = new THREE.MeshStandardMaterial(); root.add(new THREE.Mesh(geometry, material));
  const assets = { ...bundle(), staticPrefabs: new Map([['city-mill', { id: 'city-mill', root, clips: [], boundsMeters: [1, 1, 1] as const, triangles: 12, drawCalls: 1, animated: false, mounted: false, clone: () => root.clone(true) }]]) };
  vi.mocked(loader.loadKeep04Assets).mockResolvedValue(assets);
  const options = props(); const placement = options.visual.draft!;
  const visual = { ...options.visual, draft: null, buildings: [{ kind: placement.kind, placement, completedLevel: 1, targetLevel: 1, phase: 'complete' as const, startsAtMicros: null, completesAtMicros: null }] };
  const mounted = render(<Keep04SceneHost {...options} visual={visual} />); await act(async () => {}); tick();
  expect(renderers[0].scenes[0].getObjectByName('prefab:city-mill')).toBeDefined();
  mounted.rerender(<Keep04SceneHost {...options} visual={visual} qaFault="missing-model" />); await act(async () => {}); tick();
  expect(renderers[1].scenes[0].getObjectByName('prefab:city-mill')).toBeUndefined();
  expect(renderers[1].scenes[0].getObjectByName('silhouette:city-mill')).toBeDefined();
  expect(assets.staticPrefabs.has('city-mill')).toBe(true);
  mounted.unmount(); geometry.dispose(); material.dispose();
});

it('disposes a late bundle after unmount without ever allocating a renderer or attaching canvas', async () => {
  const pending = deferred<InnerKeepRuntimeAssetBundle>(); const assets = bundle(); vi.mocked(loader.loadKeep04Assets).mockReturnValue(pending.promise);
  const mounted = render(<Keep04SceneHost {...props()} />); mounted.unmount();
  expect(vi.mocked(loader.loadKeep04Assets).mock.calls[0][0].signal.aborted).toBe(true);
  await act(async () => { pending.resolve(assets); });
  expect(assets.dispose).toHaveBeenCalledTimes(1); expect(THREE.WebGLRenderer).not.toHaveBeenCalled();
  expect(mounted.container.querySelector('canvas')).toBeNull(); expect(queued.size).toBe(0);
});

it('keeps the lost context recoverable and restores once from current visual state', async () => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {}); tick();
  const canvas = mounted.container.querySelector('canvas')!; const old = renderers[0].scenes[0];
  const event = new Event('webglcontextlost', { cancelable: true }); fireEvent(canvas, event);
  expect(event.defaultPrevented).toBe(true); expect(options.onMode).toHaveBeenLastCalledWith('fallback');
  expect(queued.size).toBe(0); expect(old.children).toHaveLength(0);
  const updated = { ...options, visual: { ...options.visual, draft: { ...options.visual.draft!, x: 20_000_000n } } };
  mounted.rerender(<Keep04SceneHost {...updated} />);
  fireEvent(canvas, new Event('webglcontextrestored')); fireEvent(canvas, new Event('webglcontextrestored'));
  await act(async () => {}); tick(1000);
  expect(options.onMode).toHaveBeenLastCalledWith('webgl'); expect(renderers).toHaveLength(2); expect(maximum).toBe(1);
  const restored = renderers[1].scenes[0]; expect(restored).not.toBe(old);
  expect(restored.getObjectByName('draft-footprint')!.position.x).toBe(20);
  expect(options.onPlacement).not.toHaveBeenCalled(); expect(options.onSelect).not.toHaveBeenCalled();
});

it('releases generations before quality replacement and disposes stale asset arrivals', async () => {
  const pending = deferred<InnerKeepRuntimeAssetBundle>(); const stale = bundle();
  vi.mocked(loader.loadKeep04Assets).mockReturnValueOnce(pending.promise);
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />);
  mounted.rerender(<Keep04SceneHost {...options} quality="high" />); await act(async () => {});
  await act(async () => pending.resolve(stale)); expect(stale.dispose).toHaveBeenCalledTimes(1);
  expect(renderers).toHaveLength(1); expect(renderers[0].ratio).toBe(1.75);
  mounted.rerender(<Keep04SceneHost {...options} quality="balanced" />); await act(async () => {});
  expect(renderers[0].disposed).toBe(true); expect(renderers[1].ratio).toBe(1.5);
  mounted.rerender(<Keep04SceneHost {...options} quality="reduced" reducedMotion />); await act(async () => {});
  expect(renderers[2].ratio).toBe(1); expect(maximum).toBe(1);
  mounted.unmount(); expect(active).toBe(0); expect(observers).toBe(0); expect(queued.size).toBe(0);
});

it('pauses hidden frames and reconciles current props before visible rendering', async () => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {});
  hidden = true; fireEvent(document, new Event('visibilitychange')); expect(queued.size).toBe(0);
  mounted.rerender(<Keep04SceneHost {...options} visual={{ ...options.visual, draft: { ...options.visual.draft!, x: 10_000_000n } }} />);
  expect(queued.size).toBe(0); hidden = false; fireEvent(document, new Event('visibilitychange')); tick();
  expect(renderers[0].scenes[0].getObjectByName('draft-footprint')!.position.x).toBe(10);
});

it.each(['outside', 'drag', 'pinch', 'other-pointer', 'cancel'] as const)('does not place a building after a %s gesture', async gesture => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {}); tick();
  const canvas = mounted.container.querySelector('canvas')!;
  pointer(canvas, 'pointerdown', 1, 400, 300);
  if (gesture === 'drag') pointer(canvas, 'pointermove', 1, 450, 300);
  if (gesture === 'pinch') pointer(canvas, 'pointerdown', 2, 400, 300);
  if (gesture === 'cancel') pointer(canvas, 'pointercancel', 1, 400, 300);
  pointer(canvas, 'pointerup', gesture === 'pinch' || gesture === 'other-pointer' ? 2 : 1, gesture === 'outside' ? 900 : 400, 300);
  expect(options.onPlacement).not.toHaveBeenCalled(); expect(options.onSelect).not.toHaveBeenCalled();
});

it('quantizes a viewport click to half metres without confirming construction or changing rotation', async () => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {});
  const canvas = mounted.container.querySelector('canvas')!;
  pointer(canvas, 'pointerdown', 1, 400, 300); pointer(canvas, 'pointerup', 1, 400, 300);
  expect(options.onPlacement).toHaveBeenCalledWith({ kind: 'city-mill', x: 0n, z: -4_000_000n, rotation: 90_000 });
  expect(options.onSelect).not.toHaveBeenCalled();
});

it('uses graphics fallback on asset failure without attaching a partial renderer', async () => {
  const assets = { ...bundle(), failures: [{ kind: 'static' as const, id: 'city-mill', reason: 'unavailable' }] };
  vi.mocked(loader.loadKeep04Assets).mockResolvedValue(assets); const options = props();
  const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {});
  expect(options.onMode).toHaveBeenLastCalledWith('fallback'); expect(mounted.container.querySelector('canvas')).toBeNull();
  expect(assets.dispose).toHaveBeenCalledTimes(1); expect(active).toBe(0);
});

it('releases GPU resources and exposes fallback if a render submission fails', async () => {
  const options = props(); render(<Keep04SceneHost {...options} />); await act(async () => {});
  vi.spyOn(renderers[0], 'render').mockImplementation(() => { throw new Error('GPU submission failed'); });
  expect(() => tick()).not.toThrow(); expect(options.onMode).toHaveBeenLastCalledWith('fallback');
  expect(active).toBe(0); expect(observers).toBe(0); expect(queued.size).toBe(0);
});

it.each([{ calls: 551, triangles: 0 }, { calls: 0, triangles: 520001 }])('retires a scene when actual submissions exceed the selected hard renderer ceiling (%j)', async metrics => {
  const options = props(); render(<Keep04SceneHost {...options} />); await act(async () => {});
  Object.assign(renderers[0].info.render, metrics); tick();
  expect(options.onMode).toHaveBeenLastCalledWith('fallback'); expect(active).toBe(0); expect(queued.size).toBe(0);
});

it('contains visual reconciliation failures without unmounting the React host', async () => {
  const options = props(); const mounted = render(<Keep04SceneHost {...options} />); await act(async () => {});
  vi.spyOn(THREE.Scene.prototype, 'updateMatrixWorld').mockImplementationOnce(() => { throw new Error('graphics matrix failure'); });
  expect(() => mounted.rerender(<Keep04SceneHost {...options} visual={{ ...options.visual, draft: { ...options.visual.draft!, x: 20_000_000n } }} />)).not.toThrow();
  expect(options.onMode).toHaveBeenLastCalledWith('fallback'); expect(active).toBe(0);
  expect(mounted.container.querySelector('[aria-label="Verdant Citadel scene"]')).not.toBeNull();
});

it('cycles the real PTR world/keep host twice with one renderer, one controller refresh owner and no leaked listeners or assets', async () => {
  const now = Math.floor(Date.now() / 1000) * 1000; const databaseIdentity = 'd'.repeat(64); const anchor = { castleId: 1, q: -2, r: 1 };
  const segment = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  const token = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'test' })}.${segment({ iss: 'https://auth.warpkeep.com', sub: 'farcaster:1', aud: ['warpkeep-ptr-spacetimedb'], token_type: 'spacetime-access', auth_version: 2, realm_id: 'PTR', fid: '1', ptr_database_identity: databaseIdentity, auth_epoch: 1, roles: ['warpkeep-ptr-owner'], iat: Math.floor(now / 1000), nbf: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 120, session_iat: Math.floor(now / 1000), session_exp: Math.floor(now / 1000) + 120, jti: 'lifecycle-fixture' })}.test_signature`;
  const authority = await createPtrRealmAuthClient({ expectedDatabaseIdentity: databaseIdentity, now: () => now, fetch: (async () => new Response(JSON.stringify({ version: 1, status: 'authorized', realmId: 'PTR', databaseIdentity, accessToken: token, tokenType: 'spacetime-access', accessExpiresAt: now + 120_000 }), { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } })) as typeof fetch }).exchangeQuickAuth('quick.auth.token');
  const read = vi.fn(async () => freshWire04()); const command = vi.fn();
  const connection = { procedures: { getGameplay04KeepV1: read, startGameplay04BuildingV1: command, dispatchGameplay04WorkerV1: command }, disconnect: vi.fn() } as unknown as PtrRealmConnectionLike;
  let accept!: Parameters<PtrRealmConnectionBuilder['onConnect']>[0];
  const builder: PtrRealmConnectionBuilder = { withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; }, onConnect(callback) { accept = callback; return this; }, onDisconnect() { return this; }, onConnectError() { return this; }, build() { queueMicrotask(() => accept(connection, {}, 'ignored')); return connection; } };
  const session = await connectPtrRealm({ config: { availability: 'available', enabled: true, spacetimeUri: 'https://maincloud.spacetimedb.com', databaseIdentity }, authority, generation: 17, signal: new AbortController().signal, builderFactory: () => builder });
  const capability = createPtrGameplay04Capability(session, authority, anchor);
  const ready = { phase: 'ready', sessionGeneration: 17, deviceClass: 'desktop', graphicsProfile: 'balanced', cellSize: 1, bootstrap: { ...fixture.bootstrap, mode: 'active', myCastleId: 1n }, window: { ...fixture.window, centerQ: -1, centerR: 0, radius: 2 }, view: { centerQ: -1, centerR: 0, radius: 2, lod: 1 }, chunks: fixture.chunks.map(chunk => ({ chunk: { ...chunk, lod: 1, resourceLocations: [] }, distanceChunks: 0 })), selectedChunkCount: fixture.chunks.length, resourceLocationPhase: 'ready', resourceLocations: fixture.resourceLocations, resourceLocationsTruncated: false, stream: {} } as unknown as GreaterRealmClientSnapshot;
  const bridge = { phase: 'available', presentationAllowed: true, sessionGeneration: 17, createRuntime: () => {
    let publish: (snapshot: GreaterRealmClientSnapshot) => void;
    return { subscribe(callback: typeof publish) { publish = callback; return () => {}; }, async loadView() { publish(ready); }, dispose() {}, refreshRelease: async () => ready };
  } } as unknown as AvailableGreaterRealmProviderBridge;
  const owners = new Map<EventTarget, Map<string, Set<EventListenerOrEventListenerObject>>>();
  const add = EventTarget.prototype.addEventListener; const remove = EventTarget.prototype.removeEventListener;
  const tracked = (target: EventTarget, type: string) => target instanceof HTMLCanvasElement || (target === document && type === 'visibilitychange') || (target === window && type === 'focus');
  vi.spyOn(EventTarget.prototype, 'addEventListener').mockImplementation(function (this: EventTarget, type, listener, options) {
    if (listener && tracked(this, type)) { let target = owners.get(this); if (!target) { target = new Map(); owners.set(this, target); } let listeners = target.get(type); if (!listeners) { listeners = new Set(); target.set(type, listeners); } listeners.add(listener); }
    return add.call(this, type, listener, options);
  });
  vi.spyOn(EventTarget.prototype, 'removeEventListener').mockImplementation(function (this: EventTarget, type, listener, options) {
    if (listener) owners.get(this)?.get(type)?.delete(listener); return remove.call(this, type, listener, options);
  });
  const bundles: InnerKeepRuntimeAssetBundle[] = [];
  vi.mocked(loader.loadKeep04Assets).mockImplementation(async () => { const assets = bundle(); bundles.push(assets); return assets; });
  const mounted = render(<PtrGameplay04SurfaceHost identity={{ fid: 1 }} ptrRealmAuthority={authority} ptrViewAnchor={anchor} greaterRealm={bridge} ptrGameplay04={capability} resolvedGraphicsQuality="balanced" onRequestReturn={vi.fn()} />);
  try {
    await screen.findByRole('button', { name: 'Open keep' }); await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    for (let cycle = 0; cycle < 2; cycle++) {
      fireEvent.click(screen.getByRole('button', { name: 'Open keep' })); await screen.findByRole('heading', { name: 'Your keep' }); await act(async () => {}); tick(cycle * 1000);
      expect(active).toBe(1); expect(mounted.container.querySelectorAll('canvas')).toHaveLength(1);
      if (cycle === 0) {
        const canvas = mounted.container.querySelector('canvas')!;
        fireEvent(canvas, new Event('webglcontextlost', { cancelable: true }));
        expect(screen.getByText(/3D graphics.*unavailable/i)).toBeVisible();
        fireEvent(canvas, new Event('webglcontextrestored')); await act(async () => {}); tick(500);
      }
      fireEvent.click(screen.getByRole('button', { name: 'Return to world' })); await screen.findByRole('button', { name: 'Open keep' });
      expect(active).toBe(1); expect(mounted.container.querySelectorAll('canvas')).toHaveLength(1);
      expect(mounted.container.querySelector('[aria-label="Verdant Citadel scene"]')).toBeNull(); expect(read).toHaveBeenCalledTimes(1);
    }
    hidden = true; fireEvent(document, new Event('visibilitychange')); expect(read).toHaveBeenCalledTimes(1);
    hidden = false; fireEvent(document, new Event('visibilitychange')); await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
    expect(command).not.toHaveBeenCalled(); expect(maximum).toBe(1);
    mounted.unmount(); expect(active).toBe(0); expect(queued.size).toBe(0); expect(observers).toBe(0);
    for (const target of owners.values()) for (const listeners of target.values()) expect(listeners.size).toBe(0);
    for (const assets of bundles) expect(assets.dispose).toHaveBeenCalledTimes(1);
    fireEvent(document, new Event('visibilitychange')); fireEvent(window, new Event('focus')); expect(read).toHaveBeenCalledTimes(2);
  } finally { mounted.unmount(); closePtrRealmConnectionSession(session); }
});
