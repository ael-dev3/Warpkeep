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
  qrDataUrl: 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E',
  expiresAt: 1_800_000_000_000
};

const authenticatedState: FarcasterAuthViewState = {
  phase: 'authenticated',
  identity
};

type MenuCallbacks = ReturnType<typeof createMenuCallbacks>;

function createMenuCallbacks() {
  return {
    begin: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    signOut: vi.fn(),
    enterRealm: vi.fn(),
    returnToTitle: vi.fn()
  };
}

function menu(
  callbacks: MenuCallbacks,
  authState: FarcasterAuthViewState = anonymousState,
  inputModality: MenuInputModality = 'unknown'
) {
  return (
    <WarpkeepMainMenu
      active
      authState={authState}
      inputModality={inputModality}
      onCancelFarcasterSignIn={callbacks.cancel}
      onRequestAuthenticatedRealm={callbacks.enterRealm}
      onRequestFarcasterSignIn={callbacks.begin}
      onRequestReturn={callbacks.returnToTitle}
      onRetryFarcasterSignIn={callbacks.retry}
      onSignOut={callbacks.signOut}
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

beforeEach(() => {
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

  it('opens auth and begins exactly once while preserving other command notices', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('status').textContent).toContain('war council');
    expect(callbacks.begin).not.toHaveBeenCalled();

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    fireEvent.click(enterRealm, { detail: 0 });
    flushAnimationFrames();

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).toBe(
      document.activeElement
    );
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'SETTINGS' })).toBeNull();
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

  it('renders the awaiting QR and the exact Farcaster deep link', () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    result.rerender(menu(callbacks, awaitingState));

    const qr = screen.getByRole('img', { name: 'Sign in with Farcaster QR code' });
    expect(qr.getAttribute('src')).toBe(awaitingState.qrDataUrl);
    expect(screen.getByText(/to bind this realm to your FID/i)).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Waiting for Farcaster approval');
    const deepLink = screen.getByRole('link', { name: 'OPEN IN FARCASTER' });
    expect(deepLink.getAttribute('href')).toBe(awaitingState.channelUrl);
    expect(deepLink.getAttribute('rel')).toContain('noreferrer');
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('navigation', { name: 'Hegemony main menu' })).toBeNull();
  });

  it('shows keyboard-focused identity confirmation, then a compact authenticated badge', () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });

    result.rerender(menu(callbacks, authenticatedState, 'keyboard'));
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

    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    }).getAttribute('data-compact')).toBe('true');
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
  });

  it('invokes the typed realm callback for an authenticated command without beginning again', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, authenticatedState));

    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('focuses retry after a keyboard-driven error', () => {
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

  it('signs out to anonymous commands and restores keyboard focus', () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, authenticatedState, 'keyboard'));
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
