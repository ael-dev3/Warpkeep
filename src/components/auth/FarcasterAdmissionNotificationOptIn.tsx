import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState
} from 'react';

import {
  useMiniAppHost,
  type MiniAppNotificationPresentation
} from '../../farcaster/miniapp';
import { readWarpkeepRuntimeConfig } from '../../spacetime/warpkeepConfig';
import './FarcasterAdmissionNotificationOptIn.css';

export type FarcasterAdmissionNotificationOptInProps = Readonly<{
  /** Test/review injection. Production remains controlled by the build gate. */
  enabled?: boolean;
}>;

function statusIsSettled(state: MiniAppNotificationPresentation) {
  return state !== 'requesting';
}

export function FarcasterAdmissionNotificationOptIn({
  enabled = readWarpkeepRuntimeConfig().admissionNotificationsEnabled === true
}: FarcasterAdmissionNotificationOptInProps) {
  const host = useMiniAppHost();
  const [dismissed, setDismissed] = useState(false);
  const activationLockedRef = useRef(false);
  const statusRef = useRef<HTMLDivElement>(null);
  const previousPresentationRef = useRef(host.notificationPresentation);

  const activate = useCallback(() => {
    if (activationLockedRef.current) return;
    activationLockedRef.current = true;
    void host.haptics.impactOccurred('light');
    void host.actions.addMiniApp().catch(() => {
      // The adapter is specified to settle safely, but an injected host must
      // not leave the local activation permanently locked.
      activationLockedRef.current = false;
    });
  }, [host.actions, host.haptics]);

  useLayoutEffect(() => {
    const previous = previousPresentationRef.current;
    previousPresentationRef.current = host.notificationPresentation;
    if (host.notificationPresentation !== 'requesting') {
      activationLockedRef.current = false;
    }
    if (
      previous === host.notificationPresentation
      || host.notificationPresentation === 'requesting'
    ) return;
    statusRef.current?.focus({ preventScroll: true });
  }, [host.notificationPresentation]);

  if (
    !enabled
    || dismissed
    || !host.isMiniApp
    || host.state !== 'miniapp'
    || !host.hasCapability('actions.addMiniApp')
    || host.notificationPresentation === 'unsupported'
  ) {
    return null;
  }

  const presentation = host.notificationPresentation;
  const canDismiss = presentation === 'not-added'
    || presentation === 'rejected'
    || presentation === 'failed';
  const canActivate = presentation === 'not-added'
    || presentation === 'rejected'
    || presentation === 'failed';

  let title = 'GET NOTIFIED WHEN ADMITTED';
  let message = 'Add Warpkeep to Farcaster so the Hegemony can notify you if your petition is accepted.';
  let actionLabel = 'ENABLE ADMISSION ALERTS';
  let detail = 'Optional. This does not affect admission. Farcaster grants permission; Warpkeep keeps the delivery credential private.';

  if (presentation === 'requesting') {
    title = 'OPENING FARCASTER…';
    message = 'Complete the native prompt to add Warpkeep and enable notifications.';
    actionLabel = '';
    detail = 'Your access request remains active.';
  } else if (presentation === 'rejected') {
    title = 'ALERTS NOT ENABLED';
    message = 'Your access request remains active.';
    actionLabel = 'TRY AGAIN';
    detail = 'Notification setup is optional.';
  } else if (presentation === 'invalid-manifest') {
    title = 'NOTIFICATION SETUP UNAVAILABLE';
    message = "Warpkeep's Mini App configuration could not be confirmed.";
    actionLabel = '';
    detail = 'Your access request remains active. Reference: WA-NOTIFY-MANIFEST.';
  } else if (presentation === 'enabled-hint') {
    title = 'ADMISSION ALERTS ENABLED';
    message = 'Farcaster reports approval notifications enabled for Warpkeep.';
    actionLabel = '';
    detail = 'Delivery is not guaranteed. You can disable alerts from Warpkeep settings in Farcaster.';
  } else if (presentation === 'disabled-hint') {
    title = 'NOTIFICATIONS ARE OFF';
    message = 'Enable notifications for Warpkeep from its settings in your Farcaster client.';
    actionLabel = '';
    detail = 'Your access request remains active.';
  } else if (presentation === 'added-status-unknown') {
    title = 'NOTIFICATION STATUS UNCONFIRMED';
    message = 'Warpkeep is added, but Farcaster has not reported whether notifications are enabled.';
    actionLabel = '';
    detail = 'Your access request remains active. Check Warpkeep settings in Farcaster.';
  } else if (presentation === 'setup-requested') {
    title = 'NOTIFICATION SETUP REQUESTED';
    message = 'Farcaster is finishing notification setup.';
    actionLabel = '';
    detail = 'Your access request remains active.';
  } else if (presentation === 'failed') {
    title = 'NOTIFICATION SETUP UNAVAILABLE';
    message = 'Farcaster could not complete notification setup.';
    actionLabel = 'TRY AGAIN';
    detail = 'Your access request remains active.';
  }

  return (
    <div
      aria-atomic="true"
      aria-busy={presentation === 'requesting' || undefined}
      className={`farcaster-admission-notification farcaster-admission-notification--${presentation}`}
      data-notification-presentation={presentation}
      ref={statusRef}
      tabIndex={statusIsSettled(presentation) ? -1 : undefined}
    >
      <span aria-hidden="true" className="farcaster-admission-notification__sigil">◇</span>
      <strong>{title}</strong>
      <p>{message}</p>
      {actionLabel ? (
        <button
          className="farcaster-auth-panel__action farcaster-auth-panel__action--secondary farcaster-admission-notification__action"
          data-warpkeep-sfx="none"
          onClick={activate}
          type="button"
        >
          {actionLabel}
        </button>
      ) : null}
      {canDismiss ? (
        <button
          className="farcaster-admission-notification__dismiss"
          data-warpkeep-sfx="none"
          onClick={() => setDismissed(true)}
          type="button"
        >
          NOT NOW
        </button>
      ) : null}
      <small>{detail}</small>
    </div>
  );
}
