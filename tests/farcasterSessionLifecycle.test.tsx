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
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type {
  FarcasterChannelStatus,
  FarcasterCompletedChannelStatus,
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
    verifications: [],
    authMethod: 'authAddress'
  };
}

function createIdentity(verifiedAt = Date.now()): VerifiedFarcasterIdentity {
  return {
    fid: 12_345,
    username: 'keeper',
    displayName: 'The Keeper',
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
    auth_epoch: 0,
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
    exchangeCompletedSignIn: vi.fn(async (request) => createOidcSession(request.fid)),
    ...overrides
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

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
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
      <button onClick={auth.signOut} type="button">Sign out</button>
      <button
        onClick={() => auth.setRememberDevice(!auth.rememberDevice)}
        type="button"
      >
        Toggle remember device
      </button>
      <output data-testid="remember-device">{String(auth.rememberDevice)}</output>
      <output data-testid="has-remembered-device">{String(auth.hasRememberedDevice)}</output>
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
    const createBrowserBinding = vi.fn(async () => ({
      verifier: BINDING_VERIFIER,
      challenge: BINDING_CHALLENGE,
      method: 'S256' as const
    }));

    const rendered = renderProvider({
      children: <AuthHarness duplicateBegin />,
      strict: true,
      loadAuthority,
      loadBridgeClient: vi.fn(async () => bridge),
      createBrowserBinding,
      resolveAuthContext: () => ({
        domain: 'example.com',
        siweUri: 'https://example.com/Warpkeep/'
      }),
      encodeQrCode
    });

    expect(loadAuthority).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

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
      identity: publicIdentity(identity),
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
      identity: publicIdentity(identity),
      assurance: 'bridge-oidc-alpha',
      expiresAt: expect.any(Number)
    });
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
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

    expect(loadBridgeClient).toHaveBeenCalledTimes(1);
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
        fid: verifiedIdentity.fid,
        username: verifiedIdentity.username,
        displayName: verifiedIdentity.displayName
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

  it('persists, restores, and forgets a bridge-OIDC session through injected storage', async () => {
    vi.useFakeTimers({ now: 55_000 });
    const storage = new MemoryDeviceSessionStorage();
    const sessionEnvironment = deviceSessionEnvironment(storage);
    const channel = createChannel('REMEMBERED');
    const verifiedIdentity = createIdentity(Date.now() - 1_000);
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'REMEMBERED')),
      verifyCompletedRequest: vi.fn(async () => verifiedIdentity)
    });
    const liveRender = renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: sessionEnvironment
    });

    expect(screen.getByTestId('remember-device').textContent).toBe('true');
    expect(screen.getByTestId('has-remembered-device').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      identity: publicIdentity(verifiedIdentity),
      assurance: 'bridge-oidc-alpha',
      expiresAt: Math.floor(
        (Date.now() + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS) / 1_000
      ) * 1_000
    });
    expect(screen.getByTestId('has-remembered-device').textContent).toBe('true');
    const serialized = storage.values.get(deviceSessionStorageKey());
    expect(serialized).toBeTruthy();
    expect(serialized).not.toContain(channel.channelToken);
    expect(serialized).not.toContain('PRIVATE_MESSAGE_REMEMBERED');
    expect(serialized).not.toContain('authMethod');
    expect(serialized).not.toContain(BINDING_VERIFIER);
    expect(serialized).not.toContain(BINDING_CHALLENGE);
    expect(window.localStorage.getItem(deviceSessionStorageKey())).toBeNull();
    expect(JSON.parse(serialized!)).toMatchObject({
      origin: DEVICE_SESSION_ORIGIN,
      basePath: DEVICE_SESSION_BASE_PATH,
      expiresAt: Math.floor(
        (Date.now() + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS) / 1_000
      ) * 1_000
    });

    liveRender.unmount();
    const restoredAuthority = createAuthority();
    renderProvider({
      loadAuthority: vi.fn(async () => restoredAuthority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      deviceSessionEnvironment: sessionEnvironment
    });

    expect(readPublicState()).toEqual({
      phase: 'authenticated',
      identity: {
        fid: verifiedIdentity.fid,
        username: verifiedIdentity.username,
        displayName: verifiedIdentity.displayName,
        verifications: [],
        verifiedAt: verifiedIdentity.verifiedAt
      },
      assurance: 'bridge-oidc-alpha',
      expiresAt: Math.floor(
        (Date.now() + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS) / 1_000
      ) * 1_000
    });
    expect(restoredAuthority.beginSignIn).not.toHaveBeenCalled();
    expect(screen.getByTestId('has-remembered-device').textContent).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-remembered-device').textContent).toBe('false');
    expect(storage.values.has(deviceSessionStorageKey())).toBe(false);
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
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => 'data:image/svg+xml,unused'),
      now: Date.now,
      pollIntervalMs: 10,
      deviceSessionEnvironment: deviceSessionEnvironment(storage)
    });

    fireEvent.click(screen.getByRole('button', { name: 'Toggle remember device' }));
    expect(screen.getByTestId('remember-device').textContent).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    await advanceTime(10);

    expect(readPublicState()).toMatchObject({
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha'
    });
    expect(screen.getByTestId('has-remembered-device').textContent).toBe('false');
    expect(storage.values.has(deviceSessionStorageKey())).toBe(false);
  });

  it('terminates a live persisted bearer when another tab emits logout', async () => {
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
      identity: publicIdentity(privateIdentity)
    });
    expect(JSON.stringify(readPublicState())).not.toContain(privateIdentity.custody);
    expect(JSON.stringify(readPublicState())).not.toContain(privateIdentity.authMethod);
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('true');

    fireEvent(window, new StorageEvent('storage', {
      key: getFarcasterDeviceSessionControlKey('/'),
      newValue: `logout-v1:${Date.now()}`
    }));
    await settleAsyncWork();

    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('cancels an in-flight bridge exchange when another tab emits logout', async () => {
    vi.useFakeTimers({ now: 65_000 });
    const channel = createChannel('CROSS_TAB_IN_FLIGHT');
    const bridgeExchange = deferred<FarcasterOidcSession>();
    const authority = createAuthority({
      beginSignIn: vi.fn(async () => channel),
      getStatus: vi.fn(async () => createCompletedStatus(channel.nonce, 'CROSS_TAB_IN_FLIGHT')),
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
    const [, exchangeOptions] = vi.mocked(bridge.exchangeCompletedSignIn).mock.calls[0]!;
    expect(exchangeOptions?.signal?.aborted).toBe(false);

    fireEvent(window, new StorageEvent('storage', {
      key: getFarcasterDeviceSessionControlKey('/'),
      newValue: `logout-v1:${Date.now()}`
    }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(exchangeOptions?.signal?.aborted).toBe(true);

    bridgeExchange.resolve(createOidcSession());
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('aborts an in-flight bound exchange on explicit cancellation', async () => {
    vi.useFakeTimers({ now: 67_000 });
    const storage = new MemoryDeviceSessionStorage();
    const channel = createChannel('CANCEL_BOUND_EXCHANGE');
    const bridgeExchange = deferred<FarcasterOidcSession>();
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
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(options?.signal?.aborted).toBe(true);

    bridgeExchange.resolve(createOidcSession());
    await settleAsyncWork();
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
    expect(storage.values.size).toBe(0);
  });

  it('aborts an in-flight bound exchange when its generation expires', async () => {
    vi.useFakeTimers({ now: 69_000 });
    const channel = createChannel('EXPIRE_BOUND_EXCHANGE', Date.now(), Date.now() + 20);
    const bridgeExchange = deferred<FarcasterOidcSession>();
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

    bridgeExchange.resolve(createOidcSession());
    await settleAsyncWork();
    expect(readPublicState()).toMatchObject({ phase: 'expired' });
    expect(screen.getByTestId('has-oidc-session').textContent).toBe('false');
  });

  it('aborts an in-flight bound exchange during StrictMode provider cleanup', async () => {
    vi.useFakeTimers({ now: 71_000 });
    const channel = createChannel('UNMOUNT_BOUND_EXCHANGE');
    const bridgeExchange = deferred<FarcasterOidcSession>();
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
    bridgeExchange.resolve(createOidcSession());
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
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
    expect(vi.getTimerCount()).toBe(0);
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
