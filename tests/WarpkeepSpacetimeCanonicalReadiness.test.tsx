import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedFarcaster = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../src/farcaster/FarcasterAuthProvider', () => ({
  useFarcasterAuth: () => mockedFarcaster.current
}));

import {
  BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS,
  CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS,
  RESOURCE_OPERATION_TIMEOUT_MILLISECONDS,
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import type { WarpkeepRealmSnapshot } from '../src/spacetime/warpkeepBackendTypes';
import {
  DEFAULT_SPACETIMEDB_DATABASE,
  type WarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';
import {
  createCanonicalGenesisCandidate,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

const CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
  bridgeUrl: 'https://auth.warpkeep.com',
  issuer: 'https://auth.warpkeep.com',
  audience: 'warpkeep-spacetimedb',
  publicConfigValid: true,
  sharedAlphaEnabled: true
});

function jwtSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function authenticatedFarcaster(fid = 12_345, sequence = 1) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + 300;
  return {
    state: {
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha',
      identity: {
        fid,
        username: `keeper${fid}`,
        verifications: [],
        authMethod: 'authAddress',
        verifiedAt: Date.now()
      }
    },
    oidcSession: {
      jwt: [
        jwtSegment({ alg: 'ES256', typ: 'JWT' }),
        jwtSegment({
          iss: CONFIG.issuer,
          aud: CONFIG.audience,
          sub: `farcaster:${fid}`,
          fid: String(fid),
          token_type: 'spacetime-access',
          auth_version: 2,
          auth_epoch: 1,
          roles: [],
          jti: `canonical-readiness-${sequence}`,
          iat: issuedAt,
          nbf: issuedAt,
          exp: expiresAt,
          session_iat: issuedAt,
          session_exp: expiresAt
        }),
        `signature-${sequence}`
      ].join('.'),
      issuer: CONFIG.issuer,
      audience: CONFIG.audience,
      expiresAt: expiresAt * 1_000
    }
  };
}

type RuntimeHarness = ReturnType<typeof createRuntimeHarness>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function createRuntimeHarness() {
  let observed: ((snapshot: WarpkeepRealmSnapshot) => void) | undefined;
  let applied: (() => void) | undefined;
  let subscriptionError: (() => void) | undefined;
  const unsubscribe = vi.fn();
  const removeObserver = vi.fn();
  const connection = { isDisconnectRequested: false, disconnect: vi.fn() };
  const runtime = {
    connect: vi.fn(async () => connection),
    disconnect: vi.fn((candidate) => candidate?.disconnect()),
    readBackendInfo: vi.fn(async () => ({
      protocolVersion: 3,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    })),
    readAdmission: vi.fn(async () => 'ready'),
    bootstrapPlayer: vi.fn(async () => undefined),
    acceptAlphaTerms: vi.fn(async () => undefined),
    readResourceState: vi.fn(async (_connection, fid: number) => createReadyResourceState(fid)),
    collectResources: vi.fn(async (_connection, fid: number) => createReadyResourceState(fid)),
    observeRealm: vi.fn((_connection, _fid, onChange) => {
      observed = onChange;
      return removeObserver;
    }),
    readRealmSnapshot: vi.fn((_connection, fid: number) => createCanonicalGenesisSnapshot(fid)),
    subscribeRealm: vi.fn((_connection, onApplied, onError) => {
      applied = onApplied;
      subscriptionError = onError;
      return { unsubscribe };
    })
  } as unknown as WarpkeepBackendRuntime;
  return {
    connection,
    runtime,
    unsubscribe,
    removeObserver,
    applied: () => applied,
    observed: () => observed,
    subscriptionError: () => subscriptionError
  };
}

function Probe() {
  const backend = useWarpkeepBackend();
  return (
    <>
      <output data-testid="phase">{backend.state.phase}</output>
      <output data-testid="fingerprint">
        {backend.state.realm?.canonicalFingerprint ?? ''}
      </output>
      <button type="button" onClick={backend.beginAlphaTermsAcceptance}>ACCEPT TERMS</button>
    </>
  );
}

function renderProvider(harness: RuntimeHarness) {
  return render(
    <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
      <Probe />
    </WarpkeepSpacetimeProvider>
  );
}

function renderStrictProvider(harness: RuntimeHarness) {
  return render(
    <StrictMode>
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
        <Probe />
      </WarpkeepSpacetimeProvider>
    </StrictMode>
  );
}

async function beginSubscription(harness: RuntimeHarness) {
  await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
  fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
  await waitFor(() => expect(harness.runtime.subscribeRealm).toHaveBeenCalledTimes(1));
}

async function settleMicrotasks(turns = 12) {
  for (let turn = 0; turn < turns; turn += 1) {
    await Promise.resolve();
  }
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Warpkeep canonical realm readiness lifecycle', () => {
  it('fails closed when backend compatibility metadata never resolves', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    vi.mocked(harness.runtime.readBackendInfo).mockReturnValueOnce(
      new Promise<never>(() => undefined)
    );
    renderProvider(harness);

    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('connecting');
    expect(harness.runtime.readAdmission).not.toHaveBeenCalled();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS);
      await settleMicrotasks();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.runtime.readAdmission).not.toHaveBeenCalled();
  });

  it('fails closed when the initial admission read never resolves', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    vi.mocked(harness.runtime.readAdmission).mockReturnValueOnce(
      new Promise<never>(() => undefined)
    );
    renderProvider(harness);

    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('checking-admission');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS);
      await settleMicrotasks();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.runtime.bootstrapPlayer).not.toHaveBeenCalled();
  });

  it('fails closed when an admitted player bootstrap never resolves', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    vi.mocked(harness.runtime.readAdmission).mockResolvedValueOnce('admitted_needs_bootstrap');
    vi.mocked(harness.runtime.bootstrapPlayer).mockReturnValueOnce(
      new Promise<never>(() => undefined)
    );
    renderProvider(harness);

    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('bootstrapping');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS);
      await settleMicrotasks();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.runtime.readAdmission).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the post-bootstrap admission read never resolves', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    vi.mocked(harness.runtime.readAdmission)
      .mockResolvedValueOnce('admitted_needs_bootstrap')
      .mockReturnValueOnce(new Promise<never>(() => undefined));
    renderProvider(harness);

    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('bootstrapping');
    expect(harness.runtime.bootstrapPlayer).toHaveBeenCalledTimes(1);
    expect(harness.runtime.readAdmission).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS);
      await settleMicrotasks();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('fails closed when an explicit Terms acceptance never resolves', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    vi.mocked(harness.runtime.acceptAlphaTerms).mockReturnValueOnce(
      new Promise<never>(() => undefined)
    );
    renderProvider(harness);

    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms');
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await act(settleMicrotasks);
    expect(screen.getByTestId('phase').textContent).toBe('accepting-terms');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(BACKEND_STAGE_OPERATION_TIMEOUT_MILLISECONDS);
      await settleMicrotasks();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(harness.runtime.subscribeRealm).not.toHaveBeenCalled();
  });

  it('starts the expanded public subscription while the private resource read is pending', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const pendingResources = deferred<ReturnType<typeof createReadyResourceState>>();
    vi.mocked(harness.runtime.readResourceState).mockReturnValueOnce(pendingResources.promise);
    renderProvider(harness);

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await waitFor(() => expect(harness.runtime.subscribeRealm).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('phase').textContent).toBe('opening-realm');

    act(() => harness.applied()?.());
    expect(screen.getByTestId('phase').textContent).toBe('opening-realm');

    await act(async () => {
      pendingResources.resolve(createReadyResourceState(12_345));
      await pendingResources.promise;
    });
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
  });

  it('reports a bounded mandatory resource projection failure and still fails closed if logging throws', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => {
      throw new Error('controlled console failure');
    });
    vi.mocked(harness.runtime.readResourceState).mockRejectedValueOnce(
      new Error('controlled private projection failure header.payload.signature')
    );
    renderProvider(harness);

    await beginSubscription(harness);
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));

    expect(diagnostic).toHaveBeenCalledWith(
      'warpkeep_backend_activation_failed:resource_projection_failed'
    );
    expect(JSON.stringify(diagnostic.mock.calls)).not.toContain('header.payload.signature');
    expect(harness.removeObserver).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('distinguishes the mandatory resource projection deadline', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.mocked(harness.runtime.readResourceState).mockReturnValueOnce(
      new Promise<never>(() => undefined)
    );
    renderProvider(harness);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(harness.runtime.subscribeRealm).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(diagnostic).toHaveBeenCalledWith(
      'warpkeep_backend_activation_failed:resource_projection_deadline'
    );
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('distinguishes observer setup failure without starting the subscription', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.mocked(harness.runtime.observeRealm).mockImplementationOnce(() => {
      throw new Error('controlled observer setup failure');
    });
    renderProvider(harness);

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));

    expect(diagnostic).toHaveBeenCalledWith(
      'warpkeep_backend_activation_failed:observer_setup_failed'
    );
    expect(harness.runtime.subscribeRealm).not.toHaveBeenCalled();
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('distinguishes subscription setup from an installed subscription error', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const setupHarness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    vi.mocked(setupHarness.runtime.subscribeRealm).mockImplementationOnce(() => {
      throw new Error('controlled subscription setup failure');
    });
    const first = renderProvider(setupHarness);

    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('awaiting-terms'));
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(diagnostic).toHaveBeenLastCalledWith(
      'warpkeep_backend_activation_failed:subscription_setup_failed'
    );
    expect(setupHarness.removeObserver).toHaveBeenCalledTimes(1);
    first.unmount();

    mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
    const errorHarness = createRuntimeHarness();
    renderProvider(errorHarness);
    await beginSubscription(errorHarness);
    act(() => errorHarness.subscriptionError()?.());
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(diagnostic).toHaveBeenLastCalledWith(
      'warpkeep_backend_activation_failed:subscription_failed'
    );
    expect(errorHarness.removeObserver).toHaveBeenCalledTimes(1);
    expect(errorHarness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(errorHarness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('contains a pending resource deadline after a synchronous subscription failure', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const pendingResources = new Promise<never>(() => undefined);
    const unsubscribe = vi.fn();
    vi.mocked(harness.runtime.readResourceState).mockReturnValueOnce(pendingResources);
    vi.mocked(harness.runtime.subscribeRealm).mockImplementationOnce(
      (_connection, _onApplied, onError) => {
        onError();
        return { unsubscribe } as never;
      }
    );
    renderProvider(harness);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('closes a late observer handle and never subscribes after synchronous observer failure', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const pendingResources = new Promise<never>(() => undefined);
    const removeObserver = vi.fn();
    vi.mocked(harness.runtime.readResourceState).mockReturnValueOnce(pendingResources);
    vi.mocked(harness.runtime.observeRealm).mockImplementationOnce(
      (_connection, _fid, _onChange, onError) => {
        onError();
        return removeObserver;
      }
    );
    renderProvider(harness);

    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(removeObserver).toHaveBeenCalledTimes(1);
    expect(harness.runtime.subscribeRealm).not.toHaveBeenCalled();
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(RESOURCE_OPERATION_TIMEOUT_MILLISECONDS);
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
  });

  it('ignores observer snapshots until onApplied validates one complete canonical snapshot', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    renderProvider(harness);
    await beginSubscription(harness);

    expect(screen.getByTestId('phase').textContent).toBe('opening-realm');
    expect(screen.getByTestId('fingerprint').textContent).toBe('');

    act(() => harness.observed()?.(createCanonicalGenesisSnapshot()));
    expect(screen.getByTestId('phase').textContent).not.toBe('ready');
    expect(harness.runtime.readRealmSnapshot).not.toHaveBeenCalled();

    act(() => harness.applied()?.());
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));
    expect(screen.getByTestId('fingerprint').textContent).toContain('genesis-001');
    expect(harness.runtime.readRealmSnapshot).toHaveBeenCalledTimes(1);
  });

  it('fails closed when onApplied exposes an incomplete projection', async () => {
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const incomplete = createCanonicalGenesisCandidate();
    vi.mocked(harness.runtime.readRealmSnapshot).mockReturnValue({
      ...incomplete,
      tiles: incomplete.tiles.slice(0, 61)
    } as never);
    renderProvider(harness);
    await beginSubscription(harness);

    act(() => harness.applied()?.());
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(screen.getByTestId('fingerprint').textContent).toBe('');
    expect(harness.removeObserver).toHaveBeenCalledTimes(1);
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith(
      'warpkeep_backend_activation_failed:canonical_snapshot_invalid'
    );
  });

  it('times out a subscription that never applies and leaves late callbacks inert', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
    const diagnostic = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    renderProvider(harness);
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TERMS' }));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(harness.runtime.subscribeRealm).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS);
      await Promise.resolve();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.unsubscribe).toHaveBeenCalledTimes(1);
    expect(harness.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(diagnostic).toHaveBeenCalledWith(
      'warpkeep_backend_activation_failed:canonical_readiness_timeout'
    );

    act(() => {
      harness.applied()?.();
      harness.observed()?.(createCanonicalGenesisSnapshot());
      harness.subscriptionError()?.();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.runtime.readRealmSnapshot).not.toHaveBeenCalled();
    expect(diagnostic).toHaveBeenCalledTimes(1);
  });

  it.each([2, 3] as const)(
    'retains only a branded same-FID generation-%i snapshot while reconnecting',
    async (generationVersion) => {
      mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
      const harness = createRuntimeHarness();
      vi.mocked(harness.runtime.readRealmSnapshot).mockReturnValue(
        createCanonicalGenesisSnapshot({ ownFid: 12_345, generationVersion })
      );
      const rendered = renderProvider(harness);
      await beginSubscription(harness);
      act(() => harness.applied()?.());
      await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('ready'));

      const pendingReconnect = new Promise<never>(() => undefined);
      vi.mocked(harness.runtime.connect).mockImplementationOnce(() => pendingReconnect);
      mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
      rendered.rerender(
        <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
          <Probe />
        </WarpkeepSpacetimeProvider>
      );
      await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('reconnecting'));
      expect(screen.getByTestId('fingerprint').textContent).toContain('genesis-001');

      vi.mocked(harness.runtime.connect).mockImplementationOnce(() => pendingReconnect);
      mockedFarcaster.current = authenticatedFarcaster(54_321, 3);
      rendered.rerender(
        <WarpkeepSpacetimeProvider config={CONFIG} runtime={harness.runtime}>
          <Probe />
        </WarpkeepSpacetimeProvider>
      );
      await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('connecting'));
      expect(screen.getByTestId('fingerprint').textContent).toBe('');
    }
  );

  it('never publishes a 61-cell snapshot across hidden pageshow and StrictMode remounts', async () => {
    let hidden = true;
    vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
    mockedFarcaster.current = authenticatedFarcaster();

    const incompleteSnapshot = () => {
      const candidate = createCanonicalGenesisCandidate();
      return { ...candidate, tiles: candidate.tiles.slice(0, 61) } as never;
    };
    const firstHarness = createRuntimeHarness();
    vi.mocked(firstHarness.runtime.readRealmSnapshot).mockReturnValue(incompleteSnapshot());
    const first = renderStrictProvider(firstHarness);
    await beginSubscription(firstHarness);

    act(() => {
      fireEvent(document, new Event('visibilitychange'));
      fireEvent(window, new Event('pageshow'));
      firstHarness.applied()?.();
    });
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(screen.getByTestId('fingerprint').textContent).toBe('');
    first.unmount();

    hidden = false;
    mockedFarcaster.current = authenticatedFarcaster(12_345, 2);
    const secondHarness = createRuntimeHarness();
    vi.mocked(secondHarness.runtime.readRealmSnapshot).mockReturnValue(incompleteSnapshot());
    renderStrictProvider(secondHarness);
    await beginSubscription(secondHarness);

    act(() => {
      fireEvent(window, new Event('pageshow'));
      fireEvent(document, new Event('visibilitychange'));
      secondHarness.applied()?.();
    });
    await waitFor(() => expect(screen.getByTestId('phase').textContent).toBe('error'));
    expect(screen.getByTestId('fingerprint').textContent).toBe('');
    expect(secondHarness.runtime.readRealmSnapshot).toHaveBeenCalledTimes(1);
  });
});
