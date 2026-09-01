import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
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

const legacyAssurances = [
  'live-client-verified',
  'remembered-device-prototype'
] as const;

function legacyAuthenticatedState(
  assurance: typeof legacyAssurances[number]
): FarcasterAuthViewState {
  return {
    phase: 'authenticated',
    identity,
    assurance,
    expiresAt: Date.now() + 60_000
  };
}

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
    enterPtr: vi.fn(),
    cancelPtr: vi.fn(),
    check: vi.fn(() => true),
    checkRealms: vi.fn(),
    requestAccess: vi.fn(() => true),
    acceptTerms: vi.fn(),
    signOut: vi.fn()
  };
}

function renderMenu(
  authState: FarcasterAuthViewState = { phase: 'anonymous' },
  overrides: Partial<ReturnType<typeof callbacks>> = {},
  entryAgreementSatisfied = false
) {
  const handlers = { ...callbacks(), ...overrides };
  const rendered = render(
    <WarpkeepMainMenu
      accessRequest={{ phase: 'request-available' }}
      active
      admissionCheck={{ phase: 'idle' }}
      authState={authState}
      entryAgreementSatisfied={entryAgreementSatisfied}
      onCancelFarcasterSignIn={handlers.cancel}
      onCheckFarcasterAdmission={handlers.check}
      onCheckRealmAccess={handlers.checkRealms}
      onCancelPtrRealm={handlers.cancelPtr}
      onRequestAccess={handlers.requestAccess}
      onAcceptAlphaTermsAttempt={handlers.acceptTerms}
      onRequestAuthenticatedRealm={handlers.enter}
      onRequestPtrRealm={handlers.enterPtr}
      onRequestFarcasterSignIn={handlers.begin}
      onRequestReturn={vi.fn()}
      onRestoreFarcasterSession={handlers.restore}
      onRetryFarcasterSignIn={handlers.retry}
      onSignOut={handlers.signOut}
    />
  );
  return { ...rendered, handlers };
}

function expectAuthoritySideEffectsUntouched(
  handlers: ReturnType<typeof callbacks>
) {
  expect(handlers.begin).not.toHaveBeenCalled();
  expect(handlers.restore).not.toHaveBeenCalled();
  expect(handlers.enter).not.toHaveBeenCalled();
  expect(handlers.enterPtr).not.toHaveBeenCalled();
  expect(handlers.checkRealms).not.toHaveBeenCalled();
  expect(handlers.check).not.toHaveBeenCalled();
  expect(handlers.requestAccess).not.toHaveBeenCalled();
  expect(handlers.acceptTerms).not.toHaveBeenCalled();
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
  it('keeps the admitted Genesis 001 entry callback unchanged', () => {
    const { handlers } = renderMenu(authenticatedState, {}, true);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(handlers.enter).toHaveBeenCalledTimes(1);
    expect(handlers.enter).toHaveBeenCalledWith(identity);
    expect(handlers.cancelPtr).toHaveBeenCalledTimes(1);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(handlers.restore).not.toHaveBeenCalled();
    expect(handlers.checkRealms).not.toHaveBeenCalled();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
    expect(handlers.check).not.toHaveBeenCalled();
    expect(handlers.requestAccess).not.toHaveBeenCalled();
  });

  it('revokes background PTR authority before continuing into Genesis 001', () => {
    const { handlers } = renderMenu(authenticatedState);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(handlers.cancelPtr).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('dialog', {
      name: /Alpha Participation Terms/i,
    })).not.toBeNull();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
  });

  it('limits PTR busy state to PTR so its check cannot block either Genesis realm', () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onCancelFarcasterSignIn={handlers.cancel}
        onCancelPtrRealm={handlers.cancelPtr}
        onCheckRealmAccess={handlers.checkRealms}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestPtrRealm={handlers.enterPtr}
        onRequestReturn={vi.fn()}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
        ptrRealmAuthority={{ source: 'server-verified', admission: 'admitted' }}
        ptrRealmBusy
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect((screen.getByRole('button', {
      name: 'ENTER SELECTED REALM',
    }) as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(screen.getByRole('radio', { name: /Public Test Realm.*Admitted/i }));
    expect((screen.getByRole('button', {
      name: 'CHECKING ACCESS…',
    }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    expect(handlers.cancelPtr).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', {
      name: 'ENTER SELECTED REALM',
    }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('opens a dedicated realm panel without exposing permanent inline choices', () => {
    const { handlers } = renderMenu();
    const command = screen.getByRole('button', { name: 'ENTER REALM' });

    expect(screen.queryByRole('radiogroup', { name: 'Choose realm' })).toBeNull();
    fireEvent.click(command, { detail: 0 });

    expect(screen.getByRole('heading', { name: 'CHOOSE YOUR REALM' })).not.toBeNull();
    expect(screen.getByRole('radiogroup', { name: 'Choose realm' })).not.toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('heading', {
      name: 'CHOOSE YOUR REALM'
    }));
    expectAuthoritySideEffectsUntouched(handlers);
  });

  it.each([
    ['Genesis 001', /Genesis 001/i],
    ['Genesis 002', /Genesis 002/i],
    ['Public Test Realm', /Public Test Realm/i],
  ] as const)(
    'keeps selecting %s presentation-only',
    (_label, accessibleName) => {
      const { handlers } = renderMenu(authenticatedState);

      fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
      fireEvent.click(screen.getByRole('radio', { name: accessibleName }));

      expectAuthoritySideEffectsUntouched(handlers);
    },
  );

  it('uses Back and Escape to return focus to the command surface', async () => {
    renderMenu();
    const command = screen.getByRole('button', { name: 'ENTER REALM' });

    fireEvent.click(command, { detail: 0 });
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));
    });
    expect(screen.queryByRole('radiogroup', { name: 'Choose realm' })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    await waitFor(() => {
      expect(document.activeElement).toBe(screen.getByRole('button', { name: 'ENTER REALM' }));
    });
  });

  it('starts exactly one fresh PTR access check from explicit Enter at the no-authority boundary', () => {
    const unknown = renderMenu(authenticatedState);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Access unknown/i,
    }));

    expectAuthoritySideEffectsUntouched(unknown.handlers);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(unknown.handlers.checkRealms).toHaveBeenCalledTimes(1);
    expect(unknown.handlers.enterPtr).not.toHaveBeenCalled();
    expect(unknown.handlers.enter).not.toHaveBeenCalled();
  });

  it('guards same-tick PTR Enter from starting a duplicate access check', () => {
    const unknown = renderMenu(authenticatedState);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Access unknown/i,
    }));
    const enter = screen.getByRole('button', { name: 'ENTER SELECTED REALM' });

    act(() => {
      enter.click();
      enter.click();
    });

    expect(unknown.handlers.checkRealms).toHaveBeenCalledTimes(1);
    expect(unknown.handlers.enterPtr).not.toHaveBeenCalled();
    expect(unknown.handlers.enter).not.toHaveBeenCalled();
  });

  it('releases a no-busy PTR attempt after its post-event render so later Enter retries', () => {
    const unknown = renderMenu(authenticatedState);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Access unknown/i,
    }));
    const enter = screen.getByRole('button', { name: 'ENTER SELECTED REALM' });

    fireEvent.click(enter);
    expect(unknown.handlers.checkRealms).toHaveBeenCalledTimes(1);

    fireEvent.click(enter);

    expect(unknown.handlers.checkRealms).toHaveBeenCalledTimes(2);
    expect(unknown.handlers.enterPtr).not.toHaveBeenCalled();
    expect(unknown.handlers.enter).not.toHaveBeenCalled();
  });

  it('invalidates pending PTR status reconciliation on Back before a late result', () => {
    const handlers = callbacks();
    const props = {
      active: true,
      authState: authenticatedState,
      onCancelFarcasterSignIn: handlers.cancel,
      onCancelPtrRealm: handlers.cancelPtr,
      onCheckRealmAccess: handlers.checkRealms,
      onRequestAuthenticatedRealm: handlers.enter,
      onRequestFarcasterSignIn: handlers.begin,
      onRequestPtrRealm: handlers.enterPtr,
      onRequestReturn: vi.fn(),
      onRestoreFarcasterSession: handlers.restore,
      onRetryFarcasterSignIn: handlers.retry,
      onSignOut: handlers.signOut,
    } as const;
    const view = render(<WarpkeepMainMenu {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Access unknown/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));
    expect(screen.getByRole('status').textContent).toMatch(/not yet verified/i);

    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    view.rerender(
      <WarpkeepMainMenu
        {...props}
        ptrRealmAuthority={{ source: 'server-verified', admission: 'not-admitted' }}
      />,
    );
    expect(screen.queryByText(/PTR access was not granted/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(screen.queryByRole('status')).toBeNull();
    expect(handlers.checkRealms).toHaveBeenCalledTimes(1);
    expect(handlers.enterPtr).not.toHaveBeenCalled();
  });

  it('keeps checking PTR locked without a duplicate check or connection', () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onCancelFarcasterSignIn={handlers.cancel}
        onCheckRealmAccess={handlers.checkRealms}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestPtrRealm={handlers.enterPtr}
        onRequestReturn={vi.fn()}
        onRestoreFarcasterSession={handlers.restore}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
        ptrRealmBusy
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', { name: /Public Test Realm/i }));
    const enter = screen.getByRole('button', { name: 'CHECKING ACCESS…' });
    expect((enter as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(enter);

    expect(handlers.checkRealms).not.toHaveBeenCalled();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('keeps server-denied PTR deterministic without an implicit retry or connection', () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onCancelFarcasterSignIn={handlers.cancel}
        onCheckRealmAccess={handlers.checkRealms}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestPtrRealm={handlers.enterPtr}
        onRequestReturn={vi.fn()}
        onRestoreFarcasterSession={handlers.restore}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
        ptrRealmAuthority={{ source: 'server-verified', admission: 'not-admitted' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Not admitted/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(screen.getByRole('status').textContent).toMatch(/access was not granted/i);
    expect(handlers.checkRealms).not.toHaveBeenCalled();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
  });

  it('routes authorized PTR only through its distinct entry callback', () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        onCancelFarcasterSignIn={handlers.cancel}
        onCheckRealmAccess={handlers.checkRealms}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestPtrRealm={handlers.enterPtr}
        onRequestReturn={vi.fn()}
        onRestoreFarcasterSession={handlers.restore}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
        ptrRealmAuthority={{ source: 'server-verified', admission: 'admitted' }}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Admitted/i,
    }));

    expectAuthoritySideEffectsUntouched(handlers);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(handlers.enterPtr).toHaveBeenCalledTimes(1);
    expect(handlers.checkRealms).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(handlers.restore).not.toHaveBeenCalled();
  });

  it('keeps unknown PTR closed until its explicit check and never falls through Genesis 001', () => {
    const unknown = renderMenu(authenticatedState);
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', {
      name: /Public Test Realm.*Access unknown/i,
    }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(screen.getByRole('status').textContent).toMatch(/PTR access is not yet verified/i);
    expect(unknown.handlers.checkRealms).toHaveBeenCalledTimes(1);
    expect(unknown.handlers.enterPtr).not.toHaveBeenCalled();
    expect(unknown.handlers.enter).not.toHaveBeenCalled();
  });

  it('never lets a persisted PTR selection fall through the Genesis 001 identity rail', async () => {
    const handlers = callbacks();
    render(
      <WarpkeepMainMenu
        active
        authState={authenticatedState}
        entryAgreementSatisfied
        onCancelFarcasterSignIn={handlers.cancel}
        onRequestAuthenticatedRealm={handlers.enter}
        onRequestFarcasterSignIn={handlers.begin}
        onRequestPtrRealm={handlers.enterPtr}
        onRequestReturn={vi.fn()}
        onRetryFarcasterSignIn={handlers.retry}
        onSignOut={handlers.signOut}
        ptrRealmAuthority={{ source: 'server-verified', admission: 'admitted' }}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', { name: /Public Test Realm.*Admitted/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
    fireEvent.click(await screen.findByRole('button', {
      name: 'Open Farcaster identity, @keeper'
    }));
    fireEvent.click(await screen.findByRole('button', { name: 'ENTER REALM' }));

    expect(handlers.enter).not.toHaveBeenCalled();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
  });

  it('defaults to Genesis 001 and derives each visible mark from current authority', () => {
    const { rerender } = renderMenu();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

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

  it.each(legacyAssurances)(
    'keeps %s visibly unadmitted and blocks command entry',
    (assurance) => {
      const { handlers } = renderMenu(
        legacyAuthenticatedState(assurance),
        {},
        true
      );
      fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));

      expect(screen.getByRole('radio', {
        name: /Genesis 001.*Not admitted/i
      }).getAttribute('data-admission')).toBe('not-admitted');
      fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

      expect(handlers.enter).not.toHaveBeenCalled();
    }
  );

  it.each(legacyAssurances)(
    'keeps %s from entering through the authenticated identity rail',
    async (assurance) => {
      const { handlers } = renderMenu(
        legacyAuthenticatedState(assurance),
        {},
        true
      );

      fireEvent.click(await screen.findByRole('button', {
        name: 'Open Farcaster identity, @keeper'
      }));
      fireEvent.click(await screen.findByRole('button', {
        name: 'ENTER REALM'
      }));

      expect(handlers.enter).not.toHaveBeenCalled();
    }
  );

  it('keeps sealed Genesis 002 entirely presentation-only', () => {
    const { handlers } = renderMenu(authenticatedState);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(screen.getByRole('status').textContent).toMatch(/Genesis 002 is sealed/i);
    expect(screen.getByRole('status').textContent).toMatch(/no access request or realm connection/i);
    expect(handlers.begin).not.toHaveBeenCalled();
    expect(handlers.restore).not.toHaveBeenCalled();
    expect(handlers.enter).not.toHaveBeenCalled();
    expect(handlers.check).not.toHaveBeenCalled();
    expect(handlers.requestAccess).not.toHaveBeenCalled();
    expect(handlers.checkRealms).not.toHaveBeenCalled();
    expect(handlers.enterPtr).not.toHaveBeenCalled();
    expect(handlers.acceptTerms).not.toHaveBeenCalled();
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

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('radio', { name: /Genesis 002/i }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(screen.getAllByRole('radio').every((radio) => (
      (radio as HTMLButtonElement).disabled
    ))).toBe(true);
  });

  it('removes access-request admission UI and explains the launch suspension', async () => {
    const { handlers } = renderMenu(pendingState);

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    expect(await screen.findByText(/admissions are temporarily suspended/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(handlers.requestAccess).not.toHaveBeenCalled();
  });
});
