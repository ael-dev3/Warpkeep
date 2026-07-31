import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FarcasterAdmissionPanel } from '../src/components/auth/FarcasterAdmissionPanel';
import type { VerifiedFarcasterIdentity } from '../src/farcaster/farcasterAuthTypes';

const identity: VerifiedFarcasterIdentity = Object.freeze({
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  verifications: Object.freeze([]),
  verifiedAt: 1_750_000_000_000
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FarcasterAdmissionPanel', () => {
  it('renders the verified denied state with one explicit in-app access request', () => {
    const onBackToMenu = vi.fn();
    const onCheckAgain = vi.fn();
    const onRequestAccess = vi.fn();
    const onSignOut = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'not-requested' }}
        identity={identity}
        onBackToMenu={onBackToMenu}
        onCheckAgain={onCheckAgain}
        onRequestAccess={onRequestAccess}
        onSignOut={onSignOut}
        phase="denied"
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.getByText(
      'This Farcaster identity is not yet admitted to the Hegemony frontier.'
    )).not.toBeNull();
    expect(screen.getByText(/Warpkeep is a small, manually admitted Alpha/i)).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.queryByText('FID 12345')).toBeNull();
    expect(screen.queryByRole('link', { name: /request/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    expect(screen.queryByRole('button', { name: 'CHECK AGAIN' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    expect(onRequestAccess).toHaveBeenCalledTimes(1);
    expect(onCheckAgain).not.toHaveBeenCalled();
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps REQUEST ACCESS as the sole denied recovery after a status outage', () => {
    const onRequestAccess = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'error', retryable: true }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onRequestAccess={onRequestAccess}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.getByText(/could not confirm an existing request/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'TRY AGAIN' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CHECK AGAIN' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'REQUEST ACCESS' }));
    expect(onRequestAccess).toHaveBeenCalledTimes(1);
  });

  it('restores CHECK AGAIN after the request is recorded for manual review', () => {
    const onCheckAgain = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'requested', requestedAt: 1_750_000_000_000 }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={onCheckAgain}
        onRequestAccess={vi.fn()}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect((screen.getByRole('button', {
      name: 'REQUEST RECEIVED'
    }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('renders the local request latch immediately as a disabled sent action', () => {
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'submitting' }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onRequestAccess={vi.fn()}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.getByText('Request sent.')).not.toBeNull();
    expect(screen.getByText(/Confirming with the Hegemony records/i)).not.toBeNull();
    expect((screen.getByRole('button', {
      name: 'REQUEST SENT'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'CHECK AGAIN' })).toBeNull();
  });

  it('keeps a backend outage distinct from an admission rejection', () => {
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="error"
      />
    );

    expect(screen.getByText('The Hegemony records are temporarily unreachable.')).not.toBeNull();
    expect(screen.queryByRole('link', { name: /request Warpkeep access/i })).toBeNull();
    expect(screen.getByRole('button', { name: 'CHECK AGAIN' })).not.toBeNull();
  });

  it('shows a meaningful busy status without exposing backend implementation detail', () => {
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="checking-admission"
      />
    );

    expect(screen.getByRole('status').textContent).toBe('Checking frontier access');
    expect(screen.queryByText(/OIDC|JWT|WebSocket/i)).toBeNull();
    expect(screen.getByRole('button', { name: 'SIGN OUT' })).not.toBeNull();
  });

  it('names both contractual documents when current entry acceptance is required', () => {
    const onReviewTerms = vi.fn();
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onCheckAgain={vi.fn()}
        onReviewTerms={onReviewTerms}
        onSignOut={vi.fn()}
        phase="awaiting-terms"
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'ENTRY AGREEMENT REQUIRED' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Accept the current Alpha Terms and Hegemony Social Contract before Hegemony records open.',
    );
    expect(screen.queryByRole('button', { name: 'BACK TO MENU' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'REVIEW TERMS' }));
    expect(onReviewTerms).toHaveBeenCalledTimes(1);
  });

  it('names the canonical opening boundary while subscription data is still pending', () => {
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="opening-realm"
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'OPENING GENESIS 001…' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Opening Genesis 001…');
    expect(screen.queryByRole('button', { name: 'CHECK AGAIN' })).toBeNull();
  });
});
