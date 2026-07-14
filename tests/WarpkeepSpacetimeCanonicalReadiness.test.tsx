import { StrictMode } from 'react';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedFarcaster = vi.hoisted(() => ({ current: undefined as unknown }));

vi.mock('../src/farcaster/FarcasterAuthProvider', () => ({
  useFarcasterAuth: () => mockedFarcaster.current
}));

import {
  CANONICAL_REALM_READINESS_TIMEOUT_MILLISECONDS,
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import type { WarpkeepRealmSnapshot } from '../src/spacetime/warpkeepBackendTypes';
import type { WarpkeepRuntimeConfig } from '../src/spacetime/warpkeepConfig';
import {
  createCanonicalGenesisCandidate,
  createCanonicalGenesisSnapshot
} from './fixtures/canonicalGenesisSnapshot';

const CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'warpkeep-89e4u',
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

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('Warpkeep canonical realm readiness lifecycle', () => {
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
  });

  it('times out a subscription that never applies and leaves late callbacks inert', async () => {
    vi.useFakeTimers();
    mockedFarcaster.current = authenticatedFarcaster();
    const harness = createRuntimeHarness();
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

    act(() => {
      harness.applied()?.();
      harness.observed()?.(createCanonicalGenesisSnapshot());
      harness.subscriptionError()?.();
    });
    expect(screen.getByTestId('phase').textContent).toBe('error');
    expect(harness.runtime.readRealmSnapshot).not.toHaveBeenCalled();
  });

  it('retains only a branded same-FID snapshot while reconnecting', async () => {
    mockedFarcaster.current = authenticatedFarcaster(12_345, 1);
    const harness = createRuntimeHarness();
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
  });

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
