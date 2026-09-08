import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { RealmMapScreen } from '../src/components/realm/RealmMapScreen';
import { createPtrRealmAuthClient } from '../src/ptr/ptrRealmAuthClient';
import { connectPtrRealm, createPtrGameplay04Capability, closePtrRealmConnectionSession, type PtrRealmConnectionBuilder, type PtrRealmConnectionLike } from '../src/ptr/ptrRealmConnection';
import { PtrRealmProvider, usePtrRealm, type PtrRealmProviderRuntime } from '../src/ptr/PtrRealmProvider';
import { GREATER_REALM_SYNTHETIC_TIER_ONE_FIXTURE as fixture } from '../src/dev/greaterRealmSyntheticTierOneFixture';
import type { GreaterRealmClientSnapshot } from '../src/greater-realm/greaterRealmClientRuntime';
import type { AvailableGreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';
import { freshWire04, assignmentWire04 } from './fixtures/gameplay04Client';
import { REALM_SURFACE_HISTORY_KEY } from '../src/components/realm/realmSurfaceNavigation';
import type { BuildWire04, DispatchWire04 } from '../src/ptr/gameplay04/ptrGameplay04Types';
import { PtrSessionRenewalPanel } from '../src/ptr/PtrSessionContinuation';

const host = vi.hoisted(() => ({ miniApp: true, fallback: false, back: undefined as (() => void) | undefined, canvases: 0, maximum: 0, creates: 0 }));
vi.mock('../src/farcaster/miniapp', () => ({
  useMiniAppHost: () => hostValue,
  useMiniAppBackNavigation: (_priority: number, callback: () => void) => { host.back = callback; },
}));
vi.mock('../src/components/realm/createGreaterRealmWorldCanvasHost', () => ({
  createGreaterRealmWorldCanvasHost: () => {
    if (host.fallback) return undefined;
    host.creates++; host.canvases++; host.maximum = Math.max(host.maximum, host.canvases);
    return { applySnapshot() {}, updatePolicy() {}, dispose() { host.canvases--; } };
  },
}));
const NOW = 1_788_000_000_000;
const databaseIdentity = 'd'.repeat(64);
const anchor = { castleId: 1, q: -2, r: 1 };
let hostValue: Record<string, unknown>;
const config = { availability: 'available', enabled: true, spacetimeUri: 'https://maincloud.spacetimedb.com', databaseIdentity } as const;

async function setup(generation = 17) {
  const segment = (value: unknown) => btoa(JSON.stringify(value)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
  const seconds = NOW / 1000;
  const token = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'test' })}.${segment({
    iss: 'https://auth.warpkeep.com', sub: 'farcaster:1', aud: ['warpkeep-ptr-spacetimedb'], token_type: 'spacetime-access',
    auth_version: 2, realm_id: 'PTR', fid: '1', ptr_database_identity: databaseIdentity, auth_epoch: 1,
    roles: ['warpkeep-ptr-owner'], iat: seconds, nbf: seconds, exp: seconds + 120,
    session_iat: seconds, session_exp: seconds + 120, jti: 'host-fixture',
  })}.test_signature`;
  const client = createPtrRealmAuthClient({ expectedDatabaseIdentity: databaseIdentity, now: () => NOW,
    fetch: (async () => new Response(JSON.stringify({ version: 1, status: 'authorized', realmId: 'PTR', databaseIdentity,
      accessToken: token, tokenType: 'spacetime-access', accessExpiresAt: NOW + 120_000,
    }), { headers: { 'cache-control': 'no-store', 'content-type': 'application/json' } })) as typeof fetch,
  });
  const authority = await client.exchangeQuickAuth('quick.auth.token');
  let wire = freshWire04();
  const read = vi.fn(async () => structuredClone(wire));
  const build = vi.fn((_input: BuildWire04) => new Promise<{ sequence: bigint; revision: bigint }>(() => {}));
  const dispatch = vi.fn(async (input: DispatchWire04) => {
    wire.revision = input.expectedRevision + 1n; wire.lastAcceptedSequence = input.sequence;
    wire.workers[input.workerOrdinal].assignmentRevision = 1n;
    wire.workers[input.workerOrdinal].assignment = { ...assignmentWire04(), route: [{ q: -2, r: 1 }, { q: -1, r: 1 }], destinationCellKey: 'CELL:-1:1' };
    return { sequence: wire.lastAcceptedSequence, revision: wire.revision };
  });
  const connection = { procedures: { getGameplay04KeepV1: read, dispatchGameplay04WorkerV1: dispatch, startGameplay04BuildingV1: build }, disconnect: vi.fn() } as unknown as PtrRealmConnectionLike;
  let accept!: Parameters<PtrRealmConnectionBuilder['onConnect']>[0];
  const builder: PtrRealmConnectionBuilder = {
    withUri() { return this; }, withDatabaseName() { return this; }, withToken() { return this; },
    onConnect(callback) { accept = callback; return this; }, onDisconnect() { return this; }, onConnectError() { return this; },
    build() { queueMicrotask(() => accept(connection, {}, 'ignored')); return connection; },
  };
  const session = await connectPtrRealm({ config, authority, generation, signal: new AbortController().signal, builderFactory: () => builder });
  const capability = createPtrGameplay04Capability(session, authority, anchor);
  let listener!: (value: GreaterRealmClientSnapshot) => void;
  const ready = (): GreaterRealmClientSnapshot => ({ phase: 'ready', sessionGeneration: generation, deviceClass: 'desktop', graphicsProfile: 'balanced',
    cellSize: 1, bootstrap: { ...fixture.bootstrap, mode: 'active', myCastleId: 1n },
    window: { ...fixture.window, centerQ: -1, centerR: 0, radius: hostValue.isMiniApp ? 2 : 3 }, view: { centerQ: -1, centerR: 0, radius: hostValue.isMiniApp ? 2 : 3, lod: 1 },
    chunks: fixture.chunks.map((chunk, index) => ({ chunk: { ...chunk, lod: 1, resourceLocations: [] }, distanceChunks: index })),
    selectedChunkCount: fixture.chunks.length, resourceLocationPhase: 'ready', resourceLocations: fixture.resourceLocations,
    resourceLocationsTruncated: false, stream: {},
  } as unknown as GreaterRealmClientSnapshot);
  const bridge = { phase: 'available', presentationAllowed: true, sessionGeneration: generation,
    createRuntime: () => ({ subscribe(next: typeof listener) { listener = next; return () => {}; },
      async loadView() { listener(ready()); }, dispose() {}, refreshRelease: async () => ready() }),
  } as unknown as AvailableGreaterRealmProviderBridge;
  const onRequestReturn = vi.fn();
  const props = { identity: { fid: 1 }, ptrRealmAuthority: authority, ptrViewAnchor: anchor, greaterRealm: bridge,
    ptrGameplay04: capability, resolvedGraphicsQuality: 'balanced' as const, onRequestReturn };
  return { props, session, capability, bridge, authority, read, dispatch, build, ready, publish: (value: GreaterRealmClientSnapshot) => listener(value),
    fund() { wire.food = 1000n; wire.wood = 1000n; wire.stone = 1000n; wire.gold = 1000n; },
    journeys(points = 8193) {
      for (const worker of wire.workers) {
        const count = worker.ordinal === 0 ? points : 2;
        const travel = BigInt(count - 1) * 2_000_000n;
        worker.assignmentRevision = 1n;
        worker.assignment = { ...assignmentWire04(), route: Array.from({ length: count }, (_, i) => ({ q: -2 + i, r: 1 })), routeEdges: count - 1,
          arrivesAt: travel, gatheringStopsAt: travel + 60_000_000n, returnsAt: travel * 2n + 60_000_000n,
          phase: worker.ordinal === 1 ? 'gathering' : worker.ordinal === 2 ? 'returning' : 'outbound', earned: worker.ordinal === 2 ? 60n : 0n };
      }
    },
    returnWorker() { wire.workers[0].assignment = undefined; wire.food = 60n; wire.revision++; },
    occupyWorker(ordinal: number) {
      wire.workers[ordinal].assignmentRevision++;
      wire.workers[ordinal].assignment = { ...assignmentWire04(),
        route: [{ q: -2, r: 1 }, { q: -1, r: 1 }], destinationCellKey: 'CELL:-1:1' };
      wire.revision++;
    },
  };
}

beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW);
  host.miniApp = true; host.fallback = false; host.canvases = 0; host.maximum = 0; host.creates = 0;
  hostValue = { state: 'miniapp', isMiniApp: true, quickAuth: { getToken: async () => ({ status: 'token', token: 'quick.auth.token' }) } };
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('opens keep only through current matching branded PTR capability; legacy and capability-only inputs fail closed', async () => {
  const h = await setup();
  const mounted = render(<RealmMapScreen {...h.props} />);
  expect(await screen.findByRole('button', { name: 'Open keep' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  expect(await screen.findByRole('heading', { name: 'Your keep' })).toBeTruthy();
  expect(host.canvases).toBe(0);
  for (const patch of [
    { innerKeep: {} as never }, { ptrGameplay04: { ...h.capability } },
    { greaterRealm: { ...h.bridge, sessionGeneration: 18 } },
    { ptrRealmAuthority: undefined, ptrViewAnchor: undefined },
    { ptrViewAnchor: { ...anchor, q: 0 } },
  ]) {
    const creates = host.creates;
    mounted.rerender(<RealmMapScreen {...h.props} {...patch} />);
    expect(screen.queryByRole('button', { name: 'Open keep' })).toBeNull();
    expect(screen.getByText(/unavailable/i)).toBeTruthy();
    expect(host.creates).toBe(creates);
  }
  closePtrRealmConnectionSession(h.session);
});

it('provider ready publishes the branded gameplay capability into the real route', async () => {
  const h = await setup();
  const runtime: PtrRealmProviderRuntime = { now: () => NOW, createAuthClient: () => ({ exchangeQuickAuth: async () => h.authority }),
    connect: async () => h.session, preflight: async () => anchor, createBridge: () => h.bridge,
    createGameplay04: createPtrGameplay04Capability, isSessionCurrent: () => true, closeSession: closePtrRealmConnectionSession };
  function Entry() {
    const ptr = usePtrRealm();
    return ptr.phase === 'ready' ? <RealmMapScreen {...h.props} ptrGameplay04={ptr.gameplay04!} />
      : <><button onClick={() => void ptr.checkAccess()}>Check</button><button onClick={() => void ptr.enter()}>Enter</button><output>{ptr.phase}</output></>;
  }
  render(<PtrRealmProvider config={config} runtime={runtime}><Entry /></PtrRealmProvider>);
  fireEvent.click(screen.getByText('Check')); await screen.findByText('admitted');
  fireEvent.click(screen.getByText('Enter'));
  expect(await screen.findByRole('button', { name: 'Open keep' })).toBeTruthy();
});

it('fails the capability-only PTR route before any renderer or keep read', async () => {
  const h = await setup();
  render(<RealmMapScreen {...h.props} ptrRealmAuthority={undefined} ptrViewAnchor={undefined} />);
  expect(screen.getByText(/unavailable/i)).toBeTruthy();
  expect(host.creates).toBe(0); expect(h.read).not.toHaveBeenCalled();
});

it('submits the explicitly selected idle ordinal and eight-hour duration', async () => {
  const h = await setup();
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  fireEvent.change(screen.getByRole('combobox', { name: 'Idle Worker' }), { target: { value: '2' } });
  fireEvent.click(screen.getByRole('button', { name: '8 hours' }));
  fireEvent.click(screen.getByRole('button', { name: 'Dispatch Worker 3' }));
  await waitFor(() => expect(h.dispatch).toHaveBeenCalledOnce());
  expect(h.dispatch.mock.calls[0][0]).toMatchObject({ workerOrdinal: 2, gatheringDurationMicros: 28_800_000_000n });
});

it.each([1280, 390])('carries Worker 3 from keep resource navigation into explicit dispatch review with Worker 1 busy (width=%s)', async width => {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  const h = await setup(); h.occupyWorker(0);
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Manage Workers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find resources for Worker 3' }));
  const resource = await screen.findByRole('button', { name: /food at/ });
  expect(screen.queryByRole('button', { name: /^Dispatch Worker/ })).toBeNull();
  fireEvent.click(resource);
  const chooser = screen.getByRole('combobox', { name: 'Idle Worker' }) as HTMLSelectElement;
  expect(chooser.value).toBe('2');
  const dispatch = screen.getByRole('button', { name: 'Dispatch Worker 3' }) as HTMLButtonElement;
  expect(dispatch.disabled).toBe(false); expect(h.dispatch).not.toHaveBeenCalled();
  fireEvent.click(dispatch);
  await waitFor(() => expect(h.dispatch).toHaveBeenCalledOnce());
  expect(h.dispatch.mock.calls[0][0]).toMatchObject({ workerOrdinal: 2, resource: 'food', gatheringDurationMicros: 60_000_000n });
});

it('requires another explicit worker choice if the requested Worker becomes busy during resource review', async () => {
  const h = await setup(); h.occupyWorker(0);
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Manage Workers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find resources for Worker 3' }));
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  const before = h.read.mock.calls.length;
  h.occupyWorker(2); act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(h.read.mock.calls.length).toBeGreaterThan(before));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Dispatch Worker 3' }) as HTMLButtonElement).disabled).toBe(true));
  const chooser = screen.getByRole('combobox', { name: 'Idle Worker' }) as HTMLSelectElement;
  expect(chooser.value).toBe('2');
  expect((await screen.findByRole('option', { name: 'Worker 3 · outbound' }) as HTMLOptionElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Dispatch Worker 3' }));
  expect(h.dispatch).not.toHaveBeenCalled();
  fireEvent.change(chooser, { target: { value: '1' } });
  const dispatch = screen.getByRole('button', { name: 'Dispatch Worker 2' }) as HTMLButtonElement;
  expect(dispatch.disabled).toBe(false);
  fireEvent.click(dispatch);
  await waitFor(() => expect(h.dispatch).toHaveBeenCalledOnce());
  expect(h.dispatch.mock.calls[0][0].workerOrdinal).toBe(1);
});

it('rejects out-of-range, noncanonical and busy worker selections without replacing the reviewed Worker', async () => {
  const h = await setup(); h.occupyWorker(0);
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  const chooser = screen.getByRole('combobox', { name: 'Idle Worker' }) as HTMLSelectElement;
  fireEvent.change(chooser, { target: { value: '2' } });
  for (const value of ['4', '-1', '1.5', '01', '', 'not-a-worker']) {
    const invalid = document.createElement('option'); invalid.value = value; chooser.append(invalid);
    fireEvent.change(chooser, { target: { value } });
    expect(chooser.value).toBe('2');
    invalid.remove();
  }
  fireEvent.change(chooser, { target: { value: '0' } });
  expect(chooser.value).toBe('2');
  expect((screen.getByRole('button', { name: 'Dispatch Worker 3' }) as HTMLButtonElement).disabled).toBe(false);
  expect(h.dispatch).not.toHaveBeenCalled();
});

it('resets the requested Worker, selected target and duration under a replacement capability', async () => {
  const h = await setup();
  const mounted = render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Manage Workers' }));
  fireEvent.click(screen.getByRole('button', { name: 'Find resources for Worker 3' }));
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  fireEvent.click(screen.getByRole('button', { name: '8 hours' }));
  expect((screen.getByRole('combobox', { name: 'Idle Worker' }) as HTMLSelectElement).value).toBe('2');
  const replacement = await setup(18);
  mounted.rerender(<RealmMapScreen {...replacement.props} />);
  const resource = await screen.findByRole('button', { name: /food at/ });
  expect(screen.queryByRole('button', { name: /^Dispatch Worker/ })).toBeNull();
  fireEvent.click(resource);
  expect((screen.getByRole('combobox', { name: 'Idle Worker' }) as HTMLSelectElement).value).toBe('0');
  expect(screen.getByRole('button', { name: '60 seconds' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByRole('button', { name: '8 hours' }).getAttribute('aria-pressed')).toBe('false');
  expect(h.dispatch).not.toHaveBeenCalled(); expect(replacement.dispatch).not.toHaveBeenCalled();
});

it('dispatches selected actual resources, refreshes authoritative return and keeps one controller across world/keep routes', async () => {
  const h = await setup();
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  const panel = await screen.findByRole('region', { name: '0.4 Workers' });
  expect(screen.queryByText('NO IDLE WORKER')).toBeNull();
  for (const label of ['60 seconds', '10 minutes', '1 hour', '8 hours']) expect(within(panel).getByRole('button', { name: label })).toBeTruthy();
  await waitFor(() => expect((within(panel).getByRole('button', { name: 'Dispatch Worker 1' }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(panel).getByRole('button', { name: 'Dispatch Worker 1' }));
  await waitFor(() => expect(h.dispatch).toHaveBeenCalledTimes(1));
  expect(h.dispatch.mock.calls[0][0]).toMatchObject({ workerOrdinal: 0, resource: 'food', gatheringDurationMicros: 60_000_000n, expectedAtlasRevision: fixture.bootstrap.revision });
  expect(await screen.findByText('Journey route')).toBeTruthy();
  expect(panel.querySelector('polyline')?.getAttribute('points')).toBe('-2,1 -1,1');
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  await screen.findByRole('heading', { name: 'Your keep' });
  expect(host.canvases).toBe(0);
  const before = h.read.mock.calls.length;
  act(() => host.back?.());
  await screen.findByRole('button', { name: 'Open keep' });
  expect(h.read).toHaveBeenCalledTimes(before);
  expect(screen.queryByRole('button', { name: 'Dispatch Worker 1' })).toBeNull();
  h.returnWorker(); act(() => window.dispatchEvent(new Event('focus')));
  await waitFor(() => expect(h.read.mock.calls.length).toBeGreaterThan(before));
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  expect(await screen.findByText('60')).toBeTruthy();
  act(() => host.back?.()); await screen.findByRole('button', { name: 'Open keep' });
  act(() => host.back?.()); expect(h.props.onRequestReturn).toHaveBeenCalledOnce();
  expect(host.maximum).toBe(1);
});

it('refreshes the world after target rejection with no optimistic assignment or retained target', async () => {
  const h = await setup();
  h.dispatch.mockRejectedValueOnce('GAMEPLAY04_TARGET_INVALID');
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  const creates = host.creates;
  fireEvent.click(await screen.findByRole('button', { name: 'Dispatch Worker 1' }));
  await waitFor(() => expect(h.dispatch).toHaveBeenCalledOnce());
  await screen.findByText('That resource location changed. Choose a current Realm location.');
  expect(host.creates).toBeGreaterThan(creates);
  expect(screen.queryByRole('button', { name: 'Dispatch Worker 1' })).toBeNull();
  expect(screen.queryByText('Journey route')).toBeNull();
  expect(h.read.mock.calls.length).toBeGreaterThan(1);
});

it.each([
  [true, 'Close panel', false], [false, 'Close panel', false],
  [true, 'Escape', false], [false, 'Escape', false],
  [true, 'Close panel', true], [false, 'Close panel', true],
  [true, 'Escape', true], [false, 'Escape', true],
] as const)('closes all nested keep panels, then Back returns to world (miniApp=%s, action=%s, workers=%s)', async (miniApp, action, workers) => {
  hostValue = { ...hostValue, isMiniApp: miniApp };
  const h = await setup(); h.fund();
  const go = vi.spyOn(window.history, 'go');
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Buildings' }));
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move right 0.5 m' }));
  if (workers) fireEvent.click(screen.getByRole('button', { name: 'Manage Workers' }));
  const opener = screen.getByRole('button', { name: workers ? 'Manage Workers' : 'Buildings' });
  const close = screen.getByRole('button', { name: 'Close panel' });
  if (action === 'Escape') fireEvent.keyDown(close, { key: 'Escape' });
  else fireEvent.click(close);
  if (!miniApp) expect(go).toHaveBeenCalledExactlyOnceWith(workers ? -3 : -2);
  else expect(go).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Command panel' })).toBeNull());
  expect(screen.getByRole('heading', { name: 'Your keep' })).toBeTruthy();
  expect(document.activeElement).toBe(opener);
  expect(screen.getByRole('button', { name: 'Open building catalog' }).getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  await screen.findByRole('button', { name: 'Open keep' });
  expect(h.props.onRequestReturn).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
});

it('does not restore a closed placement draft through browser Forward', async () => {
  hostValue = { ...hostValue, isMiniApp: false };
  const h = await setup(); h.fund();
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Buildings' }));
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move right 0.5 m' }));
  expect((screen.getByRole('button', { name: /Confirm placement/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: 'Close panel' }));
  await waitFor(() => expect(screen.queryByRole('complementary', { name: 'Command panel' })).toBeNull());
  act(() => window.history.go(2));
  const confirm = await screen.findByRole('button', { name: /Confirm placement/ }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(true);
  fireEvent.click(confirm);
  expect(h.build).not.toHaveBeenCalled(); expect(h.dispatch).not.toHaveBeenCalled();
});

it.each([true, false])('backs out of a pending placement, keep and ready world (miniApp=%s) without replay or extra draft history', async miniApp => {
  hostValue = { ...hostValue, isMiniApp: miniApp };
  const h = await setup(); h.fund();
  const push = vi.spyOn(window.history, 'pushState');
  render(<RealmMapScreen {...h.props} />);
  await screen.findByRole('button', { name: /food at/ });
  const worldState = window.history.state;
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  await screen.findByRole('button', { name: 'Buildings' });
  const keepState = window.history.state;
  fireEvent.click(screen.getByRole('button', { name: 'Buildings' }));
  const catalogueState = window.history.state;
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  const pushes = push.mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Move right 0.5 m' }));
  expect(push).toHaveBeenCalledTimes(pushes);
  const confirm = screen.getByRole('button', { name: /Confirm placement/ }) as HTMLButtonElement;
  expect(confirm.disabled).toBe(false);
  fireEvent.click(confirm);
  await screen.findByText('Request pending. Awaiting Realm update.');
  expect(h.build).toHaveBeenCalledOnce();
  expect(h.build.mock.calls[0]?.[0]).toMatchObject({ expectedAtlasRevision: fixture.bootstrap.revision });
  const back = (state: unknown) => act(() => {
    if (miniApp) host.back?.();
    else { window.history.replaceState(state, ''); window.dispatchEvent(new PopStateEvent('popstate', { state })); }
  });
  back(catalogueState); back(keepState); back(worldState);
  await screen.findByRole('button', { name: 'Open keep' });
  expect(h.build).toHaveBeenCalledOnce();
  expect(host.maximum).toBe(1);
  act(() => host.back?.()); expect(h.props.onRequestReturn).toHaveBeenCalledOnce();
});

it('rejects foreign presentation routes and cannot reconstruct a placement draft from browser history', async () => {
  hostValue = { ...hostValue, isMiniApp: false };
  const h = await setup(); h.fund();
  render(<RealmMapScreen {...h.props} />);
  await screen.findByRole('button', { name: 'Open keep' });
  const state = window.history.state;
  const envelope = state[REALM_SURFACE_HISTORY_KEY];
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { ...state,
    [REALM_SURFACE_HISTORY_KEY]: { ...envelope, stack: [{ kind: 'inner-keep' }, { kind: 'inner-keep-placement', buildingKind: 'city-mill' }] },
  } })));
  expect((await screen.findByRole('button', { name: /Confirm placement/ }) as HTMLButtonElement).disabled).toBe(true);
  expect(h.build).not.toHaveBeenCalled();
  const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
  act(() => window.dispatchEvent(new PopStateEvent('popstate', { state: { ...state,
    [REALM_SURFACE_HISTORY_KEY]: { ...envelope, stack: [{ kind: 'settings' }] },
  } })));
  expect(screen.getByText('Returning to world…')).toBeTruthy(); expect(go).toHaveBeenCalledWith(-1);
  expect(h.build).not.toHaveBeenCalled();
});

it('shows four exact bounded Journey routes in fallback and rejects an oversized returned route', async () => {
  host.fallback = true;
  const h = await setup(); h.journeys();
  render(<RealmMapScreen {...h.props} />);
  await screen.findByText('WebGL 2 is unavailable on this device. Public Realm controls do not depend on the canvas.');
  await waitFor(() => expect(screen.getAllByText('Journey route')).toHaveLength(4));
  const panel = screen.getByRole('region', { name: '0.4 Workers' });
  const lines = panel.querySelectorAll('polyline');
  expect(lines).toHaveLength(4);
  const points = lines[0].getAttribute('points')!.split(' ');
  expect(points).toHaveLength(8193); expect(points[0]).toBe('-2,1'); expect(points.at(-1)).toBe('8190,1');
  expect(panel.querySelectorAll('circle')).toHaveLength(0);
  expect(within(panel).getByText('Worker 2 · gathering')).toBeTruthy();
  expect(within(panel).getByText('Worker 3 · returning')).toBeTruthy();
  cleanup(); h.journeys(8194);
  render(<RealmMapScreen {...h.props} />);
  await screen.findByRole('button', { name: 'Refresh keep' });
  expect(screen.queryByText('Journey route')).toBeNull();
});

it('Find food returns to the actual focused resource panel and requires a fresh selection', async () => {
  const h = await setup();
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Buildings' }));
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Find food' })[0]);
  await screen.findByRole('button', { name: /food at/ });
  expect(screen.queryByRole('button', { name: /wood at/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Dispatch Worker 1' })).toBeNull();
  expect(host.maximum).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: 'Show all resources' }));
  expect(screen.getByRole('button', { name: /wood at/ })).toBeTruthy();
});

it('viewport refresh removes dispatch until a current world snapshot and explicit selection arrive', async () => {
  hostValue = { ...hostValue, isMiniApp: false };
  const h = await setup();
  render(<RealmMapScreen {...h.props} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  expect((screen.getByRole('button', { name: 'Dispatch Worker 1' }) as HTMLButtonElement).disabled).toBe(false);
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  fireEvent(window, new Event('resize'));
  expect(screen.queryByRole('button', { name: 'Dispatch Worker 1' })).toBeNull();
  const next = h.ready();
  act(() => h.publish({ ...next, view: { ...next.view!, radius: 2 }, window: { ...next.window!, radius: 2 } }));
  fireEvent.click(screen.getByRole('button', { name: 'Nearby resources and workers' }));
  fireEvent.click(screen.getByRole('button', { name: /food at/ }));
  expect((screen.getByRole('button', { name: 'Dispatch Worker 1' }) as HTMLButtonElement).disabled).toBe(false);
  expect(h.dispatch).not.toHaveBeenCalled();
});

it.each([true, false])('restores only the keep root after a navigation reset in StrictMode (miniApp=%s)', async miniApp => {
  hostValue = { ...hostValue, isMiniApp: miniApp };
  const h = await setup();
  const surface = vi.fn();
  render(<StrictMode><RealmMapScreen {...h.props} ptrInitialSurface="keep" onPtrSurfaceChange={surface} /></StrictMode>);
  await screen.findByRole('heading', { name: 'Your keep' });
  await screen.findByRole('button', { name: 'Buildings' });
  expect(host.creates).toBe(0);
  expect(surface).toHaveBeenCalledWith('keep');
  expect(surface).not.toHaveBeenCalledWith('world');
  if (!miniApp) expect(window.history.state[REALM_SURFACE_HISTORY_KEY].stack).toEqual([{ kind: 'inner-keep' }]);
  act(() => host.back?.());
  await screen.findByRole('button', { name: 'Open keep' });
  expect(surface).toHaveBeenLastCalledWith('world');
  expect(h.props.onRequestReturn).not.toHaveBeenCalled();
  expect(h.build).not.toHaveBeenCalled();
  expect(h.dispatch).not.toHaveBeenCalled();
});

it('reopens the keep under a fresh capability without carrying or replaying a pending placement', async () => {
  const old = await setup(); old.fund();
  let completeOld!: (receipt: { sequence: bigint; revision: bigint }) => void;
  old.build.mockImplementationOnce(() => new Promise(resolve => { completeOld = resolve; }));
  const commandState = vi.fn();
  const surface = vi.fn();
  const mounted = render(<RealmMapScreen {...old.props} onPtrSurfaceChange={surface} onPtrCommandStateChange={commandState} />);
  await screen.findByRole('button', { name: /food at/ });
  fireEvent.click(screen.getByRole('button', { name: 'Open keep' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Buildings' }));
  fireEvent.click(screen.getByRole('button', { name: 'City Mill' }));
  fireEvent.click(screen.getByRole('button', { name: 'Move right 0.5 m' }));
  fireEvent.click(screen.getByRole('button', { name: /Confirm placement/ }));
  expect(commandState).toHaveBeenLastCalledWith(true);
  expect(surface).toHaveBeenLastCalledWith('keep');
  expect(old.build).toHaveBeenCalledOnce();
  const oldReadCount = old.read.mock.calls.length;
  const fresh = await setup(18);
  const creates = host.creates;
  closePtrRealmConnectionSession(old.session);
  mounted.rerender(<RealmMapScreen {...fresh.props} ptrInitialSurface="keep" onPtrSurfaceChange={surface} onPtrCommandStateChange={commandState} />);
  await waitFor(() => expect(commandState).toHaveBeenLastCalledWith(false));
  expect(screen.getByRole('heading', { name: 'Your keep' })).toBeTruthy();
  expect(screen.queryByRole('complementary', { name: 'Command panel' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Confirm placement/ })).toBeNull();
  expect(host.creates).toBe(creates);
  const command = old.build.mock.calls[0][0];
  await act(async () => completeOld({ sequence: command.sequence, revision: command.expectedRevision + 1n }));
  expect(old.read).toHaveBeenCalledTimes(oldReadCount);
  expect(old.build).toHaveBeenCalledOnce();
  expect(fresh.build).not.toHaveBeenCalled();
  expect(fresh.dispatch).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: /Confirm placement/ })).toBeNull();
});

it('shows a dismissible continuation notice only after a fresh keep read', async () => {
  const h = await setup();
  let finishRead!: (wire: ReturnType<typeof freshWire04>) => void;
  h.read.mockImplementationOnce(() => new Promise(resolve => { finishRead = resolve; }));
  const dismiss = vi.fn();
  const commandState = vi.fn();
  render(<RealmMapScreen {...h.props} ptrInitialSurface="keep" ptrContinuationNotice onDismissPtrContinuationNotice={dismiss} onPtrCommandStateChange={commandState} />);
  await waitFor(() => expect(h.read).toHaveBeenCalledOnce());
  expect(screen.queryByRole('region', { name: 'Session renewal' })).toBeNull();
  expect(commandState).not.toHaveBeenCalled();
  await act(async () => finishRead(freshWire04()));
  const notice = await screen.findByRole('region', { name: 'Session renewal' });
  expect(within(notice).getByRole('status').textContent).toBe('Your session was renewed. Review the latest keep state before retrying an interrupted action.');
  expect(commandState).toHaveBeenLastCalledWith(false);
  fireEvent.click(within(notice).getByRole('button', { name: 'Dismiss session notice' }));
  expect(dismiss).toHaveBeenCalledOnce();
  expect(screen.queryByRole('region', { name: 'Session renewal' })).toBeNull();
  expect(document.activeElement?.classList.contains('ptr-gameplay-surface__content')).toBe(true);
});

it('does not report an interrupted action for an ordinary first-read failure', async () => {
  const h = await setup();
  h.read.mockRejectedValueOnce(new Error('read unavailable'));
  const commandState = vi.fn();
  render(<RealmMapScreen {...h.props} onPtrCommandStateChange={commandState} />);
  await screen.findByRole('button', { name: 'Refresh keep' });
  expect(commandState).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Refresh keep' }));
  await waitFor(() => expect(commandState).toHaveBeenLastCalledWith(false));
  expect(commandState).not.toHaveBeenCalledWith(true);
});

it('retains the unconfirmed signal through a failed post-command read until refreshed state arrives', async () => {
  const h = await setup();
  const commandState = vi.fn();
  render(<RealmMapScreen {...h.props} onPtrCommandStateChange={commandState} />);
  fireEvent.click(await screen.findByRole('button', { name: /food at/ }));
  await waitFor(() => expect((screen.getByRole('button', { name: 'Dispatch Worker 1' }) as HTMLButtonElement).disabled).toBe(false));
  h.read.mockRejectedValueOnce(new Error('confirmation read unavailable'));
  commandState.mockClear();
  fireEvent.click(screen.getByRole('button', { name: 'Dispatch Worker 1' }));
  await screen.findByRole('button', { name: 'Refresh keep' });
  expect(commandState).toHaveBeenLastCalledWith(true);
  expect(commandState).not.toHaveBeenCalledWith(false);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh keep' }));
  await waitFor(() => expect(commandState).toHaveBeenLastCalledWith(false));
  expect(h.dispatch).toHaveBeenCalledOnce();
});

it('recovers focus and presents accurate retry controls when session renewal fails', () => {
  const onRetry = vi.fn();
  const onReturn = vi.fn();
  const mounted = render(<PtrSessionRenewalPanel failed={false} onRetry={onRetry} onReturn={onReturn} />);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Returning to your keep' }));
  expect(screen.getByRole('status').textContent).toBe('Restoring your PTR session…');
  expect(screen.queryByRole('button', { name: 'Retry connection' })).toBeNull();
  screen.getByRole('button', { name: 'Return to Menu' }).focus();
  mounted.rerender(<PtrSessionRenewalPanel failed onRetry={onRetry} onReturn={onReturn} />);
  expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Connection interrupted' }));
  expect(screen.getByRole('status').textContent).toBe('Could not restore your PTR session.');
  expect(screen.queryByText('Connecting to the latest state of your keep.')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Retry connection' }));
  fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
  expect(onRetry).toHaveBeenCalledOnce();
  expect(onReturn).toHaveBeenCalledOnce();
});
