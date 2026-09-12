import { useLayoutEffect, useRef } from 'react';
import './PtrSessionContinuation.css';

export function PtrSessionRenewalPanel({ failed, onRetry, onReturn }: Readonly<{
  failed: boolean;
  onRetry: () => void;
  onReturn: () => void;
}>) {
  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => { heading.current?.focus({ preventScroll: true }); }, [failed]);
  return <section className="ptr-session-renewal" aria-label="PTR session connection" data-state={failed ? 'failed' : 'connecting'}>
    <div className="ptr-session-renewal__card">
      <p className="ptr-session-renewal__eyebrow">Verdant Citadel</p>
      <h1 ref={heading} tabIndex={-1}>{failed ? 'Connection interrupted' : 'Returning to your keep'}</h1>
      <p role="status">{failed ? 'Could not restore your PTR session.' : 'Restoring your PTR session…'}</p>
      <p className="ptr-session-renewal__detail">{failed
        ? 'Your keep could not be refreshed. Try connecting again or return to the menu.'
        : 'Connecting to the latest state of your keep.'}</p>
      <div className="ptr-session-renewal__actions">
        {failed && <button type="button" className="ptr-session-renewal__retry" onClick={onRetry}>Retry connection</button>}
        <button type="button" onClick={onReturn}>Return to Menu</button>
      </div>
    </div>
  </section>;
}

/** Presentation only; the caller decides when a fresh read permits this notice. */
export function PtrSessionRenewalNotice({ onDismiss }: Readonly<{ onDismiss: () => void }>) {
  return <section className="ptr-session-notice" aria-label="Session renewal">
    <p role="status">Your session was renewed. Review the latest keep state before retrying an interrupted action.</p>
    <button type="button" onClick={onDismiss}>Dismiss session notice</button>
  </section>;
}
