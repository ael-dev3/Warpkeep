import { useEffect, useId, useRef, type Ref } from 'react';

import type {
  AdmissionGrantAcknowledgementViewState,
  AccessRequestViewState,
  FarcasterAdmissionCheckViewState,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import type { WarpkeepBackendPhase } from '../../spacetime/warpkeepBackendTypes';
import {
  accessRequestOwnsPrimaryAction,
  FarcasterAccessRequestAction,
  FarcasterAccessRequestMessage
} from './FarcasterAccessRequest';
import { FarcasterIdentityBadge } from './FarcasterIdentityBadge';
import {
  FarcasterAdmissionCheckAction,
  IDLE_ADMISSION_CHECK
} from './FarcasterAdmissionCheck';
import './FarcasterAdmissionPanel.css';

const IDLE_ACCESS_REQUEST: AccessRequestViewState = Object.freeze({ phase: 'idle' });

export type FarcasterAdmissionPanelProps = Readonly<{
  phase: Exclude<WarpkeepBackendPhase, 'idle' | 'ready'>;
  identity: VerifiedFarcasterIdentity;
  autoFocusHeading?: boolean;
  headingRef?: Ref<HTMLHeadingElement>;
  primaryActionRef?: Ref<HTMLButtonElement>;
  onPresentationReady?: () => void;
  /** Optional outside the ordinary menu flow, including direct Mini App entry. */
  onBackToMenu?: () => void;
  onCheckAgain: () => boolean;
  onReviewTerms?: () => void;
  accessRequest?: AccessRequestViewState;
  admissionCheck?: FarcasterAdmissionCheckViewState;
  onRequestAccess?: () => boolean;
  onRetryAccessRequestStatus?: () => void;
  onSignOut: () => void;
  /** Presentation hint only; admission still comes from the auth/backend state. */
  approvalNotificationLaunch?: boolean;
  admissionGrantAcknowledgement?: AdmissionGrantAcknowledgementViewState;
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
  autoFocusHeading = true,
  headingRef,
  primaryActionRef,
  onPresentationReady,
  onBackToMenu,
  onCheckAgain,
  onReviewTerms,
  accessRequest = IDLE_ACCESS_REQUEST,
  admissionCheck = IDLE_ADMISSION_CHECK,
  onRequestAccess,
  onRetryAccessRequestStatus,
  onSignOut,
  approvalNotificationLaunch = false,
  admissionGrantAcknowledgement = Object.freeze({ phase: 'idle' })
}: FarcasterAdmissionPanelProps) {
  const headingId = `farcaster-admission-heading-${useId().replace(/:/g, '')}`;
  const accessRequestDescriptionId = `${headingId}-access-request-description`;
  const localHeadingRef = useRef<HTMLHeadingElement>(null);
  const defaultPresentation = presentationByPhase[phase];
  const admissionGrantActive = admissionGrantAcknowledgement.phase === 'acknowledging'
    || admissionGrantAcknowledgement.phase === 'finalizing';
  const presentation = admissionGrantActive
    ? Object.freeze({
        eyebrow: 'HEGEMONY FRONTIER ACCESS',
        title: 'FINALIZING HEGEMONY ADMISSION',
        liveMessage: admissionGrantAcknowledgement.phase === 'acknowledging'
          ? 'Confirming this notification with your verified Farcaster identity…'
          : 'Your notification is confirmed. Finalizing Realm access…'
      })
    : approvalNotificationLaunch
    && phase !== 'denied'
    && phase !== 'error'
    ? phase === 'connecting' || phase === 'reconnecting' || phase === 'checking-admission'
      ? Object.freeze({
          eyebrow: 'HEGEMONY FRONTIER ACCESS',
          title: 'CONFIRMING HEGEMONY ADMISSION',
          liveMessage: 'Rechecking your current Warpkeep access…'
        })
      : Object.freeze({
          eyebrow: 'HEGEMONY FRONTIER ACCESS',
          title: 'HEGEMONY ADMISSION APPROVED',
          liveMessage: 'Your active admission has been confirmed.'
        })
    : defaultPresentation;
  const accessRequestBusy = accessRequest.phase === 'loading-status'
    || accessRequest.phase === 'submitting'
    || accessRequest.phase === 'verifying-ambiguous-result';
  const admissionCheckBusy = admissionCheck.phase === 'checking';
  const busy = phase === 'connecting'
    || phase === 'reconnecting'
    || phase === 'checking-admission'
    || phase === 'bootstrapping'
    || phase === 'accepting-terms'
    || phase === 'opening-realm'
    || admissionGrantActive;
  const denied = phase === 'denied';
  const awaitingTerms = phase === 'awaiting-terms';
  const unavailable = phase === 'error';

  useEffect(() => {
    onPresentationReady?.();
  }, [onPresentationReady]);

  useEffect(() => {
    if (!autoFocusHeading) return undefined;
    const frame = window.requestAnimationFrame(() => {
      localHeadingRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [autoFocusHeading, phase]);

  return (
    <section
      aria-busy={busy
        || (phase === 'denied' && (accessRequestBusy || admissionCheckBusy))
        || undefined}
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
            <p className="farcaster-admission-panel__lead">
              {admissionGrantActive
                ? 'Keep Warpkeep open for a moment while the Hegemony completes your admission.'
                : admissionGrantAcknowledgement.phase === 'confirmed-pending'
                  ? 'Your notification was confirmed. Realm access is still being completed; check again shortly.'
                : admissionGrantAcknowledgement.phase === 'awaiting-notification-context'
                  ? 'Warpkeep found the approval link, but Farcaster did not provide its matching launch context. Close this view and reopen the exact admission notification.'
                : admissionGrantAcknowledgement.phase === 'stale'
                  ? 'This approval invitation is no longer current. Your latest access request remains unchanged.'
                  : admissionGrantAcknowledgement.phase === 'temporary-error'
                    ? 'Warpkeep could not confirm this approval invitation. Reopen the Farcaster notification to try again safely.'
                    : approvalNotificationLaunch
                ? 'Warpkeep has not yet confirmed active admission. Check again in a moment.'
                : 'This Farcaster identity is not yet admitted to the Hegemony frontier.'}
            </p>
            {!admissionGrantActive ? (
              <FarcasterAccessRequestMessage
                descriptionId={accessRequestDescriptionId}
                state={accessRequest}
              />
            ) : null}
          </>
        ) : null}

        {awaitingTerms ? (
          <p className="farcaster-admission-panel__lead" role="status">
            Accept the current Alpha Terms and Hegemony Social Contract before Hegemony records
            open.
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
        {awaitingTerms && onReviewTerms ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
            onClick={onReviewTerms}
            ref={primaryActionRef}
            type="button"
          >
            REVIEW TERMS
          </button>
        ) : null}
        {denied && !admissionGrantActive && onRequestAccess ? (
          <FarcasterAccessRequestAction
            admissionCheck={admissionCheck}
            descriptionId={accessRequestDescriptionId}
            onCheckAdmission={onCheckAgain}
            onRequestAccess={onRequestAccess}
            onRetryStatus={onRetryAccessRequestStatus}
            primaryActionRef={primaryActionRef}
            state={accessRequest}
          />
        ) : null}
        {denied && !admissionGrantActive && !accessRequestOwnsPrimaryAction(accessRequest) ? (
          <FarcasterAdmissionCheckAction
            onCheckAdmission={onCheckAgain}
            primaryActionRef={primaryActionRef}
            state={admissionCheck}
          />
        ) : null}
        {unavailable ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
            onClick={() => {
              onCheckAgain();
            }}
            ref={primaryActionRef}
            type="button"
          >
            TRY AGAIN
          </button>
        ) : null}
        {onBackToMenu ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
            onClick={onBackToMenu}
            type="button"
          >
            BACK TO MENU
          </button>
        ) : null}
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
