import { StrictMode, useCallback } from 'react';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useAdmissionGrantAcknowledgement } from '../src/farcaster/useAdmissionGrantAcknowledgement';
import type {
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient,
  FarcasterQuickAuthTokenResult
} from '../src/farcaster/farcasterAuthTypes';

const TICKET = 'A'.repeat(43);
const NOTIFICATION_ID = `warpkeep-access-grant-v3-i${'N'.repeat(22)}`;
const VERIFIED_AT = 1_785_414_896_000;

const pending = (fid: number): FarcasterAuthViewState => Object.freeze({
  phase: 'pending-admission',
  identity: Object.freeze({
    fid,
    verifications: [] as const,
    verifiedAt: VERIFIED_AT
  }),
  sessionExpiresAt: VERIFIED_AT + 60_000
});

const anonymous: FarcasterAuthViewState = Object.freeze({ phase: 'anonymous' });

function bridge(
  acknowledgeAdmissionGrant: NonNullable<FarcasterOidcBridgeClient['acknowledgeAdmissionGrant']>
): FarcasterOidcBridgeClient {
  return {
    issuer: 'https://auth.warpkeep.example',
    audience: 'warpkeep-spacetimedb',
    createChallenge: vi.fn(async () => { throw new Error('unused'); }),
    exchangeCompletedSignIn: vi.fn(async () => { throw new Error('unused'); }),
    refreshSession: vi.fn(async () => { throw new Error('unused'); }),
    logoutSession: vi.fn(async () => undefined),
    getAccessRequestStatus: vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    })),
    requestAccess: vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: VERIFIED_AT
    })),
    acknowledgeAdmissionGrant
  };
}

type HarnessProps = Readonly<{
  ticket?: string;
  notificationId?: string | null;
  authState: FarcasterAuthViewState;
  generation: number;
  client: FarcasterOidcBridgeClient;
  loadQuickAuthToken?: () => Promise<FarcasterQuickAuthTokenResult>;
  onCapabilityConsumed?: () => void;
}>;

function Harness({
  ticket,
  notificationId,
  authState,
  generation,
  client,
  loadQuickAuthToken,
  onCapabilityConsumed
}: HarnessProps) {
  const loadBridgeClient = useCallback(async () => client, [client]);
  const readTicket = useCallback(() => ticket, [ticket]);
  const effectiveNotificationId = notificationId === undefined
    ? NOTIFICATION_ID
    : notificationId ?? undefined;
  const state = useAdmissionGrantAcknowledgement({
    available: ticket !== undefined,
    notificationId: effectiveNotificationId,
    readTicket,
    authState,
    authGeneration: generation,
    loadBridgeClient,
    loadQuickAuthToken,
    onCapabilityConsumed
  });
  return <output data-testid="phase">{state.phase}</output>;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => { resolve = resolvePromise; });
  return Object.freeze({ promise, resolve });
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Farcaster admission notification grant acknowledgement', () => {
  it('never exchanges a capability before a bridge-verified pending identity exists', async () => {
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'accepted' as const }));
    render(
      <Harness
        authState={anonymous}
        client={bridge(acknowledge)}
        generation={1}
        ticket={TICKET}
      />
    );

    expect(screen.getByTestId('phase').textContent).toBe('idle');
    await Promise.resolve();
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it('uses Quick Auth, binds the verified FID, and consumes one accepted capability once', async () => {
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'accepted' as const }));
    const loadQuickAuthToken = vi.fn(async () => ({
      status: 'token' as const,
      token: 'header.payload.signature'
    }));
    const consumed = vi.fn();
    render(
      <StrictMode>
        <Harness
          authState={pending(539_854)}
          client={bridge(acknowledge)}
          generation={3}
          loadQuickAuthToken={loadQuickAuthToken}
          onCapabilityConsumed={consumed}
          ticket={TICKET}
        />
      </StrictMode>
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('finalizing');
    });
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith(
      { mode: 'quick-auth', token: 'header.payload.signature' },
      expect.objectContaining({
        ticket: TICKET,
        notificationId: NOTIFICATION_ID,
        expectedFid: 539_854
      })
    );
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('retains the capability and fails closed without exact Farcaster notification context', async () => {
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'accepted' as const }));
    const consumed = vi.fn();
    const view = render(
      <Harness
        authState={pending(539_854)}
        client={bridge(acknowledge)}
        generation={3}
        notificationId={null}
        onCapabilityConsumed={consumed}
        ticket={TICKET}
      />
    );

    expect(screen.getByTestId('phase').textContent)
      .toBe('awaiting-notification-context');
    await act(async () => { await Promise.resolve(); });
    expect(acknowledge).not.toHaveBeenCalled();
    expect(consumed).not.toHaveBeenCalled();

    view.rerender(
      <Harness
        authState={pending(539_854)}
        client={bridge(acknowledge)}
        generation={3}
        notificationId="warpkeep-access-approved-v1-e7"
        onCapabilityConsumed={consumed}
        ticket={TICKET}
      />
    );
    expect(screen.getByTestId('phase').textContent)
      .toBe('awaiting-notification-context');
    expect(acknowledge).not.toHaveBeenCalled();
    expect(consumed).not.toHaveBeenCalled();
  });

  it('forgets a stale capability without entering finalization', async () => {
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'stale' as const }));
    const consumed = vi.fn();
    render(
      <Harness
        authState={pending(539_854)}
        client={bridge(acknowledge)}
        generation={3}
        onCapabilityConsumed={consumed}
        ticket={TICKET}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('stale');
    });
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('retries a not-ready provider settlement inside one bounded operation', async () => {
    vi.useFakeTimers();
    const acknowledge = vi.fn()
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-ready' as const })
      .mockResolvedValueOnce({ version: 1 as const, status: 'accepted' as const });
    const consumed = vi.fn();
    render(
      <Harness
        authState={pending(539_854)}
        client={bridge(acknowledge)}
        generation={3}
        onCapabilityConsumed={consumed}
        ticket={TICKET}
      />
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(1_100); });
    expect(screen.getByTestId('phase').textContent).toBe('finalizing');
    expect(acknowledge).toHaveBeenCalledTimes(2);
    expect(consumed).toHaveBeenCalledTimes(1);
  });

  it('keeps one bounded retry beyond the provider fifteen-second settlement window', async () => {
    vi.useFakeTimers();
    const acknowledge = vi.fn()
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-ready' as const })
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-ready' as const })
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-ready' as const })
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-ready' as const })
      .mockResolvedValueOnce({ version: 1 as const, status: 'accepted' as const });
    render(
      <Harness
        authState={pending(539_854)}
        client={bridge(acknowledge)}
        generation={3}
        ticket={TICKET}
      />
    );

    await act(async () => { await vi.advanceTimersByTimeAsync(11_000); });
    expect(acknowledge).toHaveBeenCalledTimes(4);
    expect(screen.getByTestId('phase').textContent).toBe('acknowledging');
    await act(async () => { await vi.advanceTimersByTimeAsync(9_000); });
    expect(acknowledge).toHaveBeenCalledTimes(5);
    expect(screen.getByTestId('phase').textContent).toBe('finalizing');
  });

  it('leaves a bounded finalizing state when admission authority never arrives', async () => {
    vi.useFakeTimers();
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'accepted' as const }));
    const client = bridge(acknowledge);
    const view = render(
      <Harness
        authState={pending(539_854)}
        client={client}
        generation={3}
        ticket={TICKET}
      />
    );
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByTestId('phase').textContent).toBe('finalizing');

    view.rerender(
      <Harness
        authState={pending(539_854)}
        client={client}
        generation={3}
      />
    );
    for (let minute = 0; minute < 9; minute += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      view.rerender(
        <Harness
          authState={pending(539_854)}
          client={client}
          generation={3}
        />
      );
      expect(screen.getByTestId('phase').textContent).toBe('finalizing');
    }
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(screen.getByTestId('phase').textContent).toBe('confirmed-pending');
  });

  it('abandons an in-flight capability when the verified identity is cleared', async () => {
    const token = deferred<FarcasterQuickAuthTokenResult>();
    const acknowledge = vi.fn(async () => ({ version: 1 as const, status: 'accepted' as const }));
    const client = bridge(acknowledge);
    const view = render(
      <Harness
        authState={pending(539_854)}
        client={client}
        generation={3}
        loadQuickAuthToken={() => token.promise}
        ticket={TICKET}
      />
    );
    await waitFor(() => {
      expect(screen.getByTestId('phase').textContent).toBe('acknowledging');
    });

    view.rerender(
      <Harness
        authState={anonymous}
        client={client}
        generation={4}
        loadQuickAuthToken={() => token.promise}
        ticket={TICKET}
      />
    );
    token.resolve({ status: 'token', token: 'header.payload.signature' });
    await act(async () => { await Promise.resolve(); });

    expect(acknowledge).not.toHaveBeenCalled();
  });
});
