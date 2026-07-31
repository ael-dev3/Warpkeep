import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState
} from 'react';

import type {
  AccessRequestViewState,
  FarcasterAuthViewState,
  VerifiedFarcasterIdentity
} from '../../farcaster/farcasterAuthTypes';
import {
  useMiniAppBackNavigation,
  type MiniAppHostState
} from '../../farcaster/miniapp';
import type {
  WarpkeepBackendPhase,
  WarpkeepBackendState
} from '../../spacetime/warpkeepBackendTypes';
import { AlphaParticipationTermsDialog } from '../menu/AlphaParticipationTermsDialog';
import './FarcasterQrAuthPanel.css';
import './FarcasterMiniAppEntryGate.css';

const IDLE_ACCESS_REQUEST: AccessRequestViewState = Object.freeze({ phase: 'idle' });

const FarcasterAdmissionPanel = lazy(async () => {
  const module = await import('./FarcasterAdmissionPanel');
  return { default: module.FarcasterAdmissionPanel };
});

export type FarcasterMiniAppEntryGateProps = Readonly<{
  hostState: MiniAppHostState;
  authState: FarcasterAuthViewState;
  backendState: WarpkeepBackendState;
  accessRequest?: AccessRequestViewState;
  onAcceptTerms: () => void;
  onCancelTermsAttempt: () => void;
  onCheckBackend: () => void;
  onRefreshSession: () => void;
  onRequestAccess?: () => void;
  onRetryAuthentication: () => void;
  onSignOut: () => void;
}>;

type LaunchStatus = Readonly<{
  title: string;
  message: string;
  busy: boolean;
  action?: Readonly<{
    label: string;
    run: () => void;
  }>;
}>;

const ADMISSION_LOADING_STATUS: LaunchStatus = Object.freeze({
  title: 'OPENING WARPKEEP',
  message: 'Checking frontier access',
  busy: true
});

function admissionPanelPhase(
  phase: WarpkeepBackendPhase
): Exclude<WarpkeepBackendPhase, 'idle' | 'ready'> {
  if (phase === 'idle') return 'connecting';
  if (phase === 'ready') return 'opening-realm';
  return phase;
}

function authenticatedIdentity(
  authState: FarcasterAuthViewState,
  backendState: WarpkeepBackendState
): VerifiedFarcasterIdentity | undefined {
  if (
    authState.phase === 'authenticated'
    || authState.phase === 'pending-admission'
  ) return authState.identity;
  return backendState.identity;
}

function launchStatus(
  hostState: MiniAppHostState,
  authState: FarcasterAuthViewState,
  onRetryAuthentication: () => void
): LaunchStatus {
  if (hostState === 'detecting') {
    return Object.freeze({
      title: 'OPENING WARPKEEP',
      message: 'Preparing the Realm inside Farcaster',
      busy: true
    });
  }
  if (authState.phase === 'anonymous') {
    return Object.freeze({
      title: 'ENTER THE REALM',
      message: 'Continue with your Farcaster account',
      busy: false,
      action: Object.freeze({ label: 'CONTINUE WITH FARCASTER', run: onRetryAuthentication })
    });
  }
  if (authState.phase === 'error' || authState.phase === 'expired') {
    return Object.freeze({
      title: 'FARCASTER SIGN-IN UNAVAILABLE',
      message: 'Your identity could not be verified safely. Try again when ready.',
      busy: false,
      action: Object.freeze({ label: 'TRY AGAIN', run: onRetryAuthentication })
    });
  }
  return Object.freeze({
    title: 'VERIFYING FARCASTER',
    message: 'Checking identity and frontier access',
    busy: true
  });
}

function MiniAppLaunchStatusPanel({ status }: Readonly<{ status: LaunchStatus }>) {
  const headingId = `warpkeep-miniapp-entry-${useId().replace(/:/g, '')}`;
  return (
    <section
      aria-busy={status.busy || undefined}
      aria-labelledby={headingId}
      className="farcaster-auth-panel farcaster-miniapp-entry__status"
    >
      <div aria-hidden="true" className="farcaster-auth-panel__ornament">
        <span />
        <i />
        <span />
      </div>
      <header className="farcaster-auth-panel__header">
        <p className="farcaster-auth-panel__eyebrow">HEGEMONY FRONTIER ACCESS</p>
        <h2 id={headingId}>{status.title}</h2>
      </header>
      <div className="farcaster-auth-panel__body farcaster-auth-panel__body--centered">
        {status.busy ? <i aria-hidden="true" className="farcaster-auth-panel__seal-spinner" /> : null}
        <p className="farcaster-miniapp-entry__message" role="status">
          {status.message}
        </p>
      </div>
      {status.action ? (
        <div className="farcaster-auth-panel__actions">
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
            onClick={status.action.run}
            type="button"
          >
            {status.action.label}
          </button>
        </div>
      ) : null}
    </section>
  );
}

/**
 * One-purpose Mini App launch surface. It never decides identity, admission,
 * agreement status, or Realm readiness; it presents the first unmet
 * server-owned requirement and leaves every transition to the existing auth
 * bridge and SpacetimeDB providers.
 */
export function FarcasterMiniAppEntryGate({
  hostState,
  authState,
  backendState,
  accessRequest = IDLE_ACCESS_REQUEST,
  onAcceptTerms,
  onCancelTermsAttempt,
  onCheckBackend,
  onRefreshSession,
  onRequestAccess,
  onRetryAuthentication,
  onSignOut
}: FarcasterMiniAppEntryGateProps) {
  const [termsDismissed, setTermsDismissed] = useState(false);
  const reviewTermsButtonRef = useRef<HTMLButtonElement>(null);
  const restoreReviewTermsFocusRef = useRef(false);
  const identity = authenticatedIdentity(authState, backendState);
  const awaitingTerms = authState.phase === 'authenticated'
    && backendState.phase === 'awaiting-terms';
  const termsOpen = awaitingTerms && !termsDismissed;
  const dismissTerms = useCallback(() => {
    restoreReviewTermsFocusRef.current = true;
    onCancelTermsAttempt();
    setTermsDismissed(true);
  }, [onCancelTermsAttempt]);
  const reviewTerms = useCallback(() => {
    restoreReviewTermsFocusRef.current = false;
    setTermsDismissed(false);
  }, []);

  // The direct gate is a Mini App root, but Terms is a nested surface. Let the
  // host Back control dismiss only that dialog without escaping Warpkeep.
  useMiniAppBackNavigation(
    termsOpen ? 1 : 0,
    dismissTerms
  );

  useEffect(() => {
    if (!awaitingTerms) setTermsDismissed(false);
  }, [awaitingTerms]);

  useEffect(() => {
    if (
      !awaitingTerms
      || !termsDismissed
      || !restoreReviewTermsFocusRef.current
    ) return undefined;

    restoreReviewTermsFocusRef.current = false;
    const frame = window.requestAnimationFrame(() => {
      reviewTermsButtonRef.current?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [awaitingTerms, termsDismissed]);

  let content;
  if (authState.phase === 'pending-admission') {
    content = (
      <FarcasterAdmissionPanel
        accessRequest={accessRequest}
        identity={authState.identity}
        onCheckAgain={onRefreshSession}
        onRequestAccess={onRequestAccess}
        onSignOut={onSignOut}
        phase="denied"
      />
    );
  } else if (authState.phase === 'authenticated' && identity) {
    content = (
      <FarcasterAdmissionPanel
        accessRequest={accessRequest}
        autoFocusHeading={!awaitingTerms}
        identity={identity}
        onCheckAgain={onCheckBackend}
        onRequestAccess={onRequestAccess}
        onReviewTerms={awaitingTerms ? reviewTerms : undefined}
        primaryActionRef={awaitingTerms ? reviewTermsButtonRef : undefined}
        onSignOut={onSignOut}
        phase={admissionPanelPhase(backendState.phase)}
      />
    );
  } else {
    content = (
      <MiniAppLaunchStatusPanel
        status={launchStatus(hostState, authState, onRetryAuthentication)}
      />
    );
  }

  return (
    <main
      aria-label="Warpkeep Mini App entry"
      className="farcaster-miniapp-entry"
      data-auth-phase={authState.phase}
      data-backend-phase={backendState.phase}
      data-host-state={hostState}
    >
      <div aria-hidden="true" className="farcaster-miniapp-entry__atmosphere" />
      <div
        aria-hidden={termsOpen || undefined}
        className="farcaster-miniapp-entry__content"
        inert={termsOpen ? true : undefined}
      >
        <Suspense fallback={<MiniAppLaunchStatusPanel status={ADMISSION_LOADING_STATUS} />}>
          {content}
        </Suspense>
      </div>
      {termsOpen ? (
        <AlphaParticipationTermsDialog
          continueLabel="CONTINUE TO REALM"
          onCancel={dismissTerms}
          onContinue={onAcceptTerms}
        />
      ) : null}
    </main>
  );
}
