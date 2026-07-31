import type { Ref } from 'react';

import type { AccessRequestViewState } from '../../farcaster/farcasterAuthTypes';

export type FarcasterAccessRequestProps = Readonly<{
  state: AccessRequestViewState;
  onRequestAccess: () => void;
  primaryActionRef?: Ref<HTMLButtonElement>;
}>;

function formattedRequestTime(requestedAt: number) {
  const date = new Date(requestedAt);
  return Object.freeze({
    iso: date.toISOString(),
    visible: new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
      timeZoneName: 'short'
    }).format(date)
  });
}

export function accessRequestOwnsPrimaryAction(state: AccessRequestViewState) {
  return state.phase === 'loading'
    || state.phase === 'not-requested'
    || state.phase === 'submitting'
    || state.phase === 'error';
}

function accessRequestAcceptsPrimaryFocus(state: AccessRequestViewState) {
  return state.phase === 'not-requested' || state.phase === 'error';
}

export function FarcasterAccessRequestMessage({
  state
}: Pick<FarcasterAccessRequestProps, 'state'>) {
  if (state.phase === 'idle') return null;
  if (state.phase === 'loading') {
    return (
      <p className="farcaster-auth-panel__instruction" role="status">
        Checking request status…
      </p>
    );
  }
  if (state.phase === 'not-requested') {
    return (
      <p className="farcaster-auth-panel__instruction">
        Warpkeep is a small, manually admitted Alpha. Request access for manual review.
      </p>
    );
  }
  if (state.phase === 'submitting') {
    return (
      <p className="farcaster-auth-panel__instruction" role="status">
        Sending request…
      </p>
    );
  }
  if (state.phase === 'requested') {
    const time = formattedRequestTime(state.requestedAt);
    return (
      <div aria-atomic="true" aria-live="polite">
        <p className="farcaster-auth-panel__instruction">
          <strong>Request received.</strong> Access is reviewed manually and is not guaranteed.
        </p>
        <p className="farcaster-auth-panel__instruction">
          Recorded{' '}
          <time dateTime={time.iso}>{time.visible}</time>.
        </p>
      </div>
    );
  }
  if (state.phase === 'already-admitted') {
    return (
      <p aria-live="polite" className="farcaster-auth-panel__instruction" role="status">
        Access has been granted. Check again to enter.
      </p>
    );
  }
  return (
    <p aria-live="polite" className="farcaster-auth-panel__instruction" role="status">
      We could not confirm an existing request. Request Access will check once more before sending.
    </p>
  );
}

export function FarcasterAccessRequestAction({
  state,
  onRequestAccess,
  primaryActionRef
}: FarcasterAccessRequestProps) {
  if (state.phase === 'idle' || state.phase === 'already-admitted') return null;

  const isLoading = state.phase === 'loading';
  const isSubmitting = state.phase === 'submitting';
  const isRequested = state.phase === 'requested';
  const disabled = isLoading || isSubmitting || isRequested;
  const label = isLoading
    ? 'CHECKING…'
    : isSubmitting
      ? 'SENDING…'
      : isRequested
        ? 'REQUEST RECEIVED'
        : 'REQUEST ACCESS';

  return (
    <button
      aria-label={label.replace('…', '')}
      className={
        accessRequestOwnsPrimaryAction(state)
          ? 'farcaster-auth-panel__action farcaster-auth-panel__action--primary'
          : 'farcaster-auth-panel__action'
      }
      disabled={disabled}
      onClick={onRequestAccess}
      ref={accessRequestAcceptsPrimaryFocus(state) ? primaryActionRef : undefined}
      type="button"
    >
      {label}
    </button>
  );
}
