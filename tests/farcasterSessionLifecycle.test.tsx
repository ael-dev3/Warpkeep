import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAuthProvider,
  useFarcasterAuth,
  type FarcasterAuthProviderProps
} from '../src/farcaster/FarcasterAuthProvider';
import { FARCASTER_AUTH_REQUEST_TTL_MS } from '../src/farcaster/farcasterAuthContext';
import { FarcasterOidcBridgeClientError } from '../src/farcaster/farcasterOidcBridgeClient';
import {
  FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS,
  FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS,
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import {
  getFarcasterPresentationSessionStorageKey,
  persistFarcasterPresentationSession
} from '../src/farcaster/farcasterPresentationSession';
import type {
  FarcasterChannelStatus,
  FarcasterCompletedChannelStatus,
  FarcasterBridgeSessionResponse,
  FarcasterOidcBridgeClient,
  FarcasterOidcSession,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

const BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const SECOND_BINDING_VERIFIER = 'A'.repeat(43);
const SECOND_BINDING_CHALLENGE = 'DwBzhbb51LfusnSGBa_hqYSgo7-j8BTQnip4TOnlzRo';

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createChannel(
  suffix: string,
  createdAt = Date.now(),
  expiresAt = createdAt + FARCASTER_AUTH_REQUEST_TTL_MS
): FarcasterSignInChannel {
  return {
    channelToken: `PRIVATE_CHANNEL_TOKEN_${suffix}`,
    url: `farcaster://connect?request=${suffix}`,
    nonce: `NonceFor${suffix}12345678`,
    requestId: `request-${suffix}`,
    domain: 'example.com',
    siweUri: 'https://example.com/Warpkeep/',
    createdAt,
    expiresAt
  };
}

function createCompletedStatus(
  nonce: string,
  suffix = 'A'
): FarcasterCompletedChannelStatus {
  const expirationTime = new Date(Date.now() + FARCASTER_AUTH_REQUEST_TTL_MS).toISOString();
  return {
    state: 'completed',
    nonce,
    message: `PRIVATE_MESSAGE_${suffix}`,
    signature: `0x${'ab'.repeat(65)}`,
    fid: 12_345,
    signatureParams: {
      siweUri: 'https://example.com/Warpkeep/',
      domain: 'example.com',
      nonce,
      expirationTime,
      requestId: `request-${suffix}`
    },
    acceptAuthAddress: true,
    username: 'keeper',
    displayName: 'The Keeper',
    pfpUrl: 'https://images.example/keeper.png',
    verifications: [],
    authMethod: 'authAddress'
  };
}

function createIdentity(verifiedAt = Date.now()): VerifiedFarcasterIdentity {
  return {
    fid: 12_345,
    username: 'keeper',
    displayName: 'The Keeper',
    pfpUrl: 'https://images.example/keeper.png',
    verifications: [],
    authMethod: 'authAddress',
    verifiedAt
  };
}

function publicIdentity(identity: VerifiedFarcasterIdentity) {
  return {
    fid: identity.fid,
    ...(identity.username === undefined ? {} : { username: identity.username }),
    ...(identity.displayName === undefined ? {} : { displayName: identity.displayName }),
    ...(identity.pfpUrl === undefined ? {} : { pfpUrl: identity.pfpUrl }),
    verifications: [],
    verifiedAt: identity.verifiedAt
  };
}

function encodeSegment(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createOidcSession(
  fid = 12_345,
  now = Date.now(),
  expiresAt = now + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
): FarcasterOidcSession {
  const issuedAt = Math.floor(now / 1_000) * 1_000;
  const normalizedExpiresAt = Math.floor(expiresAt / 1_000) * 1_000;
  const jwt = `${encodeSegment({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encodeSegment({
    iss: 'https://auth.warpkeep.example',
    sub: `farcaster:${fid}`,
    aud: ['warpkeep-spacetimedb'],
    token_type: 'spacetime-access',
    fid: String(fid),
    auth_version: 2,
    auth_epoch: 1,
    roles: [],
    iat: issuedAt / 1_000,
    nbf: issuedAt / 1_000,
    exp: normalizedExpiresAt / 1_000,
    session_iat: issuedAt / 1_000,
    session_exp: normalizedExpiresAt / 1_000,
    jti: `test-${fid}-${now}`
  })}.test_signature`;
  return {
    jwt,
    issuer: 'https://auth.warpkeep.example',
    audience: 'warpkeep-spacetimedb',
    expiresAt: normalizedExpiresAt
  };
}

function createAuthorizedResponse(
  fid = 12_345,
  now = Date.now(),
  accessExpiresAt = now + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
): FarcasterBridgeSessionResponse {
  const session = createOidcSession(fid, now, accessExpiresAt);
  return {
    version: 2,
    status: 'authorized',
    identity: { fid },
    sessionExpiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1_000) / 1_000) * 1_000,
    accessToken: session.jwt,
    tokenType: 'spacetime-access',
    accessExpiresAt: session.expiresAt
  };
}

function createPendingResponse(
  fid = 12_345,
  now = Date.now()
): FarcasterBridgeSessionResponse {
  return {
    version: 2,
    status: 'pending-admission',
    identity: { fid },
    sessionExpiresAt: Math.floor((now + 30 * 24 * 60 * 60 * 1_000) / 1_000) * 1_000
  };
}

function createBridge(
  overrides: Partial<FarcasterOidcBridgeClient> = {}
): FarcasterOidcBridgeClient {
  return {
    createChallenge: vi.fn(async () => ({
      nonce: 'BridgeNonce12345678',
      requestId: 'bridge-request-id',
      createdAt: Date.now(),
      expiresAt: Date.now() + FARCASTER_AUTH_REQUEST_TTL_MS
    })),
    exchangeCompletedSignIn: vi.fn(async (request) => createAuthorizedResponse(request.fid)),
    refreshSession: vi.fn(async () => {
      throw new FarcasterOidcBridgeClientError('No cookie session in this fixture.');
    }),
    logoutSession: vi.fn(async () => undefined),
    ...overrides,
    issuer: overrides.issuer ?? 'https://auth.warpkeep.example',
    audience: overrides.audience ?? 'warpkeep-spacetimedb'
  };
}

function createAuthority(overrides: Partial<FarcasterSessionAuthority> = {}) {
  return {
    beginSignIn: vi.fn<() => Promise<FarcasterSignInChannel>>(),
    getStatus: vi.fn<(channelToken: string) => Promise<FarcasterChannelStatus>>(),
    verifyCompletedRequest: vi.fn<FarcasterSessionAuthority['verifyCompletedRequest']>(),
    ...overrides
  } satisfies FarcasterSessionAuthority;
}

class MemoryDeviceSessionStorage implements FarcasterDeviceSessionStorage {
  readonly values = new Map<string, string>();
  readonly reads: string[] = [];
  readonly writes: Array<readonly [string, string]> = [];

  getItem(key: string) {
    this.reads.push(key);
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.writes.push([key, value]);
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }
}

const DEVICE_SESSION_ORIGIN = 'https://example.com';
const DEVICE_SESSION_BASE_PATH = '/Warpkeep/';

function deviceSessionEnvironment(
  storage: FarcasterDeviceSessionStorage
): FarcasterDeviceSessionEnvironment {
  return {
    storage,
    origin: DEVICE_SESSION_ORIGIN,
    basePath: DEVICE_SESSION_BASE_PATH
  };
}

function tabScopedDeviceSessionEnvironment(
  localStorage: FarcasterDeviceSessionStorage,
  sessionStorage: FarcasterDeviceSessionStorage
): FarcasterDeviceSessionEnvironment {
  return {
    localStorage,
    sessionStorage,
    origin: DEVICE_SESSION_ORIGIN,
    basePath: DEVICE_SESSION_BASE_PATH
  };
}

function deviceSessionStorageKey() {
  return getFarcasterDeviceSessionStorageKey(DEVICE_SESSION_BASE_PATH)!;
}

function AuthHarness({ duplicateBegin = false }: { duplicateBegin?: boolean }) {
  const auth = useFarcasterAuth();
  return (
    <div>
      <output data-testid="auth-state">{JSON.stringify(auth.state)}</output>
      <button
        onClick={() => {
          auth.beginSignIn();
          if (duplicateBegin) {
            auth.beginSignIn();
          }
        }}
        type="button"
      >
        Begin
      </button>
      <button onClick={auth.cancelSignIn} type="button">Cancel</button>
      <button onClick={auth.retrySignIn} type="button">Retry</button>
      <button onClick={auth.prepareQrCode} type="button">Prepare QR</button>
      <button onClick={auth.refreshSession} type="button">Refresh session</button>
      <button onClick={auth.signOut} type="button">Sign out</button>
      <button
        onClick={() => auth.setRememberDevice(!auth.rememberDevice)}
        type="button"
      >
        Toggle remember device
      </button>
      <output data-testid="remember-device">{String(auth.rememberDevice)}</output>
      <output data-testid="has-oidc-session">{String(Boolean(auth.oidcSession))}</output>
    </div>
  );
}

type RenderProviderOptions = Omit<FarcasterAuthProviderProps, 'children'> & {
  children?: ReactNode;
  strict?: boolean;
};

function renderProvider({
  children = <AuthHarness />,
  strict = false,
  loadBridgeClient = vi.fn(async () => createBridge()),
  createBrowserBinding = vi.fn(async () => ({
    verifier: BINDING_VERIFIER,
    challenge: BINDING_CHALLENGE,
    method: 'S256' as const
  })),
  ...providerProps
}: RenderProviderOptions) {
  const provider = (
    <FarcasterAuthProvider
      {...providerProps}
      createBrowserBinding={createBrowserBinding}
      loadBridgeClient={loadBridgeClient}
    >
      {children}
    </FarcasterAuthProvider>
  );
  return render(strict ? <StrictMode>{provider}</StrictMode> : provider);
}

function readPublicState() {
  return JSON.parse(screen.getByTestId('auth-state').textContent ?? '{}') as {
    phase: string;
    [key: string]: unknown;
  };
}

async function settleAsyncWork(rounds = 12) {
  await act(async () => {
    for (let round = 0; round < rounds; round += 1) {
      await Promise.resolve();
    }
  });
}

async function advanceTime(milliseconds: number) {
  await act(async () => {
    vi.advanceTimersByTime(milliseconds);
    await Promise.resolve();
  });
  await settleAsyncWork();
}

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FarcasterAuthProvider session lifecycle', () => {
  it('fails closed before creating a Farcaster channel when no bridge is configured', async () => {
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => createChannel('MUST_NOT_OPEN'))
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => {
        throw new FarcasterOidcBridgeClientError('configuration intentionally absent');
      })
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(readPublicState()).toMatchObject({
      phase: 'error',
      error: { code: 'bridge' }
    });
    expect(authority.beginSignIn).not.toHaveBeenCalled();
  });

  it('fails closed before bridge or relay work when binding generation is malformed', async () => {
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => createChannel('MALFORMED_BINDING'))
    });
    const bridge = createBridge();
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      createBrowserBinding: vi.fn(async () => ({
        verifier: `${'A'.repeat(42)}B`,
        challenge: BINDING_CHALLENGE,
        method: 'S256' as const
      }))
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(readPublicState()).toMatchObject({ phase: 'error' });
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
  });

  it('does no auth work on mount and synchronously deduplicates begin under StrictMode', async () => {
    const pendingChannel = deferred<FarcasterSignInChannel>();
    const authority = createAuthority({
      beginSignIn: vi.fn(() => pendingChannel.promise)
    });
    const loadAuthority = vi.fn(async () => authority);
    const encodeQrCode = vi.fn(async () => 'data:image/svg+xml,qr');
    const bridge = createBridge();
    const loadBridgeClient = vi.fn(async () => bridge);
    const createBrowserBinding = vi.fn(async () => ({
      verifier: BINDING_VERIFIER,
      challenge: BINDING_CHALLENGE,
      method: 'S256' as const
    }));

    const rendered = renderProvider({
      children: <AuthHarness duplicateBegin />,
      strict: true,
      loadAuthority,
      loadBridgeClient,
      createBrowserBinding,
      resolveAuthContext: () => ({
        domain: 'example.com',
        siweUri: 'https://example.com/Warpkeep/'
      }),
      encodeQrCode
    });

    expect(loadAuthority).not.toHaveBeenCalled();
    expect(loadBridgeClient).not.toHaveBeenCalled();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('pageshow'));
    fireEvent(document, new Event('visibilitychange'));
    await settleAsyncWork();
    expect(loadBridgeClient).not.toHaveBeenCalled();
    expect(bridge.refreshSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(readPublicState().phase).toBe('creating-channel');
    expect(loadAuthority).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(createBrowserBinding).toHaveBeenCalledTimes(1);
    expect(bridge.createChallenge).toHaveBeenCalledTimes(1);
    const [challengeRequest, challengeOptions] = vi.mocked(bridge.createChallenge).mock.calls[0]!;
    expect(challengeRequest).toEqual({
      domain: 'example.com',
      siweUri: 'https://example.com/Warpkeep/',
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256'
    });
    expect(challengeRequest).not.toHaveProperty('bindingVerifier');
    expect(challengeOptions?.signal?.aborted).toBe(false);

    const channel = createChannel('STRICT');
    pendingChannel.resolve(channel);
    await settleAsyncWork();

    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      channelUrl: channel.url,
      qr: { state: 'not-requested' }
    });
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(readPublicState()).not.toHaveProperty('channelToken');
    expect(readPublicState()).not.toHaveProperty('nonce');

    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR' }));
    await settleAsyncWork();
    expect(encodeQrCode).toHaveBeenCalledTimes(1);
    expect(encodeQrCode).toHaveBeenCalledWith(channel.url);
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'ready', dataUrl: 'data:image/svg+xml,qr' }
    });
    rendered.unmount();
    expect(challengeOptions?.signal?.aborted).toBe(true);
  });

  it('cancels and invalidates a late explicit cookie restoration before SIWF begins', async () => {
    const lateRefresh = deferred<FarcasterBridgeSessionResponse>();
    const pendingChannel = deferred<FarcasterSignInChannel>();
    const bridge = createBridge({
      refreshSession: vi.fn(() => lateRefresh.promise)
    });
    const authority = createAuthority({
      beginSignIn: vi.fn(() => pendingChannel.promise)
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge)
    });
    await settleAsyncWork();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    const [refreshOptions] = vi.mocked(bridge.refreshSession).mock.calls[0]!;
    expect(refreshOptions?.signal?.aborted).toBe(false);
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(readPublicState().phase).toBe('anonymous');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(refreshOptions?.signal?.aborted).toBe(true);

    lateRefresh.resolve(createAuthorizedResponse());
    await settleAsyncWork();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(bridge.logoutSession).toHaveBeenCalledTimes(1);
    expect(readPublicState().phase).toBe('anonymous');
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('uses one-shot polling at the requested cadence and never overlaps slow status calls', async () => {
    vi.useFakeTimers({ now: 10_000 });
    const firstStatus = deferred<FarcasterChannelStatus>();
    const channel = createChannel('POLL');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn()
        .mockImplementationOnce(() => firstStatus.promise)
        .mockResolvedValue({ state: 'pending', nonce: channel.nonce })
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 1_500
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    await advanceTime(1_499);
    expect(authority.getStatus).not.toHaveBeenCalled();
    await advanceTime(1);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);

    await advanceTime(20_000);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);

    firstStatus.resolve({ state: 'pending', nonce: channel.nonce });
    await settleAsyncWork();
    await advanceTime(1_499);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);
    await advanceTime(1);
    expect(authority.getStatus).toHaveBeenCalledTimes(2);
  });

  it('reconciles visibility, focus, and pageshow returns immediately without duplicate polls', async () => {
    vi.useFakeTimers({ now: 25_000 });
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const resumedStatus = deferred<FarcasterChannelStatus>();
    const channel = createChannel('VISIBLE');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(() => resumedStatus.promise)
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 1_500
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    await advanceTime(5_000);
    expect(authority.getStatus).not.toHaveBeenCalled();

    hidden = false;
    fireEvent(window, new Event('focus'));
    fireEvent(window, new Event('pageshow'));
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(window, new Event('focus'));
    await settleAsyncWork();
    expect(authority.getStatus).toHaveBeenCalledTimes(1);

    resumedStatus.resolve({ state: 'pending', nonce: channel.nonce });
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('awaiting-approval');
  });

  it('verifies completed proof, discards it, and preserves identity across child unmounts', async () => {
    vi.useFakeTimers({ now: 50_000 });
    const channel = createChannel('COMPLETE');
    const completed = createCompletedStatus(channel.nonce, 'COMPLETE');
    const identity = createIdentity();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => completed),
      verifyCompletedRequest: vi.fn(async () => identity)
    });
    const bridge = createBridge({
      refreshSession: vi.fn()
        .mockRejectedValueOnce(new FarcasterOidcBridgeClientError('No cookie session.'))
        .mockImplementationOnce(async () => createAuthorizedResponse(identity.fid, Date.now()))
    });

    function PersistentChildHarness() {
      const [showConsumer, setShowConsumer] = useState(true);
      return (
        <>
          <button onClick={() => setShowConsumer((visible) => !visible)} type="button">
            Toggle child
          </button>
          {showConsumer ? <AuthHarness /> : null}
        </>
      );
    }

    renderProvider({
      children: <PersistentChildHarness />,
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(authority.verifyCompletedRequest).toHaveBeenCalledTimes(1);
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { ...publicIdentity(identity), verifiedAt: 50_010 },
      assurance: 'bridge-oidc-alpha',
      expiresAt: expect.any(Number)
    });
    expect(JSON.stringify(readPublicState())).not.toContain('PRIVATE_MESSAGE_COMPLETE');
    expect(JSON.stringify(readPublicState())).not.toContain(channel.channelToken);
    await advanceTime(50_000);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle child' }));
    expect(screen.queryByTestId('auth-state')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle child' }));
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { ...publicIdentity(identity), verifiedAt: 50_010 },
      assurance: 'bridge-oidc-alpha',
      expiresAt: expect.any(Number)
    });
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl
      }
    });
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
  });

  it('restores tab-scoped presentation only after a same-FID cookie refresh across provider remount', async () => {
    vi.useFakeTimers({ now: 51_000 });
    const localStorage = new MemoryDeviceSessionStorage();
    const sessionStorage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = tabScopedDeviceSessionEnvironment(localStorage, sessionStorage);
    const channel = createChannel('COLD_PRESENTATION');
    const completed = createCompletedStatus(channel.nonce, 'COLD_PRESENTATION');
    const identity = createIdentity(Date.now() - 1);
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => completed),
      verifyCompletedRequest: vi.fn(async () => identity)
    });
    const freshBridge = createBridge({
      refreshSession: vi.fn(async () => {
        throw new FarcasterOidcBridgeClientError('No cookie session.');
      })
    });
    const firstRender = renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => freshBridge),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: sessionEnvironment
    });

    expect(freshBridge.refreshSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl
      }
    });
    const presentationKey = getFarcasterPresentationSessionStorageKey(
      DEVICE_SESSION_BASE_PATH
    )!;
    const serializedPresentation = sessionStorage.values.get(presentationKey);
    expect(serializedPresentation).toBeDefined();
    expect(JSON.parse(serializedPresentation!)).toEqual({
      version: 1,
      fid: identity.fid,
      username: identity.username,
      displayName: identity.displayName,
      pfpUrl: identity.pfpUrl,
      expiresAt: expect.any(Number)
    });
    expect(serializedPresentation).not.toMatch(
      /PRIVATE_|jwt|token|signature|custody|verification|authMethod/i
    );

    const readsAfterFreshExchange = sessionStorage.reads.filter(
      (key) => key === presentationKey
    ).length;
    expect(readsAfterFreshExchange).toBe(0);
    firstRender.unmount();

    const restoredBridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse(identity.fid, Date.now()))
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => restoredBridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(restoredBridge.refreshSession).not.toHaveBeenCalled();
    expect(sessionStorage.reads.filter((key) => key === presentationKey)).toHaveLength(
      readsAfterFreshExchange
    );

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(restoredBridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: {
        fid: identity.fid,
        username: identity.username,
        displayName: identity.displayName,
        pfpUrl: identity.pfpUrl
      }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await settleAsyncWork();
    expect(sessionStorage.values.has(presentationKey)).toBe(false);
  });

  it('replaces stale same-FID presentation on fresh SIWF without reading it', async () => {
    vi.useFakeTimers({ now: 51_250 });
    const localStorage = new MemoryDeviceSessionStorage();
    const sessionStorage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = tabScopedDeviceSessionEnvironment(localStorage, sessionStorage);
    const presentationKey = getFarcasterPresentationSessionStorageKey(
      DEVICE_SESSION_BASE_PATH
    )!;
    expect(persistFarcasterPresentationSession({
      fid: 12_345,
      username: 'stale-keeper',
      displayName: 'Removed Display',
      pfpUrl: 'https://images.example/removed.png',
      expiresAt: Date.now() + 60_000
    }, {
      ...sessionEnvironment,
      now: Date.now
    })).toBe(true);
    const channel = createChannel('FRESH_REPLACES_CACHE');
    const freshIdentity: VerifiedFarcasterIdentity = {
      fid: 12_345,
      username: 'fresh-keeper',
      verifications: [],
      verifiedAt: Date.now() - 1
    };
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(
        channel.nonce,
        'FRESH_REPLACES_CACHE'
      )),
      verifyCompletedRequest: vi.fn(async () => freshIdentity)
    });
    const bridge = createBridge({
      refreshSession: vi.fn(async () => {
        throw new FarcasterOidcBridgeClientError('No cookie session.');
      })
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: sessionEnvironment
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    const publicState = readPublicState();
    expect(publicState).toMatchObject({
      phase: 'authenticated',
      identity: {
        fid: freshIdentity.fid,
        username: freshIdentity.username
      }
    });
    const publicIdentityAfterFresh = publicState.identity as Record<string, unknown>;
    expect(publicIdentityAfterFresh).not.toHaveProperty('displayName');
    expect(publicIdentityAfterFresh).not.toHaveProperty('pfpUrl');
    expect(sessionStorage.reads.filter((key) => key === presentationKey)).toHaveLength(0);
    expect(JSON.parse(sessionStorage.values.get(presentationKey)!)).toEqual({
      version: 1,
      fid: freshIdentity.fid,
      username: freshIdentity.username,
      expiresAt: expect.any(Number)
    });
  });

  it('discards a different-FID presentation without blocking legitimate cookie restoration', async () => {
    vi.useFakeTimers({ now: 51_500 });
    const localStorage = new MemoryDeviceSessionStorage();
    const sessionStorage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = tabScopedDeviceSessionEnvironment(localStorage, sessionStorage);
    const presentationKey = getFarcasterPresentationSessionStorageKey(
      DEVICE_SESSION_BASE_PATH
    )!;
    expect(persistFarcasterPresentationSession({
      fid: 12_345,
      username: 'stale-keeper',
      displayName: 'Stale Keeper',
      pfpUrl: 'https://images.example/stale.png',
      expiresAt: Date.now() + 60_000
    }, {
      ...sessionEnvironment,
      now: Date.now
    })).toBe(true);
    const restoredFid = 54_321;
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse(restoredFid, Date.now()))
    });
    const authority = createAuthority();
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(sessionStorage.reads.filter((key) => key === presentationKey)).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { fid: restoredFid }
    });
    const restoredIdentity = readPublicState().identity as Record<string, unknown>;
    expect(restoredIdentity).not.toHaveProperty('username');
    expect(restoredIdentity).not.toHaveProperty('displayName');
    expect(restoredIdentity).not.toHaveProperty('pfpUrl');
    expect(sessionStorage.values.has(presentationKey)).toBe(false);
  });

  it('discards same-FID presentation that outlives the refreshed session family', async () => {
    vi.useFakeTimers({ now: 51_600 });
    const localStorage = new MemoryDeviceSessionStorage();
    const sessionStorage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = tabScopedDeviceSessionEnvironment(localStorage, sessionStorage);
    const presentationKey = getFarcasterPresentationSessionStorageKey(
      DEVICE_SESSION_BASE_PATH
    )!;
    expect(persistFarcasterPresentationSession({
      fid: 12_345,
      username: 'overlong-session',
      pfpUrl: 'https://images.example/overlong.png',
      expiresAt: Date.now() + 120_000
    }, {
      ...sessionEnvironment,
      now: Date.now
    })).toBe(true);
    const shortenedFamily = {
      ...createAuthorizedResponse(12_345, Date.now(), Date.now() + 40_000),
      sessionExpiresAt: Math.floor((Date.now() + 60_000) / 1_000) * 1_000
    } satisfies FarcasterBridgeSessionResponse;
    const bridge = createBridge({
      refreshSession: vi.fn(async () => shortenedFamily)
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { fid: 12_345 },
      sessionExpiresAt: shortenedFamily.sessionExpiresAt
    });
    const restoredIdentity = readPublicState().identity as Record<string, unknown>;
    expect(restoredIdentity).not.toHaveProperty('username');
    expect(restoredIdentity).not.toHaveProperty('pfpUrl');
    expect(sessionStorage.values.has(presentationKey)).toBe(false);
  });

  it('purges malformed presentation only after a valid refresh and keeps it out of public state', async () => {
    vi.useFakeTimers({ now: 51_750 });
    const localStorage = new MemoryDeviceSessionStorage();
    const sessionStorage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = tabScopedDeviceSessionEnvironment(localStorage, sessionStorage);
    const presentationKey = getFarcasterPresentationSessionStorageKey(
      DEVICE_SESSION_BASE_PATH
    )!;
    const privateSentinel = 'PRIVATE_PRESENTATION_TOKEN';
    sessionStorage.values.set(presentationKey, JSON.stringify({
      version: 1,
      fid: 12_345,
      username: 'tampered-keeper',
      expiresAt: Date.now() + 60_000,
      accessToken: privateSentinel
    }));
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse(12_345, Date.now()))
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();

    expect(sessionStorage.values.has(presentationKey)).toBe(true);
    expect(sessionStorage.reads.filter((key) => key === presentationKey)).toHaveLength(0);
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { fid: 12_345 }
    });
    expect(JSON.stringify(readPublicState())).not.toContain(privateSentinel);
    expect(document.body.textContent).not.toContain(privateSentinel);
    expect(sessionStorage.values.has(presentationKey)).toBe(false);
  });

  it('exchanges only the verified SIWF envelope with an injected bridge and keeps its JWT out of view state', async () => {
    vi.useFakeTimers({ now: 52_000 });
    const channel = createChannel('EXCHANGE');
    const completed = createCompletedStatus(channel.nonce, 'EXCHANGE');
    const verifiedIdentity = createIdentity(Date.now() - 1);
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => completed),
      verifyCompletedRequest: vi.fn(async () => verifiedIdentity)
    });
    const bridge = createBridge();
    const loadBridgeClient = vi.fn(async () => bridge);

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient,
      resolveAuthContext: () => ({
        domain: channel.domain,
        siweUri: channel.siweUri
      }),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(loadBridgeClient).toHaveBeenCalledTimes(2);
    expect(bridge.createChallenge).toHaveBeenCalledTimes(1);
    const [challengeRequest, challengeOptions] = vi.mocked(bridge.createChallenge).mock.calls[0]!;
    expect(challengeRequest).toEqual({
      domain: channel.domain,
      siweUri: channel.siweUri,
      bindingChallenge: BINDING_CHALLENGE,
      bindingMethod: 'S256'
    });
    expect(challengeRequest).not.toHaveProperty('bindingVerifier');
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    const [request, exchangeOptions] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(request).toMatchObject({
      message: completed.message,
      signature: completed.signature,
      nonce: channel.nonce,
      fid: verifiedIdentity.fid,
      requestId: channel.requestId,
      domain: channel.domain,
      siweUri: channel.siweUri,
      expirationTime: new Date(channel.expiresAt).toISOString(),
      expiresAt: channel.expiresAt,
      bindingVerifier: BINDING_VERIFIER,
      identity: {
        fid: verifiedIdentity.fid
      }
    });
    expect(request).not.toHaveProperty('channelToken');
    expect(JSON.stringify(request)).not.toContain(channel.channelToken);
    expect(exchangeOptions?.signal).toBe(challengeOptions?.signal);
    expect(exchangeOptions?.signal?.aborted).toBe(true);
    expect(JSON.stringify(readPublicState())).not.toContain(createOidcSession().jwt);
    expect(JSON.stringify(readPublicState())).not.toContain(BINDING_VERIFIER);
    expect(JSON.stringify(readPublicState())).not.toContain(BINDING_CHALLENGE);
    expect(document.body.textContent).not.toContain(BINDING_VERIFIER);
    expect(document.body.textContent).not.toContain(BINDING_CHALLENGE);
  });

  it.each([
    ['issuer', { issuer: 'https://different-issuer.example' }],
    ['audience', { audience: 'different-audience' }]
  ])('rejects an access token that does not match the bridge-configured %s', async (
    caseName,
    bridgeAuthority
  ) => {
    vi.useFakeTimers({ now: 53_000 });
    const channel = createChannel(`WRONG_${caseName}`);
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, `WRONG_${caseName}`)),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge(bridgeAuthority);
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'error',
      error: { code: 'invalid-response' }
    });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('clears an expiring access token while a single refresh remains in flight', async () => {
    vi.useFakeTimers({ now: 200_000 });
    const refreshAtExpiry = deferred<FarcasterBridgeSessionResponse>();
    const initial = createAuthorizedResponse(12_345, Date.now(), Date.now() + 40_000);
    const bridge = createBridge({
      refreshSession: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockImplementationOnce(() => refreshAtExpiry.promise)
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now
    });
    await settleAsyncWork();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('authenticated');
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);

    await advanceTime(10_000);
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');

    await advanceTime(30_000);
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
    const [refreshOptions] = vi.mocked(bridge.refreshSession).mock.calls[1]!;
    expect(refreshOptions?.signal?.aborted).toBe(false);

    refreshAtExpiry.resolve(createAuthorizedResponse(12_345, Date.now()));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('authenticated');
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');
  });

  it('pins refreshes to the current in-memory FID while allowing anonymous cookie restoration', async () => {
    vi.useFakeTimers({ now: 250_000 });
    const bridge = createBridge({
      refreshSession: vi.fn()
        .mockResolvedValueOnce(createAuthorizedResponse(12_345, Date.now()))
        .mockResolvedValueOnce(createAuthorizedResponse(54_321, Date.now()))
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now
    });
    await settleAsyncWork();

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { fid: 12_345 }
    });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await settleAsyncWork();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { fid: 12_345 }
    });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');
  });

  it('gates resume refreshes by auth state/proximity and preserves single-flight', async () => {
    vi.useFakeTimers({ now: 300_000 });
    let hidden = false;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    const resumeRefresh = deferred<FarcasterBridgeSessionResponse>();
    const initial = createAuthorizedResponse();
    const bridge = createBridge({
      refreshSession: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockImplementationOnce(() => resumeRefresh.promise)
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now
    });
    await settleAsyncWork();
    expect(bridge.refreshSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);

    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);

    await advanceTime(FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS - 30_000);
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    hidden = true;
    fireEvent(document, new Event('visibilitychange'));
    hidden = false;
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);

    resumeRefresh.resolve(createAuthorizedResponse(12_345, Date.now()));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
  });

  it('purges retired bearer storage while dormant and restores only after explicit activation', async () => {
    vi.useFakeTimers({ now: 55_000 });
    const storage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = deviceSessionEnvironment(storage);
    const retiredToken = createOidcSession().jwt;
    storage.values.set(deviceSessionStorageKey(), retiredToken);
    storage.values.set(
      'warpkeep:/Warpkeep/:farcaster-device-session:v1',
      retiredToken
    );
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse())
    });
    const authority = createAuthority();
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(storage.values.has(deviceSessionStorageKey())).toBe(false);
    expect(storage.values.has('warpkeep:/Warpkeep/:farcaster-device-session:v1')).toBe(false);
    expect(storage.writes).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(readPublicState()).toEqual({
      phase: 'authenticated',
      identity: {
        fid: 12_345,
        verifications: [],
        verifiedAt: Date.now()
      },
      assurance: 'bridge-oidc-alpha',
      expiresAt: createOidcSession().expiresAt,
      sessionExpiresAt: Math.floor(
        (Date.now() + 30 * 24 * 60 * 60 * 1_000) / 1_000
      ) * 1_000
    });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
    expect(bridge.logoutSession).toHaveBeenCalledTimes(1);
    expect(storage.writes).toEqual([[
      getFarcasterDeviceSessionControlKey(DEVICE_SESSION_BASE_PATH),
      `logout-v1:${Date.now()}`
    ]]);
    expect(JSON.stringify(storage.writes)).not.toContain(retiredToken);
  });

  it('suppresses automatic cookie restoration after logout until sign-in is explicit', async () => {
    vi.useFakeTimers({ now: 57_000 });
    const storage = new MemoryDeviceSessionStorage();
    const controlKey = getFarcasterDeviceSessionControlKey(DEVICE_SESSION_BASE_PATH)!;
    storage.values.set(controlKey, `logout-v1:${Date.now()}`);
    const channel = createChannel('AFTER_LOGOUT_INTENT');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel)
    });
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse())
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });
    await settleAsyncWork();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    await settleAsyncWork();
    expect(bridge.refreshSession).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(storage.values.has(controlKey)).toBe(false);
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(readPublicState().phase).toBe('authenticated');
  });

  it('keeps a failed best-effort logout from restoring the cookie on focus or reload', async () => {
    vi.useFakeTimers({ now: 58_000 });
    const storage = new MemoryDeviceSessionStorage();
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse()),
      logoutSession: vi.fn(async () => {
        throw new FarcasterOidcBridgeClientError('bounded fixture outage');
      })
    });
    const sessionEnvironment = deviceSessionEnvironment(storage);
    const firstRender = renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('authenticated');
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(bridge.logoutSession).toHaveBeenCalledTimes(1);
    expect(storage.values.get(getFarcasterDeviceSessionControlKey(DEVICE_SESSION_BASE_PATH)!))
      .toBe(`logout-v1:${Date.now()}`);

    fireEvent(window, new Event('focus'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);

    firstRender.unmount();
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('cannot repopulate a JWT when an aborted refresh resolves after sign-out', async () => {
    vi.useFakeTimers({ now: 58_500 });
    const storage = new MemoryDeviceSessionStorage();
    const lateRefresh = deferred<FarcasterBridgeSessionResponse>();
    const initial = createAuthorizedResponse(12_345, Date.now(), Date.now() + 40_000);
    const bridge = createBridge({
      refreshSession: vi.fn()
        .mockResolvedValueOnce(initial)
        .mockImplementationOnce(() => lateRefresh.promise),
      logoutSession: vi.fn(async () => {
        throw new FarcasterOidcBridgeClientError('bounded fixture outage');
      })
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });
    await settleAsyncWork();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('authenticated');

    await advanceTime(10_000);
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    const [refreshOptions] = vi.mocked(bridge.refreshSession).mock.calls[1]!;
    expect(refreshOptions?.signal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(refreshOptions?.signal?.aborted).toBe(true);
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');

    lateRefresh.resolve(createAuthorizedResponse(12_345, Date.now()));
    await settleAsyncWork();
    fireEvent(window, new Event('focus'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('clears an exact stale logout tombstone but remains dormant until explicit activation', async () => {
    vi.useFakeTimers({ now: 59_000 + FARCASTER_SESSION_TERMINATION_INTENT_TTL_MS });
    const storage = new MemoryDeviceSessionStorage();
    const controlKey = getFarcasterDeviceSessionControlKey(DEVICE_SESSION_BASE_PATH)!;
    storage.values.set(controlKey, 'logout-v1:59000');
    const bridge = createBridge({
      refreshSession: vi.fn(async () => createAuthorizedResponse())
    });
    renderProvider({
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });
    await settleAsyncWork();

    expect(storage.values.has(controlKey)).toBe(false);
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(readPublicState().phase).toBe('anonymous');

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(readPublicState().phase).toBe('authenticated');
  });

  it('fails closed when logout-control storage is denied but permits explicit sign-in', async () => {
    vi.useFakeTimers({ now: 59_500 });
    const denied: FarcasterDeviceSessionStorage = {
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); }
    };
    const channel = createChannel('STORAGE_DENIED');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel)
    });
    const bridge = createBridge();
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      deviceSessionEnvironment: deviceSessionEnvironment(denied)
    });
    await settleAsyncWork();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(readPublicState().phase).toBe('awaiting-approval');
  });

  it('does not remember a live identity when the explicit device preference is disabled', async () => {
    vi.useFakeTimers({ now: 60_000 });
    const storage = new MemoryDeviceSessionStorage();
    const channel = createChannel('NO_REMEMBER');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'NO_REMEMBER')),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge();
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });

    expect(screen.getByTestId('remember-device').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha'
    });
    expect(storage.values.has(deviceSessionStorageKey())).toBe(false);
    expect(storage.writes).toEqual([]);
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledWith(
      expect.objectContaining({ rememberDevice: false }),
      expect.any(Object)
    );
  });

  it('terminates the in-memory bearer when another tab emits logout', async () => {
    vi.useFakeTimers({ now: 65_000 });
    const channel = createChannel('CROSS_TAB_LOGOUT');
    const privateIdentity: VerifiedFarcasterIdentity = {
      ...createIdentity(Date.now() - 1),
      custody: '0x1111111111111111111111111111111111111111',
      verifications: ['0x2222222222222222222222222222222222222222'],
      authMethod: 'authAddress'
    };
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'CROSS_TAB_LOGOUT')),
      verifyCompletedRequest: vi.fn(async () => privateIdentity)
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: { ...publicIdentity(privateIdentity), verifiedAt: 65_010 }
    });
    expect(JSON.stringify(readPublicState())).not.toContain(privateIdentity.custody);
    expect(JSON.stringify(readPublicState())).not.toContain(privateIdentity.authMethod);
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');
    const presentationKey = getFarcasterPresentationSessionStorageKey('/')!;
    expect(window.sessionStorage.getItem(presentationKey)).not.toBeNull();

    fireEvent(window, new StorageEvent('storage', {
      key: getFarcasterDeviceSessionControlKey('/'),
      newValue: `logout-v1:${Date.now()}`
    }));
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
    expect(window.sessionStorage.getItem(presentationKey)).toBeNull();
  });

  it('cancels an in-flight bridge exchange when another tab emits logout', async () => {
    vi.useFakeTimers({ now: 65_000 });
    const channel = createChannel('CROSS_TAB_IN_FLIGHT');
    const bridgeExchange = deferred<FarcasterBridgeSessionResponse>();
    const identity = createIdentity(Date.now() - 1);
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'CROSS_TAB_IN_FLIGHT')),
      verifyCompletedRequest: vi.fn(async () => identity)
    });
    const bridge = createBridge({
      exchangeCompletedSignIn: vi.fn(() => bridgeExchange.promise)
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(readPublicState()).toMatchObject({
      phase: 'verifying',
      identity: publicIdentity(identity)
    });
    const [, exchangeOptions] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(exchangeOptions?.signal?.aborted).toBe(false);

    fireEvent(window, new StorageEvent('storage', {
      key: getFarcasterDeviceSessionControlKey('/'),
      newValue: `logout-v1:${Date.now()}`
    }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(exchangeOptions?.signal?.aborted).toBe(true);

    bridgeExchange.resolve(createAuthorizedResponse());
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('aborts an in-flight bound exchange on explicit cancellation', async () => {
    vi.useFakeTimers({ now: 67_000 });
    const storage = new MemoryDeviceSessionStorage();
    const channel = createChannel('CANCEL_BOUND_EXCHANGE');
    const bridgeExchange = deferred<FarcasterBridgeSessionResponse>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'CANCEL_BOUND_EXCHANGE')),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge({
      exchangeCompletedSignIn: vi.fn(() => bridgeExchange.promise)
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(readPublicState().phase).toBe('verifying');
    const [, options] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(options?.signal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(options?.signal?.aborted).toBe(true);
    expect(bridge.logoutSession).toHaveBeenCalledTimes(1);
    expect(storage.values.get(getFarcasterDeviceSessionControlKey(DEVICE_SESSION_BASE_PATH)!))
      .toBe(`logout-v1:${Date.now()}`);

    bridgeExchange.resolve(createAuthorizedResponse());
    await settleAsyncWork();
    const refreshCallsBeforeResumeAttempt = vi.mocked(bridge.refreshSession).mock.calls.length;
    fireEvent(window, new Event('focus'));
    fireEvent.click(screen.getByRole('button', { name: 'Refresh session' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
    expect(bridge.refreshSession).toHaveBeenCalledTimes(refreshCallsBeforeResumeAttempt);
    expect(storage.values.size).toBe(1);
  });

  it('aborts an in-flight bound exchange when its generation expires', async () => {
    vi.useFakeTimers({ now: 69_000 });
    const channel = createChannel('EXPIRE_BOUND_EXCHANGE', Date.now(), Date.now() + 20);
    const bridgeExchange = deferred<FarcasterBridgeSessionResponse>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'EXPIRE_BOUND_EXCHANGE')),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge({
      exchangeCompletedSignIn: vi.fn(() => bridgeExchange.promise)
    });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(readPublicState().phase).toBe('verifying');
    const [, options] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(options?.signal?.aborted).toBe(false);

    await advanceTime(10);
    expect(readPublicState()).toMatchObject({ phase: 'expired' });
    expect(options?.signal?.aborted).toBe(true);

    bridgeExchange.resolve(createAuthorizedResponse());
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({ phase: 'expired' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('aborts an in-flight bound exchange during StrictMode provider cleanup', async () => {
    vi.useFakeTimers({ now: 71_000 });
    const channel = createChannel('UNMOUNT_BOUND_EXCHANGE');
    const bridgeExchange = deferred<FarcasterBridgeSessionResponse>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'UNMOUNT_BOUND_EXCHANGE')),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge({
      exchangeCompletedSignIn: vi.fn(() => bridgeExchange.promise)
    });
    const rendered = renderProvider({
      strict: true,
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    const [, options] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(options?.signal?.aborted).toBe(false);

    rendered.unmount();
    expect(options?.signal?.aborted).toBe(true);
    bridgeExchange.resolve(createAuthorizedResponse());
    await settleAsyncWork();
  });

  it('uses a fresh binding and signal after cancellation and exchanges only the retry verifier', async () => {
    vi.useFakeTimers({ now: 73_000 });
    const firstChannel = createChannel('FIRST_BINDING');
    const secondChannel = createChannel('SECOND_BINDING');
    const authority = createAuthority({
      beginSignIn: vi.fn()
        .mockResolvedValueOnce(firstChannel)
        .mockResolvedValueOnce(secondChannel),
      getStatus: vi.fn(async () => createCompletedStatus(secondChannel.nonce, 'SECOND_BINDING')),
      verifyCompletedRequest: vi.fn(async () => createIdentity(Date.now() - 1))
    });
    const bridge = createBridge();
    const createBrowserBinding = vi.fn()
      .mockResolvedValueOnce({
        verifier: BINDING_VERIFIER,
        challenge: BINDING_CHALLENGE,
        method: 'S256' as const
      })
      .mockResolvedValueOnce({
        verifier: SECOND_BINDING_VERIFIER,
        challenge: SECOND_BINDING_CHALLENGE,
        method: 'S256' as const
      });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      loadBridgeClient: vi.fn(async () => bridge),
      createBrowserBinding,
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('awaiting-approval');
    const [, firstOptions] = vi.mocked(bridge.createChallenge).mock.calls[0]!;
    expect(firstOptions?.signal?.aborted).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(firstOptions?.signal?.aborted).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(createBrowserBinding).toHaveBeenCalledTimes(2);
    expect(bridge.createChallenge).toHaveBeenNthCalledWith(1, expect.objectContaining({
      bindingChallenge: BINDING_CHALLENGE
    }), expect.any(Object));
    expect(bridge.createChallenge).toHaveBeenNthCalledWith(2, expect.objectContaining({
      bindingChallenge: SECOND_BINDING_CHALLENGE
    }), expect.any(Object));
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    const [exchange] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(exchange.bindingVerifier).toBe(SECOND_BINDING_VERIFIER);
    expect(exchange.bindingVerifier).not.toBe(BINDING_VERIFIER);
    expect(JSON.stringify(readPublicState())).not.toContain(BINDING_VERIFIER);
    expect(JSON.stringify(readPublicState())).not.toContain(SECOND_BINDING_VERIFIER);
  });

  it('ignores a late channel from a cancelled generation while a retry proceeds', async () => {
    const firstChannel = deferred<FarcasterSignInChannel>();
    const secondChannel = deferred<FarcasterSignInChannel>();
    const authority = createAuthority({
      beginSignIn: vi.fn()
        .mockImplementationOnce(() => firstChannel.promise)
        .mockImplementationOnce(() => secondChannel.promise)
    });
    const encodeQrCode = vi.fn(async (channelUrl: string) => `data:image/svg+xml,${channelUrl}`);

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(readPublicState().phase).toBe('anonymous');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    await settleAsyncWork();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(2);

    const freshChannel = createChannel('FRESH');
    secondChannel.resolve(freshChannel);
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      channelUrl: freshChannel.url
    });

    const staleChannel = createChannel('STALE');
    firstChannel.resolve(staleChannel);
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      channelUrl: freshChannel.url
    });
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalledWith(staleChannel.url);
  });

  it('clears a scheduled poll on cancellation and never polls that channel', async () => {
    vi.useFakeTimers({ now: 65_000 });
    const channel = createChannel('CANCEL_TIMER');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => ({ state: 'pending' as const, nonce: channel.nonce }))
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 1_500
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('awaiting-approval');
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    await advanceTime(10_000);
    expect(authority.getStatus).not.toHaveBeenCalled();
  });

  it('ignores completed status and verification results after cancellation', async () => {
    vi.useFakeTimers({ now: 75_000 });
    const channel = createChannel('RACE');
    const lateStatus = deferred<FarcasterChannelStatus>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(() => lateStatus.promise),
      verifyCompletedRequest: vi.fn(async () => createIdentity())
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    lateStatus.resolve(createCompletedStatus(channel.nonce, 'LATE'));
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(authority.verifyCompletedRequest).not.toHaveBeenCalled();
  });

  it('ignores a successful verification that resolves after cancellation', async () => {
    vi.useFakeTimers({ now: 90_000 });
    const channel = createChannel('VERIFY_RACE');
    const lateVerification = deferred<VerifiedFarcasterIdentity>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'VERIFY_RACE')),
      verifyCompletedRequest: vi.fn(() => lateVerification.promise)
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(readPublicState().phase).toBe('verifying');

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    lateVerification.resolve(createIdentity());
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
  });

  it('expires a never-resolving creation and ignores its eventual result', async () => {
    vi.useFakeTimers({ now: 100_000 });
    const lateChannel = deferred<FarcasterSignInChannel>();
    const authority = createAuthority({
      beginSignIn: vi.fn(() => lateChannel.promise)
    });
    const encodeQrCode = vi.fn(async () => 'data:image/svg+xml,qr');

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode,
      now: Date.now
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(FARCASTER_AUTH_REQUEST_TTL_MS);

    expect(readPublicState()).toMatchObject({
      phase: 'expired',
      error: { code: 'expired' }
    });

    lateChannel.resolve(createChannel('TOO_LATE'));
    await settleAsyncWork();
    expect(readPublicState().phase).toBe('expired');
    expect(encodeQrCode).not.toHaveBeenCalled();
  });

  it('stops polling permanently when an awaiting channel reaches its deadline', async () => {
    vi.useFakeTimers({ now: 125_000 });
    const channel = createChannel(
      'POLL_TIMEOUT',
      Date.now(),
      Date.now() + FARCASTER_AUTH_REQUEST_TTL_MS
    );
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => ({ state: 'pending' as const, nonce: channel.nonce }))
    });

    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);

    await advanceTime(FARCASTER_AUTH_REQUEST_TTL_MS);
    expect(readPublicState()).toMatchObject({
      phase: 'expired',
      error: { code: 'expired' }
    });
    const callsAtExpiry = vi.mocked(authority.getStatus).mock.calls.length;
    expect(vi.getTimerCount()).toBe(0);
    await advanceTime(10_000);
    expect(authority.getStatus).toHaveBeenCalledTimes(callsAtExpiry);
  });

  it('cleans up in-flight work on provider unmount', async () => {
    vi.useFakeTimers({ now: 150_000 });
    const channel = createChannel('UNMOUNT');
    const lateStatus = deferred<FarcasterChannelStatus>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(() => lateStatus.promise),
      verifyCompletedRequest: vi.fn(async () => createIdentity())
    });
    const rendered = renderProvider({
      strict: true,
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr'),
      now: Date.now,
      pollIntervalMs: 10
    });

    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);
    rendered.unmount();
    lateStatus.resolve(createCompletedStatus(channel.nonce, 'UNMOUNT'));
    await settleAsyncWork();

    expect(authority.verifyCompletedRequest).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('publishes only sanitized authority errors and keeps QR failure on the active channel', async () => {
    vi.useFakeTimers({ now: 175_000 });
    const privateSentinel = 'PRIVATE_TOKEN_AND_SIGNATURE_SENTINEL';
    const failingAuthority = createAuthority({
      beginSignIn: vi.fn(async () => {
        throw new Error(privateSentinel);
      })
    });

    const firstRender = renderProvider({
      loadAuthority: vi.fn(async () => failingAuthority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,qr')
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({ phase: 'error', error: { code: 'unknown' } });
    expect(JSON.stringify(readPublicState())).not.toContain(privateSentinel);
    firstRender.unmount();

    const channel = createChannel('QR_FAIL');
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => ({ state: 'pending' as const, nonce: channel.nonce }))
    });
    const encodeQrCode = vi.fn()
      .mockRejectedValueOnce(new Error(privateSentinel))
      .mockResolvedValueOnce('data:image/svg+xml,qr-retry');
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode,
      now: Date.now,
      pollIntervalMs: 10
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      channelUrl: channel.url,
      qr: { state: 'not-requested' }
    });

    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR' }));
    await settleAsyncWork();
    expect(encodeQrCode).toHaveBeenCalledTimes(1);
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'error' }
    });
    expect(JSON.stringify(readPublicState())).not.toContain(privateSentinel);

    await advanceTime(10);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);
    expect(readPublicState().phase).toBe('awaiting-approval');

    fireEvent.click(screen.getByRole('button', { name: 'Prepare QR' }));
    await settleAsyncWork();
    expect(encodeQrCode).toHaveBeenCalledTimes(2);
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      qr: { state: 'ready', dataUrl: 'data:image/svg+xml,qr-retry' }
    });
  });
});
