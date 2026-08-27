import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FarcasterMiniAppEntryGate } from '../src/components/auth/FarcasterMiniAppEntryGate';
import type {
  FarcasterAuthViewState,
  PublicFarcasterIdentity
} from '../src/farcaster/farcasterAuthTypes';
import {
  NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
  type WarpkeepBackendState
} from '../src/spacetime/warpkeepBackendTypes';

const identity: PublicFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: 'https://images.example/keeper.png',
  verifications: [] as const,
  verifiedAt: 1_750_000_000_000
});

const authenticated: FarcasterAuthViewState = Object.freeze({
  phase: 'authenticated',
  assurance: 'bridge-oidc-alpha',
  identity
});

function backendState(
  phase: WarpkeepBackendState['phase']
): WarpkeepBackendState {
  if (phase === 'idle') {
    return Object.freeze({
      phase,
      workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS
    });
  }
  return Object.freeze({
    phase,
    workerPrivateSync: NOT_REQUIRED_WORKER_PRIVATE_SYNC_STATUS,
    identity,
    admission: phase === 'denied' ? 'not_admitted' : 'ready'
  }) as WarpkeepBackendState;
}

function actions() {
  return {
    recoveryReason: null,
    onAcceptTerms: vi.fn(),
    onBackToMenu: vi.fn(),
    onCancelTermsAttempt: vi.fn(),
    onCheckBackend: vi.fn(),
    onRefreshSession: vi.fn(),
    onRequestAccess: vi.fn(),
    onRetryAccessRequestStatus: vi.fn(),
    onRetryAuthentication: vi.fn(),
    onRetryHost: vi.fn(),
    onSignOut: vi.fn()
  };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FarcasterMiniAppEntryGate', () => {
  it('presents one lightweight status while the host and identity are resolving', () => {
    render(
      <FarcasterMiniAppEntryGate
        {...actions()}
        authState={{ phase: 'anonymous' }}
        backendState={backendState('idle')}
        hostState="detecting"
      />
    );

    expect(screen.getByRole('heading', { name: 'OPENING WARPKEEP' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Preparing the Realm inside Farcaster'
    );
    expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  });

  it('keeps a bounded host failure visible with one retry and a menu escape', () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={authenticated}
        backendState={backendState('idle')}
        hostState="recovery"
        recoveryReason="host-timeout"
      />
    );

    expect(screen.getByRole('heading', {
      name: 'MINI APP COULD NOT OPEN'
    })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(
      /did not answer before the secure opening window closed/i
    );
    expect(document.body.textContent).not.toContain('private detail');

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(callbacks.onRetryHost).toHaveBeenCalledTimes(1);
    expect(callbacks.onBackToMenu).toHaveBeenCalledTimes(1);
    expect(callbacks.onRetryAuthentication).not.toHaveBeenCalled();
    expect(callbacks.onSignOut).not.toHaveBeenCalled();
  });

  it.each([
    [{ phase: 'anonymous' } as const, 'CONTINUE WITH FARCASTER'],
    [{
      phase: 'error',
      error: { code: 'verification', message: 'Verification failed.' }
    } as const, 'TRY AGAIN']
  ])('keeps a menu escape beside the %s launch action', (authState, actionLabel) => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={authState as FarcasterAuthViewState}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: actionLabel }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(callbacks.onRetryAuthentication).toHaveBeenCalledOnce();
    expect(callbacks.onBackToMenu).toHaveBeenCalledOnce();
  });

  it('explains an authoritative account change without retaining the old identity', () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={{
          phase: 'error',
          error: {
            code: 'fid-mismatch',
            stage: 'identity_changed',
            message: 'Farcaster account changed.'
          }
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect(screen.getByRole('heading', {
      name: 'FARCASTER ACCOUNT CHANGED'
    })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(
      /cleared the previous access presentation/i
    );
    expect(document.body.textContent).not.toContain('The Keeper');
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    expect(callbacks.onRetryAuthentication).toHaveBeenCalledOnce();
  });

  it('keeps a non-admitted player on a read-only suspended-admission step', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        accessRequest={{ phase: 'request-available' }}
        authState={{
          phase: 'pending-admission',
          identity,
          sessionExpiresAt: Date.now() + 60_000
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect(await screen.findByRole('heading', { name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.getByText(/admissions are temporarily suspended/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(callbacks.onBackToMenu).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'CHECK ADMISSION' }));
    expect(callbacks.onRequestAccess).not.toHaveBeenCalled();
    expect(callbacks.onRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('maps root Escape to the Warpkeep menu without signing out', () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        accessRequest={{ phase: 'request-received', requestedAt: Date.now() }}
        authState={{
          phase: 'pending-admission',
          identity,
          sessionExpiresAt: Date.now() + 60_000
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });

    expect(callbacks.onBackToMenu).toHaveBeenCalledTimes(1);
    expect(callbacks.onSignOut).not.toHaveBeenCalled();
    expect(callbacks.onRefreshSession).not.toHaveBeenCalled();
  });

  it('does not resume an ambiguous access-request workflow while admission is suspended', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        accessRequest={{ phase: 'status-unavailable', context: 'post-submission' }}
        authState={{
          phase: 'pending-admission',
          identity,
          sessionExpiresAt: Date.now() + 60_000
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect(await screen.findByText(/admissions are temporarily suspended/i)).not.toBeNull();
    expect(screen.queryByText('REQUEST STATUS UNAVAILABLE')).toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CHECK STATUS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK ADMISSION' }));
    expect(callbacks.onRetryAccessRequestStatus).not.toHaveBeenCalled();
    expect(callbacks.onRefreshSession).toHaveBeenCalledTimes(1);
    expect(callbacks.onRequestAccess).not.toHaveBeenCalled();
  });

  it('keeps an ordinary-menu escape beside a backend retry action', () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={authenticated}
        backendState={backendState('error')}
        hostState="miniapp"
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(callbacks.onCheckBackend).toHaveBeenCalledTimes(1);
    expect(callbacks.onBackToMenu).toHaveBeenCalledTimes(1);
    expect(callbacks.onSignOut).not.toHaveBeenCalled();
  });

  it('requires current Terms once, then leaves acceptance to the backend authority', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={authenticated}
        backendState={backendState('awaiting-terms')}
        hostState="miniapp"
      />
    );

    const dialog = await screen.findByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    const background = document.querySelector('.farcaster-miniapp-entry__content');
    expect(background?.getAttribute('aria-hidden')).toBe('true');
    expect(background?.hasAttribute('inert')).toBe(true);
    await waitFor(() => expect(dialog.contains(document.activeElement)).toBe(true));
    const continueButton = screen.getByRole('button', { name: 'CONTINUE TO REALM' });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(callbacks.onCancelTermsAttempt).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).toBeNull();
    const reviewTerms = screen.getByRole('button', { name: 'REVIEW TERMS' });
    await waitFor(() => expect(document.activeElement).toBe(reviewTerms));
    expect(background?.hasAttribute('inert')).toBe(false);
    fireEvent.click(reviewTerms);

    fireEvent.click(screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }));
    fireEvent.click(screen.getByRole('button', { name: 'CONTINUE TO REALM' }));
    expect(callbacks.onAcceptTerms).toHaveBeenCalledTimes(1);
  });

  it('offers a bounded retry instead of falling through to the regular menu', () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={{
          phase: 'error',
          error: { code: 'bridge', message: 'private detail' }
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect(screen.queryByText('private detail')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    expect(callbacks.onRetryAuthentication).toHaveBeenCalledTimes(1);
  });

  it('explains a mobile timeout and offers privacy-safe local diagnostics', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        authState={{
          phase: 'error',
          error: {
            code: 'network',
            message: 'private raw failure',
            stage: 'quick_auth_token_timeout'
          }
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect(screen.getByRole('heading', {
      name: 'SECURE SIGN-IN IS TEMPORARILY UNAVAILABLE'
    })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'REOPEN WARPKEEP' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'TRY AGAIN' })).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/account has not been changed/i);
    expect(document.body.textContent).not.toContain('private raw failure');
    expect(screen.getByRole('link', { name: 'OPEN WEB VERSION' }).getAttribute('href'))
      .toBe('https://warpkeep.com/#menu');

    fireEvent.click(screen.getByRole('button', { name: 'COPY DIAGNOSTICS' }));
    const manual = await screen.findByRole('textbox', {
      name: 'Authentication diagnostics for manual copy'
    }) as HTMLTextAreaElement;
    expect(manual.value).toContain('Entry stage: quick_auth_token_timeout');
    expect(manual.value).toContain('Host: miniapp');
    expect(manual.value).not.toMatch(/539854|12345|private raw|username|cookie|authorization/i);
  });
});
