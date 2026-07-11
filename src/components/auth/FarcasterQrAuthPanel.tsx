import { useId, type Ref } from 'react';

import type {
  FarcasterAuthPhase,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import { FarcasterIdentityBadge, normalizeFarcasterUsername } from './FarcasterIdentityBadge';
import './FarcasterQrAuthPanel.css';

export type FarcasterQrAuthPanelProps = {
  phase: Exclude<FarcasterAuthPhase, 'anonymous'>;
  qrDataUrl?: string;
  channelUrl?: string;
  identity?: VerifiedFarcasterIdentity;
  errorMessage?: string;
  className?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  primaryActionRef?: Ref<HTMLButtonElement>;
  onCancel: () => void;
  onRetry: () => void;
  onBackToMenu: () => void;
  onEnterRealm: (identity: VerifiedFarcasterIdentity) => void;
  onSignOut: () => void;
};

type PanelHeading = {
  eyebrow: string;
  title: string;
};

const panelHeadings: Record<Exclude<FarcasterAuthPhase, 'anonymous'>, PanelHeading> = {
  'creating-channel': {
    eyebrow: 'FARCASTER SIGN-IN',
    title: 'CLAIM YOUR KEEP'
  },
  'awaiting-approval': {
    eyebrow: 'FARCASTER SIGN-IN',
    title: 'CLAIM YOUR KEEP'
  },
  verifying: {
    eyebrow: 'SIGNED RECORD RECEIVED',
    title: 'VERIFYING HEGEMONY RECORD'
  },
  authenticated: {
    eyebrow: 'FID BOUND TO THIS SESSION',
    title: 'HEGEMONY RECORD VERIFIED'
  },
  expired: {
    eyebrow: 'CHANNEL CLOSED',
    title: 'AUTHENTICATION EXPIRED'
  },
  error: {
    eyebrow: 'RELAY RECORD REJECTED',
    title: 'AUTHENTICATION FAILED'
  }
};

export function getSafeFarcasterChannelUrl(channelUrl: string | undefined) {
  if (!channelUrl) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(channelUrl);
    const channelTokens = parsedUrl.searchParams.getAll('channelToken');
    const isCurrentWebUrl = parsedUrl.protocol === 'https:'
      && parsedUrl.hostname === 'farcaster.xyz'
      && parsedUrl.pathname === '/~/siwf'
      && [...new Set(parsedUrl.searchParams.keys())].length === 1;
    const isLegacyDeepLink = parsedUrl.protocol === 'farcaster:'
      && parsedUrl.hostname === 'connect'
      && (parsedUrl.pathname === '' || parsedUrl.pathname === '/');
    if (
      (isCurrentWebUrl || isLegacyDeepLink)
      && !parsedUrl.username
      && !parsedUrl.password
      && !parsedUrl.port
      && !parsedUrl.hash
      && channelTokens.length === 1
      && channelTokens[0] !== ''
    ) {
      return parsedUrl.toString();
    }
  } catch {
    // The controller validates relay data; presentation still fails closed.
  }

  return undefined;
}

function getLiveAnnouncement(
  phase: Exclude<FarcasterAuthPhase, 'anonymous'>,
  identity: VerifiedFarcasterIdentity | undefined
) {
  switch (phase) {
    case 'creating-channel':
      return 'Preparing sign-in';
    case 'awaiting-approval':
      return 'Waiting for Farcaster approval';
    case 'verifying':
      return 'Verifying signature';
    case 'authenticated': {
      if (!identity) {
        return 'Farcaster identity verified';
      }
      const username = normalizeFarcasterUsername(identity.username);
      return `Signed in${username ? ` as ${username}` : ''}, FID ${identity.fid}`;
    }
    case 'expired':
      return 'Authentication expired';
    case 'error':
      return 'Authentication failed';
  }
}

export function FarcasterQrAuthPanel({
  phase,
  qrDataUrl,
  channelUrl,
  identity,
  errorMessage,
  className,
  headingRef,
  primaryActionRef,
  onCancel,
  onRetry,
  onBackToMenu,
  onEnterRealm,
  onSignOut
}: FarcasterQrAuthPanelProps) {
  const instanceId = useId();
  const headingId = `farcaster-auth-heading-${instanceId.replace(/:/g, '')}`;
  const safeChannelUrl = getSafeFarcasterChannelUrl(channelUrl);
  const heading = panelHeadings[phase];
  const isBusy = phase === 'creating-channel' || phase === 'verifying';
  const rootClassName = [
    'farcaster-auth-panel',
    `farcaster-auth-panel--${phase}`,
    className
  ].filter(Boolean).join(' ');

  return (
    <section
      aria-busy={isBusy}
      aria-label="Farcaster sign-in"
      className={rootClassName}
      data-phase={phase}
    >
      <div aria-hidden="true" className="farcaster-auth-panel__ornament">
        <span />
        <i />
        <span />
      </div>

      <header className="farcaster-auth-panel__header">
        <p className="farcaster-auth-panel__eyebrow">{heading.eyebrow}</p>
        <h2 id={headingId} ref={headingRef} tabIndex={-1}>{heading.title}</h2>
      </header>

      <p aria-live="polite" className="farcaster-auth-panel__live-region" role="status">
        {getLiveAnnouncement(phase, identity)}
      </p>

      {phase === 'creating-channel' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
          <span aria-hidden="true" className="farcaster-auth-panel__seal-spinner" />
          <p className="farcaster-auth-panel__lead">Preparing Farcaster credentials…</p>
          <div className="farcaster-auth-panel__actions farcaster-auth-panel__actions--quiet">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
              onClick={onCancel}
              ref={primaryActionRef}
              type="button"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'awaiting-approval' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--awaiting">
          <div className="farcaster-auth-panel__qr-frame">
            {qrDataUrl ? (
              <img
                alt="Sign in with Farcaster QR code"
                className="farcaster-auth-panel__qr"
                decoding="async"
                src={qrDataUrl}
              />
            ) : (
              <span className="farcaster-auth-panel__qr-unavailable">QR code unavailable</span>
            )}
          </div>
          <p className="farcaster-auth-panel__instruction">
            Scan with Farcaster<br />
            <span>to bind this realm to your FID.</span>
          </p>
          <p className="farcaster-auth-panel__waiting">
            <span aria-hidden="true" />
            Awaiting approval…
          </p>
          <div className="farcaster-auth-panel__actions">
            {safeChannelUrl ? (
              <a
                className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
                href={safeChannelUrl}
                referrerPolicy="no-referrer"
                rel="noreferrer"
              >
                OPEN IN FARCASTER
              </a>
            ) : null}
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
              onClick={onCancel}
              ref={primaryActionRef}
              type="button"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
          <span aria-hidden="true" className="farcaster-auth-panel__seal-spinner" />
          <p className="farcaster-auth-panel__lead">
            The Farcaster signature has been received.<br />
            <span>Confirming FID ownership…</span>
          </p>
          <div className="farcaster-auth-panel__actions farcaster-auth-panel__actions--quiet">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
              onClick={onCancel}
              ref={primaryActionRef}
              type="button"
            >
              CANCEL
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'authenticated' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--authenticated">
          {identity ? <FarcasterIdentityBadge identity={identity} /> : null}
          <p className="farcaster-auth-panel__lead">Your identity is recognized by the realm.</p>
          <div className="farcaster-auth-panel__actions">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
              disabled={!identity}
              onClick={() => {
                if (identity) {
                  onEnterRealm(identity);
                }
              }}
              ref={primaryActionRef}
              type="button"
            >
              ENTER REALM
            </button>
            <button className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary" onClick={onSignOut} type="button">
              SIGN OUT
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'expired' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
          <p className="farcaster-auth-panel__lead">
            The Farcaster request was not approved in time.
          </p>
          <div className="farcaster-auth-panel__actions">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
              onClick={onRetry}
              ref={primaryActionRef}
              type="button"
            >
              GENERATE NEW QR
            </button>
            <button className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary" onClick={onBackToMenu} type="button">
              BACK TO MENU
            </button>
          </div>
        </div>
      ) : null}

      {phase === 'error' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
          <p className="farcaster-auth-panel__lead">
            {errorMessage?.trim() || 'The relay could not verify this request.'}
          </p>
          <div className="farcaster-auth-panel__actions">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
              onClick={onRetry}
              ref={primaryActionRef}
              type="button"
            >
              TRY AGAIN
            </button>
            <button className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary" onClick={onBackToMenu} type="button">
              BACK TO MENU
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
