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

function createTestAuthority() {
  const createdAt = Date.now();
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

function renderExperience() {
  const authority = createTestAuthority();
  const rendered = testingLibraryRender(
    <FarcasterAuthProvider
      encodeQrCode={async () => 'data:image/svg+xml,TEST_QR'}
      loadAuthority={async () => authority}
      pollIntervalMs={1}
    >
      <WarpkeepExperience />
    </FarcasterAuthProvider>
  );
  return { ...rendered, authority };
}

async function settleAuth() {
  await act(async () => {
    for (let round = 0; round < 12; round += 1) {
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

beforeEach(() => {
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
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Menu' }));
    await act(async () => {});
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
  });

  it('blocks an anonymous direct #realm load without creating an auth channel', () => {
    window.localStorage.setItem('fid', '12345');
    window.sessionStorage.setItem('farcasterIdentity', JSON.stringify(VERIFIED_IDENTITY));
    window.history.replaceState({}, '', '/?fid=12345#realm');
    const { container, authority } = renderExperience();

    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.queryByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();
    expect(authority.beginSignIn).not.toHaveBeenCalled();
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
    expect(screen.getByRole('heading', { level: 1, name: 'Hegemony Lowlands' })).not.toBeNull();
  });

  it('leaves the other menu commands as their existing development notices', () => {
    renderExperience();

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('status').textContent).toContain('war council');
  });
});
