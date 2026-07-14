import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mockedFarcaster = vi.hoisted(() => ({
  current: undefined as unknown
}));

vi.mock('../src/farcaster/FarcasterAuthProvider', () => ({
  useFarcasterAuth: () => mockedFarcaster.current
}));

import {
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import type { WarpkeepRuntimeConfig } from '../src/spacetime/warpkeepConfig';

const CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'warpkeep-89e4u',
  bridgeUrl: 'https://auth.warpkeep.com',
  issuer: 'https://auth.warpkeep.com',
  audience: 'warpkeep-spacetimedb',
  sharedAlphaEnabled: true
});

function jwtSegment(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

function authenticatedFarcasterState(fid = 12_345) {
  const issuedAt = Math.floor(Date.now() / 1_000);
  const expiresAt = issuedAt + 300;
  const jwt = [
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
      jti: 'terms-gate-test',
      iat: issuedAt,
      nbf: issuedAt,
      exp: expiresAt,
      session_iat: issuedAt,
      session_exp: expiresAt
    }),
    'test-signature'
  ].join('.');
  return {
    state: {
      phase: 'authenticated',
      assurance: 'bridge-oidc-alpha',
      identity: {
        fid,
        username: 'warpkeeper',
        verifications: [],
        verifiedAt: Date.now()
      }
    },
    oidcSession: {
      jwt,
      issuer: CONFIG.issuer,
      audience: CONFIG.audience,
      expiresAt: expiresAt * 1_000
    }
  };
}

function BackendProbe() {
  const backend = useWarpkeepBackend();
  return (
    <>
      <output data-testid="backend-phase">{backend.state.phase}</output>
      <button type="button" onClick={backend.beginAlphaTermsAcceptance}>
        ACCEPT TEST TERMS
      </button>
      <button type="button" onClick={backend.cancelAlphaTermsAcceptance}>
        CANCEL TEST TERMS
      </button>
    </>
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Warpkeep server Terms gate', () => {
  it('cannot subscribe an authenticated browser until an explicit in-memory attempt is recorded', async () => {
    mockedFarcaster.current = authenticatedFarcasterState();
    const connection = { isDisconnectRequested: false, disconnect: vi.fn() };
    const runtime = {
      connect: vi.fn(async () => connection),
      disconnect: vi.fn(),
      readBackendInfo: vi.fn(async () => ({
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001'
      })),
      readAdmission: vi.fn(async () => 'ready'),
      bootstrapPlayer: vi.fn(),
      acceptAlphaTerms: vi.fn(async () => undefined),
      observeRealm: vi.fn(() => vi.fn()),
      readRealmSnapshot: vi.fn(() => ({ tiles: [], players: [], castles: [] })),
      subscribeRealm: vi.fn((_candidate, onApplied: () => void) => {
        onApplied();
        return { unsubscribe: vi.fn() };
      })
    } as unknown as WarpkeepBackendRuntime;

    const rendered = render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <BackendProbe />
      </WarpkeepSpacetimeProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('awaiting-terms');
    });
    expect(runtime.acceptAlphaTerms).not.toHaveBeenCalled();
    expect(runtime.observeRealm).not.toHaveBeenCalled();
    expect(runtime.subscribeRealm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TEST TERMS' }));
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('ready');
    });
    expect(runtime.acceptAlphaTerms).toHaveBeenCalledTimes(1);
    expect(runtime.observeRealm).toHaveBeenCalledTimes(1);
    expect(runtime.subscribeRealm).toHaveBeenCalledTimes(1);

    mockedFarcaster.current = authenticatedFarcasterState(54_321);
    rendered.rerender(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <BackendProbe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('awaiting-terms');
    });
    expect(runtime.acceptAlphaTerms).toHaveBeenCalledTimes(1);
    expect(runtime.subscribeRealm).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TEST TERMS' }));
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('ready');
    });
    expect(runtime.acceptAlphaTerms).toHaveBeenCalledTimes(2);
    expect(runtime.subscribeRealm).toHaveBeenCalledTimes(2);
  });

  it('does not activate a realm subscription after an in-flight Terms attempt is cancelled', async () => {
    mockedFarcaster.current = authenticatedFarcasterState();
    const connection = { isDisconnectRequested: false, disconnect: vi.fn() };
    let resolveAcceptance: (() => void) | undefined;
    const acceptance = new Promise<void>((resolve) => {
      resolveAcceptance = resolve;
    });
    const runtime = {
      connect: vi.fn(async () => connection),
      disconnect: vi.fn(),
      readBackendInfo: vi.fn(async () => ({
        protocolVersion: 3,
        worldSeed: 3_445_214_658,
        worldSeedName: 'HEGEMONY_GENESIS_001'
      })),
      readAdmission: vi.fn(async () => 'ready'),
      bootstrapPlayer: vi.fn(),
      acceptAlphaTerms: vi.fn(() => acceptance),
      observeRealm: vi.fn(() => vi.fn()),
      readRealmSnapshot: vi.fn(() => ({ tiles: [], players: [], castles: [] })),
      subscribeRealm: vi.fn((_candidate, onApplied: () => void) => {
        onApplied();
        return { unsubscribe: vi.fn() };
      })
    } as unknown as WarpkeepBackendRuntime;

    render(
      <WarpkeepSpacetimeProvider config={CONFIG} runtime={runtime}>
        <BackendProbe />
      </WarpkeepSpacetimeProvider>
    );
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('awaiting-terms');
    });

    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TEST TERMS' }));
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('accepting-terms');
    });
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL TEST TERMS' }));
    expect(screen.getByTestId('backend-phase').textContent).toBe('awaiting-terms');

    resolveAcceptance?.();
    await acceptance;
    await Promise.resolve();
    expect(runtime.observeRealm).not.toHaveBeenCalled();
    expect(runtime.subscribeRealm).not.toHaveBeenCalled();
    expect(screen.getByTestId('backend-phase').textContent).toBe('awaiting-terms');

    // A fresh intentional entry can reuse the already-recorded exact version
    // without resending the reducer or weakening the cancellation boundary.
    fireEvent.click(screen.getByRole('button', { name: 'ACCEPT TEST TERMS' }));
    await waitFor(() => {
      expect(screen.getByTestId('backend-phase').textContent).toBe('ready');
    });
    expect(runtime.acceptAlphaTerms).toHaveBeenCalledTimes(1);
    expect(runtime.subscribeRealm).toHaveBeenCalledTimes(1);
  });
});
