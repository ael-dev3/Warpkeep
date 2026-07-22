import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen,
  within
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepExperience } from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';
import {
  getFarcasterDeviceSessionControlKey,
  getFarcasterDeviceSessionStorageKey,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type {
  FarcasterBridgeAuthorizedSession,
  FarcasterBridgeChallenge,
  FarcasterBridgePendingAdmissionSession,
  FarcasterBridgeSessionResponse,
  FarcasterOidcBridgeClient,
  FarcasterOidcSession,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';
import {
  WarpkeepSpacetimeProvider,
  useWarpkeepBackend,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import type { WarpkeepConnection } from '../src/spacetime/warpkeepConnection';
import type {
  WarpkeepAdmissionStatus,
  WarpkeepRealmSnapshot
} from '../src/spacetime/warpkeepBackendTypes';
import {
  DEFAULT_SPACETIMEDB_DATABASE,
  WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE,
  type WarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';
import { createCanonicalGenesisSnapshot } from './fixtures/canonicalGenesisSnapshot';
import { createReadyResourceState } from './fixtures/resourceState';

const TEST_NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const TEST_ISSUER = 'https://auth.warpkeep.com';
const TEST_AUDIENCE = 'warpkeep-spacetimedb';
const TEST_BINDING_VERIFIER = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
const TEST_BINDING_CHALLENGE = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';
const TEST_CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: DEFAULT_SPACETIMEDB_DATABASE,
  bridgeUrl: TEST_ISSUER,
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  publicConfigValid: true,
  sharedAlphaEnabled: true
});

type Deferred<T> = Readonly<{
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
}>;

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const VERIFIED_IDENTITY: VerifiedFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'warpkeeper',
  displayName: 'Warp Keeper',
  verifications: Object.freeze([]),
  authMethod: 'authAddress',
  verifiedAt: TEST_NOW - 10_000
});

const SHARED_REALM: WarpkeepRealmSnapshot = createCanonicalGenesisSnapshot({
  ownFid: VERIFIED_IDENTITY.fid,
  peerFid: 77
});

class TestDeviceStorage implements FarcasterDeviceSessionStorage {
  private readonly values = new Map<string, string>();

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

function createDeviceSessionEnvironment(
  storage: FarcasterDeviceSessionStorage,
  now = TEST_NOW
): FarcasterDeviceSessionEnvironment {
  return {
    storage,
    origin: window.location.origin,
    basePath: '/',
    now: () => now
  };
}

function encodeJwtSegment(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join('');
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function createOidcSession(
  fid = VERIFIED_IDENTITY.fid,
  now = TEST_NOW,
  accessTtlMs = 5 * 60 * 1_000
): FarcasterOidcSession {
  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = now + accessTtlMs;
  const jwt = `${encodeJwtSegment({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encodeJwtSegment({
    iss: TEST_ISSUER,
    sub: `farcaster:${fid}`,
    aud: [TEST_AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(fid),
    auth_version: 2,
    auth_epoch: 1,
    roles: [],
    iat: issuedAt,
    nbf: issuedAt,
    exp: Math.floor(expiresAt / 1_000),
    session_iat: issuedAt,
    session_exp: Math.floor(expiresAt / 1_000),
    jti: `test-${fid}-${issuedAt}`
  })}.test_signature`;
  return Object.freeze({ jwt, issuer: TEST_ISSUER, audience: TEST_AUDIENCE, expiresAt });
}

function createAuthorizedResponse(
  fid = VERIFIED_IDENTITY.fid,
  now = TEST_NOW,
  accessTtlMs = 5 * 60 * 1_000
): FarcasterBridgeAuthorizedSession {
  const session = createOidcSession(fid, now, accessTtlMs);
  return Object.freeze({
    version: 2,
    status: 'authorized',
    identity: Object.freeze({ fid }),
    sessionExpiresAt: now + 30 * 24 * 60 * 60 * 1_000,
    accessToken: session.jwt,
    tokenType: 'spacetime-access',
    accessExpiresAt: session.expiresAt
  });
}

function createPendingAdmissionResponse(
  fid = VERIFIED_IDENTITY.fid,
  now = TEST_NOW
): FarcasterBridgePendingAdmissionSession {
  return Object.freeze({
    version: 2,
    status: 'pending-admission',
    identity: Object.freeze({ fid }),
    sessionExpiresAt: now + 30 * 24 * 60 * 60 * 1_000
  });
}

function createTestAuthority(now: () => number) {
  let activeChannel: FarcasterSignInChannel | undefined;
  return {
    beginSignIn: vi.fn(async (context, challenge?: FarcasterBridgeChallenge) => {
      const createdAt = challenge?.createdAt ?? now();
      activeChannel = {
        channelToken: 'PRIVATE_TEST_CHANNEL_TOKEN_123456',
        url: 'farcaster://connect?channelToken=PRIVATE_TEST_CHANNEL_TOKEN_123456',
        nonce: challenge?.nonce ?? 'TestNonce1234567890',
        requestId: challenge?.requestId ?? 'test-request-id',
        domain: context?.domain ?? 'localhost',
        siweUri: context?.siweUri ?? 'http://localhost/',
        createdAt,
        expiresAt: challenge?.expiresAt ?? createdAt + 300_000
      };
      return activeChannel;
    }),
    getStatus: vi.fn(async () => {
      if (!activeChannel) throw new Error('No active test channel');
      return {
        state: 'completed' as const,
        nonce: activeChannel.nonce,
        message: 'PRIVATE_TEST_MESSAGE',
        signature: `0x${'ab'.repeat(65)}` as const,
        fid: VERIFIED_IDENTITY.fid,
        signatureParams: {
          siweUri: activeChannel.siweUri,
          domain: activeChannel.domain,
          nonce: activeChannel.nonce,
          expirationTime: new Date(activeChannel.expiresAt).toISOString(),
          requestId: activeChannel.requestId
        },
        acceptAuthAddress: true as const,
        username: VERIFIED_IDENTITY.username,
        displayName: VERIFIED_IDENTITY.displayName,
        verifications: [],
        authMethod: 'authAddress' as const
      };
    }),
    verifyCompletedRequest: vi.fn(async () => VERIFIED_IDENTITY)
  } satisfies FarcasterSessionAuthority;
}

function createBridge(
  exchangeResponse: FarcasterBridgeSessionResponse,
  now: () => number,
  refreshResponse?: FarcasterBridgeSessionResponse
) {
  return {
    issuer: TEST_ISSUER,
    audience: TEST_AUDIENCE,
    createChallenge: vi.fn(async () => {
      const createdAt = now();
      return {
        nonce: 'ab'.repeat(24),
        requestId: 'bridge-request-1234',
        createdAt,
        expiresAt: createdAt + 300_000
      };
    }),
    exchangeCompletedSignIn: vi.fn(async () => exchangeResponse),
    refreshSession: vi.fn(async () => {
      if (!refreshResponse) throw new Error('No active cookie session');
      return refreshResponse;
    }),
    logoutSession: vi.fn(async () => undefined)
  } satisfies FarcasterOidcBridgeClient;
}

function createBackendRuntime(
  admissionSequence: readonly WarpkeepAdmissionStatus[] = ['ready'],
  realm: WarpkeepRealmSnapshot = SHARED_REALM,
  backendInfo: unknown = {
    protocolVersion: 3,
    worldSeed: 3_445_214_658,
    worldSeedName: 'HEGEMONY_GENESIS_001'
  }
) {
  const connection = {
    isDisconnectRequested: false,
    disconnect: vi.fn()
  };
  let admissionIndex = 0;
  const unsubscribe = vi.fn();
  const runtime = {
    connect: vi.fn(async () => connection),
    disconnect: vi.fn((candidate) => {
      candidate?.disconnect();
    }),
    readBackendInfo: vi.fn(async () => backendInfo),
    readAdmission: vi.fn(async () => admissionSequence[Math.min(
      admissionIndex++,
      admissionSequence.length - 1
    )]!),
    bootstrapPlayer: vi.fn(async () => undefined),
    acceptAlphaTerms: vi.fn(async () => undefined),
    readResourceState: vi.fn(async (_candidate, fid: number) => (
      createReadyResourceState(fid)
    )),
    collectResources: vi.fn(async (_candidate, fid: number) => (
      createReadyResourceState(fid, 1n)
    )),
    observeRealm: vi.fn(() => vi.fn()),
    readRealmSnapshot: vi.fn(() => realm),
    subscribeRealm: vi.fn((_candidate, onApplied: () => void) => {
      onApplied();
      return { unsubscribe };
    })
  } as unknown as WarpkeepBackendRuntime;
  return { runtime, connection, unsubscribe };
}

type RenderExperienceOptions = {
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
  now?: () => number;
  runtime?: WarpkeepBackendRuntime;
  bridge?: FarcasterOidcBridgeClient;
  config?: WarpkeepRuntimeConfig;
  exposeBackendDisconnect?: boolean;
};

function BackendDisconnectProbe() {
  const backend = useWarpkeepBackend();
  return (
    <>
      <button type="button" onClick={backend.disconnect}>
        TEST BACKEND DISCONNECT
      </button>
      <output data-testid="backend-own-keep">
        {backend.state.realm?.ownCastle?.name ?? ''}
      </output>
    </>
  );
}

function renderExperience({
  deviceSessionEnvironment,
  now = () => TEST_NOW,
  runtime = createBackendRuntime().runtime,
  bridge = createBridge(createAuthorizedResponse(VERIFIED_IDENTITY.fid, now()), now),
  config = TEST_CONFIG,
  exposeBackendDisconnect = false
}: RenderExperienceOptions = {}) {
  const authority = createTestAuthority(now);
  const createBrowserBinding = vi.fn(async () => ({
    verifier: TEST_BINDING_VERIFIER,
    challenge: TEST_BINDING_CHALLENGE,
    method: 'S256' as const
  }));
  const encodeQrCode = vi.fn(async () => 'data:image/svg+xml,TEST_QR');
  const rendered = testingLibraryRender(
    <FarcasterAuthProvider
      createBrowserBinding={createBrowserBinding}
      deviceSessionEnvironment={deviceSessionEnvironment}
      encodeQrCode={encodeQrCode}
      loadAuthority={async () => authority}
      loadBridgeClient={async () => bridge}
      now={now}
      pollIntervalMs={1}
    >
      <WarpkeepSpacetimeProvider config={config} runtime={runtime}>
        {exposeBackendDisconnect ? <BackendDisconnectProbe /> : null}
        <WarpkeepExperience />
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProvider>
  );
  return { ...rendered, authority, bridge, createBrowserBinding, encodeQrCode };
}

async function settle() {
  await act(async () => {
    for (let round = 0; round < 16; round += 1) {
      await Promise.resolve();
    }
  });
}

async function acceptAlphaParticipationTerms() {
  const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
  const terms = within(dialog);
  const checkbox = terms.getByRole('checkbox', {
    name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
  });
  const continueButton = terms.getByRole('button', {
    name: /CONTINUE TO (?:SIGN-IN|ACCESS CHECK|REALM)/
  });

  expect((continueButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(checkbox);
  expect((continueButton as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(continueButton);
  await settle();
}

function expectPlayerRealmChrome() {
  expect(screen.getByRole('main', { name: 'Hegemony realm' })).not.toBeNull();
  expect(screen.getByRole('button', {
    name: /Open Realm menu/i
  })).not.toBeNull();
  expect(screen.getByRole('region', { name: 'Your resources' })).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Return to Menu' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Recenter Keep' })).toBeNull();
  expect(screen.queryByText(/LEVEL 2/i)).toBeNull();
}

function expectPlayerRealmChromeAbsent() {
  expect(screen.queryByRole('button', { name: /Open Realm menu/i })).toBeNull();
}

function returnToMainMenuThroughPlayerProfile() {
  fireEvent.click(screen.getByRole('button', {
    name: /Open Realm menu/i
  }));
  const menu = screen.getByRole('dialog', { name: 'REALM MENU' });
  fireEvent.click(within(menu).getByRole('button', { name: /MAIN MENU/i }));
}

function installBrowserStubs() {
  vi.stubGlobal('matchMedia', vi.fn(() => ({
    matches: false,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
}

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  await Promise.all([
    import('../src/components/auth/FarcasterIdentityBadge'),
    import('../src/components/auth/FarcasterQrAuthPanel'),
    import('../src/components/title/WarpkeepTitleScreen3D'),
    import('../src/components/realm/RealmMapScreen')
  ]);
  vi.useFakeTimers({ now: TEST_NOW });
  window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
  installBrowserStubs();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep shared realm admission', () => {
  it('exchanges Farcaster proof with the bridge, then uses the server castle instead of local keep authority', async () => {
    const backend = createBackendRuntime();
    const {
      container,
      authority,
      bridge,
      createBrowserBinding,
      encodeQrCode
    } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(backend.runtime.readResourceState).not.toHaveBeenCalled();
    expect(backend.runtime.subscribeRealm).not.toHaveBeenCalled();

    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(bridge.createChallenge).toHaveBeenCalledTimes(1);
    expect(createBrowserBinding).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(authority.verifyCompletedRequest).toHaveBeenCalledTimes(1);
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    expect(encodeQrCode).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    expect(backend.runtime.acceptAlphaTerms).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readResourceState).toHaveBeenCalledTimes(1);
    expect(backend.runtime.subscribeRealm).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_CHANNEL_TOKEN_123456');
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_MESSAGE');

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expectPlayerRealmChrome();
  });

  it('cancels the terms gate without creating any authentication or backend side effect', async () => {
    const backend = createBackendRuntime();
    const {
      authority,
      bridge,
      createBrowserBinding,
      encodeQrCode
    } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'CANCEL' }));
    await settle();

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(backend.runtime.acceptAlphaTerms).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const freshDialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(freshDialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((within(freshDialog).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('Escape clears a checked acceptance without beginning the entry attempt', async () => {
    const backend = createBackendRuntime();
    const { authority, bridge, encodeQrCode } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const freshDialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(freshDialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('browser Back clears checked acceptance without starting auth or backend work', async () => {
    const backend = createBackendRuntime();
    const {
      authority,
      bridge,
      createBrowserBinding,
      encodeQrCode
    } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    fireEvent.click(within(dialog).getByRole('checkbox'));

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settle();

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const freshDialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(freshDialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('does not persist or reuse checked terms across storage activity and remount', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    const bridge = createBridge(createAuthorizedResponse(), environment.now!);
    const backend = createBackendRuntime();
    const first = renderExperience({
      bridge,
      deviceSessionEnvironment: environment,
      now: environment.now,
      runtime: backend.runtime
    });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent(window, new StorageEvent('storage', {
      key: getFarcasterDeviceSessionControlKey('/'),
      newValue: JSON.stringify({ kind: 'session-terminated', at: TEST_NOW })
    }));
    await settle();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(first.authority.beginSignIn).not.toHaveBeenCalled();
    expect(first.encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();

    first.unmount();
    await settle();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();

    const second = renderExperience({
      bridge,
      deviceSessionEnvironment: environment,
      now: environment.now,
      runtime: backend.runtime
    });
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    const freshDialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(freshDialog).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((within(freshDialog).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(second.authority.beginSignIn).not.toHaveBeenCalled();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(backend.runtime.acceptAlphaTerms).not.toHaveBeenCalled();
  });

  it('records explicit Terms only after bootstrap and before shared-state subscription', async () => {
    const backend = createBackendRuntime(['admitted_needs_bootstrap', 'ready']);
    const order: string[] = [];
    vi.mocked(backend.runtime.bootstrapPlayer).mockImplementation(async () => {
      order.push('bootstrap');
    });
    vi.mocked(backend.runtime.acceptAlphaTerms).mockImplementation(async () => {
      order.push('terms');
    });
    vi.mocked(backend.runtime.readResourceState).mockImplementation(async (_connection, fid) => {
      order.push('resources');
      return createReadyResourceState(fid);
    });
    vi.mocked(backend.runtime.subscribeRealm).mockImplementation((_connection, onApplied) => {
      order.push('subscribe');
      onApplied();
      return { unsubscribe: vi.fn() } as never;
    });
    renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(order).toEqual(['bootstrap', 'terms', 'resources', 'subscribe']);
    expect(backend.runtime.acceptAlphaTerms).toHaveBeenCalledWith(backend.connection);
  });

  it('fails closed when explicit Terms acknowledgement cannot be recorded', async () => {
    const backend = createBackendRuntime(['ready']);
    vi.mocked(backend.runtime.acceptAlphaTerms)
      .mockRejectedValueOnce(new Error('controlled terms failure'));
    renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(backend.runtime.subscribeRealm).not.toHaveBeenCalled();
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).not.toBeNull();
  });

  it('waits for explicit terms acceptance before restoring a valid cookie session on mount or focus', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    const refreshedSession = createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW);
    const bridge = createBridge(
      createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW),
      environment.now!,
      refreshedSession
    );
    const backend = createBackendRuntime();
    const { authority, createBrowserBinding, encodeQrCode } = renderExperience({
      bridge,
      deviceSessionEnvironment: environment,
      now: environment.now,
      runtime: backend.runtime
    });

    await settle();
    fireEvent.focus(window);
    fireEvent(window, new Event('pageshow'));
    await settle();

    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();

    await acceptAlphaParticipationTerms();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    expectPlayerRealmChrome();
    expect(window.location.hash).toBe('#realm');
  });

  it('disconnects Spacetime exactly when an access token expires while refresh is still pending', async () => {
    const initial = createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW, 40_000);
    let resolveRefresh!: (value: FarcasterBridgeSessionResponse) => void;
    const pendingRefresh = new Promise<FarcasterBridgeSessionResponse>((resolve) => {
      resolveRefresh = resolve;
    });
    const bridge = createBridge(initial, Date.now);
    vi.mocked(bridge.refreshSession)
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(() => pendingRefresh);
    const backend = createBackendRuntime();
    renderExperience({ bridge, now: Date.now, runtime: backend.runtime });
    await settle();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    const disconnectCallsAtStart = vi.mocked(backend.runtime.disconnect).mock.calls.length;
    expect(backend.connection.disconnect).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(10_000));
    await settle();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(backend.runtime.disconnect).toHaveBeenCalledTimes(disconnectCallsAtStart);
    expect(backend.connection.disconnect).not.toHaveBeenCalled();

    await act(async () => vi.advanceTimersByTime(30_000));
    await settle();
    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(vi.mocked(backend.runtime.disconnect).mock.calls.slice(disconnectCallsAtStart))
      .toContainEqual([backend.connection]);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);

    resolveRefresh(createAuthorizedResponse(VERIFIED_IDENTITY.fid, Date.now()));
    await settle();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('keeps the same-FID realm route while withholding private state during token reconnect', async () => {
    const initial = createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW, 40_000);
    const bridge = createBridge(initial, Date.now);
    vi.mocked(bridge.refreshSession)
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(async () => createAuthorizedResponse(
        VERIFIED_IDENTITY.fid,
        Date.now()
      ));
    const backend = createBackendRuntime();
    const reconnect = deferred<WarpkeepConnection>();
    const reconnectConnection = {
      isDisconnectRequested: false,
      disconnect: vi.fn()
    } as unknown as WarpkeepConnection;
    vi.mocked(backend.runtime.connect)
      .mockReset()
      .mockResolvedValueOnce(backend.connection as unknown as WarpkeepConnection)
      .mockImplementationOnce(() => reconnect.promise);
    const { container } = renderExperience({ bridge, now: Date.now, runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');

    await act(async () => vi.advanceTimersByTime(10_000));
    await settle();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(2);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('main', { name: 'Hegemony realm' })).not.toBeNull();
    expect(screen.getByRole('button', { name: /Open Realm menu/i })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Your resources' })).toBeNull();
    expect(backend.runtime.readResourceState).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /Open Realm menu/i }));
    const reconnectingMenu = screen.getByRole('dialog', { name: 'REALM MENU' });
    expect(within(reconnectingMenu).queryByRole('button', { name: /COLLECT YIELD/i })).toBeNull();
    expect(backend.runtime.collectResources).not.toHaveBeenCalled();
    fireEvent.click(within(reconnectingMenu).getByRole('button', { name: 'Close Realm menu' }));

    await act(async () => reconnect.resolve(reconnectConnection));
    await settle();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(backend.runtime.readResourceState).toHaveBeenCalledTimes(2);
    expect(backend.runtime.readResourceState).toHaveBeenLastCalledWith(
      reconnectConnection,
      VERIFIED_IDENTITY.fid
    );
    expectPlayerRealmChrome();
    expect(screen.getByRole('region', { name: 'Your resources' })).not.toBeNull();
    expect(reconnectConnection.disconnect).not.toHaveBeenCalled();
  });

  it('leaves the realm when a same-FID token reconnect definitively fails', async () => {
    const initial = createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW, 40_000);
    const bridge = createBridge(initial, Date.now);
    vi.mocked(bridge.refreshSession)
      .mockReset()
      .mockResolvedValueOnce(initial)
      .mockImplementationOnce(async () => createAuthorizedResponse(
        VERIFIED_IDENTITY.fid,
        Date.now()
      ));
    const backend = createBackendRuntime();
    const reconnect = deferred<WarpkeepConnection>();
    vi.mocked(backend.runtime.connect)
      .mockReset()
      .mockResolvedValueOnce(backend.connection as unknown as WarpkeepConnection)
      .mockImplementationOnce(() => reconnect.promise);
    const { container } = renderExperience({ bridge, now: Date.now, runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    await act(async () => vi.advanceTimersByTime(10_000));
    await settle();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');

    await act(async () => reconnect.reject(new Error('controlled reconnect failure')));
    await settle();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expectPlayerRealmChromeAbsent();
  });

  it('never opens a Spacetime connection for a v2 pending-admission cookie session', async () => {
    const pendingSession = createPendingAdmissionResponse();
    const bridge = createBridge(
      createAuthorizedResponse(),
      () => TEST_NOW,
      pendingSession
    );
    const backend = createBackendRuntime();

    const { authority } = renderExperience({ bridge, runtime: backend.runtime });
    await settle();

    expect(bridge.refreshSession).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    await acceptAlphaParticipationTerms();

    expect(bridge.refreshSession).toHaveBeenCalledTimes(1);
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText(
      'Your Farcaster identity is verified. Admission to the Hegemony frontier is still pending.'
    )).not.toBeNull();
  });

  it('purges a legacy identity record and normalizes direct #realm without beginning authentication', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    storage.setItem('warpkeep:/:farcaster-device-session:v1', JSON.stringify({
      version: 1,
      kind: 'remembered-device-prototype',
      origin: window.location.origin,
      basePath: '/',
      identity: { fid: VERIFIED_IDENTITY.fid },
      verifiedAt: TEST_NOW - 1_000,
      rememberedAt: TEST_NOW - 1_000,
      expiresAt: TEST_NOW + 60_000
    }));
    window.history.replaceState({}, '', '/#realm');
    const backend = createBackendRuntime();
    const { authority, bridge, createBrowserBinding, encodeQrCode } = renderExperience({
      deviceSessionEnvironment: environment,
      runtime: backend.runtime
    });

    await settle();
    expect(storage.getItem('warpkeep:/:farcaster-device-session:v1')).toBeNull();
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expectPlayerRealmChromeAbsent();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
  });

  it('normalizes direct #realm with a valid cookie fixture and still requires explicit entry consent', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    const bridge = createBridge(
      createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW),
      environment.now!,
      createAuthorizedResponse(VERIFIED_IDENTITY.fid, TEST_NOW)
    );
    const backend = createBackendRuntime();
    window.history.replaceState({}, '', '/#realm');

    const { authority, createBrowserBinding, encodeQrCode } = renderExperience({
      bridge,
      deviceSessionEnvironment: environment,
      now: environment.now,
      runtime: backend.runtime
    });
    await settle();

    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
  });

  it('gates denied Check Again, reuses the bridge session, and gates the later realm entry', async () => {
    const backend = createBackendRuntime(['not_admitted', 'ready']);
    const { authority, bridge, container } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(screen.getByText('This Farcaster identity is not yet admitted to the Hegemony frontier.')).not.toBeNull();
    expectPlayerRealmChromeAbsent();
    const requestAccess = screen.getByRole('link', {
      name: 'Open @0xael.eth on Farcaster to request Warpkeep access'
    });
    expect(requestAccess).toHaveProperty('href', 'https://farcaster.xyz/0xael.eth');

    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @warpkeeper'
    }));
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    await acceptAlphaParticipationTerms();
    await settle();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    await acceptAlphaParticipationTerms();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
  });

  it('clears a failed accepted entry intent before a later admission check becomes ready', async () => {
    const backend = createBackendRuntime(['not_admitted', 'not_admitted', 'ready']);
    const { container } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(screen.getByText(
      'This Farcaster identity is not yet admitted to the Hegemony frontier.'
    )).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);
    expect(screen.getByText(
      'This Farcaster identity is not yet admitted to the Hegemony frontier.'
    )).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @warpkeeper'
    }));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    await acceptAlphaParticipationTerms();
    await settle();

    expect(backend.runtime.connect).toHaveBeenCalledTimes(3);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    await acceptAlphaParticipationTerms();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
  });

  it('clears an authenticated entry intent when its in-flight admission rail is dismissed', async () => {
    let resolveAdmission!: (status: WarpkeepAdmissionStatus) => void;
    const pendingAdmission = new Promise<WarpkeepAdmissionStatus>((resolve) => {
      resolveAdmission = resolve;
    });
    const backend = createBackendRuntime(['not_admitted']);
    vi.mocked(backend.runtime.readAdmission)
      .mockResolvedValueOnce('not_admitted')
      .mockImplementationOnce(() => pendingAdmission);
    const { container } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(screen.getByText(
      'This Farcaster identity is not yet admitted to the Hegemony frontier.'
    )).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(document, { key: 'Escape' });
    await settle();
    await act(async () => resolveAdmission('ready'));
    await settle();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expectPlayerRealmChromeAbsent();
  });

  it('does not connect anonymous title/menu visitors and sign-out tears down backend state', async () => {
    const backend = createBackendRuntime(['not_admitted']);
    const { authority } = renderExperience({ runtime: backend.runtime });
    expect(backend.runtime.connect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(screen.getByText('This Farcaster identity is not yet admitted to the Hegemony frontier.')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    await settle();
    expect(backend.runtime.disconnect).toHaveBeenCalled();
    expect(screen.queryByText('This Farcaster identity is not yet admitted to the Hegemony frontier.')).toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(getFarcasterDeviceSessionStorageKey('/')!)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(2);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('standalone backend disconnect tears down the connected realm once and leaves late callbacks inert', async () => {
    const backend = createBackendRuntime();
    const removeObserver = vi.fn();
    const unsubscribe = vi.fn();
    let reportDisconnected: (() => void) | undefined;
    let reportObservedRealm: ((snapshot: WarpkeepRealmSnapshot) => void) | undefined;
    let reportSubscriptionApplied: (() => void) | undefined;
    let reportSubscriptionError: (() => void) | undefined;

    vi.mocked(backend.runtime.connect).mockImplementation(async (
      _config,
      _jwt,
      callbacks
    ) => {
      reportDisconnected = callbacks?.onDisconnected;
      return backend.connection as never;
    });
    vi.mocked(backend.runtime.observeRealm).mockImplementation((
      _connection,
      _fid,
      onChange
    ) => {
      reportObservedRealm = onChange;
      return removeObserver;
    });
    vi.mocked(backend.runtime.subscribeRealm).mockImplementation((
      _connection,
      onApplied,
      onError
    ) => {
      reportSubscriptionApplied = onApplied;
      reportSubscriptionError = onError;
      onApplied();
      return { unsubscribe } as never;
    });

    const { bridge } = renderExperience({
      runtime: backend.runtime,
      exposeBackendDisconnect: true
    });
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(backend.runtime.subscribeRealm).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readRealmSnapshot).toHaveBeenCalledTimes(1);
    expect(backend.runtime.disconnect).not.toHaveBeenCalled();

    const observedRealm: WarpkeepRealmSnapshot = {
      ...SHARED_REALM,
      castles: SHARED_REALM.castles.map((castle) => (
        castle.ownerFid === VERIFIED_IDENTITY.fid
          ? { ...castle, name: 'Observed Bastion' }
          : castle
      )),
      ownCastle: { ...SHARED_REALM.ownCastle!, name: 'Observed Bastion' }
    };
    act(() => reportObservedRealm?.(observedRealm));
    await settle();
    expect(screen.getByTestId('backend-own-keep').textContent).toBe('Observed Bastion');
    expect(backend.runtime.readRealmSnapshot).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'TEST BACKEND DISCONNECT' }));
    await settle();

    expect(bridge.logoutSession).not.toHaveBeenCalled();
    expect(removeObserver).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(backend.runtime.disconnect).toHaveBeenCalledTimes(1);
    expect(backend.runtime.disconnect).toHaveBeenCalledWith(backend.connection);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);

    act(() => {
      reportObservedRealm?.(SHARED_REALM);
      reportSubscriptionApplied?.();
      reportSubscriptionError?.();
      reportDisconnected?.();
    });
    await settle();

    expect(removeObserver).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(backend.runtime.disconnect).toHaveBeenCalledTimes(1);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readRealmSnapshot).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
  });

  it('completes local sign-out when every backend teardown hook throws', async () => {
    const backend = createBackendRuntime();
    const removeObserver = vi.fn(() => {
      throw new Error('controlled observer cleanup failure');
    });
    const unsubscribe = vi.fn(() => {
      throw new Error('controlled subscription cleanup failure');
    });
    vi.mocked(backend.runtime.observeRealm).mockReturnValue(removeObserver);
    vi.mocked(backend.runtime.subscribeRealm).mockImplementation((
      _connection,
      onApplied
    ) => {
      onApplied();
      return { unsubscribe } as never;
    });
    vi.mocked(backend.runtime.disconnect).mockImplementation(() => {
      throw new Error('controlled transport cleanup failure');
    });

    const { bridge, container } = renderExperience({ runtime: backend.runtime });
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    returnToMainMenuThroughPlayerProfile();
    await settle();
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @warpkeeper'
    }));

    expect(() => fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }))).not.toThrow();
    await settle();

    expect(removeObserver).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(backend.runtime.disconnect).toHaveBeenCalledTimes(1);
    expect(bridge.logoutSession).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expectPlayerRealmChromeAbsent();
    expect(screen.queryByRole('button', { name: 'SIGN OUT' })).toBeNull();
  });

  it('keeps shared alpha fail-closed without opening a Farcaster channel when the kill switch is off', async () => {
    const backend = createBackendRuntime();
    const bridge = createBridge(
      createAuthorizedResponse(),
      () => TEST_NOW,
      createAuthorizedResponse()
    );
    const { authority, createBrowserBinding, encodeQrCode } = renderExperience({
      bridge,
      runtime: backend.runtime,
      config: { ...TEST_CONFIG, sharedAlphaEnabled: false }
    });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();

    expect(screen.getByRole('status').textContent).toContain(
      WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE
    );
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(bridge.refreshSession).not.toHaveBeenCalled();
    expect(bridge.createChallenge).not.toHaveBeenCalled();
    expect(createBrowserBinding).not.toHaveBeenCalled();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
  });

  it('does not check admission or mount the realm when the backend protocol is incompatible', async () => {
    const backend = createBackendRuntime(['ready'], SHARED_REALM, {
      protocolVersion: 1,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    });
    const { authority } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readBackendInfo).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).toBeTruthy();
  });

  it('does not continue a connection that disconnects while its handshake promise is resolving', async () => {
    const backend = createBackendRuntime();
    vi.mocked(backend.runtime.connect).mockImplementation(async (
      _config,
      _jwt,
      callbacks
    ) => {
      callbacks?.onDisconnected?.();
      return backend.connection as never;
    });
    const { authority } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readBackendInfo).not.toHaveBeenCalled();
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).toBeTruthy();
  });

  it('cleans a subscription handle returned after a synchronous subscription failure', async () => {
    const backend = createBackendRuntime();
    const removeObserver = vi.fn();
    const unsubscribe = vi.fn();
    vi.mocked(backend.runtime.observeRealm).mockReturnValue(removeObserver);
    vi.mocked(backend.runtime.subscribeRealm).mockImplementation((
      _connection,
      _onApplied,
      onError
    ) => {
      onError();
      return { unsubscribe } as never;
    });
    renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await acceptAlphaParticipationTerms();
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(removeObserver).toHaveBeenCalledTimes(1);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
    expect(backend.connection.disconnect).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).toBeTruthy();
  });
});
