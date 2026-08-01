import { StrictMode, useCallback } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { subscribeHegemonyAdmissionRequestSound } from '../src/components/audio/hegemonyAdmissionRequestSound';
import { FarcasterAccessRequestAction } from '../src/components/auth/FarcasterAccessRequest';
import { useAccessRequest } from '../src/farcaster/useAccessRequest';
import type {
  AccessRequestStatus,
  FarcasterAuthViewState,
  FarcasterOidcBridgeClient
} from '../src/farcaster/farcasterAuthTypes';

const pending = (fid: number): FarcasterAuthViewState => Object.freeze({
  phase: 'pending-admission',
  identity: Object.freeze({
    fid,
    verifications: [] as const,
    verifiedAt: 1_785_414_896_000
  }),
  sessionExpiresAt: 1_788_006_896_000
});

const anonymous: FarcasterAuthViewState = Object.freeze({ phase: 'anonymous' });

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return Object.freeze({ promise, resolve });
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
      requestedAt: 1_785_414_896_000
    })),
    ...overrides
  };
}

function Harness({
  authState,
  generation,
  client,
  loadQuickAuthToken
}: Readonly<{
  authState: FarcasterAuthViewState;
  generation: number;
  client: FarcasterOidcBridgeClient;
  loadQuickAuthToken?: () => Promise<string | null>;
}>) {
  const loadBridgeClient = useCallback(async () => client, [client]);
  const access = useAccessRequest({
    authState,
    authGeneration: generation,
    loadBridgeClient,
    loadQuickAuthToken
  });
  return (
    <div>
      <output>{access.state.phase}</output>
      {'requestedAt' in access.state ? <time>{access.state.requestedAt}</time> : null}
      <FarcasterAccessRequestAction
        onRequestAccess={access.requestAccess}
        state={access.state}
      />
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('access-request controller lifecycle', () => {
  it('loads once per pending FID generation and clears on phase departure', async () => {
    const getAccessRequestStatus = vi.fn(async () => ({
      version: 1 as const,
      status: 'not-requested' as const
    }));
    const client = bridge({ getAccessRequestStatus });
    const view = render(
      <StrictMode>
        <Harness authState={pending(12_345)} client={client} generation={7} />
      </StrictMode>
    );

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(1);

    view.rerender(
      <StrictMode>
        <Harness authState={pending(12_345)} client={client} generation={7} />
      </StrictMode>
    );
    await Promise.resolve();
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(1);

    view.rerender(
      <StrictMode>
        <Harness authState={pending(67_890)} client={client} generation={8} />
      </StrictMode>
    );
    await waitFor(() => expect(getAccessRequestStatus).toHaveBeenCalledTimes(2));

    view.rerender(
      <StrictMode>
        <Harness authState={anonymous} client={client} generation={9} />
      </StrictMode>
    );
    expect(screen.getByText('idle')).not.toBeNull();
  });

  it('cannot let a late response from an old identity replace the current state', async () => {
    let resolveFirst: ((value: AccessRequestStatus) => void) | undefined;
    let firstSignal: AbortSignal | undefined;
    const firstStatus = new Promise<AccessRequestStatus>((resolve) => {
      resolveFirst = resolve;
    });
    const getAccessRequestStatus = vi.fn()
      .mockImplementationOnce(async (
        _authentication,
        options: Readonly<{ signal?: AbortSignal }>
      ) => {
        firstSignal = options.signal;
        return firstStatus;
      })
      .mockResolvedValueOnce({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_897_000
      });
    const client = bridge({ getAccessRequestStatus });
    const view = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );

    await waitFor(() => expect(getAccessRequestStatus).toHaveBeenCalledTimes(1));
    view.rerender(
      <Harness authState={pending(67_890)} client={client} generation={2} />
    );
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(firstSignal?.aborted).toBe(true);

    resolveFirst?.({ version: 1, status: 'already-admitted' });
    await Promise.resolve();
    expect(screen.getByText('requested')).not.toBeNull();
    expect(screen.queryByText('already-admitted')).toBeNull();
  });

  it('submits only after an explicit click and presents only bounded status', async () => {
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: 1_785_414_896_000
    }));
    const client = bridge({ requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    expect(requestAccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1785414896000')).not.toBeNull();
    expect(document.body.textContent).not.toContain('12345');
  });

  it('submits safely after the initial status lookup is unavailable', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockRejectedValueOnce(new Error('private status outage'))
      .mockResolvedValueOnce({ version: 1 as const, status: 'not-requested' as const });
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: 1_785_414_896_000
    }));
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    expect(requestAccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('12345');
    expect(document.body.textContent).not.toContain('private status outage');
  });

  it('never submits when the required status preflight remains unavailable', async () => {
    const getAccessRequestStatus = vi.fn(async () => {
      throw new Error('private status outage');
    });
    const requestAccess = vi.fn();
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(requestAccess).not.toHaveBeenCalled();
  });

  it('restores an existing request without resubmitting after a status outage', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockRejectedValueOnce(new Error('private status outage'))
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: 1_785_414_896_000
      });
    const requestAccess = vi.fn();
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(requestAccess).not.toHaveBeenCalled();
  });

  it('reconciles an ambiguous submit once and keeps Quick Auth out of view state', async () => {
    const token = 'header.payload.signature';
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({ version: 1, status: 'not-requested' })
      .mockResolvedValueOnce({
        version: 1,
        status: 'requested',
        requestedAt: 1_785_414_896_000
      });
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous transport failure');
    });
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const loadQuickAuthToken = vi.fn(async () => token);
    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(3);
    expect(requestAccess).toHaveBeenCalledWith(
      { mode: 'quick-auth', token },
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
    expect(document.documentElement.innerHTML).not.toContain(token);
    expect(JSON.stringify(screen.getByText('requested').textContent)).not.toContain(token);
  });

  it('switches to a disabled sent state immediately and submits only once', async () => {
    const submitted = deferred<AccessRequestStatus>();
    const requestAccess = vi.fn(() => submitted.promise);
    const client = bridge({ requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    const request = screen.getByRole('button', { name: 'REQUEST ACCESS' });
    const admissionSoundTriggers: string[] = [];
    const unsubscribeSound = subscribeHegemonyAdmissionRequestSound((trigger) => {
      admissionSoundTriggers.push(trigger);
    });
    fireEvent.click(request);
    unsubscribeSound();

    expect(screen.getByText('submitting')).not.toBeNull();
    const sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    expect(sent.classList.contains(
      'farcaster-auth-panel__action--request-committed'
    )).toBe(true);
    expect(sent.dataset.warpkeepSfx).toBe('none');
    expect(admissionSoundTriggers).toEqual([
      'hegemony-empire-admission.request'
    ]);
    fireEvent.click(sent);
    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));

    submitted.resolve({
      version: 1,
      status: 'requested',
      requestedAt: 1_785_414_896_000
    });
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'REQUEST RECEIVED' }).classList.contains(
      'farcaster-auth-panel__action--request-committed'
    )).toBe(true);
  });

  it('never submits when SpacetimeDB already contains the current request', async () => {
    const requestAccess = vi.fn();
    const client = bridge({
      getAccessRequestStatus: vi.fn(async () => ({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: 1_785_414_896_000
      })),
      requestAccess
    });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    const received = screen.getByRole('button', {
      name: 'REQUEST RECEIVED'
    }) as HTMLButtonElement;
    expect(received.disabled).toBe(true);
    expect(received.classList.contains(
      'farcaster-auth-panel__action--request-committed'
    )).toBe(false);
    fireEvent.click(received);
    expect(requestAccess).not.toHaveBeenCalled();
  });
});
