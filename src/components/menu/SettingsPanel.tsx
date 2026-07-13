import { useEffect, useRef } from 'react';

import {
  GRAPHICS_PREFERENCES,
  type GraphicsPreference,
  type GraphicsQualityTier
} from '../../settings/graphicsPreference';
import './SettingsPanel.css';

const GRAPHICS_COPY: Readonly<Record<GraphicsPreference, Readonly<{
  label: string;
  description: string;
}>>> = {
  auto: {
    label: 'AUTO / RECOMMENDED',
    description: 'Chooses a high-quality profile for this screen and keeps normal phones balanced.'
  },
  cinematic: {
    label: 'CINEMATIC',
    description: 'Maximum title detail, richer realm lighting, denser terrain, and dynamic shadows.'
  },
  balanced: {
    label: 'BALANCED',
    description: 'Premium silhouettes and materials with bounded mobile drawing-buffer cost.'
  },
  performance: {
    label: 'PERFORMANCE',
    description: 'Reduced detail, effects, and pixel density for genuinely constrained hardware.'
  }
};

export type SettingsPanelProps = Readonly<{
  preference: GraphicsPreference;
  resolvedQuality: GraphicsQualityTier;
  onChange: (preference: GraphicsPreference) => void;
  onClose: () => void;
}>;

export function SettingsPanel({
  preference,
  resolvedQuality,
  onChange,
  onClose
}: SettingsPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="warpkeep-settings" role="presentation">
      <section
        aria-describedby="warpkeep-settings-description"
        aria-labelledby="warpkeep-settings-title"
        aria-modal="true"
        className="warpkeep-settings__panel"
        role="dialog"
      >
        <header>
          <p>REALM CONFIGURATION</p>
          <h2 id="warpkeep-settings-title" ref={headingRef} tabIndex={-1}>SETTINGS</h2>
          <p id="warpkeep-settings-description">
            Graphics quality applies to the title gateway and the living realm. Reduced motion remains a system accessibility preference.
          </p>
        </header>

        <fieldset className="warpkeep-settings__choices">
          <legend>GRAPHICS QUALITY</legend>
          {GRAPHICS_PREFERENCES.map((option) => {
            const copy = GRAPHICS_COPY[option];
            return (
              <label className="warpkeep-settings__choice" data-selected={preference === option ? 'true' : 'false'} key={option}>
                <input
                  checked={preference === option}
                  name="warpkeep-graphics-quality"
                  onChange={() => onChange(option)}
                  type="radio"
                  value={option}
                />
                <span>
                  <strong>{copy.label}</strong>
                  <small>{copy.description}</small>
                </span>
              </label>
            );
          })}
        </fieldset>

        <p aria-live="polite" className="warpkeep-settings__resolved">
          ACTIVE PROFILE // {resolvedQuality.toUpperCase()}
        </p>

        <div className="warpkeep-settings__actions">
          <button disabled={preference === 'auto'} onClick={() => onChange('auto')} type="button">
            RESET TO AUTO
          </button>
          <button onClick={onClose} type="button">BACK TO COMMANDS</button>
        </div>
      </section>
    </div>
  );
}
