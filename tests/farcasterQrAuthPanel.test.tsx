import { createRef } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  FarcasterIdentityBadge,
  getFarcasterIdentityMonogram,
  getSafeFarcasterProfileImageUrl
} from '../src/components/auth/FarcasterIdentityBadge';
import {
  FarcasterQrAuthPanel,
  getFarcasterAuthPresentation,
  getSafeFarcasterChannelUrl,
  type FarcasterQrAuthPanelProps
} from '../src/components/auth/FarcasterQrAuthPanel';
import type { VerifiedFarcasterIdentity } from '../src/farcaster/farcasterAuthTypes';

const verifiedIdentity: VerifiedFarcasterIdentity = {
  fid: 12_345,
  username: 'keeper',
  displayName: 'The Keeper',
  pfpUrl: 'https://images.example/keeper.png',
  custody: '0x1234',
  verifications: [],
  authMethod: 'authAddress',
  verifiedAt: 1_750_000_000_000
};

type RenderPanelProps = Pick<FarcasterQrAuthPanelProps, 'phase'>
  & Partial<Omit<FarcasterQrAuthPanelProps, 'phase'>>;

function renderPanel(props: RenderPanelProps) {
  const callbacks = {
    onCancel: vi.fn(),
    onRetry: vi.fn(),
    onBackToMenu: vi.fn(),
    onCheckAdmission: vi.fn(),
    onEnterRealm: vi.fn(),
    onPrepareQrCode: vi.fn(),
    onRememberDeviceChange: vi.fn(),
    onSignOut: vi.fn()
  };

  const result = render(
    <FarcasterQrAuthPanel
      channelUrl={props.channelUrl}
      className={props.className}
      errorMessage={props.errorMessage}
      headingRef={props.headingRef}
      identity={props.identity}
      onBackToMenu={props.onBackToMenu ?? callbacks.onBackToMenu}
      onCancel={props.onCancel ?? callbacks.onCancel}
      onCheckAdmission={props.onCheckAdmission ?? callbacks.onCheckAdmission}
      onEnterRealm={props.onEnterRealm ?? callbacks.onEnterRealm}
      onPrepareQrCode={props.onPrepareQrCode ?? callbacks.onPrepareQrCode}
      onPresentationReady={props.onPresentationReady}
      onRememberDeviceChange={props.onRememberDeviceChange ?? callbacks.onRememberDeviceChange}
      onRetry={props.onRetry ?? callbacks.onRetry}
      onSignOut={props.onSignOut ?? callbacks.onSignOut}
      phase={props.phase}
      primaryActionRef={props.primaryActionRef}
      qr={props.qr}
      assurance={props.assurance}
      rememberDevice={props.rememberDevice}
    />
  );

  return { ...result, callbacks };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('FarcasterQrAuthPanel', () => {
  it('selects presentation by interaction capabilities, never a user agent', () => {
    expect(getFarcasterAuthPresentation({
      width: 1440,
      coarsePointer: false,
      maxTouchPoints: 0
    })).toBe('qr-first');
    expect(getFarcasterAuthPresentation({
      width: 390,
      coarsePointer: true,
      maxTouchPoints: 5
    })).toBe('deep-link-first');
    expect(getFarcasterAuthPresentation({
      width: 390,
      coarsePointer: false,
      maxTouchPoints: 0
    })).toBe('qr-first');
  });

  it('renders an accessible desktop QR flow with instructions, a deep link, and cancellation', () => {
    const channelUrl = 'farcaster://connect?channelToken=ephemeral-secret';
    const qrDataUrl = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22/%3E';
    const { container, callbacks } = renderPanel({
      phase: 'awaiting-approval',
      channelUrl,
      qr: { state: 'ready', dataUrl: qrDataUrl },
      rememberDevice: true
    });

    expect(screen.getByRole('region', { name: 'Farcaster sign-in' })).not.toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'CLAIM YOUR KEEP' })).not.toBeNull();
    const qrImage = screen.getByRole('img', { name: 'Sign in with Farcaster QR code' });
    expect(qrImage.getAttribute('src')).toBe(qrDataUrl);
    expect(screen.getByText(/to bind this realm to your FID/i)).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Waiting for Farcaster approval');

    const deepLink = screen.getByRole('link', { name: 'OPEN IN FARCASTER' });
    expect(deepLink.getAttribute('href')).toBe(channelUrl);
    expect(container.textContent).not.toContain('ephemeral-secret');

    const remember = screen.getByRole('checkbox', { name: 'Keep me signed in on this device' });
    expect((remember as HTMLInputElement).checked).toBe(true);
    fireEvent.click(remember);
    expect(callbacks.onRememberDeviceChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    expect(callbacks.onCancel).toHaveBeenCalledTimes(1);
  });

  it('prepares a QR lazily for QR-first presentation when a channel is ready', () => {
    const { callbacks } = renderPanel({
      phase: 'awaiting-approval',
      channelUrl: 'farcaster://connect?channelToken=ephemeral-secret',
      qr: { state: 'not-requested' }
    });

    expect(callbacks.onPrepareQrCode).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
    expect(screen.getByText('Preparing QR code')).not.toBeNull();
  });

  it('keeps a mobile player on the deep-link path until they explicitly request a QR', () => {
    const originalInnerWidth = Object.getOwnPropertyDescriptor(window, 'innerWidth');
    const originalMaxTouchPoints = Object.getOwnPropertyDescriptor(navigator, 'maxTouchPoints');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(navigator, 'maxTouchPoints', { configurable: true, value: 5 });
    const matchMedia = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMedia);

    try {
      const { callbacks } = renderPanel({
        phase: 'awaiting-approval',
        channelUrl: 'farcaster://connect?channelToken=ephemeral-secret',
        qr: { state: 'not-requested' }
      });

      expect(screen.getByRole('region', { name: 'Farcaster sign-in' })
        .getAttribute('data-presentation')).toBe('deep-link-first');
      expect(screen.queryByRole('img', { name: 'Sign in with Farcaster QR code' })).toBeNull();
      expect(callbacks.onPrepareQrCode).not.toHaveBeenCalled();
      expect(screen.getByRole('link', { name: 'OPEN FARCASTER' })
        .getAttribute('href')).toBe('farcaster://connect?channelToken=ephemeral-secret');

      fireEvent.click(screen.getByRole('button', { name: 'SHOW QR INSTEAD' }));
      expect(callbacks.onPrepareQrCode).toHaveBeenCalledTimes(1);
      expect(screen.getByText('Preparing QR code')).not.toBeNull();
    } finally {
      if (originalInnerWidth) {
        Object.defineProperty(window, 'innerWidth', originalInnerWidth);
      }
      if (originalMaxTouchPoints) {
        Object.defineProperty(navigator, 'maxTouchPoints', originalMaxTouchPoints);
      }
    }
  });

  it('fails closed for unsafe channel URLs without displaying the URL', () => {
    const unsafeChannelUrl = 'javascript:alert("channel-token")';
    const { container } = renderPanel({
      phase: 'awaiting-approval',
      channelUrl: unsafeChannelUrl,
      qr: { state: 'ready', dataUrl: 'data:image/png;base64,AA==' }
    });

    expect(screen.queryByRole('link', { name: 'OPEN IN FARCASTER' })).toBeNull();
    expect(container.textContent).not.toContain(unsafeChannelUrl);
    expect(getSafeFarcasterChannelUrl(unsafeChannelUrl)).toBeUndefined();
    expect(getSafeFarcasterChannelUrl(
      'https://attacker.example/~/siwf?channelToken=ephemeral-secret'
    )).toBeUndefined();
    expect(getSafeFarcasterChannelUrl(
      'https://farcaster.xyz/~/siwf?channelToken=ephemeral-secret'
    )).toBe('https://farcaster.xyz/~/siwf?channelToken=ephemeral-secret');
  });

  it('marks only channel creation and verification as busy and exposes meaningful announcements', () => {
    const creating = renderPanel({ phase: 'creating-channel' });
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('status').textContent).toBe('Preparing sign-in');
    expect(screen.getByText('Preparing Farcaster credentials…')).not.toBeNull();
    creating.unmount();

    renderPanel({ phase: 'verifying' });
    expect(screen.getByRole('region').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByRole('heading', { name: 'VERIFYING HEGEMONY RECORD' })).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Verifying signature');
    expect(screen.getByText(/Confirming FID ownership/)).not.toBeNull();
  });

  it('shows the verified FID and PFP while the bridge access check completes', () => {
    const { container } = renderPanel({
      phase: 'verifying',
      identity: verifiedIdentity
    });

    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.getByText('The Keeper')).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
    expect(screen.getByText(/Checking Hegemony realm access/)).not.toBeNull();
    expect(screen.getByText('Securing realm session…')).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe(
      'Farcaster identity confirmed, FID 12345, checking realm access'
    );
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
    const profileImage = container.querySelector('.farcaster-identity-badge__portrait img');
    expect(profileImage?.getAttribute('src')).toBe('https://images.example/keeper.png');
    expect(profileImage?.getAttribute('referrerpolicy')).toBe('no-referrer');
  });

  it('offers retry and menu actions for expired and sanitized error states', () => {
    const expired = renderPanel({ phase: 'expired' });
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO MENU' }));
    expect(expired.callbacks.onRetry).toHaveBeenCalledTimes(1);
    expect(expired.callbacks.onBackToMenu).toHaveBeenCalledTimes(1);
    expired.unmount();

    const errorMessage = '<img src=x onerror=alert(1)> Relay unavailable.';
    const failed = renderPanel({ phase: 'error', errorMessage });
    expect(screen.getByRole('heading', { name: 'AUTHENTICATION FAILED' })).not.toBeNull();
    expect(screen.getByText(errorMessage)).not.toBeNull();
    expect(failed.container.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'TRY AGAIN' }));
    expect(failed.callbacks.onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders a neutral authorized browser session and enters the realm', () => {
    const { callbacks, container } = renderPanel({
      phase: 'authenticated',
      identity: verifiedIdentity,
      assurance: 'live-client-verified',
      rememberDevice: true
    });

    expect(screen.getByRole('heading', { name: 'HEGEMONY RECORD VERIFIED' })).not.toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
    expect(screen.getByText('The Keeper')).not.toBeNull();
    expect(screen.getByText('FID 12345')).not.toBeNull();
    expect(screen.getByText(
      'Your Farcaster identity is active for this browser session.'
    )).not.toBeNull();
    expect(screen.getByRole('status').textContent).toBe('Verified through Farcaster: @keeper, FID 12345');
    expect(screen.queryByRole('checkbox')).toBeNull();
    const profileImage = container.querySelector('.farcaster-identity-badge__portrait img');
    expect(profileImage?.getAttribute('src')).toBe('https://images.example/keeper.png');
    expect(profileImage?.getAttribute('referrerpolicy')).toBe('no-referrer');

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(callbacks.onEnterRealm).toHaveBeenCalledWith(verifiedIdentity);
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    expect(callbacks.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('renders pending admission without a realm action or credential details', () => {
    const { callbacks } = renderPanel({
      phase: 'pending-admission',
      identity: verifiedIdentity
    });

    expect(screen.getByRole('heading', { name: 'ENTRY NOT YET GRANTED' })).not.toBeNull();
    expect(screen.getByText(
      'Your Farcaster identity is verified. Admission to the Hegemony frontier is still pending.'
    )).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'ENTER REALM' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/accessToken|bearer|JWT/i);
    fireEvent.click(screen.getByRole('button', { name: 'CHECK AGAIN' }));
    expect(callbacks.onCheckAdmission).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'SIGN OUT' }));
    expect(callbacks.onSignOut).toHaveBeenCalledTimes(1);
  });

  it('exposes heading and primary-action refs without forcing focus itself', () => {
    const headingRef = createRef<HTMLHeadingElement>();
    const primaryActionRef = createRef<HTMLButtonElement>();
    renderPanel({ phase: 'error', headingRef, primaryActionRef });

    expect(document.activeElement).not.toBe(headingRef.current);
    headingRef.current?.focus();
    expect(document.activeElement).toBe(headingRef.current);
    primaryActionRef.current?.focus();
    expect(document.activeElement).toBe(primaryActionRef.current);
  });
});

describe('FarcasterIdentityBadge', () => {
  it('accepts only credential-free HTTPS profile image URLs', () => {
    expect(getSafeFarcasterProfileImageUrl('https://images.example/pfp.png'))
      .toBe('https://images.example/pfp.png');
    expect(getSafeFarcasterProfileImageUrl('http://images.example/pfp.png'))
      .toBeUndefined();
    expect(getSafeFarcasterProfileImageUrl('https://user:pass@images.example/pfp.png'))
      .toBeUndefined();
    expect(getSafeFarcasterProfileImageUrl('javascript:alert(1)')).toBeUndefined();
    expect(getSafeFarcasterProfileImageUrl('data:image/svg+xml,unsafe')).toBeUndefined();
  });

  it('falls back to a monogram for missing, unsafe, or failed profile images', () => {
    const { container, rerender } = render(
      <FarcasterIdentityBadge identity={verifiedIdentity} />
    );
    const profileImage = container.querySelector('img');
    expect(profileImage?.getAttribute('src')).toBe('https://images.example/keeper.png');
    fireEvent.error(profileImage as HTMLImageElement);
    expect(container.querySelector('.farcaster-identity-badge__monogram')?.textContent).toBe('K');

    const fallbackIdentity: VerifiedFarcasterIdentity = {
      fid: 88,
      displayName: 'Steward',
      pfpUrl: 'javascript:alert(1)',
      verifications: [],
      verifiedAt: verifiedIdentity.verifiedAt
    };
    rerender(<FarcasterIdentityBadge identity={fallbackIdentity} />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.farcaster-identity-badge__monogram')?.textContent).toBe('S');
    expect(getFarcasterIdentityMonogram(fallbackIdentity)).toBe('S');
    expect(screen.queryByText(/^@/)).toBeNull();
    expect(screen.getByText('FID 88')).not.toBeNull();
  });

  it('uses a native button only when the compact badge is interactive', () => {
    const onActivate = vi.fn();
    const { rerender } = render(
      <FarcasterIdentityBadge compact identity={verifiedIdentity} onActivate={onActivate} />
    );

    const identityButton = screen.getByRole('button', {
      name: 'Open Farcaster identity, FID 12345'
    });
    fireEvent.click(identityButton);
    expect(onActivate).toHaveBeenCalledTimes(1);

    rerender(<FarcasterIdentityBadge compact identity={verifiedIdentity} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('@keeper')).not.toBeNull();
  });
});
