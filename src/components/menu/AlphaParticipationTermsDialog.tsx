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
import './AlphaParticipationTermsDialog.css';

export type AlphaParticipationTermsDialogProps = Readonly<{
  onCancel: () => void;
  onContinue: () => void;
}>;

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => (
      !element.hidden
      && element.getAttribute('aria-hidden') !== 'true'
      && element.getAttribute('tabindex') !== '-1'
    ));
}

export function AlphaParticipationTermsDialog({
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

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

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

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopImmediatePropagation();
        requestCancel();
        return;
      }

      if (event.key !== 'Tab') return;

      const focusableElements = getFocusableElements(dialog);
      if (focusableElements.length === 0) {
        event.preventDefault();
        headingRef.current?.focus({ preventScroll: true });
        return;
      }

      const first = focusableElements[0];
      const last = focusableElements[focusableElements.length - 1];
      const activeElement = document.activeElement;

      // The heading receives initial programmatic focus but deliberately is
      // not part of the normal tab order. Treat any such focus target like an
      // external target so reverse-Tab cannot escape to the inert page behind
      // the modal before the player reaches a real control.
      if (
        !dialog.contains(activeElement)
        || !focusableElements.includes(activeElement as HTMLElement)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus({ preventScroll: true });
      } else if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
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
              Participation will not earn or entitle you to rewards, tokens, points, airdrops,
              or guaranteed financial gain.
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
            <p className="warpkeep-alpha-terms__warning">There is no promise of future rewards.</p>
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
              CONTINUE TO SIGN-IN
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
