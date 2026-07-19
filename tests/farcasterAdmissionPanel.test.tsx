import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterAdmissionPanel,
  WARPKEEP_ACCESS_REQUEST_URL
} from '../src/components/auth/FarcasterAdmissionPanel';
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
  it('renders the exact denied copy with a secure Farcaster request-access link', () => {
    const onBackToMenu = vi.fn();
    const onCheckAgain = vi.fn();
    const onSignOut = vi.fn();
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onBackToMenu={onBackToMenu}
        onCheckAgain={onCheckAgain}
        onSignOut={onSignOut}
        phase="denied"
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.getByText(
      'This Farcaster identity is not yet admitted to the Hegemony frontier.'
    )).not.toBeNull();
    expect(screen.getByText(/Warpkeep is opening as a small, manually admitted alpha/i)).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.queryByText('FID 12345')).toBeNull();

    const requestAccess = screen.getByRole('link', {
      name: 'Open @0xael.eth on Farcaster to request Warpkeep access'
    });
    expect(requestAccess.getAttribute('href')).toBe(WARPKEEP_ACCESS_REQUEST_URL);
    expect(requestAccess.getAttribute('target')).toBe('_blank');
    expect(requestAccess.getAttribute('rel')).toContain('noopener');
    expect(requestAccess.getAttribute('rel')).toContain('noreferrer');
    expect(requestAccess.getAttribute('referrerpolicy')).toBe('no-referrer');

    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    expect(onCheckAgain).toHaveBeenCalledTimes(1);
    expect(onBackToMenu).toHaveBeenCalledTimes(1);
    expect(onSignOut).toHaveBeenCalledTimes(1);
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
    render(
      <FarcasterAdmissionPanel
        identity={identity}
        onBackToMenu={vi.fn()}
        onCheckAgain={vi.fn()}
        onSignOut={vi.fn()}
        phase="awaiting-terms"
      />
    );

    expect(screen.getByRole('heading', { level: 2, name: 'ENTRY AGREEMENT REQUIRED' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Return to Enter Realm and accept the current Alpha Terms and Hegemony Social Contract before Hegemony records open.',
    );
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
