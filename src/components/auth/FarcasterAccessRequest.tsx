import {
  useCallback,
  useLayoutEffect,
  useRef,
  type Ref
} from 'react';

import type { AccessRequestViewState } from '../../farcaster/farcasterAuthTypes';
import { useMiniAppHost } from '../../farcaster/miniapp';
import './FarcasterAccessRequest.css';

export type FarcasterAccessRequestProps = Readonly<{
  state: AccessRequestViewState;
  onRequestAccess: () => boolean;
  onRetryStatus?: () => void;
  onCheckAdmission?: () => void;
  descriptionId?: string;
  primaryActionRef?: Ref<HTMLButtonElement>;
}>;

function formattedRequestTime(requestedAt: number) {
  const date = new Date(requestedAt);
  return Object.freeze({
    iso: date.toISOString(),
    utc: new Intl.DateTimeFormat('en-GB', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC'
    }).format(date)
  });
}

export function accessRequestOwnsPrimaryAction(state: AccessRequestViewState) {
  return state.phase !== 'idle';
}

export function FarcasterAccessRequestMessage({
  state,
  descriptionId
}: Pick<FarcasterAccessRequestProps, 'state' | 'descriptionId'>) {
  if (state.phase === 'idle') return null;
  const visible = state.phase === 'request-available';
  return (
    <p
      aria-hidden={visible ? undefined : true}
      className={`farcaster-auth-panel__instruction farcaster-access-request__instruction${
        visible ? '' : ' farcaster-access-request__instruction--reserved'
      }`}
      id={descriptionId}
    >
      Request access for manual review. Requesting access does not grant entry or reserve a castle.
    </p>
  );
}

function assignButtonRef(
  reference: Ref<HTMLButtonElement> | undefined,
  element: HTMLButtonElement | null
) {
  if (typeof reference === 'function') {
    reference(element);
  } else if (reference) {
    reference.current = element;
  }
}

export function FarcasterAccessRequestAction({
  state,
  onRequestAccess,
  onRetryStatus,
  onCheckAdmission,
  descriptionId,
  primaryActionRef
}: FarcasterAccessRequestProps) {
  const { haptics } = useMiniAppHost();
  const regionRef = useRef<HTMLDivElement>(null);
  const previousPhaseRef = useRef(state.phase);
  const handleRequestActivation = useCallback(() => {
    if (onRequestAccess() === true) {
      void haptics.impactOccurred('light');
    }
  }, [haptics, onRequestAccess]);

  useLayoutEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = state.phase;
    if (
      (
        state.phase === 'submitting'
        && (
          previousPhase === 'request-available'
          || previousPhase === 'definitive-failure'
        )
      )
      || (
        state.phase === 'loading-status'
        && previousPhase === 'status-unavailable'
      )
    ) {
      regionRef.current?.focus({ preventScroll: true });
    }
  }, [state.phase]);

  if (state.phase === 'idle') return null;

  const busy = state.phase === 'loading-status'
    || state.phase === 'submitting'
    || state.phase === 'verifying-ambiguous-result';
  const interactive = state.phase === 'request-available'
    || state.phase === 'definitive-failure'
    || state.phase === 'status-unavailable'
    || state.phase === 'request-received'
    || state.phase === 'already-requested'
    || state.phase === 'already-admitted';

  let content;
  if (state.phase === 'request-available') {
    content = (
      <button
        aria-describedby={descriptionId}
        className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
        data-warpkeep-sfx="none"
        onClick={handleRequestActivation}
        ref={(element) => assignButtonRef(primaryActionRef, element)}
        type="button"
      >
        REQUEST ACCESS
      </button>
    );
  } else if (state.phase === 'loading-status') {
    content = (
      <div className="farcaster-access-request__status-copy">
        <i aria-hidden="true" className="farcaster-access-request__spinner" />
        <strong>CHECKING REQUEST STATUS</strong>
        <span>Confirming whether this identity already has a request on record…</span>
      </div>
    );
  } else if (state.phase === 'submitting') {
    content = (
      <div className="farcaster-access-request__status-copy">
        <i aria-hidden="true" className="farcaster-access-request__spinner" />
        <strong>REQUEST SENT</strong>
        <span>Confirming with the Hegemony records…</span>
      </div>
    );
  } else if (state.phase === 'verifying-ambiguous-result') {
    content = (
      <div className="farcaster-access-request__status-copy">
        <i aria-hidden="true" className="farcaster-access-request__spinner" />
        <strong>VERIFYING REQUEST</strong>
        <span>The response was interrupted. Warpkeep is checking whether your request was recorded.</span>
      </div>
    );
  } else if (
    state.phase === 'request-received'
    || state.phase === 'already-requested'
  ) {
    const time = formattedRequestTime(state.requestedAt);
    content = (
      <>
        <div className="farcaster-access-request__status-copy">
          <i aria-hidden="true" className="farcaster-access-request__seal"><span>✓</span></i>
          <strong>REQUEST RECEIVED</strong>
          <span>
            Recorded{' '}
            <time dateTime={time.iso}>
              {time.utc} UTC
            </time>
          </span>
          <span>Access is reviewed manually.</span>
        </div>
        {onCheckAdmission ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
            onClick={onCheckAdmission}
            ref={(element) => assignButtonRef(primaryActionRef, element)}
            type="button"
          >
            CHECK AGAIN
          </button>
        ) : null}
      </>
    );
  } else if (state.phase === 'already-admitted') {
    content = (
      <>
        <div className="farcaster-access-request__status-copy">
          <i aria-hidden="true" className="farcaster-access-request__seal"><span>✓</span></i>
          <strong>ACCESS GRANTED</strong>
          <span>Your admission is active. Check admission to continue into the Realm.</span>
        </div>
        {onCheckAdmission ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
            onClick={onCheckAdmission}
            ref={(element) => assignButtonRef(primaryActionRef, element)}
            type="button"
          >
            CHECK AGAIN
          </button>
        ) : null}
      </>
    );
  } else if (state.phase === 'definitive-failure') {
    content = (
      <>
        <div className="farcaster-access-request__status-copy farcaster-access-request__status-copy--failure">
          <i aria-hidden="true" className="farcaster-access-request__seal"><span>!</span></i>
          <strong>REQUEST NOT SENT</strong>
          <span>This attempt did not record an access request. Wait a moment, then try again.</span>
        </div>
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--primary"
          data-warpkeep-sfx="none"
          onClick={handleRequestActivation}
          ref={(element) => assignButtonRef(primaryActionRef, element)}
          type="button"
        >
          TRY AGAIN
        </button>
      </>
    );
  } else {
    const afterSubmission = state.context === 'post-submission';
    content = (
      <>
        <div className="farcaster-access-request__status-copy farcaster-access-request__status-copy--unavailable">
          <i aria-hidden="true" className="farcaster-access-request__seal"><span>?</span></i>
          <strong>REQUEST STATUS UNAVAILABLE</strong>
          <span>
            {afterSubmission
              ? 'Warpkeep could not confirm the interrupted response. Your request remains sealed and will not be sent again.'
              : 'Warpkeep could not confirm whether a request is already on record.'}
          </span>
        </div>
        {onRetryStatus ? (
          <button
            className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary"
            onClick={onRetryStatus}
            ref={(element) => assignButtonRef(primaryActionRef, element)}
            type="button"
          >
            CHECK STATUS
          </button>
        ) : null}
      </>
    );
  }

  return (
    <div
      aria-atomic="true"
      aria-busy={busy || undefined}
      aria-live="polite"
      className={`farcaster-access-request farcaster-access-request--${state.phase}`}
      data-access-request-phase={state.phase}
      ref={regionRef}
      tabIndex={interactive ? undefined : -1}
    >
      {content}
    </div>
  );
}
