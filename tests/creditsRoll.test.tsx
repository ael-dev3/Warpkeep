import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreditsRoll, CREDITS_ROLES } from '../src/components/menu/CreditsRoll';

function installMotionPreference(matches = false) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches,
    media: '(prefers-reduced-motion: reduce)',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));
}

describe('CreditsRoll', () => {
  beforeEach(() => installMotionPreference());

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens with the human idea and gives Clawberto the remaining gamedev roles', () => {
    expect(CREDITS_ROLES[0]).toEqual({ role: 'IDEAS MAN', name: 'AEL' });
    expect(CREDITS_ROLES.slice(1).length).toBeGreaterThan(1);
    expect(CREDITS_ROLES.slice(1).every((credit) => credit.name === 'CLAWBERTO')).toBe(true);
  });

  it('renders every credit and closes through its accessible control', () => {
    const onClose = vi.fn();
    render(<CreditsRoll onClose={onClose} />);

    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    expect(document.querySelector('.warpkeep-credits__viewport > .warpkeep-credits__track > .warpkeep-credits__roll')).not.toBeNull();
    const licenseLink = screen.getByRole('link', { name: 'CC BY 4.0' });
    expect(licenseLink.getAttribute('href'))
      .toBe('https://creativecommons.org/licenses/by/4.0/');
    expect(licenseLink.getAttribute('tabindex')).toBe('-1');
    CREDITS_ROLES.forEach(({ role, name }) => {
      expect(screen.getByText(role)).not.toBeNull();
      expect(screen.getAllByText(name).length).toBeGreaterThan(0);
    });

    fireEvent.click(screen.getByRole('button', { name: /Back to Main Menu/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('contains focus and keeps moving attribution links out of the tab order until paused', () => {
    const onClose = vi.fn();
    render(<CreditsRoll onClose={onClose} />);

    const dialog = screen.getByRole('dialog', { name: 'Warpkeep credits' });
    const close = screen.getByRole('button', { name: /Back to Main Menu/i });
    const pause = screen.getByRole('button', {
      name: 'Pause the credits roll and switch to a manually scrollable view'
    });
    const license = screen.getByRole('link', { name: 'CC BY 4.0' });
    const archive = screen.getByRole('link', { name: 'View archive' });

    expect(document.activeElement).toBe(close);
    expect(dialog.getAttribute('data-presentation')).toBe('rolling');
    expect(license.getAttribute('tabindex')).toBe('-1');
    expect(archive.getAttribute('tabindex')).toBe('-1');

    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(pause);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);

    fireEvent.click(pause);
    expect(dialog.getAttribute('data-presentation')).toBe('reading');
    expect(license.getAttribute('tabindex')).toBe('0');
    expect(archive.getAttribute('tabindex')).toBe('0');
    const transcript = screen.getByRole('region', {
      name: 'Scrollable credits transcript'
    });
    expect(transcript.getAttribute('tabindex')).toBe('0');
    transcript.focus();
    expect(document.activeElement).toBe(transcript);
    expect(fireEvent.keyDown(transcript, { key: 'PageDown' })).toBe(true);

    archive.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(close);
    close.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(archive);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('starts in the manually scrollable presentation for reduced motion', () => {
    installMotionPreference(true);
    render(<CreditsRoll onClose={vi.fn()} />);

    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })
      .getAttribute('data-presentation')).toBe('reading');
    expect(screen.getByRole('region', { name: 'Scrollable credits transcript' })
      .getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('link', { name: 'CC BY 4.0' }).getAttribute('tabindex')).toBe('0');
  });
});
