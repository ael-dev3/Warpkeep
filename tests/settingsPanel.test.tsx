import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SettingsPanel } from '../src/components/menu/SettingsPanel';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderSettings(preference: 'auto' | 'cinematic' | 'balanced' | 'performance' = 'balanced') {
  const onChange = vi.fn();
  const onClose = vi.fn();
  render(
    <SettingsPanel
      onChange={onChange}
      onClose={onClose}
      preference={preference}
      resolvedQuality="balanced"
    />
  );
  return { onChange, onClose };
}

describe('SettingsPanel', () => {
  it('focuses its heading and contains forward and reverse Tab navigation', () => {
    renderSettings();

    const heading = screen.getByRole('heading', { level: 2, name: 'SETTINGS' });
    const selectedPreference = screen.getByDisplayValue('balanced');
    const back = screen.getByRole('button', { name: 'BACK TO COMMANDS' });

    expect(document.activeElement).toBe(heading);

    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(selectedPreference);

    selectedPreference.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(back);

    back.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(selectedPreference);
  });

  it('dismisses through Escape without changing the graphics preference', () => {
    const { onChange, onClose } = renderSettings('auto');

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onChange).not.toHaveBeenCalled();
  });
});
