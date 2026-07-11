import { useEffect, useRef } from 'react';

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

export function CreditsRoll({ onClose }: CreditsRollProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section
      aria-describedby="warpkeep-credits-description"
      aria-label="Warpkeep credits"
      aria-modal="true"
      className="warpkeep-credits"
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

      <div className="warpkeep-credits__viewport">
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
          <p className="warpkeep-credits__tiny">NO CASTLES WERE HARMED IN THE MAKING OF THIS MENU.</p>
        </div>
      </div>
    </section>
  );
}
