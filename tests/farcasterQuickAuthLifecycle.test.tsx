import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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
  getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN })),
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
    logoutSession: vi.fn(async () => {})
  };
}

function AuthProbe() {
  const auth = useFarcasterAuth();
  return (
    <>
      <output data-testid="state">{JSON.stringify(auth.state)}</output>
      <output data-testid="token">{String(Boolean(auth.oidcSession))}</output>
      <button onClick={auth.refreshSession} type="button">Refresh</button>
      <button onClick={auth.signOut} type="button">Sign out</button>
    </>
  );
}

function renderMiniApp(
  sdk: MiniAppSdk,
  authBridge: FarcasterOidcBridgeClient
) {
  return render(
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
}

function state(): Record<string, unknown> {
  return JSON.parse(screen.getByTestId('state').textContent ?? '{}') as Record<
    string,
    unknown
  >;
}

afterEach(() => {
  cleanup();
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

  it('keeps pending admission tokenless and explicit logout blocks passive reacquisition', async () => {
    const getToken = vi.fn(async () => ({ token: QUICK_AUTH_TOKEN }));
    const exchangeQuickAuth = vi.fn(async () => ({
      version: 2 as const,
      status: 'pending-admission' as const,
      identity: { fid: FID }
    }));
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
});
