import { StrictMode, type ReactElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  render as testingLibraryRender,
  screen
} from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WarpkeepExperience } from '../src/components/WarpkeepExperience';
import { FarcasterAuthProvider } from '../src/farcaster/FarcasterAuthProvider';

const mediaPaused = new WeakMap<HTMLMediaElement, boolean>();

function render(ui: ReactElement) {
  return testingLibraryRender(
    <FarcasterAuthProvider>
      {ui}
    </FarcasterAuthProvider>
  );
}

function rectangle(left: number, top: number, width: number, height: number): DOMRect {
  return {
    x: left,
    y: top,
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    toJSON: () => ({})
  } as DOMRect;
}

function installBrowserStubs(reducedMotion = false) {
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
    matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  })));
  vi.stubGlobal('ResizeObserver', class ResizeObserver {
    observe() {}
    disconnect() {}
    unobserve() {}
  });
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement
  ) {
    if (this.classList.contains('warpkeep-title-screen')) {
      return rectangle(0, 0, 1280, 720);
    }
    if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
      return rectangle(600, 190, 152, 56);
    }
    if (this.classList.contains('warpkeep-menu-command')) {
      return rectangle(900, 320, 280, 54);
    }
    if (this.classList.contains('warpkeep-menu-notice')) {
      return rectangle(0, 0, 360, 92);
    }
    return rectangle(0, 0, 0, 0);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    return mediaPaused.get(this) ?? true;
  });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    mediaPaused.set(this, false);
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (
    this: HTMLMediaElement
  ) {
    mediaPaused.set(this, true);
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
}

async function settleInitialTitle() {
  await act(async () => {
    vi.advanceTimersByTime(1);
  });
  return screen.getByRole('button', { name: 'Enter Warpkeep' });
}

beforeEach(() => {
  vi.useFakeTimers();
  window.history.replaceState({}, '', '/');
  installBrowserStubs();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('WarpkeepExperience', () => {
  it('enters the menu exactly once, replaces the old notice, and unmounts the title renderer', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    expect(screen.queryByText(/gateway is still under development/i)).toBeNull();

    fireEvent.click(gateway, { detail: 1 });
    fireEvent.click(gateway, { detail: 1 });
    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(experience.getAttribute('data-transition-sequence')).toBe('1');
    expect(container.querySelectorAll('.warp-transition-overlay')).toHaveLength(1);

    await act(async () => {
      vi.advanceTimersByTime(2_250);
    });
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
    expect(screen.getByRole('heading', { level: 1, name: 'WARPKEEP' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();
    expect(container.querySelectorAll('audio[data-audio-role]')).toHaveLength(3);
  });

  it('shows the entry hint five seconds after title readiness and dismisses it permanently', async () => {
    render(<WarpkeepExperience />);
    await settleInitialTitle();

    act(() => vi.advanceTimersByTime(4_998));
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(2));
    expect(screen.getByRole('status').textContent).toContain('Enter the gateway');

    fireEvent.pointerDown(document.body, { pointerType: 'mouse' });
    expect(screen.queryByRole('status')).toBeNull();
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('uses touch-specific hint copy on coarse-pointer devices', async () => {
    vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
      matches: query.includes('(pointer: coarse)'),
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn()
    }));
    render(<WarpkeepExperience />);
    await settleInitialTitle();
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.getByRole('status').textContent).toBe('Tap the galactic core to enter.');
  });

  it('supports global Enter and Space while rejecting repeats, modifiers, and overlaps', async () => {
    const { container } = render(<WarpkeepExperience />);
    await settleInitialTitle();
    const experience = container.querySelector('.warpkeep-experience')!;

    fireEvent.keyDown(document.body, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(document.body, { key: 'Enter', repeat: true });
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'Enter' });
    input.remove();
    expect(experience.getAttribute('data-phase')).toBe('title');

    const spaceEvent = new KeyboardEvent('keydown', {
      key: ' ',
      bubbles: true,
      cancelable: true
    });
    act(() => {
      document.body.dispatchEvent(spaceEvent);
      fireEvent.keyDown(document.body, { key: 'Enter' });
    });
    expect(spaceEvent.defaultPrevented).toBe(true);
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');
    expect(experience.getAttribute('data-transition-sequence')).toBe('1');
  });

  it('returns through Escape, restores the gateway focus, and keeps notices ahead of return', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    await act(async () => vi.advanceTimersByTime(2_250));

    const credits = screen.getByRole('button', { name: 'CREDITS' });
    fireEvent.click(credits);
    expect(container.querySelector('.warpkeep-menu-notice')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.querySelector('.warpkeep-menu-notice')).toBeNull();
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');

    fireEvent.keyDown(document, { key: 'Escape' });
    await act(async () => vi.advanceTimersByTime(2_250));
    const restoredGateway = screen.getByRole('button', { name: 'Enter Warpkeep' });
    act(() => vi.advanceTimersByTime(20));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('title');
    expect(document.activeElement).toBe(restoredGateway);
    expect(window.location.hash).toBe('');
  });

  it('loads #menu directly without mounting WebGL and can return without a reload', async () => {
    window.history.replaceState({}, '', '/#menu');
    const { container } = render(<WarpkeepExperience />);
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase')).toBe('menu');
    expect(screen.queryByRole('button', { name: 'Enter Warpkeep' })).toBeNull();
    expect(screen.getByRole('button', { name: 'ENTER REALM' })).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(screen.getByRole('button', { name: 'Enter Warpkeep' })).not.toBeNull();
    expect(window.location.hash).toBe('');
  });

  it('reprojects the reverse veil from the readied title after a viewport change', async () => {
    window.history.replaceState({}, '', '/#menu');
    vi.mocked(HTMLElement.prototype.getBoundingClientRect).mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.classList.contains('warpkeep-title-screen')) {
        return rectangle(0, 0, 390, 844);
      }
      if (this.classList.contains('warpkeep-fallback-galaxy-core')) {
        return rectangle(150, 275, 90, 40);
      }
      if (this.classList.contains('warpkeep-menu-command')) {
        return rectangle(40, 420, 310, 44);
      }
      if (this.classList.contains('warpkeep-menu-notice')) {
        return rectangle(0, 0, 340, 92);
      }
      return rectangle(0, 0, 0, 0);
    });
    render(<WarpkeepExperience />);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(1));

    const overlay = screen.getByTestId('warp-transition-overlay');
    expect(overlay.style.getPropertyValue('--warp-origin-x')).toBe('195px');
    expect(overlay.style.getPropertyValue('--warp-origin-y')).toBe('295px');
  });

  it('honors the latest hash when history changes during an in-flight entry transition', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;
    expect(experience.getAttribute('data-phase')).toBe('transitioning-to-menu');

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
      window.history.replaceState({}, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(3_300));
    expect(experience.getAttribute('data-phase')).toBe('title');
    expect(window.location.hash).toBe('');
  });

  it('serializes Back during entry without exposing an interactive wrong-hash menu', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-return-preparing')).toBe('true');
    const menuCommand = screen.queryByRole('button', { name: 'ENTER REALM', hidden: true });
    expect(menuCommand ? (menuCommand as HTMLButtonElement).disabled : true).toBe(true);

    await act(async () => vi.advanceTimersByTime(901));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-phase')).toBe('title');
    expect(window.location.hash).toBe('');
  });

  it('cancels a prepared return when Forward restores the menu hash', async () => {
    const { container } = render(<WarpkeepExperience />);
    const gateway = await settleInitialTitle();
    fireEvent.click(gateway);
    const experience = container.querySelector('.warpkeep-experience')!;

    act(() => {
      window.history.replaceState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(experience.getAttribute('data-return-preparing')).toBe('true');

    act(() => {
      window.history.replaceState({ warpkeepMenu: true }, '', '/#menu');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(experience.getAttribute('data-return-preparing')).toBe('false');
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect((screen.getByRole('button', { name: 'ENTER REALM' }) as HTMLButtonElement).disabled)
      .toBe(false);

    await act(async () => vi.advanceTimersByTime(3_500));
    expect(experience.getAttribute('data-phase')).toBe('menu');
    expect(window.location.hash).toBe('#menu');
  });

  it('keeps one experience and cleans its shortcuts through a StrictMode lifecycle', async () => {
    window.history.replaceState({}, '', '/#menu');
    const { container, unmount } = render(
      <StrictMode>
        <WarpkeepExperience />
      </StrictMode>
    );

    expect(container.querySelectorAll('.warpkeep-experience')).toHaveLength(1);
    expect(container.querySelectorAll('audio[data-audio-role]')).toHaveLength(3);
    expect(container.querySelectorAll('video.warpkeep-menu-background')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Return to Title' }));
    await act(async () => vi.advanceTimersByTime(2_250));
    expect(container.querySelector('.warpkeep-experience')?.getAttribute('data-phase'))
      .toBe('title');
    expect(screen.getByRole('button', { name: 'Enter Warpkeep' })).not.toBeNull();

    unmount();
    fireEvent.keyDown(document.body, { key: 'Enter' });
    expect(container.querySelector('.warpkeep-experience')).toBeNull();
  });
});
