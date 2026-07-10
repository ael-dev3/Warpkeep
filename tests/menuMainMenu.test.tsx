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

  it('renders the live heading, exact tagline, and five semantic commands in order', () => {
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

  it('shows distinct anchored notices one at a time without stealing focus', () => {
    render(<WarpkeepMainMenu active onRequestReturn={vi.fn()} />);
    const enterRealm = screen.getByRole('button', { name: 'ENTER REALM' });
    const settings = screen.getByRole('button', { name: 'SETTINGS' });

    enterRealm.focus();
    fireEvent.click(enterRealm);
    expect(screen.getByRole('status', { name: '' }).textContent).toContain('Hegemony campaign');
    expect(document.activeElement).toBe(enterRealm);
    expect(enterRealm.getAttribute('aria-describedby')).toBe('warpkeep-menu-notice-enter-realm');

    settings.focus();
    fireEvent.click(settings);
    const notices = screen.getAllByRole('status');
    const developmentNotice = notices.find((notice) => notice.classList.contains('warpkeep-menu-notice'));
    expect(developmentNotice?.textContent).toContain('war council');
    expect(developmentNotice?.textContent).not.toContain('Hegemony campaign');
    expect(document.activeElement).toBe(settings);
  });

  it('dismisses a notice before returning on Escape, and dismisses on outside pointer input', () => {
    const onRequestReturn = vi.fn();
    render(<WarpkeepMainMenu active onRequestReturn={onRequestReturn} />);
    const credits = screen.getByRole('button', { name: 'CREDITS' });

    fireEvent.click(credits);
    expect(document.querySelector('.warpkeep-menu-notice')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.warpkeep-menu-notice')).toBeNull();
    expect(onRequestReturn).not.toHaveBeenCalled();

    fireEvent.click(credits);
    fireEvent.pointerDown(document.body);
    expect(document.querySelector('.warpkeep-menu-notice')).toBeNull();

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
    expect(document.activeElement).toBe(commands[4]);
    fireEvent.keyDown(commands[4], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(commands[0]);
    fireEvent.keyDown(commands[0], { key: 'End' });
    expect(document.activeElement).toBe(commands[4]);
    fireEvent.keyDown(commands[4], { key: 'Home' });
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
