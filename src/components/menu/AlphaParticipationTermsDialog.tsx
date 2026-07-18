import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent
} from 'react';

import {
  WARPKEEP_ALPHA_PRIVACY_URL,
  WARPKEEP_ALPHA_TERMS_URL
} from '../../legal/publicDocuments';
import { useModalFocusBoundary } from './useModalFocusBoundary';
import './AlphaParticipationTermsDialog.css';

export type AlphaParticipationTermsDialogProps = Readonly<{
  continueLabel?: AlphaParticipationTermsContinueLabel;
  onCancel: () => void;
  onContinue: () => void;
}>;

export type AlphaParticipationTermsContinueLabel =
  | 'CONTINUE TO SIGN-IN'
  | 'CONTINUE TO ACCESS CHECK'
  | 'CONTINUE TO REALM';

export function AlphaParticipationTermsDialog({
  continueLabel = 'CONTINUE TO SIGN-IN',
  onCancel,
  onContinue
}: AlphaParticipationTermsDialogProps) {
  const idPrefix = `warpkeep-alpha-terms-${useId().replace(/:/g, '')}`;
  const titleId = `${idPrefix}-title`;
  const descriptionId = `${idPrefix}-description`;
  const checkboxId = `${idPrefix}-acceptance`;
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const terminalActionRef = useRef(false);
  const [accepted, setAccepted] = useState(false);
  const [continuing, setContinuing] = useState(false);

  const requestCancel = useCallback(() => {
    if (terminalActionRef.current) return;
    terminalActionRef.current = true;
    onCancel();
  }, [onCancel]);

  const requestContinue = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!accepted || terminalActionRef.current) return;

    terminalActionRef.current = true;
    setContinuing(true);
    onContinue();
  }, [accepted, onContinue]);

  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: requestCancel
  });

  useEffect(() => {
    const clearAcceptance = () => {
      if (checkboxRef.current) checkboxRef.current.checked = false;
      setAccepted(false);
      setContinuing(false);
    };
    const handlePageHide = () => {
      clearAcceptance();
      requestCancel();
    };
    const handlePageShow = (event: PageTransitionEvent) => {
      if (!event.persisted) return;
      terminalActionRef.current = false;
      clearAcceptance();
    };

    window.addEventListener('pagehide', handlePageHide, true);
    window.addEventListener('pageshow', handlePageShow, true);
    return () => {
      window.removeEventListener('pagehide', handlePageHide, true);
      window.removeEventListener('pageshow', handlePageShow, true);
    };
  }, [requestCancel]);

  return (
    <div className="warpkeep-alpha-terms" role="presentation">
      <section
        aria-describedby={descriptionId}
        aria-labelledby={titleId}
        aria-modal="true"
        className="warpkeep-alpha-terms__panel"
        ref={dialogRef}
        role="dialog"
      >
        <button
          aria-label="Close Alpha Participation Terms"
          className="warpkeep-alpha-terms__close"
          onClick={requestCancel}
          type="button"
        >
          <span aria-hidden="true">&times;</span>
        </button>

        <header className="warpkeep-alpha-terms__header">
          <p className="warpkeep-alpha-terms__eyebrow">BEFORE YOU ENTER THE REALM</p>
          <h2 id={titleId} ref={headingRef} tabIndex={-1}>
            ALPHA PARTICIPATION TERMS
          </h2>
        </header>

        <form className="warpkeep-alpha-terms__form" onSubmit={requestContinue}>
          <div className="warpkeep-alpha-terms__copy" id={descriptionId}>
            <p>
              Warpkeep Alpha is experimental and currently developed by one person. Features,
              rules, availability, and progress may change or be reset at any time.
            </p>
            <p>
              Warpkeep&apos;s intended core strategy loop is not yet implemented; this Alpha is an
              early visual and persistent-world foundation for the living world actively being
              built. Warpkeep&apos;s code is open source, and contributions and feedback are welcome.
              Community ideas may help shape the Realm or find expression in the world.
            </p>
            <p>
              Participation alone will not earn tokens, airdrops, external rewards, or guaranteed
              financial gain. Experimental in-game Marks have no cash value and may change or reset.
            </p>
            <p className="warpkeep-alpha-terms__documents">
              Review the{' '}
              <a
                href={WARPKEEP_ALPHA_TERMS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                full Alpha Terms
              </a>
              {' '}and{' '}
              <a
                href={WARPKEEP_ALPHA_PRIVACY_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Privacy Notice
              </a>
              {' '}before continuing.
            </p>
            <p className="warpkeep-alpha-terms__warning">
              There is no promise of a future reward, payment, or profit.
            </p>
          </div>

          <label className="warpkeep-alpha-terms__acceptance" htmlFor={checkboxId}>
            <input
              checked={accepted}
              id={checkboxId}
              onChange={(event) => setAccepted(event.currentTarget.checked)}
              ref={checkboxRef}
              type="checkbox"
            />
            <span>I understand and agree to these Alpha Terms.</span>
          </label>

          <div className="warpkeep-alpha-terms__actions">
            <button
              className="warpkeep-alpha-terms__action warpkeep-alpha-terms__action--secondary"
              onClick={requestCancel}
              type="button"
            >
              CANCEL
            </button>
            <button
              aria-busy={continuing || undefined}
              className="warpkeep-alpha-terms__action warpkeep-alpha-terms__action--primary"
              disabled={!accepted || continuing}
              type="submit"
            >
              {continueLabel}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
