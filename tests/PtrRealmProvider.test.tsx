import { act, cleanup, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const hostState = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
}));

vi.mock('../src/farcaster/miniapp', () => ({
  useMiniAppHost: () => hostState.current,
}));

import {
  createPtrRealmAuthClient,
  isCurrentPtrRealmAuthority,
  type PtrRealmAuthority,
  type PtrRealmAuthClient,
} from '../src/ptr/ptrRealmAuthClient';
import type { PtrRealmConnectionSession } from '../src/ptr/ptrRealmConnection';
import type { AvailablePtrRealmConfig, PtrRealmConfig } from '../src/ptr/ptrRealmConfig';
import {
  PtrRealmProvider,
  usePtrRealm,
  type PtrRealmContextValue,
  type PtrRealmProviderRuntime,
} from '../src/ptr/PtrRealmProvider';
import type { GreaterRealmProviderBridge } from '../src/spacetime/greaterRealmProviderBridge';
import { scriptedCapability04 } from './fixtures/gameplay04Client';

const NOW = 1_788_000_000_000;
const FID = 12_345;
const DATABASE_IDENTITY = 'e'.repeat(64);
const QUICK_AUTH_TOKEN = 'quick.auth.token';
const PRIVATE_PTR_JWT_MARKER = 'ptr-private-jwt-marker';
const CONFIG: AvailablePtrRealmConfig = Object.freeze({
  availability: 'available',
  enabled: true,
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  databaseIdentity: DATABASE_IDENTITY,
});
const UNAVAILABLE_CONFIG: PtrRealmConfig = Object.freeze({ availability: 'unavailable' });

function segment(value: unknown): string {
  const binary = unescape(encodeURIComponent(JSON.stringify(value)));
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

async function issuedAuthority(
  now = NOW,
  scope: Readonly<{ fid?: number; databaseIdentity?: string; authEpoch?: number }> = {},
): Promise<PtrRealmAuthority> {
  const fid = scope.fid ?? FID;
  const databaseIdentity = scope.databaseIdentity ?? DATABASE_IDENTITY;
  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = (issuedAt + 120) * 1_000;
  const jwt = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'ptr-provider-test' })}.${segment({
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${fid}`,
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    auth_version: 2,
    realm_id: 'PTR',
    fid: String(fid),
    ptr_database_identity: databaseIdentity,
    auth_epoch: scope.authEpoch ?? 1,
    roles: ['warpkeep-ptr-owner'],
    iat: issuedAt,
    nbf: issuedAt,
    exp: expiresAt / 1_000,
    session_iat: issuedAt,
    session_exp: expiresAt / 1_000,
    jti: PRIVATE_PTR_JWT_MARKER,
  })}.test_signature`;
  return createPtrRealmAuthClient({
    expectedDatabaseIdentity: databaseIdentity,
    now: () => now,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'authorized',
      realmId: 'PTR',
      databaseIdentity,
      accessToken: jwt,
      tokenType: 'spacetime-access',
      accessExpiresAt: expiresAt,
    }), {
      status: 200,
      headers: {
        'cache-control': 'no-store',
        'content-type': 'application/json',
      },
    })) as typeof fetch,
  }).exchangeQuickAuth(QUICK_AUTH_TOKEN);
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((settle, fail) => {
    resolve = settle;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function installHost(
  getToken = vi.fn(async () => Object.freeze({
    status: 'token' as const,
    token: QUICK_AUTH_TOKEN,
  })),
) {
  hostState.current = Object.freeze({
    state: 'miniapp',
    isMiniApp: true,
    context: Object.freeze({
      user: Object.freeze({ fid: FID }),
      client: Object.freeze({ clientFid: 9_999 }),
    }),
    quickAuth: Object.freeze({ getToken }),
  });
  return getToken;
}

function changeHostScope(change: 'account' | 'client' | 'adapter' | 'eligibility') {
  const prior = hostState.current;
  const context = prior.context as { user: { fid: number }; client: { clientFid: number } };
  hostState.current = Object.freeze({ ...prior,
    ...(change === 'account' ? { context: { ...context, user: { ...context.user, fid: FID + 1 } } } : {}),
    ...(change === 'client' ? { context: { ...context, client: { ...context.client, clientFid: 10_000 } } } : {}),
    ...(change === 'adapter' ? { quickAuth: { ...(prior.quickAuth as object) } } : {}),
    ...(change === 'eligibility' ? { state: 'recovery', isMiniApp: false } : {}),
  });
}

const READY_BRIDGE: GreaterRealmProviderBridge = Object.freeze({
  phase: 'available',
  presentationAllowed: true,
  sessionGeneration: 1,
  createRuntime: vi.fn(),
});

function runtimeHarness(
  authority: PtrRealmAuthority,
  overrides: Partial<PtrRealmProviderRuntime> = {},
) {
  let transportFailure: (() => void) | undefined;
  const session = Object.freeze({
    realmId: 'PTR',
    generation: 1,
  }) as unknown as PtrRealmConnectionSession;
  const exchangeQuickAuth = vi.fn<PtrRealmAuthClient['exchangeQuickAuth']>(async () => authority);
  const isSessionCurrent: PtrRealmProviderRuntime['isSessionCurrent'] = candidate => (
    candidate === session
  );
  const runtime: PtrRealmProviderRuntime = Object.freeze({
    now: () => NOW,
    createAuthClient: vi.fn((): PtrRealmAuthClient => Object.freeze({ exchangeQuickAuth })),
    connect: vi.fn(async (options) => {
      transportFailure = () => options.onTransportFailure?.('transport-unavailable');
      return session;
    }),
    preflight: vi.fn(async () => Object.freeze({ castleId: FID, q: 7, r: -4 })),
    createBridge: vi.fn(() => READY_BRIDGE),
    createGameplay04: vi.fn(() => scriptedCapability04().capability),
    isSessionCurrent,
    closeSession: vi.fn(),
    ...overrides,
  });
  return {
    runtime,
    session,
    exchangeQuickAuth,
    transportFailure: () => transportFailure?.(),
  };
}

let captured: PtrRealmContextValue | undefined;

function currentContext(): PtrRealmContextValue {
  if (!captured) throw new Error('PTR context was not captured.');
  return captured;
}

function Capture() {
  captured = usePtrRealm();
  return <output data-testid="ptr-phase">{captured.phase}</output>;
}

function mount(
  config: PtrRealmConfig,
  runtime: PtrRealmProviderRuntime,
  children: ReactNode = <Capture />,
) {
  return render(
    <PtrRealmProvider config={config} runtime={runtime}>
      {children}
    </PtrRealmProvider>,
  );
}

async function activeRenewalHarness() {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  const authority = await issuedAuthority();
  const getToken = installHost();
  const connections: Parameters<PtrRealmProviderRuntime['connect']>[0][] = [];
  const liveSessions = new Map<PtrRealmConnectionSession, {
    authority: PtrRealmAuthority;
    expire?: () => void;
  }>();
  const harness = runtimeHarness(authority, {
    now: Date.now,
    connect: vi.fn(async options => {
      connections.push(options);
      const session = Object.freeze({ realmId: 'PTR', generation: options.generation }) as unknown as PtrRealmConnectionSession;
      liveSessions.set(session, { authority: options.authority });
      return session;
    }),
    isSessionCurrent: (session, candidate, now) => (
      liveSessions.get(session as PtrRealmConnectionSession)?.authority === candidate
      && isCurrentPtrRealmAuthority(candidate, now)
    ),
    createBridge: vi.fn(session => Object.freeze({ ...READY_BRIDGE, sessionGeneration: session.generation })),
    createGameplay04: vi.fn(session => {
      const scripted = scriptedCapability04();
      liveSessions.get(session)!.expire = scripted.expire;
      return Object.freeze({
        ...scripted.capability,
        scope: Object.freeze({ ...scripted.capability.scope, generation: session.generation }),
      });
    }),
    closeSession: vi.fn(session => {
      if (session) {
        liveSessions.get(session)?.expire?.();
        liveSessions.delete(session);
      }
    }),
  });
  const mounted = mount(CONFIG, harness.runtime);
  await act(async () => currentContext().checkAccess());
  await act(async () => currentContext().enter());
  act(() => currentContext().setContinuationActive(true));
  harness.exchangeQuickAuth.mockImplementation(async () => issuedAuthority(Date.now()));
  return { ...harness, authority, getToken, connections, mounted };
}

afterEach(() => {
  cleanup();
  captured = undefined;
  hostState.current = {};
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('active PTR session continuation', () => {
  it('preserves the current lease across MiniApp presentation-only snapshot changes', async () => {
    const harness = await activeRenewalHarness();
    const authority = currentContext().authority;
    const capability = currentContext().gameplay04;
    const oldHost = hostState.current;
    const context = oldHost.context as { user: { fid: number }; client: { clientFid: number } };
    hostState.current = Object.freeze({ ...oldHost,
      context: Object.freeze({ ...context,
        user: Object.freeze({ ...context.user, displayName: 'Updated presentation' }),
        client: Object.freeze({ ...context.client, safeAreaInsets: { top: 24, right: 0, bottom: 12, left: 0 }, added: true }),
      }),
      notificationPresentation: 'enabled-hint',
    });
    harness.mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
    expect(currentContext().phase).toBe('ready');
    expect(currentContext().authority).toBe(authority);
    expect(currentContext().gameplay04).toBe(capability);
    expect(harness.runtime.closeSession).not.toHaveBeenCalled();
    expect(harness.getToken).toHaveBeenCalledTimes(1);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('ready');
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(harness.getToken).toHaveBeenLastCalledWith({ force: true });
  });

  it.each(['account', 'client', 'adapter', 'eligibility'] as const)(
    'retires a ready lease after a MiniApp %s change', async change => {
      const harness = await activeRenewalHarness();
      const previous = currentContext().gameplay04!;
      changeHostScope(change);
      harness.mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
      expect(currentContext().phase).toBe(change === 'eligibility' ? 'unavailable' : 'unknown');
      expect(currentContext().authority).toBeNull();
      expect(currentContext().gameplay04).toBeNull();
      expect(previous.isCurrent()).toBe(false);
      expect(isCurrentPtrRealmAuthority(harness.authority, NOW)).toBe(false);
      await act(async () => currentContext().renewSession());
      expect(harness.getToken).toHaveBeenCalledTimes(1);
      expect(previous.mutate).not.toHaveBeenCalled();
    },
  );

  it.each(['account', 'client', 'adapter', 'eligibility'] as const)(
    'cancels renewal and retires its late authority after a MiniApp %s change', async change => {
      const harness = await activeRenewalHarness();
      const pending = deferred<PtrRealmAuthority>();
      harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
      await act(async () => vi.advanceTimersByTimeAsync(120_000));
      const signal = harness.exchangeQuickAuth.mock.calls[1]![1] as AbortSignal;
      const late = await issuedAuthority(Date.now());
      changeHostScope(change);
      harness.mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
      expect(signal.aborted).toBe(true);
      await act(async () => pending.resolve(late));
      expect(currentContext().phase).toBe(change === 'eligibility' ? 'unavailable' : 'unknown');
      expect(isCurrentPtrRealmAuthority(late, Date.now())).toBe(false);
      expect(harness.runtime.connect).toHaveBeenCalledTimes(1);
      expect(currentContext().gameplay04).toBeNull();
      await act(async () => currentContext().renewSession());
      expect(harness.getToken).toHaveBeenCalledTimes(2);
    },
  );

  it('allows renewal to finish after a presentation-only update during exchange', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<PtrRealmAuthority>();
    harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    const signal = harness.exchangeQuickAuth.mock.calls[1]![1] as AbortSignal;
    hostState.current = Object.freeze({ ...hostState.current, notificationPresentation: 'enabled-hint' });
    harness.mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
    expect(currentContext().phase).toBe('renewing');
    expect(signal.aborted).toBe(false);
    await act(async () => pending.resolve(await issuedAuthority(Date.now())));
    expect(currentContext().phase).toBe('ready');
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(harness.runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('detects an account change even when a host facade retains object identity', async () => {
    const authority = await issuedAuthority();
    installHost();
    const context = { user: { fid: FID }, client: { clientFid: 9_999 } };
    const stableHost = { ...hostState.current, context };
    hostState.current = stableHost;
    const harness = runtimeHarness(authority);
    const mounted = mount(CONFIG, harness.runtime);
    await act(async () => currentContext().checkAccess());
    await act(async () => currentContext().enter());
    context.user.fid = FID + 1;
    mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
    expect(hostState.current).toBe(stableHost);
    expect(currentContext().phase).toBe('unknown');
    expect(currentContext().authority).toBeNull();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    expect(harness.runtime.closeSession).toHaveBeenCalledWith(harness.session);
  });

  it('rejects an in-flight access result after a stable host facade changes account', async () => {
    const authority = await issuedAuthority();
    installHost();
    const context = { user: { fid: FID }, client: { clientFid: 9_999 } };
    hostState.current = { ...hostState.current, context };
    const pending = deferred<PtrRealmAuthority>();
    const harness = runtimeHarness(authority);
    harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
    const mounted = mount(CONFIG, harness.runtime);
    await act(async () => { void currentContext().checkAccess(); });
    expect(harness.exchangeQuickAuth).toHaveBeenCalledOnce();
    // The async boundary must compare the captured scalar even before React
    // has committed a render that can abort the old operation.
    context.user.fid = FID + 1;
    await act(async () => pending.resolve(authority));
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    expect(harness.runtime.connect).not.toHaveBeenCalled();
    mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
    expect(currentContext().phase).toBe('unknown');
  });

  it('keeps a valid lease until expiry, then forces fresh access and creates a new capability', async () => {
    const harness = await activeRenewalHarness();
    const previous = currentContext().gameplay04!;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(119_999);
      await currentContext().renewSession();
      window.dispatchEvent(new Event('focus'));
    });
    expect(harness.getToken).toHaveBeenCalledTimes(1);
    expect(harness.runtime.closeSession).not.toHaveBeenCalled();
    expect(currentContext().gameplay04).toBe(previous);

    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(currentContext().phase).toBe('ready');
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(harness.getToken).toHaveBeenLastCalledWith({ force: true });
    expect(harness.runtime.preflight).toHaveBeenCalledTimes(2);
    expect(harness.runtime.createGameplay04).toHaveBeenCalledTimes(2);
    expect(previous.isCurrent()).toBe(false);
    expect(isCurrentPtrRealmAuthority(harness.authority, NOW)).toBe(false);
    expect(currentContext().authority).not.toBe(harness.authority);
    expect(currentContext().gameplay04).not.toBe(previous);
    expect(currentContext().gameplay04!.scope.generation).toBeGreaterThan(previous.scope.generation);
    expect(previous.mutate).not.toHaveBeenCalled();
    expect(currentContext().gameplay04!.mutate).not.toHaveBeenCalled();
    // A disconnect belonging to the expired socket cannot revoke its replacement.
    act(() => harness.connections[0]!.onTransportFailure?.('transport-unavailable'));
    expect(currentContext().phase).toBe('ready');
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(harness.getToken).toHaveBeenCalledTimes(3);
    expect(currentContext().phase).toBe('ready');
  });

  it('coalesces renewal and hides all authority until the new preflight completes', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<{ castleId: number; q: number; r: number }>();
    vi.mocked(harness.runtime.preflight).mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext()).toMatchObject({
      phase: 'renewing', statusCode: 'ptr-renewing', authority: null,
      bridge: null, viewAnchor: null, gameplay04: null, presentationAuthority: null,
    });
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = currentContext().renewSession();
      second = currentContext().renewSession();
      window.dispatchEvent(new Event('focus'));
    });
    expect(first).toBe(second);
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(harness.runtime.createGameplay04).toHaveBeenCalledTimes(1);
    await act(async () => {
      pending.resolve({ castleId: FID, q: 7, r: -4 });
      await first;
    });
    expect(currentContext().phase).toBe('ready');
  });

  it.each(['focus', 'pageshow', 'visibilitychange'] as const)(
    'checks absolute expiry on %s when a background timer has not fired',
    async event => {
      const harness = await activeRenewalHarness();
      vi.setSystemTime(NOW + 121_000);
      const pending = deferred<PtrRealmAuthority>();
      harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
      await act(async () => {
        (event === 'visibilitychange' ? document : window).dispatchEvent(new Event(event));
      });
      expect(currentContext().phase).toBe('renewing');
      await act(async () => {
        pending.resolve(await issuedAuthority(Date.now()));
        await currentContext().renewSession();
      });
      expect(harness.getToken).toHaveBeenCalledTimes(2);
      expect(currentContext().phase).toBe('ready');
      expect(currentContext().authority!.expiresAt).toBe(NOW + 241_000);
    },
  );

  it('disarming a ready session keeps menu expiry manual', async () => {
    const harness = await activeRenewalHarness();
    act(() => currentContext().setContinuationActive(false));
    expect(currentContext().phase).toBe('ready');
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('unknown');
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(1);
    expect(currentContext().authority).toBeNull();
  });

  it.each(['disarm', 'leave', 'unmount', 'host-change', 'config-change'] as const)(
    'cancels %s during exchange and retires a late authority',
    async cancellation => {
      const harness = await activeRenewalHarness();
      const pending = deferred<PtrRealmAuthority>();
      harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
      await act(async () => vi.advanceTimersByTimeAsync(120_000));
      const signal = harness.exchangeQuickAuth.mock.calls[1]![1] as AbortSignal;
      const lateAuthority = await issuedAuthority(Date.now());
      act(() => {
        if (cancellation === 'disarm') currentContext().setContinuationActive(false);
        if (cancellation === 'leave') currentContext().leave();
        if (cancellation === 'unmount') harness.mounted.unmount();
        if (cancellation === 'host-change') {
          installHost();
          harness.mounted.rerender(<PtrRealmProvider config={CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
        }
        if (cancellation === 'config-change') {
          harness.mounted.rerender(<PtrRealmProvider config={UNAVAILABLE_CONFIG} runtime={harness.runtime}><Capture /></PtrRealmProvider>);
        }
      });
      expect(signal.aborted).toBe(true);
      await act(async () => pending.resolve(lateAuthority));
      expect(isCurrentPtrRealmAuthority(lateAuthority, Date.now())).toBe(false);
      expect(harness.runtime.connect).toHaveBeenCalledTimes(1);
      if (cancellation !== 'unmount') {
        expect(currentContext().gameplay04).toBeNull();
        await act(async () => currentContext().renewSession());
        expect(harness.getToken).toHaveBeenCalledTimes(2);
      }
    },
  );

  it('closes a pending preflight on leave and ignores its late success', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<{ castleId: number; q: number; r: number }>();
    vi.mocked(harness.runtime.preflight).mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    const renewedAuthority = harness.connections[1]!.authority;
    act(() => currentContext().leave());
    expect(isCurrentPtrRealmAuthority(renewedAuthority, Date.now())).toBe(false);
    expect(harness.connections[1]!.signal!.aborted).toBe(true);
    await act(async () => pending.resolve({ castleId: FID, q: 7, r: -4 }));
    expect(currentContext().phase).toBe('unknown');
    expect(harness.runtime.createGameplay04).toHaveBeenCalledTimes(1);
  });

  it('does not exchange a late Quick Auth result after continuation is cancelled', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<{ status: 'token'; token: typeof QUICK_AUTH_TOKEN }>();
    harness.getToken.mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('renewing');
    act(() => currentContext().setContinuationActive(false));
    await act(async () => pending.resolve({ status: 'token', token: QUICK_AUTH_TOKEN }));
    expect(harness.exchangeQuickAuth).toHaveBeenCalledTimes(1);
    expect(currentContext().phase).toBe('unknown');
  });

  it('retires a superseded renewal result without disturbing a later manual session', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<PtrRealmAuthority>();
    harness.exchangeQuickAuth.mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    const staleAuthority = await issuedAuthority(Date.now());
    act(() => currentContext().leave());
    await act(async () => currentContext().checkAccess());
    await act(async () => currentContext().enter());
    const replacement = currentContext().authority;
    const capability = currentContext().gameplay04;
    await act(async () => pending.resolve(staleAuthority));
    expect(isCurrentPtrRealmAuthority(staleAuthority, Date.now())).toBe(false);
    expect(isCurrentPtrRealmAuthority(replacement, Date.now())).toBe(true);
    expect(currentContext().phase).toBe('ready');
    expect(currentContext().gameplay04).toBe(capability);
    expect(currentContext().authority).toBe(replacement);
  });

  it.each([401, 403])('disarms continuation after an exchange denial (%s)', async status => {
    const harness = await activeRenewalHarness();
    const deniedClient = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE_IDENTITY,
      now: Date.now,
      fetch: vi.fn(async () => new Response(null, { status })) as typeof fetch,
    });
    harness.exchangeQuickAuth.mockImplementationOnce(deniedClient.exchangeQuickAuth);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('not-admitted');
    expect(currentContext().authority).toBeNull();
    expect(currentContext().presentationAuthority).toEqual(status === 403 ? {
      source: 'server-verified', admission: 'not-admitted',
    } : null);
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(harness.runtime.connect).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['owner', { fid: FID + 1 }],
    ['database', { databaseIdentity: 'f'.repeat(64) }],
    ['auth epoch', { authEpoch: 2 }],
  ] as const)('rejects a changed %s and disarms continuation', async (_label, scope) => {
    const harness = await activeRenewalHarness();
    const mismatch = await issuedAuthority(NOW + 120_000, scope);
    harness.exchangeQuickAuth.mockResolvedValueOnce(mismatch);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('not-admitted');
    expect(currentContext().authority).toBeNull();
    expect(harness.runtime.connect).toHaveBeenCalledTimes(1);
    expect(isCurrentPtrRealmAuthority(mismatch, Date.now())).toBe(false);
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(2);
  });

  it('requires explicit retry after an exchange failure and forces new Quick Auth again', async () => {
    const harness = await activeRenewalHarness();
    harness.exchangeQuickAuth.mockRejectedValueOnce(new Error('offline'));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext()).toMatchObject({
      phase: 'renewal-error', failure: 'access-unavailable', authority: null, gameplay04: null,
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300_000);
      window.dispatchEvent(new Event('focus'));
    });
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(3);
    expect(harness.getToken).toHaveBeenLastCalledWith({ force: true });
    expect(currentContext().phase).toBe('ready');
  });

  it('clears single-flight state even when Quick Auth throws synchronously', async () => {
    const harness = await activeRenewalHarness();
    harness.getToken.mockImplementationOnce(() => { throw new Error('host unavailable'); });
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext().phase).toBe('renewal-error');
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(3);
    expect(currentContext().phase).toBe('ready');
  });

  it.each(['connect', 'preflight'] as const)('allows explicit retry after renewal %s fails', async stage => {
    const harness = await activeRenewalHarness();
    vi.mocked(harness.runtime[stage]).mockRejectedValueOnce(new Error('disconnected'));
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(currentContext()).toMatchObject({
      phase: 'renewal-error', failure: 'transport-unavailable', authority: null,
      bridge: null, gameplay04: null,
    });
    await act(async () => currentContext().renewSession());
    expect(harness.getToken).toHaveBeenCalledTimes(3);
    expect(currentContext().phase).toBe('ready');
  });

  it('revokes the renewing connection on its transport failure and ignores late preflight', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<{ castleId: number; q: number; r: number }>();
    vi.mocked(harness.runtime.preflight).mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    const attempt = harness.connections[1]!;
    act(() => attempt.onTransportFailure?.('transport-unavailable'));
    expect(currentContext().phase).toBe('renewal-error');
    expect(isCurrentPtrRealmAuthority(attempt.authority, Date.now())).toBe(false);
    await act(async () => pending.resolve({ castleId: FID, q: 7, r: -4 }));
    expect(currentContext().phase).toBe('renewal-error');
    expect(harness.runtime.createGameplay04).toHaveBeenCalledTimes(1);
    await act(async () => currentContext().renewSession());
    expect(currentContext().phase).toBe('ready');
  });

  it('does not loop if a replacement lease expires during preflight', async () => {
    const harness = await activeRenewalHarness();
    const pending = deferred<{ castleId: number; q: number; r: number }>();
    vi.mocked(harness.runtime.preflight).mockReturnValueOnce(pending.promise);
    await act(async () => vi.advanceTimersByTimeAsync(240_000));
    expect(currentContext().phase).toBe('renewal-error');
    expect(harness.getToken).toHaveBeenCalledTimes(2);
    expect(currentContext().gameplay04).toBeNull();
    await act(async () => pending.resolve({ castleId: FID, q: 7, r: -4 }));
    expect(currentContext().phase).toBe('renewal-error');
    await act(async () => currentContext().renewSession());
    expect(currentContext().phase).toBe('ready');
    expect(harness.getToken).toHaveBeenCalledTimes(3);
  });
});

describe('PTR realm provider', () => {
  it('publishes gameplay only after bridge preflight and clears it on leave or factory failure', async () => {
    const authority = await issuedAuthority();
    installHost();
    const harness = runtimeHarness(authority);
    mount(CONFIG, harness.runtime);
    expect(currentContext().gameplay04).toBeNull();
    await act(async () => currentContext().checkAccess());
    expect(currentContext().gameplay04).toBeNull();
    await act(async () => currentContext().enter());
    expect(currentContext().gameplay04).toBe(vi.mocked(harness.runtime.createGameplay04).mock.results[0].value);
    expect(harness.runtime.createGameplay04).toHaveBeenCalledWith(harness.session, authority, { castleId: FID, q: 7, r: -4 }, harness.runtime.now);
    expect(vi.mocked(harness.runtime.createBridge).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(harness.runtime.createGameplay04).mock.invocationCallOrder[0]);
    act(() => currentContext().leave());
    expect(currentContext().gameplay04).toBeNull();
    cleanup();
    const failing = runtimeHarness(await issuedAuthority(), { createGameplay04: () => { throw new Error(); } });
    mount(CONFIG, failing.runtime);
    await act(async () => currentContext().checkAccess());
    await act(async () => currentContext().enter());
    expect(currentContext()).toMatchObject({ phase: 'error', gameplay04: null, bridge: null, viewAnchor: null });
  });
  it.each([
    ['disabled build', UNAVAILABLE_CONFIG, true],
    ['regular web', CONFIG, false],
  ] as const)('makes no auth or connection call for %s', async (_name, config, miniApp) => {
    const authority = await issuedAuthority();
    const getToken = vi.fn(async () => Object.freeze({
      status: 'token' as const,
      token: QUICK_AUTH_TOKEN,
    }));
    if (miniApp) installHost(getToken);
    else hostState.current = Object.freeze({
      state: 'regular-web',
      isMiniApp: false,
      context: null,
      quickAuth: Object.freeze({ getToken }),
    });
    const harness = runtimeHarness(authority);
    mount(config, harness.runtime);

    await act(async () => captured?.checkAccess());

    expect(captured?.phase).toBe('unavailable');
    expect(getToken).not.toHaveBeenCalled();
    expect(harness.runtime.createAuthClient).not.toHaveBeenCalled();
    expect(harness.runtime.connect).not.toHaveBeenCalled();
  });

  it('checks access only, with forced memory-only Quick Auth, before entering', async () => {
    const authority = await issuedAuthority();
    const getToken = installHost();
    const harness = runtimeHarness(authority);
    mount(CONFIG, harness.runtime);

    await act(async () => captured?.checkAccess());

    expect(getToken).toHaveBeenCalledWith({ force: true });
    expect(harness.exchangeQuickAuth).toHaveBeenCalledWith(
      QUICK_AUTH_TOKEN,
      expect.any(AbortSignal),
    );
    expect(captured).toMatchObject({
      phase: 'admitted',
      presentationAuthority: { source: 'server-verified', admission: 'admitted' },
      authority,
      bridge: null,
      viewAnchor: null,
    });
    expect(harness.runtime.connect).not.toHaveBeenCalled();
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(QUICK_AUTH_TOKEN);
    expect(serialized).not.toContain(PRIVATE_PTR_JWT_MARKER);
    expect(serialized).not.toMatch(/bearer|accessToken|jwt/iu);
  });

  it('publishes ready only after connection and validated bootstrap preflight', async () => {
    const authority = await issuedAuthority();
    installHost();
    const connectFlight = deferred<PtrRealmConnectionSession>();
    const preflightFlight = deferred<Readonly<{ castleId: number; q: number; r: number }>>();
    const harness = runtimeHarness(authority, {
      connect: vi.fn(async () => connectFlight.promise),
      preflight: vi.fn(async () => preflightFlight.promise),
    });
    mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());

    let entering!: Promise<void>;
    await act(async () => {
      entering = captured!.enter();
      await Promise.resolve();
    });
    expect(captured?.phase).toBe('connecting');
    expect(captured?.bridge).toBeNull();

    await act(async () => {
      connectFlight.resolve(harness.session);
      await Promise.resolve();
    });
    expect(captured?.phase).toBe('connecting');
    expect(captured?.bridge).toBeNull();

    await act(async () => {
      preflightFlight.resolve(Object.freeze({ castleId: FID, q: 7, r: -4 }));
      await entering;
    });
    expect(captured).toMatchObject({
      phase: 'ready',
      authority,
      bridge: READY_BRIDGE,
      viewAnchor: { castleId: FID, q: 7, r: -4 },
    });
    expect(captured?.bridge?.presentationAllowed).toBe(true);
    const serialized = JSON.stringify(captured);
    expect(serialized).not.toContain(QUICK_AUTH_TOKEN);
    expect(serialized).not.toContain(PRIVATE_PTR_JWT_MARKER);
    expect(serialized).not.toMatch(/bearer|accessToken|jwt/iu);
  });

  it('discards stale access and connection results after replacement or leave', async () => {
    const authority = await issuedAuthority();
    installHost();
    const firstAccess = deferred<PtrRealmAuthority>();
    const exchangeQuickAuth = vi.fn()
      .mockReturnValueOnce(firstAccess.promise)
      .mockResolvedValueOnce(authority);
    const harness = runtimeHarness(authority, {
      createAuthClient: vi.fn(() => Object.freeze({ exchangeQuickAuth })),
    });
    mount(CONFIG, harness.runtime);

    let first!: Promise<void>;
    await act(async () => {
      first = captured!.checkAccess();
      await Promise.resolve();
    });
    await act(async () => captured?.checkAccess());
    expect(captured?.phase).toBe('admitted');

    await act(async () => {
      firstAccess.resolve(authority);
      await first;
    });
    expect(captured?.phase).toBe('admitted');

    const lateConnection = deferred<PtrRealmConnectionSession>();
    const lateAuthority = await issuedAuthority();
    const lateHarness = runtimeHarness(lateAuthority, {
      connect: vi.fn(async () => lateConnection.promise),
    });
    cleanup();
    captured = undefined;
    mount(CONFIG, lateHarness.runtime);
    await act(async () => captured?.checkAccess());
    let entering!: Promise<void>;
    await act(async () => {
      entering = captured!.enter();
      await Promise.resolve();
      captured!.leave();
    });
    await act(async () => {
      lateConnection.resolve(lateHarness.session);
      await entering;
    });
    expect(currentContext().phase).toBe('unknown');
    expect(lateHarness.runtime.closeSession).toHaveBeenCalledWith(lateHarness.session);
    expect(currentContext().authority).toBeNull();
    expect(currentContext().bridge).toBeNull();
  });

  it('closes the live session before revoking retained authority on leave', async () => {
    const authority = await issuedAuthority();
    installHost();
    const authorityWasLiveDuringClose: boolean[] = [];
    const harness = runtimeHarness(authority, {
      closeSession: vi.fn(() => {
        authorityWasLiveDuringClose.push(isCurrentPtrRealmAuthority(authority, NOW));
      }),
    });
    mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    act(() => captured?.leave());

    expect(authorityWasLiveDuringClose).toEqual([true]);
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    expect(captured?.phase).toBe('unknown');
  });

  it('revokes retained authority on transport failure', async () => {
    const authority = await issuedAuthority();
    installHost();
    const harness = runtimeHarness(authority);
    mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    act(() => harness.transportFailure());
    await waitFor(() => expect(captured?.phase).toBe('error'));
    expect(captured?.failure).toBe('transport-unavailable');
    expect(captured?.authority).toBeNull();
    expect(captured?.bridge).toBeNull();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
  });

  it('revokes retained authority on host replacement', async () => {
    const authority = await issuedAuthority();
    installHost();
    const harness = runtimeHarness(authority);
    const view = mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    const replacementGetToken = installHost();
    view.rerender(
      <PtrRealmProvider config={CONFIG} runtime={harness.runtime}>
        <Capture />
      </PtrRealmProvider>,
    );
    await waitFor(() => expect(captured?.phase).toBe('unknown'));
    expect(harness.runtime.closeSession).toHaveBeenCalled();
    expect(replacementGetToken).not.toHaveBeenCalled();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
  });

  it('revokes retained authority when PTR public configuration changes', async () => {
    const authority = await issuedAuthority();
    installHost();
    const harness = runtimeHarness(authority);
    const view = mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    view.rerender(
      <PtrRealmProvider config={UNAVAILABLE_CONFIG} runtime={harness.runtime}>
        <Capture />
      </PtrRealmProvider>,
    );

    await waitFor(() => expect(captured?.phase).toBe('unavailable'));
    expect(harness.runtime.closeSession).toHaveBeenCalledWith(harness.session);
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
  });

  it('revokes retained authority on unmount', async () => {
    const authority = await issuedAuthority();
    installHost();
    const harness = runtimeHarness(authority);
    const view = mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());
    view.unmount();

    expect(harness.runtime.closeSession).toHaveBeenCalledWith(harness.session);
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
  });

  it('retires a stale exchanged authority instead of publishing it across runtime scope', async () => {
    const authority = await issuedAuthority();
    installHost();
    const exchangeFlight = deferred<PtrRealmAuthority>();
    const firstHarness = runtimeHarness(authority, {
      createAuthClient: vi.fn(() => Object.freeze({
        exchangeQuickAuth: vi.fn(() => exchangeFlight.promise),
      })),
    });
    const secondAuthority = await issuedAuthority();
    const secondHarness = runtimeHarness(secondAuthority);
    const view = mount(CONFIG, firstHarness.runtime);
    let checking!: Promise<void>;
    await act(async () => {
      checking = captured!.checkAccess();
      await Promise.resolve();
    });

    view.rerender(
      <PtrRealmProvider config={CONFIG} runtime={secondHarness.runtime}>
        <Capture />
      </PtrRealmProvider>,
    );
    await act(async () => {
      exchangeFlight.resolve(authority);
      await checking;
    });

    expect(captured?.phase).toBe('unknown');
    expect(captured?.authority).toBeNull();
    expect(secondHarness.runtime.createAuthClient).not.toHaveBeenCalled();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
  });

  it('expires the owner authority in memory and requires a fresh access check', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const authority = await issuedAuthority();
    const freshAuthority = await issuedAuthority();
    const getToken = installHost();
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(authority)
      .mockResolvedValueOnce(freshAuthority);
    const harness = runtimeHarness(authority, {
      createAuthClient: vi.fn(() => Object.freeze({ exchangeQuickAuth })),
    });
    mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    await act(async () => vi.advanceTimersByTimeAsync(120_000));

    expect(captured?.phase).toBe('unknown');
    expect(captured?.authority).toBeNull();
    expect(captured?.bridge).toBeNull();
    expect(harness.runtime.closeSession).toHaveBeenCalled();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);

    await act(async () => captured?.checkAccess());

    expect(getToken).toHaveBeenCalledTimes(2);
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);
    expect(captured?.phase).toBe('admitted');
    expect(harness.runtime.connect).toHaveBeenCalledTimes(1);
  });

  it('requires one explicit fresh access check after an access error', async () => {
    const authority = await issuedAuthority();
    installHost();
    const exchangeQuickAuth = vi.fn()
      .mockRejectedValueOnce(new Error('temporary access failure'))
      .mockResolvedValueOnce(authority);
    const harness = runtimeHarness(authority, {
      createAuthClient: vi.fn(() => Object.freeze({ exchangeQuickAuth })),
    });
    mount(CONFIG, harness.runtime);

    await act(async () => captured?.checkAccess());
    expect(captured?.phase).toBe('error');
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(1);
    expect(harness.runtime.connect).not.toHaveBeenCalled();

    await act(async () => captured?.checkAccess());
    expect(captured?.phase).toBe('admitted');
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);
    expect(harness.runtime.connect).not.toHaveBeenCalled();
  });

  it('never publishes admitted when authority expires while the expiry timer is installed', async () => {
    const authority = await issuedAuthority();
    installHost();
    const runtimeNow = vi.fn()
      .mockReturnValueOnce(NOW)
      .mockReturnValue(NOW + 120_000);
    const harness = runtimeHarness(authority, { now: runtimeNow });
    mount(CONFIG, harness.runtime);

    await act(async () => captured?.checkAccess());

    expect(captured?.phase).toBe('unknown');
    expect(captured?.authority).toBeNull();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
    expect(harness.runtime.connect).not.toHaveBeenCalled();
  });

  it('publishes server denial without exposing opaque authority or a bridge', async () => {
    installHost();
    const authority = await issuedAuthority();
    const deniedClient = createPtrRealmAuthClient({
      expectedDatabaseIdentity: DATABASE_IDENTITY,
      now: () => NOW,
      fetch: vi.fn(async () => new Response(null, { status: 403 })) as typeof fetch,
    });
    const harness = runtimeHarness(authority, {
      createAuthClient: vi.fn(() => deniedClient),
    });
    mount(CONFIG, harness.runtime);

    await act(async () => captured?.checkAccess());

    expect(captured).toMatchObject({
      phase: 'not-admitted',
      presentationAuthority: { source: 'server-verified', admission: 'not-admitted' },
      authority: null,
      bridge: null,
      viewAnchor: null,
    });
    expect(harness.runtime.connect).not.toHaveBeenCalled();
  });
});
