import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen
} from '@testing-library/react';
import { StrictMode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepExperience } from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';
import {
  FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS,
  getFarcasterDeviceSessionStorageKey,
  persistFarcasterRememberedDeviceSession,
  type FarcasterDeviceSessionEnvironment,
  type FarcasterDeviceSessionStorage
} from '../src/farcaster/farcasterDeviceSession';
import type {
  FarcasterSessionAuthority,
  FarcasterSignInChannel,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const VERIFIED_IDENTITY: VerifiedFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'warpkeeper',
  displayName: 'Warp Keeper',
  verifications: Object.freeze([]),
  authMethod: 'authAddress',
  verifiedAt: 10_000
});

const REMEMBERED_SESSION_NOW = Date.UTC(2026, 6, 11, 12, 0, 0);

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
  now = REMEMBERED_SESSION_NOW
): FarcasterDeviceSessionEnvironment {
  return {
    storage,
    origin: window.location.origin,
    basePath: '/',
    now: () => now
  };
}

function createTestAuthority(now: () => number = Date.now) {
  const createdAt = now();
  const channel: FarcasterSignInChannel = {
    channelToken: 'PRIVATE_TEST_CHANNEL_TOKEN_123456',
    url: 'farcaster://connect?channelToken=PRIVATE_TEST_CHANNEL_TOKEN_123456',
    nonce: 'TestNonce1234567890',
    requestId: 'test-request-id',
    domain: 'localhost',
    siweUri: 'http://localhost/',
    createdAt,
    expiresAt: createdAt + 300_000
  };
  return {
    beginSignIn: vi.fn(async () => channel),
    getStatus: vi.fn(async () => ({
      state: 'completed' as const,
      nonce: channel.nonce,
      message: 'PRIVATE_TEST_MESSAGE',
      signature: `0x${'ab'.repeat(65)}` as const,
      fid: VERIFIED_IDENTITY.fid,
      signatureParams: {
        siweUri: channel.siweUri,
        domain: channel.domain,
        nonce: channel.nonce,
        expirationTime: new Date(channel.expiresAt).toISOString(),
        requestId: channel.requestId
      },
      acceptAuthAddress: true as const,
      username: VERIFIED_IDENTITY.username,
      displayName: VERIFIED_IDENTITY.displayName,
      verifications: [],
      authMethod: 'authAddress' as const
    })),
    verifyCompletedRequest: vi.fn(async () => VERIFIED_IDENTITY)
  } satisfies FarcasterSessionAuthority;
}

type RenderExperienceOptions = {
  strict?: boolean;
  deviceSessionEnvironment?: FarcasterDeviceSessionEnvironment;
  now?: () => number;
  encodeQrCode?: (channelUrl: string) => Promise<string>;
};

function renderExperience({
  strict = false,
  deviceSessionEnvironment,
  now = Date.now,
  encodeQrCode = vi.fn(async () => 'data:image/svg+xml,TEST_QR')
}: RenderExperienceOptions = {}) {
  const authority = createTestAuthority(now);
  const experience = (
    <FarcasterAuthProvider
      deviceSessionEnvironment={deviceSessionEnvironment}
      encodeQrCode={encodeQrCode}
      loadAuthority={async () => authority}
      now={now}
      pollIntervalMs={1}
    >
      <WarpkeepExperience />
    </FarcasterAuthProvider>
  );
  const rendered = testingLibraryRender(strict ? <StrictMode>{experience}</StrictMode> : experience);
  return { ...rendered, authority, encodeQrCode };
}

async function settleAuth() {
  await act(async () => {
    for (let round = 0; round < 12; round += 1) {
      await Promise.resolve();
    }
  });
}

async function preloadFarcasterPresentation() {
  await Promise.all([
    import('../src/components/auth/FarcasterIdentityBadge'),
    import('../src/components/auth/FarcasterQrAuthPanel')
  ]);
  await settleAuth();
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
  await preloadFarcasterPresentation();
  vi.useFakeTimers();
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

describe('Warpkeep realm entry', () => {
  it('authenticates through ENTER REALM, opens the deterministic realm, and keeps the session', async () => {
    const { container, authority } = renderExperience();
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).not.toBeNull();
    expect(experience.getAttribute('data-phase')).toBe('menu');
    await settleAuth();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await settleAuth();

    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
    expect(authority.verifyCompletedRequest).toHaveBeenCalledTimes(1);
    expect(screen.getByText('FID 12345')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(experience.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    expect(screen.getByText('Hegemony Frontier Keep')).not.toBeNull();
    expect(screen.getByText(
      /Surveyors are preparing the frontier keep|frontier marker is holding|frontier keep .* expedition|center holding/i
    )).not.toBeNull();
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_CHANNEL_TOKEN_123456');
    expect(container.innerHTML).not.toContain('PRIVATE_TEST_MESSAGE');

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    await act(async () => {});
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
  });

  it('opens a valid remembered device directly at #realm without a channel or QR', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    const rememberedIdentity: VerifiedFarcasterIdentity = {
      ...VERIFIED_IDENTITY,
      verifiedAt: REMEMBERED_SESSION_NOW - 60_000
    };
    const session = persistFarcasterRememberedDeviceSession(
      rememberedIdentity,
      environment
    );
    expect(session).toBeDefined();
    window.history.replaceState({}, '', '/#realm');

    const { container, authority, encodeQrCode } = renderExperience({
      deviceSessionEnvironment: environment,
      now: environment.now
    });
    const experience = container.querySelector('.warpkeep-experience')!;

    // The synchronous restored auth state decides the initial phase before a
    // relay request or QR encoder can begin.
    expect(experience.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
    expect(encodeQrCode).not.toHaveBeenCalled();

    await act(async () => {});
    const realmAudio = Array.from(
      container.querySelectorAll<HTMLAudioElement>('audio[data-audio-role^="realm"]')
    );
    expect(realmAudio).toHaveLength(2);
    expect(realmAudio.every((audio) => (
      audio.getAttribute('src')?.includes('audio/warpkeep-lowlands-theme.mp3')
    ))).toBe(true);
  });

  it('fails closed for an expired device record and gates a direct #realm load', async () => {
    const storage = new TestDeviceStorage();
    const issuedEnvironment = createDeviceSessionEnvironment(storage);
    const rememberedIdentity: VerifiedFarcasterIdentity = {
      ...VERIFIED_IDENTITY,
      verifiedAt: REMEMBERED_SESSION_NOW - 60_000
    };
    expect(persistFarcasterRememberedDeviceSession(
      rememberedIdentity,
      issuedEnvironment
    )).toBeDefined();
    const expiredEnvironment = createDeviceSessionEnvironment(
      storage,
      REMEMBERED_SESSION_NOW + FARCASTER_REMEMBERED_DEVICE_SESSION_TTL_MS
    );
    window.history.replaceState({}, '', '/#realm');

    const { container, authority } = renderExperience({
      deviceSessionEnvironment: expiredEnvironment,
      now: expiredEnvironment.now
    });

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('heading', { level: 1, name: '@warpkeeper Keep' })).toBeNull();
    expect(storage.getItem(getFarcasterDeviceSessionStorageKey('/')!)).toBeNull();
    expect(Array.from(
      container.querySelectorAll<HTMLAudioElement>('audio[data-audio-role^="realm"]')
    ).every((audio) => !audio.hasAttribute('src'))).toBe(true);

    await settleAuth();
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
  });

  it('normalizes a remembered #realm route when another tab forgets the device', async () => {
    const storage = new TestDeviceStorage();
    const environment = createDeviceSessionEnvironment(storage);
    const rememberedIdentity: VerifiedFarcasterIdentity = {
      ...VERIFIED_IDENTITY,
      verifiedAt: REMEMBERED_SESSION_NOW - 60_000
    };
    expect(persistFarcasterRememberedDeviceSession(
      rememberedIdentity,
      environment
    )).toBeDefined();
    const storageKey = getFarcasterDeviceSessionStorageKey('/')!;
    window.history.replaceState({}, '', '/#realm');
    const { container, authority } = renderExperience({
      deviceSessionEnvironment: environment,
      now: environment.now
    });

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    storage.removeItem(storageKey);
    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: storageKey, newValue: null }));
    });
    await settleAuth();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('heading', { level: 1, name: '@warpkeeper Keep' })).toBeNull();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
  });

  it('normalizes an anonymous direct #realm load to its one-shot Farcaster gate', async () => {
    window.localStorage.setItem('fid', '12345');
    window.sessionStorage.setItem('farcasterIdentity', JSON.stringify(VERIFIED_IDENTITY));
    window.history.replaceState({}, '', '/?fid=12345#realm');
    const { container, authority } = renderExperience({ strict: true });

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('heading', { level: 1, name: '@warpkeeper Keep' })).toBeNull();
    await settleAuth();

    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await settleAuth();
    expect(screen.getByText('FID 12345')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
  });

  it('gates an anonymous Back or Forward visit to #realm and lets cancellation stay cancelled', async () => {
    const { container, authority } = renderExperience();

    expect(authority.beginSignIn).not.toHaveBeenCalled();
    act(() => {
      window.history.replaceState({}, '', '/#realm');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await settleAuth();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('heading', { level: 1, name: '@warpkeeper Keep' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    await settleAuth();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    await settleAuth();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
  });

  it('keeps the verified FID across title/menu transitions without another channel', async () => {
    window.history.replaceState({}, '', '/#menu');
    const { container, authority } = renderExperience();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settleAuth();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    await settleAuth();
    expect(screen.getByText('FID 12345')).not.toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    await settleAuth();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => {
      vi.advanceTimersByTime(901);
    });
    await act(async () => {
      vi.advanceTimersByTime(2_250);
    });
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('title');

    fireEvent.keyDown(document.body, { key: 'Enter' });
    await act(async () => {
      vi.advanceTimersByTime(2_250);
    });
    await settleAuth();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('realm');
    expect(authority.beginSignIn).toHaveBeenCalledTimes(1);
  });

  it('honors an authenticated Forward to #realm during the title-to-menu transition', async () => {
    const { container } = renderExperience();
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settleAuth();
    await act(async () => vi.advanceTimersByTime(1));
    await settleAuth();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(experience.getAttribute('data-phase')).toBe('realm');

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => {});
    expect(experience.getAttribute('data-phase')).toBe('menu');
    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(901));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('title');

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    act(() => {
      window.history.replaceState({ warpkeepRealm: true }, '', '/#realm');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));

    expect(experience.getAttribute('data-phase')).toBe('realm');
    expect(window.location.hash).toBe('#realm');
    expect(screen.getByRole('heading', { level: 1, name: '@warpkeeper Keep' })).not.toBeNull();
  });

  it('does not permit later realm entry after the in-memory identity signs out', async () => {
    const { container, authority } = renderExperience();
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settleAuth();
    await act(async () => vi.advanceTimersByTime(1));
    await settleAuth();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(experience.getAttribute('data-phase')).toBe('realm');

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    await act(async () => {});
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    }));
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT & FORGET DEVICE' }));

    expect(screen.queryByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    await settleAuth();

    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(screen.queryByRole('heading', { level: 1, name: '@warpkeeper Keep' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(authority.beginSignIn).toHaveBeenCalledTimes(2);
  });

  it('leaves the other menu commands as their existing development notices', () => {
    renderExperience();

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('status').textContent).toContain('war council');
  });
});
