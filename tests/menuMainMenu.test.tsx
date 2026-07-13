import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WarpkeepMainMenu } from '../src/components/menu/WarpkeepMainMenu';
import { menuCommands } from '../src/components/menu/menuCommands';

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

  it('renders the live heading, exact tagline, and four semantic commands in order', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1, name: 'WARPKEEP' })).not.toBeNull();
    expect(screen.getByText('BUILD YOUR LEGACY. DEFEND THE REALM. DEFY THE CORE.')).not.toBeNull();

    const navigation = screen.getByRole('navigation', { name: 'Hegemony main menu' });
    const commandLabels = within(navigation)
      .getAllByRole('button')
      .map((button) => button.textContent);
    expect(commandLabels).toEqual(menuCommands.map((command) => command.label));
    expect(screen.getByRole('button', { name: 'Return to Title' })).not.toBeNull();
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

    const terms = screen.getByRole('dialog', { name: 'ALPHA PARTICIPATION TERMS' });
    const continueButton = within(terms).getByRole('button', {
      name: 'CONTINUE TO SIGN-IN'
    });
    expect((continueButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(terms).getByRole('checkbox', {
      name: 'I understand and agree to these Alpha Terms.'
    }));
    fireEvent.click(continueButton);

    expect(onRequestEnterRealm).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('status')).toBeNull();

    expect(screen.queryByRole('button', { name: 'CONTINUE' })).toBeNull();
  });

  it('shows distinct anchored notices one at a time without stealing focus', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    const exit = screen.getByRole('button', { name: 'EXIT' });

    enterRealm.focus();
    fireEvent.click(enterRealm);
    const firstNotice = screen.getByRole('status', { name: '' });
    expect(firstNotice.textContent).toContain('living frontier');
    expect(document.activeElement).toBe(enterRealm);
    expect(enterRealm.getAttribute('aria-describedby')).toBe('warpkeep-menu-notice-enter-realm');

    fireEvent.click(enterRealm);
    const refreshedNotice = screen.getByRole('status', { name: '' });
    expect(refreshedNotice).not.toBe(firstNotice);
    expect(refreshedNotice.textContent).toContain('living frontier');

    exit.focus();
    fireEvent.click(exit);
    const developmentNotice = screen.getByRole('status');
    expect(developmentNotice.textContent).toContain('Return to Title');
    expect(developmentNotice.textContent).not.toContain('living frontier');
    expect(document.activeElement).toBe(exit);
  });

  it('opens the dramatic credits roll and uses Escape/back to return without leaving the menu notice open', () => {
    const onRequestReturn = vi.fn();
    render(<WarpkeepMainMenu active onRequestReturn={onRequestReturn} />);
    const credits = screen.getByRole('button', { name: 'CREDITS' });

    fireEvent.click(credits);
    expect(screen.getByRole('dialog', { name: 'Warpkeep credits' })).not.toBeNull();
    const menu = document.querySelector('main.warpkeep-menu');
    expect(menu?.getAttribute('aria-hidden')).toBe('true');
    expect(menu?.hasAttribute('inert')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.click(credits);
    fireEvent.click(screen.getByRole('button', { name: /Back to Main Menu/i }));
    expect(screen.queryByRole('dialog', { name: 'Warpkeep credits' })).toBeNull();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
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
    expect(document.activeElement).toBe(commands[3]);
    fireEvent.keyDown(commands[3], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(commands[0]);
    fireEvent.keyDown(commands[0], { key: 'End' });
    expect(document.activeElement).toBe(commands[3]);
    fireEvent.keyDown(commands[3], { key: 'Home' });
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
        graphicsPreference="auto"
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
  });

  it('keeps EXIT as an under-construction action and uses the separate return control', () => {
    const onRequestReturn = vi.fn();
    const closeSpy = vi.spyOn(window, 'close').mockImplementation(() => undefined);
    render(<WarpkeepMainMenu active onRequestReturn={onRequestReturn} />);

    fireEvent.click(screen.getByRole('button', { name: 'EXIT' }));
    expect(document.querySelector('.warpkeep-menu-notice')?.textContent).toContain('Return to Title');
    expect(closeSpy).not.toHaveBeenCalled();
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    expect(onRequestReturn).toHaveBeenCalledTimes(1);
  });

  it('keeps inactive menu controls hidden, inert, and outside the tab order', () => {
    const { container } = render(
      <WarpkeepMainMenu active={false} onRequestReturn={vi.fn()} visible={false} />
    );
    const menu = container.querySelector('main.warpkeep-menu');
    const commands = screen.getAllByRole('button', { hidden: true });

    expect(menu?.getAttribute('aria-hidden')).toBe('true');
    expect(menu?.hasAttribute('inert')).toBe(true);
    commands.forEach((button) => {
      expect((button as HTMLButtonElement).disabled).toBe(true);
      expect(button.getAttribute('tabindex')).toBe('-1');
    });
  });
});
