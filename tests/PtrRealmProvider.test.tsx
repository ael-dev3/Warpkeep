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

async function issuedAuthority(): Promise<PtrRealmAuthority> {
  const issuedAt = Math.floor(NOW / 1_000);
  const expiresAt = (issuedAt + 120) * 1_000;
  const jwt = `${segment({ alg: 'ES256', typ: 'JWT', kid: 'ptr-provider-test' })}.${segment({
    iss: 'https://auth.warpkeep.com',
    sub: `farcaster:${FID}`,
    aud: ['warpkeep-ptr-spacetimedb'],
    token_type: 'spacetime-access',
    auth_version: 2,
    realm_id: 'PTR',
    fid: String(FID),
    auth_epoch: 1,
    roles: ['warpkeep-ptr-owner'],
    iat: issuedAt,
    nbf: issuedAt,
    exp: expiresAt / 1_000,
    session_iat: issuedAt,
    session_exp: expiresAt / 1_000,
    jti: PRIVATE_PTR_JWT_MARKER,
  })}.test_signature`;
  return createPtrRealmAuthClient({
    expectedDatabaseIdentity: DATABASE_IDENTITY,
    now: () => NOW,
    fetch: vi.fn(async () => new Response(JSON.stringify({
      version: 1,
      status: 'authorized',
      realmId: 'PTR',
      identity: { fid: FID },
      databaseIdentity: DATABASE_IDENTITY,
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
  const exchangeQuickAuth = vi.fn(async () => authority);
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

afterEach(() => {
  cleanup();
  captured = undefined;
  hostState.current = {};
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('PTR realm provider', () => {
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
    installHost();
    const harness = runtimeHarness(authority);
    mount(CONFIG, harness.runtime);
    await act(async () => captured?.checkAccess());
    await act(async () => captured?.enter());

    await act(async () => vi.advanceTimersByTimeAsync(120_000));

    expect(captured?.phase).toBe('unknown');
    expect(captured?.authority).toBeNull();
    expect(captured?.bridge).toBeNull();
    expect(harness.runtime.closeSession).toHaveBeenCalled();
    expect(isCurrentPtrRealmAuthority(authority, NOW)).toBe(false);
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
