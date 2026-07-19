import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AlphaParticipationTermsDialog } from '../src/components/menu/AlphaParticipationTermsDialog';
import {
  WARPKEEP_ALPHA_PRIVACY_URL,
  WARPKEEP_ALPHA_TERMS_URL,
  WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL,
} from '../src/legal/publicDocuments';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderDialog(overrides?: Partial<{
  continueLabel: 'CONTINUE TO SIGN-IN' | 'CONTINUE TO ACCESS CHECK' | 'CONTINUE TO REALM';
  onCancel: () => void;
  onContinue: () => void;
}>) {
  const onCancel = overrides?.onCancel ?? vi.fn();
  const onContinue = overrides?.onContinue ?? vi.fn();
  const result = render(
    <AlphaParticipationTermsDialog
      continueLabel={overrides?.continueLabel}
      onCancel={onCancel}
      onContinue={onContinue}
    />
  );

  return { ...result, onCancel, onContinue };
}

describe('AlphaParticipationTermsDialog', () => {
  it('presents the exact short terms as a labelled modal and focuses its heading', () => {
    renderDialog();

    const dialog = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
    expect(screen.getByText(
      /core strategy loop is not implemented yet/i
    )).not.toBeNull();
    expect(screen.getByText(
      'Participation alone will not earn tokens, airdrops, external rewards, or guaranteed financial gain. Experimental in-game Marks have no cash value and may change or reset.'
    )).not.toBeNull();
    expect(screen.getByText(
      'There is no promise of a future reward, payment, or profit.'
    )).not.toBeNull();

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'ALPHA PARTICIPATION TERMS'
    });
    expect(document.activeElement).toBe(heading);
  });

  it('keeps Continue genuinely disabled until the player checks the explicit agreement', () => {
    renderDialog();

    const acceptance = screen.getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }) as HTMLInputElement;
    const continueButton = screen.getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement;

    expect(acceptance.checked).toBe(false);
    expect(continueButton.disabled).toBe(true);

    fireEvent.click(acceptance);
    expect(acceptance.checked).toBe(true);
    expect(continueButton.disabled).toBe(false);

    fireEvent.click(acceptance);
    expect(acceptance.checked).toBe(false);
    expect(continueButton.disabled).toBe(true);
  });

  it.each([
    'CONTINUE TO ACCESS CHECK',
    'CONTINUE TO REALM'
  ] as const)('describes the exact gated next step as %s', (continueLabel) => {
    renderDialog({ continueLabel });

    const continueButton = screen.getByRole('button', {
      name: continueLabel
    }) as HTMLButtonElement;
    expect(continueButton.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(continueButton.disabled).toBe(false);
  });

  it('offers the ordered Terms, Social Contract, and Privacy documents before consent', () => {
    const { onCancel, onContinue } = renderDialog();

    const termsLink = screen.getByRole('link', {
      name: 'Read the Alpha Terms in a new tab',
    });
    const socialContractLink = screen.getByRole('link', {
      name: 'Read the Hegemony Social Contract in a new tab',
    });
    const privacyLink = screen.getByRole('link', {
      name: 'Read the Privacy Notice in a new tab',
    });
    expect(termsLink.getAttribute('href')).toBe(WARPKEEP_ALPHA_TERMS_URL);
    expect(socialContractLink.getAttribute('href')).toBe(WARPKEEP_HEGEMONY_SOCIAL_CONTRACT_URL);
    expect(privacyLink.getAttribute('href')).toBe(WARPKEEP_ALPHA_PRIVACY_URL);
    expect(screen.getAllByRole('link').map(link => link.textContent?.trim())).toEqual([
      'Alpha Terms',
      'Hegemony Social Contract',
      'Privacy Notice',
    ]);

    for (const link of [termsLink, socialContractLink, privacyLink]) {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')?.split(/\s+/)).toEqual(
        expect.arrayContaining(['noopener', 'noreferrer'])
      );
    }

    const acceptance = screen.getByRole('checkbox') as HTMLInputElement;
    expect(acceptance.checked).toBe(false);
    expect((screen.getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();

    // Reading either public document must not become an implicit acceptance.
    termsLink.addEventListener('click', event => event.preventDefault(), { once: true });
    socialContractLink.addEventListener('click', event => event.preventDefault(), { once: true });
    privacyLink.addEventListener('click', event => event.preventDefault(), { once: true });
    fireEvent.click(termsLink);
    fireEvent.click(socialContractLink);
    fireEvent.click(privacyLink);
    expect(acceptance.checked).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it('allows exactly one continuation even when the form is activated twice', () => {
    const { container, onContinue } = renderDialog();
    fireEvent.click(screen.getByRole('checkbox'));

    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(onContinue).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('supports Cancel, the close control, and Escape without duplicate cancellation', () => {
    const cancelled = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'CANCEL' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha Participation Terms' }));
    expect(cancelled.onCancel).toHaveBeenCalledTimes(1);
    cancelled.unmount();

    const closed = renderDialog();
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha Participation Terms' }));
    expect(closed.onCancel).toHaveBeenCalledTimes(1);
    closed.unmount();

    const escaped = renderDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(escaped.onCancel).toHaveBeenCalledTimes(1);
  });

  it('traps forward and reverse keyboard focus within the modal', () => {
    renderDialog();

    const heading = screen.getByRole('heading', {
      level: 2,
      name: 'ALPHA PARTICIPATION TERMS'
    });
    const closeButton = screen.getByRole('button', {
      name: 'Close Alpha Participation Terms'
    });
    const cancelButton = screen.getByRole('button', { name: 'CANCEL' });

    expect(document.activeElement).toBe(heading);
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);

    heading.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    cancelButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);

    closeButton.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(cancelButton);

    fireEvent.click(screen.getByRole('checkbox'));
    const continueButton = screen.getByRole('button', { name: 'CONTINUE TO SIGN-IN' });
    continueButton.focus();
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(closeButton);
  });

  it('stores acceptance only in component memory and resets it for a fresh mount', () => {
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    const first = renderDialog();

    fireEvent.click(screen.getByRole('checkbox'));
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    first.unmount();

    renderDialog();
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    }) as HTMLButtonElement).disabled).toBe(true);
    expect(storageWrite).not.toHaveBeenCalled();
  });

  it('clears checked acceptance synchronously when the document enters pagehide', () => {
    const { onCancel } = renderDialog();
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent(window, new Event('pagehide'));

    expect(checkbox.checked).toBe(false);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the checked-in mobile, safe-area, touch-target, scroll, and reduced-motion contract', () => {
    const css = readFileSync(
      'src/components/menu/AlphaParticipationTermsDialog.css',
      'utf8'
    );

    expect(css).toContain('min-height: 100svh');
    expect(css).toContain('env(safe-area-inset-top)');
    expect(css).toContain('max-height: calc(100svh - 2rem)');
    expect(css).toContain('overflow-y: auto');
    expect(css).toContain('min-height: 44px');
    expect(css).toContain('@media (max-width: 520px)');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('animation: none');
  });
});
