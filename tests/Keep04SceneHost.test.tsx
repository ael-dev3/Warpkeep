import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { Keep04SceneHost, type Keep04SceneHostProps } from '../src/components/keep04/Keep04SceneHost';
import * as loader from '../src/components/keep04/loadKeep04Assets';
import type { InnerKeepRuntimeAssetBundle } from '../src/components/inner-keep/loadInnerKeepRuntimeAssets';
import { PtrGameplay04SurfaceHost } from '../src/ptr/PtrGameplay04SurfaceHost';
import { createPtrRealmAuthClient } from '../src/ptr/ptrRealmAuthClient';
import { connectPtrRealm, createPtrGameplay04Capability, closePtrRealmConnectionSession, type PtrRealmConnectionBuilder, type PtrRealmConnectionLike } from '../src/ptr/ptrRealmConnection';
import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE as fixture } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type { GreaterRealmClientSnapshot } from '../src/greater-realm/greaterRealmClientRuntime';
import type { AvailableGreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';
import { freshWire04 } from './fixtures/gameplay04Client';

// Only the external request and GPU/browser boundary are doubled. Real host and scene own their lifetimes.
vi.mock('three', async original => ({ ...await original<typeof import('three')>(), WebGLRenderer: vi.fn() }));
vi.mock('../src/farcaster/miniapp', () => ({ useMiniAppHost: () => ({ isMiniApp: true }), useMiniAppBackNavigation: () => {} }));
vi.mock('../src/components/realm/createGreaterRealmWorldCanvasHost', () => ({ createGreaterRealmWorldCanvasHost: () => {
  active++; maximum = Math.max(maximum, active);
  return { applySnapshot() {}, updatePolicy() {}, dispose() { active--; } };
} }));
const bundle = (): InnerKeepRuntimeAssetBundle => ({ staticPrefabs: new Map(), populationPrefabs: new Map(), failures: [], dispose: vi.fn() });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
let queued: Map<number, FrameRequestCallback>; let sequence: number; let active: number; let maximum: number;
let renderers: RendererBoundary[]; let hidden: boolean; let observers: number;
class RendererBoundary {
  domElement = document.createElement('canvas'); shadowMap = {}; info = { render: { calls: 0, triangles: 0 } };
  ratio = 0; disposed = false; scenes: THREE.Scene[] = [];
  constructor() { active++; maximum = Math.max(maximum, active); renderers.push(this); }
  setPixelRatio(value: number) { this.ratio = value; } setSize() {} forceContextLoss() {}
  dispose() { expect(this.disposed).toBe(false); this.disposed = true; active--; }
  render(scene: THREE.Scene) { expect(this.disposed).toBe(false); this.scenes.push(scene); }
}
const props = (): Keep04SceneHostProps => ({ visual: { buildings: [], selectedKind: 'city-mill', draft: { kind: 'city-mill', x: -24_000_000n, z: -20_000_000n, rotation: 90_000 }, draftValid: true }, quality: 'balanced', reducedMotion: false, onMode: vi.fn(), onPlacement: vi.fn(), onSelect: vi.fn() });
function tick(time = 0) { const callbacks = [...queued.values()]; queued.clear(); act(() => callbacks.forEach(callback => callback(time))); }
function pointer(canvas: HTMLCanvasElement, type: string, id: number, x: number, y: number) {
  const event = new Event(type, { bubbles: true }); Object.assign(event, { pointerId: id, clientX: x, clientY: y, button: 0 }); fireEvent(canvas, event);
}
beforeEach(() => {
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
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

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
