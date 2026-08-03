import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  type Ref
} from 'react';

import type { FarcasterAdmissionCheckViewState } from '../../farcaster/farcasterAuthTypes';
import { useMiniAppHost } from '../../farcaster/miniapp';
import './FarcasterAdmissionCheck.css';

export const IDLE_ADMISSION_CHECK: FarcasterAdmissionCheckViewState = Object.freeze({
  phase: 'idle'
});

export type FarcasterAdmissionCheckActionProps = Readonly<{
  state?: FarcasterAdmissionCheckViewState;
  onCheckAdmission: () => boolean;
  primaryActionRef?: Ref<HTMLButtonElement>;
}>;

export function useFarcasterAdmissionCheckResultHaptic(
  state: FarcasterAdmissionCheckViewState
) {
  const { haptics } = useMiniAppHost();
  const previousPhaseRef = useRef(state.phase);

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = state.phase;
    if (previousPhase === 'checking' && state.phase === 'granted') {
      void haptics.notificationOccurred('success');
    }
  }, [haptics, state.phase]);
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

/**
 * Shared presentation for a read-only admission refresh. Its local latch
 * closes before React state or host haptics run; the provider owns the second
 * lock and the coalesced authority flight.
 */
export function FarcasterAdmissionCheckAction({
  state = IDLE_ADMISSION_CHECK,
  onCheckAdmission,
  primaryActionRef
}: FarcasterAdmissionCheckActionProps) {
  const { haptics } = useMiniAppHost();
  const activationLockedRef = useRef(false);
  const checking = state.phase === 'checking';

  useLayoutEffect(() => {
    if (!checking) activationLockedRef.current = false;
  }, [checking]);

  const activate = useCallback(() => {
    if (activationLockedRef.current) return;
    activationLockedRef.current = true;
    if (onCheckAdmission() === true) {
      void haptics.impactOccurred('light');
      return;
    }
    activationLockedRef.current = false;
  }, [haptics, onCheckAdmission]);

  const outcome = state.phase === 'checking'
    ? (
        <span className="farcaster-admission-check__outcome">
          <span>Confirming your current Hegemony access.</span>
        </span>
      )
    : state.phase === 'still-pending'
    ? (
        <span className="farcaster-admission-check__outcome">
          <strong>STILL PENDING</strong>
          <span>Checked just now. Your original request remains on record.</span>
        </span>
      )
      : state.phase === 'temporary-error'
        ? (
          <span className="farcaster-admission-check__outcome farcaster-admission-check__outcome--warning">
            <strong>COULD NOT CHECK ADMISSION</strong>
            <span>Your access request is still recorded. Try again in a moment.</span>
          </span>
        )
      : state.phase === 'identity-changed'
        ? (
            <span className="farcaster-admission-check__outcome farcaster-admission-check__outcome--warning">
              <strong>FARCASTER ACCOUNT CHANGED</strong>
              <span>Previous access presentation was cleared. Check this account when ready.</span>
            </span>
          )
        : state.phase === 'granted'
          ? (
              <span className="farcaster-admission-check__outcome farcaster-admission-check__outcome--granted">
                <strong>ACCESS GRANTED</strong>
                <span>Opening the Realm with the verified admission record…</span>
              </span>
            )
          : null;
  const announcement = state.phase === 'checking'
    ? 'Checking admission'
    : state.phase === 'still-pending'
      ? 'Admission is still pending. Checked just now.'
      : state.phase === 'temporary-error'
        ? 'Could not check admission. Your recorded request has not changed.'
        : state.phase === 'identity-changed'
          ? 'Farcaster account changed. Previous access presentation was cleared.'
          : state.phase === 'granted'
            ? 'Access granted. Opening the Realm.'
            : '';

  return (
    <div
      aria-busy={checking || undefined}
      className={`farcaster-admission-check farcaster-admission-check--${state.phase}`}
      data-admission-check-phase={state.phase}
    >
      <span
        aria-atomic="true"
        aria-live="polite"
        className="warpkeep-visually-hidden"
        role="status"
      >
        {announcement}
      </span>
      {outcome}
      {state.phase !== 'granted' ? (
        <button
          aria-busy={checking || undefined}
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary farcaster-admission-check__action"
          disabled={checking}
          onClick={activate}
          ref={(element) => assignButtonRef(primaryActionRef, element)}
          type="button"
        >
          {checking ? (
            <>
              <i aria-hidden="true" className="farcaster-admission-check__spinner" />
              <span>CHECKING ADMISSION…</span>
            </>
          ) : state.phase === 'temporary-error' ? 'TRY AGAIN' : 'CHECK ADMISSION'}
        </button>
      ) : null}
    </div>
  );
}
