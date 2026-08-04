import {
  StrictMode,
  useCallback,
  type ReactNode
} from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAccessRequestAction,
  FarcasterAccessRequestMessage
} from '../src/components/auth/FarcasterAccessRequest';
import { subscribeWarpkeepSfx } from '../src/components/audio/sfxEvents';
import type { AccessRequestDiagnosticEvent } from '../src/farcaster/accessRequestStateMachine';
import { useAccessRequest } from '../src/farcaster/useAccessRequest';
import { createFarcasterOidcBridgeClient } from '../src/farcaster/farcasterOidcBridgeClient';
import type {
  AccessRequestStatus,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient,
  FarcasterQuickAuthTokenOptions,
  FarcasterQuickAuthTokenResult
} from '../src/farcaster/farcasterAuthTypes';

const REQUESTED_AT = 1_785_414_896_000;

const pending = (fid: number): FarcasterAuthViewState => Object.freeze({
  phase: 'pending-admission',
  identity: Object.freeze({
    fid,
    verifications: [] as const,
    verifiedAt: REQUESTED_AT
  }),
  sessionExpiresAt: 1_788_006_896_000
});

const anonymous: FarcasterAuthViewState = Object.freeze({ phase: 'anonymous' });

const quickToken = (token: string): FarcasterQuickAuthTokenResult => Object.freeze({
  status: 'token',
  token
});

const quickRejected: FarcasterQuickAuthTokenResult = Object.freeze({
  status: 'rejected'
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return Object.freeze({ promise, reject, resolve });
}

function bridge(overrides: Partial<FarcasterOidcBridgeClient> = {}): FarcasterOidcBridgeClient {
  return {
    issuer: 'https://auth.warpkeep.example',
    audience: 'warpkeep-spacetimedb',
    createChallenge: vi.fn(async () => {
      throw new Error('unused');
    }),
    exchangeCompletedSignIn: vi.fn(async () => {
      throw new Error('unused');
    }),
    refreshSession: vi.fn(async () => {
      throw new Error('unused');
    }),
    logoutSession: vi.fn(async () => undefined),
    getAccessRequestStatus: vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    })),
    requestAccess: vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    })),
    ...overrides,
    acknowledgeAdmissionGrant: overrides.acknowledgeAdmissionGrant ?? vi.fn(async () => ({
      version: 1 as const,
      status: 'stale' as const
    }))
  };
}

type HarnessProps = Readonly<{
  authState: FarcasterAuthViewState;
  generation: number;
  client: FarcasterOidcBridgeClient;
  loadQuickAuthToken?: (
    options?: FarcasterQuickAuthTokenOptions
  ) => Promise<FarcasterQuickAuthTokenResult>;
  minimumSubmittingMilliseconds?: number;
  minimumVerifyingMilliseconds?: number;
  reportDiagnostic?: (event: AccessRequestDiagnosticEvent) => void;
  onAuthenticationIdentityChanged?: () => void;
  bridgeLoaderVersion?: number;
  captureRequestAccess?: (callback: () => boolean) => void;
  captureRetryStatus?: (callback: () => void) => void;
  extra?: ReactNode;
}>;

function Harness({
  authState,
  generation,
  client,
  loadQuickAuthToken,
  minimumSubmittingMilliseconds = 0,
  minimumVerifyingMilliseconds = 0,
  reportDiagnostic,
  onAuthenticationIdentityChanged,
  bridgeLoaderVersion = 0,
  captureRequestAccess,
  captureRetryStatus,
  extra
}: HarnessProps) {
  // The version is intentionally captured so tests can churn loader identity.
  const loadBridgeClient = useCallback(async () => {
    void bridgeLoaderVersion;
    return client;
  }, [bridgeLoaderVersion, client]);
  const access = useAccessRequest({
    authState,
    authGeneration: generation,
    loadBridgeClient,
    loadQuickAuthToken,
    minimumSubmittingMilliseconds,
    minimumVerifyingMilliseconds,
    monotonicNow: Date.now,
    reportDiagnostic,
    onAuthenticationIdentityChanged
  });
  captureRequestAccess?.(access.requestAccess);
  captureRetryStatus?.(access.retryStatus);
  return (
    <div>
      <output data-testid="access-phase">{access.state.phase}</output>
      {'requestedAt' in access.state ? (
        <time data-testid="access-timestamp">{access.state.requestedAt}</time>
      ) : null}
      <FarcasterAccessRequestMessage state={access.state} />
      <FarcasterAccessRequestAction
        onCheckAdmission={() => true}
        onRequestAccess={access.requestAccess}
        onRetryStatus={access.retryStatus}
        state={access.state}
      />
      <button
        onClick={() => {
          for (let index = 0; index < 20; index += 1) access.requestAccess();
        }}
        type="button"
      >
        DIRECT 20 REQUESTS
      </button>
      {extra}
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('professional access-request lifecycle', () => {
  it('loads status once per identity generation without flashing the request button', async () => {
    const status = deferred<AccessRequestStatus>();
    const getAccessRequestStatus = vi.fn(() => status.promise);
    const client = bridge({ getAccessRequestStatus });
    const view = render(
      <StrictMode>
        <Harness authState={pending(12_345)} client={client} generation={7} />
      </StrictMode>
    );

    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.getByText('CHECKING REQUEST STATUS')).not.toBeNull();
    await waitFor(() => expect(getAccessRequestStatus).toHaveBeenCalledTimes(1));

    status.resolve({ version: 1, status: 'not-requested' });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'REQUEST ACCESS' })).not.toBeNull();
    });

    view.rerender(
      <StrictMode>
        <Harness
          authState={pending(12_345)}
          bridgeLoaderVersion={1}
          client={client}
          generation={7}
        />
      </StrictMode>
    );
    await Promise.resolve();
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(1);
  });

  it('removes the button in the accepted frame, transfers focus, and keeps one stable region', async () => {
    const submitted = deferred<AccessRequestStatus>();
    const requestAccess = vi.fn(() => submitted.promise);
    render(<Harness authState={pending(12_345)} client={bridge({ requestAccess })} generation={1} />);

    const button = await screen.findByRole('button', { name: 'REQUEST ACCESS' });
    button.focus();
    const stableRegion = document.querySelector('.farcaster-access-request');
    fireEvent.click(button);

    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.getByText('SUBMITTING REQUEST')).not.toBeNull();
    expect(screen.queryByText('REQUEST SENT')).toBeNull();
    expect(document.querySelector('.farcaster-access-request')).toBe(stableRegion);
    expect(document.activeElement).toBe(stableRegion);
    expect(stableRegion?.getAttribute('aria-busy')).toBe('true');
    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'DIRECT 20 REQUESTS' }));
    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
  });

  it('suppresses 20 same-frame calls and reports one identity-free duplicate event', async () => {
    const submitted = deferred<AccessRequestStatus>();
    const requestAccess = vi.fn(() => submitted.promise);
    const reportDiagnostic = vi.fn<(event: AccessRequestDiagnosticEvent) => void>();
    let activateRequest = () => false;
    render(
      <Harness
        authState={pending(12_345)}
        captureRequestAccess={(callback) => { activateRequest = callback; }}
        client={bridge({ requestAccess })}
        generation={1}
        reportDiagnostic={reportDiagnostic}
      />
    );

    await screen.findByRole('button', { name: 'REQUEST ACCESS' });
    const accepted: boolean[] = [];
    act(() => {
      for (let index = 0; index < 20; index += 1) {
        accepted.push(activateRequest());
      }
    });

    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));
    expect(accepted).toEqual([true, ...Array.from({ length: 19 }, () => false)]);
    expect(reportDiagnostic).toHaveBeenCalledWith('request_submit_started');
    expect(reportDiagnostic).toHaveBeenCalledWith('duplicate_client_activation_suppressed');
    expect(reportDiagnostic.mock.calls.filter(
      ([event]) => event === 'duplicate_client_activation_suppressed'
    )).toHaveLength(1);
    expect(JSON.stringify(reportDiagnostic.mock.calls)).not.toContain('12345');
  });

  it.each([
    ['touch plus compatibility click', (button: HTMLButtonElement) => {
      fireEvent.touchStart(button);
      fireEvent.touchEnd(button);
      fireEvent.click(button);
    }],
    ['Enter plus click', (button: HTMLButtonElement) => {
      fireEvent.keyDown(button, { key: 'Enter', repeat: false });
      fireEvent.keyUp(button, { key: 'Enter' });
      fireEvent.click(button);
    }],
    ['repeated Space plus click', (button: HTMLButtonElement) => {
      for (let index = 0; index < 8; index += 1) {
        fireEvent.keyDown(button, { key: ' ', repeat: index > 0 });
      }
      fireEvent.keyUp(button, { key: ' ' });
      fireEvent.click(button);
    }]
  ])('accepts one operation for %s', async (_label, activate) => {
    const submitted = deferred<AccessRequestStatus>();
    const requestAccess = vi.fn(() => submitted.promise);
    render(<Harness authState={pending(12_345)} client={bridge({ requestAccess })} generation={1} />);

    const button = await screen.findByRole('button', { name: 'REQUEST ACCESS' });
    activate(button as HTMLButtonElement);
    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
  });

  it('holds a fast authoritative result for the bounded submitting interval', async () => {
    vi.useFakeTimers();
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({ requestAccess })}
        generation={1}
        minimumSubmittingMilliseconds={350}
      />
    );

    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await Promise.resolve();
    expect(screen.getByText('SUBMITTING REQUEST')).not.toBeNull();
    expect(observedKinds).toEqual([]);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(349);
    });
    expect(screen.getByText('SUBMITTING REQUEST')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(screen.getByText('REQUEST RECEIVED')).not.toBeNull();
    expect(screen.getByTestId('access-timestamp').textContent).toBe(String(REQUESTED_AT));
    expect(observedKinds).toEqual(['access-request-confirmed']);
    unsubscribe();
  });

  it('restores an existing request as a distinct terminal state without sound or mutation', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const requestAccess = vi.fn();
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({
          getAccessRequestStatus: vi.fn(async () => ({
            version: 1 as const,
            status: 'requested' as const,
            requestedAt: REQUESTED_AT
          })),
          requestAccess
        })}
        generation={1}
      />
    );

    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('already-requested'));
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.getByText('REQUEST RECEIVED')).not.toBeNull();
    expect(requestAccess).not.toHaveBeenCalled();
    expect(observedKinds).toEqual([]);
    unsubscribe();
  });

  it('reopens exactly once after a deliberate status recheck proves an owner reset', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' })
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' });
    const requestAccess = vi.fn()
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: REQUESTED_AT
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: REQUESTED_AT + 1_000
      });
    let recheckStatus = () => {};
    render(
      <Harness
        authState={pending(12_345)}
        captureRetryStatus={(callback) => { recheckStatus = callback; }}
        client={bridge({ getAccessRequestStatus, requestAccess })}
        generation={1}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));
    expect(requestAccess).toHaveBeenCalledTimes(1);

    act(() => recheckStatus());
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-available'));
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByTestId('access-timestamp').textContent)
      .toBe(String(REQUESTED_AT + 1_000)));
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(requestAccess).toHaveBeenCalledTimes(2);
  });

  it('reconciles one lost mutation response with one authoritative confirmation cue', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: REQUESTED_AT
      });
    const requestAccess = vi.fn(async () => {
      throw new Error('lost response after write');
    });
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({ getAccessRequestStatus, requestAccess })}
        generation={1}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));

    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('access-timestamp').textContent).toBe(String(REQUESTED_AT));
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(observedKinds).toEqual(['access-request-confirmed']);
    unsubscribe();
  });

  it('keeps automatic ambiguity sealed, then lets an explicit authoritative absence unlock one retry', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValue({ version: 1, status: 'not-requested' });
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous mutation');
    });
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({ getAccessRequestStatus, requestAccess })}
        generation={1}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('REQUEST STATUS UNAVAILABLE')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);

    const statusButton = screen.getByRole('button', { name: 'CHECK STATUS' });
    const stableRegion = document.querySelector('.farcaster-access-request');
    statusButton.focus();
    fireEvent.click(statusButton);
    expect(document.activeElement).toBe(stableRegion);
    await waitFor(() => expect(getAccessRequestStatus).toHaveBeenCalledTimes(3));
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText('REQUEST NOT SENT')).not.toBeNull();
    const retry = screen.getByRole('button', { name: 'TRY AGAIN' });

    fireEvent.click(retry);
    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(2));
    expect(screen.getByText('REQUEST STATUS UNAVAILABLE')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'TRY AGAIN' })).toBeNull();
    expect(observedKinds).toEqual([]);
    unsubscribe();
  });

  it('does not allow an initial status outage to become a mutation', async () => {
    const getAccessRequestStatus = vi.fn(async () => {
      throw new Error('status unavailable');
    });
    const requestAccess = vi.fn();
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({ getAccessRequestStatus, requestAccess })}
        generation={1}
      />
    );

    await waitFor(() => expect(screen.getByText('REQUEST STATUS UNAVAILABLE')).not.toBeNull());
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(requestAccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'CHECK STATUS' })).not.toBeNull();
  });

  it('reconciles authentication when an initial status read proves the host identity changed', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({
      error: {
        code: 'access_identity_changed',
        message: 'The authenticated identity changed. Refresh and try again.'
      }
    }), {
      status: 409,
      headers: { 'content-type': 'application/json' }
    }));
    const onAuthenticationIdentityChanged = vi.fn();
    const client = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch
    });

    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        onAuthenticationIdentityChanged={onAuthenticationIdentityChanged}
      />
    );

    await waitFor(() => expect(onAuthenticationIdentityChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText('REQUEST STATUS UNAVAILABLE')).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('reconciles authentication when a manual status retry proves the host identity changed', async () => {
    const json = (body: unknown, status: number) => new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' }
    });
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({
        error: {
          code: 'access_request_unavailable',
          message: 'Access requests are temporarily unavailable.'
        }
      }, 503))
      .mockResolvedValueOnce(json({
        error: {
          code: 'access_identity_changed',
          message: 'The authenticated identity changed. Refresh and try again.'
        }
      }, 409));
    const onAuthenticationIdentityChanged = vi.fn();
    const client = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch
    });

    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        onAuthenticationIdentityChanged={onAuthenticationIdentityChanged}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'CHECK STATUS' }));
    await waitFor(() => expect(onAuthenticationIdentityChanged).toHaveBeenCalledTimes(1));
    expect(screen.getByText('REQUEST STATUS UNAVAILABLE')).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('permits deliberate retry only when credential acquisition proves no mutation began', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    const loadQuickAuthToken = vi.fn()
      .mockResolvedValueOnce(quickToken('header.payload.signature'))
      .mockResolvedValueOnce(quickRejected)
      .mockResolvedValueOnce(quickToken('header.payload.signature'));
    render(
      <Harness
        authState={pending(12_345)}
        client={bridge({ requestAccess })}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('REQUEST NOT SENT')).not.toBeNull());
    expect(requestAccess).not.toHaveBeenCalled();
    expect(observedKinds).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(observedKinds).toEqual(['access-request-confirmed']);
    unsubscribe();
  });

  it('keeps submission retryable when a definitive 401 precedes forced acquisition failure', async () => {
    const json = (body: unknown, status = 200) => new Response(
      JSON.stringify(body),
      {
        status,
        headers: { 'content-type': 'application/json' }
      }
    );
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ version: 1, status: 'not-requested' }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({
        version: 1,
        status: 'requested',
        requestedAt: REQUESTED_AT
      }));
    const client = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch
    });
    const loadQuickAuthToken = vi.fn()
      .mockResolvedValueOnce(quickToken('initial.status.credential'))
      .mockResolvedValueOnce(quickToken('stale.request.credential'))
      .mockResolvedValueOnce(quickRejected)
      .mockResolvedValueOnce(quickToken('retry.request.credential'));
    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
        minimumSubmittingMilliseconds={0}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('REQUEST NOT SENT')).not.toBeNull());
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.filter(([input]) => (
      new URL(String(input)).pathname === '/v2/access/request'
    ))).toHaveLength(1);
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(3);
    expect(loadQuickAuthToken).toHaveBeenNthCalledWith(3, { force: true });

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(4);
  });

  it('keeps submission retryable after two definitive credential rejections', async () => {
    const json = (body: unknown, status = 200) => new Response(
      JSON.stringify(body),
      {
        status,
        headers: { 'content-type': 'application/json' }
      }
    );
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ version: 1, status: 'not-requested' }))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({}, 401))
      .mockResolvedValueOnce(json({
        version: 1,
        status: 'requested',
        requestedAt: REQUESTED_AT
      }));
    const client = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch
    });
    const loadQuickAuthToken = vi.fn()
      .mockResolvedValueOnce(quickToken('initial.status.credential'))
      .mockResolvedValueOnce(quickToken('stale.request.credential'))
      .mockResolvedValueOnce(quickToken('forced.request.credential'))
      .mockResolvedValueOnce(quickToken('retry.request.credential'));
    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
        minimumSubmittingMilliseconds={0}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('REQUEST NOT SENT')).not.toBeNull());
    expect(fetch.mock.calls.filter(([input]) => (
      new URL(String(input)).pathname === '/v2/access/request'
    ))).toHaveLength(2);
    expect(loadQuickAuthToken).toHaveBeenNthCalledWith(3, { force: true });

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(4);
  });

  it('permits retry after the bridge proves rate limiting happened before mutation', async () => {
    const json = (body: unknown, status = 200) => new Response(
      JSON.stringify(body),
      {
        status,
        headers: { 'content-type': 'application/json' }
      }
    );
    const fetch = vi.fn()
      .mockResolvedValueOnce(json({ version: 1, status: 'not-requested' }))
      .mockResolvedValueOnce(json({
        error: {
          code: 'rate_limited',
          message: 'Too many requests. Try again later.'
        }
      }, 429))
      .mockResolvedValueOnce(json({
        version: 1,
        status: 'requested',
        requestedAt: REQUESTED_AT
      }));
    const client = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch
    });
    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        minimumSubmittingMilliseconds={0}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('REQUEST NOT SENT')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('request-received'));
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it('invalidates an old timer and response when identity generation changes', async () => {
    vi.useFakeTimers();
    const oldSubmission = deferred<AccessRequestStatus>();
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' })
      .mockResolvedValueOnce({
        version: 1,
        status: 'requested',
        requestedAt: REQUESTED_AT + 1_000
      });
    const requestAccess = vi.fn(() => oldSubmission.promise);
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const view = render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        minimumSubmittingMilliseconds={350}
      />
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));

    view.rerender(
      <Harness
        authState={pending(67_890)}
        client={client}
        generation={2}
        minimumSubmittingMilliseconds={350}
      />
    );
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });
    expect(screen.getByTestId('access-phase').textContent).toBe('already-requested');

    oldSubmission.resolve({
      version: 1,
      status: 'requested',
      requestedAt: REQUESTED_AT
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(screen.getByTestId('access-timestamp').textContent)
      .toBe(String(REQUESTED_AT + 1_000));
  });

  it('rejects a retained callback from an older identity generation', async () => {
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    const client = bridge({ requestAccess });
    let retainedOldRequest: () => boolean = () => false;
    const view = render(
      <Harness
        authState={pending(12_345)}
        captureRequestAccess={(callback) => { retainedOldRequest = callback; }}
        client={client}
        generation={1}
      />
    );
    await screen.findByRole('button', { name: 'REQUEST ACCESS' });
    const oldRequest = retainedOldRequest;

    view.rerender(
      <Harness
        authState={pending(67_890)}
        client={client}
        generation={2}
      />
    );
    await screen.findByRole('button', { name: 'REQUEST ACCESS' });

    act(() => oldRequest());
    await Promise.resolve();
    expect(requestAccess).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'REQUEST ACCESS' })).not.toBeNull();
  });

  it('cannot invoke a mutation after Quick Auth acquisition outlives its identity generation', async () => {
    const staleToken = deferred<FarcasterQuickAuthTokenResult>();
    const loadQuickAuthToken = vi.fn()
      .mockResolvedValueOnce(quickToken('initial.status.credential'))
      .mockImplementationOnce(() => staleToken.promise)
      .mockResolvedValue(quickToken('next.generation.credential'));
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    const getAccessRequestStatus = vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    }));
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const view = render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );

    fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(loadQuickAuthToken).toHaveBeenCalledTimes(2));

    view.rerender(
      <Harness
        authState={pending(67_890)}
        client={client}
        generation={2}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );
    await screen.findByRole('button', { name: 'REQUEST ACCESS' });

    staleToken.resolve(quickToken('stale.generation.credential'));
    await act(async () => Promise.resolve());
    expect(requestAccess).not.toHaveBeenCalled();
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('does not force-acquire after a 401 invalidates the request generation', async () => {
    const rejectedBridge = createFarcasterOidcBridgeClient({
      bridgeUrl: 'https://auth.warpkeep.example',
      issuer: 'https://auth.warpkeep.example',
      audience: 'warpkeep-spacetimedb',
      fetch: vi.fn(async () => new Response(JSON.stringify({
        error: { code: 'quick_auth_invalid' }
      }), {
        status: 401,
        headers: { 'content-type': 'application/json' }
      }))
    });
    const rejectedError = await rejectedBridge.getAccessRequestStatus!(
      { mode: 'quick-auth', token: 'initial.status.credential' },
      { expectedFid: 12_345 }
    ).catch((error: unknown) => error);
    const loadQuickAuthToken = vi.fn(async () => quickToken('status.credential'));
    let firstStatus = true;
    let view!: ReturnType<typeof render>;
    const getAccessRequestStatus = vi.fn(async () => {
      if (firstStatus) {
        firstStatus = false;
        act(() => view.rerender(
          <Harness
            authState={pending(67_890)}
            client={client}
            generation={2}
            loadQuickAuthToken={loadQuickAuthToken}
          />
        ));
        throw rejectedError;
      }
      return { version: 1 as const, status: 'not-requested' as const };
    });
    const client = bridge({ getAccessRequestStatus });

    view = render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );

    await screen.findByRole('button', { name: 'REQUEST ACCESS' });
    expect(loadQuickAuthToken).toHaveBeenCalled();
    expect(loadQuickAuthToken.mock.calls).not.toContainEqual([{ force: true }]);
  });

  it.each(['success', 'ambiguous'] as const)(
    'keeps a Quick Auth credential out of React presentation, diagnostics, and storage on %s',
    async outcome => {
      const credential = 'private.quick-auth.credential.sentinel';
      const reportDiagnostic = vi.fn<(event: AccessRequestDiagnosticEvent) => void>();
      const getAccessRequestStatus = vi.fn()
        .mockResolvedValueOnce({ version: 1, status: 'not-requested' })
        .mockResolvedValue({
          version: 1 as const,
          status: 'requested' as const,
          requestedAt: REQUESTED_AT
        });
      const requestAccess = vi.fn(async () => {
        if (outcome === 'ambiguous') throw new Error('synthetic response loss');
        return {
          version: 1 as const,
          status: 'requested' as const,
          requestedAt: REQUESTED_AT
        };
      });
      const view = render(
        <Harness
          authState={pending(12_345)}
          client={bridge({ getAccessRequestStatus, requestAccess })}
          generation={1}
          loadQuickAuthToken={async () => quickToken(credential)}
          reportDiagnostic={reportDiagnostic}
        />
      );

      fireEvent.click(await screen.findByRole('button', { name: 'REQUEST ACCESS' }));
      await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
        .toBe('request-received'));

      const presentationEvidence = JSON.stringify({
        body: document.body.innerHTML,
        diagnostics: reportDiagnostic.mock.calls,
        localStorage: Object.entries(window.localStorage),
        sessionStorage: Object.entries(window.sessionStorage)
      });
      expect(presentationEvidence).not.toContain(credential);

      view.rerender(
        <Harness
          authState={anonymous}
          client={bridge()}
          generation={2}
          loadQuickAuthToken={async () => quickToken(credential)}
          reportDiagnostic={reportDiagnostic}
        />
      );
      expect(screen.getByTestId('access-phase').textContent).toBe('idle');
      expect(document.body.innerHTML).not.toContain(credential);
      expect(JSON.stringify(Object.entries(window.localStorage))).not.toContain(credential);
      expect(JSON.stringify(Object.entries(window.sessionStorage))).not.toContain(credential);
    }
  );

  it('clears presentation on sign-out and lets a genuine new auth generation load availability', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({
        version: 1,
        status: 'requested',
        requestedAt: REQUESTED_AT
      })
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' });
    const client = bridge({ getAccessRequestStatus });
    const view = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );
    await waitFor(() => expect(screen.getByTestId('access-phase').textContent)
      .toBe('already-requested'));

    view.rerender(<Harness authState={anonymous} client={client} generation={2} />);
    expect(screen.getByTestId('access-phase').textContent).toBe('idle');
    expect(document.body.textContent).not.toContain(String(REQUESTED_AT));

    view.rerender(
      <Harness authState={pending(12_345)} client={client} generation={3} />
    );
    await waitFor(() => expect(screen.getByRole('button', { name: 'REQUEST ACCESS' }))
      .not.toBeNull());
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('restores after remount from authority without an available-action flash', async () => {
    const observedKinds: string[] = [];
    const unsubscribe = subscribeWarpkeepSfx(events => {
      observedKinds.push(...events.map(event => event.kind));
    });
    const requestedStatus = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    const client = bridge({ getAccessRequestStatus: requestedStatus });
    const first = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );
    await waitFor(() => expect(screen.getByText('REQUEST RECEIVED')).not.toBeNull());
    first.unmount();

    render(<Harness authState={pending(12_345)} client={client} generation={1} />);
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.getByText('CHECKING REQUEST STATUS')).not.toBeNull();
    await waitFor(() => expect(screen.getByText('REQUEST RECEIVED')).not.toBeNull());
    expect(requestedStatus).toHaveBeenCalledTimes(2);
    expect(observedKinds).toEqual([]);
    unsubscribe();
  });

  it('lets two independent clients converge on one authoritative timestamp', async () => {
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: REQUESTED_AT
    }));
    const getAccessRequestStatus = vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    }));
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(
      <>
        <section aria-label="ordinary browser">
          <Harness authState={pending(12_345)} client={client} generation={1} />
        </section>
        <section aria-label="mini app">
          <Harness authState={pending(12_345)} client={client} generation={1} />
        </section>
      </>
    );

    const buttons = await screen.findAllByRole('button', { name: 'REQUEST ACCESS' });
    fireEvent.click(buttons[0]);
    fireEvent.click(buttons[1]);
    await waitFor(() => expect(screen.getAllByText('REQUEST RECEIVED')).toHaveLength(2));

    expect(requestAccess).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId('access-timestamp').map(node => node.textContent))
      .toEqual([String(REQUESTED_AT), String(REQUESTED_AT)]);
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
  });
});
