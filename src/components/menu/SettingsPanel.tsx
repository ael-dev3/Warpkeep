import { useRef } from 'react';

import {
  DEFAULT_GRAPHICS_PREFERENCE,
  GRAPHICS_PREFERENCES,
  type GraphicsPreference,
  type GraphicsQualityTier
} from '../../settings/graphicsPreference';
import { useModalFocusBoundary } from './useModalFocusBoundary';
import './SettingsPanel.css';

const GRAPHICS_COPY: Readonly<Record<GraphicsPreference, Readonly<{
  label: string;
  description: string;
}>>> = {
  auto: {
    label: 'AUTO / RECOMMENDED',
    description: 'Uses measured device headroom; capable desktops get Cinematic while normal phones stay lighter.'
  },
  cinematic: {
    label: 'CINEMATIC',
    description: 'Highest-detail title and Realm presentation for devices with ample graphics headroom.'
  },
  balanced: {
    label: 'BALANCED',
    description: 'Keeps the same world while reducing terrain, model, and drawing-buffer pressure.'
  },
  performance: {
    label: 'PERFORMANCE',
    description: 'The lightest Realm profile for devices that need a more responsive presentation.'
  }
};

export type SettingsPanelProps = Readonly<{
  audioMuted?: boolean;
  closeLabel?: string;
  preference: GraphicsPreference;
  resolvedQuality: GraphicsQualityTier;
  onAudioMutedChange?: (muted: boolean) => void;
  onChange: (preference: GraphicsPreference) => void;
  onClose: () => void;
}>;

export function SettingsPanel({
  audioMuted = false,
  closeLabel = 'BACK TO THE MENU',
  preference,
  resolvedQuality,
  onAudioMutedChange,
  onChange,
  onClose
}: SettingsPanelProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useModalFocusBoundary({
    dialogRef,
    initialFocusRef: headingRef,
    onEscape: onClose
  });

  return (
    <div className="warpkeep-settings" role="presentation">
      <section
        aria-describedby="warpkeep-settings-description"
        aria-labelledby="warpkeep-settings-title"
        aria-modal="true"
        className="warpkeep-settings__panel"
        ref={dialogRef}
        role="dialog"
      >
        <header>
          <p>REALM CONFIGURATION</p>
          <h2 id="warpkeep-settings-title" ref={headingRef} tabIndex={-1}>SETTINGS</h2>
          <p id="warpkeep-settings-description">
            Configure graphics and sound across the title gateway, menu, and Realm. Auto is the safe recommended default; reduced motion remains a system accessibility preference.
          </p>
        </header>

        <fieldset className="warpkeep-settings__choices">
          <legend>GRAPHICS QUALITY</legend>
          {GRAPHICS_PREFERENCES.map((option) => {
            const copy = GRAPHICS_COPY[option];
            return (
              <label
                className="warpkeep-settings__choice"
                data-default={option === DEFAULT_GRAPHICS_PREFERENCE ? 'true' : 'false'}
                data-selected={preference === option ? 'true' : 'false'}
                key={option}
              >
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

        <fieldset className="warpkeep-settings__choices warpkeep-settings__choices--audio">
          <legend>AUDIO</legend>
          <label
            className="warpkeep-settings__choice"
            data-selected={!audioMuted ? 'true' : 'false'}
          >
            <input
              checked={!audioMuted}
              onChange={(event) => onAudioMutedChange?.(!event.currentTarget.checked)}
              role="switch"
              type="checkbox"
            />
            <span>
              <strong>MUSIC &amp; AMBIENCE // {audioMuted ? 'MUTED' : 'ON'}</strong>
              <small>Controls every Warpkeep soundtrack without affecting browser or system audio.</small>
            </span>
          </label>
        </fieldset>

        <p aria-live="polite" className="warpkeep-settings__resolved">
          ACTIVE PROFILE // {resolvedQuality.toUpperCase()}
        </p>

        <div className="warpkeep-settings__actions">
          <button
            disabled={preference === DEFAULT_GRAPHICS_PREFERENCE}
            onClick={() => onChange(DEFAULT_GRAPHICS_PREFERENCE)}
            type="button"
          >
            RESTORE RECOMMENDED DEFAULT
          </button>
          <button onClick={onClose} type="button">{closeLabel}</button>
        </div>
      </section>
    </div>
  );
}
