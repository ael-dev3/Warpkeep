import { StrictMode, useState, type ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAuthProvider,
  useFarcasterAuth,
  type FarcasterAuthProviderProps
} from '../src/farcaster/FarcasterAuthProvider';
import { FARCASTER_AUTH_REQUEST_TTL_MS } from '../src/farcaster/farcasterAuthContext';
import type {
  FarcasterChannelStatus,
  FarcasterCompletedChannelStatus,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

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

function createAuthority(overrides: Partial<FarcasterSessionAuthority> = {}) {
  return {
    beginSignIn: vi.fn<() => Promise<FarcasterSignInChannel>>(),
    getStatus: vi.fn<(channelToken: string) => Promise<FarcasterChannelStatus>>(),
    verifyCompletedRequest: vi.fn<FarcasterSessionAuthority['verifyCompletedRequest']>(),
    ...overrides
  } satisfies FarcasterSessionAuthority;
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
      <button onClick={auth.signOut} type="button">Sign out</button>
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
  ...providerProps
}: RenderProviderOptions) {
  const provider = (
    <FarcasterAuthProvider {...providerProps}>
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
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('FarcasterAuthProvider session lifecycle', () => {
  it('does no auth work on mount and synchronously deduplicates begin under StrictMode', async () => {
    const pendingChannel = deferred<FarcasterSignInChannel>();
    const authority = createAuthority({
      beginSignIn: vi.fn(() => pendingChannel.promise)
    });
    const loadAuthority = vi.fn(async () => authority);
    const encodeQrCode = vi.fn(async () => 'data:image/svg+xml,qr');

    renderProvider({
      children: <AuthHarness duplicateBegin />,
      strict: true,
      loadAuthority,
      encodeQrCode
    });

    expect(loadAuthority).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();

    expect(readPublicState().phase).toBe('creating-channel');
    expect(loadAuthority).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    const channel = createChannel('STRICT');
    pendingChannel.resolve(channel);
    await settleAsyncWork();

    expect(encodeQrCode).toHaveBeenCalledTimes(1);
    expect(encodeQrCode).toHaveBeenCalledWith(channel.url);
    expect(readPublicState()).toMatchObject({
      phase: 'awaiting-approval',
      channelUrl: channel.url,
      qrDataUrl: 'data:image/svg+xml,qr'
    });
    expect(readPublicState()).not.toHaveProperty('channelToken');
    expect(readPublicState()).not.toHaveProperty('nonce');
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

  it('pauses a scheduled poll while hidden and resumes immediately without duplicate requests', async () => {
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
    fireEvent(document, new Event('visibilitychange'));
    fireEvent(document, new Event('visibilitychange'));
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
    expect(readPublicState()).toEqual({ phase: 'authenticated', identity });
    expect(JSON.stringify(readPublicState())).not.toContain('PRIVATE_MESSAGE_COMPLETE');
    expect(JSON.stringify(readPublicState())).not.toContain(channel.channelToken);
    await advanceTime(50_000);
    expect(authority.getStatus).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Toggle child' }));
    expect(screen.queryByTestId('auth-state')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Toggle child' }));
    expect(readPublicState()).toEqual({ phase: 'authenticated', identity });
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    expect(readPublicState()).toEqual({ phase: 'anonymous' });
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
    expect(encodeQrCode).toHaveBeenCalledTimes(1);
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

  it('publishes only sanitized errors from authority and QR failures', async () => {
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
    const authority = createAuthority({ beginSignIn: vi.fn(async () => channel) });
    renderProvider({
      loadAuthority: vi.fn(async () => authority),
      encodeQrCode: vi.fn(async () => {
        throw new Error(privateSentinel);
      })
    });
    fireEvent.click(screen.getByRole('button', { name: 'Begin' }));
    await settleAsyncWork();
    expect(readPublicState()).toEqual({
      phase: 'error',
      error: {
        code: 'qr',
        message: 'Warpkeep could not prepare the Farcaster QR code.'
      }
    });
    expect(JSON.stringify(readPublicState())).not.toContain(privateSentinel);
  });
});
