import { StrictMode, useCallback } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
  loadQuickAuthToken,
  actionKey = 'access-request-action'
}: Readonly<{
  authState: FarcasterAuthViewState;
  generation: number;
  client: FarcasterOidcBridgeClient;
  loadQuickAuthToken?: () => Promise<string | null>;
  actionKey?: string;
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
        key={actionKey}
        onRequestAccess={access.requestAccess}
        state={access.state}
      />
      <button
        onClick={() => {
          access.requestAccess();
          access.requestAccess();
        }}
        type="button"
      >
        DIRECT DOUBLE REQUEST
      </button>
      <button onClick={access.retryStatus} type="button">CHECK REQUEST STATUS</button>
    </div>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('access-request controller lifecycle', () => {
  it('latches the action locally before a parent state round trip', () => {
    const onRequestAccess = vi.fn();
    render(
      <FarcasterAccessRequestAction
        onRequestAccess={onRequestAccess}
        state={{ phase: 'not-requested' }}
      />
    );

    const request = screen.getByRole('button', { name: 'REQUEST ACCESS' });
    fireEvent.click(request);
    fireEvent.click(request);

    expect(onRequestAccess).toHaveBeenCalledTimes(1);
    const sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    expect(sent.dataset.warpkeepSfx).toBe('none');
    expect(sent.classList.contains(
      'farcaster-auth-panel__action--request-committed'
    )).toBe(true);
  });

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
    const getAccessRequestStatus = vi.fn(async () => {
      throw new Error('private status outage');
    });
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

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(1);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('12345');
    expect(document.body.textContent).not.toContain('private status outage');
  });

  it('keeps an ambiguous request sealed across errors and presentation remounts', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockRejectedValueOnce(new Error('private status outage'))
      .mockRejectedValueOnce(new Error('private status outage'))
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: 1_785_414_896_000
      });
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous submit outage');
    });
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const view = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('confirmation-pending')).not.toBeNull());

    let sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    fireEvent.click(sent);

    view.rerender(
      <Harness
        actionKey="remounted-access-request-action"
        authState={pending(12_345)}
        client={client}
        generation={1}
      />
    );
    sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    fireEvent.click(sent);

    fireEvent.click(screen.getByRole('button', { name: 'CHECK REQUEST STATUS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(3);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain('private status outage');
    expect(document.body.textContent).not.toContain('ambiguous submit outage');
  });

  it('does not reopen after an automatic not-requested reconciliation', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      });
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous submit outage');
    });
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('confirmation-pending')).not.toBeNull());

    const sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    fireEvent.click(sent);
    expect(requestAccess).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'CHECK REQUEST STATUS' }));
    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(3);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'REQUEST ACCESS' })).not.toBeNull();
    });
  });

  it('does not treat a pre-submit status retry as post-submit authority', async () => {
    const getAccessRequestStatus = vi.fn()
      .mockRejectedValueOnce(new Error('initial status outage'))
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      });
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous submit outage');
    });
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'CHECK REQUEST STATUS' }));
    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('confirmation-pending')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(3);
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement).disabled)
      .toBe(true);
  });

  it('collapses rapid status retries into one read-only reconciliation', async () => {
    const reconciled = deferred<AccessRequestStatus>();
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockRejectedValueOnce(new Error('automatic reconciliation outage'))
      .mockImplementationOnce(() => reconciled.promise);
    const requestAccess = vi.fn(async () => {
      throw new Error('ambiguous submit outage');
    });
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('confirmation-pending')).not.toBeNull());

    const checkStatus = screen.getByRole('button', { name: 'CHECK REQUEST STATUS' });
    fireEvent.click(checkStatus);
    fireEvent.click(checkStatus);
    await waitFor(() => expect(getAccessRequestStatus).toHaveBeenCalledTimes(3));
    expect(requestAccess).toHaveBeenCalledTimes(1);

    reconciled.resolve({
      version: 1,
      status: 'requested',
      requestedAt: 1_785_414_896_000
    });
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(3);
  });

  it('guards the controller itself against same-frame duplicate calls', async () => {
    const submitted = deferred<AccessRequestStatus>();
    const requestAccess = vi.fn(() => submitted.promise);
    const loadQuickAuthToken = vi.fn(async () => 'header.payload.signature');
    const client = bridge({ requestAccess });
    render(
      <Harness
        authState={pending(12_345)}
        client={client}
        generation={1}
        loadQuickAuthToken={loadQuickAuthToken}
      />
    );

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'DIRECT DOUBLE REQUEST' }));

    await waitFor(() => expect(requestAccess).toHaveBeenCalledTimes(1));
    expect(loadQuickAuthToken).toHaveBeenCalledTimes(2);
    expect(screen.getByText('submitting')).not.toBeNull();

    submitted.resolve({
      version: 1,
      status: 'requested',
      requestedAt: 1_785_414_896_000
    });
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(requestAccess).toHaveBeenCalledTimes(1);
  });

  it('cannot carry a committed request across sign-out into another FID', async () => {
    const oldSubmission = deferred<AccessRequestStatus>();
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: 1_785_414_897_000
      });
    const requestAccess = vi.fn(() => oldSubmission.promise);
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const view = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('submitting')).not.toBeNull());

    view.rerender(<Harness authState={anonymous} client={client} generation={2} />);
    expect(screen.getByText('idle')).not.toBeNull();
    view.rerender(
      <Harness authState={pending(67_890)} client={client} generation={3} />
    );
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    oldSubmission.resolve({
      version: 1,
      status: 'not-requested'
    });
    await Promise.resolve();
    expect(screen.getByText('requested')).not.toBeNull();
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('restores the same FID from authority after a new auth generation', async () => {
    const oldSubmission = deferred<AccessRequestStatus>();
    const getAccessRequestStatus = vi.fn()
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'not-requested' as const
      })
      .mockResolvedValueOnce({
        version: 1 as const,
        status: 'requested' as const,
        requestedAt: 1_785_414_898_000
      });
    const requestAccess = vi.fn(() => oldSubmission.promise);
    const client = bridge({ getAccessRequestStatus, requestAccess });
    const view = render(
      <Harness authState={pending(12_345)} client={client} generation={1} />
    );

    await waitFor(() => expect(screen.getByText('not-requested')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('submitting')).not.toBeNull());

    view.rerender(<Harness authState={anonymous} client={client} generation={2} />);
    view.rerender(
      <Harness authState={pending(12_345)} client={client} generation={3} />
    );
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'REQUEST RECEIVED' })).not.toBeNull();
    });

    oldSubmission.resolve({
      version: 1,
      status: 'not-requested'
    });
    await Promise.resolve();
    expect(screen.getByRole('button', { name: 'REQUEST RECEIVED' })).not.toBeNull();
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(getAccessRequestStatus).toHaveBeenCalledTimes(2);
  });

  it('uses the idempotent submit boundary after a status outage', async () => {
    const getAccessRequestStatus = vi.fn(async () => {
      throw new Error('private status outage');
    });
    const requestAccess = vi.fn(async () => ({
      version: 1 as const,
      status: 'requested' as const,
      requestedAt: 1_785_414_896_000
    }));
    const client = bridge({ getAccessRequestStatus, requestAccess });
    render(<Harness authState={pending(12_345)} client={client} generation={1} />);

    await waitFor(() => expect(screen.getByText('error')).not.toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());

    expect(getAccessRequestStatus).toHaveBeenCalledTimes(1);
    expect(requestAccess).toHaveBeenCalledTimes(1);
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
    fireEvent.click(request);

    expect(screen.getByText('submitting')).not.toBeNull();
    const sent = screen.getByRole('button', { name: 'REQUEST SENT' }) as HTMLButtonElement;
    expect(sent.disabled).toBe(true);
    expect(sent.classList.contains(
      'farcaster-auth-panel__action--request-committed'
    )).toBe(true);
    expect(sent.dataset.warpkeepSfx).toBe('none');
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
