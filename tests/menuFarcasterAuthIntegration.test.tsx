import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  WarpkeepMainMenu,
  type MenuInputModality
} from '../src/components/menu/WarpkeepMainMenu';
import type {
  FarcasterAuthViewState,
  PublicFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const PROFILE_IMAGE_URL =
  'https://imagedelivery.net/BXluQx4ige9GuW0Ia56BHw/bc698287-5adc-4cc5-a503-de16963ed900/original';
const FUTURE_SESSION_EXPIRY = Date.now() + 60 * 60 * 1_000;

function pngHeader() {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  const view = new DataView(bytes.buffer);
  view.setUint32(8, 13, false);
  bytes.set([0x49, 0x48, 0x44, 0x52], 12);
  view.setUint32(16, 256, false);
  view.setUint32(20, 256, false);
  bytes.set([8, 6, 0, 0, 0], 24);
  return bytes;
}

class AutoLoadingProfileImage {
  decoding = 'auto';
  naturalHeight = 256;
  naturalWidth = 256;
  onerror: ((event: Event) => void) | null = null;
  onload: ((event: Event) => void) | null = null;
  referrerPolicy = '';

  set src(_value: string) {
    queueMicrotask(() => this.onload?.(new Event('load')));
  }

  removeAttribute() {}
}

const identity: PublicFarcasterIdentity = {
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: PROFILE_IMAGE_URL,
  verifications: [],
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
  expiresAt: FUTURE_SESSION_EXPIRY
};

const awaitingWithoutQrState: FarcasterAuthViewState = {
  phase: 'awaiting-approval',
  channelUrl: 'farcaster://connect?channelToken=ephemeral-channel&nonce=request-nonce',
  qr: { state: 'not-requested' },
  expiresAt: FUTURE_SESSION_EXPIRY
};

const verifyingState: FarcasterAuthViewState = {
  phase: 'verifying',
  identity,
  expiresAt: FUTURE_SESSION_EXPIRY
};

const authenticatedState: FarcasterAuthViewState = {
  phase: 'authenticated',
  identity,
  assurance: 'live-client-verified',
  expiresAt: FUTURE_SESSION_EXPIRY
};

const rememberedAuthenticatedState: FarcasterAuthViewState = {
  phase: 'authenticated',
  identity,
  assurance: 'remembered-device-prototype',
  expiresAt: FUTURE_SESSION_EXPIRY
};

const pendingAdmissionState: FarcasterAuthViewState = {
  phase: 'pending-admission',
  identity,
  sessionExpiresAt: FUTURE_SESSION_EXPIRY
};

type MenuCallbacks = ReturnType<typeof createMenuCallbacks>;

function createMenuCallbacks() {
  return {
    begin: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    prepareQrCode: vi.fn(),
    refreshSession: vi.fn(),
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
  options: {
    rememberDevice?: boolean;
    backendUnavailableMessage?: string;
    entryAgreementSatisfied?: boolean;
  } = {}
) {
  return (
    <WarpkeepMainMenu
      active
      authState={authState}
      backendUnavailableMessage={options.backendUnavailableMessage}
      entryAgreementSatisfied={options.entryAgreementSatisfied}
      inputModality={inputModality}
      openFarcasterAuthPanel={openFarcasterAuthPanel}
      onCancelFarcasterSignIn={callbacks.cancel}
      onRequestAuthenticatedRealm={callbacks.enterRealm}
      onRequestFarcasterSignIn={callbacks.begin}
      onPrepareFarcasterQrCode={callbacks.prepareQrCode}
      onRefreshFarcasterSession={callbacks.refreshSession}
      onRequestReturn={callbacks.returnToTitle}
      onRetryFarcasterSignIn={callbacks.retry}
      onRememberDeviceChange={callbacks.rememberDeviceChange}
      onSignOut={callbacks.signOut}
      rememberDevice={options.rememberDevice}
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

function openAlphaTerms() {
  fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });
  return screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
}

function acceptAlphaTerms() {
  const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
  const checkbox = within(dialog).getByRole('checkbox', {
    name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
  });
  fireEvent.click(checkbox);
  fireEvent.click(within(dialog).getByRole('button', {
    name: /CONTINUE TO (?:SIGN-IN|ACCESS CHECK|REALM)/
  }));
}

function openAndAcceptAlphaTerms() {
  openAlphaTerms();
  acceptAlphaTerms();
}

beforeEach(async () => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  animationFrames = new Map();
  nextAnimationFrameId = 0;
  vi.stubGlobal('Image', AutoLoadingProfileImage as unknown as typeof Image);
  vi.stubGlobal('fetch', vi.fn(async () => new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(pngHeader());
        controller.close();
      }
    }),
    { status: 200, headers: { 'content-type': 'image/png' } }
  )));
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:warpkeep-menu-profile');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
    clearRect: vi.fn(),
    drawImage: vi.fn()
  } as unknown as CanvasRenderingContext2D);
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
  it('does not create a channel or render Terms, auth, QR, or deep-link UI on initial render', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'OPEN IN FARCASTER' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('opens an unchecked Terms gate before every authentication side effect', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    const dialog = openAlphaTerms();
    const checkbox = within(dialog).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    });
    const continueButton = within(dialog).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    });

    expect((checkbox as HTMLInputElement).checked).toBe(false);
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.retry).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'OPEN IN FARCASTER' })).toBeNull();
  });

  it('accepts Terms once, begins once, and only then opens the auth rail', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    openAndAcceptAlphaTerms();
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).toBe(
      document.activeElement
    );
  });

  it.each([
    ['Cancel', () => fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }))],
    ['close', () => fireEvent.click(screen.getByRole('button', {
      name: 'Close Alpha Participation Terms'
    }))],
    ['Escape', () => fireEvent.keyDown(document, { key: 'Escape' })]
  ] as const)('%s clears Terms without beginning or cancelling auth and restores focus', (
    _action,
    dismiss
  ) => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, anonymousState, 'keyboard'));

    openAlphaTerms();
    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }));
    dismiss();
    flushAnimationFrames();

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.returnToTitle).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(document.activeElement).toBe(enterRealm);

    fireEvent.click(enterRealm, { detail: 0 });
    expect((screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('opens settings independently, then gates auth and begins exactly once after acceptance', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    fireEvent.click(screen.getByRole('button', { name: 'SETTINGS' }));
    expect(screen.getByRole('dialog', { name: 'SETTINGS' })).not.toBeNull();
    expect(callbacks.begin).not.toHaveBeenCalled();
    fireEvent.keyDown(document, { key: 'Escape' });

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    fireEvent.click(enterRealm, { detail: 0 });
    expect(callbacks.begin).not.toHaveBeenCalled();
    acceptAlphaTerms();
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

  it('ignores the deprecated guarded-route input instead of auto-opening Terms or auth', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, anonymousState, 'unknown', true));

    await act(async () => {
      await Promise.resolve();
    });
    await settleDeferredPresentation();

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('does not begin or cancel auth when an unaccepted Terms gate unmounts', async () => {
    const callbacks = createMenuCallbacks();
    const rendered = render(menu(callbacks));

    openAlphaTerms();
    rendered.unmount();
    await act(async () => {
      await Promise.resolve();
    });

    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
  });

  it('clears checked Terms on pagehide so bfcache history cannot restore acceptance', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    openAlphaTerms();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent(window, new Event('pagehide'));

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();

    fireEvent(window, new Event('pageshow'));
    const freshTerms = openAlphaTerms();
    expect((within(freshTerms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('uses Escape to cancel an accepted auth attempt back to commands before returning to title', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, anonymousState, 'keyboard'));

    openAndAcceptAlphaTerms();
    flushAnimationFrames();
    fireEvent.keyDown(document, { key: 'Escape' });
    flushAnimationFrames();

    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
    expect(callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.returnToTitle).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(document.activeElement).toBe(enterRealm);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(callbacks.returnToTitle).toHaveBeenCalledTimes(1);
  });

  it('cancels an accepted open request before returning to title', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    openAndAcceptAlphaTerms();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));

    expect(callbacks.cancel).toHaveBeenCalledTimes(1);
    expect(callbacks.returnToTitle).toHaveBeenCalledTimes(1);
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
  });

  it('renders the awaiting QR and exact safe Farcaster deep link only after acceptance', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    openAndAcceptAlphaTerms();

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

  it('asks the lazy QR callback only after accepted Terms lead to an awaiting panel', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    openAndAcceptAlphaTerms();

    result.rerender(menu(callbacks, awaitingWithoutQrState));
    await settleDeferredPresentation();

    expect(callbacks.prepareQrCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.getByText('Preparing QR code')).not.toBeNull();
  });

  it('shows the verified username and PFP in the auth rail after QR approval', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks));
    openAndAcceptAlphaTerms();

    result.rerender(menu(callbacks, verifyingState));
    await settleDeferredPresentation();

    expect(screen.getByRole('heading', {
      level: 2,
      name: 'VERIFYING HEGEMONY RECORD'
    })).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.queryByText('FID 12345')).toBeNull();
    expect(screen.getByText('Securing realm session…')).not.toBeNull();
    const profileImage = result.container.querySelector<HTMLCanvasElement>(
      '.farcaster-identity-badge__portrait canvas'
    );
    await waitFor(() => expect(profileImage?.dataset.profileImageState).toBe('ready'));
    expect(profileImage?.style.display).toBe('block');
    expect(result.container.querySelector('.farcaster-identity-badge__portrait img')).toBeNull();
  });

  it('shows keyboard-focused identity confirmation after acceptance, then a compact badge', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    openAndAcceptAlphaTerms();

    result.rerender(menu(callbacks, authenticatedState, 'keyboard'));
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(screen.getByRole('heading', {
      level: 2,
      name: 'HEGEMONY RECORD VERIFIED'
    })).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.queryByText('FID 12345')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));

    fireEvent.keyDown(document, { key: 'Escape' });
    flushAnimationFrames();
    await settleDeferredPresentation();

    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }).getAttribute('data-compact')).toBe('true');
    expect(screen.getByText('FARCASTER VERIFIED')).not.toBeNull();
    expect(callbacks.begin).toHaveBeenCalledTimes(1);
  });

  it('does not grant special UI authority to a legacy assurance label', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, rememberedAuthenticatedState));

    await settleDeferredPresentation();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    })).not.toBeNull();
    expect(screen.getByText('FARCASTER VERIFIED')).not.toBeNull();
    expect(screen.queryByText('REMEMBERED DEVICE')).toBeNull();
  });

  it('gates pending admission without entering the realm or starting another sign-in', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(
      callbacks,
      pendingAdmissionState,
      'unknown',
      false,
      { entryAgreementSatisfied: true }
    ));
    await settleDeferredPresentation();

    expect(screen.getByText('ADMISSION PENDING')).not.toBeNull();
    const terms = openAlphaTerms();
    expect((within(terms).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
    acceptAlphaTerms();
    await settleDeferredPresentation();
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(callbacks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('gates an authenticated command and invokes the typed realm callback only after acceptance', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, authenticatedState));

    await settleDeferredPresentation();
    expect(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    })).not.toBeNull();
    const terms = openAlphaTerms();
    expect((within(terms).getByRole('button', {
      name: 'CONTINUE TO REALM'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
    expect(callbacks.begin).not.toHaveBeenCalled();
    acceptAlphaTerms();

    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('re-enters directly when this authenticated session already recorded the current agreement', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(
      callbacks,
      authenticatedState,
      'unknown',
      false,
      { entryAgreementSatisfied: true }
    ));

    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
    expect(callbacks.begin).not.toHaveBeenCalled();
  });

  it('never reuses agreement evidence after the authenticated access deadline', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(
      callbacks,
      { ...authenticatedState, expiresAt: Date.now() - 1 },
      'unknown',
      false,
      { entryAgreementSatisfied: true }
    ));

    await settleDeferredPresentation();
    const terms = openAlphaTerms();

    expect((within(terms).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
    acceptAlphaTerms();

    expect(callbacks.refreshSession).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
  });

  it('does not let the authenticated identity badge bypass fresh Terms for realm entry', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, authenticatedState));
    await settleDeferredPresentation();

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    const terms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(terms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(callbacks.enterRealm).not.toHaveBeenCalled();
    acceptAlphaTerms();

    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
  });

  it('lets the authenticated identity rail reuse current-session agreement evidence', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(
      callbacks,
      authenticatedState,
      'unknown',
      false,
      { entryAgreementSatisfied: true }
    ));
    await settleDeferredPresentation();

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(callbacks.enterRealm).toHaveBeenCalledTimes(1);
    expect(callbacks.enterRealm).toHaveBeenCalledWith(identity);
  });

  it('does not let the pending identity badge refresh a session before fresh Terms', async () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks, pendingAdmissionState));
    await settleDeferredPresentation();

    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));

    const terms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(terms).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect(within(terms).getByRole('button', {
      name: 'CONTINUE TO ACCESS CHECK'
    })).not.toBeNull();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
    acceptAlphaTerms();

    expect(callbacks.refreshSession).toHaveBeenCalledTimes(1);
  });

  it('focuses retry after an accepted keyboard-driven error and gates retry again', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    openAndAcceptAlphaTerms();

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
    const retryTerms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect((within(retryTerms).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    expect(callbacks.retry).not.toHaveBeenCalled();
    acceptAlphaTerms();
    result.rerender(menu(callbacks, { phase: 'creating-channel' }, 'keyboard'));
    await settleDeferredPresentation();
    flushAnimationFrames();

    expect(callbacks.retry).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(screen.getByRole('heading', {
      level: 2,
      name: 'CLAIM YOUR KEEP'
    }));
  });

  it('requires a fresh unchecked acceptance for every retry attempt', async () => {
    const callbacks = createMenuCallbacks();
    const errorState: FarcasterAuthViewState = {
      phase: 'error',
      error: {
        code: 'relay',
        message: 'The Farcaster relay could not verify this request.'
      }
    };
    const result = render(menu(callbacks, anonymousState, 'keyboard'));
    openAndAcceptAlphaTerms();
    result.rerender(menu(callbacks, errorState, 'keyboard'));
    await settleDeferredPresentation();

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }), { detail: 0 });
    expect((screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    acceptAlphaTerms();
    expect(callbacks.retry).toHaveBeenCalledTimes(1);

    result.rerender(menu(callbacks, { phase: 'creating-channel' }, 'keyboard'));
    await settleDeferredPresentation();
    result.rerender(menu(callbacks, errorState, 'keyboard'));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }), { detail: 0 });

    expect(callbacks.retry).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
  });

  it('closes a stale accepted auth surface after an external cancellation', () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, anonymousState));
    openAndAcceptAlphaTerms();
    result.rerender(menu(callbacks, { phase: 'creating-channel' }));
    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();

    result.rerender(menu(callbacks, anonymousState));

    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('gives maintenance mode precedence over Terms and every authentication callback', () => {
    const callbacks = createMenuCallbacks();
    const maintenanceMessage = 'Public alpha sign-in is temporarily unavailable.';
    render(menu(callbacks, anonymousState, 'keyboard', true, {
      backendUnavailableMessage: maintenanceMessage
    }));

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }), { detail: 0 });

    expect(screen.getByText(maintenanceMessage)).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Farcaster sign-in' })).toBeNull();
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(callbacks.cancel).not.toHaveBeenCalled();
    expect(callbacks.retry).not.toHaveBeenCalled();
    expect(callbacks.refreshSession).not.toHaveBeenCalled();
  });

  it('never persists or reuses acceptance across storage events, rerenders, or unmounts', () => {
    const storageKey = 'warpkeep-alpha-terms-accepted';
    window.localStorage.setItem(storageKey, 'true');
    window.sessionStorage.setItem(storageKey, 'true');
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const callbacks = createMenuCallbacks();
    const rendered = render(menu(callbacks));

    let dialog = openAlphaTerms();
    let checkbox = within(dialog).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    });
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    window.dispatchEvent(new StorageEvent('storage', {
      key: storageKey,
      newValue: 'true',
      storageArea: window.localStorage
    }));
    expect((checkbox as HTMLInputElement).checked).toBe(false);

    fireEvent.click(checkbox);
    expect((checkbox as HTMLInputElement).checked).toBe(true);
    fireEvent.click(within(dialog).getByRole('button', { name: 'CANCEL' }));
    rendered.rerender(menu(callbacks));

    dialog = openAlphaTerms();
    checkbox = within(dialog).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    });
    expect((checkbox as HTMLInputElement).checked).toBe(false);
    rendered.unmount();

    const freshCallbacks = createMenuCallbacks();
    render(menu(freshCallbacks));
    dialog = openAlphaTerms();
    expect((within(dialog).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement).checked).toBe(false);
    expect(storageWrite).not.toHaveBeenCalled();
    expect(callbacks.begin).not.toHaveBeenCalled();
    expect(freshCallbacks.begin).not.toHaveBeenCalled();
  });

  it('signs out to anonymous commands and restores keyboard focus', async () => {
    const callbacks = createMenuCallbacks();
    const result = render(menu(callbacks, authenticatedState, 'keyboard'));
    await settleDeferredPresentation();
    fireEvent.click(screen.getByRole('button', {
      name: 'Open Farcaster identity, @keeper'
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
      name: 'Open Farcaster identity, @keeper'
    })).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));
  });

  it('keeps the persistent-world command set available before authentication', () => {
    const callbacks = createMenuCallbacks();
    render(menu(callbacks));

    const navigation = screen.getByRole('navigation', { name: 'Hegemony main menu' });
    expect(within(navigation).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'ENTER REALM',
      'SETTINGS',
      'CREDITS'
    ]);
    expect(screen.getByRole('button', {
      name: 'Open patch notes for Warpkeep ALPHA 0.3.17'
    })).not.toBeNull();

    expect(screen.queryByRole('button', { name: 'CONTINUE' })).toBeNull();
    expect(callbacks.begin).not.toHaveBeenCalled();
  });
});
