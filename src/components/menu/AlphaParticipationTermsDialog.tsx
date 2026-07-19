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
  WARPKEEP_ALPHA_TERMS_URL,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL
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
              The core strategy loop is not implemented yet; this is a persistent visual preview
              of the living world being built.
            </p>
            <p>
              Participation alone will not earn tokens, airdrops, external rewards, or guaranteed
              financial gain. Experimental in-game Marks have no cash value and may change or reset.
            </p>
            <p className="warpkeep-alpha-terms__documents">
              You can review the full{' '}
              <a
                aria-label="Read the Alpha Terms in a new tab"
                href={WARPKEEP_ALPHA_TERMS_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Alpha Terms
              </a>
              {', '}
              <a
                aria-label="Read the Hegemony Social Contract in a new tab"
                href={WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL}
                rel="noopener noreferrer"
                target="_blank"
              >
                Hegemony Social Contract
              </a>
              {', and the '}
              <a
                aria-label="Read the Privacy Notice in a new tab"
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
            <span>I agree to the Alpha Terms and Hegemony Social Contract.</span>
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
