import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepMainMenu } from '../src/components/menu/WarpkeepMainMenu';
import type {
  FarcasterAuthViewState,
  PublicFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';

const identity: PublicFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'keeper',
  verifications: [] as const,
  verifiedAt: 1_750_000_000_000
});

const authenticatedState: FarcasterAuthViewState = Object.freeze({
  phase: 'authenticated',
  identity,
  assurance: 'bridge-oidc-alpha',
  expiresAt: Date.now() + 60_000
});

const pendingState: FarcasterAuthViewState = Object.freeze({
  phase: 'pending-admission',
  identity,
  sessionExpiresAt: Date.now() + 60_000
});

function callbacks() {
  return {
    begin: vi.fn(),
    cancel: vi.fn(),
    retry: vi.fn(),
    restore: vi.fn(async () => false),
    enter: vi.fn(),
    check: vi.fn(() => true),
    requestAccess: vi.fn(() => true),
    signOut: vi.fn()
  };
}

function renderMenu(
  authState: FarcasterAuthViewState = { phase: 'anonymous' },
  overrides: Partial<ReturnType<typeof callbacks>> = {}
) {
  const handlers = { ...callbacks(), ...overrides };
  const rendered = render(
    <WarpkeepMainMenu
      accessRequest={{ phase: 'request-available' }}
      active
      admissionCheck={{ phase: 'idle' }}
      authState={authState}
      onCancelFarcasterSignIn={handlers.cancel}
      onCheckFarcasterAdmission={handlers.check}
      onRequestAccess={handlers.requestAccess}
      onRequestAuthenticatedRealm={handlers.enter}
      onRequestFarcasterSignIn={handlers.begin}
      onRequestReturn={vi.fn()}
      onRestoreFarcasterSession={handlers.restore}
      onRetryFarcasterSignIn={handlers.retry}
      onSignOut={handlers.signOut}
    />
  );
  return { ...rendered, handlers };
}

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false,
    media: '(prefers-reduced-motion: reduce)',
    addEventListener: vi.fn(),
    removeEventListener: vi.fn()
  }));
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Warpkeep realm choice integration', () => {
  it('defaults to Genesis 001 and derives each visible mark from current authority', () => {
    const { rerender } = renderMenu();

    expect(screen.getByRole('radio', { name: /Genesis 001.*Not admitted/i })
      .getAttribute('aria-checked')).toBe('true');
    expect(screen.getByRole('radio', { name: /Genesis 002.*Not admitted/i })
      .getAttribute('aria-checked')).toBe('false');

    rerender(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onRequestReturn={vi.fn()}
      />
    );

    expect(screen.getByRole('radio', { name: /Genesis 001.*Admitted/i })
      .getAttribute('data-admission')).toBe('admitted');
    expect(screen.getByRole('radio', { name: /Genesis 002.*Not admitted/i })
      .getAttribute('data-admission')).toBe('not-admitted');
  });

  it('keeps sealed Genesis 002 entirely presentation-only', () => {
    const { handlers } = renderMenu(authenticatedState);

    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(screen.getByRole('status').textContent).toMatch(/Genesis 002 is sealed/i);
    expect(screen.getByRole('status').textContent).toMatch(/no access request or realm connection/i);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(handlers.restore).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
    expect(handlers.check).not.toHaveBeenCalled();
    expect(handlers.requestAccess).not.toHaveBeenCalled();
  });

  it('cannot bypass the Genesis 002 seal through the authenticated identity panel', async () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        entryAgreementSatisfied
        onCancelFarcasterSignIn={handlers.cancel}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestReturn={vi.fn()}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(await screen.findByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    expect(await screen.findByRole('heading', {
      name: 'HEGEMONY RECORD VERIFIED'
    })).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(handlers.enter).not.toHaveBeenCalled();
    expect(screen.getByText(/Genesis 002 is sealed/)).not.toBeNull();
  });

  it('blocks Genesis 002 before opening or accepting entry terms', async () => {
    const handlers = callbacks();
    const acceptTerms = vi.fn();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onAcceptAlphaTermsAttempt={acceptTerms}
        onCancelFarcasterSignIn={handlers.cancel}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestReturn={vi.fn()}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
      />
    );

    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(await screen.findByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'ENTER REALM' }));

    expect(screen.queryByRole('dialog', {
      name: 'ALPHA PARTICIPATION TERMS'
    })).toBeNull();
    expect(screen.getByText(/Genesis 002 is sealed/)).not.toBeNull();
    expect(acceptTerms).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('locks the realm selector while an existing Genesis 001 session is restored', () => {
    const restore = vi.fn(() => new Promise<boolean>(() => undefined));
    renderMenu({ phase: 'anonymous' }, { restore });

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(screen.getAllByRole('radio').every((radio) => (
      (radio as HTMLButtonElement).disabled
    ))).toBe(true);
  });

  it('removes access-request admission UI and explains the launch suspension', async () => {
    const { handlers } = renderMenu(pendingState);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

    expect(await screen.findByText(/admissions are temporarily suspended/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(handlers.requestAccess).not.toHaveBeenCalled();
  });
});
