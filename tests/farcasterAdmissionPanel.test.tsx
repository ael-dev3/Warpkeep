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
        accessRequest={{ phase: 'request-available' }}
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
    expect(screen.getByText(/Request access for manual review/i)).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.queryByText('FID 12345')).toBeNull();
    expect(screen.queryByRole('link', { name: /request/i })).toBeNull();

    const requestButton = screen.getByRole('button', { name: 'REQUEST ACCESS' });
    const descriptionId = requestButton.getAttribute('aria-describedby');
    expect(descriptionId).toBeTruthy();
    expect(document.getElementById(descriptionId!)?.textContent)
      .toMatch(/does not grant entry or reserve a castle/i);
    fireEvent.click(requestButton);
    expect(screen.queryByRole('button', { name: 'CHECK ADMISSION' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    expect(onRequestAccess).toHaveBeenCalledTimes(1);
    expect(onCheckAgain).not.toHaveBeenCalled();
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('keeps an initial status outage read-only until authority confirms availability', () => {
    const onRequestAccess = vi.fn();
    const onRetryAccessRequestStatus = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'status-unavailable', context: 'initial' }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onRequestAccess={onRequestAccess}
        onRetryAccessRequestStatus={onRetryAccessRequestStatus}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.getByText(/could not confirm whether a request is already on record/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'TRY AGAIN' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK STATUS' }));
    expect(onRetryAccessRequestStatus).toHaveBeenCalledTimes(1);
    expect(onRequestAccess).not.toHaveBeenCalled();
  });

  it('retains CHECK ADMISSION after the request is recorded for manual review', () => {
    const onCheckAgain = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'request-received', requestedAt: 1_750_000_000_000 }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={onCheckAgain}
        onRequestAccess={vi.fn()}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.getByText('REQUEST RECEIVED')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'CHECK ADMISSION' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
  });

  it('keeps an ambiguous confirmation sealed and makes CHECK STATUS read-only', () => {
    const onCheckAgain = vi.fn();
    const onRequestAccess = vi.fn();
    const onRetryAccessRequestStatus = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'status-unavailable', context: 'post-submission' }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={onCheckAgain}
        onRequestAccess={onRequestAccess}
        onRetryAccessRequestStatus={onRetryAccessRequestStatus}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.getByText(/remains sealed and will not be sent again/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(onRequestAccess).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'CHECK STATUS' }));
    expect(onRetryAccessRequestStatus).toHaveBeenCalledTimes(1);
    expect(onCheckAgain).not.toHaveBeenCalled();
    expect(onRequestAccess).not.toHaveBeenCalled();
  });

  it('never presents a silent confirmation retry when no status callback exists', () => {
    const onCheckAgain = vi.fn();
    render(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'status-unavailable', context: 'post-submission' }}
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={onCheckAgain}
        onRequestAccess={vi.fn()}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );

    expect(screen.queryByRole('button', { name: 'CHECK STATUS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(onCheckAgain).not.toHaveBeenCalled();
  });

  it('renders submission as a non-interactive focused status presentation', () => {
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

    expect(screen.getByText('REQUEST SENT')).not.toBeNull();
    expect(screen.getByText(/Confirming with the Hegemony records/i)).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'REQUEST ACCESS' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'CHECK ADMISSION' })).toBeNull();
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
    expect(screen.getByRole('button', { name: 'TRY AGAIN' })).not.toBeNull();
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
    expect(screen.queryByRole('button', { name: 'CHECK ADMISSION' })).toBeNull();
  });

  it('rechecks authority instead of trusting an approval-notification launch', () => {
    const view = render(
      <FarcasterAdmissionPanel
        approvalNotificationLaunch
        identity={identity}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="checking-admission"
      />
    );

    expect(screen.getByRole('heading', {
      name: 'CONFIRMING HEGEMONY ADMISSION'
    })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Rechecking your current Warpkeep access…'
    );

    view.rerender(
      <FarcasterAdmissionPanel
        accessRequest={{ phase: 'already-requested', requestedAt: 1_750_000_000_000 }}
        approvalNotificationLaunch
        identity={identity}
        onCheckAgain={vi.fn()}
        onRequestAccess={vi.fn()}
        onSignOut={vi.fn()}
        phase="denied"
      />
    );
    expect(screen.getByRole('heading', { name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.getByText(
      'Warpkeep has not yet confirmed active admission. Check again in a moment.'
    )).not.toBeNull();
  });

  it('shows approval only after the normal backend path reaches Realm readiness', () => {
    render(
      <FarcasterAdmissionPanel
        approvalNotificationLaunch
        identity={identity}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="opening-realm"
      />
    );

    expect(screen.getByRole('heading', {
      name: 'HEGEMONY ADMISSION APPROVED'
    })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Your active admission has been confirmed.'
    );
  });
});
