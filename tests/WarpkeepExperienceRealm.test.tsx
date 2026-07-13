import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepExperience } from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';
import {
  getFarcasterDeviceSessionStorageKey,
  persistFarcasterRememberedDeviceSession,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type {
  FarcasterBridgeChallenge,
  FarcasterOidcBridgeClient,
  FarcasterOidcSession,
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';
import {
  WarpkeepSpacetimeProvider,
  type WarpkeepBackendRuntime
} from '../src/spacetime/WarpkeepSpacetimeProvider';
import type {
  WarpkeepAdmissionStatus,
  WarpkeepRealmSnapshot
} from '../src/spacetime/warpkeepBackendTypes';
import {
  WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE,
  type WarpkeepRuntimeConfig
} from '../src/spacetime/warpkeepConfig';

const TEST_NOW = Date.UTC(2026, 6, 11, 12, 0, 0);
const TEST_ISSUER = 'https://auth.warpkeep.example';
const TEST_AUDIENCE = 'warpkeep-spacetimedb';
const TEST_CONFIG: WarpkeepRuntimeConfig = Object.freeze({
  spacetimeUri: 'https://maincloud.spacetimedb.com',
  spacetimeDatabase: 'warpkeep-89e4u',
  bridgeUrl: TEST_ISSUER,
  issuer: TEST_ISSUER,
  audience: TEST_AUDIENCE,
  sharedAlphaEnabled: true
});

const VERIFIED_IDENTITY: VerifiedFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'warpkeeper',
  displayName: 'Warp Keeper',
  verifications: Object.freeze([]),
  authMethod: 'authAddress',
  verifiedAt: TEST_NOW - 10_000
});

const SHARED_REALM: WarpkeepRealmSnapshot = Object.freeze({
  tiles: Object.freeze([]),
  players: Object.freeze([]),
  castles: Object.freeze([
    Object.freeze({
      castleId: 1,
      ownerFid: VERIFIED_IDENTITY.fid,
      tileKey: '1,-1',
      q: 1,
      r: -1,
      level: 2,
      name: 'Warpkeeper Bastion'
    }),
    Object.freeze({
      castleId: 2,
      ownerFid: 77,
      tileKey: '-1,1',
      q: -1,
      r: 1,
      level: 1,
      name: 'Peer Watch'
    })
  ]),
  ownCastle: Object.freeze({
    castleId: 1,
    ownerFid: VERIFIED_IDENTITY.fid,
    tileKey: '1,-1',
    q: 1,
    r: -1,
    level: 2,
    name: 'Warpkeeper Bastion'
  })
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
  now = TEST_NOW
): FarcasterOidcSession {
  const issuedAt = Math.floor(now / 1_000);
  const expiresAt = now + 30 * 24 * 60 * 60 * 1_000;
  const jwt = `${encodeJwtSegment({ alg: 'ES256', typ: 'JWT', kid: 'test-key' })}.${encodeJwtSegment({
    iss: TEST_ISSUER,
    sub: `farcaster:${fid}`,
    aud: [TEST_AUDIENCE],
    token_type: 'spacetime-access',
    fid: String(fid),
    auth_epoch: 0,
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

function createBridge(session: FarcasterOidcSession, now: () => number) {
  return {
    createChallenge: vi.fn(async () => {
      const createdAt = now();
      return {
        nonce: 'ab'.repeat(24),
        requestId: 'bridge-request-1234',
        createdAt,
        expiresAt: createdAt + 300_000
      };
    }),
    exchangeCompletedSignIn: vi.fn(async () => session)
  } satisfies FarcasterOidcBridgeClient;
}

function createBackendRuntime(
  admissionSequence: readonly WarpkeepAdmissionStatus[] = ['ready'],
  realm: WarpkeepRealmSnapshot = SHARED_REALM,
  backendInfo: unknown = {
    protocolVersion: 1,
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
};

function renderExperience({
  deviceSessionEnvironment,
  now = () => TEST_NOW,
  runtime = createBackendRuntime().runtime,
  bridge = createBridge(createOidcSession(VERIFIED_IDENTITY.fid, now()), now),
  config = TEST_CONFIG
}: RenderExperienceOptions = {}) {
  const authority = createTestAuthority(now);
  const rendered = testingLibraryRender(
    <FarcasterAuthProvider
      deviceSessionEnvironment={deviceSessionEnvironment}
      encodeQrCode={vi.fn(async () => 'data:image/svg+xml,TEST_QR')}
      loadAuthority={async () => authority}
      loadBridgeClient={async () => bridge}
      now={now}
      pollIntervalMs={1}
    >
      <WarpkeepSpacetimeProvider config={config} runtime={runtime}>
        <WarpkeepExperience />
      </WarpkeepSpacetimeProvider>
    </FarcasterAuthProvider>
  );
  return { ...rendered, authority, bridge };
}

async function settle() {
  await act(async () => {
    for (let round = 0; round < 16; round += 1) {
      await Promise.resolve();
    }
  });
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
    import('../src/components/auth/FarcasterQrAuthPanel')
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
    const { container, authority, bridge } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(authority.verifyCompletedRequest).toHaveBeenCalledTimes(1);
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    expect(backend.runtime.subscribeRealm).toHaveBeenCalledTimes(1);
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_CHANNEL_TOKEN_123456');
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_MESSAGE');

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(screen.getByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).not.toBeNull();
    expect(screen.getByText('LEVEL 2')).not.toBeNull();
  });

  it('restores a valid v2 bridge session, rechecks admission, and does not create a new Farcaster channel', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    expect(persistFarcasterRememberedDeviceSession(
      VERIFIED_IDENTITY,
      createOidcSession(VERIFIED_IDENTITY.fid, TEST_NOW),
      environment
    )).toBeDefined();
    window.history.replaceState({}, '', '/#realm');
    const backend = createBackendRuntime();
    const { authority } = renderExperience({
      deviceSessionEnvironment: environment,
      now: environment.now,
      runtime: backend.runtime
    });

    await settle();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(backend.runtime.connect).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).not.toBeNull();
    expect(window.location.hash).toBe('#realm');
  });

  it('purges a legacy public-identity record and never lets it mount the shared realm', async () => {
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
    const { authority } = renderExperience({
      deviceSessionEnvironment: environment,
      runtime: backend.runtime
    });

    await settle();
    expect(storage.getItem('warpkeep:/:farcaster-device-session:v1')).toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).toBeNull();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows the precise denied panel and Check Again reuses the existing bridge session without a new QR flow', async () => {
    const backend = createBackendRuntime(['not_admitted', 'ready']);
    const { authority, bridge, container } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(screen.getByText('This Farcaster identity is not yet admitted to the Hegemony frontier.')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1, name: 'Warpkeeper Bastion' })).toBeNull();
    const requestAccess = screen.getByRole('link', {
      name: 'Open @0xael.eth on Farcaster to request Warpkeep access'
    });
    expect(requestAccess).toHaveProperty('href', 'https://farcaster.xyz/0xael.eth');

    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    await settle();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(bridge.exchangeCompletedSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
  });

  it('does not connect anonymous title/menu visitors and sign-out tears down backend state', async () => {
    const backend = createBackendRuntime(['not_admitted']);
    const { authority } = renderExperience({ runtime: backend.runtime });
    expect(backend.runtime.connect).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
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
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(2);
    expect(backend.runtime.connect).toHaveBeenCalledTimes(2);
  });

  it('keeps shared alpha fail-closed without opening a Farcaster channel when the kill switch is off', async () => {
    const backend = createBackendRuntime();
    const { authority } = renderExperience({
      runtime: backend.runtime,
      config: { ...TEST_CONFIG, sharedAlphaEnabled: false }
    });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();

    expect(screen.getByRole('status').textContent).toContain(
      WARPKEEP_SHARED_ALPHA_UNAVAILABLE_MESSAGE
    );
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(backend.runtime.connect).not.toHaveBeenCalled();
  });

  it('does not check admission or mount the realm when the backend protocol is incompatible', async () => {
    const backend = createBackendRuntime(['ready'], SHARED_REALM, {
      protocolVersion: 2,
      worldSeed: 3_445_214_658,
      worldSeedName: 'HEGEMONY_GENESIS_001'
    });
    const { authority } = renderExperience({ runtime: backend.runtime });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settle();
    await act(async () => vi.advanceTimersByTime(1));
    await settle();

    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readBackendInfo).toHaveBeenCalledTimes(1);
    expect(backend.runtime.readAdmission).not.toHaveBeenCalled();
    expect(screen.queryByRole('main', { name: 'Hegemony realm' })).toBeNull();
    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).toBeTruthy();
  });
});
