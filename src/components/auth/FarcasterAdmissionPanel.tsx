import { useEffect, useId, useRef, type Ref } from 'react';

import type { VerifiedFarcasterIdentity } from '../../farcaster/farcasterAuthTypes';
import type { WarpkeepBackendPhase } from '../../spacetime/warpkeepBackendTypes';
import { FarcasterIdentityBadge } from './FarcasterIdentityBadge';
import './FarcasterAdmissionPanel.css';

export const WARPKEEP_ACCESS_REQUEST_URL = 'https://farcaster.xyz/0xael.eth';

export type FarcasterAdmissionPanelProps = Readonly<{
  phase: Exclude<WarpkeepBackendPhase, 'idle' | 'ready'>;
  identity: VerifiedFarcasterIdentity;
  headingRef?: Ref<HTMLHeadingElement>;
  primaryActionRef?: Ref<HTMLButtonElement>;
  onPresentationReady?: () => void;
  onBackToMenu: () => void;
  onCheckAgain: () => void;
  onSignOut: () => void;
}>;

type AdmissionPresentation = Readonly<{
  eyebrow: string;
  title: string;
  liveMessage: string;
}>;

const presentationByPhase: Record<Exclude<WarpkeepBackendPhase, 'idle' | 'ready'>, AdmissionPresentation> = {
  connecting: {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'OPENING HEGEMONY RECORDS',
    liveMessage: 'Opening Hegemony records'
  },
  reconnecting: {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'REOPENING HEGEMONY RECORDS',
    liveMessage: 'Reopening Hegemony records'
  },
  'checking-admission': {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'VERIFYING FRONTIER ACCESS',
    liveMessage: 'Checking frontier access'
  },
  'awaiting-terms': {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'ENTRY AGREEMENT REQUIRED',
    liveMessage: 'Current entry-agreement acceptance is required before realm records open'
  },
  denied: {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'ENTRY NOT YET GRANTED',
    liveMessage: 'Hegemony frontier access is not yet granted'
  },
  bootstrapping: {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'ESTABLISHING YOUR KEEP',
    liveMessage: 'Establishing your frontier keep'
  },
  'accepting-terms': {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'RECORDING ENTRY AGREEMENT',
    liveMessage: 'Recording your current entry-agreement acceptance'
  },
  'opening-realm': {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'OPENING GENESIS 001…',
    liveMessage: 'Opening Genesis 001…'
  },
  error: {
    eyebrow: 'HEGEMONY FRONTIER ACCESS',
    title: 'HEGEMONY RECORDS UNREACHABLE',
    liveMessage: 'The Hegemony records are temporarily unreachable'
  }
};

export function FarcasterAdmissionPanel({
  phase,
  identity,
  headingRef,
  primaryActionRef,
  onPresentationReady,
  onBackToMenu,
  onCheckAgain,
  onSignOut
}: FarcasterAdmissionPanelProps) {
  const headingId = `farcaster-admission-heading-${useId().replace(/:/g, '')}`;
  const localHeadingRef = useRef<HTMLHeadingElement>(null);
  const presentation = presentationByPhase[phase];
  const busy = phase === 'connecting'
    || phase === 'reconnecting'
    || phase === 'checking-admission'
    || phase === 'bootstrapping'
    || phase === 'accepting-terms'
    || phase === 'opening-realm';
  const denied = phase === 'denied';
  const awaitingTerms = phase === 'awaiting-terms';
  const unavailable = phase === 'error';

  useEffect(() => {
    onPresentationReady?.();
  }, [onPresentationReady]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      localHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [phase]);

  return (
    <section
      aria-busy={busy || undefined}
      aria-labelledby={headingId}
      className={`farcaster-auth-panel farcaster-admission-panel farcaster-admission-panel--${phase}`}
      data-phase={phase}
    >
      <div aria-hidden="true" className="farcaster-auth-panel__ornament">
        <span />
        <i />
        <span />
      </div>
      <header className="farcaster-auth-panel__header">
        <p className="farcaster-auth-panel__eyebrow">{presentation.eyebrow}</p>
        <h2
          id={headingId}
          ref={(element) => {
            localHeadingRef.current = element;
            if (typeof headingRef === 'function') {
              headingRef(element);
            } else if (headingRef) {
              headingRef.current = element;
            }
          }}
          tabIndex={-1}
        >
          {presentation.title}
        </h2>
      </header>

      <div className="farcaster-auth-panel__body farcaster-admission-panel__body">
        {busy ? (
          <>
            <i aria-hidden="true" className="farcaster-auth-panel__seal-spinner" />
            <p className="farcaster-admission-panel__status" role="status">
              {presentation.liveMessage}
            </p>
          </>
        ) : null}

        {denied ? (
          <>
            <p className="farcaster-admission-panel__lead" role="status">
              This Farcaster identity is not yet admitted to the Hegemony frontier.
            </p>
            <p className="farcaster-admission-panel__support">
              Warpkeep is opening as a small, manually admitted alpha. DM @0xael.eth on
              {' '}Farcaster to request access.
            </p>
          </>
        ) : null}

        {awaitingTerms ? (
          <p className="farcaster-admission-panel__lead" role="status">
            Return to Enter Realm and accept the current Alpha Terms and Hegemony Social Contract
            before Hegemony records open.
          </p>
        ) : null}

        {unavailable ? (
          <p className="farcaster-admission-panel__lead" role="status">
            The Hegemony records are temporarily unreachable.
          </p>
        ) : null}

        <FarcasterIdentityBadge
          className="farcaster-admission-panel__identity"
          identity={identity}
        />
      </div>

      <div className="farcaster-auth-panel__actions farcaster-admission-panel__actions">
        {denied ? (
          <a
            aria-label="Open @0xael.eth on Farcaster to request Warpkeep access"
            className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
            href={WARPKEEP_ACCESS_REQUEST_URL}
            referrerPolicy="no-referrer"
            rel="noopener noreferrer"
            target="_blank"
          >
            REQUEST ACCESS
          </a>
        ) : null}
        {!busy && !awaitingTerms ? (
          <button
            className={denied ? 'farcaster-auth-panel__action' : 'farcaster-auth-panel__action farcaster-auth-panel__action--primary'}
            onClick={onCheckAgain}
            ref={primaryActionRef}
            type="button"
          >
            CHECK AGAIN
          </button>
        ) : null}
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
          onClick={onBackToMenu}
          type="button"
        >
          BACK TO MENU
        </button>
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
          onClick={onSignOut}
          type="button"
        >
          SIGN OUT
        </button>
      </div>
    </section>
  );
}
