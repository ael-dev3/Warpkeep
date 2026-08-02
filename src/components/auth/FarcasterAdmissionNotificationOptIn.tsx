import {
  useCallback,
  useEffect,
  useRef,
  useState
} from 'react';

import { useMiniAppHost } from '../../farcaster/miniapp';
import './FarcasterAdmissionNotificationOptIn.css';

type NotificationOptInState =
  | 'available'
  | 'requesting'
  | 'requested'
  | 'failed';

export function FarcasterAdmissionNotificationOptIn() {
  const {
    actions,
    context,
    hasCapability,
    isMiniApp
  } = useMiniAppHost();
  const [state, setState] = useState<NotificationOptInState>('available');
  const attemptLockedRef = useRef(false);
  const mountedRef = useRef(false);

  const requestNotifications = useCallback(() => {
    if (attemptLockedRef.current || state === 'requested') return;
    attemptLockedRef.current = true;
    setState('requesting');
    const settle = (completed: boolean) => {
      if (mountedRef.current) {
        setState(completed ? 'requested' : 'failed');
      }
      attemptLockedRef.current = false;
    };
    void actions.addMiniApp().then(settle, () => settle(false));
  }, [actions, state]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  if (
    !isMiniApp
    || !context
    || !hasCapability('actions.addMiniApp')
  ) {
    return null;
  }

  if (context.client.notificationsEnabled) {
    return (
      <div
        aria-label="Admission notification preference"
        className="farcaster-access-request__notification farcaster-access-request__notification--enabled"
      >
        <strong>FARCASTER ALERTS REPORTED ON</strong>
        <span>Farcaster reports notifications enabled; delivery is not guaranteed.</span>
      </div>
    );
  }

  if (state === 'requested') {
    return (
      <div
        aria-label="Admission notification preference"
        className="farcaster-access-request__notification farcaster-access-request__notification--requested"
      >
        <strong>NOTIFICATION SETUP OPENED</strong>
        <span>If you enabled notifications in Farcaster, Warpkeep can alert you after admission.</span>
      </div>
    );
  }

  const requesting = state === 'requesting';
  return (
    <div
      aria-label="Admission notification preference"
      className={`farcaster-access-request__notification farcaster-access-request__notification--${state}`}
    >
      <button
        className="farcaster-access-request__notification-action"
        disabled={requesting}
        onClick={requestNotifications}
        type="button"
      >
        {requesting
          ? 'OPENING FARCASTER…'
          : state === 'failed'
            ? 'TRY NOTIFICATION SETUP AGAIN'
            : 'NOTIFY ME WHEN ADMITTED'}
      </button>
      <span>
        {requesting
          ? 'Waiting for Farcaster’s confirmation…'
          : state === 'failed'
            ? 'Warpkeep could not confirm notification setup. Realm access was not affected.'
            : 'Optional. Farcaster will open its native Warpkeep notification prompt.'}
      </span>
    </div>
  );
}
