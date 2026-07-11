import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WarpkeepMainMenu,
  type MenuInputModality
} from '../src/components/menu/WarpkeepMainMenu';
import type {
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const identity: VerifiedFarcasterIdentity = {
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: 'https://images.example/keeper.png',
  custody: '0x1234',
  verifications: ['0xabcd'],
  authMethod: 'authAddress',
  verifiedAt: 1_750_000_000_000
};

const anonymousState: FarcasterAuthViewState = { phase: 'anonymous' };

const awaitingState: FarcasterAuthViewState = {
  phase: 'awaiting-approval',
  channelUrl: 'farcaster://connect?channelToken=ephemeral-channel&nonce=request-nonce',
  qr: {
    state: 'ready',
    dataUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E'
  },
  expiresAt: 1_800_000_000_000
};

const awaitingWithoutQrState: FarcasterAuthViewState = {
  phase: 'awaiting-approval',
  channelUrl: 'farcaster://connect?channelToken=ephemeral-channel&nonce=request-nonce',
  qr: { state: 'not-requested' },
  expiresAt: 1_800_000_000_000
};

const authenticatedState: FarcasterAuthViewState = {
  phase: 'authenticated',
  identity,
  assurance: 'live-client-verified'
};

const rememberedAuthenticatedState: FarcasterAuthViewState = {
  phase: 'authenticated',
  identity,
  assurance: 'remembered-device-prototype',
  expiresAt: 1_800_000_000_000
};

type MenuCallbacks = ReturnType<typeof createMenuCallbacks>;

function createMenuCallbacks() {
  return {
    begin: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    prepareQrCode: vi.fn(),
    rememberDeviceChange: vi.fn(),
    signOut: vi.fn(),
    enterRealm: vi.fn(),
    returnToTitle: vi.fn()
  };
}

function menu(
  callbacks: MenuCallbacks,
  authState: FarcasterAuthViewState = anonymousState,
  inputModality: MenuInputModality = 'unknown',
  openFarcasterAuthPanel = false,
  options: { rememberDevice?: boolean; hasRememberedDevice?: boolean } = {}
) {
  return (
    <WarpkeepMainMenu
      active
      authState={authState}
      inputModality={inputModality}
      openFarcasterAuthPanel={openFarcasterAuthPanel}
      onCancelFarcasterSignIn={callbacks.cancel}
      onRequestAuthenticatedRealm={callbacks.enterRealm}
      onRequestFarcasterSignIn={callbacks.begin}
      onPrepareFarcasterQrCode={callbacks.prepareQrCode}
      onRequestReturn={callbacks.returnToTitle}
      onRetryFarcasterSignIn={callbacks.retry}
      onRememberDeviceChange={callbacks.rememberDeviceChange}
      onSignOut={callbacks.signOut}
      rememberDevice={options.rememberDevice}
      hasRememberedDevice={options.hasRememberedDevice}
    />
  );
}

let animationFrames: Map<number, FrameRequestCallback>;
let nextAnimationFrameId: number;

function flushAnimationFrames() {
  const pendingFrames = [...animationFrames.values()];
  animationFrames.clear();
  act(() => {
    pendingFrames.forEach((callback) => callback(0));
  });
}

async function settleDeferredPresentation() {
  await act(async () => {
    for (let round = 0; round < 8; round += 1) {
      await Promise.resolve();
    }
  });
}

async function preloadFarcasterPresentation() {
  await Promise.all([
    import('../src/components/auth/FarcasterIdentityBadge'),
    import('../src/components/auth/FarcasterQrAuthPanel')
  ]);
  await settleDeferredPresentation();
}

beforeEach(async () => {
  animationFrames = new Map();
  nextAnimationFrameId = 0;
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
  vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
    nextAnimationFrameId += 1;
    animationFrames.set(nextAnimationFrameId, callback);
    return nextAnimationFrameId;
  }));
  vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
    animationFrames.delete(frameId);
  }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
  await preloadFarcasterPresentation();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WarpkeepMainMenu Farcaster authentication integration', () => {
  it('does not create a channel or render auth/QR UI on initial render', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('opens auth and begins exactly once while preserving other command notices', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('status').textContent).toContain('war council');
    expect(callbacks.begin).not.toHaveBeenCalled();

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    fireEvent.click(enterRealm, { detail: 0 });
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).toBe(
      document.activeElement
    );
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'SETTINGS' })).toBeNull();
  });

  it('opens one native auth rail for a guarded anonymous realm route', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, anonymousState, 'unknown', true));

    await act(async () => {
      await Promise.resolve();
    });
    await settleDeferredPresentation();

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
  });

  it('does not start a queued guarded-route request after the menu unmounts', async () => {
    const callbacks = createMenuCallbacks();
    const rendered = render(menu(callbacks, anonymousState, 'unknown', true));

    rendered.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('uses Escape to cancel back to commands before returning to title', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, anonymousState, 'keyboard'));

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });
    flushAnimationFrames();
    fireEvent.keyDown(document, { key: 'Escape' });
    flushAnimationFrames();

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    expect(callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.returnToTitle).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(document.activeElement).toBe(enterRealm);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(callbacks.returnToTitle).toHaveBeenCalledTimes(1);
  });

  it('cancels an open request before returning to title', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));

    expect(callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.returnToTitle).toHaveBeenCalledTimes(1);
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
  });

  it('renders the awaiting QR and the exact safe Farcaster deep link', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    result.rerender(menu(callbacks, awaitingState));
    await settleDeferredPresentation();

    const qr = screen.getByRole('img', { name: 'Sign in with Farcaster QR code' });
    expect(qr.getAttribute('src')).toBe(
      awaitingState.phase === 'awaiting-approval' && awaitingState.qr.state === 'ready'
        ? awaitingState.qr.dataUrl
        : undefined
    );
    expect(screen.getByText(/to bind this realm to your FID/i)).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Waiting for Farcaster approval');
    const deepLink = screen.getByRole('link', { name: 'OPEN IN FARCASTER' });
    expect(deepLink.getAttribute('href')).toBe(awaitingState.channelUrl);
    expect(deepLink.getAttribute('rel')).toContain('noreferrer');
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
  });

  it('asks the lazy QR callback only after an awaiting desktop panel needs an image', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    result.rerender(menu(callbacks, awaitingWithoutQrState));
    await settleDeferredPresentation();

    expect(callbacks.prepareQrCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.getByText('Preparing QR code')).not.toBeNull();
  });

  it('shows keyboard-focused identity confirmation, then a compact authenticated badge', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });

    result.rerender(menu(callbacks, authenticatedState, 'keyboard'));
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(screen.getByRole('heading', {
      level: 2,
      name: 'HEGEMONY RECORD VERIFIED'
    })).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    flushAnimationFrames();
    await settleDeferredPresentation();

    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    }).getAttribute('data-compact')).toBe('true');
    expect(screen.getByText('FARCASTER VERIFIED')).not.toBeNull();
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
  });

  it('labels a restored identity as a remembered device in the menu badge', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, rememberedAuthenticatedState));

    await settleDeferredPresentation();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).not.toBeNull();
    expect(screen.getByText('REMEMBERED DEVICE')).not.toBeNull();
    expect(screen.queryByText('FARCASTER VERIFIED')).toBeNull();
  });

  it('invokes the typed realm callback for an authenticated command without beginning again', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, authenticatedState));

    await settleDeferredPresentation();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('focuses retry after a keyboard-driven error', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });

    result.rerender(menu(callbacks, {
      phase: 'error',
      error: {
        code: 'relay',
        message: 'The Farcaster relay could not verify this request.'
      }
    }, 'keyboard'));
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'TRY AGAIN' }));
    expect(screen.getByRole('status').textContent).toBe('Authentication failed');

    fireEvent.keyDown(screen.getByRole('button', { name: 'TRY AGAIN' }), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }), { detail: 0 });
    result.rerender(menu(callbacks, { phase: 'creating-channel' }, 'keyboard'));
    flushAnimationFrames();

    expect(callbacks.retry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', {
      level: 2,
      name: 'CLAIM YOUR KEEP'
    }));
  });

  it('preserves keyboard retry focus while a guarded route keeps its auth rail open', async () => {
    const callbacks = createMenuCallbacks();
    const errorState: FarcasterAuthViewState = {
      phase: 'error',
      error: {
        code: 'relay',
        message: 'The Farcaster relay could not verify this request.'
      }
    };
    const result = render(menu(callbacks, errorState, 'keyboard', true));
    await settleDeferredPresentation();

    const retry = screen.getByRole('button', { name: 'TRY AGAIN' });
    fireEvent.keyDown(retry, { key: 'Enter' });
    fireEvent.click(retry, { detail: 0 });
    result.rerender(menu(callbacks, { phase: 'creating-channel' }, 'keyboard', true));
    await settleDeferredPresentation();
    flushAnimationFrames();

    result.rerender(menu(callbacks, errorState, 'keyboard', true));
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(callbacks.retry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'TRY AGAIN' }));
  });

  it('closes a stale auth surface after an external cancellation', () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    result.rerender(menu(callbacks, { phase: 'creating-channel' }));
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();

    result.rerender(menu(callbacks, anonymousState));

    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('signs out to anonymous commands and restores keyboard focus', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, authenticatedState, 'keyboard'));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    }), { detail: 0 });
    flushAnimationFrames();

    const signOut = screen.getByRole('button', { name: 'SIGN OUT' });
    fireEvent.keyDown(signOut, { key: 'Enter' });
    fireEvent.click(signOut, { detail: 0 });
    result.rerender(menu(callbacks, anonymousState, 'keyboard'));
    flushAnimationFrames();

    expect(callbacks.signOut).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(screen.queryByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));
  });

  it('keeps the original command set unchanged before authentication', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    const navigation = screen.getByRole('navigation', { name: 'Hegemony main menu' });
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'ENTER REALM',
      'CONTINUE',
      'SETTINGS',
      'CREDITS',
      'EXIT'
    ]);

    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE' }));
    expect(screen.getByRole('status').textContent).toContain('Campaign persistence');
    expect(callbacks.begin).not.toHaveBeenCalled();
  });
});
