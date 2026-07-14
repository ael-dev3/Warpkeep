import { useEffect, useId, useRef, useState } from 'react';

import { useModalFocusBoundary } from './useModalFocusBoundary';
import './CreditsRoll.css';

export const CREDITS_ROLES = [
  { role: 'IDEAS MAN', name: 'AEL' },
  { role: 'CREATIVE DIRECTOR', name: 'CLAWBERTO' },
  { role: 'GAME DESIGN', name: 'CLAWBERTO' },
  { role: 'WORLD-BUILDING & LORE', name: 'CLAWBERTO' },
  { role: 'NARRATIVE DESIGN', name: 'CLAWBERTO' },
  { role: 'SYSTEMS DESIGN', name: 'CLAWBERTO' },
  { role: 'LEVEL / REALM DESIGN', name: 'CLAWBERTO' },
  { role: 'GAMEPLAY ENGINEERING', name: 'CLAWBERTO' },
  { role: 'UI / UX', name: 'CLAWBERTO' },
  { role: '3D / RENDERING / VFX', name: 'CLAWBERTO' },
  { role: 'AUDIO DIRECTION', name: 'CLAWBERTO' },
  { role: 'ANIMATION & MOTION', name: 'CLAWBERTO' },
  { role: 'ACCESSIBILITY', name: 'CLAWBERTO' },
  { role: 'SPACETIMEDB / BACKEND', name: 'CLAWBERTO' },
  { role: 'QA & BUG EXORCISM', name: 'CLAWBERTO' },
  { role: 'BUILD & RELEASE ENGINEERING', name: 'CLAWBERTO' },
  { role: 'PROJECT MANAGEMENT', name: 'CLAWBERTO' },
  { role: 'MORAL SUPPORT', name: 'CLAWBERTO' }
] as const;

export type CreditsRollProps = {
  onClose: () => void;
};

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function CreditsRoll({ onClose }: CreditsRollProps) {
  const idPrefix = `warpkeep-credits-${useId().replace(/:/g, '')}`;
  const viewportId = `${idPrefix}-viewport`;
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [rollPaused, setRollPaused] = useState(false);
  const manualReading = reducedMotion || rollPaused;

  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: closeButtonRef,
    onEscape: onClose
  });

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;

    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event: MediaQueryListEvent) => {
      setReducedMotion(event.matches);
    };
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', handleChange);
      return () => query.removeEventListener('change', handleChange);
    }

    query.addListener(handleChange);
    return () => query.removeListener(handleChange);
  }, []);

  return (
    <section
      aria-describedby="warpkeep-credits-description"
      aria-label="Warpkeep credits"
      aria-modal="true"
      className="warpkeep-credits"
      data-presentation={manualReading ? 'reading' : 'rolling'}
      ref={dialogRef}
      role="dialog"
    >
      <div aria-hidden="true" className="warpkeep-credits__stars" />
      <div aria-hidden="true" className="warpkeep-credits__vignette" />
      <button
        className="warpkeep-credits__close"
        onClick={onClose}
        ref={closeButtonRef}
        type="button"
      >
        BACK TO MAIN MENU
      </button>
      <button
        aria-controls={viewportId}
        aria-label={manualReading
          ? reducedMotion
            ? 'Credits are manually scrollable because reduced motion is enabled'
            : 'Resume the automatic credits roll'
          : 'Pause the credits roll and switch to a manually scrollable view'}
        aria-pressed={manualReading}
        className="warpkeep-credits__reading-toggle"
        disabled={reducedMotion}
        onClick={() => setRollPaused((current) => !current)}
        type="button"
      >
        {reducedMotion ? 'SCROLL TO READ' : manualReading ? 'RESUME ROLL' : 'PAUSE / READ'}
      </button>

      <div
        aria-label={manualReading ? 'Scrollable credits transcript' : undefined}
        className="warpkeep-credits__viewport"
        id={viewportId}
        role={manualReading ? 'region' : undefined}
        tabIndex={manualReading ? 0 : -1}
      >
        <div className="warpkeep-credits__track">
          <div className="warpkeep-credits__roll">
          <p className="warpkeep-credits__kicker">THE CREDITS OF THE AGE</p>
          <h2 className="warpkeep-credits__title">WARPKEEP</h2>
          <p className="warpkeep-credits__description" id="warpkeep-credits-description">
            ONE HUMAN. ONE ROBOT. AN UNREASONABLE NUMBER OF ROLES.
          </p>
          <div aria-hidden="true" className="warpkeep-credits__rule" />

          <dl className="warpkeep-credits__list">
            {CREDITS_ROLES.map(({ role, name }) => (
              <div className="warpkeep-credits__credit" key={role}>
                <dt>{role}</dt>
                <dd>{name}</dd>
              </div>
            ))}
          </dl>

          <div aria-hidden="true" className="warpkeep-credits__rule" />
          <p className="warpkeep-credits__finale">THE KEEP STANDS.<br />THE CORE WAITS.</p>
          <p className="warpkeep-credits__attribution">
            Stone title assembly by Clawberto, licensed under{' '}
            <a
              href="https://creativecommons.org/licenses/by/4.0/"
              rel="noreferrer"
              tabIndex={manualReading ? 0 : -1}
              target="_blank"
            >
              CC BY 4.0
            </a>.{' '}
            <a
              href="https://github.com/ael-dev3/Warpkeep-Assets/releases/tag/title-stone-letters-2026-07-12"
              rel="noreferrer"
              tabIndex={manualReading ? 0 : -1}
              target="_blank"
            >
              View archive
            </a>.
          </p>
          <p className="warpkeep-credits__tiny">NO CASTLES WERE HARMED IN THE MAKING OF THIS MENU.</p>
          </div>
        </div>
      </div>
    </section>
  );
}
