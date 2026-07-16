import { useEffect, useId, useRef, useState, type Ref } from 'react';

import type {
  FarcasterAuthPhase,
  FarcasterAuthPresentation,
  FarcasterQrState,
  FarcasterSessionAssurance,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import { FarcasterIdentityBadge, normalizeFarcasterUsername } from './FarcasterIdentityBadge';
import './FarcasterQrAuthPanel.css';

export type FarcasterQrAuthPanelProps = {
  phase: Exclude<FarcasterAuthPhase, 'anonymous'>;
  qr?: FarcasterQrState;
  channelUrl?: string;
  identity?: VerifiedFarcasterIdentity;
  assurance?: FarcasterSessionAssurance;
  rememberDevice?: boolean;
  errorMessage?: string;
  className?: string;
  headingRef?: Ref<HTMLHeadingElement>;
  primaryActionRef?: Ref<HTMLButtonElement>;
  onPresentationReady?: () => void;
  onPrepareQrCode?: () => void;
  onCheckAdmission?: () => void;
  onRememberDeviceChange?: (remember: boolean) => void;
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

type PresentationEnvironment = Readonly<{
  width: number;
  coarsePointer: boolean;
  maxTouchPoints: number;
}>;

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
  'pending-admission': {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'ENTRY NOT YET GRANTED'
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

function getPresentationEnvironment(): PresentationEnvironment {
  if (typeof window === 'undefined') {
    return { width: Number.POSITIVE_INFINITY, coarsePointer: false, maxTouchPoints: 0 };
  }

  return {
    width: window.innerWidth,
    coarsePointer: typeof window.matchMedia === 'function'
      && window.matchMedia('(pointer: coarse)').matches,
    maxTouchPoints: navigator.maxTouchPoints ?? 0
  };
}

/**
 * Choose the mobile route from interaction capabilities, never a user-agent
 * string. A narrow coarse/touch display should not be asked to scan itself.
 */
export function getFarcasterAuthPresentation(
  environment: PresentationEnvironment = getPresentationEnvironment()
): FarcasterAuthPresentation {
  const narrowViewport = Number.isFinite(environment.width) && environment.width <= 760;
  const touchCapable = environment.coarsePointer || environment.maxTouchPoints > 0;
  return narrowViewport && touchCapable ? 'deep-link-first' : 'qr-first';
}

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
      && channelUrl === parsedUrl.toString()
    ) {
      // Preserve the validated relay value as-is in the link. The UI never
      // adds navigation, replaces its token, or constructs another URL.
      return channelUrl;
    }
  } catch {
    // The controller validates relay data; presentation still fails closed.
  }

  return undefined;
}

function getLiveAnnouncement(
  phase: Exclude<FarcasterAuthPhase, 'anonymous'>,
  identity: VerifiedFarcasterIdentity | undefined,
  assurance: FarcasterSessionAssurance
) {
  switch (phase) {
    case 'creating-channel':
      return 'Preparing sign-in';
    case 'awaiting-approval':
      return 'Waiting for Farcaster approval';
    case 'verifying':
      return identity
        ? `Farcaster identity confirmed, FID ${identity.fid}, checking realm access`
        : 'Verifying signature';
    case 'pending-admission':
      return identity
        ? `Farcaster identity verified, admission pending, FID ${identity.fid}`
        : 'Farcaster identity verified, admission pending';
    case 'authenticated': {
      if (!identity) {
        return 'Farcaster identity verified';
      }
      const username = normalizeFarcasterUsername(identity.username);
      return `Verified through Farcaster${username ? `: ${username}` : ''}, FID ${identity.fid}`;
    }
    case 'expired':
      return 'Authentication expired';
    case 'error':
      return 'Authentication failed';
  }
}

function QrFrame({ qr }: { qr: FarcasterQrState }) {
  return (
    <div className="farcaster-auth-panel__qr-frame">
      {qr.state === 'ready' ? (
        <img
          alt="Sign in with Farcaster QR code"
          className="farcaster-auth-panel__qr"
          decoding="async"
          src={qr.dataUrl}
        />
      ) : qr.state === 'loading' ? (
        <span aria-label="Preparing QR code" className="farcaster-auth-panel__qr-loading">
          <i aria-hidden="true" className="farcaster-auth-panel__seal-spinner" />
        </span>
      ) : (
        <span className="farcaster-auth-panel__qr-unavailable">
          {qr.state === 'error' ? 'QR code unavailable' : 'Preparing QR code'}
        </span>
      )}
    </div>
  );
}

export function FarcasterQrAuthPanel({
  phase,
  qr = { state: 'not-requested' },
  channelUrl,
  identity,
  assurance = 'live-client-verified',
  rememberDevice = false,
  errorMessage,
  className,
  headingRef,
  primaryActionRef,
  onPresentationReady,
  onPrepareQrCode,
  onCheckAdmission,
  onRememberDeviceChange,
  onCancel,
  onRetry,
  onBackToMenu,
  onEnterRealm,
  onSignOut
}: FarcasterQrAuthPanelProps) {
  const instanceId = useId();
  const headingId = `farcaster-auth-heading-${instanceId.replace(/:/g, '')}`;
  const safeChannelUrl = getSafeFarcasterChannelUrl(channelUrl);
  const [presentation, setPresentation] = useState<FarcasterAuthPresentation>(
    getFarcasterAuthPresentation
  );
  const autoRequestedChannelRef = useRef<string | undefined>(undefined);
  const heading = panelHeadings[phase];
  // Let the post-verification live-region update announce immediately instead
  // of being held until the bridge check finishes.
  const isBusy = phase === 'creating-channel'
    || (phase === 'verifying' && !identity);
  const rootClassName = [
    'farcaster-auth-panel',
    `farcaster-auth-panel--${phase}`,
    `farcaster-auth-panel--${presentation}`,
    className
  ].filter(Boolean).join(' ');

  useEffect(() => {
    onPresentationReady?.();
  }, [onPresentationReady]);

  useEffect(() => {
    if (
      phase !== 'awaiting-approval'
      || presentation !== 'qr-first'
      || qr.state !== 'not-requested'
      || !channelUrl
      || autoRequestedChannelRef.current === channelUrl
    ) {
      return;
    }
    autoRequestedChannelRef.current = channelUrl;
    onPrepareQrCode?.();
  }, [channelUrl, onPrepareQrCode, phase, presentation, qr.state]);

  useEffect(() => {
    if (phase !== 'awaiting-approval') {
      autoRequestedChannelRef.current = undefined;
    }
  }, [phase]);

  const showQr = () => {
    setPresentation('qr-first');
    if (channelUrl) {
      // The effect that services a desktop QR-first state runs after this
      // render. Mark the handoff first so a mobile fallback request is made
      // exactly once rather than once from the click and again from the effect.
      autoRequestedChannelRef.current = channelUrl;
    }
    onPrepareQrCode?.();
  };

  const showDeepLink = () => setPresentation('deep-link-first');
  const verifiedCopy = 'Your Farcaster identity is active for this browser session.';

  return (
    <section
      aria-busy={isBusy}
      aria-label="Farcaster sign-in"
      className={rootClassName}
      data-phase={phase}
      data-presentation={presentation}
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
        {getLiveAnnouncement(phase, identity, assurance)}
      </p>

      {phase === 'awaiting-approval' ? (
        <label className="farcaster-auth-panel__remember">
          <input
            checked={rememberDevice}
            onChange={(event) => onRememberDeviceChange?.(event.currentTarget.checked)}
            type="checkbox"
          />
          <span>Keep me signed in on this device</span>
        </label>
      ) : null}

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
          {presentation === 'deep-link-first' ? (
            <>
              <div aria-hidden="true" className="farcaster-auth-panel__deep-link-seal">↗</div>
              <p className="farcaster-auth-panel__instruction">
                Continue in Farcaster<br />
                <span>Approve the request there, then return to Warpkeep.</span>
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
                    OPEN FARCASTER
                  </a>
                ) : null}
                <button
                  className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
                  onClick={showQr}
                  type="button"
                >
                  SHOW QR INSTEAD
                </button>
                <button
                  className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
                  onClick={onCancel}
                  ref={primaryActionRef}
                  type="button"
                >
                  CANCEL
                </button>
              </div>
            </>
          ) : (
            <>
              <QrFrame qr={qr} />
              <p className="farcaster-auth-panel__instruction">
                Scan with Farcaster<br />
                <span>to bind this realm to your FID.</span>
              </p>
              {qr.state === 'error' ? (
                <p className="farcaster-auth-panel__lead">Use Farcaster directly, or prepare the QR again.</p>
              ) : null}
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
                {qr.state === 'error' ? (
                  <button
                    className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
                    onClick={onPrepareQrCode}
                    type="button"
                  >
                    TRY QR AGAIN
                  </button>
                ) : null}
                <button
                  className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
                  onClick={showDeepLink}
                  type="button"
                >
                  USE FARCASTER LINK INSTEAD
                </button>
                <button
                  className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
                  onClick={onCancel}
                  ref={primaryActionRef}
                  type="button"
                >
                  CANCEL
                </button>
              </div>
            </>
          )}
        </div>
      ) : null}

      {phase === 'verifying' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
          {identity ? (
            <>
              <FarcasterIdentityBadge identity={identity} />
              <p className="farcaster-auth-panel__lead">
                Farcaster identity confirmed.<br />
                <span>Checking Hegemony realm access…</span>
              </p>
              <p className="farcaster-auth-panel__waiting">
                <span aria-hidden="true" />
                Securing realm session…
              </p>
            </>
          ) : (
            <>
              <span aria-hidden="true" className="farcaster-auth-panel__seal-spinner" />
              <p className="farcaster-auth-panel__lead">
                The Farcaster signature has been received.<br />
                <span>Confirming FID ownership…</span>
              </p>
            </>
          )}
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
          <p className="farcaster-auth-panel__lead">{verifiedCopy}</p>
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

      {phase === 'pending-admission' ? (
        <div className="farcaster-auth-panel__body farcaster-auth-panel__body--authenticated">
          {identity ? <FarcasterIdentityBadge identity={identity} /> : null}
          <p className="farcaster-auth-panel__lead" role="status">
            Your Farcaster identity is verified. Admission to the Hegemony frontier is still pending.
          </p>
          <p className="farcaster-auth-panel__instruction">
            Contact @0xael.eth on Farcaster to request access, then check again.
          </p>
          <div className="farcaster-auth-panel__actions">
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
              onClick={onCheckAdmission}
              ref={primaryActionRef}
              type="button"
            >
              CHECK AGAIN
            </button>
            <button
              className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
              onClick={onSignOut}
              type="button"
            >
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
              TRY AGAIN
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
