import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAuthProvider,
  useFarcasterAuth
} from '../src/farcaster/FarcasterAuthProvider';
import {
  MiniAppHostProvider,
  type MiniAppBrowserRuntime,
  type MiniAppSdk
} from '../src/farcaster/miniapp';
import type {
  FarcasterOidcBridgeClient,
  FarcasterQuickAuthSessionResponse
} from '../src/farcaster/farcasterAuthTypes';
import { createFarcasterOidcBridgeClient } from '../src/farcaster/farcasterOidcBridgeClient';

const ISSUER = 'https://auth.warpkeep.example';
const AUDIENCE = 'warpkeep-spacetimedb';
const FID = 12_345;
const QUICK_AUTH_TOKEN = `${'a'.repeat(16)}.${'b'.repeat(24)}.${'c'.repeat(32)}`;

function encodeSegment(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function authorized(
  fid = FID,
  now = Date.now()
): FarcasterQuickAuthSessionResponse {
  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = issuedAt + 10 * 60;
  const jwt = `${encodeSegment({
    alg: 'ES256',
    typ: 'JWT',
    kid: 'test-key'
  })}.${encodeSegment({
    iss: ISSUER,
    sub: `farcaster:${fid}`,
    aud: [AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(fid),
    auth_version: 2,
    auth_epoch: 7,
    roles: [],
    iat: issuedAt,
    nbf: issuedAt,
    exp: expiresAt,
    session_iat: issuedAt,
    session_exp: expiresAt,
    jti: `quick-auth-${fid}-${issuedAt}`
  })}.test_signature`;
  return {
    version: 2,
    status: 'authorized',
    identity: { fid },
    accessToken: jwt,
    tokenType: 'spacetime-access',
    accessExpiresAt: expiresAt * 1_000
  };
}

function pendingAdmission(fid = FID): FarcasterQuickAuthSessionResponse {
  return {
    version: 2,
    status: 'pending-admission',
    identity: { fid }
  };
}

function miniAppRuntime(): MiniAppBrowserRuntime {
  return {
    search: () => '?miniApp=true',
    viewport: () => ({ width: 390, height: 844 }),
    document,
    getMountedShell: () => document.body,
    waitForAnimationFrame: async () => {}
  };
}

function miniAppSdk(
  getToken: (
    options?: { force?: boolean }
  ) => Promise<unknown> = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN })),
  contextFid = FID
): MiniAppSdk {
  return {
    isInMiniApp: vi.fn(async () => true),
    context: Promise.resolve({
      user: {
        fid: contextFid,
        username: 'keeper',
        displayName: 'The Keeper',
        pfpUrl: 'https://images.example/keeper.png'
      },
      client: {
        clientFid: 9_150,
        added: true,
        platformType: 'mobile',
        safeAreaInsets: { top: 20, right: 0, bottom: 12, left: 0 }
      },
      features: { haptics: false },
      location: { type: 'launcher' }
    }),
    getCapabilities: vi.fn(async () => ['actions.ready']),
    quickAuth: { getToken },
    actions: {
      ready: vi.fn(async () => {})
    }
  };
}

function bridge(
  exchangeQuickAuth: NonNullable<FarcasterOidcBridgeClient['exchangeQuickAuth']>
): FarcasterOidcBridgeClient {
  return {
    issuer: ISSUER,
    audience: AUDIENCE,
    createChallenge: vi.fn(async () => {
      throw new Error('SIWF must not run in a verified Mini App.');
    }),
    exchangeCompletedSignIn: vi.fn(async () => {
      throw new Error('SIWF must not run in a verified Mini App.');
    }),
    exchangeQuickAuth,
    refreshSession: vi.fn(async () => {
      throw new Error('Cookie restore must not run in a verified Mini App.');
    }),
    getAccessRequestStatus: vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    })),
    requestAccess: vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: Date.now()
    })),
    logoutSession: vi.fn(async () => {})
  };
}

function AuthProbe() {
  const auth = useFarcasterAuth();
  return (
    <>
      <output data-testid="state">{JSON.stringify(auth.state)}</output>
      <output data-testid="admission-check">{JSON.stringify(auth.admissionCheck)}</output>
      <output data-testid="token">{String(Boolean(auth.oidcSession))}</output>
      <output data-testid="realm-entry">
        {auth.state.phase === 'authenticated' && auth.oidcSession ? 'open' : 'blocked'}
      </output>
      <button onClick={auth.refreshSession} type="button">Refresh</button>
      <button onClick={auth.checkAdmission} type="button">Check admission</button>
      <button onClick={auth.signOut} type="button">Sign out</button>
    </>
  );
}

function renderMiniApp(
  sdk: MiniAppSdk,
  authBridge: FarcasterOidcBridgeClient,
  strict = false
) {
  const tree = (
    <MiniAppHostProvider
      runtime={miniAppRuntime()}
      sdkLoader={async () => sdk}
    >
      <FarcasterAuthProvider
        loadAuthority={vi.fn(async () => {
          throw new Error('SIWF authority must stay lazy.');
        })}
        loadBridgeClient={vi.fn(async () => authBridge)}
      >
        <AuthProbe />
      </FarcasterAuthProvider>
    </MiniAppHostProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

function state(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}') as Record<
    string,
    unknown
  >;
}

function admissionCheckState(): Record<string, unknown> {
  return JSON.parse(
    screen.getByTestId('admission-check').textContent ?? '{}'
  ) as Record<string, unknown>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  window.localStorage.clear();
  window.sessionStorage.clear();
  document.head
    .querySelectorAll('[data-warpkeep-miniapp-safe-area]')
    .forEach((element) => element.remove());
  document.head
    .querySelectorAll('[data-warpkeep-miniapp-quick-auth-preconnect]')
    .forEach((element) => element.remove());
  vi.restoreAllMocks();
});

describe('Farcaster Mini App Quick Auth lifecycle', () => {
  it('automatically exchanges one fresh bearer without SIWF, cookies, or token persistence', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn(async () => authorized());
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('authenticated'));
    expect(state()).toMatchObject({
      identity: {
        fid: FID,
        username: 'keeper',
        displayName: 'The Keeper',
        pfpUrl: 'https://images.example/keeper.png'
      },
      assurance: 'bridge-oidc-alpha'
    });
    expect(screen.getByTestId('token').textContent).toBe('true');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(exchangeQuickAuth).toHaveBeenCalledWith(
      QUICK_AUTH_TOKEN,
      { signal: expect.any(AbortSignal) }
    );
    expect(authBridge.createChallenge).not.toHaveBeenCalled();
    expect(authBridge.exchangeCompletedSignIn).not.toHaveBeenCalled();
    expect(authBridge.refreshSession).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(JSON.stringify(state())).not.toContain(QUICK_AUTH_TOKEN);
  });

  it('reacquires Quick Auth for refresh and never trusts a mismatched host profile', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn(async () => authorized());
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken, FID + 1), authBridge);

    await waitFor(() => expect(state().phase).toBe('authenticated'));
    expect(state()).toMatchObject({ identity: { fid: FID } });
    expect(JSON.stringify(state())).not.toContain('keeper');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    await waitFor(() => expect(exchangeQuickAuth).toHaveBeenCalledTimes(2));
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(authBridge.refreshSession).not.toHaveBeenCalled();
  });

  it('coalesces every foreground signal and fails closed on a switched host account', async () => {
    const switchedToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? switchedToken : QUICK_AUTH_TOKEN
    }));
    const switched = deferred<FarcasterQuickAuthSessionResponse>();
    const exchangeQuickAuth = vi.fn(async (token: string) => {
      if (token === QUICK_AUTH_TOKEN) return authorized(FID);
      if (token === switchedToken) return switched.promise;
      throw new Error('unexpected Quick Auth token');
    });
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);
    await waitFor(() => expect(state().phase).toBe('authenticated'));
    expect(state()).toMatchObject({ identity: { fid: FID } });

    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('pageshow'));
    fireEvent(document, new Event('visibilitychange'));
    await waitFor(() => expect(exchangeQuickAuth).toHaveBeenCalledTimes(2));
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(
      getToken.mock.calls.filter(([options]) => options?.force === true)
    ).toHaveLength(1);
    expect(getToken.mock.calls.at(-1)).toEqual([{ force: true }]);
    expect(exchangeQuickAuth).toHaveBeenNthCalledWith(
      2,
      switchedToken,
      { signal: expect.any(AbortSignal) }
    );
    await waitFor(() => expect(screen.getByTestId('token').textContent).toBe('false'));

    switched.resolve(authorized(FID + 1));
    await waitFor(() => expect(state()).toMatchObject({
      phase: 'error',
      error: {
        code: 'fid-mismatch',
        stage: 'identity_changed'
      }
    }));
    expect(JSON.stringify(state())).not.toContain('keeper');
    expect(screen.getByTestId('token').textContent).toBe('false');
    expect(screen.getByTestId('realm-entry').textContent).toBe('blocked');
  });

  it('fails closed if foreground Quick Auth cannot reverify the host account', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(authorized(FID))
      .mockRejectedValueOnce(new Error('private host verification failure'));
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);
    await waitFor(() => expect(state().phase).toBe('authenticated'));

    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(exchangeQuickAuth).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(state().phase).toBe('anonymous'));
    expect(screen.getByTestId('token').textContent).toBe('false');
    expect(JSON.stringify(state())).not.toContain('keeper');
  });

  it('keeps the single Quick Auth refresh alive across its shared expiry deadline', async () => {
    const start = Date.UTC(2026, 7, 1, 12, 0, 0);
    vi.useFakeTimers({ now: start });
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const refresh = deferred<FarcasterQuickAuthSessionResponse>();
    let refreshSignal: AbortSignal | undefined;
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(authorized(FID, start))
      .mockImplementationOnce((_token, options) => {
        refreshSignal = options?.signal;
        return refresh.promise;
      });
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);
    await act(async () => { await Promise.resolve(); });
    expect(state().phase).toBe('authenticated');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9 * 60_000 + 30_000);
    });
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);
    expect(refreshSignal?.aborted).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(refreshSignal?.aborted).toBe(false);
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);

    refresh.resolve(authorized(FID, Date.now()));
    await act(async () => { await Promise.resolve(); });
    expect(state().phase).toBe('authenticated');
    expect(screen.getByTestId('token').textContent).toBe('true');
  });

  it('keeps pending admission tokenless and explicit logout blocks passive reacquisition', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn(async () => pendingAdmission());
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('pending-admission'));
    expect(screen.getByTestId('token').textContent).toBe('false');
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(state().phase).toBe('anonymous'));
    await Promise.resolve();
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(1);
    expect(authBridge.logoutSession).toHaveBeenCalledTimes(1);
  });

  it('reacquires an expired pending presentation through one coalesced Quick Auth flight', async () => {
    const start = Date.UTC(2026, 7, 1, 12, 0, 0);
    vi.useFakeTimers({ now: start });
    const freshToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? freshToken : QUICK_AUTH_TOKEN
    }));
    const renewal = deferred<FarcasterQuickAuthSessionResponse>();
    const foregroundRenewal = deferred<FarcasterQuickAuthSessionResponse>();
    let renewalSignal: AbortSignal | undefined;
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(pendingAdmission())
      .mockImplementationOnce((_token, options) => {
        renewalSignal = options?.signal;
        return renewal.promise;
      })
      .mockImplementationOnce(() => foregroundRenewal.promise);
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);
    await act(async () => { await Promise.resolve(); });
    expect(state().phase).toBe('pending-admission');
    expect(screen.getByTestId('token').textContent).toBe('false');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5 * 60_000);
    });
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);
    expect(state().phase).toBe('pending-admission');

    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('pageshow'));
    await act(async () => { await Promise.resolve(); });
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(3);
    expect(renewalSignal?.aborted).toBe(true);
    expect(
      getToken.mock.calls.filter(([options]) => options?.force === true)
    ).toHaveLength(1);
    expect(exchangeQuickAuth).toHaveBeenNthCalledWith(
      3,
      freshToken,
      { signal: expect.any(AbortSignal) }
    );

    foregroundRenewal.resolve(pendingAdmission());
    await act(async () => { await Promise.resolve(); });
    expect(state().phase).toBe('pending-admission');
    expect(screen.getByTestId('token').textContent).toBe('false');

    renewal.resolve(pendingAdmission(FID + 1));
    await act(async () => { await Promise.resolve(); });
    expect(state()).toMatchObject({
      phase: 'pending-admission',
      identity: { fid: FID }
    });
  });

  it('forces one fresh host bearer and coalesces foreground signals during a manual admission check', async () => {
    const freshToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const manual = deferred<FarcasterQuickAuthSessionResponse>();
    let manualSignal: AbortSignal | undefined;
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? freshToken : QUICK_AUTH_TOKEN
    }));
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(pendingAdmission())
      .mockImplementationOnce((_token, options) => {
        manualSignal = options?.signal;
        return manual.promise;
      });

    renderMiniApp(miniAppSdk(getToken), bridge(exchangeQuickAuth));
    await waitFor(() => expect(state().phase).toBe('pending-admission'));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 2, 12, 0, 0) });

    fireEvent.click(screen.getByRole('button', { name: 'Check admission' }));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(admissionCheckState()).toEqual({ phase: 'checking' });
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);
    expect(
      getToken.mock.calls.filter(([options]) => options?.force === true)
    ).toHaveLength(1);
    expect(getToken.mock.calls.at(-1)).toEqual([{ force: true }]);

    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('pageshow'));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(manualSignal?.aborted).toBe(false);
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(2);

    manual.resolve(pendingAdmission());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(admissionCheckState()).toMatchObject({ phase: 'still-pending' });
    expect(state()).toMatchObject({
      phase: 'pending-admission',
      identity: { fid: FID }
    });
  });

  it('never commits a cross-FID forced result from Check Admission', async () => {
    const freshToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const replacement = deferred<FarcasterQuickAuthSessionResponse>();
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? freshToken : QUICK_AUTH_TOKEN
    }));
    const exchangeQuickAuth = vi.fn()
      .mockResolvedValueOnce(pendingAdmission(FID))
      .mockImplementation(() => replacement.promise);

    renderMiniApp(miniAppSdk(getToken), bridge(exchangeQuickAuth));
    await waitFor(() => expect(state().phase).toBe('pending-admission'));
    vi.useFakeTimers({ now: Date.UTC(2026, 7, 2, 12, 0, 0) });

    fireEvent(window, new Event('focus'));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(exchangeQuickAuth.mock.calls.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole('button', { name: 'Check admission' }));
    await act(async () => {
      for (let index = 0; index < 12; index += 1) await Promise.resolve();
    });
    expect(admissionCheckState()).toEqual({ phase: 'checking' });

    replacement.resolve(authorized(FID + 1));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(301);
      for (let index = 0; index < 16; index += 1) await Promise.resolve();
    });

    expect(
      getToken.mock.calls.filter(([options]) => options?.force === true)
    ).toHaveLength(1);
    const settledState = state();
    expect(['error', 'anonymous']).toContain(settledState.phase);
    if (settledState.phase === 'error') {
      expect(settledState.error).toMatchObject({
        code: 'fid-mismatch',
        stage: 'identity_changed'
      });
    }
    expect(settledState.identity).toBeUndefined();
    expect(screen.getByTestId('token').textContent).toBe('false');
    expect(screen.getByTestId('realm-entry').textContent).toBe('blocked');
  });

  it('fails a visible launch cleanly when the host cannot issue a valid bearer', async () => {
    const getToken = vi.fn(async () => ({ token: '' }));
    const exchangeQuickAuth = vi.fn(async () => authorized());
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('error'));
    expect(state().error).toMatchObject({
      code: 'invalid-response',
      stage: 'quick_auth_token_invalid_shape'
    });
    expect(screen.getByTestId('token').textContent).toBe('false');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(exchangeQuickAuth).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
  });

  it('force-refreshes one SDK-cached bearer after a definitive bridge 401', async () => {
    const freshToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? freshToken : QUICK_AUTH_TOKEN
    }));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ error: { code: 'quick_auth_invalid' } }, 401))
      .mockResolvedValueOnce(json(authorized()));
    const authBridge = createFarcasterOidcBridgeClient({
      bridgeUrl: ISSUER,
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('authenticated'));
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenNthCalledWith(1, undefined);
    expect(getToken).toHaveBeenNthCalledWith(2, { force: true });
    expect(fetch).toHaveBeenCalledTimes(2);
    const firstHeaders = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    const secondHeaders = new Headers(fetch.mock.calls[1]?.[1]?.headers);
    expect(firstHeaders.get('authorization')).toBe(`Bearer ${QUICK_AUTH_TOKEN}`);
    expect(secondHeaders.get('authorization')).toBe(`Bearer ${freshToken}`);
  });

  it('does not force twice when a foreground-fresh bearer is rejected', async () => {
    const freshToken = `${'d'.repeat(16)}.${'e'.repeat(24)}.${'f'.repeat(32)}`;
    const getToken = vi.fn(async (options?: { force?: boolean }) => ({
      token: options?.force === true ? freshToken : QUICK_AUTH_TOKEN
    }));
    const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(json(authorized()))
      .mockResolvedValueOnce(json({ error: { code: 'quick_auth_invalid' } }, 401));
    const authBridge = createFarcasterOidcBridgeClient({
      bridgeUrl: ISSUER,
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    renderMiniApp(miniAppSdk(getToken), authBridge);
    await waitFor(() => expect(state().phase).toBe('authenticated'));

    fireEvent(window, new Event('focus'));
    await waitFor(() => expect(state().phase).toBe('anonymous'));

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(
      getToken.mock.calls.filter(([options]) => options?.force === true)
    ).toHaveLength(1);
    expect(screen.getByTestId('token').textContent).toBe('false');
  });

  it('does not acquire a forced bearer after the auth generation is cancelled', async () => {
    const rejectedClient = createFarcasterOidcBridgeClient({
      bridgeUrl: ISSUER,
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch: vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'quick_auth_invalid' }
      }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }))
    });
    const rejectedError = await rejectedClient.exchangeQuickAuth!(
      QUICK_AUTH_TOKEN
    ).catch((error: unknown) => error);
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    let view!: ReturnType<typeof renderMiniApp>;
    const exchangeQuickAuth = vi.fn(async () => {
      view.unmount();
      throw rejectedError;
    });

    view = renderMiniApp(miniAppSdk(getToken), bridge(exchangeQuickAuth));

    await waitFor(() => expect(exchangeQuickAuth).toHaveBeenCalledTimes(1));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(getToken).toHaveBeenCalledTimes(1);
  });

  it('stops after one forced refresh when the fresh bearer is also rejected', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const rejected = () => new Response(JSON.stringify({
      error: { code: 'quick_auth_invalid' }
    }), {
      status: 401,
      headers: { 'content-type': 'application/json' }
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(rejected())
      .mockResolvedValueOnce(rejected());
    const authBridge = createFarcasterOidcBridgeClient({
      bridgeUrl: ISSUER,
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('error'));
    expect(state().error).toMatchObject({
      code: 'verification',
      stage: 'bridge_http_401'
    });
    expect(getToken).toHaveBeenCalledTimes(2);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry a temporary bridge outage or expose its response', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'verification_unavailable',
        message: 'private upstream detail'
      }
    }), {
      status: 503,
      headers: { 'content-type': 'application/json' }
    }));
    const authBridge = createFarcasterOidcBridgeClient({
      bridgeUrl: ISSUER,
      issuer: ISSUER,
      audience: AUDIENCE,
      fetch
    });

    renderMiniApp(miniAppSdk(getToken), authBridge);

    await waitFor(() => expect(state().phase).toBe('error'));
    expect(state().error).toMatchObject({
      code: 'bridge',
      stage: 'bridge_http_503'
    });
    expect(JSON.stringify(state())).not.toContain('private upstream detail');
    expect(getToken).toHaveBeenCalledTimes(1);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('settles automatic Quick Auth under Strict Mode effect replay', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn(async () => authorized());
    const authBridge = bridge(exchangeQuickAuth);

    renderMiniApp(miniAppSdk(getToken), authBridge, true);

    await waitFor(() => expect(state().phase).toBe('authenticated'));
    expect(screen.getByTestId('token').textContent).toBe('true');
    expect(state().phase).not.toBe('creating-channel');
    expect(exchangeQuickAuth).toHaveBeenCalledTimes(1);
  });
});
