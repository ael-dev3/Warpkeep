import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepMainMenu } from '../src/components/menu/WarpkeepMainMenu';
import { menuCommands } from '../src/components/menu/menuCommands';
import { WARPKEEP_FARCASTER_CHANNEL_URL } from '../src/farcaster/farcasterProjectLinks';

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

function getPatchNotesTrigger(options: { hidden?: boolean } = {}) {
  return screen.getByRole('button', {
    ...options,
    name: 'Open patch notes for Warpkeep ALPHA 0.4.0'
  });
}

describe('WarpkeepMainMenu', () => {
  beforeEach(() => {
    installMotionPreference();
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => undefined);
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('opens on the Verdant Citadel heading and three semantic commands', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'WARPKEEP' })).not.toBeNull();
    expect(screen.getByText('THE VERDANT CITADEL')).not.toBeNull();
    expect(screen.getByText('A PLACE TO BUILD. A REASON TO RETURN.')).not.toBeNull();

    const navigation = screen.getByRole('navigation', { name: 'Hegemony main menu' });
    const commandLabels = within(navigation)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(commandLabels).toEqual(menuCommands.map((command) => command.label));
    expect(within(navigation).queryByRole('button', { name: 'PATCH NOTES' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Return to Title' })).toBeNull();
  });

  it('exposes the Farcaster community destination without a repository link', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);

    const community = screen.getByRole('region', { name: 'COMMUNITY' });
    const farcasterLink = within(community).getByRole('link', {
      name: 'Open Warpkeep Farcaster channel (opens in a new tab)'
    });

    expect(within(community).queryByRole('link', { name: /GitHub/i })).toBeNull();
    expect(farcasterLink.getAttribute('href')).toBe(WARPKEEP_FARCASTER_CHANNEL_URL);
    expect(farcasterLink.getAttribute('target')).toBe('_blank');
    expect(farcasterLink.getAttribute('rel')?.split(/\s+/)).toEqual(
      expect.arrayContaining(['noopener', 'noreferrer'])
    );
    expect(farcasterLink.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(farcasterLink.getAttribute('tabindex')).toBe('0');
  });

  it('routes ENTER REALM to its live callback only after Terms acceptance', () => {
    const onRequestEnterRealm = vi.fn();
    render(
      <WarpkeepMainMenu
        active
        onRequestEnterRealm={onRequestEnterRealm}
        onRequestReturn={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'ENTER REALM' }));
    expect(onRequestEnterRealm).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'ENTER SELECTED REALM' }));

    const terms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    const continueButton = within(terms).getByRole('button', {
      name: 'CONTINUE TO REALM'
    });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(terms).getByRole('checkbox', {
      name: 'I agree to the Alpha Terms and Hegemony Social Contract.'
    }));
    fireEvent.click(continueButton);

    expect(onRequestEnterRealm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();

    expect(screen.queryByRole('button', { name: 'CONTINUE' })).toBeNull();
  });

  it('refreshes anchored notices and lets patch notes replace them without stealing focus', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });

    enterRealm.focus();
    fireEvent.click(enterRealm);
    const enterSelected = screen.getByRole('button', { name: 'ENTER SELECTED REALM' });
    fireEvent.click(enterSelected);
    const firstNotice = screen.getByRole('status', { name: '' });
    expect(firstNotice.textContent).toContain('living frontier');
    expect(document.activeElement).toBe(screen.getByRole('heading', {
      name: 'CHOOSE YOUR REALM'
    }));
    expect(enterSelected.getAttribute('aria-describedby')).toBeNull();

    fireEvent.click(enterSelected);
    const refreshedNotice = screen.getByRole('status', { name: '' });
    expect(refreshedNotice).not.toBe(firstNotice);
    expect(refreshedNotice.textContent).toContain('living frontier');

    fireEvent.click(screen.getByRole('button', { name: 'BACK' }));

    const restoredPatchNotes = getPatchNotesTrigger();
    act(() => restoredPatchNotes.focus());
    expect(screen.getByRole('status').textContent).toContain('living frontier');
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();

    fireEvent.click(restoredPatchNotes, { detail: 0 });
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();
    expect(document.activeElement).toBe(restoredPatchNotes);
  });

  it('opens credits and uses Escape/back to return to the opening menu', () => {
    const onRequestReturn = vi.fn();
    render(<WarpkeepMainMenu active onRequestReturn={onRequestReturn} />);
    const credits = screen.getByRole('button', { name: 'CREDITS' });

    credits.focus();
    fireEvent.click(credits);
    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    const menu = document.querySelector('main.warpkeep-menu');
    expect(menu?.getAttribute('aria-hidden')).toBe('true');
    expect(menu?.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();
    expect(document.activeElement).toBe(credits);
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.click(credits);
    fireEvent.click(screen.getByRole('button', { name: /Back to Main Menu/i }));
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();
    expect(document.activeElement).toBe(credits);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('supports wrapping arrows and Home/End while leaving Tab to the browser', () => {
    render(
      <WarpkeepMainMenu
        active
        inputModality="keyboard"
        onRequestReturn={vi.fn()}
      />
    );
    const commands = menuCommands.map((command) => screen.getByRole('button', { name: command.label }));

    expect(document.activeElement).toBe(commands[0]);
    fireEvent.keyDown(commands[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(commands[2]);
    fireEvent.keyDown(commands[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(commands[0]);
    fireEvent.keyDown(commands[0], { key: 'End' });
    expect(document.activeElement).toBe(commands[2]);
    fireEvent.keyDown(commands[2], { key: 'Home' });
    expect(document.activeElement).toBe(commands[0]);

    const tabEvent = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    commands[0].dispatchEvent(tabEvent);
    expect(tabEvent.defaultPrevented).toBe(false);
  });

  it('does not force command focus for pointer or touch entry', () => {
    const { rerender } = render(
      <WarpkeepMainMenu active inputModality="touch" onRequestReturn={vi.fn()} />
    );
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'ENTER REALM' })
    );

    rerender(
      <WarpkeepMainMenu active inputModality="pointer" onRequestReturn={vi.fn()} />
    );
    expect(document.activeElement).not.toBe(
      screen.getByRole('button', { name: 'ENTER REALM' })
    );
  });

  it('opens functional graphics settings and restores focus after Escape', () => {
    const onGraphicsPreferenceChange = vi.fn();
    render(
      <WarpkeepMainMenu
        active
        graphicsPreference="cinematic"
        onGraphicsPreferenceChange={onGraphicsPreferenceChange}
        onRequestReturn={vi.fn()}
        resolvedGraphicsQuality="cinematic"
      />
    );
    const settings = screen.getByRole('button', { name: 'SETTINGS' });
    settings.focus();
    fireEvent.click(settings);
    expect(screen.getByRole('dialog', { name: 'SETTINGS' })).not.toBeNull();
    fireEvent.click(screen.getByDisplayValue('balanced'));
    expect(onGraphicsPreferenceChange).toHaveBeenCalledWith('balanced');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'SETTINGS' })).toBeNull();
    expect(document.activeElement).toBe(settings);

    fireEvent.click(settings);
    fireEvent.click(screen.getByRole('button', { name: 'BACK TO THE MENU' }));
    expect(screen.queryByRole('dialog', { name: 'SETTINGS' })).toBeNull();
    expect(document.activeElement).toBe(settings);
  });

  it('reveals current patch notes in-site and lets Escape dismiss them before leaving the menu', () => {
    const onRequestReturn = vi.fn();
    render(<WarpkeepMainMenu active onRequestReturn={onRequestReturn} />);
    const patchNotes = getPatchNotesTrigger();

    expect(patchNotes.getAttribute('aria-expanded')).toBe('false');
    expect(patchNotes.getAttribute('aria-controls')).toBe('warpkeep-latest-patch-notes');
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();

    act(() => patchNotes.focus());
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();

    fireEvent.click(patchNotes, { detail: 0 });
    const notes = screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' });
    expect(patchNotes.getAttribute('aria-expanded')).toBe('true');
    expect(notes.textContent).toContain('LATEST PATCH · ALPHA 0.4.0');
    expect(notes.textContent).toContain('Genesis 001');
    expect(notes.textContent).toContain('Genesis 002');
    expect(notes.textContent).toContain('PTR');
    expect(notes.getAttribute('tabindex')).toBe('0');
    expect(within(notes).queryByRole('link')).toBeNull();
    act(() => notes.focus());
    expect(document.activeElement).toBe(notes);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();
    expect(document.activeElement).toBe(patchNotes);
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).not.toHaveBeenCalled();
    expect(screen.getByRole('navigation', { name: 'Hegemony main menu' })).not.toBeNull();
  });

  it('previews patch notes on fine-pointer hover and pins or dismisses them on touch', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const patchNotes = getPatchNotesTrigger();

    fireEvent.pointerEnter(patchNotes, { pointerType: 'mouse' });
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();

    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();

    fireEvent.pointerDown(patchNotes, { pointerType: 'touch' });
    patchNotes.focus();
    fireEvent.click(patchNotes);
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();

    fireEvent.pointerDown(patchNotes, { pointerType: 'touch' });
    fireEvent.click(patchNotes);
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();
  });

  it('keeps hover notes reachable across the anchor gap and toggles by activation', () => {
    vi.useFakeTimers();
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const patchNotes = getPatchNotesTrigger();

    fireEvent.pointerEnter(patchNotes, { pointerType: 'mouse' });
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();
    fireEvent.pointerLeave(patchNotes, { pointerType: 'mouse' });

    act(() => vi.advanceTimersByTime(250));
    const panel = screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' });
    fireEvent.pointerEnter(panel, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(200));
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();

    fireEvent.click(patchNotes);
    fireEvent.pointerLeave(patchNotes, { pointerType: 'mouse' });
    act(() => vi.advanceTimersByTime(500));
    expect(screen.getByRole('region', { name: 'THE SECOND GENESIS WAITS' })).not.toBeNull();
    fireEvent.click(patchNotes);
    expect(screen.queryByRole('region', { name: 'THE SECOND GENESIS WAITS' })).toBeNull();
  });

  it('keeps inactive menu controls hidden, inert, and outside the tab order', () => {
    const { container } = render(
      <WarpkeepMainMenu active={false} onRequestReturn={vi.fn()} visible={false} />
    );
    const menu = container.querySelector('main.warpkeep-menu');
    const commands = screen.getAllByRole('button', { hidden: true });
    const farcasterLink = screen.getByRole('link', {
      hidden: true,
      name: 'Open Warpkeep Farcaster channel (opens in a new tab)'
    });
    const patchNotes = getPatchNotesTrigger({ hidden: true });

    expect(menu?.getAttribute('aria-hidden')).toBe('true');
    expect(menu?.hasAttribute('inert')).toBe(true);
    commands.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute('tabindex')).toBe('-1');
    });
    expect(farcasterLink.getAttribute('tabindex')).toBe('-1');
    expect((patchNotes as HTMLButtonElement).disabled).toBe(true);
    expect(patchNotes.getAttribute('tabindex')).toBe('-1');
  });
});
