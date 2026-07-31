import { StrictMode, useCallback } from 'react';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

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
      <button onClick={access.requestAccess} type="button">request</button>
      <button onClick={access.retryStatus} type="button">retry status</button>
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
    fireEvent.click(screen.getByRole('button', { name: 'request' }));
    await waitFor(() => expect(screen.getByText('requested')).not.toBeNull());
    expect(requestAccess).toHaveBeenCalledTimes(1);
    expect(screen.getByText('1785414896000')).not.toBeNull();
    expect(document.body.textContent).not.toContain('12345');
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
    fireEvent.click(screen.getByRole('button', { name: 'request' }));
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
});
