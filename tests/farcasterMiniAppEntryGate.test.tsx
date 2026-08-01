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
    onAcceptTerms: vi.fn(),
    onCancelTermsAttempt: vi.fn(),
    onCheckBackend: vi.fn(),
    onRefreshSession: vi.fn(),
    onRequestAccess: vi.fn(),
    onRetryAccessRequestStatus: vi.fn(),
    onRetryAuthentication: vi.fn(),
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

  it('keeps a non-admitted player on the manual access-request step', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        accessRequest={{ phase: 'not-requested' }}
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
    expect(screen.queryByRole('button', { name: 'BACK TO MENU' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    expect(screen.queryByRole('button', { name: 'CHECK AGAIN' })).toBeNull();
    expect(callbacks.onRequestAccess).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefreshSession).not.toHaveBeenCalled();
  });

  it('keeps a delayed Mini App petition sealed while CHECK AGAIN reconciles it', async () => {
    const callbacks = actions();
    render(
      <FarcasterMiniAppEntryGate
        {...callbacks}
        accessRequest={{ phase: 'confirmation-pending' }}
        authState={{
          phase: 'pending-admission',
          identity,
          sessionExpiresAt: Date.now() + 60_000
        }}
        backendState={backendState('idle')}
        hostState="miniapp"
      />
    );

    expect((await screen.findByRole('button', {
      name: 'REQUEST SENT'
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(callbacks.onRetryAccessRequestStatus).toHaveBeenCalledTimes(1);
    expect(callbacks.onRefreshSession).not.toHaveBeenCalled();
    expect(callbacks.onRequestAccess).not.toHaveBeenCalled();
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
});
